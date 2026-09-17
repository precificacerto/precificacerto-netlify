/**
 * decomposition-label.ts — o nome que o usuário lê, num lugar só.
 *
 * RENOMEAÇÃO (relatório "Motor RRO — Lucro Real", seção 6.5):
 *   Cascata · Cascata RRO · Memória Cascata  →  DECOMPOSIÇÃO
 *
 * >>> POR QUE UMA CONSTANTE, E NÃO UM LITERAL EM CADA TELA <<<
 * Um rótulo espalhado é o que faz uma renomeação pegar dois dos três lugares e deixar o
 * terceiro com o nome antigo — e ninguém percebe, porque cada tela isolada parece certa.
 * Com uma fonte só, a próxima troca de nome vale para todas por construção.
 *
 * >>> O QUE NÃO MUDOU, E POR QUÊ <<<
 * Os identificadores internos — `cascade_trace`, `CascadeStep`, `buildCascadeDoc`,
 * `ConsolidatedDREBlock` — seguem como estão. Renomear tipo e chave de jsonb é refatoração
 * de outra natureza, com risco próprio (dado gravado carrega o nome antigo), e misturá-la
 * com a troca de rótulo faria o diff da renomeação deixar de ser legível.
 */

export const DECOMPOSITION_LABEL = 'Decomposição'
