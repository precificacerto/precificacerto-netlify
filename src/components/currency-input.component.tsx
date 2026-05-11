import React, { useEffect, useRef, useState } from 'react'
import { Input } from 'antd'
import type { InputRef } from 'antd'

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

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Input de valor monetário BRL (padrão "caixa registradora"):
 * - Exibe "0,00" quando vazio/zero
 * - Ao focar, o "0,00" é apagado para facilitar digitação
 * - Usuário digita apenas dígitos (ex: 1245352 → 12.453,52)
 * - Aceita ponto/vírgula no meio — sistema ignora e reformata
 * - Sempre 2 casas decimais, separador BRL (1.234,56)
 * - onChange retorna número puro (12453.52)
 */
export function CurrencyInput({
    value,
    onChange,
    min,
    max,
    disabled,
    placeholder,
    style,
    className,
    size,
    addonBefore,
    addonAfter,
    prefix,
    suffix,
    autoFocus,
    showR$ = true,
}: CurrencyInputProps) {
    const numeric = Number(value) || 0
    const [display, setDisplay] = useState<string>(formatBRL(numeric))
    const [focused, setFocused] = useState(false)
    const inputRef = useRef<InputRef>(null)

    useEffect(() => {
        if (!focused) setDisplay(formatBRL(Number(value) || 0))
    }, [value, focused])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value
        const digits = raw.replace(/\D/g, '')

        if (!digits) {
            setDisplay('')
            onChange?.(0)
            return
        }

        let numericValue = Number(digits) / 100
        if (min !== undefined && numericValue < min) numericValue = min
        if (max !== undefined && numericValue > max) numericValue = max

        setDisplay(formatBRL(numericValue))
        onChange?.(numericValue)
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setFocused(true)
        const current = Number(value) || 0
        if (current === 0) {
            setDisplay('')
        } else {
            requestAnimationFrame(() => e.target.select())
        }
    }

    const handleBlur = () => {
        setFocused(false)
        setDisplay(formatBRL(Number(value) || 0))
    }

    const resolvedAddonBefore = addonBefore ?? (showR$ ? 'R$' : undefined)

    return (
        <Input
            ref={inputRef}
            value={display}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={placeholder ?? '0,00'}
            style={style}
            className={className}
            size={size}
            addonBefore={resolvedAddonBefore}
            addonAfter={addonAfter}
            prefix={prefix}
            suffix={suffix}
            autoFocus={autoFocus}
            inputMode="decimal"
        />
    )
}

export default CurrencyInput
