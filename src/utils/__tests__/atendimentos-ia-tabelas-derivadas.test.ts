/**
 * @jest-environment node
 *
 * PORTÃO — as TABELAS DA CONTA são DERIVADAS da base de conhecimento (dono do produto, 26/10/2026).
 *
 * "Tabelas em uso" sai da tela da conta. As tabelas de uma conta passam a ser as tabelas dos fornecedores
 * que a base de conhecimento já vincula (matéria-prima → categoria → fornecedores). As decisões:
 *   1 e 2. `orcamentista_conta_tabela` deixa de ser ESCRITA e de ser LIDA, e FICA no banco, parada, com as
 *          FKs e as policies. A proteção que o RESTRICT dela dava — não excluir tabela em uso — muda de
 *          lugar: a rota confere o uso DERIVADO antes de apagar. "Escreva o teste que prova a recusa."
 *   3. Quem decide se a tabela entra na conversa é o MOTOR, não a categoria: tabela com tipologias entra;
 *      tabela sem tipologias é TABELA DE PREÇO e não entra. Recusas nomeadas: fornecedor do PERFIL sem
 *      tabela, e NENHUMA tabela da conta com motor. Fornecedor de outra categoria sem tabela não recusa.
 *   5. Com mais de uma tabela do mesmo fornecedor e da mesma família, vale a VIGENTE; nenhuma marcada é
 *      recusa nomeada. Com UMA só no par, ela vale (não há o que escolher).
 *
 * O que este portão fica vermelho:
 *   (1) a derivação: as tabelas dos fornecedores vinculados NESTA conta, com a categoria, o motor e qual
 *       vale — e a linha de `orcamentista_conta_tabela` não muda nada;
 *   (2) a conversa: tabela de preço fora, as três recusas nomeadas, a vigente;
 *   (3) a exclusão da tabela: 409 nomeando a conta que vincula o fornecedor, ANTES de apagar — com
 *       `orcamentista_conta_tabela` vazia, que é o caso em que o RESTRICT do banco não protegeria nada;
 *   (4) quem usa: a lista de fornecedores diz as contas pelo vínculo da base de conhecimento;
 *   (5) nenhum arquivo de `src/` fala com `orcamentista_conta_tabela`.
 *
 * O que NÃO alcança: o banco é falso. A derivação lê as mesmas tabelas que a árvore da base de conhecimento.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipo */
import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, any>

const PAULA = '20e08592-f957-4e72-b7eb-251387e34eb9'
const NORTE = '00000000-0000-4000-8000-0000000000b2'
const F_WOLFF = '00000000-0000-4000-8000-0000000000f1'
const F_ESTRELA = '00000000-0000-4000-8000-0000000000f2'
const F_SUL = '00000000-0000-4000-8000-0000000000f3'
const F_FERRAGEM = '00000000-0000-4000-8000-0000000000f4'
const T_WOLFF = '72366020-57c9-489f-9385-397b7fa3dedb'
const T_WOLFF_2027 = '00000000-0000-4000-8000-00000000ab27'
const T_WOLFF_ALU = '00000000-0000-4000-8000-00000000ab0a'
const T_ESTRELA = '5f7acebf-3c91-46de-af00-57a47f8be288'
const T_SUL = '00000000-0000-4000-8000-00000000ab03'
const T_SOLTA = '00000000-0000-4000-8000-00000000ab04'
const SUPER = { id: '00000000-0000-4000-8000-00000000005a', tenant_id: null as string | null, role: 'super_admin', is_super_admin: true }

const estado = {
    db: {} as Record<string, Linha[]>,
    lidas: [] as string[],
    apagadas: [] as Array<{ tabela: string; filtros: Linha }>,
    removidosDoStorage: [] as string[],
}

