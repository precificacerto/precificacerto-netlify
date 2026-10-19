-- ════════════════════════════════════════════════════════════════════════════════════════
-- Atendimentos I.A., BLOCO 2B.1 — o catálogo da plataforma: nicho → fornecedor → tabela, a
-- tabela em uso por conta, o modelo e o nicho da conta, e o bucket dos arquivos
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NÃO APLICADA. Escrita em 19/10/2026 para revisão do dono do produto, que publica o    ║
-- ║ md5 e decide. Nenhum código deste branch lê ou grava estas tabelas ainda — quando o   ║
-- ║ código vier, esta migração tem de estar APLICADA ANTES OU JUNTO do merge dele         ║
-- ║ (`migration-delivery.md`, "a ORDEM depende do que a migração CRIA").                  ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ADITIVA. Quatro tabelas novas e as políticas delas; DUAS colunas novas em
-- `orcamentista_config`; um bucket novo e quatro políticas novas em `storage.objects`, todas
-- presas a ESTE bucket. Nenhum DROP, nenhum UPDATE, nenhum GRANT. Os REVOKE são só sobre as
-- quatro tabelas novas. `valor_adicional_brl`, `acao_ao_atingir_teto` e `teto_de_consumo_brl`
-- NÃO SÃO TOCADOS, nem as políticas e os privilégios que `orcamentista_config` já tem.
--
-- A FORMA vem do EPIC (`docs/prd/EPIC-ATENDIMENTOS-IA.md`, §2 e §3) e do mockup
-- (`docs/prd/atendimentos-ia-mockup.html`): modelo de atendimento → nicho → fornecedor → tabela
-- → motor. O fornecedor é DA PLATAFORMA, não de uma conta (§3.3); o motor vem PRESO à tabela e
-- nunca é escolhido à parte (§3.1); o motor é OBRIGATÓRIO em toda tabela (§3.8).
--
-- §0, MEDIDO EM 19/10/2026 (somente leitura) — é daqui que sai o "esperado" da VERIFICAÇÃO:
--   orcamentista_nicho / _fornecedor / _tabela / _conta_tabela ... não existem
--   orcamentista_config ... 9 colunas (tenant_id, ativo, valor_adicional_brl,
--                           teto_de_consumo_brl, acao_ao_atingir_teto, ativado_por, ativado_em,
--                           atualizado_por, atualizado_em); 6 constraints; RLS ligada; 4
--                           políticas (select = próprio tenant OU is_super_admin(); insert,
--                           update, delete = is_super_admin()); privilégios: anon NENHUM,
--                           authenticated SELECT, service_role os sete; 1 linha.
--   is_super_admin() ...... `EXISTS (users WHERE id = auth.uid() AND role = 'super_admin')`,
--                           SECURITY DEFINER, search_path = public. 1 super admin.
--   default ACL ........... tabela criada por `postgres` em public dá `arwdDxtm` (os sete) a
--                           authenticated e service_role; anon NÃO. service_role BYPASSRLS.
--   Storage ............... UM bucket, `comprovantes` (privado, sem limite de tamanho, jpeg/png/
--                           pdf, criado em 23/02/2026); 0 objetos, 0 bytes. Nenhum bucket
--                           `atendimentos-ia`. `storage.objects` e `storage.buckets` são de
--                           `supabase_storage_admin`, com RLS ligada; 0 políticas em
--                           `storage.buckets`.
--   storage.objects ....... anon E authenticated têm SELECT, INSERT, UPDATE e DELETE — em
--                           Storage a POLÍTICA é a única camada, e o privilégio não é tocado aqui
--                           (é da tabela inteira, de todos os buckets).
--   quem cria ............. `postgres` NÃO é dono de `storage.*` nem membro de
--                           `supabase_storage_admin`, mas tem INSERT em `storage.buckets` e está
--                           em `supautils.policy_grants` para `storage.objects` — é isso que deixa
--                           ESTA migração criar o bucket e as políticas por SQL. Sem isso, o
--                           bucket seria criado pelo painel e as políticas não teriam como entrar
--                           aqui.
--   plano ................. organização no plano FREE. Pela documentação do Supabase (não medido
--                           no projeto): 1 GB de Storage no total e 50 MB por arquivo.
--
-- ── O QUE ESTA MIGRAÇÃO NÃO AMARRA, e fica para o dono do produto decidir ──────────────────
-- Das três coerências entre as tabelas levantadas na primeira versão, UMA entrou no banco e DUAS
-- ficaram fora — decisão do dono do produto, 19/10/2026:
--   (i)   ENTROU: `orcamentista_config.nicho_id` pertence ao `orcamentista_config.modelo` da mesma
--         linha, por FK COMPOSTA (modelo, nicho_id) → orcamentista_nicho (modelo, id). Ver passo 5.
--   (ii)  FORA: fornecedor só em nicho de FABRICACAO (EPIC §3.2: revenda e serviço não usam
--         fornecedor).
--   (iii) FORA: `orcamentista_conta_tabela` só em conta de modelo FABRICACAO e com tabela de
--         fornecedor do nicho da conta (EPIC §3.6: trocar modelo ou nicho limpa as tabelas em uso).
-- (ii) e (iii) são REGRA DE PRODUTO, guardada pela TELA e registrada no EPIC. O banco não as
-- impõe, e quem escrever por fora da tela (rota nova, SQL à mão) não encontra recusa nenhuma.
--
-- E O LIMITE DA (i), FECHADO: a FK composta é MATCH SIMPLE — basta UMA das duas colunas nula
-- para ela não ser exercida. "Nicho sem modelo" passava por ali; a CHECK
-- `orcamentista_config_nicho_exige_modelo` o fecha (passo 5) — decisão do dono do produto,
-- 19/10/2026.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. NICHO ───────────────────────────────────────────────────────────────────────────────
-- Pertence a UM modelo de atendimento. A lista de nichos que a tela oferece depende do modelo.
-- `ativo` existe para tirar um nicho da lista sem apagá-lo — apagar está travado por RESTRICT
-- enquanto houver fornecedor ou conta usando.
--
-- `criado_por` SEM FK, e a razão é a do bloco 1 (`20261018000001`) e da XIII.7: o autor é FATO
-- HISTÓRICO, não referência viva (`fato-vs-referencia.md`) — o id fica gravado mesmo que a linha
-- de `public.users` deixe de existir, e a exclusão de usuário não passa a falhar por causa dele.
-- Vale igual nas quatro tabelas.
CREATE TABLE public.orcamentista_nicho (
  id          uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo      text        NOT NULL CHECK (modelo IN ('FABRICACAO', 'REVENDA', 'SERVICO')),
  nome        text        NOT NULL,
  ativo       boolean     NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  uuid        NULL,
  -- O par (modelo, id) é único porque `id` já é — esta constraint não restringe nada a mais.
  -- Ela existe para ser o ALVO da FK composta de `orcamentista_config` (passo 5): uma FK só
  -- referencia colunas com UNIQUE ou PRIMARY KEY declarada sobre exatamente elas.
  CONSTRAINT orcamentista_nicho_modelo_id_key UNIQUE (modelo, id)
);

