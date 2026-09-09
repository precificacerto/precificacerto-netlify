/**
 * expense-groups.ts — a FONTE ÚNICA dos grupos de despesa.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ----------------------------
 * A mesma lista estava escrita em CINCO lugares, e **nenhum batia com os outros**. Medido em
 * 09/09/2026:
 *
 *   lista                    DEDUCAO_RECEITA   OUTROS
 *   ExpenseGroupKey (tipo)         não           não
 *   EXPENSE_GROUP_OPTIONS          não           não
 *   EXPENSE_TYPE_LABELS            não           não
 *   HUB_GROUPS                     SIM           SIM
 *   o switch do DFC                SIM           não
 *
 * É `.claude/rules/copia-divergente.md` com cinco cópias. Acrescentar um grupo exigia tocar as
 * cinco, e esquecer qualquer uma **falha em silêncio** — o valor some da tela, do rótulo ou da
 * demonstração, conforme a esquecida. Com uma fonte só, acrescentar vale para todas.
 *
 * O CAST QUE CALAVA O COMPILADOR
 * -------------------------------
 * `INSS_RETIDO_FONTE` e `ISS_RETIDO_TOMADOR` usavam `group: 'DEDUCAO_RECEITA' as ExpenseGroupKey`
 * — um cast sobre um valor que **não pertencia à união**. O cast calava o compilador
 * EXATAMENTE ONDE ELE AVISARIA. É o oposto do que o #47 fez: lá, tornar o campo obrigatório fez
 * o `tsc` apontar os três chamadores de uma vez.
 *
 * > Cast em ponto de extensão e default neutro em contrato de cálculo são o MESMO DEFEITO:
 * > os dois transformam erro em silêncio.
 *
 * Agora `DEDUCAO_RECEITA` está na união e os casts saíram.
 *
 * A ARMADILHA QUE ESTE MÓDULO **NÃO** FECHA SOZINHO
 * --------------------------------------------------
 * O `switch` do DFC termina em `default: break` — *"grupos desconhecidos são silenciosamente
 * ignorados"*. **Grupo novo sem tocar o switch faz o valor DESAPARECER da Análise Financeira,
 * sem erro nenhum.** Por isso `DFC_GROUPS_QUE_SOMAM` abaixo existe e é afirmado em teste: o
 * caso quebra se um grupo novo cair no `default`, e não se contenta com "a linha aparece".
 */

/**
 * Todos os grupos, na ordem em que o Hub e o Fluxo de Caixa os exibem.
 *
 * `as const` é o que torna esta lista a fonte: o tipo `ExpenseGroupKey` é DERIVADO dela, então
 * acrescentar uma chave aqui a torna válida em todo lugar, e usá-la sem tratar quebra o build
 * onde o tratamento é exaustivo.
 */
export const EXPENSE_GROUP_KEYS = [
    'CUSTO_PRODUTOS',
    'MAO_DE_OBRA_PRODUTIVA',
    'MAO_DE_OBRA_ADMINISTRATIVA',
    'MAO_DE_OBRA',
    'DESPESA_FIXA',
    'DESPESA_VARIAVEL',
    'ATIVIDADES_TERCEIRIZADAS',
    'DESPESA_FINANCEIRA',
    'COMISSOES',
    'RESERVA_TECNICA',
    'LUCRO',
    'AMORTIZACAO',
    'IMPOSTO_LUCRO',
    'IMPOSTO_FATURAMENTO_DENTRO',
    'IMPOSTO',
    'REGIME_TRIBUTARIO',
    'DEDUCAO_RECEITA',
    'OUTROS',
] as const

export type ExpenseGroupKey = (typeof EXPENSE_GROUP_KEYS)[number]

/** Os cinco grupos "padrão", os únicos com cor própria na tela de despesas. */
export type StandardExpenseGroupKey =
    | 'MAO_DE_OBRA'
    | 'DESPESA_FIXA'
    | 'DESPESA_FINANCEIRA'
    | 'DESPESA_VARIAVEL'
    | 'IMPOSTO'

export interface ExpenseGroupMeta {
    /** Rótulo curto — o do seletor de grupo. */
    label: string
    /** Rótulo do Hub, quando difere do curto. */
    labelHub?: string
    /** Rótulo detalhado, quando o curto é ambíguo fora de contexto. */
    labelDetalhado?: string
    /** Cor — só os cinco padrão têm. */
    color?: string
    /** `true` nos cinco padrão. */
    standard?: boolean
    /** `false` esconde do seletor: grupo derivado ou técnico, não escolhido à mão. */
    noSeletor?: boolean
}

