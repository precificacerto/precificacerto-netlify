-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261101000001 — A TABELA DE FORNECEDOR ENTRA NA SOBERANIA DO CATÁLOGO: A QUINTA RAIZ DE REMOÇÃO.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261101000001_tabela_na_soberania.
-- ║ PRESSUPÕE a 20261031000003 (o catálogo soberano) APLICADA — conferida em produção em 01/11/2026 pelo md5 dos cinco corpos, que a
-- ║ guarda abaixo confere de novo.
-- ║ SEM ELA O CÓDIGO QUEBRA: a tela do fornecedor passa a remover a tabela pela rota do arrasto (tipo 'tabela'), e o DELETE de antes sai.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 01/11/2026: "definido em regra que essa mensagem não pode acontecer. Se for excluído, deve ser excluído, permitir a
-- exclusão. Depois, ele só não vai calcular. Então, ele deve permitir que eu faça exclusão de tabelas dentro de fornecedores." A recusa "Em uso
-- por: ..." do DELETE /tabelas/[id] sai, e a tabela vira a quinta raiz, no mesmo desenho da 20261031000003: arrasto medido e mostrado antes,
-- confirmação explícita, remoção pela função que apaga em ordem e loga cada linha, FKs como estão, documento de cliente só perde o vínculo.
--   - O ARRASTO DA TABELA (medido em produção em 01/11/2026; 17 FKs apontam a tabela, todas de tabelas que os passos já conhecem): os itens de
--     preço, o conteúdo de motor por tabela_id (13 tabelas), as importações, as linhas de orcamentista_conta_tabela (RESTRICT) e o item de
--     levantamento que a aponta, que PERDE O VÍNCULO (tabela_id -> nulo). O motor do catálogo, que tem cópia própria pelo motor_id, FICA.
--   - O AVISO DA CONVERSA (decisão do dono do produto): a tabela com motor faz a conversa da empresa que a usa PARAR até ser reconfigurada (a
--     conversa ainda lê o motor pela tabela; o PR D não foi feito). É o aviso `conversa_para` que a medição já calcula para toda tabela com
--     tipologia. Hoje vale para a 72366020 da Wolff (Esquadrias De Paula Ltda). O aviso sai quando o PR D entrar.
--   - OS ARQUIVOS DO BUCKET FICAM, só listados no arrasto (decisão 5): apagar objeto do Storage é irreversível e fora da transação. Vale também
--     para o motor_path que a 72366020 divide com o motor 9a233c55 — esse não sai em hipótese nenhuma.
--
-- O QUE FAZ: redefine SÓ `orcamentista_arrasto_passos` (ganha o tipo 'tabela', reaproveitando os passos de tabela do fornecedor, sem os de motor,
-- ligação, etapa e fornecedor) e `orcamentista_arrasto_conjuntos` (a tabela sozinha). A medição, a remoção e a rota já aceitam o tipo pelo que estas
-- duas devolvem: a remoção já trava as tabelas que saem (FOR UPDATE) e já confere a conta por tabela.
-- O QUE NÃO FAZ: não troca FK nenhuma; não apaga arquivo do Storage; não muda nada para os quatro tipos de antes (a verificação compara a lista de
-- passos de cada um com a de antes, e aborta se mudou); nenhum dado é mexido ao aplicar.
-- GUARDA (aborta): os cinco corpos da 20261031000003 são os aplicados (md5); o fecho real com o tipo novo.
-- VERIFICAÇÃO (aborta): os passos dos quatro tipos de antes iguais aos de antes; o tipo 'tabela' com os passos esperados, sem documento de cliente
-- saindo; as funções fechadas; nenhuma FK mudou.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA: o que esta migração substitui é o que foi lido ─────────────────────────────────
DO $guarda$
DECLARE
  v_esperado jsonb := jsonb_build_object(
    'orcamentista_arrasto_passos', 'c0511470a779be934e96d0b8cb50febb', 'orcamentista_arrasto_conjuntos', 'f29582e24d8b315f1a832cdba0adcaf7',
    'orcamentista_arrasto_medir', 'c68e4124320ac56e658362a20d38af57', 'superadmin_arrasto_do_catalogo', '353e8ee77a0e4f903c79b9846a54ce44',
    'superadmin_remover_do_catalogo', '24ade9ea78cb348ecd44658390d92bfd');
  -- reaplicar esta migração encontra os corpos DELA nas duas que ela troca: também valem (a reaplicação é inofensiva)
  v_desta    jsonb := jsonb_build_object('orcamentista_arrasto_passos', 'c5beabd1f3179b55d279f5c6d411502e', 'orcamentista_arrasto_conjuntos', '790b7d036726b5944c801a58d7ddc5e9');
  v_achado   jsonb;
