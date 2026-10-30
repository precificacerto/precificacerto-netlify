/**
 * PORTÃO — as FAMÍLIAS DO CATÁLOGO: criar, editar (nome e ramificações) e remover (dono do produto, 29/10/2026; migração 20261029000004).
 *
 * POR QUÊ: "NO CATÁLOGO, DENTRO DO NICHO, A ABA FAMÍLIAS NÃO DEIXA FAZER NADA: não dá para editar a família que existe, nem excluir, nem
 * adicionar. [...] remover família em uso é RECUSA NOMEADA, nunca cascata." A família é o nome e as RAMIFICAÇÕES — as categorias que a base de
 * conhecimento mostra numa matéria-prima dela —, e criar e editar exigem ao menos uma.
 *
 * O que este portão fica vermelho:
 *   (1) os leitores do corpo: as ramificações são uma lista de chaves, ao menos uma, sem repetir; campo a mais é erro; "nada mudou" compara nome
 *       e ramificações na ordem;
 *   (2) POST /familias: categoria fora do catálogo é 400 antes da função;
 *   (3) PATCH /familias/[chave]: 404 da família que não há; 409 do nome de OUTRA (a própria em outra caixa vale); 400 de fora do catálogo e de
 *       nada mudou; a função recebe o autor da sessão, a chave da URL, o nome e as ramificações; a recusa dela vai com a frase dela;
 *   (4) DELETE /familias/[chave]: chama SÓ a função; a recusa nomeada (22023) é 409 com a frase do banco; P0002 é 404; erro outro é 500 sem o
 *       texto do banco; só o super admin;
 *   (5) a TELA: a lista com as categorias de cada família; criar e editar no modal — salvar só liga com nome e ao menos uma categoria (e, na
 *       edição, quando algo mudou); as categorias vão na ORDEM DO CATÁLOGO, não na do clique; remover pede confirmação; a recusa aparece DENTRO
 *       do modal, que não fecha;
 *   (6) a PÁGINA DO NICHO liga as três ações às rotas e relê o catálogo.
 *
 * O que NÃO alcança: o banco é falso aqui. A trava (nome único, ramificação do catálogo, uso, FK RESTRICT, corridas) está provada num Postgres
 * real, em `scripts/harness/familias-do-catalogo/`, com mutações.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { NextApiRequest, NextApiResponse } from 'next'
import {
    FAMILIA_SEM_RAMIFICACAO, RAMIFICACAO_REPETIDA, RAMIFICACOES_INVALIDAS, ROTAS_DO_CATALOGO, familiaNaoMudou, fraseDaFamiliaComNomeRepetido,
    lerEdicaoDaFamilia, lerFamiliaNova, recusada, type FamiliaDoCatalogo,
} from '@/utils/atendimentos-ia-catalogo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
jest.setTimeout(20000)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

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

const CATEGORIAS = [
    { chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'PERSIANAS', rotulo: 'Persianas', ordem: 2 },
    { chave: 'FERRAGENS', rotulo: 'Ferragens', ordem: 4 }, { chave: 'VIDRO', rotulo: 'Vidro', ordem: 6 },
]
let familias = [{ chave: 'PVC', rotulo: 'PVC Wolf', ordem: 1 }, { chave: 'VECA', rotulo: 'PVC Veca', ordem: 2 }]
let ramificacoes = [{ familia: 'PVC', categoria_chave: 'PERFIL', ordem: 1 }, { familia: 'PVC', categoria_chave: 'VIDRO', ordem: 2 }, { familia: 'VECA', categoria_chave: 'PERFIL', ordem: 1 }]

jest.mock('@/lib/atendimentos-ia/repositorio', () => {
    const real = jest.requireActual('@/lib/atendimentos-ia/repositorio')
    return {
        ErroDoBanco: real.ErroDoBanco,
        codigoDoErro: real.codigoDoErro,
        falhaInterna: real.falhaInterna,
        listarFamilias: jest.fn(async () => familias.map((f) => ({ ...f }))),
        listarRamificacoes: jest.fn(async () => ramificacoes.map((r) => ({ ...r }))),
        listarCategorias: jest.fn(async () => CATEGORIAS.map((c) => ({ ...c }))),
        criarFamilia: jest.fn(async () => ({ ok: true })),
        editarFamilia: jest.fn(async () => ({ ok: true })),
        removerFamilia: jest.fn(async () => ({ removida: 'VECA' })),
    }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ErroDoBanco } = jest.requireActual('@/lib/atendimentos-ia/repositorio') as { ErroDoBanco: new (e: { message?: string; code?: string }) => Error }

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-disable @typescript-eslint/no-require-imports */
const ROTAS: Record<string, () => Rota> = {
    familias: () => require('@/pages/api/super-admin/atendimentos-ia/familias/index').default,
    familia: () => require('@/pages/api/super-admin/atendimentos-ia/familias/[chave]').default,
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
    familias = [{ chave: 'PVC', rotulo: 'PVC Wolf', ordem: 1 }, { chave: 'VECA', rotulo: 'PVC Veca', ordem: 2 }]
    ramificacoes = [{ familia: 'PVC', categoria_chave: 'PERFIL', ordem: 1 }, { familia: 'PVC', categoria_chave: 'VIDRO', ordem: 2 }, { familia: 'VECA', categoria_chave: 'PERFIL', ordem: 1 }]
    Object.values(repo).forEach((f) => { if (typeof f?.mockClear === 'function') f.mockClear() })
})
const nenhumaEscrita = () => {
    expect(repo.criarFamilia).not.toHaveBeenCalled()
    expect(repo.editarFamilia).not.toHaveBeenCalled()
    expect(repo.removerFamilia).not.toHaveBeenCalled()
}

