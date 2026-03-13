import * as yup from 'yup'
import { UNIT_TYPE_ENUM } from '@/shared/enums/unit-type'

export const itemSchema = yup.object({
  id: yup.string().optional(),
  name: yup.string().min(2).max(50).required(),
  quantity: yup.number().min(1).required(),
  unitType: yup.string().oneOf(Object.values(UNIT_TYPE_ENUM)).required(),
  price: yup.number().min(0.1).required(),
  observation: yup.string().optional(),
  item_type: yup.string().optional(),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IItemModel extends yup.InferType<typeof itemSchema> {}
