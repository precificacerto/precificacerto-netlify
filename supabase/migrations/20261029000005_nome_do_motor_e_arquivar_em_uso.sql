-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261029000005 — O MOTOR TEM NOME; ARQUIVAR MOTOR EM USO DEIXA AS ETAPAS SEM MOTOR.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261029000005_nome_do_motor_e_arquivar_em_uso.
-- ║ PRESSUPÕE aplicada a 20261029000003 (o motor serve N famílias) — aplicada às 18:50 UTC de 29/10/2026 e conferida por consulta.
-- ║ NÃO depende da 20261029000004 (as famílias do catálogo, em voo): nenhuma das duas cita objeto que a outra cria; as duas ordens de
-- ║ aplicação foram provadas no harness.
-- ║ SEM ELA O CÓDIGO QUEBRA: o "Novo motor" chama `superadmin_criar_motor` com `p_nome`, a edição chama `superadmin_editar_motor` com `p_nome`,
-- ║ o catálogo lê `orcamentista_motor.nome`, e o arquivar de motor em uso, que o código passa a oferecer, seria recusado.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 29/10/2026:
--   A. "Quando for criar ou credenciar um novo motor, ou qualquer motor, é preciso nomeá-lo. Então, nós temos que ter o local de inserir ou editar
--      o nome."
--   B. "Excluir um motor que esteja vinculado a uma família ou etapa não é problema. [...] Se não tiver nenhum, ele não vai poder fazer o cálculo.
--      Então, ele não responde nada. [...] eu posso apontar um outro motor, um motor mais atualizado [...] Aí ele volta a funcionar."
--   (C, "a família só calcula com todas as etapas com motor", NÃO é constraint: é conferência no momento de executar, no código.)
--
-- O QUE FAZ:
--   A. GUARDAS que abortam ANTES de qualquer mudança: a 20261029000003 aplicada (a ligação e as assinaturas com `p_familias text[]`); o nome
--      semeado de cada motor tem a forma (1 a 80 caracteres, sem espaço nas pontas) e não repete outro motor ATIVO do mesmo fornecedor.
--   B. `orcamentista_motor.nome`: NOT NULL; CHECK `orcamentista_motor_nome_forma` (`nome = btrim(nome)` e 1..80 caracteres — a mesma forma do
--      rótulo da etapa); índice único PARCIAL `orcamentista_motor_nome_ativo` em `(fornecedor_id, nome) WHERE arquivado_em IS NULL` (o arquivado
--      libera o nome). SEMEIO: o nome de cada motor é o `arquivo_nome` sem a extensão ('Motor_Wolf_PVC.xlsx' -> 'Motor_Wolf_PVC'), com antes e
--      depois no log e as contagens medidas (aborta se diferirem). Medido em produção em 29/10/2026: 1 motor.
--   C. As FKs `(motor_id, motor_familia_exigida) -> orcamentista_motor_familia` da ETAPA e do ITEM passam de ON DELETE RESTRICT para ON DELETE SET
--      NULL (mesmo nome). Numa FK de duas colunas o SET NULL anula AS DUAS, e a CHECK "a exigida existe se e só se há motor" continua satisfeita
--      (provado no harness). Note: ARQUIVAR não apaga a ligação (é um UPDATE no motor); o SET NULL só age quando uma ligação é APAGADA.
--   D. `superadmin_arquivar_motor(p_motor, p_por)`: deixa de recusar o motor em uso. Ao arquivar, LIMPA o motor das etapas que o usam (`motor_id` e
--      `motor_familia_exigida` a NULL), com antes e depois POR ETAPA no log (com o tenant de cada uma), e DEVOLVE `etapas_sem_motor`: empresa,
--      família (o título da matéria-prima), número e rótulo de cada uma, para a tela avisar onde repor. O ITEM DE LEVANTAMENTO JÁ GRAVADO NÃO É
--      TOCADO (pergunta aberta ao dono do produto; medido: 4 itens, nenhum com motor, e nenhum código lê ou grava `motor_id` do item).
--   E. Funções:
--      - `superadmin_criar_motor(..., p_familias text[], p_nome text, ...)`: o nome com a forma e sem repetir outro ATIVO do fornecedor (frase
--        antes; a CHECK e o índice são a trava). Sai a assinatura sem o nome.
--      - `superadmin_editar_motor(..., p_familias text[], p_nome text, ...)`: o nome se edita COM uso (como as famílias); fornecedor e categoria
--        seguem só sem uso; "nada mudou" passa a olhar o nome. Sai a assinatura sem o nome.
--      - `superadmin_trocar_arquivo_do_motor`: o motor novo leva o MESMO nome do antigo. O índice único parcial é conferido no INSERT: por isso a
--        troca ARQUIVA O ANTIGO PRIMEIRO (UPDATE com log), depois cria o novo, depois reaponta as etapas — numa transação só. Na ordem de antes
--        (criar, reapontar, arquivar) o INSERT do novo colidiria com o antigo ainda ativo (provado no harness).
--
-- O QUE NÃO FAZ: não toca no conteúdo do motor (62.299 linhas), nos tempos, nas tabelas de preço, nas etapas (as 3 seguem com o motor da Wolff) nem
-- nos itens. Nenhum UPDATE de dado além do semeio do nome; nenhum DELETE de linha. Os DROP são de duas FKs (recriadas com o mesmo nome) e das duas
-- assinaturas antigas.
--
-- IDEMPOTENTE: coluna, CHECK e índice com IF (NOT) EXISTS; o semeio só toca motor sem nome; as FKs só se recriam se ainda forem RESTRICT.
-- Reaplicada, não loga nada de novo.
-- VERIFICAÇÃO (aborta): a estrutura, as definições exatas, todo motor com nome, as FKs SET NULL e as funções fechadas.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A. AS GUARDAS ──────────────────────────────────────────────────────────────────────────
DO $guarda$
DECLARE
  v_ruins  text;
  v_repet  text;
