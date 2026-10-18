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
-- ADITIVA. Uma tabela nova, as políticas dela, e um REVOKE ALL mais um GRANT SELECT — sobre ela, e
-- só sobre ela. Nenhum DROP, nenhum UPDATE, nenhum GRANT ou REVOKE em objeto que já existe,
-- nenhuma coluna em tabela que já existe. `tenants.segment` e `tenant_settings` NÃO SÃO TOCADOS.
--
-- REVISÃO DO DONO DO PRODUTO, 18/10/2026 — três mudanças sobre a versão de md5
-- 71fac18a5976a70ed90f7654419d88c2:
--   1. SEM FK em `ativado_por` e `atualizado_por` — a razão está na coluna.
--   2. `authenticated` com SELECT e NADA MAIS (REVOKE ALL + GRANT SELECT) — a razão está antes
--      do COMMIT. Substituiu, na mesma revisão, um REVOKE só de INSERT, UPDATE e DELETE.
--   3. `atualizado_em` num UPDATE: quem grava é a ROTA, sempre, e não há trigger — a razão está
--      na coluna.
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
--                                    (anon NÃO) — o mesmo que `tenant_settings` tem hoje. Os três
--                                    com `arwdDxtm`: SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--                                    REFERENCES e TRIGGER.
--   papéis ......................... service_role BYPASSRLS = true; authenticated e anon = false.
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
  --
  -- SEM FK, E A RAZÃO É DE CLASSE — a mesma do log de reajuste (`20261016000001`, ratificada na
  -- XIII.7). O autor aqui é FATO HISTÓRICO, não referência viva (`fato-vs-referencia.md`):
  -- `ON DELETE CASCADE` apagaria a configuração da conta junto com o usuário, `SET NULL`
  -- violaria a CHECK `orcamentista_config_ativacao_rastreada` enquanto a conta estiver ligada —
  -- a exclusão falharia igual, com mensagem pior —, e `RESTRICT` faria a exclusão de usuário
  -- passar a falhar — mudança de comportamento numa tela que esta rodada não toca. O id fica
  -- gravado mesmo que a linha de `public.users` deixe de existir.
  ativado_por           uuid          NULL,
  ativado_em            timestamptz   NULL,
  atualizado_por        uuid          NULL,
  -- QUEM GRAVA ISTO NUM UPDATE É A ROTA, SEMPRE, e não há trigger. O DEFAULT só vale no INSERT.
  -- `montarGravacao` (`src/utils/orcamentista-config.ts`) põe `atualizado_por` e `atualizado_em`
  -- em TODA gravação, e o caso "toda gravação leva `atualizado_por` e `atualizado_em`" de
  -- `o-orcamentista-do-super-admin.test.tsx` fica vermelho sem eles.
  -- POR QUE NÃO TRIGGER: o trigger carimbaria a HORA e não teria como carimbar o AUTOR — sob
  -- `service_role`, que é o único papel que escreve aqui, `auth.uid()` é nulo. Um UPDATE feito à
  -- mão sairia com o horário novo e o autor da gravação anterior: um par que afirma quem mudou
  -- quando, e mente (`ausente-vs-falso.md`). Sem trigger, o par fica inteiro — os dois do mesmo
  -- escritor. Consequência, e ela é conhecida: um UPDATE feito à mão que não mande os dois NÃO
  -- os move.
  atualizado_em         timestamptz   NOT NULL DEFAULT now(),
  -- Ligado sem quem ligou e quando é ligação sem rastro.
  CONSTRAINT orcamentista_config_ativacao_rastreada CHECK (NOT ativo OR (ativado_por IS NOT NULL AND ativado_em IS NOT NULL))
);

COMMENT ON TABLE public.orcamentista_config IS
  'Configuracao do Orcamentista por tenant. Leitura: o proprio tenant e o super admin. Escrita: SO a rota do super admin (service_role); authenticated so com SELECT, e as politicas de escrita exigem is_super_admin(). Sem linha = desligado. ativado_por e atualizado_por sem FK de proposito - o autor e fato historico e precisa sobreviver a exclusao do usuario.';
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

-- A NEGATIVA EM DUAS CAMADAS INDEPENDENTES. As políticas acima já negam a escrita a quem não é
-- super admin; o privilégio passa a negá-la também, por outro mecanismo. É a lição da varredura
-- de 18/10/2026: as três falhas achadas eram todas PRIVILÉGIO CONCEDIDO onde se supunha que a
-- política protegia. O default ACL dá `arwdDxtm` a `authenticated` em toda tabela nova (medido).
--
-- A FORMA POSITIVA, e não uma lista de comandos — decisão do dono do produto, 18/10/2026. Listar
-- comandos deixa de fora o que ninguém lembrou: TRUNCATE passa por cima da RLS, e REFERENCES e
-- TRIGGER são superfície sem uso nenhum aqui. `REVOKE ALL` + `GRANT SELECT` diz o que vale:
-- `authenticated` tem SELECT, e nada mais. É a mesma lição da varredura, levada até o fim.
--
-- Consequência, e ela é de propósito: nem o super admin escreve aqui pelo PostgREST. A única
-- escrita é a da rota, com `service_role` — que tem privilégio próprio (não é tocado aqui) e é
-- BYPASSRLS (medido). As políticas de escrita ficam como SEGUNDA camada: se o privilégio voltar
-- a ser concedido por engano, elas continuam negando ao tenant.
REVOKE ALL ON public.orcamentista_config FROM authenticated;
GRANT SELECT ON public.orcamentista_config TO authenticated;

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
-- (4) Os privilégios POR COMANDO — os SETE que uma tabela tem, e não só a lista de papéis:
--   select r.papel, string_agg(c.cmd, ',' order by c.cmd) as privilegios
--     from (values ('anon'), ('authenticated'), ('service_role')) r(papel)
--     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) c(cmd)
--    where has_table_privilege(r.papel, 'public.orcamentista_config', c.cmd)
--    group by r.papel order by r.papel;
--   -- esperado, DUAS linhas:
--   --   authenticated  SELECT                                                  ← e NENHUM outro
--   --   service_role   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE  ← a rota, intocada
--   -- anon NÃO aparece: nenhum privilégio.
--   -- (ANTES: a tabela não existia; `tenant_settings` hoje tem os sete em authenticated.)
--
-- (5) As constraints — e NENHUMA FK para `users`:
--   select conname from pg_constraint where conrelid='public.orcamentista_config'::regclass order by 1;
--   -- esperado: orcamentista_config_acao_ao_atingir_teto_check, orcamentista_config_ativacao_rastreada,
--   --   orcamentista_config_pkey, orcamentista_config_tenant_id_fkey,
--   --   orcamentista_config_teto_de_consumo_brl_check, orcamentista_config_valor_adicional_brl_check
--   -- (6 constraints; a única FK é `tenant_id` → `tenants`.)
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
