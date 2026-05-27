# Story Sprint 1 — CRÍT-5.1: Stripe metadata mass assignment (`revenueTier` client-controlled)

**Sprint:** 1
**Prioridade:** PRIORITÁRIO (ALTO real — fraude de receita ativa)
**Origem:** Identificado durante Onda 2C (CRÍT-5). Bug separado do tenantId — não deve ser misturado no patch CRÍT-5.
**Status:** TODO (aguardando início Sprint 1)

---

## Contexto

Os endpoints `src/pages/api/stripe/create-checkout-session.ts` e `src/pages/api/stripe/create-upgrade-session.ts` aceitam `revenueTier` no body do request:

```ts
const { name, email, revenueTier, planSlug, tenantId } = req.body as {
  revenueTier?: RevenueTier  // 'ate_200k' | 'acima_200k'
  ...
}
```

O `revenueTier` é então usado para:
1. **Resolver `priceId`** via `getPriceId(revenueTier, planSlug)` — define quanto o Stripe vai cobrar
2. **Salvar em `metadata[revenue_tier]`** — vira `tenants.revenue_tier` via webhook (`webhook.ts:154`)

O frontend (`cadastro.tsx`, `assinar.tsx`, `planos.tsx`) calcula `revenueTier` a partir de inputs do usuário (declaração de faturamento anual). Mas o backend **NÃO valida** se o tier declarado corresponde ao tamanho real do tenant ou ao histórico de receita registrado.

## Impacto de segurança — FRAUDE DE RECEITA

**Severidade real: ALTO**

Tier `ate_200k` (R$ 99,90–349,90) vs `acima_200k` (R$ 299,90–549,90). Diferença de **até R$ 200/mês** por plano.

### Cenário exploração (passo a passo)

1. Tenant existente factura R$ 5M/ano (deveria estar em `acima_200k`)
2. Atacante (admin do tenant) ou novo cadastro mal-intencionado:
   - Abre `/planos` ou `/cadastro`
   - DevTools → modifica request body antes do fetch
   - Envia `revenueTier: 'ate_200k'` em vez do real
3. Backend resolve `priceId` pelo combo informado → Stripe cobra preço de `ate_200k`
4. Webhook salva `metadata.revenue_tier = 'ate_200k'` em `tenants.revenue_tier`
5. **Fraude**: tenant paga R$ 99,90 em vez de R$ 299,90 (66% de desconto não-autorizado)

Repetível em todos os 4 planos. Acumulável mensalmente. Impacto: **receita perdida proporcional à base de clientes que descobrir o bug**.

## Fix proposto

### Estratégia: validar `revenueTier` server-side baseado em fonte de verdade

#### Para `create-upgrade-session.ts` (tenant existente)

```ts
// Após getCallerContext (já implementado em CRÍT-5):
const { data: tenant } = await supabaseAdmin
  .from('tenants')
  .select('id, revenue_tier, simples_revenue_12m, lp_estimated_annual_revenue, ret_estimated_monthly_revenue')
  .eq('id', caller.tenant_id)
  .single()

// Forçar revenueTier do banco, NUNCA do body
const revenueTier = (tenant as any).revenue_tier as RevenueTier
if (!revenueTier) {
  return res.status(400).json({
    error: 'Tier de faturamento não configurado. Acesse Configurações → Faturamento.'
  })
}
```

#### Para `create-checkout-session.ts` (cadastro novo + upgrade)

**Caso A (cadastro novo, sem tenantId):**
- Valida `revenueTier` do body como declaração inicial (não há tenant ainda)
- Adicionar verificação cruzada com email/CNPJ se possível (out of scope)
- Backend continua confiando, mas adiciona log de auditoria com timestamp + IP

**Caso B (upgrade, com tenantId):**
- Após validar `caller.tenant_id === tenantId` (já implementado), buscar `tenants.revenue_tier`
- Forçar usar valor do banco, ignorar body

### Tabela de fonte de verdade

| Cenário | Fonte do `revenueTier` |
|---------|------------------------|
| Cadastro novo | Body (declaração inicial; audit log) |
| Upgrade via `/planos` ou `/assinar` | `tenants.revenue_tier` (banco) |
| Mudança de tier (passou de 200k) | Endpoint dedicado novo `/api/billing/change-tier` com aprovação manual + recibo |

## Critério de aceite

- [ ] `create-upgrade-session.ts` busca `tenants.revenue_tier` e ignora body
- [ ] `create-checkout-session.ts` (fluxo B) busca tenant.revenue_tier
- [ ] `create-checkout-session.ts` (fluxo A) adiciona audit log de declaração inicial
- [ ] Testes unitários: tentar passar `revenueTier` divergente do banco → ignorado, log warn
- [ ] Smoke manual: criar tenant `acima_200k` no banco; tentar upgrade enviando `revenueTier: 'ate_200k'` no body → preço cobrado é `acima_200k`
- [ ] ADR documenta política: "revenueTier do body é declaração inicial em cadastro; em upgrades, sempre derivado do banco"

## Estimativa

| Item | Tempo |
|------|-------|
| Fix upgrade-session (ignorar body, ler tenant) | 1h |
| Fix checkout-session fluxo B (idem) | 1h |
| Audit log cadastro novo | 30min |
| Tests unitários (3 cenários) | 1h |
| Smoke test manual + ADR | 1h |
| **Total** | **4–5h** |

## Teste manual reproduzível

### Setup
1. Criar tenant teste no banco: `INSERT INTO tenants (name, revenue_tier) VALUES ('Tenant teste', 'acima_200k')`
2. Logar como user desse tenant

### Tentativa de bypass (com fix aplicado)
3. DevTools → abrir `/planos` → clicar em upgrade → modificar body do fetch:
   ```json
   {"newPlanSlug": "pro", "tenantId": "<seu>", "revenueTier": "ate_200k"}
   ```
4. Confirmar via Stripe Dashboard que o `priceId` cobrado é de `acima_200k` (R$ 499,90), **não** `ate_200k` (R$ 299,90)

### Audit log
5. Verificar console Vercel logs por entrada `[CRÍT-5.1] revenueTier divergente` com `body_tier`, `db_tier`, `caller_user`

## Dependências

- ✅ CRÍT-5 commits aplicados (auth + tenantId derivado da sessão)
- ⏳ Schema `tenants.revenue_tier` confirmado e populado em todos os tenants ativos (validar antes do fix)

## Notas

Separado intencionalmente do patch CRÍT-5 para manter commits cirúrgicos. CRÍT-5 fecha o vetor de cross-tenant takeover (mais grave); CRÍT-5.1 fecha o vetor de fraude tarifária (mais frequente, menos crítico mas com impacto financeiro recorrente).

Ver também: `SECURITY_AUDIT.md` seção "ALTO-4" (Stripe webhook metadata mass assignment).
