-- O minimo que a 20261123000002 pressupoe, com as colunas e constraints medidas em producao em 23/11/2026: o catalogo de familias (so a PVC),
-- as ramificacoes, o catalogo de categorias, o orcamento com o indice um_por_levantamento e os 12 orcamentos de teste (familia ausente).
-- Os papeis e o privilegio padrao do postgres no schema public sao os de producao.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.users (id uuid PRIMARY KEY, is_super_admin boolean);
CREATE TABLE public.superadmin_alteracao_log (id bigserial PRIMARY KEY, tenant_id uuid, tabela text, chave text, antes jsonb, depois jsonb, por uuid, em timestamptz DEFAULT now());
CREATE TABLE public.orcamentista_categoria_catalogo (chave text PRIMARY KEY);
CREATE TABLE public.orcamentista_familia_catalogo (chave text PRIMARY KEY, ordem integer NOT NULL, rotulo text NOT NULL,
  CONSTRAINT orcamentista_familia_catalogo_chave_forma CHECK (chave ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  CONSTRAINT orcamentista_familia_catalogo_ordem_key UNIQUE (ordem),
  CONSTRAINT orcamentista_familia_catalogo_ordem_positiva CHECK (ordem >= 1),
  CONSTRAINT orcamentista_familia_catalogo_rotulo_forma CHECK (rotulo = btrim(rotulo) AND length(rotulo) >= 1 AND length(rotulo) <= 60));
CREATE TABLE public.orcamentista_familia_ramificacao (familia text REFERENCES public.orcamentista_familia_catalogo(chave) ON DELETE RESTRICT,
  categoria_chave text REFERENCES public.orcamentista_categoria_catalogo(chave), ordem integer);
-- a auxiliar da 20261103000001: aqui so conta (a garantia da categoria tem harness proprio)
CREATE FUNCTION public.orcamentista_garantir_categorias_da_familia(p_por uuid, p_familia text, p_materia_prima uuid, p_origem text) RETURNS integer
LANGUAGE sql AS $$ SELECT 0 $$;
CREATE TABLE public.orcamentista_orcamento (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, numero integer NOT NULL,
  levantamento_id uuid, nome text NOT NULL, UNIQUE (tenant_id, numero));
CREATE UNIQUE INDEX orcamentista_orcamento_um_por_levantamento ON public.orcamentista_orcamento (levantamento_id) WHERE levantamento_id IS NOT NULL;
INSERT INTO public.users VALUES ('44444444-4444-4444-4444-444444444444', true), ('55555555-5555-5555-5555-555555555555', false);
INSERT INTO public.orcamentista_categoria_catalogo VALUES ('PERFIL'), ('VIDRO');
INSERT INTO public.orcamentista_familia_catalogo VALUES ('PVC', 1, 'De Paula - PVC Wolf');
INSERT INTO public.orcamentista_familia_ramificacao VALUES ('PVC', 'PERFIL', 1), ('PVC', 'VIDRO', 2);
INSERT INTO public.orcamentista_orcamento (tenant_id, numero, levantamento_id, nome)
SELECT '20e08592-f957-4e72-b7eb-251387e34eb9', n, gen_random_uuid(), 'Orcamento ' || n FROM generate_series(1, 12) n;
