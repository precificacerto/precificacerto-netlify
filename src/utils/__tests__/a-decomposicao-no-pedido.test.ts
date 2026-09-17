/**
 * A DECOMPOSIÇÃO CHEGA AO PEDIDO — resolvendo do cadastro VIVO, por decisão registrada.
 *
 * >>> A DECISÃO, e a medição que a sustenta <<<
 *
 * "pedido → resolver do cadastro vivo (documento em edição)" — dono do produto, 16/09/2026.
 *
 * `order_items` NÃO tem coluna de custo, de MO produtiva nem de alíquota: medido no
 * `information_schema`, as três tabelas de item têm só `freight_allocated_value` e
 * `accessories_allocated_value`. E o snapshot gravado não serve como fonte — dos 32
 * `order_items` com `tax_breakdown`, só 10 tinham `cp > 0` e ZERO tinham `taxes_outside`
 * preenchido. Ler o gravado devolveria decomposição sem custo e sem tributo por fora na
 * maioria dos pedidos.
 *
 * >>> A JUNTA DO 97c6968 VALE AQUI IGUAL <<<
 * Sem o contexto de MO do tenant, a MO produtiva some SEM que o `costTotal` mude — a metade
 * visível fica certa e o erro atravessa. Por isso os casos partem do produto como o CADASTRO
 * o tem e passam por `enrichItemsForMotor`, em vez de um setup com o custo já separado.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput } from '@/utils/budget-decomposition-input'
import { buildItemTaxRatesFromProduct } from '@/utils/item-tax-rates'
import { enrichItemsForMotor } from '@/utils/motor-item-enrichment'

const ped = readFileSync(join(__dirname, '..', '..', 'pages', 'pedidos', 'index.tsx'), 'utf-8')

/** ATeste1509 como o banco o tem: `cost_total` 0, sem `labor_costs`, MO só pelo runtime. */
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
const CTX = { production_labor_cost: 40813.03, monthly_workload_minutes: 158400, productive_value_per_minute: 0 }
const DESPESAS_PCT = 8424.85 / 36757.67
const MATERIAL = 7985.99
const CUSTO_DA_CONSTRUCAO = 10562.57

/** A linha do pedido, como `OrderItemRow` a carrega — SEM custo, SEM MO, SEM alíquota. */
const LINHA_DO_PEDIDO = {
  key: 'edit-1-0', product_id: 'ce51cfae', service_id: null as string | null, product_name: 'ATeste1509',
  quantity: 1, unit_price: 36757.67, total_price: 36757.67,
  commission_percent: 5, profit_percent: 10,
  freight_allocated_value: null as number | null,
  accessories_allocated_value: null as number | null,
}

/** O MESMO mapeamento da tela do pedido, sobre o array que ela passa. */
const decomporDe = (linhas: readonly unknown[], discountPct = 0) =>
  buildDecomposition(buildBudgetDecompositionInput({
    items: (linhas as any[]).map((item) => {
      const cadastro = item.service_id ? null : (item.product_id === 'ce51cfae' ? PRODUTO_DO_CADASTRO : null)
      return {
        key: item.key,
        label: item.product_name || item.manual_description || 'Item',
        isManual: item.isManual, isService: !!item.service_id,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        costUnit: Number(item.cost_total) || 0,
        productiveLaborUnit: Number(item.productive_labor_unit) || 0,
        commissionPct: Number(item.commission_percent) || 0,
        profitPct: Number(item.profit_percent) || 0,
        rtPct: Number(item.rt_reserve_percent) || 0,
        rates: cadastro ? buildItemTaxRatesFromProduct(cadastro) : null,
        acrescimos: (item.freight_allocated_value != null || item.accessories_allocated_value != null)
          ? (Number(item.freight_allocated_value) || 0) + (Number(item.accessories_allocated_value) || 0)
          : 0,
      }
    }),
    discountPct, despesas: { fixa: DESPESAS_PCT, variavel: 0, financeira: 0, indireta: 0, moProdutiva: 0 },
  }).input)

const enriquecer = (ctx: typeof CTX) => enrichItemsForMotor(
  [LINHA_DO_PEDIDO] as never,
  { products: [PRODUTO_DO_CADASTRO] as never, services: [] as never },
  ctx as never,
)
const val = (r: ReturnType<typeof buildDecomposition>, k: string) =>
  Math.abs(r.rows.find((x) => x.key === k)!.total)
const row = (r: ReturnType<typeof buildDecomposition>, k: string) => r.rows.find((x) => x.key === k)!

