/**
 * iva-dual-reduction-factor.ts — o fator de redução do IVA DUAL: faixa, atalhos
 * e a conversão para a unidade que o motor usa.
 *
 * SEMÂNTICA (R4 em `.claude/rules/cascata-lucro-real.md`), definida pelo dono do
 * produto: o fator é o percentual de REDUÇÃO aplicado sobre a alíquota original.
 *
 *     alíquota efetiva = alíquota original × (1 − fator/100)
 *
 * Alíquota 10% com fator 50 resulta em efetiva 5%.
 *
 * >>> O CAMPO É LIVRE, NÃO É LISTA FECHADA <<<
 * Existem vários percentuais de redução além dos da LC 214/2025. Os valores de
 * `IVA_DUAL_REDUCTION_SHORTCUTS` são ATALHO de digitação, nunca restrição: 45 e
 * 27 são valores válidos e o banco os aceita desde a migração
 * `20260915000001_iva_dual_reduction_factor_range.sql`.
 *
 * >>> DUAS UNIDADES, E ELAS NÃO SE MISTURAM <<<
 *   - banco e tela  → percentual INTEIRO em [0, 100]  (50 = 50%)
 *   - motor         → FRAÇÃO em [0, 1]                (0,5 = 50%)
 * `resolveExternalOpsCoefficient` recusa `reductionFactor` acima de 1, então
 * passar o percentual direto vira erro de validação — e o fator 1, que seria 1%,
 * passaria como 100% de redução. `reductionFactorPctToFraction` é a única
 * travessia autorizada entre as duas unidades.
 *
 * >>> NULO NÃO É ZERO <<<
 * `null` é NÃO CLASSIFICADO; `0` é "integral, regime regular" — classificado, e
 * com o mesmo resultado aritmético. A distinção não muda conta nenhuma, e é
 * justamente por isso que ela se perde fácil: ver `ausente-vs-falso.md`.
 */

/** Um valor de atalho oferecido na tela. Não restringe o que pode ser digitado. */
export interface IvaDualReductionShortcut {
  /** Percentual inteiro, como vai para o banco. */
  pct: number
  /** Rótulo curto do chip. */
  label: string
  /** Enquadramento da LC 214/2025, quando existe. `null` = sem enquadramento nomeado. */
  enquadramento: string | null
  /** `true` quando o percentual está previsto na LC 214/2025. */
  lc214: boolean
}

/**
 * Atalhos da tela, na ordem em que aparecem.
 *
 * Os quatro da LC 214/2025 (0, 30, 60, 100) vêm com o enquadramento nomeado.
 * 40, 70 e 80 são anteriores a esta rodada e ficam: nenhum produto os usa hoje,
 * mas remover opção é retirar capacidade sem demanda, e quem contasse com elas
 * descobriria quebrado.
 */
export const IVA_DUAL_REDUCTION_SHORTCUTS: ReadonlyArray<IvaDualReductionShortcut> = [
  { pct: 0, label: '0%', enquadramento: 'Integral — regime regular', lc214: true },
  {
    pct: 30,
    label: '30%',
    enquadramento: 'Profissões liberais regulamentadas',
    lc214: true,
  },
  { pct: 40, label: '40%', enquadramento: null, lc214: false },
  { pct: 50, label: '50%', enquadramento: null, lc214: false },
  {
    pct: 60,
    label: '60%',
    enquadramento:
      'Saúde, educação, dispositivos médicos e de acessibilidade, medicamentos, alimentos, ' +
      'produtos e insumos agropecuários, transporte coletivo, produção cultural e jornalística',
    lc214: true,
  },
  { pct: 70, label: '70%', enquadramento: null, lc214: false },
  { pct: 80, label: '80%', enquadramento: null, lc214: false },
  {
    pct: 100,
    label: '100%',
    enquadramento: 'Cesta básica nacional, produtor rural não contribuinte',
    lc214: true,
  },
]

export const IVA_DUAL_REDUCTION_MIN_PCT = 0
export const IVA_DUAL_REDUCTION_MAX_PCT = 100

/**
 * O valor é um percentual de redução aceitável? Inteiro não é exigido aqui — a
 * coluna é `integer` e o arredondamento é do banco, não desta função.
 */
export function isValidReductionFactorPct(pct: unknown): boolean {
  const n = Number(pct)
  return (
    Number.isFinite(n) && n >= IVA_DUAL_REDUCTION_MIN_PCT && n <= IVA_DUAL_REDUCTION_MAX_PCT
  )
}

/** Resultado de `reductionFactorPctToFraction`. */
export interface ReductionFactorConversion {
  /**
   * `true` quando o valor bruto era `null`/`undefined` — NÃO CLASSIFICADO.
   * Distinto de `fraction: 0`, que é "integral, regime regular", classificado.
   */
  ausente: boolean
  /** Fração em [0, 1] para o motor. Ausente quando não classificado ou inválido. */
  fraction?: number
  /** Mensagem quando o valor existe e não é conversível. */
  error?: string
}

/**
 * Converte o percentual inteiro do banco/tela na fração que o motor espera.
 *
 *   50   → { ausente: false, fraction: 0.5 }
 *   0    → { ausente: false, fraction: 0 }      ← classificado, não é ausente
 *   null → { ausente: true }                     ← não classificado, sem fração
 *   -1   → { ausente: false, error: … }
 *   101  → { ausente: false, error: … }
 *
 * Quem chama decide o que fazer com `ausente`: para a ARITMÉTICA do `c`, ausente
 * e zero dão o mesmo número, e é por isso que o motor não recebe a distinção —
 * ele calcula, não classifica.
 */
export function reductionFactorPctToFraction(
  pct: number | null | undefined,
): ReductionFactorConversion {
  if (pct === null || pct === undefined) return { ausente: true }

  const n = Number(pct)
  if (!Number.isFinite(n)) {
    return { ausente: false, error: `fator de redução não numérico: ${String(pct)}` }
  }
  if (n < IVA_DUAL_REDUCTION_MIN_PCT || n > IVA_DUAL_REDUCTION_MAX_PCT) {
    return {
      ausente: false,
      error: `fator de redução fora da faixa [${IVA_DUAL_REDUCTION_MIN_PCT}, ${IVA_DUAL_REDUCTION_MAX_PCT}]: ${n}`,
    }
  }

  return { ausente: false, fraction: n / 100 }
}
