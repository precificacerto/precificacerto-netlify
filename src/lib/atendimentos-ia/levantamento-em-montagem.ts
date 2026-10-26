/**
 * O LEVANTAMENTO EM MONTAGEM: as esquadrias de um levantamento (`orcamentista_levantamento_item`), o
 * que a proposta da LLM muda nelas, e a próxima pendência — o campo que falta ou a escolha da
 * tipologia. Funções puras: não leem banco nem rede.
 *
 * A REGRA QUE NÃO SE NEGOCIA: a LLM PROPÕE, o código VALIDA. Cada campo passa por `valorValido`, a
 * mesma validação da pré-definição — a tipologia só da lista, a cor só da lista e exata, as medidas
 * inteiras na faixa. O que não valida é descartado e contado.
 *
 * QUAL ESQUADRIA RECEBE (nunca por semelhança):
 *   - a `ordem` dita pela LLM, quando existe;
 *   - senão, uma tipologia válida vai para a primeira esquadria SEM tipologia, ou abre a seguinte;
 *   - senão, a esquadria PADRÃO do chamador (a da pergunta em aberto, ou a única);
 *   - senão, nenhuma: `semEsquadria`, e quem chama pergunta qual é.
 *
 * HISTÓRICO: sobrescreve (decisão 3 do dono do produto, 25/10/2026). Trocar a TIPOLOGIA apaga as
 * escolhas da esquadria — as variáveis são da tipologia; trocar uma medida, não.
 *
 * VÁRIAS TABELAS (dono do produto, 26/10/2026; migração 20261026000004): a conta pode ter mais de uma
 * tabela de fornecedor, e a esquadria guarda de qual é a tipologia (`tabela_id`). O código numa tabela só:
 * a esquadria leva aquela. Em mais de uma: a esquadria fica sem tabela, e a pendência seguinte, logo depois
 * da tipologia, é DE QUAL TABELA — citando os fornecedores e, quando o mesmo fornecedor tem mais de uma
 * (a Wolff com PVC e alumínio), as FAMÍLIAS. A desambiguação é por FORNECEDOR + FAMÍLIA. Nunca escolhe,
 * nunca "a primeira". A resposta vem em `itens[].fornecedor` e/ou `itens[].familia`, e vale só se apontar,
 * sem caixa e sem acento, UMA das tabelas daquela tipologia. Trocar a tipologia ou a tabela apaga as
 * escolhas: as variáveis são da tipologia DAQUELA tabela.
 *
 * O ARREMATE (dono do produto, 25/10/2026): o Padrão da tipologia é ASSUMIDO, e escolha nenhuma é
 * pendência por si. A proposta traz `escolhas` (o que o vendedor disse, em palavras, que a LLM traduz
 * para variável e número) e `opcoes_de` (as variáveis cujas opções ele pediu para ver). Pedir as opções
 * marca a variável com `null` no item, e SÓ ESSA marca vira pendência de escolha.
 *
 * Portão: `src/utils/__tests__/levantamento-em-montagem.test.ts`.
 */
