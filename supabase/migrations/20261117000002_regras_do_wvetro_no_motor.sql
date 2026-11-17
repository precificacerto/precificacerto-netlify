-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261117000002 — as regras do WVetro no motor: as colunas que o arquivo do motor (6) traz para R2, R3 e R4 passam a ser GRAVADAS.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão:
-- ║ 20261117000002_regras_do_wvetro_no_motor.
-- ║ SEM ELA, o código do PR continua funcionando: a leitura é por select('*') e a coluna ausente vale nulo (R2, R3 e R4 não agem, como
-- ║ hoje); a criação do motor manda as três colunas no payload, e a função de antes as IGNORA (jsonb_to_recordset não lê a chave que não
-- ║ conhece) — o motor nasce sem elas, em silêncio. Por isso: aplicar ANTES do merge e, DEPOIS do deploy, TROCAR O ARQUIVO do motor da
-- ║ família PVC Wolf pelo mesmo arquivo (6), para as três colunas chegarem ao banco. Até a troca, R1 e R5 já valem; R2, R3 e R4 não.
-- ║ NÃO GRAVA NEM APAGA DADO NENHUM ao ser aplicada: acrescenta três colunas nulas, sem default, e troca o corpo de uma função.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário fora do corpo.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 17/11/2026: "a regra é a definição do WVetro, e o motor do Precifica Certo deve ter isso na
-- concepção da tipologia, como regra inviolável [...] cada tipologia tem suas variáveis". O motor (6), coletado do WVetro (licença 7076),
-- traz três colunas novas e opcionais: "Condição das opções" na aba Variáveis (R2: cada opção tem condição — ARI 1 e 2 só com TI=1, 3 só
-- com TI=2) e "Esp. vidro" nas abas Insumos e Vidros (R3/R4: a borracha 3349 só com vidro de 5, 6, 8 ou 24 mm; a 919 só com 18, 20 ou 21).
-- O avaliador (`avaliador-de-formulas.ts`) já as lê pelo nome; sem esta migração elas não chegam ao banco.
--
-- O QUE FAZ:
--   1. orcamentista_motor_vidro.esp_vidro, orcamentista_motor_insumo.esp_vidro e orcamentista_motor_variavel.condicao_opcoes: text,
--      nulas, sem default (texto literal da célula, como as demais colunas das abas; vazio é NULL — ausente-vs-falso.md);
--   2. superadmin_criar_motor grava as três. O resto do corpo é o de produção, linha por linha
--      (`scripts/harness/regras-do-wvetro-no-motor/montar_migracao.py` prova pelo diff que só as três listas mudaram).
--      superadmin_trocar_arquivo_do_motor chama a criação: herda a mudança sem ser tocada.
--   NÃO muda importar_conteudo_da_tabela (o caminho de antes, motor colado na tabela de preço): desde o PR D a conversa lê o motor pelo
--   catálogo (motor_id), e o motor não sobe mais pela tabela.
-- MEDIDO em produção em 17/11/2026: o corpo de superadmin_criar_motor tem o md5 88a3d866178a5309a098271f97dc090c (sem o \r); as três colunas não existem.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE; REVOKE/GRANT repetíveis. A guarda aceita o corpo de antes OU o desta.
-- GUARDA (aborta, nomeando o banco, o usuário e o que difere): a função existe pela assinatura de entrada com o corpo de produção ou o
-- desta; as três tabelas existem; a coluna, se já existir, é text nula sem default.
-- VERIFICAÇÃO (aborta): as três colunas; o corpo com o md5 desta; SECURITY DEFINER, search_path e statement_timeout (35 s) de antes;
-- fechada (só service_role executa).
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  f      regprocedure;
  achado text;
  r_col  record;
  difere text := '';
