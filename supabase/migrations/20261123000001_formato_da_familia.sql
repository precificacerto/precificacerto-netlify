-- 20261123000001_formato_da_familia.sql
--
-- *** ESTA MIGRACAO GRAVA DADO DE CONTA: 1 LINHA, a materia-prima "Esquadrias de PVC WOLF" da De Paula (tenant 20e08592-f957-4e72-b7eb-251387e34eb9,
-- *** materia-prima 79d764fe-4acd-43e2-bed9-38e20667ca3d), que recebe formato = FABRICACAO (o modelo da conta), com antes e depois no log.
--
-- O FORMATO DA FAMILIA (dono do produto, 23/11/2026): "O que determina se ele vai ser fabricado ou revenda e o FORMATO QUE A FAMILIA VAI SER INSERIDA.
-- E la dentro da familia nos temos a opcao de selecionar um ou outro, que e o principal ou o secundario." E: "A conta ela e determinada la na familia."
-- Quem carrega o formato e a FAMILIA (a materia-prima da conta); a conta NAO ganha coluna (o principal e o modelo que a conta ja tem; o secundario e o
-- outro dos dois, e a tela os nomeia assim). Toda esquadria herda o formato da familia dela: o vendedor nao escolhe e o agente nao pergunta.
--
-- O QUE FAZ:
--   1. `orcamentista_materia_prima.formato` text, NULO = nao escolhido (`ausente-vs-falso.md`: nunca um default que finja escolha), com a CHECK
--      `orcamentista_materia_prima_formato_valido` (FABRICACAO ou REVENDA).
--   2. O preenchimento da unica linha medida em 23/11/2026 (acima), logado em `superadmin_alteracao_log`.
--   3. `superadmin_definir_formato_da_materia_prima(p_tenant, p_por, p_materia_prima, p_formato)`: a materia-prima tem de ser DESTA empresa (a de
--      outra e a inexistente recebem a MESMA frase); o formato e FABRICACAO ou REVENDA (nulo e recusa: a familia nao volta a "nao escolhido" pela tela);
--      a linha e travada (FOR UPDATE); o mesmo formato nao grava nem loga; a troca grava `atualizado_por`/`atualizado_em` e loga antes e depois.
--   SECURITY DEFINER, search_path fixo, EXECUTE so do service_role (REVOKE de PUBLIC, anon e authenticated: o privilegio padrao de producao os daria).
--
-- NAO MUDA nenhuma funcao de antes, nao toca em preco, em calculo nem em orcamento gravado. O calculo passa a ler o formato numa PR seguinte.
-- O arquivo inteiro e ASCII (a colagem pelo SQL Editor no Windows reescreve o que nao e ASCII, e o prosrc e o artefato - migracao.md, Parte III).
--
-- GUARDA (aborta, nada e alterado): faltam as dependencias (tenants, users, orcamentista_materia_prima, orcamentista_config, superadmin_alteracao_log);
-- a coluna ja existe sem a CHECK desta migracao; ha materia-prima a preencher fora da medida (qualquer outra com familia e sem formato) ou a medida
-- nao esta como medida (outra empresa, outra familia, ou o modelo da conta nao e FABRICACAO).
-- VERIFICACAO (aborta): a coluna e text e nula; a CHECK existe; a linha medida tem FABRICACAO; a funcao SECURITY DEFINER com search_path fixo e EXECUTE
-- so do service_role.

BEGIN;

DO $guarda$
DECLARE
  v_fora int;
  v_ok int;
BEGIN
  IF to_regclass('public.tenants') IS NULL OR to_regclass('public.users') IS NULL OR to_regclass('public.orcamentista_materia_prima') IS NULL
     OR to_regclass('public.orcamentista_config') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'guarda: dependencia ausente no banco % (usuario %). Nada foi alterado.', current_database(), current_user;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_materia_prima' AND column_name = 'formato')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_materia_prima_formato_valido') THEN
    RAISE EXCEPTION 'guarda: orcamentista_materia_prima.formato ja existe sem a CHECK desta migracao. Nada foi alterado.';
  END IF;
  -- so a linha medida e preenchida; na reaplicacao (coluna ja existe), ela ja tem formato e nada e preenchido
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_materia_prima' AND column_name = 'formato') THEN
    SELECT count(*) INTO v_fora FROM public.orcamentista_materia_prima
     WHERE familia IS NOT NULL AND id <> '79d764fe-4acd-43e2-bed9-38e20667ca3d'::uuid;
    IF v_fora > 0 THEN
      RAISE EXCEPTION 'guarda: % materia-prima(s) com familia fora da medida de 23/11/2026 (so a 79d764fe da De Paula). Nada foi alterado.', v_fora;
    END IF;
    SELECT count(*) INTO v_ok FROM public.orcamentista_materia_prima mp
      JOIN public.orcamentista_config c ON c.tenant_id = mp.tenant_id
     WHERE mp.id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'::uuid AND mp.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9'::uuid
       AND mp.familia = 'PVC' AND c.modelo = 'FABRICACAO';
    IF v_ok <> 1 THEN
      RAISE EXCEPTION 'guarda: a materia-prima 79d764fe nao esta como medida (De Paula, familia PVC, conta FABRICACAO). Nada foi alterado.';
    END IF;
  END IF;
