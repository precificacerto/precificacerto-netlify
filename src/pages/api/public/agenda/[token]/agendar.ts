/**
 * POST /api/public/agenda/[token]/agendar — grava o agendamento. A superfície mais sensível.
 *
 * Resposta de sucesso: `{ ok: true }` e NADA MAIS. Nem id do evento, nem id do cliente, nem o
 * nome que foi casado. Devolver qualquer identificador daria a quem varre um oráculo: mandar um
 * telefone e descobrir, pela resposta, se ele já é cliente daquele salão.
 *
 * >>> O TENANT SAI DO TOKEN. O CORPO NÃO É LIDO PARA ISSO. <<<
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import {
  CORPO_INDISPONIVEL, barbeiroValido, contextoDoToken,
  // >>> O ENVIO MUDOU DE CASA EM 08/10/2026 <<<
  // `enviarConfirmacao` e `nomeDoBarbeiro` moravam NESTE arquivo. A Fase 2B manda quatro
  // mensagens e precisava das duas; mantê-las aqui obrigaria as rotas novas a escrever a
  // segunda cópia do envio. Autorizado pelo dono do produto, e é a ÚNICA alteração desta
  // rodada neste arquivo — o resto dele continua intocado.
  enviarMensagemDoAgendamento, nomeDoBarbeiro,
  servicosDoBarbeiro, telefoneCanonico, textoCurto,
} from '@/lib/agendamento-publico'
import { instanteDoRelogioLocal, horaParaMinutos } from '@/utils/horarios-disponiveis'
import { calcularHorarios } from './horarios'
import { MENSAGEM_CONFIRMACAO_PADRAO } from '@/utils/mensagens-agendamento-padrao'

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_POST_POR_IP_HORA = 5

/** O IP de quem chamou, como a Vercel o entrega. */
function ipDoPedido(req: NextApiRequest): string {
  const xff = String(req.headers['x-forwarded-for'] ?? '')
  return (xff.split(',')[0] || req.socket?.remoteAddress || 'desconhecido').trim().slice(0, 64)
}

/**
 * Limite de abuso, em memória do processo.
 *
 * >>> ISTO É PISO, NÃO TETO, E ESTÁ DITO AQUI PARA NÃO SER LIDO COMO GARANTIA <<<
 * Serverless escala em várias instâncias e cada uma tem o seu mapa, então o limite real é
 * `5 × instâncias`, não 5. Um limite de verdade mora numa tabela ou num Redis — e tabela nova é
 * migração, que esta rodada proíbe. Fica como o que é: atrito contra script ingênuo, declarado
 * como insuficiente contra atacante decidido (`ausente-vs-falso.md` aplicado a uma promessa de
 * segurança: prometer o que não se cumpre é pior que não prometer).
 */
