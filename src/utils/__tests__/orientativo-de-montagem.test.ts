/**
 * O ORIENTATIVO DE MONTAGEM (dono do produto, 22/11/2026): por esquadria, PERFIS → ACESSÓRIOS → VIDRO → SERVIÇOS; a Obs. da linha do motor
 * pelo recálculo CONFERIDO contra as peças gravadas; o que não veio é lacuna nomeada, nunca número.
 */
import {
    AVISOS_DO_RODAPE, FALTA_DOS_SERVICOS, LACUNA_DA_COR_DO_VIDRO, LACUNA_DA_FIGURA, LACUNA_DA_POSICAO_DO_VIDRO, LACUNA_DOS_PANOS,
    avisoDoMotorQueMudou, avisoDoRecalculoQueNaoRodou, celulasDoAcessorio, celulasDoVidro, diferencasDasPecas, fimDosPerfis, montarEsquadria,
    montarOrientativo, type EntradaDaEsquadria, type PecaGravada,
} from '@/lib/atendimentos-ia/orientativo-de-montagem'
import type { MontagemDoItem } from '@/lib/atendimentos-ia/custo-do-orcamento-servidor'

const gravada = (o: Partial<PecaGravada> = {}): PecaGravada =>
    ({ perfil: '1023/WOLFF', codigo: '1023', descricao: 'CLICK GUIA', comprimento_mm: 1500, quantidade_por_esquadria: 2, corte: '90/90', posicao: 'Largura', ...o })
const recalculada = (o: Partial<MontagemDoItem['pecas'][number]> = {}): MontagemDoItem['pecas'][number] =>
    ({ perfil: '1023/WOLFF', codigo: '1023', descricao: 'CLICK GUIA', comprimento_mm: 1500, quantidade_por_esquadria: 2, quantidade: 4, corte: '90/90', posicao: 'Largura',
        linha: 7, obs: 'MARCO - LARGURA', ...o })
const montagem = (o: Partial<MontagemDoItem> = {}): MontagemDoItem => ({
    pecas: [recalculada()],
    insumos: [
        { codigo: 'NYL-190', descricao: 'BUCHA', quantidade: 6, linha: 3, obs: 'FIXAR NYL-190', codigo_na_tabela: 'NYL-0630-NTR', descricao_na_tabela: 'BUCHA NYLON', unidade: 'PC', por_comprimento: false },
        { codigo: '946/WOLFF', descricao: 'ESCOVA', quantidade: 2500, linha: 4, obs: null, codigo_na_tabela: '946', descricao_na_tabela: 'ESCOVA 7X7', unidade: 'MT', por_comprimento: true },
    ],
    vidros: [{ vidro: 'VIDRO', largura_mm: 1000, altura_mm: 500, quantidade: 2, fixacao: 'Fixo', linha: 1 }],
    vidro: { codigo: 'VTIN08', descricao: 'TEMPERADO INCOLOR 8MM' },
    ...o,
})
const entrada = (o: Partial<EntradaDaEsquadria> = {}): EntradaDaEsquadria => ({
    ordem: 1, tipologia: 'DP-02', descricao: 'JANELA DE CORRER', largura_mm: 1500, altura_mm: 1200, quantidade: 2, cor_perfil: 'BRANCO', vidro: 'vidro 8mm',
    desenho: null, semDesenho: null,
    gravadas: [gravada()],
    materiais: [
        { caminho: 'insumo', codigo_na_tabela: 'NYL-0630-NTR', descricao: 'BUCHA NYLON', unidade_compra: 'PC', consumo_item: 12 },
        { caminho: 'vidro', codigo_na_tabela: 'VTIN08', descricao: 'TEMPERADO INCOLOR 8MM', unidade_compra: 'M2', consumo_item: 2 },
    ],
    recalculo: montagem(),
    ...o,
})
const PESOS = new Map([['1023', 0.5]])

