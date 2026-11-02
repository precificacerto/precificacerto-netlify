/**
 * @jest-environment node
 *
 * PORTÃO — as TABELAS DA CONTA são DERIVADAS da base de conhecimento (dono do produto, 26/10/2026).
 *
 * "Tabelas em uso" sai da tela da conta. As tabelas de uma conta passam a ser as tabelas dos fornecedores
 * que a base de conhecimento já vincula (matéria-prima → categoria → fornecedores). As decisões:
 *   1 e 2. `orcamentista_conta_tabela` deixa de ser ESCRITA e de ser LIDA, e FICA no banco, parada, com as
 *          FKs e as policies. A proteção que o RESTRICT dela dava — não excluir tabela em uso — mudou de
 *          lugar para a rota em 26/10/2026, e SAIU em 01/11/2026 (dono do produto: "Se for excluído, deve ser excluído"; migração
 *          20261101000001): a tabela está na soberania do catálogo e se remove pelo arrasto, que mostra quem para.
 *   3. (Até o PR D: quem decidia se a tabela entrava na conversa era o motor importado nela.) DESDE O PR D (02/11/2026), o motor
 *      vem da FAMÍLIA da conta, e toda tabela derivada da família (ou de família nula) é PREÇO. Recusas nomeadas: fornecedor do
 *      PERFIL sem tabela, e a família sem tabela vigente. Fornecedor de outra categoria sem tabela não recusa.
 *   5. Com mais de uma tabela do mesmo fornecedor e da mesma família, vale a VIGENTE; nenhuma marcada é
 *      recusa nomeada. Com UMA só no par, ela vale (não há o que escolher).
 *
 * O que este portão fica vermelho:
 *   (1) a derivação: as tabelas dos fornecedores vinculados NESTA conta, com a categoria, o motor e qual
 *       vale — e a linha de `orcamentista_conta_tabela` não muda nada;
 *   (2) a conversa: o motor da família, as tabelas da família como preço, as recusas nomeadas, a vigente;
 *   (3) a rota da tabela não apaga mais: o DELETE é 405, e nada sai do banco nem do armazenamento — também a tabela que uma conta usa;
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
/** O motor do catálogo que as etapas 1 e 2 da família PVC da De Paula apontam (PR D). */
const M_WOLFF = '9a233c55-f377-45d3-b2ae-b1a740a98e44'
const SUPER = { id: '00000000-0000-4000-8000-00000000005a', tenant_id: null as string | null, role: 'super_admin', is_super_admin: true }

const estado = {
    db: {} as Record<string, Linha[]>,
    lidas: [] as string[],
    apagadas: [] as Array<{ tabela: string; filtros: Linha }>,
    removidosDoStorage: [] as string[],
}

const tabela = (id: string, fornecedor_id: string, arquivo_nome: string, familia: string | null, vigente = false, categoria_chave: string | null = null) => ({
    id, fornecedor_id, arquivo_nome, arquivo_path: `${fornecedor_id}/arquivo/${id}.xlsx`, motor_nome: 'motor.xlsx', motor_path: `${fornecedor_id}/motor/${id}.xlsx`,
    vigencia: null as string | null, familia, vigente, categoria_chave, criado_em: '2026-10-20T12:00:00Z',
})
const tipologias = (tabela_id: string, ...codigos: string[]) => codigos.map((tipologia) => ({ tabela_id, tipologia, descricao: `${tipologia} da ${tabela_id.slice(-4)}`, tipo: 'Correr', ordem: null as number | null }))
const categoria = (id: string, tenant_id: string, categoria_chave: string) => ({ id, tenant_id, materia_prima_id: `mp-${tenant_id.slice(-4)}`, categoria_chave, config: null as Linha | null })
const vinculo = (tenant_id: string, mp_categoria_id: string, fornecedor_id: string, principal = false) => ({ id: `v-${mp_categoria_id}-${fornecedor_id}`, tenant_id, mp_categoria_id, fornecedor_id, principal, ordem: 1 })

