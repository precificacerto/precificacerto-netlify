-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261117000001 — AS PEÇAS DO CÁLCULO, para o RELATÓRIO DE CORTE (dono do produto, 16/11/2026)
--
-- "Numa outra aba seria de corte, relatórios de corte, onde vai ter o formato que cada perfil tem que ser cortado, o tamanho, assim também
-- para reforço metálico, para tudo. Usando como base as informações que nós pegamos do WVetro." Aprovado: a migração, e o corte só para os
-- orçamentos calculados ou recalculados depois dela (nada se recalcula para trás).
--
-- CRIA public.orcamentista_orcamento_item_peca: por cálculo de um item do orçamento, cada peça de perfil que o motor deu — o perfil do
-- motor, o código da tabela, a descrição, o comprimento, a quantidade por unidade e a do pedido, o CORTE e a POSIÇÃO da aba Perfis — e a
-- BARRA e a SERRA com que o agrupador as juntou. Só INSERT, como o material e a falta: o cálculo de antes fica, e o vigente é o `calculo_id`
-- que o item guarda.
--
-- NÃO grava dado de conta, NÃO altera nem apaga nada que existe. Acesso: RLS ligada, sem política, e só o service_role, com SELECT e INSERT
-- (o molde é orcamentista_orcamento_falta, medido em produção em 17/11/2026). O REVOKE inclui authenticated: o privilégio padrão do postgres
-- no schema public dá a ele acesso total a toda tabela nova (pg_default_acl, medido em 17/11/2026).
--
-- IDEMPOTENTE: CREATE TABLE / INDEX IF NOT EXISTS; o REVOKE e o GRANT repetidos dão o mesmo estado.
-- GUARDA (aborta): as tabelas de que depende; a chave (id, tenant_id) do item; a tabela já existente com outra forma.
-- VERIFICAÇÃO (aborta): as colunas, os tipos e a nulidade; as CHECKs; a FK; a UNIQUE; RLS ligada, nenhuma política e os grants.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  n int;
BEGIN
  IF to_regclass('public.orcamentista_orcamento_item') IS NULL OR to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento_item ou tenants (banco %, usuario %). Nada foi alterado.', current_database(), current_user;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item'::regclass
                    AND contype IN ('u', 'p') AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') THEN
    RAISE EXCEPTION 'orcamentista_orcamento_item nao tem a UNIQUE (id, tenant_id) que a FK composta usa. Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_orcamento_item_peca') IS NOT NULL THEN
    SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item_peca';
    IF n <> 16 THEN
      RAISE EXCEPTION 'orcamentista_orcamento_item_peca ja existe com % colunas, e esta migracao cria 16: e outra tabela. Nada foi alterado.', n;
    END IF;
  END IF;
END
$guarda$;

