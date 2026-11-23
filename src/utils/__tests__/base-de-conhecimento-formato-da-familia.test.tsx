/**
 * PORTÃO — o FORMATO da família (dono do produto, 23/11/2026; migração 20261123000001): "o formato é carregado pela FAMÍLIA, e a escolha
 * entre principal e secundário acontece na tela da família". O principal é o modelo da conta (`orcamentista_config.modelo`); o
 * secundário é o outro. A conta não ganha coluna.
 *
 * O que este portão fica vermelho:
 *   (1) as opções: o principal primeiro, nomeado pelo modelo da conta; sem modelo conhecido, só os nomes (nunca um principal inventado);
 *   (2) o corpo da rota: FABRICACAO ou REVENDA, normalizado; null não limpa;
 *   (3) o formulário e o `depois` guardam o formato; AUSENTE (sem a migração) continua ausente — nunca vira null nem o principal;
 *   (4) a tela: o seletor só com a migração e a matéria-prima gravada; "não escolhido" é aviso; travado com pendência; a recusa NA matéria-prima;
 *       escolher chama a rota com a matéria-prima e o formato.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
    FORMATO_COM_PENDENCIA, FORMATO_NAO_ESCOLHIDO, formatoPrincipal, lerCorpoDoFormatoDaMateriaPrima, opcoesDoFormato,
} from '@/lib/atendimentos-ia/base-de-conhecimento'
import { arvoreDoDepois, formularioDaArvore, novaMateriaPrima, type ArvoreLida, type EstadoDaArvore } from '@/page-parts/atendimentos-ia/base-de-conhecimento/arvore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

type Linha = Record<string, unknown>
const MP_A = '11111111-1111-4111-8111-111111111111'
const MP_B = '22222222-2222-4222-8222-222222222222'
const MP_C = '33333333-3333-4333-8333-333333333333'
const CATEGORIAS = [{ chave: 'PERFIL', ordem: 1, rotulo: 'Perfil' }]
const FAMILIAS = [{ chave: 'PVC', rotulo: 'PVC Wolf', ordem: 1 }]

function arvore(modelo: string | null | undefined = 'FABRICACAO', comFormato = true): ArvoreLida {
    const f = (formato: string | null) => (comFormato ? { formato } : {})
    return {
        tenant_id: 't', nicho: null, ...(modelo === undefined ? {} : { modelo_da_conta: modelo }),
        catalogo: { categorias: CATEGORIAS, campos: [], familias: FAMILIAS, ramificacoes: [] },
        fornecedores_do_nicho: [], linhas_por_fornecedor: {},
        materias_primas: [
            { id: MP_A, nome: 'PVC fabricado', ordem: 1, familia: 'PVC', ...f('FABRICACAO'), categorias: [] },
            { id: MP_B, nome: 'PVC revenda', ordem: 2, familia: 'PVC', ...f('REVENDA'), categorias: [] },
            { id: MP_C, nome: 'Sem formato', ordem: 3, familia: 'PVC', ...f(null), categorias: [] },
        ],
    }
}

describe('(1) as opções do seletor: o principal é o modelo da conta', () => {
    it('conta FABRICACAO: Principal (Fabricação) primeiro, Secundário (Revenda) depois', () => {
        expect(opcoesDoFormato('FABRICACAO')).toEqual([
            { value: 'FABRICACAO', label: 'Principal (Fabricação)' }, { value: 'REVENDA', label: 'Secundário (Revenda)' },
        ])
    })
    it('conta REVENDA: a revenda é a principal', () => {
        expect(opcoesDoFormato('REVENDA')).toEqual([
            { value: 'REVENDA', label: 'Principal (Revenda)' }, { value: 'FABRICACAO', label: 'Secundário (Fabricação)' },
        ])
    })
    it.each([[null], [undefined], ['SERVICO'], ['fabricacao']])('modelo %p: nenhum principal inventado — só os nomes', (m) => {
        expect(formatoPrincipal(m)).toBeNull()
        expect(opcoesDoFormato(m)).toEqual([{ value: 'FABRICACAO', label: 'Fabricação' }, { value: 'REVENDA', label: 'Revenda' }])
    })
})

describe('(2) o corpo da rota', () => {
    it('normaliza espaço e caixa', () => {
        expect(lerCorpoDoFormatoDaMateriaPrima({ materia_prima: MP_A, formato: ' revenda ' })).toEqual({ materia_prima: MP_A, formato: 'REVENDA', erros: [] })
    })
    it.each([[null], [''], ['PRODUZIDO'], [3]])('formato %p: recusa nomeada no campo formato, formato null', (formato) => {
        const r = lerCorpoDoFormatoDaMateriaPrima({ materia_prima: MP_A, formato })
        expect(r.erros).toEqual([{ campo: 'formato', mensagem: 'obrigatório: FABRICACAO ou REVENDA' }])
        expect(r.formato).toBeNull()
    })
    it('o autor e o campo desconhecido são recusas próprias', () => {
        expect(lerCorpoDoFormatoDaMateriaPrima({ materia_prima: MP_A, formato: 'REVENDA', por: 'x' }).erros.map((e) => e.campo)).toEqual(['por'])
        expect(lerCorpoDoFormatoDaMateriaPrima({ materia_prima: MP_A, formato: 'REVENDA', familia: 'PVC' }).erros.map((e) => e.campo)).toEqual(['familia'])
    })
})

describe('(3) o formulário e o `depois` guardam o formato — e o ausente continua ausente', () => {
    it('com a migração: o formato gravado, e null fica null', () => {
        const f = formularioDaArvore(arvore())
        expect(f.materias.map((m) => m.formato)).toEqual(['FABRICACAO', 'REVENDA', null])
    })
    it('sem a migração: a chave NÃO existe no formulário (nunca null, nunca o principal)', () => {
        const f = formularioDaArvore(arvore('FABRICACAO', false))
        for (const m of f.materias) expect('formato' in m).toBe(false)
    })
    it('o `depois` sem o formato: vale o que a tela tinha; com ele, vale o do banco', () => {
        const a = arvore()
        const sem = { orcamentista_materia_prima: [{ id: MP_B, nome: 'x', ordem: 1 }], orcamentista_mp_categoria: [] as Linha[] }
        expect(arvoreDoDepois(sem, a).materias_primas[0].formato).toBe('REVENDA')
        const com = { orcamentista_materia_prima: [{ id: MP_B, nome: 'x', ordem: 1, formato: 'FABRICACAO' }], orcamentista_mp_categoria: [] as Linha[] }
        expect(arvoreDoDepois(com, a).materias_primas[0].formato).toBe('FABRICACAO')
    })
    it('o `depois` sem o formato, e a tela sem ele (sem a migração): continua ausente', () => {
        const a = arvore('FABRICACAO', false)
        const sem = { orcamentista_materia_prima: [{ id: MP_B, nome: 'x', ordem: 1 }], orcamentista_mp_categoria: [] as Linha[] }
        expect('formato' in arvoreDoDepois(sem, a).materias_primas[0]).toBe(false)
    })
})

// ═══ a tela ═══════════════════════════════════════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Cartao = () => require('@/page-parts/atendimentos-ia/base-de-conhecimento/materias-primas.component').MateriasPrimas as React.ComponentType<Record<string, unknown>>
const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })

type Opcoes = { pendente?: boolean; erro?: { materiaPrimaId: string; mensagem: string } | null; semAcao?: boolean; arvore?: ArvoreLida; estadoInicial?: EstadoDaArvore }
async function montar(o: Opcoes = {}) {
    const a = o.arvore ?? arvore()
    const chamadas: Array<[string, string]> = []
    function Casca() {
        const [estado, setEstado] = React.useState<EstadoDaArvore>(o.estadoInicial ?? formularioDaArvore(a))
        const C = Cartao()
        return React.createElement(C, {
            arvore: a, erroAoLer: null, estado, mudar: (f: (e: EstadoDaArvore) => EstadoDaArvore) => setEstado(f), erros: [], erroDaRota: null, naoEnviado: null,
            aoMudarAFamilia: async (): Promise<void> => undefined,
            ...(o.semAcao ? {} : { aoMudarOFormato: async (id: string, formato: string) => { chamadas.push([id, formato]) } }),
            familiaTravada: o.pendente === true, erroDoFormato: o.erro ?? null,
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
const combo = (host: ParentNode, nome: string) => host.querySelector(`[aria-label="Formato de ${nome}"]`)?.closest('.ant-select') as HTMLElement | null

describe('(4) o seletor do formato na tela da família', () => {
    it('mostra o formato gravado pelo rótulo do principal/secundário, e as opções com o principal primeiro', async () => {
        const { host } = await montar()
        expect(combo(host, 'PVC fabricado')?.querySelector('.ant-select-selection-item')?.textContent).toBe('Principal (Fabricação)')
        expect(combo(host, 'PVC revenda')?.querySelector('.ant-select-selection-item')?.textContent).toBe('Secundário (Revenda)')
        const seletor = combo(host, 'Sem formato')!.querySelector('.ant-select-selector')!
        await act(async () => { seletor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await assentar()
        const opcoes = Array.from(document.body.querySelectorAll('.ant-select-item-option')).map((x) => x.textContent)
        expect(opcoes).toEqual(['Principal (Fabricação)', 'Secundário (Revenda)'])
    })

    it.each([['Secundário (Revenda)', 'REVENDA'], ['Principal (Fabricação)', 'FABRICACAO']])('escolher "%s" chama a rota com a matéria-prima e %s', async (rotulo, formato) => {
        const { host, chamadas } = await montar()
        const seletor = combo(host, 'Sem formato')!.querySelector('.ant-select-selector')!
        await act(async () => { seletor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await assentar()
        const opcao = Array.from(document.body.querySelectorAll('.ant-select-item-option')).filter((x) => x.textContent === rotulo).pop() as HTMLElement
        await act(async () => { opcao.click() })
        await assentar()
        expect(chamadas).toEqual([[MP_C, formato]])
    })

    it('não escolhido: o aviso só nela, e o seletor sem valor', async () => {
        const { host } = await montar()
        expect(bloco(host, 2).querySelector('[data-formato-nao-escolhido]')?.textContent).toContain(FORMATO_NAO_ESCOLHIDO)
        expect(bloco(host, 0).querySelector('[data-formato-nao-escolhido]')).toBeNull()
        expect(combo(host, 'Sem formato')?.querySelector('.ant-select-selection-placeholder')?.textContent).toBe('Não escolhido')
    })

    it('com alteração pendente: desligado, e a tela diz por quê; sem pendência, ligado', async () => {
        const travada = await montar({ pendente: true })
        expect(combo(travada.host, 'PVC fabricado')?.className).toContain('ant-select-disabled')
        expect(bloco(travada.host, 0).querySelector('[data-formato-travado]')?.textContent).toBe(FORMATO_COM_PENDENCIA)
        const livre = await montar()
        expect(combo(livre.host, 'PVC fabricado')?.className).not.toContain('ant-select-disabled')
        expect(bloco(livre.host, 0).querySelector('[data-formato-travado]')).toBeNull()
    })

    it('a recusa aparece NA matéria-prima onde aconteceu, e só nela', async () => {
        const { host } = await montar({ erro: { materiaPrimaId: MP_B, mensagem: 'formato da familia: a materia-prima nao e desta empresa.' } })
        expect(bloco(host, 1).querySelector('[data-erro-do-formato]')?.textContent).toContain('formato da familia: a materia-prima nao e desta empresa.')
        expect(bloco(host, 0).querySelector('[data-erro-do-formato]')).toBeNull()
    })

    it('sem a migração (formato ausente na leitura): nenhum seletor nem aviso', async () => {
        const { host } = await montar({ arvore: arvore('FABRICACAO', false) })
        expect(host.querySelector('[data-formato-da-materia-prima]')).toBeNull()
        expect(host.querySelector('[data-formato-nao-escolhido]')).toBeNull()
    })

    it('matéria-prima ainda não salva, ou sem a função de gravar: nenhum seletor', async () => {
        const a = arvore()
        const inicial = formularioDaArvore(a)
        inicial.materias.push({ ...novaMateriaPrima(a.catalogo), formato: null })
        const nova = await montar({ estadoInicial: inicial })
        expect(bloco(nova.host, 3).querySelector('[data-formato-da-materia-prima]')).toBeNull()
        expect(bloco(nova.host, 0).querySelector('[data-formato-da-materia-prima]')).toBeTruthy()
        const sem = await montar({ semAcao: true })
        expect(sem.host.querySelector('[data-formato-da-materia-prima]')).toBeNull()
    })

    it('conta de modelo desconhecido: as opções sem principal', async () => {
        const { host } = await montar({ arvore: arvore(null) })
        expect(combo(host, 'PVC fabricado')?.querySelector('.ant-select-selection-item')?.textContent).toBe('Fabricação')
    })
})
