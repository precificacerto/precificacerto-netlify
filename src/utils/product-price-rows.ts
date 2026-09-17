/**
 * product-price-rows.ts — as LINHAS da precificação do cadastro, com a % EFETIVA ao lado da
 * % ORIGINAL, e o invariante que liga as duas ao preço.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md` — R5 (% Efetivada), R8 (valor sai da
 * efetivada), Parte 5 teste 2 (Σ linhas da operação interna + custo = P).
 *
 * >>> POR QUE ESTE MÓDULO EXISTE, e não é organização de código <<<
 *
 * A tela mostrava as % ORIGINAIS, calculava os R$ a partir das ORIGINAIS, e exibia uma margem
 * de contribuição de `c = 0` — enquanto o PREÇO já vinha do motor com as EFETIVADAS. Medido
 * num produto de custo R$ 798,60 com IBS 1,00% + CBS 8,80% e ICMS 17,00%:
 *
 *   soma das linhas exibidas   47,598%   →  MC exibida 52,402%  →  798,60 ÷ 52,402% = 1.523,99
 *   soma que formou o preço    50,386%   →  MC real    49,614%  →  preço exibido     1.609,63
 *   custo 798,60 + linhas exibidas 766,14                       =  1.564,74
 *   LACUNA                                                      =     44,89
 *
 * O teste 2 do checklist existia no MOTOR e não na APRESENTAÇÃO, e por isso a lacuna passou.
 * Módulo puro é o que permite afirmar o EFEITO (o número que fecha) em vez da passagem
 * (`.claude/rules/teste-que-nao-exercita.md`).
 *
 * >>> A EFETIVAÇÃO É LIDA, NUNCA RECALCULADA <<<
 *
 * `÷ (1 − c)` NÃO vale para todas as linhas. A R5 tem duas exceções, e uma delas incide aqui:
 * PIS/COFINS é apurado sobre `P − ICMS − ISS`, e o motor já o resolveu assim. Aplicar a
 * conversão padrão nele quebraria a soma por outro caminho — e seria a `copia-divergente.md`
 * entre o que a construção calculou e o que a tela recalculou.
 *
 * Por isso `ICMS` e `PIS_COFINS` são espécies próprias e saem de `icmsPctEffective` e
 * `pisCofinsPctEffective` do `ResolvedTaxBreakdown`. A decomposição LÊ o que a construção
 * usou — `.claude/rules/regime-e-segmento-determinam-a-construcao.md`.
 */

/** A espécie decide COMO a linha é efetivada — nunca o rótulo dela. */
export type PriceRowKind = 'PADRAO' | 'ICMS' | 'PIS_COFINS'

export interface PriceRowInput {
  key: string
  /** % ORIGINAL sobre o total geral, em PERCENTUAL (17 = 17%), como a tela a cadastra. */
  originalPct: number
  kind?: PriceRowKind
}

export interface PriceRow extends Required<PriceRowInput> {
  /** % EFETIVA, em PERCENTUAL. Igual à original quando `c = 0`. */
  effectivePct: number
  /** R$ = P × efetiva (R8). */
  value: number
}

/**
 * O que a construção resolveu. `null` = a matriz não governou esta formação — e isso NÃO é
 * "sem tributo": é ausência de regra, e o caminho antigo segue valendo com `c = 0`.
 */
export interface ResolvedForRows {
  /** `c` da R3, DECIMAL [0, 1). */
  externalOpsCoefficient: number
  /** DECIMAL. Já com o gross-up que o motor aplicou. */
  icmsPctEffective: number
  /** DECIMAL. Exceção 2 da R5 — nominal × (1 − ICMS efetivo − ISS efetivo). */
  pisCofinsPctEffective: number
}

export interface ProductPriceRowsInput {
  rows: PriceRowInput[]
  /** CMV apurado, em R$. */
  costTotal: number
  /**
   * P (operação interna). `null` = derivar de `custo ÷ MC`, que é o caminho de quando a
   * matriz não governa e a tela forma o preço pelo divisor de sempre.
   */
  opInterna: number | null
  resolved?: ResolvedForRows | null
}

export interface ProductPriceRowsResult {
  rows: PriceRow[]
  /** P efetivamente usado — o informado, ou o derivado. */
  opInterna: number
  /** Σ das % EFETIVAS, em PERCENTUAL. */
  somaEfetivaPct: number
  /** A MC que de fato produziu o preço: `100 − Σ efetivas`, em PERCENTUAL. */
  mcAplicadaPct: number
  /** `c` em PERCENTUAL, para exibição. `null` quando a matriz não governou. */
  externalOpsCoefficientPct: number | null
  /** `P − (custo + Σ valores)`. Zero é o invariante; ≠ 0 é defeito, não arredondamento. */
  residual: number
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Monta as linhas com as duas colunas de percentual e o valor em R$.
 *
 * O `residual` é a asserção embutida: com as efetivas certas ele é zero por construção,
 * porque o motor define `P = CMV ÷ (1 − Σ efetivas)`. Exibi-lo — ou testá-lo — é o que
 * transforma o teste 2 do checklist em algo que a TELA também precisa satisfazer.
 */
export function buildProductPriceRows(input: ProductPriceRowsInput): ProductPriceRowsResult {
  const resolved = input.resolved ?? null
  const c = resolved ? num(resolved.externalOpsCoefficient) : 0
  const k = 1 - c

  const efetiva = (r: PriceRowInput): number => {
    const original = num(r.originalPct)
    if (!resolved) return original
    // As duas exceções da R5 vêm RESOLVIDAS do motor, em decimal. Não se recalcula aqui:
    // reconstruir `nominal × (1 − icmsEff)` seria escrever a segunda cópia da fórmula.
    if (r.kind === 'ICMS') return num(resolved.icmsPctEffective) * 100
    if (r.kind === 'PIS_COFINS') return num(resolved.pisCofinsPctEffective) * 100
    if (k <= 0) return original
    return original / k
  }

  const comEfetiva = input.rows.map((r) => ({
    key: r.key,
    originalPct: num(r.originalPct),
    kind: r.kind ?? ('PADRAO' as PriceRowKind),
    effectivePct: efetiva(r),
  }))

  const somaEfetivaPct = comEfetiva.reduce((s, r) => s + r.effectivePct, 0)
  const mcAplicadaPct = 100 - somaEfetivaPct

  const costTotal = num(input.costTotal)
  const opInterna = input.opInterna != null
    ? num(input.opInterna)
    : mcAplicadaPct > 0 ? costTotal / (mcAplicadaPct / 100) : 0

  const rows: PriceRow[] = comEfetiva.map((r) => ({
    ...r,
    value: opInterna * r.effectivePct / 100,
  }))

  const somaValores = rows.reduce((s, r) => s + r.value, 0)

  return {
    rows,
    opInterna,
    somaEfetivaPct,
    mcAplicadaPct,
    externalOpsCoefficientPct: resolved ? c * 100 : null,
    residual: opInterna - (costTotal + somaValores),
  }
}
