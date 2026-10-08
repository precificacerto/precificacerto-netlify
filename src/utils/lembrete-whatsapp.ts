/**
 * lembrete-whatsapp.ts — QUANDO o lembrete do agendamento dispara.
 *
 * ══ EXTRAÍDO DE `src/pages/agenda/index.tsx:696-711` EM 08/10/2026 ══════════════════════
 *
 * A regra estava INLINE no modal de edição da agenda, e o remarcar público da Fase 2B precisa
 * dela. Escrever a segunda fórmula seria `copia-divergente.md` na forma mais direta: duas contas
 * do mesmo critério, uma delas esquecida na primeira mudança — e o sintoma seria um cliente
 * recebendo "amanhã às 14h" para um horário que ele mudou.
 *
 * Instrução do dono do produto, registrada como está: *"Nao escreva segunda formula: se a regra
 * estiver inline la, extraia para funcao e os dois chamam."* Foi o que se fez, e os dois chamam.
 *
 * A regra, como estava escrita no comentário original: *"Calcular horário do lembrete WhatsApp:
 * >24h = disparo 24h antes; <24h = disparo 10 min após salvar"*.
 *
 * ── POR QUE O REMARCAR PÚBLICO PRECISA DISSO, E O CANCELAR NÃO ─────────────────────────
 *
 * `src/pages/api/whatsapp/send-reminder.ts` varre eventos com `reminder_send_at <= now`
 * FILTRANDO `status in ('SCHEDULED','CONFIRMED')`. Então:
 *
 *   · CANCELAR põe `CANCELLED` → o filtro já exclui o evento, e não há o que recalcular;
 *   · REMARCAR muda `start_time` e o status continua `CONFIRMED` → sem recalcular, o lembrete
 *     antigo dispara na hora velha.
 *
 * ── `agora` É INJETADO ─────────────────────────────────────────────────────────────────
 *
 * A regra dos 10 minutos é relativa ao INSTANTE DO SALVAMENTO. Com `new Date()` dentro, o caso
 * de teste mediria o relógio da execução e o resultado mudaria a cada run.
 */

/** 24 horas em milissegundos — o limiar entre "avisa um dia antes" e "avisa já". */
const VINTE_QUATRO_HORAS_MS = 24 * 60 * 60 * 1000
const DEZ_MINUTOS_MS = 10 * 60 * 1000

/**
 * Qual dos dois ramos a regra escolhe. `'NENHUM'` quando não há lembrete.
 *
 * >>> ELE EXISTE PORQUE HAVIA UMA *SEGUNDA* CÓPIA DO LIMIAR, E ELA FOI ACHADA PELO PORTÃO <<<
 *
 * A medição desta rodada encontrou a fórmula em `agenda/index.tsx:696-711` e a extraiu. O caso
 * de teste que afirma "a fórmula não existe em mais nenhum lugar" ficou VERMELHO e apontou uma
 * terceira ocorrência, na linha 847 do MESMO arquivo: ela recomputava `hoursUntilEvent < 24`
 * para escolher o TEXTO do toast — "em ~10 minutos" versus "24h antes".
 *
 * Não era cópia da fórmula inteira, era cópia do LIMIAR. E o limiar é a regra: mudá-lo de 24
 * para 12 num lugar e não no outro faria a tela prometer um horário de lembrete diferente do
 * que o banco vai usar. Com este discriminador, o `24` existe uma vez só.
 *
 * `instrumento-que-nao-enxerga.md`: eu tinha concluído, pela leitura, que havia uma cópia. O
 * número só valeu depois de o padrão rodar contra o repositório.
 */
export function ramoDoLembrete(params: {
  inicio: Date
  agora: Date
  temCliente: boolean
}): 'VINTE_QUATRO_HORAS' | 'DEZ_MINUTOS' | 'NENHUM' {
  if (!params?.temCliente) return 'NENHUM'
  if (!params?.inicio || !params?.agora) return 'NENHUM'
  const ms = params.inicio.getTime() - params.agora.getTime()
  if (Number.isNaN(ms) || ms <= 0) return 'NENHUM'
  return ms < VINTE_QUATRO_HORAS_MS ? 'DEZ_MINUTOS' : 'VINTE_QUATRO_HORAS'
}

export function calcularReminderSendAt(params: {
  /** O início do evento. */
  inicio: Date
  agora: Date
  /** Sem cliente vinculado não há para quem mandar. */
  temCliente: boolean
}): string | null {
  if (!params?.temCliente) return null
  if (!params?.inicio || !params?.agora) return null

  // >>> O LIMIAR MORA EM `ramoDoLembrete`, E SÓ LÁ <<<
  // Repetir a comparação aqui seria a terceira cópia do `24` — ver a nota daquela função.
  const ramo = ramoDoLembrete(params)

  // Evento no passado (ou exatamente agora) não tem lembrete: avisar de algo que já aconteceu é
  // pior que não avisar. O `> 0` estrito é o que a regra original tinha.
  if (ramo === 'NENHUM') return null

  // Menos de 24h: dispara 10 minutos depois de salvar. Não dispara NA HORA porque o cliente
  // acabou de ver a tela — a mensagem imediata chega junto com a confirmação e vira ruído.
  if (ramo === 'DEZ_MINUTOS') {
    return new Date(params.agora.getTime() + DEZ_MINUTOS_MS).toISOString()
  }

  // 24h ou mais: exatamente 24h antes do evento.
  return new Date(params.inicio.getTime() - VINTE_QUATRO_HORAS_MS).toISOString()
}
