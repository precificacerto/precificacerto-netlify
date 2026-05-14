-- =====================================================================
-- Hotfix: adicionar 'CANCELLED' ao enum budget_status
-- Created: 2026-05-14
--
-- A migration 20260514000001 (cascade delete) usa status='CANCELLED' em
-- budgets, mas o enum original (20260212000000) só tem
-- DRAFT, SENT, APPROVED, EXPIRED, REJECTED, PAID.
-- O frontend já trata CANCELLED como bloqueador em
-- budgetBlockedStatuses (pedidos/index.tsx), então o valor é esperado.
-- =====================================================================

ALTER TYPE public.budget_status ADD VALUE IF NOT EXISTS 'CANCELLED';
