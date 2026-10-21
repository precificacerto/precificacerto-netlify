-- ════════════════════════════════════════════════════════════════════════════════════════
-- Atendimentos I.A. — a CONVERSA pelo WhatsApp: remetente autorizado, conversa, mensagem,
-- pré-definição e tentativa de número desconhecido
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ NÃO APLICADA. Escrita em 20/10/2026 e revista em 21/10/2026, para ser lida antes de o dono
-- ║ do produto autorizar. Migração é PENDENTE POR PADRÃO (`migration-delivery.md`): o estado
-- ║ dela só muda com a consulta ao schema depois de aplicada.
-- ║
-- ║ ORDEM: a rota do webhook GRAVA nestas tabelas. Esta migration é aplicada ANTES do merge da
-- ║ rota (aprovado pelo dono do produto, 20/10/2026) — mergear antes deixa a rota gravando em
-- ║ tabela inexistente.
-- ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261020000003_atendimentos_ia_conversa.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- ══ QUEM FALA COM O ORÇAMENTISTA É UMA LISTA ATRIBUÍDA (dono do produto, 21/10/2026) ══
-- A identificação tem dois fatores, nesta ordem:
--   1) o TOKEN DA INSTÂNCIA, que vem no corpo do webhook do WUZAPI → o TENANT, por
--      `users.wuzapi_token`;
--   2) o TELEFONE do remetente → um REMETENTE AUTORIZADO daquele tenant, ATIVO, na lista
--      `orcamentista_remetente_autorizado`.
-- O telefone NUNCA escolhe tenant. E a autorização NÃO vem do cadastro de funcionários: ser
-- vendedor não basta, e a pessoa pode nem estar em `employees`. O motivo é medido: em
-- 20/10/2026, `employees.phone` tinha 1 telefone preenchido na plataforma inteira — amarrar a
-- autorização ali seria amarrar em registro vazio.
-- A versão de 20/10/2026 deste arquivo dizia o contrário ("só conversa quem é funcionário
-- ativo"); a decisão de 21/10/2026 a substitui.
--
-- ══ O VÍNCULO COM O FUNCIONÁRIO É OPCIONAL, E NUNCA AUTORIZA ══
-- `orcamentista_remetente_autorizado.employee_id` é NULÁVEL, com ON DELETE SET NULL: é só um
-- vínculo, para quem quiser saber que aquele autorizado também é funcionário. A autorização é a
-- linha na lista com `ativo = true` — NUNCA se deriva autorização do `employee_id`.
--
-- ══ EXCLUIR O FUNCIONÁRIO NÃO APAGA A CONVERSA — AGORA POR DESENHO ══
-- A decisão do dono do produto de 21/10/2026 — excluir funcionário não apaga as mensagens —
-- continua valendo, e deixou de ser uma regra à parte: a conversa não aponta mais para
-- `employees`, aponta para o REMETENTE AUTORIZADO. Excluir o funcionário só anula o vínculo
-- opcional no remetente (SET NULL); o remetente, a conversa, as mensagens e a pré-definição
-- ficam.
--
-- ══ TIRAR A AUTORIZAÇÃO NÃO APAGA NEM DESANCORA CONVERSA ══
-- A conversa aponta para o remetente com FK COMPOSTA (remetente_id, tenant_id) e
-- ON DELETE RESTRICT. Tirar a autorização de alguém é operação de rotina e não pode apagar
-- conversa (CASCADE) nem deixá-la sem dono (SET NULL). Para tirar o acesso, a empresa põe
-- `ativo = false`; a linha continua. Excluir de fato um remetente que tem conversa é RECUSADO
-- pelo banco.
-- Excluir o TENANT continua levando tudo: o CASCADE do tenant apaga as conversas pelo caminho
-- dele, e o RESTRICT do remetente não chega a ser violado.
--
-- ══ AS CINCO TABELAS ══
--   orcamentista_remetente_autorizado . a lista de quem pode falar com o orçamentista, por tenant
--   orcamentista_conversa ............. uma conversa de um remetente autorizado
--   orcamentista_mensagem ............. cada mensagem, com a DIREÇÃO (entrada / saída)
--   orcamentista_pre_definicao ........ o que a conversa levantou do pedido — de LEITURA
--   orcamentista_tentativa_desconhecida  telefone fora da lista ativa do tenant — SEM o texto
--
-- ══ O TELEFONE DA LISTA É SÓ DÍGITOS ══
-- `UNIQUE (tenant_id, telefone)` só significa alguma coisa se o mesmo número for escrito do mesmo
-- jeito: um CHECK aceita só dígitos (DDI + DDD + número, 10 a 13). Decisão de quem escreveu,
-- para o dono do produto conferir. LIMITE: o mesmo celular com e sem o 9º dígito passa no CHECK
-- e na UNIQUE como dois números — quem grava normaliza (`normalizePhoneBR`), e a rota compara
-- com as duas variantes.
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
-- NULL é "ainda não dito" — um default afirmaria o que ninguém disse (`ausente-vs-falso.md`).
-- `estado` é texto SEM CHECK: os valores dele não foram definidos, e uma lista aqui seria
-- inventada. O CHECK entra quando o dono do produto a der.
--
-- ══ A TENTATIVA DESCONHECIDA NÃO GUARDA O TEXTO ══
-- Telefone, quando chegou, o id da mensagem e o tenant achado pelo token. O CONTEÚDO de quem não
-- está na lista ativa NÃO fica no nosso banco (dono do produto, 20/10/2026). Não há coluna para
-- ele — de propósito, para que ninguém o grave "por enquanto".
--
-- ══ O TENANT NÃO PODE DIVERGIR ENTRE A CONVERSA E O QUE PENDE DELA ══
-- As FK internas são COMPOSTAS com o tenant: conversa → remetente por (remetente_id, tenant_id);
-- mensagem e pré-definição → conversa por (conversa_id, tenant_id). Uma linha gravada com o
-- tenant errado é recusada pelo banco, em vez de ficar visível na conta errada.
--
-- ══ A MENSAGEM DE ENTRADA NÃO SE GRAVA DUAS VEZES ══
-- O WUZAPI reenvia webhook que falhou (`WEBHOOK_RETRY_*`). O id da mensagem do WhatsApp é
-- único por tenant na ENTRADA — UNIQUE parcial —, e o reenvio é recusado pelo banco em vez de
-- virar mensagem duplicada. Na tentativa desconhecida vale o mesmo.
--
-- ══ `ativo` NÃO TEM DEFAULT ══
-- Quem põe alguém na lista diz se a autorização está ativa. Um default afirmaria uma
-- autorização que ninguém deu.
--
-- AS MESMAS REGRAS DO RESTO DA ÁREA (`20261019000001`, `20261020000001`):
--   - RLS ligada, quatro políticas por tabela, todas `is_super_admin()`;
--   - REVOKE ALL de anon e authenticated, e NENHUM GRANT: o acesso é só pela rota de API, com
--     `service_role`. As políticas ficam como segunda camada;
--   - excluir o tenant leva tudo (CASCADE em toda FK para `tenants`). Os modos de exclusão de
--     cada FK estão na verificação (4).
--
-- ADITIVA. Cinco tabelas novas, as políticas e os índices. Nenhum DROP, nenhum UPDATE, nenhum
-- ALTER em tabela existente, nenhum GRANT.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. O REMETENTE AUTORIZADO — a lista atribuída ──────────────────────────────────────────
CREATE TABLE public.orcamentista_remetente_autorizado (
  id           uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  telefone     text        NOT NULL CHECK (telefone ~ '^[0-9]{10,13}$'),
  nome         text        NULL,
  employee_id  uuid        NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ativo        boolean     NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_remetente_autorizado_telefone_key UNIQUE (tenant_id, telefone),
  CONSTRAINT orcamentista_remetente_autorizado_id_tenant_key UNIQUE (id, tenant_id)
);

COMMENT ON TABLE public.orcamentista_remetente_autorizado IS
  'A lista atribuida de quem pode falar com o orcamentista, por tenant (decisao do dono do produto, 21/10/2026). A autorizacao e a linha com ativo = true - nunca o cadastro de funcionarios. Para tirar o acesso, ativo = false; a linha continua. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_remetente_autorizado.telefone IS
  'So digitos (DDI + DDD + numero). Unico por tenant.';
COMMENT ON COLUMN public.orcamentista_remetente_autorizado.employee_id IS
  'Vinculo OPCIONAL com o funcionario: o autorizado pode nao ser funcionario. Nunca se deriva autorizacao daqui. ON DELETE SET NULL: excluir o funcionario nao tira o autorizado da lista.';
COMMENT ON COLUMN public.orcamentista_remetente_autorizado.ativo IS
  'Sem default: quem poe alguem na lista diz se a autorizacao esta ativa.';
COMMENT ON CONSTRAINT orcamentista_remetente_autorizado_id_tenant_key ON public.orcamentista_remetente_autorizado IS
  'Alvo da FK composta da conversa: o tenant da conversa nao pode divergir do do remetente.';

-- ── 2. A CONVERSA ──────────────────────────────────────────────────────────────────────────
CREATE TABLE public.orcamentista_conversa (
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  remetente_id  uuid        NOT NULL,
  telefone      text        NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_conversa_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT orcamentista_conversa_remetente_fkey
    FOREIGN KEY (remetente_id, tenant_id) REFERENCES public.orcamentista_remetente_autorizado (id, tenant_id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.orcamentista_conversa IS
  'Uma conversa do Atendimentos I.A. com um REMETENTE AUTORIZADO de um tenant. O tenant vem do token da instancia (users.wuzapi_token); o remetente, do telefone, na lista ativa daquele tenant. O telefone nunca escolhe tenant. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_conversa.remetente_id IS
  'O remetente autorizado. ON DELETE RESTRICT: tirar a autorizacao (ativo = false) nao apaga nem desancora a conversa, e excluir um remetente que tem conversa e recusado.';
COMMENT ON COLUMN public.orcamentista_conversa.telefone IS
  'O telefone do remetente como chegou no webhook, para a resposta voltar a ele.';
COMMENT ON CONSTRAINT orcamentista_conversa_id_tenant_key ON public.orcamentista_conversa IS
  'Alvo das FK compostas de mensagem e pre-definicao: o tenant delas nao pode divergir do da conversa.';

-- ── 3. A MENSAGEM, com a direção ───────────────────────────────────────────────────────────
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

-- ── 4. A PRÉ-DEFINIÇÃO — os campos da maquete, e só eles ───────────────────────────────────
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
  atualizado_em               timestamptz NULL,
  CONSTRAINT orcamentista_pre_definicao_conversa_fkey
    FOREIGN KEY (conversa_id, tenant_id) REFERENCES public.orcamentista_conversa (id, tenant_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.orcamentista_pre_definicao IS
  'O que a conversa levantou do pedido: os campos da maquete aprovada, e so eles. De LEITURA: nao cria orcamento no sistema maior, e nenhuma rota dela escreve em tabela do sistema maior. Campos nulaveis e sem default: NULL = ainda nao dito. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_pre_definicao.estado IS
  'Texto sem CHECK: os valores ainda nao foram definidos pelo dono do produto. O CHECK entra quando forem.';
COMMENT ON COLUMN public.orcamentista_pre_definicao.distribuicao_por_pavimento IS
  'A distribuicao das esquadrias por pavimento, em jsonb. O formato interno nao foi definido.';
COMMENT ON COLUMN public.orcamentista_pre_definicao.atualizado_em IS
  'Nulavel e sem default: NULL = nunca foi alterada depois de criada. Quem atualiza grava.';

-- ── 5. A TENTATIVA DE NÚMERO DESCONHECIDO — SEM o texto ────────────────────────────────────
CREATE TABLE public.orcamentista_tentativa_desconhecida (
  id                   uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  telefone             text        NOT NULL,
  wuzapi_mensagem_id   text        NULL,
  chegou_em            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orcamentista_tentativa_desconhecida IS
  'Mensagem de telefone que nao esta na lista ativa de remetentes autorizados do tenant achado pelo token. SEM o texto, de proposito: o conteudo de quem nao esta autorizado nao fica no banco. Nao se responde, nao se cria tenant nem usuario. So pela rota, com service_role.';

-- ── 6. ÍNDICES ─────────────────────────────────────────────────────────────────────────────
-- (tenant_id, telefone) do remetente já é índice, pela UNIQUE acima.
CREATE INDEX orcamentista_remetente_autorizado_employee_idx
  ON public.orcamentista_remetente_autorizado (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX orcamentista_conversa_remetente_idx
  ON public.orcamentista_conversa (tenant_id, remetente_id, criado_em DESC);
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

-- ── 7. RLS — a segunda camada ──────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_remetente_autorizado   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_conversa               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_mensagem               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_pre_definicao          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_tentativa_desconhecida ENABLE ROW LEVEL SECURITY;

CREATE POLICY orcamentista_remetente_autorizado_select_super_admin ON public.orcamentista_remetente_autorizado
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_remetente_autorizado_insert_super_admin ON public.orcamentista_remetente_autorizado
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_remetente_autorizado_update_super_admin ON public.orcamentista_remetente_autorizado
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_remetente_autorizado_delete_super_admin ON public.orcamentista_remetente_autorizado
  FOR DELETE USING (public.is_super_admin());

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

-- ── 8. PRIVILÉGIOS — REVOKE ALL, e NENHUM GRANT ────────────────────────────────────────────
-- A mesma razão do passo 8 da `20261019000001`: o default ACL dá os sete privilégios a
-- `authenticated` em toda tabela nova; aqui eles saem todos. Só a rota lê e escreve, com
-- `service_role`.
REVOKE ALL ON public.orcamentista_remetente_autorizado   FROM anon, authenticated;
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
-- (1) As cinco tabelas existem, com RLS LIGADA:
--   select c.relname, c.relrowsecurity
--     from pg_class c
--    where c.relnamespace = 'public'::regnamespace
--      and c.relname in ('orcamentista_remetente_autorizado','orcamentista_conversa',
--                        'orcamentista_mensagem','orcamentista_pre_definicao',
--                        'orcamentista_tentativa_desconhecida')
--    order by 1;
--   esperado: 5 linhas, relrowsecurity = true em todas.
--
-- (2) Quatro políticas por tabela, todas com is_super_admin() — 20 no total:
--   select tablename, count(*) from pg_policies
--    where schemaname = 'public'
--      and tablename in ('orcamentista_remetente_autorizado','orcamentista_conversa',
--                        'orcamentista_mensagem','orcamentista_pre_definicao',
--                        'orcamentista_tentativa_desconhecida')
--    group by 1 order by 1;
--   esperado: 4 em cada uma das 5.
--
-- (3) anon e authenticated SEM privilégio nenhum nas cinco:
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('orcamentista_remetente_autorizado','orcamentista_conversa',
--                         'orcamentista_mensagem','orcamentista_pre_definicao',
--                         'orcamentista_tentativa_desconhecida')
--      and grantee in ('anon','authenticated');
--   esperado: 0 linhas.
--
-- (4) As FK e os seus modos de exclusão:
--   select conrelid::regclass, confrelid::regclass, confdeltype
--     from pg_constraint
--    where contype = 'f'
--      and conrelid::regclass::text in ('orcamentista_remetente_autorizado',
--                                       'orcamentista_conversa','orcamentista_mensagem',
--                                       'orcamentista_pre_definicao',
--                                       'orcamentista_tentativa_desconhecida')
--    order by 1, 2;
--   esperado: 9 linhas —
--     remetente_autorizado → tenants ................ 'c' (CASCADE)
--     remetente_autorizado → employees .............. 'n' (SET NULL)
--     conversa → tenants ............................ 'c'
--     conversa → orcamentista_remetente_autorizado .. 'r' (RESTRICT)
--     mensagem → tenants ............................ 'c'
--     mensagem → orcamentista_conversa .............. 'c'
--     pre_definicao → tenants ....................... 'c'
--     pre_definicao → orcamentista_conversa ......... 'c'
--     tentativa_desconhecida → tenants .............. 'c'
--   E NENHUMA FK de conversa para employees.
--
-- (5) A tentativa NÃO tem coluna de texto:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'orcamentista_tentativa_desconhecida'
--    order by ordinal_position;
--   esperado: id, tenant_id, telefone, wuzapi_mensagem_id, chegou_em — e nada mais.
--
-- (6) COMPORTAMENTO — excluir a empresa com conversa leva tudo, numa instrução só.
--   Roteiro, num tenant de teste (NUNCA num tenant real):
--     a. um remetente autorizado nele, ativo;
--     b. uma conversa desse remetente;
--     c. uma mensagem e uma pré-definição dessa conversa;
--     d. DELETE FROM public.tenants WHERE id = '<o tenant de teste>';   -- uma única instrução
--     e. contar, para aquele tenant_id, as linhas das cinco tabelas:
--        select (select count(*) from public.orcamentista_remetente_autorizado   where tenant_id = '<t>'),
--               (select count(*) from public.orcamentista_conversa               where tenant_id = '<t>'),
--               (select count(*) from public.orcamentista_mensagem               where tenant_id = '<t>'),
--               (select count(*) from public.orcamentista_pre_definicao          where tenant_id = '<t>'),
--               (select count(*) from public.orcamentista_tentativa_desconhecida where tenant_id = '<t>');
--   esperado: o DELETE com sucesso, e 0, 0, 0, 0, 0.
--   POR QUE ESTE CASO EXISTE: a conversa referencia o remetente com ON DELETE RESTRICT, e a
--   checagem do RESTRICT não é adiável. Se o gatilho do remetente disparar antes do da conversa,
--   a exclusão da empresa falha. Passou no Postgres descartável em 21/10/2026; a documentação do
--   PostgreSQL 16 não garante a ordem de disparo entre gatilhos de tabelas diferentes. Este caso
--   existe para quebrar alto se isso mudar.
-- ════════════════════════════════════════════════════════════════════════════════════════
