/**
 * PORTÃO — a FAMÍLIA da tabela do fornecedor (migração 20261026000004).
 *
 * POR QUÊ (dono do produto, 26/10/2026): a cascata é FAMÍLIA -> LINHA -> TIPOLOGIA -> PERFIS, VIDROS,
 * INSUMOS -> PREÇO, e o primeiro degrau não existia em campo nenhum: o motor sabe a LINHA (EUROPA 42),
 * não que ela é PVC. As decisões, registradas como estão:
 *   - LISTA FECHADA, catálogo no padrão de `orcamentista_categoria_catalogo` (chave, rótulo, ordem). O
 *     super admin acrescenta entradas — "Portas de ACM e Portas de garagem ainda vão aparecer";
 *   - a FAMÍLIA é atributo da TABELA DO FORNECEDOR, escolhido da lista no cadastro da tabela. Não é
 *     deduzida do prefixo de `linha` nem de `orcamentista_motor_regra.segmento`;
 *   - a conta PODE ter duas tabelas da mesma família: sem unicidade por família.
 *
 * O que este portão fica vermelho:
 *   (1) a chave da família nova: derivada do rótulo, MAIÚSCULA ASCII, com o limite declarado;
 *   (2) a tabela NOVA sem família, ou com família fora da lista, é recusada pela ROTA — antes do banco;
 *       a EDIÇÃO troca a família, e nunca a apaga;
 *   (3) a rota das famílias: só o super admin; a nova entra no FIM da lista; a repetida é 409;
 *   (4) a TELA: o modal da tabela nova não salva sem família, e nada vem escolhido por ela;
 *       o card das famílias acrescenta pelo rótulo.
 *
 * O que NÃO alcança: o banco é falso. A FK, a CHECK da chave e a ordem única estão provadas num
 * Postgres real (o PR cita a prova), não aqui.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { NextApiRequest, NextApiResponse } from 'next'

import {
    LIMITE_DO_ROTULO_DA_FAMILIA, MENSAGEM_CATEGORIA_OBRIGATORIA, MENSAGEM_FAMILIA_OBRIGATORIA, ROTAS_DO_CATALOGO,
    chaveDaFamilia, fraseDaFamiliaDesconhecida, lerCorpoDaTabela, lerEdicaoDaTabela, lerFamiliaNova, recusada,
    type Familia,
} from '@/utils/atendimentos-ia-catalogo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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

const F = '11111111-1111-1111-1111-111111111111'
const T = '22222222-2222-2222-2222-222222222222'
const PVC: Familia = { chave: 'PVC', rotulo: 'PVC', ordem: 1 }
let catalogo: Familia[] = [PVC]

jest.mock('@/lib/atendimentos-ia/repositorio', () => {
    const real = jest.requireActual('@/lib/atendimentos-ia/repositorio')
    return {
        ErroDoBanco: real.ErroDoBanco,
        codigoDoErro: real.codigoDoErro,
        falhaInterna: real.falhaInterna,
        listarFamilias: jest.fn(async () => catalogo.map((f) => ({ ...f }))),
        listarCategorias: jest.fn(async () => [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }]),
        criarFamilia: jest.fn(async (f: Familia) => ({ ...f })),
        criarTabela: jest.fn(async () => ({ id: T })),
        obterTabela: jest.fn(async () => ({ id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: `${F}/motor/x-m.xlsx` })),
        atualizarTabela: jest.fn(async () => 1),
        objetoExiste: jest.fn(async () => true),
        removerObjetos: jest.fn(async (): Promise<{ erro: string | null }> => ({ erro: null })),
    }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ErroDoBanco } = jest.requireActual('@/lib/atendimentos-ia/repositorio') as { ErroDoBanco: new (e: { message?: string; code?: string }) => Error }

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
// lidas na CHAMADA: no commit do teste vermelho a rota das famílias ainda não existe
/* eslint-disable @typescript-eslint/no-require-imports */
const ROTAS: Record<string, () => Rota> = {
    familias: () => require('@/pages/api/super-admin/atendimentos-ia/familias/index').default,
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
    catalogo = [PVC]
    Object.values(repo).forEach((f) => { if (typeof f?.mockClear === 'function') f.mockClear() })
})

const CORPO = { fornecedor_id: F, arquivo_path: `${F}/arquivo/a-t.xlsx`, arquivo_nome: 't.xlsx', motor_path: `${F}/motor/a-m.xlsx`, motor_nome: 'm.xlsx', vigencia: null as string | null, categoria_chave: 'PERFIL' }

