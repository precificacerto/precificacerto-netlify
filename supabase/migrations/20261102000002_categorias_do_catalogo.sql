-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261102000002 — AS CATEGORIAS GANHAM TELA: criar, renomear (o rótulo) e remover (a SEXTA RAIZ do arrasto).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão: 20261102000002_categorias_do_catalogo.
-- ║ PRESSUPÕE a 20261031000003 (o catálogo soberano) e a 20261101000001 (a tabela na soberania) APLICADAS — os cinco corpos do arrasto
-- ║ conferidos em produção em 02/11/2026 pelo md5, que a guarda abaixo confere de novo.
-- ║ SEM ELA O CÓDIGO QUEBRA: a aba Categorias chama `superadmin_criar_categoria` e `superadmin_editar_categoria`, e remove pela rota do arrasto
-- ║ com o tipo 'categoria', que a função de hoje recusa como desconhecido.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 02/11/2026: "Hoje as categorias [...] não têm tela: só aparecem como caixas de seleção na família. Quero criar,
-- renomear e remover categoria, como já faço com etapa." E as decisões dele, sobre a medição do mesmo dia:
--   1. RENOMEAR É SÓ O RÓTULO; A CHAVE É IMUTÁVEL, como na família. A chave é a PK, 5 FKs a apontam sem ON UPDATE CASCADE, e o código e o banco
--      a citam como texto (PERFIL em cinco pontos do código e em duas CHECKs e duas funções; VIDRO, FERRAGENS e INSTALACAO numa CHECK e numa
--      função cada). A tela diz isso quando o usuário tentar editar a chave.
--   2. REMOVER ARRASTA, como nas outras raízes: a remoção leva `orcamentista_mp_categoria` e o que pende dela (fornecedores vinculados, vidros,
--      ferragens, instalação) — configuração de conta, não documento de cliente; a trava C não se aplica. O arrasto NOMEIA CADA EMPRESA e a
--      contagem por empresa antes de confirmar, e a remoção recusa se a assinatura mudou. Nunca apaga sem exibir a lista.
--   3. PERFIL, VIDRO, FERRAGENS e INSTALACAO TÊM REMOÇÃO RECUSADA nesta migração, com motivo nomeado: são estruturais no código e no banco
--      (`orcamentista_categorias_estruturais()`). Destravá-las é mudança de código e de CHECK, noutra PR. Criar categoria nova e remover categoria
--      não estrutural é livre.
--
-- O QUE FAZ:
--   A. duas CHECKs no catálogo: a forma da chave (`^[A-Z][A-Z0-9_]{0,39}$`, a mesma da família) e a do rótulo (1 a 60, sem espaço nas pontas) —
--      as 7 de hoje passam (conferido antes de criar; aborta se não);
--   B. `superadmin_criar_categoria(p_por, p_chave, p_rotulo)` (ordem = a última + 1, sob trava; chave e nome não repetem) e
--      `superadmin_editar_categoria(p_por, p_chave, p_rotulo)` (só o rótulo), as duas com log em `superadmin_alteracao_log`;
--   C. a sexta raiz 'categoria' no arrasto: `orcamentista_arrasto_passos` (os motores e as tabelas da categoria, pelos passos que já existem;
--      e a base de conhecimento das contas: fornecedor escolhido, vidros, ferragens, instalação, a categoria da família de conta; os campos do
--      catálogo; as ramificações; a própria categoria), `orcamentista_arrasto_conjuntos` (motores e tabelas da categoria), `orcamentista_arrasto_medir`
--      (a chave 'empresas': por empresa, a contagem de cada coisa que sai; o impedimento 'categoria_estrutural') e `superadmin_remover_do_catalogo`
--      (a trava da linha da categoria; a recusa da estrutural, 23514). `superadmin_arrasto_do_catalogo` não muda.
-- O QUE NÃO FAZ: não troca FK nenhuma; não renomeia chave; não mexe em dado (nenhuma linha muda ao aplicar); não muda os passos dos cinco tipos de
-- antes (a verificação compara com a foto e aborta se mudou).
-- GUARDA (aborta): os cinco corpos do arrasto são os aplicados (md5); as 7 linhas passam nas CHECKs novas; o fecho real com o tipo novo.
-- VERIFICAÇÃO (aborta): os passos dos cinco tipos de antes iguais aos de antes; o tipo 'categoria' com os passos esperados, documento de cliente só
-- perdendo o vínculo; as CHECKs; as funções fechadas; nenhuma FK mudou.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA: o que esta migração substitui é o que foi lido ─────────────────────────────────
DO $guarda$
DECLARE
  v_esperado jsonb := jsonb_build_object(
    'orcamentista_arrasto_passos', 'c5beabd1f3179b55d279f5c6d411502e', 'orcamentista_arrasto_conjuntos', '790b7d036726b5944c801a58d7ddc5e9',
    'orcamentista_arrasto_medir', 'c68e4124320ac56e658362a20d38af57', 'superadmin_arrasto_do_catalogo', '353e8ee77a0e4f903c79b9846a54ce44',
    'superadmin_remover_do_catalogo', '24ade9ea78cb348ecd44658390d92bfd');
  -- reaplicar esta migração encontra os corpos DELA nas quatro que ela troca: também valem (a reaplicação é inofensiva)
  v_desta    jsonb := jsonb_build_object('orcamentista_arrasto_passos', 'f50bd778b563778eda14d0a752aaef1c', 'orcamentista_arrasto_conjuntos', 'e5f5de25bffb57f225ab3d3fc17c05f9',
    'orcamentista_arrasto_medir', '086abcd7e532634f3062962199807de3', 'superadmin_remover_do_catalogo', '9d6066e00618810b6927c61992c59cbf');
  v_achado   jsonb;
  v_tx       text;
BEGIN
  SELECT coalesce(jsonb_object_agg(p.proname, md5(replace(p.prosrc, chr(13), ''))), '{}'::jsonb) INTO v_achado
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN (SELECT jsonb_object_keys(v_esperado));
  IF v_achado IS DISTINCT FROM v_esperado AND v_achado IS DISTINCT FROM v_esperado || v_desta THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261031000003 e a 20261101000001 (o arrasto do catalogo) nao estao aplicadas como foram lidas (corpos: %). Nada foi alterado.', v_achado;
  END IF;
  -- as CHECKs novas valem para o que ja esta la: nenhuma das linhas de hoje pode ficar fora da forma
  SELECT string_agg(c.chave || ' (' || c.rotulo || ')', ', ') INTO v_tx FROM public.orcamentista_categoria_catalogo c
   WHERE c.chave !~ '^[A-Z][A-Z0-9_]{0,39}$' OR c.rotulo <> btrim(c.rotulo) OR length(c.rotulo) NOT BETWEEN 1 AND 60;
  IF v_tx IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: categoria fora da forma que a migracao exige: %. Nada foi alterado.', v_tx;
  END IF;
END
$guarda$;

-- a foto: as chaves estrangeiras e os passos dos cinco tipos de antes, para a verificação provar que nada disso mudou
CREATE TEMP TABLE _categorias_fks ON COMMIT DROP AS
SELECT c.conname::text AS conname, c.conrelid::regclass::text AS tabela, c.confdeltype::text AS del, c.confupdtype::text AS upd
  FROM pg_constraint c WHERE c.contype = 'f';
