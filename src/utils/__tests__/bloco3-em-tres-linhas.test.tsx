/**
 * BLOCO 3 EM TRÊS LINHAS, IS EM 1A, E O CHECKBOX DO SIMPLES FORA — oráculos A–H do comando
 * do PO de 24/09/2026.
 *
 * >>> O QUE CADA CASO PRECISA DISTINGUIR <<<
 *
 * Três dos oito afirmam AUSÊNCIA — o check do Simples, as duas fatias. Um caso de ausência
 * é o mais fácil de escrever verde e o mais fácil de escrever inócuo: ele passa antes da
 * correção se o texto que ele procura nunca existiu com aquela grafia. Por isso cada um
 * deles vem com o PAR — o mesmo componente, com a prop ao contrário, onde a linha TEM de
 * aparecer. Sem o par, `not.toContain` não distingue "sumiu" de "nunca esteve lá"
 * (`teste-que-nao-exercita.md`, variante 2).
 *
 * Os casos C, E, F e H são NUMÉRICOS e rodam `descascarANota` — o motor não mudou neste PR,
 * e é exatamente isso que eles afirmam: o C prova que o IS continua sem reduzir depois de
 * ter mudado de bloco, e o H prova que o gabarito inteiro sobreviveu.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Form } from 'antd'
import PurchaseTaxCredits from '@/page-parts/items/purchase-tax-credits.component'
import EntradaDeImposto from '@/components/despesas/entrada-de-imposto.component'
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

/**
 * O CÓDIGO SEM COMENTÁRIO — prosa não desenha campo nenhum.
 *
 * Os casos de AUSÊNCIA precisam dele: o comentário que EXPLICA por que `parcela_st` saiu
 * cita o nome da coluna, e contá-lo faria o caso falhar por uma linha de documentação. O
 * contrário — contar só o que está entre aspas — deixaria passar um campo reintroduzido
 * como `<Form.Item name={NOME}>`.
 */
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const tela = () => ler('src/pages/fluxo-de-caixa/index.tsx')
const item = () => ler('src/page-parts/items/new-item-form.component.tsx')

/** Só o corpo do Drawer de despesa — a página tem outros formulários. */
const corpoDoDrawer = (s: string) => {
  const i = s.indexOf('Novo Lançamento de Despesa"')
  return s.slice(i, s.indexOf('</Drawer>', i))
}

const bandeiras = () =>
  resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao: 'INSUMO', segmento: 'INDUSTRIALIZACAO' }, {})

/** Monta um nó com antd de verdade e devolve o DOM montado. */
function montar(no: React.ReactNode): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { createRoot(host).render(<Form layout="vertical">{no}</Form>) })
  return host
}

function textoDe(no: React.ReactNode): string {
  const host = montar(no)
  const t = host.textContent ?? ''
  host.remove()
  return t
}

const bloco = (props: Record<string, unknown>) => (
  <PurchaseTaxCredits
    modo="posicao"
    visivel
    semDestinacao
    semBlocoB
    semRodape
    bandeiras={bandeiras()}
    custo={null}
    onToggle={() => {}}
    onRecalc={() => {}}
    {...props}
  />
)

