/**
 * Motor de Reapuração de Margem (MRM) — Núcleo (cliente-only, D3).
 *
 * Implementa o fluxo de 13 etapas da spec V5 (PDF Motor RR Seção 10):
 *   1.  Receber RB (Receita Bruta original)
 *   2.  Aplicar desconto: RV = RB - DESC
 *   3.  Confirmar RV como nova receita pós-desconto
 *   4.  Aplicar Peso Operação Interna (V5): ancora_interna = RV × peso_op_interna
 *   5.  Reapurar impostos por dentro sobre Âncora (V5 — antes era RV):
 *         ICMS = Âncora × aliq_ICMS
 *         ISS  = Âncora × aliq_ISS
 *         PIS/COFINS = (Âncora − ICMS − ISS) × aliq_PISCOFINS  (V4 / STF)
 *   6.  Remover custos líquidos (CP)
 *   7.  Remover despesas operacionais (MOD + DOP) — MOD imune (R6)
 *   8.  RRO = Âncora − IMP − CP − MOD − DOP; se RRO ≤ 0 → status RRO_ZERO/NEGATIVE
 *   9.  Redistribuir 4 componentes (Com+Lucro+CSLL+IRPJ) PROPORCIONALMENTE sobre RRO
 *  10. Recalcular tributos POR FORA (IPI, ICMS_ST, DIFAL, FCP, IBS, CBS, ISS_RETIDO)
 *      Nota: base canônica `ancora − ICMS − PIS/COFINS` é STORY-002 (fora deste escopo).
 *      Esta story preserva base V4 (`rv - imp_total`) para retrocompat.
 *  11. ValorFinal = BaseOperacional + TributosPorFora
 *  12. Materializar cascade_trace (13 etapas — Story MRM-V5-001 AC4)
 *  13. Validar V1-V6
 *
 * Versão V5 (Story MRM-V5-001):
 *   - Recebe `input.peso_op_interna` (default 1 — comportamento V4 equivalente).
 *   - Calcula `ancora_interna = rv × peso_op_interna` (PÓS desconto, Excel H36).
 *   - Impostos por dentro reapurados sobre Âncora (não mais sobre RV).
 *   - Quando peso=1, Âncora ≡ RV → comportamento numérico idêntico ao V4.
 *
 * Validações:
 *   V1: RRO ≥ 0
 *   V2: ValorFinal = Base + Tributos (consistência fiscal)
 *   V3: PesoComissao + PesoLucro + PesoCSLL + PesoIRPJ = 1
 *   V4: NovaComissao + NovoLucro + NovoCSLL + NovoIRPJ = RRO
 *   V5: RV < RB (quando desconto > 0)
 *   V6: IMP calculado sobre Âncora (não RB)
 *
 * Diretrizes:
 *   R5: Quando RRO ≤ 0, motor retorna status mas NÃO altera valores — UI orienta usuário.
 *   R6: MOD (mão de obra direta) imune sem exceções.
 *
 * Esta é uma FUNÇÃO PURA. Não faz I/O. Não calcula markup divisor (responsabilidade
 * do orchestrator — ADR-004). Alíquotas e peso_op_interna são passados via input.
 *
 * Refs:
 *   - PDF Motor RR Seção 10 (memória cascata 13 etapas)
 *   - PRD v1.1 STORY-MRM-V5-001 (docs/prd/EPIC-MRM-V5-AJUSTES.md)
 *   - ARCH v2.0 §1.L1, §1.L2, §1.L3 (docs/architecture/ARCH-EPIC-MRM-V5.md)
 *   - Excel canônico: células H35 (RV), H36 (Âncora), H41 (ICMS), H43 (PIS/COFINS), H54 (RRO)
 */

import {
  MRM_ENGINE_VERSION,
  MRM_ERROR_RRO_NON_POSITIVE,
  TAXES_INSIDE,
  TAXES_OUTSIDE,
  type CascadeStep,
  type ReapurationInput,
  type ReapurationStatus,
  type TaxBreakdown,
  type TaxLine,
  type TaxRatePeriod,
  type TaxType,
  type ValidationMap,
} from '@/types/mrm'

