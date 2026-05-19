/**
 * MRM Shadow-Mode (Story MRM-V2-S3.1 — ADR-001, ADR-005)
 *
 * Fire-and-forget validador empírico: o motor cliente (`calculateMarginReapuration`)
 * é canônico — seu resultado SEMPRE prevalece. Esta camada dispara em paralelo
 * uma chamada à edge function `calc-tax-engine` com o mesmo input, compara
 * outputs campo-a-campo com epsilon dinâmico e loga divergências em
 * `mrm_engine_divergences` (criada em S3.2).
 *
 * Critério go/no-go (Q4): 7 dias consecutivos com `diff_percent > 0.01%` OU
 * `diff_amount > R$0,50` em ZERO documentos → habilita HTTP 299 deprecation.
 *
 * Garantias críticas:
 *   - NUNCA bloqueia o caller (sempre retorna void quase imediato)
 *   - NUNCA lança exceção visível na UX
 *   - NUNCA modifica o resultado do cliente
 *   - Default da flag = OFF (ativação manual em produção pelo DBA)
 *   - Timeout de 5s na chamada à edge via Promise.race
 *   - Falhas de logging em si são silenciosas (catch interno)
 *
 * Anti-padrão: NÃO usar `await` direto na invocação desta função em fluxo
 * crítico — sempre `void runShadowComparison(...)` ou chamada não-bloqueante.
 */

import { supabase } from '@/supabase/client'
import {
  MRM_ENGINE_VERSION,
  type ReapurationInput,
  type TaxBreakdown,
} from '@/types/mrm'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface ShadowContext {
  /** Tenant proprietário do documento. Quando ausente, RLS pode falhar — gravamos null. */
  tenant_id?: string | null
  /** UUID do documento (budget/order/sale) — opcional, usado para correlação. */
  document_id?: string | null
  /** Tipo do documento — facilita filtros no dashboard de divergências. */
  document_type?: 'budget' | 'order' | 'sale' | null
  /** Override de timeout em ms (default 5000). Útil em testes. */
  timeoutMs?: number
}

export type ShadowErrorReason =
  | 'timeout'
  | 'http_error'
  | 'network'
  | 'shadow_exception'

export type ShadowDivergenceType =
  | 'numeric_divergence'
  | 'edge_unavailable'
  | 'shadow_exception'

export interface ComponentDiff {
  field: string
  client_value: number
  edge_value: number
  diff: number
}