const tabela = (id: string, fornecedor_id: string, arquivo_nome: string, familia: string | null, vigente = false) => ({
    id, fornecedor_id, arquivo_nome, arquivo_path: `${fornecedor_id}/arquivo/${id}.xlsx`, motor_nome: 'motor.xlsx', motor_path: `${fornecedor_id}/motor/${id}.xlsx`,
    vigencia: null as string | null, familia, vigente, criado_em: '2026-10-20T12:00:00Z',
})
const tipologias = (tabela_id: string, ...codigos: string[]) => codigos.map((tipologia) => ({ tabela_id, tipologia, descricao: `${tipologia} da ${tabela_id.slice(-4)}`, tipo: 'Correr', ordem: null as number | null }))
const categoria = (id: string, tenant_id: string, categoria_chave: string) => ({ id, tenant_id, materia_prima_id: `mp-${tenant_id.slice(-4)}`, categoria_chave, config: null as Linha | null })
const vinculo = (tenant_id: string, mp_categoria_id: string, fornecedor_id: string, principal = false) => ({ id: `v-${mp_categoria_id}-${fornecedor_id}`, tenant_id, mp_categoria_id, fornecedor_id, principal, ordem: 1 })

/** Produção em 26/10/2026, De Paula: PERFIL → Wolff (164 tipologias), VIDRO → Estrela (0 tipologias, tabela de preço). */
function montar() {
    estado.lidas = []
    estado.apagadas = []
    estado.removidosDoStorage = []
    estado.db = {
        users: [SUPER],
        tenants: [{ id: PAULA, name: 'Esquadrias De Paula' }, { id: NORTE, name: 'Esquadrias Norte' }],
        orcamentista_fornecedor: [
            { id: F_WOLFF, nome: 'Wolff Perfis', nicho_id: 'n-esq' }, { id: F_ESTRELA, nome: 'Vidros Estrela', nicho_id: 'n-esq' },
            { id: F_SUL, nome: 'Perfis Sul', nicho_id: 'n-esq' }, { id: F_FERRAGEM, nome: 'Ferragens Ômega', nicho_id: 'n-esq' },
        ],
        orcamentista_nicho: [{ id: 'n-esq', modelo: 'FABRICACAO', nome: 'Esquadrias' }],
        orcamentista_familia_catalogo: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }],
        orcamentista_tabela: [
            tabela(T_WOLFF, F_WOLFF, 'Wolff 2026.xlsx', 'PVC'),
            tabela(T_ESTRELA, F_ESTRELA, 'Estrela vidros.xlsx', null),
            tabela(T_SUL, F_SUL, 'Sul 2026.xlsx', 'ALUMINIO'),
        ],
        orcamentista_motor_tipologia_detalhe: [...tipologias(T_WOLFF, 'DP-01', 'DP-02'), ...tipologias(T_SUL, 'SU-07')],
        orcamentista_mp_categoria: [
            categoria('c-perfil', PAULA, 'PERFIL'), categoria('c-vidro', PAULA, 'VIDRO'), categoria('c-ferragem', PAULA, 'FERRAGENS'),
            categoria('c-norte-perfil', NORTE, 'PERFIL'),
        ],
        orcamentista_mp_categoria_fornecedor: [
            vinculo(PAULA, 'c-perfil', F_WOLFF, true), vinculo(PAULA, 'c-vidro', F_ESTRELA, true),
            vinculo(NORTE, 'c-norte-perfil', F_SUL, true),
        ],
        // a linha antiga, PARADA: aponta uma tabela de fornecedor que a base de conhecimento da De Paula NÃO vincula
        orcamentista_conta_tabela: [{ tenant_id: PAULA, tabela_id: T_SUL }],
    }
}
beforeEach(montar)

jest.mock('@/supabase/admin', () => {
    const cliente = {
        auth: { getUser: async (): Promise<any> => ({ data: { user: { id: '00000000-0000-4000-8000-00000000005a' } }, error: null as unknown }) },
        from: (nome: string) => {
            const predicados: Array<(l: Linha) => boolean> = []
            const filtros: Linha = {}
            let apagar = false
            let contar = false
            let cabeca = false
            const responder = () => {
                const todas = estado.db[nome] ?? []
                const linhas = todas.filter((l) => predicados.every((p) => p(l)))
                if (apagar) {
                    estado.apagadas.push({ tabela: nome, filtros })
                    estado.db[nome] = todas.filter((l) => !linhas.includes(l))
                } else {
                    estado.lidas.push(nome)
                }
                return { data: cabeca ? null : linhas, error: null as unknown, count: contar ? linhas.length : null }
            }
            const q: any = {
                select: (_c?: string, o?: { count?: string; head?: boolean }) => { contar = o?.count === 'exact'; cabeca = !!o?.head; return q },
                delete: () => { apagar = true; return q },
                eq: (c: string, v: unknown) => { filtros[c] = v; predicados.push((l) => l[c] === v); return q },
                in: (c: string, vs: unknown[]) => { filtros[c] = vs; predicados.push((l) => vs.includes(l[c])); return q },
                order: () => q,
                limit: () => q,
                range: () => q,
                single: async () => { const r = responder(); return { data: r.data?.[0] ?? null, error: null as unknown } },
                maybeSingle: async () => { const r = responder(); return { data: r.data?.[0] ?? null, error: null as unknown } },
                then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder()).then(ok, erro),
            }
            return q
        },
        storage: { from: () => ({ remove: async (caminhos: string[]) => { estado.removidosDoStorage.push(...caminhos); return { error: null as unknown } } }) },
    }
    return { supabaseAdmin: cliente }
})

