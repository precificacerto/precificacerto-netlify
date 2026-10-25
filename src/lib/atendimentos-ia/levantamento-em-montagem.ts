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
 * Portão: `src/utils/__tests__/levantamento-em-montagem.test.ts`.
 */
import { PERGUNTA_DO_CAMPO, valorValido } from '@/lib/atendimentos-ia/pre-definicao'
import { escolhasPendentes, lerEscolhasGravadas, perguntaDaEscolha, validarEscolha, type EscolhaPendente } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import type { Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'

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
    escolhas: Record<string, number> | null
}

export const itemVazio = (ordem: number): ItemDoLevantamento => ({
    ordem, tipologia: null, largura_mm: null, altura_mm: null, quantidade: null, cor_perfil: null, vidro: null, escolhas: null,
})

/** As abas da tipologia lidas, ou null quando ela não as tem — não há escolha a perguntar. */
export type DefinicaoDaTipologia = (tipologia: string | null) => Tipologia | null

export type ContextoDaProposta = {
    tipologias: readonly string[]
    cores: readonly string[]
    /** A esquadria que recebe o que vier sem ordem e sem tipologia; null quando não há como saber. */
    ordemPadrao: number | null
    definicao: DefinicaoDaTipologia
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

/** Aplica `{ itens, escolha }` às esquadrias. Devolve uma cópia; as esquadrias recebidas não mudam. */
export function aplicarProposta(atuais: readonly ItemDoLevantamento[], proposta: unknown, ctx: ContextoDaProposta): ResultadoDaProposta {
    const itens = atuais.map((i) => ({ ...i, escolhas: i.escolhas ? { ...i.escolhas } : null })).sort((a, b) => a.ordem - b.ordem)
    let propostos = 0
    let descartados = 0
    let semEsquadria = false
    const p = (proposta && typeof proposta === 'object' ? proposta : {}) as { itens?: unknown; escolha?: unknown }
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
        if (Object.keys(validos).length === 0) continue

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

        if (validos.tipologia !== undefined && validos.tipologia !== alvo.tipologia) alvo.escolhas = null
        Object.assign(alvo, validos)
    }

    if (!vazio(p.escolha)) {
        const e = p.escolha as { ordem?: unknown }
        const ordem = ordemValida(e.ordem) ? e.ordem : ctx.ordemPadrao ?? (itens.length === 1 ? itens[0].ordem : null)
        const alvo = ordem === null ? undefined : itens.find((i) => i.ordem === ordem)
        const definicao = alvo ? ctx.definicao(alvo.tipologia) : null
        if (!alvo || !definicao) {
            propostos += 1
            descartados += 1
        } else {
            const r = validarEscolha(definicao, lerEscolhasGravadas(alvo.escolhas), p.escolha)
            propostos += r.propostos
            descartados += r.descartados
            if (r.gravar) alvo.escolhas = r.gravar
        }
    }
    return { itens, propostos, descartados, semEsquadria }
}

export type Pendencia =
    | { tipo: 'CAMPO'; ordem: number; campo: CampoDaEsquadria }
    | { tipo: 'ESCOLHA'; ordem: number; pendente: EscolhaPendente }

/** A primeira coisa que falta: esquadria por esquadria, os campos e depois as escolhas dela. */
export function proximaPendencia(itens: readonly ItemDoLevantamento[], definicao: DefinicaoDaTipologia): Pendencia | null {
    for (const item of [...itens].sort((a, b) => a.ordem - b.ordem)) {
        const campo = CAMPOS_DA_ESQUADRIA.find((c) => vazio(item[c]))
        if (campo) return { tipo: 'CAMPO', ordem: item.ordem, campo }
        const def = definicao(item.tipologia)
        const pendente = def ? escolhasPendentes(def, lerEscolhasGravadas(item.escolhas))[0] : undefined
        if (pendente) return { tipo: 'ESCOLHA', ordem: item.ordem, pendente }
    }
    return null
}

/** A pergunta FIXA da pendência; com mais de uma esquadria, diz de qual. */
export function perguntaDaPendencia(p: Pendencia, nItens: number): string {
    const pergunta = 'campo' in p ? PERGUNTA_DO_CAMPO[p.campo] : perguntaDaEscolha(p.pendente)
    return nItens > 1 ? `Esquadria ${p.ordem}: ${pergunta}` : pergunta
}
