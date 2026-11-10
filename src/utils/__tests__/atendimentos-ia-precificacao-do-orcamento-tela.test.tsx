/**
 * PORTÃO — A PRECIFICAÇÃO FINAL DO ORÇAMENTO NA TELA DE PRODUTOS (o 1b, decisão 2 do dono do produto, 09/11/2026): "um modo 'orçamento' no
 * componente, sem segunda cópia da precificação", com as TRÊS travas que ele exigiu no PR da tela.
 *
 * Todo caso aqui RENDERIZA o `Content` de Produtos inteiro (com o `ProductPrice` de verdade) e lê o DOM: o que se afirma é o número que o
 * usuário vê, não a prop que chega.
 *
 *  (A) NÃO-REGRESSÃO DE DINHEIRO no caminho "produto": um produto com a forma do 1008 (dois itens com bruto e líquido, mão de obra em
 *      minutos, RT, comissão e lucro, ICMS 17%), com os TRÊS números de saída CONGELADOS — custo do produto, margem de contribuição aplicada e
 *      valor do produto precificado. Os números foram medidos com o `content.component.tsx` da `origin/main` de 09/11/2026 (antes do modo),
 *      e o modo novo não pode mudar nenhum deles.
 *  (B) A RECONCILIAÇÃO DA D2 SOBRE A TELA: o custo do produto que a TELA formou é a soma das linhas do orçamento (líquido + fabricação), ao
 *      centavo; e o contraste — a fabricação gravada com outro valor do minuto — não fecha, vira falta nomeada, e nada é gravado.
 *  (C) OS DOIS MODOS SÃO O MESMO CÁLCULO: o orçamento com o mesmo líquido, os mesmos minutos e os mesmos percentuais do produto mostra os
 *      mesmos três números. E cada modo fica no seu ramo: o produto não mostra nada do orçamento, o orçamento não toca em `products`.
 *  (D) "cálculo incompleto — recalcule"; a recusa nomeada sem NCM (nunca o PIS/COFINS zerado); a UF da venda interestadual.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
    FALTA_DA_REFERENCIA_DO_TENANT, FRASE_CALCULO_INCOMPLETO, faltaDaInternaDivergente,
    type GravacaoDaPrecificacao, type ItemNaPrecificacao, type OrcamentoNaPrecificacao,
} from '@/lib/atendimentos-ia/precificacao-do-orcamento'

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
// O `ProductPrice` é o de verdade em todo caso, MENOS quando `mockPrecoEmitido` está preenchido: aí ele emite esse preço e nada mais. É o único
// jeito de exercitar a recusa da interna DIVERGENTE do precificado — com a matriz governando (todos os regimes medidos), os dois coincidem.
let mockPrecoEmitido: import('@/page-parts/products/product-price.component').PrecoEmitido | null = null
jest.mock('@/page-parts/products/product-price.component', () => {
    const real = jest.requireActual('@/page-parts/products/product-price.component')
    const R = jest.requireActual('react')
    return {
        ...real,
        ProductPrice: (props: { onFinalPriceWithTaxesChange?: (d: unknown) => void }) => {
            R.useEffect(() => { if (mockPrecoEmitido) props.onFinalPriceWithTaxesChange?.(mockPrecoEmitido) })
            return mockPrecoEmitido ? null : R.createElement(real.ProductPrice, props)
        },
    }
})

/* eslint-disable @typescript-eslint/no-require-imports */
const { Content } = require('@/page-parts/products/content.component') as typeof import('@/page-parts/products/content.component')
const { FRASE_SEM_PRECO } = require('@/page-parts/atendimentos-ia/itens-precificados.component') as typeof import('@/page-parts/atendimentos-ia/itens-precificados.component')
const { TopoDoOrcamento, AvisoDoFiscalDivergente } = require('@/page-parts/atendimentos-ia/topo-do-orcamento.component') as typeof import('@/page-parts/atendimentos-ia/topo-do-orcamento.component')
const { fiscalDivergente, fraseDoFiscalDivergente } = require('@/lib/atendimentos-ia/precificacao-do-orcamento') as typeof import('@/lib/atendimentos-ia/precificacao-do-orcamento')
const { CAMPOS_DO_CLIENTE } = require('@/lib/atendimentos-ia/arquivo-do-orcamento') as typeof import('@/lib/atendimentos-ia/arquivo-do-orcamento')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── O cenário: a De Paula medida (Lucro Real, industrialização, 40.813,03 ÷ 52.800 min) ─────────────────────────────────────────
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
const MINUTOS_DA_EMPRESA = 52800
const VALOR_DO_MINUTO = CUSTO_MENSAL / MINUTOS_DA_EMPRESA

// ── (A) O produto com a forma do 1008: dois itens (bruto e líquido), 150 min de MO, RT 3, comissão 5, lucro 10, ICMS 17 ─────────────
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

