/**
 * validar-ausencia.ts — a ausência de DIA INTEIRO, e a sobreposição que inclui as bordas.
 *
 * Comando do PO de 08/10/2026, quarta rodada do dia.
 *
 * ══ A DIFERENÇA CONTRA A FAIXA DE HORÁRIO É DELIBERADA, E É O PONTO DESTE ARQUIVO ═══════
 *
 * Em `montar-grade.ts`, ENCOSTAR CONVIVE: 09:00–12:00 e 12:00–18:00 entram as duas, porque o
 * instante 12:00 é um ponto sem duração e pertence ao fim de uma e ao início da outra.
 *
 * Aqui é o CONTRÁRIO, e a razão é que a unidade é outra: a ausência é de DIA INTEIRO. Uma que
 * vai de 09/10 a 14/10 e outra de 14/10 a 20/10 COLIDEM, porque o dia 14 é indivisível — não
 * existe "metade do 14 de férias". O profissional está ausente o dia 14 inteiro, duas vezes.
 *
 * >>> ESTA DIFERENÇA ESTÁ ESCRITA AQUI DE PROPÓSITO <<<
 *
 * Instrução do dono do produto, registrada como está: *"Isso e o CONTRARIO da regra das faixas
 * de horario, onde encostar convive. Deixe essa diferenca escrita em comentario, ou alguem
 * 'corrige' uma pela outra."*
 *
 * As duas são corretas, e nenhuma é a régua da outra. Quem comparar os dois arquivos vai achar
 * um `<` num e um `<=` noutro e vai querer unificar — é `razao-longe-da-restricao.md`: a
 * restrição está declarada em `sobrepoeEmDias` e a razão mora nesta nota, no mesmo arquivo.
 *
 * ── O QUE A FUNÇÃO NÃO SABE, E ISSO TEM CASO PRÓPRIO ────────────────────────────────────
 *
 * Ela NÃO conhece `employee_id`. `existentes` chega JÁ filtrada pelo profissional, e há caso
 * provando que ela não filtra: passar ausências de outro profissional misturadas e ver que ela
 * as considera é o que impede alguém de "melhorar" a assinatura acrescentando o filtro aqui e
 * deixando a tela de fazê-lo.
 */

/** O período como o banco o guarda: ISO em `timestamptz`, sempre dia inteiro. */
export type PeriodoDeAusencia = {
  id: string
  starts_at: string
  ends_at: string
}

export type ValidacaoDaAusencia =
  | { ok: true; inicio: string; fim: string }
  | { ok: false; erro: string }

export type AusenciaRecusada = Extract<ValidacaoDaAusencia, { ok: false }>

/**
 * O resultado é uma recusa?
 *
 * >>> ESTA GUARDA EXISTE POR UMA RAZÃO MEDIDA, NÃO POR GOSTO <<<
 *
 * O `tsconfig.json` deste repositório tem `strictNullChecks: false`, e com ele DESLIGADO o
 * TypeScript não estreita união discriminada por literal booleano: `if (!r.ok) r.erro` falha
 * com `TS2339`. Medido ao ligar o painel em 06/10/2026, e vale igual aqui.
 */
export function ausenciaRecusada(r: ValidacaoDaAusencia): r is AusenciaRecusada {
  return r?.ok === false
}

export const ERRO_SEM_INICIO = 'Informe a data de início.'
export const ERRO_FIM_ANTES = 'A data final não pode ser anterior à inicial.'
export const ERRO_PERIODO_OCUPADO = 'Já existe uma ausência nesse período.'

/** O instante do começo do dia da data, em milissegundos. `NaN` para data inválida. */
function inicioDoDia(iso: string): number {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return NaN
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Dois períodos de DIA INTEIRO se sobrepõem?
 *
 * >>> `<=` NOS DOIS LADOS, E É AQUI QUE A DIFERENÇA CONTRA AS FAIXAS VIVE <<<
 *
 * A comparação é por DIA, não por instante: as duas pontas são normalizadas para o começo do
 * próprio dia antes de comparar, então o `23:59:59` do `endOf('day')` que a tela grava não
 * participa da conta. Com isso, 09/10–14/10 e 14/10–20/10 têm o dia 14 em comum e colidem.
 *
 * Trocar qualquer um dos dois `<=` por `<` faria o dia 14 ficar livre nas duas — é a mutação
 * M12, e o caso "tocam no dia 14" existe para pegá-la.
 */
function sobrepoeEmDias(aIni: number, aFim: number, bIni: number, bFim: number): boolean {
  return aIni <= bFim && bIni <= aFim
}

export function validarAusencia(params: {
  inicio: string | null
  fim: string | null
  existentes: PeriodoDeAusencia[]
}): ValidacaoDaAusencia {
  const inicio = params?.inicio ?? null
  const existentes = params?.existentes ?? []

  // ── 1 — início vazio ───────────────────────────────────────────────────────────────────
  if (!inicio) return { ok: false, erro: ERRO_SEM_INICIO }
  const ini = inicioDoDia(inicio)
  if (Number.isNaN(ini)) return { ok: false, erro: ERRO_SEM_INICIO }

  // ── 2 — fim vazio NÃO é erro: assume o mesmo dia do início ────────────────────────────
  //
  // É o caso comum — um feriado, um dia de folga. Exigir o fim obrigaria a repetir a data, e
  // repetir dado é onde o usuário erra. A mutação M13 transforma isto em erro, e o caso do fim
  // vazio existe para pegá-la.
  //
  // O `fim` devolvido é o `endOf('day')` do início, porque é ele que o banco precisa: sem o
  // fim do dia, uma ausência de um dia só terminaria à meia-noite do próprio dia e não
  // cobriria nada. É a mesma razão que o `DatePicker` da tela já tinha escrita.
  const fimPedido = params?.fim ?? null
  const fim = fimPedido || inicio
  const f = inicioDoDia(fim)
  if (Number.isNaN(f)) return { ok: false, erro: ERRO_FIM_ANTES }

  // ── 3 — fim antes do início ───────────────────────────────────────────────────────────
  // Por DIA: fim no mesmo dia do início é válido (a ausência de um dia só), e é por isso que a
  // comparação é `<` e não `<=`. Comparar instantes aqui recusaria a ausência de um dia quando
  // o `endOf` ainda não foi aplicado.
  if (f < ini) return { ok: false, erro: ERRO_FIM_ANTES }

  // ── 4 — sobreposição com ausência já registrada ───────────────────────────────────────
  // `existentes` já vem filtrada pelo profissional — ver a nota do cabeçalho.
  for (const e of existentes) {
    if (!e) continue
    const eIni = inicioDoDia(e.starts_at)
    const eFim = inicioDoDia(e.ends_at)
    if (Number.isNaN(eIni) || Number.isNaN(eFim)) continue
    if (sobrepoeEmDias(ini, f, eIni, eFim)) {
      return { ok: false, erro: ERRO_PERIODO_OCUPADO }
    }
  }

  // O que sobe para o banco: começo do dia do início, fim do dia do fim.
  const dIni = new Date(ini)
  const dFim = new Date(f)
  return {
    ok: true,
    inicio: new Date(dIni.getFullYear(), dIni.getMonth(), dIni.getDate(), 0, 0, 0, 0).toISOString(),
    fim: new Date(dFim.getFullYear(), dFim.getMonth(), dFim.getDate(), 23, 59, 59, 999).toISOString(),
  }
}
