-- Migration: a redução deixa de ser UM fator e passa a ser DOIS — a travessia
--            aditiva do valor que já existe
--
-- ══════════════════════════════════════════════════════════════════════════
-- DEPENDE DE `20260916000002_classificacao_fiscal_em_products.sql`
-- ══════════════════════════════════════════════════════════════════════════
-- Aquela cria `iva_reduction_ibs_pct` e `iva_reduction_cbs_pct` em `products` e
-- em `services`. Esta as PREENCHE com o que `iva_dual_reduction_factor` já tem.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ADITIVA. A COLUNA ANTIGA FICA.
-- ══════════════════════════════════════════════════════════════════════════
-- Decisão do dono do produto, registrada como está:
--
--   > A migração das reduções é aditiva: as duas colunas novas recebem o valor
--   > atual de `iva_dual_reduction_factor`, e a antiga FICA. Nada de DROP nesta
--   > rodada — o produto com fator 50 não pode perder o valor.
--
-- NENHUM DROP, NENHUM ALTER, NENHUMA COLUNA REMOVIDA. Depois deste arquivo o
-- mesmo valor existe em dois lugares, de propósito: é o que permite medir o
-- motor novo contra o antigo antes de qualquer remoção. A remoção, se vier, é
-- rodada própria, depois de a fiação estar em produção e medida.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ESTADO MEDIDO ANTES — consulta ao banco em 16/09/2026, não à memória
-- ══════════════════════════════════════════════════════════════════════════
-- `estado-relatado-vs-real.md`: afirmação sobre estado de sistema externo exige
-- consulta à fonte primária antes de virar premissa. A consulta foi feita:
--
--   tabela    | linhas | com `iva_dual_reduction_factor` | valores distintos
--   ----------+--------+---------------------------------+------------------
--   products  |    163 |                               1 | 50
--   services  |     10 |                               0 | —
--
-- ESTE ARQUIVO ATUALIZA UMA LINHA. Uma. O produto com fator 50 passa a ter 50
-- no IBS e 50 na CBS, e é exatamente por isso que ele é o caso que importa: com
-- as duas reduções IGUAIS o coeficiente `c` tem de sair IDÊNTICO ao de hoje, e
-- é essa a regressão que protege a base instalada.
--
-- As outras 162 linhas de `products` e as 10 de `services` têm o fator em NULL e
-- continuam com NULL nas duas colunas novas. NULL não vira zero aqui: seria
-- afirmar "sem redução" onde ninguém classificou — `ausente-vs-falso.md`, e a
-- mesma razão pela qual a R4 distingue `NULL` (não classificado) de `0`
-- (integral, regime regular).
--
-- ══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENTE, E A GUARDA NÃO É DECORATIVA
-- ══════════════════════════════════════════════════════════════════════════
-- O `WHERE` exige que as duas colunas novas estejam VAZIAS. Reaplicar este
-- arquivo depois de alguém ter classificado um produto pelo cClassTrib
-- SOBRESCREVERIA a redução derivada da tabela oficial com o fator legado — que é
-- justamente a direção errada da travessia. A guarda impede isso.

BEGIN;

UPDATE products
SET iva_reduction_ibs_pct = iva_dual_reduction_factor,
    iva_reduction_cbs_pct = iva_dual_reduction_factor
WHERE iva_dual_reduction_factor IS NOT NULL
  AND iva_reduction_ibs_pct IS NULL
  AND iva_reduction_cbs_pct IS NULL;

UPDATE services
SET iva_reduction_ibs_pct = iva_dual_reduction_factor,
    iva_reduction_cbs_pct = iva_dual_reduction_factor
WHERE iva_dual_reduction_factor IS NOT NULL
  AND iva_reduction_ibs_pct IS NULL
  AND iva_reduction_cbs_pct IS NULL;

COMMENT ON COLUMN products.iva_dual_reduction_factor IS
  'LEGADO a partir de 16/09/2026. O fator único foi copiado para iva_reduction_ibs_pct e iva_reduction_cbs_pct, que são as colunas vivas: a redução DECORRE do cClassTrib e é DOIS números, porque a tabela oficial os separa (o código 200025 tem 60 no IBS e 100 na CBS). Esta coluna FICA e não foi removida — a remoção é rodada própria, depois de a fiação estar em produção e medida.';

COMMENT ON COLUMN services.iva_dual_reduction_factor IS
  'LEGADO a partir de 16/09/2026. Ver o comentário homônimo em products.iva_dual_reduction_factor.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO — obrigatória, e NÃO é o retorno do comando de aplicação
-- ─────────────────────────────────────────────────────────────────────────
--   select 'products' as tabela,
--          count(*) filter (where iva_dual_reduction_factor is not null) as legado,
--          count(*) filter (where iva_reduction_ibs_pct is not null)     as ibs,
--          count(*) filter (where iva_reduction_cbs_pct is not null)     as cbs,
--          count(*) filter (where iva_dual_reduction_factor is distinct from iva_reduction_ibs_pct
--                              or iva_dual_reduction_factor is distinct from iva_reduction_cbs_pct) as divergentes
--   from products
--   union all
--   select 'services',
--          count(*) filter (where iva_dual_reduction_factor is not null),
--          count(*) filter (where iva_reduction_ibs_pct is not null),
--          count(*) filter (where iva_reduction_cbs_pct is not null),
--          count(*) filter (where iva_dual_reduction_factor is distinct from iva_reduction_ibs_pct
--                              or iva_dual_reduction_factor is distinct from iva_reduction_cbs_pct)
--   from services;
--
-- Espera, logo após aplicar e ANTES de qualquer classificação pelo cClassTrib:
--   products  → legado 1, ibs 1, cbs 1, divergentes 0
--   services  → legado 0, ibs 0, cbs 0, divergentes 0
--
-- `divergentes` maior que zero DEPOIS de alguém classificar pelo cClassTrib é
-- ESPERADO e correto: é a redução oficial substituindo o fator legado. Esta
-- consulta só tem a leitura acima na janela entre aplicar e classificar.
--
--   NOTIFY pgrst, 'reload schema';
