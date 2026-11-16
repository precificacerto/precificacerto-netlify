-- 20261116000003_marca_da_empresa.sql
--
-- A DECISAO DO DONO DO PRODUTO, 16/11/2026: "No orcamento esta faltando a marca da empresa. [...] adicionar a marca
-- da empresa" -- e, perguntado onde o campo deveria ficar: NA BASE DE CONHECIMENTO DA EMPRESA (a logo e de cada
-- empresa; o catalogo do nicho e global e serviria a mesma marca para todas).
--
-- O ESTADO MEDIDO em 16/11/2026: o arquivo do orcamento JA desenha a logo no canto esquerdo do cabecalho, lendo
-- `tenant_settings.logo_url` (ou `tenants.logo_url`). A coluna existe, o PDF a usa -- e NENHUMA TELA DO SISTEMA A
-- GRAVA (busca por `logo_url` em src/: so os tipos, o leitor do PDF e o teste dele). Por isso o espaco sai em branco:
-- na De Paula os dois campos estao nulos.
--
-- O QUE ESTA MIGRACAO FAZ: so a funcao que grava a marca, com log, no padrao das outras da base de conhecimento.
-- Nenhuma coluna nova, nenhum dado alterado: a logo e gravada pela tela, uma empresa de cada vez.
--
-- A FORMA DA MARCA: um data URL de PNG ou JPEG -- o mesmo que `lerLogo` ja aceita sem baixar nada, sem URL que
-- expira e sem bucket novo. Ate 400.000 caracteres (~300 KB de imagem), que e o teto do que cabe num cabecalho de
-- PDF sem pesar o arquivo. NULO LIMPA a marca; vazio e so-espaco contam como nulo (`ausente-vs-falso.md`).

CREATE OR REPLACE FUNCTION public.superadmin_gravar_marca_da_empresa(p_tenant uuid, p_por uuid, p_logo jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_logo text;
  v_antes text;
  v_tipo text;
BEGIN
  IF p_tenant IS NULL THEN RAISE EXCEPTION 'tenant: obrigatorio.' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'a empresa nao existe.' USING ERRCODE = '22023';
  END IF;

  -- o que chega: texto (o data URL) ou null. Qualquer outro tipo e recusa nomeada, nunca um valor silencioso
  v_tipo := jsonb_typeof(coalesce(p_logo, 'null'::jsonb));
  IF v_tipo NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'marca: esperado texto ou null, veio %.', v_tipo USING ERRCODE = '22023';
  END IF;
  v_logo := CASE WHEN v_tipo = 'string' THEN btrim(p_logo #>> '{}') ELSE NULL END;
  IF v_logo = '' THEN v_logo := NULL; END IF;

  IF v_logo IS NOT NULL THEN
    IF v_logo !~* '^data:image/(png|jpeg|jpg);base64,[A-Za-z0-9+/]+={0,2}$' THEN
      RAISE EXCEPTION 'marca: so PNG ou JPEG, como data URL base64.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_logo) > 400000 THEN
      RAISE EXCEPTION 'marca: % caracteres, acima do limite de 400000 (cerca de 300 KB de imagem).', char_length(v_logo)
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- a linha de settings da empresa pode nao existir ainda: nasce com a marca, e so com ela
  SELECT s.logo_url INTO v_antes FROM public.tenant_settings s WHERE s.tenant_id = p_tenant;
  IF NOT FOUND THEN
    INSERT INTO public.tenant_settings (tenant_id, logo_url) VALUES (p_tenant, v_logo);
  ELSIF v_antes IS NOT DISTINCT FROM v_logo THEN
    -- a mesma marca nao grava nem loga
    RETURN jsonb_build_object('resultado', 'igual', 'tem_marca', v_logo IS NOT NULL);
  ELSE
    UPDATE public.tenant_settings SET logo_url = v_logo, updated_at = now() WHERE tenant_id = p_tenant;
  END IF;

  -- o LOG nao leva a imagem: so o tamanho e se havia marca antes (o data URL tem centenas de milhares de caracteres)
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'tenant_settings', 'logo_url',
          jsonb_build_object('tem_marca', v_antes IS NOT NULL, 'caracteres', coalesce(char_length(v_antes), 0)),
          jsonb_build_object('tem_marca', v_logo IS NOT NULL, 'caracteres', coalesce(char_length(v_logo), 0)),
          p_por);
  RETURN jsonb_build_object('resultado', CASE WHEN v_logo IS NULL THEN 'limpa' ELSE 'gravada' END, 'tem_marca', v_logo IS NOT NULL);
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.superadmin_gravar_marca_da_empresa(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_marca_da_empresa(uuid, uuid, jsonb) TO service_role;

DO $verifica$
DECLARE v_src text; v_acl text; BEGIN
  SELECT p.prosrc, array_to_string(p.proacl, ',') INTO v_src, v_acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'superadmin_gravar_marca_da_empresa';
  IF v_src IS NULL THEN RAISE EXCEPTION 'a funcao nao existe depois do CREATE.'; END IF;
  IF position('data:image/(png|jpeg|jpg)' in v_src) = 0 THEN RAISE EXCEPTION 'o corpo gravado perdeu a guarda do formato.'; END IF;
  IF position('400000' in v_src) = 0 THEN RAISE EXCEPTION 'o corpo gravado perdeu o limite de tamanho.'; END IF;
  IF v_acl IS NULL OR position('anon=' in v_acl) > 0 OR position('authenticated=' in v_acl) > 0 THEN
    RAISE EXCEPTION 'a funcao ficou acessivel a anon ou authenticated: %', coalesce(v_acl, '(nula)');
  END IF;
  RAISE NOTICE 'superadmin_gravar_marca_da_empresa criada, so para service_role.';
END $verifica$;
