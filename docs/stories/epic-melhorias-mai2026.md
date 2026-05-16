# Epic: Melhorias Estruturais — Maio 2026

**ID:** MELHORIAS-MAI2026
**Status:** Ready
**Data:** 2026-05-16
**Regime:** Todos os regimes (SN, LP, LR, MEI) — Sprint 4 exclusiva LR
**Owner:** @pm Morgan
**Sprint Plan:** 4 sprints lógicas (execução em ordem de prioridade)

---

## Objetivo

Corrigir 4 ajustes estruturais que afetam confiabilidade do motor de precificação e relatórios: (1) Ponto de Equilíbrio com fórmula correta usando apenas HUB, (2) reatividade do espelhamento MO Administrativa HUB→Produtos/Serviços, (3) bugs e responsividade do Relatório de Comissões, (4) refatoração de desconto Lucro Real com nova semântica "sobre preço" + recálculo de impostos por dentro.

---

## Sprints (ordem de execução)

| Sprint | Escopo | Owner | Validadores | Stories |
|--------|--------|-------|-------------|---------|
| **S1 — PE com fontes HUB corretas (PRIORIDADE MÁXIMA)** | Refatoração do cálculo de Ponto de Equilíbrio, novas colunas em `tenant_expense_config`, remoção de mensagem F12 | @data-engineer + @dev | @architect + @qa | T1.1, T1.2, T1.3, T1.4 |
| **S2 — MO Admin reativa (espelho HUB)** | Sincronização em tempo real do indirect_labor_percent após edição HUB | @dev | @qa | T2.1 |
| **S3 — Relatório de Comissões** | Fix data Invalid, fallback comissão zerada, responsividade tabela, export Excel/PDF | @dev + @ux-design-expert | @qa | T3.1, T3.2, T3.3 |
| **S4 — Desconto Lucro Real (sobre preço)** | Nova semântica "% sobre preço" + recálculo ICMS/PIS/COFINS por dentro, validação contra comissão+lucro | @dev + @architect | @architect + @qa | T4.1, T4.2, T4.3 |

---

## Histórias (11)

| ID | Título | Sprint | Prioridade | Complexidade | Agente Executor | Validador |
|----|--------|--------|------------|--------------|------------------|-----------|
| T1.1 | Migration: adicionar `tax_on_revenue_percent` + `commission_percent_hub` em `tenant_expense_config` | S1 | Crítica | S | @data-engineer | @architect |
| T1.2 | Estender `extractStructurePercents` para extrair IMPOSTO_FATURAMENTO_DENTRO e COMISSOES do HUB | S1 | Crítica | M | @dev | @architect |
| T1.3 | Refatorar `breakeven-calculator` + `buildBreakevenInputFromConfig` para fórmula correta (HUB only) | S1 | Crítica | L | @dev | @architect + @qa |
| T1.4 | Limpar mensagem F12 do console e tooltip "(abra o console F12...)" no card PE | S1 | Alta | XS | @dev | @qa |
| T2.1 | Tornar reativo o espelhamento MO Administrativa HUB → Produtos/Serviços (sem reload) | S2 | Alta | M | @dev | @qa |
| T3.1 | Fix "Invalid Date" na coluna Data do Relatório de Comissões | S3 | Alta | S | @dev | @qa |
| T3.2 | Fallback `employees.commission_percent` para vendas antigas com % e R$ zerados | S3 | Alta | M | @dev | @qa |
| T3.3 | Responsividade da tabela de Comissões + revisão Export Excel/PDF | S3 | Média | M | @dev + @ux-design-expert | @qa |
| T4.1 | Refatorar `calculate-discount.ts` com modo LUCRO_REAL ("% sobre preço" + recálculo impostos por dentro) | S4 | Alta | L | @dev + @architect | @architect + @qa |
| T4.2 | Aplicar nova semântica em Orçamentos (regime LR) | S4 | Alta | M | @dev | @qa |
| T4.3 | Aplicar nova semântica em Agenda (finalizar/concluir serviço, regime LR) | S4 | Alta | M | @dev | @qa |

---

## Migrations Supabase necessárias

