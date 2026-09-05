/**
 * Motor de Reapuração de Margem (MRM) — Tipos compartilhados
 *
 * Spec: Motor_Reapuracao_Margem_Precifica_Certo.docx (v1.0, 18/05/2026)
 * Diretrizes oficiais (R1-R6):
 *   R1: Reforma tributária gradual (ICMS/PIS/COFINS/ISS → IBS/CBS em 2027)
 *   R2: Modos PROFIT_REDUCTION e SELLER_REDUCTION descontinuados
 *   R3: Reapuração para TODOS os regimes (MEI, SN, LP, LR)
 *   R4: Roda em orçamento, pedido E venda
 *   R5: Se RRO ≤ 0, orienta usuário (não força valor)
 *   R6: MOD imune SEM EXCEÇÕES
 */

/**
 * Engine version (MAJOR.MINOR.PATCH — semver).
 *
 * Bump MINOR quando adiciona campos opcionais retrocompatíveis no schema.
 * Bump MAJOR somente quando remove ou altera campos existentes de forma quebradora.
 *
 * - 2.0.0: rateio 2 componentes (commission + profit) — V1 spec
 * - 2.1.0: rateio 4 componentes (commission + profit + CSLL + IRPJ) — V2 spec item 13
 *           Adiciona new_csll/new_irpj em TaxBreakdown (campos novos, callers
 *           legados continuam funcionando). Story MRM-V2-S1.1, ADR-002.
 * - 2.2.0: peso_op_interna / ancora_interna / cascade_trace 13 etapas — V5 (Epic MRM-V5).
 *           Adiciona campos opcionais retrocompatíveis no TaxBreakdown e
 *           ReapurationInput. Snapshots V4 (engine_version='2.1.0') continuam
 *           válidos (ADR-003 imutabilidade). Story MRM-V5-001, ADR-002.
 * - 2.3.0: discount_mode na Etapa 9 (rateio do RRO) — V6 (Epic MRM-V6, ADR-009).
 *           Reverte R2 da spec V2: 3 modos (PROPORTIONAL/SELLER/PROFIT) voltam
 *           a estar disponíveis. Campo opcional retrocompatível — snapshots V5
 *           sem discount_mode lidos como PROPORTIONAL. Invariante tributária
 *           bit-exact preservada (Etapas 1-8 invariantes nos 3 modos).
 * - 2.4.0: cascade_trace sequencial + alinhamento Motor RR ↔ DRE Consolidada V8.8
 *           — V9 (Epic MRM-V9, ADR-010). Steps 6-11 propagam base etapa-a-etapa
 *           (base[N] = base[N-1] − abs(amount[N-1])). MOD=0 invariante (V9 D1)
 *           alinhada com V8.8. RRO matemático inalterado — apenas visualização e
 *           contrato de cp (CMV canônico = cost_total + productive_labor_unit)
 *           mudam. Snapshots V5/V6 (2.2.0/2.3.0) preservados via ADR-003.
 * - 2.5.0: cascade granular com sub-itens (children) — V10 (Epic MRM-V10, ADR-011).
 *           CascadeStep ganha `children?: CascadeStep[]` + `peso?: number | null`.
 *           Steps 10/12/13 emitem sub-itens (4 buckets despesa / 4 redistribuição /
 *           N tributos por fora). Fix V10 D1: buildMotorInput remove mod_pct do
 *           dopRate (MO Produtiva já está no CMV). Snapshots V9 (2.4.0) sem
 *           children continuam renderizando — graceful degradation.
 * - 2.6.0: PIS/COFINS apuração via fórmula `construção / (1 − ICMS)` — V12
 *           (Epic MRM-V12, ADR-013). computeTaxesInside passa a aplicar alíquota
 *           apuração sobre `(Âncora − ICMS)` (ISS NÃO subtrai). Cenário Hyago:
 *           7,6775% → 9,25% via fórmula; R$ 105.406,63 × 9,25% = R$ 9.750,11.
 *           Mudança matemática alinha com Excel oficial + STF RE 574.706.
 *           Snapshots V10 (2.5.0) preservam cálculo antigo via ADR-003.
 */
export const MRM_ENGINE_VERSION = '2.6.0'

export type TaxType =
  | 'ICMS'
  | 'PIS'
  | 'COFINS'
  | 'ISS'
  | 'IS'
  | 'IPI'
  | 'ICMS_COMPL'
  | 'ICMS_ST'
  | 'DIFAL'
  | 'FCP'
  | 'IBS'
  | 'CBS'
  | 'ISS_RETIDO'
  // EPIC-DAS (Simples Nacional / MEI): alíquota consolidada do DAS. SUBSTITUI o grupo
  // ICMS+ISS+PIS/COFINS por dentro — nunca soma a eles. Fora de SN/MEI o valor é 0.
  | 'DAS'

// EPIC-DAS: 'DAS' integra o grupo por dentro porque OCUPA O LUGAR dos outros três em
// SN/MEI. Em LR/LP/RET/Híbrido nunca há alíquota DAS nos `rates`, logo somar o grupo
// continua bit-exact.
export const TAXES_INSIDE: readonly TaxType[] = ['ICMS', 'PIS', 'COFINS', 'ISS', 'DAS'] as const
// Tributos destacados da Reforma Tributária (IVA Dual) + legados "por fora".
// Ordem segue a hierarquia do PDF: IS → IBS → CBS → IPI → ICMS Complementar (Reforma);
// demais legados. ICMS_COMPL (LC 87/1996, art. 13, §1º, II) é condicional ao destinatário
// consumidor final NÃO contribuinte do ICMS.
export const TAXES_OUTSIDE: readonly TaxType[] = [
  'IS',
  'IBS',
  'CBS',
  'IPI',
  'ICMS_COMPL',
  'ICMS_ST',
  'DIFAL',
  'FCP',
  'ISS_RETIDO',
] as const

