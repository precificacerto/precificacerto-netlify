-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261025000003 — o LEVANTAMENTO como entidade: achado pelo NOME, de um remetente, com N
-- esquadrias. A conversa deixa de ser identidade de qualquer coisa.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261025000003_levantamento_por_nome.
-- ║ ORDEM (`migration-delivery.md`): APLICAR E VERIFICAR ANTES DO MERGE do PR que a traz. O
-- ║ código novo LÊ e GRAVA estas duas tabelas em toda mensagem do WhatsApp: mergeado sem
-- ║ elas, o remetente autorizado não recebe resposta nenhuma.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ║ O número 000002 está reservado para o registro retroativo de
-- ║ `orcamentista_motor_tipologia_detalhe`, parado por decisão do dono do produto.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- AS DECISÕES DO DONO DO PRODUTO (25/10/2026), que este arquivo materializa:
--   1. NOME: a comparação ignora maiúscula e acento ("Casa do João" = "casa do joao"). Quem
--      normaliza é o CÓDIGO (`normalizarNome`, em TS, com teste próprio), e grava o resultado
--      em `nome_normalizado`, coluna comum. NÃO há unaccent aqui: ela não é IMMUTABLE, e o
--      Postgres a recusa em coluna gerada e em expressão de índice.
--   2. QUEM ALTERA: só quem criou. O nome é único por (tenant_id, remetente_id, nome_normalizado),
--      não por tenant: dois vendedores podem ter o mesmo nome, e cada um alcança só o seu.
--   3. HISTÓRICO: sobrescreve. Não há tabela de versão; o único rastro é `atualizado_em`.
--   4. MENSAGENS: o código deixa de gravar texto em `orcamentista_mensagem`. Esta migração NÃO
--      toca `orcamentista_conversa`, `orcamentista_mensagem` nem `orcamentista_pre_definicao`:
--      nenhum DROP, nenhum DELETE, nenhum ALTER. Apagar é decisão exclusiva do dono do produto.
--
-- AS DUAS TABELAS
--   orcamentista_levantamento — um por (remetente, nome). estado EM_MONTAGEM | COMPLETO, com
--     CHECK (a pre_definicao usa 'COMPLETA' e não tem CHECK nenhum; aqui tem). O índice único
--     PARCIAL sobre (tenant_id, remetente_id) WHERE estado = 'EM_MONTAGEM' garante no máximo UM
--     levantamento em montagem por vendedor: é ele que recebe a próxima mensagem, e é isso que faz
--     o "4" de uma pergunta de arremate cair no lugar certo.
--   orcamentista_levantamento_item — as esquadrias, N por levantamento (o aproveitamento de barras
--     é do levantamento inteiro). `ordem` única por levantamento. `escolhas` com a mesma CHECK da
--     pre_definicao. Os campos são nuláveis e SEM default: o item é preenchido aos poucos, e NULL é
--     "ainda não dito" (`ausente-vs-falso.md`).
--
-- O PADRÃO DO PROJETO: tenant_id em tudo, FK composta (filho, tenant) -> pai (id, tenant) com o
-- UNIQUE (id, tenant_id) por trás, RLS ativa, REVOKE ALL de PUBLIC, anon e authenticated, e
-- NENHUM GRANT nem política: o acesso é só por rota, com service_role.
--
-- A FK do remetente não tem ON DELETE: o remetente é DESATIVADO (`ativo = false`), nunca apagado
-- (`orcamentista-da-empresa.ts`), e um levantamento não some porque o vendedor saiu da lista.
-- Apagar o tenant leva tudo, pela FK de tenant_id.
--
-- IDEMPOTENTE: CREATE TABLE / INDEX IF NOT EXISTS; as constraints nascem dentro do CREATE TABLE.
-- VERIFICAÇÃO (aborta): as duas tabelas, cada constraint e o índice parcial com a definição
-- esperada, RLS ligada, zero política, e nenhum privilégio de PUBLIC, anon ou authenticated.
-- DEPOIS DE APLICAR: NOTIFY pgrst (está no fim) e as consultas do rodapé.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.tenants. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_remetente_autorizado')
                    AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_remetente_autorizado sem UNIQUE (id, tenant_id). Nada foi alterado.';
  END IF;
END
$guarda$;

CREATE TABLE IF NOT EXISTS public.orcamentista_levantamento (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  remetente_id     uuid        NOT NULL,
  nome             text        NOT NULL,
  nome_normalizado text        NOT NULL,
  estado           text        NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_levantamento_pkey          PRIMARY KEY (id),
  CONSTRAINT orcamentista_levantamento_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT orcamentista_levantamento_tenant_fkey   FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_levantamento_remetente_fkey FOREIGN KEY (remetente_id, tenant_id)
    REFERENCES public.orcamentista_remetente_autorizado (id, tenant_id),
  CONSTRAINT orcamentista_levantamento_estado_valido CHECK (estado IN ('EM_MONTAGEM', 'COMPLETO')),
  CONSTRAINT orcamentista_levantamento_nome_key      UNIQUE (tenant_id, remetente_id, nome_normalizado)
);

CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_levantamento_um_em_montagem
  ON public.orcamentista_levantamento (tenant_id, remetente_id)
  WHERE estado = 'EM_MONTAGEM';

