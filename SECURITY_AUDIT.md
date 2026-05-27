# SECURITY_AUDIT.md — Precifica Certo

**Data:** 2026-05-27
**Escopo:** Sistema multi-tenant Next.js Pages Router + Supabase, deploy Vercel `app.precificacerto.com`
**Metodologia:** 4 frentes paralelas (Client / API / RLS / Auth) + validação cruzada QA + Architect para plano de performance Onda 1
**Status:** RELATÓRIO — NENHUMA MUDANÇA APLICADA. Aguardando autorização do founder.

---

## Sumário Executivo — Top 10 achados ordenados por severidade

| # | Severidade | Achado | Onde |
|---|-----------|--------|------|
| 1 | 🔴 CRÍTICO | `.env` commitado no Git com chaves de PRODUÇÃO: STRIPE `sk_live_*`, ANTHROPIC `sk-ant-*`, CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY | `.env:23,103,128` (não colar valor) |
| 2 | 🔴 CRÍTICO | Webhook Eduzz aceita `api_key` no BODY (controlado pelo cliente) — qualquer um pode criar super_admin + tenant | `src/pages/api/eduzz/index.ts:6,11-12` |
| 3 | 🔴 CRÍTICO | 3 funções `SECURITY DEFINER` (`cancel_sale_cascade`, `delete_order_cascade`, `delete_budget_cascade`) recebem `p_tenant_id` como parâmetro — usuário pode deletar de qualquer tenant | `supabase/migrations/20260514000001_cascade_delete_pipeline.sql:112-300+` |
| 4 | 🔴 CRÍTICO | Cron endpoints **fail-OPEN** quando `CRON_SECRET` ausente (`if (!secret) return true`) — bypass em dev/staging | `src/lib/cron-helpers.ts:6-17` |
| 5 | 🔴 CRÍTICO | `/api/stripe/create-checkout-session` aceita `tenantId` do client (sem `getCallerContext`) — pode criar checkout para qualquer tenant | `src/pages/api/stripe/create-checkout-session.ts:54,112-115` |
| 6 | 🟠 ALTO | **0/57** rotas API têm validação de schema (Zod/Yup/ajv). Mass assignment generalizado | `src/pages/api/**/*.ts` |
| 7 | 🟠 ALTO | **516 `console.*`** em código de produção expondo emails, tenant IDs, payloads | `src/pages/api/**` |
| 8 | 🟠 ALTO | `promote-super-admin` rate-limit em Map em-memória — burlável em ambiente serverless (cada cold start zera) | `src/pages/api/auth/promote-super-admin.ts:11-28` |
| 9 | 🟠 ALTO | Stripe webhook copia `metadata.revenue_tier` direto do client sem validar contra DB (downgrade fraudulento) | `src/pages/api/stripe/webhook.ts:150-160` |
| 10 | 🟠 ALTO | `signOut()` sem `{ scope: 'global' }` — refresh token persiste em outros devices após logout | `src/contexts/auth.context.tsx:418` |

---

## Parte A — Validação cruzada do plano performance Onda 1

### QA (Quinn) — verdict: ⚠️ NEEDS_REVISION

| Item | Status | Ajuste |
|------|--------|--------|
| `idx_products_tenant_id_pk` | ❌ REMOVER | Conflita com `idx_products_active` existente (migration 20260419) |
| `idx_budgets_tenant_active_created` | ✅ SAFE | Estende `idx_budgets_active` adicionando `created_at DESC` |
| `idx_pricing_calcs_product_tenant` | ⚠️ VALIDAR ORDEM | Já existe `idx_pricing_tenant_product (tenant_id, product_id)`. Avaliar se padrão de query usa `WHERE product_id=?` antes |
| `idx_labor_costs_product_tenant` | ✅ SAFE | Sem índice prévio |
| `idx_sales_tenant_active_created` | ✅ SAFE | Estende `idx_sales_active` |
| `next.config swcMinify` | ⚠️ Next 15.1.6 — JÁ É DEFAULT | Omitir (redundante) |
| `next.config removeConsole exclude error/warn` | ✅ APPROVED | Sem dependência Sentry/test |
| `vercel.json Cache-Control` | ❌ AUSENTE | Adicionar — sem conflito com SWR |