describe('(1) os leitores do corpo', () => {
    it('as ramificações: ao menos uma, sem repetir, chaves de categoria — cada falta com a SUA frase', () => {
        const ler = (ramificacoes: unknown) => { const r = lerFamiliaNova({ rotulo: 'PVC Veca', ramificacoes }); return recusada(r) ? r.erro : r.corpo.ramificacoes }
        expect(ler(['VIDRO', 'PERFIL'])).toEqual(['VIDRO', 'PERFIL'])
        expect(ler([])).toBe(FAMILIA_SEM_RAMIFICACAO)
        expect(ler(['PERFIL', 'PERFIL'])).toBe(RAMIFICACAO_REPETIDA)
        expect(ler(undefined)).toBe(RAMIFICACOES_INVALIDAS)
        expect(ler('PERFIL')).toBe(RAMIFICACOES_INVALIDAS)
        expect(ler(['perfil'])).toBe(RAMIFICACOES_INVALIDAS)
        expect(ler([null])).toBe(RAMIFICACOES_INVALIDAS)
    })

    it('campo a mais é erro, na criação e na edição; a edição lê o nome e as ramificações e NÃO a chave', () => {
        const nova = lerFamiliaNova({ rotulo: 'X', ramificacoes: ['PERFIL'], chave: 'OUTRA' })
        expect(recusada(nova) && nova.erro).toBe('Campo desconhecido no corpo: chave (só rotulo e ramificacoes).')
        const ed = lerEdicaoDaFamilia({ rotulo: '  PVC Wolff ', ramificacoes: ['PERFIL'] })
        expect(recusada(ed) ? ed.erro : ed.corpo).toEqual({ rotulo: 'PVC Wolff', ramificacoes: ['PERFIL'] })
        const comChave = lerEdicaoDaFamilia({ rotulo: 'X', ramificacoes: ['PERFIL'], chave: 'NOVA' })
        expect(recusada(comChave) && comChave.erro).toBe('Campo desconhecido no corpo: chave (só rotulo e ramificacoes).')
        const sem = lerEdicaoDaFamilia({ rotulo: 'X', ramificacoes: [] })
        expect(recusada(sem) && sem.erro).toBe(FAMILIA_SEM_RAMIFICACAO)
        const semNome = lerEdicaoDaFamilia({ rotulo: ' ', ramificacoes: ['PERFIL'] })
        expect(recusada(semNome) && semNome.erro).toBe('Escreva o nome da família.')
    })

    it('"nada mudou": o nome aparado e as ramificações NA ORDEM', () => {
        const atual: FamiliaDoCatalogo = { chave: 'PVC', rotulo: 'PVC Wolf', ordem: 1, ramificacoes: ['PERFIL', 'VIDRO'] }
        expect(familiaNaoMudou(atual, { rotulo: 'PVC Wolf', ramificacoes: ['PERFIL', 'VIDRO'] })).toBe(true)
        expect(familiaNaoMudou(atual, { rotulo: 'PVC Wolff', ramificacoes: ['PERFIL', 'VIDRO'] })).toBe(false)
        expect(familiaNaoMudou(atual, { rotulo: 'PVC Wolf', ramificacoes: ['VIDRO', 'PERFIL'] })).toBe(false)
        expect(familiaNaoMudou(atual, { rotulo: 'PVC Wolf', ramificacoes: ['PERFIL'] })).toBe(false)
        expect(familiaNaoMudou(atual, { rotulo: 'PVC Wolf', ramificacoes: ['PERFIL', 'VIDRO', 'FERRAGENS'] })).toBe(false)
    })

    it('as rotas: a lista e UMA família pela chave', () => {
        expect(ROTAS_DO_CATALOGO.familias).toBe('/api/super-admin/atendimentos-ia/familias')
        expect(ROTAS_DO_CATALOGO.familia('PVC')).toBe('/api/super-admin/atendimentos-ia/familias/PVC')
    })
})

