/**
 * POST /api/public/agenda/[token]/cancelar — o cliente cancela o próprio agendamento.
 *
 * Comando do PO de 08/10/2026, Fase 2B.
 *
 * ══ O QUE ESTA ROTA ALCANÇA, E O QUE ELA NÃO PODE ALCANÇAR ══════════════════════════════
 *
 * Regra 6 do comando: *"cancelar e remarcar SO alcancam agendamento daquele telefone, daquele
 * tenant, e no FUTURO. Agendamento de outro telefone responde o mesmo que id inexistente."*
 *
 * As três condições são do MESMO `select`, e por isso há três casos no portão afirmando cada
 * uma. A resposta é idêntica nos quatro casos de recusa — id inexistente, id de outro telefone,
 * id de outro tenant, agendamento no passado — porque distinguir qualquer um deles vira oráculo:
 * mandar ids até um responder diferente diria quais existem.
 *
 * ══ CANCELAR É `status = 'CANCELLED'`. NADA DE DELETE. ═════════════════════════════════
 *
 * E nenhum efeito colateral. Medido em 08/10/2026 na agenda interna: estoque, caixa, comissão,
 * `sales`, `sale_items`, `pending_receivables` e `cash_entries` são todos do caminho
 * `COMPLETED` (o modal de pagamento), nunca do `CANCELLED`. Esta rota não toca em nenhum deles.
 *
 * ── E O LEMBRETE? NÃO PRECISA MEXER, E ISSO FOI CONFERIDO ──────────────────────────────
 *
 * `src/pages/api/whatsapp/send-reminder.ts:119` filtra `status in ('SCHEDULED','CONFIRMED')`.
 * Pôr `CANCELLED` já tira o evento do varredor — não há `reminder_send_at` a limpar. O caso do
 * portão afirma isso lendo o filtro da rota do lembrete, que NÃO foi alterada.
 *
 * ══ OS AVISOS SÃO ACESSÓRIOS — O CANCELAMENTO JÁ ESTÁ GRAVADO ══════════════════════════
 *
 * >>> E O BARBEIRO SEM TELEFONE É O CASO NORMAL, NÃO A EXCEÇÃO <<<
 *
 * Medido em 08/10/2026: 0 de 5 funcionários do Salão Eliane têm `phone`, e 1 de 16 no
 * repositório inteiro. O caminho "não avisou o profissional" é o que de fato executa hoje — e
 * ele NÃO derruba o cancelamento. Nenhuma trava nova nasceu disso: cancelar não exige telefone
 * do barbeiro, e Funcionários não passou a exigi-lo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import {
  CORPO_INDISPONIVEL, contextoDoToken, enviarMensagemDoAgendamento, nomeDoBarbeiro,
  telefoneCanonico, telefoneDoBarbeiro,
} from '@/lib/agendamento-publico'
import { CORPO_CODIGO_RECUSADO, conferirCodigo } from './codigo-validar'
import {
  MENSAGEM_CANCELAMENTO_PADRAO,
} from '@/utils/mensagens-agendamento-padrao'

/** O evento que a rota tem direito de mexer, já conferido nas três condições. */
export type EventoAlcancavel = {
  id: string
  title: string
  start_time: string
  employee_id: string | null
  service_id: string | null
  customer_id: string
  /**
   * O NOME do cliente, para a mensagem que vai ao WhatsApp dele. Vem da MESMA consulta que
   * provou a identidade pelo telefone — ver `eventoAlcancavel`.
   *
   * >>> OBRIGATÓRIO NO TIPO DE PROPÓSITO <<<
   * Opcional com default vazio é `construtor-empobrecido.md`: um segundo produtor do tipo
   * esqueceria o campo e a mensagem voltaria a sair com a vírgula solta, sem nada falhar. Como
   * obrigatório, o `tsc` enumera quem não o preenche.
   */
  cliente_nome: string
}

