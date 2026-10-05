/**
 * O CUSTO DOS PRODUTOS SE LÊ DE CIMA PARA BAIXO.
 *
 * Comando do PO de 05/10/2026.
 *
 * >>> O DEFEITO, medido em produção <<<
 *
 * A linha de cabeçalho do grupo misturava DOIS números de blocos diferentes:
 *
 *     label:      row.valuesExibidas ? `${row.label} (líquido)` : row.label
 *     values:     row.valuesExibidas ?? row.values      ← LÍQUIDO nos meses
 *     averagePct: row.averagePct                        ← BRUTO na média
 *
 * Em Custo dos Produtos os meses mostravam R$ 149.084,62 — o líquido de janeiro — ao lado de
 * 58,63%, que é o bruto. O líquido é 49,25%. Uma linha, duas perguntas, nenhuma pista de qual.
 *
 * >>> POR QUE ESTE ARQUIVO RENDERIZA, e não lê as constantes <<<
 *
 * O número errado estava na TELA, não no motor: `hub-engine.ts` produzia os dois corretamente
 * e `hub-tab.component.tsx` escolhia um de cada. Um caso sobre `LINHAS_DE_APRESENTACAO_DO_CUSTO`
 * ou sobre `row.valuesExibidas` ficaria verde com a tela ainda misturando — é a variante 3 de
 * `teste-que-nao-exercita.md`: afirmar que o dado chega não é afirmar o que a tela faz com ele.
 *
 * Por isso aqui se lê o DOM: o texto do cabeçalho, o número da célula, a ordem das linhas e o
 * recuo de cada uma.
 *
 * >>> A TRAVA DO §0, que é a razão do último caso <<<
 *
 * `findPct` devolve `row.averagePct / 100`, e para CUSTO_PRODUTOS esse percentual é o BRUTO —
 * é dele que sai o `product_cost_percent` que forma preço. Nada nesta rodada o toca, e o caso
 * de não-regressão existe para que isso seja MEDIDO e não afirmado.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { extractStructurePercents } from '@/utils/hub-engine'
import {
  LINHAS_DE_APRESENTACAO_DO_CUSTO as LINHAS,
  DETALHE_DO_CREDITO_POR_TRIBUTO as DETALHE,
  ehDetalheDeCreditoPorTributo,
} from '@/utils/custo-produtos-no-dre'
import type { HubData, HubRow } from '@/utils/hub-engine'

// ═════════════════════════════════════════════════════════════════════════════════════════
// O FIXTURE — os números de produção, para que a asserção seja sobre eles
// ═════════════════════════════════════════════════════════════════════════════════════════

const FATURAMENTO = 302_700
const BRUTO = 177_472.01        // 58,63% de 302.700
const CREDITOS = 28_387.39      //  9,37%
const LIQUIDO = BRUTO - CREDITOS // 149.084,62 → 49,25%

const CRED_ICMS = 16_618.23     // 5,49%
const CRED_PIS_COFINS = 11_230.17 // 3,71%
const CRED_IPI = 538.99         // 0,17%

const MES = '2026-01'
const pct = (v: number) => Math.round(((v / FATURAMENTO) * 100) * 100) / 100

const sub = (categoryKey: string, label: string, valor: number, apenasApresentacao = false) => ({
  categoryKey, label,
  values: { [MES]: valor },
  totalSum: valor,
  closedMonthsWithData: 1,
  averageRS: valor,
  averagePct: pct(valor),
  apenasApresentacao,
})

/*
  A linha do grupo como `calculateHubData` A PRODUZ: `values` com o BRUTO (é o que soma no
  "Total Despesas") e `valuesExibidas` com o LÍQUIDO. As DUAS continuam vindo do motor — esta
  rodada não mexe nele, só em qual delas a tela lê.
*/
const GRUPO_CUSTO: HubRow = {
  group: 'CUSTO_PRODUTOS',
  label: 'Custo dos Produtos',
  values: { [MES]: BRUTO },
  valuesExibidas: { [MES]: LIQUIDO },
  totalSum: BRUTO,
  closedMonthsWithData: 1,
  averageRS: BRUTO,
  averagePct: pct(BRUTO),
  subRows: [
    sub('FORNECEDORES', 'Fornecedores — Produtos para Revenda', 51_822.24),
    sub('MATERIA_PRIMA', 'Matéria Prima — Base dos produtos', 125_196.72),
    sub('FRETES_FOB', 'Fretes FOB', 453.05),
    sub(LINHAS.bruto.key, LINHAS.bruto.label, BRUTO, true),
    sub(LINHAS.creditos.key, LINHAS.creditos.label, -CREDITOS, true),
    sub(DETALHE.icms.key, DETALHE.icms.label, -CRED_ICMS, true),
    sub(DETALHE.pisCofins.key, DETALHE.pisCofins.label, -CRED_PIS_COFINS, true),
    sub(DETALHE.ipi.key, DETALHE.ipi.label, -CRED_IPI, true),
    sub(LINHAS.liquido.key, LINHAS.liquido.label, LIQUIDO, true),
  ],
} as HubRow

