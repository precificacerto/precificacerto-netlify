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
 * O CÓDIGO ESCOLHIDO VENCE O TEXTO (3.5): quando o item da esquadria tem `vidro_codigo`, quem chama acha o item por ele e não traduz nada.
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

export type ItemDeVidro = { codigo: string; descricao?: string | null }
export type MotivoDoVidro = 'VIDRO_NAO_DITO' | 'VIDRO_NAO_TRADUZIDO' | 'VIDRO_AMBIGUO' | 'VIDRO_SEM_CADASTRO' | 'VIDRO_CODIGO_FORA_DA_TABELA'
export type TraducaoDoVidro<I> = { item: I; como: 'codigo' | 'texto' } | { motivo: MotivoDoVidro; frase: string; candidatos: I[] }

/** Os candidatos: todo atributo DITO tem de bater; o que não foi dito não filtra. O composto só sem espessura e sem tipo ditos. */
export function candidatosDoVidro<I extends ItemDeVidro>(dito: VidroDito, itens: readonly I[]): I[] {
    return itens.filter((i) => {
        const v = vidroDoItem(i.descricao)
        if (v.composto && (dito.espessura !== null || dito.tipo !== null)) return false
        if (dito.familia !== null && !v.familias.includes(dito.familia)) return false
        if (dito.tipo !== null && !v.tipos.includes(dito.tipo)) return false
        if (dito.espessura !== null && v.espessura !== dito.espessura) return false
        return true
    })
}

/** O item do vidro: pelo código escolhido, quando há; senão, pelo texto. */
export function traduzirVidro<I extends ItemDeVidro>(texto: string | null | undefined, codigoEscolhido: string | null | undefined, itens: readonly I[]): TraducaoDoVidro<I> {
    if (codigoEscolhido) {
        const achados = itens.filter((i) => i.codigo === codigoEscolhido)
        if (achados.length === 1) return { item: achados[0], como: 'codigo' }
        return { motivo: 'VIDRO_CODIGO_FORA_DA_TABELA', frase: `o vidro escolhido (${codigoEscolhido}) não está na tabela de vidro da conta`, candidatos: [] }
    }
    if (texto === null || texto === undefined || texto.trim() === '') return { motivo: 'VIDRO_NAO_DITO', frase: 'o vidro do item não foi dito', candidatos: [] }
    const dito = vidroDito(texto)
    if (dito.tipo === null && dito.espessura === null && dito.familia === null) {
        return { motivo: 'VIDRO_NAO_TRADUZIDO', frase: `o vidro “${texto.trim()}” não diz tipo, espessura nem família que a tabela de vidro tenha`, candidatos: [] }
    }
    const candidatos = candidatosDoVidro(dito, itens)
    if (candidatos.length === 1) return { item: candidatos[0], como: 'texto' }
    if (candidatos.length > 1) {
        return { motivo: 'VIDRO_AMBIGUO', candidatos,
            frase: `o vidro “${texto.trim()}” bate com ${candidatos.length} itens da tabela de vidro, e nenhum é escolhido: ${candidatos.map((c) => `${c.codigo}${c.descricao ? ` (${c.descricao})` : ''}`).join('; ')}` }
    }
    return { motivo: 'VIDRO_SEM_CADASTRO', candidatos: [], frase: `o vidro “${texto.trim()}” não existe na tabela de vidro da conta (falta de cadastro)` }
}
