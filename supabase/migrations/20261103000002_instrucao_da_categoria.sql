-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261103000002 — A INSTRUÇÃO DA CATEGORIA: os campos estruturados da categoria viram UM campo de instrução em texto livre, que a conversa
-- lê e manda ao modelo. Ficam estruturados só `cores` e `serra_mm` do Perfil (o cálculo os lê).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão: 20261103000002_instrucao_da_categoria.
-- ║ PRESSUPÕE a 20261023000004 (a gravação da árvore, cujo corpo esta migração troca: a guarda confere o md5 medido em produção em 03/11/2026)
-- ║ e a 20261103000001 (a garantia da categoria na conta, aplicada em 03/11/2026 às 00:45 UTC).
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ ⚠️  ESTA MIGRAÇÃO APAGA DADO DE CONTA — autorizado pelo dono do produto em 03/11/2026.
-- ║ Tudo da empresa Esquadrias De Paula Ltda (tenant 20e08592-f957-4e72-b7eb-251387e34eb9), matéria-prima "Esquadrias de PVC WOLF"
-- ║ (79d764fe-4acd-43e2-bed9-38e20667ca3d), como medido em 03/11/2026 (o conteúdo inteiro está no relatório da Fase 1 e no PR):
-- ║   PERFIL             — saem da config as chaves linha, barra_mm, solda, criterio_custo_barra (ficam cores, cor_predominante e serra_mm);
-- ║   REFORCO            — a config inteira (usa, material, par_inox_referencia) vira NULL;
-- ║   ACESSORIOS_VEDACAO — a config inteira (cor_por_perfil, modelo_interlock, vedacao) vira NULL;
-- ║   VIDRO              — as 4 linhas de orcamentista_mp_vidro;
-- ║   FERRAGENS          — as 4 linhas de orcamentista_mp_ferragem;
-- ║   INSTALACAO         — as 3 linhas de orcamentista_mp_instalacao.
-- ║ E apaga do catálogo GLOBAL de campos (orcamentista_categoria_campo) as 10 definições que saem: PERFIL linha, barra_mm, solda,
-- ║ criterio_custo_barra; REFORCO usa, material, par_inox_referencia; ACESSORIOS_VEDACAO cor_por_perfil, modelo_interlock, vedacao.
-- ║ CADA linha apagada ou alterada vai ao superadmin_alteracao_log (o antes inteiro; a marca 'remocao': '20261103000002') e ao log da aplicação
-- ║ (RAISE NOTICE), POR CATEGORIA, com o conteúdo. A GUARDA ABORTA se houver, na hora de aplicar, qualquer linha ou chave a apagar que não seja
-- ║ uma das medidas (outro id, outra empresa, outra matéria-prima, outra definição): esta migração nunca apaga mais do que este quadro diz.
-- ║ As tabelas orcamentista_mp_vidro, _mp_ferragem e _mp_instalacao e as funções que as gravam FICAM, vazias e sem tela.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- Decisões do dono do produto (03/11/2026), registradas como foram ditas:
--   1. "cores e serra_mm FICAM estruturados, como exceção, e só eles. [...] número que o cálculo usa não pode sair de texto livre."
--      CORREÇÃO do dono do produto, 03/11/2026, antes de aplicar: "cor_predominante não pode sair" — é a fonte da cor padrão da conversa
--      ("cor não dita = config.cor_predominante da categoria Perfil"). FICA estruturada, com cores e serra_mm. Saem só linha, barra_mm,
--      solda e criterio_custo_barra.
--   2. "Coluna instrucao text em orcamentista_mp_categoria, com CHECK de até 1.500 caracteres. Não use chave dentro de config."
--   3. "A migração apaga a config das três categorias (PERFIL perde só as chaves que saem), as 4+4+3 linhas das tabelas e as definições do
--      catálogo de campos que saem. As tabelas e as funções FICAM, vazias e sem tela [...]. Imprima no log o que apagou, por categoria."
--   4. "No prompt, mande só as categorias que TÊM instrução preenchida." (é do código da conversa, não desta migração)
--   5. "a tela de cada categoria fica com: o campo de instrução para todas, mais cores e serra_mm só no Perfil." (é do código da tela; com a correção, cores, cor_predominante e serra_mm)
--   E, perguntado: superadmin_gravar_arvore muda para gravar a instrução no MESMO salvar, numa transação só, com o CORPO TODO EM ASCII.
--
-- O QUE FAZ:
--   A. orcamentista_mp_categoria.instrucao text, nula, CHECK orcamentista_mp_categoria_instrucao_forma: nula, ou de 1 a 1.500 caracteres
--      (char_length) sem espaço nem quebra de linha nas pontas. Vazio é NULL ("não informado"), nunca texto vazio.
--   B. superadmin_gravar_instrucao_da_categoria(p_tenant, p_por, p_mp_categoria, p_instrucao jsonb) — NOVA, SECURITY DEFINER, search_path fixo,
--      só service_role: texto ou null; apara as pontas; vazio limpa; acima de 1.500 é recusa 22023 que diz quantos; a categoria é travada e lida
--      com o tenant; a mesma instrução não grava nem loga; o que muda vai ao log com o antes e o depois.
--   C. superadmin_gravar_arvore aceita a chave `instrucao` em cada categoria e chama a B, no mesmo bloco das outras gravações (o erro sai com o
--      caminho "materia-prima X, categoria Y, instrucao"). O corpo é o de produção com SÓ isso acrescentado — o script de montagem prova pelo
--      diff — e com os comentários de dentro dele SEM ACENTO: a colagem pelo SQL Editor no Windows reescreve o que não é ASCII, e o corpo é o
--      artefato (migracao.md, Parte III). Só comentário perdeu acento; nenhuma linha de código mudou além do acréscimo.
--   D. A remoção do quadro acima, com log por linha e por categoria.
--
-- O QUE NÃO FAZ: não apaga as tabelas de vidro, ferragem e acabamento nem as funções que as gravam; não toca cores nem serra_mm; não toca
-- nenhuma outra empresa nem outra matéria-prima; não muda a superadmin_gravar_mp_categoria (o upsert dela atualiza só a config: a instrução
-- fica), nem o arrasto do catálogo (que apaga a linha inteira com o log dela, instrução junto).
-- GUARDA (aborta): o corpo da gravação da árvore é o de produção (md5 sem \r), achado pela assinatura de entrada; a função nova e a coluna não
-- existem, ou são as desta; o que se apaga é só o medido. VERIFICAÇÃO (aborta): a coluna e a CHECK; as duas funções SECURITY DEFINER, com
-- search_path fixo, só do service_role e com o corpo em ASCII; a árvore chama a nova e aceita a chave; nada do medido sobrou; ficaram
-- cores, cor_predominante e serra_mm com o valor de antes; o catálogo de campos é só PERFIL.cores, PERFIL.cor_predominante e PERFIL.serra_mm; cada remoção tem a sua linha de log; e
-- nenhuma outra linha de orcamentista_mp_categoria mudou.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA ─────────────────────────────────────────────────────────────────────────────
DO $guarda$
DECLARE
  v_md5_arvore  text := 'd1165c55f1e143e7a805249cc1494afe';   -- superadmin_gravar_arvore em producao, 03/11/2026 (o corpo da 20261023000004)
  v_desta       text := 'bbac1a84f0a102b4d37d90295a5b3fa9';                     -- o corpo desta migracao: reaplicar e inofensivo
  v_desta_nova  text := '95e5b34e09888a05071a86cea3b55a31';                       -- superadmin_gravar_instrucao_da_categoria desta migracao
  v_oid         regprocedure;
  v_md5         text;
  v_laudo       text := '';
  v_tabelas     bigint;
  v_fora        text;
