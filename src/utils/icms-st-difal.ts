/**
 * icms-st-difal.ts — Tributos "por fora" AVANÇADOS (guia "Alíquotas tributárias adicionais").
 *
 * Implementa ICMS-ST (Substituição Tributária — LC 87/96 art. 8º II) e DIFAL (Diferencial de
 * Alíquota — LC 87/96 art. 13 + EC 87/2015 + LC 190/2022), conforme a Base de Conhecimento
 * Fiscal v4 (seções 8.6–8.9 e Manual 9) e o exemplo canônico "Motor RRO 29.05.xlsx".
 *
 * Regras invioláveis (EPIC-POR-FORA-V2):
 *   - ICMS-ST e DIFAL são RECALCULADOS sobre a base (nunca redistribuídos) e NÃO integram o RRO.
 *   - O desconto comercial incide sobre TODA a base da operação: BC = (OpDentro + Desp.Acess + IPI)
 *     × (1−d). O preço efetivo da operação (que serve de base ao ST/DIFAL) inclui o desconto.
 *     [Planilha "Motor RRO 11.06" — fonte de verdade (2026-06-11); SUPERA a regra "frete fixo D3"
 *     do doc v4 Tab. 77, que mantinha IPI/Desp.Acess fixos. A Desp.Acess permanece FIXA apenas na
 *     base do ICMS COMPLEMENTAR (frete/seguro são contratuais lá) — base legal distinta.]
 *   - ICMS-ST e DIFAL nunca coexistem na mesma operação (acionadores distintos).
 *
 * Convenção: alíquotas de ENTRADA em base 100 (ex.: 17 = 17%). `discount` em decimal (0,10 = 10%).
 */

/** Converte alíquota base-100 (>0) em decimal; 0 caso contrário. */
function pct(v: number | undefined | null): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n / 100 : 0
}

/** Valor monetário não-negativo. */
function val(v: number | undefined | null): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Fator de desconto seguro no intervalo [0, 1). */
function discountFactor(d: number | undefined | null): number {
  const n = Number(d)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.max(0, 1 - Math.min(n, 0.999999))
}

// ─────────────────────────────── ICMS-ST ───────────────────────────────

export interface IcmsStInput {
  /** Operação por dentro (preço NF-e, sem Desp. Acessórias). */
  opInterna: number
  /** Desp. Acessórias que integram a BC própria: frete CIF (c/ vínculo) + seguro. */
  despAcessorias?: number
  /** Valor do IPI (R$) — integra a BC própria quando destinatário não é contribuinte industrial. */
  ipiValue?: number
  /** MVA original (base 100, ex.: 40 = 40%). */
  mvaOriginalPct?: number
  /** Alíquota interna do estado de DESTINO (base 100). */
  alqInternaDestinoPct?: number
  /** Alíquota interestadual de ORIGEM (base 100). 12%, 7% ou 4%. */
  alqInterestadualOrigemPct?: number
  /** Operação interestadual? true → MVA ajustada + ICMS próprio pela ALQ interestadual. */
  interestadual?: boolean
  /** Fator de desconto d (decimal). Desconta toda a base: BC = (opInterna + Desp.Acess + IPI)×(1−d). */
  discount?: number
}

export interface IcmsStResult {
  /** BC própria = (OpDentro + IPI + Desp. Acessórias) × (1−d). */
  bcPropria: number
  /** MVA ajustada (sempre calculada; usada quando interestadual). */
  mvaAjustada: number
  /** MVA efetivamente aplicada (original p/ intra, ajustada p/ inter). */
  mvaAplicada: number
  /** Base presumida (BC-ST) = BC própria × (1 + MVA aplicada). */
  basePresumida: number
  /** ICMS presumido = BC-ST × ALQ interna destino. */
  icmsPresumido: number
  /** ICMS próprio = BC própria × (intra: ALQ interna | inter: ALQ interestadual). */
  icmsProprio: number
  /** ICMS-ST = ICMS presumido − ICMS próprio (≥ 0). */
  icmsSt: number
}

