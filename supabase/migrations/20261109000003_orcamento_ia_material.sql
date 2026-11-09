-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261109000003 — o MATERIAL CONSUMIDO NO ITEM do orçamento I.A.: a relação de custo, por material, que
-- produz o total do item. Fica no back-end, OCULTA na tela, e é a fonte dos Relatórios I.A.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto. Pressupõe a 20261109000001 e a
-- ║ 20261109000002 aplicadas.
-- ║ Ao aplicar fora do CLI, o `name` da migração é 20261109000003_orcamento_ia_material.
-- ║ NÃO GRAVA DADO DE CONTA: nenhuma linha é inserida, alterada ou apagada. Medido em produção
-- ║ em 09/11/2026: orcamentista_orcamento e orcamentista_orcamento_item têm 0 linhas.
-- ║ ALTERA UMA TABELA QUE JÁ EXISTE: orcamentista_orcamento_item ganha a UNIQUE (id, tenant_id)
-- ║ (a chave da FK composta do material), calculo_id e calculado_em (nulas, sem default) e duas
-- ║ CHECKs. Nenhuma coluna, constraint ou tabela sai.
-- ║ NÃO CRIA FUNÇÃO. A tabela nova é SÓ DE ESCRITA E LEITURA: o service_role tem SELECT e
-- ║ INSERT, e NÃO tem UPDATE, DELETE nem TRUNCATE — a linha gravada é fato histórico.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 09/11/2026: "a relação de custo de cada material fica no BACK-END, OCULTA. É ela que produz o valor
-- total, mas não é apresentada." E, na resposta dos Relatórios I.A.: "A terceira tabela guarda, por material consumido no item:
-- código do fornecedor, descrição, unidade de compra, medida da unidade, custo bruto da unidade, os percentuais de crédito, custo
-- líquido da unidade, custo líquido da fração, consumo do item e custo líquido do material no item. A gravação é no ORÇAMENTO, não
-- na conversa." `custo-liquido-por-fracao.md` acrescenta o custo BRUTO do material no item: "Bruto e líquido de cada item, sempre os
-- dois".
--
-- O QUE FAZ:
--   1. `orcamentista_orcamento_item_material`: uma linha por (item, cálculo, código), com os campos da lista acima; tenant_id e a FK
--      COMPOSTA (orcamento_item_id, tenant_id) -> orcamentista_orcamento_item (id, tenant_id), ON DELETE RESTRICT — o material de uma
--      empresa nunca pende do item de outra (o furo corrigido na 20261109000001, aqui fechado na origem).
--   2. O CÁLCULO É VERSIONADO, NÃO REESCRITO: cada cálculo do orçamento grava as suas linhas com um `calculo_id` novo, e o item aponta
--      o cálculo vigente (`orcamentista_orcamento_item.calculo_id`). Recalcular não apaga nem altera o que foi gravado ("nada de
--      delete"); o cálculo de antes continua legível — é a mesma regra do arquivo do levantamento: o que a fábrica cortou tem de continuar
--      legível depois.
--   3. NO ITEM: calculo_id e calculado_em andam juntos; e os valores da 20261109000002 (custo_bruto_materiais em diante) só existem com
--      um cálculo apontado — o número do item tem sempre a relação de materiais de onde saiu.
--   4. O CRÉDITO NÃO APURADO NUNCA BARATEIA: quando o bloco tributário do material não fecha a cascata (o dado "vem depois", dono do
--      produto, 09/11/2026), `credito_nao_apurado` diz o que faltou e o custo líquido da unidade É o bruto — sem crédito nenhum. A CHECK
--      `..._sem_credito_nao_barateia` prende isso no banco.
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, cada constraint só se o nome não existe; a verificação confere a
--   forma.
-- GUARDA (aborta): as tabelas e as colunas das duas migrações anteriores existem (orcamentista_orcamento_item.custo_liquido_total).
-- VERIFICAÇÃO (aborta): as colunas, as constraints e o índice com a definição; RLS ligada; nenhuma política; o service_role só com
--   INSERT e SELECT na tabela nova; nenhum grant a anon, authenticated ou PUBLIC; e as chaves do item exatamente as três esperadas.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_orcamento_item') IS NULL OR to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_orcamento_item ou public.tenants (a migracao 20261109000001). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item' AND column_name = 'custo_liquido_total') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento_item.custo_liquido_total (a migracao 20261109000002). Nada foi alterado.';
  END IF;
END
$guarda$;

-- o item: a chave da FK composta do material, e o calculo vigente
ALTER TABLE public.orcamentista_orcamento_item
  ADD COLUMN IF NOT EXISTS calculo_id   uuid        NULL,
  ADD COLUMN IF NOT EXISTS calculado_em timestamptz NULL;