export interface ComparisonResult {
  has_divergence: boolean
  /** Maior diferença absoluta entre quaisquer campos comparados. */
  diff_amount: number
  /** Maior diferença em % de RRO (referência do motor). */
  diff_percent: number
  /** Lista de campos cujo |client - edge| excede o epsilon. */
  fields_diverged: string[]
  /** Detalhe por componente para auditoria. */
  components: ComponentDiff[]
  /** Epsilon dinâmico efetivamente usado (max(0.01, rro * 1e-6)). */
  epsilon_used: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5000
const EPSILON_FLOOR = 0.01
const EPSILON_RATIO = 1e-6

/**
 * Campos numéricos do TaxBreakdown que comparamos entre cliente e edge.
 * Mantidos como `keyof TaxBreakdown` para garantir consistência com o motor.
 */
const COMPARABLE_FIELDS: Array<keyof TaxBreakdown> = [
  'rro',
  'new_commission',
  'new_profit',
  'new_csll',
  'new_irpj',
  'imp_total',
  'rv',
]

// ─────────────────────────────────────────────────────────────────────────────
// Feature flag (lookup tardio para permitir mocks em teste)
// ─────────────────────────────────────────────────────────────────────────────

function isShadowEnabled(): boolean {
  // Import dinâmico-equivalente: lemos via require para que jest.resetModules
  // / spyOn em testes funcione sem ciclo de import.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const flags = require('@/config/feature-flags') as {
      isFeatureEnabled: (k: 'mrm.shadow_mode_enabled') => boolean
    }
    return !!flags.isFeatureEnabled('mrm.shadow_mode_enabled')
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapta o input do motor cliente para o shape que a edge `calc-tax-engine`
 * historicamente aceita. A edge espera `tenant_id`, `product_id`, etc — ainda
 * não temos esses no shape do motor MRM. Enviamos o input original como
 * "envelope MRM" para que a edge possa evoluir e aceitar. Hoje a edge ignora
 * e responde com erro de validação — log é capturado como `edge_unavailable`,
 * que é exatamente o que queremos no shadow inicial.
 */
function adaptInputForEdge(
  input: ReapurationInput,
  ctx?: ShadowContext,
): Record<string, unknown> {
  return {
    // Envelope MRM (para evolução futura da edge)
    mrm_engine_version: MRM_ENGINE_VERSION,
    mrm_input: input,
    // Campos legados que a edge espera (best-effort — vazios quando não temos)
    tenant_id: ctx?.tenant_id ?? null,
    document_id: ctx?.document_id ?? null,
    document_type: ctx?.document_type ?? null,
  }
}

/**
 * Extrai os campos numéricos comparáveis do output da edge. Se a edge ainda
 * não evoluiu para o shape MRM (caso comum hoje), retorna `null` indicando
 * que comparação não é possível — caller loga como `edge_unavailable`.
 */
function adaptOutputFromEdge(edgeRaw: unknown): Partial<TaxBreakdown> | null {
  if (!edgeRaw || typeof edgeRaw !== 'object') return null
  const obj = edgeRaw as Record<string, unknown>

  // Caso 1: edge já evoluiu e devolve TaxBreakdown direto
  if (typeof obj.rro === 'number') {
    return obj as unknown as TaxBreakdown
  }

  // Caso 2: edge devolve `tax_breakdown` aninhado
  if (obj.tax_breakdown && typeof obj.tax_breakdown === 'object') {
    return obj.tax_breakdown as TaxBreakdown
  }

  // Caso 3: edge devolve apenas pricing legado — sem campos MRM, não dá pra comparar.
  return null
}

/**
 * Comparação campo-a-campo com epsilon dinâmico.
 *
 * epsilon = max(0.01, |client.rro| * 1e-6)
 * divergente = |client[f] - edge[f]| > epsilon
 *
 * Pure function — sem I/O.
 */
export function compareMotorResults(
  client: TaxBreakdown,
  edge: Partial<TaxBreakdown>,
): ComparisonResult {
  const rroBase = Math.abs(Number(client.rro ?? 0))
  const epsilon = Math.max(EPSILON_FLOOR, rroBase * EPSILON_RATIO)

  const components: ComponentDiff[] = []
  const fields_diverged: string[] = []
  let maxDiff = 0

  for (const field of COMPARABLE_FIELDS) {
    const clientVal = Number(client[field] ?? 0)
    const edgeVal = Number((edge as Record<string, unknown>)[field as string] ?? 0)
    const diff = Math.abs(clientVal - edgeVal)
    components.push({
      field: field as string,
      client_value: clientVal,
      edge_value: edgeVal,
      diff,
    })
    if (diff > epsilon) {
      fields_diverged.push(field as string)
      if (diff > maxDiff) maxDiff = diff
    }
  }

  const diff_percent = rroBase > 0 ? (maxDiff / rroBase) * 100 : 0

  return {
    has_divergence: fields_diverged.length > 0,
    diff_amount: maxDiff,
    diff_percent,
    fields_diverged,
    components,
    epsilon_used: epsilon,
  }
}

/**
 * Race entre a invocação à edge e um timer. Se o timer disparar primeiro,
 * resolvemos com `{ timedOut: true }` ao invés de rejeitar — caller decide
 * o tratamento e jamais propaga exceção pro chamador original.
 */
async function invokeEdgeWithTimeout(
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<
  | { kind: 'ok'; data: unknown }
  | { kind: 'timeout' }
  | { kind: 'http_error'; message: string }
  | { kind: 'network'; message: string }
> {
  let timerId: ReturnType<typeof setTimeout> | undefined

  try {
    const edgePromise = (async () => {
      try {
        const result = await supabase.functions.invoke('calc-tax-engine', { body })
        return { kind: 'response' as const, result }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { kind: 'network' as const, message }
      }
    })()

    const timeoutPromise = new Promise<{ kind: 'timeout' }>((resolve) => {
      timerId = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs)
    })

    const raced = await Promise.race([edgePromise, timeoutPromise])

    if (raced.kind === 'timeout') return { kind: 'timeout' }
    if (raced.kind === 'network') return { kind: 'network', message: raced.message }

    // Resposta do supabase functions.invoke: { data, error }
    const { data, error } = (raced.result || {}) as {
      data: unknown
      error?: { message?: string } | null
    }

    if (error) {
      return { kind: 'http_error', message: error.message ?? 'unknown_http_error' }
    }
    return { kind: 'ok', data }
  } catch (err: unknown) {
    // Defesa adicional: qualquer exception aqui dentro vira "network" do ponto
    // de vista do shadow — nunca deixamos propagar.
    const message = err instanceof Error ? err.message : String(err)
    return { kind: 'network', message }
  } finally {
    if (timerId !== undefined) clearTimeout(timerId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistência de divergências
// ─────────────────────────────────────────────────────────────────────────────

interface DivergenceRow {
  tenant_id: string | null
  document_id: string | null
  document_type: string | null
  divergence_type: ShadowDivergenceType
  motor_version_client: string
  motor_version_edge: string | null
  client_output: TaxBreakdown
  edge_output: unknown | null
  edge_error: string | null
  error_reason: ShadowErrorReason | null
  diff_amount: number | null
  diff_percent: number | null
  fields_diverged: string[] | null
  shadow_duration_ms: number
  epsilon_used: number | null
}

async function persistDivergence(row: DivergenceRow): Promise<void> {
  try {
    // Defensive: tabela mrm_engine_divergences é criada por S3.2 — pode não
    // existir ainda em alguns ambientes. Try/catch garante silêncio total.
    await (supabase as unknown as {
      from: (t: string) => { insert: (r: unknown) => Promise<{ error: unknown }> }
    }).from('mrm_engine_divergences').insert(row)
  } catch {
    // Silent fail — logging shadow nunca pode quebrar UX (ADR-001).
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública: runShadowComparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa a comparação shadow entre o resultado canônico do cliente e a
 * resposta da edge function. Fire-and-forget: chame com `void` no caller.
 *
 * Garantias (ADR-001):
 *   - Nunca lança exceção
 *   - Nunca modifica `clientOutput`
 *   - Quando flag está OFF, retorna imediatamente sem nenhum side-effect
 *   - Timeout default = 5000ms
 *
 * @example
 * ```ts
 * const result = calculateMarginReapuration(input)
 * void runShadowComparison(input, result, { tenant_id, document_type: 'budget' })
 * return result // ← cliente prevalece
 * ```
 */
export async function runShadowComparison(
  motorInput: ReapurationInput,
  clientOutput: TaxBreakdown,
  context?: ShadowContext,
): Promise<void> {
  // Fast path: flag OFF → no-op total
  if (!isShadowEnabled()) return

  const startedAt = Date.now()
  const timeoutMs = context?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  try {
    const edgeBody = adaptInputForEdge(motorInput, context)
    const edgeOutcome = await invokeEdgeWithTimeout(edgeBody, timeoutMs)
    const durationMs = Date.now() - startedAt

    if (edgeOutcome.kind !== 'ok') {
      // Edge indisponível: timeout, http_error ou network
      const reason: ShadowErrorReason =
        edgeOutcome.kind === 'timeout'
          ? 'timeout'
          : edgeOutcome.kind === 'http_error'
            ? 'http_error'
            : 'network'

      const errorMsg =
        edgeOutcome.kind === 'timeout'
          ? `shadow_timeout_${timeoutMs}ms`
          : (edgeOutcome as { message: string }).message

      // eslint-disable-next-line no-console
      console.warn('[mrm.shadow] edge unavailable', {
        reason,
        document_type: context?.document_type ?? null,
        document_id: context?.document_id ?? null,
        engine_version_client: MRM_ENGINE_VERSION,
        duration_ms: durationMs,
      })

      await persistDivergence({
        tenant_id: context?.tenant_id ?? null,
        document_id: context?.document_id ?? null,
        document_type: context?.document_type ?? null,
        divergence_type: 'edge_unavailable',
        motor_version_client: MRM_ENGINE_VERSION,
        motor_version_edge: null,
        client_output: clientOutput,
        edge_output: null,
        edge_error: errorMsg,
        error_reason: reason,
        diff_amount: null,
        diff_percent: null,
        fields_diverged: null,
        shadow_duration_ms: durationMs,
        epsilon_used: null,
      })
      return
    }

    // Edge respondeu — tentar adaptar e comparar
    const edgeAdapted = adaptOutputFromEdge(edgeOutcome.data)

    if (!edgeAdapted) {
      // Edge respondeu, mas shape não é comparável (caso comum hoje:
      // calc-tax-engine devolve pricing legado, sem campos MRM)
      await persistDivergence({
        tenant_id: context?.tenant_id ?? null,
        document_id: context?.document_id ?? null,
        document_type: context?.document_type ?? null,
        divergence_type: 'edge_unavailable',
        motor_version_client: MRM_ENGINE_VERSION,
        motor_version_edge: null,
        client_output: clientOutput,
        edge_output: edgeOutcome.data,
        edge_error: 'edge_output_shape_incompatible',
        error_reason: 'http_error',
        diff_amount: null,
        diff_percent: null,
        fields_diverged: null,
        shadow_duration_ms: durationMs,
        epsilon_used: null,
      })
      return
    }

    const comparison = compareMotorResults(clientOutput, edgeAdapted)
    const edgeVersion =
      (edgeAdapted as { engine_version?: string }).engine_version ?? null

    if (comparison.has_divergence) {
      // eslint-disable-next-line no-console
      console.info('[mrm.shadow] divergence detected', {
        document_type: context?.document_type ?? null,
        document_id: context?.document_id ?? null,
        engine_version_client: MRM_ENGINE_VERSION,
        engine_version_edge: edgeVersion,
        diff_amount: comparison.diff_amount,
        diff_percent: comparison.diff_percent,
        epsilon_used: comparison.epsilon_used,
        fields_diverged: comparison.fields_diverged,
        duration_ms: durationMs,
      })

      await persistDivergence({
        tenant_id: context?.tenant_id ?? null,
        document_id: context?.document_id ?? null,
        document_type: context?.document_type ?? null,
        divergence_type: 'numeric_divergence',
        motor_version_client: MRM_ENGINE_VERSION,
        motor_version_edge: edgeVersion,
        client_output: clientOutput,
        edge_output: edgeAdapted,
        edge_error: null,
        error_reason: null,
        diff_amount: comparison.diff_amount,
        diff_percent: comparison.diff_percent,
        fields_diverged: comparison.fields_diverged,
        shadow_duration_ms: durationMs,
        epsilon_used: comparison.epsilon_used,
      })
    }
    // Sem divergência: NÃO persistimos (dashboard só precisa de divergências).
  } catch (err: unknown) {
    // Última linha de defesa — qualquer exception aqui é tratada como
    // shadow_exception. NUNCA propaga pro caller.
    const durationMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : String(err)

    try {
      await persistDivergence({
        tenant_id: context?.tenant_id ?? null,
        document_id: context?.document_id ?? null,
        document_type: context?.document_type ?? null,
        divergence_type: 'shadow_exception',
        motor_version_client: MRM_ENGINE_VERSION,
        motor_version_edge: null,
        client_output: clientOutput,
        edge_output: null,
        edge_error: message,
        error_reason: 'shadow_exception',
        diff_amount: null,
        diff_percent: null,
        fields_diverged: null,
        shadow_duration_ms: durationMs,
        epsilon_used: null,
      })
    } catch {
      // Engole — não há mais nada que possamos fazer.
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Marker exportado para telemetria/diagnóstico
// ─────────────────────────────────────────────────────────────────────────────

export const MRM_SHADOW_HELPER_VERSION = MRM_ENGINE_VERSION
