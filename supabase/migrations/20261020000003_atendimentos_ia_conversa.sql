-- ════════════════════════════════════════════════════════════════════════════════════════
-- Atendimentos I.A. — a CONVERSA pelo WhatsApp: conversa, mensagem, pré-definição e tentativa
-- de número desconhecido
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ NÃO APLICADA. Escrita em 20/10/2026, para ser lida antes de o dono do produto autorizar.
-- ║ Migração é PENDENTE POR PADRÃO (`migration-delivery.md`): o estado dela só muda com a
-- ║ consulta ao schema depois de aplicada.
-- ║
-- ║ ORDEM: a rota do webhook GRAVA nestas tabelas. Esta migration é aplicada ANTES do merge da
-- ║ rota (aprovado pelo dono do produto, 20/10/2026) — mergear antes deixa a rota gravando em
-- ║ tabela inexistente.
-- ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261020000003_atendimentos_ia_conversa.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- ══ A IDENTIFICAÇÃO É DE DOIS FATORES, NESTA ORDEM (dono do produto, 20/10/2026) ══
--   1) o TOKEN DA INSTÂNCIA, que vem no corpo do webhook do WUZAPI → o TENANT, por
--      `users.wuzapi_token`;
--   2) o TELEFONE do remetente → o FUNCIONÁRIO daquele tenant, por `employees.phone`, com
--      `is_active = true` e `status = 'ACTIVE'`.
-- O telefone NUNCA escolhe tenant. Só conversa quem está cadastrado como FUNCIONÁRIO
-- (`employees`), não como usuário (`users`). Medido no banco em 20/10/2026: `users.phone`
-- preenchido em 0 de 20; `employees.phone` em 1 de 16 na plataforma inteira — o sistema real vai
-- responder a uma pessoa só até os funcionários serem cadastrados, e isso é o esperado.
-- Nenhuma tabela existente é tocada por esta migration: a identificação é feita pela rota.
--
-- ══ AS QUATRO TABELAS ══
--   orcamentista_conversa ............. uma conversa de um funcionário de um tenant
--   orcamentista_mensagem ............. cada mensagem, com a DIREÇÃO (entrada / saída)
--   orcamentista_pre_definicao ........ o que a conversa levantou do pedido — de LEITURA
--   orcamentista_tentativa_desconhecida  telefone que não é funcionário do tenant — SEM o texto
--
-- ══ POR QUE NÃO whatsapp_dispatches ══
-- `whatsapp_dispatches` é SÓ DE SAÍDA: 15 colunas, nenhuma de direção nem de recebimento, e
-- `sent_by` é usuário obrigatório. Mensagem recebida não cabe nela, e não se força.
--
-- ══ A PRÉ-DEFINIÇÃO É DE LEITURA ══
-- Os campos são os da maquete aprovada, e SÓ eles (dono do produto, 20/10/2026): seis do
-- produto — tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro — e três da
-- entrega — local, tipo_edificacao, distribuicao_por_pavimento. Ela NÃO cria orçamento no
-- sistema maior, e nenhuma rota dela escreve em tabela do sistema maior.
-- Todos os campos do pedido são NULÁVEIS e SEM DEFAULT: a conversa os preenche aos poucos, e
-- NULL é "ainda não dito" — um default afirmaria o que o funcionário não disse
-- (`ausente-vs-falso.md`).
-- `estado` é texto SEM CHECK: os valores dele não foram definidos, e uma lista aqui seria
-- inventada. O CHECK entra quando o dono do produto a der.
--
-- ══ A TENTATIVA DESCONHECIDA NÃO GUARDA O TEXTO ══
-- Telefone, quando chegou, o id da mensagem e o tenant achado pelo token. O CONTEÚDO de quem
-- não é funcionário NÃO fica no nosso banco (dono do produto, 20/10/2026). Não há coluna para
-- ele — de propósito, para que ninguém o grave "por enquanto".
--
-- ══ O TENANT NÃO PODE DIVERGIR ENTRE A CONVERSA E O QUE PENDE DELA ══
-- Mensagem e pré-definição levam `tenant_id` e `conversa_id`, e a FK é COMPOSTA,
-- (conversa_id, tenant_id) → orcamentista_conversa (id, tenant_id): uma mensagem gravada com o
-- tenant errado é recusada pelo banco, em vez de ficar visível na conta errada.
-- O funcionário, ao contrário, NÃO tem essa trava no banco: ela exigiria uma UNIQUE nova em
-- `employees`, e esta migration não toca tabela existente. A rota garante que o funcionário é
-- do tenant achado pelo token.
--
-- ══ A MENSAGEM DE ENTRADA NÃO SE GRAVA DUAS VEZES ══
-- O WUZAPI reenvia webhook que falhou (`WEBHOOK_RETRY_*`). O id da mensagem do WhatsApp é
-- único por tenant na ENTRADA — UNIQUE parcial —, e o reenvio é recusado pelo banco em vez de
-- virar mensagem duplicada. Na tentativa desconhecida vale o mesmo.
--
-- AS MESMAS REGRAS DO RESTO DA ÁREA (`20261019000001`, `20261020000001`):
--   - RLS ligada, quatro políticas por tabela, todas `is_super_admin()`;
--   - REVOKE ALL de anon e authenticated, e NENHUM GRANT: o acesso é só pela rota de API, com
--     `service_role`. As políticas ficam como segunda camada;
--   - FK com ON DELETE CASCADE: excluir o tenant leva as conversas, as mensagens, as
--     pré-definições e as tentativas; excluir a conversa leva as mensagens e a pré-definição
--     dela; excluir o funcionário (exclusão física — a lógica é `is_active`) leva as conversas.
--
-- ADITIVA. Quatro tabelas novas, as políticas e os índices. Nenhum DROP, nenhum UPDATE, nenhum
-- ALTER em tabela existente, nenhum GRANT.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. A CONVERSA ──────────────────────────────────────────────────────────────────────────
CREATE TABLE public.orcamentista_conversa (
  id           uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id  uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  telefone     text        NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_conversa_id_tenant_key UNIQUE (id, tenant_id)
);

