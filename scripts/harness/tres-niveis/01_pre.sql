-- HARNESS dos três níveis — o que a 20261023000002 e as funções da 20261023000003 pressupõem e o
-- `../base-de-conhecimento/00_base.sql` não tem. NÃO TOCA PRODUÇÃO.
--
-- RECONSTRUÍDO, não extraído: só as colunas que as funções leem. Em produção (medido em
-- 23/10/2026) `orcamentista_config` tem PK `tenant_id` e FK `(modelo, nicho_id)` para
-- `orcamentista_nicho`; `orcamentista_fornecedor` tem `nicho_id` com FK para `orcamentista_nicho`.
CREATE TABLE IF NOT EXISTS public.orcamentista_fornecedor (
  id uuid PRIMARY KEY, nicho_id uuid NOT NULL REFERENCES public.orcamentista_nicho(id), nome text NOT NULL,
  criado_em timestamptz, criado_por uuid
);
CREATE TABLE IF NOT EXISTS public.orcamentista_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE, modelo text,
  nicho_id uuid REFERENCES public.orcamentista_nicho(id)
);
