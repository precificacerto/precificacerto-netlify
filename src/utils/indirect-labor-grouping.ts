/**
 * indirect-labor-grouping.ts — em segmentação REVENDA, MO Produtiva e MO Indireta são UMA
 * categoria só.
 *
 * REGRA (Cascata do Simples Nacional, matriz de destino):
 *   Item do MESMO TIPO da segmentação, coluna Revenda:
 *     MO Produtiva ... MC agrupada
 *     MO Indireta .... MC agrupada
 *   As duas são SOMADAS numa única categoria (exemplo: 15% + 8% = 23%) e exibidas em UMA
 *   linha rotulada "MO Indireta", com o percentual já somado. NÃO existe linha separada de
 *   MO Produtiva em revenda.
 *
 * POR QUE ELAS SE AGRUPAM SÓ AQUI. Nas outras duas segmentações a MO Produtiva vira CUSTO
 * por tempo — entra em R$ no CMV, via minutos do item. Revenda não tem tempo de produção:
 * não há minuto sobre o qual ratear, então a MO Produtiva só pode entrar como PERCENTUAL,
 * na margem de contribuição, ao lado da Indireta. Agrupá-las é o reconhecimento de que, sem
 * tempo, as duas têm a mesma natureza — rateio da folha sobre o faturamento.
 *
 * O DEFEITO QUE ISTO CORRIGE. `calcBase.laborPercent` (= `production_labor_percent`) existia,
 * era populado, e **não tinha um único leitor** em todo o código. O tipo já declarava a
 * intenção — "Labor as % of revenue — used by REVENDA (included in structurePct)" — mas o
 * `structurePct` nunca a somou, e o coeficiente de revenda levava só a MO Indireta. Resultado:
 * em segmentação REVENDA a MO Produtiva não entrava no CMV (correto, é MC) nem na MC
 * (defeito). Ela simplesmente desaparecia do preço.
 *
 * No oráculo da regra, com MO Produtiva 15% e Indireta 8%: o preço de revenda cai de
 * R$ 294,1176 (Σ 66%, coeficiente 34%) para R$ 243,90 (Σ 51%, coeficiente 49%) — 17% abaixo.
 *
 * ESCOPO — só a segmentação REVENDA. Nas outras duas o agrupamento seria dupla contagem:
 *  - tenant INDUSTRIALIZAÇÃO: a MO Produtiva já está no CMV por tempo; a Indireta segue
 *    sozinha como percentual, e alcança inclusive o item de revenda daquele tenant.
 *  - tenant SERVIÇO: as três (Produtiva, Indireta e Fixa) estão dentro do custo por minuto
 *    da prestação; o item de revenda não recebe nenhuma delas (destino FORA).
 *
 * NOTA sobre a leitura da segmentação: esta função recebe o `calc_type` que o chamador tem
 * em mãos, que hoje é o ATUAL do tenant. A regra manda que o destino seja congelado por item
 * no momento da formação do preço — correção registrada como defeito próprio (D-A), a ser
 * feita depois. Quando o snapshot existir, o argumento passa a vir dele, e esta função não
 * muda.
 */

/** Segmentação do tenant (`tenant_settings.calc_type`). */
export type TenantSegment = 'REVENDA' | 'INDUSTRIALIZACAO' | 'SERVICO'

/** Mesmo motivo de `expense-destination.ts`: banco grava REVENDA, a UI carrega RESALE. */
function normalize(v: unknown): string {
    const up = String(v ?? '').trim().toUpperCase()
    return up === 'RESALE' ? 'REVENDA' : up
}

/** A segmentação agrupa MO Produtiva com MO Indireta? Só REVENDA. */
export function groupsProductiveLaborIntoIndirect(tenantCalcType: unknown): boolean {
    return normalize(tenantCalcType) === 'REVENDA'
}

function finite(v: unknown): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/**
 * Percentual da categoria "MO Indireta" — agrupado quando a segmentação é REVENDA.
 *
 * É a ÚNICA fonte do número, para cálculo e para exibição: a tela de Produtos usa este valor
 * no coeficiente E na linha exibida, então a soma das linhas continua fechando com o preço
 * por construção, não por coincidência (mesmo invariante do #17 e do #23).
 *
 * Ambos os percentuais em base 100, como `tenant_expense_config` os guarda. Fora de REVENDA
 * devolve a MO Indireta intacta ⇒ bit-exact.
 */
export function resolveIndirectLaborPct(input: {
    tenantCalcType: unknown
    /** `admin_labor_percent` ou `indirect_labor_percent` (base 100). */
    indirectLaborPct: unknown
    /** `production_labor_percent` (base 100). */
    productiveLaborPct: unknown
}): number {
    const indirect = finite(input.indirectLaborPct)
    if (!groupsProductiveLaborIntoIndirect(input.tenantCalcType)) return indirect
    return indirect + finite(input.productiveLaborPct)
}
