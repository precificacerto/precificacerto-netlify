-- 20261116000004_observacoes_do_orcamento.sql
--
-- A DECISAO DO DONO DO PRODUTO, 16/11/2026: ele mandou o orcamento 1154 da De Paula (gerado pelo WVetro) como modelo
-- da ORGANIZACAO e pediu enfase nas OBSERVACOES. Perguntado de onde o texto deve vir, escolheu: DA BASE DE
-- CONHECIMENTO DA EMPRESA -- um texto fixo por empresa, gravado uma vez, impresso igual em todo orcamento.
--
-- O ESTADO MEDIDO em 16/11/2026: o arquivo do orcamento JA desenha o bloco "OBSERVACOES" no rodape, e o corpo dele sai
-- SEMPRE VAZIO, porque `lerDadosDoArquivo` manda `observacoesGerais: null` -- o cabecalho de `arquivo-do-orcamento-
-- servidor.ts` diz, desde 11/11: "OBSERVACOES gerais (prazos, validade, exclusoes): NAO HA, hoje, de onde le-las".
-- Nenhuma coluna do banco guardava esse texto (as 50 colunas de `tenant_settings` foram listadas: nenhuma serve).
-- No modelo dele o bloco traz prazos de entrega por material e cor, a validade da proposta e as exclusoes.
--
-- O QUE ESTA MIGRACAO FAZ: a coluna `tenant_settings.orcamento_observacoes` (texto, NULA = nao informado) e a funcao
-- que a grava, com log, no padrao das outras da base de conhecimento. NENHUM DADO ALTERADO: a coluna nasce nula em
-- todas as linhas, e o texto e digitado pela tela, uma empresa de cada vez.
--
-- QUEM APAGA E REGRAVA `tenant_settings` (`tabela-que-a-importacao-apaga.md`, o corolario aplicavel ANTES): PROCURADO
-- em 16/11/2026, em `src/` e nas funcoes do banco -- NINGUEM. Nenhum `.delete()`, nenhum `DELETE FROM tenant_settings`
-- e nenhum upsert de lista fixa de colunas. A coluna nova nao tem quem a apague.
--
-- A FORMA: ate 3.000 caracteres, aparado, com quebras de linha (o bloco do PDF as respeita). NULO = nao informado, e
-- o bloco sai vazio como hoje; vazio e so-espaco contam como nulo (`ausente-vs-falso.md`). O limite e o que cabe no
-- rodape de uma pagina A4 junto com o fecho: medido, 3.000 caracteres dao cerca de 28 linhas (95 mm) e sobram mais de
-- 100 mm para o fecho e a margem.

ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS orcamento_observacoes text;

COMMENT ON COLUMN public.tenant_settings.orcamento_observacoes IS
  'As OBSERVACOES do arquivo do orcamento (dono do produto, 16/11/2026): prazos, validade e exclusoes, por empresa. NULA = nao informado, e o bloco sai vazio.';

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_orcamento_observacoes_forma') THEN
    -- a CHECK so pode entrar se nenhuma linha a violar; todas sao nulas hoje, e a guarda abaixo confere
    IF EXISTS (SELECT 1 FROM public.tenant_settings WHERE orcamento_observacoes IS NOT NULL) THEN
      RAISE EXCEPTION 'ha linha com orcamento_observacoes preenchida antes da CHECK: conferir uma a uma.' USING ERRCODE = '22023';
    END IF;
    ALTER TABLE public.tenant_settings ADD CONSTRAINT tenant_settings_orcamento_observacoes_forma
      CHECK (orcamento_observacoes IS NULL
             OR (orcamento_observacoes = btrim(orcamento_observacoes)
                 AND char_length(orcamento_observacoes) BETWEEN 1 AND 3000));
  END IF;
END $check$;

