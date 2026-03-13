import * as yup from 'yup'
import { CASHIER_CATEGORY } from '@/constants/cashier-category'

const [incomesCategories, expenseCategories] = Object.values(CASHIER_CATEGORY)

export const paymentRevenueTitleSchema = yup.object({
  id: yup.string(),
  date: yup.date().required(),
  price: yup.number().min(0.1).required(),
  category: yup
    .string()
    .oneOf([...Object.keys(incomesCategories), ...Object.keys(expenseCategories)])
    .required(),
  description: yup.string(),
  expense_group: yup.string().nullable().optional(),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IPaymentRevenueTitleModel
  extends yup.InferType<typeof paymentRevenueTitleSchema> {}
