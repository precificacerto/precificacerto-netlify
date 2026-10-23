-- HARNESS da base de conhecimento — o banco MÍNIMO que as migrações 20261022000003/04 e a de
-- funções pressupõem. NÃO TOCA PRODUÇÃO.
--
-- O que imita do Supabase, e por quê:
--   - os papéis anon, authenticated e service_role;
--   - os DEFAULT PRIVILEGES que dão TUDO a anon e authenticated em tabela E FUNÇÃO nova. É esse
--     padrão que deixou nove funções SECURITY DEFINER abertas em 21/10/2026: sem ele aqui, o
--     REVOKE da migração passaria verde sem ter o que revogar (`portao-que-nao-alcanca.md`).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.users (id uuid PRIMARY KEY, tenant_id uuid NULL, role text NULL, is_super_admin boolean NULL);
CREATE TABLE public.employees (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id), name text NOT NULL, user_id uuid UNIQUE
);
CREATE TABLE public.orcamentista_nicho (id uuid PRIMARY KEY, modelo text NOT NULL, nome text NOT NULL);
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS 'select false';
