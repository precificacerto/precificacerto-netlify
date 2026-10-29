/**
 * PORTÕES do bloco 2B.2 — as ROTAS do catálogo do Atendimentos I.A.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * O REPOSITÓRIO é falso (`@/lib/atendimentos-ia/repositorio`): as consultas ao PostgREST e ao
 * Storage não rodam aqui. O que o banco recusa sozinho — tabela em uso (23503), motor nulo
 * (NOT NULL), nicho de outro modelo — está provado no harness da `20261019000001`
 * (`scripts/harness/atendimentos-ia-2b1/`, num Postgres real). O que ESTE portão prova é o que
 * as ROTAS decidem: quem passa, o que é recusado antes do banco, e o que se diz quando o banco
 * recusa. A checagem de super admin é a REAL (`requireSuperAdmin`); falso é o cliente por baixo.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo (o admin não tem os tipos destas tabelas) */
import type { NextApiRequest, NextApiResponse } from 'next'
import { MENSAGEM_FAMILIA_OBRIGATORIA, MENSAGEM_MOTOR_INCOMPLETO, MENSAGEM_MOTOR_NAO_SAI } from '@/utils/atendimentos-ia-catalogo'

interface Perfil { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
interface Resposta<T> { data: T; error: { message: string } | null }
const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN_DA_A: Perfil = { id: 'u-admin-a', tenant_id: 't-a', role: 'admin', is_super_admin: false }
let perfil: Perfil | null = SUPER

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<Resposta<{ user: { id: string } | null }>> =>
                (perfil ? { data: { user: { id: perfil.id } }, error: null } : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: () => {
            const q: any = { select: () => q, eq: () => q, single: async (): Promise<Resposta<Perfil | null>> => ({ data: perfil, error: null }) }
            return q
        },
    },
}))

/** A ordem em que o repositório foi chamado — é com ela que se afirma "a linha antes do Storage". */
const ordem: string[] = []
jest.mock('@/lib/atendimentos-ia/repositorio', () => {
    const real = jest.requireActual('@/lib/atendimentos-ia/repositorio')
    const fn = (nome: string, impl: (...a: any[]) => any) => jest.fn(async (...a: any[]) => { ordem.push(nome); return impl(...a) })
    return {
        ErroDoBanco: real.ErroDoBanco,
        codigoDoErro: real.codigoDoErro,
        falhaInterna: real.falhaInterna,
        listarNichos: fn('listarNichos', () => []),
        criarNicho: fn('criarNicho', (n: any) => ({ id: 'n1', ativo: true, ...n })),
        excluirNicho: fn('excluirNicho', () => 1),
        quemSeguraONicho: fn('quemSeguraONicho', () => ({ fornecedores: [], contas: [] })),
        listarFornecedores: fn('listarFornecedores', () => []),
        obterFornecedor: fn('obterFornecedor', () => null),
        criarFornecedor: fn('criarFornecedor', () => ({ id: F })),
        atualizarFornecedor: fn('atualizarFornecedor', () => 1),
        excluirFornecedor: fn('excluirFornecedor', () => 1),
        quemSeguraOFornecedor: fn('quemSeguraOFornecedor', () => ({ tabelas: [], contas: [] })),
        fornecedorExiste: fn('fornecedorExiste', () => true),
        obterTabela: fn('obterTabela', () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: `${F}/motor/x-m.xlsx`, familia: 'PVC' })),
        criarTabela: fn('criarTabela', () => ({ id: T })),
        listarFamilias: fn('listarFamilias', () => [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }]),
        listarCategorias: fn('listarCategorias', () => [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'REFORCO', rotulo: 'Reforço', ordem: 2 }, { chave: 'ACESSORIOS_VEDACAO', rotulo: 'Acessórios', ordem: 3 }, { chave: 'VIDRO', rotulo: 'Vidro', ordem: 6 }]),
        atualizarTabela: fn('atualizarTabela', () => 1),
        categoriasDoFornecedorDosItensGravados: fn('categoriasDoFornecedorDosItensGravados', () => []),
        // a tabela destes casos ainda não tem itens importados: o arquivo dela se troca (a recusa da importada está em atendimentos-ia-categoria-da-tabela)
        contarItensDaTabela: fn('contarItensDaTabela', () => 0),
        caminhosDeTabela: fn('caminhosDeTabela', () => new Set<string>()),
        excluirTabela: fn('excluirTabela', () => 1),
        contasQueUsamATabela: fn('contasQueUsamATabela', () => []),
        assinarEnvio: fn('assinarEnvio', (p: string) => ({ path: p, signedUrl: `https://x/upload/sign/${p}?token=t` })),
        objetoExiste: fn('objetoExiste', () => true),
        removerObjetos: fn('removerObjetos', () => ({ erro: null })),
        caminhosDaPlanilha: fn('caminhosDaPlanilha', () => new Set<string>()),
    }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ErroDoBanco } = jest.requireActual('@/lib/atendimentos-ia/repositorio') as { ErroDoBanco: new (e: { message?: string; code?: string }) => Error }

