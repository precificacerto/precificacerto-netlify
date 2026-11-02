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
 * VÁRIAS FAMÍLIAS (PR D, dono do produto, 02/11/2026): a tipologia vem do MOTOR de uma família da conta (a base de
 * conhecimento → a etapa 1 → o motor), não mais de uma tabela de fornecedor. A esquadria guarda de qual família é (`familia`, a
 * chave do catálogo) e o motor que a calcula (`motor_id`, o da etapa 2 da família), como a regra do projeto pede: "cada item diz
 * a sua". O código numa família só: a esquadria leva aquela. Em mais de uma: a esquadria fica sem família, e a pendência
 * seguinte, logo depois da tipologia, é DE QUAL FAMÍLIA — pelo rótulo do catálogo. Nunca escolhe, nunca "a primeira". A
 * resposta vem em `itens[].familia` (o rótulo ou a chave) e/ou `itens[].fornecedor` (o do motor da família), e vale só se
 * apontar, sem caixa e sem acento, UMA das famílias daquela tipologia. Trocar a tipologia ou a família apaga as escolhas: as
 * variáveis são da tipologia DAQUELE motor. (Até o PR D, a fonte era a tabela de fornecedor, em `tabela_id`.)
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
    /** De qual família da conta (a CHAVE do catálogo) é a tipologia. null = ainda não sabido (`familiaDaEsquadria` resolve). */
    familia: string | null
    /** O motor que calcula a esquadria: o da etapa 2 da família (`resolverFamilias` o põe junto com a família). */
    motor_id: string | null
}

export const itemVazio = (ordem: number): ItemDoLevantamento => ({
    ordem, tipologia: null, largura_mm: null, altura_mm: null, quantidade: null, cor_perfil: null, vidro: null, escolhas: null, familia: null, motor_id: null,
})

/** A tipologia e a família da esquadria: é o par que decide as abas. */
export type TipologiaNaFamilia = { tipologia: string | null; familia: string | null }

/** As abas da tipologia NO MOTOR da família da esquadria, ou null quando ele não as tem — não há escolha a perguntar. */
export type DefinicaoDaTipologia = (esquadria: TipologiaNaFamilia) => VariaveisDaTipologia | null

/** Uma família da conta cujo motor tem o código: a chave, o rótulo, o fornecedor do motor e o motor do cálculo (o que a esquadria grava). */
export type FamiliaDoCodigo = { familia: string; rotulo: string; fornecedor: string; motorId: string }
/** Uma opção da pergunta de qual família: o que o vendedor reconhece — o rótulo da família (e o fornecedor do motor dela). */
export type OpcaoDeFamilia = { rotulo: string; fornecedor: string }
/** As famílias da conta cujo motor tem o código, na ordem do rótulo. */
export type FamiliasDoCodigo = (codigo: string) => readonly FamiliaDoCodigo[]

const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
const porOpcao = (a: OpcaoDeFamilia, b: OpcaoDeFamilia) => porNome(a.rotulo, b.rotulo) || porNome(a.fornecedor, b.fornecedor)

/**
 * De qual família é a esquadria: a guardada, se o motor dela ainda tem o código; senão, a ÚNICA cujo motor tem o código. Com o
 * código em mais de uma, as opções (o rótulo e o fornecedor do motor) — para perguntar. Sem tipologia, ou com o código em
 * nenhuma: null.
 */
export function familiaDaEsquadria(e: TipologiaNaFamilia, familiasDoCodigo: FamiliasDoCodigo): FamiliaDoCodigo | { opcoes: OpcaoDeFamilia[] } | null {
    if (e.tipologia === null) return null
    const opcoes = familiasDoCodigo(e.tipologia)
    const guardada = e.familia !== null ? opcoes.find((o) => o.familia === e.familia) : undefined
    if (guardada) return guardada
    if (opcoes.length === 1) return opcoes[0]
    if (opcoes.length === 0) return null
    return { opcoes: opcoes.map((o) => ({ rotulo: o.rotulo, fornecedor: o.fornecedor })).sort(porOpcao) }
}

/**
 * A família e o motor de cada esquadria, como ficam gravados (`orcamentista_levantamento_item.familia` e `motor_id`): a família
 * resolvida e o motor do CÁLCULO dela (o da etapa 2, hoje). Sem família resolvida (sem tipologia, código em nenhuma, ou em mais de
 * uma — a pergunta), os dois ficam nulos: nada é escolhido.
 */
