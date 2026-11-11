/**
 * A TRAVA DE PRODUTOS NO CONTENT — a tela de Produtos INTEIRA (o `Content`, com o `doProductCalc` e o `ProductPrice` de verdade), CONGELADA ao
 * centavo, antes de o orçamento I.A. extrair a entrada do motor do `doProductCalc` (dono do produto, 11/11/2026).
 *
 * A primeira trava (`a-trava-de-produtos-no-product-price.test.tsx`) protege o `ProductPrice` sozinho. Esta protege o que vem ANTES dele: o
 * `doProductCalc` — a carga horária, a mão de obra, o divisor da estrutura, o imposto efetivo e a chamada ao `calculatePricing` —, que é o que
 * a cadeia do "sim" vai precisar no servidor. Cada caso renderiza Produtos (sem orçamento nenhum) e afirma, como TEXTO e ao centavo: o custo do
 * produto, a mão de obra em R$, a margem de contribuição aplicada, o valor do produto precificado, a Total Operação Interna, o Preço Final com
 * Impostos e o Preço de Venda por Unidade em destaque. Onde o regime não exibe a linha, afirma a AUSÊNCIA (`null`).
 *
 * Os números foram MEDIDOS no código de 11/11/2026 (o `b3cbcda7`) e conferidos IGUAIS na `origin/main` (o mesmo arquivo roda nas duas), antes
 * de qualquer extração. O caso do 1008 em Lucro Real repete os números já congelados no portão do orçamento (custo R$ 1.046,73, MC 33,702%,
 * precificado R$ 3.105,80), o que confere a medição contra uma referência independente. Se um deles mover um centavo, a extração mudou
 * Produtos: pare, e mostre os dois valores ao dono do produto. Os dois defeitos conhecidos do `ProductPrice` NÃO são corrigidos aqui.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: false, media: query, onchange: null as unknown,
        addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

// ── O banco falso do navegador: responde por tabela e anota toda escrita ─────────────────────────────────────────────────────────
const banco = {
    respostas: {} as Record<string, unknown>,
    escritas: [] as Array<{ tabela: string; op: string; carga?: unknown }>,
    lidas: [] as string[],
}
function consulta(tabela: string) {
    banco.lidas.push(tabela)
    const resposta = () => Promise.resolve({ data: banco.respostas[tabela] ?? null, error: null })
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'or', 'in', 'limit', 'not', 'neq', 'ilike']) q[m] = () => q
    for (const op of ['update', 'insert', 'upsert', 'delete']) q[op] = (carga: unknown) => { banco.escritas.push({ tabela, op, carga }); return q }
    q.single = resposta
    q.maybeSingle = resposta
    q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => resposta().then(ok, erro)
    return q
}
jest.mock('@/supabase/client', () => ({
    supabase: {
        from: (t: string) => consulta(t),
        functions: { invoke: async (): Promise<unknown> => ({ data: null, error: null }) },
    },
}))
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), query: {} }) }))
jest.mock('@/utils/get-tenant-id', () => ({ getTenantId: async () => 'tenant-1', getCurrentUserId: async () => 'usuario-1' }))
let mockCelular = false
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: mockCelular }) }))
jest.mock('@/page-parts/shared/classificacao-fiscal-block.component', () => ({ __esModule: true, default: (): null => null }))

/* eslint-disable @typescript-eslint/no-require-imports */
const { Content } = require('@/page-parts/products/content.component') as typeof import('@/page-parts/products/content.component')
/* eslint-enable @typescript-eslint/no-require-imports */