CREATE TEMP TABLE _categorias_passos ON COMMIT DROP AS
SELECT tp AS tipo, public.orcamentista_arrasto_passos(tp) AS passos FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia', 'tabela']) tp;

-- ── A. AS CHECKs do catálogo (reaplicáveis) ────────────────────────────────────────────────
ALTER TABLE public.orcamentista_categoria_catalogo
  DROP CONSTRAINT IF EXISTS orcamentista_categoria_catalogo_chave_forma,
  ADD  CONSTRAINT orcamentista_categoria_catalogo_chave_forma  CHECK (chave ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  DROP CONSTRAINT IF EXISTS orcamentista_categoria_catalogo_rotulo_forma,
  ADD  CONSTRAINT orcamentista_categoria_catalogo_rotulo_forma CHECK (rotulo = btrim(rotulo) AND length(rotulo) BETWEEN 1 AND 60);

-- ── AS ESTRUTURAIS (decisão 3): uma fonte só, para a medição e a remoção ───────────────────────
CREATE OR REPLACE FUNCTION public.orcamentista_categorias_estruturais() RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $fn$ SELECT ARRAY['PERFIL', 'VIDRO', 'FERRAGENS', 'INSTALACAO'] $fn$;
REVOKE ALL ON FUNCTION public.orcamentista_categorias_estruturais() FROM PUBLIC, anon, authenticated;

-- ── B. CRIAR ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_criar_categoria(p_por uuid, p_chave text, p_rotulo text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rotulo     text := btrim(coalesce(p_rotulo, ''));
  v_igual      text;
  v_ordem      integer;
  v_depois     jsonb;
  v_constraint text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- uma criacao por vez: a ordem e a ultima + 1 e o nome nao repete - as duas conferencias valem so sob a trava
  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_categoria_catalogo', 0));
  IF EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave) THEN
    RAISE EXCEPTION 'a categoria de chave "%" ja existe. Nada foi gravado.', p_chave USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT c.rotulo INTO v_igual FROM public.orcamentista_categoria_catalogo c WHERE lower(btrim(c.rotulo)) = lower(v_rotulo) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja existe a categoria "%": o nome nao se repete. Nada foi gravado.', v_igual USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(max(c.ordem), 0) + 1 INTO v_ordem FROM public.orcamentista_categoria_catalogo c;

  BEGIN
    INSERT INTO public.orcamentista_categoria_catalogo (chave, rotulo, ordem) VALUES (p_chave, v_rotulo, v_ordem);
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_categoria_catalogo_chave_forma'  THEN 'a chave da categoria e maiuscula, comeca por letra e tem ate 40 caracteres (letras, digitos e _). Nada foi gravado.'
      WHEN 'orcamentista_categoria_catalogo_rotulo_forma' THEN 'o nome da categoria tem de 1 a 60 caracteres. Nada foi gravado.'
      ELSE 'um valor nao passou numa regra do banco. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;

  v_depois := jsonb_build_object('orcamentista_categoria_catalogo', (SELECT to_jsonb(c) FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave));
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_categoria_catalogo', p_chave, NULL, v_depois, p_por);
  RETURN v_depois;
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_criar_categoria(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_categoria(uuid, text, text) TO service_role;

-- ── B. EDITAR: só o rótulo (a chave não se renomeia — decisão 1) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_editar_categoria(p_por uuid, p_chave text, p_rotulo text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rotulo     text := btrim(coalesce(p_rotulo, ''));
  v_igual      text;
  v_antes      jsonb;
  v_depois     jsonb;
  v_rotulo_era text;
  v_constraint text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_categoria_catalogo', 0));
  SELECT c.rotulo INTO v_rotulo_era FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'categoria inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT c.rotulo INTO v_igual FROM public.orcamentista_categoria_catalogo c WHERE c.chave <> p_chave AND lower(btrim(c.rotulo)) = lower(v_rotulo) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja existe a categoria "%": o nome nao se repete. Nada foi gravado.', v_igual USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_rotulo_era = v_rotulo THEN
    RAISE EXCEPTION 'nada mudou: o nome e o de agora. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_antes := jsonb_build_object('orcamentista_categoria_catalogo', (SELECT to_jsonb(c) FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave));
  BEGIN
    UPDATE public.orcamentista_categoria_catalogo SET rotulo = v_rotulo WHERE chave = p_chave;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_categoria_catalogo_rotulo_forma' THEN 'o nome da categoria tem de 1 a 60 caracteres. Nada foi gravado.'
      ELSE 'um valor nao passou numa regra do banco. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;
  v_depois := jsonb_build_object('orcamentista_categoria_catalogo', (SELECT to_jsonb(c) FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave));
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_categoria_catalogo', p_chave, v_antes, v_depois, p_por);
  RETURN v_depois;
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_editar_categoria(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_editar_categoria(uuid, text, text) TO service_role;

-- ── C1. OS PASSOS, com o tipo 'categoria' ──────────────────────────────────────────────────────
-- O corpo é o da 20261101000001 com o tipo novo: os motores e as tabelas da categoria seguem os passos de motor e de tabela que já existem
-- (o item de levantamento perde o motor e a tabela; a etapa de conta perde o motor; o conteúdo, a importação, os itens, a conta_tabela, as
-- ligações, o motor e a tabela saem), e no fim a base de conhecimento das contas, os campos, as ramificações e a categoria.
CREATE OR REPLACE FUNCTION public.orcamentista_arrasto_passos(p_tipo text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_conteudo text[] := ARRAY['orcamentista_motor_baguete', 'orcamentista_motor_formula', 'orcamentista_motor_formula_familia', 'orcamentista_motor_insumo',
                             'orcamentista_motor_otimizacao', 'orcamentista_motor_perfil', 'orcamentista_motor_regra', 'orcamentista_motor_tipologia',
                             'orcamentista_motor_tipologia_detalhe', 'orcamentista_motor_tipologia_tempo', 'orcamentista_motor_validacao',
                             'orcamentista_motor_variavel', 'orcamentista_motor_vidro'];
  v_generico text := 'coalesce(to_jsonb(x) ->> ''codigo'', to_jsonb(x) ->> ''nome'', to_jsonb(x) ->> ''tipologia'', to_jsonb(x) ->> ''parametro'', to_jsonb(x) ->> ''descricao'', to_jsonb(x) ->> ''id'')';
  v_empresa  text := '(SELECT coalesce(t.name, ''(sem nome)'') FROM public.tenants t WHERE t.id = x.tenant_id)';
  v_item     text;
  v_linha    text := '(SELECT coalesce(t.name, ''(sem nome)'') FROM public.orcamentista_mp_categoria c JOIN public.tenants t ON t.id = c.tenant_id WHERE c.id = x.mp_categoria_id) || '' / '' || coalesce(to_jsonb(x) ->> ''descricao'', to_jsonb(x) ->> ''referencia'', to_jsonb(x) ->> ''produto'', to_jsonb(x) ->> ''id'')';
  v_etapa    text;
  v_p        jsonb := '[]'::jsonb;
  t          text;
BEGIN
  v_item  := v_empresa || ' || '' / levantamento '' || left(x.levantamento_id::text, 8) || '' / item '' || x.ordem';
  v_etapa := v_empresa || ' || '' / '' || (SELECT mp.nome FROM public.orcamentista_materia_prima mp WHERE mp.id = x.materia_prima_id) || '' / etapa '' || x.numero';

  IF p_tipo = 'etapa' THEN
    RETURN jsonb_build_array(
      jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'sai', 'filtro', 'x.etapa_catalogo_id = $1::uuid', 'nome', v_etapa, 'rotulo', 'etapa de conta'),
      jsonb_build_object('t', 'orcamentista_etapa_catalogo', 'acao', 'sai', 'filtro', 'x.id = $1::uuid', 'nome', 'x.nome', 'rotulo', 'etapa do catalogo'));
  END IF;

  IF p_tipo NOT IN ('motor', 'fornecedor', 'familia', 'tabela', 'categoria') THEN
    RAISE EXCEPTION 'tipo de remocao desconhecido: %', p_tipo USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- os DOCUMENTOS DE CLIENTE perdem o vinculo, nunca saem (trava C)
  IF p_tipo = 'familia' THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'x.familia = $1',
      'anula', 'familia = NULL, motor_id = NULL, motor_familia_exigida = NULL', 'nome', v_item, 'rotulo', 'item de levantamento (documento de cliente)');
  ELSIF p_tipo <> 'tabela' THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'x.motor_id = ANY ($2)',
      'anula', 'motor_id = NULL, motor_familia_exigida = NULL', 'nome', v_item, 'rotulo', 'item de levantamento (documento de cliente)');
  END IF;
  IF p_tipo IN ('fornecedor', 'familia', 'tabela', 'categoria') THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'x.tabela_id = ANY ($3)',
      'anula', 'tabela_id = NULL', 'nome', v_item, 'rotulo', 'item de levantamento (documento de cliente)');
  END IF;

  -- as ETAPAS DA CONTA: na familia, saem as da familia; no motor e no fornecedor, as que apontam o motor que sai perdem o motor
  IF p_tipo = 'familia' THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'sai', 'filtro', 'x.familia = $1', 'nome', v_etapa, 'rotulo', 'etapa de conta');
  ELSIF p_tipo <> 'tabela' THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'perde_o_vinculo', 'filtro', 'x.motor_id = ANY ($2)',
      'anula', 'motor_id = NULL, motor_familia_exigida = NULL', 'nome', v_etapa, 'rotulo', 'etapa de conta (fica sem motor)');
  END IF;

  -- o CONTEUDO dos motores que saem, e o das tabelas que saem (cada linha e de um dono so: CHECK _um_dono)
  IF p_tipo <> 'tabela' THEN
    FOREACH t IN ARRAY v_conteudo LOOP
      v_p := v_p || jsonb_build_object('t', t, 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2)', 'nome', v_generico, 'rotulo', 'conteudo do motor');
    END LOOP;
  END IF;
  IF p_tipo IN ('fornecedor', 'familia', 'tabela', 'categoria') THEN
    FOREACH t IN ARRAY v_conteudo LOOP
      v_p := v_p || jsonb_build_object('t', t, 'acao', 'sai', 'filtro', 'x.tabela_id = ANY ($3)', 'nome', v_generico, 'rotulo', 'conteudo de motor da tabela');
    END LOOP;
    v_p := v_p || jsonb_build_object('t', 'orcamentista_importacao', 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2) OR x.tabela_id = ANY ($3)', 'nome', v_generico, 'rotulo', 'importacao')
               || jsonb_build_object('t', 'orcamentista_tabela_item', 'acao', 'sai', 'filtro', 'x.tabela_id = ANY ($3)', 'nome', v_generico, 'rotulo', 'item de preco')
               || jsonb_build_object('t', 'orcamentista_conta_tabela', 'acao', 'sai', 'filtro', 'x.tabela_id = ANY ($3)', 'nome', v_empresa, 'rotulo', 'tabela escolhida por conta');
  ELSE
    v_p := v_p || jsonb_build_object('t', 'orcamentista_importacao', 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2)', 'nome', v_generico, 'rotulo', 'importacao');
  END IF;

  -- a TABELA sozinha (01/11/2026) nao leva motor nem ligacao: o motor do catalogo e outra raiz
  IF p_tipo <> 'tabela' THEN
    -- as LIGACOES motor-familia: na familia, todas as da familia (as dos motores que saem vao junto); nos outros, as dos motores que saem
    IF p_tipo = 'familia' THEN
      v_p := v_p || jsonb_build_object('t', 'orcamentista_motor_familia', 'acao', 'sai', 'filtro', 'x.familia = $1 OR x.motor_id = ANY ($2)',
        'nome', '(SELECT m.nome FROM public.orcamentista_motor m WHERE m.id = x.motor_id) || '' / '' || x.familia', 'rotulo', 'ligacao motor-familia');
    ELSE
      v_p := v_p || jsonb_build_object('t', 'orcamentista_motor_familia', 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2)',
        'nome', '(SELECT m.nome FROM public.orcamentista_motor m WHERE m.id = x.motor_id) || '' / '' || x.familia', 'rotulo', 'ligacao motor-familia');
    END IF;
    v_p := v_p || jsonb_build_object('t', 'orcamentista_motor', 'acao', 'sai', 'filtro', 'x.id = ANY ($2)', 'nome', 'x.nome', 'rotulo', 'motor');
  END IF;
  IF p_tipo IN ('fornecedor', 'familia', 'tabela', 'categoria') THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_tabela', 'acao', 'sai', 'filtro', 'x.id = ANY ($3)',
      'nome', '(SELECT f.nome FROM public.orcamentista_fornecedor f WHERE f.id = x.fornecedor_id) || '' / '' || x.arquivo_nome || '' ('' || left(x.id::text, 8) || '')''', 'rotulo', 'tabela de fornecedor');
  END IF;
  IF p_tipo = 'familia' THEN
    v_p := v_p
      || jsonb_build_object('t', 'orcamentista_tabela', 'acao', 'perde_o_vinculo', 'filtro', 'x.familia = $1 AND NOT (x.id = ANY ($3))', 'anula', 'familia = NULL',
           'nome', '(SELECT f.nome FROM public.orcamentista_fornecedor f WHERE f.id = x.fornecedor_id) || '' / '' || x.arquivo_nome || '' ('' || left(x.id::text, 8) || '')''', 'rotulo', 'tabela de outra categoria (perde a familia)')
      || jsonb_build_object('t', 'orcamentista_materia_prima', 'acao', 'perde_o_vinculo', 'filtro', 'x.familia = $1', 'anula', 'familia = NULL',
           'nome', v_empresa || ' || '' / '' || x.nome', 'rotulo', 'materia-prima de conta (fica, sem tipo)')
      || jsonb_build_object('t', 'orcamentista_familia_ramificacao', 'acao', 'sai', 'filtro', 'x.familia = $1', 'nome', 'x.categoria_chave', 'rotulo', 'ramificacao da familia')
      || jsonb_build_object('t', 'orcamentista_familia_catalogo', 'acao', 'sai', 'filtro', 'x.chave = $1', 'nome', 'x.rotulo', 'rotulo', 'familia');
  END IF;
  IF p_tipo = 'fornecedor' THEN
    v_p := v_p
      || jsonb_build_object('t', 'orcamentista_mp_categoria_fornecedor', 'acao', 'sai', 'filtro', 'x.fornecedor_id = $1::uuid',
           'nome', v_empresa || ' || '' / '' || (SELECT c.categoria_chave FROM public.orcamentista_mp_categoria c WHERE c.id = x.mp_categoria_id)', 'rotulo', 'fornecedor escolhido por conta')
      || jsonb_build_object('t', 'orcamentista_fornecedor', 'acao', 'sai', 'filtro', 'x.id = $1::uuid', 'nome', 'x.nome', 'rotulo', 'fornecedor');
  END IF;
  -- a CATEGORIA (02/11/2026, a sexta raiz): leva os motores e as tabelas dela (acima), e a BASE DE CONHECIMENTO das contas que a usam —
  -- configuracao de conta, nao documento de cliente (decisao 2 do dono do produto): sai, nomeando a empresa em cada linha
  IF p_tipo = 'categoria' THEN
    v_p := v_p
      || jsonb_build_object('t', 'orcamentista_mp_categoria_fornecedor', 'acao', 'sai',
           'filtro', 'x.mp_categoria_id IN (SELECT c.id FROM public.orcamentista_mp_categoria c WHERE c.categoria_chave = $1)',
           'nome', v_empresa || ' || '' / '' || (SELECT f.nome FROM public.orcamentista_fornecedor f WHERE f.id = x.fornecedor_id)', 'rotulo', 'fornecedor escolhido por conta')
      || jsonb_build_object('t', 'orcamentista_mp_vidro', 'acao', 'sai', 'filtro', 'x.mp_categoria_id IN (SELECT c.id FROM public.orcamentista_mp_categoria c WHERE c.categoria_chave = $1)', 'nome', v_linha, 'rotulo', 'vidro da conta')
      || jsonb_build_object('t', 'orcamentista_mp_ferragem', 'acao', 'sai', 'filtro', 'x.mp_categoria_id IN (SELECT c.id FROM public.orcamentista_mp_categoria c WHERE c.categoria_chave = $1)', 'nome', v_linha, 'rotulo', 'ferragem da conta')
      || jsonb_build_object('t', 'orcamentista_mp_instalacao', 'acao', 'sai', 'filtro', 'x.mp_categoria_id IN (SELECT c.id FROM public.orcamentista_mp_categoria c WHERE c.categoria_chave = $1)', 'nome', v_linha, 'rotulo', 'instalacao da conta')
      || jsonb_build_object('t', 'orcamentista_mp_categoria', 'acao', 'sai', 'filtro', 'x.categoria_chave = $1',
           'nome', v_empresa || ' || '' / '' || (SELECT mp.nome FROM public.orcamentista_materia_prima mp WHERE mp.id = x.materia_prima_id)', 'rotulo', 'categoria da familia de conta, com os dados')
      || jsonb_build_object('t', 'orcamentista_categoria_campo', 'acao', 'sai', 'filtro', 'x.categoria_chave = $1', 'nome', 'x.chave', 'rotulo', 'campo da categoria')
      || jsonb_build_object('t', 'orcamentista_familia_ramificacao', 'acao', 'sai', 'filtro', 'x.categoria_chave = $1', 'nome', 'x.familia', 'rotulo', 'ramificacao da familia')
      || jsonb_build_object('t', 'orcamentista_categoria_catalogo', 'acao', 'sai', 'filtro', 'x.chave = $1', 'nome', 'x.rotulo', 'rotulo', 'categoria');
  END IF;
  RETURN v_p;
