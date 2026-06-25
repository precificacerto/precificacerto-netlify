import React, { useEffect, useRef, useState } from 'react'
import { Input } from 'antd'
import type { InputRef } from 'antd'

/**
 * Input de ALÍQUOTA estilo calculadora / PDV (Relatório Técnico v1.0 — Item 1).
 *
 * Regras (todas implementadas aqui):
 *  - Regra 1: dígitos entram pela direita, empurrando os anteriores para a esquerda.
 *    A vírgula decimal permanece fixa na posição das casas decimais configuradas.
 *  - Regra 2: padrão universal de 3 casas decimais (entrada e exibição). Parametrizável
 *    via `decimals` para alíquotas que exijam mais precisão (ex.: PIS/COFINS transmutado
 *    com 4 casas — não migrar esses campos sem `decimals={4}`).
 *  - Regra 3: ao focar, o campo fica pronto para receber dígitos — o valor atual é
 *    selecionado, de modo que o primeiro dígito digitado o substitui (equivalente a
 *    "zerar"), mas SAIR sem digitar preserva o valor original (sem perda acidental).
 *  - Regra 4: Backspace remove o último dígito (empurrando os demais de volta).
 *    O valor mínimo é sempre 0 (exibido como 0,000%).
 *  - Regra 5: valores já cadastrados NÃO são truncados/arredondados no banco — a
 *    padronização de casas é apenas visual (ex.: 4,23 → "4,230%"). O número repassado ao
 *    backend via onChange é o número puro (ex.: 9,470% → 9.47).
 *
 * Implementação dirigida por `onChange` (e não por `keydown`) para funcionar com teclados
 * virtuais (Android/iOS), IME e colar — mesma mecânica comprovada do CurrencyInput.
 *
 * Escala: base percentual 0–100+ (ex.: 9.47 representa 9,470%), igual aos demais inputs de
 * alíquota do sistema (que dividem por 100 só na hora de gravar).
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
    /** Exibe "%" como sufixo (addonAfter). Default: true. */
    showPercent?: boolean
    /** Casas decimais fixas (entrada e exibição). Default: 3. */
    decimals?: number
}

function formatPct(value: number, decimals: number): string {
    return (Number(value) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })
}

/**
 * Núcleo "calculadora" testável: recebe o conteúdo cru do campo e devolve o valor numérico
 * em base percentual (0–100+). Extrai só os dígitos e reinterpreta como inteiro ÷ 10^decimals.
 * Retorna 0 quando não há dígitos (campo nunca fica "vazio" no domínio).
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

export function PercentInput({
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
    autoFocus,
    id,
    showPercent = true,
    decimals = 3,
}: PercentInputProps) {
    const numeric = Number(value) || 0
    const [display, setDisplay] = useState<string>(formatPct(numeric, decimals))
    const [focused, setFocused] = useState(false)
    const inputRef = useRef<InputRef>(null)

    useEffect(() => {
        if (!focused) setDisplay(formatPct(Number(value) || 0, decimals))
    }, [value, focused, decimals])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Calculadora: extrai apenas os dígitos do campo inteiro e reinterpreta como
        // inteiro ÷ 10^decimals. Cada dígito novo "empurra" a vírgula (Regra 1/4).
        const hasDigits = /\d/.test(e.target.value)
        const v = parsePercentInput(e.target.value, { decimals, min, max })
        setDisplay(hasDigits ? formatPct(v, decimals) : '')
        onChange?.(v)
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        // Regra 3: seleciona tudo → o primeiro dígito substitui o valor (estado "pronto"),
        // mas sair sem digitar preserva o valor original (sem perda acidental — Regra 5).
        setFocused(true)
        requestAnimationFrame(() => e.target.select())
    }

    const handleBlur = () => {
        setFocused(false)
        setDisplay(formatPct(Number(value) || 0, decimals))
    }

    return (
        <Input
            ref={inputRef}
            id={id}
            value={display}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={placeholder ?? formatPct(0, decimals)}
            style={style}
            className={className}
            size={size}
            addonBefore={addonBefore}
            addonAfter={addonAfter ?? (showPercent ? '%' : undefined)}
            autoFocus={autoFocus}
            inputMode="decimal"
            data-input-type="aliquota"
        />
    )
}

export default PercentInput
