export enum Month {
  JAN = 'JAN',
  FEB = 'FEB',
  MAR = 'MAR',
  APR = 'APR',
  MAY = 'MAY',
  JUN = 'JUN',
  JUL = 'JUL',
  AGO = 'AGO',
  SEP = 'SEP',
  OCT = 'OCT',
  NOV = 'NOV',
  DEC = 'DEC',
}

export enum MonthPtBR {
  JAN = 'JAN',
  FEV = 'FEV',
  MAR = 'MAR',
  ABR = 'ABR',
  MAI = 'MAI',
  JUN = 'JUN',
  JUL = 'JUL',
  AGO = 'AGO',
  SET = 'SET',
  OUT = 'OUT',
  NOV = 'NOV',
  DEZ = 'DEZ',
}

export const monthObjects = {
  [Month.JAN]: { number: 0, short: 'Jan', full: 'Janeiro' },
  [Month.FEB]: { number: 1, short: 'Fev', full: 'Fevereiro' },
  [Month.MAR]: { number: 2, short: 'Mar', full: 'Março' },
  [Month.APR]: { number: 3, short: 'Abr', full: 'Abril' },
  [Month.MAY]: { number: 4, short: 'Mai', full: 'Maio' },
  [Month.JUN]: { number: 5, short: 'Jun', full: 'Junho' },
  [Month.JUL]: { number: 6, short: 'Jul', full: 'Jullo' },
  [Month.AGO]: { number: 7, short: 'Ago', full: 'Agosto' },
  [Month.SEP]: { number: 8, short: 'Set', full: 'Setembro' },
  [Month.OCT]: { number: 9, short: 'Out', full: 'Outubro' },
  [Month.NOV]: { number: 10, short: 'Nov', full: 'Novembro' },
  [Month.DEC]: { number: 11, short: 'Dez', full: 'Dezembro' },
}

export type MonthObjectType = { short: string; full: string }