END
$guarda$;

DO $coluna$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_materia_prima' AND column_name = 'formato') THEN
    ALTER TABLE public.orcamentista_materia_prima ADD COLUMN formato text;
    ALTER TABLE public.orcamentista_materia_prima ADD CONSTRAINT orcamentista_materia_prima_formato_valido
      CHECK (formato IS NULL OR formato IN ('FABRICACAO', 'REVENDA'));
    -- o preenchimento da linha medida, com antes e depois no log
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    SELECT mp.tenant_id, 'orcamentista_materia_prima', mp.id::text,
           jsonb_build_object('formato', NULL),
           jsonb_build_object('formato', 'FABRICACAO', 'origem', 'preenchimento 20261123000001', 'motivo', 'o modelo da conta (FABRICACAO)'),
           NULL
      FROM public.orcamentista_materia_prima mp WHERE mp.id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'::uuid;
    UPDATE public.orcamentista_materia_prima SET formato = 'FABRICACAO' WHERE id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'::uuid;
  END IF;
END
$coluna$;
COMMENT ON COLUMN public.orcamentista_materia_prima.formato IS
  'O formato da familia: FABRICACAO ou REVENDA. NULL = nao escolhido. Toda esquadria herda o da familia. Gravado por superadmin_definir_formato_da_materia_prima. 20261123000001.';

CREATE OR REPLACE FUNCTION public.superadmin_definir_formato_da_materia_prima(p_tenant uuid, p_por uuid, p_materia_prima uuid, p_formato text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_formato text;
  v_antes public.orcamentista_materia_prima%ROWTYPE;
BEGIN
  IF p_tenant IS NULL OR p_materia_prima IS NULL THEN
    RAISE EXCEPTION 'formato da familia: a empresa e a materia-prima sao obrigatorias.' USING ERRCODE = '22023';
  END IF;
  v_formato := upper(btrim(coalesce(p_formato, '')));
  IF v_formato NOT IN ('FABRICACAO', 'REVENDA') THEN
    RAISE EXCEPTION 'formato da familia: o formato e FABRICACAO ou REVENDA. Nada foi gravado.' USING ERRCODE = '22023';
  END IF;
  -- a materia-prima de outra empresa e a inexistente recebem a MESMA frase
  SELECT * INTO v_antes FROM public.orcamentista_materia_prima WHERE id = p_materia_prima AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'formato da familia: a materia-prima nao e desta empresa.' USING ERRCODE = 'P0002';
  END IF;
  IF v_antes.formato IS NOT DISTINCT FROM v_formato THEN
    RETURN jsonb_build_object('resultado', 'igual', 'formato', v_formato);
  END IF;
  UPDATE public.orcamentista_materia_prima SET formato = v_formato, atualizado_por = p_por, atualizado_em = now() WHERE id = v_antes.id;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_materia_prima', v_antes.id::text,
          jsonb_build_object('formato', v_antes.formato),
          jsonb_build_object('formato', v_formato, 'funcao', 'superadmin_definir_formato_da_materia_prima'), p_por);
  RETURN jsonb_build_object('resultado', 'trocado', 'formato', v_formato);
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_definir_formato_da_materia_prima(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_definir_formato_da_materia_prima(uuid, uuid, uuid, text) TO service_role;

DO $verifica$
DECLARE v_fn record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_materia_prima'
                   AND column_name = 'formato' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 1: a coluna formato nao e text, nula e sem default.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_materia_prima_formato_valido' AND contype = 'c') THEN
    RAISE EXCEPTION 'verificacao 2: a CHECK orcamentista_materia_prima_formato_valido nao existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_materia_prima WHERE id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'::uuid AND formato IS NOT NULL) THEN
    RAISE EXCEPTION 'verificacao 3: a materia-prima medida nao tem formato.';
  END IF;
  SELECT prosecdef, proconfig INTO v_fn FROM pg_proc WHERE oid = to_regprocedure('public.superadmin_definir_formato_da_materia_prima(uuid, uuid, uuid, text)');
  IF NOT FOUND OR NOT v_fn.prosecdef OR v_fn.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_fn.proconfig)) THEN
    RAISE EXCEPTION 'verificacao 4: a funcao nao existe ou nao e SECURITY DEFINER com search_path fixo.';
  END IF;
  IF has_function_privilege('anon', 'public.superadmin_definir_formato_da_materia_prima(uuid, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.superadmin_definir_formato_da_materia_prima(uuid, uuid, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.superadmin_definir_formato_da_materia_prima(uuid, uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao 5: o EXECUTE da funcao nao e so do service_role.';
  END IF;
  RAISE NOTICE 'formato da familia: coluna, CHECK e funcao prontas; % materia-prima(s) com formato',
    (SELECT count(*) FROM public.orcamentista_materia_prima WHERE formato IS NOT NULL);
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
