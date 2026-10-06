/**
 * horarios-disponiveis.ts — quais horários o cliente pode escolher, num dia, com um barbeiro.
 *
 * Comando do PO de 06/10/2026, fase 2. É a função que a rota pública usa para MONTAR a lista e,
 * no POST, para CONFERIR o horário que o cliente mandou. As duas coisas pela mesma função, de
 * propósito: se a conferência tivesse critério próprio, bastaria uma divergência para a rota
 * aceitar um horário que a tela nunca ofereceu (`copia-divergente.md`).
 *
 * >>> `agora` É INJETADO. NÃO EXISTE `new Date()` AQUI DENTRO. <<<
 *
 * Sem isso o portão não consegue afirmar NADA sobre antecedência: o caso de
 * "antecedência 60 com agora = 09:10" só é escrevível se quem chama decide o que é agora. Uma
 * função que lê o relógio é uma função cujo resultado muda sozinho entre duas execuções do
 * mesmo teste — e um teste que não pode fixar a entrada não pode afirmar a saída
 * (`teste-que-nao-exercita.md`).
 */

/**
 * >>> O FUSO VIVE AQUI, E SÓ AQUI <<<
 *
 * Medido em 06/10/2026: NÃO EXISTE coluna de timezone em nenhuma tabela do schema — procurei por
 * `timezone`, `time_zone` e `tz` em `information_schema.columns` e voltou vazio. Então o fuso é
 * fixo, e fixo num lugar só.
 *
 * Por que importa ter um lugar só: `employee_working_hours.start_time` é `time` — relógio de
 * parede, sem fuso. `employee_time_off` e `calendar_events` são `timestamptz` — instantes. Casar
 * os dois exige converter, e conversão de fuso espalhada é a receita para a grade de um barbeiro
 * sair três horas deslocada em metade das telas e certa na outra metade.
 *
 * Quando houver fuso por tenant, esta constante vira parâmetro — e o único ponto a mudar é este.
 */
export const FUSO_DO_AGENDAMENTO = 'America/Sao_Paulo'

export interface FaixaDoDia {
  weekday: number
  start_time: string
  end_time: string
}

export interface Intervalo {
  starts_at: string
  ends_at: string
}

export interface ParamsDosHorarios {
  faixas: FaixaDoDia[]
  ausencias: Intervalo[]
  ocupados: Intervalo[]
  /** `YYYY-MM-DD`, no fuso do agendamento. */
  dia: string
  duracaoMin: number
  passoMin: number
  antecedenciaMin: number
  horizonteDias: number
  /** Injetado. Nunca lido do relógio aqui dentro. */
  agora: Date
}

/** Minutos que o fuso está à frente do UTC naquele instante. Brasil não tem mais horário de verão desde 2019, mas as duas passadas abaixo tratam a borda de qualquer modo. */
function deslocamentoDoFuso(instante: Date): number {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: FUSO_DO_AGENDAMENTO, dateStyle: 'short', timeStyle: 'medium',
  }).format(instante)
  const comoSeFosseUtc = Date.parse(s.replace(' ', 'T') + 'Z')
  return (comoSeFosseUtc - instante.getTime()) / 60000
}

/** `('2026-11-05', 540)` → o instante em que é 09:00 em São Paulo naquele dia. */
export function instanteDoRelogioLocal(dia: string, minutosDoDia: number): Date {
  const h = Math.floor(minutosDoDia / 60)
  const m = minutosDoDia % 60
  const palpite = Date.parse(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  // Duas passadas: a primeira usa o deslocamento do palpite em UTC, a segunda o do instante já
  // corrigido. Numa transição de fuso as duas diferem, e a segunda é a que vale.
  let off = deslocamentoDoFuso(new Date(palpite))
  off = deslocamentoDoFuso(new Date(palpite - off * 60000))
  return new Date(palpite - off * 60000)
}

/** `YYYY-MM-DD` do dia local de um instante. */
export function diaLocalDe(instante: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO_DO_AGENDAMENTO, dateStyle: 'short' })
    .format(instante)
}

/** `HH:mm[:ss]` → minutos desde a meia-noite. `NaN` para entrada que não é hora. */
export function horaParaMinutos(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hhmm ?? '').trim())
  if (!m) return NaN
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return NaN
  return h * 60 + min
}

