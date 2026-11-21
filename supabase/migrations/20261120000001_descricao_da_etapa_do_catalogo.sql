-- --------------------------------------------------------------------------------------------------------------
-- 20261120000001 - A DESCRICAO DA ETAPA NO CATALOGO: o que a etapa entrega e o que NAO e dela
--
-- PENDENTE ate o dono do produto aplicar. NAO grava dado de conta nem de catalogo: so a coluna (nula em
-- toda linha) e a funcao que a grava. Nenhuma funcao de antes muda.
-- --------------------------------------------------------------------------------------------------------------
--
-- Dono do produto, 20/11/2026 (as fronteiras dos quatro estagios, item 3): "A DESCRICAO DA ETAPA no catalogo: um campo de texto em
-- orcamentista_etapa_catalogo dizendo o que a etapa entrega e o que NAO e dela, que aparece na tela e entra no prompt da etapa corrente."
--
-- O QUE FAZ:
--   1. `orcamentista_etapa_catalogo.descricao text NULL` - nula = nao escrita (`ausente-vs-falso.md`); CHECK de forma: sem espaco nas pontas,
--      de 1 a 1.500 caracteres (o mesmo teto da instrucao da categoria, 20261103000002). Vazio nao existe: e NULL.
--   2. `superadmin_gravar_descricao_da_etapa(p_por, p_id, p_descricao)`: super admin; o item tem de existir; apara; vazio ou so espaco limpa
--      (NULL); acima de 1.500 recusa nomeando o numero; a mesma descricao nao grava nem loga; a mudanca loga antes e depois
--      (`superadmin_alteracao_log`, tenant nulo: o catalogo e global). SECURITY DEFINER, `search_path` fixo, so `service_role`.
--   POR QUE UMA FUNCAO NOVA, e nao um parametro nas de criar e editar: mudar a assinatura delas e DROP + CREATE, e o corpo delas em producao tem
--   `\r` (aplicadas pelo SQL Editor). A funcao nova deixa as duas como estao - nada a conferir por md5 nelas.
--
-- PRESSUPOE: `orcamentista_etapa_catalogo` (20261031000002) e `superadmin_alteracao_log`. A guarda aborta, nomeando o banco, se faltar.
-- Os comentarios DENTRO do corpo `$fn$` sao ASCII (o `prosrc` e o artefato; a colagem pelo navegador reescreve o que nao e ASCII).

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_etapa_catalogo') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente no banco % (usuario %): orcamentista_etapa_catalogo ou superadmin_alteracao_log nao existe. Nada foi alterado.',
      current_database(), current_user;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_etapa_catalogo'
             AND column_name = 'descricao' AND (data_type <> 'text' OR is_nullable <> 'YES' OR column_default IS NOT NULL)) THEN
    RAISE EXCEPTION 'orcamentista_etapa_catalogo.descricao ja existe com outra forma (tipo, nulidade ou default). Nada foi alterado.';
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_etapa_catalogo ADD COLUMN IF NOT EXISTS descricao text NULL;

DO $forma$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_etapa_catalogo'::regclass AND conname = 'orcamentista_etapa_catalogo_descricao_forma') THEN
    ALTER TABLE public.orcamentista_etapa_catalogo ADD CONSTRAINT orcamentista_etapa_catalogo_descricao_forma
      CHECK (descricao IS NULL OR (descricao = btrim(descricao) AND char_length(descricao) BETWEEN 1 AND 1500));
  END IF;
END
$forma$;

COMMENT ON COLUMN public.orcamentista_etapa_catalogo.descricao IS
  'O que a etapa entrega e o que NAO e dela (dono do produto, 20/11/2026). Aparece na tela e entra no prompt da etapa corrente. NULL = nao escrita. Gravada so por superadmin_gravar_descricao_da_etapa.';

CREATE OR REPLACE FUNCTION public.superadmin_gravar_descricao_da_etapa(p_por uuid, p_id uuid, p_descricao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_antes     public.orcamentista_etapa_catalogo%ROWTYPE;
  v_depois    jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_descricao IS NOT NULL AND char_length(v_descricao) > 1500 THEN
    RAISE EXCEPTION 'a descricao da etapa tem % caracteres; o limite e 1500. Nada foi gravado.', char_length(v_descricao) USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT c.* INTO v_antes FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'etapa do catalogo inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  -- a mesma descricao: nada muda, nada se loga
  IF v_antes.descricao IS NOT DISTINCT FROM v_descricao THEN
    RETURN to_jsonb(v_antes);
  END IF;
  UPDATE public.orcamentista_etapa_catalogo SET descricao = v_descricao WHERE id = p_id;
  SELECT to_jsonb(c) INTO v_depois FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_etapa_catalogo', p_id::text, jsonb_build_object('orcamentista_etapa_catalogo', to_jsonb(v_antes), 'campo', 'descricao'),
          jsonb_build_object('orcamentista_etapa_catalogo', v_depois, 'campo', 'descricao'), p_por);
  RETURN v_depois;
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_gravar_descricao_da_etapa(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_descricao_da_etapa(uuid, uuid, text) TO service_role;

DO $verifica$
DECLARE
  v_preenchidas integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_etapa_catalogo'
                 AND column_name = 'descricao' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 1: a coluna descricao nao ficou text, nula e sem default';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_etapa_catalogo'::regclass AND conname = 'orcamentista_etapa_catalogo_descricao_forma') THEN
    RAISE EXCEPTION 'verificacao 2: a CHECK orcamentista_etapa_catalogo_descricao_forma nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_gravar_descricao_da_etapa(uuid, uuid, text)') AND p.prosecdef) THEN
    RAISE EXCEPTION 'verificacao 3: a funcao nao existe ou nao e SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.superadmin_gravar_descricao_da_etapa(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.superadmin_gravar_descricao_da_etapa(uuid, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.superadmin_gravar_descricao_da_etapa(uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao 4: a funcao tem de ser so do service_role (anon e authenticated sem EXECUTE)';
  END IF;
  SELECT count(*) INTO v_preenchidas FROM public.orcamentista_etapa_catalogo WHERE descricao IS NOT NULL;
  RAISE NOTICE 'descricao da etapa: coluna e funcao prontas; % item(ns) do catalogo com descricao (nenhum dado foi gravado por esta migracao)', v_preenchidas;
END
$verifica$;
