/**
 * GET e PUT /api/super-admin/base-de-conhecimento/observacoes?tenant=<uuid> — lê e grava as OBSERVAÇÕES que o
 * arquivo do orçamento imprime no bloco "OBSERVAÇÕES" (dono do produto, 16/11/2026).
 *
 * O GET devolve `{ observacoes, campos }` — o texto livre e as VARIÁVEIS (prazos, validade, exclusões, parcelas do
 * pagamento), ou null. O PUT grava o que vier: `observacoes` pela `superadmin_gravar_observacoes_do_orcamento` e
 * `campos` pela `superadmin_gravar_campos_das_observacoes` — cada uma valida, grava e loga na sua transação.
 *   corpo: { observacoes?: "…" | null, campos?: { prazos: […], validadeDias: 7, … } | null }
 *
 * AS VARIÁVEIS são o que o dono do produto pediu em 16/11/2026, com o orçamento 1154 como referência: o bloco é
 * MONTADO delas, não digitado. Os reais das parcelas não são gravados — saem do total do orçamento.
 *
 * O bloco já existia no PDF e saía SEMPRE VAZIO, porque não havia de onde ler o texto (medido em 16/11/2026: nenhuma
 * coluna do banco o guardava). `null` limpa, e o bloco volta a sair vazio.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDasObservacoes } from '@/lib/atendimentos-ia/base-de-conhecimento'
import { lerCamposDasObservacoes } from '@/lib/atendimentos-ia/campos-das-observacoes'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

/** Chama a função e devolve a MENSAGEM dela quando recusa; nulo quando gravou. */
async function chamarAFuncao(nome: string, args: Record<string, unknown>): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as funções são posteriores a `database.types.ts`
    const { error } = await (supabaseAdmin as any).rpc(nome, args)
    return error ? (error.message ?? `${nome}: erro`) : null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT' && req.method !== 'GET') return metodoNaoPermitido(res, ['GET', 'PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        if (req.method === 'GET') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a coluna é posterior a `database.types.ts`
            const db = () => supabaseAdmin as any
            const s = await db().from('tenant_settings').select('orcamento_observacoes, orcamento_observacoes_campos').eq('tenant_id', tenantId).maybeSingle()
            if (s.error) throw new Error(`tenant_settings: ${s.error.message}`)
            const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
            return res.status(200).json({ observacoes: texto(s.data?.orcamento_observacoes), campos: s.data?.orcamento_observacoes_campos ?? null })
        }

        const body = (req.body ?? {}) as Record<string, unknown>
        // AS VARIÁVEIS, quando vierem: validadas campo a campo antes de qualquer gravação
        if ('campos' in body) {
            const lidos = body.campos === null ? { campos: null, erros: [] } : lerCamposDasObservacoes(body.campos)
            if (lidos.erros.length > 0) return recusaNomeada(res, lidos.erros)
            // só os campos: o texto livre não veio, e não se apaga o que não foi dito
            if (!('observacoes' in body)) {
                return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_campos_das_observacoes', {
                    p_tenant: tenantId, p_por: caller.user_id, p_campos: lidos.campos,
                })
            }
            const texto = lerCorpoDasObservacoes(body)
            if (texto.erros.length > 0) return recusaNomeada(res, texto.erros)
            // os dois: as VARIÁVEIS primeiro (é delas que o bloco é montado), o texto depois
            const r = await chamarAFuncao('superadmin_gravar_campos_das_observacoes', { p_tenant: tenantId, p_por: caller.user_id, p_campos: lidos.campos })
            if (r) return recusaNomeada(res, [{ campo: 'campos', mensagem: r }])
            return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_observacoes_do_orcamento', {
                p_tenant: tenantId, p_por: caller.user_id, p_texto: texto.observacoes,
            })
        }

        const corpo = lerCorpoDasObservacoes(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)

        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_observacoes_do_orcamento', {
            p_tenant: tenantId, p_por: caller.user_id, p_texto: corpo.observacoes,
        })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
