/**
 * montar-grade.ts — o compositor único da grade: N profissionais × N dias × 1 ou 2 faixas.
 *
 * Comando do PO de 08/10/2026, segunda rodada do dia, DEPOIS de usar a tela.
 *
 * ── O PROBLEMA QUE ORIGINOU, E ELE DECIDE O DESENHO INTEIRO ──────────────────────────────
 *
 * O dono do produto quer intervalo de almoço: segunda com 09:00–12:00 **e** 14:00–18:00. Com
 * "substituir" como única ação — o que a Mudança 2 da rodada anterior deixou —, gravar a tarde
 * apaga a manhã, e não existe caminho para montar dois turnos.
 *
 * Daí as DUAS coisas que este módulo tem e o anterior não tinha:
 *
 *   1. `faixas` é uma LISTA (1 ou 2), então os dois turnos entram no mesmo gesto;
 *   2. `modo` é `'substituir' | 'adicionar'`, então acrescentar deixa de destruir.
 *
 * ── AS DUAS AÇÕES NÃO SÃO VARIAÇÕES DE GRAU, SÃO OUTRA COISA ────────────────────────────
 *
 * | | `substituir` | `adicionar` |
 * |---|---|---|
 * | para que serve | MONTAGEM — "todo mundo trabalha nesse horário" | AJUSTE — "acrescenta a tarde sem perder a manhã" |
 * | `idsParaRemover` | todas as faixas dos pares (profissional, dia) marcados | **SEMPRE vazio** |
 * | colisão | não existe: o dia é limpo antes | a combinação é **PULADA**, as outras entram |
 * | confirmação na tela | sim, quando há faixa a apagar | **nunca** — não destrói nada |
 *
 * `idsParaRemover` vazio em `adicionar` é invariante, não consequência: ele é afirmado
 * diretamente pelo portão, e a mutação M7 existe para provar que a afirmação alcança.
 *
 * ── O QUE NUNCA É TOCADO ────────────────────────────────────────────────────────────────
 *
 * Profissional não marcado e dia não marcado. As duas proteções saem do MESMO filtro — o
 * produto `profissionais × dias` — e por isso o portão as afirma separadamente: um filtro que
 * esquecesse o profissional passaria no caso do dia, e vice-versa.
 *
 * ── POR QUE DEVOLVE OS IDS EM VEZ DE APAGAR ─────────────────────────────────────────────
 *
 * Ele é puro: não fala com o banco. Devolver `idsParaRemover` deixa a ORDEM da gravação com
 * quem grava — insert ANTES de delete. Se o delete falhar, o dia fica DUPLICADO, visível na
 * lista e corrigível pela lixeira; na ordem inversa uma falha deixaria o dia VAZIO e ninguém
 * perceberia, porque vazio é indistinguível de "nunca configurado". Mesma escolha de
 * `aplicar-grade.ts` e de `onSalvarFaixas`.
 */

import { horaParaMinutos } from './agendamento-config'

export type FaixaExistente = {
  id: string
  employee_id: string
  weekday: number
  start_time: string
  end_time: string
}

/** O par de horas como a tela o informa. Uma ou duas, nunca mais — é o desenho do cabeçalho. */
export type FaixaInformada = { inicio: string; fim: string }

export type ModoDaMontagem = 'substituir' | 'adicionar'

export type FaixaNova = {
  employee_id: string
  weekday: number
  start_time: string
  end_time: string
}

/** Uma combinação que `adicionar` deixou de fora por colidir com faixa já existente. */
export type CombinacaoPulada = {
  employee_id: string
  weekday: number
  inicio: string
  fim: string
}

export type ResultadoDaMontagem =
  | {
      ok: true
      novas: FaixaNova[]
      /** Em `adicionar` é SEMPRE vazio. Ver a tabela no cabeçalho. */
      idsParaRemover: string[]
      /** Em `substituir` é SEMPRE vazio: o dia é limpo, então não há com o que colidir. */
      puladas: CombinacaoPulada[]
    }
  | { ok: false; erro: string }

export type MontagemRecusada = Extract<ResultadoDaMontagem, { ok: false }>

/**
 * O resultado é uma recusa?
 *
 * >>> ESTA GUARDA EXISTE POR UMA RAZÃO MEDIDA, NÃO POR GOSTO <<<
 *
 * O `tsconfig.json` deste repositório tem `strictNullChecks: false`, e com ele DESLIGADO o
 * TypeScript não estreita união discriminada por literal booleano: `if (!r.ok) r.erro` falha com
 * `TS2339`. Medido ao ligar o painel em 06/10/2026, e vale igual aqui.
 */
export function montagemRecusada(r: ResultadoDaMontagem): r is MontagemRecusada {
  return r?.ok === false
}

export const ERRO_SEM_PROFISSIONAL = 'Selecione ao menos um profissional.'
export const ERRO_SEM_DIA = 'Selecione ao menos um dia da semana.'
export const ERRO_SEM_FAIXA = 'Informe ao menos uma faixa de horário.'
export const ERRO_HORA_INVERTIDA = 'A hora final deve ser maior que a inicial.'
export const ERRO_FAIXAS_SOBREPOSTAS = 'As duas faixas se sobrepõem. Ajuste os horários.'