/**
 * O evento, SE ele for daquele telefone, daquele tenant, e no futuro. `null` em qualquer outro
 * caso — e o chamador responde a MESMA coisa para todos eles.
 *
 * Exportada porque `remarcar` precisa exatamente disto. Duas cópias divergiriam, e a divergência
 * apareceria como uma rota alcançando o que a outra recusa.
 */
export async function eventoAlcancavel(
  tenant_id: string, telefone: string, agendamento_id: string, agora: Date,
): Promise<EventoAlcancavel | null> {
  if (!agendamento_id) return null

  // >>> O `name` ENTRA NESTA CONSULTA, QUE JÁ EXISTIA — NÃO NUMA SEGUNDA <<<
  // Ela já é a consulta que casa o telefone provado com o cliente daquele tenant, e o nome vem
  // de carona. Um segundo `select` para buscar o nome seria uma ida a mais ao banco e um segundo
  // ponto a filtrar por tenant — dois jeitos de errar, por nada.
  const { data: cli, error: eCli } = await supabaseAdmin
    .from('customers')
    .select('id, name')
    .eq('tenant_id', tenant_id)
    .eq('whatsapp_phone', telefone)
    .limit(1)
    .maybeSingle()
  if (eCli) throw eCli
  const customer_id = (cli as any)?.id ?? null
  if (!customer_id) return null
  // Nome vazio ou nulo no banco fica vazio aqui, e o `{cliente}` da mensagem DESAPARECE pela
  // limpeza de `aplicarVariaveis`. Não se inventa "Cliente" nem "Olá!" — `ausente-vs-falso.md`.
  const cliente_nome = String((cli as any)?.name ?? '').trim()

  const { data: ev, error: eEv } = await supabaseAdmin
    .from('calendar_events')
    .select('id, title, start_time, employee_id, service_id, customer_id')
    .eq('id', agendamento_id)
    // >>> AS TRÊS CONDIÇÕES, E CADA UMA TEM CASO PRÓPRIO NO PORTÃO <<<
    .eq('tenant_id', tenant_id)       // o tenant, que sai do TOKEN
    .eq('customer_id', customer_id)   // o telefone, que acabou de provar o código
    .eq('is_active', true)
    .in('status', ['SCHEDULED', 'CONFIRMED'])
    .gte('start_time', agora.toISOString())   // o futuro
    .maybeSingle()
  if (eEv) throw eEv
  if (!ev) return null
  return { ...(ev as any), cliente_nome }
}