describe('(1) a chave da família nova vem do rótulo', () => {
    it('MAIÚSCULA ASCII, sem acento, palavras unidas por "_"', () => {
        expect(chaveDaFamilia('Portas de ACM')).toBe('PORTAS_DE_ACM')
        expect(chaveDaFamilia('Portas de garagem')).toBe('PORTAS_DE_GARAGEM')
        expect(chaveDaFamilia('Alumínio')).toBe('ALUMINIO')
        expect(chaveDaFamilia('  PVC  ')).toBe('PVC')
        expect(chaveDaFamilia('Box / Vidro temperado')).toBe('BOX_VIDRO_TEMPERADO')
    })

    it('a chave cabe na CHECK do banco: começa por letra, até 40', () => {
        expect(chaveDaFamilia('2 folhas')).toBeNull()
        expect(chaveDaFamilia('---')).toBeNull()
        const longa = chaveDaFamilia('a'.repeat(30) + ' ' + 'b'.repeat(30))
        expect(longa).toMatch(/^[A-Z][A-Z0-9_]{0,39}$/)
        expect(longa?.endsWith('_')).toBe(false)
    })

    it('o rótulo é aparado e tem o limite declarado; vazio e longo são recusados com a frase', () => {
        const ok = lerFamiliaNova({ rotulo: '  Portas de ACM ' })
        expect(recusada(ok) ? ok.erro : ok.corpo).toEqual({ rotulo: 'Portas de ACM', chave: 'PORTAS_DE_ACM' })
        const vazio = lerFamiliaNova({ rotulo: '   ' })
        expect(recusada(vazio) && vazio.erro).toBe('Escreva o nome da família.')
        const longo = lerFamiliaNova({ rotulo: 'x'.repeat(LIMITE_DO_ROTULO_DA_FAMILIA + 1) })
        expect(recusada(longo) && longo.erro).toBe(`O nome da família tem ${LIMITE_DO_ROTULO_DA_FAMILIA + 1} caracteres; o limite é ${LIMITE_DO_ROTULO_DA_FAMILIA}.`)
        expect(LIMITE_DO_ROTULO_DA_FAMILIA).toBe(60)
        const semLetra = lerFamiliaNova({ rotulo: '2 folhas' })
        expect(recusada(semLetra) && semLetra.erro).toBe('O nome da família precisa começar por uma letra.')
    })
})

describe('(2) a família no cadastro da tabela — a ROTA recusa antes do banco', () => {
    it('o corpo sem família é recusado com a frase; com família, ela vai no corpo', () => {
        const sem = lerCorpoDaTabela(CORPO)
        expect(recusada(sem) && sem.erro).toBe(MENSAGEM_FAMILIA_OBRIGATORIA)
        const com = lerCorpoDaTabela({ ...CORPO, familia: 'PVC' })
        expect(recusada(com) ? com.erro : com.corpo.familia).toBe('PVC')
        const forma = lerCorpoDaTabela({ ...CORPO, familia: 'pvc' })
        expect(recusada(forma) && forma.erro).toBe(MENSAGEM_FAMILIA_OBRIGATORIA)
    })

    it('POST sem família → 400 e nada gravado; com família fora da lista → 400 nomeando-a; com PVC → grava a família', async () => {
        const sem = await chamar('tabelas', 'POST', {}, CORPO)
        expect(sem).toEqual({ status: 400, json: { error: MENSAGEM_FAMILIA_OBRIGATORIA } })
        const fora = await chamar('tabelas', 'POST', {}, { ...CORPO, familia: 'PORTAS_DE_ACM' })
        expect(fora).toEqual({ status: 400, json: { error: fraseDaFamiliaDesconhecida('PORTAS_DE_ACM') } })
        expect(repo.criarTabela).not.toHaveBeenCalled()
        const ok = await chamar('tabelas', 'POST', {}, { ...CORPO, familia: 'PVC' })
        expect(ok.status).toBe(201)
        expect(repo.criarTabela).toHaveBeenCalledWith(expect.objectContaining({ familia: 'PVC', fornecedor_id: F }))
    })

    it('a FK da família recusada pelo banco (corrida com a lista) NÃO vira "Fornecedor não encontrado"', async () => {
        repo.criarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23503', message: 'insert or update on table "orcamentista_tabela" violates foreign key constraint "orcamentista_tabela_familia_fkey"' }))
        const r = await chamar('tabelas', 'POST', {}, { ...CORPO, familia: 'PVC' })
        expect(r).toEqual({ status: 400, json: { error: fraseDaFamiliaDesconhecida('PVC') } })
        // o contraste: a FK do fornecedor continua sendo "fornecedor não encontrado"
        repo.criarTabela.mockRejectedValueOnce(new ErroDoBanco({ code: '23503', message: 'violates foreign key constraint "orcamentista_tabela_fornecedor_id_fkey"' }))
        expect((await chamar('tabelas', 'POST', {}, { ...CORPO, familia: 'PVC' })).json).toEqual({ error: 'Fornecedor não encontrado.' })
    })

    it('a EDIÇÃO troca a família da lista; família fora da lista ou vazia é recusada — a família não se apaga', async () => {
        const ed = lerEdicaoDaTabela({ familia: 'PVC' }, F)
        expect(recusada(ed) ? ed.erro : ed.corpo).toEqual({ familia: 'PVC' })
        const vazia = lerEdicaoDaTabela({ familia: '' }, F)
        expect(recusada(vazia) && vazia.erro).toBe(MENSAGEM_FAMILIA_OBRIGATORIA)

        const ok = await chamar('tabela', 'PATCH', { id: T }, { familia: 'PVC' })
        expect(ok.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, { familia: 'PVC' })
        repo.atualizarTabela.mockClear()
        const fora = await chamar('tabela', 'PATCH', { id: T }, { familia: 'PORTAS_DE_ACM' })
        expect(fora).toEqual({ status: 400, json: { error: fraseDaFamiliaDesconhecida('PORTAS_DE_ACM') } })
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
    })
})

