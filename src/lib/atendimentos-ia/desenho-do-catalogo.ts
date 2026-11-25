/**
 * O DESENHO DA TIPOLOGIA, do catálogo importado (`orcamentista_tipologia_desenho`) — a regra do dono do produto de
 * 11/11/2026, implementada em 16/11/2026, quando ele viu que "os desenhos do orçamento e também do levantamento não
 * são os desenhos ao qual a gente escolheu".
 *
 * MEDIDO em 16/11/2026, antes de escrever: os 3.190 desenhos importados em 15/11 NÃO ERAM LIDOS POR NINGUÉM — a
 * única consulta à tabela era a conferência índice × Storage. O levantamento e o orçamento desenhavam um RETÂNGULO
 * gerado por código a partir da descrição ("02 folhas" → duas divisões), que é justamente o que a regra proíbe:
 * "desenho errado é pior que desenho nenhum [...] nunca a figura mais parecida".
 *
 * OS DOIS DEGRAUS, como a regra os escreve:
 *   1. o desenho POR VARIÁVEL cuja CONDIÇÃO casa com as escolhas gravadas do item (o mesmo `avaliarTexto` do motor);
 *   2. não havendo, o desenho do ÍNDICE PRINCIPAL com a MESMA DESCRIÇÃO, ignorando a linha (EUROPA 42/60) e o grupo
 *      — porque a imagem é da forma, não do material.
 *
 * E a recusa, que é metade da regra: variável sem valor, tipologia sem candidata ou duas candidatas sem desempate
 * NÃO DESENHAM NADA, e a folha diz por quê, nomeado. Nunca a figura mais parecida.
 *
 * Puro: não lê banco nem Storage. Quem lê é `desenho-do-catalogo-servidor.ts`, e os três lugares que mostram o
 * desenho (o arquivo do levantamento, a tela do orçamento e o arquivo do orçamento) usam ESTA escolha — nenhuma
 * cópia do critério, para nunca mostrarem figuras diferentes do mesmo item.
 */
import { avaliarTexto } from './avaliador-de-formulas'

/** Uma linha do catálogo de desenhos, como a tabela a guarda. */
export type DesenhoDoCatalogo = {
    fonte: string
    grupo: string | null
    codigo: string
    descricao: string | null
    condicao: string | null
    caminho_no_storage: string | null
}
export const FONTE_POR_VARIAVEL = 'por_variavel'
export const FONTE_PRINCIPAL = 'principal'

export type EscolhaDoDesenho =
    | { caminho: string; degrau: 'por_variavel' | 'principal'; condicao: string | null }
    | { motivo: MotivoSemDesenho; frase: string }
export type MotivoSemDesenho = 'SEM_CANDIDATA' | 'VARIAVEL_SEM_VALOR' | 'DUAS_CANDIDATAS' | 'SEM_ARQUIVO'

/** O código cru é a identidade (`codigo-do-motor-nao-se-normaliza.md`): só os espaços das pontas saem, e a caixa não conta. */
const chave = (v: string | null | undefined) => (v ?? '').trim().toUpperCase()
/**
 * A descrição comparável: sem caixa, sem acento, sem pontuação e sem a LINHA e o GRUPO — a regra manda ignorá-los,
 * porque "a imagem é da forma, não do material". A linha vem depois do último "|" ("… | EUROPA 42").
 */
