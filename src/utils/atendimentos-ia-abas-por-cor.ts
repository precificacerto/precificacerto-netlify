/**
 * PERFIS POR COR EM ABAS (dono do produto, pedido 0055). Uma ABA por cor: o nome da aba é o nome canônico da cor do fornecedor
 * (`orcamentista_fornecedor_cor`), e cada aba traz as colunas REFERÊNCIA, CÓDIGO DO FORNECEDOR, DESCRIÇÃO, PREÇO e BARRA.
 *
 * A cor vem da ABA e a referência vem da COLUNA; o importador NÃO decifra a cor — nem a referência — pelo código (IL4236 não é "IL42 + 36"). O
 * código com o sufixo da cor mascarava a busca do motor: IL42 existia em PRETO LISO, mas sem a coluna de referência a peça saía "não encontrada".
 *
 * Este módulo é PURO (sem exceljs, sem o importador): as frases de recusa, o reconhecimento dos cabeçalhos e as duas contas da tela — o quadro
 * "cor × quantidade de referências" e a lista do que falta em cada cor contra o BRANCO. A leitura da planilha está em `atendimentos-ia-importacao.ts`.
 */

/** A cor que serve de base para a conferência "cada cor com as mesmas referências do BRANCO" (pedido 0055, item 4). */
export const COR_BASE_DAS_ABAS = 'BRANCO'

export const COLUNAS_DA_ABA_POR_COR = ['REFERÊNCIA', 'CÓDIGO DO FORNECEDOR', 'DESCRIÇÃO', 'PREÇO', 'BARRA'] as const
export type ColunaDaAbaPorCor = 'referencia' | 'codigo' | 'descricao' | 'preco' | 'barra' | 'cor'
/** A aba do perfil de DUAS cores (lado maior e lado menor): a cor completa de cada linha vem da coluna COR (dono do produto, 0055b). */
export const ABA_BICOLOR = 'BICOLOR'
export const COLUNA_DA_COR_DA_BICOLOR = 'COR'

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

/** Os nomes que cada coluna aceita no cabeçalho (sem caixa, sem acento): o nome do pedido, e o curto. */
const NOMES: Record<ColunaDaAbaPorCor, readonly string[]> = {
    referencia: ['REFERENCIA'],
    codigo: ['CODIGO DO FORNECEDOR', 'CODIGO'],
    descricao: ['DESCRICAO'],
    preco: ['PRECO'],
    barra: ['BARRA'],
    cor: ['COR'],
}
export const COLUNAS_DA_ABA_NA_ORDEM: readonly ColunaDaAbaPorCor[] = ['referencia', 'codigo', 'descricao', 'preco', 'barra']
export const nomeDaColunaDaAba = (c: ColunaDaAbaPorCor): string => (c === 'cor' ? COLUNA_DA_COR_DA_BICOLOR : COLUNAS_DA_ABA_POR_COR[COLUNAS_DA_ABA_NA_ORDEM.indexOf(c as Exclude<ColunaDaAbaPorCor, 'cor'>)])

/** A coluna que o texto do cabeçalho nomeia, ou null. */
export function colunaDoCabecalho(texto: string): ColunaDaAbaPorCor | null {
    const t = sem(texto)
    return (Object.keys(NOMES) as ColunaDaAbaPorCor[]).find((c) => NOMES[c].includes(t)) ?? null
}
/** O arquivo é "por abas de cor" quando alguma aba traz a coluna REFERÊNCIA na linha 1. */
export const cabecalhoDeAbaPorCor = (textosDaLinha1: readonly string[]): boolean => textosDaLinha1.some((t) => colunaDoCabecalho(t) === 'referencia')

const lista = (xs: readonly string[], max = 12) => `${xs.slice(0, max).join('; ')}${xs.length > max ? `; e mais ${xs.length - max}` : ''}`

export const FRASE_DAS_ABAS_SEM_LISTA_DE_CORES =
    'o arquivo é de perfis por cor (uma aba por cor), mas o fornecedor não tem a lista de cores: sem ela não há como conferir o nome de cada aba. Cadastre as cores do fornecedor. Nada foi gravado.'
export const fraseDasAbasForaDaLista = (abas: readonly string[], cores: readonly string[]) =>
    `${abas.length === 1 ? 'a aba' : 'as abas'} ${abas.map((a) => `"${a}"`).join(', ')} ${abas.length === 1 ? 'não tem' : 'não têm'} o nome de uma cor do fornecedor. `
    + `O nome da aba é o nome da cor, como está na lista: ${lista(cores, 40)}. Nada foi gravado.`
export const fraseDasAbasDaMesmaCor = (grupos: ReadonlyArray<{ cor: string; abas: readonly string[] }>) =>
    `mais de uma aba é da mesma cor — ${grupos.map((g) => `${g.cor}: ${g.abas.map((a) => `"${a}"`).join(' e ')}`).join('; ')}. Uma aba por cor. Nada foi gravado.`