1. **`20260516000001_add_hub_pe_columns.sql`** — adiciona `tax_on_revenue_percent NUMERIC(6,3)` e `commission_percent_hub NUMERIC(6,3)` em `tenant_expense_config`. Defaults `0`. Necessária para Sprint 1.

---

# Story T1.1 — Migration: adicionar `tax_on_revenue_percent` + `commission_percent_hub` em `tenant_expense_config`

**Status:** Ready | **Sprint:** S1 | **Agente Executor:** @data-engineer Dara | **Validador:** @architect Aria

### Contexto
Hoje o cálculo de Ponto de Equilíbrio usa `currentUser.taxableRegimeValue` (regime tributário cadastrado no perfil — ex: 28,53% no LP) e `currentUser.commissionValue` (campo manual). A regra correta de PE exige usar os percentuais **apenas do HUB**: grupo `IMPOSTO_FATURAMENTO_DENTRO` (ex: 1,14%) e grupo `COMISSOES`. É necessário persistir esses dois percentuais em `tenant_expense_config` para que sejam disponíveis no cálculo via `buildBreakevenInputFromConfig`.

### Critérios de Aceitação
- [ ] Given uma instância com `tenant_expense_config` populada, When a migration é aplicada, Then duas novas colunas existem: `tax_on_revenue_percent NUMERIC(6,3) DEFAULT 0` e `commission_percent_hub NUMERIC(6,3) DEFAULT 0`
- [ ] Given um tenant existente com HUB já configurado, When `recalc-expense-config` rodar pós-migration, Then as duas colunas são populadas com os valores extraídos de IMPOSTO_FATURAMENTO_DENTRO e COMISSOES
- [ ] RLS preservada (herda das policies existentes em `tenant_expense_config`)
- [ ] Down migration documentada (drop colunas)

### Arquivos afetados
- `supabase/migrations/20260516000001_add_hub_pe_columns.sql` (novo)

### Risks
- Backfill de tenants antigos sem HUB configurado: defaults `0` mantêm comportamento backward-compatible mas PE ficará subestimado até primeira sincronização HUB.

### Dependências
- Nenhuma (primeira story da sprint)

---

# Story T1.2 — Estender `extractStructurePercents` para extrair IMPOSTO_FATURAMENTO_DENTRO e COMISSOES

**Status:** Ready | **Sprint:** S1 | **Agente Executor:** @dev Dex | **Validador:** @architect Aria

### Contexto
A função `extractStructurePercents` em `src/utils/hub-engine.ts:405-434` extrai percentuais por grupo do HUB e popula `tenant_expense_config`. Hoje ela cobre grupos como MAO_OBRA_INDIRETA, DESPESA_FIXA, DESPESA_VARIAVEL, mas **não extrai** os dois grupos essenciais para PE: `IMPOSTO_FATURAMENTO_DENTRO` e `COMISSOES`. Os IDs/constantes desses grupos já estão definidos em `src/utils/hub-engine.ts:88-91`.

### Critérios de Aceitação
- [ ] Given um HUB com lançamentos no grupo IMPOSTO_FATURAMENTO_DENTRO, When `extractStructurePercents` rodar, Then retorna o percentual agregado e persiste em `tenant_expense_config.tax_on_revenue_percent`
- [ ] Given um HUB com lançamentos em COMISSOES, When `extractStructurePercents` rodar, Then retorna o percentual agregado e persiste em `tenant_expense_config.commission_percent_hub`
- [ ] Given um HUB sem lançamentos nesses grupos, When extração rodar, Then valores ficam em `0` (não null, não NaN)
- [ ] Unit tests: 3 casos (grupo presente, grupo ausente, grupo com múltiplos lançamentos somando)
- [ ] Função `recalc-expense-config.ts` é atualizada para chamar a nova extração

### Arquivos afetados
- `src/utils/hub-engine.ts` (linhas 405-434 — estender `extractStructurePercents`)
- `src/utils/recalc-expense-config.ts` (linhas 36-152 — incluir as duas novas chaves)

### Risks
- Nomenclatura: confirmar com @architect se o grupo correto é `IMPOSTO_FATURAMENTO_DENTRO` (por dentro) vs `IMPOSTO` (por fora). Hoje o código mistura em `taxableRegimeAutoPercent` — não usar esse fallback.