### Architect (Aria) — verdict: ⚠️ NEEDS_REVISION

Padrão atual do codebase usa **índices PARCIAIS** (`WHERE is_active = true`), não compostos full. Recomendação:

- ✅ Manter padrão índices parciais em budgets/sales (`(tenant_id, created_at DESC) WHERE is_active=true`) ao invés de compostos 3-coluna
- ✅ ADR sugerido: "ADR-INDEX-STRATEGY: soft-delete tables usam índices parciais"

**Plano Onda 1 revisado (recomendação consolidada QA + Architect):**

```sql
-- DEVEM SER APLICADOS (3 índices, não 5)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_labor_costs_product_tenant
  ON public.labor_costs(product_id, tenant_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_budgets_tenant_created_partial
  ON public.budgets(tenant_id, created_at DESC) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_tenant_created_partial
  ON public.sales(tenant_id, created_at DESC) WHERE is_active = true;

-- DEVEM SER REVIEWED ANTES
-- idx_pricing_calcs_product_tenant — confirmar padrão de query
-- idx_products_tenant_id_pk — provavelmente redundante
```

---

## Parte B — Achados de Segurança detalhados

### 🔴 CRÍTICO (corrigir HOJE)

#### CRÍT-1. Credenciais de PRODUÇÃO no `.env` commitado

- **Arquivo:** `.env` (raiz do repo) linhas 23, 103, 128
- **Impacto:** STRIPE `sk_live_*` permite cobranças fraudulentas; ANTHROPIC permite drenar quota; SUPABASE_SERVICE_ROLE bypassa TODO o RLS (acesso god-mode); CRON_SECRET permite executar crons admin
- **PoC:** Qualquer pessoa com acesso ao repositório (git clone) extrai e usa
- **Fix:** (1) ROTACIONAR HOJE todas as 4 chaves nos respectivos providers (2) `git filter-repo --path .env --invert-paths` ou BFG para remover do histórico (3) garantir `.env` no `.gitignore` (4) usar Vercel env vars UI (5) auditar logs Stripe/Anthropic últimos 30 dias por uso anômalo
- **Esforço:** 30min rotação + 1h cleanup git history

#### CRÍT-2. Eduzz webhook autentica pelo BODY

- **Arquivo:** `src/pages/api/eduzz/index.ts:6,11-12`
- **Código:** `if (api_key !== process.env.NEXT_PUBLIC_EDUZZ_API_KEY)` onde `api_key` vem de `req.body`
- **Impacto:** Endpoint cria super_admin + tenant. Bypass total
- **PoC:** `POST /api/eduzz` com qualquer `api_key` falso (e adivinhar a real é trivial se NEXT_PUBLIC vazar para o client) → atacante cria conta super_admin
- **Fix:** Validar HMAC-SHA256 signature do header `X-Signature` do Eduzz; remover prefixo `NEXT_PUBLIC_` da env var; usar `crypto.timingSafeEqual`
- **Esforço:** 2h

#### CRÍT-3. Cascade delete functions com `p_tenant_id` client-controllable

- **Arquivo:** `supabase/migrations/20260514000001_cascade_delete_pipeline.sql:112-300+`
- **Funções:** `cancel_sale_cascade(p_sale_id, p_tenant_id)`, `delete_order_cascade(...)`, `delete_budget_cascade(...)`
- **Problema:** Funções `SECURITY DEFINER` validam `WHERE tenant_id = p_tenant_id` mas `p_tenant_id` vem do cliente
- **PoC:** User A (tenant X) chama RPC `cancel_sale_cascade(sale_id_de_Y, tenant_Y)` → deleta venda do tenant Y bypassando RLS
- **Fix:** Adicionar guard `IF p_tenant_id <> public.get_auth_tenant_id() THEN RAISE EXCEPTION 'unauthorized'; END IF;` no início das 3 funções
- **Esforço:** 1h (migration + smoke test)

#### CRÍT-4. Crons fail-open sem CRON_SECRET

