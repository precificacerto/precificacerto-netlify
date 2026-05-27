/**
 * Cash-flow types & lightweight helpers.
 *
 * Onda 3 / Commit 0 (Founder 2026-05-27): split de `export-cash-flow-excel.ts`.
 * Este módulo concentra constantes e helpers SEM dependência de ExcelJS, pra
 * permitir que páginas como `/fluxo-de-caixa` importem só os types
 * estaticamente — sem trazer ~350KB de ExcelJS pro bundle First Load JS.
 *
 * As funções pesadas `exportCashFlowToExcel` / `exportCashFlowMultiMonth`
 * permanecem em `export-cash-flow-excel.ts` e devem ser carregadas via
 * dynamic import no callback do botão "Exportar".
 */

// ── Income row mapping (payment_method OR category → Excel row label) ──
export const INCOME_ROWS = [
    { key: 'CARTAO_CREDITO', label: 'CARTAO CREDITO' },
    { key: 'CARTAO_DEBITO', label: 'CARTAO DEBITO' },
    { key: 'CHEQUE', label: 'CHEQUES' },
    { key: 'CHEQUE_PRE_DATADO', label: 'CHEQUES' },
    { key: 'CHEQUES_A_VISTA', label: 'CHEQUES' },
    { key: 'CHEQUES_PRE_DATADOS', label: 'CHEQUES' },
    { key: 'DINHEIRO', label: 'DINHEIRO' },
    { key: 'PIX', label: 'PIX' },
    { key: 'TRANSFERENCIA', label: 'TRANSFERENCIA' },
    { key: 'TRANSFERENCIA_BANCARIA', label: 'TRANSFERENCIA' },
    { key: 'BOLETO', label: 'TRANSFERENCIA' },
    { key: 'PERMUTA', label: 'OUTRAS ENTRADAS' },
]

// Unique income labels in display order
// NOTE: 'OUTRAS ENTRADAS' is used (not 'OUTROS') to avoid key collision with expense group 'OUTROS' in pivotByDay
export const INCOME_LABELS = [
    'CARTAO CREDITO', 'CARTAO DEBITO', 'CHEQUES', 'DINHEIRO', 'PIX', 'TRANSFERENCIA', 'OUTRAS ENTRADAS',
]

// ── Expense sections following the Excel template structure ──
export interface ExpenseSection {
    header: string
    items: { descMatch: string[]; label: string }[]
}

