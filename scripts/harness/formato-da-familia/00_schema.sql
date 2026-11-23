-- O minimo que a 20261123000001 pressupoe, com as colunas medidas em producao em 23/11/2026 e o estado da De Paula (a materia-prima PVC, conta
-- FABRICACAO). Os papeis e o privilegio padrao do papel postgres no schema public sao os de producao (funcoes novas dao EXECUTE a anon, authenticated
-- e service_role, e o REVOKE so de PUBLIC nao os alcanca).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.users (id uuid PRIMARY KEY);
CREATE TABLE public.orcamentista_config (tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id), modelo text);
-- as colunas de producao: id, tenant_id, nome, ordem, atualizado_por, atualizado_em, familia
CREATE TABLE public.orcamentista_materia_prima (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id), nome text NOT NULL, ordem int,
  atualizado_por uuid REFERENCES public.users(id), atualizado_em timestamptz DEFAULT now(), familia text);
CREATE TABLE public.superadmin_alteracao_log (id bigserial PRIMARY KEY, tenant_id uuid, tabela text, chave text, antes jsonb, depois jsonb, por uuid, em timestamptz DEFAULT now());
INSERT INTO public.tenants VALUES ('20e08592-f957-4e72-b7eb-251387e34eb9'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.users VALUES ('44444444-4444-4444-4444-444444444444');
INSERT INTO public.orcamentista_config VALUES ('20e08592-f957-4e72-b7eb-251387e34eb9', 'FABRICACAO');
INSERT INTO public.orcamentista_materia_prima (id, tenant_id, nome, ordem, familia) VALUES
  ('79d764fe-4acd-43e2-bed9-38e20667ca3d', '20e08592-f957-4e72-b7eb-251387e34eb9', 'Esquadrias de PVC WOLF', 1, 'PVC');