### Dependências
- T1.1 (colunas precisam existir antes de gravar nelas)

---

# Story T1.3 — Refatorar `breakeven-calculator` + `buildBreakevenInputFromConfig` para fórmula correta (HUB only)

**Status:** Ready | **Sprint:** S1 | **Agente Executor:** @dev Dex | **Validadores:** @architect Aria + @qa Quinn

### Contexto
Bug raiz identificado em `src/utils/breakeven-calculator.ts:36-115`: a função `buildBreakevenInputFromConfig` puxa `taxesInsidePct` de `currentUser?.taxableRegimeValue ?? calcBase.taxableRegimeAutoPercent` (regime tributário cadastrado, ex: 28,53%) e `commissionPct` de `currentUser?.commissionValue` (campo manual de perfil). A fórmula correta exige usar **apenas valores do HUB** persistidos em `tenant_expense_config` (após T1.1 e T1.2).

### Fórmula correta (validada com usuário, exemplo real)
```
Variáveis (% sobre faturamento):
  Custo produtos        = 57,64%
  Despesas variáveis    =  6,12%
  Comissões (HUB)       =  2,58%
  Impostos por dentro   =  1,14%   <-- HUB grupo IMPOSTO_FATURAMENTO_DENTRO
  Despesas financeiras  =  0,43%
  -----
  Total variáveis       = 67,91%

MC (margem contribuição %) = 100% - 67,91% = 32,09%

Fixos (% sobre faturamento):
  MO Produtiva       = 11,68%
  MO Administrativa  = 10,51%
  Despesas Fixas     = 10,01%
  -----
  Total fixos        = 32,20%

Faturamento médio HUB = R$ 294.621
Custo fixo R$         = 32,20% × 294.621 ≈ R$ 94.900
PE                    = R$ 94.900 / 0,3209 ≈ R$ 295.700
```

### Critérios de Aceitação
- [ ] Given `tenant_expense_config` populada com os 8 percentuais (5 variáveis + 3 fixos) e `average_monthly_revenue`, When `buildBreakevenInputFromConfig` for chamada, Then `taxesInsidePct = config.tax_on_revenue_percent` (NUNCA `currentUser.taxableRegimeValue`)
- [ ] Given mesma config, When chamada, Then `commissionPct = config.commission_percent_hub` (NUNCA `currentUser.commissionValue`)
- [ ] Given todos os percentuais e faturamento médio, When `computeBreakeven` for chamada, Then retorna `{ breakevenRevenue, marginContributionPct, fixedCostsRS, variableCostsPct }` matematicamente corretos conforme fórmula acima
- [ ] Given MC ≤ 0 (variáveis ≥ 100%), When calcular, Then retorna estado de erro estruturado (não NaN, não Infinity, não throw)
- [ ] Given faturamento médio = 0, When calcular, Then retorna estado "indisponível" estruturado
- [ ] Unit tests cobrindo exemplo do usuário (PE ≈ R$ 295.700 ± R$ 100)
- [ ] Unit tests para casos degenerados (MC=0, MC<0, faturamento=0, todos os % = 0)

### Pseudocode da fórmula
```ts
const variableTotal =
  config.products_cost_percent +
  config.variable_expense_percent +
  config.commission_percent_hub +         // novo
  config.tax_on_revenue_percent +         // novo
  config.financial_expense_percent;

const fixedTotal =
  config.productive_labor_percent +
  config.indirect_labor_percent +
  config.fixed_expense_percent;

const mcPct = 1 - variableTotal;                       // margem contribuição %
const fixedCostsRS = fixedTotal * config.average_monthly_revenue;
const breakevenRevenue = mcPct > 0
  ? fixedCostsRS / mcPct
  : null; // erro estruturado
```

### Arquivos afetados
- `src/utils/breakeven-calculator.ts` (linhas 36-115 — refatorar `computeBreakeven` e `buildBreakevenInputFromConfig`)
- `src/pages/index.tsx` (linhas 299-345 — atualizar consumo no card PE da Home)
- `src/utils/recalc-expense-config.ts` (garantir que `average_monthly_revenue` e os 8 percentuais estão sempre persistidos)

