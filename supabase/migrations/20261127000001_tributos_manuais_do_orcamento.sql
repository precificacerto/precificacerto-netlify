-- ================================================================================================
-- 20261127000001 - tributos manuais do orcamento (`orcamentista_orcamento.tributos_manuais`): pedido 0044.
--
-- +-----------------------------------------------------------------------------------------------
-- | PENDENTE. NAO APLICADA. Quem aplica e o dono do produto, ANTES do merge do PR que a traz.
-- | Ao aplicar fora do CLI, o `name` da migracao e o nome completo deste arquivo, sem a extensao:
-- | 20261127000001_tributos_manuais_do_orcamento.
-- | SEM ELA o codigo nao quebra: a leitura recusa a coluna ausente e segue com os tributos das credenciais da
-- | empresa; a gravacao de uma edicao manual recusa com frase nomeada ("tributos manuais indisponiveis").
-- | O arquivo inteiro e ASCII (a colagem pelo SQL Editor no Windows reescreve o que nao e ASCII).
-- +-----------------------------------------------------------------------------------------------
--
-- POR QUE - pedido 0044 do dono do produto: ICMS, PIS/Cofins, CBS, IBS, IS, IPI e o fator de reducao passam a poder
-- ser editados a mao no orcamento. A decisao de 11/11/2026 FICA: sem edicao, o valor vem das credenciais da empresa.
-- A edicao e do orcamento, e entra no snapshot do orcamento, do pedido e da venda.
--
-- FORMA - `tributos_manuais` e um objeto; a CHAVE PRESENTE e o tributo editado a mao, a AUSENTE usa a credencial:
--   { "icms": {"pct": 17}, "pis_cofins": {"pct": 9.25}, "reducao_ibs": {"pct": 17} }
-- Chaves aceitas: icms, pis_cofins, cbs, ibs, is, ipi, reducao_ibs, reducao_cbs.
-- Cada valor e um objeto com `pct` numero entre 0 e 100 (percentual, nao fracao).
--
-- O QUE FAZ:
--   1. `orcamentista_orcamento.tributos_manuais jsonb NULL`, sem default. Nula = nada editado.
--   2. CHECK `orcamentista_orcamento_tributos_manuais_forma`: nula, ou objeto so com as chaves acima, cada uma {pct} em 0..100.
-- Aditiva: nenhuma linha e alterada; nada e apagado; nenhuma constraint existente muda.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS; a CHECK so se nao existe.
-- GUARDA (aborta): a tabela existe; a coluna ja existente com outro tipo; a CHECK de mesmo nome ja existente.
-- VERIFICACAO (aborta): a coluna jsonb, nula, sem default; a CHECK existe e e do tipo CHECK; 36 constraints no total
-- (35 medidas em 27/11/2026, mais esta).
-- ================================================================================================
BEGIN;

DO $guarda$
DECLARE
  tipo text;
  ja   oid;
