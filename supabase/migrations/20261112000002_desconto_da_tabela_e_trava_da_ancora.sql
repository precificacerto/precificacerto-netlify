-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261112000002 — o DESCONTO da tabela do fornecedor e a TRAVA da âncora do custo, por conta.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261112000002_desconto_da_tabela_e_trava_da_ancora.
-- ║ NENHUM NÚMERO SE MOVE: a trava nasce DESLIGADA em toda conta, e com ela desligada o motor lê
-- ║ exatamente o que lê hoje. As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 12/11/2026: a âncora do custo é o VALOR BRUTO PÓS-DESCONTO,
-- por metro, sem IPI, e ela é DERIVADA, nunca gravada:
--     âncora por barra = valor_metro_12 * medida_barra_m * (1 - desconto_pct / 100)
-- `valor_metro_12` e `medida_barra_m` já são escritos pela importação a partir do arquivo do fornecedor.
-- O desconto é UM POR TABELA (na planilha da Wolff, a célula I9, uma só para o pedido inteiro) — por isso
-- mora em `orcamentista_tabela`, e não no item.
--
-- POR QUE NÃO EM `orcamentista_tabela_item` (o erro que o dono do produto conferiu em produção): a função
-- `importar_conteudo_da_tabela` faz `DELETE FROM public.orcamentista_tabela_item WHERE tabela_id = ...` e
-- regrava os itens com lista de colunas fixa. Coluna nova no item que a importação não escreve é apagada
-- na próxima reimportação, em silêncio (`tabela-que-a-importacao-apaga.md`). MEDIDO em 12/11/2026, lendo o
-- corpo da função em produção (md5 sem o \r d98800431ea61fede9cab6593d01f007): ela NÃO escreve em
-- `orcamentista_tabela` — a única menção é `PERFORM 1 FROM public.orcamentista_tabela WHERE id =
-- p_tabela_id FOR UPDATE`, uma trava de linha. O desconto sobrevive à reimportação.
--
-- O QUE FAZ:
--   1. `orcamentista_tabela.desconto_pct numeric NULL`, SEM DEFAULT: nasce nulo nas tabelas de hoje.
--      Nulo = não há desconto declarado, e a âncora é o bruto cheio. CHECK: nulo, ou de 0 a menos de 100
--      (100% daria âncora zero, e zero não é "sem preço").
--   2. `orcamentista_config.ancora_do_custo_ligada boolean NOT NULL DEFAULT false`: a TRAVA, por conta.
--      Nasce FALSA em toda conta, e nenhuma linha recebe verdadeiro aqui. Ligada, o motor passa a ler o
--      bruto da âncora derivada; desligada, lê o que lê hoje. Quem liga é o super admin, pela rota que
--      confere antes a cobertura (os 549 códigos do motor com âncora) — nunca esta migração.
--   NADA é preenchido por regra, fórmula ou divisão de coluna: nenhum UPDATE de dado.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS; a CHECK só se não existe.
-- GUARDA (aborta): as duas tabelas existem; uma das colunas já existente com outro tipo.
-- VERIFICAÇÃO (aborta): as colunas com o tipo, a nulidade e o default; a CHECK; nenhuma conta com a trava
-- ligada; nenhuma tabela com desconto preenchido.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  tipo text;
BEGIN
  IF to_regclass('public.orcamentista_tabela') IS NULL OR to_regclass('public.orcamentista_config') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_tabela ou public.orcamentista_config. Nada foi alterado.';
  END IF;
  SELECT udt_name INTO tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela' AND column_name = 'desconto_pct';
  IF tipo IS NOT NULL AND tipo <> 'numeric' THEN
    RAISE EXCEPTION 'orcamentista_tabela.desconto_pct ja existe com o tipo %, e devia ser numeric. Nada foi alterado.', tipo;
  END IF;
  SELECT udt_name INTO tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_config' AND column_name = 'ancora_do_custo_ligada';
  IF tipo IS NOT NULL AND tipo <> 'bool' THEN
    RAISE EXCEPTION 'orcamentista_config.ancora_do_custo_ligada ja existe com o tipo %, e devia ser boolean. Nada foi alterado.', tipo;
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_tabela ADD COLUMN IF NOT EXISTS desconto_pct numeric NULL;
ALTER TABLE public.orcamentista_config ADD COLUMN IF NOT EXISTS ancora_do_custo_ligada boolean NOT NULL DEFAULT false;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_tabela') AND conname = 'orcamentista_tabela_desconto_pct_faixa') THEN
    ALTER TABLE public.orcamentista_tabela ADD CONSTRAINT orcamentista_tabela_desconto_pct_faixa
      CHECK (desconto_pct IS NULL OR (desconto_pct >= 0 AND desconto_pct < 100));
  END IF;
END
$check$;

COMMENT ON COLUMN public.orcamentista_tabela.desconto_pct IS
  'O desconto do fornecedor, um por tabela, em % (20261112000002). Nulo = nao ha desconto declarado: a ancora e o bruto cheio. A ancora por barra = valor_metro_12 * medida_barra_m * (1 - desconto_pct/100), derivada, nunca gravada.';
COMMENT ON COLUMN public.orcamentista_config.ancora_do_custo_ligada IS
  'A trava da ancora do custo (20261112000002): falsa, o motor le o bruto como sempre; verdadeira, le a ancora derivada (valor_metro_12 * medida * (1 - desconto)). Nasce falsa; so liga com a cobertura de todos os codigos do motor.';

DO $verifica$
DECLARE
  c record;
  n int;
BEGIN
  SELECT data_type, is_nullable, column_default INTO c FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela' AND column_name = 'desconto_pct';
  IF c IS NULL OR c.data_type <> 'numeric' OR c.is_nullable <> 'YES' OR c.column_default IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_tabela.desconto_pct devia ser numeric, nula e sem default. Nada foi alterado.';
  END IF;
  SELECT data_type, is_nullable, column_default INTO c FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_config' AND column_name = 'ancora_do_custo_ligada';
  IF c IS NULL OR c.data_type <> 'boolean' OR c.is_nullable <> 'NO' OR c.column_default IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_config.ancora_do_custo_ligada devia ser boolean, NOT NULL, default false. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_tabela') AND conname = 'orcamentista_tabela_desconto_pct_faixa'
                    AND pg_get_constraintdef(oid) = 'CHECK (((desconto_pct IS NULL) OR ((desconto_pct >= (0)::numeric) AND (desconto_pct < (100)::numeric))))') THEN
    RAISE EXCEPTION 'verificacao 3: a CHECK orcamentista_tabela_desconto_pct_faixa ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_config WHERE ancora_do_custo_ligada;
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 4: % conta(s) com a trava da ancora ligada; a migracao nao liga nenhuma. Nada foi alterado.', n;
  END IF;
  RAISE NOTICE 'orcamentista_tabela.desconto_pct (numeric, nula, sem default, 0 a <100) e orcamentista_config.ancora_do_custo_ligada (boolean, default false, nenhuma ligada).';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and ((table_name = 'orcamentista_tabela' and column_name = 'desconto_pct')
--     or (table_name = 'orcamentista_config' and column_name = 'ancora_do_custo_ligada'));
-- -- esperado: desconto_pct numeric YES nulo; ancora_do_custo_ligada boolean NO false
-- select count(*) filter (where ancora_do_custo_ligada) ligadas, count(*) contas from orcamentista_config;
-- -- esperado: ligadas = 0