BEGIN
  IF to_regclass('public.orcamentista_motor_familia') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL
     OR to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)') IS NULL
     OR to_regprocedure('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)') IS NULL
     OR (to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb)') IS NULL
         AND to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)') IS NULL)
     OR (to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text)') IS NULL
         AND to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text, text)') IS NULL) THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261029000003 (o motor serve N familias) nao esta aplicada. Nada foi alterado.';
  END IF;

  -- o nome SEMEADO de cada motor ainda sem nome: com a forma, e sem repetir outro ATIVO do mesmo fornecedor
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'nome') THEN
    SELECT string_agg(format('%s ("%s")', m.id, m.arquivo_nome), ', ' ORDER BY m.id) INTO v_ruins
      FROM public.orcamentista_motor m
     WHERE char_length(btrim(regexp_replace(m.arquivo_nome, '\.[A-Za-z0-9]+$', ''))) NOT BETWEEN 1 AND 80;
    IF v_ruins IS NOT NULL THEN
      RAISE EXCEPTION 'guarda: o nome tirado do arquivo nao tem de 1 a 80 caracteres: %; dar outro nome a eles nao foi autorizado. Nada foi alterado.', v_ruins;
    END IF;
    SELECT string_agg(format('%s / "%s" (%s motores)', d.fornecedor_id, d.semente, d.n), ', ') INTO v_repet
      FROM (SELECT m.fornecedor_id, btrim(regexp_replace(m.arquivo_nome, '\.[A-Za-z0-9]+$', '')) AS semente, count(*) AS n
              FROM public.orcamentista_motor m WHERE m.arquivado_em IS NULL
             GROUP BY 1, 2 HAVING count(*) > 1) d;
    IF v_repet IS NOT NULL THEN
      RAISE EXCEPTION 'guarda: motores ativos do mesmo fornecedor teriam o mesmo nome: %; escolher os nomes nao foi autorizado. Nada foi alterado.', v_repet;
    END IF;
  END IF;
END
$guarda$;

-- ── B. O NOME DO MOTOR ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_motor ADD COLUMN IF NOT EXISTS nome text;

-- o SEMEIO: o arquivo sem a extensao, motor a motor, com antes e depois no log; as contagens medidas
DO $semeio$
DECLARE
  v_antes  integer;
  v_depois integer;
  v_n      integer := 0;
  v_ma     jsonb;
  r        record;
