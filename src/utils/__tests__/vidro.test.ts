/**
 * PORTÃO — o VIDRO (`src/lib/atendimentos-ia/vidro.ts`): a forma canônica que COMPARA (espessura + têmpera + cor, numa ordem só) e o
 * "dito na mensagem" que barra o vidro completado pelo modelo. Dono do produto, 04/11/2026: "VIDRO COPIADO, NUNCA COMPLETADO" e "a regra
 * nunca inventa o que não foi dito: '8 mm' não funde com 'temperado 8 mm'". Funções puras.
 */
export {}

/* eslint-disable @typescript-eslint/no-require-imports */
const V = () => require('@/lib/atendimentos-ia/vidro') as typeof import('@/lib/atendimentos-ia/vidro')
/* eslint-enable @typescript-eslint/no-require-imports */

describe('(1) a forma canônica: espessura + têmpera + cor, numa ordem só, só com o que foi dito', () => {
    it('as SEIS grafias do caso real viram QUATRO formas: as permutações fundem; "comum" não vira "temperado", "com cor" não vira "sem cor"', () => {
        const formas = ['Vidro comum 4 mm', 'incolor comum 4 mm', 'incolor 4 mm comum', 'Vidro comum 8 mm', 'incolor temperado 8 mm', 'incolor 8 mm temperado'].map(V().formaCanonicaDoVidro)
        expect(formas).toEqual(['comum 4 mm', 'comum incolor 4 mm', 'comum incolor 4 mm', 'comum 8 mm', 'temperado incolor 8 mm', 'temperado incolor 8 mm'])
        expect(new Set(formas).size).toBe(4)
    })

    it('o que o vendedor escreve: "vidro 4mm", "4 mm", "vidro de 4", "4mm vidro" são o mesmo vidro', () => {
        for (const t of ['vidro 4mm', '4 mm', 'vidro de 4', '4mm vidro', 'Vidro 4 MM', 'vidro 4,0 mm']) expect(V().formaCanonicaDoVidro(t)).toBe('4 mm')
    })

    it('a regra nunca inventa: "8 mm" não é "temperado 8 mm", nem "incolor 8 mm", nem "comum 8 mm"', () => {
        expect(V().mesmoVidro('vidro 8mm', 'temperado 8 mm')).toBe(false)
        expect(V().mesmoVidro('vidro 8mm', 'incolor 8 mm')).toBe(false)
        expect(V().mesmoVidro('vidro 8mm', 'comum 8 mm')).toBe(false)
        expect(V().mesmoVidro('temperado 8mm', 'incolor temperado 8 mm')).toBe(false)
        expect(V().mesmoVidro('temperado incolor 8mm', 'incolor 8 mm temperado')).toBe(true)
    })

    it('os sinônimos de têmpera e de cor: liso é comum, temp. é temperado, fumê é cinza, mini boreal é boreal, jateado é acidato', () => {
        expect(V().formaCanonicaDoVidro('vidro liso 4mm')).toBe('comum 4 mm')
        expect(V().formaCanonicaDoVidro('temp. incolor 8mm')).toBe('temperado incolor 8 mm')
        expect(V().formaCanonicaDoVidro('fumê 6mm')).toBe(V().formaCanonicaDoVidro('cinza 6 mm'))
        expect(V().formaCanonicaDoVidro('mini boreal 4mm')).toBe('boreal 4 mm')
        expect(V().formaCanonicaDoVidro('jateado 6 mm')).toBe('acidato 6 mm')
    })

    it('o laminado: "3+3" é laminado por construção; "laminado 4+4" também; 7,5 fica 7.5', () => {
        expect(V().vidroCanonico('vidro 3+3')).toEqual({ espessura: '3+3', tempera: 'laminado', cor: null, resto: [] })
        expect(V().formaCanonicaDoVidro('laminado incolor 4+4mm')).toBe('laminado incolor 4+4 mm')
        expect(V().formaCanonicaDoVidro('mini boreal 7,5mm')).toBe('boreal 7.5 mm')
    })

    it('o que não é espessura, têmpera, cor nem enchimento fica no resto, em ordem, e distingue: "4 mm reflect" não é "4 mm"', () => {
        expect(V().vidroCanonico('vidro 4mm guardian sun')).toEqual({ espessura: '4', tempera: null, cor: null, resto: ['guardian', 'sun'] })
        expect(V().formaCanonicaDoVidro('sun guardian 4mm')).toBe('4 mm guardian sun')
        expect(V().mesmoVidro('vidro 4mm', 'vidro 4mm reflect')).toBe(false)
    })

    it('sem nada lido a forma é vazia, e vazio não é igual a vazio (nada se funde sem conteúdo)', () => {
        expect(V().formaCanonicaDoVidro('')).toBe('')
        expect(V().formaCanonicaDoVidro(null)).toBe('')
        expect(V().mesmoVidro('', '')).toBe(false)
        expect(V().mesmoVidro(undefined, 'vidro')).toBe(false)
    })
})

