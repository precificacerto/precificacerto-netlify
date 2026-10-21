-- ════════════════════════════════════════════════════════════════════════════════════════
-- WhatsApp — UMA CONEXÃO POR CANAL POR EMPRESA
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ NÃO APLICADA. Escrita em 21/10/2026, para ser lida antes de o dono do produto autorizar.
-- ║ Migração é PENDENTE POR PADRÃO (`migration-delivery.md`): o estado dela só muda com a
-- ║ consulta ao schema depois de aplicada.
-- ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261021000001_conexoes_whatsapp_por_canal.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- ══ O QUE O DONO DO PRODUTO PEDIU (21/10/2026) ══
-- TRÊS canais de WhatsApp por empresa:
--   ENVIO ......... enviados e confirmações — o que existe hoje
--   REVENDA ....... a empresa que repassa propostas de orçamento adiante
--   ORCAMENTISTA .. o atendimento do Atendimentos I.A.
--
-- ══ O QUE BLOQUEIA HOJE, MEDIDO NO BANCO DE PRODUÇÃO (21/10/2026) ══
-- A conexão é `users.wuzapi_token`: uma coluna numa linha de usuário, logo UMA por usuário. 3
-- usuários têm token, 1 por tenant, em 3 tenants. Não existe tabela de conexões. A
-- `whatsapp_config` do arquivo `20260213100000_whatsapp_employees_customers.sql` NÃO EXISTE na
-- produção — aquele arquivo nunca foi aplicado.
--
-- ══ O DONO DA CONEXÃO É O TENANT E O CANAL ══
-- `UNIQUE (tenant_id, canal)`: uma conexão por canal por empresa. `conectado_por` é só o REGISTRO
-- de quem leu o QR Code — não é dono de nada, e excluir esse usuário (ON DELETE SET NULL) não
-- derruba a conexão da empresa.
-- (Diferente de `importado_por` em `20261020000001`, que é sem FK: aqui a FK com SET NULL foi
-- pedida pelo dono do produto.)
--
-- ══ O CANAL É UM ENUM NOVO ══
-- `whatsapp_canal`, e NÃO o `dispatch_type` de `whatsapp_dispatches`: aquele classifica a
-- MENSAGEM enviada (MESSAGE, BUDGET, REMINDER, MARKETING); este classifica a CONEXÃO. Reaproveitar
-- juntaria duas perguntas diferentes numa lista só, e acrescentar um valor a um mudaria o outro.
--
-- ══ O TOKEN É ÚNICO NA TABELA INTEIRA — DECISÃO DE QUEM ESCREVEU, PARA O DONO DO PRODUTO CONFERIR ══
-- O webhook de entrada do WUZAPI identifica a instância pelo `token` que vem no corpo, e é por ele
-- que se acha o tenant (e agora o canal). Duas linhas com o mesmo token — dois canais, ou duas
-- empresas, na mesma instância — tornariam essa resolução ambígua. `UNIQUE (wuzapi_token)` faz o
-- banco recusar o caso em vez de a rota escolher. Se o desenho for uma instância servir a dois
-- canais, é esta constraint que sai.
--
-- ══ `ativo` NÃO TEM DEFAULT ══
-- NOT NULL e sem default: quem grava a conexão diz se ela está ativa. Um default afirmaria o
-- estado de uma conexão que ninguém conferiu (`ausente-vs-falso.md`).
--
-- ══ ADITIVA, E SÓ ══
-- Um tipo novo, uma tabela nova, as políticas e os índices. NENHUM ALTER em `users`, nenhum DROP,
-- NENHUMA CÓPIA DE DADOS. Os 3 tokens que existem em `users.wuzapi_token` NÃO são migrados aqui:
-- é passo separado, que o dono do produto autoriza depois de ler. E a rota de envio CONTINUA
-- lendo `users.wuzapi_token` — trocar a leitura é trabalho seguinte, com portão próprio.
--
-- AS MESMAS REGRAS DA ÁREA (`20261019000001`, `20261020000001`):
--   - RLS ligada, quatro políticas, todas `is_super_admin()`;
--   - REVOKE ALL de anon e authenticated, e NENHUM GRANT: o acesso é só pela rota de API, com
--     `service_role`. O token é credencial da instância, e não chega ao navegador;
--   - FK para `tenants` com ON DELETE CASCADE: excluir a empresa leva as conexões dela.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. O CANAL ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE public.whatsapp_canal AS ENUM ('ENVIO', 'REVENDA', 'ORCAMENTISTA');