BEGIN
  f := to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)');
  IF f IS NULL THEN
    difere := difere || ' public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) nao existe;';
  ELSE
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO achado FROM pg_proc p WHERE p.oid = f;
    IF achado NOT IN ('88a3d866178a5309a098271f97dc090c', '26ecaf800fc3a0f56a3d8ff74643eb0e') THEN
      difere := difere || format(' public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) tem o corpo %s (esperado 88a3d866178a5309a098271f97dc090c ou 26ecaf800fc3a0f56a3d8ff74643eb0e);', achado);
    END IF;
  END IF;
  SELECT data_type, is_nullable, column_default INTO r_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_motor_vidro' AND column_name = 'esp_vidro';
  IF FOUND AND (r_col.data_type <> 'text' OR r_col.is_nullable <> 'YES' OR r_col.column_default IS NOT NULL) THEN
    difere := difere || ' orcamentista_motor_vidro.esp_vidro existe com outra forma;';
  END IF;
  IF to_regclass('public.orcamentista_motor_vidro') IS NULL THEN
    difere := difere || ' public.orcamentista_motor_vidro nao existe;';
  END IF;
  SELECT data_type, is_nullable, column_default INTO r_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_motor_insumo' AND column_name = 'esp_vidro';
  IF FOUND AND (r_col.data_type <> 'text' OR r_col.is_nullable <> 'YES' OR r_col.column_default IS NOT NULL) THEN
    difere := difere || ' orcamentista_motor_insumo.esp_vidro existe com outra forma;';
  END IF;
  IF to_regclass('public.orcamentista_motor_insumo') IS NULL THEN
    difere := difere || ' public.orcamentista_motor_insumo nao existe;';
  END IF;
  SELECT data_type, is_nullable, column_default INTO r_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_motor_variavel' AND column_name = 'condicao_opcoes';
  IF FOUND AND (r_col.data_type <> 'text' OR r_col.is_nullable <> 'YES' OR r_col.column_default IS NOT NULL) THEN
    difere := difere || ' orcamentista_motor_variavel.condicao_opcoes existe com outra forma;';
  END IF;
  IF to_regclass('public.orcamentista_motor_variavel') IS NULL THEN
    difere := difere || ' public.orcamentista_motor_variavel nao existe;';
  END IF;
  IF difere <> '' THEN
    RAISE EXCEPTION 'guarda: este banco nao esta como o medido (banco %, usuario %):%  Nada foi alterado.', current_database(), current_user, difere;
  END IF;
END
$guarda$;

-- ── 1. as três colunas ──
ALTER TABLE public.orcamentista_motor_vidro ADD COLUMN IF NOT EXISTS esp_vidro text;
COMMENT ON COLUMN public.orcamentista_motor_vidro.esp_vidro IS 'R4 (20261117000002): as espessuras de vidro (mm) em que a linha da aba Vidros entra, como o arquivo do motor as escreve ("5,6,8,24"); nula = qualquer.';
ALTER TABLE public.orcamentista_motor_insumo ADD COLUMN IF NOT EXISTS esp_vidro text;
COMMENT ON COLUMN public.orcamentista_motor_insumo.esp_vidro IS 'R3 (20261117000002): as espessuras de vidro (mm) em que a linha da aba Insumos entra, como o arquivo do motor as escreve ("5,6,8,24"); nula = qualquer.';
ALTER TABLE public.orcamentista_motor_variavel ADD COLUMN IF NOT EXISTS condicao_opcoes text;
COMMENT ON COLUMN public.orcamentista_motor_variavel.condicao_opcoes IS 'R2 (20261117000002): a condicao de cada opcao da variavel, como o arquivo do motor a escreve ("1: (TI=1); 3: (TI=2)"); a opcao que nao aparece vale sempre; nula = todas valem.';

