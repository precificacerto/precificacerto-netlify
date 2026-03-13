import * as yup from 'yup'
import { itemProductSchema } from './item-product-item'
import { UNIT_TYPE_ENUM } from '@/shared/enums/unit-type'

const productPriceInfoBaseSchema = {
  salesCommissionPercent: yup.number(),
  salesCommissionPrice: yup.number(),
  salesCommissionPercentByProduct: yup.number(),
  salesCommissionPriceByProduct: yup.number(),
  productProfitPercent: yup.number(),
  productProfitPrice: yup.number(),
  productProfitPercentByProduct: yup.number(),
  productProfitPriceByProduct: yup.number(),
  indirectLaborForcePrice: yup.number(),
  feightPrice: yup.number(),
  packagingPrice: yup.number(),
  fixedExpensePrice: yup.number(),
  variableExpensePrice: yup.number(),
  taxesPrice: yup.number(),
  totalProductPrice: yup.number(),
  productCust: yup.number(),
  productWorkloadInMinutes: yup.number(),
  productWorkloadInMinutesPrice: yup.number(),
}

export const productSchema = yup.object({
  id: yup.string().optional(),
  code: yup.string().required(),
  name: yup.string().min(2).max(50).required(),
  description: yup.string().optional(),
  items: yup.array().of(itemProductSchema),
  salePrice: yup.number().min(0.01).optional(),
  productPriceInfo: yup.object(productPriceInfoBaseSchema).optional(),
  unitType: yup.string().oneOf(Object.values(UNIT_TYPE_ENUM)),
  quantity: yup.number().min(1),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IProductModel extends yup.InferType<typeof productSchema> {}
