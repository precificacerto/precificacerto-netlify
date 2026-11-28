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
import { faltasPorCor, itemDaAbaDoBanco, perfisPorCor, quadroCorPorReferencias, type ItemDaAba } from '@/utils/atendimentos-ia-abas-por-cor'

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
        // o preço da aba é o da barra inteira: valor_barra_interno = custo, vendido por barra (como no layout único)
        expect(il42).toMatchObject({ vendido_por: 'barra', valor_barra_interno: 58.704, valor_metro_interno: null })
    })

    it('o cabeçalho aceita CÓDIGO no lugar de CÓDIGO DO FORNECEDOR, e as colunas fora das cinco (a origem da referência) são ignoradas', async () => {
        const r = await ler(ABAS, CORES, ['REFERÊNCIA', 'CÓDIGO', 'DESCRIÇÃO', 'PREÇO', 'BARRA', 'ORIGEM DA REFERÊNCIA'])
        expect(r.ok).toBe(true)
    })

    it('a linha sem o código do fornecedor recusa a importação inteira, nomeando a aba e a linha', async () => {
        const r = await ler({ BRANCO: [['IL42', 'IL421', 'a', 1, 6], ['KT42', null, 'b', 1, 6]] })
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('sem o código do fornecedor')
        expect(erroDe(r)).toContain('aba "BRANCO", linha 3')
    })

    it('o mesmo código do fornecedor em duas abas é recusa nomeada (o código é único na tabela)', async () => {
        const r = await ler({ BRANCO: [['IL42', 'IL421', 'a', 1, 6]], 'PRETO LISO': [['IL42', 'IL421', 'b', 2, 6]] })
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('IL421')
        expect(erroDe(r)).toContain('mais de uma linha')
    })

    it('coluna repetida no cabeçalho de uma aba é recusa nomeada', async () => {
        const r = await ler(ABAS, CORES, ['REFERÊNCIA', 'CÓDIGO DO FORNECEDOR', 'DESCRIÇÃO', 'PREÇO', 'BARRA', 'REFERENCIA'])
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('coluna repetida')
    })

    it('o arquivo com a aba "Tabela Wolff" segue o layout de antes, mesmo que outra aba tenha a coluna REFERÊNCIA', async () => {
        const wb = new ExcelJS.Workbook()
        wb.addWorksheet('Tabela Wolff').getRow(1).getCell(1).value = 'x'
        const aba = wb.addWorksheet('BRANCO')
        CABECALHO.forEach((c, k) => { aba.getRow(1).getCell(k + 1).value = c })
        const r = await lerArquivosDaImportacao({ tabela: { nome: 'x.xlsx', bytes: new Uint8Array(await wb.xlsx.writeBuffer()) }, motor: null, coresDoFornecedor: CORES })
        expect(r.ok).toBe(true)
        expect((r as Lida).layout).toBe('por_posicao')
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
        const mk = (codigo: string, ref: string | null): ItemDaAba => ({ codigo, descricao: null, cor: 'BRANCO', referencia_perfil: ref, custo: 1, medida_barra_m: 6 })
        const p = perfisPorCor([mk('C', null), mk('B', 'KT42'), mk('A', 'IL42'), mk('D', 'IL42')])!
        expect(p.abas[0].itens.map((i) => i.codigo)).toEqual(['A', 'D', 'B', 'C'])
    })
})

