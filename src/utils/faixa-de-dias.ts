/**
 * faixa-de-dias.ts — os dias da faixa horizontal da página pública, e o salto para o próximo
 * dia com vaga.
 *
 * Comando do PO de 09/10/2026.
 *
 * ══ POR QUE AS PARTES SAEM SEPARADAS ═════════════════════════════════════════════════════
 *
 * A `proximosDias` que existia em `/agendar/[token].tsx` devolvia `{ valor, rotulo }`, e o
 * `rotulo` era UMA string: `"sex., 09/10"`. A faixa tem três linhas —
 *
 *     SEX
 *     09
 *     out
 *
 * — e três linhas não saem de uma string sem alguém fatiar texto formatado por `Intl`, que é
 * exatamente o tipo de corte que quebra quando a locale muda. As partes saem separadas da
 * fonte, e o `rotulo` continua existindo para o `aria-label`, por extenso.
 *
 * ══ `hoje` É INJETADO ════════════════════════════════════════════════════════════════════
 *
 * Nenhum `new Date()` aqui dentro. É a mesma disciplina de `horarios-disponiveis.ts`,
 * `ordenar-ausencias.ts` e `codigo-de-acesso.ts`: a função pura recebe o instante, a página lê
 * o relógio. Sem isso o portão da virada do dia seria um teste que às vezes passa.
 *
 * ══ O FUSO É O DO AGENDAMENTO, NÃO O DO VISITANTE ════════════════════════════════════════
 *
 * `America/Sao_Paulo`, igual a `FUSO_DO_AGENDAMENTO` de `horarios-disponiveis.ts`. Um cliente
 * acessando de Portugal às 02:00 do dia seguinte dele veria a faixa começar no dia errado — e
 * o `valor` que ele mandasse não casaria com o dia que a rota calcula.
 */

/** O mesmo fuso de `horarios-disponiveis.ts`. A barbearia é que define o dia, não o visitante. */
export const FUSO_DA_FAIXA = 'America/Sao_Paulo'

export type DiaDaFaixa = {
  /** `YYYY-MM-DD` no fuso da barbearia — é o que vai no `?dia=` da rota. */
  valor: string
  /** `SEX` — abreviação do dia da semana, em caixa alta, sem ponto. */
  diaSemana: string
  /** `09` — o dia do mês, dois dígitos. */
  dia: string
  /** `out` — abreviação do mês, sem ponto. */
  mes: string
  /** `sexta-feira, 09 de outubro` — para o `aria-label`, por extenso. */
  rotulo: string
}

/** `"sex."` → `"SEX"`. O ponto é da locale; a caixa alta é do desenho. */
function semPonto(s: string): string {
  return s.replace(/\.$/, '')
}

/**
 * Os `n` dias a partir de `hoje`, inclusive, no fuso da barbearia.
 *
 * `n <= 0` devolve `[]` — a tela não pode receber `undefined` e quebrar por causa de um
 * `horizonteDias` que chegou zerado.
 */
export function proximosDias(n: number, hoje: Date): DiaDaFaixa[] {
  const out: DiaDaFaixa[] = []
  const quantos = Math.max(0, Math.floor(Number(n) || 0))
  for (let i = 0; i < quantos; i += 1) {
    const d = new Date(hoje.getTime() + i * 86400000)
    const parte = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_DA_FAIXA, ...opts }).format(d)
    out.push({
      // `sv-SE` com `dateStyle: 'short'` é `YYYY-MM-DD`. É a MESMA expressão que a página usava
      // antes desta rodada, preservada de propósito: trocá-la mudaria o `?dia=` enviado à rota.
      valor: new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO_DA_FAIXA, dateStyle: 'short' }).format(d),
      diaSemana: semPonto(parte({ weekday: 'short' })).toUpperCase(),
      dia: parte({ day: '2-digit' }),
      mes: semPonto(parte({ month: 'short' })),
      rotulo: parte({ weekday: 'long', day: '2-digit', month: 'long' }),
    })
  }
  return out
}

/**
 * Quantos horários cada dia tem. `undefined` = **AINDA NÃO SONDADO**, e isso é diferente de `0`.
 *
 * É a distinção de `ausente-vs-falso.md` aplicada à faixa: `0` afirma *este dia não tem vaga* e
 * desabilita o botão; `undefined` não afirma nada e o botão nasce HABILITADO. A sondagem pode
 * falhar, pode não ter voltado ainda, pode nunca voltar — e em nenhum desses casos a tela tem o
 * direito de dizer que o dia está cheio.
 */
export type VagasPorDia = Record<string, number | undefined>

/**
 * O dia está SEM VAGA de forma conhecida?
 *
 * Só `0` desabilita. `undefined` abre, e é a condição (a) do comando: *"Se o pré-carregamento da
 * janela falhar ou demorar, os dias nascem HABILITADOS, e o usuário descobre ao clicar."*
 * Página que trava porque a sondagem não voltou é pior que página que recusa um clique.
 */
export function diaSemVaga(vagas: VagasPorDia, valor: string): boolean {
  return vagas[valor] === 0
}

/**
 * O primeiro dia com vaga CONHECIDA, ou `null`.
 *
 * Usado para a pré-seleção ao abrir. Dia não sondado NÃO conta: pré-selecionar um dia que pode
 * estar cheio mostraria "Sem horários neste dia" na abertura, que é a pior primeira tela
 * possível.
 */
export function primeiroDiaComVaga(dias: DiaDaFaixa[], vagas: VagasPorDia): string | null {
  for (const d of dias) {
    const v = vagas[d.valor]
    if (typeof v === 'number' && v > 0) return d.valor
  }
  return null
}

/**
 * O próximo dia com vaga CONHECIDA **depois** de `referencia`, ou `null`.
 *
 * É o destino do botão "Ver 11/10, o próximo com vaga". `null` quando não há nenhum sondado com
 * vaga adiante — e aí o botão não aparece, em vez de aparecer e não levar a lugar nenhum
 * (`ausente-vs-falso.md`: um botão que não faz nada afirma que há para onde ir).
 */
export function proximoDiaComVaga(
  dias: DiaDaFaixa[], vagas: VagasPorDia, referencia: string,
): string | null {
  const i = dias.findIndex((d) => d.valor === referencia)
  if (i < 0) return null
  for (const d of dias.slice(i + 1)) {
    const v = vagas[d.valor]
    if (typeof v === 'number' && v > 0) return d.valor
  }
  return null
}

/** `2026-10-11` → `11/10`. Para o rótulo do botão do próximo dia com vaga. */
export function diaCurtoBR(valor: string): string {
  const p = String(valor ?? '').split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}` : String(valor ?? '')
}
