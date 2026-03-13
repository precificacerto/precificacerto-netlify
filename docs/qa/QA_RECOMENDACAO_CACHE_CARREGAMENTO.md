# QA – Recomendação: cache para reduzir tempo de carregamento

**Data:** 2025-02-27  
**Revisor:** Quinn (Test Architect)  
**Prioridade:** ALTA (performance / UX)

---

## Instruções para @dev

O tempo de carregamento da página está alto. A aplicação **não utiliza cache** para dados já carregados: cada visita/refresh dispara novas requisições. Implementar cache (em memória e, se fizer sentido, localStorage) para manter os dados até o cliente resetar a página (ou por TTL) e assim melhorar a percepção de velocidade.

---

## Resumo do problema

| Aspecto | Situação atual |
|--------|----------------|
| **Dashboard (Home)** | `fetchDashboardData()` roda em todo mount; 3 chamadas Supabase (cash_entries, cashier_months, tenant_expense_config) sem cache. |
| **Hooks de dados** | SWR já faz cache em memória entre componentes, mas a chave depende de `tenantId`; ao trocar de rota ou remount, pode refetch. Nenhum uso de localStorage. |
| **Persistência** | Apenas `sessionStorage` no cliente Supabase (auth). Nenhum cache de dados da aplicação em localStorage. |

---

## O que implementar

### 1. Cache em memória no Dashboard (obrigatório)

- **Arquivo:** `web-app/src/pages/index.tsx`
- **Problema:** `fetchDashboardData()` é chamado em todo `useEffect` ao montar a página; não reutiliza dados já carregados na mesma sessão.
- **Esperado:**
  - Manter um cache em memória (por exemplo, módulo ou ref) keyed por `tenantId` + `currentYear`.
  - Na montagem: se existir dado em cache para essa chave, usar primeiro (render imediato) e, opcionalmente, revalidar em background.
  - O cache deve valer **até o cliente resetar a página** (refresh/F5); em memória apenas, sem persistência, já atende.
- **Verificação:**
  - [ ] Ao navegar Dashboard → outra página → Dashboard, os dados não disparam 3 novas requisições imediatas (ou disparam apenas revalidação em background).
  - [ ] Após F5, uma nova carga é feita (cache em memória limpo).

### 2. Reutilizar cache durante a sessão (SWR)

- **Arquivo:** `web-app/src/hooks/use-data.hooks.ts`
- **Situação:** SWR já tem `dedupingInterval: 30000` e `revalidateOnFocus: false`. Garantir que, na mesma sessão, ao voltar para uma tela que usa os mesmos hooks, os dados vêm do cache primeiro.
- **Sugestão:** considerar `revalidateOnMount: false` quando já houver dados em cache (ou manter comportamento atual e focar no dashboard).
- **Verificação:**
  - [ ] Navegação entre listas (Itens, Produtos, Estoque, etc.) não provoca refetch desnecessário na mesma sessão.

### 3. (Opcional) Persistir no localStorage para sobreviver ao refresh

- **Problema:** “Não está armazenando nada no local storage” — após F5, tudo é buscado de novo.
- **Esperado (opcional):**
  - Para dados que mudam com menos frequência (ex.: config do tenant, lista de itens/produtos), usar localStorage com TTL curto (ex.: 5–15 min).
  - Na primeira carga após refresh: mostrar dados do localStorage (se existirem e não expirados) e depois revalidar em background.
- **Cuidados:** invalidar ou limpar cache ao fazer logout; usar chave por tenant/user para não vazar dados entre contas.
- **Verificação:**
  - [ ] Após refresh, primeira pintura usa dados do localStorage quando disponíveis.
  - [ ] Após logout, cache em localStorage é limpo ou ignorado.

---

## Constraintes

- Não alterar comportamento de escrita (mutations); apenas leitura e cache.
- Manter invalidação explícita onde já existir (ex.: após criar/editar item, `mutate()` do SWR).
- Se usar localStorage, respeitar limite de ~5MB e tratar erros de quota.

---

## Após implementar

1. Testar fluxo: Dashboard → outras páginas → voltar ao Dashboard (sem F5): carregamento deve ser imediato ou muito mais rápido.
2. Testar F5 no Dashboard: com cache em memória, após refresh pode refetch; com localStorage (se implementado), primeira pintura rápida.
3. Opcional: medir tempo até primeiro conteúdo visível (LCP/loading) antes e depois.

— Quinn, guardião da qualidade
