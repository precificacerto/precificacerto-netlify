-- BASE do harness da 20261117000001: o que a migração pressupõe, como em produção em 17/11/2026 (medido pelo conector).
-- Os papéis do Supabase, o privilégio padrão do postgres no schema public (pg_default_acl: authenticated e service_role com tudo), tenants e
-- orcamentista_orcamento_item com a UNIQUE (id, tenant_id) que a FK composta usa. Dois tenants e um item em cada.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
CREATE TABLE public.tenants (id uuid PRIMARY KEY, name text);
CREATE TABLE public.orcamentista_orcamento_item (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id), ordem int NOT NULL,
  CONSTRAINT orcamentista_orcamento_item_id_tenant_key UNIQUE (id, tenant_id)
);
INSERT INTO public.tenants VALUES ('00000000-0000-4000-8000-0000000000a1', 'A'), ('00000000-0000-4000-8000-0000000000b2', 'B');
INSERT INTO public.orcamentista_orcamento_item VALUES ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000a1', 1),
                                                     ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-0000000000b2', 1);
