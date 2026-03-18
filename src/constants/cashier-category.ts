export type ExpenseGroupKey = 'MAO_DE_OBRA' | 'DESPESA_FIXA' | 'DESPESA_FINANCEIRA' | 'DESPESA_VARIAVEL' | 'IMPOSTO'

export const EXPENSE_GROUPS: Record<ExpenseGroupKey, { key: ExpenseGroupKey; label: string; color: string }> = {
  MAO_DE_OBRA:        { key: 'MAO_DE_OBRA',        label: 'Mão de Obra',        color: '#7C3AED' },
  DESPESA_FIXA:       { key: 'DESPESA_FIXA',        label: 'Despesa Fixa',       color: '#2563EB' },
  DESPESA_FINANCEIRA: { key: 'DESPESA_FINANCEIRA',  label: 'Despesa Financeira', color: '#D97706' },
  DESPESA_VARIAVEL:   { key: 'DESPESA_VARIAVEL',    label: 'Despesa Variável',   color: '#059669' },
  IMPOSTO:            { key: 'IMPOSTO',             label: 'Imposto',            color: '#DC2626' },
}

export const EXPENSE_GROUP_OPTIONS = Object.values(EXPENSE_GROUPS).map(g => ({
  value: g.key,
  label: g.label,
}))

export const CASHIER_CATEGORY = {
  INCOME: {
    CARTAO_CREDITO: { order: 0, key: 'CARTAO_CREDITO', value: 'Cartão Crédito' },
    CARTAO_DEBITO: { order: -1, key: 'CARTAO_DEBITO', value: 'Cartão Débito' },
    CHEQUES_A_VISTA: { order: -2, key: 'CHEQUES_A_VISTA', value: 'Cheques à vista' },
    CHEQUES_PRE_DATADOS: { order: -3, key: 'CHEQUES_PRE_DATADOS', value: 'Cheques pré datados' },
    DINHEIRO: { order: -4, key: 'DINHEIRO', value: 'Dinheiro' },
    PERMUTA: { order: -5, key: 'PERMUTA', value: 'Permuta' },
    PIX: { order: -6, key: 'PIX', value: 'PIX' },
    TRANSFERENCIA_BANCARIA: {
      order: -7,
      key: 'TRANSFERENCIA_BANCARIA',
      value: 'Transferência Bancária',
    },
    DEFICIT_FINANCEIRO: {
      order: -8,
      key: 'DEFICIT_FINANCEIRO',
      value: 'Déficit Financeiro',
    },
  },

  EXPENSE: {
    FORNECEDORES: { order: 8, key: 'FORNECEDORES', value: 'Fornecedores', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    MATERIA_PRIMA_BASE_DOS_PROD_ROUPA_ALIMENTO_MADEIRA: {
      order: 9,
      key: 'MATERIA_PRIMA_BASE_DOS_PROD_ROUPA_ALIMENTO_MADEIRA',
      value: 'Matéria Prima - Base dos produtos (Roupa/Alimento/Madeira)',
      group: 'DESPESA_VARIAVEL' as ExpenseGroupKey,
    },
    EMBALAGENS: { order: 10, key: 'EMBALAGENS', value: 'Embalagens', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    FRETES_FOB: {
      order: 11,
      key: 'FRETES_FOB',
      value: 'Fretes FOB (Valores relacionados a compra de suprimentos)',
      group: 'DESPESA_VARIAVEL' as ExpenseGroupKey,
    },
    SALARIOS_PRODUCAO: { order: 12, key: 'SALARIOS_PRODUCAO', value: 'Salários Produção', group: 'MAO_DE_OBRA' as ExpenseGroupKey },
    DECIMO_TERCEIRO_PRODUCAO: {
      order: 13,
      key: 'DECIMO_TERCEIRO_PRODUCAO',
      value: 'Décimo Terceiro (Setor Produtivo)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    FERIAS_COLABORADORES_PRODUCAO: {
      order: 14,
      key: 'FERIAS_COLABORADORES_PRODUCAO',
      value: 'Férias Colaboradores (Setor Produtivo)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    FGTS_PRODUCAO: { order: 15, key: 'FGTS_PRODUCAO', value: 'FGTS (Setor Produtivo)', group: 'MAO_DE_OBRA' as ExpenseGroupKey },
    INSS_PRODUCAO: { order: 16, key: 'INSS_PRODUCAO', value: 'INSS (Setor Produtivo)', group: 'MAO_DE_OBRA' as ExpenseGroupKey },
    PLANO_DE_SAUDE_PRODUCAO: {
      order: 17,
      key: 'PLANO_DE_SAUDE_PRODUCAO',
      value: 'Plano de Saúde (Setor Produtivo)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    VALE_ALIMENTACAO_PRODUCAO: {
      order: 18,
      key: 'VALE_ALIMENTACAO_PRODUCAO',
      value: 'Vale Alimentação (Setor Produtivo)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    VALE_TRANSPORTE_PRODUCAO: {
      order: 19,
      key: 'VALE_TRANSPORTE_PRODUCAO',
      value: 'Vale Transporte (Setor Produtivo)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    PRO_LABORE: { order: 20, key: 'PRO_LABORE', value: 'Pró Labore', group: 'MAO_DE_OBRA' as ExpenseGroupKey },
    SALARIOS_ADMINISTRATIVOS: {
      order: 21,
      key: 'SALARIOS_ADMINISTRATIVOS',
      value: 'Salários Administrativos',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    SALARIOS_COMERCIAIS: { order: 22, key: 'SALARIOS_COMERCIAIS', value: 'Salários Comerciais', group: 'MAO_DE_OBRA' as ExpenseGroupKey },
    DECIMO_TERCEIRO_PRO_LABORE_ADMIN_COMER: {
      order: 23,
      key: 'DECIMO_TERCEIRO_PRO_LABORE_ADMIN_COMER',
      value: 'Décimo Terceiro (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    FERIAS_COLABORADORES_PRO_LABORE_ADMIN_COMER: {
      order: 24,
      key: 'FERIAS_COLABORADORES_PRO_LABORE_ADMIN_COMER',
      value: 'Férias Colaboradores (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    FGTS_PRO_LABORE_ADMIN_COMER: {
      order: 25,
      key: 'FGTS_PRO_LABORE_ADMIN_COMER',
      value: 'FGTS (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    INSS_PRO_LABORE_ADMIN_COMER: {
      order: 26,
      key: 'INSS_PRO_LABORE_ADMIN_COMER',
      value: 'INSS (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    PLANO_DE_SAUDE_PRO_LABORE_ADMIN_COMER: {
      order: 27,
      key: 'PLANO_DE_SAUDE_PRO_LABORE_ADMIN_COMER',
      value: 'Plano de Saúde (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    VALE_ALIMENTACAO_PRO_LABORE_ADMIN_COMER: {
      order: 28,
      key: 'VALE_ALIMENTACAO_PRO_LABORE_ADMIN_COMER',
      value: 'Vale Alimentação (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    VALE_TRANSPORTE_PRO_LABORE_ADMIN_COMER: {
      order: 29,
      key: 'VALE_TRANSPORTE_PRO_LABORE_ADMIN_COMER',
      value: 'Vale Transporte (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    AGUA: { order: 30, key: 'AGUA', value: 'Água', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    ALUGUEL: { order: 31, key: 'ALUGUEL', value: 'Aluguel', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    APLICACOES_CONSORCIOS: {
      order: 32,
      key: 'APLICACOES_CONSORCIOS',
      value: 'Aplicações / Consórcios',
      group: 'DESPESA_FINANCEIRA' as ExpenseGroupKey,
    },
    CONSULTORIA: { order: 33, key: 'CONSULTORIA', value: 'Consultoria', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    CONTABILIDADE: { order: 34, key: 'CONTABILIDADE', value: 'Contabilidade', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    DEPRECIACAO: { order: 35, key: 'DEPRECIACAO', value: 'Depreciação', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    EMPRESTIMOS: { order: 36, key: 'EMPRESTIMOS', value: 'Empréstimos', group: 'DESPESA_FINANCEIRA' as ExpenseGroupKey },
    ENERGIA_ELETRICA: { order: 37, key: 'ENERGIA_ELETRICA', value: 'Energia Elétrica', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    IMPOSTOS_IPTU_IPVA: { order: 38, key: 'IMPOSTOS_IPTU_IPVA', value: 'Impostos IPTU / IPVA', group: 'IMPOSTO' as ExpenseGroupKey },
    INTERNET: { order: 39, key: 'INTERNET', value: 'Internet', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    SEGURANCA_MONITORAMENTO: {
      order: 40,
      key: 'SEGURANCA_MONITORAMENTO',
      value: 'Segurança / Monitoramento',
      group: 'DESPESA_FIXA' as ExpenseGroupKey,
    },
    SEGUROS: { order: 41, key: 'SEGUROS', value: 'Seguros', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    SISTEMA_DE_GESTAO_SOFTWARES: {
      order: 42,
      key: 'SISTEMA_DE_GESTAO_SOFTWARES',
      value: 'Sistema de Gestão / Softwares',
      group: 'DESPESA_FIXA' as ExpenseGroupKey,
    },
    TELEFONE: { order: 43, key: 'TELEFONE', value: 'Telefone', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    RESCISOES_INDENIZACOES: {
      order: 44,
      key: 'RESCISOES_INDENIZACOES',
      value: 'Recisões / Indenizações',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    SAUDE_TRABALHISTA_OCUPACIONAL: {
      order: 45,
      key: 'SAUDE_TRABALHISTA_OCUPACIONAL',
      value: 'Saúde Trabalhista / Ocupacional',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    MEI: { order: 46, key: 'MEI', value: 'MEI (Microempreendedor Individual)', group: 'IMPOSTO' as ExpenseGroupKey },
    COMISSOES_DE_VENDA: { order: 47, key: 'COMISSOES_DE_VENDA', value: 'Comissões de Venda', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    COMBUSTIVEIS: { order: 48, key: 'COMBUSTIVEIS', value: 'Combustíveis', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    CORREIOS: { order: 49, key: 'CORREIOS', value: 'Correios', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    DEPARTAMENTO_JURIDICO: {
      order: 50,
      key: 'DEPARTAMENTO_JURIDICO',
      value: 'Departamento Jurídico',
      group: 'DESPESA_FIXA' as ExpenseGroupKey,
    },
    EMBALAGENS_DIVERSAS: { order: 51, key: 'EMBALAGENS_DIVERSAS', value: 'Embalagens Diversas', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    FRETES_VALORES_RELACIONADOS_A_ENTREGA_DOS_PRODUTOS: {
      order: 52,
      key: 'FRETES_VALORES_RELACIONADOS_A_ENTREGA_DOS_PRODUTOS',
      value: 'Fretes (Valores relacionados a entrega dos produtos)',
      group: 'DESPESA_VARIAVEL' as ExpenseGroupKey,
    },
    HORAS_EXTRAS_SALARIOS: {
      order: 53,
      key: 'HORAS_EXTRAS_SALARIOS',
      value: 'Horas Extras - Salários',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    MANUTENCOES: { order: 54, key: 'MANUTENCOES', value: 'Manutenções', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    MARKETING_PUBLICIDADES_E_RELACIONADOS: {
      order: 55,
      key: 'MARKETING_PUBLICIDADES_E_RELACIONADOS',
      value: 'Marketing (publicidades e relacionados)',
      group: 'DESPESA_VARIAVEL' as ExpenseGroupKey,
    },
    PEDAGIOS: { order: 56, key: 'PEDAGIOS', value: 'Pedágios', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    TERCERIZACOES: { order: 57, key: 'TERCERIZACOES', value: 'Terceirizações', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    USO_E_CONSUMO: { order: 58, key: 'USO_E_CONSUMO', value: 'Uso e Consumo', group: 'DESPESA_VARIAVEL' as ExpenseGroupKey },
    VALE_ALIMENTACAO_TERCERIZADOS: {
      order: 59,
      key: 'VALE_ALIMENTACAO_TERCERIZADOS',
      value: 'Vale Alimentação Tercerizados',
      group: 'MAO_DE_OBRA' as ExpenseGroupKey,
    },
    VIAGENS_HOTEIS_PASSAGENS_ALIMENTACAO_ETC: {
      order: 60,
      key: 'VIAGENS_HOTEIS_PASSAGENS_ALIMENTACAO_ETC',
      value: 'Viagens (hoteis / passagens / alimentação / ETC)',
      group: 'DESPESA_VARIAVEL' as ExpenseGroupKey,
    },
    JUROS: { order: 61, key: 'JUROS', value: 'Juros', group: 'DESPESA_FINANCEIRA' as ExpenseGroupKey },
    TAXAS_CARTAO: { order: 62, key: 'TAXAS_CARTAO', value: 'Taxas Cartão', group: 'DESPESA_FINANCEIRA' as ExpenseGroupKey },
    TAXAS_BANCARIAS: { order: 63, key: 'TAXAS_BANCARIAS', value: 'Taxas Bancárias', group: 'DESPESA_FINANCEIRA' as ExpenseGroupKey },
    TROCA_CHEQUE: { order: 64, key: 'TROCA_CHEQUE', value: 'Troca Cheque', group: 'DESPESA_FINANCEIRA' as ExpenseGroupKey },
    IMPOSTO_DARF: { order: 65, key: 'IMPOSTO_DARF', value: 'Imposto DARF', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_GA: { order: 66, key: 'IMPOSTO_GA', value: 'Imposto Guia Arrecadação (GA)', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_GARE: { order: 67, key: 'IMPOSTO_GARE', value: 'Imposto GARE', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_GPS: { order: 68, key: 'IMPOSTO_GPS', value: 'Imposto GPS', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_IOF: { order: 69, key: 'IMPOSTO_IOF', value: 'Imposto IOF', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_ISS: { order: 70, key: 'IMPOSTO_ISS', value: 'Imposto ISS', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_OUTROS: { order: 71, key: 'IMPOSTO_OUTROS', value: 'Imposto Outros', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_DAS: { order: 72, key: 'IMPOSTO_DAS', value: 'Imposto DAS', group: 'IMPOSTO' as ExpenseGroupKey },
    INVESTIMENTOS_MAQUINAS_E_EQUIPAMENTOS: {
      order: 73,
      key: 'INVESTIMENTOS_MAQUINAS_E_EQUIPAMENTOS',
      value: 'Investimentos (máquinas e equipamentos)',
      group: 'DESPESA_FIXA' as ExpenseGroupKey,
    },
    DISTRIBUICAO_DE_LUCROS: {
      order: 74,
      key: 'DISTRIBUICAO_DE_LUCROS',
      value: 'Distribuição de Lucros',
      group: 'DESPESA_FINANCEIRA' as ExpenseGroupKey,
    },
  },
}

export const ALL_CASHIER_CATEGORIES = { ...CASHIER_CATEGORY.EXPENSE, ...CASHIER_CATEGORY.INCOME }
export const YEARLY_AVERAGE_CATEGORIES = [
  CASHIER_CATEGORY.EXPENSE.DECIMO_TERCEIRO_PRODUCAO,
  CASHIER_CATEGORY.EXPENSE.FERIAS_COLABORADORES_PRODUCAO,
  CASHIER_CATEGORY.EXPENSE.DECIMO_TERCEIRO_PRO_LABORE_ADMIN_COMER,
  CASHIER_CATEGORY.EXPENSE.FERIAS_COLABORADORES_PRO_LABORE_ADMIN_COMER,
  CASHIER_CATEGORY.EXPENSE.IMPOSTOS_IPTU_IPVA,
  CASHIER_CATEGORY.EXPENSE.SEGUROS,
  CASHIER_CATEGORY.EXPENSE.RESCISOES_INDENIZACOES,
  CASHIER_CATEGORY.EXPENSE.DEPARTAMENTO_JURIDICO,
  CASHIER_CATEGORY.EXPENSE.MANUTENCOES,
  CASHIER_CATEGORY.EXPENSE.VIAGENS_HOTEIS_PASSAGENS_ALIMENTACAO_ETC
]

export type CASHIER_CATEGORY_EXPENSE_OBJECT = keyof typeof CASHIER_CATEGORY.EXPENSE
export type CASHIER_CATEGORY_INCOME_OBJECT = keyof typeof CASHIER_CATEGORY.INCOME

export function getDefaultGroupForCategory(categoryKey: string): ExpenseGroupKey | null {
  const entry = CASHIER_CATEGORY.EXPENSE[categoryKey as CASHIER_CATEGORY_EXPENSE_OBJECT]
  if (entry && 'group' in entry) return entry.group
  return null
}

export function getExpenseGroupLabel(groupKey: string): string {
  return EXPENSE_GROUPS[groupKey as ExpenseGroupKey]?.label ?? groupKey
}

export function getExpenseGroupColor(groupKey: string): string {
  return EXPENSE_GROUPS[groupKey as ExpenseGroupKey]?.color ?? '#6B7280'
}
