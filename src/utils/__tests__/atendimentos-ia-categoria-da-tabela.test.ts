/**
 * @jest-environment node
 *
 * PORTÃO — a CATEGORIA da tabela do fornecedor: "uma tabela = uma categoria" (migração 20261027000005).
 *
 * POR QUÊ (dono do produto, 27/10/2026): "não pode haver margem para o agente usar, no levantamento e nas
 * fórmulas, o preço de uma ramificação que ninguém escolheu". As decisões, registradas como estão:
 *   - a categoria (a ramificação) é OBRIGATÓRIA ao subir uma tabela de fornecedor; tabela sem categoria é recusa;
 *   - a tabela de antes NÃO é recusada retroativamente nem alterada: a da Wolff (quatro categorias do fornecedor
 *     no arquivo) fica sem categoria, e a da Estrela (Vidro) ganha a dela pela tela, sem UPDATE de ninguém;
 *   - a categoria, uma vez dada, não se troca.
 *
 * O que este portão fica vermelho:
 *   (1) os leitores do corpo: a categoria é exigida no POST e lida no PATCH;
 *   (2) o POST: sem categoria ou fora da lista é recusado pela ROTA, antes do banco; a FK e a trava do banco
 *       viram frase própria, nunca "Fornecedor não encontrado";
 *   (3) o PATCH: a tabela de antes ganha UMA categoria; a que já tem não troca; a que tem itens de mais de uma
 *       categoria do fornecedor (a Wolff) NÃO pode declarar uma só, e as outras edições dela seguem livres;
 *   (4) a contagem das categorias do arquivo e a frase da recusa.
 *
 * O que NÃO alcança: o banco é falso. A FK, a trava de INSERT e a de UPDATE estão provadas num Postgres real
 * (`scripts/harness/categoria-da-tabela/`, com mutações), não aqui.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import type { NextApiRequest, NextApiResponse } from 'next'

import {
    MENSAGEM_CATEGORIA_OBRIGATORIA, ROTAS_DO_CATALOGO, ehChaveDeCategoria, fraseDaCategoriaDesconhecida, fraseDaCategoriaQueNaoSeTroca,
    lerCorpoDaTabela, lerEdicaoDaTabela, recusada,
} from '@/utils/atendimentos-ia-catalogo'
import {
    categoriasDoFornecedorNosItens, fraseDaTabelaComMaisDeUmaCategoria, fraseDoArquivoComMaisDeUmaCategoria, fraseDosItensSemCategoriaDoFornecedor,
} from '@/utils/atendimentos-ia-categoria-do-arquivo'

interface Perfil { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN: Perfil = { id: 'u-admin', tenant_id: 't-a', role: 'admin', is_super_admin: false }
let perfil: Perfil | null = SUPER

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: { getUser: async (): Promise<any> => (perfil ? { data: { user: { id: perfil.id } }, error: null } : { data: { user: null }, error: { message: 'sem sessão' } }) },
        from: () => { const q: any = { select: () => q, eq: () => q, single: async (): Promise<any> => ({ data: perfil, error: null }) }; return q },
    },
}))

const F = '11111111-1111-1111-1111-111111111111'
const T = '22222222-2222-2222-2222-222222222222'
const CATEGORIAS = [
    { chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 },
    { chave: 'REFORCO', rotulo: 'Reforço metálico', ordem: 3 },
    { chave: 'VIDRO', rotulo: 'Vidro', ordem: 6 },
]
const TABELA_SEM = { id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: `${F}/motor/x-m.xlsx`, categoria_chave: null as string | null, familia: 'PVC' as string | null }

jest.mock('@/lib/atendimentos-ia/repositorio', () => {
    const real = jest.requireActual('@/lib/atendimentos-ia/repositorio')
    return {
        ErroDoBanco: real.ErroDoBanco,
        codigoDoErro: real.codigoDoErro,
        falhaInterna: real.falhaInterna,
        listarFamilias: jest.fn(async () => [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }]),
        listarCategorias: jest.fn(async () => CATEGORIAS.map((c) => ({ ...c }))),
        criarTabela: jest.fn(async () => ({ id: T })),
        obterTabela: jest.fn(async () => ({ ...TABELA_SEM })),
        atualizarTabela: jest.fn(async () => 1),
        categoriasDoFornecedorDosItensGravados: jest.fn(async (): Promise<Array<string | null>> => []),
        objetoExiste: jest.fn(async () => true),
        removerObjetos: jest.fn(async (): Promise<{ erro: string | null }> => ({ erro: null })),
        caminhosDaPlanilha: jest.fn(async () => new Set<string>()),
    }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ErroDoBanco } = jest.requireActual('@/lib/atendimentos-ia/repositorio') as { ErroDoBanco: new (e: { message?: string; code?: string }) => Error }

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-disable @typescript-eslint/no-require-imports */
const ROTAS: Record<string, () => Rota> = {
    categorias: () => require('@/pages/api/super-admin/atendimentos-ia/categorias/index').default,
    tabelas: () => require('@/pages/api/super-admin/atendimentos-ia/tabelas/index').default,
    tabela: () => require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]').default,
}
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(rota: keyof typeof ROTAS, method: string, query: object = {}, body?: unknown) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
    await ROTAS[rota]()({ cookies: { token: 't' }, method, query, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(() => {
    perfil = SUPER
    Object.values(repo).forEach((f) => { if (typeof f?.mockClear === 'function') f.mockClear() })
    repo.obterTabela.mockImplementation(async () => ({ ...TABELA_SEM }))
    repo.categoriasDoFornecedorDosItensGravados.mockImplementation(async () => [])
    repo.atualizarTabela.mockImplementation(async () => 1)
})

const CORPO = { fornecedor_id: F, arquivo_path: `${F}/arquivo/a-t.xlsx`, arquivo_nome: 't.xlsx', motor_path: `${F}/motor/a-m.xlsx`, motor_nome: 'm.xlsx', vigencia: null as string | null, familia: 'PVC', categoria_chave: 'PERFIL' }

describe('(1) os leitores do corpo', () => {
    it('a tabela NOVA exige a categoria: ausente, vazia, minúscula ou não-texto é recusada com a frase', () => {
        for (const ruim of [undefined, '', '   ', 'perfil', 7, null, ['PERFIL'], 'PERFIL;DROP']) {
            const l = lerCorpoDaTabela({ ...CORPO, categoria_chave: ruim })
            expect(recusada(l) && l.erro).toBe(MENSAGEM_CATEGORIA_OBRIGATORIA)
        }
        const ok = lerCorpoDaTabela(CORPO)
        expect(recusada(ok) ? ok.erro : ok.corpo.categoria_chave).toBe('PERFIL')
    })

    it('a forma da chave é a do catálogo (MAIÚSCULA, dígito e "_"); a LISTA quem confere é a rota', () => {
        expect(ehChaveDeCategoria('ACESSORIOS_VEDACAO')).toBe(true)
        expect(ehChaveDeCategoria('Acessorios')).toBe(false)
        expect(ehChaveDeCategoria('1PERFIL')).toBe(false)
    })

    it('o PATCH lê a categoria como `categoria`; ausente não mexe; presente e inválida é recusada', () => {
        const dada = lerEdicaoDaTabela({ categoria_chave: 'VIDRO' }, F)
        expect(recusada(dada) ? dada.erro : dada.corpo).toEqual({ categoria: 'VIDRO' })
        const so = lerEdicaoDaTabela({ vigencia: 'x' }, F)
        expect(recusada(so) ? so.erro : so.corpo).toEqual({ vigencia: 'x' })
        const ruim = lerEdicaoDaTabela({ categoria_chave: null }, F)
        expect(recusada(ruim) && ruim.erro).toBe(MENSAGEM_CATEGORIA_OBRIGATORIA)
    })

    it('a rota das categorias está no catálogo das rotas', () => {
        expect(ROTAS_DO_CATALOGO.categorias).toBe('/api/super-admin/atendimentos-ia/categorias')
    })
})

describe('(2) POST /tabelas — a ROTA recusa antes do banco', () => {
    it('sem categoria → 400 com a frase, e nada é gravado', async () => {
        const { categoria_chave: _fora, ...sem } = CORPO
        void _fora
        expect(await chamar('tabelas', 'POST', {}, sem)).toEqual({ status: 400, json: { error: MENSAGEM_CATEGORIA_OBRIGATORIA } })
        expect(repo.criarTabela).not.toHaveBeenCalled()
    })

    it('categoria fora da lista → 400 nomeando-a, e nada é gravado', async () => {
        expect(await chamar('tabelas', 'POST', {}, { ...CORPO, categoria_chave: 'INVENTADA' })).toEqual({ status: 400, json: { error: fraseDaCategoriaDesconhecida('INVENTADA') } })
        expect(repo.criarTabela).not.toHaveBeenCalled()
    })

    it('categoria da lista → 201, e a categoria vai ao repositório', async () => {
        const r = await chamar('tabelas', 'POST', {}, { ...CORPO, categoria_chave: 'REFORCO' })
        expect(r.status).toBe(201)
        expect(repo.criarTabela).toHaveBeenCalledWith(expect.objectContaining({ categoria_chave: 'REFORCO', familia: 'PVC', criado_por: SUPER.id }))
    })

    it('a FK da categoria recusada pelo banco (corrida com a lista) NÃO vira "Fornecedor não encontrado"', async () => {
        repo.criarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23503', message: 'insert or update on table "orcamentista_tabela" violates foreign key constraint "orcamentista_tabela_categoria_fkey"' }))
        expect(await chamar('tabelas', 'POST', {}, CORPO)).toEqual({ status: 400, json: { error: fraseDaCategoriaDesconhecida('PERFIL') } })
        // o contraste: a FK do fornecedor continua sendo "fornecedor não encontrado"
        repo.criarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23503', message: 'violates foreign key constraint "orcamentista_tabela_fornecedor_id_fkey"' }))
        expect((await chamar('tabelas', 'POST', {}, CORPO)).json).toEqual({ error: 'Fornecedor não encontrado.' })
    })

    it('a trava de INSERT do banco (23514) vira a frase da categoria obrigatória — e o 23502 do motor segue sendo o do motor', async () => {
        repo.criarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23514', message: 'orcamentista_tabela_categoria_obrigatoria: a tabela nova precisa declarar a categoria (categoria_chave).' }))
        expect(await chamar('tabelas', 'POST', {}, CORPO)).toEqual({ status: 400, json: { error: MENSAGEM_CATEGORIA_OBRIGATORIA } })
        repo.criarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23502', message: 'null value in column "motor_path"' }))
        expect((await chamar('tabelas', 'POST', {}, CORPO)).json.error).not.toBe(MENSAGEM_CATEGORIA_OBRIGATORIA)
    })

    it('GET /categorias: só o super admin; a lista vem NA ORDEM', async () => {
        repo.listarCategorias.mockImplementationOnce(async () => [CATEGORIAS[2], CATEGORIAS[0], CATEGORIAS[1]])
        const r = await chamar('categorias', 'GET')
        expect(r.status).toBe(200)
        expect(r.json.map((c: any) => c.chave)).toEqual(['PERFIL', 'REFORCO', 'VIDRO'])
        perfil = ADMIN
        expect((await chamar('categorias', 'GET')).status).toBe(403)
        perfil = SUPER
        expect((await chamar('categorias', 'POST')).status).toBe(405)
    })
})

describe('(3) PATCH /tabelas/[id] — a tabela de antes ganha UMA categoria, e a que tem não troca', () => {
    const patch = (corpo: object) => chamar('tabela', 'PATCH', { id: T }, corpo)
    const WOLFF = ['Perfil PVC', 'Perfil PVC', 'Reforço', 'Acessórios', 'Acessórios', 'acessórios', null]

    it('a da Estrela (itens só de Vidro, sem categoria) ganha VIDRO — a gravação leva só a categoria', async () => {
        repo.categoriasDoFornecedorDosItensGravados.mockImplementation(async () => ['Vidro', 'Vidro', 'Vidro'])
        const r = await patch({ categoria_chave: 'VIDRO' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, { categoria_chave: 'VIDRO' })
    })

    it('a da Wolff (quatro categorias do fornecedor) NÃO pode declarar uma só: 409 nomeando as que achou, e nada é gravado', async () => {
        repo.categoriasDoFornecedorDosItensGravados.mockImplementation(async () => WOLFF)
        const r = await patch({ categoria_chave: 'PERFIL' })
        expect(r.status).toBe(409)
        expect(r.json.error).toBe(fraseDaTabelaComMaisDeUmaCategoria(categoriasDoFornecedorNosItens(WOLFF).categorias))
        expect(r.json.error).toContain('3 categorias do fornecedor')
        expect(r.json.error).toContain('Perfil PVC (2)')
        expect(r.json.error).toContain('Reforço (1)')
        expect(r.json.error).toContain('Acessórios (3)')
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
    })

    it('as OUTRAS edições da Wolff seguem livres: a vigência vai, e as categorias do fornecedor nem são lidas', async () => {
        repo.categoriasDoFornecedorDosItensGravados.mockImplementation(async () => WOLFF)
        const r = await patch({ vigencia: 'desde 01/11/2026' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, { vigencia: 'desde 01/11/2026' })
        expect(repo.categoriasDoFornecedorDosItensGravados).not.toHaveBeenCalled()
    })

    it('tabela ainda sem itens importados pode declarar a categoria', async () => {
        const r = await patch({ categoria_chave: 'REFORCO' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, { categoria_chave: 'REFORCO' })
    })

    it('a que JÁ tem categoria: outra → 409 com a frase, nada gravado; a MESMA → 200 sem escrever', async () => {
        repo.obterTabela.mockImplementation(async () => ({ ...TABELA_SEM, categoria_chave: 'PERFIL' }))
        const troca = await patch({ categoria_chave: 'VIDRO' })
        expect(troca).toEqual({ status: 409, json: { error: fraseDaCategoriaQueNaoSeTroca('PERFIL', 'VIDRO') } })
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
        const igual = await patch({ categoria_chave: 'PERFIL' })
        expect(igual.status).toBe(200)
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
        // a que já tem categoria nem relê os itens: a regra de "uma categoria só" é da importação
        expect(repo.categoriasDoFornecedorDosItensGravados).not.toHaveBeenCalled()
    })

    it('a MESMA categoria junto com outro campo grava só o outro campo (a categoria não é reescrita)', async () => {
        repo.obterTabela.mockImplementation(async () => ({ ...TABELA_SEM, categoria_chave: 'PERFIL' }))
        const r = await patch({ categoria_chave: 'PERFIL', vigencia: 'v' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, { vigencia: 'v' })
    })

    it('categoria fora da lista → 400 nomeando-a', async () => {
        expect(await patch({ categoria_chave: 'INVENTADA' })).toEqual({ status: 400, json: { error: fraseDaCategoriaDesconhecida('INVENTADA') } })
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
    })

    it('a trava de UPDATE do banco (corrida: a outra gravação deu a categoria no meio) → 409 com a frase da categoria que ficou', async () => {
        repo.atualizarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23514', message: 'orcamentista_tabela_categoria_nao_se_troca: a categoria da tabela e PERFIL e nao se troca nem se apaga; suba outra tabela.' }))
        repo.obterTabela
            .mockImplementationOnce(async () => ({ ...TABELA_SEM }))
            .mockImplementationOnce(async () => ({ ...TABELA_SEM, categoria_chave: 'PERFIL' }))
        const r = await patch({ categoria_chave: 'VIDRO' })
        expect(r).toEqual({ status: 409, json: { error: fraseDaCategoriaQueNaoSeTroca('PERFIL', 'VIDRO') } })
    })

    it('a FK da categoria recusada pelo banco → 400 com a frase da categoria', async () => {
        repo.atualizarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23503', message: 'violates foreign key constraint "orcamentista_tabela_categoria_fkey"' }))
        expect(await patch({ categoria_chave: 'VIDRO' })).toEqual({ status: 400, json: { error: fraseDaCategoriaDesconhecida('VIDRO') } })
    })

    it('só o super admin', async () => {
        perfil = ADMIN
        expect((await patch({ categoria_chave: 'VIDRO' })).status).toBe(403)
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
    })
})

describe('(4) a contagem das categorias do arquivo e a frase da recusa', () => {
    it('conta por categoria, na ordem em que aparecem, e o branco à parte', () => {
        expect(categoriasDoFornecedorNosItens(['Perfil PVC', 'Reforço', 'Perfil PVC', null, '', '   ', undefined])).toEqual({
            categorias: [{ nome: 'Perfil PVC', itens: 2 }, { nome: 'Reforço', itens: 1 }],
            semCategoria: 4,
        })
    })

    it('duas grafias da mesma categoria são UMA; o nome mostrado é a primeira grafia', () => {
        expect(categoriasDoFornecedorNosItens(['Acessórios', 'acessórios', ' ACESSÓRIOS  ', 'Acessórios'])).toEqual({
            categorias: [{ nome: 'Acessórios', itens: 4 }], semCategoria: 0,
        })
    })

    it('espaço no meio conta como um: "Perfil  PVC" e "Perfil PVC" são a mesma', () => {
        expect(categoriasDoFornecedorNosItens(['Perfil  PVC', 'Perfil PVC']).categorias).toEqual([{ nome: 'Perfil  PVC'.replace(/\s+/g, ' '), itens: 2 }])
    })

    it('categorias DIFERENTES não se fundem pelo parecido: "Reforço" e "Reforco" são duas (o acento conta)', () => {
        expect(categoriasDoFornecedorNosItens(['Reforço', 'Reforco']).categorias).toHaveLength(2)
    })

    it('o medido na Wolff em 27/10/2026: Perfil PVC 534, Reforço 112, Acessórios 87 + "acessórios" 1, sem categoria 1', () => {
        const valores = [...Array(534).fill('Perfil PVC'), ...Array(112).fill('Reforço'), ...Array(87).fill('Acessórios'), 'acessórios', null]
        expect(categoriasDoFornecedorNosItens(valores)).toEqual({
            categorias: [{ nome: 'Perfil PVC', itens: 534 }, { nome: 'Reforço', itens: 112 }, { nome: 'Acessórios', itens: 88 }],
            semCategoria: 1,
        })
    })

    it('a frase da recusa nomeia o arquivo, TODAS as categorias com a contagem, diz o que fazer e que nada foi alterado', () => {
        const f = fraseDoArquivoComMaisDeUmaCategoria('Tabela.xlsm', [{ nome: 'A', itens: 1 }, { nome: 'B', itens: 22 }])
        expect(f).toContain('Arquivo "Tabela.xlsm"')
        expect(f).toContain('2 categorias do fornecedor: A (1), B (22)')
        expect(f).toContain('separe o arquivo em um por categoria')
        expect(f).toContain('Nada foi alterado.')
    })

    it('a frase dos itens sem categoria concorda no singular e no plural', () => {
        expect(fraseDosItensSemCategoriaDoFornecedor(1)).toContain('1 item do arquivo não traz')
        expect(fraseDosItensSemCategoriaDoFornecedor(3)).toContain('3 itens do arquivo não trazem')
    })
})