export type TaxRegime = 'MEI' | 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL'

export type ReapurationStatus =
  | 'PENDING'
  | 'VALID'
  | 'RRO_ZERO'
  | 'RRO_NEGATIVE'
  | 'ERROR'
  | 'DISCOUNT_MODE_FALLBACK'

export type DiscountMode = 'PROPORTIONAL' | 'PROFIT_REDUCTION' | 'SELLER_REDUCTION' | 'MRM'

export interface TaxRatePeriod {
  id: string
  tenant_id: string
  tax_type: TaxType
  origin_state: string | null
  dest_state: string | null
  rate_pct: number
  valid_from: string
  valid_until: string | null
  notes: string | null
}

export interface TaxLine {
  type: TaxType
  rate_pct: number
  base: number
  amount: number
}

export type ValidationId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7'

export type ValidationMap = Record<ValidationId, boolean>

/**
 * Perspectiva PIS/COFINS (Story MRM-V5-002 + ADR-008).
 *
 *   - CONSTRUCAO: alíquota agregada usada no markup divisor da precificação
 *     original (módulo de formação de preço). Excel: 7,6775% para regime LR
 *     não-cumulativo com ICMS=17% (= 9,25% × 0,83 via identidade STF).
 *
 *   - APURACAO: alíquota agregada aplicada sobre base reduzida (`Âncora − ICMS − ISS`)
 *     pelo motor RR na Etapa 5. Excel: 9,25% para regime LR não-cumulativo (célula H43).
 *
 * Identidade matemática: `apuracao × (1 − icms_pct) = construcao` quando ISS=0.
 */
export type PisCofinsPerspective = 'CONSTRUCAO' | 'APURACAO'

/**
 * Erro estruturado de invariante fiscal. Story MRM-V5-002 AC6.
 *
 * Lançado pelo `mrm-rates-loader` quando a soma agregada PIS+COFINS não está
 * dentro de nenhuma das faixas conhecidas (7,6775% construção ou 9,25% apuração)
 * para o regime LR. Motor consome via `messages`/`error_code` — não derruba a app.
 */
export class MrmInvariantError extends Error {
  public readonly code: string
  public readonly actual: number
  public readonly expected: string
  public readonly perspective: PisCofinsPerspective | null

  constructor(args: {
    code: string
    actual: number
    expected: string
    perspective: PisCofinsPerspective | null
    message?: string
  }) {
    super(
      args.message ??
        `[MRM Invariant] ${args.code}: actual=${args.actual}, expected=${args.expected}, perspective=${args.perspective ?? 'NONE'}`,
    )
    this.name = 'MrmInvariantError'
    this.code = args.code
    this.actual = args.actual
    this.expected = args.expected
    this.perspective = args.perspective
  }
}

/**
 * Memória cascata — 13 etapas obrigatórias conforme PDF Motor RR Seção 10.
 *
 * Ordem fixa (não pode ser alterada por step_id):
 *   1.  Receita Bruta
 *   2.  Desconto aplicado
 *   3.  Receita pós-desconto (RV)
 *   4.  Aplicação do Peso Operação Interna
 *   5.  Âncora Interna
 *   6.  Reapuração ICMS
 *   7.  Reapuração ISS
 *   8.  Reapuração PIS/COFINS
 *   9.  Redução de custos (CP)
 *   10. Redução de despesas (MOD + DOP)
 *   11. Resultado Residual Operacional (RRO)
 *   12. Redistribuição proporcional (Comissão + Lucro + CSLL + IRPJ)
 *   13. Reapuração tributos por fora (recomposição final)
 *
 * `base`, `rate` e `amount` são opcionais por step — alguns são puramente
 * descritivos (e.g. step 4 é a aplicação de um multiplicador). `value` representa
 * o "valor agregado" da etapa (RB, RV, Âncora, RRO, etc).
 *
 * Spec: Story MRM-V5-001 AC4; PDF Motor RR Seção 10.
 */
export interface CascadeStep {
  /** Posição fixa na cascata (1..13). */
  step: number
  /** Rótulo em português-BR exibido na UI. */
  label: string
  /** Base de cálculo, quando aplicável (e.g. RV para ICMS). `null` em steps puramente agregadores. */
  base: number | null
  /** Alíquota decimal aplicada, quando aplicável (e.g. 0.17 para ICMS=17%). `null` quando não há alíquota. */
  rate: number | null
  /** Valor numérico do step (R$). Para impostos é o `amount`; para RB/RV/Âncora/RRO é o "valor agregado". */
  amount: number
  /** Fórmula descritiva (e.g. "RV × peso_op_interna", "(Âncora − ICMS) × PIS/COFINS%"). */
  formula: string
  /** Origem do dado (e.g. "INPUT", "ETAPA_2", "PRODUTO", "SNAPSHOT"). */
  source: string
  /**
   * V10 (ADR-011): sub-itens que detalham o step pai.
   * Steps complexos (10 Despesas, 12 Redistribuição, 13 Imp. por fora) emitem children.
   * Soma de children.amount ≈ parent.amount (±R$ 0,01). Invariante V10-I1/I2/I4.
   * Snapshots V5/V6/V9 sem este campo renderizam normalmente (retrocompat).
   */
  children?: CascadeStep[]
  /**
   * V10 (ADR-011): peso decimal usado em redistribuição proporcional.
   * Populado apenas em sub-itens do step 12 (Comissão/Lucro/IRPJ/CSLL).
   * Soma dos pesos dos 4 children do step 12 ≈ 1 (quando rateio > 0). Invariante V10-I3.
   */
  peso?: number | null
  /**
   * PC-UI-IBSCBS-ALIQEFETIVA-005 (2026-06-30): alíquota EFETIVA (decimal) do tributo por fora,
   * pós-fator de redução do IVA Dual. Populado apenas nos filhos IBS/CBS/IS/IPI da Etapa 17
   * (cruzado com `taxes_outside[].rate_pct`). DISPLAY-only — não participa de nenhum cálculo,
   * apenas dá transparência da alíquota real por trás do valor R$. `null`/ausente quando N/A.
   */
  effective_rate_pct?: number | null
  /**
   * Dossiê Julho 2026 (Correção 1): natureza do valor exibido. `'count'` sinaliza que
   * `amount` é uma CONTAGEM (ex.: quantidade de produtos na Etapa 1 — Fragmentação), e a UI
   * deve renderizá-lo como quantitativo ("3 produtos"), NÃO como moeda (`formatBRL`).
   * Ausente/`null` → valor monetário (comportamento padrão).
   */
  display_kind?: 'count' | null
}