BEGIN
  SELECT coalesce(jsonb_object_agg(p.proname, md5(replace(p.prosrc, chr(13), ''))), '{}'::jsonb) INTO v_achado
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN (SELECT jsonb_object_keys(v_esperado));
  IF v_achado IS DISTINCT FROM v_esperado AND v_achado IS DISTINCT FROM v_esperado || v_desta THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261031000003 (o catalogo soberano) nao esta aplicada como foi lida (corpos: %). Nada foi alterado.', v_achado;
  END IF;
END
$guarda$;

-- a foto: as chaves estrangeiras e os passos dos quatro tipos de antes, para a verificação provar que nada disso mudou
CREATE TEMP TABLE _tabela_soberana_fks ON COMMIT DROP AS
SELECT c.conname::text AS conname, c.conrelid::regclass::text AS tabela, c.confdeltype::text AS del, c.confupdtype::text AS upd
  FROM pg_constraint c WHERE c.contype = 'f';
CREATE TEMP TABLE _tabela_soberana_passos ON COMMIT DROP AS
SELECT tp AS tipo, public.orcamentista_arrasto_passos(tp) AS passos FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia']) tp;

-- ── 1. OS PASSOS, com o tipo 'tabela' ─────────────────────────────────────────────────────────
-- O corpo é o da 20261031000003 com quatro mudanças, só para o tipo novo: o tipo é aceito; o item de levantamento só perde a TABELA (não o motor);
-- as etapas, o conteúdo pelo motor, as ligações e o motor não entram; o conteúdo pela tabela, a importação, os itens, conta_tabela e a tabela entram.
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

  IF p_tipo NOT IN ('motor', 'fornecedor', 'familia', 'tabela') THEN
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
  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN
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
  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN
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
  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN
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
  SELECT array_agg(DISTINCT x ->> 't') INTO v_sai FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia', 'tabela']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x
   WHERE x ->> 'acao' = 'sai';
  SELECT array_agg(DISTINCT x ->> 't') INTO v_todas FROM unnest(ARRAY['etapa', 'motor', 'fornecedor', 'familia', 'tabela']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x;
  SELECT string_agg(DISTINCT format('%s -> %s (%s)', c.conrelid::regclass, c.confrelid::regclass, c.conname), '; ') INTO v_tx
    FROM pg_constraint c
   WHERE c.contype = 'f' AND c.confrelid::regclass::text = ANY (v_sai) AND NOT (c.conrelid::regclass::text = ANY (v_todas))
     AND c.confrelid::regclass::text <> 'users';
  IF v_tx IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: o fecho da remocao nao conhece estas chaves estrangeiras: %. Nada foi alterado.', v_tx;
  END IF;
END
$fecho$;

-- ── 2. OS CONJUNTOS, com a tabela sozinha ────────────────────────────────────────────────────
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
  ELSIF p_tipo = 'tabela' THEN
    -- a quinta raiz (01/11/2026): a tabela sozinha; o motor do catalogo, que tem copia propria, fica
    SELECT f.nome || ' / ' || t.arquivo_nome || ' (' || left(t.id::text, 8) || ')' INTO nome
      FROM public.orcamentista_tabela t JOIN public.orcamentista_fornecedor f ON f.id = t.fornecedor_id WHERE t.id = p_chave::uuid;
    IF nome IS NOT NULL THEN tabelas := ARRAY[p_chave::uuid]; END IF;
  ELSE
    RAISE EXCEPTION 'tipo de remocao desconhecido: %', p_tipo USING ERRCODE = 'invalid_parameter_value';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.orcamentista_arrasto_passos(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orcamentista_arrasto_conjuntos(text, text) FROM PUBLIC, anon, authenticated;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f      regprocedure;
  nome   text;
  v_tx   text;
BEGIN
  -- os quatro tipos de antes: a MESMA lista de passos (a assinatura que a tela mostra não muda para eles)
  SELECT string_agg(a.tipo, ', ') INTO v_tx FROM _tabela_soberana_passos a WHERE a.passos IS DISTINCT FROM public.orcamentista_arrasto_passos(a.tipo);
  IF v_tx IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: os passos de % mudaram. Nada foi alterado.', v_tx;
  END IF;
  -- o tipo novo: exatamente as tabelas esperadas, na ordem (os filhos antes da tabela), e o documento de cliente so perde o vinculo
  SELECT string_agg((x ->> 't') || ':' || (x ->> 'acao'), ',' ORDER BY o) INTO v_tx FROM jsonb_array_elements(public.orcamentista_arrasto_passos('tabela')) WITH ORDINALITY z(x, o);
  IF v_tx IS DISTINCT FROM 'orcamentista_levantamento_item:perde_o_vinculo,orcamentista_motor_baguete:sai,orcamentista_motor_formula:sai,orcamentista_motor_formula_familia:sai,'
       || 'orcamentista_motor_insumo:sai,orcamentista_motor_otimizacao:sai,orcamentista_motor_perfil:sai,orcamentista_motor_regra:sai,orcamentista_motor_tipologia:sai,'
       || 'orcamentista_motor_tipologia_detalhe:sai,orcamentista_motor_tipologia_tempo:sai,orcamentista_motor_validacao:sai,orcamentista_motor_variavel:sai,'
       || 'orcamentista_motor_vidro:sai,orcamentista_importacao:sai,orcamentista_tabela_item:sai,orcamentista_conta_tabela:sai,orcamentista_tabela:sai' THEN
    RAISE EXCEPTION 'verificacao: os passos da tabela nao sao os esperados: %. Nada foi alterado.', v_tx;
  END IF;
  FOREACH nome IN ARRAY ARRAY['public.orcamentista_arrasto_passos(text)', 'public.orcamentista_arrasto_conjuntos(text, text)'] LOOP
    f := to_regprocedure(nome);
    IF f IS NULL OR has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('public', f, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'verificacao: % nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.', nome;
    END IF;
  END LOOP;
  IF EXISTS ((SELECT * FROM _tabela_soberana_fks)
             EXCEPT (SELECT c.conname::text, c.conrelid::regclass::text, c.confdeltype::text, c.confupdtype::text FROM pg_constraint c WHERE c.contype = 'f'))
     OR EXISTS ((SELECT c.conname::text, c.conrelid::regclass::text, c.confdeltype::text, c.confupdtype::text FROM pg_constraint c WHERE c.contype = 'f')
                EXCEPT (SELECT * FROM _tabela_soberana_fks)) THEN
    RAISE EXCEPTION 'verificacao: uma chave estrangeira mudou nesta migracao. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'tabela na soberania: o tipo tabela medido e removido pelo arrasto; os quatro tipos de antes iguais; nenhuma FK mudou.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select proname, md5(replace(prosrc, chr(13), '')) from pg_proc where proname in ('orcamentista_arrasto_passos', 'orcamentista_arrasto_conjuntos');
-- select public.superadmin_arrasto_do_catalogo('tabela', '72366020-57c9-489f-9385-397b7fa3dedb') -> 'avisos';   -- a conversa da De Paula PARA
