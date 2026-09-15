/**
 * A CASCATA EXPANDE DA ETAPA 12 EM DIANTE, e o cabeçalho do PDF centra sobre os valores.
 *
 * R19 e a aba "Orçamento" da planilha, linhas 64 a 88: cada dedução é uma LINHA PRÓPRIA, com
 * base, percentual e valor. IBS, CBS, IS e IPI são QUATRO linhas, não uma agrupada; ICMS, ISS
 * e PIS/COFINS são TRÊS.
 *
 * >>> AS DUAS METADES, E POR QUE SÓ UMA TEM NÚMERO <<<
 * Etapas 1 a 11 são a CONSTRUÇÃO e saem do `cascade_trace` do motor, com os números que sempre
 * tiveram. Da 12 em diante é a DECOMPOSIÇÃO, e as linhas saem SEM número: a R19 tem 21 linhas
 * e o trace tem 6 dali em diante, então qualquer número atribuído a "(−) IBS" seria inventado.
 *
 * É o que mantém intactas as citações já escritas — "a Etapa 16 é a fonte de verdade" fala do
 * trace que o MOTOR emite, e ele não é tocado: continua com as 17 etapas, os mesmos números e
 * os mesmos valores. O que muda é a LEITURA.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildCascadeView, ULTIMA_ETAPA_DA_CONSTRUCAO } from '@/utils/cascade-display-view'
import { buildDecomposition, type DecompositionResult } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import type { CascadeStep } from '@/types/mrm'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

const etapa = (step: number, label = `Etapa ${step}`, children?: CascadeStep[]): CascadeStep =>
  ({ step, label, base: 100, rate: 0.1, amount: -10, formula: 'f', source: 'X', children } as unknown as CascadeStep)

/** O trace como o motor o emite: 17 etapas, com os tributos escondidos em `children`. */
const TRACE: CascadeStep[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => etapa(n)),
  etapa(12),
  etapa(13, 'Cascata tributária', [etapa(13, 'ICMS'), etapa(13, 'ISS'), etapa(13, 'PIS/COFINS')]),
  etapa(14, 'Redução de custos e despesas', [etapa(14, 'Custos'), etapa(14, 'DOP')]),
  etapa(16, 'RRO'),
  etapa(17, 'Consolidação final', [etapa(17, 'IBS'), etapa(17, 'CBS')]),
]

const PRODUTO: BudgetDecompositionItem = {
  key: 'a', label: 'Produto A', quantity: 2, unitPrice: 5000, costUnit: 1200,
  commissionPct: 5, profitPct: 8, rtPct: 1,
  rates: { icms_pct: 17, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 1, cbs_pct: 8.8, is_pct: 2, ipi_pct: 5 },
  acrescimos: 300,
}

const DECOMP = buildDecomposition(buildBudgetDecompositionInput({
  items: [PRODUTO, { key: 'm', label: 'Manual', isManual: true, quantity: 1, unitPrice: 500 }],
  discountPct: 0.05, despesasOperacionaisPct: 0.18, irpjAliquota: 0.15, csllAliquota: 0.09,
}).input)

describe('1. DA 12 EM DIANTE, a decomposição substitui as etapas', () => {
  const view = buildCascadeView(TRACE, DECOMP)

  it('as etapas 1 a 11 continuam, NUMERADAS', () => {
    const numeradas = view.filter((r) => r.numero != null).map((r) => r.numero)
    expect(numeradas).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(Math.max(...(numeradas as number[]))).toBe(ULTIMA_ETAPA_DA_CONSTRUCAO)
  })

  it('e as etapas 12, 13, 14, 16 e 17 NÃO aparecem mais como etapas', () => {
    // O discriminante: sem a decomposição elas apareceriam. O caso exige o contraste.
    const semDecomp = buildCascadeView(TRACE)
    expect(semDecomp.filter((r) => r.numero != null).map((r) => r.numero))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17])
    expect(view.some((r) => r.numero === 17)).toBe(false)
  })

  it('as linhas da decomposição vêm SEM número', () => {
    const decompostas = view.slice(11)
    expect(decompostas.length).toBeGreaterThan(15)
    decompostas.forEach((r) => expect(r.numero).toBeNull())
  })
})

