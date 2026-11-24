import { COLUNA_DA_CATEGORIA_DO_FORNECEDOR, type CategoriaDoFornecedor } from '@/utils/atendimentos-ia-importacao-celula'

/**
 * A TRADUÇÃO DO VIDRO (dono do produto, 12/11/2026, o comando único, 3.4): o texto que o vendedor disse ("comum 6 mm incolor", "5mm", "mini
 * boreal") vira o ITEM da tabela de vidro — só quando o que foi dito fecha num item ÚNICO.
 *
 * Do texto saem três atributos, e só os que foram DITOS contam (nada se assume):
 *   - TIPO: COMUM, TEMPERADO (ou TEMP.) ou LAMINADO;
 *   - ESPESSURA em mm: "6 mm", "8mm", "incolor 4" (o número solto), "7,5", e o laminado "3+3";
 *   - FAMÍLIA: INCOLOR, FUME (FUMÊ), MINI BOREAL (BOREAL), ACIDATO, REFLECT, SG NEUTRAL.
 * Do item, os mesmos três, lidos da DESCRIÇÃO. O item COMPOSTO (duplo `DP…`, laminado montado `LAM…+…` — a descrição tem "/" ou " + ") não tem
 * UMA espessura nem UM tipo: ele só é candidato quando o texto não diz espessura nem tipo, e a família dita está entre as dele. Por isso "mini
 * boreal" acha CINCO itens (os três de mini boreal e os dois compostos com ele) e "5mm" acha só o VIN05.
 *
 * O resultado: UM item → o item; mais de um → AMBÍGUO, com os candidatos (nunca o primeiro); nenhum → SEM CADASTRO ("temperado 5mm", "vidro
 * comum 8 mm incolor"), para o dono do produto ver o que falta na tabela; nada reconhecível no texto → NÃO TRADUZIDO. Tudo é falta nomeada.
 *
 * O PADRÃO DA EMPRESA DESEMPATA (15/11/2026): “mini boreal”, sem espessura, acha vários itens; se EXATAMENTE UM deles for um código que a
 * empresa cadastrou como vidro padrão, é ele, e `como` é `padrao`. Mais de um padrão entre os candidatos, ou nenhum: segue AMBÍGUO.
 *
 * O CÓDIGO ESCOLHIDO VENCE O TEXTO (3.5): quando o item da esquadria tem `vidro_codigo`, quem chama acha o item por ele e não traduz nada.
 *
 * A REFERÊNCIA ÚNICA DO VIDRO É O `codigo_wvetro` (dono do produto, 24/11/2026; migração 20261124000001): o padrão da empresa e o vidro escolhido
 * (`vidro_codigo`) guardam a REFERÊNCIA — tipo + cor + espessura, "a grafia coerência com a descrição" (VFIN05 = Float INcolor 05), a mesma em
 * todos os fornecedores —, e ela é procurada, IGUAL, na coluna `codigo_wvetro` dos itens do fornecedor principal. Nunca no código do fornecedor
 * (LJ-VFIN05) e nunca no vidro parecido: referência que o principal não tem é falta nomeada. O que o vendedor DIZ segue pelo texto, como antes.
 * Puro: não lê banco.
 */

export type TipoDoVidro = 'COMUM' | 'TEMPERADO' | 'LAMINADO'
export type FamiliaDoVidro = 'INCOLOR' | 'FUME' | 'MINI BOREAL' | 'ACIDATO' | 'REFLECT' | 'SG NEUTRAL'
/** O que o texto diz: cada atributo, ou null quando não foi dito. */
export type VidroDito = { tipo: TipoDoVidro | null; espessura: string | null; familia: FamiliaDoVidro | null }
/** O que o item diz: o composto tem vários tipos e famílias, e nenhuma espessura única. */
export type VidroDoItem = { tipos: TipoDoVidro[]; espessura: string | null; familias: FamiliaDoVidro[]; composto: boolean }

const normal = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const FAMILIAS: Array<[FamiliaDoVidro, RegExp]> = [
    ['MINI BOREAL', /\b(MINI\s+)?BOREAL\b/],
    ['SG NEUTRAL', /\bSG\s+NEUTRAL\b/],
    ['INCOLOR', /\bINCOLOR\b/],
    ['FUME', /\bFUME\b/],
    ['ACIDATO', /\bACIDATO\b/],
    ['REFLECT', /\bREFLECT\b/],
]
const TIPOS: Array<[TipoDoVidro, RegExp]> = [
    ['TEMPERADO', /\bTEMP(ERADO|\.|\b)/],
    ['LAMINADO', /\bLAMINADO\b/],
    ['COMUM', /\bCOMUM\b/],
]
/** "04" → "4", "7,5" → "7.5", "3+3" fica "3+3". */
function espessuraNormal(bruta: string): string {
    if (bruta.includes('+')) return bruta.split('+').map((x) => String(Number(x.replace(',', '.')))).join('+')
    return String(Number(bruta.replace(',', '.')))
}

