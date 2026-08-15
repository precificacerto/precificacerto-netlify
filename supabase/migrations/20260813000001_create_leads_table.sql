-- =============================================================================
-- Tabela leads — funil de cadastro / remarketing (Escopo: fluxo de entrada do
-- novo usuário, 13/08/2026)
-- =============================================================================
-- Puramente aditiva: não altera nenhuma tabela existente, não oferece risco a
-- tenant/cliente ativo. Deve rodar ANTES de
-- 20260813000003_add_signup_fields_to_tenants.sql, que referencia leads(id)
-- via tenants.lead_id.
--
-- Papel: leads guarda CONTATO COMERCIAL (quem entrou no funil, veio de onde,
-- converteu ou não). tenants guarda ESTADO DE CONTA/ASSINATURA. São camadas
-- diferentes do mesmo cadastro — ver tenants.lead_id na migration 3.
--
-- Diferente do desenho original do escopo (onde o back-reference usuario_id só
-- era preenchido depois, pelo webhook): aqui tenant_id já é gravado na Etapa 1,
-- porque o tenant é criado ANTES do redirecionamento ao Stripe (é o que permite
-- o usuário fechar o navegador na tela do cartão e, ao logar de novo, cair
-- direto em /assinar em vez de refazer o cadastro). O webhook só atualiza
-- status_lead/efetivado_em quando o checkout é concluído.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  whatsapp text not null,
  empresa text,
  origem_lead text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  consentimento_em timestamptz,
  consentimento_versao text,
  tenant_id uuid references public.tenants(id),
  status_lead text not null default 'cadastrado',
  efetivado_em timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_leads_status on public.leads (status_lead);
create index if not exists idx_leads_email on public.leads (email);
create index if not exists idx_leads_tenant_id on public.leads (tenant_id);

comment on table public.leads is
  'Contato comercial do funil de cadastro (nome, e-mail, whatsapp, UTMs, consentimento LGPD). Separada de tenants (conta/assinatura) e users (pessoa/login). Nunca grava senha.';

comment on column public.leads.whatsapp is
  'Campo próprio desta tabela — não reaproveita tenants.phone. Somente dígitos, com prefixo do país: 55 + DDD + número (11 dígitos após o 55). Ex.: 5551999999999. Nunca gravar com parênteses, espaço ou traço — máscara é aplicada só na exibição.';

comment on column public.leads.tenant_id is
  'Vínculo com a conta criada na Etapa 1 (status inicial PENDING_PAYMENT em tenants.plan_status). Preenchido no mesmo INSERT — não é mais um back-fill do webhook.';

comment on column public.leads.status_lead is
  'cadastrado (Etapa 1) | efetivado (webhook checkout.session.completed) | perdido (operação — descadastro ou contato inválido; NÃO apaga a linha, mantém histórico e atende LGPD).';

comment on column public.leads.consentimento_versao is
  'Versão do texto de consentimento aceito (ex.: v1-2026-08). Necessário para saber com qual texto cada pessoa concordou, caso o texto mude depois.';

-- RLS habilitado, sem policy própria nesta migration: por padrão isso bloqueia
-- totalmente acesso via anon/authenticated (client-side). Toda leitura/escrita
-- hoje é server-side (service role, que ignora RLS) — API de cadastro, webhook
-- do Stripe, e futura consulta de remarketing/diagnóstico de mídia.
-- Se algum dia for necessário acesso client-side (ex.: painel de marketing
-- autenticado), isso entra como policy própria, decidida à parte.
alter table public.leads enable row level security;
