/**
 * mensagens-agendamento-padrao.ts — os textos com que as três mensagens NASCEM na tela.
 *
 * Comando do PO de 06/10/2026, §3.
 *
 * >>> POR QUE EM CÓDIGO E NÃO COMO `DEFAULT` NA COLUNA <<<
 *
 * As três colunas de `tenant_booking_settings` (`msg_confirmacao`, `msg_cancelamento`,
 * `msg_alteracao`) são NULL em produção, e o PO decidiu não rodar UPDATE nem criar migração com
 * DEFAULT. A razão é a de `ausente-vs-falso.md`: `DEFAULT` na coluna apagaria a distinção entre
 * "o tenant nunca mexeu no texto" e "o tenant escolheu exatamente este texto". Com o padrão em
 * código, `NULL` continua significando *não personalizado* — e no dia em que o padrão mudar,
 * quem nunca editou recebe o texto novo, e quem editou continua com o dele.
 *
 * O preenchimento é de APRESENTAÇÃO: o textarea nasce com o padrão, editável, e ao salvar vai o
 * que estiver na tela. Nada é gravado só por abrir o painel.
 *
 * As variáveis entre chaves são substituídas pela fase 2, no envio. Aqui elas são texto.
 */

export const VARIAVEIS_DAS_MENSAGENS = [
  '{cliente}',
  '{servico}',
  '{profissional}',
  '{data}',
  '{hora}',
  '{empresa}',
  '{codigo}',
] as const

export const MENSAGEM_CONFIRMACAO_PADRAO = `Olá {cliente}, seu agendamento está confirmado.

{servico} com {profissional}
{data} às {hora}
{empresa}

Precisa cancelar ou mudar o horário? Use o código {codigo}.`

export const MENSAGEM_CANCELAMENTO_PADRAO = `Olá {cliente}, seu agendamento foi cancelado.

{servico} com {profissional}
{data} às {hora}

Quando quiser, é só agendar de novo pelo mesmo link.
{empresa}`

export const MENSAGEM_ALTERACAO_PADRAO = `Olá {cliente}, seu agendamento foi alterado.

Novo horário: {data} às {hora}
{servico} com {profissional}
{empresa}

Para cancelar ou mudar outra vez, use o código {codigo}.`

/**
 * O texto que o textarea mostra: o do banco quando há, o padrão quando não há.
 *
 * `null`, `undefined` e string em branco são todos "não personalizado". Tratar `'   '` como
 * texto escolhido deixaria o tenant com uma mensagem vazia sem perceber.
 */
export function textoOuPadrao(valorDoBanco: string | null | undefined, padrao: string): string {
  const v = String(valorDoBanco ?? '').trim()
  return v.length > 0 ? String(valorDoBanco) : padrao
}
