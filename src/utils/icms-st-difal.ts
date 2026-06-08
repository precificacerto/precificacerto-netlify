/**
 * icms-st-difal.ts — Tributos "por fora" AVANÇADOS (guia "Alíquotas tributárias adicionais").
 *
 * Implementa ICMS-ST (Substituição Tributária — LC 87/96 art. 8º II) e DIFAL (Diferencial de
 * Alíquota — LC 87/96 art. 13 + EC 87/2015 + LC 190/2022), conforme a Base de Conhecimento
 * Fiscal v4 (seções 8.6–8.9 e Manual 9) e o exemplo canônico "Motor RRO 29.05.xlsx".
 *
 * Regras invioláveis (EPIC-POR-FORA-V2):
 *   - ICMS-ST e DIFAL são RECALCULADOS sobre a base (nunca redistribuídos) e NÃO integram o RRO.
 *   - Frete é FIXO no desconto (D3): a base pós-desconto = OpDentro×(1−d) + Desp.Acess + IPI.
 *     (Padroniza ICMS-ST e DIFAL — recomendação Tabela 77 do doc v4.)
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
  /** Fator de desconto d (decimal). Frete fixo (D3): BC = opInterna×(1−d) + Desp.Acess + IPI. */
  discount?: number
}

export interface IcmsStResult {
  /** BC própria = OpDentro×(1−d) + IPI + Desp. Acessórias. */
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
 * Calcula o ICMS-ST como DIFERENÇA (presumido − próprio) sobre a base própria, aplicando o
 * fator de desconto à operação por dentro (frete e IPI permanecem fixos — D3).
 */
export function computeIcmsSt(input: IcmsStInput): IcmsStResult {
  const op = val(input.opInterna) * discountFactor(input.discount)
  const desp = val(input.despAcessorias)
  const ipi = val(input.ipiValue)

  const bcPropria = op + ipi + desp

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
  /** Fator de desconto d (decimal). Frete fixo (D3): BC = opInterna×(1−d) + Desp.Acess + IPI. */
  discount?: number
}

export interface DifalResult {
  /** BC do DIFAL = OpDentro×(1−d) + IPI + Desp. Acessórias. */
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
 * Calcula o DIFAL (base simples ou dupla) e o FCP. Frete fixo no desconto (D3).
 */
export function computeDifal(input: DifalInput): DifalResult {
  const op = val(input.opInterna) * discountFactor(input.discount)
  const desp = val(input.despAcessorias)
  const ipi = val(input.ipiValue)
  const bc = op + ipi + desp

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
 */
export function computeIcmsComplementar(ipiValue: number, despAcessorias: number, icmsPct: number): number {
  const base = val(ipiValue) + val(despAcessorias)
  return base * pct(icmsPct)
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
 * recalculados sobre a âncora pós-desconto (frete fixo — D3). Fonte ÚNICA usada por
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
