/**
 * PORTÃO — os NICHOS SEMEADOS no seletor, e a DATA na borda direita (bloco 2B.2).
 *
 *   (a) com os nichos da semente (`20261019000003`, LIDOS DO ARQUIVO da migração, não copiados à
 *       mão), o seletor vem AGRUPADO POR MODELO — Fabricação, Revenda, Prestação de serviço, nessa
 *       ordem — com os quatro de cada um;
 *   (b) com eles, o seletor NÃO aparece vazio; sem nenhum, diz "Nenhum nicho cadastrado" — o
 *       contraste, para o caso não passar com um placeholder fixo;
 *   (c) na lista do credenciamento, a data é um elemento PRÓPRIO, alinhado à direita e em
 *       `tabular-nums`, e não um pedaço do texto do arquivo;
 *   (d) na lista de tabelas do fornecedor, a coluna "Subido em" é alinhada à direita, no mesmo
 *       estilo.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as fs from 'fs'
import * as path from 'path'

import { MODELOS, ROTAS_DO_CATALOGO, type FornecedorComTabelas, type Modelo, type Nicho } from '@/utils/atendimentos-ia-catalogo'
import { NichoSelect, PLACEHOLDER_COM_NICHO, PLACEHOLDER_SEM_NICHO, gruposDoSeletor } from '@/page-parts/atendimentos-ia/nicho-select.component'
import { LinhaDaTabela } from '@/page-parts/atendimentos-ia/linha-da-tabela.component'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/', asPath: '/', query: { id: 'f1' }, replace: () => {}, push: () => {} }) }))
jest.mock('@/hooks/use-auth.hook', () => ({ useAuth: () => ({ currentUser: { id: 'u-super', is_super_admin: true, role: 'super_admin' } }) }))
jest.mock('@/components/layout/layout.component', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

/** Os nichos da semente, lidos do arquivo da migração — a fonte, não uma cópia. */
function nichosDaSemente(): Nicho[] {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20261019000003_nichos_iniciais.sql'), 'utf8')
    const ini = sql.indexOf('INSERT INTO public.orcamentista_nicho')
    // O `ON CONFLICT` DEPOIS do INSERT: o cabeçalho do arquivo também o cita, e um corte a partir
    // dele devolveria zero nichos.
    const corpo = sql.slice(ini, sql.indexOf('ON CONFLICT', ini))
    return [...corpo.matchAll(/\('(FABRICACAO|REVENDA|SERVICO)',\s*'([^']+)',\s*NULL\)/g)].map((m, i) => ({
        id: `n${i}`, modelo: m[1] as Modelo, nome: m[2], ativo: true,
    }))
}

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
async function montar(no: React.ReactElement): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library; fora do act o render não assenta
    await act(async () => { root.render(no) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    return host
}

describe('os nichos semeados no seletor', () => {
    const semente = nichosDaSemente()

    it('o leitor alcança a semente: 12 nichos, 4 por modelo', () => {
        expect(semente).toHaveLength(12)
        for (const m of MODELOS) expect(semente.filter((n) => n.modelo === m)).toHaveLength(4)
    })

    it('(a) o seletor vem AGRUPADO POR MODELO, na ordem dos modelos, com os quatro de cada um', () => {
        const grupos = gruposDoSeletor(semente)
        expect(grupos.map((g) => g.label)).toEqual(['Fabricação', 'Revenda', 'Prestação de serviço'])
        expect(grupos.map((g) => g.options.map((o) => o.label))).toEqual([
            ['Esquadrias', 'Móveis personalizados', 'Marcenaria', 'Serralheria'],
            ['Materiais de construção', 'Loja de roupas', 'Autopeças', 'Distribuidora'],
            ['Mecânicas', 'Salões de beleza', 'Assistência técnica', 'Manutenção predial'],
        ])
    })

    it('(b) com a semente o seletor não aparece vazio; sem nicho nenhum, diz que não há', async () => {
        const com = await montar(<NichoSelect nichos={semente} onChange={() => {}} />)
        expect(com.querySelector('.ant-select-selection-placeholder')?.textContent).toBe(PLACEHOLDER_COM_NICHO)
        const sem = await montar(<NichoSelect nichos={[]} onChange={() => {}} />)
        expect(sem.querySelector('.ant-select-selection-placeholder')?.textContent).toBe(PLACEHOLDER_SEM_NICHO)
    })
})

describe('a data na borda direita', () => {
    it('(c) na lista do credenciamento, a data é elemento próprio, à direita, em tabular-nums', async () => {
        const host = await montar(<LinhaDaTabela arquivo="ExportWWEsquadria (1).xlsx" motor="Motor_Medidas_por_Barra_Wolff.xlsx" data="19/10/26" />)
        const arquivos = host.querySelector('[data-linha="arquivos"]') as HTMLElement
        const data = host.querySelector('[data-linha="data"]') as HTMLElement
        expect(arquivos.textContent).toBe('ExportWWEsquadria (1).xlsx · motor: Motor_Medidas_por_Barra_Wolff.xlsx')
        expect(arquivos.textContent).not.toContain(data.textContent as string)
        expect(data.textContent).toBe('19/10/26')
        expect(data.style.fontVariantNumeric).toBe('tabular-nums')
        expect(data.style.textAlign).toBe('right')
        expect(data.style.marginLeft).toBe('auto')
        // O contêiner é flex: é ele que empurra a data para a borda.
        expect((data.parentElement as HTMLElement).style.display).toBe('flex')
    })

    it('(d) na lista de tabelas do fornecedor, "Subido em" vem alinhada à direita, em tabular-nums', async () => {
        const fornecedor: FornecedorComTabelas = {
            id: 'f1', nome: 'Alumínio Sul', nicho_id: 'n0', nicho_nome: 'Esquadrias', modelo: 'FABRICACAO', tabelas: 1, contas_usando: [], categorias_das_tabelas: [], familias_do_perfil: [] as string[],
            tabelas_da_lista: [{ id: 't1', fornecedor_id: 'f1', arquivo_nome: 't.xlsx', arquivo_path: 'f1/arquivo/t.xlsx', motor_nome: 'm.pdf', motor_path: 'f1/motor/m.pdf', vigencia: null, familia: null, categoria_chave: null, vigente: false, criado_em: '2026-10-19T12:00:00Z', contas_usando: [] }],
        }
        const respostas: Record<string, unknown> = { [ROTAS_DO_CATALOGO.fornecedor('f1')]: fornecedor, [ROTAS_DO_CATALOGO.nichos]: [], [ROTAS_DO_CATALOGO.familias]: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }], [ROTAS_DO_CATALOGO.categorias]: [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }] }
        ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => respostas[url] }) as Response)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Pagina = require('@/pages/super-admin/atendimentos-ia/fornecedores/[id]').default as React.ComponentType
        const host = await montar(<Pagina />)
        const celula = host.querySelector('[data-coluna="subido-em"]') as HTMLElement
        expect(celula).not.toBeNull()
        expect(celula.style.fontVariantNumeric).toBe('tabular-nums')
        const td = celula.closest('td') as HTMLElement
        expect(td.style.textAlign).toBe('right')
    })
})
