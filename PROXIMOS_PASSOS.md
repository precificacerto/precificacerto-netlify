# Próximos passos — Fluxo de entrada do novo usuário (cadastro, trial 7 dias, Stripe)

**Origem:** `escopo-cadastro-trial-precifica-certo_4.pdf` (raiz do projeto), documento de 13/08/2026.
**Status:** Fase de mapeamento e desenho de schema concluída. Nenhum código de aplicação foi alterado. Nenhuma migration foi aplicada no banco. Nada foi commitado.
**Retomar a partir daqui.**

---

## 1. O que já foi mapeado (estado do código antes de qualquer mudança)

### 1.1 Integração Stripe
- Checkout Session: `src/pages/api/stripe/create-checkout-session.ts` — funcional, via API REST direta (sem SDK), `mode: subscription`, trial configurável (`STRIPE_TRIAL_DAYS`, default 7).
- Webhook: `src/pages/api/stripe/webhook.ts` — **não** é `/api/webhooks/stripe` (nome do escopo), é `/api/stripe/webhook`. Assinatura verificada via `constructEvent`. Trata 6 eventos (mais que o escopo pede): `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `checkout.session.expired`, `payment_intent.payment_failed`.
- Idempotência: parcial. `checkout.session.completed` tem dedupe por `stripe_subscription_id`; `insertBillingRecord` (INSERT) não tem guarda por `invoice.id` — reenvio do Stripe pode duplicar registro de billing.
- Endpoint extra (fora do escopo original): `confirm-checkout-session.ts` — reforça o webhook a partir da página de sucesso.
- Crons já existentes: `cron/expire-trials.ts`, `cron/reconcile-stripe.ts`.
- Segmentação de preço hoje é por **faturamento** (`ate_200k`/`acima_200k`) × 4 planos = 8 `price_id`. Escopo quer só **faixa de usuários** (4 `price_id`).

### 1.2 Schema — não existe tabela `usuarios`
Arquitetura real é multi-tenant:
- **`tenants`** — a conta/empresa, dona do plano e da assinatura Stripe.
- **`public.users`** — pessoas, 1:1 com `auth.users`, vinculadas a um tenant via `tenant_id`. Sem dado de assinatura próprio.
- `tenants.plan_status` (enum `TRIAL/ACTIVE/SUSPENDED/CANCELLED`) já é, na prática, o `status_assinatura` do escopo.
- **Decisão confirmada nesta sessão:** os campos de assinatura entram em `tenants`, não numa tabela `usuarios` nova.

### 1.3 Login/sessão e roteamento pós-login
- `src/pages/login.tsx` decide destino via `getDefaultRouteForUser()` (`src/lib/default-route-by-role.ts`) — só diferencia super_admin / prestador de serviço / demais. **Não olha status de assinatura.**
- O roteamento por status de assinatura já existe, mas em **`src/pages/_app.tsx`** (guard client-side a cada navegação), não em `middleware.ts`:
  - tenant `SUSPENDED`/`CANCELLED` ou usuário inativo → `/acesso-bloqueado?reason=...`
  - tenant sem plano ativo e não free → força `/assinar`/`/planos`
- `src/middleware.ts` (Edge Middleware real) hoje só faz detecção de device (mobile/tablet/desktop) — nenhuma lógica de auth ali.
- 4 dos 5 casos do switch do escopo já têm equivalente funcional. Falta o caso `aguardando_pagamento` → `/assinar`, que não existe porque hoje não há conta gravada antes do pagamento.

### 1.4 Telas de cadastro e assinatura
| Tela | Existe? | Observação |
|---|---|---|
| `/cadastro` | ✅ | 3 passos: faturamento → plano → nome/email/telefone → Checkout direto. Sem senha, sem gravação prévia no Supabase |
| `/assinar` | ✅ | Mesma UI para tenant autenticado sem plano ativo |
| `/planos` | ✅ | Pós-login, upgrade — fora do escopo desta fase |
| `/cadastro/sucesso` | ✅ | GTM `GTM-5V9FH3Q8` (mesmo ID do escopo), fallback do webhook |
| `/acesso-bloqueado` | ✅ | Cobre `payment_overdue`/`owner_block`/`user_inactive` — falta caso "nunca pagou" |
| Etapa 1 (credenciais + whatsapp + consentimento LGPD) | ❌ | Não existe |
| Etapa 2 (contador de usuários → plano derivado) | ❌ | Não existe |
| E-mails dia 5/6 | ❌ | Não existe |
| Fila de remarketing / diagnóstico por UTM | ❌ | Não existe (dependia da tabela `leads`, que agora existe como migration — ver seção 2) |

### 1.5 Credenciais/chaves commitadas
- Hoje: nenhuma chave real no repo. Só `.env.example` (valores vazios) está versionado. Sem ocorrência de `sk_live_`/`sk_test_`/`whsec_`/`pk_live_` no código nem no histórico do git atual.
- `SECURITY_AUDIT.md` (commit de 27/05/2026) documenta que **naquela época** havia um `.env` real commitado com chaves de produção (Stripe, Anthropic, Supabase service role, cron secret). Hoje não há vestígio no histórico — provavelmente limpo via filter-repo/BFG.
- **Pendente de confirmação com o usuário:** se as 4 chaves daquele achado foram de fato **rotacionadas** nos respectivos provedores. Limpar o histórico do git não invalida a chave — clones antigos do repo ainda podem tê-las.

---

## 2. Arquivos criados nesta sessão (untracked, não aplicados, não commitados)

Todos em `supabase/migrations/`, ordem de aplicação obrigatória:

1. **`20260813000001_create_leads_table.sql`**
   Cria a tabela `leads` (contato comercial do funil — nome, email, whatsapp, empresa, UTMs, consentimento LGPD). `whatsapp` é campo próprio desta tabela (decisão confirmada: **não** reaproveita `tenants.phone`), formato `55` + 11 dígitos, só dígitos. `tenant_id` referencia `tenants(id)`, preenchido já na Etapa 1 (diferente do desenho do PDF original, que só preenchia via webhook). RLS ligado, sem policy — só service role acessa. Aditiva, não toca em nada existente.

2. **`20260813000002_add_pending_payment_to_plan_status.sql`**
   Adiciona o valor `PENDING_PAYMENT` ao enum `plan_status`. Isolada em arquivo próprio (limitação do Postgres: novo valor de enum não pode ser referenciado na mesma transação em que foi criado). Os outros 4 estados do escopo já mapeiam 1:1 para os valores existentes (`TRIAL`=trialing, `ACTIVE`=ativo, `SUSPENDED`=bloqueado, `CANCELLED`=cancelado) — não precisou de mais nenhum valor novo.

3. **`20260813000003_add_signup_fields_to_tenants.sql`**
   Adiciona `qtd_usuarios` (integer, default 1) e `lead_id` (uuid, FK → `leads.id`) em `tenants`. Cria índices em `stripe_customer_id`, `stripe_subscription_id`, `plan_status` e `lead_id` (ausentes hoje apesar de consultados o tempo todo no webhook). **Confirmado via `information_schema.columns`** (13/08/2026): `stripe_customer_id`, `stripe_subscription_id`, `plan_slug` e `revenue_tier` já existem como `text`, nullable, sem default — bate com o que a migration assume, nenhum ajuste necessário.

### Mapeamento completo campo a campo (escopo → destino real)

| Campo do escopo (`usuarios`) | Destino real | Situação |
|---|---|---|
| `status_assinatura` | `tenants.plan_status` | Já existe + 1 valor novo no enum (migration 2) |
| `plano_escolhido` | `tenants.plan_slug` | Já existe, reaproveita |
| `stripe_customer_id` | `tenants.stripe_customer_id` | Já existe, reaproveita |
| `stripe_subscription_id` | `tenants.stripe_subscription_id` | Já existe, reaproveita |
| `fim_trial` | `tenants.trial_ends_at` | Já existe, reaproveita |
| `qtd_usuarios` | `tenants.qtd_usuarios` | Nova coluna (migration 3) |
| `lead_id` | `tenants.lead_id` | Nova coluna, FK → `leads.id` (migration 3) |
| `whatsapp` | `leads.whatsapp` | Nova coluna, **campo próprio**, não vai para `tenants` |

`revenue_tier` continua existindo em `tenants` (histórico), mas o fluxo novo por quantidade de usuários simplesmente para de preenchê-la — isso é comportamento de aplicação, não schema.

---

## 3. O que falta construir (nenhuma linha de código de aplicação escrita ainda)

Em ordem aproximada de dependência:

1. **Rodar as 3 migrations em produção** (com backup manual do Supabase antes — `Database → Backups`). Ordem: 001 → 002 → 003.
2. **Rota de webhook**: decidir se cria `/api/webhooks/stripe` novo (como o PDF pede) ou mantém `/api/stripe/webhook` e ajusta a documentação/escopo. Recomendação implícita do mapeamento: manter a rota atual, que já é funcional e testada.
3. **Etapa 1 — tela de cadastro de credenciais**: nome, email, whatsapp (com máscara `(00) 00000-0000` na exibição e validação de 11 dígitos + 9º dígito = 9), empresa, senha, checkbox de consentimento LGPD desmarcado por padrão. Ao submeter, na mesma transação:
   - cria `tenants` com `plan_status = 'PENDING_PAYMENT'`
   - cria `auth.users` com senha (via `supabaseAdmin.auth.admin.createUser`, não mais via convite por e-mail — mudança de comportamento em relação ao fluxo atual)
   - cria `leads` (upsert por email) com `tenant_id` apontando para o tenant recém-criado
   - grava `tenants.lead_id` apontando de volta para o lead
   - abre sessão e redireciona para Etapa 2
4. **Etapa 2 — tela de quantidade de usuários**: contador +/- (1 a 30), plano derivado automaticamente (não é mais escolha por faturamento), botão "Começar grátis agora" cria Checkout Session com `client_reference_id = tenant.id`.
5. **Ajustar `create-checkout-session.ts`**: trocar a lógica de `revenueTier` por faixa de `qtd_usuarios`; `success_url`/`cancel_url` conforme o novo fluxo.
6. **Atualizar o webhook** (`checkout.session.completed`): em vez de criar o tenant do zero (fluxo atual), passa a apenas **atualizar** o tenant já criado na Etapa 1 — `plan_status = 'TRIAL'`, grava `qtd_usuarios`, `plano_escolhido`, `fim_trial`; e atualiza `leads.status_lead = 'efetivado'` + `efetivado_em`.
7. **Middleware/roteamento**: adicionar o caso `PENDING_PAYMENT → /assinar` no guard existente (`_app.tsx` e/ou migrar essa lógica para `middleware.ts`, a decidir).
8. **E-mails de aviso** (dia 0, dia 5, dia 6) — não existe nenhuma peça disso hoje.
9. **Landing page (repo `precificacerto/sweet-pitch-creator`, deploy Vercel, serve `precificacerto.com` — fora deste repo; Hostinger só responde pelo DNS)**: CTA apontando para Etapa 1, captura de UTMs, cookie `.precificacerto.com`, evento `InitiateCheckout`.
10. **Fila de remarketing / diagnóstico de mídia**: queries sobre `leads` (já modeladas no PDF, seções 11), nenhuma tela ou automação construída ainda.
11. **Confirmar rotação das chaves** do achado histórico do `SECURITY_AUDIT.md` (Stripe, Anthropic, Supabase service role, cron secret) — bloqueio de segurança, independente do resto.

---

## 4. Ordem de execução recomendada ao retomar

1. Confirmar rotação de chaves (item 11 acima) — não depende de nada, pode ser feito em paralelo a qualquer momento.
2. Revisar o diff das 3 migrations uma última vez.
3. Backup manual do Supabase.
4. Aplicar migration 001 (`leads`) em produção.
5. Aplicar migration 002 (enum `PENDING_PAYMENT`) em produção — commitada antes de qualquer código usar o valor novo.
6. Aplicar migration 003 (`tenants.qtd_usuarios`, `tenants.lead_id`, índices) em produção.
7. Só então: desenvolver e testar em branch (Vercel Preview) os itens 2–7 da seção 3 (webhook, Etapa 1, Etapa 2, checkout, middleware) — **nunca commit direto na main**.
8. Stripe em modo teste (`sk_test_`/cartão `4242 4242 4242 4242`) para validar o ciclo completo, incluindo avanço do relógio da assinatura até o 8º dia.
9. E-mails de aviso (item 8) e landing page (item 9) — podem entrar em paralelo, não bloqueiam o núcleo do fluxo.
10. Fila de remarketing (item 10) — último, depende de volume real de dados em `leads`.

---

*Documento gerado a partir da sessão de mapeamento de 13/08/2026. Atualizar conforme o trabalho avançar.*
