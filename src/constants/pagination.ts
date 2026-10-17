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

/**
 * A lista de seleção do envio para sequência (Conectividade → Disparo manual) pagina com 100,
 * e não com o `PAGE_SIZE` do sistema. EXCEÇÃO DECIDIDA pelo dono do produto em 17/10/2026, na
 * maquete aprovada: é uma lista de MARCAR, não de ler, e marcar em páginas de 50 dobra os
 * cliques. Mora aqui, ao lado da regra geral, para que a exceção seja vista por quem mexer nela.
 */
export const PAGE_SIZE_SELECAO_DE_SEQUENCIA = 100
