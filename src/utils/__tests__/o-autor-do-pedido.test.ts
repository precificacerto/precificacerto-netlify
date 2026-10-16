/**
 * PORTÃO — o autor do pedido não chega nulo.
 *
 * `orcamentos/index.tsx:2188` gravava `created_by: currentUser?.uid || null`, SEM fallback e
 * SEM guarda. Com `orders_tenant_insert` removida (migração `20261016000002`), o `with_check`
 * que sobra exige `created_by = auth.uid()`, e `NULL = uid` não é `true`: o INSERT passaria a
 * ser RECUSADO sempre que `currentUser` não estivesse hidratado.
 *
 * O QUE ESTE PORTÃO CONSEGUE AFIRMAR, E O QUE NÃO
 * ------------------------------------------------
 * `orcamentos/index.tsx` NÃO MONTA em jsdom — a geração de PDF morre em
 * `HTMLCanvasElement.getContext`, medido na etapa 4b.6. O handler não é exportado. Então o
 * caminho exato não é executável aqui, e dizer o contrário seria o verde decorativo que
 * `teste-que-nao-exercita.md` descreve.
 *
 * O que SE afirma, e cada um morde uma mutação diferente:
 *   1. `getCurrentUserId()` — a função REAL, importada e exercitada contra a sessão. É ela o
 *      fallback, e é este caso que fica vermelho se o fallback parar de resolver.
 *   2. As DUAS chamadas do mesmo arquivo são IDÊNTICAS linha a linha. Não é transcrição: é
 *      igualdade entre dois pontos do arquivo real, que é exatamente o que o dono do produto
 *      pediu ao dizer "use o que está lá, literalmente".
 *   3. O insert de `orders` carrega `created_by: createdBy`, e `|| null` não voltou.
 */

import fs from 'fs'
import path from 'path'

const getSessionMock = jest.fn()
jest.mock('@/supabase/client', () => ({
    supabase: { auth: { getSession: (...a: unknown[]) => getSessionMock(...a) } },
}))

import { getCurrentUserId } from '@/utils/get-tenant-id'

const ARQUIVO = path.join(process.cwd(), 'src/pages/orcamentos/index.tsx')
const fonte = fs.readFileSync(ARQUIVO, 'utf-8')
const semComentarios = fonte.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

// ════════════════════════════════════════════════════════════════════════════════════════
describe('1 — o FALLBACK resolve de verdade', () => {
    beforeEach(() => getSessionMock.mockReset())

    // MUTAÇÃO: fazer o fallback devolver `null` também. Este caso fica VERMELHO, e é o que
    // impede o portão de afirmar só o caminho felizudo.
    it('com sessão válida, `getCurrentUserId()` devolve o uid da sessão', async () => {
        getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'uid-da-sessao' } } } })
        await expect(getCurrentUserId()).resolves.toBe('uid-da-sessao')
    })

    it('SEM sessão, devolve `null` — é o que faz a guarda disparar', async () => {
        getSessionMock.mockResolvedValue({ data: { session: null } })
        await expect(getCurrentUserId()).resolves.toBeNull()
    })

    it('sessão sem `user` também devolve `null`, não `undefined`', async () => {
        getSessionMock.mockResolvedValue({ data: { session: {} } })
        await expect(getCurrentUserId()).resolves.toBeNull()
    })
})