describe('(3) a rota das famílias', () => {
    it('quem não é super admin: 403, e o repositório não é tocado', async () => {
        perfil = ADMIN
        expect((await chamar('familias', 'GET')).status).toBe(403)
        expect((await chamar('familias', 'POST', {}, { rotulo: 'Portas de ACM' })).status).toBe(403)
        expect(repo.listarFamilias).not.toHaveBeenCalled()
        expect(repo.criarFamilia).not.toHaveBeenCalled()
    })

    it('GET devolve a lista NA ORDEM; POST acrescenta no FIM, com a chave do rótulo', async () => {
        catalogo = [{ chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }, PVC]
        const lista = await chamar('familias', 'GET')
        expect(lista).toEqual({ status: 200, json: [PVC, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }] })
        const nova = await chamar('familias', 'POST', {}, { rotulo: ' Portas de ACM ' })
        expect(nova.status).toBe(201)
        expect(repo.criarFamilia).toHaveBeenCalledWith({ chave: 'PORTAS_DE_ACM', rotulo: 'Portas de ACM', ordem: 3 })
    })

    it('a família que já existe (pela chave) é 409 nomeando-a, sem gravar; a corrida na ordem também é 409', async () => {
        const repetida = await chamar('familias', 'POST', {}, { rotulo: 'pvc' })
        expect(repetida).toEqual({ status: 409, json: { error: 'A família "PVC" já está na lista.' } })
        expect(repo.criarFamilia).not.toHaveBeenCalled()
        repo.criarFamilia.mockRejectedValueOnce(new ErroDoBanco({ code: '23505', message: 'duplicate key value violates unique constraint "orcamentista_familia_catalogo_ordem_key"' }))
        const corrida = await chamar('familias', 'POST', {}, { rotulo: 'Portas de garagem' })
        expect(corrida).toEqual({ status: 409, json: { error: 'Outra família foi gravada ao mesmo tempo. Tente de novo.' } })
    })

    it('rótulo inválido: 400 com a frase de `lerFamiliaNova`; método errado: 405', async () => {
        expect(await chamar('familias', 'POST', {}, { rotulo: '' })).toEqual({ status: 400, json: { error: 'Escreva o nome da família.' } })
        expect((await chamar('familias', 'DELETE')).status).toBe(405)
    })
})

