/**
 * PORTÃO — a tela da base de conhecimento LÊ as RAMIFICAÇÕES da família (`orcamentista_familia_ramificacao`) em vez
 * da lista fixa do catálogo (dono do produto, 27/10/2026; PR B).
 *
 * POR QUÊ: o catálogo de categorias é a lista de TODAS as possíveis; cada família declara as que usa ("o alumínio não
 * tem reforço metálico"). A matéria-prima tem a sua família, e é ela que escolhe o que a tela mostra.
 *
 * O que este portão fica vermelho:
 *   (1) as categorias de uma matéria-prima são as ramificações da FAMÍLIA dela, na ordem DA FAMÍLIA — não a do catálogo;
 *   (2) sem família: todas as do catálogo, e a tela AVISA (nunca finge que a lista é a da família);
 *   (3) família que não declara ramificação: o aviso, e só o que tem dado gravado;
 *   (4) categoria que a família não declara mas TEM DADO GRAVADO continua na tela, dita — nada gravado some;
 *   (5) a família se escolhe da lista, pela rota própria, na hora; travada com alteração pendente; a recusa aparece
 *       NA matéria-prima; matéria-prima ainda não salva não escolhe família;
 *   (6) o formulário e o `depois` do salvar guardam a família.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
    arvoreDoDepois, categoriasDaMateriaPrima, categoriasForaDaFamilia, categoriaTemConteudo, familiaDeclaraRamificacao, formularioDaArvore, novaMateriaPrima,
    type ArvoreLida, type EstadoDaArvore,
} from '@/page-parts/atendimentos-ia/base-de-conhecimento/arvore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

type Linha = Record<string, unknown>
const CONTA = '00000000-0000-4000-8000-0000000000a1'
const MP_PVC = 'mp-pvc'
const MP_ALU = 'mp-alu'
const MP_SEM = 'mp-sem'
const MP_VAZIA = 'mp-vazia'

// o catálogo, EMBARALHADO: a ordem é `ordem`
const CATEGORIAS = [
    { chave: 'VIDRO', ordem: 5, rotulo: 'Vidro' }, { chave: 'PERFIL', ordem: 1, rotulo: 'Perfil' }, { chave: 'REFORCO', ordem: 2, rotulo: 'Reforço de aço' },
    { chave: 'FERRAGENS', ordem: 3, rotulo: 'Ferragens' }, { chave: 'ACESSORIOS_VEDACAO', ordem: 4, rotulo: 'Acessórios e vedação' }, { chave: 'INSTALACAO', ordem: 6, rotulo: 'Instalação' },
]
/** A PVC declara todas, mas o VIDRO vem ANTES do PERFIL — a ordem é da família, não a do catálogo. O alumínio não tem reforço. */
const RAMIFICACOES = [
    { familia: 'PVC', categoria_chave: 'VIDRO', ordem: 1 }, { familia: 'PVC', categoria_chave: 'PERFIL', ordem: 2 }, { familia: 'PVC', categoria_chave: 'REFORCO', ordem: 3 },
    { familia: 'PVC', categoria_chave: 'FERRAGENS', ordem: 4 }, { familia: 'PVC', categoria_chave: 'ACESSORIOS_VEDACAO', ordem: 5 }, { familia: 'PVC', categoria_chave: 'INSTALACAO', ordem: 6 },
    { familia: 'ALUMINIO', categoria_chave: 'PERFIL', ordem: 1 }, { familia: 'ALUMINIO', categoria_chave: 'VIDRO', ordem: 2 },
]
const FAMILIAS = [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }, { chave: 'PORTAS', rotulo: 'Portas de ACM', ordem: 3 }]

const cat = (mp: string, chave: string, resto: Linha = {}): Linha => ({ id: `${mp}-${chave}`, materia_prima_id: mp, categoria_chave: chave, config: null, fornecedores: [], ...resto })
const todas = (mp: string, extra: Record<string, Linha> = {}) => CATEGORIAS.map((c) => cat(mp, c.chave, extra[c.chave] ?? {}))