/**
 * Schema persistido em budget_items.tax_breakdown / sale_items.tax_breakdown / order_items.tax_breakdown.
 * Imutável quando use_snapshot_rates = TRUE (D2). Recalculado a cada edição quando FALSE.
 */
export interface TaxBreakdown {
  engine_version: string
  effective_date: string
  regime: TaxRegime
  use_snapshot_rates: boolean

  taxes_inside: TaxLine[]
  taxes_outside: TaxLine[]

  rb: number
  desc_value: number
  rv: number
  cp: number
  mod: number
  dop: number
  imp_total: number
  rro: number
  /**
   * Receita mínima abaixo da qual a operação fica sem margem residual positiva.
   * Fórmula (Seção 4.5 do Relatório Consolidado RR):
   *   limite_minimo = (CP + MOD + DOP) / (1 − ICMS% − PIS% − COFINS% − ISS%)
   *
   * Usado pela UI para orientar o usuário (R5) sobre o desconto máximo permitido.
   * `null` quando a soma das alíquotas internas ≥ 1 (configuração tributária inválida).
   */
  limite_minimo: number | null

  /**
   * Peso da Operação Interna (decimal 0..1) — propriedade da PRECIFICAÇÃO ORIGINAL do produto.
   *
   * NÃO é cálculo runtime sobre cp/mod/dop. Vem do markup divisor da configuração
   * do produto/serviço (Excel célula I21 = 0,931585 no cenário canônico).
   *
   * Fórmula (origem):
   *   Op_Interna_Original = custo / (1 − Σ percentuais_internos)
   *   Op_Externa_Original = Σ (IBS, CBS, IPI, ICMS-ST, DIFAL, FCP)
   *                          aplicado sobre (Op_Interna − ICMS − PIS/COFINS)
   *   peso_op_interna     = Op_Interna_Original / (Op_Interna + Op_Externa)
   *
   * Resolvido pelo orchestrator (`mrm-orchestrator.ts`), nunca pelo motor puro
   * (ADR-004). Snapshot persistido aqui é imutável (ADR-003).
   *
   * Default conservador no motor: 1 (toda operação é interna, comportamento V4).
   * Story MRM-V5-001 AC2; ADR-004.
   */
  peso_op_interna?: number | null
  /**
   * Peso da Operação Externa (decimal 0..1) — espelho informacional.
   * Sempre = 1 − peso_op_interna. Excel célula I26 = 0,068415 no cenário canônico.
   *
   * Story MRM-V5-001 AC1.
   */
  peso_op_externa?: number | null
  /**
   * Âncora Interna (R$) — base operacional reapurada PÓS-desconto.
   *
   * Fórmula: `ancora_interna = rv × peso_op_interna` (Excel célula H36).
   *
   * Distinto de `Op_Interna_Original` (Excel H21), que é PRÉ-desconto.
   * No cenário canônico (RB=190.055,94, desc=10%, peso=0,931585):
   *   Op_Interna_Original = R$ 177.053,25 (H21, PRÉ desc)
   *   Âncora Interna      = R$ 159.342,38 (H36, PÓS desc — este campo)
   *
   * Story MRM-V5-001 AC3.
   */
  ancora_interna?: number | null
  /**
   * Memória cascata — 13 etapas conforme PDF Motor RR Seção 10.
   *
   * Materialização dos valores que o motor já computou — não recalcula.
   * Exibido em expansível dentro da DRE consolidada (sem nova aba — STORY-005).
   *
   * Story MRM-V5-001 AC4.
   */
  cascade_trace?: CascadeStep[] | null

  /**
   * Verificação observacional de RRO > threshold (Story MRM-V5-003 AC3).
   *
   * Campo informacional — NÃO move lógica de bloqueio para o motor (ADR-004 preservado).
   * `mrm-policies.ts` continua sendo a fonte única de decisão sobre bloquear/avisar.
   * UI pode consumir este campo para feedback visual leve sem precisar decodificar `status`.
   *
   * Story MRM-V5-003 AC3 + ADR-004 reforçado.
   */
  rro_threshold_check?: {
    /** Atendeu o threshold? `true` se observed > threshold. */
    passed: boolean
    /** Threshold mínimo para RRO (R$). Default 0 (RRO > 0 estrito). */
    threshold: number
    /** Valor observado de RRO (R$) — espelho de `rro`. */
    observed: number
  } | null