/**
 * MVA ajustada (LC 87/96 art. 8º): [(1+MVA_orig)×(1−ALQ_inter)/(1−ALQ_intra)] − 1.
 * Quando ALQ interestadual = ALQ interna, MVA ajustada = MVA original.
 */
export function mvaAjustada(mvaOriginalPct: number, alqInterPct: number, alqIntraPct: number): number {
  const mva = pct(mvaOriginalPct)
  const inter = pct(alqInterPct)
  const intra = pct(alqIntraPct)
  if (intra >= 1) return mva // proteção divisão por zero
  return (1 + mva) * ((1 - inter) / (1 - intra)) - 1
}

/**
 * Calcula o ICMS-ST como DIFERENÇA (presumido − próprio) sobre a base própria. O desconto
 * comercial incide sobre TODA a operação: BC = (OpDentro + IPI + Desp. Acessórias) × (1−d)
 * — o preço efetivo da operação inclui o desconto (planilha "Motor RRO 11.06", fonte de verdade).
 */
export function computeIcmsSt(input: IcmsStInput): IcmsStResult {
  const desp = val(input.despAcessorias)
  const ipi = val(input.ipiValue)

  const bcPropria = (val(input.opInterna) + ipi + desp) * discountFactor(input.discount)

  const alqIntra = pct(input.alqInternaDestinoPct)
  const alqInter = pct(input.alqInterestadualOrigemPct)
  const mvaAj = mvaAjustada(input.mvaOriginalPct ?? 0, input.alqInterestadualOrigemPct ?? 0, input.alqInternaDestinoPct ?? 0)
  const mvaAplicada = input.interestadual ? mvaAj : pct(input.mvaOriginalPct)

  const basePresumida = bcPropria * (1 + mvaAplicada)
  const icmsPresumido = basePresumida * alqIntra
  const icmsProprio = bcPropria * (input.interestadual ? alqInter : alqIntra)
  const icmsSt = Math.max(0, icmsPresumido - icmsProprio)

  return { bcPropria, mvaAjustada: mvaAj, mvaAplicada, basePresumida, icmsPresumido, icmsProprio, icmsSt }
}

// ─────────────────────────────── DIFAL ───────────────────────────────

export interface DifalInput {
  /** Operação por dentro (preço NF-e, sem Desp. Acessórias). */
  opInterna: number
  /** Desp. Acessórias na BC do DIFAL: frete (CIF e FOB) + seguro. */
  despAcessorias?: number
  /** Valor do IPI (R$) — integra a BC quando destinatário é consumidor final. */
  ipiValue?: number
  /** Alíquota interna do estado de DESTINO (base 100). */
  alqInternaDestinoPct?: number
  /** Alíquota interestadual de ORIGEM (base 100). */
  alqInterestadualOrigemPct?: number
  /** FCP/FECP (base 100) — recolhido em GNRE separado, NÃO soma ao DIFAL. */
  fcpPct?: number
  /** Metodologia base dupla "por dentro" (LC 190/2022) — quando a UF de destino exige. */
  baseDupla?: boolean
  /** Alíquota ICMS interna embutida na ORIGEM (base 100). Só p/ base dupla. Default = ALQ destino. */
  icmsInternaOrigemPct?: number
  /** Fator de desconto d (decimal). Desconta toda a base: BC = (opInterna + Desp.Acess + IPI)×(1−d). */
  discount?: number
}

export interface DifalResult {
  /** BC do DIFAL = (OpDentro + IPI + Desp. Acessórias) × (1−d). */
  bc: number
  /** ICMS interno do destino. */
  icmsDestino: number
  /** ICMS interestadual de origem. */
  icmsInterestadual: number
  /** DIFAL = ICMS destino − ICMS interestadual (≥ 0). */
  difal: number
  /** FCP/FECP (recolhido à parte). */
  fcp: number
}

