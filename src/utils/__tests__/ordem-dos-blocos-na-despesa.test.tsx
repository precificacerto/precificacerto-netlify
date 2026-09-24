/**
 * A ORDEM DOS BLOCOS NA TELA DE DESPESA — oráculos A–G do comando do PO de 24/09/2026.
 *
 * >>> POR QUE ESTES CASOS NÃO SÃO "A PROP ESTÁ NO ARQUIVO" <<<
 *
 * O defeito aqui É A POSIÇÃO: ICMS e PIS/COFINS apareciam na mesma tabela que CBS e IBS, e
 * uma tela que embaralha a hierarquia ensina a conta errada mesmo calculando certo. Não há
 * número a medir — o cálculo não mudou, e o caso G afirma exatamente isso.
 *
 * `teste-que-nao-exercita.md` reconhece esse caso-limite ("o ternário está nos DOIS pontos"),
 * e é ele que se aplica. Mesmo assim, o que dá para medir foi medido:
 *
 * - **B e F renderizam o componente de verdade**, com antd, e afirmam QUAIS LINHAS existem.
 *   Trocar a prop `tributos` faz o caso falhar porque a linha some do DOM, não porque um
 *   texto sumiu do arquivo.
 * - **A, C, D e E leem a página** e afirmam a ORDEM das posições — que é a ordem do DOM,
 *   porque é a ordem do JSX. Um caso que só afirmasse presença passaria com os blocos
 *   trocados, que é o defeito que este PR corrige.
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

/** Só o corpo do Drawer de despesa — a página tem outros formulários. */
const corpoDoDrawer = (s: string) => {
  const i = s.indexOf('Novo Lançamento de Despesa"')
  return s.slice(i, s.indexOf('</Drawer>', i))
}

/** O código sem comentário: prosa não desenha nada na tela. */
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const bandeiras = () =>
  resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao: 'INSUMO', segmento: 'INDUSTRIALIZACAO' }, {})

