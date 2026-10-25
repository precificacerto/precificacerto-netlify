-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261025000001 — orcamentista_pre_definicao.escolhas: as escolhas da tipologia que a conversa
-- captura (ARI, ARE, MAE na primeira versão), e que o avaliador lê no levantamento
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Ao aplicar fora do CLI, o `name` da migração é o nome completo
-- ║ deste arquivo, sem a extensão: 20261025000001_escolhas_na_pre_definicao.
-- ║ ORDEM (`migration-delivery.md`): APLICAR ANTES DO MERGE do PR que a traz. O código novo LÊ e
-- ║ GRAVA a coluna em toda mensagem da conversa: mergeado sem ela, a conversa inteira para, com
-- ║ "column orcamentista_pre_definicao.escolhas does not exist" no log.
-- ║ O arquivo é ASCII nas partes que executam; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- A COLUNA
--   escolhas jsonb, NULÁVEL e SEM DEFAULT. Um objeto { "VARIAVEL": numero_da_opcao }, por exemplo
--   {"ARI": 4, "ARE": 1, "MAE": 2}. NULL é "nenhuma escolha capturada ainda" — e não "{}", que
--   afirmaria que a conversa já perguntou e não houve resposta (`ausente-vs-falso.md`).
--   CHECK: quando não é NULL, é um OBJETO JSON. O que vai dentro (quais variáveis, quais opções)
--   é validado pelo código contra a aba Variáveis da tipologia, que muda por tipologia e por
--   tabela do fornecedor: uma CHECK com a lista de variáveis envelheceria no primeiro arquivo novo.
--
-- O QUE NÃO FAZ: não toca nenhuma linha existente (medido em 25/10/2026: 1 linha, COMPLETA, que
-- fica com escolhas NULL), não cria índice, não mexe nas outras colunas.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS; a CHECK é criada só se não existir uma com o mesmo nome.
--
-- VERIFICAÇÃO (aborta): a coluna existe, é jsonb, aceita NULL, não tem DEFAULT, e a CHECK está lá.
-- DEPOIS DE APLICAR: NOTIFY pgrst, 'reload schema' (está no fim) e a consulta do rodapé.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE public.orcamentista_pre_definicao ADD COLUMN IF NOT EXISTS escolhas jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.orcamentista_pre_definicao'::regclass
                    AND conname = 'orcamentista_pre_definicao_escolhas_objeto') THEN
    ALTER TABLE public.orcamentista_pre_definicao
      ADD CONSTRAINT orcamentista_pre_definicao_escolhas_objeto
      CHECK (escolhas IS NULL OR jsonb_typeof(escolhas) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN public.orcamentista_pre_definicao.escolhas IS
  'As escolhas da tipologia capturadas na conversa: {"VARIAVEL": numero_da_opcao}. NULL = nenhuma capturada ainda. Validadas pelo codigo contra a aba Variaveis da tipologia.';

DO $verifica$
DECLARE
  v_tipo text;
  v_nulo text;
  v_padrao text;
BEGIN
  SELECT data_type, is_nullable, column_default INTO v_tipo, v_nulo, v_padrao
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_pre_definicao' AND column_name = 'escolhas';
  IF v_tipo IS DISTINCT FROM 'jsonb' OR v_nulo IS DISTINCT FROM 'YES' OR v_padrao IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: escolhas com tipo %, nulavel %, default % - esperado jsonb, YES, sem default. Nada foi alterado.', v_tipo, v_nulo, v_padrao;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.orcamentista_pre_definicao'::regclass
                    AND conname = 'orcamentista_pre_definicao_escolhas_objeto' AND contype = 'c') THEN
    RAISE EXCEPTION 'verificacao: a CHECK orcamentista_pre_definicao_escolhas_objeto nao existe. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'escolhas: jsonb, nulavel, sem default, com a CHECK de objeto.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_pre_definicao' and column_name = 'escolhas';
-- -- esperado: escolhas | jsonb | YES | (null)
-- select count(*), count(escolhas) from public.orcamentista_pre_definicao;
-- -- esperado em 25/10/2026: 1 | 0
