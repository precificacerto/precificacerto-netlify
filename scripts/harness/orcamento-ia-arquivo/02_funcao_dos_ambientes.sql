-- O que a 20261109000005 lê de produção além da cadeia 0001..0004: a função dos ambientes, copiada da 20261106000002 sem mudar um byte
-- do corpo (a guarda confere o md5 dele, 39519b7c045dec627a6e5e47d7894409), com o EXECUTE como em produção.
CREATE OR REPLACE FUNCTION public.orcamentista_levantamento_ambientes_validos(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  e jsonb;
  v_chaves text[];
  v_nome text;
  v_nomes text[] := ARRAY[]::text[];
  v_qtd numeric;
BEGIN
  -- nulo = nao informado; o informado e uma lista nao vazia de {"ambiente": texto, "quantidade": inteiro > 0}, e nada mais;
  -- o mesmo ambiente duas vezes no mesmo item (sem olhar a caixa) e erro de digitacao, nao dois ambientes
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) = 0 THEN RETURN false; END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p) AS t(x) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RETURN false; END IF;
    SELECT array_agg(k ORDER BY k) INTO v_chaves FROM jsonb_object_keys(e) AS t(k);
    IF v_chaves IS DISTINCT FROM ARRAY['ambiente', 'quantidade'] THEN RETURN false; END IF;
    IF jsonb_typeof(e -> 'ambiente') <> 'string' OR jsonb_typeof(e -> 'quantidade') <> 'number' THEN RETURN false; END IF;
    v_nome := e ->> 'ambiente';
    IF v_nome !~ '^\S(.*\S)?$' OR char_length(v_nome) > 80 THEN RETURN false; END IF;
    IF lower(v_nome) = ANY (v_nomes) THEN RETURN false; END IF;
    v_nomes := v_nomes || lower(v_nome);
    v_qtd := (e ->> 'quantidade')::numeric;
    IF v_qtd <> trunc(v_qtd) OR v_qtd < 1 OR v_qtd > 2147483647 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) TO service_role;