-- O mesmo nome não se repete DENTRO de um modelo, sem distinguir maiúscula de minúscula:
-- "Esquadrias" e "esquadrias" seriam dois nichos que a tela mostra como um só. Entre modelos
-- diferentes o nome pode repetir — o nicho é do modelo.
CREATE UNIQUE INDEX orcamentista_nicho_modelo_nome_key
  ON public.orcamentista_nicho (modelo, lower(nome));

COMMENT ON TABLE public.orcamentista_nicho IS
  'Nicho do Atendimentos I.A. Pertence a um modelo (FABRICACAO, REVENDA, SERVICO). Catalogo da plataforma: leitura e escrita so pelo super admin. Nome unico por modelo, sem distinguir maiusculas. criado_por sem FK de proposito - o autor e fato historico.';

-- ── 2. FORNECEDOR ──────────────────────────────────────────────────────────────────────────
-- DA PLATAFORMA, não de uma conta (EPIC §3.3): credenciado uma vez e reaproveitado por todas.
-- Tem UM nicho. Mover de nicho é UPDATE de `nicho_id`. Apagar um nicho com fornecedor é recusado.
CREATE TABLE public.orcamentista_fornecedor (
  id          uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  nicho_id    uuid        NOT NULL REFERENCES public.orcamentista_nicho(id) ON DELETE RESTRICT,
  nome        text        NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  uuid        NULL
);