describe('(2) POST /familias — a ROTA recusa antes da função', () => {
    it('categoria fora do catálogo é 400 nomeando-a; a função não é chamada', async () => {
        const r = await chamar('familias', 'POST', {}, { rotulo: 'Portas de ACM', ramificacoes: ['PERFIL', 'INVENTADA'] })
        expect(r).toEqual({ status: 400, json: { error: 'Categoria fora do catálogo: INVENTADA.' } })
        nenhumaEscrita()
    })

    it('a recusa da função por autor (42501) é 403; outro erro é 500 sem o texto do banco', async () => {
        repo.criarFamilia.mockRejectedValueOnce(new ErroDoBanco({ code: '42501', message: 'o autor da alteracao nao e super admin' }))
        expect((await chamar('familias', 'POST', {}, { rotulo: 'Portas de ACM', ramificacoes: ['PERFIL'] })).status).toBe(403)
        repo.criarFamilia.mockRejectedValueOnce(new ErroDoBanco({ code: 'XX000', message: 'segredo do banco' }))
        const r = await chamar('familias', 'POST', {}, { rotulo: 'Portas de ACM', ramificacoes: ['PERFIL'] })
        expect(r).toEqual({ status: 500, json: { error: 'Não foi possível acrescentar a família.' } })
    })
})

describe('(3) PATCH /familias/[chave] — editar o nome e as ramificações', () => {
    const patch = (chave: string, corpo: object) => chamar('familia', 'PATCH', { chave }, corpo)

    it('chama SÓ a função, com o autor da SESSÃO, a chave da URL, o nome aparado e as ramificações na ordem dada', async () => {
        const r = await patch('PVC', { rotulo: ' PVC Wolff ', ramificacoes: ['VIDRO', 'PERFIL', 'FERRAGENS'] })
        expect(r.status).toBe(200)
        expect(repo.editarFamilia).toHaveBeenCalledWith({ por: SUPER.id, chave: 'PVC', rotulo: 'PVC Wolff', ramificacoes: ['VIDRO', 'PERFIL', 'FERRAGENS'] })
        expect(repo.criarFamilia).not.toHaveBeenCalled()
        expect(repo.removerFamilia).not.toHaveBeenCalled()
    })

    it('a família que não há (ou chave fora da forma) é 404; o nome de OUTRA é 409 nomeando-a; a PRÓPRIA em outra caixa vale', async () => {
        expect(await patch('NAO_HA', { rotulo: 'X', ramificacoes: ['PERFIL'] })).toEqual({ status: 404, json: { error: 'Família não encontrada.' } })
        expect(await patch('pvc', { rotulo: 'X', ramificacoes: ['PERFIL'] })).toEqual({ status: 404, json: { error: 'Família não encontrada.' } })
        expect(await patch('PVC', { rotulo: 'pvc VECA', ramificacoes: ['PERFIL'] })).toEqual({ status: 409, json: { error: fraseDaFamiliaComNomeRepetido('PVC Veca') } })
        nenhumaEscrita()
        expect((await patch('PVC', { rotulo: 'pvc wolf', ramificacoes: ['PERFIL', 'VIDRO'] })).status).toBe(200)
    })

    it('categoria fora do catálogo é 400; nada mudou (o nome e as ramificações NA ORDEM) é 400 — e a função não é chamada', async () => {
        expect(await patch('PVC', { rotulo: 'PVC Wolf', ramificacoes: ['PERFIL', 'NAO'] })).toEqual({ status: 400, json: { error: 'Categoria fora do catálogo: NAO.' } })
        expect(await patch('PVC', { rotulo: ' PVC Wolf ', ramificacoes: ['PERFIL', 'VIDRO'] })).toEqual({ status: 400, json: { error: 'Nada mudou: o nome e as categorias são os de agora.' } })
        nenhumaEscrita()
        // a MESMA lista em outra ordem é mudança
        expect((await patch('PVC', { rotulo: 'PVC Wolf', ramificacoes: ['VIDRO', 'PERFIL'] })).status).toBe(200)
    })

    it('a recusa da função vai com a frase dela (22023 → 409); P0002 → 404; corpo inválido → 400; só o super admin', async () => {
        repo.editarFamilia.mockRejectedValueOnce(new ErroDoBanco({ code: '22023', message: 'ja existe a familia "PVC Veca": o nome nao se repete. Nada foi gravado.' }))
        expect(await patch('PVC', { rotulo: 'Outra', ramificacoes: ['PERFIL'] })).toEqual({ status: 409, json: { error: 'ja existe a familia "PVC Veca": o nome nao se repete. Nada foi gravado.' } })
        repo.editarFamilia.mockRejectedValueOnce(new ErroDoBanco({ code: 'P0002', message: 'familia inexistente' }))
        expect((await patch('PVC', { rotulo: 'Outra', ramificacoes: ['PERFIL'] })).status).toBe(404)
        expect((await patch('PVC', { rotulo: 'Outra', ramificacoes: [] })).status).toBe(400)
        perfil = ADMIN
        repo.editarFamilia.mockClear()
        expect((await patch('PVC', { rotulo: 'Outra', ramificacoes: ['PERFIL'] })).status).toBe(403)
        expect(repo.editarFamilia).not.toHaveBeenCalled()
    })
})

