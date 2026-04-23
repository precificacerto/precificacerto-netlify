import { ChangeEvent, FC } from 'react'
import { Button, Card, Form, FormInstance, Select, Table } from 'antd'
import { IItemModel } from '@/server/model/item'
import { IItemProductModel } from '@/server/model/item-product-item'
import { ColumnsType } from 'antd/es/table'
import { CalcBaseType } from '@/types/calc-base.type'
import { ProductPrice } from './product-price.component'
import { LoggedUser } from '@/types/logged-user.type'
import { ProductPriceInfoType } from './content.component'

interface ContentResaleProps {
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
  isPct?: number
  onIsPctChange?: (value: number) => void
  ipiPct?: number
  onIpiPctChange?: (value: number) => void
  icmsStValue?: number
  onIcmsStChange?: (value: number) => void
  ipiNrValue?: number
  onIpiNrChange?: (value: number) => void
  difalOrigemPct?: number
  onDifalOrigemChange?: (value: number) => void
  difalDestinoPct?: number
  onDifalDestinoChange?: (value: number) => void
}
export const ContentResale: FC<ContentResaleProps> = ({
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
  isPct,
  onIsPctChange,
  ipiPct,
  onIpiPctChange,
  icmsStValue,
  onIcmsStChange,
  ipiNrValue,
  onIpiNrChange,
  difalOrigemPct,
  onDifalOrigemChange,
  difalDestinoPct,
  onDifalDestinoChange,
}: ContentResaleProps) => {
  return (
    <>
      <Card size="small" className="mt-5 mb-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl">Itens do produto</h1>
        </div>

        <div className="flex flex-col column mb-5">
          <Form form={itemsForm} layout="inline" onFinish={handleClickAddItem}>
            <Form.Item
              className="w-[300px]"
              label="Buscar item"
              name="item"
              rules={[{ required: true }]}
            >
              <Select
                showSearch
                filterOption={filterOption}
                listHeight={512}
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

            <Button htmlType="submit" type="primary" className="ml-2">
              Incluir
            </Button>
          </Form>
        </div>
        <Table pagination={false} columns={columns} dataSource={productItemsData} scroll={{ x: 'max-content' }} />
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
        onCbsPctChange={onCbsPctChange}
        isPct={isPct}
        onIsPctChange={onIsPctChange}
        ipiPct={ipiPct}
        onIpiPctChange={onIpiPctChange}
        icmsStValue={icmsStValue}
        onIcmsStChange={onIcmsStChange}
        ipiNrValue={ipiNrValue}
        onIpiNrChange={onIpiNrChange}
        difalOrigemPct={difalOrigemPct}
        onDifalOrigemChange={onDifalOrigemChange}
        difalDestinoPct={difalDestinoPct}
        onDifalDestinoChange={onDifalDestinoChange}
      />
    </>
  )
}