CREATE OR REPLACE FUNCTION public.superadmin_gravar_observacoes_do_orcamento(p_tenant uuid, p_por uuid, p_texto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_texto text;
  v_antes text;
  v_tipo text;
BEGIN
  IF p_tenant IS NULL THEN RAISE EXCEPTION 'tenant: obrigatorio.' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'a empresa nao existe.' USING ERRCODE = '22023';
  END IF;

  -- o que chega: texto ou null. Qualquer outro tipo e recusa nomeada, nunca um valor silencioso
  v_tipo := jsonb_typeof(coalesce(p_texto, 'null'::jsonb));
  IF v_tipo NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'observacoes: esperado texto ou null, veio %.', v_tipo USING ERRCODE = '22023';
  END IF;
  v_texto := CASE WHEN v_tipo = 'string' THEN btrim(p_texto #>> '{}') ELSE NULL END;
  IF v_texto = '' THEN v_texto := NULL; END IF;

  IF v_texto IS NOT NULL AND char_length(v_texto) > 3000 THEN
    RAISE EXCEPTION 'observacoes: % caracteres, acima do limite de 3000.', char_length(v_texto) USING ERRCODE = '22023';
  END IF;

  -- a linha de settings da empresa pode nao existir ainda: nasce com as observacoes, e so com elas
  SELECT s.orcamento_observacoes INTO v_antes FROM public.tenant_settings s WHERE s.tenant_id = p_tenant;
  IF NOT FOUND THEN
    INSERT INTO public.tenant_settings (tenant_id, orcamento_observacoes) VALUES (p_tenant, v_texto);
  ELSIF v_antes IS NOT DISTINCT FROM v_texto THEN
    -- o mesmo texto nao grava nem loga
    RETURN jsonb_build_object('resultado', 'igual', 'tem_observacoes', v_texto IS NOT NULL);
  ELSE
    UPDATE public.tenant_settings SET orcamento_observacoes = v_texto, updated_at = now() WHERE tenant_id = p_tenant;
  END IF;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'tenant_settings', 'orcamento_observacoes',
          to_jsonb(v_antes), to_jsonb(v_texto), p_por);
  RETURN jsonb_build_object('resultado', CASE WHEN v_texto IS NULL THEN 'limpa' ELSE 'gravada' END,
                            'tem_observacoes', v_texto IS NOT NULL);
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.superadmin_gravar_observacoes_do_orcamento(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_observacoes_do_orcamento(uuid, uuid, jsonb) TO service_role;

DO $verifica$
DECLARE v_src text; v_acl text; v_tipo text; BEGIN
  SELECT c.data_type INTO v_tipo FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'tenant_settings' AND c.column_name = 'orcamento_observacoes';
  IF v_tipo IS DISTINCT FROM 'text' THEN RAISE EXCEPTION 'a coluna nao e text: %', coalesce(v_tipo, '(ausente)'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_orcamento_observacoes_forma') THEN
    RAISE EXCEPTION 'a CHECK da forma nao existe depois do ALTER.';
  END IF;

  SELECT p.prosrc, array_to_string(p.proacl, ',') INTO v_src, v_acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'superadmin_gravar_observacoes_do_orcamento';
  IF v_src IS NULL THEN RAISE EXCEPTION 'a funcao nao existe depois do CREATE.'; END IF;
  IF position('3000' in v_src) = 0 THEN RAISE EXCEPTION 'o corpo gravado perdeu o limite de tamanho.'; END IF;
  IF position('btrim' in v_src) = 0 THEN RAISE EXCEPTION 'o corpo gravado perdeu o aparo do texto.'; END IF;
  IF v_acl IS NULL OR position('anon=' in v_acl) > 0 OR position('authenticated=' in v_acl) > 0 THEN
    RAISE EXCEPTION 'a funcao ficou acessivel a anon ou authenticated: %', coalesce(v_acl, '(nula)');
  END IF;
  RAISE NOTICE 'orcamento_observacoes criada (nula em todas as linhas) e superadmin_gravar_observacoes_do_orcamento so para service_role.';
END $verifica$;