COMMENT ON TABLE public.orcamentista_conversa IS
  'Uma conversa do Atendimentos I.A. com um FUNCIONARIO (employees) de um tenant. O tenant vem do token da instancia (users.wuzapi_token); o funcionario, do telefone, dentro daquele tenant. O telefone nunca escolhe tenant. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_conversa.telefone IS
  'O telefone do remetente como chegou no webhook, para a resposta voltar a ele.';
COMMENT ON CONSTRAINT orcamentista_conversa_id_tenant_key ON public.orcamentista_conversa IS
  'Alvo das FK compostas de mensagem e pre-definicao: o tenant delas nao pode divergir do da conversa.';

-- ── 2. A MENSAGEM, com a direção ───────────────────────────────────────────────────────────
CREATE TABLE public.orcamentista_mensagem (
  id                    uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversa_id           uuid        NOT NULL,
  direcao               text        NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  texto                 text        NULL,
  wuzapi_mensagem_id    text        NULL,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_mensagem_conversa_fkey
    FOREIGN KEY (conversa_id, tenant_id) REFERENCES public.orcamentista_conversa (id, tenant_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.orcamentista_mensagem IS
  'Cada mensagem da conversa, recebida (entrada) ou enviada (saida). Nao e whatsapp_dispatches, que e so de saida. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_mensagem.texto IS
  'O texto da mensagem. NULL quando a mensagem nao tem texto (midia, por exemplo) - nunca string vazia no lugar.';
COMMENT ON COLUMN public.orcamentista_mensagem.wuzapi_mensagem_id IS
  'O id da mensagem no WhatsApp, como veio do webhook. Unico por tenant na entrada: o reenvio do WUZAPI nao vira mensagem duplicada.';

-- ── 3. A PRÉ-DEFINIÇÃO — os campos da maquete, e só eles ───────────────────────────────────
CREATE TABLE public.orcamentista_pre_definicao (
  id                          uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversa_id                 uuid        NOT NULL,
  -- do produto
  tipologia                   text        NULL,
  largura_mm                  numeric     NULL,
  altura_mm                   numeric     NULL,
  quantidade                  numeric     NULL,
  cor_perfil                  text        NULL,
  vidro                       text        NULL,
  -- da entrega
  local                       text        NULL,
  tipo_edificacao             text        NULL,
  distribuicao_por_pavimento  jsonb       NULL,
  estado                      text        NULL,
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_pre_definicao_conversa_fkey
    FOREIGN KEY (conversa_id, tenant_id) REFERENCES public.orcamentista_conversa (id, tenant_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.orcamentista_pre_definicao IS
  'O que a conversa levantou do pedido: os campos da maquete aprovada, e so eles. De LEITURA: nao cria orcamento no sistema maior, e nenhuma rota dela escreve em tabela do sistema maior. Campos nulaveis e sem default: NULL = ainda nao dito. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_pre_definicao.estado IS
  'Texto sem CHECK: os valores ainda nao foram definidos pelo dono do produto. O CHECK entra quando forem.';
COMMENT ON COLUMN public.orcamentista_pre_definicao.distribuicao_por_pavimento IS
  'A distribuicao das esquadrias por pavimento, em jsonb. O formato interno nao foi definido.';

-- ── 4. A TENTATIVA DE NÚMERO DESCONHECIDO — SEM o texto ────────────────────────────────────
CREATE TABLE public.orcamentista_tentativa_desconhecida (
  id                   uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  telefone             text        NOT NULL,
  wuzapi_mensagem_id   text        NULL,
  chegou_em            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orcamentista_tentativa_desconhecida IS
  'Mensagem de telefone que nao e funcionario ativo do tenant achado pelo token. SEM o texto, de proposito: o conteudo de quem nao e funcionario nao fica no banco. Nao se responde, nao se cria tenant nem usuario. So pela rota, com service_role.';

-- ── 5. ÍNDICES ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX orcamentista_conversa_funcionario_idx
  ON public.orcamentista_conversa (tenant_id, employee_id, criado_em DESC);
CREATE INDEX orcamentista_mensagem_conversa_idx
  ON public.orcamentista_mensagem (conversa_id, criado_em);
CREATE UNIQUE INDEX orcamentista_mensagem_entrada_unica
  ON public.orcamentista_mensagem (tenant_id, wuzapi_mensagem_id)
  WHERE direcao = 'entrada' AND wuzapi_mensagem_id IS NOT NULL;
CREATE INDEX orcamentista_pre_definicao_conversa_idx
  ON public.orcamentista_pre_definicao (conversa_id);
CREATE UNIQUE INDEX orcamentista_tentativa_desconhecida_unica
  ON public.orcamentista_tentativa_desconhecida (tenant_id, wuzapi_mensagem_id)
  WHERE wuzapi_mensagem_id IS NOT NULL;
CREATE INDEX orcamentista_tentativa_desconhecida_tenant_idx
  ON public.orcamentista_tentativa_desconhecida (tenant_id, chegou_em DESC);

-- ── 6. RLS — a segunda camada ──────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_conversa               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_mensagem               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_pre_definicao          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_tentativa_desconhecida ENABLE ROW LEVEL SECURITY;

CREATE POLICY orcamentista_conversa_select_super_admin ON public.orcamentista_conversa
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_conversa_insert_super_admin ON public.orcamentista_conversa
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_conversa_update_super_admin ON public.orcamentista_conversa
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_conversa_delete_super_admin ON public.orcamentista_conversa
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_mensagem_select_super_admin ON public.orcamentista_mensagem
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_mensagem_insert_super_admin ON public.orcamentista_mensagem
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_mensagem_update_super_admin ON public.orcamentista_mensagem
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_mensagem_delete_super_admin ON public.orcamentista_mensagem
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_pre_definicao_select_super_admin ON public.orcamentista_pre_definicao
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_pre_definicao_insert_super_admin ON public.orcamentista_pre_definicao
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_pre_definicao_update_super_admin ON public.orcamentista_pre_definicao
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_pre_definicao_delete_super_admin ON public.orcamentista_pre_definicao
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_tentativa_desconhecida_select_super_admin ON public.orcamentista_tentativa_desconhecida
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_tentativa_desconhecida_insert_super_admin ON public.orcamentista_tentativa_desconhecida
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_tentativa_desconhecida_update_super_admin ON public.orcamentista_tentativa_desconhecida
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_tentativa_desconhecida_delete_super_admin ON public.orcamentista_tentativa_desconhecida
  FOR DELETE USING (public.is_super_admin());

-- ── 7. PRIVILÉGIOS — REVOKE ALL, e NENHUM GRANT ────────────────────────────────────────────
-- A mesma razão do passo 8 da `20261019000001`: o default ACL dá os sete privilégios a
-- `authenticated` em toda tabela nova; aqui eles saem todos. Só a rota lê e escreve, com
-- `service_role`.
REVOKE ALL ON public.orcamentista_conversa               FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_mensagem               FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_pre_definicao          FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_tentativa_desconhecida FROM anon, authenticated;

COMMIT;

-- Depois do COMMIT, passo SEPARADO (`migration-delivery.md`):
--   NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar.
--
-- (1) As quatro tabelas existem, com RLS LIGADA:
--   select c.relname, c.relrowsecurity
--     from pg_class c
--    where c.relnamespace = 'public'::regnamespace
--      and c.relname in ('orcamentista_conversa','orcamentista_mensagem',
--                        'orcamentista_pre_definicao','orcamentista_tentativa_desconhecida')
--    order by 1;
--   esperado: 4 linhas, relrowsecurity = true em todas.
--
-- (2) Quatro políticas por tabela, todas com is_super_admin():
--   select tablename, count(*) from pg_policies
--    where schemaname = 'public'
--      and tablename in ('orcamentista_conversa','orcamentista_mensagem',
--                        'orcamentista_pre_definicao','orcamentista_tentativa_desconhecida')
--    group by 1 order by 1;
--   esperado: 4 em cada uma das 4.
--
-- (3) anon e authenticated SEM privilégio nenhum nas quatro:
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('orcamentista_conversa','orcamentista_mensagem',
--                         'orcamentista_pre_definicao','orcamentista_tentativa_desconhecida')
--      and grantee in ('anon','authenticated');
--   esperado: 0 linhas.
--
-- (4) As FK, todas ON DELETE CASCADE:
--   select conrelid::regclass, confrelid::regclass, confdeltype
--     from pg_constraint
--    where contype = 'f'
--      and conrelid::regclass::text in ('orcamentista_conversa','orcamentista_mensagem',
--                                       'orcamentista_pre_definicao',
--                                       'orcamentista_tentativa_desconhecida')
--    order by 1, 2;
--   esperado: 7 linhas, confdeltype = 'c' em todas — conversa → tenants e → employees;
--   mensagem → tenants e → orcamentista_conversa; pré-definição → tenants e →
--   orcamentista_conversa; tentativa → tenants.
--
-- (5) A tentativa NÃO tem coluna de texto:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'orcamentista_tentativa_desconhecida'
--    order by ordinal_position;
--   esperado: id, tenant_id, telefone, wuzapi_mensagem_id, chegou_em — e nada mais.
-- ════════════════════════════════════════════════════════════════════════════════════════
