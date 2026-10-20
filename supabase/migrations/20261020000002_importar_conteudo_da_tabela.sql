-- ════════════════════════════════════════════════════════════════════════════════════════
-- Atendimentos I.A. — a GRAVAÇÃO ATÔMICA da importação: public.importar_conteudo_da_tabela
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ APLICADA EM PRODUÇÃO em 20/10/2026, pelo SQL Editor do Supabase, projeto
-- ║ jvthwpkwzpangnwhuyvj, a partir do arquivo cru do GitHub (md5 2c0d8d9b16d3e5318064348de6cd5961).
-- ║
-- ║ Medição da sessão de verificação, logo depois: a função existe, prosecdef = true,
-- ║ search_path = public, assinatura (p_tabela_id uuid, p_payload jsonb), e o EXECUTE está
-- ║ negado para anon, authenticated e PUBLIC, e concedido só a service_role.
-- ║
-- ║ NÃO REGISTRADA no ledger — é a QUINTA nessa situação. Ela é uma das TRÊS da série que
-- ║ sobrevivem a rodar duas vezes — esta por ser CREATE OR REPLACE, a 20261019000002 porque
-- ║ recria as políticas que apaga, e a 20261019000003 pelo ON CONFLICT DO NOTHING.
-- ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261020000002_importar_conteudo_da_tabela.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE ELA EXISTE: A ATOMICIDADE QUE O CLIENTE NÃO DÁ.
-- Reimportar uma tabela APAGA as linhas dela nas quatro tabelas de conteúdo e INSERE as novas
-- (cabeçalho da `20261020000001`). Pelo cliente do Supabase isso são várias chamadas HTTP, cada
-- uma na sua transação: se a terceira falhar, as duas primeiras já foram — a tabela fica pela
-- metade, ou vazia, e o fornecedor perde o conteúdo que tinha, sem nada que o devolva. Uma
-- função é UMA chamada e UMA transação: ou as cinco gravações acontecem, ou nenhuma.
--
-- O QUE ELA FAZ, nesta ordem, tudo na mesma transação:
--   1. confere o payload: as quatro listas e os avisos são arrays, as contagens são objeto, e
--      `cruzam`, `nao_cruzam` e `normalizados` vieram. Payload torto é RECUSA, antes de apagar;
--   2. TRAVA a linha da tabela em `orcamentista_tabela` (FOR UPDATE): duas importações da mesma
--      tabela ao mesmo tempo se enfileiram em vez de se misturarem. Tabela que não existe é recusa;
--   3. APAGA as linhas daquela tabela_id nas quatro tabelas de conteúdo;
--   4. INSERE as linhas do payload — as chaves de cada linha são os NOMES DAS COLUNAS, que é o
--      que o leitor (`src/utils/atendimentos-ia-importacao.ts`) já entrega;
--   5. grava UMA linha em `orcamentista_importacao`: `itens`, `regras` e `tipologias` são as
--      contagens do que ESTA FUNÇÃO GRAVOU (ROW_COUNT), não as que o payload declarou;
--      `cruzam`, `nao_cruzam`, `normalizados` e `avisos` vêm do payload, porque são medidas do
--      leitor sobre o arquivo;
--   6. DEVOLVE as contagens que gravou — a rota confere contra o que mandou.
--
-- QUALQUER ERRO desfaz TUDO, inclusive o DELETE: código repetido (UNIQUE), `vendido_por` fora
-- da CHECK, tipo errado num campo, contagem faltando. O conteúdo anterior fica intacto.
--
-- O FORMATO DO PAYLOAD, que a rota monta a partir do leitor:
--   {
--     "importado_por": "<uuid do super admin>" | null,
--     "itens":      [ { "codigo": ..., ...as colunas de orcamentista_tabela_item } ],
--     "regras":     [ { "codigo": ..., ..., "tipologias": ["DP-01", ...] } ],
--     "tipologias": [ { "tipologia": ..., "linha": ..., "n_regras": ..., "n_condicionais": ...,
--                       "variaveis": [...] } ],
--     "formulas":   [ { "linha": ..., "linha_original": ..., ... } ],
--     "contagens":  { "cruzam": n, "nao_cruzam": n, "normalizados": n, ... },
--     "avisos":     [ ... ]
--   }
--   Chave que não é coluna é IGNORADA; coluna que não veio fica NULL (ou viola o NOT NULL dela).
--
-- A CHAMADA É SÓ DO SERVIDOR. SECURITY DEFINER com `search_path` fixo, como as funções da área
-- (`dar_baixa_com_valor_diferente`, `20261016000001`). EXECUTE revogado de PUBLIC, anon e
-- authenticated — o Postgres CONCEDE a PUBLIC por padrão, e sem o REVOKE a função ficaria
-- chamável pelo `.rpc()` do navegador —, e concedido só a `service_role`, que é quem a rota usa.
-- Por isso a função não confere `is_super_admin()`: quem a chama já é a rota, depois de conferir.
--
-- OS COMENTÁRIOS FICAM FORA DO CORPO, de propósito: o corpo entre `$function$` é guardado em
-- `prosrc` como texto, e o que estiver lá vira o artefato (`transformacao-quebra-a-cadeia-de-
-- hash.md`). Corpo sem comentário é corpo que um transporte não tem o que encurtar.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.importar_conteudo_da_tabela(p_tabela_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_itens         integer;
  v_regras        integer;
  v_tipologias    integer;
  v_formulas      integer;
  v_importacao_id uuid;
BEGIN
  IF p_tabela_id IS NULL OR p_payload IS NULL THEN
    RAISE EXCEPTION 'Tabela e payload sao obrigatorios. Nada foi gravado.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_payload->'itens') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'regras') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'tipologias') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'formulas') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'avisos') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'contagens') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Payload invalido: itens, regras, tipologias, formulas e avisos tem de ser listas, e contagens um objeto. Nada foi gravado.'
      USING ERRCODE = '22023';
  END IF;

  IF (p_payload->'contagens'->>'cruzam') IS NULL
     OR (p_payload->'contagens'->>'nao_cruzam') IS NULL
     OR (p_payload->'contagens'->>'normalizados') IS NULL THEN
    RAISE EXCEPTION 'Payload invalido: contagens sem cruzam, nao_cruzam ou normalizados. Nada foi gravado.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.orcamentista_tabela WHERE id = p_tabela_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tabela % nao encontrada. Nada foi gravado.', p_tabela_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.orcamentista_tabela_item           WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_regra           WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_tipologia       WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_formula_familia WHERE tabela_id = p_tabela_id;

  INSERT INTO public.orcamentista_tabela_item (
    tabela_id, codigo, descricao, medida_barra_m, unidade, ncm, peso, ipi, pacote, segmento, custo,
    secao, aliquota_interna_pct, vendido_por,
    valor_metro_interno, valor_barra_interno, valor_metro_12, valor_barra_12
  )
  SELECT
    p_tabela_id, x.codigo, x.descricao, x.medida_barra_m, x.unidade, x.ncm, x.peso, x.ipi, x.pacote, x.segmento, x.custo,
    x.secao, x.aliquota_interna_pct, x.vendido_por,
    x.valor_metro_interno, x.valor_barra_interno, x.valor_metro_12, x.valor_barra_12
  FROM jsonb_to_recordset(p_payload->'itens') AS x(
    codigo text, descricao text, medida_barra_m numeric, unidade text, ncm text, peso numeric, ipi numeric,
    pacote text, segmento text, custo numeric, secao text, aliquota_interna_pct numeric, vendido_por text,
    valor_metro_interno numeric, valor_barra_interno numeric, valor_metro_12 numeric, valor_barra_12 numeric
  );
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_regra (
    tabela_id, codigo, descricao, segmento, cor, codigo_wvetro, linha, tipo, eixo, corte,
    formula_medida, formula_em_lh, formula_qtde, condicao, obs, tipologias
  )
  SELECT
    p_tabela_id, x.codigo, x.descricao, x.segmento, x.cor, x.codigo_wvetro, x.linha, x.tipo, x.eixo, x.corte,
    x.formula_medida, x.formula_em_lh, x.formula_qtde, x.condicao, x.obs, x.tipologias
  FROM jsonb_to_recordset(p_payload->'regras') AS x(
    codigo text, descricao text, segmento text, cor text, codigo_wvetro text, linha text, tipo text, eixo text,
    corte text, formula_medida text, formula_em_lh text, formula_qtde text, condicao text, obs text, tipologias text[]
  );
  GET DIAGNOSTICS v_regras = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_tipologia (tabela_id, tipologia, linha, n_regras, n_condicionais, variaveis)
  SELECT p_tabela_id, x.tipologia, x.linha, x.n_regras, x.n_condicionais, x.variaveis
  FROM jsonb_to_recordset(p_payload->'tipologias') AS x(
    tipologia text, linha text, n_regras integer, n_condicionais integer, variaveis text[]
  );
  GET DIAGNOSTICS v_tipologias = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_formula_familia (
    tabela_id, linha, linha_original, variavel, descricao, formula, formula_em_lh, pct_padrao
  )
  SELECT p_tabela_id, x.linha, x.linha_original, x.variavel, x.descricao, x.formula, x.formula_em_lh, x.pct_padrao
  FROM jsonb_to_recordset(p_payload->'formulas') AS x(
    linha text, linha_original text, variavel text, descricao text, formula text, formula_em_lh text, pct_padrao numeric
  );
  GET DIAGNOSTICS v_formulas = ROW_COUNT;

  INSERT INTO public.orcamentista_importacao (
    tabela_id, importado_por, itens, regras, tipologias, cruzam, nao_cruzam, normalizados, avisos
  )
  VALUES (
    p_tabela_id,
    (p_payload->>'importado_por')::uuid,
    v_itens,
    v_regras,
    v_tipologias,
    (p_payload->'contagens'->>'cruzam')::integer,
    (p_payload->'contagens'->>'nao_cruzam')::integer,
    (p_payload->'contagens'->>'normalizados')::integer,
    p_payload->'avisos'
  )
  RETURNING id INTO v_importacao_id;

  RETURN jsonb_build_object(
    'importacao_id', v_importacao_id,
    'itens',         v_itens,
    'regras',        v_regras,
    'tipologias',    v_tipologias,
    'formulas',      v_formulas
  );
END;
$function$;

COMMENT ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) IS
  'Grava a importacao de UMA tabela numa transacao: apaga e insere as quatro tabelas de conteudo e grava uma linha em orcamentista_importacao. Qualquer erro desfaz tudo, inclusive o DELETE. Devolve as contagens gravadas para a rota conferir. Chamada pela rota de API com service_role - nunca pelo navegador.';

