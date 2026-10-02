/**
 * A LINHA DO COMPROMISSO NA TABELA DO CADASTRO — a origem de tudo.
 *
 * ADENDO 2 do PO, 02/10/2026:
 *
 *   > O §6.1 não foi entregue onde mais importa: a tabela % ORIGINAL / DESPESA / % EFETIVO /
 *   > VALOR (R$) do cadastro de produto, e a equivalente do cadastro de serviço.
 *   > (…) "Compromissos Financeiros" entra como linha própria, IMEDIATAMENTE DEPOIS de
 *   > "Despesas financeiras", antes de "RT — Comissão Reserva Técnica".
 *   > (…) Se a linha nova aparecer e a despesa fixa continuar com o percentual cheio, o
 *   > divisor ganha o compromisso duas vezes e o preço sobe.
 *
 * >>> O QUE ESTE ARQUIVO PRECISA DISTINGUIR, e por que ele RENDERIZA <<<
 *
 * Um caso que afirmasse `calcBase.financialCommitmentsPct === 4.5` ficaria verde sem que
 * linha nenhuma existisse na tela: é a variante 3 de `teste-que-nao-exercita.md` — afirmar
 * que a prop chega NÃO é afirmar que ela muda alguma coisa. E foi exatamente esse o defeito
 * que o ADENDO 2 pegou: o percentual JÁ chegava (ele entrava no `structurePct`), e a linha
 * estava na posição errada numa tela e ausente na outra.
 *
 * Por isso todo caso daqui lê o DOM: a ordem das linhas do `tbody`, o texto da coluna
 * % Original e o texto da coluna Valor (R$). O que se afirma é o que o usuário vê.
 *
 * >>> E POR QUE O PERCENTUAL VEM DO HUB, medido, e não de uma constante <<<
 *
 * O §2 diz "do HUB, pela mesma função das outras linhas". Um fixture com `4.5` escrito à mão
 * passaria verde com um `const COMPROMISSO_PCT = 4.5` dentro do componente. Aqui o número é
 * PRODUZIDO por `extractStructurePercents` sobre um HUB montado, e o caso compara o que a
 * tela exibe com o que a função devolveu. Trocar a linha do HUB muda o que a tela mostra —
 * é isso que mata a mutação (P4).
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Form } from 'antd'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ProductPrice } from '@/page-parts/products/product-price.component'
import { ContentService } from '@/page-parts/products/content-service'
import { extractStructurePercents } from '@/utils/hub-engine'
import { LABEL_DO_BLOCO, BLOCO_COMPROMISSOS } from '@/utils/compromissos-financeiros'
import type { HubData, HubRow } from '@/utils/hub-engine'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))

function renderIn(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(node) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// O CENÁRIO — o HUB, e os dois percentuais que ele produz
// ═════════════════════════════════════════════════════════════════════════════════════════

const FATURAMENTO = 100_000

/*
  Os valores NÃO são redondos de propósito. 20.006 + 4.508 é o par que DISCRIMINA o
  arredondamento: `findPct` lê `averagePct / 100`, já arredondado a 1e-4 POR LINHA, e
  round4(20.006/100.000) + round4(4.508/100.000) = 24,52% enquanto round4(24.514/100.000)
  = 24,51%. Um par redondo deixaria as duas montagens com o mesmo número e o caso não
  distinguiria nada (`teste-que-nao-exercita.md`, variante 2).
*/
const FIXAS_COMUNS = 20_006
const COMPROMISSOS = 4_508

function row(group: string, totalSum: number): HubRow {
  return {
    group, label: group,
    values: { '2026-01': totalSum },
    totalSum,
    closedMonthsWithData: 1,
    averageRS: totalSum,
    // O arredondamento do HUB real. Reproduzi-lo é o que torna o fixture capaz de distinguir.
    averagePct: Math.round(((totalSum / FATURAMENTO) * 100) * 100) / 100,
    subRows: [],
  }
}

function hub(rows: HubRow[]): HubData {
  return {
    months: ['2026-01'], rows,
    incomeByMonth: { '2026-01': FATURAMENTO },
    totalIncome: FATURAMENTO,
    totalIncomeMonthsCount: 1,
  }
}

