/**
 * vencidos-do-tenant.ts — a FONTE ÚNICA dos vencidos: o modal e a faixa leem daqui.
 *
 * Comando do PO de 21/09/2026, §3:
 *
 *   > Faixa e modal leem a MESMA função — nada de duas contagens.
 *
 * >>> POR QUE ISSO É REGRA E NÃO ORGANIZAÇÃO <<<
 *
 * Duas contagens do mesmo conjunto é `copia-divergente.md` na forma mais visível que existe:
 * a faixa diz 82 e o modal lista 85, e o usuário não tem como saber qual acreditar. E o modo
 * de falhar é o pior possível — as duas fecham consigo mesmas, e a divergência só aparece
 * para quem conta as linhas.
 */

export interface LancamentoVencido {
  id: string
  tipo: 'EXPENSE' | 'INCOME'
  dueDate: string
  description: string
  contato: string | null
  amount: number
  /** Dias corridos entre o vencimento e a data de referência. Sempre ≥ 1. */
  diasEmAtraso: number
}

export interface EntradaBruta {
  id: string
  type?: string | null
  due_date?: string | null
  paid_date?: string | null
  description?: string | null
  amount?: number | null
  is_active?: boolean | null
  contato?: string | null
}

export interface ResumoDosVencidos {
  aPagar: LancamentoVencido[]
  aReceber: LancamentoVencido[]
  totalAPagar: number
  totalAReceber: number
  /** `true` quando há QUALQUER vencido — é o que decide se o modal abre e a faixa aparece. */
  temVencidos: boolean
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Dias corridos entre duas datas `YYYY-MM-DD`, sem passar por `Date` — fuso não entra. */
export function diasEntre(de: string, ate: string): number {
  const ms = Date.UTC(
    Number(ate.slice(0, 4)), Number(ate.slice(5, 7)) - 1, Number(ate.slice(8, 10)),
  ) - Date.UTC(
    Number(de.slice(0, 4)), Number(de.slice(5, 7)) - 1, Number(de.slice(8, 10)),
  )
  return Math.round(ms / 86400000)
}

/**
 * O que está VENCIDO na data de referência.
 *
 * >>> VENCIDO É `due_date < hoje` E SEM `paid_date` <<<
 *
 * O que vence HOJE não está vencido — ele está no prazo até o fim do dia, e listá-lo como
 * atrasado faria o usuário reagendar uma conta que ainda pode pagar. É a razão de o corte ser
 * `<` e não `<=`, e há caso afirmando o dia de hoje dos dois lados da fronteira.
 *
 * `is_active = false` fica de fora: o lançamento foi cancelado, e cobrar por ele seria
 * ressuscitá-lo.
 */
export function resumirVencidos(
  entradas: EntradaBruta[],
  hoje: string,
): ResumoDosVencidos {
  const vencidos: LancamentoVencido[] = []

  for (const e of entradas ?? []) {
    if (e.is_active === false) continue
    if (e.paid_date) continue
    const venc = e.due_date ? String(e.due_date).slice(0, 10) : null
    if (!venc || venc >= hoje) continue

    vencidos.push({
      id: String(e.id),
      tipo: e.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      dueDate: venc,
      description: String(e.description ?? '').trim() || '—',
      contato: e.contato ?? null,
      amount: num(e.amount),
      diasEmAtraso: diasEntre(venc, hoje),
    })
  }

  // Mais antigo primeiro: é a ordem em que se resolve atraso.
  vencidos.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const aPagar = vencidos.filter((v) => v.tipo === 'EXPENSE')
  const aReceber = vencidos.filter((v) => v.tipo === 'INCOME')

  return {
    aPagar,
    aReceber,
    totalAPagar: aPagar.reduce((a, v) => a + v.amount, 0),
    totalAReceber: aReceber.reduce((a, v) => a + v.amount, 0),
    temVencidos: vencidos.length > 0,
  }
}

/**
 * A CHAVE da dispensa por sessão — §3: *"uma vez por sessão por tenant"*.
 *
 * Ela inclui uma ASSINATURA do conjunto de vencidos, e não só o tenant. Sem a assinatura,
 * dispensar uma vez calaria o modal até o próximo login, inclusive quando um vencido NOVO
 * aparecesse — e o §3 diz o contrário: *"volta a abrir (…) quando surgir um vencido novo.
 * Nunca suprimir para sempre."*
 */
export function chaveDeDispensa(tenantId: string, r: ResumoDosVencidos): string {
  const assinatura = [...r.aPagar, ...r.aReceber].map((v) => v.id).sort().join(',')
  // Um hash curto e estável basta: a chave só precisa MUDAR quando o conjunto muda.
  let h = 0
  for (let i = 0; i < assinatura.length; i++) {
    h = (h * 31 + assinatura.charCodeAt(i)) | 0
  }
  return `vencidos:${tenantId}:${r.aPagar.length + r.aReceber.length}:${h}`
}

/** O texto da faixa do cabeçalho. Vazio quando não há vencidos — faixa não mente por zero. */
export function textoDaFaixa(r: ResumoDosVencidos, brl: (v: number) => string): string {
  const partes: string[] = []
  if (r.aPagar.length > 0) {
    partes.push(`${r.aPagar.length} despesa${r.aPagar.length > 1 ? 's' : ''} vencida${r.aPagar.length > 1 ? 's' : ''} (${brl(r.totalAPagar)})`)
  }
  if (r.aReceber.length > 0) {
    partes.push(`${r.aReceber.length} recebimento${r.aReceber.length > 1 ? 's' : ''} vencido${r.aReceber.length > 1 ? 's' : ''} (${brl(r.totalAReceber)})`)
  }
  return partes.join(' · ')
}
