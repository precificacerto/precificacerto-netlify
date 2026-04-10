-- ============================================================
-- Migration: Melhorias Abril 2026
-- Epic: MELHORIAS-ABR2026
-- Stories: 004 (WhatsApp dispatch tracking) + 005 (pagamento parcelado)
-- ============================================================

-- ─── STORY 004: WhatsApp Dispatch Tracking ───────────────────

-- Garante que o campo error_message existe na tabela whatsapp_dispatches
ALTER TABLE whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Garante que o campo sent_at existe
ALTER TABLE whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Index para busca rápida por evento de agenda
CREATE INDEX IF NOT EXISTS idx_whatsapp_dispatches_calendar_event
  ON whatsapp_dispatches(calendar_event_id);

-- Index para busca por status (útil para filtrar PENDING, SENT, etc.)
CREATE INDEX IF NOT EXISTS idx_whatsapp_dispatches_status
  ON whatsapp_dispatches(status);


-- ─── STORY 005: Pagamento Parcelado — valor restante pendente ─

-- Campo que marca entradas de caixa oriundas de split payment (restante a receber)
-- Quando is_split_remaining = true e paid_date = null → aparece em amarelo no fluxo de caixa
ALTER TABLE cash_entries
  ADD COLUMN IF NOT EXISTS is_split_remaining BOOLEAN DEFAULT FALSE;

-- Index para busca das entradas pendentes de split
CREATE INDEX IF NOT EXISTS idx_cash_entries_split_remaining
  ON cash_entries(is_split_remaining)
  WHERE is_split_remaining = TRUE;

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