/**
 * Calcula o DIFAL (base simples ou dupla) e o FCP. O desconto incide sobre toda a operação:
 * BC = (OpDentro + IPI + Desp. Acessórias) × (1−d) — planilha "Motor RRO 11.06".
 */
export function computeDifal(input: DifalInput): DifalResult {
  const desp = val(input.despAcessorias)
  const ipi = val(input.ipiValue)
  const bc = (val(input.opInterna) + ipi + desp) * discountFactor(input.discount)

  const alqDest = pct(input.alqInternaDestinoPct)
  const alqOrig = pct(input.alqInterestadualOrigemPct)
  const fcp = bc * pct(input.fcpPct)

  let icmsDestino: number
  let icmsInterestadual: number

  if (input.baseDupla) {
    // LC 190/2022 — base por dentro: remove ICMS embutido da origem e re-embute pelo destino.
    const icmsEmbutidoOrigem = bc * pct(input.icmsInternaOrigemPct ?? input.alqInternaDestinoPct)
    const baseSemIcms = Math.max(0, bc - icmsEmbutidoOrigem)
    const baseAjustada = alqDest < 1 ? baseSemIcms / (1 - alqDest) : baseSemIcms
    icmsDestino = baseAjustada * alqDest
    icmsInterestadual = bc * alqOrig
  } else {
    // Base simples (maioria dos estados).
    icmsDestino = bc * alqDest
    icmsInterestadual = bc * alqOrig
  }

  const difal = Math.max(0, icmsDestino - icmsInterestadual)
  return { bc, icmsDestino, icmsInterestadual, difal, fcp }
}

// ───────────────────────── ICMS Complementar ─────────────────────────

/**
 * ICMS Complementar (LC 87/96 art. 13 §1º II) = (IPI + Desp. Acessórias) × alíq. ICMS.
 * Devido apenas a consumidor final NÃO contribuinte. NÃO sofre desconto (BC fixa).
 *
 * LEGADO: cálculo plano sem a hierarquia de ativação. Mantido como fallback interno e
 * para retrocompatibilidade. Para a decisão completa (contribuinte / CIF-FOB / bloqueio
 * ST-DIFAL / override), use `resolveIcmsComplementar`.
 */
export function computeIcmsComplementar(ipiValue: number, despAcessorias: number, icmsPct: number): number {
  const base = val(ipiValue) + val(despAcessorias)
  return base * pct(icmsPct)
}

// ───────── Hierarquia de ativação do ICMS Complementar (documento oficial 2026-06-10) ─────────

/** Modalidade de frete da OPERAÇÃO (definida no pedido). */
export type FreightMode = 'CIF' | 'FOB'

/**
 * Override manual do ICMS Complementar (casos excepcionais — ex.: isenção específica por estado).
 * `null` = automático (a hierarquia decide). `FORCE_OFF` = isenta a operação.
 */
export type IcmsComplOverride = 'FORCE_OFF' | null

export interface ResolveIcmsComplInput {
  /**
   * Destinatário é contribuinte do ICMS? (`customers.is_icms_contributor`).
   * `null`/`undefined` = destinatário não resolvido (ex.: orçamento sem cliente) → não cobra,
   * preservando o comportamento legado (nenhuma cobrança sem destinatário definido).
   */
  isContributor: boolean | null | undefined
  /** Modalidade de frete da operação (CIF/FOB). Default conservador = CIF. */
  freightMode: FreightMode
  /** Algum item da operação tem ICMS-ST ativo (acionador do produto). */
  stActive: boolean
  /** Algum item da operação tem DIFAL ativo (acionador do produto). */
  difalActive: boolean
  /** Valor do IPI apurado (R$). */
  ipiValue: number
  /** Frete + seguro (R$) — a parcela de transporte da base. Excluída na modalidade FOB. */
  freight: number
  /** Demais despesas acessórias cobradas do adquirente (R$). */
  accessory: number
  /** Valor do Imposto Seletivo (R$) — só entra na base a partir de 2027 (`isVigente`). */
  isValue?: number
  /** Alíquota ICMS herdada da operação (base 100): 17 interna, 12 interestadual. */
  icmsRate: number
  /** IS vigente? (operação com `effective_date >= 2027-01-01`). Default false. */
  isVigente?: boolean
  /** Override manual (`FORCE_OFF` isenta; `null`/ausente = automático). */
  override?: IcmsComplOverride
}

