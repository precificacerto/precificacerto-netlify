-- ========================================================================================
-- 20261123000003 - SOLTA O "UM ORCAMENTO POR LEVANTAMENTO" (PR3 do produzido x revenda), parte que TIRA: aplicar SO DEPOIS do merge E do deploy
-- *** Esta migracao remove um INDICE (orcamentista_orcamento_um_por_levantamento). NAO apaga nem altera dado nenhum.
-- *** Ordem: so depois que o codigo que cria um orcamento por familia estiver mergeado e publicado (migracao.md, a licao de 12/11/2026: o que a
-- *** migracao TIRA do codigo antigo vai em migracao propria, depois do merge e do deploy). Antes disso o codigo publicado conta com o indice.
--
-- O QUE FAZ: remove o indice unico orcamentista_orcamento_um_por_levantamento (levantamento_id). Quem garante a unicidade passa a ser so o
-- orcamentista_orcamento_um_por_familia (levantamento_id, coalesce(familia, '')), da 20261123000002: um orcamento por levantamento E familia.
-- GUARDA (aborta): o indice novo existe com a definicao da 20261123000002 (sem ele, tirar o antigo deixaria o levantamento sem unicidade).
-- VERIFICACAO (aborta): o antigo nao existe e o novo continua.
-- ========================================================================================
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_orcamento_um_por_familia') IS NULL THEN
    RAISE EXCEPTION 'guarda: o indice orcamentista_orcamento_um_por_familia (20261123000002) nao existe no banco %: aplique a 20261123000002 antes. Nada foi alterado.', current_database();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_orcamento_um_por_familia'
                  AND indexdef = 'CREATE UNIQUE INDEX orcamentista_orcamento_um_por_familia ON public.orcamentista_orcamento USING btree (levantamento_id, COALESCE(familia, ''''::text)) WHERE (levantamento_id IS NOT NULL)') THEN
    RAISE EXCEPTION 'guarda: o indice orcamentista_orcamento_um_por_familia existe com outra definicao. Nada foi alterado.';
  END IF;
END
$guarda$;

DROP INDEX IF EXISTS public.orcamentista_orcamento_um_por_levantamento;

DO $verifica$
BEGIN
  IF to_regclass('public.orcamentista_orcamento_um_por_levantamento') IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: o indice de antes continua';
  END IF;
  IF to_regclass('public.orcamentista_orcamento_um_por_familia') IS NULL THEN
    RAISE EXCEPTION 'verificacao 2: o indice por familia sumiu';
  END IF;
END
$verifica$;

COMMIT;
