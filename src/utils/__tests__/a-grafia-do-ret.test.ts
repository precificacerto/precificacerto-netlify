/**
 * A GRAFIA DO RET — três pontos escritos `'PRESUMIDO_RET'` onde o banco diz
 * `'LUCRO_PRESUMIDO_RET'`, e os três com consequência MEDIDA.
 *
 * Portão exigido pelo dono do produto (D4) no passo XI-3.5 FASE C, em 11/10/2026, **antes**
 * da correção. Os seis casos marcados `>>>` ficam VERMELHOS no estado anterior a ela.
 *
 * ══ POR QUE OS TRÊS PRECISAM DE PORTÃO PRÓPRIO ══════════════════════════════════════════
 *
 * A FASE C unifica `TaxRegime` e o compilador passa a exigir decisão em cada ponto tipado.
 * **Os três pontos abaixo são tipados `string`**, e por isso o portão de tipo não os alcança —
 * é `portao-que-nao-alcanca.md` na pergunta 2: *o portão alcança o ARQUIVO em questão?* Não
 * alcança, então a rede aqui tem de ser de comportamento.
 *
 * ══ A CÓPIA CERTA AO LADO DAS ERRADAS ═══════════════════════════════════════════════════
 *
 * `buildDre` (`dfc/index.tsx:1039`) testava **as duas** grafias e por isso funcionava. Alguém
 * corrigiu ali e não nos outros três — `copia-divergente.md`, com a particularidade de que
 * uma das cópias estava certa. A FASE C tira a metade errada de lá: com o tipo unificado,
 * `taxRegime === 'PRESUMIDO_RET'` é comparação com literal fora da união, isto é, erro de tipo.
 *
 * ══ O QUE CADA CASO DISTINGUE ═══════════════════════════════════════════════════════════
 *
 * Nenhum afirma "a função foi chamada". Cada um afirma o valor que o usuário vê: o rótulo na
 * tela, o NOME DO ARQUIVO que vira anexo, e a lista de categorias que a tela oferece.
 */

import { aggregateEntries, buildDre, getVariantLabel } from '@/pages/dfc'
import { buildDfcExcelFileName, getRegimeLabel } from '@/utils/dfc-regime-label'
import {
  getExpenseCategoryOptionsForRegime as opcoesDoCaixaPorRegime,
  getTaxCategoriesForRegime,
  TAX_CATEGORIES_LUCRO,
  TAX_CATEGORIES_PRESUMIDO_RET,
} from '@/constants/cashier-category'
import {
  LP_EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_CATEGORY_OPTIONS,
  getExpenseCategoryOptionsForRegime,
  getGroupForCategoryByRegime,
} from '@/constants/expense-categories-by-regime'

/**
 * A grafia que o banco guarda. Não é escolha de estilo: é o enum
 * `tax_regime` de `tenant_settings`, e `database.types.ts` o reproduz valor por valor.
 */
const DO_BANCO = 'LUCRO_PRESUMIDO_RET'

/**
 * O agregado VAZIO vem do produtor REAL, `aggregateEntries([])`, e não de uma lista de campos
 * escrita à mão. A primeira versão deste arquivo enumerou os campos de memória, faltaram
 * alguns, e `buildDrePresumidoRET` estourou com `Cannot read properties of undefined`. É
 * `instrumento-que-nao-enxerga.md` em forma de fixture: o que eu escrevo de memória é a minha
 * imagem do tipo, não o tipo.
 */
function aggVazio() {
  return aggregateEntries([])
}

