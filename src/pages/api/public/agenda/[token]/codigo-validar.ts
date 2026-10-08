/**
 * POST /api/public/agenda/[token]/codigo-validar — confere o código e lista os FUTUROS. *
 * ══ O CAMINHO É `codigo-solicitar`, NÃO `codigo/solicitar` — E A RAZÃO FOI MEDIDA ═══════
 *
 * O comando pedia `POST codigo/solicitar`, num SUBDIRETÓRIO. Escrito assim, `npm run build`
 * falha com `EMFILE: too many open files` no passo "Collecting build traces", apontando
 * exatamente `.next/server/pages/api/public/agenda/[token]/codigo/validar.js`.
 *
 * NÃO é falta de descritor: a máquina tem `ulimit -n` 20000 e 284 fds abertos no momento da
 * falha. É reproduzível, sempre no mesmo arquivo, e a medição isolou a causa:
 *
 *   · `origin/main` constrói nesta máquina — exit 0;
 *   · com as duas rotas em SUBDIRETÓRIO — exit 1, EMFILE;
 *   · as MESMAS duas rotas com nome PLANO — exit 0.
 *
 * O que quebra é um subdiretório abaixo de um segmento dinâmico `[token]`, no tracer de
 * dependências do Next. Nenhuma outra rota do repositório tem essa forma.
 *
 * A alternativa seria mexer no `next.config.js` (`outputFileTracingIgnores`), que está fora do
 * escopo desta rodada e trocaria um desvio visível por uma configuração global silenciosa.
 * O desvio está aqui, no ponto onde o caminho é declarado.
 *
 * Comando do PO de 08/10/2026, Fase 2B.
 *
 * ══ O QUE A RESPOSTA PODE CARREGAR, E NADA ALÉM ════════════════════════════════════════
 *
 *   { id, servico, profissional, data, hora }
 *
 * NADA de nome, e-mail ou `customer_id`. O comando é explícito: *"Nada de nome, e-mail ou id de
 * cliente."* O `id` do EVENTO precisa voltar porque é o que o cliente manda de volta para
 * cancelar — e ele só é útil para quem já provou o código, porque cancelar o revalida.
 *
 * ══ A RECUSA É SEMPRE A MESMA FRASE ════════════════════════════════════════════════════
 *
 * `validarCodigo` devolve 'expirado' | 'usado' | 'errado' | 'bloqueado'. O motivo vai para o
 * LOG DO SERVIDOR e NUNCA para a resposta:
 *
 *   · 'expirado' versus 'errado' diria que o código EXISTIU — logo, que o telefone é cliente;
 *   · 'bloqueado' diria que alguém acertou o telefone e gastou as tentativas de uma pessoa real.
 *
 * Há caso no portão afirmando que a resposta não contém nenhum dos quatro motivos.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { CORPO_INDISPONIVEL, contextoDoToken, telefoneCanonico } from '@/lib/agendamento-publico'
import { MAX_TENTATIVAS, codigoRecusado, validarCodigo } from '@/utils/codigo-de-acesso'

/** A ÚNICA recusa. Uma frase, para os quatro motivos. */
export const CORPO_CODIGO_RECUSADO = { error: 'Código inválido ou expirado.' } as const

export type AgendamentoPublico = {
  id: string
  servico: string
  profissional: string
  /** `DD/MM/YYYY` — o formato brasileiro que a tela já usa. */
  data: string
  /** `HH:mm`. */
  hora: string
  /**
   * >>> OS DOIS IDS SÃO PÚBLICOS POR CONSTRUÇÃO, E ESTÃO AQUI POR UMA RAZÃO DE ESCOPO <<<
   *
   * `GET /api/public/agenda/[token]` já lista TODOS os barbeiros com os ids, e
   * `GET …/servicos?barbeiro=` já lista os serviços com os ids. Quem tem o link tem os dois sem
   * precisar de código nenhum — devolvê-los aqui não acrescenta informação.
   *
   * Eles existem porque o remarcar da tela REUSA `GET …/horarios?barbeiro=&servico=&dia=`, que
   * é a rota da Fase 2 e esta rodada NÃO pode tocar. Sem os ids, a tela precisaria de um
   * parâmetro novo naquela rota — e a alteração autorizada nesta rodada era só a de `agendar.ts`.
   *
   * O que continua FORA: nome, e-mail e `customer_id`. Esses sim identificam a pessoa, e há
   * caso afirmando as chaves exatas da resposta.
   */
  barbeiro_id: string
  servico_id: string
}

/**
 * Confere o código e CONSOME a linha.
 *
 * >>> ELA É COMPARTILHADA PELAS TRÊS ROTAS QUE PEDEM CÓDIGO <<<
 *
 * `validar`, `cancelar` e `remarcar` fazem a mesma conferência. Três cópias divergiriam na
 * primeira mudança da regra de tentativas — `copia-divergente.md`, cujo remédio é apagar as
 * cópias. Está exportada daqui porque foi aqui que nasceu.
 *
 * ── O USO ÚNICO E AS TENTATIVAS, E POR QUE O INCREMENTO VEM ANTES ─────────────────────
 *
 * Toda tentativa incrementa `attempts`, acerte ou não — senão a força bruta sairia de graça. O
 * incremento acontece ANTES da conclusão: se ele viesse depois do `return` do caso certo, três
 * acertos não contariam e o limite viraria "três ERROS", que é outra regra.
 *
 * O acerto marca `used_at`: uso único. Isso é o que impede alguém que vê o WhatsApp do cliente
 * por cima do ombro de usar o mesmo código meia hora depois.
 */