/** ANTES de 02/10/2026 — o compromisso somado DENTRO de `DESPESA_FIXA`, sem linha própria. */
const HUB_ANTES = hub([
  row('DESPESA_FIXA', FIXAS_COMUNS + COMPROMISSOS),
  row('DESPESA_VARIAVEL', 5_000),
  row('DESPESA_FINANCEIRA', 1_000),
])

/** DEPOIS — UM grupo próprio para as cinco subcategorias. */
const HUB_DEPOIS = hub([
  row('DESPESA_FIXA', FIXAS_COMUNS),
  row(BLOCO_COMPROMISSOS, COMPROMISSOS),
  row('DESPESA_VARIAVEL', 5_000),
  row('DESPESA_FINANCEIRA', 1_000),
])

const PCT_ANTES = extractStructurePercents(HUB_ANTES)
const PCT_DEPOIS = extractStructurePercents(HUB_DEPOIS)

/** Em PERCENTUAL, como o `calcBase` os carrega. */
const FIXA_CHEIA_PCT = PCT_ANTES.fixed_expense_percent * 100
const FIXA_REDUZIDA_PCT = PCT_DEPOIS.fixed_expense_percent * 100
const COMPROMISSO_PCT = PCT_DEPOIS.financial_commitments_percent * 100
const VARIAVEL_PCT = PCT_DEPOIS.variable_expense_percent * 100
const FINANCEIRA_PCT = PCT_DEPOIS.financial_expense_percent * 100

// ═════════════════════════════════════════════════════════════════════════════════════════
// A TELA DE PRODUTO
// ═════════════════════════════════════════════════════════════════════════════════════════

const MO_INDIRETA = 7
const COMISSAO = 5
const LUCRO = 5
const CUSTO = 1_250

/**
 * `calcBase` como a tela o recebe. O `structurePct` é a SOMA — é ele que vira divisor, e é
 * por isso que `fixa reduzida + compromisso` ter de dar a `fixa cheia` não é detalhe de
 * exibição: o preço sai dessa soma.
 */
function calcBase(fixaPct: number, compromissoPct: number): any {
  return {
    indirectLaborPct: MO_INDIRETA,
    laborPercent: 0,
    fixedExpensePct: fixaPct,
    financialCommitmentsPct: compromissoPct,
    variableExpensePct: VARIAVEL_PCT,
    financialExpensePct: FINANCEIRA_PCT,
    structurePct: fixaPct + compromissoPct + VARIAVEL_PCT + FINANCEIRA_PCT,
    taxPct: 0, taxLabel: '', isMei: false,
  }
}

const FORM: any = { getFieldValue: (k: string) => (k === 'quantity' ? 1 : 'UN') }

/**
 * O preço que o motor forma. A MC é `100 − Σ` das linhas exibidas, e o Σ é o mesmo nos dois
 * estados porque `fixa reduzida + compromisso = fixa cheia`. Daí o preço ser idêntico.
 */
function precoDe(fixaPct: number, compromissoPct: number) {
  const soma = MO_INDIRETA + fixaPct + compromissoPct + VARIAVEL_PCT + FINANCEIRA_PCT
    + COMISSAO + LUCRO
  return CUSTO / ((100 - soma) / 100)
}

function infoProduto(preco: number): any {
  return {
    productCost: CUSTO,
    totalProductPrice: preco,
    productProfitPercent: LUCRO,
    productProfitPrice: preco * LUCRO / 100,
    salesCommissionPercent: COMISSAO,
    salesCommissionPrice: preco * COMISSAO / 100,
    rtReservePercent: 0,
    taxesPrice: 0,
  }
}

function propsProduto(fixaPct: number, compromissoPct: number) {
  return {
    calcBase: calcBase(fixaPct, compromissoPct),
    productPriceInfo: infoProduto(precoDe(fixaPct, compromissoPct)),
    currentUser: { taxableRegime: 'SIMPLES_NACIONAL', calcType: 'RESALE' } as any,
    productForm: FORM,
    handleChangePrecificationInputs: () => {},
    icmsPct: 0, pisCofinsLRPct: 0,
    isResaleProduct: true,
  } as any
}

/** Os rótulos do `tbody`, NA ORDEM em que a tela os põe. */
const rotulosEmOrdem = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll('tbody tr'))
    .map((tr) => (tr.querySelectorAll('td')[1]?.textContent || '').trim())
    .filter((t) => t.length > 0)

