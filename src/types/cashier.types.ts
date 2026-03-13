export interface IMonthInfo {
  goal?: number
  sumExpense?: number
  sumIncome?: number
  year?: number
}

export interface IMonthChartInfo {
  incomes: ICashierEntry[]
  expenses: ICashierEntry[]
}

export interface ICashierEntry {
  id?: string
  category?: string
  date?: string
  description?: string
  price?: number
}

export interface ICashierMonthModel {
  id: string
  goal: number
  sumIncome: number
  sumExpense: number
}