DO $item$
DECLARE
  novas text[] := ARRAY[
    'orcamentista_orcamento_item_id_tenant_key|UNIQUE (id, tenant_id)',
    'orcamentista_orcamento_item_calculo_inteiro|CHECK ((calculo_id IS NULL) = (calculado_em IS NULL))',
    'orcamentista_orcamento_item_valores_com_calculo|CHECK ((calculo_id IS NOT NULL) OR ((custo_bruto_materiais IS NULL) AND (custo_liquido_materiais IS NULL) AND (custo_fabricacao IS NULL) AND (custo_liquido_total IS NULL)))'
  ];
  e text;
  p text[];
BEGIN
  FOREACH e IN ARRAY novas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento_item') AND conname = p[1]) THEN
      EXECUTE format('ALTER TABLE public.orcamentista_orcamento_item ADD CONSTRAINT %I %s', p[1], p[2]);
    END IF;
  END LOOP;
END
$item$;

CREATE TABLE IF NOT EXISTS public.orcamentista_orcamento_item_material (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL,
  orcamento_item_id       uuid        NOT NULL,
  calculo_id              uuid        NOT NULL,
  ordem                   integer     NOT NULL,
  codigo                  text        NOT NULL,
  descricao               text        NULL,
  unidade_compra          text        NULL,
  medida_unidade          numeric     NULL,
  custo_bruto_unidade     numeric     NOT NULL,
  cred_icms_pct           numeric     NULL,
  cred_pis_cofins_pct     numeric     NULL,
  cred_ipi_pct            numeric     NULL,
  nc_ipi_pct              numeric     NULL,
  cred_ibs_pct            numeric     NULL,
  cred_cbs_pct            numeric     NULL,
  credito_nao_apurado     text        NULL,
  custo_liquido_unidade   numeric     NOT NULL,
  custo_liquido_fracao    numeric     NULL,
  consumo_item            numeric     NOT NULL,
  custo_bruto_material    numeric     NOT NULL,
  custo_liquido_material  numeric     NOT NULL,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_orcamento_item_material_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_orcamento_item_material_ordem_key UNIQUE (orcamento_item_id, calculo_id, ordem),
  CONSTRAINT orcamentista_orcamento_item_material_codigo_key UNIQUE (orcamento_item_id, calculo_id, codigo),
  CONSTRAINT orcamentista_orcamento_item_material_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_item_material_item_fkey FOREIGN KEY (orcamento_item_id, tenant_id)
    REFERENCES public.orcamentista_orcamento_item(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_item_material_ordem_positiva CHECK (ordem >= 1),
  CONSTRAINT orcamentista_orcamento_item_material_codigo_forma CHECK ((codigo ~ '^\S(.*\S)?$'::text) AND (char_length(codigo) <= 60)),
  CONSTRAINT orcamentista_orcamento_item_material_descricao_forma CHECK ((descricao IS NULL) OR ((descricao ~ '^\S(.*\S)?$'::text) AND (char_length(descricao) <= 300))),
  CONSTRAINT orcamentista_orcamento_item_material_unidade_forma CHECK ((unidade_compra IS NULL) OR ((unidade_compra ~ '^\S(.*\S)?$'::text) AND (char_length(unidade_compra) <= 20))),
  CONSTRAINT orcamentista_orcamento_item_material_medida_positiva CHECK ((medida_unidade IS NULL) OR (medida_unidade > 0)),
  CONSTRAINT orcamentista_orcamento_item_material_valores_nao_negativos CHECK ((custo_bruto_unidade >= 0) AND (custo_liquido_unidade >= 0) AND ((custo_liquido_fracao IS NULL) OR (custo_liquido_fracao >= 0)) AND (consumo_item >= 0) AND (custo_bruto_material >= 0) AND (custo_liquido_material >= 0)),
  CONSTRAINT orcamentista_orcamento_item_material_percentuais_na_faixa CHECK (((cred_icms_pct IS NULL) OR ((cred_icms_pct >= 0) AND (cred_icms_pct <= 100))) AND ((cred_pis_cofins_pct IS NULL) OR ((cred_pis_cofins_pct >= 0) AND (cred_pis_cofins_pct <= 100))) AND ((cred_ipi_pct IS NULL) OR ((cred_ipi_pct >= 0) AND (cred_ipi_pct <= 100))) AND ((nc_ipi_pct IS NULL) OR ((nc_ipi_pct >= 0) AND (nc_ipi_pct <= 100))) AND ((cred_ibs_pct IS NULL) OR ((cred_ibs_pct >= 0) AND (cred_ibs_pct <= 100))) AND ((cred_cbs_pct IS NULL) OR ((cred_cbs_pct >= 0) AND (cred_cbs_pct <= 100)))),
  CONSTRAINT orcamentista_orcamento_item_material_credito_nao_apurado_forma CHECK ((credito_nao_apurado IS NULL) OR ((credito_nao_apurado ~ '^\S(.*\S)?$'::text) AND (char_length(credito_nao_apurado) <= 500))),
  -- sem o credito apurado, o liquido e o bruto: o fallback nunca e o que barateia
  CONSTRAINT orcamentista_orcamento_item_material_sem_credito_nao_barateia CHECK ((credito_nao_apurado IS NULL) OR (custo_liquido_unidade = custo_bruto_unidade))
);

CREATE INDEX IF NOT EXISTS orcamentista_orcamento_item_material_calculo_idx
  ON public.orcamentista_orcamento_item_material USING btree (orcamento_item_id, calculo_id);

ALTER TABLE public.orcamentista_orcamento_item_material ENABLE ROW LEVEL SECURITY;

-- o privilegio padrao de producao da ALL a anon, authenticated e service_role: o REVOKE alcanca os quatro, e o service_role volta so
-- com SELECT e INSERT (a linha gravada nao muda nem sai)
REVOKE ALL ON public.orcamentista_orcamento_item_material FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.orcamentista_orcamento_item_material TO service_role;

COMMENT ON TABLE public.orcamentista_orcamento_item_material IS
  'Material consumido no item do orcamento I.A. (20261109000003), por calculo: a relacao de custo que produz o total do item. Oculta na tela; fonte dos Relatorios I.A. Gravada uma vez, nunca alterada.';
COMMENT ON COLUMN public.orcamentista_orcamento_item_material.credito_nao_apurado IS
  'O que faltou no bloco tributario para a cascata fechar. Preenchido: nenhum credito foi aplicado e o liquido da unidade e o bruto.';
COMMENT ON COLUMN public.orcamentista_orcamento_item.calculo_id IS
  'O calculo vigente do item: as linhas de orcamentista_orcamento_item_material com este calculo_id produzem os valores do item.';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_orcamento_item|orcamentista_orcamento_item_calculo_inteiro|CHECK (((calculo_id IS NULL) = (calculado_em IS NULL)))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_id_tenant_key|UNIQUE (id, tenant_id)',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_valores_com_calculo|CHECK (((calculo_id IS NOT NULL) OR ((custo_bruto_materiais IS NULL) AND (custo_liquido_materiais IS NULL) AND (custo_fabricacao IS NULL) AND (custo_liquido_total IS NULL))))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_codigo_forma|CHECK (((codigo ~ ''^\S(.*\S)?$''::text) AND (char_length(codigo) <= 60)))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_codigo_key|UNIQUE (orcamento_item_id, calculo_id, codigo)',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_credito_nao_apurado_forma|CHECK (((credito_nao_apurado IS NULL) OR ((credito_nao_apurado ~ ''^\S(.*\S)?$''::text) AND (char_length(credito_nao_apurado) <= 500))))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_descricao_forma|CHECK (((descricao IS NULL) OR ((descricao ~ ''^\S(.*\S)?$''::text) AND (char_length(descricao) <= 300))))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_item_fkey|FOREIGN KEY (orcamento_item_id, tenant_id) REFERENCES orcamentista_orcamento_item(id, tenant_id) ON DELETE RESTRICT',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_medida_positiva|CHECK (((medida_unidade IS NULL) OR (medida_unidade > (0)::numeric)))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_ordem_key|UNIQUE (orcamento_item_id, calculo_id, ordem)',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_ordem_positiva|CHECK ((ordem >= 1))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_percentuais_na_faixa|CHECK ((((cred_icms_pct IS NULL) OR ((cred_icms_pct >= (0)::numeric) AND (cred_icms_pct <= (100)::numeric))) AND ((cred_pis_cofins_pct IS NULL) OR ((cred_pis_cofins_pct >= (0)::numeric) AND (cred_pis_cofins_pct <= (100)::numeric))) AND ((cred_ipi_pct IS NULL) OR ((cred_ipi_pct >= (0)::numeric) AND (cred_ipi_pct <= (100)::numeric))) AND ((nc_ipi_pct IS NULL) OR ((nc_ipi_pct >= (0)::numeric) AND (nc_ipi_pct <= (100)::numeric))) AND ((cred_ibs_pct IS NULL) OR ((cred_ibs_pct >= (0)::numeric) AND (cred_ibs_pct <= (100)::numeric))) AND ((cred_cbs_pct IS NULL) OR ((cred_cbs_pct >= (0)::numeric) AND (cred_cbs_pct <= (100)::numeric)))))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_pkey|PRIMARY KEY (id)',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_sem_credito_nao_barateia|CHECK (((credito_nao_apurado IS NULL) OR (custo_liquido_unidade = custo_bruto_unidade)))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_unidade_forma|CHECK (((unidade_compra IS NULL) OR ((unidade_compra ~ ''^\S(.*\S)?$''::text) AND (char_length(unidade_compra) <= 20))))',
    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_valores_nao_negativos|CHECK (((custo_bruto_unidade >= (0)::numeric) AND (custo_liquido_unidade >= (0)::numeric) AND ((custo_liquido_fracao IS NULL) OR (custo_liquido_fracao >= (0)::numeric)) AND (consumo_item >= (0)::numeric) AND (custo_bruto_material >= (0)::numeric) AND (custo_liquido_material >= (0)::numeric)))'
  ];
  e      text;
  p      text[];
  faltam text;
  n      int;