/** A tabela lida pelo CABEÇALHO — índice fixo quebra quando uma coluna entra. */
function tabela(c: HTMLElement) {
  const ths = Array.from(c.querySelectorAll('thead th')).map((t) => (t.textContent || '').trim())
  const iValor = ths.findIndex((t) => t.startsWith('Valor'))
  const out: Record<string, { original: string; valor: string }> = {}
  for (const tr of Array.from(c.querySelectorAll('tbody tr'))) {
    const tds = Array.from(tr.querySelectorAll('td'))
    if (tds.length < ths.length) continue
    const rotulo = (tds[1]?.textContent || '').trim()
    if (!rotulo) continue
    out[rotulo] = {
      original: (tds[0]?.textContent || '').trim(),
      valor: (tds[iValor]?.textContent || '').trim(),
    }
  }
  return out
}

const reais = (s: string) => Number(s.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'))
const pct = (s: string) => Number(s.replace('%', '').trim().replace(/\./g, '').replace(',', '.'))

describe('1. §1 — A LINHA EXISTE, E A POSIÇÃO É A REGRA (tela de produto)', () => {
  const r = renderIn(<ProductPrice {...propsProduto(FIXA_REDUZIDA_PCT, COMPROMISSO_PCT)} />)
  const ordem = rotulosEmOrdem(r.container)
  afterAll(() => r.unmount())

  it('a linha existe, com o rótulo da FONTE ÚNICA', () => {
    // Não `'Compromissos Financeiros'` literal: o rótulo da tela tem de ser o MESMO objeto
    // que o HUB e o DRE usam, e escrever o literal aqui não distinguiria uma tela que
    // tivesse o seu próprio (`copia-divergente.md`).
    expect(ordem).toContain(LABEL_DO_BLOCO)
  })

  it('>>> IMEDIATAMENTE DEPOIS de "Despesas financeiras" — não é estética, é o §1 <<<', () => {
    const iFin = ordem.indexOf('Despesas financeiras')
    const iComp = ordem.indexOf(LABEL_DO_BLOCO)
    expect(iFin).toBeGreaterThanOrEqual(0)
    // `+ 1` e não `>` : "imediatamente depois" é a redação do comando, e um `>` ficaria
    // verde com a linha três posições abaixo. É a mutação (P3).
    expect(iComp).toBe(iFin + 1)
  })

  it('e ANTES de "RT — Comissão Reserva Técnica"', () => {
    const iComp = ordem.indexOf(LABEL_DO_BLOCO)
    const iRt = ordem.indexOf('RT — Comissão Reserva Técnica')
    expect(iRt).toBeGreaterThanOrEqual(0)
    expect(iComp).toBeLessThan(iRt)
  })

  it('a ordem completa do bloco de despesa é a do §1', () => {
    const esperada = [
      'Mão de obra administrativa',
      'Despesas fixas',
      'Despesas variáveis',
      'Despesas financeiras',
      LABEL_DO_BLOCO,
    ]
    expect(ordem.slice(0, esperada.length)).toEqual(esperada)
  })
})

describe('2. §2 — O PERCENTUAL VEM DO HUB, não de constante', () => {
  const r = renderIn(<ProductPrice {...propsProduto(FIXA_REDUZIDA_PCT, COMPROMISSO_PCT)} />)
  const t = tabela(r.container)
  afterAll(() => r.unmount())

  it('a % exibida é a que `extractStructurePercents` devolveu para o grupo do bloco', () => {
    expect(COMPROMISSO_PCT).toBeCloseTo(4.51, 4)
    expect(pct(t[LABEL_DO_BLOCO].original)).toBeCloseTo(COMPROMISSO_PCT, 2)
  })

  it('>>> e MUDAR A LINHA DO HUB muda o que a tela exibe — é isso que mata a constante <<<', () => {
    // Com o dobro do compromisso lançado no caixa, a tela tem de exibir o dobro. Uma
    // constante no componente ficaria no mesmo número, e este caso é o único aqui que
    // distingue "lido do HUB" de "escrito no código".
    const outro = extractStructurePercents(hub([
      row('DESPESA_FIXA', FIXAS_COMUNS),
      row(BLOCO_COMPROMISSOS, COMPROMISSOS * 2),
      row('DESPESA_VARIAVEL', 5_000),
      row('DESPESA_FINANCEIRA', 1_000),
    ]))
    const pct2 = outro.financial_commitments_percent * 100
    expect(pct2).toBeCloseTo(9.02, 4)

    const r2 = renderIn(<ProductPrice {...propsProduto(outro.fixed_expense_percent * 100, pct2)} />)
    const t2 = tabela(r2.container)
    expect(pct(t2[LABEL_DO_BLOCO].original)).toBeCloseTo(9.02, 2)
    expect(pct(t2[LABEL_DO_BLOCO].original)).not.toBeCloseTo(pct(t[LABEL_DO_BLOCO].original), 2)
    r2.unmount()
  })
})

describe('3. §3 + §4 — AS DUAS LINHAS NA MESMA RENDERIZAÇÃO, e a soma preservada', () => {
  const rDepois = renderIn(<ProductPrice {...propsProduto(FIXA_REDUZIDA_PCT, COMPROMISSO_PCT)} />)
  const tDepois = tabela(rDepois.container)
  // O estado ANTES: a fixa CHEIA e nenhum compromisso. É a referência de todos os números.
  const rAntes = renderIn(<ProductPrice {...propsProduto(FIXA_CHEIA_PCT, 0)} />)
  const tAntes = tabela(rAntes.container)
  afterAll(() => { rDepois.unmount(); rAntes.unmount() })

  it('"Despesas fixas" exibe o percentual REDUZIDO — e ele é MENOR que o de antes', () => {
    // `not.toBe` é o que distingue: uma tela que mostrasse a fixa cheia ao lado da linha nova
    // passaria qualquer caso que só conferisse "a fixa aparece". É a mutação (P2).
    expect(pct(tDepois['Despesas fixas'].original)).toBeCloseTo(FIXA_REDUZIDA_PCT, 2)
    expect(pct(tDepois['Despesas fixas'].original))
      .toBeLessThan(pct(tAntes['Despesas fixas'].original))
  })

  it('>>> as DUAS % somadas = a fixa de ANTES, no MESMO arredondamento <<<', () => {
    /*
      `toBe` no domínio DECIMAL, que é onde a exatidão existe e onde o split foi feito:
      `extractStructurePercents` arredonda o TOTAL uma vez e subtrai o compromisso em
      unidades inteiras de 1e-4, então a soma volta ao mesmo bit.

      >>> E A MEDIÇÃO CORRIGIU O QUE EU IA ESCREVER AQUI <<<
      O primeiro caso afirmava `toBe` sobre os percentuais ×100, e ficou VERMELHO:
      20 + 4.51 = 24.509999999999998 contra 24.51. Não é defeito do split — é a
      representação do 4,51 em binário. A igualdade exata vive no decimal; no domínio do
      percentual ela é exata ao CENTÉSIMO, que é o `round2` com que o `tenant_expense_config`
      o guarda, e é esse o "mesmo arredondamento" do §4. Escrever `toBeCloseTo` e seguir
      adiante teria escondido qual dos dois domínios é o exato.
      (`hipotese-derrubada-pela-propria-medicao.md`.)
    */
    expect(PCT_DEPOIS.fixed_expense_percent + PCT_DEPOIS.financial_commitments_percent)
      .toBe(PCT_ANTES.fixed_expense_percent)
    expect(Math.round((FIXA_REDUZIDA_PCT + COMPROMISSO_PCT) * 100))
      .toBe(Math.round(FIXA_CHEIA_PCT * 100))
    // E os números por extenso, para que a igualdade não seja "dois erros iguais".
    expect(FIXA_CHEIA_PCT).toBeCloseTo(24.51, 10)
    expect(FIXA_REDUZIDA_PCT).toBeCloseTo(20.00, 10)
    expect(COMPROMISSO_PCT).toBeCloseTo(4.51, 10)
    // E o que a TELA exibe nas duas células soma o que ela exibia na única de antes.
    expect(pct(tDepois['Despesas fixas'].original) + pct(tDepois[LABEL_DO_BLOCO].original))
      .toBeCloseTo(pct(tAntes['Despesas fixas'].original), 2)
  })

  it('e os dois R$ somados = o R$ da fixa de antes', () => {
    const soma = reais(tDepois['Despesas fixas'].valor) + reais(tDepois[LABEL_DO_BLOCO].valor)
    expect(soma).toBeCloseTo(reais(tAntes['Despesas fixas'].valor), 2)
  })

  it('a MARGEM DE CONTRIBUIÇÃO APLICADA é a MESMA — §4', () => {
    const mc = (c: HTMLElement) => {
      const txt = c.textContent || ''
      const i = txt.indexOf('Margem de contribuição aplicada')
      expect(i).toBeGreaterThanOrEqual(0)
      return (txt.slice(i, i + 80).match(/(\d{1,3}(?:\.\d{3})*,\d+)%/) || [])[1]
    }
    expect(mc(rDepois.container)).toBe(mc(rAntes.container))
  })

  it('e o PREÇO é o MESMO — a trava do §0 na tela', () => {
    const preco = (c: HTMLElement) => {
      const txt = c.textContent || ''
      // O rótulo é 'Preço de Venda por Unidade' — e o `toBeTruthy` abaixo existe porque a
      // primeira versão procurava 'Preço de venda' e devolvia `null` nas DUAS telas: o caso
      // comparava null com null e passava verde sem olhar preço nenhum.
      const i = txt.indexOf('Preço de Venda por Unidade')
      return i >= 0 ? (txt.slice(Math.max(0, i - 160), i).match(/R\$\s?[\d.]+,\d{2}/g) || []).pop() ?? null : null
    }
    // O divisor é o MESMO a menos do último bit do `4.51` binário — 1,8e-15 de diferença no
    // Σ, que move o preço na 13ª casa. O que o §0 proíbe é mudança de PREÇO, e o número que
    // o usuário vê é a string abaixo: ela tem de ser idêntica, não aproximada.
    expect(precoDe(FIXA_REDUZIDA_PCT, COMPROMISSO_PCT))
      .toBeCloseTo(precoDe(FIXA_CHEIA_PCT, 0), 8)
    expect(preco(rDepois.container)).toBe(preco(rAntes.container))
    expect(preco(rDepois.container)).toBeTruthy()
  })

  it('o RESIDUAL da tabela fecha em zero nos dois estados — Parte 5, teste 2', () => {
    const fecha = (t: Record<string, { valor: string }>, preco: number) => {
      const soma = Object.values(t).reduce((s, r) => s + (reais(r.valor) || 0), 0)
      return preco - (CUSTO + soma)
    }
    /*
      A tolerância é de UM CENTAVO POR CÉLULA, não `toBeCloseTo(0, 2)`: cada R$ exibido é
      arredondado a 2 casas, e com oito linhas o resíduo de arredondamento chega a R$ 0,04.
      Medido: R$ 0,006.

      E ela continua DISCRIMINANDO com folga de três ordens de grandeza — se a fixa ficasse
      cheia ao lado da linha nova (mutação P2), o resíduo seria a parcela do compromisso,
      R$ 107,40 neste cenário.
    */
    const TOLERANCIA = 0.05
    expect(Math.abs(fecha(tDepois, precoDe(FIXA_REDUZIDA_PCT, COMPROMISSO_PCT)))).toBeLessThan(TOLERANCIA)
    expect(Math.abs(fecha(tAntes, precoDe(FIXA_CHEIA_PCT, 0)))).toBeLessThan(TOLERANCIA)
    const parcela = precoDe(FIXA_REDUZIDA_PCT, COMPROMISSO_PCT) * COMPROMISSO_PCT / 100
    expect(parcela).toBeGreaterThan(TOLERANCIA * 100)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A TELA DE SERVIÇO
// ═════════════════════════════════════════════════════════════════════════════════════════

/*
  >>> O SERVIÇO GANHOU A LINHA, E ELA ESTÁ NA SOMA — ADENDO 3, 02/10/2026 <<<

  Este arquivo trazia aqui o relato de uma colisão: a tabela da MC do serviço tem três colunas
  (não há "% Efetivo"), não tem linha de "Despesas fixas", e o seu total é a soma EXATA das
  linhas exibidas — então uma linha de compromisso dentro da soma mudaria a MC, e fora da soma
  deixaria a coluna sem fechar.

  O dono do produto resolveu pelo primeiro lado, e resolveu a causa e não o sintoma:

    > Compromisso financeiro ele vai no denominador, na margem de contribuição.
    > Para serviço pode alterar o preço.

  Com o compromisso fora do custo por minuto, a linha DENTRO da soma deixa de ser dupla
  contagem e passa a ser o que a coluna diz que é. A MC exibida muda de valor — é consequência,
  não erro (§3).

  Os casos deste bloco afirmavam o oposto (que o R$ de "Mão de obra produtiva" era idêntico ao
  de antes do split, porque o compromisso tinha voltado para lá). Estão invertidos abaixo, e os
  do ADENDO 3 vivem em `o-compromisso-no-denominador-do-servico.test.tsx`.
*/

const PRODUTIVA = 300

function infoServico(fixaPct: number, compromissoPct: number): any {
  const preco = precoDe(fixaPct, compromissoPct)
  return {
    ...infoProduto(preco),
    totalServicePrice: preco,
    productWorkloadInMinutesPrice: PRODUTIVA,
    productWorkloadInMinutes: 60,
    indirectLaborExpensePrice: preco * MO_INDIRETA / 100,
    fixedExpensePrice: preco * fixaPct / 100,
    financialCommitmentsPrice: preco * compromissoPct / 100,
    variableExpensePrice: preco * VARIAVEL_PCT / 100,
    financialExpensePrice: preco * FINANCEIRA_PCT / 100,
    rtReservePrice: 0,
    taxesPriceByProduct: 0,
    totalServiceProductPrice: 0,
  }
}

function propsServico(fixaPct: number, compromissoPct: number) {
  return {
    handleClickAddItem: () => {},
    filterOption: () => true,
    items: [],
    columns: [],
    productItemsData: [],
    handleChangePrecificationInputs: () => {},
    productPriceInfo: infoServico(fixaPct, compromissoPct),
    doProductCalc: () => {},
    calcBase: calcBase(fixaPct, compromissoPct),
    currentUser: { taxableRegime: 'SIMPLES_NACIONAL', calcType: 'SERVICE' } as any,
    itemsPriceSum: 0,
  } as any
}

/**
 * `ContentService` monta um `<Form form={itemsForm}>` de verdade, e o antd recusa um stub:
 * `InternalForm` escreve em `form.getInternalHooks(...)`. Daí o wrapper com `Form.useForm()`.
 */
const ServicoHarness: React.FC<{ fixa: number; comp: number }> = ({ fixa, comp }) => {
  const [itemsForm] = Form.useForm()
  const [productForm] = Form.useForm()
  return <ContentService {...propsServico(fixa, comp)} itemsForm={itemsForm} productForm={productForm} />
}

/** O R$ de "Mão de obra produtiva" — o número ao lado do campo de minutos. */
function moProdutivaRS(c: HTMLElement): number | null {
  const txt = c.textContent || ''
  const i = txt.indexOf('Mão de obra produtiva')
  if (i < 0) return null
  const m = txt.slice(i, i + 200).match(/R\$\s?([\d.]+,\d{2})/)
  return m ? reais(m[1]) : null
}

describe('4. §1 no SERVIÇO — o compromisso SAIU do custo por minuto (ADENDO 3)', () => {
  const rDepois = renderIn(<ServicoHarness fixa={FIXA_REDUZIDA_PCT} comp={COMPROMISSO_PCT} />)
  const rAntes = renderIn(<ServicoHarness fixa={FIXA_CHEIA_PCT} comp={0} />)
  afterAll(() => { rDepois.unmount(); rAntes.unmount() })

  it('>>> o R$ de "Mão de obra produtiva" PERDE a parcela do compromisso <<<', () => {
    /*
      INVERSÃO do caso do ADENDO 2, que exigia igualdade. Lá o compromisso tinha voltado ao
      numerador para a barra fechar; o ADENDO 3 o mandou para o denominador, e o §1 é explícito:
      "a barra tem que fechar sem ele".

      A fixa continua lá — é a diferença entre os dois estados ser EXATAMENTE a parcela do
      compromisso, e não a fixa inteira. É o que distingue a mutação (S3), em que a fixa iria
      junto e este número desabaria.
    */
    const depois = moProdutivaRS(rDepois.container)
    const antes = moProdutivaRS(rAntes.container)
    expect(depois).not.toBeNull()
    expect(antes).not.toBeNull()
    const preco = precoDe(FIXA_REDUZIDA_PCT, COMPROMISSO_PCT)
    const parcela = preco * COMPROMISSO_PCT / 100
    expect(parcela).toBeGreaterThan(1)
    expect((antes as number) - (depois as number)).toBeCloseTo(parcela, 2)
  })

  it('a FIXA continua dentro do R$ de MO produtiva — §1, "não mexa nela"', () => {
    // Se a fixa tivesse ido junto para o denominador, o R$ cairia pela fixa TAMBÉM e este caso
    // ficaria vermelho. É a mutação (S3).
    const preco = precoDe(FIXA_REDUZIDA_PCT, COMPROMISSO_PCT)
    const esperado = PRODUTIVA + preco * MO_INDIRETA / 100 + preco * FIXA_REDUZIDA_PCT / 100
    expect(moProdutivaRS(rDepois.container)).toBeCloseTo(esperado, 2)
    expect(preco * FIXA_REDUZIDA_PCT / 100).toBeGreaterThan(1)
  })

  it('a legenda volta a nomear só os três do numerador', () => {
    const txt = rDepois.container.textContent || ''
    const i = txt.indexOf('MO direta + administrativa')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(txt.slice(i, i + 60).toLowerCase()).not.toContain(LABEL_DO_BLOCO.toLowerCase())
  })

  it('>>> a MARGEM DE CONTRIBUIÇÃO do serviço MUDA, e muda pelo compromisso <<<', () => {
    // O oposto do que este caso exigia no ADENDO 2. A MC exibida é `100 − Σ linhas`, e o
    // compromisso entrou na soma: ela cai exatamente pelo percentual dele.
    const mc = (c: HTMLElement) => {
      const txt = c.textContent || ''
      const i = txt.indexOf('Margem de contribuição total aplicada')
      expect(i).toBeGreaterThanOrEqual(0)
      const m = (txt.slice(i, i + 80).match(/(\d{1,3}(?:\.\d{3})*,\d+)%/) || [])[1]
      return Number((m || '').replace(/\./g, '').replace(',', '.'))
    }
    /*
      >>> E A MEDIÇÃO CORRIGIU O SINAL QUE EU ESCREVI <<<

      Escrevi `antes - depois` esperando que a margem CAÍSSE, e saiu −4,51. O número que aquela
      linha publica NÃO é a margem: é `svcTotalPct`, a SOMA das linhas exibidas — o rótulo diz
      "Margem de contribuição total aplicada" e mostra a soma das deduções. A tela de produto,
      ao lado, publica `100 − Σ` sob um rótulo quase igual.

      Fica registrado em vez de corrigido em silêncio: a divergência de rótulo entre as duas
      telas é anterior a esta rodada e não é escopo dela. O que o ADENDO 3 muda é o NÚMERO, e
      ele sobe exatamente pelo percentual do compromisso.
    */
    const antes = mc(rAntes.container)
    const depois = mc(rDepois.container)
    expect(antes).toBeGreaterThan(0)
    expect(depois - antes).toBeCloseTo(COMPROMISSO_PCT, 2)
    expect(depois).toBeGreaterThan(antes)
  })

  it('e a linha do bloco aparece na tabela da MC do serviço — §3', () => {
    const rotulos = Array.from(rDepois.container.querySelectorAll('tbody tr'))
      .map((tr) => (tr.querySelectorAll('td')[1]?.textContent || '').trim())
      .filter((t) => t.length > 0)
    const iFin = rotulos.indexOf('Despesas financeiras')
    const iComp = rotulos.indexOf(LABEL_DO_BLOCO)
    expect(iFin).toBeGreaterThanOrEqual(0)
    expect(iComp).toBe(iFin + 1)
  })
})

describe('5. O PRODUTOR do R$ é ÚNICO — e é por isso que as duas telas não divergem', () => {
  it('`financialCommitmentsPrice` nasce em `content.component.tsx`, ao lado dos outros três', () => {
    // `copia-divergente.md`: derivá-lo na tela filha a partir de `totalServicePrice` seria a
    // segunda escrita da mesma fórmula, e a divergência só apareceria como R$ errado.
    const src = readFileSync(join(process.cwd(), 'src/page-parts/products/content.component.tsx'), 'utf8')
    expect(src).toContain('financialCommitmentsPrice: priceUnit * (calcBase.financialCommitmentsPct / 100)')
    expect(src).toContain('fixedExpensePrice: priceUnit * (calcBase.fixedExpensePct / 100)')

    const svc = readFileSync(join(process.cwd(), 'src/page-parts/products/content-service.tsx'), 'utf8')
    // A tela filma LÊ o campo; ela não reescreve a fórmula.
    expect(svc).toContain('productPriceInfo.financialCommitmentsPrice')
    expect(svc).not.toMatch(/svcTotal\s*\*\s*\(?\s*calcBase\.financialCommitmentsPct/)
  })
})
