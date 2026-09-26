/**
 * O ITEM COM A ANATOMIA DO DIAGNÓSTICO — oráculos do comando do PO de 27/09/2026.
 *
 * >>> O QUE ESTE ARQUIVO NÃO REPETE, E ONDE ESSAS AFIRMAÇÕES MORAM <<<
 *
 * Os oráculos A (não há linha legada fora do container), H (padrão por regime e suspensão),
 * K (item gravado intacto), L ("+ Adicionar item" só na aba Itens / Insumos, com permissão)
 * e M (é o MESMO formulário) já estão versionados em `uma-fonte-de-aliquotas.test.tsx`, dos
 * describes A, E, F e "G, H e I". Reescrevê-los aqui seria `copia-divergente.md` NASCENDO:
 * duas cópias da mesma afirmação, e a próxima mudança acertaria uma e esqueceria a outra.
 * Três âncoras daquele arquivo foram REESCRITAS neste PR, e o motivo está escrito lá, no
 * próprio caso.
 *
 * >>> ONDE ESTES CASOS AFIRMAM EFEITO, E ONDE AFIRMAM CAMINHO <<<
 *
 * B, C, D, E e F afirmam EFEITO: rodam `calcularCustoDoItem` e conferem o número ao centavo.
 * Cada um deles escolhe valores que DISTINGUEM o estado certo do errado — é o que a variante
 * 2 de `teste-que-nao-exercita.md` cobra. Em particular, C e D não poderiam usar diferimento
 * de 0%, e E não poderia usar ICMS zerado: nos dois casos o número sairia igual dos dois
 * jeitos e o verde seria decorativo.
 *
 * I e J RENDERIZAM o componente com antd de verdade e leem o DOM: os cards são efeito, não
 * passagem.
 *
 * G afirma CAMINHO, e diz que afirma. O defeito que ele barra é a PRESENÇA do seletor `R$|%`
 * numa das quatro linhas, e não há número a medir — trocar o seletor do PIS/COFINS não muda
 * crédito nenhum, porque a alíquota é a mesma dos dois lados da conversão. É o caso-limite
 * que `teste-que-nao-exercita.md` admite ("o ternário está nos DOIS pontos"), com a mesma
 * forma: o que se mede é em quais linhas a coisa está, não quanto ela vale.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Form } from 'antd'
import PurchaseTaxCredits from '@/page-parts/items/purchase-tax-credits.component'
import {
  calcularCustoDoItem,
  resolverFlagsDoItem,
  icmsEfetivoPctDe,
  baseDoTributo,
  type ValoresDaCompra,
} from '@/utils/custo-liquido-do-item'
import { aliquotaAPartirDoValor, baseDaLinha } from '@/utils/entrada-de-imposto'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const formulario = () => ler('src/page-parts/items/new-item-form.component.tsx')
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** O objeto `camposDeAliquota`, sem comentário — é ele que monta as quatro linhas. */
const blocoDosExtras = (s: string) => {
  const c = semComentario(s)
  return c.slice(c.indexOf('const camposDeAliquota'), c.indexOf('const legendasDasLinhas'))
}

/**
 * O CENÁRIO DO §6, e ele é UM só para todos os casos numéricos.
 *
 * O IPI entra a 10,00% e NÃO credita — é o que o §6 diz, e é o que `REVENDA` e
 * `USO_CONSUMO` já fariam sozinhas pela matriz de destinação. Aqui a destinação é `INSUMO`,
 * onde o IPI creditaria, e a bandeira é desligada explicitamente: assim o caso mede o IPI
 * COMO CUSTO sem depender de qual destinação estava escolhida.
 */
const CENARIO: ValoresDaCompra = {
  base: 1000,
  icmsPct: 18,
  icmsDeferidoAtivo: true,
  icmsDeferidoPct: 60,
  pisCofinsPct: 9.25,
  cbsPct: 8.8,
  ibsPct: 17.7,
  ipiPct: 10,
  icmsSt: 50,
  fcp: 4,
  difalValor: 0,
  qtdMedida: 6,
}