describe('a conferência: o recálculo só vale se as peças forem as GRAVADAS', () => {
    it('conferindo, as peças vêm do recálculo, com a Obs. da linha do motor', () => {
        const e = montarEsquadria(entrada(), PESOS)
        expect(e.fonte).toBe('recalculado')
        expect(e.aviso).toBeNull()
        expect(e.perfis.linhas).toEqual([{ codigo: '1023', perfil: '1023/WOLFF', descricao: 'CLICK GUIA', quantidade: 2, comprimento_mm: 1500, corte: '90/90',
            posicao: 'Largura', peso_kg: 1.5, obs: 'MARCO - LARGURA' }])
    })
    it('o motor que mudou: as GRAVADAS saem, SEM Obs., e o aviso diz quantas peças diferem', () => {
        const e = montarEsquadria(entrada({ recalculo: montagem({ pecas: [recalculada({ comprimento_mm: 1501 })] }) }), PESOS)
        expect(e.fonte).toBe('gravado')
        expect(e.aviso).toBe(avisoDoMotorQueMudou(2))
        expect(e.perfis.linhas.map((l) => [l.comprimento_mm, l.obs])).toEqual([[1500, null]])
        // os acessórios também saem do gravado, sem Obs.; e o vidro, sem as medidas dos panos (lacuna nomeada)
        expect(e.acessorios).toEqual([{ codigo: 'NYL-0630-NTR', descricao: 'BUCHA NYLON', unidade: 'PC', quantidade: 6, obs: null, figura: null }])
        expect(e.vidros.linhas).toEqual([])
        expect(e.lacunas).toContain(LACUNA_DOS_PANOS)
    })
    it('o recálculo que não rodou: as gravadas, com a razão', () => {
        const e = montarEsquadria(entrada({ recalculo: { naoRodou: 'a cor do perfil.' } }), PESOS)
        expect(e.fonte).toBe('gravado')
        expect(e.aviso).toBe(avisoDoRecalculoQueNaoRodou('a cor do perfil.'))
        expect(e.aviso).toContain('(a cor do perfil)')
    })
    it('as diferenças contam como multiconjunto: a ordem não importa; a peça a mais ou a menos conta', () => {
        const a = recalculada(), b = recalculada({ codigo: '9681', perfil: 'SF66/WOLFF' })
        const ga = gravada(), gb = gravada({ codigo: '9681', perfil: 'SF66/WOLFF' })
        expect(diferencasDasPecas([a, b], [gb, ga])).toBe(0)
        expect(diferencasDasPecas([a, b], [ga])).toBe(1)
        expect(diferencasDasPecas([a], [gravada({ corte: '45/45' })])).toBe(2)
        expect(diferencasDasPecas([a], [gravada({ posicao: 'Altura' })])).toBe(2)
        expect(diferencasDasPecas([a], [gravada({ quantidade_por_esquadria: 3 })])).toBe(2)
    })
})

