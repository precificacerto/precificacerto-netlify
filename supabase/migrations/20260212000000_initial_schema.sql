-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
create type public.plan_status as enum ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
create type public.user_role as enum ('ADMIN', 'MANAGER', 'SELLER');
create type public.permission_module as enum ('DASHBOARD', 'SALES', 'PRODUCTS', 'FINANCIAL', 'SETTINGS', 'USERS');
create type public.price_table_type as enum ('A', 'B', 'C', 'D');
create type public.tax_regime as enum ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');
create type public.tax_type as enum ('ICMS', 'IPI', 'PIS', 'COFINS', 'ISS');
create type public.unit_measure as enum ('UN', 'KG', 'L', 'M', 'M2', 'M3', 'H', 'MIN');
create type public.budget_status as enum ('DRAFT', 'SENT', 'APPROVED', 'EXPIRED', 'REJECTED');
create type public.order_status as enum ('PENDING', 'APPROVED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');
create type public.allocation_status as enum ('RESERVED', 'PICKED', 'CANCELLED');
create type public.cash_direction as enum ('INCOME', 'EXPENSE');
create type public.cash_category_type as enum ('REVENUE', 'EXPENSE');
create type public.event_status as enum ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
create type public.automation_trigger as enum ('BUDGET_EXPIRED', 'BUDGET_CREATED', 'SALE_COMPLETED', 'STOCK_LOW');
create type public.automation_action as enum ('SEND_EMAIL', 'SEND_WHATSAPP', 'CREATE_TASK');

-- -----------------------------------------------------------------------------
-- 1. Módulo Tenant & Auth
-- -----------------------------------------------------------------------------