### Risks
- Diferença de arredondamento entre cálculo no front e cálculo backend (se houver) — padronizar em 4 casas para % e 2 para R$.
- Tenants antigos com faturamento médio não preenchido: tratar como "indisponível", não quebrar UI.

### Dependências
- T1.1 (migration)
- T1.2 (extração HUB)

---

# Story T1.4 — Limpar mensagem F12 e tooltip do card PE

**Status:** Ready | **Sprint:** S1 | **Agente Executor:** @dev Dex | **Validador:** @qa Quinn

### Contexto
Hoje, quando PE não pode ser calculado, o sistema imprime no console `[PE] Não foi possível calcular o Ponto de Equilíbrio:` e exibe tooltip dizendo `(abra o console F12 para ver os valores)`. Após T1.3 essa branch praticamente não dispara — e mesmo quando dispara, exposição de F12 ao usuário final é UX ruim.

### Critérios de Aceitação
- [ ] Given o cálculo de PE falha (MC≤0 ou faturamento=0), When o card é renderizado, Then NÃO há `console.warn`/`console.error` com prefixo `[PE]`
- [ ] Given falha de cálculo, When o card é renderizado, Then tooltip mostra mensagem amigável (ex: "Configure o faturamento médio e os percentuais do HUB para calcular") **sem menção a F12**
- [ ] Given cálculo bem-sucedido, When renderizado, Then tooltip mostra breakdown amigável (variáveis %, fixos %, MC %, faturamento médio)
- [ ] Grep final em `src/pages/index.tsx` e `src/utils/breakeven-calculator.ts`: nenhuma string `F12` ou `[PE] Não foi possível`

### Arquivos afetados
- `src/pages/index.tsx` (linhas 681-698 — tooltip do card PE)
- `src/pages/index.tsx` (linhas 299-345 — qualquer `console.*` relacionado)
- `src/utils/breakeven-calculator.ts` (remover qualquer `console.*`)

### Risks
- Baixo. Mudança puramente cosmética + remoção de logs.

### Dependências
- T1.3 (refatoração base — a limpeza ocorre por cima)

---

# Story T2.1 — MO Administrativa reativa (espelho HUB) sem reload de página

**Status:** Ready | **Sprint:** S2 | **Agente Executor:** @dev Dex | **Validador:** @qa Quinn

### Contexto
Decisão do usuário: **NÃO existe campo manual** de MO Administrativa em produtos/serviços — sempre puxa do HUB. A sincronização HUB→`tenant_expense_config.indirect_labor_percent`→`calcBase.indirectLaborPct`→consumo já existe (ver `src/utils/recalc-expense-config.ts:71-74` → `src/pages/index.tsx:114-129` → `src/page-parts/products/product-price.component.tsx:86`). Bug provável: a tela de precificação **não recalcula em tempo real** após o usuário editar o HUB em outra aba/sessão — precisa F5.

### Critérios de Aceitação
- [ ] Given um produto sendo precificado em aba A, And o HUB sendo editado em aba B, When o usuário volta para a aba A, Then o valor de `indirectLaborPct` reflete o novo HUB **sem reload manual**
- [ ] Given a página `/produtos/[id]` aberta, When um trigger Supabase Realtime (ou re-fetch on focus) detectar mudança em `tenant_expense_config`, Then `calcBase.indirectLaborPct` é re-hidratado e a UI re-renderiza o novo % e novo preço sugerido
- [ ] Mesmo comportamento na precificação de serviços (`src/page-parts/products/content-service.tsx:72`)
- [ ] Não há campo manual "MO Administrativa %" editável na UI de produtos/serviços (confirmar via grep)
- [ ] Performance: re-hidratação dispara no máximo 1 query a `tenant_expense_config` por evento

### Implementação sugerida
1. Subscription Supabase Realtime em `tenant_expense_config` filtrada por `tenant_id` no hook `useExpenseConfig` (ou equivalente)
2. **OU** `revalidateOnFocus` via SWR/React Query no fetch de config
3. **OU** event bus simples disparado após `mergeExpenseConfig`

