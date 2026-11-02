/**
 * @jest-environment node
 *
 * PORTÃO — o BLOCO TRIBUTÁRIO do item da tabela de fornecedor (dono do produto, 02/11/2026; migração `20261102000001`).
 *
 * As 12 colunas são lidas PELO CABEÇALHO, com os nomes exatos; o resto do importador continua por posição. Um caso por pedido do dono do produto:
 *   (1) VAZIO → NULL ("o fornecedor não informou"), nunca 0;
 *   (2) ZERO → 0 ("alíquota zero"), nunca NULL — os dois na MESMA linha, para um não se passar pelo outro;
 *   (3) TEXTO numa coluna numérica → erro nomeado (linha, coluna, valor) e a importação inteira é RECUSADA; não vira 0 nem NULL;
 *   (4) DIVERGÊNCIA do líquido → grava o que veio no arquivo E reporta item a item (o arquivo, o recalculado); dentro de 0,01 não diverge;
 *   (5) OS DOIS IPIs preenchidos → recusa nomeando o código, antes de gravar (o banco tem a CHECK por baixo);
 *   (6) arquivo SEM as colunas → importa como hoje, as 12 NULL;
 * e o que as respostas do dono do produto fixaram: o bruto é `custo`, o crédito é a soma do bloco creditável, os não creditáveis não entram,
 * o IPI vai pelo par (creditável OU não creditável) e o resto é exigido — senão o item é "não recalculável", reportado, e grava o que veio.
 */
import ExcelJS from 'exceljs'

import { abasDoSpec } from './fixtures/abas-do-motor-do-spec'
import { ABAS_DA_IMPORTACAO, lerArquivosDaImportacao, montarPayloadDaImportacao, type ResultadoDaLeitura } from '@/utils/atendimentos-ia-importacao'
import { COLUNAS_DO_BLOCO_TRIBUTARIO, blocoVazio, recalcularBloco } from '@/utils/atendimentos-ia-bloco-tributario'

type Celulas = Record<number, ExcelJS.CellValue>
const PRECO = ABAS_DA_IMPORTACAO.preco

async function bytes(linhas: Array<Celulas | null>): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(PRECO)
    linhas.forEach((celulas, i) => { if (celulas) for (const [col, valor] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(col)).value = valor })
    return new Uint8Array(await wb.xlsx.writeBuffer())
}
const ler = async (linhas: Array<Celulas | null>) => lerArquivosDaImportacao({ tabela: { nome: 'Tabela.xlsx', bytes: await bytes(linhas) }, motor: null })
const lida = async (linhas: Array<Celulas | null>) => {
    const r = await ler(linhas)
    if (r.ok === false) throw new Error('era para ler: ' + r.erro)
    return r as Extract<ResultadoDaLeitura, { ok: true }>
}

/** As 12, a partir da coluna 20, na ordem do pedido (o cabeçalho as nomeia; a posição é só a deste arquivo). */
const COL: Record<string, number> = Object.fromEntries(COLUNAS_DO_BLOCO_TRIBUTARIO.map((c, k) => [c, 20 + k]))
const cabecalho = (comBloco = true, extra: Celulas = {}): Celulas => ({
    2: 'CÓDIGO', 4: 'DESCRIÇÃO', 13: 'VALOR METRO 18%', 14: 'VALOR METRO 12%', 15: 'VALOR BARRA 18%', 16: 'VALOR BARRA 12%',
    ...(comBloco ? Object.fromEntries(COLUNAS_DO_BLOCO_TRIBUTARIO.map((c) => [COL[c], c])) : {}), ...extra,
})
/** Um item com `custo` = 200 (coluna 12) e as células do bloco dadas pelo nome. */
const item = (codigo: string, bloco: Partial<Record<string, ExcelJS.CellValue>> = {}): Celulas => ({
    2: codigo, 4: `perfil ${codigo}`, 5: 6, 6: 'BR', 7: '7604.21.00', 8: 1.2, 9: 5, 10: '10', 11: 'PVC', 12: 200, 13: 10, 14: 9, 15: 60, 16: 54,
    ...Object.fromEntries(Object.entries(bloco).map(([c, v]) => [COL[c], v])),
})
/** Um bloco que fecha: 12 + 9,25 + 1 + 0,9 + 5 = 28,15%; 200 × 28,15% = 56,30; líquido 143,70. */
const QUE_FECHA = {
    cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ibs_pct: 1, cred_cbs_pct: 0.9, cred_ipi_pct: 5,
    nc_icms_st_pct: 3.5, nc_difal_pct: 2, nc_is_pct: 1, credito_pct: 28.15, credito_valor: 56.3, custo_liquido: 143.7,
}
const SECAO = { 1: 'PERFIS' }

