/**
 * PORTÃO — O VIDRO POR SEGMENTO + COR + ESPESSURA (dono do produto, 23/11/2026). A tabela da Lajeadense (as 98 linhas do arquivo de 01/10/2026,
 * md5 cfef0a22…, com os segmentos da v3: Aramado, Pontilhado, Canelado, Mini boreal, Laminado mini boreal, Laminado PVB opaco e Laminado PVB
 * silence no lugar de Texturizado, Translúcido e Laminado acústico; a cor intacta). Os 90 vidros são únicos pela trinca; as 8 linhas de
 * duplagem (adicionais por m², sem espessura) ficam fora do casamento; o LJ-VLSIL5+5 está sem preço.
 */
import { candidatosPorAtributo, espessuraDoItem, traduzirVidro, vidroDitoPorAtributo, type ItemDeVidro } from '@/lib/atendimentos-ia/vidro-da-tabela'
import LAJEADENSE from './fixtures/lajeadense-vidros-v3.json'

const ITENS = LAJEADENSE as Array<ItemDeVidro & { custo: number | null }>
const ESTRELA: ItemDeVidro[] = [
    { codigo: 'VIN06', descricao: 'VIDRO INCOLOR 6MM COMUM', segmento: 'Vidro', cor: null },
    { codigo: 'VTI08', descricao: 'VIDRO TEMPERADO INCOLOR 8MM', segmento: 'Vidro', cor: null },
]
const codigo = (texto: string, itens: readonly ItemDeVidro[] = ITENS) => {
    const t = traduzirVidro(texto, null, itens)
    return 'item' in t ? t.item.codigo : `${t.motivo}:${t.candidatos.map((c) => c.codigo).join(',')}`
}

describe('a trinca acha UM vidro', () => {
    it('os 90 vidros com cor: cada um é achado pela sua trinca, e só por ela', () => {
        const comCor = ITENS.filter((i) => i.cor)
        expect(comCor).toHaveLength(90)
        for (const i of comCor) {
            const e = espessuraDoItem(i.descricao)
            const achados = candidatosPorAtributo({ variante: (i.segmento as string).toUpperCase(), cor: (i.cor as string).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(), espessura: e.total ?? e.composicao }, ITENS)
            expect([i.codigo, achados.map((a) => a.codigo)]).toEqual([i.codigo, [i.codigo]])
        }
    })
    it.each([
        ['temperado incolor 6mm', 'LJ-VTIN06'],
        ['temperado 6 mm neutro incolor', 'LJ-VTHNI06'],
        ['comum incolor 4mm', 'LJ-VFIN04'],
        ['float fumê 8mm', 'LJ-VFFM08'],
        ['laminado incolor 4+4', 'LJ-VLIN4+4'],
        ['laminado incolor 8mm', 'LJ-VLIN4+4'],
        ['temperado laminado incolor 10mm', 'LJ-VTLIN5+5'],
        ['laminado habitat neutro cinza claro 4+6', 'LJ-VLHNCC4+6'],
        ['pontilhado 4mm incolor', 'LJ-VPON04'],
        ['canelado 4', 'LJ-VCAN04'],
        ['laminado mini boreal 8mm', 'LJ-VLBO08'],
        ['mini boreal 4mm', 'LJ-VBO04'],
        ['laminado pvb opaco 6mm', 'LJ-VLOP06'],
        ['aramado 6mm', 'LJ-VAR06'],
    ])('“%s” → %s', (texto, esperado) => expect(codigo(texto)).toBe(esperado))
})