-- ── 2. CRIAR o motor: grava as três colunas ──
CREATE OR REPLACE FUNCTION public.superadmin_criar_motor(
  p_por uuid, p_fornecedor uuid, p_categoria text, p_familias text[], p_nome text, p_arquivo_path text, p_arquivo_nome text, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '35s'
AS $fn$
DECLARE
  v_motor         uuid;
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
  v_tempos        integer;
  v_familias      text[];
  v_msg           text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_payload IS NULL OR v_path IS NULL OR v_path = '' OR v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'arquivo (caminho e nome) e payload sao obrigatorios. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_fornecedor IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = p_fornecedor) THEN
    RAISE EXCEPTION 'fornecedor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_categoria) THEN
    RAISE EXCEPTION 'categoria fora da lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- as FAMILIAS em que o motor atua (20261029000003): pelo menos uma, sem repeticao, todas do catalogo; a recusa nomeia, antes de ler o payload.
  -- O gatilho orcamentista_motor_sem_familia (no COMMIT) e a trava do "pelo menos uma"; a FK da ligacao, a do catalogo.
  IF p_familias IS NULL OR cardinality(p_familias) = 0 THEN
    RAISE EXCEPTION 'o motor atua em pelo menos uma familia: a lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF array_position(p_familias, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'uma familia da lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(d.f, ', ' ORDER BY d.f) INTO v_msg FROM (SELECT f FROM unnest(p_familias) f GROUP BY f HAVING count(*) > 1) d;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'a familia % aparece mais de uma vez na lista. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(f, ', ' ORDER BY f) INTO v_msg FROM unnest(p_familias) f
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo c WHERE c.chave = f);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'familia fora do catalogo: %. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_familias := ARRAY(SELECT f FROM unnest(p_familias) f ORDER BY f);

  -- o NOME do motor (20261029000005): 1 a 80 caracteres, sem espaco nas pontas (a CHECK orcamentista_motor_nome_forma e a trava), e unico entre os
  -- motores ATIVOS do fornecedor (o indice parcial orcamentista_motor_nome_ativo e a trava). Aqui sai a frase, antes de ler o payload.
  IF p_nome IS NULL OR p_nome <> btrim(p_nome) OR char_length(p_nome) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'o nome do motor tem de 1 a 80 caracteres, sem espaco nas pontas. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL) THEN
    RAISE EXCEPTION 'ja existe um motor ativo "%" deste fornecedor: o nome nao se repete entre os motores ativos. Nada foi gravado.', p_nome
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- o arquivo mora na pasta de motor DO FORNECEDOR: o caminho que a rota assinou, e nenhum outro
  v_prefixo := p_fornecedor::text || '/motor/';
  IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN
    RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor' USING ERRCODE = 'invalid_parameter_value';
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
  -- os TEMPOS de fabricacao (20261106000001): a lista e opcional (o codigo de antes desta migracao nao a manda, e o motor nasce sem tempo, como
  -- antes); presente, e lista, e cada tempo tem a tipologia de uma linha da Detalhe, minutos inteiros maiores que zero e a origem de 1 a 120
  -- caracteres, sem espaco nas pontas. O padrao IMPORTADO e do leitor, e so dele: aqui a origem vazia e recusa.
  IF p_payload ? 'tempos' AND jsonb_typeof(p_payload->'tempos') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Payload invalido: tempos tem de ser uma lista. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(coalesce(t.e->>'tipologia', '(sem tipologia)'), ', ' ORDER BY t.n) INTO v_msg
    FROM jsonb_array_elements(coalesce(p_payload->'tempos', '[]'::jsonb)) WITH ORDINALITY AS t(e, n)
   WHERE CASE
           WHEN jsonb_typeof(t.e) IS DISTINCT FROM 'object' THEN true
           WHEN jsonb_typeof(t.e->'tipologia') IS DISTINCT FROM 'string' THEN true
           WHEN jsonb_typeof(t.e->'tempo_fabricacao_min') IS DISTINCT FROM 'number' THEN true
           WHEN (t.e->>'tempo_fabricacao_min')::numeric <> trunc((t.e->>'tempo_fabricacao_min')::numeric)
             OR (t.e->>'tempo_fabricacao_min')::numeric NOT BETWEEN 1 AND 2147483647 THEN true
           WHEN jsonb_typeof(t.e->'tempo_origem') IS DISTINCT FROM 'string' THEN true
           ELSE (t.e->>'tempo_origem') <> btrim(t.e->>'tempo_origem') OR char_length(t.e->>'tempo_origem') NOT BETWEEN 1 AND 120
         END;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'tempo de fabricacao invalido para %: minutos inteiros maiores que zero, e origem de 1 a 120 caracteres sem espaco nas pontas. Nada foi gravado.', v_msg
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(d.tip, ', ' ORDER BY d.tip) INTO v_msg
    FROM (SELECT t.e->>'tipologia' AS tip FROM jsonb_array_elements(coalesce(p_payload->'tempos', '[]'::jsonb)) AS t(e) GROUP BY 1 HAVING count(*) > 1) d;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'a tipologia % tem mais de um tempo de fabricacao. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(t.e->>'tipologia', ', ' ORDER BY t.e->>'tipologia') INTO v_msg
    FROM jsonb_array_elements(coalesce(p_payload->'tempos', '[]'::jsonb)) AS t(e)
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'detalhes') AS d(e) WHERE d.e->>'tipologia' = t.e->>'tipologia');
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'tempo de fabricacao para tipologia que nao esta na Detalhe: %. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1. o motor: do catalogo, com fornecedor e categoria; nao aponta etapa nenhuma (quem escolhe e a etapa). Depois dele, na mesma transacao, as
  --    familias em que atua (a ligacao exige o motor; o gatilho adiado confere, no COMMIT, que ele tem pelo menos uma)
  INSERT INTO public.orcamentista_motor (fornecedor_id, categoria_chave, nome, arquivo_nome, arquivo_path, criado_por)
  VALUES (p_fornecedor, p_categoria, p_nome, v_nome, v_path, p_por)
  RETURNING id INTO v_motor;
  INSERT INTO public.orcamentista_motor_familia (motor_id, familia) SELECT v_motor, f FROM unnest(v_familias) f;

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

  -- os tempos, em orcamentista_motor_tipologia_tempo, por motor_id (a tabela propria desde a 20261024000003; nenhum processo a apaga)
  INSERT INTO public.orcamentista_motor_tipologia_tempo (motor_id, tipologia, tempo_fabricacao_min, tempo_origem, atualizado_por)
  SELECT v_motor, x.tipologia, x.tempo_fabricacao_min, x.tempo_origem, p_por
  FROM jsonb_to_recordset(coalesce(p_payload->'tempos', '[]'::jsonb)) AS x(tipologia text, tempo_fabricacao_min integer, tempo_origem text);
  GET DIAGNOSTICS v_tempos = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_formula (motor_id, ordem, linha, tipologia, variavel, descricao, formula)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.formula
  FROM jsonb_to_recordset(p_payload->'formulas_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, formula text);
  GET DIAGNOSTICS v_formulas_da_tipologia = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_perfil (motor_id, ordem, linha, tipologia, perfil, descricao, corte, qtd, medida, posicao, esp_vidro, condicao, obs)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.perfil, x.descricao, x.corte, x.qtd, x.medida, x.posicao, x.esp_vidro, x.condicao, x.obs
  FROM jsonb_to_recordset(p_payload->'perfis') AS x(ordem integer, linha text, tipologia text, perfil text, descricao text, corte text, qtd text, medida text, posicao text, esp_vidro text, condicao text, obs text);
  GET DIAGNOSTICS v_perfis = ROW_COUNT;

  -- 20261117000002: esp_vidro (R4), nula quando o arquivo nao traz a coluna
  INSERT INTO public.orcamentista_motor_vidro (motor_id, ordem, linha, tipologia, vidro, largura, altura, qtd, fixacao, condicao, esp_vidro)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.vidro, x.largura, x.altura, x.qtd, x.fixacao, x.condicao, x.esp_vidro
  FROM jsonb_to_recordset(p_payload->'vidros') AS x(ordem integer, linha text, tipologia text, vidro text, largura text, altura text, qtd text, fixacao text, condicao text, esp_vidro text);
  GET DIAGNOSTICS v_vidros = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_baguete (motor_id, ordem, linha, tipologia, baguete, descricao, espessuras_vidro, qtd_medida_condicao)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.baguete, x.descricao, x.espessuras_vidro, x.qtd_medida_condicao
  FROM jsonb_to_recordset(p_payload->'baguetes') AS x(ordem integer, linha text, tipologia text, baguete text, descricao text, espessuras_vidro text, qtd_medida_condicao text);
  GET DIAGNOSTICS v_baguetes = ROW_COUNT;

  -- 20261117000002: esp_vidro (R3), nula quando o arquivo nao traz a coluna
  INSERT INTO public.orcamentista_motor_insumo (motor_id, ordem, linha, tipologia, insumo, descricao, qtd, condicao, obs, esp_vidro)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.insumo, x.descricao, x.qtd, x.condicao, x.obs, x.esp_vidro
  FROM jsonb_to_recordset(p_payload->'insumos') AS x(ordem integer, linha text, tipologia text, insumo text, descricao text, qtd text, condicao text, obs text, esp_vidro text);
  GET DIAGNOSTICS v_insumos = ROW_COUNT;

  -- 20261117000002: condicao_opcoes (R2), nula quando o arquivo nao traz a coluna
  INSERT INTO public.orcamentista_motor_variavel (motor_id, ordem, linha, tipologia, variavel, descricao, padrao, min_max, condicao, opcoes, condicao_opcoes)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.padrao, x.min_max, x.condicao, x.opcoes, x.condicao_opcoes
  FROM jsonb_to_recordset(p_payload->'variaveis_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, padrao text, min_max text, condicao text, opcoes text, condicao_opcoes text);
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

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', v_motor::text, NULL,
          jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = v_motor),
                             'familias', to_jsonb(v_familias),
                             'importacao_id', v_importacao_id, 'regras', v_regras, 'tipologias', v_detalhes, 'tempos', v_tempos),
          p_por);

  RETURN jsonb_build_object(
    'motor_id',        v_motor,
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
    'tempos',          v_tempos,
    'otimizacao',      v_otimizacao
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) TO service_role;

