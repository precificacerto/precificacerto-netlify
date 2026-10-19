/**
 * PORTÕES do bloco 2C.1 — "Contas ligadas" e a SEGMENTAÇÃO da conta (modelo + nicho).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> REGRA INVIOLÁVEL <<<
 * A lista de contas e a tela de configuração mostram APENAS o nome/identificação da conta e a
 * configuração do Atendimentos I.A. NADA do conteúdo da conta — nem clientes, nem orçamentos,
 * nem funcionários, nem valores. O super admin não tem tenant e não pode enxergar dado de cliente
 * por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   P1 — ligar/desligar a conta NÃO apaga `modelo` nem `nicho_id`. Hoje é verdade POR ACIDENTE: o
 *        upsert do PATCH não lista essas colunas. O banco falso abaixo faz o que o PostgREST faz
 *        num upsert — `ON CONFLICT DO UPDATE SET` só das colunas mandadas —, então o caso afirma
 *        o EFEITO na linha, e fica vermelho se a gravação passar a levar o registro inteiro.
 *        E o espelho: gravar modelo/nicho NÃO toca `ativo`, `ativado_por`, `ativado_em`.
 *   P2 — o contrato do PATCH aceita `modelo` e `nicho_id`, e recusa ANTES do banco o que o banco
 *        recusaria: modelo fora de `MODELOS` (a constante exportada, não uma cópia), nicho sem
 *        modelo (o espelho da CHECK `orcamentista_config_nicho_exige_modelo`). O par inexistente
 *        só o banco sabe: 23503, e a rota responde 409 dizendo o que segura.
 *   P3 — `ConfigDoOrcamentista` declara `modelo` e `nicho_id`. O caso IMPORTA o tipo e monta a
 *        linha com ele: quem barra é o `tsc` (TS2353, propriedade a mais num literal tipado). O
 *        jest compila com babel e apaga tipos — sozinho, ele NÃO pega esta regressão
 *        (`assercao-negativa-que-nunca-falha.md`, "jest verde não é tsc verde").
 *   e a REGRA INVIOLÁVEL, na rota da lista: cada linha tem só as chaves permitidas, e de `tenants`
 *        só se pede `id, name` — o banco falso tem e-mail e telefone na conta, e o caso fica
 *        vermelho se eles atravessarem.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * O `supabaseAdmin` é FALSO. A FK composta `(modelo, nicho_id)` e a CHECK `nicho_exige_modelo`
 * estão provadas num Postgres real no harness da `20261019000001`
 * (`scripts/harness/atendimentos-ia-2b1/`, casos 11 e 12). O banco falso as IMITA para que a rota
 * receba o MESMO código que receberia — o que se prova aqui é o que a rota decide com ele.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo (o admin não tem os tipos destas tabelas) */
import type { NextApiRequest, NextApiResponse } from 'next'
import { MODELOS, ROTULO_DO_MODELO, type Modelo } from '@/utils/atendimentos-ia-catalogo'
import { corpoParaAlternar, lerCorpoDaConfig, leituraRecusada, type ConfigDoOrcamentista } from '@/utils/orcamentista-config'

