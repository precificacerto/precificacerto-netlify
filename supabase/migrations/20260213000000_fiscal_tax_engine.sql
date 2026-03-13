-- =============================================================================
-- MIGRATION: Fiscal & Tax Engine (Precifica Certo)
-- Suporta: MEI, Simples Nacional, Simples Híbrido, Lucro Presumido,
--          Lucro Presumido RET, Lucro Real
-- Inclui: NCM, créditos tributários, motor de precificação, n8n integration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. NOVOS ENUMS
-- -----------------------------------------------------------------------------

-- Expandir regime tributário
ALTER TYPE public.tax_regime ADD VALUE IF NOT EXISTS 'MEI';
ALTER TYPE public.tax_regime ADD VALUE IF NOT EXISTS 'SIMPLES_HIBRIDO';
ALTER TYPE public.tax_regime ADD VALUE IF NOT EXISTS 'LUCRO_PRESUMIDO_RET';

-- Expandir tipos de imposto
ALTER TYPE public.tax_type ADD VALUE IF NOT EXISTS 'PIS_COFINS';
ALTER TYPE public.tax_type ADD VALUE IF NOT EXISTS 'CSLL';
ALTER TYPE public.tax_type ADD VALUE IF NOT EXISTS 'IRPJ';
ALTER TYPE public.tax_type ADD VALUE IF NOT EXISTS 'CBS';
ALTER TYPE public.tax_type ADD VALUE IF NOT EXISTS 'IBS';
ALTER TYPE public.tax_type ADD VALUE IF NOT EXISTS 'IS';

-- Tipo de cálculo do produto
CREATE TYPE public.calc_type AS ENUM ('INDUSTRIALIZACAO', 'SERVICO', 'REVENDA');

-- Expandir unidades de medida
ALTER TYPE public.unit_measure ADD VALUE IF NOT EXISTS 'G';
ALTER TYPE public.unit_measure ADD VALUE IF NOT EXISTS 'ML';
ALTER TYPE public.unit_measure ADD VALUE IF NOT EXISTS 'CM';
ALTER TYPE public.unit_measure ADD VALUE IF NOT EXISTS 'MM';
ALTER TYPE public.unit_measure ADD VALUE IF NOT EXISTS 'KM';
ALTER TYPE public.unit_measure ADD VALUE IF NOT EXISTS 'W';

-- Tipo de unidade de carga horária
CREATE TYPE public.workload_unit AS ENUM ('MINUTES', 'HOURS', 'DAYS', 'ACTIVITIES');

-- Status da atualização fiscal (n8n)
CREATE TYPE public.tax_update_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- Tipo de PIS/COFINS
CREATE TYPE public.pis_cofins_regime AS ENUM ('CUMULATIVO', 'NAO_CUMULATIVO', 'MONOFASICO', 'ISENTO');

-- Origem do IPI
CREATE TYPE public.ipi_treatment AS ENUM ('CREDITO', 'CUSTO', 'ISENTO', 'NAO_APLICAVEL');

-- =============================================================================
-- 2. INFRAESTRUTURA FISCAL (tabelas de referência global — sem tenant)
-- =============================================================================

-- 2.1 Estados Brasileiros (para ICMS interestadual)
CREATE TABLE IF NOT EXISTS public.brazilian_states (
  id serial PRIMARY KEY,
  code char(2) NOT NULL UNIQUE,        -- UF: SP, RJ, RS...
  name text NOT NULL,
  icms_internal_rate numeric NOT NULL DEFAULT 0,  -- Alíquota interna padrão
  created_at timestamptz DEFAULT now()
);

-- 2.2 Alíquotas interestaduais de ICMS (origem → destino)
CREATE TABLE IF NOT EXISTS public.icms_interstate_rates (
  id serial PRIMARY KEY,
  origin_state char(2) NOT NULL,
  destination_state char(2) NOT NULL,
  rate_percent numeric NOT NULL DEFAULT 0,  -- 4%, 7% ou 12%
  is_imported boolean DEFAULT false,         -- 4% para importados
  valid_from date DEFAULT CURRENT_DATE,
  valid_until date,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(origin_state, destination_state, is_imported, valid_from)
);

