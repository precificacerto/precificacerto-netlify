-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261029000001 — TROCAR O ARQUIVO DO MOTOR (motor novo) E EDITAR CATEGORIA E FORNECEDOR (só sem uso).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261029000001_trocar_arquivo_e_editar_motor.
-- ║ PRESSUPÕE aplicadas a 20261028000001 (o catálogo de motores) e a 20261028000002 — conferidas em produção em 29/10/2026.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisões do dono do produto, 29/10/2026 (`.claude/rules/tabela-de-preco-por-categoria.md`, "Decisões de 29/10/2026"):
--   2. TROCAR O ARQUIVO = MOTOR NOVO (opção a). As famílias que usavam o antigo são reapontadas NA MESMA TRANSAÇÃO; o antigo é ARQUIVADO com as
--      linhas intactas. "Um levantamento antigo tem de continuar lendo o que leu": nada se apaga, e o item de levantamento que aponta o antigo
--      continua apontando o antigo. Os tempos ficam no motor antigo — são do arquivo antigo. A opção (b), apagar e reimportar com o mesmo id, é
--      PROIBIDA: mudaria em silêncio o que um levantamento já calculado leu.
--   3. "REMOVER O ARQUIVO" É ARQUIVAR — já existe (`superadmin_arquivar_motor`). Esta migração não apaga motor nenhum.
--   4. EDITAR CATEGORIA E FORNECEDOR: SÓ EM MOTOR SEM USO. Com uso, o motor passaria a mentir sobre a própria origem. Trocar o fornecedor leva o
--      arquivo para a pasta do fornecedor novo (a rota copia o objeto; a função confere o caminho novo) — sem isso, o caminho mentiria.
--
-- O QUE FAZ — duas funções novas, SECURITY DEFINER, `search_path` fixo, só `service_role`, com log:
--   A. `superadmin_trocar_arquivo_do_motor(p_por, p_motor, p_arquivo_path, p_arquivo_nome, p_payload)`:
--      trava o motor antigo; recusa o arquivado e o mesmo caminho; CRIA o motor novo pela `superadmin_criar_motor` (mesmo fornecedor, categoria e
--      família, a mesma leitura e as mesmas contagens, e o log dela); REAPONTA as etapas do antigo para o novo, com antes e depois no log; e
--      ARQUIVA o antigo pela `superadmin_arquivar_motor` (que confere que ninguém mais o aponta, e loga). Tudo numa transação: falhou um passo,
--      nada fica.
--   B. `superadmin_editar_motor(p_por, p_motor, p_fornecedor, p_categoria, p_arquivo_path)`:
--      só sem uso — nenhuma etapa e nenhum item de levantamento aponta o motor (a recusa nomeia quantos); não arquivado; a categoria do catálogo;
--      o fornecedor existe; o caminho é o atual quando o fornecedor não muda, e está na pasta de motor do fornecedor novo quando muda. A família
--      não muda aqui. Antes e depois no log.
--
-- O QUE NÃO FAZ: nenhuma estrutura nova (tabela, coluna, constraint); nenhum UPDATE/DELETE de dado na aplicação; não toca no motor da Wolff.
-- IDEMPOTENTE: CREATE OR REPLACE; reaplicada, não muda nada.
-- VERIFICAÇÃO (aborta): as duas funções existem, fechadas (só service_role), com search_path fixo, e a de trocar com o statement_timeout.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA: o que esta migração pressupõe ────────────────────────────────────────────────
DO $guarda$
BEGIN
  IF to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)') IS NULL
     OR to_regclass('public.orcamentista_motor') IS NULL OR to_regclass('public.orcamentista_familia_etapa') IS NULL
     OR to_regclass('public.orcamentista_levantamento_item') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261028000001 (criar e arquivar motor, etapa da familia-instancia) nao esta aplicada. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'materia_prima_id') THEN
    RAISE EXCEPTION 'dependencia ausente: a etapa nao tem materia_prima_id (a 20261028000001). Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. TROCAR O ARQUIVO: motor novo, etapas reapontadas, antigo arquivado ───────────────────
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

  -- 1. o motor NOVO: mesmo fornecedor, categoria e familia; a leitura, as contagens e o log sao os da criacao
  v_criado := public.superadmin_criar_motor(p_por, v_antigo.fornecedor_id, v_antigo.categoria_chave, v_antigo.familia,
                                            p_arquivo_path, p_arquivo_nome, p_payload);
  v_novo := (v_criado ->> 'motor_id')::uuid;
  IF v_novo IS NULL OR v_novo = p_motor THEN
    RAISE EXCEPTION 'a criacao do motor novo nao devolveu o id. Nada foi gravado.' USING ERRCODE = 'internal_error';
  END IF;

  -- 2. as ETAPAS do antigo passam ao novo, cada uma com antes e depois no log (a etapa e da empresa: o log leva o tenant)
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

  -- 3. o antigo ARQUIVADO, com as linhas intactas — pela funcao de arquivar, que confere que nenhuma etapa o aponta mais, e loga
  PERFORM public.superadmin_arquivar_motor(p_motor, p_por);

  RETURN v_criado || jsonb_build_object('motor_antigo', p_motor, 'etapas_reapontadas', v_n);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) TO service_role;

