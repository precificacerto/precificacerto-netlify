-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000004 — PR C: COPIA o motor da tabela da Wolff para a PLANILHA (`orcamentista_motor`).
-- Só INSERT … SELECT. A tabela antiga NÃO é tocada: nenhum UPDATE, nenhum DELETE, nenhum DROP (isso é o PR F).
--
-- ╔═════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.          ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão:      ║
-- ║ 20261027000004_copiar_motor_da_wolff_para_a_planilha.                                               ║
-- ║ PRESSUPÕE a 20261027000002 (aplicada e conferida em produção). NÃO depende da 20261027000003.      ║
-- ║ SEM ELA o código NÃO quebra: nada lê a planilha ainda (o PR D troca os leitores). O que muda,      ║
-- ║ depois de aplicada, é que o bloco Motor passa a LISTAR a planilha ao lado da tabela.               ║
-- ║ O corpo é ASCII nas partes que executam; os acentos estão só em comentário.                        ║
-- ╚═════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- POR QUÊ — decisões do dono do produto, 27/10/2026.
--   1. UMA TABELA = UMA CATEGORIA. Ao subir uma tabela de fornecedor, a categoria (ramificação) é obrigatória e a
--      importação recusa arquivo com mais de um segmento: "não pode haver margem para o agente usar, no
--      levantamento e nas fórmulas, o preço de uma ramificação que ninguém escolheu". (Código: PR seguinte.)
--   2. O QUE DECIDE O PREÇO DE UMA RAMIFICAÇÃO é o fornecedor PRINCIPAL dela
--      (`orcamentista_mp_categoria_fornecedor.principal`). Tabela que nenhuma ramificação escolheu não entra no
--      cálculo. (Registrado em `.claude/rules/tabela-de-preco-por-categoria.md`.)
--   3. ESTADO MEDIDO: a tabela da Wolff tem 735 itens em QUATRO segmentos (Perfil PVC 534, Reforço 112, Acessórios
--      87, "acessórios" minúsculo 1, sem segmento 1) e está FORA da regra nova. A da Estrela (24, Vidro) está dentro.
--   4. O CAMINHO: o dono do produto vai subir TRÊS tabelas independentes da Wolff (Perfil, Reforço, Acessórios), cada
--      uma com o seu arquivo, e a tabela atual é arquivada DEPOIS.
--   5. ORDEM OBRIGATÓRIA. A tabela atual da Wolff é a DONA DO MOTOR — 12.116 regras, 137 fórmulas de família, as
--      abas e os 164 tempos ESTIMADO pendem do `tabela_id` dela. Os 164 tempos foram DIGITADOS À MÃO e NÃO estão no
--      arquivo. NADA pode arquivar, substituir ou apagar essa tabela antes de esta migração mover o motor para
--      `orcamentista_motor`. Esta é a migração. Só depois dela há o que mexer nas tabelas de preço.
--
-- O QUE FAZ, nesta ordem, numa transação:
--   A. TRAVA as 14 tabelas em SHARE: ninguém grava nelas (uma importação que apaga e regrava por `tabela_id`
--      espera) enquanto se copia e se prova. Leitura segue livre.
--   B. Guarda: a tabela fonte existe, tem motor (tipologias) e arquivo do motor; a família PVC existe; e não há
--      OUTRA planilha para o par (PVC, fornecedor da Wolff).
--   C. FOTOGRAFA o antes: por tabela, o total de linhas, as da fonte, o hash do conteúdo da fonte (com tudo e sem
--      as colunas de dono), e o das tabelas vizinhas que NÃO podem mudar.
--   D. Cria a PLANILHA (id FIXO, `9a233c55-f377-45d3-b2ae-b1a740a98e44`, que é o que torna a migração idempotente):
--      família PVC, fornecedor e arquivo do motor da tabela, vigente — é a única do par.
--   E. Copia as 14 tabelas: `INSERT INTO t (motor_id, <colunas>) SELECT M, <colunas> FROM t WHERE tabela_id = T`.
--      As colunas são TODAS menos `id`, `tabela_id` e `motor_id` — lidas do catálogo, não escritas aqui: coluna
--      que a tabela ganhar amanhã entra na cópia sozinha. O `id` é novo (default). O resto vai IGUAL, inclusive
--      `atualizado_em`, `atualizado_por`, `importado_em` — fato histórico congela (`fato-vs-referencia.md`): os
--      164 tempos continuam ESTIMADO, com a data e o autor de antes.
--   F. VERIFICAÇÃO que ABORTA tudo (nada fica pela metade), por tabela, DEPOIS da cópia:
--        1. a contagem da cópia = a da fonte = a de antes;
--        2. EXCEPT ALL nos DOIS SENTIDOS vazio (fonte − cópia e cópia − fonte, com multiplicidade: uma linha
--           duplicada que a cópia perdesse apareceria — EXCEPT sem ALL a esconderia);
--        3. o hash do conteúdo (jsonb sem as 3 colunas de dono) da cópia = o da fonte, medido ANTES e DEPOIS —
--           prova independente da lista de colunas;
--        4. a fonte não mudou: o hash completo de antes = o de depois;
--        5. nenhuma linha da cópia tem `tabela_id`; o total da tabela = o de antes + o copiado;
--      e: a planilha é a esperada; as tabelas vizinhas (tabela, itens de preço, levantamento, vínculos da base de
--      conhecimento) têm a mesma contagem E o mesmo hash. Qualquer diferença: ERRO, e a transação inteira volta.
--
-- IDEMPOTENTE: com a planilha de id fixo já criada, a migração só avisa ("ja copiado") e NÃO copia nem compara de
-- novo — a fonte pode ter sido reimportada desde então, e comparar a cópia antiga com a fonte nova abortaria sem
-- motivo. Não duplica nada.
--
-- NÃO FAZ: não lê nada novo (PR D), não muda a importação (PR E), não apaga o antigo (PR F), não escreve em
-- `orcamentista_tabela` (nem `familia`, nem `vigente`), não toca nas 4 linhas de `orcamentista_levantamento_item`
-- (todas com `tabela_id` nulo). `orcamentista_tabela.motor_path` e `motor_nome` ficam como estão.
--
-- O ARQUIVO DO MOTOR É COMPARTILHADO: a planilha aponta o MESMO objeto do bucket que `motor_path` da tabela. A rota
-- da tabela (PATCH que troca o motor, DELETE) remove objetos do bucket; ela passou a PULAR o que uma planilha
-- referencia (`caminhosDaPlanilha`). Quem apagar a tabela no PR F tem de saber disto.
--
-- O QUE O DONO DO PRODUTO VERÁ DEPOIS: o bloco Motor lista a planilha PVC + Wolf Perfis (com as mesmas contagens da
-- tabela) E a tabela da Wolff — a primeira diz "a conversa ainda não lê"; a segunda, "a conversa lê este".
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- As 14 tabelas que pendem de `tabela_id` ou `motor_id` (as mesmas da 20261027000002), numa lista só.
CREATE TEMP TABLE v_tabelas_do_motor ON COMMIT DROP AS
  SELECT nome FROM unnest(ARRAY[
    'orcamentista_importacao',
    'orcamentista_motor_baguete',
    'orcamentista_motor_formula',
    'orcamentista_motor_formula_familia',
    'orcamentista_motor_insumo',
    'orcamentista_motor_otimizacao',
    'orcamentista_motor_perfil',
    'orcamentista_motor_regra',
    'orcamentista_motor_tipologia',
    'orcamentista_motor_tipologia_detalhe',
    'orcamentista_motor_tipologia_tempo',
    'orcamentista_motor_validacao',
    'orcamentista_motor_variavel',
    'orcamentista_motor_vidro'
  ]) AS nome;

