-- 20261121000002_gravar_natureza.sql
--
-- A TELA DA NATUREZA DA VARIAVEL (dono do produto, 20/11/2026, item (3) da ordem; comando de 21/11/2026): o PO edita a natureza e a opcao padrao
-- sem SQL. Esta migracao cria SO a funcao que a tela chama; a tabela e a 20261121000001 (aplicada e conferida em 21/11/2026).
--
--   superadmin_gravar_natureza(p_tenant uuid, p_por uuid, p_linha jsonb) -> jsonb
--     p_linha = { familia, formato, variavel, natureza, opcao_padrao }   (linha de produto: nula nesta fase - a CHECK da tabela)
--
-- O QUE A FUNCAO FAZ: DEFINE ou TROCA uma linha da chave (empresa, familia, formato, variavel). Nada mais.
--   - a familia tem de ser de uma materia-prima DA EMPRESA (a de outra empresa e a inexistente recebem a MESMA frase);
--   - a chave sem linha ganha uma (INSERT); a chave com linha muda natureza/opcao (UPDATE); o mesmo valor nao grava nem loga;
--   - cada mudanca vai ao superadmin_alteracao_log com o tenant, o antes e o depois;
--   - as formas sao as CHECKs da tabela (natureza fechada, opcao so na POLITICA, linha/formato so no VIDRO...): a violacao volta 23514;
--   - duas gravacoes da mesma chave ao mesmo tempo se enfileiram (trava de aviso pela chave).
--
-- O QUE NAO FAZ, de proposito: REMOVER. "Tirar" uma linha e apagar dado de conta, e a baixa por marcador nao foi desenhada (tarefa 0007,
-- fechada por absorcao em 21/11/2026, sem `removido_em`). A tela diz isso: a variavel definida pode mudar de natureza, nao voltar a "sem
-- definicao".
--
-- SEGURANCA: SECURITY DEFINER, search_path fixo, EXECUTE so do service_role (REVOKE de PUBLIC, anon e authenticated - o privilegio padrao
-- de producao os daria). Nenhum dado e gravado pela migracao. Nada e apagado. Corpo da funcao em ASCII (a colagem pelo SQL Editor no Windows
-- reescreve o que nao e ASCII, e o prosrc e o artefato - migracao.md, Parte III).
--
-- GUARDA (aborta, nada e criado): a tabela da natureza nao existe (a 20261121000001 nao foi aplicada), ou nao tem a forma conferida
-- (unicidade e CHECKs); falta o log ou a tabela de materias-primas. Reaplicar e seguro (CREATE OR REPLACE do mesmo corpo).
-- VERIFICACAO (aborta): SECURITY DEFINER, search_path, EXECUTE so do service_role.

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_natureza_da_variavel') IS NULL THEN
    RAISE EXCEPTION 'guarda: orcamentista_natureza_da_variavel nao existe em % (usuario %): aplique a 20261121000001 antes.', current_database(), current_user;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_natureza_uma_por_chave' AND contype = 'u')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_natureza_opcao_so_na_politica')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_natureza_linha_formato_so_no_vidro') THEN
    RAISE EXCEPTION 'guarda: orcamentista_natureza_da_variavel nao tem a forma da 20261121000001 (unicidade e CHECKs). Nada foi alterado.';
  END IF;
  IF to_regclass('public.superadmin_alteracao_log') IS NULL OR to_regclass('public.orcamentista_materia_prima') IS NULL THEN
    RAISE EXCEPTION 'guarda: dependencia ausente em %: superadmin_alteracao_log ou orcamentista_materia_prima.', current_database();
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.superadmin_gravar_natureza(p_tenant uuid, p_por uuid, p_linha jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_familia text;
  v_formato text;
  v_variavel text;
  v_natureza text;
  v_opcao text;
  v_chave text;
  v_antes public.orcamentista_natureza_da_variavel%ROWTYPE;
  v_depois public.orcamentista_natureza_da_variavel%ROWTYPE;
BEGIN
  IF p_tenant IS NULL OR p_linha IS NULL OR jsonb_typeof(p_linha) <> 'object' THEN
    RAISE EXCEPTION 'natureza: a empresa e a linha sao obrigatorias.' USING ERRCODE = '22023';
  END IF;
  -- chave desconhecida no objeto e recusa nomeada, nunca ignorada
  SELECT k INTO v_chave FROM jsonb_object_keys(p_linha) k
   WHERE k NOT IN ('familia', 'formato', 'variavel', 'natureza', 'opcao_padrao') LIMIT 1;
  IF v_chave IS NOT NULL THEN
    RAISE EXCEPTION 'natureza: chave desconhecida "%".', v_chave USING ERRCODE = '22023';
  END IF;
  v_familia := p_linha->>'familia';
  v_formato := NULLIF(p_linha->>'formato', '');
  v_variavel := p_linha->>'variavel';
  v_natureza := p_linha->>'natureza';
  v_opcao := CASE WHEN p_linha->>'opcao_padrao' IS NULL THEN NULL ELSE NULLIF(btrim(p_linha->>'opcao_padrao'), '') END;
  IF v_familia IS NULL OR v_variavel IS NULL OR v_natureza IS NULL THEN
    RAISE EXCEPTION 'natureza: familia, variavel e natureza sao obrigatorias.' USING ERRCODE = '22023';
  END IF;
  -- a familia tem de ser de uma materia-prima DA EMPRESA; a de outra empresa e a inexistente recebem a mesma frase
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_materia_prima WHERE tenant_id = p_tenant AND familia = v_familia) THEN
    RAISE EXCEPTION 'natureza: a familia % nao e de nenhuma materia-prima desta empresa.', v_familia USING ERRCODE = '22023';
  END IF;

  -- duas gravacoes da mesma chave se enfileiram
  PERFORM pg_advisory_xact_lock(hashtext('orcamentista_natureza:' || p_tenant::text || ':' || v_familia || ':' || coalesce(v_formato, '') || ':' || v_variavel));

  SELECT * INTO v_antes FROM public.orcamentista_natureza_da_variavel
   WHERE tenant_id = p_tenant AND familia = v_familia AND linha IS NULL AND formato IS NOT DISTINCT FROM v_formato AND variavel = v_variavel
   FOR UPDATE;

  IF FOUND THEN
    IF v_antes.natureza = v_natureza AND v_antes.opcao_padrao IS NOT DISTINCT FROM v_opcao THEN
      RETURN jsonb_build_object('resultado', 'igual', 'linha', to_jsonb(v_antes) - 'tenant_id');
    END IF;
    UPDATE public.orcamentista_natureza_da_variavel
       SET natureza = v_natureza, opcao_padrao = v_opcao, atualizado_por = p_por, atualizado_em = now()
     WHERE id = v_antes.id
     RETURNING * INTO v_depois;
  ELSE
    INSERT INTO public.orcamentista_natureza_da_variavel (tenant_id, familia, linha, formato, variavel, natureza, opcao_padrao, atualizado_por)
    VALUES (p_tenant, v_familia, NULL, v_formato, v_variavel, v_natureza, v_opcao, p_por)
    RETURNING * INTO v_depois;
  END IF;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_natureza_da_variavel', v_depois.id::text,
          CASE WHEN v_antes.id IS NULL THEN NULL ELSE to_jsonb(v_antes) - 'tenant_id' END,
          (to_jsonb(v_depois) - 'tenant_id') || jsonb_build_object('funcao', 'superadmin_gravar_natureza'), p_por);
  RETURN jsonb_build_object('resultado', CASE WHEN v_antes.id IS NULL THEN 'criada' ELSE 'trocada' END, 'linha', to_jsonb(v_depois) - 'tenant_id');
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_gravar_natureza(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_natureza(uuid, uuid, jsonb) TO service_role;

DO $verifica$
DECLARE v_fn record;
BEGIN
  SELECT prosecdef, proconfig INTO v_fn FROM pg_proc WHERE oid = to_regprocedure('public.superadmin_gravar_natureza(uuid, uuid, jsonb)');
  IF NOT FOUND THEN RAISE EXCEPTION 'verificacao: a funcao nao foi criada.'; END IF;
  IF NOT v_fn.prosecdef OR v_fn.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_fn.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: a funcao nao e SECURITY DEFINER com search_path fixo.';
  END IF;
  IF has_function_privilege('anon', 'public.superadmin_gravar_natureza(uuid, uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.superadmin_gravar_natureza(uuid, uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.superadmin_gravar_natureza(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao: o EXECUTE da funcao nao e so do service_role.';
  END IF;
  RAISE NOTICE 'superadmin_gravar_natureza: criada, SECURITY DEFINER, so service_role';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