CREATE TABLE IF NOT EXISTS public.orcamentista_orcamento_item_peca (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  orcamento_item_id        uuid        NOT NULL,
  calculo_id               uuid        NOT NULL,
  ordem                    integer     NOT NULL CONSTRAINT orcamentista_orcamento_item_peca_ordem_positiva CHECK (ordem >= 1),
  perfil                   text        NOT NULL CONSTRAINT orcamentista_orcamento_item_peca_perfil_forma CHECK (perfil ~ '^\S(.*\S)?$' AND char_length(perfil) <= 60),
  codigo                   text        NOT NULL CONSTRAINT orcamentista_orcamento_item_peca_codigo_forma CHECK (codigo ~ '^\S(.*\S)?$' AND char_length(codigo) <= 60),
  descricao                text        NULL     CONSTRAINT orcamentista_orcamento_item_peca_descricao_forma CHECK (descricao IS NULL OR (descricao ~ '^\S(.*\S)?$' AND char_length(descricao) <= 300)),
  comprimento_mm           numeric     NOT NULL CONSTRAINT orcamentista_orcamento_item_peca_comprimento_positivo CHECK (comprimento_mm > 0),
  quantidade_por_esquadria numeric     NOT NULL CONSTRAINT orcamentista_orcamento_item_peca_qtd_unidade_positiva CHECK (quantidade_por_esquadria > 0),
  quantidade               numeric     NOT NULL CONSTRAINT orcamentista_orcamento_item_peca_qtd_positiva CHECK (quantidade > 0),
  corte                    text        NULL     CONSTRAINT orcamentista_orcamento_item_peca_corte_forma CHECK (corte IS NULL OR (corte ~ '^\S(.*\S)?$' AND char_length(corte) <= 30)),
  posicao                  text        NULL     CONSTRAINT orcamentista_orcamento_item_peca_posicao_forma CHECK (posicao IS NULL OR (posicao ~ '^\S(.*\S)?$' AND char_length(posicao) <= 30)),
  comprimento_barra_mm     numeric     NULL     CONSTRAINT orcamentista_orcamento_item_peca_barra_positiva CHECK (comprimento_barra_mm IS NULL OR comprimento_barra_mm > 0),
  serra_mm                 numeric     NOT NULL CONSTRAINT orcamentista_orcamento_item_peca_serra_nao_negativa CHECK (serra_mm >= 0),
  criado_em                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_orcamento_item_peca_item_fkey FOREIGN KEY (orcamento_item_id, tenant_id)
    REFERENCES public.orcamentista_orcamento_item(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_item_peca_ordem_key UNIQUE (orcamento_item_id, calculo_id, ordem)
);
CREATE INDEX IF NOT EXISTS orcamentista_orcamento_item_peca_calculo_idx ON public.orcamentista_orcamento_item_peca (orcamento_item_id, calculo_id);
ALTER TABLE public.orcamentista_orcamento_item_peca ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orcamentista_orcamento_item_peca FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.orcamentista_orcamento_item_peca TO service_role;
COMMENT ON TABLE public.orcamentista_orcamento_item_peca IS
  'As pecas de perfil de um item do orcamento, por calculo (20261117000001): o relatorio de corte. So INSERT, como o material. As pecas que valem sao as do calculo vigente do item. A barra e a serra sao as que o agrupador usou naquele calculo.';

DO $verifica$
DECLARE
  esperado text := 'calculo_id:uuid:NO,codigo:text:NO,comprimento_barra_mm:numeric:YES,comprimento_mm:numeric:NO,corte:text:YES,criado_em:timestamp with time zone:NO,'
    || 'descricao:text:YES,id:uuid:NO,orcamento_item_id:uuid:NO,ordem:integer:NO,perfil:text:NO,posicao:text:YES,quantidade:numeric:NO,'
    || 'quantidade_por_esquadria:numeric:NO,serra_mm:numeric:NO,tenant_id:uuid:NO';
  achado text;
  n int;
BEGIN
  SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY column_name) INTO achado
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item_peca';
  IF achado IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'verificacao 1: as colunas sao %, e deviam ser %. Nada foi alterado.', achado, esperado;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_peca'::regclass AND contype = 'c';
  IF n <> 11 THEN
    RAISE EXCEPTION 'verificacao 2: % CHECKs, e deviam ser 11. Nada foi alterado.', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_peca'::regclass AND conname = 'orcamentista_orcamento_item_peca_item_fkey'
                    AND pg_get_constraintdef(oid) = 'FOREIGN KEY (orcamento_item_id, tenant_id) REFERENCES orcamentista_orcamento_item(id, tenant_id) ON DELETE RESTRICT') THEN
    RAISE EXCEPTION 'verificacao 3: a FK do item ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_peca'::regclass AND conname = 'orcamentista_orcamento_item_peca_ordem_key'
                    AND pg_get_constraintdef(oid) = 'UNIQUE (orcamento_item_id, calculo_id, ordem)') THEN
    RAISE EXCEPTION 'verificacao 3: a UNIQUE (item, calculo, ordem) ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_orcamento_item_peca'::regclass) THEN
    RAISE EXCEPTION 'verificacao 4: RLS desligada. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_orcamento_item_peca';
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 4: % politicas, e nao devia haver nenhuma (so o service_role le e grava). Nada foi alterado.', n;
  END IF;
  SELECT string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type) INTO achado FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item_peca' AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role');
  IF achado IS DISTINCT FROM 'service_role:INSERT,service_role:SELECT' THEN
    RAISE EXCEPTION 'verificacao 5: os grants deviam ser so INSERT e SELECT do service_role, e sao: %. Nada foi alterado.', achado;
  END IF;
  RAISE NOTICE 'pecas do calculo: orcamentista_orcamento_item_peca criada (16 colunas, 11 CHECKs, FK do item, UNIQUE por calculo e ordem, RLS, so service_role).';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orcamentista_orcamento_item_peca';
-- -- esperado: 16
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'orcamentista_orcamento_item_peca';
-- -- esperado: service_role INSERT e SELECT (e o dono)
-- select count(*) from orcamentista_orcamento_item_peca;
-- -- esperado: 0
