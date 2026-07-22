/**
 * mrm-engine-v17/legacy-adapter.ts — Compatibilidade V17 ↔ V16
 *
 * EPIC-MRM-V17 (2026-05-28)
 *
 * Permite que páginas existentes (orcamentos, pedidos, vendas) e componentes
 * downstream (useResidualDistribution, ConsolidatedDREBlock, mrm-display-extractor)
 * continuem funcionando sem refactor profundo, enquanto o motor real por baixo
 * é o V17.
 *
 * Estratégia: distribui o resultado consolidado V17 proporcional ao RB de cada
 * item, produzindo um array de "TaxBreakdown-like" no shape esperado pelo V16.
 *
 * Limitação conhecida: os valores `new_commission`/`new_profit`/`new_csll`/
 * `new_irpj` por item são RATEIOS proporcionais ao RB, não cálculos individuais
 * (consistente com o princípio "orçamento consolida, não recalcula").
 *
 * Após a UI ser atualizada para consumir `MotorV17Result` diretamente, este
 * adapter será deprecado.
 */

import type {
  AbsorptionPolicy,
  CascadeStep,
  EngineItemV17,
  IcmsComplMotorInput,
  MotorV17Input,
  MotorV17Result,
  OutsideItemProfile,
  TaxBreakdown,
  TaxLine,
  TaxRatePeriod,
  TaxRegime,
} from '@/types/mrm'
import {
  MRM_ENGINE_VERSION_V17,
} from '@/types/mrm'

import { calculateMotorV17 } from '../mrm-engine-v17'
import {
  mergeItemAndTenantRates,
  resolveStructuralProfitTaxes,
  type ItemTaxRates,
} from '../item-tax-rates'

/**
 * Item esperado pelas páginas (subset do BudgetItemRow / OrderItemRow / SaleItemRow).
 * Equivale ao input de `buildMotorInput` do orchestrator V16.
 */
export interface PageItem {
  unit_price: number
  quantity: number
  cost_total?: number | null
  productive_labor_unit?: number | null
  commission_percent?: number | null
  profit_percent?: number | null
  /** EPIC-RT v8: RT (Comissão Reserva Técnica) do cadastro do produto — % base-100. */
  rt_reserve_percent?: number | null
  /** Alíquotas tributárias específicas do item (V17: merge com tenant). */
  item_tax_rates?: ItemTaxRates | null
  expense_breakdown_unit?: {
    mo_admin: { rate: number; amount_unit: number }
    fixa: { rate: number; amount_unit: number }
    variavel: { rate: number; amount_unit: number }
    financeira: { rate: number; amount_unit: number }
    cmv_unit?: number
  } | null
  financial_expense_unit?: number | null
  /**
   * V17 Op Interna (R$ unitário) — DEPRECATED em favor dos campos abaixo.
   * Origem: `products.valor_precificado_icms_piscofins` (frequentemente errado/stale).
   * Quando os 4 campos abaixo estão disponíveis, são preferidos.
   */
  valor_op_interna_unit?: number | null
  /**
   * V17 fix (2026-05-28 noite): preço base PRÉ impostos por fora (R$ unitário).
   * = Op Interna + Atividades Terceirizadas (frete + seguro + despesas acessórias).
   * Origem: `products.sale_price_base` (campo confiável, sempre populado).
   */
  sale_price_base_unit?: number | null
  /**
   * V17 fix: atividades terceirizadas (R$ unitário). Frete + Seguro + Despesas Acessórias.
   * Origem: `products.freight_value + insurance_value + accessory_expenses_value`.
   * Usado para calcular Op Interna real: `sale_price_base_unit - terceirizadas_unit`.
   */
  terceirizadas_unit?: number | null
  /**
   * Relatório 21/07/2026 (item 2): item adicionado manualmente no orçamento
   * ("Adicionar item manual"). Seu valor integral (qtd × unit_price) é tratado como
   * CUSTO PURO na "Consolidação dos custos" (Etapa 4) — fora da cascata de produtos:
   * não recebe DOP/tributo/comissão/lucro/RT, tem resíduo 0 e é IMUNE a desconto
   * (mesma regra de frete/despesas acessórias fixas). Ver `calculateMotorV17ForPage`.
   */
  is_manual_cost?: boolean
}

export interface PageTenantCtx {
  regime: TaxRegime
  rates: TaxRatePeriod[]
  mod_pct?: number | null
  dop_pct?: number | null
  csll_pct?: number | null
  irpj_pct?: number | null
  useSnapshotRates?: boolean
  absorption_policy?: AbsorptionPolicy | null
  expense_breakdown?: {
    fixed_pct?: number | null
    variable_pct?: number | null
    financial_pct?: number | null
    administrative_pct?: number | null
  } | null
}

export interface PageBuildArgs {
  items: PageItem[]
  tenantCtx: PageTenantCtx
  globalDiscountPercent: number
  effectiveDate?: string
  /**
   * Hierarquia completa do ICMS Complementar da OPERAÇÃO (destinatário contribuinte? + frete
   * CIF/FOB + bloqueio ST/DIFAL + override). Quando presente, substitui o binário
   * `icmsComplApplies`. Frete/accessory já consolidados pelo caller (página).
   */
  icmsCompl?: IcmsComplMotorInput
  /**
   * Ativa o ICMS Complementar (LC 87/1996, art. 13, §1º, II) na Etapa 17: só quando o
   * destinatário for consumidor final NÃO contribuinte do ICMS
   * (`customers.is_icms_contributor === false`). Default: false.
   */
  icmsComplApplies?: boolean
}

/**
 * Resultado "TaxBreakdown-like" por item — shape compatível com V16.
 * Componentes downstream continuam consumindo `new_commission`, `new_profit`, etc.
 */