-- 2.3 Tabela NCM (Nomenclatura Comum do Mercosul)
CREATE TABLE IF NOT EXISTS public.ncm_codes (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,          -- Ex: "3917.10.10"
  description text,
  chapter text,                       -- Capítulo NCM (2 dígitos)
  ipi_rate numeric DEFAULT 0,         -- Alíquota IPI padrão (TIPI)
  ipi_treatment public.ipi_treatment DEFAULT 'NAO_APLICAVEL',
  pis_cofins_regime public.pis_cofins_regime DEFAULT 'NAO_CUMULATIVO',
  pis_rate_cumulativo numeric DEFAULT 0.0065,    -- 0.65%
  cofins_rate_cumulativo numeric DEFAULT 0.03,   -- 3.00%
  pis_rate_nao_cumulativo numeric DEFAULT 0.0165, -- 1.65%
  cofins_rate_nao_cumulativo numeric DEFAULT 0.076, -- 7.60%
  has_icms_st boolean DEFAULT false,   -- Tem substituição tributária?
  mva_percent numeric DEFAULT 0,       -- MVA original (ICMS-ST)
  cbs_rate numeric DEFAULT 0.009,      -- CBS reforma tributária
  ibs_rate numeric DEFAULT 0.001,      -- IBS reforma tributária
  updated_at timestamptz DEFAULT now(),
  updated_by text DEFAULT 'MANUAL'     -- 'MANUAL', 'N8N', 'API_IBPT'
);

-- 2.4 Tabela NBS (Nomenclatura Brasileira de Serviços)
CREATE TABLE IF NOT EXISTS public.nbs_codes (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  description text,
  iss_rate_min numeric DEFAULT 0.02,   -- 2%
  iss_rate_max numeric DEFAULT 0.05,   -- 5%
  iss_rate_default numeric DEFAULT 0.05,
  updated_at timestamptz DEFAULT now()
);

-- 2.5 Faixas do Simples Nacional (Anexos I a V)
CREATE TABLE IF NOT EXISTS public.simples_nacional_brackets (
  id serial PRIMARY KEY,
  anexo text NOT NULL,                 -- 'I','II','III','IV','V'
  bracket_order int NOT NULL,
  revenue_min numeric NOT NULL,        -- Faturamento 12 meses (de)
  revenue_max numeric NOT NULL,        -- Faturamento 12 meses (até)
  nominal_rate numeric NOT NULL,       -- Alíquota nominal
  deduction numeric NOT NULL DEFAULT 0,-- Parcela a deduzir
  cpp_percent numeric DEFAULT 0,       -- % CPP na composição
  icms_percent numeric DEFAULT 0,      -- % ICMS na composição
  iss_percent numeric DEFAULT 0,       -- % ISS na composição
  pis_percent numeric DEFAULT 0,       -- % PIS na composição
  cofins_percent numeric DEFAULT 0,    -- % COFINS na composição
  ipi_percent numeric DEFAULT 0,       -- % IPI na composição
  irpj_percent numeric DEFAULT 0,      -- % IRPJ na composição
  csll_percent numeric DEFAULT 0,      -- % CSLL na composição
  valid_from date DEFAULT CURRENT_DATE,
  valid_until date,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(anexo, bracket_order, valid_from)
);

-- 2.6 Alíquotas de Lucro Presumido (por atividade)
CREATE TABLE IF NOT EXISTS public.lucro_presumido_rates (
  id serial PRIMARY KEY,
  activity_type text NOT NULL,         -- 'INDUSTRIA','COMERCIO','SERVICO','TRANSPORTE'
  irpj_presumption_percent numeric NOT NULL, -- Base de presunção IRPJ (8%, 16%, 32%)
  csll_presumption_percent numeric NOT NULL, -- Base de presunção CSLL (12%, 32%)
  irpj_rate numeric DEFAULT 0.15,      -- 15%
  irpj_additional_rate numeric DEFAULT 0.10, -- 10% sobre excedente
  irpj_additional_threshold numeric DEFAULT 60000, -- R$60k/trimestre
  csll_rate numeric DEFAULT 0.09,      -- 9%
  pis_rate numeric DEFAULT 0.0065,     -- 0,65% cumulativo
  cofins_rate numeric DEFAULT 0.03,    -- 3,00% cumulativo
  valid_from date DEFAULT CURRENT_DATE,
  valid_until date,
  updated_at timestamptz DEFAULT now()
);