// ── (4) a TELA ────────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Modal = () => require('@/page-parts/atendimentos-ia/tabela-modal.component').TabelaModal as React.ComponentType<any>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const card = () => require('@/page-parts/atendimentos-ia/familias.component') as { FamiliasCard: React.ComponentType<{ familias: Familia[]; onCriar: (rotulo: string) => Promise<boolean> }> }

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(no: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(no) })
    await assentar()
    return host
}
const modal = () => {
    const abertos = Array.from(document.querySelectorAll('.ant-modal-wrap')).filter((w) => (w as HTMLElement).style.display !== 'none')
    return (abertos[abertos.length - 1]?.querySelector('.ant-modal') ?? null) as HTMLElement | null
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '')) as HTMLButtonElement | undefined
async function escolherArquivo(indice: 0 | 1, nome: string) {
    const input = modal()!.querySelectorAll('input[type=file]')[indice] as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['x'], nome)], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await assentar()
}
// o antd põe o atributo no próprio input do Radio.Button; um invólucro com ele também vale
const opcaoDaCategoria = (chave: string) => modal()!.querySelector(`input[data-categoria="${chave}"], [data-categoria="${chave}"] input`) as HTMLInputElement | null
const opcaoDaFamilia = (chave: string) => modal()!.querySelector(`input[data-familia="${chave}"], [data-familia="${chave}"] input`) as HTMLInputElement | null