DO $verifica$
DECLARE
  f regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor_vidro' AND column_name = 'esp_vidro'
                  AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao: orcamentista_motor_vidro.esp_vidro nao existe como text nula sem default. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor_insumo' AND column_name = 'esp_vidro'
                  AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao: orcamentista_motor_insumo.esp_vidro nao existe como text nula sem default. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor_variavel' AND column_name = 'condicao_opcoes'
                  AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao: orcamentista_motor_variavel.condicao_opcoes nao existe como text nula sem default. Nada foi alterado.';
  END IF;
  f := to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)');
  IF f IS NULL
     OR has_function_privilege('public', f, 'EXECUTE')
     OR has_function_privilege('anon', f, 'EXECUTE')
     OR has_function_privilege('authenticated', f, 'EXECUTE')
     OR NOT has_function_privilege('service_role', f, 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
                       AND 'statement_timeout=35s' = ANY (p.proconfig) AND md5(replace(p.prosrc, chr(13), '')) = '26ecaf800fc3a0f56a3d8ff74643eb0e') THEN
    RAISE EXCEPTION 'verificacao: public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) nao existe, nasceu aberta, perdeu o search_path ou o prazo, ou nao tem o corpo desta migracao. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'regras do WVetro no motor: esp_vidro em vidros e insumos, condicao_opcoes nas variaveis; criar o motor grava as tres.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and (table_name, column_name) in (('orcamentista_motor_vidro','esp_vidro'),
--        ('orcamentista_motor_insumo','esp_vidro'), ('orcamentista_motor_variavel','condicao_opcoes'));
--   esperado: 3 linhas, text, YES, sem default
-- select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'superadmin_criar_motor';
--   esperado: 26ecaf800fc3a0f56a3d8ff74643eb0e
