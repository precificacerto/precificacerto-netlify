/**
 * A TRADUÇÃO DO VIDRO (dono do produto, 12/11/2026, 3.4): o texto do vendedor vira o item da tabela de vidro só quando o que foi dito fecha num
 * item ÚNICO. Os itens abaixo são as descrições da tabela de vidro da Estrela como estão no banco (lidas em 12/11/2026); os textos, os doze que
 * os levantamentos gravaram. O que cada um deve dar é a regra do dono do produto, escrita no comando.
 */
import { candidatosDoVidro, traduzirVidro, vidroDito, vidroDoItem } from '@/lib/atendimentos-ia/vidro-da-tabela'

const TABELA = [
    ['DPVBO3,4/6,5/VTIN05', 'MINI BOREAL 3,4/6,5/TEMPERADO INCOLOR 05'], ['DPVTIN06/6,5/VTAC08', 'TEMPERADO INCOLOR 06/6,5/TEMPERADO ACIDATO 08 DP'],
    ['DPVTIN06/8,5/VTIN06', 'TEMPERADO INCOLOR 06/8,5/TEMPERADO INCOLOR 06 DP'], ['DPVTIN06/9,5/VTIN06', 'TEMPERADO INCOLOR 06/9,5/TEMPERADO INCOLOR 06 DP'],
    ['LAMVBO3,4+VIN04', 'MINI BOREAL 3,4 + INCOLOR 04 LM'], ['VBO3,4', 'VIDRO MINI BOREAL 3,4MM'], ['VBO7,5', 'VIDRO COMUM MINI BOREAL 7,5MM'],
    ['VIN04', 'VIDRO COMUM INCOLOR 04MM'], ['VIN05', 'VIDRO COMUM INCOLOR 05MM'], ['VIN06', 'VIDRO COMUM INCOLOR 06MM'],
    ['VLAMIN3+3', 'VIDRO LAMINADO INCOLOR 3+3MM'], ['VLAMIN4+4', 'VIDRO LAMINADO INCOLOR 4+4MM'], ['VTAC08', 'VIDRO TEMPERADO ACIDATO 08MM'],
    ['VTBO7,5', 'VIDRO TEMPERADO MINI BOREAL 7,5MM'], ['VTCZ06', 'VIDRO TEMPERADO FUME 06MM'], ['VTCZ08', 'VIDRO TEMPERADO FUME 08MM'],
    ['VTIN06', 'VIDRO TEMPERADO INCOLOR 06MM'], ['VTIN08', 'VIDRO TEMPERADO INCOLOR 08MM'], ['VTIN10', 'VIDRO TEMPERADO INCOLOR 10MM'],
    ['VTRG06', 'VIDRO TEMP. REFLECT GUARDIAN 06MM'], ['VTSGN1406', 'VIDRO TEMPERADO SG NEUTRAL 14 06MM'],
].map(([codigo, descricao]) => ({ codigo, descricao }))
const codigo = (texto: string) => { const r = traduzirVidro(texto, null, TABELA); return 'item' in r ? r.item.codigo : r.motivo }

describe('a tradução do vidro, nos doze textos gravados', () => {
    it.each([
        ['comum 6 mm incolor', 'VIN06'], ['vidro comum 6 mm incolor', 'VIN06'],
        ['incolor 4 mm comum', 'VIN04'], ['4 mm incolor', 'VIN04'], ['incolor 4', 'VIN04'], ['Vidro comum 4 mm', 'VIN04'],
        ['temperado incolor 6 mm', 'VTIN06'], ['temperado incolor 8mm', 'VTIN08'], ['5mm', 'VIN05'],
    ])('casa: “%s” → %s', (texto, esperado) => expect(codigo(texto)).toBe(esperado))

    it('AMBÍGUO: “mini boreal” bate com os cinco — os três de mini boreal e os dois compostos com ele —, e nenhum é escolhido', () => {
        const r = traduzirVidro('mini boreal', null, TABELA)
        expect('candidatos' in r && r.motivo).toBe('VIDRO_AMBIGUO')
        expect('candidatos' in r ? r.candidatos.map((c) => c.codigo).sort() : []).toEqual(['DPVBO3,4/6,5/VTIN05', 'LAMVBO3,4+VIN04', 'VBO3,4', 'VBO7,5', 'VTBO7,5'])
        expect('frase' in r ? r.frase : '').toContain('nenhum é escolhido')
    })

    it.each([['temperado 5mm'], ['Vidro comum 8 mm incolor']])('NÃO EXISTE: “%s” é falta de cadastro, nomeada', (texto) => {
        expect(codigo(texto)).toBe('VIDRO_SEM_CADASTRO')
        const r = traduzirVidro(texto, null, TABELA)
        expect('frase' in r ? r.frase : '').toContain('falta de cadastro')
    })

    it('o código escolhido vence o texto; o código fora da tabela é falta, e o vazio é "não dito"', () => {
        expect(traduzirVidro('qualquer coisa', 'VTIN10', TABELA)).toEqual({ item: TABELA[18], como: 'codigo' })
        expect(codigo('')).toBe('VIDRO_NAO_DITO')
        expect('motivo' in traduzirVidro('x', 'NAO-EXISTE', TABELA) && (traduzirVidro('x', 'NAO-EXISTE', TABELA) as { motivo: string }).motivo).toBe('VIDRO_CODIGO_FORA_DA_TABELA')
        expect(codigo('bonito')).toBe('VIDRO_NAO_TRADUZIDO')
    })
})

describe('as peças da tradução', () => {
    it('o que o texto diz: o número solto é espessura, "04" é 4, "7,5" é 7.5, e "3+3" é laminado', () => {
        expect(vidroDito('incolor 4')).toEqual({ tipo: null, espessura: '4', familia: 'INCOLOR' })
        expect(vidroDito('laminado 3+3')).toEqual({ tipo: 'LAMINADO', espessura: '3+3', familia: null })
        expect(vidroDito('3+3 incolor')).toEqual({ tipo: 'LAMINADO', espessura: '3+3', familia: 'INCOLOR' })
        expect(vidroDito('fumê 8mm temp.')).toEqual({ tipo: 'TEMPERADO', espessura: '8', familia: 'FUME' })
    })
    it('o item composto não tem uma espessura nem um tipo: só é candidato sem espessura e sem tipo ditos', () => {
        expect(vidroDoItem('MINI BOREAL 3,4/6,5/TEMPERADO INCOLOR 05')).toMatchObject({ composto: true, espessura: null })
        expect(candidatosDoVidro({ tipo: null, espessura: '5', familia: null }, TABELA).map((c) => c.codigo)).toEqual(['VIN05'])
        expect(vidroDoItem('VIDRO TEMPERADO SG NEUTRAL 14 06MM')).toMatchObject({ espessura: '6', familias: ['SG NEUTRAL'] })
    })
})
