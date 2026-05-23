/**
 * Feature Flags — Precifica Certo
 *
 * Central registry of project-wide feature flags. Use this module to gate UI
 * surfaces and behavior that we want to be able to flip quickly (without a
 * deploy) when a regression or rollback need is detected.
 *
 * Convention: keep flag identifiers grouped by domain (e.g. `mrm.*`) and
 * default to the SAFE state (usually `false`). The default flips only when
 * the story that introduces the flag is confirmed stable.
 *
 * Story: MRM-V2-S2.1 — Remover modos legacy PROFIT_REDUCTION/SELLER_REDUCTION da UI
 */

export interface FeatureFlags {
  /**
   * MRM (Motor de Reapuração de Margem) — controla se a UI dos seletores
   * de `discount_mode` em orçamentos/pedidos/vendas ainda exibe as opções
   * legadas `PROFIT_REDUCTION` e `SELLER_REDUCTION`.
   *
   * `false` (default) → apenas `PROPORTIONAL` é oferecido, e qualquer outro
   *                     valor que chegue ao save handler é forçado para
   *                     `PROPORTIONAL` (com log estruturado de auditoria).
   * `true`           → restaura o seletor legado (rollback de emergência,
   *                     mantido por 1 sprint após S2.1).
   *
   * Spec: Decisão R2 (Motor V2). Story MRM-V2-S2.1, ADR-004.
   */
  'mrm.legacy_modes_visible': boolean
  /**
   * MRM Shadow-Mode (Story MRM-V2-S3.1, ADR-001/ADR-005) — habilita a
   * comparação fire-and-forget entre o motor cliente (canônico) e a edge
   * function `calc-tax-engine`. Divergências são persistidas em
   * `mrm_engine_divergences` para gate go/no-go em S3.3.
   *
   * `false` (default) → shadow é no-op total: zero overhead, zero chamadas
   *                     à edge, zero INSERTs em `mrm_engine_divergences`.
   *                     Mantemos default OFF para evitar custo Supabase
   *                     Functions invocations enquanto S3.2 (migration +
   *                     dashboard) ainda está em construção e o DBA ainda
   *                     não autorizou início da janela de coleta.
   * `true`           → shadow ativo: cada execução do motor dispara em
   *                     paralelo uma chamada à edge, compara e loga
   *                     divergências. Cliente PREVALECE sempre. Ativar
   *                     manualmente em produção quando S3.2 estiver pronto.
   *
   * Q4: 30 dias mínimo de coleta antes de HTTP 299 deprecation header.
   */
  'mrm.shadow_mode_enabled': boolean
}

export const FEATURE_FLAGS: FeatureFlags = {
  // Epic MRM-V6 (ADR-009): reverte R2 — 3 modos voltam habilitados por padrão.
  // Mantemos a flag por compatibilidade com call sites legados de `coerceLegacyDiscountMode`,
  // mas o novo fluxo do orchestrator persiste o modo escolhido sem coerção.
  'mrm.legacy_modes_visible': true,
  'mrm.shadow_mode_enabled': false,
}

/**
 * Lê uma feature flag. Wrapper trivial sobre `FEATURE_FLAGS` para deixar o
 * call site auto-documentado e facilitar trocas futuras por uma fonte
 * remota (ex.: `tenants.feature_flags` ou Edge Config).
 */
export function isFeatureEnabled<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
  return FEATURE_FLAGS[key]
}

/**
 * Conjunto de modos legados de desconto considerados "proibidos" pela
 * Decisão R2 do Motor V2. Exportado para que call sites compartilhem
 * a mesma fonte de verdade ao fazer a coerção `→ PROPORTIONAL`.
 */
export const LEGACY_DISCOUNT_MODES = ['PROFIT_REDUCTION', 'SELLER_REDUCTION'] as const

/**
 * Normaliza um `discount_mode` lido de snapshot persistido para display na UI
 * (Epic MRM-V6 — ADR-009).
 *
 * Snapshots V5 antigos persistiram `'MRM'` (placeholder do motor) — não é um
 * modo válido para o ResidualDistributionBlock filtrar cards. Convertemos:
 *
 *   - `'MRM'` → `'PROPORTIONAL'` (mostrar Comissão + Lucro como padrão)
 *   - `null` / `undefined` → `'PROPORTIONAL'` (default seguro)
 *   - `'SELLER_REDUCTION'` / `'PROFIT_REDUCTION'` / `'PROPORTIONAL'` → preservados
 *
 * Função síncrona, pura, sem side effects.
 */
export function normalizeDiscountModeForDisplay(
  mode: string | null | undefined,
): 'PROPORTIONAL' | 'SELLER_REDUCTION' | 'PROFIT_REDUCTION' {
  if (mode === 'SELLER_REDUCTION' || mode === 'PROFIT_REDUCTION') return mode
  return 'PROPORTIONAL'
}

/**
 * @deprecated Epic MRM-V6 (ADR-009) reverte R2 — coerção não é mais necessária.
 * Mantida apenas para retrocompat de call sites legados que ainda não migraram.
 * Novos call sites devem persistir o modo escolhido sem coerção.
 *
 * Coage `discount_mode` para `PROPORTIONAL` quando o valor recebido é um
 * dos modos legados e a feature flag de visibilidade está desligada. Faz
 * log estruturado (`console.warn`) para viabilizar a auditoria pós-deploy
 * (AC4 da story S2.1).
 */
export function coerceLegacyDiscountMode(
  mode: string | null | undefined,
  context: {
    tenant_id?: string | null
    document_id?: string | null
    surface: 'budget' | 'order' | 'sale'
  },
): string | null | undefined {
  if (mode == null) return mode
  const isLegacy = (LEGACY_DISCOUNT_MODES as readonly string[]).includes(mode)
  if (!isLegacy) return mode
  if (isFeatureEnabled('mrm.legacy_modes_visible')) return mode

  // Log estruturado de auditoria — único ponto de instrumentação por save.
  // eslint-disable-next-line no-console
  console.warn('[mrm.legacy_modes_visible=false] coerced legacy discount_mode → PROPORTIONAL', {
    tenant_id: context.tenant_id ?? null,
    document_id: context.document_id ?? null,
    surface: context.surface,
    original_mode: mode,
    forced_mode: 'PROPORTIONAL',
  })

  return 'PROPORTIONAL'
}
