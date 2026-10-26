/**
 * @jest-environment node
 *
 * PORTÃO — o BLOCO MOTOR da conta: as rotas que MOSTRAM o que a conta tem carregado
 * (`/api/super-admin/atendimentos-ia/contas/[tenantId]/motor`, `/motor/tipologias`, `/motor/tipologia`).
 *
 * POR QUÊ (dono do produto, 26/10/2026): a tela da conta passa a ter três blocos — BASE DE CONHECIMENTO,
 * MOTOR e PROMPT DE ATENDIMENTO. "O BLOCO MOTOR NÃO É CAMPO DE TEXTO": ele MOSTRA o que a conta tem
 * carregado e edita só escolha estruturada. "Hoje NÃO existe tela nenhuma mostrando isso. Quando algo sai
 * errado, o consultor não tem onde olhar."
 *
 * O que este portão fica vermelho:
 *   (1) só o super admin; quem não é recebe 404, e nada é lido;
 *   (2) o resumo: por tabela EM USO NA CONTA, o fornecedor, a família, as contas que a usam, as linhas com
 *       quantas tipologias, a contagem EXATA de cada aba (o banco conta; nada é lido linha a linha) e os
 *       parâmetros de otimização; e o critério de custo das barras de cada matéria-prima;
 *   (3) a tabela de OUTRA conta não aparece, e a rota de detalhe recusa tabela que a conta não usa;
 *   (4) as tipologias de uma tabela, e as abas de UMA tipologia — PAGINADAS: a leitura padrão do PostgREST
 *       corta em mil, e uma aba cortada mostraria ao consultor um motor que não é o carregado;
 *   (5) nenhuma rota escreve.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipos */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, any>
const CONTA = '00000000-0000-4000-8000-0000000000a1'
const OUTRA_CONTA = '00000000-0000-4000-8000-0000000000b2'
const T1 = '00000000-0000-4000-8000-0000000000c1'
const T2 = '00000000-0000-4000-8000-0000000000c2'
const SUPER: Linha = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN: Linha = { id: 'u-admin', tenant_id: CONTA, role: 'admin', is_super_admin: false }
const LIMITE_DO_POSTGREST = 1000

const estado = { usuario: SUPER as Linha | null, db: {} as Record<string, Linha[]>, leituras: [] as string[] }

const muitos = (n: number, f: (i: number) => Linha) => Array.from({ length: n }, (_, i) => f(i))

