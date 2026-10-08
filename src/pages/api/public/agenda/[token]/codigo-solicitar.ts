/**
 * POST /api/public/agenda/[token]/codigo-solicitar — manda o código de 6 dígitos por WhatsApp. *
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
 * ══ A RESPOSTA É SEMPRE `{ ok: true }`, E ISSO É A REGRA INTEIRA ════════════════════════
 *
 * Regra 2 do comando, inviolável: *"codigo/solicitar responde { ok: true } para telefone
 * conhecido E desconhecido, com o MESMO tempo de resposta. Se responder diferente, vira oraculo
 * de 'esse numero e cliente daqui' - exatamente o que o PO vetou na Fase 2."*
 *
 * Isso vale para TODOS os ramos, e são cinco:
 *
 *   · telefone não é cliente deste tenant        → { ok: true }, nada enviado
 *   · telefone é cliente mas não tem futuro      → { ok: true }, nada enviado
 *   · estourou 3 por telefone/hora               → { ok: true }, nada enviado
 *   · estourou 10 por IP/hora                    → { ok: true }, nada enviado
 *   · tudo certo                                 → { ok: true }, código enviado
 *
 * E o TEMPO também: um `return` antecipado num dos ramos entregaria a resposta mais rápido, e
 * a diferença é mensurável de fora. Daí o `aguardarOPisoDeTempo` no fim — todos os caminhos
 * esperam o mesmo piso antes de responder.
 *
 * >>> O TENANT SAI DO TOKEN. O CORPO NÃO É LIDO PARA ISSO. <<<
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import {
  CORPO_INDISPONIVEL, contextoDoToken, enviarMensagemDoAgendamento, telefoneCanonico,
} from '@/lib/agendamento-publico'
import { expiraEm, gerarCodigo, gerarSal, hashDoCodigo } from '@/utils/codigo-de-acesso'

/** A resposta ÚNICA. Nenhum ramo responde outra coisa. */
const CORPO_OK = { ok: true } as const

const MAX_POR_TELEFONE_HORA = 3
const MAX_POR_IP_HORA = 10

/**
 * O piso de tempo da resposta, em milissegundos.
 *
 * >>> ELE EXISTE PARA QUE O TEMPO NÃO SEJA O ORÁCULO QUE A RESPOSTA NÃO É <<<
 *
 * O caminho completo faz quatro consultas e um POST ao WUZAPI; o caminho "telefone desconhecido"
 * faz uma consulta e para. Sem piso, a diferença é de centenas de milissegundos — e quem mede
 * isso descobre quais telefones são clientes do salão, que é exatamente o que a regra 2 proíbe.
 *
 * >>> E ELE É PISO, NÃO IGUALDADE — DITO AQUI PARA NÃO SER LIDO COMO GARANTIA <<<
 * Um caminho que passe de 600ms responde mais devagar e a diferença volta a existir. Igualdade
 * de verdade exigiria responder antes e trabalhar depois, o que `ausente-vs-falso.md` manda não
 * prometer sem cumprir. Isto é atrito contra medição ingênua, declarado como insuficiente
 * contra quem mede mil chamadas e tira a média.
 */
const PISO_DE_TEMPO_MS = 600

async function aguardarOPisoDeTempo(comecou: number): Promise<void> {
  const falta = PISO_DE_TEMPO_MS - (Date.now() - comecou)
  if (falta > 0) await new Promise((r) => setTimeout(r, falta))
}

function ipDoPedido(req: NextApiRequest): string {
  const xff = String(req.headers['x-forwarded-for'] ?? '')
  return (xff.split(',')[0] || req.socket?.remoteAddress || 'desconhecido').trim().slice(0, 64)
}

/**
 * Limite por IP, em memória do processo.
 *
 * >>> ISTO É PISO, NÃO TETO — a mesma nota do POST agendar, e pela mesma razão <<<
 * Serverless escala em várias instâncias e cada uma tem o seu mapa, então o limite real é
 * `10 × instâncias`. O limite por TELEFONE, abaixo, é de verdade: ele conta linhas na tabela.
 */
