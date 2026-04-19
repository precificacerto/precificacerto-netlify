// Single source of truth for expense categories / groups per tax regime.
// Consumed by fluxo-de-caixa (Novo Lançamento) and controle-financeiro
// (Nova Despesa Recorrente / Novo Lançamento) so all regimes behave the same.

export type CategoryGroup = { category: string; group: string }
export type CategoryOptionGroup = {
  label: string
  options: { label: string; value: string }[]
}

// ── Base map (fallback / generic regime) ───────────────────────────────────
export const CATEGORY_GROUP_MAP: CategoryGroup[] = [
  // Mão de Obra Produtiva
  { category: 'Salários Produção', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Décimo Terceiro (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Férias Colaboradores (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'FGTS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'INSS (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Plano de Saúde (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Vale Alimentação (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  { category: 'Vale Transporte (Setor Produtivo)', group: 'MAO_DE_OBRA_PRODUTIVA' },
  // Mão de Obra Administrativa
  { category: 'Pró Labore', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Salários Administrativos', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Salários Comerciais', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Décimo Terceiro (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Férias Colaboradores (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'FGTS (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'INSS (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Plano de Saúde (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Vale Alimentação (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  { category: 'Vale Transporte (Pró-Labo/ Admin/ Comer)', group: 'MAO_DE_OBRA_ADMINISTRATIVA' },
  // Despesas Fixas
  { category: 'Água', group: 'DESPESA_FIXA' },
  { category: 'Aluguel', group: 'DESPESA_FIXA' },
  { category: 'Aplicações / Consórcios', group: 'DESPESA_FIXA' },
  { category: 'Consultoria', group: 'DESPESA_FIXA' },
  { category: 'Contabilidade', group: 'DESPESA_FIXA' },
  { category: 'Depreciação', group: 'DESPESA_FIXA' },
  { category: 'Empréstimos', group: 'DESPESA_FIXA' },
  { category: 'Energia Elétrica', group: 'DESPESA_FIXA' },
  { category: 'Impostos IPTU / IPVA', group: 'DESPESA_FIXA' },
  { category: 'Internet', group: 'DESPESA_FIXA' },
  { category: 'Segurança / Monitoramento', group: 'DESPESA_FIXA' },
  { category: 'Seguros', group: 'DESPESA_FIXA' },
  { category: 'Sistema de Gestão / Softwares', group: 'DESPESA_FIXA' },
  { category: 'Telefone', group: 'DESPESA_FIXA' },
  { category: 'Recisões / Indenizações', group: 'DESPESA_FIXA' },
  { category: 'Saúde Trabalhista / Ocupacional', group: 'DESPESA_FIXA' },
  { category: 'MEI (Microempreendedor Individual)', group: 'DESPESA_FIXA' },
  // Despesas Variáveis
  { category: 'Comissões de Venda', group: 'COMISSOES' },
  { category: 'Combustíveis', group: 'DESPESA_VARIAVEL' },
  { category: 'Correios', group: 'DESPESA_VARIAVEL' },
  { category: 'Departamento Jurídico', group: 'DESPESA_VARIAVEL' },
  { category: 'Embalagens Diversas', group: 'DESPESA_VARIAVEL' },
  { category: 'Fretes (Valores relacionados a entrega dos produtos)', group: 'DESPESA_VARIAVEL' },
  { category: 'Horas Extras - Salários', group: 'DESPESA_VARIAVEL' },
  { category: 'Manutenções', group: 'DESPESA_VARIAVEL' },
  { category: 'Marketing (publicidades e relacionados)', group: 'DESPESA_VARIAVEL' },
  { category: 'Pedágios', group: 'DESPESA_VARIAVEL' },
  { category: 'Terceirizações', group: 'DESPESA_VARIAVEL' },
  { category: 'Uso e Consumo', group: 'DESPESA_VARIAVEL' },
  { category: 'Vale Alimentação', group: 'DESPESA_VARIAVEL' },
  { category: 'Viagens (hotéis / passagens / alimentação / ETC)', group: 'DESPESA_VARIAVEL' },
  // Despesas Financeiras
  { category: 'Juros', group: 'DESPESA_FINANCEIRA' },
  { category: 'Taxas Cartão', group: 'DESPESA_FINANCEIRA' },
  { category: 'Taxas Bancárias', group: 'DESPESA_FINANCEIRA' },
  { category: 'Troca Cheque', group: 'DESPESA_FINANCEIRA' },
]

// ── Lucro Real / Simples Híbrido ───────────────────────────────────────────
export const LR_CUSTO_PRODUTOS: CategoryGroup[] = [
  { category: 'Fornecedores - Produtos para Revenda', group: 'CUSTO_PRODUTOS' },
  { category: 'Matéria Prima - Base dos produtos', group: 'CUSTO_PRODUTOS' },
  { category: 'Embalagens Individuais', group: 'CUSTO_PRODUTOS' },
  { category: 'Fretes FOB (Valores relacionados a compra de suprimentos)', group: 'CUSTO_PRODUTOS' },
]

export const LR_ATIVIDADES_TERCEIRIZADAS: CategoryGroup[] = [
  { category: 'Fretes/Logísticas de Entrega Terceirizados', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Seguro de Transporte Entrega', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Despesas Acessórias', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Gastos com Logísticas Externas', group: 'ATIVIDADES_TERCEIRIZADAS' },
]

export const LR_LUCRO: CategoryGroup[] = [
  { category: 'INVESTIMENTOS (Máquinas, Equipamentos, Expansão e Melhorias)', group: 'LUCRO' },
  { category: 'DISTRIBUIÇÃO DE LUCROS', group: 'LUCRO' },
]

export const LR_IMPOSTOS_SOBRE_LUCRO: CategoryGroup[] = [
  { category: 'IRPJ (Imposto de Renda de Pessoa Jurídica)', group: 'IMPOSTO_LUCRO' },
  { category: 'CSLL (Contribuição Social sobre o Lucro Líquido)', group: 'IMPOSTO_LUCRO' },
  { category: 'Alíquota Adicional da Parcela do IRPJ', group: 'IMPOSTO_LUCRO' },
]

export const LR_IMPOSTOS_FATURAMENTO_DENTRO: CategoryGroup[] = [
  { category: 'ICMS Próprio', group: 'IMPOSTO_FATURAMENTO_DENTRO' },
  { category: 'PIS', group: 'IMPOSTO_FATURAMENTO_DENTRO' },
  { category: 'COFINS', group: 'IMPOSTO_FATURAMENTO_DENTRO' },
]

export const LR_IMPOSTOS_FATURAMENTO_FORA: CategoryGroup[] = [
  { category: 'CBS (Contribuição sobre Bens e Serviços)', group: 'IMPOSTO' },
  { category: 'IBS (Imposto sobre Bens e Serviços)', group: 'IMPOSTO' },
  { category: 'IPI custo', group: 'IMPOSTO' },
  { category: 'ICMS DIFAL', group: 'IMPOSTO' },
  { category: 'ICMS-ST (Substituição Tributária)', group: 'IMPOSTO' },
  { category: 'IS (Imposto Seletivo)', group: 'IMPOSTO' },
  { category: 'FCP (Fundo de Combate à Pobreza)', group: 'IMPOSTO' },
]

// Categorias que disparam o detalhamento manual de impostos recuperáveis
// (ICMS / PIS / COFINS / IPI / CBS / IBS) no lançamento — Lucro Real / Simples Híbrido
export const LR_CUSTO_CATEGORIES_SPECIAL = [
  'Fornecedores - Produtos para Revenda',
  'Matéria Prima - Base dos produtos',
  'Embalagens Individuais',
  'Fretes FOB (Valores relacionados a compra de suprimentos)',
] as const

// ── Lucro Presumido / Presumido RET ────────────────────────────────────────
export const LP_IMPOSTOS_SOBRE_LUCRO: CategoryGroup[] = [
  { category: 'IRPJ (Imposto de Renda de Pessoa Jurídica)', group: 'IMPOSTO_LUCRO' },
  { category: 'CSLL (Contribuição Social sobre o Lucro Líquido)', group: 'IMPOSTO_LUCRO' },
  { category: 'Alíquota Adicional da parcela do IRPJ', group: 'IMPOSTO_LUCRO' },
]

export const LP_IMPOSTOS_FATURAMENTO_DENTRO: CategoryGroup[] = [
  { category: 'ICMS Próprio', group: 'IMPOSTO_FATURAMENTO_DENTRO' },
  { category: 'PIS (Cumulativo)', group: 'IMPOSTO_FATURAMENTO_DENTRO' },
  { category: 'COFINS (Cumulativo)', group: 'IMPOSTO_FATURAMENTO_DENTRO' },
]

// ── Simples Nacional / MEI ─────────────────────────────────────────────────
export const SN_CATEGORY_GROUP_MAP: CategoryGroup[] = [
  // Custo Produtos
  { category: 'Fornecedores — Produtos para Revenda', group: 'CUSTO_PRODUTOS' },
  { category: 'Matéria-prima — Base dos produtos', group: 'CUSTO_PRODUTOS' },
  { category: 'Embalagens individuais', group: 'CUSTO_PRODUTOS' },
  // Mão de Obra Produção
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
  // Mão de Obra Administrativa
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
  // Despesa Fixa
  { category: 'Água', group: 'DESPESA_FIXA' },
  { category: 'Aluguel', group: 'DESPESA_FIXA' },
  { category: 'Aplicações / Consórcios', group: 'DESPESA_FIXA' },
  { category: 'Consultoria', group: 'DESPESA_FIXA' },
  { category: 'Contabilidade', group: 'DESPESA_FIXA' },
  { category: 'Depreciação', group: 'DESPESA_FIXA' },
  { category: 'Empréstimos / Financiamentos', group: 'DESPESA_FIXA' },
  { category: 'Energia elétrica', group: 'DESPESA_FIXA' },
  { category: 'Impostos IPTU / IPVA', group: 'DESPESA_FIXA' },
  { category: 'Internet', group: 'DESPESA_FIXA' },
  { category: 'Segurança / Monitoramento', group: 'DESPESA_FIXA' },
  { category: 'Seguros imóveis e veículos', group: 'DESPESA_FIXA' },
  { category: 'Sistema de gestão / Softwares', group: 'DESPESA_FIXA' },
  { category: 'Taxas de licenciamento', group: 'DESPESA_FIXA' },
  { category: 'Telefone', group: 'DESPESA_FIXA' },
  { category: 'Saúde trabalhista / Ocupacional', group: 'DESPESA_FIXA' },
  { category: 'MEI (Microempreendedor Individual)', group: 'DESPESA_FIXA' },
  // Despesa Variável
  { category: 'Combustíveis', group: 'DESPESA_VARIAVEL' },
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
  // Despesa Financeira
  { category: 'Juros', group: 'DESPESA_FINANCEIRA' },
  { category: 'Taxas cartão', group: 'DESPESA_FINANCEIRA' },
  { category: 'Taxas bancárias', group: 'DESPESA_FINANCEIRA' },
  { category: 'Troca cheque', group: 'DESPESA_FINANCEIRA' },
  { category: 'IOF', group: 'DESPESA_FINANCEIRA' },
  // Atividades Terceirizadas
  { category: 'Fretes / Logísticas de entrega terceirizados', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Seguro de transporte entrega', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Despesas acessórias', group: 'ATIVIDADES_TERCEIRIZADAS' },
  { category: 'Gastos com logísticas externas', group: 'ATIVIDADES_TERCEIRIZADAS' },
  // Regime Tributário
  { category: 'DAS (Documento de Arrecadação do Simples Nacional)', group: 'REGIME_TRIBUTARIO' },
  { category: 'Simples Nacional', group: 'REGIME_TRIBUTARIO' },
  // Comissões
  { category: 'Comissões de venda', group: 'COMISSOES' },
  // Lucro
  { category: 'Investimentos (máquinas, equipamentos, expansão e melhorias)', group: 'LUCRO' },
  { category: 'Distribuição de lucros', group: 'LUCRO' },
]

// ── Grouped option lists consumed by AntD Select ───────────────────────────
export const EXPENSE_CATEGORY_OPTIONS: CategoryOptionGroup[] = [
  { label: '── Mão de Obra Produtiva ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Administrativa ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Fixas ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Variáveis ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Financeiras ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Comissões ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'COMISSOES').map(c => ({ label: c.category, value: c.category })) },
]

export const LR_EXPENSE_CATEGORY_OPTIONS: CategoryOptionGroup[] = [
  { label: '── Custo dos Produtos ──', options: LR_CUSTO_PRODUTOS.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Produtiva ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Administrativa ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Fixas ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Variáveis ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Atividades Terceirizadas Operacionais de Entrega ──', options: LR_ATIVIDADES_TERCEIRIZADAS.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Financeiras ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Comissões ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'COMISSOES').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Lucro ──', options: LR_LUCRO.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Impostos sobre o Lucro ──', options: LR_IMPOSTOS_SOBRE_LUCRO.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Impostos sobre o Faturamento (Por dentro) ──', options: LR_IMPOSTOS_FATURAMENTO_DENTRO.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Impostos sobre o Faturamento (Por fora) ──', options: LR_IMPOSTOS_FATURAMENTO_FORA.map(c => ({ label: c.category, value: c.category })) },
]

export const LP_EXPENSE_CATEGORY_OPTIONS: CategoryOptionGroup[] = [
  { label: '── Custo dos Produtos ──', options: LR_CUSTO_PRODUTOS.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Produtiva ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Administrativa ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Fixas ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Variáveis ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Atividades Terceirizadas Operacionais de Entrega ──', options: LR_ATIVIDADES_TERCEIRIZADAS.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Financeiras ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Comissões ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'COMISSOES').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Lucro ──', options: LR_LUCRO.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Impostos sobre o Lucro ──', options: LP_IMPOSTOS_SOBRE_LUCRO.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Impostos sobre o Faturamento (Por dentro) ──', options: LP_IMPOSTOS_FATURAMENTO_DENTRO.map(c => ({ label: c.category, value: c.category })) },
  { label: '── Impostos sobre o Faturamento (Por fora) ──', options: CATEGORY_GROUP_MAP.filter(c => c.group === 'IMPOSTO').map(c => ({ label: c.category, value: c.category })) },
]

export const SN_EXPENSE_CATEGORY_OPTIONS: CategoryOptionGroup[] = [
  { label: '── Custo dos Produtos ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'CUSTO_PRODUTOS').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Produção ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_PRODUTIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Mão de Obra Administrativa ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'MAO_DE_OBRA_ADMINISTRATIVA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Fixas ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FIXA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Variáveis ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_VARIAVEL').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Despesas Financeiras ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'DESPESA_FINANCEIRA').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Atividades Terceirizadas Operacionais de Entrega ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'ATIVIDADES_TERCEIRIZADAS').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Regime Tributário ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'REGIME_TRIBUTARIO').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Comissões ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'COMISSOES').map(c => ({ label: c.category, value: c.category })) },
  { label: '── Lucro ──', options: SN_CATEGORY_GROUP_MAP.filter(c => c.group === 'LUCRO').map(c => ({ label: c.category, value: c.category })) },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function isSimplesRegime(regime: string | null | undefined): boolean {
  return regime === 'SIMPLES_NACIONAL' || regime === 'MEI'
}
function isLucroRealRegime(regime: string | null | undefined): boolean {
  return regime === 'LUCRO_REAL' || regime === 'SIMPLES_HIBRIDO'
}
function isLucroPresumidoRegime(regime: string | null | undefined): boolean {
  return regime === 'LUCRO_PRESUMIDO' || regime === 'PRESUMIDO_RET'
}

/** Returns the grouped option list appropriate for the tenant's tax regime. */
export function getExpenseCategoryOptionsForRegime(regime: string | null | undefined): CategoryOptionGroup[] {
  if (isSimplesRegime(regime)) return SN_EXPENSE_CATEGORY_OPTIONS
  if (isLucroRealRegime(regime)) return LR_EXPENSE_CATEGORY_OPTIONS
  if (isLucroPresumidoRegime(regime)) return LP_EXPENSE_CATEGORY_OPTIONS
  return EXPENSE_CATEGORY_OPTIONS
}

/** Resolves the expense_group for a given category name under the tenant's regime. */
export function getGroupForCategoryByRegime(regime: string | null | undefined, category: string): string | undefined {
  if (!category) return undefined
  if (isSimplesRegime(regime)) {
    return SN_CATEGORY_GROUP_MAP.find(c => c.category === category)?.group
  }
  if (isLucroRealRegime(regime)) {
    const lr = [
      ...LR_CUSTO_PRODUTOS,
      ...LR_ATIVIDADES_TERCEIRIZADAS,
      ...LR_LUCRO,
      ...LR_IMPOSTOS_SOBRE_LUCRO,
      ...LR_IMPOSTOS_FATURAMENTO_DENTRO,
      ...LR_IMPOSTOS_FATURAMENTO_FORA,
      ...CATEGORY_GROUP_MAP,
    ]
    return lr.find(c => c.category === category)?.group
  }
  if (isLucroPresumidoRegime(regime)) {
    const lp = [
      ...LR_CUSTO_PRODUTOS,
      ...LR_ATIVIDADES_TERCEIRIZADAS,
      ...LR_LUCRO,
      ...LP_IMPOSTOS_SOBRE_LUCRO,
      ...LP_IMPOSTOS_FATURAMENTO_DENTRO,
      ...CATEGORY_GROUP_MAP,
    ]
    return lp.find(c => c.category === category)?.group
  }
  return CATEGORY_GROUP_MAP.find(c => c.category === category)?.group
}

/** Returns true when the category triggers the ICMS/PIS/COFINS/IPI/CBS/IBS breakdown
 * inputs on the expense form (only for Lucro Real / Simples Híbrido). */
export function categoryRequiresLrTaxBreakdown(regime: string | null | undefined, category: string): boolean {
  if (!isLucroRealRegime(regime)) return false
  return (LR_CUSTO_CATEGORIES_SPECIAL as readonly string[]).includes(category)
}
