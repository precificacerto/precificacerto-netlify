/**
 * @jest-environment node
 *
 * PORTÃO — as ETAPAS da família-instância: a regra pura (`lerCorpoDasEtapas`, o rascunho da tela) e a rota
 * `/api/super-admin/base-de-conhecimento/etapas` (migrações 20261027000003 e 20261028000001: a etapa é da matéria-prima de UMA empresa).
 *
 * POR QUÊ: a ETAPA é o que o consultor cadastra por família (27/10/2026). Desde 31/10/2026 (migração 20261031000002) ela SELECIONA um item do
 * CATÁLOGO DE ETAPAS — o nome, a ação da lista fechada e as abas vêm de lá — e guarda a instrução, o número e o motor. Grava-se por função
 * SECURITY DEFINER com log.
 *
 * O que este portão fica vermelho:
 *   (1) a regra do corpo: o item do catálogo é obrigatório (uuid), a instrução até 4.000 contados como o banco conta (pontos de código), e o
 *       nome, a ação, as abas e o número NÃO vão no corpo — o número é a posição na lista; cada recusa diz QUAL etapa;
 *   (2) o rascunho da tela: subir e descer, comparar com o gravado, o item em branco da etapa nova;
 *   (3) a rota: só o super admin (404 para os outros), só GET e PUT, o GET só da família-instância DESTA empresa, na ordem do
 *       número, com o nome, a ação e as abas lidos do ITEM (e recusando item com ação fora da lista), com os motores do catálogo do MESMO tipo
 *       e o catálogo de etapas; o PUT chamando SÓ a função, com a empresa da URL, a matéria-prima do corpo e o autor da sessão — nunca um
 *       insert, um update ou um delete direto;
 *   (4) a recusa chega a quem clicou: a mensagem da função nos códigos dela, a frase fixa nos outros.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipos */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
    ACOES_DA_ETAPA, ABAS_DA_ETAPA, LIMITE_DA_INSTRUCAO_DA_ETAPA, MAXIMO_DE_ETAPAS_DA_FAMILIA,
    abasEmOrdem, corpoDoRascunho, etapasMudaram, lerCorpoDasEtapas, inserirEtapaAbaixo, moverEtapa, novaEtapaNoRascunho, rascunhoDasEtapas, rotaDasEtapas,
    type EtapaDaFamilia,
} from '@/utils/atendimentos-ia-etapas'

type Linha = Record<string, any>
const SUPER: Linha = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN: Linha = { id: 'u-admin', tenant_id: 't-1', role: 'admin', is_super_admin: false }
const E1 = '00000000-0000-4000-8000-0000000000e1'
const E2 = '00000000-0000-4000-8000-0000000000e2'
const M1 = '00000000-0000-4000-8000-0000000000a1'
const M2 = '00000000-0000-4000-8000-0000000000a2'
const T = '00000000-0000-4000-8000-0000000000d1'
const T2 = '00000000-0000-4000-8000-0000000000d2'
const MP = '00000000-0000-4000-8000-0000000000b1'
const MP2 = '00000000-0000-4000-8000-0000000000b2'
const MP_DA_OUTRA = '00000000-0000-4000-8000-0000000000b3'
const MP_SEM_TIPO = '00000000-0000-4000-8000-0000000000b4'
// os itens do catálogo de etapas (20261031000002)
const C_APANHAR = '00000000-0000-4000-8000-0000000000c1'
const C_CONFIRMAR = '00000000-0000-4000-8000-0000000000c2'
const C_OUTRA = '00000000-0000-4000-8000-0000000000c3'

const estado = {
    usuario: SUPER as Linha | null,
    db: {} as Record<string, Linha[]>,
    leituras: [] as string[],
    rpcs: [] as Array<{ funcao: string; args: Linha }>,
    rpcResposta: (): { data: unknown; error: { code?: string; message: string } | null } => ({ data: { orcamentista_familia_etapa: [] }, error: null }),
}

