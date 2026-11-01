-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261031000003 — O CATÁLOGO É SOBERANO: REMOVER FAMÍLIA, FORNECEDOR, MOTOR OU ETAPA DEIXA DE SER RECUSA
-- E PASSA A SER ARRASTO DECLARADO, CONFIRMADO E LOGADO LINHA A LINHA.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261031000003_catalogo_soberano.
-- ║ PRESSUPÕE a 20261031000002 (o catálogo de etapas) APLICADA — conferida em produção em 31/10/2026, 21:27 UTC, pelo md5 dos cinco corpos.
-- ║ SEM ELA O CÓDIGO QUEBRA: as quatro telas de remover chamam `superadmin_arrasto_do_catalogo` (a medição) e
-- ║ `superadmin_remover_do_catalogo` (a remoção confirmada); a remoção de família e de etapa do catálogo de antes recusava o uso.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 31/10/2026: "a remoção é soberana. O departamento de motores, de famílias, de categoria, de fornecedores que tem ali,
-- ele é soberano quanto ao resto. Família, fornecedor, motor e etapa. Isso é soberano dentro do catálogo."
--   A. "Em nenhuma das quatro a remoção é mais recusada por estar em uso": a rota mede o ARRASTO antes (contagem e até 10 nomes por tipo), a tela
--      exige confirmação explícita, e só então uma FUNÇÃO apaga EXPLICITAMENTE, em ordem, logando CADA linha (a linha inteira em `antes`, `depois`
--      nulo, o tenant de quem era dela). AS FKs CONTINUAM COMO ESTÃO: nenhuma vira CASCADE; quem apaga é a função, os filhos antes dos pais.
--   C. DOCUMENTO DE CLIENTE NÃO É ARRASTADO: o item de levantamento FICA e perde o vínculo (família, tabela, motor), com antes e depois no log.
--   Decisões do dono do produto sobre o alcance (31/10/2026):
--     1. família: a matéria-prima da conta FICA, sem tipo; as etapas dela saem; as categorias e os dados dela ficam;
--     2. família: a tabela de PERFIL da família SAI JUNTO (com os itens e o conteúdo); a de outra categoria só perde a família;
--     3. família: o motor cuja ÚNICA família é a removida SAI JUNTO, com o conteúdo; o de várias famílias só perde a ligação;
--     4. fornecedor: permitido hoje, antes do PR D, COM AVISO de que a conversa da empresa que usa a tabela com o motor PARA até ser reconfigurada
--        (a conversa ainda lê o motor pela tabela, não pelo catálogo). O aviso sai quando o PR D entrar;
--     5. os arquivos do Storage e o texto `fornecedor_perfil` FICAM: o arrasto só os lista.
--   D. Motor: ARQUIVAR (20261029000005) e REMOVER coexistem.
--
-- O QUE FAZ:
--   1. `orcamentista_arrasto_passos(tipo)`: a lista ÚNICA e ordenada dos passos de cada tipo (tabela, sai ou perde o vínculo, o filtro, o que
--      se anula, o nome mostrado). A medição e a remoção leem a MESMA lista: o que a tela mostra é o que a função apaga.
--   2. `superadmin_arrasto_do_catalogo(tipo, chave)`: mede, sem apagar nada — por passo, a quantidade e até 10 nomes ("e mais N"); o que FICA
--      (Storage, texto, categorias da conta); os avisos; e a ASSINATURA (md5 das quantidades).
--   3. `superadmin_remover_do_catalogo(por, tipo, chave, assinatura)`: trava o que vai sair, mede de novo, RECUSA se a assinatura não é a mostrada
--      (o arrasto mudou), executa os passos em ordem logando cada linha, confere que cada passo mexeu exatamente no que mediu (aborta se não), e
--      na etapa do catálogo renumera as etapas que ficam, 1..N. E confere, tabela por tabela, que nenhuma linha saiu fora do arrasto: algumas FKs
--      de antes são CASCADE (o conteúdo do motor para a tabela, as categorias da conta para a matéria-prima, a ligação para o motor) e continuam
--      assim; os passos apagam os filhos antes, e a conta prova que nenhuma cascata levou linha sem log.
--   4. Saem `superadmin_remover_familia` e `superadmin_remover_etapa_do_catalogo` (eram as recusas por uso).
-- O QUE NÃO FAZ: não troca FK nenhuma; não apaga arquivo do Storage; não mexe em documento de cliente além de soltar o vínculo; nenhum dado é
-- mexido ao aplicar.
-- GUARDA (aborta): a 20261031000002 aplicada; e o FECHO REAL: toda FK que aponta uma tabela de onde a remoção apaga tem de ser de uma tabela que a
-- lista de passos conhece — uma tabela nova que passe a apontar o catálogo faz a migração abortar em vez de ser apagada (ou travar) em silêncio.
-- IMPEDIMENTO (não é uso, é conflito): na família, a tabela de outra categoria que perde a família e é vigente não pode colidir com outra vigente
-- do mesmo fornecedor e categoria sem família (`orcamentista_tabela_uma_vigente`); a medição nomeia, e a remoção recusa antes de apagar.
-- VERIFICAÇÃO (aborta): as funções fechadas, com search_path fixo; as antigas fora; nenhuma FK mudou de ação.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA ──────────────────────────────────────────────────────────────────────────────
DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_etapa_catalogo') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'etapa_catalogo_id')
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'acao') THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261031000002 (o catalogo de etapas) nao esta aplicada. Nada foi alterado.';
  END IF;