describe('(2) vidroPodado: fica o que está na mensagem, cai a palavra que o modelo completou; cai inteiro só quando nada está ("pode, não derrube")', () => {
    const MSG = 'Janela de correr 1,50×1,20 vidro 4mm / porta janela 2,50×2,40 vidro 8mm / Cliente: Geronimo Silva'

    it('"incolor temperado 8 mm" sobre "vidro 8mm" vira "8 mm", não vazio; "Vidro comum 4 mm" vira "vidro 4 mm"; o enchimento acompanha o que ficou', () => {
        expect(V().vidroPodado('incolor temperado 8 mm', MSG)).toBe('8 mm')
        expect(V().vidroPodado('incolor 8 mm temperado', MSG)).toBe('8 mm')
        expect(V().vidroPodado('Vidro comum 4 mm', MSG)).toBe('vidro 4 mm')
        expect(V().vidroPodado('incolor comum 4 mm', MSG)).toBe('4 mm')
        expect(V().vidroPodado('vidro comum de 4mm', MSG)).toBe('vidro de 4 mm')
        // a palavra completada colada ao número também cai, e o número fica
        expect(V().vidroPodado('temperado/8mm', MSG)).toBe('8 mm')
    })

    it('o que já estava todo na mensagem volta igual (aparado); só cai inteiro quando NADA do vidro está na mensagem', () => {
        expect(V().vidroPodado('vidro 4mm', MSG)).toBe('vidro 4mm')
        expect(V().vidroPodado('  Vidro 8 mm ', MSG)).toBe('Vidro 8 mm')
        expect(V().vidroPodado('incolor comum', MSG)).toBeNull()
        expect(V().vidroPodado('temperado 10 mm', MSG)).toBeNull()
        expect(V().vidroPodado('vidro', MSG)).toBeNull()
        expect(V().vidroPodado('', MSG)).toBeNull()
        expect(V().vidroPodado(4, MSG)).toBeNull()
    })

    it('o número vale pelo valor e a palavra sem caixa e sem acento: "4.0 mm" fica, "FUMÊ" fica se a mensagem diz fumê', () => {
        expect(V().vidroPodado('vidro 4.0 mm', 'vidro 4mm')).toBe('vidro 4.0 mm')
        expect(V().vidroPodado('fume 6 mm liso', 'vidro FUMÊ 6mm')).toBe('fume 6 mm')
        expect(V().vidroPodado('vidro 5mm', 'vidro 4mm')).toBeNull()
    })

    it('o copiado passa: "vidro 4mm", "vidro 4 mm", "4mm", "Vidro 8mm"', () => {
        for (const v of ['vidro 4mm', 'vidro 4 mm', '4mm', 'Vidro 8mm', '8 mm']) expect(V().vidroDito(v, MSG)).toBe(true)
    })

    it('o completado cai: "Vidro comum 4 mm", "incolor temperado 8 mm", "incolor 4 mm comum" — nenhuma dessas palavras está na mensagem', () => {
        for (const v of ['Vidro comum 4 mm', 'incolor comum 4 mm', 'incolor 4 mm comum', 'incolor temperado 8 mm', 'incolor 8 mm temperado']) expect(V().vidroDito(v, MSG)).toBe(false)
    })

    it('a palavra dita passa mesmo noutra caixa e sem acento; o número vale pelo valor', () => {
        expect(V().vidroDito('Temperado 5mm', 'DP-02 1200 x 1000, branco, temperado 5mm')).toBe(true)
        expect(V().vidroDito('fume 6 mm', 'vidro FUMÊ 6mm')).toBe(true)
        expect(V().vidroDito('vidro 4.0 mm', 'vidro 4mm')).toBe(true)
        expect(V().vidroDito('vidro 5mm', 'vidro 4mm')).toBe(false)
    })

    it('só enchimento não é vidro dito; o que não é texto não é dito', () => {
        expect(V().vidroDito('vidro', MSG)).toBe(false)
        expect(V().vidroDito('', MSG)).toBe(false)
        expect(V().vidroDito(4, MSG)).toBe(false)
        expect(V().vidroDito(null, MSG)).toBe(false)
    })
})
