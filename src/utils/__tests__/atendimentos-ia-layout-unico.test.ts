/**
 * @jest-environment node
 *
 * PORTÃO — o LAYOUT ÚNICO da tabela de fornecedor (dono do produto, 02/11/2026): aba CABECALHO + aba ITENS, cabeçalho na linha 1, as 28
 * colunas lidas POR NOME. O layout de antes (aba pelo nome, colunas por posição) continua valendo, e o caminho é escolhido pela forma do arquivo.
 *
 * A fixture principal é o arquivo de PERSIANAS da Wolff, como o dono do produto o mediu em 02/11/2026: CABECALHO (PERSIANAS, Wolff, 2026-11-02,
 * regime e uf vazios, BRL) e 76 itens, TODOS com custo_bruto, vendido_por barra e unidade, ICMS 12 e PIS/COFINS 9,25 em todos, credito_pct = 21,25
 * em TODAS as linhas, e o IPI creditável assim: 38 linhas com 6,5 (caixas e guias), 4 com 3,25 (persianas de PVC), 8 com 0, 26 vazio (nc_ipi_pct
 * também vazio). Pela CASCATA de 09/11/2026 (ICMS sobre o bruto, PIS/COFINS sobre o saldo — 12 + 9,25 dá 20,14% efetivo, não 21,25 —, o IPI
 * creditável sobre o bruto; o IPI vai pelo par), o teste espera EXATAMENTE: 50 divergências (26,64, 23,39 ou 20,14 contra 21,25), 26 "não
 * recalculável" nomeando o IPI, nenhuma sem aviso — e NENHUM valor sobrescrito: grava o que veio. (Pela soma do #208 eram 42, 26 e 8.)
 * A segunda fixture é o Reforço: 18 itens, 8 sem custo_bruto, que entram com o custo em branco e um aviso.
 *
 * As planilhas são MONTADAS aqui com o exceljs (os arquivos reais não estão no repositório), com valores que distinguem o certo do errado.
 */
import ExcelJS from 'exceljs'

import {
    ABAS_DA_IMPORTACAO, ABAS_DO_LAYOUT_UNICO, CAMPOS_DO_CABECALHO_UNICO, COLUNA_DA_CATEGORIA_DO_FORNECEDOR, COLUNAS_DO_LAYOUT_UNICO,
    COLUNAS_SEM_DESTINO_DO_LAYOUT_UNICO,
    FRASE_DO_CABECALHO_DOS_ITENS_NAO_RECONHECIVEL, lerArquivosDaImportacao, montarPayloadDaImportacao,
    type Aviso, type ColunaDoLayoutUnico, type ResultadoDaLeitura,
} from '@/utils/atendimentos-ia-importacao'
import { COLUNAS_DO_BLOCO_TRIBUTARIO } from '@/utils/atendimentos-ia-bloco-tributario'

type Celulas = Record<number, ExcelJS.CellValue>
type Lida = Extract<ResultadoDaLeitura, { ok: true }>
type Linha = Partial<Record<ColunaDoLayoutUnico, ExcelJS.CellValue>>