/**
 * OS NÚMEROS CONGELADOS — medidos com o `content.component.tsx` da `origin/main` (09/11/2026), antes do modo "orçamento". Mudar qualquer
 * um é mudar o preço de 170 produtos vivos: quem precisar mudar traz a decisão do dono do produto, não ajusta o número.
 */
const CONGELADO = { custo: 'R$ 1.046,73', mc: '33,702%', precificado: 'R$ 3.105,80' }

// ── O orçamento: as esquadrias calculadas, com o mesmo líquido e os mesmos minutos do produto acima ──────────────────────────────
const LIQUIDO_TOTAL = 9 * 79.6 + 3.5 * 61.25 // 930,775 — o mesmo do produto
const item = (k: number, liquido: number, minutos: number, extra: Partial<ItemNaPrecificacao> = {}): ItemNaPrecificacao => ({
    id: `00000000-0000-4000-8000-00000000000${k}`, ordem: k, tipologia: 'DP-02', largura_mm: 1500, altura_mm: 1200, quantidade: 1,
    calculo_id: 'c-1', calculado_em: '2026-11-09T12:00:00.000Z', atualizado_em: '2026-11-09T12:00:00.000Z',
    custo_bruto_materiais: liquido * 1.2, custo_liquido_materiais: liquido, tempo_fabricacao_min: minutos, valor_minuto: VALOR_DO_MINUTO,
    custo_fabricacao: minutos * VALOR_DO_MINUTO, custo_liquido_total: liquido + minutos * VALOR_DO_MINUTO,
    ...extra,
})
const orcamento = (extra: Partial<OrcamentoNaPrecificacao> = {}): OrcamentoNaPrecificacao => {
    const itens = extra.itens ?? [item(1, 700, 90), item(2, LIQUIDO_TOTAL - 700, 60)]
    return {
        id: 'o-1', numero: 42, nome: 'Geronimo Silva', comissao_percentual: 5, reserva_tecnica_percentual: 3, lucro_projetado_percentual: 10,
        valor_total_bruto: itens.reduce((t, i) => t + (i.custo_bruto_materiais ?? 0) + (i.custo_fabricacao ?? 0), 0),
        valor_total_liquido: itens.reduce((t, i) => t + (i.custo_liquido_total ?? 0), 0),
        valor_venda: null, valor_operacao_interna: null, ncm_code: '7610.10.00', sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null,
        ...extra, itens,
    }
}