export const fraseDaAbaSemColunas = (aba: string, faltam: readonly string[]) =>
    `a aba "${aba}" não tem ${faltam.length === 1 ? 'a coluna' : 'as colunas'} ${faltam.join(', ')} na linha 1 (as cinco: ${COLUNAS_DA_ABA_POR_COR.join(', ')}). Nada foi gravado.`
export const fraseDaAbaComColunaRepetida = (aba: string, repetidas: readonly string[]) =>
    `a aba "${aba}" tem coluna repetida no cabeçalho (${repetidas.join(', ')}): não sei qual ler. Nada foi gravado.`
export const fraseDasLinhasSemReferencia = (linhas: ReadonlyArray<{ aba: string; linha: number; codigo: string }>) =>
    `${linhas.length} ${linhas.length === 1 ? 'linha veio' : 'linhas vieram'} sem a referência — ${lista(linhas.map((l) => `aba "${l.aba}", linha ${l.linha} (${l.codigo})`), 20)}. `
    + 'A cor vem da aba e a referência vem da coluna REFERÊNCIA; o sistema não a deduz do código. Nada foi gravado.'
export const fraseDasCelulasInvalidasDasAbas = (cs: ReadonlyArray<{ aba: string; linha: number; coluna: string; valor: string }>) =>
    `${cs.length} ${cs.length === 1 ? 'célula' : 'células'} em coluna numérica ${cs.length === 1 ? 'não é número' : 'não são números'}: `
    + `${lista(cs.map((c) => `aba "${c.aba}", linha ${c.linha}, ${c.coluna} = "${c.valor}"`), 10)}. Vazio é "não informado" e texto não vira zero. Nada foi gravado.`
export const fraseDasLinhasSemCodigo = (linhas: ReadonlyArray<{ aba: string; linha: number }>) =>
    `${linhas.length} ${linhas.length === 1 ? 'linha veio' : 'linhas vieram'} sem o código do fornecedor — ${lista(linhas.map((l) => `aba "${l.aba}", linha ${l.linha}`), 20)}. Nada foi gravado.`
export const fraseDoArquivoSemAbasDeCor = 'o arquivo de perfis por cor não tem nenhuma aba. Nada foi gravado.'

type ComCor = { cor: string | null; referencia_perfil: string | null }

/** O quadro "cor × quantidade de referências": as referências DISTINTAS de cada cor, e as linhas sem referência à parte. Ordem: a base primeiro, depois a cor. */
export function quadroCorPorReferencias(itens: readonly ComCor[]): Array<{ cor: string; referencias: number; semReferencia: number }> {
    const porCor = new Map<string, { refs: Set<string>; sem: number }>()
    for (const i of itens) {
        if (i.cor === null) continue
        const g = porCor.get(i.cor) ?? { refs: new Set<string>(), sem: 0 }
        if (i.referencia_perfil === null) g.sem += 1
        else g.refs.add(i.referencia_perfil)
        porCor.set(i.cor, g)
    }
    return [...porCor.entries()]
        .map(([cor, g]) => ({ cor, referencias: g.refs.size, semReferencia: g.sem }))
        .sort((a, b) => (a.cor === COR_BASE_DAS_ABAS ? -1 : b.cor === COR_BASE_DAS_ABAS ? 1 : a.cor < b.cor ? -1 : a.cor > b.cor ? 1 : 0))
}

/** Cada cor contra o BRANCO: as referências que o BRANCO tem e ela não (`faltam`), e as que ela tem e o BRANCO não (`sobram`). Sem aba BRANCO, nada a comparar. */
export function faltasPorCor(itens: readonly ComCor[]): Array<{ cor: string; faltam: string[]; sobram: string[] }> {
    const refsDa = (cor: string) => new Set(itens.filter((i) => i.cor === cor && i.referencia_perfil !== null).map((i) => i.referencia_perfil as string))
    if (!itens.some((i) => i.cor === COR_BASE_DAS_ABAS)) return []
    const base = refsDa(COR_BASE_DAS_ABAS)
    const cores = [...new Set(itens.map((i) => i.cor).filter((c): c is string => c !== null && c !== COR_BASE_DAS_ABAS))].sort()
    return cores.map((cor) => {
        const dela = refsDa(cor)
        return { cor, faltam: [...base].filter((r) => !dela.has(r)).sort(), sobram: [...dela].filter((r) => !base.has(r)).sort() }
    })
}

export const FRASE_DAS_ABAS_SEM_CATEGORIA_DE_PERFIL =
    'o arquivo é de perfis por cor (uma aba por cor), e a tabela não tem uma categoria de perfil declarada: a referência da coluna só é gravada na tabela de PERFIL (ou outra categoria declarada que não seja vidro). Declare a categoria da tabela e importe de novo. Nada foi gravado.'

