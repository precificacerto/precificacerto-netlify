/**
 * @jest-environment node
 *
 * PORTÃO — o RATEIO DA OPERAÇÃO INTERNA pelos itens do orçamento I.A. (dono do produto, 10 e 11/11/2026): fecha EXATO com a interna, o total
 * de cada item é unitário × quantidade, o maior resto com desempate pela ordem, e a recusa nomeada quando nenhuma partilha em centavos fecha.
 */
import {
    FRASE_DA_INTERNA_NAO_POSITIVA, FRASE_SEM_ITENS, fraseDaInternaForaDoCentavo, fraseDaQuantidade, fraseDaSobra, fraseDoPeso, ratearOperacaoInterna, reais,
} from '@/lib/atendimentos-ia/rateio-do-orcamento'

const ok = (r: ReturnType<typeof ratearOperacaoInterna>) => { if (!r.ok) throw new Error(r.recusa); return r }
const soma = (r: ReturnType<typeof ok>) => r.itens.reduce((s, i) => s + i.total, 0)

describe('fecha EXATO, e o total do item é unitário × quantidade', () => {
    it('o Geraldo Huck (os custos líquidos totais gravados em produção, quantidades 1, 1 e 2): Σ = a interna, ao centavo', () => {
        const r = ok(ratearOperacaoInterna(7488.37, [
            { ordem: 1, quantidade: 1, peso: 2594.1460708438594 }, { ordem: 2, quantidade: 1, peso: 421.20919696309227 }, { ordem: 3, quantidade: 2, peso: 2225.040406033957 },
        ]))
        expect(soma(r)).toBe(748837)
        expect(r.centavos).toBe(748837)
        for (const i of r.itens) expect(i.total).toBe(i.unitario * i.quantidade)
    })
    it('o caso do WVetro (2 unidades): o total é exatamente o dobro do unitário — nunca 2.198,25 para 1.099,13', () => {
        const r = ok(ratearOperacaoInterna(3297.39, [{ ordem: 1, quantidade: 1, peso: 1 }, { ordem: 2, quantidade: 2, peso: 2 }]))
        const dois = r.itens.find((i) => i.ordem === 2)!
        expect(dois.total).toBe(dois.unitario * 2)
        expect(soma(r)).toBe(329739)
    })
    it('a proporção é a do custo: o item de custo dobrado leva o dobro (a menos de centavos)', () => {
        const r = ok(ratearOperacaoInterna(300, [{ ordem: 1, quantidade: 1, peso: 100 }, { ordem: 2, quantidade: 1, peso: 200 }]))
        expect(r.itens.map((i) => i.total)).toEqual([10000, 20000])
    })
})

describe('o maior resto, com desempate determinístico', () => {
    it('três itens iguais e 1,00: o centavo que sobra vai à MENOR ordem', () => {
        const r = ok(ratearOperacaoInterna(1, [{ ordem: 3, quantidade: 1, peso: 5 }, { ordem: 1, quantidade: 1, peso: 5 }, { ordem: 2, quantidade: 1, peso: 5 }]))
        expect(Object.fromEntries(r.itens.map((i) => [i.ordem, i.total]))).toEqual({ 1: 34, 2: 33, 3: 33 })
    })
    it('o maior resto vence a ordem: o item de ordem maior com resto maior leva o centavo', () => {
        // 0,10 entre pesos 1 e 2: quinhões 3,33 e 6,67 centavos -> pisos 3 e 6, restos 0,33 e 0,67: o centavo é do item 2
        const r = ok(ratearOperacaoInterna(0.1, [{ ordem: 1, quantidade: 1, peso: 1 }, { ordem: 2, quantidade: 1, peso: 2 }]))
        expect(r.itens.map((i) => i.total)).toEqual([3, 7])
    })
    it('a ordem de entrada não muda nada: o mesmo orçamento dá o mesmo arquivo', () => {
        const itens = [{ ordem: 1, quantidade: 2, peso: 7 }, { ordem: 2, quantidade: 1, peso: 3 }, { ordem: 3, quantidade: 3, peso: 11 }]
        const a = ok(ratearOperacaoInterna(1234.57, itens))
        const b = ok(ratearOperacaoInterna(1234.57, [...itens].reverse()))
        const porOrdem = (r: ReturnType<typeof ok>) => [...r.itens].sort((x, y) => x.ordem - y.ordem)
        expect(porOrdem(b)).toEqual(porOrdem(a))
        expect(soma(a)).toBe(123457)
    })
    it('a sobra que pede um item de 3 unidades e não de 2 é achada (não é o primeiro da fila que decide sozinho)', () => {
        // quinhões: 0,03 total; pesos iguais; quantidades 2 e 3 -> pisos 0 e 0, sobra 3: só o item de 3 unidades fecha
        const r = ok(ratearOperacaoInterna(0.03, [{ ordem: 1, quantidade: 2, peso: 1 }, { ordem: 2, quantidade: 3, peso: 1 }]))
        expect(r.itens.map((i) => [i.unitario, i.total])).toEqual([[0, 0], [1, 3]])
    })
})

describe('as recusas, nomeadas — nunca aproxima', () => {
    it('todas as quantidades pares e um centavo ímpar: recusa, com a sobra e o divisor', () => {
        const r = ratearOperacaoInterna(10.01, [{ ordem: 1, quantidade: 2, peso: 1 }, { ordem: 2, quantidade: 4, peso: 1 }])
        expect(r).toEqual({ ok: false, recusa: fraseDaSobra(1, [2, 4], 2) })
    })
    it('a interna fora do centavo, zero ou negativa; sem itens; quantidade e peso inválidos', () => {
        expect(ratearOperacaoInterna(10.005, [{ ordem: 1, quantidade: 1, peso: 1 }])).toEqual({ ok: false, recusa: fraseDaInternaForaDoCentavo(10.005) })
        expect(ratearOperacaoInterna(0, [{ ordem: 1, quantidade: 1, peso: 1 }])).toEqual({ ok: false, recusa: FRASE_DA_INTERNA_NAO_POSITIVA })
        expect(ratearOperacaoInterna(10, [])).toEqual({ ok: false, recusa: FRASE_SEM_ITENS })
        expect(ratearOperacaoInterna(10, [{ ordem: 4, quantidade: 1.5, peso: 1 }])).toEqual({ ok: false, recusa: fraseDaQuantidade(4) })
        expect(ratearOperacaoInterna(10, [{ ordem: 4, quantidade: 0, peso: 1 }])).toEqual({ ok: false, recusa: fraseDaQuantidade(4) })
        expect(ratearOperacaoInterna(10, [{ ordem: 5, quantidade: 1, peso: 0 }])).toEqual({ ok: false, recusa: fraseDoPeso(5) })
        expect(ratearOperacaoInterna(10, [{ ordem: 5, quantidade: 1, peso: NaN }])).toEqual({ ok: false, recusa: fraseDoPeso(5) })
    })
    it('reais no formato brasileiro', () => {
        expect(reais(219826)).toBe('R$ 2.198,26')
        expect(reais(5)).toBe('R$ 0,05')
    })
})
