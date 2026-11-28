import { referenciaDo, traduzirVidro, type ItemDeVidro } from '@/lib/atendimentos-ia/vidro-da-tabela'

/**
 * O VIDRO DITO VIRA A REFERÊNCIA DO CATÁLOGO (dono do produto, 28/11/2026, pedido 0056): o agente SEMPRE resolve o vidro que o vendedor disse
 * ("mini boreal 4 mm") para a referência única do catálogo (`codigo_wvetro`: VBO04, VLIN4+4, VTIN06…) e grava a DESCRIÇÃO do catálogo junto com a
 * referência (`vidro_codigo`). Se não resolver, NÃO grava texto livre: o vidro fica sem valor e a conversa PERGUNTA. Puro: não lê banco.
 *
 * O caso que originou: o item 4 do levantamento 31 foi regravado em 27/11 com vidro = "mini boreal 4 mm" e `vidro_codigo` NULL — a conversa só
 * gravava o código quando o vidro era o do padrão da empresa; o vidro dito ficava só como texto, e o custo o traduzia depois (e podia acusar falta).
 */
export type VidroResolvido =
    | { ok: true; referencia: string; descricao: string }
    | { ok: false; motivo: string; frase: string }

export function resolverVidroDito(texto: string, itens: readonly ItemDeVidro[], codigosPadrao: readonly string[] = []): VidroResolvido {
    const t = traduzirVidro(texto, null, itens, codigosPadrao)
    if (!('item' in t)) return { ok: false, motivo: t.motivo, frase: t.frase }
    const referencia = referenciaDo(t.item)
    const descricao = (t.item.descricao ?? '').trim()
    if (referencia === null || referencia.trim() === '') {
        return { ok: false, motivo: 'VIDRO_SEM_REFERENCIA', frase: `o vidro “${texto.trim()}” acha o item ${t.item.codigo}, que não tem a referência (codigo_wvetro) na tabela de vidro` }
    }
    if (descricao === '') return { ok: false, motivo: 'VIDRO_SEM_DESCRICAO', frase: `o vidro ${referencia} não tem descrição na tabela de vidro` }
    return { ok: true, referencia, descricao }
}

/**
 * A referência do vidro GRAVADO: a do item do catálogo cuja descrição é exatamente o texto do item (o que a entrada gravou ao resolver). Única
 * referência entre os itens de mesma descrição; sem texto, sem catálogo ou sem item de mesma descrição, null — o vidro antigo (texto livre) não ganha código.
 */
export function referenciaDaDescricao(itens: readonly ItemDeVidro[], texto: string | null | undefined): string | null {
    const t = (texto ?? '').trim()
    if (t === '' || itens.length === 0) return null
    const refs = new Set(itens.filter((i) => (i.descricao ?? '').trim() === t).map((i) => referenciaDo(i)).filter((r): r is string => r !== null && r.trim() !== ''))
    return refs.size === 1 ? [...refs][0] : null
}