export function resolverFamilias(itens: readonly ItemDoLevantamento[], familiasDoCodigo: FamiliasDoCodigo): ItemDoLevantamento[] {
    return itens.map((i) => {
        const f = familiaDaEsquadria(i, familiasDoCodigo)
        return f && 'familia' in f ? { ...i, familia: f.familia, motor_id: f.motorId } : { ...i, familia: null, motor_id: null }
    })
}

/** "PVC Wolf ou PVC Veca" — a lista da pergunta. */
const ouLista = (nomes: readonly string[]) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`)

/** Como cada opção é dita: o rótulo da família (único no catálogo). */
export const rotulosDasOpcoes = (opcoes: readonly OpcaoDeFamilia[]): string[] => opcoes.map((o) => o.rotulo)

/** A pergunta de qual família, com as opções em ordem pelo rótulo. */
export function fraseDeQualFamilia(tipologia: string, opcoes: readonly OpcaoDeFamilia[]): string {
    return `A ${tipologia} está em ${opcoes.length} famílias da sua empresa: ${ouLista(rotulosDasOpcoes(opcoes))}. De qual família é?`
}

export type ContextoDaProposta = {
    tipologias: readonly string[]
    cores: readonly string[]
    /** A esquadria que recebe o que vier sem ordem e sem tipologia; null quando não há como saber. */
    ordemPadrao: number | null
    definicao: DefinicaoDaTipologia
    familiasDoCodigo: FamiliasDoCodigo
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
            // as escolhas e a família são da tipologia: a família é a ÚNICA cujo motor tem o código, ou nenhuma (pergunta)
            const opcoes = ctx.familiasDoCodigo(String(validos.tipologia))
            alvo.escolhas = null
            alvo.familia = opcoes.length === 1 ? opcoes[0].familia : null
            alvo.motor_id = opcoes.length === 1 ? opcoes[0].motorId : null
        }
        Object.assign(alvo, validos)
        if (fornecedor !== null || familia !== null) {
            // a resposta à pergunta de qual família: a família dita (o rótulo ou a chave) e/ou o fornecedor do motor apontam UMA
            // das famílias DAQUELA tipologia; o que aponta duas, ou nenhuma, não vale
            propostos += 1
            const casam = alvo.tipologia === null ? [] : ctx.familiasDoCodigo(alvo.tipologia).filter((o) =>
                (fornecedor === null || normalizarNome(o.fornecedor) === normalizarNome(fornecedor))
                && (familia === null || normalizarNome(o.rotulo) === normalizarNome(familia) || normalizarNome(o.familia) === normalizarNome(familia)))
            if (casam.length !== 1) descartados += 1
            else if (alvo.familia !== casam[0].familia) { alvo.familia = casam[0].familia; alvo.motor_id = casam[0].motorId; alvo.escolhas = null }
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
    | { tipo: 'FAMILIA'; ordem: number; tipologia: string; opcoes: OpcaoDeFamilia[] }
    | { tipo: 'ESCOLHA'; ordem: number; pendente: EscolhaPendente }

/**
 * A primeira coisa que falta: esquadria por esquadria, a tipologia, DE QUAL FAMÍLIA ela é (quando o
 * código está no motor de mais de uma), os outros campos, e depois as escolhas.
 */
export function proximaPendencia(itens: readonly ItemDoLevantamento[], definicao: DefinicaoDaTipologia, familiasDoCodigo: FamiliasDoCodigo): Pendencia | null {
    for (const item of [...itens].sort((a, b) => a.ordem - b.ordem)) {
        const campo = CAMPOS_DA_ESQUADRIA.find((c) => vazio(item[c]))
        if (campo === 'tipologia') return { tipo: 'CAMPO', ordem: item.ordem, campo }
        const familia = familiaDaEsquadria(item, familiasDoCodigo)
        if (familia && 'opcoes' in familia) return { tipo: 'FAMILIA', ordem: item.ordem, tipologia: String(item.tipologia), opcoes: familia.opcoes }
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
        : p.tipo === 'FAMILIA' ? fraseDeQualFamilia(p.tipologia, p.opcoes)
            : perguntaDaEscolha(p.pendente)
    return nItens > 1 ? `Esquadria ${p.ordem}: ${pergunta}` : pergunta
}
