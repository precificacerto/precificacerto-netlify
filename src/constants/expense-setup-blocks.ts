import type { ExpenseGroupKey } from '@/constants/cashier-category'

export interface ExpenseSetupItem {
  key: string
  label: string
  expense_group: ExpenseGroupKey
}

/** Bloco 1: Mão de obra produtiva — lista para preencher valor, mês início, mês final, frequência */
export const BLOCK_MAO_DE_OBRA_PRODUTIVA: ExpenseSetupItem[] = [
  { key: 'SALARIOS_PRODUCAO', label: 'Salários Produção', expense_group: 'MAO_DE_OBRA' },
  { key: 'DECIMO_TERCEIRO_PRODUCAO', label: 'Décimo Terceiro (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FERIAS_PRODUCAO', label: 'Férias Colaboradores (Setor produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FGTS_PRODUCAO', label: 'FGTS (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'HORAS_EXTRAS', label: 'Horas Extras - Salários', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_PRODUCAO', label: 'INSS (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_PATRONAL_PRODUCAO', label: 'INSS Patronal (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'PLANO_SAUDE_PRODUCAO', label: 'Plano de Saúde (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'RAT_FAP', label: 'RAT / FAP', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_ALIMENTACAO_PRODUCAO', label: 'Vale Alimentação (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_TRANSPORTE_PRODUCAO', label: 'Vale Transporte (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'MAO_OBRA_TERCEIRIZADA', label: 'Mão de obra produtiva tercerizada — passível de crédito', expense_group: 'MAO_DE_OBRA' },
]

/** Bloco 2: Mão de obra administrativa */
export const BLOCK_MAO_DE_OBRA_ADMINISTRATIVA: ExpenseSetupItem[] = [
  { key: 'PRO_LABORE', label: 'Pró Labore', expense_group: 'MAO_DE_OBRA' },
  { key: 'SALARIOS_ADMINISTRATIVOS', label: 'Salários Administrativos', expense_group: 'MAO_DE_OBRA' },
  { key: 'SALARIOS_COMERCIAIS', label: 'Salários Comerciais', expense_group: 'MAO_DE_OBRA' },
  { key: 'DECIMO_TERCEIRO_ADMIN', label: 'Décimo Terceiro (Pró-Labo/Admin/Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FERIAS_ADMIN', label: 'Férias Colaboradores (Pró-Labo/Admin/Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FGTS_ADMIN', label: 'FGTS (Pró-Labo/Admin/Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'HORAS_EXTRAS_ADMIN', label: 'Horas Extras - Salários', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_PATRONAL_ADMIN', label: 'INSS Patronal (Pró-Labo/Admin/Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_ADMIN', label: 'INSS (Pró-Labo/Admin/Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'PLANO_SAUDE_ADMIN', label: 'Plano de Saúde (Pró-Labo/Admin/Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'RAT_FAP_ADMIN', label: 'RAT / FAP', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_ALIMENTACAO_ADMIN', label: 'Vale Alimentação (Pró-Labo/Admin/Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_TRANSPORTE_ADMIN', label: 'Vale Transporte (Pró-Labo/Admin/Comer)', expense_group: 'MAO_DE_OBRA' },
]

/** Bloco 3: Despesas fixas */
export const BLOCK_DESPESAS_FIXAS: ExpenseSetupItem[] = [
  { key: 'ALUGUEL', label: 'Aluguel', expense_group: 'DESPESA_FIXA' },
  { key: 'ENERGIA_ELETRICA', label: 'Energia Elétrica', expense_group: 'DESPESA_FIXA' },
  { key: 'AGUA', label: 'Água', expense_group: 'DESPESA_FIXA' },
  { key: 'INTERNET', label: 'Internet', expense_group: 'DESPESA_FIXA' },
  { key: 'TELEFONE', label: 'Telefone', expense_group: 'DESPESA_FIXA' },
  { key: 'CONTADOR', label: 'Contador', expense_group: 'DESPESA_FIXA' },
  { key: 'SEGUROS', label: 'Seguros', expense_group: 'DESPESA_FIXA' },
  { key: 'OUTRAS_FIXAS', label: 'Outras despesas fixas', expense_group: 'DESPESA_FIXA' },
]

/** Bloco 4: Despesas financeiras */
export const BLOCK_DESPESAS_FINANCEIRAS: ExpenseSetupItem[] = [
  { key: 'TAXA_CARTAO', label: 'Taxa cartão de crédito/débito', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TARIFAS_BANCARIAS', label: 'Tarifas bancárias', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'JUROS_MULTAS', label: 'Juros e multas', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TAXA_ANTECIPACAO', label: 'Taxa de antecipação', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'OUTRAS_FINANCEIRAS', label: 'Outras despesas financeiras', expense_group: 'DESPESA_FINANCEIRA' },
]

/** Bloco 5: Despesas variáveis */
export const BLOCK_DESPESAS_VARIAVEIS: ExpenseSetupItem[] = [
  { key: 'EMBALAGENS', label: 'Embalagens', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MATERIA_PRIMA', label: 'Matéria-prima', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'COMISSOES', label: 'Comissões', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'FRETE', label: 'Frete', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MARKETING', label: 'Marketing', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'OUTRAS_VARIAVEIS', label: 'Outras despesas variáveis', expense_group: 'DESPESA_VARIAVEL' },
]

export interface ExpenseSetupBlockDef {
  id: number
  title: string
  subtitle: string
  categoryLabel: string
  items: ExpenseSetupItem[]
  expense_group: ExpenseGroupKey
}

export const EXPENSE_SETUP_BLOCKS: ExpenseSetupBlockDef[] = [
  {
    id: 1,
    title: 'Mão de obra produtiva',
    subtitle: 'Preencha os valores que se aplicam à equipe produtiva. Não é obrigatório preencher todos.',
    categoryLabel: 'Mão de obra produtiva',
    items: BLOCK_MAO_DE_OBRA_PRODUTIVA,
    expense_group: 'MAO_DE_OBRA',
  },
  {
    id: 2,
    title: 'Mão de obra administrativa',
    subtitle: 'Preencha os valores que se aplicam à equipe administrativa e comercial.',
    categoryLabel: 'Mão de obra administrativa',
    items: BLOCK_MAO_DE_OBRA_ADMINISTRATIVA,
    expense_group: 'MAO_DE_OBRA',
  },
  {
    id: 3,
    title: 'Despesas fixas',
    subtitle: 'Preencha o valor nas linhas que se aplicam. Os valores serão distribuídos no cálculo de preço.',
    categoryLabel: 'Despesa Fixa',
    items: BLOCK_DESPESAS_FIXAS,
    expense_group: 'DESPESA_FIXA',
  },
  {
    id: 4,
    title: 'Despesas financeiras',
    subtitle: 'Taxas, juros e demais despesas financeiras.',
    categoryLabel: 'Despesa Financeira',
    items: BLOCK_DESPESAS_FINANCEIRAS,
    expense_group: 'DESPESA_FINANCEIRA',
  },
  {
    id: 5,
    title: 'Despesas variáveis',
    subtitle: 'Despesas que variam conforme a produção ou as vendas.',
    categoryLabel: 'Despesa Variável',
    items: BLOCK_DESPESAS_VARIAVEIS,
    expense_group: 'DESPESA_VARIAVEL',
  },
]