-- ── B. EDITAR CATEGORIA E FORNECEDOR: só em motor SEM USO ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_editar_motor(
  p_por uuid, p_motor uuid, p_fornecedor uuid, p_categoria text, p_arquivo_path text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes   jsonb;
  v_depois  jsonb;
  v_atual   public.orcamentista_motor%ROWTYPE;
  v_path    text := btrim(coalesce(p_arquivo_path, ''));
  v_prefixo text;
  v_etapas  integer;
  v_itens   integer;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_editar_motor:' || p_motor::text, 0));
  SELECT * INTO v_atual FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  v_antes := to_jsonb(v_atual);
  IF v_atual.arquivado_em IS NOT NULL THEN
    RAISE EXCEPTION 'o motor esta arquivado: motor arquivado nao se edita. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- SO SEM USO: nenhuma etapa e nenhum item de levantamento aponta o motor (a linha ja esta travada: quem for aponta-lo espera)
  SELECT count(*) INTO v_etapas FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor;
  SELECT count(*) INTO v_itens FROM public.orcamentista_levantamento_item x WHERE x.motor_id = p_motor;
  IF v_etapas > 0 OR v_itens > 0 THEN
    RAISE EXCEPTION 'o motor tem uso (% etapa(s), % item(ns) de levantamento): categoria e fornecedor so se editam em motor sem uso. Para outro arquivo, troque o arquivo. Nada foi gravado.',
      v_etapas, v_itens USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_categoria) THEN
    RAISE EXCEPTION 'categoria fora da lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_fornecedor IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = p_fornecedor) THEN
    RAISE EXCEPTION 'fornecedor inexistente' USING ERRCODE = 'no_data_found';
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
  IF p_fornecedor = v_atual.fornecedor_id AND p_categoria = v_atual.categoria_chave THEN
    RAISE EXCEPTION 'nada mudou: o fornecedor e a categoria sao os de agora. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.orcamentista_motor SET fornecedor_id = p_fornecedor, categoria_chave = p_categoria, arquivo_path = v_path WHERE id = p_motor;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_motor m WHERE m.id = p_motor;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text,
          jsonb_build_object('orcamentista_motor', v_antes), jsonb_build_object('orcamentista_motor', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_motor', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f    regprocedure;
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)',
    'public.superadmin_editar_motor(uuid, uuid, uuid, text, text)'
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
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)')
                    AND 'statement_timeout=40s' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: superadmin_trocar_arquivo_do_motor sem o statement_timeout de 40 s. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'trocar arquivo e editar motor: duas funcoes fechadas, com search_path fixo.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select proname, pg_get_function_identity_arguments(oid), proconfig from pg_proc
--  where proname in ('superadmin_trocar_arquivo_do_motor', 'superadmin_editar_motor');           -- esperado: 2 linhas, search_path fixo
-- select count(*) from public.orcamentista_motor;                                                 -- esperado: o mesmo de antes (nada criado)
