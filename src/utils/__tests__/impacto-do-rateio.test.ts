/**
 * O AVISO DE IMPACTO DO RATEIO — §9 do comando de 21/09/2026.
 *
 *   > Nada é regravado em massa; mostrar "% antes × % depois" e a lista de produtos afetados
 *   > com preço atual × recalculado.
 *
 * >>> O QUE ESTE ARQUIVO PRECISA DISTINGUIR <<<
 *
 * Um caso que só afirmasse "o preço novo é maior" ficaria verde com a fórmula errada — quase
 * toda fórmula que soma o delta ao preço dá um número maior. Por isso os casos afirmam o
 * NÚMERO que a construção `P = Custo ÷ MC` produz, e o confrontam com o que a soma ingênua
 * daria.
 */
import { calcularImpactoDoRateio, houveMudancaDoPercentual } from '@/utils/impacto-do-rateio'

/**
 * Custo 600,00 e preço 1.000,00.
 *
 * A MC é `Custo ÷ Preço` = **60,00%**, porque `P = Custo ÷ MC` (R7). Os 40% que sobram são a
 * SOMA DOS PERCENTUAIS (despesa, comissão, lucro, imposto) — MC e markup não são a mesma
 * coisa, e a primeira versão deste arquivo os trocou. O caso abaixo foi escrito afirmando
 * 40% e a própria execução o desmentiu: `hipotese-derrubada-pela-propria-medicao.md`.
 */
const PRODUTO = { id: 'p1', nome: 'Cadeira', custoAtual: 600, precoAtual: 1000 }

describe('§9 — o preço recalculado sai da construção, não de uma soma', () => {
  const [r] = calcularImpactoDoRateio({ pctAntes: 22, pctDepois: 24.5, produtos: [PRODUTO] })

  it('a MC atual é LIDA do par gravado: 600 ÷ 1.000 = 60,00%', () => {
    expect(r.mcAtual).toBeCloseTo(0.6, 10)
  })

  it('>>> 2,50 pontos a mais de despesa comem 2,50 pontos da MC: 60,00% → 57,50% <<<', () => {
    expect(r.mcNova).toBeCloseTo(0.575, 10)
  })

  it('>>> e o preço é 600 ÷ 0,575 = 1.043,48 — NÃO os 1.025,00 da soma ingênua <<<', () => {
    expect(r.precoNovo).toBeCloseTo(1043.4783, 3)
    expect(r.variacao).toBeCloseTo(43.4783, 3)
    // A soma ingênua (preço × (1 + Δ)) daria 1.025,00. O caso DISCRIMINA as duas fórmulas —
    // e a diferença de R$ 18,48 num preço de mil reais é o que ela custaria.
    expect(r.precoNovo).not.toBeCloseTo(1025, 2)
  })

  it('o percentual CAINDO devolve preço menor, pela mesma identidade', () => {
    const [queda] = calcularImpactoDoRateio({ pctAntes: 24.5, pctDepois: 22, produtos: [PRODUTO] })
    expect(queda.mcNova).toBeCloseTo(0.625, 10)
    expect(queda.precoNovo).toBeCloseTo(600 / 0.625, 4)
    expect(queda.variacao as number).toBeLessThan(0)
  })

  it('sem mudança de percentual, o preço novo é o atual', () => {
    const [igual] = calcularImpactoDoRateio({ pctAntes: 22, pctDepois: 22, produtos: [PRODUTO] })
    expect(igual.precoNovo).toBeCloseTo(1000, 10)
    expect(igual.variacao).toBeCloseTo(0, 10)
  })
})

describe('>>> O que NÃO é apurável devolve `null`, e `null` não é zero <<<', () => {
  it.each([
    ['sem preço gravado', { ...PRODUTO, precoAtual: 0 }],
    ['sem custo gravado', { ...PRODUTO, custoAtual: 0 }],
    ['preço negativo', { ...PRODUTO, precoAtual: -10 }],
  ])('%s: MC, preço novo e variação são null', (_nome, produto) => {
    const [r] = calcularImpactoDoRateio({ pctAntes: 22, pctDepois: 24.5, produtos: [produto] })
    expect(r.mcAtual).toBeNull()
    expect(r.precoNovo).toBeNull()
    expect(r.variacao).toBeNull()
    expect(r.precoNovo).not.toBe(0)
  })

  it('>>> MC que ZERA ou vira negativa não tem preço — e não devolve um número enorme <<<', () => {
    // MC de 60% com +65 pontos de despesa: não existe preço que feche.
    const [r] = calcularImpactoDoRateio({ pctAntes: 0, pctDepois: 65, produtos: [PRODUTO] })
    expect(r.mcNova).toBeCloseTo(-0.05, 10)
    expect(r.precoNovo).toBeNull()
  })
})

describe('O limiar do aviso é o centésimo — a casa em que o dado existe', () => {
  it.each([[22, 24.5, true], [22, 22.004, false], [22, 22.01, true], [22, 22, false]])(
    '%s → %s avisa? %s', (a, d, esperado) => {
      expect(houveMudancaDoPercentual(a, d)).toBe(esperado)
    })

  it('percentual ausente não dispara aviso — não se avisa sobre o que não se sabe', () => {
    expect(houveMudancaDoPercentual(null, 24.5)).toBe(false)
    expect(houveMudancaDoPercentual(22, undefined)).toBe(false)
  })
})

describe('A lista inteira, como a tela a exibe', () => {
  it('cada produto tem o seu número, e um sem preço não contamina os outros', () => {
    const r = calcularImpactoDoRateio({
      pctAntes: 22, pctDepois: 24.5,
      produtos: [PRODUTO, { id: 'p2', nome: 'Mesa', custoAtual: 300, precoAtual: 0 }],
    })
    expect(r).toHaveLength(2)
    expect(r[0].precoNovo).toBeCloseTo(1043.4783, 3)
    expect(r[1].precoNovo).toBeNull()
  })
})
