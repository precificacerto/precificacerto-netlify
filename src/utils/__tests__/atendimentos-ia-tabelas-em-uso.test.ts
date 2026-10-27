/**
 * PORTÃO — a TRAVA DO MODELO E DO NICHO, sobre as tabelas DERIVADAS da conta (dono do produto, 26/10/2026).
 *
 * "Tabelas em uso" SAIU da tela da conta: o seletor de fornecedor, o de tabela, o Adicionar, a lista com
 * Remover — e as rotas `contas/[tenantId]/tabelas` que eles chamavam. Os portões delas saíram com elas
 * (este arquivo os tinha em (1) a (4), (6) e (7)). Ficou o (5), porque a trava que a frase "Enquanto houver
 * tabela em uso, o modelo e o nicho da conta não podem ser trocados" descrevia CONTINUA EXISTINDO, e só
 * mudou de fonte: as tabelas da conta são as dos fornecedores que a base de conhecimento dela vincula
 * (`tabelas-da-conta.ts`), e a frase nova diz isso (`AVISO_DA_TRAVA_DO_MODELO_E_NICHO`, `fraseDasTabelasQueSeguram`).
 *
 * O que este portão fica vermelho:
 *   (5) trocar modelo ou nicho com fornecedor vinculado COM tabela é RECUSADO (409), nomeando as tabelas e
 *       dizendo o que fazer; regravar o mesmo par passa; sem vínculo, a troca passa;
 *   (5b) a linha PARADA de `orcamentista_conta_tabela` não trava nada, e fornecedor vinculado SEM tabela
 *       também não — a trava sempre foi sobre tabela;
 *   (6) a REGRA INVIOLÁVEL: e-mail e telefone da conta não atravessam a recusa.
 *
 * O que NÃO alcança: o `supabaseAdmin` é FALSO; o que se prova é o que a ROTA decide.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo (o admin não tem os tipos destas tabelas) */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Modelo } from '@/utils/atendimentos-ia-catalogo'

interface Perfil { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
interface Resposta<T> { data: T; error: { message: string; code?: string } | null }
type Linha = Record<string, unknown>

const CONTA_A = '00000000-0000-0000-0000-00000000000a'
const CONTA_SEM_NICHO = '00000000-0000-0000-0000-00000000000b'
const CONTA_NICHO_VAZIO = '00000000-0000-0000-0000-00000000000c'
const CONTA_SEM_CONFIG = '00000000-0000-0000-0000-00000000000d'
const N_ESQ = '33333333-3333-3333-3333-333333333331'
const N_MARC = '33333333-3333-3333-3333-333333333332'
const N_SERR = '33333333-3333-3333-3333-333333333333'
const F_SUL = '44444444-4444-4444-4444-444444444441'
const F_NORTE = '44444444-4444-4444-4444-444444444442'
const F_MADEIRA = '44444444-4444-4444-4444-444444444443'
const T_SUL_1 = '55555555-5555-5555-5555-555555555511'
const T_SUL_2 = '55555555-5555-5555-5555-555555555512'
const T_NORTE_1 = '55555555-5555-5555-5555-555555555521'
const T_MADEIRA_1 = '55555555-5555-5555-5555-555555555531'
// Revenda e Prestação de serviço: o CATÁLOGO pode ter nicho, fornecedor e tabela nelas (a
// decisão de 19/10/2026 restringe o USO por conta, não o credenciamento).
const CONTA_REVENDA = '00000000-0000-0000-0000-00000000000e'
const CONTA_SERVICO = '00000000-0000-0000-0000-00000000000f'
const N_AUTO = '33333333-3333-3333-3333-333333333334'
const N_MEC = '33333333-3333-3333-3333-333333333335'
const F_PECAS = '44444444-4444-4444-4444-444444444444'
const F_OFICINA = '44444444-4444-4444-4444-444444444445'
const T_PECAS_1 = '55555555-5555-5555-5555-555555555541'
const T_OFICINA_1 = '55555555-5555-5555-5555-555555555551'

const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }

/** As contas TÊM dado sensível no banco falso — é o que a regra inviolável não deixa atravessar. */
const TENANTS: Linha[] = [
    { id: CONTA_A, name: 'Conta Alfa', email: 'alfa@cliente.com', phone: '11 99999-0000' },
    { id: CONTA_SEM_NICHO, name: 'Conta Beta', email: 'beta@cliente.com', phone: '11 98888-0000' },
    { id: CONTA_NICHO_VAZIO, name: 'Conta Gama', email: 'gama@cliente.com', phone: '11 97777-0000' },
    { id: CONTA_SEM_CONFIG, name: 'Conta Delta', email: 'delta@cliente.com', phone: '11 96666-0000' },
    { id: CONTA_REVENDA, name: 'Conta Épsilon', email: 'epsilon@cliente.com', phone: '11 95555-0000' },
    { id: CONTA_SERVICO, name: 'Conta Zeta', email: 'zeta@cliente.com', phone: '11 94444-0000' },
]
const NICHOS: { id: string; modelo: Modelo; nome: string }[] = [
    { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
    { id: N_MARC, modelo: 'FABRICACAO', nome: 'Marcenaria' },
    { id: N_SERR, modelo: 'FABRICACAO', nome: 'Serralheria' },
    { id: N_AUTO, modelo: 'REVENDA', nome: 'Autopeças' },
    { id: N_MEC, modelo: 'SERVICO', nome: 'Mecânicas' },
]
const FORNECEDORES: Linha[] = [
    { id: F_SUL, nicho_id: N_ESQ, nome: 'Alumínio Sul' },
    { id: F_NORTE, nicho_id: N_ESQ, nome: 'Alumínio Norte' },
    { id: F_MADEIRA, nicho_id: N_MARC, nome: 'Madeireira Centro' },
    { id: F_PECAS, nicho_id: N_AUTO, nome: 'Distribuidora de Peças' },
    { id: F_OFICINA, nicho_id: N_MEC, nome: 'Oficina Parceira' },
]
const tabela = (id: string, fornecedor_id: string, arquivo_nome: string, vigencia: string | null): Linha => ({
    id, fornecedor_id, arquivo_nome, arquivo_path: `${fornecedor_id}/arquivo/${arquivo_nome}`,
    motor_nome: `motor-${arquivo_nome}`, motor_path: `${fornecedor_id}/motor/motor-${arquivo_nome}`, vigencia, criado_em: '2026-10-19T12:00:00Z',
})
const TABELAS: Linha[] = [
    tabela(T_SUL_1, F_SUL, 'sul-outubro.xlsx', 'desde 01/10/2026'),
    tabela(T_SUL_2, F_SUL, 'sul-novembro.xlsx', 'vale até sair a nova lista'),
    tabela(T_NORTE_1, F_NORTE, 'norte.pdf', null),
    tabela(T_MADEIRA_1, F_MADEIRA, 'madeira.xlsx', 'desde 01/09/2026'),
    tabela(T_PECAS_1, F_PECAS, 'pecas.xlsx', null),
    tabela(T_OFICINA_1, F_OFICINA, 'oficina.xlsx', null),
]
const config = (tenant_id: string, modelo: Modelo | null, nicho_id: string | null): Linha => ({
    tenant_id, ativo: true, valor_adicional_brl: null, teto_de_consumo_brl: null, acao_ao_atingir_teto: 'AVISAR',
    ativado_por: 'u-quem-ligou', ativado_em: '2026-10-18T12:00:00Z', atualizado_por: 'u-quem-ligou', atualizado_em: '2026-10-18T12:00:00Z',
    modelo, nicho_id,
})

const banco: {
    perfil: Perfil | null
    tabelas: Record<string, Linha[]>
    escritas: { tabela: string; op: string; payload: unknown }[]
    leituras: { tabela: string; colunas: string }[]
    falhaNoInsert: { code: string; message: string } | null
} = { perfil: SUPER, tabelas: {}, escritas: [], leituras: [], falhaNoInsert: null }

jest.mock('@/supabase/admin', () => {
    const projetar = (l: Linha, colunas: string) => {
        if (!colunas || colunas.trim() === '*') return { ...l }
        return Object.fromEntries(colunas.split(',').map((c) => c.trim()).map((c) => [c, l[c]]))
    }
    /** O que o Postgres faz: a FK composta e a CHECK da config. */
    const conferir = (tabela: string, l: Linha): { code: string; message: string } | null => {
        if (tabela === 'orcamentista_config') {
            if (l.nicho_id != null && l.modelo == null) return { code: '23514', message: 'violates check constraint "orcamentista_config_nicho_exige_modelo"' }
            if (l.nicho_id != null && !NICHOS.some((n) => n.id === l.nicho_id && n.modelo === l.modelo)) return { code: '23503', message: 'violates foreign key constraint "orcamentista_config_modelo_nicho_id_fkey"' }
        }
        return null
    }
    const consulta = (tabela: string) => {
        const filtros: [string, 'eq' | 'in', unknown][] = []
        let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
        let payload: Linha = {}
        let colunas = '*'
        const linhas = () => (banco.tabelas[tabela] ||= [])
        const casa = (l: Linha) => filtros.every(([k, tipo, v]) => (tipo === 'in' ? (v as unknown[]).includes(l[k]) : l[k] === v))
        const executar = async (): Promise<Resposta<any>> => {
            if (op === 'select') return { data: linhas().filter(casa).map((l) => projetar(l, colunas)), error: null }
            if (op === 'insert') {
                if (banco.falhaNoInsert) return { data: null, error: banco.falhaNoInsert }
                const erro = conferir(tabela, payload)
                if (erro) return { data: null, error: erro }
                const nova = { criado_em: '2026-10-19T20:00:00Z', ...payload }
                linhas().push(nova)
                return { data: [projetar(nova, colunas)], error: null }
            }
            if (op === 'delete') {
                const fora = linhas().filter(casa)
                banco.tabelas[tabela] = linhas().filter((l) => !casa(l))
                return { data: fora.map((l) => projetar(l, colunas)), error: null }
            }
            const alvos = op === 'upsert'
                ? [linhas().find((l) => l.tenant_id === payload.tenant_id) ?? { tenant_id: payload.tenant_id, ativo: false, modelo: null, nicho_id: null }]
                : linhas().filter(casa)
            const novas: Linha[] = []
            for (const atual of alvos) {
                const nova = { ...atual, ...payload }
                const erro = conferir(tabela, nova)
                if (erro) return { data: null, error: erro }
                novas.push(nova)
            }
            for (const n of novas) {
                const i = linhas().findIndex((l) => l.tenant_id === n.tenant_id)
                if (i >= 0) linhas()[i] = n
                else linhas().push(n)
            }
            return { data: novas.map((l) => projetar(l, colunas)), error: null }
        }
        const escreve = (o: typeof op, p: Linha) => { op = o; payload = p; banco.escritas.push({ tabela, op: o, payload: p }) }
        const q: any = {
            select: (c = '*') => { colunas = c; if (op === 'select') banco.leituras.push({ tabela, colunas: c }); return q },
            eq: (k: string, v: unknown) => { filtros.push([k, 'eq', v]); return q },
            in: (k: string, v: unknown[]) => { filtros.push([k, 'in', v]); return q },
            order: () => q,
            insert: (p: Linha) => { escreve('insert', p); return q },
            update: (p: Linha) => { escreve('update', p); return q },
            upsert: (p: Linha) => { escreve('upsert', p); return q },
            delete: () => { escreve('delete', {}); return q },
            maybeSingle: async () => { const r = await executar(); return { data: r.data ? r.data[0] ?? null : null, error: r.error } },
            single: async () => { const r = await executar(); return { data: r.data ? r.data[0] ?? null : null, error: r.error } },
            then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => executar().then(ok, falha),
        }
        return q
    }
    return {
        supabaseAdmin: {
            auth: {
                getUser: async (): Promise<Resposta<{ user: { id: string } | null }>> =>
                    (banco.perfil ? { data: { user: { id: banco.perfil.id } }, error: null } : { data: { user: null }, error: { message: 'sem sessão' } }),
            },
            from: (tabela: string) => {
                if (tabela === 'users') {
                    const q: any = { select: () => q, eq: () => q, single: async (): Promise<Resposta<Perfil | null>> => ({ data: banco.perfil, error: null }) }
                    return q
                }
                return consulta(tabela)
            },
        },
    }
})

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDaConfig = (): Rota => require('@/pages/api/super-admin/orcamentista/[tenantId]').default

async function chamar(rota: Rota, req: { method: string; query?: object; body?: unknown }) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res } }
    await rota({ cookies: { token: 't' }, query: {}, ...req } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}
