-- Migration: Fator de Redução IVA Dual — referência bruta POR PRODUTO/SERVIÇO (ADR-022)
-- Correção (LC 214/2025): a alíquota efetiva de IBS/CBS = referência_bruta × (1 − fator/100).
-- A referência bruta era lida apenas de tenant_settings no instante do cadastro (acoplamento
-- temporal frágil → fator era ignorado quando a referência não estava carregada). Agora cada
-- produto/serviço SNAPSHOTA a referência bruta usada, tornando a derivação determinística e
-- idempotente (fonte da verdade = referência_bruta + iva_dual_reduction_factor).
--
-- Escala: PERCENTUAL (mesma de ibs_pct/cbs_pct — ex.: 0.1 = 0,1%). NULL = produto legado
-- (sem snapshot) → o motor usa ibs_pct/cbs_pct salvo (já efetivo), preservando o valor atual
-- sem dupla redução e sem backfill (só daqui pra frente).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ibs_reference_pct NUMERIC(8,5),
  ADD COLUMN IF NOT EXISTS cbs_reference_pct NUMERIC(8,5);

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS ibs_reference_pct NUMERIC(8,5),
  ADD COLUMN IF NOT EXISTS cbs_reference_pct NUMERIC(8,5);

COMMENT ON COLUMN products.ibs_reference_pct IS 'Alíquota BRUTA de referência do IBS (percentual) snapshot no cadastro; efetiva = referência × (1 − iva_dual_reduction_factor/100). NULL = legado.';
COMMENT ON COLUMN products.cbs_reference_pct IS 'Alíquota BRUTA de referência do CBS (percentual) snapshot no cadastro; efetiva = referência × (1 − iva_dual_reduction_factor/100). NULL = legado.';
COMMENT ON COLUMN services.ibs_reference_pct IS 'Alíquota BRUTA de referência do IBS (percentual) snapshot no cadastro; efetiva = referência × (1 − iva_dual_reduction_factor/100). NULL = legado.';
COMMENT ON COLUMN services.cbs_reference_pct IS 'Alíquota BRUTA de referência do CBS (percentual) snapshot no cadastro; efetiva = referência × (1 − iva_dual_reduction_factor/100). NULL = legado.';
