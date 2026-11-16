/**
 * O código e o nome do PRODUTO que o orçamento I.A. vira na tabela do vendedor (dono do produto, 16/11/2026). Puro e sem servidor: a tela de
 * precificação o importa. Um código por orçamento, para precificar de novo atualizar o mesmo produto (`gravarComoProduto`).
 */
export const codigoDoProdutoDoOrcamento = (numero: number) => `IA-${numero}`
export const nomeDoProdutoDoOrcamento = (numero: number, nome: string) => `Orçamento I.A. Nº ${numero} — ${nome.trim()}`