const bandeiras = (gravadas: Record<string, boolean> = { IPI: false }) =>
  resolverFlagsDoItem(
    { regime: 'LUCRO_REAL', destinacao: 'INSUMO', segmento: 'INDUSTRIALIZACAO' },
    gravadas as never,
  )

/** Monta o container com antd de verdade e devolve o texto do DOM. */
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
  const t = host.textContent ?? ''
  host.remove()
  return t
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — O GABARITO DO §6, AO CENTAVO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — o gabarito do §6 inteiro', () => {
  it('>>> 1.000,00 com ICMS 18% deferido 60%, PIS/COFINS 9,25%, CBS 8,80%, IBS 17,70%, IPI 10% sem crédito <<<', () => {
    const r = calcularCustoDoItem(CENARIO, bandeiras())

    expect(icmsEfetivoPctDe(CENARIO)).toBeCloseTo(7.2, 4)
    expect(r.creditos.ICMS).toBeCloseTo(72, 2)

    expect(baseDoTributo(CENARIO, 'PIS_COFINS')).toBeCloseTo(928, 2)
    expect(r.creditos.PIS_COFINS).toBeCloseTo(85.84, 2)

    expect(r.creditos.CBS).toBeCloseTo(88, 2)
    expect(r.creditos.IBS).toBeCloseTo(177, 2)
    // O IPI não credita neste cenário — e é a bandeira que decide, não a alíquota.
    expect(r.creditos.IPI).toBeCloseTo(0, 2)
    expect(r.valores.ipi).toBeCloseTo(100, 2)

    expect(r.custoBruto).toBeCloseTo(1419, 2)
    expect(r.creditoTotal).toBeCloseTo(422.84, 2)
    expect(r.custoLiquido).toBeCloseTo(996.16, 2)
    expect((r.creditoTotal / r.custoBruto) * 100).toBeCloseTo(29.7984, 4)
    expect(r.custoPorFracao).toBeCloseTo(166.0267, 4)
  })

  it('>>> e o PAR: o TOTAL DO ITEM é bruto + por fora + não creditáveis, não só o unitário <<<', () => {
    // Sem esta metade, um `custoBruto` igual a 1.000,00 passaria pelo caso acima se alguém
    // afirmasse só os créditos. 1.419,00 = 1.000 + CBS 88 + IBS 177 + IPI 100 + ST 50 + FCP 4.
    const r = calcularCustoDoItem(CENARIO, bandeiras())
    expect(r.custoBruto - CENARIO.base!).toBeCloseTo(88 + 177 + 100 + 50 + 4, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C e D — O DIFERIMENTO NOS DOIS MODOS, E A CONVERGÊNCIA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C e D — o diferimento em R$ e em %', () => {
  /*
    O valor digitado é o DESTACADO nos dois modos. Em R$ a travessia de borda o converte em
    alíquota com a base da própria linha; em % ele já é alíquota. O crédito é o EFETIVO.

    Os casos usam 60% de diferimento de propósito: com 0% o destacado e o efetivo dariam o
    MESMO número, e o verde existiria com o defeito presente (`teste-que-nao-exercita.md`,
    variante 2).
  */
  const baseDoIcms = baseDaLinha(CENARIO, 'ICMS')

  it('>>> C: R$ 180,00 com 60,00% deferido credita 72,00 — e NÃO 180,00 <<<', () => {
    const aliquota = aliquotaAPartirDoValor(180, baseDoIcms)
    expect(aliquota).toBeCloseTo(18, 4)

    const r = calcularCustoDoItem({ ...CENARIO, icmsPct: aliquota }, bandeiras())
    expect(r.creditos.ICMS).toBeCloseTo(72, 2)
    expect(r.creditos.ICMS).not.toBeCloseTo(180, 2)
  })

  it('>>> D: 18,00% com 60,00% deferido dá o MESMO crédito do caso C <<<', () => {
    const emReais = calcularCustoDoItem(
      { ...CENARIO, icmsPct: aliquotaAPartirDoValor(180, baseDoIcms) },
      bandeiras(),
    )
    const emPercentual = calcularCustoDoItem({ ...CENARIO, icmsPct: 18 }, bandeiras())

    expect(emPercentual.creditos.ICMS).toBeCloseTo(emReais.creditos.ICMS, 6)
    // E a convergência não é só do ICMS: o custo líquido inteiro coincide.
    expect(emPercentual.custoLiquido).toBeCloseTo(emReais.custoLiquido, 6)
    expect(emPercentual.creditoTotal).toBeCloseTo(emReais.creditoTotal, 6)
    // O número, escrito por extenso, para que a convergência não seja "dois erros iguais".
    expect(emPercentual.creditos.ICMS).toBeCloseTo(72, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — A BASE DO PIS/COFINS É O EFETIVO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — a base do PIS/COFINS deduz o ICMS EFETIVO', () => {
  it('>>> com diferimento: base 928,00 e crédito 85,84 <<<', () => {
    expect(baseDoTributo(CENARIO, 'PIS_COFINS')).toBeCloseTo(928, 2)
    expect(calcularCustoDoItem(CENARIO, bandeiras()).creditos.PIS_COFINS).toBeCloseTo(85.84, 2)
  })

  it('>>> sem diferimento: base 820,00 e crédito 75,85 <<<', () => {
    /*
      É este par que prova que a base usa o EFETIVO. Deduzir o DESTACADO nos dois casos daria
      820,00 sempre, e o caso de cima ficaria vermelho; deduzir o efetivo nos dois daria
      928,00 sempre, e este ficaria vermelho. Um caso sozinho não distingue os dois erros.
    */
    const semDiferimento = { ...CENARIO, icmsDeferidoAtivo: false, icmsDeferidoPct: 0 }
    expect(baseDoTributo(semDiferimento, 'PIS_COFINS')).toBeCloseTo(820, 2)
    const r = calcularCustoDoItem(semDiferimento, bandeiras())
    expect(r.creditos.PIS_COFINS).toBeCloseTo(75.85, 2)
    expect(r.creditos.ICMS).toBeCloseTo(180, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — A BANDEIRA DO ICMS NÃO MEXE NO PIS/COFINS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — desligar o crédito de ICMS não muda o PIS/COFINS', () => {
  it('>>> a bandeira em off zera o ICMS e MANTÉM os 85,84 <<<', () => {
    /*
      A regra do #68: a bandeira decide QUEM CREDITA, não QUAL É A BASE. O ICMS continua
      destacado na nota e continua fora da base do PIS/COFINS mesmo quando não gera crédito —
      não creditar não significa não ter sido cobrado.
    */
    const comIcms = calcularCustoDoItem(CENARIO, bandeiras())
    const semIcms = calcularCustoDoItem(CENARIO, bandeiras({ IPI: false, ICMS: false }))

    expect(semIcms.creditos.ICMS).toBeCloseTo(0, 2)
    expect(semIcms.creditos.PIS_COFINS).toBeCloseTo(85.84, 2)
    expect(semIcms.creditos.PIS_COFINS).toBeCloseTo(comIcms.creditos.PIS_COFINS, 6)
    // E o par: o crédito total CAI exatamente os 72,00 do ICMS, e nada mais.
    expect(comIcms.creditoTotal - semIcms.creditoTotal).toBeCloseTo(72, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// G — O PIS/COFINS NÃO TEM SELETOR DE R$
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('G — o PIS/COFINS é só percentual', () => {
  it('>>> ICMS, CBS e IBS entram por `entradaEmReais`; PIS/COFINS NÃO <<<', () => {
    /*
      Caso de CAMINHO, declarado: o defeito é a presença do seletor numa linha e a ausência
      nas outras três, e não há número que distinga os dois estados — a conversão `R$|%` é
      exata, então um seletor a mais não move o crédito.

      A razão de o PIS/COFINS não ter o seletor: ele NÃO VEM DESTACADO no documento. Não há
      um valor em reais a copiar da nota, e oferecer o campo em R$ convidaria o usuário a
      digitar um número que ele teria de calcular sozinho.
    */
    const extras = blocoDosExtras(formulario())
    const linha = (t: string, ate: string) => extras.slice(extras.indexOf(t), extras.indexOf(ate))

    expect(linha('ICMS: (', 'PIS_COFINS: (')).toContain("entradaEmReais('ICMS'")
    expect(extras).toContain("entradaEmReais('CBS')")
    expect(extras).toContain("entradaEmReais('IBS')")

    const linhaDoPisCofins = linha('PIS_COFINS: (', 'CBS:')
    expect(linhaDoPisCofins).toContain('pis_cofins_rate')
    expect(linhaDoPisCofins).not.toContain('entradaEmReais')
    expect(linhaDoPisCofins).not.toContain('EntradaDeImposto')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// I e J — OS TRÊS CARDS, E O RÓTULO QUE MUDOU
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('I e J — o rodapé em três cards', () => {
  const custo = () => calcularCustoDoItem(CENARIO, bandeiras())

  it('>>> I: os três cards existem, com os valores do gabarito, e o do meio traz o percentual <<<', () => {
    const t = textoRenderizado({ custo: custo(), unidadeLabel: 'ml' })

    expect(t).toContain('TOTAL DO ITEM')
    expect(t).toContain('CRÉDITO DO IMPOSTO')
    expect(t).toContain('CUSTO LÍQUIDO')

    // Os NÚMEROS, e não só os rótulos: um rodapé que perdesse o `custo` mostraria travessão.
    expect(t).toContain('1.419,00')
    expect(t).toContain('422,84')
    expect(t).toContain('996,16')
    expect(t).toContain('29,80% do que foi pago')

    // Os textos de apoio do §5, e o quarto número abaixo dos cards.
    expect(t).toContain('valor bruto')
    expect(t).toContain('é ele que forma o preço')
    expect(t).toContain('Custo líquido por ml')
    expect(t).toContain('166,03')
  })

  it('>>> e o PAR: sem `custo` o percentual é TRAVESSÃO, nunca 0,00% <<<', () => {
    // `ausente-vs-falso.md`: 0,00% afirmaria que nada creditou; travessão não afirma nada.
    const t = textoRenderizado({ custo: null })
    expect(t).toContain('— do que foi pago')
    expect(t).not.toContain('0,00% do que foi pago')
  })

  it('>>> J: "Total da compra" não aparece, e "Total do item" aparece <<<', () => {
    const t = textoRenderizado({ custo: custo() })
    expect(t).not.toContain('Total da compra')
    expect(t.toUpperCase()).toContain('TOTAL DO ITEM')
    // E o rótulo velho também não sobrou no arquivo — o texto está num só lugar.
    expect(ler('src/page-parts/items/purchase-tax-credits.component.tsx')).not.toContain('Total da compra')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A LEGENDA DE CADA LINHA — o §2 diz que ela é parte do contrato visual
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('a legenda fica sob o RÓTULO, e o PIS/COFINS mostra a base usada', () => {
  it('>>> as quatro legendas chegam ao DOM, e a do PIS/COFINS traz a base em R$ <<<', () => {
    const t = textoRenderizado({
      custo: calcularCustoDoItem(CENARIO, bandeiras()),
      legenda: {
        ICMS: 'destacado, já dentro do preço',
        PIS_COFINS: 'base após o ICMS: R$ 928,00',
        CBS: 'por fora, sobre o valor do item',
        IBS: 'por fora, sobre o valor do item',
      },
    })
    expect(t).toContain('destacado, já dentro do preço')
    expect(t).toContain('base após o ICMS: R$ 928,00')
    expect(t).toContain('por fora, sobre o valor do item')
  })

  it('>>> e o PAR: a base que o formulário escreve na legenda é a MESMA que a conta usa <<<', () => {
    /*
      Sem esta metade, a legenda poderia exibir 820,00 enquanto a conta usa 928,00, e nada
      falharia — os dois lados fechariam consigo mesmos. Ela afirma a IGUALDADE, que é o que
      `regime-e-segmento-determinam-a-construcao.md` exige entre construção e leitura.
    */
    expect(baseDaLinha(CENARIO, 'PIS_COFINS')).toBeCloseTo(
      baseDoTributo(CENARIO, 'PIS_COFINS'),
      6,
    )
    expect(baseDaLinha(CENARIO, 'PIS_COFINS')).toBeCloseTo(928, 2)
    // E o formulário monta a legenda a partir de `baseDaLinha`, não de uma segunda conta.
    const s = semComentario(formulario())
    expect(s).toContain("base após o ICMS: ${fmtBRL(baseDaLinha(valoresParaBase as never, 'PIS_COFINS'))}")
    /*
      A TERCEIRA metade, e ela é a variante 3 de `teste-que-nao-exercita.md`: as duas
      afirmações acima provam que a legenda EXISTE e que o número está certo, e nenhuma das
      duas provaria que ela CHEGA à tela. Montar `legendasDasLinhas` sem passar a prop
      deixaria as duas verdes com a tela igual à de antes.

      Afirma caminho porque o efeito só apareceria renderizando `NewItemForm`, que depende de
      contexto de autenticação — o andaime testaria o andaime. O efeito da prop, esse, está
      medido no caso acima, que renderiza o container de verdade.
    */
    expect(s).toContain('legenda={legendasDasLinhas}')
    expect(s).toContain('extras={camposDeAliquota}')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// UMA SÓ FÓRMULA DO ICMS EFETIVO — §3 e §9 ("não reimplemente `icmsEfetivoPctDe`")
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('o ICMS efetivo é calculado num lugar só', () => {
  it('>>> o formulário CHAMA `icmsEfetivoPctDe` e não reescreve a fórmula <<<', () => {
    /*
      Caso de CAMINHO, declarado — e aqui não há alternativa honesta: as duas escritas
      devolvem o MESMO número hoje, então nenhum valor distingue os dois estados. É a
      própria definição de `copia-divergente.md`: a divergência só nasceria no dia em que
      uma das duas mudasse, e aí já seria tarde.

      O que o caso barra é a REINTRODUÇÃO da segunda escrita, que é o que o §9 proíbe.
    */
    const s = semComentario(formulario())
    expect(s).toContain('icmsEfetivoPctDe({')
    expect(s).not.toMatch(/icms\s*\*\s*\(1\s*-\s*icmsDeferido\s*\/\s*100\)/)
  })

  it('>>> e o PAR, que é EFEITO: o efetivo exibido é `base × icmsEfetivoPctDe ÷ 100` <<<', () => {
    // 1.000,00 × 7,20% = 72,00 — o mesmo número que credita no caso B.
    const efetivoPct = icmsEfetivoPctDe(CENARIO)!
    expect(CENARIO.base! * efetivoPct / 100).toBeCloseTo(72, 2)
    expect(calcularCustoDoItem(CENARIO, bandeiras()).creditos.ICMS).toBeCloseTo(
      CENARIO.base! * efetivoPct / 100, 6,
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A ALÍQUOTA DO ICMS CONTINUA OBRIGATÓRIA — o que a linha legada já exigia
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('a exigência do ICMS atravessou a mudança de linha', () => {
  it('>>> só o ICMS pede `obrigatorio`, e é ele que tem `rules` <<<', () => {
    /*
      A linha legada de ICMS trazia um `validator` que recusava o save com a alíquota
      APAGADA — e apagada não é zero (`ausente-vs-falso.md`). Ao trazer a linha para dentro
      do container pela entrada `R$|%`, a regra teria sumido sem nada falhar: com
      `initialValue={0}` o campo nasce preenchido, e só o usuário que LIMPA o campo veria a
      diferença.

      Caso de CAMINHO, declarado, e pelo mesmo motivo do G: o defeito é a ausência da regra
      numa das quatro linhas, e não há número que distinga os dois estados — o crédito é o
      mesmo com ou sem validador, porque o validador não entra na conta.
    */
    const s = semComentario(formulario())
    expect(s).toContain('const entradaEmReais = (t: TributoCreditavel, obrigatorio = false)')
    expect(s).toContain('rules={obrigatorio')
    expect(s).toContain(String.raw`Promise.reject(new Error(REQUIRED))`)

    const extras = blocoDosExtras(formulario())
    expect(extras).toContain("entradaEmReais('ICMS', true)")
    // E o PAR: os outros dois NÃO pedem — CBS e IBS podem legitimamente não existir na nota.
    expect(extras).toContain("entradaEmReais('CBS')")
    expect(extras).toContain("entradaEmReais('IBS')")
    expect(extras).not.toContain("entradaEmReais('CBS', true)")
    expect(extras).not.toContain("entradaEmReais('IBS', true)")
  })
})
