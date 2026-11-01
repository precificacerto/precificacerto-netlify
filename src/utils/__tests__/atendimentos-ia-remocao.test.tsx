/**
 * PORTÃO — O CATÁLOGO É SOBERANO NAS QUATRO SEÇÕES (dono do produto, 31/10/2026; migração 20261031000003): família, fornecedor, motor e etapa
 * — e na TABELA de fornecedor, a quinta raiz (dono do produto, 01/11/2026; migração 20261101000001), pelos mesmos passos (bloco 7)
 * saem por ARRASTO DECLARADO E CONFIRMADO, numa rota só (`catalogo/remover`).
 *
 * O que este portão fica vermelho:
 *   (1) a leitura da medição: forma errada é null (a tela mostra erro, nunca um arrasto vazio);
 *   (2) o pedido: só com `confirmo: true` e a assinatura do que foi mostrado; a chave na forma do tipo; campo a mais é erro;
 *   (3) as frases, com acento: o rótulo de cada passo, "e mais N", o AVISO de que a conversa PARA (decisão 4, até o PR D) e o impedimento;
 *   (4) a ROTA: GET mede (sem chamar a remoção); POST só remove confirmado, com o autor da SESSÃO; 40001 → 409 com o arrasto NOVO; impedimento
 *       → 409 com a frase; P0002 → 404; 42501 → 403; tempo → 504; outro → 500 sem o texto do banco; só o super admin;
 *   (5) a TELA da confirmação: o impedimento desliga o Remover e a caixa; a falha de leitura é ERRO;
 *   (6) a paridade com a migração: os nomes e parâmetros das funções, os tipos de aviso e de impedimento, cada tabela que um passo alcança tem
 *       rótulo com acento, e a rota espera mais que o tempo da função.
 *
 * O que NÃO alcança: o banco é falso aqui. O arrasto (cada passo, a trava C, o log linha a linha, as corridas, o volume de ~125 mil linhas)
 * está provado num Postgres real, em `scripts/harness/catalogo-soberano/`, com mutações.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'
import {
    ASSINATURA_OBRIGATORIA, CHAVE_INVALIDA, CONFIRMACAO_OBRIGATORIA, ITEM_INEXISTENTE, REMOCAO_PASSOU_DO_TEMPO, TIPO_DESCONHECIDO, fraseDoAviso,
    fraseDoImpedimento, lerArrasto, lerPedidoDeRemocao, nomesComOResto, passosQueMexem, resumoDoArrasto, rotaDoArrasto, rotuloDoPasso, TIPOS_DE_REMOCAO, tituloDaRemocao, type Arrasto,
} from '@/utils/atendimentos-ia-remocao'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
jest.setTimeout(20000)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

const W = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'
const T1 = '72366020-57c9-489f-9385-397b7fa3dedb'
const A = 'a'.repeat(32)
const arrasto = (o: Partial<Arrasto> = {}): Arrasto => ({
    tipo: 'fornecedor', chave: W, nome: 'Wolf Perfis', sai: 3, perde_o_vinculo: 1, assinatura: A, ficam: [], avisos: [], impedimentos: [],
    passos: [
        { passo: 1, tabela: 'orcamentista_levantamento_item', acao: 'perde_o_vinculo', rotulo: 'item de levantamento (documento de cliente)', quantidade: 1, nomes: ['De Paula / levantamento 1e000000 / item 1'], mais: 0 },
        { passo: 2, tabela: 'orcamentista_motor_regra', acao: 'sai', rotulo: 'conteudo de motor da tabela', quantidade: 12, nomes: ['R1', 'R2'], mais: 2 },
        { passo: 3, tabela: 'orcamentista_tabela_item', acao: 'sai', rotulo: 'item de preco', quantidade: 0, nomes: [], mais: 0 },
        { passo: 4, tabela: 'orcamentista_fornecedor', acao: 'sai', rotulo: 'fornecedor', quantidade: 1, nomes: ['Wolf Perfis'], mais: 0 },
    ],
    ...o,
})

// ── (1) e (2) os leitores ─────────────────────────────────────────────────────────────────────
describe('(1) a leitura da medição', () => {
    it('a forma certa volta inteira', () => {
        expect(lerArrasto(arrasto())).toEqual(arrasto())
    })
    it.each([
        ['sem assinatura', { assinatura: undefined }],
        ['assinatura fora da forma', { assinatura: 'xyz' }],
        ['tipo desconhecido', { tipo: 'nicho' }],
        ['passo com ação que não é sai nem perde o vínculo', { passos: [{ ...arrasto().passos[0], acao: 'apaga' }] }],
        ['quantidade negativa', { passos: [{ ...arrasto().passos[0], quantidade: -1 }] }],
        ['aviso de tipo desconhecido', { avisos: [{ tipo: 'outro' }] }],
        ['aviso da conversa sem as empresas', { avisos: [{ tipo: 'conversa_para', tabela_id: T1, arquivo: 'x.xlsx' }] }],
        ['impedimento sem as tabelas', { impedimentos: [{ tipo: 'vigentes_sem_familia', fornecedor: 'IMAB', categoria: 'FERRAGENS' }] }],
        ['sem os passos', { passos: undefined }],
    ])('%s é null (a tela mostra erro)', (_c, o) => {
        expect(lerArrasto({ ...arrasto(), ...o })).toBeNull()
    })
    it('null e não-objeto são null', () => {
        expect(lerArrasto(null)).toBeNull()
        expect(lerArrasto([arrasto()])).toBeNull()
    })
})

describe('(2) o pedido de remoção', () => {
    const ok = { tipo: 'fornecedor', chave: W, assinatura: A, confirmo: true }
    it('o pedido certo', () => {
        expect(lerPedidoDeRemocao(ok)).toEqual({ ok: true, corpo: { tipo: 'fornecedor', chave: W, assinatura: A } })
        expect(lerPedidoDeRemocao({ ...ok, tipo: 'familia', chave: 'PVC' })).toEqual({ ok: true, corpo: { tipo: 'familia', chave: 'PVC', assinatura: A } })
    })
    it('SEM a confirmação explícita (ausente, false, "true") é recusa', () => {
        for (const confirmo of [undefined, false, 'true', 1]) expect(lerPedidoDeRemocao({ ...ok, confirmo })).toEqual({ ok: false, erro: CONFIRMACAO_OBRIGATORIA })
    })
    it('a assinatura do que foi mostrado é obrigatória, na forma', () => {
        expect(lerPedidoDeRemocao({ ...ok, assinatura: undefined })).toEqual({ ok: false, erro: ASSINATURA_OBRIGATORIA })
        expect(lerPedidoDeRemocao({ ...ok, assinatura: 'A'.repeat(32) })).toEqual({ ok: false, erro: ASSINATURA_OBRIGATORIA })
    })
    it('o tipo e a chave na forma do tipo: família é a chave do catálogo; os outros, uuid', () => {
        // 'nicho': desde a 20261101000001 a 'tabela' é um tipo
        expect(lerPedidoDeRemocao({ ...ok, tipo: 'nicho' })).toEqual({ ok: false, erro: TIPO_DESCONHECIDO })
        expect(lerPedidoDeRemocao({ ...ok, tipo: 'tabela' })).toEqual({ ok: true, corpo: { tipo: 'tabela', chave: W, assinatura: A } })
        expect(lerPedidoDeRemocao({ ...ok, tipo: 'tabela', chave: 'PVC' })).toEqual({ ok: false, erro: CHAVE_INVALIDA })
        expect(lerPedidoDeRemocao({ ...ok, tipo: 'familia', chave: W })).toEqual({ ok: false, erro: CHAVE_INVALIDA })
        expect(lerPedidoDeRemocao({ ...ok, tipo: 'motor', chave: 'PVC' })).toEqual({ ok: false, erro: CHAVE_INVALIDA })
    })
    it('campo a mais é erro (o autor não vem do corpo)', () => {
        expect(lerPedidoDeRemocao({ ...ok, por: 'u-x' })).toEqual({ ok: false, erro: 'Campo desconhecido no corpo: por (só tipo, chave, assinatura e confirmo).' })
    })
})

// ── (3) as frases ───────────────────────────────────────────────────────────────────────────
describe('(3) as frases, com acento', () => {
    it('o rótulo de cada passo; o conteúdo do motor diz a aba', () => {
        expect(rotuloDoPasso(arrasto().passos[0])).toBe('item de levantamento (documento de cliente — fica, perde o vínculo)')
        expect(rotuloDoPasso(arrasto().passos[1])).toBe('conteúdo de motor da tabela (regra)')
        expect(rotuloDoPasso({ tabela: 'orcamentista_motor_tipologia_tempo', acao: 'sai', rotulo: 'conteudo do motor' })).toBe('conteúdo do motor (tipologia tempo)')
        expect(rotuloDoPasso({ tabela: 'orcamentista_materia_prima', acao: 'perde_o_vinculo', rotulo: 'x' })).toBe('família de conta (fica, sem tipo)')
    })
    it('até dez nomes e "e mais N"', () => {
        expect(nomesComOResto(['R1', 'R2'], 2)).toBe('R1, R2 e mais 2')
        expect(nomesComOResto(['R1'], 0)).toBe('R1')
        expect(nomesComOResto([], 0)).toBe('')
    })
    it('só os passos que mexem, separados entre os que saem e os que perdem o vínculo, na ordem', () => {
        const { sai, perde } = passosQueMexem(arrasto())
        expect(sai.map((p) => p.passo)).toEqual([2, 4])
        expect(perde.map((p) => p.passo)).toEqual([1])
        expect(resumoDoArrasto(arrasto())).toBe('Sai: 3 linha(s). Fica e perde o vínculo: 1 linha(s).')
        expect(resumoDoArrasto(arrasto({ perde_o_vinculo: 0 }))).toBe('Sai: 3 linha(s).')
    })
    it('DECISÃO 4: o aviso EXPLÍCITO de que a conversa da empresa PARA, e de que ele sai com o PR D', () => {
        expect(fraseDoAviso({ tipo: 'conversa_para', tabela_id: T1, arquivo: 'Perfis_de_PVC_-_Wolff.xlsx', empresas: ['Esquadrias De Paula Ltda'] })).toBe(
            'A conversa de Esquadrias De Paula Ltda PARA de funcionar até ser reconfigurada: ela ainda lê o motor pela tabela Perfis_de_PVC_-_Wolff.xlsx (72366020), não pelo catálogo. '
            + 'Este aviso sai quando a conversa passar a ler o motor pelo catálogo (PR D).')
        expect(fraseDoAviso({ tipo: 'conversa_para', tabela_id: T1, arquivo: 'x.xlsx', empresas: [] })).toContain('Nenhuma empresa usa hoje a tabela x.xlsx (72366020)')
        expect(fraseDoAviso({ tipo: 'renumeracao' })).toBe('Nas famílias de conta que perdem uma etapa, as de baixo sobem um número (1..N, sem buraco).')
    })
    it('o impedimento nomeia as tabelas, o fornecedor e a categoria, e diz o que fazer', () => {
        expect(fraseDoImpedimento({ tipo: 'vigentes_sem_familia', fornecedor: 'IMAB', categoria: 'FERRAGENS', tabelas: [{ id: T1, arquivo: 'a.xlsx' }, { id: W, arquivo: 'b.xlsx' }] })).toBe(
            'As tabelas a.xlsx (72366020), b.xlsx (44c5c0fe) ficariam vigentes juntas, sem família (fornecedor IMAB, categoria FERRAGENS): arquive ou tire a vigência de uma delas antes de remover a família.')
    })
})

// ── (4) a ROTA ──────────────────────────────────────────────────────────────────────────────
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
jest.mock('@/lib/atendimentos-ia/repositorio', () => {
    const real = jest.requireActual('@/lib/atendimentos-ia/repositorio')
    return { ErroDoBanco: real.ErroDoBanco, codigoDoErro: real.codigoDoErro, falhaInterna: real.falhaInterna, medirArrastoDoCatalogo: jest.fn(), removerDoCatalogo: jest.fn() }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ErroDoBanco } = jest.requireActual('@/lib/atendimentos-ia/repositorio') as { ErroDoBanco: new (e: { message?: string; code?: string }) => Error }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = () => require('@/pages/api/super-admin/atendimentos-ia/catalogo/remover') as { default: (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>; config: { maxDuration: number }; ARRASTO_ILEGIVEL: string }
async function chamar(method: string, query: object = {}, body?: unknown) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
    await rota().default({ cookies: { token: 't' }, method, query, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}
const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(() => {
    perfil = SUPER
    repo.medirArrastoDoCatalogo.mockReset().mockImplementation(async () => arrasto())
    repo.removerDoCatalogo.mockReset().mockImplementation(async () => ({ ...arrasto(), removido: true }))
})
const PEDIDO = { tipo: 'fornecedor', chave: W, assinatura: A, confirmo: true }

describe('(4) a rota catalogo/remover', () => {
    it('GET mede, sem chamar a remoção', async () => {
        expect(await chamar('GET', { tipo: 'fornecedor', chave: W })).toEqual({ status: 200, json: arrasto() })
        expect(repo.medirArrastoDoCatalogo).toHaveBeenCalledWith({ tipo: 'fornecedor', chave: W })
        expect(repo.removerDoCatalogo).not.toHaveBeenCalled()
    })
    it('GET com tipo ou chave fora da forma é 400, sem ler o banco', async () => {
        expect(await chamar('GET', { tipo: 'nicho', chave: W })).toEqual({ status: 400, json: { error: TIPO_DESCONHECIDO } })
        expect(await chamar('GET', { tipo: 'familia', chave: 'pvc minúsculo' })).toEqual({ status: 400, json: { error: CHAVE_INVALIDA } })
        expect(await chamar('GET', { tipo: 'tabela', chave: 'PVC' })).toEqual({ status: 400, json: { error: CHAVE_INVALIDA } })
        expect(repo.medirArrastoDoCatalogo).not.toHaveBeenCalled()
    })
    it('GET: a medição em forma errada é 500 com a frase (nunca um arrasto vazio); P0002 é 404', async () => {
        repo.medirArrastoDoCatalogo.mockResolvedValueOnce({ passos: [] })
        expect(await chamar('GET', { tipo: 'motor', chave: W })).toEqual({ status: 500, json: { error: rota().ARRASTO_ILEGIVEL } })
        repo.medirArrastoDoCatalogo.mockRejectedValueOnce(new ErroDoBanco({ code: 'P0002', message: 'o item do catalogo nao existe' }))
        expect(await chamar('GET', { tipo: 'motor', chave: W })).toEqual({ status: 404, json: { error: ITEM_INEXISTENTE } })
    })
    it('POST sem a confirmação explícita é 400, e nada é chamado', async () => {
        expect(await chamar('POST', {}, { ...PEDIDO, confirmo: false })).toEqual({ status: 400, json: { error: CONFIRMACAO_OBRIGATORIA } })
        expect(repo.removerDoCatalogo).not.toHaveBeenCalled()
        expect(repo.medirArrastoDoCatalogo).not.toHaveBeenCalled()
    })
    it('POST confirmado: SÓ a remoção, com o autor da SESSÃO, o tipo, a chave e a assinatura mostrada', async () => {
        const r = await chamar('POST', {}, PEDIDO)
        expect(r.status).toBe(200)
        expect(r.json.removido).toBe(true)
        expect(repo.removerDoCatalogo).toHaveBeenCalledWith({ por: SUPER.id, tipo: 'fornecedor', chave: W, assinatura: A })
        expect(repo.medirArrastoDoCatalogo).not.toHaveBeenCalled()
    })
    it('o arrasto MUDOU (40001): 409 com a frase e o arrasto NOVO, medido de novo', async () => {
        repo.removerDoCatalogo.mockRejectedValueOnce(new ErroDoBanco({ code: '40001', message: 'o arrasto mudou' }))
        repo.medirArrastoDoCatalogo.mockResolvedValueOnce(arrasto({ sai: 4, assinatura: 'f'.repeat(32) }))
        const r = await chamar('POST', {}, PEDIDO)
        expect(r.status).toBe(409)
        expect(r.json.error).toContain('O que sai mudou desde que foi mostrado')
        expect(r.json.arrasto).toEqual(arrasto({ sai: 4, assinatura: 'f'.repeat(32) }))
    })
    it('o impedimento (23505): 409 com a frase do impedimento, medida de novo', async () => {
        const imp = { tipo: 'vigentes_sem_familia' as const, fornecedor: 'IMAB', categoria: 'FERRAGENS', tabelas: [{ id: T1, arquivo: 'a.xlsx' }, { id: W, arquivo: 'b.xlsx' }] }
        repo.removerDoCatalogo.mockRejectedValueOnce(new ErroDoBanco({ code: '23505', message: 'a remocao esta impedida' }))
        repo.medirArrastoDoCatalogo.mockResolvedValueOnce(arrasto({ tipo: 'familia', chave: 'PVC', impedimentos: [imp] }))
        const r = await chamar('POST', {}, { ...PEDIDO, tipo: 'familia', chave: 'PVC' })
        expect(r.status).toBe(409)
        expect(r.json.error).toBe(`Nada foi removido. ${fraseDoImpedimento(imp)}`)
    })
    it('P0002 → 404; 42501 → 403; o tempo (57014) → 504 dizendo que nada saiu; outro → 500 sem o texto do banco', async () => {
        const casos: Array<[string, number, string]> = [
            ['P0002', 404, ITEM_INEXISTENTE], ['42501', 403, 'Só o super admin remove do catálogo.'], ['57014', 504, REMOCAO_PASSOU_DO_TEMPO],
            ['23503', 500, 'Não foi possível remover do catálogo. Nada foi removido.'],
        ]
        for (const [code, status, error] of casos) {
            repo.removerDoCatalogo.mockRejectedValueOnce(new ErroDoBanco({ code, message: 'segredo do banco' }))
            expect(await chamar('POST', {}, PEDIDO)).toEqual({ status, json: { error } })
        }
    })
    it('só o super admin; outro método é 405', async () => {
        perfil = ADMIN
        expect((await chamar('GET', { tipo: 'fornecedor', chave: W })).status).toBe(403)
        expect((await chamar('POST', {}, PEDIDO)).status).toBe(403)
        expect(repo.medirArrastoDoCatalogo).not.toHaveBeenCalled()
        expect(repo.removerDoCatalogo).not.toHaveBeenCalled()
        perfil = SUPER
        expect((await chamar('DELETE', { tipo: 'fornecedor', chave: W })).status).toBe(405)
    })
})

// ── (5) a TELA da confirmação ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Componente = () => require('@/page-parts/atendimentos-ia/remocao-do-catalogo.component') as typeof import('@/page-parts/atendimentos-ia/remocao-do-catalogo.component')
const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } document.body.innerHTML = '' })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montarAConfirmacao(resposta: { status: number; body: unknown }) {
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: resposta.status < 400, status: resposta.status, json: async () => resposta.body }) as Response)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(React.createElement(Componente().RemocaoDoCatalogo, { alvo: { tipo: 'familia', chave: 'PVC', nome: 'PVC Wolf' }, onFechar: () => {}, onRemovido: () => {} })) })
    await assentar()
    return document.body.querySelector('[data-remocao-do-catalogo]') as HTMLElement
}
const botaoRemover = () => Array.from(document.body.querySelectorAll('.ant-modal-footer button')).find((b) => b.textContent?.replace(/\s/g, '') === 'Remover') as HTMLButtonElement

describe('(5) a tela da confirmação', () => {
    it('mede ao abrir, pela rota do tipo e da chave', async () => {
        await montarAConfirmacao({ status: 200, body: arrasto({ tipo: 'familia', chave: 'PVC' }) })
        expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(rotaDoArrasto('familia', 'PVC'))
    })
    it('o IMPEDIMENTO aparece como erro, e a caixa e o Remover ficam desligados', async () => {
        const imp = { tipo: 'vigentes_sem_familia', fornecedor: 'IMAB', categoria: 'FERRAGENS', tabelas: [{ id: T1, arquivo: 'a.xlsx' }, { id: W, arquivo: 'b.xlsx' }] }
        const remocao = await montarAConfirmacao({ status: 200, body: arrasto({ tipo: 'familia', chave: 'PVC', impedimentos: [imp as never] }) })
        expect(remocao.querySelector('[data-impedimento]')!.textContent).toContain('arquive ou tire a vigência de uma delas')
        expect((remocao.querySelector('[data-confirmo-o-arrasto] input') as HTMLInputElement).disabled).toBe(true)
        expect(botaoRemover().disabled).toBe(true)
    })
    it('a falha de leitura é ERRO com a frase da rota, e nada se mostra como arrasto', async () => {
        const remocao = await montarAConfirmacao({ status: 500, body: { error: 'Não foi possível medir o que sai.' } })
        expect(remocao.querySelector('[data-erro-da-remocao]')!.textContent).toContain('Não foi possível medir o que sai.')
        expect(remocao.querySelector('[data-resumo-do-arrasto]')).toBeNull()
        expect(botaoRemover().disabled).toBe(true)
    })
    it('a resposta em forma errada também é ERRO, nunca "nada sai"', async () => {
        const remocao = await montarAConfirmacao({ status: 200, body: { passos: [] } })
        expect(remocao.querySelector('[data-erro-da-remocao]')!.textContent).toContain(Componente().ARRASTO_NAO_LIDO)
        expect(remocao.querySelector('[data-resumo-do-arrasto]')).toBeNull()
    })
})

// ── (6) a paridade com a migração ─────────────────────────────────────────────────────────────
describe('(6) o que liga o código à migração 20261031000003', () => {
    const MIG = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20261031000003_catalogo_soberano.sql'), 'utf8')
    const REPO = jest.requireActual('fs').readFileSync(path.join(__dirname, '../../lib/atendimentos-ia/repositorio.ts'), 'utf8') as string
    const ROTULOS = fs.readFileSync(path.join(__dirname, '../atendimentos-ia-remocao.ts'), 'utf8')

    it('as duas funções, com os parâmetros que o repositório manda', () => {
        expect(MIG).toContain('CREATE OR REPLACE FUNCTION public.superadmin_arrasto_do_catalogo(p_tipo text, p_chave text) RETURNS jsonb')
        expect(MIG).toContain('CREATE OR REPLACE FUNCTION public.superadmin_remover_do_catalogo(p_por uuid, p_tipo text, p_chave text, p_assinatura text) RETURNS jsonb')
        expect(REPO).toContain("rpc('superadmin_arrasto_do_catalogo', { p_tipo: a.tipo, p_chave: a.chave })")
        expect(REPO).toContain("rpc('superadmin_remover_do_catalogo', { p_por: a.por, p_tipo: a.tipo, p_chave: a.chave, p_assinatura: a.assinatura })")
    })
    it('os tipos de aviso e de impedimento que a tela lê são os que a função escreve', () => {
        for (const t of ["'tipo', 'conversa_para'", "'tipo', 'renumeracao'", "'tipo', 'vigentes_sem_familia'"]) expect(MIG).toContain(t)
    })
    it('cada tabela que um passo alcança tem rótulo com acento na tela (o conteúdo do motor pelo prefixo)', () => {
        const tabelas = [...new Set([...MIG.matchAll(/'t', '(orcamentista_[a-z_]+)'/g)].map((m) => m[1]))]
        expect(tabelas.length).toBeGreaterThan(10)
        const sem = tabelas.filter((t) => !ROTULOS.includes(`'${t}:`))
        expect(sem).toEqual([]) // o conteúdo do motor (as 13 tabelas) entra pelo array, não por 't', literal
    })
    it('a rota espera mais que o tempo da função (80 s)', () => {
        expect(MIG).toContain("SET statement_timeout = '80s'")
        expect(rota().config.maxDuration).toBeGreaterThan(80)
    })
})

describe('(7) o que liga o código à migração 20261101000001 — a tabela, a quinta raiz (01/11/2026)', () => {
    const MIG = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20261101000001_tabela_na_soberania.sql'), 'utf8')
    const ROTULOS = fs.readFileSync(path.join(__dirname, '../atendimentos-ia-remocao.ts'), 'utf8')

    it('os tipos que a tela manda são os que a função aceita: a etapa à parte e os quatro da lista', () => {
        expect(MIG).toContain("IF p_tipo = 'etapa' THEN")
        const lista = /IF p_tipo NOT IN \(([^)]*)\) THEN/.exec(MIG)
        expect(lista).not.toBeNull()
        const daFuncao = ['etapa', ...[...lista![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1])].sort()
        expect([...TIPOS_DE_REMOCAO].sort()).toEqual(daFuncao)
    })
    it('o conjunto da tabela é a própria tabela, e nenhum motor', () => {
        expect(MIG).toContain("ELSIF p_tipo = 'tabela' THEN")
        expect(MIG).toContain('IF nome IS NOT NULL THEN tabelas := ARRAY[p_chave::uuid]; END IF;')
    })
    it('cada tabela que um passo alcança tem rótulo com acento na tela', () => {
        const tabelas = [...new Set([...MIG.matchAll(/'t', '(orcamentista_[a-z_]+)'/g)].map((m) => m[1]))]
        expect(tabelas.length).toBeGreaterThan(10)
        expect(tabelas.filter((t) => !ROTULOS.includes(`'${t}:`))).toEqual([])
    })
    it('o título da confirmação nomeia a tabela', () => {
        expect(tituloDaRemocao('tabela', 'Perfis_de_PVC_-_Wolff.xlsx')).toBe('Remover a tabela "Perfis_de_PVC_-_Wolff.xlsx"?')
    })
})
