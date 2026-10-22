/**
 * @jest-environment node
 *
 * PORTÃO — a forma normalizada do telefone brasileiro (`src/lib/atendimentos-ia/telefone-normalizado.ts`),
 * a ÚNICA usada nos dois lados da comparação: o número que o webhook entrega e o do cadastro.
 *
 * MEDIDO EM PRODUÇÃO (22/10/2026), nas duas pontas da mesma mensagem:
 *   - o cadastro (`orcamentista_remetente_autorizado.telefone`): 11 dígitos — DDD + 9 + 8;
 *   - o webhook (`Info.SenderAlt`): 12 dígitos — 55 + DDD + 8. O WhatsApp entrega o celular
 *     brasileiro SEM o nono dígito; é o padrão dele, não exceção.
 * Os valores dos casos são os medidos.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { telefoneNormalizado } = require('@/lib/atendimentos-ia/telefone-normalizado') as {
    telefoneNormalizado: (bruto: unknown) => string | null
}

describe('(1) as formas medidas convergem para a MESMA forma', () => {
    it.each([
        ['o cadastro, 11 dígitos', '51999114290'],
        ['o webhook, 12 dígitos — 55 + DDD + 8, SEM o nono', '555199114290'],
        ['com DDI e com o nono, 13 dígitos', '5551999114290'],
        ['sem DDI e SEM o nono, 10 dígitos', '5199114290'],
        ['com máscara', '(51) 99911-4290'],
        ['com +55 e espaços', '+55 51 99911-4290'],
    ])('%s → "51999114290"', (_n, bruto) => {
        expect(telefoneNormalizado(bruto)).toBe('51999114290')
    })
})

describe('(2) o nono dígito: inserido no celular de 8, NUNCA no fixo', () => {
    it.each([['6'], ['7'], ['8'], ['9']])('celular de 8 dígitos começando com %s: ganha o 9', (inicio) => {
        expect(telefoneNormalizado(`5551${inicio}1234567`)).toBe(`519${inicio}1234567`)
    })

    it.each([['2'], ['3'], ['4'], ['5']])('fixo de 8 dígitos começando com %s: fica como está, sem o 9', (inicio) => {
        expect(telefoneNormalizado(`5551${inicio}3334444`)).toBe(`51${inicio}3334444`)
    })

    it('o fixo medido: "555133334444" e "5133334444" → "5133334444" — 10 dígitos, sem 9 inventado', () => {
        expect(telefoneNormalizado('555133334444')).toBe('5133334444')
        expect(telefoneNormalizado('5133334444')).toBe('5133334444')
    })

    it('assinante de 9 dígitos fica como está', () => {
        expect(telefoneNormalizado('51999114290')).toBe('51999114290')
    })
})

describe('(3) o que não é brasileiro, ou não casa com as formas: null', () => {
    it.each([
        ['argentino, +54 9 11 5555-4444', '5491155554444'],
        ['português, +351 912 345 678', '351912345678'],
        ['8 dígitos começando com 0', '5101234567'],
        ['8 dígitos começando com 1', '5111234567'],
        ['curto demais (9 dígitos)', '519911429'],
        ['longo demais (14 dígitos)', '55519991142900'],
        ['12 dígitos que NÃO começam com 55', '445199114290'],
        ['13 dígitos que NÃO começam com 55', '4451999114290'],
        ['o jid inteiro (":33" vira dígito a mais) — quem chama passa por telefoneDoRemetente antes', '555199114290:33@s.whatsapp.net'],
        ['vazio', ''],
        ['só letras', 'telefone'],
        ['null', null],
        ['undefined', undefined],
        ['número (não texto)', 51999114290],
    ])('%s → null', (_n, bruto) => {
        expect(telefoneNormalizado(bruto)).toBeNull()
    })
})

describe('(4) a função é pura e determinística', () => {
    it('a mesma entrada dá a mesma saída, e a saída normalizada é ponto fixo', () => {
        const uma = telefoneNormalizado('555199114290')
        expect(telefoneNormalizado('555199114290')).toBe(uma)
        expect(telefoneNormalizado(uma)).toBe(uma)
        expect(telefoneNormalizado('5133334444')).toBe(telefoneNormalizado(telefoneNormalizado('5133334444')))
    })
})
