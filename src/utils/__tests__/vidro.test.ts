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

/**
 * O LEITOR CANÔNICO (dono do produto, 08/11/2026): uma função só lê espessura, tipo e cor do texto livre do vidro. O caso: "Antonio Rock",
 * levantamento 10 — "incolor 4" na DP-02, cujos baguetes aceitam 4,5,6,8 (GB25) e 18,20,21,24 (GB8), saiu como "falta a espessura" e com o
 * caminho "incolor 4 4 mm".
 */
describe('(L) lerVidro: o único leitor do texto do vidro', () => {
    // os dois conjuntos de baguete do DP-02 no motor de 08/11/2026 (022fc55e): GB25 "4,5,6,8" e GB8 "18,20,21,24"
    const DP02 = [4, 5, 6, 8, 18, 20, 21, 24]
    // o motor de antes (2a02b330), sem o 4 na aba Perfis
    const DP02_ANTES = [5, 6, 8, 18, 20, 21, 24]

    it('os três textos do Antonio Rock, cada um com as espessuras da sua tipologia', () => {
        // esquadria 1, DP-39 (os mesmos dois conjuntos): com unidade, vale sempre
        expect(V().lerVidro('comum 6 mm incolor', DP02)).toEqual({ texto_original: 'comum 6 mm incolor', espessura_mm: 6, espessuras_ambiguas: null, tipo: 'comum', cor: 'incolor', numeros: ['6'], resto: [] })
        // esquadria 2, DP-01 (nenhum baguete depende da espessura): sem número, nula e sem erro
        expect(V().lerVidro('mini boreal', [])).toEqual({ texto_original: 'mini boreal', espessura_mm: null, espessuras_ambiguas: null, tipo: null, cor: 'boreal', numeros: [], resto: [] })
        // esquadria 3, DP-02: o número sem unidade vale porque o 4 está na lista
        expect(V().lerVidro('incolor 4', DP02)).toEqual({ texto_original: 'incolor 4', espessura_mm: 4, espessuras_ambiguas: null, tipo: null, cor: 'incolor', numeros: ['4'], resto: [] })
    })

    it('o número SEM unidade só vale se a tipologia o aceita — no motor de antes, "incolor 4" não tem espessura; sem lista, também não', () => {
        expect(V().lerVidro('incolor 4', DP02_ANTES).espessura_mm).toBeNull()
        expect(V().lerVidro('incolor 4', null).espessura_mm).toBeNull()
        expect(V().lerVidro('incolor 4').espessura_mm).toBeNull()
        // o de cada conjunto vale: o 20 é do GB8
        expect(V().lerVidro('laminado 20', DP02).espessura_mm).toBe(20)
    })

    it('COM unidade vale sempre, mesmo fora da lista (o cálculo diz que não é aceito): "4mm" no motor de antes é 4', () => {
        expect(V().lerVidro('4mm', DP02_ANTES).espessura_mm).toBe(4)
        expect(V().lerVidro('incolor 12 mm', DP02).espessura_mm).toBe(12)
    })

    it.each([
        ['incolor 4', 4], ['4mm', 4], ['4 mm', 4], ['4 milimetros', 4], ['4 milímetros', 4], ['4 MILÍMETROS', 4], ['4 milímetro', 4], ['vidro 4', 4],
        ['comum 6 mm incolor', 6], ['incolor 4 mm temperado', 4], ['Laminado 6,38 mm', 6.38], ['temperado 8 MM', 8],
    ])('"%s" → %s, em qualquer posição, com ou sem unidade', (texto, esperado) => {
        expect(V().lerVidro(texto, DP02).espessura_mm).toBe(esperado)
    })

    it('mais de um número: o com unidade ganha; sem unidade, o da lista ganha', () => {
        // "3" e "8": o 8 tem unidade
        expect(V().lerVidro('3 folhas incolor 8 mm', DP02)).toMatchObject({ espessura_mm: 8, espessuras_ambiguas: null })
        // nenhum com unidade: "2 folhas" não é espessura, o 6 está na lista
        expect(V().lerVidro('2 folhas incolor 6', DP02)).toMatchObject({ espessura_mm: 6, espessuras_ambiguas: null })
        // com unidade, o 3 sem unidade não conta mesmo estando... fora da lista
        expect(V().lerVidro('incolor 6mm 3', DP02).espessura_mm).toBe(6)
    })

    it('dois que valem: AMBÍGUO — nula, com as duas, e aí o agente pergunta', () => {
        expect(V().lerVidro('incolor 4 ou 6', DP02)).toMatchObject({ espessura_mm: null, espessuras_ambiguas: [4, 6] })
        expect(V().lerVidro('6 mm ou 8 mm', DP02)).toMatchObject({ espessura_mm: null, espessuras_ambiguas: [6, 8] })
        // o mesmo número dito duas vezes não é ambíguo
        expect(V().lerVidro('6mm incolor 6 mm', DP02)).toMatchObject({ espessura_mm: 6, espessuras_ambiguas: null })
        // só um dos dois na lista: não é ambíguo
        expect(V().lerVidro('incolor 4 ou 7', DP02)).toMatchObject({ espessura_mm: 4, espessuras_ambiguas: null })
    })

    it('a composição não é UMA espessura: nula, e laminado por construção', () => {
        expect(V().lerVidro('Laminado 4+4 mm', DP02)).toMatchObject({ espessura_mm: null, espessuras_ambiguas: null, tipo: 'laminado', numeros: ['4+4'] })
        expect(V().lerVidro('vidro 3 + 3', DP02)).toMatchObject({ espessura_mm: null, tipo: 'laminado', numeros: ['3+3'] })
    })

    it('tipo e cor saem do mesmo leitor; o que não é vidro nenhum dá nulos', () => {
        expect(V().lerVidro('Temp. fumê 8mm', DP02)).toMatchObject({ tipo: 'temperado', cor: 'fume', espessura_mm: 8 })
        expect(V().lerVidro(null)).toEqual({ texto_original: null, espessura_mm: null, espessuras_ambiguas: null, tipo: null, cor: null, numeros: [], resto: [] })
        expect(V().lerVidro(42 as unknown)).toMatchObject({ texto_original: null, espessura_mm: null })
    })

    it('a frase de exemplo é montada SEM o número dito — nunca mais "incolor 4 4 mm"', () => {
        expect(V().vidroComEspessura('incolor 4', 4)).toBe('incolor 4 mm')
        expect(V().vidroComEspessura('incolor 4', 5)).toBe('incolor 5 mm')
        expect(V().vidroComEspessura('incolor 4 ou 6', 6)).toBe('incolor 6 mm')
        expect(V().vidroComEspessura('6 mm ou 8 mm', 8)).toBe('8 mm')
        expect(V().vidroComEspessura('3 folhas incolor 8 mm', 6)).toBe('folhas incolor 6 mm')
        expect(V().vidroComEspessura('4 milímetros incolor', 5)).toBe('5 mm incolor')
        expect(V().vidroComEspessura('laminado 4+4 mm', 8)).toBe('laminado 8 mm')
        expect(V().vidroComEspessura('comum 6 mm incolor', 8)).toBe('comum 8 mm incolor')
    })
})