describe('(1) e (2) VAZIO é NULL e ZERO é 0, na mesma linha', () => {
    it('a célula vazia grava NULL e a célula com 0 grava 0 — nenhuma das duas vira a outra', async () => {
        const r = await lida([SECAO, cabecalho(), item('V1', { cred_icms_pct: 0, cred_pis_cofins_pct: null, nc_difal_pct: 0, nc_is_pct: null })])
        const i = r.itens[0]
        expect([i.cred_icms_pct, i.cred_pis_cofins_pct, i.nc_difal_pct, i.nc_is_pct]).toEqual([0, null, 0, null])
        expect(Object.is(i.cred_icms_pct, 0)).toBe(true)
        // as colunas que a linha não preencheu também são NULL, e as de antes não mudam
        expect(i.credito_pct).toBeNull()
        expect([i.ipi, i.custo]).toEqual([5, 200])
    })

    it('o texto numérico do jeito brasileiro é número ("12,5" → 12,5), como nas outras colunas numéricas do importador', async () => {
        const r = await lida([SECAO, cabecalho(), item('V2', { cred_icms_pct: '12,5', nc_icms_st_pct: '0' })])
        expect([r.itens[0].cred_icms_pct, r.itens[0].nc_icms_st_pct]).toEqual([12.5, 0])
    })
})

describe('(3) TEXTO numa coluna numérica: erro nomeado, a importação inteira é recusada', () => {
    it('"isento" em nc_ipi_pct e "12%" em cred_icms_pct: recusa nomeando linha, coluna e valor de CADA uma — nada vira 0 nem NULL', async () => {
        const r = await ler([SECAO, cabecalho(), item('T1', { nc_ipi_pct: 'isento' }), item('T2', { cred_icms_pct: '12%' }), item('T3')])
        expect(r.ok).toBe(false)
        const erro = (r as { erro: string }).erro
        expect(erro).toContain('linha 3, nc_ipi_pct = "isento" (texto)')
        expect(erro).toContain('linha 4, cred_icms_pct = "12%" (texto)')
        expect(erro).toContain('2 células do bloco tributário que não são números')
        expect(erro).toContain('Nada foi gravado.')
    })

    it('o erro do Excel (#N/A) também é recusa, não NULL', async () => {
        const r = await ler([SECAO, cabecalho(), item('T4', { credito_valor: { error: '#N/A' } as ExcelJS.CellErrorValue })])
        expect(r.ok).toBe(false)
        expect((r as { erro: string }).erro).toContain('linha 3, credito_valor')
    })
})

