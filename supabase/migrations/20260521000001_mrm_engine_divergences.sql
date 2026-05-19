-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S3.2 / Engine Divergences Log
--
-- Tabela append-only de divergências numéricas/runtime entre motor cliente
-- V2 (TypeScript em src/utils/mrm/) e edge function legado durante a janela
-- de 30d shadow-mode (ADR-001 / ADR-005).
--
-- Populada por src/utils/mrm-shadow.ts (S3.1) toda vez que:
--   - numeric_divergence: outputs diferem além de tolerância
--   - edge_unavailable:   edge function retornou erro / timeout / 5xx
--   - shadow_exception:   exceção inesperada no wrapper shadow
--
-- Consumida por:
--   - /admin/mrm-divergences (dashboard super-admin)
--   - /api/cron/check-mrm-divergences (alerting hourly)
--   - decisão go/no-go S3.3 (critério: 7 dias consecutivos com ZERO rows
--     onde diff_percent > 0.01 OR diff_amount > 0.50)
--
-- RLS:
--   - SELECT: tenant_id próprio OU super_admin
--   - INSERT: tenant próprio (cliente shadow autenticado escreve) OR
--             tenant_id NULL (saves anônimos durante diagnose) OR super_admin
--   - UPDATE/DELETE: bloqueado para autenticados; super_admin pode (cleanup)
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mrm_engine_divergences (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id           UUID NULL,
  document_type         TEXT NULL,
  divergence_type       TEXT NOT NULL,
  motor_version_client  TEXT NULL,
  motor_version_edge    TEXT NULL,
  client_output         JSONB NULL,
  edge_output           JSONB NULL,
  edge_error            TEXT NULL,
  diff_amount           NUMERIC(18,6) NULL,
  diff_percent          NUMERIC(10,6) NULL,
  fields_diverged       TEXT[] NULL,
  shadow_duration_ms    INT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mrm_engine_divergences_doc_type_chk
    CHECK (document_type IN ('budget','order','sale') OR document_type IS NULL),
  CONSTRAINT mrm_engine_divergences_type_chk
    CHECK (divergence_type IN ('numeric_divergence','edge_unavailable','shadow_exception'))
);

-- ---------------------------------------------------------------------
-- Indexes — otimizados para queries do dashboard e alerting
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mrm_divergences_created_at
  ON public.mrm_engine_divergences(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrm_divergences_tenant_created
  ON public.mrm_engine_divergences(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrm_divergences_type
  ON public.mrm_engine_divergences(divergence_type, created_at DESC);

-- Partial index: somente rows críticas (acima dos thresholds go/no-go ADR-005).
-- Acelera queries do critério de deprecação e do alerting.
CREATE INDEX IF NOT EXISTS idx_mrm_divergences_critical
  ON public.mrm_engine_divergences(created_at DESC)
  WHERE diff_percent > 0.01 OR diff_amount > 0.50;

-- Index extra para o "top tenants" do dashboard.
CREATE INDEX IF NOT EXISTS idx_mrm_divergences_tenant_diff
  ON public.mrm_engine_divergences(tenant_id, diff_percent DESC, created_at DESC);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.mrm_engine_divergences ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant próprio (via users.tenant_id) OU super_admin.
-- Padrão idêntico ao mrm_legacy_audit_log (S2.2) que já está em produção.
DROP POLICY IF EXISTS "mrm_engine_divergences_select_tenant_or_super"
  ON public.mrm_engine_divergences;
CREATE POLICY "mrm_engine_divergences_select_tenant_or_super"
  ON public.mrm_engine_divergences
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR public.is_super_admin()
  );

-- INSERT: cliente shadow autenticado escreve para o próprio tenant.
-- Permitimos tenant_id IS NULL para casos onde o tenant ainda não foi resolvido
-- (ex.: divergência detectada antes de o contexto estar pleno). Super_admin
-- também pode (debug). Service role bypassa RLS automaticamente.
DROP POLICY IF EXISTS "mrm_engine_divergences_insert_tenant_or_super"
  ON public.mrm_engine_divergences;
CREATE POLICY "mrm_engine_divergences_insert_tenant_or_super"
  ON public.mrm_engine_divergences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR tenant_id IS NULL
    OR public.is_super_admin()
  );

-- UPDATE: bloqueado para usuários comuns; super_admin pode (cleanup ocasional).
DROP POLICY IF EXISTS "mrm_engine_divergences_update_super_only"
  ON public.mrm_engine_divergences;
CREATE POLICY "mrm_engine_divergences_update_super_only"
  ON public.mrm_engine_divergences
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- DELETE: bloqueado para usuários comuns; super_admin pode (retenção/cleanup).
DROP POLICY IF EXISTS "mrm_engine_divergences_delete_super_only"
  ON public.mrm_engine_divergences;
CREATE POLICY "mrm_engine_divergences_delete_super_only"
  ON public.mrm_engine_divergences
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Comentários
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.mrm_engine_divergences IS
  'MRM S3.1/S3.2 — log append-only de divergências cliente V2 vs edge legado durante shadow-mode (ADR-001/005). '
  'Critério go S3.3: 7 dias consecutivos com ZERO rows onde diff_percent > 0.01 OR diff_amount > 0.50.';

COMMENT ON COLUMN public.mrm_engine_divergences.divergence_type IS
  'numeric_divergence (outputs diferem) | edge_unavailable (edge offline/erro) | shadow_exception (erro inesperado wrapper).';

COMMENT ON COLUMN public.mrm_engine_divergences.diff_amount IS
  'Diferença absoluta em R$ entre o total cliente e o total edge (valor positivo).';

COMMENT ON COLUMN public.mrm_engine_divergences.diff_percent IS
  'Diferença percentual: diff_amount / max(|client_total|, |edge_total|). Em pontos percentuais (0.01 = 1%).';

COMMENT ON COLUMN public.mrm_engine_divergences.fields_diverged IS
  'Array de chaves dos campos do output que divergiram (ex.: ["total","margem","comissao"]).';

COMMENT ON COLUMN public.mrm_engine_divergences.shadow_duration_ms IS
  'Tempo total do wrapper shadow (cliente + edge + comparação) em ms — observabilidade.';

COMMIT;