describe('(4) DELETE /familias/[chave] — remover; em uso é RECUSA NOMEADA', () => {
    const remover = (chave: string) => chamar('familia', 'DELETE', { chave })

    it('chama SÓ a função, com o autor da sessão e a chave', async () => {
        expect((await remover('VECA')).status).toBe(200)
        expect(repo.removerFamilia).toHaveBeenCalledWith({ por: SUPER.id, chave: 'VECA' })
        expect(repo.editarFamilia).not.toHaveBeenCalled()
    })

    it('em uso (22023): 409 com a frase do banco, que nomeia quem usa; P0002: 404; outro erro: 500 sem o texto do banco', async () => {
        const frase = 'a familia "PVC Wolf" esta em uso: 1 materia(s)-prima(s) (Esquadrias De Paula Ltda / Esquadrias de PVC WOLF); 3 etapa(s). Tire o uso antes de remover. Nada foi removido.'
        repo.removerFamilia.mockRejectedValueOnce(new ErroDoBanco({ code: '22023', message: frase }))
        expect(await remover('PVC')).toEqual({ status: 409, json: { error: frase } })
        repo.removerFamilia.mockRejectedValueOnce(new ErroDoBanco({ code: 'P0002', message: 'familia inexistente' }))
        expect(await remover('NAO_HA')).toEqual({ status: 404, json: { error: 'Família não encontrada.' } })
        repo.removerFamilia.mockRejectedValueOnce(new ErroDoBanco({ code: '23503', message: 'segredo do banco' }))
        expect(await remover('VECA')).toEqual({ status: 500, json: { error: 'Não foi possível remover a família.' } })
    })

    it('só o super admin; método errado é 405', async () => {
        perfil = ADMIN
        expect((await remover('VECA')).status).toBe(403)
        expect(repo.removerFamilia).not.toHaveBeenCalled()
        perfil = SUPER
        expect((await chamar('familia', 'GET', { chave: 'VECA' })).status).toBe(405)
    })
})