BEGIN
  v_oid := to_regprocedure('public.superadmin_gravar_arvore(uuid, uuid, jsonb)');
  IF v_oid IS NULL THEN
    v_laudo := 'superadmin_gravar_arvore(uuid, uuid, jsonb): nao existe';
  ELSE
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_md5 FROM pg_catalog.pg_proc p WHERE p.oid = v_oid;
    IF v_md5 IS DISTINCT FROM v_md5_arvore AND v_md5 IS DISTINCT FROM v_desta THEN
      v_laudo := format('superadmin_gravar_arvore(uuid, uuid, jsonb): md5 %s, esperado %s', v_md5, v_md5_arvore);
    END IF;
  END IF;
  v_oid := to_regprocedure('public.superadmin_gravar_instrucao_da_categoria(uuid, uuid, uuid, jsonb)');
  IF v_oid IS NOT NULL THEN
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_md5 FROM pg_catalog.pg_proc p WHERE p.oid = v_oid;
    IF v_md5 IS DISTINCT FROM v_desta_nova THEN
      v_laudo := v_laudo || format('; superadmin_gravar_instrucao_da_categoria ja existe com outro corpo (md5 %s)', v_md5);
    END IF;
  END IF;
  IF v_laudo <> '' THEN
    SELECT count(*) INTO v_tabelas FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'orcamentista\_%';
    RAISE EXCEPTION 'dependencia ausente no banco % (usuario %, % tabelas orcamentista_*): %. Nada foi alterado.',
      current_database(), current_user, v_tabelas, v_laudo;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_mp_categoria'
               AND column_name = 'instrucao' AND data_type <> 'text') THEN
    RAISE EXCEPTION 'guarda: orcamentista_mp_categoria.instrucao ja existe com outro tipo. Nada foi alterado.';
  END IF;

  -- O QUE SE APAGA E SO O MEDIDO: cada linha das tres tabelas e uma das 11; cada config com chave que sai e uma das 3 da De Paula; cada
  -- definicao do catalogo de campos e uma das 11 que saem ou cores/serra_mm do Perfil
  SELECT string_agg(x, '; ' ORDER BY x) INTO v_fora FROM (
    SELECT format('orcamentista_mp_vidro %s (empresa %s)', v.id, v.tenant_id) AS x FROM public.orcamentista_mp_vidro v
     WHERE v.id NOT IN ('785b8a72-7c4c-4bd9-9c5d-d82235a5cd92', '71ca60ba-e753-43ef-a808-172a711d76c2', 'b5bcdb87-2a50-4efc-ba2a-e0df27fa782e',
                        '0e297cb8-7406-46fe-ad58-67a8a97616dd') OR v.tenant_id <> '20e08592-f957-4e72-b7eb-251387e34eb9'
    UNION ALL
    SELECT format('orcamentista_mp_ferragem %s (empresa %s)', f.id, f.tenant_id) FROM public.orcamentista_mp_ferragem f
     WHERE f.id NOT IN ('a44f1154-cce5-4777-8c1e-dbd282e2ec18', '80cf7331-195c-4f15-8025-60ce47ecd686', 'e3037e1c-09d7-4854-bd48-8e3710b2d41a',
                        '0b1091e2-cb65-4a7f-9218-01f517d3ce9f') OR f.tenant_id <> '20e08592-f957-4e72-b7eb-251387e34eb9'
    UNION ALL
    SELECT format('orcamentista_mp_instalacao %s (empresa %s)', i.id, i.tenant_id) FROM public.orcamentista_mp_instalacao i
     WHERE i.id NOT IN ('4f599fc9-4fbf-414f-b201-5dff3c4cfe1c', '63f2955d-7dba-4394-a777-2b52f2d5af41', 'b5912943-5316-4842-9f06-60a26d35d186')
        OR i.tenant_id <> '20e08592-f957-4e72-b7eb-251387e34eb9'
    UNION ALL
    SELECT format('config de %s da materia-prima %s (empresa %s)', c.categoria_chave, c.materia_prima_id, c.tenant_id)
      FROM public.orcamentista_mp_categoria c
     WHERE c.config ?| ARRAY['linha', 'barra_mm', 'solda', 'criterio_custo_barra', 'usa', 'material', 'par_inox_referencia',
                             'cor_por_perfil', 'modelo_interlock', 'vedacao']
       AND NOT (c.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND c.materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'
                AND c.categoria_chave IN ('PERFIL', 'REFORCO', 'ACESSORIOS_VEDACAO'))
    UNION ALL
    SELECT format('config de %s da materia-prima %s com chave fora do medido: %s', c.categoria_chave, c.materia_prima_id, k)
      FROM public.orcamentista_mp_categoria c, jsonb_object_keys(CASE WHEN jsonb_typeof(c.config) = 'object' THEN c.config ELSE '{}'::jsonb END) k
     WHERE c.categoria_chave IN ('REFORCO', 'ACESSORIOS_VEDACAO')
       AND k NOT IN ('usa', 'material', 'par_inox_referencia', 'cor_por_perfil', 'modelo_interlock', 'vedacao')
    UNION ALL
    SELECT format('definicao do catalogo de campos fora do medido: %s.%s', d.categoria_chave, d.chave) FROM public.orcamentista_categoria_campo d
     WHERE (d.categoria_chave, d.chave) NOT IN (('PERFIL', 'cores'), ('PERFIL', 'serra_mm'), ('PERFIL', 'linha'), ('PERFIL', 'cor_predominante'),
             ('PERFIL', 'barra_mm'), ('PERFIL', 'solda'), ('PERFIL', 'criterio_custo_barra'), ('REFORCO', 'usa'), ('REFORCO', 'material'),
             ('REFORCO', 'par_inox_referencia'), ('ACESSORIOS_VEDACAO', 'cor_por_perfil'), ('ACESSORIOS_VEDACAO', 'modelo_interlock'),
             ('ACESSORIOS_VEDACAO', 'vedacao'))
  ) a;
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: ha o que apagar fora do medido em 03/11/2026 (o cabecalho nunca diz menos do que a migracao apaga): %. Nada foi alterado.', v_fora;
  END IF;
