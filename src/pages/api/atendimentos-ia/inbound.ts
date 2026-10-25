/**
 * POST /api/atendimentos-ia/inbound?c=<whatsapp_conexao.webhook_segredo>
 *
 * A ENTRADA do Atendimentos I.A.: o WUZAPI entrega aqui as mensagens que chegam ao número do
 * orçamentista. Servidor para servidor — sem usuário logado, com service_role. Remetente autorizado
 * é SEMPRE respondido: a rota entrega a mensagem à conversa (`conduzirMensagem`, em
 * `src/lib/atendimentos-ia/conversa-da-ia.ts`), que acha o levantamento pelo nome, valida, grava e
 * responde no WhatsApp. Nunca em 'ignorada-*' ou 'tentativa-*'. O 200 ao WUZAPI sai MESMO SE a LLM
 * ou o envio falharem: um erro da LLM não pode virar reenvio em laço.
 *
 * ══ O PORTÃO, nesta ordem, sem exceção ══
 *   a) `c` da URL → `whatsapp_conexao` por `webhook_segredo`. Fora do formato da coluna
 *      (hexadecimal minúsculo, 32 a 64 — o CHECK dela), 404 ANTES de consultar o banco. Não achou,
 *      ou o canal não é ORCAMENTISTA: 404, e nada é gravado. DAÍ sai o tenant — o tenant NUNCA
 *      vem do corpo;
 *   b) `orcamentista_config` do tenant com `ativo = true`, senão 404. É ESTE o interruptor;
 *      `whatsapp_conexao.ativo` NÃO é conferido — ele é o retrato da última checagem feita pela
 *      tela, não um interruptor do admin;
 *   c) o telefone do remetente (`telefoneDoRemetente`, do `Info.SenderAlt`) na lista ATIVA de
 *      `orcamentista_remetente_autorizado` do tenant. Fora da lista: uma linha em
 *      `orcamentista_tentativa_desconhecida` — SEM o texto, a tabela não tem coluna para ele, e com
 *      o `Info.ID` — e 200 sem responder nada. O reenvio do mesmo `Info.ID` bate na UNIQUE parcial
 *      `orcamentista_tentativa_desconhecida_unica` e vira 200: um 500 ali faria o WUZAPI reenviar
 *      sem parar.
 *
 * ══ POR QUE O c NÃO É O wuzapi_token ══
 * O `wuzapi_token` é a CREDENCIAL do WUZAPI — vai no header `token:`. Numa URL ele cai no log de
 * acesso do WUZAPI e da Vercel, e quem o ler passa a poder enviar mensagens como a empresa e
 * reapontar o webhook dela. O `webhook_segredo` só abre esta rota.
 * Antes do (c), 200 sem gravar nada: mensagem nossa (`IsFromMe`), de grupo (`IsGroup`), sem texto,
 * ou sem telefone legível.
 *
 * ══ O TELEFONE: A COMPARAÇÃO É PELA FORMA NORMALIZADA, DOS DOIS LADOS ══
 * O webhook entrega o celular COM o DDI e SEM o nono dígito (`555199114290`, medido em 22/10/2026);
 * o cadastro pode estar com ou sem DDI, com ou sem o nono. Os dois lados passam por
 * `telefoneNormalizado` (`src/lib/atendimentos-ia/telefone-normalizado.ts`), a MESMA forma que a
 * tela usa. Isso não cabe num `.eq()` do PostgREST: a rota lê os autorizados ATIVOS do tenant e
 * compara em memória. Número que a normalização não lê (estrangeiro, formato estranho) não é
 * comparado — vira tentativa. DUAS linhas ativas na mesma forma: NÃO se escolhe uma — é recusa, e
 * o log registra a ambiguidade (sem o telefone). A tentativa guarda o número como ele CHEGOU, e é
 * esse número que a conversa recebe — é para ele que a resposta volta.
 *
 * ══ AUTORIZADO: NADA É GRAVADO AQUI (decisão 4 do dono do produto, 25/10/2026) ══
 * A rota não grava o texto, nem cria conversa: nenhuma linha nova em `orcamentista_conversa` ou
 * `orcamentista_mensagem` — o estado mora no levantamento, e a identidade é o remetente. O que já
 * existe nessas tabelas fica como está. A consequência, conhecida e aceita: sem a linha da mensagem,
 * o reenvio do WUZAPI (o mesmo `Info.ID`) não é mais reconhecido, e é conduzido de novo.
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
import { telefoneNormalizado } from '@/lib/atendimentos-ia/telefone-normalizado'
import { conduzirMensagem } from '@/lib/atendimentos-ia/conversa-da-ia'

/** A conversa chama a LLM e o WUZAPI dentro da requisição: o limite é declarado, não herdado. */
export const config = { maxDuration: 60 }

