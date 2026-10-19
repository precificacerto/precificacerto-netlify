-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bucket `comprovantes` — as três políticas passam a prender o arquivo ao TENANT
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NÃO APLICADA. Escrita em 19/10/2026, autorizada pelo dono do produto depois da        ║
-- ║ medição, para revisão dele, que publica o md5 e decide. Independe da `20261019000001` ║
-- ║ — pode ser aplicada antes, depois ou sem ela. O código NÃO muda junto (ver §1).       ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- O DEFEITO. As três políticas de `comprovantes` em `storage.objects` filtram SÓ por `bucket_id`,
-- sem tenant: qualquer usuário logado lê, grava e altera comprovante de QUALQUER conta. Viola a
-- regra que o dono do produto declarou inviolável — uma conta não acessa informação de outra,
-- nunca. As políticas não estão em migração nenhuma do repositório: foram criadas por fora, e
-- esta é a primeira vez que o repositório as declara.
--
-- POR QUE AGORA: o bucket está VAZIO. Depois do primeiro arquivo, o conserto vira operação com
-- dado real — e a convenção de caminho deixa de poder ser escolhida.
--
-- §0, MEDIDO EM 19/10/2026 (somente leitura):
--   bucket `comprovantes` ... privado, sem limite de tamanho, jpeg/png/pdf, criado em 23/02/2026.
--                             0 objetos, 0 bytes. 0 objetos em `storage.objects` no projeto.
--   as três políticas, LITERAIS (pg_policies), todas PERMISSIVE, roles {authenticated}:
--     comprovantes_insert_policy  INSERT  qual NULL                           with_check (bucket_id = 'comprovantes'::text)
--     comprovantes_select_policy  SELECT  qual (bucket_id = 'comprovantes'::text)  with_check NULL
--     comprovantes_update_policy  UPDATE  qual (bucket_id = 'comprovantes'::text)  with_check NULL
--   NÃO há política de DELETE — e o código não apaga nada no bucket (nenhum `.remove(`).
--   uso ..................... customer_attachments 0 linhas; sales com receipt_url 0. Nada foi
--                             subido até hoje.
--   storage.foldername(name text) -> text[] .... existe: devolve os segmentos MENOS o último.
--   get_auth_tenant_id() ...... `select tenant_id from users where id = auth.uid()`, SECURITY
--                               DEFINER; authenticated tem EXECUTE.
--   user_metadata.tenant_id ... 19 usuários com tenant, 19 com o metadado, 0 DIVERGENTES de
--                               `public.users.tenant_id`.
--
-- ── §1. A CONVENÇÃO DE CAMINHO — e por que o código NÃO muda ──────────────────────────────
-- Os QUATRO pontos do código que sobem ou leem comprovante, medidos:
--
--   SOBE  src/pages/orcamentos/index.tsx:2540  `${tenant_id}/customers/${customer_id}/${uuid}.${ext}`
--   SOBE  src/pages/agenda/index.tsx:1514      `${tid}/customers/${customer_id}/${uuid}.${ext}`
--   SOBE  src/pages/vendas/index.tsx:558       `${tenantId}/${saleId}.${ext}`   (upsert: true)
--   LÊ    src/pages/vendas/index.tsx:565       createSignedUrl(sales.receipt_url)  — o caminho gravado acima
--   LÊ    src/page-parts/clientes/historico-do-cliente.component.tsx:252
--                                              createSignedUrl(customer_attachments.file_path) — idem
--
-- O TENANT JÁ ESTÁ NO CAMINHO, NA PRIMEIRA POSIÇÃO, nos três que sobem; os dois que leem usam o
-- caminho que foi gravado. A convenção é a que o código já pratica:
--
--     <tenant_id>/<o resto>        ← (storage.foldername(name))[1] = tenant_id da conta
--
-- O tenant que o código põe no caminho vem de `useAuth().tenantId` (orçamentos) e de
-- `getTenantId()` (agenda, vendas), que lê PRIMEIRO `user_metadata.tenant_id`. A política NÃO
-- confia nele: compara com `get_auth_tenant_id()`, que lê `public.users`. Se os dois um dia
-- divergirem, o upload é RECUSADO — falha para o lado seguro. Medido hoje: 0 divergentes.
--
-- ── §2. O QUE MUDA, e o que NÃO muda ──────────────────────────────────────────────────────
--   muda ...... as três políticas ganham `(storage.foldername(name))[1] = get_auth_tenant_id()::text`.
--               A de UPDATE ganha WITH CHECK explícito, com a mesma expressão: renomear um
--               arquivo para a pasta de outra conta também é recusado. (Sem WITH CHECK o
--               Postgres já reaplica o USING à linha nova — fica escrito para não depender disso.)
--   NÃO muda .. os NOMES das políticas, os COMANDOS (SELECT, INSERT, UPDATE — continua SEM DELETE),
--               o papel (`authenticated`), o bucket, e os privilégios de `storage.objects`.
--   consequência, conhecida: o SUPER ADMIN não tem tenant, `get_auth_tenant_id()` é nulo para
--               ele, e ele não lê comprovante nenhum pelo cliente. `service_role` é BYPASSRLS e
--               segue lendo tudo. Arquivo na RAIZ do bucket (sem pasta) também é recusado:
--               `foldername` devolve vazio, e `[1]` é nulo.
--   o upsert .. `vendas` sobe com `upsert: true`, que exige SELECT, INSERT e UPDATE — os três
--               continuam existindo, e os três exigem o mesmo tenant.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- DROP sem IF EXISTS: as três existem (medido). Se alguma não existir na hora de aplicar, o
-- estado não é o medido, e a migração tem de parar em vez de seguir sobre um estado que ninguém
-- olhou.
DROP POLICY comprovantes_select_policy ON storage.objects;
DROP POLICY comprovantes_insert_policy ON storage.objects;
DROP POLICY comprovantes_update_policy ON storage.objects;

