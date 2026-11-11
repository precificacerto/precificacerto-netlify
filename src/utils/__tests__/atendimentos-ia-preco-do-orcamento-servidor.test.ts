/**
 * @jest-environment node
 *
 * PORTÃO — A PRECIFICAÇÃO PELO AGENTE, do lado do banco (a cadeia do "sim", dono do produto, 11/11/2026). O NÚMERO é do portão permanente
 * servidor = tela (`o-servidor-forma-o-preco-da-tela.test.tsx`); aqui, o que o servidor LÊ e o que ele GRAVA:
 *   (1) `lerEmpresaDoPreco`: o usuário do cálculo pelo mapa do `auth.context`, o ICMS interno da UF da empresa em %, IBS/CBS nulos como nulos,
 *       o `calcBase` com o cliente do SERVIDOR no `fetchTaxPreview`, tudo pelo `tenant_id`; sem UF, o ICMS é nulo e `brazilian_states` não
 *       é lido; a falha de leitura é erro, nunca um preço com a empresa pela metade;
 *   (2) `precificarComoAgente`: com o preço formado, grava no orçamento SEM a marca de edição manual e gera o arquivo SEM autor; sem preço, as
 *       faltas nomeadas e NADA gravado.
 */
type Linha = Record<string, unknown>
const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Array<{ tabela: string; op: string; carga?: unknown; filtros: Array<[string, unknown]> }>,
    erros: {} as Record<string, { code?: string; message: string } | undefined>,
}
function cliente() {
    return {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            let op = 'select'
            let carga: unknown
            const q: Record<string, unknown> = {}
            const rodar = () => {
                estado.ops.push({ tabela, op, carga, filtros })
                const erro = estado.erros[`${tabela}:${op}`]
                if (erro) return Promise.resolve({ data: null, error: erro })
                const r = (estado.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v))
                if (op === 'update') r.forEach((l) => Object.assign(l, carga as Linha))
                return Promise.resolve({ data: r.map((l) => ({ ...l })), error: null })
            }
            q.select = () => q
            q.order = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.update = (c: unknown) => { op = 'update'; carga = c; return q }
            const um = () => rodar().then((r) => ({ data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error }))
            q.maybeSingle = um
            q.single = um
            q.then = (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => rodar().then(ok, e)
            return q
        },
    }
}
const mockAdmin = cliente()
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: mockAdmin }))
const preview = { clientes: [] as unknown[] }
jest.mock('@/utils/calc-tax-preview', () => ({
    fetchTaxPreview: async (_t: string, db: unknown) => {
        preview.clientes.push(db)
        return { effectiveTaxPct: 0, taxLabel: '', isMei: false, taxesPercent: 0, taxableRegimePercent: 0, regimeLabel: '' }
    },
}))
const arquivo = { chamadas: [] as Array<{ autor: string | null }> }
jest.mock('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor', () => ({
    lerDadosDoArquivo: async (_t: string, _id: string, a: Record<string, unknown>) => ({ dados: { ...a }, calculoId: 'c-1' }),
    gerarEGravarArquivo: async (_t: string, _id: string, autor: string | null) => {
        arquivo.chamadas.push({ autor })
        return { ok: true, arquivo: { id: 'arq-1', nomeDoArquivo: 'Orcamento 1 - Geraldo Huck.pdf' } }
    },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const { lerEmpresaDoPreco, precificarComoAgente } = require('@/lib/atendimentos-ia/preco-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/preco-do-orcamento-servidor')
const { FALTA_DA_CARGA_HORARIA } = require('@/lib/atendimentos-ia/preco-do-orcamento') as typeof import('@/lib/atendimentos-ia/preco-do-orcamento')
/* eslint-enable @typescript-eslint/no-require-imports */

const T = 'tenant-1'
const ORC = '30000000-0000-4000-8000-000000000001'
const SETTINGS = {
    tenant_id: T, calc_type: 'INDUSTRIALIZACAO', tax_regime: 'LUCRO_REAL', monthly_workload: '220', workload_unit: 'HOURS', num_productive_employees: 4,
    state_code: ' RS ', ibs_reference_pct: '0.1', cbs_reference_pct: null as string | null,
}
const DESPESAS = {
    tenant_id: T, production_labor_cost_hub: 40813.03, admin_salary_total: 9000, fixed_expense_monthly: 15000, indirect_labor_percent: 4,
    fixed_expense_percent: 10.39, variable_expense_percent: 6.41, financial_expense_percent: 0.42, financial_commitments_percent: 0,
}
const VALOR_DO_MINUTO = 40813.03 / 52800
const itemDoBanco = (k: number, liquido: number, minutos: number) => ({
    tenant_id: T, orcamento_id: ORC, id: `i-${k}`, ordem: k, tipologia: 'DP-02', largura_mm: 1500, altura_mm: 1200, quantidade: 1,
    calculo_id: 'c-1', calculado_em: '2026-11-09T12:00:00.000Z', atualizado_em: '2026-11-09T12:00:00.000Z',
    custo_bruto_materiais: String(liquido * 1.2), custo_liquido_materiais: String(liquido), tempo_fabricacao_min: String(minutos), valor_minuto: String(VALOR_DO_MINUTO),
    custo_fabricacao: String(minutos * VALOR_DO_MINUTO), custo_liquido_total: String(liquido + minutos * VALOR_DO_MINUTO),
})
beforeEach(() => {
    estado.ops = []
    estado.erros = {}
    preview.clientes = []
    arquivo.chamadas = []
    const itens = [itemDoBanco(1, 2593.18, 240), itemDoBanco(2, 421.04, 60)]
    estado.db = {
        tenant_settings: [{ ...SETTINGS }],
        tenant_expense_config: [{ ...DESPESAS }],
        brazilian_states: [{ code: 'RS', icms_internal_rate: '0.17' }],
        orcamentista_orcamento: [{
            tenant_id: T, id: ORC, numero: 1, nome: 'Geraldo Huck', comissao_percentual: '5', reserva_tecnica_percentual: '0', lucro_projetado_percentual: '20',
            valor_total_bruto: '1', valor_total_liquido: String(itens.reduce((t, i) => t + Number(i.custo_liquido_total), 0)), valor_venda: null, valor_operacao_interna: null,
            ncm_code: null, sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null, editado_manualmente_em: null, editado_manualmente_por: null,
        }],
        orcamentista_orcamento_item: itens,
    }
})

describe('(1) a empresa como a tela a lê', () => {
    it('o usuário pelo mapa do auth.context, o ICMS da UF em %, a CBS nula como nula, e o fetchTaxPreview com o cliente do SERVIDOR', async () => {
        const e = await lerEmpresaDoPreco(T)
        expect(e.usuario).toEqual({ calcType: 'INDUSTRIALIZATION', monthlyWorkloadInMinutes: 220, unitMeasure: 'HOURS', numProductiveSectorEmployee: 4, taxableRegime: 'LUCRO_REAL' })
        expect(e.icmsDaUf).toBeCloseTo(17, 10)
        expect(e.ibsDaEmpresa).toBe(0.1)
        expect(e.cbsDaEmpresa).toBeNull()
        expect(preview.clientes).toEqual([mockAdmin])
        expect(e.calcBase.laborCostMonthly).toBe(40813.03)
        // toda leitura da empresa leva o tenant; a UF é lida aparada
        for (const o of estado.ops.filter((x) => x.tabela !== 'brazilian_states')) expect(o.filtros).toContainEqual(['tenant_id', T])
        expect(estado.ops.find((x) => x.tabela === 'brazilian_states')?.filtros).toEqual([['code', 'RS']])
    })
    it('sem UF: o ICMS é NULO (a falta da referência é da precificação) e brazilian_states não é lido', async () => {
        estado.db.tenant_settings[0].state_code = '  '
        const e = await lerEmpresaDoPreco(T)
        expect(e.icmsDaUf).toBeNull()
        expect(estado.ops.some((x) => x.tabela === 'brazilian_states')).toBe(false)
    })
    it('a UF sem alíquota cadastrada: o ICMS é NULO, nunca zero', async () => {
        estado.db.brazilian_states = [{ code: 'RS', icms_internal_rate: null }]
        expect((await lerEmpresaDoPreco(T)).icmsDaUf).toBeNull()
    })
    it('a falha de leitura é erro, nomeando a tabela', async () => {
        estado.erros['tenant_expense_config:select'] = { message: 'fora do ar' }
        await expect(lerEmpresaDoPreco(T)).rejects.toThrow('tenant_expense_config: fora do ar')
    })
})

describe('(2) o agente grava como agente', () => {
    it('com o preço formado: grava venda e interna no orçamento, SEM a marca de edição manual, e gera o arquivo SEM autor', async () => {
        const r = await precificarComoAgente(T, ORC, new Date('2026-11-11T15:00:00Z'))
        if (!('gravado' in r)) throw new Error(`recusou: ${r.faltas.join(' | ')}`)
        const update = estado.ops.find((o) => o.tabela === 'orcamentista_orcamento' && o.op === 'update')
        const carga = update?.carga as Linha
        expect(update?.filtros).toEqual([['tenant_id', T], ['id', ORC]])
        expect(carga.valor_venda).toBeGreaterThan(0)
        expect(Math.round((carga.valor_operacao_interna as number) * 100) / 100).toBe(carga.valor_operacao_interna)
        expect(carga).toEqual(expect.objectContaining({ comissao_percentual: 5, reserva_tecnica_percentual: 0, lucro_projetado_percentual: 20, sale_scope: 'INTRAESTADUAL', ncm_code: null }))
        expect(Object.keys(carga)).not.toContain('editado_manualmente_em')
        expect(Object.keys(carga)).not.toContain('editado_manualmente_por')
        expect(arquivo.chamadas).toEqual([{ autor: null }])
        expect(r.gravado.arquivo).not.toBeNull()
    })
    it('sem a carga horária da equipe: a falta nomeada, e NADA gravado nem gerado', async () => {
        estado.db.tenant_settings[0].monthly_workload = null
        estado.db.tenant_settings[0].workload_unit = null
        const r = await precificarComoAgente(T, ORC)
        expect(r).toEqual({ faltas: [FALTA_DA_CARGA_HORARIA], orcamento: { numero: 1, nome: 'Geraldo Huck' } })
        expect(estado.ops.filter((o) => o.op !== 'select')).toEqual([])
        expect(arquivo.chamadas).toEqual([])
    })
})

// módulo, não script: as constantes deste arquivo não vazam para os outros testes (TS2451)
export {}