const F = '11111111-1111-1111-1111-111111111111'
const T = '22222222-2222-2222-2222-222222222222'
const N = '33333333-3333-3333-3333-333333333333'

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-disable @typescript-eslint/no-require-imports */
const ROTAS: Record<string, Rota> = {
    nichos: require('@/pages/api/super-admin/atendimentos-ia/nichos/index').default,
    nicho: require('@/pages/api/super-admin/atendimentos-ia/nichos/[id]').default,
    fornecedores: require('@/pages/api/super-admin/atendimentos-ia/fornecedores/index').default,
    fornecedor: require('@/pages/api/super-admin/atendimentos-ia/fornecedores/[id]').default,
    urlDeEnvio: require('@/pages/api/super-admin/atendimentos-ia/tabelas/url-de-envio').default,
    tabelas: require('@/pages/api/super-admin/atendimentos-ia/tabelas/index').default,
    tabela: require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]').default,
}
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(rota: keyof typeof ROTAS, method: string, query: object = {}, body?: unknown) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res } }
    await ROTAS[rota]({ cookies: { token: 't' }, method, query, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(() => {
    perfil = SUPER
    ordem.length = 0
    Object.values(repo).forEach((f) => { if (typeof f?.mockClear === 'function') f.mockClear() })
})

const chamadasAoRepositorio = () => ordem.length

// Cada rota nova, cada método — UMA POR UMA, com um corpo VÁLIDO: a recusa tem de vir da
// autorização, e não de um corpo ruim que o super admin também receberia.
const CORPO_DA_TABELA = { fornecedor_id: F, arquivo_path: `${F}/arquivo/a-t.xlsx`, arquivo_nome: 't.xlsx', motor_path: `${F}/motor/a-m.xlsx`, motor_nome: 'm.xlsx', vigencia: 'desde 01/10/2026', familia: 'PVC', categoria_chave: 'PERFIL' }
const CADA_ROTA: [keyof typeof ROTAS, string, object, unknown][] = [
    ['nichos', 'GET', {}, undefined],
    ['nichos', 'POST', {}, { modelo: 'FABRICACAO', nome: 'Esquadrias' }],
    ['nicho', 'DELETE', { id: N }, undefined],
    ['fornecedores', 'GET', {}, undefined],
    ['fornecedores', 'POST', {}, { nome: 'Alumínio Sul', nicho_id: N }],
    ['fornecedor', 'GET', { id: F }, undefined],
    ['fornecedor', 'PATCH', { id: F }, { nome: 'Alumínio Sul', nicho_id: N }],
    ['fornecedor', 'DELETE', { id: F }, undefined],
    ['urlDeEnvio', 'POST', {}, { fornecedor_id: F, tipo: 'motor', nome: 'motor.xlsx' }],
    ['tabelas', 'POST', {}, CORPO_DA_TABELA],
    ['tabela', 'PATCH', { id: T }, { vigencia: '01/07 a 30/09/2026' }],
    ['tabela', 'DELETE', { id: T }, undefined],
]

describe('PORTÃO — um usuário NÃO super admin é recusado em cada rota nova', () => {
    it.each(CADA_ROTA)('%s %s → 403, e o repositório não é tocado', async (rota, metodo, query, body) => {
        perfil = ADMIN_DA_A
        const r = await chamar(rota, metodo, query, body)
        expect(r.status).toBe(403)
        expect(chamadasAoRepositorio()).toBe(0)
    })

    it.each(CADA_ROTA)('%s %s → 401 sem sessão', async (rota, metodo, query, body) => {
        perfil = null
        const r = await chamar(rota, metodo, query, body)
        expect(r.status).toBe(401)
        expect(chamadasAoRepositorio()).toBe(0)
    })

    // O CONTRASTE: o super admin, com o MESMO pedido, passa. Sem isto, uma rota que recusasse
    // todo mundo passaria os dois casos acima.
    it.each(CADA_ROTA)('%s %s → o super admin passa', async (rota, metodo, query, body) => {
        const r = await chamar(rota, metodo, query, body)
        expect([200, 201, 404]).toContain(r.status)
        expect(chamadasAoRepositorio()).toBeGreaterThan(0)
    })
})

describe('PORTÃO — o arquivo do motor é OPCIONAL em toda categoria, e a metade é recusada pela ROTA (27/10/2026, à noite)', () => {
    it.each(['PERFIL', 'REFORCO', 'ACESSORIOS_VEDACAO', 'VIDRO'])('%s, sem motor (ausente ou em branco) → 201: grava com motor nulo, e nada do motor vai ao bucket', async (categoria_chave) => {
        for (const corpo of [{ motor_path: undefined, motor_nome: undefined }, { motor_path: '   ', motor_nome: '   ' }]) {
            repo.criarTabela.mockClear(); repo.objetoExiste.mockClear()
            const r = await chamar('tabelas', 'POST', {}, { ...CORPO_DA_TABELA, categoria_chave, ...corpo })
            expect(r.status).toBe(201)
            expect(repo.criarTabela).toHaveBeenCalledWith(expect.objectContaining({ categoria_chave, motor_path: null, motor_nome: null }))
            expect(repo.objetoExiste.mock.calls.map((c) => c[0])).toEqual([CORPO_DA_TABELA.arquivo_path])
        }
    })

    it.each([
        ['sem motor_path', { ...CORPO_DA_TABELA, motor_path: undefined }],
        ['sem motor_nome', { ...CORPO_DA_TABELA, motor_nome: undefined }],
    ])('motor pela metade (%s) → 400 com a frase da metade, em qualquer categoria', async (_c, corpo) => {
        for (const categoria_chave of ['PERFIL', 'REFORCO']) {
            const r = await chamar('tabelas', 'POST', {}, { ...corpo, categoria_chave })
            expect(r.status).toBe(400)
            expect(r.json.error).toBe(MENSAGEM_MOTOR_INCOMPLETO)
        }
        expect(repo.criarTabela).not.toHaveBeenCalled()
    })

    it('a trava do banco (23514, orcamentista_tabela_motor_par) sobe como 400 com a frase da metade, e não como 500', async () => {
        repo.criarTabela.mockImplementationOnce(async () => { throw new ErroDoBanco({ code: '23514', message: 'new row violates check constraint "orcamentista_tabela_motor_par"' }) })
        const r = await chamar('tabelas', 'POST', {}, CORPO_DA_TABELA)
        expect(r.status).toBe(400)
        expect(r.json.error).toBe(MENSAGEM_MOTOR_INCOMPLETO)
    })

    it('com o motor, grava — e grava o motor', async () => {
        const r = await chamar('tabelas', 'POST', {}, CORPO_DA_TABELA)
        expect(r.status).toBe(201)
        expect(repo.criarTabela).toHaveBeenCalledWith(expect.objectContaining({ motor_path: CORPO_DA_TABELA.motor_path, motor_nome: 'm.xlsx', criado_por: SUPER.id }))
    })

    it('motor que não chegou ao bucket → 400, e nada é gravado', async () => {
        repo.objetoExiste.mockImplementation(async (p: string) => { ordem.push('objetoExiste'); return p !== CORPO_DA_TABELA.motor_path })
        const r = await chamar('tabelas', 'POST', {}, CORPO_DA_TABELA)
        expect(r.status).toBe(400)
        expect(r.json.error).toMatch(/motor não chegou/)
        expect(repo.criarTabela).not.toHaveBeenCalled()
        repo.objetoExiste.mockImplementation(async () => { ordem.push('objetoExiste'); return true })
    })

    it('na EDIÇÃO, apagar o motor é recusado', async () => {
        const r = await chamar('tabela', 'PATCH', { id: T }, { motor_path: '', motor_nome: '' })
        expect(r.status).toBe(400)
        expect(r.json.error).toBe(MENSAGEM_MOTOR_NAO_SAI)
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
    })

    it('arquivo fora da pasta do fornecedor → 400', async () => {
        const r = await chamar('tabelas', 'POST', {}, { ...CORPO_DA_TABELA, motor_path: 'outro-fornecedor/motor/m.xlsx' })
        expect(r.status).toBe(400)
        expect(repo.criarTabela).not.toHaveBeenCalled()
    })
})

describe('PORTÃO — excluir o que está em uso devolve QUEM usa', () => {
    const emUso = () => { throw new ErroDoBanco({ code: '23503', message: 'violates foreign key constraint' }) }

    // Desde 26/10/2026 o uso é DERIVADO e a ROTA o confere ANTES de apagar (o RESTRICT de conta_tabela não
    // protege mais): a exclusão nem é tentada. A prova com o banco falso inteiro está em atendimentos-ia-tabelas-derivadas.
    it('tabela em uso → 409 com os NOMES das contas, ANTES de apagar: nem a linha nem o Storage são tocados', async () => {
        repo.contasQueUsamATabela.mockImplementationOnce(async () => { ordem.push('contasQueUsamATabela'); return ['Marcenaria Silva', 'Esquadrias Norte'] })
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(409)
        expect(r.json.error).toContain('Esquadrias Norte')
        expect(r.json.error).toContain('Marcenaria Silva')
        expect(r.json.contas).toEqual(['Marcenaria Silva', 'Esquadrias Norte'])
        expect(repo.excluirTabela).not.toHaveBeenCalled()
        expect(repo.removerObjetos).not.toHaveBeenCalled()
    })

    it('ninguém usa, mas o BANCO recusa (23503, a FK da linha parada de conta_tabela) → 409, e o Storage não é tocado', async () => {
        repo.excluirTabela.mockImplementationOnce(async () => { ordem.push('excluirTabela'); return emUso() })
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(409)
        expect(ordem.indexOf('contasQueUsamATabela')).toBeLessThan(ordem.indexOf('excluirTabela'))
        expect(repo.removerObjetos).not.toHaveBeenCalled()
    })

    it('fornecedor com tabela → 409 com as tabelas e as contas', async () => {
        repo.excluirFornecedor.mockImplementationOnce(async () => { ordem.push('excluirFornecedor'); return emUso() })
        repo.quemSeguraOFornecedor.mockImplementationOnce(async () => { ordem.push('quem'); return { tabelas: ['perfis-out.xlsx'], contas: ['Marcenaria Silva'] } })
        const r = await chamar('fornecedor', 'DELETE', { id: F })
        expect(r.status).toBe(409)
        expect(r.json.error).toContain('perfis-out.xlsx')
        expect(r.json.error).toContain('Marcenaria Silva')
    })

    it('nicho em uso → 409 com os fornecedores e as contas', async () => {
        repo.excluirNicho.mockImplementationOnce(async () => { ordem.push('excluirNicho'); return emUso() })
        repo.quemSeguraONicho.mockImplementationOnce(async () => { ordem.push('quem'); return { fornecedores: ['Alumínio Sul'], contas: ['Esquadrias Norte'] } })
        const r = await chamar('nicho', 'DELETE', { id: N })
        expect(r.status).toBe(409)
        expect(r.json.error).toContain('Alumínio Sul')
        expect(r.json.error).toContain('Esquadrias Norte')
    })

    it('outro erro do banco NÃO vira "em uso": 500, sem lista', async () => {
        repo.excluirTabela.mockImplementationOnce(async () => { ordem.push('excluirTabela'); throw new ErroDoBanco({ code: '57014', message: 'timeout' }) })
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(500)
        expect(r.json.contas).toBeUndefined()
        expect(repo.removerObjetos).not.toHaveBeenCalled()
    })
})

describe('PORTÃO — apagar tabela: a LINHA primeiro, depois o Storage', () => {
    it('a linha sai antes dos objetos, e os DOIS caminhos (arquivo e motor) são removidos', async () => {
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(200)
        expect(ordem.indexOf('excluirTabela')).toBeLessThan(ordem.indexOf('removerObjetos'))
        expect(repo.removerObjetos).toHaveBeenCalledWith([`${F}/arquivo/x-t.xlsx`, `${F}/motor/x-m.xlsx`])
        expect(r.json.aviso).toBeUndefined()
    })

    it('a tabela de preço puro (sem motor): só o caminho do arquivo é conferido e removido — nenhum nulo vai ao armazenamento', async () => {
        repo.obterTabela.mockImplementationOnce(async () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: null, categoria_chave: 'REFORCO' }))
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(200)
        expect(repo.caminhosDaPlanilha).toHaveBeenCalledWith([`${F}/arquivo/x-t.xlsx`])
        expect(repo.removerObjetos).toHaveBeenCalledWith([`${F}/arquivo/x-t.xlsx`])
    })

    it('a Estrela de produção (motor_path VAZIO, não nulo): o "" não vai ao armazenamento', async () => {
        repo.obterTabela.mockImplementationOnce(async () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: '', categoria_chave: null }))
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(200)
        expect(repo.caminhosDaPlanilha).toHaveBeenCalledWith([`${F}/arquivo/x-t.xlsx`])
        expect(repo.removerObjetos).toHaveBeenCalledWith([`${F}/arquivo/x-t.xlsx`])
    })

    it('Storage que falha deixa ÓRFÃO e AVISA — não é 500, e a exclusão vale', async () => {
        repo.removerObjetos.mockImplementationOnce(async () => { ordem.push('removerObjetos'); return { erro: 'storage fora' } })
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(200)
        expect(r.json.aviso).toContain(`${F}/motor/x-m.xlsx`)
    })

    it('na troca de arquivo, a linha nova é gravada antes de apagar o objeto antigo', async () => {
        const r = await chamar('tabela', 'PATCH', { id: T }, { motor_path: `${F}/motor/novo-m.xlsx`, motor_nome: 'novo.xlsx' })
        expect(r.status).toBe(200)
        expect(ordem.indexOf('atualizarTabela')).toBeLessThan(ordem.indexOf('removerObjetos'))
        expect(repo.removerObjetos).toHaveBeenCalledWith([`${F}/motor/x-m.xlsx`])
    })
})

