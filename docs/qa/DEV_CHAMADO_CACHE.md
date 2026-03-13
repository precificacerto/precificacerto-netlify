# @dev – Chamado: cache e carregamento

**De:** Quinn (QA)  
**Data:** 2025-02-27  
**Assunto:** Redução do tempo de carregamento com cache (memória + localStorage)

---

## O que já foi feito (QA)

- **Cache do dashboard** em memória e em **localStorage** (TTL 10 min):
  - `web-app/src/utils/dashboard-cache.ts` – get/set/clear
  - `web-app/src/pages/index.tsx` – usa o cache na Home (primeiro mostra cache, depois revalida em background)
  - **Logout** limpa o cache: `clearDashboardCache()` em `auth.context.tsx` (logout e quando a sessão cai)

Com isso, ao voltar ao Dashboard na mesma sessão o carregamento é imediato; após F5, se o cache em localStorage ainda estiver válido (< 10 min), a primeira pintura também é rápida.

---

## O que o @dev precisa fazer

1. **Revisar e testar** ✅ (Dex aplicou continuidade; testes manuais pendentes)
   - [ ] Testar: Dashboard → outra página → Dashboard (deve ser instantâneo).
   - [ ] Testar: F5 no Dashboard (deve mostrar dados do cache logo que existir cache).
   - [ ] Testar: logout e login com outro usuário (não deve ver dados do tenant anterior).
   - [ ] Rodar localmente: `npm run lint` e `npm run build` (ou `npm test` se houver testes) na pasta `web-app`.

2. **Continuidade aplicada por @dev (Dex)**
   - **SWR – revalidateOnMount: false** em `src/hooks/use-data.hooks.ts`, conforme QA recomendação ponto 2. Assim, ao navegar entre listas (Itens, Produtos, Estoque, Clientes), os dados vêm do cache na mesma sessão e não disparam refetch no mount.

3. **Decisão opcional: cache em outros módulos**
   - Ver **`docs/qa/QA_RECOMENDACAO_CACHE_CARREGAMENTO.md`**.
   - Se quiser persistência em localStorage para listas (além do dashboard), usar provider SWR com localStorage + TTL e limpar no logout.

4. **Ajustes finos (se necessário)**
   - TTL do dashboard: 10 min em `dashboard-cache.ts` (`TTL_MS`).
   - Prefixo do localStorage: `pc-dashboard-`. Manter padrão parecido se adicionar outros caches.

---

## Referências

- Especificação completa: **`docs/qa/QA_RECOMENDACAO_CACHE_CARREGAMENTO.md`**
- Implementação do cache: **`src/utils/dashboard-cache.ts`**
- Uso na Home: **`src/pages/index.tsx`** (fetchDashboardData / revalidateDashboard)
- Limpeza no logout: **`src/contexts/auth.context.tsx`** (logout + onAuthStateChange quando session é null)

— Quinn, guardião da qualidade