const gravarModeloENicho = (tenantId: string, body: unknown) => chamar(rotaDaConfig(), { method: 'PATCH', query: { tenantId }, body })
/** O vínculo da base de conhecimento: a conta usa o fornecedor no PERFIL — é o que deriva as tabelas dela. */
const vincular = (tenant_id: string, fornecedor_id: string) => banco.tabelas.orcamentista_mp_categoria_fornecedor.push(
    { id: `v-${tenant_id}-${fornecedor_id}`, tenant_id, mp_categoria_id: `c-${tenant_id}`, fornecedor_id, principal: false, ordem: 1 })
const escritasEm = (t: string) => banco.escritas.filter((e) => e.tabela === t)

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(() => {
    banco.perfil = SUPER
    banco.escritas = []
    banco.leituras = []
    banco.falhaNoInsert = null
    banco.tabelas = {
        tenants: TENANTS.map((t) => ({ ...t })),
        orcamentista_nicho: NICHOS.map((n) => ({ ...n })),
        orcamentista_fornecedor: FORNECEDORES.map((f) => ({ ...f })),
        orcamentista_tabela: TABELAS.map((t) => ({ ...t })),
        orcamentista_conta_tabela: [],
        orcamentista_mp_categoria: [{ id: `c-${CONTA_A}`, tenant_id: CONTA_A, materia_prima_id: 'mp-a', categoria_chave: 'PERFIL', config: null }],
        orcamentista_mp_categoria_fornecedor: [],
        orcamentista_config: [
            config(CONTA_A, 'FABRICACAO', N_ESQ),
            config(CONTA_SEM_NICHO, 'FABRICACAO', null),
            config(CONTA_NICHO_VAZIO, 'FABRICACAO', N_SERR),
            config(CONTA_REVENDA, 'REVENDA', N_AUTO),
            config(CONTA_SERVICO, 'SERVICO', N_MEC),
        ],
    }
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(5) — trocar modelo ou nicho com fornecedor vinculado COM tabela é RECUSADO, e nomeia quem segura', () => {
    beforeEach(() => {
        vincular(CONTA_A, F_SUL)
        vincular(CONTA_A, F_NORTE)
    })

    it.each([
        ['outro nicho do mesmo modelo', { modelo: 'FABRICACAO', nicho_id: N_MARC }],
        ['outro modelo', { modelo: 'REVENDA', nicho_id: null }],
        ['sem modelo nem nicho', { modelo: null, nicho_id: null }],
        ['o mesmo modelo, sem nicho', { modelo: 'FABRICACAO', nicho_id: null }],
    ])('%s → 409 com as tabelas que seguram, e a configuração fica como estava', async (_caso, body) => {
        const r = await gravarModeloENicho(CONTA_A, body)
        expect(r.status).toBe(409)
        for (const nome of ['Alumínio Sul', 'sul-outubro.xlsx', 'sul-novembro.xlsx', 'Alumínio Norte', 'norte.pdf']) expect(r.json.error).toContain(nome)
        expect(escritasEm('orcamentista_config')).toEqual([])
        expect(banco.tabelas.orcamentista_config[0]).toEqual(config(CONTA_A, 'FABRICACAO', N_ESQ))
    })

    it('a frase diz a trava pela fonte NOVA — a base de conhecimento — e o que fazer', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { fraseDasTabelasQueSeguram } = require('@/utils/atendimentos-ia-catalogo') as typeof import('@/utils/atendimentos-ia-catalogo')
        const r = await gravarModeloENicho(CONTA_A, { modelo: 'REVENDA', nicho_id: null })
        expect(r.json.error).toBe(fraseDasTabelasQueSeguram([
            { fornecedor_nome: 'Alumínio Norte', arquivo_nome: 'norte.pdf' },
            { fornecedor_nome: 'Alumínio Sul', arquivo_nome: 'sul-novembro.xlsx' },
            { fornecedor_nome: 'Alumínio Sul', arquivo_nome: 'sul-outubro.xlsx' },
        ]))
        expect(r.json.error).toContain('base de conhecimento')
        expect(r.json.error).not.toContain('Remova antes')
        expect(r.json.tabelas).toEqual(['Alumínio Norte · norte.pdf', 'Alumínio Sul · sul-novembro.xlsx', 'Alumínio Sul · sul-outubro.xlsx'])
    })

    it('regravar o MESMO modelo e o MESMO nicho não é troca: 200', async () => {
        const r = await gravarModeloENicho(CONTA_A, { modelo: 'FABRICACAO', nicho_id: N_ESQ })
        expect(r.status).toBe(200)
    })

    // O CONTRASTE: sem vínculo, a mesma troca passa. Sem isto, uma rota que recusasse toda troca passaria acima.
    it('o contraste: sem fornecedor vinculado, a mesma troca passa', async () => {
        banco.tabelas.orcamentista_mp_categoria_fornecedor = []
        const r = await gravarModeloENicho(CONTA_A, { modelo: 'FABRICACAO', nicho_id: N_MARC })
        expect(r.status).toBe(200)
        expect(banco.tabelas.orcamentista_config[0].nicho_id).toBe(N_MARC)
    })

    it('a recusa não apaga nada por efeito colateral: nem o vínculo, nem tabela', async () => {
        await gravarModeloENicho(CONTA_A, { modelo: 'REVENDA', nicho_id: null })
        expect(banco.escritas).toEqual([])
        expect(banco.tabelas.orcamentista_mp_categoria_fornecedor).toHaveLength(2)
    })
})

