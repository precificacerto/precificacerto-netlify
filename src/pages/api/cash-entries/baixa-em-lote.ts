/**
 * POST /api/cash-entries/baixa-em-lote — a baixa de até 50 parcelas, TUDO OU NADA.
 *
 * Chama `dar_baixa_em_lote` (…000003). O mesmo molde de `/api/cash-entries/baixa`: permissão
 * de `cash_flow.can_edit` antes de tudo, `p_usuario_id` e `p_tenant_id` da SESSÃO, a data do
 * SERVIDOR. Esta rota também não tem UPDATE em `cash_entries` — há portão afirmando.
 *
 * `p_formas` É MONTADO AQUI, nunca recebido: `formasDoLote` devolve SEMPRE um elemento por id —
 * a forma repetida, ou `NULL` em cada posição ("manter a combinada"). O corpo não tem como
 * mandar uma lista de formas de outro tamanho, e o `PC015` da função fica como a segunda trava.
 *
 * Vazio, repetida e acima de 50 são REGRA, e a regra é da função (PC012, PC013, PC014): a rota
 * confere só o FORMATO de cada id.
 *
 * QUANDO UMA PARCELA TRAVA O LOTE, a função a nomeia em `DETAIL` (o id). A rota devolve esse id
 * em `parcela_id` só se ele for um uuid — o `details` é texto do banco, e o que não tem a forma
 * esperada não é repassado.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { exigirPermissaoDeEdicao } from '@/lib/permissao-do-modulo'
import { hojeNoFusoDoNegocio } from '@/utils/dia-de-hoje'
import {
    DESTINO_DESCONHECIDO,
    DESTINO_DO_CODIGO,
    DESTINO_SEM_PERMISSAO,
    destinoDoErro,
    formasDoLote,
    lerCorpoDoLote,
    type Destino,
    type ResultadoDoLote,
} from '@/utils/baixa-pela-rota'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function recusar(res: NextApiResponse, d: Destino, extra: { codigo?: string; parcela_id?: string } = {}) {
    return res.status(d.status).json({
        ok: false,
        motivo: d.motivo,
        error: d.mensagem,
        ...(extra.codigo ? { codigo: extra.codigo } : {}),
        ...(extra.parcela_id ? { parcela_id: extra.parcela_id } : {}),
    })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const caller = await exigirPermissaoDeEdicao(req, res, 'cash_flow', DESTINO_SEM_PERMISSAO.mensagem)
    if (!caller) return

    const corpo = lerCorpoDoLote(req.body)
    if (!corpo) return recusar(res, DESTINO_DO_CODIGO.PC001)

    const pagoEm = hojeNoFusoDoNegocio()

    try {
        const { data, error } = await supabaseAdmin.rpc('dar_baixa_em_lote', {
            p_parcela_ids: corpo.parcela_ids,
            p_tenant_id: caller.tenant_id,
            p_usuario_id: caller.user_id,
            p_pago_em: pagoEm,
            p_formas: formasDoLote(corpo.parcela_ids, corpo.forma),
        })
        if (error) {
            const e = error as { code?: unknown; details?: unknown }
            const codigo = typeof e.code === 'string' ? e.code : undefined
            const parcela_id = typeof e.details === 'string' && UUID.test(e.details) ? e.details : undefined
            return recusar(res, destinoDoErro(error, corpo), { codigo, parcela_id })
        }
        return res.status(200).json({ ok: true, modo: 'LOTE', resultado: data as ResultadoDoLote })
    } catch (e: unknown) {
        console.error('Baixa em lote:', (e as { message?: string })?.message ?? 'erro desconhecido')
        return recusar(res, DESTINO_DESCONHECIDO)
    }
}
