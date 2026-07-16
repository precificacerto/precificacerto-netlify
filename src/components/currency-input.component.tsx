import React from 'react'
import { CurrencyPercentInput } from './currency-percent-input.component'

interface CurrencyInputProps {
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
    prefix?: React.ReactNode
    suffix?: React.ReactNode
    autoFocus?: boolean
    showR$?: boolean
}

/**
 * Input de valor monetário BRL.
 *
 * PC-FEAT-INPUT-MASCARA-GLOBAL-001 (Relatório 15/07/2026, Seção 9): agora é um
 * wrapper fino do componente único `CurrencyPercentInput` — digitação NATURAL da
 * esquerda para a direita (substitui o antigo padrão "calculadora"), com separador
 * de milhar em tempo real. Mantém 2 casas decimais na exibição (minDecimals=2) para
 * preservar a convenção monetária ("R$ 12,50"). A API pública é 100% compatível com
 * a versão anterior, então todos os call-sites herdam o novo padrão sem alteração.
 */
export function CurrencyInput({ showR$ = true, ...props }: CurrencyInputProps) {
    return (
        <CurrencyPercentInput
            mode="currency"
            decimals={2}
            minDecimals={2}
            showSymbol={showR$}
            {...props}
        />
    )
}

export default CurrencyInput
