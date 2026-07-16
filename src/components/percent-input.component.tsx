import React from 'react'
import { CurrencyPercentInput } from './currency-percent-input.component'

/**
 * Input de ALÍQUOTA/percentual.
 *
 * PC-FEAT-INPUT-MASCARA-GLOBAL-001 (Relatório 15/07/2026, Seção 9): agora é um
 * wrapper fino do componente único `CurrencyPercentInput` em modo percentual —
 * digitação NATURAL da esquerda para a direita, casas decimais livres (sem padding),
 * vírgula manual, até `decimals` casas. SUBSTITUI o antigo padrão "estilo calculadora"
 * (direita→esquerda), conforme a spec. A API pública permanece compatível, então todos
 * os call-sites herdam o novo comportamento sem alteração.
 *
 * Escala: base percentual 0–100+ (ex.: 9.47 representa 9,47%).
 */

export interface PercentInputProps {
    value?: number | null
    onChange?: (value: number) => void
    min?: number
    max?: number
    disabled?: boolean
    placeholder?: string
    style?: React.CSSProperties
    className?: string
    size?: 'large' | 'middle' | 'small'
    addonBefore?: React.ReactNode
    addonAfter?: React.ReactNode
    autoFocus?: boolean
    id?: string
    /** Exibe "%" como sufixo. Default: true. */
    showPercent?: boolean
    /** Máximo de casas decimais. Default: 3 (alíquotas). Use 4+ para maior precisão. */
    decimals?: number
}

export function PercentInput({ showPercent = true, decimals = 3, ...props }: PercentInputProps) {
    return (
        <CurrencyPercentInput
            mode="percent"
            decimals={decimals}
            minDecimals={0}
            showSymbol={showPercent}
            {...props}
        />
    )
}

/**
 * @deprecated Núcleo "calculadora" (direita→esquerda) da versão anterior do PercentInput.
 * Mantido apenas para compatibilidade de imports/testes legados — o componente agora usa
 * a máscara natural de `CurrencyPercentInput`. Para novo código, use `maskNaturalNumber`.
 *
 * Extrai apenas os dígitos do texto e reinterpreta como inteiro ÷ 10^decimals (base percentual).
 */
export function parsePercentInput(
    raw: string,
    opts: { decimals?: number; min?: number; max?: number } = {},
): number {
    const decimals = opts.decimals ?? 3
    const factor = 10 ** decimals
    const maxDigits = decimals + 6
    const digits = String(raw ?? '').replace(/\D/g, '').slice(0, maxDigits)
    if (!digits) return 0
    let v = parseInt(digits, 10) / factor
    if (opts.min !== undefined && v < opts.min) v = opts.min
    if (opts.max !== undefined && v > opts.max) v = opts.max
    return v
}

export default PercentInput
