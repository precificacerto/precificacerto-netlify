-- 20261116000001_aproveitamento_pelo_consumo_do_item.sql
--
-- A DECISAO DO DONO DO PRODUTO, 16/11/2026, registrada como foi dita:
--   "o consumo de barras de cada item ele vai gerar um consumo por aproveitamento. E e isso que tem que ser levado em
--    consideracao na hora de encontrar o custo. [...] Posteriormente a isso, a gente faz o relatorio de barras de cada
--    pedido. [...] pode haver um aproveitamento onde a barra de 6 metros pode ser dividido em 2 ou 3 tipologias,
--    dependendo do consumo de cada perfil. [...] quando a gente faz a criacao, a concepcao do orcamento, ele deve
--    considerar SOMENTE O CONSUMO, porque ele nao sabe ainda se ocorrera o aproveitamento."
--
-- O QUE MUDA: o custo do orcamento deixa de cobrar BARRA INTEIRA rateada entre os itens e passa a cobrar os METROS
-- CONSUMIDOS por cada item. O aproveitamento real (uma barra servindo duas ou tres tipologias) e do RELATORIO DE BARRAS
-- do pedido, depois do fechamento -- o orcamento nao o conhece e por isso nao o antecipa, nem para mais nem para menos.
-- Isso REVOGA, para o orcamento, a origem `fallback_barra_inteira` (decisao de 09/11/2026).
--
-- O QUE MUDA NO BANCO: so a lista de valores de `orcamentista_orcamento.aproveitamento_origem`, que ganha
-- 'consumo_do_item'; e a CHECK do fallback passa a exigir o modo 'SEM' tambem para ela (o orcamento segue SEM
-- aproveitamento entre tipologias -- ele apenas nao cobra a sobra).
--
-- Nao altera dado nenhum. Nao apaga nada. Os orcamentos ja gravados com 'fallback_barra_inteira' ficam como estao:
-- nada se recalcula para tras.

ALTER TABLE public.orcamentista_orcamento
  DROP CONSTRAINT IF EXISTS orcamentista_orcamento_aproveitamento_origem_valida;
ALTER TABLE public.orcamentista_orcamento
  ADD CONSTRAINT orcamentista_orcamento_aproveitamento_origem_valida
  CHECK (aproveitamento_origem IS NULL OR aproveitamento_origem = ANY (ARRAY[
    'base_de_conhecimento'::text, 'alterado_no_orcamento'::text, 'fallback_barra_inteira'::text, 'consumo_do_item'::text]));

ALTER TABLE public.orcamentista_orcamento
  DROP CONSTRAINT IF EXISTS orcamentista_orcamento_aproveitamento_fallback;
ALTER TABLE public.orcamentista_orcamento
  ADD CONSTRAINT orcamentista_orcamento_aproveitamento_fallback
  CHECK (aproveitamento_origem NOT IN ('fallback_barra_inteira', 'consumo_do_item') OR aproveitamento_modo = 'SEM');

DO $verifica$
DECLARE v_origem text; v_fb text; v_antigos bigint; BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_origem FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_orcamento'::regclass AND conname = 'orcamentista_orcamento_aproveitamento_origem_valida';
  SELECT pg_get_constraintdef(oid) INTO v_fb FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_orcamento'::regclass AND conname = 'orcamentista_orcamento_aproveitamento_fallback';
  IF v_origem IS NULL OR v_fb IS NULL THEN RAISE EXCEPTION 'uma das CHECKs do aproveitamento nao existe depois do ALTER.'; END IF;
  IF position('consumo_do_item' in v_origem) = 0 THEN RAISE EXCEPTION 'a CHECK da origem nao aceita consumo_do_item: %', v_origem; END IF;
  IF position('consumo_do_item' in v_fb) = 0 THEN RAISE EXCEPTION 'a CHECK do fallback nao alcanca consumo_do_item: %', v_fb; END IF;
  -- os tres valores de antes continuam valendo: nada do que esta gravado deixa de passar
  IF position('base_de_conhecimento' in v_origem) = 0 OR position('alterado_no_orcamento' in v_origem) = 0
     OR position('fallback_barra_inteira' in v_origem) = 0 THEN
    RAISE EXCEPTION 'a CHECK da origem perdeu um valor de antes: %', v_origem;
  END IF;
  SELECT count(*) INTO v_antigos FROM public.orcamentista_orcamento WHERE aproveitamento_origem = 'fallback_barra_inteira';
  RAISE NOTICE 'origem aceita consumo_do_item; % orcamento(s) com fallback_barra_inteira intactos.', v_antigos;
END $verifica$;