### Arquivos afetados
- `src/utils/recalc-expense-config.ts` (linhas 71-74 — confirmar gravação no DB)
- `src/pages/index.tsx` (linhas 114-129 — `mergeExpenseConfig`)
- `src/page-parts/products/product-price.component.tsx` (linha 86 — consumidor produtos)
- `src/page-parts/products/content-service.tsx` (linha 72 — consumidor serviços)
- Hook novo ou ajustado para subscription/refocus

### Risks
- Realtime Supabase exige RLS bem-configurada — usar a mesma do tenant.
- Race condition se usuário editar produto e HUB ao mesmo tempo — adotar last-write-wins na UI.

### Dependências
- Sprint 1 idealmente concluída (para evitar conflito sobre `tenant_expense_config`).

---

# Story T3.1 — Fix "Invalid Date" na coluna Data do Relatório de Comissões

**Status:** Ready | **Sprint:** S3 | **Agente Executor:** @dev Dex | **Validador:** @qa Quinn

### Contexto
Em `src/pages/relatorio-vendas/index.tsx:1566` o render da coluna Data faz `dayjs(v + 'T00:00:00').format('DD/MM/YYYY')`. Quando `v` é `null`, `undefined`, ISO completo, ou já formatado, o `dayjs` falha e renderiza "Invalid Date".

### Critérios de Aceitação
- [ ] Given uma venda com `sold_at` válido (ISO ou date-only), When renderizado, Then exibe `DD/MM/YYYY` correto
- [ ] Given uma venda sem data, When renderizado, Then exibe `-` (placeholder), nunca "Invalid Date"
- [ ] Given um valor inesperado (string vazia, objeto), When renderizado, Then exibe `-`
- [ ] Helper centralizado (ex: `formatDateSafe(v)`) usado também nas demais colunas de data do mesmo arquivo

### Pseudocode
```ts
const formatDateSafe = (v: unknown): string => {
  if (!v) return '-';
  const d = dayjs(v as any);
  return d.isValid() ? d.format('DD/MM/YYYY') : '-';
};
```

### Arquivos afetados
- `src/pages/relatorio-vendas/index.tsx` (linha 1566 e demais render de data)

### Risks
- Baixo. Mudança defensiva.

### Dependências
- Nenhuma.

---

# Story T3.2 — Fallback `employees.commission_percent` para vendas antigas com comissão zerada

**Status:** Ready | **Sprint:** S3 | **Agente Executor:** @dev Dex | **Validador:** @qa Quinn

### Contexto
Vendas criadas antes da feature atual de comissões têm `sales.commission_amount = 0` e os respectivos `sale_items` sem `commission_percent` populado. O relatório mostra 0% e R$ 0,00 para essas vendas, dificultando reconciliação. Solução: quando ambos zerados, derivar via `employees.commission_percent` × valor da venda (líquido de descontos).

### Critérios de Aceitação
- [ ] Given uma venda com `commission_amount > 0`, When o relatório renderizar, Then usa o valor armazenado (sem fallback)
- [ ] Given uma venda com `commission_amount = 0` E todos os `sale_items.commission_percent = 0`, When o relatório renderizar, Then busca `employees.commission_percent` do `employee_id` da venda e calcula `commission = employees.commission_percent × sale_total_net`
- [ ] Given um vendedor sem `commission_percent` cadastrado (null/0), When fallback rodar, Then exibe `0%` / `R$ 0,00` (sem inventar)
- [ ] A coluna % comissão mostra a fonte: valor armazenado vs fallback (sutil — tooltip "calculado via cadastro do vendedor" quando fallback)
- [ ] Unit test: 3 cenários (venda nova com %, venda antiga com fallback aplicável, venda antiga sem cadastro)
- [ ] `computeSaleCommission` em `src/utils/commission-calc.ts` é o único ponto onde o fallback é implementado (consistência com export)

### Arquivos afetados
- `src/utils/commission-calc.ts` (linhas 33-56 — `computeSaleCommission`, adicionar parâmetro `employeeCommissionPct`)
- `src/pages/relatorio-vendas/index.tsx` (linhas 540-662 — `loadCommissionsData`, fazer JOIN com `employees` para trazer `commission_percent`)
- `src/pages/relatorio-vendas/index.tsx` (linhas 1560-1623 — render de % e R$ usando o helper único)

