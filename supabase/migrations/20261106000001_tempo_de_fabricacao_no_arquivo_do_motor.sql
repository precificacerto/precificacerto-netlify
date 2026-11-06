-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261106000001 — o tempo de fabricação vem no ARQUIVO do motor: a criação grava os tempos, a troca de arquivo que perderia tempo é recusada,
-- e a origem do tempo passa a ser texto livre de 1 a 120 caracteres.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão:
-- ║ 20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.
-- ║ SEM ELA, o código do PR cria o motor e responde ERRO: a função de antes ignora a lista `tempos` (jsonb_to_recordset não lê a
-- ║ chave que não conhece), não devolve a contagem, e a conferência da rota trata a contagem ausente como divergência — 500 com os
-- ║ dois lados, nunca sucesso com o tempo descartado. O motor fica criado (a função já fez COMMIT), sem tempo e sem etapa.
-- ║ NÃO GRAVA NEM APAGA DADO NENHUM ao ser aplicada: troca uma CHECK e o corpo de duas funções.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário fora dos corpos.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 05/11/2026 (a dívida de 27/10/2026: "o tempo de fabricação de cada tipologia virá na tabela das
-- tipologias [...] tudo dentro do motor, em uma coluna específica"). O arquivo traz, na aba "Detalhe Tipologias", depois de "Nº insumos",
-- "Tempo fabricação (min)" (minutos inteiros por unidade de esquadria; vazio = não informado, nunca 0) e "Origem do tempo" (opcional; vazia,
-- o leitor grava IMPORTADO). O leitor é `src/utils/atendimentos-ia-tempos-do-motor.ts`.
--
-- O QUE FAZ:
--   1. a CHECK `orcamentista_motor_tipologia_tempo_origem` passa de ('ESTIMADO', 'IMPORTADO') para texto de 1 a 120 caracteres, sem espaço
--      nas pontas (dono do produto, 05/11/2026: "origem é texto livre de 1 a 120 caracteres"). Os dois valores de antes continuam válidos.
--   2. `superadmin_criar_motor` aceita a lista `tempos` (opcional: o código de antes não a manda), confere cada tempo (a tipologia de uma
--      linha da Detalhe, sem repetir; minutos inteiros de 1 ao maior integer; a origem como a CHECK), grava-os por `motor_id` na mesma
--      transação, loga a contagem e a DEVOLVE (`tempos`).
--   3. `superadmin_trocar_arquivo_do_motor` RECUSA, antes de qualquer escrita, a troca em que o motor antigo tem tempo numa tipologia que o
--      arquivo novo traz na Detalhe sem tempo — nomeando até dez e quantas sobram (dono do produto, 05/11/2026: "troca de arquivo que
--      perderia tempos é RECUSADA e nomeada"). Leitura do assistente, dita no PR: a tipologia que SAIU do arquivo não conta como perda (o
--      motor novo não a tem; o tempo dela não teria onde valer). Os tempos do antigo ficam nele, intactos, como o resto do conteúdo.
-- O resto dos dois corpos é o de produção, linha por linha (`scripts/harness/tempo-no-arquivo-do-motor/montar_migracao.py` prova pelo diff
-- que só se acrescentaram linhas, e que a única linha trocada é a do log da criação, que ganhou a contagem dos tempos).
-- MEDIDO em produção em 06/11/2026: os dois corpos têm o md5 abaixo (sem o \r); a tabela de tempos tem 0 linhas, a CHECK de antes, o índice
-- único parcial (motor_id, tipologia) e a CHECK do positivo; 1 motor (`20f66b59…`), sem tempo.
--
-- IDEMPOTENTE: DROP CONSTRAINT IF EXISTS + ADD; CREATE OR REPLACE; REVOKE/GRANT repetíveis. A guarda aceita os corpos de antes OU os desta.
-- GUARDA (aborta, nomeando o banco, o usuário e o que difere): as duas funções existem pela assinatura de entrada com o corpo de produção ou o
-- desta; a tabela de tempos existe, com a CHECK da origem de antes ou a desta, e com o índice único parcial e a CHECK do positivo.
-- VERIFICAÇÃO (aborta): a CHECK nova; os dois corpos com o md5 desta; SECURITY DEFINER, search_path e statement_timeout (35 s e 40 s) de antes;
-- fechadas (só service_role executa).
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  r      record;
  f      regprocedure;
  achado text;
  def    text;
  difere text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)', 'ae9f3fb4bffa605f714e1e1780af0b96', '88a3d866178a5309a098271f97dc090c'),
      ('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)', '0c8c72a82eebe1bc798d280c2a340af2', '3a00248e4d6256553335fa87bcce5f27')
    ) AS v(assinatura, antes, desta) LOOP
    f := to_regprocedure(r.assinatura);
    IF f IS NULL THEN
      difere := difere || format(' %s nao existe;', r.assinatura);
    ELSE
      SELECT md5(replace(p.prosrc, chr(13), '')) INTO achado FROM pg_proc p WHERE p.oid = f;
      IF achado NOT IN (r.antes, r.desta) THEN
        difere := difere || format(' %s tem o corpo %s (esperado %s ou %s);', r.assinatura, achado, r.antes, r.desta);
      END IF;
    END IF;
  END LOOP;
  IF to_regclass('public.orcamentista_motor_tipologia_tempo') IS NULL THEN
    difere := difere || ' public.orcamentista_motor_tipologia_tempo nao existe;';
  ELSE
    SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
     WHERE c.conrelid = 'public.orcamentista_motor_tipologia_tempo'::regclass AND c.conname = 'orcamentista_motor_tipologia_tempo_origem';
    IF def IS NULL OR def NOT IN ($c$CHECK ((tempo_origem = ANY (ARRAY['ESTIMADO'::text, 'IMPORTADO'::text])))$c$, $c$CHECK (((tempo_origem = btrim(tempo_origem)) AND ((char_length(tempo_origem) >= 1) AND (char_length(tempo_origem) <= 120))))$c$) THEN
      difere := difere || format(' a CHECK da origem e %s;', coalesce(def, '(ausente)'));
    END IF;
    SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
     WHERE c.conrelid = 'public.orcamentista_motor_tipologia_tempo'::regclass AND c.conname = 'orcamentista_motor_tipologia_tempo_positivo';
    IF def IS DISTINCT FROM 'CHECK ((tempo_fabricacao_min > 0))' THEN
      difere := difere || format(' a CHECK do positivo e %s;', coalesce(def, '(ausente)'));
    END IF;
    SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_motor_tipologia_tempo_tipologia_motor_key';
    IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_motor_tipologia_tempo_tipologia_motor_key ON public.orcamentista_motor_tipologia_tempo USING btree (motor_id, tipologia) WHERE (motor_id IS NOT NULL)' THEN
      difere := difere || format(' o indice unico do motor e %s;', coalesce(def, '(ausente)'));
    END IF;
  END IF;
  IF difere <> '' THEN
    RAISE EXCEPTION 'guarda: este banco nao esta como o medido (banco %, usuario %):%  Nada foi alterado.', current_database(), current_user, difere;
  END IF;
