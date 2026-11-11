-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261110000001 — a OPERAÇÃO INTERNA do orçamento I.A.: o número sobre o qual o cliente paga, gravado junto com o valor de venda, para
-- que o arquivo "Orçamento" reparta o preço pelos itens sem recalcular nada.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto. Pressupõe a 20261109000001 a
-- ║ 20261109000005 aplicadas.
-- ║ Ao aplicar fora do CLI, o `name` da migração é 20261110000001_orcamento_ia_operacao_interna.
-- ║ SÓ ACRESCENTA 1 COLUNA e 3 CHECKs em orcamentista_orcamento. A coluna é NULA e SEM DEFAULT:
-- ║ nenhuma linha é inserida, alterada ou apagada; nada sai. NÃO CRIA FUNÇÃO NEM TIPO e NÃO
-- ║ MEXE EM GRANT. A guarda aborta se algum orçamento já tiver valor de venda: a CHECK de
-- ║ nulidade o recusaria, e preencher a interna dele seria recalcular para trás.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 10/11/2026: "DECISÃO: opção 1, a coluna nova. A 3 está fora pelo motivo que você deu — é o
-- fato-vs-referencia que já recusamos três vezes. A 2 perde porque o coeficiente é derivação, a soma só fecha depois de ratear, e ela NÃO
-- guarda o número que a tela mostrou: sem ele não há como provar que o arquivo é o preço que a pessoa viu."
--
-- QUAL DOS DOIS NÚMEROS DA TELA — medido em 10/11/2026 no componente real, com o produto 1008 de produção (a fixture reproduziu os seis
-- valores da tela ao centavo antes de ser usada):
--   - a coluna guarda a "Total Operação Interna": `baseForSalePrice`, product-price.component.tsx:423, desenhado na :1030. É a base do
--     preço final: final = interna + despesas acessórias + tributos por fora (14.164,74 + 1.200,00 + 1.817,73 = 17.182,47 no 1008);
--   - o "Valor do produto precificado" (`valorPrecificado`, :371) só diverge dele quando a matriz NÃO governou o preço (no 1008, os
--     acréscimos legados do cadastro, product-price-construction.ts:227). No orçamento I.A. os acréscimos nascem 0 e a matriz governa: os
--     dois são o mesmo número. Quando não forem, o salvar RECUSA nomeando a divergência (decisão do dono do produto, 10/11/2026) — nenhum
--     dos dois serve.
--
-- O QUE FAZ, em `orcamentista_orcamento`:
--   - `valor_operacao_interna numeric NULL`, gravada pelo salvar da precificação JUNTO com `valor_venda`;
--   - `orcamentista_orcamento_operacao_interna_com_a_venda`: as duas são nulas juntas ou preenchidas juntas — um valor de venda sem a
--     interna não reparte entre os itens, e uma interna sem venda não é preço;
--   - `orcamentista_orcamento_operacao_interna_na_faixa`: 0 < interna <= round(venda, 2). A venda é a interna MAIS os tributos por fora,
--     que nunca são negativos (a invariante `precoFinalAbaixoDaInterna` da tela). O teto é a venda ARREDONDADA, não a crua: a interna
--     está em centavos e a venda não, e o arquivo compara os dois em centavos — "tributos por fora" = round(venda, 2) − interna, que
--     assim nunca sai negativo (dono do produto, 10/11/2026: "A na_faixa ainda compara a interna arredondada com a venda crua");
--   - `orcamentista_orcamento_operacao_interna_ao_centavo`: a interna tem no máximo duas casas. O rateio por item fecha com ela EXATO,
--     sem tolerância, e só fecha exato contra um número em centavos. (A venda continua gravada sem arredondar, como hoje; o arquivo a
--     arredonda ao centavo, e a linha "tributos por fora" é a venda arredondada menos a interna.)
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS e cada CHECK só se o nome não existe; a verificação confere a forma.
-- GUARDA (aborta): orcamentista_orcamento existe com valor_venda (a 20261109000002) e a tabela do arquivo existe (a 20261109000005); o
--   orçamento tem 28 colunas e as duas tabelas 49 constraints (o estado conferido pelo dono do produto depois da 0005); e NENHUM orçamento
--   tem valor_venda preenchido.
-- VERIFICAÇÃO (aborta): a coluna numeric, nula e sem default; as três CHECKs com a definição (a na_faixa com o round da venda); 29 colunas no orçamento; 52 constraints nas
--   duas tabelas (49 + 3); nenhum grant a anon, authenticated ou PUBLIC; o service_role ainda só com INSERT, SELECT e UPDATE.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'valor_venda') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento.valor_venda (a migracao 20261109000002). Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_orcamento_arquivo') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento_arquivo (a migracao 20261109000005). Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
     AND column_name <> 'valor_operacao_interna';
  IF n <> 28 THEN
    RAISE EXCEPTION 'guarda: orcamentista_orcamento tem % coluna(s) alem da nova, e devia ter 28. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'))
     AND conname NOT LIKE 'orcamentista_orcamento_operacao_interna_%';
  IF n <> 49 THEN
    RAISE EXCEPTION 'guarda: orcamentista_orcamento e orcamentista_orcamento_item tem % constraint(s) alem das novas, e deviam ter 49. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_orcamento WHERE valor_venda IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'guarda: % orcamento(s) ja tem valor_venda; a interna deles nao e recalculada para tras. Nada foi alterado.', n;
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_orcamento
  ADD COLUMN IF NOT EXISTS valor_operacao_interna numeric NULL;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_operacao_interna_com_a_venda') THEN
    ALTER TABLE public.orcamentista_orcamento
      ADD CONSTRAINT orcamentista_orcamento_operacao_interna_com_a_venda
      CHECK ((valor_operacao_interna IS NULL) = (valor_venda IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_operacao_interna_na_faixa') THEN
    ALTER TABLE public.orcamentista_orcamento
      ADD CONSTRAINT orcamentista_orcamento_operacao_interna_na_faixa
      CHECK ((valor_operacao_interna IS NULL) OR ((valor_operacao_interna > 0) AND (valor_operacao_interna <= round(valor_venda, 2))));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_operacao_interna_ao_centavo') THEN
    ALTER TABLE public.orcamentista_orcamento
      ADD CONSTRAINT orcamentista_orcamento_operacao_interna_ao_centavo
      CHECK ((valor_operacao_interna IS NULL) OR (valor_operacao_interna = round(valor_operacao_interna, 2)));
  END IF;
END
$check$;

COMMENT ON COLUMN public.orcamentista_orcamento.valor_operacao_interna IS
  'A operacao interna do preco (Total Operacao Interna da tela), gravada com valor_venda. O arquivo reparte ESTE numero pelos itens; a diferenca ate a venda arredondada sao os tributos por fora.';

DO $verifica$
DECLARE
  faltam text;
  n      int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
                  AND column_name = 'valor_operacao_interna' AND data_type = 'numeric' AND numeric_precision IS NULL
                  AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 1: valor_operacao_interna ausente ou com outra forma (numeric, nula, sem default). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_operacao_interna_com_a_venda'
                  AND pg_get_constraintdef(oid) = 'CHECK (((valor_operacao_interna IS NULL) = (valor_venda IS NULL)))') THEN
    faltam := concat_ws('; ', faltam, 'com_a_venda');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_operacao_interna_na_faixa'
                  AND pg_get_constraintdef(oid) = 'CHECK (((valor_operacao_interna IS NULL) OR ((valor_operacao_interna > (0)::numeric) AND (valor_operacao_interna <= round(valor_venda, 2)))))') THEN
    faltam := concat_ws('; ', faltam, 'na_faixa');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_operacao_interna_ao_centavo'
                  AND pg_get_constraintdef(oid) = 'CHECK (((valor_operacao_interna IS NULL) OR (valor_operacao_interna = round(valor_operacao_interna, 2))))') THEN
    faltam := concat_ws('; ', faltam, 'ao_centavo');
  END IF;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 2: CHECK ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'));
  IF n <> 52 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_orcamento e orcamentista_orcamento_item tem % constraint(s), e deviam ter 52. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento';
  IF n <> 29 THEN
    RAISE EXCEPTION 'verificacao 4: orcamentista_orcamento tem % coluna(s), e devia ter 29. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 5: % grant(s) a anon, authenticated ou PUBLIC em orcamentista_orcamento. Nada foi alterado.', n;
  END IF;
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO faltam FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND grantee = 'service_role';
  IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'verificacao 6: service_role em orcamentista_orcamento tem %, e devia ter INSERT,SELECT,UPDATE. Nada foi alterado.', faltam;
  END IF;
  RAISE NOTICE 'orcamentista_orcamento: valor_operacao_interna, nula e sem default, com as tres CHECKs; 29 colunas e 52 constraints nas duas tabelas.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_orcamento' and column_name = 'valor_operacao_interna';
-- -- esperado: numeric, YES, null
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname like 'orcamentista_orcamento_operacao_interna_%' order by 1;
-- -- esperado: as 3 (ao_centavo, com_a_venda, na_faixa)
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orcamentista_orcamento';
-- -- esperado: 29
-- select count(*) from pg_constraint where conrelid in ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass);
-- -- esperado: 52