END $guarda$;

-- a foto de antes de orcamentista_mp_categoria: a verificacao prova que so a config das tres mudou
CREATE TEMP TABLE _instrucao_antes ON COMMIT DROP AS
  SELECT c.id, c.categoria_chave, c.config, md5((to_jsonb(c) - 'config' - 'instrucao' - 'atualizado_por' - 'atualizado_em')::text) AS resto
    FROM public.orcamentista_mp_categoria c;

-- ── A. A COLUNA ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_mp_categoria ADD COLUMN IF NOT EXISTS instrucao text;
DO $coluna$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_mp_categoria_instrucao_forma'
                   AND conrelid = 'public.orcamentista_mp_categoria'::regclass) THEN
    ALTER TABLE public.orcamentista_mp_categoria ADD CONSTRAINT orcamentista_mp_categoria_instrucao_forma
      CHECK (instrucao IS NULL OR (char_length(instrucao) BETWEEN 1 AND 1500 AND instrucao = btrim(instrucao, E' \t\r\n')));
  END IF;
END $coluna$;
COMMENT ON COLUMN public.orcamentista_mp_categoria.instrucao IS
  'Instrucao da categoria, texto livre, ate 1500 caracteres. A conversa a manda ao modelo, identificada pela categoria, so quando preenchida. Nula = nao informada.';