export async function conferirCodigo(
  tenant_id: string, telefone: string, codigo: string, agora: Date,
  // >>> A FORMA DO RETORNO É PLANA, NÃO UNIÃO, E A RAZÃO É A MESMA DAS GUARDAS <<<
  // Com `strictNullChecks: false` o TypeScript não estreita união por literal booleano, e os
  // três chamadores leriam `motivo` com `TS2339`. Uma guarda a mais para três consumidores
  // internos não se paga; o campo opcional resolve.
): Promise<{ ok: boolean; motivo?: string }> {
  if (!/^\d{6}$/.test(String(codigo ?? ''))) return { ok: false, motivo: 'errado' }

  // A linha mais recente daquele telefone NAQUELE tenant. O `.eq('tenant_id', ...)` é o
  // isolamento — `supabaseAdmin` passa por cima da RLS, então este filtro é a única coisa que
  // separa um salão do outro.
  const { data: linha, error: eSel } = await supabaseAdmin
    .from('booking_access_codes')
    .select('id, code_hash, code_salt, expires_at, attempts, used_at')
    .eq('tenant_id', tenant_id)
    .eq('phone', telefone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (eSel) throw eSel
  if (!linha) return { ok: false, motivo: 'errado' }

  const l = linha as any
  const r = validarCodigo({
    hash: l.code_hash,
    codigo: String(codigo),
    sal: l.code_salt,
    expiresAt: l.expires_at,
    attempts: Number(l.attempts ?? 0),
    usedAt: l.used_at ?? null,
    agora,
  })

  // ── o incremento, e a QUEIMA na quarta ────────────────────────────────────────────────
  // Regra 3: na 4ª tentativa o código é queimado (`used_at`) e a resposta é genérica. Queimar
  // é o que impede que o atacante continue tentando depois de estourar — sem isso, `attempts`
  // só contaria e o código seguiria vivo para a tentativa seguinte.
  const novasTentativas = Number(l.attempts ?? 0) + 1
  const patch: Record<string, unknown> = { attempts: novasTentativas }
  if (!codigoRecusado(r)) patch.used_at = agora.toISOString()
  else if (novasTentativas >= MAX_TENTATIVAS && !l.used_at) patch.used_at = agora.toISOString()

  const { error: eUpd } = await supabaseAdmin
    .from('booking_access_codes')
    .update(patch)
    .eq('id', l.id)
    .eq('tenant_id', tenant_id)
  if (eUpd) throw eUpd

  if (!codigoRecusado(r)) return { ok: true }
  return { ok: false, motivo: r.motivo }
}

/** Os agendamentos FUTUROS daquele telefone, naquele tenant. Sem dado de cliente. */
export async function futurosDoTelefone(
  tenant_id: string, telefone: string, agora: Date,
): Promise<AgendamentoPublico[]> {
  const { data: cli, error: eCli } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('whatsapp_phone', telefone)
    .limit(1)
    .maybeSingle()
  if (eCli) throw eCli
  const customer_id = (cli as any)?.id ?? null
  if (!customer_id) return []

  const { data: evs, error: eEv } = await supabaseAdmin
    .from('calendar_events')
    .select('id, title, start_time, employee_id, service_id')
    .eq('tenant_id', tenant_id)
    .eq('customer_id', customer_id)
    .eq('is_active', true)
    .in('status', ['SCHEDULED', 'CONFIRMED'])
    .gte('start_time', agora.toISOString())
    .order('start_time', { ascending: true })
  if (eEv) throw eEv

  const lista = (evs ?? []) as any[]
  if (lista.length === 0) return []

  // Os nomes dos profissionais, numa consulta — não uma por evento.
  const ids = Array.from(new Set(lista.map((e) => e.employee_id).filter(Boolean)))
  const nomes: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: emps, error: eEmp } = await supabaseAdmin
      .from('employees')
      .select('id, name')
      .eq('tenant_id', tenant_id)
      .in('id', ids)
    if (eEmp) throw eEmp
    for (const e of (emps ?? []) as any[]) nomes[e.id] = e.name
  }

  return lista.map((e) => {
    const d = new Date(e.start_time)
    return {
      id: e.id,
      servico: String(e.title ?? ''),
      profissional: nomes[e.employee_id] ?? '',
      data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      barbeiro_id: String(e.employee_id ?? ''),
      servico_id: String(e.service_id ?? ''),
    }
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json(CORPO_INDISPONIVEL)

  try {
    const ctx = await contextoDoToken(req.query.token)
    if (!ctx) return res.status(404).json(CORPO_INDISPONIVEL)

    const body = (req.body ?? {}) as Record<string, unknown>
    const telefone = telefoneCanonico(body.telefone)
    const codigo = String(body.codigo ?? '')

    if (telefone.length < 10 || telefone.length > 11) {
      return res.status(401).json(CORPO_CODIGO_RECUSADO)
    }

    const r = await conferirCodigo(ctx.tenant_id, telefone, codigo, new Date())
    if (!r.ok) {
      // O motivo vai para o LOG, e só para ele.
      console.error('[public/agenda] codigo-validar recusado:', r.motivo)
      return res.status(401).json(CORPO_CODIGO_RECUSADO)
    }

    const agendamentos = await futurosDoTelefone(ctx.tenant_id, telefone, new Date())
    return res.status(200).json({ ok: true, agendamentos })
  } catch (e: any) {
    console.error('[public/agenda] codigo-validar:', e?.message || 'Unknown error')
    return res.status(500).json(CORPO_INDISPONIVEL)
  }
}