interface Perfil { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
interface Resposta<T> { data: T; error: { message: string; code?: string } | null }
interface Escrita { tabela: string; op: string; payload: Record<string, unknown> }

const CONTA_A = '00000000-0000-0000-0000-00000000000a'
const CONTA_B = '00000000-0000-0000-0000-00000000000b'
const CONTA_SEM_LINHA = '00000000-0000-0000-0000-00000000000c'
const N_ESQ = '33333333-3333-3333-3333-333333333331'
const N_AUTO = '33333333-3333-3333-3333-333333333332'
const N_INEXISTENTE = '33333333-3333-3333-3333-333333333339'
const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN_DA_A: Perfil = { id: 'u-admin-a', tenant_id: CONTA_A, role: 'admin', is_super_admin: false }

const NICHOS: { id: string; modelo: Modelo; nome: string }[] = [
    { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
    { id: N_AUTO, modelo: 'REVENDA', nome: 'Autopeças' },
]
/** As contas TÊM dado sensível no banco falso — é o que a regra inviolável não deixa atravessar. */
const TENANTS = [
    { id: CONTA_A, name: 'Conta Alfa', email: 'alfa@cliente.com', phone: '11 99999-0000', plan_status: 'ACTIVE' },
    { id: CONTA_B, name: 'Conta Beta', email: 'beta@cliente.com', phone: '11 98888-0000', plan_status: 'ACTIVE' },
    { id: CONTA_SEM_LINHA, name: 'Conta Gama', email: 'gama@cliente.com', phone: '11 97777-0000', plan_status: 'ACTIVE' },
]

/**
 * P3 — a linha É `ConfigDoOrcamentista`, com `modelo` e `nicho_id`. Sem os dois campos no tipo, o
 * `tsc` recusa este literal (TS2353). O jest não vê tipo nenhum: este é um portão do `tsc`.
 */
const linhaDaA = (): ConfigDoOrcamentista => ({
    tenant_id: CONTA_A,
    ativo: true,
    valor_adicional_brl: 99.9,
    teto_de_consumo_brl: 500,
    acao_ao_atingir_teto: 'BLOQUEAR',
    ativado_por: 'u-quem-ligou',
    ativado_em: '2026-10-18T12:00:00Z',
    atualizado_por: 'u-quem-ligou',
    atualizado_em: '2026-10-18T12:00:00Z',
    modelo: 'FABRICACAO',
    nicho_id: N_ESQ,
})
const linhaDaB = (): ConfigDoOrcamentista => ({
    ...linhaDaA(), tenant_id: CONTA_B, ativo: false, modelo: null, nicho_id: null,
})

const banco: {
    perfil: Perfil | null
    linhas: Record<string, ConfigDoOrcamentista>
    escritas: Escrita[]
    leituras: { tabela: string; colunas: string }[]
} = { perfil: SUPER, linhas: {}, escritas: [], leituras: [] }

jest.mock('@/supabase/admin', () => {
    const projetar = (linha: Record<string, unknown>, colunas: string) => {
        if (!colunas || colunas.trim() === '*') return { ...linha }
        return Object.fromEntries(colunas.split(',').map((c) => c.trim()).map((c) => [c, linha[c]]))
    }
    /** O que o Postgres faz depois do merge: a CHECK, e a FK composta para o nicho. */
    const conferir = (l: Record<string, unknown>): { code: string; message: string } | null => {
        if (l.nicho_id != null && l.modelo == null) return { code: '23514', message: 'violates check constraint "orcamentista_config_nicho_exige_modelo"' }
        if (l.nicho_id != null && !NICHOS.some((n) => n.id === l.nicho_id && n.modelo === l.modelo)) {
            return { code: '23503', message: 'violates foreign key constraint "orcamentista_config_modelo_nicho_id_fkey"' }
        }
        if (!TENANTS.some((t) => t.id === l.tenant_id)) return { code: '23503', message: 'violates foreign key constraint "orcamentista_config_tenant_id_fkey"' }
        return null
    }
    const PADRAO: Record<string, unknown> = { ativo: false, valor_adicional_brl: null, teto_de_consumo_brl: null, acao_ao_atingir_teto: 'AVISAR', ativado_por: null, ativado_em: null, atualizado_por: null, modelo: null, nicho_id: null }

    const consulta = (tabela: string) => {
        const filtros: [string, string, unknown][] = []
        let op: 'select' | 'upsert' | 'update' = 'select'
        let payload: Record<string, unknown> = {}
        let colunas = '*'
        const fonte = (): Record<string, unknown>[] => {
            if (tabela === 'orcamentista_config') return Object.values(banco.linhas) as unknown as Record<string, unknown>[]
            if (tabela === 'orcamentista_nicho') return NICHOS as unknown as Record<string, unknown>[]
            if (tabela === 'tenants') return TENANTS as unknown as Record<string, unknown>[]
            return []
        }
        const filtradas = () => fonte().filter((l) => filtros.every(([k, tipo, v]) => (tipo === 'in' ? (v as unknown[]).includes(l[k]) : l[k] === v)))
        const executar = async (): Promise<Resposta<any>> => {
            if (op === 'select') return { data: filtradas().map((l) => projetar(l, colunas)), error: null }
            const novas: Record<string, unknown>[] = []
            const alvos = op === 'upsert'
                ? [banco.linhas[payload.tenant_id as string] ?? { tenant_id: payload.tenant_id, ...PADRAO }]
                : filtradas()
            for (const atual of alvos) {
                const nova = { ...atual, ...payload }
                const erro = conferir(nova)
                if (erro) return { data: null, error: erro }
                novas.push(nova)
            }
            for (const n of novas) banco.linhas[n.tenant_id as string] = n as unknown as ConfigDoOrcamentista
            return { data: novas.map((l) => projetar(l, colunas)), error: null }
        }
        const q: any = {
            select: (c = '*') => { colunas = c; if (op === 'select') banco.leituras.push({ tabela, colunas: c }); return q },
            eq: (k: string, v: unknown) => { filtros.push([k, 'eq', v]); return q },
            in: (k: string, v: unknown[]) => { filtros.push([k, 'in', v]); return q },
            order: () => q,
            upsert: (p: Record<string, unknown>) => { op = 'upsert'; payload = p; banco.escritas.push({ tabela, op, payload: p }); return q },
            update: (p: Record<string, unknown>) => { op = 'update'; payload = p; banco.escritas.push({ tabela, op, payload: p }); return q },
            insert: (p: Record<string, unknown>) => { banco.escritas.push({ tabela, op: 'insert', payload: p }); throw new Error('o banco falso não aceita insert') },
            delete: () => { banco.escritas.push({ tabela, op: 'delete', payload: {} }); throw new Error('o banco falso não aceita delete') },
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
// As rotas são lidas DENTRO de cada caso: a da lista ainda não existe no commit dos portões, e um
// `require` no topo derrubaria o arquivo inteiro de uma vez — cada caso tem de ficar vermelho
// pela SUA razão.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDaConta = (): Rota => require('@/pages/api/super-admin/orcamentista/[tenantId]').default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDasContas = (): Rota => require('@/pages/api/super-admin/atendimentos-ia/contas').default

async function chamar(rota: Rota, req: { method: string; query?: object; body?: unknown }) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res } }
    await rota({ cookies: { token: 't' }, query: {}, ...req } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}
const patch = (tenantId: string, body: unknown) => chamar(rotaDaConta(), { method: 'PATCH', query: { tenantId }, body })
const escritasNaConfig = () => banco.escritas.filter((e) => e.tabela === 'orcamentista_config')

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(() => {
    banco.perfil = SUPER
    banco.linhas = { [CONTA_A]: linhaDaA(), [CONTA_B]: linhaDaB() }
    banco.escritas = []
    banco.leituras = []
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('P1 — ligar/desligar NÃO apaga modelo nem nicho; gravar modelo/nicho NÃO toca a ativação', () => {
    // MUTAÇÃO: `montarGravacao` passar a levar `modelo: null, nicho_id: null` (o registro inteiro).
    it('DESLIGAR a conta preserva o modelo e o nicho gravados', async () => {
        const r = await patch(CONTA_A, corpoParaAlternar(linhaDaA(), false))
        expect(r.status).toBe(200)
        expect(banco.linhas[CONTA_A].ativo).toBe(false)
        expect(banco.linhas[CONTA_A].modelo).toBe('FABRICACAO')
        expect(banco.linhas[CONTA_A].nicho_id).toBe(N_ESQ)
    })

    it('RELIGAR a conta preserva o modelo e o nicho gravados', async () => {
        banco.linhas[CONTA_A] = { ...linhaDaA(), ativo: false }
        const r = await patch(CONTA_A, corpoParaAlternar(banco.linhas[CONTA_A], true))
        expect(r.status).toBe(200)
        expect(banco.linhas[CONTA_A].ativo).toBe(true)
        expect(banco.linhas[CONTA_A].modelo).toBe('FABRICACAO')
        expect(banco.linhas[CONTA_A].nicho_id).toBe(N_ESQ)
    })

    // O CONTRASTE: o banco falso PODE mudar o modelo — sem isto, um banco que nunca o mudasse
    // passaria os dois casos acima sem distinguir nada.
    it('o contraste: gravar a segmentação MUDA o modelo e o nicho', async () => {
        const r = await patch(CONTA_A, { modelo: 'REVENDA', nicho_id: N_AUTO })
        expect(r.status).toBe(200)
        expect(banco.linhas[CONTA_A].modelo).toBe('REVENDA')
        expect(banco.linhas[CONTA_A].nicho_id).toBe(N_AUTO)
    })

    // MUTAÇÃO: a gravação da segmentação levar `ativo` (ou passar por `montarGravacao`).
    it('gravar modelo/nicho NÃO leva `ativo`, `ativado_por` nem `ativado_em` — e a linha os mantém', async () => {
        banco.linhas[CONTA_A] = { ...linhaDaA(), ativo: false }
        await patch(CONTA_A, { modelo: 'REVENDA', nicho_id: N_AUTO })
        const [escrita] = escritasNaConfig()
        expect(escrita).toBeDefined()
        for (const k of ['ativo', 'ativado_por', 'ativado_em']) expect(Object.keys(escrita.payload)).not.toContain(k)
        expect(banco.linhas[CONTA_A].ativo).toBe(false)
        expect(banco.linhas[CONTA_A].ativado_por).toBe('u-quem-ligou')
        expect(banco.linhas[CONTA_A].ativado_em).toBe('2026-10-18T12:00:00Z')
    })

    it('gravar modelo/nicho leva quem mudou e quando — a tabela não tem trigger', async () => {
        await patch(CONTA_A, { modelo: 'REVENDA', nicho_id: N_AUTO })
        expect(banco.linhas[CONTA_A].atualizado_por).toBe(SUPER.id)
        expect(banco.linhas[CONTA_A].atualizado_em).not.toBe('2026-10-18T12:00:00Z')
    })

    // MUTAÇÃO: a segmentação gravar por upsert — criaria uma linha para uma conta nunca ligada.
    it('conta SEM linha de configuração: 404, e nenhuma linha é criada', async () => {
        const r = await patch(CONTA_SEM_LINHA, { modelo: 'FABRICACAO', nicho_id: N_ESQ })
        expect(r.status).toBe(404)
        expect(banco.linhas[CONTA_SEM_LINHA]).toBeUndefined()
    })

    it('uma conta por chamada: gravar a segmentação de A não toca B', async () => {
        await patch(CONTA_A, { modelo: 'REVENDA', nicho_id: N_AUTO })
        expect(banco.linhas[CONTA_B]).toEqual(linhaDaB())
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('P2 — o contrato aceita modelo e nicho, e recusa antes do banco o que o banco recusaria', () => {
    it.each(MODELOS.map((m) => [m]))('modelo %s, sem nicho → 200, e gravado', async (modelo) => {
        const r = await patch(CONTA_A, { modelo, nicho_id: null })
        expect(r.status).toBe(200)
        expect(banco.linhas[CONTA_A].modelo).toBe(modelo)
        expect(banco.linhas[CONTA_A].nicho_id).toBeNull()
    })

    it('modelo E nicho nulos → 200: a segmentação pode voltar a "não definida"', async () => {
        const r = await patch(CONTA_A, { modelo: null, nicho_id: null })
        expect(r.status).toBe(200)
        expect(banco.linhas[CONTA_A].modelo).toBeNull()
    })

    // `INDUSTRIALIZACAO` é o SEGMENTO FISCAL do tenant (`calcType`): a confusão mais provável, e o
    // modelo do Atendimentos I.A. não é a segmentação fiscal (mockup, "não encosta").
    it.each([['INDUSTRIALIZACAO'], ['fabricacao'], [''], [7]])('modelo %p fora de MODELOS → 400, e nada é escrito', async (modelo) => {
        const r = await patch(CONTA_A, { modelo, nicho_id: null })
        expect(r.status).toBe(400)
        for (const m of MODELOS) expect(r.json.error).toContain(m)
        expect(escritasNaConfig()).toEqual([])
    })

    // O espelho da CHECK `orcamentista_config_nicho_exige_modelo`. O banco falso TAMBÉM recusa
    // (23514 → 400): por isso o caso afirma que NADA FOI ESCRITO, e não só o 400.
    it('nicho com modelo nulo → 400 ANTES do banco: nenhuma escrita', async () => {
        const r = await patch(CONTA_A, { modelo: null, nicho_id: N_ESQ })
        expect(r.status).toBe(400)
        expect(r.json.error).toMatch(/modelo/i)
        expect(escritasNaConfig()).toEqual([])
    })

    it('nicho que não é uuid → 400, e nada é escrito', async () => {
        const r = await patch(CONTA_A, { modelo: 'FABRICACAO', nicho_id: 'esquadrias' })
        expect(r.status).toBe(400)
        expect(escritasNaConfig()).toEqual([])
    })

    // Ausente não vira nulo (`ausente-vs-falso.md`): um `nicho_id` esquecido que virasse `null`
    // apagaria o nicho gravado.
    it.each([[{ modelo: 'FABRICACAO' }, 'nicho_id'], [{ nicho_id: N_ESQ }, 'modelo']])('só uma das duas chaves (%p) → 400 nomeando a que falta', async (body, falta) => {
        const r = await patch(CONTA_A, body)
        expect(r.status).toBe(400)
        expect(r.json.error).toContain(falta)
        expect(escritasNaConfig()).toEqual([])
    })

    // Misturar as duas gravações faria a da segmentação levar `ativo` — o que P1 proíbe.
    it('liga/desliga e segmentação no MESMO corpo → 400, e nada é escrito', async () => {
        const r = await patch(CONTA_A, { ...corpoParaAlternar(linhaDaA(), true), modelo: 'REVENDA', nicho_id: N_AUTO })
        expect(r.status).toBe(400)
        expect(escritasNaConfig()).toEqual([])
    })

    // MUTAÇÃO: mapear o 23503 da segmentação para 404 "Conta não encontrada" (o mapeamento antigo).
    it('par (modelo, nicho) de modelos diferentes → o BANCO recusa (23503), e a rota responde 409 dizendo o que segura', async () => {
        const r = await patch(CONTA_A, { modelo: 'REVENDA', nicho_id: N_ESQ })
        expect(r.status).toBe(409)
        expect(r.json.error).toContain('Esquadrias')
        expect(r.json.error).toContain(ROTULO_DO_MODELO.FABRICACAO)
        expect(r.json.error).toContain(ROTULO_DO_MODELO.REVENDA)
        // a recusa veio do banco: a escrita FOI tentada, e a linha ficou como estava
        expect(escritasNaConfig()).toHaveLength(1)
        expect(banco.linhas[CONTA_A]).toEqual(linhaDaA())
    })

    it('nicho que não existe no catálogo → 409, dizendo que ele não existe', async () => {
        const r = await patch(CONTA_A, { modelo: 'FABRICACAO', nicho_id: N_INEXISTENTE })
        expect(r.status).toBe(409)
        expect(r.json.error).toMatch(/não existe/)
        expect(banco.linhas[CONTA_A]).toEqual(linhaDaA())
    })

    it('o liga/desliga continua como era: conta inexistente no upsert segue 404', async () => {
        const r = await patch('00000000-0000-0000-0000-0000000000ff', corpoParaAlternar(undefined, true))
        expect(r.status).toBe(404)
    })

    it('a leitura pura: a segmentação sozinha é aceita; as quatro chaves sozinhas também', () => {
        expect(leituraRecusada(lerCorpoDaConfig({ modelo: 'SERVICO', nicho_id: null }))).toBe(false)
        expect(leituraRecusada(lerCorpoDaConfig(corpoParaAlternar(undefined, true)))).toBe(false)
    })

    it('só o super admin grava a segmentação: admin de conta → 403, e nada é escrito', async () => {
        banco.perfil = ADMIN_DA_A
        const r = await patch(CONTA_A, { modelo: 'REVENDA', nicho_id: N_AUTO })
        expect(r.status).toBe(403)
        expect(escritasNaConfig()).toEqual([])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('P3 — o tipo da linha declara modelo e nicho_id', () => {
    // O portão de verdade é o `tsc` sobre `linhaDaA` (ver o topo). Este caso afirma o lado do
    // valor: a linha montada com o tipo tem as duas chaves.
    it('a linha tipada carrega as duas chaves', () => {
        const l: ConfigDoOrcamentista = linhaDaA()
        expect(l.modelo).toBe('FABRICACAO')
        expect(l.nicho_id).toBe(N_ESQ)
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('a lista de contas ligadas — e a REGRA INVIOLÁVEL na rota', () => {
    const CHAVES_PERMITIDAS = ['modelo', 'nicho_id', 'nicho_nome', 'nome', 'tenant_id']

    it('devolve SÓ as contas com o Atendimentos I.A. ligado, com nome, modelo e nicho', async () => {
        const r = await chamar(rotaDasContas(), { method: 'GET' })
        expect(r.status).toBe(200)
        expect(r.json).toEqual([{ tenant_id: CONTA_A, nome: 'Conta Alfa', modelo: 'FABRICACAO', nicho_id: N_ESQ, nicho_nome: 'Esquadrias' }])
    })

    it('cada linha tem SÓ as chaves permitidas — nada do cadastro da conta atravessa', async () => {
        banco.linhas[CONTA_B] = { ...linhaDaB(), ativo: true }
        const r = await chamar(rotaDasContas(), { method: 'GET' })
        expect(r.json).toHaveLength(2)
        for (const linha of r.json) expect(Object.keys(linha).sort()).toEqual(CHAVES_PERMITIDAS)
        const texto = JSON.stringify(r.json)
        for (const t of TENANTS) {
            expect(texto).not.toContain(t.email)
            expect(texto).not.toContain(t.phone)
        }
    })

    it('de `tenants` só se pedem `id` e `name`', async () => {
        await chamar(rotaDasContas(), { method: 'GET' })
        const deTenants = banco.leituras.filter((l) => l.tabela === 'tenants')
        expect(deTenants.length).toBeGreaterThan(0)
        for (const l of deTenants) expect(l.colunas.split(',').map((c) => c.trim()).sort()).toEqual(['id', 'name'])
    })

    it('conta ligada sem modelo: modelo e nicho nulos — não definidos, e não inventados', async () => {
        banco.linhas[CONTA_B] = { ...linhaDaB(), ativo: true }
        const r = await chamar(rotaDasContas(), { method: 'GET' })
        expect(r.json.find((l: { tenant_id: string }) => l.tenant_id === CONTA_B)).toEqual({ tenant_id: CONTA_B, nome: 'Conta Beta', modelo: null, nicho_id: null, nicho_nome: null })
    })

    it('admin de conta → 403, e nada é lido; sem sessão → 401', async () => {
        banco.perfil = ADMIN_DA_A
        expect((await chamar(rotaDasContas(), { method: 'GET' })).status).toBe(403)
        expect(banco.leituras).toEqual([])
        banco.perfil = null
        expect((await chamar(rotaDasContas(), { method: 'GET' })).status).toBe(401)
        expect(banco.leituras).toEqual([])
    })

    it('método errado → 405, e nada é lido', async () => {
        expect((await chamar(rotaDasContas(), { method: 'POST' })).status).toBe(405)
        expect(banco.leituras).toEqual([])
    })
})
