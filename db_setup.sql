-- =============================================================================
-- ⚠️ DEPRECATED — NÃO USAR ESTE ARQUIVO
-- =============================================================================
-- Este script é legado (era compatível com Firebase Auth).
-- A fonte de verdade é: supabase/migrations/
-- RLS policies aqui estão DESATUALIZADAS e CONFLITAM com as migrations.
-- Mantido apenas como referência histórica. Será removido em sprint futura.
-- =============================================================================

-- ORIGINAL HEADER (deprecated):
-- SCRIPT DE CONFIGURAÇÃO MANUAL DO BANCO DE DADOS (Compatível com Firebase)
-- Este script cria as tabelas necessárias para o sistema funcionar com o Firebase Auth.
-- As chaves estrangeiras para 'tenants' e 'users' foram removidas ou convertidas para TEXT
-- para aceitar os UIDs do Firebase.

-- Habilitar extensão para UUIDs se não existir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. EMPLOYEES (Funcionários)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id text NOT NULL, -- UID do usuário no Firebase
  name text NOT NULL,
  email text,
  phone text,
  document text,
  role text DEFAULT 'PRODUCTIVE', -- Permite cargos personalizados
  position text,
  status text DEFAULT 'ACTIVE',
  salary numeric DEFAULT 0,
  work_hours_per_day numeric DEFAULT 8,
  work_days_per_month integer DEFAULT 22,
  hire_date date,
  birth_date date,
  notes text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON public.employees(tenant_id);

-- Desabilitar RLS para permitir acesso via API (filtragem feita no frontend por enquanto)
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. CUSTOMERS (Clientes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id text NOT NULL, -- UID do usuário no Firebase
  name text NOT NULL,
  document text,
  email text,
  phone text,
  address text,
  customer_type text DEFAULT 'PF',
  status text DEFAULT 'ACTIVE',
  city text,
  state text,
  segment text,
  birth_date date,
  notes text,
  whatsapp_phone text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);

-- Desabilitar RLS
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. WHATSAPP CONFIG (Opcional por enquanto)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id text NOT NULL,
  session_name text,
  status text DEFAULT 'DISCONNECTED',
  phone_number text,
  connected_at timestamp with time zone,
  qr_code_url text,
  n8n_webhook_appointment text,
  n8n_webhook_budget text,
  last_ping_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(tenant_id)
);

ALTER TABLE public.whatsapp_config DISABLE ROW LEVEL SECURITY;
