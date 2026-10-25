-- HARNESS da coluna escolhas (migração 20261025000001) — a tabela COMO ESTÁ EM PRODUÇÃO. NÃO TOCA PRODUÇÃO.
-- A migração que criou orcamentista_pre_definicao (20261020000003_atendimentos_ia_conversa) está no
-- histórico do banco e NÃO está no repositório (`migration-delivery.md`). Por isso a tabela é escrita
-- aqui com as colunas medidas em produção em 25/10/2026 (information_schema), sem as FKs: a migração
-- não as toca. Uma linha COMPLETA, como a única que existe hoje.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.orcamentista_pre_definicao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversa_id uuid NOT NULL UNIQUE,
  tipologia text, largura_mm numeric, altura_mm numeric, quantidade numeric,
  cor_perfil text, vidro text, local text, tipo_edificacao text, distribuicao_por_pavimento jsonb,
  estado text, criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz
);
INSERT INTO public.orcamentista_pre_definicao (id, tenant_id, conversa_id, tipologia, largura_mm, altura_mm, quantidade, estado)
VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Janela de correr', 1500, 1200, 4, 'COMPLETA');
