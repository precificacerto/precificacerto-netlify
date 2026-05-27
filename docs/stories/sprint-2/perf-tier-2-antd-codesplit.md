# Sprint 2 — Tier 2 perf: Antd component code-split

**Sprint:** 2
**Prioridade:** BAIXA (revisitar **só se** Lighthouse Performance cair <85 nas páginas críticas)
**Origem:** Onda 3 / Tier 2 do plano original do performance audit (2026-05-27).
**Status:** BACKLOG (não-bloqueante)

---

## Contexto

Após Onda 3 Tier 1 (dynamic imports ExcelJS/jsPDF), Lighthouse atingiu:
- `/orcamentos`: 88 → **95** (+7)
- `/fluxo-de-caixa`: **96**

Bundle First Load JS reduziu 18-48% nas páginas alvo. Tier 2 (Antd code-split via `dynamic(() => import(...))` de Drawers, Modals, Forms grandes) **NÃO justifica esforço atual** porque o ganho marginal seria pequeno e a complexidade de refactor é alta.

## Quando reabrir esta story

Reavaliar se algum dos seguintes ocorrer:

1. **Lighthouse Performance < 85** em qualquer página crítica (`/orcamentos`, `/vendas`, `/produtos`, `/fluxo-de-caixa`, `/dfc`, `/comissao-vendedor`)
2. **First Load JS > 700 kB** em qualquer página após adicionar features novas
3. **TBT (Total Blocking Time) > 600ms** em mobile
4. **Bundle analyzer report** mostrar Antd como >40% do First Load JS por página

## Escopo (quando aplicar)

### 2.1 — Dynamic imports de Drawers raros

`orcamentos/index.tsx` tem Drawer "Ver Produtos em Orçamentos" (linhas ~2680-2740) que só aparece quando user clica botão específico. Candidato natural:

```ts
// ANTES
import { Drawer } from 'antd'
// uso: <Drawer open={pbDrawerOpen} ... />

// DEPOIS
import dynamic from 'next/dynamic'
const Drawer = dynamic(() => import('antd').then(m => ({ default: m.Drawer })), { ssr: false })
```

Aplicar similar em:
- `orcamentos/index.tsx` — Drawer Ver Produtos
- `vendas/index.tsx` — Drawer (se houver)
- `agenda/index.tsx` — Modal de criação evento

### 2.2 — Forms gigantes

`produtos/[id].tsx` e `produtos/criar.tsx` carregam Form completo (DatePicker, Upload, Steps) mesmo quando user só visualiza. Candidato a `dynamic()` da seção de edição.

### 2.3 — DatePicker / TimePicker

Antd DatePicker é ~80kB+ e só é usado em filters/forms específicos. Substituir por `dynamic` ou alternativa leve (`react-day-picker` é ~30kB).

## Critério de aceite (quando aplicar)

- [ ] Lighthouse Performance ≥ 90 nas 6 páginas críticas
- [ ] First Load JS ≤ 500 kB em todas as páginas
- [ ] TBT ≤ 400ms em mobile
- [ ] Tests `npx jest src/` 100% verde
- [ ] Smoke manual: cada Drawer/Modal abre normalmente (UX checa loading spinner durante chunk fetch)

## Estimativa

| Item | Tempo |
|------|-------|
| Identificar 5-10 Drawers/Modals candidatos via bundle analyzer | 1h |
| Refactor `dynamic()` em cada | 30min × N |
| Tests + smoke manual | 2h |
| **Total** | **4-8h** (depende de quantos componentes) |

## Risco

- ⚠️ UX: usuário pode ver flash de "Carregando..." em Drawer raro. Mitigar com Suspense fallback bem-feito.
- ⚠️ SSR: alguns componentes Antd não suportam SSR. Forçar `{ ssr: false }`.

## Notas

Tier 3 (refactor monolithic pages como `vendas/index.tsx` 2895 linhas → sub-componentes lazy) é ainda mais agressivo e requer Story separada futura. NÃO incluído aqui.

Ver também: `SECURITY_AND_PERFORMANCE_AUDIT_2026-05-27.md` (raiz do repo) seção "Performance gains".
