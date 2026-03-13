import * as yup from 'yup'

export const cashierMonthSchema = yup.object({
  id: yup.string().required(),
  goal: yup.number().min(0).required(),
  sumIncome: yup.number().min(0).required(),
  sumExpense: yup.number().min(0).required(),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ICashierMonthModel extends yup.InferType<typeof cashierMonthSchema> {}