function montar() {
    estado.usuario = SUPER
    estado.leituras = []
    estado.rpcs = []
    estado.rpcResposta = () => ({ data: { orcamentista_familia_etapa: [] }, error: null })
    estado.db = {
        users: [SUPER, ADMIN],
        orcamentista_familia_catalogo: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }],
        tenants: [{ id: T, name: 'De Paula' }, { id: T2, name: 'Outra' }],
        orcamentista_materia_prima: [
            { id: MP, tenant_id: T, familia: 'PVC', nome: 'Esquadrias de PVC' },
            { id: MP2, tenant_id: T, familia: 'PVC', nome: 'PVC Linha 2' },
            { id: MP_DA_OUTRA, tenant_id: T2, familia: 'PVC', nome: 'PVC da outra' },
            { id: MP_SEM_TIPO, tenant_id: T, familia: null, nome: 'Sem tipo' },
        ],
        orcamentista_fornecedor: [{ id: 'f-wolff', nome: 'Wolff' }, { id: 'f-roller', nome: 'Roller' }],
        orcamentista_motor: [
            { id: M1, fornecedor_id: 'f-wolff', categoria_chave: 'PERFIL', arquivo_nome: 'Wolff.xlsx', arquivado_em: null, criado_em: '2026-10-27T10:00:00Z' },
            { id: M2, fornecedor_id: 'f-roller', categoria_chave: 'PERSIANAS', arquivo_nome: 'Roller.xlsx', arquivado_em: null, criado_em: '2026-10-27T11:00:00Z' },
            { id: 'm-arq-sem', fornecedor_id: 'f-roller', categoria_chave: 'PERSIANAS', arquivo_nome: 'Roller velha.xlsx', arquivado_em: '2026-10-01T00:00:00Z', criado_em: '2026-09-02T00:00:00Z' },
            { id: 'm-arq', fornecedor_id: 'f-wolff', categoria_chave: 'PERFIL', arquivo_nome: 'Velha.xlsx', arquivado_em: '2026-10-01T00:00:00Z', criado_em: '2026-09-01T00:00:00Z' },
            { id: 'm-alu', fornecedor_id: 'f-wolff', categoria_chave: 'PERFIL', arquivo_nome: 'Alumínio.xlsx', arquivado_em: null, criado_em: '2026-10-27T12:00:00Z' },
        ],
        // as famílias de cada motor (20261029000003): o de persiana atua em PVC e ALUMINIO; o de alumínio, só em ALUMINIO
        orcamentista_motor_familia: [
            { motor_id: M1, familia: 'PVC' },
            { motor_id: M2, familia: 'PVC' }, { motor_id: M2, familia: 'ALUMINIO' },
            { motor_id: 'm-arq-sem', familia: 'PVC' },
            { motor_id: 'm-arq', familia: 'PVC' },
            { motor_id: 'm-alu', familia: 'ALUMINIO' },
        ],
        orcamentista_etapa_catalogo: [
            { id: C_CONFIRMAR, nome: 'Confirmar', acao: 'CONFIRMAR', abas: [], ordem: 2, criado_em: '2026-10-31T00:00:00Z' },
            { id: C_APANHAR, nome: 'Apanhar o pedido', acao: 'APANHAR', abas: ['variaveis', 'tipologias'], ordem: 1, criado_em: '2026-10-31T00:00:00Z' },
            { id: C_OUTRA, nome: 'Da outra família PVC', acao: 'APANHAR', abas: [], ordem: 3, criado_em: '2026-10-31T00:00:00Z' },
        ],
        // a etapa da conta não tem mais rotulo, acao nem abas (saíram na 20261031000002): o nome, a ação e as abas vêm do item
        orcamentista_familia_etapa: [
            { id: E2, tenant_id: T, materia_prima_id: MP, familia: 'PVC', numero: 2, etapa_catalogo_id: C_CONFIRMAR, instrucao: 'confirme com o vendedor', motor_id: M2 },
            { id: E1, tenant_id: T, materia_prima_id: MP, familia: 'PVC', numero: 1, etapa_catalogo_id: C_APANHAR, instrucao: '', motor_id: M1 },
            { id: 'da-outra-familia', tenant_id: T, materia_prima_id: MP2, familia: 'PVC', numero: 1, etapa_catalogo_id: C_OUTRA, instrucao: '' },
            { id: 'da-outra-empresa', tenant_id: T2, materia_prima_id: MP_DA_OUTRA, familia: 'PVC', numero: 1, etapa_catalogo_id: C_APANHAR, instrucao: '' },
        ],
    }
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> => (estado.usuario
                ? { data: { user: { id: String(estado.usuario.id) } }, error: null }
                : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: (tabela: string) => {
            const filtros: Array<(l: Linha) => boolean> = []
            const ordem: Array<[string, boolean]> = []
            const q: any = {}
            // como o PostgREST: só voltam as colunas PEDIDAS — pedir de menos faz o campo sumir da linha (o #158 E13)
            let pedidas: string[] | null = null
            q.select = (colunas?: string) => { pedidas = colunas && colunas !== '*' ? colunas.split(',').map((c) => c.trim()) : null; return q }
            q.eq = (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q }
            q.is = (c: string, v: unknown) => { filtros.push((l) => (l[c] ?? null) === v); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q }
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem.push([c, o?.ascending !== false]); return q }
            const linhas = () => {
                let ls = (estado.db[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))
                const projetar = (l: Linha) => (pedidas ? Object.fromEntries(pedidas.map((c) => [c, l[c]])) : l)
                for (const [c, asc] of [...ordem].reverse()) ls = [...ls].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1))
                return ls.map(projetar)
            }
            q.single = async (): Promise<{ data: Linha | null; error: null }> => ({ data: linhas()[0] ?? null, error: null })
            q.maybeSingle = async (): Promise<{ data: Linha | null; error: null }> => { estado.leituras.push(tabela); return { data: linhas()[0] ?? null, error: null } }
            q.then = (ok: (v: unknown) => unknown) => { estado.leituras.push(tabela); return Promise.resolve({ data: linhas(), error: null }).then(ok) }
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) q[escrita] = () => { throw new Error(`a rota das etapas não escreve direto: ${escrita} ${tabela}`) }
            return q
        },
        rpc: async (funcao: string, args: Linha) => { estado.rpcs.push({ funcao, args }); return estado.rpcResposta() },
    },
}))