describe('(4) a TELA', () => {
    const FAMILIAS: Familia[] = [PVC, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }]

    it('tabela NOVA: as famílias da lista aparecem, NENHUMA vem escolhida, e sem família o salvar não liga', async () => {
        const salvos: Array<{ familia: string | null }> = []
        await montar(React.createElement(Modal(), { categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }], aberto: true, titulo: 'Nova tabela', familias: FAMILIAS, onCancelar: () => {}, onSalvar: (t: { familia: string | null }) => { salvos.push(t) } }))
        await escolherArquivo(0, 't.xlsx')
        await escolherArquivo(1, 'm.xlsx')
        // a categoria já está escolhida: o que mantém o salvar desligado, abaixo, é SÓ a família
        await act(async () => { opcaoDaCategoria('PERFIL')!.click() })
        await assentar()
        expect(opcaoDaFamilia('PVC')).not.toBeNull()
        expect(opcaoDaFamilia('ALUMINIO')).not.toBeNull()
        expect(opcaoDaFamilia('PVC')!.checked).toBe(false)
        expect(opcaoDaFamilia('ALUMINIO')!.checked).toBe(false)
        expect(botao(modal()!, 'Salvar tabela')!.disabled).toBe(true)
        expect(modal()!.textContent).toContain(MENSAGEM_FAMILIA_OBRIGATORIA)

        await act(async () => { opcaoDaFamilia('PVC')!.click() })
        await assentar()
        expect(botao(modal()!, 'Salvar tabela')!.disabled).toBe(false)
        await act(async () => { botao(modal()!, 'Salvar tabela')!.click() })
        expect(salvos.map((t) => t.familia)).toEqual(['PVC'])
    })

    it('EDIÇÃO de tabela sem família: diz "não informada", e salvar sem escolher não manda família', async () => {
        const salvos: Array<{ familia: string | null }> = []
        await montar(React.createElement(Modal(), {
            aberto: true, titulo: 'Editar tabela', familias: FAMILIAS, categorias: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }], atual: { arquivo_nome: 't.xlsx', motor_nome: 'm.xlsx', vigencia: null, familia: null, categoria_chave: null },
            onCancelar: () => {}, onSalvar: (t: { familia: string | null }) => { salvos.push(t) },
        }))
        expect(modal()!.textContent).toContain('Família não informada')
        await act(async () => { botao(modal()!, 'Salvar tabela')!.click() })
        expect(salvos.map((t) => t.familia)).toEqual([null])
    })

    // ── a CATEGORIA no mesmo modal (27/10/2026) ─────────────────────────────────────────────────
    const CATEGORIAS = [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'VIDRO', rotulo: 'Vidro', ordem: 2 }]

    it('tabela NOVA: as categorias da lista aparecem, NENHUMA vem escolhida, e sem categoria o salvar não liga (a família já está escolhida)', async () => {
        const salvos: Array<{ familia: string | null; categoria: string | null }> = []
        await montar(React.createElement(Modal(), { aberto: true, titulo: 'Nova tabela', familias: FAMILIAS, categorias: CATEGORIAS, onCancelar: () => {}, onSalvar: (t: { familia: string | null; categoria: string | null }) => { salvos.push(t) } }))
        await escolherArquivo(0, 't.xlsx')
        await escolherArquivo(1, 'm.xlsx')
        await act(async () => { opcaoDaFamilia('PVC')!.click() })
        await assentar()
        expect(opcaoDaCategoria('PERFIL')).not.toBeNull()
        expect(opcaoDaCategoria('VIDRO')).not.toBeNull()
        expect(opcaoDaCategoria('PERFIL')!.checked).toBe(false)
        expect(opcaoDaCategoria('VIDRO')!.checked).toBe(false)
        expect(botao(modal()!, 'Salvar tabela')!.disabled).toBe(true)
        expect(modal()!.textContent).toContain(MENSAGEM_CATEGORIA_OBRIGATORIA)

        await act(async () => { opcaoDaCategoria('VIDRO')!.click() })
        await assentar()
        expect(botao(modal()!, 'Salvar tabela')!.disabled).toBe(false)
        expect(modal()!.textContent).not.toContain(MENSAGEM_CATEGORIA_OBRIGATORIA)
        await act(async () => { botao(modal()!, 'Salvar tabela')!.click() })
        expect(salvos.map((t) => [t.familia, t.categoria])).toEqual([['PVC', 'VIDRO']])
    })

    it('EDIÇÃO de tabela SEM categoria: diz "não informada", salvar sem escolher não manda categoria, e escolher uma manda', async () => {
        const salvos: Array<{ categoria: string | null }> = []
        const props = { aberto: true, titulo: 'Editar tabela', familias: FAMILIAS, categorias: CATEGORIAS, atual: { arquivo_nome: 't.xlsx', motor_nome: 'm.xlsx', vigencia: null, familia: 'PVC', categoria_chave: null }, onCancelar: () => {}, onSalvar: (t: { categoria: string | null }) => { salvos.push(t) } }
        await montar(React.createElement(Modal(), props))
        expect(modal()!.textContent).toContain('Categoria não informada')
        expect(botao(modal()!, 'Salvar tabela')!.disabled).toBe(false)
        await act(async () => { botao(modal()!, 'Salvar tabela')!.click() })
        expect(salvos.map((t) => t.categoria)).toEqual([null])

        await act(async () => { opcaoDaCategoria('VIDRO')!.click() })
        await assentar()
        await act(async () => { botao(modal()!, 'Salvar tabela')!.click() })
        expect(salvos.map((t) => t.categoria)).toEqual([null, 'VIDRO'])
    })

    it('EDIÇÃO de tabela COM categoria: ela aparece como texto, não há como trocá-la, e salvar não a manda', async () => {
        const salvos: Array<{ categoria: string | null }> = []
        await montar(React.createElement(Modal(), {
            aberto: true, titulo: 'Editar tabela', familias: FAMILIAS, categorias: CATEGORIAS,
            atual: { arquivo_nome: 't.xlsx', motor_nome: 'm.xlsx', vigencia: null, familia: 'PVC', categoria_chave: 'VIDRO' },
            onCancelar: () => {}, onSalvar: (t: { categoria: string | null }) => { salvos.push(t) },
        }))
        expect(modal()!.querySelector('[data-categoria-da-tabela="VIDRO"]')!.textContent).toContain('Vidro')
        expect(modal()!.textContent).toContain('não se troca')
        expect(opcaoDaCategoria('PERFIL')).toBeNull()
        expect(opcaoDaCategoria('VIDRO')).toBeNull()
        expect(modal()!.textContent).not.toContain('Categoria não informada')
        await act(async () => { botao(modal()!, 'Salvar tabela')!.click() })
        expect(salvos.map((t) => t.categoria)).toEqual([null])
    })

    it('o card das famílias lista pela ordem e acrescenta pelo rótulo', async () => {
        const criadas: string[] = []
        const host = await montar(React.createElement(card().FamiliasCard, { familias: [{ chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }, PVC], onCriar: async (r: string) => { criadas.push(r); return true } }))
        const nomes = Array.from(host.querySelectorAll('[data-familia-do-catalogo]')).map((e) => e.textContent)
        expect(nomes).toEqual(['PVC', 'Alumínio'])
        const input = host.querySelector('input[aria-label="Nome da família"]') as HTMLInputElement
        expect(botao(host, 'Nova família')!.disabled).toBe(true)
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Portas de ACM')
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await assentar()
        await act(async () => { botao(host, 'Nova família')!.click() })
        await assentar()
        expect(criadas).toEqual(['Portas de ACM'])
    })

    it('a rota das famílias está no catálogo das rotas', () => {
        expect(ROTAS_DO_CATALOGO.familias).toBe('/api/super-admin/atendimentos-ia/familias')
    })
})
