-- =============================================================================
-- Colunas novas em tenants para o fluxo de cadastro/trial (Escopo: fluxo de
-- entrada do novo usuário, 13/08/2026)
-- =============================================================================
-- ÚNICA etapa sem volta fácil deste bloco de 3 migrations. Exige backup manual
-- do banco antes de aplicar em produção (Supabase → Database → Backups).
-- Deve rodar ANTES do deploy do código novo: se o código subir primeiro, ele
-- procura colunas que ainda não existem e quebra para todos os tenants.
--
-- Depende de:
--   20260813000001_create_leads_table.sql        (lead_id referencia leads.id)
--   20260813000002_add_pending_payment_to_plan_status.sql (aplicada e commitada
--                                                    antes de qualquer código
--                                                    gravar 'PENDING_PAYMENT')
--
-- Mapeamento do restante dos campos pedidos no escopo (para referência — não
-- exigem alteração de schema, já existem em tenants):
--   status_assinatura   -> plan_status        (extensão de enum, migration 2)
--   plano_escolhido     -> plan_slug          (já existe)
--   fim_trial           -> trial_ends_at      (já existe)
--   stripe_customer_id  -> stripe_customer_id (já existe)
--   stripe_subscription_id -> stripe_subscription_id (já existe)
--   whatsapp            -> NÃO entra aqui. Fica só em leads.whatsapp (decisão:
--                          manter separado, não reaproveita tenants.phone).
--                          Para achar o WhatsApp de um tenant, junta por
--                          tenants.lead_id -> leads.whatsapp.
--
-- Gap de schema anotado na versão anterior deste arquivo: stripe_customer_id,
-- stripe_subscription_id, revenue_tier e plan_slug são usados no código mas não
-- têm ALTER TABLE correspondente em nenhuma migration rastreada no histórico —
-- foram criados fora do versionamento (dashboard do Supabase). CONFIRMADO via
-- information_schema.columns em 13/08/2026: as 4 colunas são text, nullable
-- (is_nullable = YES), sem default. Bate com o que esta migration assume —
-- nenhum ajuste necessário no ALTER TABLE/CREATE INDEX abaixo.

alter table public.tenants
  add column if not exists qtd_usuarios integer default 1,
  add column if not exists lead_id uuid references public.leads(id);

comment on column public.tenants.qtd_usuarios is
  'Quantidade de usuários selecionada na Etapa 2 do cadastro — define qual price_id do Stripe é usado (faixa) e o limite de seats dentro do sistema. Não confundir com quantity da Checkout Session, que é sempre 1.';

comment on column public.tenants.lead_id is
  'Vínculo com a linha correspondente em leads (contato comercial que originou este tenant). NULL para tenants criados antes desta migration.';

-- Índices ausentes hoje apesar de consultas frequentes por essas colunas no
-- webhook do Stripe (handleCheckoutCompleted, handleInvoicePaid,
-- handleInvoicePaymentFailed, handleSubscriptionDeleted fazem .eq(...) em
-- todas elas). Não pedidos explicitamente no escopo para tenants, mas a tabela
-- já está sendo alterada nesta migration.
create index if not exists idx_tenants_stripe_customer on public.tenants (stripe_customer_id);
create index if not exists idx_tenants_stripe_subscription on public.tenants (stripe_subscription_id);
create index if not exists idx_tenants_plan_status on public.tenants (plan_status);
create index if not exists idx_tenants_lead_id on public.tenants (lead_id);