COMMENT ON TABLE public.orcamentista_fornecedor IS
  'Fornecedor do Atendimentos I.A. - da plataforma, nao de uma conta. Tem um nicho; excluir nicho com fornecedor e recusado (RESTRICT). Leitura e escrita so pelo super admin.';

-- ── 3. TABELA (e o MOTOR, preso a ela) ─────────────────────────────────────────────────────
-- Os caminhos são DENTRO do bucket `atendimentos-ia`, criado no passo 7.
--
-- O MOTOR É OBRIGATÓRIO, e por isso `motor_path` e `motor_nome` são NOT NULL — não uma CHECK. A
-- obrigação é da COLUNA: não existe estado "tabela sem motor" a validar depois. O modal
-- "Credenciar fornecedor" do mockup, que cria tabela só com arquivo e vigência, é atalho do
-- protótipo e não regra (EPIC §3.8, §5.5).
--
-- `vigencia` é TEXTO, como no EPIC §2 ("desde 01/10/2026", "01/07 a 30/09/2026"). NULL = não
-- informada. O banco não a interpreta.
--
-- "Subido em" (EPIC §5.6) é `criado_em`.
CREATE TABLE public.orcamentista_tabela (
  id             uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id  uuid        NOT NULL REFERENCES public.orcamentista_fornecedor(id) ON DELETE RESTRICT,
  arquivo_path   text        NOT NULL,
  arquivo_nome   text        NOT NULL,
  motor_path     text        NOT NULL,
  motor_nome     text        NOT NULL,
  vigencia       text        NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     uuid        NULL
);

COMMENT ON TABLE public.orcamentista_tabela IS
  'Tabela de preco de um fornecedor, com o motor de aplicacao preso a ela. Regra do dono do produto: "quando for inserida uma nova tabela, tem que inserir o motor de aplicação". Por isso motor_path e motor_nome sao NOT NULL. Caminhos dentro do bucket atendimentos-ia. Leitura e escrita so pelo super admin.';
COMMENT ON COLUMN public.orcamentista_tabela.vigencia IS
  'Texto livre, como a tela mostra (ex.: desde 01/10/2026). NULL = nao informada.';

-- ── 4. A TABELA EM USO POR CONTA ───────────────────────────────────────────────────────────
-- Cada linha é um par conta + tabela. O mesmo fornecedor aparece em várias linhas, uma por
-- tabela (EPIC §5.3). O motor não tem coluna aqui: ele vem da tabela (§3.1).
--
-- OS DOIS ON DELETE SÃO DIFERENTES DE PROPÓSITO:
--   tenant_id → CASCADE . conta excluída leva as linhas dela junto — a linha só existe para a
--                         conta, e sem a conta não descreve nada;
--   tabela_id → RESTRICT  tabela em uso NÃO pode ser excluída. É a regra da tela (EPIC §3.7:
--                         "tire a tabela da conta primeiro") imposta também no banco.
CREATE TABLE public.orcamentista_conta_tabela (
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tabela_id   uuid        NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE RESTRICT,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  uuid        NULL,
  PRIMARY KEY (tenant_id, tabela_id)
);

COMMENT ON TABLE public.orcamentista_conta_tabela IS
  'Tabelas em uso por conta no Atendimentos I.A. Conta excluida leva as linhas (CASCADE); tabela em uso nao pode ser excluida (RESTRICT). Leitura e escrita so pelo super admin.';