### Risks
- Reconciliação contábil: se a empresa já fechou comissões com base no `commission_amount = 0`, o fallback "infla" relatório histórico — alinhar com usuário se exibir badge "calculado" para vendas pré-feature.

### Dependências
- T3.1 (mesma sprint, mesmo arquivo — coordenar para evitar conflito).

---

# Story T3.3 — Responsividade da tabela de Comissões + revisão Export Excel/PDF

**Status:** Ready | **Sprint:** S3 | **Agente Executor:** @dev Dex + @ux-design-expert Uma | **Validador:** @qa Quinn

### Contexto
Tabela de comissões em `src/pages/relatorio-vendas/index.tsx:1560-1623` tem 7 colunas com widths fixos (110+140+ellipsis+160+140+120+140 ≈ 810px), forçando scroll horizontal em mobile (<640px). Adicionalmente, o handler de export (`handleExportCommissionsExcel` em 1629-1730+) precisa refletir corretamente os valores fixados em T3.2 (data correta + fallback comissão).

### Critérios de Aceitação

**Responsividade tabela:**
- [ ] Given viewport < 640px, When a tabela renderiza, Then usa layout cards/stacked (ex: `Table` colapsado em `Card` de Ant Design) **OU** mantém 3-4 colunas essenciais (data, cliente, R$ comissão) com botão "Detalhes" expandindo as demais
- [ ] Given viewport ≥ 640px, When renderiza, Then mantém layout tabular atual
- [ ] Nenhum scroll horizontal indesejado em telas < 640px
- [ ] Headers ainda legíveis no breakpoint mobile

**Export Excel:**
- [ ] Given relatório filtrado, When usuário clica Export Excel, Then arquivo `.xlsx` contém todas as linhas com:
  - Data formatada `DD/MM/YYYY` (usando helper T3.1)
  - % comissão e R$ comissão com fallback aplicado (T3.2)
  - Totalizadores no final (total vendas, total comissões R$)
- [ ] Cabeçalhos em português e formatação brasileira (R$, vírgula decimal)

**Export PDF (se existir hoje):**
- [ ] Mesma consistência data/comissão
- [ ] Layout retrato A4 legível
- [ ] Se não existir export PDF hoje, escopo desta story é apenas Excel — registrar gap em `project_exports_audit_2026_05.md`

### Arquivos afetados
- `src/pages/relatorio-vendas/index.tsx` (linhas 1560-1623 — colunas + responsividade)
- `src/pages/relatorio-vendas/index.tsx` (linhas 1629-1730+ — `handleExportCommissionsExcel`)
- Possível novo componente: `src/page-parts/reports/commissions-table-mobile.component.tsx`

### Risks
- Mudança de layout pode quebrar testes visuais existentes — confirmar com @ux-design-expert antes de implementar.
- Export Excel: garantir compatibilidade com refatoração do auditing em `project_exports_audit_2026_05.md`.

### Dependências
- T3.1 (helper de data)
- T3.2 (helper de comissão com fallback)

---

# Story T4.1 — Refatorar `calculate-discount.ts` com modo LUCRO_REAL ("% sobre preço")

**Status:** Ready | **Sprint:** S4 | **Agente Executor:** @dev Dex + @architect Aria | **Validadores:** @architect Aria + @qa Quinn

### Contexto
Mudança semântica crítica: hoje `discountPercent` em `src/utils/calculate-discount.ts:1-50` significa **"% sobre a margem"**. A nova regra (exclusiva regime LUCRO_REAL, decisão do usuário) é **"% sobre o PREÇO"**, com recálculo de ICMS e PIS/COFINS por dentro sobre o novo preço, absorção do desconto por comissão + lucro, e validação `desconto% ≤ comissão% + lucro%`.

### Fórmula nova (modo LUCRO_REAL)
```
newPrice         = originalPrice × (1 - discountPct)
newICMS_RS       = icmsRate × newPrice               # ICMS por dentro
newPISCOFINS_RS  = pisCofinsRate × newPrice          # PIS/COFINS por dentro
newCommission_RS = commissionPct × newPrice          # se commissão é % sobre venda
absorbedByMargin = (originalPrice - newPrice)
                 - (oldICMS_RS - newICMS_RS)
                 - (oldPISCOFINS_RS - newPISCOFINS_RS)
                 - (oldCommission_RS - newCommission_RS)
# absorbedByMargin é a redução real do lucro líquido
```