export type LegacyMotorResult = Pick<
  TaxBreakdown,
  | 'new_commission'
  | 'new_profit'
  | 'new_csll'
  | 'new_irpj'
  | 'rro'
  | 'cascade_trace'
  | 'engine_version'
  | 'status'
  | 'taxes_inside'
  | 'taxes_outside'
  | 'imp_total'
  | 'rb'
  | 'desc_value'
  | 'rv'
  | 'cp'
  | 'mod'
  | 'dop'
  // Adendo 28-A (Julho 2026): Âncora Gerencial pós-desconto rateada por item
  // (= motor.ancora × rb_i/rbTotal). Σ por item = motor.ancora — denominador ÚNICO
  // da alíquota efetiva de margem no card, IDÊNTICO ao usado na Etapa 16 do RRO.
  // ATENÇÃO: carrega a âncora PÓS-absorção de Desp. Acessória (motor.ancora), que
  // difere do `TaxBreakdown.ancora_interna` canônico (rv × peso, PRÉ-absorção) por
  // `despPoolAdjustment × peso`. NÃO "corrigir" para rv×peso — quebraria a coerência
  // card ↔ Etapa 16 (Adendo Seção 28-A, regra inviolável).
  | 'ancora_interna'
> & {
  /** Marker pra debug — identifica que veio via adapter V17. */
  _v17_adapter: true
  /**
   * V17 (2026-05-28): expense_breakdown POR ITEM (rateio proporcional do total).
   * Usado pela DRE Consolidada para exibir despesas calculadas pelo motor
   * (sobre Op Interna) em vez de recalcular sobre Receita Líquida.
   */
  expense_breakdown_v17?: {
    mo_admin: number
    fixa: number
    variavel: number
    financeira: number
  } | null
}

// ─────────────────────── Item manual = custo puro (Relatório 21/07/2026, item 2) ───────────────────────

/** Detecta item "Adicionar item manual" (custo puro, fora da cascata de produtos). */
function isManualCostItem(item: PageItem): boolean {
  return item.is_manual_cost === true
}

/**
 * Soma o valor integral (qtd × unit_price) de um item manual — o custo fixo que ele
 * injeta na "Consolidação dos custos". Zero/negativo ⇒ 0 (item ignorado).
 */
function manualItemCost(item: PageItem): number {
  const v = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
  return v > 0 ? v : 0
}

/**
 * Injeta o custo dos itens manuais no display da Etapa 4 ("Consolidação dos custos"),
 * como custo puro (child dedicado). NÃO toca as etapas de tributo/desconto/RRO — o
 * item manual é imune a desconto e não gera resíduo. Retorna um NOVO array (o trace é
 * compartilhado entre os itens do orçamento, então não pode ser mutado no lugar).
 */
function augmentTraceWithManualCost(
  trace: CascadeStep[] | undefined,
  manualFixedCost: number,
): CascadeStep[] | undefined {
  if (!Array.isArray(trace) || manualFixedCost <= 0) return trace
  const manualChild: CascadeStep = {
    step: 4,
    label: 'Itens manuais (custo puro)',
    base: null,
    rate: null,
    amount: manualFixedCost,
    formula: 'Σ (qtd × valor) dos itens manuais — custo fixo, imune a desconto e tributo',
    source: 'ITEMS',
  }
  return trace.map((s) =>
    s.step === 4
      ? {
          ...s,
          amount: (Number(s.amount) || 0) + manualFixedCost,
          children: [...(s.children ?? []), manualChild],
        }
      : s,
  )
}

/** Trace compacto para orçamento SÓ com itens manuais (sem produtos): custo = total, RRO = 0. */
function buildManualOnlyCascadeTrace(manualFixedCost: number): CascadeStep[] {
  const manualChild: CascadeStep = {
    step: 4,
    label: 'Itens manuais (custo puro)',
    base: null,
    rate: null,
    amount: manualFixedCost,
    formula: 'Σ (qtd × valor) dos itens manuais — custo fixo, imune a desconto e tributo',
    source: 'ITEMS',
  }
  return [
    {
      step: 1,
      label: 'Fragmentação individual',
      base: null,
      rate: null,
      amount: manualFixedCost,
      formula: 'Σ unit_price × quantity dos itens manuais',
      source: 'ITEMS',
    },
    {
      step: 4,
      label: 'Consolidação dos custos',
      base: null,
      rate: null,
      amount: manualFixedCost,
      formula: 'Itens manuais entram integralmente como custo puro',
      source: 'ITEMS',
      children: [manualChild],
    },
    {
      step: 9,
      label: 'Venda consolidada',
      base: null,
      rate: null,
      amount: manualFixedCost,
      formula: 'Total dos itens manuais (imune a desconto)',
      source: 'ITEMS',
    },
    {
      step: 15,
      label: 'Resultado Residual Operacional (RRO)',
      base: manualFixedCost,
      rate: null,
      amount: 0,
      formula: 'Itens manuais são custo puro ⇒ resíduo 0 (sem comissão/lucro/RT)',
      source: 'ETAPA_4',
    },
  ]
}

/** Resultado por item de um item manual: custo puro, resíduo 0, imune a desconto/tributo. */
function synthesizeManualResult(
  value: number,
  trace: CascadeStep[] | undefined,
  status: LegacyMotorResult['status'],
): LegacyMotorResult {
  return {
    _v17_adapter: true,
    engine_version: MRM_ENGINE_VERSION_V17,
    new_commission: 0,
    new_profit: 0,
    new_csll: 0,
    new_irpj: 0,
    rro: 0,
    rb: value,
    desc_value: 0,
    rv: value,
    ancora_interna: 0,
    cp: value,
    mod: 0,
    dop: 0,
    taxes_inside: [],
    taxes_outside: [],
    imp_total: 0,
    cascade_trace: trace ?? [],
    status,
    expense_breakdown_v17: null,
  }
}

/**
 * Calcula motor V17 para uma página inteira e retorna array compatível V16.
 *
 * Substitui `calculateMarginReapuration(buildMotorInput(...))` em:
 *   - src/pages/orcamentos/index.tsx
 *   - src/pages/pedidos/index.tsx
 *   - src/pages/vendas/index.tsx
 *
 * Retorna `null` para items inválidos (preserva contract V16).
 *
 * Relatório 21/07/2026 (item 2): itens manuais (`is_manual_cost`) são EXCLUÍDOS da
 * cascata de produtos (para não distorcer pesos/tributos/desconto) e reinjetados como
 * custo puro na Etapa 4 + resultado por item com resíduo 0. Orçamento sem itens manuais
 * é bit-exact idêntico ao comportamento anterior.
 */