  /**
   * Créditos tributários aplicados ao motor (Story MRM-V5-004 AC3).
   *
   * `recoverable`: somado a `cp` como dedução → `cp_efetivo = cp − recoverable`.
   *   Aplicável apenas em regimes não-cumulativos (LR, LP não-cumulativo).
   *   MEI/SN são cumulativos — créditos forçados a 0 pelo orchestrator.
   *
   * `non_recoverable`: permanece no custo, apenas auditado para relatório fiscal.
   *
   * Fonte: tabela `item_tax_credits` (migration 20260213000000) — lida pelo orchestrator.
   *
   * Story MRM-V5-004 AC1+AC3.
   */
  tax_credits_applied?: {
    recoverable: number
    non_recoverable: number
  } | null

  /**
   * Base canônica dos tributos por fora (R$). Excel cenário canônico ≈ R$ 120.020,65.
   *
   * Fórmula: `ancora_interna − Σ(ICMS_amount + PIS_amount + COFINS_amount)`.
   *
   * Identidade matemática (Excel H62 ≡ Âncora_Interna quando RRO é 100% redistribuído):
   *   H65 (IBS final) = (H62 − H43 − H41) × IBS_rate
   *                  ≡ (Âncora − ICMS − PIS/COFINS) × IBS_rate
   *
   * ISS NÃO entra na base canônica (não aparece na planilha; ICMS e PIS/COFINS
   * são os tributos isolados pela LC 214/2025). Quando há ISS, permanece em
   * `taxes_inside` mas a base por fora é `Âncora − ICMS − PIS/COFINS`.
   *
   * Story MRM-V5-002 AC1+AC2.
   */
  taxes_outside_base?: number | null

  new_commission: number
  new_profit: number

  /**
   * Correção Card Percentual (Ago/2026) — baseline PRÉ-desconto (motor com desconto=0).
   *
   * Persistidos no save do orçamento para que superfícies que leem apenas o snapshot
   * pós-desconto (PDF, Pedidos, Vendas) exibam o `% original` correto do card
   * "Distribuição do resultado" — par fechado pré/pré (linha 16 baseline ÷ âncora baseline),
   * em vez da alíquota de cadastro. Ausentes em snapshots antigos → downstream cai no
   * comportamento legado (`weightedOriginalPct`). NÃO afetam nenhum valor em R$.
   */
  baseline_new_commission?: number | null
  baseline_new_profit?: number | null
  baseline_ancora_interna?: number | null

  /**
   * Valor de CSLL após redistribuição proporcional sobre RRO.
   * Sempre 0 para regimes MEI e SIMPLES_NACIONAL (guard Q5 — Story S1.1).
   */
  new_csll: number
  /**
   * Valor de IRPJ após redistribuição proporcional sobre RRO.
   * Sempre 0 para regimes MEI e SIMPLES_NACIONAL (guard Q5 — Story S1.1).
   */
  new_irpj: number

  /**
   * Modo de desconto solicitado pelo caller (Epic MRM-V6 — ADR-009).
   *
   * Default `PROPORTIONAL` quando ausente — preserva retrocompat V4/V5.
   * Snapshots V5 antigos com `discount_mode='MRM'` são lidos como PROPORTIONAL.
   */
  discount_mode_requested?: DiscountMode
  /**
   * Modo efetivamente aplicado pelo motor (pode divergir do solicitado em fallback).
   *
   * Quando `discount_mode_requested !== discount_mode_applied`, status =
   * `DISCOUNT_MODE_FALLBACK` e `messages[]` contém razão estruturada.
   *
   * Epic MRM-V6 — ADR-009 §5.4 (fallback safety).
   */
  discount_mode_applied?: DiscountMode

  validations: ValidationMap
  valid: boolean
  status: ReapurationStatus
  error_code: string | null
  messages: string[]
}

/**
 * Input do motor (por item). O motor é uma função pura sobre este input.
 */
