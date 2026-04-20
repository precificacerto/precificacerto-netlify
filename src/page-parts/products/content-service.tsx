import { ChangeEvent, FC } from 'react'
import { Button, Card, Divider, Form, FormInstance, InputNumber, Select, Table, Tooltip } from 'antd'
import { CalculatorOutlined } from '@ant-design/icons'
import { IItemModel } from '@/server/model/item'
import { IItemProductModel } from '@/server/model/item-product-item'
import { ColumnsType } from 'antd/es/table'
import { CalcBaseType } from '@/types/calc-base.type'
import { LoggedUser } from '@/types/logged-user.type'
import { ProductPriceInfoType } from './content.component'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { Input } from 'antd'

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

interface ContentServiceProps {
  itemsForm: FormInstance
  productForm: FormInstance
  handleClickAddItem: (value: { item: string }) => void
  filterOption: (input: string, option: { children: string }) => boolean
  items: IItemModel[]
  columns: ColumnsType<IItemProductModel>
  productItemsData: IItemProductModel[]
  handleChangePrecificationInputs: (event: ChangeEvent<HTMLInputElement>) => void
  productPriceInfo: ProductPriceInfoType
  doProductCalc: () => void
  calcBase: CalcBaseType
  currentUser: LoggedUser
  itemsPriceSum: number
}

