-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261109000005 — o ARQUIVO "ORÇAMENTO" do orçamento I.A.: a cópia dos ambientes e das escolhas no item, e a tabela que guarda cada
-- arquivo gerado, com o cálculo de onde ele saiu.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto. Pressupõe a 20261109000001 a
-- ║ 20261109000004 aplicadas, e a função orcamentista_levantamento_ambientes_validos(jsonb) da
-- ║ 20261106000002.
-- ║ Ao aplicar fora do CLI, o `name` da migração é 20261109000005_orcamento_ia_arquivo.
-- ║ NÃO GRAVA DADO DE CONTA: nenhuma linha é inserida, alterada ou apagada. Medido em produção
-- ║ em 09/11/2026: orcamentista_orcamento e orcamentista_orcamento_item têm 0 linhas.
-- ║ ALTERA UMA TABELA QUE JÁ EXISTE: orcamentista_orcamento_item ganha ambientes e escolhas (jsonb,
-- ║ nulas, sem default) e duas CHECKs. Nenhuma coluna, constraint ou tabela sai.
-- ║ NÃO CRIA FUNÇÃO: a CHECK dos ambientes chama a MESMA função do item do levantamento (um domínio
-- ║ só). A tabela nova é SÓ DE ESCRITA E LEITURA: o service_role tem SELECT e INSERT, e NÃO tem
-- ║ UPDATE, DELETE nem TRUNCATE — a linha gravada é fato histórico.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 09/11/2026 (as quatro decisões do item 2):
--   (2) "OS AMBIENTES E AS VARIÁVEIS: COPIADOS na criação do orçamento, NÃO lidos do levantamento na hora de gerar. [...] o levantamento
--       muda, e um arquivo que o cliente recebeu deixaria de ser reproduzível. O orçamento já copia tipologia, largura, altura, quantidade,
--       cor e vidro do item do levantamento; ambientes e escolhas completam a cópia. [...] No orçamento manual, omitir. Nunca um padrão."
--   (3) "ONDE GUARDAR: tabela própria, SÓ INSERÇÃO, com histórico. [...] além do caminho no bucket, do hash, do tamanho, do valor de venda
--       e da data, a linha guarda o CALCULO_ID vigente no momento da geração. Sem ele não há como ligar o arquivo que o cliente recebeu à
--       relação de materiais que o produziu — e é dessa ligação que os Relatórios I.A. vão viver. Grants como na 0003: service_role com
--       SELECT e INSERT, sem UPDATE e sem DELETE. [...] NÃO junte com o arquivo do levantamento, que é outra entidade."
--
-- O QUE FAZ:
--   1. NO ITEM: `ambientes jsonb` e `escolhas jsonb`, nulas e sem default, com as MESMAS formas do item do levantamento — os ambientes
--      pela função `orcamentista_levantamento_ambientes_validos` (uma lista não vazia de {"ambiente", "quantidade"}, sem o mesmo ambiente
--      duas vezes) e as escolhas como objeto. Nulo é "não informado" (o orçamento manual), nunca uma lista vazia nem um padrão.
--   2. `orcamentista_orcamento_arquivo`: uma linha por arquivo gerado — o orçamento (FK COMPOSTA com o tenant), o `calculo_id` vigente
--      na geração, o bucket e o caminho do objeto (únicos juntos), o sha256 e o tamanho em bytes do PDF, o valor de venda usado, quem
--      gerou e quando. Gerar de novo é OUTRA linha: as de antes ficam, e o histórico é o que o cliente recebeu em cada momento.
--      `calculo_id` não tem FK: o cálculo não é tabela, é o identificador das linhas de `orcamentista_orcamento_item_material` (0003).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, cada constraint só se o nome não existe; a verificação confere a
--   forma.
-- GUARDA (aborta): a 0004 aplicada (orcamentista_orcamento.uf_destino); a chave (id, tenant_id) do orçamento; e a função dos ambientes
--   com o corpo de produção (md5 sem o \r, 39519b7c045dec627a6e5e47d7894409) — outra função com o mesmo nome mudaria o domínio calada.
-- VERIFICAÇÃO (aborta): as constraints com a definição; 49 constraints no orçamento e no item (47 + 2) e 9 na tabela nova; 30 colunas no
--   item e 11 na tabela nova; o índice; RLS ligada e nenhuma política; nenhum grant a anon, authenticated ou PUBLIC nas três tabelas; o
--   service_role só com INSERT e SELECT na tabela nova.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'uf_destino') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento.uf_destino (a migracao 20261109000004). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento')
                  AND conname = 'orcamentista_orcamento_id_tenant_key' AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento_id_tenant_key UNIQUE (id, tenant_id) (a migracao 20261109000001). Nada foi alterado.';
  END IF;
  IF (SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.orcamentista_levantamento_ambientes_validos(jsonb)')) IS DISTINCT FROM '39519b7c045dec627a6e5e47d7894409' THEN
    RAISE EXCEPTION 'dependencia ausente ou com outro corpo: public.orcamentista_levantamento_ambientes_validos(jsonb) (a migracao 20261106000002). Nada foi alterado.';
  END IF;
END
$guarda$;

-- 1. o item: a copia dos ambientes e das escolhas do item do levantamento
ALTER TABLE public.orcamentista_orcamento_item
  ADD COLUMN IF NOT EXISTS ambientes jsonb NULL,
  ADD COLUMN IF NOT EXISTS escolhas  jsonb NULL;

DO $item$
DECLARE
  novas text[] := ARRAY[
    'orcamentista_orcamento_item_ambientes_forma|CHECK (public.orcamentista_levantamento_ambientes_validos(ambientes))',
    'orcamentista_orcamento_item_escolhas_objeto|CHECK ((escolhas IS NULL) OR (jsonb_typeof(escolhas) = ''object''::text))'
  ];
  e text;
  p text[];
BEGIN
  FOREACH e IN ARRAY novas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento_item') AND conname = p[1]) THEN
      EXECUTE format('ALTER TABLE public.orcamentista_orcamento_item ADD CONSTRAINT %I %s', p[1], p[2]);
    END IF;
  END LOOP;
END
$item$;

-- 2. o arquivo "Orcamento" gerado: so insercao, com o calculo de onde saiu
CREATE TABLE IF NOT EXISTS public.orcamentista_orcamento_arquivo (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  orcamento_id   uuid        NOT NULL,
  calculo_id     uuid        NOT NULL,
  bucket         text        NOT NULL,
  caminho        text        NOT NULL,
  sha256         text        NOT NULL,
  tamanho_bytes  bigint      NOT NULL,
  valor_venda    numeric     NOT NULL,
  gerado_por     uuid        NOT NULL,
  gerado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_orcamento_arquivo_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_orcamento_arquivo_objeto_key UNIQUE (bucket, caminho),
  CONSTRAINT orcamentista_orcamento_arquivo_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_arquivo_orcamento_fkey FOREIGN KEY (orcamento_id, tenant_id)
    REFERENCES public.orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_arquivo_bucket_forma CHECK (bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'::text),
  CONSTRAINT orcamentista_orcamento_arquivo_caminho_forma CHECK ((caminho ~ '^[^/\s][^\s]*$'::text) AND (char_length(caminho) <= 500)),
  CONSTRAINT orcamentista_orcamento_arquivo_sha256_forma CHECK (sha256 ~ '^[0-9a-f]{64}$'::text),
  CONSTRAINT orcamentista_orcamento_arquivo_tamanho_positivo CHECK (tamanho_bytes > 0),
  CONSTRAINT orcamentista_orcamento_arquivo_valor_venda_positivo CHECK (valor_venda > (0)::numeric)
);

CREATE INDEX IF NOT EXISTS orcamentista_orcamento_arquivo_orcamento_idx
  ON public.orcamentista_orcamento_arquivo USING btree (orcamento_id, gerado_em);

ALTER TABLE public.orcamentista_orcamento_arquivo ENABLE ROW LEVEL SECURITY;

-- o privilegio padrao de producao da ALL a anon, authenticated e service_role: o REVOKE alcanca os quatro, e o service_role volta so
-- com SELECT e INSERT (a linha gravada nao muda nem sai)
REVOKE ALL ON public.orcamentista_orcamento_arquivo FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.orcamentista_orcamento_arquivo TO service_role;

COMMENT ON TABLE public.orcamentista_orcamento_arquivo IS
  'Cada arquivo Orcamento gerado (20261109000005): o objeto no bucket, o sha256, o tamanho, o valor de venda e o calculo_id vigente na geracao. Gravada uma vez, nunca alterada.';
COMMENT ON COLUMN public.orcamentista_orcamento_arquivo.calculo_id IS
  'O calculo vigente quando o arquivo foi gerado: as linhas de orcamentista_orcamento_item_material com este calculo_id produziram os valores do arquivo.';
COMMENT ON COLUMN public.orcamentista_orcamento_item.ambientes IS
  'Copia dos ambientes do item do levantamento, feita na criacao do orcamento. Nulo: nao informado (o orcamento manual).';
COMMENT ON COLUMN public.orcamentista_orcamento_item.escolhas IS
  'Copia das escolhas (variaveis) do item do levantamento, feita na criacao do orcamento. Nulo: nao informado (o orcamento manual).';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_orcamento_item|orcamentista_orcamento_item_ambientes_forma|CHECK (orcamentista_levantamento_ambientes_validos(ambientes))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_escolhas_objeto|CHECK (((escolhas IS NULL) OR (jsonb_typeof(escolhas) = ''object''::text)))',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_bucket_forma|CHECK ((bucket ~ ''^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$''::text))',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_caminho_forma|CHECK (((caminho ~ ''^[^/\s][^\s]*$''::text) AND (char_length(caminho) <= 500)))',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_objeto_key|UNIQUE (bucket, caminho)',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_orcamento_fkey|FOREIGN KEY (orcamento_id, tenant_id) REFERENCES orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_pkey|PRIMARY KEY (id)',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_sha256_forma|CHECK ((sha256 ~ ''^[0-9a-f]{64}$''::text))',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_tamanho_positivo|CHECK ((tamanho_bytes > 0))',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_valor_venda_positivo|CHECK ((valor_venda > (0)::numeric))'
  ];
  e      text;
  p      text[];
  faltam text;
  n      int;
BEGIN
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.' || p[1]) AND conname = p[2] AND pg_get_constraintdef(oid) = p[3]) THEN
      faltam := concat_ws('; ', faltam, p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento_arquivo');
  IF n <> 9 THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_orcamento_arquivo tem % constraint(s), e devia ter 9. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'));
  IF n <> 49 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_orcamento e orcamentista_orcamento_item tem % constraint(s), e deviam ter 49. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item';
  IF n <> 30 THEN
    RAISE EXCEPTION 'verificacao 4: orcamentista_orcamento_item tem % coluna(s), e devia ter 30. Nada foi alterado.', n;
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item'
       AND column_name IN ('ambientes', 'escolhas') AND data_type = 'jsonb' AND is_nullable = 'YES' AND column_default IS NULL) <> 2 THEN
    RAISE EXCEPTION 'verificacao 5: ambientes ou escolhas do item ausente ou com outra forma (jsonb, nula, sem default). Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_arquivo';
  IF n <> 11 THEN
    RAISE EXCEPTION 'verificacao 6: orcamentista_orcamento_arquivo tem % coluna(s), e devia ter 11. Nada foi alterado.', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_orcamento_arquivo_orcamento_idx'
                  AND indexdef = 'CREATE INDEX orcamentista_orcamento_arquivo_orcamento_idx ON public.orcamentista_orcamento_arquivo USING btree (orcamento_id, gerado_em)') THEN
    RAISE EXCEPTION 'verificacao 7: indice orcamentista_orcamento_arquivo_orcamento_idx ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.orcamentista_orcamento_arquivo')) THEN
    RAISE EXCEPTION 'verificacao 8: RLS desligada em orcamentista_orcamento_arquivo. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_orcamento_arquivo';
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 9: % politica(s) em orcamentista_orcamento_arquivo, e devia ser nenhuma. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name IN ('orcamentista_orcamento', 'orcamentista_orcamento_item', 'orcamentista_orcamento_arquivo')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 10: % grant(s) a anon, authenticated ou PUBLIC nas tres tabelas. Nada foi alterado.', n;
  END IF;
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO faltam FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_arquivo' AND grantee = 'service_role';
  IF faltam IS DISTINCT FROM 'INSERT,SELECT' THEN
    RAISE EXCEPTION 'verificacao 11: service_role em orcamentista_orcamento_arquivo tem %, e devia ter INSERT,SELECT. Nada foi alterado.', faltam;
  END IF;
  RAISE NOTICE 'orcamentista_orcamento_item: ambientes e escolhas, com as duas CHECKs (49 constraints nas duas tabelas). orcamentista_orcamento_arquivo: 11 colunas, 9 constraints, 1 indice, RLS sem politica, service_role so com INSERT e SELECT.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_orcamento_item' and column_name in ('ambientes', 'escolhas');
-- -- esperado: as 2, jsonb, nulas, sem default
-- select count(*) from pg_constraint
--  where conrelid in ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass);
-- -- esperado: 49
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.orcamentista_orcamento_arquivo'::regclass order by 1;
-- -- esperado: 9, entre elas a orcamento_fkey composta (orcamento_id, tenant_id)
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'orcamentista_orcamento_arquivo' order by 1, 2;
-- -- esperado: só postgres e service_role; service_role com INSERT e SELECT
-- select relrowsecurity from pg_class where relname = 'orcamentista_orcamento_arquivo';  -- esperado: true
