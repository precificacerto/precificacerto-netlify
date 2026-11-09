-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261109000004 — o BLOCO FISCAL do orçamento I.A.: o NCM, o escopo da venda e o tipo de comprador, que a precificação final lê.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto. Pressupõe a 20261109000001, a
-- ║ 20261109000002 e a 20261109000003 aplicadas.
-- ║ Ao aplicar fora do CLI, o `name` da migração é 20261109000004_orcamento_ia_fiscal.
-- ║ SÓ ACRESCENTA 3 COLUNAS E 1 CHECK em orcamentista_orcamento, todas NULAS e SEM DEFAULT:
-- ║ nenhuma linha é inserida, alterada ou apagada; nada sai.
-- ║ NÃO CRIA FUNÇÃO NEM TIPO e NÃO MEXE EM GRANT: os dois campos de escolha usam os tipos que
-- ║ JÁ existem em produção (public.sale_scope e public.buyer_type_enum, os de pricing_calculations).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 09/11/2026 (decisão 1 do cabeçalho): "código = o número do orçamento; tipo, unidade e seção fixos e só
-- leitura: Produzido, UN, Orçamentos I.A.; migração pequena e pendente acrescentando ncm_code, sale_scope e buyer_type ao orçamento, NULOS
-- e sem default; SEM NCM, a precificação final RECUSA nomeando a falta. Nunca zerar o PIS/COFINS: num tenant de Lucro Real ele é 9,25% por
-- dentro, e zerá-lo deixa o denominador 9,25 pontos curto."
--
-- O QUE FAZ, em `orcamentista_orcamento`:
--   - `ncm_code text NULL`, com a CHECK `orcamentista_orcamento_ncm_forma`: o NCM inteiro na forma da tabela `ncm_codes`
--     (`0000.00.00`, medida em produção em 09/11/2026), que é por onde a precificação busca o PIS/COFINS não cumulativo. Nulo é "não
--     informado" — e a precificação recusa; nunca vira 0.
--   - `sale_scope public.sale_scope NULL` (INTRAESTADUAL | INTERESTADUAL) e `buyer_type public.buyer_type_enum NULL` (CONSUMIDOR_FINAL |
--     CONTRIBUINTE_PJ): os MESMOS tipos que `pricing_calculations` usa — um domínio só, nenhuma lista copiada.
--   NOTA, sem efeito aqui: a venda interestadual também pede a UF de destino (a tela de Produtos a manda ao motor). Ela não está nesta
--   migração porque não foi pedida; se a precificação do orçamento precisar dela, é uma coluna a mais, em migração própria.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS e a CHECK só se o nome não existe; a verificação confere a forma.
-- GUARDA (aborta): orcamentista_orcamento existe com valor_venda (a 20261109000002), e os dois tipos existem com EXATAMENTE os rótulos
--   medidos — um tipo com outro rótulo mudaria o domínio sem ninguém ver.
-- VERIFICAÇÃO (aborta): as três colunas com o tipo, nulas e sem default; a CHECK com a definição; 45 constraints nas duas tabelas (44 + 1);
--   nenhum grant a anon, authenticated ou PUBLIC; o service_role ainda só com INSERT, SELECT e UPDATE.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'valor_venda') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento.valor_venda (a migracao 20261109000002). Nada foi alterado.';
  END IF;
  IF (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'sale_scope' AND t.typnamespace = 'public'::regnamespace) IS DISTINCT FROM 'INTRAESTADUAL,INTERESTADUAL' THEN
    RAISE EXCEPTION 'dependencia ausente ou com outra forma: o tipo public.sale_scope (INTRAESTADUAL, INTERESTADUAL). Nada foi alterado.';
  END IF;
  IF (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'buyer_type_enum' AND t.typnamespace = 'public'::regnamespace) IS DISTINCT FROM 'CONSUMIDOR_FINAL,CONTRIBUINTE_PJ' THEN
    RAISE EXCEPTION 'dependencia ausente ou com outra forma: o tipo public.buyer_type_enum (CONSUMIDOR_FINAL, CONTRIBUINTE_PJ). Nada foi alterado.';
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_orcamento
  ADD COLUMN IF NOT EXISTS ncm_code   text                   NULL,
  ADD COLUMN IF NOT EXISTS sale_scope public.sale_scope      NULL,
  ADD COLUMN IF NOT EXISTS buyer_type public.buyer_type_enum NULL;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_ncm_forma') THEN
    ALTER TABLE public.orcamentista_orcamento
      ADD CONSTRAINT orcamentista_orcamento_ncm_forma CHECK ((ncm_code IS NULL) OR (ncm_code ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$'::text));
  END IF;
END
$check$;

COMMENT ON COLUMN public.orcamentista_orcamento.ncm_code IS
  'O NCM do orcamento, na forma da tabela ncm_codes (0000.00.00). Nulo: nao informado, e a precificacao final recusa; nunca zera o PIS/COFINS.';

DO $verifica$
DECLARE
  faltam text;
  n      int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
                  AND column_name = 'ncm_code' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    faltam := concat_ws('; ', faltam, 'ncm_code');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
                  AND column_name = 'sale_scope' AND udt_schema = 'public' AND udt_name = 'sale_scope' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    faltam := concat_ws('; ', faltam, 'sale_scope');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
                  AND column_name = 'buyer_type' AND udt_schema = 'public' AND udt_name = 'buyer_type_enum' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    faltam := concat_ws('; ', faltam, 'buyer_type');
  END IF;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: coluna ausente ou com outra forma (tipo, nula, sem default): %. Nada foi alterado.', faltam;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_ncm_forma'
                  AND pg_get_constraintdef(oid) = 'CHECK (((ncm_code IS NULL) OR (ncm_code ~ ''^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$''::text)))') THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_orcamento_ncm_forma ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'));
  IF n <> 45 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_orcamento e orcamentista_orcamento_item tem % constraint(s), e deviam ter 45. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento';
  IF n <> 27 THEN
    RAISE EXCEPTION 'verificacao 4: orcamentista_orcamento tem % coluna(s), e devia ter 27. Nada foi alterado.', n;
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
  RAISE NOTICE 'orcamentista_orcamento: ncm_code, sale_scope e buyer_type, nulas e sem default; a CHECK do NCM; 27 colunas e 45 constraints nas duas tabelas.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_orcamento' and column_name in ('ncm_code', 'sale_scope', 'buyer_type');
-- -- esperado: as 3, nulas, sem default; ncm_code text, sale_scope sale_scope, buyer_type buyer_type_enum
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_orcamento_ncm_forma';
-- select count(*) from pg_constraint
--  where conrelid in ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass);
-- -- esperado: 45
