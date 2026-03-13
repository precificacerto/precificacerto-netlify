import { Form, Input, Button, Table, Popconfirm, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { currencyMask } from '@/utils/currency-mask'
import { ISmartPriceProductModel } from '@/server/model/smart-price-product'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { DownloadOutlined } from '@ant-design/icons'
import { createSmartPricePDF } from '@/utils/create-pdf'

export default function ProductForm() {
  const [form] = Form.useForm()
  const [products, setProducts] = useState([])
  const [totalPrice, setTotalPrice] = useState(0)
  const [totalPriceWithDiscount, setTotalPriceWithDiscount] = useState('')
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [messageApi, contextHolder] = message.useMessage()
  const [clientName, setClientName] = useState('')

  const calculateTotalPrice = useCallback(() => {
    const total = products.reduce(
      (total, product) => total + parseFloat(product.price.replace(',', '.')),
      0
    )
    setTotalPrice(total.toFixed(2))
  }, [products])

  const totalProducts = products.length

  const totalCommission = products
    .reduce(
      (total, product) =>
        total +
        parseFloat(product.price.replace(',', '.')) * (parseFloat(product.commission) / 100),
      0
    )
    .toFixed(2)
  const totalProfit = products
    .reduce(
      (total, product) =>
        total + parseFloat(product.price.replace(',', '.')) * (parseFloat(product.profit) / 100),
      0
    )
    .toFixed(2)

  const totalCommissionPercentage =
    totalProducts > 0 ? ((totalCommission / totalPrice) * 100).toFixed(2) : 0
  const totalProfitPercentage =
    totalProducts > 0 ? ((totalProfit / totalPrice) * 100).toFixed(2) : 0

  const totalProfitCommissionPercentage =
    Number(totalCommissionPercentage) + Number(totalProfitPercentage)

  const TotalProfitCommissionPercentageWithDiscount =
    totalProfitCommissionPercentage - discountPercentage

  const totalProfitCommissionValueWithDiscount = (
    (Number(totalPriceWithDiscount) * TotalProfitCommissionPercentageWithDiscount) /
    100
  )
    .toFixed(2)
    .replace('.', ',')

  const totalProfitPercentageWithDiscount =
    (Number(totalProfitPercentage) / totalProfitCommissionPercentage) *
    TotalProfitCommissionPercentageWithDiscount

  const totalProfitValueWithDiscount = (
    (Number(totalPriceWithDiscount) * totalProfitPercentageWithDiscount) /
    100
  )
    .toFixed(2)
    .replace('.', ',')

  const totalCommissionPercentageWithDiscount =
    (Number(totalCommissionPercentage) / totalProfitCommissionPercentage) *
    TotalProfitCommissionPercentageWithDiscount

  const totalCommissionValueWithDiscount = (
    (Number(totalPriceWithDiscount) * totalCommissionPercentageWithDiscount) /
    100
  )
    .toFixed(2)
    .replace('.', ',')

  const handleChangePrice = (value: string) => {
    form.setFieldsValue({
      price: currencyMask(value),
    })
  }

  const handleDelete = async (idKey: string) => {
    try {
      const updatedProducts = products.filter((product) => product.key !== idKey)
      setProducts(updatedProducts)
      messageApi.success('Removido com sucesso!')
    } catch (error) {
      messageApi.error('Ocorreu erro ao excluir')
    }
  }

  const handleCellEdit = (
    key: string,
    dataIndex: keyof ISmartPriceProductModel,
    value: string | number
  ) => {
    let formattedValue = value
    if (dataIndex === 'commission' || dataIndex === 'profit') {
      formattedValue = value === '' ? '0' : value.toString().replace(/^0+/, '')
    }
    if (dataIndex === 'price') {
      formattedValue = value === '' ? '0' : value
      formattedValue = currencyMask(formattedValue.toString())
      if (parseFloat(formattedValue) !== 0) {
        formattedValue = formattedValue.replace(/^0+/, '')
      }
    }
    const updatedProducts = products.map((product) => {
      if (product.key === key) {
        return { ...product, [dataIndex]: formattedValue }
      }
      return product
    })
    setProducts(updatedProducts)
  }

  const handleDiscount = (value: string, totalPrice: number) => {
    const discountPercentage = parseFloat(value)
    if (discountPercentage < 0 || discountPercentage > 100) return
    if (!isNaN(discountPercentage)) {
      const totalDiscount = (totalPrice * discountPercentage) / 100
      setTotalPriceWithDiscount((totalPrice - totalDiscount).toFixed(2))
      setDiscountPercentage(discountPercentage)
    } else {
      setTotalPriceWithDiscount('')
      setDiscountPercentage(0)
    }
  }

  const onFinish = (record: ISmartPriceProductModel) => {
    const { product, price, commission, profit } = record
    const newProduct = {
      key: products.length + 1,
      product,
      price,
      commission,
      profit,
    }
    setProducts([...products, newProduct])
    form.resetFields()
  }

  useEffect(() => {
    calculateTotalPrice()
  }, [products, calculateTotalPrice])

  useEffect(() => {
    handleDiscount(discountPercentage.toString(), totalPrice)
  }, [totalPrice, discountPercentage])

  const tableProductsColumns = [
    {
      title: 'Produto',
      dataIndex: 'product',
      key: 'product',
      render: (text: string | number, record: ISmartPriceProductModel) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(record.key, 'product', e.target.value)}
        />
      ),
    },
    {
      title: 'Preço',
      dataIndex: 'price',
      key: 'price',
      render: (text: string | number, record: ISmartPriceProductModel) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(record.key, 'price', e.target.value)}
          prefix="R$"
        />
      ),
    },
    {
      title: 'Comissão %',
      dataIndex: 'commission',
      key: 'commission',
      render: (text: string | number, record: ISmartPriceProductModel) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(record.key, 'commission', e.target.value)}
          suffix="%"
          type="number"
          min={0}
          step={0.01}
          required={true}
        />
      ),
    },
    {
      title: 'Lucro %',
      dataIndex: 'profit',
      key: 'profit',
      render: (text: string | number, record: ISmartPriceProductModel) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(record.key, 'profit', e.target.value)}
          suffix="%"
          type="number"
          min={0}
          step={0.01}
          required={true}
        />
      ),
    },
    {
      title: 'Ações',
      key: 'action',
      render: (record: ISmartPriceProductModel) => (
        <Popconfirm title="Tem certeza?" onConfirm={() => handleDelete(record.key)}>
          <Button type="link">Excluir</Button>
        </Popconfirm>
      ),
    },
  ]

  const tableDiscountsColumns = [
    { title: 'Descrição', dataIndex: 'description', key: 'description' },
    { title: 'Valor', dataIndex: 'value', key: 'value' },
  ]

  const tableDiscountsResults = [
    {
      key: '1',
      description: 'Valor total com desconto',
      value: isNaN(parseFloat(totalPriceWithDiscount))
        ? 'R$ 0,00'
        : `R$ ${getMonetaryValue(parseFloat(totalPriceWithDiscount))}`,
    },
    {
      key: '2',
      description: 'Valor total lucro + comissão',
      value: isNaN(parseFloat(totalProfitCommissionValueWithDiscount))
        ? 'R$ 0,00 (0,00%)'
        : `R$ ${totalProfitCommissionValueWithDiscount} (${TotalProfitCommissionPercentageWithDiscount.toFixed(
            2
          ).replace('.', ',')}%)`,
    },
    {
      key: '3',
      description: 'Valor total lucro',
      value: isNaN(parseFloat(totalProfitValueWithDiscount))
        ? 'R$ 0,00 (0,00%)'
        : `R$ ${totalProfitValueWithDiscount} (${totalProfitPercentageWithDiscount
            .toFixed(2)
            .replace('.', ',')}%)`,
    },
    {
      key: '4',
      description: 'Valor total comissão',
      value: isNaN(parseFloat(totalCommissionValueWithDiscount))
        ? 'R$ 0,00 (0,00%)'
        : `R$ ${totalCommissionValueWithDiscount} (${totalCommissionPercentageWithDiscount
            .toFixed(2)
            .replace('.', ',')}%)`,
    },
  ]

  const discountInfo = {
    totalPriceWithDiscount,
    totalProfitCommissionValueWithDiscount,
    TotalProfitCommissionPercentageWithDiscount,
    totalProfitValueWithDiscount,
    totalProfitPercentageWithDiscount,
    totalCommissionValueWithDiscount,
    totalCommissionPercentageWithDiscount,
  }

  const totalValuesInfo = {
    totalPrice,
    totalCommission,
    totalCommissionPercentage,
    totalProfit,
    totalProfitPercentage,
  }

  return (
    <Layout title={PAGE_TITLES.SMART_PRICE} subtitle="Precificação inteligente com comissão e lucro">
      {contextHolder}

      <div className="pc-card" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-neutral-600)' }}>Nome do cliente</label>
          <Input
            style={{ maxWidth: 400, marginTop: 4 }}
            placeholder="Nome do cliente"
            onChange={(e) => setClientName(e.target.value)}
          />
        </div>

        <Form layout="vertical" form={form} onFinish={onFinish}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              label="Produto"
              name="product"
              rules={[{ required: true, message: 'Por favor, insira um produto!' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Preço"
              name="price"
              rules={[
                { required: true, message: 'Por favor, insira um preço!' },
                {
                  validator: (_, value) => {
                    if (parseFloat(value) <= 0) {
                      return Promise.reject('O preço deve ser maior que zero!')
                    }
                    return Promise.resolve()
                  },
                },
              ]}
            >
              <Input
                prefix="R$"
                autoComplete="off"
                onChange={({ target }) => handleChangePrice(target.value)}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              label="Comissão"
              name="commission"
              rules={[{ required: true, message: 'Por favor, insira um percentual de comissão!' }]}
            >
              <Input type="number" suffix="%" min={0} max={100} step={0.01} />
            </Form.Item>
            <Form.Item
              label="Lucro"
              name="profit"
              rules={[{ required: true, message: 'Por favor, insira um percentual de lucro!' }]}
            >
              <Input type="number" suffix="%" min={0} max={100} step={0.01} />
            </Form.Item>
          </div>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit">
              Adicionar
            </Button>
          </Form.Item>
        </Form>
      </div>

      <div className="pc-card--table" style={{ marginBottom: 16 }}>
        <Table
          dataSource={products}
          columns={tableProductsColumns}
          pagination={false}
          size="middle"
          footer={() => (
            <div style={{ display: 'flex', gap: 24, justifyContent: 'center', fontSize: 13 }}>
              <span><strong>Valor total:</strong> R$ {getMonetaryValue(totalPrice)}</span>
              <span>
                <strong>Comissão:</strong> R$ {totalCommission.replace('.', ',')}{' '}
                {isNaN(Number(totalCommissionPercentage))
                  ? '(0,00%)'
                  : `(${totalCommissionPercentage.toString().replace('.', ',')}%)`}
              </span>
              <span>
                <strong>Lucro:</strong> R$ {totalProfit.replace('.', ',')}{' '}
                {isNaN(Number(totalProfitPercentage))
                  ? '(0,00%)'
                  : `(${totalProfitPercentage.toString().replace('.', ',')}%)`}
              </span>
            </div>
          )}
        />
      </div>

      <div className="pc-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Desconto</h3>
          {products.length ? (
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() =>
                createSmartPricePDF(products, discountInfo, totalValuesInfo, clientName)
              }
            >
              Gerar PDF
            </Button>
          ) : null}
        </div>
        <Input
          style={{ maxWidth: 200, marginBottom: 16 }}
          type="number"
          placeholder="Percentual de desconto"
          suffix="%"
          min={0}
          max={100}
          step={0.01}
          onChange={(e) => handleDiscount(e.target.value, totalPrice)}
        />
        {totalPriceWithDiscount !== '' && totalProducts > 0 && (
          <Table
            dataSource={tableDiscountsResults}
            columns={tableDiscountsColumns}
            pagination={false}
            size="middle"
          />
        )}
      </div>
    </Layout>
  )
}

