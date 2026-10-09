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

/**
 * As variáveis que a tela OFERECE nas três caixas de texto — e é a mesma lista que o painel
 * exibe no cabeçalho de cada uma. Uma fonte só, importada; duas listas divergiriam
 * (`copia-divergente.md`).
 *
 * >>> `{codigo}` NÃO ENTRA AQUI, E A RAZÃO É MEDIDA, NÃO DE ESTILO <<<
 *
 * Decisão do dono do produto em 09/10/2026, registrada como está:
 *
 *   `{codigo}` não entra aqui. Ele nasce no fluxo de solicitação (`codigo-solicitar`) e vai numa
 *   mensagem própria, de texto fixo. Na confirmação ele ainda não existe; no cancelamento e na
 *   alteração já foi consumido, porque é de uso único. Oferecer na tela uma variável que os três
 *   envios ignoram faz a tenant escrever um texto que chega ao cliente com o literal `{codigo}`.
 *
 * A medição que derrubou a premissa anterior, feita em 09/10/2026 nas três rotas, pelo objeto
 * `vars` que cada uma passa a `enviarMensagemDoAgendamento`:
 *
 * | rota | `vars` | tem `codigo`? |
 * |---|---|---|
 * | `agendar.ts:189` | `cliente servico data hora empresa profissional` | **não** |
 * | `cancelar.ts:148` | `cliente servico profissional data hora empresa` | **não** |
 * | `remarcar.ts:159` | as mesmas, mais `dataAntiga`/`horaAntiga` | **não** |
 * | `codigo-solicitar.ts:198` | `codigo empresa` — e esse texto NÃO é editável pela tenant | sim |
 *
 * `codigo-solicitar.ts` não foi tocado: ali o `{codigo}` é legítimo e funciona.
 *
 * A autoria da premissa derrubada é do próprio dono do produto, e ele mandou registrar assim —
 * é a classe de `hipotese-derrubada-pela-propria-medicao.md`: a razão para oferecer a variável
 * ("a Fase 2B devolveu função ao código") era suposição, e a medição das três rotas a desmentiu
 * antes de qualquer linha ser escrita.
 */
export const VARIAVEIS_DAS_MENSAGENS = [
  '{cliente}',
  '{servico}',
  '{profissional}',
  '{data}',
  '{hora}',
  '{empresa}',
] as const

/**
 * >>> A LINHA DO {codigo} SAIU EM 06/10/2026, E VOLTA NA RODADA DO CANCELAMENTO <<<
 *
 * Decisão do PO: cancelar e alterar pelo link ainda NÃO existem. Mandar "use o código X" para o
 * cliente numa mensagem de confirmação é prometer uma ação que a tela não tem — ele tentaria,
 * não acharia onde, e ligaria para o salão. Promessa que o sistema não cumpre é pior que ausência
 * de promessa, e é a mesma razão de `ausente-vs-falso.md`: afirmar o que não existe.
 *
 * >>> SEGUNDA CORREÇÃO DESTE MESMO PARÁGRAFO, 09/10/2026 <<<
 * Ele dizia: *"`{codigo}` CONTINUA em `VARIAVEIS_DAS_MENSAGENS` e na mensagem de ALTERAÇÃO,
 * porque ela só é enviada quando a ação já aconteceu — ali o código faz sentido, para a
 * alteração seguinte."* As duas metades estavam erradas: a linha saiu da constante de
 * ALTERAÇÃO em 08/10 (ver a nota dela, abaixo), e a variável saiu de
 * `VARIAVEIS_DAS_MENSAGENS` hoje. "Ali o código faz sentido" era a suposição, e ela cai pelo
 * uso único: quando a mensagem de alteração sai, o código que a autorizou já foi queimado.
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
 * >>> E EM 09/10/2026 ELE SAIU DE `VARIAVEIS_DAS_MENSAGENS` TAMBÉM <<<
 * Esta nota dizia que ele CONTINUAVA na constante da tela, porque "tirá-lo de lá apagaria a
 * variável do sistema". O raciocínio tratava a lista como catálogo do que o sistema conhece; ela
 * é o que a TELA OFERECE à tenant, e oferecer o que os três envios ignoram é o defeito. A razão
 * completa está no comentário de `VARIAVEIS_DAS_MENSAGENS`. A de CANCELAMENTO nunca o citou —
 * conferido no código, não no comentário, e isso segue valendo.
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

/** Qualquer `{nome}` com letra, dígito ou `_` — é o formato que as três mensagens usam. */
const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g
/** Marca interna do placeholder sem valor. Nunca aparece no resultado. */
const SEM_VALOR = '\u0000'