export const EXPENSE_GROUP_META: Record<ExpenseGroupKey, ExpenseGroupMeta> = {
    CUSTO_PRODUTOS: { label: 'Custo dos Produtos' },
    MAO_DE_OBRA_PRODUTIVA: { label: 'Mão de Obra Produtiva', labelHub: 'MO Produtiva' },
    MAO_DE_OBRA_ADMINISTRATIVA: {
        label: 'Mão de Obra Administrativa',
        labelHub: 'MO Administrativa (Indireta)',
    },
    MAO_DE_OBRA: {
        label: 'Mão de Obra',
        labelDetalhado: 'Mão de Obra (Geral)',
        labelHub: 'MO (Legado)',
        color: '#7C3AED',
        standard: true,
    },
    DESPESA_FIXA: { label: 'Despesa Fixa', labelHub: 'Despesas Fixas', color: '#2563EB', standard: true },
    DESPESA_VARIAVEL: {
        label: 'Despesa Variável',
        labelHub: 'Despesas Variáveis',
        color: '#059669',
        standard: true,
    },
    ATIVIDADES_TERCEIRIZADAS: {
        label: 'Atividades Terceirizadas Operacionais',
        labelHub: 'Atividades Terceirizadas',
    },
    DESPESA_FINANCEIRA: {
        label: 'Despesa Financeira',
        labelHub: 'Despesas Financeiras',
        color: '#D97706',
        standard: true,
    },
    COMISSOES: { label: 'Comissões' },
    RESERVA_TECNICA: { label: 'RT — Comissão Reserva Técnica' },
    LUCRO: { label: 'Lucro', labelHub: 'Lucro / Investimentos' },
    // AMORTIZAÇÃO — saída de caixa que NÃO é despesa operacional: pagamento de PRINCIPAL de
    // dívida. Entra DEPOIS do resultado operacional, e por isso NÃO pode ser subitem de Lucro:
    // o grupo `LUCRO` é descartado da demonstração (ver `DFC_GROUPS_QUE_SOMAM`).
    AMORTIZACAO: { label: 'Amortização de Dívida' },
    IMPOSTO_LUCRO: { label: 'Impostos sobre o Lucro' },
    IMPOSTO_FATURAMENTO_DENTRO: { label: 'Impostos sobre o Faturamento (Por dentro)' },
    IMPOSTO: {
        label: 'Imposto',
        labelHub: 'Impostos sobre o Faturamento (Por fora)',
        color: '#DC2626',
        standard: true,
    },
    REGIME_TRIBUTARIO: { label: 'Regime Tributário', labelHub: 'Tributos do Regime' },
    // DEDUÇÃO DA RECEITA — devoluções, estornos, abatimentos e retenções na fonte. Deduzem da
    // Receita Bruta para formar a Receita Líquida; NÃO são despesa operacional.
    DEDUCAO_RECEITA: { label: 'Deduções da Receita', noSeletor: true },
    OUTROS: { label: 'Outros', noSeletor: true },
}

/** Os cinco grupos com cor, na forma que a tela de despesas espera. */
export const EXPENSE_GROUPS: Record<
    StandardExpenseGroupKey,
    { key: StandardExpenseGroupKey; label: string; color: string }
> = Object.fromEntries(
    EXPENSE_GROUP_KEYS.filter((k) => EXPENSE_GROUP_META[k].standard).map((k) => [
        k,
        { key: k, label: EXPENSE_GROUP_META[k].label, color: EXPENSE_GROUP_META[k].color as string },
    ]),
) as Record<StandardExpenseGroupKey, { key: StandardExpenseGroupKey; label: string; color: string }>

/** O seletor de grupo. Deriva da fonte — acrescentar uma chave lá aparece aqui sozinho. */
export const EXPENSE_GROUP_OPTIONS: { value: string; label: string }[] = EXPENSE_GROUP_KEYS
    .filter((k) => !EXPENSE_GROUP_META[k].noSeletor)
    .map((k) => ({ value: k, label: EXPENSE_GROUP_META[k].label }))

/** Rótulos detalhados, para exibir um grupo fora do contexto da tela dele. */
export const EXPENSE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
    EXPENSE_GROUP_KEYS.map((k) => [k, EXPENSE_GROUP_META[k].labelDetalhado ?? EXPENSE_GROUP_META[k].label]),
)

/** Ordem e rótulos do Hub e do Fluxo de Caixa. */
export const HUB_GROUPS: { group: string; label: string }[] = EXPENSE_GROUP_KEYS.map((k) => ({
    group: k,
    label: EXPENSE_GROUP_META[k].labelHub ?? EXPENSE_GROUP_META[k].label,
}))

/**
 * Grupos que a Análise Financeira SOMA em alguma linha — o antídoto do `default` silencioso.
 *
 * Não é documentação: é o que o teste afirma. Um grupo acrescentado a `EXPENSE_GROUP_KEYS` e
 * esquecido no `switch` do DFC deixa este conjunto incompleto, e o caso fica VERMELHO em vez de
 * o valor sumir da demonstração sem aviso.
 *
 * `LUCRO` está de fora DE PROPÓSITO e é uma decisão de negócio, não esquecimento: distribuição
 * de lucros e investimentos não compõem a demonstração. Registrado e NÃO corrigido nesta
 * rodada: hoje isso descarta 15 lançamentos, R$ 125.318,22 confirmados (R$ 124.754,26 deles de
 * "INVESTIMENTOS"), e pode ser intencional ou defeito — é levantamento próprio.
 * `OUTROS` fica de fora pelo mesmo motivo do `default`: é o balde do desconhecido.
 */
export const DFC_GROUPS_QUE_SOMAM: readonly ExpenseGroupKey[] = EXPENSE_GROUP_KEYS.filter(
    (k) => k !== 'LUCRO' && k !== 'OUTROS',
)
