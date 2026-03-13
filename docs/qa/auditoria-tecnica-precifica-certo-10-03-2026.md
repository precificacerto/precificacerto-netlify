# Auditoria Técnica — Precifica Certo
**Data:** 10/03/2026  
**Escopo:** Restituição, tabela tax_restitution_entries, recalc-expense-config, motor de preço, configurações fiscais

---

## PERGUNTA 1 — Aba de Restituição: como os valores chegam na tela?

### 1.1 Como a aba "Restituição (Lucro Real)" decide quais valores exibir (R$ 0,00 por padrão)

**Arquivo:** `src/pages/fluxo-de-caixa/index.tsx`

- A aba só é exibida quando `isLucroReal === true` (regime tributário LUCRO_REAL).
- Valores vêm do estado local: `restitutionTotalPurchases`, `restitutionPis`, `restitutionCofins`, `restitutionIcms`, `restitutionTotal`.
- Na carga (`loadRestitution`), é feita query em `tax_restitution_entries` por `tenant_id` e `reference_month` (mês selecionado). Se existir linha, os valores são preenchidos; senão, todos são zerados.

```tsx
// Linhas 203-230
const loadRestitution = async () => {
  const monthStart = month.startOf('month').format('YYYY-MM-01')
  const { data: rows } = await supabase
    .from('tax_restitution_entries')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('reference_month', monthStart)
  const row = rows && rows.length > 0 ? rows[0] : null
  if (row) {
    setRestitutionTotalPurchases(Number(row.total_purchases) || 0)
    setRestitutionPis(Number(row.pis_credit) || 0)
    // ...
  } else {
    setRestitutionTotalPurchases(0)
    setRestitutionPis(0)
    // ... todos 0
  }
}
```

**Conclusão:** ✅ OK — Valores vêm de `tax_restitution_entries` para o mês; padrão R$ 0,00 quando não há registro.

---

### 1.2 O que o botão "Calcular automaticamente" faz

**Função:** `handleAutoCalculateRestitution` (linhas 768-821).

1. Busca em `cash_entries` as entradas do mês selecionado (`start` a `end`), com `tenant_id` e `is_active = true`.
2. Filtra `type === 'EXPENSE'` e `expense_group` em `'DESPESA_VARIAVEL'` ou `'MAO_DE_OBRA_PRODUTIVA'`.
3. Soma os `amount` → `purchases`.
4. Calcula: PIS = purchases × 0,0165; COFINS = purchases × 0,076.
5. Para ICMS: lê `tenant_settings` (state_code, icms_contribuinte) e, se contribuinte, busca `brazilian_states.icms_internal_rate` e aplica sobre `purchases`.
6. Atualiza o estado local com esses valores (não persiste).

**Conclusão:** ✅ OK — Função e tabelas utilizadas estão corretas.

---

### 1.3 Como `total_purchases` é calculado (quais expense_groups)

**Trecho relevante (linhas 784-788):**

```tsx
const purchases = list
  .filter((e: any) =>
    e.type === 'EXPENSE' &&
    (e.expense_group === 'DESPESA_VARIAVEL' || e.expense_group === 'MAO_DE_OBRA_PRODUTIVA'),
  )
  .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
```

**Conclusão:** ✅ OK — Somados apenas despesas do mês com `expense_group` **DESPESA_VARIAVEL** e **MAO_DE_OBRA_PRODUTIVA**. Demais grupos (ex.: DESPESA_FIXA, MAO_DE_OBRA_ADMINISTRATIVA) não entram.

---

### 1.4 Como os créditos PIS (1,65%), COFINS (7,6%) e ICMS são calculados

- **PIS:** `purchases * 0.0165` (linha 790).
- **COFINS:** `purchases * 0.076` (linha 791).
- **ICMS:** só se `tenant_settings.icms_contribuinte` for true; alíquota em `brazilian_states.icms_internal_rate` (valor já em decimal ou em % tratado); `icmsCredit = purchases * icmsRate` (linhas 801-811).

**Conclusão:** ✅ OK — Cálculos alinhados às alíquotas de Lucro Real.

---

### 1.5 O que o botão "Salvar estimativa" persiste

**Função:** `handleSaveRestitution` (linhas 823-865).

