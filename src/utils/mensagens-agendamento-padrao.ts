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

/**
 * >>> A LINHA DO {codigo} SAIU EM 06/10/2026, E VOLTA NA RODADA DO CANCELAMENTO <<<
 *
 * Decisão do PO: cancelar e alterar pelo link ainda NÃO existem. Mandar "use o código X" para o
 * cliente numa mensagem de confirmação é prometer uma ação que a tela não tem — ele tentaria,
 * não acharia onde, e ligaria para o salão. Promessa que o sistema não cumpre é pior que ausência
 * de promessa, e é a mesma razão de `ausente-vs-falso.md`: afirmar o que não existe.
 *
 * `{codigo}` CONTINUA em `VARIAVEIS_DAS_MENSAGENS` e na mensagem de ALTERAÇÃO, porque ela só é
 * enviada quando a ação já aconteceu — ali o código faz sentido, para a alteração seguinte.
 *
 * >>> CORREÇÃO DE UM ERRO DE FATO DESTE COMENTÁRIO, 08/10/2026 <<<
 * Até hoje esta nota dizia "nas outras DUAS mensagens". É falso, e foi medido: a de
 * CANCELAMENTO não usa `{codigo}` — não faz sentido mandar um código de cancelamento para quem
 * acabou de cancelar. A nota foi escrita por mim em 06/10 e descrevia a intenção, não o
 * arquivo. Quem a lesse procuraria na constante errada.
 *
 * O erro apareceu porque um caso de teste foi escrito a partir DESTA FRASE em vez do código —
 * `estado-relatado-vs-real.md` com o comentário no lugar da fonte primária. O caso ficou
 * vermelho na primeira execução, e a correção é aqui, não lá.
 *
 * ══ O RODAPÉ, ACRESCENTADO EM 08/10/2026 — E A DÍVIDA QUE ELE CRIA ══════════════════════
 *
 * Registro exigido pelo dono do produto, com esta frase:
 *
 *   Este rodapé promete alteração e cancelamento pelo link, que a Fase 2B ainda não entregou.
 *   Nenhuma tenant tem o link ligado — confirmar antes de ligar o primeiro.
 *
 * É a mesma tensão do `{codigo}` duas seções acima, e por isso as duas notas moram juntas: ali
 * a promessa foi RETIRADA por não existir ação; aqui ela foi ACRESCENTADA de propósito, com a
 * dívida anotada. A diferença é que `{codigo}` mandava o cliente usar um código que a tela não
 * aceita — instrução concreta e falsa —, e o rodapé diz "acesse pelo mesmo link", que é
 * verdadeiro quanto ao endereço e adiantado quanto à função.
 *
 * >>> AS 2 HORAS SÃO POLÍTICA COMERCIAL, NÃO REGRA DE CÓDIGO <<<
 *
 * Instrução do dono do produto, registrada como está: *"as 2 horas sao politica comercial, NAO
 * regra de codigo. Nao implemente trava nenhuma por causa dessa frase."* Não há `lead_time` novo,
 * não há janela de cancelamento, não há checagem em rota nenhuma por causa desta linha. Quem
 * vier implementar o cancelamento vai encontrar esta frase na mensagem e pode concluir que a
 * trava existe em algum lugar — ela não existe, e esta nota é o registro de que a ausência é
 * escolha (`ausente-vs-falso.md`).
 *
 * >>> SÓ A CONSTANTE MUDA <<<
 *
 * Tenant com texto próprio gravado em `msg_confirmacao` continua com o dela — `textoOuPadrao`
 * só cai no padrão quando a coluna está vazia. Nenhum UPDATE, nenhuma migração.
 */
export const MENSAGEM_CONFIRMACAO_PADRAO = `Olá {cliente}, seu agendamento está confirmado.

{servico} com {profissional}
{data} às {hora}
{empresa}

Necessitando alteração/cancelamento acesse pelo mesmo link. Cancelamento próximo ao horário (menos de 2 horas antes) será mantido/cobrado.`

export const MENSAGEM_CANCELAMENTO_PADRAO = `Olá {cliente}, seu agendamento foi cancelado.

{servico} com {profissional}
{data} às {hora}

Quando quiser, é só agendar de novo pelo mesmo link.
{empresa}`

/**
 * >>> A LINHA DO {codigo} SAIU DAQUI EM 08/10/2026, NA FASE 2B <<<
 *
 * Ela dizia: *"Para cancelar ou mudar outra vez, use o código {codigo}."*
 *
 * Instrução do dono do produto, registrada como está: *"Se as constantes citarem {codigo},
 * REMOVA - o codigo e de acesso, nao de referencia do agendamento, e publicar um codigo usado
 * nao serve para nada."*
 *
 * A razão é que o código MUDOU DE NATUREZA com a Fase 2B. Antes ele seria uma referência do
 * agendamento, estável, que o cliente guardaria. Agora é um código de ACESSO de 6 dígitos,
 * válido por 10 minutos, de uso único e já queimado no instante em que esta mensagem é enviada
 * — publicá-lo não autoriza nada e ainda ensina o cliente a procurar um número que não serve.
 *
 * `{codigo}` CONTINUA em `VARIAVEIS_DAS_MENSAGENS`: tirá-lo de lá apagaria a variável do
 * sistema, e a decisão foi sobre ESTA mensagem. A de CANCELAMENTO nunca o citou — conferido no
 * código, não no comentário.
 */
export const MENSAGEM_ALTERACAO_PADRAO = `Olá {cliente}, seu agendamento foi alterado.

Novo horário: {data} às {hora}
{servico} com {profissional}
{empresa}`

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