describe('PORTÃO — dar o motor a uma tabela que não tinha: não há objeto antigo a remover', () => {
    it('PATCH com o motor numa tabela de motor nulo: grava, e nada é conferido nem removido do armazenamento', async () => {
        repo.obterTabela.mockImplementationOnce(async () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: null, categoria_chave: 'PERFIL', familia: 'PVC' }))
        const r = await chamar('tabela', 'PATCH', { id: T }, { motor_path: `${F}/motor/novo-m.xlsx`, motor_nome: 'novo.xlsx' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, expect.objectContaining({ motor_path: `${F}/motor/novo-m.xlsx`, motor_nome: 'novo.xlsx' }))
        expect(repo.caminhosDaPlanilha).toHaveBeenCalledWith([])
        expect(repo.removerObjetos).toHaveBeenCalledWith([])
    })
})

describe('PORTÃO — a Estrela de produção tem o motor VAZIO (""), e vazio não é arquivo', () => {
    it('declarar PERFIL nela, que não tem família, é RECUSADO (28/10/2026: o Perfil exige família); com a família junto, passa — o motor não é exigido', async () => {
        const estrela = async () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: '', categoria_chave: null as string | null, familia: null as string | null })
        repo.obterTabela.mockImplementationOnce(estrela)
        const recusa = await chamar('tabela', 'PATCH', { id: T }, { categoria_chave: 'PERFIL' })
        expect(recusa.status).toBe(400)
        expect(recusa.json).toEqual({ error: MENSAGEM_FAMILIA_OBRIGATORIA })
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
        repo.obterTabela.mockImplementationOnce(estrela)
        const r = await chamar('tabela', 'PATCH', { id: T }, { categoria_chave: 'PERFIL', familia: 'PVC' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, { categoria_chave: 'PERFIL', familia: 'PVC' })
    })

    it('declarar VIDRO nela passa, e o "" do motor antigo não vai ao armazenamento ao trocar o motor', async () => {
        repo.obterTabela.mockImplementationOnce(async () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: '', categoria_chave: null }))
        expect((await chamar('tabela', 'PATCH', { id: T }, { categoria_chave: 'VIDRO' })).status).toBe(200)
        repo.obterTabela.mockImplementationOnce(async () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: '', categoria_chave: null }))
        const r = await chamar('tabela', 'PATCH', { id: T }, { motor_path: `${F}/motor/n.xlsx`, motor_nome: 'n.xlsx' })
        expect(r.status).toBe(200)
        expect(repo.removerObjetos).toHaveBeenLastCalledWith([])
    })
})

