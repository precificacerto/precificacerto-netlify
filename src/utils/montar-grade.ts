/**
 * montar-grade.ts — o compositor único da grade: N profissionais × N dias × N faixas.
 *
 * Comando do PO de 08/10/2026, segunda e TERCEIRA rodadas do dia, depois de usar a tela.
 *
 * ── O PROBLEMA QUE ORIGINOU, E ELE DECIDE O DESENHO INTEIRO ──────────────────────────────
 *
 * O dono do produto quer intervalo de almoço: segunda com 09:00–12:00 **e** 14:00–18:00. Com
 * "substituir" como única ação — o que a Mudança 2 da rodada anterior deixou —, gravar a tarde
 * apaga a manhã, e não existe caminho para montar dois turnos.
 *
 * Daí as DUAS coisas que este módulo tem e o anterior não tinha:
 *
 *   1. `faixas` é uma LISTA, então os turnos entram todos no mesmo gesto;
 *   2. `modo` é `'substituir' | 'adicionar'`, então acrescentar deixa de destruir.
 *
 * ── N FAIXAS, E O MÓDULO JÁ ESTAVA PRONTO PARA ISSO ─────────────────────────────────────
 *
 * A terceira rodada do PO pediu N faixas em vez de duas. A busca que ela pediu — por `[0]`,
 * `[1]`, `.length === 2`, `slice(0, 2)` — não encontrou presunção de 2 em lugar nenhum do
 * código: o laço da validação 5 já era `i` × `j = i+1`, que é TODOS os pares, e o produto
 * cartesiano já percorria `faixas` inteiro.
 *
 * O que mudou foi a MENSAGEM, que dizia "As duas faixas se sobrepõem" e não dizia QUAIS. Com
 * cinco faixas na tela isso obriga o usuário a conferir dez pares à mão — é a mesma razão que
 * fez a recusa de conflito nomear os dias em 06/10: dizer que há conflito sem dizer onde
 * transfere a busca para quem não tem como fazê-la.
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

/** O par de horas como a tela o informa. Uma ou mais, sem limite no utilitário. */
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
/**
 * A sobreposição entre faixas informadas, NOMEANDO o par.
 *
 * >>> OS NÚMEROS SÃO OS RÓTULOS DA TELA, 1-INDEXADOS <<<
 *
 * `faixas[1]` e `faixas[3]` são "Faixa 2" e "Faixa 4" para quem lê. Publicar o índice do array
 * mandaria o usuário procurar uma linha que a tela não rotula — e com cinco faixas conferir dez
 * pares à mão é trabalho que a mensagem existe para poupar.
 *
 * O menor vem primeiro, sempre: "as faixas 4 e 2" leria como se a ordem importasse.
 */
export function erroFaixasSobrepostas(indiceA: number, indiceB: number): string {
  const a = Math.min(indiceA, indiceB) + 1
  const b = Math.max(indiceA, indiceB) + 1
  return `As faixas ${a} e ${b} se sobrepõem. Ajuste os horários.`
}

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
  //
  // Gravar 09:00–13:00 e 12:00–18:00 no mesmo dia produziria duas faixas que o motor de
  // horários somaria duas vezes na hora sobreposta. É a validação que a mutação M9 remove.
  //
  // >>> TODOS OS PARES, NÃO SÓ OS VIZINHOS <<<
  // `j = i + 1` percorre a combinação completa: com quatro faixas são seis pares, e a 2 contra
  // a 4 é um deles. Comparar só `faixas[i]` com `faixas[i+1]` deixaria passar a 2 contra a 4 —
  // é exatamente a mutação M10, e o caso das quatro faixas existe para pegá-la.
  //
  // A ordem do laço é crescente nos dois índices, então o PRIMEIRO par sobreposto encontrado é
  // o de menor índice — e é dele que a mensagem fala. Com dois pares ruins ela cita um só, de
  // propósito: o usuário conserta, clica, e o seguinte aparece. Listar todos de uma vez num
  // alerta de uma linha fica ilegível na terceira sobreposição.
  for (let i = 0; i < emMinutos.length; i += 1) {
    for (let j = i + 1; j < emMinutos.length; j += 1) {
      const a = emMinutos[i]
      const b = emMinutos[j]
      if (sobrepoe(a.ini, a.fim, b.ini, b.fim)) {
        return { ok: false, erro: erroFaixasSobrepostas(i, j) }
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

    // O produto percorre `faixas` INTEIRO — é a terceira dimensão, e ela não tem tamanho
    // fixo. Limitá-la às duas primeiras é a mutação M11, e o caso de 3 × 2 × 5 = 30 a pega.
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
