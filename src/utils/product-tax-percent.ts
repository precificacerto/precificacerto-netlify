/**
 * product-tax-percent.ts — alíquota de imposto que entra na formação do preço de
 * PRODUTO (tela de cadastro).
 *
 * NÃO é a cascata / motor RRO. Só decide qual percentual de imposto compõe a margem
 * de contribuição do produto.
 *
 * Regra do dono do produto:
 *  - MEI: o DAS é fixo mensal e NÃO incide por item. Imposto é zero, sempre — vale
 *    para produto igual vale para serviço (mesma regra do #17).
 *  - Simples Nacional: a alíquota vem da configuração do onboarding (anexo +
 *    faturamento 12m) e permanece editável manualmente por produto.
 *  - Demais regimes: inalterado — Lucro Real / Presumido têm composição própria
 *    (IRPJ/CSLL sobre o lucro) e não passam por aqui.
 *
 * Este é o ÚNICO ponto de decisão: a tela de Produtos exibe e calcula a partir da
 * mesma expressão, e é isso que faz a soma das linhas exibidas fechar com o preço.
 * Ao mudar aqui, exibição e cálculo mudam juntos — por construção, não por
 * coincidência.
 */

export interface ProductTaxPercentInput {
    /** Regime MEI (fonte: `calcBase.isMei`, derivado de `taxPreview.isMei`). */
    isMei: boolean
    /**
     * Override manual gravado no produto (`products.custom_tax_percent`).
     * `null`/`undefined` = sem override. ZERO É UM VALOR VÁLIDO: quem digita 0%
     * quer 0%, e não deve receber a alíquota automática de volta.
     */
    customTaxPercent?: number | null
    /** Alíquota automática do regime (`calcBase.taxPct`, do onboarding). */
    autoTaxPercent?: number | null
}

function toFiniteNumber(value: unknown): number {
    if (value == null) return 0
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

/**
 * Percentual de imposto (base 100) que entra no denominador da margem de contribuição
 * e que a tela exibe na linha "Impostos".
 *
 * Em MEI devolve 0 mesmo que exista `custom_tax_percent` gravado — dado legado que não
 * deveria ter sido aceito. A próxima gravação legítima do produto normaliza o valor,
 * sem exigir UPDATE no banco.
 */
export function resolveProductTaxPercent(input: ProductTaxPercentInput): number {
    if (input.isMei) return 0
    // `!= null` e não `||`: zero digitado é zero, não "campo vazio".
    if (input.customTaxPercent != null) return toFiniteNumber(input.customTaxPercent)
    return toFiniteNumber(input.autoTaxPercent)
}

/**
 * Valor a PERSISTIR em `products.custom_tax_percent`.
 *
 * MEI grava sempre 0: mantém a linha presente e zerada na cascata (que lê esta coluna
 * para montar as Etapas 7 e 13) e cura o dado legado pelo uso normal.
 */
export function resolveProductTaxPercentToPersist(input: {
    isMei: boolean
    isSimples: boolean
    customTaxPercent?: number | null
    autoTaxPercent?: number | null
}): number | null {
    if (input.isMei) return 0
    if (input.customTaxPercent != null) return toFiniteNumber(input.customTaxPercent)
    // Simples sem override: grava a automática do Anexo, senão a cascata mostra DAS zerado.
    if (input.isSimples) return toFiniteNumber(input.autoTaxPercent)
    return null
}