describe('(1) O RÓTULO NA TELA — `getVariantLabel`', () => {
  it('>>> a grafia do BANCO devolve "Presumido RET", não a string crua <<<', () => {
    // Antes da correção: `case 'PRESUMIDO_RET'` não casa, cai no `default`, e a tela exibe
    // `Regime: LUCRO_PRESUMIDO_RET`. O caso afirma o TEXTO, que é o que o usuário lê.
    expect(getVariantLabel(DO_BANCO)).toBe('Presumido RET')
    expect(getVariantLabel(DO_BANCO)).not.toBe(DO_BANCO)
  })

  it('e os outros cinco regimes continuam com o rótulo de hoje', () => {
    // O par que impede a correção de ser um `return 'Presumido RET'` no topo.
    expect(getVariantLabel('LUCRO_REAL')).toBe('Lucro Real')
    expect(getVariantLabel('LUCRO_PRESUMIDO')).toBe('Lucro Presumido')
    expect(getVariantLabel('SIMPLES_NACIONAL')).toBe('Simples Nacional')
    expect(getVariantLabel('SIMPLES_HIBRIDO')).toBe('Simples Híbrido')
    expect(getVariantLabel('MEI')).toBe('MEI')
  })
})

describe('(2) O NOME DO ARQUIVO — o efeito que sai da tela e vira anexo', () => {
  it('>>> o rótulo do Excel para a grafia do banco é "Presumido RET" <<<', () => {
    expect(getRegimeLabel(DO_BANCO)).toBe('Presumido RET')
  })

  it('>>> e o NOME DO ARQUIVO não carrega a string crua do enum <<<', () => {
    // Antes: `DRE_2026_Anual_LUCRO_PRESUMIDO_RET.xlsx`. É o caso que o dono do produto pediu
    // ao escolher a rota (a): um nome de arquivo errado sai da tela e vira anexo de e-mail.
    const nome = buildDfcExcelFileName(2026, 'Anual', DO_BANCO)
    expect(nome).toBe('DRE_2026_Anual_Presumido_RET.xlsx')
    expect(nome).not.toContain('LUCRO_PRESUMIDO_RET')
  })
})

describe('(3) AS CATEGORIAS DE DESPESA — e este é COMPORTAMENTO, não rótulo', () => {
  it('>>> o tenant RET recebe LP_EXPENSE_CATEGORY_OPTIONS, não o genérico <<<', () => {
    // Antes: `isLucroPresumidoRegime` testava só `'PRESUMIDO_RET'`, o tenant caía no
    // `EXPENSE_CATEGORY_OPTIONS` genérico, e a tela de despesas oferecia a lista errada.
    expect(getExpenseCategoryOptionsForRegime(DO_BANCO)).toBe(LP_EXPENSE_CATEGORY_OPTIONS)
    expect(getExpenseCategoryOptionsForRegime(DO_BANCO)).not.toBe(EXPENSE_CATEGORY_OPTIONS)
  })

  it('e o RET recebe a MESMA lista do Lucro Presumido — é a mesma pergunta', () => {
    expect(getExpenseCategoryOptionsForRegime(DO_BANCO))
      .toBe(getExpenseCategoryOptionsForRegime('LUCRO_PRESUMIDO'))
  })

  it('>>> e o GRUPO de uma categoria de imposto também sai pela trilha do Presumido <<<', () => {
    // Segunda consequência do mesmo `||`: `getGroupForCategoryByRegime` lê o mesmo helper.
    // A categoria é lida de `LP_IMPOSTOS_SOBRE_LUCRO` para não fixar um nome inventado.
    const categoria = LP_EXPENSE_CATEGORY_OPTIONS
      .flatMap((g) => g.options)
      .map((o) => o.value)
      .find((v) => /IRPJ/i.test(v))
    expect(typeof categoria).toBe('string')
    const grupoRet = getGroupForCategoryByRegime(DO_BANCO, categoria as string)
    const grupoLp = getGroupForCategoryByRegime('LUCRO_PRESUMIDO', categoria as string)
    expect(grupoLp).toBeDefined()
    expect(grupoRet).toBe(grupoLp)
  })
})

describe('(4) A CÓPIA CERTA — `buildDre` já tratava a grafia do banco', () => {
  it('a DRE do RET sai pela variante do RET com a grafia do banco', () => {
    // Verde ANTES e DEPOIS, de propósito, e por isso NÃO leva `>>>`: é a cópia que estava
    // certa. O caso existe para provar que a FASE C, ao tirar a metade errada de lá, não
    // levou a certa junto.
    const retRows = buildDre(aggVazio(), DO_BANCO, 'INDUSTRIALIZATION')
    const lrRows = buildDre(aggVazio(), 'LUCRO_REAL', 'INDUSTRIALIZATION')
    expect(retRows.length).toBeGreaterThan(0)
    expect(retRows.map((r) => r.key)).not.toEqual(lrRows.map((r) => r.key))
  })
})

