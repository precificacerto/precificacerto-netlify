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

/**
 * Como o funcionário recebe a comissão (`employees.commission_payment_mode`).
 *  - FULL: valor total no mês da venda.
 *  - INSTALLMENT: acompanha o parcelamento do cliente.
 */
export type CommissionPaymentMode = 'FULL' | 'INSTALLMENT'

/**
 * A comissão deste funcionário se distribui pelas parcelas do CLIENTE?
 *
 * D7 — regra do dono do produto: quem é FULL recebe integral na data da venda,
 * INDEPENDENTEMENTE de o cliente ter parcelado. Só quem é INSTALLMENT acompanha o
 * parcelamento do cliente.
 *
 * A decisão é do CADASTRO DO FUNCIONÁRIO, e só dele. O defeito corrigido era um
 * `|| saleInstallments > 1` que deixava o parcelamento do cliente sequestrar o modo do
 * funcionário: bastava o cliente dividir em 2x para um funcionário FULL passar a receber
 * fatiado. `sales.installments` descreve como o CLIENTE paga a empresa; não tem relação
 * com o acordo entre a empresa e o vendedor.
 *
 * Qualquer valor que não seja INSTALLMENT (inclusive nulo) é FULL — mesmo default do
 * cadastro (`commission_payment_mode || 'FULL'`).
 */
export function shouldSplitCommissionByInstallments(
  paymentMode: CommissionPaymentMode | string | null | undefined,
): boolean {
  return String(paymentMode ?? '').trim().toUpperCase() === 'INSTALLMENT'
}

export interface CommissionBreakdown {
  comissaoPaga: number
  percentVendedor: number
  hasData: boolean
  /** Sprint Mai/2026 — true quando o valor foi derivado do cadastro do funcionário (vendas legacy). */
  isFromEmployeeFallback?: boolean
}

/**
 * Calcula comissão e % efetivo do vendedor para uma venda.
 *
 * Cadeia de fallback (primeiro hit ganha):
 *   1. sales.commission_amount > 0                       (vendas novas)
 *   2. Σ sale_items.qty × unit_price × commission_percent (vendas com itens preservados)
 *   3. employees.commission_percent × final_value        (vendas legacy, opt-in via param)
 *
 * @param sale linha de `sales`
 * @param saleItems linhas de `sale_items` correspondentes
 * @param employeeCommissionPercent (opcional) % do cadastro do funcionário associado à venda;
 *                                  usado como último fallback quando os outros dois falham.
 */
export function computeSaleCommission(
  sale: SaleForCommission,
  saleItems: SaleItemForCommission[] = [],
  employeeCommissionPercent?: number | string | null,
): CommissionBreakdown {
  const valorVendido = Number(sale.final_value) || 0
  const commAmountFromSale = Number(sale.commission_amount) || 0

  // Nível 1: sales.commission_amount
  if (commAmountFromSale > 0) {
    const pct = valorVendido > 0 ? (commAmountFromSale / valorVendido) * 100 : 0
    return { comissaoPaga: commAmountFromSale, percentVendedor: pct, hasData: true }
  }

  // Nível 2: soma item-a-item
  let comissaoCalculadaItens = 0
  let algumItemTemComissao = false
  for (const it of saleItems) {
    const qty = Number(it.quantity) || 0
    const unitPrice = Number(it.unit_price) || 0
    const pct = Number(it.commission_percent) || 0
    if (pct > 0) algumItemTemComissao = true
    comissaoCalculadaItens += qty * unitPrice * pct / 100
  }
  if (algumItemTemComissao) {
    const pct = valorVendido > 0 ? (comissaoCalculadaItens / valorVendido) * 100 : 0
    return { comissaoPaga: comissaoCalculadaItens, percentVendedor: pct, hasData: true }
  }

  // Nível 3: cadastro do funcionário (vendas legacy)
  const empPct = Number(employeeCommissionPercent) || 0
  if (empPct > 0 && valorVendido > 0) {
    const comissaoFallback = (empPct / 100) * valorVendido
    return {
      comissaoPaga: comissaoFallback,
      percentVendedor: empPct,
      hasData: true,
      isFromEmployeeFallback: true,
    }
  }

  return { comissaoPaga: 0, percentVendedor: 0, hasData: false }
}