export interface ResolveIcmsComplResult {
  /** ICMS Complementar é devido nesta operação? */
  applies: boolean
  /** Base de cálculo apurada (R$). 0 quando bloqueado/isento. */
  base: number
  /** Valor do ICMS Complementar (R$) = base × alíq. ICMS. */
  value: number
  /**
   * Código do ramo decidido (auditoria): OVERRIDE_OFF | SEM_DESTINATARIO |
   * NAO_CONTRIB_ST_DIFAL | NAO_CONTRIB_AUTO | CONTRIB_FOB_PARCIAL | CONTRIB_CIF_ST |
   * CONTRIB_CIF_AUTO.
   */
  reason: string
}

/**
 * Resolve a hierarquia de ativação do ICMS Complementar (documento oficial + fluxograma,
 * 2026-06-10). Fonte ÚNICA da decisão — consumida pela Etapa 17 (`absorption.ts`).
 *
 * Sequência (espelha o fluxograma):
 *   0. override FORCE_OFF      → isenta (0).
 *   0b. destinatário ausente   → não cobra (0), preserva comportamento legado.
 *   N1: contribuinte do ICMS?
 *     ├─ NÃO (consumidor final) → N2B: ST ou DIFAL ativo? → BLOQUEADO ; senão base = IPI+frete+seguro+desp.acess.
 *     └─ SIM (contribuinte)     → N2A: frete CIF/FOB?
 *           ├─ FOB → base = só IPI (frete fora) — cobra parcial, NÃO bloqueia.
 *           └─ CIF → N3: ST ativo? → BLOQUEADO (ST absorve) ; senão base = IPI+frete+seguro.
 *
 * Camada de base (acumulativa): IPI + frete(+seguro) + desp.acess + IS — porém PODADA por ramo.
 * O IS (`isValue`) só compõe a base quando `isVigente` (>= 2027). A alíquota é herdada
 * (`icmsRate`), nunca armazenada: muda a alíquota → o valor recalcula automaticamente.
 */
export function resolveIcmsComplementar(i: ResolveIcmsComplInput): ResolveIcmsComplResult {
  const ipi = val(i.ipiValue)
  const freight = val(i.freight)
  const accessory = val(i.accessory)
  const isPart = i.isVigente ? val(i.isValue) : 0
  const rate = pct(i.icmsRate)

  const block = (reason: string): ResolveIcmsComplResult => ({ applies: false, base: 0, value: 0, reason })
  const charge = (rawBase: number, reason: string): ResolveIcmsComplResult => {
    const base = Math.max(0, rawBase)
    return { applies: base > 0 && rate > 0, base, value: base * rate, reason }
  }

  // 0. Override de isenção vence tudo.
  if (i.override === 'FORCE_OFF') return block('OVERRIDE_OFF')

  // 0b. Sem destinatário resolvido → não cobra (legado).
  if (i.isContributor == null) return block('SEM_DESTINATARIO')

  // Nível 1 — destinatário NÃO contribuinte (consumidor final) → Nível 2B.
  if (i.isContributor === false) {
    if (i.stActive || i.difalActive) return block('NAO_CONTRIB_ST_DIFAL')
    return charge(ipi + freight + accessory + isPart, 'NAO_CONTRIB_AUTO')
  }

  // Nível 2A — destinatário contribuinte → frete CIF/FOB.
  if (i.freightMode === 'FOB') {
    // Frete fora da base do vendedor → ICMS Compl. incide só sobre o IPI.
    return charge(ipi + isPart, 'CONTRIB_FOB_PARCIAL')
  }
  // CIF → Nível 3: ST ativo bloqueia (substituição já absorve o ICMS da cadeia).
  if (i.stActive) return block('CONTRIB_CIF_ST')
  return charge(ipi + freight + isPart, 'CONTRIB_CIF_AUTO')
}

