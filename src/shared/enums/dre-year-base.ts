export type ResultData = {
  incomeData: TableDataType[]
  expenseData: TableDataType[]
}

export type TableDataType = {
  key: number | string
  category: string
  expenseGroup?: string
  /**
   * `true` = LINHA DE APRESENTAÇÃO: ela NÃO entra no total do grupo nem no resultado do mês.
   *
   * Existe por causa do bloco Custo dos Produtos (`custo-produtos-no-dre.ts`), cujas duas
   * linhas novas — a dedução dos créditos e o subtotal líquido — decompõem um valor que já
   * está no caixa. Somá-las contaria o crédito duas vezes. Ver `ausente-vs-falso.md`: aqui a
   * ausência do campo significa "linha normal", que é o que toda linha já era.
   */
  apenasApresentacao?: boolean
  /** Ordem explícita de exibição; sem ela as três linhas do bloco saem desordenadas. */
  ordem?: number
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
