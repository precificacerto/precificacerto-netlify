/**
 * PORTÃO — O VOCABULÁRIO DA OBRA, A LINHA DE ITEM E O DITO QUE CONFERE COM A TIPOLOGIA (dono do produto, 13/11/2026).
 *
 * O caso real: conversa 9477e86d, 13/11/2026 00:27, "2 Persiana 1,50 x 1,30 1 pano" numa mensagem com outras quatro esquadrias (porta e janela de
 * correr, duas maxim-ar). Antes: a linha não era trecho, o padrão juntava os tipos das outras linhas da janela (correr e maxim-ar) e o "pano"
 * tirava o padrão — a conversa perguntou. Agora: "persiana" é janela de correr com persiana, a linha é a da esquadria pela medida, e o "1 pano"
 * confere com a DP-07 (persiana sem a variável QP: um pano por construção) — DP-07, sem pergunta, e o CONSIDERADO diz "(1 pano)".
 *
 * As descrições e as variáveis são as do motor em uso (022fc55e, lidas em 13/11/2026, só leitura): catálogo da plataforma, não dado de cliente.
 * `teste-que-nao-exercita`: cada asserção cai sem a peça que ela prova (anotado ao lado).
 */
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
import { filtrarPeloAcumulado, medidasDaLinha, emMilimetros, vocabularioDaObra, linhaDaEsquadria, trechosDoAcumulado } from '@/lib/atendimentos-ia/tipologias-candidatas'
import {
    VARIAVEL_DOS_PANOS, atributosDitos, fraseDoPadraoQueFalta, oQueAEsquadriaE, padraoDaEsquadria, panosDaNatureza, panosDitos, type VariaveisDaCandidata,
} from '@/lib/atendimentos-ia/tipologia-padrao'
import { panosDaPersiana } from '@/lib/atendimentos-ia/arquivo-do-levantamento'
import type { CandidatoDeTipologia } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import type { ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'

const MOTOR: Array<[string, string, string]> = [
    ['DP-02', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'Correr'],
    ['DP-04', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | BANDEIRA FIXA | EUROPA 42', 'Correr'],
    ['DP-07', 'JANELA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA | EUROPA 42', 'Correr'],
    ['DP-08', 'JANELA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA | PEITORIL FIXO | EUROPA 42', 'Correr'],
    ['DP-16', 'JANELA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | EUROPA 42', 'Correr'],
    ['DP-39', 'PORTA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'Correr'],
    ['DP-48', 'PORTA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA | EUROPA 42', 'Correr'],
    ['DP-65', 'PORTA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | EUROPA 42', 'Correr'],
    ['DP-113', 'JANELA DE GIRO 01 FOLHA | EUROPA 60', 'Giro / Abrir'],
    ['DP-116', 'JANELA DE GIRO 01 FOLHA COM PERSIANA | EUROPA 60', 'Giro / Abrir'],
    ['DP-124', 'JANELA OSCILO BATENTE 01 FOLHA COM PERSIANA | EUROPA 60', 'Oscilo-batente'],
    ['DP-01', 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | DESIGN', 'Maxim-ar'],
]
const CANDIDATOS: CandidatoDeTipologia[] = MOTOR.map(([tipologia, descricao, tipo]) => ({
    tipologia, descricao, tipo, familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff', linha: `PVC WOLFF ${descricao.split('|').pop()!.trim()}`,
    larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: null as number | null, alt_max_mm: null as number | null,
}))
const TIPOS = ['Correr', 'Giro / Abrir', 'Oscilo-batente', 'Maxim-ar', 'Fixo', 'Pivotante']
// a QP, como no motor 022fc55e (medido em 13/11/2026): nas 12 que variam — aqui DP-16 e DP-65; a DP-07 e a DP-48 não a têm
const COM_QP = new Set(['DP-16', 'DP-65'])
const VARIAVEIS: VariaveisDaCandidata = (c) => ['ARR', 'AE', 'PP', ...(COM_QP.has(c.tipologia) ? [VARIAVEL_DOS_PANOS] : [])]
const item = (largura: number | null, altura: number | null, ordem = 1) => ({ ordem, tipologia: null, largura_mm: largura, altura_mm: altura }) as unknown as ItemDoLevantamento
const padrao = (textos: string[], i: ItemDoLevantamento, abertura: 'porta' | 'janela' | null = null, variaveis: VariaveisDaCandidata | undefined = VARIAVEIS) =>
    padraoDaEsquadria(i, abertura, filtrarPeloAcumulado(CANDIDATOS, textos).lidos, CANDIDATOS, variaveis)

const MENSAGEM_REAL = 'quero orçamento\n1 Porta janelas de correr 2 folhas com vidro comum 6 mm incolor 2,50 x 2,20\n1 janela maxim ar, mini boreal 60 x60\n'
    + '2 Janela de correr 1,6 x 1,2\n1 maxim ar 0,80 x 0,6\n2 Persiana 1,50 x 1,30 1 pano\n\nCliente: Beatriz Fonseca\nLocal: Caxias'

describe('O CASO REAL: "2 Persiana 1,50 x 1,30 1 pano" fecha na DP-07, sem pergunta', () => {
    it('com a abertura do item ausente (a mensagem tem porta E janela) ou dita janela: DP-07, e os panos absorvidos com origem "dito"', () => {
        for (const ab of [null, 'janela'] as const) {
            const r = padrao([MENSAGEM_REAL], item(1500, 1300, 5), ab)
            expect(r.decisao).toEqual({ tipologia: 'DP-07' })
            expect(r.atributos).toContainEqual({ atributo: 'panos', valor: '1', origem: 'dito' })
            expect(r.atributos).toContainEqual({ atributo: 'persiana', valor: 'com', origem: 'dito' })
            expect(r.atributos).toContainEqual({ atributo: 'folhas', valor: '2', origem: 'padrao_da_tipologia' })
        }
    })
    it('a linha da esquadria fala por ela: sem a ligação pela medida, a janela juntaria correr e maxim-ar das OUTRAS linhas', () => {
        // a mesma mensagem, mas a esquadria com uma medida que nenhuma linha traz: volta o de antes (os trechos da abertura) — e não há padrão
        expect(padrao([MENSAGEM_REAL], item(1700, 1300, 5), 'janela').decisao).toEqual({ motivo: 'TIPOS_DITOS' })
    })
    it('a lista ao modelo leva a DP-07 e corta giro e oscilo (a persiana afirma correr); a linha do cliente não é trecho', () => {
        const f = filtrarPeloAcumulado(CANDIDATOS, [MENSAGEM_REAL])
        const ids = f.candidatos.map((c) => c.tipologia)
        expect(ids).toContain('DP-07')
        expect(ids).not.toContain('DP-116')
        expect(ids).not.toContain('DP-124')
        expect(f.lidos.map((t) => t.texto)).not.toContain('Cliente: Beatriz Fonseca')
    })
    it('o CONSIDERADO da DP-07 diz o pano; o da DP-16 (com QP) não presume número', () => {
        const de = (t: string) => { const c = CANDIDATOS.find((x) => x.tipologia === t)!; return oQueAEsquadriaE(c, null, panosDaNatureza(c, VARIAVEIS(c))) }
        expect(de('DP-07')).toBe('correr, 2 folhas · com persiana (1 pano) · sem bandeira · sem peitoril')
        expect(de('DP-16')).toBe('correr, 3 folhas · com persiana · sem bandeira · sem peitoril')
        expect(de('DP-02')).toBe('correr, 2 folhas · sem persiana · sem bandeira · sem peitoril')
    })
})

describe('O DITO QUE CONFERE, O QUE CONTRADIZ E O QUE A TIPOLOGIA NÃO AFIRMA', () => {
    it('CONTRADIZ: "3 panos" na DP-07 (sem QP, um pano por construção) é pergunta, com a frase sem código', () => {
        const d = padrao(['2 Persiana 1,50 x 1,30 3 panos'], item(1500, 1300)).decisao
        expect(d).toEqual({ motivo: 'CONTRADIZ_A_TIPOLOGIA', tipologia: 'DP-07', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS COM PERSIANA', dito: '3 panos', natureza: '1 pano' })
        const frase = fraseDoPadraoQueFalta(d)!
        expect(frase).toContain('1 pano')
        expect(frase).toContain('3 panos')
        expect(frase).not.toContain('DP-07')
    })
    it('NÃO AFIRMA: com QP (a DP-16, 3 folhas), sem as variáveis lidas, ou "pano" sem número — a regra de antes', () => {
        expect(padrao(['1 persiana 3 folhas 1,50 x 1,30 2 panos'], item(1500, 1300)).decisao).toEqual({ motivo: 'DITO_SEM_REPRESENTACAO' })
        expect(padrao(['2 Persiana 1,50 x 1,30 1 pano'], item(1500, 1300), null, () => null).decisao).toEqual({ motivo: 'DITO_SEM_REPRESENTACAO' })
        expect(padraoDaEsquadria(item(1500, 1300), null, filtrarPeloAcumulado(CANDIDATOS, ['2 Persiana 1,50 x 1,30 1 pano']).lidos, CANDIDATOS).decisao).toEqual({ motivo: 'DITO_SEM_REPRESENTACAO' })
        expect(padrao(['1 persiana 1,50 x 1,30 com pano'], item(1500, 1300)).decisao).toEqual({ motivo: 'DITO_SEM_REPRESENTACAO' })
        expect(padrao(['1 persiana motorizada 1,50 x 1,30'], item(1500, 1300)).decisao).toEqual({ motivo: 'DITO_SEM_REPRESENTACAO' })
    })
    it('sem panos ditos, a DP-07 continua o padrão (nada muda para quem não fala de pano); porta persiana: DP-48 com 1 pano', () => {
        expect(padrao(['2 Persiana 1,50 x 1,30'], item(1500, 1300)).decisao).toEqual({ tipologia: 'DP-07' })
        expect(padrao(['1 porta persiana 2,00 x 2,20 1 pano'], item(2000, 2200)).decisao).toEqual({ tipologia: 'DP-48' })
        expect(padrao(['1 porta persiana 2,00 x 2,20 2 panos'], item(2000, 2200)).decisao).toMatchObject({ motivo: 'CONTRADIZ_A_TIPOLOGIA', tipologia: 'DP-48' })
    })
    it('os panos com número, e o número que é o fim de uma medida não é pano ("1,30 pano")', () => {
        expect(panosDitos('2 Persiana 1,50 x 1,30 1 pano')).toBe(1)
        expect(panosDitos('persiana de dois panos')).toBe(2)
        expect(panosDitos('1 persiana 1,50 x 1,30 pano')).toBeNull()
        expect(atributosDitos('2 Persiana 1 pano').semRepresentacao).toBe(false)
        expect(atributosDitos('persiana com pano').semRepresentacao).toBe(true)
    })
    it('panosDaNatureza: 1 só com persiana e sem QP; null com QP, sem persiana ou sem variáveis', () => {
        const c = (t: string) => CANDIDATOS.find((x) => x.tipologia === t)!
        expect(panosDaNatureza(c('DP-07'), ['ARR'])).toBe(1)
        expect(panosDaNatureza(c('DP-07'), ['ARR', 'QP'])).toBeNull()
        expect(panosDaNatureza(c('DP-02'), ['ARR'])).toBeNull()
        expect(panosDaNatureza(c('DP-07'), null)).toBeNull()
    })
    it('a folha (arquivo do levantamento) lê as variáveis da tipologia NA FAMÍLIA do item', () => {
        const dp07 = { descricao: MOTOR[2][1], tipo: 'Correr', linha: 'PVC WOLFF EUROPA 42' }
        const def = (vars: string[] | null) => () => (vars === null ? null : { variaveis: vars.map((variavel) => ({ variavel })) }) as never
        expect(panosDaPersiana(dp07, { tipologia: 'DP-07', familia: 'PVC' }, def(['ARR', 'AE']))).toBe(1)
        expect(panosDaPersiana(dp07, { tipologia: 'DP-07', familia: 'PVC' }, def(['ARR', 'QP']))).toBeNull()
        expect(panosDaPersiana(dp07, { tipologia: 'DP-07', familia: 'PVC' }, def(null))).toBeNull()
    })
})

describe('O VOCABULÁRIO DA OBRA: "persiana" = janela de correr com persiana; "porta persiana" = porta de correr com persiana', () => {
    it.each([
        ['2 Persiana 1,50 x 1,30 1 pano', 'janela', ['Correr']],
        ['1 porta persiana 2,00 x 2,20', 'porta', ['Correr']],
        ['1 janela com persiana 1,50 x 1,30', 'janela', ['Correr']],
        ['1 janela de giro com persiana 1,50 x 1,30', 'janela', ['Giro / Abrir']],
    ])('"%s" → abertura %s, tipos %j', (linha, abertura, tipos) => {
        const [t] = trechosDoAcumulado([linha], TIPOS)
        expect(t.abertura).toBe(abertura)
        expect([...t.tipos]).toEqual(tipos)
    })
    it('"sem persiana", a linha sem persiana e o motor sem o tipo de correr: nada acrescentado', () => {
        expect(vocabularioDaObra('janela 1,50 x 1,30 sem persiana', TIPOS)).toBe('janela 1,50 x 1,30 sem persiana')
        expect(vocabularioDaObra('1 maxim ar 0,80 x 0,6', TIPOS)).toBe('1 maxim ar 0,80 x 0,6')
        expect(vocabularioDaObra('2 Persiana 1,50 x 1,30', ['Giro / Abrir'])).toBe('2 Persiana 1,50 x 1,30')
    })
})

describe('A LINHA DE ITEM: a medida N x N, e não "qualquer linha com dois números"', () => {
    it.each<[string, Array<[number, number]>]>([
        ['2 Persiana 1,50 x 1,30 1 pano', [[1500, 1300]]],
        ['Vão 1,50 x 1,30', [[1500, 1300]]],
        ['porta de correr 2000 x 2200, sala', [[2000, 2200]]],
        ['1 janela maxim ar, mini boreal 60 x60', [[600, 600]]],
        ['1 maxim ar 0,80 x 0,6', [[800, 600]]],
        ['2,50x2,20', [[2500, 2200]]],
        ['1,5 m x 1,2 m', [[1500, 1200]]],
        ['1500x1200mm', [[1500, 1200]]],
        ['Cliente: Beatriz Fonseca', []],
        ['Local: Caxias', []],
        ['400mm', []],
        ['vidro comum 6 mm incolor', []],
        ['Fone (51) 99999-9999', []],
        ['CEP 93.000-000', []],
        ['50000 x 1200', []],
        ['0 x 0', []],
        ['Cliente: Beatriz Fonseca, 2 filhos', []],
        ['1,50 x 1,30, cozinha', [[1500, 1300]]],
        // o erro que sobra, e por que é o lado seguro: passa por medida e só faz a lista ir inteira — nunca corta candidata
        ['2 x 3 unidades', [[2000, 3000]]],
    ])('"%s" → %j', (linha, esperadas) => {
        expect(medidasDaLinha(linha).map((m) => [m.largura_mm, m.altura_mm])).toEqual(esperadas)
    })
    it('a unidade pela grandeza: abaixo de 10 = metro ("1,50", "2"); 10 a 99 = cm; 100 em diante = mm; fora da faixa da conversa, nada', () => {
        expect([emMilimetros('1,5'), emMilimetros('2000'), emMilimetros('60'), emMilimetros('2'), emMilimetros('25000'), emMilimetros('0')]).toEqual([1500, 2000, 600, 2000, null, null])
        // a vírgula com dezena é centímetro, não metro ("60,5" = 605 mm, nunca 60.500)
        expect(emMilimetros('60,5')).toBe(605)
    })
    it('linha de item SEM abertura afirmada traz a lista inteira; sem ela, a lista é a das linhas que afirmam', () => {
        const so = filtrarPeloAcumulado(CANDIDATOS, ['1 janela maxim ar 60 x 60'])
        expect(so.candidatos.map((c) => c.tipologia)).toEqual(['DP-01'])
        const comItem = filtrarPeloAcumulado(CANDIDATOS, ['1 janela maxim ar 60 x 60\n2 esquadrias 1,50 x 1,30'])
        expect(comItem.candidatos).toHaveLength(CANDIDATOS.length)
        // a linha sem medida nem palavra não é linha de item
        const comCliente = filtrarPeloAcumulado(CANDIDATOS, ['1 janela maxim ar 60 x 60\nCliente: Beatriz Fonseca'])
        expect(comCliente.candidatos.map((c) => c.tipologia)).toEqual(['DP-01'])
    })
    it('a linha é da esquadria só com a largura E a altura dela', () => {
        const [t] = trechosDoAcumulado(['2 Persiana 1,50 x 1,30'], TIPOS)
        expect(linhaDaEsquadria(t, { largura_mm: 1500, altura_mm: 1300 })).toBe(true)
        expect(linhaDaEsquadria(t, { largura_mm: 1300, altura_mm: 1500 })).toBe(false)
        expect(linhaDaEsquadria(t, { largura_mm: 1500, altura_mm: null })).toBe(false)
        expect(linhaDaEsquadria(t, { largura_mm: 1500, altura_mm: 1200 })).toBe(false)
        // a medida nula nunca liga, nem contra outra nula
        expect(linhaDaEsquadria({ medidas: [{ largura_mm: 1500, altura_mm: null }] }, { largura_mm: 1500, altura_mm: null })).toBe(false)
    })
    it('duas linhas com a medida da esquadria e aberturas diferentes: a linha não decide a abertura (sem padrão)', () => {
        const r = padrao(['1 porta de correr 2,00 x 2,20\n1 janela de correr 2,00 x 2,20'], item(2000, 2200))
        expect(r.decisao).toEqual({ motivo: 'SEM_ABERTURA' })
    })
})