// ───────── Fonte única: tributos avançados "por fora" a partir da base (EPIC-POR-FORA-V3) ─────────

/** Parâmetros (base 100) dos acionadores ICMS-ST/DIFAL avançados — espelham as colunas do produto. */
export interface AdvancedOutsideParams {
  icmsStActive?: boolean
  difalActive?: boolean
  stDifalInterestadual?: boolean
  difalBaseDupla?: boolean
  mvaOriginalPct?: number
  icmsAlqInternaDestinoPct?: number
  icmsAlqInterestadualOrigemPct?: number
  icmsInternaOrigemPct?: number
  fcpAlqPct?: number
}

export interface AdvancedOutsideResult {
  /** Decomposição completa do ICMS-ST (null quando inativo). */
  st: IcmsStResult | null
  /** Decomposição completa do DIFAL + FCP (null quando inativo). */
  difal: DifalResult | null
  /** Total "por fora" a somar ao preço final = ICMS-ST + DIFAL + FCP. */
  total: number
}

/**
 * FONTE ÚNICA dos tributos avançados "por fora" (ICMS-ST + DIFAL + FCP) a partir da base.
 * Usado pelo cadastro (exibição do preço final / painéis de auditoria) E pelo save, garantindo
 * que exibição e persistência produzam EXATAMENTE os mesmos valores (invariante cadastro↔save).
 *
 * - `opInterna` = operação por dentro (preço NF-e, sem Desp. Acessórias).
 * - `despAcessorias` = frete + seguro + despesas acessórias.
 * - `ipiValue` = IPI apurado (R$).
 * - `discount` (decimal) = aplicado apenas no orçamento (frete fixo D3); no cadastro é 0/omitido.
 *
 * ICMS-ST e DIFAL nunca coexistem (acionadores exclusivos), mas o helper não impõe isso —
 * apenas computa o que estiver ativo.
 */
export function computeAdvancedOutsideTaxes(
  opInterna: number,
  despAcessorias: number,
  ipiValue: number,
  p: AdvancedOutsideParams | null | undefined,
  discount?: number,
): AdvancedOutsideResult {
  const st = p?.icmsStActive
    ? computeIcmsSt({
        opInterna,
        despAcessorias,
        ipiValue,
        mvaOriginalPct: p.mvaOriginalPct,
        alqInternaDestinoPct: p.icmsAlqInternaDestinoPct,
        alqInterestadualOrigemPct: p.icmsAlqInterestadualOrigemPct,
        interestadual: p.stDifalInterestadual,
        discount,
      })
    : null
  const difal = p?.difalActive
    ? computeDifal({
        opInterna,
        despAcessorias,
        ipiValue,
        alqInternaDestinoPct: p.icmsAlqInternaDestinoPct,
        alqInterestadualOrigemPct: p.icmsAlqInterestadualOrigemPct,
        fcpPct: p.fcpAlqPct,
        baseDupla: p.difalBaseDupla,
        icmsInternaOrigemPct: p.icmsInternaOrigemPct,
        discount,
      })
    : null
  const total = (st?.icmsSt || 0) + (difal?.difal || 0) + (difal?.fcp || 0)
  return { st, difal, total }
}

/**
 * Total a cobrar do cliente (EPIC-POR-FORA-V2 R1 — doc v4 Tab. 30/36): o "VALOR DO ORÇAMENTO"
 * soma os tributos por fora destacados (ICMS-ST + DIFAL + FCP + ICMS Complementar) ao total da
 * operação. Valor DERIVADO — NÃO contamina `total_value` (que alimenta RRO/desconto/comissão).
 * Aceita um registro de budget/order/sale com os campos consolidados (qualquer ausente = 0).
 */