export const EXPENSE_SECTIONS: ExpenseSection[] = [
    {
        header: 'Custo produto',
        items: [
            { descMatch: ['Fornecedores'], label: 'FORNECEDORES' },
            { descMatch: ['Matéria Prima', 'Materia Prima'], label: 'MATERIA PRIMA' },
            { descMatch: ['Embalagens', 'EMBALAGENS'], label: 'EMBALAGENS INDIVIDUAIS' },
            { descMatch: ['Fretes FOB'], label: 'FRETES FOB' },
        ],
    },
    {
        header: 'Custo Mao de obra Producao',
        items: [
            { descMatch: ['Salários Produção', 'Salarios Producao'], label: 'SALARIOS PRODUCAO' },
            { descMatch: ['Décimo Terceiro (Setor Produtivo)'], label: 'DECIMO TERCEIRO' },
            { descMatch: ['Férias Colaboradores (Setor Produtivo)', 'Férias (Setor Produtivo)'], label: 'FERIAS' },
            { descMatch: ['FGTS (Setor Produtivo)'], label: 'FGTS' },
            { descMatch: ['INSS (Setor Produtivo)'], label: 'INSS' },
            { descMatch: ['Plano de Saúde (Setor Produtivo)'], label: 'PLANO DE SAUDE' },
            { descMatch: ['Vale Alimentação (Setor Produtivo)'], label: 'VALE ALIMENTACAO' },
            { descMatch: ['Vale Transporte (Setor Produtivo)'], label: 'VALE TRANSPORTE' },
        ],
    },
    {
        header: 'Despesa Mao de obra Indireta',
        items: [
            { descMatch: ['Pró Labore', 'Pro Labore'], label: 'PRO LABORE' },
            { descMatch: ['Salários Administrativos', 'Salarios Administrativos'], label: 'SALARIOS ADMIN' },
            { descMatch: ['Salários Comerciais', 'Salarios Comerciais'], label: 'SALARIOS COMERCIAIS' },
            { descMatch: ['Décimo Terceiro (Pró-Labo', 'Décimo Terceiro (Pro-Labo'], label: 'DECIMO TERCEIRO' },
            { descMatch: ['Férias Colaboradores (Pró-Labo', 'Férias (Pró-Labo'], label: 'FERIAS' },
            { descMatch: ['FGTS (Pró-Labo'], label: 'FGTS' },
            { descMatch: ['INSS (Pró-Labo'], label: 'INSS' },
            { descMatch: ['Plano de Saúde (Pró-Labo'], label: 'PLANO DE SAUDE' },
            { descMatch: ['Vale Alimentação (Pró-Labo'], label: 'VALE ALIMENTACAO' },
            { descMatch: ['Vale Transporte (Pró-Labo'], label: 'VALE TRANSPORTE' },
        ],
    },
    {
        header: 'Despesas fixas',
        items: [
            { descMatch: ['Água', 'Agua'], label: 'AGUA' },
            { descMatch: ['Aluguel'], label: 'ALUGUEL' },
            { descMatch: ['Aplicações / Consórcios', 'Aplicacoes'], label: 'APLICACOES/CONSORCIOS' },
            { descMatch: ['Consultoria'], label: 'CONSULTORIA' },
            { descMatch: ['Contabilidade'], label: 'CONTABILIDADE' },
            { descMatch: ['Depreciação', 'Depreciacao'], label: 'DEPRECIACAO' },
            { descMatch: ['Empréstimos', 'Emprestimos'], label: 'EMPRESTIMOS' },
            { descMatch: ['Energia Elétrica', 'Energia Eletrica'], label: 'ENERGIA ELETRICA' },
            { descMatch: ['Impostos IPTU', 'IPTU', 'IPVA'], label: 'IMPOSTOS IPTU/IPVA' },
            { descMatch: ['Internet'], label: 'INTERNET' },
            { descMatch: ['Segurança / Monitoramento', 'Seguranca'], label: 'SEGURANCA/MONITORAMENTO' },
            { descMatch: ['Seguros'], label: 'SEGUROS' },
            { descMatch: ['Sistema de Gestão', 'Sistema de Gestao', 'Softwares'], label: 'SISTEMA DE GESTAO/SOFTWARES' },
            { descMatch: ['Telefone'], label: 'TELEFONE' },
            { descMatch: ['Recisões', 'Rescisões', 'Indenizações', 'Indenizacoes'], label: 'RECISOES/INDENIZACOES' },
            { descMatch: ['Saúde Trabalhista', 'Saude Trabalhista', 'Ocupacional'], label: 'SAUDE TRABALHISTA/OCUPACIONAL' },
            { descMatch: ['MEI'], label: 'MEI' },
        ],
    },
    {
        header: 'Despesas variaveis',
        items: [
            { descMatch: ['Comissões de Venda', 'Comissoes'], label: 'COMISSOES DE VENDA' },
            { descMatch: ['Combustíveis', 'Combustiveis'], label: 'COMBUSTIVEIS' },
            { descMatch: ['Correios'], label: 'CORREIOS' },
            { descMatch: ['Departamento Jurídico', 'Departamento Juridico'], label: 'DEPARTAMENTO JURIDICO' },
            { descMatch: ['Embalagens Diversas'], label: 'EMBALAGENS DIVERSAS' },
            { descMatch: ['Fretes (Valores relacionados a entrega', 'Fretes (entrega)'], label: 'FRETES (entrega)' },
            { descMatch: ['Horas Extras'], label: 'HORAS EXTRAS' },
            { descMatch: ['Manutenções', 'Manutencoes'], label: 'MANUTENCOES' },
            { descMatch: ['Marketing'], label: 'MARKETING' },
            { descMatch: ['Pedágios e Estacionamentos', 'Pedágios', 'Pedagios'], label: 'PEDAGIOS E ESTACIONAMENTOS' },
            { descMatch: ['Multas de Trânsito', 'Multas de Transito'], label: 'MULTAS DE TRANSITO' },
            { descMatch: ['Terceirizações', 'Tercerizacoes', 'Tercerizações'], label: 'TERCERIZACOES' },
            { descMatch: ['Uso e Consumo'], label: 'USO E CONSUMO' },
            { descMatch: ['Vale Alimentação Tercerizados', 'Vale Alimentação —'], label: 'VALE ALIMENTACAO' },
            { descMatch: ['Viagens'], label: 'VIAGENS' },
        ],
    },
    {
        header: 'Despesas Financeiras',
        items: [
            { descMatch: ['Juros'], label: 'JUROS' },
            { descMatch: ['Taxas Cartão', 'Taxas Cartao'], label: 'TAXAS CARTAO' },
            { descMatch: ['Taxas Bancárias', 'Taxas Bancarias'], label: 'TAXAS BANCARIAS' },
            { descMatch: ['Troca Cheque'], label: 'TROCA CHEQUE' },
        ],
    },
    {
        header: 'Impostos',
        items: [
            { descMatch: ['Imposto DARF', 'DARF'], label: 'DARF' },
            { descMatch: ['Imposto Guia Arrecadação', 'Imposto GA'], label: 'GA' },
            { descMatch: ['Imposto GARE', 'GARE'], label: 'GARE' },
            { descMatch: ['Imposto GPS'], label: 'GPS' },
            { descMatch: ['Imposto IOF'], label: 'IOF' },
            { descMatch: ['Imposto ISS', 'Imposto Outros'], label: 'OUTROS' },
        ],
    },
    {
        header: 'Regime Tributario',
        items: [
            { descMatch: ['Imposto DAS', 'Simples Nacional'], label: 'SIMPLES NACIONAL - DAS' },
        ],
    },
    {
        header: 'Lucro',
        items: [
            { descMatch: ['Investimentos'], label: 'INVESTIMENTOS' },
            { descMatch: ['Distribuição de Lucros', 'Distribuicao de Lucros'], label: 'DISTRIBUICAO DE LUCROS' },
        ],
    },
]

export function matchesDescription(desc: string, patterns: string[]): boolean {
    if (!desc) return false
    const base = desc.split(' — ')[0].trim()
    return patterns.some(p => {
        const pt = p.trim()
        // For short patterns (<=4 chars), only match start to avoid false positives
        if (pt.length <= 4) return base.startsWith(pt)
        return base.startsWith(pt) || base.includes(pt)
    })
}

export function getIncomeLabel(entry: { payment_method?: string | null; category?: string | null }): string {
    // Try payment_method first, then category (entries from caixa store category, not payment_method)
    const key = entry.payment_method || entry.category || ''
    const found = INCOME_ROWS.find(r => r.key === key)
    return found?.label ?? 'OUTRAS ENTRADAS'
}