- **Arquivo:** `src/lib/cron-helpers.ts:6-17`
- **Código:** `if (!secret) return true` — quando env var não configurada, libera TUDO
- **Impacto:** Em dev/staging/preview deploys sem `CRON_SECRET`, qualquer pessoa executa `/api/cron/expire-trials`, `/api/cron/reconcile-stripe` etc
- **Fix:** Inverter para `if (!secret) return false` (fail-closed)
- **Esforço:** 10min + redeploy

#### CRÍT-5. Stripe checkout aceita `tenantId` do client

- **Arquivo:** `src/pages/api/stripe/create-checkout-session.ts:54,112-115`
- **Impacto:** Atacante cria checkout vinculado a qualquer tenant_id arbitrário; dados de pagamento podem ser associados ao tenant errado
- **Fix:** Derivar `tenant_id` de `getCallerContext(req, res)` ao invés de `req.body.tenantId`
- **Esforço:** 2-3h (refactor do fluxo de upgrade)

---

### 🟠 ALTO (corrigir nesta semana)

#### ALTO-1. Schema validation ausente em 57/57 rotas

- **Impacto:** Type confusion, mass assignment, injection via campos não-previstos
- **Fix:** Implementar Zod nas rotas críticas (stripe/*, super-admin/*, cron/*, eduzz, onboarding/complete). Wrapper genérico `validate(schema, req.body)` que retorne 400 em erro
- **Esforço:** 8h iniciais + 2h por rota crítica

#### ALTO-2. 516 `console.*` expondo dados sensíveis

- **Arquivos críticos:** `stripe/webhook.ts:59` (email), `admin/create-user.ts:59,66,86,96`, `super-admin/send-invite-email.ts:44,53`
- **Impacto:** Se logs forem agregados em Sentry/Datadog/Vercel logs sem redação, vaza emails + tenant IDs
- **Fix:** Logger wrapper condicional + mask de dados sensíveis (`***last4`). `removeConsole` em prod (parte da Onda 1)
- **Esforço:** 2-3h auditoria + wrapper

#### ALTO-3. `promote-super-admin` rate-limit em memória

- **Arquivo:** `src/pages/api/auth/promote-super-admin.ts:11-28`
- **Impacto:** Cold start serverless zera. Múltiplas instâncias paralelas burlam
- **Fix:** Upstash Redis / Vercel KV com `@upstash/ratelimit`
- **Esforço:** 3h

#### ALTO-4. Stripe metadata mass assignment

- **Arquivo:** `src/pages/api/stripe/webhook.ts:150-160`
- **PoC:** Cliente inicializa checkout com `metadata.revenue_tier = 'acima_200k'` mesmo sendo conta pequena → recebe plano diferente
- **Fix:** Backend LOOKUP do tier real em DB ao invés de confiar no metadata
- **Esforço:** 2h

#### ALTO-5. `signOut` sem scope global

- **Arquivo:** `src/contexts/auth.context.tsx:418`
- **Fix:** `await supabase.auth.signOut({ scope: 'global' })`
- **Esforço:** 30min

#### ALTO-6. Onboarding `complete` mass assignment em `tenant_settings`

- **Arquivo:** `src/pages/api/onboarding/complete.ts:52-88`
- **Fix:** Whitelist explícita via Zod
- **Esforço:** 1h

#### ALTO-7. Catálogos públicos com `USING(true)`

- **Tabelas:** `permissions`, `ncm_codes`, `nbs_codes`, `brazilian_states`, `icms_interstate_rates`, `simples_nacional_brackets`, `lucro_presumido_rates`, `lucro_real_params`, `tax_update_logs`, `n8n_sync_config`
- **Fix:** `USING (auth.uid() IS NOT NULL)` em todas (anon não deveria ler)
- **Esforço:** 2h migration

---

### 🟡 MÉDIO (backlog próximo)

| ID | Descrição | Esforço |
|----|-----------|---------|
| MED-1 | Cache SWR/auth profile em `sessionStorage` sem encryption | 1h refactor |
| MED-2 | WUZAPI token em coluna `users.wuzapi_token` (deveria ir pra Supabase Vault) | 1h |
| MED-3 | Credential enumeration em login ("Email not confirmed" vaza existência) | 1h |
| MED-4 | Sem rate-limit em `/api/auth/session` (brute force possível) | 3h Upstash |
| MED-5 | Password reset TTL 1h padrão Supabase + token não single-use | 4-6h tabela tokens_used |
| MED-6 | Session cookie max-age 30 dias (reduzir para 7d) | 2h |
| MED-7 | Erros vazam stack/paths em 47/57 rotas (`console.error(err)` + `res.json(error)`) | 1h sanitização |
| MED-8 | Sem CAPTCHA no signup | 2h hCaptcha |
| MED-9 | Sem audit log de login/logout/operações sensíveis | 4h tabela `audit_log` |
| MED-10 | `productionBrowserSourceMaps` desabilitado ✓ — confirmado OK | — |

---

### 🟢 BAIXO (defense-in-depth)

- ✅ **Já implementado**: Headers de segurança em `next.config.js` (X-Frame-Options DENY, X-Content-Type-Options nosniff, CSP)
- ✅ **Já implementado**: Stripe webhook signature válida com `constructEvent`
- ✅ **Já implementado**: Source maps DESABILITADOS em produção
- ✅ **Já implementado**: `get_auth_tenant_id()` é `STABLE` (cacheado por query)
- ✅ **Já implementado**: 35 tabelas com RLS habilitado (cobertura completa do `public.*`)
- ✅ **Já implementado**: httpOnly cookies em `/api/auth/session`
- ✅ **Já implementado**: Sem CORS aberto (`Access-Control-Allow-Origin: *`)
- 🟢 **Sugestão**: Implementar IP/device fingerprinting para anomaly detection
- 🟢 **Sugestão**: Refresh token rotation explícito (Supabase suporta nativo)

---

## Matriz Impacto × Esforço

```
       Alto Impacto                           Baixo Impacto
       ┌──────────────────────────────┬──────────────────────────────┐
Baixo  │ CRÍT-1 (rotar .env)          │ ALTO-5 (signOut global)      │
Esforço│ CRÍT-4 (cron fail-closed)    │ MED-3 (login enum)           │
       │ CRÍT-3 (cascade tenant guard)│ MED-6 (cookie TTL)           │
       ├──────────────────────────────┼──────────────────────────────┤
Médio  │ CRÍT-2 (Eduzz HMAC)          │ ALTO-7 (USING(true))         │
Esforço│ CRÍT-5 (stripe checkout)     │ MED-1 (sessionStorage)       │
       │ ALTO-4 (stripe metadata)     │ MED-7 (sanitize errors)      │
       ├──────────────────────────────┼──────────────────────────────┤
Alto   │ ALTO-1 (Zod 57 rotas)        │ MED-5 (token single-use)     │
Esforço│ ALTO-2 (logger wrapper)      │ MED-9 (audit log)            │
       │ ALTO-3 (Upstash rate-limit)  │                              │
       └──────────────────────────────┴──────────────────────────────┘
```

---

## Próximos passos (aguardando autorização)

1. **Onda Emergencial** (HOJE, 1-2h):
   - CRÍT-1 rotação `.env` + git cleanup
   - CRÍT-3 guard `p_tenant_id` em 3 cascade functions
   - CRÍT-4 fail-closed em cron-helpers
   - CRÍT-5 getCallerContext em stripe/create-checkout-session

2. **Onda 1 Performance Revisada** (1h):
   - 3 índices SQL (não 5 — ajustado por QA/Architect)
   - `next.config.js` removeConsole + headers
   - `vercel.json` Cache-Control

3. **Sprint 1 — Segurança Alta** (semana, 12-16h):
   - CRÍT-2 Eduzz HMAC
   - ALTO-1 Zod schemas críticos
   - ALTO-2 logger wrapper
   - ALTO-3 Upstash rate-limit

4. **Sprint 2 — Performance Ondas 2-3** (1 semana):
   - Promise.all nas 3 waterfalls maiores
   - Reduzir SELECTs `*`
   - Skeleton UI + dynamic imports

5. **Sprint 3 — Hardening** (1-2 semanas):
   - Demais ALTO (4-7) + MÉDIO (1-10)

**Aguardando autorização do founder antes de propor plano formal de remediação e executar qualquer mudança.**