- **Tabela:** `tax_restitution_entries`.
- **Payload:** `tenant_id`, `reference_month` (YYYY-MM-01), `total_purchases`, `pis_credit`, `cofins_credit`, `icms_credit`, `total_restitution`, `updated_at`.
- **Lógica:** Busca registro existente por `tenant_id` + `reference_month`; se existir, faz `update(payload)` pelo `id`; senão, `insert(payload)`.

**Conclusão:** ✅ OK — Persistência correta na tabela e sem duplicar registro por mês na prática (upsert por busca + update/insert).

---

## PERGUNTA 2 — Tabela tax_restitution_entries: existe e está configurada corretamente?

**Arquivo:** `supabase/migrations/20260310000006_restitution_table.sql`

### 2.1 Estrutura da tabela

| Coluna            | Tipo         | Default           |
|-------------------|-------------|-------------------|
| id                | UUID        | gen_random_uuid()  |
| tenant_id         | UUID        | NOT NULL, FK tenants(id) |
| reference_month   | DATE        | NOT NULL          |
| total_purchases   | NUMERIC(15,2) | 0               |
| pis_credit        | NUMERIC(15,2) | 0               |
| cofins_credit     | NUMERIC(15,2) | 0               |
| icms_credit       | NUMERIC(15,2) | 0               |
| total_restitution | NUMERIC(15,2) | 0               |
| notes             | TEXT        | -                 |
| created_at        | TIMESTAMPTZ | NOW()             |
| updated_at        | TIMESTAMPTZ | NOW()             |

**Conclusão:** ✅ OK — Estrutura adequada.

---

### 2.2 RLS e policy (users vs profiles)

```sql
CREATE POLICY IF NOT EXISTS "tenant_restitution_policy"
  ON public.tax_restitution_entries
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.users
      WHERE id = auth.uid()
    )
  );
```

**Conclusão:** ✅ OK — RLS ativa; policy usa `public.users` (não `profiles`).

---

### 2.3 Índice em (tenant_id, reference_month)

```sql
CREATE INDEX IF NOT EXISTS idx_tax_restitution_tenant
  ON public.tax_restitution_entries(tenant_id, reference_month);
```

**Conclusão:** ✅ OK — Índice existe.

---

### 2.4 UNIQUE em (tenant_id, reference_month)

Não há constraint UNIQUE nem índice UNIQUE em `(tenant_id, reference_month)` na migration. A aplicação evita duplicatas fazendo busca + update/insert, mas o banco permite duas linhas para o mesmo tenant e mês.

**Conclusão:** ⚠️ **Atenção** — Falta UNIQUE(tenant_id, reference_month). Recomendação: adicionar na migration (ou nova migration):

```sql
ALTER TABLE public.tax_restitution_entries
  ADD CONSTRAINT uq_tax_restitution_tenant_month UNIQUE (tenant_id, reference_month);
```

---

## PERGUNTA 3 — Recálculo de despesas: edge cases de divisão por zero

**Arquivo:** `src/utils/recalc-expense-config.ts`

### 3.1 monthlyRevenue === 0

- Linha 147: `if (monthlyRevenue === 0) return null`.
- Nenhuma divisão usa `monthlyRevenue` antes desse retorno; as divisões por `monthlyRevenue` (linhas 157-160) só são alcançadas quando `monthlyRevenue > 0`.

**Conclusão:** ✅ OK — Há proteção; retorno antecipado evita divisão por zero.

---

### 3.2 Nenhuma entrada MAO_DE_OBRA_PRODUTIVA — productiveMonthCount

```ts
const productiveMonths = new Set(
  expenses
    .filter((e) => e.expense_group === 'MAO_DE_OBRA_PRODUTIVA')
    .map((e) => (e.due_date || '').substring(0, 7))
    .filter(Boolean),
)
const productiveMonthCount = productiveMonths.size || 1
```

Se não houver MO produtiva, `productiveMonths.size` é 0 e usa-se `1`. Assim `avgProdutiva = totalProdutiva / 1 = 0`. Não há divisão por zero.

**Conclusão:** ✅ OK — Fallback para 1 evita divisão por zero.

---

### 3.3 O que é retornado nesses casos extremos

- Se `monthlyRevenue === 0`: a função retorna `null` (linha 147); quem chama deve tratar.
- Se não houver MO produtiva: `production_labor_cost = 0`, `indirect_labor_percent` e demais % seguem com base em `monthlyRevenue` (que já foi validado > 0).