export function computeTotalACobrar(record: {
  total_value?: number | null
  icms_st_value?: number | null
  difal_value?: number | null
  fcp_value?: number | null
  icms_compl_value?: number | null
} | null | undefined): number {
  if (!record) return 0
  return (
    (Number(record.total_value) || 0) +
    (Number(record.icms_st_value) || 0) +
    (Number(record.difal_value) || 0) +
    (Number(record.fcp_value) || 0) +
    (Number(record.icms_compl_value) || 0)
  )
}

// ───────── Consolidação lateral (orçamento / pedido / venda) — EPIC-POR-FORA-V2 S4a ─────────

export interface StDifalItemLike {
  product_id?: string | null
  quantity?: number | null
}

export interface StDifalConsolidated {
  st: number
  difal: number
  fcp: number
}

/**
 * Consolida ICMS-ST / DIFAL / FCP de uma lista de itens (orçamento/venda), por produto,
 * recalculados sobre a base pós-desconto — BC = (OpDentro+Desp.Acess+IPI)×(1−d). Fonte ÚNICA usada por
 * `orcamentos`, `pedidos` e `vendas` (evita drift fiscal entre superfícies — Architect R5).
 *
 * - `products` deve conter as colunas avançadas (base 100): icms_st_active, difal_active,
 *   st_difal_interestadual, difal_base_dupla, mva_original_pct, icms_alq_interna_destino_pct,
 *   icms_alq_interestadual_origem_pct, icms_interna_origem_pct, fcp_alq_pct, e ipi_value,
 *   sale_price_base, freight_value, insurance_value, accessory_expenses_value.
 * - `discountPct` em base 100 (ex.: 10 = 10%).
 * - Só acumula quando o produto tem `icms_st_active` ou `difal_active` (ST e DIFAL exclusivos).
 */
export function consolidateStDifalFromItems(
  items: StDifalItemLike[],
  products: any[],
  discountPct: number,
): StDifalConsolidated {
  const d = (Number(discountPct) || 0) / 100
  return (items || []).reduce<StDifalConsolidated>((acc, i) => {
    const prod = i?.product_id ? (products || []).find((p) => p?.id === i.product_id) : null
    if (!prod || (!prod.icms_st_active && !prod.difal_active)) return acc
    const qty = Number(i?.quantity) || 0
    if (qty <= 0) return acc
    const terc =
      (Number(prod.freight_value) || 0) +
      (Number(prod.insurance_value) || 0) +
      (Number(prod.accessory_expenses_value) || 0)
    const opInternaTotal = Math.max(0, (Number(prod.sale_price_base) || 0) - terc) * qty
    const despTotal = terc * qty
    const ipiValueTotal = (Number(prod.ipi_value) || 0) * qty
    if (prod.icms_st_active) {
      acc.st += computeIcmsSt({
        opInterna: opInternaTotal,
        despAcessorias: despTotal,
        ipiValue: ipiValueTotal,
        mvaOriginalPct: Number(prod.mva_original_pct) || 0,
        alqInternaDestinoPct: Number(prod.icms_alq_interna_destino_pct) || 0,
        alqInterestadualOrigemPct: Number(prod.icms_alq_interestadual_origem_pct) || 0,
        interestadual: !!prod.st_difal_interestadual,
        discount: d,
      }).icmsSt
    }
    if (prod.difal_active) {
      const r = computeDifal({
        opInterna: opInternaTotal,
        despAcessorias: despTotal,
        ipiValue: ipiValueTotal,
        alqInternaDestinoPct: Number(prod.icms_alq_interna_destino_pct) || 0,
        alqInterestadualOrigemPct: Number(prod.icms_alq_interestadual_origem_pct) || 0,
        fcpPct: Number(prod.fcp_alq_pct) || 0,
        baseDupla: !!prod.difal_base_dupla,
        icmsInternaOrigemPct: Number(prod.icms_interna_origem_pct) || 0,
        discount: d,
      })
      acc.difal += r.difal
      acc.fcp += r.fcp
    }
    return acc
  }, { st: 0, difal: 0, fcp: 0 })
}
