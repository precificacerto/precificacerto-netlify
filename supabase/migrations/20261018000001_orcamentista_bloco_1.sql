-- ════════════════════════════════════════════════════════════════════════════════════════
-- Orçamentista, BLOCO 1 — segmentação e nicho estruturados, e a configuração por conta
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NÃO APLICADA. Escrita em 18/10/2026 para revisão do dono do produto, que publica o    ║
-- ║ md5 e decide. O código do mesmo PR LÊ e GRAVA `orcamentista_config` — esta migração   ║
-- ║ tem de estar APLICADA ANTES DO MERGE (`migration-delivery.md`, "a ORDEM depende do    ║
-- ║ que a migração CRIA": tabela que o código novo grava → antes ou junto).               ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ADITIVA. Nenhum DROP, nenhum UPDATE, nenhum REVOKE, nenhum GRANT em função existente.
-- `tenants.segment` NÃO É TOCADO — nem coluna, nem dado. A normalização dele ("Indústria" sem
-- espaço no fim é o que vale) é decisão do dono do produto e vem depois, em rodada separada.
--
-- §0, MEDIDO EM 18/10/2026 (somente leitura) — é daqui que sai o "esperado" da VERIFICAÇÃO:
--   tenants ........................ 27, com `segment` preenchido em 11; md5 de `segment` em
--                                    ordem de id = 40ce7cb1ba5e11e38a6e15217605d0a0
--   valores distintos de segment ... Alimentação e Bebidas (21) ×2 · Beleza e Estética (17) ×2 ·
--                                    Comércio Varejista (18) ×1 · Fabrica de esquadrias (21) ×1 ·
--                                    Indústria (9) ×1 · "Indústria " (10, ESPAÇO NO FIM) ×1 ·
--                                    Marcenaria e Móveis (19) ×2 · Tecnologia (10) ×1 · NULL ×16
--   tenant_settings ................ 50 colunas, 27 linhas, RLS ligada, UMA política:
--                                    `tenant_settings_tenant_policy` FOR ALL, USING e CHECK
--                                    `tenant_id = get_auth_tenant_id()`
--   orcamentista_config ............ não existe
--   colunas com nome de segmentação/nicho/categoria: `customers.segment`, `tenants.segment`,
--                                    `cash_entries.category_id`, `cash_entries.expense_category`,
--                                    `fixed_expenses.category_id`, `purchase_invoices.expense_category`,
--                                    `recurring_expense_rules.category`; tabela `cashier_categories`.
--                                    NENHUMA de segmentação de mercado ou nicho.
--   is_super_admin() ............... `EXISTS (users WHERE id = auth.uid() AND role = 'super_admin')`
--   users.is_super_admin x role .... 1 e 1, os mesmos, 0 divergentes (a rota lê a COLUNA; a
--                                    política lê o PAPEL — hoje concordam, e é bom saber que são duas)
--   default ACL de tabela criada por `postgres` em public: postgres, authenticated, service_role
--                                    (anon NÃO) — o mesmo que `tenant_settings` tem hoje.
--
-- ── POR QUE A CONFIGURAÇÃO NÃO MORA EM `tenant_settings` ─────────────────────────────────
-- `tenant_settings` tem UMA política, FOR ALL, que deixa o próprio tenant ESCREVER na linha
-- dele. Um `orcamentista_ativo` ali seria ligável pelo cliente, com o PostgREST, sem passar por
-- tela nenhuma. A regra é "escrita SÓ pelo super admin", e ela só existe em tabela própria, com
-- política própria. Segmentação e nicho, ao contrário, SÃO dado do tenant — ficam ali.
--
-- ── O NOME `segmento_de_mercado`, e não "segmentação" ────────────────────────────────────
-- "Segmentação" JÁ É o rótulo de `tenant_settings.calc_type` na tela de Configurações
-- (`src/pages/configuracoes/index.tsx:1201`): INDUSTRIALIZACAO/REVENDA/SERVICO — o "segmento da
-- cadeia" de `regime-e-segmento-determinam-a-construcao.md`, que decide a construção do preço.
-- Uma segunda coluna chamada "segmentação" ao lado dela seria a ambiguidade que aquela regra
-- existe para impedir. Este é o MERCADO do cliente (Beleza, Tecnologia…), não a cadeia.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 1. SEGMENTO DE MERCADO e NICHO em `tenant_settings` — nullable, sem default
-- ────────────────────────────────────────────────────────────────────────────────────────
-- NULL = não classificado. Sem default de propósito: um default afirmaria um segmento que
-- ninguém escolheu (`ausente-vs-falso.md`).
--
-- O SEGMENTO É LISTA FECHADA, e a lista NÃO é inventada: é a de `SEGMENTS` do onboarding
-- (`src/pages/onboarding.tsx:64-80`), a mesma que o usuário já escolhe hoje, MENOS 'Outro' — que
-- lá abre campo livre, e o campo livre é exatamente o que produziu "Indústria" e "Indústria ".
-- Quem é "Outro" fica com segmento NULL e descreve-se no NICHO.
--
-- O NICHO NÃO TEM LISTA, porque não existe lista em lugar nenhum do sistema — inventá-la seria
-- `No Invention`. Ele é estruturado no que se mede hoje como defeito: sem espaço nas pontas e
-- sem string vazia. A lista do nicho é PENDÊNCIA NOMEADA.
ALTER TABLE public.tenant_settings
  ADD COLUMN segmento_de_mercado text NULL,
  ADD COLUMN nicho               text NULL;

ALTER TABLE public.tenant_settings
  ADD CONSTRAINT tenant_settings_segmento_de_mercado_check CHECK (
    segmento_de_mercado IS NULL OR segmento_de_mercado IN (
      'Alimentação e Bebidas', 'Beleza e Estética', 'Comércio Varejista', 'Comércio Atacadista',
      'Confecção e Moda', 'Construção Civil', 'Consultoria', 'Educação', 'Indústria',
      'Marcenaria e Móveis', 'Metalurgia', 'Saúde', 'Serviços Gerais', 'Tecnologia'
    )
  ),
  ADD CONSTRAINT tenant_settings_nicho_check CHECK (
    nicho IS NULL OR (nicho = btrim(nicho) AND nicho <> '' AND length(nicho) <= 120)
  );

COMMENT ON COLUMN public.tenant_settings.segmento_de_mercado IS
  'Segmento de MERCADO do tenant (Beleza, Tecnologia...). Lista fechada = SEGMENTS do onboarding menos Outro. NAO confundir com calc_type (segmento da CADEIA). NULL = nao classificado.';
COMMENT ON COLUMN public.tenant_settings.nicho IS
  'Nicho dentro do segmento, texto sem espaco nas pontas. Sem lista ainda (pendencia). NULL = nao informado.';

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 2. `orcamentista_config` — UMA linha por tenant, e só o super admin escreve
-- ────────────────────────────────────────────────────────────────────────────────────────
-- Ausência de linha = Orçamentista NUNCA configurado = desligado. A tela do super admin cria a
-- linha na primeira vez que liga ou configura (upsert pela PK).
--
-- AS UNIDADES E O DOMÍNIO DA AÇÃO SÃO DECISÃO DO DONO DO PRODUTO, e estão escritos para serem
-- revisados — não deduzidos:
--   valor_adicional_brl ........ R$ por mês cobrado pelo adicional. NULL = não definido.
--   teto_de_consumo_brl ........ teto de CONSUMO em R$ no mês. NULL = sem teto.
--   acao_ao_atingir_teto ....... BLOQUEAR (para de atender) | AVISAR (segue, e avisa). NULL só
--                                quando não há teto — a constraint abaixo amarra os dois.
-- O sufixo `_brl` está no nome de propósito: um número sem unidade é lido com a unidade de quem
-- lê. Se o teto for em requisições ou tokens, muda o nome, não o comentário.
CREATE TABLE public.orcamentista_config (
  tenant_id             uuid          NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  ativo                 boolean       NOT NULL DEFAULT false,
  valor_adicional_brl   numeric(12,2) NULL CHECK (valor_adicional_brl IS NULL OR valor_adicional_brl >= 0),
  teto_de_consumo_brl   numeric(12,2) NULL CHECK (teto_de_consumo_brl IS NULL OR teto_de_consumo_brl > 0),
  acao_ao_atingir_teto  text          NULL CHECK (acao_ao_atingir_teto IS NULL OR acao_ao_atingir_teto IN ('BLOQUEAR', 'AVISAR')),
  -- "Quem ativou, quando": gravados NA ATIVAÇÃO e preservados depois. Desligar não os apaga —
  -- quem desligou e quando ficam em `atualizado_por` / `atualizado_em`.
  ativado_por           uuid          NULL REFERENCES public.users(id),
  ativado_em            timestamptz   NULL,
  atualizado_por        uuid          NULL REFERENCES public.users(id),
  atualizado_em         timestamptz   NOT NULL DEFAULT now(),
  -- Ligado sem quem ligou e quando é ligação sem rastro.
  CONSTRAINT orcamentista_config_ativacao_rastreada CHECK (NOT ativo OR (ativado_por IS NOT NULL AND ativado_em IS NOT NULL)),
  -- Teto sem ação diria "há limite" sem dizer o que acontece nele; ação sem teto não tem gatilho.
  CONSTRAINT orcamentista_config_teto_e_acao CHECK ((teto_de_consumo_brl IS NULL) = (acao_ao_atingir_teto IS NULL))
);

COMMENT ON TABLE public.orcamentista_config IS
  'Configuracao do Orcamentista por tenant. Leitura: o proprio tenant e o super admin. Escrita: SO o super admin (is_super_admin()). Sem linha = desligado.';

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
-- (1) `tenant_settings` ganhou DUAS colunas, nullable, sem default — e só elas:
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='tenant_settings';
--   -- esperado: 52   (ANTES: 50)
--   select column_name, is_nullable, column_default from information_schema.columns
--    where table_schema='public' and table_name='tenant_settings'
--      and column_name in ('segmento_de_mercado','nicho') order by 1;
--   -- esperado: nicho YES NULL · segmento_de_mercado YES NULL
--
-- (2) A política de `tenant_settings` NÃO mudou:
--   select count(*) from pg_policies where schemaname='public' and tablename='tenant_settings';
--   -- esperado: 1   (ANTES: 1 — tenant_settings_tenant_policy)
--
-- (3) `tenants.segment` NÃO foi tocado — nem um byte:
--   select count(*) filter (where segment is not null),
--          md5(string_agg(coalesce(segment,'<NULL>'), '|' order by id))
--     from public.tenants;
--   -- esperado: 11 · 40ce7cb1ba5e11e38a6e15217605d0a0   (ANTES: os mesmos)
--
-- (4) `orcamentista_config` existe, com RLS LIGADA, vazia:
--   select relrowsecurity, (select count(*) from public.orcamentista_config)
--     from pg_class where oid = 'public.orcamentista_config'::regclass;
--   -- esperado: true · 0   (ANTES: a tabela não existia)
--
-- (5) As QUATRO políticas, e a escrita só por is_super_admin():
--   select policyname, cmd, qual, with_check from pg_policies
--    where schemaname='public' and tablename='orcamentista_config' order by cmd, policyname;
--   -- esperado:
--   --   orcamentista_config_delete_super_admin  DELETE  is_super_admin()   NULL
--   --   orcamentista_config_insert_super_admin  INSERT  NULL               is_super_admin()
--   --   orcamentista_config_select              SELECT  ((tenant_id = get_auth_tenant_id()) OR is_super_admin())  NULL
--   --   orcamentista_config_update_super_admin  UPDATE  is_super_admin()   is_super_admin()
--   -- NENHUMA política com `get_auth_tenant_id()` em INSERT, UPDATE ou DELETE.
--
-- (6) As permissões de tabela seguem o padrão de `tenant_settings` (anon de fora):
--   select string_agg(distinct grantee, ',' order by grantee) from information_schema.role_table_grants
--    where table_schema='public' and table_name='orcamentista_config';
--   -- esperado: authenticated,postgres,service_role
--
-- (7) As constraints:
--   select conname from pg_constraint where conrelid='public.orcamentista_config'::regclass order by 1;
--   -- esperado, entre outras de chave: orcamentista_config_ativacao_rastreada,
--   --   orcamentista_config_teto_e_acao, e as quatro CHECK de coluna
--   select conname from pg_constraint where conrelid='public.tenant_settings'::regclass
--      and conname in ('tenant_settings_segmento_de_mercado_check','tenant_settings_nicho_check');
--   -- esperado: as duas
--
-- (8) `NOTIFY pgrst, 'reload schema';` — não vem junto com o COMMIT.
-- ════════════════════════════════════════════════════════════════════════════════════════