/** Os atributos que o TEXTO do vendedor diz. */
export function vidroDito(texto: string | null | undefined): VidroDito {
    const t = normal(texto)
    const familia = FAMILIAS.find(([, re]) => re.test(t))?.[0] ?? null
    const tipo = TIPOS.find(([, re]) => re.test(t))?.[0] ?? null
    // a espessura: "3+3", "6 mm", "8MM", "7,5", ou o número solto ("incolor 4"); o "14" do SG NEUTRAL 14 não é espessura
    const semSG = t.replace(/\bSG\s+NEUTRAL\s+\d+\b/, 'SG NEUTRAL')
    const m = /(\d+(?:[.,]\d+)?\s*\+\s*\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*MM\b|(?<![\d.,])(\d+(?:[.,]\d+)?)(?![\d.,])/.exec(semSG)
    const bruta = m ? (m[1] ?? m[2] ?? m[3]).replace(/\s+/g, '') : null
    return { tipo: tipo ?? (bruta?.includes('+') ? 'LAMINADO' : null), espessura: bruta === null ? null : espessuraNormal(bruta), familia }
}

/** Os atributos que a DESCRIÇÃO do item diz. */
export function vidroDoItem(descricao: string | null | undefined): VidroDoItem {
    const d = normal(descricao)
    const composto = /\/|\s\+\s/.test(d)
    const familias = FAMILIAS.filter(([, re]) => re.test(d)).map(([f]) => f)
    const tipos = TIPOS.filter(([, re]) => re.test(d)).map(([t]) => t)
    if (composto) return { tipos, espessura: null, familias, composto }
    const dito = vidroDito(descricao)
    return { tipos: dito.tipo === null ? tipos : [dito.tipo], espessura: dito.espessura, familias, composto }
}

/**
 * O item da tabela de vidro. A coluna da categoria do fornecedor (`COLUNA_DA_CATEGORIA_DO_FORNECEDOR`, que no vidro traz a VARIANTE) e a `cor`
 * são colunas do arquivo (o layout único, 20261123000004): quando o item traz as DUAS, ele é achado por VARIANTE + COR + ESPESSURA
 * (`candidatosPorAtributo`); sem elas (a tabela de antes, a Estrela), pela descrição, como sempre.
 */
export type ItemDeVidro = { codigo: string; descricao?: string | null; cor?: string | null; codigo_wvetro?: string | null } & Partial<CategoriaDoFornecedor>
/** A referência do item (`codigo_wvetro`), crua: é identidade, não se apara nem se troca a caixa. Sem ela, null. */
export const referenciaDo = (i: ItemDeVidro): string | null => i.codigo_wvetro ?? null
const varianteDo = (i: ItemDeVidro) => i[COLUNA_DA_CATEGORIA_DO_FORNECEDOR]
export type MotivoDoVidro = 'VIDRO_NAO_DITO' | 'VIDRO_NAO_TRADUZIDO' | 'VIDRO_AMBIGUO' | 'VIDRO_SEM_CADASTRO' | 'VIDRO_CODIGO_FORA_DA_TABELA'
export type TraducaoDoVidro<I> = { item: I; como: 'codigo' | 'texto' | 'padrao' } | { motivo: MotivoDoVidro; frase: string; candidatos: I[] }

// ══ O VIDRO POR VARIANTE + COR + ESPESSURA (dono do produto, 23/11/2026) ══
// A categoria é o vidro; aramado, pontilhado, canelado são variantes; e depois a cor. A chave que acha a linha de preço é a VARIANTE (Float,
// Temperado, Laminado PVB opaco…), a COR (INCOLOR, NEUTRO CINZA CLARO…) e a ESPESSURA. A variante e a cor DITAS são procuradas
// no vocabulário da PRÓPRIA tabela (os valores distintos dos itens), do mais longo para o mais curto — "NEUTRO CINZA CLARO" antes de "NEUTRO
// CINZA", "TEMPERADO LAMINADO" antes de "TEMPERADO" —, nunca numa lista do código. O único sinônimo fixo é o do PO: Float é o Comum.
// O item sem espessura identificável (as linhas de duplagem de hoje, adicionais por m²) NÃO é candidato: a duplagem entra quando o fornecedor
// trouxer a composição pronta, como uma linha de vidro (decisão do PO); nada é somado por fora.

/** O item que é achado pelos atributos: traz a variante e a cor. */
export const temAtributos = (i: ItemDeVidro) => normal(varianteDo(i)).trim() !== '' && normal(i.cor).trim() !== ''
/** A espessura do item, da descrição: o total entre parênteses ("4+4MM (8MM)" → 8), senão a medida em mm; sem ela, null. */
export function espessuraDoItem(descricao: string | null | undefined): { total: string | null; composicao: string | null } {
    const d = normal(descricao)
    const comp = /(\d+(?:[.,]\d+)?\s*\+\s*\d+(?:[.,]\d+)?)\s*MM\b/.exec(d)
    const parenteses = /\(\s*(\d+(?:[.,]\d+)?)\s*MM\s*\)/.exec(d)
    const solta = /(?<![\d.,+])(\d+(?:[.,]\d+)?)\s*MM\b/.exec(d)
    const composicao = comp ? espessuraNormal(comp[1].replace(/\s+/g, '')) : null
    const total = parenteses ? espessuraNormal(parenteses[1]) : composicao === null && solta ? espessuraNormal(solta[1]) : null
    return { total, composicao }
}
const SINONIMOS_DA_VARIANTE: ReadonlyArray<[string, string]> = [['COMUM', 'FLOAT']]
const semEspacoSobrando = (t: string) => t.replace(/\s+/g, ' ').trim()
/** A frase mais longa do vocabulário que aparece no texto (palavra inteira), e o texto sem ela. */
function acharNoTexto(texto: string, vocabulario: readonly string[]): { valor: string | null; resto: string } {
    for (const v of [...vocabulario].sort((a, b) => b.length - a.length)) {
        const re = new RegExp(`(^|[^A-Z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?=$|[^A-Z0-9])`)
        const m = re.exec(texto)
        if (m) return { valor: v, resto: texto.slice(0, m.index) + m[1] + ' ' + texto.slice(m.index + m[0].length) }
    }
    return { valor: null, resto: texto }
}
/** O que o texto diz nos termos da tabela: a variante, a cor e a espessura — cada uma, ou null quando não foi dita. */
export type VidroDitoPorAtributo = { variante: string | null; cor: string | null; espessura: string | null }
export function vidroDitoPorAtributo(texto: string | null | undefined, itens: readonly ItemDeVidro[]): VidroDitoPorAtributo {
    const variantes = [...new Set(itens.filter(temAtributos).map((i) => semEspacoSobrando(normal(varianteDo(i)))))]
    const cores = [...new Set(itens.filter(temAtributos).map((i) => semEspacoSobrando(normal(i.cor))))]
    let t = ` ${semEspacoSobrando(normal(texto))} `
    for (const [dito, daTabela] of SINONIMOS_DA_VARIANTE) if (variantes.includes(daTabela)) t = t.replace(new RegExp(`([^A-Z0-9])${dito}(?=[^A-Z0-9])`, 'g'), `$1${daTabela}`)
    const vari = acharNoTexto(t, variantes)
    const cor = acharNoTexto(vari.resto, cores)
    return { variante: vari.valor, cor: cor.valor, espessura: vidroDito(cor.resto).espessura }
}
/** Os candidatos pelos atributos: a variante e a cor exatas (sem caixa, sem acento), a espessura pelo total ou pela composição. */
export function candidatosPorAtributo<I extends ItemDeVidro>(dito: VidroDitoPorAtributo, itens: readonly I[]): I[] {
    return itens.filter((i) => {
        if (!temAtributos(i)) return false
        const e = espessuraDoItem(i.descricao)
        if (e.total === null && e.composicao === null) return false
        if (dito.variante !== null && semEspacoSobrando(normal(varianteDo(i))) !== dito.variante) return false
        if (dito.cor !== null && semEspacoSobrando(normal(i.cor)) !== dito.cor) return false
        if (dito.espessura !== null && dito.espessura !== e.total && dito.espessura !== e.composicao) return false
        return true
    })
}

/** Os candidatos: todo atributo DITO tem de bater; o que não foi dito não filtra. O composto só sem espessura e sem tipo ditos. */
export function candidatosDoVidro<I extends ItemDeVidro>(dito: VidroDito, itens: readonly I[]): I[] {
    return itens.filter((i) => {
        if (temAtributos(i)) return false
        const v = vidroDoItem(i.descricao)
        if (v.composto && (dito.espessura !== null || dito.tipo !== null)) return false
        if (dito.familia !== null && !v.familias.includes(dito.familia)) return false
        if (dito.tipo !== null && !v.tipos.includes(dito.tipo)) return false
        if (dito.espessura !== null && v.espessura !== dito.espessura) return false
        return true
    })
}

/**
 * O PADRÃO DA EMPRESA DESEMPATA (dono do produto, 15/11/2026): quando o texto bate com vários itens e EXATAMENTE UM deles tem a REFERÊNCIA que a
 * empresa cadastrou como vidro padrão (24/11/2026: o padrão guarda a referência, `codigo_wvetro`), é ele. Nada se completa e nada se escolhe por ser o mais barato: o padrão
 * só decide entre os candidatos que o TEXTO já elegeu, e o texto gravado continua sendo o do vendedor (a regra de 04/11/2026). Nenhum padrão
 * entre os candidatos, ou mais de um, continua AMBÍGUO — falta nomeada.
 */
export function desempatarPeloPadrao<I extends ItemDeVidro>(candidatos: readonly I[], codigosPadrao: readonly string[]): I | null {
    const padrao = new Set(codigosPadrao.filter((c) => c !== ''))
    if (padrao.size === 0) return null
    const dos = candidatos.filter((c) => { const r = referenciaDo(c); return r !== null && padrao.has(r) })
    return dos.length === 1 ? dos[0] : null
}

/** A frase da referência escolhida que o principal não tem — ou que ele tem em mais de um item, ou que ele não tem como ter (tabela sem referência). */
export function fraseDaReferenciaForaDaTabela(referencia: string, itens: readonly ItemDeVidro[], achados: number): string {
    if (achados > 1) return `o vidro ${referencia} aparece em ${achados} itens da tabela de vidro do fornecedor principal, e nenhum é escolhido`
    if (itens.length > 0 && !itens.some((i) => referenciaDo(i) !== null)) {
        return `o vidro ${referencia} não tem como ser achado: a tabela de vidro do fornecedor principal não traz a referência (codigo_wvetro) em nenhum item`
    }
    return `o vidro ${referencia} não existe na tabela de vidro do fornecedor principal (a referência é a coluna codigo_wvetro)`
}

/** O item do vidro: pela referência escolhida, quando há; senão, pelo texto — e, no empate, pelo padrão da empresa. */
export function traduzirVidro<I extends ItemDeVidro>(texto: string | null | undefined, codigoEscolhido: string | null | undefined, itens: readonly I[], codigosPadrao: readonly string[] = []): TraducaoDoVidro<I> {
    if (codigoEscolhido) {
        // pela REFERÊNCIA, igual — nunca pelo código do fornecedor nem pelo parecido (24/11/2026)
        const achados = itens.filter((i) => referenciaDo(i) === codigoEscolhido)
        if (achados.length === 1) return { item: achados[0], como: 'codigo' }
        return { motivo: 'VIDRO_CODIGO_FORA_DA_TABELA', frase: fraseDaReferenciaForaDaTabela(codigoEscolhido, itens, achados.length), candidatos: achados }
    }
    if (texto === null || texto === undefined || texto.trim() === '') return { motivo: 'VIDRO_NAO_DITO', frase: 'o vidro do item não foi dito', candidatos: [] }
    const dito = vidroDito(texto)
    const porAtributo = vidroDitoPorAtributo(texto, itens)
    const algoPorAtributo = porAtributo.variante !== null || porAtributo.cor !== null || porAtributo.espessura !== null
    if (dito.tipo === null && dito.espessura === null && dito.familia === null && !algoPorAtributo) {
        return { motivo: 'VIDRO_NAO_TRADUZIDO', frase: `o vidro “${texto.trim()}” não diz tipo, espessura nem família que a tabela de vidro tenha`, candidatos: [] }
    }
    // os itens com variante e cor (a tabela do layout único) pelos atributos; os de antes, pela descrição — os dois juntos, e o empate é nomeado
    const legado = dito.tipo === null && dito.espessura === null && dito.familia === null ? [] : candidatosDoVidro(dito, itens)
    const candidatos = [...(algoPorAtributo ? candidatosPorAtributo(porAtributo, itens) : []), ...legado]
    if (candidatos.length === 1) return { item: candidatos[0], como: 'texto' }
    if (candidatos.length > 1) {
        const doPadrao = desempatarPeloPadrao(candidatos, codigosPadrao)
        if (doPadrao !== null) return { item: doPadrao, como: 'padrao' }
        return { motivo: 'VIDRO_AMBIGUO', candidatos,
            frase: `o vidro “${texto.trim()}” bate com ${candidatos.length} itens da tabela de vidro, e nenhum é escolhido: ${candidatos.map((c) => `${c.codigo}${c.descricao ? ` (${c.descricao})` : ''}`).join('; ')}` }
    }
    return { motivo: 'VIDRO_SEM_CADASTRO', candidatos: [], frase: `o vidro “${texto.trim()}” não existe na tabela de vidro da conta (falta de cadastro)` }
}