const porIp = new Map<string, number[]>()
function estourouOIp(ip: string, agora: number): boolean {
  const limite = agora - 3600_000
  const antes = (porIp.get(ip) ?? []).filter((t) => t > limite)
  if (antes.length >= MAX_POST_POR_IP_HORA) { porIp.set(ip, antes); return true }
  antes.push(agora)
  porIp.set(ip, antes)
  if (porIp.size > 5000) porIp.clear()   // teto de memória do processo
  return false
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json(CORPO_INDISPONIVEL)

  try {
    const ctx = await contextoDoToken(req.query.token)
    if (!ctx) return res.status(404).json(CORPO_INDISPONIVEL)

    if (estourouOIp(ipDoPedido(req), Date.now())) {
      // Erro genérico: dizer QUAL regra bateu ensina a contorná-la.
      return res.status(429).json(CORPO_INDISPONIVEL)
    }

    const body = (req.body ?? {}) as Record<string, unknown>
    const dia = String(body.dia ?? '')
    const hora = String(body.hora ?? '')
    const nome = textoCurto(body.nome, 120)
    const telefone = telefoneCanonico(body.telefone)
    const email = textoCurto(body.email, 160).toLowerCase()

    if (!DIA_RE.test(dia) || Number.isNaN(horaParaMinutos(hora))) return res.status(400).json(CORPO_INDISPONIVEL)
    if (nome.length < 2) return res.status(400).json(CORPO_INDISPONIVEL)
    // 10 ou 11 dígitos, sem DDI — é o formato que `phone-br.ts` fixa e que o envio de WhatsApp
    // espera (ele acrescenta o 55 sozinho). Gravar E.164 faria o envio cair no ramo errado.
    if (telefone.length < 10 || telefone.length > 11) return res.status(400).json(CORPO_INDISPONIVEL)
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json(CORPO_INDISPONIVEL)

    const barbeiro = await barbeiroValido(ctx.tenant_id, body.barbeiro)
    if (!barbeiro) return res.status(404).json(CORPO_INDISPONIVEL)

    const servicos = await servicosDoBarbeiro(ctx.tenant_id, barbeiro)
    if (!servicos) return res.status(409).json(CORPO_INDISPONIVEL)
    const svc = servicos.find((s) => s.id === String(body.servico ?? ''))
    if (!svc) return res.status(404).json(CORPO_INDISPONIVEL)

    // ── §2.7 — RECALCULA no servidor. O horário que o cliente mandou não é premissa ────────
    // A tela pode estar velha, o cliente pode ter editado o POST, ou outro pode ter marcado no
    // meio. A lista aqui é a verdade, e `hora` só vale se estiver nela.
    const agora = new Date()
    const disponiveis = await calcularHorarios(
      ctx.tenant_id, barbeiro, svc.duracaoMin, dia,
      ctx.grid_minutes, ctx.lead_time_min, ctx.horizon_days, agora,
    )
    const hhmm = hora.slice(0, 5)
    if (!disponiveis.includes(hhmm)) return res.status(409).json(CORPO_INDISPONIVEL)

    const inicio = instanteDoRelogioLocal(dia, horaParaMinutos(hhmm))
    const fim = new Date(inicio.getTime() + svc.duracaoMin * 60000)

    // ── §2.10 — UM agendamento FUTURO ativo por telefone, no tenant ───────────────────────
    // Lido pelo cliente já existente: sem cliente, não há agendamento futuro a contar.
    const { data: clienteExistente, error: eCli } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('whatsapp_phone', telefone)
      .limit(1)
      .maybeSingle()
    if (eCli) throw eCli

    let customer_id: string | null = (clienteExistente as any)?.id ?? null

    if (customer_id) {
      const { data: futuros, error: eFut } = await supabaseAdmin
        .from('calendar_events')
        .select('id')
        .eq('tenant_id', ctx.tenant_id)
        .eq('customer_id', customer_id)
        .eq('is_active', true)
        .neq('status', 'CANCELLED')
        .gte('start_time', agora.toISOString())
        .limit(1)
      if (eFut) throw eFut
      if ((futuros ?? []).length > 0) return res.status(429).json(CORPO_INDISPONIVEL)
    }

    // ── §2.8 — relê o intervalo IMEDIATAMENTE antes do insert ─────────────────────────────
    // Duas pessoas podem clicar no mesmo segundo. Isto não é transação e não finge ser: estreita
    // a janela, não a fecha. Fechá-la exige constraint de exclusão no banco, que é migração.
    const { data: colisao, error: eCol } = await supabaseAdmin
      .from('calendar_events')
      .select('id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('employee_id', barbeiro)
      .eq('is_active', true)
      .neq('status', 'CANCELLED')
      .lt('start_time', fim.toISOString())
      .gt('end_time', inicio.toISOString())
      .limit(1)
    if (eCol) throw eCol
    if ((colisao ?? []).length > 0) return res.status(409).json(CORPO_INDISPONIVEL)

    // ── §2.9 — cliente: reusa pelo telefone DENTRO do tenant, ou cria ─────────────────────
    // Em nenhum caso o dado do cliente volta para a tela.
    if (!customer_id) {
      const { data: novo, error: eNovo } = await supabaseAdmin
        .from('customers')
        .insert({
          tenant_id: ctx.tenant_id, name: nome, whatsapp_phone: telefone,
          email: email || null, customer_type: 'PF', status: 'ACTIVE',
        })
        .select('id')
        .single()
      if (eNovo) throw eNovo
      customer_id = (novo as any).id
    }

    // ── o insert. NOT NULL de calendar_events: tenant_id, title, start_time, end_time ─────
    const { error: eEvt } = await supabaseAdmin
      .from('calendar_events')
      .insert({
        tenant_id: ctx.tenant_id,
        title: svc.nome,
        start_time: inicio.toISOString(),
        end_time: fim.toISOString(),
        event_type: 'SERVICE',
        status: 'CONFIRMED',          // o §contexto do PO: "o agendamento entra CONFIRMADO"
        employee_id: barbeiro,
        service_id: svc.id,
        customer_id,
        user_id: null,
        is_active: true,
      })
    if (eEvt) throw eEvt

    // ── §4 — a confirmação é ACESSÓRIA: falha dela NÃO derruba o agendamento ──────────────
    // O evento já está gravado. A mensagem é aviso, e o `catch` abaixo é o que impede que um
    // WUZAPI fora do ar transforme um agendamento feito em erro na tela do cliente.
    try {
      await enviarMensagemDoAgendamento({
        tenantId: ctx.tenant_id,
        telefone,
        texto: ctx.msg_confirmacao,
        padrao: MENSAGEM_CONFIRMACAO_PADRAO,
        vars: {
          cliente: nome, servico: svc.nome, data: dia.split('-').reverse().join('/'),
          hora: hhmm, empresa: ctx.empresa,
          profissional: await nomeDoBarbeiro(ctx.tenant_id, barbeiro),
        },
      })
    } catch (err: any) {
      console.error('[public/agenda] confirmação não enviada:', err?.message || 'Unknown error')
    }

    return res.status(201).json({ ok: true })
  } catch (e: any) {
    console.error('[public/agenda] agendar:', e?.message || 'Unknown error')
    return res.status(500).json(CORPO_INDISPONIVEL)
  }
}