END
$guarda$;

-- ── 1. a ORIGEM do tempo: texto livre de 1 a 120 caracteres, sem espaço nas pontas ──
ALTER TABLE public.orcamentista_motor_tipologia_tempo DROP CONSTRAINT IF EXISTS orcamentista_motor_tipologia_tempo_origem;
ALTER TABLE public.orcamentista_motor_tipologia_tempo ADD CONSTRAINT orcamentista_motor_tipologia_tempo_origem
  CHECK (tempo_origem = btrim(tempo_origem) AND char_length(tempo_origem) BETWEEN 1 AND 120);
COMMENT ON COLUMN public.orcamentista_motor_tipologia_tempo.tempo_origem IS
  'De onde veio o tempo, como a empresa escreveu na coluna Origem do tempo do arquivo do motor (1 a 120 caracteres); IMPORTADO quando a coluna veio vazia; ESTIMADO nos tempos de antes de 20261106000001.';

-- ── 2. CRIAR o motor: grava os tempos do arquivo ──
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

-- ── 3. TROCAR o arquivo: recusa a troca que perderia tempo ──
CREATE OR REPLACE FUNCTION public.superadmin_trocar_arquivo_do_motor(
  p_por uuid, p_motor uuid, p_arquivo_path text, p_arquivo_nome text, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '40s'
AS $fn$
DECLARE
  v_antigo  public.orcamentista_motor%ROWTYPE;
  v_criado  jsonb;
  v_novo    uuid;
  v_etapa   record;
  v_antes   jsonb;
  v_depois  jsonb;
  v_n       integer := 0;
  v_perdidos integer;
  v_msg     text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- trava o motor ANTES de tudo: uma etapa sendo gravada para ele (FOR SHARE) espera, e depois o encontra arquivado e recusa
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_trocar_arquivo_do_motor:' || p_motor::text, 0));
  SELECT * INTO v_antigo FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_antigo.arquivado_em IS NOT NULL THEN
    RAISE EXCEPTION 'o motor esta arquivado: o arquivo de um motor arquivado nao se troca. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF btrim(coalesce(p_arquivo_path, '')) = v_antigo.arquivo_path THEN
    RAISE EXCEPTION 'o arquivo novo e o mesmo objeto do motor atual: envie o arquivo de novo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 0. a troca que PERDERIA TEMPO e recusada (20261106000001; dono do produto, 05/11/2026): o antigo tem tempo numa tipologia que o arquivo novo
  --    traz na Detalhe SEM tempo (a coluna ausente, ou a celula vazia). A tipologia que saiu do arquivo nao conta: o motor novo nao a tem, e o
  --    tempo dela nao teria onde valer. Antes de qualquer escrita, com o antigo travado; nomeia ate dez, e diz quantas sobram.
  SELECT count(*), string_agg(q.tipologia, ', ' ORDER BY q.tipologia) FILTER (WHERE q.n <= 10) INTO v_perdidos, v_msg
    FROM (SELECT t.tipologia, row_number() OVER (ORDER BY t.tipologia) AS n
            FROM public.orcamentista_motor_tipologia_tempo t
           WHERE t.motor_id = p_motor
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload->'detalhes') = 'array' THEN p_payload->'detalhes' ELSE '[]'::jsonb END) AS d(e)
                          WHERE d.e->>'tipologia' = t.tipologia)
             AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload->'tempos') = 'array' THEN p_payload->'tempos' ELSE '[]'::jsonb END) AS x(e)
                              WHERE x.e->>'tipologia' = t.tipologia)) q;
  IF v_perdidos > 0 THEN
    RAISE EXCEPTION 'a troca perderia % tempo(s) de fabricacao: o motor atual tem tempo para %, e o arquivo novo traz essa(s) tipologia(s) sem tempo. Preencha o tempo delas no arquivo e envie de novo. Nada foi gravado.',
      v_perdidos, v_msg || CASE WHEN v_perdidos > 10 THEN ' e mais ' || (v_perdidos - 10) ELSE '' END
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1. o antigo ARQUIVADO PRIMEIRO, com as linhas intactas e com log (20261029000005): o novo leva o MESMO nome, e o indice unico parcial
  --    orcamentista_motor_nome_ativo e conferido no INSERT do novo; com o antigo ainda ativo, o INSERT colidiria. As etapas do antigo seguem
  --    apontando-o ate o passo 3, dentro desta transacao (gravar etapas, FOR SHARE no motor, espera; depois ve o antigo arquivado e recusa).
  UPDATE public.orcamentista_motor SET arquivado_em = now(), arquivado_por = p_por WHERE id = p_motor;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text,
          jsonb_build_object('orcamentista_motor', to_jsonb(v_antigo), 'troca_de_arquivo_do_motor', p_motor),
          jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = p_motor)), p_por);

  -- 2. o motor NOVO: mesmo fornecedor, categoria, FAMILIAS (as do antigo, na ligacao) e NOME; a leitura, as contagens e o log sao os da criacao.
  --    As etapas reapontadas guardam a exigida delas, que o novo tem: a FK para a ligacao confere.
  v_criado := public.superadmin_criar_motor(p_por, v_antigo.fornecedor_id, v_antigo.categoria_chave,
                                            (SELECT array_agg(mf.familia ORDER BY mf.familia) FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = p_motor),
                                            v_antigo.nome, p_arquivo_path, p_arquivo_nome, p_payload);
  v_novo := (v_criado ->> 'motor_id')::uuid;
  IF v_novo IS NULL OR v_novo = p_motor THEN
    RAISE EXCEPTION 'a criacao do motor novo nao devolveu o id. Nada foi gravado.' USING ERRCODE = 'internal_error';
  END IF;

  -- 3. as ETAPAS do antigo passam ao novo, cada uma com antes e depois no log (a etapa e da empresa: o log leva o tenant)
  FOR v_etapa IN
    SELECT x.* FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor ORDER BY x.tenant_id, x.materia_prima_id, x.numero FOR UPDATE
  LOOP
    v_antes := to_jsonb(v_etapa);
    UPDATE public.orcamentista_familia_etapa SET motor_id = v_novo, atualizado_por = p_por, atualizado_em = now() WHERE id = v_etapa.id;
    SELECT to_jsonb(x) INTO v_depois FROM public.orcamentista_familia_etapa x WHERE x.id = v_etapa.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,
            jsonb_build_object('orcamentista_familia_etapa', v_antes, 'troca_de_arquivo_do_motor', p_motor),
            jsonb_build_object('orcamentista_familia_etapa', v_depois), p_por);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_criado || jsonb_build_object('motor_antigo', p_motor, 'etapas_reapontadas', v_n);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) TO service_role;