-- ── 5. MODELO E NICHO DA CONTA ─────────────────────────────────────────────────────────────
-- NULL = "— não definido —", que é a opção que a tela oferece (EPIC §2). Sem DEFAULT: uma conta
-- que nunca escolheu modelo não pode aparecer como se tivesse escolhido (`ausente-vs-falso.md`).
--
-- `modelo` é campo do Atendimentos I.A. e NÃO é `tenant_settings.calc_type` — o texto da tela
-- diz isso com todas as letras: "não encosta na segmentação fiscal que o cliente escolheu no
-- primeiro acesso dele" (EPIC §2).
--
-- `nicho_id` NÃO tem FK simples: a FK é COMPOSTA, (modelo, nicho_id) → orcamentista_nicho
-- (modelo, id), com RESTRICT. Decisão do dono do produto, 19/10/2026. A RAZÃO: sem ela, uma conta
-- REVENDA pode apontar para um nicho de FABRICACAO. O estado é impossível no produto e era
-- possível no banco; a FK composta o torna impossível nos dois. E o RESTRICT segue valendo: um
-- nicho em uso por uma conta não pode ser excluído.
--
-- Com `modelo` e `nicho_id` ambos NULL a FK não é exercida — "não definido" continua possível,
-- que é a opção que a tela oferece.
--
-- A CHECK `orcamentista_config_nicho_exige_modelo` — decisão do dono do produto, 19/10/2026. A
-- RAZÃO: a FK composta é MATCH SIMPLE e NÃO é exercida quando `modelo` é NULL. Medido no harness
-- antes desta CHECK: `modelo = null, nicho_id = <inexistente>` foi aceito com UPDATE 1. "Nicho
-- sem modelo" é impossível no produto — a tela só oferece o nicho depois do modelo —, e a CHECK
-- faz valer no banco a mesma ordem. Os quatro estados:
--   modelo NULL     + nicho_id NULL                → aceito  — "não definido", a opção da tela
--   modelo definido + nicho_id NULL                → aceito  — escolheu o modelo, falta o nicho
--   modelo definido + nicho_id do MESMO modelo     → aceito  — completo
--   modelo NULL     + nicho_id qualquer            → RECUSADO por esta CHECK
-- (E modelo definido + nicho_id de OUTRO modelo, ou inexistente, é recusado pela FK composta.)
--
-- As políticas e os privilégios de `orcamentista_config` NÃO mudam: o tenant continua lendo a
-- própria linha — agora com estas duas colunas — e só a rota escreve.
ALTER TABLE public.orcamentista_config
  ADD COLUMN modelo   text NULL CHECK (modelo IS NULL OR modelo IN ('FABRICACAO', 'REVENDA', 'SERVICO')),
  ADD COLUMN nicho_id uuid NULL,
  ADD CONSTRAINT orcamentista_config_modelo_nicho_id_fkey FOREIGN KEY (modelo, nicho_id)
    REFERENCES public.orcamentista_nicho (modelo, id) ON DELETE RESTRICT,
  ADD CONSTRAINT orcamentista_config_nicho_exige_modelo
    CHECK (nicho_id IS NULL OR modelo IS NOT NULL);

COMMENT ON COLUMN public.orcamentista_config.modelo IS
  'Modelo de atendimento da conta: FABRICACAO | REVENDA | SERVICO. NULL = nao definido. Nao e tenant_settings.calc_type.';
COMMENT ON COLUMN public.orcamentista_config.nicho_id IS
  'Nicho da conta. NULL = nao definido. FK composta (modelo, nicho_id) -> orcamentista_nicho (modelo, id): o nicho tem de ser do modelo da conta. Excluir nicho em uso e recusado (RESTRICT).';

-- ── 6. SEGURANÇA DAS QUATRO TABELAS NOVAS ──────────────────────────────────────────────────
-- Catálogo da plataforma: NINGUÉM além do super admin lê ou escreve — nem a própria conta lê as
-- linhas dela em `orcamentista_conta_tabela`. As QUATRO políticas de cada tabela dizem
-- `is_super_admin()`, inclusive a de SELECT.
ALTER TABLE public.orcamentista_nicho        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_fornecedor   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_tabela       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_conta_tabela ENABLE ROW LEVEL SECURITY;

