-- 20261116000002_versao_do_calculo_no_orcamento.sql
--
-- O DEFEITO, medido na conversa da De Paula em 16/11/2026 (mensagens gravadas, 12:14:38 e 12:26:41 UTC):
--   "O orcamento 6 ja esta atualizado: nada mudou no levantamento desde a ultima vez. O arquivo dele vai de novo."
-- O orcamento 6 tinha sido calculado as 10:44:56 UTC, com a regra ANTIGA (barra inteira rateada); a regra nova
-- (consumo do item, 20261116000001) entrou em producao as 12:04:06 UTC. O levantamento de fato nao mudou -- mas o
-- CALCULO ficou obsoleto, e o agente afirmou "atualizado" e reenviou o PDF velho, com R$ 92,9 milhoes.
--
-- A CAUSA: a regra do "sim sem mudanca" (13/11/2026) compara o LEVANTAMENTO. Nada registrava com QUE VERSAO DAS
-- REGRAS um calculo foi feito, entao uma mudanca no motor de custo passava despercebida.
--
-- A CORRECAO: `calculo_versao` guarda a versao das regras de custo com que o orcamento foi calculado. O "sim sem
-- mudanca" so vale quando a versao gravada e a de hoje; sendo outra (ou NULA, que e "de antes"), RECALCULA.
--
-- NULA e o estado de todo orcamento ja gravado: eles foram calculados antes desta coluna existir, e por isso devem
-- mesmo recalcular no proximo pedido. Nada se recalcula sozinho e nada e alterado aqui -- so a coluna nasce.

ALTER TABLE public.orcamentista_orcamento
  ADD COLUMN IF NOT EXISTS calculo_versao text;

COMMENT ON COLUMN public.orcamentista_orcamento.calculo_versao IS
  'A versao das regras de custo com que este orcamento foi calculado (VERSAO_DO_CALCULO, custo-do-orcamento.ts). Nula = calculado antes de 16/11/2026: o proximo pedido recalcula.';

ALTER TABLE public.orcamentista_orcamento
  DROP CONSTRAINT IF EXISTS orcamentista_orcamento_calculo_versao_forma;
ALTER TABLE public.orcamentista_orcamento
  ADD CONSTRAINT orcamentista_orcamento_calculo_versao_forma
  CHECK (calculo_versao IS NULL OR (calculo_versao ~ '^\S(.*\S)?$' AND char_length(calculo_versao) <= 40));

DO $verifica$
DECLARE v_tipo text; v_nulo text; v_check text; v_linhas bigint; v_preenchidas bigint; BEGIN
  SELECT data_type, is_nullable INTO v_tipo, v_nulo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'calculo_versao';
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'a coluna calculo_versao nao existe depois do ALTER.'; END IF;
  IF v_tipo <> 'text' OR v_nulo <> 'YES' THEN RAISE EXCEPTION 'calculo_versao saiu como % / nula=%: esperado text e nula.', v_tipo, v_nulo; END IF;
  SELECT pg_get_constraintdef(oid) INTO v_check FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_orcamento'::regclass AND conname = 'orcamentista_orcamento_calculo_versao_forma';
  IF v_check IS NULL THEN RAISE EXCEPTION 'a CHECK da forma de calculo_versao nao existe.'; END IF;
  -- a coluna NASCE VAZIA: esta migracao nao preenche nada, e todo orcamento de antes recalcula no proximo pedido
  SELECT count(*), count(calculo_versao) INTO v_linhas, v_preenchidas FROM public.orcamentista_orcamento;
  IF v_preenchidas <> 0 THEN RAISE EXCEPTION 'calculo_versao ja veio preenchida em % de % linhas: esta migracao nao preenche nada.', v_preenchidas, v_linhas; END IF;
  RAISE NOTICE 'calculo_versao criada, nula em % orcamento(s) -- todos recalculam no proximo pedido.', v_linhas;
END $verifica$;
