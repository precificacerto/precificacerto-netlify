-- O minimo que a 20261121000003 pressupoe, com as colunas que ela toca (medidas em producao em 21/11/2026) e o estado da De Paula: a materia-prima
-- PVC, os vinculos de fornecedor (Wolf principal em PERFIL; Estrela em VIDRO) e a etapa que aponta o motor da Wolf. Os papeis e o privilegio
-- padrao do papel postgres no schema public sao os de producao (tabelas e funcoes novas dao privilegio a anon, authenticated e service_role).
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
CREATE TABLE public.orcamentista_fornecedor (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.orcamentista_materia_prima (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id), familia text, nome text NOT NULL);
CREATE TABLE public.orcamentista_mp_categoria (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, materia_prima_id uuid NOT NULL, categoria_chave text NOT NULL);
CREATE TABLE public.orcamentista_mp_categoria_fornecedor (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, mp_categoria_id uuid NOT NULL, fornecedor_id uuid NOT NULL, principal boolean, ordem int);
CREATE TABLE public.orcamentista_motor (id uuid PRIMARY KEY, fornecedor_id uuid NOT NULL, nome text);
CREATE TABLE public.orcamentista_familia_etapa (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, materia_prima_id uuid, numero int, motor_id uuid, instrucao text);
CREATE TABLE public.superadmin_alteracao_log (id bigserial PRIMARY KEY, tenant_id uuid, tabela text, chave text, antes jsonb, depois jsonb, por uuid, em timestamptz DEFAULT now());
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('harness.sa', true), '') = '1' $$;
-- o estado: a De Paula (PVC) e outra empresa (ALU); Wolf (perfil e motor), Estrela (vidro), Celsus (so na outra empresa), Veca (motor da outra)
INSERT INTO public.tenants VALUES ('20e08592-f957-4e72-b7eb-251387e34eb9'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.users VALUES ('44444444-4444-4444-4444-444444444444');
INSERT INTO public.orcamentista_fornecedor VALUES ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'Wolf'), ('520b1fb2-8834-421d-88ee-91790fa04bcb', 'Estrela'),
  ('a4acc4f2-d6fd-4bfb-a7d9-4368fe5676da', 'Celsus'), ('55555555-5555-5555-5555-555555555555', 'Veca'), ('66666666-6666-6666-6666-666666666666', 'Motor proprio');
INSERT INTO public.orcamentista_materia_prima VALUES ('79d764fe-4acd-43e2-bed9-38e20667ca3d', '20e08592-f957-4e72-b7eb-251387e34eb9', 'PVC', 'Esquadrias de PVC WOLF'),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'ALU', 'Outra');
INSERT INTO public.orcamentista_mp_categoria VALUES ('c1000000-0000-0000-0000-000000000001', '20e08592-f957-4e72-b7eb-251387e34eb9', '79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PERFIL'),
  ('c1000000-0000-0000-0000-000000000002', '20e08592-f957-4e72-b7eb-251387e34eb9', '79d764fe-4acd-43e2-bed9-38e20667ca3d', 'VIDRO'),
  ('c2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'FERRAGENS');
INSERT INTO public.orcamentista_mp_categoria_fornecedor (tenant_id, mp_categoria_id, fornecedor_id, principal, ordem) VALUES
  ('20e08592-f957-4e72-b7eb-251387e34eb9', 'c1000000-0000-0000-0000-000000000001', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', true, 1),
  ('20e08592-f957-4e72-b7eb-251387e34eb9', 'c1000000-0000-0000-0000-000000000002', '520b1fb2-8834-421d-88ee-91790fa04bcb', true, 1),
  ('22222222-2222-2222-2222-222222222222', 'c2000000-0000-0000-0000-000000000001', 'a4acc4f2-d6fd-4bfb-a7d9-4368fe5676da', true, 1);
INSERT INTO public.orcamentista_motor VALUES ('99999999-9999-9999-9999-999999999991', '66666666-6666-6666-6666-666666666666', 'Motor proprio'),
  ('99999999-9999-9999-9999-999999999992', '55555555-5555-5555-5555-555555555555', 'Motor da Veca');
INSERT INTO public.orcamentista_familia_etapa (tenant_id, materia_prima_id, numero, motor_id) VALUES
  ('20e08592-f957-4e72-b7eb-251387e34eb9', '79d764fe-4acd-43e2-bed9-38e20667ca3d', 1, '99999999-9999-9999-9999-999999999991'),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 1, '99999999-9999-9999-9999-999999999992');
