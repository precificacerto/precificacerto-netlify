/**
 * mrm-engine-v17/consolidate.ts — Camada 1, Etapa 1
 *
 * EPIC-MRM-V17 (2026-05-28)
 * Cobre PDF Etapas 1-9: fragmentação individual → consolidação cross-produto.
 *
 * Princípio (PDF Seções 3-9):
 *   1. Cada produto/serviço tem sua estrutura individual completa
 *   2. Sistema SOMA por categoria equivalente (custos+custos, despesas+despesas)
 *   3. Pesos de redistribuição RRO derivados dos VALORES ABSOLUTOS originais
 *      pré-desconto (PDF Seção 23) — NÃO dos %s configurados
 *
 * Princípio V16.3 preservado: despesas operacionais imutáveis a desconto.
 * Esta consolidação usa `rb_total` (PRÉ-desconto) como base dos buckets.
 */

import type {
  ConsolidatedView,
  DiscountV17,
  EngineItemV17,
  ItemConsolidatedSnapshot,
} from '@/types/mrm'

/**
 * Consolida N items em uma única visão estruturada (PDF Etapas 1-9).
 *
 * Garantias:
 * - Retorna view com zeros quando items vazio (não throw)
 * - Pesos PDF Seção 23 somam 1.0 (±1e-9) quando há pelo menos 1 componente > 0
 * - Quando soma_componentes_originais = 0, pesos viram fallback (lucro=1, demais=0)
 *
 * @param items   array de items pré-validados pelo orchestrator
 * @param discount desconto global proporcional (PDF Etapa 11)
 * @returns ConsolidatedView pronto para Etapa 2 (applyMotorRRO)
 */