describe('PORTÃO — o objeto que uma PLANILHA do motor também usa NÃO se remove (27/10/2026, PR C)', () => {
    // a migração 20261027000004 copiou o motor da Wolff para `orcamentista_motor`, apontando o MESMO objeto do bucket
    const MOTOR = `${F}/motor/x-m.xlsx`
    const ARQUIVO = `${F}/arquivo/x-t.xlsx`
    const planilhaUsa = (...caminhos: string[]) =>
        repo.caminhosDaPlanilha.mockImplementationOnce(async () => { ordem.push('caminhosDaPlanilha'); return new Set(caminhos) })

    it('excluir a tabela: o arquivo de PREÇO sai, o do MOTOR fica — e a resposta diz que ficou', async () => {
        planilhaUsa(MOTOR)
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(200)
        expect(repo.removerObjetos).toHaveBeenCalledWith([ARQUIVO])
        expect(repo.removerObjetos).not.toHaveBeenCalledWith(expect.arrayContaining([MOTOR]))
        expect(r.json.aviso).toBe(`Mantido no armazenamento, porque uma planilha do motor usa o mesmo arquivo: ${MOTOR}.`)
    })

    it('trocar o motor da tabela (PATCH): o objeto ANTIGO fica porque a planilha o usa', async () => {
        planilhaUsa(MOTOR)
        const r = await chamar('tabela', 'PATCH', { id: T }, { motor_path: `${F}/motor/novo-m.xlsx`, motor_nome: 'novo.xlsx' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalled()
        expect(repo.removerObjetos).not.toHaveBeenCalledWith(expect.arrayContaining([MOTOR]))
        expect(r.json.aviso).toContain(MOTOR)
    })

    it('trocar o arquivo de PREÇO continua apagando o antigo: a planilha não o usa', async () => {
        const r = await chamar('tabela', 'PATCH', { id: T }, { arquivo_path: `${F}/arquivo/novo-t.xlsx`, arquivo_nome: 'novo.xlsx' })
        expect(r.status).toBe(200)
        expect(repo.removerObjetos).toHaveBeenCalledWith([ARQUIVO])
        expect(r.json.aviso).toBeUndefined()
    })

    it('a conferência é feita DEPOIS de a linha sair, e a pergunta leva os dois caminhos', async () => {
        await chamar('tabela', 'DELETE', { id: T })
        expect(repo.caminhosDaPlanilha).toHaveBeenCalledWith([ARQUIVO, MOTOR])
        expect(ordem.indexOf('excluirTabela')).toBeLessThan(ordem.indexOf('caminhosDaPlanilha'))
        expect(ordem.indexOf('caminhosDaPlanilha')).toBeLessThan(ordem.indexOf('removerObjetos'))
    })

    it('a conferência FALHA: NADA é removido (órfão é desperdício; planilha sem arquivo é perda), e a exclusão vale', async () => {
        repo.caminhosDaPlanilha.mockImplementationOnce(async () => { ordem.push('caminhosDaPlanilha'); throw new ErroDoBanco({ code: '57014', message: 'timeout' }) })
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(200)
        expect(repo.excluirTabela).toHaveBeenCalled()
        expect(repo.removerObjetos).not.toHaveBeenCalled()
        expect(r.json.aviso).toBe(`Não foi possível conferir se uma planilha do motor usa estes arquivos; nada foi removido do armazenamento: ${ARQUIVO}, ${MOTOR}.`)
    })

    it('a conferência falha na TROCA do motor: o objeto antigo também fica', async () => {
        repo.caminhosDaPlanilha.mockImplementationOnce(async () => { throw new ErroDoBanco({ code: '57014', message: 'timeout' }) })
        const r = await chamar('tabela', 'PATCH', { id: T }, { motor_path: `${F}/motor/novo-m.xlsx`, motor_nome: 'novo.xlsx' })
        expect(r.status).toBe(200)
        expect(repo.removerObjetos).not.toHaveBeenCalled()
        expect(r.json.aviso).toContain('nada foi removido')
    })

    it('Storage que falha no que PODIA ser removido ainda avisa o órfão — junto com o que ficou', async () => {
        planilhaUsa(MOTOR)
        repo.removerObjetos.mockImplementationOnce(async () => { ordem.push('removerObjetos'); return { erro: 'storage fora' } })
        const r = await chamar('tabela', 'DELETE', { id: T })
        expect(r.status).toBe(200)
        expect(r.json.aviso).toContain(`ficaram sem uso: ${ARQUIVO}`)
        expect(r.json.aviso).toContain(`Mantido no armazenamento, porque uma planilha do motor usa o mesmo arquivo: ${MOTOR}`)
    })
})

describe('PORTÃO — o TRIM antes de gravar', () => {
    it('fornecedor: o nome chega ao repositório aparado', async () => {
        await chamar('fornecedores', 'POST', {}, { nome: '   Alumínio Sul  ', nicho_id: N })
        expect(repo.criarFornecedor).toHaveBeenCalledWith({ nome: 'Alumínio Sul', nicho_id: N, criado_por: SUPER.id })
    })
    it('fornecedor: editar também apara', async () => {
        await chamar('fornecedor', 'PATCH', { id: F }, { nome: '\tAlumínio Sul \n', nicho_id: N })
        expect(repo.atualizarFornecedor).toHaveBeenCalledWith(F, { nome: 'Alumínio Sul', nicho_id: N })
    })
    it('nicho: o nome chega aparado', async () => {
        await chamar('nichos', 'POST', {}, { modelo: 'REVENDA', nome: '  Loja de roupas ' })
        expect(repo.criarNicho).toHaveBeenCalledWith({ modelo: 'REVENDA', nome: 'Loja de roupas', criado_por: SUPER.id })
    })
    it('só espaço não é nome: 400, nada gravado', async () => {
        const r = await chamar('fornecedores', 'POST', {}, { nome: '    ', nicho_id: N })
        expect(r.status).toBe(400)
        expect(repo.criarFornecedor).not.toHaveBeenCalled()
    })
    it('nicho repetido no modelo (23505) → 409, não 500', async () => {
        repo.criarNicho.mockImplementationOnce(async () => { ordem.push('criarNicho'); throw new ErroDoBanco({ code: '23505', message: 'duplicate' }) })
        const r = await chamar('nichos', 'POST', {}, { modelo: 'FABRICACAO', nome: 'esquadrias' })
        expect(r.status).toBe(409)
    })
})

describe('A URL de envio — a rota escolhe o caminho', () => {
    it('o caminho começa pela pasta do fornecedor e pelo tipo', async () => {
        const r = await chamar('urlDeEnvio', 'POST', {}, { fornecedor_id: F, tipo: 'motor', nome: 'Motor Esquadrias Ç.xlsx' })
        expect(r.status).toBe(200)
        expect(r.json.path).toMatch(new RegExp(`^${F}/motor/[0-9a-f-]{36}-Motor-Esquadrias-C\\.xlsx$`))
    })
    it('formato fora da lista → 400, nada assinado', async () => {
        const r = await chamar('urlDeEnvio', 'POST', {}, { fornecedor_id: F, tipo: 'arquivo', nome: 'tabela.exe' })
        expect(r.status).toBe(400)
        expect(repo.assinarEnvio).not.toHaveBeenCalled()
    })
})