const porIp = new Map<string, number[]>()
function estourouOIp(ip: string, agora: number): boolean {
  const limite = agora - 3600_000
  const antes = (porIp.get(ip) ?? []).filter((t) => t > limite)
  if (antes.length >= MAX_POR_IP_HORA) { porIp.set(ip, antes); return true }
  antes.push(agora)
  porIp.set(ip, antes)
  if (porIp.size > 5000) porIp.clear()
  return false
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const comecou = Date.now()
  if (req.method !== 'POST') return res.status(405).json(CORPO_INDISPONIVEL)

  try {
    const ctx = await contextoDoToken(req.query.token)
    // >>> TOKEN INVÁLIDO É O ÚNICO CASO QUE NÃO RESPONDE `{ ok: true }` <<<
    // E é correto: o 404 aqui não diz nada sobre telefone nenhum — diz que o LINK não existe, o
    // que quem tem o link já sabe. É a mesma resposta que as quatro rotas da Fase 2 dão, e
    // token desligado é indistinguível de inexistente porque `contextoDoToken` filtra por
    // `is_enabled`.
    if (!ctx) { await aguardarOPisoDeTempo(comecou); return res.status(404).json(CORPO_INDISPONIVEL) }

    const telefone = telefoneCanonico((req.body ?? {})?.telefone)
    const agora = new Date()

    // Telefone malformado também responde `{ ok: true }`: dizer "formato inválido" versus
    // "ok" separa os dois mundos para quem varre, e o formato é público de todo jeito.
    if (telefone.length < 10 || telefone.length > 11) {
      await aguardarOPisoDeTempo(comecou)
      return res.status(200).json(CORPO_OK)
    }

    if (estourouOIp(ipDoPedido(req), agora.getTime())) {
      // Regra 5: estourou → `{ ok: true }` mesmo assim, sem mandar nada. NÃO revele o limite.
      await aguardarOPisoDeTempo(comecou)
      return res.status(200).json(CORPO_OK)
    }

    // ── o limite POR TELEFONE: conta linhas, então é limite de verdade ──────────────────
    const umaHoraAtras = new Date(agora.getTime() - 3600_000).toISOString()
    const { data: recentes, error: eRec } = await supabaseAdmin
      .from('booking_access_codes')
      .select('id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('phone', telefone)
      .gte('created_at', umaHoraAtras)
    if (eRec) throw eRec
    if ((recentes ?? []).length >= MAX_POR_TELEFONE_HORA) {
      await aguardarOPisoDeTempo(comecou)
      return res.status(200).json(CORPO_OK)
    }

    // ── o telefone é cliente DESTE tenant, com agendamento futuro? ──────────────────────
    // Se não for, nada é gerado e nada é enviado — e a resposta é a mesma.
    const { data: cli, error: eCli } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('whatsapp_phone', telefone)
      .limit(1)
      .maybeSingle()
    if (eCli) throw eCli
    const customer_id = (cli as any)?.id ?? null

    let temFuturo = false
    if (customer_id) {
      const { data: fut, error: eFut } = await supabaseAdmin
        .from('calendar_events')
        .select('id')
        .eq('tenant_id', ctx.tenant_id)
        .eq('customer_id', customer_id)
        .eq('is_active', true)
        .in('status', ['SCHEDULED', 'CONFIRMED'])
        .gte('start_time', agora.toISOString())
        .limit(1)
      if (eFut) throw eFut
      temFuturo = (fut ?? []).length > 0
    }

    if (temFuturo) {
      // ── gera, grava o HASH, e manda ──────────────────────────────────────────────────
      const codigo = gerarCodigo()
      const sal = gerarSal()
      const { error: eIns } = await supabaseAdmin
        .from('booking_access_codes')
        .insert({
          tenant_id: ctx.tenant_id,
          phone: telefone,
          // >>> O HASH, NUNCA O CÓDIGO <<<
          // Quem ler esta tabela não pode cancelar agendamento de ninguém. O `codigo` em claro
          // existe só nesta variável local e no WhatsApp do cliente.
          code_hash: hashDoCodigo(codigo, sal),
          code_salt: sal,
          expires_at: expiraEm(agora).toISOString(),
        })
      if (eIns) throw eIns

      // O envio é ACESSÓRIO para a RESPOSTA — ela é `{ ok: true }` de todo jeito. Falha aqui
      // vira log, e o cliente pede outro código.
      const r = await enviarMensagemDoAgendamento({
        tenantId: ctx.tenant_id,
        telefone,
        texto: null,
        padrao: `Seu código de acesso é {codigo}. Ele vale por 10 minutos.\n{empresa}`,
        vars: { codigo, empresa: ctx.empresa },
      })
      if (!r.enviado) {
        console.error('[public/agenda] código não enviado:', r.motivo ?? 'desconhecido')
      }
    }

    await aguardarOPisoDeTempo(comecou)
    return res.status(200).json(CORPO_OK)
  } catch (e: any) {
    console.error('[public/agenda] codigo-solicitar:', e?.message || 'Unknown error')
    // >>> ATÉ O ERRO RESPONDE `{ ok: true }` <<<
    // Um 500 aqui seria oráculo: ele só acontece DEPOIS de o telefone ter passado pelos
    // filtros, então "500" diria "este número é cliente daqui". A falha fica no log do
    // servidor, onde é útil, e não na resposta, onde é informação.
    await aguardarOPisoDeTempo(comecou)
    return res.status(200).json(CORPO_OK)
  }
}
