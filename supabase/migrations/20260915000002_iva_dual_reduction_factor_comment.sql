-- Migration: corrige o COMMENT de iva_dual_reduction_factor
--
-- Motivo. A migração anterior (20260915000001) gravou "Campo LIVRE, não é lista
-- fechada", o que a varredura da LC 214/2025 desmentiu: são OITO faixas de
-- redução, e a tela oferece essas oito e só essas.
--
-- O que NÃO muda: a CHECK continua em [0, 100], mais larga que a lista, de
-- propósito. A lista muda com lei nova e constraint enumerada obrigaria migração
-- a cada mudança. A TELA RESTRINGE, O BANCO TOLERA — e é por isso que um fator
-- fora da lista (45, vindo de importação ou API) continua sendo dado legítimo.
--
-- Escopo. SÓ COMMENT. Nenhum ALTER de constraint, nenhum ALTER COLUMN, nenhum
-- UPDATE, nenhuma linha tocada.
--
-- A migração 20260915000001 NÃO foi editada: o texto errado dela é histórico, e
-- reescrever migração já aplicada é mexer em passado. Este arquivo corrige por
-- cima, que é como migração conserta migração.

BEGIN;

COMMENT ON COLUMN products.iva_dual_reduction_factor IS
  'Fator de redução do IVA DUAL, percentual inteiro. Alíquota efetiva = original × (1 − fator/100). LISTA FECHADA na tela — as oito faixas da LC 214/2025: 0, 30, 40, 50, 60, 70, 80, 100. A CHECK aceita [0, 100], mais larga que a lista DE PROPÓSITO: a lista muda com lei nova e constraint enumerada obrigaria migração a cada mudança — a tela restringe, o banco tolera; fator fora da lista (importação, API) é dado legítimo. NULL = não classificado; 0 = integral, regime regular (classificado). As reduções NÃO se acumulam: art. 7º-A da LC 227/2026. Ver .claude/rules/cascata-lucro-real.md, R4.';

COMMENT ON COLUMN services.iva_dual_reduction_factor IS
  'Fator de redução do IVA DUAL, percentual inteiro. Alíquota efetiva = original × (1 − fator/100). LISTA FECHADA na tela — as oito faixas da LC 214/2025: 0, 30, 40, 50, 60, 70, 80, 100. A CHECK aceita [0, 100], mais larga que a lista DE PROPÓSITO: a lista muda com lei nova e constraint enumerada obrigaria migração a cada mudança — a tela restringe, o banco tolera; fator fora da lista (importação, API) é dado legítimo. NULL = não classificado; 0 = integral, regime regular (classificado). As reduções NÃO se acumulam: art. 7º-A da LC 227/2026. Ver .claude/rules/cascata-lucro-real.md, R4.';

COMMIT;
