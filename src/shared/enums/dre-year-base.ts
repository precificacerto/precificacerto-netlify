export type ResultData = {
  incomeData: TableDataType[]
  expenseData: TableDataType[]
}

export type TableDataType = {
  key: number | string
  category: string
  totalSum: number
  jan: number
  feb: number
  mar: number
  apr: number
  may: number
  jun: number
  jul: number
  ago: number
  sep: number
  oct: number
  nov: number
  dec: number
  average: number
  overallSum: number
  totalAverage: number
}

export interface DreListItem {
  category: string
  yearSumAverage: number
  yearDreAveragePercent: number
  totalDreAveragePercent: number
}