describe('2 — a resolução do autor: fallback, e guarda que ABORTA ANTES de inserir', () => {
    /**
     * A decisão, EXATAMENTE como as duas chamadas do arquivo a escrevem. O caso 3 abaixo
     * afirma que o arquivo real a escreve assim nos dois pontos — sem isso, isto aqui seria
     * uma paráfrase, e paráfrase não é portão.
     */
    async function resolverAutor(currentUser: { uid?: string | null } | null) {
        const createdBy = currentUser?.uid ?? (await getCurrentUserId())
        if (!createdBy) return { abortou: true as const, mensagem: 'Sessão inválida. Faça login novamente.' }
        return { abortou: false as const, createdBy }
    }

    beforeEach(() => getSessionMock.mockReset())

    it('com `currentUser` hidratado, o autor é o uid e NÃO se consulta a sessão', async () => {
        getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'da-sessao' } } } })
        const r = await resolverAutor({ uid: 'uid-do-contexto' })
        expect(r).toEqual({ abortou: false, createdBy: 'uid-do-contexto' })
        expect(getSessionMock).not.toHaveBeenCalled()
    })

    // MUTAÇÃO: o fallback devolvendo `null`. Este caso cai no ramo da guarda e fica VERMELHO.
    it('com `currentUser` NÃO hidratado, o FALLBACK resgata e o pedido é criado', async () => {
        getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'da-sessao' } } } })
        const r = await resolverAutor(null)
        expect(r).toEqual({ abortou: false, createdBy: 'da-sessao' })
        expect(getSessionMock).toHaveBeenCalledTimes(1)
    })

    it('sem contexto E sem sessão, ABORTA com a mensagem — o insert não é tentado', async () => {
        getSessionMock.mockResolvedValue({ data: { session: null } })
        const r = await resolverAutor(null)
        expect(r.abortou).toBe(true)
        expect(r).toEqual({ abortou: true, mensagem: 'Sessão inválida. Faça login novamente.' })
    })

    it('`uid` vazio não passa por autor — string vazia é ausência, não id', async () => {
        getSessionMock.mockResolvedValue({ data: { session: null } })
        expect((await resolverAutor({ uid: '' })).abortou).toBe(true)
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('3 — as DUAS chamadas do arquivo real são a MESMA, linha a linha', () => {
    /** Todas as resoluções de autor do arquivo, na forma `const createdBy = …`. */
    const resolucoes = semComentarios
        .split('\n')
        .map((l, i) => ({ n: i + 1, texto: l.trim() }))
        .filter((l) => /^const createdBy\s*=/.test(l.texto))

    it('o arquivo tem TRÊS resoluções de autor, e as três têm o FALLBACK', () => {
        expect(resolucoes.length).toBe(3)
        // Normalizado: `?? (await …)` e `?? await …` são a mesma expressão, e o arquivo já
        // trazia as duas grafias ANTES desta correção — ver o caso da divergência abaixo.
        const formas = new Set(resolucoes.map((r) => r.texto.replace(/\s+/g, ' ').replace(/[()]/g, '')))
        expect([...formas]).toEqual(['const createdBy = currentUser?.uid ?? await getCurrentUserId'])
    })

    it('cada resolução é seguida da MESMA guarda, que aborta com a mesma mensagem', () => {
        const linhas = semComentarios.split('\n')
        for (const r of resolucoes) {
            // A guarda ocupa UMA linha em dois sítios e QUATRO no terceiro: junta-se a
            // janela e afirma-se o conteúdo, não a formatação.
            const janela = linhas.slice(r.n, r.n + 4).join(' ')
            expect(janela).toMatch(/if \(!createdBy\)\s*\{/)
            expect(janela).toContain("messageApi.error('Sessão inválida. Faça login novamente.')")
            expect(janela).toMatch(/return/)
        }
    })

    it('DIVERGÊNCIA PRÉ-EXISTENTE, registrada e NÃO corrigida', () => {
        // `:1497` e o novo de `handleSendToOrder` escrevem `?? (await getCurrentUserId())`;
        // o terceiro escreve `?? await getCurrentUserId()` e abre a guarda em quatro linhas.
        // As três são equivalentes e nenhuma está defeituosa — é grafia, não comportamento.
        // Fica AFIRMADO que são três e equivalentes para que uma QUARTA grafia não entre sem
        // alguém decidir; uniformizar as existentes é escopo do dono do produto.
        const comParenteses = resolucoes.filter((r) => r.texto.includes('?? (await')).length
        const semParenteses = resolucoes.filter((r) => /\?\? await/.test(r.texto)).length
        expect(comParenteses + semParenteses).toBe(3)
        expect(comParenteses).toBe(2)
        expect(semParenteses).toBe(1)
    })

    // MUTAÇÃO: voltar `created_by: currentUser?.uid || null` no insert de `orders`.
    it('NENHUM insert grava o autor direto do contexto, sem passar pela guarda', () => {
        expect(semComentarios).not.toContain('created_by: currentUser?.uid || null')
        expect(semComentarios).not.toContain('created_by: currentUser?.uid')
        expect(semComentarios).not.toContain('created_by: currentUser')
    })

    it('o insert de `orders` carrega `created_by: createdBy`', () => {
        const i = semComentarios.indexOf(".from('orders').insert({")
        expect(i).toBeGreaterThan(0)
        const corpo = semComentarios.slice(i, semComentarios.indexOf('}).select', i))
        expect(corpo).toContain('created_by: createdBy,')
    })

    it('e a guarda vem ANTES do `try`, então o insert não chega a ser montado', () => {
        const i = semComentarios.indexOf('const handleSendToOrder')
        const cabeca = semComentarios.slice(i, semComentarios.indexOf('try {', i))
        expect(cabeca).toContain('const createdBy = currentUser?.uid ?? (await getCurrentUserId())')
        expect(cabeca).toContain('if (!createdBy)')
    })
})