export const PREFIXO_DO_LOG_DE_ENTRADA = '[INBOUND]'
/** O formato de `whatsapp_conexao.webhook_segredo` — o mesmo do CHECK da coluna. */
const FORMATO_DO_SEGREDO = /^[0-9a-f]{32,64}$/
const CANAL_DO_ORCAMENTISTA = 'ORCAMENTISTA'
const VIOLACAO_DE_UNICIDADE = '23505'

type Rastro = { chaves: string; canal: string; conexao: boolean; autorizado: boolean | null; ambiguidade: number; id: string; desfecho: string }

function anotar(r: Rastro) {
    const autorizado = r.autorizado === null ? '-' : r.autorizado ? 'sim' : 'nao'
    // a ambiguidade sai como CONTAGEM — nunca o telefone
    const ambiguidade = r.ambiguidade > 0 ? ` ambiguidade=${r.ambiguidade}` : ''
    console.error(`${PREFIXO_DO_LOG_DE_ENTRADA} chaves=${r.chaves} canal=${r.canal} conexao=${r.conexao ? 'sim' : 'nao'} autorizado=${autorizado}${ambiguidade} id=${r.id} desfecho=${r.desfecho}`)
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
    const rastro: Rastro = { chaves: Object.keys(corpo).sort().join(',') || '-', canal: '-', conexao: false, autorizado: null, ambiguidade: 0, id: idSeguro(info.ID), desfecho: '' }
    const fim = (status: number, desfecho: string) => {
        rastro.desfecho = desfecho
        anotar(rastro)
        return res.status(status).end()
    }

    try {
        // (a) a conexão, pelo segredo do webhook na URL — e o tenant, só daqui. O formato é
        // conferido ANTES do banco: o que não pode existir na coluna não vira consulta.
        const c = req.query.c
        if (typeof c !== 'string' || c === '') return fim(404, 'sem-c')
        if (!FORMATO_DO_SEGREDO.test(c)) return fim(404, 'c-fora-do-formato')
        const { data: conexao, error: erroConexao } = await supabaseAdmin
            .from('whatsapp_conexao').select('tenant_id, canal, wuzapi_token').eq('webhook_segredo', c).maybeSingle()
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

        const mensagemId = typeof info.ID === 'string' && info.ID !== '' ? info.ID : null

        // (c) o remetente na lista ATIVA do tenant — pela forma NORMALIZADA, dos dois lados, em memória
        const forma = telefoneNormalizado(telefone)
        let remetenteId: string | null = null
        if (forma !== null) {
            const { data: ativos, error: erroAutorizado } = await supabaseAdmin
                .from('orcamentista_remetente_autorizado').select('id, telefone')
                .eq('tenant_id', tenantId).eq('ativo', true)
            if (erroAutorizado) throw new Error(`orcamentista_remetente_autorizado: ${erroAutorizado.message}`)
            const casam = ((ativos ?? []) as Array<{ id: string; telefone: string }>).filter((a) => telefoneNormalizado(a.telefone) === forma)
            // Duas linhas ativas na mesma forma: recusar é melhor que acertar no chute.
            if (casam.length === 1) remetenteId = casam[0].id
            else if (casam.length > 1) rastro.ambiguidade = casam.length
        }
        rastro.autorizado = remetenteId !== null
        if (remetenteId === null) {
            const { error } = await supabaseAdmin.from('orcamentista_tentativa_desconhecida')
                .insert({ tenant_id: tenantId, telefone, wuzapi_mensagem_id: mensagemId })
            // o reenvio do WUZAPI bate na UNIQUE parcial — a tentativa já está gravada
            if (error && error.code === VIOLACAO_DE_UNICIDADE) return fim(200, 'tentativa-repetida')
            if (error) throw new Error(`orcamentista_tentativa_desconhecida: ${error.message}`)
            return fim(200, rastro.ambiguidade > 0 ? 'tentativa-por-ambiguidade' : 'tentativa-desconhecida')
        }

        // A CONVERSA. Ela nunca lança: o 200 sai de qualquer jeito. O token da conexão é o do envio;
        // não vai para log nenhum.
        await conduzirMensagem({ tenantId, remetenteId, telefone, texto, wuzapiToken: (conexao as { wuzapi_token: string }).wuzapi_token })
        return fim(200, 'conduzida')
    } catch (e) {
        // Sem o token nem o texto: as mensagens acima só levam o nome da tabela e o erro do banco.
        console.error(`${PREFIXO_DO_LOG_DE_ENTRADA} erro: ${e instanceof Error ? e.message : 'erro desconhecido'}`)
        return fim(500, 'erro')
    }
}