**Conclusão:** ✅ OK — Comportamento definido e seguro.

---

### 3.4 Fallback max(receitas_fluxo, simples_revenue_12m / 12)

```ts
const monthlyRevenue = Math.max(avgRevenueFromCashflow, revenueFromSettings)
```

- `avgRevenueFromCashflow`: receita do fluxo (INCOME) nos 12 meses / meses com receita; se não houver receita, 0.
- `revenueFromSettings`: `simples_revenue_12m / 12` (ou 0 se ausente).
- `monthlyRevenue` é o máximo entre os dois.

**Conclusão:** ✅ OK — Fallback implementado corretamente.

---

## PERGUNTA 4 — Motor de preço: sem dupla contagem de MO

**Arquivos:** `src/utils/pricing-engine.ts`, `src/utils/build-calc-base.ts`, `src/page-parts/products/content.component.tsx`

### 4.1 indirectLaborPct (MO administrativa %) só no coeficiente, nunca no CMV

- Em `build-calc-base.ts`, `structurePct` = `fixed + variable + financial` (linha 32); `indirectLaborPct` é campo separado.
- No motor, o coeficiente é `1 - (structurePct + taxPct + commissionPct + profitPct)` (pricing-engine.ts linha 216). O `structurePct` recebido pelo motor em `content.component` é `calcBase.structurePct` (linha 305), ou seja, **não** inclui `indirectLaborPct`.
- Portanto o coeficiente **não** inclui atualmente o percentual de MO administrativa.

**Conclusão:** ⚠️ **Atenção** — `indirectLaborPct` não entra no coeficiente no fluxo atual. Ou seja: MO administrativa % não está sendo aplicada no preço (possível subprecificação). Ver item 4.4.

---

### 4.2 production_labor_cost (MO produtiva R$) só no CMV, nunca no coeficiente

- `build-calc-base`: `laborCostMonthly` = `production_labor_cost` (R$).
- Motor: `laborCostMonthly` vira custo por minuto e depois `productiveLaborCost` por produto; em INDUSTRIALIZACAO/SERVICO entra em `cmvUnit` (linhas 199-212). O coeficiente usa apenas `structurePct`, `taxPct`, `commissionPct`, `profitPct`.

**Conclusão:** ✅ OK — MO produtiva (R$) entra apenas no CMV; não há dupla contagem no coeficiente.

---

### 4.3 indirectLaborExpensePercent e setProductPriceInfo

Em `content.component.tsx` (linhas 348-350):

```tsx
setProductPriceInfo((prev) => ({
  ...prev,
  indirectLaborExpensePercent: calcBase.indirectLaborPct,
  // ...
}))
```

**Conclusão:** ✅ OK — O campo de exibição recebe `calcBase.indirectLaborPct`.

---

### 4.4 Soma dupla e impacto

- **Dupla contagem:** Não há: MO produtiva (R$) só no CMV; MO administrativa (%) só em exibição e não no coeficiente.
- **Problema identificado:** MO administrativa % não compõe o coeficiente. O motor documenta que para REVENDA o caller deve incluir labor overhead em `structurePct`; para INDUSTRIALIZACAO/SERVICO o caller não está somando `indirectLaborPct` ao `structurePct` antes de chamar o motor, então o preço pode ficar abaixo do esperado.

**Correção sugerida (se a regra de negócio for incluir MO administrativa no preço):** em `content.component.tsx`, ao montar o input do motor, incluir o percentual de MO administrativa na estrutura, por exemplo:

- `structurePct` para o motor = `(calcBase.structurePct + calcBase.indirectLaborPct) / 100` (em decimal),  
ou
- manter `structurePct` como fixo+variável+financeiro e documentar que, para INDUSTRIALIZACAO/SERVICO, o caller deve somar `indirectLaborPct` ao percentual de estrutura antes de chamar `calculatePricing`.

**Conclusão:** ⚠️ **Atenção** — Sem dupla contagem; porém MO administrativa % não está no coeficiente (possível bug de subprecificação).

---

## PERGUNTA 5 — Configurações fiscais: PATCH sem campos inválidos

**Arquivos:** `src/pages/configuracoes/index.tsx`, `src/pages/onboarding.tsx`

### 5.1 Campos enviados no PATCH (configuracoes) — tenant_settings

**Função:** `handleSaveTax` (linhas 358-386).

`updateData` base:

- `tax_regime`
- `state_code`
- `simples_revenue_12m`
- `updated_at`

Condicionais:

- Se regime === 'SIMPLES_NACIONAL': `simples_anexo`
- Se regime === 'LUCRO_PRESUMIDO': `lucro_presumido_activity`
- Se regime === 'LUCRO_PRESUMIDO_RET': `ret_rate` (em decimal)

**Conclusão:** ✅ OK — Lista explícita e condicional; sem campos aleatórios.

---

### 5.2 revenue_period_months no payload (configuracoes)

Não há referência a `revenue_period_months` em `handleSaveTax` nem em nenhum outro `updateData` de `tenant_settings` neste arquivo.

**Conclusão:** ✅ OK — `revenue_period_months` não é enviado.

---

### 5.3 Onboarding — payload para tenant_settings

O onboarding não faz PATCH direto em `tenant_settings`. Chama `POST /api/onboarding/complete` com objeto `settings` (linhas 416-436), que inclui, entre outros:

- tax_regime, calc_type, simples_anexo, simples_revenue_12m, ret_rate  
- cnae_code, icms_contribuinte, inscricao_estadual, ie_state_code  
- sales_scope, buyer_type  
- workload_unit, monthly_workload, num_productive_employees, num_commercial_employees, num_administrative_employees, administrative_monthly_workload  

Não há `revenue_period_months` nesse payload.

**Conclusão:** ✅ OK — Onboarding também não envia `revenue_period_months`.

---

### 5.4 Conferência com colunas reais de tenant_settings

Conferência feita via `information_schema.columns` para `tenant_settings`. Todos os campos usados em configuracoes (tax_regime, state_code, simples_revenue_12m, simples_anexo, lucro_presumido_activity, ret_rate, updated_at) existem na tabela. O onboarding envia campos que também existem (incl. workload_unit, monthly_workload, num_*_employees, etc.). Não existe coluna `revenue_period_months` na tabela.

**Conclusão:** ✅ OK — Payloads batem com colunas existentes; nenhum campo inválido identificado.

---

# Resumo dos achados

| # | Item | Status | Observação |
|---|------|--------|------------|
| 1 | Aba Restituição — origem dos valores | ✅ OK | tax_restitution_entries + estado local |
| 1 | Botão Calcular automaticamente | ✅ OK | cash_entries + tenant_settings + brazilian_states |
| 1 | total_purchases (expense_groups) | ✅ OK | DESPESA_VARIAVEL + MAO_DE_OBRA_PRODUTIVA |
| 1 | Créditos PIS/COFINS/ICMS | ✅ OK | Fórmulas corretas |
| 1 | Salvar estimativa | ✅ OK | Upsert em tax_restitution_entries |
| 2 | Estrutura tax_restitution_entries | ✅ OK | Colunas e tipos corretos |
| 2 | RLS / users | ✅ OK | Policy usa public.users |
| 2 | Índice (tenant_id, reference_month) | ✅ OK | Presente |
| 2 | UNIQUE (tenant_id, reference_month) | ⚠️ Atenção | Não existe; recomendado adicionar |
| 3 | monthlyRevenue === 0 | ✅ OK | return null antes de qualquer divisão |
| 3 | productiveMonthCount === 0 | ✅ OK | Fallback 1 |
| 3 | Fallback receita | ✅ OK | max(fluxo, simples/12) |
| 4 | MO produtiva só no CMV | ✅ OK | Sem dupla contagem |
| 4 | MO administrativa no coeficiente | ⚠️ Atenção | Não está no coeficiente (possível subprecificação) |
| 4 | setProductPriceInfo indirectLaborPct | ✅ OK | Recebe calcBase.indirectLaborPct |
| 5 | PATCH configuracoes | ✅ OK | Campos corretos |
| 5 | revenue_period_months | ✅ OK | Não enviado (config e onboarding) |
| 5 | Colunas tenant_settings | ✅ OK | Payloads compatíveis |

---

**Recomendações técnicas:**

1. **Migration:** Adicionar UNIQUE(tenant_id, reference_month) em `tax_restitution_entries`.
2. **Precificação:** Definir se MO administrativa (%) deve entrar no coeficiente; se sim, incluir `indirectLaborPct` no `structurePct` passado ao motor em `content.component.tsx` (ou equivalente) para INDUSTRIALIZACAO/SERVICO.

— Orion, orquestrando o sistema
