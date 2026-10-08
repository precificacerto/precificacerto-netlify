/**
 * codigo-de-acesso.ts — o código de 6 dígitos que deixa o cliente mexer no próprio agendamento.
 *
 * Comando do PO de 08/10/2026, Fase 2B.
 *
 * ══ O QUE ESTE ARQUIVO PROTEGE, E DE QUEM ═══════════════════════════════════════════════
 *
 * Quem tiver o código de alguém cancela o agendamento dessa pessoa. Então:
 *
 *   · o código é gerado por `crypto.randomInt`, NUNCA por `Math.random` — `Math.random` é
 *     previsível a partir de saídas anteriores, e com 6 dígitos e um gerador previsível dá para
 *     adivinhar o próximo;
 *   · ele é guardado como HASH com SAL POR LINHA, nunca em claro. Quem conseguir ler a tabela
 *     (um dump, um backup, um `select` por engano) não consegue cancelar agendamento de ninguém;
 *   · a comparação é por `timingSafeEqual`, não por `===`. Comparar strings vaza, pelo tempo,
 *     quantos caracteres iniciais estavam certos — com 6 dígitos isso reduz a busca de um
 *     milhão para sessenta tentativas.
 *
 * ── `agora` É INJETADO ──────────────────────────────────────────────────────────────────
 *
 * `new Date()` dentro da validação poria o relógio na chamada: o mesmo código passaria num
 * minuto e falharia no outro, e o caso de expiração passaria hoje e falharia amanhã. É a mesma
 * decisão de `horarios-disponiveis.ts` e `ordenar-ausencias.ts`, e as duas já têm portão.
 *
 * ── O `motivo` É PARA O LOG DO SERVIDOR, NUNCA PARA A RESPOSTA HTTP ─────────────────────
 *
 * Distinguir 'expirado' de 'errado' na resposta diria ao atacante que o código EXISTIU — e
 * 'bloqueado' diria que ele acertou o telefone e gastou as tentativas de alguém. A rota responde
 * sempre a mesma coisa, e há caso provando que ela não vaza o motivo.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'

export const DIGITOS_DO_CODIGO = 6
export const MAX_TENTATIVAS = 3
export const VALIDADE_MIN = 10

export type MotivoDaRecusa = 'expirado' | 'usado' | 'errado' | 'bloqueado'

export type ValidacaoDoCodigo =
  | { ok: true }
  | { ok: false; motivo: MotivoDaRecusa }

export type CodigoRecusado = Extract<ValidacaoDoCodigo, { ok: false }>

/**
 * O resultado é uma recusa?
 *
 * >>> ESTA GUARDA EXISTE POR UMA RAZÃO MEDIDA, NÃO POR GOSTO <<<
 *
 * O `tsconfig.json` deste repositório tem `strictNullChecks: false`, e com ele DESLIGADO o
 * TypeScript não estreita união discriminada por literal booleano: `if (!r.ok) r.motivo` falha
 * com `TS2339`. Medido ao ligar a rota de validação; é a mesma razão de `faixaRecusada`,
 * `montagemRecusada` e `ausenciaRecusada`.
 */
export function codigoRecusado(r: ValidacaoDoCodigo): r is CodigoRecusado {
  return r?.ok === false
}

/**
 * Seis dígitos, de `crypto.randomInt`.
 *
 * >>> `Math.random` ESTÁ PROIBIDO AQUI, E O PORTÃO MEDE O ARQUIVO <<<
 * Ele é um PRNG não criptográfico: conhecidas algumas saídas, as seguintes são deriváveis. Para
 * um segredo de 6 dígitos que autoriza cancelar agendamento, isso é o bastante para abusar.
 *
 * `randomInt(1_000_000)` devolve 0..999999 com distribuição uniforme — sem o viés de módulo que
 * `randomBytes(4) % 1000000` teria. O `padStart` preserva os zeros à esquerda: `000042` é um
 * código de seis dígitos legítimo, e tratá-lo como `42` quebraria a comparação.
 */
export function gerarCodigo(): string {
  return String(randomInt(1_000_000)).padStart(DIGITOS_DO_CODIGO, '0')
}

/** O sal de uma linha. Novo a cada código — é o que impede uma rainbow table de 10^6 entradas. */
export function gerarSal(): string {
  return randomBytes(16).toString('hex')
}

/**
 * `sha256(sal + ':' + codigo)`.
 *
 * O separador `:` existe para que `sal='ab', codigo='1cd'` e `sal='ab1', codigo='cd'` não
 * produzam o mesmo hash — colisão por concatenação ambígua. Com o sal em hex de tamanho fixo o
 * risco é teórico, e o separador custa um byte.
 */
export function hashDoCodigo(codigo: string, sal: string): string {
  return createHash('sha256').update(`${sal}:${String(codigo ?? '')}`).digest('hex')
}

/** Comparação de tempo constante entre dois hex de mesmo tamanho. */
function iguaisSemVazarTempo(a: string, b: string): boolean {
  const ba = Buffer.from(String(a ?? ''), 'utf8')
  const bb = Buffer.from(String(b ?? ''), 'utf8')
  // `timingSafeEqual` joga quando os tamanhos diferem, e o próprio tamanho já é público (sha256
  // em hex tem 64 chars sempre). A comparação de tamanho antes é segura e necessária.
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function validarCodigo(params: {
  hash: string
  codigo: string
  sal: string
  expiresAt: string | Date
  attempts: number
  usedAt: string | Date | null
  agora: Date
}): ValidacaoDoCodigo {
  const agora = params?.agora ? params.agora.getTime() : NaN

  // ══ A ORDEM DAS RECUSAS, E ELA NÃO É ARBITRÁRIA ═════════════════════════════════════
  //
  // 'bloqueado' vem PRIMEIRO, e vence até o código certo. Se a comparação acontecesse antes,
  // um atacante com o código correto na quarta tentativa entraria — e o limite de três
  // tentativas existe exatamente para que a terceira seja a última, acerte ou não.
  //
  // Depois 'usado', depois 'expirado', e só então a comparação. Os três primeiros são estado da
  // linha e não dependem do que foi digitado; checá-los antes evita gastar a comparação
  // criptográfica num código que já não valeria de todo jeito.
  if ((params?.attempts ?? 0) >= MAX_TENTATIVAS) return { ok: false, motivo: 'bloqueado' }

  if (params?.usedAt) return { ok: false, motivo: 'usado' }

  const expira = params?.expiresAt ? new Date(params.expiresAt).getTime() : NaN
  // Expiração ausente ou ilegível conta como EXPIRADO, não como válido: `ausente-vs-falso.md`
  // aplicado a segurança — na dúvida, recusa. Um `NaN` lido como "não expira" seria uma linha
  // corrompida virando código eterno.
  if (Number.isNaN(expira) || Number.isNaN(agora) || expira <= agora) {
    return { ok: false, motivo: 'expirado' }
  }

  if (!iguaisSemVazarTempo(params.hash, hashDoCodigo(params.codigo, params.sal))) {
    return { ok: false, motivo: 'errado' }
  }

  return { ok: true }
}

/** O instante em que um código gerado AGORA expira. `agora` injetado, como todo o resto. */
export function expiraEm(agora: Date): Date {
  return new Date(agora.getTime() + VALIDADE_MIN * 60_000)
}
