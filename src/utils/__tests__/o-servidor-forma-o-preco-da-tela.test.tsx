/**
 * PORTÃO PERMANENTE — O SERVIDOR FORMA O PREÇO DA TELA (dono do produto, 11/11/2026, condição (c) da cadeia do "sim": "NO third copy: the server
 * uses the same modules; the permanent test servidor = tela; a one-cent mutation that must die").
 *
 * Cada caso RENDERIZA o `Content` de Produtos inteiro no modo orçamento (com o `ProductPrice` de verdade), clica em "Salvar precificação do
 * orçamento" e captura o que a TELA mandaria gravar; depois chama `formarPrecoDoOrcamento` — o que o agente grava — com a MESMA empresa (o
 * mesmo usuário, o mesmo `calcBase`, o ICMS da UF e o IBS/CBS que o banco falso deu à tela). A igualdade é EXATA (`toEqual` dos números
 * crus): os dois lados passam pelos mesmos módulos, então um centavo de diferença em qualquer entrada (o PIS/COFINS da referência, um
 * percentual, o IBS que entrou como zero em vez de não entrar) aparece aqui.
 *
 * Quando a tela RECUSA, o servidor recusa com as mesmas frases, e nada é gravado de nenhum dos lados.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
    FALTA_DA_REFERENCIA_DO_TENANT, PRESET_DA_COMERCIALIZACAO,
    type GravacaoDaPrecificacao, type ItemNaPrecificacao, type OrcamentoNaPrecificacao,
} from '@/lib/atendimentos-ia/precificacao-do-orcamento'
import { formarPrecoDoOrcamento, FALTA_DA_CARGA_HORARIA, type EmpresaDoPreco } from '@/lib/atendimentos-ia/preco-do-orcamento'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: false, media: query, onchange: null as unknown,
        addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

// ── O banco falso do navegador (o mesmo desenho do teste da tela do orçamento) ────────────────────────────────────────────────────
const banco = { respostas: {} as Record<string, unknown>, escritas: [] as Array<{ tabela: string; op: string }> }
function consulta(tabela: string) {
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
    supabase: { from: (t: string) => consulta(t), functions: { invoke: async (): Promise<unknown> => ({ data: null, error: null }) } },
}))
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), query: {} }) }))
jest.mock('@/utils/get-tenant-id', () => ({ getTenantId: async () => 'tenant-1', getCurrentUserId: async () => 'usuario-1' }))
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))
jest.mock('@/page-parts/shared/classificacao-fiscal-block.component', () => ({ __esModule: true, default: (): null => null }))

/* eslint-disable @typescript-eslint/no-require-imports */
const { Content } = require('@/page-parts/products/content.component') as typeof import('@/page-parts/products/content.component')
/* eslint-enable @typescript-eslint/no-require-imports */

type Usuario = import('@/types/logged-user.type').LoggedUser
type CalcBase = import('@/types/calc-base.type').CalcBaseType

// ── A empresa: a De Paula medida (Lucro Real, industrialização, 40.813,03 ÷ 52.800 min), e as variações por regime ───────────────
const CUSTO_MENSAL = 40813.03
const usuario = (extra: Partial<Usuario> = {}) => ({
    tenant_id: 'tenant-1', taxableRegime: 'LUCRO_REAL', calcType: 'INDUSTRIALIZATION',
    monthlyWorkloadInMinutes: 220, unitMeasure: 'HOURS', numProductiveSectorEmployee: 4, taxableRegimeValue: 0, ...extra,
}) as unknown as Usuario
const calcBase = (extra: Partial<CalcBase> = {}) => ({
    laborCostMonthly: CUSTO_MENSAL, adminLaborCostMonthly: 9000, fixedExpenseMonthly: 15000, laborPercent: 0,
    indirectLaborPct: 4, fixedExpensePct: 10.39, financialCommitmentsPct: 0, variableExpensePct: 6.41, financialExpensePct: 0.42,
    structurePct: 17.22, taxPct: 0, taxLabel: '', isMei: false, productiveValuePerMinute: 0, monthlyWorkloadMinutes: 0, ...extra,
}) as unknown as CalcBase
const VALOR_DO_MINUTO = CUSTO_MENSAL / 52800

