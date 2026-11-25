/**
 * ACRÉSCIMO OU ALTERAÇÃO, ITEM A ITEM (dono do produto, 25/11/2026; pedido 0028 — o levantamento 28: o vendedor respondeu o nome do cliente e a
 * conversa despejou a lista dos 11 itens perguntando "são novos, para acrescentar, ou alteram um item que já está lá? Se for alteração, diga
 * qual item"). O AGENTE distingue:
 *   - ALTERAÇÃO: a esquadria que corresponde a um item que já existe substitui os dados daquele item;
 *   - ACRÉSCIMO: a esquadria inteira sem correspondência entra somada, e os existentes ficam;
 *   - os dois na mesma mensagem: cada um no seu item;
 *   - AMBÍGUA: a correspondência não se decide — a conversa faz UMA pergunta curta, sem lista.
 *
 * A correspondência, nesta ordem: o NÚMERO do item escrito pelo vendedor; a MESMA esquadria (`esquadriasEquivalentes`: nenhum campo de
 * identidade presente nos dois lados difere); o AMBIENTE (o mesmo ambiente com a mesma tipologia, ou o único item daquele ambiente).
 * O código da esquadria escrito pelo vendedor (J04, P03) NÃO entra: o item gravado não tem onde guardá-lo (nenhuma coluna; seria migração).
 *
 * Função pura: a conversa decide o que fazer com o destino.
 */
