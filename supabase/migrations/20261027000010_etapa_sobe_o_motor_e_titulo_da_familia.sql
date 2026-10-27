-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000010 — A ETAPA SOBE O MOTOR, E O TÍTULO DA FAMÍLIA É DIGITADO.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.
-- ║ SEM ELA O CÓDIGO QUEBRA: subir o arquivo do motor numa etapa chama `superadmin_criar_motor_da_etapa`, e
-- ║ renomear a matéria-prima chama `superadmin_renomear_materia_prima`; sem as funções, as duas telas dão 500.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ Pressupõe a 20261027000002, a 20261027000003, a 20261027000006 e a 20261027000008 (aplicadas).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 27/10/2026, à noite: "O MOTOR MORA NA FAMÍLIA, NA BASE DE CONHECIMENTO." A lista de etapas é a
-- lista de motores: cada linha de etapa tem o seu campo de ARQUIVO, e subir o arquivo CRIA a linha em `orcamentista_motor` (família = a
-- da etapa, sem fornecedor) e JÁ grava o `motor_id` da etapa, numa transação só. O motor é GLOBAL (opção A): não se duplica por conta.
-- E "o rótulo da família é digitado pelo consultor, e é ele o título": `orcamentista_materia_prima.nome` volta a ser usado, e passa a poder
-- ser mudado (antes "o nome da gravada não se edita": a chave é `lower(nome)` e não existia renomear).
--
-- O QUE FAZ — e só isto:
--   A. `superadmin_criar_motor_da_etapa(p_etapa, p_por, p_arquivo_path, p_arquivo_nome, p_payload)`: SECURITY DEFINER, com log, numa
--      transação: cria o motor, grava as 12 tabelas de conteúdo por `motor_id`, grava a linha de `orcamentista_importacao` e aponta a
--      etapa. TROCAR o arquivo é a mesma chamada: cria o motor novo, aponta a etapa para ele, e o velho fica arquivável (a
--      `superadmin_arquivar_motor` da 20261027000008 só recusa arquivar o que uma etapa aponta). Serializa com `superadmin_gravar_etapas_da_familia`
--      (mesmo advisory lock da família). `statement_timeout` de 35 s, como a importação da tabela.
--   B. `superadmin_renomear_materia_prima(p_tenant, p_por, p_materia_prima, p_nome)`: SECURITY DEFINER, com log. O nome é livre (1 a 80
--      caracteres, sem espaço nas pontas); repetir o de outra matéria-prima da mesma empresa (`lower(nome)`) é recusa nomeada.
--
-- O QUE NÃO FAZ:
--   - NÃO toca nos tempos: `orcamentista_motor_tipologia_tempo` fica como está (os 164, 600/300/900, ESTIMADO, servem para o teste — decisão do
--     dono do produto, 27/10/2026). Um motor criado por esta função NASCE SEM TEMPO.
--   - NÃO apaga nem arquiva motor, nem muda a importação da tabela (`importar_conteudo_da_tabela` segue como está), nem as leituras da conversa.
--   - NENHUM UPDATE, DELETE ou DROP de dado existente: as funções só INSERT em `orcamentista_motor` e nas tabelas de conteúdo, e só UPDATE no
--     `motor_id`/autoria da etapa e no `nome`/autoria da matéria-prima. Esta migração, ao ser aplicada, não executa nenhuma delas.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION; REVOKE/GRANT repetíveis.
-- VERIFICAÇÃO (aborta): as duas existem, fechadas (só service_role), SECURITY DEFINER com search_path fixo, a primeira com o statement_timeout.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_motor') IS NULL OR to_regclass('public.orcamentista_familia_etapa') IS NULL
     OR to_regclass('public.orcamentista_importacao') IS NULL OR to_regclass('public.orcamentista_materia_prima') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: as tabelas do motor ou da materia-prima. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_importacao' AND column_name = 'motor_id') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_importacao.motor_id (20261027000002). Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)') IS NULL OR to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: as funcoes da 20261027000003/000008. Nada foi alterado.';
  END IF;
  IF to_regclass('public.superadmin_alteracao_log') IS NULL OR to_regclass('public.users') IS NULL OR to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: superadmin_alteracao_log, users ou tenants. Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. a etapa sobe o motor ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_criar_motor_da_etapa(
  p_etapa uuid, p_por uuid, p_arquivo_path text, p_arquivo_nome text, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '35s'
AS $fn$
DECLARE
  v_familia       text;
  v_antes         jsonb;
  v_depois        jsonb;
  v_motor         uuid;
  v_motor_antes   uuid;
  v_prefixo       text;
  v_path          text := btrim(p_arquivo_path);
  v_nome          text := btrim(p_arquivo_nome);
  v_importacao_id uuid;
  v_regras        integer;
  v_tipologias    integer;
  v_formulas      integer;
  v_detalhes      integer;
  v_formulas_da_tipologia integer;
  v_perfis        integer;
  v_vidros        integer;
  v_baguetes      integer;
  v_insumos       integer;
  v_variaveis_da_tipologia integer;
  v_validacoes    integer;
  v_otimizacao    integer;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_etapa IS NULL OR p_payload IS NULL OR v_path IS NULL OR v_path = '' OR v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'etapa, arquivo (caminho e nome) e payload sao obrigatorios. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- a familia da etapa (sem trava) para tomar o advisory lock ANTES da trava da linha: e a mesma ordem de superadmin_gravar_etapas_da_familia
  SELECT e.familia INTO v_familia FROM public.orcamentista_familia_etapa e WHERE e.id = p_etapa;
  IF v_familia IS NULL THEN
    RAISE EXCEPTION 'etapa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_etapas_da_familia:' || v_familia, 0));
  SELECT to_jsonb(e), e.motor_id INTO v_antes, v_motor_antes
    FROM public.orcamentista_familia_etapa e WHERE e.id = p_etapa FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'etapa inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- o arquivo mora na pasta DA FAMILIA da etapa: o caminho que a rota assinou, e nenhum outro
  v_prefixo := 'familia/' || v_familia || '/motor/';
  IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN
    RAISE EXCEPTION 'o arquivo nao esta na pasta da familia %', v_familia USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF jsonb_typeof(p_payload->'regras') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'tipologias') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'formulas') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'avisos') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'contagens') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload->'detalhes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'formulas_da_tipologia') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'perfis') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'vidros') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'baguetes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'insumos') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'variaveis_da_tipologia') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'validacoes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'otimizacao') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Payload invalido: regras, tipologias, formulas, avisos e as nove abas do motor tem de ser listas, e contagens um objeto. Nada foi gravado.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_payload ? 'itens' AND jsonb_typeof(p_payload->'itens') = 'array' AND jsonb_array_length(p_payload->'itens') > 0 THEN
    RAISE EXCEPTION 'Payload invalido: o motor da familia nao leva itens de preco. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (p_payload->'contagens'->>'normalizados') IS NULL THEN
    RAISE EXCEPTION 'Payload invalido: contagens sem normalizados. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_array_length(p_payload->'detalhes') = 0 THEN
    RAISE EXCEPTION 'O arquivo nao traz nenhuma tipologia: um motor sem tipologia nao e motor. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1. o motor: da familia, sem fornecedor, nao vigente (a vigente era do par familia + fornecedor)
  INSERT INTO public.orcamentista_motor (familia, fornecedor_id, arquivo_nome, arquivo_path, vigente, criado_por)
  VALUES (v_familia, NULL, v_nome, v_path, false, p_por)
  RETURNING id INTO v_motor;

  -- 2. o conteudo, por motor_id (as mesmas listas e colunas de importar_conteudo_da_tabela, sem os itens de preco)
  INSERT INTO public.orcamentista_motor_regra (
    motor_id, codigo, descricao, segmento, cor, codigo_wvetro, linha, tipo, eixo, corte,
    formula_medida, formula_em_lh, formula_qtde, condicao, obs, tipologias
  )
  SELECT
    v_motor, x.codigo, x.descricao, x.segmento, x.cor, x.codigo_wvetro, x.linha, x.tipo, x.eixo, x.corte,
    x.formula_medida, x.formula_em_lh, x.formula_qtde, x.condicao, x.obs, x.tipologias
  FROM jsonb_to_recordset(p_payload->'regras') AS x(
    codigo text, descricao text, segmento text, cor text, codigo_wvetro text, linha text, tipo text, eixo text,
    corte text, formula_medida text, formula_em_lh text, formula_qtde text, condicao text, obs text, tipologias text[]
  );
  GET DIAGNOSTICS v_regras = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_tipologia (motor_id, tipologia, linha, n_regras, n_condicionais, variaveis)
  SELECT v_motor, x.tipologia, x.linha, x.n_regras, x.n_condicionais, x.variaveis
  FROM jsonb_to_recordset(p_payload->'tipologias') AS x(
    tipologia text, linha text, n_regras integer, n_condicionais integer, variaveis text[]
  );
  GET DIAGNOSTICS v_tipologias = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_formula_familia (
    motor_id, linha, linha_original, variavel, descricao, formula, formula_em_lh, pct_padrao
  )
  SELECT v_motor, x.linha, x.linha_original, x.variavel, x.descricao, x.formula, x.formula_em_lh, x.pct_padrao
  FROM jsonb_to_recordset(p_payload->'formulas') AS x(
    linha text, linha_original text, variavel text, descricao text, formula text, formula_em_lh text, pct_padrao numeric
  );
  GET DIAGNOSTICS v_formulas = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_tipologia_detalhe (motor_id, ordem, linha, tipologia, descricao, tipo, larg_min_mm, larg_max_mm, alt_min_mm, alt_max_mm, fonte_limite, n_perfis, n_vidros, n_insumos)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.descricao, x.tipo, x.larg_min_mm, x.larg_max_mm, x.alt_min_mm, x.alt_max_mm, x.fonte_limite, x.n_perfis, x.n_vidros, x.n_insumos
  FROM jsonb_to_recordset(p_payload->'detalhes') AS x(ordem integer, linha text, tipologia text, descricao text, tipo text, larg_min_mm integer, larg_max_mm integer, alt_min_mm integer, alt_max_mm integer, fonte_limite text, n_perfis integer, n_vidros integer, n_insumos integer);
  GET DIAGNOSTICS v_detalhes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_formula (motor_id, ordem, linha, tipologia, variavel, descricao, formula)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.formula
  FROM jsonb_to_recordset(p_payload->'formulas_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, formula text);
  GET DIAGNOSTICS v_formulas_da_tipologia = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_perfil (motor_id, ordem, linha, tipologia, perfil, descricao, corte, qtd, medida, posicao, esp_vidro, condicao, obs)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.perfil, x.descricao, x.corte, x.qtd, x.medida, x.posicao, x.esp_vidro, x.condicao, x.obs
  FROM jsonb_to_recordset(p_payload->'perfis') AS x(ordem integer, linha text, tipologia text, perfil text, descricao text, corte text, qtd text, medida text, posicao text, esp_vidro text, condicao text, obs text);
  GET DIAGNOSTICS v_perfis = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_vidro (motor_id, ordem, linha, tipologia, vidro, largura, altura, qtd, fixacao, condicao)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.vidro, x.largura, x.altura, x.qtd, x.fixacao, x.condicao
  FROM jsonb_to_recordset(p_payload->'vidros') AS x(ordem integer, linha text, tipologia text, vidro text, largura text, altura text, qtd text, fixacao text, condicao text);
  GET DIAGNOSTICS v_vidros = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_baguete (motor_id, ordem, linha, tipologia, baguete, descricao, espessuras_vidro, qtd_medida_condicao)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.baguete, x.descricao, x.espessuras_vidro, x.qtd_medida_condicao
  FROM jsonb_to_recordset(p_payload->'baguetes') AS x(ordem integer, linha text, tipologia text, baguete text, descricao text, espessuras_vidro text, qtd_medida_condicao text);
  GET DIAGNOSTICS v_baguetes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_insumo (motor_id, ordem, linha, tipologia, insumo, descricao, qtd, condicao, obs)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.insumo, x.descricao, x.qtd, x.condicao, x.obs
  FROM jsonb_to_recordset(p_payload->'insumos') AS x(ordem integer, linha text, tipologia text, insumo text, descricao text, qtd text, condicao text, obs text);
  GET DIAGNOSTICS v_insumos = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_variavel (motor_id, ordem, linha, tipologia, variavel, descricao, padrao, min_max, condicao, opcoes)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.padrao, x.min_max, x.condicao, x.opcoes
  FROM jsonb_to_recordset(p_payload->'variaveis_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, padrao text, min_max text, condicao text, opcoes text);
  GET DIAGNOSTICS v_variaveis_da_tipologia = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_validacao (motor_id, ordem, linha, tipologia, condicao_valida, mensagem)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.condicao_valida, x.mensagem
  FROM jsonb_to_recordset(p_payload->'validacoes') AS x(ordem integer, linha text, tipologia text, condicao_valida text, mensagem text);
  GET DIAGNOSTICS v_validacoes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_otimizacao (motor_id, ordem, parametro, valor)
  SELECT v_motor, x.ordem, x.parametro, x.valor
  FROM jsonb_to_recordset(p_payload->'otimizacao') AS x(ordem integer, parametro text, valor text);
  GET DIAGNOSTICS v_otimizacao = ROW_COUNT;

  -- 3. o registro da importacao (sem itens de preco e sem cruzamento: o arquivo do motor nao traz preco)
  INSERT INTO public.orcamentista_importacao (motor_id, importado_por, itens, regras, tipologias, cruzam, nao_cruzam, normalizados, avisos)
  VALUES (v_motor, p_por, 0, v_regras, v_tipologias, 0, 0, (p_payload->'contagens'->>'normalizados')::integer, p_payload->'avisos')
  RETURNING id INTO v_importacao_id;

  -- 4. a etapa aponta o motor novo (o velho, se havia, fica sem etapa: arquivavel)
  UPDATE public.orcamentista_familia_etapa SET motor_id = v_motor, atualizado_por = p_por, atualizado_em = now() WHERE id = p_etapa;
  SELECT to_jsonb(e) INTO v_depois FROM public.orcamentista_familia_etapa e WHERE e.id = p_etapa;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_etapa', p_etapa::text,
          jsonb_build_object('orcamentista_familia_etapa', v_antes, 'motor_anterior', v_motor_antes),
          jsonb_build_object('orcamentista_familia_etapa', v_depois, 'orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = v_motor),
                             'importacao_id', v_importacao_id, 'regras', v_regras, 'tipologias', v_detalhes),
          p_por);

  RETURN jsonb_build_object(
    'motor_id',        v_motor,
    'etapa_id',        p_etapa,
    'motor_anterior',  v_motor_antes,
    'importacao_id',   v_importacao_id,
    'regras',          v_regras,
    'tipologias',      v_tipologias,
    'formulas',        v_formulas,
    'detalhes',        v_detalhes,
    'formulas_da_tipologia', v_formulas_da_tipologia,
    'perfis',          v_perfis,
    'vidros',          v_vidros,
    'baguetes',        v_baguetes,
    'insumos',         v_insumos,
    'variaveis_da_tipologia', v_variaveis_da_tipologia,
    'validacoes',      v_validacoes,
    'otimizacao',      v_otimizacao
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb) TO service_role;

-- ── B. o título da família é digitado: renomear a matéria-prima ───────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_renomear_materia_prima(
  p_tenant uuid, p_por uuid, p_materia_prima uuid, p_nome text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_nome   text := btrim(p_nome);
  v_antes  jsonb;
  v_depois jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_nome IS NULL OR char_length(v_nome) < 1 OR char_length(v_nome) > 80 THEN
    RAISE EXCEPTION 'o nome da materia-prima tem de 1 a 80 caracteres' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_renomear_materia_prima:' || p_tenant::text, 0));
  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'materia-prima inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;

  BEGIN
    UPDATE public.orcamentista_materia_prima SET nome = v_nome, atualizado_por = p_por, atualizado_em = now()
     WHERE id = p_materia_prima AND tenant_id = p_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'a empresa ja tem outra materia-prima com esse nome' USING ERRCODE = 'invalid_parameter_value';
  END;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_materia_prima', p_materia_prima::text,
          jsonb_build_object('orcamentista_materia_prima', v_antes),
          jsonb_build_object('orcamentista_materia_prima', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_materia_prima', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_renomear_materia_prima(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_renomear_materia_prima(uuid, uuid, uuid, text) TO service_role;

-- ── VERIFICAÇÃO: as duas existem, fechadas, SECURITY DEFINER com search_path fixo; a primeira com o statement_timeout ──
DO $verifica$
DECLARE
  f    regprocedure;
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb)',
    'public.superadmin_renomear_materia_prima(uuid, uuid, uuid, text)'
  ] LOOP
    f := to_regprocedure(nome);
    IF f IS NULL
       OR has_function_privilege('public', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'verificacao: % nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.', nome;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb)')
                    AND 'statement_timeout=35s' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: superadmin_criar_motor_da_etapa sem o statement_timeout de 35 s. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'etapa sobe o motor e titulo da familia: as duas funcoes existem, fechadas, SECURITY DEFINER com search_path fixo.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname in ('superadmin_criar_motor_da_etapa', 'superadmin_renomear_materia_prima');
--   -- esperado: 2 linhas, prosecdef = true, proconfig com search_path=public, pg_temp (e statement_timeout=35s na primeira)
-- select count(*) from public.orcamentista_motor;   -- esperado: 1, a da Wolff — a migração não cria motor nenhum
