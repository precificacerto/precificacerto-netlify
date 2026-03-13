import { IProductModel } from '@/server/model/product'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getMonetaryValue } from './get-monetary-value'
import { UNIT_TYPE_ABBREVIATION } from '@/constants/unit-types-abbreviation'

function formatPricePerUnit(totalPrice: number, quantity: number, unit: string): string {
  if (!quantity || !unit) {
    return `R$ ${getMonetaryValue(totalPrice)}`
  }

  const conversionMap: Record<string, { target: string; divisor: number }> = {
    GRAMS: { target: 'KILOGRAMS', divisor: 1000 },
    MILLILITERS: { target: 'LITERS', divisor: 1000 },
    MILLIMETERS: { target: 'METERS', divisor: 1000 },
    METERS: { target: 'KILOMETERS', divisor: 1000 },
  }

  const conv = conversionMap[unit]
  const convertedQty = conv ? quantity / conv.divisor : quantity
  const displayUnit = conv ? conv.target : unit

  return `R$ ${getMonetaryValue(totalPrice / convertedQty)}/${
    UNIT_TYPE_ABBREVIATION[displayUnit as keyof typeof UNIT_TYPE_ABBREVIATION] || unit
  }`
}

type ProductsProp = {
  products: IProductModel[]
}

type SmartPriceProductProp = {
  product: string
  price: string
  commission: string
  profit: string
}

type DiscountInfoProp = {
  totalPriceWithDiscount: string
  totalProfitCommissionValueWithDiscount: string
  TotalProfitCommissionPercentageWithDiscount: number
  totalProfitValueWithDiscount: string
  totalProfitPercentageWithDiscount: number
  totalCommissionValueWithDiscount: string
  totalCommissionPercentageWithDiscount: number
}

type TotalInfoProp = {
  totalPrice: number
  totalCommission: string
  totalCommissionPercentage: string | number
  totalProfit: string
  totalProfitPercentage: string | number
}

export const createSmartPricePDF = (
  products: SmartPriceProductProp[],
  {
    totalPriceWithDiscount,
    totalProfitCommissionValueWithDiscount,
    TotalProfitCommissionPercentageWithDiscount,
    totalProfitValueWithDiscount,
    totalProfitPercentageWithDiscount,
    totalCommissionValueWithDiscount,
    totalCommissionPercentageWithDiscount,
  }: DiscountInfoProp,
  {
    totalPrice,
    totalCommission,
    totalCommissionPercentage,
    totalProfit,
    totalProfitPercentage,
  }: TotalInfoProp,
  clientName: string
) => {
  const doc = new jsPDF()
  const downloadDate = new Date().toLocaleDateString('pt-BR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const pageCenter = doc.internal.pageSize.getWidth() / 2
  let productsTableHeight = 0
  const pdfTitle = clientName
    ? `Cálculo Smart Price para o cliente ${clientName} - ${downloadDate}`
    : `Cálculo Smart Price - ${downloadDate}`

  doc.setFontSize(10)
  doc.text(pdfTitle, pageCenter, 15, { align: 'center' })

  const productsHeaders = [['Produto', 'Preço', 'Comissão', 'Lucro']]
  const productsData = products.map((product: SmartPriceProductProp) => [
    product.product,
    `R$ ${getMonetaryValue(parseFloat(product.price.replace(',', '.')))}`,
    `${product.commission}%`,
    `${product.profit}%`,
  ])

  autoTable(doc, {
    head: productsHeaders,
    body: productsData,
    theme: 'grid',
    startY: 25,
    styles: {
      font: 'helvetica',
      halign: 'center',
      fontSize: 12,
    },
    headStyles: {
      fillColor: '#22c55e',
    },
    alternateRowStyles: { fillColor: '#f3f4f6' },
    didDrawPage: (d) => {
      productsTableHeight = d.cursor.y
    },
  })

  const totalValueHeaders = [['Valor total', 'Comissão total', 'Valor']]
  const totalValuesData = [
    [
      `R$ ${getMonetaryValue(totalPrice)}`,
      `R$ ${getMonetaryValue(Number(totalCommission))} (${totalCommissionPercentage
        .toString()
        .replace('.', ',')}%)`,
      `R$ ${getMonetaryValue(Number(totalProfit))} (${totalProfitPercentage
        .toString()
        .replace('.', ',')}%)`,
    ],
  ]

  autoTable(doc, {
    head: totalValueHeaders,
    body: totalValuesData,
    theme: 'grid',
    startY: productsTableHeight + 15,
    styles: {
      font: 'helvetica',
      halign: 'center',
      fontSize: 12,
    },
    headStyles: {
      fillColor: '#22c55e',
    },
    alternateRowStyles: { fillColor: '#f3f4f6' },
  })

  const discountHeaders = [['Descrição', 'Valor']]
  const discountData = [
    ['Valor total com desconto', `R$ ${getMonetaryValue(Number(totalPriceWithDiscount))}`],
    [
      'Valor total lucro + comissão com desconto',
      `R$ ${getMonetaryValue(
        parseFloat(totalProfitCommissionValueWithDiscount.replace(',', '.'))
      )} (${TotalProfitCommissionPercentageWithDiscount.toFixed(2).replace('.', ',')}%)`,
    ],
    [
      'Valor total lucro com desconto',
      `R$ ${getMonetaryValue(
        parseFloat(totalProfitValueWithDiscount.replace(',', '.'))
      )} (${totalProfitPercentageWithDiscount.toFixed(2).replace('.', ',')}%)`,
    ],
    [
      'Valor total comissão com desconto',
      `R$ ${getMonetaryValue(
        parseFloat(totalCommissionValueWithDiscount.replace(',', '.'))
      )} (${totalCommissionPercentageWithDiscount.toFixed(2).replace('.', ',')}%)`,
    ],
  ]

  autoTable(doc, {
    head: discountHeaders,
    body: discountData,
    startY: productsTableHeight + 45,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      halign: 'center',
      fontSize: 12,
    },
    headStyles: {
      fillColor: '#22c55e',
    },
    alternateRowStyles: { fillColor: '#f3f4f6' },
  })

  doc.save('smart_price.pdf')
}