const EPSILON = 0.01

function approxEqual(a: number, b: number, tol = EPSILON): boolean {
  return Math.abs(a - b) <= tol
}

function findRate(rates: TaxRatePeriod[], type: TaxType): number {
  const match = rates.find((r) => r.tax_type === type)
  return match ? Number(match.rate_pct) || 0 : 0
}

/**
 * Etapa 5 da spec: reapurar impostos por dentro (motor RR V5).
 *
 * Convenção V5 (Story MRM-V5-001) — base é a Âncora Interna (PÓS desconto):
 *   - ICMS = Âncora × aliq_ICMS
 *   - ISS  = Âncora × aliq_ISS
 *   - PIS/COFINS = (Âncora − ValorICMS − ValorISS) × aliq_PISCOFINS  (V4 / STF)
 *
 * Mudança vs V4: base agora é `ancora_interna` (= rv × peso_op_interna), não `rv` direto.
 * Quando `peso_op_interna = 1` (default), Âncora ≡ RV → comportamento numérico
 * idêntico ao V4. Quando peso < 1, impostos por dentro reduzem proporcionalmente
 * (refletindo que parte da venda é op externa — IBS/CBS/IPI/etc).
 *
 * Excel canônico (cenário RB=190.055,94, desc=10%, peso=0,931585):
 *   Âncora = 159.342,38 (H36)
 *   ICMS   = 159.342,38 × 17%  = R$ 27.088,20 (H41)
 *   PIS/COFINS = (159.342,38 − 27.088,20) × 7,6775% = R$ 10.155,82 (V4 fórmula)
 *
 * Nota STORY-002.AC5/ADR-008: a fórmula PIS/COFINS apuração `(Âncora − ICMS) × 9,25%`
 * é introduzida em STORY-002 (fora deste escopo). Esta story preserva V4 (7,6775%).
 *
 * Jurisprudência preservada (STF RE 574.706): ICMS e ISS NÃO compõem base do PIS/COFINS.
 */
