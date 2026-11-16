/**
 * O DESENHO DA TIPOLOGIA, lido do banco e do Storage — a metade impura de `desenho-do-catalogo.ts`.
 *
 * A escolha é dele, e é UMA SÓ (regra do dono do produto, 11/11/2026): "Nenhuma cópia do critério. Se o levantamento
 * e o orçamento escolherem por caminhos diferentes, um dia mostram figuras diferentes para o mesmo item, e aí
 * ninguém sabe qual foi confirmada." Aqui só se lê o catálogo, se baixa o arquivo e se devolve o que o PDF desenha.
 *
 * SÓ SERVIDOR (`service_role`): a tabela e o bucket são do catálogo da plataforma, não da conta.
 *
 * SEM A MIGRAÇÃO, ou com o Storage fora do ar, NÃO SE DESENHA NADA e a falta é nomeada — nunca a figura mais
 * parecida, nunca uma caixa vazia sem explicação.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { BUCKET_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import { escolherDesenho, type DesenhoDoCatalogo, type EscolhaDoDesenho } from './desenho-do-catalogo'

export const TABELA_DOS_DESENHOS = 'orcamentista_tipologia_desenho'
/** As colunas que a escolha lê. `codigo_dp` NÃO está aqui: é dado, nunca chave (12/11/2026). */
export const COLUNAS_DO_DESENHO = 'fonte, grupo, codigo, descricao, condicao, caminho_no_storage'
export const fraseSemCatalogo = 'o catálogo de desenhos ainda não foi importado: os itens saem sem figura'
export const fraseDoArquivoQueNaoBaixou = (tipologia: string) =>
    `o desenho da tipologia ${tipologia} não pôde ser lido do Storage: o item sai sem figura`

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a tabela do catálogo é posterior a `database.types.ts`
const db = () => supabaseAdmin as any
const semTabela = (codigo: string | undefined) => codigo === '42P01' || codigo === 'PGRST205'

export type CatalogoDeDesenhos =
    | { ok: true; linhas: DesenhoDoCatalogo[] }
    | { ok: false; motivo: 'sem_migracao' | 'falhou'; detalhe: string }

/** O catálogo inteiro, de mil em mil (o PostgREST corta em mil, e cortar aqui deixaria tipologia sem figura sem razão). */
export async function lerCatalogoDeDesenhos(): Promise<CatalogoDeDesenhos> {
    const linhas: DesenhoDoCatalogo[] = []
    const PAGINA = 1000
    for (let de = 0; ; de += PAGINA) {
        const { data, error } = await db().from(TABELA_DOS_DESENHOS).select(COLUNAS_DO_DESENHO).order('codigo').range(de, de + PAGINA - 1)
        if (error) return { ok: false, motivo: semTabela(error.code) ? 'sem_migracao' : 'falhou', detalhe: `${TABELA_DOS_DESENHOS}: ${error.code ?? error.message}` }
        const pagina = (data ?? []) as DesenhoDoCatalogo[]
        linhas.push(...pagina)
        if (pagina.length < PAGINA) return { ok: true, linhas }
    }
}

/** A imagem que o jsPDF desenha: o data URL e o formato, pelo que o nome do arquivo diz. */
export type ImagemDoDesenho = { dados: string; formato: 'PNG' | 'JPEG' }
export const formatoDoArquivo = (caminho: string): 'PNG' | 'JPEG' | null =>
    (/\.png$/i.test(caminho) ? 'PNG' : /\.jpe?g$/i.test(caminho) ? 'JPEG' : null)

/** Baixa UM desenho do bucket. Nulo quando não baixa — e quem chama nomeia a falta, nunca desenha outra coisa. */
export async function baixarDesenho(caminho: string): Promise<ImagemDoDesenho | null> {
    const formato = formatoDoArquivo(caminho)
    if (formato === null) return null
    try {
        const { data, error } = await db().storage.from(BUCKET_DO_CATALOGO).download(caminho)
        if (error || !data) return null
        const b64 = Buffer.from(await data.arrayBuffer()).toString('base64')
        if (b64 === '') return null
        return { dados: `data:image/${formato === 'PNG' ? 'png' : 'jpeg'};base64,${b64}`, formato }
    } catch {
        return null
    }
}

export type DesenhoDoItem =
    | { imagem: ImagemDoDesenho; degrau: 'por_variavel' | 'principal' }
    | { frase: string }
export type ItemComDesenho = { tipologia: string; descricao: string | null; familia: string | null; valores: Readonly<Record<string, number>> }

/**
 * Os desenhos de uma lista de itens, na mesma ordem. UM download por caminho (dois itens da mesma tipologia com as
 * mesmas escolhas baixam uma vez só), e a falta de cada item vai NOMEADA.
 */
export async function desenhosDosItens(itens: readonly ItemComDesenho[], catalogo: CatalogoDeDesenhos): Promise<DesenhoDoItem[]> {
    if (!catalogo.ok) return itens.map(() => ({ frase: fraseSemCatalogo }))
    const escolhas: EscolhaDoDesenho[] = itens.map((i) => escolherDesenho(i, catalogo.linhas))
    const caminhos = [...new Set(escolhas.flatMap((e) => ('caminho' in e ? [e.caminho] : [])))]
    const baixados = new Map<string, ImagemDoDesenho | null>()
    for (const c of caminhos) baixados.set(c, await baixarDesenho(c))
    return escolhas.map((e, k) => {
        if (!('caminho' in e)) return { frase: e.frase }
        const imagem = baixados.get(e.caminho) ?? null
        return imagem === null ? { frase: fraseDoArquivoQueNaoBaixou(itens[k].tipologia) } : { imagem, degrau: e.degrau }
    })
}

/**
 * A FIGURA (ou a frase da falta) em cada item — o ÚNICO caminho dos lugares que mostram o desenho (o arquivo do
 * levantamento, o arquivo do orçamento e a tela), para nunca mostrarem figuras diferentes do mesmo item.
 *
 * `alvos` é a lista PARALELA a `itens`: o que cada um é para a escolha, ou `null` quando não há tipologia — e aí o
 * item fica como está, sem figura e sem frase (não há tipologia a nomear). `por` devolve o item com a figura ou com a
 * frase da falta.
 */
export async function comAsFiguras<T>(
    itens: readonly T[],
    alvos: ReadonlyArray<ItemComDesenho | null>,
    por: (i: T, d: DesenhoDoItem) => T,
    catalogo?: CatalogoDeDesenhos,
): Promise<T[]> {
    const escolher = itens.map((_i, k) => ({ k, d: alvos[k] ?? null })).filter((x): x is { k: number; d: ItemComDesenho } => x.d !== null)
    if (escolher.length === 0) return [...itens]
    const desenhos = await desenhosDosItens(escolher.map((x) => x.d), catalogo ?? (await lerCatalogoDeDesenhos()))
    const porItem = new Map(escolher.map((x, i) => [x.k, desenhos[i]]))
    return itens.map((i, k) => {
        const d = porItem.get(k)
        return d === undefined ? i : por(i, d)
    })
}