describe('0055b — a aba BICOLOR: a cor completa de cada linha vem da coluna COR, conferida contra a lista do fornecedor', () => {
    const CAB_BI = ['REFERÊNCIA', 'CÓDIGO DO FORNECEDOR', 'DESCRIÇÃO', 'PREÇO', 'BARRA', 'COR']
    const bi = (linhas: Array<[string, string, string, number, number, string | null]>) => ({ BICOLOR: linhas as unknown as Linha[] })
    const CORES_BI = [...CORES, 'EXTERNO PRETO LISO']

    it('lê a aba BICOLOR: cada item leva a cor da COLUNA, e a mesma referência em dois lados são dois itens', async () => {
        const r = await ler({ ...ABAS, ...bi([['BR60', '94738', 'BR60 LADO MAIOR', 254.352, 6, 'EXTERNO PRETO LISO LADO MAIOR'], ['BR60', '94738.1', 'BR60 LADO MENOR', 254.352, 6, 'EXTERNO PRETO LISO LADO MENOR']]) }, CORES_BI, CAB_BI)
        expect(r.ok).toBe(true)
        const l = r as Lida
        expect(l.itens.filter((i) => i.codigo_wvetro === 'BR60').map((i) => [i.codigo, i.cor])).toEqual([['94738', 'EXTERNO PRETO LISO LADO MAIOR'], ['94738.1', 'EXTERNO PRETO LISO LADO MENOR']])
        expect(referenciasDaCategoria(l, 'PERFIL')).toBeNull()
    })
    it('aceita a cor com os dois lados ("A LADO MAIOR / B LADO MENOR"), cada parte conferida na lista', async () => {
        const r = await ler(bi([['BR60', '94799', 'x', 1, 6, 'PRETO LISO LADO MAIOR / BRANCO LADO MENOR']]), CORES_BI, CAB_BI)
        expect(r.ok).toBe(true)
        expect((r as Lida).itens[0].cor).toBe('PRETO LISO LADO MAIOR / BRANCO LADO MENOR')
    })
    it('cor fora da lista, ou sem LADO MAIOR/MENOR, recusa a importação inteira nomeando a linha', async () => {
        const a = await ler(bi([['BR60', '94738', 'x', 1, 6, 'AZUL BEBE LADO MAIOR']]), CORES_BI, CAB_BI)
        expect(a.ok).toBe(false)
        expect(erroDe(a)).toContain('AZUL BEBE LADO MAIOR')
        expect(erroDe(a)).toContain('linha 2')
        const b = await ler(bi([['BR60', '94738', 'x', 1, 6, 'PRETO LISO']]), CORES_BI, CAB_BI)
        expect(b.ok).toBe(false)
        expect(erroDe(b)).toContain('LADO MAIOR')
    })
    it('linha da BICOLOR sem a COR recusa; aba BICOLOR sem a coluna COR recusa', async () => {
        const a = await ler(bi([['BR60', '94738', 'x', 1, 6, null]]), CORES_BI, CAB_BI)
        expect(a.ok).toBe(false)
        expect(erroDe(a)).toContain('sem a cor')
        const b = await ler(bi([['BR60', '94738', 'x', 1, 6, 'EXTERNO PRETO LISO LADO MAIOR']]), CORES_BI, CABECALHO)
        expect(b.ok).toBe(false)
        expect(erroDe(b)).toContain('COR')
    })
    it('a COR numa aba de cor comum NÃO vale: a cor é a da aba', async () => {
        const r = await ler({ BRANCO: [['IL42', 'IL421', 'a', 1, 6, 'PRETO LISO'] as unknown as Linha] }, CORES, ['REFERÊNCIA', 'CÓDIGO DO FORNECEDOR', 'DESCRIÇÃO', 'PREÇO', 'BARRA', 'COR'])
        expect(r.ok).toBe(true)
        expect((r as Lida).itens[0].cor).toBe('BRANCO')
    })
    it('o item sem sufixo de cor entra com a referência = o próprio código (a conversão põe assim; o leitor só lê)', async () => {
        const r = await ler({ BRANCO: [['9921', '9921', 'BAGUETE DE 10MM - BRANCO', 25.3008, 6]] })
        expect(r.ok).toBe(true)
        const l = r as Lida
        expect(referenciasDaCategoria(l, 'PERFIL')).toBeNull()
        expect(l.itens[0]).toMatchObject({ codigo: '9921', referencia_perfil: '9921', codigo_wvetro: null, cor: 'BRANCO' })
    })
})