const item = (k: number, liquido: number, minutos: number, quantidade = 1): ItemNaPrecificacao => ({
    id: `00000000-0000-4000-8000-00000000000${k}`, ordem: k, tipologia: 'DP-02', largura_mm: 1500, altura_mm: 1200, quantidade,
    calculo_id: 'c-1', calculado_em: '2026-11-09T12:00:00.000Z', atualizado_em: '2026-11-09T12:00:00.000Z',
    custo_bruto_materiais: liquido * 1.2, custo_liquido_materiais: liquido, tempo_fabricacao_min: minutos, valor_minuto: VALOR_DO_MINUTO,
    custo_fabricacao: minutos * VALOR_DO_MINUTO, custo_liquido_total: liquido + minutos * VALOR_DO_MINUTO,
})
// o Geraldo Huck da prova local (líquido 5.240,40 em três linhas, uma delas com duas unidades)
const ITENS_DO_GERALDO = [item(1, 2593.18, 240), item(2, 421.04, 60), item(3, 1112.09, 150, 2)]
const orcamento = (extra: Partial<OrcamentoNaPrecificacao> = {}): OrcamentoNaPrecificacao => {
    const itens = extra.itens ?? ITENS_DO_GERALDO
    return {
        id: 'o-1', numero: 1, nome: 'Geraldo Huck', comissao_percentual: 5, reserva_tecnica_percentual: 0, lucro_projetado_percentual: 20,
        valor_total_bruto: itens.reduce((t, i) => t + (i.custo_bruto_materiais ?? 0) + (i.custo_fabricacao ?? 0), 0),
        valor_total_liquido: itens.reduce((t, i) => t + (i.custo_liquido_total ?? 0), 0),
        valor_venda: null, valor_operacao_interna: null, ncm_code: null, sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null,
        ...extra, itens,
    }
}

// ── Montar a tela, salvar e ler o que ela gravaria ─────────────────────────────────────────────────────────────────────────────
const montados: Array<() => void> = []
afterEach(() => { while (montados.length) montados.pop()!() })
const esperar = async () => { for (let k = 0; k < 6; k++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const mensagens = () => ({ success: jest.fn(), error: jest.fn(), open: jest.fn(), warning: jest.fn() }) as unknown as import('antd/es/message/interface').MessageInstance

type Cenario = { usuario: Usuario; calcBase: CalcBase; orcamento: OrcamentoNaPrecificacao; uf: string | null; icmsDaUf: number | null; ibs: number | null; cbs: number | null }
const cenario = (extra: Partial<Cenario> = {}): Cenario => ({
    usuario: usuario(), calcBase: calcBase(), orcamento: orcamento(), uf: 'RS', icmsDaUf: 17, ibs: 0.1, cbs: 0.9, ...extra,
})

/** O que a TELA faz no cenário: a gravação que ela mandaria, ou as recusas que ela mostra (e nada gravado). */
async function naTela(c: Cenario): Promise<{ gravacao: GravacaoDaPrecificacao } | { recusas: string[] }> {
    banco.escritas = []
    banco.respostas = {
        tenant_settings: { ibs_reference_pct: c.ibs, cbs_reference_pct: c.cbs, state_code: c.uf },
        brazilian_states: c.icmsDaUf === null ? null : { icms_internal_rate: c.icmsDaUf / 100 },
    }
    const salvar = jest.fn<Promise<string[] | null>, [GravacaoDaPrecificacao]>(async () => null)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {})
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {})
    montados.push(() => { act(() => root.unmount()); host.remove(); erro.mockRestore(); aviso.mockRestore() })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- a raiz do React 19 monta aqui, sem a testing-library (como os outros testes de tela)
    await act(async () => {
        root.render(<Content messageApi={mensagens()} isEditingMode={false} itemsFromApi={[]} calcBase={c.calcBase} currentUser={c.usuario}
            orcamento={c.orcamento} onSalvarOrcamento={salvar} />)
    })
    await esperar()
    const b = Array.from(host.querySelectorAll('button')).find((x) => (x.textContent ?? '').trim() === 'Salvar precificação do orçamento')
    if (!b) throw new Error('botão ausente')
    await act(async () => { b.click() })
    await esperar()
    expect(banco.escritas.filter((e) => e.tabela === 'products')).toEqual([])
    if (salvar.mock.calls.length) return { gravacao: salvar.mock.calls[0][0] }
    const recusas = Array.from(host.querySelectorAll('[data-recusas-do-orcamento] li')).map((li) => li.textContent ?? '')
    return { recusas }
}

/** O que o SERVIDOR faz no mesmo cenário (a empresa que `lerEmpresaDoPreco` montaria dos mesmos dados). */
function noServidor(c: Cenario): { gravacao: GravacaoDaPrecificacao } | { recusas: string[] } {
    const empresa: EmpresaDoPreco = {
        usuario: c.usuario, calcBase: c.calcBase, icmsDaUf: c.uf ? c.icmsDaUf : null, ibsDaEmpresa: c.ibs, cbsDaEmpresa: c.cbs,
    }
    const r = formarPrecoDoOrcamento(c.orcamento, empresa)
    return 'faltas' in r ? { recusas: r.faltas } : { gravacao: { ...PRESET_DA_COMERCIALIZACAO, ...r.preco } }
}

