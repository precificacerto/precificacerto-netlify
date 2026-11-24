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
        // o padrão é a REFERÊNCIA (24/11/2026): VTIN08 acha o LJ-VTIN08; o código do fornecedor no lugar dela não desempata
        const t = traduzirVidro('temperado incolor 8mm', null, [...ITENS, ...ESTRELA], ['VTIN08'])
        expect('item' in t && [t.item.codigo, t.como]).toEqual(['LJ-VTIN08', 'padrao'])
        expect('motivo' in traduzirVidro('temperado incolor 8mm', null, [...ITENS, ...ESTRELA], ['LJ-VTIN08'])).toBe(true)
    })
})

// ── A REFERÊNCIA ÚNICA DO VIDRO É O codigo_wvetro (dono do produto, 24/11/2026) ──
describe('a referência (codigo_wvetro) acha UM vidro na tabela da Lajeadense', () => {
    it('as 98 linhas têm referência, e as 98 são distintas: o código do fornecedor sem o prefixo "LJ-"', () => {
        expect(ITENS.map((i) => i.codigo_wvetro)).toEqual(ITENS.map((i) => i.codigo.replace(/^LJ-/, '')))
        expect(new Set(ITENS.map((i) => i.codigo_wvetro)).size).toBe(98)
    })
    it('cada referência escolhida acha o SEU item, qualquer que seja o texto — e o código do fornecedor no lugar dela não acha nada', () => {
        for (const i of ITENS) {
            expect(traduzirVidro('qualquer coisa', i.codigo_wvetro, ITENS)).toEqual({ item: i, como: 'codigo' })
            const peloCodigo = traduzirVidro('qualquer coisa', i.codigo, ITENS)
            expect('motivo' in peloCodigo && peloCodigo.motivo).toBe('VIDRO_CODIGO_FORA_DA_TABELA')
        }
    })
    // os nove padrões de vidro da política da De Paula, como medidos em produção em 24/11/2026
    it.each([['VTIN06', 'LJ-VTIN06'], ['VTIN08', 'LJ-VTIN08']])('o padrão %s (fixo, janelas de abrir e oscilo-batente / as quatro portas) acha o %s', (referencia, codigoDoItem) => {
        const t = traduzirVidro(null, referencia, ITENS)
        expect('item' in t && t.item.codigo).toBe(codigoDoItem)
    })
    it.each([['VIN05', 'janela correr'], ['VBO3,4', 'maxim-ar']])('o padrão %s (%s), que é código da Estrela, NÃO existe na Lajeadense: falta nomeada — nem o VFIN05 nem o VBO04 entram no lugar', (referencia) => {
        expect(traduzirVidro(null, referencia, ITENS)).toEqual({ motivo: 'VIDRO_CODIGO_FORA_DA_TABELA', candidatos: [],
            frase: `o vidro ${referencia} não existe na tabela de vidro do fornecedor principal (a referência é a coluna codigo_wvetro)` })
    })
    it('a grafia que o dono do produto decidiu: VFIN05 é o Float INcolor 05, e é ele que a janela de correr passa a apontar', () => {
        const t = traduzirVidro(null, 'VFIN05', ITENS)
        expect('item' in t && [t.item.codigo, t.item.descricao]).toEqual(['LJ-VFIN05', 'VIDRO FLOAT (COMUM) INCOLOR 05MM'])
    })
})
