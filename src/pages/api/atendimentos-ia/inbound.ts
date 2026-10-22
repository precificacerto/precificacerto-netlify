/**
 * POST /api/atendimentos-ia/inbound?c=<whatsapp_conexao.wuzapi_token>
 *
 * A ENTRADA do Atendimentos I.A.: o WUZAPI entrega aqui as mensagens que chegam ao número do
 * orçamentista. Servidor para servidor — sem usuário logado, com service_role. Nesta versão a rota
 * só GRAVA a mensagem: não chama LLM nenhuma e não responde nada ao WhatsApp.
 *
 * ══ O PORTÃO, nesta ordem, sem exceção ══
 *   a) `c` da URL → `whatsapp_conexao` por `wuzapi_token`. Não achou, ou o canal não é
 *      ORCAMENTISTA: 404, e nada é gravado. DAÍ sai o tenant — o tenant NUNCA vem do corpo;
 *   b) `orcamentista_config` do tenant com `ativo = true`, senão 404;
 *   c) o telefone do remetente (`telefoneDoRemetente`, do `Info.SenderAlt`) na lista ATIVA de
 *      `orcamentista_remetente_autorizado` do tenant. Fora da lista: uma linha em
 *      `orcamentista_tentativa_desconhecida` — SEM o texto, a tabela não tem coluna para ele — e 200
 *      sem responder nada.
 * Antes do (c), 200 sem gravar nada: mensagem nossa (`IsFromMe`), de grupo (`IsGroup`), sem texto,
 * ou sem telefone legível.
 *
 * ══ O TELEFONE TEM DUAS FORMAS ══
 * O webhook entrega o número COM o DDI (`5551999887766`); a lista grava SEM ele (`51999887766`,
 * ver `telefoneDoAutorizado`). A busca na lista usa a forma GRAVADA; a conversa e a tentativa
 * guardam o número como ele CHEGOU — é para ele que uma resposta voltaria.
 *
 * ══ AUTORIZADO ══
 * Reusa a conversa mais recente do (tenant, remetente), ou cria uma. A mensagem entra com
 * `direcao = 'entrada'`, o texto e o `Info.ID`. IDEMPOTENTE: o mesmo `Info.ID` no mesmo tenant não
 * vira segunda linha — o WUZAPI reenvia o que não recebe 200. A UNIQUE parcial
 * `orcamentista_mensagem_entrada_unica` fecha a corrida entre dois reenvios simultâneos.
 *
 * ══ O LOG ══
 * Uma linha `[INBOUND]` por chamada, em `console.error` (o log da Vercel deste projeto só exibe
 * stderr), com as chaves de topo do corpo, o canal, se achou a conexão, se o remetente é
 * autorizado, e o `Info.ID`. NUNCA o token da conexão, o texto ou o telefone.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-inbound.test.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { telefoneDoRemetente, textoDaMensagem } from '@/lib/atendimentos-ia/payload-wuzapi'
import { telefoneDoAutorizado } from '@/utils/atendimentos-ia-telefone-do-autorizado'

export const PREFIXO_DO_LOG_DE_ENTRADA = '[INBOUND]'
const CANAL_DO_ORCAMENTISTA = 'ORCAMENTISTA'
const VIOLACAO_DE_UNICIDADE = '23505'

type Rastro = { chaves: string; canal: string; conexao: boolean; autorizado: boolean | null; id: string; desfecho: string }

function anotar(r: Rastro) {
    const autorizado = r.autorizado === null ? '-' : r.autorizado ? 'sim' : 'nao'
    console.error(`${PREFIXO_DO_LOG_DE_ENTRADA} chaves=${r.chaves} canal=${r.canal} conexao=${r.conexao ? 'sim' : 'nao'} autorizado=${autorizado} id=${r.id} desfecho=${r.desfecho}`)
}

/** O corpo como objeto — o parser do Next entrega JSON já lido; texto cru é lido aqui. */
function corpoDe(req: NextApiRequest): Record<string, unknown> {
    const b: unknown = req.body
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>
    if (typeof b === 'string') {
        try {
            const j: unknown = JSON.parse(b)
            if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>
        } catch { /* corpo que não é JSON: segue vazio */ }
    }
    return {}
}