// ── (5) a TELA e (6) a PÁGINA ──────────────────────────────────────────────────────────────────
type Dados = { rotulo: string; ramificacoes: string[] }
type Card = React.ComponentType<{ familias: FamiliaDoCatalogo[]; categorias: typeof CATEGORIAS; onCriar: (d: Dados) => Promise<string | null>; onEditar: (c: string, d: Dados) => Promise<string | null>; onRemover: (c: string) => Promise<string | null> }>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const C = () => require('@/page-parts/atendimentos-ia/familias.component') as { FamiliasCard: Card; AVISO_DA_REMOCAO_DA_FAMILIA: string; fraseDaRemocao: (r: string) => string }
const FAMILIAS: FamiliaDoCatalogo[] = [
    { chave: 'VECA', rotulo: 'PVC Veca', ordem: 2, ramificacoes: ['PERFIL'] },
    { chave: 'PVC', rotulo: 'PVC Wolf', ordem: 1, ramificacoes: ['PERFIL', 'VIDRO'] },
]

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(el: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(el) })
    await assentar()
    return host
}
async function clicar(el: Element | null | undefined) {
    expect(el).toBeTruthy()
    await act(async () => { (el as HTMLElement).click() })
    await assentar()
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '') || b.getAttribute('aria-label') === texto) as HTMLButtonElement | undefined
const modal = () => document.body.querySelector('[data-modal-da-familia]') as HTMLElement | null
const ok = (texto: string) => Array.from(document.body.querySelectorAll('.ant-modal-footer button')).find((b) => b.textContent?.replace(/\s/g, '') === texto) as HTMLButtonElement
async function digitar(input: HTMLInputElement, valor: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await assentar()
}
const marcar = (chave: string) => clicar(modal()!.querySelector(`[data-categoria-da-familia="${chave}"] input`))
const marcadas = () => Array.from(modal()!.querySelectorAll('[data-categoria-da-familia] input')).filter((i) => (i as HTMLInputElement).checked).map((i) => i.closest('[data-categoria-da-familia]')!.getAttribute('data-categoria-da-familia'))

function card(o: Partial<{ onCriar: (d: Dados) => Promise<string | null>; onEditar: (c: string, d: Dados) => Promise<string | null>; onRemover: (c: string) => Promise<string | null> }> = {}) {
    return React.createElement(C().FamiliasCard, {
        familias: FAMILIAS, categorias: CATEGORIAS,
        onCriar: o.onCriar ?? (async () => null), onEditar: o.onEditar ?? (async () => null), onRemover: o.onRemover ?? (async () => null),
    })
}

