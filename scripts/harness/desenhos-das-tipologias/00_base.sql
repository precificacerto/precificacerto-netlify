-- BASE do harness da 20261111000001 (o índice dos desenhos). NÃO TOCA PRODUÇÃO.
-- Só o que a migração pressupõe, como está em PRODUÇÃO (medido em 11/11/2026, só leitura):
--   - os papéis do Supabase e o PRIVILÉGIO PADRÃO do postgres no schema public (pg_default_acl): tabela, sequência e função criadas pelo
--     postgres dão privilégio a authenticated e service_role. É o que o REVOKE da migração tem de desfazer (a lição da 20261101000002);
--   - is_super_admin() (aqui um esboço: as políticas só precisam que ela exista);
--   - superadmin_alteracao_log com as 8 colunas de produção (id, tenant_id, tabela, chave, antes, depois, por, em).
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.superadmin_alteracao_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NULL,
  tabela text NOT NULL,
  chave text NOT NULL,
  antes jsonb NULL,
  depois jsonb NULL,
  por uuid NULL,
  em timestamptz NOT NULL DEFAULT now()
);