// ── Montar e ler ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const montados: Array<() => void> = []
afterEach(() => { while (montados.length) montados.pop()!() })
beforeEach(() => {
    mockCelular = false
    mockPrecoEmitido = null
    banco.escritas = []
    banco.lidas = []
    banco.respostas = {
        tenant_settings: { ibs_reference_pct: 0, cbs_reference_pct: 0, state_code: 'RS' },
        brazilian_states: { icms_internal_rate: 0.17 },
        // o NCM do orçamento na tabela: PIS 1,65% + COFINS 7,60% (não cumulativo)
        ncm_codes: { pis_rate_nao_cumulativo: 0.0165, cofins_rate_nao_cumulativo: 0.076 },
    }
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
function valorDe(host: HTMLElement, rotulo: string): string {
    const el = Array.from(host.querySelectorAll('span, div')).find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === rotulo)
    if (!el) throw new Error(`rótulo ausente: ${rotulo}`)
    let linha = el.parentElement as HTMLElement
    while (linha && linha.children.length < 2) linha = linha.parentElement as HTMLElement
    return (linha.lastElementChild?.textContent ?? '').replace(/\u00a0/g, ' ').trim()
}
const tresNumeros = (host: HTMLElement) => ({
    custo: valorDe(host, 'Custo produto'),
    mc: valorDe(host, 'Margem de contribuição aplicada'),
    precificado: valorDe(host, 'Valor do produto precificado'),
})
const reais = (s: string) => Number(s.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'))
const botao = (host: HTMLElement, texto: string) =>
    Array.from(host.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === texto) as HTMLButtonElement | undefined
async function clicar(b: HTMLButtonElement | undefined) {
    if (!b) throw new Error('botão ausente')
    await act(async () => { b.click() })
    await esperar()
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('(A) NÃO-REGRESSÃO DE DINHEIRO — o caminho "produto", com a forma do 1008, sai com os números de antes do modo', () => {
    it('custo do produto, margem de contribuição aplicada e valor do produto precificado: os CONGELADOS', async () => {
        const host = await montar({ isEditingMode: true, product: PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        expect(tresNumeros(host)).toEqual(CONGELADO)
    })
    it('o produto não mostra nada do orçamento: título, itens editáveis, o "Incluir", e nenhum aviso de orçamento', async () => {
        const host = await montar({ isEditingMode: true, product: PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        expect(host.textContent).toContain('Itens do produto')
        expect(botao(host, 'Incluir')).toBeDefined()
        expect(host.querySelector('[data-avisos-do-orcamento]')).toBeNull()
        expect(host.querySelector('[data-cabecalho-do-orcamento]')).toBeNull()
        expect(host.textContent).not.toContain('Salvar precificação do orçamento')
        const minutos = host.querySelector('input[name="productWorkloadInMinutes"]') as HTMLInputElement
        expect(minutos.readOnly).toBe(false)
    })
    it('com a margem acabando, o produto grava o preço que EXIBE — como na main (a correção de Produtos é PR próprio)', async () => {
        // O caso discrimina o aviso de "preço não formado" passado ao produto: com IBS/CBS por fora, o preço exibido (e emitido) não é o
        // do motor; se o produto zerasse o emitido, gravaria o do motor. NÃO afirma que o número está certo: é o comportamento medido na
        // main em 09/11/2026 (o defeito de produção registrado pelo dono do produto), e este PR não o muda.
        const p = { ...PRODUTO_1008, profit_percent: 50, ibs_pct: 1, cbs_pct: 9,
            productPriceInfo: { ...(PRODUTO_1008 as unknown as { productPriceInfo: object }).productPriceInfo, productProfitPercent: 50 } } as unknown as typeof PRODUTO_1008
        const host = await montar({ isEditingMode: true, product: p, itemsFromApi: ITENS_DA_API })
        const exibido = Array.from(host.querySelectorAll('div')).find((d) => d.children.length === 0 && (d.textContent ?? '').trim() === 'Preço de Venda por Unidade')
        const preco = reais((exibido?.parentElement?.parentElement?.querySelector('div[style*="font-size: 28px"]')?.textContent ?? '').replace(/\/.*$/, ''))
        await clicar(botao(host, 'Salvar alterações'))
        const gravados = banco.escritas.filter((e) => e.tabela === 'products').map((e) => (e.carga as { sale_price?: number })?.sale_price).filter((v) => v !== undefined)
        expect(preco).toBeGreaterThan(0)
        expect(gravados.length).toBeGreaterThan(0)
        for (const v of gravados) expect(v).toBeCloseTo(preco, 2)
    })
    it('o salvar do produto continua indo a products — e não ao caminho do orçamento', async () => {
        const host = await montar({ isEditingMode: true, product: PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        await clicar(botao(host, 'Salvar alterações'))
        expect(banco.escritas.some((e) => e.tabela === 'products' && e.op === 'update')).toBe(true)
    })
})

describe('(B) A RECONCILIAÇÃO DA D2 SOBRE A TELA — o custo que a tela formou é a soma das linhas do orçamento', () => {
    it('fecha ao centavo: custo do produto na tela == Σ (líquido + fabricação) dos itens', async () => {
        const o = orcamento()
        const host = await montar({ orcamento: o, onSalvarOrcamento: jest.fn() })
        const soma = o.itens.reduce((t, i) => t + (i.custo_liquido_materiais as number) + (i.custo_fabricacao as number), 0)
        expect(Math.abs(reais(valorDe(host, 'Custo produto')) - soma)).toBeLessThanOrEqual(0.01)
        expect(host.querySelector('[data-reconciliacao]')?.getAttribute('data-reconciliacao')).toBe('fecha')
        expect(host.querySelector('[data-faltas-do-orcamento]')).toBeNull()
    })
    it('CONTRASTE: a fabricação gravada com outro valor do minuto NÃO fecha, vira falta, e nada é gravado', async () => {
        const outroMinuto = VALOR_DO_MINUTO * 1.1
        const o = orcamento({ itens: [item(1, 700, 90, { custo_fabricacao: 90 * outroMinuto, custo_liquido_total: 700 + 90 * outroMinuto })] })
        const salvar = jest.fn()
        const host = await montar({ orcamento: o, onSalvarOrcamento: salvar })
        expect(host.querySelector('[data-reconciliacao]')?.getAttribute('data-reconciliacao')).toBe('nao-fecha')
        expect(host.querySelector('[data-faltas-do-orcamento]')?.textContent).toContain('a mão de obra ou o material mudou depois do cálculo')
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).not.toHaveBeenCalled()
    })
})

describe('(C) OS DOIS MODOS SÃO O MESMO CÁLCULO, e cada um fica no seu ramo', () => {
    it('o orçamento com o mesmo líquido, os mesmos minutos, os mesmos percentuais e o mesmo PIS/COFINS do produto mostra os MESMOS três números', async () => {
        // o PIS/COFINS do orçamento é o da EMPRESA (11/11/2026): 9,25% × (1 − ICMS 17% do RS) = 7,6775%, o mesmo do produto de referência
        const produto = await montar({ isEditingMode: true, product: { ...PRODUTO_1008, pis_cofins_pct: 7.6775 } as typeof PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        const doOrcamento = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(tresNumeros(doOrcamento)).toEqual(tresNumeros(produto))
        expect(tresNumeros(doOrcamento).custo).toBe(CONGELADO.custo)
    })
    it('a entrada do orçamento é o LÍQUIDO e os MINUTOS: com outro líquido o custo muda, e pelo líquido', async () => {
        const host = await montar({ orcamento: orcamento({ itens: [item(1, 1000, 150)] }), onSalvarOrcamento: jest.fn() })
        expect(reais(valorDe(host, 'Custo produto'))).toBeCloseTo(1000 + Math.round(150 * VALOR_DO_MINUTO * 100) / 100, 2)
    })
    it('o cabeçalho é o do orçamento, fixo e só leitura: código = o número, o cliente, Produzido, UN, Orçamentos I.A.', async () => {
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(host.textContent).toContain('Precificação do orçamento 42')
        expect(host.querySelector('[data-tipo-do-orcamento]')?.textContent).toContain('Produzido')
        const campo = (rotulo: string) => host.querySelector(`input[aria-label="${rotulo}"]`) as HTMLInputElement
        expect(campo('Código').value).toBe('42')
        expect(campo('Cliente').value).toBe('Geronimo Silva')
        expect(campo('Seção').value).toBe('Orçamentos I.A.')
        expect(campo('Unidade de Medida').value).toBe('UN')
        for (const r of ['Código', 'Cliente', 'Seção', 'Unidade de Medida']) expect(campo(r).disabled).toBe(true)
    })
    it('os itens são as esquadrias, só leitura: sem o "Incluir", e os minutos da fabricação travados', async () => {
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(host.textContent).toContain('Itens do orçamento')
        expect(host.textContent).toContain('Esquadria 1 — DP-02 1500 x 1200 mm')
        expect(botao(host, 'Incluir')).toBeUndefined()
        const minutos = host.querySelector('input[name="productWorkloadInMinutes"]') as HTMLInputElement
        expect(minutos.readOnly).toBe(true)
        expect(minutos.value).toBe('150')
        // as colunas são as do orçamento (bruto, líquido, fabricação, total), sem editar quantidade nem excluir item
        const cabecalhos = Array.from(host.querySelectorAll('thead th')).map((t) => (t.textContent ?? '').trim())
        expect(cabecalhos).toEqual(expect.arrayContaining(['Esquadria', 'Quantidade', 'Bruto', 'Líquido', 'Fabricação', 'Total']))
        expect(host.querySelector('button[aria-label="Excluir"]')).toBeNull()
    })
    it('no celular os minutos do orçamento também ficam travados', async () => {
        mockCelular = true
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        const minutos = host.querySelector('input[name="productWorkloadInMinutes"]') as HTMLInputElement
        expect(minutos.readOnly).toBe(true)
    })
    it('num tenant de REVENDA o orçamento continua PRODUZIDO (os itens do orçamento, não a revenda)', async () => {
        // O CUSTO, ali, fica sem a mão de obra: o motor lê o calcType do tenant ("item produzido em tenant de revenda é combinação ainda
        // não definida pela regra", content.component). A reconciliação então NÃO fecha, e o preço não se grava — recusa, não número errado.
        const revenda = { ...USUARIO, calcType: 'RESALE' } as typeof USUARIO
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() }, revenda)
        expect(host.textContent).toContain('Itens do orçamento')
        expect(host.querySelector('[data-reconciliacao]')?.getAttribute('data-reconciliacao')).toBe('nao-fecha')
    })
    it('salvar grava NO ORÇAMENTO o preço que a tela formou, com o fiscal e os percentuais — e nada em products', async () => {
        const salvar = jest.fn<Promise<string[] | null>, [GravacaoDaPrecificacao]>(async () => null)
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: salvar })
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).toHaveBeenCalledTimes(1)
        const g = salvar.mock.calls[0][0]
        expect(g).toMatchObject({
            ncm_code: null, sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null,
            comissao_percentual: 5, reserva_tecnica_percentual: 3, lucro_projetado_percentual: 10,
        })
        // o valor gravado é o "Preço de Venda por Unidade" que a tela exibe — o mesmo número que Produtos grava em sale_price
        const exibido = Array.from(host.querySelectorAll('div')).find((d) => d.children.length === 0 && (d.textContent ?? '').trim() === 'Preço de Venda por Unidade')
        const preco = reais((exibido?.parentElement?.parentElement?.querySelector('div[style*="font-size: 28px"]')?.textContent ?? '').replace(/\/.*$/, ''))
        expect(preco).toBeGreaterThan(0)
        expect(g.valor_venda).toBeCloseTo(preco, 2)
        expect(banco.escritas.filter((e) => e.tabela === 'products' || e.tabela === 'product_items' || e.tabela === 'stock')).toEqual([])
    })
})

describe('(D) AS FALTAS NOMEADAS — nada se grava com falta', () => {
    it('"cálculo incompleto — recalcule": item com cálculo e o orçamento sem os totais; o botão recalcula', async () => {
        const recalcular = jest.fn(async () => {})
        const salvar = jest.fn()
        const host = await montar({ orcamento: orcamento({ valor_total_bruto: null, valor_total_liquido: null }), onSalvarOrcamento: salvar, onRecalcularOrcamento: recalcular })
        const aviso = host.querySelector('[data-estado-do-calculo]')
        expect(aviso?.getAttribute('data-estado-do-calculo')).toBe('incompleto')
        expect(aviso?.textContent).toContain(FRASE_CALCULO_INCOMPLETO)
        await clicar(botao(host, 'Recalcular'))
        expect(recalcular).toHaveBeenCalledTimes(1)
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).not.toHaveBeenCalled()
    })
    it('SEM NCM (11/11/2026) a precificação SALVA: o NCM não bloqueia nada, e vai NULO', async () => {
        const salvar = jest.fn(async (): Promise<string[] | null> => null)
        const host = await montar({ orcamento: orcamento({ ncm_code: null }), onSalvarOrcamento: salvar })
        expect(host.querySelector('[data-faltas-do-orcamento]')).toBeNull()
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).toHaveBeenCalledTimes(1)
        expect((salvar.mock.calls[0] as unknown[])[0]).toMatchObject({ ncm_code: null })
    })
    it('sem NCM o PIS/COFINS é o da REFERÊNCIA DO TENANT (Lucro Real, ICMS do RS 17%): 9,25% × (1 − 17%), a mesma margem do produto com 7,6775%', async () => {
        const comReferencia = await montar({ isEditingMode: true, product: { ...PRODUTO_1008, pis_cofins_pct: 7.6775 } as typeof PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        const semPis = await montar({ isEditingMode: true, product: { ...PRODUTO_1008, pis_cofins_pct: 0 } as typeof PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        const doOrcamento = await montar({ orcamento: orcamento({ ncm_code: null }), onSalvarOrcamento: jest.fn() })
        expect(valorDe(doOrcamento, 'Margem de contribuição aplicada')).toBe(valorDe(comReferencia, 'Margem de contribuição aplicada'))
        expect(valorDe(doOrcamento, 'Margem de contribuição aplicada')).not.toBe(valorDe(semPis, 'Margem de contribuição aplicada'))
    })
    it('sem NCM e SEM a referência do tenant (a UF não cadastrada): a falta nomeada, e nada se grava — nunca um zero inventado', async () => {
        banco.respostas.tenant_settings = { ibs_reference_pct: 0, cbs_reference_pct: 0, state_code: null }
        const salvar = jest.fn()
        const host = await montar({ orcamento: orcamento({ ncm_code: null }), onSalvarOrcamento: salvar })
        expect(host.querySelector('[data-faltas-do-orcamento]')?.textContent).toContain(FALTA_DA_REFERENCIA_DO_TENANT)
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).not.toHaveBeenCalled()
    })
    it('a UF cadastrada mas sem ICMS interno também é falta da referência', async () => {
        banco.respostas.brazilian_states = { icms_internal_rate: null }
        const host = await montar({ orcamento: orcamento({ ncm_code: null }), onSalvarOrcamento: jest.fn() })
        expect(host.querySelector('[data-faltas-do-orcamento]')?.textContent).toContain(FALTA_DA_REFERENCIA_DO_TENANT)
    })
    it('o orçamento SEM preço e sem fiscal (o orçamento 1) abre no PRESET e grava INTRAESTADUAL e CONSUMIDOR_FINAL', async () => {
        const salvar = jest.fn(async (): Promise<string[] | null> => null)
        const host = await montar({ orcamento: orcamento({ ncm_code: null, sale_scope: null, buyer_type: null }), onSalvarOrcamento: salvar })
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).toHaveBeenCalledTimes(1)
        expect((salvar.mock.calls[0] as unknown[])[0]).toMatchObject({ sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null, ncm_code: null })
    })
    it.each([
        ['o motor recusa (lucro 95%)', 95],
        ['o motor forma e a margem com ICMS e PIS/COFINS acaba (lucro 50%)', 50],
    ])('o preço que não se forma não se grava, nem o de antes: %s', async (_, lucro) => {
        const salvar = jest.fn()
        const host = await montar({ orcamento: orcamento({ lucro_projetado_percentual: lucro }), onSalvarOrcamento: salvar })
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).not.toHaveBeenCalled()
        expect(host.querySelector('[data-recusas-do-orcamento]')?.textContent).toContain('o preço formado')
    })
    it('o PIS/COFINS do orçamento é SEMPRE o da empresa (7,6775%), mesmo com um NCM gravado nele: a tabela de NCM não é lida (11/11/2026)', async () => {
        const com925 = await montar({ isEditingMode: true, product: { ...PRODUTO_1008, pis_cofins_pct: 9.25 } as typeof PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        banco.lidas = []
        const doOrcamento = await montar({ orcamento: orcamento({ ncm_code: '7610.10.00' }), onSalvarOrcamento: jest.fn() })
        expect(valorDe(doOrcamento, 'Margem de contribuição aplicada')).toBe(CONGELADO.mc)
        expect(valorDe(doOrcamento, 'Margem de contribuição aplicada')).not.toBe(valorDe(com925, 'Margem de contribuição aplicada'))
        expect(banco.lidas).not.toContain('ncm_codes')
    })
})

describe('(F) A EMPRESA É A FONTE ÚNICA DOS IMPOSTOS, e o fiscal é invisível (dono do produto, 11/11/2026)', () => {
    it('o bloco Fiscal SAI do orçamento — NCM, "Onde vende?", tipo de comprador e UF não são montados; no produto continuam', async () => {
        const doOrcamento = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        for (const t of ['Contexto da Venda', 'Onde vende?', 'Tipo de comprador', 'Estado de destino']) expect(doOrcamento.textContent).not.toContain(t)
        expect(doOrcamento.querySelector('input[id$="ncm_code"]')).toBeNull()
        const doProduto = await montar({ product: PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        expect(doProduto.textContent).toContain('Onde vende?')
        expect(doProduto.querySelector('input[id$="ncm_code"]')).not.toBeNull()
    })
    const linha = (host: HTMLElement, rotulo: string) =>
        Array.from(host.querySelectorAll('tr')).find((tr) => Array.from(tr.querySelectorAll('td')).some((td) => (td.textContent ?? '').trim() === rotulo)) as HTMLElement | undefined
    it('ICMS e PIS/COFINS são os da empresa, SÓ LEITURA no orçamento; no produto continuam editáveis', async () => {
        const doOrcamento = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        for (const r of ['ICMS (%)', 'PIS/Cofins (%)']) {
            const tr = linha(doOrcamento, r)
            expect(tr).toBeDefined()
            expect(tr!.querySelector('input')).toBeNull()
        }
        const doProduto = await montar({ isEditingMode: true, product: PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        expect(linha(doProduto, 'ICMS (%)')?.querySelector('input')).not.toBeNull()
    })
    it('IBS ZERO aparece e entra como zero; CBS NULO não aparece nem entra — e nenhum dos dois impede o preço', async () => {
        banco.respostas.tenant_settings = { ibs_reference_pct: 0, cbs_reference_pct: null, state_code: 'RS' }
        const salvar = jest.fn(async (): Promise<string[] | null> => null)
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: salvar })
        expect(host.textContent).toContain('IBS — Imposto sobre Bens e Serv. (%)')
        expect(host.textContent).not.toContain('CBS — Contrib. sobre Bens e Serv. (%)')
        // o campo do IBS existe, com o valor da empresa, e não se edita
        const ibs = Array.from(host.querySelectorAll('div')).find((d) => d.children.length === 0 && (d.textContent ?? '').trim() === 'IBS — Imposto sobre Bens e Serv. (%)')
        const campo = ibs?.parentElement?.querySelector('input') as HTMLInputElement
        expect(campo.disabled).toBe(true)
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).toHaveBeenCalledTimes(1)
    })
    it('com a referência da empresa preenchida, a CBS também aparece (o nulo é o que some, não o zero)', async () => {
        banco.respostas.tenant_settings = { ibs_reference_pct: 0, cbs_reference_pct: 0, state_code: 'RS' }
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(host.textContent).toContain('CBS — Contrib. sobre Bens e Serv. (%)')
    })
    it('o TOPO do orçamento: os nove campos do cliente com os rótulos do PDF, e o campo sem dado EM BRANCO (nunca zero, nunca escondido)', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const root = createRoot(host)
        // eslint-disable-next-line testing-library/no-unnecessary-act -- a raiz do React 19 monta aqui, sem a testing-library (como em `montar`)
        act(() => {
            root.render(<TopoDoOrcamento cliente={{ nome: 'Geraldo Huck', telFixo: null, celular: '(51) 99999-0000', email: null, tel2: null, endereco: 'Porto Alegre', ieRg: null, cep: null, cnpjCpf: null }} />)
        })
        montados.push(() => { act(() => root.unmount()); host.remove() })
        const campos = Array.from(host.querySelectorAll('[data-campo-do-cliente]'))
        expect(campos.map((c) => c.getAttribute('data-campo-do-cliente'))).toEqual(CAMPOS_DO_CLIENTE.map(([, k]) => k))
        expect(campos.map((c) => c.firstElementChild?.textContent)).toEqual(CAMPOS_DO_CLIENTE.map(([r]) => r))
        const valor = (k: string) => host.querySelector(`[data-campo-do-cliente="${k}"] [data-valor-do-cliente]`)?.textContent
        expect(valor('nome')).toBe('Geraldo Huck')
        expect(valor('celular')).toBe('(51) 99999-0000')
        for (const k of ['telFixo', 'email', 'tel2', 'ieRg', 'cep', 'cnpjCpf']) expect(valor(k)).toBe('')
    })
})

describe('(G) A CHAVE É O SEGMENTO: só o orçamento DE INDUSTRIALIZAÇÃO leva os tributos da empresa (dono do produto, 11/11/2026)', () => {
    it('um orçamento de REVENDA NÃO herda "imposto da empresa": o bloco Fiscal fica, o ICMS se edita, e a referência da empresa não é cobrada', async () => {
        // sem a UF da empresa: no orçamento de industrialização isto seria falta nomeada (seção F); na revenda, não é cobrado
        banco.respostas.tenant_settings = { ibs_reference_pct: 0, cbs_reference_pct: null, state_code: null }
        const host = await montar({ orcamento: orcamento(), prefill: { productType: 'REVENDA' }, onSalvarOrcamento: jest.fn() })
        expect(host.textContent).toContain('Onde vende?')
        expect(host.querySelector('[data-faltas-do-orcamento]')?.textContent ?? '').not.toContain(FALTA_DA_REFERENCIA_DO_TENANT)
        const icms = Array.from(host.querySelectorAll('tr')).find((tr) => Array.from(tr.querySelectorAll('td')).some((td) => (td.textContent ?? '').trim() === 'ICMS (%)'))
        expect(icms?.querySelector('input')).not.toBeNull()
    })
    it('e o de INDUSTRIALIZAÇÃO, com a mesma empresa sem UF: a falta da referência aparece e o bloco Fiscal não', async () => {
        banco.respostas.tenant_settings = { ibs_reference_pct: 0, cbs_reference_pct: null, state_code: null }
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(host.textContent).not.toContain('Onde vende?')
        expect(host.querySelector('[data-faltas-do-orcamento]')?.textContent).toContain(FALTA_DA_REFERENCIA_DO_TENANT)
    })
    it('o AVISO do fiscal divergente diz o que está gravado e que o salvar volta ao preset; sem divergência, não aparece', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const root = createRoot(host)
        const d = fiscalDivergente({ sale_scope: 'INTERESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: 'SP', ncm_code: null })
        // eslint-disable-next-line testing-library/no-unnecessary-act -- a raiz do React 19 monta aqui, sem a testing-library (como em `montar`)
        act(() => { root.render(<><AvisoDoFiscalDivergente divergencia={d} /><div data-vazio=""><AvisoDoFiscalDivergente divergencia={[]} /></div></>) })
        montados.push(() => { act(() => root.unmount()); host.remove() })
        const aviso = host.querySelector('[data-fiscal-divergente]')?.textContent ?? ''
        expect(aviso).toBe(fraseDoFiscalDivergente(d))
        expect(aviso).toContain('o escopo da venda INTERESTADUAL')
        expect(aviso).toContain('a UF de destino SP')
        expect(aviso).toContain('volta ao padrão')
        expect(host.querySelector('[data-vazio]')?.innerHTML).toBe('')
    })
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('(E) AS DECISÕES DE 11/11/2026 — a interna gravada, a faixa dos itens precificados e a mão de obra sem valor', () => {
    const ITENS_DO_ARQUIVO: import('@/lib/atendimentos-ia/arquivo-do-orcamento').ItemDoArquivo[] = [
        { ordem: 1, quantidade: 1, largura_mm: 1500, altura_mm: 1200, tipologia: 'DP-02', descricao: 'JANELA DE CORRER', tipo: 'Janela', fornecedor: 'Wolf', linha: 'EUROPA 42',
          ambientes: 'Sala (1)', corPerfil: 'Branco', corAcessorio: 'Branco', vidro: 'incolor 4 mm comum', variaveis: ['ARREMATE INTERNO: 65 mm'], obs: null, desenho: null },
        { ordem: 2, quantidade: 1, largura_mm: 600, altura_mm: 600, tipologia: 'DP-01', descricao: 'MAXIM-AR', tipo: 'Janela', fornecedor: 'Wolf', linha: 'DESIGN',
          ambientes: null, corPerfil: 'Branco', corAcessorio: null, vidro: 'mini boreal', variaveis: [], obs: null, desenho: null },
    ]
    it('o salvar leva a OPERAÇÃO INTERNA que a tela mostrou, ao centavo — e, com a matriz governando, ela é o valor do produto precificado', async () => {
        const salvar = jest.fn<Promise<string[] | null>, [GravacaoDaPrecificacao]>(async () => null)
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: salvar })
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).toHaveBeenCalledTimes(1)
        const g = salvar.mock.calls[0][0]
        expect(g.valor_operacao_interna).toBe(reais(valorDe(host, 'Valor do produto precificado')))
        expect(g.valor_operacao_interna).toBeGreaterThan(0)
        expect(Math.round(g.valor_operacao_interna * 100)).toBeLessThanOrEqual(Math.round(g.valor_venda * 100))
    })
    it('a ÚLTIMA faixa antes do salvar: os itens com as variáveis, precificados um a um pelo rateio exato, e o total = a interna', async () => {
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn(), itensDoArquivo: ITENS_DO_ARQUIVO })
        const faixa = host.querySelector('[data-itens-precificados]') as HTMLElement
        expect(faixa).not.toBeNull()
        // é a última coisa antes do botão
        const botaoSalvar = botao(host, 'Salvar precificação do orçamento') as HTMLButtonElement
        expect(faixa.compareDocumentPosition(botaoSalvar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(faixa.querySelector('[data-item-precificado="1"] [data-variaveis-do-item]')?.textContent).toBe('ARREMATE INTERNO: 65 mm')
        const valores = Array.from(faixa.querySelectorAll('[data-valor-do-item] strong')).map((e) => reais(e.textContent ?? ''))
        expect(valores).toHaveLength(2)
        const total = reais(faixa.querySelector('[data-total-dos-itens]')?.lastElementChild?.textContent ?? '')
        expect(Math.round(valores.reduce((a, b) => a + b, 0) * 100)).toBe(Math.round(total * 100))
        expect(total).toBe(reais(valorDe(host, 'Valor do produto precificado')))
    })
    it('no ORÇAMENTO a linha da mão de obra é só o tempo total, em minutos, sem valor; no PRODUTO o valor continua', async () => {
        const doOrcamento = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(doOrcamento.textContent).toContain('Tempo total de produção da obra')
        expect(doOrcamento.querySelector('[data-valor-da-mao-de-obra]')?.textContent).toBe('')
        const doProduto = await montar({ product: PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        expect(doProduto.querySelector('[data-valor-da-mao-de-obra]')?.textContent).toMatch(/^R\$ [\d.]+,\d{2}$/)
    })
    it('NO CELULAR também: o orçamento não mostra o valor da mão de obra; o produto mostra', async () => {
        mockCelular = true
        const doOrcamento = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(doOrcamento.textContent).toContain('Tempo total de produção da obra')
        expect(doOrcamento.querySelector('[data-valor-da-mao-de-obra]')?.textContent ?? '').not.toMatch(/R\$/)
        const doProduto = await montar({ product: PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        expect(doProduto.querySelector('[data-valor-da-mao-de-obra]')?.textContent).toMatch(/R\$ [\d.]+,\d{2}/)
    })
    it('SEM preço formado a faixa diz isso, e não mostra valor nem total — nunca zero', async () => {
        const host = await montar({ orcamento: orcamento({ lucro_projetado_percentual: 95 }), onSalvarOrcamento: jest.fn(), itensDoArquivo: ITENS_DO_ARQUIVO })
        const faixa = host.querySelector('[data-itens-precificados]') as HTMLElement
        expect(faixa.querySelector('[data-sem-preco]')?.textContent).toBe(FRASE_SEM_PRECO)
        expect(faixa.querySelector('[data-total-dos-itens]')).toBeNull()
        expect(faixa.textContent).not.toMatch(/R\$/)
    })
    it('a interna DIVERGENTE do valor precificado em mais de um centavo: o salvar recusa nomeando, e nada vai à rota', async () => {
        mockPrecoEmitido = { finalPrice: 3000, basePrice: 3000, externalOpsCoefficient: null, operacaoInterna: 2900, valorPrecificado: 2950 }
        const salvar = jest.fn()
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: salvar })
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).not.toHaveBeenCalled()
        expect(host.querySelector('[data-recusas-do-orcamento]')?.textContent).toContain(faltaDaInternaDivergente(2900, 2950))
        mockPrecoEmitido = { finalPrice: 3000, basePrice: 3000, externalOpsCoefficient: null, operacaoInterna: 2900, valorPrecificado: 2900.01 }
        const salvar2 = jest.fn(async (): Promise<string[] | null> => null)
        const host2 = await montar({ orcamento: orcamento(), onSalvarOrcamento: salvar2 })
        await clicar(botao(host2, 'Salvar precificação do orçamento'))
        expect(salvar2).toHaveBeenCalledTimes(1)
        expect((salvar2.mock.calls[0] as unknown[])[0]).toMatchObject({ valor_venda: 3000, valor_operacao_interna: 2900 })
    })
})