-- ── B. A FUNÇÃO QUE GRAVA A INSTRUÇÃO ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_instrucao_da_categoria(
  p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_instrucao jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
-- 03/11/2026 (20261103000002): a instrucao da categoria da conta, texto livre ate 1500 caracteres. A conversa a manda ao modelo, identificada
-- pela categoria, so quando preenchida. Corpo em ASCII: a colagem pelo SQL Editor no Windows reescreve o que nao e ASCII.
DECLARE
  v_texto  text;
  v_n      integer;
  v_antes  jsonb;
  v_atual  text;
  v_depois jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  -- texto ou null; null, vazio e so espaco limpam: ausente e NULL, nunca texto vazio
  IF p_instrucao IS NULL OR jsonb_typeof(p_instrucao) = 'null' THEN
    v_texto := NULL;
  ELSIF jsonb_typeof(p_instrucao) <> 'string' THEN
    RAISE EXCEPTION 'a instrucao e um texto' USING ERRCODE = 'invalid_parameter_value';
  ELSE
    v_texto := nullif(btrim(p_instrucao #>> '{}', E' \t\r\n'), '');
  END IF;
  v_n := char_length(v_texto);
  IF v_n > 1500 THEN
    RAISE EXCEPTION 'a instrucao tem % caracteres; o limite e 1500', v_n USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- a categoria tem de ser DESTA empresa: travada e lida com o tenant, nunca confiada
  SELECT to_jsonb(c), c.instrucao INTO v_antes, v_atual
    FROM public.orcamentista_mp_categoria c
   WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant
   FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'categoria inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  -- a mesma instrucao nao grava nem loga
  IF v_atual IS NOT DISTINCT FROM v_texto THEN
    RETURN jsonb_build_object('orcamentista_mp_categoria', v_antes, 'mudou', false);
  END IF;
  UPDATE public.orcamentista_mp_categoria c
     SET instrucao = v_texto, atualizado_por = p_por, atualizado_em = now()
   WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant
  RETURNING to_jsonb(c) INTO v_depois;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_mp_categoria', p_mp_categoria::text,
          jsonb_build_object('orcamentista_mp_categoria', v_antes),
          jsonb_build_object('orcamentista_mp_categoria', v_depois, 'campo', 'instrucao'), p_por);
  RETURN jsonb_build_object('orcamentista_mp_categoria', v_depois, 'mudou', true);
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_gravar_instrucao_da_categoria(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_instrucao_da_categoria(uuid, uuid, uuid, jsonb) TO service_role;

-- ── C. A GRAVAÇÃO DA ÁRVORE ACEITA A INSTRUÇÃO ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_arvore(
  p_tenant uuid, p_por uuid, p_arvore jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- a ARVORE da empresa, as seis tabelas: UM texto, lido no antes e no depois - uma copia so
  c_arvore CONSTANT text := $q$
    SELECT jsonb_build_object(
      'orcamentista_materia_prima', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ordem, m.nome)
                                                FROM public.orcamentista_materia_prima m WHERE m.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_categoria', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.materia_prima_id, c.categoria_chave)
                                               FROM public.orcamentista_mp_categoria c WHERE c.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_categoria_fornecedor', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.mp_categoria_id, f.ordem)
                                               FROM public.orcamentista_mp_categoria_fornecedor f WHERE f.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_vidro', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.mp_categoria_id, v.ordem)
                                           FROM public.orcamentista_mp_vidro v WHERE v.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_ferragem', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.mp_categoria_id, g.ordem)
                                              FROM public.orcamentista_mp_ferragem g WHERE g.tenant_id = $1), '[]'::jsonb),
      'orcamentista_mp_instalacao', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.mp_categoria_id, i.produto)
                                                FROM public.orcamentista_mp_instalacao i WHERE i.tenant_id = $1), '[]'::jsonb))
  $q$;
  v_antes   jsonb;
  v_depois  jsonb;
  v_mps     jsonb;
  v_remover jsonb;
  v_mp      jsonb;
  v_cat     jsonb;
  v_mp_id   uuid;
  v_cat_id  uuid;
  v_chave   text;
  v_rem     text;
  v_fora    text;
  v_base    text;
  v_caminho text := 'arvore';
  v_estado  text;
  v_msg     text;
