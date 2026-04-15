-- Migration: LP RET Complete Schema
-- Story: LP-RET-001
-- Epic: LP-RET-PARIDADE-SN
-- Date: 2026-04-15
-- Description: Adiciona campos necessários para LP RET (Lucro Presumido RET) ter paridade
--              com Simples Nacional. NOTA: iss_municipality_rate já existe desde 20260213000000.

-- ============================================================
-- tenant_settings: Campos LP RET
-- ============================================================

ALTER TABLE public.tenant_settings
  -- Alíquota consolidada RET: IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41% = 4%
  -- UNIDADE: decimal 0-1 (ex: 0.04 = 4%). Frontend exibe em % e converte com /100 antes de salvar.
  ADD COLUMN IF NOT EXISTS ret_rate numeric DEFAULT 0.04,

  -- Indica se ISS é calculado separadamente do RET
  -- true = ISS é campo iss_municipality_rate (padrão)
  -- false = ISS já embutido no ret_rate
  ADD COLUMN IF NOT EXISTS ret_iss_separate boolean DEFAULT true,

  -- Tipo de atividade LP RET (conforme Lei 10.931/2004)
  -- Valores válidos: INCORPORACAO_IMOBILIARIA, CONSTRUCAO_CIVIL, PARCELAMENTO_SOLO, CONSTRUCAO_CASAS_POPULARES
  ADD COLUMN IF NOT EXISTS ret_activity_type text DEFAULT 'INCORPORACAO_IMOBILIARIA',

  -- Receita mensal estimada para dashboard e planejamento
  -- UNIDADE: Reais (R$), sem conversão
  ADD COLUMN IF NOT EXISTS ret_estimated_monthly_revenue numeric DEFAULT 0;

-- ============================================================
-- Comentários (documentam unidades e semântica)
-- ============================================================

COMMENT ON COLUMN public.tenant_settings.ret_rate IS
  'Alíquota consolidada LP RET. UNIDADE: decimal 0-1 (0.04 = 4%). '
  'Composta por: IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41%. '
  'Frontend exibe em porcentagem (0-100) e converte com /100 antes de salvar. '
  'Edge function lê decimal 0-1 diretamente. Aplicável a incorporação imobiliária '
  'e construção civil conforme Lei 10.931/2004.';

COMMENT ON COLUMN public.tenant_settings.ret_iss_separate IS
  'Boolean. true = ISS calculado separadamente via iss_municipality_rate (padrão). '
  'false = ISS já embutido no ret_rate (edge case). '
  'Afeta cálculo do coeficiente de precificação de serviços.';

COMMENT ON COLUMN public.tenant_settings.ret_activity_type IS
  'Tipo de atividade LP RET conforme Lei 10.931/2004. '
  'Valores válidos: INCORPORACAO_IMOBILIARIA, CONSTRUCAO_CIVIL, '
  'PARCELAMENTO_SOLO, CONSTRUCAO_CASAS_POPULARES. '
  'Detectado automaticamente por CNAE: 41xx/42xx/43xx = CONSTRUCAO_CIVIL, '
  '68xx = INCORPORACAO_IMOBILIARIA.';

COMMENT ON COLUMN public.tenant_settings.ret_estimated_monthly_revenue IS
  'Receita mensal estimada para dashboard e planejamento LP RET. '
  'UNIDADE: Reais (R$), sem conversão. '
  'Usado para projeções e widgets do dashboard LP RET.';

-- ============================================================
-- items: Campo ret_rate_override (por item — Story LP-RET-006)
-- ============================================================

ALTER TABLE public.items
  -- Override de alíquota RET por item específico
  -- UNIDADE: decimal 0-1. NULL = usa ret_rate do tenant_settings
  ADD COLUMN IF NOT EXISTS ret_rate_override numeric DEFAULT NULL;

COMMENT ON COLUMN public.items.ret_rate_override IS
  'Override de alíquota RET para este item específico. '
  'UNIDADE: decimal 0-1 (ex: 0.04 = 4%). '
  'NULL = usa ret_rate do tenant_settings. '
  'Permite alíquota RET diferente por item (casos especiais de regime por obra).';

-- ============================================================
-- Validação de backward compatibility
-- ============================================================
-- Empresas já cadastradas como LUCRO_PRESUMIDO_RET recebem os defaults automaticamente:
-- ret_rate = 0.04 (4% — alíquota padrão RET)
-- ret_iss_separate = true
-- ret_activity_type = 'INCORPORACAO_IMOBILIARIA'
-- ret_estimated_monthly_revenue = 0
-- Nenhuma migração de dados adicional necessária.

-- ============================================================
-- RLS: Políticas existentes em tenant_settings e items
-- cobrem os novos campos automaticamente (SELECT/UPDATE por tenant_id).
-- Nenhuma policy adicional necessária.
-- ============================================================