CREATE TABLE IF NOT EXISTS public.orcamentista_levantamento_item (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  levantamento_id uuid        NOT NULL,
  ordem           integer     NOT NULL,
  tipologia       text,
  largura_mm      integer,
  altura_mm       integer,
  quantidade      integer,
  cor_perfil      text,
  vidro           text,
  escolhas        jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_levantamento_item_pkey      PRIMARY KEY (id),
  CONSTRAINT orcamentista_levantamento_item_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_levantamento_item_levantamento_fkey FOREIGN KEY (levantamento_id, tenant_id)
    REFERENCES public.orcamentista_levantamento (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_levantamento_item_ordem_key UNIQUE (levantamento_id, ordem),
  CONSTRAINT orcamentista_levantamento_item_escolhas_objeto CHECK (escolhas IS NULL OR jsonb_typeof(escolhas) = 'object')
);

COMMENT ON TABLE public.orcamentista_levantamento IS
  'Levantamento do orcamentista, achado pelo nome. Unico por (tenant, remetente, nome_normalizado); no maximo um EM_MONTAGEM por remetente. nome_normalizado e escrito pelo codigo (minuscula, sem acento, espacos colapsados).';
COMMENT ON TABLE public.orcamentista_levantamento_item IS
  'Esquadria de um levantamento, N por levantamento. Campos nulaveis e sem default: NULL = ainda nao dito. escolhas = {"VARIAVEL": numero_da_opcao}.';

ALTER TABLE public.orcamentista_levantamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_levantamento_item ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orcamentista_levantamento FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.orcamentista_levantamento_item FROM PUBLIC, anon, authenticated;

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_levantamento|orcamentista_levantamento_pkey|PRIMARY KEY (id)',
    'orcamentista_levantamento|orcamentista_levantamento_id_tenant_key|UNIQUE (id, tenant_id)',
    'orcamentista_levantamento|orcamentista_levantamento_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_levantamento|orcamentista_levantamento_remetente_fkey|FOREIGN KEY (remetente_id, tenant_id) REFERENCES orcamentista_remetente_autorizado(id, tenant_id)',
    'orcamentista_levantamento|orcamentista_levantamento_estado_valido|CHECK ((estado = ANY (ARRAY[''EM_MONTAGEM''::text, ''COMPLETO''::text])))',
    'orcamentista_levantamento|orcamentista_levantamento_nome_key|UNIQUE (tenant_id, remetente_id, nome_normalizado)',
    'orcamentista_levantamento_item|orcamentista_levantamento_item_pkey|PRIMARY KEY (id)',
    'orcamentista_levantamento_item|orcamentista_levantamento_item_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_levantamento_item|orcamentista_levantamento_item_levantamento_fkey|FOREIGN KEY (levantamento_id, tenant_id) REFERENCES orcamentista_levantamento(id, tenant_id) ON DELETE CASCADE',
    'orcamentista_levantamento_item|orcamentista_levantamento_item_ordem_key|UNIQUE (levantamento_id, ordem)',
    'orcamentista_levantamento_item|orcamentista_levantamento_item_escolhas_objeto|CHECK (((escolhas IS NULL) OR (jsonb_typeof(escolhas) = ''object''::text)))'
  ];
  tabelas text[] := ARRAY['orcamentista_levantamento', 'orcamentista_levantamento_item'];
  e       text;
  p       text[];
  faltam  text;
  t       text;
  n       int;
BEGIN
  -- (1) cada constraint, pelo nome e pela definição
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.' || p[1]) AND conname = p[2]
                      AND pg_get_constraintdef(oid) = p[3]) THEN
      faltam := concat_ws('; ', faltam, p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;

  -- (2) o índice parcial: único, sobre (tenant_id, remetente_id), só EM_MONTAGEM
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND tablename = 'orcamentista_levantamento'
                    AND indexname = 'orcamentista_levantamento_um_em_montagem'
                    AND indexdef = 'CREATE UNIQUE INDEX orcamentista_levantamento_um_em_montagem ON public.orcamentista_levantamento USING btree (tenant_id, remetente_id) WHERE (estado = ''EM_MONTAGEM''::text)') THEN
    RAISE EXCEPTION 'verificacao 2: o indice unico parcial orcamentista_levantamento_um_em_montagem nao existe como deve. Nada foi alterado.';
  END IF;

  FOREACH t IN ARRAY tabelas LOOP
    -- (3) RLS ligada
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.' || t) AND relrowsecurity) THEN
      RAISE EXCEPTION 'verificacao 3: % sem RLS. Nada foi alterado.', t;
    END IF;
    -- (4) nenhuma política: o acesso é só por rota, com service_role
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF n <> 0 THEN
      RAISE EXCEPTION 'verificacao 4: % tem % politica(s); o padrao e nenhuma. Nada foi alterado.', t, n;
    END IF;
    -- (5) nenhum privilégio de PUBLIC, anon ou authenticated, perguntado ao catálogo por papel
    IF has_table_privilege('public', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'verificacao 5: % com privilegio para PUBLIC, anon ou authenticated. Nada foi alterado.', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'orcamentista_levantamento e orcamentista_levantamento_item: constraints, indice parcial, RLS sem politica e sem privilegio publico.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid in ('public.orcamentista_levantamento'::regclass, 'public.orcamentista_levantamento_item'::regclass)
--  order by 1, 2;
-- -- esperado: 6 constraints na primeira tabela, 5 na segunda
-- select indexdef from pg_indexes where indexname = 'orcamentista_levantamento_um_em_montagem';
-- select relname, relrowsecurity from pg_class where relname like 'orcamentista_levantamento%' and relkind = 'r';
-- select count(*) from public.orcamentista_levantamento;   -- esperado: 0
