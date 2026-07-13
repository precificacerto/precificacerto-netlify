-- Migration: RT (Comissão Reserva Técnica) em products/services
-- EPIC-RT v8 (2026-07-13) — Fase 1 (modelo de dados)
--
-- RT é uma dedução gerencial autônoma, paralela a Comissão e Lucro, inserida
-- manualmente por produto na precificação. Espelha EXATAMENTE a estrutura de
-- commission_percent/profit_percent (NUMERIC(8,4), base-100, default 0), conforme
-- a diretriz de persistência do relatório v8 (item 3.9): réplica fiel do padrão já
-- validado de Comissão/Lucro para evitar inconsistências estruturais.
--
-- Aplicar no Supabase (SQL Editor) com service_role. Idempotente (IF NOT EXISTS).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS rt_reserve_percent NUMERIC(8,4) NOT NULL DEFAULT 0;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS rt_reserve_percent NUMERIC(8,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.rt_reserve_percent IS
  'RT (Comissão Reserva Técnica) em % base-100 (ex.: 3.5 = 3,5%). Dedução gerencial paralela a comissão/lucro, alíquota efetiva congelada na cascata RRO (EPIC-RT v8).';
COMMENT ON COLUMN public.services.rt_reserve_percent IS
  'RT (Comissão Reserva Técnica) em % base-100 (ex.: 3.5 = 3,5%). Dedução gerencial paralela a comissão/lucro, alíquota efetiva congelada na cascata RRO (EPIC-RT v8).';