DO $verifica$
DECLARE
  r   record;
  f   regprocedure;
  def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conrelid = 'public.orcamentista_motor_tipologia_tempo'::regclass AND c.conname = 'orcamentista_motor_tipologia_tempo_origem';
  IF def IS DISTINCT FROM $c$CHECK (((tempo_origem = btrim(tempo_origem)) AND ((char_length(tempo_origem) >= 1) AND (char_length(tempo_origem) <= 120))))$c$ THEN
    RAISE EXCEPTION 'verificacao: a CHECK da origem e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  FOR r IN SELECT * FROM (VALUES
      ('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)', '88a3d866178a5309a098271f97dc090c', 'statement_timeout=35s'),
      ('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)', '3a00248e4d6256553335fa87bcce5f27', 'statement_timeout=40s')
    ) AS v(assinatura, desta, prazo) LOOP
    f := to_regprocedure(r.assinatura);
    IF f IS NULL
       OR has_function_privilege('public', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig) AND r.prazo = ANY (p.proconfig)
                         AND md5(replace(p.prosrc, chr(13), '')) = r.desta) THEN
      RAISE EXCEPTION 'verificacao: % nao existe, nasceu aberta, perdeu o search_path ou o prazo, ou nao tem o corpo desta migracao. Nada foi alterado.', r.assinatura;
    END IF;
  END LOOP;
  RAISE NOTICE 'tempo no arquivo do motor: a origem de 1 a 120 caracteres; criar grava os tempos; trocar recusa a troca que perderia tempo.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_motor_tipologia_tempo_origem';
--   esperado: CHECK (((tempo_origem = btrim(tempo_origem)) AND ((char_length(tempo_origem) >= 1) AND (char_length(tempo_origem) <= 120))))
-- select proname, md5(replace(prosrc, chr(13), '')) from pg_proc where proname in ('superadmin_criar_motor', 'superadmin_trocar_arquivo_do_motor') order by 1;
--   esperado: superadmin_criar_motor = 88a3d866178a5309a098271f97dc090c; superadmin_trocar_arquivo_do_motor = 3a00248e4d6256553335fa87bcce5f27
-- select count(*) from public.orcamentista_motor_tipologia_tempo;
--   esperado: o mesmo de antes (a migração não grava nem apaga tempo); 0 em 06/11/2026