END
$guarda$;

-- a foto das chaves estrangeiras (nome, tabela, ação no DELETE e no UPDATE), para a verificação provar que nenhuma mudou
CREATE TEMP TABLE _catalogo_soberano_fks ON COMMIT DROP AS
SELECT c.conname::text AS conname, c.conrelid::regclass::text AS tabela, c.confdeltype::text AS del, c.confupdtype::text AS upd
  FROM pg_constraint c WHERE c.contype = 'f';

-- ── 1. OS PASSOS: uma lista só, para medir e para apagar ─────────────────────────────────────
-- Cada passo: t (a tabela), acao ('sai' ou 'perde_o_vinculo'), filtro (SQL sobre a linha `x`; $1 = a chave, texto; $2 = os motores que saem, uuid[];
-- $3 = as tabelas que saem, uuid[]), anula (o SET do 'perde_o_vinculo'), nome (o que a tela mostra de cada linha), rotulo (o tipo, para a tela).
-- A ORDEM é a de execução: filhos antes dos pais; o que perde o vínculo antes de o pai sair.
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

  IF p_tipo NOT IN ('motor', 'fornecedor', 'familia') THEN
    RAISE EXCEPTION 'tipo de remocao desconhecido: %', p_tipo USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- os DOCUMENTOS DE CLIENTE perdem o vinculo, nunca saem (trava C)
  IF p_tipo = 'familia' THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'x.familia = $1',
      'anula', 'familia = NULL, motor_id = NULL, motor_familia_exigida = NULL', 'nome', v_item, 'rotulo', 'item de levantamento (documento de cliente)');
  ELSE
    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'x.motor_id = ANY ($2)',
      'anula', 'motor_id = NULL, motor_familia_exigida = NULL', 'nome', v_item, 'rotulo', 'item de levantamento (documento de cliente)');
  END IF;
  IF p_tipo IN ('fornecedor', 'familia') THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'x.tabela_id = ANY ($3)',
      'anula', 'tabela_id = NULL', 'nome', v_item, 'rotulo', 'item de levantamento (documento de cliente)');
  END IF;

  -- as ETAPAS DA CONTA: na familia, saem as da familia; no motor e no fornecedor, as que apontam o motor que sai perdem o motor
  IF p_tipo = 'familia' THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'sai', 'filtro', 'x.familia = $1', 'nome', v_etapa, 'rotulo', 'etapa de conta');
  ELSE
    v_p := v_p || jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'perde_o_vinculo', 'filtro', 'x.motor_id = ANY ($2)',
      'anula', 'motor_id = NULL, motor_familia_exigida = NULL', 'nome', v_etapa, 'rotulo', 'etapa de conta (fica sem motor)');
  END IF;

  -- o CONTEUDO dos motores que saem, e o das tabelas que saem (cada linha e de um dono so: CHECK _um_dono)
  FOREACH t IN ARRAY v_conteudo LOOP
    v_p := v_p || jsonb_build_object('t', t, 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2)', 'nome', v_generico, 'rotulo', 'conteudo do motor');
  END LOOP;
  IF p_tipo IN ('fornecedor', 'familia') THEN
    FOREACH t IN ARRAY v_conteudo LOOP
      v_p := v_p || jsonb_build_object('t', t, 'acao', 'sai', 'filtro', 'x.tabela_id = ANY ($3)', 'nome', v_generico, 'rotulo', 'conteudo de motor da tabela');
    END LOOP;
    v_p := v_p || jsonb_build_object('t', 'orcamentista_importacao', 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2) OR x.tabela_id = ANY ($3)', 'nome', v_generico, 'rotulo', 'importacao')
               || jsonb_build_object('t', 'orcamentista_tabela_item', 'acao', 'sai', 'filtro', 'x.tabela_id = ANY ($3)', 'nome', v_generico, 'rotulo', 'item de preco')
               || jsonb_build_object('t', 'orcamentista_conta_tabela', 'acao', 'sai', 'filtro', 'x.tabela_id = ANY ($3)', 'nome', v_empresa, 'rotulo', 'tabela escolhida por conta');
  ELSE
    v_p := v_p || jsonb_build_object('t', 'orcamentista_importacao', 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2)', 'nome', v_generico, 'rotulo', 'importacao');
  END IF;

  -- as LIGACOES motor-familia: na familia, todas as da familia (as dos motores que saem vao junto); nos outros, as dos motores que saem
  IF p_tipo = 'familia' THEN
    v_p := v_p || jsonb_build_object('t', 'orcamentista_motor_familia', 'acao', 'sai', 'filtro', 'x.familia = $1 OR x.motor_id = ANY ($2)',
      'nome', '(SELECT m.nome FROM public.orcamentista_motor m WHERE m.id = x.motor_id) || '' / '' || x.familia', 'rotulo', 'ligacao motor-familia');
  ELSE
    v_p := v_p || jsonb_build_object('t', 'orcamentista_motor_familia', 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2)',
      'nome', '(SELECT m.nome FROM public.orcamentista_motor m WHERE m.id = x.motor_id) || '' / '' || x.familia', 'rotulo', 'ligacao motor-familia');
  END IF;
  v_p := v_p || jsonb_build_object('t', 'orcamentista_motor', 'acao', 'sai', 'filtro', 'x.id = ANY ($2)', 'nome', 'x.nome', 'rotulo', 'motor');

  IF p_tipo IN ('fornecedor', 'familia') THEN
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
  -- O FECHO REAL: toda FK que aponta uma tabela de onde a remocao APAGA tem de vir de uma tabela que os passos conhecem. Uma tabela nova que aponte o
  -- catalogo faz esta migracao abortar, em vez de travar a remocao com 23503 (RESTRICT) ou de ser levada em silencio (CASCADE).
  SELECT array_agg(DISTINCT x ->> 't') INTO v_sai FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x
   WHERE x ->> 'acao' = 'sai';
  SELECT array_agg(DISTINCT x ->> 't') INTO v_todas FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x;
  SELECT string_agg(DISTINCT format('%s -> %s (%s)', c.conrelid::regclass, c.confrelid::regclass, c.conname), '; ') INTO v_tx
    FROM pg_constraint c
   WHERE c.contype = 'f' AND c.confrelid::regclass::text = ANY (v_sai) AND NOT (c.conrelid::regclass::text = ANY (v_todas))
     AND c.confrelid::regclass::text <> 'users';
  IF v_tx IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: o fecho da remocao nao conhece estas chaves estrangeiras: %. Nada foi alterado.', v_tx;
  END IF;
