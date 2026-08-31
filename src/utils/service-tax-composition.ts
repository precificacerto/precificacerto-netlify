/**
 * service-tax-composition.ts — composição das alíquotas da FORMAÇÃO DO PREÇO DE VENDA
 * de serviço (tela de cadastro).
 *
 * NÃO é a cascata / motor RRO (`mrm-engine-v17`, `hub-engine`). Este módulo trata
 * apenas dos percentuais que formam a margem de contribuição no cadastro do serviço.
 *
 * Regras do dono do produto:
 *  - Lucro, comissão e RT são ENTRADA manual, individual por serviço. Nunca derivados.
 *  - MEI: imposto é ZERO, sempre. Não entra na margem de contribuição em hipótese alguma.
 *  - Simples Nacional: imposto vem da configuração do onboarding (anexo + faturamento 12m)
 *    e permanece editável manualmente por serviço.
 *  - Todo percentual que entra no cálculo tem linha visível na tela: `lines` é exatamente
 *    o conjunto exibido, e sua soma é `totalPct`. Se é somado, é exibido; se não é
 *    exibido, não é somado.
 */

/** Chave de cada linha de markup exibida na tela de precificação do serviço. */
export type ServiceMarkupLineKey =
    | 'variable'
    | 'financial'
    | 'taxes'
    | 'taxableRegime'
    | 'rtReserve'
    | 'commission'
    | 'profit'

export interface ServiceMarkupLine {
    key: ServiceMarkupLineKey
    /** Percentual em base 100 (ex.: 15.5 representa 15,5%). */
    pct: number
}

export interface ServiceMarkupInput {
    /** Regime MEI (fonte: `taxPreview.isMei` / `currentUser.taxableRegime`). */
    isMei: boolean
    /** `taxPreview.taxesPercent` — impostos do regime fora do DAS (base 100). */
    taxesPct: number
    /** Alíquota do regime gravada/editada no serviço (base 100). */
    taxableRegimePercent: number
    variablePct: number
    financialPct: number
    rtReservePercent: number
    commissionPercent: number
    profitPercent: number
}

export interface ServiceMarkupComposition {
    /** Alíquota do regime que de fato entra no preço (base 100). MEI ⇒ 0, sempre. */
    taxableRegimePct: number
    /** Alíquota total de imposto em decimal (0–1), pronta para o motor de precificação. */
    taxPct: number
    /** Linhas exibidas na tela, na ordem de renderização. A soma é exatamente `totalPct`. */
    lines: ServiceMarkupLine[]
    /** Soma dos percentuais exibidos (base 100). */
    totalPct: number
}

/** Converte para número tratando `null`/`undefined`/valor inválido como 0. */
function toFiniteNumber(value: unknown): number {
    if (value == null) return 0
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

/**
 * Alíquota de imposto do regime que pode entrar na formação do preço do serviço.
 *
 * Em MEI o DAS é fixo e independe do faturamento: o imposto NUNCA entra na margem de
 * contribuição. Um `taxable_regime_percent` residual gravado no serviço (dado legado)
 * é ignorado aqui, de modo que o cálculo e a tela mostrem 0% — e a próxima gravação
 * legítima do serviço normalize o dado.
 */
export function resolveServiceTaxableRegimePercent(
    rawPercent: unknown,
    opts: { isMei: boolean },
): number {
    if (opts.isMei) return 0
    return toFiniteNumber(rawPercent)
}

/**
 * Primeiro valor efetivamente configurado de uma cadeia de fallbacks.
 *
 * Substitui o padrão `a || b || c`, que trata `0` como "campo vazio" e faz o usuário
 * perder um percentual digitado como zero (ex.: 0% de imposto no Simples volta a ser a
 * alíquota do tenant ao reabrir a tela). Aqui só `null`/`undefined`/valor não-finito
 * caem para o próximo fallback; zero digitado é preservado.
 */
export function firstConfiguredPercent(...candidates: unknown[]): number {
    for (const candidate of candidates) {
        if (candidate == null) continue
        const n = Number(candidate)
        if (Number.isFinite(n)) return n
    }
    return 0
}

/**
 * Percentual de cadastro (lucro, comissão, RT) lido do banco.
 *
 * ENTRADA manual do usuário: nunca derivado de preço, custo ou de qualquer outro
 * percentual. Zero gravado é zero — não é "campo vazio".
 */
export function readRegisteredPercent(value: unknown): number {
    return toFiniteNumber(value)
}

/**
 * Compõe as alíquotas de markup dos regimes sem tratamento tributário próprio na tela
 * (MEI, Simples Nacional e demais regimes que caem no ramo padrão).
 *
 * Lucro Real e Lucro Presumido têm composição própria no componente (IRPJ/CSLL derivados
 * do lucro ou da presunção) e não passam por aqui.
 *
 * Mapeamento com as linhas renderizadas:
 *  - `taxes` é a linha "Impostos" do regime (em MEI, "Impostos (MEI — DAS fixo)"), que
 *    exibe `taxesPct`;
 *  - `taxableRegime` é a linha da alíquota do regime editável por serviço. No Simples ela
 *    é fundida com a linha "Impostos" (lá `taxesPct` é 0, então o número exibido é o
 *    mesmo que é somado); em MEI vale 0 e a linha é suprimida — zero exibido ou zero
 *    omitido não altera a soma.
 */
export function composeServiceMarkup(input: ServiceMarkupInput): ServiceMarkupComposition {
    const taxesPct = toFiniteNumber(input.taxesPct)
    const taxableRegimePct = resolveServiceTaxableRegimePercent(
        input.taxableRegimePercent,
        { isMei: input.isMei },
    )

    const lines: ServiceMarkupLine[] = [
        { key: 'variable', pct: toFiniteNumber(input.variablePct) },
        { key: 'financial', pct: toFiniteNumber(input.financialPct) },
        { key: 'taxes', pct: taxesPct },
        { key: 'taxableRegime', pct: taxableRegimePct },
        { key: 'rtReserve', pct: toFiniteNumber(input.rtReservePercent) },
        { key: 'commission', pct: toFiniteNumber(input.commissionPercent) },
        { key: 'profit', pct: toFiniteNumber(input.profitPercent) },
    ]

    return {
        taxableRegimePct,
        taxPct: (taxesPct + taxableRegimePct) / 100,
        lines,
        totalPct: lines.reduce((sum, line) => sum + line.pct, 0),
    }
}
