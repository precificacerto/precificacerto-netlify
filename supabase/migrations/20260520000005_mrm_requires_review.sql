-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — Story MRM-V2-S2.3
--
-- Coluna `requires_review` em budgets/orders/sales:
--
--   Flag setada pela camada `src/utils/mrm-policies.ts` (decideMrmAction)
--   quando o motor MRM retorna RRO ≤ 0 (RRO_ZERO / RRO_NEGATIVE) em
--   documentos `budgets` ou `orders`. Esses documentos ficam marcados
--   como "Requer revisão" e exibem badge vermelho persistente nas listings
--   até serem revisados/aprovados.
--
--   `sales` NÃO consome essa flag em fluxo normal: o save é BLOQUEADO
--   pela policy quando RRO ≤ 0. A coluna é adicionada na tabela `sales`
--   apenas para suporte a casos edge:
--     - tenants com policy override = 'permissive' (warn em vez de block)
--     - vendas legadas migradas com RRO ≤ 0 antes da implementação
--     - vendas criadas por integração externa que tenham burlado a UI
--   Em todos esses casos, a flag permite auditoria posterior.
--
-- Índice parcial: o caso comum (`requires_review = false`) é o de longe
-- mais frequente. Índice parcial reduz custo de espaço e mantém listing
-- de "documentos pendentes" rápido.
-- =====================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE;

-- Índices parciais (only TRUE rows) para listing de pendentes
CREATE INDEX IF NOT EXISTS idx_budgets_requires_review
  ON public.budgets (tenant_id, created_at DESC)
  WHERE requires_review = TRUE;

CREATE INDEX IF NOT EXISTS idx_orders_requires_review
  ON public.orders (tenant_id, created_at DESC)
  WHERE requires_review = TRUE;

CREATE INDEX IF NOT EXISTS idx_sales_requires_review
  ON public.sales (tenant_id, sale_date DESC)
  WHERE requires_review = TRUE;

COMMENT ON COLUMN public.budgets.requires_review IS
  'MRM S2.3: TRUE quando o motor retornou RRO <= 0 e a policy (mrm-policies.ts) marcou o documento para revisão. UI exibe badge vermelho persistente até revisão manual. Defaults: budgets sempre apenas avisam (warn), nunca bloqueiam.';

COMMENT ON COLUMN public.orders.requires_review IS
  'MRM S2.3: TRUE quando o motor retornou RRO <= 0 e a policy (mrm-policies.ts) marcou o documento para revisão. UI exibe badge vermelho persistente até revisão manual. Defaults: orders sempre apenas avisam (warn), nunca bloqueiam.';

COMMENT ON COLUMN public.sales.requires_review IS
  'MRM S2.3: Flag de auditoria. Sales NÃO usam essa flag no fluxo padrão — a policy BLOQUEIA o save diretamente quando RRO <= 0. Coluna existe para suportar: (a) tenants com override permissive, (b) vendas legadas migradas com RRO <= 0, (c) vendas inseridas por integração externa que tenham burlado a UI.';
