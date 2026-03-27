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
  { key: 'FERIAS_COLABORADORES_PRODUCAO', label: 'Férias Colaboradores (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FGTS_PRODUCAO', label: 'FGTS (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_PRODUCAO', label: 'INSS (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_PATRONAL_PRODUCAO', label: 'INSS Patronal (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'RAT_FAP_PRODUCAO', label: 'RAT / FAP (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'HORAS_EXTRAS_SALARIOS', label: 'Horas Extras - Salários', expense_group: 'MAO_DE_OBRA' },
  { key: 'MAO_DE_OBRA_TERCEIRIZADA', label: 'Mão de Obra Terceirizada', expense_group: 'MAO_DE_OBRA' },
  { key: 'PLANO_DE_SAUDE_PRODUCAO', label: 'Plano de Saúde (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_ALIMENTACAO_PRODUCAO', label: 'Vale Alimentação (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_TRANSPORTE_PRODUCAO', label: 'Vale Transporte (Setor Produtivo)', expense_group: 'MAO_DE_OBRA' },
]

/** Bloco 2: Mão de obra administrativa */
export const BLOCK_MAO_DE_OBRA_ADMINISTRATIVA: ExpenseSetupItem[] = [
  { key: 'PRO_LABORE', label: 'Pró Labore', expense_group: 'MAO_DE_OBRA' },
  { key: 'SALARIOS_ADMINISTRATIVOS', label: 'Salários Administrativos', expense_group: 'MAO_DE_OBRA' },
  { key: 'SALARIOS_COMERCIAIS', label: 'Salários Comerciais', expense_group: 'MAO_DE_OBRA' },
  { key: 'DECIMO_TERCEIRO_PRO_LABORE_ADMIN_COMER', label: 'Décimo Terceiro (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FERIAS_COLABORADORES_PRO_LABORE_ADMIN_COMER', label: 'Férias Colaboradores (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'FGTS_PRO_LABORE_ADMIN_COMER', label: 'FGTS (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_PRO_LABORE_ADMIN_COMER', label: 'INSS (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'INSS_PATRONAL_ADMIN', label: 'INSS Patronal (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'RAT_FAP_ADMIN', label: 'RAT / FAP (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'PLANO_DE_SAUDE_PRO_LABORE_ADMIN_COMER', label: 'Plano de Saúde (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_ALIMENTACAO_PRO_LABORE_ADMIN_COMER', label: 'Vale Alimentação (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
  { key: 'VALE_TRANSPORTE_PRO_LABORE_ADMIN_COMER', label: 'Vale Transporte (Pró-Labo/ Admin/ Comer)', expense_group: 'MAO_DE_OBRA' },
]

/** Bloco 3: Despesas fixas */
export const BLOCK_DESPESAS_FIXAS: ExpenseSetupItem[] = [
  { key: 'AGUA', label: 'Água', expense_group: 'DESPESA_FIXA' },
  { key: 'ALUGUEL', label: 'Aluguel', expense_group: 'DESPESA_FIXA' },
  { key: 'APLICACOES_CONSORCIOS', label: 'Aplicações / Consórcios', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'CONSULTORIA', label: 'Consultoria', expense_group: 'DESPESA_FIXA' },
  { key: 'CONTABILIDADE', label: 'Contabilidade', expense_group: 'DESPESA_FIXA' },
  { key: 'DEPRECIACAO', label: 'Depreciação', expense_group: 'DESPESA_FIXA' },
  { key: 'EMPRESTIMOS', label: 'Empréstimos', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'ENERGIA_ELETRICA', label: 'Energia Elétrica', expense_group: 'DESPESA_FIXA' },
  { key: 'IMPOSTOS_IPTU_IPVA', label: 'Impostos IPTU / IPVA', expense_group: 'IMPOSTO' },
  { key: 'INTERNET', label: 'Internet', expense_group: 'DESPESA_FIXA' },
  { key: 'SEGURANCA_MONITORAMENTO', label: 'Segurança / Monitoramento', expense_group: 'DESPESA_FIXA' },
  { key: 'SEGUROS', label: 'Seguros', expense_group: 'DESPESA_FIXA' },
  { key: 'SEGUROS_IMOVEIS_VEICULOS', label: 'Seguros (Imóveis / Veículos)', expense_group: 'DESPESA_FIXA' },
  { key: 'SISTEMA_DE_GESTAO_SOFTWARES', label: 'Sistema de Gestão / Softwares', expense_group: 'DESPESA_FIXA' },
  { key: 'TAXAS_LICENCIAMENTO', label: 'Taxas de Licenciamento', expense_group: 'DESPESA_FIXA' },
  { key: 'TELEFONE', label: 'Telefone', expense_group: 'DESPESA_FIXA' },
  { key: 'RESCISOES_INDENIZACOES', label: 'Recisões / Indenizações', expense_group: 'MAO_DE_OBRA' },
  { key: 'SAUDE_TRABALHISTA_OCUPACIONAL', label: 'Saúde Trabalhista / Ocupacional', expense_group: 'MAO_DE_OBRA' },
  { key: 'INVESTIMENTOS_MAQUINAS_E_EQUIPAMENTOS', label: 'Investimentos (máquinas e equipamentos)', expense_group: 'DESPESA_FIXA' },
  { key: 'MEI', label: 'MEI (Microempreendedor Individual)', expense_group: 'IMPOSTO' },
]

/** Bloco 4: Despesas variáveis */
export const BLOCK_DESPESAS_VARIAVEIS: ExpenseSetupItem[] = [
  { key: 'FORNECEDORES', label: 'Fornecedores', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MATERIA_PRIMA_BASE_DOS_PROD_ROUPA_ALIMENTO_MADEIRA', label: 'Matéria Prima - Base dos produtos (Roupa/Alimento/Madeira)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'EMBALAGENS', label: 'Embalagens', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'FRETES_FOB', label: 'Fretes FOB (Valores relacionados a compra de suprimentos)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'COMISSOES_DE_VENDA', label: 'Comissões de Venda', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'COMBUSTIVEIS', label: 'Combustíveis', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'CORREIOS', label: 'Correios', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'DEPARTAMENTO_JURIDICO', label: 'Departamento Jurídico', expense_group: 'DESPESA_FIXA' },
  { key: 'EMBALAGENS_DIVERSAS', label: 'Embalagens Diversas', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'FRETES_VALORES_RELACIONADOS_A_ENTREGA_DOS_PRODUTOS', label: 'Fretes (Valores relacionados a entrega dos produtos)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MANUTENCOES', label: 'Manutenções', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MARKETING_PUBLICIDADES_E_RELACIONADOS', label: 'Marketing (publicidades e relacionados)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'PEDAGIOS', label: 'Pedágios', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'TERCERIZACOES', label: 'Terceirizações', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'USO_E_CONSUMO', label: 'Uso e Consumo', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'VALE_ALIMENTACAO_TERCERIZADOS', label: 'Vale Alimentação Terceirizados', expense_group: 'MAO_DE_OBRA' },
  { key: 'VIAGENS_HOTEIS_PASSAGENS_ALIMENTACAO_ETC', label: 'Viagens (hotéis / passagens / alimentação / ETC)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'FRETES_LOGISTICA_ENTREGA_TERCEIRIZADOS', label: 'Fretes Logística/Entrega Terceirizados', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'SEGURO_TRANSPORTE_ENTREGA', label: 'Seguro Transporte/Entrega', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'DESPESAS_ACESSORIAS', label: 'Despesas Acessórias', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'GASTOS_LOGISTICAS_EXTERNAS', label: 'Gastos Logísticas Externas', expense_group: 'DESPESA_VARIAVEL' },
]

/** Bloco 5a: Impostos — Simples Nacional */
export const BLOCK_IMPOSTOS_SIMPLES: ExpenseSetupItem[] = [
  { key: 'REGIME_TRIBUTARIO_SIMPLES', label: 'DAS (Regime Simples Nacional)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_DAS', label: 'Imposto DAS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTOS_IPTU_IPVA', label: 'Impostos IPTU / IPVA', expense_group: 'IMPOSTO' },
  { key: 'MEI', label: 'MEI (Microempreendedor Individual)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_OUTROS', label: 'Imposto Outros', expense_group: 'IMPOSTO' },
]

/** Bloco 5b: Impostos — Lucro Real / Lucro Presumido / Híbrido */
export const BLOCK_IMPOSTOS_LUCRO: ExpenseSetupItem[] = [
  { key: 'IMPOSTO_CBS', label: 'CBS (Contribuição sobre Bens e Serviços)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IBS', label: 'IBS (Imposto sobre Bens e Serviços)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ICMS', label: 'ICMS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ICMS_DIFAL', label: 'ICMS DIFAL', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ICMS_ST', label: 'ICMS-ST (Substituição Tributária)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IPI', label: 'IPI', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IS', label: 'IS (Imposto Seletivo)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_PIS_COFINS', label: 'PIS / COFINS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_FCP', label: 'FCP (Fundo de Combate à Pobreza)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_PIS_COFINS_MONOFASICO', label: 'PIS/COFINS Monofásico', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ISS_RETIDO', label: 'ISS Retido', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IRPJ', label: 'IRPJ', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_CSLL', label: 'CSLL', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ALIQUOTA_ADICIONAL_IRPJ', label: 'Alíquota Adicional IRPJ', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_DARF', label: 'Imposto DARF', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_GA', label: 'Imposto Guia Arrecadação (GA)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_GARE', label: 'Imposto GARE', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_GPS', label: 'Imposto GPS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IOF', label: 'Imposto IOF', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ISS', label: 'Imposto ISS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTOS_IPTU_IPVA', label: 'Impostos IPTU / IPVA', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_OUTROS', label: 'Imposto Outros', expense_group: 'IMPOSTO' },
]

/** Bloco 5c: Impostos — Lucro Presumido RET */
export const BLOCK_IMPOSTOS_PRESUMIDO_RET: ExpenseSetupItem[] = [
  { key: 'IMPOSTO_CBS', label: 'CBS (Contribuição sobre Bens e Serviços)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IBS', label: 'IBS (Imposto sobre Bens e Serviços)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ICMS', label: 'ICMS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ICMS_DIFAL', label: 'ICMS DIFAL', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ICMS_ST', label: 'ICMS-ST (Substituição Tributária)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IPI', label: 'IPI', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IS', label: 'IS (Imposto Seletivo)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_PIS_COFINS', label: 'PIS / COFINS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_FCP', label: 'FCP (Fundo de Combate à Pobreza)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_PIS_COFINS_MONOFASICO', label: 'PIS/COFINS Monofásico', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ISS_RETIDO', label: 'ISS Retido', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_RET', label: 'RET (Lucro Presumido RET)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_DARF', label: 'Imposto DARF', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_GA', label: 'Imposto Guia Arrecadação (GA)', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_GARE', label: 'Imposto GARE', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_GPS', label: 'Imposto GPS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_IOF', label: 'Imposto IOF', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_ISS', label: 'Imposto ISS', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTOS_IPTU_IPVA', label: 'Impostos IPTU / IPVA', expense_group: 'IMPOSTO' },
  { key: 'IMPOSTO_OUTROS', label: 'Imposto Outros', expense_group: 'IMPOSTO' },
]

/** Bloco 6: Despesas financeiras */
export const BLOCK_DESPESAS_FINANCEIRAS: ExpenseSetupItem[] = [
  { key: 'JUROS', label: 'Juros', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TAXAS_CARTAO', label: 'Taxas Cartão', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TAXAS_BANCARIAS', label: 'Taxas Bancárias', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TROCA_CHEQUE', label: 'Troca Cheque', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'DISTRIBUICAO_DE_LUCROS', label: 'Distribuição de Lucros', expense_group: 'DESPESA_FINANCEIRA' },
]

/** Bloco SN: Custo dos produtos */
export const BLOCK_CUSTO_PRODUTOS_SN: ExpenseSetupItem[] = [
  { key: 'FORNECEDORES', label: 'Fornecedores — Produtos para Revenda', expense_group: 'CUSTO_PRODUTOS' },
  { key: 'MATERIA_PRIMA_BASE_DOS_PROD_ROUPA_ALIMENTO_MADEIRA', label: 'Matéria-prima — Base dos produtos', expense_group: 'CUSTO_PRODUTOS' },
  { key: 'EMBALAGENS', label: 'Embalagens individuais', expense_group: 'CUSTO_PRODUTOS' },
]

/** Bloco SN: Despesas Fixas (sem Investimentos que vão para Lucro) */
export const BLOCK_DESPESAS_FIXAS_SN: ExpenseSetupItem[] = [
  { key: 'AGUA', label: 'Água', expense_group: 'DESPESA_FIXA' },
  { key: 'ALUGUEL', label: 'Aluguel', expense_group: 'DESPESA_FIXA' },
  { key: 'APLICACOES_CONSORCIOS', label: 'Aplicações / Consórcios', expense_group: 'DESPESA_FIXA' },
  { key: 'CONSULTORIA', label: 'Consultoria', expense_group: 'DESPESA_FIXA' },
  { key: 'CONTABILIDADE', label: 'Contabilidade', expense_group: 'DESPESA_FIXA' },
  { key: 'DEPRECIACAO', label: 'Depreciação', expense_group: 'DESPESA_FIXA' },
  { key: 'EMPRESTIMOS', label: 'Empréstimos / Financiamentos', expense_group: 'DESPESA_FIXA' },
  { key: 'ENERGIA_ELETRICA', label: 'Energia elétrica', expense_group: 'DESPESA_FIXA' },
  { key: 'IMPOSTOS_IPTU_IPVA', label: 'Impostos IPTU / IPVA', expense_group: 'DESPESA_FIXA' },
  { key: 'INTERNET', label: 'Internet', expense_group: 'DESPESA_FIXA' },
  { key: 'SEGURANCA_MONITORAMENTO', label: 'Segurança / Monitoramento', expense_group: 'DESPESA_FIXA' },
  { key: 'SEGUROS_IMOVEIS_VEICULOS', label: 'Seguros imóveis e veículos', expense_group: 'DESPESA_FIXA' },
  { key: 'SISTEMA_DE_GESTAO_SOFTWARES', label: 'Sistema de gestão / Softwares', expense_group: 'DESPESA_FIXA' },
  { key: 'TAXAS_LICENCIAMENTO', label: 'Taxas de licenciamento', expense_group: 'DESPESA_FIXA' },
  { key: 'TELEFONE', label: 'Telefone', expense_group: 'DESPESA_FIXA' },
  { key: 'SAUDE_TRABALHISTA_OCUPACIONAL', label: 'Saúde trabalhista / Ocupacional', expense_group: 'DESPESA_FIXA' },
  { key: 'MEI', label: 'MEI (Microempreendedor Individual)', expense_group: 'DESPESA_FIXA' },
]

/** Bloco SN: Despesas Variáveis (sem atividades terceirizadas e sem comissões) */
export const BLOCK_DESPESAS_VARIAVEIS_SN: ExpenseSetupItem[] = [
  { key: 'COMBUSTIVEIS', label: 'Combustíveis', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'CORREIOS', label: 'Correios', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'DEPARTAMENTO_JURIDICO', label: 'Departamento jurídico', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'EMBALAGENS_DIVERSAS', label: 'Embalagens diversas', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MANUTENCOES', label: 'Manutenções', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'MARKETING_PUBLICIDADES_E_RELACIONADOS', label: 'Marketing (publicidades e relacionados)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'PEDAGIOS', label: 'Pedágios', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'RESCISOES_INDENIZACOES', label: 'Rescisões / Indenizações', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'TERCERIZACOES', label: 'Terceirizações (prestadores de serviços)', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'USO_E_CONSUMO', label: 'Uso e consumo', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'VALE_ALIMENTACAO_TERCERIZADOS', label: 'Vale alimentação', expense_group: 'DESPESA_VARIAVEL' },
  { key: 'VIAGENS_HOTEIS_PASSAGENS_ALIMENTACAO_ETC', label: 'Viagens (hotéis / passagens / alimentação / etc)', expense_group: 'DESPESA_VARIAVEL' },
]

/** Bloco SN: Despesas Financeiras (sem Distribuição de lucros que vai para Lucro) */
export const BLOCK_DESPESAS_FINANCEIRAS_SN: ExpenseSetupItem[] = [
  { key: 'JUROS', label: 'Juros', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TAXAS_CARTAO', label: 'Taxas cartão', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TAXAS_BANCARIAS', label: 'Taxas bancárias', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'TROCA_CHEQUE', label: 'Troca cheque', expense_group: 'DESPESA_FINANCEIRA' },
  { key: 'IMPOSTO_IOF', label: 'IOF', expense_group: 'DESPESA_FINANCEIRA' },
]

/** Bloco SN: Atividades terceirizadas operacionais de entrega */
export const BLOCK_ATIVIDADES_TERCEIRIZADAS_SN: ExpenseSetupItem[] = [
  { key: 'FRETES_LOGISTICA_ENTREGA_TERCEIRIZADOS', label: 'Fretes / Logísticas de entrega terceirizados', expense_group: 'ATIVIDADES_TERCEIRIZADAS' },
  { key: 'SEGURO_TRANSPORTE_ENTREGA', label: 'Seguro de transporte entrega', expense_group: 'ATIVIDADES_TERCEIRIZADAS' },
  { key: 'DESPESAS_ACESSORIAS', label: 'Despesas acessórias', expense_group: 'ATIVIDADES_TERCEIRIZADAS' },
  { key: 'GASTOS_LOGISTICAS_EXTERNAS', label: 'Gastos com logísticas externas', expense_group: 'ATIVIDADES_TERCEIRIZADAS' },
]

/** Bloco SN: Regime tributário */
export const BLOCK_REGIME_TRIBUTARIO_SN: ExpenseSetupItem[] = [
  { key: 'REGIME_TRIBUTARIO_SIMPLES', label: 'Simples Nacional', expense_group: 'REGIME_TRIBUTARIO' },
]

/** Bloco SN: Comissões */
export const BLOCK_COMISSOES_SN: ExpenseSetupItem[] = [
  { key: 'COMISSOES_DE_VENDA', label: 'Comissões de venda', expense_group: 'COMISSOES' },
]

/** Bloco SN: Lucro */
export const BLOCK_LUCRO_SN: ExpenseSetupItem[] = [
  { key: 'INVESTIMENTOS_MAQUINAS_E_EQUIPAMENTOS', label: 'Investimentos (máquinas, equipamentos, expansão e melhorias)', expense_group: 'LUCRO' },
  { key: 'DISTRIBUICAO_DE_LUCROS', label: 'Distribuição de lucros', expense_group: 'LUCRO' },
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

/** 10 blocos para Simples Nacional / MEI */
export const EXPENSE_SETUP_BLOCKS_SN: ExpenseSetupBlockDef[] = [
  {
    id: 1,
    title: 'Custo dos produtos',
    subtitle: 'Preencha os custos de aquisição e insumos dos produtos que você revende ou fabrica.',
    categoryLabel: 'Custo dos Produtos',
    items: BLOCK_CUSTO_PRODUTOS_SN,
    expense_group: 'CUSTO_PRODUTOS',
  },
  {
    id: 2,
    title: 'Mão de obra produtiva',
    subtitle: 'Preencha os valores que se aplicam à equipe produtiva. Não é obrigatório preencher todos.',
    categoryLabel: 'Mão de obra produtiva',
    items: BLOCK_MAO_DE_OBRA_PRODUTIVA,
    expense_group: 'MAO_DE_OBRA',
  },
  {
    id: 3,
    title: 'Mão de obra administrativa',
    subtitle: 'Preencha os valores que se aplicam à equipe administrativa e comercial.',
    categoryLabel: 'Mão de obra administrativa',
    items: BLOCK_MAO_DE_OBRA_ADMINISTRATIVA,
    expense_group: 'MAO_DE_OBRA',
  },
  {
    id: 4,
    title: 'Despesas fixas',
    subtitle: 'Preencha o valor nas linhas que se aplicam. Os valores serão distribuídos no cálculo de preço.',
    categoryLabel: 'Despesa Fixa',
    items: BLOCK_DESPESAS_FIXAS_SN,
    expense_group: 'DESPESA_FIXA',
  },
  {
    id: 5,
    title: 'Despesas variáveis',
    subtitle: 'Despesas que variam conforme a produção ou as vendas.',
    categoryLabel: 'Despesa Variável',
    items: BLOCK_DESPESAS_VARIAVEIS_SN,
    expense_group: 'DESPESA_VARIAVEL',
  },
  {
    id: 6,
    title: 'Despesas financeiras',
    subtitle: 'Taxas, juros e demais despesas financeiras.',
    categoryLabel: 'Despesa Financeira',
    items: BLOCK_DESPESAS_FINANCEIRAS_SN,
    expense_group: 'DESPESA_FINANCEIRA',
  },
  {
    id: 7,
    title: 'Atividades terceirizadas operacionais de entrega',
    subtitle: 'Custos com logística e entrega terceirizados.',
    categoryLabel: 'Atividades Terceirizadas',
    items: BLOCK_ATIVIDADES_TERCEIRIZADAS_SN,
    expense_group: 'ATIVIDADES_TERCEIRIZADAS',
  },
  {
    id: 8,
    title: 'Regime tributário',
    subtitle: 'Impostos do regime Simples Nacional.',
    categoryLabel: 'Regime Tributário',
    items: BLOCK_REGIME_TRIBUTARIO_SN,
    expense_group: 'REGIME_TRIBUTARIO',
  },
  {
    id: 9,
    title: 'Comissões',
    subtitle: 'Comissões de venda pagas à equipe comercial.',
    categoryLabel: 'Comissões',
    items: BLOCK_COMISSOES_SN,
    expense_group: 'COMISSOES',
  },
  {
    id: 10,
    title: 'Lucro',
    subtitle: 'Investimentos e distribuição de lucros.',
    categoryLabel: 'Lucro',
    items: BLOCK_LUCRO_SN,
    expense_group: 'LUCRO',
  },
]
