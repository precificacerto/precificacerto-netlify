/**
 * A TRAVA DE PRODUTOS — o `ProductPrice` de Produtos, CONGELADO ao centavo, antes de o orçamento I.A. mexer nele (dono do produto, 11/11/2026).
 *
 * Por que existe. O `ProductPrice` precifica em produção os produtos vivos das empresas, e o orçamento I.A. vai extrair a montagem do preço
 * dele para um módulo puro que o servidor também use (a cadeia do "sim"). A regra do dono do produto: "o que o orçamento acrescenta entra por
 * FORA, e Produtos não muda". Este arquivo é a prova: ele renderiza o `ProductPrice` SEM nenhuma prop do orçamento e afirma, por regime, os
 * SEIS valores de preço da tela, exatamente como texto — ao centavo:
 *   1. Margem de contribuição aplicada;   2. Coeficiente da operação por fora (c);   3. Valor do produto precificado;
 *   4. Total Operação Interna;            5. Preço Final com Impostos;               6. o Preço de Venda por Unidade, em destaque.
 * Onde o regime não exibe uma das linhas, o caso afirma a AUSÊNCIA (`null`) — nunca pula (`teste-que-nao-exercita.md`).
 *
 * Os números foram MEDIDOS no código de 11/11/2026 (o `6225b8b7`) e conferidos IGUAIS na `origin/main` (o mesmo arquivo roda nas duas), antes
 * de qualquer extração. Não são uma conta refeita aqui: refazê-la faria o caso concordar consigo mesmo. Se um deles mover um centavo, a
 * extração mudou Produtos — pare, e mostre os dois valores ao dono do produto.
 *
 * Os regimes: Lucro Real com a matriz governando (com IBS/CBS e com c = 0) e SEM ela (acréscimo legado no cadastro, a matriz recusa); Simples
 * Nacional e MEI (sem por fora); Simples Híbrido, com e sem acréscimo (caminho próprio, não a matriz). OS DOIS DEFEITOS CONHECIDOS do
 * `ProductPrice` (#260 e o seguinte) NÃO são corrigidos aqui, e os números deles estão congelados como estão — por exemplo, no Lucro Real sem
 * matriz o "Valor do produto precificado" (1.360,04) e a "Total Operação Interna" (2.500,00) não coincidem.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ProductPrice } from '@/page-parts/products/product-price.component'

let REGIME = 'LUCRO_REAL'

jest.mock('@/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const resposta = tabela === 'tenant_settings'
        ? { data: { tenant_id: 't1', tax_regime: REGIME, calc_type: 'INDUSTRIALIZACAO', state_code: 'SP' } }
        : tabela === 'brazilian_states'
          ? { data: [{ code: 'SP', icms_internal_rate: 18 }] }
          : { data: null }
      const encadeia: any = {
        select: () => encadeia,
        eq: () => encadeia,
        order: () => ({ ...resposta, data: tabela === 'simples_nacional_brackets' ? [] : resposta.data }),
        single: () => resposta,
        maybeSingle: () => resposta,
        then: (fn: (v: unknown) => unknown) => Promise.resolve(resposta).then(fn),
      }
      return encadeia
    },
  },
}))

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null as ((e: any) => void) | null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))

const FORM: any = { getFieldValue: (k: string) => (k === 'quantity' ? 1 : 'UN') }

function props(regime: string, over: Record<string, unknown> = {}) {
  const preco = 2_500
  return {
    calcBase: {
      adminLaborPct: 7, fixedExpensePct: 10, variableExpensePct: 3, financialExpensePct: 2,
      financialCommitmentsPct: 0, taxPct: 0, taxLabel: 'Impostos', isMei: regime === 'MEI',
    } as any,
    productPriceInfo: {
      productCost: 1_000, totalProductPrice: preco,
      productProfitPercent: 5, productProfitPrice: preco * 0.05,
      salesCommissionPercent: 5, salesCommissionPrice: preco * 0.05,
      rtReservePercent: 0, taxesPrice: 0,
    } as any,
    currentUser: { taxableRegime: regime, calcType: 'INDUSTRIALIZATION' } as any,
    productForm: FORM,
    handleChangePrecificationInputs: () => {},
    icmsPct: 0.18,
    pisCofinsLRPct: 0.0925,
    isResaleProduct: false,
    ...over,
  } as any
}

function renderRegime(regime: string, over: Record<string, unknown> = {}) {
  REGIME = regime
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(<ProductPrice {...props(regime, over)} />) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}


const LINHAS = ['Margem de contribuição aplicada', 'Coeficiente da operação por fora (c)', 'Valor do produto precificado',
  'Total Operação Interna', 'Preço Final com Impostos'] as const

/** O texto da linha cujo rótulo é `rotulo` (a primeira, se houver duas); `null` quando o regime não a exibe. */
function linha(c: HTMLElement, rotulo: string): string | null {
  for (const div of Array.from(c.querySelectorAll('div'))) {
    const spans = Array.from(div.querySelectorAll(':scope > span'))
    if (spans.length === 2 && (spans[0].textContent || '').trim() === rotulo) return (spans[1].textContent || '').replace(/\u00a0/g, ' ').trim()
  }
  return null
}
// o espaço não separável que o `toLocaleString` põe depois do "R$" vira espaço comum: o que se compara é o número, não o tipo do espaço
const destaque = (c: HTMLElement) => Array.from(c.querySelectorAll('div[style*="font-size: 28px"]')).map((d) => (d.textContent || '').replace(/\u00a0/g, ' ').trim())

