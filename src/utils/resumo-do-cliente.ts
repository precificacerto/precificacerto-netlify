/**
 * resumo-do-cliente.ts — os números do cabeçalho da ficha, DERIVADOS do que já foi lido.
 *
 * PURO, e sem consulta nova. As compras vêm das entradas do histórico que a ficha já
 * carregou (`carregarHistoricoDoCliente`); o que se deve vem do agregado de
 * `parcelas-do-cliente.ts`. Nenhuma das duas é consulta desta etapa.
 *
 * "TOTAL COMPRADO" É UM SUBCONJUNTO, E A TELA TEM DE DIZER ISSO
 * --------------------------------------------------------------
 * **15 das 101 vendas da base não têm `customer_id`** e nunca aparecem em ficha nenhuma. Um
 * total que não bate com o relatório e não diz por quê queima a confiança na ficha inteira —
 * por isso o rótulo é "vendas com cliente identificado", e ele é constante exportada, não
 * texto solto na tela.
 *
 * VENDA MORTA NÃO É COMPRA. `CANCELLED` e `EXCLUIDO` entram no histórico (é a regra de
 * `customer-history-status.ts`: o status separa, o booleano esconde), e ficam FORA do total.
 * Somá-las diria que o cliente comprou o que ele cancelou.
 */

import type { AgregadoDoCliente } from '@/utils/parcelas-do-cliente'

/** O rótulo é regra, não redação — ver o cabeçalho. */
export const ROTULO_TOTAL_COMPRADO = 'Total comprado'
export const RESSALVA_TOTAL_COMPRADO = 'vendas com cliente identificado'

/** O mínimo que o resumo precisa de cada entrada do histórico. */
export interface CompraDoHistorico {
    type: string
    date: string
    amount?: number
    /** `'ATIVO' | 'CANCELADO' | 'EXCLUIDO'` — só a primeira conta como compra. */
    lifecycle: string
}

export interface ResumoDoCliente {
    totalComprado: number
    ticketMedio: number | null
    /** `YYYY-MM-DD` da última compra viva. `null` quando não houve nenhuma. */
    ultimaCompra: string | null
    numeroDeCompras: number
    aReceber: number
    vencido: number
    semVencimento: number
    maiorAtrasoDias: number | null
}

function centavos(v: number): number {
    return Math.round((Number.isFinite(v) ? v : 0) * 100)
}

/**
 * Monta o resumo.
 *
 * `ticketMedio` é `null` com zero compras, não zero: "o cliente compra em média R$ 0,00"
 * é uma afirmação sobre o comportamento dele, e "nunca comprou" é outra
 * (`ausente-vs-falso.md`). A tela exibe travessão no `null`.
 */
export function montarResumoDoCliente(args: {
    historico: readonly CompraDoHistorico[]
    agregado: AgregadoDoCliente | undefined
}): ResumoDoCliente {
    const compras = args.historico.filter((e) => e.type === 'SALE' && e.lifecycle === 'ATIVO')

    let totalEmCentavos = 0
    let ultima: string | null = null
    for (const c of compras) {
        totalEmCentavos += centavos(c.amount ?? 0)
        const dia = (c.date || '').slice(0, 10)
        if (dia && (ultima === null || dia > ultima)) ultima = dia
    }

    const a = args.agregado
    return {
        totalComprado: totalEmCentavos / 100,
        ticketMedio: compras.length > 0 ? Math.round(totalEmCentavos / compras.length) / 100 : null,
        ultimaCompra: ultima,
        numeroDeCompras: compras.length,
        // Sem agregado o cliente não tem parcela nenhuma, e a tela exibe travessão — quem
        // distingue "zero apurado" de "nada lançado" é a presença do agregado, não o número.
        aReceber: a ? a.aVencer : 0,
        vencido: a ? a.vencido : 0,
        semVencimento: a ? a.semVencimento : 0,
        maiorAtrasoDias: a ? a.maiorAtrasoDias : null,
    }
}