export const createAllProductsPDF = ({ products }: ProductsProp) => {
  const doc = new jsPDF()
  const headers = [['Código', 'Nome', 'Descrição', 'Preço']]
  const data = products.map((product) => [
    product.code,
    product.name,
    product.description,
    formatPricePerUnit(product.productPriceInfo.totalProductPrice, product.quantity, product.unitType),
  ])

  const sortedData = data.sort((a, b) => {
    const nameA = a[1]
    const nameB = b[1]
    if (nameA < nameB) {
      return -1
    }
    if (nameA > nameB) {
      return 1
    }
    return 0
  })

  const pageCenter = doc.internal.pageSize.getWidth() / 2
  const pdfTitle = 'Relatório de Produtos'

  doc.setFontSize(20)
  doc.text(pdfTitle, pageCenter, 15, { align: 'center' })

  autoTable(doc, {
    head: headers,
    body: sortedData,
    startY: 25,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      halign: 'center',
      fontSize: 12,
    },
    headStyles: {
      fillColor: '#22c55e',
    },
    alternateRowStyles: { fillColor: '#f3f4f6' },
  })

  doc.save('produtos.pdf')
}

export const createProductPDF = (product: IProductModel) => {
  const doc = new jsPDF()

  const pageCenter = doc.internal.pageSize.getWidth() / 2
  const pdfTitle = 'Ficha Técnica'

  doc.setFontSize(20)
  doc.text(pdfTitle, pageCenter, 15, { align: 'center' })

  const productHeaders = [['Código', 'Produto', 'Descrição', 'Qtde.', 'Un.']]
  const productData = [
    [
      product.code,
      product.name,
      product.description,
      product.quantity,
      UNIT_TYPE_ABBREVIATION[product.unitType]
    ],
  ]

  autoTable(doc, {
    head: productHeaders,
    body: productData,
    theme: 'grid',
    startY: 20,
    styles: {
      font: 'helvetica',
      halign: 'center',
      fontSize: 12,
    },
    headStyles: {
      fillColor: '#22c55e',
    },
    alternateRowStyles: { fillColor: '#f3f4f6' },
  })

  const itemHeaders = [['Nome', 'Quantidade', 'Unidade']]
  const itemData = product.items.map((item) => [
    item.name,
    item.quantity,
    UNIT_TYPE_ABBREVIATION[item.unitType]
  ])

  autoTable(doc, {
    head: itemHeaders,
    body: itemData,
    startY: 50,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      halign: 'center',
      fontSize: 12,
    },
    headStyles: {
      fillColor: '#22c55e',
    },
    alternateRowStyles: { fillColor: '#f3f4f6' },
  })

  doc.save(`${product.code}_${product.name}.pdf`)
}
