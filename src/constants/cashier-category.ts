export type ExpenseGroupKey = 'MAO_DE_OBRA' | 'MAO_DE_OBRA_PRODUTIVA' | 'MAO_DE_OBRA_ADMINISTRATIVA' | 'DESPESA_FIXA' | 'DESPESA_FINANCEIRA' | 'DESPESA_VARIAVEL' | 'IMPOSTO' | 'IMPOSTO_LUCRO' | 'IMPOSTO_FATURAMENTO_DENTRO' | 'CUSTO_PRODUTOS' | 'ATIVIDADES_TERCEIRIZADAS' | 'REGIME_TRIBUTARIO' | 'COMISSOES' | 'LUCRO'

type StandardExpenseGroupKey = 'MAO_DE_OBRA' | 'DESPESA_FIXA' | 'DESPESA_FINANCEIRA' | 'DESPESA_VARIAVEL' | 'IMPOSTO'
export const EXPENSE_GROUPS: Record<StandardExpenseGroupKey, { key: StandardExpenseGroupKey; label: string; color: string }> = {
  MAO_DE_OBRA:        { key: 'MAO_DE_OBRA',        label: 'Mão de Obra',        color: '#7C3AED' },
  DESPESA_FIXA:       { key: 'DESPESA_FIXA',        label: 'Despesa Fixa',       color: '#2563EB' },
  DESPESA_FINANCEIRA: { key: 'DESPESA_FINANCEIRA',  label: 'Despesa Financeira', color: '#D97706' },
  DESPESA_VARIAVEL:   { key: 'DESPESA_VARIAVEL',    label: 'Despesa Variável',   color: '#059669' },
  IMPOSTO:            { key: 'IMPOSTO',             label: 'Imposto',            color: '#DC2626' },
}

