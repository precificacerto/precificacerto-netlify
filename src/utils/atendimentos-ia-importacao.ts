/**
 * Atendimentos I.A. — o LEITOR da importação: os bytes da tabela de preço e do motor de um
 * fornecedor viram as linhas prontas para gravar nas tabelas da `20261020000001`, com as
 * contagens e os avisos de `orcamentista_importacao`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Função PURA sobre os bytes: não lê Storage, não grava banco. Quem baixa os arquivos e grava é
 * a rota (bloco seguinte). Biblioteca: `exceljs`, que já é dependência — o `xlsx` do SheetJS tem
 * alerta alto sem correção e é só de desenvolvimento (decisão do dono do produto, 20/10/2026).
 *
 * O MAPA DAS COLUNAS é o medido pela sessão de verificação nos arquivos reais da Wolff
 * (20/10/2026), em `ABAS_DA_IMPORTACAO` e nos `COL_*` abaixo.
 *
 * ══ LIMITE CONHECIDO: O LEITOR CONHECE AS ABAS DA WOLFF, E SÓ ELAS (dono do produto, 20/10/2026) ══
 * Os nomes das abas e as posições das colunas são os da Wolff. Um fornecedor com abas de outro
 * nome é RECUSADO com o nome esperado e os encontrados — nunca lido pela aba errada. Atender
 * outro fornecedor vai precisar de um MAPA POR FORNECEDOR, que NÃO foi construído: decisão de
 * não construí-lo agora.
 *
 * O CABEÇALHO: no motor e nas fórmulas da linha é a PRIMEIRA linha da aba (medido pelo dono do produto). Na
 * aba de preço NÃO vale essa regra: lá o cabeçalho se repete, uma vez por seção, e se reconhece
 * pela palavra "CÓDIGO" na coluna 2.
 *
 * O TÍTULO DA SEÇÃO é a linha logo ACIMA de cada cabeçalho da aba de preço: ela vira `secao` dos
 * itens seguintes e NÃO vira item. A regra é DELIBERADA e foi CONFIRMADA contra o arquivo real
 * pela sessão de verificação (20/10/2026): a aba tem 25 cabeçalhos, e em 20 deles a linha de cima
 * traz o título escrito NA COLUNA DO CÓDIGO ("PERFIS DE ALUMINIO", "ITENS MARRONS", "TABELA PERFIS
 * LAMINADOS - PRETO JET BLACK"…), sem valor nenhum. Por isso a aba tem 755 linhas com algo na
 * coluna do código e 735 produtos: 755 = 735 + 20 títulos. O número esperado de itens é 735 — o
 * "755" que circulou como esperado estava errado. Os 733 da primeira importação são 735 − 2, os
 * dois pares que a regra antiga do separador juntava (ver `normalizarCodigo`). Na mesma medição,
 * uma única linha tinha conteúdo com a coluna do código vazia (linha 57), e linha sem código não
 * vira item.
 *
 * A COLUNA 11 DO PREÇO E A 3 DO MOTOR vão para a coluna do banco que guarda o valor como veio do
 * arquivo do fornecedor (`orcamentista_tabela_item.segmento` e
 * `orcamentista_motor_regra.segmento`). O nome dessa chave é declarado UMA vez, em
 * `COLUNA_DA_CATEGORIA_DO_FORNECEDOR`, e todo o resto usa a constante — a declaração é a exceção
 * nominal do portão de vocabulário, e a palavra solta continua proibida na área (EPIC §11).
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-importacao-leitor.test.ts`.
 */
import ExcelJS from 'exceljs'

