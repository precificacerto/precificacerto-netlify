/**
 * O ARQUIVO DO LEVANTAMENTO montado a partir do que está gravado (`arquivo-do-levantamento.ts`): a folha recebe as variáveis respondidas (a linha
 * VARIÁVEIS e o desenho), o perfil e o vidro por extenso, as pré-definições comuns, e as condições congeladas no levantamento. E o resumo que vai ao
 * modelo nunca leva percentual.
 */
// o módulo lê o banco nas funções de leitura; aqui só as puras são exercitadas
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
import { corDoAcessorio, montarDadosDaFolha, resumoDoArquivo, resumoDoArquivoParaOPrompt, variaveisDitas, type LevantamentoDoArquivo } from '@/lib/atendimentos-ia/arquivo-do-levantamento'
import { conferirFolha, desenhoDaTipologia, gerarFolhaDoLevantamento, linhaDasVariaveis } from '@/lib/atendimentos-ia/folha-do-levantamento'
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
    montarDadosDaFolha({ empresa: 'Empresa X', levantamento: { ...LEV, ...l }, itens, definicao, detalhe, geradoEm: new Date(Date.UTC(2026, 10, 6, 12)), doVendedor: null })

/** O texto desenhado no PDF (as cadeias dos operadores Tj), para conferir o que a folha mostra. */
const textoDoPdf = (pdf: Uint8Array) => [...Buffer.from(pdf).toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')).join(' ').replace(/\s+/g, ' ')
/** O padrão de um código de fornecedor: letras seguidas de dígitos, como BZ0010, BZ1770 — e qualquer outro do mesmo feitio. */
const CODIGO_DE_FORNECEDOR = /\b[A-Z]{1,5}\d{2,}[A-Z0-9]*\b/

describe('OS TRÊS PERCENTUAIS na folha: a alteração dita, senão a pré-definição do vendedor, senão zero (dono do produto, 11/11/2026)', () => {
    const PERFIL = { comissao_percentual: 3, comissao_modo: 'CONGELADA' as const, reserva_tecnica_percentual: 0, lucro_projetado_percentual: 15 }
    const com = (l: Partial<LevantamentoDoArquivo>, doVendedor: typeof PERFIL | null) =>
        montarDadosDaFolha({ empresa: 'Empresa X', levantamento: { ...LEV, ...l }, itens: [item(1, {})], definicao, detalhe, geradoEm: new Date(Date.UTC(2026, 10, 11, 12)), doVendedor }).condicoes
    const VAZIO: Partial<LevantamentoDoArquivo> = { comissao_percentual: null, reserva_tecnica_percentual: null, lucro_projetado_percentual: null }
    it('a alteração dita no levantamento vence a pré-definição', () => {
        expect(com({}, PERFIL)).toEqual(expect.objectContaining({ comissaoPercentual: 5, rtPercentual: 1, lucroPercentual: 10 }))
    })
    it('o levantamento sem alteração: os três da pré-definição do vendedor', () => {
        expect(com(VAZIO, PERFIL)).toEqual(expect.objectContaining({ comissaoPercentual: 3, rtPercentual: 0, lucroPercentual: 15 }))
    })
    it('sem alteração e sem pré-definição: ZERO nos três — e a folha não recusa por eles', () => {
        const c = com(VAZIO, null)
        expect([c.comissaoPercentual, c.rtPercentual, c.lucroPercentual]).toEqual([0, 0, 0])
        const d = montarDadosDaFolha({ empresa: 'Empresa X', levantamento: { ...LEV, ...VAZIO }, itens: [item(1, {})], definicao, detalhe, geradoEm: new Date(Date.UTC(2026, 10, 11, 12)), doVendedor: null })
        // a folha completa não tem recusa nenhuma: os percentuais ausentes não viram falta
        expect(conferirFolha(d)).toEqual([])
    })
})

describe('O ARREMATE na folha: O QUE O CÁLCULO USA, com as opções reais do motor da Wolff (dono do produto, 07/11/2026)', () => {
    // as três variáveis de arremate da DP-02 como estão no motor fdff3386 (medido em 07/11/2026), com os códigos reais
    const DP02_REAL = { variaveis: [
        { variavel: 'ARI', descricao: 'ARREMATE INTERNO', padrao: '1', condicao: '(ARR=1)', opcoes: '1 = BZ0006 - ARREMATE 65MM [33,00]; 2 = BZ1770 - ARREMATE 70MM [33,00]; 3 = BZ0010 - ARREMATE 20MM; 4 = SEM ARREMATE INTERNO' },
        { variavel: 'ARE', descricao: 'ARREMATE EXTERNO', padrao: '1', condicao: '(ARR=1)', opcoes: '1 = BZ0010 - ARREMATE 20MM; 2 = SEM ARREMATE EXTERNO' },
        { variavel: 'MAE', descricao: 'MEDIDA ARREMATE EXTERNO', padrao: '1', condicao: '(ARE=1)', opcoes: '1 = MEDIDA DO VÃO (CORTE 45/45); 2 = VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA [50,00]; 3 = VÃO+100MM (CORTE 90/90) - PARA AJUSTE EM OBRA [100,00]' },
    ] } as unknown as VariaveisDaTipologia
    // e um motor qualquer, com um código genérico: a regra não pode depender de BZ0010 e BZ1770
    const GENERICO = { variaveis: [
        { variavel: 'ARI', descricao: 'ARREMATE INTERNO', padrao: '1', condicao: 'sempre', opcoes: '1 = QX4410 - ARREMATE 30MM [12,00]; 2 = KLM77A - ARREMATE 45MM' },
    ] } as unknown as VariaveisDaTipologia
    const comDefinicao = (v: VariaveisDaTipologia) => (itens: ItemDoLevantamento[]) =>
        montarDadosDaFolha({ empresa: 'Empresa X', levantamento: LEV, itens, definicao: () => v, detalhe, geradoEm: new Date(Date.UTC(2026, 10, 7, 12)), doVendedor: null })
    const real = comDefinicao(DP02_REAL)
    const PADRAO_DO_MOTOR = 'arremate interno: 65 mm; arremate externo: 20 mm; medida do arremate externo: medida do vão'

    it('IGUAL em todos os itens: no RODAPÉ, uma vez, com o que o cálculo usa (o padrão do motor, por extenso); nenhuma célula diz "Acabamento:"', () => {
        const d = real([item(1, {}), item(2, {}), item(3, {})])
        expect(d.preDefinicoes).toContainEqual({ rotulo: 'Arremate e guarnição', valor: PADRAO_DO_MOTOR })
        expect(d.itens.map((i) => i.perfilEAcessorio)).toEqual(['BRANCO / padrão', 'BRANCO / padrão', 'BRANCO / padrão'])
        const folha = gerarFolhaDoLevantamento(d)
        if ('recusas' in folha) throw new Error(folha.recusas.join(' '))
        const texto = textoDoPdf(folha.pdf)
        expect(texto).toContain(`Arremate e guarnição: ${PADRAO_DO_MOTOR}`)
        expect(texto).not.toContain('Acabamento:')
    })

    it('UM item com arremate DIFERENTE: cada célula diz o seu, ROTULADO "Acabamento:" depois das cores e separado por " · "; o rodapé não o traz', () => {
        const d = real([item(1, {}), item(2, { escolhas: { ARI: 2, MAE: 2 } })])
        expect(d.itens.map((i) => i.perfilEAcessorio)).toEqual([
            `BRANCO / padrão · Acabamento: ${PADRAO_DO_MOTOR}`,
            'BRANCO / padrão · Acabamento: arremate interno: 70 mm; arremate externo: 20 mm; medida do arremate externo: vão + 50 mm',
        ])
        expect(d.preDefinicoes.map((p) => p.rotulo)).toEqual(['Cor do perfil', 'Vedação'])
        const folha = gerarFolhaDoLevantamento(d)
        if ('recusas' in folha) throw new Error(folha.recusas.join(' '))
        const texto = textoDoPdf(folha.pdf)
        expect(texto.match(/Acabamento:/g)).toHaveLength(2)
        expect(texto).not.toContain('Arremate e guarnição')
    })

    it('NENHUM código de fornecedor em lugar nenhum da folha — nem na célula, nem no rodapé: com os códigos reais (BZ0006, BZ1770, BZ0010) e com um genérico', () => {
        const casos: Array<[string, ReturnType<typeof real>]> = [
            ['real, igual em todos', real([item(1, { escolhas: { ARI: 2 } }), item(2, { escolhas: { ARI: 2 } })])],
            ['real, variando', real([item(1, { escolhas: { ARI: 2 } }), item(2, { escolhas: { ARI: 3, MAE: 3 } }), item(3, {})])],
            ['genérico, igual', comDefinicao(GENERICO)([item(1, {}), item(2, {})])],
            ['genérico, variando', comDefinicao(GENERICO)([item(1, {}), item(2, { escolhas: { ARI: 2 } })])],
        ]
        for (const [nome, d] of casos) {
            const folha = gerarFolhaDoLevantamento(d)
            if ('recusas' in folha) throw new Error(`${nome}: ${folha.recusas.join(' ')}`)
            const texto = textoDoPdf(folha.pdf)
            // o instrumento enxerga: o texto traz o arremate (senão a busca de código passaria por não ter o que ler)
            expect([nome, /arremate interno: \d+ mm/.test(texto)]).toEqual([nome, true])
            for (const codigo of ['BZ0006', 'BZ1770', 'BZ0010', 'QX4410', 'KLM77A']) expect([nome, codigo, texto.includes(codigo)]).toEqual([nome, codigo, false])
            expect([nome, CODIGO_DE_FORNECEDOR.exec(texto)?.[0] ?? null]).toEqual([nome, null])
        }
        // e o instrumento PEGA um código quando ele está lá
        expect(CODIGO_DE_FORNECEDOR.exec('Arremate e guarnição: BZ0010 - arremate 20 mm')?.[0]).toBe('BZ0010')
        expect(CODIGO_DE_FORNECEDOR.exec('Acabamento: QX4410 30 mm')?.[0]).toBe('QX4410')
    })
})

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
        // a linha do item: "<cor do perfil> / <cor do acessório>" ("padrão" não dita) e o vidro como dito; o arremate, comum, vai ao rodapé
        expect(d.itens[0].perfilEAcessorio).toBe('BRANCO / padrão')
        expect(d.itens[0].vidro).toBe('4 mm')
        expect(d.preDefinicoes).toContainEqual({ rotulo: 'Arremate e guarnição', valor: 'arremate interno: 20 mm' })
    })

    it('a COR DO ACESSÓRIO dita (a variável cuja descrição é "COR DOS ACESSÓRIOS", pela descrição) sai por extenso; não dita, "padrão"', () => {
        const comCa: DefinicaoDaTipologia = () => ({ variaveis: [{ variavel: 'CA', descricao: 'COR DOS ACESSÓRIOS', padrao: '1', condicao: 'sempre', opcoes: '1 = BRANCO; 2 = PRETO; 3 = MARROM' }] } as unknown as VariaveisDaTipologia)
        expect(corDoAcessorio(item(1, { escolhas: { CA: 2 } }), comCa)).toBe('preto')
        expect(corDoAcessorio(item(1, { escolhas: {} }), comCa)).toBe('padrão')
        expect(corDoAcessorio(item(1, { escolhas: { CA: 9 } }), comCa)).toBe('padrão')
        expect(corDoAcessorio(item(1, { escolhas: { CA: 2 } }), definicao)).toBe('padrão')
    })

    it('a cor do perfil que VARIA entre os itens aparece em cada item e não vai ao rodapé; o arremate que varia vai à célula do item, ROTULADO "Acabamento:"', () => {
        const d = montar([item(1, {}), item(2, { cor_perfil: 'PRETO', escolhas: { ARI: 3 } })])
        expect(d.itens.map((i) => i.perfilEAcessorio)).toEqual(['BRANCO / padrão · Acabamento: arremate interno: 65 mm', 'PRETO / padrão · Acabamento: arremate interno: 20 mm'])
        expect(d.preDefinicoes).toEqual([{ rotulo: 'Vedação', valor: 'padrão' }])
    })

    it('a DP-02 sem variável sem padrão: a linha VARIÁVEIS não existe', () => {
        expect(linhaDasVariaveis(montar([item(1, {})]).itens[0])).toBeNull()
    })

    it('as pré-definições: o que é IGUAL em todos os itens; o que difere fica só no item; a vedação sai como "padrão"', () => {
        expect(montar([item(1, {}), item(2, {})]).preDefinicoes).toEqual([
            { rotulo: 'Cor do perfil', valor: 'BRANCO' }, { rotulo: 'Arremate e guarnição', valor: 'arremate interno: 65 mm' }, { rotulo: 'Vedação', valor: 'padrão' },
        ])
        expect(montar([item(1, {}), item(2, { cor_perfil: 'PRETO' })]).preDefinicoes).toEqual([{ rotulo: 'Arremate e guarnição', valor: 'arremate interno: 65 mm' }, { rotulo: 'Vedação', valor: 'padrão' }])
    })

    it('as condições são as GRAVADAS no levantamento (congeladas), o cliente é o nome do levantamento, e a folha sai', () => {
        const d = montar([item(1, { ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: 'ok' })], { reserva_tecnica_responsavel: 'Arq. Bia', data_entrega: '2026-11-27' })
        expect(d.condicoes).toEqual({ vendedor: 'Cristiano Fernandes', comissaoPercentual: 5, comissaoModo: 'PROPORCIONAL', rtResponsavel: 'Arq. Bia', rtPercentual: 1, lucroPercentual: 10 })
        expect(d.cliente).toEqual(expect.objectContaining({ nome: 'Casa da Ana', dataEntrega: '2026-11-27' }))
        expect(d.itens[0]).toEqual(expect.objectContaining({ ambientes: [{ ambiente: 'Sala', quantidade: 1 }], obs: 'ok' }))
        expect(gerarFolhaDoLevantamento(d).ok).toBe(true)
    })

    // REVOGADO pela regra do zero (dono do produto, 11/11/2026): "a ausência de imputação significa ZERO" — o caso de antes recusava a folha
    it('sem os percentuais no levantamento e sem pré-definição, a folha SAI com zero (a regra do zero); o modo ausente continua recusado', () => {
        expect(gerarFolhaDoLevantamento(montar([item(1, {})], { comissao_percentual: null, lucro_projetado_percentual: null })).ok).toBe(true)
        const r = gerarFolhaDoLevantamento(montar([item(1, {})], { comissao_modo: null }))
        expect(r).toEqual({ ok: false, recusas: ['Faltam, nas condições comerciais: o modo da comissão.'] })
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