-- Os parametros: a tabela da Wolff (fonte), a planilha (id FIXO) e a familia.
CREATE TEMP TABLE v_param ON COMMIT DROP AS
  SELECT '72366020-57c9-489f-9385-397b7fa3dedb'::uuid AS tabela_id,
         '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid AS motor_id,
         'PVC'::text AS familia;

-- ── A. trava as 14 tabelas: ninguém grava enquanto se copia e se prova ─────────────────────────────────────
DO $trava$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT nome FROM v_tabelas_do_motor ORDER BY nome LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'dependencia ausente: a tabela % nao existe. Nada foi alterado.', t;
    END IF;
    EXECUTE format('LOCK TABLE public.%I IN SHARE MODE', t);
  END LOOP;
END
$trava$;

-- ── B. guarda ──────────────────────────────────────────────────────────────────────────────────────────
DO $guarda$
DECLARE
  p    record;
  tb   record;
  t    text;
  n    bigint;
  ja   boolean;
  outra record;
BEGIN
  SELECT * INTO p FROM v_param;
  IF to_regclass('public.orcamentista_motor') IS NULL OR to_regclass('public.orcamentista_tabela') IS NULL
     OR to_regclass('public.orcamentista_familia_catalogo') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: as tabelas da 20261027000002_motor_por_familia_e_etapas. Nada foi alterado.';
  END IF;
  FOR t IN SELECT nome FROM v_tabelas_do_motor ORDER BY nome LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'motor_id') THEN
      RAISE EXCEPTION 'dependencia ausente: % nao tem motor_id (20261027000002). Nada foi alterado.', t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p.familia) THEN
    RAISE EXCEPTION 'a familia % nao esta no catalogo. Nada foi alterado.', p.familia;
  END IF;

  SELECT * INTO tb FROM public.orcamentista_tabela WHERE id = p.tabela_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a tabela da Wolff (%) nao existe. Nada foi alterado.', p.tabela_id;
  END IF;

  ja := EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.id = p.motor_id);
  IF ja THEN
    -- a planilha de id fixo ja existe: so se confere que e a deste par
    IF NOT EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.id = p.motor_id AND m.familia = p.familia AND m.fornecedor_id = tb.fornecedor_id) THEN
      RAISE EXCEPTION 'o id fixo da planilha (%) ja pertence a outro par. Nada foi alterado.', p.motor_id;
    END IF;
    RAISE NOTICE 'ja copiado: a planilha % existe; nada sera copiado nem comparado.', p.motor_id;
    RETURN;
  END IF;

  IF btrim(coalesce(tb.motor_nome, '')) = '' OR btrim(coalesce(tb.motor_path, '')) = '' THEN
    RAISE EXCEPTION 'a tabela da Wolff nao tem arquivo do motor (motor_nome/motor_path): nao ha o que apontar na planilha. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_motor_tipologia_detalhe WHERE tabela_id = p.tabela_id;
  IF n = 0 THEN
    RAISE EXCEPTION 'a tabela da Wolff nao tem tipologias na Detalhe: nao ha motor carregado para copiar. Nada foi alterado.';
  END IF;
  SELECT m.arquivo_nome, m.id INTO outra FROM public.orcamentista_motor m
   WHERE m.familia = p.familia AND m.fornecedor_id = tb.fornecedor_id AND m.arquivado_em IS NULL LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja ha outra planilha para o par (%, fornecedor da Wolff): % (%). Copiar criaria uma segunda. Nada foi alterado.', p.familia, outra.arquivo_nome, outra.id;
  END IF;