COMMENT ON TYPE public.whatsapp_canal IS
  'O canal de uma conexao de WhatsApp da empresa: ENVIO (enviados e confirmacoes), REVENDA (repasse de propostas de orcamento), ORCAMENTISTA (atendimento do Atendimentos I.A.). Nao e o dispatch_type, que classifica a mensagem.';

-- ── 2. A CONEXÃO ───────────────────────────────────────────────────────────────────────────
CREATE TABLE public.whatsapp_conexao (
  id             uuid                  NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid                  NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  canal          public.whatsapp_canal NOT NULL,
  wuzapi_token   text                  NOT NULL,
  conectado_por  uuid                  NULL REFERENCES public.users(id) ON DELETE SET NULL,
  conectado_em   timestamptz           NOT NULL DEFAULT now(),
  ativo          boolean               NOT NULL,
  CONSTRAINT whatsapp_conexao_canal_key UNIQUE (tenant_id, canal),
  CONSTRAINT whatsapp_conexao_token_key UNIQUE (wuzapi_token)
);

COMMENT ON TABLE public.whatsapp_conexao IS
  'Uma conexao de WhatsApp (instancia WUZAPI) por canal por empresa. O dono e o tenant e o canal; conectado_por e so o registro de quem leu o QR Code. So pela rota, com service_role.';
COMMENT ON COLUMN public.whatsapp_conexao.wuzapi_token IS
  'O token da instancia no WUZAPI. Unico na tabela inteira: o webhook de entrada acha tenant e canal por ele, e dois donos para o mesmo token tornariam isso ambiguo.';
COMMENT ON COLUMN public.whatsapp_conexao.conectado_por IS
  'Quem leu o QR Code. Registro, nao dono: excluir o usuario (ON DELETE SET NULL) nao derruba a conexao da empresa.';
COMMENT ON COLUMN public.whatsapp_conexao.ativo IS
  'Sem default: quem grava a conexao diz se ela esta ativa.';

-- (tenant_id, canal) e wuzapi_token já são índices, pelas duas UNIQUE acima.

-- ── 3. RLS — a segunda camada ──────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_conexao ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_conexao_select_super_admin ON public.whatsapp_conexao
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY whatsapp_conexao_insert_super_admin ON public.whatsapp_conexao
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY whatsapp_conexao_update_super_admin ON public.whatsapp_conexao
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY whatsapp_conexao_delete_super_admin ON public.whatsapp_conexao
  FOR DELETE USING (public.is_super_admin());

-- ── 4. PRIVILÉGIOS — REVOKE ALL, e NENHUM GRANT ────────────────────────────────────────────
-- O default ACL dá os sete privilégios a `authenticated` em toda tabela nova; aqui eles saem
-- todos. Só a rota lê e escreve, com `service_role`.
REVOKE ALL ON public.whatsapp_conexao FROM anon, authenticated;

COMMIT;

-- Depois do COMMIT, passo SEPARADO (`migration-delivery.md`):
--   NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar.
--
-- (1) O tipo, com os três canais, na ordem:
--   select enum_range(null::public.whatsapp_canal);
--   esperado: {ENVIO,REVENDA,ORCAMENTISTA}
--
-- (2) A tabela, com RLS LIGADA, e quatro políticas:
--   select relrowsecurity from pg_class where oid = 'public.whatsapp_conexao'::regclass;
--   select count(*) from pg_policies where schemaname = 'public' and tablename = 'whatsapp_conexao';
--   esperado: true; 4.
--
-- (3) anon e authenticated SEM privilégio nenhum:
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'whatsapp_conexao'
--      and grantee in ('anon','authenticated');
--   esperado: 0 linhas.
--
-- (4) As FK: tenants em CASCADE, users em SET NULL:
--   select confrelid::regclass, confdeltype from pg_constraint
--    where contype = 'f' and conrelid = 'public.whatsapp_conexao'::regclass order by 1;
--   esperado: tenants 'c'; users 'n'.
--
-- (5) As duas UNIQUE:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where contype = 'u' and conrelid = 'public.whatsapp_conexao'::regclass order by 1;
--   esperado: whatsapp_conexao_canal_key UNIQUE (tenant_id, canal);
--             whatsapp_conexao_token_key UNIQUE (wuzapi_token).
--
-- (6) NADA foi copiado, e users não foi tocado:
--   select count(*) from public.whatsapp_conexao;
--   esperado: 0.
-- ════════════════════════════════════════════════════════════════════════════════════════