export interface ReapurationInput {
  rb: number
  desc_value: number
  regime: TaxRegime
  rates: TaxRatePeriod[]
  cp: number
  mod: number
  dop: number
  commission_pct: number
  profit_pct: number
  /**
   * Alíquota de CSLL (decimal: 0.0207 = 2,07%).
   * Origem: `tenant.profile.tax_rates` ou snapshot persistido em `*_items.tax_breakdown`.
   * Hidratação é responsabilidade da camada chamadora (Story S1.2), não do motor.
   * Default 0 quando ausente. Forçado a 0 para regimes MEI/SIMPLES_NACIONAL (guard Q5).
   */
  csll_pct?: number
  /**
   * Alíquota de IRPJ (decimal: 0.0345 = 3,45%).
   * Origem: `tenant.profile.tax_rates` ou snapshot persistido em `*_items.tax_breakdown`.
   * Hidratação é responsabilidade da camada chamadora (Story S1.2), não do motor.
   * Default 0 quando ausente. Forçado a 0 para regimes MEI/SIMPLES_NACIONAL (guard Q5).
   */
  irpj_pct?: number
  /**
   * Alíquota consolidada do DAS do ITEM (decimal: 0.0802 = 8,02%).
   *
   * Origem: `products.custom_tax_percent` ou `services.taxable_regime_percent`, resolvida por
   * `resolveDasPct` e carregada em `ItemTaxRates.das_pct`. Hidratação é responsabilidade da
   * camada chamadora, como em `csll_pct` e `irpj_pct` — o motor não a busca.
   *
   * SUBSTITUI o grupo ICMS + ISS + PIS/COFINS por dentro; não soma a ele. É o que a
   * documentação de `ItemTaxRates.das_pct` já determinava: *"o DAS não é um `TaxRatePeriod` do
   * tenant e não deve vazar para os arrays de `rates` via `mergeItemAndTenantRates` — o motor o
   * consome direto do item"*. A intenção estava escrita; faltava o campo por onde entrar.
   *
   * Só se aplica quando o regime resolvido é SIMPLES_NACIONAL ou MEI. RET e Simples Híbrido
   * reusam a MESMA coluna `custom_tax_percent` para outra finalidade e são mapeados para
   * LUCRO_PRESUMIDO em `mapToMotorRegime`, portanto nunca entram neste ramo.
   *
   * Ausente ou 0 → comportamento anterior, byte a byte.
   */
  das_pct?: number
  /**
   * Peso da Operação Interna (decimal 0..1) — propriedade do produto.
   *
   * Resolvido pelo orchestrator (3 fontes de prioridade: snapshot histórico →
   * markup divisor da config do produto → default 1). Motor puro nunca calcula.
   *
   * Default ausente (`undefined`) → motor usa 1 (comportamento V4 — sem op externa).
   * Story MRM-V5-001 AC9; ADR-004.
   */
  peso_op_interna?: number
  /**
   * Créditos tributários aplicáveis ao item (Story MRM-V5-004 AC1+AC2).
   *
   * `recoverable`: tributos recuperáveis (PIS/COFINS não-cumulativos, ICMS LP) que
   *   reduzem `cp` efetivo. Aplicável apenas em LR e LP não-cumulativo.
   * `non_recoverable`: tributos não-recuperáveis (permanecem no custo).
   *
   * Resolvido pelo orchestrator via leitura de `item_tax_credits` (existente).
   * Default `{ recoverable: 0, non_recoverable: 0 }` quando ausente → retrocompat V4.
   * MEI/SN: orchestrator força recoverable=0 (regime cumulativo absorve via DAS).
   *
   * Story MRM-V5-004 AC1+AC4+AC8.
   */
  tax_credits?: {
    recoverable: number
    non_recoverable: number
  }
  /**
   * Modo de desconto que controla o rateio do RRO (Etapa 9 da spec V5).
   *
   * Epic MRM-V6 — ADR-009 (reverte R2 da spec V2). Default `PROPORTIONAL` quando
   * ausente — comportamento V5 idêntico.
   *
   *   - `PROPORTIONAL` (default): peso_comm e peso_lucro baseados em commission_pct
   *     e profit_pct originais (rateio proporcional sobre RRO).
   *   - `SELLER_REDUCTION`: vendedor absorve o desconto. Lucro preservado em valor
   *     absoluto (= profit_pct × RB). Comissão recebe o resíduo.
   *   - `PROFIT_REDUCTION`: empresa absorve o desconto. Comissão preservada em
   *     valor absoluto (= commission_pct × RB). Lucro recebe o resíduo.
   *   - `MRM` (legacy V5): tratado como PROPORTIONAL — sem comportamento próprio.
   *
   * Invariante (ADR-009 §2.2 — bit-exact): ICMS/PIS/COFINS/ISS/IBS/CBS/IPI/CP/MOD/
   * DOP/CSLL/IRPJ idênticos nos 3 modos. APENAS new_commission e new_profit divergem.
   *
   * Fallback safety: quando modo escolhido é inviável (e.g. SELLER com
   * commission_pct=0), motor degrada para PROPORTIONAL e popula
   * `status='DISCOUNT_MODE_FALLBACK'` + `discount_mode_applied='PROPORTIONAL'`.
   */
  discount_mode?: DiscountMode
  effective_date: string
  use_snapshot_rates: boolean
  /**
   * V10 (ADR-011): breakdown opcional dos 4 buckets de DOP para popular
   * `cascade_trace[10].children` (MO Admin, Fixa, Variável, Financeira).
   *
   * Quando ausente, step 10 fica sem children (degradação graceful).
   * Não afeta matemática — `dop` continua sendo a fonte da verdade do total.
   *
   * Soma dos 4 buckets deve aproximar `rv × dop_pct` (validado por invariante V10-I1).
   */
  expense_breakdown?: {
    mo_admin: { rate: number; amount: number }
    fixa: { rate: number; amount: number }
    variavel: { rate: number; amount: number }
    financeira: { rate: number; amount: number }
  }
}

/**
 * Mensagem padrão R5 quando RRO ≤ 0.
 * Exibida na UI sem bloquear o save — apenas orienta o usuário.
 */
export const MRM_ERROR_RRO_NON_POSITIVE =
  'Operação sem margem residual positiva. O desconto solicitado excede o limite máximo operacional permitido. Revise o desconto ou os parâmetros de custo.'

// ═══════════════════════════════════════════════════════════════════════════
// V17 — Motor RRO Aderente ao PDF Oficial (EPIC-MRM-V17)
// ═══════════════════════════════════════════════════════════════════════════
// Arquitetura 2 camadas:
//   Camada 1 — Motor matemático oficial (consolidate + motor-rro)
//   Camada 2 — Política comercial parametrizada (absorption)
// ADR-015: docs/architecture/adr-015-motor-v17-policies-absorption.md

/**
 * Engine version V17 (3.x.x). Snapshots V16 (2.x.x) continuam imutáveis (ADR-003).
 */
export const MRM_ENGINE_VERSION_V17 = '3.0.0'

