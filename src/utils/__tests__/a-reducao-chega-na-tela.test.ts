/**
 * A redução CHEGA — e o que se afirma é o número que sai do outro lado, não o
 * nome do campo no arquivo.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * Instrução do dono do produto, registrada como está:
 *
 *   > As listas de colunas escritas à mão em `orcamentos/index.tsx` e
 *   > `vendas/index.tsx` são a forma do #28 e do #45. Acrescente os campos novos
 *   > lá no mesmo commit, e escreva o caso que pega a omissão — **não a presença
 *   > do nome no arquivo, mas o efeito: o campo chegando com valor na tela.**
 *
 * `copia-divergente.md`: *"o `select` que não pede o que o mapeador lê não falha
 * — o campo só chega vazio"*. Foi assim que o `rt_pct` caiu no cadastro vivo e
 * que o `destination_snapshot` sumiu em 6 de 6 pares.
 *
 * ── COMO O EFEITO É MEDIDO SEM IR AO BANCO ─────────────────────────────────
 *
 * `projetarPelasColunas` faz o que o PostgREST faz: mantém só as colunas da
 * lista. A linha projetada vai para `buildItemTaxRatesFromProduct`, e o que se
 * afirma é a ALÍQUOTA EFETIVA que sai. Com a coluna fora da lista, ela sai
 * CHEIA em vez de reduzida — número diferente, plausível, e ninguém vê.
 *
 * O contraste está em cada caso: a projeção completa contra a projeção sem o
 * campo. Uma asserção só sobre a projeção completa passaria verde com a lista
 * errada, porque `buildItemTaxRatesFromProduct` não falha com campo ausente.
 */
import { buildItemTaxRatesFromProduct } from '@/utils/item-tax-rates'
import { resolveReducoesDoItem } from '@/utils/classificacao-fiscal'
import {
  PRODUCT_TAX_COLUMNS,
  SERVICE_TAX_COLUMNS,
  PRODUCT_TAX_SELECT,
  SERVICE_TAX_SELECT,
  projetarPelasColunas,
} from '@/utils/item-tax-columns'

/** Um produto CLASSIFICADO pelo 200025: IBS 60%, CBS 100%. */
const PRODUTO_CLASSIFICADO: Record<string, unknown> = {
  id: 'p1',
  name: 'Curso ProUni',
  icms_pct: 17,
  pis_cofins_pct: 9.25,
  ibs_pct: 1,
  cbs_pct: 9,
  ibs_reference_pct: 1,
  cbs_reference_pct: 9,
  iva_dual_reduction_factor: null,
  cst_ibs_cbs_code: '200',
  cclass_trib: '200025',
  iva_reduction_ibs_pct: 60,
  iva_reduction_cbs_pct: 100,
  irpj_pct: 1.5,
  csll_pct: 1.08,
}

/** Um produto LEGADO: fator único de 50, sem classificação. */
const PRODUTO_LEGADO: Record<string, unknown> = {
  id: 'p2',
  name: 'Produto antigo',
  icms_pct: 17,
  ibs_pct: 1,
  cbs_pct: 9,
  iva_dual_reduction_factor: 50,
  cst_ibs_cbs_code: null,
  cclass_trib: null,
  iva_reduction_ibs_pct: null,
  iva_reduction_cbs_pct: null,
}

const semAsColunasNovas = (colunas: readonly string[]): string[] =>
  colunas.filter((c) => c !== 'iva_reduction_ibs_pct' && c !== 'iva_reduction_cbs_pct')

describe('produto — a redução derivada chega e MUDA a alíquota efetiva', () => {
  it('com a lista COMPLETA: IBS 1,00% → 0,40% e CBS 9,00% → 0,00%', () => {
    const projetado = projetarPelasColunas(PRODUTO_CLASSIFICADO, PRODUCT_TAX_COLUMNS)
    const r = buildItemTaxRatesFromProduct(projetado)
    expect(r.ibs_pct).toBeCloseTo(0.4, 10)
    expect(r.cbs_pct).toBeCloseTo(0, 10)
  })

  it('SEM as duas colunas na lista, as alíquotas saem CHEIAS — e nada falha', () => {
    // É o defeito exato do #28 e do #45, reproduzido: o `select` não pede, o campo
    // chega `undefined`, e o número sai plausível.
    const projetado = projetarPelasColunas(PRODUTO_CLASSIFICADO, semAsColunasNovas(PRODUCT_TAX_COLUMNS))
    const r = buildItemTaxRatesFromProduct(projetado)
    expect(r.ibs_pct).toBeCloseTo(1, 10)
    expect(r.cbs_pct).toBeCloseTo(9, 10)
    // o contraste que dá dente ao caso anterior
    expect(r.ibs_pct).not.toBeCloseTo(0.4, 5)
  })

  it('as duas reduções caminham SEPARADAS na projeção — 0,40% e 0,00% não coincidem', () => {
    const r = buildItemTaxRatesFromProduct(
      projetarPelasColunas(PRODUTO_CLASSIFICADO, PRODUCT_TAX_COLUMNS),
    )
    // Com um campo só, as duas cairiam pela MESMA fração e a razão entre elas
    // seria a razão das brutas (1 : 9). Aqui não é.
    expect(r.ibs_pct! / 1).not.toBeCloseTo(r.cbs_pct! / 9, 5)
  })
})