describe('o que não fecha é nomeado, nunca escolhido', () => {
    it('a cor não dita, com várias: AMBÍGUO, com os candidatos', () => {
        expect(codigo('temperado 6mm')).toBe('VIDRO_AMBIGUO:LJ-VTIN06,LJ-VTVD06,LJ-VTFM06,LJ-VTHNI06,LJ-VTHNC06,LJ-VTHNCC06,LJ-VTHRCH06,LJ-VTHRCZ06,LJ-VTHRES06')
    })
    it('"incolor" não é "neutro incolor": o mais longo do vocabulário vence, e a palavra sozinha é a cor exata', () => {
        expect(vidroDitoPorAtributo('temperado neutro incolor 4', ITENS)).toEqual({ variante: 'TEMPERADO', cor: 'NEUTRO INCOLOR', espessura: '4' })
        expect(vidroDitoPorAtributo('temperado incolor 4', ITENS)).toEqual({ variante: 'TEMPERADO', cor: 'INCOLOR', espessura: '4' })
    })
    it('"temperado laminado" é UM segmento, nunca temperado nem laminado', () => {
        expect(vidroDitoPorAtributo('temperado laminado incolor 8', ITENS).variante).toBe('TEMPERADO LAMINADO')
    })
    it('a espessura que não existe: SEM CADASTRO', () => {
        expect(codigo('temperado incolor 7mm')).toBe('VIDRO_SEM_CADASTRO:')
    })
    it('as 8 linhas de duplagem (sem espessura) NUNCA são candidatas, nem quando o texto as nomeia', () => {
        const duplagem = ITENS.filter((i) => !i.cor)
        expect(duplagem.map((d) => d.codigo)).toEqual(['LJ-DUP-ESP09', 'LJ-DUP-ESP11', 'LJ-DUP-ESP15', 'LJ-DUP-ESP21', 'LJ-DUP-SLMAN', 'LJ-DUP-SLMOT', 'LJ-DUP-ARG', 'LJ-DUP-SIL'])
        expect(candidatosPorAtributo({ variante: null, cor: null, espessura: null }, ITENS).filter((c) => !c.cor)).toEqual([])
        expect(codigo('duplagem')).toBe('VIDRO_NAO_TRADUZIDO:')
    })
    it('o LJ-VLSIL5+5 é achado (laminado PVB silence 10) e vem SEM preço: quem custeia nomeia a falta', () => {
        expect(codigo('laminado pvb silence incolor 10mm')).toBe('LJ-VLSIL5+5')
        expect(ITENS.find((i) => i.codigo === 'LJ-VLSIL5+5')!.custo).toBeNull()
    })
})

describe('os cantos do casamento', () => {
    it('só o vocabulário da tabela, sem espessura nem tipo do leitor de antes ("pontilhado"): achado — nunca "não traduzido"', () => {
        expect(codigo('pontilhado')).toBe('LJ-VPON04')
    })
    it('o item com variante e cor mas SEM espessura na descrição não é candidato (a regra é geral, não só da duplagem)', () => {
        const comUmSemMedida: ItemDeVidro[] = [...ITENS, { codigo: 'SEM-MM', descricao: 'VIDRO TEMPERADO ESPECIAL', segmento: 'Temperado', cor: 'INCOLOR' }]
        expect(candidatosPorAtributo({ variante: 'TEMPERADO', cor: 'INCOLOR', espessura: null }, comUmSemMedida).map((c) => c.codigo)).not.toContain('SEM-MM')
    })
    it('a cor é procurada no que SOBRA depois da variante: a palavra de cor que faz parte do nome da variante não é a cor dita', () => {
        const itens: ItemDeVidro[] = [
            { codigo: 'ACI-BZ', descricao: 'VIDRO ACIDATO INCOLOR BRONZE 06MM', segmento: 'Acidato incolor', cor: 'BRONZE' },
            { codigo: 'TEMP-IN', descricao: 'VIDRO TEMPERADO INCOLOR 06MM', segmento: 'Temperado', cor: 'INCOLOR' },
        ]
        expect(vidroDitoPorAtributo('acidato incolor bronze 6mm', itens)).toEqual({ variante: 'ACIDATO INCOLOR', cor: 'BRONZE', espessura: '6' })
        expect(codigo('acidato incolor bronze 6mm', itens)).toBe('ACI-BZ')
    })
})

describe('a tabela de antes (sem segmento e cor) não muda', () => {
    it('a Estrela, sozinha: pela descrição, como sempre', () => {
        expect(codigo('comum 6 mm incolor', ESTRELA)).toBe('VIN06')
        expect(codigo('temperado 8mm', ESTRELA)).toBe('VTI08')
    })
    it('as duas juntas: o mesmo vidro nas duas é AMBÍGUO nomeado (o padrão da empresa desempata), nunca a primeira', () => {
        expect(codigo('temperado incolor 8mm', [...ITENS, ...ESTRELA])).toBe('VIDRO_AMBIGUO:LJ-VTIN08,VTI08')
        const t = traduzirVidro('temperado incolor 8mm', null, [...ITENS, ...ESTRELA], ['LJ-VTIN08'])
        expect('item' in t && [t.item.codigo, t.como]).toEqual(['LJ-VTIN08', 'padrao'])
    })
})