/**
 * Política comercial de absorção do desconto (V17 Camada 2).
 *
 * - RRO_PROPORTIONAL: redistribui RRO conforme pesos originais (PDF Seção 23).
 *   Dropdown "Proporcional (Comissão + Lucro)".
 * - COMMISSION_PROTECTED: comissão protege a ALÍQUOTA (%); lucro + CSLL + IRPJ absorvem
 *   o desconto. Dropdown "Empresa absorve (Lucro)".
 * - PROFIT_PROTECTED: lucro protege a ALÍQUOTA (%), com CSLL/IRPJ acompanhando-o; a
 *   comissão absorve o desconto. Dropdown "Vendedor absorve (Comissão)".
 *
 * Regra (Relatório 20/06/2026, Item 2): a parte protegida trava o PERCENTUAL, nunca o R$ —
 * o valor em reais varia com a base pós-desconto. Fallback proporcional se a parte
 * protegida exceder o RRO disponível.
 *
 * Persistido em `tenants.absorption_policy`. Default `RRO_PROPORTIONAL`.
 */
export type AbsorptionPolicy = 'RRO_PROPORTIONAL' | 'COMMISSION_PROTECTED' | 'PROFIT_PROTECTED'

/**
 * Desconto aplicado sobre venda consolidada (V17 PDF Etapa 11).
 * Apenas modo global proporcional suportado em V17.
 */
export interface DiscountV17 {
  /** Decimal 0..1 (e.g. 0.10 = 10%). */
  pct: number
  /**
   * Base IMUNE ao desconto (R$): produtos manuais (repasse puro) + Desp. Acessórias
   * (frete/seguro contratuais). Doc 31/07/2026 (oráculo "Aluminio"): o desconto comercial
   * incide sobre o VALOR TOTAL do orçamento (produto + manual + desp), mas manual e desp são
   * repasses pagos CHEIOS pelo cliente. Logo o desconto que incidiria sobre eles é
   * INTEGRALMENTE absorvido pela parte distribuível:
   *   desc_value = pct × (rb_total + discount_immune_base)
   *   rv_total   = rb_total − desc_value
   * Quando 0 (sem manual e sem desp) ⇒ desc_value = pct × rb_total (BIT-EXACT ao anterior).
   * Default 0.
   */
  discount_immune_base?: number
}

/**
 * Item individual antes da consolidação (V17 input mínimo).
 * Equivale a 1 linha de budget_items/order_items/sale_items.
 */
export interface EngineItemV17 {
  item_id: string
  /** Receita Bruta unitária × quantidade (R$ pré-desconto). */
  rb: number
  /** CMV canônico = cost_total + productive_labor_unit (V9 D2). */
  cp: number
  /** MO Produtiva como % decimal — imune a desconto (R6). */
  mod_pct: number
  /** DOP agregado (4 buckets) como % decimal. */
  dop_pct: number
  /** % decimal original do item (peso pré-desconto PDF Seção 23). */
  commission_pct: number
  /** % decimal original do item. */
  profit_pct: number
  /** 0 forçado para MEI/SN pelo orchestrator (guard Q5). */
  csll_pct: number
  /** 0 forçado para MEI/SN pelo orchestrator (guard Q5). */
  irpj_pct: number
  /**
   * RT (Comissão Reserva Técnica) — % decimal congelada (EPIC-RT v8, 2026-07-13).
   * Dedução gerencial autônoma (paralela a Comissão/Lucro): abatida do RRO ANTES da
   * redistribuição (item 16), aplicada sobre a Op. Interna pós-desconto (Âncora) com
   * alíquota efetiva SEMPRE congelada (independe do modo de desconto). NÃO entra na
   * base de IRPJ/CSLL nem nos pesos de redistribuição. Default 0 (sem RT) ⇒ bit-exact
   * com o comportamento anterior.
   */
  rt_pct?: number | null
  /** Peso Op Interna decimal 0..1 (do markup divisor do produto). */
  peso_op_interna: number
  /** Snapshot V14 dos 4 buckets de despesa do produto (opcional). */
  expense_breakdown?: {
    mo_admin: { rate: number; amount: number }
    fixa: { rate: number; amount: number }
    variavel: { rate: number; amount: number }
    financeira: { rate: number; amount: number }
  }
  /**
   * Adendo Seção 31-A (itens 1-2): decomposição EFETIVA (sobre RB) do `dop_pct`
   * nos 4 buckets. A soma dos 4 == `dop_pct`, garantindo que a Etapa 5 discriminada
   * reconcilie com o total (`dop_total`) independentemente do snapshot V14. DISPLAY-only:
   * NÃO afeta o RRO (que usa `dop_pct`). Ausente ⇒ Etapa 5 cai no `expense_breakdown` legado.
   */
  dop_components?: {
    mo_admin: number
    fixa: number
    variavel: number
    financeira: number
  } | null
  /**
   * V17 (2026-05-28): impostos por dentro CONSOLIDADOS por produto (R$ pré-desconto).
   * Permite que cada produto contribua com alíquotas próprias (multi-produto heterogêneo).
   * Quando presente: motor usa valores direto + aplica desconto proporcional.
   * Quando ausente: motor calcula via Âncora × pct_tenant (comportamento legado).
   */
  taxes_inside_amounts?: {
    icms: number
    iss: number
    pis_cofins: number
    /**
     * EPIC-DAS: DAS consolidado do item (R$ pré-desconto). Presente apenas em SN/MEI —
     * nesses regimes SUBSTITUI icms/iss/pis_cofins (que ficam 0 no motor). MEI legítimo
     * com alíquota 0 grava `das: 0` (a linha existe, o valor é zero).
     */
    das?: number
  }
  /** Créditos tributários do item (V5-004). */
  tax_credits?: { recoverable: number; non_recoverable: number }
}

/**
 * Snapshot por item dentro do consolidado — usado pela Camada 2
 * para resolver COMMISSION_PROTECTED (soma dos valores absolutos originais).
 */
export interface ItemConsolidatedSnapshot {
  item_id: string
  rb: number
  commission_amount_original: number
  profit_amount_original: number
  csll_amount_original: number
  irpj_amount_original: number
}