beforeEach(montar)
const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())

/* eslint-disable @typescript-eslint/no-require-imports */
const rota = () => require('@/pages/api/super-admin/base-de-conhecimento/etapas').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-enable @typescript-eslint/no-require-imports */

/** `mp` é a matéria-prima do GET (na query); o PUT a leva no corpo. `tenant` é sempre o da URL. */
async function chamar(metodo: string, mp: string | undefined, body: unknown = {}, tenant: string = T) {
    const saida = { status: 0, corpo: null as any }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(c: unknown) { saida.corpo = c; return res },
        setHeader() { return res },
        end() { return res },
    } as unknown as NextApiResponse
    await rota()({ method: metodo, query: { tenant, materia_prima: mp }, cookies: { token: 'sessao' }, body, headers: {} } as unknown as NextApiRequest, res)
    return saida
}

const etapa = (extra: Linha = {}) => ({ etapa_catalogo_id: C_APANHAR, instrucao: '', ...extra })
const ler = (...etapas: unknown[]) => lerCorpoDasEtapas({ etapas })

describe('(1) a regra do corpo', () => {
    it('as cinco ações e as doze abas, como o portão de paridade as amarra à migração', () => {
        expect(ACOES_DA_ETAPA).toHaveLength(5)
        expect(ABAS_DA_ETAPA).toHaveLength(12)
    })

    it('uma etapa válida passa, limpa (a instrução sem as pontas) e na ordem da lista', () => {
        const r = ler(etapa({ instrucao: '  pergunte a tipologia\n' }), etapa({ etapa_catalogo_id: C_CONFIRMAR }))
        expect(r).toEqual({
            ok: true,
            etapas: [{ etapa_catalogo_id: C_APANHAR, instrucao: 'pergunte a tipologia' }, { etapa_catalogo_id: C_CONFIRMAR, instrucao: '' }],
        })
    })

    it('a instrução pode faltar: vira vazia, e o id passa quando é uuid', () => {
        expect(ler({ etapa_catalogo_id: C_OUTRA, id: E1 })).toEqual({ ok: true, etapas: [{ id: E1, etapa_catalogo_id: C_OUTRA, instrucao: '' }] })
    })

    it('lista vazia é válida (família sem etapa); o que não é lista, não', () => {
        expect(ler()).toEqual({ ok: true, etapas: [] })
        for (const corpo of [null, undefined, 'x', 5, [], {}, { etapas: 'x' }, { etapas: {} }]) expect(lerCorpoDasEtapas(corpo)).toEqual({ ok: false, erro: 'As etapas vão numa lista.' })
    })

    it.each([[undefined], [null], [''], ['nao-e-uuid'], [3]])('o item do catálogo %p: recusa nomeando a etapa (a conta escolhe; nenhum vem por omissão)', (item) => {
        expect(ler(etapa(), { ...etapa(), etapa_catalogo_id: item })).toEqual({ ok: false, erro: 'Etapa 2: escolha a etapa do catálogo.' })
    })

    it.each([['rotulo'], ['acao'], ['abas'], ['numero'], ['nome']])('o campo "%s" não vai no corpo: o nome, a ação e as abas vêm do catálogo; o número é a posição', (campo) => {
        expect(ler(etapa({ [campo]: 'x' }))).toEqual({
            ok: false,
            erro: `Etapa 1: o campo "${campo}" não existe (só id, etapa_catalogo_id, instrucao e motor_id). O nome, a ação e as abas vêm do catálogo; o número é a posição na lista.`,
        })
    })

    it('a instrução: 4.000 passa; 4.001 recusa dizendo quantos; emoji conta UM (como o banco), não dois', () => {
        expect(ler(etapa({ instrucao: 'a'.repeat(LIMITE_DA_INSTRUCAO_DA_ETAPA) })).ok).toBe(true)
        expect(ler(etapa({ instrucao: 'a'.repeat(LIMITE_DA_INSTRUCAO_DA_ETAPA + 1) }))).toEqual({
            ok: false, erro: 'Etapa 1: a instrução tem 4.001 caracteres; o limite é 4.000. Encurte antes de salvar.',
        })
        expect(ler(etapa({ instrucao: '😀'.repeat(LIMITE_DA_INSTRUCAO_DA_ETAPA) })).ok).toBe(true)
        expect(ler(etapa({ instrucao: 5 }))).toEqual({ ok: false, erro: 'Etapa 1: a instrução é um texto.' })
    })

    it('o motor_id: uuid aponta, null limpa, ausente não mexe; o que não é uuid recusa nomeando a etapa', () => {
        expect(ler(etapa({ motor_id: M1 }))).toEqual({ ok: true, etapas: [{ etapa_catalogo_id: C_APANHAR, instrucao: '', motor_id: M1 }] })
        expect(ler(etapa({ motor_id: null }))).toEqual({ ok: true, etapas: [{ etapa_catalogo_id: C_APANHAR, instrucao: '', motor_id: null }] })
        expect(ler(etapa())).toEqual({ ok: true, etapas: [{ etapa_catalogo_id: C_APANHAR, instrucao: '' }] })
        expect(ler(etapa(), etapa({ motor_id: 'x' }))).toEqual({ ok: false, erro: 'Etapa 2: o motor_id não é um uuid (ou null, para limpar).' })
        expect(ler(etapa({ motor_id: 5 })).ok).toBe(false)
    })

    it('o id: uuid, sem repetir na lista', () => {
        expect(ler(etapa({ id: 'nao-e-uuid' }))).toEqual({ ok: false, erro: 'Etapa 1: o id não é um uuid.' })
        expect(ler(etapa({ id: E1 }), etapa({ id: E1 }))).toEqual({ ok: false, erro: 'Etapa 2: o id aparece mais de uma vez na lista.' })
        expect(ler(etapa({ id: null }))).toEqual({ ok: true, etapas: [{ etapa_catalogo_id: C_APANHAR, instrucao: '' }] })
    })

    it('o mesmo item do catálogo em duas etapas da família passa (nenhuma regra o proíbe)', () => {
        expect(ler(etapa(), etapa()).ok).toBe(true)
    })

    it('o máximo: 50 etapas passam, 51 recusam', () => {
        expect(lerCorpoDasEtapas({ etapas: Array.from({ length: MAXIMO_DE_ETAPAS_DA_FAMILIA }, () => etapa()) }).ok).toBe(true)
        expect(lerCorpoDasEtapas({ etapas: Array.from({ length: MAXIMO_DE_ETAPAS_DA_FAMILIA + 1 }, () => etapa()) })).toEqual({ ok: false, erro: 'A família tem 51 etapas na lista; o máximo é 50.' })
    })

    it('item que não é objeto: recusa nomeando a etapa', () => {
        expect(lerCorpoDasEtapas({ etapas: [etapa(), 'x'] })).toEqual({ ok: false, erro: 'Etapa 2: não é um objeto.' })
        expect(lerCorpoDasEtapas({ etapas: [[]] })).toEqual({ ok: false, erro: 'Etapa 1: não é um objeto.' })
    })
})

