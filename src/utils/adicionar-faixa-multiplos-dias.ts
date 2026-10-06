/**
 * adicionar-faixa-multiplos-dias.ts — uma faixa de horário aplicada a VÁRIOS dias de uma vez.
 *
 * Comando do PO de 06/10/2026, §2.1. O `Select` de um dia só virou sete caixas de seleção, e
 * esta função é a regra: ou todos os dias escolhidos entram, ou nenhum entra.
 *
 * `weekday` é 0 = DOMINGO … 6 = SÁBADO, igual à coluna `employee_working_hours.weekday`.
 * NÃO é a convenção de `recurWeekdays` (`agenda/index.tsx:152`), que é isoWeekday e vale para
 * recorrência de EVENTO — a travessia entre as duas é `deRecurWeekdayParaWeekday`.
 *
 * ── O CRITÉRIO DE SOBREPOSIÇÃO NÃO É REESCRITO AQUI, É DELEGADO ───────────────────────────
 *
 * `validarFaixa` (`agendamento-config.ts`) já decide se duas faixas se sobrepõem, e já tem
 * portão próprio com a mutação que o prova. Reescrever a comparação aqui criaria DUAS
 * implementações do mesmo critério, e a divergência apareceria como horário oferecido ao
 * cliente num dia em que o barbeiro não trabalha — `copia-divergente.md`, e o remédio dela é
 * apagar uma cópia, não conferir as duas.
 *
 * O que esta função acrescenta é o LAÇO POR DIA e a regra do tudo-ou-nada; o que é conflito
 * continua sendo uma decisão só, num lugar só.
 *
 * ── TUDO OU NADA, E É POR ISSO QUE A LISTA VOLTA VAZIA ────────────────────────────────────
 *
 * Com cinco dias marcados e conflito em um, devolver as quatro faixas boas pareceria
 * prestativo e seria pior: o usuário veria "adicionado" e ficaria sem saber que a quarta-feira
 * não entrou. A gravação é um `insert` único com array, atômico no Postgres — devolver quatro
 * de cinco obrigaria o chamador a decidir sozinho o que fazer com a diferença.
 */

import { horaParaMinutos, validarFaixa, faixaRecusada } from './agendamento-config'

export type FaixaHorario = { weekday: number; start_time: string; end_time: string }

export type ResultadoFaixa =
  | { ok: true; novasFaixas: FaixaHorario[] }
  | { ok: false; erro: string; diasEmConflito: number[] }

export type FaixaRecusadaEmDias = Extract<ResultadoFaixa, { ok: false }>

/**
 * O resultado é uma recusa?
 *
 * >>> ESTA GUARDA EXISTE POR UMA RAZÃO MEDIDA, NÃO POR GOSTO <<<
 *
 * O `tsconfig.json` deste repositório tem `strictNullChecks: false`, e com ele DESLIGADO o
 * TypeScript não estreita união discriminada por literal booleano: `if (!r.ok) r.diasEmConflito`
 * falha com `TS2339: Property 'diasEmConflito' does not exist on type 'ResultadoFaixa'`. Medido
 * ao ligar o painel.
 *
 * A guarda de usuário estreita independentemente disso e NÃO muda o contrato pedido: a
 * alternativa seria tornar `erro` e `diasEmConflito` opcionais no ramo de sucesso, que é
 * `construtor-empobrecido.md` — campo opcional em contrato que decide comportamento.
 * É a mesma guarda, pelo mesmo motivo, de `faixaRecusada` em `agendamento-config.ts`.
 */
export function faixaEmDiasRecusada(r: ResultadoFaixa): r is FaixaRecusadaEmDias {
  return r?.ok === false
}

export const ERRO_SEM_DIA = 'Selecione ao menos um dia da semana.'
export const ERRO_HORA_INVERTIDA = 'A hora final deve ser maior que a inicial.'

export function adicionarFaixaEmDias(params: {
  diasSelecionados: number[]
  inicio: string
  fim: string
  faixasExistentes: FaixaHorario[]
}): ResultadoFaixa {
  const dias = params?.diasSelecionados ?? []
  const existentes = params?.faixasExistentes ?? []

  // 1 — nenhum dia marcado
  if (dias.length === 0) {
    return { ok: false, erro: ERRO_SEM_DIA, diasEmConflito: [] }
  }

  // 2 — hora inválida ou invertida. `horaParaMinutos` é a travessia única e devolve `NaN` para
  // '25:00' e '09:70'; comparar as strings aceitaria os dois como texto, e '9:00' < '10:00' é
  // `false` em string, o que inverteria a comparação sem erro nenhum.
  const ini = horaParaMinutos(params.inicio)
  const fim = horaParaMinutos(params.fim)
  if (Number.isNaN(ini) || Number.isNaN(fim) || fim <= ini) {
    return { ok: false, erro: ERRO_HORA_INVERTIDA, diasEmConflito: [] }
  }

  // 3 — sobreposição DIA A DIA. `validarFaixa` já ignora as faixas de outro `weekday`, então
  // cada chamada compara só com as faixas daquele dia.
  const diasEmConflito: number[] = []
  for (const dia of dias) {
    const r = validarFaixa(
      { weekday: dia, start_time: params.inicio, end_time: params.fim },
      existentes,
    )
    if (faixaRecusada(r) && r.motivo === 'SOBREPOSICAO') diasEmConflito.push(dia)
  }

  // 4 — QUALQUER dia em conflito aborta tudo, e nenhuma faixa volta.
  if (diasEmConflito.length > 0) {
    return { ok: false, erro: 'conflito', diasEmConflito }
  }

  // 5 — uma faixa por dia selecionado, na ordem em que os dias foram pedidos
  return {
    ok: true,
    novasFaixas: dias.map((weekday) => ({
      weekday,
      start_time: params.inicio,
      end_time: params.fim,
    })),
  }
}
