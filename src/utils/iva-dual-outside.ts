/**
 * iva-dual-outside.ts — Fonte única da tributação "POR FORA" (Reforma Tributária / IVA Dual).
 *
 * Implementa as bases de cálculo individualizadas do documento "Bases de Cálculo dos
 * Tributos Por Fora — Conferência Fiscal" (PrecificaCerto, 2026-06-05), aderente à
 * LC 214/2025 (IBS/CBS/IS), RIPI Decreto 7.212/2010 (IPI) e LC 87/1996 (ICMS Compl.).
 *
 * Princípio: a Operação Interna ("por dentro") e a Operação Externa ("por fora") são
 * estruturas INDEPENDENTES. Cada tributo possui base inviolável e individualizada; as
 * Despesas Acessórias (frete + seguro + despesas acessórias cobradas do adquirente) NÃO
 * integram a Operação Interna nem sofrem dedução de ICMS/PIS/ISS — entram apenas nas bases
 * em que a legislação as inclui.
 *
 * Hierarquia das bases (documento, seções 1–6):
 *   OpDentro = Operação Interna (preço "por dentro", com ICMS/ISS/PIS-COFINS embutidos),
 *              SEM Despesas Acessórias.
 *
 *   IS          → base = OpDentro − ICMS − PIS/COFINS − ISS                (sem Desp. Acessórias)
 *   IBS / CBS   → base = (OpDentro − ICMS − PIS/COFINS − ISS) + IS + Desp. Acessórias
 *   IPI         → base = OpDentro + Desp. Acessórias                       (NÃO deduz ICMS)
 *   ICMS Compl. → base = (IPI + Desp. Acessórias) × alíq. ICMS             (condicional)
 *
 * O ICMS Complementar (LC 87/1996, art. 13, §1º, II) só é devido quando o destinatário for
 * consumidor final NÃO contribuinte do ICMS — ativado via `icmsComplApplies`.
 *
 *   Operação Externa = IS + IBS + CBS + IPI + ICMS Complementar
 *   Preço Final      = OpDentro + Desp. Acessórias + Operação Externa
 *
 * Convenção: todas as alíquotas de ENTRADA são em base 100 (ex.: 17 = 17%).
 */

export interface IvaDualInput {
  /** Operação Interna — preço de venda "por dentro" (ICMS/ISS/PIS-COFINS embutidos), SEM Desp. Acessórias. */
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
   * Despesas Acessórias cobradas do adquirente (frete + seguro + despesas acessórias).
   * Compõem a base de IBS/CBS, a base do IPI e a base do ICMS Complementar — NÃO compõem
   * a base do IS nem sofrem dedução de ICMS/PIS/ISS.
   */
  despAcessorias?: number
  /**
   * Ativa o cálculo do ICMS Complementar (LC 87/1996, art. 13, §1º, II). Só deve ser TRUE
   * quando o destinatário for consumidor final NÃO contribuinte do ICMS — informação que só
   * existe em orçamento/pedido/venda (customers.is_icms_contributor === false).
   */
  icmsComplApplies?: boolean
  /**
   * Base fiscal do IPI. Quando omitida, usa `OpDentro + Desp. Acessórias` (RIPI art. 190).
   */
  ipiBase?: number
}

export interface IvaDualResult {
  /** Base do IS = OpDentro − ICMS − ISS − PIS/COFINS (também base econômica de IBS/CBS antes do IS e das despesas). */
  baseIVA: number
  /** Base de IBS/CBS = Base IS + IS + Desp. Acessórias. */
  baseIbsCbs: number
  /** Base fiscal do IPI = OpDentro + Desp. Acessórias (ou `ipiBase` explícito). */
  ipiBase: number
  /** Base do ICMS Complementar = IPI + Desp. Acessórias. */
  icmsComplBase: number
  /** Despesas Acessórias consideradas (frete + seguro + despesas acessórias). */
  despAcessorias: number
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
  /** Valor do ICMS Complementar (0 quando `icmsComplApplies` é falso). */
  icmsComplValue: number
  /** Operação Externa = IS + IBS + CBS + IPI + ICMS Complementar. */
  totalOutside: number
  /** Preço Final = OpDentro + Desp. Acessórias + Operação Externa. */
  finalPrice: number
}

function pct(v: number | undefined | null): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n / 100 : 0
}

function val(v: number | undefined | null): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Calcula a tributação "por fora" (IVA Dual) sobre uma operação interna, conforme as bases
 * individualizadas do documento de Conferência Fiscal.
 *
 * Reaproveita os valores de ICMS/ISS/PIS-COFINS já apurados na operação por dentro
 * (= OpDentro × alíquota), removendo-os para encontrar a base do IS — SEM gross-up.
 */
export function computeIvaDualOutside(input: IvaDualInput): IvaDualResult {
  const op = val(input.opInterna)
  const despAcessorias = val(input.despAcessorias)

  // Base do IS: remover ICMS, ISS, PIS/COFINS já apurados na operação por dentro.
  // (As Despesas Acessórias NÃO entram aqui — base mais enxuta, só receita líquida.)
  const icmsValue = op * pct(input.icmsPct)
  const issValue = op * pct(input.issPct)
  const pisCofinsValue = op * pct(input.pisCofinsPct)
  const baseIVA = Math.max(0, op - icmsValue - issValue - pisCofinsValue)

  // IS sobre a base econômica do IS.
  const isValue = baseIVA * pct(input.isPct)

  // Base de IBS/CBS: base do IS + IS + Despesas Acessórias.
  const baseIbsCbs = baseIVA + isValue + despAcessorias
  const ibsValue = baseIbsCbs * pct(input.ibsPct)
  const cbsValue = baseIbsCbs * pct(input.cbsPct)

  // IPI: preço cheio com ICMS embutido + Despesas Acessórias (RIPI, não deduz ICMS).
  const ipiBase = input.ipiBase != null ? val(input.ipiBase) : op + despAcessorias
  const ipiValue = ipiBase * pct(input.ipiPct)

  // ICMS Complementar: (IPI + Despesas Acessórias) × alíq. ICMS — só consumidor final
  // NÃO contribuinte (LC 87/1996, art. 13, §1º, II).
  const icmsComplBase = ipiValue + despAcessorias
  const icmsComplValue = input.icmsComplApplies ? icmsComplBase * pct(input.icmsPct) : 0

  // Operação externa e preço final.
  const totalOutside = isValue + ibsValue + cbsValue + ipiValue + icmsComplValue
  const finalPrice = op + despAcessorias + totalOutside

  return {
    baseIVA,
    baseIbsCbs,
    ipiBase,
    icmsComplBase,
    despAcessorias,
    icmsValue,
    issValue,
    pisCofinsValue,
    isValue,
    ibsValue,
    cbsValue,
    ipiValue,
    icmsComplValue,
    totalOutside,
    finalPrice,
  }
}