describe('(2) o rascunho da tela', () => {
    const gravadas: EtapaDaFamilia[] = [
        { id: E1, numero: 1, etapa_catalogo_id: C_APANHAR, rotulo: 'Apanhar o pedido', acao: 'APANHAR', abas: ['tipologias', 'variaveis'], instrucao: 'a', motor_id: null },
        { id: E2, numero: 2, etapa_catalogo_id: C_CONFIRMAR, rotulo: 'Confirmar', acao: 'CONFIRMAR', abas: [], instrucao: '', motor_id: null },
    ]

    it('o rascunho sem mexer não mudou; trocar o item ou a instrução muda', () => {
        const r = rascunhoDasEtapas(gravadas)
        expect(etapasMudaram(r, gravadas)).toBe(false)
        expect(etapasMudaram([{ ...r[0], etapa_catalogo_id: C_OUTRA }, r[1]], gravadas)).toBe(true)
        expect(etapasMudaram([{ ...r[0], instrucao: 'b' }, r[1]], gravadas)).toBe(true)
    })

    it('o rascunho guarda só o que é da conta (item, instrução, motor) — o nome, a ação e as abas não são editáveis aqui', () => {
        expect(rascunhoDasEtapas(gravadas)[0]).toEqual({ local: E1, id: E1, etapa_catalogo_id: C_APANHAR, instrucao: 'a', motor_id: null, motor_gravado: null })
    })

    it('espaço nas pontas da instrução NÃO é mudança (a rota os tira)', () => {
        const r = rascunhoDasEtapas(gravadas)
        expect(etapasMudaram([{ ...r[0], instrucao: ' a ' }, r[1]], gravadas)).toBe(false)
    })

    it('reordenar muda; acrescentar muda; tirar a nova do rascunho desfaz', () => {
        const r = rascunhoDasEtapas(gravadas)
        expect(etapasMudaram(moverEtapa(r, 0, 1), gravadas)).toBe(true)
        const com = [...r, novaEtapaNoRascunho()]
        expect(etapasMudaram(com, gravadas)).toBe(true)
        expect(etapasMudaram(com.filter((e) => e.id !== null), gravadas)).toBe(false)
    })

    it('mover: troca com a vizinha; nas pontas e fora da lista, não mexe', () => {
        expect(moverEtapa(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
        expect(moverEtapa(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
        expect(moverEtapa(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
        expect(moverEtapa(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
        expect(moverEtapa(['a', 'b', 'c'], 5, 1)).toEqual(['a', 'b', 'c'])
    })

    it('a etapa nova nasce SEM item do catálogo — nenhum vem por omissão — e o corpo a recusa nomeando', () => {
        const nova = novaEtapaNoRascunho()
        expect(nova).toEqual(expect.objectContaining({ id: null, etapa_catalogo_id: null, instrucao: '' }))
        expect(lerCorpoDasEtapas(corpoDoRascunho([nova]))).toEqual({ ok: false, erro: 'Etapa 1: escolha a etapa do catálogo.' })
        expect(novaEtapaNoRascunho().local).not.toBe(nova.local)
    })

    it('o corpo leva o id só da etapa gravada, e o item escolhido; as abas da tela saem na ordem da planilha', () => {
        const r = rascunhoDasEtapas(gravadas)
        const corpo = corpoDoRascunho([r[0], { ...novaEtapaNoRascunho(), etapa_catalogo_id: C_CONFIRMAR }])
        expect(corpo.etapas[0]).toEqual({ id: E1, etapa_catalogo_id: C_APANHAR, instrucao: 'a' })
        expect(corpo.etapas[1]).toEqual({ etapa_catalogo_id: C_CONFIRMAR, instrucao: '' })
        expect(abasEmOrdem(['variaveis', 'perfis', 'tipologias'])).toEqual(['tipologias', 'perfis', 'variaveis'])
        expect(abasEmOrdem(['nada'])).toEqual([])
    })

    it('o motor: trocar ou limpar muda; sem tocar, não; o corpo só leva motor_id quando MUDOU (salvar a instrução não mexe no motor)', () => {
        const r = rascunhoDasEtapas(gravadas)
        expect(etapasMudaram([{ ...r[0], motor_id: M1 }, r[1]], gravadas)).toBe(true)
        const comMotor: EtapaDaFamilia[] = [{ ...gravadas[0], motor_id: M1 }, gravadas[1]]
        const rm = rascunhoDasEtapas(comMotor)
        expect(etapasMudaram(rm, comMotor)).toBe(false)
        expect(etapasMudaram([{ ...rm[0], motor_id: null }, rm[1]], comMotor)).toBe(true)
        expect(etapasMudaram([{ ...rm[0], motor_id: M2 }, rm[1]], comMotor)).toBe(true)
        expect(corpoDoRascunho(rm).etapas.map((e) => 'motor_id' in e)).toEqual([false, false])
        expect(corpoDoRascunho([{ ...rm[0], instrucao: 'Outra' }, rm[1]]).etapas.map((e) => 'motor_id' in e)).toEqual([false, false])
        expect(corpoDoRascunho([{ ...rm[0], motor_id: M2 }, { ...rm[1], motor_id: M1 }]).etapas.map((e) => (e as Linha).motor_id)).toEqual([M2, M1])
        expect((corpoDoRascunho([{ ...rm[0], motor_id: null }, rm[1]]).etapas[0] as Linha).motor_id).toBeNull()
    })

    it('uma etapa NOVA com motor leva o motor no corpo; sem motor, não leva campo nenhum', () => {
        const nova = { ...novaEtapaNoRascunho(), etapa_catalogo_id: C_CONFIRMAR }
        expect('motor_id' in corpoDoRascunho([nova]).etapas[0]).toBe(false)
        expect((corpoDoRascunho([{ ...nova, motor_id: M1 }]).etapas[0] as Linha).motor_id).toBe(M1)
    })

    it('inserir etapa abaixo: a nova entra logo depois da posição, as de baixo descem, e a lista de cima não muda', () => {
        const r = rascunhoDasEtapas(gravadas)
        const com = inserirEtapaAbaixo(r, 0)
        expect(com.map((e) => e.id)).toEqual([E1, null, E2])
        expect(com[1]).toEqual(expect.objectContaining({ etapa_catalogo_id: null, motor_id: null, motor_gravado: null }))
        expect(inserirEtapaAbaixo(r, 1).map((e) => e.id)).toEqual([E1, E2, null])
        expect(inserirEtapaAbaixo(r, 9).map((e) => e.id)).toEqual([E1, E2, null])
        expect(inserirEtapaAbaixo([], 0)).toHaveLength(1)
        expect(r).toHaveLength(2)
    })

    it('a rota leva a empresa e a família-instância na query, escapadas', () => {
        expect(rotaDasEtapas(T, MP)).toBe(`/api/super-admin/base-de-conhecimento/etapas?tenant=${T}&materia_prima=${MP}`)
        expect(rotaDasEtapas(T)).toBe(`/api/super-admin/base-de-conhecimento/etapas?tenant=${T}`)
        expect(rotaDasEtapas('a&b', 'c d')).toBe('/api/super-admin/base-de-conhecimento/etapas?tenant=a%26b&materia_prima=c%20d')
    })
})

describe('(3) a rota: só o super admin, e só a função grava', () => {
    it('quem não é super admin recebe 404 no GET e no PUT, e nada é lido nem gravado', async () => {
        estado.usuario = ADMIN
        expect((await chamar('GET', MP)).status).toBe(404)
        expect((await chamar('PUT', undefined, { materia_prima: MP, etapas: [] })).status).toBe(404)
        expect(estado.leituras.filter((t) => t.startsWith('orcamentista_'))).toEqual([])
        expect(estado.rpcs).toEqual([])
    })

    it('POST, PATCH e DELETE são 405', async () => {
        for (const m of ['POST', 'PATCH', 'DELETE']) expect((await chamar(m, MP)).status).toBe(405)
        expect(estado.rpcs).toEqual([])
    })

    it('GET: as etapas DESTA família-instância na ORDEM do número — sem as da outra família PVC da mesma empresa, nem as de outra empresa', async () => {
        const r = await chamar('GET', MP)
        expect(r.status).toBe(200)
        expect(r.corpo.familia).toBe('PVC')
        expect(r.corpo.etapas.map((e: Linha) => [e.numero, e.rotulo])).toEqual([[1, 'Apanhar o pedido'], [2, 'Confirmar']])
        // o nome, a ação e as abas vêm do ITEM do catálogo que a etapa seleciona; o número, a instrução e o motor, da conta
        expect(r.corpo.etapas[0]).toEqual({ id: E1, numero: 1, etapa_catalogo_id: C_APANHAR, rotulo: 'Apanhar o pedido', acao: 'APANHAR', abas: ['variaveis', 'tipologias'], instrucao: '', motor_id: M1 })
        expect(r.corpo.etapas[1]).toEqual(expect.objectContaining({ etapa_catalogo_id: C_CONFIRMAR, rotulo: 'Confirmar', acao: 'CONFIRMAR', instrucao: 'confirme com o vendedor' }))
        // renomear o item no catálogo muda o nome da etapa da conta (a conta não guarda cópia)
        estado.db.orcamentista_etapa_catalogo[1].nome = 'Apanhar (renomeada)'
        expect((await chamar('GET', MP)).corpo.etapas[0].rotulo).toBe('Apanhar (renomeada)')
        expect((await chamar('GET', MP2)).corpo.etapas.map((e: Linha) => e.rotulo)).toEqual(['Da outra família PVC'])
    })

    it('GET: a família PRONTA (todas as etapas com motor) e a que não está, com a lista das etapas sem motor (29/10/2026)', async () => {
        const pronta = await chamar('GET', MP)
        expect([pronta.corpo.pronta, pronta.corpo.etapas_sem_motor]).toEqual([true, []])
        const sem = await chamar('GET', MP2)
        expect([sem.corpo.pronta, sem.corpo.etapas_sem_motor]).toEqual([false, [{ id: 'da-outra-familia', numero: 1, rotulo: 'Da outra família PVC' }]])
        // o motor arquivado limpou a etapa 2 da MP (20261029000005): a família deixa de estar pronta, e a etapa vem nomeada
        estado.db.orcamentista_familia_etapa[0].motor_id = null
        const depois = await chamar('GET', MP)
        expect([depois.corpo.pronta, depois.corpo.etapas_sem_motor]).toEqual([false, [{ id: E2, numero: 2, rotulo: 'Confirmar' }]])
        expect(estado.rpcs).toEqual([])
    })

    it('GET: a matéria-prima de OUTRA empresa é 404 (a da URL manda), e a sem id ou inexistente também; empresa inexistente é 404', async () => {
        expect((await chamar('GET', MP_DA_OUTRA)).status).toBe(404)
        expect((await chamar('GET', undefined)).status).toBe(404)
        expect((await chamar('GET', '00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
        expect((await chamar('GET', MP, {}, '00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
        expect((await chamar('GET', MP_DA_OUTRA, {}, T2)).corpo.etapas.map((e: Linha) => e.id)).toEqual(['da-outra-empresa'])
    })

    it('GET: cada etapa diz o motor que aponta (null quando a linha não tem), e os motores são do CATÁLOGO, os que ATUAM na família (de qualquer categoria), não arquivados', async () => {
        estado.db.orcamentista_familia_etapa[0].motor_id = undefined
        const r = await chamar('GET', MP)
        expect(r.corpo.etapas.map((e: Linha) => e.motor_id)).toEqual([M1, null])
        expect(r.corpo.motores.map((m: Linha) => [m.id, m.fornecedor, m.categoria, m.familias, m.fornecedor_id])).toEqual([
            [M1, 'Wolff', 'PERFIL', ['PVC'], 'f-wolff'],
            [M2, 'Roller', 'PERSIANAS', ['ALUMINIO', 'PVC'], 'f-roller'],
        ])
        // o combo não precisa de quem usa nem de tipologias: a leitura leve não as traz
        expect(r.corpo.motores[0]).toMatchObject({ tipologias: null, usos: [] })
        expect(r.corpo).not.toHaveProperty('contas')
    })

    it('GET: a família SEM tipo devolve familia null e nenhum motor (sem tipo não há etapa)', async () => {
        const r = await chamar('GET', MP_SEM_TIPO)
        expect(r.status).toBe(200)
        expect(r.corpo).toEqual({ familia: null, etapas: [], motores: [], catalogo: expect.any(Array), pronta: false, etapas_sem_motor: [] })
    })

    it('PUT: o motor_id do item vai à função como veio — uuid aponta, null limpa — e o item sem motor_id não o leva', async () => {
        const r = await chamar('PUT', undefined, { materia_prima: MP, etapas: [{ id: E1, etapa_catalogo_id: C_APANHAR, motor_id: M2 }, { id: E2, etapa_catalogo_id: C_CONFIRMAR, motor_id: null }, { etapa_catalogo_id: C_OUTRA }] })
        expect(r.status).toBe(200)
        const itens = estado.rpcs[0].args.p_etapas as Linha[]
        expect(itens[0].motor_id).toBe(M2)
        expect('motor_id' in itens[1] && itens[1].motor_id === null).toBe(true)
        expect('motor_id' in itens[2]).toBe(false)
    })

    it('GET: família sem etapas é a lista vazia (ainda não cadastrada)', async () => {
        estado.db.orcamentista_familia_etapa = []
        expect((await chamar('GET', MP)).corpo.etapas).toEqual([])
    })

    it('GET: o catálogo de etapas vem junto, na ordem, sem quem usa (o combo só precisa dos itens)', async () => {
        const r = await chamar('GET', MP)
        expect(r.corpo.catalogo.map((c: Linha) => [c.ordem, c.nome, c.acao])).toEqual([[1, 'Apanhar o pedido', 'APANHAR'], [2, 'Confirmar', 'CONFIRMAR'], [3, 'Da outra família PVC', 'APANHAR']])
        expect(r.corpo.catalogo.every((c: Linha) => Array.isArray(c.usos) && c.usos.length === 0)).toBe(true)
    })

    it('GET: a etapa que aponta um item que o catálogo não devolve é ERRO (500), nunca uma etapa sem nome', async () => {
        estado.db.orcamentista_familia_etapa[0].etapa_catalogo_id = '00000000-0000-4000-8000-0000000000cf'
        const r = await chamar('GET', MP)
        expect(r.status).toBe(500)
        expect(r.corpo).toEqual({ error: 'Falha ao ler a base de conhecimento.' })
    })

    it('GET: item com ação fora da lista é ERRO (500), nunca uma etapa sem ação', async () => {
        estado.db.orcamentista_etapa_catalogo[0].acao = 'ETAPA_NOVA'
        const r = await chamar('GET', MP)
        expect(r.status).toBe(500)
        expect(r.corpo).toEqual({ error: 'Falha ao ler a base de conhecimento.' })
    })

    it('GET: uma aba que a planilha não tem some do que é devolvido, em vez de ser repassada', async () => {
        estado.db.orcamentista_etapa_catalogo[1].abas = ['perfis', 'itens_de_preco']
        const r = await chamar('GET', MP)
        expect(r.corpo.etapas.find((e: Linha) => e.id === E1).abas).toEqual(['perfis'])
    })

    it('PUT: chama superadmin_gravar_etapas_da_materia_prima com a empresa da URL, a matéria-prima do corpo, o autor da sessão e a lista LIMPA', async () => {
        const r = await chamar('PUT', undefined, { materia_prima: MP, etapas: [{ id: E2, etapa_catalogo_id: C_CONFIRMAR }, { etapa_catalogo_id: C_OUTRA, instrucao: 'x ' }] })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{
            funcao: 'superadmin_gravar_etapas_da_materia_prima',
            args: {
                p_tenant: T, p_por: 'u-super', p_materia_prima: MP,
                p_etapas: [{ id: E2, etapa_catalogo_id: C_CONFIRMAR, instrucao: '' }, { etapa_catalogo_id: C_OUTRA, instrucao: 'x' }],
            },
        }])
        expect(r.corpo).toEqual({ depois: { orcamentista_familia_etapa: [] } })
    })

    it('PUT: o autor é o da SESSÃO — um "por" no corpo é recusado, não obedecido', async () => {
        const r = await chamar('PUT', undefined, { materia_prima: MP, etapas: [etapa({ por: 'outro' })] })
        expect(r.status).toBe(400)
        expect((await chamar('PUT', undefined, { materia_prima: MP, etapas: [etapa()], por: 'outro' })).status).toBe(400)
        expect(estado.rpcs).toEqual([])
    })

    it('PUT: sem a matéria-prima (ou não uuid) é 400, e a função NÃO é chamada; empresa inexistente é 404', async () => {
        expect((await chamar('PUT', undefined, { etapas: [etapa()] })).status).toBe(400)
        expect((await chamar('PUT', undefined, { materia_prima: 'x', etapas: [etapa()] })).status).toBe(400)
        expect((await chamar('PUT', undefined, { materia_prima: MP, etapas: [etapa()] }, '00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
        expect(estado.rpcs).toEqual([])
    })

    it('PUT: corpo inválido é 400 com a frase da etapa, e a função NÃO é chamada', async () => {
        const r = await chamar('PUT', undefined, { materia_prima: MP, etapas: [etapa(), etapa({ rotulo: 'Renomeada na conta' })] })
        expect(r.status).toBe(400)
        expect(r.corpo.error).toContain('Etapa 2: o campo "rotulo" não existe')
        expect(estado.rpcs).toEqual([])
    })

    it('PUT: nenhuma escrita direta — o fake lança em insert, update, upsert e delete, e a rota passou', async () => {
        expect((await chamar('PUT', undefined, { materia_prima: MP, etapas: [etapa()] })).status).toBe(200)
        expect(estado.rpcs).toHaveLength(1)
    })
})

describe('(4) a recusa chega a quem clicou', () => {
    it.each([
        ['22023', 400, 'etapa 2: o id nao e de uma etapa desta familia'],
        ['42501', 403, 'o autor da alteracao nao e super admin'],
        ['P0002', 404, 'materia-prima inexistente nesta empresa'],
        ['22023', 400, 'etapa 1: o motor nao atua na familia PVC'],
        ['22023', 400, 'etapa 1: a etapa do catalogo nao existe'],
    ])('o código %s vira %i com a mensagem da função', async (code, status, mensagem) => {
        estado.rpcResposta = () => ({ data: null, error: { code, message: mensagem } })
        const r = await chamar('PUT', undefined, { materia_prima: MP, etapas: [] })
        expect(r.status).toBe(status)
        expect(r.corpo).toEqual({ error: mensagem })
    })

    it('erro que vem do próprio banco (outro código): frase fixa, sem vazar nome de constraint', async () => {
        estado.rpcResposta = () => ({ data: null, error: { code: 'XX000', message: 'violates orcamentista_familia_etapa_numero_key' } })
        const r = await chamar('PUT', undefined, { materia_prima: MP, etapas: [] })
        expect(r.status).toBe(500)
        expect(JSON.stringify(r.corpo)).not.toContain('orcamentista_familia_etapa')
    })
})