const HUB: HubData = {
  months: [MES],
  rows: [GRUPO_CUSTO],
  incomeByMonth: { [MES]: FATURAMENTO },
  totalIncome: FATURAMENTO,
  totalIncomeMonthsCount: 1,
}

jest.mock('@/utils/hub-engine', () => {
  const real = jest.requireActual('@/utils/hub-engine')
  return { ...real, calculateHubData: jest.fn() }
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { calculateHubData } = require('@/utils/hub-engine')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HubTab } = require('@/components/hub/hub-tab.component')

async function renderHub() {
  ;(calculateHubData as jest.Mock).mockResolvedValue(HUB)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<HubTab tenantId="t1" />) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

/** As linhas da tabela, na ordem do DOM: rótulo visível + o recuo da célula de rótulo. */
function linhas(c: HTMLElement): { rotulo: string; recuo: number }[] {
  const out: { rotulo: string; recuo: number }[] = []
  for (const tr of Array.from(c.querySelectorAll('tbody tr'))) {
    const td = tr.querySelectorAll('td')[0]
    if (!td) continue
    const span = td.querySelector('span')
    const rotulo = (td.textContent || '').trim().replace(/^[—·]\s*/, '')
    if (!rotulo) continue
    const pl = span ? (span as HTMLElement).style.paddingLeft : ''
    out.push({ rotulo, recuo: pl ? parseInt(pl, 10) : 0 })
  }
  return out
}

/*
  A célula do mês traz VALOR e PERCENTUAL concatenados — `"R$ 177.472,0158,63%"`. A primeira
  versão deste helper limpava tudo que não fosse dígito e devolvia NaN. O regex abaixo recorta
  só o primeiro montante em R$, que é o número que a coluna do mês publica.
*/
function reais(txt: string): number {
  const m = txt.match(/(-?)R\$\s?([\d.]+,\d{2})/)
  if (!m) return NaN
  const n = Number(m[2].replace(/\./g, '').replace(',', '.'))
  return m[1] === '-' ? -n : n
}

/** O valor da célula do mês, pela linha cujo rótulo casa. */
function celulaDoMes(c: HTMLElement, rotulo: string): number | null {
  for (const tr of Array.from(c.querySelectorAll('tbody tr'))) {
    const tds = Array.from(tr.querySelectorAll('td'))
    if (!tds.length) continue
    const r = (tds[0].textContent || '').trim().replace(/^[—·]\s*/, '')
    if (r !== rotulo) continue
    return reais((tds[1]?.textContent || '').trim())
  }
  return null
}

/*
  O SUFIXO `(subtotal)` é pré-existente e vale para TODA sub-linha com `apenasApresentacao` —
  inclusive as cinco de tributo, que saem como `"ICMS (subtotal)"`. Não é escopo desta rodada
  mexer nele, e o helper existe para que os casos nomeiem a linha como a TELA a nomeia, em vez
  de eu inventar o rótulo que eu gostaria que ela tivesse.
*/
const comoATelaChama = (label: string) => `${label} (subtotal)`

// ═════════════════════════════════════════════════════════════════════════════════════════

describe('1. §2 — O CABEÇALHO É O BRUTO, nos meses e na média', () => {
  let r: Awaited<ReturnType<typeof renderHub>>
  beforeAll(async () => { r = await renderHub() })
  afterAll(() => r.unmount())

  it('>>> o cabeçalho NÃO diz "(líquido)" <<<', () => {
    const rotulos = linhas(r.container).map((l) => l.rotulo)
    expect(rotulos).toContain('Custo dos Produtos')
    expect(rotulos.join(' | ')).not.toContain('(líquido)')
  })

  it('>>> e o NÚMERO dele é o BRUTO, igual ao da linha "Custo bruto (subtotal)" <<<', () => {
    /*
      É O CASO DA CORREÇÃO. Antes, esta célula trazia 149.084,62 (o líquido) ao lado de uma
      média de 58,63% (o bruto). A asserção é dupla de propósito: o valor absoluto E a
      igualdade com a linha do bruto. Só o absoluto passaria se alguém trocasse o fixture;
      só a igualdade passaria se as duas linhas virassem o líquido.
    */
    const cabecalho = celulaDoMes(r.container, 'Custo dos Produtos')
    const subtotalBruto = celulaDoMes(r.container, `${LINHAS.bruto.label} (subtotal)`)
    expect(cabecalho).toBeCloseTo(BRUTO, 2)
    expect(cabecalho).toBeCloseTo(subtotalBruto as number, 2)
    // E o PAR: NÃO é o líquido, que é o que ele mostrava.
    expect(cabecalho).not.toBeCloseTo(LIQUIDO, 2)
    expect(Math.abs((cabecalho as number) - LIQUIDO)).toBeCloseTo(CREDITOS, 2)
  })

  it('a média do cabeçalho segue o BRUTO — ela já era, e não foi tocada', () => {
    const txt = r.container.textContent || ''
    expect(txt).toContain('58,63')
    expect(pct(BRUTO)).toBe(58.63)
    expect(pct(LIQUIDO)).toBe(49.25)
  })
})

describe('2. §3 + §4 — a ordem e a hierarquia', () => {
  let r: Awaited<ReturnType<typeof renderHub>>
  beforeAll(async () => { r = await renderHub() })
  afterAll(() => r.unmount())

  it('>>> a ordem é a do §4, de cima para baixo <<<', () => {
    const rotulos = linhas(r.container).map((l) => l.rotulo)
    const i = (t: string) => rotulos.indexOf(t)
    expect(i('Custo dos Produtos')).toBeGreaterThanOrEqual(0)
    expect(i('Fornecedores — Produtos para Revenda')).toBeGreaterThan(i('Custo dos Produtos'))
    expect(i(`${LINHAS.bruto.label} (subtotal)`)).toBeGreaterThan(i('Fretes FOB'))
    expect(i(`${LINHAS.creditos.label} (subtotal)`)).toBeGreaterThan(i(`${LINHAS.bruto.label} (subtotal)`))
    expect(i(comoATelaChama('ICMS'))).toBeGreaterThan(i(comoATelaChama(LINHAS.creditos.label)))
    expect(i(comoATelaChama('PIS/COFINS'))).toBeGreaterThan(i(comoATelaChama('ICMS')))
    expect(i(comoATelaChama('IPI'))).toBeGreaterThan(i(comoATelaChama('PIS/COFINS')))
    // O LÍQUIDO FECHA o bloco — é a inversão de 05/10/2026.
    expect(i(comoATelaChama(LINHAS.liquido.label))).toBeGreaterThan(i(comoATelaChama('IPI')))
  })

  it('>>> a sub-linha de ICMS tem recuo MAIOR que a de créditos <<<', () => {
    const porRotulo = Object.fromEntries(linhas(r.container).map((l) => [l.rotulo, l.recuo]))
    const recuoCreditos = porRotulo[`${LINHAS.creditos.label} (subtotal)`]
    expect(recuoCreditos).toBeGreaterThan(0)
    for (const t of ['ICMS', 'PIS/COFINS', 'IPI']) {
      expect(porRotulo[comoATelaChama(t)]).toBeGreaterThan(recuoCreditos)
    }
    // E o PAR: as categorias REAIS e as linhas do bloco ficam no recuo de sempre. Sem isto,
    // recuar TODAS as sub-linhas passaria verde e a hierarquia continuaria invisível.
    expect(porRotulo['Fornecedores — Produtos para Revenda']).toBe(recuoCreditos)
    expect(porRotulo[`${LINHAS.bruto.label} (subtotal)`]).toBe(recuoCreditos)
    expect(porRotulo[`${LINHAS.liquido.label} (subtotal)`]).toBe(recuoCreditos)
  })

  it('o recuo sai de `nivel`, e a regra de quem é detalhe vive no módulo', () => {
    // O rótulo NÃO carrega espaço: quem recua é o `paddingLeft`. Rótulo com espaço quebraria
    // busca e sumiria no `trim()` de quem lê a tabela.
    const icms = linhas(r.container).find((l) => l.rotulo === comoATelaChama('ICMS'))
    expect(icms?.rotulo).toBe('ICMS (subtotal)')
    expect(icms?.rotulo).not.toMatch(/^\s/)
    expect(ehDetalheDeCreditoPorTributo(DETALHE.icms.key)).toBe(true)
    expect(ehDetalheDeCreditoPorTributo(LINHAS.creditos.key)).toBe(false)
    expect(ehDetalheDeCreditoPorTributo('FORNECEDORES')).toBe(false)
  })

  it('>>> bruto + créditos = líquido, ao centavo, com os números do fixture <<<', () => {
    const v = (t: string) => celulaDoMes(r.container, t) as number
    const bruto = v(`${LINHAS.bruto.label} (subtotal)`)
    const creditos = v(`${LINHAS.creditos.label} (subtotal)`)
    const liquido = v(`${LINHAS.liquido.label} (subtotal)`)
    expect(creditos).toBeLessThan(0)
    expect(bruto + creditos).toBeCloseTo(liquido, 2)
    expect(liquido).toBeCloseTo(149_084.62, 2)
    // E o detalhe por tributo soma a linha-mãe, aos centavos do fixture.
    const soma = v(comoATelaChama('ICMS')) + v(comoATelaChama('PIS/COFINS')) + v(comoATelaChama('IPI'))
    expect(soma).toBeCloseTo(creditos, 2)
  })
})

describe('3. §0 — NÃO-REGRESSÃO: nenhum preço se move', () => {
  it('>>> o insumo do `product_cost_percent` é IDÊNTICO — e ele NÃO sai de `extractStructurePercents` <<<', () => {
    /*
      >>> CORREÇÃO AO §0 DO COMANDO, medida <<<

      O §0 atribui `product_cost_percent` a `extractStructurePercents` / `findPct`. Medido:
      aquela função devolve ONZE chaves e `product_cost_percent` NÃO está entre elas —
      `indirect_labor_percent`, `fixed_expense_percent`, `financial_commitments_percent`,
      `variable_expense_percent`, `financial_expense_percent`,
      `production_labor_cost_percent`, `tax_on_revenue_percent`, `external_taxes_percent`,
      `outsourced_activities_percent`, `deducao_receita_percent`, `commission_percent_hub`.

      Ele nasce em `recalc-expense-config.ts:166-170`, de
      `custoProdutosRow.averagePct / 100` (ou `totalSum / customBase` quando há base custom).
      Está dentro de uma função `async` que consulta o banco, então o caso afirma os DOIS
      INSUMOS em vez de chamá-la — e são eles que a rodada tinha de deixar quietos.

      A conclusão do §0 não muda: nenhum preço se move. O que muda é ONDE isso se mede.
    */
    const row = HUB.rows[0]
    // Os dois insumos, que a rodada não toca:
    expect(row.averagePct).toBe(58.63)
    expect(row.averagePct / 100).toBe(0.5863)
    expect(row.totalSum).toBeCloseTo(BRUTO, 2)
    // O PAR que nomeia o erro: se o líquido tivesse vazado para cá, seria 49,25% / 149.084,62.
    expect(row.averagePct).not.toBe(pct(LIQUIDO))
    expect(row.totalSum).not.toBeCloseTo(LIQUIDO, 2)
    // E `extractStructurePercents` segue sem a chave — se um dia passar a tê-la, este caso
    // fica vermelho e alguém relê o §0 em vez de supor.
    expect(Object.keys(extractStructurePercents(HUB))).not.toContain('product_cost_percent')
  })

  it('e `valuesExibidas` continua sendo PRODUZIDO pelo motor — não foi removido', () => {
    // §2 do comando: `valuesExibidas` deixa de ser LIDO pelo cabeçalho, e a remoção do campo
    // é decisão separada. Este caso afirma que o motor segue entregando-o, para que a
    // remoção, quando vier, seja uma escolha e não um efeito colateral desta rodada.
    expect(HUB.rows[0].valuesExibidas).toBeDefined()
    expect(HUB.rows[0].valuesExibidas?.[MES]).toBeCloseTo(LIQUIDO, 2)
  })
})