/**
 * Produção em 26/10/2026, De Paula: PERFIL → Wolff, VIDRO → Estrela (tabela de preço). Desde o PR D (02/11/2026), as 164 tipologias são do
 * MOTOR da família (motor_id), não da tabela da Wolff.
 */
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
        // o conteúdo do motor mora no MOTOR (motor_id), como em produção; as linhas por tabela_id ficam PARADAS (a forma antiga) e não
        // são lidas pela conversa (PR D)
        orcamentista_motor_tipologia_detalhe: [
            ...tipologias(T_WOLFF, 'XX-01'), ...tipologias(T_SUL, 'SU-07'),
            ...['DP-01', 'DP-02'].map((tipologia) => ({ tabela_id: null as string | null, motor_id: M_WOLFF, tipologia, descricao: `${tipologia} do motor`, tipo: 'Correr', ordem: null as number | null })),
        ],
        // a família da De Paula na base de conhecimento, e as etapas 1 e 2 com o motor
        orcamentista_materia_prima: [{ id: 'mp-4eb9', tenant_id: PAULA, nome: 'Esquadrias de PVC', familia: 'PVC' }],
        orcamentista_familia_etapa: [1, 2].map((numero) => ({ tenant_id: PAULA, materia_prima_id: 'mp-4eb9', numero, motor_id: M_WOLFF })),
        orcamentista_motor: [{ id: M_WOLFF, nome: 'Motor_Wolf_PVC', fornecedor_id: F_WOLFF, arquivado_em: null }],
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
            { tabelaId: T_ESTRELA, fornecedorId: F_ESTRELA, fornecedor: 'Vidros Estrela', familia: null, familiaChave: null, categoria: null, arquivo_nome: 'Estrela vidros.xlsx', vigente: false, categorias: ['VIDRO'], vale: true },
            { tabelaId: T_WOLFF, fornecedorId: F_WOLFF, fornecedor: 'Wolff Perfis', familia: 'PVC', familiaChave: 'PVC', categoria: null, arquivo_nome: 'Wolff 2026.xlsx', vigente: false, categorias: ['PERFIL'], vale: true },
        ])
        // a derivação é só PREÇO desde o PR D: não conta tipologia de tabela nenhuma
        expect(estado.lidas).not.toContain('orcamentista_motor_tipologia_detalhe')
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
        expect(d.paresSemVigente).toEqual([{ fornecedor: 'Wolff Perfis', familia: 'PVC', categoria: null, arquivos: ['Wolff 2026.xlsx', 'Wolff 2027.xlsx'] }])
    })

    it('o contraste: com a de 2027 marcada vigente, SÓ ela vale — a de 2026 continua listada, sem valer', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_2027, F_WOLFF, 'Wolff 2027.xlsx', 'PVC', true))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.filter((t) => t.fornecedorId === F_WOLFF).map((t) => [t.arquivo_nome, t.vale])).toEqual([['Wolff 2026.xlsx', false], ['Wolff 2027.xlsx', true]])
        expect(d.paresSemVigente).toEqual([])
    })

    it('as TRÊS da Wolff na mesma família (Perfil, Reforço, Acessórios), cada uma com a sua categoria: as três valem, nenhuma marcada, e nada é par sem vigente', async () => {
        estado.db.orcamentista_tabela.push(
            tabela('wolff-perfil', F_WOLFF, 'Wolff perfil.xlsx', 'PVC', false, 'PERFIL'),
            tabela('wolff-reforco', F_WOLFF, 'Wolff reforço.xlsx', 'PVC', false, 'REFORCO'),
            tabela('wolff-acess', F_WOLFF, 'Wolff acessórios.xlsx', 'PVC', false, 'ACESSORIOS_VEDACAO'),
        )
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.filter((t) => t.tabelaId.startsWith('wolff-')).map((t) => [t.categoria, t.familiaChave, t.vale])).toEqual([['ACESSORIOS_VEDACAO', 'PVC', true], ['PERFIL', 'PVC', true], ['REFORCO', 'PVC', true]])
        expect(d.paresSemVigente).toEqual([])
    })

    it('a tabela de antes (sem categoria) e a PERFIL nova são grupos DIFERENTES: as duas valem, e a antiga continua listada sem categoria', async () => {
        estado.db.orcamentista_tabela.push(tabela('wolff-perfil', F_WOLFF, 'Wolff perfil.xlsx', 'PVC', false, 'PERFIL'))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.filter((t) => t.fornecedorId === F_WOLFF).map((t) => [t.arquivo_nome, t.categoria, t.vale])).toEqual([['Wolff 2026.xlsx', null, true], ['Wolff perfil.xlsx', 'PERFIL', true]])
    })

    it('duas de REFORCO sem vigente: SÓ esse grupo vira par sem vigente, com a categoria; a PERFIL ao lado segue valendo', async () => {
        estado.db.orcamentista_tabela.push(
            tabela('wolff-perfil', F_WOLFF, 'Wolff perfil.xlsx', 'PVC', false, 'PERFIL'),
            tabela('wolff-ref-1', F_WOLFF, 'Reforço 2026.xlsx', 'PVC', false, 'REFORCO'),
            tabela('wolff-ref-2', F_WOLFF, 'Reforço 2027.xlsx', 'PVC', false, 'REFORCO'),
        )
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.paresSemVigente).toEqual([{ fornecedor: 'Wolff Perfis', familia: 'PVC', categoria: 'REFORCO', arquivos: ['Reforço 2026.xlsx', 'Reforço 2027.xlsx'] }])
        expect(d.tabelas.filter((t) => t.categoria === 'REFORCO').map((t) => t.vale)).toEqual([false, false])
        expect(d.tabelas.find((t) => t.tabelaId === 'wolff-perfil')!.vale).toBe(true)
    })

    it('duas de REFORCO, uma vigente: só a vigente vale, e o grupo não é par sem vigente', async () => {
        estado.db.orcamentista_tabela.push(tabela('wolff-ref-1', F_WOLFF, 'Reforço 2026.xlsx', 'PVC', false, 'REFORCO'), tabela('wolff-ref-2', F_WOLFF, 'Reforço 2027.xlsx', 'PVC', true, 'REFORCO'))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.filter((t) => t.categoria === 'REFORCO').map((t) => [t.arquivo_nome, t.vale])).toEqual([['Reforço 2026.xlsx', false], ['Reforço 2027.xlsx', true]])
        expect(d.paresSemVigente).toEqual([])
    })

    it('a categoria e a chave da família saem como a tabela as grava; a que não informa sai nula, nunca "PERFIL" nem "PVC" por palpite', async () => {
        const d = await D().derivarTabelasDaConta(PAULA)
        const estrela = d.tabelas.find((t) => t.tabelaId === T_ESTRELA)!
        expect([estrela.categoria, estrela.familiaChave, estrela.familia]).toEqual([null, null, null])
    })

    it('o mesmo fornecedor com famílias DIFERENTES: as duas valem, sem marca nenhuma', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_ALU, F_WOLFF, 'Wolff alumínio.xlsx', 'ALUMINIO'))
        const d = await D().derivarTabelasDaConta(PAULA)
        expect(d.tabelas.filter((t) => t.fornecedorId === F_WOLFF).map((t) => [t.familia, t.vale])).toEqual([['Alumínio', true], ['PVC', true]])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
