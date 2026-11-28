/**
 * @jest-environment node
 *
 * PORTÃO — perfis por cor em ABAS (dono do produto, pedido 0055). O código do fornecedor com o sufixo da cor (IL4236 = IL42 + 36, a cor PRETO LISO)
 * mascarava a busca do motor: a referência IL42 existia em PRETO LISO, mas sem a coluna de referência, e a peça saía "não encontrada".
 *
 * O formato novo: UMA ABA POR COR (o nome da aba é o nome canônico da cor do fornecedor), colunas REFERÊNCIA, CÓDIGO, DESCRIÇÃO, PREÇO e BARRA.
 * A cor vem da ABA, a referência vem da COLUNA, e o importador NUNCA decifra a cor (nem a referência) pelo código. Aba fora da lista de cores, ou
 * linha sem referência, recusa a importação INTEIRA, com a lista. As planilhas são montadas aqui com o exceljs.
 */
import ExcelJS from 'exceljs'

import { lerArquivosDaImportacao, referenciasDaCategoria, type ResultadoDaLeitura } from '@/utils/atendimentos-ia-importacao'
import { resolverPelaReferencia, type ItemResolvivel } from '@/lib/atendimentos-ia/resolucao-de-referencia'
import { faltasPorCor, itemDaAbaDoBanco, perfisPorCor, quadroCorPorReferencias } from '@/utils/atendimentos-ia-abas-por-cor'

type Linha = [referencia: ExcelJS.CellValue, codigo: ExcelJS.CellValue, descricao: ExcelJS.CellValue, preco: ExcelJS.CellValue, barra: ExcelJS.CellValue]
const CABECALHO = ['REFERÊNCIA', 'CÓDIGO DO FORNECEDOR', 'DESCRIÇÃO', 'PREÇO', 'BARRA']
const CORES = ['BRANCO', 'PRETO LISO', 'GOLDEN OAK', 'EXTERNO GOLDEN OAK']

async function arquivo(abas: Record<string, Linha[]>, cabecalho: string[] = CABECALHO): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        ;[cabecalho, ...linhas].forEach((l, i) => l.forEach((v, k) => { ws.getRow(i + 1).getCell(k + 1).value = v }))
    }
    return new Uint8Array(await wb.xlsx.writeBuffer())
}
const ler = async (abas: Record<string, Linha[]>, cores: string[] | null = CORES, cabecalho?: string[]) =>
    lerArquivosDaImportacao({ tabela: { nome: 'Perfis.xlsx', bytes: await arquivo(abas, cabecalho) }, motor: null, coresDoFornecedor: cores ?? undefined })
type Lida = Extract<ResultadoDaLeitura, { ok: true }>
const lida = async (abas: Record<string, Linha[]>) => {
    const r = await ler(abas)
    if (r.ok === false) throw new Error('era para ler: ' + r.erro)
    return r as Lida
}
const erroDe = (r: ResultadoDaLeitura) => (r.ok ? '' : (r as { erro: string }).erro)

const ABAS: Record<string, Linha[]> = {
    BRANCO: [['IL42', 'IL421', 'INTERLOCK LINHA 42MM - BRANCO', 19.39728, 6], ['KT42', 'KT421', 'CAPA PARA IL42 - BRANCO', 19.39728, 6]],
    'PRETO LISO': [['IL42', 'IL4236', 'INTERLOCK LINHA 42MM - PRETO LISO', 58.704, 6], ['KT42', 'KT4236', 'CAPA PARA IL42 - PRETO LISO', 58.704, 6]],
}