const CUSTO_MENSAL = 40813.03
const USUARIO = {
    tenant_id: 'tenant-1', taxableRegime: 'LUCRO_REAL', calcType: 'INDUSTRIALIZATION',
    monthlyWorkloadInMinutes: 220, unitMeasure: 'HOURS', numProductiveSectorEmployee: 4, // 4 × 220 h × 60 = 52.800 min
    taxableRegimeValue: 0,
} as unknown as import('@/types/logged-user.type').LoggedUser
const CALC_BASE = {
    laborCostMonthly: CUSTO_MENSAL, adminLaborCostMonthly: 9000, fixedExpenseMonthly: 15000, laborPercent: 0,
    indirectLaborPct: 4, fixedExpensePct: 10.39, financialCommitmentsPct: 0, variableExpensePct: 6.41, financialExpensePct: 0.42,
    structurePct: 17.22, taxPct: 0, taxLabel: '', isMei: false, productiveValuePerMinute: 0, monthlyWorkloadMinutes: 0,
} as unknown as import('@/types/calc-base.type').CalcBaseType
const PRODUTO_1008 = {
    id: 'p-1008', code: '1008', name: 'Esquadria de referência', description: '', unitType: 'UN', quantity: 1, salePrice: 0,
    productType: 'PRODUZIDO', baseItemId: null, status: 'ACTIVE', ncm_code: '', section_id: null, commission_table_id: 'tabela-1',
    items: [
        { id: 'i-perfil', name: 'Perfil', quantity: 9, referenceQuantity: 1, unitType: 'UN', price: 9 * 79.6, referencePrice: 79.6 },
        { id: 'i-vidro', name: 'Vidro', quantity: 3.5, referenceQuantity: 1, unitType: 'UN', price: 3.5 * 61.25, referencePrice: 61.25 },
    ],
    productPriceInfo: { productProfitPercent: 10, salesCommissionPercent: 5, rtReservePercent: 3, productWorkloadInMinutes: 150 },
    profit_percent: 10, commission_percent: 5, rt_reserve_percent: 3, icms_pct: 17, pis_cofins_pct: 7.6775, additional_irpj_percent: 0,
    ibs_pct: 0, cbs_pct: 0, is_pct: 0, ipi_pct: 0,
} as unknown as import('@/server/model/product').IProductModel
const ITENS_DA_API = [
    { id: 'i-perfil', name: 'Perfil', quantity: 1, unitType: 'UN', price: 79.6, cost_gross: 96.8, cost_net: 79.6, measure_quantity: 1 },
    { id: 'i-vidro', name: 'Vidro', quantity: 1, unitType: 'UN', price: 61.25, cost_gross: 70, cost_net: 61.25, measure_quantity: 1 },
] as unknown as import('@/server/model/item').IItemModel[]

const montados: Array<() => void> = []
afterEach(() => { while (montados.length) montados.pop()!() })
beforeEach(() => {
    mockCelular = false
    banco.escritas = []
    banco.lidas = []
    banco.respostas = { tenant_settings: { ibs_reference_pct: 0, cbs_reference_pct: 0, state_code: 'RS' }, brazilian_states: { icms_internal_rate: 0.17 } }
})
const esperar = async () => { for (let k = 0; k < 6; k++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const mensagens = () => ({ success: jest.fn(), error: jest.fn(), open: jest.fn(), warning: jest.fn() }) as unknown as import('antd/es/message/interface').MessageInstance

async function montar(props: Partial<React.ComponentProps<typeof Content>>, usuario = USUARIO) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {})
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {})
    // eslint-disable-next-line testing-library/no-unnecessary-act -- a raiz do React 19 monta aqui, sem a testing-library (como os outros testes de tela)
    await act(async () => {
        root.render(<Content messageApi={mensagens()} isEditingMode={false} itemsFromApi={[]} calcBase={CALC_BASE} currentUser={usuario} {...props} />)
    })
    await esperar()
    montados.push(() => { act(() => root.unmount()); host.remove(); erro.mockRestore(); aviso.mockRestore() })
    return host
}
/** O valor ao lado de um rótulo do `ProductPrice` (a última célula da linha do rótulo). */