END
$fn$;

-- ── O FECHO (guarda, aborta): toda FK que aponta uma tabela de onde a remoção APAGA tem de vir de uma tabela que os passos conhecem ─────
DO $fecho$
DECLARE
  v_tx    text;
  v_sai   text[];
  v_todas text[];
BEGIN
  SELECT array_agg(DISTINCT x ->> 't') INTO v_sai FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia', 'tabela', 'categoria']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x
   WHERE x ->> 'acao' = 'sai';
  SELECT array_agg(DISTINCT x ->> 't') INTO v_todas FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia', 'tabela', 'categoria']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x;
  SELECT string_agg(DISTINCT format('%s -> %s (%s)', c.conrelid::regclass, c.confrelid::regclass, c.conname), '; ') INTO v_tx
    FROM pg_constraint c
   WHERE c.contype = 'f' AND c.confrelid::regclass::text = ANY (v_sai) AND NOT (c.conrelid::regclass::text = ANY (v_todas))
     AND c.confrelid::regclass::text <> 'users';
  IF v_tx IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: o fecho da remocao nao conhece estas chaves estrangeiras: %. Nada foi alterado.', v_tx;
  END IF;
END
$fecho$;

-- ── C2. OS CONJUNTOS, com a categoria ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orcamentista_arrasto_conjuntos(p_tipo text, p_chave text, OUT nome text, OUT motores uuid[], OUT tabelas uuid[])
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  motores := '{}'; tabelas := '{}';
  IF p_chave IS NULL OR (p_tipo NOT IN ('familia', 'categoria') AND p_chave !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    nome := NULL; RETURN;
  END IF;
  IF p_tipo = 'etapa' THEN
    SELECT c.nome INTO nome FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_chave::uuid;
  ELSIF p_tipo = 'motor' THEN
    SELECT m.nome INTO nome FROM public.orcamentista_motor m WHERE m.id = p_chave::uuid;
    IF nome IS NOT NULL THEN motores := ARRAY[p_chave::uuid]; END IF;
  ELSIF p_tipo = 'fornecedor' THEN
    SELECT f.nome INTO nome FROM public.orcamentista_fornecedor f WHERE f.id = p_chave::uuid;
    SELECT coalesce(array_agg(m.id ORDER BY m.id), '{}') INTO motores FROM public.orcamentista_motor m WHERE m.fornecedor_id = p_chave::uuid;
    SELECT coalesce(array_agg(t.id ORDER BY t.id), '{}') INTO tabelas FROM public.orcamentista_tabela t WHERE t.fornecedor_id = p_chave::uuid;
  ELSIF p_tipo = 'familia' THEN
    SELECT f.rotulo INTO nome FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave;
    -- decisão 3: o motor cuja ÚNICA família é a removida sai junto
    SELECT coalesce(array_agg(mf.motor_id ORDER BY mf.motor_id), '{}') INTO motores FROM public.orcamentista_motor_familia mf
     WHERE mf.familia = p_chave AND NOT EXISTS (SELECT 1 FROM public.orcamentista_motor_familia o WHERE o.motor_id = mf.motor_id AND o.familia <> p_chave);
    -- decisão 2: a tabela de PERFIL da família sai junto
    SELECT coalesce(array_agg(t.id ORDER BY t.id), '{}') INTO tabelas FROM public.orcamentista_tabela t WHERE t.familia = p_chave AND t.categoria_chave = 'PERFIL';
  ELSIF p_tipo = 'tabela' THEN
    -- a quinta raiz (01/11/2026): a tabela sozinha; o motor do catalogo, que tem copia propria, fica
    SELECT f.nome || ' / ' || t.arquivo_nome || ' (' || left(t.id::text, 8) || ')' INTO nome
      FROM public.orcamentista_tabela t JOIN public.orcamentista_fornecedor f ON f.id = t.fornecedor_id WHERE t.id = p_chave::uuid;
    IF nome IS NOT NULL THEN tabelas := ARRAY[p_chave::uuid]; END IF;
  ELSIF p_tipo = 'categoria' THEN
    -- a sexta raiz (02/11/2026): os motores e as tabelas DESTA categoria saem com ela
    SELECT c.rotulo INTO nome FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave;
    SELECT coalesce(array_agg(m.id ORDER BY m.id), '{}') INTO motores FROM public.orcamentista_motor m WHERE m.categoria_chave = p_chave;
    SELECT coalesce(array_agg(t.id ORDER BY t.id), '{}') INTO tabelas FROM public.orcamentista_tabela t WHERE t.categoria_chave = p_chave;
  ELSE
    RAISE EXCEPTION 'tipo de remocao desconhecido: %', p_tipo USING ERRCODE = 'invalid_parameter_value';
  END IF;
END
$fn$;

-- ── C3. A MEDIÇÃO, com as empresas e o impedimento estrutural ────────────────────────────────
CREATE OR REPLACE FUNCTION public.orcamentista_arrasto_medir(p_tipo text, p_chave text) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c        record;
  p        jsonb;
  i        integer := 0;
  v_n      bigint;
  v_nomes  text[];
  v_passos jsonb := '[]'::jsonb;
  v_ficam  jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_imped  jsonb := '[]'::jsonb;
  v_empresas jsonb := '[]'::jsonb;
  v_arq    text[];
BEGIN
  SELECT * INTO c FROM public.orcamentista_arrasto_conjuntos(p_tipo, p_chave);
  IF c.nome IS NULL THEN
    RAISE EXCEPTION 'o item do catalogo nao existe (% %)', p_tipo, coalesce(p_chave, '(vazio)') USING ERRCODE = 'no_data_found';
  END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(public.orcamentista_arrasto_passos(p_tipo)) LOOP
    i := i + 1;
    EXECUTE format('SELECT count(*) FROM public.%I x WHERE %s', p ->> 't', p ->> 'filtro') INTO v_n USING p_chave, c.motores, c.tabelas;
    IF v_n > 0 THEN
      EXECUTE format('SELECT array_agg(n ORDER BY n) FROM (SELECT (%s)::text AS n FROM public.%I x WHERE %s ORDER BY 1 LIMIT 10) z', p ->> 'nome', p ->> 't', p ->> 'filtro')
        INTO v_nomes USING p_chave, c.motores, c.tabelas;
    ELSE
      v_nomes := '{}';
    END IF;
    v_passos := v_passos || jsonb_build_object('passo', i, 'tabela', p ->> 't', 'acao', p ->> 'acao', 'rotulo', p ->> 'rotulo', 'quantidade', v_n,
                                               'nomes', to_jsonb(coalesce(v_nomes, '{}')), 'mais', greatest(v_n - 10, 0));
  END LOOP;

  -- o que FICA (decisão 5: o Storage e o texto não saem; só aparecem no arrasto)
  SELECT array_agg(a) INTO v_arq FROM (
    SELECT m.arquivo_path AS a FROM public.orcamentista_motor m WHERE m.id = ANY (c.motores)
    UNION SELECT t.arquivo_path FROM public.orcamentista_tabela t WHERE t.id = ANY (c.tabelas)
    UNION SELECT t.motor_path FROM public.orcamentista_tabela t WHERE t.id = ANY (c.tabelas) AND coalesce(t.motor_path, '') <> '') z WHERE a IS NOT NULL;
  IF p_tipo = 'fornecedor' THEN
    SELECT array_agg(o.name ORDER BY o.name) INTO v_arq FROM storage.objects o WHERE o.name LIKE p_chave || '/%' OR o.name = ANY (coalesce(v_arq, '{}'));
  ELSIF v_arq IS NOT NULL THEN
    SELECT array_agg(o.name ORDER BY o.name) INTO v_arq FROM storage.objects o WHERE o.name = ANY (v_arq);
  END IF;
  IF cardinality(coalesce(v_arq, '{}')) > 0 THEN
    v_ficam := v_ficam || jsonb_build_object('rotulo', 'arquivo no Storage (fica)', 'quantidade', cardinality(v_arq), 'nomes', to_jsonb(v_arq[1:10]),
                                             'mais', greatest(cardinality(v_arq) - 10, 0));
  END IF;
  IF p_tipo = 'fornecedor' THEN
    SELECT array_agg(x ORDER BY x) INTO v_arq FROM (
      SELECT 'base da conta: ' || coalesce((SELECT t.name FROM public.tenants t WHERE t.id = b.tenant_id), '(sem nome)') AS x FROM public.orcamentista_esquadrias_base b
       WHERE lower(btrim(b.fornecedor_perfil)) = lower(btrim(c.nome))
      UNION ALL SELECT 'padrao do nicho: ' || coalesce((SELECT n.nome FROM public.orcamentista_nicho n WHERE n.id = d.nicho_id), '(sem nome)') FROM public.orcamentista_esquadrias_padrao d
       WHERE lower(btrim(d.fornecedor_perfil)) = lower(btrim(c.nome))) z;
    IF cardinality(coalesce(v_arq, '{}')) > 0 THEN
      v_ficam := v_ficam || jsonb_build_object('rotulo', 'texto fornecedor_perfil com este nome (fica)', 'quantidade', cardinality(v_arq), 'nomes', to_jsonb(v_arq[1:10]),
                                               'mais', greatest(cardinality(v_arq) - 10, 0));
    END IF;
  END IF;
  IF p_tipo = 'familia' THEN
    SELECT array_agg(x ORDER BY x) INTO v_arq FROM (
      SELECT coalesce((SELECT t.name FROM public.tenants t WHERE t.id = mc.tenant_id), '(sem nome)') || ' / ' || mp.nome || ' / ' || mc.categoria_chave AS x
        FROM public.orcamentista_mp_categoria mc JOIN public.orcamentista_materia_prima mp ON mp.id = mc.materia_prima_id WHERE mp.familia = p_chave) z;
    IF cardinality(coalesce(v_arq, '{}')) > 0 THEN
      v_ficam := v_ficam || jsonb_build_object('rotulo', 'categoria da materia-prima, com os dados (fica)', 'quantidade', cardinality(v_arq), 'nomes', to_jsonb(v_arq[1:10]),
                                               'mais', greatest(cardinality(v_arq) - 10, 0));
    END IF;
  END IF;

  -- decisão 4: a tabela com motor que sai faz a conversa de quem a usa PARAR (a conversa ainda lê o motor pela tabela, até o PR D). Os avisos e
  -- os impedimentos vão como DADO (tipo e o que nomeiam): a frase, com acento, é da tela (src/utils/atendimentos-ia-remocao.ts)
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', 'conversa_para', 'tabela_id', z.id, 'arquivo', z.arquivo_nome, 'empresas', to_jsonb(z.empresas))
                            ORDER BY z.arquivo_nome, z.id), '[]'::jsonb)
    INTO v_avisos
    FROM (SELECT t.id, t.arquivo_nome,
                 coalesce((SELECT array_agg(DISTINCT coalesce(tn.name, '(sem nome)') ORDER BY coalesce(tn.name, '(sem nome)'))
                             FROM public.tenants tn
                            WHERE tn.id IN (SELECT ct.tenant_id FROM public.orcamentista_conta_tabela ct WHERE ct.tabela_id = t.id
                                            UNION SELECT mc.tenant_id FROM public.orcamentista_mp_categoria_fornecedor v
                                                    JOIN public.orcamentista_mp_categoria mc ON mc.id = v.mp_categoria_id WHERE v.fornecedor_id = t.fornecedor_id)),
                          '{}') AS empresas
            FROM public.orcamentista_tabela t
           WHERE t.id = ANY (c.tabelas) AND EXISTS (SELECT 1 FROM public.orcamentista_motor_tipologia mt WHERE mt.tabela_id = t.id)) z;
  IF p_tipo = 'etapa' AND EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa e WHERE e.etapa_catalogo_id = p_chave::uuid) THEN
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('tipo', 'renumeracao'));
  END IF;
  -- o que IMPEDE a remocao (nao e uso: e conflito que o banco recusaria no meio): na familia, a tabela de outra categoria que perde a familia e e
  -- VIGENTE colidiria no indice `orcamentista_tabela_uma_vigente` (fornecedor, familia, categoria; nulos iguais) com outra vigente do mesmo fornecedor
  -- e categoria sem familia. Quem decide qual fica vigente e o dono do catalogo, antes de remover.
  IF p_tipo = 'familia' THEN
    SELECT coalesce(jsonb_agg(z.j ORDER BY z.j ->> 'fornecedor', z.j ->> 'categoria'), '[]'::jsonb) INTO v_imped
      FROM (SELECT jsonb_build_object('tipo', 'vigentes_sem_familia',
                     'fornecedor', (SELECT f.nome FROM public.orcamentista_fornecedor f WHERE f.id = t.fornecedor_id), 'categoria', t.categoria_chave,
                     'tabelas', jsonb_agg(jsonb_build_object('id', t.id, 'arquivo', t.arquivo_nome) ORDER BY t.arquivo_nome, t.id)) AS j
              FROM public.orcamentista_tabela t
             WHERE t.vigente AND NOT (t.id = ANY (c.tabelas)) AND (t.familia IS NULL OR t.familia = p_chave)
             GROUP BY t.fornecedor_id, t.categoria_chave
            HAVING count(*) > 1 AND bool_or(t.familia = p_chave)) z;
  END IF;

  -- a CATEGORIA (02/11/2026): a base de conhecimento das contas sai com ela, e o arrasto NOMEIA CADA EMPRESA com a contagem por empresa
  -- (decisao 2 do dono do produto) — a lista inteira, nao so dez nomes. E as quatro ESTRUTURAIS (decisao 3) impedem a remocao: o codigo
  -- (CATEGORIA_QUE_EXIGE_FAMILIA, CAMPO_DA_LINHA, familias_do_perfil, o levantamento) e o banco (as CHECKs de familia_no_perfil, mp_vidro,
  -- mp_ferragem, mp_instalacao e as tres funcoes superadmin_gravar_mp_*) dependem da chave
  IF p_tipo = 'categoria' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('empresa', e.nome, 'categorias', e.c, 'fornecedores', e.f, 'vidros', e.v, 'ferragens', e.fe, 'instalacao', e.i)
                              ORDER BY e.nome, e.tenant_id), '[]'::jsonb)
      INTO v_empresas
      FROM (SELECT mc.tenant_id, coalesce(tn.name, '(sem nome)') AS nome, count(*) AS c,
                   (SELECT count(*) FROM public.orcamentista_mp_categoria_fornecedor f
                     WHERE f.mp_categoria_id IN (SELECT c2.id FROM public.orcamentista_mp_categoria c2 WHERE c2.tenant_id = mc.tenant_id AND c2.categoria_chave = p_chave)) AS f,
                   (SELECT count(*) FROM public.orcamentista_mp_vidro v WHERE v.mp_categoria_id IN (SELECT c2.id FROM public.orcamentista_mp_categoria c2 WHERE c2.tenant_id = mc.tenant_id AND c2.categoria_chave = p_chave)) AS v,
                   (SELECT count(*) FROM public.orcamentista_mp_ferragem v WHERE v.mp_categoria_id IN (SELECT c2.id FROM public.orcamentista_mp_categoria c2 WHERE c2.tenant_id = mc.tenant_id AND c2.categoria_chave = p_chave)) AS fe,
                   (SELECT count(*) FROM public.orcamentista_mp_instalacao v WHERE v.mp_categoria_id IN (SELECT c2.id FROM public.orcamentista_mp_categoria c2 WHERE c2.tenant_id = mc.tenant_id AND c2.categoria_chave = p_chave)) AS i
              FROM public.orcamentista_mp_categoria mc LEFT JOIN public.tenants tn ON tn.id = mc.tenant_id
             WHERE mc.categoria_chave = p_chave
             GROUP BY mc.tenant_id, tn.name) e;
    IF p_chave = ANY (public.orcamentista_categorias_estruturais()) THEN
      v_imped := v_imped || jsonb_build_array(jsonb_build_object('tipo', 'categoria_estrutural', 'categoria', p_chave));
    END IF;
  END IF;

  RETURN jsonb_build_object('tipo', p_tipo, 'chave', p_chave, 'nome', c.nome, 'passos', v_passos, 'ficam', v_ficam, 'avisos', v_avisos, 'impedimentos', v_imped, 'empresas', v_empresas,
    'sai', (SELECT coalesce(sum((x ->> 'quantidade')::bigint), 0) FROM jsonb_array_elements(v_passos) x WHERE x ->> 'acao' = 'sai'),
    'perde_o_vinculo', (SELECT coalesce(sum((x ->> 'quantidade')::bigint), 0) FROM jsonb_array_elements(v_passos) x WHERE x ->> 'acao' = 'perde_o_vinculo'),
    'assinatura', md5((SELECT string_agg((x ->> 'passo') || ':' || (x ->> 'quantidade'), ',' ORDER BY (x ->> 'passo')::int) FROM jsonb_array_elements(v_passos) x)));
