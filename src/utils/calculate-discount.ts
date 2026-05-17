// NOTA: esta função é a referência canônica da spec "Desconto com Preservação
// Operacional" (precificação por dentro). Atualmente os call sites de produção
// (orçamentos e agenda) implementam a redistribuição inline com proporção real.
// Mantida aqui alinhada à spec para reuso futuro e evitar regressão silenciosa.

export type DiscountMode = 'PROPORTIONAL' | 'PROFIT_REDUCTION' | 'SELLER_REDUCTION'

/**
 * Calcula o desconto preservando custos estruturais e absorvendo o impacto
 * econômico apenas na margem (comissão + lucro). Implementa a metodologia de
 * "Desconto com Preservação Operacional" para precificação por dentro.
 *
 * `discountPercent` é % DA MARGEM (commission + profit), não % absoluto sobre
 * o preço. O `mode` controla como a redução é distribuída entre comissão e lucro:
 *   - PROPORTIONAL     → proporcional ao peso original de cada elemento
 *                        (spec 4.0.10/4.0.11):
 *                          commReduction = discountValue × (COMo / (COMo + LUCo))
 *                          profitReduction = discountValue × (LUCo / (COMo + LUCo))
 *                        Quando commissionPercent/profitPercent não são informados,
 *                        cai em 50/50 (comportamento legacy).
 *   - PROFIT_REDUCTION → toda a redução sai do lucro
 *   - SELLER_REDUCTION → toda a redução sai da comissão do vendedor
 *
 * @param salePrice - Preço de venda completo (R$ 200, p.ex.)
 * @param costWithTaxes - Custo + impostos preservados (R$ 100, p.ex.)
 * @param discountPercent - Percentual de desconto (0-100) da margem
 * @param mode - Distribuição entre comissão e lucro (default: PROPORTIONAL)
 * @param commissionPercent - Comissão original do item (% sobre preço). Opcional;
 *                            quando informado, PROPORTIONAL usa a proporção real.
 * @param profitPercent - Lucro original do item (% sobre preço). Opcional;
 *                        quando informado, PROPORTIONAL usa a proporção real.
 */
export function calculateDiscountedPrice(
  salePrice: number,
  costWithTaxes: number,
  discountPercent: number,
  mode: DiscountMode = 'PROPORTIONAL',
  commissionPercent?: number,
  profitPercent?: number,
): { finalPrice: number; discountValue: number; commissionReduction: number; profitReduction: number } {
  if (discountPercent <= 0) {
    return { finalPrice: salePrice, discountValue: 0, commissionReduction: 0, profitReduction: 0 }
  }

  const margin = Math.max(0, salePrice - costWithTaxes)
  const clampedPercent = Math.min(discountPercent, 100)
  const discountValue = margin * clampedPercent / 100
  const finalPrice = salePrice - discountValue

  let commissionReduction: number
  let profitReduction: number
  switch (mode) {
    case 'PROFIT_REDUCTION':
      commissionReduction = 0
      profitReduction = discountValue
      break
    case 'SELLER_REDUCTION':
      commissionReduction = discountValue
      profitReduction = 0
      break
    case 'PROPORTIONAL':
    default: {
      // Spec 4.0.10/4.0.11: divisão proporcional ao peso ORIGINAL de comissão e lucro.
      // Ex: commission 3% + profit 5% → comissão absorve 3/8 (37,5%), lucro absorve 5/8 (62,5%).
      const comm = Number(commissionPercent) || 0
      const prof = Number(profitPercent) || 0
      const combined = comm + prof
      if (combined > 0) {
        commissionReduction = discountValue * (comm / combined)
        profitReduction = discountValue * (prof / combined)
      } else {
        // Fallback legacy quando os pesos não são informados: divide em 50/50.
        commissionReduction = discountValue / 2
        profitReduction = discountValue / 2
      }
    }
  }

  return { finalPrice, discountValue, commissionReduction, profitReduction }
}