export function consolidateItems(
  items: EngineItemV17[],
  discount: DiscountV17,
): ConsolidatedView {
  if (!Array.isArray(items) || items.length === 0) {
    return emptyConsolidatedView()
  }

  const discountFactor = clamp01(discount.pct)

  // ───── Acumuladores ─────
  let rb_total = 0
  let cp_total = 0
  let mod_total = 0
  let dop_total = 0
  let peso_op_interna_num = 0  // numerador da média ponderada
  let commission_amount_original = 0
  let profit_amount_original = 0
  let csll_amount_original = 0
  let irpj_amount_original = 0
  // EPIC-RT v8: Σ(rb_i × rt_pct_i) — base da alíquota efetiva CONGELADA de RT.
  let rt_amount_original = 0
  // Adendo 26-A: margens sobre Op. Interna (base sem Op. Externa) — só display Etapa 6
  let commission_amount_internal = 0
  let profit_amount_internal = 0
  let csll_amount_internal = 0
  let irpj_amount_internal = 0
  let expense_mo_admin = 0
  let expense_fixa = 0
  let expense_variavel = 0
  let expense_financeira = 0
  let has_any_expense_breakdown = false
  // Adendo Seção 31-A (itens 1-2): decomposição de dop_total por bucket (rb × dop_components).
  // Σ dos 4 == dop_total, reconcilia a Etapa 5 discriminada. DISPLAY-only.
  let dop_mo_admin = 0
  let dop_fixa = 0
  let dop_variavel = 0
  let dop_financeira = 0
  let has_dop_components = false
  // V17 (2026-05-28): consolidação de impostos por dentro POR PRODUTO
  let tax_icms_amount = 0
  let tax_iss_amount = 0
  let tax_pis_cofins_amount = 0
  // EPIC-DAS: acumulador do DAS por dentro (SN/MEI). `has_any_das` distingue "nenhum item
  // trouxe DAS" de "todos trouxeram DAS zero" (MEI) — no segundo caso a linha deve existir.
  let tax_das_amount = 0
  let has_any_das = false
  let has_any_tax_inside_amounts = false

  const items_breakdown: ItemConsolidatedSnapshot[] = []

  // ───── Loop principal: PDF Etapas 1-6 (estrutura individual + consolidação) ─────
  for (const item of items) {
    const rb_i = safeNum(item.rb)
    if (rb_i <= 0) continue  // ignora items inválidos sem throw

    rb_total += rb_i
    cp_total += safeNum(item.cp)
    // V16.3 princípio: despesas estruturais sobre RB pré-desconto
    mod_total += rb_i * safeNum(item.mod_pct)
    dop_total += rb_i * safeNum(item.dop_pct)

    // Adendo Seção 31-A: decompõe o DOP do item nos 4 buckets (rb × pct efetivo).
    // A soma dos componentes == dop_pct, então Σ(dop_*) == dop_total. Inclui a MO
    // Administrativa vinda do tenant mesmo quando o snapshot V14 do produto é 0.
    if (item.dop_components) {
      has_dop_components = true
      dop_mo_admin += rb_i * safeNum(item.dop_components.mo_admin)
      dop_fixa += rb_i * safeNum(item.dop_components.fixa)
      dop_variavel += rb_i * safeNum(item.dop_components.variavel)
      dop_financeira += rb_i * safeNum(item.dop_components.financeira)
    }
    peso_op_interna_num += rb_i * clamp01(item.peso_op_interna)

    // Valores absolutos originais (R$ pré-desconto) — base PDF Seção 23
    const commission_i = rb_i * safeNum(item.commission_pct)
    const profit_i = rb_i * safeNum(item.profit_pct)
    const csll_i = rb_i * safeNum(item.csll_pct)
    const irpj_i = rb_i * safeNum(item.irpj_pct)

    commission_amount_original += commission_i
    profit_amount_original += profit_i
    csll_amount_original += csll_i
    irpj_amount_original += irpj_i
    // EPIC-RT v8: RT sobre RB pré-desconto (paralelo a comissão/lucro). Default 0.
    rt_amount_original += rb_i * safeNum(item.rt_pct)

    // Adendo 26-A: base = Op. Interna do produto (rb_i × peso_op_interna_i), reproduzindo
    // a margem da Etapa 2 (precificação). A Etapa 6 AGREGA — não recalcula sobre a Venda
    // Consolidada (que inclui Op. Externa / IBS+CBS por fora). Ver Seção 26-A.
    const opInternaBase_i = rb_i * clamp01(item.peso_op_interna)
    commission_amount_internal += opInternaBase_i * safeNum(item.commission_pct)
    profit_amount_internal += opInternaBase_i * safeNum(item.profit_pct)
    csll_amount_internal += opInternaBase_i * safeNum(item.csll_pct)
    irpj_amount_internal += opInternaBase_i * safeNum(item.irpj_pct)

    // V14 snapshot expense_breakdown (quando presente)
    if (item.expense_breakdown) {
      has_any_expense_breakdown = true
      expense_mo_admin += safeNum(item.expense_breakdown.mo_admin?.amount)
      expense_fixa += safeNum(item.expense_breakdown.fixa?.amount)
      expense_variavel += safeNum(item.expense_breakdown.variavel?.amount)
      expense_financeira += safeNum(item.expense_breakdown.financeira?.amount)
    }

    // V17: tax_inside_amounts (impostos por dentro consolidados por produto)
    if (item.taxes_inside_amounts) {
      has_any_tax_inside_amounts = true
      tax_icms_amount += safeNum(item.taxes_inside_amounts.icms)
      tax_iss_amount += safeNum(item.taxes_inside_amounts.iss)
      tax_pis_cofins_amount += safeNum(item.taxes_inside_amounts.pis_cofins)
      if (item.taxes_inside_amounts.das != null) {
        has_any_das = true
        tax_das_amount += safeNum(item.taxes_inside_amounts.das)
      }
    }

    items_breakdown.push({
      item_id: item.item_id,
      rb: rb_i,
      commission_amount_original: commission_i,
      profit_amount_original: profit_i,
      csll_amount_original: csll_i,
      irpj_amount_original: irpj_i,
    })
  }

  // ───── PDF Etapas 7-8: peso op interna ponderado por RB ─────
  const peso_op_interna_ponderado = rb_total > 0 ? peso_op_interna_num / rb_total : 1

  // ───── PDF Etapa 9: venda consolidada + desconto + Op Interna ─────
  // Doc 31/07/2026 (oráculo "Aluminio"): o desconto comercial incide sobre o VALOR TOTAL do
  // orçamento (produto distribuível + manual + Desp. Acessórias), mas manual e desp são
  // repasses IMUNES (pagos cheios pelo cliente). O desconto que incidiria sobre eles é
  // integralmente absorvido pela base distribuível `rb_total`:
  //   desc_value = d × (rb_total + discount_immune_base); rv_total = rb_total − desc_value.
  // Quando discount_immune_base = 0 ⇒ desc_value = d × rb_total (BIT-EXACT ao anterior).
  const discount_immune_base = Math.max(0, safeNum(discount.discount_immune_base))
  const desc_value = discountFactor * (rb_total + discount_immune_base)
  const rv_total = rb_total - desc_value
  const ancora_interna = rv_total * peso_op_interna_ponderado

  // ───── PDF Seção 23: pesos originais para redistribuição RRO ─────
  const soma_componentes =
    commission_amount_original +
    profit_amount_original +
    csll_amount_original +
    irpj_amount_original

  let peso_comissao_original = 0
  let peso_lucro_original = 0
  let peso_csll_original = 0
  let peso_irpj_original = 0

  if (soma_componentes > 0) {
    peso_comissao_original = commission_amount_original / soma_componentes
    peso_lucro_original = profit_amount_original / soma_componentes
    peso_csll_original = csll_amount_original / soma_componentes
    peso_irpj_original = irpj_amount_original / soma_componentes
  } else {
    // Fallback degenerado: todos componentes zerados → 100% vira lucro
    peso_lucro_original = 1
  }

  const expense_breakdown_total = has_any_expense_breakdown
    ? {
        mo_admin: expense_mo_admin,
        fixa: expense_fixa,
        variavel: expense_variavel,
        financeira: expense_financeira,
      }
    : null

  // Adendo Seção 31-A: fonte preferencial da Etapa 5 discriminada (reconcilia com dop_total).
  const dop_breakdown_total = has_dop_components
    ? {
        mo_admin: dop_mo_admin,
        fixa: dop_fixa,
        variavel: dop_variavel,
        financeira: dop_financeira,
      }
    : null

  const taxes_inside_total = has_any_tax_inside_amounts
    ? {
        icms: tax_icms_amount,
        iss: tax_iss_amount,
        pis_cofins: tax_pis_cofins_amount,
        // Omitido quando nenhum item trouxe DAS ⇒ objeto idêntico ao de hoje fora de SN/MEI.
        ...(has_any_das ? { das: tax_das_amount } : {}),
      }
    : null

  return {
    items_count: items_breakdown.length,
    rb_total,
    desc_value,
    rv_total,
    peso_op_interna_ponderado,
    ancora_interna,
    cp_total,
    mod_total,
    dop_total,
    commission_amount_original,
    profit_amount_original,
    csll_amount_original,
    irpj_amount_original,
    rt_amount_original,
    commission_amount_internal,
    profit_amount_internal,
    csll_amount_internal,
    irpj_amount_internal,
    peso_comissao_original,
    peso_lucro_original,
    peso_csll_original,
    peso_irpj_original,
    items_breakdown,
    taxes_inside_total,
    expense_breakdown_total,
    dop_breakdown_total,
  }
}

// ─────────────────────────── Helpers internos ───────────────────────────

function safeNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function clamp01(v: unknown): number {
  const n = safeNum(v)
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function emptyConsolidatedView(): ConsolidatedView {
  return {
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
    rt_amount_original: 0,
    commission_amount_internal: 0,
    profit_amount_internal: 0,
    csll_amount_internal: 0,
    irpj_amount_internal: 0,
    peso_comissao_original: 0,
    peso_lucro_original: 1,
    peso_csll_original: 0,
    peso_irpj_original: 0,
    items_breakdown: [],
    taxes_inside_total: null,
    expense_breakdown_total: null,
    dop_breakdown_total: null,
  }
}