export function calculateMotorV17ForPage(args: PageBuildArgs): (LegacyMotorResult | null)[] {
  const { items, tenantCtx, globalDiscountPercent } = args

  // ───── Filtra items válidos (itens manuais são separados como custo puro) ─────
  const validItems: { item: PageItem; idx: number }[] = []
  const manualIndices: number[] = []
  let manualFixedCost = 0
  items.forEach((item, idx) => {
    const itemBase = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
    if (itemBase <= 0) return
    // Relatório 21/07/2026 (item 2): item manual NÃO entra na cascata de produtos.
    if (isManualCostItem(item)) {
      manualFixedCost += manualItemCost(item)
      manualIndices.push(idx)
      return
    }
    validItems.push({ item, idx })
  })

  // ───── Caso sem produtos ─────
  if (validItems.length === 0) {
    const results: (LegacyMotorResult | null)[] = items.map((): LegacyMotorResult | null => null)
    // Orçamento SÓ com itens manuais: custo puro = total, RRO 0 (Cenário A do oráculo).
    if (manualFixedCost > 0) {
      const manualTrace = buildManualOnlyCascadeTrace(manualFixedCost)
      for (const idx of manualIndices) {
        results[idx] = synthesizeManualResult(manualItemCost(items[idx]), manualTrace, 'VALID')
      }
    }
    return results
  }

  // ───── Converte PageItem → EngineItemV17 ─────
  // ADENDO 25-A: além do EngineItem, coletamos o PERFIL POR FORA de cada produto (alíquotas
  // individuais + desp. acessória + Op Interna p/ peso) para a consolidação por SOMA na Etapa 17.
  const outsideProfiles: {
    opInterna: number
    desp: number
    rates: { is: number; ibs: number; cbs: number; ipi: number; icms: number }
  }[] = []
  const engineItems: EngineItemV17[] = validItems.map(({ item, idx }) => {
    const qty = Number(item.quantity) || 0
    // FIX peso/desp (2026-06-16): `unit_price` (= products.sale_price) EMBUTE a Desp.
    // Acessória — ver iva-dual-outside.ts:205 (finalPrice = op.interna + desp + por-fora).
    // A Desp. Acessória NÃO compõe o peso interno/externo nem a base do RRO; ela é uma
    // camada SEPARADA (canal `desp_acessorias`, somada depois). Por isso removemos a desp
    // do `rb` E do denominador do peso de forma CONSISTENTE: como a âncora = rb × peso =
    // op.interna, ela permanece invariante, mas o peso passa a refletir só
    // op.interna ÷ (op.interna + op.externa) e o rb deixa de carregar a desp.
    const terceirizadasUnit = Number(item.terceirizadas_unit) || 0
    const salePriceBaseUnit = Number(item.sale_price_base_unit) || 0
    const unitPriceRaw = Number(item.unit_price) || 0
    // Só "limpa" a desp quando há op.interna confiável (sale_price_base presente indica que
    // os tributos por fora foram lançados e a desp foi de fato somada ao sale_price). Item
    // manual / sem cadastro mantém o unit_price cheio (terceirizadas costuma ser 0).
    const hasReliableOpInterna = salePriceBaseUnit > 0 && unitPriceRaw > 0
    const rbBaseUnit = hasReliableOpInterna
      ? Math.max(0, unitPriceRaw - terceirizadasUnit)
      : unitPriceRaw
    const rb = rbBaseUnit * qty

    // CMV canônico — Relatório RRO v1.0 (26/06/2026), Correção 1 (Item 4 / CMV Efetivo):
    // A fonte PRIMÁRIA do CMV é o "Custo produto" da Operação Interna de cada produto
    // (= cost_total + productive_labor_unit, "Itens + MOD", exibido em vermelho no cadastro).
    // É esse campo que o motor deve ler — e somente ele. O snapshot V14
    // (expense_breakdown_unit.cmv_unit) passa a ser FALLBACK defensivo, usado só quando o
    // "Custo produto" não existir (produto sem custo cadastrado). Antes o snapshot tinha
    // prioridade e, quando stale/divergente, inflava o Item 4 (ex.: 150.319,70 vs 141.172,85
    // corretos — base intermediária divergente). Ver ADR-020.
    const custoProduto =
      ((Number(item.cost_total) || 0) + (Number(item.productive_labor_unit) || 0)) * qty
    const snapshotCmv = Number(item.expense_breakdown_unit?.cmv_unit) || 0
    const cmvUsed = custoProduto > 0 ? custoProduto : snapshotCmv * qty

    // DOP agregado (4 buckets do tenant)
    const eb = tenantCtx.expense_breakdown ?? null
    const dopAdminNominal = eb ? (Number(eb.administrative_pct) || 0) : 0
    const dopFixedNominal = eb ? (Number(eb.fixed_pct) || 0) : 0
    const dopVariableNominal = eb ? (Number(eb.variable_pct) || 0) : 0
    const dopFinancialNominal = eb ? (Number(eb.financial_pct) || 0) : 0
    const dop_pct_nominal = eb
      ? dopAdminNominal + dopFixedNominal + dopVariableNominal + dopFinancialNominal
      : (Number(tenantCtx.dop_pct) || 0)

    // V17 fix DOP_pct efetivo (2026-05-28 noite revisão 3):
    // Cadastro do produto calcula DOP sobre Op Interna (não RB).
    // Para o motor V17 (que faz rb × dop_pct), convertemos pct nominal para efetivo:
    //   dop_pct_efetivo = dop_pct_nominal × peso_op_interna
    // Resultado: motor faz rb × dop_pct_efetivo = rb × pct × (op_interna/rb)
    //                                            = op_interna × pct ✅ bate cadastro
    // Denominador LIMPO (rbBaseUnit = unit_price − desp): mantém a identidade
    // rbBaseUnit × dop_pct_efetivo = op.interna × dop_pct_nominal (despesa sobre Op Interna).
    const pesoOpInternaTemp = hasReliableOpInterna && rbBaseUnit > 0
      ? Math.max(0, Math.min(1, (salePriceBaseUnit - terceirizadasUnit) / rbBaseUnit))
      : 1
    const dop_pct = dop_pct_nominal * pesoOpInternaTemp

    // Adendo Seção 31-A (itens 1-2): decomposição EFETIVA do dop_pct nos 4 buckets
    // (nominal × peso). Σ == dop_pct. Alimenta a Etapa 5 discriminada de forma que
    // reconcilie com o total e some a MO Administrativa (tenant) de todos os produtos.
    // Só disponível quando o tenant tem o breakdown por bucket (eb); senão null (fallback).
    const dop_components = eb
      ? {
          mo_admin: dopAdminNominal * pesoOpInternaTemp,
          fixa: dopFixedNominal * pesoOpInternaTemp,
          variavel: dopVariableNominal * pesoOpInternaTemp,
          financeira: dopFinancialNominal * pesoOpInternaTemp,
        }
      : null

    // mod_pct (V9 D1 — sempre 0 no V17 por princípio, MOD vai pro CMV)
    const mod_pct = 0

    // % decimais do item (comissão/lucro do cadastro do produto)
    const commission_pct = (Number(item.commission_percent) || 0) / 100
    const profit_pct = (Number(item.profit_percent) || 0) / 100
    // EPIC-RT v8: RT (Comissão Reserva Técnica) — decimal do cadastro do produto.
    const rt_pct = (Number(item.rt_reserve_percent) || 0) / 100
    // ADENDO RRO (2026-06-02, Seção 23.1): pesos de redistribuição derivam dos
    // percentuais ESTRUTURAIS por produto. Em LUCRO_REAL, IRPJ/CSLL incidem sobre
    // o lucro do produto (profit_pct × alíquota nominal), não sobre a margem global
    // do tenant — que distorcia os pesos (margem 0 → default 12%).
    const { csll_pct, irpj_pct } = resolveStructuralProfitTaxes(
      tenantCtx.regime,
      profit_pct,
      item.item_tax_rates ?? null,
      Number(tenantCtx.csll_pct) || 0,
      Number(tenantCtx.irpj_pct) || 0,
    )

    // V17 fix DOP via Op Interna (2026-05-28 noite revisão 3):
    // Cadastro do produto calcula despesas sobre Op Interna (não RB).
    // Quando temos sale_price_base_unit + terceirizadas, calculamos op_interna_unit
    // e gerar snapshot V14 sintético com despesas calculadas sobre OP INTERNA.
    // Isso faz DOP bater com cadastro do produto:
    //   - cadastro: 27,7% × R$ 11.847,88 = R$ 3.281,86 ✅
    //   - V17 antes: 27,7% × R$ 22.888,21 = R$ 6.340,03 ❌
    const salePriceBaseLocal = Number(item.sale_price_base_unit) || 0
    const terceirizadasLocal = Number(item.terceirizadas_unit) || 0
    const opInternaUnit = salePriceBaseLocal > 0
      ? salePriceBaseLocal - terceirizadasLocal
      : 0

    const ebSnapshot = item.expense_breakdown_unit
    type ExpenseBreakdownAmount = {
      mo_admin: { rate: number; amount: number }
      fixa: { rate: number; amount: number }
      variavel: { rate: number; amount: number }
      financeira: { rate: number; amount: number }
    }
    let expense_breakdown: ExpenseBreakdownAmount | undefined

    if (ebSnapshot) {
      // V14 snapshot do produto (banco populou) — usar direto
      expense_breakdown = {
        mo_admin: {
          rate: Number(ebSnapshot.mo_admin?.rate) || 0,
          amount: (Number(ebSnapshot.mo_admin?.amount_unit) || 0) * qty,
        },
        fixa: {
          rate: Number(ebSnapshot.fixa?.rate) || 0,
          amount: (Number(ebSnapshot.fixa?.amount_unit) || 0) * qty,
        },
        variavel: {
          rate: Number(ebSnapshot.variavel?.rate) || 0,
          amount: (Number(ebSnapshot.variavel?.amount_unit) || 0) * qty,
        },
        financeira: {
          rate: Number(ebSnapshot.financeira?.rate) || 0,
          amount: (Number(ebSnapshot.financeira?.amount_unit) || 0) * qty,
        },
      }
    } else if (opInternaUnit > 0 && eb) {
      // V17 fix: calcula despesas sobre Op Interna (não RB) — bate cadastro
      const moAdminP = Number(eb.administrative_pct) || 0
      const fixaP = Number(eb.fixed_pct) || 0
      const varP = Number(eb.variable_pct) || 0
      const finP = Number(eb.financial_pct) || 0
      const opInternaTotal = opInternaUnit * qty
      expense_breakdown = {
        mo_admin: { rate: moAdminP, amount: opInternaTotal * moAdminP },
        fixa: { rate: fixaP, amount: opInternaTotal * fixaP },
        variavel: { rate: varP, amount: opInternaTotal * varP },
        financeira: { rate: finP, amount: opInternaTotal * finP },
      }
    } else {
      expense_breakdown = undefined
    }

    // V17 fix DOP_pct: quando expense_breakdown calculado sobre Op Interna,
    // ajusta dop_pct para refletir taxa efetiva sobre RB (motor usa rb × dop_pct)
    // mas o motor agora também usa expense_breakdown.*.amount direto (V14 path).
    // Mantém dop_pct para fallback, mas o motor preferirá os amounts do snapshot.

    // V17 fix peso_op_interna real (2026-05-28 noite - revisão 2):
    // PRIORIDADE de cálculo:
    //   1) Fórmula confiável: (sale_price_base - terceirizadas) / unit_price
    //      → bate exato com cadastro do produto (validado via SQL no banco)
    //   2) Campo legacy valor_op_interna_unit (frequentemente errado/stale)
    //   3) Fallback 1 (toda venda tratada como Op Interna)
    const unitPrice = Number(item.unit_price) || 0
    const salePriceBase = Number(item.sale_price_base_unit) || 0
    const terceirizadas = Number(item.terceirizadas_unit) || 0
    const valorOpInternaLegacy = Number(item.valor_op_interna_unit) || 0

    let peso_op_interna: number
    if (salePriceBase > 0 && unitPrice > 0) {
      // FÓRMULA CORRETA (preferida). Denominador = rbBaseUnit (op.interna + op.externa,
      // SEM desp. acessória) — ver FIX peso/desp acima. peso = op.interna ÷ rbBaseUnit.
      const opInternaCorreta = salePriceBase - terceirizadas
      peso_op_interna = opInternaCorreta > 0 && rbBaseUnit > 0
        ? Math.min(1, Math.max(0, opInternaCorreta / rbBaseUnit))
        : 1
    } else if (valorOpInternaLegacy > 0 && rbBaseUnit > 0) {
      // Fallback campo legacy (também sobre o rb limpo)
      peso_op_interna = Math.min(1, Math.max(0, valorOpInternaLegacy / rbBaseUnit))
    } else {
      peso_op_interna = 1
      // Fallback perigoso: sem sale_price_base nem valor_op_interna, a âncora vira o unit_price
      // CHEIO. Para item COM produto (item_tax_rates presente), isso pode inflar o RRO caso o preço
      // inclua tributos por fora. Item manual (sem produto/sem tax_rates) é legítimo aqui.
      if (item.item_tax_rates != null && unitPrice > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[MRM V17] peso_op_interna=1 (fallback) no item idx-${idx} COM produto: ` +
            `sale_price_base e valor_op_interna ausentes — a âncora assume o unit_price cheio e ` +
            `pode inflar o RRO. Verifique o cadastro do produto (campo sale_price_base).`,
        )
      }
    }

    // V17 fix CMV via reverse markup (2026-05-28 noite revisão 2):
    // Quando produto tem cost_total = 0 no banco (módulo Precificação não persiste),
    // derivamos CMV a partir do Op Interna usando a mesma fórmula que o módulo
    // de cadastro do produto usou:
    //   cmv = Op_Interna × (1 − Σ pcts_internos_PRODUTO)
    // IMPORTANTE: usa apenas pcts DO PRODUTO (não fallback tenant), pois o produto
    // pode ter Lucro 0%, Comissão 0%, IRPJ 0%, CSLL 0% explicitamente no cadastro.
    let cmvFinal = cmvUsed
    if (cmvFinal <= 0 && salePriceBase > 0) {
      const opInterna = (salePriceBase - terceirizadas) * qty
      // Pcts do PRODUTO (não usa fallback tenant para CMV reverse)
      const itemRates = item.item_tax_rates ?? null
      const normalize = (v: unknown) => {
        const n = Number(v) || 0
        return n < 1 ? n : n / 100
      }
      const icmsPctP = normalize(itemRates?.icms_pct)
      const pisPctP = normalize(itemRates?.pis_pct)
      const cofinsPctP = normalize(itemRates?.cofins_pct)
      const issPctP = normalize(itemRates?.iss_pct)
      // Para CSLL/IRPJ na fórmula CMV reverse, usa só do produto (não tenant)
      const csllPctP = normalize(itemRates?.csll_pct)
      const irpjPctP = normalize(itemRates?.irpj_pct)
      // commission_pct e profit_pct já vêm em decimal, do item
      const commissionP = Number(item.commission_percent) / 100 || 0
      const profitP = Number(item.profit_percent) / 100 || 0

      // CMV reverse markup usa dop_pct_nominal (sobre Op Interna), não o efetivo (sobre RB)
      const sumInternalRates =
        icmsPctP + pisPctP + cofinsPctP + issPctP +
        commissionP + profitP + csllPctP + irpjPctP + dop_pct_nominal
      const reverseFactor = Math.max(0, 1 - sumInternalRates)
      cmvFinal = opInterna * reverseFactor
    }

    // V17 (2026-05-28): calcula impostos por dentro POR PRODUTO usando alíquotas
    // do próprio item (item_tax_rates). Multi-produto com alíquotas distintas
    // resulta em consolidação correta (não usa rate estática do tenant).
    // Base = Op_Interna do produto (Op_Interna_unit × qty).
    const opInternaTotal = opInternaUnit > 0 ? opInternaUnit * qty : rb * peso_op_interna
    const itemRatesForTaxes = item.item_tax_rates ?? null
    const normalizePct = (v: unknown) => {
      const n = Number(v) || 0
      return n < 1 ? n : n / 100
    }
    const icmsPctItem = normalizePct(itemRatesForTaxes?.icms_pct)
    const issPctItem = normalizePct(itemRatesForTaxes?.iss_pct)
    const pisPctItem = normalizePct(itemRatesForTaxes?.pis_pct)
    const cofinsPctItem = normalizePct(itemRatesForTaxes?.cofins_pct)
    const taxes_inside_amounts = (itemRatesForTaxes && opInternaTotal > 0)
      ? {
          icms: opInternaTotal * icmsPctItem,
          iss: opInternaTotal * issPctItem,
          pis_cofins: opInternaTotal * (pisPctItem + cofinsPctItem),
        }
      : undefined

    // ADENDO 25-A: perfil por fora do produto. Alíquotas via merge item+tenant (normalização
    // canônica, incl. fix IBS/CBS sempre %). Op Interna (base do peso da âncora) e desp. do item.
    const itemMergedRates = mergeItemAndTenantRates(item.item_tax_rates ?? null, tenantCtx.rates ?? [])
    const despItem = terceirizadasUnit > 0 ? terceirizadasUnit * qty : 0
    outsideProfiles.push({
      opInterna: opInternaTotal,
      desp: despItem,
      rates: {
        is: resolveRate(itemMergedRates, 'IS'),
        ibs: resolveRate(itemMergedRates, 'IBS'),
        cbs: resolveRate(itemMergedRates, 'CBS'),
        ipi: resolveRate(itemMergedRates, 'IPI'),
        icms: resolveRate(itemMergedRates, 'ICMS'),
      },
    })

    return {
      item_id: `idx-${idx}`,
      rb,
      cp: cmvFinal,
      mod_pct,
      dop_pct,
      commission_pct,
      profit_pct,
      rt_pct,
      csll_pct,
      irpj_pct,
      peso_op_interna,
      expense_breakdown,
      dop_components,
      taxes_inside_amounts,
    }
  })

  // ADENDO 25-A: monta os perfis por fora com pesos = Op Interna_i ÷ Σ Op Interna. A soma dos
  // pesos é 1, logo single-product (peso 1) e multi-produto homogêneo (alíquotas iguais)
  // permanecem bit-exact com o caminho legado; só o multi-produto HETEROGÊNEO é corrigido.
  const sumOpInternaOutside = outsideProfiles.reduce((s, p) => s + p.opInterna, 0)
  const outsideItems: OutsideItemProfile[] | undefined = sumOpInternaOutside > 0
    ? outsideProfiles.map((p) => ({
        peso_ancora: p.opInterna / sumOpInternaOutside,
        desp_acessorias: p.desp,
        rates: p.rates,
      }))
    : undefined

  // ───── Merge rates do item com rates do tenant ─────
  // V17 trabalha com rates CONSOLIDADAS — usamos a do primeiro item válido com
  // tax_rates definidos (assume perfil tributário homogêneo entre items, o que é
  // verdade para >95% dos casos: produtos da mesma loja têm mesma tributação).
  const firstItemWithRates = validItems.find(({ item }) => item.item_tax_rates != null)
  const mergedRates = firstItemWithRates
    ? mergeItemAndTenantRates(firstItemWithRates.item.item_tax_rates ?? null, tenantCtx.rates ?? [])
    : (tenantCtx.rates ?? [])

  // ───── Despesas Acessórias consolidadas (frete + seguro + despesas acessórias) ─────
  // Conferência Fiscal (2026-06-05): compõem a base de IBS/CBS e do IPI e a base do ICMS
  // Complementar — NÃO entram na base do IS nem sofrem dedução de ICMS/PIS/ISS.
  const despAcessoriasTotal = validItems.reduce((acc, { item }) => {
    const terc = Number(item.terceirizadas_unit) || 0
    const qty = Number(item.quantity) || 0
    return acc + (terc > 0 ? terc * qty : 0)
  }, 0)

  // ───── Chama motor V17 ─────
  const v17Input: MotorV17Input = {
    items: engineItems,
    discount: { pct: Math.max(0, Math.min(1, (globalDiscountPercent || 0) / 100)) },
    policy: tenantCtx.absorption_policy ?? 'RRO_PROPORTIONAL',
    regime: tenantCtx.regime,
    rates: mergedRates,
    effective_date: args.effectiveDate ?? new Date().toISOString().slice(0, 10),
    use_snapshot_rates: tenantCtx.useSnapshotRates ?? false,
    desp_acessorias: despAcessoriasTotal,
    icms_compl_applies: args.icmsComplApplies ?? false,
    icms_compl: args.icmsCompl,
    outside_items: outsideItems,
  }

  const v17Result = calculateMotorV17(v17Input)

  // ───── Constrói taxes_inside/outside agregados para rateio ─────
  // taxes_inside: ICMS, ISS, PIS, COFINS (PIS/COFINS é split do agregado V17)
  // V17 fix: usa mergedRates (item + tenant) ao invés de só tenantCtx.rates
  // (tenant pode ter array vazio; alíquotas vêm do produto via item_tax_rates).
  const icmsRate = resolveRate(mergedRates, 'ICMS')
  const issRate = resolveRate(mergedRates, 'ISS')
  const pisRate = resolveRate(mergedRates, 'PIS')
  const cofinsRate = resolveRate(mergedRates, 'COFINS')
  const pisCofinsRateTotal = pisRate + cofinsRate
  const pisAmount = pisCofinsRateTotal > 0
    ? v17Result.motor.pis_cofins * (pisRate / pisCofinsRateTotal)
    : 0
  const cofinsAmount = pisCofinsRateTotal > 0
    ? v17Result.motor.pis_cofins * (cofinsRate / pisCofinsRateTotal)
    : 0

  // ADR-016 (2026-05-29): base canônica do PIS/COFINS = Âncora − ICMS − ISS.
  const basePisCofins = v17Result.motor.ancora - v17Result.motor.icms - v17Result.motor.iss
  const taxesInsideTotal: TaxLine[] = [
    { type: 'ICMS' as const, rate_pct: icmsRate, base: v17Result.motor.ancora, amount: v17Result.motor.icms },
    { type: 'ISS' as const, rate_pct: issRate, base: v17Result.motor.ancora - v17Result.motor.icms, amount: v17Result.motor.iss },
    // ADR-016: PIS/COFINS sobre (Âncora − ICMS − ISS); amount já vem canônico do motor.
    { type: 'PIS' as const, rate_pct: pisRate, base: basePisCofins, amount: pisAmount },
    { type: 'COFINS' as const, rate_pct: cofinsRate, base: basePisCofins, amount: cofinsAmount },
  ].filter(t => t.amount > 0 || t.rate_pct > 0)

  const taxesOutsideTotal: TaxLine[] = v17Result.distribution.taxes_outside.map(t => ({
    type: t.type,
    rate_pct: t.rate_pct,
    base: t.base,
    amount: t.amount,
  }))

  // ───── Rateia resultado consolidado proporcional ao RB de cada item ─────
  const rbTotal = v17Result.consolidated.rb_total
  const results: (LegacyMotorResult | null)[] = items.map((): LegacyMotorResult | null => null)
  const ebTotal = v17Result.consolidated.expense_breakdown_total ?? null

  validItems.forEach(({ idx }, validIdx) => {
    const rb_i = engineItems[validIdx].rb
    const ratio = rbTotal > 0 ? rb_i / rbTotal : 0

    // Ratear taxes_inside/outside proporcional (preserva alíquotas, divide R$)
    const taxes_inside: TaxLine[] = taxesInsideTotal.map(t => ({
      type: t.type,
      rate_pct: t.rate_pct,
      base: t.base * ratio,
      amount: t.amount * ratio,
    }))
    const taxes_outside: TaxLine[] = taxesOutsideTotal.map(t => ({
      type: t.type,
      rate_pct: t.rate_pct,
      base: t.base * ratio,
      amount: t.amount * ratio,
    }))

    const expense_breakdown_v17 = ebTotal
      ? {
          mo_admin: ebTotal.mo_admin * ratio,
          fixa: ebTotal.fixa * ratio,
          variavel: ebTotal.variavel * ratio,
          financeira: ebTotal.financeira * ratio,
        }
      : null

    results[idx] = {
      _v17_adapter: true,
      engine_version: MRM_ENGINE_VERSION_V17,
      new_commission: v17Result.distribution.new_commission * ratio,
      new_profit: v17Result.distribution.new_profit * ratio,
      new_csll: v17Result.distribution.new_csll * ratio,
      new_irpj: v17Result.distribution.new_irpj * ratio,
      rro: v17Result.motor.rro * ratio,
      rb: rb_i,
      desc_value: v17Result.motor.desc_value * ratio,
      rv: v17Result.motor.rv * ratio,
      // Adendo 28-A: Âncora Gerencial pós-desconto rateada (Σ = motor.ancora). Denominador
      // ÚNICO da alíquota efetiva de margem no card, coerente com a Etapa 16 do RRO.
      ancora_interna: v17Result.motor.ancora * ratio,
      cp: v17Result.motor.cp_efetivo * ratio,
      mod: v17Result.motor.mod * ratio,
      dop: v17Result.motor.dop * ratio,
      taxes_inside,
      taxes_outside,
      imp_total: (v17Result.motor.imp_dentro_total + v17Result.distribution.taxes_outside_total) * ratio,
      cascade_trace: v17Result.motor.cascade_trace,  // consolidado (mesmo p/ todos)
      status: v17Result.status,
      expense_breakdown_v17,
    }
  })

  // Relatório 21/07/2026 (item 2): injeta o custo dos itens manuais no display da
  // Etapa 4 (compartilhado por todos os itens) e sintetiza o resultado por item de
  // cada manual (custo puro, resíduo 0). A cascata dos produtos permanece intacta.
  if (manualFixedCost > 0) {
    const augmentedTrace = augmentTraceWithManualCost(v17Result.motor.cascade_trace, manualFixedCost)
    for (const r of results) {
      if (r) r.cascade_trace = augmentedTrace ?? r.cascade_trace
    }
    for (const idx of manualIndices) {
      results[idx] = synthesizeManualResult(manualItemCost(items[idx]), augmentedTrace, v17Result.status)
    }
  }

  return results
}

// Helper interno para resolver alíquota agregada de um tributo
function resolveRate(rates: TaxRatePeriod[] | null | undefined, type: string): number {
  if (!Array.isArray(rates)) return 0
  let acc = 0
  for (const r of rates) {
    if (r?.tax_type === type) {
      const v = Number(r.rate_pct)
      if (Number.isFinite(v) && v > 0) acc += v
    }
  }
  return acc
}

/**
 * Versão "full" — retorna também o resultado consolidado completo
 * (para callers que precisam acessar ConsolidatedView ou MotorV17Result diretamente).
 */
export function calculateMotorV17ForPageFull(args: PageBuildArgs): {
  per_item: (LegacyMotorResult | null)[]
  consolidated: MotorV17Result
} {
  const per_item = calculateMotorV17ForPage(args)

  // Relatório 21/07/2026 (item 2): itens manuais ficam fora da cascata de produtos.
  const manualFixedCostFull = args.items.reduce(
    (s, item) => s + (isManualCostItem(item) ? manualItemCost(item) : 0),
    0,
  )

  // Recalcula consolidado (caro, mas correto para callers que precisam dos dois)
  const validItems = args.items.filter(
    item => !isManualCostItem(item) && (Number(item.unit_price) || 0) * (Number(item.quantity) || 0) > 0,
  )

  if (validItems.length === 0) {
    // Empty consolidated
    const emptyResult: MotorV17Result = {
      engine_version: MRM_ENGINE_VERSION_V17,
      consolidated: {
        items_count: 0,
        rb_total: 0,
        desc_value: 0,
        rv_total: 0,
        peso_op_interna_ponderado: 1,
        ancora_interna: 0,
        cp_total: 0,
        mod_total: 0,
        dop_total: 0,
        commission_amount_original: 0,
        profit_amount_original: 0,
        csll_amount_original: 0,
        irpj_amount_original: 0,
        commission_amount_internal: 0,
        profit_amount_internal: 0,
        csll_amount_internal: 0,
        irpj_amount_internal: 0,
        peso_comissao_original: 0,
        peso_lucro_original: 1,
        peso_csll_original: 0,
        peso_irpj_original: 0,
        items_breakdown: [],
        expense_breakdown_total: null,
      },
      motor: {
        rb: 0, desc_value: 0, rv: 0, ancora: 0, icms: 0, iss: 0, pis_cofins: 0,
        imp_dentro_total: 0, cp_efetivo: 0, mod: 0, dop: 0, rro: 0,
        rro_status: 'PENDING',
        cascade_trace: [],
        limite_minimo: null,
      },
      distribution: {
        policy_applied: args.tenantCtx.absorption_policy ?? 'RRO_PROPORTIONAL',
        new_commission: 0, new_profit: 0, new_csll: 0, new_irpj: 0,
        taxes_outside: [], taxes_outside_base: 0, taxes_outside_total: 0,
        desp_acessorias: 0,
        valor_final: 0,
        absorption_audit: { commission_floor_applied: false, profit_absorbed: 0, delta_vs_proportional: 0 },
        validations: { V1: true, V2: true, V3: true, V4: true, V5: true, V6: true, V7: true },
      },
      status: 'PENDING',
      error_code: null,
      messages: [],
    }
    // Orçamento só com itens manuais: reflete o custo puro no consolidado (Cenário A).
    if (manualFixedCostFull > 0) {
      emptyResult.consolidated.cp_total = manualFixedCostFull
      emptyResult.motor.cascade_trace = buildManualOnlyCascadeTrace(manualFixedCostFull)
    }
    return { per_item, consolidated: emptyResult }
  }

  // Reconverte items para EngineItemV17 e chama motor V17 de novo
  // (reuso da lógica via calculateMotorV17ForPage seria mais limpo, mas
  // precisamos do MotorV17Result completo, não apenas o per-item rateado)
  // ADENDO 25-A: coleta o perfil por fora também aqui, para que o `.consolidated`
  // some os tributos por produto (espelha o caminho de produção `calculateMotorV17ForPage`).
  const outsideProfilesFull: {
    opInterna: number
    desp: number
    rates: { is: number; ibs: number; cbs: number; ipi: number; icms: number }
  }[] = []
  const engineItems: EngineItemV17[] = validItems.map((item, idx) => {
    const rb = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
    const qty = Number(item.quantity) || 0
    // CMV canônico — Relatório RRO v1.0 (26/06/2026), Correção 1: "Custo produto"
    // (cost_total + productive_labor_unit) é a fonte PRIMÁRIA; snapshot V14 vira fallback.
    // Caminho ForPageFull/.consolidated — NÃO há reverse-markup aqui (cp = cmvUsed direto),
    // portanto a precedência precisa ser idêntica à do caminho ForPage acima. Ver ADR-020.
    const custoProduto =
      ((Number(item.cost_total) || 0) + (Number(item.productive_labor_unit) || 0)) * qty
    const snapshotCmv = Number(item.expense_breakdown_unit?.cmv_unit) || 0
    const cmvUsed = custoProduto > 0 ? custoProduto : snapshotCmv * qty
    const eb = args.tenantCtx.expense_breakdown ?? null
    const dopAdminNominalFull = eb ? (Number(eb.administrative_pct) || 0) : 0
    const dopFixedNominalFull = eb ? (Number(eb.fixed_pct) || 0) : 0
    const dopVariableNominalFull = eb ? (Number(eb.variable_pct) || 0) : 0
    const dopFinancialNominalFull = eb ? (Number(eb.financial_pct) || 0) : 0
    const dop_pct = eb
      ? dopAdminNominalFull + dopFixedNominalFull + dopVariableNominalFull + dopFinancialNominalFull
      : (Number(args.tenantCtx.dop_pct) || 0)
    // Adendo Seção 31-A (itens 1-2): peso_op_interna é 1 neste caminho ⇒ componentes efetivos = nominais.
    const dop_components = eb
      ? {
          mo_admin: dopAdminNominalFull,
          fixa: dopFixedNominalFull,
          variavel: dopVariableNominalFull,
          financeira: dopFinancialNominalFull,
        }
      : null

    const commission_pct = (Number(item.commission_percent) || 0) / 100
    const profit_pct = (Number(item.profit_percent) || 0) / 100
    // EPIC-RT v8: RT (Comissão Reserva Técnica) — decimal do cadastro do produto.
    const rt_pct = (Number(item.rt_reserve_percent) || 0) / 100
    // ADENDO RRO (2026-06-02, Seção 23.1): IRPJ/CSLL estruturais por produto.
    const { csll_pct, irpj_pct } = resolveStructuralProfitTaxes(
      args.tenantCtx.regime,
      profit_pct,
      item.item_tax_rates ?? null,
      Number(args.tenantCtx.csll_pct) || 0,
      Number(args.tenantCtx.irpj_pct) || 0,
    )

    // ADENDO 25-A: perfil por fora (op interna p/ peso, desp, alíquotas merged item+tenant).
    const salePriceBaseFull = Number(item.sale_price_base_unit) || 0
    const tercFull = Number(item.terceirizadas_unit) || 0
    const opInternaUnitFull = salePriceBaseFull > 0
      ? Math.max(0, salePriceBaseFull - tercFull)
      : (Number(item.unit_price) || 0)
    const itemMergedFull = mergeItemAndTenantRates(item.item_tax_rates ?? null, args.tenantCtx.rates ?? [])
    outsideProfilesFull.push({
      opInterna: opInternaUnitFull * qty,
      desp: tercFull > 0 ? tercFull * qty : 0,
      rates: {
        is: resolveRate(itemMergedFull, 'IS'),
        ibs: resolveRate(itemMergedFull, 'IBS'),
        cbs: resolveRate(itemMergedFull, 'CBS'),
        ipi: resolveRate(itemMergedFull, 'IPI'),
        icms: resolveRate(itemMergedFull, 'ICMS'),
      },
    })

    return {
      item_id: `idx-${idx}`,
      rb,
      cp: cmvUsed,
      mod_pct: 0,
      dop_pct,
      commission_pct,
      profit_pct,
      rt_pct,
      csll_pct,
      irpj_pct,
      peso_op_interna: 1,
      dop_components,
    }
  })

  const sumOpInternaFull = outsideProfilesFull.reduce((s, p) => s + p.opInterna, 0)
  const outsideItemsFull: OutsideItemProfile[] | undefined = sumOpInternaFull > 0
    ? outsideProfilesFull.map((p) => ({
        peso_ancora: p.opInterna / sumOpInternaFull,
        desp_acessorias: p.desp,
        rates: p.rates,
      }))
    : undefined

  const consolidated = calculateMotorV17({
    items: engineItems,
    discount: { pct: Math.max(0, Math.min(1, (args.globalDiscountPercent || 0) / 100)) },
    policy: args.tenantCtx.absorption_policy ?? 'RRO_PROPORTIONAL',
    regime: args.tenantCtx.regime,
    rates: args.tenantCtx.rates ?? [],
    effective_date: args.effectiveDate ?? new Date().toISOString().slice(0, 10),
    use_snapshot_rates: args.tenantCtx.useSnapshotRates ?? false,
    desp_acessorias: outsideItemsFull ? outsideProfilesFull.reduce((s, p) => s + p.desp, 0) : undefined,
    icms_compl_applies: args.icmsComplApplies ?? false,
    icms_compl: args.icmsCompl,
    outside_items: outsideItemsFull,
  })

  // Relatório 21/07/2026 (item 2): custo dos itens manuais no display da Etapa 4.
  if (manualFixedCostFull > 0) {
    consolidated.motor.cascade_trace =
      augmentTraceWithManualCost(consolidated.motor.cascade_trace, manualFixedCostFull)
      ?? consolidated.motor.cascade_trace
  }

  return { per_item, consolidated }
}