describe('(5b) — o que NÃO trava', () => {
    it('a linha PARADA de orcamentista_conta_tabela não trava: sem vínculo na base de conhecimento, a troca passa', async () => {
        banco.tabelas.orcamentista_conta_tabela = [{ tenant_id: CONTA_A, tabela_id: T_SUL_1 }]
        const r = await gravarModeloENicho(CONTA_A, { modelo: 'FABRICACAO', nicho_id: N_MARC })
        expect(r.status).toBe(200)
        expect(banco.leituras.map((l) => l.tabela)).not.toContain('orcamentista_conta_tabela')
    })

    it('fornecedor vinculado SEM tabela não trava — a trava sempre foi sobre tabela', async () => {
        banco.tabelas.orcamentista_tabela = banco.tabelas.orcamentista_tabela.filter((t) => t.fornecedor_id !== F_SUL)
        vincular(CONTA_A, F_SUL)
        const r = await gravarModeloENicho(CONTA_A, { modelo: 'FABRICACAO', nicho_id: N_MARC })
        expect(r.status).toBe(200)
    })
})

describe('(6) — a REGRA INVIOLÁVEL na recusa', () => {
    it('nem e-mail nem telefone da conta atravessam a recusa, e a recusa não lê `tenants`', async () => {
        vincular(CONTA_A, F_SUL)
        const r = await gravarModeloENicho(CONTA_A, { modelo: 'REVENDA', nicho_id: null })
        expect(r.status).toBe(409)
        const texto = JSON.stringify(r.json)
        for (const t of TENANTS) {
            expect(texto).not.toContain(String(t.email))
            expect(texto).not.toContain(String(t.phone))
        }
        expect(banco.leituras.map((l) => l.tabela)).not.toContain('tenants')
    })
})