function montar() {
    estado.usuario = SUPER
    estado.leituras = []
    estado.db = {
        users: [SUPER, ADMIN],
        tenants: [{ id: CONTA, name: 'Esquadrias De Paula' }, { id: OUTRA_CONTA, name: 'Outra Esquadrias' }],
        orcamentista_conta_tabela: [{ tenant_id: CONTA, tabela_id: T1 }, { tenant_id: OUTRA_CONTA, tabela_id: T1 }, { tenant_id: OUTRA_CONTA, tabela_id: T2 }],
        orcamentista_tabela: [
            { id: T1, fornecedor_id: 'f-wolff', arquivo_nome: 'Tabela Wolff.xlsx', motor_nome: 'Motor Wolff.xlsx', vigencia: 'desde 10/2026', familia: null },
            { id: T2, fornecedor_id: 'f-sul', arquivo_nome: 'Sul.xlsx', motor_nome: 'Motor Sul.xlsx', vigencia: null, familia: 'PVC' },
        ],
        orcamentista_fornecedor: [{ id: 'f-wolff', nome: 'Wolff Perfis' }, { id: 'f-sul', nome: 'Perfis Sul' }],
        orcamentista_familia_catalogo: [{ chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }, { chave: 'PVC', rotulo: 'PVC', ordem: 1 }],
        orcamentista_materia_prima: [{ id: 'mp-1', tenant_id: CONTA, nome: 'Perfis PVC', ordem: 1 }, { id: 'mp-x', tenant_id: OUTRA_CONTA, nome: 'De outra conta', ordem: 1 }],
        orcamentista_mp_categoria: [
            { id: 'c1', tenant_id: CONTA, materia_prima_id: 'mp-1', categoria_chave: 'PERFIL', config: { criterio_custo_barra: 'CONSUMO_REAL', serra_mm: 5 } },
            { id: 'cx', tenant_id: OUTRA_CONTA, materia_prima_id: 'mp-x', categoria_chave: 'PERFIL', config: { criterio_custo_barra: 'BARRA_INTEIRA' } },
        ],
        orcamentista_motor_tipologia_detalhe: [
            { tabela_id: T1, tipologia: 'DP-02', linha: 'PVC WOLFF EUROPA 42', descricao: 'JANELA DE CORRER 02 FOLHAS', tipo: 'Correr', larg_min_mm: 600, larg_max_mm: 3000, alt_min_mm: 400, alt_max_mm: 2500, n_perfis: 1205, n_vidros: 2, n_insumos: 3, ordem: 2 },
            { tabela_id: T1, tipologia: 'DP-01', linha: 'PVC WOLFF DESIGN', descricao: 'MAXIM-AR', tipo: 'Maxim-ar', larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null, n_perfis: 1, n_vidros: 0, n_insumos: 0, ordem: 1 },
            { tabela_id: T1, tipologia: 'DP-03', linha: 'PVC WOLFF EUROPA 42', descricao: 'PORTA', tipo: 'Porta', larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null, n_perfis: 0, n_vidros: 0, n_insumos: 0, ordem: 3 },
            { tabela_id: T2, tipologia: 'SU-01', linha: 'SUL', descricao: 'DA OUTRA', tipo: 'Porta', ordem: 1 },
        ],
        orcamentista_motor_tipologia_tempo: [{ tabela_id: T1, tipologia: 'DP-02', tempo_fabricacao_min: 300, tempo_origem: 'ESTIMADO' }],
        // 1.205 perfis da DP-02: mais que as mil linhas que o PostgREST devolve por vez
        orcamentista_motor_perfil: [
            ...muitos(1205, (i) => ({ id: `p-${String(i).padStart(5, '0')}`, tabela_id: T1, tipologia: 'DP-02', ordem: i + 2, linha: 'EUROPA 42', perfil: `PF${i}`, descricao: 'perfil', corte: '90/90', qtd: '1', medida: 'L', posicao: null, esp_vidro: null, condicao: null, obs: null })),
            { id: 'p-dp01', tabela_id: T1, tipologia: 'DP-01', ordem: 1, perfil: 'X' },
            { id: 'p-t2', tabela_id: T2, tipologia: 'DP-02', ordem: 1, perfil: 'DA-OUTRA-TABELA' },
        ],
        orcamentista_motor_formula: [{ id: 'f1', tabela_id: T1, tipologia: 'DP-02', ordem: 2, linha: 'EUROPA 42', variavel: 'HFOL', descricao: 'altura da folha', formula: '(H-10)' }],
        orcamentista_motor_variavel: [{ id: 'v1', tabela_id: T1, tipologia: 'DP-02', ordem: 2, linha: 'EUROPA 42', variavel: 'ARI', descricao: 'ARREMATE INTERNO', padrao: '1', min_max: null, condicao: null, opcoes: '1 = BZ0006' }],
        orcamentista_motor_vidro: [{ id: 'vi1', tabela_id: T1, tipologia: 'DP-02', ordem: 2, vidro: 'V1', largura: 'L/2', altura: 'H', qtd: '2', fixacao: null, condicao: null }],
        orcamentista_motor_baguete: [{ id: 'b1', tabela_id: T1, tipologia: 'DP-02', ordem: 2, baguete: 'GB25', descricao: 'baguete', espessuras_vidro: '4,5', qtd_medida_condicao: null }],
        orcamentista_motor_insumo: [{ id: 'i1', tabela_id: T1, tipologia: 'DP-02', ordem: 2, insumo: 'ESCOVA', descricao: 'escova', qtd: '2', condicao: null, obs: null }],
        orcamentista_motor_validacao: [{ id: 'va1', tabela_id: T1, tipologia: 'DP-02', ordem: 2, condicao_valida: 'L>=600', mensagem: 'largura mínima' }],
        orcamentista_motor_otimizacao: [
            { id: 'o2', tabela_id: T1, ordem: 3, parametro: 'serra_mm', valor: '5' },
            { id: 'o1', tabela_id: T1, ordem: 2, parametro: 'barra_mm', valor: '6000' },
            { id: 'o3', tabela_id: T2, ordem: 2, parametro: 'barra_mm', valor: '5800' },
        ],
        orcamentista_motor_formula_familia: [{ id: 'ff1', tabela_id: T1, linha: 'EUROPA 42' }],
        orcamentista_motor_regra: [{ id: 'r1', tabela_id: T1 }, { id: 'r2', tabela_id: T1 }],
        orcamentista_tabela_item: [{ id: 'it1', tabela_id: T1 }, { id: 'it2', tabela_id: T1 }, { id: 'it3', tabela_id: T1 }],
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
            const ordem: string[] = []
            let faixa: [number, number] | null = null
            let cabeca = false
            let contar = false
            const linhas = () => {
                let ls = (estado.db[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))
                if (ordem.length) ls = [...ls].sort((a, b) => ordem.reduce((r, c) => r || (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0), 0))
                return ls
            }
            const q: any = {}
            q.select = (_c?: string, o?: { count?: string; head?: boolean }) => { contar = o?.count === 'exact'; cabeca = o?.head === true; return q }
            q.eq = (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q }
            q.order = (c: string) => { ordem.push(c); return q }
            q.range = (de: number, ate: number) => { faixa = [de, ate]; return q }
            q.maybeSingle = async (): Promise<{ data: Linha | null; error: null }> => ({ data: linhas()[0] ?? null, error: null })
            q.single = async (): Promise<{ data: Linha | null; error: null }> => ({ data: linhas()[0] ?? null, error: null })
            q.then = (ok: (v: unknown) => unknown) => {
                estado.leituras.push(tabela)
                const todas = linhas()
                // como o PostgREST: no máximo mil linhas por pedido, a não ser que a faixa diga outra coisa
                const pagina = faixa ? todas.slice(faixa[0], faixa[1] + 1) : todas.slice(0, LIMITE_DO_POSTGREST)
                return Promise.resolve({ data: cabeca ? null : pagina, error: null, count: contar ? todas.length : null }).then(ok)
            }
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) q[escrita] = () => { throw new Error(`o bloco Motor não escreve: ${escrita} ${tabela}`) }
            return q
        },
        rpc: () => { throw new Error('o bloco Motor não chama função') },
    },
}))

