-- A base do harness da 20261120000001: as tabelas e papéis que a migração lê, na forma medida em produção em 20/11/2026 (só leitura):
-- orcamentista_etapa_catalogo (id, nome, acao, abas, ordem, criado_por, criado_em) com 2 itens; users (is_super_admin); superadmin_alteracao_log.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
-- o privilégio padrão de produção: o que o postgres cria no public dá EXECUTE a authenticated e service_role (medido em 02/11/2026)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
CREATE TABLE public.users (id uuid PRIMARY KEY, is_super_admin boolean);
CREATE TABLE public.superadmin_alteracao_log (id bigserial PRIMARY KEY, tenant_id uuid, tabela text, chave text, antes jsonb, depois jsonb, por uuid, em timestamptz DEFAULT now());
CREATE TABLE public.orcamentista_etapa_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, acao text NOT NULL, abas text[] NOT NULL DEFAULT '{}', ordem integer NOT NULL,
  criado_por uuid, criado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.users VALUES ('00000000-0000-0000-0000-000000000001', true), ('00000000-0000-0000-0000-000000000002', false);
INSERT INTO public.orcamentista_etapa_catalogo (id, nome, acao, abas, ordem) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Gerar o levantamento', 'GERAR_LEVANTAMENTO', '{Variáveis}', 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Calcular as barras e os materiais', 'CALCULAR_BARRAS', '{Perfis}', 2);