function arvore(): ArvoreLida {
    return {
        tenant_id: CONTA, nicho: null,
        catalogo: { categorias: CATEGORIAS, campos: [], familias: FAMILIAS, ramificacoes: RAMIFICACOES },
        fornecedores_do_nicho: [], linhas_por_fornecedor: {},
        materias_primas: [
            { id: MP_PVC, nome: 'Esquadrias de PVC', ordem: 1, familia: 'PVC', categorias: todas(MP_PVC) },
            // o alumínio tem REFORCO com dado gravado, mesmo sem a família declarar: ele NÃO some
            { id: MP_ALU, nome: 'Alumínio', ordem: 2, familia: 'ALUMINIO', categorias: todas(MP_ALU, { REFORCO: { config: { usa: true } } }) },
            { id: MP_SEM, nome: 'Sem família', ordem: 3, familia: null, categorias: todas(MP_SEM) },
            // família que ainda não declara ramificação
            { id: MP_VAZIA, nome: 'Portas', ordem: 4, familia: 'PORTAS', categorias: todas(MP_VAZIA, { FERRAGENS: { config: { x: 1 } } }) },
        ],
    }
}
const chaves = (cs: Array<{ chave: string }>) => cs.map((c) => c.chave)

describe('(1)(2)(3)(4) as categorias da matéria-prima: as ramificações da família', () => {
    it('com família: as que ela declara, NA ORDEM DELA — o VIDRO antes do PERFIL — e não a do catálogo', () => {
        expect(chaves(categoriasDaMateriaPrima(arvore().catalogo, 'PVC'))).toEqual(['VIDRO', 'PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'INSTALACAO'])
    })

    it('o alumínio declara duas: só elas, sem o reforço', () => {
        expect(chaves(categoriasDaMateriaPrima(arvore().catalogo, 'ALUMINIO'))).toEqual(['PERFIL', 'VIDRO'])
    })

    it('sem família (null, undefined ou vazia): TODAS as do catálogo, na ordem dele', () => {
        for (const f of [null, undefined, '']) expect(chaves(categoriasDaMateriaPrima(arvore().catalogo, f))).toEqual(['PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO'])
    })

    it('catálogo sem ramificações na resposta (servidor antigo): com família, só o que tem dado; sem família, todas', () => {
        const { ramificacoes: _fora, ...sem } = arvore().catalogo
        expect(chaves(categoriasDaMateriaPrima(sem, 'PVC', ['REFORCO']))).toEqual(['REFORCO'])
        expect(chaves(categoriasDaMateriaPrima(sem, null))).toHaveLength(6)
    })

    it('categoria que a família NÃO declara mas tem dado gravado continua, DEPOIS das declaradas', () => {
        expect(chaves(categoriasDaMateriaPrima(arvore().catalogo, 'ALUMINIO', ['REFORCO', 'FERRAGENS']))).toEqual(['PERFIL', 'VIDRO', 'REFORCO', 'FERRAGENS'])
    })

    it('uma categoria declarada que o catálogo não tem some em silêncio? NÃO: o catálogo é a fonte, e a ramificação sem categoria não vira card', () => {
        const c = arvore().catalogo
        const mexido = { ...c, ramificacoes: [...(c.ramificacoes ?? []), { familia: 'ALUMINIO', categoria_chave: 'INEXISTENTE', ordem: 9 }] }
        expect(chaves(categoriasDaMateriaPrima(mexido, 'ALUMINIO'))).toEqual(['PERFIL', 'VIDRO'])
    })

    it('a família declara ramificação? (e a que não declara nenhuma)', () => {
        expect(familiaDeclaraRamificacao(arvore().catalogo, 'PVC')).toBe(true)
        expect(familiaDeclaraRamificacao(arvore().catalogo, 'PORTAS')).toBe(false)
    })

    it('as categorias mostradas que a família não declara: só quando ela declara alguma', () => {
        expect(categoriasForaDaFamilia(arvore().catalogo, 'ALUMINIO', ['PERFIL', 'VIDRO', 'REFORCO'])).toEqual(['REFORCO'])
        expect(categoriasForaDaFamilia(arvore().catalogo, 'PORTAS', ['FERRAGENS'])).toEqual([])
        expect(categoriasForaDaFamilia(arvore().catalogo, null, ['FERRAGENS'])).toEqual([])
    })

    it('"tem conteúdo": config, fornecedor ou item de lista — a categoria vazia não conta', () => {
        const base = cat('m', 'PERFIL') as never
        expect(categoriaTemConteudo(base)).toBe(false)
        expect(categoriaTemConteudo({ ...(base as object), config: {} } as never)).toBe(true)
        expect(categoriaTemConteudo({ ...(base as object), fornecedores: [{}] } as never)).toBe(true)
        expect(categoriaTemConteudo({ ...(base as object), vidros: [{}] } as never)).toBe(true)
        expect(categoriaTemConteudo({ ...(base as object), ferragens: [{}] } as never)).toBe(true)
        expect(categoriaTemConteudo({ ...(base as object), instalacao: [{}] } as never)).toBe(true)
        expect(categoriaTemConteudo({ ...(base as object), vidros: [] } as never)).toBe(false)
    })
})

describe('(6) o formulário guarda a família, e o `depois` do salvar também', () => {
    it('cada matéria-prima do formulário tem as categorias da SUA família, e a família', () => {
        const f = formularioDaArvore(arvore())
        const de = (id: string) => f.materias.find((m) => m.id === id)!
        expect(de(MP_PVC).familia).toBe('PVC')
        expect(chaves(de(MP_PVC).categorias)).toEqual(['VIDRO', 'PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'INSTALACAO'])
        expect(chaves(de(MP_ALU).categorias)).toEqual(['PERFIL', 'VIDRO', 'REFORCO'])
        expect(chaves(de(MP_SEM).categorias)).toEqual(['PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO'])
        expect(de(MP_SEM).familia).toBeNull()
        expect(chaves(de(MP_VAZIA).categorias)).toEqual(['FERRAGENS'])
    })

    it('matéria-prima nova: sem família, com todas as categorias do catálogo', () => {
        const nova = novaMateriaPrima(arvore().catalogo)
        expect(nova.familia).toBeNull()
        expect(chaves(nova.categorias)).toEqual(['PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO'])
    })

    it('o `depois` da função sem a coluna família: vale a que a tela já tinha — nunca "não informada" por esquecimento', () => {
        const a = arvore()
        const depois = {
            orcamentista_materia_prima: [{ id: MP_PVC, nome: 'Esquadrias de PVC', ordem: 1 }],
            orcamentista_mp_categoria: [cat(MP_PVC, 'PERFIL')],
        }
        expect(arvoreDoDepois(depois, a).materias_primas[0].familia).toBe('PVC')
    })

    it('o `depois` COM a família: vale a do banco, inclusive null', () => {
        const a = arvore()
        const com = (familia: string | null) => ({ orcamentista_materia_prima: [{ id: MP_PVC, nome: 'x', ordem: 1, familia }], orcamentista_mp_categoria: [] as Linha[] })
        expect(arvoreDoDepois(com('ALUMINIO'), a).materias_primas[0].familia).toBe('ALUMINIO')
        expect(arvoreDoDepois(com(null), a).materias_primas[0].familia).toBeNull()
    })
})

// ═══ a tela ═══════════════════════════════════════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Cartao = () => require('@/page-parts/atendimentos-ia/base-de-conhecimento/materias-primas.component').MateriasPrimas as React.ComponentType<Record<string, unknown>>

const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })

type Opcoes = { pendente?: boolean; erroDaFamilia?: { materiaPrimaId: string; mensagem: string } | null; semAcao?: boolean; arvore?: ArvoreLida; estadoInicial?: EstadoDaArvore }
async function montar(o: Opcoes = {}) {
    const a = o.arvore ?? arvore()
    const chamadas: Array<[string, string | null]> = []
    function Casca() {
        const [estado, setEstado] = React.useState<EstadoDaArvore>(o.estadoInicial ?? formularioDaArvore(a))
        const C = Cartao()
        return React.createElement(C, {
            arvore: a, erroAoLer: null, estado, mudar: (f: (e: EstadoDaArvore) => EstadoDaArvore) => setEstado(f), erros: [], erroDaRota: null, naoEnviado: null,
            ...(o.semAcao ? {} : { aoMudarAFamilia: async (id: string, familia: string | null) => { chamadas.push([id, familia]) } }),
            familiaTravada: o.pendente === true, erroDaFamilia: o.erroDaFamilia ?? null,
        })
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(React.createElement(Casca)) })
    await assentar()
    return { host, chamadas }
}
const bloco = (host: ParentNode, n: number) => host.querySelector(`[data-materia-prima="${n}"]`) as HTMLElement
const categoriasDo = (host: ParentNode, n: number) => Array.from(bloco(host, n).querySelectorAll('[data-categoria]')).map((c) => c.getAttribute('data-categoria'))

describe('(1)(2)(3)(4) a tela mostra o que a família declara', () => {
    it('cada matéria-prima: as categorias DA SUA FAMÍLIA, na ordem dela', async () => {
        const { host } = await montar()
        expect(categoriasDo(host, 0)).toEqual(['VIDRO', 'PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'INSTALACAO'])
        expect(categoriasDo(host, 1)).toEqual(['PERFIL', 'VIDRO', 'REFORCO'])
        expect(categoriasDo(host, 3)).toEqual(['FERRAGENS'])
    })

    it('o "N de M categorias" conta as MOSTRADAS, não as do catálogo', async () => {
        const { host } = await montar()
        expect(bloco(host, 1).querySelector('[data-categorias-configuradas]')?.textContent).toMatch(/de 3 categorias$/)
        expect(bloco(host, 0).querySelector('[data-categorias-configuradas]')?.textContent).toMatch(/de 6 categorias$/)
    })

    it('sem família: o aviso, e todas as categorias', async () => {
        const { host } = await montar()
        expect(bloco(host, 2).querySelector('[data-sem-familia]')?.textContent).toContain('A família desta matéria-prima não está informada')
        expect(categoriasDo(host, 2)).toHaveLength(6)
        expect(bloco(host, 0).querySelector('[data-sem-familia]')).toBeNull()
    })

    it('família sem ramificação: o aviso nomeia a família, pelo rótulo', async () => {
        const { host } = await montar()
        expect(bloco(host, 3).querySelector('[data-familia-sem-ramificacao]')?.textContent).toContain('A família Portas de ACM ainda não declara ramificações')
        expect(bloco(host, 0).querySelector('[data-familia-sem-ramificacao]')).toBeNull()
    })

    it('a categoria que a família não declara mas tem dado continua, e a tela diz por quê', async () => {
        const { host } = await montar()
        expect(bloco(host, 1).querySelector('[data-categoria-fora-da-familia="REFORCO"]')?.textContent).toContain('Reforço de aço não é ramificação da família desta matéria-prima, mas tem dados gravados')
        expect(bloco(host, 0).querySelector('[data-categoria-fora-da-familia]')).toBeNull()
    })

    it('a mesma lista de categorias é mostrada com o mesmo texto do catálogo (número e rótulo)', async () => {
        const { host } = await montar()
        const titulos = Array.from(bloco(host, 1).querySelectorAll('[data-titulo-da-categoria]')).map((t) => t.textContent)
        expect(titulos).toEqual(['1 · Perfil', '5 · Vidro', '2 · Reforço de aço'])
    })
})

describe('(5) a família se escolhe da lista, pela rota, e só sem pendência', () => {
    const combo = (host: ParentNode, nome: string) => host.querySelector(`[aria-label="Família de ${nome}"]`)?.closest('.ant-select') as HTMLElement | null

    it('o combo mostra a família gravada pelo rótulo, e as opções são as da lista', async () => {
        const { host } = await montar()
        expect(combo(host, 'Esquadrias de PVC')?.querySelector('.ant-select-selection-item')?.textContent).toBe('PVC')
        expect(combo(host, 'Sem família')?.querySelector('.ant-select-selection-placeholder')?.textContent).toBe('Não informada')
        const seletor = combo(host, 'Alumínio')!.querySelector('.ant-select-selector')!
        await act(async () => { seletor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await assentar()
        const opcoes = Array.from(document.body.querySelectorAll('.ant-select-item-option')).map((o) => o.textContent)
        expect(opcoes).toEqual(['PVC', 'Alumínio', 'Portas de ACM'])
    })

    it('escolher uma família chama a rota com a matéria-prima e a chave', async () => {
        const { host, chamadas } = await montar()
        const seletor = combo(host, 'Sem família')!.querySelector('.ant-select-selector')!
        await act(async () => { seletor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await assentar()
        const alu = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find((o) => o.textContent === 'Alumínio') as HTMLElement
        await act(async () => { alu.click() })
        await assentar()
        expect(chamadas).toEqual([[MP_SEM, 'ALUMINIO']])
    })

    it('com alteração pendente: o combo está desligado e a tela diz por quê', async () => {
        const { host } = await montar({ pendente: true })
        expect(combo(host, 'Esquadrias de PVC')?.className).toContain('ant-select-disabled')
        expect(bloco(host, 0).querySelector('[data-familia-travada]')?.textContent).toContain('Salve as alterações antes de trocar a família')
    })

    it('sem pendência: o combo está ligado e o aviso de pendência não aparece', async () => {
        const { host } = await montar()
        expect(combo(host, 'Esquadrias de PVC')?.className).not.toContain('ant-select-disabled')
        expect(bloco(host, 0).querySelector('[data-familia-travada]')).toBeNull()
    })

    it('a recusa aparece NA matéria-prima onde aconteceu, e só nela', async () => {
        const { host } = await montar({ erroDaFamilia: { materiaPrimaId: MP_SEM, mensagem: 'a empresa ja tem outra materia-prima nesta familia: e uma por familia' } })
        expect(bloco(host, 2).querySelector('[data-erro-da-familia]')?.textContent).toContain('a empresa ja tem outra materia-prima nesta familia: e uma por familia')
        expect(bloco(host, 0).querySelector('[data-erro-da-familia]')).toBeNull()
    })

    it('matéria-prima ainda não salva: sem combo — a família se escolhe depois de salvar', async () => {
        const a = arvore()
        const inicial = formularioDaArvore(a)
        inicial.materias.push(novaMateriaPrima(a.catalogo))
        const { host } = await montar({ estadoInicial: inicial })
        expect(bloco(host, 4).querySelector('[data-familia-depois-de-salvar]')?.textContent).toContain('A família se escolhe depois de salvar a matéria-prima.')
        expect(bloco(host, 4).querySelector('[data-familia-da-materia-prima] .ant-select')).toBeNull()
    })

    it('sem a função de gravar (quem monta o cartão não a passou): a família aparece, sem combo', async () => {
        const { host } = await montar({ semAcao: true })
        expect(bloco(host, 0).querySelector('[data-familia-depois-de-salvar]')).toBeTruthy()
        expect(host.querySelector('[aria-label^="Família de"]')).toBeNull()
    })

    it('catálogo sem famílias na resposta (servidor antigo): nenhum bloco de família, e a lista de categorias é a de antes', async () => {
        const a = arvore()
        const { familias: _f, ramificacoes: _r, ...catalogo } = a.catalogo
        const { host } = await montar({ arvore: { ...a, catalogo, materias_primas: a.materias_primas.map((m) => ({ ...m, familia: undefined })) } })
        expect(host.querySelector('[data-familia-da-materia-prima]')).toBeNull()
        expect(categoriasDo(host, 0)).toHaveLength(6)
    })
})