/**
 * Output da Etapa 1 (consolidateItems) — PDF Etapas 1-9.
 *
 * Agrega N itens em UMA visão consolidada com pesos originais pré-desconto.
 * Os pesos PDF Seção 23 são a chave da redistribuição RRO V17.
 */
export interface ConsolidatedView {
  items_count: number
  rb_total: number
  desc_value: number
  rv_total: number
  /** Média ponderada por RB dos pesos op_interna individuais. */
  peso_op_interna_ponderado: number
  /** rv_total × peso_op_interna_ponderado (PDF Etapa 7 — Op Interna pós-desconto). */
  ancora_interna: number
  cp_total: number
  mod_total: number
  dop_total: number
  /** Σ(rb_i × commission_pct_i) — R$ absoluto pré-desconto de cada componente. */
  commission_amount_original: number
  profit_amount_original: number
  csll_amount_original: number
  irpj_amount_original: number
  /**
   * Adendo Seção 26-A (Julho 2026): margens sobre a OPERAÇÃO INTERNA de cada produto
   * — Σ(rb_i × peso_op_interna_i × pct_i) — reproduzindo a soma das margens já apuradas
   * na Etapa 2 (precificação individual), SEM a Op. Externa (IBS/CBS por fora) que
   * infla a base rb. Usado EXCLUSIVAMENTE no display da Etapa 6 (Consolidação das
   * Margens). NÃO alimenta absorção/RRO/pesos — os `*_amount_original` (base rb cheia)
   * permanecem a fonte dos modos protegidos (Adendo 24-A) e da redistribuição.
   */
  commission_amount_internal: number
  profit_amount_internal: number
  csll_amount_internal: number
  irpj_amount_internal: number
  /**
   * RT (Comissão Reserva Técnica) — Σ(rb_i × rt_pct_i), R$ pré-desconto (EPIC-RT v8).
   * A alíquota efetiva CONGELADA = rt_amount_original / rb_total. Default 0 (sem RT).
   */
  rt_amount_original?: number
  /** Pesos PDF Seção 23 — base para redistribuição RRO (1.0 quando sum=0 vira fallback). */
  peso_comissao_original: number
  peso_lucro_original: number
  peso_irpj_original: number
  peso_csll_original: number
  /** Espelhos por item para Camada 2 (COMMISSION_PROTECTED). */
  items_breakdown: ItemConsolidatedSnapshot[]
  /**
   * V17 (2026-05-28): impostos por dentro CONSOLIDADOS pré-desconto (R$).
   * Agregado de cada item.taxes_inside_amounts. Permite multi-produto heterogêneo.
   * `null` quando nenhum item forneceu valores explícitos.
   */
  taxes_inside_total?: {
    icms: number
    iss: number
    pis_cofins: number
    /** EPIC-DAS: Σ DAS por dentro (R$ pré-desconto). Só alimenta o motor em SN/MEI. */
    das?: number
  } | null
  /** Soma agregada dos 4 buckets de despesa (quando snapshots V14 presentes). */
  expense_breakdown_total?: {
    mo_admin: number
    fixa: number
    variavel: number
    financeira: number
  } | null
  /**
   * Adendo Seção 31-A (itens 1-2): decomposição de `dop_total` nos 4 buckets, somando
   * `rb_i × dop_components_i`. Σ dos 4 == `dop_total` (mod_total é 0 no V17). É a fonte
   * PREFERENCIAL da Etapa 5 discriminada — garante reconciliação total ⇄ linhas e soma
   * a MO Administrativa de TODOS os produtos (não trava no 1º). DISPLAY-only.
   */
  dop_breakdown_total?: {
    mo_admin: number
    fixa: number
    variavel: number
    financeira: number
  } | null
}

/**
 * Output da Etapa 2 (applyMotorRRO) — PDF Etapas 10-15.
 *
 * Cascata tributária sequencial + RRO consolidado. Bit-exact entre flavors
 * da Camada 2 — só `new_commission` e `new_profit` divergem após Etapa 3.
 */
export interface MotorOutput {
  /** Espelho dos valores consolidados (para auditoria). */
  rb: number
  desc_value: number
  rv: number
  ancora: number
  /** Cascata tributária sequencial (PDF Seção 19). */
  icms: number
  iss: number
  pis_cofins: number
  /**
   * Alíquota TRANSMUTADA de PIS/COFINS (decimal 0..1) — ADR-016 (2026-05-29).
   * = alíq_precificação / (1 − ICMS% − ISS%) = pis_cofins / (Âncora − ICMS − ISS).
   * É a alíquota que, aplicada sobre a base 13A (Âncora − ICMS − ISS), reproduz
   * EXATAMENTE o valor do PIS/COFINS da precificação. Exibida na cascata 13B.
   */
  pis_cofins_aliquota_efetiva?: number
  /**
   * EPIC-DAS (Simples Nacional / MEI): DAS por dentro em R$ — SUBSTITUI icms/iss/pis_cofins,
   * que ficam 0 nesses regimes. Fora de SN/MEI é sempre 0 e o resultado é bit-exact ao
   * comportamento anterior. Incide DIRETO sobre a Âncora (sem cascata de bases).
   */
  das?: number
  imp_dentro_total: number
  /** CMV efetivo = cp_total − tax_credits.recoverable. */
  cp_efetivo: number
  mod: number
  dop: number
  rro: number
  /**
   * RT (Comissão Reserva Técnica) abatido do RRO — R$ (EPIC-RT v8, 2026-07-13).
   * = Âncora × rt_efetiva. O `rro` acima já está LÍQUIDO de RT. Default 0.
   */
  rt_value?: number
  /** Alíquota efetiva CONGELADA de RT (decimal) = rt_amount_original / rb_total. Default 0. */
  rt_efetiva?: number
  rro_status: ReapurationStatus
  /** Cascade trace 17 etapas (PDF — superseta as 13 etapas V16). */
  cascade_trace: CascadeStep[]
  limite_minimo: number | null
}

