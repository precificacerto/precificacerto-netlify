-- 20261116000006_campos_das_observacoes.sql
--
-- A DECISAO DO DONO DO PRODUTO, 16/11/2026: "As observacoes elas vao ser oriundas das pre-definicoes que nos temos na
-- base de conhecimento [...] dentro da base de conhecimento, a gente pode criar uma secao de observacao com as
-- variaveis." E, perguntado quais variaveis: "Tome como base as informacoes que nos adicionaremos a base de
-- conhecimento [...] como referencia e o que consta nesse arquivo" -- o orcamento 1154 da De Paula, que ele subiu.
--
-- A REFERENCIA, extraida do PDF dele (pdftotext, literal), e o que estes campos guardam:
--     Prazos de entrega apos a medicao final (salvo alteracoes em periodo de ferias coletivas).
--     PVC: BRANCO 45 DIAS / LAMINADO TOTAL 60 DIAS / LAMINADO SOMENTE EXTERNO 75 DIAS
--     ALUMINIO: CORES PADROES 45 DIAS / CORES ESPECIAIS 90 DIAS
--     PROPOSTA VALIDA POR 7 DIAS A PARTIR DA EMISSAO DA PRESENTE DATA.
--     NAO CONTEMPLA REMOCAO E DESCARTE DE ESQUADRIA EXISTENTE.
--     NAO INCLUSO NO ORCAMENTO LOCACAO DE PLATAFORMAS E GUINDASTES [...]
--     Forma de Pagamento: 50% de Entrada - R$ 14.962,63 / 50% na Entrega - R$ 14.962,62 / Total: R$ 29.925,25
--
-- O QUE ESTA MIGRACAO FAZ: a coluna `tenant_settings.orcamento_observacoes_campos` (jsonb, NULA = nao informado) e a
-- funcao que a grava, com log. NENHUM DADO ALTERADO: a coluna nasce nula em todas as linhas.
--
-- O VALOR EM REAIS DAS PARCELAS NAO E GRAVADO: so o PERCENTUAL e o rotulo. Os reais saem do total do orcamento, na
-- hora de imprimir, e fecham ao centavo. Gravar valor seria o numero velho num orcamento novo (`fato-vs-referencia`).
--
-- A GUARDA DO BANCO cobre o que vira DINHEIRO: as parcelas, quando ha, somam 100%. O resto da forma (linha vazia,
-- dia nao inteiro, lista grande demais) e conferido no TS, que e a frase que o usuario le antes de salvar.
--
-- QUEM APAGA E REGRAVA `tenant_settings`: PROCURADO em 16/11/2026, em `src/` e nas funcoes do banco -- NINGUEM
-- (`tabela-que-a-importacao-apaga.md`, o corolario aplicavel ANTES). A coluna nova nao tem quem a apague.

ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS orcamento_observacoes_campos jsonb;

COMMENT ON COLUMN public.tenant_settings.orcamento_observacoes_campos IS
  'As VARIAVEIS do bloco OBSERVACOES do orcamento (dono do produto, 16/11/2026): prazos por grupo e acabamento, validade em dias, exclusoes e as parcelas do pagamento em PERCENTUAL. Os reais saem do total, nunca daqui. NULA = nao informado.';

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_observacoes_campos_objeto') THEN
    IF EXISTS (SELECT 1 FROM public.tenant_settings WHERE orcamento_observacoes_campos IS NOT NULL) THEN
      RAISE EXCEPTION 'ha linha com orcamento_observacoes_campos preenchida antes da CHECK: conferir uma a uma.' USING ERRCODE = '22023';
    END IF;
    ALTER TABLE public.tenant_settings ADD CONSTRAINT tenant_settings_observacoes_campos_objeto
      CHECK (orcamento_observacoes_campos IS NULL
             OR (jsonb_typeof(orcamento_observacoes_campos) = 'object'
                 AND char_length(orcamento_observacoes_campos::text) <= 20000));
  END IF;
END $check$;

