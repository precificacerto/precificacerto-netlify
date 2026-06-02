/**
 * iva-dual-outside.ts — Fonte única da tributação "POR FORA" (Reforma Tributária / IVA Dual).
 *
 * Implementa a hierarquia oficial do "Relatório de Formação de Preço com Tributação
 * Por Fora — Modelo Reforma Tributária / IVA Dual" (PrecificaCerto, 2026-06-02).
 *
 * Princípio: a Operação Interna ("por dentro") e a Operação Externa ("por fora") são
 * estruturas INDEPENDENTES. Os tributos da Reforma (IBS, CBS, IS, IPI) NÃO participam
 * de markup, margem, lucro, comissão, RRO nem ponto de equilíbrio — são apenas somados
 * ao preço final como tributação destacada.
 *
 * Hierarquia (Etapas 2 → 10 do PDF):
 *   2-3) Base Econômica IVA = Operação Interna − ICMS − ISS − PIS/COFINS
 *        (remove os tributos substituídos pela Reforma — valores JÁ apurados na
 *         operação por dentro, SEM novo gross-up — decisão Founder 2026-06-02)
 *   4)   IS  = Base Econômica IVA × Alíquota IS   (quando houver Imposto Seletivo)
 *   5)   Base IBS/CBS = Base Econômica IVA + IS   (IS compõe a base de IBS e CBS)
 *   6)   IBS = Base IBS/CBS × Alíquota IBS
 *   7)   CBS = Base IBS/CBS × Alíquota CBS
 *   8)   IPI = Base Fiscal IPI × Alíquota IPI     (destacado; NÃO integra base IBS/CBS)
 *   9)   Operação Externa = IBS + CBS + IS + IPI
 *   10)  Preço Final = Operação Interna + Operação Externa
 *
 * Convenção: todas as alíquotas de ENTRADA são em base 100 (ex.: 17 = 17%).
 */

export interface IvaDualInput {
  /** Operação Interna — preço de venda "por dentro" (ICMS/ISS/PIS-COFINS embutidos). */
  opInterna: number
  /** Alíquota ICMS (base 100). Já embutida na operação interna. */
  icmsPct?: number
  /** Alíquota ISS (base 100). Já embutida na operação interna. */
  issPct?: number
  /** Alíquota PIS/COFINS agregada (base 100). Já embutida na operação interna. */
  pisCofinsPct?: number
  /** Alíquota Imposto Seletivo (base 100). */
  isPct?: number
  /** Alíquota IBS (base 100). */
  ibsPct?: number
  /** Alíquota CBS (base 100). */
  cbsPct?: number
  /** Alíquota IPI (base 100). */
  ipiPct?: number
  /**
   * Base fiscal do IPI. Quando omitida, usa a própria Operação Interna (comportamento
   * padrão do módulo). O PDF define o IPI sobre a "Base Fiscal do IPI".
   */
  ipiBase?: number
}

export interface IvaDualResult {
  /** Base Econômica IVA = Op.Interna − ICMS − ISS − PIS/COFINS. */
  baseIVA: number
  /** Base de IBS/CBS = Base Econômica IVA + IS. */
  baseIbsCbs: number
  /** Valor ICMS removido da operação interna (apuração por dentro). */
  icmsValue: number
  /** Valor ISS removido da operação interna. */
  issValue: number
  /** Valor PIS/COFINS removido da operação interna. */
  pisCofinsValue: number
  /** Valor do Imposto Seletivo. */
  isValue: number
  /** Valor do IBS. */
  ibsValue: number
  /** Valor do CBS. */
  cbsValue: number
  /** Valor do IPI. */
  ipiValue: number
  /** Operação Externa = IS + IBS + CBS + IPI. */
  totalOutside: number
  /** Preço Final = Operação Interna + Operação Externa. */
  finalPrice: number
}

function pct(v: number | undefined | null): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n / 100 : 0
}

/**
 * Calcula a tributação "por fora" (IVA Dual) sobre uma operação interna.
 *
 * Reaproveita os valores de ICMS/ISS/PIS-COFINS já apurados na operação por dentro
 * (= operaçãoInterna × alíquota), removendo-os diretamente para encontrar a Base
 * Econômica IVA — sem qualquer gross-up adicional.
 */
export function computeIvaDualOutside(input: IvaDualInput): IvaDualResult {
  const op = Number(input.opInterna) || 0

  // Etapas 2-3: remover ICMS, ISS, PIS/COFINS já apurados na operação por dentro.
  const icmsValue = op * pct(input.icmsPct)
  const issValue = op * pct(input.issPct)
  const pisCofinsValue = op * pct(input.pisCofinsPct)
  const baseIVA = Math.max(0, op - icmsValue - issValue - pisCofinsValue)

  // Etapa 4: Imposto Seletivo sobre a Base Econômica IVA.
  const isValue = baseIVA * pct(input.isPct)

  // Etapa 5: o IS compõe a base de IBS e CBS.
  const baseIbsCbs = baseIVA + isValue

  // Etapas 6-7: IBS e CBS sobre a base com IS incorporado.
  const ibsValue = baseIbsCbs * pct(input.ibsPct)
  const cbsValue = baseIbsCbs * pct(input.cbsPct)

  // Etapa 8: IPI sobre a base fiscal do IPI (default = operação interna).
  const ipiBase = input.ipiBase != null ? Number(input.ipiBase) || 0 : op
  const ipiValue = ipiBase * pct(input.ipiPct)

  // Etapas 9-10: operação externa e preço final.
  const totalOutside = isValue + ibsValue + cbsValue + ipiValue
  const finalPrice = op + totalOutside

  return {
    baseIVA,
    baseIbsCbs,
    icmsValue,
    issValue,
    pisCofinsValue,
    isValue,
    ibsValue,
    cbsValue,
    ipiValue,
    totalOutside,
    finalPrice,
  }
}
