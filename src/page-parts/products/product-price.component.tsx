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
  additionalIrpjPercent?: number
  onAdditionalIrpjChange?: (value: number) => void
  freightValue?: number
  onFreightChange?: (value: number) => void
  insuranceValue?: number
  onInsuranceChange?: (value: number) => void
  accessoryExpensesValue?: number
  onAccessoryExpensesChange?: (value: number) => void
}

export const ProductPrice: FC<Props> = ({
  calcBase,
  productPriceInfo,
  handleChangePrecificationInputs,
  currentUser,
  productForm,
  customTaxPercent,
  onCustomTaxPercentChange,
  additionalIrpjPercent,
  onAdditionalIrpjChange,
  freightValue = 0,
  onFreightChange,
  insuranceValue = 0,
  onInsuranceChange,
  accessoryExpensesValue = 0,
  onAccessoryExpensesChange,
}: Props) => {
  const isCalcTypeResale = currentUser?.calcType === CALC_TYPE_ENUM.RESALE
  const isCalcTypeService = currentUser?.calcType === CALC_TYPE_ENUM.SERVICE
  const isMei = !!calcBase.isMei
  const isLucroReal = currentUser?.taxableRegime === 'LUCRO_REAL'
  const isLucroPresumed = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO' || currentUser?.taxableRegime === 'LUCRO_PRESUMIDO_RET'
  const showIrpjCsll = isLucroReal || isLucroPresumed

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

  const yieldQty = Number(productForm.getFieldValue('quantity')) || 1
  const unit = productForm.getFieldValue('unitType')
  const pricePerUnit = totalPrice
  const priceRecipeTotal = totalPrice * yieldQty

  // Atividades Terceirizadas (apenas LUCRO_REAL): somadas ao preço de venda
  const terceirizadasTotal = isLucroReal
    ? (freightValue || 0) + (insuranceValue || 0) + (accessoryExpensesValue || 0)
    : 0
  const finalSalePrice = pricePerUnit + terceirizadasTotal

  // LUCRO_REAL / LUCRO_PRESUMIDO: IRPJ = 15% do lucro, CSLL = 9% do lucro
  const irpjVal = showIrpjCsll ? profitVal * 0.15 : 0
  const csllVal = showIrpjCsll ? profitVal * 0.09 : 0
  // % displayed = valor / preço de venda (quanto representa no preço final)
  const irpjPct = showIrpjCsll && pricePerUnit > 0 ? (irpjVal / pricePerUnit) * 100 : 0
  const csllPct = showIrpjCsll && pricePerUnit > 0 ? (csllVal / pricePerUnit) * 100 : 0
  // Adicional IRPJ apenas para LUCRO_REAL (preenchido manualmente)
  const adicionalIrpjPct = isLucroReal ? (additionalIrpjPercent || 0) : 0
  const adicionalIrpjVal = isLucroReal ? (pricePerUnit * adicionalIrpjPct / 100) : 0

  // Para LUCRO_REAL/PRESUMIDO: IRPJ+CSLL são calculados sobre o lucro, não no taxPctDisplay
  const taxContribution = showIrpjCsll
    ? irpjPct + csllPct + adicionalIrpjPct
    : taxPctDisplay

  // When SERVICE, exclude laborPct and fixedPct from totalPct
  const totalPct = isCalcTypeService
    ? variablePct + financialPct + taxContribution + commissionPct + profitPct
    : laborPct + fixedPct + variablePct + financialPct + taxContribution + commissionPct + profitPct
  const costTotal = productPriceInfo.productCost
  const expensesTotal = isCalcTypeService
    ? variableVal + financialVal
    : laborVal + fixedVal + variableVal + financialVal
  const taxesTotal = taxValDisplay

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
    editable?: 'salesCommissionPercent' | 'productProfitPercent' | 'customTaxPercent' | 'additionalIrpj',
    tooltipText?: string,
  ) {
    const handleEditableChange = (v: number | null) => {
      if (editable === 'customTaxPercent' && onCustomTaxPercentChange) {
        onCustomTaxPercentChange(v ?? 0)
      } else if (editable === 'additionalIrpj' && onAdditionalIrpjChange) {
        onAdditionalIrpjChange(v ?? 0)
      } else if (editable) {
        fireChange(editable, v ?? 0)
      }
    }

    return (
      <tr key={label}>
        <td style={{ width: 140, padding: '6px 0' }}>
          {editable ? (
            <InputNumber
              size="small" min={0} max={100} step={0.001} precision={3}
              value={pct}
              onChange={handleEditableChange}
              style={{ width: 110 }}
              formatter={(v) => {
                if (v == null || v === '') return '%'
                const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
                if (isNaN(n)) return '%'
                return n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%'
              }}
              parser={(v) => {
                const raw = (v || '0').toString().replace('%', '').replace(/\./g, '').replace(',', '.').trim()
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
                {pct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%
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
            {!showIrpjCsll && pricingRow(taxLabel, taxPctDisplay, taxValDisplay, 'customTaxPercent', 'Alíquota efetiva herdada do regime tributário. Edite para ajustar apenas neste produto/serviço.')}
            {pricingRow(
              'Comissão total do vendedor',
              commissionPct,
              commissionVal,
              'salesCommissionPercent',
              'Se deixar 0%, a comissão cadastrada no funcionário será aplicada automaticamente.'
            )}
            {pricingRow('Lucro', profitPct, profitVal, 'productProfitPercent')}
            {showIrpjCsll && pricingRow('IRPJ (15% sobre lucro)', irpjPct, irpjVal, undefined, 'Imposto de Renda Pessoa Jurídica — calculado automaticamente como 15% sobre o valor do lucro. A porcentagem exibida representa quanto esse imposto ocupa no preço de venda.')}
            {showIrpjCsll && pricingRow('CSLL (9% sobre lucro)', csllPct, csllVal, undefined, 'Contribuição Social sobre o Lucro Líquido — calculada automaticamente como 9% sobre o valor do lucro. A porcentagem exibida representa quanto esse imposto ocupa no preço de venda.')}
            {isLucroReal && pricingRow('Alíq. adicional IRPJ', adicionalIrpjPct, adicionalIrpjVal, 'additionalIrpj', 'Alíquota da parcela adicional do IRPJ. Informe manualmente conforme enquadramento.')}
          </tbody>
        </table>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
          <span style={{ color: '#94a3b8' }}>Margem de contribuição total aplicada</span>
          <span style={{ fontWeight: 600 }}>{(100 - totalPct).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</span>
        </div>

        {/* Atividades Terceirizadas — apenas LUCRO_REAL */}
        {isLucroReal && (
          <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 10 }}>
              Atividades Terceirizadas
            </div>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
              <tbody>
                {[
                  { label: 'Frete', value: freightValue, onChange: onFreightChange },
                  { label: 'Seguros', value: insuranceValue, onChange: onInsuranceChange },
                  { label: 'Despesas Acessórias', value: accessoryExpensesValue, onChange: onAccessoryExpensesChange },
                ].map(({ label, value, onChange }) => (
                  <tr key={label}>
                    <td style={{ fontSize: 13, color: '#cbd5e1', paddingRight: 12 }}>{label}</td>
                    <td style={{ textAlign: 'right' }}>
                      <InputNumber
                        size="small"
                        min={0}
                        step={0.01}
                        precision={2}
                        value={value}
                        onChange={(v) => onChange?.(v ?? 0)}
                        style={{ width: 130 }}
                        formatter={(v) => {
                          if (v == null || v === '') return 'R$ 0,00'
                          const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
                          if (isNaN(n)) return 'R$ 0,00'
                          return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        }}
                        parser={(v) => {
                          const raw = (v || '0').replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim()
                          const n = Number(raw)
                          return isNaN(n) ? 0 : n
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {terceirizadasTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#94a3b8' }}>
                <span>Total terceirizadas</span>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{fmt(terceirizadasTotal)}</span>
              </div>
            )}
          </div>
        )}

        {/* Result box */}
        <div style={{
          padding: '16px 20px', borderRadius: 8, marginTop: 12,
          background: finalSalePrice > 0 ? '#ECFDF5' : '#FEF2F2',
          border: `1px solid ${finalSalePrice > 0 ? '#6CE9A6' : '#FDA29B'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Lucro líquido</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: profitVal >= 0 ? '#027A48' : '#B42318' }}>
                {fmt(profitVal)}
              </div>
              {finalSalePrice > 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Margem: {profitPct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <Tooltip title="Este é o preço de venda por unidade, incluindo atividades terceirizadas (Frete, Seguros, Despesas Acessórias) quando aplicável.">
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: 0.5, cursor: 'help' }}>
                  Preço de Venda por Unidade
                </div>
              </Tooltip>
              <div style={{ fontSize: 28, fontWeight: 800, color: finalSalePrice > 0 ? '#027A48' : '#B42318' }}>
                {fmt(finalSalePrice)}
              </div>
              {isLucroReal && terceirizadasTotal > 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Base: {fmt(pricePerUnit)} + Terceirizadas: {fmt(terceirizadasTotal)}
                </div>
              )}
              {yieldQty > 1 && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Total receita ({yieldQty} {unit || 'UN'}): {fmt(finalSalePrice * yieldQty)}
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
              <Tooltip title={`Impostos: ${fmt(showIrpjCsll ? irpjVal + csllVal + adicionalIrpjVal : taxesTotal)}`}>
                <div style={{ width: `${((showIrpjCsll ? irpjVal + csllVal + adicionalIrpjVal : taxesTotal) / totalPrice) * 100}%`, background: '#667085' }} />
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
