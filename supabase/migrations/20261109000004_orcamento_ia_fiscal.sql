-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261109000004 — o BLOCO FISCAL do orçamento I.A.: o NCM, o escopo da venda, a UF de destino e o tipo de comprador, que a precificação
-- final lê.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto. Pressupõe a 20261109000001, a
-- ║ 20261109000002 e a 20261109000003 aplicadas.
-- ║ Ao aplicar fora do CLI, o `name` da migração é 20261109000004_orcamento_ia_fiscal.
-- ║ SÓ ACRESCENTA 4 COLUNAS, 2 CHECKs E 1 FK em orcamentista_orcamento, todas NULAS e SEM DEFAULT:
-- ║ nenhuma linha é inserida, alterada ou apagada; nada sai.
-- ║ NÃO CRIA FUNÇÃO NEM TIPO e NÃO MEXE EM GRANT: os campos de escolha usam os domínios que JÁ
-- ║ existem em produção (public.sale_scope e public.buyer_type_enum, os de pricing_calculations, e
-- ║ public.brazilian_states(code) para a UF). A FK não altera a definição de brazilian_states: o
-- ║ Postgres só põe nela os dois gatilhos internos de integridade (RI_ConstraintTrigger_a_*), que
-- ║ barram apagar ou trocar o code de uma UF que um orçamento cita.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 09/11/2026 (decisão 1 do cabeçalho): "código = o número do orçamento; tipo, unidade e seção fixos e só
-- leitura: Produzido, UN, Orçamentos I.A.; migração pequena e pendente acrescentando ncm_code, sale_scope e buyer_type ao orçamento, NULOS
-- e sem default; SEM NCM, a precificação final RECUSA nomeando a falta. Nunca zerar o PIS/COFINS: num tenant de Lucro Real ele é 9,25% por
-- dentro, e zerá-lo deixa o denominador 9,25 pontos curto."
-- E, sobre a UF (dono do produto, 09/11/2026, antes de aplicar): "A UF DE DESTINO ENTRA AGORA, não em migração própria. [...] com
-- sale_scope podendo ser INTERESTADUAL, a alíquota de ICMS depende do par origem-destino — o banco tem icms_interstate_rates justamente
-- para isso. Sem a UF, uma venda interestadual não tem como calcular o ICMS, e a gente descobriria isso depois, com a migração já aplicada
-- e imutável."
--
-- O QUE FAZ, em `orcamentista_orcamento`:
--   - `ncm_code text NULL`, com a CHECK `orcamentista_orcamento_ncm_forma`: o NCM inteiro na forma da tabela `ncm_codes`
--     (`0000.00.00`, medida em produção em 09/11/2026), que é por onde a precificação busca o PIS/COFINS não cumulativo. Nulo é "não
--     informado" — e a precificação recusa; nunca vira 0.
--   - `sale_scope public.sale_scope NULL` (INTRAESTADUAL | INTERESTADUAL) e `buyer_type public.buyer_type_enum NULL` (CONSUMIDOR_FINAL |
--     CONTRIBUINTE_PJ): os MESMOS tipos que `pricing_calculations` usa — um domínio só, nenhuma lista copiada.
--   - `uf_destino character(2) NULL` — o tipo de `brazilian_states.code` —, com DUAS constraints:
--     `orcamentista_orcamento_uf_destino_fkey`, FK para `brazilian_states(code)` (o domínio real, que tem UNIQUE (code), medido em
--     09/11/2026: 27 UFs; nenhuma lista copiada), e `orcamentista_orcamento_uf_destino_do_escopo`, a amarração com o escopo:
--     `(sale_scope IS NOT DISTINCT FROM 'INTERESTADUAL') = (uf_destino IS NOT NULL)` — a UF é obrigatória exatamente na venda
--     INTERESTADUAL, e nula na INTRAESTADUAL e enquanto o escopo não foi definido.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS e a CHECK só se o nome não existe; a verificação confere a forma.
-- GUARDA (aborta): orcamentista_orcamento existe com valor_venda (a 20261109000002); os dois tipos existem com EXATAMENTE os rótulos
--   medidos — um tipo com outro rótulo mudaria o domínio sem ninguém ver —; e brazilian_states.code é character(2) com uma UNIQUE ou PK
--   só nela (sem isso a FK pediria alterar a tabela de referência, e essa decisão não é desta migração).
-- VERIFICAÇÃO (aborta): as quatro colunas com o tipo, nulas e sem default; as três constraints com a definição; 28 colunas no orçamento;
--   47 constraints nas duas tabelas (44 + 3: a CHECK do NCM, a FK e a CHECK da UF); nenhum grant a anon, authenticated ou PUBLIC; o
--   service_role ainda só com INSERT, SELECT e UPDATE.
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
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.brazilian_states') AND attname = 'code' AND NOT attisdropped
                  AND format_type(atttypid, atttypmod) = 'character(2)')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                     WHERE c.conrelid = to_regclass('public.brazilian_states') AND c.contype IN ('u', 'p')
                       AND array_length(c.conkey, 1) = 1 AND a.attname = 'code') THEN
    RAISE EXCEPTION 'dependencia ausente ou com outra forma: public.brazilian_states.code character(2) com UNIQUE ou PK so nela. Nada foi alterado.';
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_orcamento
  ADD COLUMN IF NOT EXISTS ncm_code   text                   NULL,
  ADD COLUMN IF NOT EXISTS sale_scope public.sale_scope      NULL,
  ADD COLUMN IF NOT EXISTS buyer_type public.buyer_type_enum NULL,
  ADD COLUMN IF NOT EXISTS uf_destino character(2)           NULL;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_ncm_forma') THEN
    ALTER TABLE public.orcamentista_orcamento
      ADD CONSTRAINT orcamentista_orcamento_ncm_forma CHECK ((ncm_code IS NULL) OR (ncm_code ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$'::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_uf_destino_fkey') THEN
    ALTER TABLE public.orcamentista_orcamento
      ADD CONSTRAINT orcamentista_orcamento_uf_destino_fkey FOREIGN KEY (uf_destino) REFERENCES public.brazilian_states(code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_uf_destino_do_escopo') THEN
    ALTER TABLE public.orcamentista_orcamento
      ADD CONSTRAINT orcamentista_orcamento_uf_destino_do_escopo
      CHECK ((sale_scope IS NOT DISTINCT FROM 'INTERESTADUAL'::public.sale_scope) = (uf_destino IS NOT NULL));
  END IF;
END
$check$;

COMMENT ON COLUMN public.orcamentista_orcamento.ncm_code IS
  'O NCM do orcamento, na forma da tabela ncm_codes (0000.00.00). Nulo: nao informado, e a precificacao final recusa; nunca zera o PIS/COFINS.';
COMMENT ON COLUMN public.orcamentista_orcamento.uf_destino IS
  'A UF de destino da venda (brazilian_states.code). Obrigatoria exatamente quando sale_scope = INTERESTADUAL; nula nos outros casos.';

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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
                  AND column_name = 'uf_destino' AND data_type = 'character' AND character_maximum_length = 2 AND is_nullable = 'YES' AND column_default IS NULL) THEN
    faltam := concat_ws('; ', faltam, 'uf_destino');
  END IF;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: coluna ausente ou com outra forma (tipo, nula, sem default): %. Nada foi alterado.', faltam;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_ncm_forma'
                  AND pg_get_constraintdef(oid) = 'CHECK (((ncm_code IS NULL) OR (ncm_code ~ ''^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$''::text)))') THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_orcamento_ncm_forma ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_uf_destino_fkey'
                  AND confrelid = to_regclass('public.brazilian_states')
                  AND pg_get_constraintdef(oid) = 'FOREIGN KEY (uf_destino) REFERENCES brazilian_states(code)') THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_orcamento_uf_destino_fkey ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_uf_destino_do_escopo'
                  AND pg_get_constraintdef(oid) = 'CHECK (((NOT (sale_scope IS DISTINCT FROM ''INTERESTADUAL''::sale_scope)) = (uf_destino IS NOT NULL)))') THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_orcamento_uf_destino_do_escopo ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'));
  IF n <> 47 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_orcamento e orcamentista_orcamento_item tem % constraint(s), e deviam ter 47. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento';
  IF n <> 28 THEN
    RAISE EXCEPTION 'verificacao 4: orcamentista_orcamento tem % coluna(s), e devia ter 28. Nada foi alterado.', n;
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
  RAISE NOTICE 'orcamentista_orcamento: ncm_code, sale_scope, buyer_type e uf_destino, nulas e sem default; a CHECK do NCM, a FK e a CHECK da UF; 28 colunas e 47 constraints nas duas tabelas.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_orcamento'
--    and column_name in ('ncm_code', 'sale_scope', 'buyer_type', 'uf_destino');
-- -- esperado: as 4, nulas, sem default; ncm_code text, sale_scope sale_scope, buyer_type buyer_type_enum, uf_destino bpchar (character(2))
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conname in ('orcamentista_orcamento_ncm_forma', 'orcamentista_orcamento_uf_destino_fkey', 'orcamentista_orcamento_uf_destino_do_escopo');
-- -- esperado: as 3
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orcamentista_orcamento';
-- -- esperado: 28
-- select count(*) from pg_constraint
--  where conrelid in ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass);
-- -- esperado: 47