-- O `EXECUTE` a `PUBLIC` é CONCEDIDO POR PADRÃO pelo Postgres. Sem estas quatro linhas a
-- função ficaria chamável por `.rpc()` do navegador.
REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) TO service_role;

COMMIT;

-- Depois do COMMIT, passo SEPARADO (`migration-delivery.md`) — sem ele o PostgREST não enxerga
-- a função nova pelo `.rpc()`:
--   NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar.
--
-- `plpgsql` NÃO valida referências na criação: achar a função em `pg_proc` prova que o CREATE
-- rodou, não que ela funciona (`migration-delivery.md`). Por isso as dependências são conferidas
-- ANTES, e a função é EXERCITADA depois, numa transação desfeita.
--
-- (0) ANTES de aplicar — as dependências existem, e a função ainda não:
--   select count(*) from pg_class
--    where relnamespace = 'public'::regnamespace
--      and relname in ('orcamentista_tabela','orcamentista_tabela_item','orcamentista_motor_regra',
--                      'orcamentista_motor_tipologia','orcamentista_motor_formula_familia',
--                      'orcamentista_importacao');
--   esperado: 6.
--   select count(*) from pg_proc where proname = 'importar_conteudo_da_tabela';
--   esperado: 0.
--
-- (1) A função existe, SECURITY DEFINER, com search_path fixo:
--   select p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p where p.proname = 'importar_conteudo_da_tabela';
--   esperado: true · {search_path=public} · p_tabela_id uuid, p_payload jsonb
--
-- (2) EXECUTE só para service_role:
--   select r.rolname, has_function_privilege(r.rolname, 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'EXECUTE')
--     from pg_roles r where r.rolname in ('anon','authenticated','service_role');
--   esperado: anon false · authenticated false · service_role true
--
-- (3) EXERCITAR sem deixar rastro — numa transação DESFEITA, com uma tabela que existe:
--   begin;
--   select public.importar_conteudo_da_tabela(
--     (select id from public.orcamentista_tabela limit 1),
--     '{"importado_por":null,"itens":[{"codigo":"T1","valor_metro_interno":1.5}],
--       "regras":[{"codigo":"T1","tipologias":["DP-01"]}],
--       "tipologias":[{"tipologia":"DP-01","n_regras":1,"n_condicionais":0,"variaveis":[]}],
--       "formulas":[],"contagens":{"cruzam":1,"nao_cruzam":0,"normalizados":0},"avisos":[]}'::jsonb);
--   rollback;
--   esperado: {"itens": 1, "regras": 1, "tipologias": 1, "formulas": 0, "importacao_id": ...}
--   ATENÇÃO: sem o ROLLBACK isto APAGA o conteúdo real daquela tabela. É o comportamento da
--   função — substituir —, e é por isso que o teste tem de ser desfeito.
-- ════════════════════════════════════════════════════════════════════════════════════════
