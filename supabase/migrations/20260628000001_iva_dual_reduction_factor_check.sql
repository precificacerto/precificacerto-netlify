-- Migration: CHECK constraint para iva_dual_reduction_factor (Relatório de Correção v2.0, Item 02)
-- LC 214/2025 — 7 faixas válidas do Fator de Redução do IVA Dual: 30, 40, 50, 60, 70, 80, 100.
-- A UI (dropdown em products/services) já restringe a esses valores; esta constraint trava a
-- integridade no banco (defesa server-side). NULL é permitido (produto/serviço sem fator).
-- Idempotente: dropa a constraint antiga (se existir) antes de recriar.

ALTER TABLE products  DROP CONSTRAINT IF EXISTS products_iva_dual_reduction_factor_chk;
ALTER TABLE products
  ADD CONSTRAINT products_iva_dual_reduction_factor_chk
  CHECK (iva_dual_reduction_factor IS NULL
         OR iva_dual_reduction_factor IN (30, 40, 50, 60, 70, 80, 100));

ALTER TABLE services  DROP CONSTRAINT IF EXISTS services_iva_dual_reduction_factor_chk;
ALTER TABLE services
  ADD CONSTRAINT services_iva_dual_reduction_factor_chk
  CHECK (iva_dual_reduction_factor IS NULL
         OR iva_dual_reduction_factor IN (30, 40, 50, 60, 70, 80, 100));
