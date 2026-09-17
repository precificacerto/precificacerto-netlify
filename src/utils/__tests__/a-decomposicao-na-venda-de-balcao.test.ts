/**
 * A DECOMPOSIÇÃO CHEGA À VENDA DE BALCÃO — e ela é a tela que não estava bloqueada.
 *
 * "Ligue a decomposição nas telas de PEDIDO e de VENDA, igual ao orçamento. MEÇA ANTES e me
 *  diga o que impede hoje: falta chamar, ou falta dado nas telas?"
 *
 * >>> A MEDIÇÃO, E ELA SEPAROU AS TRÊS TELAS EM VEZ DE DUAS <<<
 *
 *   venda BALCÃO      motor AO VIVO, catálogo e contexto do tenant na tela,
 *                     `enrichItemsForMotor` JÁ chamado  →  faltava só CHAMAR
 *   pedido            lê o `tax_breakdown` GRAVADO; catálogo e contexto estão na tela,
 *                     mas `OrderItemRow` não tem custo, MO nem alíquotas
 *   venda DETALHE     idem — e ali resolver do cadastro vivo seria releitura NOVA
 *
 * Este arquivo cobre a primeira. As outras duas ficaram fora por decisão de escopo, com a
 * medição registrada no corpo do commit — não por terem sido esquecidas.
 *
 * >>> A JUNTA DO 97c6968 VALE AQUI IGUAL <<<
 * `sale_items` NÃO TEM coluna de custo — medido no `information_schema`, as três tabelas de
 * item têm só `freight_allocated_value` e `accessories_allocated_value`. O custo é sempre
 * resolvido, e sem o contexto de MO do tenant a MO produtiva some SEM que o `costTotal` mude.
 * Por isso os casos abaixo partem do produto como o cadastro o tem e passam por
 * `enrichItemsForMotor` — um setup com o custo já separado à mão não exercitaria nada disso.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput } from '@/utils/budget-decomposition-input'
import { buildItemTaxRatesFromProduct } from '@/utils/item-tax-rates'
import { enrichItemsForMotor } from '@/utils/motor-item-enrichment'

const orc = readFileSync(join(__dirname, '..', '..', 'pages', 'vendas', 'index.tsx'), 'utf-8')

/** O ATeste1509 como o banco o tem — cost_total 0, sem labor_costs, MO só pelo runtime. */
const PRODUTO_DO_CADASTRO = {
  id: 'ce51cfae', name: 'ATeste1509', cost_total: 0, yield_quantity: 1, productive_labor_total: 0,
  sale_price: 36757.67, commission_percent: 5, profit_percent: 10, rt_reserve_percent: 0,
  product_items: [{ item_id: 'i', item_cost_net: 7985.988202500001, quantity_needed: 1 }],
  labor_costs: [] as { net_value: number }[],
  pricing_calculations: [{
    cmv: 0, product_workload: 10000, product_workload_price: 0,
    total_labor_net: 0, total_labor_gross: 0, val_indirect_labor: 0, total_material_cost_net: 0,
  }],
  freight_value: 0, insurance_value: 0, accessory_expenses_value: 0,
  icms_pct: 17, pis_cofins_pct: 7.6775, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0,
}
const CTX_DO_TENANT = {
  production_labor_cost: 40813.03, monthly_workload_minutes: 158400, productive_value_per_minute: 0,
}
const DESPESAS_PCT = 8424.85 / 36757.67
const MATERIAL = 7985.99
const MO_PRODUTIVA = 2576.58
const CUSTO_DA_CONSTRUCAO = 10562.57

/** A linha do balcão, como `SaleItemRow` a carrega antes de qualquer resolução. */
const LINHA_DO_BALCAO = {
  key: 'a', product_id: 'ce51cfae', product_name: 'ATeste1509',
  quantity: 1, unit_price: 36757.67, commission_percent: 5, profit_percent: 10,
  item_tax_rates: buildItemTaxRatesFromProduct(PRODUTO_DO_CADASTRO),
  freight_allocated_value: null as number | null,
  accessories_allocated_value: null as number | null,
}

/** O MESMO mapeamento da tela do balcão, sobre o array que ela passa. */
const decomporDe = (linhas: readonly unknown[], discountPct = 0) =>
  buildDecomposition(buildBudgetDecompositionInput({
    items: (linhas as any[]).map((item) => ({
      key: item.key, label: item.product_name || 'Item',
      isManual: item.is_manual, isService: item.is_service,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unit_price) || 0,
      costUnit: Number(item.cost_total) || 0,
      productiveLaborUnit: Number(item.productive_labor_unit) || 0,
      commissionPct: Number(item.commission_percent) || 0,
      profitPct: Number(item.profit_percent) || 0,
      rtPct: Number(item.rt_reserve_percent) || 0,
      rates: item.item_tax_rates ?? null,
      acrescimos: (item.freight_allocated_value != null || item.accessories_allocated_value != null)
        ? (Number(item.freight_allocated_value) || 0) + (Number(item.accessories_allocated_value) || 0)
        : 0,
    })),
    discountPct, despesas: { fixa: DESPESAS_PCT, variavel: 0, financeira: 0, indireta: 0, moProdutiva: 0 },
  }).input)

