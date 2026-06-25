import { parsePercentInput } from '../percent-input.component'

/**
 * Cobre o núcleo "calculadora" do PercentInput (Relatório Técnico v1.0 — Item 1).
 * Base percentual 0–100+ (ex.: 9.47 = 9,470%).
 */
describe('parsePercentInput — entrada estilo calculadora (3 casas)', () => {
    it('interpreta dígitos da direita para a esquerda (Regra 1)', () => {
        // Sequência 9 → 4 → 7 → 0 do relatório → 9,470%
        expect(parsePercentInput('9')).toBeCloseTo(0.009, 6)
        expect(parsePercentInput('94')).toBeCloseTo(0.094, 6)
        expect(parsePercentInput('947')).toBeCloseTo(0.947, 6)
        expect(parsePercentInput('9470')).toBeCloseTo(9.47, 6)
    })

    it('ignora qualquer caractere não numérico (vírgula/%/espaço)', () => {
        expect(parsePercentInput('9,470%')).toBeCloseTo(9.47, 6)
        expect(parsePercentInput('R$ 4.000')).toBeCloseTo(4.0, 6)
    })

    it('campo sem dígitos resulta em 0 (nunca fica vazio — Regra 4)', () => {
        expect(parsePercentInput('')).toBe(0)
        expect(parsePercentInput('abc')).toBe(0)
    })

    it('exemplos canônicos do relatório', () => {
        expect(parsePercentInput('4000')).toBeCloseTo(4.0, 6) // 4,000%
        expect(parsePercentInput('0250')).toBeCloseTo(0.25, 6) // 0,250%
        expect(parsePercentInput('10390')).toBeCloseTo(10.39, 6) // 10,390%
    })

    it('respeita clamp de min/max', () => {
        expect(parsePercentInput('999999', { max: 100 })).toBe(100)
        expect(parsePercentInput('1', { min: 2 })).toBe(2)
    })

    it('suporta precisão configurável (4 casas) para alíquotas transmutadas', () => {
        // 4,2375% precisa de decimals=4 — com 3 casas seria impossível representar
        expect(parsePercentInput('42375', { decimals: 4 })).toBeCloseTo(4.2375, 6)
        expect(parsePercentInput('41983', { decimals: 4 })).toBeCloseTo(4.1983, 6)
    })

    it('trunca excesso de dígitos respeitando o limite (decimals + 6)', () => {
        // 3 casas → máx 9 dígitos: pega os 9 primeiros (123456789) → 123456,789
        const v = parsePercentInput('1234567890123', { decimals: 3 })
        expect(v).toBeCloseTo(123456.789, 3)
    })
})
