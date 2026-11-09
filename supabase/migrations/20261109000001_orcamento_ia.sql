-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261109000001 — o ORÇAMENTO I.A. e os itens dele: entidade própria, separada de `products`.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261109000001_orcamento_ia.
-- ║ SEM ELA a tela "Orçamentos I.A." não quebra: as rotas respondem 503 com a frase de que a
-- ║ migração está pendente, e a tela a mostra. Nenhuma outra tela lê estas tabelas.
-- ║ NÃO GRAVA DADO DE CONTA: nenhuma linha é inserida, alterada ou apagada. O preenchimento dos
-- ║ 11 levantamentos de hoje como orçamentos do agente é passo SEPARADO, autorizado depois.
-- ║ NÃO CRIA FUNÇÃO: só tabelas, CHECKs, FKs, índices, RLS e grants.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisões do dono do produto, 09/11/2026:
--   - "tabela própria com os itens pendurados, com a coluna `origem` obrigatória (`agente` | `manual`) conferida
--     pelo banco, e o orçamento apontando para o levantamento de onde veio. Não reaproveitar products."
--   - INVARIANTE: orçamento criado pelo agente e orçamento criado à mão são DISTINGUÍVEIS em consulta, sem
--     heurística — `origem`, e a CHECK que a amarra ao levantamento (o do agente tem; o manual, não).
--   - "a edição manual MARCA o orçamento, e a partir daí o agente NÃO sobrescreve calado [...] Deixe o campo da
--     marca na migração": `editado_manualmente_em` e `editado_manualmente_por`, os dois juntos ou nenhum.
--   - "Nada de drop, delete, truncate ou cancelamento": as FKs para o orçamento são RESTRICT; não há coluna de
--     cancelamento nem de exclusão. Documento de cliente não é arrastado.
--
-- O QUE FAZ:
--   1. `orcamentista_orcamento` (tenant_id, numero por empresa, origem, levantamento_id, nome do cliente, obs,
--      a marca da edição manual, criado_por, criado_em, atualizado_em). FK (levantamento_id, tenant_id) para
--      `orcamentista_levantamento (id, tenant_id)` ON DELETE RESTRICT; um orçamento por levantamento (índice
--      único parcial).
--   2. `orcamentista_orcamento_item` (o orçamento, a ordem, a ligação opcional ao item do levantamento de onde
--      veio, e o que o item diz: tipologia, largura, altura, quantidade, cor do perfil, vidro, obs). A FK para
--      o item do levantamento é ON DELETE SET NULL: a conversa apaga o item que se fundiu no agrupamento
--      (`gravarLevantamento`), e o orçamento guarda a sua cópia — só perde o laço.
--   3. RLS ligada e NENHUMA política; grants só ao service_role, como `orcamentista_levantamento` (medido em
--      produção em 09/11/2026) — mas só SELECT, INSERT e UPDATE: nem DELETE nem TRUNCATE ("nada de delete").
--      Quem lê e grava são as rotas do servidor, com o tenant do chamador.
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS; a verificação confere a forma.
-- GUARDA (aborta): as dependências existem (tenants, orcamentista_levantamento com UNIQUE (id, tenant_id),
--   orcamentista_levantamento_item); uma tabela de mesmo nome que já exista sem a forma desta migração é
--   pega pela verificação.
-- VERIFICAÇÃO (aborta): as colunas, as constraints e os índices com a definição; RLS ligada; nenhuma política;
--   nenhum grant a anon nem a authenticated.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.tenants') IS NULL OR to_regclass('public.orcamentista_levantamento') IS NULL
     OR to_regclass('public.orcamentista_levantamento_item') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.tenants, public.orcamentista_levantamento ou public.orcamentista_levantamento_item. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_levantamento')
                    AND conname = 'orcamentista_levantamento_id_tenant_key' AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_levantamento_id_tenant_key UNIQUE (id, tenant_id). Nada foi alterado.';
  END IF;
END
$guarda$;

