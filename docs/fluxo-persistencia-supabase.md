# Confirmação: persistência no Supabase

Este documento confirma **onde** cada informação do fluxo (cadastro pago → criar senha → onboarding) é salva no Supabase.

---

## 1. Checkout Stripe concluído (webhook + confirm-checkout-session)

| Onde | Tabela / Recurso | O que é salvo |
|------|-------------------|----------------|
| **Supabase Auth** | `auth.users` | Usuário criado por `inviteUserByEmail` (ou fallback `createUser`): email, senha (hash), `user_metadata` (tenant_id, role, name). |
| **RPC** | `create_tenant_from_stripe` | Cria **tenant** e registros iniciais. |
| **public.tenants** | `tenants` | `name`, `email`, `plan_status` (TRIAL/ACTIVE), `approved_by_super_admin`, `stripe_customer_id`, `stripe_subscription_id`, `revenue_tier`, `plan_slug`, `plan_ends_at`, `trial_ends_at`. |
| **public.tenant_settings** | `tenant_settings` | Uma linha por tenant (configurações vazias iniciais). |
| **public.tenant_expense_config** | `tenant_expense_config` | Uma linha por tenant (despesas vazias iniciais). |
| **Trigger** | `handle_new_auth_user` (ao criar usuário no Auth) | Preenche **public.users** e **public.tenant_owners** quando o usuário tem `from_admin_invite` e `role` admin. |
| **public.users** | `users` | `id` (auth), `tenant_id`, `email`, `name`, `role` ('admin'), `is_super_admin` (false). |
| **public.tenant_owners** | `tenant_owners` | `tenant_id`, `user_id` (vínculo admin ↔ tenant). |
| **Fallback (se invite falhar)** | Código no webhook | Se `inviteUserByEmail` falhar: `createUser` no Auth + insert em `users` + upsert em `tenant_owners`. |
| **Pagamento registrado** | `tenant_billing` | Inserção ao processar `invoice.paid` (subscription_id, amount, etc.). |

Resumo: **tenant**, **tenant_settings**, **tenant_expense_config**, **auth.users**, **public.users** e **tenant_owners** são preenchidos no Supabase nessa etapa.

---

## 2. E-mail de convite (link definir senha)

- O **link** é gerado pelo Supabase Auth (convite); o domínio depende da **Site URL** no projeto (ex.: `https://precificav2.netlify.app/criar-senha`).
- Nenhuma tabela adicional é escrita no clique do link; o Auth valida o token e inicia a sessão.

---

## 3. Página “Criar senha” (`/criar-senha`)

| Onde | O que é salvo |
|------|-------------------------------|
| **Supabase Auth** | `auth.users`: senha atualizada via `updateUser({ password })`. |
| **public.users** | Não alterado nesta etapa (já foi criado no passo 1). |

O redirecionamento após sucesso (onboarding vs assinar) é apenas lógica de rota no front; não grava nada novo no Supabase.

---

## 4. Onboarding (`/onboarding` → API `POST /api/onboarding/complete`)

| Onde | Tabela | O que é salvo |
|------|--------|----------------|
| **public.tenants** | `tenants` | `name`, `cnpj_cpf`, `segment`, `email`, `phone`, `cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `state_code` (dados da empresa). |
| **public.tenant_settings** | `tenant_settings` | `tax_regime`, `calc_type`, `state_code`, `cnae_code`, `simples_anexo`, `simples_revenue_12m`, `workload_unit`, `monthly_workload`, `num_productive_employees`, `num_commercial_employees`, `num_administrative_employees`, `administrative_monthly_workload`, `icms_contribuinte`, `inscricao_estadual`, `ie_state_code`, `sales_scope`, `buyer_type`. |

O critério **onboarding concluído** no app é `tenant.cnpj_cpf` e `tenant.segment` preenchidos (usado no Auth context e nas rotas).

---

## 5. Uso do sistema (despesas, fluxo de caixa, etc.)

- **tenant_expense_config**, **tenant_settings**, **cash_entries**, **fixed_expenses**, e demais tabelas de negócio são atualizadas pelas respectivas APIs e telas; todas no **Supabase (public)** e, quando aplicável, em **Auth**.

---

## Resumo: está tudo sendo salvo no Supabase?

| Etapa | Salvo no Supabase? | Tabelas / Auth |
|-------|---------------------|----------------|
| Checkout pago (tenant + admin) | Sim | `tenants`, `tenant_settings`, `tenant_expense_config`, `auth.users`, `users`, `tenant_owners` (+ `tenant_billing` em invoice.paid) |
| E-mail definir senha | Link gerado pelo Auth; sessão no Auth | Auth |
| Criar senha | Sim | Auth (senha em `auth.users`) |
| Onboarding | Sim | `tenants`, `tenant_settings` |
| Despesas e uso do sistema | Sim | Diversas tabelas public (e Auth quando for login/sessão) |

**Conclusão:** Todas as informações desse fluxo (tenant, admin, senha, onboarding e uso do sistema) são persistidas no Supabase — tanto em **Auth** quanto nas tabelas **public** listadas acima.