function computeTaxesInside(
  ancora: number,
  rates: TaxRatePeriod[],
): { lines: TaxLine[]; total: number } {
  const lines: TaxLine[] = []

  // 1) ICMS e ISS sobre Âncora (V5)
  const icmsRate = findRate(rates, 'ICMS')
  const issRate = findRate(rates, 'ISS')
  const icmsAmount = icmsRate > 0 ? ancora * icmsRate : 0
  const issAmount = issRate > 0 ? ancora * issRate : 0

  if (icmsRate > 0) {
    lines.push({ type: 'ICMS', rate_pct: icmsRate, base: ancora, amount: icmsAmount })
  }
  if (issRate > 0) {
    lines.push({ type: 'ISS', rate_pct: issRate, base: ancora, amount: issAmount })
  }

  // 2) PIS e COFINS sobre base reduzida = Âncora − ICMS − ISS (V4 / STF)
  const baseReduzida = ancora - icmsAmount - issAmount
  const pisRate = findRate(rates, 'PIS')
  const cofinsRate = findRate(rates, 'COFINS')

  if (pisRate > 0) {
    const pisAmount = baseReduzida * pisRate
    lines.push({ type: 'PIS', rate_pct: pisRate, base: baseReduzida, amount: pisAmount })
  }
  if (cofinsRate > 0) {
    const cofinsAmount = baseReduzida * cofinsRate
    lines.push({ type: 'COFINS', rate_pct: cofinsRate, base: baseReduzida, amount: cofinsAmount })
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  return { lines, total }
}

/**
 * Limite Mínimo Operacional (Seção 4.5 do Relatório Consolidado).
 *
 * Receita mínima abaixo da qual a operação fica sem margem residual positiva.
 * Permite à UI sugerir o desconto máximo permitido (R5 — orientação ao usuário).
 *
 *   LimiteMinimo = (CP + MOD + DOP) / (1 − Σ alíquotas internas)
 *
 * Retorna `null` quando a soma das alíquotas internas for ≥ 1 (denominador
 * não-positivo, situação degenerada que indica configuração tributária inválida).
 */
function computeLimiteMinimo(
  cp: number,
  mod: number,
  dop: number,
  rates: TaxRatePeriod[],
): number | null {
  const sumInside = TAXES_INSIDE.reduce((acc, type) => acc + findRate(rates, type), 0)
  const denom = 1 - sumInside
  if (denom <= 0) return null
  return (cp + mod + dop) / denom
}

/**
 * Etapa 9 da spec: recalcular tributos por fora sobre nova base operacional.
 * Não é sequencial: cada tributo incide independentemente sobre a base.
 */
function computeTaxesOutside(baseOperacional: number, rates: TaxRatePeriod[]): TaxLine[] {
  const lines: TaxLine[] = []
  for (const type of TAXES_OUTSIDE) {
    const rate = findRate(rates, type)
    if (rate <= 0) continue
    const amount = baseOperacional * rate
    lines.push({ type, rate_pct: rate, base: baseOperacional, amount })
  }
  return lines
}

export function calculateMarginReapuration(input: ReapurationInput): TaxBreakdown {
  const {
    rb,
    desc_value,
    regime,
    rates,
    cp,
    mod,
    dop,
    commission_pct,
    profit_pct,
    csll_pct,
    irpj_pct,
    peso_op_interna: peso_input,
    effective_date,
    use_snapshot_rates,
  } = input

  // Q5 (Story S1.1): Guard defensivo — Simples Nacional/MEI não rateiam CSLL/IRPJ.
  // Mesmo se caller passar valor > 0, forçamos a zero e emitimos warn estruturado.
  const csll_pct_input = csll_pct ?? 0
  const irpj_pct_input = irpj_pct ?? 0
  const regime_blocks_csll_irpj = regime === 'MEI' || regime === 'SIMPLES_NACIONAL'
  const csll_pct_effective = regime_blocks_csll_irpj ? 0 : csll_pct_input
  const irpj_pct_effective = regime_blocks_csll_irpj ? 0 : irpj_pct_input

  if (regime_blocks_csll_irpj && (csll_pct_input > 0 || irpj_pct_input > 0)) {
    // ADR-004: motor é puro, mas console.warn não é I/O — apenas diagnóstico opcional.
    // Permitido por AC8 da Story S1.1 ("apenas console.warn do guard Q5 é permitido").
    // eslint-disable-next-line no-console
    console.warn('[MRM] CSLL/IRPJ forced to 0 for regime', {
      regime,
      attempted_csll: csll_pct_input,
      attempted_irpj: irpj_pct_input,
    })
  }

  // Etapa 2-3: RV pós-desconto
  const rv = rb - desc_value

  // Etapa 4 (V5 NOVO): aplicar Peso Operação Interna sobre RV → Âncora Interna
  // Story MRM-V5-001 AC2 + AC3 + AC9. Default = 1 (comportamento V4 equivalente).
  // Peso vem do orchestrator (3 fontes: snapshot → markup divisor → default 1).
  // Clamp em [0, 1] para defender contra inputs inválidos sem alterar pureza do motor.
  const peso_op_interna = Math.max(0, Math.min(1, peso_input ?? 1))
  const peso_op_externa = 1 - peso_op_interna
  const ancora_interna = rv * peso_op_interna

  // Etapa 5 (V5): impostos por dentro reapurados sobre Âncora (não mais RV).
  // Quando peso=1, ancora=rv → comportamento numérico idêntico ao V4.
  const inside = computeTaxesInside(ancora_interna, rates)
  const imp_total = inside.total

  // Limite mínimo operacional (Seção 4.5) — para orientar UI quando RRO ≤ 0
  const limite_minimo = computeLimiteMinimo(cp, mod, dop, rates)

  // Etapas 6-8 (V5): RRO = Âncora − IMP − CP − MOD − DOP
  // R6: MOD imune — subtraído junto com CP/DOP, nunca alterado.
  // Quando peso=1, ancora=rv → RRO equivalente ao V4.
  const rro = ancora_interna - imp_total - cp - mod - dop

  // Validações
  // V1 (Tabela 25 da spec): RRO > 0 estrito. RRO = 0 também bloqueia ("Se RRO < 0 ou RRO = 0: bloquear").
  const v1 = rro > 0
  const v5 = desc_value <= 0 ? true : rv < rb
  const v6 = true // Por construção: computeTaxesInside usa RV, nunca RB.

  // Etapa 8: Redistribuição proporcional 4 componentes (R2 + Story S1.1)
  // combined_pct = profit + commission + csll + irpj
  const combined_pct = commission_pct + profit_pct + csll_pct_effective + irpj_pct_effective
  const peso_comm = combined_pct > 0 ? commission_pct / combined_pct : 0
  const peso_lucro = combined_pct > 0 ? profit_pct / combined_pct : 0
  const peso_csll = combined_pct > 0 ? csll_pct_effective / combined_pct : 0
  const peso_irpj = combined_pct > 0 ? irpj_pct_effective / combined_pct : 0
  const v3 = combined_pct === 0
    ? true
    : approxEqual(peso_comm + peso_lucro + peso_csll + peso_irpj, 1, 1e-9)

  // Se RRO < 0, ainda calculamos os valores (R5: motor não força, UI orienta)
  const rro_distrib = Math.max(0, rro)
  let new_commission = rro_distrib * peso_comm
  let new_profit = rro_distrib * peso_lucro
  let new_csll = rro_distrib * peso_csll
  let new_irpj = rro_distrib * peso_irpj

  // V4 / S18 — ajuste de arredondamento absorvido pelo MAIOR componente (Q2=Sim).
  // Garante soma exata `commission + profit + csll + irpj === RRO` sem
  // depender de tolerância epsilon. Preferência é lucro (segue V4 HTML), mas
  // se profit_pct=0 (lucro ausente) o ajuste vai para o maior componente
  // disponível — preserva semântica de "componente zerado fica zerado".
  //
  // Guard: combined_pct=0 significa nenhum componente para receber rateio —
  // não aplicar ajuste (todos new_* permanecem 0 e RRO "fica órfão", mas a
  // validação V4 considera esse caso especial via `combined_pct === 0`).
  if (rro_distrib > 0 && combined_pct > 0) {
    const sumWithoutAdjust = new_commission + new_profit + new_csll + new_irpj
    const diff = rro_distrib - sumWithoutAdjust
    if (Math.abs(diff) > 0) {
      // Escolhe maior componente NÃO-ZERO; default = lucro (V4)
      const candidates: Array<['profit' | 'commission' | 'csll' | 'irpj', number]> = [
        ['profit', new_profit],
        ['commission', new_commission],
        ['csll', new_csll],
        ['irpj', new_irpj],
      ]
      const [largest] = candidates.reduce((acc, cur) => cur[1] > acc[1] ? cur : acc, candidates[0])
      if (largest === 'profit') new_profit += diff
      else if (largest === 'commission') new_commission += diff
      else if (largest === 'csll') new_csll += diff
      else new_irpj += diff
    }
  }

  // V4 com 4 componentes + epsilon dinâmico (AC5: epsilon = max(0.01, rro * 1e-6))
  const v4_epsilon = Math.max(EPSILON, rro_distrib * 1e-6)
  const v4 = combined_pct === 0
    ? new_commission + new_profit + new_csll + new_irpj === 0
    : approxEqual(new_commission + new_profit + new_csll + new_irpj, rro_distrib, v4_epsilon)

  // Etapa 9: Tributos por fora sobre nova base operacional (RV - impostos por dentro)
  const baseOperacional = rv - imp_total
  const taxes_outside = computeTaxesOutside(baseOperacional, rates)
  const taxes_outside_total = taxes_outside.reduce((sum, l) => sum + l.amount, 0)

  // Etapa 10: ValorFinal = BaseOperacionalDescontada + TributosPorFora
  const valor_final = baseOperacional + taxes_outside_total
  const v2 = approxEqual(valor_final, baseOperacional + taxes_outside_total, 1e-9)

  const validations: ValidationMap = { V1: v1, V2: v2, V3: v3, V4: v4, V5: v5, V6: v6 }
  const allValid = v1 && v2 && v3 && v4 && v5 && v6

  let status: ReapurationStatus
  let error_code: string | null = null
  const messages: string[] = []

  if (!v1) {
    status = rro === 0 ? 'RRO_ZERO' : 'RRO_NEGATIVE'
    error_code = 'RRO_NON_POSITIVE'
    messages.push(MRM_ERROR_RRO_NON_POSITIVE)
  } else if (!allValid) {
    status = 'ERROR'
    error_code = 'VALIDATION_FAILED'
    const failed = (Object.entries(validations) as [keyof ValidationMap, boolean][])
      .filter(([, ok]) => !ok)
      .map(([id]) => id)
    messages.push(`Validações falharam: ${failed.join(', ')}`)
  } else {
    status = 'VALID'
  }

  // Etapa 12 (V5): materializar memória cascata 13 etapas (PDF Motor RR Seção 10).
  // Story MRM-V5-001 AC4. Trace é "human-readable" do que o motor já computou —
  // não recalcula valores, apenas etiqueta e ordena para exibição/auditoria.
  const cascade_trace = buildCascadeTrace({
    rb,
    desc_value,
    rv,
    peso_op_interna,
    ancora_interna,
    inside_lines: inside.lines,
    cp,
    mod,
    dop,
    rro,
    new_commission,
    new_profit,
    new_csll,
    new_irpj,
    taxes_outside,
  })

  return {
    engine_version: MRM_ENGINE_VERSION,
    effective_date,
    regime,
    use_snapshot_rates,
    taxes_inside: inside.lines,
    taxes_outside,
    rb,
    desc_value,
    rv,
    cp,
    mod,
    dop,
    imp_total,
    rro,
    limite_minimo,
    peso_op_interna,
    peso_op_externa,
    ancora_interna,
    cascade_trace,
    new_commission,
    new_profit,
    new_csll,
    new_irpj,
    validations,
    valid: allValid,
    status,
    error_code,
    messages,
  }
}

/**
 * Constrói memória cascata 13 etapas conforme PDF Motor RR Seção 10.
 *
 * Ordem fixa, mesmo quando uma etapa tem amount=0 (e.g. ISS=0 em produto):
 * o step é registrado com value=0 e formula='N/A' — preserva ordem.
 *
 * Story MRM-V5-001 AC4.
 */
function buildCascadeTrace(args: {
  rb: number
  desc_value: number
  rv: number
  peso_op_interna: number
  ancora_interna: number
  inside_lines: TaxLine[]
  cp: number
  mod: number
  dop: number
  rro: number
  new_commission: number
  new_profit: number
  new_csll: number
  new_irpj: number
  taxes_outside: TaxLine[]
}): CascadeStep[] {
  const findInside = (type: TaxType): TaxLine | undefined =>
    args.inside_lines.find((l) => l.type === type)

  const icmsLine = findInside('ICMS')
  const issLine = findInside('ISS')
  const pisLine = findInside('PIS')
  const cofinsLine = findInside('COFINS')
  const pisCofinsAmount = (pisLine?.amount ?? 0) + (cofinsLine?.amount ?? 0)
  const pisCofinsRate = (pisLine?.rate_pct ?? 0) + (cofinsLine?.rate_pct ?? 0)
  const pisCofinsBase = pisLine?.base ?? cofinsLine?.base ?? null

  const despesas_total = args.mod + args.dop
  const rateio_total = args.new_commission + args.new_profit + args.new_csll + args.new_irpj
  const taxes_outside_total = args.taxes_outside.reduce((sum, l) => sum + l.amount, 0)

  return [
    {
      step: 1,
      label: 'Receita Bruta',
      base: null,
      rate: null,
      amount: args.rb,
      formula: 'RB (input)',
      source: 'INPUT',
    },
    {
      step: 2,
      label: 'Desconto aplicado',
      base: args.rb,
      rate: args.rb > 0 ? args.desc_value / args.rb : null,
      amount: -args.desc_value,
      formula: 'RB × desconto%',
      source: 'INPUT',
    },
    {
      step: 3,
      label: 'Receita pós-desconto (RV)',
      base: null,
      rate: null,
      amount: args.rv,
      formula: 'RB − Desconto',
      source: 'ETAPA_2',
    },
    {
      step: 4,
      label: 'Aplicação do Peso Operação Interna',
      base: args.rv,
      rate: args.peso_op_interna,
      amount: args.ancora_interna,
      formula: 'RV × peso_op_interna',
      source: 'ETAPA_3+PRODUTO',
    },
    {
      step: 5,
      label: 'Âncora Interna',
      base: null,
      rate: null,
      amount: args.ancora_interna,
      formula: 'RV × peso_op_interna',
      source: 'ETAPA_4',
    },
    {
      step: 6,
      label: 'Reapuração ICMS',
      base: icmsLine?.base ?? args.ancora_interna,
      rate: icmsLine?.rate_pct ?? null,
      amount: icmsLine ? -icmsLine.amount : 0,
      formula: icmsLine ? 'Âncora × ICMS%' : 'N/A',
      source: 'ETAPA_5',
    },
    {
      step: 7,
      label: 'Reapuração ISS',
      base: issLine?.base ?? args.ancora_interna,
      rate: issLine?.rate_pct ?? null,
      amount: issLine ? -issLine.amount : 0,
      formula: issLine ? 'Âncora × ISS%' : 'N/A',
      source: 'ETAPA_5',
    },
    {
      step: 8,
      label: 'Reapuração PIS/COFINS',
      base: pisCofinsBase,
      rate: pisCofinsRate > 0 ? pisCofinsRate : null,
      amount: -pisCofinsAmount,
      formula: pisCofinsAmount > 0 ? '(Âncora − ICMS − ISS) × PIS/COFINS%' : 'N/A',
      source: 'ETAPA_5',
    },
    {
      step: 9,
      label: 'Redução de custos',
      base: null,
      rate: null,
      amount: -args.cp,
      formula: 'CP (input)',
      source: 'INPUT',
    },
    {
      step: 10,
      label: 'Redução de despesas (MOD + DOP)',
      base: null,
      rate: null,
      amount: -despesas_total,
      formula: 'MOD + DOP',
      source: 'INPUT',
    },
    {
      step: 11,
      label: 'Resultado Residual Operacional (RRO)',
      base: null,
      rate: null,
      amount: args.rro,
      formula: 'Âncora − IMP − CP − MOD − DOP',
      source: 'ETAPA_8',
    },
    {
      step: 12,
      label: 'Redistribuição proporcional (Comissão + Lucro + CSLL + IRPJ)',
      base: args.rro,
      rate: null,
      amount: rateio_total,
      formula: 'RRO × pesos_componentes',
      source: 'ETAPA_9',
    },
    {
      step: 13,
      label: 'Reapuração tributos por fora (recomposição final)',
      base: args.taxes_outside[0]?.base ?? null,
      rate: null,
      amount: taxes_outside_total,
      formula: taxes_outside_total > 0 ? 'Base × Σ(IBS+CBS+IPI+...)' : 'N/A',
      source: 'ETAPA_10',
    },
  ]
}

/**
 * Helper para callers UI: retorna apenas a mensagem orientativa quando aplicável (R5).
 * Sem RRO_ZERO/NEGATIVE não há mensagem.
 */
export function getOrientationMessage(breakdown: TaxBreakdown): string | null {
  if (breakdown.status === 'RRO_ZERO' || breakdown.status === 'RRO_NEGATIVE') {
    return MRM_ERROR_RRO_NON_POSITIVE
  }
  return null
}