describe('serviço — a MESMA lista, pela mesma razão', () => {
  it('a redução derivada chega e reduz as duas alíquotas', () => {
    const projetado = projetarPelasColunas(PRODUTO_CLASSIFICADO, SERVICE_TAX_COLUMNS)
    const r = buildItemTaxRatesFromProduct(projetado)
    expect(r.ibs_pct).toBeCloseTo(0.4, 10)
    expect(r.cbs_pct).toBeCloseTo(0, 10)
  })

  it('sem as colunas, saem cheias — serviço não é exceção', () => {
    // Deixar o serviço de fora da lista seria a metade de travessia que a
    // migração `20260916000002` evitou no schema.
    const projetado = projetarPelasColunas(PRODUTO_CLASSIFICADO, semAsColunasNovas(SERVICE_TAX_COLUMNS))
    const r = buildItemTaxRatesFromProduct(projetado)
    expect(r.ibs_pct).toBeCloseTo(1, 10)
    expect(r.cbs_pct).toBeCloseTo(9, 10)
  })
})

describe('o LEGADO continua chegando — tirar a coluna antiga também quebra', () => {
  it('fator 50 sem classificação: IBS 1,00% → 0,50% e CBS 9,00% → 4,50%', () => {
    const projetado = projetarPelasColunas(PRODUTO_LEGADO, PRODUCT_TAX_COLUMNS)
    const r = buildItemTaxRatesFromProduct(projetado)
    expect(r.ibs_pct).toBeCloseTo(0.5, 10)
    expect(r.cbs_pct).toBeCloseTo(4.5, 10)
  })

  it('sem `iva_dual_reduction_factor` na lista, o produto legado PERDE a redução', () => {
    const semLegado = PRODUCT_TAX_COLUMNS.filter((c) => c !== 'iva_dual_reduction_factor')
    const r = buildItemTaxRatesFromProduct(projetarPelasColunas(PRODUTO_LEGADO, semLegado))
    expect(r.ibs_pct).toBeCloseTo(1, 10)
    expect(r.cbs_pct).toBeCloseTo(9, 10)
  })
})

describe('a travessia do legado — as colunas novas VENCEM, e a ordem protege', () => {
  it('classificado: usa as duas novas e ignora o fator antigo', () => {
    const r = resolveReducoesDoItem({
      iva_reduction_ibs_pct: 60,
      iva_reduction_cbs_pct: 100,
      iva_dual_reduction_factor: 50,
    })
    expect(r).toEqual({ ibs: 60, cbs: 100, fonte: 'POR_TRIBUTO' })
    // Se o legado viesse primeiro, classificar não mudaria nada enquanto o campo
    // antigo tivesse valor — e a classificação ficaria decorativa.
    expect(r.ibs).not.toBe(50)
  })

  it('não classificado, com fator: o legado entra e vale para os DOIS', () => {
    const r = resolveReducoesDoItem({ iva_dual_reduction_factor: 50 })
    expect(r).toEqual({ ibs: 50, cbs: 50, fonte: 'LEGADO' })
  })

  it('nada em lugar nenhum: AUSENTE, e ausente NÃO é zero', () => {
    const r = resolveReducoesDoItem({})
    expect(r).toEqual({ ibs: null, cbs: null, fonte: 'AUSENTE' })
    expect(r.ibs).not.toBe(0)
  })

  it('UMA das duas novas preenchida já basta para vencer o legado', () => {
    // Zero na CBS é APURADO ("sem redução"), e não pode ser lido como ausência —
    // se fosse, o legado de 50 assumiria e a CBS cairia pela metade.
    const r = resolveReducoesDoItem({
      iva_reduction_ibs_pct: 60,
      iva_reduction_cbs_pct: 0,
      iva_dual_reduction_factor: 50,
    })
    expect(r).toEqual({ ibs: 60, cbs: 0, fonte: 'POR_TRIBUTO' })
    expect(r.cbs).not.toBe(50)
  })

  it('a FONTE é o que a tela usa para rotular — os três estados se distinguem', () => {
    const fontes = [
      resolveReducoesDoItem({ iva_reduction_ibs_pct: 60 }).fonte,
      resolveReducoesDoItem({ iva_dual_reduction_factor: 50 }).fonte,
      resolveReducoesDoItem(null).fonte,
    ]
    expect(new Set(fontes).size).toBe(3)
  })
})

describe('as listas são a cópia ÚNICA — a página monta o select a partir delas', () => {
  it('o `select` do Supabase sai da constante, com as duas colunas novas', () => {
    for (const lista of [PRODUCT_TAX_SELECT, SERVICE_TAX_SELECT]) {
      expect(lista).toContain('iva_reduction_ibs_pct')
      expect(lista).toContain('iva_reduction_cbs_pct')
      expect(lista).toContain('cclass_trib')
      expect(lista).toContain('iva_dual_reduction_factor')
    }
  })

  it('nenhuma coluna repetida — repetição no `select` é sinal de edição à mão', () => {
    expect(new Set(PRODUCT_TAX_COLUMNS).size).toBe(PRODUCT_TAX_COLUMNS.length)
    expect(new Set(SERVICE_TAX_COLUMNS).size).toBe(SERVICE_TAX_COLUMNS.length)
  })
})