CREATE TABLE IF NOT EXISTS public.orcamentista_orcamento (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL,
  numero                   integer     NOT NULL,
  origem                   text        NOT NULL,
  levantamento_id          uuid        NULL,
  nome                     text        NOT NULL,
  obs                      text        NULL,
  editado_manualmente_em   timestamptz NULL,
  editado_manualmente_por  uuid        NULL,
  criado_por               uuid        NULL,
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_orcamento_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_orcamento_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT orcamentista_orcamento_numero_key UNIQUE (tenant_id, numero),
  CONSTRAINT orcamentista_orcamento_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_levantamento_fkey FOREIGN KEY (levantamento_id, tenant_id)
    REFERENCES public.orcamentista_levantamento(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_numero_positivo CHECK (numero >= 1),
  CONSTRAINT orcamentista_orcamento_origem_valida CHECK (origem = ANY (ARRAY['agente'::text, 'manual'::text])),
  -- o do agente vem de um levantamento e nao tem autor humano; o manual nao vem de levantamento e tem autor
  CONSTRAINT orcamentista_orcamento_origem_amarrada CHECK (
    (origem = 'agente' AND levantamento_id IS NOT NULL AND criado_por IS NULL)
    OR (origem = 'manual' AND levantamento_id IS NULL AND criado_por IS NOT NULL)),
  CONSTRAINT orcamentista_orcamento_nome_forma CHECK ((nome ~ '^\S(.*\S)?$'::text) AND (char_length(nome) <= 120)),
  CONSTRAINT orcamentista_orcamento_obs_forma CHECK ((obs IS NULL) OR ((obs ~ '^\S(.*\S)?$'::text) AND (char_length(obs) <= 1000))),
  CONSTRAINT orcamentista_orcamento_marca_inteira CHECK ((editado_manualmente_em IS NULL) = (editado_manualmente_por IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_orcamento_um_por_levantamento
  ON public.orcamentista_orcamento USING btree (levantamento_id) WHERE (levantamento_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.orcamentista_orcamento_item (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL,
  orcamento_id           uuid        NOT NULL,
  ordem                  integer     NOT NULL,
  levantamento_item_id   uuid        NULL,
  tipologia              text        NULL,
  largura_mm             integer     NULL,
  altura_mm              integer     NULL,
  quantidade             integer     NOT NULL,
  cor_perfil             text        NULL,
  vidro                  text        NULL,
  obs                    text        NULL,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  atualizado_em          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_orcamento_item_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_orcamento_item_ordem_key UNIQUE (orcamento_id, ordem),
  CONSTRAINT orcamentista_orcamento_item_orcamento_fkey FOREIGN KEY (orcamento_id, tenant_id)
    REFERENCES public.orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_item_levantamento_item_fkey FOREIGN KEY (levantamento_item_id)
    REFERENCES public.orcamentista_levantamento_item(id) ON DELETE SET NULL,
  CONSTRAINT orcamentista_orcamento_item_ordem_positiva CHECK (ordem >= 1),
  CONSTRAINT orcamentista_orcamento_item_quantidade_positiva CHECK (quantidade >= 1),
  CONSTRAINT orcamentista_orcamento_item_largura_positiva CHECK ((largura_mm IS NULL) OR (largura_mm >= 1)),
  CONSTRAINT orcamentista_orcamento_item_altura_positiva CHECK ((altura_mm IS NULL) OR (altura_mm >= 1)),
  CONSTRAINT orcamentista_orcamento_item_tipologia_forma CHECK ((tipologia IS NULL) OR ((tipologia ~ '^\S(.*\S)?$'::text) AND (char_length(tipologia) <= 120))),
  CONSTRAINT orcamentista_orcamento_item_cor_forma CHECK ((cor_perfil IS NULL) OR ((cor_perfil ~ '^\S(.*\S)?$'::text) AND (char_length(cor_perfil) <= 120))),
  CONSTRAINT orcamentista_orcamento_item_vidro_forma CHECK ((vidro IS NULL) OR ((vidro ~ '^\S(.*\S)?$'::text) AND (char_length(vidro) <= 120))),
  CONSTRAINT orcamentista_orcamento_item_obs_forma CHECK ((obs IS NULL) OR ((obs ~ '^\S(.*\S)?$'::text) AND (char_length(obs) <= 1000)))
);

CREATE INDEX IF NOT EXISTS orcamentista_orcamento_item_orcamento_idx
  ON public.orcamentista_orcamento_item USING btree (orcamento_id, ordem);

ALTER TABLE public.orcamentista_orcamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_orcamento_item ENABLE ROW LEVEL SECURITY;

-- o privilegio padrao de producao (pg_default_acl do postgres no schema public) da ALL a anon, authenticated e service_role:
-- o REVOKE alcanca os quatro, e o service_role volta so com SELECT, INSERT e UPDATE (sem DELETE nem TRUNCATE)
REVOKE ALL ON public.orcamentista_orcamento, public.orcamentista_orcamento_item FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.orcamentista_orcamento, public.orcamentista_orcamento_item TO service_role;

COMMENT ON TABLE public.orcamentista_orcamento IS
  'Orcamento I.A. (20261109000001): origem agente (vem de um levantamento) ou manual (criado na tela). Separado de products.';
COMMENT ON COLUMN public.orcamentista_orcamento.editado_manualmente_em IS
  'A marca da edicao manual: depois dela o agente nao sobrescreve calado; avisa que o levantamento mudou e pergunta.';
COMMENT ON TABLE public.orcamentista_orcamento_item IS
  'Item do orcamento I.A. (20261109000001). levantamento_item_id e o item de onde veio; nulo no item manual ou quando a conversa fundiu o de origem.';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_orcamento|orcamentista_orcamento_pkey|PRIMARY KEY (id)',
    'orcamentista_orcamento|orcamentista_orcamento_id_tenant_key|UNIQUE (id, tenant_id)',
    'orcamentista_orcamento|orcamentista_orcamento_numero_key|UNIQUE (tenant_id, numero)',
    'orcamentista_orcamento|orcamentista_orcamento_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'orcamentista_orcamento|orcamentista_orcamento_levantamento_fkey|FOREIGN KEY (levantamento_id, tenant_id) REFERENCES orcamentista_levantamento(id, tenant_id) ON DELETE RESTRICT',
    'orcamentista_orcamento|orcamentista_orcamento_numero_positivo|CHECK ((numero >= 1))',
    'orcamentista_orcamento|orcamentista_orcamento_origem_valida|CHECK ((origem = ANY (ARRAY[''agente''::text, ''manual''::text])))',
    'orcamentista_orcamento|orcamentista_orcamento_origem_amarrada|CHECK ((((origem = ''agente''::text) AND (levantamento_id IS NOT NULL) AND (criado_por IS NULL)) OR ((origem = ''manual''::text) AND (levantamento_id IS NULL) AND (criado_por IS NOT NULL))))',
    'orcamentista_orcamento|orcamentista_orcamento_nome_forma|CHECK (((nome ~ ''^\S(.*\S)?$''::text) AND (char_length(nome) <= 120)))',
    'orcamentista_orcamento|orcamentista_orcamento_obs_forma|CHECK (((obs IS NULL) OR ((obs ~ ''^\S(.*\S)?$''::text) AND (char_length(obs) <= 1000))))',
    'orcamentista_orcamento|orcamentista_orcamento_marca_inteira|CHECK (((editado_manualmente_em IS NULL) = (editado_manualmente_por IS NULL)))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_pkey|PRIMARY KEY (id)',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_ordem_key|UNIQUE (orcamento_id, ordem)',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_orcamento_fkey|FOREIGN KEY (orcamento_id, tenant_id) REFERENCES orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_levantamento_item_fkey|FOREIGN KEY (levantamento_item_id) REFERENCES orcamentista_levantamento_item(id) ON DELETE SET NULL',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_ordem_positiva|CHECK ((ordem >= 1))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_quantidade_positiva|CHECK ((quantidade >= 1))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_largura_positiva|CHECK (((largura_mm IS NULL) OR (largura_mm >= 1)))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_altura_positiva|CHECK (((altura_mm IS NULL) OR (altura_mm >= 1)))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_tipologia_forma|CHECK (((tipologia IS NULL) OR ((tipologia ~ ''^\S(.*\S)?$''::text) AND (char_length(tipologia) <= 120))))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_cor_forma|CHECK (((cor_perfil IS NULL) OR ((cor_perfil ~ ''^\S(.*\S)?$''::text) AND (char_length(cor_perfil) <= 120))))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_vidro_forma|CHECK (((vidro IS NULL) OR ((vidro ~ ''^\S(.*\S)?$''::text) AND (char_length(vidro) <= 120))))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_obs_forma|CHECK (((obs IS NULL) OR ((obs ~ ''^\S(.*\S)?$''::text) AND (char_length(obs) <= 1000))))'
  ];
  indices text[] := ARRAY[
    'orcamentista_orcamento_um_por_levantamento|CREATE UNIQUE INDEX orcamentista_orcamento_um_por_levantamento ON public.orcamentista_orcamento USING btree (levantamento_id) WHERE (levantamento_id IS NOT NULL)',
    'orcamentista_orcamento_item_orcamento_idx|CREATE INDEX orcamentista_orcamento_item_orcamento_idx ON public.orcamentista_orcamento_item USING btree (orcamento_id, ordem)'
  ];
  colunas text[] := ARRAY[
    'orcamentista_orcamento|id|uuid|NO', 'orcamentista_orcamento|tenant_id|uuid|NO', 'orcamentista_orcamento|numero|integer|NO',
    'orcamentista_orcamento|origem|text|NO', 'orcamentista_orcamento|levantamento_id|uuid|YES', 'orcamentista_orcamento|nome|text|NO',
    'orcamentista_orcamento|obs|text|YES', 'orcamentista_orcamento|editado_manualmente_em|timestamp with time zone|YES',
    'orcamentista_orcamento|editado_manualmente_por|uuid|YES', 'orcamentista_orcamento|criado_por|uuid|YES',
    'orcamentista_orcamento|criado_em|timestamp with time zone|NO', 'orcamentista_orcamento|atualizado_em|timestamp with time zone|NO',
    'orcamentista_orcamento_item|id|uuid|NO', 'orcamentista_orcamento_item|tenant_id|uuid|NO', 'orcamentista_orcamento_item|orcamento_id|uuid|NO',
    'orcamentista_orcamento_item|ordem|integer|NO', 'orcamentista_orcamento_item|levantamento_item_id|uuid|YES',
    'orcamentista_orcamento_item|tipologia|text|YES', 'orcamentista_orcamento_item|largura_mm|integer|YES', 'orcamentista_orcamento_item|altura_mm|integer|YES',
    'orcamentista_orcamento_item|quantidade|integer|NO', 'orcamentista_orcamento_item|cor_perfil|text|YES', 'orcamentista_orcamento_item|vidro|text|YES',
    'orcamentista_orcamento_item|obs|text|YES', 'orcamentista_orcamento_item|criado_em|timestamp with time zone|NO',
    'orcamentista_orcamento_item|atualizado_em|timestamp with time zone|NO'
  ];
  e      text;
  p      text[];
  faltam text;
  n      int;
BEGIN
  FOREACH e IN ARRAY colunas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = p[1] AND column_name = p[2] AND data_type = p[3] AND is_nullable = p[4]) THEN
      faltam := concat_ws('; ', faltam, p[1] || '.' || p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: coluna ausente ou com outra forma: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('orcamentista_orcamento', 'orcamentista_orcamento_item');
  IF n <> 26 THEN
    RAISE EXCEPTION 'verificacao 2: as duas tabelas tem % coluna(s), e deviam ter 26. Nada foi alterado.', n;
  END IF;
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.' || p[1]) AND conname = p[2] AND pg_get_constraintdef(oid) = p[3]) THEN
      faltam := concat_ws('; ', faltam, p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 3: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'));
  IF n <> 23 THEN
    RAISE EXCEPTION 'verificacao 4: as duas tabelas tem % constraint(s), e deviam ter 23. Nada foi alterado.', n;
  END IF;
  FOREACH e IN ARRAY indices LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = p[1] AND indexdef = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 5: indice ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'))
                                      AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'verificacao 6: RLS desligada numa das duas tabelas. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('orcamentista_orcamento', 'orcamentista_orcamento_item');
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 7: % politica(s) nas duas tabelas, e devia ser nenhuma. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name IN ('orcamentista_orcamento', 'orcamentista_orcamento_item')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 8: % grant(s) a anon, authenticated ou PUBLIC nas duas tabelas. Nada foi alterado.', n;
  END IF;
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO faltam FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND grantee = 'service_role';
  IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'verificacao 9: service_role em orcamentista_orcamento tem %, e devia ter INSERT,SELECT,UPDATE. Nada foi alterado.', faltam;
  END IF;
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO faltam FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item' AND grantee = 'service_role';
  IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'verificacao 9: service_role em orcamentista_orcamento_item tem %, e devia ter INSERT,SELECT,UPDATE. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_orcamento;
  RAISE NOTICE 'orcamentista_orcamento e orcamentista_orcamento_item: 26 colunas, 23 constraints, 2 indices, RLS sem politica. Linhas no orcamento: %.', n;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select table_name, count(*) from information_schema.columns
--  where table_schema = 'public' and table_name in ('orcamentista_orcamento', 'orcamentista_orcamento_item') group by 1;
-- -- esperado: orcamento 12, item 14
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid in ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass) order by 1, 2;
-- -- esperado: 23 constraints, entre elas orcamentista_orcamento_origem_amarrada e a marca_inteira
-- select relname, relrowsecurity from pg_class where relname in ('orcamentista_orcamento', 'orcamentista_orcamento_item');
-- select grantee, table_name, privilege_type from information_schema.role_table_grants
--  where table_name in ('orcamentista_orcamento', 'orcamentista_orcamento_item') order by 1, 2, 3;
-- -- esperado: só postgres e service_role; service_role com SELECT, INSERT e UPDATE (sem DELETE nem TRUNCATE)
-- select count(*) from public.orcamentista_orcamento;  -- esperado: 0