async function servidorIgualATela(c: Cenario) {
    const tela = await naTela(c)
    const servidor = noServidor(c)
    expect(servidor).toEqual(tela)
    return { tela, servidor }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('o servidor forma o MESMO preço que a tela grava — igualdade exata, regime a regime', () => {
    it('Lucro Real, RS 17%, IBS 0,1 e CBS 0,9 (a De Paula com o Geraldo Huck): a tela grava, e o servidor forma o mesmo número', async () => {
        const { tela } = await servidorIgualATela(cenario())
        expect('gravacao' in tela && tela.gravacao.valor_venda).toBeGreaterThan(0)
        // a interna em centavos exatos (a CHECK `ao_centavo`)
        const g = (tela as { gravacao: GravacaoDaPrecificacao }).gravacao
        expect(Math.round(g.valor_operacao_interna * 100) / 100).toBe(g.valor_operacao_interna)
    })
    it('Lucro Real com a CBS NULA (não entra, nem como zero) e o IBS zero', async () => {
        await servidorIgualATela(cenario({ ibs: 0, cbs: null }))
    })
    it('Lucro Real com outros percentuais (comissão 7, RT 2,5, lucro 12) e um item só', async () => {
        await servidorIgualATela(cenario({ orcamento: orcamento({ comissao_percentual: 7, reserva_tecnica_percentual: 2.5, lucro_projetado_percentual: 12, itens: [item(1, 930.78, 150)] }) }))
    })
    it('percentuais NULOS no orçamento entram como 0 nos dois lados', async () => {
        await servidorIgualATela(cenario({ orcamento: orcamento({ comissao_percentual: null, reserva_tecnica_percentual: null, lucro_projetado_percentual: 15 }) }))
    })
    it('Lucro Presumido (PIS/COFINS cumulativo da referência), SP 18%', async () => {
        await servidorIgualATela(cenario({ usuario: usuario({ taxableRegime: 'LUCRO_PRESUMIDO' } as Partial<Usuario>), uf: 'SP', icmsDaUf: 18 }))
    })
    it('Simples Nacional (o imposto do regime no calcBase; IBS/CBS da empresa não lidos)', async () => {
        await servidorIgualATela(cenario({ usuario: usuario({ taxableRegime: 'SIMPLES_NACIONAL' } as Partial<Usuario>), calcBase: calcBase({ taxPct: 8.5 } as Partial<CalcBase>) }))
    })
    it('Simples Híbrido (lê o ICMS e o IBS/CBS, sem o PIS/COFINS da referência)', async () => {
        await servidorIgualATela(cenario({ usuario: usuario({ taxableRegime: 'SIMPLES_HIBRIDO' } as Partial<Usuario>), calcBase: calcBase({ taxPct: 6 } as Partial<CalcBase>) }))
    })
})

describe('quando a tela recusa, o servidor recusa com as MESMAS frases', () => {
    it('Lucro Real sem a UF da empresa: a falta da referência do tenant, nos dois lados', async () => {
        const { servidor } = await servidorIgualATela(cenario({ uf: null, icmsDaUf: null }))
        expect(servidor).toEqual({ recusas: expect.arrayContaining([FALTA_DA_REFERENCIA_DO_TENANT]) })
    })
    it('sem a carga horária da equipe produtiva: a mesma recusa, antes do preço', async () => {
        const { servidor } = await servidorIgualATela(cenario({ usuario: usuario({ monthlyWorkloadInMinutes: 0, unitMeasure: null } as Partial<Usuario>) }))
        expect(servidor).toEqual({ recusas: [FALTA_DA_CARGA_HORARIA] })
    })
    it('a margem que acaba (lucro 90%): o preço não se forma, nos dois lados', async () => {
        const { servidor } = await servidorIgualATela(cenario({ orcamento: orcamento({ lucro_projetado_percentual: 90 }) }))
        expect('recusas' in servidor).toBe(true)
    })
    it('a margem que acaba COM IBS e CBS por fora: o preço exibido sai positivo, mas a matriz não forma — nos dois lados, nada se grava', async () => {
        // o caso que separa "preço positivo" de "preço formado" (`formado`): o por fora dá número ao preço exibido sem a matriz governar
        // medido: com IBS 1 e CBS 9, o lucro de 40% a 55% dá preço exibido positivo e a matriz sem formar; de 60% em diante o motor nem forma
        const c = cenario({ ibs: 1, cbs: 9, orcamento: orcamento({ lucro_projetado_percentual: 45 }) })
        const { servidor } = await servidorIgualATela(c)
        expect('recusas' in servidor).toBe(true)
    })
})