describe('(4) DIVERGÊNCIA do líquido: grava o que veio e reporta item a item', () => {
    it('o líquido que veio (150) não é o recalculado (143,70): o item grava 150 e o aviso diz os dois números', async () => {
        const r = await lida([SECAO, cabecalho(), item('D1', { ...QUE_FECHA, custo_liquido: 150 }), item('D2', QUE_FECHA)])
        expect(r.itens.map((i) => [i.codigo, i.custo_liquido])).toEqual([['D1', 150], ['D2', 143.7]])
        const avisos = r.avisos.filter((a) => a.tipo === 'bloco_tributario_divergente')
        expect(avisos).toHaveLength(1)
        expect(avisos[0]).toMatchObject({ codigo: 'D1', linha: 3, divergencias: [{ coluna: 'custo_liquido', arquivo: 150 }] })
        const d = (avisos[0] as { divergencias: Array<{ calculado: number }> }).divergencias[0]
        expect(d.calculado).toBeCloseTo(143.7, 10)
        expect(avisos[0].mensagem).toBe('código D1 (linha 3): custo_liquido veio 150 e o recálculo dá 143,7 — gravado o que veio no arquivo')
    })

    it('cada coluna do resultado que diverge entra no MESMO aviso do item; a que bate, não', async () => {
        const r = await lida([SECAO, cabecalho(), item('D3', { ...QUE_FECHA, credito_pct: 30, credito_valor: 60 })])
        const a = r.avisos.find((x) => x.tipo === 'bloco_tributario_divergente') as { divergencias: Array<{ coluna: string }> }
        expect(a.divergencias.map((x) => x.coluna)).toEqual(['credito_pct', 'credito_valor'])
        expect(r.itens[0]).toMatchObject({ credito_pct: 30, credito_valor: 60, custo_liquido: 143.7 })
    })

    it('a diferença de até 0,01 não diverge (o arquivo arredonda); acima, diverge', async () => {
        const dentro = await lida([SECAO, cabecalho(), item('D4', { ...QUE_FECHA, custo_liquido: 143.709 })])
        expect(dentro.avisos.filter((a) => a.tipo === 'bloco_tributario_divergente')).toEqual([])
        // 0,012 acima: diverge com a tolerância de 0,01 (e não diverge com uma de 0,02 — longe do ruído do ponto flutuante dos dois lados)
        const fora = await lida([SECAO, cabecalho(), item('D5', { ...QUE_FECHA, custo_liquido: 143.712 })])
        expect(fora.avisos.filter((a) => a.tipo === 'bloco_tributario_divergente')).toHaveLength(1)
    })

    it('os NÃO creditáveis não entram no líquido: com ICMS-ST, DIFAL e IS diferentes, o recalculado é o mesmo', async () => {
        const r = await lida([SECAO, cabecalho(), item('D6', { ...QUE_FECHA, nc_icms_st_pct: 40, nc_difal_pct: 30, nc_is_pct: 20 })])
        expect(r.avisos.filter((a) => a.tipo.startsWith('bloco_tributario'))).toEqual([])
    })

    it('o IPI NÃO creditável no lugar do creditável: sai do crédito (12 + 9,25 + 1 + 0,9 = 23,15%), e o arquivo que somou o IPI diverge', async () => {
        const semIpi = { ...QUE_FECHA, cred_ipi_pct: null, nc_ipi_pct: 5 }
        const fecha = await lida([SECAO, cabecalho(), item('D7', { ...semIpi, credito_pct: 23.15, credito_valor: 46.3, custo_liquido: 153.7 })])
        expect(fecha.avisos.filter((a) => a.tipo.startsWith('bloco_tributario'))).toEqual([])
        const somou = await lida([SECAO, cabecalho(), item('D8', semIpi)])
        expect((somou.avisos.find((a) => a.tipo === 'bloco_tributario_divergente') as { divergencias: unknown[] }).divergencias).toHaveLength(3)
    })
})

