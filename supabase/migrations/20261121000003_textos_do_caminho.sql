-- 20261121000003_textos_do_caminho.sql
--
-- OS TEXTOS POR FORNECEDOR E POR FAMILIA (dono do produto, 20/11/2026, item (4) da ordem; comando de 21/11/2026): "os campos de texto por
-- FORNECEDOR e por FAMILIA, com a regra de entrar no prompt so o do caminho ativo". Escopo WOLFF / PVC; nada se recalcula para tras.
--
-- O QUE FAZ:
--   1. `orcamentista_texto_do_caminho`: por EMPRESA, um texto livre para uma FAMILIA (a chave do catalogo, PVC) OU para um FORNECEDOR
--      (`orcamentista_fornecedor.id`) - nunca os dois na mesma linha. Uma linha por (empresa, familia, fornecedor). `texto` NULL = nao escrito
--      (`ausente-vs-falso.md`); com texto: sem espaco nas pontas, 1 a 1.500 caracteres (o teto da instrucao da categoria e da descricao da etapa).
--      SEM FK para o catalogo de familias nem para o fornecedor, de proposito: o arrasto do catalogo (`superadmin_remover_do_catalogo`) confere
--      que cada tabela alcancada perde exatamente o que os passos dele apagam, e uma cascata nova sairia sem log. O texto de um fornecedor ou
--      familia removidos fica orfao e nunca e lido (o leitor so le o caminho ativo). A FK da empresa e a da natureza (`tenants`, CASCADE).
--   2. `superadmin_gravar_texto_do_caminho(p_tenant, p_por, p_alvo jsonb)` - `p_alvo = { familia | fornecedor_id, texto }`:
--      - a familia tem de ser de uma materia-prima DA EMPRESA; o fornecedor tem de estar no caminho dela (vinculado a uma categoria de uma
--        materia-prima da empresa, ou dono de um motor que uma etapa da empresa aponta). Fora disso, a MESMA frase (nao diz se existe);
--      - apara; vazio ou so espaco grava NULL (limpar NAO apaga a linha: apagar dado de conta nao foi pedido); acima de 1.500 recusa nomeando
--        o numero; o mesmo texto nao grava nem loga; cada mudanca vai ao `superadmin_alteracao_log` com o tenant, o antes e o depois;
--      - chave desconhecida no objeto e recusa nomeada; trava de aviso pela chave (duas gravacoes da mesma chave se enfileiram).
--   SECURITY DEFINER, search_path fixo, EXECUTE so do service_role (REVOKE de PUBLIC, anon e authenticated: o privilegio padrao de producao
--   os daria). RLS e grants espelhados da `orcamentista_natureza_da_variavel` (20261121000001).
--
-- NAO grava nem apaga dado. Nenhuma funcao de antes muda. Corpo da funcao e o arquivo inteiro em ASCII (a colagem pelo SQL Editor no Windows
-- reescreve o que nao e ASCII, e o prosrc e o artefato - migracao.md, Parte III).
--
-- GUARDA (aborta, nada e criado): faltam as dependencias (tenants, users, orcamentista_materia_prima, orcamentista_mp_categoria,
-- orcamentista_mp_categoria_fornecedor, orcamentista_familia_etapa, orcamentista_motor, superadmin_alteracao_log, is_super_admin()); a tabela
-- ja existe com outra forma.
-- VERIFICACAO (aborta): RLS ligada com as 4 politicas; anon e authenticated sem privilegio na tabela; a funcao SECURITY DEFINER com search_path
-- fixo e EXECUTE so do service_role; nenhuma linha (a migracao nao grava dado).

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.tenants') IS NULL OR to_regclass('public.users') IS NULL OR to_regclass('public.orcamentista_materia_prima') IS NULL
     OR to_regclass('public.orcamentista_mp_categoria') IS NULL OR to_regclass('public.orcamentista_mp_categoria_fornecedor') IS NULL
     OR to_regclass('public.orcamentista_familia_etapa') IS NULL OR to_regclass('public.orcamentista_motor') IS NULL
     OR to_regclass('public.superadmin_alteracao_log') IS NULL OR to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'guarda: dependencia ausente no banco % (usuario %). Nada foi alterado.', current_database(), current_user;
  END IF;
  IF to_regclass('public.orcamentista_texto_do_caminho') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_texto_do_caminho_uma_por_chave' AND contype = 'u') THEN
    RAISE EXCEPTION 'guarda: orcamentista_texto_do_caminho ja existe com outra forma. Nada foi alterado.';
  END IF;
END
$guarda$;

