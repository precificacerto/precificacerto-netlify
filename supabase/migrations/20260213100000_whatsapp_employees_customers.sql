-- =============================================================================
-- Migration: WhatsApp Integration + Employees + Enhanced Customers
-- Date: 2026-02-13
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. NOVOS ENUMS
-- -----------------------------------------------------------------------------
create type public.whatsapp_status as enum ('DISCONNECTED', 'CONNECTING', 'CONNECTED');
create type public.dispatch_type as enum ('APPOINTMENT_REMINDER', 'BUDGET_SEND');
create type public.dispatch_status as enum ('PENDING', 'SENT', 'FAILED', 'DELIVERED');
create type public.employee_role as enum ('PRODUCTIVE', 'COMMERCIAL', 'ADMINISTRATIVE');
create type public.employee_status as enum ('ACTIVE', 'INACTIVE', 'ON_LEAVE');
create type public.customer_type as enum ('PF', 'PJ');
create type public.customer_status as enum ('ACTIVE', 'INACTIVE');

-- -----------------------------------------------------------------------------
-- 2. WHATSAPP INTEGRATION (Configuração por Tenant)
-- -----------------------------------------------------------------------------
create table public.whatsapp_config (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  session_name text, -- nome da sessão no n8n
  status public.whatsapp_status default 'DISCONNECTED',
  phone_number text, -- número conectado
  connected_at timestamp with time zone,
  qr_code_url text, -- URL do endpoint n8n que gera o QR code
  n8n_webhook_appointment text, -- webhook n8n para disparo de lembrete
  n8n_webhook_budget text, -- webhook n8n para disparo de orçamento
  last_ping_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique(tenant_id)
);

-- 3. WHATSAPP DISPATCH LOG (Histórico de disparos)
create table public.whatsapp_dispatches (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  dispatch_type public.dispatch_type not null,
  status public.dispatch_status default 'PENDING',
  recipient_phone text not null,
  recipient_name text,
  customer_id uuid references public.customers(id) on delete set null,
  -- Referências condicionais
  appointment_id uuid references public.calendar_events(id) on delete set null,
  budget_id uuid references public.budgets(id) on delete set null,
  -- Conteúdo
  message_body text,
  pdf_url text, -- URL do PDF do orçamento (quando dispatch_type = BUDGET_SEND)
  -- Resultado
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  error_message text,
  n8n_execution_id text, -- ID da execução no n8n para rastreamento
  created_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 4. EMPLOYEES (Funcionários)
-- -----------------------------------------------------------------------------
create table public.employees (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  email text,
  phone text,
  document text, -- CPF
  role public.employee_role default 'PRODUCTIVE',
  position text, -- cargo: Atendente, Cabeleireiro, etc.
  status public.employee_status default 'ACTIVE',
  salary numeric default 0,
  work_hours_per_day numeric default 8,
  work_days_per_month integer default 22,
  hire_date date,
  birth_date date,
  notes text,
  avatar_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- 5. EMPLOYEE SCHEDULE (Escala de trabalho)
create table public.employee_schedules (
  id uuid default uuid_generate_v4() primary key,
  employee_id uuid references public.employees(id) on delete cascade not null,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6), -- 0=Dom, 6=Sáb
  start_time time not null,
  end_time time not null,
  is_off boolean default false, -- folga
  created_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- 6. ENHANCE CUSTOMERS TABLE (Adicionar campos faltantes)
-- -----------------------------------------------------------------------------
alter table public.customers add column if not exists customer_type public.customer_type default 'PF';
alter table public.customers add column if not exists status public.customer_status default 'ACTIVE';
alter table public.customers add column if not exists city text;
alter table public.customers add column if not exists state text;
alter table public.customers add column if not exists segment text;
alter table public.customers add column if not exists birth_date date;
alter table public.customers add column if not exists notes text;
alter table public.customers add column if not exists whatsapp_phone text; -- telefone WhatsApp (pode ser diferente do principal)

-- 7. ENHANCE CALENDAR_EVENTS (vincular a funcionário e flag de lembrete WhatsApp)
alter table public.calendar_events add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.calendar_events add column if not exists whatsapp_reminder_sent boolean default false;
alter table public.calendar_events add column if not exists reminder_minutes_before integer default 60; -- minutos antes do evento para enviar lembrete

-- 8. ENHANCE BUDGETS (flag de envio WhatsApp e URL do PDF)
alter table public.budgets add column if not exists pdf_url text;
alter table public.budgets add column if not exists whatsapp_sent boolean default false;
alter table public.budgets add column if not exists whatsapp_sent_at timestamp with time zone;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.whatsapp_config enable row level security;
alter table public.whatsapp_dispatches enable row level security;
alter table public.employees enable row level security;
alter table public.employee_schedules enable row level security;

-- Policies
create policy "Users manage own tenant whatsapp config" on public.whatsapp_config
  for all using (tenant_id = public.get_auth_tenant_id());

create policy "Users manage own tenant whatsapp dispatches" on public.whatsapp_dispatches
  for all using (tenant_id = public.get_auth_tenant_id());

create policy "Users manage own tenant employees" on public.employees
  for all using (tenant_id = public.get_auth_tenant_id());

create policy "Users manage employee schedules via employees" on public.employee_schedules
  for all using (
    employee_id in (
      select id from public.employees where tenant_id = public.get_auth_tenant_id()
    )
  );

-- -----------------------------------------------------------------------------
-- INDEXES (Performance)
-- -----------------------------------------------------------------------------
create index idx_whatsapp_dispatches_tenant on public.whatsapp_dispatches(tenant_id);
create index idx_whatsapp_dispatches_type on public.whatsapp_dispatches(dispatch_type);
create index idx_whatsapp_dispatches_status on public.whatsapp_dispatches(status);
create index idx_employees_tenant on public.employees(tenant_id);
create index idx_employees_role on public.employees(role);
create index idx_employee_schedules_employee on public.employee_schedules(employee_id);
create index idx_customers_type on public.customers(customer_type);
create index idx_customers_status on public.customers(status);
