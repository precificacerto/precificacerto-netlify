-- HARNESS LOCAL da RPC `dar_baixa_com_valor_diferente` — 16/10/2026
-- Cada bloco diz de onde veio: EXTRAÍDO (pg_catalog vivo da produção, verbatim) ou
-- RECONSTRUÍDO (não existe no catálogo de forma transplantável, ou é infraestrutura Supabase).

-- RECONSTRUÍDO: os papéis do Supabase. Em produção têm atributos próprios (service_role é
-- BYPASSRLS). Aqui são papéis simples — só importam para o REVOKE/GRANT do EXECUTE.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin; end if;
end $$;

-- EXTRAÍDO: extensão do default de `cash_entries.id`.
create extension if not exists "uuid-ossp";

-- RECONSTRUÍDO: o schema `auth` e `auth.users` reduzida ao `id` (alvo de FK).
create schema auth;
create table auth.users (id uuid primary key);

-- EXTRAÍDO verbatim (pg_get_functiondef): auth.uid()
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

-- EXTRAÍDO: os três enums, com os rótulos na ordem do catálogo.
create type public.cash_direction  as enum ('INCOME', 'EXPENSE');
create type public.payment_method  as enum ('PIX', 'DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA', 'LANCAMENTOS_A_RECEBER', 'CHEQUE', 'CHEQUE_PRE_DATADO');
create type public.recurrence_type as enum ('ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');
-- EXTRAÍDO (medido nesta campanha): user_role
create type public.user_role as enum ('super_admin', 'admin', 'user');

-- RECONSTRUÍDO: as tabelas-alvo de FK de `cash_entries`, reduzidas ao `id`.
create table public.tenants            (id uuid primary key);
create table public.cashier_months     (id uuid primary key);
create table public.cashier_categories (id uuid primary key);
create table public.purchase_invoices  (id uuid primary key);
create table public.card_anticipations (id uuid primary key);

-- RECONSTRUÍDO (reduzida): `public.users` só com as colunas que as funções de tenant leem.
-- Colunas e tipos EXTRAÍDOS; as outras 14 colunas da tabela real foram omitidas.
create table public.users (id uuid NOT NULL primary key, tenant_id uuid, email text NOT NULL, role public.user_role);

-- EXTRAÍDO verbatim (pg_get_functiondef): as duas funções de tenant.
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select tenant_id from public.users where id = auth.uid();
$function$;
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$function$;

-- EXTRAÍDO: `cash_entries`, as 41 colunas com tipo, NOT NULL e default do catálogo.
create table public.cash_entries (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  cashier_month_id uuid,
  category_id uuid,
  type cash_direction NOT NULL,
  amount numeric NOT NULL,
  due_date date,
  paid_date date,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  payment_method payment_method,
  origin_type text,
  origin_id uuid,
  contact_id uuid,
  expense_group text,
  recurrence_type recurrence_type DEFAULT 'MONTHLY'::recurrence_type,
  installment_number integer,
  installment_total integer,
  anticipation_id uuid,
  anticipated_amount numeric,
  is_active boolean DEFAULT true,
  expense_category text,
  is_split_remaining boolean DEFAULT false,
  valor_nf numeric,
  valor_icms numeric,
  valor_pis numeric,
  valor_cofins numeric,
  valor_ipi numeric,
  valor_cbs numeric,
  valor_ibs numeric,
  juros_value numeric,
  principal_value numeric,
  purchase_invoice_id uuid,
  tax_kind text,
  competence_month date,
  guide_type text,
  installment_group_id uuid,
  reversal_of_entry_id uuid,
  reversal_entry_id uuid,
  reversed_at date
);

-- EXTRAÍDO verbatim (pg_get_constraintdef): as 10 constraints.
alter table public.cash_entries add constraint cash_entries_pkey PRIMARY KEY (id);
alter table public.cash_entries add constraint cash_entries_cashier_month_id_fkey FOREIGN KEY (cashier_month_id) REFERENCES cashier_months(id) ON DELETE SET NULL;
alter table public.cash_entries add constraint cash_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES cashier_categories(id) ON DELETE SET NULL;
alter table public.cash_entries add constraint cash_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.cash_entries add constraint cash_entries_expense_group_check CHECK ((expense_group = ANY (ARRAY['MAO_DE_OBRA'::text, 'MAO_DE_OBRA_PRODUTIVA'::text, 'MAO_DE_OBRA_ADMINISTRATIVA'::text, 'DESPESA_FIXA'::text, 'COMPROMISSOS_FINANCEIROS'::text, 'DESPESA_FINANCEIRA'::text, 'DESPESA_VARIAVEL'::text, 'IMPOSTO'::text, 'IMPOSTO_LUCRO'::text, 'IMPOSTO_FATURAMENTO_DENTRO'::text, 'CUSTO_PRODUTOS'::text, 'ATIVIDADES_TERCEIRIZADAS'::text, 'REGIME_TRIBUTARIO'::text, 'COMISSOES'::text, 'RESERVA_TECNICA'::text, 'DEDUCAO_RECEITA'::text, 'LUCRO'::text, 'AMORTIZACAO'::text, 'REPASSE'::text, 'INVESTIMENTO'::text, 'OUTROS'::text])));
alter table public.cash_entries add constraint cash_entries_purchase_invoice_id_fkey FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL;
alter table public.cash_entries add constraint cash_entries_reversal_entry_id_fkey FOREIGN KEY (reversal_entry_id) REFERENCES cash_entries(id) ON DELETE SET NULL;
alter table public.cash_entries add constraint cash_entries_reversal_of_entry_id_fkey FOREIGN KEY (reversal_of_entry_id) REFERENCES cash_entries(id) ON DELETE SET NULL;
alter table public.cash_entries add constraint cash_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table public.cash_entries add constraint fk_cash_entries_anticipation FOREIGN KEY (anticipation_id) REFERENCES card_anticipations(id);

-- EXTRAÍDO: o índice que a RPC usa para achar a série (os outros 12 não alteram resultado).
CREATE INDEX idx_cash_entries_origin ON public.cash_entries USING btree (origin_type, origin_id);
-- EXTRAÍDO (medido): `cash_entries` NÃO TEM TRIGGER NENHUM em produção. Nada a criar.