// ═════════════════════════════════════════════════════════════════════════════════════════
// A — O CHECK DO SIMPLES SAI DA DESPESA E FICA NO ITEM
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — "Fornecedor do Simples sem regime regular" só onde ele é gravado', () => {
  const ROTULO = 'Fornecedor do Simples sem regime regular'

  it('>>> o check SOME com a prop e APARECE sem ela — o par que discrimina <<<', () => {
    const com = textoDe(bloco({ tributos: ['IPI', 'CBS', 'IBS'], semFornecedorDoSimples: true }))
    const sem = textoDe(bloco({ tributos: ['IPI', 'CBS', 'IBS'] }))
    expect(sem).toContain(ROTULO)
    expect(com).not.toContain(ROTULO)
  })

  /**
   * ATUALIZADO EM 24/09/2026 (noite). A tela ganhou um TERCEIRO render — a forma compacta —,
   * e o caso contava dois.
   *
   * Contar TODOS os renders em vez de fixar o número é o que o critério sempre quis dizer:
   * "nenhum bloco da despesa mostra o check". Fixar em 2 fazia o caso falhar quando um
   * quarto bloco nascesse CERTO, e passar quando um nascesse ERRADO se outro fosse removido
   * no mesmo commit.
   */
  it('>>> e TODO render da tela de despesa passa a prop <<<', () => {
    const c = corpoDoDrawer(tela())
    const blocos = (c.match(/<PurchaseTaxCredits/g) ?? []).length
    expect(blocos).toBeGreaterThanOrEqual(3)
    expect((c.match(/semFornecedorDoSimples/g) ?? []).length).toBe(blocos)
  })

  it('>>> o cadastro de item NÃO passa a prop — é lá que a coluna é gravada <<<', () => {
    const i = item()
    expect(i).not.toContain('semFornecedorDoSimples')
    // E a coluna continua no payload do item, que é o que torna o check honesto lá.
    expect(i).toContain('supplier_simples_sem_regime_regular')
  })

  it('>>> e a tela de despesa NÃO grava a coluna — era essa a razão de tirá-lo <<<', () => {
    expect(tela()).not.toContain('supplier_simples_sem_regime_regular')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — O IS DESCE PARA O BLOCO 1A
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — o IS é a última linha das reduções, e diz que não reduz', () => {
  /**
   * ATUALIZADO EM 24/09/2026 (tarde, §1). O bloco 1A virou DUAS LINHAS EXPLÍCITAS, e o IS
   * deixou de ficar solto abaixo dos quatro: ele divide a PRIMEIRA linha com o IPI de custo.
   *
   * O critério é o mesmo — o IS mora entre os que não geram crédito, antes do saldo. O que
   * mudou foi a posição dentro do bloco, e ela agora é a ordem em que a nota se lê.
   */
  it('>>> na PRIMEIRA linha, ao lado do IPI de custo, e ANTES do saldo <<<', () => {
    const c = corpoDoDrawer(tela())
    const posBloco = c.indexOf('Reduções — não geram crédito')
    const posLinha1 = c.indexOf('linhaDoBloco1A(1)')
    const posIs = c.indexOf('IS (Imposto Seletivo)')
    const posLinha2 = c.indexOf('linhaDoBloco1A(2)')
    const posSaldo = c.indexOf('Saldo (base para os demais tributos)')
    for (const p of [posBloco, posLinha1, posIs, posLinha2, posSaldo]) expect(p).toBeGreaterThan(-1)
    // O IS está DENTRO da primeira linha: depois do map dela e antes do da segunda.
    expect(posBloco).toBeLessThan(posLinha1)
    expect(posLinha1).toBeLessThan(posIs)
    expect(posIs).toBeLessThan(posLinha2)
    expect(posLinha2).toBeLessThan(posSaldo)
  })

  it('>>> e as DUAS linhas agrupam pelo que o campo é, não pela largura da tela <<<', () => {
    const s = tela()
    const lista = s.slice(s.indexOf('const CAMPOS_DO_BLOCO_DE_CUSTO'), s.indexOf('const linhaDoBloco1A'))
    // Linha 1: o do PRODUTO. Linha 2: os três da OPERAÇÃO interestadual.
    expect(lista).toMatch(/valor_ipi_custo', linha: 1/)
    expect(lista).toMatch(/valor_icms_st', linha: 2/)
    expect(lista).toMatch(/valor_difal', linha: 2/)
    expect(lista).toMatch(/valor_fcp', linha: 2/)
    // E a grade deixou de ser automática — era ela que desfazia o agrupamento.
    // E a grade dos cinco campos deixou de ser automática — era ela que desfazia o
    // agrupamento conforme a largura da tela. O trecho vai até o frete, que é outra seção.
    const bloco = semComentario(corpoDoDrawer(s))
    const cincoCampos = bloco.slice(
      bloco.indexOf('Reduções — não geram crédito'),
      bloco.indexOf('não reduz — integra a base e credita junto'),
    )
    expect(cincoCampos).not.toContain('auto-fit')
    expect(cincoCampos).toContain("gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'")
    expect(cincoCampos).toContain("gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'")
  })

  it('>>> com o rótulo "não reduz" na mesma linha, e o tooltip da EC 132 <<<', () => {
    const c = corpoDoDrawer(tela())
    const linhaDoIs = c.slice(c.indexOf('name="valor_is"'), c.indexOf('Saldo (base para os demais tributos)'))
    expect(linhaDoIs).toContain('não reduz')
    expect(linhaDoIs).toContain('EC 132/2023, art. 153 §6º V')
    expect(linhaDoIs).toContain('name="valor_is"')
  })

  it('>>> e ele NÃO está mais no bloco por fora <<<', () => {
    const c = corpoDoDrawer(tela())
    const porFora = c.slice(c.indexOf("tributos={['IPI', 'CBS', 'IBS']}"), c.indexOf('Base dos produtos (vProd)'))
    expect(porFora).not.toContain('valor_is')
    // O par: o bloco continua existindo com os três tributos dele.
    expect(porFora).toContain("tributos={['IPI', 'CBS', 'IBS']}")
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — E MESMO ASSIM ELE NÃO REDUZ
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — mudar de bloco não mudou a conta do IS', () => {
  /**
   * É O CASO QUE PROTEGE A MUDANÇA DE §2.
   *
   * Pôr o IS entre as reduções é o convite para alguém "corrigir" `descascarANota` somando
   * `valorIs` a `reducoesTotal` — e a soma continuaria fechando, porque o total é digitado.
   * O par de baixo é o que impede: 50,00 de IS não pode mover nem o saldo nem a base.
   */
  const comIs = (is: number) => descascarANota({
    total: 1172,
    composicao: { frete: 100 },
    reducoes: { ipiCusto: 40, icmsSt: 50, difal: 18, fcp: 4 },
    porFora: { ipi: { brl: 60 } },
    valorIs: is,
    porDentro: { icms: { brl: 180 }, pisCofins: { pct: 9.25 } },
    bandeiras: bandeiras(),
  })

  it('>>> saldo e base com IS 50,00 são IDÊNTICOS aos com IS 0,00 <<<', () => {
    const zero = comIs(0)
    const cinquenta = comIs(50)
    expect(cinquenta.saldo).toBeCloseTo(zero.saldo, 2)
    expect(cinquenta.base).toBeCloseTo(zero.base, 2)
    expect(cinquenta.creditoTotal).toBeCloseTo(zero.creditoTotal, 2)
    // E ele é visível como o que é: um valor da nota que não reduz e não credita.
    expect(cinquenta.valorIs).toBeCloseTo(50, 2)
    expect(zero.valorIs).toBeCloseTo(0, 2)
  })

  it('>>> e o que ele MOVE é o valor das mercadorias, que é a leitura dele <<<', () => {
    // Sem esta metade, o caso acima passaria com `valorIs` ignorado por completo.
    expect(comIs(50).valorDasMercadorias).toBeCloseTo(comIs(0).valorDasMercadorias - 50, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — O BLOCO 3 TEM TRÊS LINHAS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — três linhas, e as fatias fora', () => {
  it('>>> ICMS, PIS/COFINS e o check — as três, no DOM <<<', () => {
    const t = textoDe(bloco({
      tributos: ['ICMS', 'PIS_COFINS'],
      semFornecedorDoSimples: true,
      titulo: 'Gera crédito — por dentro',
      depoisDasLinhas: (
        <Form.Item name="usar_base_manual_pis_cofins" valuePropName="checked">
          <span>a base não é essa — informar manualmente</span>
        </Form.Item>
      ),
    }))
    expect(t).toContain('ICMS')
    expect(t).toContain('PIS/COFINS')
    expect(t).toContain('a base não é essa — informar manualmente')
    // E nada de CBS/IBS, que são do bloco de cima.
    expect(t).not.toContain('CBS')
    expect(t).not.toContain('IBS')
  })

  it('>>> "Parcela em ST" e "Parcela monofásica" NÃO aparecem na tela <<<', () => {
    // A PÁGINA INTEIRA, sem comentário: o campo sumiu da tela E da gravação, e um dos dois
    // sozinho deixaria a coluna recebendo `null` por um caminho que ninguém pode informar.
    const s = semComentario(tela())
    expect(s).not.toContain('Parcela em ST')
    expect(s).not.toContain('Parcela monofásica')
    // E os campos também não: um rótulo renomeado deixaria o controle vivo.
    expect(s).not.toContain('parcela_st')
    expect(s).not.toContain('parcela_monofasica')
  })

  it('>>> a base manual de ICMS saiu junto — o ICMS é o valor, e a base dele não muda nada <<<', () => {
    const s = semComentario(tela())
    expect(s).not.toContain('base_manual_icms')
    expect(s).not.toContain('usar_base_manual_icms')
    // A do PIS/COFINS FICA — é o par que distingue "saiu" de "sumiu tudo".
    expect(s).toContain('usar_base_manual_pis_cofins')
  })

  /**
   * ACRESCENTADO DEPOIS DE UMA MUTAÇÃO SOBREVIVER.
   *
   * Ignorar a prop `leitura` deixava as duas linhas com `—` no lugar do crédito, e os oito
   * casos anteriores continuavam verdes: nenhum deles olhava o NÚMERO na linha. O §3 pede
   * "crédito R$ 180,00" na linha, e isto é o que afirma que ele está lá.
   */
  it('>>> a linha MOSTRA o crédito — e sem a prop ela mostra o travessão <<<', () => {
    const com = textoDe(bloco({
      tributos: ['ICMS', 'PIS_COFINS'],
      semFornecedorDoSimples: true,
      leitura: { ICMS: 'R$ 180,00', PIS_COFINS: 'R$ 75,85' },
    }))
    const sem = textoDe(bloco({ tributos: ['ICMS', 'PIS_COFINS'], semFornecedorDoSimples: true }))
    expect(com).toContain('R$ 180,00')
    expect(com).toContain('R$ 75,85')
    expect(sem).not.toContain('R$ 180,00')
  })

  it('>>> e TODO bloco da tela lê o crédito do DESCASCAMENTO <<<', () => {
    const c = corpoDoDrawer(tela())
    const blocos = (c.match(/<PurchaseTaxCredits/g) ?? []).length
    expect((c.match(/leitura=\{leiturasDoCredito\}/g) ?? []).length).toBe(blocos)
    const fonte = tela()
    const memo = fonte.slice(fonte.indexOf('const leiturasDoCredito'), fonte.indexOf('const leiturasDoCredito') + 400)
    expect(memo).toContain('descascamentoDaNota.creditos.icms')
    expect(memo).toContain('descascamentoDaNota.creditos.pisCofins')
  })

  it('>>> e o MOTOR mantém o parâmetro: é decisão de tela, não de cálculo <<<', () => {
    const fonte = ler('src/utils/nota-de-compra.ts')
    expect(fonte).toContain('fatias?')
    // A prova de que a regra continua viva: com fatia, a base do ICMS encolhe.
    const semFatia = descascarANota({
      total: 1000, porDentro: { icms: { pct: 18 } }, bandeiras: bandeiras(),
    })
    const comFatia = descascarANota({
      total: 1000, fatias: { st: 300 }, porDentro: { icms: { pct: 18 } }, bandeiras: bandeiras(),
    })
    expect(semFatia.basesPorDentro.icms).toBeCloseTo(1000, 2)
    expect(comFatia.basesPorDentro.icms).toBeCloseTo(700, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — A BASE NATIVA, EXIBIDA NA LINHA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — a base do PIS/COFINS sai sozinha e aparece', () => {
  it('>>> saldo 1.000,00 e ICMS 180,00 dão base 820,00, e 9,25% dá 75,85 <<<', () => {
    const d = descascarANota({
      total: 1000,
      porDentro: { icms: { brl: 180 }, pisCofins: { pct: 9.25 } },
      bandeiras: bandeiras(),
    })
    expect(d.saldo).toBeCloseTo(1000, 2)
    expect(d.basesPorDentro.pisCofins).toBeCloseTo(820, 2)
    expect(d.creditos.pisCofins).toBeCloseTo(75.85, 2)
  })

  it('>>> e a linha EXIBE essa base, lida do descascamento e não recomposta <<<', () => {
    // Ela mora no `extrasDosTributos`, que é montado acima do JSX do drawer.
    const c = tela()
    expect(c).toContain('sobre a base de')
    const linha = c.slice(c.indexOf('sobre a base de'), c.indexOf('sobre a base de') + 200)
    expect(linha).toContain('descascamentoDaNota.basesPorDentro.pisCofins')
    // Recompor aqui seria `copia-divergente.md`: a tela dividiria por uma base e a conta
    // multiplicaria por outra, e as duas fechariam consigo mesmas.
    expect(linha).not.toMatch(/saldo\s*-\s*/)
  })

  it('>>> o PIS/COFINS nasce em % e o resto em R$ <<<', () => {
    const s = tela()
    const mapa = s.slice(s.indexOf('const FORMATO_DA_LINHA'), s.indexOf('const FORMATO_DA_LINHA') + 300)
    expect(mapa).toMatch(/PIS_COFINS:\s*'PCT'/)
    expect(mapa).toMatch(/ICMS:\s*'BRL'/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — A BASE MANUAL É USADA COMO ESTÁ
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — base manual: o ICMS não é deduzido de novo', () => {
  it('>>> 600,00 com 9,25% dá 55,50, e não 55,50 sobre 600 menos ICMS <<<', () => {
    const d = descascarANota({
      total: 1000,
      porDentro: {
        icms: { brl: 180 },
        pisCofins: { pct: 9.25 },
        baseManualPisCofins: 600,
      },
      bandeiras: bandeiras(),
    })
    expect(d.basesPorDentro.pisCofins).toBeCloseTo(600, 2)
    expect(d.creditos.pisCofins).toBeCloseTo(55.5, 2)
  })

  it('>>> e o par: sem a base manual o mesmo lançamento dá 75,85 <<<', () => {
    // Sem esta metade, 55,50 poderia sair de qualquer base próxima e o caso não distinguiria.
    const d = descascarANota({
      total: 1000,
      porDentro: { icms: { brl: 180 }, pisCofins: { pct: 9.25 } },
      bandeiras: bandeiras(),
    })
    expect(d.creditos.pisCofins).toBeCloseTo(75.85, 2)
  })

  /**
   * ACRESCENTADO DEPOIS DE UMA MUTAÇÃO SOBREVIVER, e é o CASO-LIMITE que
   * `teste-que-nao-exercita.md` admite: ele afirma CAMINHO, porque o efeito não é
   * alcançável daqui.
   *
   * O defeito que ele barra: com a base manual ligada, a alíquota aparece DUAS vezes — na
   * linha do PIS/COFINS e na terceira linha —, dois `Form.Item` com o mesmo `name` para um
   * número só. O efeito disso só existe renderizando a PÁGINA, e a página exige sessão.
   * O que dá para afirmar daqui é que a exclusividade existe e de quem ela depende.
   */
  it('>>> e a alíquota DESCE em vez de duplicar: a linha de cima a cede <<<', () => {
    const s = tela()
    const extras = s.slice(s.indexOf('const extrasDosTributos'), s.indexOf('const leiturasDoCredito'))
    expect(extras).toContain("t === 'PIS_COFINS' && usarBaseManualPisCofins === true ?")
    expect(extras).toContain('alíquota e base na linha abaixo')
  })

  it('>>> e a tela avisa, ao lado do campo, que ela é usada como está <<<', () => {
    const s = tela()
    const linha = s.slice(s.indexOf('function LinhaDaBaseManual'), s.indexOf('function LinhaDaBaseManual') + 3000)
    expect(linha).toContain('usada como está — o ICMS não é deduzido de novo')
    // Os DOIS campos, na mesma linha, e só com o check ligado.
    expect(linha).toContain('base_manual_pis_cofins')
    expect(linha).toContain('pis_cofins_rate')
    expect(linha).toMatch(/\{ligado && \(/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// G — O ICMS EM R$, COM O SELETOR RECOLHIDO
// ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * ATUALIZADO EM 24/09/2026 (tarde, §3). O `seletorRecolhido` SAIU.
 *
 * Ele era a exceção de alinhamento do ICMS — o combo virava um link, a linha ficava mais
 * curta que as outras quatro, e §3 diz que não há exceção: "as cinco linhas de crédito da
 * tela têm de parecer a mesma linha cinco vezes". O bloco passa a afirmar o oposto do que
 * afirmava, e é isso que a mudança pediu.
 */
describe('G — as cinco linhas têm a mesma anatomia', () => {
  const entrada = (props: Record<string, unknown>) => (
    <EntradaDeImposto base={1000} formato="BRL" onFormato={() => {}} {...props} />
  )

  it('>>> o combo "% | R$" está em TODA linha — não há mais exceção <<<', () => {
    const host = montar(entrada({}))
    expect(host.querySelectorAll('.ant-select').length).toBe(1)
    host.remove()
    // E a prop que criava a exceção não existe mais em lugar nenhum.
    expect(ler('src/components/despesas/entrada-de-imposto.component.tsx')).not.toContain('seletorRecolhido')
    expect(tela()).not.toContain('seletorRecolhido')
  })

  it('>>> e o R$ vem À FRENTE do % na lista <<<', () => {
    const fonte = ler('src/components/despesas/entrada-de-imposto.component.tsx')
    const opcoes = fonte.slice(fonte.indexOf('options={['), fonte.indexOf('options={[') + 600)
    expect(opcoes.indexOf("value: 'BRL'")).toBeLessThan(opcoes.indexOf("value: 'PCT'"))
  })

  it('>>> a entrada PREENCHE o slot nos dois formatos, em vez de ter largura própria <<<', () => {
    // O defeito que isto barra: com 110px no percentual e 130px no valor, trocar o formato
    // de UMA linha desalinhava as outras quatro. Em jsdom a largura não é computada, mas o
    // estilo inline é — e é ele que carrega a decisão.
    const emReais = montar(entrada({}))
    const emPct = montar(entrada({ formato: 'PCT' }))
    for (const host of [emReais, emPct]) {
      // O invólucro da entrada manda largura 100%, e o campo cresce dentro dele.
      const fora = host.querySelector('div[style*="display: flex"]') as HTMLElement
      expect(fora.getAttribute('style')).toContain('width: 100%')
      const estilos = Array.from(host.querySelectorAll<HTMLElement>('[style]'))
        .map((el) => el.getAttribute('style') ?? '')
      expect(estilos.some((st) => st.includes('flex: 1'))).toBe(true)
      // E nenhuma largura em pixels fora a do seletor, que é igual nas cinco linhas.
      const larguras = estilos.filter((st) => /width:\s*\d+px/.test(st))
      expect(larguras).toEqual(['width: 62px;'])
    }
    emReais.remove()
    emPct.remove()
  })

  it('>>> e o slot de cada linha é FIXO, com a coluna de apoio separada <<<', () => {
    const s = tela()
    const extras = s.slice(s.indexOf('const extrasDosTributos'), s.indexOf('const leiturasDoCredito'))
    // Grade de largura fixa: a entrada numa coluna, o texto de apoio na outra. Um flex que
    // encolhe com o conteúdo era o que empurrava a leitura do PIS/COFINS para a direita.
    expect(extras).toContain("gridTemplateColumns: '200px 1fr'")
    expect(extras).toContain('width: 360')
    expect(extras).not.toContain('flexWrap')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// H — NÃO-REGRESSÃO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('H — o gabarito do #74 sobreviveu inteiro', () => {
  it('>>> saldo 1.060,00 · base 1.000,00 · crédito 315,85 · custo líquido 856,15 <<<', () => {
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

  it('>>> e a tela continua sem fórmula: ela coleta e exibe <<<', () => {
    const c = corpoDoDrawer(tela())
    expect(c).not.toMatch(/\*\s*\d+\s*\/\s*100/)
    expect(c).not.toMatch(/saldo\s*-\s*porFora/)
  })
})
