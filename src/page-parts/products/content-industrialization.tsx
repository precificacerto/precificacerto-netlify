import { ChangeEvent, FC } from 'react'
import { Button, Card, Form, FormInstance, Input, Select, Table } from 'antd'
import { IItemModel } from '@/server/model/item'
import { IItemProductModel } from '@/server/model/item-product-item'
import { ColumnsType } from 'antd/es/table'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { CalcBaseType } from '@/types/calc-base.type'
import { ProductPrice } from './product-price.component'
import { LoggedUser } from '@/types/logged-user.type'
import { ProductPriceInfoType } from './content.component'

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
}: ContentIndustrializationProps) => {
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
        <Table pagination={false} columns={columns} dataSource={productItemsData} />
        <section className="flex items-center p-1 mt-3">
          <div className="w-[36%] p-4">Mão de obra produtiva</div>
          <div className="w-[20%] p-1">
            <Input
              name="productWorkloadInMinutes"
              placeholder="Inserir manualmente"
              autoComplete="off"
              suffix="Minutos"
              className="w-[89%]"
              type="number"
              min={1}
              minLength={1}
              onChange={handleChangePrecificationInputs}
              value={productPriceInfo.productWorkloadInMinutes}
            />
          </div>
          <div className="w-[15%] p-1">
            R$ {getMonetaryValue(productPriceInfo.productWorkloadInMinutesPrice)}
          </div>
          <div className="w-[29%]"></div>
        </section>
      </Card>

      <ProductPrice
        doProductCalc={doProductCalc}
        calcBase={calcBase}
        productPriceInfo={productPriceInfo}
        handleChangePrecificationInputs={handleChangePrecificationInputs}
        currentUser={currentUser}
        productForm={productForm}
      />
    </>
  )
}