import { esquadriasEquivalentes, type EsquadriaProposta } from '@/lib/atendimentos-ia/pergunta-em-aberto'
import { normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'

export type DestinoDoItem =
    /** substitui o item `ordem`; `inteira` = a esquadria traz a tipologia: ela é a esquadria de novo, e o item é refeito (nada do antigo sobra).
     *  Sem a tipologia ("o 1 é 900 x 900"), é a correção dos campos ditos, e o resto do item fica */
    | { tipo: 'alterar'; ordem: number; inteira: boolean }
    | { tipo: 'acrescentar' }
    /** a correspondência não se decide: `ordem` é o item candidato, quando há um */
    | { tipo: 'ambiguo'; ordem: number | null }

/** O que se compara de um item gravado. */
export type ItemExistente = { ordem: number; tipologia: string | null; largura_mm: number | null; altura_mm: number | null; quantidade?: number | null; cor_perfil?: string | null; vidro?: string | null; ambientes?: ReadonlyArray<{ ambiente: string }> | null }

const comTipologia = (e: Record<string, unknown>) => typeof e.tipologia === 'string' && e.tipologia !== ''
const inteiraDe = (e: Record<string, unknown>) => comTipologia(e) || (e.largura_mm != null && e.altura_mm != null)

/** O número do item que o vendedor escreveu: o `numero` da linha (a lista dele), ou a `ordem` da alteração dita. */
export const numeroDoItem = (e: Record<string, unknown>): number | null => {
    for (const k of ['ordem', 'numero'] as const) {
        const v = e[k]
        if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v
    }
    return null
}

const ambientesDe = (x: { ambientes?: unknown }) => new Set(Array.isArray(x.ambientes)
    ? (x.ambientes as unknown[]).flatMap((a) => (a && typeof a === 'object' && typeof (a as { ambiente?: unknown }).ambiente === 'string' ? [normalizarNome((a as { ambiente: string }).ambiente)] : [])).filter(Boolean)
    : [])

const comoProposta = (i: ItemExistente): EsquadriaProposta => ({ tipologia: i.tipologia, largura_mm: i.largura_mm, altura_mm: i.altura_mm, cor_perfil: i.cor_perfil ?? null, vidro: i.vidro ?? null })

/**
 * O destino de cada esquadria da mensagem contra os itens que já existem. `null` quando alguma esquadria não é inteira e não diz o número do item
 * (a correção de um campo — "a largura é 1500" — segue o caminho de sempre, que já a aplica ao item da conversa).
 */
export function distinguirItens(novas: ReadonlyArray<Record<string, unknown>>, existentes: readonly ItemExistente[]): DestinoDoItem[] | null {
    const porOrdem = new Map(existentes.map((i) => [i.ordem, i]))
    const destinos: DestinoDoItem[] = []
    for (const e of novas) {
        const inteira = inteiraDe(e)
        const numero = numeroDoItem(e)
        const doNumero = numero !== null ? porOrdem.get(numero) : undefined
        const ambientes = ambientesDe(e)
        const mesmoAmbiente = (i: ItemExistente) => [...ambientesDe(i)].some((a) => ambientes.has(a))
        if (doNumero) {
            // o número escrito decide, salvo quando a esquadria diz OUTRA tipologia que a do item daquele número, sem outra correspondência
            // (a lista numerada de itens novos: o "1" dela não é o item 1 do levantamento) — essa pergunta
            const outraTipologia = comTipologia(e) && e.tipologia !== doNumero.tipologia
            const corresponde = !outraTipologia || esquadriasEquivalentes(e, comoProposta(doNumero)) || mesmoAmbiente(doNumero)
            destinos.push(corresponde ? { tipo: 'alterar', ordem: doNumero.ordem, inteira: comTipologia(e) } : { tipo: 'ambiguo', ordem: doNumero.ordem })
            continue
        }
        if (!inteira) return null
        const iguais = existentes.filter((i) => esquadriasEquivalentes(e, comoProposta(i)))
        if (iguais.length === 1) { destinos.push({ tipo: 'alterar', ordem: iguais[0].ordem, inteira: comTipologia(e) }); continue }
        if (iguais.length > 1) { destinos.push({ tipo: 'ambiguo', ordem: null }); continue }
        if (ambientes.size > 0) {
            const doAmbiente = existentes.filter(mesmoAmbiente)
            const mesmaTipologia = doAmbiente.filter((i) => typeof e.tipologia === 'string' && i.tipologia === e.tipologia)
            const alvo = mesmaTipologia.length === 1 ? mesmaTipologia[0] : doAmbiente.length === 1 ? doAmbiente[0] : null
            if (alvo) { destinos.push({ tipo: 'alterar', ordem: alvo.ordem, inteira: comTipologia(e) }); continue }
            if (mesmaTipologia.length > 1) { destinos.push({ tipo: 'ambiguo', ordem: null }); continue }
        }
        destinos.push({ tipo: 'acrescentar' })
    }
    // dois itens da mensagem que caem no MESMO item que já existe: não se decide qual vale
    const contagem = new Map<number, number>()
    for (const d of destinos) if (d.tipo === 'alterar') contagem.set(d.ordem, (contagem.get(d.ordem) ?? 0) + 1)
    return destinos.map((d) => (d.tipo === 'alterar' && (contagem.get(d.ordem) ?? 0) > 1 ? { tipo: 'ambiguo', ordem: d.ordem } : d))
}

/** UMA pergunta curta, sem lista (pedido 0028, item 3): o vendedor responde "substitui" ou "é mais um". */
export function fraseDaCorrespondenciaAmbigua(nome: string, ordens: ReadonlyArray<number | null>): string {
    const ditas = [...new Set(ordens.filter((o): o is number => o !== null))].sort((a, b) => a - b)
    if (ordens.length === 1 && ditas.length === 1) return `O item ${ditas[0]} desta mensagem substitui o item ${ditas[0]} que já está no levantamento “${nome}”, ou é mais um?`
    if (ditas.length === ordens.length && ditas.length > 1) {
        const lista = `${ditas.slice(0, -1).join(', ')} e ${ditas[ditas.length - 1]}`
        return `Os itens ${lista} desta mensagem substituem os de mesmo número que já estão no levantamento “${nome}”, ou são mais itens?`
    }
    return ordens.length > 1 ? `Estes itens substituem itens que já estão no levantamento “${nome}”, ou são mais itens?`
        : `Este item substitui um item que já está no levantamento “${nome}”, ou é mais um?`
}

/** A linha que diz o que foi feito (pedido 0028, item 4): nunca a lista. `null` quando nada foi alterado nem acrescentado. */
export function fraseDaAtualizacao(nome: string, r: { alterados: number; acrescentados: number; substituidos: number | null }): string | null {
    if (r.substituidos !== null) return `Atualizei o orçamento de “${nome}”: a lista nova, com ${r.substituidos} ${r.substituidos === 1 ? 'item' : 'itens'}, substitui a anterior.`
    const partes = [
        r.alterados > 0 ? `${r.alterados} ${r.alterados === 1 ? 'item alterado' : 'itens alterados'}` : null,
        r.acrescentados > 0 ? `${r.acrescentados} ${r.acrescentados === 1 ? 'acrescentado' : 'acrescentados'}` : null,
    ].filter((x): x is string => x !== null)
    if (partes.length === 0) return null
    return `Atualizei o orçamento de “${nome}”: ${partes.join(' e ')}.`
}
