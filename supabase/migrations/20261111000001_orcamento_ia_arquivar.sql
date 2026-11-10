-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261111000001 — ARQUIVAR o orçamento I.A.: some da tela, fica no banco com tudo.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, depois de ler o arquivo e
-- ║ conferir o md5. Pressupõe a 20261109000001 a 20261109000005 e a 20261110000001 aplicadas
-- ║ (o estado conferido em produção em 11/11/2026: 29 colunas no orçamento, 52 constraints
-- ║ no orçamento e no item).
-- ║ Ao aplicar fora do CLI, o `name` da migração é 20261111000001_orcamento_ia_arquivar.
-- ║ SÓ ACRESCENTA 2 COLUNAS e 1 CHECK em orcamentista_orcamento. As colunas são NULAS e SEM
-- ║ DEFAULT: nenhuma linha é inserida, alterada ou apagada; nada sai. NÃO CRIA FUNÇÃO, TIPO
-- ║ NEM ÍNDICE e NÃO MEXE EM GRANT.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 11/11/2026: "ARQUIVAR (decisão do dono do produto: arquivar, não apagar): o orçamento some da tela, como se
-- tivesse sido excluído, e permanece no banco com tudo — itens, materiais e arquivo. Nada é apagado nunca."
--
-- O QUE FAZ, em `orcamentista_orcamento`:
--   - `deleted_at timestamptz NULL` — quando foi arquivado; nulo = ativo;
--   - `deleted_by uuid NULL` — quem arquivou. SEM chave estrangeira, no MESMO padrão de `criado_por` e `editado_manualmente_por` (medido em
--     produção em 11/11/2026: nenhuma das duas tem FK — `criado_por` só tem a CHECK `orcamentista_orcamento_origem_amarrada`, e
--     `editado_manualmente_por` só a `orcamentista_orcamento_marca_inteira`);
--   - `orcamentista_orcamento_arquivado_com_autor`: (deleted_at IS NULL) = (deleted_by IS NULL) — arquivado sempre tem autor, e autor sem
--     data não existe (o mesmo desenho da `marca_inteira`).
--
-- O QUE NÃO FAZ, de propósito:
--   - não toca nos itens, nos materiais, nem em `orcamentista_orcamento_arquivo` (o sha256 é a prova do que foi oferecido ao cliente), nem no
--     Storage;
--   - não muda o número: o número do arquivado continua tomado (a UNIQUE do número não é alterada);
--   - não cria índice: a lista filtra `deleted_at IS NULL` sobre poucas linhas por empresa; um índice parcial vem quando houver volume medido.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS e a CHECK só se o nome não existe; a verificação confere a forma.
-- GUARDA (aborta): a 20261110000001 aplicada (valor_operacao_interna existe); o orçamento tem 29 colunas além das duas novas; as duas tabelas
--   têm 52 constraints além da nova.
-- VERIFICAÇÃO (aborta): as duas colunas com o tipo, nulas e sem default; deleted_by SEM FK; a CHECK com a definição; 31 colunas no orçamento;
--   53 constraints nas duas tabelas; nenhum orçamento arquivado (nenhuma linha foi alterada); nenhum grant a anon, authenticated ou PUBLIC;
--   o service_role ainda só com INSERT, SELECT e UPDATE.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'valor_operacao_interna') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento.valor_operacao_interna (a migracao 20261110000001). Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
     AND column_name NOT IN ('deleted_at', 'deleted_by');
  IF n <> 29 THEN
    RAISE EXCEPTION 'guarda: orcamentista_orcamento tem % coluna(s) alem das novas, e devia ter 29. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'))
     AND conname <> 'orcamentista_orcamento_arquivado_com_autor';
  IF n <> 52 THEN
    RAISE EXCEPTION 'guarda: orcamentista_orcamento e orcamentista_orcamento_item tem % constraint(s) alem da nova, e deviam ter 52. Nada foi alterado.', n;
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_orcamento
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_arquivado_com_autor') THEN
    ALTER TABLE public.orcamentista_orcamento
      ADD CONSTRAINT orcamentista_orcamento_arquivado_com_autor
      CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));
  END IF;
END
$check$;

COMMENT ON COLUMN public.orcamentista_orcamento.deleted_at IS
  'Quando o orcamento foi ARQUIVADO (some da lista; fica no banco com itens, materiais e arquivo). Nulo = ativo. Anda junto com deleted_by.';
COMMENT ON COLUMN public.orcamentista_orcamento.deleted_by IS
  'Quem arquivou o orcamento. Sem FK, no padrao de criado_por e editado_manualmente_por. Anda junto com deleted_at.';

DO $verifica$
DECLARE
  texto text;
  n     int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
                  AND column_name = 'deleted_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 1: deleted_at ausente ou com outra forma (timestamptz, nula, sem default). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
                  AND column_name = 'deleted_by' AND data_type = 'uuid' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 2: deleted_by ausente ou com outra forma (uuid, nula, sem default). Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.orcamentista_orcamento') AND c.contype = 'f'
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) AND a.attname = 'deleted_by');
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 3: deleted_by tem % chave(s) estrangeira(s), e devia seguir criado_por (sem FK). Nada foi alterado.', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_arquivado_com_autor'
                  AND pg_get_constraintdef(oid) = 'CHECK (((deleted_at IS NULL) = (deleted_by IS NULL)))') THEN
    RAISE EXCEPTION 'verificacao 4: CHECK orcamentista_orcamento_arquivado_com_autor ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento';
  IF n <> 31 THEN
    RAISE EXCEPTION 'verificacao 5: orcamentista_orcamento tem % coluna(s), e devia ter 31. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'));
  IF n <> 53 THEN
    RAISE EXCEPTION 'verificacao 6: orcamentista_orcamento e orcamentista_orcamento_item tem % constraint(s), e deviam ter 53. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_orcamento WHERE deleted_at IS NOT NULL OR deleted_by IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 7: % orcamento(s) arquivado(s) logo depois da migracao; ela nao altera linha nenhuma. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 8: % grant(s) a anon, authenticated ou PUBLIC em orcamentista_orcamento. Nada foi alterado.', n;
  END IF;
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO texto FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND grantee = 'service_role';
  IF texto IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'verificacao 9: service_role em orcamentista_orcamento tem %, e devia ter INSERT,SELECT,UPDATE. Nada foi alterado.', texto;
  END IF;
  RAISE NOTICE 'orcamentista_orcamento: deleted_at e deleted_by, nulas e sem default, com a CHECK arquivado_com_autor; 31 colunas e 53 constraints nas duas tabelas.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_orcamento' and column_name in ('deleted_at', 'deleted_by') order by 1;
-- -- esperado: deleted_at timestamp with time zone YES null; deleted_by uuid YES null
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_orcamento_arquivado_com_autor';
-- -- esperado: CHECK (((deleted_at IS NULL) = (deleted_by IS NULL)))
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orcamentista_orcamento';
-- -- esperado: 31
-- select count(*) from pg_constraint where conrelid in ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass);
-- -- esperado: 53
-- select count(*) from public.orcamentista_orcamento where deleted_at is not null;
-- -- esperado: 0
