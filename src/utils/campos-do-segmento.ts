/**
 * campos-do-segmento.ts — QUAIS CAMPOS DE TRIBUTO A TELA MOSTRA, por segmento.
 *
 * Decisão do dono do produto, 17/09/2026, registrada como está:
 *
 *   "O CAMPO SOME. IPI não aparece em revenda. Coerente com 'INEXISTENTE não tem linha'
 *    da Parte 0. Se o tributo não existe no segmento, não há campo.
 *    Some também o IS, e qualquer outro que a matriz diga INEXISTENTE no segmento.
 *    NÃO TRATE O IPI COMO CASO ESPECIAL — a matriz é a fonte."
 *
 * ── O QUE ISTO FECHA ─────────────────────────────────────────────────────────
 *
 * Medido em 17/09/2026, na tela de produto em REVENDA, custo R$ 1.250, ICMS 17%,
 * PIS/COFINS efetivo 7,678%, IBS 1%, CBS 9%:
 *
 * | | `applied` | `c` | MC | P |
 * |---|---|---:|---:|---:|
 * | com IPI 9% | **false** — a matriz recusa | **0** | 43,2020% | 2.893,38 |
 * | sem IPI    | true                        | 6,9055% | 39,6750% | 3.150,59 |
 *
 * O campo aceitava a alíquota, `buildProductConstruction` devolvia
 * `NOT_APPLIED('alíquota declarada onde a matriz diz INEXISTENTE')`, o componente
 * descartava `applied`, `reason` E `errors`, e caía em `computeIvaDualOutside` — que
 * soma o IPI POR CIMA do preço formado sem ele. É o que a R9 chama de erro:
 *
 *   "Somar o IPI por cima do preço sem IPI é erro, não atalho. O IPI altera `c`, que
 *    altera a MC, que altera o preço inteiro."
 *
 * Com o campo ausente a porta fecha NA ORIGEM: não há como digitar alíquota onde a
 * matriz diz INEXISTENTE.
 *
 * ── POR QUE ESTE MÓDULO E NÃO UM `if` NA TELA ────────────────────────────────
 *
 * Um `if (segmento === 'REVENDA') esconde o IPI` seria a matriz reescrita numa
 * condição — `regime-e-segmento-determinam-a-construcao.md` de novo, agora na
 * apresentação. Acrescentar um tributo à matriz não faria o campo aparecer, e mudar
 * uma célula não faria o campo sumir. Aqui a tela LÊ `placementOf`, e as duas coisas
 * passam a andar juntas por construção.
 *
 * ── O QUE ELE NÃO DECIDE ─────────────────────────────────────────────────────
 *
 * Não decide valor, não decide ordem, não decide rótulo. Responde uma pergunta só:
 * **este tributo tem LINHA NA TABELA DO PREÇO, neste segmento?**
 *
 * >>> A PERGUNTA MUDOU DE REDAÇÃO EM 11/10/2026, E A MUDANÇA É SUBSTANTIVA <<<
 *
 * Ela dizia *"este tributo tem linha neste segmento?"*, e isso bastava enquanto
 * `Placement` tinha três valores. Com `ACRESCIMO` no tipo, as duas perguntas deixam de
 * ser a mesma: **um acréscimo EXISTE no segmento e NÃO tem linha na tabela do preço.**
 * ICMS-ST e DIFAL são custo puro sobre a nota e não formam preço.
 */

import { placementOf, type CalcType, type TaxName } from './pricing-engine'

/**
 * O tributo tem LINHA NA TABELA DO PREÇO, neste segmento?
 *
 * `true` para POR_DENTRO e POR_FORA — o lado muda a conta, não a existência do campo.
 *
 * >>> `ACRESCIMO` NÃO TEM LINHA, E A DECISÃO É DO DONO DO PRODUTO (11/10/2026) <<<
 *
 * A condição era `!== 'INEXISTENTE'`, o que dava linha a tudo que não fosse inexistente.
 * Com `ACRESCIMO` no tipo isso passaria a dar linha ao ICMS-ST e ao DIFAL, e a razão de
 * não dar é a mesma do travessão contra o zero:
 *
 *   > Um acréscimo com percentual e valor naquela tabela **afirmaria um cálculo que não
 *   > existe**. ICMS-ST e DIFAL já têm bloco próprio — "Alíquotas tributárias adicionais
 *   > (avançado)" —, que é o lugar certo.
 *
 * É `ausente-vs-falso.md` na célula: exibir base e percentual para um valor que não
 * compõe o preço afirma uma participação que ele não tem. E a lista POSITIVA (`POR_DENTRO
 * || POR_FORA`) é mais segura que a negativa: um quinto estado futuro nasce SEM linha, e
 * quem o quiser na tabela precisa dizer isso aqui — em vez de ganhar linha por omissão.
 *
 * O bloco avançado NÃO é religado nesta rodada: quem trata ICMS-ST e DIFAL continua
 * sendo `computeAdvancedOutsideTaxes`, e nenhuma célula deles mudou de lugar.
 */
export function tributoExisteNoSegmento(segmento: CalcType, tributo: TaxName): boolean {
  const place = placementOf(segmento, tributo)
  return place === 'POR_DENTRO' || place === 'POR_FORA'
}

/**
 * Filtra uma lista de linhas de tributo pela matriz, preservando a ordem.
 *
 * Genérica de propósito: a tela passa o que ela já tem (rótulo, valor, handler) e
 * recebe de volta só o que existe. Nenhum tributo é nomeado aqui.
 */
export function apenasTributosQueExistem<T extends { tributo: TaxName }>(
  segmento: CalcType,
  linhas: readonly T[],
): T[] {
  return linhas.filter((l) => tributoExisteNoSegmento(segmento, l.tributo))
}
