import * as yup from 'yup'

export const smartPriceProductSchema = yup.object({
  key: yup.string().required(),
  product: yup.string().min(2).max(50).required(),
  price: yup.number().min(0.1).required(),
  commission: yup.number().min(0).required(),
  profit: yup.number().min(0).required(),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ISmartPriceProductModel extends yup.InferType<typeof smartPriceProductSchema> {}