const enriquecer = (ctx: typeof CTX_DO_TENANT) => enrichItemsForMotor(
  [LINHA_DO_BALCAO] as never,
  { products: [PRODUTO_DO_CADASTRO] as never, services: [] as never },
  ctx as never,
)
const val = (r: ReturnType<typeof buildDecomposition>, k: string) =>
  Math.abs(r.rows.find((x) => x.key === k)!.total)
const row = (r: ReturnType<typeof buildDecomposition>, k: string) => r.rows.find((x) => x.key === k)!

describe('1. DO CADASTRO À DECOMPOSIÇÃO, pelo caminho do balcão', () => {
  const r = decomporDe(enriquecer(CTX_DO_TENANT))

  it('o CUSTO sai material + MO, como a construção o exibe', () => {
    expect(val(r, 'custos')).toBeCloseTo(CUSTO_DA_CONSTRUCAO, 1)
    expect(val(r, 'custos')).not.toBeCloseTo(MATERIAL, 1)
  })

  it('e SEM o contexto de MO do tenant a MO some, sem o custo mudar de cara', () => {
    // O discriminante da junta: `costTotal` sai IGUAL nos dois, e só a MO desaparece. É por
    // isso que o defeito atravessou três correções no orçamento.
    const semCtx = enriquecer({ production_labor_cost: 0, monthly_workload_minutes: 0, productive_value_per_minute: 0 })
    expect((semCtx[0] as unknown as { cost_total: number }).cost_total).toBeCloseTo(MATERIAL, 1)
    expect(val(decomporDe(semCtx), 'custos')).toBeCloseTo(MATERIAL, 1)
    expect(val(decomporDe(semCtx), 'custos')).not.toBeCloseTo(CUSTO_DA_CONSTRUCAO, 1)
    expect(MO_PRODUTIVA).toBeCloseTo(CUSTO_DA_CONSTRUCAO - MATERIAL, 1)
  })

  it('o RRO fecha com o reservado, e comissão e lucro voltam a 5,00% e 10,00%', () => {
    expect(r.rro!.foraDeZero).toBe(false)
    expect(row(r, 'comissao').pctSobreTotalGeral! * 100).toBeCloseTo(5, 2)
    expect(row(r, 'lucro').pctSobreTotalGeral! * 100).toBeCloseTo(10, 2)
  })

  it('a R18 vale aqui igual: os congelados não encolhem com o desconto', () => {
    const com = decomporDe(enriquecer(CTX_DO_TENANT), 0.05)
    expect(val(com, 'custos')).toBeCloseTo(val(r, 'custos'), 8)
    expect(val(com, 'despesas')).toBeCloseTo(val(r, 'despesas'), 8)
    // E as de tributo encolhem — o contraste que impede "nada muda" de passar.
    expect(val(com, 'icms')).toBeLessThan(val(r, 'icms'))
  })
})

describe('2. A JUNTA — a tela do balcão chama, e chama o array certo', () => {
  it('a decomposição do balcão mapeia `balcaoEnrichedItems`, não `saleItems`', () => {
    const memo = orc.slice(orc.indexOf('const balcaoDecomposition = useMemo'))
    const corpo = memo.slice(0, memo.indexOf('}, ['))
    expect(corpo).toContain('items: balcaoEnrichedItems.map((item) => ({')
    expect(corpo).not.toContain('items: saleItems.map((item) => ({')
  })

  it('e `balcaoEnrichedItems` recebe o contexto de MO do tenant', () => {
    const bloco = orc.slice(orc.indexOf('enrichItemsForMotor(saleItems'))
    const chamada = bloco.slice(0, bloco.indexOf('})'))
    expect(chamada).toContain('production_labor_cost: mrmConfig.production_labor_cost')
    expect(chamada).toContain('monthly_workload_minutes: mrmConfig.monthly_workload_minutes')
    expect(chamada).toContain('productive_value_per_minute: mrmConfig.productive_value_per_minute')
  })

  it('o bloco da cascata recebe a decomposição e os rótulos', () => {
    expect(orc).toContain('decomposition={balcaoDecomposition?.result ?? null}')
    expect(orc).toContain('itemLabels={balcaoDecomposition?.labels ?? []}')
  })

  it('os CARDS leem a decomposição — e a nota da base muda junto', () => {
    // Sem isto a tela teria duas fontes para o mesmo RRO, como o orçamento tinha antes do
    // 1934dbb, e elas divergem.
    expect(orc).toContain('balcaoResidualDistribution, balcaoDecomposition?.result ?? null,')
    expect(orc).toContain('footerNote={balcaoDecomposition?.result ? NOTA_DA_DECOMPOSICAO : undefined}')
  })

  it('o enriquecimento do balcão é MEMOIZADO — a decomposição depende dele', () => {
    // Recalculado a cada render, ele invalidaria o memo da decomposição sempre.
    expect(orc).toContain('const balcaoEnrichedItems = useMemo(() => enrichItemsForMotor(saleItems')
  })
})