describe('não recalculável: falta dado, o item é reportado e grava o que veio', () => {
    it('sem o IPI de nenhum dos lados: reportado nomeando a falta — nada é preenchido com 0', async () => {
        const r = await lida([SECAO, cabecalho(), item('N1', { ...QUE_FECHA, cred_ipi_pct: null })])
        const a = r.avisos.find((x) => x.tipo === 'bloco_tributario_nao_recalculavel') as { faltam: string[]; mensagem: string }
        expect(a.faltam).toEqual(['cred_ipi_pct (ou nc_ipi_pct, quando o IPI não é creditável)'])
        expect(a.mensagem).toContain('código N1 (linha 3)')
        expect(r.itens[0]).toMatchObject({ cred_ipi_pct: null, credito_pct: 28.15, custo_liquido: 143.7 })
    })

    it('sem o CBS creditável, e sem custo: os dois nomeados', async () => {
        const r = await lida([SECAO, cabecalho(), { ...item('N2', { ...QUE_FECHA, cred_cbs_pct: null }), 12: null }])
        const a = r.avisos.find((x) => x.tipo === 'bloco_tributario_nao_recalculavel') as { faltam: string[] }
        expect(a.faltam).toEqual(['custo', 'cred_cbs_pct'])
    })

    it('sem resultado no arquivo não há o que comparar: nenhum aviso, e o resultado fica NULL (não é preenchido com o calculado)', async () => {
        const r = await lida([SECAO, cabecalho(), item('N3', { ...QUE_FECHA, credito_pct: null, credito_valor: null, custo_liquido: null })])
        expect(r.avisos.filter((a) => a.tipo.startsWith('bloco_tributario'))).toEqual([])
        expect([r.itens[0].credito_pct, r.itens[0].credito_valor, r.itens[0].custo_liquido]).toEqual([null, null, null])
    })
})

describe('(5) OS DOIS IPIs preenchidos: recusa nomeando o item, antes de gravar', () => {
    it('cred_ipi_pct e nc_ipi_pct na mesma linha: recusa com o código e a linha', async () => {
        const r = await ler([SECAO, cabecalho(), item('I1', QUE_FECHA), item('I2', { ...QUE_FECHA, nc_ipi_pct: 5 })])
        expect(r.ok).toBe(false)
        expect((r as { erro: string }).erro).toContain('código I2 (linha 4): cred_ipi_pct e nc_ipi_pct preenchidos')
    })

    it('o 0 conta como preenchido: cred_ipi_pct 0 e nc_ipi_pct 5 também é recusa', async () => {
        const r = await ler([SECAO, cabecalho(), item('I3', { cred_ipi_pct: 0, nc_ipi_pct: 5 })])
        expect(r.ok).toBe(false)
    })

    it('o percentual fora de 0 a 100 também é recusado antes de gravar, nomeando a coluna', async () => {
        const r = await ler([SECAO, cabecalho(), item('I4', { nc_difal_pct: 101 })])
        expect((r as { erro: string }).erro).toContain('código I4 (linha 3): nc_difal_pct = 101, fora de 0 a 100')
        // credito_valor e custo_liquido são R$: sem faixa
        expect((await ler([SECAO, cabecalho(), item('I5', { credito_valor: 5000, custo_liquido: -3 })])).ok).toBe(true)
    })
})

describe('a tabela COM motor passa pelas mesmas recusas', () => {
    it('com o arquivo do motor junto, o texto no bloco também recusa a importação inteira', async () => {
        const wb = new ExcelJS.Workbook()
        const linhas: Record<string, Celulas[]> = {
            [ABAS_DA_IMPORTACAO.motor]: [{ 1: 'CÓDIGO', 14: 'TIPOLOGIAS' }, { 1: 'M1', 2: 'corte', 3: 'PVC', 4: 'BRANCO', 5: 'W1', 6: 'EUROPA 42', 14: 'JC2F' }],
            [ABAS_DA_IMPORTACAO.formulasDaLinha]: [{ 1: 'LINHA', 2: 'VARIÁVEL' }],
            ...(abasDoSpec() as Record<string, Celulas[]>),
        }
        for (const [nome, ls] of Object.entries(linhas)) {
            const ws = wb.addWorksheet(nome)
            ls.forEach((celulas, i) => { if (celulas) for (const [col, valor] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(col)).value = valor })
        }
        const motor = { nome: 'Motor.xlsx', bytes: new Uint8Array(await wb.xlsx.writeBuffer()) }
        const tabela = async (bloco: Partial<Record<string, ExcelJS.CellValue>>) => ({ nome: 'Tabela.xlsx', bytes: await bytes([SECAO, cabecalho(), item('M1', bloco)]) })
        expect((await lerArquivosDaImportacao({ tabela: await tabela(QUE_FECHA), motor })).ok).toBe(true)
        const r = await lerArquivosDaImportacao({ tabela: await tabela({ ...QUE_FECHA, cred_ibs_pct: 'n/d' }), motor })
        expect(r.ok).toBe(false)
        expect((r as { erro: string }).erro).toContain('linha 3, cred_ibs_pct = "n/d" (texto)')
    })
})