CREATE POLICY comprovantes_select_policy ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'comprovantes'
         AND (storage.foldername(name))[1] = public.get_auth_tenant_id()::text);

CREATE POLICY comprovantes_insert_policy ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprovantes'
              AND (storage.foldername(name))[1] = public.get_auth_tenant_id()::text);

CREATE POLICY comprovantes_update_policy ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'comprovantes'
         AND (storage.foldername(name))[1] = public.get_auth_tenant_id()::text)
  WITH CHECK (bucket_id = 'comprovantes'
              AND (storage.foldername(name))[1] = public.get_auth_tenant_id()::text);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar.
--
-- (1) As TRÊS políticas, com o tenant, e nenhuma de DELETE:
--   select policyname, cmd, roles, permissive, qual, with_check from pg_policies
--    where schemaname='storage' and tablename='objects' and policyname like 'comprovantes%'
--    order by policyname;
--   -- esperado, 3 linhas, PERMISSIVE, {authenticated}:
--   --   comprovantes_insert_policy  INSERT  NULL
--   --     ((bucket_id = 'comprovantes'::text) AND ((storage.foldername(name))[1] = (get_auth_tenant_id())::text))
--   --   comprovantes_select_policy  SELECT
--   --     ((bucket_id = 'comprovantes'::text) AND ((storage.foldername(name))[1] = (get_auth_tenant_id())::text))  NULL
--   --   comprovantes_update_policy  UPDATE  (a mesma expressão)  (a mesma expressão)
--   -- (ANTES: as mesmas 3, com só `(bucket_id = 'comprovantes'::text)`, e UPDATE sem with_check)
--
-- (2) O bucket e o resto de `storage.objects` NÃO mudaram:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'comprovantes';
--   -- esperado: comprovantes · false · NULL · {image/jpeg,image/png,application/pdf}
--   select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname not like 'comprovantes%';
--   -- esperado: o MESMO número de antes (0 sem a `20261019000001`; 4 com ela)
--   select count(*) from storage.objects where bucket_id = 'comprovantes';
--   -- esperado: 0
--
-- (3) Sem `NOTIFY pgrst`: nenhuma coluna ou tabela muda, só políticas, e política é avaliada pelo
--     Postgres a cada consulta. Rodá-lo não faz mal.
-- ════════════════════════════════════════════════════════════════════════════════════════
