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
    FALTA_DA_UF, FALTA_DO_NCM, FRASE_CALCULO_INCOMPLETO, faltaDaAliquotaDoNcm,
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
    escritas: [] as Array<{ tabela: string; op: string }>,
    lidas: [] as string[],
}
function consulta(tabela: string) {
    banco.lidas.push(tabela)
    const resposta = () => Promise.resolve({ data: banco.respostas[tabela] ?? null, error: null })
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'or', 'in', 'limit', 'not', 'neq', 'ilike']) q[m] = () => q
    for (const op of ['update', 'insert', 'upsert', 'delete']) q[op] = () => { banco.escritas.push({ tabela, op }); return q }
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
        valor_venda: null, ncm_code: '7610.10.00', sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null,
        ...extra, itens,
    }
}

// ── Montar e ler ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const montados: Array<() => void> = []
afterEach(() => { while (montados.length) montados.pop()!() })
beforeEach(() => {
    mockCelular = false
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
    return (linha.lastElementChild?.textContent ?? '').replace(/ /g, ' ').trim()
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
        // o PIS/COFINS do orçamento é o do NCM (9,25%); o produto de referência, com 9,25%, é a mesma conta
        const produto = await montar({ isEditingMode: true, product: { ...PRODUTO_1008, pis_cofins_pct: 9.25 } as typeof PRODUTO_1008, itemsFromApi: ITENS_DA_API })
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
        // O CUSTO, ali, fica sem a mão de obra: o motor lê o segmento do tenant ("item produzido em tenant de revenda é combinação ainda
        // não definida pela regra", content.component). A reconciliação então NÃO fecha, e o preço não se grava — recusa, não número errado.
        const revenda = { ...USUARIO, calcType: 'RESALE' } as typeof USUARIO
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() }, revenda)
        expect(host.textContent).toContain('Itens do orçamento')
        expect(host.querySelector('[data-reconciliacao]')?.getAttribute('data-reconciliacao')).toBe('nao-fecha')
    })
    it('salvar grava NO ORÇAMENTO o preço que a tela formou, com o fiscal e os percentuais — e nada em products', async () => {
        const salvar = jest.fn(async (_: GravacaoDaPrecificacao): Promise<string[] | null> => null)
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: salvar })
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).toHaveBeenCalledTimes(1)
        const g = salvar.mock.calls[0][0]
        expect(g).toMatchObject({
            ncm_code: '7610.10.00', sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null,
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
    it('SEM NCM a precificação RECUSA nomeando a falta — e o PIS/COFINS não é zerado nem preenchido pela fórmula', async () => {
        const salvar = jest.fn()
        const host = await montar({ orcamento: orcamento({ ncm_code: null }), onSalvarOrcamento: salvar })
        expect(host.querySelector('[data-faltas-do-orcamento]')?.textContent).toContain(FALTA_DO_NCM)
        await clicar(botao(host, 'Salvar precificação do orçamento'))
        expect(salvar).not.toHaveBeenCalled()
        expect(host.querySelector('[data-recusas-do-orcamento]')?.textContent).toContain(FALTA_DO_NCM)
    })
    it('sem NCM nada preenche o PIS/COFINS: a margem é a do PIS/COFINS em zero, nunca a fórmula do ICMS', async () => {
        const semPis = await montar({ isEditingMode: true, product: { ...PRODUTO_1008, pis_cofins_pct: 0 } as typeof PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        const doOrcamento = await montar({ orcamento: orcamento({ ncm_code: null }), onSalvarOrcamento: jest.fn() })
        expect(valorDe(doOrcamento, 'Margem de contribuição aplicada')).toBe(valorDe(semPis, 'Margem de contribuição aplicada'))
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
    it('o NCM sem linha na tabela (Lucro Real): a alíquota é falta nomeada', async () => {
        banco.respostas.ncm_codes = null
        const host = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(host.querySelector('[data-faltas-do-orcamento]')?.textContent).toContain(faltaDaAliquotaDoNcm('7610.10.00'))
    })
    it('o PIS/COFINS do orçamento é o do NCM (9,25%), não a fórmula do ICMS (7,6775%): a margem é a do produto com 9,25%', async () => {
        const com925 = await montar({ isEditingMode: true, product: { ...PRODUTO_1008, pis_cofins_pct: 9.25 } as typeof PRODUTO_1008, itemsFromApi: ITENS_DA_API })
        const doOrcamento = await montar({ orcamento: orcamento(), onSalvarOrcamento: jest.fn() })
        expect(valorDe(doOrcamento, 'Margem de contribuição aplicada')).toBe(valorDe(com925, 'Margem de contribuição aplicada'))
        // e NÃO a do produto com a fórmula do ICMS (os números congelados, 7,6775%)
        expect(valorDe(doOrcamento, 'Margem de contribuição aplicada')).not.toBe(CONGELADO.mc)
    })
    it('a venda INTERESTADUAL sem UF é falta; o escopo e o comprador não informados também', async () => {
        const h1 = await montar({ orcamento: orcamento({ sale_scope: 'INTERESTADUAL', uf_destino: null }), onSalvarOrcamento: jest.fn() })
        expect(h1.querySelector('[data-faltas-do-orcamento]')?.textContent).toContain(FALTA_DA_UF)
        const h2 = await montar({ orcamento: orcamento({ sale_scope: null, buyer_type: null }), onSalvarOrcamento: jest.fn() })
        const faltas = h2.querySelector('[data-faltas-do-orcamento]')?.textContent ?? ''
        expect(faltas).toContain('o escopo da venda')
        expect(faltas).toContain('o tipo de comprador')
    })
})
