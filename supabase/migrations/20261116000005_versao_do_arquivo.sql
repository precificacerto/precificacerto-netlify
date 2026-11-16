-- 20261116000005_versao_do_arquivo.sql
--
-- O DEFEITO, MEDIDO em 16/11/2026 (dono do produto: "O orcamento que eu acabei de receber sendo atualizado nao veio
-- com imagens, as observacoes nao estao de acordo com o solicitado"):
--
--   o PDF mais novo do orcamento 6 da De Paula foi gerado em 16/11 as 14:05:23 UTC;
--   o deploy dos DESENHOS importados (PR #283) foi as 16:33:05 UTC;
--   o deploy das OBSERVACOES (PR #284) foi as 17:52:22 UTC;
--   as 18:00:52 o vendedor pediu "quero ele precificado e atualizado", e as 18:01:10 o agente respondeu
--   "O orcamento 6 ja esta atualizado: nada mudou no levantamento desde a ultima vez. O arquivo dele vai de novo."
--
-- Ou seja: o arquivo que ele recebeu as 18:01 e o de 14:05 -- 2h28 antes dos desenhos e 3h47 antes das observacoes.
-- Nao e o PDF que esta errado: e o REENVIO, que manda o arquivo guardado sem perguntar se ele ainda e o de hoje.
--
-- A CLASSE e a mesma do `calculo_versao` (20261116000002): o CALCULO tem versao e o pedido seguinte recalcula quando
-- ela muda; o ARQUIVO nao tinha nenhuma, e por isso um PDF de outro desenho continua sendo reenviado para sempre. E o
-- caminho do "sem mudanca" e justamente o que NUNCA regenera.
--
-- O QUE ESTA MIGRACAO FAZ: a coluna `orcamentista_orcamento_arquivo.arquivo_versao` (texto, NULA = gerado antes de a
-- versao existir, isto e, de OUTRA versao). Nenhum dado alterado: a coluna nasce nula em todas as linhas, e as linhas
-- de antes ficam nulas de proposito -- e isso que faz o proximo pedido regerar o arquivo delas.
--
-- O QUE ELA NAO FAZ: nao recalcula nada. A regeneracao do PDF usa os NUMEROS JA GRAVADOS (a operacao interna, a venda
-- e o rateio dos custos liquidos gravados), porque nada mudou no levantamento -- "nada se recalcula para tras".
--
-- QUEM APAGA E REGRAVA `orcamentista_orcamento_arquivo` (`tabela-que-a-importacao-apaga.md`, o corolario aplicavel
-- ANTES): PROCURADO em 16/11/2026, em `src/` e nas funcoes do banco -- NINGUEM. A tabela e SO INSERCAO, com historico
-- (20261109000005): gerar de novo e outra linha, e e por isso que a coluna nova nao tem quem a apague.

ALTER TABLE public.orcamentista_orcamento_arquivo ADD COLUMN IF NOT EXISTS arquivo_versao text;

COMMENT ON COLUMN public.orcamentista_orcamento_arquivo.arquivo_versao IS
  'A versao do DESENHO do arquivo (dono do produto, 16/11/2026): o reenvio do "sem mudanca" rege o PDF quando a gravada difere da de hoje. NULA = gerado antes da versao existir, logo de outra versao.';

DO $verifica$
DECLARE v_tipo text; v_nulas bigint; v_total bigint; BEGIN
  SELECT c.data_type INTO v_tipo FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'orcamentista_orcamento_arquivo' AND c.column_name = 'arquivo_versao';
  IF v_tipo IS DISTINCT FROM 'text' THEN RAISE EXCEPTION 'a coluna nao e text: %', coalesce(v_tipo, '(ausente)'); END IF;

  SELECT count(*) FILTER (WHERE arquivo_versao IS NULL), count(*) INTO v_nulas, v_total FROM public.orcamentista_orcamento_arquivo;
  IF v_nulas <> v_total THEN
    RAISE EXCEPTION 'ha linha com arquivo_versao preenchida logo depois do ALTER: % de %', v_total - v_nulas, v_total;
  END IF;
  RAISE NOTICE 'arquivo_versao criada; % arquivos de antes ficam NULOS e serao regerados no proximo pedido.', v_total;
END $verifica$;
