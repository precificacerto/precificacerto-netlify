/**
 * agendamento-token.ts — o token do link público, gerado NO SERVIDOR.
 *
 * Arquivo SEPARADO de `agendamento-config.ts` de propósito: aqui mora `node:crypto`, e
 * `agendamento-config.ts` é lido pela tela, no navegador. Juntar os dois arrastaria `crypto`
 * para o bundle do cliente — e, pior, deixaria a tentação de chamar o gerador de lá.
 *
 * >>> `Math.random()` NÃO SERVE, E O MOTIVO NÃO É ESTILO <<<
 *
 * `Math.random()` não é criptográfico: a sequência é previsível a partir de saídas
 * observadas. O token É a credencial do link — quem o adivinha lê a agenda de um salão e
 * marca em nome de terceiros. É a mesma razão de o token ser OPACO em vez de o nome da
 * empresa: `/agendar/barbearia-do-ze` deixaria varrer nomes; um token adivinhável deixaria
 * varrer tokens.
 */

import { randomBytes } from 'crypto'

/**
 * 16 bytes = 128 bits de entropia, em `base64url`.
 *
 * `base64url` em vez de `hex` porque cabe na URL sem escape (sem `+`, `/` nem `=`) e gasta 22
 * caracteres contra os 32 do hex para a MESMA entropia. E em vez de `base64` puro porque `+`
 * e `/` num path de URL precisariam de encode, e um token que muda ao ser copiado é um token
 * que não funciona.
 *
 * Os 128 bits são o número do §2 do comando. Reduzi-los a 8 bytes tornaria a varredura
 * viável; aumentá-los não compra nada contra um atacante que já não consegue 2^128.
 */
export const BYTES_DO_TOKEN = 16

export function gerarTokenDeAgendamento(): string {
  return randomBytes(BYTES_DO_TOKEN).toString('base64url')
}