/** O texto do valor da linha cujo rótulo é `rotulo`; `null` quando a tela não a exibe. */
function valor(host: HTMLElement, rotulo: string): string | null {
    const el = Array.from(host.querySelectorAll('span, div')).find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === rotulo)
    if (!el) return null
    let linha = el.parentElement as HTMLElement
    while (linha && linha.children.length < 2) linha = linha.parentElement as HTMLElement
    return (linha.lastElementChild?.textContent ?? '').replace(/\u00a0/g, ' ').trim()
}
const ROTULOS = ['Custo produto', 'Margem de contribuição aplicada', 'Valor do produto precificado', 'Total Operação Interna', 'Preço Final com Impostos'] as const
/** A mão de obra em R$: o valor na MESMA linha do rótulo "Mão de obra produtiva" — lido pelo texto, que existe na `main` e aqui. */
function maoDeObra(host: HTMLElement): string | null {
    const rotulo = Array.from(host.querySelectorAll('span, div')).find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === 'Mão de obra produtiva')
    for (let el = rotulo?.parentElement ?? null; el; el = el.parentElement) {
        const achado = (el.textContent ?? '').replace(/\u00a0/g, ' ').match(/R\$ [\d.]+,\d{2}/)
        if (achado) return achado[0]
    }
    return null
}
const destaque = (host: HTMLElement) => Array.from(host.querySelectorAll('div[style*="font-size: 28px"]')).map((d) => (d.textContent ?? '').replace(/\u00a0/g, ' ').trim())