/**
 * Dois intervalos se sobrepõem?
 *
 * >>> ENCOSTAR NÃO É SOBREPOR, E ESSA É A REGRA DO BARBEIRO DE DOIS TURNOS <<<
 *
 * `a.inicio < b.fim && b.inicio < a.fim`, com `<` estrito nos dois lados: 09:00–12:00 e
 * 12:00–18:00 devolvem `false`. Trocar qualquer um dos dois por `<=` recusaria exatamente o
 * caso que o intervalo de almoço precisa — que é o caso que originou esta rodada.
 */
function sobrepoe(aIni: number, aFim: number, bIni: number, bFim: number): boolean {
  return aIni < bFim && bIni < aFim
}

export function montarGrade(params: {
  profissionais: string[]
  dias: number[]
  faixas: FaixaInformada[]
  modo: ModoDaMontagem
  existentes: FaixaExistente[]
}): ResultadoDaMontagem {
  const profissionais = params?.profissionais ?? []
  const dias = params?.dias ?? []
  const faixas = params?.faixas ?? []
  const existentes = params?.existentes ?? []

  // ── A ORDEM DAS VALIDAÇÕES É A DO COMANDO, E ELA IMPORTA ───────────────────────────────
  // Sem profissional e sem dia ao mesmo tempo, a queixa é do PROFISSIONAL: é a primeira
  // decisão da tela, de cima para baixo, e pedir para corrigir o dia mandaria o usuário olhar
  // para a linha errada. O portão afirma essa ordem com um caso de entrada duplamente vazia.
  if (profissionais.length === 0) return { ok: false, erro: ERRO_SEM_PROFISSIONAL }
  if (dias.length === 0) return { ok: false, erro: ERRO_SEM_DIA }
  if (faixas.length === 0) return { ok: false, erro: ERRO_SEM_FAIXA }

  // ── 4 — hora inválida ou invertida, em QUALQUER das faixas ─────────────────────────────
  // `horaParaMinutos` é a travessia única e devolve `NaN` para '25:00' e '09:70'. Comparar as
  // strings aceitaria os dois como texto, e `'9:00' < '10:00'` é `false` em string, o que
  // inverteria a comparação sem erro nenhum.
  const emMinutos: { ini: number; fim: number }[] = []
  for (const f of faixas) {
    const ini = horaParaMinutos(f?.inicio)
    const fim = horaParaMinutos(f?.fim)
    if (Number.isNaN(ini) || Number.isNaN(fim) || fim <= ini) {
      return { ok: false, erro: ERRO_HORA_INVERTIDA }
    }
    emMinutos.push({ ini, fim })
  }

  // ── 5 — as faixas INFORMADAS não podem se sobrepor entre si ───────────────────────────
  // Gravar 09:00–13:00 e 12:00–18:00 no mesmo dia produziria duas faixas que o motor de
  // horários somaria duas vezes na hora sobreposta. É a validação que a mutação M9 remove.
  for (let i = 0; i < emMinutos.length; i += 1) {
    for (let j = i + 1; j < emMinutos.length; j += 1) {
      const a = emMinutos[i]
      const b = emMinutos[j]
      if (sobrepoe(a.ini, a.fim, b.ini, b.fim)) {
        return { ok: false, erro: ERRO_FAIXAS_SOBREPOSTAS }
      }
    }
  }

  // ── SUBSTITUIR — limpa o par (profissional, dia) e grava o produto inteiro ─────────────
  if (params.modo === 'substituir') {
    const marcadoProf = new Set(profissionais)
    const marcadoDia = new Set(dias)

    // AS DUAS CONDIÇÕES, e são duas proteções distintas. A mutação M8 ataca a primeira pelo
    // outro lado (limitando o produto ao primeiro profissional); tirar `marcadoDia` apagaria
    // a semana inteira de quem foi marcado.
    const idsParaRemover = existentes
      .filter((f) => f && marcadoProf.has(f.employee_id) && marcadoDia.has(f.weekday))
      .map((f) => f.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const novas: FaixaNova[] = []
    for (const employee_id of profissionais) {
      for (const weekday of dias) {
        for (const f of faixas) {
          novas.push({ employee_id, weekday, start_time: f.inicio, end_time: f.fim })
        }
      }
    }

    return { ok: true, novas, idsParaRemover, puladas: [] }
  }

  // ── ADICIONAR — nada é apagado; a combinação que colide é PULADA ───────────────────────
  // O `puladas` não é um erro: as outras combinações entram, e a tela diz quantas ficaram de
  // fora. Transformar colisão em recusa global devolveria o tudo-ou-nada que esta rodada
  // existe para desfazer.
  const novas: FaixaNova[] = []
  const puladas: CombinacaoPulada[] = []

  for (const employee_id of profissionais) {
    for (const weekday of dias) {
      const doDia = existentes.filter(
        (f) => f && f.employee_id === employee_id && f.weekday === weekday,
      )
      for (let k = 0; k < faixas.length; k += 1) {
        const { ini, fim } = emMinutos[k]
        const colide = doDia.some((f) =>
          sobrepoe(ini, fim, horaParaMinutos(f.start_time), horaParaMinutos(f.end_time)),
        )
        if (colide) {
          puladas.push({ employee_id, weekday, inicio: faixas[k].inicio, fim: faixas[k].fim })
        } else {
          novas.push({
            employee_id,
            weekday,
            start_time: faixas[k].inicio,
            end_time: faixas[k].fim,
          })
        }
      }
    }
  }

  return { ok: true, novas, idsParaRemover: [], puladas }
}