BEGIN
  IF to_regclass('public.orcamentista_orcamento') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_orcamento (banco %, usuario %). Nada foi alterado.', current_database(), current_user;
  END IF;
  SELECT udt_name INTO tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'tributos_manuais';
  IF tipo IS NOT NULL AND tipo <> 'jsonb' THEN
    RAISE EXCEPTION 'orcamentista_orcamento.tributos_manuais ja existe com o tipo %, e devia ser jsonb. Nada foi alterado.', tipo;
  END IF;
  SELECT oid INTO ja FROM pg_constraint
   WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_tributos_manuais_forma';
  IF ja IS NOT NULL AND tipo IS NULL THEN
    RAISE EXCEPTION 'a CHECK orcamentista_orcamento_tributos_manuais_forma existe sem a coluna. Nada foi alterado.';
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_orcamento ADD COLUMN IF NOT EXISTS tributos_manuais jsonb NULL;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_tributos_manuais_forma') THEN
    ALTER TABLE public.orcamentista_orcamento ADD CONSTRAINT orcamentista_orcamento_tributos_manuais_forma
    CHECK (tributos_manuais IS NULL OR (
      jsonb_typeof(tributos_manuais) = 'object'
      AND (tributos_manuais - ARRAY['icms','pis_cofins','cbs','ibs','is','ipi','reducao_ibs','reducao_cbs']::text[]) = '{}'::jsonb
      AND CASE WHEN tributos_manuais ? 'icms' THEN
        CASE WHEN jsonb_typeof(tributos_manuais -> 'icms') = 'object'
              AND (tributos_manuais -> 'icms') ? 'pct'
              AND jsonb_typeof(tributos_manuais -> 'icms' -> 'pct') = 'number'
             THEN (tributos_manuais -> 'icms' ->> 'pct')::numeric BETWEEN 0 AND 100
             ELSE false END
      ELSE true END
      AND CASE WHEN tributos_manuais ? 'pis_cofins' THEN
        CASE WHEN jsonb_typeof(tributos_manuais -> 'pis_cofins') = 'object'
              AND (tributos_manuais -> 'pis_cofins') ? 'pct'
              AND jsonb_typeof(tributos_manuais -> 'pis_cofins' -> 'pct') = 'number'
             THEN (tributos_manuais -> 'pis_cofins' ->> 'pct')::numeric BETWEEN 0 AND 100
             ELSE false END
      ELSE true END
      AND CASE WHEN tributos_manuais ? 'cbs' THEN
        CASE WHEN jsonb_typeof(tributos_manuais -> 'cbs') = 'object'
              AND (tributos_manuais -> 'cbs') ? 'pct'
              AND jsonb_typeof(tributos_manuais -> 'cbs' -> 'pct') = 'number'
             THEN (tributos_manuais -> 'cbs' ->> 'pct')::numeric BETWEEN 0 AND 100
             ELSE false END
      ELSE true END
      AND CASE WHEN tributos_manuais ? 'ibs' THEN
        CASE WHEN jsonb_typeof(tributos_manuais -> 'ibs') = 'object'
              AND (tributos_manuais -> 'ibs') ? 'pct'
              AND jsonb_typeof(tributos_manuais -> 'ibs' -> 'pct') = 'number'
             THEN (tributos_manuais -> 'ibs' ->> 'pct')::numeric BETWEEN 0 AND 100
             ELSE false END
      ELSE true END
      AND CASE WHEN tributos_manuais ? 'is' THEN
        CASE WHEN jsonb_typeof(tributos_manuais -> 'is') = 'object'
              AND (tributos_manuais -> 'is') ? 'pct'
              AND jsonb_typeof(tributos_manuais -> 'is' -> 'pct') = 'number'
             THEN (tributos_manuais -> 'is' ->> 'pct')::numeric BETWEEN 0 AND 100
             ELSE false END
      ELSE true END
      AND CASE WHEN tributos_manuais ? 'ipi' THEN
        CASE WHEN jsonb_typeof(tributos_manuais -> 'ipi') = 'object'
              AND (tributos_manuais -> 'ipi') ? 'pct'
              AND jsonb_typeof(tributos_manuais -> 'ipi' -> 'pct') = 'number'
             THEN (tributos_manuais -> 'ipi' ->> 'pct')::numeric BETWEEN 0 AND 100
             ELSE false END
      ELSE true END
      AND CASE WHEN tributos_manuais ? 'reducao_ibs' THEN
        CASE WHEN jsonb_typeof(tributos_manuais -> 'reducao_ibs') = 'object'
              AND (tributos_manuais -> 'reducao_ibs') ? 'pct'
              AND jsonb_typeof(tributos_manuais -> 'reducao_ibs' -> 'pct') = 'number'
             THEN (tributos_manuais -> 'reducao_ibs' ->> 'pct')::numeric BETWEEN 0 AND 100
             ELSE false END
      ELSE true END
      AND CASE WHEN tributos_manuais ? 'reducao_cbs' THEN
        CASE WHEN jsonb_typeof(tributos_manuais -> 'reducao_cbs') = 'object'
              AND (tributos_manuais -> 'reducao_cbs') ? 'pct'
              AND jsonb_typeof(tributos_manuais -> 'reducao_cbs' -> 'pct') = 'number'
             THEN (tributos_manuais -> 'reducao_cbs' ->> 'pct')::numeric BETWEEN 0 AND 100
             ELSE false END
      ELSE true END
    ));
  END IF;
END
$check$;

COMMENT ON COLUMN public.orcamentista_orcamento.tributos_manuais IS
  'Tributos editados a mao no orcamento (20261127000001; pedido 0044): objeto cuja chave presente e o tributo manual, {"pct": numero 0..100}. Chaves: icms, pis_cofins, cbs, ibs, is, ipi, reducao_ibs, reducao_cbs. Nula = tudo das credenciais da empresa.';

DO $verifica$
DECLARE
  col    record;
  n      int;
  def    text;
BEGIN
  SELECT data_type, is_nullable, column_default INTO col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'tributos_manuais';
  IF col IS NULL OR col.data_type <> 'jsonb' OR col.is_nullable <> 'YES' OR col.column_default IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_orcamento.tributos_manuais devia ser jsonb, nula e sem default. Nada foi alterado.';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_tributos_manuais_forma' AND contype = 'c';
  IF def IS NULL OR def NOT LIKE 'CHECK (%tributos_manuais IS NULL%' THEN
    RAISE EXCEPTION 'verificacao 2: a CHECK orcamentista_orcamento_tributos_manuais_forma esta ausente ou com outra forma: %. Nada foi alterado.', def;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento');
  IF n <> 36 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_orcamento tem % constraint(s), e devia ter 36. Nada foi alterado.', n;
  END IF;
  RAISE NOTICE 'orcamentista_orcamento.tributos_manuais (jsonb, nula, sem default) e a CHECK orcamentista_orcamento_tributos_manuais_forma.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- -- VERIFICACAO DEPOIS DE APLICAR, por consulta ao banco (nao pelo retorno do comando) --
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_orcamento' and column_name = 'tributos_manuais';
-- -- esperado: 1 linha, jsonb, YES, nulo
-- select count(*) from pg_constraint where conrelid = 'public.orcamentista_orcamento'::regclass;
-- -- esperado: 36