/**
 * Interpola `{nome}` pelos valores de `vars` e **REMOVE o que não tiver valor**, junto com o
 * espaço que sobraria.
 *
 * ══ A SALVAGUARDA, E POR QUE ELA É NECESSÁRIA MESMO DEPOIS DA CORREÇÃO DA TELA ═══════════
 *
 * Instrução do dono do produto em 09/10/2026, registrada como está: *"ha tenant que pode ter
 * digitado {codigo} antes desta correcao: no envio das tres mensagens, qualquer placeholder
 * {algo} que nao tenha valor em `vars` deve ser REMOVIDO do texto final, junto com espaco
 * sobrando - nao pode sair literal para o cliente. Uma unica funcao faz isso, usada pelos
 * tres."*
 *
 * Tirar `{codigo}` da lista da tela impede a tenant de ESCOLHER a variável daqui para frente;
 * não apaga o texto que ela já salvou. As três colunas são texto livre, e o que estiver gravado
 * nelas é o que sai. Sem esta limpeza, o cliente receberia `use o código {codigo}` com as
 * chaves — pior que a vírgula solta, porque parece defeito do salão.
 *
 * >>> VALOR VAZIO CONTA COMO SEM VALOR, E ISSO É O ITEM 2 DO COMANDO <<<
 *
 * `cliente: ''` não é "o nome é a string vazia": é *não sei o nome*. Interpolar o vazio produz
 * `Olá , seu agendamento foi cancelado.` — a vírgula solta que esta rodada corrige. Tratar os
 * dois casos igual é `ausente-vs-falso.md`: o vazio não afirma nada, e o texto não deve afirmar
 * que havia um nome ali.
 *
 * ══ UMA PASSAGEM SÓ, E ISSO MUDA UM COMPORTAMENTO ANTIGO ════════════════════════════════
 *
 * O envio fazia `for (const [k, v] of Object.entries(vars)) texto = texto.split(...).join(v)` —
 * substituição SEQUENCIAL. Com ela, um valor que contivesse `{hora}` seria preenchido pela
 * volta seguinte do laço. O nome de um cliente é dado de fora, então isso era injeção de
 * template, estreita mas real. Uma passagem só de `replace` fecha a porta: o que sai de uma
 * substituição não é reexaminado.
 *
 * ══ O ESPAÇO: A REGRA É SIMÉTRICA, E ELA TEM CASO PRÓPRIO ═══════════════════════════════
 *
 * | o trecho | com o placeholder sem valor | resultado |
 * |---|---|---|
 * | `Olá {cliente}, seu` | espaço antes, pontuação depois | `Olá, seu` |
 * | `use o {codigo} agora` | espaço nos dois lados | `use o agora` — UM espaço, não dois |
 * | `{servico} com` | nada antes | `com` — sem espaço no começo da linha |
 * | `com {profissional}` | nada depois | `com` |
 *
 * Só espaço HORIZONTAL (` ` e tab) é consumido: comer `\n` juntaria linhas da mensagem, e o
 * `{empresa}` da última linha apagaria a quebra antes dela.
 */
export function aplicarVariaveis(texto: string, vars: Record<string, string>): string {
  const comMarcas = String(texto ?? '').replace(PLACEHOLDER, (_todo, nome: string) => {
    const v = (vars ?? {})[nome]
    // `null`, `undefined` e string em branco são todos "sem valor" — ver o parágrafo acima.
    if (v === null || v === undefined || String(v).trim().length === 0) return SEM_VALOR
    return String(v)
  })

  return comMarcas.replace(
    new RegExp(`([ \\t]*)${SEM_VALOR}([ \\t]*)`, 'g'),
    // Espaço nos DOIS lados: sobra um, para não colar as palavras vizinhas. Em qualquer outro
    // caso não sobra nada — é o que tira a vírgula solta e o espaço no começo da linha.
    (_todo, antes: string, depois: string) => (antes && depois ? ' ' : ''),
  )
}
