import type { ExpenseGroupKey } from '@/constants/cashier-category'

export interface ExpenseSetupItem {
  key: string
  label: string
  expense_group: ExpenseGroupKey
}

/** Bloco 1: Mão de obra produtiva */
export const BLOCK_MAO_DE_OBRA_PRODUTIVA: ExpenseSetupItem[] = [
  { key: 'SALARIOS_PRODUCAO', label: 'Salários Produção', expense_group: 'MAO_DE_OBRA' },
  { key: 'DECIMO_TERCEIRO_PRODUCAO', label: 'Décimo Terceiro (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FERIAS_PRODUCAO', label: 'Férias Colaboradores (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FGTS_PRODUCAO', label: 'FGTS (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_PRODUCAO', label: 'INSS (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'PLANO_SAUDE_PRODUCAO', label: 'Plano de Saúde (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_ALIMENTACAO_PRODUCAO', label: 'Vale Alimentação (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_TRANSPORTE_PRODUCAO', label: 'Vale Transporte (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
]

/** Bloco 2: Mão de obra administrativa */
export const BLOCK_MAO_DE_OBRA_ADMINISTRATIVA: ExpenseSetupItem[] = [
  { key: 'PRO_LABORE', label: 'Pró Labore', expense_group: 'MAO_DE_OBRA' },
  { key: 'SALARIOS_ADMINISTRATIVOS', label: 'Salários Administrativos', expense_group: 'MAO_DE_OBRA' },
  { key: 'SALARIOS_COMERCIAIS', label: 'Salários Comerciais', expense_group: 'MAO_DE_OBRA' },
  { key: 'DECIMO_TERCEIRO_ADMIN', label: 'Décimo Terceiro (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FERIAS_ADMIN', label: 'Férias Colaboradores (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FGTS_ADMIN', label: 'FGTS (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_ADMIN', label: 'INSS (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'PLANO_SAUDE_ADMIN', label: 'Plano de Saúde (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_ALIMENTACAO_ADMIN', label: 'Vale Alimentação (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_TRANSPORTE_ADMIN', label: 'Vale Transporte (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
]

/** Bloco 3: Despesas fixas */
export const BLOCK_DESPESAS_FIXAS: ExpenseSetupItem[] = [
  { key: 'AGUA', label: 'Água', expense_group: 'DESPESA_FIXA' },
  { key: 'ALUGUEL', label: 'Aluguel', expense_group: 'DESPESA_FIXA' },
  { key: 'APLICACOES_CONSORCIOS', label: 'Aplicações / Consórcios', expense_group: 'DESPESA_FIXA' },
  { key: 'CONSULTORIA', label: 'Consultoria', expense_group: 'DESPESA_FIXA' },
  { key: 'CONTABILIDADE', label: 'Contabilidade', expense_group: 'DESPESA_FIXA' },
  { key: 'DEPRECIACAO', label: 'Depreciação', expense_group: 'DESPESA_FIXA' },
  { key: 'EMPRESTIMOS', label: 'Empréstimos', expense_group: 'DESPESA_FIXA' },
  { key: 'ENERGIA_ELETRICA', label: 'Energia Elétrica', expense_group: 'DESPESA_FIXA' },
  { key: 'IMPOSTOS_IPTU_IPVA', label: 'Impostos IPTU / IPVA', expense_group: 'IMPOSTO' },
  { key: 'INTERNET', label: 'Internet', expense_group: 'DESPESA_FIXA' },
  { key: 'SEGURANCA_MONITORAMENTO', label: 'Segurança / Monitoramento', expense_group: 'DESPESA_FIXA' },
  { key: 'SEGUROS', label: 'Seguros', expense_group: 'DESPESA_FIXA' },
  { key: 'SISTEMA_DE_GESTAO_SOFTWARES', label: 'Sistema de Gestão / Softwares', expense_group: 'DESPESA_FIXA' },
  { key: 'TELEFONE', label: 'Telefone', expense_group: 'DESPESA_FIXA' },
  { key: 'RESCISOES_INDENIZACOES', label: 'Recisões / Indenizações', expense_group: 'DESPESA_FIXA' },
  { key: 'SAUDE_TRABALHISTA_OCUPACIONAL', label: 'Saúde Trabalhista / Ocupacional', expense_group: 'DESPESA_FIXA' },
  { key: 'MEI', label: 'MEI (Microempreendedor Individual)', expense_group: 'IMPOSTO' },
]

/** Bloco 4: Despesas variáveis */
export const BLOCK_DESPESAS_VARIAVEIS: ExpenseSetupItem[] = [
  { key: 'COMISSOES_DE_VENDA', label: 'Comissões de Venda', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'COMBUSTIVEIS', label: 'Combustíveis', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'CORREIOS', label: 'Correios', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'DEPARTAMENTO_JURIDICO', label: 'Departamento Jurídico', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'EMBALAGENS_DIVERSAS', label: 'Embalagens Diversas', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'FRETES_VALORES_RELACIONADOS_A_ENTREGA_DOS_PRODUTOS', label: 'Fretes (Valores relacionados a entrega dos produtos)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'HORAS_EXTRAS_SALARIOS', label: 'Horas Extras - Salários', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MANUTENCOES', label: 'Manutenções', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MARKETING_PUBLICIDADES_E_RELACIONADOS', label: 'Marketing (publicidades e relacionados)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'PEDAGIOS', label: 'Pedágios', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'TERCERIZACOES', label: 'Terceirizações', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'USO_E_CONSUMO', label: 'Uso e Consumo', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'VALE_ALIMENTACAO_TERCERIZADOS', label: 'Vale Alimentação', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'VIAGENS_HOTEIS_PASSAGENS_ALIMENTACAO_ETC', label: 'Viagens (hotéis / passagens / alimentação / ETC)', expense_group: 'DESPESA_VARIAVEL' },
]

/** Bloco 5: Despesas financeiras */
export const BLOCK_DESPESAS_FINANCEIRAS: ExpenseSetupItem[] = [
  { key: 'JUROS', label: 'Juros', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TAXAS_CARTAO', label: 'Taxas Cartão', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TAXAS_BANCARIAS', label: 'Taxas Bancárias', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TROCA_CHEQUE', label: 'Troca Cheque', expense_group: 'DESPESA_FINANCEIRA' },
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
    title: 'Despesas variáveis',
    subtitle: 'Despesas que variam conforme a produção ou as vendas.',
    categoryLabel: 'Despesa Variável',
    items: BLOCK_DESPESAS_VARIAVEIS,
    expense_group: 'DESPESA_VARIAVEL',
  },
  {
    id: 5,
    title: 'Despesas financeiras',
    subtitle: 'Taxas, juros e demais despesas financeiras.',
    categoryLabel: 'Despesa Financeira',
    items: BLOCK_DESPESAS_FINANCEIRAS,
    expense_group: 'DESPESA_FINANCEIRA',
  },
]