beforeEach(montar)
const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())

// lidas na CHAMADA: no commit do teste vermelho as rotas ainda não existem
/* eslint-disable @typescript-eslint/no-require-imports */
type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
const ROTAS: Record<string, () => Rota> = {
    motor: () => require('@/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/motor/index').default,
    tipologias: () => require('@/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/motor/tipologias').default,
    tipologia: () => require('@/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/motor/tipologia').default,
}
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(rota: keyof typeof ROTAS, query: Linha, metodo = 'GET') {
    const saida = { status: 0, corpo: null as any }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(c: unknown) { saida.corpo = c; return res },
        setHeader() { return res },
        end() { return res },
    } as unknown as NextApiResponse
    await ROTAS[rota]()({ method: metodo, query, cookies: { token: 'sessao' }, body: {}, headers: {} } as unknown as NextApiRequest, res)
    return saida
}

describe('(1) só o super admin', () => {
    it.each([['motor'], ['tipologias'], ['tipologia']] as const)('%s: quem não é super admin recebe 404, e nada do motor é lido', async (rota) => {
        estado.usuario = ADMIN
        const r = await chamar(rota, { tenantId: CONTA, tabela: T1, tipologia: 'DP-02' })
        expect(r.status).toBe(404)
        expect(estado.leituras.filter((t) => t.startsWith('orcamentista_'))).toEqual([])
    })

    it('conta que não é uuid: 404; método errado: 405', async () => {
        expect((await chamar('motor', { tenantId: 'x' })).status).toBe(404)
        expect((await chamar('motor', { tenantId: CONTA }, 'POST')).status).toBe(405)
    })
})