describe('(6) o arquivo SEM as colunas importa como hoje', () => {
    it('as 12 ficam NULL, nenhum aviso do bloco, e o item de antes é igual', async () => {
        const r = await lida([SECAO, cabecalho(false), item('S1')])
        for (const c of COLUNAS_DO_BLOCO_TRIBUTARIO) expect(r.itens[0][c]).toBeNull()
        expect(r.avisos.filter((a) => a.tipo.startsWith('bloco_tributario'))).toEqual([])
        expect(r.itens[0]).toMatchObject({ codigo: 'S1', ipi: 5, custo: 200, valor_metro_interno: 10, valor_barra_interno: 60 })
    })

    it('o nome tem de ser EXATO: "CRED_ICMS_PCT" (outra caixa) não é a coluna — fica NULL', async () => {
        const r = await lida([SECAO, cabecalho(false, { 20: 'CRED_ICMS_PCT' }), item('S2', { cred_icms_pct: 12 })])
        expect(r.itens[0].cred_icms_pct).toBeNull()
    })

    it('a seção sem as colunas, depois de uma com elas: os itens dela ficam NULL (o cabeçalho é por seção)', async () => {
        const r = await lida([SECAO, cabecalho(), item('S3', QUE_FECHA), { 1: 'OUTRA' }, cabecalho(false), item('S4', QUE_FECHA)])
        expect(r.itens.map((i) => [i.codigo, i.cred_icms_pct])).toEqual([['S3', 12], ['S4', null]])
    })

    it('a mesma coluna duas vezes no mesmo cabeçalho é ambígua: recusa', async () => {
        const r = await ler([SECAO, cabecalho(true, { 40: 'cred_icms_pct' }), item('S5', QUE_FECHA)])
        expect((r as { erro: string }).erro).toContain('coluna do bloco tributário repetida no mesmo cabeçalho (linha 2: cred_icms_pct)')
    })
})

describe('o payload da função leva as 12 chaves, com null onde o arquivo não informou', () => {
    it('cada item do payload tem as 12 chaves — a função de antes as ignoraria (por isso a migração antes do merge)', async () => {
        const r = await lida([SECAO, cabecalho(), item('P1', { cred_icms_pct: 0 })])
        const p = montarPayloadDaImportacao(r, null) as { itens: Array<Record<string, unknown>> }
        expect(COLUNAS_DO_BLOCO_TRIBUTARIO.every((c) => c in p.itens[0])).toBe(true)
        expect([p.itens[0].cred_icms_pct, p.itens[0].nc_ipi_pct]).toEqual([0, null])
    })
})

describe('recalcularBloco, a conta', () => {
    it('bruto 200, crédito 28,15% → 56,30 e líquido 143,70; os não creditáveis não mudam nada', () => {
        const b = { ...blocoVazio(), ...QUE_FECHA }
        const r = recalcularBloco(200, b)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.credito_pct).toBeCloseTo(28.15, 10)
        expect(r.credito_valor).toBeCloseTo(56.3, 10)
        expect(r.custo_liquido).toBeCloseTo(143.7, 10)
        expect(recalcularBloco(200, { ...b, nc_icms_st_pct: 99 })).toEqual(r)
    })

    it('com o 0 informado, recalcula (0 é alíquota); com NULL, não', () => {
        const b = { ...blocoVazio(), cred_icms_pct: 0, cred_pis_cofins_pct: 0, cred_ibs_pct: 0, cred_cbs_pct: 0, cred_ipi_pct: 0 }
        expect(recalcularBloco(100, b)).toEqual({ ok: true, credito_pct: 0, credito_valor: 0, custo_liquido: 100 })
        expect(recalcularBloco(100, { ...b, cred_ibs_pct: null })).toEqual({ ok: false, faltam: ['cred_ibs_pct'] })
    })
})