describe('os blocos', () => {
    it('PERFIS: os pedaços, o peso da esquadria e o peso acumulado da obra (cada esquadria × a quantidade dela)', () => {
        const o = montarOrientativo([entrada({ ordem: 2 }), entrada({ ordem: 1, quantidade: 3 })], PESOS, [])
        expect(o.esquadrias.map((e) => e.ordem)).toEqual([1, 2])
        expect(o.esquadrias.map((e) => [e.perfis.pedacos, e.perfis.peso_kg, e.perfis.peso_acumulado_kg])).toEqual([[2, 1.5, 4.5], [2, 1.5, 7.5]])
        expect(fimDosPerfis(o.esquadrias[0].perfis)).toBe('Pedaços: 2 · Peso do item: 1,500 kg · Peso acumulado da obra: 4,500 kg')
    })
    it('o perfil sem peso na tabela: o peso da esquadria NÃO sai (nunca zero), o código é nomeado, e o acumulado também não sai dali em diante', () => {
        const o = montarOrientativo([entrada({ ordem: 1 }), entrada({ ordem: 2 })], new Map(), [])
        expect(o.esquadrias[0].perfis.peso_kg).toBeNull()
        expect(o.esquadrias[0].perfis.codigosSemPeso).toEqual(['1023'])
        expect(o.esquadrias[1].perfis.peso_acumulado_kg).toBeNull()
        expect(fimDosPerfis(o.esquadrias[0].perfis)).toBe('Pedaços: 2 · Peso do item: o peso não sai: o código 1023 não tem peso na tabela de preço · Peso acumulado da obra: não sai')
    })
    it('ACESSÓRIOS: o código e a descrição da tabela, a Obs. da linha, a coluna da figura VAZIA; o vendido por comprimento vai em metros', () => {
        const e = montarEsquadria(entrada(), PESOS)
        expect(e.acessorios).toEqual([
            { codigo: 'NYL-0630-NTR', descricao: 'BUCHA NYLON', unidade: 'PC', quantidade: 6, obs: 'FIXAR NYL-190', figura: null },
            { codigo: '946', descricao: 'ESCOVA 7X7', unidade: 'm', quantidade: 2.5, obs: null, figura: null },
        ])
        expect(celulasDoAcessorio(e.acessorios[0])).toEqual(['', 'NYL-0630-NTR', 'BUCHA NYLON', 'PC', '6', 'FIXAR NYL-190'])
        expect(e.lacunas).toContain(LACUNA_DA_FIGURA)
    })
    it('o acessório que a tabela não tem: código e descrição do motor, a unidade VAZIA e nomeada como lacuna', () => {
        const e = montarEsquadria(entrada({ recalculo: montagem({ insumos: [
            { codigo: 'X9', descricao: 'PEÇA DO MOTOR', quantidade: 2, linha: 9, obs: null, codigo_na_tabela: null, descricao_na_tabela: null, unidade: null, por_comprimento: null },
        ] }) }), PESOS)
        expect(e.acessorios).toEqual([{ codigo: 'X9', descricao: 'PEÇA DO MOTOR', unidade: null, quantidade: 2, obs: null, figura: null }])
        expect(e.lacunas).toContain('Unidade do acessório: o dado não veio para X9 — o código não está na tabela de preço.')
    })
    it('VIDRO: a descrição do item da tabela, a fixação, as medidas e o M² dos panos; a COR e a POSIÇÃO vazias e nomeadas', () => {
        const e = montarEsquadria(entrada(), PESOS)
        expect(e.vidros).toEqual({ linhas: [{ descricao: 'TEMPERADO INCOLOR 8MM', cor: null, posicao: null, fixacao: 'Fixo', quantidade: 2, largura_mm: 1000, altura_mm: 500, m2: 1 }], total_m2: 1 })
        expect(celulasDoVidro(e.vidros.linhas[0])).toEqual(['TEMPERADO INCOLOR 8MM', '', '', 'Fixo', '2', '1.000', '500', '1,000 m²'])
        expect(e.lacunas).toEqual(expect.arrayContaining([LACUNA_DA_COR_DO_VIDRO, LACUNA_DA_POSICAO_DO_VIDRO]))
    })
    it('SERVIÇOS: bloco vazio, com a marca de que o dado não veio', () => {
        expect(montarEsquadria(entrada(), PESOS).servicos).toEqual({ linhas: [], falta: FALTA_DOS_SERVICOS })
    })
    it('o desenho: o que veio do catálogo; sem ele, o espaço vazio com a razão (nunca o de outra tipologia)', () => {
        const img = { dados: 'data:image/png;base64,AAAA', formato: 'PNG' as const }
        expect(montarEsquadria(entrada({ desenho: img }), PESOS)).toMatchObject({ desenho: img, semDesenho: null })
        expect(montarEsquadria(entrada({ semDesenho: 'Sem desenho: a tipologia DP-02 não está no catálogo.' }), PESOS))
            .toMatchObject({ desenho: null, semDesenho: 'Sem desenho: a tipologia DP-02 não está no catálogo.' })
        expect(montarEsquadria(entrada(), PESOS).semDesenho).toBe('Sem desenho para esta tipologia.')
    })
    it('os avisos do rodapé: o mesmo conteúdo, com palavras nossas — conferir com profissional; testar uma esquadria antes de cortar o resto', () => {
        expect(montarOrientativo([], PESOS, [3]).avisosDoRodape).toBe(AVISOS_DO_RODAPE)
        expect(AVISOS_DO_RODAPE[0]).toMatch(/profissional habilitado/)
        expect(AVISOS_DO_RODAPE[1]).toMatch(/monte primeiro um item inteiro/)
        expect(montarOrientativo([], PESOS, [3]).itensSemCalculo).toEqual([3])
    })
})
