-- ============================================================================================
-- NOTAS DE COMPRA (crédito por tributo) · GUIAS POR TRIBUTO E COMPETÊNCIA
--
-- Comando do PO de 21/09/2026, §8. Migração ADITIVA: nenhuma coluna existente é alterada e
-- NENHUM lançamento é reclassificado.
--
-- ── POR QUE UMA TABELA, E NÃO MAIS COLUNAS EM `cash_entries` ────────────────────────────────
-- Uma nota fiscal e um lançamento de caixa são coisas de cardinalidade diferente: uma nota
-- parcelada em 6x produz SEIS lançamentos, e o crédito da nota é UM. Guardar o crédito no
-- lançamento obriga a rateá-lo — que é o que se faz hoje — e aí a aba Créditos teria de
-- reconstituir a nota somando parcelas, o que só funciona enquanto ninguém editar uma delas.
--
-- ── ORIGEM: `NOVO` E `LEGADO`, E A DISTINÇÃO É PERMANENTE ──────────────────────────────────
-- `LEGADO` é a nota criada a partir de um lançamento antigo que já tinha imposto: ela não tem
-- número, não tem fornecedor e a data do crédito é o VENCIMENTO, não a emissão. `data_estimada`
-- diz isso no dado, e não numa convenção — `ausente-vs-falso.md`: um `issue_date` preenchido
-- com o vencimento AFIRMA uma data de emissão que ninguém informou.
--
-- ── GUIAS ──────────────────────────────────────────────────────────────────────────────────
-- `tax_kind` (um tributo por lançamento), `competence_month` (o mês a que a guia se refere,
-- que NÃO é o do vencimento) e `guide_type`. Sem competência não há apuração: a guia vence em
-- setembro e apura agosto, e somar uma na outra é o erro que o quadro existe para impedir.
--
-- Todas NULLABLE E SEM DEFAULT. `competence_month` com default "mês anterior ao vencimento"
-- no BANCO afirmaria a competência de toda guia antiga — a sugestão é da TELA, onde o usuário
-- a vê e pode corrigi-la.
--
-- ── ORDEM E VERIFICAÇÃO ─────────────────────────────────────────────────────────────────────
-- `migration-delivery.md`: merge NÃO é entrega. Aplicar ANTES do merge — o código novo grava
-- `purchase_invoice_id` e os três campos de guia.
--
-- ANTES (medido em 21/09/2026):
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='purchase_invoices';                    -- 0
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='cash_entries'
--      and column_name in ('purchase_invoice_id','tax_kind','competence_month','guide_type');
--   -- 0
--
-- DEPOIS:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='purchase_invoices' order by ordinal_position;
--   select count(*) from purchase_invoices;                                             -- 0
--
-- E o `NOTIFY` é passo SEPARADO — ele não vem com o COMMIT.
-- ============================================================================================

BEGIN;

-- ── 1. A NOTA DE COMPRA ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Identificação. TODOS nuláveis: no legado não há número nem fornecedor, e preencher com
  -- "não informado" no dado faria a string virar um fornecedor de verdade nos filtros.
  invoice_number    text,
  invoice_series    text,
  access_key        text,
  supplier_name     text,
  supplier_document text,

  -- Datas. `issue_date` é a emissão e `entry_date` a entrada; `credit_date` é a que MANDA na
  -- apuração, e `credit_date_estimated` diz quando ela foi deduzida em vez de informada.
  issue_date            date,
  entry_date            date,
  credit_date           date,
  credit_date_estimated boolean NOT NULL DEFAULT false,

  -- A natureza da despesa, como `natureza-da-despesa.ts` a resolve. É ela que explica, na aba
  -- Créditos, por que aquela nota creditou o que creditou.
  expense_nature    text,
  expense_category  text,

  total_amount      numeric,

  -- O CRÉDITO por tributo, já decidido pelas bandeiras. Nulável: `null` é "não apurado" e
  -- zero é "apurado e deu zero" — a distinção que o botão desligado produz.
  credit_icms       numeric,
  credit_pis_cofins numeric,
  credit_ipi        numeric,
  credit_cbs        numeric,
  credit_ibs        numeric,

  -- `NOVO` nasce da tela; `LEGADO` nasce da migração sobre lançamento antigo com imposto.
  origin            text NOT NULL DEFAULT 'NOVO' CHECK (origin IN ('NOVO', 'LEGADO')),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_invoices_tenant_credit_date_idx
  ON public.purchase_invoices (tenant_id, credit_date);

COMMENT ON TABLE public.purchase_invoices IS
  'Nota de compra com o crédito por tributo. Uma nota pode originar várias parcelas em cash_entries; o crédito é da NOTA, não da parcela.';
COMMENT ON COLUMN public.purchase_invoices.credit_date_estimated IS
  'true = a data do crédito foi DEDUZIDA (no legado, do vencimento) e não informada. Ver `ausente-vs-falso.md`.';

-- ── 2. O elo com o lançamento ──────────────────────────────────────────────────────────────
ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cash_entries_purchase_invoice_idx
  ON public.cash_entries (purchase_invoice_id);

-- ── 3. As guias ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS tax_kind text,
  ADD COLUMN IF NOT EXISTS competence_month date,
  ADD COLUMN IF NOT EXISTS guide_type text;

COMMENT ON COLUMN public.cash_entries.tax_kind IS
  'O tributo da guia — UM por lançamento. ICMS, PIS, COFINS, IPI, CBS, IBS entram na apuração; DAS, IRPJ, CSLL, ICMS-ST, DIFAL, FCP, INSS, FGTS e taxas são despesa.';
COMMENT ON COLUMN public.cash_entries.competence_month IS
  'Primeiro dia do mês de COMPETÊNCIA da guia, que NÃO é o do vencimento: a guia de agosto vence em setembro. NULL = não informado.';
COMMENT ON COLUMN public.cash_entries.guide_type IS
  'principal | complementar | retificadora | multa_juros | parcelamento. Só principal e complementar entram na apuração.';

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
