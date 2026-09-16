/**
 * O ORÇAMENTO REABERTO NÃO PERDE O CUSTO — e as bases, medidas linha por linha.
 *
 * >>> ONDE QUEBROU DESTA VEZ: NA PEÇA, e numa peça que eu não tinha olhado <<<
 *
 * As três anteriores foram JUNTAS — módulo sem tela (correção 7), tela sem o campo (K5), view
 * sem o campo (L5). Esta é diferente: a cadeia módulo → view → tela está inteira e medida. O
 * que estava quebrado é a ROTA DE EDIÇÃO do orçamento, que monta o mesmo `BudgetItemRow` que
 * a rota de inserção e monta DIFERENTE:
 *
 *   inserção (`handleProductSelect`):  resolveProductCostAndLabor(prod, ctx)
 *   edição   (`handleEdit`):           Number(it.products?.cost_total || 0)
 *
 * `resolveProductCostAndLabor` resolve o CMV VIVO de `product_items` quando a coluna está
 * zerada — que é o caso real do ATeste1509: `cost_total = 0`, `item_cost_net = 7.985,99. A
 * rota de edição lia a coluna crua, recebia ZERO, e a decomposição do orçamento reaberto
 * jogava o CMV inteiro no RRO.
 *
 * É `copia-divergente.md`: duas rotas para o mesmo objeto, uma esquecendo um campo. A quarta
 * aparição da classe está registrada lá, e esta é a mesma forma — com o agravante de o campo
 * esquecido ser o custo, e de o `select` da edição nem trazer os embeds que o resolvedor lê.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import { buildItemTaxRatesFromProduct } from '@/utils/item-tax-rates'
import { resolveProductCostAndLabor } from '@/utils/item-tax-rates'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

/** O ATeste1509 como o `select` do orçamento o traz: coluna zerada, CMV vivo nos itens. */
const PRODUTO_COM_CUSTO_VIVO = {
  id: 'p1', name: 'ATeste1509',
  sale_price: 36757.67,
  cost_total: 0,                       // a coluna está ZERADA
  yield_quantity: 1,
  product_items: [{ item_id: 'i1', item_cost_net: 7985.99, quantity_needed: 10000 }],
  icms_pct: 17, pis_cofins_pct: 7.6775, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0,
}