export const ContentService: FC<ContentServiceProps> = ({
  itemsForm,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  productForm,
  handleClickAddItem,
  filterOption,
  items,
  columns,
  productItemsData,
  handleChangePrecificationInputs,
  productPriceInfo,
  doProductCalc,
  calcBase,
  currentUser,
  itemsPriceSum,
}: ContentServiceProps) => {
  const isMei = !!calcBase.isMei
  const isLucroRealSvc = currentUser?.taxableRegime === 'LUCRO_REAL'

  /* Unified tax (V2): single taxPct + taxLabel */
  const svcTaxPct = calcBase.taxPct
  const svcTaxVal = productPriceInfo.taxesPrice
  const svcTaxLabel = calcBase.taxLabel
    ? `Impostos (${calcBase.taxLabel})`
    : isMei ? 'Impostos (MEI — DAS fixo)' : 'Impostos'

  const quantity = productForm.getFieldValue('quantity')
  const unit = productForm.getFieldValue('unitType')

  const getUnitMeasure = () => 'Minuto(s)'

  const fireChange = (name: string, value: number) => {
    handleChangePrecificationInputs({
      preventDefault: () => {},
      target: { name, value: String(value) },
    } as any)
  }

  /* ---- service pricing data (V2: single tax; mão de obra em R$ = custo-hora × carga) ---- */
  const svcLaborVal = productPriceInfo.indirectLaborExpensePrice
  const svcTotal = productPriceInfo.totalServicePrice || 0
  const svcLaborPct = svcTotal > 0 ? Number(((svcLaborVal / svcTotal) * 100).toFixed(3)) : 0
  const svcFixedPct = calcBase.fixedExpensePct
  const svcFixedVal = productPriceInfo.fixedExpensePrice
  const svcVarPct = calcBase.variableExpensePct
  const svcVarVal = productPriceInfo.variableExpensePrice
  const svcFinPct = calcBase.financialExpensePct
  const svcFinVal = productPriceInfo.financialExpensePrice
  const svcCommPct = productPriceInfo.salesCommissionPercent
  const svcCommVal = productPriceInfo.salesCommissionPrice
  const svcProfitPct = productPriceInfo.productProfitPercent
  const svcProfitVal = productPriceInfo.productProfitPrice
  /* MO indireta + Despesa fixa agora contabilizados dentro de MO produtiva */
  const svcTotalPct = svcVarPct + svcFinPct + svcTaxPct + svcCommPct + svcProfitPct
  const svcCost = productPriceInfo.productCost
  const svcExpenses = svcLaborVal + svcFixedVal + svcVarVal + svcFinVal
  const svcTaxes = svcTaxVal
  /* Valor combinado de MO produtiva (direta + indireta + despesa fixa) */
  const combinedLaborPrice = productPriceInfo.productWorkloadInMinutesPrice + svcLaborVal + svcFixedVal

  /* ---- product pricing data (V2: single tax) ---- */
  const prdTaxPct = calcBase.taxPct
  const prdTaxVal = productPriceInfo.taxesPriceByProduct || 0
  const prdTaxLabel = calcBase.taxLabel
    ? `Impostos (${calcBase.taxLabel})`
    : isMei ? 'Impostos (MEI — DAS fixo)' : 'Impostos'
  const prdCommPct = productPriceInfo.salesCommissionPercentByProduct || 0
  const prdCommVal = productPriceInfo.salesCommissionPriceByProduct || 0
  const prdProfitPct = productPriceInfo.productProfitPercentByProduct || 0
  const prdProfitVal = productPriceInfo.productProfitPriceByProduct || 0
  const prdTotalPct = prdTaxPct + prdCommPct + prdProfitPct
  const prdCost = itemsPriceSum
  const prdTotal = productPriceInfo.totalServiceProductPrice || 0
  const prdTaxes = prdTaxVal

  const grandTotal = productPriceInfo.totalProductPrice

  function pricingRow(
    label: string, pct: number, val: number,
    editable?: string,
    tooltipText?: string,
  ) {
    return (
      <tr key={label}>
        <td style={{ width: 140, padding: '6px 0' }}>
          {editable ? (
            <InputNumber
              size="small" min={0} max={100} step={0.001} precision={3}
              value={pct}
              onChange={(v) => fireChange(editable, v ?? 0)}
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
            <span style={{
              display: 'inline-block', padding: '4px 12px', background: 'rgba(255,255,255,0.04)',
              borderRadius: 4, fontSize: 13, minWidth: 80, textAlign: 'right',
            }}>
              {pct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%
            </span>
          )}
        </td>
        <td style={{ padding: '6px 12px', fontSize: 13 }}>{label}</td>
        <td style={{ padding: '6px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>
          R$ {getMonetaryValue(val)}
        </td>
      </tr>
    )
  }

  function compositionBar(cost: number, expenses: number, taxes: number, commission: number, profit: number, total: number) {
    if (total <= 0) return null
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Composição do preço</div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
          <Tooltip title={`Custo: ${fmt(cost)}`}>
            <div style={{ width: `${(cost / total) * 100}%`, background: '#F04438' }} />
          </Tooltip>
          <Tooltip title={`Despesas: ${fmt(expenses)}`}>
            <div style={{ width: `${(expenses / total) * 100}%`, background: '#F79009' }} />
          </Tooltip>
          <Tooltip title={`Impostos: ${fmt(taxes)}`}>
            <div style={{ width: `${(taxes / total) * 100}%`, background: '#667085' }} />
          </Tooltip>
          <Tooltip title={`Comissão: ${fmt(commission)}`}>
            <div style={{ width: `${(commission / total) * 100}%`, background: '#7A5AF8' }} />
          </Tooltip>
          <Tooltip title={`Lucro: ${fmt(profit)}`}>
            <div style={{ width: `${(profit / total) * 100}%`, background: '#12B76A' }} />
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
    )
  }

  return (
    <>
      {/* Labor input */}
      <Card size="small" className="mt-5 mb-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl">Prestação de serviço</h1>
        </div>
        <section className="flex items-center p-1 ps-row-flex">
          <div className="w-[36%] p-4">Mão de obra produtiva</div>
          <div className="w-[20%] p-1">
            <Input
              name="productWorkloadInMinutes"
              placeholder="Inserir manualmente"
              autoComplete="off"
              suffix={getUnitMeasure()}
              style={{ width: '100%' }}
              type="number"
              min={1}
              minLength={1}
              onChange={handleChangePrecificationInputs}
              value={productPriceInfo.productWorkloadInMinutes}
            />
          </div>
          <div className="w-[15%] p-1">
            R$ {getMonetaryValue(combinedLaborPrice)}
          </div>
          <div className="w-[29%] p-1" style={{ fontSize: 11, color: '#94a3b8' }}>
            MO direta + administrativa + desp. fixas
          </div>
        </section>
      </Card>

      {/* Service pricing */}
      <Card size="small" className="mt-5">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            <CalculatorOutlined style={{ marginRight: 6, color: '#F79009' }} />
            Precificação do serviço
          </h3>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Custo serviço</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#B42318' }}>{fmt(svcCost)}</div>
          </div>
        </div>

        {isMei && (
          <div style={{
            background: '#FFFBE6', border: '1px solid #FFE58F', borderRadius: 8,
            padding: '8px 14px', fontSize: 12, color: '#614700', marginBottom: 12,
          }}>
            <strong>MEI:</strong> Impostos não são calculados por produto/serviço. O DAS mensal é fixo.
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
              {pricingRow('Despesas variáveis', svcVarPct, svcVarVal)}
              {pricingRow('Despesas financeiras', svcFinPct, svcFinVal)}
              {pricingRow(svcTaxLabel, svcTaxPct, svcTaxVal)}
              {pricingRow('Comissão / Mão de obra', svcCommPct, svcCommVal, 'salesCommissionPercent')}
              {pricingRow('Lucro', svcProfitPct, svcProfitVal, 'productProfitPercent')}
            </tbody>
          </table>

          <Divider style={{ margin: '12px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
            <span style={{ color: '#94a3b8' }}>Margem de contribuição total aplicada</span>
            <span style={{ fontWeight: 600 }}>{svcTotalPct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</span>
          </div>

          {isLucroRealSvc && (() => {
            // Valor precificado = Custo / Margem_contribuição_total_aplicada (decimal)
            // Ex: R$ 96,80 / 39,279% (= 0,39279) = R$ 246,44
            const _mc = 100 - svcTotalPct
            const _cost = Number(svcCost) || 0
            const valorPrecificado = _mc > 0 ? _cost / (_mc / 100) : 0
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, marginTop: 4 }}>
                <span style={{ color: '#64748b' }}>Valor do produto precificado com ICMS, PIS/COFINS</span>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{fmt(valorPrecificado)}</span>
              </div>
            )
          })()}

          <div style={{
            padding: '16px 20px', borderRadius: 8, marginTop: 12,
            background: svcTotal > 0 ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${svcTotal > 0 ? '#6CE9A6' : '#FDA29B'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 2 }}>
                  Total de venda do serviço
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: svcTotal > 0 ? '#027A48' : '#B42318' }}>
                  {fmt(svcTotal)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Lucro líquido</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: svcProfitVal >= 0 ? '#027A48' : '#B42318' }}>
                  {fmt(svcProfitVal)}
                </div>
                {svcTotal > 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Margem: {svcProfitPct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</div>
                )}
              </div>
            </div>
          </div>

          {compositionBar(svcCost, svcExpenses, svcTaxes, svcCommVal, svcProfitVal, svcTotal)}
        </div>
      </Card>

      {/* Items */}
      <Card size="small" className="mt-5 mb-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl">Itens do produto</h1>
        </div>
        <div className="flex flex-col column mb-5">
          <Form form={itemsForm} layout="inline" onFinish={handleClickAddItem}>
            <Form.Item className="w-[300px]" label="Buscar item" name="item" rules={[{ required: true }]}>
              <Select showSearch filterOption={filterOption}
                notFoundContent={
                  <div className="p-3 text-center text-neutral-500">Não há itens, cadastre-os antes de criar um produto</div>
                }>
                {items.map(({ id, name }) => (
                  <Select.Option key={id} value={id}>{name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Button htmlType="submit" type="primary" className="ml-2">Incluir</Button>
          </Form>
        </div>
        <Table pagination={false} columns={columns} dataSource={productItemsData} scroll={{ x: 'max-content' }} />
      </Card>

      {/* Product pricing */}
      <Card size="small" className="mt-5">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            <CalculatorOutlined style={{ marginRight: 6, color: '#F79009' }} />
            Precificação do produto
          </h3>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Custo produto</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#B42318' }}>{fmt(prdCost)}</div>
          </div>
        </div>

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
              {pricingRow(prdTaxLabel, prdTaxPct, prdTaxVal)}
              {pricingRow(
                'Comissão total do vendedor (produto)',
                prdCommPct,
                prdCommVal,
                'salesCommissionPercentByProduct',
                'Se deixar 0%, a comissão cadastrada no funcionário será aplicada automaticamente.'
              )}
              {pricingRow('Lucro (produto)', prdProfitPct, prdProfitVal, 'productProfitPercentByProduct')}
            </tbody>
          </table>

          <Divider style={{ margin: '12px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
            <span style={{ color: '#94a3b8' }}>Margem de contribuição total aplicada</span>
            <span style={{ fontWeight: 600 }}>{prdTotalPct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</span>
          </div>

          {isLucroRealSvc && (() => {
            // Valor precificado = Custo / Margem_contribuição_total_aplicada (decimal)
            // Ex: R$ 96,80 / 39,279% (= 0,39279) = R$ 246,44
            const _mc = 100 - prdTotalPct
            const _cost = Number(prdCost) || 0
            const valorPrecificado = _mc > 0 ? _cost / (_mc / 100) : 0
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, marginTop: 4 }}>
                <span style={{ color: '#64748b' }}>Valor do produto precificado com ICMS, PIS/COFINS</span>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{fmt(valorPrecificado)}</span>
              </div>
            )
          })()}

          <div style={{
            padding: '16px 20px', borderRadius: 8, marginTop: 12,
            background: prdTotal > 0 ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${prdTotal > 0 ? '#6CE9A6' : '#FDA29B'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 2 }}>
                  Total de venda do produto
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: prdTotal > 0 ? '#027A48' : '#B42318' }}>
                  {fmt(prdTotal)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Lucro líquido</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: prdProfitVal >= 0 ? '#027A48' : '#B42318' }}>
                  {fmt(prdProfitVal)}
                </div>
                {prdTotal > 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Margem: {prdProfitPct.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</div>
                )}
              </div>
            </div>
          </div>

          {compositionBar(prdCost, 0, prdTaxes, prdCommVal, prdProfitVal, prdTotal)}
        </div>
      </Card>

      {/* Grand total */}
      <Card size="small" className="mt-5">
        <div style={{
          padding: '20px 24px', borderRadius: 8,
          background: grandTotal > 0 ? '#ECFDF5' : '#FEF2F2',
          border: `2px solid ${grandTotal > 0 ? '#6CE9A6' : '#FDA29B'}`,
        }}>
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 2 }}>
              Preço de Venda Sugerido (Serviço + Produto)
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: grandTotal > 0 ? '#027A48' : '#B42318' }}>
              {fmt(grandTotal)}
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}
