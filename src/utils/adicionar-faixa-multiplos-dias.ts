/**
 * adicionar-faixa-multiplos-dias.ts — uma faixa aplicada a VÁRIOS dias, SOBRESCREVENDO o dia.
 *
 * Comando do PO de 06/10/2026 (as sete caixas) e de 08/10/2026 (a sobrescrita).
 *
 * >>> A REGRA MUDOU EM 08/10/2026, E A MUDANÇA É DELIBERADA <<<
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   "se tiver qualquer horário ali, vai ser sobrescrito em cima"
 *
 * Até 06/10 a sobreposição RECUSAVA: qualquer dia em conflito abortava tudo e nenhuma faixa
 * voltava. Agora não existe mais recusa por conflito — para cada dia MARCADO, TODAS as faixas
 * daquele dia saem e entra a nova. Não é substituição por sobreposição: é o DIA INTEIRO.
 *
 * A razão é agilidade na montagem: em tese todos os profissionais trabalham no mesmo horário, e o
 * ajuste individual vem depois, na célula daquele profissional. Com recusa por conflito, remontar
 * a semana exigia apagar faixa por faixa na lixeira antes de poder digitar.
 *
 * >>> DIA NÃO MARCADO NUNCA É TOCADO <<<
 * É a única proteção que sobrou, e por isso ela é a que o portão afirma com mais insistência:
 * `idsParaRemover` sai do filtro por dia marcado, e a mutação M5 existe para provar que o filtro
 * está lá. Sem ele, marcar a segunda apagaria a semana inteira.
 *
 * ── POR QUE O UTILITÁRIO DEVOLVE OS IDS, EM VEZ DE APAGAR ────────────────────────────────
 *
 * Ele é puro: não fala com o banco. Devolver `idsParaRemover` deixa a ORDEM da gravação com quem
 * grava — e a ordem importa, porque é insert ANTES de delete. Se o delete falhar, o dia fica
 * DUPLICADO, visível na lista e corrigível pela lixeira; na ordem inversa uma falha deixaria o
 * dia VAZIO e ninguém perceberia. É a mesma escolha de `aplicar-grade.ts`.
 */

import { horaParaMinutos, listaEmPortugues } from './agendamento-config'

/** As faixas gravadas carregam `id` desde 08/10/2026: é dele que sai `idsParaRemover`. */
export type FaixaHorario = {
  id?: string
  weekday: number
  start_time: string
  end_time: string
}

export type ResultadoFaixa =
  | {
      ok: true
      novasFaixas: FaixaHorario[]
      /** TODAS as faixas dos dias MARCADOS. Vazio quando nenhum deles tinha faixa. */
      idsParaRemover: string[]
      /** Os weekdays marcados que tinham ao menos uma faixa. Alimenta o aviso e a mensagem. */
      diasSubstituidos: number[]
    }
  | { ok: false; erro: string }

export type FaixaRecusadaEmDias = Extract<ResultadoFaixa, { ok: false }>

/**
 * O resultado é uma recusa?
 *
 * >>> ESTA GUARDA EXISTE POR UMA RAZÃO MEDIDA, NÃO POR GOSTO <<<
 *
 * O `tsconfig.json` deste repositório tem `strictNullChecks: false`, e com ele DESLIGADO o
 * TypeScript não estreita união discriminada por literal booleano: `if (!r.ok) r.erro` falha com
 * `TS2339`. Medido ao ligar o painel em 06/10/2026, e vale igual depois da mudança de contrato.
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

  // ── 1 — nenhum dia marcado ──────────────────────────────────────────────────────────────
  if (dias.length === 0) return { ok: false, erro: ERRO_SEM_DIA }

  // ── 2 — hora inválida ou invertida ─────────────────────────────────────────────────────
  // `horaParaMinutos` é a travessia única e devolve `NaN` para '25:00' e '09:70'; comparar as
  // strings aceitaria os dois como texto, e `'9:00' < '10:00'` é `false` em string, o que
  // inverteria a comparação sem erro nenhum.
  const ini = horaParaMinutos(params.inicio)
  const fim = horaParaMinutos(params.fim)
  if (Number.isNaN(ini) || Number.isNaN(fim) || fim <= ini) {
    return { ok: false, erro: ERRO_HORA_INVERTIDA }
  }

  // >>> NÃO HÁ MAIS REGRA DE SOBREPOSIÇÃO AQUI <<<
  // A terceira regra, que recusava quando o dia já tinha faixa, SAIU em 08/10/2026. O que ela
  // barrava agora é o comportamento pedido. `validarFaixa` continua existindo e continua sendo a
  // fonte do critério de sobreposição para quem precisar dele — esta função deixou de precisar.

  const marcados = new Set(dias)

  // ── 3 — TODAS as faixas dos dias MARCADOS saem ─────────────────────────────────────────
  // O filtro `marcados.has(...)` é a proteção do dia não marcado, e é o que a mutação M5 remove.
  const doDiaMarcado = existentes.filter((f) => f && marcados.has(f.weekday))

  const idsParaRemover = doDiaMarcado
    .map((f) => f.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  // ── 4 — quais dias de fato tinham algo ────────────────────────────────────────────────
  // Só estes entram no aviso e na mensagem final. Um dia marcado e vazio não "foi substituído".
  const diasSubstituidos = dias.filter((d) => existentes.some((f) => f && f.weekday === d))

  // ── 5 — uma faixa por dia marcado, na ordem em que os dias foram pedidos ───────────────
  return {
    ok: true,
    novasFaixas: dias.map((weekday) => ({
      weekday,
      start_time: params.inicio,
      end_time: params.fim,
    })),
    idsParaRemover,
    diasSubstituidos,
  }
}

/**
 * O aviso que aparece ANTES do clique, logo abaixo das caixas: "Segunda e Quarta já têm faixas —
 * serão substituídas." `null` quando não há conflito.
 *
 * Nomes dos dias, SEM horário: listar o horário antigo encheria a linha e não muda a decisão —
 * o que o usuário precisa saber é QUAIS dias perdem o que tinham.
 */
export function avisoDeSubstituicao(
  diasSubstituidos: readonly number[],
  nomeDoDia: (weekday: number) => string,
): string | null {
  const nomes = (diasSubstituidos ?? []).map(nomeDoDia)
  if (nomes.length === 0) return null
  return `${listaEmPortugues(nomes)} já ${nomes.length === 1 ? 'tem' : 'têm'} faixas — `
    + `${nomes.length === 1 ? 'será substituída' : 'serão substituídas'}.`
}

/** A mensagem DEPOIS de gravar: "Faixa aplicada em 5 dias. Segunda e Quarta foram substituídas." */
export function mensagemDoResultado(
  quantosDias: number,
  diasSubstituidos: readonly number[],
  nomeDoDia: (weekday: number) => string,
): string {
  const base = `Faixa aplicada em ${quantosDias} ${quantosDias === 1 ? 'dia' : 'dias'}.`
  const nomes = (diasSubstituidos ?? []).map(nomeDoDia)
  if (nomes.length === 0) return base
  return `${base} ${listaEmPortugues(nomes)} ${nomes.length === 1 ? 'foi substituída' : 'foram substituídas'}.`
}
