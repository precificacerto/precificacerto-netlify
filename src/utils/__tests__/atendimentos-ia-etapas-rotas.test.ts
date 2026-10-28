/**
 * @jest-environment node
 *
 * PORTÃO — as ETAPAS da família: a regra pura (`lerCorpoDasEtapas`, o rascunho da tela) e a rota
 * `/api/super-admin/atendimentos-ia/familias/[chave]/etapas` (migração 20261027000003).
 *
 * POR QUÊ (dono do produto, 27/10/2026): a ETAPA é o que o consultor cadastra por família — número, rótulo LIVRE, AÇÃO
 * de uma lista FECHADA, instrução e as abas da planilha. "O rótulo é livre; a ação não é. Etapa sem ação da lista é
 * erro, não etapa nova." Grava-se por função SECURITY DEFINER com log, no formato de
 * `superadmin_gravar_contexto_do_atendimento`.
 *
 * O que este portão fica vermelho:
 *   (1) a regra do corpo: a ação é uma das cinco (nome exato, sem caixa alheia), o rótulo tem de 1 a 60 caracteres, a
 *       instrução até 4.000 contados como o banco conta (pontos de código), as abas são da planilha e sem repetição,
 *       e o número NÃO vai no corpo — é a posição na lista; cada recusa diz QUAL etapa;
 *   (2) o rascunho da tela: subir e descer, comparar com o gravado, a ação em branco da etapa nova;
 *   (3) a rota: só o super admin (404 para os outros), só GET e PUT, o GET na ordem do número e recusando linha sem
 *       ação da lista, o PUT chamando SÓ a função, com a família da URL e o autor da sessão — nunca um insert, um
 *       update ou um delete direto;
 *   (4) a recusa chega a quem clicou: a mensagem da função nos códigos dela, a frase fixa nos outros.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipos */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
    ACOES_DA_ETAPA, ABAS_DA_ETAPA, LIMITE_DA_INSTRUCAO_DA_ETAPA, LIMITE_DO_ROTULO_DA_ETAPA, MAXIMO_DE_ETAPAS_DA_FAMILIA,
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
        orcamentista_fornecedor: [{ id: 'f-wolff', nome: 'Wolff' }],
        orcamentista_motor: [
            { id: M1, familia: 'PVC', fornecedor_id: 'f-wolff', arquivo_nome: 'Wolff.xlsx', vigente: true, arquivado_em: null, criado_em: '2026-10-27T10:00:00Z' },
            { id: M2, familia: 'PVC', fornecedor_id: null, arquivo_nome: 'Da família.xlsx', vigente: false, arquivado_em: null, criado_em: '2026-10-27T11:00:00Z' },
            { id: 'm-arq', familia: 'PVC', fornecedor_id: 'f-wolff', arquivo_nome: 'Velha.xlsx', vigente: false, arquivado_em: '2026-10-01T00:00:00Z', criado_em: '2026-09-01T00:00:00Z' },
            { id: 'm-alu', familia: 'ALUMINIO', fornecedor_id: null, arquivo_nome: 'Alumínio.xlsx', vigente: false, arquivado_em: null, criado_em: '2026-10-27T12:00:00Z' },
        ],
        orcamentista_familia_etapa: [
            { id: E2, familia: 'PVC', numero: 2, rotulo: 'Confirmar', acao: 'CONFIRMAR', instrucao: 'confirme com o vendedor', abas: [], motor_id: M2 },
            { id: E1, familia: 'PVC', numero: 1, rotulo: 'Apanhar o pedido', acao: 'APANHAR', instrucao: '', abas: ['variaveis', 'tipologias'], motor_id: M1 },
            { id: 'outra', familia: 'ALUMINIO', numero: 1, rotulo: 'Da outra família', acao: 'APANHAR', instrucao: '', abas: [] },
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
const rota = () => require('@/pages/api/super-admin/atendimentos-ia/familias/[chave]/etapas').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(metodo: string, chave: string | undefined, body: unknown = {}) {
    const saida = { status: 0, corpo: null as any }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(c: unknown) { saida.corpo = c; return res },
        setHeader() { return res },
        end() { return res },
    } as unknown as NextApiResponse
    await rota()({ method: metodo, query: { chave }, cookies: { token: 'sessao' }, body, headers: {} } as unknown as NextApiRequest, res)
    return saida
}