/** Monta o componente com antd de verdade e devolve o texto do DOM. */
function textoRenderizado(props: Record<string, unknown>): string {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => {
    createRoot(host).render(
      <Form layout="vertical">
        <PurchaseTaxCredits
          visivel
          semDestinacao
          bandeiras={bandeiras()}
          custo={null}
          onToggle={() => {}}
          onRecalc={() => {}}
          {...props}
        />
      </Form>,
    )
  })
  const texto = host.textContent ?? ''
  host.remove()
  return texto
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// A — A ORDEM DOS BLOCOS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — a sequência dos blocos é a hierarquia fiscal', () => {
  /**
   * A ORDEM, e não a presença.
   *
   * Um caso que afirmasse só "os seis títulos existem" passaria com o bloco por dentro ANTES
   * do por fora — que é exatamente o defeito que este PR corrige.
   */
  const ORDEM = [
    'Reduções — não geram crédito',
    'Saldo (base para os demais tributos)',
    'Gera crédito — por fora',
    'Base dos produtos (vProd)',
    'Gera crédito — por dentro',
    'CUSTO LÍQUIDO',
  ]

  it('>>> reduções → saldo → por fora → base → por dentro → custo líquido <<<', () => {
    const c = corpoDoDrawer(tela())
    const posicoes = ORDEM.map((t) => ({ titulo: t, pos: c.indexOf(t) }))
    for (const p of posicoes) expect({ [p.titulo]: p.pos }).not.toEqual({ [p.titulo]: -1 })
    const so = posicoes.map((p) => p.pos)
    expect(so).toEqual([...so].sort((a, b) => a - b))
  })

  it('>>> e o SALDO vem ANTES do bloco por fora, que vem antes da BASE <<<', () => {
    const c = corpoDoDrawer(tela())
    // O par que o defeito trocava: com uma tabela só, não havia "antes" nem "depois".
    expect(c.indexOf('Saldo (base para os demais tributos)')).toBeLessThan(c.indexOf('Gera crédito — por fora'))
    expect(c.indexOf('Gera crédito — por fora')).toBeLessThan(c.indexOf('Base dos produtos (vProd)'))
    expect(c.indexOf('Base dos produtos (vProd)')).toBeLessThan(c.indexOf('Gera crédito — por dentro'))
  })

  it('>>> SALDO e BASE são FAIXAS, não linhas de tabela <<<', () => {
    const c = corpoDoDrawer(tela())
    // As duas usam o mesmo componente de degrau; dentro de um cartão virariam mais uma linha.
    expect(c).toMatch(/<LinhaDeDegrau[\s\S]{0,200}Saldo \(base para os demais tributos\)/)
    expect(c).toMatch(/<LinhaDeDegrau[\s\S]{0,200}Base dos produtos \(vProd\)/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — NENHUMA LINHA POR DENTRO NO BLOCO POR FORA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — cada bloco desenha só os seus tributos', () => {
  it('>>> o bloco POR FORA tem IPI, CBS e IBS — e NÃO tem ICMS nem PIS/COFINS <<<', () => {
    const t = textoRenderizado({ modo: 'posicao', tributos: ['IPI', 'CBS', 'IBS'], semBlocoB: true, semRodape: true })
    expect(t).toContain('IPI')
    expect(t).toContain('CBS')
    expect(t).toContain('IBS')
    expect(t).not.toContain('ICMS')
    expect(t).not.toContain('PIS/COFINS')
  })

  it('>>> o bloco POR DENTRO tem ICMS e PIS/COFINS — e NÃO tem CBS nem IBS <<<', () => {
    const t = textoRenderizado({ modo: 'posicao', tributos: ['ICMS', 'PIS_COFINS'], semBlocoB: true, semRodape: true })
    expect(t).toContain('ICMS')
    expect(t).toContain('PIS/COFINS')
    expect(t).not.toContain('CBS')
    expect(t).not.toContain('IBS')
  })

  it('>>> o "fornecedor do Simples" aparece só onde ele atinge: com CBS ou IBS <<<', () => {
    const porFora = textoRenderizado({ modo: 'posicao', tributos: ['IPI', 'CBS', 'IBS'], semBlocoB: true, semRodape: true })
    const porDentro = textoRenderizado({ modo: 'posicao', tributos: ['ICMS', 'PIS_COFINS'], semBlocoB: true, semRodape: true })
    expect(porFora).toContain('Fornecedor do Simples')
    // Nos dois renders ele apareceria DUAS vezes na mesma tela, perguntando o mesmo.
    expect(porDentro).not.toContain('Fornecedor do Simples')
  })

  it('e a página pede exatamente esses dois conjuntos', () => {
    const c = corpoDoDrawer(tela())
    expect(c).toContain("tributos={['IPI', 'CBS', 'IBS']}")
    expect(c).toContain("tributos={['ICMS', 'PIS_COFINS']}")
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — SEM DUPLICATA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — ICMS-ST tem campo, e não texto repetido', () => {
  it('>>> "sempre custo" NÃO aparece na tela de despesa <<<', () => {
    const t = textoRenderizado({ modo: 'posicao', tributos: ['IPI', 'CBS', 'IBS'], semBlocoB: true, semRodape: true })
    expect(t).not.toContain('sempre custo')
  })

  it('>>> e o ICMS-ST aparece UMA vez como TEXTO DE TELA, e é um CAMPO <<<', () => {
    const t = tela()
    // A contagem é sobre o CÓDIGO SEM COMENTÁRIO. Um comentário menciona o ICMS-ST e não
    // desenha nada; contá-lo faria o caso falhar por uma linha de prosa. E contar só a
    // string entre aspas seria pior: uma legenda duplicada escrita como texto de JSX
    // (`<span>ICMS-ST …</span>`) não tem aspas, e passaria — que é o defeito oposto.
    const ocorrencias = (semComentario(t).match(/ICMS-ST/g) ?? []).length
    expect(ocorrencias).toBe(1)
    // E é campo, com o nome da coluna, na lista dos valores em R$ do bloco de custo.
    expect(t).toContain("{ name: 'valor_icms_st', label: 'ICMS-ST'")
  })

  it('>>> o bloco B interno some com `semBlocoB`, e o texto das três linhas vai junto <<<', () => {
    const com = textoRenderizado({ modo: 'posicao' })
    const sem = textoRenderizado({ modo: 'posicao', semBlocoB: true })
    expect(com).toContain('sempre custo')
    expect(sem).not.toContain('sempre custo')
    expect(com).toContain('DIFAL')
    expect(sem).not.toContain('DIFAL')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — SEM O RODAPÉ VELHO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — o rodapé da despesa é o do descascamento', () => {
  it('>>> "Custo bruto" e "Crédito recuperado" NÃO aparecem na tela de despesa <<<', () => {
    const c = corpoDoDrawer(tela())
    expect(c).not.toContain('Custo bruto')
    expect(c).not.toContain('Crédito recuperado')
  })

  it('>>> "Crédito total" e "CUSTO LÍQUIDO" aparecem <<<', () => {
    const c = corpoDoDrawer(tela())
    expect(c).toContain('Crédito total')
    expect(c).toContain('CUSTO LÍQUIDO')
  })

  it('>>> `semRodape` tira o rodapé do componente — o efeito, no DOM <<<', () => {
    const com = textoRenderizado({ modo: 'posicao' })
    const sem = textoRenderizado({ modo: 'posicao', semRodape: true })
    expect(com).toContain('Custo bruto')
    expect(sem).not.toContain('Custo bruto')
  })

  it('>>> e o SUBTÍTULO não tem default: ausente, não há texto <<<', () => {
    const sem = textoRenderizado({ modo: 'posicao' })
    expect(sem).not.toContain('O custo bruto é o valor da compra')
    const com = textoRenderizado({ modo: 'posicao', subtitulo: 'um apoio qualquer' })
    expect(com).toContain('um apoio qualquer')
  })

  it('>>> o cabeçalho "Impostos da despesa — <destinação>" saiu, e a destinação virou legenda <<<', () => {
    const c = corpoDoDrawer(tela())
    expect(c).not.toContain('Impostos da despesa —')
    // A destinação continua visível, curta, no topo do bloco fiscal.
    expect(c).toMatch(/destinação|naturezaDoLancamento\.destinacao/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — OS ÓRFÃOS NO LUGAR
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — cada órfão sob o tributo que ele afeta', () => {
  /**
   * ATUALIZADO EM 24/09/2026 (§2 do comando das 09:xx). O IS SAIU do bloco POR FORA e desceu
   * para o 1A, entre os que não geram crédito — que é onde o usuário procura por ele.
   *
   * O caso continua afirmando o MESMO critério ("o órfão mora onde ele é procurado"); o que
   * mudou foi qual bloco responde por ele, e isso é decisão do PO, não regressão. O que NÃO
   * mudou, e o caso C do arquivo novo prova, é que ele continua sem reduzir nada.
   */
  it('>>> o IS está no bloco 1A, depois do FCP e ANTES do saldo <<<', () => {
    const c = corpoDoDrawer(tela())
    expect(c.indexOf('Reduções — não geram crédito')).toBeLessThan(c.indexOf('IS (Imposto Seletivo)'))
    expect(c.indexOf('IS (Imposto Seletivo)')).toBeLessThan(c.indexOf('Saldo (base para os demais tributos)'))
    // E NÃO está mais no bloco por fora.
    const porFora = c.slice(c.indexOf("tributos={['IPI', 'CBS', 'IBS']}"), c.indexOf('Base dos produtos (vProd)'))
    expect(porFora).not.toContain('IS (Imposto Seletivo)')
  })

  it('>>> o seletor POR FORA | POR DENTRO está na linha do IPI, não solto <<<', () => {
    const c = corpoDoDrawer(tela())
    // Ele vive no `depoisDasLinhas` do bloco por fora — dentro do componente, não ao lado.
    const porFora = c.slice(c.indexOf("tributos={['IPI', 'CBS', 'IBS']}"), c.indexOf('Base dos produtos (vProd)'))
    expect(porFora).toContain('ipi_por_dentro')
    expect(porFora).toContain('POR FORA')
    expect(porFora).toContain('POR DENTRO')
  })

  /**
   * ATUALIZADO EM 24/09/2026 (§4). As DUAS FATIAS e a base manual de ICMS saíram da tela:
   * elas faziam o mesmo trabalho da base manual pelo lado negativo, e dois controles para o
   * mesmo fato é onde o usuário desconta duas vezes.
   *
   * O critério do bloco E sobrevive inteiro — o órfão que restou continua ancorado no
   * tributo que ele afeta. Trocar o caso por "as fatias sumiram" seria jogar fora a
   * afirmação de ANCORAGEM e ficar só com a de ausência, que o caso D do arquivo novo já faz.
   */
  it('>>> a base manual é a linha logo DEPOIS do PIS/COFINS, dentro do bloco por dentro <<<', () => {
    const c = corpoDoDrawer(tela())
    const porDentro = c.slice(c.indexOf("tributos={['ICMS', 'PIS_COFINS']}"))
    expect(porDentro).toContain('<LinhaDaBaseManual')
    // Dentro do componente, no slot que vem logo depois das linhas — não ao lado do bloco.
    expect(porDentro.indexOf('depoisDasLinhas')).toBeLessThan(porDentro.indexOf('<LinhaDaBaseManual') + 1)
    // E ela é do PIS/COFINS, com a base dele.
    expect(porDentro).toContain('descascamentoDaNota.basesPorDentro.pisCofins')
  })

  it('>>> o CST do documento é recolhível, no FIM do bloco por dentro <<<', () => {
    const c = corpoDoDrawer(tela())
    const porDentro = c.slice(c.indexOf("tributos={['ICMS', 'PIS_COFINS']}"))
    expect(c.indexOf('CST do documento')).toBeGreaterThan(c.indexOf("tributos={['ICMS', 'PIS_COFINS']}"))
    expect(porDentro).toContain('<Collapse')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — O CADASTRO DE ITEM NÃO MUDOU
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — sem as props novas, o componente é o de sempre', () => {
  /**
   * É o caso que torna as props seguras. O item não passa `tributos`, `semBlocoB` nem
   * `semRodape` — e o DEFAULT tem de preservar tudo. Sem este caso, um default trocado
   * passaria despercebido até alguém abrir o cadastro.
   */
  it('>>> os CINCO tributos, o bloco B e o rodapé continuam lá <<<', () => {
    const t = textoRenderizado({ modo: 'posicao' })
    for (const nome of ['ICMS', 'PIS/COFINS', 'IPI', 'CBS', 'IBS']) expect(t).toContain(nome)
    expect(t).toContain('sempre custo')
    expect(t).toContain('Custo bruto')
    expect(t).toContain('Crédito recuperado')
  })

  it('>>> e a tela do item continua passando o subtítulo de sempre <<<', () => {
    const item = ler('src/page-parts/items/new-item-form.component.tsx')
    expect(item).toContain('O custo bruto é o valor da compra')
    // Ela NÃO pede nenhuma das props novas.
    for (const prop of ['tributos=', 'semBlocoB', 'semRodape']) expect(item).not.toContain(prop)
  })

  it('o modo `switch`, que é o default, também desenha os cinco', () => {
    const t = textoRenderizado({})
    for (const nome of ['ICMS', 'PIS/COFINS', 'IPI', 'CBS', 'IBS']) expect(t).toContain(nome)
    expect(t).toContain('gera crédito')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// G — NÃO-REGRESSÃO DO CÁLCULO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('G — o layout não encostou na conta', () => {
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

  it('>>> e os dois módulos de cálculo não foram tocados neste PR <<<', () => {
    // A garantia real é o `git diff`, e ela está no corpo do PR. O que este caso acrescenta
    // é que a conta continua onde estava: a tela não ganhou fórmula nenhuma.
    const c = corpoDoDrawer(tela())
    expect(c).not.toMatch(/\*\s*\d+\s*\/\s*100/)
    expect(c).not.toMatch(/saldo\s*-\s*porFora/)
  })
})