describe('(5) OS DOIS PONTOS QUE ACEITAVAM AS DUAS GRAFIAS — portão antes da remoção', () => {
  /**
   * ══ ESTES CASOS SÃO VERDES ANTES E DEPOIS, E ISSO ESTÁ DECLARADO ═══════════════════════
   *
   * `cashier-category.ts:581` e `:689` testavam `'LUCRO_PRESUMIDO_RET' || 'PRESUMIDO_RET'` —
   * a grafia certa JÁ funcionava. Então um caso aqui não distingue o antes do depois, e
   * dizê-lo é `teste-que-nao-exercita.md`: a variante 1 é justamente o caso que passa nos
   * dois estados sem exercitar nada.
   *
   * O que eles protegem é a REMOÇÃO: se alguém tirar a metade CERTA em vez da morta, estes
   * ficam vermelhos. Foi para isso que o dono do produto os pediu antes da remoção.
   *
   * ── A MEDIÇÃO QUE AUTORIZOU A REMOÇÃO, por consulta à fonte primária (11/10/2026)
   *
   * `tax_regime` é ENUM do Postgres nas QUATRO colunas que o usam — `tenant_settings`,
   * `pricing_calculations`, `pricing_history` e `baseline.pricing_calc_20260914` —, todas
   * `USER-DEFINED` / `udt_name = 'tax_regime'`, **nenhuma `text`**. O enum tem 6 rótulos, e
   * `'PRESUMIDO_RET'` não está entre eles. Um enum não guarda valor fora da lista, logo
   * nenhuma linha histórica carrega a grafia curta — `estado-relatado-vs-real.md`: consulta,
   * não dedução.
   */

  it('>>> as categorias de IMPOSTO do RET saem pela lista do RET, não pela do Lucro <<<', () => {
    expect(getTaxCategoriesForRegime(DO_BANCO)).toBe(TAX_CATEGORIES_PRESUMIDO_RET)
    expect(getTaxCategoriesForRegime(DO_BANCO)).not.toBe(TAX_CATEGORIES_LUCRO)
    // e o par que prova que a lista do RET é OUTRA: ela tem IMPOSTO_RET e não tem IRPJ/CSLL
    expect(TAX_CATEGORIES_PRESUMIDO_RET).toContain('IMPOSTO_RET')
    expect(TAX_CATEGORIES_PRESUMIDO_RET).not.toContain('IMPOSTO_IRPJ')
    expect(TAX_CATEGORIES_LUCRO).toContain('IMPOSTO_IRPJ')
    expect(TAX_CATEGORIES_LUCRO).not.toContain('IMPOSTO_RET')
  })

  it('>>> e o bloco de impostos do seletor de despesa do caixa é o do RET <<<', () => {
    // Afirma EFEITO: o rótulo do bloco que só a lista do RET produz aparece nas opções, e o
    // bloco do Lucro não. Sem o par, "as opções existem" não distinguiria os dois blocos.
    const rotulos = (regime: string) =>
      opcoesDoCaixaPorRegime(regime).flatMap((g) => g.options).map((o) => o.value)
    const ret = rotulos(DO_BANCO)
    const lp = rotulos('LUCRO_PRESUMIDO')
    expect(ret).toContain('IMPOSTO_RET')
    expect(lp).not.toContain('IMPOSTO_RET')
  })

  it('e nenhum dos cinco outros regimes passa a receber a lista do RET', () => {
    for (const r of ['MEI', 'SIMPLES_NACIONAL', 'SIMPLES_HIBRIDO', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'] as const) {
      expect(getTaxCategoriesForRegime(r)).not.toBe(TAX_CATEGORIES_PRESUMIDO_RET)
    }
  })
})
