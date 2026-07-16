import React, { useEffect, useRef, useState } from 'react'
import { Input } from 'antd'
import type { InputRef } from 'antd'

/**
 * PC-FEAT-INPUT-MASCARA-GLOBAL-001 (Relatório 15/07/2026, Seção 9).
 *
 * Padrão ÚNICO e global de digitação para campos monetários (R$) e percentuais (%).
 * SUBSTITUI e invalida o padrão anterior "estilo calculadora" (direita→esquerda,
 * posição decimal fixa) dos componentes PercentInput/CurrencyInput.
 *
 * Regras (todas implementadas no núcleo puro `maskNaturalNumber`):
 *  - 9.1 Digitação da ESQUERDA para a DIREITA, natural, como um campo de texto comum.
 *        O usuário digita os caracteres na ordem em que aparecem no valor final,
 *        incluindo a vírgula decimal quando necessário.
 *  - 9.2 Separador de milhar (ponto) aplicado automaticamente em tempo real sobre a
 *        parte inteira, inclusive ao usar Backspace (reajuste dinâmico).
 *  - 9.3 Vírgula digitada manualmente abre a parte decimal; sem vírgula, sem decimais.
 *        Casas decimais livres (não completa com zeros, não trava em 2). Limite: 5 casas
 *        (a 6ª em diante é ignorada). Apenas UMA vírgula por campo.
 *  - 9.4 Aceita apenas dígitos (0–9) e uma única vírgula; demais caracteres são ignorados.
 *  - 9.5 JavaScript puro (sem libs de máscara). O valor numérico real é mantido em estado
 *        separado do valor formatado exibido, garantindo precisão total nos cálculos.
 *
 * Escala do percentual: base 0–100+ (ex.: 9.47 representa 9,47%), igual aos demais inputs
 * de alíquota do sistema (que dividem por 100 apenas na hora de gravar).
 */

const DEFAULT_MAX_DECIMALS = 5

