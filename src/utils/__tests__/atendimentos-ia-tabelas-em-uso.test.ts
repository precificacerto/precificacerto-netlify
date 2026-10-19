/**
 * PORTÕES do "Tabelas em uso" — as ROTAS (Atendimentos I.A., depois do 2C.1).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> REGRA INVIOLÁVEL <<<
 * A tela mostra apenas o nome da conta e a configuração do Atendimentos I.A. Nada do conteúdo da
 * conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O super admin não tem
 * tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * A CASCATA, nas palavras do dono do produto: "escolho a segmentação, e aí eu tenho todos os
 * fornecedores daquela segmentação; escolho a tabela daquele fornecedor".
 *
 *   (1) a rota só oferece fornecedores do NICHO DA CONTA. O banco falso tem dois nichos do MESMO
 *       modelo (Esquadrias e Marcenaria, os dois Fabricação): filtrar por modelo passaria verde
 *       com o fornecedor errado, e é esse o caso que discrimina;
 *   (2) nicho sem fornecedor devolve LISTA VAZIA — nunca a lista da plataforma;
 *   (3) adicionar e remover tabela da conta, com os erros do banco pela convenção da área:
 *       23505 → 409, 23503 → 409, corpo ruim → 400, tabela inexistente → 404;
 *   (4) a rota recusa tabela de fornecedor de OUTRO nicho — a tela não é a única trava;
 *   (5) trocar modelo ou nicho com tabela em uso é RECUSADO (409) e nomeia quem segura;
 *   (6) a regra inviolável: e-mail e telefone da conta não atravessam nenhuma das respostas.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * O `supabaseAdmin` é FALSO. A PK `(tenant_id, tabela_id)` e as FKs de
 * `orcamentista_conta_tabela` estão na migração `20261019000001`, e o caminho de escrita nessa
 * tabela NUNCA foi exercitado contra o banco real (`docs/registros/
 * o-caminho-de-exclusao-nao-foi-exercitado.md`). O banco falso imita os códigos que o Postgres
 * devolveria; o que se prova aqui é o que a ROTA decide com eles.
 * ══════════════════════════════════════════════════════════════════════════════════════════
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
const T_INEXISTENTE = '55555555-5555-5555-5555-555555555599'

const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN_DA_A: Perfil = { id: 'u-admin-a', tenant_id: CONTA_A, role: 'admin', is_super_admin: false }

/** As contas TÊM dado sensível no banco falso — é o que a regra inviolável não deixa atravessar. */
const TENANTS: Linha[] = [
    { id: CONTA_A, name: 'Conta Alfa', email: 'alfa@cliente.com', phone: '11 99999-0000' },
    { id: CONTA_SEM_NICHO, name: 'Conta Beta', email: 'beta@cliente.com', phone: '11 98888-0000' },
    { id: CONTA_NICHO_VAZIO, name: 'Conta Gama', email: 'gama@cliente.com', phone: '11 97777-0000' },
    { id: CONTA_SEM_CONFIG, name: 'Conta Delta', email: 'delta@cliente.com', phone: '11 96666-0000' },
]
const NICHOS: { id: string; modelo: Modelo; nome: string }[] = [
    { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
    { id: N_MARC, modelo: 'FABRICACAO', nome: 'Marcenaria' },
    { id: N_SERR, modelo: 'FABRICACAO', nome: 'Serralheria' },
]
const FORNECEDORES: Linha[] = [
    { id: F_SUL, nicho_id: N_ESQ, nome: 'Alumínio Sul' },
    { id: F_NORTE, nicho_id: N_ESQ, nome: 'Alumínio Norte' },
    { id: F_MADEIRA, nicho_id: N_MARC, nome: 'Madeireira Centro' },
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
    /** O que o Postgres faz: PK e FKs da conta_tabela; FK composta e CHECK da config. */
    const conferir = (tabela: string, l: Linha, todas: Linha[]): { code: string; message: string } | null => {
        if (tabela === 'orcamentista_conta_tabela') {
            if (todas.some((x) => x.tenant_id === l.tenant_id && x.tabela_id === l.tabela_id)) return { code: '23505', message: 'duplicate key value violates unique constraint "orcamentista_conta_tabela_pkey"' }
            if (!banco.tabelas.orcamentista_tabela.some((t) => t.id === l.tabela_id)) return { code: '23503', message: 'violates foreign key constraint "orcamentista_conta_tabela_tabela_id_fkey"' }
            if (!banco.tabelas.tenants.some((t) => t.id === l.tenant_id)) return { code: '23503', message: 'violates foreign key constraint "orcamentista_conta_tabela_tenant_id_fkey"' }
        }
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
                const erro = conferir(tabela, payload, linhas())
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
                const erro = conferir(tabela, nova, [])
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
// As rotas são lidas DENTRO de cada caso: no commit dos portões elas ainda não existem, e um
// `require` no topo derrubaria o arquivo inteiro de uma vez.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDasTabelas = (): Rota => require('@/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/tabelas/index').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDaTabela = (): Rota => require('@/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/tabelas/[tabelaId]').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDaConfig = (): Rota => require('@/pages/api/super-admin/orcamentista/[tenantId]').default

async function chamar(rota: Rota, req: { method: string; query?: object; body?: unknown }) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res } }
    await rota({ cookies: { token: 't' }, query: {}, ...req } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}
const listar = (tenantId: string) => chamar(rotaDasTabelas(), { method: 'GET', query: { tenantId } })
const adicionar = (tenantId: string, body: unknown) => chamar(rotaDasTabelas(), { method: 'POST', query: { tenantId }, body })
const remover = (tenantId: string, tabelaId: string) => chamar(rotaDaTabela(), { method: 'DELETE', query: { tenantId, tabelaId } })
const segmentar = (tenantId: string, body: unknown) => chamar(rotaDaConfig(), { method: 'PATCH', query: { tenantId }, body })
const usos = () => banco.tabelas.orcamentista_conta_tabela
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
        orcamentista_config: [
            config(CONTA_A, 'FABRICACAO', N_ESQ),
            config(CONTA_SEM_NICHO, 'FABRICACAO', null),
            config(CONTA_NICHO_VAZIO, 'FABRICACAO', N_SERR),
        ],
    }
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(1) e (2) — os fornecedores oferecidos são SÓ os do nicho da conta', () => {
    it('conta em Esquadrias: Alumínio Sul e Alumínio Norte, com as tabelas DE CADA UM — e nada de Marcenaria', async () => {
        const r = await listar(CONTA_A)
        expect(r.status).toBe(200)
        expect(r.json.fornecedores.map((f: { nome: string }) => f.nome)).toEqual(['Alumínio Norte', 'Alumínio Sul'])
        const sul = r.json.fornecedores.find((f: { id: string }) => f.id === F_SUL)
        expect(sul.tabelas.map((t: { id: string }) => t.id).sort()).toEqual([T_SUL_1, T_SUL_2].sort())
        const norte = r.json.fornecedores.find((f: { id: string }) => f.id === F_NORTE)
        expect(norte.tabelas.map((t: { id: string }) => t.id)).toEqual([T_NORTE_1])
        const texto = JSON.stringify(r.json)
        expect(texto).not.toContain(F_MADEIRA)
        expect(texto).not.toContain(T_MADEIRA_1)
    })

    // O CONTRASTE: o banco falso PODE devolver Marcenaria — a conta de lá a recebe. Sem isto, um
    // banco que nunca a devolvesse passaria o caso acima sem distinguir nada.
    it('o contraste: a mesma rota, numa conta de Marcenaria, oferece a Madeireira', async () => {
        banco.tabelas.orcamentista_config[0] = config(CONTA_A, 'FABRICACAO', N_MARC)
        const r = await listar(CONTA_A)
        expect(r.json.fornecedores.map((f: { id: string }) => f.id)).toEqual([F_MADEIRA])
    })

    it('(2) nicho sem fornecedor: lista VAZIA — nunca a lista da plataforma', async () => {
        const r = await listar(CONTA_NICHO_VAZIO)
        expect(r.status).toBe(200)
        expect(r.json.nicho_id).toBe(N_SERR)
        expect(r.json.fornecedores).toEqual([])
    })

    it('(2) conta sem nicho: lista VAZIA, e o nicho vem nulo', async () => {
        const r = await listar(CONTA_SEM_NICHO)
        expect(r.status).toBe(200)
        expect(r.json.nicho_id).toBeNull()
        expect(r.json.fornecedores).toEqual([])
    })

    it('conta sem configuração do Atendimentos I.A.: 404', async () => {
        expect((await listar(CONTA_SEM_CONFIG)).status).toBe(404)
    })

    it('as tabelas em uso vêm com fornecedor, arquivo, motor e a vigência COMO FOI DIGITADA', async () => {
        banco.tabelas.orcamentista_conta_tabela.push({ tenant_id: CONTA_A, tabela_id: T_SUL_2, criado_em: 'x', criado_por: 'u' })
        const r = await listar(CONTA_A)
        expect(r.json.em_uso).toEqual([{
            tabela_id: T_SUL_2, fornecedor_id: F_SUL, fornecedor_nome: 'Alumínio Sul',
            arquivo_nome: 'sul-novembro.xlsx', motor_nome: 'motor-sul-novembro.xlsx', vigencia: 'vale até sair a nova lista',
        }])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(3) e (4) — adicionar e remover tabela da conta', () => {
    it('adicionar uma tabela do nicho da conta: 201, e a linha nasce com quem adicionou', async () => {
        const r = await adicionar(CONTA_A, { tabela_id: T_SUL_1 })
        expect(r.status).toBe(201)
        expect(usos()).toEqual([expect.objectContaining({ tenant_id: CONTA_A, tabela_id: T_SUL_1, criado_por: SUPER.id })])
    })

    it('(4) tabela de fornecedor de OUTRO nicho: 409 nomeando a tabela e o fornecedor, e nada é escrito', async () => {
        const r = await adicionar(CONTA_A, { tabela_id: T_MADEIRA_1 })
        expect(r.status).toBe(409)
        expect(r.json.error).toContain('madeira.xlsx')
        expect(r.json.error).toContain('Madeireira Centro')
        expect(escritasEm('orcamentista_conta_tabela')).toEqual([])
        expect(usos()).toEqual([])
    })

    it('conta sem nicho: 400 — escolher a tabela vem DEPOIS da segmentação', async () => {
        const r = await adicionar(CONTA_SEM_NICHO, { tabela_id: T_SUL_1 })
        expect(r.status).toBe(400)
        expect(escritasEm('orcamentista_conta_tabela')).toEqual([])
    })

    it('a mesma tabela duas vezes: o BANCO recusa (23505) e a rota responde 409', async () => {
        expect((await adicionar(CONTA_A, { tabela_id: T_SUL_1 })).status).toBe(201)
        const r = await adicionar(CONTA_A, { tabela_id: T_SUL_1 })
        expect(r.status).toBe(409)
        expect(r.json.error).toMatch(/já está em uso/)
        expect(usos()).toHaveLength(1)
    })

    it('o banco recusa por FK (23503) entre a conferência e a escrita: 409', async () => {
        banco.falhaNoInsert = { code: '23503', message: 'violates foreign key constraint "orcamentista_conta_tabela_tabela_id_fkey"' }
        const r = await adicionar(CONTA_A, { tabela_id: T_SUL_1 })
        expect(r.status).toBe(409)
    })

    it('o banco recusa por NOT NULL (23502): 400', async () => {
        banco.falhaNoInsert = { code: '23502', message: 'null value in column violates not-null constraint' }
        expect((await adicionar(CONTA_A, { tabela_id: T_SUL_1 })).status).toBe(400)
    })

    it('tabela que não existe: 404, e nada é escrito', async () => {
        const r = await adicionar(CONTA_A, { tabela_id: T_INEXISTENTE })
        expect(r.status).toBe(404)
        expect(escritasEm('orcamentista_conta_tabela')).toEqual([])
    })

    it.each([[{}], [{ tabela_id: 'sul-outubro' }], [null]])('corpo inválido (%p): 400, e nada é escrito', async (body) => {
        const r = await adicionar(CONTA_A, body)
        expect(r.status).toBe(400)
        expect(escritasEm('orcamentista_conta_tabela')).toEqual([])
    })

    it('remover: 200, e só a linha DAQUELA conta e DAQUELA tabela sai', async () => {
        usos().push(
            { tenant_id: CONTA_A, tabela_id: T_SUL_1 },
            { tenant_id: CONTA_A, tabela_id: T_SUL_2 },
            { tenant_id: CONTA_NICHO_VAZIO, tabela_id: T_SUL_1 },
        )
        const r = await remover(CONTA_A, T_SUL_1)
        expect(r.status).toBe(200)
        expect(usos()).toEqual([{ tenant_id: CONTA_A, tabela_id: T_SUL_2 }, { tenant_id: CONTA_NICHO_VAZIO, tabela_id: T_SUL_1 }])
    })

    it('remover o que não está em uso: 404', async () => {
        expect((await remover(CONTA_A, T_SUL_1)).status).toBe(404)
    })

    it('só o super admin: admin de conta → 403 nas três, e nada é lido nem escrito; sem sessão → 401', async () => {
        banco.perfil = ADMIN_DA_A
        expect((await listar(CONTA_A)).status).toBe(403)
        expect((await adicionar(CONTA_A, { tabela_id: T_SUL_1 })).status).toBe(403)
        expect((await remover(CONTA_A, T_SUL_1)).status).toBe(403)
        expect(banco.leituras).toEqual([])
        expect(banco.escritas).toEqual([])
        banco.perfil = null
        expect((await listar(CONTA_A)).status).toBe(401)
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(5) — trocar modelo ou nicho com tabela em uso é RECUSADO, e nomeia quem segura', () => {
    beforeEach(() => {
        usos().push({ tenant_id: CONTA_A, tabela_id: T_SUL_1 }, { tenant_id: CONTA_A, tabela_id: T_NORTE_1 })
    })

    it.each([
        ['outro nicho do mesmo modelo', { modelo: 'FABRICACAO', nicho_id: N_MARC }],
        ['outro modelo', { modelo: 'REVENDA', nicho_id: null }],
        ['sem segmentação', { modelo: null, nicho_id: null }],
        ['o mesmo modelo, sem nicho', { modelo: 'FABRICACAO', nicho_id: null }],
    ])('%s → 409 com as tabelas que seguram, e a configuração fica como estava', async (_caso, body) => {
        const r = await segmentar(CONTA_A, body)
        expect(r.status).toBe(409)
        for (const nome of ['Alumínio Sul', 'sul-outubro.xlsx', 'Alumínio Norte', 'norte.pdf']) expect(r.json.error).toContain(nome)
        expect(escritasEm('orcamentista_config')).toEqual([])
        expect(banco.tabelas.orcamentista_config[0]).toEqual(config(CONTA_A, 'FABRICACAO', N_ESQ))
        expect(usos()).toHaveLength(2)
    })

    it('regravar a MESMA segmentação não é troca: 200, e as tabelas ficam', async () => {
        const r = await segmentar(CONTA_A, { modelo: 'FABRICACAO', nicho_id: N_ESQ })
        expect(r.status).toBe(200)
        expect(usos()).toHaveLength(2)
    })

    // O CONTRASTE: sem tabela em uso, a mesma troca passa. Sem isto, uma rota que recusasse toda
    // troca passaria o caso acima.
    it('o contraste: sem tabela em uso, a mesma troca passa', async () => {
        banco.tabelas.orcamentista_conta_tabela = []
        const r = await segmentar(CONTA_A, { modelo: 'FABRICACAO', nicho_id: N_MARC })
        expect(r.status).toBe(200)
        expect(banco.tabelas.orcamentista_config[0].nicho_id).toBe(N_MARC)
    })

    it('a recusa não apaga tabela nenhuma por efeito colateral', async () => {
        await segmentar(CONTA_A, { modelo: 'REVENDA', nicho_id: null })
        expect(escritasEm('orcamentista_conta_tabela')).toEqual([])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(6) — a REGRA INVIOLÁVEL nas respostas', () => {
    it('nem e-mail nem telefone da conta atravessam a lista, a inclusão ou a recusa', async () => {
        usos().push({ tenant_id: CONTA_A, tabela_id: T_SUL_1 })
        const respostas = [
            await listar(CONTA_A),
            await adicionar(CONTA_A, { tabela_id: T_SUL_2 }),
            await adicionar(CONTA_A, { tabela_id: T_MADEIRA_1 }),
            await segmentar(CONTA_A, { modelo: 'REVENDA', nicho_id: null }),
        ]
        const texto = JSON.stringify(respostas.map((r) => r.json))
        for (const t of TENANTS) {
            expect(texto).not.toContain(t.email as string)
            expect(texto).not.toContain(t.phone as string)
        }
    })

    it('as chaves de cada tabela em uso e de cada fornecedor são SÓ as do catálogo', async () => {
        usos().push({ tenant_id: CONTA_A, tabela_id: T_SUL_1 })
        const r = await listar(CONTA_A)
        expect(Object.keys(r.json).sort()).toEqual(['em_uso', 'fornecedores', 'nicho_id'])
        for (const e of r.json.em_uso) expect(Object.keys(e).sort()).toEqual(['arquivo_nome', 'fornecedor_id', 'fornecedor_nome', 'motor_nome', 'tabela_id', 'vigencia'])
        for (const f of r.json.fornecedores) {
            expect(Object.keys(f).sort()).toEqual(['id', 'nome', 'tabelas'])
            for (const t of f.tabelas) expect(Object.keys(t).sort()).toEqual(['arquivo_nome', 'id', 'motor_nome', 'vigencia'])
        }
    })

    // A lista não precisa do nome da conta (a tela já o tem, da lista de contas ligadas): o
    // cadastro da conta não é lido, nem por coluna permitida.
    it('a lista não lê `tenants` — nenhuma coluna do cadastro da conta é pedida', async () => {
        await listar(CONTA_A)
        expect(banco.leituras.length).toBeGreaterThan(0)
        expect(banco.leituras.filter((x) => x.tabela === 'tenants')).toEqual([])
    })
})
