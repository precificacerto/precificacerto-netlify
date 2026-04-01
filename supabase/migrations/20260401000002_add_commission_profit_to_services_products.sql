-- Migration: commission_percent and profit_percent on services and products
-- These columns store the direct commission/profit % used in pricing

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_percent     NUMERIC(8,4) NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_percent     NUMERIC(8,4) NOT NULL DEFAULT 0;
