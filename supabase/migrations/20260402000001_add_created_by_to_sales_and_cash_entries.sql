-- =====================================================
-- Migration: Add created_by to sales and cash_entries
-- Created: 2026-04-02
-- Fixes: Sales never appear (INSERT was failing due to missing created_by column)
--        Cash entries from Vendas/Agenda also failed silently without this column
-- =====================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Index for audit/filtering by creator
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON public.sales(created_by);
CREATE INDEX IF NOT EXISTS idx_cash_entries_created_by ON public.cash_entries(created_by);