import { arquivoImportavel, fraseDoArquivo, fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'
import { ABAS_DO_MOTOR, lerAbasDoMotor, type LinhaDoBanco } from '@/utils/atendimentos-ia-abas-do-motor'
import { lerTemposDoDetalhe, type TempoLido } from '@/utils/atendimentos-ia-tempos-do-motor'

// A declaração mora em `atendimentos-ia-importacao-celula.ts` (módulo leve, sem o `exceljs`), para a camada de
// dados (`repositorio.ts`) ler a coluna sem carregar o leitor; daqui ela segue exportada como sempre.
import { COLUNA_DA_CATEGORIA_DO_FORNECEDOR } from '@/utils/atendimentos-ia-importacao-celula'
export { COLUNA_DA_CATEGORIA_DO_FORNECEDOR }

/** A chave da categoria do fornecedor, pela constante. */
type CategoriaDoFornecedor = { [K in typeof COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: string | null }

// ── O mapa medido ──────────────────────────────────────────────────────────────────────────
export const ABAS_DA_IMPORTACAO = {
    /** No arquivo da TABELA. */
    preco: 'Tabela Wolff',
    /** No arquivo do MOTOR. */
    motor: 'Motor por barra',
    /**
     * As fórmulas da LINHA do motor (EUROPA 42, EUROPA 60). O NOME DA ABA é o do arquivo do fornecedor,
     * e por isso diz "família"; no nosso vocabulário isto é a LINHA — a FAMÍLIA é a da tabela do fornecedor
     * (PVC, ...), `orcamentista_tabela.familia` (dono do produto, 26/10/2026).
     */
    formulasDaLinha: 'Fórmulas da família',
    /** NÃO é lida: os 185 códigos dela já estão na aba de preço (medição de 20/10/2026). */
    semUso: 'Sem uso no motor',
} as const

/** Aba de preço — colunas do exceljs, 1-based. */
const COL_PRECO = {
    codigo: 2, descricao: 4, medida_barra_m: 5, unidade: 6, ncm: 7, peso: 8, ipi: 9, pacote: 10,
    categoria_do_arquivo: 11, custo: 12,
    valor_metro_interno: 13, valor_metro_12: 14, valor_barra_interno: 15, valor_barra_12: 16,
} as const

/**
 * Aba do motor. A coluna 13 ("nº tipologias") NÃO é lida: ela se deriva da 14.
 * A PRIMEIRA linha da aba é o cabeçalho, e é pulada.
 */
const COL_MOTOR = {
    codigo: 1, descricao: 2, categoria_do_arquivo: 3, cor: 4, codigo_wvetro: 5, linha: 6, tipo: 7, eixo: 8, corte: 9,
    formula_medida: 10, formula_em_lh: 11, formula_qtde: 12, tipologias: 14, condicao: 15, obs: 16,
} as const

/** Aba das fórmulas da linha. A PRIMEIRA linha da aba é o cabeçalho, e é pulada. */
const COL_FORMULAS_DA_LINHA = { linha_original: 1, variavel: 2, descricao: 3, formula: 4, formula_em_lh: 5, pct_padrao: 7 } as const

// ── O que sai ──────────────────────────────────────────────────────────────────────────────
/**
 * Uma linha de `orcamentista_tabela_item`, sem `id` e `tabela_id`. A categoria vem em `CategoriaDoFornecedor`; as 12 colunas do bloco tributário
 * (`20261102000001`), em `BlocoTributario` — NULL quando o arquivo (ou a seção) não as traz.
 */
export type ItemLido = CategoriaDoFornecedor & BlocoTributario & {
    codigo: string
    descricao: string | null
    medida_barra_m: number | null
    unidade: string | null
    ncm: string | null
    peso: number | null
    ipi: number | null
    pacote: string | null
    custo: number | null
    /** O TÍTULO acima do cabeçalho da seção. NULL = linha antes de qualquer seção. */
    secao: string | null
    /** 17 ou 18, lida dos rótulos das colunas 13 e 15 do cabeçalho da seção. */
    aliquota_interna_pct: number | null
    vendido_por: 'barra' | 'unidade' | null
    valor_metro_interno: number | null
    valor_barra_interno: number | null
    valor_metro_12: number | null
    valor_barra_12: number | null
}

/** Uma linha de `orcamentista_motor_regra`, sem `id` e `tabela_id`. A categoria vem em `CategoriaDoFornecedor`. */
export type RegraLida = CategoriaDoFornecedor & {
    codigo: string
    descricao: string | null
    cor: string | null
    codigo_wvetro: string | null
    linha: string | null
    tipo: string | null
    eixo: string | null
    corte: string | null
    formula_medida: string | null
    formula_em_lh: string | null
    formula_qtde: string | null
    condicao: string | null
    obs: string | null
    tipologias: string[]
}

/** Uma linha de `orcamentista_motor_tipologia`, sem `id` e `tabela_id`. */
export interface TipologiaLida {
    tipologia: string
    linha: string | null
    n_regras: number
    n_condicionais: number
    /** As variáveis das condições das regras desta tipologia — ver `variaveisDasCondicoes`. */
    variaveis: string[]
}

/** Uma linha de `orcamentista_motor_formula_familia`, sem `id` e `tabela_id`. */
export interface FormulaLida {
    linha: string | null
    linha_original: string | null
    variavel: string | null
    descricao: string | null
    formula: string | null
    formula_em_lh: string | null
    pct_padrao: number | null
}

export type Aviso =
    | { tipo: 'celula_com_erro'; aba: string; linha: number; coluna: number; mensagem: string }
    | { tipo: 'celula_nao_numerica'; aba: string; linha: number; coluna: number; mensagem: string }
    | { tipo: 'codigo_normalizado'; aba: string; linha: number; antes: string; depois: string; mensagem: string }
    | { tipo: 'codigo_repetido'; aba: string; codigo: string; linhas: [number, number]; secoes: [string | null, string | null]; valores_batem: boolean; mensagem: string }
    | { tipo: 'aliquota_divergente_no_cabecalho'; aba: string; linha: number; mensagem: string }
    | { tipo: 'codigo_do_motor_sem_preco'; codigos: string[]; mensagem: string }
    | { tipo: 'tipologia_em_mais_de_uma_linha'; tipologia: string; linhas: string[]; mensagem: string }
    | { tipo: 'tipologia_condicional_sem_variavel'; tipologia: string; n_condicionais: number; exemplo: string; mensagem: string }
    | { tipo: 'itens_sem_categoria_do_fornecedor'; itens: number; mensagem: string }
    | { tipo: 'tabela_sem_categoria_declarada'; mensagem: string }
    // o bloco tributário (dono do produto, 02/11/2026): o recálculo que diverge do arquivo, item a item, e o que não pôde ser recalculado
    | { tipo: 'bloco_tributario_divergente'; aba: string; codigo: string; linha: number; divergencias: DivergenciaDoBloco[]; mensagem: string }
    | { tipo: 'bloco_tributario_nao_recalculavel'; aba: string; codigo: string; linha: number; faltam: string[]; mensagem: string }
    // o layout único (dono do produto, 02/11/2026): o item sem custo_bruto, a tabela sem valor por barra, e as colunas que o banco não guarda
    | { tipo: 'itens_sem_custo'; aba: string; itens: number; codigos: string[]; mensagem: string }
    | { tipo: 'tabela_sem_valor_por_barra'; aba: string; itens: number; codigos: string[]; mensagem: string }
    | { tipo: 'colunas_sem_destino_no_layout_unico'; aba: string; colunas: Record<string, number>; mensagem: string }

export interface Contagens {
    itens: number
    regras: number
    tipologias: number
    cruzam: number
    nao_cruzam: number
    normalizados: number
}

export type ResultadoDaLeitura =
    | {
        ok: true; itens: ItemLido[]; regras: RegraLida[]; tipologias: TipologiaLida[]; formulas: FormulaLida[]; contagens: Contagens; avisos: Aviso[]
        /** As nove abas por tipologia (`ABAS_DO_MOTOR`), pela chave do payload. */
        abas: Record<string, LinhaDoBanco[]>
        /** Como a tabela de preço foi lida: o layout único (abas CABECALHO + ITENS, colunas por nome) ou o de antes (aba pelo nome, colunas por posição). */
        layout: LayoutDaTabela
        /** Os seis campos da aba CABECALHO do layout único, só lidos e devolvidos (dono do produto, 02/11/2026); null no layout de antes. */
        cabecalho: CabecalhoDoLayoutUnico | null
    }
    | { ok: false; erro: string }

export interface ArquivoDaImportacao { nome: string; bytes: Uint8Array }

// ── O conversor ÚNICO de célula: mora em `atendimentos-ia-importacao-celula.ts` ─────────────────
import { valorDaCelula, type ValorLido } from '@/utils/atendimentos-ia-importacao-celula'
import {
    COLUNAS_DO_BLOCO_TRIBUTARIO, blocoVazio, divergenciasDoBloco, foraDaRegraDoBloco, fraseDaDivergenciaDoBloco, fraseDasCelulasInvalidasDoBloco,
    fraseDoBlocoNaoRecalculavel, fraseDosItensForaDaRegraDoBloco, recalcularBloco,
    type BlocoTributario, type CelulaInvalidaDoBloco, type ColunaDoBlocoTributario, type DivergenciaDoBloco, type ItemForaDaRegraDoBloco,
} from '@/utils/atendimentos-ia-bloco-tributario'
export { valorDaCelula, type ValorLido }

// ── Normalizações ──────────────────────────────────────────────────────────────────────────
/**
 * O SEPARADOR DO CÓDIGO DISTINGUE PRODUTO, e NÃO sai. Regra do dono do produto, 20/10/2026, que
 * derruba a dele mesmo do mesmo dia ("1027,1 vira 10271"), medida na primeira importação real:
 * na Wolff, 10271 é o trilho de ALUMÍNIO (R$ 1.055,25) e 1027,1 o de PVC (R$ 209,86); 13181 e
 * 1318,1 são duas persianas. Tirar o separador juntava os dois num código só, e o sistema ficava
 * com um deles — 755 códigos viravam 753.
 *
 * A forma canônica guarda a parte decimal com PONTO:
 *   - no PREÇO o código chega como número (1027.1, que o texto da célula já dá como "1027.1") ou
 *     como texto;
 *   - no MOTOR chega como texto com vírgula ("1027,1"): troca-se SÓ a vírgula por ponto.
 * Os dois lados se encontram em "1027.1" e continuam distintos de "10271". `mudou` diz que houve
 * a troca da vírgula, para a contagem e o aviso.
 */
export function normalizarCodigo(bruto: string): { codigo: string; mudou: boolean } {
    if (/^\d+,\d+$/.test(bruto)) return { codigo: bruto.replace(',', '.'), mudou: true }
    return { codigo: bruto, mudou: false }
}

/** O nome da linha nas fórmulas da linha: sem o prefixo "PVC " — a regra diz "EUROPA 42", a aba do arquivo "PVC EUROPA 42". */
export const normalizarLinha = (linha: string | null): string | null => (linha === null ? null : linha.replace(/^PVC\s+/i, '').trim() || null)

const ehCabecalhoDoPreco = (v: ValorLido) => typeof v === 'string' && /^C[ÓO]DIGO$/i.test(v.trim())

// ── A leitura ──────────────────────────────────────────────────────────────────────────────
class Leitor {
    avisos: Aviso[] = []
    normalizados = 0
    constructor(private aba: string, private ws: ExcelJS.Worksheet) {}

    bruto(linha: number, coluna: number): ValorLido {
        const { valor, erro } = valorDaCelula(this.ws.getRow(linha).getCell(coluna).value)
        if (erro) this.avisos.push({ tipo: 'celula_com_erro', aba: this.aba, linha, coluna, mensagem: erro })
        return valor
    }

    texto(linha: number, coluna: number): string | null {
        const v = this.bruto(linha, coluna)
        if (v === null) return null
        if (v instanceof Date) return v.toISOString().slice(0, 10)
        return String(v)
    }

    numero(linha: number, coluna: number): number | null {
        const v = this.bruto(linha, coluna)
        if (v === null) return null
        if (typeof v === 'number') return v
        if (typeof v === 'string') {
            // Texto numérico do jeito brasileiro: "1.234,56" e "12,5".
            const n = Number(v.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
            if (Number.isFinite(n) && /\d/.test(v)) return n
        }
        this.avisos.push({ tipo: 'celula_nao_numerica', aba: this.aba, linha, coluna, mensagem: `esperado número, veio "${String(v)}"` })
        return null
    }

    codigo(linha: number, coluna: number): string | null {
        const t = this.texto(linha, coluna)
        if (t === null) return null
        const { codigo, mudou } = normalizarCodigo(t)
        if (mudou) {
            this.normalizados += 1
            this.avisos.push({ tipo: 'codigo_normalizado', aba: this.aba, linha, antes: t, depois: codigo, mensagem: `código "${t}" lido como "${codigo}" — a vírgula virou ponto` })
        }
        return codigo
    }

    /** O primeiro texto não vazio da linha, em qualquer coluna — o título de uma seção. */
    primeiroTexto(linha: number): string | null {
        const row = this.ws.getRow(linha)
        for (let c = 1; c <= Math.max(row.cellCount, 1); c++) {
            const v = valorDaCelula(row.getCell(c).value).valor
            if (v !== null) return v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
        }
        return null
    }

    linhaVazia(linha: number): boolean {
        return this.primeiroTexto(linha) === null
    }
}

interface Secao {
    titulo: string | null; aliquota: number | null; vendidoPor: 'barra' | 'unidade' | null
    /** As colunas do bloco tributário que o cabeçalho DESTA seção traz, pelo nome exato: coluna do banco → coluna do arquivo (1-based). */
    bloco: Partial<Record<ColunaDoBlocoTributario, number>>
}

/**
 * O bloco tributário pelo CABEÇALHO (dono do produto, 02/11/2026: "pelo cabeçalho, com os nomes exatos"): a célula do cabeçalho da seção, sem os
 * espaços das pontas, igual ao nome da coluna — sem trocar caixa nem acento. O mesmo nome duas vezes no mesmo cabeçalho é ambíguo: vai para `repetidas`.
 */
function blocoDoCabecalho(ws: ExcelJS.Worksheet, linhaDoCabecalho: number): { bloco: Secao['bloco']; repetidas: string[] } {
    const row = ws.getRow(linhaDoCabecalho)
    const bloco: Secao['bloco'] = {}
    const repetidas: string[] = []
    const nomes = new Set<string>(COLUNAS_DO_BLOCO_TRIBUTARIO)
    for (let c = 1; c <= row.cellCount; c++) {
        const v = valorDaCelula(row.getCell(c).value).valor
        if (typeof v !== 'string' || !nomes.has(v.trim())) continue
        const nome = v.trim() as ColunaDoBlocoTributario
        if (bloco[nome] !== undefined) repetidas.push(nome)
        else bloco[nome] = c
    }
    return { bloco, repetidas }
}

/**
 * Uma célula do bloco tributário: vazia → NULL (não informado); número → o número, 0 incluído; texto numérico do jeito brasileiro ("12,5") → o
 * número, como as outras colunas numéricas do importador; QUALQUER outra coisa (texto, data, erro do Excel) → inválida, para a recusa nomear.
 */
function celulaDoBloco(ws: ExcelJS.Worksheet, linha: number, coluna: number): { valor: number | null } | { invalida: string; motivo: string } {
    const { valor, erro } = valorDaCelula(ws.getRow(linha).getCell(coluna).value)
    if (erro) return { invalida: String(valor ?? ''), motivo: erro }
    if (valor === null) return { valor: null }
    if (typeof valor === 'number') return Number.isFinite(valor) ? { valor } : { invalida: String(valor), motivo: 'número inválido' }
    if (typeof valor === 'string') {
        const t = valor.trim()
        if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+([.,]\d+)?$/.test(t)) return { valor: Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) }
        return { invalida: valor, motivo: 'texto' }
    }
    if (valor instanceof Date) return { invalida: valor.toISOString().slice(0, 10), motivo: 'data' }
    return { invalida: String(valor), motivo: 'não é número' }
}

function secaoDoCabecalho(l: Leitor, aba: string, linhaDoCabecalho: number): Secao {
    const titulo = linhaDoCabecalho > 1 ? l.primeiroTexto(linhaDoCabecalho - 1) : null
    const rotulos = [COL_PRECO.valor_metro_interno, COL_PRECO.valor_barra_interno].map((c) => l.texto(linhaDoCabecalho, c) ?? '')
    const pcts = rotulos.map((r) => /(\d{1,2}(?:[.,]\d+)?)\s*%/.exec(r)?.[1]).filter((x): x is string => !!x).map((x) => Number(x.replace(',', '.')))
    let aliquota: number | null = null
    if (pcts.length > 0) {
        if (pcts.every((p) => p === pcts[0])) aliquota = pcts[0]
        else l.avisos.push({ tipo: 'aliquota_divergente_no_cabecalho', aba, linha: linhaDoCabecalho, mensagem: `os rótulos dizem ${pcts.join(' e ')}% — alíquota da seção fica NULL` })
    }
    const todos = rotulos.join(' ')
    const vendidoPor = /VALOR\s+(UNIT|TOTAL)/i.test(todos) ? 'unidade' : /BARRA/i.test(todos) ? 'barra' : null
    return { titulo, aliquota, vendidoPor, bloco: {} }
}

const valoresDoItem = (i: ItemLido) => [i.valor_metro_interno, i.valor_metro_12, i.valor_barra_interno, i.valor_barra_12, i.aliquota_interna_pct]

/** A leitura da aba de preço: os itens, os avisos, e as recusas do bloco tributário (que impedem a gravação). */
type LeituraDoPreco = { itens: ItemLido[]; avisos: Aviso[]; normalizados: number; recusas: string[] }

function lerPreco(ws: ExcelJS.Worksheet): LeituraDoPreco {
    const aba = ABAS_DA_IMPORTACAO.preco
    const l = new Leitor(aba, ws)
    const ultima = ws.rowCount
    const cabecalhos = new Set<number>()
    for (let r = 1; r <= ultima; r++) if (ehCabecalhoDoPreco(valorDaCelula(ws.getRow(r).getCell(COL_PRECO.codigo).value).valor)) cabecalhos.add(r)
    const titulos = new Set([...cabecalhos].map((r) => r - 1))

    const itens: ItemLido[] = []
    const primeiraLinha = new Map<string, { linha: number; item: ItemLido }>()
    const invalidas: CelulaInvalidaDoBloco[] = []
    const foraDaRegra: ItemForaDaRegraDoBloco[] = []
    const repetidasNoCabecalho: string[] = []
    let secao: Secao = { titulo: null, aliquota: null, vendidoPor: null, bloco: {} }
    for (let r = 1; r <= ultima; r++) {
        if (cabecalhos.has(r)) {
            const doCabecalho = blocoDoCabecalho(ws, r)
            repetidasNoCabecalho.push(...doCabecalho.repetidas.map((c) => `linha ${r}: ${c}`))
            secao = { ...secaoDoCabecalho(l, aba, r), bloco: doCabecalho.bloco }
            continue
        }
        if (titulos.has(r) || l.linhaVazia(r)) continue
        const codigo = l.codigo(r, COL_PRECO.codigo)
        if (codigo === null) continue
        const item: ItemLido = {
            codigo,
            descricao: l.texto(r, COL_PRECO.descricao),
            medida_barra_m: l.numero(r, COL_PRECO.medida_barra_m),
            unidade: l.texto(r, COL_PRECO.unidade),
            ncm: l.texto(r, COL_PRECO.ncm),
            peso: l.numero(r, COL_PRECO.peso),
            ipi: l.numero(r, COL_PRECO.ipi),
            pacote: l.texto(r, COL_PRECO.pacote),
            [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: l.texto(r, COL_PRECO.categoria_do_arquivo),
            custo: l.numero(r, COL_PRECO.custo),
            secao: secao.titulo,
            aliquota_interna_pct: secao.aliquota,
            vendido_por: secao.vendidoPor,
            valor_metro_interno: l.numero(r, COL_PRECO.valor_metro_interno),
            valor_metro_12: l.numero(r, COL_PRECO.valor_metro_12),
            valor_barra_interno: l.numero(r, COL_PRECO.valor_barra_interno),
            valor_barra_12: l.numero(r, COL_PRECO.valor_barra_12),
            ...blocoDaLinha(r),
        }
        conferirBlocoDoItem(l, aba, r, item, foraDaRegra)
        registrarItem(l, aba, itens, primeiraLinha, r, item)
    }
    const recusas: string[] = []
    if (repetidasNoCabecalho.length) recusas.push(`A aba "${aba}" tem coluna do bloco tributário repetida no mesmo cabeçalho (${repetidasNoCabecalho.join('; ')}): não sei qual ler. Nada foi gravado.`)
    if (invalidas.length) recusas.push(fraseDasCelulasInvalidasDoBloco(aba, invalidas))
    if (foraDaRegra.length) recusas.push(fraseDosItensForaDaRegraDoBloco(aba, foraDaRegra))
    return { itens, avisos: l.avisos, normalizados: l.normalizados, recusas }

    /** As 12 da linha: as que a seção traz pelo cabeçalho; as outras, NULL (não informado). */
    function blocoDaLinha(linha: number): BlocoTributario {
        const b = blocoVazio()
        for (const coluna of COLUNAS_DO_BLOCO_TRIBUTARIO) {
            const c = secao.bloco[coluna]
            if (c === undefined) continue
            const lida = celulaDoBloco(ws, linha, c)
            if ('invalida' in lida) invalidas.push({ linha, coluna, valor: lida.invalida, motivo: lida.motivo })
            else b[coluna] = lida.valor
        }
        return b
    }

}

/**
 * Um item lido entra na lista — ou, com o CÓDIGO REPETIDO, fica a PRIMEIRA. Decisão da sessão de verificação, 20/10/2026, que o dono do produto
 * pode derrubar (cabeçalho da `20261020000001`). Só é segura enquanto as duas linhas forem o mesmo preço — e o aviso diz, em voz alta, quando
 * não são. Vale para os dois layouts.
 */
function registrarItem(l: Leitor, aba: string, itens: ItemLido[], primeiraLinha: Map<string, { linha: number; item: ItemLido }>, linha: number, item: ItemLido) {
    const antes = primeiraLinha.get(item.codigo)
    if (!antes) { primeiraLinha.set(item.codigo, { linha, item }); itens.push(item); return }
    l.normalizados += 1
    const batem = valoresDoItem(antes.item).every((v, k) => v === valoresDoItem(item)[k])
    l.avisos.push({
        tipo: 'codigo_repetido', aba, codigo: item.codigo, linhas: [antes.linha, linha], secoes: [antes.item.secao, item.secao], valores_batem: batem,
        mensagem: batem
            ? `código ${item.codigo} repetido (linhas ${antes.linha} e ${linha}), com os mesmos valores: ficou a primeira`
            : `VALORES DIFERENTES — código ${item.codigo} repetido (linhas ${antes.linha} e ${linha}) com preços diferentes. Ficou a primeira; a decisão volta para o dono do produto.`,
    })
}

/** As regras do banco (antes de gravar, para nomear o item), e o recálculo do resultado contra o que veio. Vale para os dois layouts. */
function conferirBlocoDoItem(l: Leitor, aba: string, linha: number, item: ItemLido, foraDaRegra: ItemForaDaRegraDoBloco[]) {
    for (const motivo of foraDaRegraDoBloco(item)) foraDaRegra.push({ codigo: item.codigo, linha, motivo })
    if (COLUNAS_DO_BLOCO_TRIBUTARIO.every((c) => item[c] === null)) return
    const resultado = [item.credito_pct, item.credito_valor, item.custo_liquido]
    const recalculo = recalcularBloco(item.custo, item)
    if (recalculo.ok === false) {
        // sem resultado no arquivo não há o que comparar; com ele, o item é reportado — nada é preenchido com 0
        if (resultado.some((v) => v !== null)) {
            l.avisos.push({ tipo: 'bloco_tributario_nao_recalculavel', aba, codigo: item.codigo, linha, faltam: recalculo.faltam, mensagem: fraseDoBlocoNaoRecalculavel(item.codigo, linha, recalculo.faltam) })
        }
        return
    }
    const ds = divergenciasDoBloco(item, recalculo)
    if (ds.length) l.avisos.push({ tipo: 'bloco_tributario_divergente', aba, codigo: item.codigo, linha, divergencias: ds, mensagem: fraseDaDivergenciaDoBloco(item.codigo, linha, ds) })
}

// ── O LAYOUT ÚNICO da tabela de fornecedor (dono do produto, 02/11/2026) ─────────────────────────────────────────────────────────────
/**
 * "Aceitar o layout único de tabela de fornecedor (CABECALHO + ITENS, colunas por nome)." A aba ITENS tem o cabeçalho na linha 1 e as 28
 * colunas abaixo, lidas PELO NOME exato (sem trocar caixa nem acento); a aba CABECALHO traz seis campos que são só lidos e devolvidos.
 * O layout de antes (a aba pelo nome, as colunas por posição) continua valendo: o caminho é escolhido pela presença da aba ITENS ou da
 * CABECALHO (`lerTabelaDePreco`). As 28 são TODAS obrigatórias (decisão do dono do produto, 02/11/2026): ausente, repetida ou a aba ITENS sem
 * cabeçalho reconhecível é recusa nomeada. As que o banco não tem onde guardar (`COLUNAS_SEM_DESTINO_DO_LAYOUT_UNICO`) são exigidas no cabeçalho,
 * não são gravadas, e um aviso diz quantas linhas vieram com valor nelas — nada some em silêncio.
 */
export const ABAS_DO_LAYOUT_UNICO = { cabecalho: 'CABECALHO', itens: 'ITENS' } as const
export const CAMPOS_DO_CABECALHO_UNICO = ['categoria', 'fornecedor', 'vigencia', 'regime_tributario', 'uf_origem', 'moeda'] as const
export type CabecalhoDoLayoutUnico = Record<(typeof CAMPOS_DO_CABECALHO_UNICO)[number], string | null>
export type LayoutDaTabela = 'unico' | 'por_posicao'
/** As 28 colunas, na ordem do pedido, com os nomes EXATOS do cabeçalho. */
export const COLUNAS_DO_LAYOUT_UNICO = [
    'codigo', 'descricao', 'secao', COLUNA_DA_CATEGORIA_DO_FORNECEDOR, 'linha', 'cor', 'codigo_wvetro', 'unidade', 'vendido_por',
    'medida_barra_m', 'peso_kg_por_m', 'multiplo_compra', 'custo_bruto', 'valor_metro', 'valor_kg',
    'cred_icms_pct', 'cred_pis_cofins_pct', 'cred_ibs_pct', 'cred_cbs_pct', 'cred_ipi_pct',
    'nc_ipi_pct', 'nc_icms_st_pct', 'nc_difal_pct', 'nc_is_pct', 'ncm', 'credito_pct', 'credito_valor', 'custo_liquido',
] as const
export type ColunaDoLayoutUnico = (typeof COLUNAS_DO_LAYOUT_UNICO)[number]
/** Exigidas no cabeçalho e lidas, mas SEM coluna em `orcamentista_tabela_item` (medido em 02/11/2026): ficam fora da gravação nesta PR. */
export const COLUNAS_SEM_DESTINO_DO_LAYOUT_UNICO = ['linha', 'cor', 'codigo_wvetro', 'valor_kg', 'multiplo_compra'] as const
/** As numéricas: texto nelas é recusa nomeada, como no bloco tributário (nunca vira 0 nem NULL). */
type NumericaDoLayoutUnico = 'medida_barra_m' | 'peso_kg_por_m' | 'custo_bruto' | 'valor_metro' | ColunaDoBlocoTributario

export const fraseDoLayoutUnicoSemItens = (abas: readonly string[]) =>
    `tem a aba "${ABAS_DO_LAYOUT_UNICO.cabecalho}" do layout único, mas não a aba "${ABAS_DO_LAYOUT_UNICO.itens}". Abas encontradas: ${abas.map((a) => `"${a}"`).join(', ') || 'nenhuma'}.`
export const FRASE_DO_CABECALHO_DOS_ITENS_NAO_RECONHECIVEL =
    `a aba "${ABAS_DO_LAYOUT_UNICO.itens}" não tem um cabeçalho reconhecível na linha 1: a coluna "codigo" não está lá. As ${COLUNAS_DO_LAYOUT_UNICO.length} colunas do layout único ficam na linha 1, com os nomes exatos.`
export const fraseDasColunasAusentesDoLayoutUnico = (faltam: readonly string[]) =>
    `a aba "${ABAS_DO_LAYOUT_UNICO.itens}" não tem ${faltam.length} ${faltam.length === 1 ? 'coluna obrigatória' : 'colunas obrigatórias'} do layout único: ${faltam.join(', ')}. Nada foi gravado.`
export const fraseDasColunasRepetidasDoLayoutUnico = (repetidas: readonly string[]) =>
    `a aba "${ABAS_DO_LAYOUT_UNICO.itens}" tem coluna repetida no cabeçalho (${repetidas.join(', ')}): não sei qual ler. Nada foi gravado.`
export const fraseDoVendidoPorInvalido = (cs: ReadonlyArray<{ linha: number; valor: string }>) =>
    `a aba "${ABAS_DO_LAYOUT_UNICO.itens}" tem ${cs.length} ${cs.length === 1 ? 'célula' : 'células'} de vendido_por fora de "barra" ou "unidade": `
    + `${cs.slice(0, 10).map((c) => `linha ${c.linha} = "${c.valor}"`).join('; ')}${cs.length > 10 ? `; e mais ${cs.length - 10}` : ''}. Nada foi gravado.`
export const fraseDasCelulasNaoNumericasDoLayoutUnico = (cs: readonly CelulaInvalidaDoBloco[]) =>
    `a aba "${ABAS_DO_LAYOUT_UNICO.itens}" tem ${cs.length} ${cs.length === 1 ? 'célula' : 'células'} em coluna numérica que não ${cs.length === 1 ? 'é número' : 'são números'}: `
    + `${cs.slice(0, 10).map((c) => `linha ${c.linha}, ${c.coluna} = "${c.valor}" (${c.motivo})`).join('; ')}${cs.length > 10 ? `; e mais ${cs.length - 10}` : ''}. Vazio é "não informado" e 0 é zero; texto não vira nenhum dos dois. Nada foi gravado.`
const nomeados = (codigos: readonly string[]) => `${codigos.slice(0, 10).join(', ')}${codigos.length > 10 ? ` e mais ${codigos.length - 10}` : ''}`
export const fraseDosItensSemCusto = (codigos: readonly string[]) =>
    `${codigos.length} ${codigos.length === 1 ? 'item veio' : 'itens vieram'} sem custo_bruto (${nomeados(codigos)}): ${codigos.length === 1 ? 'entrou' : 'entraram'} com o custo em branco, e sem valor por barra nem líquido para recalcular.`
export const fraseDaTabelaSemValorPorBarra = (codigos: readonly string[]) =>
    `${codigos.length} ${codigos.length === 1 ? 'item não é vendido' : 'itens não são vendidos'} por barra (${nomeados(codigos)}): a tabela não tem valor por barra para ${codigos.length === 1 ? 'ele' : 'eles'}, e o total por barra inteira não sai para ${codigos.length === 1 ? 'esse código' : 'esses códigos'}.`
export const fraseDasColunasSemDestino = (colunas: Record<string, number>) =>
    `o arquivo traz valor em ${Object.keys(colunas).length === 1 ? 'coluna' : 'colunas'} que o banco ainda não guarda — ${Object.entries(colunas).map(([c, n]) => `${c} (${n} ${n === 1 ? 'linha' : 'linhas'})`).join(', ')}: ${Object.keys(colunas).length === 1 ? 'ela não foi gravada' : 'elas não foram gravadas'}.`

/** A aba pelo nome, sem olhar a caixa nem os espaços das pontas. */
const abaDoLayoutUnico = (wb: ExcelJS.Workbook, nome: string) => wb.worksheets.find((w) => w.name.trim().toUpperCase() === nome)

/**
 * Os seis campos da aba CABECALHO, SÓ LIDOS (decisão do dono do produto, 02/11/2026: devolvidos no resultado, sem gravar nem comparar).
 * Duas formas: os nomes na linha 1 e os valores na linha 2 (dois ou mais nomes na linha 1), ou um campo por linha (nome na coluna A, valor na B).
 * Campo ausente é null.
 */
export function lerCabecalhoDoLayoutUnico(ws: ExcelJS.Worksheet | undefined): CabecalhoDoLayoutUnico {
    const c = Object.fromEntries(CAMPOS_DO_CABECALHO_UNICO.map((k): [string, null] => [k, null])) as CabecalhoDoLayoutUnico
    if (!ws) return c
    const campos = new Set<string>(CAMPOS_DO_CABECALHO_UNICO)
    const texto = (v: ValorLido): string | null => (v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim() || null)
    const nomeDa = (linha: number, coluna: number) => { const v = valorDaCelula(ws.getRow(linha).getCell(coluna).value).valor; return typeof v === 'string' && campos.has(v.trim()) ? (v.trim() as keyof CabecalhoDoLayoutUnico) : null }
    const row1 = ws.getRow(1)
    const porColuna: Array<[keyof CabecalhoDoLayoutUnico, number]> = []
    for (let col = 1; col <= row1.cellCount; col++) { const k = nomeDa(1, col); if (k) porColuna.push([k, col]) }
    if (porColuna.length >= 2) {
        for (const [k, col] of porColuna) c[k] = texto(valorDaCelula(ws.getRow(2).getCell(col).value).valor)
        return c
    }
    for (let r = 1; r <= ws.rowCount; r++) { const k = nomeDa(r, 1); if (k) c[k] = texto(valorDaCelula(ws.getRow(r).getCell(2).value).valor) }
    return c
}

/** A aba ITENS do layout único: o cabeçalho na linha 1 pelo nome, e cada linha abaixo um item. */
function lerItensDoLayoutUnico(ws: ExcelJS.Worksheet): LeituraDoPreco {
    const aba = ABAS_DO_LAYOUT_UNICO.itens
    const l = new Leitor(aba, ws)
    const vazia: LeituraDoPreco = { itens: [], avisos: l.avisos, normalizados: 0, recusas: [] }

    // o cabeçalho: coluna do arquivo (1-based) de cada nome; repetida é ambígua; ausente é recusa
    const col: Partial<Record<ColunaDoLayoutUnico, number>> = {}
    const repetidas: string[] = []
    const nomes = new Set<string>(COLUNAS_DO_LAYOUT_UNICO)
    const row1 = ws.getRow(1)
    for (let c = 1; c <= row1.cellCount; c++) {
        const v = valorDaCelula(row1.getCell(c).value).valor
        if (typeof v !== 'string' || !nomes.has(v.trim())) continue
        const nome = v.trim() as ColunaDoLayoutUnico
        if (col[nome] !== undefined) repetidas.push(nome)
        else col[nome] = c
    }
    if (col.codigo === undefined) return { ...vazia, recusas: [FRASE_DO_CABECALHO_DOS_ITENS_NAO_RECONHECIVEL] }
    const faltam = COLUNAS_DO_LAYOUT_UNICO.filter((c) => col[c] === undefined)
    const recusas: string[] = []
    if (faltam.length) recusas.push(fraseDasColunasAusentesDoLayoutUnico(faltam))
    if (repetidas.length) recusas.push(fraseDasColunasRepetidasDoLayoutUnico(repetidas))
    if (recusas.length) return { ...vazia, recusas }
    const coluna = (nome: ColunaDoLayoutUnico) => col[nome] as number

    const itens: ItemLido[] = []
    const primeiraLinha = new Map<string, { linha: number; item: ItemLido }>()
    const invalidas: CelulaInvalidaDoBloco[] = []
    const vendidoInvalido: Array<{ linha: number; valor: string }> = []
    const foraDaRegra: ItemForaDaRegraDoBloco[] = []
    const semCusto: string[] = []
    const semValorPorBarra: string[] = []
    const comValorSemDestino: Record<string, number> = {}
    for (let r = 2; r <= ws.rowCount; r++) {
        if (l.linhaVazia(r)) continue
        const codigo = l.codigo(r, coluna('codigo'))
        if (codigo === null) continue
        const texto = (nome: ColunaDoLayoutUnico) => l.texto(r, coluna(nome))
        const numero = (nome: NumericaDoLayoutUnico): number | null => {
            const lida = celulaDoBloco(ws, r, coluna(nome))
            if ('invalida' in lida) { invalidas.push({ linha: r, coluna: nome, valor: lida.invalida, motivo: lida.motivo }); return null }
            return lida.valor
        }
        // vendido_por: "barra" ou "unidade" (a CHECK do banco); vazio é não informado; outra coisa é recusa
        const vendidoBruto = texto('vendido_por')
        let vendido_por: 'barra' | 'unidade' | null = null
        if (vendidoBruto !== null) {
            const v = vendidoBruto.trim().toLowerCase()
            if (v === 'barra' || v === 'unidade') vendido_por = v
            else vendidoInvalido.push({ linha: r, valor: vendidoBruto })
        }
        const custo = numero('custo_bruto')
        const bloco = Object.fromEntries(COLUNAS_DO_BLOCO_TRIBUTARIO.map((c): [string, number | null] => [c, numero(c)])) as BlocoTributario
        const item: ItemLido = {
            codigo,
            descricao: texto('descricao'),
            medida_barra_m: numero('medida_barra_m'),
            unidade: texto('unidade'),
            ncm: texto('ncm'),
            peso: numero('peso_kg_por_m'),
            // sem coluna no layout único: a coluna antiga `ipi` (o IPI agora é cred_ipi_pct/nc_ipi_pct), o pacote e as de 12%
            ipi: null,
            pacote: null,
            // a coluna do arquivo com o nome de `COLUNA_DA_CATEGORIA_DO_FORNECEDOR` vai para `orcamentista_tabela_item.segmento` (a coluna 11 de antes);
            // a categoria da TABELA é a do cadastro, não do arquivo
            [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: texto(COLUNA_DA_CATEGORIA_DO_FORNECEDOR),
            custo,
            secao: texto('secao'),
            // o layout único não tem o rótulo "18%" de onde a alíquota saía; nada no cálculo nem na conversa a lê (medido em 02/11/2026)
            aliquota_interna_pct: null,
            vendido_por,
            valor_metro_interno: numero('valor_metro'),
            // dono do produto, 02/11/2026: "valor_barra_interno = custo_bruto quando vendido_por = 'barra' (é o mesmo número, não há multiplicação
            // nem cálculo). Quando vendido_por for outra coisa, grave NULL e avise [...]. Nunca multiplique valor_metro × medida_barra_m."
            valor_barra_interno: vendido_por === 'barra' ? custo : null,
            valor_metro_12: null,
            valor_barra_12: null,
            ...bloco,
        }
        if (custo === null) semCusto.push(codigo)
        if (vendido_por !== 'barra') semValorPorBarra.push(codigo)
        for (const c of COLUNAS_SEM_DESTINO_DO_LAYOUT_UNICO) {
            if (valorDaCelula(ws.getRow(r).getCell(coluna(c)).value).valor !== null) comValorSemDestino[c] = (comValorSemDestino[c] ?? 0) + 1
        }
        conferirBlocoDoItem(l, aba, r, item, foraDaRegra)
        registrarItem(l, aba, itens, primeiraLinha, r, item)
    }
    if (semCusto.length) l.avisos.push({ tipo: 'itens_sem_custo', aba, itens: semCusto.length, codigos: semCusto, mensagem: fraseDosItensSemCusto(semCusto) })
    if (semValorPorBarra.length) l.avisos.push({ tipo: 'tabela_sem_valor_por_barra', aba, itens: semValorPorBarra.length, codigos: semValorPorBarra, mensagem: fraseDaTabelaSemValorPorBarra(semValorPorBarra) })
    if (Object.keys(comValorSemDestino).length) l.avisos.push({ tipo: 'colunas_sem_destino_no_layout_unico', aba, colunas: comValorSemDestino, mensagem: fraseDasColunasSemDestino(comValorSemDestino) })
    if (invalidas.length) recusas.push(fraseDasCelulasNaoNumericasDoLayoutUnico(invalidas))
    if (vendidoInvalido.length) recusas.push(fraseDoVendidoPorInvalido(vendidoInvalido))
    if (foraDaRegra.length) recusas.push(fraseDosItensForaDaRegraDoBloco(aba, foraDaRegra))
    return { itens, avisos: l.avisos, normalizados: l.normalizados, recusas }
}

type TabelaDePrecoLida = { preco: LeituraDoPreco; layout: LayoutDaTabela; cabecalho: CabecalhoDoLayoutUnico | null }

/**
 * A tabela de preço, pelo layout que o arquivo tem: com a aba ITENS ou a CABECALHO, o layout único (e a ITENS tem de estar lá); sem as duas,
 * o de antes — a aba pelo nome (`ABAS_DA_IMPORTACAO.preco`) e as colunas por posição. A recusa do layout de antes diz que o único também não
 * foi achado. Devolve a frase da recusa (já com o nome do arquivo) ou a leitura.
 */
function lerTabelaDePreco(wb: ExcelJS.Workbook, nomeDoArquivo: string): TabelaDePrecoLida | string {
    const itens = abaDoLayoutUnico(wb, ABAS_DO_LAYOUT_UNICO.itens)
    const cabecalho = abaDoLayoutUnico(wb, ABAS_DO_LAYOUT_UNICO.cabecalho)
    if (itens || cabecalho) {
        if (!itens) return fraseDoArquivo(nomeDoArquivo, fraseDoLayoutUnicoSemItens(wb.worksheets.map((w) => w.name)))
        const preco = lerItensDoLayoutUnico(itens)
        if (preco.recusas.length) return fraseDoArquivo(nomeDoArquivo, preco.recusas.join(' '))
        return { preco, layout: 'unico', cabecalho: lerCabecalhoDoLayoutUnico(cabecalho) }
    }
    const ws = aba(wb, nomeDoArquivo, ABAS_DA_IMPORTACAO.preco)
    if (typeof ws === 'string') return `${ws} O layout único (abas "${ABAS_DO_LAYOUT_UNICO.cabecalho}" e "${ABAS_DO_LAYOUT_UNICO.itens}", colunas por nome) também não foi encontrado.`
    const preco = lerPreco(ws)
    if (preco.recusas.length) return fraseDoArquivo(nomeDoArquivo, preco.recusas.join(' '))
    return { preco, layout: 'por_posicao', cabecalho: null }
}

function lerMotor(ws: ExcelJS.Worksheet): { regras: RegraLida[]; avisos: Aviso[]; normalizados: number } {
    const l = new Leitor(ABAS_DA_IMPORTACAO.motor, ws)
    const regras: RegraLida[] = []
    for (let r = 2; r <= ws.rowCount; r++) {
        if (l.linhaVazia(r)) continue
        const codigo = l.codigo(r, COL_MOTOR.codigo)
        if (codigo === null) continue
        const tipologias = [...new Set((l.texto(r, COL_MOTOR.tipologias) ?? '').split(',').map((t) => t.trim()).filter((t) => t !== ''))]
        regras.push({
            codigo,
            descricao: l.texto(r, COL_MOTOR.descricao),
            [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: l.texto(r, COL_MOTOR.categoria_do_arquivo),
            cor: l.texto(r, COL_MOTOR.cor),
            codigo_wvetro: l.texto(r, COL_MOTOR.codigo_wvetro),
            linha: l.texto(r, COL_MOTOR.linha),
            tipo: l.texto(r, COL_MOTOR.tipo),
            eixo: l.texto(r, COL_MOTOR.eixo),
            corte: l.texto(r, COL_MOTOR.corte),
            formula_medida: l.texto(r, COL_MOTOR.formula_medida),
            formula_em_lh: l.texto(r, COL_MOTOR.formula_em_lh),
            formula_qtde: l.texto(r, COL_MOTOR.formula_qtde),
            condicao: l.texto(r, COL_MOTOR.condicao),
            obs: l.texto(r, COL_MOTOR.obs),
            tipologias,
        })
    }
    return { regras, avisos: l.avisos, normalizados: l.normalizados }
}

function lerFormulasDaLinha(ws: ExcelJS.Worksheet): { formulas: FormulaLida[]; avisos: Aviso[] } {
    const l = new Leitor(ABAS_DA_IMPORTACAO.formulasDaLinha, ws)
    const formulas: FormulaLida[] = []
    for (let r = 2; r <= ws.rowCount; r++) {
        if (l.linhaVazia(r)) continue
        const linhaOriginal = l.texto(r, COL_FORMULAS_DA_LINHA.linha_original)
        formulas.push({
            linha: normalizarLinha(linhaOriginal),
            linha_original: linhaOriginal,
            variavel: l.texto(r, COL_FORMULAS_DA_LINHA.variavel),
            descricao: l.texto(r, COL_FORMULAS_DA_LINHA.descricao),
            formula: l.texto(r, COL_FORMULAS_DA_LINHA.formula),
            formula_em_lh: l.texto(r, COL_FORMULAS_DA_LINHA.formula_em_lh),
            pct_padrao: l.numero(r, COL_FORMULAS_DA_LINHA.pct_padrao),
        })
    }
    return { formulas, avisos: l.avisos }
}

/**
 * As VARIÁVEIS de uma tipologia: junta a `condicao` (coluna 15) de todas as regras da tipologia,
 * extrai os identificadores em MAIÚSCULAS de 1 a 4 letras (`\b[A-Z]{1,4}\b`), joga fora AND, OR e
 * IIF, e devolve o conjunto ordenado. Regra medida pela sessão de verificação, 20/10/2026, nos
 * arquivos da Wolff — DP-148 dá AQ, CA, FV, M, N, PM, PT.
 *
 * ══ A LISTA VAZIA É RESPOSTA LEGÍTIMA — A EXCEÇÃO QUE PARECE ERRO ══
 * Uma tipologia cujas regras NÃO têm condição nenhuma não tem variável nenhuma, e o vetor vazio
 * gravado para ela é MEDIÇÃO, não suposição nem dado faltando: 5 das 157 tipologias da Wolff são
 * assim (sessão de verificação, 20/10/2026). Não é o `[]` de "não sei" que `ausente-vs-falso.md`
 * proíbe — e quem o "corrigir" para NULL quebra a coluna, que é NOT NULL, e apaga a medição.
 */
const NAO_SAO_VARIAVEIS = new Set(['AND', 'OR', 'IIF'])
export function variaveisDasCondicoes(condicoes: string[]): string[] {
    const achadas = new Set<string>()
    for (const c of condicoes) for (const m of c.match(/\b[A-Z]{1,4}\b/g) ?? []) if (!NAO_SAO_VARIAVEIS.has(m)) achadas.add(m)
    return [...achadas].sort()
}

/** O resumo por tipologia, derivado das regras. */
function resumirTipologias(regras: RegraLida[]): { tipologias: TipologiaLida[]; avisos: Aviso[] } {
    const por = new Map<string, { n: number; condicoes: string[]; linhas: Set<string> }>()
    for (const r of regras) {
        for (const t of r.tipologias) {
            const x = por.get(t) ?? { n: 0, condicoes: [], linhas: new Set<string>() }
            x.n += 1
            if (r.condicao !== null) x.condicoes.push(r.condicao)
            if (r.linha !== null) x.linhas.add(r.linha)
            por.set(t, x)
        }
    }
    const avisos: Aviso[] = []
    const tipologias = [...por.entries()].map(([tipologia, x]): TipologiaLida => {
        const linhas = [...x.linhas]
        if (linhas.length > 1) avisos.push({ tipo: 'tipologia_em_mais_de_uma_linha', tipologia, linhas, mensagem: `a tipologia ${tipologia} aparece em ${linhas.join(', ')} — linha fica NULL` })
        const variaveis = variaveisDasCondicoes(x.condicoes)
        // CONDIÇÃO QUE NÃO RENDE IDENTIFICADOR: a lista fica vazia, como a da tipologia sem condição,
        // mas aqui o vazio NÃO é medição — é condição que o leitor não soube ler. Por isso o aviso.
        // Na Wolff isso não acontece: 2.868 regras com condição, ZERO sem identificador (sessão de
        // verificação, 20/10/2026). O aviso existe para o arquivo do PRÓXIMO fornecedor, não para este.
        if (x.condicoes.length > 0 && variaveis.length === 0) {
            avisos.push({
                tipo: 'tipologia_condicional_sem_variavel', tipologia, n_condicionais: x.condicoes.length, exemplo: x.condicoes[0],
                mensagem: `a tipologia ${tipologia} tem ${x.condicoes.length} regra(s) com condição e nenhum identificador foi extraído (ex.: "${x.condicoes[0]}") — variáveis ficam vazias`,
            })
        }
        return {
            tipologia,
            linha: linhas.length === 1 ? linhas[0] : null,
            n_regras: x.n,
            n_condicionais: x.condicoes.length,
            variaveis,
        }
    })
    return { tipologias, avisos }
}

async function abrir(arquivo: ArquivoDaImportacao): Promise<ExcelJS.Workbook | string> {
    if (!arquivoImportavel(arquivo.nome)) return fraseDoArquivoNaoImportavel(arquivo.nome)
    const wb = new ExcelJS.Workbook()
    try {
        await wb.xlsx.load(arquivo.bytes as unknown as ArrayBuffer)
    } catch (e) {
        return fraseDoArquivo(arquivo.nome, `não foi possível abrir a planilha (${(e as Error).message}).`)
    }
    return wb
}

function aba(wb: ExcelJS.Workbook, nomeDoArquivo: string, nome: string): ExcelJS.Worksheet | string {
    return wb.getWorksheet(nome)
        ?? fraseDoArquivo(nomeDoArquivo, `não tem a aba "${nome}". Abas encontradas: ${wb.worksheets.map((w) => `"${w.name}"`).join(', ') || 'nenhuma'}.`)
}

/**
 * A leitura do ARQUIVO DO MOTOR, uma só para os dois caminhos: a importação da tabela (`lerArquivosDaImportacao`) e o motor que
 * a etapa da família sobe (`lerArquivoDoMotor`). As abas exigidas, a recusa com todas as frases de uma vez e o resumo por tipologia
 * moram aqui UMA vez — a segunda cópia seria o defeito de `copia-divergente.md`.
 */
async function lerOMotor(arquivo: ArquivoDaImportacao) {
    const wbMotor = await abrir(arquivo)
    if (typeof wbMotor === 'string') return { ok: false as const, erro: wbMotor }
    const wsMotor = aba(wbMotor, arquivo.nome, ABAS_DA_IMPORTACAO.motor)
    if (typeof wsMotor === 'string') return { ok: false as const, erro: wsMotor }
    const wsFormulasDaLinha = aba(wbMotor, arquivo.nome, ABAS_DA_IMPORTACAO.formulasDaLinha)
    if (typeof wsFormulasDaLinha === 'string') return { ok: false as const, erro: wsFormulasDaLinha }

    // as nove abas por tipologia: uma aba ou coluna que falte, um valor inválido ou uma chave repetida
    // RECUSAM a importação inteira, com todas as frases de uma vez — nada é gravado pela metade
    // os TEMPOS (20261106000001): as duas colunas opcionais da Detalhe; as recusas deles saem junto com as das abas, de uma vez
    const abasDoMotor = lerAbasDoMotor(wbMotor)
    const tempos = lerTemposDoDetalhe(wbMotor)
    const errosDoMotor = [...('erros' in abasDoMotor ? abasDoMotor.erros : []), ...('erros' in tempos ? tempos.erros : [])]
    if (errosDoMotor.length > 0 || 'erros' in abasDoMotor || 'erros' in tempos) return { ok: false as const, erro: fraseDoArquivo(arquivo.nome, errosDoMotor.join(' ')) }

    const motor = lerMotor(wsMotor)
    const formulasDaLinha = lerFormulasDaLinha(wsFormulasDaLinha)
    const resumo = resumirTipologias(motor.regras)
    return { ok: true as const, motor, formulasDaLinha, resumo, abasDoMotor, tempos: tempos.tempos }
}

/** O que sai da leitura do arquivo do motor SOZINHO (sem tabela de preço): o payload de `superadmin_criar_motor_da_etapa`. */
export type ResultadoDoMotor =
    | {
        ok: true; regras: RegraLida[]; tipologias: TipologiaLida[]; formulas: FormulaLida[]; avisos: Aviso[]
        /** As nove abas por tipologia (`ABAS_DO_MOTOR`), pela chave do payload. */
        abas: Record<string, LinhaDoBanco[]>
        /** Os tempos de fabricação da Detalhe (`lerTemposDoDetalhe`): só as tipologias que vieram com tempo. */
        tempos: TempoLido[]
        contagens: { regras: number; tipologias: number; normalizados: number }
    }
    | { ok: false; erro: string }

/**
 * Lê o arquivo do motor que a ETAPA sobe (27/10/2026): sem tabela de preço, sem cruzamento, sem itens. O motor é da família, e
 * quem o lê é o mesmo leitor da importação (`lerOMotor`) — as mesmas abas, as mesmas recusas.
 */
export async function lerArquivoDoMotor(arquivo: ArquivoDaImportacao): Promise<ResultadoDoMotor> {
    const lido = await lerOMotor(arquivo)
    if (lido.ok === false) return { ok: false, erro: lido.erro }
    const { motor, formulasDaLinha, resumo, abasDoMotor, tempos } = lido
    return {
        ok: true,
        regras: motor.regras,
        tipologias: resumo.tipologias,
        formulas: formulasDaLinha.formulas,
        abas: abasDoMotor.linhas,
        tempos,
        contagens: { regras: motor.regras.length, tipologias: resumo.tipologias.length, normalizados: motor.normalizados },
        avisos: [...motor.avisos, ...formulasDaLinha.avisos, ...resumo.avisos],
    }
}

/** Lê os dois arquivos e devolve as linhas prontas para gravar, as contagens e os avisos. */
export async function lerArquivosDaImportacao(arquivos: { tabela: ArquivoDaImportacao; motor: ArquivoDaImportacao | null }): Promise<ResultadoDaLeitura> {
    const wbTabela = await abrir(arquivos.tabela)
    if (typeof wbTabela === 'string') return { ok: false, erro: wbTabela }
    // o layout único ou o de antes, pela forma do arquivo (02/11/2026); a recusa já vem com o nome do arquivo
    const tabela = lerTabelaDePreco(wbTabela, arquivos.tabela.nome)
    if (typeof tabela === 'string') return { ok: false, erro: tabela }
    const { preco, layout, cabecalho } = tabela

    // SEM ARQUIVO DE MOTOR (27/10/2026): a tabela de preço puro — Reforço, Acessórios… — só traz o preço. As listas do motor vão VAZIAS (o
    // payload da função as exige todas) e o cruzamento não existe: não há motor para cruzar. Quem tem motor lê como sempre, abaixo.
    if (arquivos.motor === null) {
        return {
            ok: true,
            itens: preco.itens,
            regras: [],
            tipologias: [],
            formulas: [],
            abas: Object.fromEntries(ABAS_DO_MOTOR.map((a): [string, LinhaDoBanco[]] => [a.payload, []])),
            contagens: { itens: preco.itens.length, regras: 0, tipologias: 0, cruzam: 0, nao_cruzam: 0, normalizados: preco.normalizados },
            avisos: preco.avisos,
            layout, cabecalho,
        }
    }
    const doMotor = await lerOMotor(arquivos.motor)
    if (doMotor.ok === false) return { ok: false, erro: doMotor.erro }
    const { motor, formulasDaLinha, resumo, abasDoMotor, tempos } = doMotor
    // o motor colado na TABELA (legado; 0 tabelas com motor em produção em 06/11/2026) grava por `tabela_id` e não grava tempo: o tempo do arquivo
    // seria descartado em silêncio. Recusa nomeada — o tempo entra pelo catálogo de motores.
    if (tempos.length > 0) return { ok: false, erro: fraseDoArquivo(arquivos.motor.nome, fraseDosTemposNaTabela(tempos.length)) }

    const codigosDoPreco = new Set(preco.itens.map((i) => i.codigo))
    const codigosDoMotor = [...new Set(motor.regras.map((r) => r.codigo))]
    const semPreco = codigosDoMotor.filter((c) => !codigosDoPreco.has(c))
    const avisos: Aviso[] = [...preco.avisos, ...motor.avisos, ...formulasDaLinha.avisos, ...resumo.avisos]
    if (semPreco.length > 0) {
        avisos.push({ tipo: 'codigo_do_motor_sem_preco', codigos: semPreco, mensagem: `${semPreco.length} código(s) do motor não estão na tabela de preço` })
    }

    return {
        ok: true,
        itens: preco.itens,
        regras: motor.regras,
        tipologias: resumo.tipologias,
        formulas: formulasDaLinha.formulas,
        abas: abasDoMotor.linhas,
        contagens: {
            itens: preco.itens.length,
            regras: motor.regras.length,
            tipologias: resumo.tipologias.length,
            cruzam: codigosDoMotor.length - semPreco.length,
            nao_cruzam: semPreco.length,
            normalizados: preco.normalizados + motor.normalizados,
        },
        avisos,
        layout, cabecalho,
    }
}

// ── A gravação: o payload da função, e a conferência do que ela gravou ─────────────────────
type Lida = Extract<ResultadoDaLeitura, { ok: true }>

/**
 * O payload de `importar_conteudo_da_tabela` (`20261020000002`): as linhas do leitor COMO ESTÃO
 * — as chaves já são os nomes das colunas —, as contagens, os avisos e quem importou.
 */
export function montarPayloadDaImportacao(lida: Lida, importadoPor: string | null) {
    return {
        importado_por: importadoPor,
        itens: lida.itens,
        regras: lida.regras,
        tipologias: lida.tipologias,
        formulas: lida.formulas,
        ...lida.abas,
        contagens: lida.contagens,
        avisos: lida.avisos,
    }
}

/** As contagens das quatro tabelas de sempre e das nove abas por tipologia, pela chave do payload. */
export type ContagensDaGravacao = { itens: number; regras: number; tipologias: number; formulas: number } & Record<string, number>
/** As chaves que a conferência compara: as quatro de sempre e as das nove abas. */
export const LISTAS_DA_GRAVACAO: readonly string[] = ['itens', 'regras', 'tipologias', 'formulas', ...ABAS_DO_MOTOR.map((a) => a.payload)]

/**
 * Confere o que a função GRAVOU contra o que a rota MANDOU, lista por lista: as quatro de sempre e as nove abas.
 * Devolve os dois lados quando algum difere, ou `null` quando batem. Diferença nunca é sucesso.
 *
 * LIMITE: a função faz COMMIT ao terminar; esta conferência acontece DEPOIS. Ela transforma a
 * divergência em erro visível, mas não a desfaz.
 */
export function conferirGravacao(
    enviado: ReturnType<typeof montarPayloadDaImportacao>,
    gravado: Readonly<Record<string, unknown>>,
): { enviado: ContagensDaGravacao; gravado: ContagensDaGravacao } | null {
    const listas = enviado as unknown as Record<string, unknown[] | undefined>
    const mandou = Object.fromEntries(LISTAS_DA_GRAVACAO.map((k) => [k, listas[k]?.length ?? 0])) as ContagensDaGravacao
    const voltou = Object.fromEntries(LISTAS_DA_GRAVACAO.map((k) => [k, typeof gravado[k] === 'number' ? gravado[k] : null])) as ContagensDaGravacao
    // contagem que a função não devolveu é divergência, nunca acerto: undefined !== n
    const bate = LISTAS_DA_GRAVACAO.every((k) => mandou[k] === voltou[k])
    return bate ? null : { enviado: mandou, gravado: voltou }
}

/**
 * O payload de `superadmin_criar_motor_da_etapa` (20261027000010): as listas do motor COMO ESTÃO, as contagens e os avisos. Sem `itens`
 * (o motor da família não leva preço) e sem `importado_por` (o autor vai em `p_por`, da sessão).
 */
export function montarPayloadDoMotor(lido: Extract<ResultadoDoMotor, { ok: true }>) {
    return { regras: lido.regras, tipologias: lido.tipologias, formulas: lido.formulas, ...lido.abas, tempos: lido.tempos, contagens: lido.contagens, avisos: lido.avisos }
}

/**
 * As listas que a função do motor devolve contadas: as de `LISTAS_DA_GRAVACAO`, menos os itens de preço, mais os TEMPOS (20261106000001). A função de
 * antes da migração não devolve `tempos`: a contagem ausente é divergência, nunca acerto — o código publicado antes da migração não diz sucesso com o
 * tempo descartado (`jsonb_to_recordset` ignora a chave que não conhece).
 */
export const LISTAS_DO_MOTOR_DA_ETAPA: readonly string[] = [...LISTAS_DA_GRAVACAO.filter((k) => k !== 'itens'), 'tempos']

/** A recusa do motor colado na tabela que traz tempo: o tempo só entra pelo catálogo de motores. */
export function fraseDosTemposNaTabela(n: number): string {
    return `traz ${n} ${n === 1 ? 'tempo' : 'tempos'} de fabricação, e a importação da tabela não grava tempo: suba este arquivo pelo catálogo de motores. Nada foi gravado.`
}

/** O mesmo que `conferirGravacao`, para o motor da etapa: lista por lista, sem os itens. Diferença nunca é sucesso. */
export function conferirGravacaoDoMotor(
    enviado: ReturnType<typeof montarPayloadDoMotor>,
    gravado: Readonly<Record<string, unknown>>,
): { enviado: Record<string, number>; gravado: Record<string, number | null> } | null {
    const listas = enviado as unknown as Record<string, unknown[] | undefined>
    const mandou = Object.fromEntries(LISTAS_DO_MOTOR_DA_ETAPA.map((k) => [k, listas[k]?.length ?? 0]))
    const voltou = Object.fromEntries(LISTAS_DO_MOTOR_DA_ETAPA.map((k) => [k, typeof gravado[k] === 'number' ? (gravado[k] as number) : null]))
    return LISTAS_DO_MOTOR_DA_ETAPA.every((k) => mandou[k] === voltou[k]) ? null : { enviado: mandou, gravado: voltou }
}

// ── A trava dos itens que o arquivo não traz ─────────────────────────────────────────────
/**
 * Os códigos GRAVADOS para a tabela que o arquivo NÃO traz: a importação os apagaria e não os
 * regravaria (`tabela-que-a-importacao-apaga.md`). A comparação é EXATA, sem caixa nem acento
 * normalizados: o que a importação regrava é o código como o leitor o produziu, e casar o parecido
 * deixaria passar a linha que some (`faltou-dado-recusa-nomeada.md`). Sem repetição, na ordem gravada.
 */
export function itensQueOArquivoNaoTraz(gravados: readonly string[], payload: { itens: ReadonlyArray<{ codigo: string }> }): string[] {
    const doArquivo = new Set(payload.itens.map((i) => i.codigo))
    return [...new Set(gravados.filter((c) => !doArquivo.has(c)))]
}

const CODIGOS_NOMEADOS = 10

/**
 * A recusa da importação em tabela com itens que o arquivo não traz (dono do produto, 25/10/2026).
 * O caso que a originou: 24 vidros inseridos à mão na tabela 5f7acebf, que nenhum arquivo traz.
 * Diz quantos e nomeia até dez — todos de uma vez, sem esconder o resto.
 */
export function fraseDaImportacaoTravadaPorItensForaDoArquivo(codigos: readonly string[]): string {
    const nomeados = codigos.slice(0, CODIGOS_NOMEADOS).join(', ')
    const resto = codigos.length > CODIGOS_NOMEADOS ? ` e mais ${codigos.length - CODIGOS_NOMEADOS}` : ''
    return `A importação está travada para esta tabela: ${codigos.length} ${codigos.length === 1 ? 'item gravado não está' : 'itens gravados não estão'} `
        + `no arquivo (${nomeados}${resto}). A importação apaga todos os itens da tabela e regrava só os do arquivo, `
        + `e ${codigos.length === 1 ? 'esse item se perderia' : 'esses itens se perderiam'}. Nada foi alterado.`
}

// ── O limite de tempo da gravação, e o motivo quando ela falha ─────────────────────────────
/**
 * O `statement_timeout` próprio da função `importar_conteudo_da_tabela`, em segundos — o MESMO da
 * migração `20261026000001_limite_de_tempo_da_importacao.sql`, e há portão que liga os dois. A razão
 * do número (o medido local, o piso medido em produção e o teto da API) está no cabeçalho da migração.
 */
export const LIMITE_DA_GRAVACAO_S = 35

/**
 * A frase da gravação que falhou, com o MOTIVO (dono do produto, 26/10/2026: "timeout é timeout, e o
 * usuário tem que ler isso na tela"). A transação é uma só, então em todos os casos nada foi gravado.
 * Erro do banco sem frase própria diz o CÓDIGO, nunca o texto do banco.
 */
export function fraseDaGravacaoQueFalhou(codigo: string | null): string {
    const nada = 'A gravação foi desfeita inteira: nada foi alterado, e o conteúdo anterior da tabela continua como estava.'
    if (codigo === '57014') {
        return `A importação não foi gravada: a gravação passou do limite de tempo do banco (${LIMITE_DA_GRAVACAO_S} s) e foi interrompida. ${nada}`
    }
    if (codigo === '55P03') {
        return `A importação não foi gravada: a tabela estava travada por outra operação (outra importação ou uma alteração dela), e a espera passou do limite do banco. ${nada}`
    }
    if (codigo) return `A importação não foi gravada: o banco recusou a gravação (código ${codigo}). ${nada}`
    return 'A importação não foi gravada. O conteúdo anterior da tabela continua como estava.'
}