-- 1. Tenants (Empresas)
create table public.tenants (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  cnpj_cpf text,
  segment text,
  plan_status public.plan_status default 'TRIAL',
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- 2. Users (Usuários do Sistema vinculados ao Auth do Supabase)
create table public.users (
  id uuid references auth.users not null primary key, -- Vinculo 1:1 com auth.users
  tenant_id uuid references public.tenants(id) not null,
  email text not null,
  role public.user_role default 'SELLER',
  is_active boolean default true,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 2. Módulo Usuários & Permissões
-- -----------------------------------------------------------------------------

-- 3. Permissions (Catálogo fixo)
create table public.permissions (
  id uuid default uuid_generate_v4() primary key,
  code text not null unique, -- ex: VIEW_REPORTS
  description text,
  module public.permission_module not null
);

-- 4. User Permissions (N:N)
create table public.user_permissions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  permission_id uuid references public.permissions(id) on delete cascade not null,
  granted_at timestamp with time zone default now() not null,
  unique(user_id, permission_id)
);

-- 5. User Price Table Access
create table public.user_price_table_access (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  price_table public.price_table_type not null,
  max_discount_percent numeric default 0,
  created_at timestamp with time zone default now() not null
);

-- 6. User Sessions (Log de auditoria simplificado)
create table public.user_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  ip_address text,
  device_info text,
  login_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 3. Módulo Configurações
-- -----------------------------------------------------------------------------

-- 7. Tenant Settings
create table public.tenant_settings (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  tax_regime public.tax_regime default 'SIMPLES_NACIONAL',
  logo_url text,
  currency text default 'BRL',
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique(tenant_id)
);

-- 8. Payment Methods
create table public.payment_methods (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null, -- ex: Pix, Cartão Crédito 10x
  tax_percent numeric default 0,
  days_to_receive integer default 0,
  active boolean default true,
  created_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 4. Módulo Itens (Matéria Prima / Insumos)
-- -----------------------------------------------------------------------------

-- 9. Items
create table public.items (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  cost_price numeric not null default 0,
  unit public.unit_measure default 'UN',
  ncm_code text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- 10. Item Tax Details
create table public.item_tax_details (
  id uuid default uuid_generate_v4() primary key,
  item_id uuid references public.items(id) on delete cascade not null,
  tax_type public.tax_type not null,
  rate_percent numeric default 0,
  is_credit boolean default false,
  created_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 5. Módulo Produtos (Venda)
-- -----------------------------------------------------------------------------

-- 11. Products
create table public.products (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  sku text,
  sale_price numeric not null default 0,
  cost_total numeric default 0, -- Campo cacheado ou calculado
  description text,
  unit public.unit_measure default 'UN',
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- 12. Product Items (Ficha Técnica)
create table public.product_items (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  item_id uuid references public.items(id) on delete restrict not null,
  quantity_needed numeric not null default 1,
  created_at timestamp with time zone default now() not null
);

-- 13. Product Tax Calculations
create table public.product_tax_calculations (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  effective_tax_rate numeric default 0,
  calculated_tax_value numeric default 0,
  created_at timestamp with time zone default now() not null,
  unique(product_id)
);

-- -----------------------------------------------------------------------------
-- 6. Módulo Estoque
-- -----------------------------------------------------------------------------

-- 14. Stock
create table public.stock (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  quantity_current numeric default 0,
  min_limit numeric default 0,
  updated_at timestamp with time zone default now() not null,
  check (product_id is not null or item_id is not null) -- Deve estar ligado a um produto ou insumo
);

-- 15. Stock Movements
create table public.stock_movements (
  id uuid default uuid_generate_v4() primary key,
  stock_id uuid references public.stock(id) on delete cascade not null,
  delta_quantity numeric not null, -- +10, -5
  reason text,
  created_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 7. Módulo Clientes
-- -----------------------------------------------------------------------------

-- 16. Customers
create table public.customers (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  document text, -- CPF/CNPJ
  email text,
  phone text,
  address text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 8. Módulo Pipeline Comercial
-- -----------------------------------------------------------------------------

-- 17. Budgets (Orçamentos)
create table public.budgets (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  customer_id uuid references public.customers(id) on delete set null,
  status public.budget_status default 'DRAFT',
  total_value numeric default 0,
  expiration_date date,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- 18. Budget Items
create table public.budget_items (
  id uuid default uuid_generate_v4() primary key,
  budget_id uuid references public.budgets(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete restrict not null,
  quantity numeric default 1,
  unit_price numeric default 0,
  discount numeric default 0,
  created_at timestamp with time zone default now() not null
);

-- 19. Orders (Pedidos)
create table public.orders (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  budget_id uuid references public.budgets(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  status public.order_status default 'PENDING',
  delivery_date date,
  total_value numeric default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- 20. Allocations (Reservas de Estoque)
create table public.allocations (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  stock_id uuid references public.stock(id) on delete restrict not null,
  quantity_reserved numeric not null,
  status public.allocation_status default 'RESERVED',
  created_at timestamp with time zone default now() not null
);

-- 21. Sales (Venda Finalizada)
create table public.sales (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  order_id uuid references public.orders(id) on delete set null,
  invoice_number text,
  final_value numeric not null,
  sale_date timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 9. Módulo Fluxo de Caixa
-- -----------------------------------------------------------------------------

-- 24. Cashier Categories (Criando antes para referenciar em entries)
create table public.cashier_categories (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  type public.cash_category_type not null,
  is_calculable_in_dre boolean default true,
  created_at timestamp with time zone default now() not null
);

-- 22. Cashier Months
create table public.cashier_months (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  month_year date not null, -- Sempre dia 1 do mês
  total_in numeric default 0,
  total_out numeric default 0,
  balance numeric default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique(tenant_id, month_year)
);

-- 23. Cash Entries (Lançamentos)
create table public.cash_entries (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  cashier_month_id uuid references public.cashier_months(id) on delete set null,
  category_id uuid references public.cashier_categories(id) on delete set null,
  type public.cash_direction not null,
  amount numeric not null,
  due_date date,
  paid_date date,
  description text,
  created_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 10. Módulo DRE
-- -----------------------------------------------------------------------------

-- 25. DRE Yearly
create table public.dre_yearly (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  year integer not null,
  data_json jsonb default '{}'::jsonb,
  net_profit numeric default 0,
  updated_at timestamp with time zone default now() not null,
  unique(tenant_id, year)
);

-- -----------------------------------------------------------------------------
-- 11. Módulo Agenda
-- -----------------------------------------------------------------------------

-- 26. Calendar Events
create table public.calendar_events (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  status public.event_status default 'SCHEDULED',
  description text,
  created_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 12. Módulo Relatórios
-- -----------------------------------------------------------------------------

-- 27. Report Snapshots
create table public.report_snapshots (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  report_type text not null,
  generated_at timestamp with time zone default now() not null,
  filters_used jsonb,
  file_url text,
  data_blob jsonb
);

-- -----------------------------------------------------------------------------
-- 13. Módulo Suporte & Automação
-- -----------------------------------------------------------------------------

-- 28. Message Templates
create table public.message_templates (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  title text not null,
  body_text text not null,
  variables_schema jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now() not null
);

-- 29. Automation Rules
create table public.automation_rules (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  trigger_event public.automation_trigger not null,
  condition jsonb, -- Lógica condicional
  action_type public.automation_action not null,
  template_id uuid references public.message_templates(id),
  is_active boolean default true,
  created_at timestamp with time zone default now() not null
);

-- 30. Automation Logs
create table public.automation_logs (
  id uuid default uuid_generate_v4() primary key,
  rule_id uuid references public.automation_rules(id) on delete set null,
  entity_id uuid, -- ID do Budget, Sale, etc.
  result text,
  executed_at timestamp with time zone default now() not null
);

-- 31. AI Agent Config
create table public.ai_agent_config (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  model_config jsonb default '{}'::jsonb,
  knowledge_base_ref text,
  persona text,
  updated_at timestamp with time zone default now() not null,
  unique(tenant_id)
);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas sensíveis
alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.items enable row level security;
alter table public.products enable row level security;
alter table public.stock enable row level security;
alter table public.customers enable row level security;
alter table public.budgets enable row level security;
alter table public.orders enable row level security;
alter table public.sales enable row level security;
alter table public.cashier_months enable row level security;

-- Funções Helpers para RLS
-- Retorna o tenant_id do usuário atual
create or replace function public.get_auth_tenant_id()
returns uuid
language sql security definer
stable
as $$
  select tenant_id from public.users where id = auth.uid();
$$;

-- POLICIES (Exemplos principais - replicar lógica para todas)

-- Tenants: Usuário vê apenas seu tenant
create policy "Users can view own tenant" on public.tenants
  for select using (id = public.get_auth_tenant_id());

-- Users: Usuário vê usuários do mesmo tenant
create policy "Users can view mechanics in same tenant" on public.users
  for select using (tenant_id = public.get_auth_tenant_id());

-- Items (Exemplo de tabela de tenant)
create policy "Users can view items of own tenant" on public.items
  for all using (tenant_id = public.get_auth_tenant_id());

-- Products
create policy "Users can view products of own tenant" on public.products
  for all using (tenant_id = public.get_auth_tenant_id());

-- Customers
create policy "Users can view customers of own tenant" on public.customers
  for all using (tenant_id = public.get_auth_tenant_id());

-- Budgets
create policy "Users can view budgets of own tenant" on public.budgets
  for all using (tenant_id = public.get_auth_tenant_id());

-- -----------------------------------------------------------------------------
-- TRIGGERS DE INICIALIZAÇÃO
-- -----------------------------------------------------------------------------

-- Função para criar Tenant e User automaticamente ao registrar no Supabase Auth
-- (Supõe-se que o metadata do usuário contenha 'tenant_name' ou cria um default)
create or replace function public.handle_new_auth_user()
returns trigger as $$
declare
  new_tenant_id uuid;
begin
  -- 1. Cria um Tenant novo para o usuário
  insert into public.tenants (name)
  values (coalesce(new.raw_user_meta_data->>'company_name', 'Minha Empresa'))
  returning id into new_tenant_id;

  -- 2. Cria o registro na tabela public.users
  insert into public.users (id, tenant_id, email, role)
  values (new.id, new_tenant_id, new.email, 'ADMIN');

  return new;
end;
$$ language plpgsql security definer;

-- Trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