END
$guarda$;

-- O estado: copia-se SO se a planilha de id fixo ainda nao existe; e quantas planilhas ha antes.
CREATE TEMP TABLE v_estado ON COMMIT DROP AS
  SELECT NOT EXISTS (SELECT 1 FROM public.orcamentista_motor m, v_param p WHERE m.id = p.motor_id) AS copiar,
         (SELECT count(*) FROM public.orcamentista_motor) AS planilhas_antes;

-- ── C. o ANTES: o que a fonte tem e o que NAO pode mudar ───────────────────────────────────────────────
CREATE TEMP TABLE v_antes (
  tabela          text PRIMARY KEY,
  total           bigint NOT NULL,
  na_fonte        bigint NOT NULL,
  hash_fonte      text,
  hash_conteudo   text,
  vizinha         boolean NOT NULL DEFAULT false,
  hash_vizinha    text
) ON COMMIT DROP;
DO $antes$
DECLARE
  t text;
  p record;
  total bigint;
  nf bigint;
  hf text;
  hc text;
BEGIN
  SELECT * INTO p FROM v_param;
  FOR t IN SELECT nome FROM v_tabelas_do_motor ORDER BY nome LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO total;
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(to_jsonb(r)::text, ''|'' ORDER BY to_jsonb(r)::text), '''')), md5(coalesce(string_agg((to_jsonb(r) - ''id'' - ''tabela_id'' - ''motor_id'')::text, ''|'' ORDER BY (to_jsonb(r) - ''id'' - ''tabela_id'' - ''motor_id'')::text), '''')) FROM public.%I r WHERE r.tabela_id = %L::uuid', t, p.tabela_id) INTO nf, hf, hc;
    INSERT INTO v_antes (tabela, total, na_fonte, hash_fonte, hash_conteudo) VALUES (t, total, nf, hf, hc);
  END LOOP;
  -- as vizinhas: nada disto pode mudar (a copia nao escreve nelas)
  FOREACH t IN ARRAY ARRAY['orcamentista_tabela', 'orcamentista_tabela_item', 'orcamentista_levantamento_item', 'orcamentista_mp_categoria_fornecedor', 'orcamentista_materia_prima'] LOOP
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(to_jsonb(r)::text, ''|'' ORDER BY to_jsonb(r)::text), '''')) FROM public.%I r', t) INTO total, hf;
    INSERT INTO v_antes (tabela, total, na_fonte, vizinha, hash_vizinha) VALUES (t, total, 0, true, hf);
  END LOOP;
END
$antes$;

-- ── D + E. a PLANILHA e a COPIA das 14 tabelas ─────────────────────────────────────────────────────────
DO $copia$
DECLARE
  p    record;
  tb   record;
  t    text;
  cols text;
BEGIN
  IF NOT (SELECT copiar FROM v_estado) THEN
    RETURN;
  END IF;
  SELECT * INTO p FROM v_param;
  SELECT * INTO tb FROM public.orcamentista_tabela WHERE id = p.tabela_id;

  INSERT INTO public.orcamentista_motor (id, familia, fornecedor_id, arquivo_nome, arquivo_path, vigente)
  VALUES (p.motor_id, p.familia, tb.fornecedor_id, tb.motor_nome, tb.motor_path, true);

  FOR t IN SELECT nome FROM v_tabelas_do_motor ORDER BY nome LOOP
    -- TODAS as colunas menos as tres de dono: lidas do catalogo, para a coluna de amanha entrar sozinha
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND column_name NOT IN ('id', 'tabela_id', 'motor_id');
    EXECUTE format('INSERT INTO public.%I (motor_id, %s) SELECT %L::uuid, %s FROM public.%I WHERE tabela_id = %L::uuid',
                   t, cols, p.motor_id, cols, t, p.tabela_id);
  END LOOP;
END
$copia$;

-- ── F. VERIFICACAO (aborta): a copia e IGUAL a fonte, nos dois sentidos, e a fonte nao mudou ─────────────
DO $verifica$
DECLARE
  p     record;
  tb    record;
  a     record;
  t     text;
  cols  text;
  copiou boolean;
  n_fonte bigint;
  n_copia bigint;
  n_total bigint;
  n_a   bigint;
  n_b   bigint;
  h_fonte text;
  h_copia text;
  h_fonte_cont text;
  resumo text := '';
BEGIN
  SELECT * INTO p FROM v_param;
  SELECT copiar INTO copiou FROM v_estado;

  IF NOT copiou THEN
    -- ja copiado: so a forma da planilha; a fonte pode ter sido reimportada desde entao
    IF NOT EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.id = p.motor_id) THEN
      RAISE EXCEPTION 'verificacao 0: a planilha % deveria existir. Nada foi alterado.', p.motor_id;
    END IF;
    RAISE NOTICE 'ja copiado: nada foi copiado, nada foi comparado, nada foi alterado.';
    RETURN;
  END IF;

  SELECT * INTO tb FROM public.orcamentista_tabela WHERE id = p.tabela_id;

  -- (1) a planilha e a esperada
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_motor m
                  WHERE m.id = p.motor_id AND m.familia = p.familia AND m.fornecedor_id = tb.fornecedor_id
                    AND m.arquivo_nome = tb.motor_nome AND m.arquivo_path = tb.motor_path
                    AND m.vigente IS TRUE AND m.arquivado_em IS NULL AND m.arquivado_por IS NULL) THEN
    RAISE EXCEPTION 'verificacao 1: a planilha nao e a esperada (familia, fornecedor, arquivo do motor, vigente). Nada foi alterado.';
  END IF;
  IF (SELECT count(*) FROM public.orcamentista_motor) <> (SELECT planilhas_antes FROM v_estado) + 1 THEN
    RAISE EXCEPTION 'verificacao 1: deveria haver exatamente uma planilha a mais (a desta migracao). Nada foi alterado.';
  END IF;

  -- (2) por tabela: contagem, EXCEPT ALL nos dois sentidos, hash do conteudo, fonte intacta, sem tabela_id na copia
  FOR a IN SELECT * FROM v_antes WHERE NOT vizinha ORDER BY tabela LOOP
    t := a.tabela;
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND column_name NOT IN ('id', 'tabela_id', 'motor_id');

    EXECUTE format('SELECT count(*) FROM public.%I WHERE tabela_id = %L::uuid', t, p.tabela_id) INTO n_fonte;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE motor_id = %L::uuid', t, p.motor_id) INTO n_copia;
    IF n_fonte <> a.na_fonte THEN
      RAISE EXCEPTION 'verificacao 2: a FONTE de % tinha % linhas e agora tem %. Nada foi alterado.', t, a.na_fonte, n_fonte;
    END IF;
    IF n_copia <> a.na_fonte THEN
      RAISE EXCEPTION 'verificacao 2: % tem % linhas na fonte e % na copia. Nada foi alterado.', t, a.na_fonte, n_copia;
    END IF;

    EXECUTE format('SELECT count(*) FROM (SELECT %s FROM public.%I WHERE tabela_id = %L::uuid EXCEPT ALL SELECT %s FROM public.%I WHERE motor_id = %L::uuid) x',
                   cols, t, p.tabela_id, cols, t, p.motor_id) INTO n_a;
    EXECUTE format('SELECT count(*) FROM (SELECT %s FROM public.%I WHERE motor_id = %L::uuid EXCEPT ALL SELECT %s FROM public.%I WHERE tabela_id = %L::uuid) x',
                   cols, t, p.motor_id, cols, t, p.tabela_id) INTO n_b;
    IF n_a <> 0 OR n_b <> 0 THEN
      RAISE EXCEPTION 'verificacao 3: % difere — fonte menos copia: % linha(s); copia menos fonte: % linha(s). Nada foi alterado.', t, n_a, n_b;
    END IF;

    -- o hash do conteudo (jsonb sem as tres colunas de dono): independente da lista de colunas acima
    EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(r) - ''id'' - ''tabela_id'' - ''motor_id'')::text, ''|'' ORDER BY (to_jsonb(r) - ''id'' - ''tabela_id'' - ''motor_id'')::text), '''')) FROM public.%I r WHERE r.motor_id = %L::uuid', t, p.motor_id) INTO h_copia;
    EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(r) - ''id'' - ''tabela_id'' - ''motor_id'')::text, ''|'' ORDER BY (to_jsonb(r) - ''id'' - ''tabela_id'' - ''motor_id'')::text), '''')) FROM public.%I r WHERE r.tabela_id = %L::uuid', t, p.tabela_id) INTO h_fonte_cont;
    IF h_copia IS DISTINCT FROM a.hash_conteudo OR h_fonte_cont IS DISTINCT FROM a.hash_conteudo THEN
      RAISE EXCEPTION 'verificacao 4: o conteudo de % difere (antes %, fonte agora %, copia %). Nada foi alterado.', t, a.hash_conteudo, h_fonte_cont, h_copia;
    END IF;

    -- a fonte nao mudou: o hash completo (com id e tabela_id) de antes e de depois
    EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(r)::text, ''|'' ORDER BY to_jsonb(r)::text), '''')) FROM public.%I r WHERE r.tabela_id = %L::uuid', t, p.tabela_id) INTO h_fonte;
    IF h_fonte IS DISTINCT FROM a.hash_fonte THEN
      RAISE EXCEPTION 'verificacao 5: a FONTE de % mudou (hash de antes % e de depois %). Nada foi alterado.', t, a.hash_fonte, h_fonte;
    END IF;

    -- a copia nao tem tabela_id, e o total cresceu exatamente o que se copiou
    EXECUTE format('SELECT count(*) FROM public.%I WHERE motor_id = %L::uuid AND tabela_id IS NOT NULL', t, p.motor_id) INTO n_a;
    IF n_a <> 0 THEN
      RAISE EXCEPTION 'verificacao 6: % linha(s) de % tem motor_id E tabela_id. Nada foi alterado.', n_a, t;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n_total;
    IF n_total <> a.total + a.na_fonte THEN
      RAISE EXCEPTION 'verificacao 6: % tinha % linhas, copiou-se %, e agora tem % (esperado %). Nada foi alterado.', t, a.total, a.na_fonte, n_total, a.total + a.na_fonte;
    END IF;
    resumo := resumo || format(E'\n  %s: %s linhas copiadas, iguais nos dois sentidos', t, n_copia);
  END LOOP;

  -- (3) as vizinhas nao mudaram: contagem E hash
  FOR a IN SELECT * FROM v_antes WHERE vizinha ORDER BY tabela LOOP
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(to_jsonb(r)::text, ''|'' ORDER BY to_jsonb(r)::text), '''')) FROM public.%I r', a.tabela) INTO n_total, h_fonte;
    IF n_total <> a.total OR h_fonte IS DISTINCT FROM a.hash_vizinha THEN
      RAISE EXCEPTION 'verificacao 7: % mudou (tinha % linhas, agora %; o hash tambem). Nada foi alterado.', a.tabela, a.total, n_total;
    END IF;
  END LOOP;

  RAISE NOTICE 'motor da Wolff copiado para a planilha %:%', p.motor_id, resumo;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
