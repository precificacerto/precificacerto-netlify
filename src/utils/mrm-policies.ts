/**
 * MRM Policies — Camada de decisão (ADR-004 / Story MRM-V2-S2.3 / Story MRM-V5-003)
 *
 * Esta camada existe para SEPARAR cálculo de POLÍTICA:
 *   - Motor (`margin-reapuration.ts`): PURO, apenas calcula RRO. Nunca bloqueia.
 *     Pode expor `rro_threshold_check` (observacional, NÃO decisório — V5-003).
 *   - Policy (este arquivo): aplica regras de UX/negócio em cima do resultado do
 *     motor — decide se a UI deve BLOQUEAR save, AVISAR ou PERMITIR sem ressalva.
 *
 * Story MRM-V5-003: policy consome `breakdown.status` (e opcionalmente
 * `breakdown.rro_threshold_check` para feedback visual leve). NÃO recalcula
 * invariantes — apenas mapeia status para ação.
 *
 * Defaults aprovados (ADR-004, decisão Q1):
 *   - `sales`           + status RRO_NEGATIVE/RRO_ZERO   → `block_save`
 *   - `budgets`/`orders` + status RRO_NEGATIVE/RRO_ZERO  → `warn` + `requires_review=true`
 *   - qualquer documento + status VALID                  → `allow`
 *   - qualquer documento + status ERROR                  → `block_save` (decisão segura)
 *
 * Overrides por tenant (tenant_expense_config):
 *   - `rro_policy = 'strict'`     → bloqueia em TODOS os documentos quando RRO ≤ 0
 *   - `rro_policy = 'permissive'` → só avisa em TODOS (não bloqueia nem vendas)
 *
 * Esta função é PURA: sem I/O, sem fetch, sem console — apenas (input) → (output).
 * Toda configuração contextual chega via parâmetros.
 */

import type { ReapurationStatus, TaxBreakdown } from '@/types/mrm'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export type MrmAction = 'block_save' | 'warn' | 'allow'

export type DocumentType = 'budget' | 'order' | 'sale'

/**
 * Override por tenant. Mantido opcional — quando ausente, prevalecem os
 * defaults do ADR-004.
 *   - 'strict'     → bloqueia em todos os documentos quando RRO ≤ 0
 *   - 'permissive' → apenas avisa (não bloqueia) em todos os documentos
 */
export type RroPolicy = 'strict' | 'permissive'

export interface TenantPolicySettings {
  rro_policy?: RroPolicy
}

/**
 * Resultado mínimo do motor que a policy consome. Aceita o `TaxBreakdown` completo
 * (saída de `calculateMarginReapuration`) ou um shape compatível só com status/rro.
 */
export type MotorResultLike = Pick<TaxBreakdown, 'rro' | 'status'>

export interface PolicyInput {
  motorResult: MotorResultLike
  documentType: DocumentType
  userRole?: string
  tenantSettings?: TenantPolicySettings
}

export interface PolicyDecision {
  action: MrmAction
  /** Mensagem orientativa pronta para a UI. Vazia quando `action === 'allow'`. */
  message: string
  /** Flag a persistir junto ao documento (budgets/orders/sales.requires_review). */
  requires_review: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensagens
// ─────────────────────────────────────────────────────────────────────────────

const MSG_BLOCK_SALE =
  'RRO negativa ou zero — venda não pode ser salva. Revise o desconto ou os parâmetros de custo.'
const MSG_WARN_BUDGET_ORDER =
  'RRO negativa ou zero — revise antes de aprovar. Documento será marcado como "Requer revisão".'
const MSG_BLOCK_ERROR =
  'Cálculo MRM retornou ERROR. Save bloqueado por segurança. Acione o suporte se persistir.'
const MSG_ALLOW = ''

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos (puros)
// ─────────────────────────────────────────────────────────────────────────────

function isNonPositiveRroStatus(status: ReapurationStatus): boolean {
  return status === 'RRO_NEGATIVE' || status === 'RRO_ZERO'
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide a ação que a UI deve tomar com base no resultado do motor MRM, no
 * tipo do documento e nas configurações do tenant.
 *
 * Pure function — não lê nem escreve em nenhum lugar. Pode ser invocada em
 * qualquer ponto (handler de submit, useMemo de UI, simulador "e se?", etc.).
 */
export function decideMrmAction(input: PolicyInput): PolicyDecision {
  const { motorResult, documentType, tenantSettings } = input
  const status = motorResult.status

  // ERROR: bloqueia por segurança. Não há decisão a fazer.
  if (status === 'ERROR') {
    return {
      action: 'block_save',
      message: MSG_BLOCK_ERROR,
      requires_review: true,
    }
  }

  // VALID: sempre permite. Nenhum tenant override deve mudar isso.
  if (status === 'VALID') {
    return {
      action: 'allow',
      message: MSG_ALLOW,
      requires_review: false,
    }
  }

  // Demais estados (PENDING etc) sem RRO ≤ 0 → tratamos como allow para
  // não bloquear fluxos legítimos do motor antigo. Apenas RRO_ZERO/NEGATIVE
  // têm tratamento especial abaixo.
  if (!isNonPositiveRroStatus(status)) {
    return {
      action: 'allow',
      message: MSG_ALLOW,
      requires_review: false,
    }
  }

  // ── A partir daqui: status é RRO_ZERO ou RRO_NEGATIVE ──

  const tenantPolicy = tenantSettings?.rro_policy

  // Tenant strict: bloqueia em todos os documentos.
  if (tenantPolicy === 'strict') {
    return {
      action: 'block_save',
      message: documentType === 'sale' ? MSG_BLOCK_SALE : MSG_WARN_BUDGET_ORDER,
      requires_review: true,
    }
  }

  // Tenant permissive: apenas avisa, mesmo em vendas.
  if (tenantPolicy === 'permissive') {
    return {
      action: 'warn',
      message: MSG_WARN_BUDGET_ORDER,
      requires_review: true,
    }
  }

  // Defaults ADR-004 (Q1):
  if (documentType === 'sale') {
    return {
      action: 'block_save',
      message: MSG_BLOCK_SALE,
      requires_review: true,
    }
  }

  // budgets / orders → warn
  return {
    action: 'warn',
    message: MSG_WARN_BUDGET_ORDER,
    requires_review: true,
  }
}

/**
 * Mensagens exportadas para reaproveitamento em testes e UI sem hardcode.
 */
export const MRM_POLICY_MESSAGES = {
  BLOCK_SALE: MSG_BLOCK_SALE,
  WARN_BUDGET_ORDER: MSG_WARN_BUDGET_ORDER,
  BLOCK_ERROR: MSG_BLOCK_ERROR,
  ALLOW: MSG_ALLOW,
} as const