END
$fn$;

-- ── C4. A REMOÇÃO, com a trava da categoria e a recusa da estrutural ─────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_remover_do_catalogo(p_por uuid, p_tipo text, p_chave text, p_assinatura text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '80s'
AS $fn$
DECLARE
  c        record;
  v_medida jsonb;
  p        jsonb;
  v_passo  jsonb;
  i        integer := 0;
  v_n      bigint;
  v_mps    uuid[] := '{}';
  v_mp     uuid;
  v_antes  jsonb;
  v_origem jsonb;
  v_conta  jsonb := '{}'::jsonb;
  t        text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- uma remocao do catalogo por vez; e o que sai fica travado: quem for aponta-lo (FK, gravar etapa, arquivar) espera esta transacao
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_remover_do_catalogo', 0));
  SELECT * INTO c FROM public.orcamentista_arrasto_conjuntos(p_tipo, p_chave);
  IF c.nome IS NULL THEN
    RAISE EXCEPTION 'o item do catalogo nao existe (% %)', p_tipo, coalesce(p_chave, '(vazio)') USING ERRCODE = 'no_data_found';
  END IF;
  IF p_tipo = 'etapa' THEN PERFORM 1 FROM public.orcamentista_etapa_catalogo x WHERE x.id = p_chave::uuid FOR UPDATE;
  ELSIF p_tipo = 'fornecedor' THEN PERFORM 1 FROM public.orcamentista_fornecedor x WHERE x.id = p_chave::uuid FOR UPDATE;
  ELSIF p_tipo = 'familia' THEN PERFORM 1 FROM public.orcamentista_familia_catalogo x WHERE x.chave = p_chave FOR UPDATE;
  ELSIF p_tipo = 'categoria' THEN PERFORM 1 FROM public.orcamentista_categoria_catalogo x WHERE x.chave = p_chave FOR UPDATE;
  END IF;
  PERFORM 1 FROM public.orcamentista_motor x WHERE x.id = ANY (c.motores) ORDER BY x.id FOR UPDATE;
  PERFORM 1 FROM public.orcamentista_tabela x WHERE x.id = ANY (c.tabelas) ORDER BY x.id FOR UPDATE;
  -- os conjuntos de novo, depois das travas (quem ja estava apontando terminou)
  SELECT * INTO c FROM public.orcamentista_arrasto_conjuntos(p_tipo, p_chave);

  -- o que a tela mostrou TEM de ser o que sai: a assinatura das quantidades, medida agora, sob as travas
  v_medida := public.orcamentista_arrasto_medir(p_tipo, p_chave);
  IF p_assinatura IS DISTINCT FROM v_medida ->> 'assinatura' THEN
    RAISE EXCEPTION 'o arrasto mudou desde que foi mostrado (alguem mexeu no catalogo ou nas contas): veja de novo o que sai e confirme. Nada foi removido.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- decisao 3 (02/11/2026): as quatro categorias estruturais nao saem por aqui; destrava-las e mudanca de codigo e de CHECK, noutra migracao
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_medida -> 'impedimentos') x WHERE x ->> 'tipo' = 'categoria_estrutural') THEN
    RAISE EXCEPTION 'a categoria % e estrutural: o codigo e o banco dependem da chave dela (CHECKs e funcoes). Nada foi removido.', p_chave
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_array_length(v_medida -> 'impedimentos') > 0 THEN
    RAISE EXCEPTION 'a remocao esta impedida: % tabela(s) vigente(s) ficariam juntas sem familia (%). Nada foi removido.',
      (SELECT sum(jsonb_array_length(x -> 'tabelas')) FROM jsonb_array_elements(v_medida -> 'impedimentos') x),
      (SELECT string_agg(a ->> 'arquivo' || ' ' || left(a ->> 'id', 8), ', ') FROM jsonb_array_elements(v_medida -> 'impedimentos') x, jsonb_array_elements(x -> 'tabelas') a)
      USING ERRCODE = 'unique_violation';
  END IF;

  IF p_tipo = 'etapa' THEN
    SELECT coalesce(array_agg(DISTINCT e.materia_prima_id), '{}') INTO v_mps FROM public.orcamentista_familia_etapa e WHERE e.etapa_catalogo_id = p_chave::uuid;
  END IF;
  v_origem := jsonb_build_object('remocao_do_catalogo', jsonb_build_object('tipo', p_tipo, 'chave', p_chave, 'nome', c.nome));
  -- quantas linhas cada tabela alcançada tem ANTES: no fim, cada uma tem de ter perdido exatamente o que os passos dela apagaram. Algumas FKs
  -- de antes são CASCADE (o conteúdo para a tabela, as categorias para a matéria-prima, a ligação para o motor); os passos apagam os filhos
  -- antes, e esta conta prova que nenhuma cascata levou linha sem log
  FOR t IN SELECT DISTINCT x ->> 't' FROM jsonb_array_elements(public.orcamentista_arrasto_passos(p_tipo)) x
            UNION SELECT unnest(ARRAY['orcamentista_mp_categoria', 'orcamentista_mp_categoria_fornecedor', 'orcamentista_mp_ferragem', 'orcamentista_mp_vidro',
                                      'orcamentista_mp_instalacao', 'orcamentista_levantamento', 'orcamentista_levantamento_item']) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_n;
    v_conta := v_conta || jsonb_build_object(t, v_n);
  END LOOP;

  FOR p IN SELECT * FROM jsonb_array_elements(public.orcamentista_arrasto_passos(p_tipo)) LOOP
    i := i + 1;
    v_passo := v_medida -> 'passos' -> (i - 1);
    IF p ->> 'acao' = 'sai' THEN
      -- a linha inteira em `antes`, `depois` nulo, o tenant de quem era dela
      EXECUTE format(
        'WITH alvo AS (DELETE FROM public.%I x WHERE %s RETURNING x.*)
         INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
         SELECT (to_jsonb(a) ->> ''tenant_id'')::uuid, %L, coalesce(to_jsonb(a) ->> ''id'', to_jsonb(a) ->> ''chave'', md5(to_jsonb(a)::text)),
                jsonb_build_object(%L, to_jsonb(a)) || $4, NULL, $5
           FROM alvo a', p ->> 't', p ->> 'filtro', p ->> 't', p ->> 't')
        USING p_chave, c.motores, c.tabelas, v_origem, p_por;
    ELSE
      -- perde o vinculo: antes e depois, a linha inteira
      EXECUTE format(
        'WITH antes AS (SELECT x.ctid AS c, to_jsonb(x) AS j FROM public.%I x WHERE %s FOR UPDATE),
              mudou AS (UPDATE public.%I x SET %s FROM antes WHERE x.ctid = antes.c RETURNING antes.j AS aj, to_jsonb(x) AS dj)
         INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
         SELECT (m.aj ->> ''tenant_id'')::uuid, %L, coalesce(m.aj ->> ''id'', m.aj ->> ''chave'', md5(m.aj::text)),
                jsonb_build_object(%L, m.aj) || $4, jsonb_build_object(%L, m.dj), $5
           FROM mudou m', p ->> 't', p ->> 'filtro', p ->> 't', p ->> 'anula', p ->> 't', p ->> 't', p ->> 't')
        USING p_chave, c.motores, c.tabelas, v_origem, p_por;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n IS DISTINCT FROM (v_passo ->> 'quantidade')::bigint THEN
      RAISE EXCEPTION 'o passo % (%, %) mexeu em % linha(s), e a medicao disse %. Nada foi removido.', i, p ->> 't', p ->> 'acao', v_n, v_passo ->> 'quantidade';
    END IF;
  END LOOP;

  -- nenhuma linha saiu sem estar no arrasto: cada tabela perdeu exatamente a soma dos passos 'sai' dela
  FOR t IN SELECT * FROM jsonb_object_keys(v_conta) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_n;
    IF v_n IS DISTINCT FROM (v_conta ->> t)::bigint - (SELECT coalesce(sum((x ->> 'quantidade')::bigint), 0) FROM jsonb_array_elements(v_medida -> 'passos') x
                                                         WHERE x ->> 'tabela' = t AND x ->> 'acao' = 'sai') THEN
      RAISE EXCEPTION 'a tabela % perdeu linha(s) fora do arrasto (uma chave estrangeira em cascata): eram %, ficaram %. Nada foi removido.', t, v_conta ->> t, v_n;
    END IF;
  END LOOP;

  -- a etapa do catalogo: as etapas que ficam nas familias de conta renumeram 1..N, sem buraco (como a 20261031000001), com antes e depois no log
  FOREACH v_mp IN ARRAY v_mps LOOP
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.numero), '[]'::jsonb) INTO v_antes FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = v_mp;
    UPDATE public.orcamentista_familia_etapa SET numero = numero + 1000000 WHERE materia_prima_id = v_mp;
    UPDATE public.orcamentista_familia_etapa x SET numero = r.n
      FROM (SELECT e.id, row_number() OVER (ORDER BY e.numero) AS n FROM public.orcamentista_familia_etapa e WHERE e.materia_prima_id = v_mp) r
     WHERE x.id = r.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    SELECT mp.tenant_id, 'orcamentista_familia_etapa', v_mp::text, jsonb_build_object('orcamentista_familia_etapa', v_antes) || v_origem,
           jsonb_build_object('orcamentista_familia_etapa', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.numero), '[]'::jsonb) FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = v_mp)),
           p_por
      FROM public.orcamentista_materia_prima mp WHERE mp.id = v_mp;
  END LOOP;

  RETURN v_medida || jsonb_build_object('removido', true);