const etapa = (extra: Linha = {}) => ({ rotulo: 'Apanhar', acao: 'APANHAR', instrucao: '', abas: [] as string[], ...extra })
const ler = (...etapas: unknown[]) => lerCorpoDasEtapas({ etapas })

describe('(1) a regra do corpo', () => {
    it('as cinco ações e as doze abas, como o portão de paridade as amarra à migração', () => {
        expect(ACOES_DA_ETAPA).toHaveLength(5)
        expect(ABAS_DA_ETAPA).toHaveLength(12)
    })

    it('uma etapa válida passa, limpa (rótulo e instrução sem as pontas) e na ordem da lista', () => {
        const r = ler(etapa({ rotulo: '  Apanhar o pedido  ', instrucao: '  pergunte a tipologia\n', abas: ['variaveis', 'tipologias'] }), etapa({ rotulo: 'Enviar', acao: 'ENVIAR' }))
        expect(r).toEqual({
            ok: true,
            etapas: [
                { rotulo: 'Apanhar o pedido', acao: 'APANHAR', instrucao: 'pergunte a tipologia', abas: ['variaveis', 'tipologias'] },
                { rotulo: 'Enviar', acao: 'ENVIAR', instrucao: '', abas: [] },
            ],
        })
    })

    it('a instrução e as abas podem faltar: viram vazias, e o id passa quando é uuid', () => {
        expect(ler({ rotulo: 'x', acao: 'CALCULAR_BARRAS', id: E1 })).toEqual({ ok: true, etapas: [{ id: E1, rotulo: 'x', acao: 'CALCULAR_BARRAS', instrucao: '', abas: [] }] })
    })

    it('lista vazia é válida (família sem etapa); o que não é lista, não', () => {
        expect(ler()).toEqual({ ok: true, etapas: [] })
        for (const corpo of [null, undefined, 'x', 5, [], {}, { etapas: 'x' }, { etapas: {} }]) expect(lerCorpoDasEtapas(corpo)).toEqual({ ok: false, erro: 'As etapas vão numa lista.' })
    })

    it.each([['calcular_barras'], ['ETAPA_NOVA'], [''], [null], [3], [undefined]])('a ação %p não é da lista: recusa nomeando a etapa e as cinco ações', (acao) => {
        const r = ler(etapa(), etapa({ acao }))
        expect(r.ok).toBe(false)
        const erro = (r as { erro: string }).erro
        expect(erro).toContain('Etapa 2:')
        for (const a of ACOES_DA_ETAPA) expect(erro).toContain(a)
        expect(erro).toContain('O rótulo é livre; a ação não é.')
    })

    it('o rótulo: em branco recusa; 60 caracteres passa; 61 recusa dizendo quantos', () => {
        expect(ler(etapa({ rotulo: '   ' }))).toEqual({ ok: false, erro: 'Etapa 1: o rótulo está em branco.' })
        expect(ler(etapa({ rotulo: 'á'.repeat(LIMITE_DO_ROTULO_DA_ETAPA) })).ok).toBe(true)
        expect(ler(etapa({ rotulo: 'á'.repeat(LIMITE_DO_ROTULO_DA_ETAPA + 1) }))).toEqual({ ok: false, erro: 'Etapa 1: o rótulo tem 61 caracteres; o limite é 60.' })
        expect(ler(etapa({ rotulo: 5 }))).toEqual({ ok: false, erro: 'Etapa 1: o rótulo é um texto.' })
    })

    it('a instrução: 4.000 passa; 4.001 recusa dizendo quantos; emoji conta UM (como o banco), não dois', () => {
        expect(ler(etapa({ instrucao: 'a'.repeat(LIMITE_DA_INSTRUCAO_DA_ETAPA) })).ok).toBe(true)
        expect(ler(etapa({ instrucao: 'a'.repeat(LIMITE_DA_INSTRUCAO_DA_ETAPA + 1) }))).toEqual({
            ok: false, erro: 'Etapa 1: a instrução tem 4.001 caracteres; o limite é 4.000. Encurte antes de salvar.',
        })
        expect(ler(etapa({ instrucao: '😀'.repeat(LIMITE_DA_INSTRUCAO_DA_ETAPA) })).ok).toBe(true)
        expect(ler(etapa({ instrucao: 5 }))).toEqual({ ok: false, erro: 'Etapa 1: a instrução é um texto.' })
    })

    it('as abas: só as da planilha, sem repetir, em lista; os itens de preço NÃO são aba', () => {
        expect(ler(etapa({ abas: ['itens_de_preco'] }))).toEqual({ ok: false, erro: 'Etapa 1: "itens_de_preco" não é uma aba da planilha.' })
        expect(ler(etapa({ abas: ['perfis', 'perfis'] }))).toEqual({ ok: false, erro: 'Etapa 1: uma aba aparece mais de uma vez.' })
        expect(ler(etapa({ abas: 'perfis' }))).toEqual({ ok: false, erro: 'Etapa 1: as abas vão numa lista.' })
        expect(ler(etapa({ abas: [3] })).ok).toBe(false)
        expect(ler(etapa({ abas: [...ABAS_DA_ETAPA] })).ok).toBe(true)
    })

    it('o NÚMERO não vai no corpo (é a posição), nem outro campo desconhecido', () => {
        expect(ler(etapa({ numero: 3 }))).toEqual({ ok: false, erro: 'Etapa 1: o campo "numero" não existe (só id, rotulo, acao, instrucao, abas e motor_id). O número é a posição na lista.' })
        expect(ler(etapa({ por: 'x' })).ok).toBe(false)
    })

    it('o motor_id: uuid aponta, null limpa, ausente não mexe; o que não é uuid recusa nomeando a etapa', () => {
        expect(ler(etapa({ motor_id: M1 }))).toEqual({ ok: true, etapas: [{ rotulo: 'Apanhar', acao: 'APANHAR', instrucao: '', abas: [], motor_id: M1 }] })
        expect(ler(etapa({ motor_id: null }))).toEqual({ ok: true, etapas: [{ rotulo: 'Apanhar', acao: 'APANHAR', instrucao: '', abas: [], motor_id: null }] })
        expect(ler(etapa())).toEqual({ ok: true, etapas: [{ rotulo: 'Apanhar', acao: 'APANHAR', instrucao: '', abas: [] }] })
        expect(ler(etapa(), etapa({ motor_id: 'x' }))).toEqual({ ok: false, erro: 'Etapa 2: o motor_id não é um uuid (ou null, para limpar).' })
        expect(ler(etapa({ motor_id: 5 })).ok).toBe(false)
    })

    it('o id: uuid, sem repetir na lista', () => {
        expect(ler(etapa({ id: 'nao-e-uuid' }))).toEqual({ ok: false, erro: 'Etapa 1: o id não é um uuid.' })
        expect(ler(etapa({ id: E1 }), etapa({ id: E1 }))).toEqual({ ok: false, erro: 'Etapa 2: o id aparece mais de uma vez na lista.' })
        expect(ler(etapa({ id: null }))).toEqual({ ok: true, etapas: [{ rotulo: 'Apanhar', acao: 'APANHAR', instrucao: '', abas: [] }] })
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
        { id: E1, numero: 1, rotulo: 'Apanhar', acao: 'APANHAR', instrucao: 'a', abas: ['tipologias', 'variaveis'], motor_id: null },
        { id: E2, numero: 2, rotulo: 'Confirmar', acao: 'CONFIRMAR', instrucao: '', abas: [], motor_id: null },
    ]

    it('o rascunho sem mexer não mudou; qualquer campo mexido muda', () => {
        const r = rascunhoDasEtapas(gravadas)
        expect(etapasMudaram(r, gravadas)).toBe(false)
        expect(etapasMudaram([{ ...r[0], rotulo: 'Outro' }, r[1]], gravadas)).toBe(true)
        expect(etapasMudaram([{ ...r[0], acao: 'ENVIAR' }, r[1]], gravadas)).toBe(true)
        expect(etapasMudaram([{ ...r[0], instrucao: 'b' }, r[1]], gravadas)).toBe(true)
        expect(etapasMudaram([{ ...r[0], abas: ['tipologias'] }, r[1]], gravadas)).toBe(true)
    })

    it('espaço nas pontas do rótulo e da instrução NÃO é mudança (a rota os tira); a ordem das abas também não', () => {
        const r = rascunhoDasEtapas(gravadas)
        expect(etapasMudaram([{ ...r[0], rotulo: ' Apanhar ', instrucao: ' a ', abas: ['variaveis', 'tipologias'] }, r[1]], gravadas)).toBe(false)
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

    it('a etapa nova nasce SEM ação — nenhuma vem por omissão — e o corpo a recusa nomeando', () => {
        const nova = novaEtapaNoRascunho()
        expect(nova).toEqual(expect.objectContaining({ id: null, rotulo: '', acao: null, instrucao: '', abas: [] }))
        const r = lerCorpoDasEtapas(corpoDoRascunho([{ ...nova, rotulo: 'Levantar' }]))
        expect(r).toEqual({ ok: false, erro: expect.stringContaining('Etapa 1: a ação em branco não é uma das ações do sistema') })
        expect(novaEtapaNoRascunho().local).not.toBe(nova.local)
    })

    it('o corpo leva o id só da etapa gravada, e as abas saem na ordem da planilha', () => {
        const r = rascunhoDasEtapas(gravadas)
        const corpo = corpoDoRascunho([r[0], { ...novaEtapaNoRascunho(), rotulo: 'x', acao: 'ENVIAR' }])
        expect(corpo.etapas[0]).toEqual(expect.objectContaining({ id: E1 }))
        expect('id' in corpo.etapas[1]).toBe(false)
        expect(abasEmOrdem(['variaveis', 'perfis', 'tipologias'])).toEqual(['tipologias', 'perfis', 'variaveis'])
        expect(abasEmOrdem(['nada'])).toEqual([])
    })

    it('o motor: trocar ou limpar muda; sem tocar, não; o corpo só leva motor_id quando MUDOU (salvar o rótulo não mexe no motor)', () => {
        const r = rascunhoDasEtapas(gravadas)
        expect(etapasMudaram([{ ...r[0], motor_id: M1 }, r[1]], gravadas)).toBe(true)
        const comMotor: EtapaDaFamilia[] = [{ ...gravadas[0], motor_id: M1 }, gravadas[1]]
        const rm = rascunhoDasEtapas(comMotor)
        expect(etapasMudaram(rm, comMotor)).toBe(false)
        expect(etapasMudaram([{ ...rm[0], motor_id: null }, rm[1]], comMotor)).toBe(true)
        expect(etapasMudaram([{ ...rm[0], motor_id: M2 }, rm[1]], comMotor)).toBe(true)
        expect(corpoDoRascunho(rm).etapas.map((e) => 'motor_id' in e)).toEqual([false, false])
        expect(corpoDoRascunho([{ ...rm[0], rotulo: 'Outro' }, rm[1]]).etapas.map((e) => 'motor_id' in e)).toEqual([false, false])
        expect(corpoDoRascunho([{ ...rm[0], motor_id: M2 }, { ...rm[1], motor_id: M1 }]).etapas.map((e) => (e as Linha).motor_id)).toEqual([M2, M1])
        expect((corpoDoRascunho([{ ...rm[0], motor_id: null }, rm[1]]).etapas[0] as Linha).motor_id).toBeNull()
    })

    it('uma etapa NOVA com motor leva o motor no corpo; sem motor, não leva campo nenhum', () => {
        const nova = { ...novaEtapaNoRascunho(), rotulo: 'x', acao: 'ENVIAR' as const }
        expect('motor_id' in corpoDoRascunho([nova]).etapas[0]).toBe(false)
        expect((corpoDoRascunho([{ ...nova, motor_id: M1 }]).etapas[0] as Linha).motor_id).toBe(M1)
    })

    it('inserir etapa abaixo: a nova entra logo depois da posição, as de baixo descem, e a lista de cima não muda', () => {
        const r = rascunhoDasEtapas(gravadas)
        const com = inserirEtapaAbaixo(r, 0)
        expect(com.map((e) => e.id)).toEqual([E1, null, E2])
        expect(com[1]).toEqual(expect.objectContaining({ rotulo: '', acao: null, motor_id: null, motor_gravado: null }))
        expect(inserirEtapaAbaixo(r, 1).map((e) => e.id)).toEqual([E1, E2, null])
        expect(inserirEtapaAbaixo(r, 9).map((e) => e.id)).toEqual([E1, E2, null])
        expect(inserirEtapaAbaixo([], 0)).toHaveLength(1)
        expect(r).toHaveLength(2)
    })

    it('a rota da família escapa o que não é seguro na URL', () => {
        expect(rotaDasEtapas('PVC')).toBe('/api/super-admin/atendimentos-ia/familias/PVC/etapas')
        expect(rotaDasEtapas('A/B')).toBe('/api/super-admin/atendimentos-ia/familias/A%2FB/etapas')
    })
})

describe('(3) a rota: só o super admin, e só a função grava', () => {
    it('quem não é super admin recebe 404 no GET e no PUT, e nada é lido nem gravado', async () => {
        estado.usuario = ADMIN
        expect((await chamar('GET', 'PVC')).status).toBe(404)
        expect((await chamar('PUT', 'PVC', { etapas: [] })).status).toBe(404)
        expect(estado.leituras.filter((t) => t.startsWith('orcamentista_'))).toEqual([])
        expect(estado.rpcs).toEqual([])
    })

    it('POST, PATCH e DELETE são 405', async () => {
        for (const m of ['POST', 'PATCH', 'DELETE']) expect((await chamar(m, 'PVC')).status).toBe(405)
        expect(estado.rpcs).toEqual([])
    })

    it('GET: as etapas da família na ORDEM do número, sem as da outra família', async () => {
        const r = await chamar('GET', 'PVC')
        expect(r.status).toBe(200)
        expect(r.corpo.familia).toBe('PVC')
        expect(r.corpo.etapas.map((e: Linha) => [e.numero, e.rotulo])).toEqual([[1, 'Apanhar o pedido'], [2, 'Confirmar']])
        expect(r.corpo.etapas[0]).toEqual({ id: E1, numero: 1, rotulo: 'Apanhar o pedido', acao: 'APANHAR', instrucao: '', abas: ['variaveis', 'tipologias'], motor_id: M1 })
    })

    it('GET: as `contas` são os NOMES das contas que usam a família (matéria-prima dela ou fornecedor vinculado de tabela dela), em ordem, e só elas', async () => {
        estado.db.tenants = [{ id: 't-9', name: 'Zeta' }, { id: 't-8', name: 'Da outra família' }, { id: 't-7', name: 'Álamo' }]
        estado.db.orcamentista_materia_prima = [{ tenant_id: 't-9', familia: 'PVC' }, { tenant_id: 't-8', familia: 'ALUMINIO' }]
        estado.db.orcamentista_tabela = [{ fornecedor_id: 'f-wolff', familia: 'PVC' }]
        estado.db.orcamentista_mp_categoria_fornecedor = [{ tenant_id: 't-7', fornecedor_id: 'f-wolff' }]
        const r = await chamar('GET', 'PVC')
        expect(r.corpo.contas).toEqual(['Álamo', 'Zeta'])
        // só o nome: nenhum id de conta nem dado dela na resposta
        expect(JSON.stringify(r.corpo)).not.toContain('t-9')
        expect((await chamar('GET', 'ALUMINIO')).corpo.contas).toEqual(['Da outra família'])
    })

    it('GET: família que nenhuma conta usa devolve `contas` vazia, não ausente', async () => {
        expect((await chamar('GET', 'PVC')).corpo.contas).toEqual([])
    })

    it('GET: cada etapa diz o motor que aponta (null quando a linha não tem), e os motores são os da MESMA família, não arquivados, com o nome do fornecedor — ou sem ele', async () => {
        estado.db.orcamentista_familia_etapa[0].motor_id = undefined
        const r = await chamar('GET', 'PVC')
        expect(r.corpo.etapas.map((e: Linha) => e.motor_id)).toEqual([M1, null])
        expect(r.corpo.motores).toEqual([
            { id: M1, arquivo_nome: 'Wolff.xlsx', fornecedor: 'Wolff', vigente: true },
            { id: M2, arquivo_nome: 'Da família.xlsx', fornecedor: null, vigente: false },
        ])
    })

    it('PUT: o motor_id do item vai à função como veio — uuid aponta, null limpa — e o item sem motor_id não o leva', async () => {
        const r = await chamar('PUT', 'PVC', { etapas: [{ id: E1, rotulo: 'Apanhar o pedido', acao: 'APANHAR', motor_id: M2 }, { id: E2, rotulo: 'Confirmar', acao: 'CONFIRMAR', motor_id: null }, { rotulo: 'Nova', acao: 'ENVIAR' }] })
        expect(r.status).toBe(200)
        const itens = estado.rpcs[0].args.p_etapas as Linha[]
        expect(itens[0].motor_id).toBe(M2)
        expect('motor_id' in itens[1] && itens[1].motor_id === null).toBe(true)
        expect('motor_id' in itens[2]).toBe(false)
    })

    it('GET: família sem etapas é a lista vazia (ainda não cadastrada), e família que não existe é 404', async () => {
        estado.db.orcamentista_familia_etapa = []
        expect((await chamar('GET', 'PVC')).corpo.etapas).toEqual([])
        expect((await chamar('GET', 'XX')).status).toBe(404)
    })

    it('GET: linha com ação fora da lista é ERRO (500), nunca uma etapa sem ação', async () => {
        estado.db.orcamentista_familia_etapa[0].acao = 'ETAPA_NOVA'
        const r = await chamar('GET', 'PVC')
        expect(r.status).toBe(500)
        expect(r.corpo).toEqual({ error: 'Não foi possível ler as etapas.' })
    })

    it('GET: uma aba que a planilha não tem some do que é devolvido, em vez de ser repassada', async () => {
        estado.db.orcamentista_familia_etapa[1].abas = ['perfis', 'itens_de_preco']
        const r = await chamar('GET', 'PVC')
        expect(r.corpo.etapas.find((e: Linha) => e.id === E1).abas).toEqual(['perfis'])
    })

    it('PUT: chama superadmin_gravar_etapas_da_familia com a família da URL, o autor da sessão e a lista LIMPA', async () => {
        const r = await chamar('PUT', 'PVC', { etapas: [{ id: E2, rotulo: ' Confirmar ', acao: 'CONFIRMAR' }, { rotulo: 'Levantar', acao: 'GERAR_LEVANTAMENTO', instrucao: 'x ', abas: ['perfis'] }] })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{
            funcao: 'superadmin_gravar_etapas_da_familia',
            args: {
                p_familia: 'PVC', p_por: 'u-super',
                p_etapas: [{ id: E2, rotulo: 'Confirmar', acao: 'CONFIRMAR', instrucao: '', abas: [] }, { rotulo: 'Levantar', acao: 'GERAR_LEVANTAMENTO', instrucao: 'x', abas: ['perfis'] }],
            },
        }])
        expect(r.corpo).toEqual({ depois: { orcamentista_familia_etapa: [] } })
    })

    it('PUT: o autor é o da SESSÃO — um "por" no corpo é recusado, não obedecido', async () => {
        const r = await chamar('PUT', 'PVC', { etapas: [etapa({ por: 'outro' })] })
        expect(r.status).toBe(400)
        expect(estado.rpcs).toEqual([])
    })

    it('PUT: corpo inválido é 400 com a frase da etapa, e a função NÃO é chamada', async () => {
        const r = await chamar('PUT', 'PVC', { etapas: [etapa(), etapa({ acao: 'DESCOBRIR' })] })
        expect(r.status).toBe(400)
        expect(r.corpo.error).toContain('Etapa 2: a ação "DESCOBRIR"')
        expect(estado.rpcs).toEqual([])
    })

    it('PUT: nenhuma escrita direta — o fake lança em insert, update, upsert e delete, e a rota passou', async () => {
        expect((await chamar('PUT', 'PVC', { etapas: [etapa()] })).status).toBe(200)
        expect(estado.rpcs).toHaveLength(1)
    })
})

describe('(4) a recusa chega a quem clicou', () => {
    it.each([
        ['22023', 400, 'a etapa 1 ("Apanhar o pedido") nao veio na lista: remover etapa nao e permitido por aqui'],
        ['42501', 403, 'o autor da alteracao nao e super admin'],
        ['P0002', 404, 'familia inexistente'],
    ])('o código %s vira %i com a mensagem da função', async (code, status, mensagem) => {
        estado.rpcResposta = () => ({ data: null, error: { code, message: mensagem } })
        const r = await chamar('PUT', 'PVC', { etapas: [] })
        expect(r.status).toBe(status)
        expect(r.corpo).toEqual({ error: mensagem })
    })

    it('erro que vem do próprio banco (outro código): frase fixa, sem vazar nome de constraint', async () => {
        estado.rpcResposta = () => ({ data: null, error: { code: 'XX000', message: 'violates orcamentista_familia_etapa_numero_key' } })
        const r = await chamar('PUT', 'PVC', { etapas: [] })
        expect(r.status).toBe(500)
        expect(JSON.stringify(r.corpo)).not.toContain('orcamentista_familia_etapa')
    })
})
