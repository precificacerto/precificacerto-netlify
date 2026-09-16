/**
 * A VENDA GRAVADA DECOMPÕE DO SNAPSHOT — e diz quando não pode.
 *
 * >>> A DECISÃO, de 16/09/2026 <<<
 * "venda gravada → gravar no snapshot daqui para frente; os 157 existentes ficam sem, com
 *  estado explícito na tela."
 *
 * A venda é FATO HISTÓRICO. O PEDIDO resolve do cadastro vivo por ser documento em edição;
 * a venda não pode: resolver custo, MO e alíquotas do cadastro de HOJE reescreveria o passado
 * a cada edição do produto — a 6ª aparição de `.claude/rules/fato-vs-referencia.md`.
 *
 * >>> POR QUE INSUMO CONGELADO, e não a decomposição pronta <<<
 * Ela é determinística a partir de poucos campos. Gravar as vinte e tantas linhas seria
 * maior e envelheceria a cada correção de regra — este mesmo branch mudou a R18 e a base do
 * por fora. Com o insumo congelado, corrigir a regra MELHORA documento antigo em vez de
 * deixá-lo num formato morto.
 *
 * >>> TUDO OU NADA <<<
 * Um item sem o congelado tira a decomposição inteira. Montá-la com os que têm devolveria um
 * DRE que não fecha — residual fora de zero, comissão abaixo do cadastrado — sem nada na tela
 * dizendo por quê. É `portao-que-nao-alcanca.md` em forma de interface.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { hydrateDocumentSnapshots } from '@/lib/document-snapshot'
import { enrichItemsForMotor } from '@/utils/motor-item-enrichment'
import { buildItemTaxRatesFromProduct } from '@/utils/item-tax-rates'
import type { TenantSnapshotContext } from '@/lib/items-snapshot'

const vnd = readFileSync(join(__dirname, '..', '..', 'pages', 'vendas', 'index.tsx'), 'utf-8')

const PRODUTO = {
  id: 'ce51cfae', name: 'ATeste1509', cost_total: 0, yield_quantity: 1, productive_labor_total: 0,
  sale_price: 36757.67, commission_percent: 5, profit_percent: 10, rt_reserve_percent: 0,
  product_items: [{ item_id: 'i', item_cost_net: 7985.988202500001, quantity_needed: 1 }],
  labor_costs: [] as { net_value: number }[],
  pricing_calculations: [{ cmv: 0, product_workload: 10000, product_workload_price: 0, total_labor_net: 0, total_labor_gross: 0, val_indirect_labor: 0, total_material_cost_net: 0 }],
  freight_value: 0, insurance_value: 0, accessory_expenses_value: 0,
  icms_pct: 17, pis_cofins_pct: 7.6775, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0,
}
const CTX_MO = { production_labor_cost: 40813.03, monthly_workload_minutes: 158400, productive_value_per_minute: 0 }
const MATERIAL = 7985.99
const MO_PRODUTIVA = 2576.58

const SNAPSHOT_CTX: TenantSnapshotContext = {
  regime: 'LUCRO_REAL', rates: [], use_snapshot_rates: true,
} as unknown as TenantSnapshotContext

const gravar = (ctxMo: typeof CTX_MO, dopPct: number) => {
  const enriquecidos = enrichItemsForMotor(
    [{
      product_id: 'ce51cfae', unit_price: 36757.67, quantity: 1,
      commission_percent: 5, profit_percent: 10,
      item_tax_rates: buildItemTaxRatesFromProduct(PRODUTO),
    }] as never,
    { products: [PRODUTO] as never, services: [] as never },
    ctxMo as never,
  )
  return hydrateDocumentSnapshots({
    items: enriquecidos.map((mi) => ({ motorItem: mi as never, commission_pct: 0.05, profit_pct: 0.10 })),
    tenantCtx: { regime: 'LUCRO_REAL', rates: [], dop_pct: dopPct } as never,
    globalDiscountPercent: 0,
    discountMode: 'PROPORTIONAL',
  }, SNAPSHOT_CTX)
}

describe('1. O GRAVADOR congela os insumos da decomposição', () => {
  const snap = gravar(CTX_MO, 0.2292)
  const di = snap[0].tax_breakdown!.decomposition_input!

  it('custo e MO produtiva saem SEPARADOS, e somados são o CMV da construção', () => {
    expect(di.costUnit).toBeCloseTo(MATERIAL, 1)
    expect(di.productiveLaborUnit).toBeCloseTo(MO_PRODUTIVA, 1)
    expect(di.costUnit + di.productiveLaborUnit).toBeCloseTo(10562.57, 1)
  })

  it('e SEM o contexto de MO do tenant a MO congela em ZERO — a junta do 97c6968', () => {
    // O `costUnit` sai IGUAL nos dois, e só a MO some. Congelar o errado é pior que não
    // congelar: o erro vira permanente.
    const semMo = gravar({ production_labor_cost: 0, monthly_workload_minutes: 0, productive_value_per_minute: 0 }, 0.2292)
    const d2 = semMo[0].tax_breakdown!.decomposition_input!
    expect(d2.costUnit).toBeCloseTo(MATERIAL, 1)
    expect(d2.productiveLaborUnit).toBe(0)
  })

  it('a FICHA do item viaja inteira — sem ela não há linha de tributo', () => {
    expect(di.rates).not.toBeNull()
    expect(Number(di.rates!.icms_pct)).toBeCloseTo(17, 6)
    expect(Number(di.rates!.ibs_pct)).toBeCloseTo(1, 6)
  })

  it('e a DESPESA do tenant vai junto — R18: ela é congelada', () => {
    // Sem gravá-la, reabrir a venda decomporia com o percentual do tenant de HOJE. O
    // discriminante: dois snapshots do MESMO item com `dop_pct` diferente divergem no campo.
    expect(di.despesasOperacionaisPct).toBeCloseTo(0.2292, 10)
    expect(gravar(CTX_MO, 0.31)[0].tax_breakdown!.decomposition_input!.despesasOperacionaisPct)
      .toBeCloseTo(0.31, 10)
  })

  it('comissão, lucro, RT e as marcas de serviço e manual', () => {
    expect(di.commissionPct).toBeCloseTo(5, 6)
    expect(di.profitPct).toBeCloseTo(10, 6)
    expect(di.isService).toBe(false)
    expect(di.isManual).toBe(false)
  })
})

describe('2. A TELA lê o congelado, e NUNCA o cadastro vivo', () => {
  it('a decomposição da venda monta a partir de `tax_breakdown.decomposition_input`', () => {
    const memo = vnd.slice(vnd.indexOf('const saleDecomposition = useMemo'))
    const corpo = memo.slice(0, memo.indexOf('}, [detailItems'))
    expect(corpo).toContain('it?.tax_breakdown?.decomposition_input ?? null')
    // O que NÃO pode aparecer: a resolução do cadastro, que é o caminho do PEDIDO.
    expect(corpo).not.toContain('enrichItemsForMotor')
    expect(corpo).not.toContain('buildItemTaxRatesFromProduct')
  })

  it('a despesa vem do congelado, não de `mrmConfig.dop_pct`', () => {
    const memo = vnd.slice(vnd.indexOf('const saleDecomposition = useMemo'))
    const corpo = memo.slice(0, memo.indexOf('}, [detailItems'))
    expect(corpo).toContain('despesasOperacionaisPct: Number(congelados[0]?.despesasOperacionaisPct) || 0,')
    expect(corpo).not.toContain('mrmConfig.dop_pct')
  })

  it('TUDO OU NADA: um item sem o congelado tira a decomposição inteira', () => {
    const memo = vnd.slice(vnd.indexOf('const saleDecomposition = useMemo'))
    expect(memo).toContain("if (congelados.some((c: any) => c == null)) {")
    expect(memo).toContain("estado: 'ANTERIOR_AO_CONGELAMENTO' as const")
  })
})

describe('3. O ESTADO EXPLÍCITO — os 157 existentes não ficam mudos', () => {
  it('a tela avisa que a decomposição está indisponível, e por quê', () => {
    expect(vnd).toContain("saleDecomposition.estado === 'ANTERIOR_AO_CONGELAMENTO'")
    expect(vnd).toContain('Decomposição por produto indisponível nesta venda')
    // A razão, e não só o aviso: recompor mudaria os números de uma venda já emitida.
    expect(vnd).toContain('mudaria os números de uma venda já emitida')
  })

  it('e a cascata antiga continua — sem congelado, `null` faz a view cair no trace', () => {
    expect(vnd).toContain('decomposition={saleDecomposition.result}')
    expect(vnd).toContain('itemLabels={saleDecomposition.labels}')
  })

  it('os CARDS seguem na Etapa 16 quando não há congelado — melhor ela que card nenhum', () => {
    expect(vnd).toContain('saleResidualDistribution, saleDecomposition.result,')
    expect(vnd).toContain('footerNote={saleDecomposition.result ? NOTA_DA_DECOMPOSICAO : undefined}')
  })
})