export const EXPENSE_GROUP_OPTIONS: { value: string; label: string }[] = [
  ...Object.values(EXPENSE_GROUPS).map(g => ({ value: g.key, label: g.label })),
  { value: 'MAO_DE_OBRA_PRODUTIVA',      label: 'Mão de Obra Produtiva' },
  { value: 'MAO_DE_OBRA_ADMINISTRATIVA', label: 'Mão de Obra Administrativa' },
  { value: 'CUSTO_PRODUTOS',             label: 'Custo dos Produtos' },
  { value: 'ATIVIDADES_TERCEIRIZADAS',   label: 'Atividades Terceirizadas Operacionais' },
  { value: 'REGIME_TRIBUTARIO',          label: 'Regime Tributário' },
  { value: 'COMISSOES',                  label: 'Comissões' },
  { value: 'LUCRO',                      label: 'Lucro' },
  { value: 'IMPOSTO_LUCRO',             label: 'Impostos sobre o Lucro' },
  { value: 'IMPOSTO_FATURAMENTO_DENTRO', label: 'Impostos sobre o Faturamento (Por dentro)' },
]

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
    FORNECEDORES: { order: 8, key: 'FORNECEDORES', value: 'Fornecedores - Produtos para Revenda', group: 'CUSTO_PRODUTOS' as ExpenseGroupKey },
    MATERIA_PRIMA_BASE_DOS_PROD_ROUPA_ALIMENTO_MADEIRA: {
      order: 9,
      key: 'MATERIA_PRIMA_BASE_DOS_PROD_ROUPA_ALIMENTO_MADEIRA',
      value: 'Matéria Prima - Base dos produtos',
      group: 'CUSTO_PRODUTOS' as ExpenseGroupKey,
    },
    EMBALAGENS: { order: 10, key: 'EMBALAGENS', value: 'Embalagens Individuais', group: 'CUSTO_PRODUTOS' as ExpenseGroupKey },
    FRETES_FOB: {
      order: 11,
      key: 'FRETES_FOB',
      value: 'Fretes FOB (Valores relacionados a compra de suprimentos)',
      group: 'CUSTO_PRODUTOS' as ExpenseGroupKey,
    },
    SALARIOS_PRODUCAO: { order: 12, key: 'SALARIOS_PRODUCAO', value: 'Salários Produção', group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey },
    DECIMO_TERCEIRO_PRODUCAO: {
      order: 13,
      key: 'DECIMO_TERCEIRO_PRODUCAO',
      value: 'Décimo Terceiro (Setor Produtivo)',
      group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey,
    },
    FERIAS_COLABORADORES_PRODUCAO: {
      order: 14,
      key: 'FERIAS_COLABORADORES_PRODUCAO',
      value: 'Férias Colaboradores (Setor Produtivo)',
      group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey,
    },
    FGTS_PRODUCAO: { order: 15, key: 'FGTS_PRODUCAO', value: 'FGTS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey },
    INSS_PRODUCAO: { order: 16, key: 'INSS_PRODUCAO', value: 'INSS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey },
    PLANO_DE_SAUDE_PRODUCAO: {
      order: 17,
      key: 'PLANO_DE_SAUDE_PRODUCAO',
      value: 'Plano de Saúde (Setor Produtivo)',
      group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey,
    },
    VALE_ALIMENTACAO_PRODUCAO: {
      order: 18,
      key: 'VALE_ALIMENTACAO_PRODUCAO',
      value: 'Vale Alimentação (Setor Produtivo)',
      group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey,
    },
    VALE_TRANSPORTE_PRODUCAO: {
      order: 19,
      key: 'VALE_TRANSPORTE_PRODUCAO',
      value: 'Vale Transporte (Setor Produtivo)',
      group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey,
    },
    PRO_LABORE: { order: 20, key: 'PRO_LABORE', value: 'Pró Labore', group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey },
    SALARIOS_ADMINISTRATIVOS: {
      order: 21,
      key: 'SALARIOS_ADMINISTRATIVOS',
      value: 'Salários Administrativos',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    SALARIOS_COMERCIAIS: { order: 22, key: 'SALARIOS_COMERCIAIS', value: 'Salários Comerciais', group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey },
    DECIMO_TERCEIRO_PRO_LABORE_ADMIN_COMER: {
      order: 23,
      key: 'DECIMO_TERCEIRO_PRO_LABORE_ADMIN_COMER',
      value: 'Décimo Terceiro (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    FERIAS_COLABORADORES_PRO_LABORE_ADMIN_COMER: {
      order: 24,
      key: 'FERIAS_COLABORADORES_PRO_LABORE_ADMIN_COMER',
      value: 'Férias Colaboradores (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    FGTS_PRO_LABORE_ADMIN_COMER: {
      order: 25,
      key: 'FGTS_PRO_LABORE_ADMIN_COMER',
      value: 'FGTS (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    INSS_PRO_LABORE_ADMIN_COMER: {
      order: 26,
      key: 'INSS_PRO_LABORE_ADMIN_COMER',
      value: 'INSS (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    PLANO_DE_SAUDE_PRO_LABORE_ADMIN_COMER: {
      order: 27,
      key: 'PLANO_DE_SAUDE_PRO_LABORE_ADMIN_COMER',
      value: 'Plano de Saúde (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    VALE_ALIMENTACAO_PRO_LABORE_ADMIN_COMER: {
      order: 28,
      key: 'VALE_ALIMENTACAO_PRO_LABORE_ADMIN_COMER',
      value: 'Vale Alimentação (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    VALE_TRANSPORTE_PRO_LABORE_ADMIN_COMER: {
      order: 29,
      key: 'VALE_TRANSPORTE_PRO_LABORE_ADMIN_COMER',
      value: 'Vale Transporte (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    AGUA: { order: 30, key: 'AGUA', value: 'Água', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    ALUGUEL: { order: 31, key: 'ALUGUEL', value: 'Aluguel', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    APLICACOES_CONSORCIOS: {
      order: 32,
      key: 'APLICACOES_CONSORCIOS',
      value: 'Aplicações / Consórcios',
      group: 'DESPESA_FIXA' as ExpenseGroupKey,
    },
    CONSULTORIA: { order: 33, key: 'CONSULTORIA', value: 'Consultoria', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    CONTABILIDADE: { order: 34, key: 'CONTABILIDADE', value: 'Contabilidade', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    DEPRECIACAO: { order: 35, key: 'DEPRECIACAO', value: 'Depreciação', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    EMPRESTIMOS: { order: 36, key: 'EMPRESTIMOS', value: 'Empréstimos / Financiamentos', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    ENERGIA_ELETRICA: { order: 37, key: 'ENERGIA_ELETRICA', value: 'Energia Elétrica', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    IMPOSTOS_IPTU_IPVA: { order: 38, key: 'IMPOSTOS_IPTU_IPVA', value: 'Impostos IPTU / IPVA', group: 'DESPESA_FIXA' as ExpenseGroupKey },
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
      group: 'DESPESA_VARIAVEL' as ExpenseGroupKey,
    },
    SAUDE_TRABALHISTA_OCUPACIONAL: {
      order: 45,
      key: 'SAUDE_TRABALHISTA_OCUPACIONAL',
      value: 'Saúde Trabalhista / Ocupacional',
      group: 'DESPESA_FIXA' as ExpenseGroupKey,
    },
    MEI: { order: 46, key: 'MEI', value: 'MEI (Microempreendedor Individual)', group: 'DESPESA_FIXA' as ExpenseGroupKey },
    COMISSOES_DE_VENDA: { order: 47, key: 'COMISSOES_DE_VENDA', value: 'Comissões de Venda', group: 'COMISSOES' as ExpenseGroupKey },
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
      value: 'Vale Alimentação',
      group: 'DESPESA_VARIAVEL' as ExpenseGroupKey,
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
    IMPOSTO_IOF: { order: 69, key: 'IMPOSTO_IOF', value: 'IOF', group: 'DESPESA_FINANCEIRA' as ExpenseGroupKey },
    IMPOSTO_ISS: { order: 70, key: 'IMPOSTO_ISS', value: 'Imposto ISS', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_OUTROS: { order: 71, key: 'IMPOSTO_OUTROS', value: 'Imposto Outros', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_DAS: { order: 72, key: 'IMPOSTO_DAS', value: 'Imposto DAS', group: 'IMPOSTO' as ExpenseGroupKey },
    INVESTIMENTOS_MAQUINAS_E_EQUIPAMENTOS: {
      order: 73,
      key: 'INVESTIMENTOS_MAQUINAS_E_EQUIPAMENTOS',
      value: 'Investimentos (máquinas, equipamentos, expansão e melhorias)',
      group: 'LUCRO' as ExpenseGroupKey,
    },
    DISTRIBUICAO_DE_LUCROS: {
      order: 74,
      key: 'DISTRIBUICAO_DE_LUCROS',
      value: 'Distribuição de Lucros',
      group: 'LUCRO' as ExpenseGroupKey,
    },
    INSS_PATRONAL_PRODUCAO: {
      order: 75,
      key: 'INSS_PATRONAL_PRODUCAO',
      value: 'INSS Patronal (Setor Produtivo)',
      group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey,
    },
    RAT_FAP_PRODUCAO: {
      order: 76,
      key: 'RAT_FAP_PRODUCAO',
      value: 'RAT / FAP',
      group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey,
    },
    MAO_DE_OBRA_TERCEIRIZADA: {
      order: 77,
      key: 'MAO_DE_OBRA_TERCEIRIZADA',
      value: 'Mão de Obra Produtiva Terceirizada - Passível de crédito',
      group: 'MAO_DE_OBRA_PRODUTIVA' as ExpenseGroupKey,
    },
    INSS_PATRONAL_ADMIN: {
      order: 78,
      key: 'INSS_PATRONAL_ADMIN',
      value: 'INSS Patronal (Pró-Labo/ Admin/ Comer)',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    RAT_FAP_ADMIN: {
      order: 79,
      key: 'RAT_FAP_ADMIN',
      value: 'RAT / FAP',
      group: 'MAO_DE_OBRA_ADMINISTRATIVA' as ExpenseGroupKey,
    },
    SEGUROS_IMOVEIS_VEICULOS: {
      order: 80,
      key: 'SEGUROS_IMOVEIS_VEICULOS',
      value: 'Seguros (Imóveis / Veículos)',
      group: 'DESPESA_FIXA' as ExpenseGroupKey,
    },
    TAXAS_LICENCIAMENTO: {
      order: 81,
      key: 'TAXAS_LICENCIAMENTO',
      value: 'Taxas de Licenciamento',
      group: 'DESPESA_FIXA' as ExpenseGroupKey,
    },
    // Impostos regime Lucro Real / Lucro Presumido / Simples Híbrido / Presumido RET
    IMPOSTO_CBS: { order: 82, key: 'IMPOSTO_CBS', value: 'CBS (Contribuição sobre Bens e Serviços)', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_IBS: { order: 83, key: 'IMPOSTO_IBS', value: 'IBS (Imposto sobre Bens e Serviços)', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_ICMS: { order: 84, key: 'IMPOSTO_ICMS', value: 'ICMS', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_ICMS_DIFAL: { order: 85, key: 'IMPOSTO_ICMS_DIFAL', value: 'ICMS DIFAL', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_ICMS_ST: { order: 86, key: 'IMPOSTO_ICMS_ST', value: 'ICMS-ST (Substituição Tributária)', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_IPI: { order: 87, key: 'IMPOSTO_IPI', value: 'IPI', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_IS: { order: 88, key: 'IMPOSTO_IS', value: 'IS (Imposto Seletivo)', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_PIS_COFINS: { order: 89, key: 'IMPOSTO_PIS_COFINS', value: 'PIS / COFINS', group: 'IMPOSTO' as ExpenseGroupKey },
    // Impostos adicionais Lucro Real / Presumido
    IMPOSTO_FCP: { order: 91, key: 'IMPOSTO_FCP', value: 'FCP (Fundo de Combate à Pobreza)', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_PIS_COFINS_MONOFASICO: { order: 92, key: 'IMPOSTO_PIS_COFINS_MONOFASICO', value: 'PIS/COFINS Monofásico', group: 'IMPOSTO' as ExpenseGroupKey },
    IMPOSTO_ISS_RETIDO: { order: 93, key: 'IMPOSTO_ISS_RETIDO', value: 'ISS Retido', group: 'IMPOSTO' as ExpenseGroupKey },
    // Impostos sobre o lucro (Lucro Real / Lucro Presumido) — grupo próprio
    IMPOSTO_IRPJ: { order: 94, key: 'IMPOSTO_IRPJ', value: 'IRPJ (Imposto de Renda de Pessoa Jurídica)', group: 'IMPOSTO_LUCRO' as ExpenseGroupKey },
    IMPOSTO_CSLL: { order: 95, key: 'IMPOSTO_CSLL', value: 'CSLL (Contribuição Social sobre o Lucro Líquido)', group: 'IMPOSTO_LUCRO' as ExpenseGroupKey },
    IMPOSTO_ALIQUOTA_ADICIONAL_IRPJ: { order: 96, key: 'IMPOSTO_ALIQUOTA_ADICIONAL_IRPJ', value: 'Alíquota Adicional da Parcela do IRPJ', group: 'IMPOSTO_LUCRO' as ExpenseGroupKey },
    // Imposto regime Lucro Presumido RET
    IMPOSTO_RET: { order: 97, key: 'IMPOSTO_RET', value: 'RET (Lucro Presumido RET)', group: 'IMPOSTO' as ExpenseGroupKey },
    // Atividades terceirizadas operacionais de entrega
    FRETES_LOGISTICA_ENTREGA_TERCEIRIZADOS: { order: 98, key: 'FRETES_LOGISTICA_ENTREGA_TERCEIRIZADOS', value: 'Fretes / Logísticas de entrega Terceirizados', group: 'ATIVIDADES_TERCEIRIZADAS' as ExpenseGroupKey },
    SEGURO_TRANSPORTE_ENTREGA: { order: 99, key: 'SEGURO_TRANSPORTE_ENTREGA', value: 'Seguro de transporte entrega', group: 'ATIVIDADES_TERCEIRIZADAS' as ExpenseGroupKey },
    DESPESAS_ACESSORIAS: { order: 100, key: 'DESPESAS_ACESSORIAS', value: 'Despesas Acessórias', group: 'ATIVIDADES_TERCEIRIZADAS' as ExpenseGroupKey },
    GASTOS_LOGISTICAS_EXTERNAS: { order: 101, key: 'GASTOS_LOGISTICAS_EXTERNAS', value: 'Gastos com Logísticas Externas', group: 'ATIVIDADES_TERCEIRIZADAS' as ExpenseGroupKey },
    // Regime tributário
    REGIME_TRIBUTARIO_SIMPLES: { order: 90, key: 'REGIME_TRIBUTARIO_SIMPLES', value: 'Simples Nacional', group: 'REGIME_TRIBUTARIO' as ExpenseGroupKey },
    // Impostos sobre compras — Lucro Real
    IMPOSTO_IPI_CUSTO: { order: 102, key: 'IMPOSTO_IPI_CUSTO', value: 'IPI custo', group: 'IMPOSTO' as ExpenseGroupKey },
    // Impostos sobre o faturamento (Por dentro) — Lucro Real
    ICMS_PROPRIO: { order: 103, key: 'ICMS_PROPRIO', value: 'ICMS Próprio', group: 'IMPOSTO_FATURAMENTO_DENTRO' as ExpenseGroupKey },
    PIS_POR_DENTRO: { order: 104, key: 'PIS_POR_DENTRO', value: 'PIS', group: 'IMPOSTO_FATURAMENTO_DENTRO' as ExpenseGroupKey },
    COFINS_POR_DENTRO: { order: 105, key: 'COFINS_POR_DENTRO', value: 'COFINS', group: 'IMPOSTO_FATURAMENTO_DENTRO' as ExpenseGroupKey },
  },
}

export const ALL_CASHIER_CATEGORIES = { ...CASHIER_CATEGORY.EXPENSE, ...CASHIER_CATEGORY.INCOME }

/** Grouped options for expense categories — organized by onboarding blocks */
import {
  BLOCK_CUSTO_PRODUTOS,
  BLOCK_MAO_DE_OBRA_PRODUTIVA,
  BLOCK_MAO_DE_OBRA_ADMINISTRATIVA,
  BLOCK_DESPESAS_FIXAS,
  BLOCK_DESPESAS_VARIAVEIS,
  BLOCK_ATIVIDADES_TERCEIRIZADAS,
  BLOCK_DESPESAS_FINANCEIRAS,
  BLOCK_COMISSOES,
  BLOCK_LUCRO,
  BLOCK_IMPOSTOS_SIMPLES,
  BLOCK_IMPOSTOS_LUCRO,
  BLOCK_IMPOSTOS_PRESUMIDO_RET,
  BLOCK_IMPOSTOS_SOBRE_LUCRO_LR,
  BLOCK_IMPOSTOS_FATURAMENTO_DENTRO_LR,
} from '@/constants/expense-setup-blocks'

const BASE_EXPENSE_CATEGORY_OPTIONS = [
  {
    label: '── Custo dos Produtos ──',
    options: BLOCK_CUSTO_PRODUTOS.map(i => ({ label: i.label, value: i.key })),
  },
  {
    label: '── Mão de Obra Produtiva ──',
    options: BLOCK_MAO_DE_OBRA_PRODUTIVA.map(i => ({ label: i.label, value: i.key })),
  },
  {
    label: '── Mão de Obra Administrativa ──',
    options: BLOCK_MAO_DE_OBRA_ADMINISTRATIVA.map(i => ({ label: i.label, value: i.key })),
  },
  {
    label: '── Despesas Fixas ──',
    options: BLOCK_DESPESAS_FIXAS.map(i => ({ label: i.label, value: i.key })),
  },
  {
    label: '── Despesas Variáveis ──',
    options: BLOCK_DESPESAS_VARIAVEIS.map(i => ({ label: i.label, value: i.key })),
  },
  {
    label: '── Atividades Terceirizadas Operacionais ──',
    options: BLOCK_ATIVIDADES_TERCEIRIZADAS.map(i => ({ label: i.label, value: i.key })),
  },
  {
    label: '── Despesas Financeiras ──',
    options: BLOCK_DESPESAS_FINANCEIRAS.map(i => ({ label: i.label, value: i.key })),
  },
  {
    label: '── Comissões ──',
    options: BLOCK_COMISSOES.map(i => ({ label: i.label, value: i.key })),
  },
  {
    label: '── Lucro ──',
    options: BLOCK_LUCRO.map(i => ({ label: i.label, value: i.key })),
  },
]

/** Full category options (used when regime is unknown) */
export const EXPENSE_CATEGORY_OPTIONS = [
  ...BASE_EXPENSE_CATEGORY_OPTIONS,
  {
    label: '── Impostos ──',
    options: [...BLOCK_IMPOSTOS_LUCRO, ...BLOCK_IMPOSTOS_PRESUMIDO_RET, ...BLOCK_IMPOSTOS_SIMPLES]
      .filter((v, i, arr) => arr.findIndex(x => x.key === v.key) === i)
      .map(i => ({ label: i.label, value: i.key })),
  },
]

// ── Categorias Simples Nacional ──
const SN_CATEGORY_GROUP_MAP: { category: string; group: string }[] = [
  { category: 'Fornecedores - Produtos para Revenda', group: 'CUSTO_PRODUTOS' },
  { category: 'Matéria Prima - Base dos produtos', group: 'CUSTO_PRODUTOS' },
  { category: 'Embalagens Individuais', group: 'CUSTO_PRODUTOS' },
  { category: 'Fretes FOB (Valores relacionados a compra de suprimentos)', group: 'CUSTO_PRODUTOS' },
  { category: 'Salários produção', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Décimo terceiro (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Férias colaboradores (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'FGTS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Horas extras — Salários', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'INSS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'INSS patronal (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Plano de saúde (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'RAT / FAP', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Vale alimentação (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Vale transporte (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Mão de obra produtiva terceirizada — passível de crédito', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Pró-labore', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Salários administrativos', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Salários comerciais', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Décimo terceiro (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Férias colaboradores (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'FGTS (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Horas extras — Salários', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'INSS (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'INSS patronal (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Plano de saúde (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'RAT / FAP', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Vale alimentação (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Vale transporte (Pró-Labo / Admin / Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Água', group: 'DESPESA_FIXA' },
  { category: 'Aluguel', group: 'DESPESA_FIXA' },
  { category: 'Aplicações / Consórcios', group: 'DESPESA_FIXA' },
  { category: 'Consultoria', group: 'DESPESA_FIXA' },
  { category: 'Contabilidade', group: 'DESPESA_FIXA' },
  { category: 'Depreciação', group: 'DESPESA_FIXA' },
  { category: 'Empréstimos / Financiamentos', group: 'DESPESA_FIXA' },
  { category: 'Energia elétrica', group: 'DESPESA_FIXA' },
  { category: 'Internet', group: 'DESPESA_FIXA' },
  { category: 'Segurança / Monitoramento', group: 'DESPESA_FIXA' },
  { category: 'Seguros imóveis e veículos', group: 'DESPESA_FIXA' },
  { category: 'Sistema de gestão / Softwares', group: 'DESPESA_FIXA' },
  { category: 'Taxas de licenciamento', group: 'DESPESA_FIXA' },
  { category: 'Telefone', group: 'DESPESA_FIXA' },
  { category: 'Saúde trabalhista / Ocupacional', group: 'DESPESA_FIXA' },
  { category: 'Investimentos (máquinas, equipamentos, expansão e melhorias)', group: 'LUCRO' },
  { category: 'Distribuição de lucros', group: 'LUCRO' },
  { category: 'Combustíveis', group: 'DESPESA_VARIAVEL' },
  { category: 'Comissões de venda', group: 'COMISSOES' },
  { category: 'Correios', group: 'DESPESA_VARIAVEL' },
  { category: 'Departamento jurídico', group: 'DESPESA_VARIAVEL' },
  { category: 'Embalagens diversas', group: 'DESPESA_VARIAVEL' },
  { category: 'Manutenções', group: 'DESPESA_VARIAVEL' },
  { category: 'Marketing (publicidades e relacionados)', group: 'DESPESA_VARIAVEL' },
  { category: 'Pedágios', group: 'DESPESA_VARIAVEL' },
  { category: 'Rescisões / Indenizações', group: 'DESPESA_VARIAVEL' },
  { category: 'Terceirizações (prestadores de serviços)', group: 'DESPESA_VARIAVEL' },
  { category: 'Uso e consumo', group: 'DESPESA_VARIAVEL' },
  { category: 'Vale alimentação', group: 'DESPESA_VARIAVEL' },
  { category: 'Viagens (hotéis / passagens / alimentação / etc)', group: 'DESPESA_VARIAVEL' },
  { category: 'Fretes / Logísticas de entrega terceirizados', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Seguro de transporte entrega', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Despesas acessórias', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Gastos com logísticas externas', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Juros', group: 'DESPESA_FINANCEIRA' },
  { category: 'Taxas cartão', group: 'DESPESA_FINANCEIRA' },
  { category: 'Taxas bancárias', group: 'DESPESA_FINANCEIRA' },
  { category: 'Troca cheque', group: 'DESPESA_FINANCEIRA' },
  { category: 'IOF', group: 'DESPESA_FINANCEIRA' },
  { category: 'Impostos IPTU / IPVA', group: 'DESPESA_FIXA' },
  { category: 'MEI (Microempreendedor Individual)', group: 'DESPESA_FIXA' },
  { category: 'DAS (Documento de Arrecadação do Simples Nacional)', group: 'REGIME_TRIBUTARIO' },
  { category: 'Simples Nacional', group: 'REGIME_TRIBUTARIO' },
]

// Maps SN-specific group names to ExpenseGroupKey values (stored in DB)
const SN_GROUP_TO_STANDARD: Record<string, ExpenseGroupKey> = {
  CUSTO_PRODUTOS: 'CUSTO_PRODUTOS',
  MAO_DE_OBRA_PRODUTIVA: 'MAO_DE_OBRA_PRODUTIVA',
  MAO_DE_OBRA_ADMINISTRATIVA: 'MAO_DE_OBRA_ADMINISTRATIVA',
  DESPESA_FIXA: 'DESPESA_FIXA',
  DESPESA_VARIAVEL: 'DESPESA_VARIAVEL',
  DESPESA_FINANCEIRA: 'DESPESA_FINANCEIRA',
  IMPOSTO: 'IMPOSTO',
  ATIVIDADES_TERCEIRIZADAS: 'ATIVIDADES_TERCEIRIZADAS',
  REGIME_TRIBUTARIO: 'REGIME_TRIBUTARIO',
  COMISSOES: 'COMISSOES',
  LUCRO: 'LUCRO',
}

const SN_EXPENSE_CATEGORY_OPTIONS = [
  { label: '── Custo dos Produtos ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'CUSTO_PRODUTOS').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Produção ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Administrativa ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Fixas ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Variáveis ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Financeiras ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Atividades Terceirizadas Operacionais ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'ATIVIDADES_TERCEIRIZADAS').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Regime Tributário ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'REGIME_TRIBUTARIO').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Comissões ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'COMISSOES').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Lucro ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'LUCRO').map(c => ({ label: c.category, value: c.category })) },
]

/** Category options filtered by tax regime */
export function getExpenseCategoryOptionsForRegime(regime: string | null | undefined) {
  if (regime === 'SIMPLES_NACIONAL') return SN_EXPENSE_CATEGORY_OPTIONS
  const impostoBlock = (regime === 'LUCRO_PRESUMIDO_RET' || regime === 'PRESUMIDO_RET')
    ? BLOCK_IMPOSTOS_PRESUMIDO_RET
    : BLOCK_IMPOSTOS_LUCRO
  const base = [...BASE_EXPENSE_CATEGORY_OPTIONS]
  if (regime === 'LUCRO_REAL') {
    base.push(
      {
        label: '── Impostos sobre o Lucro ──',
        options: BLOCK_IMPOSTOS_SOBRE_LUCRO_LR.map(i => ({ label: i.label, value: i.key })),
      },
      {
        label: '── Impostos sobre o faturamento (Por dentro) ──',
        options: BLOCK_IMPOSTOS_FATURAMENTO_DENTRO_LR.map(i => ({ label: i.label, value: i.key })),
      },
    )
  }
  base.push({
    label: '── Impostos sobre o faturamento (Por fora) ──',
    options: impostoBlock.map(i => ({ label: i.label, value: i.key })),
  })
  return base
}

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

const PRODUTIVA_KEYS = new Set(BLOCK_MAO_DE_OBRA_PRODUTIVA.map(i => i.key))
const ADMINISTRATIVA_KEYS = new Set(BLOCK_MAO_DE_OBRA_ADMINISTRATIVA.map(i => i.key))

export function getDefaultGroupForCategory(categoryKey: string): string | null {
  // Retorna tipo específico: MAO_DE_OBRA_PRODUTIVA ou MAO_DE_OBRA_ADMINISTRATIVA
  if (PRODUTIVA_KEYS.has(categoryKey)) return 'MAO_DE_OBRA_PRODUTIVA'
  if (ADMINISTRATIVA_KEYS.has(categoryKey)) return 'MAO_DE_OBRA_ADMINISTRATIVA'
  const entry = CASHIER_CATEGORY.EXPENSE[categoryKey as CASHIER_CATEGORY_EXPENSE_OBJECT]
  if (entry && 'group' in entry) return entry.group
  // Handle SN string-based categories
  const snEntry = SN_CATEGORY_GROUP_MAP.find(c => c.category === categoryKey)
  if (snEntry) return SN_GROUP_TO_STANDARD[snEntry.group] ?? null
  return null
}

/** Extended labels for expense_group values that may be more specific than the 5 parent keys */
const EXPENSE_TYPE_LABELS: Record<string, string> = {
  MAO_DE_OBRA: 'Mão de Obra (Geral)',
  MAO_DE_OBRA_PRODUTIVA: 'Mão de Obra Produtiva',
  MAO_DE_OBRA_ADMINISTRATIVA: 'Mão de Obra Administrativa',
  DESPESA_FIXA: 'Despesa Fixa',
  DESPESA_VARIAVEL: 'Despesa Variável',
  DESPESA_FINANCEIRA: 'Despesa Financeira',
  IMPOSTO: 'Imposto',
  CUSTO_PRODUTOS: 'Custo dos Produtos',
  ATIVIDADES_TERCEIRIZADAS: 'Atividades Terceirizadas Operacionais',
  REGIME_TRIBUTARIO: 'Regime Tributário',
  COMISSOES: 'Comissões',
  LUCRO: 'Lucro',
}

export function getExpenseGroupLabel(groupKey: string): string {
  return EXPENSE_GROUPS[groupKey as StandardExpenseGroupKey]?.label
    ?? EXPENSE_TYPE_LABELS[groupKey]
    ?? groupKey
}

export function getExpenseGroupColor(groupKey: string): string {
  return EXPENSE_GROUPS[groupKey as StandardExpenseGroupKey]?.color ?? '#6B7280'
}

/** Tax category keys available for Lucro Real, Lucro Presumido, Simples Híbrido */
export const TAX_CATEGORIES_LUCRO = [
  'IMPOSTO_CBS', 'IMPOSTO_IBS', 'IMPOSTO_ICMS', 'IMPOSTO_ICMS_DIFAL', 'IMPOSTO_ICMS_ST',
  'IMPOSTO_IPI', 'IMPOSTO_IS', 'IMPOSTO_PIS_COFINS', 'IMPOSTO_FCP',
  'IMPOSTO_PIS_COFINS_MONOFASICO', 'IMPOSTO_ISS_RETIDO',
  'IMPOSTO_IRPJ', 'IMPOSTO_CSLL', 'IMPOSTO_ALIQUOTA_ADICIONAL_IRPJ',
  'IMPOSTO_DARF', 'IMPOSTO_GA', 'IMPOSTO_GARE', 'IMPOSTO_GPS', 'IMPOSTO_IOF', 'IMPOSTO_ISS',
  'IMPOSTO_OUTROS', 'IMPOSTOS_IPTU_IPVA',
]

/** Tax category keys available for Lucro Presumido RET */
export const TAX_CATEGORIES_PRESUMIDO_RET = [
  'IMPOSTO_CBS', 'IMPOSTO_IBS', 'IMPOSTO_ICMS', 'IMPOSTO_ICMS_DIFAL', 'IMPOSTO_ICMS_ST',
  'IMPOSTO_IPI', 'IMPOSTO_IS', 'IMPOSTO_PIS_COFINS', 'IMPOSTO_FCP',
  'IMPOSTO_PIS_COFINS_MONOFASICO', 'IMPOSTO_ISS_RETIDO', 'IMPOSTO_RET',
  'IMPOSTO_DARF', 'IMPOSTO_GA', 'IMPOSTO_GARE', 'IMPOSTO_GPS', 'IMPOSTO_IOF', 'IMPOSTO_ISS',
  'IMPOSTO_OUTROS', 'IMPOSTOS_IPTU_IPVA',
]

/** Tax category keys available for Simples Nacional */
export const TAX_CATEGORIES_SIMPLES = [
  'REGIME_TRIBUTARIO_SIMPLES',
  'IMPOSTOS_IPTU_IPVA', 'MEI',
]

/** Returns tax category keys applicable for the given tax regime */
export function getTaxCategoriesForRegime(regime: string | null | undefined): string[] {
  if (!regime) return Object.keys(CASHIER_CATEGORY.EXPENSE)
  if (regime === 'SIMPLES_NACIONAL') return TAX_CATEGORIES_SIMPLES
  if (regime === 'LUCRO_PRESUMIDO_RET' || regime === 'PRESUMIDO_RET') return TAX_CATEGORIES_PRESUMIDO_RET
  return TAX_CATEGORIES_LUCRO
}
