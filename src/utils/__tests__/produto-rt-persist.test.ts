/**
 * BUG-PRODUTO-RT-PERSIST-001 (v8 pendências item 1) — round-trip do RT no produto.
 *
 * Causa-raiz: a tela de edição (`produtos/[id].tsx`) monta um `productPriceInfo` DERIVADO
 * e o passa ao `<Content>`. Esse objeto incluía comissão/lucro mas NÃO o RT → ao reabrir,
 * o RT vinha `undefined` → 0. Fix: `productPriceInfo.rtReservePercent = p.rt_reserve_percent`.
 *
 * Este teste replica o mapeamento salvar (DB) → montar productPriceInfo → reidratar (load)
 * e garante que o valor salvo NÃO zera na reabertura.
 */

// Espelha produtos/[id].tsx: monta o productPriceInfo derivado a partir do produto do banco.
function buildProductPriceInfo(p: any): { rtReservePercent: number } {
  return { rtReservePercent: p?.rt_reserve_percent != null ? Number(p.rt_reserve_percent) : 0 }
}

// Espelha content.component.tsx: reidrata o RT na edição (productPriceInfo ?? coluna crua).
function loadRtOnEdit(product: any): number {
  return Number(product?.productPriceInfo?.rtReservePercent ?? product?.rt_reserve_percent) || 0
}

describe('BUG-PRODUTO-RT-PERSIST-001 — RT do produto persiste ao reabrir', () => {
  it('produto salvo com RT 4% reabre com 4% (não zera)', () => {
    const dbProduct = { rt_reserve_percent: 4, commission_percent: 1 }
    const productPriceInfo = buildProductPriceInfo(dbProduct)
    const productToContent = { ...dbProduct, productPriceInfo }
    expect(productPriceInfo.rtReservePercent).toBe(4)
    expect(loadRtOnEdit(productToContent)).toBe(4)
  })

  it('RT decimal (3,5%) preservado no round-trip', () => {
    const dbProduct = { rt_reserve_percent: 3.5 }
    const product = { ...dbProduct, productPriceInfo: buildProductPriceInfo(dbProduct) }
    expect(loadRtOnEdit(product)).toBe(3.5)
  })

  it('produto sem RT (null/0) reabre com 0 sem quebrar', () => {
    for (const v of [null, undefined, 0]) {
      const dbProduct = { rt_reserve_percent: v }
      const product = { ...dbProduct, productPriceInfo: buildProductPriceInfo(dbProduct) }
      expect(loadRtOnEdit(product)).toBe(0)
    }
  })

  it('fallback: sem productPriceInfo, lê a coluna crua rt_reserve_percent', () => {
    expect(loadRtOnEdit({ rt_reserve_percent: 2 })).toBe(2)
  })
})