### Critérios de Aceitação
- [ ] Given regime ≠ LUCRO_REAL, When `calculateDiscount` chamada, Then comportamento atual (% sobre margem) **inalterado** (backward compat)
- [ ] Given regime = LUCRO_REAL, When chamada, Then modo novo é aplicado: `newPrice = original × (1 - pct)`
- [ ] Given regime LR e desconto%, When calcular, Then `ICMS_RS` é recalculado como `icmsRate × newPrice` (por dentro)
- [ ] Given regime LR e desconto%, When calcular, Then `PIS/COFINS_RS` é recalculado como `pisCofinsRate × newPrice` (por dentro)
- [ ] Given regime LR e desconto% > (commissionPct + profitPct), When chamada, Then retorna `{ valid: false, reason: 'discount-exceeds-margin-headroom', maxAllowedPct }`
- [ ] Given regime LR e desconto% ≤ (commissionPct + profitPct), When chamada, Then retorna `{ valid: true, newPrice, newICMS, newPISCOFINS, newCommission, newProfit, absorbedByMargin }`
- [ ] Alíquotas ICMS, PIS, COFINS vêm das mesmas fontes usadas em `product-price.component.tsx:79-159` (single source of truth)
- [ ] Unit tests:
  - LR com produto exemplo (preço R$ 100, ICMS 18%, PIS 1,65%, COFINS 7,6%, comissão 5%, lucro 15%): desconto 10% deve resultar em novoPreço R$ 90 e novos impostos por dentro
  - LR com desconto > comissão+lucro: retorna inválido
  - Não-LR (SN, LP, MEI): comportamento legado inalterado

### Arquivos afetados
- `src/utils/calculate-discount.ts` (linhas 1-50 — núcleo a refatorar)
- `src/page-parts/products/product-price.component.tsx` (linhas 79-159 — referência da fórmula ICMS/PIS-COFINS por dentro; NÃO modificar — apenas reutilizar lógica)

### Risks
- **Quebra silenciosa** se algum consumidor existente em SN/LP/MEI receber objeto retornado diferente — versionar API e/ou aceitar `regime` como argumento obrigatório.
- Lucro pode ficar negativo se alíquotas + comissão somarem mais de 100% do preço final — guard explícito.
- Alinhamento com regime tributário: confirmar com @architect se "regime LUCRO_REAL" é resolvido por `currentUser.taxRegime` ou similar.

### Dependências
- Nenhuma (mas Sprint 1 idealmente feita antes para não competir por `tenant_expense_config`).

---

# Story T4.2 — Aplicar nova semântica de desconto em Orçamentos (regime LR)

**Status:** Ready | **Sprint:** S4 | **Agente Executor:** @dev Dex | **Validador:** @qa Quinn

### Contexto
A página de orçamentos (`src/pages/orcamentos/index.tsx`) tem hoje cálculo de `maxDiscountPercent`, `profitAmount` e `commissionAmount` nas linhas 444-509, e UI de desconto nas linhas 1922-1967. Precisa consumir o novo `calculate-discount.ts` no modo LR e exibir feedback correto.

### Critérios de Aceitação
- [ ] Given orçamento, And tenant em regime LR, When usuário digita desconto%, Then UI mostra preview do novo preço calculado por T4.1
- [ ] Given orçamento LR, When desconto% > (comissão% + lucro%), Then botão "Salvar" fica desabilitado e mensagem "Desconto não pode exceder X,XX% (comissão + lucro)" exibida
- [ ] Given orçamento LR, When salvar com desconto válido, Then `budget.discount_percent`, `budget.discount_value`, `budget.total_value` persistidos com novos valores (preço pós-desconto)
- [ ] Given orçamento em regime ≠ LR, When abrir, Then comportamento atual (legado) preservado
- [ ] Tooltip ao lado do campo desconto mostra: "Modo Lucro Real: % aplicado sobre o preço. ICMS e PIS/COFINS são recalculados automaticamente."

