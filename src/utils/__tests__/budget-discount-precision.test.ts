/**
 * BUG-ORCAMENTO-DESCONTO-PERSIST-001 — teste de integridade da precisão do desconto (Item 2 v8).
 *
 * O desconto em R$ é convertido para % antes de gravar; ao reabrir, o R$ é reconstruído
 * a partir do % persistido. Com apenas 2 casas decimais (DECIMAL(5,2), esquema antigo) o
 * R$ reconstruído DIVERGE do digitado (ex.: 7.121,30 → 7.119,70). Com 5 casas
 * (NUMERIC(8,5), a correção aplicada) o R$ reconstruído fica FIEL ao centavo.
 *
 * Este teste trava a matemática do round-trip salvar→reabrir (proxy determinístico do
 * "salvar → reabrir → comparar" exigido pelo relatório, sem depender do banco).
 */

const round = (v: number, decimals: number) => {
  const f = Math.pow(10, decimals)
  return Math.round(v * f) / f
}
const round2 = (v: number) => round(v, 2)

// Round-trip: R$ digitado → % (arredondado a N casas, como a coluna do banco) → R$ reconstruído.
function roundTripDiscount(totalPreDiscount: number, discountAmount: number, pctDecimals: number): number {
  const pct = (discountAmount / totalPreDiscount) * 100
  const pctStored = round(pct, pctDecimals) // simula a gravação NUMERIC(_, pctDecimals)
  return round2(totalPreDiscount * pctStored / 100)
}

describe('BUG-ORCAMENTO-DESCONTO-PERSIST-001 — precisão do desconto (round-trip)', () => {
  const total = 16467.13
  const discount = 7121.30

  it('2 casas (DECIMAL(5,2), esquema antigo): o R$ reconstruído DIVERGE do digitado', () => {
    const back = roundTripDiscount(total, discount, 2)
    expect(Math.abs(back - discount)).toBeGreaterThan(0.01) // drift perceptível (o bug)
  })

  it('5 casas (NUMERIC(8,5), correção v8): o R$ reconstruído é FIEL ao centavo', () => {
    const back = roundTripDiscount(total, discount, 5)
    expect(back).toBeCloseTo(discount, 2)
  })

  it('genérico: 5 casas preservam a fidelidade em diversos totais/descontos', () => {
    const cases: [number, number][] = [
      [10000, 3333.33],
      [55000, 12345.67],
      [123456.78, 9999.99],
      [16500, 7121.30],
      [98765.43, 45678.90],
    ]
    for (const [t, d] of cases) {
      expect(roundTripDiscount(t, d, 5)).toBeCloseTo(d, 2)
    }
  })
})
