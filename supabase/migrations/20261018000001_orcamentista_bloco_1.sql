-- ════════════════════════════════════════════════════════════════════════════════════════
-- Orçamentista, BLOCO 1 — a configuração por conta (`orcamentista_config`), e só ela
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NÃO APLICADA. Reescrita em 18/10/2026 com as decisões do dono do produto, que         ║
-- ║ publica o md5 e decide. O código do mesmo PR LÊ e GRAVA `orcamentista_config` — esta  ║
-- ║ migração tem de estar APLICADA ANTES DO MERGE (`migration-delivery.md`, "a ORDEM      ║
-- ║ depende do que a migração CRIA": tabela que o código novo grava → antes ou junto).    ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ADITIVA. Uma tabela nova e as políticas dela. Nenhum DROP, nenhum UPDATE, nenhum REVOKE, nenhum
-- GRANT em função existente, nenhuma coluna em tabela que já existe. `tenants.segment` e
-- `tenant_settings` NÃO SÃO TOCADOS.
--
-- O QUE SAIU DA PRIMEIRA VERSÃO, e por quê — decisões do dono do produto, 18/10/2026:
--   segmento_de_mercado ... SAIU. `tenant_settings.calc_type` (INDUSTRIALIZACAO/REVENDA/SERVICO)
--                           JÁ É a segmentação que o Orçamentista pede. O mercado é OUTRO eixo:
--                           medido, "Marcenaria e Móveis" aparece como INDUSTRIALIZACAO e como
--                           REVENDA, e "Alimentação e Bebidas" também.
--   nicho ................. SAIU. Nada no bloco 1 o lê. Entra quando alguém ler — no motor e no
--                           PDF por nicho. Coluna que nasce sem leitor nasce vazia, e vazio vira
--                           afirmação (`ausente-vs-falso.md`).
-- A disponibilidade por segmento também NÃO é deste bloco: o interruptor do super admin é
-- explícito e vale sozinho. Quando o `calc_type` passar a decidir o que o Orçamentista FAZ (bloco
-- 2 em diante), entra em `SEGMENT_GATED_MODULES` (`src/utils/segment-visibility.ts`), que já é a
-- fonte única — sem mecanismo novo.
--
-- ┌──────────────────────────────────────────────────────────────────────────────────────┐
-- │ PENDÊNCIA NOMEADA — DUAS FONTES PARA "É SUPER ADMIN"                                  │
-- │                                                                                       │
-- │ A ROTA (`requireSuperAdmin`, `src/lib/get-caller-tenant.ts:46`) lê a COLUNA            │
-- │ `users.is_super_admin`. A RLS desta tabela usa a FUNÇÃO `is_super_admin()`, que lê     │
-- │ `users.role = 'super_admin'`. Medido em 18/10/2026: 1 e 1, o mesmo usuário, 0          │
-- │ divergentes. SE DIVERGIREM, a tela mostra uma coisa e o banco faz outra — a rota       │
-- │ deixa passar quem a política recusa, ou o contrário. Não é consertada nesta rodada:   │
-- │ unificar as duas é mexer em quem já é super admin, e isso é decisão própria.          │
-- └──────────────────────────────────────────────────────────────────────────────────────┘
--
-- §0, MEDIDO EM 18/10/2026 (somente leitura) — é daqui que sai o "esperado" da VERIFICAÇÃO:
--   orcamentista_config ............ não existe
--   tenant_settings ................ 50 colunas, UMA política (`tenant_settings_tenant_policy`,
--                                    FOR ALL, `tenant_id = get_auth_tenant_id()`)
--   tenants ........................ 27; `segment` preenchido em 11; md5 de `segment` em ordem de
--                                    id = 40ce7cb1ba5e11e38a6e15217605d0a0
--   is_super_admin() ............... `EXISTS (users WHERE id = auth.uid() AND role = 'super_admin')`
--   get_auth_tenant_id() ........... `select tenant_id from users where id = auth.uid()`
--   default ACL de tabela criada por `postgres` em public: postgres, authenticated, service_role
--                                    (anon NÃO) — o mesmo que `tenant_settings` tem hoje.
--
-- ── POR QUE TABELA PRÓPRIA, e não colunas em `tenant_settings` ───────────────────────────
-- `tenant_settings` tem UMA política, FOR ALL, que deixa o próprio tenant ESCREVER na linha
-- dele. Um "orçamentista ativo" ali seria ligável pelo cliente, pelo PostgREST, sem passar por
-- tela nenhuma. "Escrita SÓ pelo super admin" só existe em tabela própria, com política própria.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Ausência de linha = Orçamentista NUNCA configurado = desligado. A tela do super admin cria a
-- linha na primeira vez que liga ou configura (upsert pela PK).
--
-- AS ESCOLHAS, aprovadas pelo dono do produto em 18/10/2026:
--   valor_adicional_brl ........ R$ por mês cobrado pelo adicional. NULL = não definido.
--   teto_de_consumo_brl ........ teto de CONSUMO em R$ no mês. NULL = sem teto.
--   acao_ao_atingir_teto ....... BLOQUEAR (para de atender) | AVISAR (segue, e avisa).
--                                NOT NULL, DEFAULT 'AVISAR' — e só tem efeito quando há teto.
-- O sufixo `_brl` está no nome de propósito: um número sem unidade é lido com a unidade de quem
-- lê. Se o teto for em requisições ou tokens, muda o nome, não o comentário.
--
-- O DEFAULT 'AVISAR' TIROU UMA CHECK DA PRIMEIRA VERSÃO, e é consequência, não escolha nova: a
-- regra "teto e ação andam juntos" (os dois nulos ou os dois preenchidos) não convive com uma
-- ação que nasce preenchida. Com o default, toda linha tem ação; sem teto, ela não dispara.
CREATE TABLE public.orcamentista_config (
  tenant_id             uuid          NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  ativo                 boolean       NOT NULL DEFAULT false,
  valor_adicional_brl   numeric(12,2) NULL CHECK (valor_adicional_brl IS NULL OR valor_adicional_brl >= 0),
  teto_de_consumo_brl   numeric(12,2) NULL CHECK (teto_de_consumo_brl IS NULL OR teto_de_consumo_brl > 0),
  acao_ao_atingir_teto  text          NOT NULL DEFAULT 'AVISAR' CHECK (acao_ao_atingir_teto IN ('BLOQUEAR', 'AVISAR')),
  -- "Quem ativou, quando": gravados NA ATIVAÇÃO e preservados depois. Desligar não os apaga —
  -- quem desligou e quando ficam em `atualizado_por` / `atualizado_em`.
  ativado_por           uuid          NULL REFERENCES public.users(id),
  ativado_em            timestamptz   NULL,
  atualizado_por        uuid          NULL REFERENCES public.users(id),
  atualizado_em         timestamptz   NOT NULL DEFAULT now(),
  -- Ligado sem quem ligou e quando é ligação sem rastro.
  CONSTRAINT orcamentista_config_ativacao_rastreada CHECK (NOT ativo OR (ativado_por IS NOT NULL AND ativado_em IS NOT NULL))
);

COMMENT ON TABLE public.orcamentista_config IS
  'Configuracao do Orcamentista por tenant. Leitura: o proprio tenant e o super admin. Escrita: SO o super admin (is_super_admin()). Sem linha = desligado.';
COMMENT ON COLUMN public.orcamentista_config.acao_ao_atingir_teto IS
  'BLOQUEAR | AVISAR. Default AVISAR. So tem efeito quando teto_de_consumo_brl nao e nulo.';

-- RLS LIGADA. As políticas são escritas UMA A UMA, e a de escrita diz `is_super_admin()` com
-- todas as letras — ela NÃO herda o padrão `tenant_id = get_auth_tenant_id()` das outras tabelas,
-- que daria ao tenant a chave da própria conta.
ALTER TABLE public.orcamentista_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY orcamentista_config_select ON public.orcamentista_config
  FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY orcamentista_config_insert_super_admin ON public.orcamentista_config
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY orcamentista_config_update_super_admin ON public.orcamentista_config
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY orcamentista_config_delete_super_admin ON public.orcamentista_config
  FOR DELETE
  USING (public.is_super_admin());

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar. O esperado vem da medição de 18/10/2026, acima.
--
-- (1) `orcamentista_config` existe, com RLS LIGADA, vazia:
--   select relrowsecurity, (select count(*) from public.orcamentista_config)
--     from pg_class where oid = 'public.orcamentista_config'::regclass;
--   -- esperado: true · 0   (ANTES: a tabela não existia)
--
-- (2) As colunas, e o default da ação:
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema='public' and table_name='orcamentista_config' order by ordinal_position;
--   -- esperado: 10 colunas; acao_ao_atingir_teto  text  NO  'AVISAR'::text
--
-- (3) As QUATRO políticas, e a escrita só por is_super_admin():
--   select policyname, cmd, qual, with_check from pg_policies
--    where schemaname='public' and tablename='orcamentista_config' order by cmd, policyname;
--   -- esperado:
--   --   orcamentista_config_delete_super_admin  DELETE  is_super_admin()   NULL
--   --   orcamentista_config_insert_super_admin  INSERT  NULL               is_super_admin()
--   --   orcamentista_config_select              SELECT  ((tenant_id = get_auth_tenant_id()) OR is_super_admin())  NULL
--   --   orcamentista_config_update_super_admin  UPDATE  is_super_admin()   is_super_admin()
--   -- NENHUMA política com `get_auth_tenant_id()` em INSERT, UPDATE ou DELETE.
--
-- (4) As permissões de tabela seguem o padrão de `tenant_settings` (anon de fora):
--   select string_agg(distinct grantee, ',' order by grantee) from information_schema.role_table_grants
--    where table_schema='public' and table_name='orcamentista_config';
--   -- esperado: authenticated,postgres,service_role
--
-- (5) As constraints:
--   select conname from pg_constraint where conrelid='public.orcamentista_config'::regclass order by 1;
--   -- esperado: orcamentista_config_acao_ao_atingir_teto_check, orcamentista_config_ativacao_rastreada,
--   --   orcamentista_config_ativado_por_fkey, orcamentista_config_atualizado_por_fkey,
--   --   orcamentista_config_pkey, orcamentista_config_tenant_id_fkey,
--   --   orcamentista_config_teto_de_consumo_brl_check, orcamentista_config_valor_adicional_brl_check
--
-- (6) NADA MAIS FOI TOCADO:
--   select (select count(*) from information_schema.columns where table_schema='public' and table_name='tenant_settings'),
--          (select count(*) from pg_policies where schemaname='public' and tablename='tenant_settings'),
--          (select count(*) filter (where segment is not null) from public.tenants),
--          (select md5(string_agg(coalesce(segment,'<NULL>'), '|' order by id)) from public.tenants);
--   -- esperado: 50 · 1 · 11 · 40ce7cb1ba5e11e38a6e15217605d0a0   (ANTES: os mesmos)
--
-- (7) `NOTIFY pgrst, 'reload schema';` — não vem junto com o COMMIT.
-- ════════════════════════════════════════════════════════════════════════════════════════