/**
 * Output da Etapa 3 (applyAbsorptionPolicy) — PDF Etapas 16-17 + Camada 2.
 */
export interface FinalDistribution {
  policy_applied: AbsorptionPolicy
  new_commission: number
  new_profit: number
  new_csll: number
  new_irpj: number
  /** Tributos por fora sobre base canônica (Âncora − ICMS − PIS/COFINS). */
  taxes_outside: TaxLine[]
  taxes_outside_base: number
  taxes_outside_total: number
  /** Despesas Acessórias consolidadas (frete + seguro + despesas acessórias, R$). */
  desp_acessorias: number
  /** Valor final = ancora + Desp. Acessórias + Σ taxes_outside. */
  valor_final: number
  absorption_audit: {
    /** True apenas em COMMISSION_PROTECTED com floor aplicado. */
    commission_floor_applied: boolean
    /** R$ que o lucro absorveu além do proporcional. */
    profit_absorbed: number
    /** Diferença vs comportamento RRO_PROPORTIONAL. */
    delta_vs_proportional: number
  }
  validations: ValidationMap
}

/**
 * Input completo do motor V17 — equivale a 1 documento (orçamento/pedido/venda).
 */
export interface MotorV17Input {
  items: EngineItemV17[]
  discount: DiscountV17
  policy: AbsorptionPolicy
  regime: TaxRegime
  rates: TaxRatePeriod[]
  effective_date: string
  use_snapshot_rates: boolean
  /**
   * Despesas Acessórias consolidadas (frete + seguro + despesas acessórias, R$) cobradas do
   * adquirente. Compõem a base de IBS/CBS e do IPI e a base do ICMS Complementar — NÃO a base
   * do IS nem sofrem dedução de ICMS/PIS/ISS (Conferência Fiscal, seções 1–5).
   */
  desp_acessorias?: number
  /**
   * Ativa o ICMS Complementar (LC 87/1996, art. 13, §1º, II): só quando o destinatário for
   * consumidor final NÃO contribuinte do ICMS (`customers.is_icms_contributor === false`).
   *
   * LEGADO (binário). Quando `icms_compl` está presente, a Etapa 17 usa a hierarquia completa
   * e este campo é ignorado.
   */
  icms_compl_applies?: boolean
  /**
   * Hierarquia completa do ICMS Complementar (documento oficial 2026-06-10). Resolve a decisão
   * de ativação por destinatário (contribuinte?) + frete (CIF/FOB) + bloqueio ST/DIFAL + override
   * manual. Quando presente, substitui o binário `icms_compl_applies`.
   */
  icms_compl?: IcmsComplMotorInput
  /**
   * ADENDO 25-A (Junho 2026) — perfil tributário "por fora" POR PRODUTO, para a consolidação
   * por SOMA na Etapa 17. Cada produto tem alíquotas heterogêneas (NCM/operação): o IPI/IBS/CBS/IS
   * consolidado é a SOMA dos valores apurados individualmente, NUNCA alíquota de um produto sobre
   * a base consolidada total. Quando ausente (produto único / formação de preço), a Etapa 17 usa
   * o caminho legado (alíquota agregada × base consolidada) — bit-exact com os oráculos.
   */
  outside_items?: OutsideItemProfile[]
}

/**
 * Perfil "por fora" de um produto na consolidação multi-produto (Adendo 25-A).
 * As alíquotas são DECIMAIS (0,05 = 5%).
 */
export interface OutsideItemProfile {
  /** Parcela da âncora consolidada atribuível a este produto (Op Interna_i ÷ Σ Op Interna). Σ = 1. */
  peso_ancora: number
  /** Despesas Acessórias do produto (frete + seguro + despesas acessórias, R$). Σ = desp_acessorias. */
  desp_acessorias: number
  /** Alíquotas por fora do produto (decimais). */
  rates: {
    is: number
    ibs: number
    cbs: number
    ipi: number
    /** Alíquota ICMS herdada (usada na base do ICMS Complementar deste produto). */
    icms: number
  }
}

/** Parâmetros de operação para a hierarquia do ICMS Complementar (Etapa 17). */
export interface IcmsComplMotorInput {
  /** Destinatário é contribuinte do ICMS? `null` = não resolvido (não cobra — legado). */
  is_contributor: boolean | null
  /** Modalidade de frete da operação. */
  freight_mode: 'CIF' | 'FOB'
  /** Algum item da operação tem ICMS-ST ativo. */
  st_active: boolean
  /** Algum item da operação tem DIFAL ativo. */
  difal_active: boolean
  /** Frete + seguro consolidado da operação (R$). */
  freight: number
  /** Despesas acessórias consolidadas da operação (R$). */
  accessory: number
  /** Override manual: `FORCE_OFF` isenta; `null`/ausente = automático. */
  override?: 'FORCE_OFF' | null
}

/**
 * Resultado completo do motor V17 (pronto para persistir em
 * `budgets/orders/sales.consolidated_breakdown`).
 */
export interface MotorV17Result {
  engine_version: typeof MRM_ENGINE_VERSION_V17
  consolidated: ConsolidatedView
  motor: MotorOutput
  distribution: FinalDistribution
  status: ReapurationStatus
  error_code: string | null
  messages: string[]
}
