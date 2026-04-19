-- Epic MELHORIAS-22-ABR2026 T4
-- Adicionar coluna de observações às tabelas de comissão.
-- Motivo: UI substitui o campo "Comissão do Vendedor (%)" por "Observações".
-- O campo commission_percent é mantido para compatibilidade mas deixa de ser obrigatório no front.

ALTER TABLE public.commission_tables
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

COMMENT ON COLUMN public.commission_tables.notes
  IS 'Observações livres sobre a tabela de comissão (usado no modal Criar Tabela).';
