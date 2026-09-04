/**
 * active-record-filter.ts — o critério único de "registro excluído logicamente".
 *
 * O DEFEITO QUE ISTO CORRIGE:
 * o botão Excluir faz EXCLUSÃO LÓGICA (`is_active = false`) e grava corretamente. Quem não
 * olhava esse campo eram as TELAS: o usuário excluía, o registro era marcado inativo, e o
 * item continuava aparecendo. Do ponto de vista de quem usa, o botão não fazia nada.
 *
 * ONDE O FILTRO VALE E ONDE NÃO VALE — a distinção é o que mais importa aqui:
 *
 *   LISTAGEM e SELEÇÃO  → filtra. Produto excluído não pode ser oferecido de novo.
 *   LEITURA DE DOCUMENTO → NÃO filtra. Orçamento, pedido e venda já gravados referenciam o
 *                          produto pelo id e exibem o nome pelo embed. Filtrar ali APAGARIA
 *                          o nome do item de documentos antigos — o dado histórico
 *                          desapareceria da tela por causa de uma exclusão feita depois.
 *
 * `null` NÃO É `false`. Registro anterior à coluna `is_active`, e embed ausente, contam como
 * ATIVOS: ausência é "nunca classificado", nunca "excluído" (ver `.claude/rules/
 * ausente-vs-falso.md`). É a mesma leitura do filtro PostgREST usado nas consultas.
 */

/**
 * Filtro PostgREST para `.or()`. Espelha `isActiveRecord` no lado do servidor: traz o que
 * está ativo e o que nunca foi classificado.
 */
export const ACTIVE_OR_NULL_FILTER = 'is_active.is.null,is_active.eq.true'

/**
 * `true` quando o registro NÃO foi excluído logicamente.
 *
 * Só `is_active === false` esconde. Ausente, `null` e `undefined` continuam visíveis —
 * inclusive o próprio registro ausente (`row` nulo), que é o caso do embed que não se aplica
 * àquela linha: uma linha de estoque de ITEM não tem produto embutido, e isso não a exclui.
 */
export function isActiveRecord(row: unknown): boolean {
    if (row === null || row === undefined) return true
    if (typeof row !== 'object' || Array.isArray(row)) return true
    return (row as { is_active?: unknown }).is_active !== false
}

/** Linha de estoque com os embeds que a listagem usa para exibir nome e unidade. */
export interface StockRowWithOwner {
    items?: { is_active?: unknown } | null
    products?: { is_active?: unknown } | null
}

/**
 * Remove da listagem de Estoque as linhas cujo produto ou item foi excluído logicamente.
 *
 * A linha de estoque tem `is_active` próprio, e a exclusão o desativa junto — mas isso não
 * basta: o efeito de auto-cura da tela de Estoque recria uma linha ATIVA logo depois, e é
 * essa cópia que reaparecia. Filtrar pelo dono é o que fecha o caso, porque o dono continua
 * inativo por mais linhas de estoque que existam apontando para ele.
 *
 * O parâmetro é genérico SEM restrição de shape de propósito: os tipos gerados do Supabase
 * (`database.types.ts`) estão atrás do schema real e descrevem os embeds como
 * `SelectQueryError`, o que faria a linha da consulta deixar de casar com a interface. Os
 * dois campos são lidos defensivamente aqui dentro; o retorno preserva o tipo de entrada.
 */
export function filterActiveStockRows<T>(rows: T[] | null | undefined): T[] {
    if (!rows) return []
    return rows.filter((row) => {
        const owner = (row ?? {}) as StockRowWithOwner
        return isActiveRecord(owner.items) && isActiveRecord(owner.products)
    })
}
