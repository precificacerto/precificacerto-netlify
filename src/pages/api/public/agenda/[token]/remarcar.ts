/**
 * POST /api/public/agenda/[token]/remarcar — o cliente muda o próprio horário.
 *
 * Comando do PO de 08/10/2026, Fase 2B.
 *
 * ══ A ORDEM É O PONTO DESTE ARQUIVO, E ELA NÃO É NEGOCIÁVEL ════════════════════════════
 *
 * Regra 7 do comando: *"remarcar = cancelar + agendar numa sequencia so. Se o horario novo
 * falhar, o ANTIGO CONTINUA DE PE. Nunca cancele antes de garantir o novo."*
 *
 * Então a sequência é:
 *
 *   1. valida o código e alcança o evento antigo
 *   2. RECALCULA os horários do dia novo no servidor, e confere que a hora pedida está lá
 *   3. relê a colisão imediatamente antes de gravar
 *   4. GRAVA o horário novo no PRÓPRIO evento — um `update` de `start_time`/`end_time`
 *   5. só então os avisos
 *
 * >>> NÃO HÁ "CANCELAR" SEPARADO, E ISSO É O QUE TORNA A REGRA 7 ESTRUTURAL <<<
 *
 * A leitura ingênua de "cancelar + agendar" seria dois statements: `status = 'CANCELLED'` no
 * velho, `insert` do novo. Nessa forma, uma falha no insert deixa o cliente SEM agendamento
 * nenhum — e ele não tem como saber, porque a tela mostrou erro e o horário antigo sumiu.
 *
 * Um `update` do mesmo evento é atômico por si: ou o horário muda, ou nada muda. A falha no
 * passo 2 ou 3 retorna ANTES de qualquer escrita, e o antigo continua exatamente de pé. É a
 * mutação M19, e o caso dela mede o ESTADO FINAL do evento, não a resposta HTTP.
 *
 * ══ O LEMBRETE PRECISA SER RECALCULADO, E ISSO NÃO ESTAVA NO COMANDO ═══════════════════
 *
 * `src/pages/api/whatsapp/send-reminder.ts` varre `reminder_send_at <= now` filtrando
 * `status in ('SCHEDULED','CONFIRMED')`. Remarcar muda `start_time` e MANTÉM o status — então,
 * sem recalcular, o lembrete antigo dispara na hora velha e o cliente recebe "amanhã às 14h"
 * para um horário que ele mudou.
 *
 * A regra é `calcularReminderSendAt`, EXTRAÍDA de `agenda/index.tsx:696-711` nesta rodada, e os
 * dois lados chamam a mesma função. `whatsapp_reminder_sent` volta a `false` porque o lembrete
 * daquele evento passa a ser outro.
 *
 * >>> O TENANT SAI DO TOKEN. O CORPO NÃO É LIDO PARA ISSO. <<<
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import {
  CORPO_INDISPONIVEL, contextoDoToken, enviarMensagemDoAgendamento, nomeDoBarbeiro,
  servicosDoBarbeiro, telefoneCanonico, telefoneDoBarbeiro,
} from '@/lib/agendamento-publico'
import { instanteDoRelogioLocal, horaParaMinutos } from '@/utils/horarios-disponiveis'
import { calcularReminderSendAt } from '@/utils/lembrete-whatsapp'
import { MENSAGEM_ALTERACAO_PADRAO } from '@/utils/mensagens-agendamento-padrao'
import { calcularHorarios } from './horarios'
import { CORPO_CODIGO_RECUSADO, conferirCodigo } from './codigo-validar'
import { dataEHoraBR, eventoAlcancavel } from './cancelar'

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json(CORPO_INDISPONIVEL)

  try {
    const ctx = await contextoDoToken(req.query.token)
    if (!ctx) return res.status(404).json(CORPO_INDISPONIVEL)

    const body = (req.body ?? {}) as Record<string, unknown>
    const telefone = telefoneCanonico(body.telefone)
    const codigo = String(body.codigo ?? '')
    const agendamento_id = String(body.agendamento_id ?? '')
    const dia = String(body.dia ?? '')
    const hora = String(body.hora ?? '')
    const agora = new Date()

    if (telefone.length < 10 || telefone.length > 11) {
      return res.status(401).json(CORPO_CODIGO_RECUSADO)
    }
    if (!DIA_RE.test(dia) || Number.isNaN(horaParaMinutos(hora))) {
      return res.status(400).json(CORPO_INDISPONIVEL)
    }

    const r = await conferirCodigo(ctx.tenant_id, telefone, codigo, agora)
    if (!r.ok) {
      console.error('[public/agenda] remarcar: código recusado:', r.motivo ?? 'desconhecido')
      return res.status(401).json(CORPO_CODIGO_RECUSADO)
    }

    // ── 1 — o evento antigo, nas MESMAS três condições do cancelar ──────────────────────
    // A função é a mesma, importada: duas cópias divergiriam, e a divergência apareceria como
    // o remarcar alcançando um evento que o cancelar recusa.
    const ev = await eventoAlcancavel(ctx.tenant_id, telefone, agendamento_id, agora)
    if (!ev) return res.status(404).json(CORPO_INDISPONIVEL)
    if (!ev.employee_id) return res.status(409).json(CORPO_INDISPONIVEL)

    // ── 2 — RECALCULA no servidor. O horário que o cliente mandou não é premissa ────────
    // >>> A MESMA `calcularHorarios` DO POST agendar, IMPORTADA — NÃO UMA SEGUNDA CÓPIA <<<
    // Regra 7: *"Reaproveite horariosDisponiveis e a revalidacao do POST agendar - NAO escreva
    // segunda copia do calculo de horario."* Uma segunda conta de disponibilidade divergiria da
    // primeira, e o sintoma seria o cliente conseguindo remarcar para um horário que a tela de
    // agendar recusa.
    const servicos = await servicosDoBarbeiro(ctx.tenant_id, ev.employee_id)
    if (!servicos) return res.status(409).json(CORPO_INDISPONIVEL)
    const svc = servicos.find((s) => s.id === (ev.service_id ?? ''))
    if (!svc) return res.status(409).json(CORPO_INDISPONIVEL)

    const disponiveis = await calcularHorarios(
      ctx.tenant_id, ev.employee_id, svc.duracaoMin, dia,
      ctx.grid_minutes, ctx.lead_time_min, ctx.horizon_days, agora,
    )
    const hhmm = hora.slice(0, 5)
    // >>> AQUI O ANTIGO AINDA ESTÁ DE PÉ, E É ISSO QUE A REGRA 7 PROTEGE <<<
    // Nenhuma escrita aconteceu até esta linha. O `return` deixa o evento exatamente como
    // estava — é o caso que a mutação M19 derruba.
    if (!disponiveis.includes(hhmm)) return res.status(409).json(CORPO_INDISPONIVEL)

    const inicio = instanteDoRelogioLocal(dia, horaParaMinutos(hhmm))
    const fim = new Date(inicio.getTime() + svc.duracaoMin * 60000)

    // ── 3 — relê a colisão IMEDIATAMENTE antes de gravar ───────────────────────────────
    // Isto não é transação e não finge ser: estreita a janela, não a fecha. O `.neq('id', ev.id)`
    // existe porque o PRÓPRIO evento colidiria consigo mesmo quando o horário novo se sobrepõe
    // ao antigo — e remarcar das 14:00 para as 14:30 é caso legítimo.
    const { data: colisao, error: eCol } = await supabaseAdmin
      .from('calendar_events')
      .select('id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('employee_id', ev.employee_id)
      .neq('id', ev.id)
      .eq('is_active', true)
      .in('status', ['SCHEDULED', 'CONFIRMED'])
      .lt('start_time', fim.toISOString())
      .gt('end_time', inicio.toISOString())
      .limit(1)
    if (eCol) throw eCol
    if ((colisao ?? []).length > 0) return res.status(409).json(CORPO_INDISPONIVEL)

    // ── 4 — A GRAVAÇÃO: UM update do PRÓPRIO evento ────────────────────────────────────
    // Atômico por si. Não há "cancelar o velho e inserir o novo", e é por isso que uma falha
    // aqui não deixa o cliente sem agendamento: ou os dois campos mudam, ou nenhum muda.
    //
    // E o LEMBRETE vai no MESMO update, não num segundo: um update separado poderia falhar
    // sozinho e deixar o evento no horário novo com o lembrete no velho.
    const { error: eUpd } = await supabaseAdmin
      .from('calendar_events')
      .update({
        start_time: inicio.toISOString(),
        end_time: fim.toISOString(),
        reminder_send_at: calcularReminderSendAt({
          inicio, agora, temCliente: !!ev.customer_id,
        }),
        // O lembrete daquele evento passou a ser outro, então o "já mandei" não vale mais.
        whatsapp_reminder_sent: false,
      })
      .eq('id', ev.id)
      .eq('tenant_id', ctx.tenant_id)
    if (eUpd) throw eUpd

    // ── 5 — OS AVISOS, ACESSÓRIOS. A remarcação JÁ ESTÁ GRAVADA. ───────────────────────
    const avisos: string[] = []
    const novo = dataEHoraBR(inicio.toISOString())
    const profissional = await nomeDoBarbeiro(ctx.tenant_id, ev.employee_id)
    const vars = {
      cliente: '', servico: ev.title ?? '', profissional,
      data: novo.data, hora: novo.hora, empresa: ctx.empresa,
    }

    try {
      const aoCliente = await enviarMensagemDoAgendamento({
        tenantId: ctx.tenant_id, telefone, texto: ctx.msg_alteracao,
        padrao: MENSAGEM_ALTERACAO_PADRAO, vars,
      })
      if (!aoCliente.enviado) avisos.push(`cliente não avisado: ${aoCliente.motivo}`)
    } catch (err: any) {
      avisos.push(`cliente não avisado: ${err?.message || 'erro'}`)
    }

    try {
      const foneDoBarbeiro = await telefoneDoBarbeiro(ctx.tenant_id, ev.employee_id)
      if (!foneDoBarbeiro) {
        // O CAMINHO NORMAL em produção: 1 de 16 funcionários tem telefone, medido em 08/10/2026.
        avisos.push('profissional não avisado: sem telefone cadastrado')
      } else {
        const antigo = dataEHoraBR(ev.start_time)
        const aoBarbeiro = await enviarMensagemDoAgendamento({
          tenantId: ctx.tenant_id, telefone: foneDoBarbeiro, texto: null,
          padrao: `Agendamento REMARCADO pelo cliente.\n\n{servico}\nDe {dataAntiga} às {horaAntiga}\nPara {data} às {hora}\n{empresa}`,
          vars: { ...vars, dataAntiga: antigo.data, horaAntiga: antigo.hora },
        })
        if (!aoBarbeiro.enviado) avisos.push(`profissional não avisado: ${aoBarbeiro.motivo}`)
      }
    } catch (err: any) {
      avisos.push(`profissional não avisado: ${err?.message || 'erro'}`)
    }

    if (avisos.length > 0) console.error('[public/agenda] remarcar — avisos:', avisos.join(' · '))

    return res.status(200).json({ ok: true })
  } catch (e: any) {
    console.error('[public/agenda] remarcar:', e?.message || 'Unknown error')
    return res.status(500).json(CORPO_INDISPONIVEL)
  }
}
