-- O ESTADO DE PRODUÇÃO de 03/11/2026 (medido só leitura) que a 20261103000002 encontra, sobre a base da garantia (20261103000001 aplicada).
-- A base do arrasto tinha as três tabelas de vidro, ferragem e acabamento como esboço (id, mp_categoria_id, ordem): aqui elas voltam com a
-- estrutura de produção (colunas, defaults, CHECKs, UNIQUEs e FKs lidos de pg_attribute e pg_constraint), as funções de gravação entram com os
-- corpos de produção (corpos-de-producao/, md5 conferido no run.sh), e a De Paula ganha o conteúdo medido: a config do Perfil, do Reforço e
-- dos Acessórios e as 4 + 4 + 3 linhas, com os ids de produção.
\set ON_ERROR_STOP 1

-- as UNIQUEs de produção que as FKs compostas das três tabelas apontam
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_mp_categoria_id_tenant_key') THEN
    ALTER TABLE public.orcamentista_mp_categoria ADD CONSTRAINT orcamentista_mp_categoria_id_tenant_key UNIQUE (id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_mp_categoria_id_tenant_categoria_key') THEN
    ALTER TABLE public.orcamentista_mp_categoria ADD CONSTRAINT orcamentista_mp_categoria_id_tenant_categoria_key UNIQUE (id, tenant_id, categoria_chave);
  END IF;
END $$;

DROP TABLE IF EXISTS public.orcamentista_mp_vidro, public.orcamentista_mp_ferragem, public.orcamentista_mp_instalacao;
CREATE TABLE public.orcamentista_mp_vidro (
  id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, mp_categoria_id uuid NOT NULL, categoria_chave text NOT NULL,
  descricao text NOT NULL, referencia text, onde_predomina text[], ordem integer NOT NULL,
  CONSTRAINT orcamentista_mp_vidro_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_mp_vidro_categoria_vidro CHECK (categoria_chave = 'VIDRO'),
  CONSTRAINT orcamentista_mp_vidro_mp_categoria_fk FOREIGN KEY (mp_categoria_id, tenant_id, categoria_chave)
    REFERENCES public.orcamentista_mp_categoria (id, tenant_id, categoria_chave) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_vidro_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE);
CREATE TABLE public.orcamentista_mp_ferragem (
  id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, mp_categoria_id uuid NOT NULL, categoria_chave text NOT NULL,
  tipologia text NOT NULL, posicao text, referencia text NOT NULL, descricao text, cor text, par_inox_referencia text, ordem integer NOT NULL,
  CONSTRAINT orcamentista_mp_ferragem_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_mp_ferragem_categoria_ferragens CHECK (categoria_chave = 'FERRAGENS'),
  CONSTRAINT orcamentista_mp_ferragem_posicao_valida CHECK (posicao IS NULL OR posicao = ANY (ARRAY['INTERNA', 'EXTERNA'])),
  CONSTRAINT orcamentista_mp_ferragem_referencia_key UNIQUE (mp_categoria_id, referencia),
  CONSTRAINT orcamentista_mp_ferragem_mp_categoria_fk FOREIGN KEY (mp_categoria_id, tenant_id, categoria_chave)
    REFERENCES public.orcamentista_mp_categoria (id, tenant_id, categoria_chave) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_ferragem_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE);
CREATE TABLE public.orcamentista_mp_instalacao (
  id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, mp_categoria_id uuid NOT NULL, categoria_chave text NOT NULL,
  produto text NOT NULL, usa boolean, referencia text, descricao text, medida text, folga_x integer, folga_y integer,
  CONSTRAINT orcamentista_mp_instalacao_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_mp_instalacao_categoria_instalacao CHECK (categoria_chave = 'INSTALACAO'),
  CONSTRAINT orcamentista_mp_instalacao_produto_valido CHECK (produto = ANY (ARRAY['ARREMATE_INTERNO', 'ARREMATE_EXTERNO', 'CONTRAMARCO'])),
  CONSTRAINT orcamentista_mp_instalacao_usa_com_referencia CHECK (usa IS NOT TRUE OR referencia IS NOT NULL),
  CONSTRAINT orcamentista_mp_instalacao_produto_key UNIQUE (mp_categoria_id, produto),
  CONSTRAINT orcamentista_mp_instalacao_mp_categoria_fk FOREIGN KEY (mp_categoria_id, tenant_id, categoria_chave)
    REFERENCES public.orcamentista_mp_categoria (id, tenant_id, categoria_chave) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_instalacao_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE);
-- o índice único de EXPRESSÃO dos vidros (pg_indexes de produção, 03/11/2026): não está em pg_constraint, e é o alvo do ON CONFLICT da função
CREATE UNIQUE INDEX orcamentista_mp_vidro_descricao_idx ON public.orcamentista_mp_vidro USING btree (mp_categoria_id, lower(descricao));
GRANT ALL ON public.orcamentista_mp_vidro, public.orcamentista_mp_ferragem, public.orcamentista_mp_instalacao TO service_role;

-- O CONTEÚDO DA DE PAULA, como medido em 03/11/2026 (a config e as linhas, com os ids de produção)
CREATE TEMP TABLE _cat AS
  SELECT c.categoria_chave AS k, c.id FROM public.orcamentista_mp_categoria c
   WHERE c.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND c.materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d';
UPDATE public.orcamentista_mp_categoria c SET config = v.config::jsonb FROM (VALUES
  ('PERFIL', '{"cores":null,"linha":"EUROPA 42","solda":"45/45 · +6 mm no corte","barra_mm":6000,"serra_mm":5,"cor_predominante":"BRANCO","criterio_custo_barra":"CONSUMO_REAL"}'),
  ('REFORCO', '{"usa":true,"material":null,"par_inox_referencia":null}'),
  ('ACESSORIOS_VEDACAO', '{"vedacao":"silicone neutro · espuma expansiva · escova 6×7 mm · borracha de vidro 1,5 mm","cor_por_perfil":{"branco":"branco","amadeirado":"preto"},"modelo_interlock":"IL421 — INTERLOCK LINHA 42MM (MÃO DE AMIGO) BRANCO"}')
) v(k, config) WHERE c.id = (SELECT id FROM _cat WHERE _cat.k = v.k);
-- a autoria das três é do TESTE (o autor de produção não foi medido): existe para provar que a migração a anula ao tirar as chaves
UPDATE public.orcamentista_mp_categoria c SET atualizado_por = 'e0000000-0000-0000-0000-000000000001' WHERE c.id IN (SELECT id FROM _cat WHERE k IN ('PERFIL', 'REFORCO', 'ACESSORIOS_VEDACAO'));
INSERT INTO public.orcamentista_mp_vidro (id, tenant_id, mp_categoria_id, categoria_chave, descricao, referencia, onde_predomina, ordem)
SELECT v.id::uuid, '20e08592-f957-4e72-b7eb-251387e34eb9', (SELECT id FROM _cat WHERE k = 'VIDRO'), 'VIDRO', v.d, v.r, v.o::text[], v.n FROM (VALUES
  ('785b8a72-7c4c-4bd9-9c5d-d82235a5cd92', 'Incolor 4 mm comum', 'PROV-V4I', '{DP-26}', 1),
  ('71ca60ba-e753-43ef-a808-172a711d76c2', 'Mini boreal 4 mm', 'PROV-V4MB', '{DP-06}', 2),
  ('b5bcdb87-2a50-4efc-ba2a-e0df27fa782e', 'Incolor 8 mm temperado', 'PROV-V8T', '{DP-35,DP-15}', 3),
  ('0e297cb8-7406-46fe-ad58-67a8a97616dd', 'Incolor 10 mm temperado', 'PROV-V10T', '{DP-19}', 4)) v(id, d, r, o, n);
INSERT INTO public.orcamentista_mp_ferragem (id, tenant_id, mp_categoria_id, categoria_chave, tipologia, posicao, referencia, descricao, cor, par_inox_referencia, ordem)
SELECT v.id::uuid, '20e08592-f957-4e72-b7eb-251387e34eb9', (SELECT id FROM _cat WHERE k = 'FERRAGENS'), 'FERRAGENS', v.t, v.p, v.r, v.d, v.c, NULL, v.n FROM (VALUES
  ('a44f1154-cce5-4777-8c1e-dbd282e2ec18', 'DP-26', 'INTERNA', 'PROV-CR-2F', 'PROVISÓRIO — cremona 2 folhas com fecho alavanca', 'branco', 1),
  ('80cf7331-195c-4f15-8025-60ce47ecd686', 'DP-26', 'EXTERNA', 'PROV-CR-2F-EXT', 'PROVISÓRIO — cremona 2 folhas, fecho externo', 'branco', 2),
  ('e3037e1c-09d7-4854-bd48-8e3710b2d41a', 'DP-06', NULL, 'PROV-FX-MAX', 'PROVISÓRIO — fecho maxim-ar com braço regulável', 'branco', 3),
  ('0b1091e2-cb65-4a7f-9218-01f517d3ce9f', 'DP-35', NULL, 'PROV-RD-80K', 'PROVISÓRIO — roldana 80 kg dupla', NULL, 4)) v(id, t, p, r, d, c, n);
INSERT INTO public.orcamentista_mp_instalacao (id, tenant_id, mp_categoria_id, categoria_chave, produto, usa, referencia, descricao, medida, folga_x, folga_y)
SELECT v.id::uuid, '20e08592-f957-4e72-b7eb-251387e34eb9', (SELECT id FROM _cat WHERE k = 'INSTALACAO'), 'INSTALACAO', v.p, v.u, v.r, v.d, v.m, v.x, v.y FROM (VALUES
  ('4f599fc9-4fbf-414f-b201-5dff3c4cfe1c', 'ARREMATE_INTERNO', true, 'PROV-BZ1770', 'PROVISÓRIO — guarnição interna 70 mm', NULL, NULL::int, NULL::int),
  ('63f2955d-7dba-4394-a777-2b52f2d5af41', 'ARREMATE_EXTERNO', true, 'PROV-BZ0010', 'PROVISÓRIO — guarnição externa 20 mm, perimetral', 'vão + 50 mm (90/90)', NULL, NULL),
  ('b5912943-5316-4842-9f06-60a26d35d186', 'CONTRAMARCO', false, NULL, NULL, NULL, 0, 0)) v(id, p, u, r, d, m, x, y);

-- confere: o que a migração vai encontrar é o medido
DO $$ BEGIN
  IF (SELECT count(*) FROM public.orcamentista_mp_vidro) <> 4 OR (SELECT count(*) FROM public.orcamentista_mp_ferragem) <> 4
     OR (SELECT count(*) FROM public.orcamentista_mp_instalacao) <> 3
     OR (SELECT count(*) FROM public.orcamentista_mp_categoria WHERE config IS NOT NULL) <> 3
     OR (SELECT count(*) FROM public.orcamentista_categoria_campo) <> 13 THEN
    RAISE EXCEPTION '09_estado: o estado montado nao e o medido em producao';
  END IF;
END $$;