CREATE POLICY orcamentista_nicho_select_super_admin ON public.orcamentista_nicho
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_nicho_insert_super_admin ON public.orcamentista_nicho
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_nicho_update_super_admin ON public.orcamentista_nicho
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_nicho_delete_super_admin ON public.orcamentista_nicho
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_fornecedor_select_super_admin ON public.orcamentista_fornecedor
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_fornecedor_insert_super_admin ON public.orcamentista_fornecedor
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_fornecedor_update_super_admin ON public.orcamentista_fornecedor
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_fornecedor_delete_super_admin ON public.orcamentista_fornecedor
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_tabela_select_super_admin ON public.orcamentista_tabela
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_tabela_insert_super_admin ON public.orcamentista_tabela
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_tabela_update_super_admin ON public.orcamentista_tabela
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_tabela_delete_super_admin ON public.orcamentista_tabela
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_conta_tabela_select_super_admin ON public.orcamentista_conta_tabela
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_conta_tabela_insert_super_admin ON public.orcamentista_conta_tabela
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_conta_tabela_update_super_admin ON public.orcamentista_conta_tabela
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_conta_tabela_delete_super_admin ON public.orcamentista_conta_tabela
  FOR DELETE USING (public.is_super_admin());

-- ── 7. O BUCKET DOS ARQUIVOS DE TABELA E DE MOTOR ──────────────────────────────────────────
-- PRIVADO (`public = false`): não há URL pública; quem baixa precisa de política ou de
-- `service_role`.
--
-- `file_size_limit` e `allowed_mime_types` ficam NULL, e é escolha, não esquecimento:
--   tamanho . NULL = vale o limite global do projeto, que no plano FREE não passa de 50 MB
--             (documentação do Supabase). Um número aqui seria um limite que ninguém decidiu.
--   tipos ... a tela aceita `.xlsx`, `.xls`, `.csv` e `.pdf` (EPIC §5.6). O tipo MIME de um
--             `.csv` muda de navegador para navegador (`text/csv`, `application/vnd.ms-excel`),
--             e uma lista aqui poderia recusar um arquivo que a tela aceitou. Fica na tela; levar
--             para o bucket é decisão do dono do produto.
INSERT INTO storage.buckets (id, name, public)
VALUES ('atendimentos-ia', 'atendimentos-ia', false);

-- AS POLÍTICAS DO BUCKET — só o super admin lê e escreve. Cada uma é presa a ESTE bucket por
-- `bucket_id`, e exige `is_super_admin()`. São para `authenticated`: `anon` não tem política
-- nenhuma aqui, e sem política a RLS nega. `service_role` é BYPASSRLS e não depende delas.
--
-- NÃO HÁ REVOKE em `storage.objects`, e não pode haver: o privilégio é da tabela inteira, que
-- serve TODOS os buckets. Em Storage, a política é a camada que existe.
--
-- As três políticas existentes, do bucket `comprovantes`, não alcançam este: as três filtram por
-- `bucket_id = 'comprovantes'` (medido).
CREATE POLICY atendimentos_ia_select_super_admin ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'atendimentos-ia' AND public.is_super_admin());
CREATE POLICY atendimentos_ia_insert_super_admin ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'atendimentos-ia' AND public.is_super_admin());
CREATE POLICY atendimentos_ia_update_super_admin ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'atendimentos-ia' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'atendimentos-ia' AND public.is_super_admin());
CREATE POLICY atendimentos_ia_delete_super_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'atendimentos-ia' AND public.is_super_admin());