/** Um item da tabela como a tela das abas o mostra. */
export type ItemDaAba = { codigo: string; descricao: string | null; cor: string | null; referencia_perfil: string | null; custo: number | null; medida_barra_m: number | null }
export type PerfisPorCor = {
    /** O quadro cor × quantidade de referências. */
    quadro: Array<{ cor: string; referencias: number; semReferencia: number; itens: number }>
    /** Cada cor contra o BRANCO. */
    faltas: Array<{ cor: string; faltam: string[]; sobram: string[] }>
    /** As abas: uma por cor, na ordem do quadro, com os itens por referência. */
    abas: Array<{ cor: string; itens: ItemDaAba[] }>
}

/** O que a tela mostra de uma tabela de perfis: as abas por cor, o quadro e as faltas. Itens sem cor ficam fora das abas (e `null` se nenhum item tem cor). */
export function perfisPorCor(itens: readonly ItemDaAba[]): PerfisPorCor | null {
    const comCor = itens.filter((i) => i.cor !== null)
    if (comCor.length === 0) return null
    const quadro = quadroCorPorReferencias(comCor).map((q) => ({ ...q, itens: comCor.filter((i) => i.cor === q.cor).length }))
    const abas = quadro.map((q) => ({
        cor: q.cor,
        itens: comCor.filter((i) => i.cor === q.cor).sort((a, b) => (a.referencia_perfil ?? '\uffff').localeCompare(b.referencia_perfil ?? '\uffff') || a.codigo.localeCompare(b.codigo)),
    }))
    return { quadro, faltas: faltasPorCor(comCor), abas }
}

/** O número do banco (numeric vem como texto) ou nulo: vazio e ausente NÃO viram zero (`ausente-vs-falso.md`). */
const numeroOuNulo = (v: unknown): number | null => (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? null : Number.isFinite(Number(v)) ? Number(v) : null)
/** A linha de `orcamentista_tabela_item` como a tela das abas a usa. */
export const itemDaAbaDoBanco = (l: Record<string, unknown>): ItemDaAba => ({
    codigo: String(l.codigo), descricao: (l.descricao as string | null) ?? null, cor: (l.cor as string | null) ?? null,
    referencia_perfil: (l.referencia_perfil as string | null) ?? null, custo: numeroOuNulo(l.custo), medida_barra_m: numeroOuNulo(l.medida_barra_m),
})

/** O LADO de uma cor de perfil bicolor ("… LADO MAIOR", "… LADO MENOR"): a cor é o nome da lista, e o lado vem depois dele. */
const COM_O_LADO = /\s+LADO\s+(MAIOR|MENOR)$/
export const fraseDaBicorSemCor = (linhas: ReadonlyArray<{ linha: number; codigo: string }>) =>
    `${linhas.length} ${linhas.length === 1 ? 'linha' : 'linhas'} da aba ${ABA_BICOLOR} ${linhas.length === 1 ? 'veio' : 'vieram'} sem a cor — ${lista(linhas.map((l) => `linha ${l.linha} (${l.codigo})`), 20)}. Na aba ${ABA_BICOLOR} a cor completa de cada linha vem da coluna ${COLUNA_DA_COR_DA_BICOLOR}. Nada foi gravado.`
export const fraseDaAbaBicorSemAColunaCor = `a aba ${ABA_BICOLOR} não tem a coluna ${COLUNA_DA_COR_DA_BICOLOR} na linha 1: a cor completa de cada linha (ex.: "PRETO LISO LADO MAIOR") vem dela. Nada foi gravado.`
export const fraseDasCoresDaBicorInvalidas = (cs: ReadonlyArray<{ linha: number; cor: string }>, cores: readonly string[]) =>
    `${cs.length} ${cs.length === 1 ? 'cor' : 'cores'} da aba ${ABA_BICOLOR} ${cs.length === 1 ? 'não vale' : 'não valem'} — ${lista(cs.map((c) => `linha ${c.linha}: "${c.cor}"`), 12)}. Cada parte da cor é um nome da lista do fornecedor seguido de LADO MAIOR ou LADO MENOR (as duas cores separadas por "/"): ${lista(cores, 40)}. Nada foi gravado.`
/** Confere a COR de uma linha da BICOLOR: cada parte (separadas por "/") = nome da lista + LADO MAIOR|MENOR. `canonica` mapeia a cor comparável ao nome da lista. */
export function corDaBicorValida(cor: string, ehDaLista: (nome: string) => boolean): boolean {
    const partes = cor.split('/').map((p) => p.trim().toUpperCase()).filter((p) => p !== '')
    if (partes.length === 0) return false
    return partes.every((p) => COM_O_LADO.test(p) && ehDaLista(p.replace(COM_O_LADO, '')))
}
