/**
 * vencimentos-da-ficha.ts — a lista de vencimentos do cliente, e a autossoma do que está
 * selecionado.
 *
 * PURO. Recebe as parcelas já montadas por `parcelas-do-cliente.ts` e as vendas já lidas;
 * não consulta, não lê relógio. O `hoje` que decide VENCIDA já foi aplicado lá.
 *
 * UMA LISTA, NÃO AGRUPADA POR VENDA
 * ----------------------------------
 * Quatro vendas de quatro parcelas são DEZESSEIS LINHAS numa fila só, ordenadas por
 * vencimento crescente. Agrupar por venda responde "o que esta venda tem a receber", e a
 * pergunta de quem abre a ficha é outra: "o que vence primeiro". Com o agrupamento, a
 * parcela que vence amanhã pode estar no fim da tela porque a venda dela é antiga.
 *
 * O CÓDIGO DA VENDA É O RÓTULO QUE SE FALA AO TELEFONE
 * -----------------------------------------------------
 * `sales.sale_code` — 101 de 101 preenchido e distinto, formato `VD-121365` / `AG-1368A8`,
 * medido em 16/10/2026. O uuid NÃO entra na tela: ninguém dita um uuid por telefone, e
 * exibi-lo seria dar um rótulo que não serve para a função que a coluna tem.
 *
 * Parcela cuja origem não resolve venda — 12 das 74 séries, e as 4 linhas `[A RECEBER]`
 * que apontam para `calendar_events` — fica com `codigoDaVenda: null`. A tela exibe
 * travessão e NÃO oferece link: um link que leva a lugar nenhum é pior que nenhum link.
 *
 * O BLOCO SEM VENCIMENTO NASCE VAZIO, e isso é medição, não suposição: `due_date` é nulo em
 * **0 de 1.659** linhas. As 4 linhas de "lançamento a receber" TÊM data — a descrição delas
 * diz "Cobrar em: DD/MM" e o `due_date` bate com ela —, então entram na fila datada como
 * qualquer outra. O bloco existe porque a coluna é `date NULL` sem default e a primeira
 * linha sem data pode nascer amanhã; ele só renderiza quando houver uma.
 */

import type { Parcela } from '@/utils/parcelas-do-cliente'

/** `sales` no mínimo que a lista precisa: o id para casar, o código para exibir. */
export interface VendaComCodigo {
    id: string
    sale_code: string | null
}

export interface LinhaDeVencimento {
    /** O id da `cash_entries` — é a chave da linha e o `?parcela=` da tela da parcela. */
    id: string
    saleId: string | null
    /** `VD-121365`. `null` quando a origem não resolve venda: a tela exibe travessão. */
    codigoDaVenda: string | null
    numero: number
    de: number
    vencimento: string | null
    valor: number
    estado: Parcela['estado']
    diasDeAtraso: number | null
    pagaEm: string | null
    /** Parcela PAGA não é selecionável: não há o que somar para cobrar. */
    selecionavel: boolean
}

export interface VencimentosDaFicha {
    /** A fila datada, por vencimento crescente. */
    datadas: LinhaDeVencimento[]
    /** O bloco sem vencimento. Vazio hoje; só renderiza quando tiver linha. */
    semVencimento: LinhaDeVencimento[]
}

function ordenarPorVencimento(a: LinhaDeVencimento, b: LinhaDeVencimento): number {
    const da = a.vencimento ?? ''
    const db = b.vencimento ?? ''
    if (da !== db) return da < db ? -1 : 1
    // Desempate ESTÁVEL e legível: código da venda, depois número da parcela. Sem ele, duas
    // parcelas que vencem no mesmo dia trocariam de lugar entre renderizações.
    const ca = a.codigoDaVenda ?? '￿'
    const cb = b.codigoDaVenda ?? '￿'
    if (ca !== cb) return ca < cb ? -1 : 1
    if (a.numero !== b.numero) return a.numero - b.numero
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Monta as duas listas a partir das parcelas de UM cliente.
 *
 * O chamador filtra por cliente — a segmentação é dele, e é o que impede a mistura
 * acidental de dois clientes numa fila só.
 */
export function montarVencimentosDaFicha(args: {
    parcelas: readonly Parcela[]
    vendas: readonly VendaComCodigo[]
}): VencimentosDaFicha {
    const codigoPorVenda = new Map<string, string | null>()
    for (const v of args.vendas) codigoPorVenda.set(v.id, v.sale_code)

    const linhas: LinhaDeVencimento[] = args.parcelas.map((p) => ({
        id: p.id,
        saleId: p.saleId,
        codigoDaVenda: p.saleId !== null ? codigoPorVenda.get(p.saleId) ?? null : null,
        numero: p.numero,
        de: p.de,
        vencimento: p.vencimento,
        valor: p.valor,
        estado: p.estado,
        diasDeAtraso: p.diasDeAtraso,
        pagaEm: p.pagaEm,
        selecionavel: p.estado !== 'PAGA',
    }))

    return {
        datadas: linhas.filter((l) => l.vencimento !== null).sort(ordenarPorVencimento),
        // A ordem hierárquica do bloco sem data: código da venda, depois número da parcela.
        // Sem venda que resolva, `ordenarPorVencimento` cai no id, que é estável.
        semVencimento: linhas.filter((l) => l.vencimento === null).sort(ordenarPorVencimento),
    }
}

/**
 * A soma corrente do que está selecionado, EM CENTAVOS INTEIROS.
 *
 * `0,1 + 0,2` em float dá `0.30000000000000004`, e esta é a conta que decide se o cliente
 * manda um PIX de R$ 1.234,56 ou de R$ 1.234,55. Arredonda-se CADA parcela para centavo
 * inteiro, soma-se inteiro, e divide-se UMA vez no fim — a mesma regra de
 * `parcelas-do-cliente.ts`.
 *
 * Linha não selecionável é IGNORADA mesmo que o id venha na seleção: a trava é aqui, não
 * só no `<Table>`. Uma seleção herdada de um render anterior não pode somar uma parcela
 * que acabou de ser paga.
 */
export function somarSelecionadas(linhas: readonly LinhaDeVencimento[], ids: readonly string[]): number {
    const escolhidos = new Set(ids)
    let centavos = 0
    for (const l of linhas) {
        if (!escolhidos.has(l.id)) continue
        if (!l.selecionavel) continue
        centavos += Math.round(l.valor * 100)
    }
    return centavos / 100
}

/** Quantas linhas a soma de fato considerou — o rodapé diz "N selecionadas". */
export function contarSelecionadas(linhas: readonly LinhaDeVencimento[], ids: readonly string[]): number {
    const escolhidos = new Set(ids)
    return linhas.filter((l) => escolhidos.has(l.id) && l.selecionavel).length
}

/** A linha de uma parcela, para a tela dela. `null` quando o id não resolve. */
export function acharLinha(v: VencimentosDaFicha, id: string): LinhaDeVencimento | null {
    return [...v.datadas, ...v.semVencimento].find((l) => l.id === id) ?? null
}

/** As outras parcelas da MESMA série, em ordem — o que a tela da parcela lista embaixo. */
export function irmasDaMesmaSerie(v: VencimentosDaFicha, linha: LinhaDeVencimento): LinhaDeVencimento[] {
    if (linha.saleId === null) return []
    return [...v.datadas, ...v.semVencimento]
        .filter((l) => l.saleId === linha.saleId)
        .sort(ordenarPorVencimento)
}
