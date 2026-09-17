/**
 * A ORDEM DAS ETAPAS NA TELA, E O PDF EM COLUNAS.
 *
 * Duas decisões, e as duas vieram de uma medição que mudou o diagnóstico.
 *
 * >>> A CONTA JÁ ESTAVA CERTA <<<
 * A divergência relatada era "a Etapa 17 põe IBS e CBS no FIM, depois do RRO". Medido antes de
 * mexer: a Etapa 12 (Âncora Interna) é `rv_total × peso_op_interna_ponderado`, e
 * `peso_externo = 1 − peso_op_interna_ponderado` — a operação por fora JÁ é separada ali,
 * antes do por dentro (13), dos custos (14) e do RRO (16). A Etapa 17 nasce como placeholder
 * com `amount: 0` e a Camada 2 a preenche com a própria fórmula dizendo o que ela é:
 * "Op. Externa pós-desconto (Step 12) redistribuída por pesos do Step 8".
 *
 * Logo: era EXIBIÇÃO fora de ordem, não conta. A correção move a leitura, não o motor —
 * corrigir uma conta certa mudaria números em produção sem defeito que o justifique.
 *
 * >>> DOIS FORMATOS, UMA FONTE <<<
 * A tela fica com as ETAPAS; o PDF sai em COLUNAS por produto. São duas LEITURAS do mesmo
 * cálculo. O que `copia-divergente.md` proíbe é duas CONTAS — e é por isso que o `pdfMeta`
 * carrega a decomposição já montada em vez de o PDF remontá-la.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { orderCascadeForDisplay, STEP_ANCORA_INTERNA, STEP_POR_FORA } from '@/utils/cascade-display-order'
import type { CascadeStep } from '@/types/mrm'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

const etapa = (step: number, label = `Etapa ${step}`): CascadeStep =>
  ({ step, label, base: null, rate: null, amount: 0, formula: '', source: 'X' } as unknown as CascadeStep)

/** O trace como o motor o emite: o por fora é o ÚLTIMO, depois do RRO. */
const TRACE = [11, 12, 13, 14, 15, 16, 17].map((n) => etapa(n))

describe('1. O POR FORA sobe para junto de onde é apurado', () => {
  it('a etapa 17 passa a vir logo depois da 12', () => {
    const ordenado = orderCascadeForDisplay(TRACE)
    expect(ordenado.map((s) => s.step)).toEqual([11, 12, 17, 13, 14, 15, 16])
  })

  it('e ela deixa de vir DEPOIS do RRO — a relação que a R19 fixa', () => {
    const ordenado = orderCascadeForDisplay(TRACE)
    const idx = (n: number) => ordenado.findIndex((s) => Number(s.step) === n)
    expect(idx(STEP_POR_FORA)).toBeLessThan(idx(13))
    expect(idx(STEP_POR_FORA)).toBeLessThan(idx(16))
    expect(idx(STEP_ANCORA_INTERNA)).toBeLessThan(idx(STEP_POR_FORA))
    // O contraste que dá sentido ao caso: no trace CRU ela vinha depois de tudo.
    expect(TRACE.findIndex((s) => s.step === STEP_POR_FORA)).toBeGreaterThan(
      TRACE.findIndex((s) => s.step === 16),
    )
  })

  it('NENHUM valor, número ou filho é alterado — só a ordem', () => {
    const comFilhos = [
      etapa(12, 'Âncora Interna (PÓS-desconto)'),
      etapa(16, 'RRO'),
      { ...etapa(17, 'Consolidação final'), amount: -1234.56, children: [etapa(17, 'IBS'), etapa(17, 'CBS')] } as CascadeStep,
    ]
    const ordenado = orderCascadeForDisplay(comFilhos)
    const porFora = ordenado.find((s) => Number(s.step) === 17)!
    expect(porFora.amount).toBe(-1234.56)
    expect(porFora.children).toHaveLength(2)
    expect(porFora.label).toBe('Consolidação final')
    // Mesmo conjunto de etapas, sem perder nem duplicar nenhuma.
    expect(ordenado).toHaveLength(comFilhos.length)
    expect([...ordenado].sort((a, b) => Number(a.step) - Number(b.step)))
      .toEqual([...comFilhos].sort((a, b) => Number(a.step) - Number(b.step)))
  })

  it('trace SEM a etapa 17 ou SEM a 12 passa intacto', () => {
    // O V16 legado tem 13 etapas, e o trace só de itens manuais é menor ainda. Inventar uma
    // posição faria a ordem afirmar uma conta que ninguém conferiu.
    const semPorFora = [11, 12, 13, 16].map((n) => etapa(n))
    expect(orderCascadeForDisplay(semPorFora)).toBe(semPorFora)
    const semAncora = [11, 13, 16, 17].map((n) => etapa(n))
    expect(orderCascadeForDisplay(semAncora)).toBe(semAncora)
    expect(orderCascadeForDisplay([])).toEqual([])
  })

  it('trace JÁ ordenado não é remexido', () => {
    const jaOk = [etapa(12), etapa(17), etapa(13)]
    expect(orderCascadeForDisplay(jaOk)).toBe(jaOk)
  })
})

describe('2. A TELA usa a ordem — e continua com as ETAPAS', () => {
  const bloco = ler('page-parts/shared/consolidated-dre-block.component.tsx')
  const orc = ler('pages/orcamentos/index.tsx')

  it('o expander reordena antes de renderizar', () => {
    expect(bloco).toContain('orderCascadeForDisplay(traceBruto)')
  })

  it('a tabela por produto NÃO é renderizada na tela do orçamento', () => {
    // Ela é o formato do PDF. A tela mantém as etapas, no mesmo lugar e com o mesmo
    // acionamento de sempre.
    expect(orc).not.toContain('<DecompositionTable')
    expect(orc).not.toContain("from '@/page-parts/shared/decomposition-table.component'")
  })

  it('e a cascata continua na tela, acionada pelo mesmo expander', () => {
    expect(orc).toContain('<ConsolidatedDREBlock')
    expect(bloco).toContain('<details')
  })
})

describe('3. O PDF sai em COLUNAS, da decomposição já montada', () => {
  const bloco = ler('page-parts/shared/consolidated-dre-block.component.tsx')
  const orc = ler('pages/orcamentos/index.tsx')
  const pdf = ler('lib/create-cascade-pdf.ts')

  it('o botão gera o PDF da decomposição quando ela existe', () => {
    expect(bloco).toContain('downloadDecompositionPdf(pdfMeta)')
  })

  it('e cai no PDF das etapas quando a tela ainda não passa a decomposição', () => {
    // Pedido e venda ainda não a montam. Melhor o PDF antigo que PDF nenhum — e a condição
    // é explícita, para não ser lida como "as duas coisas sempre".
    expect(bloco).toContain('pdfMeta.decomposition')
    expect(bloco).toContain('downloadCascadePdf(trace, pdfMeta)')
  })

  it('o orçamento passa a decomposição JÁ MONTADA — o PDF não remonta nada', () => {
    expect(orc).toContain('{ decomposition: decomposition.result, itemLabels: decomposition.labels }')
    expect(pdf).not.toContain('buildDecomposition(')
  })

  it('o PDF da decomposição NÃO imprime a tabela de etapas', () => {
    // As duas no mesmo papel devolveriam as duas apresentações por outro caminho.
    const doc = pdf.slice(pdf.indexOf('export function buildDecompositionDoc'), pdf.indexOf('export function downloadDecompositionPdf'))
    expect(doc).toContain('appendDecompositionPages')
    expect(doc).not.toContain('autoTable')
  })
})