function minutosParaHora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** `0 = domingo … 6 = sábado`, no fuso do agendamento — a mesma convenção de `employee_working_hours.weekday`. */
export function weekdayDoDia(dia: string): number {
  const meioDia = instanteDoRelogioLocal(dia, 12 * 60)
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: FUSO_DO_AGENDAMENTO, weekday: 'short' })
    .format(meioDia)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nome)
}

/** Dois intervalos se sobrepõem? Encostar NÃO é sobreposição. */
function sobrepoe(aIni: number, aFim: number, bIni: number, bFim: number): boolean {
  return aIni < bFim && bIni < aFim
}

export function horariosDisponiveis(params: ParamsDosHorarios): string[] {
  const { faixas, ausencias, ocupados, dia, duracaoMin, passoMin, antecedenciaMin, horizonteDias, agora } = params

  if (!dia || !Number.isFinite(duracaoMin) || duracaoMin <= 0) return []
  if (!Number.isFinite(passoMin) || passoMin <= 0) return []

  // ── 1. além do horizonte ───────────────────────────────────────────────────────────────
  // A comparação é por DIA LOCAL, não por instante: `agora + horizonte` no meio da tarde não
  // pode cortar a manhã do último dia. O horizonte é uma quantidade de dias de calendário.
  const limite = diaLocalDe(new Date(agora.getTime() + horizonteDias * 86400000))
  if (dia > limite) return []
  if (dia < diaLocalDe(agora)) return []

  // ── 2. ausência cobrindo QUALQUER parte do dia ────────────────────────────────────────
  // Férias é DIA INTEIRO (decisão do PO na fase 1): uma ausência que toque o dia zera o dia,
  // não só as horas cobertas. Oferecer a tarde de um dia de férias porque o registro começou ao
  // meio-dia seria oferecer o que o barbeiro não trabalha.
  const inicioDoDia = instanteDoRelogioLocal(dia, 0).getTime()
  const fimDoDia = instanteDoRelogioLocal(dia, 0).getTime() + 86400000
  for (const a of ausencias ?? []) {
    const ai = Date.parse(a?.starts_at); const af = Date.parse(a?.ends_at)
    if (Number.isNaN(ai) || Number.isNaN(af)) continue
    if (sobrepoe(ai, af, inicioDoDia, fimDoDia)) return []
  }

  const wd = weekdayDoDia(dia)
  const ocupadosMs = (ocupados ?? [])
    .map((o) => [Date.parse(o?.starts_at), Date.parse(o?.ends_at)] as [number, number])
    .filter(([i, f]) => !Number.isNaN(i) && !Number.isNaN(f))

  const minimo = agora.getTime() + antecedenciaMin * 60000
  const encontrados = new Set<string>()

  for (const f of faixas ?? []) {
    if (f?.weekday !== wd) continue
    const fi = horaParaMinutos(f.start_time)
    const ff = horaParaMinutos(f.end_time)
    if (Number.isNaN(fi) || Number.isNaN(ff) || ff <= fi) continue

    // ── 3. candidatos de passo em passo, a partir do início da faixa ─────────────────────
    for (let c = fi; c <= ff; c += passoMin) {
      // ── 4. o FIM do atendimento não pode passar do fim da faixa ───────────────────────
      // É a regra que faz um serviço de 60min numa faixa 09:00–12:00 parar às 11:00. Sem ela a
      // tela ofereceria 11:30 e o cliente sairia 30 minutos depois do barbeiro ter fechado.
      if (c + duracaoMin > ff) break

      const ini = instanteDoRelogioLocal(dia, c).getTime()
      const fim = ini + duracaoMin * 60000

      // ── 5. antecedência mínima ───────────────────────────────────────────────────────
      if (ini < minimo) continue

      // ── 6. sobreposição com o que já está agendado ───────────────────────────────────
      // `<` e não `<=`: encostar não é conflito. Um atendimento que termina 10:30 não impede o
      // que começa 10:30 — recusá-lo perderia metade dos horários de uma agenda cheia.
      let livre = true
      for (const [oi, of_] of ocupadosMs) {
        if (sobrepoe(ini, fim, oi, of_)) { livre = false; break }
      }
      if (!livre) continue

      encontrados.add(minutosParaHora(c))
    }
  }

  // ── 7. ordenado e sem duplicata ──────────────────────────────────────────────────────
  // Duas faixas podem se tocar (o barbeiro de dois turnos), e o passo de uma pode cair no início
  // da outra. Sem o Set, o mesmo horário apareceria duas vezes na tela.
  return Array.from(encontrados).sort()
}