BEGIN
  SELECT count(*) INTO v_antes FROM public.orcamentista_motor m WHERE m.nome IS NULL;
  FOR r IN SELECT m.id FROM public.orcamentista_motor m WHERE m.nome IS NULL ORDER BY m.id FOR UPDATE OF m
  LOOP
    SELECT to_jsonb(m) INTO v_ma FROM public.orcamentista_motor m WHERE m.id = r.id;
    UPDATE public.orcamentista_motor SET nome = btrim(regexp_replace(arquivo_nome, '\.[A-Za-z0-9]+$', '')) WHERE id = r.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (NULL, 'orcamentista_motor', r.id::text,
            jsonb_build_object('orcamentista_motor', v_ma, 'migracao', '20261029000005_nome_do_motor_e_arquivar_em_uso'),
            jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = r.id)),
            NULL);
    v_n := v_n + 1;
  END LOOP;
  SELECT count(*) INTO v_depois FROM public.orcamentista_motor m WHERE m.nome IS NULL;
  IF v_depois <> 0 OR v_n <> v_antes THEN
    RAISE EXCEPTION 'semeio: % motor(es) sem nome antes, % nomeado(s), % sem nome depois. Nada foi alterado.', v_antes, v_n, v_depois;
  END IF;
  IF v_n > 0 THEN
    RAISE NOTICE 'semeio do nome: % motor(es) sem nome antes, % nomeado(s), 0 depois', v_antes, v_n;
  END IF;
END
$semeio$;

ALTER TABLE public.orcamentista_motor ALTER COLUMN nome SET NOT NULL;
DO $b$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_nome_forma') THEN
    ALTER TABLE public.orcamentista_motor ADD CONSTRAINT orcamentista_motor_nome_forma
      CHECK (nome = btrim(nome) AND char_length(nome) >= 1 AND char_length(nome) <= 80);
  END IF;
END
$b$;
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_motor_nome_ativo ON public.orcamentista_motor (fornecedor_id, nome) WHERE arquivado_em IS NULL;

-- ── C. AS FKs DA ETAPA E DO ITEM: ON DELETE SET NULL (as duas colunas) ───────────────────────
DO $c$
DECLARE
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY['orcamentista_familia_etapa', 'orcamentista_levantamento_item'] LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey'
                  AND confdeltype <> 'n') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', nome, nome || '_motor_exigida_fkey');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES public.orcamentista_motor_familia (motor_id, familia) ON DELETE SET NULL',
                     nome, nome || '_motor_exigida_fkey');
    END IF;
  END LOOP;
END
$c$;

-- ── D. ARQUIVAR: o motor em uso se arquiva, e as etapas dele ficam SEM MOTOR ──────────────────
CREATE OR REPLACE FUNCTION public.superadmin_arquivar_motor(
  p_motor uuid, p_por uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
  v_etapa  record;
  v_eantes jsonb;
  v_sem    jsonb := '[]'::jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- a linha do motor travada: uma etapa sendo gravada para ele (FOR SHARE) espera; depois o ve arquivado e recusa
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_arquivar_motor:' || p_motor::text, 0));
  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_antes ->> 'arquivado_em' IS NOT NULL THEN
    RAISE EXCEPTION 'o motor ja esta arquivado' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- as ETAPAS que usam o motor ficam SEM MOTOR (dono do produto, 29/10/2026: "Se não tiver nenhum, ele não vai poder fazer o cálculo [...] eu posso
  -- apontar um outro motor [...] Aí ele volta a funcionar."), cada uma com antes e depois no log, com o tenant dela; a lista volta para a tela
  FOR v_etapa IN
    SELECT x.id, x.tenant_id, x.materia_prima_id, x.numero, x.rotulo, mp.nome AS familia, coalesce(t.name, '(sem nome)') AS empresa
      FROM public.orcamentista_familia_etapa x
      JOIN public.orcamentista_materia_prima mp ON mp.id = x.materia_prima_id
      LEFT JOIN public.tenants t ON t.id = x.tenant_id
     WHERE x.motor_id = p_motor
     ORDER BY coalesce(t.name, '(sem nome)'), mp.nome, x.numero
       FOR UPDATE OF x
  LOOP
    SELECT to_jsonb(x) INTO v_eantes FROM public.orcamentista_familia_etapa x WHERE x.id = v_etapa.id;
    UPDATE public.orcamentista_familia_etapa
       SET motor_id = NULL, motor_familia_exigida = NULL, atualizado_por = p_por, atualizado_em = now()
     WHERE id = v_etapa.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,
            jsonb_build_object('orcamentista_familia_etapa', v_eantes, 'arquivamento_do_motor', p_motor),
            jsonb_build_object('orcamentista_familia_etapa', (SELECT to_jsonb(x) FROM public.orcamentista_familia_etapa x WHERE x.id = v_etapa.id)),
            p_por);
    v_sem := v_sem || jsonb_build_array(jsonb_build_object(
      'etapa_id', v_etapa.id, 'tenant_id', v_etapa.tenant_id, 'materia_prima_id', v_etapa.materia_prima_id,
      'empresa', v_etapa.empresa, 'familia', v_etapa.familia, 'numero', v_etapa.numero, 'rotulo', v_etapa.rotulo));
  END LOOP;

  UPDATE public.orcamentista_motor SET arquivado_em = now(), arquivado_por = p_por WHERE id = p_motor;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_motor m WHERE m.id = p_motor;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text,
          jsonb_build_object('orcamentista_motor', v_antes),
          jsonb_build_object('orcamentista_motor', v_depois, 'etapas_sem_motor', v_sem), p_por);

  RETURN jsonb_build_object('orcamentista_motor', v_depois, 'etapas_sem_motor', v_sem);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) TO service_role;

