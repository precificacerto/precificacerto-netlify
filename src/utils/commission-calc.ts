/**
 * Cálculo de comissão de uma venda — fonte única da verdade.
 *
 * Regra: usa sales.commission_amount se preenchido (>0); caso contrário,
 * recalcula a partir dos sale_items somando qty × unit_price × commission_percent / 100.
 */

export interface SaleItemForCommission {
  quantity?: number | string | null
  unit_price?: number | string | null
  commission_percent?: number | string | null
}

export interface SaleForCommission {
  commission_amount?: number | string | null
  final_value?: number | string | null
}

export interface CommissionBreakdown {
  comissaoPaga: number
  percentVendedor: number
  hasData: boolean
}

/**
 * Calcula comissão e % efetivo do vendedor para uma venda.
 *
 * @param sale linha de `sales`
 * @param saleItems linhas de `sale_items` correspondentes
 * @returns objeto com `comissaoPaga`, `percentVendedor` e `hasData` (false quando
 *          venda não tem nenhum dado para calcular comissão — útil para UI mostrar "—")
 */
export function computeSaleCommission(
  sale: SaleForCommission,
  saleItems: SaleItemForCommission[] = [],
): CommissionBreakdown {
  const valorVendido = Number(sale.final_value) || 0
  const commAmountFromSale = Number(sale.commission_amount) || 0

  // Soma comissão calculada item-a-item (fallback)
  let comissaoCalculadaItens = 0
  for (const it of saleItems) {
    const qty = Number(it.quantity) || 0
    const unitPrice = Number(it.unit_price) || 0
    const pct = Number(it.commission_percent) || 0
    comissaoCalculadaItens += qty * unitPrice * pct / 100
  }

  const comissaoPaga = commAmountFromSale > 0 ? commAmountFromSale : comissaoCalculadaItens
  const percentVendedor = valorVendido > 0 ? (comissaoPaga / valorVendido) * 100 : 0

  // hasData: false somente quando NÃO há commission_amount E NÃO há items com comissão
  const hasData = commAmountFromSale > 0 || saleItems.some(it => Number(it.commission_percent) > 0)

  return { comissaoPaga, percentVendedor, hasData }
}
