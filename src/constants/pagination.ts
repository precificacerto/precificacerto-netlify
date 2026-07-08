/**
 * Paginação — fonte de verdade única do sistema.
 *
 * Documento Único de Correção (Item B, Julho 2026): todas as listas do sistema
 * paginam com 50 itens por página. Manter um único ponto de manutenção — alterar
 * o volume padrão no futuro é uma linha.
 */

/** Itens por página padrão em todas as listas do sistema. */
export const PAGE_SIZE = 50

/** Opções de tamanho de página oferecidas ao usuário (quando showSizeChanger ativo). */
export const PAGE_SIZE_OPTIONS = ['25', '50', '100', '200'] as const