CREATE TABLE IF NOT EXISTS public.orcamentista_texto_do_caminho (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  familia        text,
  fornecedor_id  uuid,
  texto          text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_texto_do_caminho_um_alvo CHECK ((familia IS NULL) <> (fornecedor_id IS NULL)),
  CONSTRAINT orcamentista_texto_do_caminho_familia_forma CHECK (familia IS NULL OR familia ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  CONSTRAINT orcamentista_texto_do_caminho_texto_forma CHECK (texto IS NULL OR (texto = btrim(texto) AND char_length(texto) BETWEEN 1 AND 1500)),
  CONSTRAINT orcamentista_texto_do_caminho_uma_por_chave UNIQUE NULLS NOT DISTINCT (tenant_id, familia, fornecedor_id)
);
COMMENT ON TABLE public.orcamentista_texto_do_caminho IS
  'Texto livre por empresa para uma familia (chave do catalogo) ou para um fornecedor do caminho dela. Entra no prompt so o do caminho ativo. 20261121000003.';
COMMENT ON COLUMN public.orcamentista_texto_do_caminho.texto IS 'NULL = nao escrito. Gravado so por superadmin_gravar_texto_do_caminho; limpar grava NULL, nunca apaga a linha.';

ALTER TABLE public.orcamentista_texto_do_caminho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orcamentista_texto_do_caminho_select_super_admin ON public.orcamentista_texto_do_caminho;
DROP POLICY IF EXISTS orcamentista_texto_do_caminho_insert_super_admin ON public.orcamentista_texto_do_caminho;
DROP POLICY IF EXISTS orcamentista_texto_do_caminho_update_super_admin ON public.orcamentista_texto_do_caminho;
DROP POLICY IF EXISTS orcamentista_texto_do_caminho_delete_super_admin ON public.orcamentista_texto_do_caminho;
CREATE POLICY orcamentista_texto_do_caminho_select_super_admin ON public.orcamentista_texto_do_caminho FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_texto_do_caminho_insert_super_admin ON public.orcamentista_texto_do_caminho FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_texto_do_caminho_update_super_admin ON public.orcamentista_texto_do_caminho FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_texto_do_caminho_delete_super_admin ON public.orcamentista_texto_do_caminho FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_texto_do_caminho FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentista_texto_do_caminho TO service_role;

CREATE OR REPLACE FUNCTION public.superadmin_gravar_texto_do_caminho(p_tenant uuid, p_por uuid, p_alvo jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_chave text;
  v_familia text;
  v_fornecedor uuid;
  v_texto text;
  v_antes public.orcamentista_texto_do_caminho%ROWTYPE;
  v_depois public.orcamentista_texto_do_caminho%ROWTYPE;
BEGIN
  IF p_tenant IS NULL OR p_alvo IS NULL OR jsonb_typeof(p_alvo) <> 'object' THEN
    RAISE EXCEPTION 'texto do caminho: a empresa e o alvo sao obrigatorios.' USING ERRCODE = '22023';
  END IF;
  -- chave desconhecida e recusa nomeada, nunca ignorada
  SELECT k INTO v_chave FROM jsonb_object_keys(p_alvo) k WHERE k NOT IN ('familia', 'fornecedor_id', 'texto') LIMIT 1;
  IF v_chave IS NOT NULL THEN
    RAISE EXCEPTION 'texto do caminho: chave desconhecida "%".', v_chave USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_alvo->'texto') NOT IN ('string', 'null') AND p_alvo ? 'texto' THEN
    RAISE EXCEPTION 'texto do caminho: o texto tem de ser texto ou nulo.' USING ERRCODE = '22023';
  END IF;
  v_familia := NULLIF(p_alvo->>'familia', '');
  v_fornecedor := NULLIF(p_alvo->>'fornecedor_id', '')::uuid;
  IF (v_familia IS NULL) = (v_fornecedor IS NULL) THEN
    RAISE EXCEPTION 'texto do caminho: diga a familia OU o fornecedor, um so.' USING ERRCODE = '22023';
  END IF;
  v_texto := NULLIF(btrim(coalesce(p_alvo->>'texto', '')), '');
  IF v_texto IS NOT NULL AND char_length(v_texto) > 1500 THEN
    RAISE EXCEPTION 'texto do caminho: o texto tem % caracteres; o limite e 1500. Nada foi gravado.', char_length(v_texto) USING ERRCODE = '22023';
  END IF;

  -- o caminho da empresa: a familia de uma materia-prima dela; o fornecedor vinculado a uma categoria dela ou dono de um motor que uma etapa
  -- dela aponta. Fora do caminho e a MESMA frase do inexistente
  IF v_familia IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orcamentista_materia_prima WHERE tenant_id = p_tenant AND familia = v_familia) THEN
    RAISE EXCEPTION 'texto do caminho: a familia % nao e de nenhuma materia-prima desta empresa.', v_familia USING ERRCODE = '22023';
  END IF;
  IF v_fornecedor IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.orcamentista_mp_categoria_fornecedor cf
         JOIN public.orcamentista_mp_categoria c ON c.id = cf.mp_categoria_id
        WHERE c.tenant_id = p_tenant AND cf.fornecedor_id = v_fornecedor
       UNION ALL
       SELECT 1 FROM public.orcamentista_familia_etapa e
         JOIN public.orcamentista_motor m ON m.id = e.motor_id
        WHERE e.tenant_id = p_tenant AND m.fornecedor_id = v_fornecedor) THEN
    RAISE EXCEPTION 'texto do caminho: o fornecedor % nao esta no caminho desta empresa.', v_fornecedor USING ERRCODE = '22023';
  END IF;

  -- duas gravacoes da mesma chave se enfileiram
  PERFORM pg_advisory_xact_lock(hashtext('orcamentista_texto_do_caminho:' || p_tenant::text || ':' || coalesce(v_familia, '') || ':' || coalesce(v_fornecedor::text, '')));

  SELECT * INTO v_antes FROM public.orcamentista_texto_do_caminho
   WHERE tenant_id = p_tenant AND familia IS NOT DISTINCT FROM v_familia AND fornecedor_id IS NOT DISTINCT FROM v_fornecedor
   FOR UPDATE;

  IF FOUND THEN
    IF v_antes.texto IS NOT DISTINCT FROM v_texto THEN
      RETURN jsonb_build_object('resultado', 'igual', 'linha', to_jsonb(v_antes) - 'tenant_id');
    END IF;
    UPDATE public.orcamentista_texto_do_caminho SET texto = v_texto, atualizado_por = p_por, atualizado_em = now()
     WHERE id = v_antes.id RETURNING * INTO v_depois;
  ELSE
    IF v_texto IS NULL THEN
      -- nada escrito e nada a limpar: nao cria linha vazia
      RETURN jsonb_build_object('resultado', 'igual', 'linha', NULL);
    END IF;
    INSERT INTO public.orcamentista_texto_do_caminho (tenant_id, familia, fornecedor_id, texto, atualizado_por)
    VALUES (p_tenant, v_familia, v_fornecedor, v_texto, p_por) RETURNING * INTO v_depois;
  END IF;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_texto_do_caminho', v_depois.id::text,
          CASE WHEN v_antes.id IS NULL THEN NULL ELSE to_jsonb(v_antes) - 'tenant_id' END,
          (to_jsonb(v_depois) - 'tenant_id') || jsonb_build_object('funcao', 'superadmin_gravar_texto_do_caminho'), p_por);
  RETURN jsonb_build_object('resultado', CASE WHEN v_antes.id IS NULL THEN 'criada' ELSE 'trocada' END, 'linha', to_jsonb(v_depois) - 'tenant_id');
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_gravar_texto_do_caminho(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_texto_do_caminho(uuid, uuid, jsonb) TO service_role;

DO $verifica$
DECLARE v_fn record;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_texto_do_caminho'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_texto_do_caminho') <> 4 THEN
    RAISE EXCEPTION 'verificacao 1: a RLS nao esta ligada com as 4 politicas.';
  END IF;
  IF has_table_privilege('anon', 'public.orcamentista_texto_do_caminho', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.orcamentista_texto_do_caminho', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'verificacao 2: anon ou authenticated tem privilegio na tabela.';
  END IF;
  SELECT prosecdef, proconfig INTO v_fn FROM pg_proc WHERE oid = to_regprocedure('public.superadmin_gravar_texto_do_caminho(uuid, uuid, jsonb)');
  IF NOT FOUND OR NOT v_fn.prosecdef OR v_fn.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_fn.proconfig)) THEN
    RAISE EXCEPTION 'verificacao 3: a funcao nao existe ou nao e SECURITY DEFINER com search_path fixo.';
  END IF;
  IF has_function_privilege('anon', 'public.superadmin_gravar_texto_do_caminho(uuid, uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.superadmin_gravar_texto_do_caminho(uuid, uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.superadmin_gravar_texto_do_caminho(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao 4: o EXECUTE da funcao nao e so do service_role.';
  END IF;
  RAISE NOTICE 'textos do caminho: tabela e funcao prontas; % linha(s) (nenhum dado foi gravado por esta migracao)',
    (SELECT count(*) FROM public.orcamentista_texto_do_caminho);
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
