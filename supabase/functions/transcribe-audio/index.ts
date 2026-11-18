// @ts-nocheck -- arquivo do DENO (Edge Function): os imports por URL e o objeto `Deno` não existem para o tsc do Next. A regra tipada e
// testada mora em `nucleo.ts`, que o tsc confere e o portão `transcricao-do-audio.test.ts` exercita.
/**
 * Edge Function `transcribe-audio` (tarefa 0018 do bridge, 18/11/2026): o áudio do WhatsApp vira texto para o Orçamentista. Quem chama é o
 * webhook (`src/lib/atendimentos-ia/transcricao-do-audio.ts`, do servidor da Vercel) com o service_role; qualquer outro papel é 403. A regra
 * toda está em `nucleo.ts`; aqui só o Deno, o banco e a autorização. A GROQ_API_KEY e a OPENAI_API_KEY são lidas por Deno.env.get e nunca
 * saem daqui.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { lerPedido, transcrever, type Dependencias, type LinhaDoUso, type Teto } from "./nucleo.ts"

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } })
const semTabela = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205"

/** O papel do JWT já verificado pela plataforma (verify_jwt): só o service_role chama. */
function papelDoJwt(req: Request): string | null {
  const t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  const partes = t.split(".")
  if (partes.length !== 3) return null
  try {
    const carga = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")))
    return typeof carga?.role === "string" ? carga.role : null
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, motivo: "pedido_invalido", detalhe: "use POST" }, 405)
  if (papelDoJwt(req) !== "service_role") return json({ ok: false, motivo: "pedido_invalido", detalhe: "só o servidor chama esta função" }, 403)
  const pedido = lerPedido(await req.json().catch(() => null))
  if ("erro" in pedido) return json({ ok: false, motivo: "pedido_invalido", detalhe: pedido.erro }, 400)

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const deps: Dependencias = {
    env: (nome) => Deno.env.get(nome),
    fetch: (url, init) => fetch(url, init),
    esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
    empresaLiberada: async (tenantId) => {
      const { data, error } = await db.from("orcamentista_config").select("ativo").eq("tenant_id", tenantId).maybeSingle()
      if (error) throw new Error(`orcamentista_config: ${error.code}`)
      return data?.ativo === true
    },
    teto: async (tenantId): Promise<Teto | "sem_migracao"> => {
      const conf = await db.from("audio_transcription_settings").select("teto_ligado, teto_minutos_mes").eq("id", 1).maybeSingle()
      if (semTabela(conf.error)) return "sem_migracao"
      if (conf.error) throw new Error(`audio_transcription_settings: ${conf.error.code}`)
      if (!conf.data?.teto_ligado) return { ligado: false, minutosDoMes: null, segundosUsadosNoMes: 0 }
      const inicio = new Date(); inicio.setUTCDate(1); inicio.setUTCHours(0, 0, 0, 0)
      const uso = await db.from("audio_transcription_usage").select("duration_seconds").eq("tenant_id", tenantId).eq("status", "ok").gte("created_at", inicio.toISOString())
      if (uso.error) throw new Error(`audio_transcription_usage: ${uso.error.code}`)
      const usados = (uso.data ?? []).reduce((s: number, l: { duration_seconds: number | null }) => s + Number(l.duration_seconds ?? 0), 0)
      return { ligado: true, minutosDoMes: Number(conf.data.teto_minutos_mes), segundosUsadosNoMes: usados }
    },
    gravarUso: async (linha: LinhaDoUso) => {
      const { error } = await db.from("audio_transcription_usage").insert(linha)
      if (semTabela(error)) return "sem_migracao"
      if (error) throw new Error(`audio_transcription_usage: ${error.code}`)
      return "ok"
    },
  }
  try {
    const r = await transcrever(pedido, deps)
    // a linha do log: o desfecho e o provedor, nunca o texto, a chave nem o áudio
    console.log(`[TRANSCRICAO] tenant=${pedido.tenant_id} ok=${r.ok}${r.ok ? ` provider=${r.provider}` : ` motivo=${r.motivo} detalhe=${r.detalhe}`} segundos=${r.segundos ?? "-"} uso=${r.uso}`)
    return json(r)
  } catch (e) {
    console.log(`[TRANSCRICAO] tenant=${pedido.tenant_id} ok=false motivo=erro detalhe=${e instanceof Error ? e.message : "excecao"}`)
    return json({ ok: false, motivo: "falhou", segundos: null, detalhe: "erro_interno", uso: "nao_gravado" }, 500)
  }
})