-- ── E1. CRIAR MOTOR: com nome ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb);
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
                             'importacao_id', v_importacao_id, 'regras', v_regras, 'tipologias', v_detalhes),
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
    'otimizacao',      v_otimizacao
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) TO service_role;

-- ── E2. EDITAR: o nome se edita com uso, como as famílias ─────────────────────────────────
DROP FUNCTION IF EXISTS public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text);
CREATE OR REPLACE FUNCTION public.superadmin_editar_motor(
  p_por uuid, p_motor uuid, p_fornecedor uuid, p_categoria text, p_familias text[], p_nome text, p_arquivo_path text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes    jsonb;
  v_depois   jsonb;
  v_atual    public.orcamentista_motor%ROWTYPE;
  v_path     text := btrim(coalesce(p_arquivo_path, ''));
  v_prefixo  text;
  v_etapas   integer;
  v_itens    integer;
  v_msg      text;
  v_quem     text;
  v_origem   boolean;
  v_atuais   text[];
  v_novas    text[];
  v_saem     text[];
  v_entram   text[];
  v_nome_muda boolean;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- a linha do motor travada: gravar uma etapa para ele (FOR SHARE) espera esta transacao, e ela ve o que esta gravou
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_editar_motor:' || p_motor::text, 0));
  SELECT * INTO v_atual FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_atual.arquivado_em IS NOT NULL THEN
    RAISE EXCEPTION 'o motor esta arquivado: motor arquivado nao se edita. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_categoria) THEN
    RAISE EXCEPTION 'categoria fora da lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_fornecedor IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = p_fornecedor) THEN
    RAISE EXCEPTION 'fornecedor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  -- as FAMILIAS: pelo menos uma, sem repeticao, todas do catalogo (as mesmas recusas da criacao)
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

  -- o NOME (20261029000005): a mesma forma da criacao; unico entre os ATIVOS do fornecedor de depois, fora este motor. Edita-se COM uso.
  IF p_nome IS NULL OR p_nome <> btrim(p_nome) OR char_length(p_nome) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'o nome do motor tem de 1 a 80 caracteres, sem espaco nas pontas. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orcamentista_motor m
              WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL AND m.id <> p_motor) THEN
    RAISE EXCEPTION 'ja existe um motor ativo "%" deste fornecedor: o nome nao se repete entre os motores ativos. Nada foi gravado.', p_nome
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_nome_muda := p_nome <> v_atual.nome;

  v_novas  := ARRAY(SELECT f FROM unnest(p_familias) f ORDER BY f);
  v_atuais := ARRAY(SELECT mf.familia FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = p_motor ORDER BY mf.familia);
  v_saem   := ARRAY(SELECT f FROM unnest(v_atuais) f WHERE f <> ALL (v_novas) ORDER BY f);
  v_entram := ARRAY(SELECT f FROM unnest(v_novas) f WHERE f <> ALL (v_atuais) ORDER BY f);
  v_origem := p_fornecedor <> v_atual.fornecedor_id OR p_categoria <> v_atual.categoria_chave;

  -- FORNECEDOR E CATEGORIA: SO SEM USO (o motor mentiria sobre a propria origem). As familias e o nome se editam com uso.
  IF v_origem THEN
    SELECT count(*) INTO v_etapas FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor;
    SELECT count(*) INTO v_itens FROM public.orcamentista_levantamento_item x WHERE x.motor_id = p_motor;
    IF v_etapas > 0 OR v_itens > 0 THEN
      RAISE EXCEPTION 'o motor tem uso (% etapa(s), % item(ns) de levantamento): categoria e fornecedor so se editam em motor sem uso (as familias e o nome se editam com uso). Para outro arquivo, troque o arquivo. Nada foi gravado.',
        v_etapas, v_itens USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;
  -- o arquivo diz a origem: o mesmo caminho se o fornecedor fica; a pasta de motor do fornecedor NOVO se ele muda
  IF p_fornecedor = v_atual.fornecedor_id THEN
    IF v_path <> v_atual.arquivo_path THEN
      RAISE EXCEPTION 'o fornecedor nao mudou, e o caminho do arquivo tambem nao muda. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSE
    v_prefixo := p_fornecedor::text || '/motor/';
    IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN
      RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor novo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;
  IF NOT v_origem AND NOT v_nome_muda AND cardinality(v_saem) = 0 AND cardinality(v_entram) = 0 THEN
    RAISE EXCEPTION 'nada mudou: o fornecedor, a categoria, as familias e o nome sao os de agora. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- a familia que SAI e alguma etapa ou item usa: RECUSA nomeada. Com a FK em SET NULL (C), a trava e ESTA conferencia, depois da linha do
  -- motor travada acima (gravar etapa leva FOR SHARE nela): apagar a ligacao em uso limparia a etapa em silencio em vez de recusar
  IF cardinality(v_saem) > 0 THEN
    SELECT count(*) INTO v_etapas FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor AND x.motor_familia_exigida = ANY (v_saem);
    SELECT count(*) INTO v_itens FROM public.orcamentista_levantamento_item x WHERE x.motor_id = p_motor AND x.motor_familia_exigida = ANY (v_saem);
    IF v_etapas > 0 OR v_itens > 0 THEN
      v_msg := '';
      IF v_etapas > 0 THEN
        SELECT string_agg(s.u, '; ' ORDER BY s.o) INTO v_quem FROM (
          SELECT format('%s / %s / etapa %s', coalesce(t.name, '(sem nome)'), m.nome, x.numero) AS u,
                 row_number() OVER (ORDER BY t.name, m.nome, x.numero) AS o
            FROM public.orcamentista_familia_etapa x
            JOIN public.orcamentista_materia_prima m ON m.id = x.materia_prima_id
            LEFT JOIN public.tenants t ON t.id = x.tenant_id
           WHERE x.motor_id = p_motor AND x.motor_familia_exigida = ANY (v_saem)) s
         WHERE s.o <= 3;
        v_msg := format('%s etapa(s) (%s%s)', v_etapas, v_quem, CASE WHEN v_etapas > 3 THEN format('; e mais %s', v_etapas - 3) ELSE '' END);
      END IF;
      IF v_itens > 0 THEN
        SELECT string_agg(s.u, '; ' ORDER BY s.o) INTO v_quem FROM (
          SELECT format('%s / levantamento "%s"', coalesce(t.name, '(sem nome)'), l.nome) AS u,
                 row_number() OVER (ORDER BY t.name, l.nome, l.id) AS o
            FROM (SELECT DISTINCT x.tenant_id, x.levantamento_id FROM public.orcamentista_levantamento_item x
                   WHERE x.motor_id = p_motor AND x.motor_familia_exigida = ANY (v_saem)) x
            JOIN public.orcamentista_levantamento l ON l.id = x.levantamento_id
            LEFT JOIN public.tenants t ON t.id = x.tenant_id) s
         WHERE s.o <= 3;
        v_msg := v_msg || CASE WHEN v_etapas > 0 THEN ' e ' ELSE '' END || format('%s item(ns) de levantamento (%s)', v_itens, v_quem);
      END IF;
      RAISE EXCEPTION 'a familia % nao pode sair do motor: em uso por %. Aponte-os para outro motor antes. Nada foi gravado.',
        array_to_string(v_saem, ', '), v_msg USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  v_antes := jsonb_build_object('orcamentista_motor', to_jsonb(v_atual), 'familias', to_jsonb(v_atuais));
  IF v_origem THEN
    UPDATE public.orcamentista_motor SET fornecedor_id = p_fornecedor, categoria_chave = p_categoria, arquivo_path = v_path WHERE id = p_motor;
  END IF;
  IF v_nome_muda THEN
    UPDATE public.orcamentista_motor SET nome = p_nome WHERE id = p_motor;
  END IF;
  INSERT INTO public.orcamentista_motor_familia (motor_id, familia) SELECT p_motor, f FROM unnest(v_entram) f;
  DELETE FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = p_motor AND mf.familia = ANY (v_saem);
  v_depois := jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = p_motor), 'familias', to_jsonb(v_novas));

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text, v_antes, v_depois, p_por);

  RETURN v_depois;
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text, text) TO service_role;