const idSeguro = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : '-')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const corpo = corpoDe(req)
    const event = (corpo.event && typeof corpo.event === 'object' ? corpo.event : {}) as Record<string, unknown>
    const info = (event.Info && typeof event.Info === 'object' ? event.Info : {}) as Record<string, unknown>
    const rastro: Rastro = { chaves: Object.keys(corpo).sort().join(',') || '-', canal: '-', conexao: false, autorizado: null, id: idSeguro(info.ID), desfecho: '' }
    const fim = (status: number, desfecho: string) => {
        rastro.desfecho = desfecho
        anotar(rastro)
        return res.status(status).end()
    }

    try {
        // (a) a conexão, pelo token da URL — e o tenant, só daqui
        const c = req.query.c
        if (typeof c !== 'string' || c === '') return fim(404, 'sem-c')
        const { data: conexao, error: erroConexao } = await supabaseAdmin
            .from('whatsapp_conexao').select('tenant_id, canal').eq('wuzapi_token', c).maybeSingle()
        if (erroConexao) throw new Error(`whatsapp_conexao: ${erroConexao.message}`)
        if (!conexao) return fim(404, 'conexao-nao-achada')
        rastro.conexao = true
        rastro.canal = String((conexao as { canal: unknown }).canal)
        if ((conexao as { canal: unknown }).canal !== CANAL_DO_ORCAMENTISTA) return fim(404, 'canal-errado')
        const tenantId = (conexao as { tenant_id: string }).tenant_id

        // (b) o orçamentista ligado para o tenant
        const { data: config, error: erroConfig } = await supabaseAdmin
            .from('orcamentista_config').select('ativo').eq('tenant_id', tenantId).maybeSingle()
        if (erroConfig) throw new Error(`orcamentista_config: ${erroConfig.message}`)
        if ((config as { ativo?: unknown } | null)?.ativo !== true) return fim(404, 'orcamentista-desligado')

        // o que se ignora, sem gravar
        if (info.IsFromMe === true) return fim(200, 'ignorada-propria')
        if (info.IsGroup === true) return fim(200, 'ignorada-grupo')
        const texto = textoDaMensagem(event)
        if (texto === null) return fim(200, 'ignorada-sem-texto')
        const telefone = telefoneDoRemetente(info)
        if (telefone === null) return fim(200, 'ignorada-sem-telefone')

        // (c) o remetente na lista ATIVA do tenant — pela forma gravada (sem o DDI)
        const forma = telefoneDoAutorizado(telefone)
        let remetenteId: string | null = null
        if (forma.ok) {
            const { data: autorizado, error: erroAutorizado } = await supabaseAdmin
                .from('orcamentista_remetente_autorizado').select('id')
                .eq('tenant_id', tenantId).eq('telefone', (forma as { telefone: string }).telefone).eq('ativo', true)
                .maybeSingle()
            if (erroAutorizado) throw new Error(`orcamentista_remetente_autorizado: ${erroAutorizado.message}`)
            remetenteId = (autorizado as { id: string } | null)?.id ?? null
        }
        rastro.autorizado = remetenteId !== null
        if (remetenteId === null) {
            const { error } = await supabaseAdmin.from('orcamentista_tentativa_desconhecida').insert({ tenant_id: tenantId, telefone })
            if (error) throw new Error(`orcamentista_tentativa_desconhecida: ${error.message}`)
            return fim(200, 'tentativa-desconhecida')
        }

        // idempotência: o mesmo Info.ID já gravado neste tenant
        const mensagemId = typeof info.ID === 'string' && info.ID !== '' ? info.ID : null
        if (mensagemId !== null) {
            const { data: repetida, error: erroRepetida } = await supabaseAdmin
                .from('orcamentista_mensagem').select('id')
                .eq('tenant_id', tenantId).eq('direcao', 'entrada').eq('wuzapi_mensagem_id', mensagemId)
                .maybeSingle()
            if (erroRepetida) throw new Error(`orcamentista_mensagem: ${erroRepetida.message}`)
            if (repetida) return fim(200, 'repetida')
        }

        // a conversa mais recente do remetente, ou uma nova
        const { data: existente, error: erroConversa } = await supabaseAdmin
            .from('orcamentista_conversa').select('id')
            .eq('tenant_id', tenantId).eq('remetente_id', remetenteId)
            .order('criado_em', { ascending: false }).limit(1).maybeSingle()
        if (erroConversa) throw new Error(`orcamentista_conversa: ${erroConversa.message}`)
        let conversaId = (existente as { id: string } | null)?.id ?? null
        if (conversaId === null) {
            const { data: nova, error } = await supabaseAdmin
                .from('orcamentista_conversa').insert({ tenant_id: tenantId, remetente_id: remetenteId, telefone })
                .select('id').single()
            if (error || !nova) throw new Error(`orcamentista_conversa: ${error?.message ?? 'sem linha'}`)
            conversaId = (nova as { id: string }).id
        }

        const { error: erroMensagem } = await supabaseAdmin.from('orcamentista_mensagem').insert({
            tenant_id: tenantId, conversa_id: conversaId, direcao: 'entrada', texto, wuzapi_mensagem_id: mensagemId,
        })
        // dois reenvios ao mesmo tempo: o segundo bate na UNIQUE parcial — já está gravada
        if (erroMensagem && erroMensagem.code === VIOLACAO_DE_UNICIDADE) return fim(200, 'repetida-na-corrida')
        if (erroMensagem) throw new Error(`orcamentista_mensagem: ${erroMensagem.message}`)
        return fim(200, 'gravada')
    } catch (e) {
        // Sem o token nem o texto: as mensagens acima só levam o nome da tabela e o erro do banco.
        console.error(`${PREFIXO_DO_LOG_DE_ENTRADA} erro: ${e instanceof Error ? e.message : 'erro desconhecido'}`)
        return fim(500, 'erro')
    }
}
