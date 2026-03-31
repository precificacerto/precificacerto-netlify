-- Migration: employees.commission_payment_mode
-- Controla como a comissão do funcionário é paga:
--   FULL        = valor cheio no mês da venda (independente do parcelamento do cliente)
--   INSTALLMENT = distribuído conforme as parcelas do cliente

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS commission_payment_mode TEXT
    NOT NULL DEFAULT 'FULL'
    CHECK (commission_payment_mode IN ('FULL', 'INSTALLMENT'));

COMMENT ON COLUMN employees.commission_payment_mode IS
  'FULL = comissão paga integralmente no mês da venda; INSTALLMENT = comissão paga conforme parcelamento do cliente';