-- ── 8. PRIVILÉGIOS — A NEGATIVA EM DUAS CAMADAS ────────────────────────────────────────────
-- O default ACL dá os SETE privilégios a `authenticated` em toda tabela nova (medido). As
-- políticas acima já negam a quem não é super admin; o privilégio passa a negar também, por
-- outro mecanismo. `REVOKE ALL` e NENHUM GRANT: nem SELECT fica — a forma positiva do bloco 1
-- (`REVOKE ALL` + o que vale), e aqui o que vale para `authenticated` é NADA.
--
-- `anon` entra no REVOKE mesmo sem privilégio pelo default ACL (medido): se o default mudar, a
-- tabela já nasce fechada para ele.
--
-- Consequência, e ela é de propósito: nem o super admin lê estas tabelas pelo PostgREST. Quem lê
-- e escreve é a rota, com `service_role` — que tem os sete privilégios próprios (não é tocado
-- aqui) e é BYPASSRLS (medido). As políticas ficam como SEGUNDA camada: se o privilégio voltar a
-- ser concedido por engano, elas continuam negando a quem não é super admin.
REVOKE ALL ON public.orcamentista_nicho        FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_fornecedor   FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_tabela       FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_conta_tabela FROM anon, authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar. O esperado vem da medição de 19/10/2026, acima.
--
-- (1) As quatro tabelas existem, com RLS LIGADA, vazias:
--   select c.relname, c.relrowsecurity
--     from pg_class c
--    where c.relnamespace = 'public'::regnamespace
--      and c.relname in ('orcamentista_nicho','orcamentista_fornecedor','orcamentista_tabela','orcamentista_conta_tabela')
--    order by 1;
--   -- esperado: 4 linhas, todas `true`   (ANTES: 0 linhas)
--   select (select count(*) from public.orcamentista_nicho), (select count(*) from public.orcamentista_fornecedor),
--          (select count(*) from public.orcamentista_tabela), (select count(*) from public.orcamentista_conta_tabela);
--   -- esperado: 0 · 0 · 0 · 0
--
-- (2) As COLUNAS:
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('orcamentista_nicho','orcamentista_fornecedor','orcamentista_tabela','orcamentista_conta_tabela')
--    order by table_name, ordinal_position;
--   -- esperado, 26 linhas:
--   --   nicho ........ id uuid NO gen_random_uuid() · modelo text NO · nome text NO ·
--   --                  ativo boolean NO true · criado_em timestamptz NO now() · criado_por uuid YES
--   --   fornecedor ... id · nicho_id uuid NO · nome text NO · criado_em · criado_por
--   --   tabela ....... id · fornecedor_id uuid NO · arquivo_path text NO · arquivo_nome text NO ·
--   --                  motor_path text NO · motor_nome text NO · vigencia text YES · criado_em ·
--   --                  criado_por
--   --   conta_tabela . tenant_id uuid NO · tabela_id uuid NO · criado_em · criado_por
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema='public' and table_name='orcamentista_config' order by ordinal_position;
--   -- esperado: 11 colunas — as 9 de antes, INALTERADAS, e no fim
--   --   modelo text YES NULL · nicho_id uuid YES NULL   (ANTES: 9)
--
-- (3) As CONSTRAINTS e os ON DELETE:
--   select conrelid::regclass, conname, contype::text,
--          case confdeltype when 'r' then 'RESTRICT' when 'c' then 'CASCADE' when 'a' then 'NO ACTION'
--                           when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete,
--          pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid in ('public.orcamentista_nicho'::regclass, 'public.orcamentista_fornecedor'::regclass,
--                       'public.orcamentista_tabela'::regclass, 'public.orcamentista_conta_tabela'::regclass,
--                       'public.orcamentista_config'::regclass)
--    order by 1, 2;
--   -- esperado:
--   --   nicho ........ pkey (p) · modelo_check (c) · modelo_id_key (u) UNIQUE (modelo, id)
--   --   fornecedor ... pkey (p) · nicho_id_fkey (f) RESTRICT
--   --   tabela ....... pkey (p) · fornecedor_id_fkey (f) RESTRICT
--   --   conta_tabela . pkey (p) PRIMARY KEY (tenant_id, tabela_id) · tenant_id_fkey (f) CASCADE ·
--   --                  tabela_id_fkey (f) RESTRICT
--   --   config ....... as 6 de antes, INALTERADAS, mais modelo_check (c),
--   --                  nicho_exige_modelo (c) CHECK ((nicho_id IS NULL) OR (modelo IS NOT NULL)) e
--   --                  modelo_nicho_id_fkey (f) RESTRICT — FOREIGN KEY (modelo, nicho_id)
--   --                  REFERENCES orcamentista_nicho(modelo, id). NENHUMA FK simples em nicho_id.
--   --   NENHUMA FK para `users` em tabela nenhuma.
--   select indexdef from pg_indexes where schemaname='public' and indexname='orcamentista_nicho_modelo_nome_key';
--   -- esperado: CREATE UNIQUE INDEX ... ON public.orcamentista_nicho USING btree (modelo, lower(nome))
--
-- (4) As POLÍTICAS das quatro tabelas — 16, todas `is_super_admin()`, inclusive o SELECT:
--   select tablename, policyname, cmd, qual, with_check from pg_policies
--    where schemaname='public'
--      and tablename in ('orcamentista_nicho','orcamentista_fornecedor','orcamentista_tabela','orcamentista_conta_tabela')
--    order by tablename, cmd;
--   -- esperado: 4 por tabela —
--   --   DELETE  is_super_admin()  NULL
--   --   INSERT  NULL              is_super_admin()
--   --   SELECT  is_super_admin()  NULL
--   --   UPDATE  is_super_admin()  is_super_admin()
--   -- NENHUMA com `get_auth_tenant_id()`.
--   select count(*) from pg_policies where schemaname='public' and tablename='orcamentista_config';
--   -- esperado: 4   (ANTES: 4 — as de `orcamentista_config` não mudam)
--
-- (5) Os PRIVILÉGIOS POR COMANDO E POR PAPEL — os SETE, anon incluído:
--   select t.tabela, r.papel,
--          coalesce(string_agg(c.cmd, ',' order by c.cmd) filter (where has_table_privilege(r.papel, t.tabela, c.cmd)), '(nenhum)') as privilegios
--     from (values ('public.orcamentista_nicho'), ('public.orcamentista_fornecedor'),
--                  ('public.orcamentista_tabela'), ('public.orcamentista_conta_tabela'),
--                  ('public.orcamentista_config')) t(tabela)
--    cross join (values ('anon'), ('authenticated'), ('service_role')) r(papel)
--    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) c(cmd)
--    group by t.tabela, r.papel order by t.tabela, r.papel;
--   -- esperado, para CADA UMA das quatro tabelas novas:
--   --   anon           (nenhum)
--   --   authenticated  (nenhum)        ← nem SELECT
--   --   service_role   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   -- e para orcamentista_config, INALTERADO:
--   --   anon (nenhum) · authenticated SELECT · service_role os sete
--
-- (6) O BUCKET:
--   select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
--   -- esperado: 2 linhas — atendimentos-ia · atendimentos-ia · false · NULL · NULL, e
--   --   comprovantes como estava   (ANTES: só comprovantes)
--
-- (7) As POLÍTICAS DO BUCKET — 4, só `authenticated`, presas a este bucket e a is_super_admin():
--   select policyname, cmd, roles, qual, with_check from pg_policies
--    where schemaname='storage' and tablename='objects' order by policyname;
--   -- esperado: as 3 de comprovantes INALTERADAS, mais
--   --   atendimentos_ia_delete_super_admin  DELETE  {authenticated}  ((bucket_id = 'atendimentos-ia'::text) AND is_super_admin())  NULL
--   --   atendimentos_ia_insert_super_admin  INSERT  {authenticated}  NULL  ((bucket_id = 'atendimentos-ia'::text) AND is_super_admin())
--   --   atendimentos_ia_select_super_admin  SELECT  {authenticated}  ((bucket_id = 'atendimentos-ia'::text) AND is_super_admin())  NULL
--   --   atendimentos_ia_update_super_admin  UPDATE  {authenticated}  ((bucket_id = 'atendimentos-ia'::text) AND is_super_admin())  (o mesmo)
--
-- (8) NADA MAIS FOI TOCADO em `orcamentista_config`:
--   select count(*), count(*) filter (where ativo), count(*) filter (where modelo is not null or nicho_id is not null)
--     from public.orcamentista_config;
--   -- esperado: 1 · 1 · 0   (ANTES: 1 · 1 · —)
--
-- (9) `NOTIFY pgrst, 'reload schema';` — não vem junto com o COMMIT.
-- ════════════════════════════════════════════════════════════════════════════════════════