describe('1. AS DUAS ROTAS resolvem o MESMO custo', () => {
  it('o resolvedor acha o CMV vivo onde a coluna é zero', () => {
    const { costTotal } = resolveProductCostAndLabor(PRODUTO_COM_CUSTO_VIVO, { production_labor_cost: 0, monthly_workload_minutes: 0 })
    expect(costTotal).toBeCloseTo(7985.99, 2)
    // O DISCRIMINANTE: a coluna crua devolve ZERO. Sem produto assim, as duas rotas dariam o
    // mesmo número e o caso não distinguiria nada.
    expect(Number(PRODUTO_COM_CUSTO_VIVO.cost_total)).toBe(0)
  })

  it('a rota de EDIÇÃO usa o resolvedor, não a coluna crua', () => {
    const orc = ler('pages/orcamentos/index.tsx')
    expect(orc).toContain('const custoResolvido = resolveProductCostAndLabor(isService ? it.services : it.products, laborCtxEdit)')
    // E o valor USADO é o resolvido. Chamar o resolvedor e continuar lendo a coluna crua
    // deixaria a chamada no arquivo e o defeito de pé — foi o que a mutação N1 mostrou:
    // ela trocou só esta linha, e a asserção sobre a CHAMADA seguiu verde.
    expect(orc).toContain('const itemCostTotal = custoResolvido.costTotal')
    expect(orc).not.toMatch(/itemCostTotal = Number\(it\.products\?\.cost_total/)
    // E leva a MO produtiva junto — o "Custo produto" da construção é a soma das duas.
    expect(orc).toContain('productive_labor_unit: custoResolvido.productiveLaborUnit')
  })

  it('e o `select` da edição traz o que o resolvedor precisa ler', () => {
    // Sem os embeds, o resolvedor cairia no mesmo zero por outro caminho — corrigir a
    // chamada e esquecer o `select` é a forma que o #28 já registrou.
    const orc = ler('pages/orcamentos/index.tsx')
    const selectEdicao = orc.slice(orc.indexOf("supabase.from('budget_items').select"), orc.indexOf("eq('budget_id', record.id)"))
    expect(selectEdicao).toContain('product_items(item_id, item_cost_net')
    expect(selectEdicao).toContain('labor_costs(*)')
  })
})

describe('2. O EFEITO: com o custo resolvido, a decomposição fecha', () => {
  const item = (costUnit: number, laborUnit: number): BudgetDecompositionItem => ({
    key: 'a', label: 'ATeste1509', quantity: 1,
    unitPrice: 36757.67, costUnit, productiveLaborUnit: laborUnit,
    commissionPct: 5, profitPct: 10, rtPct: 0,
    rates: buildItemTaxRatesFromProduct(PRODUTO_COM_CUSTO_VIVO) as never,
    acrescimos: 0,
  })
  const montar = (i: BudgetDecompositionItem) => buildDecomposition(buildBudgetDecompositionInput({
    items: [i], discountPct: 0, despesasOperacionaisPct: 8424.85 / 36757.67,
  }).input)

  it('com a coluna crua (zero), o invariante ACUSA', () => {
    const r = montar(item(0, 0))
    expect(r.rro!.foraDeZero).toBe(true)
    expect(r.rro!.divergencia).toBeCloseTo(10562.58, 0)
  })

  it('com o custo resolvido, ele fecha', () => {
    const r = montar(item(7985.99, 2576.58))
    expect(r.rro!.foraDeZero).toBe(false)
    expect(Math.abs(r.rows.find((x) => x.key === 'custos')!.total)).toBeCloseTo(10562.57, 1)
  })
})

describe('3. AS BASES, linha por linha — o que a regra manda', () => {
  const r = buildDecomposition(buildBudgetDecompositionInput({
    items: [{
      key: 'a', label: 'P1', quantity: 1, unitPrice: 36757.67,
      costUnit: 7985.99, productiveLaborUnit: 2576.58,
      commissionPct: 5, profitPct: 10, rtPct: 2,
      rates: buildItemTaxRatesFromProduct(PRODUTO_COM_CUSTO_VIVO) as never, acrescimos: 0,
    }],
    discountPct: 0, despesasOperacionaisPct: 0.2292,
  }).input)
  const l = (k: string) => r.rows.find((x) => x.key === k)!
  const v = (k: string) => Math.abs(l(k).total)
  const rp = v('receita_produtos')
  const P = v('operacao_por_dentro')
  const baseDoPis = P - v('icms') - v('iss')
  const rro = v('rro')
  const lucro = v('lucro')

  it('IBS, CBS, IS e IPI → RECEITA DE PRODUTOS', () => {
    for (const k of ['por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi']) {
      expect(l(k).base).toBeCloseTo(rp, 2)
    }
  })

  it('ICMS → RECEITA DE PRODUTOS, e NÃO P', () => {
    expect(l('icms').base).toBeCloseTo(rp, 2)
    // As duas divergem em R$ 2.538 — é o que torna o caso capaz de distinguir.
    expect(Math.abs(rp - P)).toBeGreaterThan(2500)
  })

  it('ISS → OPERAÇÃO POR DENTRO (P)', () => { expect(l('iss').base).toBeCloseTo(P, 2) })

  it('PIS/COFINS → P − ICMS − ISS', () => {
    expect(l('pis_cofins').base).toBeCloseTo(baseDoPis, 2)
    expect(l('pis_cofins').base).not.toBeCloseTo(P, 1)
  })

  it('Comissão RT → RECEITA DE PRODUTOS', () => {
    expect(l('rt').base).toBeCloseTo(rp, 2)
  })

  it('DESPESAS não tem base nem percentual — ela é CONGELADA (R18)', () => {
    // MUDANÇA DE REQUISITO, registrada: a despesa tinha `base = receita de produtos` e
    // `22,92%`, e por isso ENCOLHIA com o desconto junto com as linhas de imposto. Ela é um
    // dos quatro congelados da R18 e não se calcula assim — exibir a base e o percentual
    // afirma um cálculo que não existe, e o número que ele produz é o errado.
    expect(l('despesas').base).toBeNull()
    expect(l('despesas').pct).toBeNull()
    // O contraste que impede a asserção de passar por acidente: as linhas que REALMENTE
    // recalculam continuam com a base.
    expect(l('rt').base).not.toBeNull()
    expect(l('icms').base).not.toBeNull()
  })

  it('Comissão e Lucro → RRO', () => {
    expect(l('comissao').base).toBeCloseTo(rro, 2)
    expect(l('lucro').base).toBeCloseTo(rro, 2)
    expect(Math.abs(rro - rp)).toBeGreaterThan(1000)
  })

  it('IRPJ e CSLL → VALOR DO LUCRO', () => {
    expect(l('irpj').base).toBeCloseTo(lucro, 2)
    expect(l('csll').base).toBeCloseTo(lucro, 2)
    expect(Math.abs(lucro - rro)).toBeGreaterThan(1000)
  })
})

describe('4. OS DOIS PERCENTUAIS na tela — peso E % do total', () => {
  const bloco = ler('page-parts/shared/consolidated-dre-block.component.tsx')

  it('a linha exibe o segundo percentual quando ele responde outra pergunta', () => {
    expect(bloco).toContain('row.pctSobreTotalGeral != null &&')
    expect(bloco).toContain('% do total')
  })

  it('e só nas quatro linhas do RRO — repetir o mesmo número ensina a ignorá-lo', () => {
    const view = ler('utils/cascade-display-view.ts')
    expect(view).toContain("LINHAS_COM_DOIS_PERCENTUAIS = new Set(['comissao', 'lucro', 'irpj', 'csll'])")
    expect(view).toContain('LINHAS_COM_DOIS_PERCENTUAIS.has(row.key) ? row.pctSobreTotalGeral : null')
  })
})