END
$fn$;

REVOKE ALL ON FUNCTION public.orcamentista_arrasto_passos(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orcamentista_arrasto_conjuntos(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orcamentista_arrasto_medir(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.superadmin_remover_do_catalogo(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_remover_do_catalogo(uuid, text, text, text) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f      regprocedure;
  nome   text;
  v_tx   text;
BEGIN
  -- os cinco tipos de antes: a MESMA lista de passos (a assinatura que a tela mostra não muda para eles)
  SELECT string_agg(a.tipo, ', ') INTO v_tx FROM _categorias_passos a WHERE a.passos IS DISTINCT FROM public.orcamentista_arrasto_passos(a.tipo);
  IF v_tx IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: os passos de % mudaram. Nada foi alterado.', v_tx;
  END IF;
  -- o tipo novo: exatamente as tabelas esperadas, na ordem (os filhos antes dos pais), e o documento de cliente so perde o vinculo
  SELECT string_agg((x ->> 't') || ':' || (x ->> 'acao'), ',' ORDER BY o) INTO v_tx FROM jsonb_array_elements(public.orcamentista_arrasto_passos('categoria')) WITH ORDINALITY z(x, o);
  IF v_tx IS DISTINCT FROM 'orcamentista_levantamento_item:perde_o_vinculo,orcamentista_levantamento_item:perde_o_vinculo,orcamentista_familia_etapa:perde_o_vinculo,orcamentista_motor_baguete:sai,orcamentista_motor_formula:sai,orcamentista_motor_formula_familia:sai,'
       || 'orcamentista_motor_insumo:sai,orcamentista_motor_otimizacao:sai,orcamentista_motor_perfil:sai,orcamentista_motor_regra:sai,orcamentista_motor_tipologia:sai,orcamentista_motor_tipologia_detalhe:sai,'
       || 'orcamentista_motor_tipologia_tempo:sai,orcamentista_motor_validacao:sai,orcamentista_motor_variavel:sai,orcamentista_motor_vidro:sai,orcamentista_motor_baguete:sai,orcamentista_motor_formula:sai,'
       || 'orcamentista_motor_formula_familia:sai,orcamentista_motor_insumo:sai,orcamentista_motor_otimizacao:sai,orcamentista_motor_perfil:sai,orcamentista_motor_regra:sai,orcamentista_motor_tipologia:sai,'
       || 'orcamentista_motor_tipologia_detalhe:sai,orcamentista_motor_tipologia_tempo:sai,orcamentista_motor_validacao:sai,orcamentista_motor_variavel:sai,orcamentista_motor_vidro:sai,orcamentista_importacao:sai,'
       || 'orcamentista_tabela_item:sai,orcamentista_conta_tabela:sai,orcamentista_motor_familia:sai,orcamentista_motor:sai,orcamentista_tabela:sai,orcamentista_mp_categoria_fornecedor:sai,'
       || 'orcamentista_mp_vidro:sai,orcamentista_mp_ferragem:sai,orcamentista_mp_instalacao:sai,orcamentista_mp_categoria:sai,orcamentista_categoria_campo:sai,orcamentista_familia_ramificacao:sai,'
       || 'orcamentista_categoria_catalogo:sai' THEN
    RAISE EXCEPTION 'verificacao: os passos da categoria nao sao os esperados: %. Nada foi alterado.', v_tx;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia', 'tabela', 'categoria']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x
              WHERE x ->> 't' IN ('orcamentista_levantamento_item', 'orcamentista_levantamento', 'orcamentista_conversa', 'orcamentista_mensagem', 'orcamentista_pre_definicao')
                AND x ->> 'acao' <> 'perde_o_vinculo') THEN
    RAISE EXCEPTION 'verificacao: um documento de cliente sairia por remocao de catalogo. Nada foi alterado.';
  END IF;
  -- as CHECKs do catalogo
  IF (SELECT count(*) FROM pg_constraint c WHERE c.conrelid = 'public.orcamentista_categoria_catalogo'::regclass AND c.contype = 'c'
       AND c.conname IN ('orcamentista_categoria_catalogo_chave_forma', 'orcamentista_categoria_catalogo_rotulo_forma')) <> 2 THEN
    RAISE EXCEPTION 'verificacao: as CHECKs de forma do catalogo de categorias nao estao la. Nada foi alterado.';
  END IF;
  -- as estruturais existem no catalogo (a recusa nomeia o que esta la)
  IF EXISTS (SELECT 1 FROM unnest(public.orcamentista_categorias_estruturais()) e WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = e)) THEN
    RAISE EXCEPTION 'verificacao: uma categoria estrutural nao esta no catalogo. Nada foi alterado.';
  END IF;
  FOREACH nome IN ARRAY ARRAY['public.superadmin_criar_categoria(uuid, text, text)', 'public.superadmin_editar_categoria(uuid, text, text)',
                              'public.superadmin_remover_do_catalogo(uuid, text, text, text)'] LOOP
    f := to_regprocedure(nome);
    IF f IS NULL
       OR has_function_privilege('public', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'verificacao: % nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.', nome;
    END IF;
  END LOOP;
  FOREACH nome IN ARRAY ARRAY['public.orcamentista_arrasto_passos(text)', 'public.orcamentista_arrasto_conjuntos(text, text)', 'public.orcamentista_arrasto_medir(text, text)',
                              'public.orcamentista_categorias_estruturais()'] LOOP
    f := to_regprocedure(nome);
    IF f IS NULL OR has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('public', f, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'verificacao: % nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.', nome;
    END IF;
  END LOOP;
  IF EXISTS ((SELECT * FROM _categorias_fks)
             EXCEPT (SELECT c.conname::text, c.conrelid::regclass::text, c.confdeltype::text, c.confupdtype::text FROM pg_constraint c WHERE c.contype = 'f'))
     OR EXISTS ((SELECT c.conname::text, c.conrelid::regclass::text, c.confdeltype::text, c.confupdtype::text FROM pg_constraint c WHERE c.contype = 'f')
                EXCEPT (SELECT * FROM _categorias_fks)) THEN
    RAISE EXCEPTION 'verificacao: uma chave estrangeira mudou nesta migracao. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'categorias do catalogo: criar e editar o rotulo; o tipo categoria medido e removido pelo arrasto, com as empresas nomeadas e as estruturais recusadas; os cinco tipos de antes iguais; nenhuma FK mudou.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select proname, md5(replace(prosrc, chr(13), '')) from pg_proc where proname in ('orcamentista_arrasto_passos', 'orcamentista_arrasto_conjuntos',
--   'orcamentista_arrasto_medir', 'superadmin_remover_do_catalogo', 'superadmin_criar_categoria', 'superadmin_editar_categoria', 'orcamentista_categorias_estruturais');
-- select conname from pg_constraint where conrelid = 'public.orcamentista_categoria_catalogo'::regclass and contype = 'c';   -- as duas CHECKs
-- select public.superadmin_arrasto_do_catalogo('categoria', 'PERSIANAS') -> 'empresas';   -- a medicao, sem apagar nada (rodar como service_role ou postgres)
-- select public.superadmin_arrasto_do_catalogo('categoria', 'PERFIL') -> 'impedimentos';  -- [{"tipo": "categoria_estrutural", ...}]
