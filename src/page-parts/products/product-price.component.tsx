import { ChangeEvent, FC } from 'react'
import { Card, Divider, InputNumber, Tooltip } from 'antd'
import { CalculatorOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import { ProductPriceInfoType } from './content.component'
import { CalcBaseType } from '@/types/calc-base.type'
import { LoggedUser } from '@/types/logged-user.type'
import { FormInstance } from 'antd/lib/form/Form'

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

interface Props {
  calcBase: CalcBaseType
  productPriceInfo: ProductPriceInfoType
  handleChangePrecificationInputs: (event: ChangeEvent<HTMLInputElement>) => void
  currentUser: LoggedUser
  productForm: FormInstance
  customTaxPercent?: number | null
  onCustomTaxPercentChange?: (value: number) => void
}

export const ProductPrice: FC<Props> = ({
  calcBase,
  productPriceInfo,
  handleChangePrecificationInputs,
  currentUser,
  productForm,
  customTaxPercent,
  onCustomTaxPercentChange,
}: Props) => {
  const isCalcTypeResale = currentUser?.calcType === CALC_TYPE_ENUM.RESALE
  const isCalcTypeService = currentUser?.calcType === CALC_TYPE_ENUM.SERVICE
  const isMei = !!calcBase.isMei

  const totalPrice = productPriceInfo.totalProductPrice
  const laborPct = Number(calcBase.indirectLaborPct) || 0
  const laborVal = totalPrice > 0 ? (totalPrice * (laborPct / 100)) : 0

  const fixedPct = calcBase.fixedExpensePct
  const fixedVal = productPriceInfo.fixedExpensePrice
  const variablePct = calcBase.variableExpensePct
  const variableVal = productPriceInfo.variableExpensePrice
  const financialPct = calcBase.financialExpensePct
  const financialVal = productPriceInfo.financialExpensePrice

  const taxPctBase = calcBase.taxPct
  const taxPctDisplay = customTaxPercent != null ? customTaxPercent : taxPctBase
  const taxValDisplay = productPriceInfo.taxesPrice
  const taxLabel = calcBase.taxLabel
    ? `Impostos (${calcBase.taxLabel})`
    : isMei ? 'Impostos (MEI — DAS fixo)' : 'Impostos'

  const commissionPct = productPriceInfo.salesCommissionPercent
  const commissionVal = productPriceInfo.salesCommissionPrice
  const profitPct = productPriceInfo.productProfitPercent
  const profitVal = productPriceInfo.productProfitPrice

  // When SERVICE, exclude laborPct and fixedPct from totalPct
  const totalPct = isCalcTypeService
    ? variablePct + financialPct + taxPctDisplay + commissionPct + profitPct
    : laborPct + fixedPct + variablePct + financialPct + taxPctDisplay + commissionPct + profitPct
  const costTotal = productPriceInfo.productCost
  const expensesTotal = isCalcTypeService
    ? variableVal + financialVal
    : laborVal + fixedVal + variableVal + financialVal
  const taxesTotal = taxValDisplay

  const yieldQty = Number(productForm.getFieldValue('quantity')) || 1
  const unit = productForm.getFieldValue('unitType')
  const pricePerUnit = totalPrice
  const priceRecipeTotal = totalPrice * yieldQty

  const fireChange = (name: string, value: number) => {
    handleChangePrecificationInputs({
      preventDefault: () => {},
      target: { name, value: String(value) },
    } as any)
  }

  function pricingRow(
    label: string,
    pct: number,
    val: number,
    editable?: 'salesCommissionPercent' | 'productProfitPercent' | 'customTaxPercent',
    tooltipText?: string,
  ) {
    const handleEditableChange = (v: number | null) => {
      if (editable === 'customTaxPercent' && onCustomTaxPercentChange) {
        onCustomTaxPercentChange(v ?? 0)
      } else if (editable) {
        fireChange(editable, v ?? 0)
      }
    }

    return (
      <tr key={label}>
        <td style={{ width: 140, padding: '6px 0' }}>
          {editable ? (
            <InputNumber
              size="small" min={0} max={99} step={0.1} precision={2}
              value={pct}
              onChange={handleEditableChange}
              style={{ width: 110 }}
              formatter={(v) => `${v}%`}
              parser={(v) => {
                const raw = (v || '0').toString().replace('%', '').replace(',', '.').trim()
                const n = Number(raw)
                return isNaN(n) ? 0 : n
              }}
            />
          ) : (
            <Tooltip title={tooltipText || 'Calculado automaticamente a partir do fluxo de caixa. Altere em Configurações > Custos.'}>
              <span style={{
                display: 'inline-block', padding: '4px 12px', background: 'rgba(255,255,255,0.04)',
                borderRadius: 4, fontSize: 13, minWidth: 80, textAlign: 'right',
                cursor: 'help',
              }}>
                {pct.toFixed(2)}%
                <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 10, color: '#64748b' }} />
              </span>
            </Tooltip>
          )}
        </td>
        <td style={{ padding: '6px 12px', fontSize: 13 }}>
          {tooltipText ? (
            <Tooltip title={tooltipText}>
              <span style={{ cursor: 'help' }}>{label}</span>
            </Tooltip>
          ) : (
            label
          )}
        </td>
        <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>
          R$ {getMonetaryValue(val)}
        </td>
      </tr>
    )
  }

  return (
    <Card size="small" className="mt-5">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          <CalculatorOutlined style={{ marginRight: 6, color: '#F79009' }} />
          Precificação final do produto
        </h3>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Custo produto</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#B42318' }}>{fmt(costTotal)}</div>
        </div>
      </div>

      {isMei && (
        <div style={{
          background: '#FFFBE6', border: '1px solid #FFE58F', borderRadius: 8,
          padding: '8px 14px', fontSize: 12, color: '#614700', marginBottom: 12,
        }}>
          <strong>MEI:</strong> Impostos não são calculados por produto. O DAS mensal é fixo e independente do faturamento por item.
        </div>
      )}

      <div style={{ background: '#0a1628', borderRadius: 8, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 2px' }}>
          <thead>
            <tr style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' as const }}>
              <th style={{ textAlign: 'left', padding: '0 0 8px', width: 140 }}>%</th>
              <th style={{ textAlign: 'left', padding: '0 12px 8px' }}>Despesa</th>
              <th style={{ textAlign: 'right', padding: '0 0 8px' }}>Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            {!isCalcTypeService && pricingRow('Mão de obra administrativa', laborPct, laborVal, undefined, 'Despesas de mão de obra administrativa (pró-labore, salários comerciais e administrativos) calculadas a partir do fluxo de caixa. Configure em Configurações > Equipe e Custos.')}
            {!isCalcTypeService && pricingRow('Despesas fixas', fixedPct, fixedVal)}
            {pricingRow('Despesas variáveis', variablePct, variableVal)}
            {pricingRow('Despesas financeiras', financialPct, financialVal)}
            {pricingRow(taxLabel, taxPctDisplay, taxValDisplay, 'customTaxPercent', 'Alíquota efetiva herdada do regime tributário. Edite para ajustar apenas neste produto/serviço.')}
            {pricingRow(
              'Comissão total do vendedor',
              commissionPct,
              commissionVal,
              'salesCommissionPercent',
              'Se deixar 0%, a comissão cadastrada no funcionário será aplicada automaticamente.'
            )}
            {pricingRow('Lucro', profitPct, profitVal, 'productProfitPercent')}
          </tbody>
        </table>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
          <span style={{ color: '#94a3b8' }}>Margem de contribuição total aplicada</span>
          <span style={{ fontWeight: 600 }}>{(100 - totalPct).toFixed(2)}%</span>
        </div>

        {/* Result box */}
        <div style={{
          padding: '16px 20px', borderRadius: 8, marginTop: 12,
          background: totalPrice > 0 ? '#ECFDF5' : '#FEF2F2',
          border: `1px solid ${totalPrice > 0 ? '#6CE9A6' : '#FDA29B'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Tooltip title="Este é o preço de venda por unidade (igual ao campo Preço de venda salvo no produto). Não confundir com o lucro líquido à direita.">
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: 0.5, cursor: 'help' }}>
                  Preço de Venda por Unidade
                </div>
              </Tooltip>
              <div style={{ fontSize: 28, fontWeight: 800, color: pricePerUnit > 0 ? '#027A48' : '#B42318' }}>
                {fmt(pricePerUnit)}
              </div>
              {yieldQty > 1 && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Total receita ({yieldQty} {unit || 'UN'}): {fmt(priceRecipeTotal)}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Lucro líquido</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: profitVal >= 0 ? '#027A48' : '#B42318' }}>
                {fmt(profitVal)}
              </div>
              {totalPrice > 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Margem: {profitPct.toFixed(2)}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Composition bar */}
        {totalPrice > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Composição do preço</div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
              <Tooltip title={`Custo: ${fmt(costTotal)}`}>
                <div style={{ width: `${(costTotal / totalPrice) * 100}%`, background: '#F04438' }} />
              </Tooltip>
              <Tooltip title={`Despesas: ${fmt(expensesTotal)}`}>
                <div style={{ width: `${(expensesTotal / totalPrice) * 100}%`, background: '#F79009' }} />
              </Tooltip>
              <Tooltip title={`Impostos: ${fmt(taxesTotal)}`}>
                <div style={{ width: `${(taxesTotal / totalPrice) * 100}%`, background: '#667085' }} />
              </Tooltip>
              <Tooltip title={`Comissão: ${fmt(commissionVal)}`}>
                <div style={{ width: `${(commissionVal / totalPrice) * 100}%`, background: '#7A5AF8' }} />
              </Tooltip>
              <Tooltip title={`Lucro: ${fmt(profitVal)}`}>
                <div style={{ width: `${(profitVal / totalPrice) * 100}%`, background: '#12B76A' }} />
              </Tooltip>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: '#94a3b8', flexWrap: 'wrap' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#F04438', marginRight: 3 }} />Custo</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#F79009', marginRight: 3 }} />Despesas</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#667085', marginRight: 3 }} />Impostos</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#7A5AF8', marginRight: 3 }} />Comissão</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#12B76A', marginRight: 3 }} />Lucro</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
