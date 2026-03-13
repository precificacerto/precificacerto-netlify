import { UNIT_TYPE_ENUM } from '@/shared/enums/unit-type'
import * as yup from 'yup'

export const itemProductSchema = yup.object({
  id: yup.string().required(),
  name: yup.string().min(2).max(50).required(),
  quantity: yup.number().min(1).required(),
  referenceQuantity: yup.number().min(1).required(),
  unitType: yup.string().oneOf(Object.values(UNIT_TYPE_ENUM)).required(),
  price: yup.number().min(0.01).required(),
  referencePrice: yup.number().min(0.01).required(),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IItemProductModel extends yup.InferType<typeof itemProductSchema> {}