type Esperado = { linhas: Record<(typeof LINHAS)[number], string | null>; destaque: string[]; emitido: { finalPrice: number; basePrice: number; externalOpsCoefficient: number | null } }
const CASOS: Array<[string, string, Record<string, unknown>, Esperado]> = [
  ['LUCRO REAL — a matriz governa, com IBS 0,1% e CBS 0,9%', 'LUCRO_REAL', { ibsPct: 0.1, cbsPct: 0.9 }, {
    linhas: { 'Margem de contribuição aplicada': '73,264%', 'Coeficiente da operação por fora (c)': '0,9874%', 'Valor do produto precificado': 'R$ 1.364,92',
      'Total Operação Interna': 'R$ 1.364,92', 'Preço Final com Impostos': 'R$ 1.378,53' },
    destaque: ['R$ 1.378,53/UN'], emitido: { finalPrice: 1378.53, basePrice: 1364.92, externalOpsCoefficient: 0.009874100495178034 } }],
  ['LUCRO REAL — a matriz governa com c = 0 (sem IBS/CBS)', 'LUCRO_REAL', {}, {
    linhas: { 'Margem de contribuição aplicada': '73,528%', 'Coeficiente da operação por fora (c)': '0,0000%', 'Valor do produto precificado': 'R$ 1.360,04',
      'Total Operação Interna': null, 'Preço Final com Impostos': null },
    destaque: ['R$ 1.360,04/UN'], emitido: { finalPrice: 1360.04, basePrice: 1360.04, externalOpsCoefficient: 0 } }],
  ['LUCRO REAL — SEM a matriz (acréscimo legado no cadastro: a matriz recusa)', 'LUCRO_REAL', { ibsPct: 0.1, cbsPct: 0.9, freightValue: 50 }, {
    linhas: { 'Margem de contribuição aplicada': '73,528%', 'Coeficiente da operação por fora (c)': null, 'Valor do produto precificado': 'R$ 1.360,04',
      'Total Operação Interna': 'R$ 2.500,00', 'Preço Final com Impostos': 'R$ 2.575,43' },
    destaque: ['R$ 2.575,43/UN'], emitido: { finalPrice: 2575.431875, basePrice: 2550, externalOpsCoefficient: null } }],
  ['SIMPLES NACIONAL — sem por fora', 'SIMPLES_NACIONAL', {}, {
    linhas: { 'Margem de contribuição aplicada': '75,000%', 'Coeficiente da operação por fora (c)': null, 'Valor do produto precificado': null,
      'Total Operação Interna': null, 'Preço Final com Impostos': null },
    destaque: ['R$ 2.500,00/UN'], emitido: { finalPrice: 2500, basePrice: 2500, externalOpsCoefficient: null } }],
  ['SIMPLES NACIONAL — com acréscimo legado (não muda o preço do Simples)', 'SIMPLES_NACIONAL', { freightValue: 50 }, {
    linhas: { 'Margem de contribuição aplicada': '75,000%', 'Coeficiente da operação por fora (c)': null, 'Valor do produto precificado': null,
      'Total Operação Interna': null, 'Preço Final com Impostos': null },
    destaque: ['R$ 2.500,00/UN'], emitido: { finalPrice: 2500, basePrice: 2500, externalOpsCoefficient: null } }],
  ['MEI — sem por fora', 'MEI', {}, {
    linhas: { 'Margem de contribuição aplicada': '75,000%', 'Coeficiente da operação por fora (c)': null, 'Valor do produto precificado': null,
      'Total Operação Interna': null, 'Preço Final com Impostos': null },
    destaque: ['R$ 2.500,00/UN'], emitido: { finalPrice: 2500, basePrice: 2500, externalOpsCoefficient: null } }],
  ['SIMPLES HÍBRIDO — caminho próprio, com IBS 0,1% e CBS 0,9%', 'SIMPLES_HIBRIDO', { ibsPct: 0.1, cbsPct: 0.9 }, {
    linhas: { 'Margem de contribuição aplicada': '75,000%', 'Coeficiente da operação por fora (c)': null, 'Valor do produto precificado': null,
      'Total Operação Interna': 'R$ 2.500,00', 'Preço Final com Impostos': 'R$ 2.525,00' },
    destaque: ['R$ 2.525,00/UN'], emitido: { finalPrice: 2525, basePrice: 2500, externalOpsCoefficient: null } }],
  ['SIMPLES HÍBRIDO — com acréscimo legado', 'SIMPLES_HIBRIDO', { ibsPct: 0.1, cbsPct: 0.9, freightValue: 50 }, {
    linhas: { 'Margem de contribuição aplicada': '75,000%', 'Coeficiente da operação por fora (c)': null, 'Valor do produto precificado': null,
      'Total Operação Interna': 'R$ 2.500,00', 'Preço Final com Impostos': 'R$ 2.575,50' },
    destaque: ['R$ 2.575,50/UN'], emitido: { finalPrice: 2575.5, basePrice: 2550, externalOpsCoefficient: null } }],
]

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('A TRAVA DE PRODUTOS — o ProductPrice SEM prop do orçamento, os seis valores da tela ao centavo, por regime', () => {
  it.each(CASOS)('%s', (_nome, regime, over, esperado) => {
    const emitidos: Array<Record<string, unknown>> = []
    const { container, unmount } = renderRegime(regime, { ...over, onFinalPriceWithTaxesChange: (d: Record<string, unknown>) => emitidos.push(d) })
    try {
      const medidas = Object.fromEntries(LINHAS.map((r) => [r, linha(container, r)]))
      expect(medidas).toEqual(esperado.linhas)
      expect(destaque(container)).toEqual(esperado.destaque)
      // o que Produtos entrega a quem o usa (os três campos que a main já emitia)
      expect(emitidos[emitidos.length - 1]).toMatchObject(esperado.emitido)
    } finally { unmount() }
  })
  it('e a trava enxerga: cada caso tem pelo menos uma linha PRESENTE e o destaque, e os casos não são todos iguais', () => {
    for (const [, , , e] of CASOS) {
      expect(Object.values(e.linhas).some((v) => v !== null)).toBe(true)
      expect(e.destaque).toHaveLength(1)
    }
    expect(new Set(CASOS.map(([, , , e]) => e.destaque[0])).size).toBeGreaterThan(3)
  })
})