export function descricaoComparavel(d: string | null | undefined): string {
    const semLinha = (d ?? '').split('|').slice(0, -1).join('|') || (d ?? '')
    return semLinha.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

/** O GRUPO e a FAMÍLIA na mesma forma, para o desempate: "PVC" = "pvc", "Blindex / vidro temperado" = "BLINDEX VIDRO TEMPERADO". */
export const grupoComparavel = (g: string | null | undefined) =>
    (g ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

// As frases do SEM FIGURA saem na folha, que o vendedor lê: sem o código da tipologia (dono do produto, 24/11/2026, pedido 0023) — a linha
// está dentro do item, e é ele que ela nomeia.
export const fraseSemCandidata = () =>
    'o desenho desta tipologia não está no catálogo de desenhos: o item sai sem figura'
export const fraseDeVariavelSemValor = (variavel: string) =>
    `o desenho desta tipologia depende da variável ${variavel}, que não tem valor neste item: o item sai sem figura`
export const fraseDeDuasCandidatas = (quantas: number) =>
    `o desenho desta tipologia tem ${quantas} condições que casam com este item, e nenhuma desempata: o item sai sem figura`
export const fraseSemArquivo = () =>
    'o desenho desta tipologia está no índice sem arquivo no Storage: o item sai sem figura'

/**
 * OS VALORES que a CONDIÇÃO do desenho lê: as escolhas gravadas do item e, nas variáveis que o vendedor não disse,
 * o PADRÃO da aba Variáveis da tipologia — só quando esse padrão é um NÚMERO. Padrão que é fórmula não se adivinha
 * aqui: a variável fica sem valor, e a falta sai NOMEADA (`VARIAVEL_SEM_VALOR`), que é o que a regra manda.
 *
 * MEDIDO em 16/11/2026, nas 771 condições importadas: dos 310 pares código × variável, **304** são variável da aba
 * com padrão numérico e **6** são de tipologia que o motor da conta não tem (DP-105, DP-113, DP-121, DP-142, DP-165);
 * **nenhuma** é fórmula. Então ler o padrão numérico resolve tudo o que há, e o resto recusa pelo nome.
 */
export function valoresDoDesenho(
    def: { variaveis: ReadonlyArray<{ variavel: string; padrao: string | null }> } | null,
    escolhas: Readonly<Record<string, number>>,
): Record<string, number> {
    const valores: Record<string, number> = {}
    for (const v of def?.variaveis ?? []) {
        const padrao = (v.padrao ?? '').trim()
        if (/^\d+$/.test(padrao)) valores[v.variavel] = Number(padrao)
    }
    // a escolha do vendedor vence o padrão, sempre
    for (const [nome, valor] of Object.entries(escolhas)) if (Number.isFinite(valor)) valores[nome] = valor
    return valores
}

/** Os caminhos das candidatas cujo GRUPO é a família do item. Sem família, nenhuma (o desempate não acontece). */
function familiaDoGrupo(candidatas: readonly DesenhoDoCatalogo[], familia: string | null | undefined): string[] {
    const f = grupoComparavel(familia)
    if (f === '') return []
    return [...new Set(candidatas.filter((d) => grupoComparavel(d.grupo) === f).map((d) => (d.caminho_no_storage ?? '').trim()).filter((c) => c !== ''))]
}

/**
 * O desenho deste item. `valores` são as escolhas e variáveis gravadas (os mesmos nomes do motor: HI, UT, NF…).
 * `descricao` é a da tipologia, para o degrau 2.
 */
export function escolherDesenho(
    item: { tipologia: string; descricao: string | null; familia?: string | null; valores: Readonly<Record<string, number>> },
    catalogo: readonly DesenhoDoCatalogo[],
): EscolhaDoDesenho {
    // O CÓDIGO DO MOTOR NÃO SE NORMALIZA, e o `codigo_dp` é DADO, NUNCA CHAVE (dono do produto, 12/11/2026): a escolha casa
    // pelo `codigo` cru — é ele que o motor cita, e é ele que distingue DP-017 (peitoril) de DP-17 (persiana).
    const doCodigo = catalogo.filter((d) => d.fonte === FONTE_POR_VARIAVEL && chave(d.codigo) === chave(item.tipologia))

    // DEGRAU 1: a condição que casa com as escolhas gravadas
    if (doCodigo.length > 0) {
        const casam: DesenhoDoCatalogo[] = []
        let semValor: string | null = null
        for (const d of doCodigo) {
            const texto = (d.condicao ?? '').trim()
            if (texto === '') continue
            const r = avaliarTexto(texto, item.valores)
            // `'recusa' in r`, e não `r.ok`: com `strictNullChecks: false` (o tsconfig daqui) o tsc não estreita a união pelo booleano
            if ('recusa' in r) {
                // a variável sem valor é recusa NOMEADA, nunca uma candidata a menos em silêncio
                if (r.recusa.motivo === 'VARIAVEL_SEM_VALOR') semValor = semValor ?? (r.recusa.variavel ?? '?')
                continue
            }
            if (r.valor === true || (typeof r.valor === 'number' && r.valor !== 0)) casam.push(d)
        }
        if (casam.length === 1) {
            const caminho = (casam[0].caminho_no_storage ?? '').trim()
            if (caminho === '') return { motivo: 'SEM_ARQUIVO', frase: fraseSemArquivo() }
            return { caminho, degrau: 'por_variavel', condicao: casam[0].condicao }
        }
        if (casam.length > 1) return { motivo: 'DUAS_CANDIDATAS', frase: fraseDeDuasCandidatas(casam.length) }
        if (semValor !== null) return { motivo: 'VARIAVEL_SEM_VALOR', frase: fraseDeVariavelSemValor(semValor) }
    }

    // DEGRAU 2: o índice principal com a mesma descrição, ignorando a linha e o grupo
    const alvo = descricaoComparavel(item.descricao)
    if (alvo !== '') {
        const porDescricao = catalogo.filter((d) => d.fonte === FONTE_PRINCIPAL && descricaoComparavel(d.descricao) === alvo)
        const caminhos = [...new Set(porDescricao.map((d) => (d.caminho_no_storage ?? '').trim()).filter((c) => c !== ''))]
        if (caminhos.length === 1) return { caminho: caminhos[0], degrau: 'principal', condicao: null }
        if (caminhos.length > 1) {
            // O DESEMPATE PELO GRUPO DA FAMÍLIA (medido em 16/11/2026, e relatado ao dono do produto): a MESMA forma existe em
            // materiais diferentes — "JANELA DE CORRER 02 FOLHAS MÓVEIS" está no grupo PVC e no Blindex, com desenhos
            // diferentes. Ignorar o grupo, como a regra manda para a LINHA, deixaria DP-02, DP-09, DP-11 e DP-20 — as janelas
            // de correr de 2, 3 e 4 folhas — SEM figura. O grupo do catálogo é o MATERIAL, e a família do item o nomeia: a
            // esquadria de PVC só pode levar o desenho de PVC. Isto NÃO é escolher "a mais parecida": é descartar a de outro
            // material. Sem família, ou com mais de uma no grupo, continua sendo recusa nomeada.
            const doGrupo = familiaDoGrupo(porDescricao, item.familia)
            if (doGrupo.length === 1) return { caminho: doGrupo[0], degrau: 'principal', condicao: null }
            return { motivo: 'DUAS_CANDIDATAS', frase: fraseDeDuasCandidatas(caminhos.length) }
        }
        if (porDescricao.length > 0) return { motivo: 'SEM_ARQUIVO', frase: fraseSemArquivo() }
    }
    return { motivo: 'SEM_CANDIDATA', frase: fraseSemCandidata() }
}