-- ── E3. TROCAR O ARQUIVO: o novo com o MESMO nome; o antigo arquivado antes de criar o novo ──
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

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f    regprocedure;
  nome text;
  def  text;
  v_n  integer;
BEGIN
  -- o nome: NOT NULL, a CHECK da forma e o indice unico parcial, com a definicao exata; todo motor nomeado
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'nome'
                    AND is_nullable = 'NO' AND data_type = 'text') THEN
    RAISE EXCEPTION 'verificacao: orcamentista_motor.nome nao existe, ou nao e text NOT NULL. Nada foi alterado.';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_nome_forma';
  IF def IS DISTINCT FROM 'CHECK (((nome = btrim(nome)) AND (char_length(nome) >= 1) AND (char_length(nome) <= 80)))' THEN
    RAISE EXCEPTION 'verificacao: a CHECK da forma do nome e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_motor_nome_ativo';
  IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_motor_nome_ativo ON public.orcamentista_motor USING btree (fornecedor_id, nome) WHERE (arquivado_em IS NULL)' THEN
    RAISE EXCEPTION 'verificacao: o indice unico do nome e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;

  -- as FKs da etapa e do item: ON DELETE SET NULL, para a ligacao, com a definicao exata
  FOREACH nome IN ARRAY ARRAY['orcamentista_familia_etapa', 'orcamentista_levantamento_item'] LOOP
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey';
    IF def IS DISTINCT FROM 'FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES orcamentista_motor_familia(motor_id, familia) ON DELETE SET NULL' THEN
      RAISE EXCEPTION 'verificacao: a FK da exigida em % e %. Nada foi alterado.', nome, coalesce(def, '(ausente)');
    END IF;
  END LOOP;
  -- a CHECK "a exigida existe se e so se ha motor" continua, sem mudar (e a FK simples do item tambem)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_etapa_motor_familia_exigida')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_levantamento_item_motor_familia_exigida')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_levantamento_item_motor_fkey') THEN
    RAISE EXCEPTION 'verificacao: uma CHECK da exigida, ou a FK simples do item, sumiu. Nada foi alterado.';
  END IF;

  -- as funcoes: fechadas, com search_path fixo; as assinaturas antigas fora; o timeout de criar e trocar
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)',
    'public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text, text)',
    'public.superadmin_arquivar_motor(uuid, uuid)',
    'public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)'
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
  IF to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb)') IS NOT NULL
     OR to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text)') IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: uma assinatura antiga (sem o nome) continua. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)')
                    AND 'statement_timeout=35s' = ANY (p.proconfig))
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)')
                    AND 'statement_timeout=40s' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: criar ou trocar sem o statement_timeout (35 s e 40 s). Nada foi alterado.';
  END IF;

  RAISE NOTICE 'nome do motor e arquivar em uso: nome NOT NULL com forma e unico entre os ativos; FKs SET NULL; funcoes fechadas.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select id, fornecedor_id, nome, arquivo_nome, arquivado_em from public.orcamentista_motor;          -- esperado: o da Wolff, nome 'Motor_Wolf_PVC'
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--  where conname in ('orcamentista_motor_nome_forma', 'orcamentista_familia_etapa_motor_exigida_fkey', 'orcamentista_levantamento_item_motor_exigida_fkey');
--                                                                                                        -- esperado: a CHECK e as 2 FKs ON DELETE SET NULL
-- select indexdef from pg_indexes where indexname = 'orcamentista_motor_nome_ativo';                  -- esperado: UNIQUE ... WHERE (arquivado_em IS NULL)
-- select id, motor_id, motor_familia_exigida from public.orcamentista_familia_etapa;                   -- esperado: as 3, com o motor da Wolff (nada mudou)
