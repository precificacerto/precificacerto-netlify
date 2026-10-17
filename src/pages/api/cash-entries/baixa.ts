/**
 * POST /api/cash-entries/baixa — a baixa de UMA parcela, simples ou com valor diferente.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A 5c.1 ESTÁ INCOMPLETA: A BAIXA SIMPLES NÃO GRAVA AUTOR.                              ║
 * ║ Ela vai por UPDATE porque a RPC recusa a última em aberto (PC005) e a parcela fora    ║
 * ║ de série (PC002) MESMO COM DELTA ZERO — medido no harness em 17/10/2026 contra o      ║
 * ║ `prosrc` de produção. São DUAS vias de escrita de dinheiro, e cada baixa simples é    ║
 * ║ inatribuível para sempre. O conserto é na FUNÇÃO (…000003). Detalhe e números no      ║
 * ║ cabeçalho de `src/utils/baixa-pela-rota.ts`.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O MOLDE É O DE `/api/delete/sales` e `/api/cash-entries/update`: `supabaseAdmin` no servidor,
 * o chamador resolvido por `getCallerContext` a partir do cookie `token`, e a permissão de
 * `cash_flow.can_edit` — aqui pela checagem que `permissao-do-modulo.ts` extraiu daquelas rotas,
 * e não por uma terceira cópia dela.
 *
 * DOIS CAMINHOS, e o corpo decide qual
 * -------------------------------------
 * - **sem `valor_pago`** — baixa pelo valor combinado: `darBaixaNaParcela`, o mesmo módulo da
 *   5b, agora com o cliente admin e o tenant da sessão. Não passa pela RPC porque a RPC
 *   RECUSA a última em aberto (`PC005`) e a parcela fora de série (`PC002`), e as duas têm de
 *   poder ser baixadas pelo valor combinado.
 * - **com `valor_pago`** — `dar_baixa_com_valor_diferente`, que dá a baixa e redistribui a
 *   diferença numa transação, e grava o autor no log.
 *
 * `p_usuario_id` e `p_tenant_id` VÊM DA SESSÃO, NUNCA DO CORPO. A DATA VEM DO SERVIDOR,
 * por `hojeNoFusoDoNegocio` — a rota não é seletor de data (XI.1). `lerCorpoDaBaixa` só lê as
 * três chaves do contrato; o que mais vier é ignorado.
 *
 * FORMA AUSENTE NÃO É ESCRITA: sem forma no corpo, `payment_method` não entra no UPDATE e a
 * RPC recebe `NULL`, que o `coalesce` dela preserva. As duas vias com a mesma semântica.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { exigirPermissaoDeEdicao } from '@/lib/permissao-do-modulo'
import { darBaixaNaParcela, type ClienteDeEscrita } from '@/utils/baixa-de-parcela'
import { hojeNoFusoDoNegocio } from '@/utils/dia-de-hoje'
import {
    DESTINO_DESCONHECIDO,
    DESTINO_DO_CODIGO,
    DESTINO_SEM_PERMISSAO,
    destinoDoErro,
    lerCorpoDaBaixa,
    type Destino,
    type ResultadoDaRpc,
} from '@/utils/baixa-pela-rota'

function recusar(res: NextApiResponse, d: Destino, codigo?: string) {
    return res.status(d.status).json({ ok: false, motivo: d.motivo, error: d.mensagem, ...(codigo ? { codigo } : {}) })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // A PERMISSÃO VEM ANTES DE TUDO: sem ela, nem o corpo é lido, e a RPC não é chamada.
    const caller = await exigirPermissaoDeEdicao(req, res, 'cash_flow', DESTINO_SEM_PERMISSAO.mensagem)
    if (!caller) return

    const corpo = lerCorpoDaBaixa(req.body)
    if (!corpo) return recusar(res, DESTINO_DO_CODIGO.PC001)

    // O DIA É DO SERVIDOR, no fuso do negócio. Um `pago_em` no corpo é ignorado.
    const pagoEm = hojeNoFusoDoNegocio()

    try {
        if (corpo.valor_pago === undefined) {
            const r = await darBaixaNaParcela({
                cliente: supabaseAdmin as unknown as ClienteDeEscrita,
                parcelaId: corpo.parcela_id,
                tenantId: caller.tenant_id,
                // `forma` ausente fica `undefined` e a coluna não vai no UPDATE.
                entrada: { pagoEm, forma: corpo.forma },
            })
            if (r.error) {
                console.error('Baixa simples recusada:', (r.error as { code?: string })?.code ?? 'sem código')
                return recusar(res, destinoDoErro(r.error as { code?: unknown }, corpo))
            }
            if (r.jaEstavaPaga) return recusar(res, DESTINO_DO_CODIGO.PC004)
            return res.status(200).json({ ok: true, modo: 'SIMPLES' })
        }

        const { data, error } = await supabaseAdmin.rpc('dar_baixa_com_valor_diferente', {
            p_parcela_id: corpo.parcela_id,
            p_tenant_id: caller.tenant_id,
            p_usuario_id: caller.user_id,
            p_valor_pago: corpo.valor_pago,
            p_pago_em: pagoEm,
            // `NULL` = não mexer: o `coalesce` da RPC preserva a forma combinada.
            p_forma: corpo.forma ?? null,
        })
        if (error) {
            const codigo = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined
            return recusar(res, destinoDoErro(error, corpo), codigo)
        }
        return res.status(200).json({ ok: true, modo: 'VALOR_DIFERENTE', resultado: data as ResultadoDaRpc })
    } catch (e: unknown) {
        console.error('Baixa de parcela:', (e as { message?: string })?.message ?? 'erro desconhecido')
        return recusar(res, DESTINO_DESCONHECIDO)
    }
}
