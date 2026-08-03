import { ChangeEvent, FC, ReactNode } from 'react'
import { Button, Card, Form, FormInstance, Input, Table } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import { IItemModel } from '@/server/model/item'
import { IItemProductModel } from '@/server/model/item-product-item'
import { ColumnsType } from 'antd/es/table'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { CalcBaseType } from '@/types/calc-base.type'
import { ProductPrice, AdvancedTaxParams } from './product-price.component'
import { LoggedUser } from '@/types/logged-user.type'
import { ProductPriceInfoType } from './content.component'
import { useDevice } from '@/contexts/device.context'

interface ContentIndustrializationProps {
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
  customTaxPercent?: number | null
  onCustomTaxPercentChange?: (value: number) => void
  additionalIrpjPercent?: number
  onAdditionalIrpjChange?: (value: number) => void
  icmsPct?: number
  onIcmsPctChange?: (value: number) => void
  pisCofinsLRPct?: number
  onPisCofinsLRPctChange?: (value: number) => void
  freightValue?: number
  onFreightChange?: (value: number) => void
  insuranceValue?: number
  onInsuranceChange?: (value: number) => void
  accessoryExpensesValue?: number
  onAccessoryExpensesChange?: (value: number) => void
  ibsPct?: number
  onIbsPctChange?: (value: number) => void
  cbsPct?: number
  onCbsPctChange?: (value: number) => void
  ivaDualReductionFactor?: number | null
  isPct?: number
  onIsPctChange?: (value: number) => void
  ipiPct?: number
  onIpiPctChange?: (value: number) => void
  onFinalPriceWithTaxesChange?: (data: { finalPrice: number; basePrice: number }) => void
  advancedTaxesSection?: ReactNode
  advancedTaxParams?: AdvancedTaxParams
  /** Frente 2: lista compacta dos itens renderizada SÓ no mobile (≤639). */
  mobileItemsList?: ReactNode
}
export const ContentIndustrialization: FC<ContentIndustrializationProps> = ({
  itemsForm,
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
  customTaxPercent,
  onCustomTaxPercentChange,
  additionalIrpjPercent,
  onAdditionalIrpjChange,
  icmsPct,
  onIcmsPctChange,
  pisCofinsLRPct,
  onPisCofinsLRPctChange,
  freightValue,
  onFreightChange,
  insuranceValue,
  onInsuranceChange,
  accessoryExpensesValue,
  onAccessoryExpensesChange,
  ibsPct,
  onIbsPctChange,
  cbsPct,
  onCbsPctChange,
  ivaDualReductionFactor,
  isPct,
  onIsPctChange,
  ipiPct,
  onIpiPctChange,
  onFinalPriceWithTaxesChange,
  advancedTaxesSection,
  advancedTaxParams,
  mobileItemsList,
}: ContentIndustrializationProps) => {
  const { isMobile } = useDevice()
  return (
    <>
      <Card size="small" className="mt-5 mb-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl">Itens do produto</h1>
        </div>

        <div className="flex flex-col column mb-5">
          {/* Relatório 30/07 (mobile #2): campo "Buscar item" e botão "Incluir" alinhados.
              Mobile (≤639) empilha em coluna (Select 100% + botão 100% maior, mesma largura).
              Desktop mantém inline (Select flex:1 + botão à direita). */}
          <Form
            form={itemsForm}
            layout={isMobile ? 'vertical' : 'inline'}
            className="ps-additem-form"
            style={{ display: 'flex', gap: 8, alignItems: isMobile ? 'stretch' : 'flex-end', width: '100%', flexDirection: isMobile ? 'column' : 'row' }}
            onFinish={handleClickAddItem}
          >
            <Form.Item
              style={{ flex: 1, marginBottom: 0, width: isMobile ? '100%' : undefined }}
              label="Buscar item"
              name="item"
              rules={[{ required: true }]}
            >
              <Select
                showSearch
                filterOption={filterOption}
                notFoundContent={
                  <div className="p-3 text-center text-neutral-500">
                    Não há itens, cadastre-os antes de criar um produto
                  </div>
                }
              >
                {items.map(({ id, name }) => (
                  <Select.Option key={id} value={id}>
                    {name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Button
              htmlType="submit"
              type="primary"
              className={isMobile ? '' : 'ml-2'}
              block={isMobile}
              size={isMobile ? 'large' : 'middle'}
            >
              Incluir
            </Button>
          </Form>
        </div>
        {isMobile && mobileItemsList ? (
          mobileItemsList
        ) : (
          <Table pagination={false} columns={columns} dataSource={productItemsData} scroll={{ x: 'max-content' }} />
        )}
        {/* Relatório 30/07 (item 4 desktop): a linha "Mão de obra produtiva" ALINHA com as colunas
            da tabela "Itens do produto" — minutos sob "QTD. POR UNIDADE", valor sob "LÍQUIDO".
            Relatório 30/07 (mobile #2): no celular a linha vira 2 colunas na MESMA linha —
            minutos à ESQUERDA, valor em R$ à DIREITA — abaixo do rótulo. */}
        {isMobile ? (
          <section className="p-1 mt-3">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Mão de obra produtiva</div>
            {/* Relatório mobile #3: o campo de MINUTOS ocupa no MÁXIMO 50% da largura; o valor
                (R$) ocupa os outros 50%, alinhado à borda DIREITA (padrão de valores do sistema). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: '0 0 50%', maxWidth: '50%', minWidth: 0 }}>
                <Input
                  name="productWorkloadInMinutes"
                  placeholder="Inserir manualmente"
                  autoComplete="off"
                  suffix="Minuto(s)"
                  style={{ width: '100%' }}
                  type="number"
                  min={1}
                  minLength={1}
                  onChange={handleChangePrecificationInputs}
                  value={productPriceInfo.productWorkloadInMinutes}
                />
              </div>
              <div style={{ flex: '1 1 50%', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                R$ {getMonetaryValue(productPriceInfo.productWorkloadInMinutesPrice)}
              </div>
            </div>
          </section>
        ) : (
          <section className="flex items-center p-1 mt-3 ps-row-flex">
            {/* Coluna Nome (22%) — rótulo */}
            <div className="p-2" style={{ width: '22%', fontWeight: 500 }}>Mão de obra produtiva</div>
            {/* Coluna Qtd. por unidade (16%) — campo de minutos */}
            <div style={{ width: '16%', padding: '0 4px' }}>
              <Input
                name="productWorkloadInMinutes"
                placeholder="Inserir manualmente"
                autoComplete="off"
                suffix="Minuto(s)"
                style={{ width: '100%' }}
                type="number"
                min={1}
                minLength={1}
                onChange={handleChangePrecificationInputs}
                value={productPriceInfo.productWorkloadInMinutes}
              />
            </div>
            {/* Colunas Qtd. Total (14%) + Bruto (12%) — espaçadores para manter o alinhamento */}
            <div style={{ width: '26%' }} />
            {/* Coluna Líquido (12%) — valor em R$ */}
            <div style={{ width: '12%', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600 }}>
              R$ {getMonetaryValue(productPriceInfo.productWorkloadInMinutesPrice)}
            </div>
            {/* Coluna Ações (resto) — espaçador */}
            <div style={{ flex: 1 }} />
          </section>
        )}
      </Card>

      <ProductPrice
        calcBase={calcBase}
        productPriceInfo={productPriceInfo}
        handleChangePrecificationInputs={handleChangePrecificationInputs}
        currentUser={currentUser}
        productForm={productForm}
        customTaxPercent={customTaxPercent}
        onCustomTaxPercentChange={onCustomTaxPercentChange}
        additionalIrpjPercent={additionalIrpjPercent}
        onAdditionalIrpjChange={onAdditionalIrpjChange}
        icmsPct={icmsPct}
        onIcmsPctChange={onIcmsPctChange}
        pisCofinsLRPct={pisCofinsLRPct}
        onPisCofinsLRPctChange={onPisCofinsLRPctChange}
        freightValue={freightValue}
        onFreightChange={onFreightChange}
        insuranceValue={insuranceValue}
        onInsuranceChange={onInsuranceChange}
        accessoryExpensesValue={accessoryExpensesValue}
        onAccessoryExpensesChange={onAccessoryExpensesChange}
        ibsPct={ibsPct}
        onIbsPctChange={onIbsPctChange}
        cbsPct={cbsPct}
        ivaDualReductionFactor={ivaDualReductionFactor}
        onCbsPctChange={onCbsPctChange}
        isPct={isPct}
        onIsPctChange={onIsPctChange}
        ipiPct={ipiPct}
        onIpiPctChange={onIpiPctChange}
        onFinalPriceWithTaxesChange={onFinalPriceWithTaxesChange}
        advancedTaxesSection={advancedTaxesSection}
        advancedTaxParams={advancedTaxParams}
      />
    </>
  )
}
