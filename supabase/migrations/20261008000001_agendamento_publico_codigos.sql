-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FASE 2B — o código de acesso que deixa o CLIENTE cancelar e remarcar pelo próprio link
--
-- Comando do PO de 08/10/2026.
--
-- >>> ESTA MIGRAÇÃO NASCE PENDENTE, E ISSO NÃO É DESCUIDO <<<
--
-- `migration-delivery.md`: neste repositório a pasta `supabase/migrations/` é DOCUMENTAÇÃO DA
-- INTENÇÃO, não fonte de verdade do schema — 4 das 146 versões locais existem no
-- `schema_migrations` remoto. Merge não aplica nada, e `supabase db push` trataria 142 arquivos
-- já aplicados como pendentes. Então o default é PENDENTE até alguém consultar o schema e ver a
-- tabela lá.
--
-- Enquanto ela não for aplicada, as quatro rotas da Fase 2B falham — e está tudo bem: o link
-- está DESLIGADO em toda tenant (`is_enabled = false` em 100%), então ninguém as alcança.
--
-- ── A ORDEM IMPORTA E É ESTA: APLICAR *ANTES* DO MERGE ────────────────────────────────────
--
-- `migration-delivery.md` separa os dois casos. Esta migração cria TABELA que o código novo
-- GRAVA, então ela cabe em "aplicar ANTES OU JUNTO". Mergear sem aplicar deixa a rota gravando
-- em tabela inexistente — o mesmo que derrubou produção em 01/09/2026 com `expense_snapshot`.
-- Aqui o dano é contido porque o link está desligado, mas a ordem continua sendo esta.
--
-- ── VERIFICAÇÃO DEPOIS DE APLICAR (não confie no retorno do comando) ──────────────────────
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='booking_access_codes'
--   order by ordinal_position;
--   -- esperado: 8 colunas. Zero linhas = NÃO está aplicada.
--
--   select c.relrowsecurity,
--          (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname='public' and c.relname='booking_access_codes';
--   -- esperado: relrowsecurity = true, politicas = 4
--
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and table_name='booking_access_codes' and grantee='anon';
--   -- esperado: VAZIO. Se vier linha, o REVOKE não pegou — PARAR e avisar.
--
--   NOTIFY pgrst, 'reload schema';
--   -- É ele que evita o erro do PostgREST que derrubou produção em 01/09/2026, e ele NÃO vem
--   -- junto com o COMMIT.
--
-- ── NOTA PARA QUEM APLICAR PELO CONECTOR ─────────────────────────────────────────────────
--
-- O conector do Supabase abre transação própria e o `BEGIN` abaixo produz
-- `WARNING: there is already a transaction in progress`, com o `COMMIT` fechando a transação
-- DELE. Quem aplicar por esse caminho REMOVE as duas linhas; pelo SQL Editor ou por psql, o
-- arquivo vai como está. O `BEGIN`/`COMMIT` fica no arquivo porque sem ele uma falha no meio
-- deixaria metade aplicada em autocommit.
--
-- ── CONVENÇÃO DO `name` ──────────────────────────────────────────────────────────────────
--
-- Ao aplicar fora do CLI, o `name` da migração é o NOME COMPLETO DESTE ARQUIVO sem a extensão:
--   20261008000001_agendamento_publico_codigos
-- É a única coisa que liga as duas metades enquanto não houver gate, e a convenção já funcionou
-- nas três do cClassTrib em 16/09/2026.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ══ A TABELA ═══════════════════════════════════════════════════════════════════════════════
--
-- >>> `code_hash`, NUNCA O CÓDIGO EM CLARO <<<
--
-- Quem tiver o código de alguém cancela o agendamento dessa pessoa. Guardar os seis dígitos em
-- claro significaria que um dump, um backup ou um `select` por engano entrega o poder de cancelar
-- agendamento de qualquer cliente de qualquer tenant.
--
-- O hash é `sha256(sal || ':' || codigo)`, com SAL POR LINHA em `code_salt` — sem o sal, uma
-- rainbow table de 10^6 entradas (todos os códigos de 6 dígitos) quebraria a tabela inteira numa
-- passada. Com sal por linha, cada código exige a sua própria força bruta.
--
-- O par (hash, sal) é escrito por `src/utils/codigo-de-acesso.ts`, que é a fonte única do
-- critério e tem portão próprio.
CREATE TABLE IF NOT EXISTS public.booking_access_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id),

  -- Normalizado: SÓ DÍGITOS, sem DDI, 10 ou 11 — é o formato que `phone-br.ts` fixa e que o
  -- envio de WhatsApp espera (ele acrescenta o 55 sozinho). Gravar E.164 aqui faria a busca por
  -- telefone não casar com `customers.whatsapp_phone`.
  phone       text NOT NULL,

  code_hash   text NOT NULL,
  code_salt   text NOT NULL,

  expires_at  timestamptz NOT NULL,

  -- Quantas vezes alguém tentou validar ESTE código. Na quarta, ele é queimado.
  -- `NOT NULL DEFAULT 0` é correto aqui, e a distinção de `ausente-vs-falso.md` não se aplica:
  -- zero tentativas é um fato (ninguém tentou), não uma ausência de dado.
  attempts    int NOT NULL DEFAULT 0,

  -- NULÁVEL E SEM DEFAULT, de propósito: `NULL` significa "nunca usado", e é distinguível de
  -- qualquer instante. Um `NOT NULL DEFAULT now()` apagaria a distinção para sempre
  -- (`ausente-vs-falso.md`, o corolário do schema).
  used_at     timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now()
);