/** Um arquivo: cada aba é uma lista de linhas (célula por coluna 1-based). */
async function bytes(abas: Record<string, Array<Celulas | null>>): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((celulas, i) => { if (celulas) for (const [col, valor] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(col)).value = valor })
    }
    return new Uint8Array(await wb.xlsx.writeBuffer())
}
/** A aba ITENS: o cabeçalho na linha 1 (as 28, ou a lista dada) e uma linha por item, pelo NOME da coluna. */
function abaItens(itens: Linha[], colunas: readonly string[] = COLUNAS_DO_LAYOUT_UNICO): Celulas[] {
    const indice = (nome: string) => colunas.indexOf(nome) + 1
    return [
        Object.fromEntries(colunas.map((c, k) => [k + 1, c])),
        ...itens.map((it) => Object.fromEntries(Object.entries(it).filter(([c]) => indice(c) > 0).map(([c, v]) => [indice(c), v]))),
    ]
}
/** A aba CABECALHO na forma "nomes na linha 1, valores na linha 2". */
const abaCabecalho = (valores: Partial<Record<(typeof CAMPOS_DO_CABECALHO_UNICO)[number], ExcelJS.CellValue>>): Celulas[] => [
    Object.fromEntries(CAMPOS_DO_CABECALHO_UNICO.map((c, k) => [k + 1, c])),
    Object.fromEntries(CAMPOS_DO_CABECALHO_UNICO.map((c, k) => [k + 1, valores[c] ?? null])),
]
const ler = async (abas: Record<string, Array<Celulas | null>>, nome = 'Tabela.xlsx') => lerArquivosDaImportacao({ tabela: { nome, bytes: await bytes(abas) }, motor: null })
const lida = async (abas: Record<string, Array<Celulas | null>>) => {
    const r = await ler(abas)
    if (r.ok === false) throw new Error('era para ler: ' + r.erro)
    return r as Lida
}
const erroDe = (r: ResultadoDaLeitura) => (r.ok ? '' : (r as { erro: string }).erro)
const avisosDo = <T extends Aviso['tipo']>(r: { avisos: Aviso[] }, tipo: T) => r.avisos.filter((a): a is Extract<Aviso, { tipo: T }> => a.tipo === tipo)
const doBloco = (r: { avisos: Aviso[] }) => r.avisos.filter((a) => a.tipo.startsWith('bloco_tributario'))
const arred = (v: number) => Math.round(v * 10000) / 10000