describe('0055 — a aba é a cor, a coluna é a referência', () => {
    it('lê cada aba como a cor dela, com a referência da coluna e o código do fornecedor como veio', async () => {
        const r = await lida(ABAS)
        expect(r.layout).toBe('abas_por_cor')
        expect(r.itens).toHaveLength(4)
        const il42 = r.itens.find((i) => i.codigo === 'IL4236')
        expect(il42).toMatchObject({ cor: 'PRETO LISO', codigo_wvetro: 'IL42', descricao: 'INTERLOCK LINHA 42MM - PRETO LISO', custo: 58.704, medida_barra_m: 6 })
        expect(r.itens.find((i) => i.codigo === 'IL421')).toMatchObject({ cor: 'BRANCO', codigo_wvetro: 'IL42' })
    })

    it('a aba vale pelo nome canônico da lista, sem olhar caixa, acento nem espaço de sobra', async () => {
        const r = await lida({ ' preto  liso ': ABAS['PRETO LISO'] })
        expect(r.itens.every((i) => i.cor === 'PRETO LISO')).toBe(true)
    })

    it('com a categoria PERFIL, a referência da coluna vira referencia_perfil, e o motor acha IL42 em PRETO LISO (o caso do orçamento 14)', async () => {
        const r = await lida(ABAS)
        expect(referenciasDaCategoria(r, 'PERFIL')).toBeNull()
        const itens = r.itens as unknown as ItemResolvivel[]
        const achada = resolverPelaReferencia({ codigoDoMotor: 'IL42/WOLFF', descricaoDoMotor: 'INTERLOCK', corPedida: 'PRETO LISO' }, itens)
        expect(achada).toMatchObject({ achada: true, como: 'referencia', item: { codigo: 'IL4236' } })
        const kt = resolverPelaReferencia({ codigoDoMotor: 'KT42/WOLFF', descricaoDoMotor: 'CAPA', corPedida: 'PRETO LISO' }, itens)
        expect(kt).toMatchObject({ achada: true, item: { codigo: 'KT4236' } })
    })

    it('a referência que não está na aba da cor diz "referência X não existe na aba COR", e nomeia as abas onde ela existe', async () => {
        const r = await lida({ ...ABAS, 'EXTERNO GOLDEN OAK': [['IL42', 'IL4219', 'IL42 - GOLDEN OAK', 58.704, 6]], 'GOLDEN OAK': [['HF88S', 'HF88S21', 'HF88S', 10, 6]] })
        expect(referenciasDaCategoria(r, 'PERFIL')).toBeNull()
        const falta = resolverPelaReferencia({ codigoDoMotor: 'IL42/WOLFF', descricaoDoMotor: null, corPedida: 'GOLDEN OAK' }, r.itens as unknown as ItemResolvivel[])
        expect(falta).toMatchObject({ achada: false, motivo: 'REFERENCIA_SEM_A_COR' })
        expect((falta as { frase: string }).frase).toContain('referência IL42 não existe na aba GOLDEN OAK')
        expect((falta as { frase: string }).frase).toContain('EXTERNO GOLDEN OAK')
    })

    it('NÃO decifra pelo código: a linha sem referência recusa a importação inteira, mesmo com o sufixo da cor no código', async () => {
        const r = await ler({ ...ABAS, 'PRETO LISO': [['', 'IL4236', 'INTERLOCK', 58.704, 6], ['KT42', 'KT4236', 'CAPA', 58.704, 6]] })
        expect(r.ok).toBe(false)
        const e = erroDe(r)
        expect(e).toContain('sem a referência')
        expect(e).toContain('PRETO LISO')
        expect(e).toContain('linha 2')
        expect(e).toContain('IL4236')
        expect(e).toContain('Nada foi gravado')
    })

    it('aba com nome fora da lista de cores recusa a importação inteira, nomeando cada aba e as cores que valem', async () => {
        const r = await ler({ ...ABAS, 'AZUL BEBE': [['IL42', 'IL4299', 'x', 1, 6]], Resumo: [['IL42', 'IL4298', 'y', 1, 6]] })
        expect(r.ok).toBe(false)
        const e = erroDe(r)
        expect(e).toContain('"AZUL BEBE"')
        expect(e).toContain('"Resumo"')
        expect(e).toContain('BRANCO')
        expect(e).toContain('Nada foi gravado')
    })

    it('duas abas da mesma cor (grafias diferentes) são recusa nomeada', async () => {
        const r = await ler({ BRANCO: ABAS.BRANCO, 'Branco ': [['HF88S', 'HF88S1', 'x', 1, 6]] })
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('mais de uma aba')
    })

    it('o fornecedor sem lista de cores não importa por abas: sem lista não há como conferir o nome da aba', async () => {
        const r = await ler(ABAS, [])
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('lista de cores')
        const nao = await ler(ABAS, null)
        expect(nao.ok).toBe(false)
    })

    it('aba sem uma das colunas é recusa nomeada, aba a aba', async () => {
        const r = await ler(ABAS, CORES, ['REFERÊNCIA', 'CÓDIGO DO FORNECEDOR', 'DESCRIÇÃO', 'PREÇO'])
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('BARRA')
    })

    it('preço em texto é recusa nomeada, nunca zero', async () => {
        const r = await ler({ BRANCO: [['IL42', 'IL421', 'x', 'consulte', 6]] })
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('consulte')
    })

    it('a referência repetida na mesma cor (duas linhas) é recusa nomeada pela regra de referência + cor', async () => {
        const r = await lida({ BRANCO: [['IL42', 'IL421', 'a', 1, 6], ['IL42', 'IL4210', 'b', 1, 6]] })
        expect(referenciasDaCategoria(r, 'PERFIL')).toContain('IL42')
    })
})

