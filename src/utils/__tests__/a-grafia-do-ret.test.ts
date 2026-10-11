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