describe('(5) a TELA da aba Famílias', () => {
    it('a lista: pela ordem, cada família com as categorias DELA pelo nome, na ordem dela, e os botões Editar e Remover', async () => {
        const host = await montar(card())
        const linhas = Array.from(host.querySelectorAll('[data-familia-do-catalogo]')) as HTMLElement[]
        expect(linhas.map((l) => l.getAttribute('data-familia-do-catalogo'))).toEqual(['PVC', 'VECA'])
        expect(Array.from(linhas[0].querySelectorAll('[data-ramificacoes] .ant-tag')).map((t) => t.textContent)).toEqual(['Perfil', 'Vidro'])
        expect(botao(linhas[0], 'Editar PVC Wolf')).toBeTruthy()
        expect(botao(linhas[0], 'Remover PVC Wolf')).toBeTruthy()
    })

    it('NOVA família: salvar só liga com nome E ao menos uma categoria; as categorias vão na ORDEM DO CATÁLOGO, não na do clique', async () => {
        const criadas: Dados[] = []
        const host = await montar(card({ onCriar: async (d) => { criadas.push(d); return null } }))
        await clicar(host.querySelector('[data-nova-familia]'))
        expect(ok('Salvar').disabled).toBe(true)
        expect(modal()!.querySelector('[data-sem-ramificacao-marcada]')).not.toBeNull()
        await digitar(modal()!.querySelector('input[aria-label="Nome da família"]') as HTMLInputElement, '  Portas de ACM ')
        expect(ok('Salvar').disabled).toBe(true)
        await marcar('VIDRO')
        await marcar('PERFIL')
        expect(ok('Salvar').disabled).toBe(false)
        await clicar(ok('Salvar'))
        expect(criadas).toEqual([{ rotulo: 'Portas de ACM', ramificacoes: ['PERFIL', 'VIDRO'] }])
        expect(modal()).toBeNull()
    })

    it('a recusa da criação aparece DENTRO do modal, com a frase, e o modal NÃO fecha', async () => {
        const host = await montar(card({ onCriar: async () => 'Já há uma família chamada "PVC Wolf" no catálogo.' }))
        await clicar(host.querySelector('[data-nova-familia]'))
        await digitar(modal()!.querySelector('input[aria-label="Nome da família"]') as HTMLInputElement, 'pvc wolf')
        await marcar('PERFIL')
        await clicar(ok('Salvar'))
        expect(modal()!.querySelector('[data-erro-da-familia]')!.textContent).toContain('Já há uma família chamada "PVC Wolf" no catálogo.')
    })

    it('EDITAR: abre com o nome e as categorias de agora; salvar só liga quando algo muda; vai a chave e os dados', async () => {
        const editadas: Array<[string, Dados]> = []
        const host = await montar(card({ onEditar: async (c, d) => { editadas.push([c, d]); return null } }))
        await clicar(botao(host, 'Editar PVC Wolf'))
        expect((modal()!.querySelector('input[aria-label="Nome da família"]') as HTMLInputElement).value).toBe('PVC Wolf')
        expect(marcadas()).toEqual(['PERFIL', 'VIDRO'])
        expect(ok('Salvar').disabled).toBe(true)
        await marcar('FERRAGENS')
        expect(ok('Salvar').disabled).toBe(false)
        await marcar('FERRAGENS')
        expect(ok('Salvar').disabled).toBe(true)
        await marcar('VIDRO')
        await clicar(ok('Salvar'))
        expect(editadas).toEqual([['PVC', { rotulo: 'PVC Wolf', ramificacoes: ['PERFIL'] }]])
    })

    it('EDITAR só o nome liga o salvar; desmarcar todas desliga', async () => {
        const host = await montar(card())
        await clicar(botao(host, 'Editar PVC Veca'))
        await digitar(modal()!.querySelector('input[aria-label="Nome da família"]') as HTMLInputElement, 'PVC Veca Plus')
        expect(ok('Salvar').disabled).toBe(false)
        await marcar('PERFIL')
        expect(ok('Salvar').disabled).toBe(true)
    })

    it('REMOVER pede confirmação, chama com a chave; a recusa nomeada aparece DENTRO do modal da remoção, que não fecha', async () => {
        const removidas: string[] = []
        const frase = 'a familia "PVC Wolf" esta em uso: 1 materia(s)-prima(s) (Esquadrias De Paula Ltda / Esquadrias de PVC WOLF). Tire o uso antes de remover. Nada foi removido.'
        const host = await montar(card({ onRemover: async (c) => { removidas.push(c); return c === 'PVC' ? frase : null } }))
        await clicar(botao(host, 'Remover PVC Wolf'))
        expect(removidas).toEqual([])
        const remocao = document.body.querySelector('[data-modal-da-remocao]') as HTMLElement
        expect(remocao.textContent).toContain(C().AVISO_DA_REMOCAO_DA_FAMILIA)
        expect(document.body.textContent).toContain(C().fraseDaRemocao('PVC Wolf'))
        await clicar(ok('Remover'))
        expect(removidas).toEqual(['PVC'])
        expect(document.body.querySelector('[data-erro-ao-remover-familia]')!.textContent).toContain(frase)
        expect(document.body.querySelector('[data-modal-da-remocao]')).not.toBeNull()
    })
})

const mockRoteador = { query: { nichoId: 'n-esq' } as Record<string, string>, push: jest.fn(), replace: jest.fn() }
jest.mock('next/router', () => ({ useRouter: () => mockRoteador }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { is_super_admin: true } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children) }))