BEGIN
  -- (1) o autor e (2) a empresa - com as mensagens das sete, sem caminho
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- (3) o ENVELOPE da arvore. O conteudo de cada no e validado pela funcao que o recebe.
  IF p_arvore IS NULL OR jsonb_typeof(p_arvore) <> 'object' THEN
    RAISE EXCEPTION 'a arvore e um objeto com materias_primas e/ou remover' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_object_keys(p_arvore) k WHERE k NOT IN ('materias_primas', 'remover');
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) na arvore: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT (p_arvore ? 'materias_primas' OR p_arvore ? 'remover') THEN
    RAISE EXCEPTION 'nada a gravar' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_mps := p_arvore -> 'materias_primas';
  v_remover := p_arvore -> 'remover';
  IF p_arvore ? 'materias_primas' AND jsonb_typeof(v_mps) <> 'array' THEN
    RAISE EXCEPTION 'materias_primas e uma lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_arvore ? 'remover' AND (jsonb_typeof(v_remover) <> 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_remover) e
                 WHERE jsonb_typeof(e) <> 'string'
                    OR (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) THEN
    RAISE EXCEPTION 'remover e uma lista de ids (uuid) de materia-prima' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT lower(e #>> '{}')) FROM jsonb_array_elements(coalesce(v_remover, '[]'::jsonb)) e) THEN
    RAISE EXCEPTION 'materia-prima repetida em remover' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- as categorias de cada materia-prima: lista de objetos com categoria_chave, sem repetir, do
  -- catalogo, e so com as chaves que esta funcao sabe a quem entregar
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e
              WHERE jsonb_typeof(e) = 'object' AND e ? 'categorias'
                AND (jsonb_typeof(e -> 'categorias') <> 'array'
                     OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e -> 'categorias') = 'array' THEN e -> 'categorias' ELSE '[]'::jsonb END) c
                                 WHERE jsonb_typeof(c) <> 'object' OR jsonb_typeof(c -> 'categoria_chave') IS DISTINCT FROM 'string'))) THEN
    RAISE EXCEPTION 'categorias e uma lista de objetos com categoria_chave' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e,
         jsonb_array_elements(CASE WHEN jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'categorias') = 'array' THEN e -> 'categorias' ELSE '[]'::jsonb END) c,
         jsonb_object_keys(c) k
   WHERE k NOT IN ('categoria_chave', 'config', 'fornecedores', 'vidros', 'ferragens', 'instalacao', 'instrucao');
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) nas categorias: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(e ->> 'nome', ', ' ORDER BY e ->> 'nome') INTO v_fora
    FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e
   WHERE jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'categorias') = 'array'
     AND (SELECT count(*) <> count(DISTINCT c ->> 'categoria_chave') FROM jsonb_array_elements(e -> 'categorias') c);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'categoria repetida na materia-prima %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(format('materia-prima %s, categoria %s', e ->> 'nome', c ->> 'categoria_chave'), '; ') INTO v_fora
    FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e,
         jsonb_array_elements(CASE WHEN jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'categorias') = 'array' THEN e -> 'categorias' ELSE '[]'::jsonb END) c
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo k WHERE k.chave = c ->> 'categoria_chave');
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'categoria desconhecida: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (4) UM lock no TENANT, antes de qualquer chamada: dois salvamentos da mesma empresa em fila.
  --     Sem ele, o ANTES do resumo de um seria lido antes de o outro gravar, e duas arvores que
  --     travam materias-primas em ordem diferente podiam se travar uma a outra.
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_arvore:' || p_tenant::text, 0));
  EXECUTE c_arvore INTO v_antes USING p_tenant;

  -- remover e gravar a MESMA materia-prima no mesmo salvar: recusado (ver o cabecalho)
  SELECT string_agg(m.nome, ', ' ORDER BY m.nome) INTO v_fora
    FROM public.orcamentista_materia_prima m
   WHERE m.tenant_id = p_tenant
     AND m.id::text IN (SELECT lower(e #>> '{}') FROM jsonb_array_elements(coalesce(v_remover, '[]'::jsonb)) e)
     AND lower(m.nome) IN (SELECT lower(e ->> 'nome') FROM jsonb_array_elements(coalesce(v_mps, '[]'::jsonb)) e WHERE jsonb_typeof(e) = 'object');
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'materia-prima em remover e em materias_primas no mesmo salvar: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (5) as CHAMADAS. Um bloco so: o erro de qualquer uma sai com o caminho de onde estava, e com o
  --     ERRCODE dela - a rota escolhe o status pelo codigo.
  BEGIN
    FOR v_rem IN SELECT e #>> '{}' FROM jsonb_array_elements(coalesce(v_remover, '[]'::jsonb)) WITH ORDINALITY x(e, o) ORDER BY o LOOP
      v_caminho := format('remover %s', v_rem);
      PERFORM public.superadmin_remover_materia_prima(p_tenant, p_por, v_rem::uuid);
    END LOOP;

    IF v_mps IS NOT NULL THEN
      v_caminho := 'materias_primas';
      PERFORM public.superadmin_gravar_materia_prima(p_tenant, p_por,
        coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'object' THEN e - 'categorias' ELSE e END ORDER BY o)
                    FROM jsonb_array_elements(v_mps) WITH ORDINALITY x(e, o)), '[]'::jsonb));

      FOR v_mp IN SELECT e FROM jsonb_array_elements(v_mps) WITH ORDINALITY x(e, o)
                   WHERE jsonb_typeof(e) = 'object' AND e ? 'categorias' ORDER BY o LOOP
        SELECT m.id INTO v_mp_id FROM public.orcamentista_materia_prima m
         WHERE m.tenant_id = p_tenant AND lower(m.nome) = lower(v_mp ->> 'nome');
        FOR v_cat IN SELECT c FROM jsonb_array_elements(v_mp -> 'categorias') WITH ORDINALITY y(c, o) ORDER BY o LOOP
          v_chave := v_cat ->> 'categoria_chave';
          v_base := format('materia-prima %s, categoria %s', v_mp ->> 'nome', v_chave);
          v_caminho := v_base;
          SELECT c.id INTO v_cat_id FROM public.orcamentista_mp_categoria c
           WHERE c.materia_prima_id = v_mp_id AND c.tenant_id = p_tenant AND c.categoria_chave = v_chave;
          IF v_cat_id IS NULL THEN
            RAISE EXCEPTION 'categoria inexistente nesta empresa' USING ERRCODE = 'no_data_found';
          END IF;
          IF v_cat ? 'config' THEN
            v_caminho := v_base || ', config';
            PERFORM public.superadmin_gravar_mp_categoria(p_tenant, p_por, v_mp_id, v_chave, v_cat -> 'config');
          END IF;
          -- 03/11/2026 (20261103000002): a instrucao da categoria, texto livre ate 1500, gravada no mesmo bloco (o erro sai com o caminho)
          IF v_cat ? 'instrucao' THEN
            v_caminho := v_base || ', instrucao';
            PERFORM public.superadmin_gravar_instrucao_da_categoria(p_tenant, p_por, v_cat_id, v_cat -> 'instrucao');
          END IF;
          IF v_cat ? 'fornecedores' THEN
            v_caminho := v_base || ', fornecedores';
            PERFORM public.superadmin_gravar_mp_fornecedores(p_tenant, p_por, v_cat_id, v_cat -> 'fornecedores');
          END IF;
          IF v_cat ? 'vidros' THEN
            v_caminho := v_base || ', vidros';
            PERFORM public.superadmin_gravar_mp_vidros(p_tenant, p_por, v_cat_id, v_cat -> 'vidros');
          END IF;
          IF v_cat ? 'ferragens' THEN
            v_caminho := v_base || ', ferragens';
            PERFORM public.superadmin_gravar_mp_ferragens(p_tenant, p_por, v_cat_id, v_cat -> 'ferragens');
          END IF;
          IF v_cat ? 'instalacao' THEN
            v_caminho := v_base || ', instalacao';
            PERFORM public.superadmin_gravar_mp_instalacao(p_tenant, p_por, v_cat_id, v_cat -> 'instalacao');
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- o bloco ja foi desfeito; relanca para desfazer a transacao inteira, com o caminho
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RAISE EXCEPTION '%: %', v_caminho, v_msg USING ERRCODE = v_estado;
  END;

  -- (6) o RESUMO: a arvore inteira, antes e depois - por ultimo, na mesma transacao
  EXECUTE c_arvore INTO v_depois USING p_tenant;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'arvore', p_tenant::text, v_antes, v_depois, p_por);

  RETURN v_depois;
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_gravar_arvore(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_arvore(uuid, uuid, jsonb) TO service_role;

-- ── D. A REMOÇÃO, com log por linha e por categoria ──────────────────────────────────────
DO $apaga$
DECLARE
  r         record;
  v_n       integer;
  v_antes   jsonb;
  v_depois  jsonb;
  v_sai     text[];
  c_marca   CONSTANT text := '20261103000002';
BEGIN
  -- as tres categorias com config: PERFIL perde as quatro chaves; REFORCO e ACESSORIOS_VEDACAO perdem todas (a config vazia vira NULL)
  FOR r IN SELECT c.* FROM public.orcamentista_mp_categoria c
            WHERE c.config ?| ARRAY['linha', 'barra_mm', 'solda', 'criterio_custo_barra', 'usa', 'material',
                                    'par_inox_referencia', 'cor_por_perfil', 'modelo_interlock', 'vedacao']
            ORDER BY c.categoria_chave FOR UPDATE LOOP
    v_sai := CASE r.categoria_chave
               WHEN 'PERFIL' THEN ARRAY['linha', 'barra_mm', 'solda', 'criterio_custo_barra']
               ELSE ARRAY['usa', 'material', 'par_inox_referencia', 'cor_por_perfil', 'modelo_interlock', 'vedacao'] END;
    v_antes := to_jsonb(r);
    UPDATE public.orcamentista_mp_categoria c SET config = nullif(c.config - v_sai, '{}'::jsonb), atualizado_por = NULL, atualizado_em = now()
     WHERE c.id = r.id RETURNING to_jsonb(c) INTO v_depois;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (r.tenant_id, 'orcamentista_mp_categoria', r.id::text,
            jsonb_build_object('orcamentista_mp_categoria', v_antes, 'remocao', c_marca),
            jsonb_build_object('orcamentista_mp_categoria', v_depois, 'remocao', c_marca), NULL);
    RAISE NOTICE '20261103000002 apagou, categoria %: da config, %', r.categoria_chave,
      (SELECT jsonb_object_agg(k, r.config -> k) FROM unnest(v_sai) k WHERE r.config ? k);
  END LOOP;

  v_n := 0;
  FOR r IN DELETE FROM public.orcamentista_mp_vidro v RETURNING v.* LOOP
    v_n := v_n + 1;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (r.tenant_id, 'orcamentista_mp_vidro', r.id::text, jsonb_build_object('orcamentista_mp_vidro', to_jsonb(r), 'remocao', c_marca), NULL, NULL);
    RAISE NOTICE '20261103000002 apagou, categoria VIDRO: %', to_jsonb(r) - 'tenant_id' - 'mp_categoria_id' - 'categoria_chave';
  END LOOP;
  RAISE NOTICE '20261103000002, categoria VIDRO: % linha(s) de orcamentista_mp_vidro', v_n;

  v_n := 0;
  FOR r IN DELETE FROM public.orcamentista_mp_ferragem f RETURNING f.* LOOP
    v_n := v_n + 1;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (r.tenant_id, 'orcamentista_mp_ferragem', r.id::text, jsonb_build_object('orcamentista_mp_ferragem', to_jsonb(r), 'remocao', c_marca), NULL, NULL);
    RAISE NOTICE '20261103000002 apagou, categoria FERRAGENS: %', to_jsonb(r) - 'tenant_id' - 'mp_categoria_id' - 'categoria_chave';
  END LOOP;
  RAISE NOTICE '20261103000002, categoria FERRAGENS: % linha(s) de orcamentista_mp_ferragem', v_n;

  v_n := 0;
  FOR r IN DELETE FROM public.orcamentista_mp_instalacao i RETURNING i.* LOOP
    v_n := v_n + 1;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (r.tenant_id, 'orcamentista_mp_instalacao', r.id::text, jsonb_build_object('orcamentista_mp_instalacao', to_jsonb(r), 'remocao', c_marca), NULL, NULL);
    RAISE NOTICE '20261103000002 apagou, categoria INSTALACAO: %', to_jsonb(r) - 'tenant_id' - 'mp_categoria_id' - 'categoria_chave';
  END LOOP;
  RAISE NOTICE '20261103000002, categoria INSTALACAO: % linha(s) de orcamentista_mp_instalacao', v_n;

  -- as definicoes que saem do catalogo GLOBAL de campos (a guarda provou que sao so as 10 medidas)
  FOR r IN DELETE FROM public.orcamentista_categoria_campo d
            WHERE NOT ((d.categoria_chave, d.chave) IN (('PERFIL', 'cores'), ('PERFIL', 'cor_predominante'), ('PERFIL', 'serra_mm')))
            RETURNING d.* LOOP
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (NULL, 'orcamentista_categoria_campo', r.categoria_chave || '.' || r.chave,
            jsonb_build_object('orcamentista_categoria_campo', to_jsonb(r), 'remocao', c_marca), NULL, NULL);
    RAISE NOTICE '20261103000002 apagou, categoria %: a definicao do campo % (%)', r.categoria_chave, r.chave, r.rotulo;
  END LOOP;
END $apaga$;

-- ── VERIFICAÇÃO (aborta) ─────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  v_md5  text;
  v_def  text;
  v_fora text;
  f      text;
BEGIN
  -- (1) a coluna e a CHECK
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_mp_categoria'
                   AND column_name = 'instrucao' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_mp_categoria.instrucao nao e text nula sem default';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint WHERE conname = 'orcamentista_mp_categoria_instrucao_forma';
  IF v_def IS NULL OR position('1500' in v_def) = 0 OR position('btrim' in v_def) = 0 THEN
    RAISE EXCEPTION 'verificacao 1: a CHECK da instrucao nao e a desta migracao: %', v_def;
  END IF;
  -- (2) as duas funcoes: SECURITY DEFINER, search_path fixo, so service_role, corpo em ASCII
  FOREACH f IN ARRAY ARRAY['public.superadmin_gravar_instrucao_da_categoria(uuid, uuid, uuid, jsonb)', 'public.superadmin_gravar_arvore(uuid, uuid, jsonb)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(f) AND p.prosecdef
                     AND p.proconfig @> ARRAY['search_path=public, pg_temp'] AND p.prosrc !~ '[^\x01-\x7F]') THEN
      RAISE EXCEPTION 'verificacao 2: % nao e SECURITY DEFINER com search_path fixo e corpo em ASCII', f;
    END IF;
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'verificacao 2: % nao e so do service_role', f;
    END IF;
  END LOOP;
  SELECT md5(replace(prosrc, chr(13), '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure('public.superadmin_gravar_arvore(uuid, uuid, jsonb)');
  IF v_md5 IS DISTINCT FROM 'bbac1a84f0a102b4d37d90295a5b3fa9' THEN
    RAISE EXCEPTION 'verificacao 2: superadmin_gravar_arvore nao tem o corpo desta migracao (md5 %)', v_md5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure('public.superadmin_gravar_arvore(uuid, uuid, jsonb)')
                   AND prosrc LIKE '%superadmin_gravar_instrucao_da_categoria(p_tenant, p_por, v_cat_id, v_cat -> ''instrucao'')%'
                   AND prosrc LIKE '%''instalacao'', ''instrucao'')%') THEN
    RAISE EXCEPTION 'verificacao 2: superadmin_gravar_arvore nao aceita nem grava a instrucao';
  END IF;
  -- (3) nada do medido sobrou
  IF EXISTS (SELECT 1 FROM public.orcamentista_mp_vidro) OR EXISTS (SELECT 1 FROM public.orcamentista_mp_ferragem)
     OR EXISTS (SELECT 1 FROM public.orcamentista_mp_instalacao)
     OR EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c
                 WHERE c.config ?| ARRAY['linha', 'barra_mm', 'solda', 'criterio_custo_barra', 'usa', 'material',
                                         'par_inox_referencia', 'cor_por_perfil', 'modelo_interlock', 'vedacao']) THEN
    RAISE EXCEPTION 'verificacao 3: sobrou linha ou chave que devia ter saido';
  END IF;
  -- (4) cores, cor_predominante e serra_mm com o valor de antes; e nenhuma outra linha mudou (nem a config das outras categorias, nem o resto das tres)
  SELECT string_agg(a.categoria_chave || ' ' || a.id, ', ') INTO v_fora
    FROM _instrucao_antes a LEFT JOIN public.orcamentista_mp_categoria c ON c.id = a.id
   WHERE c.id IS NULL
      OR a.resto <> md5((to_jsonb(c) - 'config' - 'instrucao' - 'atualizado_por' - 'atualizado_em')::text)
      OR (a.categoria_chave NOT IN ('PERFIL', 'REFORCO', 'ACESSORIOS_VEDACAO') AND c.config IS DISTINCT FROM a.config)
      OR (a.categoria_chave = 'PERFIL' AND (c.config -> 'cores' IS DISTINCT FROM a.config -> 'cores'
                                            OR c.config -> 'cor_predominante' IS DISTINCT FROM a.config -> 'cor_predominante'
                                            OR c.config -> 'serra_mm' IS DISTINCT FROM a.config -> 'serra_mm'
                                            OR coalesce(c.config, '{}'::jsonb) - ARRAY['cores', 'cor_predominante', 'serra_mm'] <> '{}'::jsonb))
      OR (a.categoria_chave IN ('REFORCO', 'ACESSORIOS_VEDACAO') AND c.config IS NOT NULL
          AND c.config IS DISTINCT FROM nullif(a.config - ARRAY['usa', 'material', 'par_inox_referencia', 'cor_por_perfil', 'modelo_interlock', 'vedacao'], '{}'::jsonb));
  IF v_fora IS NOT NULL OR (SELECT count(*) FROM _instrucao_antes) <> (SELECT count(*) FROM public.orcamentista_mp_categoria) THEN
    RAISE EXCEPTION 'verificacao 4: orcamentista_mp_categoria mudou fora do que esta migracao faz: %', coalesce(v_fora, 'contagem');
  END IF;
  -- (5) o catalogo de campos e so cores, cor_predominante e serra_mm do Perfil (a ordem em "C": o collation do banco nao decide)
  SELECT string_agg(categoria_chave || '.' || chave, ', ' ORDER BY categoria_chave COLLATE "C", chave COLLATE "C") INTO v_fora FROM public.orcamentista_categoria_campo;
  IF v_fora IS DISTINCT FROM 'PERFIL.cor_predominante, PERFIL.cores, PERFIL.serra_mm' THEN
    RAISE EXCEPTION 'verificacao 5: o catalogo de campos nao e so PERFIL.cor_predominante, PERFIL.cores e PERFIL.serra_mm: %', v_fora;
  END IF;
  -- (6) cada remocao tem a sua linha de log (as 11 linhas, as configs e as 10 definicoes; reaplicar nao loga de novo)
  IF (SELECT count(*) FROM public.superadmin_alteracao_log WHERE antes ->> 'remocao' = '20261103000002' AND tabela IN ('orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao'))
       <> (SELECT count(DISTINCT chave) FROM public.superadmin_alteracao_log WHERE antes ->> 'remocao' = '20261103000002' AND tabela IN ('orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao'))
     OR (SELECT count(*) FROM public.superadmin_alteracao_log WHERE antes ->> 'remocao' = '20261103000002' AND tabela = 'orcamentista_categoria_campo')
       <> (SELECT count(DISTINCT chave) FROM public.superadmin_alteracao_log WHERE antes ->> 'remocao' = '20261103000002' AND tabela = 'orcamentista_categoria_campo') THEN
    RAISE EXCEPTION 'verificacao 6: uma remocao foi logada mais de uma vez';
  END IF;
END $verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Conferência depois de aplicar (só leitura):
--   select categoria_chave, config, instrucao from orcamentista_mp_categoria where tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' order by 1;
--   select tabela, chave, antes from superadmin_alteracao_log where antes ->> 'remocao' = '20261103000002' order by tabela, chave;
--   select categoria_chave, chave from orcamentista_categoria_campo;
--   select proname, md5(replace(prosrc, chr(13), '')) from pg_proc where proname in ('superadmin_gravar_arvore', 'superadmin_gravar_instrucao_da_categoria');
