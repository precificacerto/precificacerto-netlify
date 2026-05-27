# Story Sprint 1 — CRÍT-3 hardening organizacional: helper `assertTenantOwnership` + ADR

**Sprint:** 1
**Prioridade:** MÉDIO (não bloqueia produção; defense-in-depth organizacional)
**Origem:** Auditoria de segurança 2026-05-27 — reclassificação do CRÍT-3
**Status:** TODO (aguardando autorização)

---

## Contexto

Auditoria de segurança identificou as 3 cascade RPCs (`cancel_sale_cascade`, `delete_order_cascade`, `delete_budget_cascade`) como CRÍTICO por receberem `p_tenant_id` controlável pelo cliente. Investigação posterior reclassificou como **MÉDIO**:

1. As 3 functions têm `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role`, logo NÃO podem ser chamadas via PostgREST por cliente autenticado/anônimo.
2. Os 3 call sites (`src/pages/api/delete/sales|orders|budgets.ts`) JÁ derivam `caller.tenant_id` da sessão JWT (via `getCallerContext`) e fazem pré-validação `.eq('tenant_id', caller.tenant_id)` antes de chamar a RPC.
3. Sistema usa **Padrão A** (`supabaseAdmin` com `service_role` puro, sem propagação de JWT do usuário): `auth.uid()` retorna NULL e `get_auth_tenant_id()` retorna NULL — substituir o parâmetro por `get_auth_tenant_id()` quebraria produção (confirmado por análise estática 2026-05-27).

**Defense-in-depth atual** já é completa, mas validação inline em 3 lugares cria risco de **omissão em rotas futuras**. Esta story centraliza a validação.

## Impacto de segurança

- **Sem este fix**: nova rota API que use `supabaseAdmin.rpc()` com `tenant_id` argument pode esquecer de validar `caller.tenant_id` se desenvolvedor for inexperiente. Risco: regressão futura.
- **Com este fix**: helper único `assertTenantOwnership` centraliza validação. Lint rule custom (opcional) pode forçar uso em rotas que invocam essas RPCs.

## Cenário de exploração (hipotético, regressão futura)

Hoje **não exploitable**. Cenário hipotético se hardening não for feito:
1. Dev cria nova rota `/api/delete/recurrence.ts` que chama RPC `delete_recurrence_cascade(p_id, p_tenant_id)` similar às existentes.
2. Por descuido, passa `req.body.tenantId` em vez de `caller.tenant_id`.
3. Atacante autenticado em tenant A envia POST com `{ id: '<id-de-tenant-B>', tenantId: '<tenant-B-id>' }`.
4. Function executa, deleta recursos do tenant B.

## Fix proposto

### 1. Criar helper `src/lib/assert-tenant-ownership.ts`

```ts
import { supabaseAdmin } from '@/supabase/admin'
import type { CallerContext } from './get-caller-tenant'

/**
 * Verifica se um registro pertence ao tenant do caller autenticado.
 * Use SEMPRE antes de invocar RPCs SECURITY DEFINER que recebem tenant_id.
 *
 * Retorna `true` se OK, `false` se não pertence (caller deve retornar 404/403).
 */
export async function assertTenantOwnership(
  table: 'sales' | 'orders' | 'budgets' | 'products' | 'customers' | 'cash_entries',
  id: string,
  caller: Pick<CallerContext, 'tenant_id'>,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('tenant_id', caller.tenant_id)
    .maybeSingle()
  return !!data
}
```

### 2. Refatorar 3 call sites para usar o helper

`src/pages/api/delete/sales.ts:15-22` → substituir SELECT inline por `assertTenantOwnership('sales', id, caller)`.
Idem `orders.ts` e `budgets.ts`.

### 3. Criar ADR `docs/architecture/adr-XXXX-tenant-validation-strategy.md`

Documentar:
- Sistema usa Padrão A (supabaseAdmin pure service_role)
- SECURITY DEFINER functions com `tenant_id` parameter confiam no backend
- Toda nova rota API que use `supabaseAdmin.rpc()` com `tenant_id` argument DEVE chamar `assertTenantOwnership()` ou `getCallerContext()` antes
- Migração para Padrão B (propagar JWT) está fora de escopo (refactor de 57+ rotas)

### 4. (Opcional) Lint rule custom

`@typescript-eslint` custom rule que detecta `supabaseAdmin.rpc(...)` com tenant_id no payload sem prévia chamada de `assertTenantOwnership` ou `getCallerContext`. Backlog futuro.

## Critério de aceite

- [ ] Helper `src/lib/assert-tenant-ownership.ts` criado com 6 tabelas iniciais (sales, orders, budgets, products, customers, cash_entries)
- [ ] 3 call sites em `src/pages/api/delete/*.ts` refatorados para usar o helper
- [ ] ADR criado em `docs/architecture/`
- [ ] Tests unitários do helper (mock supabase, casos: tenant correto / tenant errado / id inexistente)
- [ ] Suite `src/` continua com 463/463 verde
- [ ] Smoke manual: deletar venda/pedido/orçamento do próprio tenant funciona; tentar deletar de outro tenant retorna 404
- [ ] Migration `20260527120000_comment_cascade_functions_crit3.sql` já aplicada em produção (pré-requisito)

## Estimativa

| Item | Tempo |
|------|-------|
| Helper + tipos | 30min |
| Refactor 3 call sites | 30min |
| Tests | 1h |
| ADR | 30min |
| Code review + QA | 30min |
| **Total** | **3h** |

## Teste manual reproduzível

### Setup
1. Criar 2 tenants de teste (`tenant-A`, `tenant-B`) com 1 venda cada (`sale-A`, `sale-B`)
2. Logar como user de `tenant-A`

### Caminho feliz
3. POST `/api/delete/sales` com `{ id: sale-A.id }` → esperado 200 + venda cancelada ✓

### Tentativa de bypass (com helper aplicado)
4. POST `/api/delete/sales` com `{ id: sale-B.id }` → esperado 404 "Venda não encontrada"
5. Confirmar via SQL que `sale-B` permanece `is_active=true` ✓

### Regressão (sem helper, hipotético cenário futuro)
6. Se helper for removido por engano: passo 4 ainda retorna 404 graças à pré-validação inline existente (defense-in-depth intacto)
7. Mas se NOVA rota futura esquecer a validação inline E não usar helper: bypass passa. Helper + lint rule fecham essa lacuna

## Dependências

- ✅ Migration `20260527120000_comment_cascade_functions_crit3.sql` aplicada em produção (commit anterior)
- ⏳ Sprint 1 (Zod schemas, logger wrapper) — pode ser feito em paralelo

## Notas

Helper foi proposto como Opção A no relatório de Onda 2A. Founder optou por aplicar apenas COMMENT ON FUNCTION (item A.3) na sequência imediata e mover A.1/A.2 (helper + ADR) para Sprint 1 — razão: defense-in-depth já existe nas 3 rotas hoje, refactor é organizacional, sem ganho de segurança imediato.

Ver também: `SECURITY_AUDIT.md` (raiz do repo) seção "CRÍT-3".