describe('(2) o resumo do que a conta tem carregado', () => {
    it('por tabela EM USO NA CONTA: fornecedor, arquivos, família, contas que a usam, linhas e contagens exatas', async () => {
        const r = await chamar('motor', { tenantId: CONTA })
        expect(r.status).toBe(200)
        expect(r.corpo.tabelas).toHaveLength(1)
        const t = r.corpo.tabelas[0]
        expect(t).toEqual(expect.objectContaining({
            tabela_id: T1, fornecedor: 'Wolff Perfis', arquivo_nome: 'Tabela Wolff.xlsx', motor_nome: 'Motor Wolff.xlsx', vigencia: 'desde 10/2026', familia: null,
            contas_usando: ['Esquadrias De Paula', 'Outra Esquadrias'],
        }))
        expect(t.linhas).toEqual([{ linha: 'PVC WOLFF DESIGN', tipologias: 1 }, { linha: 'PVC WOLFF EUROPA 42', tipologias: 2 }])
        // contagens EXATAS pelo banco — os 1.206 perfis da tabela, e não as mil linhas de uma leitura
        expect(t.contagens).toEqual({
            tipologias: 3, perfis: 1206, formulas: 1, variaveis: 1, vidros: 1, baguetes: 1, insumos: 1, validacoes: 1,
            otimizacao: 2, formulas_da_linha: 1, regras: 2, tempos: 1, itens_de_preco: 3,
        })
        expect(t.otimizacao).toEqual([{ parametro: 'barra_mm', valor: '6000' }, { parametro: 'serra_mm', valor: '5' }])
    })

    it('a lista das famílias, na ordem, e o critério de custo das barras de cada matéria-prima DESTA conta', async () => {
        const r = await chamar('motor', { tenantId: CONTA })
        expect(r.corpo.familias).toEqual([{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }])
        expect(r.corpo.materias_primas).toEqual([{ id: 'mp-1', nome: 'Perfis PVC', criterio_custo_barra: 'CONSUMO_REAL' }])
    })

    it('sem critério gravado: null — "não configurado", nunca um padrão', async () => {
        estado.db.orcamentista_mp_categoria[0].config = { serra_mm: 5 }
        const r = await chamar('motor', { tenantId: CONTA })
        expect(r.corpo.materias_primas).toEqual([{ id: 'mp-1', nome: 'Perfis PVC', criterio_custo_barra: null }])
    })

    it('conta sem tabela em uso: a lista vem vazia, e não é erro', async () => {
        estado.db.orcamentista_conta_tabela = estado.db.orcamentista_conta_tabela.filter((l) => l.tenant_id !== CONTA)
        const r = await chamar('motor', { tenantId: CONTA })
        expect(r.status).toBe(200)
        expect(r.corpo.tabelas).toEqual([])
    })
})

describe('(3) a tabela de outra conta não entra', () => {
    it('a T2, que só a outra conta usa, não aparece no resumo', async () => {
        const r = await chamar('motor', { tenantId: CONTA })
        expect(r.corpo.tabelas.map((t: Linha) => t.tabela_id)).toEqual([T1])
    })

    it.each([['tipologias'], ['tipologia']] as const)('%s: a tabela que a conta não usa é 404, e as abas não são lidas', async (rota) => {
        const r = await chamar(rota, { tenantId: CONTA, tabela: T2, tipologia: 'SU-01' })
        expect(r.status).toBe(404)
        expect(estado.leituras.some((t) => t.startsWith('orcamentista_motor_'))).toBe(false)
    })
})

describe('(4) as tipologias e as abas de UMA tipologia', () => {
    it('as tipologias da tabela, por linha e pela ordem do arquivo, com as medidas e o tempo', async () => {
        const r = await chamar('tipologias', { tenantId: CONTA, tabela: T1 })
        expect(r.status).toBe(200)
        expect(r.corpo.map((t: Linha) => t.tipologia)).toEqual(['DP-01', 'DP-02', 'DP-03'])
        expect(r.corpo[1]).toEqual(expect.objectContaining({
            tipologia: 'DP-02', linha: 'PVC WOLFF EUROPA 42', descricao: 'JANELA DE CORRER 02 FOLHAS', larg_min_mm: 600, larg_max_mm: 3000,
            n_perfis: 1205, tempo_fabricacao_min: 300, tempo_origem: 'ESTIMADO',
        }))
        expect(r.corpo[0].tempo_fabricacao_min).toBeNull()
    })

    it('as abas da DP-02 DESTA tabela: os 1.205 perfis inteiros (paginados), e nada da outra tabela nem da outra tipologia', async () => {
        const r = await chamar('tipologia', { tenantId: CONTA, tabela: T1, tipologia: 'DP-02' })
        expect(r.status).toBe(200)
        expect(r.corpo.perfis).toHaveLength(1205)
        expect(r.corpo.perfis.some((p: Linha) => p.perfil === 'DA-OUTRA-TABELA' || p.perfil === 'X')).toBe(false)
        // na ordem do arquivo, sem as colunas internas
        expect(r.corpo.perfis[0]).toEqual({ ordem: 2, linha: 'EUROPA 42', perfil: 'PF0', descricao: 'perfil', corte: '90/90', qtd: '1', medida: 'L', posicao: null, esp_vidro: null, condicao: null, obs: null })
        expect(r.corpo.formulas).toEqual([{ ordem: 2, linha: 'EUROPA 42', variavel: 'HFOL', descricao: 'altura da folha', formula: '(H-10)' }])
        expect(Object.keys(r.corpo).sort()).toEqual(['baguetes', 'formulas', 'insumos', 'perfis', 'validacoes', 'variaveis', 'vidros'])
    })

    it('tipologia sem código: 400', async () => {
        expect((await chamar('tipologia', { tenantId: CONTA, tabela: T1 })).status).toBe(400)
    })
})