-- 2.7 Parâmetros do Lucro Real
CREATE TABLE IF NOT EXISTS public.lucro_real_params (
  id serial PRIMARY KEY,
  irpj_rate numeric DEFAULT 0.15,           -- 15%
  irpj_additional_rate numeric DEFAULT 0.10, -- 10%
  irpj_additional_annual_threshold numeric DEFAULT 240000, -- R$ 240.000/ano
  csll_rate numeric DEFAULT 0.09,            -- 9%
  pis_rate numeric DEFAULT 0.0165,           -- 1,65%
  cofins_rate numeric DEFAULT 0.076,         -- 7,60%
  valid_from date DEFAULT CURRENT_DATE,
  valid_until date,
  updated_at timestamptz DEFAULT now()
);

-- 2.8 Log de atualizações fiscais (integração n8n)
CREATE TABLE IF NOT EXISTS public.tax_update_logs (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  source text NOT NULL,                -- 'N8N', 'MANUAL', 'API_IBPT', 'SEFAZ'
  table_affected text NOT NULL,        -- Nome da tabela atualizada
  records_updated int DEFAULT 0,
  status public.tax_update_status DEFAULT 'PENDING',
  payload jsonb,                       -- Dados recebidos do n8n
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- =============================================================================
-- 3. CONFIGURAÇÃO DO TENANT (expandir tenant_settings)
-- =============================================================================

ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS calc_type public.calc_type DEFAULT 'INDUSTRIALIZACAO',
  ADD COLUMN IF NOT EXISTS state_code char(2) DEFAULT 'SP',
  ADD COLUMN IF NOT EXISTS cnae_code text,
  ADD COLUMN IF NOT EXISTS cnae_allows_ipi_credit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS workload_unit public.workload_unit DEFAULT 'MINUTES',
  ADD COLUMN IF NOT EXISTS monthly_workload numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_productive_employees int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS num_commercial_employees int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_administrative_employees int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS simples_anexo text,
  ADD COLUMN IF NOT EXISTS simples_revenue_12m numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lucro_presumido_activity text DEFAULT 'INDUSTRIA',
  ADD COLUMN IF NOT EXISTS icms_contribuinte boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS iss_municipality_rate numeric DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS tax_reduction_factor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS n8n_webhook_url text;

-- 3.1 Tabela de percentuais de despesas do tenant (vem do Precifica Certo)
CREATE TABLE IF NOT EXISTS public.tenant_expense_config (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  indirect_labor_percent numeric DEFAULT 0,      -- MO Indireta %
  fixed_expense_percent numeric DEFAULT 0,       -- Desp. Fixa %
  variable_expense_percent numeric DEFAULT 0,    -- Desp. Variável %
  financial_expense_percent numeric DEFAULT 0,   -- Desp. Financeira %
  production_labor_cost numeric DEFAULT 0,       -- Custo médio MO Produtiva (R$)
  production_labor_percent numeric DEFAULT 0,    -- % MO Produtiva (revenda)
  commission_percent numeric DEFAULT 0,          -- Comissão padrão %
  profit_margin_percent numeric DEFAULT 0,       -- Lucro desejado %
  taxable_regime_percent numeric DEFAULT 0,      -- Regime tributário % (Simples DAS)
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

-- =============================================================================
-- 4. ITENS EXPANDIDOS (fiscal)
-- =============================================================================

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS cost_gross numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_net numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nbs_code text,
  ADD COLUMN IF NOT EXISTS c_class_trib text,
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_state char(2),
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS observation text;

-- 4.1 Créditos tributários por item (substituir item_tax_details)
-- Cada item pode ter N impostos, cada um ativado ou não (acionador "x")
DROP TABLE IF EXISTS public.item_tax_credits CASCADE;
CREATE TABLE public.item_tax_credits (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE NOT NULL,
  tax_type public.tax_type NOT NULL,
  is_active boolean DEFAULT false,       -- Acionador "x" da planilha
  rate_percent numeric DEFAULT 0,        -- Alíquota (ex: 12% ICMS)
  credit_value numeric DEFAULT 0,        -- Valor do crédito calculado
  is_highlighted boolean DEFAULT false,  -- "destacado" na nota
  source text DEFAULT 'MANUAL',          -- 'MANUAL', 'NCM_LOOKUP', 'N8N'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(item_id, tax_type)
);

-- =============================================================================
-- 5. PRODUTOS EXPANDIDOS
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS yield_quantity numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS yield_unit public.unit_measure DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS ncm_code text,
  ADD COLUMN IF NOT EXISTS nbs_code text,
  ADD COLUMN IF NOT EXISTS price_table_a numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_table_b numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_table_c numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_table_d numeric DEFAULT 0;

-- 5.1 Product Items expandido (com créditos por item no produto)
ALTER TABLE public.product_items
  ADD COLUMN IF NOT EXISTS item_cost_gross numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_cost_net numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_icms numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_pis_cofins numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_ipi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_cbs numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_ibs numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credits numeric DEFAULT 0;

-- =============================================================================
-- 6. MÃO DE OBRA
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.labor_costs (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  labor_type text NOT NULL DEFAULT 'PROPRIA',  -- 'PROPRIA', 'TERCEIRIZADA'
  description text,
  gross_value numeric DEFAULT 0,
  pis_cofins_credit_active boolean DEFAULT false,
  pis_cofins_credit_rate numeric DEFAULT 0.0925,
  pis_cofins_credit_value numeric DEFAULT 0,
  net_value numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =============================================================================
-- 7. MOTOR DE PRECIFICAÇÃO (snapshot completo de cada cálculo)
-- =============================================================================

-- 7.1 Cálculo principal (1 por produto, por regime)
DROP TABLE IF EXISTS public.product_tax_calculations CASCADE;
CREATE TABLE public.pricing_calculations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  tax_regime public.tax_regime NOT NULL,
  calc_type public.calc_type NOT NULL,

  -- CMV (Custo da Mercadoria Vendida)
  total_material_cost_gross numeric DEFAULT 0,
  total_material_ipi_cost numeric DEFAULT 0,
  total_credit_icms numeric DEFAULT 0,
  total_credit_pis_cofins numeric DEFAULT 0,
  total_credit_ipi numeric DEFAULT 0,
  total_credit_cbs numeric DEFAULT 0,
  total_credit_ibs numeric DEFAULT 0,
  total_material_cost_net numeric DEFAULT 0,       -- Custo líquido MP
  total_labor_gross numeric DEFAULT 0,
  total_labor_net numeric DEFAULT 0,
  cmv numeric DEFAULT 0,                           -- total_material_cost_net + total_labor_net

  -- Percentuais usados no coeficiente
  pct_material_cost numeric DEFAULT 0,
  pct_labor_cost numeric DEFAULT 0,
  pct_indirect_labor numeric DEFAULT 0,
  pct_fixed_expense numeric DEFAULT 0,
  pct_variable_expense numeric DEFAULT 0,
  pct_financial_expense numeric DEFAULT 0,
  pct_taxable_regime numeric DEFAULT 0,
  pct_commission numeric DEFAULT 0,
  pct_profit_margin numeric DEFAULT 0,
  pct_csll numeric DEFAULT 0,
  pct_irpj numeric DEFAULT 0,
  pct_irpj_additional numeric DEFAULT 0,
  pct_icms numeric DEFAULT 0,
  pct_pis_cofins numeric DEFAULT 0,
  pct_iss numeric DEFAULT 0,

  -- Acionadores (ativadores de cada bloco)
  icms_active boolean DEFAULT false,
  pis_cofins_active boolean DEFAULT false,
  iss_active boolean DEFAULT false,
  ipi_output_active boolean DEFAULT false,
  cbs_active boolean DEFAULT false,
  ibs_active boolean DEFAULT false,

  -- Alíquotas de venda usadas
  icms_sale_rate numeric DEFAULT 0,
  pis_cofins_sale_rate numeric DEFAULT 0.0925,
  iss_sale_rate numeric DEFAULT 0.05,
  ipi_output_rate numeric DEFAULT 0,

  -- Coeficiente e Preço
  coefficient numeric DEFAULT 0,                   -- 1 - Σ(todos os %)
  sale_price_internal numeric DEFAULT 0,            -- CMV / coeficiente
  
  -- Valores absolutos calculados
  val_indirect_labor numeric DEFAULT 0,
  val_fixed_expense numeric DEFAULT 0,
  val_variable_expense numeric DEFAULT 0,
  val_financial_expense numeric DEFAULT 0,
  val_taxable_regime numeric DEFAULT 0,
  val_commission numeric DEFAULT 0,
  val_profit numeric DEFAULT 0,
  val_csll numeric DEFAULT 0,
  val_irpj numeric DEFAULT 0,
  val_irpj_additional numeric DEFAULT 0,
  val_icms numeric DEFAULT 0,
  val_pis_cofins numeric DEFAULT 0,
  val_iss numeric DEFAULT 0,

  -- IPI de saída (destacado na nota)
  ipi_output_value numeric DEFAULT 0,

  -- IBS / CBS (reforma tributária — por fora)
  ibs_rate numeric DEFAULT 0,
  ibs_debit_value numeric DEFAULT 0,
  ibs_to_collect numeric DEFAULT 0,
  cbs_rate numeric DEFAULT 0,
  cbs_debit_value numeric DEFAULT 0,
  cbs_to_collect numeric DEFAULT 0,
  tax_reduction_factor numeric DEFAULT 0,

  -- Preço final
  sale_price_total numeric DEFAULT 0,              -- interno + IPI saída
  sale_price_per_unit numeric DEFAULT 0,           -- total / rendimento

  -- Carga horária do produto (industrialização/serviço)
  product_workload numeric DEFAULT 0,
  product_workload_price numeric DEFAULT 0,

  -- Metadata
  calculated_at timestamptz DEFAULT now(),
  recalculated boolean DEFAULT false,
  version int DEFAULT 1,
  
  -- Para serviço: preço separado do produto
  service_price numeric DEFAULT 0,
  service_product_price numeric DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pricing_tenant_product 
  ON public.pricing_calculations(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_regime 
  ON public.pricing_calculations(tax_regime);

-- =============================================================================
-- 8. HISTÓRICO DE PREÇOS (para auditoria e análise)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_history (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  pricing_calculation_id uuid REFERENCES public.pricing_calculations(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  sale_price_total numeric NOT NULL,
  cmv numeric NOT NULL,
  coefficient numeric NOT NULL,
  tax_regime public.tax_regime NOT NULL,
  snapshot_json jsonb,                 -- Cópia completa do cálculo
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- 9. CONFIGURAÇÃO N8N (webhooks e sync)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.n8n_sync_config (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  config_key text NOT NULL UNIQUE,     -- 'NCM_SYNC', 'ICMS_SYNC', 'SIMPLES_SYNC'
  webhook_url text,
  last_sync_at timestamptz,
  sync_interval_hours int DEFAULT 24,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =============================================================================
-- 10. EXPANDIR USERS E CUSTOMERS
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS work_schedule jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_discount_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS can_give_discount boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_connected boolean DEFAULT false;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_code char(2),
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS segment text,
  ADD COLUMN IF NOT EXISTS ie text,                -- Inscrição Estadual
  ADD COLUMN IF NOT EXISTS is_icms_contributor boolean DEFAULT false;

-- =============================================================================
-- 11. RLS PARA NOVAS TABELAS
-- =============================================================================

ALTER TABLE public.tenant_expense_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_tax_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_expense_config_policy" ON public.tenant_expense_config
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());
  
CREATE POLICY "labor_costs_policy" ON public.labor_costs
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "pricing_calculations_policy" ON public.pricing_calculations
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "pricing_history_policy" ON public.pricing_history
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- item_tax_credits via JOIN com items
CREATE POLICY "item_tax_credits_policy" ON public.item_tax_credits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.items i 
      WHERE i.id = item_tax_credits.item_id 
      AND i.tenant_id = public.get_auth_tenant_id()
    )
  );

-- Tabelas de referência fiscal: leitura pública (sem tenant)
ALTER TABLE public.ncm_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nbs_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brazilian_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icms_interstate_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simples_nacional_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucro_presumido_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucro_real_params ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ncm_read" ON public.ncm_codes FOR SELECT USING (true);
CREATE POLICY "nbs_read" ON public.nbs_codes FOR SELECT USING (true);
CREATE POLICY "states_read" ON public.brazilian_states FOR SELECT USING (true);
CREATE POLICY "icms_read" ON public.icms_interstate_rates FOR SELECT USING (true);
CREATE POLICY "simples_read" ON public.simples_nacional_brackets FOR SELECT USING (true);
CREATE POLICY "lp_read" ON public.lucro_presumido_rates FOR SELECT USING (true);
CREATE POLICY "lr_read" ON public.lucro_real_params FOR SELECT USING (true);

-- =============================================================================
-- 12. SEEDS: DADOS INICIAIS
-- =============================================================================

-- 12.1 Estados Brasileiros com ICMS interno padrão
INSERT INTO public.brazilian_states (code, name, icms_internal_rate) VALUES
  ('AC','Acre',0.19),('AL','Alagoas',0.19),('AM','Amazonas',0.20),
  ('AP','Amapá',0.18),('BA','Bahia',0.205),('CE','Ceará',0.20),
  ('DF','Distrito Federal',0.20),('ES','Espírito Santo',0.17),
  ('GO','Goiás',0.19),('MA','Maranhão',0.22),('MG','Minas Gerais',0.18),
  ('MS','Mato Grosso do Sul',0.17),('MT','Mato Grosso',0.17),
  ('PA','Pará',0.19),('PB','Paraíba',0.20),('PE','Pernambuco',0.205),
  ('PI','Piauí',0.21),('PR','Paraná',0.195),('RJ','Rio de Janeiro',0.22),
  ('RN','Rio Grande do Norte',0.20),('RO','Rondônia',0.195),
  ('RR','Roraima',0.20),('RS','Rio Grande do Sul',0.17),
  ('SC','Santa Catarina',0.17),('SE','Sergipe',0.19),
  ('SP','São Paulo',0.18),('TO','Tocantins',0.20)
ON CONFLICT (code) DO NOTHING;

-- 12.2 Parâmetros do Lucro Real (vigentes)
INSERT INTO public.lucro_real_params (irpj_rate, irpj_additional_rate, irpj_additional_annual_threshold, csll_rate, pis_rate, cofins_rate)
VALUES (0.15, 0.10, 240000, 0.09, 0.0165, 0.076)
ON CONFLICT DO NOTHING;

-- 12.3 Lucro Presumido (principais atividades)
INSERT INTO public.lucro_presumido_rates (activity_type, irpj_presumption_percent, csll_presumption_percent)
VALUES
  ('INDUSTRIA', 0.08, 0.12),
  ('COMERCIO', 0.08, 0.12),
  ('SERVICO_GERAL', 0.32, 0.32),
  ('SERVICO_HOSPITALAR', 0.08, 0.12),
  ('SERVICO_TRANSPORTE_CARGA', 0.08, 0.12),
  ('SERVICO_TRANSPORTE_PASSAG', 0.16, 0.12),
  ('REVENDA_COMBUSTIVEL', 0.016, 0.12)
ON CONFLICT DO NOTHING;

-- 12.4 Simples Nacional — Anexo I (Comércio) — Faixas vigentes
INSERT INTO public.simples_nacional_brackets (anexo, bracket_order, revenue_min, revenue_max, nominal_rate, deduction, icms_percent, pis_percent, cofins_percent, irpj_percent, csll_percent, cpp_percent) VALUES
  ('I',1,0,180000,0.04,0,0.3400,0.0300,0.1200,0.0550,0.0350,0.4150),
  ('I',2,180000.01,360000,0.073,5940,0.3400,0.0300,0.1200,0.0550,0.0350,0.4150),
  ('I',3,360000.01,720000,0.095,13860,0.3350,0.0300,0.1200,0.0550,0.0350,0.4200),
  ('I',4,720000.01,1800000,0.107,22500,0.3550,0.0300,0.1200,0.0550,0.0350,0.4200),
  ('I',5,1800000.01,3600000,0.143,87300,0.3550,0.0300,0.1200,0.0550,0.0350,0.4200),
  ('I',6,3600000.01,4800000,0.19,378000,0.1355,0.0300,0.1200,0.0550,0.0350,0.6210)
ON CONFLICT DO NOTHING;

-- Anexo II (Indústria)
INSERT INTO public.simples_nacional_brackets (anexo, bracket_order, revenue_min, revenue_max, nominal_rate, deduction, icms_percent, ipi_percent, pis_percent, cofins_percent, irpj_percent, csll_percent, cpp_percent) VALUES
  ('II',1,0,180000,0.045,0,0.3200,0.0500,0.0300,0.1200,0.0550,0.0350,0.3750),
  ('II',2,180000.01,360000,0.078,5940,0.3200,0.0500,0.0300,0.1200,0.0550,0.0350,0.3750),
  ('II',3,360000.01,720000,0.10,13860,0.3200,0.0500,0.0300,0.1200,0.0550,0.0350,0.3750),
  ('II',4,720000.01,1800000,0.112,22500,0.3400,0.0500,0.0300,0.1200,0.0550,0.0350,0.3550),
  ('II',5,1800000.01,3600000,0.147,85500,0.3400,0.0500,0.0300,0.1200,0.0550,0.0350,0.3550),
  ('II',6,3600000.01,4800000,0.30,720000,0.0700,0.1200,0.0400,0.1600,0.0700,0.0400,0.5100)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 13. FUNÇÕES UTILITÁRIAS PARA O MOTOR DE PRECIFICAÇÃO
-- =============================================================================

-- 13.1 Calcular custo líquido de um item
CREATE OR REPLACE FUNCTION public.calc_item_net_cost(p_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_gross numeric;
  v_ipi_cost numeric;
  v_total_credits numeric;
BEGIN
  SELECT cost_gross INTO v_gross FROM public.items WHERE id = p_item_id;
  
  -- IPI como custo (quando não gera crédito)
  SELECT COALESCE(SUM(
    CASE WHEN tax_type = 'IPI' AND NOT is_active THEN rate_percent * v_gross / 100 ELSE 0 END
  ), 0) INTO v_ipi_cost
  FROM public.item_tax_credits WHERE item_id = p_item_id;
  
  -- Total de créditos (quando acionador ativo)
  SELECT COALESCE(SUM(
    CASE WHEN is_active THEN rate_percent * v_gross / 100 ELSE 0 END
  ), 0) INTO v_total_credits
  FROM public.item_tax_credits WHERE item_id = p_item_id;
  
  RETURN v_gross + v_ipi_cost - v_total_credits;
END;
$$;

-- 13.2 Buscar alíquota efetiva do Simples Nacional
CREATE OR REPLACE FUNCTION public.calc_simples_effective_rate(
  p_anexo text, p_revenue_12m numeric
)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_nominal numeric;
  v_deduction numeric;
BEGIN
  SELECT nominal_rate, deduction INTO v_nominal, v_deduction
  FROM public.simples_nacional_brackets
  WHERE anexo = p_anexo
    AND p_revenue_12m >= revenue_min AND p_revenue_12m <= revenue_max
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  ORDER BY valid_from DESC LIMIT 1;
  
  IF v_nominal IS NULL THEN RETURN 0; END IF;
  
  -- Fórmula: (RBT12 × Aliq - PD) / RBT12
  RETURN (p_revenue_12m * v_nominal - v_deduction) / p_revenue_12m;
END;
$$;

-- 13.3 Calcular equivalente sobre receita para IRPJ/CSLL (Lucro Real)
CREATE OR REPLACE FUNCTION public.calc_irpj_csll_equiv(
  p_sale_price numeric, p_profit_value numeric
)
RETURNS TABLE(pct_csll numeric, pct_irpj numeric, pct_irpj_add numeric)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_params record;
  v_csll_val numeric;
  v_irpj_val numeric;
  v_irpj_add_val numeric;
  v_excess numeric;
BEGIN
  SELECT * INTO v_params FROM public.lucro_real_params
  WHERE valid_until IS NULL OR valid_until >= CURRENT_DATE
  ORDER BY valid_from DESC LIMIT 1;
  
  v_csll_val := p_profit_value * v_params.csll_rate;
  v_irpj_val := p_profit_value * v_params.irpj_rate;
  v_excess := p_profit_value - v_params.irpj_additional_annual_threshold;
  v_irpj_add_val := GREATEST(0, v_excess * v_params.irpj_additional_rate);
  
  IF p_sale_price = 0 THEN
    pct_csll := 0; pct_irpj := 0; pct_irpj_add := 0;
  ELSE
    pct_csll := v_csll_val / p_sale_price;
    pct_irpj := v_irpj_val / p_sale_price;
    pct_irpj_add := v_irpj_add_val / p_sale_price;
  END IF;
  
  RETURN NEXT;
END;
$$;