describe('1. DO CADASTRO À DECOMPOSIÇÃO, pelo caminho do pedido', () => {
  const r = decomporDe(enriquecer(CTX))

  it('o CUSTO sai material + MO, como a construção o exibe', () => {
    expect(val(r, 'custos')).toBeCloseTo(CUSTO_DA_CONSTRUCAO, 1)
    expect(val(r, 'custos')).not.toBeCloseTo(MATERIAL, 1)
  })

  it('SEM o contexto de MO do tenant a MO some, e o custo não muda de cara', () => {
    const semCtx = enriquecer({ production_labor_cost: 0, monthly_workload_minutes: 0, productive_value_per_minute: 0 })
    expect((semCtx[0] as unknown as { cost_total: number }).cost_total).toBeCloseTo(MATERIAL, 1)
    expect(val(decomporDe(semCtx), 'custos')).toBeCloseTo(MATERIAL, 1)
  })

  it('a LINHA CRUA do pedido devolve custo ZERO — `order_items` não tem a coluna', () => {
    // É o contraste que prova que a resolução é necessária, e não um detalhe de fiação.
    expect(val(decomporDe([LINHA_DO_PEDIDO]), 'custos')).toBeCloseTo(0, 2)
  })

  it('o RRO fecha e comissão e lucro voltam a 5,00% e 10,00%', () => {
    expect(r.rro!.foraDeZero).toBe(false)
    expect(row(r, 'comissao').pctSobreTotalGeral! * 100).toBeCloseTo(5, 2)
    expect(row(r, 'lucro').pctSobreTotalGeral! * 100).toBeCloseTo(10, 2)
  })

  it('as alíquotas por fora chegam com a base do código 4 — o pedido não regride', () => {
    expect(row(r, 'por_fora_ibs').pctPerItem[0]).toBeCloseTo(0.01, 10)
    expect(row(r, 'por_fora_cbs').pctPerItem[0]).toBeCloseTo(0.09, 10)
    expect(row(r, 'por_fora_ibs').basePerItem[0]).toBeLessThan(row(r, 'receita_produtos').perItem[0])
  })

  it('e a R18 vale aqui igual: os congelados não encolhem com o desconto', () => {
    const com = decomporDe(enriquecer(CTX), 0.05)
    expect(val(com, 'custos')).toBeCloseTo(val(r, 'custos'), 8)
    expect(val(com, 'despesas')).toBeCloseTo(val(r, 'despesas'), 8)
    expect(val(com, 'icms')).toBeLessThan(val(r, 'icms'))
  })
})

describe('2. A JUNTA — a tela do pedido chama, e chama o array certo', () => {
  it('a decomposição do pedido mapeia `orderEnrichedItems`, não `orderItems`', () => {
    const memo = ped.slice(ped.indexOf('const orderDecomposition = useMemo'))
    const corpo = memo.slice(0, memo.indexOf('}, ['))
    expect(corpo).toContain('items: orderEnrichedItems.map((item) => {')
    expect(corpo).not.toContain('items: orderItems.map((item) => {')
  })

  it('e `orderEnrichedItems` recebe o contexto de MO do tenant', () => {
    const bloco = ped.slice(ped.indexOf('const orderEnrichedItems = useMemo'))
    const chamada = bloco.slice(0, bloco.indexOf('), ['))
    expect(chamada).toContain('production_labor_cost: mrmConfig.production_labor_cost')
    expect(chamada).toContain('monthly_workload_minutes: mrmConfig.monthly_workload_minutes')
    expect(chamada).toContain('productive_value_per_minute: mrmConfig.productive_value_per_minute')
  })

  it('a ficha sai de `buildItemTaxRatesFromProduct`, a MESMA do orçamento', () => {
    // Uma segunda montagem de ficha aqui seria `copia-divergente.md` entre duas leituras da
    // mesma matriz, e o campo esquecido seria uma alíquota.
    expect(ped).toContain('rates: cadastro ? buildItemTaxRatesFromProduct(cadastro) : null,')
  })

  it('o bloco da cascata, os CARDS e o PDF recebem a decomposição', () => {
    expect(ped).toContain('decomposition={orderDecomposition?.result ?? null}')
    expect(ped).toContain('itemLabels={orderDecomposition?.labels ?? []}')
    expect(ped).toContain('orderResidualDistribution, orderDecomposition?.result ?? null,')
    expect(ped).toContain('footerNote={orderDecomposition?.result ? NOTA_DA_DECOMPOSICAO : undefined}')
    expect(ped).toContain('{ decomposition: { decomposition: orderDecomposition.result, itemLabels: orderDecomposition.labels } }')
  })

  it('o item MANUAL é marcado antes de enriquecer — senão entra na cascata de produtos', () => {
    // `is_manual_cost` decide se o item vira custo puro ou recebe comissão e lucro. A marca
    // do pedido é `isManual` OU a ausência de produto e serviço com descrição manual.
    expect(ped).toContain("isManual: it.isManual === true || (!it.product_id && !it.service_id && !!it.manual_description)")
  })
})
