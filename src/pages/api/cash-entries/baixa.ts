/**
 * POST /api/cash-entries/baixa — a baixa de UMA parcela, simples ou com valor diferente.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ TODA BAIXA DA FICHA GRAVA AUTOR NO LOG. Esta rota não tem UPDATE em `cash_entries`:   ║
 * ║ os dois caminhos são função do banco, e as duas gravam `criado_por` = o usuário da    ║
 * ║ sessão em `parcela_reajuste_log`. Há portão afirmando a ausência do UPDATE — estático ║
 * ║ (o texto deste arquivo) e dinâmico (nenhum `.from().update()` durante a chamada).     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O MOLDE É O DE `/api/delete/sales` e `/api/cash-entries/update`: `supabaseAdmin` no servidor,
 * o chamador resolvido por `getCallerContext` a partir do cookie `token`, e a permissão de
 * `cash_flow.can_edit` — aqui pela checagem que `permissao-do-modulo.ts` extraiu daquelas rotas,
 * e não por uma terceira cópia dela.
 *
 * DOIS CAMINHOS, e o corpo decide qual
 * -------------------------------------
 * - **sem `valor_pago`** — `dar_baixa_simples` (…000003): baixa pelo valor combinado. Aceita a
 *   última em aberto e a parcela sem série, que `dar_baixa_com_valor_diferente` recusa (PC005,
 *   PC002) mesmo com delta zero — foi por isso que a simples ia por UPDATE até a …000003.
 * - **com `valor_pago`** — `dar_baixa_com_valor_diferente` (…000001), que dá a baixa e
 *   redistribui a diferença numa transação.
 *
 * `p_usuario_id` e `p_tenant_id` VÊM DA SESSÃO, NUNCA DO CORPO. A DATA VEM DO SERVIDOR,
 * por `hojeNoFusoDoNegocio` — a rota não é seletor de data (XI.1). `lerCorpoDaBaixa` só lê as
 * três chaves do contrato; o que mais vier é ignorado.
 *
 * FORMA AUSENTE NÃO É ESCRITA: sem forma no corpo, as duas funções recebem `NULL`, que o
 * `coalesce` delas preserva.
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
    lerCorpoDaBaixa,
    type Destino,
    type ResultadoDaBaixaSimples,
    type ResultadoDaRpc,
} from '@/utils/baixa-pela-rota'

function recusar(res: NextApiResponse, d: Destino, codigo?: string) {
    return res.status(d.status).json({ ok: false, motivo: d.motivo, error: d.mensagem, ...(codigo ? { codigo } : {}) })
}

function codigoDo(error: unknown): string | undefined {
    const c = (error as { code?: unknown })?.code
    return typeof c === 'string' ? c : undefined
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // A PERMISSÃO VEM ANTES DE TUDO: sem ela, nem o corpo é lido, e a função não é chamada.
    const caller = await exigirPermissaoDeEdicao(req, res, 'cash_flow', DESTINO_SEM_PERMISSAO.mensagem)
    if (!caller) return

    const corpo = lerCorpoDaBaixa(req.body)
    if (!corpo) return recusar(res, DESTINO_DO_CODIGO.PC001)

    // O DIA É DO SERVIDOR, no fuso do negócio. Um `pago_em` no corpo é ignorado.
    const pagoEm = hojeNoFusoDoNegocio()

    try {
        if (corpo.valor_pago === undefined) {
            const { data, error } = await supabaseAdmin.rpc('dar_baixa_simples', {
                p_parcela_id: corpo.parcela_id,
                p_tenant_id: caller.tenant_id,
                p_usuario_id: caller.user_id,
                p_pago_em: pagoEm,
                // `NULL` = não mexer: o `coalesce` da função preserva a forma combinada.
                p_forma: corpo.forma ?? null,
            })
            if (error) return recusar(res, destinoDoErro(error, corpo), codigoDo(error))
            return res.status(200).json({ ok: true, modo: 'SIMPLES', resultado: data as ResultadoDaBaixaSimples })
        }

        const { data, error } = await supabaseAdmin.rpc('dar_baixa_com_valor_diferente', {
            p_parcela_id: corpo.parcela_id,
            p_tenant_id: caller.tenant_id,
            p_usuario_id: caller.user_id,
            p_valor_pago: corpo.valor_pago,
            p_pago_em: pagoEm,
            p_forma: corpo.forma ?? null,
        })
        if (error) return recusar(res, destinoDoErro(error, corpo), codigoDo(error))
        return res.status(200).json({ ok: true, modo: 'VALOR_DIFERENTE', resultado: data as ResultadoDaRpc })
    } catch (e: unknown) {
        console.error('Baixa de parcela:', (e as { message?: string })?.message ?? 'erro desconhecido')
        return recusar(res, DESTINO_DESCONHECIDO)
    }
}