type Usuario = import('@/types/logged-user.type').LoggedUser
type Base = import('@/types/calc-base.type').CalcBaseType
type Produto = import('@/server/model/product').IProductModel
type Esperado = Record<(typeof ROTULOS)[number], string | null> & { maoDeObra: string | null; destaque: string[] }
const regime = (taxableRegime: string): Usuario => ({ ...USUARIO, taxableRegime } as Usuario)
const base = (over: Record<string, unknown>): Base => ({ ...CALC_BASE, ...over } as unknown as Base)
const produto = (over: Record<string, unknown>): Produto => ({ ...PRODUTO_1008, ...over } as unknown as Produto)
const CASOS: Array<[string, Usuario, Base, Produto, Esperado]> = [
    ['LUCRO REAL — a matriz governa, c = 0 (o 1008)', USUARIO, CALC_BASE, PRODUTO_1008,
        { 'Custo produto': 'R$ 1.046,73', 'Margem de contribuição aplicada': '33,702%', 'Valor do produto precificado': 'R$ 3.105,80', 'Total Operação Interna': null, 'Preço Final com Impostos': null, maoDeObra: 'R$ 115,95', destaque: ['R$ 3.105,80/UN'] }],
    ['LUCRO REAL — a matriz governa, com IBS 0,1% e CBS 0,9%', USUARIO, CALC_BASE, produto({ ibs_pct: 0.1, cbs_pct: 0.9 }),
        { 'Custo produto': 'R$ 1.046,73', 'Margem de contribuição aplicada': '33,273%', 'Valor do produto precificado': 'R$ 3.145,85', 'Total Operação Interna': 'R$ 3.145,85', 'Preço Final com Impostos': 'R$ 3.169,51', maoDeObra: 'R$ 115,95', destaque: ['R$ 3.169,51/UN'] }],
    ['LUCRO REAL — SEM a matriz (frete legado no cadastro)', USUARIO, CALC_BASE, produto({ ibs_pct: 0.1, cbs_pct: 0.9, freight_value: 50 }),
        { 'Custo produto': 'R$ 1.046,73', 'Margem de contribuição aplicada': '33,702%', 'Valor do produto precificado': 'R$ 3.105,80', 'Total Operação Interna': 'R$ 1.792,96', 'Preço Final com Impostos': 'R$ 1.856,97', maoDeObra: 'R$ 115,95', destaque: ['R$ 1.856,97/UN'] }],
    ['SIMPLES NACIONAL — 6% no DAS', regime('SIMPLES_NACIONAL'), base({ taxPct: 6, taxLabel: 'Simples Nacional' }), PRODUTO_1008,
        { 'Custo produto': 'R$ 1.046,73', 'Margem de contribuição aplicada': '54,780%', 'Valor do produto precificado': null, 'Total Operação Interna': null, 'Preço Final com Impostos': null, maoDeObra: 'R$ 115,95', destaque: ['R$ 1.910,79/UN'] }],
    ['SIMPLES NACIONAL — com frete legado', regime('SIMPLES_NACIONAL'), base({ taxPct: 6, taxLabel: 'Simples Nacional' }), produto({ freight_value: 50 }),
        { 'Custo produto': 'R$ 1.046,73', 'Margem de contribuição aplicada': '54,780%', 'Valor do produto precificado': null, 'Total Operação Interna': null, 'Preço Final com Impostos': null, maoDeObra: 'R$ 115,95', destaque: ['R$ 1.910,79/UN'] }],
    ['MEI', regime('MEI'), base({ isMei: true, taxPct: 0 }), PRODUTO_1008,
        { 'Custo produto': 'R$ 1.046,73', 'Margem de contribuição aplicada': '60,780%', 'Valor do produto precificado': null, 'Total Operação Interna': null, 'Preço Final com Impostos': null, maoDeObra: 'R$ 115,95', destaque: ['R$ 1.722,16/UN'] }],
    ['SIMPLES HÍBRIDO — 6% no DAS, IBS 0,1% e CBS 0,9%', regime('SIMPLES_HIBRIDO'), base({ taxPct: 6, deducaoBaseIbsCbsPct: 0.17 }), produto({ ibs_pct: 0.1, cbs_pct: 0.9 }),
        { 'Custo produto': 'R$ 1.046,73', 'Margem de contribuição aplicada': '54,405%', 'Valor do produto precificado': null, 'Total Operação Interna': 'R$ 1.910,79', 'Preço Final com Impostos': 'R$ 1.926,65', maoDeObra: 'R$ 115,95', destaque: ['R$ 1.926,65/UN'] }],
    ['SIMPLES HÍBRIDO — com frete legado', regime('SIMPLES_HIBRIDO'), base({ taxPct: 6, deducaoBaseIbsCbsPct: 0.17 }), produto({ ibs_pct: 0.1, cbs_pct: 0.9, freight_value: 50 }),
        { 'Custo produto': 'R$ 1.046,73', 'Margem de contribuição aplicada': '54,780%', 'Valor do produto precificado': null, 'Total Operação Interna': 'R$ 1.910,79', 'Preço Final com Impostos': 'R$ 1.980,40', maoDeObra: 'R$ 115,95', destaque: ['R$ 1.980,40/UN'] }],
]

describe('A TRAVA DE PRODUTOS NO CONTENT — a tela inteira de Produtos, ao centavo, por regime, sem orçamento nenhum', () => {
    beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {}) })
    afterEach(() => jest.restoreAllMocks())
    it.each(CASOS)('%s', async (_nome, usuario, calcBase, product, esperado) => {
        const host = await montar({ isEditingMode: true, product, itemsFromApi: ITENS_DA_API, calcBase }, usuario)
        expect({ ...Object.fromEntries(ROTULOS.map((r) => [r, valor(host, r)])), maoDeObra: maoDeObra(host), destaque: destaque(host) }).toEqual(esperado)
    })
    it('e a trava enxerga: os casos não são todos iguais, e cada um tem o custo, a mão de obra e o destaque presentes', () => {
        for (const [, , , , e] of CASOS) { expect(e['Custo produto']).not.toBeNull(); expect(e.maoDeObra).not.toBeNull(); expect(e.destaque).toHaveLength(1) }
        expect(new Set(CASOS.map(([, , , , e]) => e.destaque[0])).size).toBeGreaterThan(4)
    })
})