/* eslint-disable @typescript-eslint/no-require-imports */
const D = () => require('@/lib/atendimentos-ia/tabelas-da-conta') as typeof import('@/lib/atendimentos-ia/tabelas-da-conta')
const C = () => require('@/lib/atendimentos-ia/levantamento-da-conversa') as typeof import('@/lib/atendimentos-ia/levantamento-da-conversa')
const R = () => require('@/lib/atendimentos-ia/repositorio') as typeof import('@/lib/atendimentos-ia/repositorio')
const rotaDaTabela = () => require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-enable @typescript-eslint/no-require-imports */

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())

const naoTocouAContaTabela = () => {
    expect(estado.lidas).not.toContain('orcamentista_conta_tabela')
    expect(estado.apagadas.map((a) => a.tabela)).not.toContain('orcamentista_conta_tabela')
}

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(1) a derivação: as tabelas dos fornecedores que a base de conhecimento vincula NESTA conta', () => {
    it('De Paula: a Wolff pelo PERFIL, com motor; a Estrela pelo VIDRO, tabela de preço — e a linha parada de conta_tabela não entra', async () => {
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas).toEqual([
            { tabelaId: T_ESTRELA, fornecedorId: F_ESTRELA, fornecedor: 'Vidros Estrela', familia: null, arquivo_nome: 'Estrela vidros.xlsx', vigente: false, categorias: ['VIDRO'], tipologias: 0, comMotor: false, vale: true },
            { tabelaId: T_WOLFF, fornecedorId: F_WOLFF, fornecedor: 'Wolff Perfis', familia: 'PVC', arquivo_nome: 'Wolff 2026.xlsx', vigente: false, categorias: ['PERFIL'], tipologias: 2, comMotor: true, vale: true },
        ])
        expect(d.fornecedoresSemTabela).toEqual([])
        expect(d.paresSemVigente).toEqual([])
        naoTocouAContaTabela()
    })

    it('o contraste: a outra conta deriva a tabela do fornecedor DELA', async () => {
        const d = await D().derivarTabelasDaConta(NORTE)
        expect(d.tabelas.map((t) => [t.tabelaId, t.categorias])).toEqual([[T_SUL, ['PERFIL']]])
    })

    it('fornecedor vinculado SEM tabela: fica na lista dos sem tabela, com a categoria', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor.push(vinculo(PAULA, 'c-ferragem', F_FERRAGEM))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.fornecedoresSemTabela).toEqual([{ fornecedorId: F_FERRAGEM, fornecedor: 'Ferragens Ômega', categorias: ['FERRAGENS'] }])
        expect(d.tabelas).toHaveLength(2)
    })

    it('o mesmo fornecedor em duas categorias: UMA tabela, com as duas categorias', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor.push(vinculo(PAULA, 'c-ferragem', F_WOLFF))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.find((t) => t.tabelaId === T_WOLFF)?.categorias).toEqual(['FERRAGENS', 'PERFIL'])
        expect(d.tabelas).toHaveLength(2)
    })

    it('duas tabelas do MESMO fornecedor e da MESMA família, nenhuma vigente: nenhuma vale, e o par é nomeado', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_2027, F_WOLFF, 'Wolff 2027.xlsx', 'PVC'))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.filter((t) => t.fornecedorId === F_WOLFF).map((t) => [t.arquivo_nome, t.vale])).toEqual([['Wolff 2026.xlsx', false], ['Wolff 2027.xlsx', false]])
        expect(d.paresSemVigente).toEqual([{ fornecedor: 'Wolff Perfis', familia: 'PVC', arquivos: ['Wolff 2026.xlsx', 'Wolff 2027.xlsx'] }])
    })

    it('o contraste: com a de 2027 marcada vigente, SÓ ela vale — a de 2026 continua listada, sem valer', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_2027, F_WOLFF, 'Wolff 2027.xlsx', 'PVC', true))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.filter((t) => t.fornecedorId === F_WOLFF).map((t) => [t.arquivo_nome, t.vale])).toEqual([['Wolff 2026.xlsx', false], ['Wolff 2027.xlsx', true]])
        expect(d.paresSemVigente).toEqual([])
    })

    it('o mesmo fornecedor com famílias DIFERENTES: as duas valem, sem marca nenhuma', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_ALU, F_WOLFF, 'Wolff alumínio.xlsx', 'ALUMINIO'))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.filter((t) => t.fornecedorId === F_WOLFF).map((t) => [t.familia, t.vale])).toEqual([['Alumínio', true], ['PVC', true]])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(2) a conversa: quem entra é a tabela COM motor', () => {
    const lida = async () => {
        const t = await C().lerTabelaDaEmpresa(PAULA)
        if ('frase' in t) throw new Error('era para ler: ' + t.frase)
        return t
    }

    it('a tabela de preço (Estrela, sem tipologias) NÃO entra, e não recusa: a lista é a da Wolff', async () => {
        const t = await lida()
        expect(t.tabelas).toEqual([{ tabelaId: T_WOLFF, fornecedor: 'Wolff Perfis', familia: 'PVC' }])
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
        naoTocouAContaTabela()
    })

    it('fornecedor de OUTRA categoria sem tabela não recusa: a conversa segue', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor.push(vinculo(PAULA, 'c-ferragem', F_FERRAGEM))
        expect((await lida()).tabelas.map((t) => t.tabelaId)).toEqual([T_WOLFF])
    })

    it('fornecedor do PERFIL sem tabela: recusa NOMEADA, dizendo qual', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor.push(vinculo(PAULA, 'c-perfil', F_FERRAGEM))
        const t = await C().lerTabelaDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['PERFIL_SEM_TABELA', C().fraseDoPerfilSemTabela('Ferragens Ômega')])
        expect(C().fraseDoPerfilSemTabela('Ferragens Ômega')).toContain('Ferragens Ômega')
    })

    it('NENHUMA tabela com motor: recusa nomeada dizendo isso, com os fornecedores das tabelas de preço', async () => {
        estado.db.orcamentista_motor_tipologia_detalhe = []
        const t = await C().lerTabelaDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['SEM_MOTOR', C().fraseSemMotor(['Vidros Estrela', 'Wolff Perfis'])])
        expect(C().fraseSemMotor(['Vidros Estrela', 'Wolff Perfis'])).toContain('Vidros Estrela e Wolff Perfis')
    })

    it('a base de conhecimento não vincula fornecedor nenhum: SEM_TABELA — a linha parada de conta_tabela não a salva', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor = estado.db.orcamentista_mp_categoria_fornecedor.filter((v) => v.tenant_id !== PAULA)
        const t = await C().lerTabelaDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['SEM_TABELA', C().FRASE_SEM_TABELA])
    })

    it('duas tabelas da Wolff em PVC, nenhuma vigente: recusa nomeada — não escolho entre elas', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_2027, F_WOLFF, 'Wolff 2027.xlsx', 'PVC'))
        estado.db.orcamentista_motor_tipologia_detalhe.push(...tipologias(T_WOLFF_2027, 'DP-02'))
        const t = await C().lerTabelaDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['SEM_VIGENTE', C().fraseSemVigente('Wolff Perfis', 'PVC', 2)])
    })

    it('o contraste: com a de 2027 vigente, a conversa usa SÓ a de 2027', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_2027, F_WOLFF, 'Wolff 2027.xlsx', 'PVC', true))
        estado.db.orcamentista_motor_tipologia_detalhe.push(...tipologias(T_WOLFF_2027, 'DP-02'))
        const t = await lida()
        expect(t.tabelas.map((x) => x.tabelaId)).toEqual([T_WOLFF_2027])
        expect(t.candidatos.map((c) => [c.tipologia, c.tabelaId])).toEqual([['DP-02', T_WOLFF_2027]])
    })

    it('duas tabelas de PREÇO no mesmo par, sem vigente, não recusam: elas não entram na conversa', async () => {
        estado.db.orcamentista_tabela.push(tabela('estrela-2027', F_ESTRELA, 'Estrela 2027.xlsx', null))
        expect((await lida()).tabelas.map((t) => t.tabelaId)).toEqual([T_WOLFF])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(3) a exclusão da tabela: a proteção que MUDOU DE LUGAR — do RESTRICT de conta_tabela para a rota', () => {
    async function excluir(id: string) {
        let status = 0
        let json: any = null
        const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
        await rotaDaTabela()({ cookies: { token: 't' }, method: 'DELETE', query: { id }, body: undefined } as unknown as NextApiRequest, res as unknown as NextApiResponse)
        return { status, json }
    }

    it('tabela de fornecedor que uma conta vincula: 409 NOMEANDO a conta, e nada é apagado — com conta_tabela VAZIA', async () => {
        estado.db.orcamentista_conta_tabela = []
        const r = await excluir(T_WOLFF)
        expect(r.status).toBe(409)
        expect(r.json.contas).toEqual(['Esquadrias De Paula'])
        expect(r.json.error).toContain('Esquadrias De Paula')
        expect(estado.apagadas).toEqual([])
        expect(estado.removidosDoStorage).toEqual([])
        expect(estado.db.orcamentista_tabela.map((t) => t.id)).toContain(T_WOLFF)
    })

    it('a tabela ANTIGA, não vigente, do fornecedor vinculado também é recusada: ela explica um orçamento do ano passado', async () => {
        estado.db.orcamentista_conta_tabela = []
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_2027, F_WOLFF, 'Wolff 2027.xlsx', 'PVC', true))
        const r = await excluir(T_WOLFF)
        expect(r.status).toBe(409)
        expect(estado.apagadas).toEqual([])
    })

    it('o objeto do motor que uma PLANILHA também usa (PR C) NÃO sai do armazenamento — o do preço sai, e a planilha continua de pé', async () => {
        estado.db.orcamentista_fornecedor.push({ id: 'f-solto', nome: 'Solto', nicho_id: 'n-esq' })
        estado.db.orcamentista_tabela.push(tabela(T_SOLTA, 'f-solto', 'Solta.xlsx', null))
        estado.db.orcamentista_motor = [{ id: 'm-1', familia: 'PVC', fornecedor_id: 'f-solto', arquivo_nome: 'motor.xlsx', arquivo_path: `f-solto/motor/${T_SOLTA}.xlsx`, vigente: true, arquivado_em: null }]
        const r = await excluir(T_SOLTA)
        expect(r.status).toBe(200)
        expect(estado.removidosDoStorage).toEqual([`f-solto/arquivo/${T_SOLTA}.xlsx`])
        expect(r.json.aviso).toBe(`Mantido no armazenamento, porque uma planilha do motor usa o mesmo arquivo: f-solto/motor/${T_SOLTA}.xlsx.`)
        expect(estado.db.orcamentista_motor).toHaveLength(1)
    })

    it('...e a planilha ARQUIVADA também segura o objeto: arquivar não é apagar, e o arquivo é dela', async () => {
        estado.db.orcamentista_fornecedor.push({ id: 'f-solto', nome: 'Solto', nicho_id: 'n-esq' })
        estado.db.orcamentista_tabela.push(tabela(T_SOLTA, 'f-solto', 'Solta.xlsx', null))
        estado.db.orcamentista_motor = [{ id: 'm-1', familia: 'PVC', fornecedor_id: 'f-solto', arquivo_nome: 'motor.xlsx', arquivo_path: `f-solto/motor/${T_SOLTA}.xlsx`, vigente: false, arquivado_em: '2026-10-27T10:00:00Z' }]
        await excluir(T_SOLTA)
        expect(estado.removidosDoStorage).toEqual([`f-solto/arquivo/${T_SOLTA}.xlsx`])
    })

    it('o controle: uma planilha que aponta OUTRO objeto não segura nada — os dois arquivos da tabela saem', async () => {
        estado.db.orcamentista_fornecedor.push({ id: 'f-solto', nome: 'Solto', nicho_id: 'n-esq' })
        estado.db.orcamentista_tabela.push(tabela(T_SOLTA, 'f-solto', 'Solta.xlsx', null))
        estado.db.orcamentista_motor = [{ id: 'm-1', familia: 'PVC', fornecedor_id: 'f-solto', arquivo_nome: 'outro.xlsx', arquivo_path: 'f-solto/motor/outro-objeto.xlsx', vigente: true, arquivado_em: null }]
        const r = await excluir(T_SOLTA)
        expect(estado.removidosDoStorage).toEqual([`f-solto/arquivo/${T_SOLTA}.xlsx`, `f-solto/motor/${T_SOLTA}.xlsx`])
        expect(r.json.aviso).toBeUndefined()
    })

    it('o contraste: tabela de fornecedor que NENHUMA conta vincula sai, e os arquivos dela também', async () => {
        estado.db.orcamentista_fornecedor.push({ id: 'f-solto', nome: 'Solto', nicho_id: 'n-esq' })
        estado.db.orcamentista_tabela.push(tabela(T_SOLTA, 'f-solto', 'Solta.xlsx', null))
        const r = await excluir(T_SOLTA)
        expect(r.status).toBe(200)
        expect(estado.apagadas).toEqual([{ tabela: 'orcamentista_tabela', filtros: { id: T_SOLTA } }])
        expect(estado.removidosDoStorage).toEqual([`f-solto/arquivo/${T_SOLTA}.xlsx`, `f-solto/motor/${T_SOLTA}.xlsx`])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(4) quem usa: pelo vínculo da base de conhecimento, não por conta_tabela', () => {
    it('a Wolff é usada pela De Paula, a Sul pela Norte — a linha parada (De Paula → Sul) não conta', async () => {
        expect((await R().obterFornecedor(F_WOLFF))?.contas_usando).toEqual(['Esquadrias De Paula'])
        expect((await R().obterFornecedor(F_SUL))?.contas_usando).toEqual(['Esquadrias Norte'])
        expect(await R().contasQueUsamATabela(T_SUL)).toEqual(['Esquadrias Norte'])
        naoTocouAContaTabela()
    })

    it('fornecedor vinculado SEM tabela também é usado: a exclusão dele é recusada pelo vínculo', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor.push(vinculo(PAULA, 'c-ferragem', F_FERRAGEM))
        expect(await R().quemSeguraOFornecedor(F_FERRAGEM)).toEqual({ tabelas: [], contas: ['Esquadrias De Paula'] })
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
/**
 * (5) Nenhum arquivo de `src/` (fora dos testes) chama `.from('orcamentista_conta_tabela')`. O instrumento é
 * uma regex sobre o texto; antes de confiar nela, as fixtures: o caso que deve aparecer, nas formas que o
 * código usa, e o comentário que cita o nome e não deve aparecer (`instrumento-que-nao-enxerga.md`).
 */
const FALA_COM_A_CONTA_TABELA = /\.from\(\s*['"`]orcamentista_conta_tabela['"`]\s*\)/
function arquivosDe(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === '__tests__' ? [] : arquivosDe(p)
        return /\.(ts|tsx)$/.test(e.name) ? [p] : []
    })
}

describe('(5) orcamentista_conta_tabela FICA no banco, parada: nenhum código a lê nem a escreve', () => {
    it.each([
        ["db().from('orcamentista_conta_tabela').select('tabela_id')", true],
        ['supabaseAdmin.from("orcamentista_conta_tabela").insert(u)', true],
        ['db().from(\n  `orcamentista_conta_tabela`\n).delete()', true],
        ['// antes: `orcamentista_conta_tabela` guardava a escolha', false],
        ["db().from('orcamentista_conta_tabela_v2')", false],
    ])('a regex: %p → %p', (texto, casa) => {
        expect(FALA_COM_A_CONTA_TABELA.test(texto)).toBe(casa)
    })

    it('nenhum arquivo de src/ fora dos testes casa', () => {
        const raiz = path.join(__dirname, '..', '..')
        const arquivos = arquivosDe(raiz)
        expect(arquivos.length).toBeGreaterThan(100)
        expect(arquivos.filter((a) => FALA_COM_A_CONTA_TABELA.test(fs.readFileSync(a, 'utf8'))).map((a) => path.relative(raiz, a))).toEqual([])
    })
})