END
$fecho$;

-- os conjuntos que saem, calculados UMA vez (os filtros os recebem por parâmetro, para que um passo não mude o que o seguinte enxerga)
CREATE OR REPLACE FUNCTION public.orcamentista_arrasto_conjuntos(p_tipo text, p_chave text, OUT nome text, OUT motores uuid[], OUT tabelas uuid[])
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  motores := '{}'; tabelas := '{}';
  IF p_chave IS NULL OR (p_tipo <> 'familia' AND p_chave !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
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
  ELSE
    RAISE EXCEPTION 'tipo de remocao desconhecido: %', p_tipo USING ERRCODE = 'invalid_parameter_value';
  END IF;
END
$fn$;

-- ── 2. A MEDIÇÃO (sem apagar nada) ─────────────────────────────────────────────────────────
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

  RETURN jsonb_build_object('tipo', p_tipo, 'chave', p_chave, 'nome', c.nome, 'passos', v_passos, 'ficam', v_ficam, 'avisos', v_avisos, 'impedimentos', v_imped,
    'sai', (SELECT coalesce(sum((x ->> 'quantidade')::bigint), 0) FROM jsonb_array_elements(v_passos) x WHERE x ->> 'acao' = 'sai'),
    'perde_o_vinculo', (SELECT coalesce(sum((x ->> 'quantidade')::bigint), 0) FROM jsonb_array_elements(v_passos) x WHERE x ->> 'acao' = 'perde_o_vinculo'),
    'assinatura', md5((SELECT string_agg((x ->> 'passo') || ':' || (x ->> 'quantidade'), ',' ORDER BY (x ->> 'passo')::int) FROM jsonb_array_elements(v_passos) x)));
END
$fn$;

CREATE OR REPLACE FUNCTION public.superadmin_arrasto_do_catalogo(p_tipo text, p_chave text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN public.orcamentista_arrasto_medir(p_tipo, p_chave);
END
$fn$;

-- ── 3. A REMOÇÃO CONFIRMADA ────────────────────────────────────────────────────────────────
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

-- ── 4. SAEM AS RECUSAS DE ANTES ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.superadmin_remover_familia(uuid, text);
DROP FUNCTION IF EXISTS public.superadmin_remover_etapa_do_catalogo(uuid, uuid);

REVOKE ALL ON FUNCTION public.orcamentista_arrasto_passos(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orcamentista_arrasto_conjuntos(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orcamentista_arrasto_medir(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.superadmin_arrasto_do_catalogo(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_arrasto_do_catalogo(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.superadmin_remover_do_catalogo(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_remover_do_catalogo(uuid, text, text, text) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f       regprocedure;
  nome    text;
BEGIN
  FOREACH nome IN ARRAY ARRAY['public.superadmin_arrasto_do_catalogo(text, text)', 'public.superadmin_remover_do_catalogo(uuid, text, text, text)'] LOOP
    f := to_regprocedure(nome);
    IF f IS NULL
       OR has_function_privilege('public', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'verificacao: % nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.', nome;
    END IF;
  END LOOP;
  FOREACH nome IN ARRAY ARRAY['public.orcamentista_arrasto_passos(text)', 'public.orcamentista_arrasto_conjuntos(text, text)', 'public.orcamentista_arrasto_medir(text, text)'] LOOP
    f := to_regprocedure(nome);
    IF f IS NULL OR has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('public', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'verificacao: % nao existe, ou nasceu aberta. Nada foi alterado.', nome;
    END IF;
  END LOOP;
  IF to_regprocedure('public.superadmin_remover_familia(uuid, text)') IS NOT NULL OR to_regprocedure('public.superadmin_remover_etapa_do_catalogo(uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: as remocoes que recusavam o uso ainda existem. Nada foi alterado.';
  END IF;
  -- nenhuma FK mudou (nem de acao): a foto do comeco contra o catalogo agora, nos dois sentidos
  IF EXISTS ((SELECT * FROM _catalogo_soberano_fks)
             EXCEPT (SELECT c.conname::text, c.conrelid::regclass::text, c.confdeltype::text, c.confupdtype::text FROM pg_constraint c WHERE c.contype = 'f'))
     OR EXISTS ((SELECT c.conname::text, c.conrelid::regclass::text, c.confdeltype::text, c.confupdtype::text FROM pg_constraint c WHERE c.contype = 'f')
                EXCEPT (SELECT * FROM _catalogo_soberano_fks)) THEN
    RAISE EXCEPTION 'verificacao: uma chave estrangeira mudou nesta migracao. Nada foi alterado.';
  END IF;
  -- o documento de cliente nunca SAI: so perde o vinculo
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x
              WHERE x ->> 't' IN ('orcamentista_levantamento_item', 'orcamentista_levantamento', 'orcamentista_conversa', 'orcamentista_mensagem', 'orcamentista_pre_definicao')
                AND x ->> 'acao' <> 'perde_o_vinculo') THEN
    RAISE EXCEPTION 'verificacao: um documento de cliente sairia por remocao de catalogo. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'catalogo soberano: medir e remover com arrasto declarado; nenhuma FK mudou.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select proname, md5(replace(prosrc, chr(13), '')) from pg_proc where proname in ('superadmin_arrasto_do_catalogo', 'superadmin_remover_do_catalogo',
--   'orcamentista_arrasto_passos', 'orcamentista_arrasto_conjuntos', 'orcamentista_arrasto_medir');                -- os do corpo deste arquivo
-- select to_regprocedure('public.superadmin_remover_familia(uuid, text)'), to_regprocedure('public.superadmin_remover_etapa_do_catalogo(uuid, uuid)');  -- nulos
-- select public.superadmin_arrasto_do_catalogo('familia', 'PVC') -> 'sai';     -- a medicao, sem apagar nada (rodar como service_role ou postgres)
