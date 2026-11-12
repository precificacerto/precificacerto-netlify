-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261112000001 — a fotografia da RESOLUÇÃO DE REFERÊNCIA no material do orçamento I.A.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261112000001_fotografia_da_resolucao.
-- ║ SEM ELA o código não quebra: o material é gravado sem as duas colunas (o PostgREST recusa a
-- ║ coluna, e o código regrava sem ela), e o resultado do cálculo diz `fotografia_da_resolucao:
-- ║ sem_migracao`. As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 12/11/2026: "O RESULTADO DIZ COMO ACHOU: exato, sufixo do
-- fornecedor, cor, aproximado-com-descrição, ou não achado. O cálculo grava isso na fotografia do
-- material, para depois dar para auditar como cada preço foi parar ali." O material guarda o código
-- DO MOTOR (`codigo`); falta o código do item na tabela de onde veio o preço e o degrau da resolução.
--
-- O QUE FAZ:
--   1. `orcamentista_orcamento_item_material.codigo_na_tabela text NULL` — o código do item na tabela.
--   2. `orcamentista_orcamento_item_material.resolucao text NULL`, CHECK na lista fechada dos quatro
--      degraus (`resolucao-de-referencia.ts`, `COMO_ACHOU`). "Não achado" não existe aqui: sem item, o
--      cálculo recusa e nada é gravado.
--   As duas NULAS e SEM DEFAULT: as linhas de antes (calculadas antes desta migração) ficam nulas —
--   "não registrado", nunca um degrau inventado (`ausente-vs-falso.md`). Nenhuma linha é alterada.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, a CHECK só se não existe.
-- GUARDA (aborta): a tabela existe; uma das colunas já existente com outro tipo.
-- VERIFICAÇÃO (aborta): as duas colunas text, nulas, sem default; a CHECK com a definição.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  c record;
BEGIN
  IF to_regclass('public.orcamentista_orcamento_item_material') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_orcamento_item_material (20261109000003). Nada foi alterado.';
  END IF;
  FOR c IN SELECT column_name, udt_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item_material'
              AND column_name IN ('codigo_na_tabela', 'resolucao') LOOP
    IF c.udt_name <> 'text' THEN
      RAISE EXCEPTION 'orcamentista_orcamento_item_material.% ja existe com o tipo %, e devia ser text. Nada foi alterado.', c.column_name, c.udt_name;
    END IF;
  END LOOP;
END
$guarda$;

ALTER TABLE public.orcamentista_orcamento_item_material ADD COLUMN IF NOT EXISTS codigo_na_tabela text NULL;
ALTER TABLE public.orcamentista_orcamento_item_material ADD COLUMN IF NOT EXISTS resolucao text NULL;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_orcamento_item_material') AND conname = 'orcamentista_orcamento_item_material_resolucao_check') THEN
    ALTER TABLE public.orcamentista_orcamento_item_material ADD CONSTRAINT orcamentista_orcamento_item_material_resolucao_check
      CHECK (resolucao IN ('exato', 'sufixo_do_fornecedor', 'cor', 'aproximado_com_descricao'));
  END IF;
END
$check$;

COMMENT ON COLUMN public.orcamentista_orcamento_item_material.codigo_na_tabela IS
  'O codigo do item na tabela de preco de onde veio o preco (20261112000001). Nulo no material calculado antes desta migracao.';
COMMENT ON COLUMN public.orcamentista_orcamento_item_material.resolucao IS
  'Como a resolucao de referencia achou o item pelo codigo do motor: exato, sufixo_do_fornecedor, cor ou aproximado_com_descricao (20261112000001). Nulo antes desta migracao.';

DO $verifica$
DECLARE
  c   record;
  n   int := 0;
BEGIN
  FOR c IN SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item_material'
              AND column_name IN ('codigo_na_tabela', 'resolucao') LOOP
    IF c.data_type <> 'text' OR c.is_nullable <> 'YES' OR c.column_default IS NOT NULL THEN
      RAISE EXCEPTION 'verificacao 1: orcamentista_orcamento_item_material.% devia ser text, nula e sem default. Nada foi alterado.', c.column_name;
    END IF;
    n := n + 1;
  END LOOP;
  IF n <> 2 THEN
    RAISE EXCEPTION 'verificacao 1: achei % das 2 colunas. Nada foi alterado.', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_orcamento_item_material')
                    AND conname = 'orcamentista_orcamento_item_material_resolucao_check'
                    AND pg_get_constraintdef(oid) = 'CHECK ((resolucao = ANY (ARRAY[''exato''::text, ''sufixo_do_fornecedor''::text, ''cor''::text, ''aproximado_com_descricao''::text])))') THEN
    RAISE EXCEPTION 'verificacao 2: a CHECK orcamentista_orcamento_item_material_resolucao_check ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'orcamentista_orcamento_item_material.codigo_na_tabela e .resolucao (text, nulas, sem default) e a CHECK dos quatro degraus.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_orcamento_item_material'
--    and column_name in ('codigo_na_tabela', 'resolucao');
-- -- esperado: 2 linhas, text, YES, nulo
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_orcamento_item_material'::regclass and conname like '%resolucao%';
-- -- esperado: a CHECK dos quatro degraus