### Arquivos afetados
- `src/pages/orcamentos/index.tsx` (linhas 444-509 — cálculo de teto e valores)
- `src/pages/orcamentos/index.tsx` (linhas 1922-1967 — UI do campo desconto)

### Risks
- Persistência: confirmar com @data-engineer se `budgets.discount_percent` precisa de nova coluna `discount_mode` (ex: `LR_PRICE_BASED`) para diferenciar de orçamentos legados — ou se basta inferir pelo regime na hora do recalc.

### Dependências
- T4.1 (núcleo refatorado)

---

# Story T4.3 — Aplicar nova semântica de desconto em Agenda (finalizar/concluir serviço, regime LR)

**Status:** Ready | **Sprint:** S4 | **Agente Executor:** @dev Dex | **Validador:** @qa Quinn

### Contexto
A agenda (`src/pages/agenda/index.tsx`) usa hoje `globalDiscountPctAgenda` (linhas 130-131) e importa `calculate-discount` (linha 25). Quando o usuário conclui um serviço com desconto, regime LR deve aplicar a nova semântica.

### Critérios de Aceitação
- [ ] Given evento de agenda, And tenant LR, When usuário aplica desconto% na conclusão, Then novo preço, ICMS, PIS/COFINS calculados via T4.1
- [ ] Given regime LR e desconto% > (comissão% + lucro%), When tentar concluir, Then bloqueio + mensagem clara
- [ ] Given regime ≠ LR, When concluir com desconto, Then comportamento atual preservado
- [ ] Comprovante/PDF de conclusão de serviço reflete novos valores (preço, ICMS, PIS/COFINS, comissão, lucro)
- [ ] Lançamento financeiro (sale + pending_receivables) usa o `newPrice` como base, não o `originalPrice`

### Arquivos afetados
- `src/pages/agenda/index.tsx` (linhas 130-131 — `globalDiscountPctAgenda`)
- `src/pages/agenda/index.tsx` (linha 25 — import)
- `src/pages/agenda/index.tsx` (popup/handler de conclusão — consumir T4.1)

### Risks
- Agendamentos antigos persistidos com semântica antiga: NÃO recalcular retroativamente. Apenas novos eventos pós-deploy usam novo modo.
- Inconsistência com `pending_receivables` se desconto aplicado APÓS gerar parcelas — bloquear desconto pós-parcelas ou regerar parcelas (alinhar com usuário).

### Dependências
- T4.1 (núcleo refatorado)
- T4.2 (preferencial, para consistência cross-módulo)

---

## QA & Definition of Done (Epic inteiro)

- [ ] Todos os critérios de aceitação marcados em todas as 11 stories
- [ ] `npm run lint` passa
- [ ] `npm run typecheck` passa (`tsc --noEmit`)
- [ ] Migration `20260516000001_add_hub_pe_columns.sql` aplicada com sucesso em ambiente local e validada por @data-engineer
- [ ] Unit tests novos:
  - `breakeven-calculator` (cobertura do exemplo do usuário ± R$ 100)
  - `extractStructurePercents` (3 cenários)
  - `commission-calc` (com e sem fallback)
  - `calculate-discount` modo LR (3 cenários) + modo legado (regressão)
- [ ] Smoke test manual:
  - Card PE na Home mostra valor coerente para tenant real
  - Edição HUB reflete em produtos sem F5
  - Relatório de Comissões: data correta, comissão correta com fallback, responsivo mobile
  - Orçamento LR: desconto bloqueia quando > (comissão+lucro)
  - Agenda LR: conclusão com desconto aplica novo preço
- [ ] Nenhuma regressão em SN, LP, MEI (Sprint 4 só afeta LR)
- [ ] Console limpo: nenhum `[PE] Não foi possível...` e nenhuma referência a "F12"
- [ ] QA Gate PASS por @qa Quinn

---

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-05-16 | @pm Morgan | Epic criado com 11 stories distribuídas em 4 sprints. Sprint 1 (PE) como prioridade máxima. Migration `20260516000001_add_hub_pe_columns.sql` mapeada. |
