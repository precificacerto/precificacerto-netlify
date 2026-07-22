-- FEAT-CONTRACT-EMAIL (22/07/2026)
-- Guarda de idempotência para o envio do Contrato de Licença de Uso ao cliente.
-- O contrato é enviado por e-mail no PRIMEIRO pagamento confirmado (invoice.paid).
-- Esta coluna garante que nunca seja reenviado em renovações mensais subsequentes.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS contract_sent_at timestamptz;

COMMENT ON COLUMN public.tenants.contract_sent_at IS
  'Momento em que o Contrato de Licença de Uso foi enviado por e-mail ao cliente (1º pagamento). NULL = ainda não enviado.';