describe('2. CADA DEDUÇÃO É UMA LINHA — a quantidade muda, e é o ponto', () => {
  const view = buildCascadeView(TRACE, DECOMP)
  const rotulos = view.map((r) => r.label)

  it('ICMS, ISS e PIS/COFINS são TRÊS linhas', () => {
    expect(rotulos).toContain('(−) ICMS')
    expect(rotulos).toContain('(−) ISS')
    expect(rotulos).toContain('(−) PIS/COFINS')
    // E não a linha agrupada que o trace trazia.
    expect(rotulos).not.toContain('Cascata tributária')
  })

  it('cada uma tem a SUA base e o SEU percentual', () => {
    const icms = view.find((r) => r.label === '(−) ICMS')!
    const pis = view.find((r) => r.label === '(−) PIS/COFINS')!
    expect(icms.base).not.toBeNull()
    expect(icms.pct).not.toBeNull()
    // O discriminante: as bases DIVERGEM — a do PIS/COFINS desconta ICMS e ISS (R5,
    // exceção 2). Se fossem iguais, o caso não distinguiria "linha própria" de "rateio".
    expect(Math.abs((icms.base ?? 0) - (pis.base ?? 0))).toBeGreaterThan(1)
  })

  it('a ordem é a da R19: repasse → por fora → por dentro → custos → RRO', () => {
    const i = (l: string) => rotulos.findIndex((x) => x === l)
    expect(i('(−) Itens manuais + frete neles (sem tributo)')).toBeLessThan(i('(−) IBS · CBS · IS · IPI'))
    expect(i('(−) IBS · CBS · IS · IPI')).toBeLessThan(i('(−) ICMS'))
    expect(i('(−) ICMS')).toBeLessThan(i('(−) Custos — congelado'))
    expect(i('(−) Custos — congelado')).toBeLessThan(i('► RRO — RESULTADO RESIDUAL OPERACIONAL'))
  })

  it('e a lista fecha com RESIDUAL e LUCRO DA VENDA', () => {
    expect(rotulos[rotulos.length - 2]).toBe('► RESIDUAL (deve ser zero)')
    expect(rotulos[rotulos.length - 1]).toBe('LUCRO DA VENDA')
    // O lucro da venda NÃO é linha do DRE: ele vem DEPOIS do residual, que é a última.
    const lv = view[view.length - 1]
    expect(lv.valor).toBeCloseTo(DECOMP.lucroDaVenda!.valor, 6)
    expect(lv.pct).toBeCloseTo(DECOMP.lucroDaVenda!.pctSobreProdutos!, 9)
  })
})

describe('3. SEM decomposição, nada muda — pedido e venda seguem como estão', () => {
  it('o trace inteiro é devolvido, com os children indentados', () => {
    const view = buildCascadeView(TRACE)
    expect(view.filter((r) => r.isChild)).toHaveLength(7)
    expect(view.some((r) => r.label === 'IBS' && r.isChild)).toBe(true)
  })

  it('decomposição VAZIA também cai no caminho antigo — vazia não é decomposição', () => {
    const vazia: DecompositionResult = { rows: [], lucroDaVenda: null, residual: { perItem: [], total: 0 }, receitaAposDesconto: 0, errors: [] }
    expect(buildCascadeView(TRACE, vazia)).toHaveLength(buildCascadeView(TRACE).length)
  })
})

describe('4. A TELA consome a view, e o orçamento passa a decomposição', () => {
  const bloco = ler('page-parts/shared/consolidated-dre-block.component.tsx')
  const orc = ler('pages/orcamentos/index.tsx')

  it('o expander monta a view em vez de iterar o trace cru', () => {
    expect(bloco).toContain('buildCascadeView(trace, decomposition)')
    expect(bloco).toContain('view.map((row)')
    // A iteração antiga sobre `trace` com children saiu: duas fontes de linha na mesma
    // lista é o que produz uma tabela que discorda de si mesma.
    //
    // A busca é NO CORPO DO EXPANDER, e não no arquivo: `applyTotalACobrarToStep11` também
    // faz `trace.map((step)` e é outra função, legítima. Uma asserção sobre o arquivo
    // inteiro passaria verde com a iteração antiga de volta — variante 2 de
    // `.claude/rules/teste-que-nao-exercita.md`, e a terceira vez que ela me pega.
    const expander = bloco.slice(bloco.indexOf('function CascadeExpander('))
    expect(expander).not.toContain('trace.map((step)')
    expect(expander).not.toContain('step.children?.map(')
  })

  it('e o orçamento entrega a decomposição ao bloco', () => {
    expect(orc).toContain('decomposition={decomposition?.result ?? null}')
  })
})

describe('5. NO PDF, o cabeçalho é CENTRADO sobre os valores', () => {
  const mod = ler('lib/decomposition-pdf.ts')

  it('o head centraliza; a coluna Demonstrativo fica à esquerda', () => {
    expect(mod).toContain("hook.cell.styles.halign = hook.column.index === 0 ? 'left' : 'center'")
    const head = mod.slice(mod.indexOf("if (hook.section === 'head')"), mod.indexOf("if (hook.section !== 'body')"))
    expect(head).toContain("'center'")
    expect(head).toContain("'left'")
  })

  it('e o CORPO continua à direita — o alinhamento do título não arrasta o número', () => {
    expect(mod).toContain("if (hook.column.index >= 3) hook.cell.styles.halign = 'right'")
    // O discriminante: se o `didParseCell` do head saísse sem o `return`, ele cairia no
    // ramo do corpo e recentraria os valores também.
    const head = mod.slice(mod.indexOf("if (hook.section === 'head')"), mod.indexOf("if (hook.section !== 'body')"))
    expect(head).toContain('return')
  })
})