-- O telefone é sempre consultado DENTRO de um tenant — nenhuma consulta da Fase 2B busca por
-- telefone sem o tenant, porque o tenant sai do TOKEN. O índice segue a consulta.
CREATE INDEX IF NOT EXISTS booking_access_codes_tenant_phone_idx
  ON public.booking_access_codes (tenant_id, phone);

-- Para a limpeza das linhas vencidas, que é operação de manutenção e não desta rodada.
CREATE INDEX IF NOT EXISTS booking_access_codes_expires_idx
  ON public.booking_access_codes (expires_at);

COMMENT ON TABLE public.booking_access_codes IS
  'Fase 2B: código de 6 dígitos para o cliente cancelar/remarcar pelo link público. O código vive só como HASH com sal por linha — nunca em claro.';
COMMENT ON COLUMN public.booking_access_codes.code_hash IS
  'sha256(code_salt || '':'' || codigo). NUNCA o código em claro.';
COMMENT ON COLUMN public.booking_access_codes.used_at IS
  'NULL = nunca usado. Nulável e sem default de propósito: o NULL é a distinção.';

-- ══ RLS ════════════════════════════════════════════════════════════════════════════════════
--
-- >>> AS ROTAS PÚBLICAS USAM `service_role`, QUE IGNORA RLS — ENTÃO A RLS AQUI NÃO É O QUE AS
--     PROTEGE <<<
--
-- O isolamento das rotas vem do `.eq('tenant_id', ctx.tenant_id)` com o tenant saído do TOKEN, e
-- é isso que o portão delas afirma. A RLS existe para o outro lado: o painel autenticado e
-- qualquer consulta que chegue por `anon` ou `authenticated`.
--
-- As quatro operações têm política PRÓPRIA, em vez de uma `FOR ALL`. É o mesmo desenho da
-- migração da Fase 1, e a razão é que `FOR ALL` não aparece na contagem de `pg_policy` como
-- quatro — um gate que conferisse "tem política nas quatro operações" não distinguiria.
ALTER TABLE public.booking_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_access_codes_select ON public.booking_access_codes;
CREATE POLICY booking_access_codes_select ON public.booking_access_codes
  FOR SELECT USING (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS booking_access_codes_insert ON public.booking_access_codes;
CREATE POLICY booking_access_codes_insert ON public.booking_access_codes
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS booking_access_codes_update ON public.booking_access_codes;
CREATE POLICY booking_access_codes_update ON public.booking_access_codes
  FOR UPDATE USING (tenant_id = (SELECT public.get_auth_tenant_id()))
         WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS booking_access_codes_delete ON public.booking_access_codes;
CREATE POLICY booking_access_codes_delete ON public.booking_access_codes
  FOR DELETE USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- ══ `anon` NÃO ALCANÇA ESTA TABELA ════════════════════════════════════════════════════════
--
-- >>> É REVOKE EXPLÍCITO, E A RAZÃO FOI MEDIDA NA FASE 1 <<<
--
-- `pg_default_acl` deste projeto tem DUAS entradas para tabelas de `public`: uma do `postgres`
-- SEM `anon`, e uma do `supabase_admin` COM `anon` e `arwdDxtm`. Qual pega depende de QUEM
-- aplica o arquivo. O REVOKE torna o resultado independente disso.
--
-- É REVOKE, não GRANT: nenhum privilégio foi inventado para `anon`. Se a verificação depois do
-- COMMIT devolver linha para `anon`, PARAR e avisar o PO em vez de improvisar.
REVOKE ALL ON public.booking_access_codes FROM anon;

COMMIT;