/** `2026-10-09T14:30:00` → `{ data: '09/10/2026', hora: '14:30' }`. */
export function dataEHoraBR(iso: string): { data: string; hora: string } {
  const d = new Date(iso)
  return {
    data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json(CORPO_INDISPONIVEL)

  try {
    const ctx = await contextoDoToken(req.query.token)
    if (!ctx) return res.status(404).json(CORPO_INDISPONIVEL)

    const body = (req.body ?? {}) as Record<string, unknown>
    const telefone = telefoneCanonico(body.telefone)
    const codigo = String(body.codigo ?? '')
    const agendamento_id = String(body.agendamento_id ?? '')
    const agora = new Date()

    if (telefone.length < 10 || telefone.length > 11) {
      return res.status(401).json(CORPO_CODIGO_RECUSADO)
    }

    const r = await conferirCodigo(ctx.tenant_id, telefone, codigo, agora)
    if (!r.ok) {
      console.error('[public/agenda] cancelar: código recusado:', r.motivo ?? 'desconhecido')
      return res.status(401).json(CORPO_CODIGO_RECUSADO)
    }

    const ev = await eventoAlcancavel(ctx.tenant_id, telefone, agendamento_id, agora)
    // >>> A MESMA RESPOSTA PARA OS QUATRO CASOS DE RECUSA <<<
    // Inexistente, de outro telefone, de outro tenant, no passado. Distinguir qualquer um
    // transformaria esta rota num enumerador de ids.
    if (!ev) return res.status(404).json(CORPO_INDISPONIVEL)

    // ── A GRAVAÇÃO. Só o status, e nada mais. ───────────────────────────────────────────
    const { error: eUpd } = await supabaseAdmin
      .from('calendar_events')
      .update({ status: 'CANCELLED' })
      .eq('id', ev.id)
      .eq('tenant_id', ctx.tenant_id)
    if (eUpd) throw eUpd

    // ── OS AVISOS, DAQUI PARA BAIXO, SÃO ACESSÓRIOS ─────────────────────────────────────
    // O cancelamento JÁ ESTÁ GRAVADO. Nada abaixo pode derrubar a resposta, e o `avisos` existe
    // para que a falha não seja muda: ela vira log em vez de desaparecer.
    const avisos: string[] = []
    const { data: dataBR, hora } = dataEHoraBR(ev.start_time)
    const profissional = ev.employee_id ? await nomeDoBarbeiro(ctx.tenant_id, ev.employee_id) : ''
    // >>> O NOME DO CLIENTE NA MENSAGEM, E A DISTINÇÃO QUE A FASE 2B IMPÔS <<<
    //
    // Exigência do dono do produto em 09/10/2026, registrada como está: *"O nome entra na
    // mensagem enviada ao proprio cliente. Ele NAO entra em nenhuma resposta HTTP antes do
    // codigo validado - sao coisas diferentes."*
    //
    // Até hoje isto era `cliente: ''`, e o texto padrão saía `Olá , seu agendamento foi
    // cancelado.` — com a vírgula solta. A Fase 2B escreveu o vazio por cautela e não distinguiu
    // as duas coisas: proibido é devolver dado de cliente para a TELA; mandar o nome dele no
    // WhatsApp DELE não revela nada a ninguém, porque o destinatário é o próprio dono do nome.
    //
    // A resposta HTTP continua `{ ok: true }` e nada mais, e há caso de portão afirmando as
    // chaves exatas — é a mutação M24.
    const vars = {
      cliente: ev.cliente_nome, servico: ev.title ?? '', profissional,
      data: dataBR, hora, empresa: ctx.empresa,
    }

    try {
      const aoCliente = await enviarMensagemDoAgendamento({
        tenantId: ctx.tenant_id, telefone, texto: ctx.msg_cancelamento,
        padrao: MENSAGEM_CANCELAMENTO_PADRAO, vars,
      })
      if (!aoCliente.enviado) avisos.push(`cliente não avisado: ${aoCliente.motivo}`)
    } catch (err: any) {
      avisos.push(`cliente não avisado: ${err?.message || 'erro'}`)
    }

    try {
      const foneDoBarbeiro = ev.employee_id
        ? await telefoneDoBarbeiro(ctx.tenant_id, ev.employee_id)
        : ''
      if (!foneDoBarbeiro) {
        // O CAMINHO NORMAL em produção — ver a nota do cabeçalho. Vira aviso, não erro.
        avisos.push('profissional não avisado: sem telefone cadastrado')
      } else {
        const aoBarbeiro = await enviarMensagemDoAgendamento({
          tenantId: ctx.tenant_id, telefone: foneDoBarbeiro, texto: null,
          padrao: `Agendamento CANCELADO pelo cliente.\n\n{servico}\n{data} às {hora}\n{empresa}`,
          vars,
        })
        if (!aoBarbeiro.enviado) avisos.push(`profissional não avisado: ${aoBarbeiro.motivo}`)
      }
    } catch (err: any) {
      avisos.push(`profissional não avisado: ${err?.message || 'erro'}`)
    }

    if (avisos.length > 0) console.error('[public/agenda] cancelar — avisos:', avisos.join(' · '))

    // A resposta NÃO carrega os avisos: eles falam do WhatsApp de terceiros, e o cliente não
    // tem o que fazer com "o profissional não foi avisado".
    return res.status(200).json({ ok: true })
  } catch (e: any) {
    console.error('[public/agenda] cancelar:', e?.message || 'Unknown error')
    return res.status(500).json(CORPO_INDISPONIVEL)
  }
}
