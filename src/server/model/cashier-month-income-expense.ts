import * as yup from 'yup'

export const cashierMonthIncomeExpenseSchema = yup.object({
  id: yup.string(),
  category: yup.string(),
  date: yup.string(),
  description: yup.string(),
  price: yup.number(),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ICashierMonthIncomeExpenseModel
  extends yup.InferType<typeof cashierMonthIncomeExpenseSchema> {}