/** Agrupa a parte inteira em milhares com ponto (padrão pt-BR): "1000000" → "1.000.000". */
function groupThousands(intDigits: string): string {
    return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export interface MaskNaturalResult {
    /** Valor numérico real (sem máscara), com precisão total. */
    value: number
    /** Texto formatado para exibição durante a digitação. */
    display: string
    /** Se há vírgula decimal digitada. */
    hasComma: boolean
    intDigits: string
    decDigits: string
}

/**
 * Núcleo puro e testável da máscara natural (esquerda→direita).
 * Recebe o conteúdo cru do campo e devolve valor numérico + display formatado.
 * Não aplica clamp de min/max (isso é responsabilidade do componente, no blur).
 */
export function maskNaturalNumber(
    raw: string,
    opts: { maxDecimals?: number } = {},
): MaskNaturalResult {
    const maxDecimals = opts.maxDecimals ?? DEFAULT_MAX_DECIMALS
    // 9.4 — mantém apenas dígitos e vírgulas; demais caracteres são descartados.
    const s = String(raw ?? '').replace(/[^\d,]/g, '')
    const firstComma = s.indexOf(',')
    const hasComma = firstComma !== -1

    let intPart: string
    let decPart: string
    if (hasComma) {
        intPart = s.slice(0, firstComma).replace(/,/g, '')
        // 9.3 — segunda vírgula em diante é ignorada (dígitos posteriores viram decimais).
        decPart = s.slice(firstComma + 1).replace(/,/g, '')
    } else {
        intPart = s.replace(/,/g, '')
        decPart = ''
    }

    // Remove zeros à esquerda da parte inteira, preservando ao menos um dígito quando há vírgula.
    intPart = intPart.replace(/^0+(?=\d)/, '')
    if (intPart === '' && hasComma) intPart = '0'

    // 9.3 — limite de casas decimais; a 6ª em diante é ignorada.
    decPart = decPart.slice(0, maxDecimals)

    let value: number
    if (hasComma) {
        value = Number(`${intPart || '0'}.${decPart || '0'}`)
    } else {
        value = intPart === '' ? 0 : Number(intPart)
    }
    if (!Number.isFinite(value)) value = 0

    const intFmt = intPart === '' ? '' : groupThousands(intPart)
    let display: string
    if (hasComma) {
        display = `${intFmt === '' ? '0' : intFmt},${decPart}`
    } else {
        display = intFmt
    }

    return { value, display, hasComma, intDigits: intPart, decDigits: decPart }
}

/**
 * Formata um número para exibição canônica (usada no blur e ao refletir valor externo).
 * Não preenche com zeros à direita (casas decimais livres, Regra 9.3).
 */
export function formatNaturalValue(v: number | null | undefined, maxDecimals = DEFAULT_MAX_DECIMALS): string {
    if (v == null || !Number.isFinite(Number(v))) return ''
    const num = Number(v)
    const neg = num < 0
    const abs = Math.abs(num)
    const fixed = abs.toFixed(maxDecimals)
    // eslint-disable-next-line prefer-const
    let [intRaw, decRaw] = fixed.split('.')
    const dec = (decRaw || '').replace(/0+$/, '')
    const intFmt = groupThousands(intRaw)
    const body = dec ? `${intFmt},${dec}` : intFmt
    return (neg ? '-' : '') + body
}

export interface CurrencyPercentInputProps {
    value?: number | null
    onChange?: (value: number) => void
    /** 'currency' exibe R$ (addonBefore); 'percent' exibe % (addonAfter). Default: 'currency'. */
    mode?: 'currency' | 'percent'
    min?: number
    max?: number
    /** Máximo de casas decimais (Regra 9.3). Default: 5. */
    decimals?: number
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
    id?: string
    /** Exibe o símbolo padrão do modo (R$ ou %). Default: true. */
    showSymbol?: boolean
    /** Quando true, exibe campo vazio se o valor for 0/null (útil p/ campos opcionais). Default: false. */
    emptyWhenZero?: boolean
}

export function CurrencyPercentInput({
    value,
    onChange,
    mode = 'currency',
    min,
    max,
    decimals = DEFAULT_MAX_DECIMALS,
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
    id,
    showSymbol = true,
    emptyWhenZero = false,
}: CurrencyPercentInputProps) {
    const renderExternal = (v: number | null | undefined): string => {
        if (emptyWhenZero && (v == null || Number(v) === 0)) return ''
        if (v == null) return ''
        return formatNaturalValue(v, decimals)
    }

    const [display, setDisplay] = useState<string>(() => renderExternal(value))
    const [focused, setFocused] = useState(false)
    const inputRef = useRef<InputRef>(null)

    useEffect(() => {
        if (!focused) setDisplay(renderExternal(value))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, focused, decimals, emptyWhenZero])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value: parsed, display: masked } = maskNaturalNumber(e.target.value, { maxDecimals: decimals })
        setDisplay(masked)
        // Durante a digitação, reporta o valor real (sem clamp) para não travar a entrada.
        onChange?.(parsed)
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setFocused(true)
        // Facilita substituir o valor: seleciona tudo (primeiro dígito digitado o substitui);
        // sair sem digitar preserva o valor. Campo zerado começa vazio.
        const current = Number(value) || 0
        if (current === 0) {
            setDisplay('')
        } else {
            requestAnimationFrame(() => e.target.select())
        }
    }

    const handleBlur = () => {
        setFocused(false)
        // Normaliza (clamp min/max) e reformata de forma canônica.
        let v = maskNaturalNumber(display, { maxDecimals: decimals }).value
        if (min !== undefined && v < min) v = min
        if (max !== undefined && v > max) v = max
        if (v !== (Number(value) || 0)) onChange?.(v)
        setDisplay(renderExternal(v))
    }

    const resolvedAddonBefore = addonBefore ?? (mode === 'currency' && showSymbol ? 'R$' : undefined)
    const resolvedAddonAfter = addonAfter ?? (mode === 'percent' && showSymbol ? '%' : undefined)

    return (
        <Input
            ref={inputRef}
            id={id}
            value={display}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={placeholder ?? (mode === 'percent' ? '0' : '0,00')}
            style={style}
            className={className}
            size={size}
            addonBefore={resolvedAddonBefore}
            addonAfter={resolvedAddonAfter}
            prefix={prefix}
            suffix={suffix}
            autoFocus={autoFocus}
            inputMode="decimal"
            data-input-type={mode === 'percent' ? 'percent-natural' : 'currency-natural'}
        />
    )
}

export default CurrencyPercentInput
