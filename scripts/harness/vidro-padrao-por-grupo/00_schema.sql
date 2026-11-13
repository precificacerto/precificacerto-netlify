-- O mínimo que a 20261113000001 pressupõe, RECONSTRUÍDO das consultas a produção de 13/11/2026 (só as colunas que ela toca).
-- Os papéis e o privilégio padrão do papel postgres no schema public são os medidos (pg_default_acl): toda tabela nova dá arwdDxtm a
-- authenticated e a service_role. `is_super_admin()` lê um GUC do harness (`harness.sa`) no lugar do JWT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.users (id uuid PRIMARY KEY);
CREATE TABLE public.orcamentista_materia_prima (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id), familia text, nome text NOT NULL,
  CONSTRAINT orcamentista_materia_prima_id_tenant_key UNIQUE (id, tenant_id));
CREATE TABLE public.orcamentista_tabela (id uuid PRIMARY KEY, categoria_chave text);
CREATE TABLE public.orcamentista_tabela_item (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tabela_id uuid NOT NULL REFERENCES public.orcamentista_tabela(id), codigo text NOT NULL);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('harness.sa', true), '') = '1' $$;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;
-- o estado medido: a De Paula, a matéria-prima PVC, a tabela VIDRO da Estrela com os dois códigos (e o VIN04, cancelado, que não é semente)
INSERT INTO public.tenants VALUES ('20e08592-f957-4e72-b7eb-251387e34eb9'), ('11111111-1111-1111-1111-111111111111');
INSERT INTO public.orcamentista_materia_prima VALUES ('79d764fe-4acd-43e2-bed9-38e20667ca3d', '20e08592-f957-4e72-b7eb-251387e34eb9', 'PVC', 'Esquadrias de PVC WOLF');
INSERT INTO public.orcamentista_tabela VALUES ('4cf12fb8-24dc-4277-87e6-f6f9739b8cfe', 'VIDRO');
INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo) VALUES
  ('4cf12fb8-24dc-4277-87e6-f6f9739b8cfe', 'VIN04'), ('4cf12fb8-24dc-4277-87e6-f6f9739b8cfe', 'VIN05'), ('4cf12fb8-24dc-4277-87e6-f6f9739b8cfe', 'VBO3,4');