CREATE OR REPLACE FUNCTION public.superadmin_gravar_campos_das_observacoes(p_tenant uuid, p_por uuid, p_campos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_campos jsonb;
  v_antes jsonb;
  v_tipo text;
  v_soma numeric;
  v_parcelas int;
BEGIN
  IF p_tenant IS NULL THEN RAISE EXCEPTION 'tenant: obrigatorio.' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'a empresa nao existe.' USING ERRCODE = '22023';
  END IF;

  v_tipo := jsonb_typeof(coalesce(p_campos, 'null'::jsonb));
  IF v_tipo NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'campos: esperado objeto ou null, veio %.', v_tipo USING ERRCODE = '22023';
  END IF;
  v_campos := CASE WHEN v_tipo = 'object' THEN p_campos ELSE NULL END;

  IF v_campos IS NOT NULL THEN
    IF char_length(v_campos::text) > 20000 THEN
      RAISE EXCEPTION 'campos: % caracteres, acima do limite de 20000.', char_length(v_campos::text) USING ERRCODE = '22023';
    END IF;
    -- A GUARDA DO DINHEIRO: as parcelas, quando ha, somam 100%. Sem isso, o bloco imprimiria um total que nao e o
    -- do orcamento -- e o cliente leria parcelas que nao fecham com o que ele vai pagar.
    IF jsonb_typeof(v_campos -> 'pagamento') = 'array' THEN
      SELECT count(*), coalesce(sum((p ->> 'percentual')::numeric), 0)
        INTO v_parcelas, v_soma
        FROM jsonb_array_elements(v_campos -> 'pagamento') p;
      IF v_parcelas > 0 AND round(v_soma, 6) <> 100 THEN
        RAISE EXCEPTION 'pagamento: as parcelas somam %%%, e tem de somar 100%%.', round(v_soma, 6) USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  SELECT s.orcamento_observacoes_campos INTO v_antes FROM public.tenant_settings s WHERE s.tenant_id = p_tenant;
  IF NOT FOUND THEN
    INSERT INTO public.tenant_settings (tenant_id, orcamento_observacoes_campos) VALUES (p_tenant, v_campos);
  ELSIF v_antes IS NOT DISTINCT FROM v_campos THEN
    RETURN jsonb_build_object('resultado', 'igual', 'tem_campos', v_campos IS NOT NULL);
  ELSE
    UPDATE public.tenant_settings SET orcamento_observacoes_campos = v_campos, updated_at = now() WHERE tenant_id = p_tenant;
  END IF;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'tenant_settings', 'orcamento_observacoes_campos', v_antes, v_campos, p_por);
  RETURN jsonb_build_object('resultado', CASE WHEN v_campos IS NULL THEN 'limpa' ELSE 'gravada' END,
                            'tem_campos', v_campos IS NOT NULL);
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.superadmin_gravar_campos_das_observacoes(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_campos_das_observacoes(uuid, uuid, jsonb) TO service_role;

DO $verifica$
DECLARE v_src text; v_acl text; v_tipo text; BEGIN
  SELECT c.data_type INTO v_tipo FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'tenant_settings' AND c.column_name = 'orcamento_observacoes_campos';
  IF v_tipo IS DISTINCT FROM 'jsonb' THEN RAISE EXCEPTION 'a coluna nao e jsonb: %', coalesce(v_tipo, '(ausente)'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_observacoes_campos_objeto') THEN
    RAISE EXCEPTION 'a CHECK do objeto nao existe depois do ALTER.';
  END IF;

  SELECT p.prosrc, array_to_string(p.proacl, ',') INTO v_src, v_acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'superadmin_gravar_campos_das_observacoes';
  IF v_src IS NULL THEN RAISE EXCEPTION 'a funcao nao existe depois do CREATE.'; END IF;
  IF position('somam' in v_src) = 0 THEN RAISE EXCEPTION 'o corpo gravado perdeu a guarda das parcelas.'; END IF;
  IF v_acl IS NULL OR position('anon=' in v_acl) > 0 OR position('authenticated=' in v_acl) > 0 THEN
    RAISE EXCEPTION 'a funcao ficou acessivel a anon ou authenticated: %', coalesce(v_acl, '(nula)');
  END IF;
  RAISE NOTICE 'orcamento_observacoes_campos criada (nula em todas as linhas) e a funcao so para service_role.';
END $verifica$;
