/**
 * O ARQUIVO DO LEVANTAMENTO montado a partir do que está gravado (`arquivo-do-levantamento.ts`): a folha recebe as variáveis respondidas (a linha
 * VARIÁVEIS e o desenho), o perfil e o vidro por extenso, as pré-definições comuns, e as condições congeladas no levantamento. E o resumo que vai ao
 * modelo nunca leva percentual.
 */
// o módulo lê o banco nas funções de leitura; aqui só as puras são exercitadas
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
import { montarDadosDaFolha, resumoDoArquivo, resumoDoArquivoParaOPrompt, variaveisDitas, type LevantamentoDoArquivo } from '@/lib/atendimentos-ia/arquivo-do-levantamento'
import { desenhoDaTipologia, gerarFolhaDoLevantamento, linhaDasVariaveis } from '@/lib/atendimentos-ia/folha-do-levantamento'
import { itemVazio, type DefinicaoDaTipologia, type ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import type { VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'

const VARIAVEIS: Record<string, VariaveisDaTipologia> = {
    'DP-04': { variaveis: [
        { variavel: 'ARI', descricao: 'ARREMATE INTERNO', padrao: '1', condicao: '(ARR=1)', opcoes: '1 = BZ0006 - ARREMATE 65MM [33,00]; 3 = BZ0010 - ARREMATE 20MM; 4 = SEM ARREMATE INTERNO' },
        { variavel: 'AF', descricao: 'ALTURA DA BANDEIRA', padrao: null, condicao: 'sempre', opcoes: null },
    ] } as unknown as VariaveisDaTipologia,
    'DP-02': { variaveis: [
        { variavel: 'ARI', descricao: 'ARREMATE INTERNO', padrao: '1', condicao: '(ARR=1)', opcoes: '1 = BZ0006 - ARREMATE 65MM [33,00]; 3 = BZ0010 - ARREMATE 20MM; 4 = SEM ARREMATE INTERNO' },
    ] } as unknown as VariaveisDaTipologia,
}
const definicao: DefinicaoDaTipologia = (e) => (e.tipologia ? VARIAVEIS[e.tipologia] ?? null : null)
const DESCRICOES: Record<string, string> = { 'DP-04': 'JANELA DE CORRER 02 FOLHAS MÓVEIS | BANDEIRA FIXA | EUROPA 42', 'DP-02': 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42' }
const detalhe = (t: string) => (DESCRICOES[t] ? { descricao: DESCRICOES[t], linha: 'PVC WOLFF EUROPA 42' } : null)
const item = (ordem: number, extra: Partial<ItemDoLevantamento>): ItemDoLevantamento => ({
    ...itemVazio(ordem), tipologia: 'DP-02', largura_mm: 1500, altura_mm: 1200, quantidade: 1, cor_perfil: 'BRANCO', vidro: '4 mm', familia: 'PVC', motor_id: 'm', ...extra,
})
const LEV: LevantamentoDoArquivo = {
    id: 'l1', numero: 7, nome: 'Casa da Ana', remetente_id: 'r1', telefone: null, email: null, edificacao: null, endereco: null, obs_obra: null, data_entrega: null,
    comissao_percentual: 5, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 1, reserva_tecnica_responsavel: null, lucro_projetado_percentual: 10,
    vendedor_nome: 'Cristiano Fernandes', vendedor_employee_id: 'e1',
}
const montar = (itens: ItemDoLevantamento[], l: Partial<LevantamentoDoArquivo> = {}) =>
    montarDadosDaFolha({ empresa: 'Empresa X', levantamento: { ...LEV, ...l }, itens, definicao, detalhe, geradoEm: new Date(Date.UTC(2026, 10, 6, 12)) })

describe('o arquivo montado do que está gravado', () => {
    it('a variável SEM PADRÃO respondida vai à linha VARIÁVEIS e ao desenho (a bandeira na altura dita); a escolha de arremate não vai à linha', () => {
        const d = montar([item(1, { tipologia: 'DP-04', escolhas: { ARI: 3, AF: 400 } })])
        expect(variaveisDitas(item(1, { tipologia: 'DP-04', escolhas: { ARI: 3, AF: 400 } }), definicao)).toEqual([
            { variavel: 'ARI', descricao: 'ARREMATE INTERNO', valor: 3, semPadrao: false },
            { variavel: 'AF', descricao: 'ALTURA DA BANDEIRA', valor: 400, semPadrao: true },
        ])
        expect(linhaDasVariaveis(d.itens[0])).toBe('Altura da bandeira 400 mm')
        expect(desenhoDaTipologia(d.itens[0])).toEqual(expect.objectContaining({ colunas: 2, bandeira_mm: 400 }))
        expect(d.itens[0].descricao).toBe(DESCRICOES['DP-04'])
        expect(d.itens[0].perfil).toBe('Cor do perfil: BRANCO · Arremate e guarnição: arremate interno: 20 mm')
        expect(d.itens[0].acessorioEVidro).toBe('Acessórios: padrão · vidro 4 mm')
    })

    it('a DP-02 sem variável sem padrão: a linha VARIÁVEIS não existe', () => {
        expect(linhaDasVariaveis(montar([item(1, {})]).itens[0])).toBeNull()
    })

    it('as pré-definições: o que é IGUAL em todos os itens; o que difere fica só no item; a vedação sai como "padrão"', () => {
        expect(montar([item(1, {}), item(2, {})]).preDefinicoes).toEqual([
            { rotulo: 'Cor do perfil', valor: 'BRANCO' }, { rotulo: 'Arremate e guarnição', valor: 'Padrão' }, { rotulo: 'Vedação', valor: 'padrão' },
        ])
        expect(montar([item(1, {}), item(2, { cor_perfil: 'PRETO' })]).preDefinicoes).toEqual([{ rotulo: 'Arremate e guarnição', valor: 'Padrão' }, { rotulo: 'Vedação', valor: 'padrão' }])
    })

    it('as condições são as GRAVADAS no levantamento (congeladas), o cliente é o nome do levantamento, e a folha sai', () => {
        const d = montar([item(1, { ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: 'ok' })], { reserva_tecnica_responsavel: 'Arq. Bia', data_entrega: '2026-11-27' })
        expect(d.condicoes).toEqual({ vendedor: 'Cristiano Fernandes', comissaoPercentual: 5, comissaoModo: 'PROPORCIONAL', rtResponsavel: 'Arq. Bia', rtPercentual: 1, lucroPercentual: 10 })
        expect(d.cliente).toEqual(expect.objectContaining({ nome: 'Casa da Ana', dataEntrega: '2026-11-27' }))
        expect(d.itens[0]).toEqual(expect.objectContaining({ ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: 'ok' }))
        expect(gerarFolhaDoLevantamento(d).ok).toBe(true)
    })

    it('sem os percentuais congelados, a folha é RECUSADA nomeando o que falta — nunca sai com zero', () => {
        const r = gerarFolhaDoLevantamento(montar([item(1, {})], { comissao_percentual: null, lucro_projetado_percentual: null }))
        expect(r).toEqual({ ok: false, recusas: ['Faltam, nas condições comerciais: a comissão (%), o lucro projetado (%).'] })
    })

    it('o resumo que vai ao MODELO não traz percentual; o de comparação (R2) traz, e muda quando um percentual muda', () => {
        const d = montar([item(1, {})])
        expect(resumoDoArquivoParaOPrompt(d)).not.toMatch(/%/)
        expect(resumoDoArquivoParaOPrompt(d)).toContain('Item 1: DP-02, 1 unidade(s), 1500 x 1200 mm')
        expect(resumoDoArquivo(d)).toContain('comissão 5% (PROPORCIONAL)')
        expect(resumoDoArquivo(montar([item(1, {})], { comissao_percentual: 6 }))).not.toBe(resumoDoArquivo(d))
        expect(resumoDoArquivoParaOPrompt(montar([item(1, {})], { comissao_percentual: 6 }))).toBe(resumoDoArquivoParaOPrompt(d))
    })
})
