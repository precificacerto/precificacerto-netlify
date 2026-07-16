import { maskNaturalNumber, formatNaturalValue } from '../currency-percent-input.component'

/**
 * PC-FEAT-INPUT-MASCARA-GLOBAL-001 (Relatório 15/07/2026, Seção 9).
 * Cobre o núcleo puro da máscara natural (esquerda→direita).
 */
describe('maskNaturalNumber — digitação natural esquerda→direita', () => {
    it('9.1 — digita na ordem natural incluindo a vírgula (exemplo 48,53410)', () => {
        // Sequência de teclas do relatório: 4,8,",",5,3,4,1,0
        expect(maskNaturalNumber('4').display).toBe('4')
        expect(maskNaturalNumber('48').display).toBe('48')
        expect(maskNaturalNumber('48,').display).toBe('48,')
        expect(maskNaturalNumber('48,5').display).toBe('48,5')
        expect(maskNaturalNumber('48,53').display).toBe('48,53')
        expect(maskNaturalNumber('48,534').display).toBe('48,534')
        expect(maskNaturalNumber('48,5341').display).toBe('48,5341')
        const final = maskNaturalNumber('48,53410')
        expect(final.display).toBe('48,53410')
        expect(final.value).toBeCloseTo(48.5341, 6)
    })

    it('9.2 — separador de milhar em tempo real na parte inteira', () => {
        expect(maskNaturalNumber('1').display).toBe('1')
        expect(maskNaturalNumber('10').display).toBe('10')
        expect(maskNaturalNumber('100').display).toBe('100')
        expect(maskNaturalNumber('1000').display).toBe('1.000')
        expect(maskNaturalNumber('20000').display).toBe('20.000')
        expect(maskNaturalNumber('1000000').display).toBe('1.000.000')
    })

    it('9.2 — "vinte mil e alguns centavos"', () => {
        const r = maskNaturalNumber('20000,50')
        expect(r.display).toBe('20.000,50')
        expect(r.value).toBeCloseTo(20000.5, 6)
    })

    it('9.2 — Backspace reajusta o separador de milhar (20.000 → 2.000)', () => {
        // Backspace sobre "20.000" deixa o campo bruto como "20.00"
        expect(maskNaturalNumber('20.00').display).toBe('2.000')
    })

    it('9.3 — sem vírgula não exibe casas decimais', () => {
        const r = maskNaturalNumber('20')
        expect(r.display).toBe('20')
        expect(r.hasComma).toBe(false)
        expect(r.value).toBe(20)
    })

    it('9.3 — casas decimais livres, preserva precisão (20,43 e 20,43410)', () => {
        expect(maskNaturalNumber('20,43').value).toBeCloseTo(20.43, 6)
        expect(maskNaturalNumber('20,43410').value).toBeCloseTo(20.4341, 6)
        expect(maskNaturalNumber('20,43410').display).toBe('20,43410')
    })

    it('9.3 — limite de 5 casas decimais; 6ª em diante é ignorada', () => {
        const r = maskNaturalNumber('48,536789')
        expect(r.decDigits).toBe('53678')
        expect(r.display).toBe('48,53678')
    })

    it('9.3 — apenas uma vírgula é permitida (48,53,41 → 48,5341)', () => {
        const r = maskNaturalNumber('48,53,41')
        expect(r.display).toBe('48,5341')
        expect(r.value).toBeCloseTo(48.5341, 6)
    })

    it('9.4 — ignora letras, símbolos e ponto digitado', () => {
        expect(maskNaturalNumber('1a2b3').display).toBe('123')
        expect(maskNaturalNumber('R$ 1.234,56').display).toBe('1.234,56')
        expect(maskNaturalNumber('12.34').display).toBe('1.234')
    })

    it('trata vírgula inicial como 0, (,5 → 0,5)', () => {
        const r = maskNaturalNumber(',5')
        expect(r.display).toBe('0,5')
        expect(r.value).toBeCloseTo(0.5, 6)
    })

    it('campo vazio retorna valor 0 e display vazio', () => {
        const r = maskNaturalNumber('')
        expect(r.display).toBe('')
        expect(r.value).toBe(0)
    })

    it('remove zeros à esquerda da parte inteira', () => {
        expect(maskNaturalNumber('007').display).toBe('7')
        expect(maskNaturalNumber('0,5').display).toBe('0,5')
    })

    it('respeita maxDecimals customizado (2 casas)', () => {
        const r = maskNaturalNumber('12,3456', { maxDecimals: 2 })
        expect(r.display).toBe('12,34')
        expect(r.value).toBeCloseTo(12.34, 6)
    })
})

describe('formatNaturalValue — exibição canônica (blur / valor externo)', () => {
    it('agrupa milhares e não preenche zeros à direita', () => {
        expect(formatNaturalValue(1000)).toBe('1.000')
        expect(formatNaturalValue(20000.5)).toBe('20.000,5')
        expect(formatNaturalValue(1234.56)).toBe('1.234,56')
        expect(formatNaturalValue(48.5341)).toBe('48,5341')
    })

    it('valores nulos/indefinidos viram string vazia', () => {
        expect(formatNaturalValue(null)).toBe('')
        expect(formatNaturalValue(undefined)).toBe('')
    })

    it('inteiro sem decimais não mostra vírgula', () => {
        expect(formatNaturalValue(20)).toBe('20')
        expect(formatNaturalValue(0)).toBe('0')
    })

    it('preserva sinal negativo', () => {
        expect(formatNaturalValue(-1500.25)).toBe('-1.500,25')
    })
})