describe('(6) a PÁGINA DO NICHO liga as três ações às rotas e relê o catálogo', () => {
    let pedidos: Array<{ chave: string; corpo: unknown }> = []
    let respostas: Record<string, { status: number; body: unknown }> = {}
    beforeEach(() => {
        pedidos = []
        respostas = {
            [`GET ${ROTAS_DO_CATALOGO.nichos}`]: { status: 200, body: [{ id: 'n-esq', modelo: 'FABRICACAO', nome: 'Esquadrias', ativo: true }] },
            [`GET ${ROTAS_DO_CATALOGO.fornecedores}`]: { status: 200, body: [] },
            [`GET ${ROTAS_DO_CATALOGO.familias}`]: { status: 200, body: FAMILIAS },
            [`GET ${ROTAS_DO_CATALOGO.categorias}`]: { status: 200, body: CATEGORIAS },
            [`POST ${ROTAS_DO_CATALOGO.familias}`]: { status: 201, body: {} },
            [`PATCH ${ROTAS_DO_CATALOGO.familia('PVC')}`]: { status: 200, body: {} },
            [`DELETE ${ROTAS_DO_CATALOGO.familia('VECA')}`]: { status: 409, body: { error: 'a familia "PVC Veca" esta em uso: 1 motor(es) (Wolf / v.xlsx). Tire o uso antes de remover. Nada foi removido.' } },
        }
        ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
            const chave = `${init?.method ?? 'GET'} ${url}`
            pedidos.push({ chave, corpo: init?.body ? JSON.parse(init.body) : undefined })
            const r = respostas[chave] ?? { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
            return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
        })
    })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Pagina = () => require('@/pages/super-admin/atendimentos-ia/catalogo/[nichoId]').default as React.ComponentType

    it('criar e editar vão às rotas com os dados, e o catálogo é relido; a recusa da remoção aparece no modal', async () => {
        const host = await montar(React.createElement(Pagina()))
        await clicar(host.querySelector('[data-nova-familia]'))
        await digitar(modal()!.querySelector('input[aria-label="Nome da família"]') as HTMLInputElement, 'Portas de ACM')
        await marcar('PERFIL')
        let n = pedidos.length
        await clicar(ok('Salvar'))
        expect(pedidos.slice(n).map((p) => p.chave)).toEqual([`POST ${ROTAS_DO_CATALOGO.familias}`, `GET ${ROTAS_DO_CATALOGO.fornecedores}`, `GET ${ROTAS_DO_CATALOGO.nichos}`, `GET ${ROTAS_DO_CATALOGO.familias}`, `GET ${ROTAS_DO_CATALOGO.categorias}`])
        expect(pedidos[n].corpo).toEqual({ rotulo: 'Portas de ACM', ramificacoes: ['PERFIL'] })

        await clicar(botao(host, 'Editar PVC Wolf'))
        await marcar('VIDRO')
        n = pedidos.length
        await clicar(ok('Salvar'))
        expect(pedidos[n]).toEqual({ chave: `PATCH ${ROTAS_DO_CATALOGO.familia('PVC')}`, corpo: { rotulo: 'PVC Wolf', ramificacoes: ['PERFIL'] } })

        await clicar(botao(host, 'Remover PVC Veca'))
        n = pedidos.length
        await clicar(ok('Remover'))
        expect(pedidos.slice(n).map((p) => p.chave)).toEqual([`DELETE ${ROTAS_DO_CATALOGO.familia('VECA')}`])
        expect(document.body.querySelector('[data-erro-ao-remover-familia]')!.textContent).toContain('esta em uso: 1 motor(es) (Wolf / v.xlsx)')
    })
})

describe('(7) o que liga o código à migração 20261029000004', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs')
    const MIGRACAO = readFileSync(require('path').join(__dirname, '../../../supabase/migrations/20261029000004_familias_do_catalogo.sql'), 'utf8') // eslint-disable-line @typescript-eslint/no-require-imports
    const REPO = jest.requireActual('fs').readFileSync(require('path').join(__dirname, '../../lib/atendimentos-ia/repositorio.ts'), 'utf8') as string // eslint-disable-line @typescript-eslint/no-require-imports

    it('as três funções têm os parâmetros que o repositório manda, com os mesmos nomes', () => {
        expect(MIGRACAO).toContain('CREATE OR REPLACE FUNCTION public.superadmin_criar_familia(\n  p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]\n)')
        expect(MIGRACAO).toContain('CREATE OR REPLACE FUNCTION public.superadmin_editar_familia(\n  p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]\n)')
        expect(MIGRACAO).toContain('CREATE OR REPLACE FUNCTION public.superadmin_remover_familia(\n  p_por uuid, p_chave text\n)')
        expect(REPO).toContain("rpc('superadmin_criar_familia', { p_por: a.por, p_chave: a.chave, p_rotulo: a.rotulo, p_ramificacoes: a.ramificacoes })")
        expect(REPO).toContain("rpc('superadmin_editar_familia', { p_por: a.por, p_chave: a.chave, p_rotulo: a.rotulo, p_ramificacoes: a.ramificacoes })")
        expect(REPO).toContain("rpc('superadmin_remover_familia', { p_por: a.por, p_chave: a.chave })")
    })

    it('o limite do nome é o da CHECK da migração (o mesmo da tela)', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { LIMITE_DO_ROTULO_DA_FAMILIA } = require('@/utils/atendimentos-ia-catalogo') as typeof import('@/utils/atendimentos-ia-catalogo')
        expect(MIGRACAO).toContain(`'o nome da familia tem de 1 a ${LIMITE_DO_ROTULO_DA_FAMILIA} caracteres.`)
    })
})
