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
 * O CABEÇALHO: no motor e na família é a PRIMEIRA linha da aba (medido pelo dono do produto). Na
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

/**
 * O nome da coluna do banco que guarda a categoria COMO VEIO DO ARQUIVO DO FORNECEDOR, nas duas
 * tabelas (o item do preço e a regra do motor). DECLARADO AQUI E SÓ AQUI — decisão do dono do
 * produto, 20/10/2026: é o nome da coluna do arquivo, e renomeá-la faria o código mentir sobre o
 * arquivo. Esta linha é a exceção nominal do portão de vocabulário.
 */
export const COLUNA_DA_CATEGORIA_DO_FORNECEDOR = 'segmento' as const

/** A chave da categoria do fornecedor, pela constante. */
type CategoriaDoFornecedor = { [K in typeof COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: string | null }

// ── O mapa medido ──────────────────────────────────────────────────────────────────────────
export const ABAS_DA_IMPORTACAO = {
    /** No arquivo da TABELA. */
    preco: 'Tabela Wolff',
    /** No arquivo do MOTOR. */
    motor: 'Motor por barra',
    familia: 'Fórmulas da família',
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

/** Aba da família. A PRIMEIRA linha da aba é o cabeçalho, e é pulada. */
const COL_FAMILIA = { linha_original: 1, variavel: 2, descricao: 3, formula: 4, formula_em_lh: 5, pct_padrao: 7 } as const

// ── O que sai ──────────────────────────────────────────────────────────────────────────────
/** Uma linha de `orcamentista_tabela_item`, sem `id` e `tabela_id`. A categoria vem em `CategoriaDoFornecedor`. */
export type ItemLido = CategoriaDoFornecedor & {
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
    }
    | { ok: false; erro: string }

export interface ArquivoDaImportacao { nome: string; bytes: Uint8Array }

// ── O conversor ÚNICO de célula: mora em `atendimentos-ia-importacao-celula.ts` ─────────────────
import { valorDaCelula, type ValorLido } from '@/utils/atendimentos-ia-importacao-celula'
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

/** O nome da linha na família: sem o prefixo "PVC " — a regra diz "EUROPA 42", a família "PVC EUROPA 42". */
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

interface Secao { titulo: string | null; aliquota: number | null; vendidoPor: 'barra' | 'unidade' | null }

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
    return { titulo, aliquota, vendidoPor }
}

const valoresDoItem = (i: ItemLido) => [i.valor_metro_interno, i.valor_metro_12, i.valor_barra_interno, i.valor_barra_12, i.aliquota_interna_pct]

function lerPreco(ws: ExcelJS.Worksheet): { itens: ItemLido[]; avisos: Aviso[]; normalizados: number } {
    const aba = ABAS_DA_IMPORTACAO.preco
    const l = new Leitor(aba, ws)
    const ultima = ws.rowCount
    const cabecalhos = new Set<number>()
    for (let r = 1; r <= ultima; r++) if (ehCabecalhoDoPreco(valorDaCelula(ws.getRow(r).getCell(COL_PRECO.codigo).value).valor)) cabecalhos.add(r)
    const titulos = new Set([...cabecalhos].map((r) => r - 1))

    const itens: ItemLido[] = []
    const primeiraLinha = new Map<string, { linha: number; item: ItemLido }>()
    let secao: Secao = { titulo: null, aliquota: null, vendidoPor: null }
    for (let r = 1; r <= ultima; r++) {
        if (cabecalhos.has(r)) { secao = secaoDoCabecalho(l, aba, r); continue }
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
        }
        const antes = primeiraLinha.get(codigo)
        if (!antes) { primeiraLinha.set(codigo, { linha: r, item }); itens.push(item); continue }
        // Código repetido: fica a PRIMEIRA. Decisão da sessão de verificação, 20/10/2026, que o dono
        // do produto pode derrubar (cabeçalho da `20261020000001`). Só é segura enquanto as duas
        // linhas forem o mesmo preço — e o aviso diz, em voz alta, quando não são.
        l.normalizados += 1
        const batem = valoresDoItem(antes.item).every((v, k) => v === valoresDoItem(item)[k])
        l.avisos.push({
            tipo: 'codigo_repetido', aba, codigo, linhas: [antes.linha, r], secoes: [antes.item.secao, item.secao], valores_batem: batem,
            mensagem: batem
                ? `código ${codigo} repetido (linhas ${antes.linha} e ${r}), com os mesmos valores: ficou a primeira`
                : `VALORES DIFERENTES — código ${codigo} repetido (linhas ${antes.linha} e ${r}) com preços diferentes. Ficou a primeira; a decisão volta para o dono do produto.`,
        })
    }
    return { itens, avisos: l.avisos, normalizados: l.normalizados }
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

function lerFamilia(ws: ExcelJS.Worksheet): { formulas: FormulaLida[]; avisos: Aviso[] } {
    const l = new Leitor(ABAS_DA_IMPORTACAO.familia, ws)
    const formulas: FormulaLida[] = []
    for (let r = 2; r <= ws.rowCount; r++) {
        if (l.linhaVazia(r)) continue
        const linhaOriginal = l.texto(r, COL_FAMILIA.linha_original)
        formulas.push({
            linha: normalizarLinha(linhaOriginal),
            linha_original: linhaOriginal,
            variavel: l.texto(r, COL_FAMILIA.variavel),
            descricao: l.texto(r, COL_FAMILIA.descricao),
            formula: l.texto(r, COL_FAMILIA.formula),
            formula_em_lh: l.texto(r, COL_FAMILIA.formula_em_lh),
            pct_padrao: l.numero(r, COL_FAMILIA.pct_padrao),
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

/** Lê os dois arquivos e devolve as linhas prontas para gravar, as contagens e os avisos. */
export async function lerArquivosDaImportacao(arquivos: { tabela: ArquivoDaImportacao; motor: ArquivoDaImportacao }): Promise<ResultadoDaLeitura> {
    const wbTabela = await abrir(arquivos.tabela)
    if (typeof wbTabela === 'string') return { ok: false, erro: wbTabela }
    const wbMotor = await abrir(arquivos.motor)
    if (typeof wbMotor === 'string') return { ok: false, erro: wbMotor }

    const wsPreco = aba(wbTabela, arquivos.tabela.nome, ABAS_DA_IMPORTACAO.preco)
    if (typeof wsPreco === 'string') return { ok: false, erro: wsPreco }
    const wsMotor = aba(wbMotor, arquivos.motor.nome, ABAS_DA_IMPORTACAO.motor)
    if (typeof wsMotor === 'string') return { ok: false, erro: wsMotor }
    const wsFamilia = aba(wbMotor, arquivos.motor.nome, ABAS_DA_IMPORTACAO.familia)
    if (typeof wsFamilia === 'string') return { ok: false, erro: wsFamilia }

    // as nove abas por tipologia: uma aba ou coluna que falte, um valor inválido ou uma chave repetida
    // RECUSAM a importação inteira, com todas as frases de uma vez — nada é gravado pela metade
    const abasDoMotor = lerAbasDoMotor(wbMotor)
    if ('erros' in abasDoMotor) return { ok: false, erro: fraseDoArquivo(arquivos.motor.nome, abasDoMotor.erros.join(' ')) }

    const preco = lerPreco(wsPreco)
    const motor = lerMotor(wsMotor)
    const familia = lerFamilia(wsFamilia)
    const resumo = resumirTipologias(motor.regras)

    const codigosDoPreco = new Set(preco.itens.map((i) => i.codigo))
    const codigosDoMotor = [...new Set(motor.regras.map((r) => r.codigo))]
    const semPreco = codigosDoMotor.filter((c) => !codigosDoPreco.has(c))
    const avisos: Aviso[] = [...preco.avisos, ...motor.avisos, ...familia.avisos, ...resumo.avisos]
    if (semPreco.length > 0) {
        avisos.push({ tipo: 'codigo_do_motor_sem_preco', codigos: semPreco, mensagem: `${semPreco.length} código(s) do motor não estão na tabela de preço` })
    }

    return {
        ok: true,
        itens: preco.itens,
        regras: motor.regras,
        tipologias: resumo.tipologias,
        formulas: familia.formulas,
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

// ── A trava do tempo ───────────────────────────────────────────────────────────────────────
/** Quantas tipologias da tabela têm tempo de fabricação gravado: o total e por origem. */
export interface TemposGravados { total: number; ESTIMADO: number; IMPORTADO: number }

/**
 * A recusa da importação em tabela com tempo de fabricação gravado (decisão do dono do produto,
 * 24/10/2026). A função `importar_conteudo_da_tabela` apaga e regrava `orcamentista_motor_tipologia`
 * SEM as colunas de tempo: importar apagaria os tempos mesmo com o arquivo idêntico. A trava sai
 * quando o tempo tiver tabela própria, que a importação não apaga.
 */
export function fraseDaImportacaoTravadaPeloTempo(t: TemposGravados): string {
    const outras = t.total - t.ESTIMADO - t.IMPORTADO
    const partes = [`${t.ESTIMADO} ESTIMADO`, `${t.IMPORTADO} IMPORTADO`, ...(outras > 0 ? [`${outras} de outra origem`] : [])]
    return `A importação está travada para esta tabela: ${t.total} tipologias têm tempo de fabricação gravado `
        + `(${partes.join(', ')}). A importação apaga e regrava as tipologias sem o tempo, e esses tempos se `
        + `perderiam. Nada foi alterado. A trava sai quando o tempo tiver tabela própria.`
}
