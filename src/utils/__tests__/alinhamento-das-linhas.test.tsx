/**
 * ALINHAMENTO DAS LINHAS NO LANÇAMENTO DE DESPESA — comando do PO de 24/09/2026 (tarde).
 *
 * >>> O QUE ESTE ARQUIVO ACRESCENTA, E O QUE FOI ATUALIZADO NOUTRO LUGAR <<<
 *
 * §1 (as duas linhas do bloco 1A) e §3 (a anatomia única) mudaram casos que JÁ EXISTIAM —
 * eles afirmavam as posições antigas, e um caso que afirma o estado anterior não pode ser
 * duplicado, tem de ser reescrito. Estão em `bloco3-em-tres-linhas.test.tsx` (blocos B e G)
 * e em `ordem-dos-blocos-na-despesa.test.tsx` (bloco E), cada um com a razão dentro.
 *
 * Aqui fica o que é NOVO: o §2, que remove um controle e com ele um caminho de gravação, e
 * a prova de que a regra removida da tela continua viva no motor.
 *
 * A forma dos casos de ausência é a de sempre: cada um vem com o PAR que os distingue de
 * "nunca esteve lá com essa grafia" (`teste-que-nao-exercita.md`, variante 2).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Form } from 'antd'
import PurchaseTaxCredits from '@/page-parts/items/purchase-tax-credits.component'
import { resolverFlagsDoItem } from '@/utils/custo-liquido-do-item'
import { descascarANota } from '@/utils/nota-de-compra'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const tela = () => ler('src/pages/fluxo-de-caixa/index.tsx')
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const bandeiras = () =>
  resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao: 'INSUMO', segmento: 'INDUSTRIALIZACAO' }, {})

function montar(no: React.ReactNode): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { createRoot(host).render(<Form layout="vertical">{no}</Form>) })
  return host
}

const blocoPorFora = (props: Record<string, unknown> = {}) => (
  <PurchaseTaxCredits
    modo="posicao" visivel semDestinacao semBlocoB semRodape semFornecedorDoSimples
    titulo="Gera crédito — por fora"
    tributos={['IPI', 'CBS', 'IBS']}
    bandeiras={bandeiras()} custo={null}
    onToggle={() => {}} onRecalc={() => {}}
    {...props}
  />
)

// ═════════════════════════════════════════════════════════════════════════════════════════
// A — O SELETOR POR FORA | POR DENTRO SAIU DA TELA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — §2: a menção é a afirmação, e o seletor não existe mais', () => {
  it('>>> nem o controle nem o campo estão na tela <<<', () => {
    const s = semComentario(tela())
    expect(s).not.toContain('ipi_por_dentro')
    expect(s).not.toContain('POR DENTRO')
    expect(s).not.toContain('O IPI creditável está')
    // O PAR: o IPI continua na tela, no bloco por fora. Sem esta linha, o caso acima
    // passaria com o tributo inteiro removido.
    expect(s).toContain("tributos={['IPI', 'CBS', 'IBS']}")
  })

  it('>>> e o bloco por fora não renderiza mais nada depois das três linhas <<<', () => {
    const host = montar(blocoPorFora())
    // Nenhum grupo de rádio no DOM — era a forma do seletor.
    expect(host.querySelectorAll('.ant-radio-button-wrapper').length).toBe(0)
    // E o PAR: as três linhas estão lá.
    const t = host.textContent ?? ''
    expect(t).toContain('IPI')
    expect(t).toContain('CBS')
    expect(t).toContain('IBS')
    host.remove()
  })

  it('>>> `ipi_por_dentro` deixa de ser GRAVADO, e a tela manda sempre POR FORA <<<', () => {
    const s = semComentario(tela())
    expect(s).toContain('ipiPorDentro: false')
    // A distinção entre "não grava" e "grava false": o insert não tem mais a coluna.
    expect(s).not.toMatch(/ipi_por_dentro:\s/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — A REGRA SAIU DA TELA E CONTINUA NO MOTOR
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — §2: o que saiu foi o controle, não a regra', () => {
  /**
   * É O CASO QUE TORNA A REMOÇÃO REVERSÍVEL.
   *
   * Sem ele, "o parâmetro continua no motor" seria uma afirmação do corpo do PR, e a
   * primeira limpeza que encontrasse `ipiPorDentro` sem chamador na tela o apagaria — e
   * apagar a regra é o que a remoção do controle NÃO decidiu.
   */
  const comIpi = (porDentro: boolean) => descascarANota({
    total: 1060,
    porFora: { ipi: { brl: 60 } },
    ipiPorDentro: porDentro,
    porDentro: { icms: { pct: 18 } },
    bandeiras: bandeiras(),
  })

  it('>>> por fora a base é 1.000,00; por dentro, 1.060,00 <<<', () => {
    expect(comIpi(false).base).toBeCloseTo(1000, 2)
    expect(comIpi(true).base).toBeCloseTo(1060, 2)
  })

  it('>>> e o parâmetro continua declarado no contrato do motor <<<', () => {
    expect(ler('src/utils/nota-de-compra.ts')).toMatch(/ipiPorDentro\?:/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — A LINHA DO IPI É IGUAL ÀS DE CBS E IBS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — §2 e §3: a mesma linha, cinco vezes', () => {
  it('>>> as três linhas do bloco por fora têm a MESMA grade <<<', () => {
    const host = montar(blocoPorFora({ leitura: { IPI: 'R$ 60,00', CBS: 'R$ 0,00', IBS: 'R$ 0,00' } }))
    const linhas = Array.from(host.querySelectorAll<HTMLElement>('div[style*="grid-template-columns"]'))
      .filter((el) => (el.getAttribute('style') ?? '').includes('140px'))
    // Três linhas de tributo, e o cabeçalho, todos com a mesma definição de colunas.
    expect(linhas.length).toBeGreaterThanOrEqual(3)
    const gradesDistintas = new Set(linhas.map((el) => /grid-template-columns:([^;]+)/.exec(el.getAttribute('style') ?? '')?.[1]?.trim()))
    expect(Array.from(gradesDistintas)).toEqual(['140px 1fr 150px'])
    host.remove()
  })

  it('>>> e o ICMS não tem mais exceção nenhuma no slot da entrada <<<', () => {
    const s = tela()
    const extras = s.slice(s.indexOf('const extrasDosTributos'), s.indexOf('const leiturasDoCredito'))
    // O slot é montado por UMA expressão, igual para os cinco. A única condição que sobra
    // é a do PIS/COFINS, e ela é sobre CONTEÚDO — o texto da base —, não sobre largura.
    expect(semComentario(extras)).not.toContain("t === 'ICMS'")
    expect(extras).toContain("t === 'PIS_COFINS'")
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — NÃO-REGRESSÃO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — o alinhamento não encostou na conta', () => {
  it('>>> o gabarito continua: saldo 1.060,00 · base 1.000,00 · crédito 315,85 · líquido 856,15 <<<', () => {
    const d = descascarANota({
      total: 1172,
      composicao: { frete: 100 },
      reducoes: { ipiCusto: 40, icmsSt: 50, difal: 18, fcp: 4 },
      porFora: { ipi: { brl: 60 } },
      valorIs: 50,
      porDentro: { icms: { brl: 180 }, pisCofins: { pct: 9.25 } },
      bandeiras: bandeiras(),
    })
    expect(d.saldo).toBeCloseTo(1060.0, 2)
    expect(d.base).toBeCloseTo(1000.0, 2)
    expect(d.creditoTotal).toBeCloseTo(315.85, 2)
    expect(d.custoLiquido).toBeCloseTo(856.15, 2)
  })

  it('>>> e os três módulos de cálculo não ganharam fórmula nenhuma na tela <<<', () => {
    const c = semComentario(tela())
    expect(c).not.toMatch(/\*\s*\d+\s*\/\s*100/)
    expect(c).not.toMatch(/saldo\s*-\s*porFora/)
  })
})
