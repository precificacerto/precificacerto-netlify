/**
 * agrupar-horarios-por-periodo.ts — os horários livres em MANHÃ, TARDE e NOITE.
 *
 * Comando do PO de 09/10/2026. É o padrão de mercado da escolha de horário: uma parede de 28
 * chips de 09:00 a 22:30 não se lê; três blocos rotulados, sim.
 *
 * ══ FUNÇÃO PURA, E É O QUE A TORNA TESTÁVEL ══════════════════════════════════════════════
 *
 * Nenhum relógio, nenhuma rede, nenhum estado. Entra lista de `"HH:MM"`, sai a lista de grupos.
 * O instante de hoje NÃO participa: quem decide se um horário já passou é
 * `horariosDisponiveis`, que recebe `agora` injetado e tem portão próprio com 23 casos. Aqui
 * chegam só os que a rota já declarou livres.
 *
 * ══ AS TRÊS FRONTEIRAS, E POR QUE ELAS TÊM CASO SEPARADO ═════════════════════════════════
 *
 * | período | intervalo |
 * |---|---|
 * | **MANHÃ** | `< 12:00` |
 * | **TARDE** | `12:00` a `17:59` |
 * | **NOITE** | `>= 18:00` |
 *
 * Os quatro limites — 11:59, 12:00, 17:59, 18:00 — têm caso PRÓPRIO no portão, um por
 * asserção. A razão é a de `teste-que-nao-exercita.md`: um caso com 10:00 e 15:00 e 20:00 fica
 * verde com a fronteira em 11:00, em 12:00 ou em 13:00 — ele não DISTINGUE. Só o par
 * `11:59`/`12:00` distingue, e é ele que a mutação M25 derruba.
 *
 * ══ PERÍODO VAZIO NÃO APARECE — NEM O TÍTULO ════════════════════════════════════════════
 *
 * Um grupo `{ periodo: 'NOITE', horarios: [] }` obrigaria a tela a conferir o tamanho antes de
 * renderizar o título, e quem escrevesse a próxima tela não saberia disso. Devolver só o que
 * tem conteúdo põe a regra na estrutura em vez de no chamador — e é o que a mutação M26
 * derruba. É a mesma distinção de `ausente-vs-falso.md`: um título "NOITE" sem chip embaixo
 * afirma que há atendimento à noite, e que ele está todo ocupado.
 */
import { horaParaMinutos } from '@/utils/horarios-disponiveis'

export type PeriodoDoDia = 'MANHÃ' | 'TARDE' | 'NOITE'

export type GrupoDePeriodo = {
  periodo: PeriodoDoDia
  horarios: string[]
}

/** 12:00 em minutos. Abaixo é MANHÃ, daqui para cima não. */
const INICIO_DA_TARDE = 12 * 60
/** 18:00 em minutos. Daqui para cima é NOITE; 17:59 ainda é TARDE. */
const INICIO_DA_NOITE = 18 * 60

/**
 * A ordem é fixa e vem daqui — não de ordenação de string, que daria MANHÃ · NOITE · TARDE em
 * ordem alfabética e passaria despercebido.
 */
const ORDEM: PeriodoDoDia[] = ['MANHÃ', 'TARDE', 'NOITE']

/** O período de um `"HH:MM"`. `null` quando a string não é hora — ela é descartada. */
function periodoDe(hhmm: string): PeriodoDoDia | null {
  const min = horaParaMinutos(hhmm)
  // `horaParaMinutos` é a MESMA função que a rota e o motor usam. Um segundo parser aqui seria
  // `copia-divergente.md`: duas leituras de `"HH:MM"`, uma delas aceitando o que a outra recusa.
  if (Number.isNaN(min)) return null
  if (min < INICIO_DA_TARDE) return 'MANHÃ'
  if (min < INICIO_DA_NOITE) return 'TARDE'
  return 'NOITE'
}

/**
 * Agrupa os horários livres por período, em ordem, **omitindo o período sem nenhum horário**.
 *
 * Dentro de cada grupo a ordem é crescente pelo INSTANTE, não pela string: ordenar texto daria
 * o mesmo resultado para `"HH:MM"` zero-preenchido, mas `horariosDisponiveis` aceita `"9:00"` em
 * `horaParaMinutos`, e aí `"9:00"` viria depois de `"10:00"` no texto. Ordenar por minuto não
 * depende do formato de entrada.
 */
export function agruparHorariosPorPeriodo(horarios: string[]): GrupoDePeriodo[] {
  const porPeriodo = new Map<PeriodoDoDia, string[]>()

  for (const h of horarios ?? []) {
    const p = periodoDe(h)
    if (!p) continue
    const atual = porPeriodo.get(p)
    if (atual) atual.push(h)
    else porPeriodo.set(p, [h])
  }

  const out: GrupoDePeriodo[] = []
  for (const periodo of ORDEM) {
    const lista = porPeriodo.get(periodo)
    // >>> AQUI É ONDE O PERÍODO VAZIO DESAPARECE <<<
    // Sem este `if`, a tela receberia o grupo e teria de conferir o tamanho — e a M26 é
    // exatamente tirar esta linha.
    if (!lista || lista.length === 0) continue
    out.push({
      periodo,
      horarios: [...lista].sort((a, b) => horaParaMinutos(a) - horaParaMinutos(b)),
    })
  }
  return out
}