BEGIN
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.' || p[1]) AND conname = p[2] AND pg_get_constraintdef(oid) = p[3]) THEN
      faltam := concat_ws('; ', faltam, p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento_item_material');
  IF n <> 14 THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_orcamento_item_material tem % constraint(s), e devia ter 14. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'));
  IF n <> 44 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_orcamento e orcamentista_orcamento_item tem % constraint(s), e deviam ter 44. Nada foi alterado.', n;
  END IF;
  SELECT string_agg(conname || ' ' || pg_get_constraintdef(oid), '; ' ORDER BY conname) INTO faltam FROM pg_constraint
   WHERE conrelid = to_regclass('public.orcamentista_orcamento_item') AND contype IN ('p', 'u');
  IF faltam IS DISTINCT FROM 'orcamentista_orcamento_item_id_tenant_key UNIQUE (id, tenant_id); orcamentista_orcamento_item_ordem_key UNIQUE (orcamento_id, ordem); orcamentista_orcamento_item_pkey PRIMARY KEY (id)' THEN
    RAISE EXCEPTION 'verificacao 4: as chaves de orcamentista_orcamento_item sao (%), e deviam ser a PK, a ordem_key e a id_tenant_key. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item_material';
  IF n <> 23 THEN
    RAISE EXCEPTION 'verificacao 5: orcamentista_orcamento_item_material tem % coluna(s), e devia ter 23. Nada foi alterado.', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item'
                  AND column_name = 'calculo_id' AND data_type = 'uuid' AND is_nullable = 'YES' AND column_default IS NULL)
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item'
                  AND column_name = 'calculado_em' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 6: calculo_id ou calculado_em do item ausente ou com outra forma (nula, sem default). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_orcamento_item_material_calculo_idx'
                  AND indexdef = 'CREATE INDEX orcamentista_orcamento_item_material_calculo_idx ON public.orcamentista_orcamento_item_material USING btree (orcamento_item_id, calculo_id)') THEN
    RAISE EXCEPTION 'verificacao 7: indice orcamentista_orcamento_item_material_calculo_idx ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.orcamentista_orcamento_item_material')) THEN
    RAISE EXCEPTION 'verificacao 8: RLS desligada em orcamentista_orcamento_item_material. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_orcamento_item_material';
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 9: % politica(s) em orcamentista_orcamento_item_material, e devia ser nenhuma. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name IN ('orcamentista_orcamento', 'orcamentista_orcamento_item', 'orcamentista_orcamento_item_material')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 10: % grant(s) a anon, authenticated ou PUBLIC nas tres tabelas. Nada foi alterado.', n;
  END IF;
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO faltam FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item_material' AND grantee = 'service_role';
  IF faltam IS DISTINCT FROM 'INSERT,SELECT' THEN
    RAISE EXCEPTION 'verificacao 11: service_role em orcamentista_orcamento_item_material tem %, e devia ter INSERT,SELECT. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_orcamento_item_material;
  RAISE NOTICE 'orcamentista_orcamento_item_material: 23 colunas, 14 constraints, 1 indice, RLS sem politica, service_role so com INSERT e SELECT. O item: 3 constraints novas (44 nas duas tabelas). Linhas no material: %.', n;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orcamentista_orcamento_item_material';
-- -- esperado: 23
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_orcamento_item_material'::regclass order by 1;
-- -- esperado: 14, entre elas a item_fkey composta (orcamento_item_id, tenant_id) e a sem_credito_nao_barateia
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_orcamento_item'::regclass and conname in
--   ('orcamentista_orcamento_item_id_tenant_key', 'orcamentista_orcamento_item_calculo_inteiro', 'orcamentista_orcamento_item_valores_com_calculo');
-- -- esperado: as 3
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'orcamentista_orcamento_item_material' order by 1, 2;
-- -- esperado: só postgres e service_role; service_role com INSERT e SELECT
-- select relrowsecurity from pg_class where relname = 'orcamentista_orcamento_item_material';  -- esperado: true