import { PERGUNTA_DO_CAMPO, valorValido } from '@/lib/atendimentos-ia/pre-definicao'
import { escolhaPedida, lerEscolhasGravadas, perguntaDaEscolha, validarEscolha, type EscolhaPendente, type VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'

/** Os campos de uma esquadria, na ordem em que são perguntados. */
export const CAMPOS_DA_ESQUADRIA = ['tipologia', 'largura_mm', 'altura_mm', 'quantidade', 'cor_perfil', 'vidro'] as const
export type CampoDaEsquadria = (typeof CAMPOS_DA_ESQUADRIA)[number]

export type ItemDoLevantamento = {
    ordem: number
    tipologia: string | null
    largura_mm: number | null
    altura_mm: number | null
    quantidade: number | null
    cor_perfil: string | null
    vidro: string | null
    /** número = escolha do vendedor; `null` = ele pediu para ver as opções desta variável */
    escolhas: Record<string, number | null> | null
    /** De qual tabela (fornecedor) é a tipologia. null = ainda não sabido (`tabelaDaEsquadria` resolve). */
    tabela_id: string | null
}

export const itemVazio = (ordem: number): ItemDoLevantamento => ({
    ordem, tipologia: null, largura_mm: null, altura_mm: null, quantidade: null, cor_perfil: null, vidro: null, escolhas: null, tabela_id: null,
})

/** A tipologia e a tabela da esquadria: é o par que decide as abas. */
export type TipologiaNaTabela = { tipologia: string | null; tabela_id: string | null }

/** As abas da tipologia NA TABELA da esquadria, ou null quando ela não as tem — não há escolha a perguntar. */
export type DefinicaoDaTipologia = (esquadria: TipologiaNaTabela) => VariaveisDaTipologia | null

/** Uma tabela ligada à conta que tem o código: o fornecedor e a família (o rótulo; null = não informada). */
export type TabelaDoCodigo = { tabelaId: string; fornecedor: string; familia: string | null }
/** Uma opção da pergunta de qual tabela: o que o vendedor reconhece — fornecedor e família. */
export type OpcaoDeTabela = { fornecedor: string; familia: string | null }
/** As tabelas da conta que têm o código, na ordem do nome do fornecedor. */
export type TabelasDoCodigo = (codigo: string) => readonly TabelaDoCodigo[]

const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

export const FAMILIA_NAO_INFORMADA = 'família não informada'
const familiaDita = (f: string | null) => f ?? FAMILIA_NAO_INFORMADA
const porOpcao = (a: OpcaoDeTabela, b: OpcaoDeTabela) => porNome(a.fornecedor, b.fornecedor) || porNome(familiaDita(a.familia), familiaDita(b.familia))

/**
 * De qual tabela é a esquadria: a guardada, se ainda tem o código; senão, a ÚNICA que tem o código. Com o
 * código em mais de uma, as opções (fornecedor e família) — para perguntar. Sem tipologia, ou com o código
 * em nenhuma: null.
 */
export function tabelaDaEsquadria(e: TipologiaNaTabela, tabelasDoCodigo: TabelasDoCodigo): { tabelaId: string } | { opcoes: OpcaoDeTabela[] } | null {
    if (e.tipologia === null) return null
    const opcoes = tabelasDoCodigo(e.tipologia)
    if (e.tabela_id !== null && opcoes.some((o) => o.tabelaId === e.tabela_id)) return { tabelaId: e.tabela_id }
    if (opcoes.length === 1) return { tabelaId: opcoes[0].tabelaId }
    if (opcoes.length === 0) return null
    return { opcoes: opcoes.map((o) => ({ fornecedor: o.fornecedor, familia: o.familia })).sort(porOpcao) }
}

/** "Perfis Sul ou Wolff" — a lista da pergunta. */
const ouLista = (nomes: readonly string[]) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`)

/** Como cada opção é dita: o fornecedor; com a família entre parênteses só onde o fornecedor se repete. */
export function rotulosDasOpcoes(opcoes: readonly OpcaoDeTabela[]): string[] {
    const repetido = (f: string) => opcoes.filter((o) => normalizarNome(o.fornecedor) === normalizarNome(f)).length > 1
    return opcoes.map((o) => (repetido(o.fornecedor) ? `${o.fornecedor} (${familiaDita(o.familia)})` : o.fornecedor))
}

/**
 * A pergunta de qual tabela, com as opções em ordem: fornecedores diferentes, pelo nome; o mesmo fornecedor,
 * pela família ("a Wolff tem tabela de PVC e de Alumínio"); misturados, cada opção pelo seu rótulo.
 */
export function fraseDeQualFornecedor(tipologia: string, opcoes: readonly OpcaoDeTabela[]): string {
    const fornecedores = [...new Set(opcoes.map((o) => normalizarNome(o.fornecedor)))]
    if (fornecedores.length === opcoes.length) {
        return `A ${tipologia} está nas tabelas de ${opcoes.length} fornecedores: ${ouLista(opcoes.map((o) => o.fornecedor))}. De qual deles é?`
    }
    if (fornecedores.length === 1) {
        return `A ${tipologia} está em ${opcoes.length} tabelas da ${opcoes[0].fornecedor}: ${ouLista(opcoes.map((o) => `de ${familiaDita(o.familia)}`))}. De qual família é?`
    }
    return `A ${tipologia} está em ${opcoes.length} tabelas: ${ouLista(rotulosDasOpcoes(opcoes))}. De qual delas é?`
}

export type ContextoDaProposta = {
    tipologias: readonly string[]
    cores: readonly string[]
    /** A esquadria que recebe o que vier sem ordem e sem tipologia; null quando não há como saber. */
    ordemPadrao: number | null
    definicao: DefinicaoDaTipologia
    tabelasDoCodigo: TabelasDoCodigo
}

export type ResultadoDaProposta = {
    itens: ItemDoLevantamento[]
    propostos: number
    descartados: number
    /** Veio valor sem ordem nem tipologia, e não há esquadria padrão: nada foi aplicado dele. */
    semEsquadria: boolean
}

const vazio = (v: unknown) => v === null || v === undefined
const ordemValida = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1

/** Aplica `{ itens, escolhas, opcoes_de }` às esquadrias. Devolve uma cópia; as recebidas não mudam. */
export function aplicarProposta(atuais: readonly ItemDoLevantamento[], proposta: unknown, ctx: ContextoDaProposta): ResultadoDaProposta {
    const itens = atuais.map((i) => ({ ...i, escolhas: i.escolhas ? { ...i.escolhas } : null })).sort((a, b) => a.ordem - b.ordem)
    let propostos = 0
    let descartados = 0
    let semEsquadria = false
    const p = (proposta && typeof proposta === 'object' ? proposta : {}) as { itens?: unknown; escolhas?: unknown; opcoes_de?: unknown }
    const proxima = () => (itens.length ? Math.max(...itens.map((i) => i.ordem)) + 1 : 1)

    for (const bruto of Array.isArray(p.itens) ? p.itens : []) {
        if (!bruto || typeof bruto !== 'object') continue
        const b = bruto as Record<string, unknown>
        const validos: Partial<Record<CampoDaEsquadria, unknown>> = {}
        for (const campo of CAMPOS_DA_ESQUADRIA) {
            if (vazio(b[campo])) continue
            propostos += 1
            const v = valorValido(campo, b[campo], ctx.tipologias, ctx.cores)
            if (v === undefined) descartados += 1
            else validos[campo] = v
        }
        const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
        const fornecedor = texto(b.fornecedor)
        const familia = texto(b.familia)
        if (Object.keys(validos).length === 0 && fornecedor === null && familia === null) continue

        let alvo: ItemDoLevantamento | undefined
        if (ordemValida(b.ordem)) {
            alvo = itens.find((i) => i.ordem === b.ordem)
            if (!alvo) { alvo = itemVazio(proxima()); itens.push(alvo) }
        } else if (validos.tipologia !== undefined) {
            alvo = itens.find((i) => i.tipologia === null)
            if (!alvo) { alvo = itemVazio(proxima()); itens.push(alvo) }
        } else if (ctx.ordemPadrao !== null) {
            alvo = itens.find((i) => i.ordem === ctx.ordemPadrao)
        } else if (itens.length === 1) {
            alvo = itens[0]
        }
        if (!alvo) { semEsquadria = true; continue }

        if (validos.tipologia !== undefined && validos.tipologia !== alvo.tipologia) {
            // as escolhas e a tabela são da tipologia: a tabela é a ÚNICA que tem o código, ou nenhuma (pergunta)
            const opcoes = ctx.tabelasDoCodigo(String(validos.tipologia))
            alvo.escolhas = null
            alvo.tabela_id = opcoes.length === 1 ? opcoes[0].tabelaId : null
        }
        Object.assign(alvo, validos)
        if (fornecedor !== null || familia !== null) {
            // a resposta à pergunta de qual tabela: o fornecedor e/ou a família dita apontam UMA das tabelas
            // DAQUELA tipologia — fornecedor + família é a desambiguação; o que aponta duas, ou nenhuma, não vale
            propostos += 1
            const casam = alvo.tipologia === null ? [] : ctx.tabelasDoCodigo(alvo.tipologia).filter((o) =>
                (fornecedor === null || normalizarNome(o.fornecedor) === normalizarNome(fornecedor))
                && (familia === null || (o.familia !== null && normalizarNome(o.familia) === normalizarNome(familia))))
            if (casam.length !== 1) descartados += 1
            else if (alvo.tabela_id !== casam[0].tabelaId) { alvo.tabela_id = casam[0].tabelaId; alvo.escolhas = null }
        }
    }

    // a esquadria das escolhas: a dita, a padrão (a da pergunta em aberto), ou a única
    const alvoDaEscolha = (ordemDita: unknown) => {
        const ordem = ordemValida(ordemDita) ? ordemDita : ctx.ordemPadrao ?? (itens.length === 1 ? itens[0].ordem : null)
        return ordem === null ? undefined : itens.find((i) => i.ordem === ordem)
    }
    for (const bruta of Array.isArray(p.escolhas) ? p.escolhas : []) {
        const e = (bruta && typeof bruta === 'object' ? bruta : {}) as { ordem?: unknown }
        const alvo = alvoDaEscolha(e.ordem)
        const definicao = alvo ? ctx.definicao(alvo) : null
        if (!alvo || !definicao) { propostos += 1; descartados += 1; continue }
        const r = validarEscolha(definicao, lerEscolhasGravadas(alvo.escolhas), bruta)
        propostos += r.propostos
        descartados += r.descartados
        // a escolha feita sai da marca de "pediu as opções" e as outras marcas ficam
        if (r.gravar) alvo.escolhas = { ...(alvo.escolhas ?? {}), ...r.gravar }
    }
    for (const variavel of Array.isArray(p.opcoes_de) ? p.opcoes_de : []) {
        const alvo = alvoDaEscolha(undefined)
        const definicao = alvo ? ctx.definicao(alvo) : null
        propostos += 1
        if (!alvo || !definicao || typeof variavel !== 'string' || escolhaPedida(definicao, variavel) === null) { descartados += 1; continue }
        alvo.escolhas = { ...(alvo.escolhas ?? {}), [variavel]: null }
    }
    return { itens, propostos, descartados, semEsquadria }
}

export type Pendencia =
    | { tipo: 'CAMPO'; ordem: number; campo: CampoDaEsquadria }
    | { tipo: 'FORNECEDOR'; ordem: number; tipologia: string; opcoes: OpcaoDeTabela[] }
    | { tipo: 'ESCOLHA'; ordem: number; pendente: EscolhaPendente }

/**
 * A primeira coisa que falta: esquadria por esquadria, a tipologia, DE QUAL FORNECEDOR ela é (quando o
 * código está em mais de uma tabela), os outros campos, e depois as escolhas.
 */
export function proximaPendencia(itens: readonly ItemDoLevantamento[], definicao: DefinicaoDaTipologia, tabelasDoCodigo: TabelasDoCodigo): Pendencia | null {
    for (const item of [...itens].sort((a, b) => a.ordem - b.ordem)) {
        const campo = CAMPOS_DA_ESQUADRIA.find((c) => vazio(item[c]))
        if (campo === 'tipologia') return { tipo: 'CAMPO', ordem: item.ordem, campo }
        const tabela = tabelaDaEsquadria(item, tabelasDoCodigo)
        if (tabela && 'opcoes' in tabela) return { tipo: 'FORNECEDOR', ordem: item.ordem, tipologia: String(item.tipologia), opcoes: tabela.opcoes }
        if (campo) return { tipo: 'CAMPO', ordem: item.ordem, campo }
        // a escolha só é pendência quando o vendedor PEDIU as opções (o `null`); senão vale o Padrão
        const def = definicao(item)
        const pedida = def ? Object.entries(item.escolhas ?? {}).find(([, v]) => v === null)?.[0] : undefined
        const pendente = def && pedida ? escolhaPedida(def, pedida) : null
        if (pendente) return { tipo: 'ESCOLHA', ordem: item.ordem, pendente }
    }
    return null
}

/** A pergunta FIXA da pendência; com mais de uma esquadria, diz de qual. */
export function perguntaDaPendencia(p: Pendencia, nItens: number): string {
    const pergunta = p.tipo === 'CAMPO' ? PERGUNTA_DO_CAMPO[p.campo]
        : p.tipo === 'FORNECEDOR' ? fraseDeQualFornecedor(p.tipologia, p.opcoes)
            : perguntaDaEscolha(p.pendente)
    return nItens > 1 ? `Esquadria ${p.ordem}: ${pergunta}` : pergunta
}