describe('0055 — o quadro cor × referências e a lista do que falta', () => {
    const itens = [
        { cor: 'BRANCO', referencia_perfil: 'IL42' }, { cor: 'BRANCO', referencia_perfil: 'KT42' }, { cor: 'BRANCO', referencia_perfil: 'HF88S' },
        { cor: 'PRETO LISO', referencia_perfil: 'IL42' }, { cor: 'PRETO LISO', referencia_perfil: 'ZZ99' },
        { cor: 'PRETO LISO', referencia_perfil: null },
    ]
    it('conta as referências distintas de cada cor, e as linhas sem referência à parte', () => {
        expect(quadroCorPorReferencias(itens)).toEqual([
            { cor: 'BRANCO', referencias: 3, semReferencia: 0 },
            { cor: 'PRETO LISO', referencias: 2, semReferencia: 1 },
        ])
    })
    it('cada cor contra o BRANCO: o que falta nela e o que ela tem a mais', () => {
        expect(faltasPorCor(itens)).toEqual([{ cor: 'PRETO LISO', faltam: ['HF88S', 'KT42'], sobram: ['ZZ99'] }])
    })
    it('sem aba BRANCO não há base para comparar: lista vazia, não invento outra base', () => {
        expect(faltasPorCor(itens.filter((i) => i.cor !== 'BRANCO'))).toEqual([])
    })
})

describe('0055 — o item como o banco o devolve, e o que a tela monta', () => {
    it('numeric vem como texto: vira número; vazio e ausente ficam nulos, nunca zero', () => {
        expect(itemDaAbaDoBanco({ codigo: 'IL4236', descricao: 'x', cor: 'PRETO LISO', referencia_perfil: 'IL42', custo: '58.704', medida_barra_m: '6' }))
            .toEqual({ codigo: 'IL4236', descricao: 'x', cor: 'PRETO LISO', referencia_perfil: 'IL42', custo: 58.704, medida_barra_m: 6 })
        expect(itemDaAbaDoBanco({ codigo: 'A', custo: null, medida_barra_m: '' })).toEqual({ codigo: 'A', descricao: null, cor: null, referencia_perfil: null, custo: null, medida_barra_m: null })
        expect(itemDaAbaDoBanco({ codigo: 'A', custo: '0' }).custo).toBe(0)
    })
    it('sem item com cor, não há abas (null); item sem cor fica fora delas', () => {
        expect(perfisPorCor([{ codigo: 'A', descricao: null, cor: null, referencia_perfil: null, custo: 1, medida_barra_m: 6 }])).toBeNull()
        const p = perfisPorCor([
            { codigo: 'A', descricao: null, cor: null, referencia_perfil: 'X', custo: 1, medida_barra_m: 6 },
            { codigo: 'IL4236', descricao: null, cor: 'PRETO LISO', referencia_perfil: 'IL42', custo: 1, medida_barra_m: 6 },
        ])!
        expect(p.abas.map((a) => [a.cor, a.itens.map((i) => i.codigo)])).toEqual([['PRETO LISO', ['IL4236']]])
        expect(p.quadro).toEqual([{ cor: 'PRETO LISO', referencias: 1, semReferencia: 0, itens: 1 }])
    })
    it('os itens da aba saem por referência (a sem referência por último) e depois pelo código', () => {
        const mk = (codigo: string, ref: string | null) => ({ codigo, descricao: null, cor: 'BRANCO', referencia_perfil: ref, custo: 1, medida_barra_m: 6 })
        const p = perfisPorCor([mk('C', null), mk('B', 'KT42'), mk('A', 'IL42'), mk('D', 'IL42')])!
        expect(p.abas[0].itens.map((i) => i.codigo)).toEqual(['A', 'D', 'B', 'C'])
    })
})