// ── A fixture de PERSIANAS, como medida pelo dono do produto em 02/11/2026 ──────────────────────────────────────────────────────────────
const CABECALHO_PERSIANAS: Record<(typeof CAMPOS_DO_CABECALHO_UNICO)[number], string | null> = {
    categoria: 'PERSIANAS', fornecedor: 'Wolff', vigencia: '2026-11-02', regime_tributario: null, uf_origem: null, moeda: 'BRL',
}
/** Um item com ICMS 12, PIS/COFINS 9,25, o IPI dado, e o RESULTADO do arquivo: 21,25% em todas as linhas, R$ pelo 21,25. */
function persiana(k: number, grupo: 'caixa' | 'guia' | 'pvc' | 'zero' | 'vazio'): Linha {
    const custo = 100 + k * 7.5
    const credito_valor = arred(custo * 0.2125)
    const cred_ipi_pct = grupo === 'caixa' || grupo === 'guia' ? 6.5 : grupo === 'pvc' ? 3.25 : grupo === 'zero' ? 0 : null
    return {
        codigo: `PS-${String(k).padStart(3, '0')}`, descricao: `${grupo.toUpperCase()} ${k}`, secao: 'PERSIANAS', [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Persianas',
        linha: null, cor: null, codigo_wvetro: null, unidade: grupo === 'guia' ? 'MT' : 'PC',
        vendido_por: grupo === 'guia' ? 'barra' : 'unidade', medida_barra_m: grupo === 'guia' ? 6 : null, peso_kg_por_m: grupo === 'guia' ? 0.8 : null,
        multiplo_compra: null, custo_bruto: custo, valor_metro: grupo === 'guia' ? arred(custo / 6) : null, valor_kg: null,
        cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ibs_pct: 0, cred_cbs_pct: 0, cred_ipi_pct,
        nc_ipi_pct: null, nc_icms_st_pct: null, nc_difal_pct: null, nc_is_pct: null, ncm: grupo === 'pvc' ? '3925.30.00' : '7610.10.00',
        credito_pct: 21.25, credito_valor, custo_liquido: arred(custo - credito_valor),
    }
}
/** 76 itens: 20 caixas + 18 guias (6,5), 4 persianas de PVC (3,25), 8 com IPI 0, 26 com o IPI vazio. */
const GRUPOS: Array<'caixa' | 'guia' | 'pvc' | 'zero' | 'vazio'> = [
    ...Array<'caixa'>(20).fill('caixa'), ...Array<'guia'>(18).fill('guia'), ...Array<'pvc'>(4).fill('pvc'), ...Array<'zero'>(8).fill('zero'), ...Array<'vazio'>(26).fill('vazio'),
]
const PERSIANAS = GRUPOS.map((g, k) => persiana(k + 1, g))
const arquivoDePersianas = () => ({ [ABAS_DO_LAYOUT_UNICO.cabecalho]: abaCabecalho(CABECALHO_PERSIANAS), [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(PERSIANAS) })

describe('PERSIANAS da Wolff — o caso completo do layout único', () => {
    it('reconhece o layout único, lê os 76 itens pelo NOME das colunas e devolve a aba CABECALHO como veio', async () => {
        const r = await lida(arquivoDePersianas())
        expect(r.layout).toBe('unico')
        expect(r.cabecalho).toEqual(CABECALHO_PERSIANAS)
        expect(r.itens).toHaveLength(76)
        expect(r.contagens).toEqual({ itens: 76, regras: 0, tipologias: 0, cruzam: 0, nao_cruzam: 0, normalizados: 0 })
        expect(new Set(r.itens.map((i) => i.codigo)).size).toBe(76)
        expect(avisosDo(r, 'codigo_repetido')).toEqual([])
    })

    it('o mapa: custo_bruto → custo, valor_metro → valor_metro_interno, peso_kg_por_m → peso, a categoria do fornecedor → a coluna dela; o resto NULL', async () => {
        const r = await lida(arquivoDePersianas())
        const guia = r.itens.find((i) => i.codigo === 'PS-021')!
        expect(guia).toMatchObject({
            descricao: 'GUIA 21', secao: 'PERSIANAS', [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Persianas', unidade: 'MT', vendido_por: 'barra', medida_barra_m: 6, peso: 0.8,
            custo: 257.5, valor_metro_interno: arred(257.5 / 6), ncm: '7610.10.00',
            cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ibs_pct: 0, cred_cbs_pct: 0, cred_ipi_pct: 6.5,
            nc_ipi_pct: null, nc_icms_st_pct: null, nc_difal_pct: null, nc_is_pct: null,
            // sem coluna no layout: a alíquota do rótulo, o ipi antigo, o pacote e as de 12%
            aliquota_interna_pct: null, ipi: null, pacote: null, valor_metro_12: null, valor_barra_12: null,
        })
        // a categoria da TABELA não vem do arquivo: só a coluna `orcamentista_tabela_item.segmento` do item
        expect(Object.keys(guia)).not.toContain('categoria')
    })

    it('valor_barra_interno = custo_bruto quando vendido_por é barra (o mesmo número); nos de unidade, NULL, e UM aviso nomeando a tabela sem valor por barra', async () => {
        const r = await lida(arquivoDePersianas())
        const guias = r.itens.filter((i) => i.vendido_por === 'barra')
        const unidades = r.itens.filter((i) => i.vendido_por === 'unidade')
        expect([guias.length, unidades.length]).toEqual([18, 58])
        for (const g of guias) expect(g.valor_barra_interno).toBe(g.custo)
        // nunca valor_metro × medida_barra_m: a guia tem os dois, e o valor da barra é o custo, não o produto
        expect(guias[0].valor_barra_interno).not.toBe(arred((guias[0].valor_metro_interno as number) * 6))
        for (const u of unidades) expect(u.valor_barra_interno).toBeNull()
        const a = avisosDo(r, 'tabela_sem_valor_por_barra')
        expect(a).toHaveLength(1)
        expect(a[0].itens).toBe(58)
        expect(a[0].codigos).toEqual(unidades.map((u) => u.codigo))
        expect(a[0].mensagem).toContain('58 itens não são vendidos por barra')
        expect(avisosDo(r, 'itens_sem_custo')).toEqual([])
    })

    it('o bloco tributário pela cascata: 50 divergências (26,64, 23,39 ou 20,14 contra 21,25), 26 não recalculáveis nomeando o IPI — e NENHUM valor sobrescrito', async () => {
        const r = await lida(arquivoDePersianas())
        const divergentes = avisosDo(r, 'bloco_tributario_divergente')
        const naoRecalculaveis = avisosDo(r, 'bloco_tributario_nao_recalculavel')
        expect([divergentes.length, naoRecalculaveis.length, doBloco(r).length]).toEqual([50, 26, 76])
        // quem diverge: as 38 de 6,5, as 4 de 3,25 e as 8 de 0 — nas três colunas do resultado, com o recalculado da cascata (20,14 + o IPI)
        const porCodigo = new Map(r.itens.map((i) => [i.codigo, i]))
        for (const d of divergentes) {
            const it = porCodigo.get(d.codigo)!
            const esperado = it.cred_ipi_pct === 6.5 ? 26.64 : it.cred_ipi_pct === 3.25 ? 23.39 : 20.14
            expect([6.5, 3.25, 0]).toContain(it.cred_ipi_pct)
            expect(d.divergencias.map((x) => x.coluna)).toEqual(['credito_pct', 'credito_valor', 'custo_liquido'])
            expect(d.divergencias[0]).toMatchObject({ arquivo: 21.25 })
            expect(d.divergencias[0].calculado).toBeCloseTo(esperado, 10)
        }
        expect(divergentes.filter((d) => porCodigo.get(d.codigo)!.cred_ipi_pct === 6.5)).toHaveLength(38)
        expect(divergentes.filter((d) => porCodigo.get(d.codigo)!.cred_ipi_pct === 3.25)).toHaveLength(4)
        expect(divergentes.filter((d) => porCodigo.get(d.codigo)!.cred_ipi_pct === 0)).toHaveLength(8)
        // quem não recalcula: as 26 sem IPI de lado nenhum
        for (const n of naoRecalculaveis) {
            expect(porCodigo.get(n.codigo)).toMatchObject({ cred_ipi_pct: null, nc_ipi_pct: null })
            expect(n.faltam).toEqual(['cred_ipi_pct (ou nc_ipi_pct, quando o IPI não é creditável)'])
        }
        // as 8 com IPI 0 batiam pela soma (12 + 9,25 + 0 = 21,25) e não batem pela cascata: o crédito de PIS/COFINS é sobre o saldo depois do ICMS
        const zero = r.itens.filter((i) => i.cred_ipi_pct === 0)
        expect(zero).toHaveLength(8)
        const comAviso = new Set(divergentes.map((a) => (a as { codigo: string }).codigo))
        for (const z of zero) expect(comAviso.has(z.codigo)).toBe(true)
        // nenhum valor sobrescrito: as 76 gravam o que veio no arquivo
        for (const i of r.itens) {
            const custo = i.custo as number
            expect(i.credito_pct).toBe(21.25)
            expect(i.credito_valor).toBe(arred(custo * 0.2125))
            expect(i.custo_liquido).toBe(arred(custo - arred(custo * 0.2125)))
        }
    })

    it('as colunas sem destino (linha, cor, codigo_wvetro, valor_kg, multiplo_compra) são exigidas no cabeçalho, não gravadas, e vazias não geram aviso', async () => {
        const r = await lida(arquivoDePersianas())
        expect(avisosDo(r, 'colunas_sem_destino_no_layout_unico')).toEqual([])
        for (const c of COLUNAS_SEM_DESTINO_DO_LAYOUT_UNICO) expect(Object.keys(r.itens[0])).not.toContain(c)
    })

    it('o payload da função leva cada item com as colunas do banco — as 12 do bloco inclusive — e sem as colunas sem destino', async () => {
        const r = await lida(arquivoDePersianas())
        const p = montarPayloadDaImportacao(r, null) as { itens: Array<Record<string, unknown>> }
        expect(p.itens).toHaveLength(76)
        for (const c of COLUNAS_DO_BLOCO_TRIBUTARIO) expect(c in p.itens[0]).toBe(true)
        for (const c of ['custo', 'valor_metro_interno', 'valor_barra_interno', 'peso', COLUNA_DA_CATEGORIA_DO_FORNECEDOR, 'aliquota_interna_pct']) expect(c in p.itens[0]).toBe(true)
        for (const c of ['custo_bruto', 'valor_metro', 'peso_kg_por_m', ...COLUNAS_SEM_DESTINO_DO_LAYOUT_UNICO]) expect(c in p.itens[0]).toBe(false)
    })
})

// ── A fixture de REFORÇO: 18 itens, 8 sem custo_bruto ───────────────────────────────────────────────────────────────────────────────────
/** 18 reforços de aço, por barra; os de índice ímpar até o 16 (8 itens) vêm SEM custo_bruto e sem resultado. Os 10 com preço: IPI não creditável 3,25. */
function reforco(k: number): Linha {
    const semCusto = k % 2 === 1 && k <= 16
    const custo = semCusto ? null : 50 + k * 3.25
    const credito_valor = custo === null ? null : arred(custo * 0.2125)
    return {
        codigo: `RF-${String(k).padStart(2, '0')}`, descricao: `REFORÇO ${k}`, secao: 'REFORÇO METÁLICO', [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Reforço', linha: null, cor: null, codigo_wvetro: null,
        unidade: 'BR', vendido_por: 'barra', medida_barra_m: 6, peso_kg_por_m: 1.2, multiplo_compra: null, custo_bruto: custo, valor_metro: custo === null ? null : arred(custo / 6), valor_kg: null,
        cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ibs_pct: 0, cred_cbs_pct: 0, cred_ipi_pct: null,
        nc_ipi_pct: 3.25, nc_icms_st_pct: null, nc_difal_pct: null, nc_is_pct: null, ncm: '7216.61.00',
        credito_pct: custo === null ? null : 21.25, credito_valor, custo_liquido: custo === null ? null : arred(custo - credito_valor!),
    }
}
const REFORCOS = Array.from({ length: 18 }, (_, k) => reforco(k + 1))
/** A aba CABECALHO na outra forma: um campo por linha (nome na A, valor na B). */
const CABECALHO_REFORCO_POR_LINHA: Celulas[] = [
    { 1: 'categoria', 2: 'REFORCO' }, { 1: 'fornecedor', 2: 'Wolff' }, { 1: 'vigencia', 2: new Date(Date.UTC(2026, 10, 2)) },
    { 1: 'regime_tributario', 2: null }, { 1: 'uf_origem', 2: 'SC' }, { 1: 'moeda', 2: 'BRL' },
]
const arquivoDeReforco = () => ({ [ABAS_DO_LAYOUT_UNICO.cabecalho]: CABECALHO_REFORCO_POR_LINHA, [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(REFORCOS) })

describe('REFORÇO METÁLICO da Wolff — 18 itens, 8 sem custo_bruto', () => {
    it('os 18 entram; os 8 sem custo_bruto ficam com custo NULL (nunca 0), sem valor por barra, e UM aviso os nomeia', async () => {
        const r = await lida(arquivoDeReforco())
        expect(r.itens).toHaveLength(18)
        const semCusto = r.itens.filter((i) => i.custo === null)
        expect(semCusto.map((i) => i.codigo)).toEqual(['RF-01', 'RF-03', 'RF-05', 'RF-07', 'RF-09', 'RF-11', 'RF-13', 'RF-15'])
        for (const i of semCusto) expect([i.valor_barra_interno, i.valor_metro_interno, i.credito_valor, i.custo_liquido]).toEqual([null, null, null, null])
        const a = avisosDo(r, 'itens_sem_custo')
        expect(a).toHaveLength(1)
        expect(a[0]).toMatchObject({ itens: 8, codigos: semCusto.map((i) => i.codigo) })
        expect(a[0].mensagem).toContain('8 itens vieram sem custo_bruto')
        // todos por barra: nenhum aviso de "sem valor por barra"; os com preço têm o valor da barra = custo
        expect(avisosDo(r, 'tabela_sem_valor_por_barra')).toEqual([])
        for (const i of r.itens.filter((x) => x.custo !== null)) expect(i.valor_barra_interno).toBe(i.custo)
    })

    it('pela cascata, os 10 com preço divergem (20,14% de crédito e o IPI não creditável de 3,25 COMPÕE o custo); os 8 sem preço não têm o que conferir', async () => {
        const r = await lida(arquivoDeReforco())
        const divergentes = avisosDo(r, 'bloco_tributario_divergente')
        expect([divergentes.length, doBloco(r).length]).toEqual([10, 10])
        const porCodigo = new Map(r.itens.map((i) => [i.codigo, i]))
        for (const d of divergentes) {
            const custo = porCodigo.get(d.codigo)!.custo as number
            expect(d.divergencias.map((x) => x.coluna)).toEqual(['credito_pct', 'credito_valor', 'custo_liquido'])
            expect(d.divergencias[0].calculado).toBeCloseTo(20.14, 10)
            // bruto − 12% − 9,25% do saldo + 3,25% do bruto
            expect(d.divergencias[2].calculado).toBeCloseTo(custo * (1 - 0.2014 + 0.0325), 10)
        }
        for (const i of r.itens.filter((x) => x.custo !== null)) expect([i.credito_pct, i.nc_ipi_pct, i.cred_ipi_pct]).toEqual([21.25, 3.25, null])
    })

    it('a aba CABECALHO na forma "um campo por linha" também é lida; a data vira aaaa-mm-dd e o vazio fica null', async () => {
        const r = await lida(arquivoDeReforco())
        expect(r.cabecalho).toEqual({ categoria: 'REFORCO', fornecedor: 'Wolff', vigencia: '2026-11-02', regime_tributario: null, uf_origem: 'SC', moeda: 'BRL' })
    })
})

// ── As recusas nomeadas ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('recusas do layout único: nada é gravado e a frase diz o quê', () => {
    it('aba CABECALHO sem a aba ITENS: recusa nomeando as abas encontradas', async () => {
        const r = await ler({ [ABAS_DO_LAYOUT_UNICO.cabecalho]: abaCabecalho(CABECALHO_PERSIANAS), Outra: [{ 1: 'x' }] }, 'Persianas.xlsx')
        expect(r.ok).toBe(false)
        expect(erroDe(r)).toContain('Persianas.xlsx')
        expect(erroDe(r)).toContain('tem a aba "CABECALHO" do layout único, mas não a aba "ITENS". Abas encontradas: "CABECALHO", "Outra".')
    })

    it('aba ITENS sem cabeçalho reconhecível (sem a coluna "codigo" na linha 1): recusa', async () => {
        const r = await ler({ [ABAS_DO_LAYOUT_UNICO.itens]: [{ 1: 'Lista de preços' }, { 1: 'PS-001', 2: 100 }] })
        expect(erroDe(r)).toContain(FRASE_DO_CABECALHO_DOS_ITENS_NAO_RECONHECIVEL)
        expect(FRASE_DO_CABECALHO_DOS_ITENS_NAO_RECONHECIVEL).toContain('a coluna "codigo" não está lá')
    })

    it('coluna obrigatória ausente: recusa nomeando CADA uma que falta — as 28 são obrigatórias, as sem destino inclusive', async () => {
        const sem = COLUNAS_DO_LAYOUT_UNICO.filter((c) => c !== 'ncm' && c !== 'valor_kg' && c !== 'credito_valor')
        const r = await ler({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(PERSIANAS.slice(0, 2), sem) })
        expect(erroDe(r)).toContain('não tem 3 colunas obrigatórias do layout único: valor_kg, ncm, credito_valor. Nada foi gravado.')
    })

    it('o nome tem de ser EXATO: "Codigo" e "CUSTO_BRUTO" não são as colunas, e a recusa as lista como ausentes', async () => {
        const cols = COLUNAS_DO_LAYOUT_UNICO.map((c) => (c === 'custo_bruto' ? 'CUSTO_BRUTO' : c === 'descricao' ? 'Descricao' : c))
        const r = await ler({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(PERSIANAS.slice(0, 2), cols) })
        expect(erroDe(r)).toContain('não tem 2 colunas obrigatórias do layout único: descricao, custo_bruto.')
    })

    it('cabeçalho duplicado: recusa nomeando a coluna repetida', async () => {
        const r = await ler({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(PERSIANAS.slice(0, 2), [...COLUNAS_DO_LAYOUT_UNICO, 'custo_bruto']) })
        expect(erroDe(r)).toContain('tem coluna repetida no cabeçalho (custo_bruto): não sei qual ler. Nada foi gravado.')
    })

    it('texto em coluna numérica (custo_bruto "sob consulta", medida_barra_m "6m"): recusa nomeando linha, coluna e valor — não vira 0 nem NULL', async () => {
        const itens = [{ ...PERSIANAS[0], custo_bruto: 'sob consulta' }, { ...PERSIANAS[1], medida_barra_m: '6m' }, PERSIANAS[2]]
        const r = await ler({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(itens) })
        expect(erroDe(r)).toContain('2 células em coluna numérica que não são números: linha 2, custo_bruto = "sob consulta" (texto); linha 3, medida_barra_m = "6m" (texto).')
        expect(erroDe(r)).toContain('Nada foi gravado.')
    })

    it('o texto numérico brasileiro ("1.234,56") é número, como no resto do importador', async () => {
        const r = await lida({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens([{ ...PERSIANAS[0], custo_bruto: '1.234,56', credito_pct: null, credito_valor: null, custo_liquido: null }]) })
        expect(r.itens[0].custo).toBe(1234.56)
    })

    it('vendido_por fora de "barra"/"unidade" ("metro"): recusa nomeando a linha; a caixa não importa ("BARRA" vale)', async () => {
        const r = await ler({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens([{ ...PERSIANAS[0], vendido_por: 'metro' }]) })
        expect(erroDe(r)).toContain('1 célula de vendido_por fora de "barra" ou "unidade": linha 2 = "metro". Nada foi gravado.')
        const ok = await lida({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens([{ ...PERSIANAS[20], vendido_por: 'BARRA' }]) })
        expect([ok.itens[0].vendido_por, ok.itens[0].valor_barra_interno]).toEqual(['barra', ok.itens[0].custo])
    })

    it('vendido_por vazio é não informado: NULL, sem valor por barra, e entra no aviso', async () => {
        const r = await lida({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens([{ ...PERSIANAS[20], vendido_por: null }]) })
        expect([r.itens[0].vendido_por, r.itens[0].valor_barra_interno]).toEqual([null, null])
        expect(avisosDo(r, 'tabela_sem_valor_por_barra')[0].codigos).toEqual(['PS-021'])
    })

    it('os dois IPIs na mesma linha, e o percentual fora de 0..100: as recusas do #208 valem no layout único', async () => {
        const r = await ler({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens([{ ...PERSIANAS[0], nc_ipi_pct: 5 }, { ...PERSIANAS[1], nc_difal_pct: 101 }]) })
        expect(erroDe(r)).toContain('código PS-001 (linha 2): cred_ipi_pct e nc_ipi_pct preenchidos')
        expect(erroDe(r)).toContain('código PS-002 (linha 3): nc_difal_pct = 101, fora de 0 a 100')
    })
})

describe('o que o layout único avisa e o que ignora', () => {
    it('valor nas colunas sem destino (cor, valor_kg…): o aviso diz a coluna e quantas linhas — e nada delas é gravado', async () => {
        const itens = [{ ...PERSIANAS[0], cor: 'BRANCO', valor_kg: 12.5 }, { ...PERSIANAS[1], cor: 'PRETO' }, PERSIANAS[2]]
        const r = await lida({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(itens) })
        const a = avisosDo(r, 'colunas_sem_destino_no_layout_unico')
        expect(a).toHaveLength(1)
        expect(a[0].colunas).toEqual({ cor: 2, valor_kg: 1 })
        expect(a[0].mensagem).toBe('o arquivo traz valor em colunas que o banco ainda não guarda — cor (2 linhas), valor_kg (1 linha): elas não foram gravadas.')
        expect(Object.keys(r.itens[0])).not.toContain('cor')
    })

    it('sem a aba CABECALHO, o layout único ainda é reconhecido pela ITENS, e o cabeçalho volta com os seis campos null', async () => {
        const r = await lida({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(PERSIANAS.slice(0, 3)) })
        expect(r.layout).toBe('unico')
        expect(r.cabecalho).toEqual({ categoria: null, fornecedor: null, vigencia: null, regime_tributario: null, uf_origem: null, moeda: null })
    })

    it('o nome da aba sem olhar a caixa nem os espaços ("itens ", "Cabecalho"); a linha vazia e a linha sem código são puladas', async () => {
        const r = await lida({ Cabecalho: abaCabecalho(CABECALHO_PERSIANAS), 'itens ': [...abaItens(PERSIANAS.slice(0, 2)), null, { 2: 'sem código' }, ...abaItens(PERSIANAS.slice(2, 3)).slice(1)] })
        expect(r.layout).toBe('unico')
        expect(r.itens.map((i) => i.codigo)).toEqual(['PS-001', 'PS-002', 'PS-003'])
    })

    it('código repetido no layout único: fica a primeira, com o aviso de sempre (a regra de 20/10/2026 vale para os dois layouts)', async () => {
        // a guia é vendida por barra: o custo diferente muda o valor da barra, e o aviso diz em voz alta que os valores NÃO batem
        const guia = PERSIANAS[20]
        const r = await lida({ [ABAS_DO_LAYOUT_UNICO.itens]: abaItens([guia, { ...guia, custo_bruto: 999, credito_valor: null, custo_liquido: null, credito_pct: null }]) })
        expect(r.itens).toHaveLength(1)
        expect(r.itens[0]).toMatchObject({ codigo: 'PS-021', custo: 257.5, valor_barra_interno: 257.5 })
        expect(avisosDo(r, 'codigo_repetido')[0]).toMatchObject({ codigo: 'PS-021', linhas: [2, 3], valores_batem: false })
        expect(avisosDo(r, 'codigo_repetido')[0].mensagem).toContain('VALORES DIFERENTES')
        expect(r.contagens.normalizados).toBe(1)
    })
})

describe('o layout de antes continua valendo', () => {
    const cabecalhoAntigo: Celulas = { 2: 'CÓDIGO', 4: 'DESCRIÇÃO', 13: 'VALOR METRO 18%', 14: 'VALOR METRO 12%', 15: 'VALOR BARRA 18%', 16: 'VALOR BARRA 12%' }
    const itemAntigo: Celulas = { 2: 'A1', 4: 'perfil A1', 5: 6, 6: 'BR', 7: '7604.21.00', 8: 1.2, 9: 5, 10: '10', 11: 'PVC', 12: 50, 13: 10, 14: 9, 15: 60, 16: 54 }

    it('arquivo com a aba "Tabela Wolff" e sem ITENS/CABECALHO: lê por posição, como hoje', async () => {
        const r = await lida({ [ABAS_DA_IMPORTACAO.preco]: [{ 1: 'PERFIS' }, cabecalhoAntigo, itemAntigo] })
        expect(r.layout).toBe('por_posicao')
        expect(r.cabecalho).toBeNull()
        expect(r.itens[0]).toMatchObject({ codigo: 'A1', custo: 50, valor_metro_interno: 10, valor_barra_interno: 60, aliquota_interna_pct: 18, vendido_por: 'barra', ipi: 5, [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'PVC' })
    })

    it('a aba ITENS vence: com as duas abas no mesmo arquivo, o caminho é o layout único', async () => {
        const r = await lida({ [ABAS_DA_IMPORTACAO.preco]: [{ 1: 'PERFIS' }, cabecalhoAntigo, itemAntigo], [ABAS_DO_LAYOUT_UNICO.itens]: abaItens(PERSIANAS.slice(0, 1)) })
        expect(r.layout).toBe('unico')
        expect(r.itens.map((i) => i.codigo)).toEqual(['PS-001'])
    })

    it('nem a aba de antes nem o layout único: a recusa de sempre, e diz que o layout único também não foi achado', async () => {
        const r = await ler({ Planilha1: [{ 1: 'x' }] }, 'Reforco_Metalico_-_Wolff.xlsx')
        expect(erroDe(r)).toContain(`não tem a aba "${ABAS_DA_IMPORTACAO.preco}". Abas encontradas: "Planilha1".`)
        expect(erroDe(r)).toContain('O layout único (abas "CABECALHO" e "ITENS", colunas por nome) também não foi encontrado.')
    })
})
