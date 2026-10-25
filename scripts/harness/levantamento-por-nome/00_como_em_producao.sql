-- HARNESS do levantamento por nome (migração 20261025000003) — o banco MÍNIMO, como em produção.
-- NÃO TOCA PRODUÇÃO. Imita do Supabase os papéis e os DEFAULT PRIVILEGES que dão TUDO a anon e
-- authenticated em tabela nova: sem eles, o REVOKE da migração passaria verde sem ter o que revogar
-- (`portao-que-nao-alcanca.md`). `orcamentista_remetente_autorizado` com as colunas e as constraints
-- medidas em produção em 25/10/2026 (information_schema e pg_constraint), menos a FK de employees.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.orcamentista_remetente_autorizado (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  telefone text NOT NULL,
  nome text,
  employee_id uuid,
  ativo boolean NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_remetente_autorizado_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_remetente_autorizado_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT orcamentista_remetente_autorizado_telefone_key UNIQUE (tenant_id, telefone),
  CONSTRAINT orcamentista_remetente_autorizado_telefone_check CHECK (telefone ~ '^[0-9]{10,13}$'),
  CONSTRAINT orcamentista_remetente_autorizado_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE
);

-- dois tenants; no A, dois vendedores; no B, um
INSERT INTO public.tenants VALUES ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b');
INSERT INTO public.orcamentista_remetente_autorizado (id, tenant_id, telefone, ativo) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', '5551999990001', true),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', '5551999990002', true),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', '5551999990003', true);
