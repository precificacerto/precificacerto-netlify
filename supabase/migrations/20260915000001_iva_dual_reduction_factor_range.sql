-- Migration: iva_dual_reduction_factor passa a aceitar a faixa [0, 100]
--
-- Motivo. O fator de redução do IVA DUAL é percentual de redução sobre a
-- alíquota original (`alíquota efetiva = original × (1 − fator/100)`), e NÃO é
-- lista fechada: existem vários percentuais de redução além dos da LC 214/2025.
-- A constraint anterior (20260628000001) travava o campo em
-- (30, 40, 50, 60, 70, 80, 100) — o que recusava dois casos legítimos:
--
--   1. qualquer percentual fora da lista, por exemplo 45;
--   2. o ZERO, que é "regime regular, classificado" — distinto de NULL, que é
--      "não classificado". A regra `ausente-vs-falso.md` exige a distinção, e
--      com a constraint antiga ela era impossível de gravar.
--
-- Escopo. SÓ a constraint. Nenhum DROP de coluna, nenhum ALTER COLUMN TYPE,
-- nenhum UPDATE. A coluna segue `integer`, NULL-ável e SEM default: fator
-- fracionário não está em uso, não está na LC 214 e ninguém pediu — se um dia
-- precisar, é migração própria com a demanda real.
--
-- Dados existentes (medidos em produção antes desta migração):
--   products  → 159 linhas com NULL, 1 linha com 50
--   services  →  10 linhas com NULL
-- Todos passam na constraint nova. Nenhuma linha é alterada por este arquivo.

BEGIN;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_iva_dual_reduction_factor_chk;
ALTER TABLE products
  ADD CONSTRAINT products_iva_dual_reduction_factor_chk
  CHECK (iva_dual_reduction_factor IS NULL
         OR (iva_dual_reduction_factor >= 0 AND iva_dual_reduction_factor <= 100));

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_iva_dual_reduction_factor_chk;
ALTER TABLE services
  ADD CONSTRAINT services_iva_dual_reduction_factor_chk
  CHECK (iva_dual_reduction_factor IS NULL
         OR (iva_dual_reduction_factor >= 0 AND iva_dual_reduction_factor <= 100));

COMMENT ON COLUMN products.iva_dual_reduction_factor IS
  'Fator de redução do IVA DUAL, percentual inteiro em [0, 100]. Alíquota efetiva = original × (1 − fator/100). Campo LIVRE, não é lista fechada. NULL = não classificado; 0 = integral, regime regular (classificado). Atalhos da LC 214/2025: 0, 30, 60, 100.';

COMMENT ON COLUMN services.iva_dual_reduction_factor IS
  'Fator de redução do IVA DUAL, percentual inteiro em [0, 100]. Alíquota efetiva = original × (1 − fator/100). Campo LIVRE, não é lista fechada. NULL = não classificado; 0 = integral, regime regular (classificado). Atalhos da LC 214/2025: 0, 30, 60, 100.';

COMMIT;