/**
 * (2) MUDOU no PR D (dono do produto, 02/11/2026): a conversa NÃO decide mais "tabela com motor entra; sem motor é preço". O motor
 * vem da FAMÍLIA da conta (a base de conhecimento → as etapas → o motor, por motor_id), e TODA tabela da derivação que é da família
 * (ou de "qualquer linha", família nula) é PREÇO — de qualquer categoria. A vigente decide como antes, agora em todas elas.
 */
describe('(2) a conversa: o motor vem da família; as tabelas da família são o preço', () => {
    const lida = async () => {
        const t = await C().lerFamiliasDaEmpresa(PAULA)
        if ('frase' in t) throw new Error('era para ler: ' + t.frase)
        return t
    }
    const precos = async () => (await lida()).familias[0].tabelasDePreco

    it('De Paula: a lista é a do MOTOR da família (por motor_id), e o preço é a Wolff (PVC) e a Estrela (qualquer linha) — a lista parada por tabela_id não entra', async () => {
        const t = await lida()
        expect(t.familias.map((f) => [f.familia, f.levantamento.id, f.calculo.id])).toEqual([['PVC', M_WOLFF, M_WOLFF]])
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
        expect(await precos()).toEqual([T_ESTRELA, T_WOLFF].sort())
        naoTocouAContaTabela()
    })

    it('a tabela de OUTRA família (a Sul, de alumínio) não dá preço, mesmo vinculada', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor.push(vinculo(PAULA, 'c-perfil', F_SUL))
        expect(await precos()).toEqual([T_ESTRELA, T_WOLFF].sort())
    })

    it('fornecedor de OUTRA categoria sem tabela não recusa: a conversa segue', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor.push(vinculo(PAULA, 'c-ferragem', F_FERRAGEM))
        expect(await precos()).toEqual([T_ESTRELA, T_WOLFF].sort())
    })

    it('fornecedor do PERFIL sem tabela: recusa NOMEADA, dizendo qual', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor.push(vinculo(PAULA, 'c-perfil', F_FERRAGEM))
        const t = await C().lerFamiliasDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['PERFIL_SEM_TABELA', C().fraseDoPerfilSemTabela('Ferragens Ômega')])
        expect(C().fraseDoPerfilSemTabela('Ferragens Ômega')).toContain('Ferragens Ômega')
    })

    it('a base de conhecimento não vincula fornecedor nenhum: a família fica sem tabela vigente — a linha parada de conta_tabela não a salva', async () => {
        estado.db.orcamentista_mp_categoria_fornecedor = estado.db.orcamentista_mp_categoria_fornecedor.filter((v) => v.tenant_id !== PAULA)
        const t = await C().lerFamiliasDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['SEM_TABELA_VIGENTE', 'Falta de configuração — a família PVC não tem nenhuma tabela de preço vigente: verifique o catálogo em Catálogo › Fornecedores.'])
        naoTocouAContaTabela()
    })

    it('duas tabelas da Wolff em PVC, nenhuma vigente: recusa nomeada — não escolho entre elas', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_2027, F_WOLFF, 'Wolff 2027.xlsx', 'PVC'))
        const t = await C().lerFamiliasDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['SEM_VIGENTE', C().fraseSemVigente('Wolff Perfis', 'PVC', 2)])
    })

    it('o contraste: com a de 2027 vigente, o preço é SÓ a de 2027 (e a Estrela)', async () => {
        estado.db.orcamentista_tabela.push(tabela(T_WOLFF_2027, F_WOLFF, 'Wolff 2027.xlsx', 'PVC', true))
        expect(await precos()).toEqual([T_ESTRELA, T_WOLFF_2027].sort())
    })

    it('Reforço e Acessórios da Wolff: entram como PREÇO, ao lado da Perfil — todas as categorias, e a lista continua a do motor', async () => {
        estado.db.orcamentista_tabela.push(
            tabela('wolff-reforco', F_WOLFF, 'Wolff reforço.xlsx', 'PVC', false, 'REFORCO'),
            tabela('wolff-acess', F_WOLFF, 'Wolff acessórios.xlsx', 'PVC', false, 'ACESSORIOS_VEDACAO'),
        )
        expect(await precos()).toEqual([T_ESTRELA, T_WOLFF, 'wolff-acess', 'wolff-reforco'].sort())
        expect((await lida()).candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
    })

    it('uma tabela com tipologias gravadas por tabela_id NÃO muda a lista: quem decide a lista é o motor da família', async () => {
        estado.db.orcamentista_tabela.push(tabela('wolff-perfil', F_WOLFF, 'Wolff perfil.xlsx', 'PVC', false, 'PERFIL'))
        estado.db.orcamentista_motor_tipologia_detalhe.push(...tipologias('wolff-perfil', 'WP-01'))
        const t = await lida()
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
        expect(t.familias[0].tabelasDePreco).toContain('wolff-perfil')
    })

    it('duas de REFORCO no mesmo grupo e nenhuma vigente: agora RECUSA (são preço da família) — a regra da vigente vale em todas', async () => {
        estado.db.orcamentista_tabela.push(tabela('r1', F_WOLFF, 'Reforço 1.xlsx', 'PVC', false, 'REFORCO'), tabela('r2', F_WOLFF, 'Reforço 2.xlsx', 'PVC', false, 'REFORCO'))
        const t = await C().lerFamiliasDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['SEM_VIGENTE', C().fraseSemVigente('Wolff Perfis', 'PVC', 2)])
    })

    it('duas da Estrela ("qualquer linha") no mesmo grupo, sem vigente: recusa nomeada, com a família não informada', async () => {
        estado.db.orcamentista_tabela.push(tabela('estrela-2027', F_ESTRELA, 'Estrela 2027.xlsx', null))
        const t = await C().lerFamiliasDaEmpresa(PAULA)
        expect(t.ok === false && [t.motivo, t.frase]).toEqual(['SEM_VIGENTE', C().fraseSemVigente('Vidros Estrela', null, 2)])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(3) a rota da tabela não apaga mais (01/11/2026): remover é o arrasto do catálogo', () => {
    async function excluir(id: string) {
        let status = 0
        let json: any = null
        const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
        await rotaDaTabela()({ cookies: { token: 't' }, method: 'DELETE', query: { id }, body: undefined } as unknown as NextApiRequest, res as unknown as NextApiResponse)
        return { status, json }
    }

    it.each([['a tabela que a De Paula usa', () => T_WOLFF], ['a tabela que ninguém usa', () => T_SOLTA]])('%s: DELETE → 405, e nada sai do banco nem do armazenamento', async (_, id) => {
        estado.db.orcamentista_fornecedor.push({ id: 'f-solto', nome: 'Solto', nicho_id: 'n-esq' })
        estado.db.orcamentista_tabela.push(tabela(T_SOLTA, 'f-solto', 'Solta.xlsx', null))
        const r = await excluir(id())
        expect(r.status).toBe(405)
        expect(estado.apagadas).toEqual([])
        expect(estado.removidosDoStorage).toEqual([])
        expect(estado.db.orcamentista_tabela.map((t) => t.id)).toEqual(expect.arrayContaining([T_WOLFF, T_SOLTA]))
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(4) quem usa: pelo vínculo da base de conhecimento, não por conta_tabela', () => {
    it('a Wolff é usada pela De Paula, a Sul pela Norte — a linha parada (De Paula → Sul) não conta', async () => {
        expect((await R().obterFornecedor(F_WOLFF))?.contas_usando).toEqual(['Esquadrias De Paula'])
        expect((await R().obterFornecedor(F_SUL))?.contas_usando).toEqual(['Esquadrias Norte'])
        naoTocouAContaTabela()
    })

    // (o "fornecedor vinculado sem tabela segura a exclusão" saiu em 31/10/2026: remover o fornecedor é arrasto declarado, e o vínculo de conta
    // aparece no arrasto — `atendimentos-ia-remocao.test.ts`)
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
