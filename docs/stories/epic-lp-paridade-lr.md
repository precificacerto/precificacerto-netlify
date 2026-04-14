# Epic: Lucro Presumido — Paridade Total com Lucro Real

**ID:** LP-PARIDADE-LR
**Status:** Done
**Data:** 2026-04-14
**Regime:** Lucro Presumido (LUCRO_PRESUMIDO)

---

## Objetivo

Espelhar no regime **Lucro Presumido** TODAS as funcionalidades do **Lucro Real**: onboarding, configurações, produtos, serviços, formulário de itens (com ICMS diferido e custo líquido), cálculo do preço de venda (atividades terceirizadas, impostos por fora, margem de contribuição), motor de precificação (adicional IRPJ 2 passos), modal de lançamento de impostos, fluxo de caixa e dashboard. O Lucro Real não deve ser alterado — apenas o Lucro Presumido deve ser expandido.

---

## Regras Críticas (não violar)

- **Não alterar nenhuma lógica existente do Lucro Real** — qualquer condição `isLucroReal` só deve ser estendida para `isLucroReal || isLucroPresumido` quando explicitamente indicado na story
- **`taxes_launched` é opcional no LP** — produto/serviço fica ativo normalmente se não preencher impostos (diferente do LR onde pode bloquear)
- **Créditos tributários no LP são somente ICMS** — não incluir PIS/COFINS/IPI nos créditos do LP
- **`additional_irpj_percent` no LP** — mesmo campo manual igual ao LR
- **PIS/COFINS no formulário de itens LP** — permanecem exclusivos do LR (regime cumulativo LP não tem crédito de PIS/COFINS)
- **NCM auto-fill no formulário de itens LP** — não preencher alíquotas PIS/COFINS para LP (são fixas 0.65%/3%), apenas ICMS se disponível

---

## Histórias do Epic

| ID | Título | Status | Prioridade |
|----|--------|--------|------------|
| LP-PARIDADE-LR-001 | Onboarding e Configurações: campos IBS/CBS para LP | Done | Alta |
| LP-PARIDADE-LR-002 | Produtos: paridade de campos e impostos com LR | Done | Alta |
| LP-PARIDADE-LR-003 | Serviços: paridade de campos e impostos com LR | Done | Alta |
| LP-PARIDADE-LR-004 | Itens: crédito de ICMS e custo líquido para LP | Done | Alta |
| LP-PARIDADE-LR-005 | Fluxo de Caixa: categorias de despesas LP com paridade LR | Done | Média |
| LP-PARIDADE-LR-006 | Dashboard: widget de restituições de ICMS para LP | Done | Média |
| LP-PARIDADE-LR-007 | Precificação (product-price): atividades terceirizadas e impostos por fora para LP | Done | Alta |
| LP-PARIDADE-LR-008 | Formulário de Itens: ICMS diferido e custo líquido para LP | Done | Alta |
| LP-PARIDADE-LR-009 | Motor de Precificação (Edge Function): adicional IRPJ 2 passos para LP | Done | Alta |

---

---

# Story LP-PARIDADE-LR-001
## Onboarding e Configurações: Campos IBS/CBS para Lucro Presumido

**Status:** Ready
**Arquivos principais:**
- `src/pages/onboarding.tsx`
- `src/pages/configuracoes/index.tsx`

---

### Contexto de Negócio

Atualmente os campos `ibs_reference_pct` (alíquota de referência IBS) e `cbs_reference_pct` (alíquota de referência CBS) só são salvos e exibidos para o regime Lucro Real. Com a reforma tributária, o Lucro Presumido também será impactado pelo IBS e CBS. Os campos devem ser disponibilizados para LP com a mesma UX do LR.

---

### Critérios de Aceitação

- [ ] No onboarding (`onboarding.tsx`), quando o regime selecionado for `LUCRO_PRESUMIDO`, exibir os campos `ibs_reference_pct` e `cbs_reference_pct` (mesmos campos já exibidos para `LUCRO_REAL`)
- [ ] Ao salvar o onboarding com regime LP, os valores de `ibs_reference_pct` e `cbs_reference_pct` são persistidos em `tenant_settings` (remover a condição que só salva para LR nas linhas 434-435)
- [ ] Em `configuracoes/index.tsx`, quando `isLP === true`, exibir os mesmos campos IBS/CBS que aparecem para `isLR === true`
- [ ] Ao salvar as configurações com regime LP, os valores IBS/CBS são persistidos (linha 543 atual só salva para LR — estender para LP)
- [ ] Os campos são opcionais (não bloquear save se não preenchidos)

---

### Tarefas de Implementação

- [ ] **T1** — Em `onboarding.tsx` linha 243, adicionar `const isLucroPresumido = taxRegime === 'LUCRO_PRESUMIDO'` (ou estender `isLucroReal` → `isLucroRealOrLP`)
- [ ] **T2** — Localizar o bloco JSX de `ibs_reference_pct` / `cbs_reference_pct` no onboarding (por volta da linha 1062) e tornar condicional para `isLucroReal || isLucroPresumido`
- [ ] **T3** — Em `onboarding.tsx` linhas 434-435, alterar a condição de save:
  ```typescript
  // Antes:
  ibs_reference_pct: tax.tax_regime === 'LUCRO_REAL' ? (tax.ibs_reference_pct ?? null) : null,
  cbs_reference_pct: tax.tax_regime === 'LUCRO_REAL' ? (tax.cbs_reference_pct ?? null) : null,
  // Depois:
  ibs_reference_pct: (tax.tax_regime === 'LUCRO_REAL' || tax.tax_regime === 'LUCRO_PRESUMIDO') ? (tax.ibs_reference_pct ?? null) : null,
  cbs_reference_pct: (tax.tax_regime === 'LUCRO_REAL' || tax.tax_regime === 'LUCRO_PRESUMIDO') ? (tax.cbs_reference_pct ?? null) : null,
  ```
- [ ] **T4** — Em `configuracoes/index.tsx`, localizar o bloco JSX dos campos IBS/CBS (linha ~366) e tornar visível para `isLP || isLR`
- [ ] **T5** — Em `configuracoes/index.tsx` linha ~543, estender o save de IBS/CBS para LP:
  ```typescript
  if (values.regime === 'LUCRO_REAL' || values.regime === 'LUCRO_PRESUMIDO') {
    updateData.ibs_reference_pct = values.ibs_reference_pct != null ? Number(values.ibs_reference_pct) : null
    updateData.cbs_reference_pct = values.cbs_reference_pct != null ? Number(values.cbs_reference_pct) : null
  }
  ```
- [ ] **T6** — Testar: onboarding com LP → campos IBS/CBS aparecem → valores salvos; configurações com LP → idem

---

### Arquivos Afetados

- `src/pages/onboarding.tsx`
- `src/pages/configuracoes/index.tsx`

---

---

# Story LP-PARIDADE-LR-002
## Produtos: Paridade de Campos e Impostos com Lucro Real

**Status:** Ready
**Arquivos principais:**
- `src/page-parts/products/content.component.tsx`
- `src/page-parts/products/product-price.component.tsx` (leitura)

---

### Contexto de Negócio

O regime Lucro Real possui, no cadastro de produtos, campos e comportamentos que o Lucro Presumido não tem: seção de impostos (`taxes_launched`, `additional_irpj_percent`, `valor_precificado_icms_piscofins`), auto-preenchimento de ICMS ao cadastrar produto, e exibição da seção de impostos na UI. Tudo isso deve estar disponível para LP.

**Regra sobre `taxes_launched` no LP:** diferente do LR (onde o produto pode bloquear exibição em agenda/vendas), no LP o produto fica ativo normalmente mesmo sem preencher os impostos. O `taxes_launched` no LP é informativo/opcional.

---

### Critérios de Aceitação

- [ ] Ao criar ou editar um produto no regime LP, a seção de impostos (campos de `additional_irpj_percent`, visualização de `valor_precificado_icms_piscofins`) é exibida (igual ao LR — linha 1679 do `content.component.tsx`)
- [ ] O campo `additional_irpj_percent` é salvo no banco para LP (linha 859 atualmente não tem restrição de regime — confirmar que salva para LP também)
- [ ] O campo `valor_precificado_icms_piscofins` é calculado e salvo para LP (linha 890 — verificar se já salva para LP)
- [ ] O campo `taxes_launched` é salvo como `true` ao salvar produto com LP (linha 879), mas **não bloqueia** a exibição do produto em agenda/vendas para LP
- [ ] O auto-preenchimento de ICMS ao selecionar estado/NCM (linhas 173-199, lógica `if (!isLucroRealProd) return`) passa a funcionar para LP também
- [ ] O cálculo de `additionalIrpjPercent` na alíquota efetiva (linha 555: `const adicionalPct = isLucroRealProd ? (additionalIrpjPercent || 0) : 0`) passa a usar o valor configurado para LP também:
  ```typescript
  const adicionalPct = (isLucroRealProd || isLucroPresumidoProd) ? (additionalIrpjPercent || 0) : 0
  ```

---

### Tarefas de Implementação

- [ ] **T1** — Em `content.component.tsx` linha 167, adicionar:
  ```typescript
  const isLucroRealProd = currentUser?.taxableRegime === 'LUCRO_REAL'
  const isLucroPresumidoProd = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
  const isLRorLP = isLucroRealProd || isLucroPresumidoProd
  ```
- [ ] **T2** — Linha 174: substituir `if (!isLucroRealProd) return` por `if (!isLRorLP) return` no efeito de auto-preenchimento de ICMS/IBS/CBS
- [ ] **T3** — Linha 202: substituir `[isLucroRealProd, ...]` por `[isLRorLP, ...]` nas dependências do useEffect
- [ ] **T4** — Linha 227: substituir `if (isLucroRealProd)` por `if (isLRorLP)` na lógica de carga de IBS/CBS rates
- [ ] **T5** — Linha 366: substituir `if (!isLucroRealProd || !code) return` por `if (!isLRorLP || !code) return` no fetch de NCM rates
- [ ] **T6** — Linha 555: substituir `const adicionalPct = isLucroRealProd ? (additionalIrpjPercent || 0) : 0` por `const adicionalPct = isLRorLP ? (additionalIrpjPercent || 0) : 0`
- [ ] **T7** — Linha 765: estender `const isLucroRealSave = currentUser?.taxableRegime === 'LUCRO_REAL'` para `const isLucroRealSave = currentUser?.taxableRegime === 'LUCRO_REAL' || currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'` nas lógicas de cálculo de terceirizadas no save
- [ ] **T8** — Linha 840: verificar se o bloco `if (isLucroRealProd)` para salvar `taxes_launched`, `additional_irpj_percent` e `valor_precificado_icms_piscofins` pode ser estendido para `if (isLRorLP)`. Para LP, `taxes_launched = true` mas **não deve bloquear** visibilidade (ajustar quaisquer gates de visibilidade que verifiquem `taxes_launched`)
- [ ] **T9** — Linha 1679: substituir `{isLucroRealProd && (` por `{isLRorLP && (` para exibir a seção de impostos na UI para LP
- [ ] **T10** — Verificar se há condicionais de bloqueio de agenda/vendas baseadas em `taxes_launched` para garantir que o LP não seja bloqueado (buscar `taxes_launched` em `src/pages/agenda/` e `src/pages/relatorio-vendas/`)
- [ ] **T11** — Testar: criar produto LP → seção impostos aparece → additional_irpj preenchível → auto-fill ICMS funciona → produto salvo → visível na agenda normalmente

---

### Arquivos Afetados

- `src/page-parts/products/content.component.tsx`
- `src/pages/agenda/index.tsx` (verificação de taxes_launched)
- `src/pages/relatorio-vendas/index.tsx` (verificação de taxes_launched)

---

---

# Story LP-PARIDADE-LR-003
## Serviços: Paridade de Campos e Impostos com Lucro Real

**Status:** Ready
**Arquivos principais:**
- Componente de conteúdo de serviços (equivalente ao `content.component.tsx` de produtos, verificar localização exata)

---

### Contexto de Negócio

Idêntico à story LP-002, mas aplicado ao cadastro de **serviços**. O regime LP deve ter os mesmos campos e comportamentos que o LR tem nos serviços: `additional_irpj_percent`, `taxes_launched` (opcional/informativo), `valor_precificado_icms_piscofins`, auto-preenchimento de alíquotas e seção de impostos na UI.

---

### Critérios de Aceitação

- [ ] Ao criar ou editar um serviço no regime LP, a seção de impostos é exibida (igual ao LR)
- [ ] `additional_irpj_percent` é preenchível e salvo para serviços LP
- [ ] `valor_precificado_icms_piscofins` é calculado e salvo para serviços LP
- [ ] `taxes_launched` é salvo como `true` ao salvar serviço LP, mas não bloqueia visibilidade
- [ ] Auto-preenchimento de alíquotas (ISS via NBS code, ICMS via estado) funciona para LP igual ao LR
- [ ] Cálculo de `adicionalPct` usa o valor de `additional_irpj_percent` para LP (não retorna 0)

---

### Tarefas de Implementação

- [ ] **T1** — Localizar o componente de conteúdo de serviços (buscar por `isLucroReal` em `src/page-parts/services/` ou `src/pages/servicos/`)
- [ ] **T2** — Aplicar as mesmas substituições da story LP-002 (T1 a T9) no componente de serviços
- [ ] **T3** — Verificar gates de `taxes_launched` para serviços LP (agenda, relatório de vendas) e garantir que não bloqueiam
- [ ] **T4** — Testar: criar serviço LP → seção impostos aparece → campos salvos → serviço visível na agenda normalmente

---

### Arquivos Afetados

- Componente de conteúdo de serviços (localizar em T1)
- `src/pages/agenda/index.tsx` (verificação de taxes_launched)
- `src/pages/relatorio-vendas/index.tsx` (verificação de taxes_launched)

---

---

# Story LP-PARIDADE-LR-004
## Itens: Crédito de ICMS para Lucro Presumido

**Status:** Ready
**Arquivos principais:**
- `src/pages/itens/index.tsx`
- `supabase/functions/calc-tax-engine/index.ts`
- `supabase/migrations/` (nova migration)

---

### Contexto de Negócio

No Lucro Real, itens (insumos) podem ter créditos tributários registrados na tabela `item_tax_credits` (ICMS, PIS/COFINS, IPI, CBS, IBS). Esses créditos são deduzidos do CMV no motor de precificação. Para o Lucro Presumido, o PIS/COFINS é **cumulativo** (sem crédito), mas o **ICMS ainda gera crédito** em compras de insumos/mercadorias. Portanto, o LP deve ter crédito **somente de ICMS**.

---

### Critérios de Aceitação

- [ ] No formulário de item em `itens/index.tsx`, quando o regime for LP, exibir campo de crédito de ICMS (semelhante ao campo de `icms_rate` existente para LR na linha 872)
- [ ] Os campos `icms_rate` e `cost_net` (custo líquido) são salvos para LP (atualmente a linha 872 só salva `icms_rate` para LR)
- [ ] Na tabela `item_tax_credits`, ao salvar um item LP com `icms_rate > 0`, criar/atualizar registro com `tax_type = 'ICMS'` e `credit_value` calculado
- [ ] No motor de precificação (`calc-tax-engine/index.ts`), a lógica de créditos (linhas 82-102) deve ser estendida para LP, mas **somente aplicando créditos de ICMS** (filtrar `tax_type = 'ICMS'`):
  ```typescript
  if (regime === 'LUCRO_REAL' || regime === 'LUCRO_PRESUMIDO') {
    // Para LP: filtrar somente ICMS
    const allowedTypes = regime === 'LUCRO_REAL'
      ? undefined  // sem filtro para LR (todos os tipos)
      : ['ICMS']   // somente ICMS para LP
    const creditsQuery = supabase
      .from('item_tax_credits')
      .select('item_id, tax_type, credit_value, is_active')
      .in('item_id', itemIds)
      .eq('is_active', true)
    if (allowedTypes) creditsQuery.in('tax_type', allowedTypes)
    // ...resto da lógica
  }
  ```
- [ ] Migration SQL: garantir que as colunas `icms_rate`, `cost_net`, `cost_per_base_unit` na tabela `items` não têm restrição de regime (verificar se há CHECK constraints limitando ao LR)

---

### Tarefas de Implementação

- [ ] **T1** — Em `itens/index.tsx` linha 323, estender `const isLucroReal = currentUser?.taxableRegime === 'LUCRO_REAL'` para incluir LP onde necessário: criar `const isLucroRealOrLP = isLucroReal || currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'`
- [ ] **T2** — Linha 326: verificar se a lógica de `cost_net` / custo líquido deve usar `isLucroRealOrLP`
- [ ] **T3** — Linhas 850-875: no save do item, estender as condições para LP salvar `icms_rate` e `cost_net`:
  ```typescript
  const isLucroRealOrLP = isLucroReal || currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
  icms_rate: isLucroRealOrLP ? (Number(values.icms_rate) || 0) : 0,
  cost_net: isLucroRealOrLP ? (Number(values.cost_net) || 0) : 0,
  // PIS/COFINS continuam somente LR:
  pis_rate: isLucroReal ? (Number(values.pis_rate) || 0) : 0,
  cofins_rate: isLucroReal ? (Number(values.cofins_rate) || 0) : 0,
  ```
- [ ] **T4** — Após salvar o item LP com `icms_rate > 0`, upsert na tabela `item_tax_credits`:
  ```typescript
  if (isLucroRealOrLP && savedItem.icms_rate > 0) {
    const icmsCredit = (savedItem.cost_net || 0) * (savedItem.icms_rate / 100)
    await supabase.from('item_tax_credits').upsert({
      item_id: savedItem.id,
      tenant_id: tenantId,
      tax_type: 'ICMS',
      credit_value: icmsCredit,
      is_active: true,
    }, { onConflict: 'item_id,tax_type' })
  }
  ```
- [ ] **T5** — No formulário de item (modal/drawer), exibir campo de `icms_rate` para LP (atualmente mostrado apenas para LR na linha 1077-1078)
- [ ] **T6** — Em `calc-tax-engine/index.ts` linhas 82-102, estender a condição de créditos para LP com filtro de somente ICMS (conforme código no critério de aceitação acima)
- [ ] **T7** — Criar migration: `supabase/migrations/20260414000001_lp_icms_credits.sql`
  ```sql
  -- Garantir que item_tax_credits aceita registros LP (somente ICMS)
  -- Verificar se há constraint CHECK em tax_type e adicionar 'ICMS' para LP se necessário
  -- (provavelmente não há constraint, mas confirmar)
  COMMENT ON TABLE item_tax_credits IS 'Tax credits per item. LR: ICMS/PIS/COFINS/IPI/CBS/IBS. LP: ICMS only.';
  ```
- [ ] **T8** — Testar: criar item LP com ICMS rate 12% → crédito de ICMS salvo em `item_tax_credits` → motor de precificação deduz ICMS do CMV → preço calculado corretamente

---

### Arquivos Afetados

- `src/pages/itens/index.tsx`
- `supabase/functions/calc-tax-engine/index.ts`
- `supabase/migrations/20260414000001_lp_icms_credits.sql` (nova)

---

---

# Story LP-PARIDADE-LR-005
## Fluxo de Caixa: Categorias de Despesas LP com Paridade LR

**Status:** Ready
**Arquivos principais:**
- `src/pages/fluxo-de-caixa/index.tsx`
- `src/constants/cashier-category.ts`
- `src/constants/expense-setup-blocks.ts`
- `src/components/cashflow-setup-modal.component.tsx`

---

### Contexto de Negócio

O Lucro Real possui um conjunto especial de categorias de despesas no fluxo de caixa (`LR_EXPENSE_CATEGORY_OPTIONS`): inclui "Custo dos Produtos", "Atividades Terceirizadas Operacionais de Entrega", "Lucro", "Impostos sobre o Lucro" (IRPJ, CSLL, Adicional IRPJ) e "Impostos sobre o Faturamento Por dentro" (ICMS Próprio, PIS, COFINS). O LP atualmente usa as categorias básicas sem esses grupos de impostos. Para paridade, o LP precisa ter suas próprias categorias incluindo os grupos de impostos adaptados.

**Adaptação para LP:**
- "Impostos sobre o Lucro": IRPJ + CSLL + Adicional IRPJ (igual ao LR)
- "Impostos sobre o Faturamento Por dentro": ICMS Próprio + PIS Cumulativo + COFINS Cumulativo (mesmo grupo, mas os itens refletem regime cumulativo)
- Demais categorias (Custo dos Produtos, Atividades Terceirizadas, Lucro): incluir igual ao LR

---

### Critérios de Aceitação

- [ ] Em `fluxo-de-caixa/index.tsx`, quando `taxRegime === 'LUCRO_PRESUMIDO'`, usar `LP_EXPENSE_CATEGORY_OPTIONS` (novo) em vez do `EXPENSE_CATEGORY_OPTIONS` básico
- [ ] `LP_EXPENSE_CATEGORY_OPTIONS` inclui todos os grupos do `LR_EXPENSE_CATEGORY_OPTIONS`, com os mesmos labels, apenas com as seguintes diferenças de itens onde necessário
- [ ] Em `cashier-category.ts`, a função `getExpenseCategoryOptionsForRegime` retorna os blocos LP corretos para regime `LUCRO_PRESUMIDO`
- [ ] Em `cashflow-setup-modal.component.tsx`, o LP usa `EXPENSE_SETUP_BLOCKS_LP` que já existe — verificar se precisa incluir os blocos de impostos sobre lucro e faturamento por dentro (criar `BLOCK_IMPOSTOS_SOBRE_LUCRO_LP` e `BLOCK_IMPOSTOS_FATURAMENTO_DENTRO_LP` em `expense-setup-blocks.ts` se ainda não existirem)
- [ ] Os lançamentos com categorias "Impostos sobre o Lucro" e "Impostos Faturamento Por dentro" para LP são salvos corretamente e exibidos com as cores corretas (usar as mesmas cores do LR: `IMPOSTO_LUCRO: '#9B1C1C'`, `IMPOSTO_FATURAMENTO_DENTRO: '#C81E1E'`)

---

### Tarefas de Implementação

- [ ] **T1** — Em `expense-setup-blocks.ts`, criar blocos LP específicos para impostos sobre lucro e faturamento (se ainda não existirem):
  ```typescript
  /** Bloco Impostos sobre o Lucro — Lucro Presumido (igual ao LR) */
  export const BLOCK_IMPOSTOS_SOBRE_LUCRO_LP: ExpenseSetupItem[] = [
    { key: 'IMPOSTO_IRPJ', label: 'IRPJ (Imposto de Renda de Pessoa Jurídica)', expense_group: 'IMPOSTO_LUCRO' },
    { key: 'IMPOSTO_CSLL', label: 'CSLL (Contribuição Social sobre o Lucro Líquido)', expense_group: 'IMPOSTO_LUCRO' },
    { key: 'IMPOSTO_ALIQUOTA_ADICIONAL_IRPJ', label: 'Alíquota Adicional da parcela do IRPJ', expense_group: 'IMPOSTO_LUCRO' },
  ]

  /** Bloco Impostos sobre o Faturamento (Por dentro) — Lucro Presumido */
  export const BLOCK_IMPOSTOS_FATURAMENTO_DENTRO_LP: ExpenseSetupItem[] = [
    { key: 'ICMS_PROPRIO', label: 'ICMS Próprio', expense_group: 'IMPOSTO_FATURAMENTO_DENTRO' },
    { key: 'PIS_POR_DENTRO', label: 'PIS (Cumulativo)', expense_group: 'IMPOSTO_FATURAMENTO_DENTRO' },
    { key: 'COFINS_POR_DENTRO', label: 'COFINS (Cumulativo)', expense_group: 'IMPOSTO_FATURAMENTO_DENTRO' },
  ]
  ```
- [ ] **T2** — Verificar `EXPENSE_SETUP_BLOCKS_LP` em `expense-setup-blocks.ts`: adicionar os blocos `BLOCK_IMPOSTOS_SOBRE_LUCRO_LP` e `BLOCK_IMPOSTOS_FATURAMENTO_DENTRO_LP` ao array do LP
- [ ] **T3** — Em `fluxo-de-caixa/index.tsx` linha 465-470, adicionar condição LP:
  ```typescript
  const isLucroReal = taxRegime === 'LUCRO_REAL'
  const isLucroPresumido = taxRegime === 'LUCRO_PRESUMIDO'
  // ...
  : isLucroReal
    ? LR_EXPENSE_CATEGORY_OPTIONS
    : isLucroPresumido
      ? LP_EXPENSE_CATEGORY_OPTIONS  // novo
      : EXPENSE_CATEGORY_OPTIONS
  ```
- [ ] **T4** — Criar `LP_EXPENSE_CATEGORY_OPTIONS` em `fluxo-de-caixa/index.tsx` (ou importar de constante) com os mesmos grupos do LR, adaptado para LP:
  ```typescript
  const LP_EXPENSE_CATEGORY_OPTIONS = [
    { label: '── Custo dos Produtos ──', options: LP_CUSTO_PRODUTOS.map(...) },
    { label: '── Mão de Obra Produtiva ──', ... },
    { label: '── Mão de Obra Administrativa ──', ... },
    { label: '── Despesas Fixas ──', ... },
    { label: '── Despesas Variáveis ──', ... },
    { label: '── Atividades Terceirizadas Operacionais de Entrega ──', ... },
    { label: '── Despesas Financeiras ──', ... },
    { label: '── Comissões ──', ... },
    { label: '── Lucro ──', ... },
    { label: '── Impostos sobre o Lucro ──', options: LP_IMPOSTOS_SOBRE_LUCRO.map(...) },
    { label: '── Impostos sobre o Faturamento (Por dentro) ──', options: LP_IMPOSTOS_FATURAMENTO_DENTRO.map(...) },
    { label: '── Impostos sobre o Faturamento (Por fora) ──', options: LP_IMPOSTOS_FATURAMENTO_FORA.map(...) },
  ]
  ```
- [ ] **T5** — Em `cashier-category.ts` função `getExpenseCategoryOptionsForRegime` (linha 512), adicionar bloco LP para `LUCRO_PRESUMIDO`:
  ```typescript
  if (regime === 'LUCRO_PRESUMIDO') {
    base.push(
      { label: '── Impostos sobre o Lucro ──', options: BLOCK_IMPOSTOS_SOBRE_LUCRO_LP },
      { label: '── Impostos sobre o faturamento (Por dentro) ──', options: BLOCK_IMPOSTOS_FATURAMENTO_DENTRO_LP },
    )
  }
  ```
- [ ] **T6** — Em `cashflow-setup-modal.component.tsx` linha 45, adicionar `'LUCRO_PRESUMIDO'` ao array `LP_REGIMES` para que o modal use `EXPENSE_SETUP_BLOCKS_LP` (verificar se já está incluído ou se está caindo no default do LR)
- [ ] **T7** — Testar: abrir fluxo de caixa LP → categorias de impostos sobre lucro e faturamento disponíveis → lançar despesa IRPJ → aparece com cor correta → salvo corretamente

---

### Arquivos Afetados

- `src/pages/fluxo-de-caixa/index.tsx`
- `src/constants/cashier-category.ts`
- `src/constants/expense-setup-blocks.ts`
- `src/components/cashflow-setup-modal.component.tsx`

---

---

# Story LP-PARIDADE-LR-006
## Dashboard: Widget de Restituições de ICMS para Lucro Presumido

**Status:** Ready
**Arquivos principais:**
- `src/pages/index.tsx`
- `src/components/restitution-summary.component.tsx`

---

### Contexto de Negócio

O dashboard do Lucro Real exibe um widget `RestitutionSummaryCard` que mostra o resumo de créditos tributários (PIS, COFINS, ICMS) do mês a partir da tabela `tax_restitution_entries`. Com o LP passando a ter créditos de ICMS (story LP-004), faz sentido exibir o mesmo widget no dashboard LP, mas mostrando somente o crédito de ICMS (PIS/COFINS serão zero ou nulos para LP).

---

### Critérios de Aceitação

- [ ] No dashboard (`src/pages/index.tsx`), quando `taxableRegime === 'LUCRO_PRESUMIDO'`, buscar dados de `tax_restitution_entries` igual ao LR (linha 129)
- [ ] Exibir o `RestitutionSummaryCard` para LP quando houver dados de restituição (linha 599 — estender para incluir LP)
- [ ] O widget para LP deve exibir somente o campo `icmsCredit` (os campos `pisCredit` e `cofinsCredit` podem ser 0 ou omitidos para LP)
- [ ] Se não houver nenhuma entrada em `tax_restitution_entries` para o LP, o widget não é exibido (comportamento igual ao LR)

---

### Tarefas de Implementação

- [ ] **T1** — Em `src/pages/index.tsx` linha 153, estender condição:
  ```typescript
  // Antes:
  if (ts.tax_regime === 'LUCRO_REAL' && restitutionRes.data && restitutionRes.data.length > 0) {
  // Depois:
  if ((ts.tax_regime === 'LUCRO_REAL' || ts.tax_regime === 'LUCRO_PRESUMIDO') && restitutionRes.data && restitutionRes.data.length > 0) {
  ```
- [ ] **T2** — Em `src/pages/index.tsx` linha 599, estender condição de exibição:
  ```typescript
  // Antes:
  {restitutionSummary && currentUser?.taxableRegime === 'LUCRO_REAL' && (
  // Depois:
  {restitutionSummary && (currentUser?.taxableRegime === 'LUCRO_REAL' || currentUser?.taxableRegime === 'LUCRO_PRESUMIDO') && (
  ```
- [ ] **T3** — Verificar se o componente `RestitutionSummaryCard` aceita props com `pisCredit = 0` e `cofinsCredit = 0` sem quebrar a UI. Se necessário, adaptar o componente para exibir mensagem diferente para LP ("Crédito de ICMS do mês" em vez de título genérico)
- [ ] **T4** — Verificar se `tax_restitution_entries` é populada pelo motor de precificação ou por algum processo que precise ser estendido para LP (verificar se o trigger/função que popula essa tabela filtra por regime)
- [ ] **T5** — Testar: dashboard LP com créditos de ICMS em `tax_restitution_entries` → widget aparece → mostra valor correto de ICMS → sem entradas → widget não aparece

---

### Arquivos Afetados

- `src/pages/index.tsx`
- `src/components/restitution-summary.component.tsx` (possível adaptação de texto)

---

---

---

# Story LP-PARIDADE-LR-007
## Precificação (product-price): Atividades Terceirizadas e Impostos "Por Fora" para LP

**Status:** Ready
**Arquivos principais:**
- `src/page-parts/products/product-price.component.tsx`
- `src/page-parts/products/content.component.tsx` (save do preço com terceirizadas)

---

### Contexto de Negócio

O componente `product-price.component.tsx` exibe o breakdown detalhado do preço de venda. Para Lucro Real, ele inclui:
1. **Atividades Terceirizadas** (frete, seguro, despesas acessórias) adicionadas ao preço base
2. **Impostos "por fora"** (IS, IBS, CBS, IPI) que incidem sobre o preço após ICMS/PIS/COFINS embutidos
3. **Adicional IRPJ** editável (via `additionalIrpjPercent`)
4. **Margem de Contribuição (MC%)** calculada diferente quando há ICMS/PIS-COFINS embutidos

Tudo isso aparece apenas para LR hoje. O LP deve ter a mesma exibição e funcionalidade.

---

### Critérios de Aceitação

- [ ] No `product-price.component.tsx`, `terceirizadasTotal` passa a ser calculado para LP também (linha 110: `isLucroReal` → `isLucroReal || isLucroPresumido`)
- [ ] `finalSalePrice` inclui terceirizadas para LP (`pricePerUnit + terceirizadasTotal`)
- [ ] Os campos IS%, IBS%, CBS%, IPI% (impostos "por fora") são exibidos e editáveis para LP
- [ ] A base IBS/CBS é calculada para LP com a mesma fórmula do LR (deduzindo ICMS e PIS/COFINS embutidos do preço de venda)
- [ ] `adicionalIrpjPct` usa o valor de `additionalIrpjPercent` para LP (linha 142: `isLucroReal` → `isLucroReal || isLucroPresumido`)
- [ ] A `mcPct` (margem de contribuição) usa a fórmula correta para LP: `100 - totalPct - icmsPct (produtos) - pisCofinsLPPct`
- [ ] No `content.component.tsx` linha 766, `isLucroRealSave` é renomeado para `isLucroRealOrLP` e passa a incluir LP para que `terceirizadasSum` seja somada ao `salePriceToSave`
- [ ] O preço salvo no banco (`sale_price`) para LP inclui terceirizadas quando preenchidas

---

### Tarefas de Implementação

- [ ] **T1** — Em `product-price.component.tsx` linha 77-78, verificar que `isLucroPresumed` já inclui LP (já existe: linha 78 tem `taxableRegime === 'LUCRO_PRESUMIDO'`)
- [ ] **T2** — Linha 110: substituir `terceirizadasTotal = isLucroReal ? ...` por `= (isLucroReal || isLucroPresumed) ? ...`
- [ ] **T3** — Linha 120: substituir `const _lrTotalEmb = isLucroReal ? ...` por `= (isLucroReal || isLucroPresumed) ? ...`
- [ ] **T4** — Linha 125: substituir `ibsCbsBase = isLucroReal ? ...` por `= (isLucroReal || isLucroPresumed) ? ...`
- [ ] **T5** — Linha 133: substituir `hasInlineTaxes = isLucroReal && ...` por `= (isLucroReal || isLucroPresumed) && ...`
- [ ] **T6** — Linha 142: substituir `adicionalIrpjPct = isLucroReal ? (additionalIrpjPercent || 0) : 0` por `= (isLucroReal || isLucroPresumed) ? (additionalIrpjPercent || 0) : 0`
- [ ] **T7** — Linha 143: substituir `adicionalIrpjVal = isLucroReal ? ...` por `= (isLucroReal || isLucroPresumed) ? ...`
- [ ] **T8** — Linhas 178-180: adaptar `mcPct` para LP:
  ```typescript
  const mcPct = (isLucroReal || isLucroPresumed)
    ? 100 - totalPct - (isCalcTypeService ? 0 : icmsPct) - pisCofinsLRPct
    : 100 - totalPct
  ```
- [ ] **T9** — Em `content.component.tsx` linha 765-768, estender `isLucroRealSave` para LP:
  ```typescript
  const isLucroRealOrLP = currentUser?.taxableRegime === 'LUCRO_REAL' || currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
  const terceirizadasSum = isLucroRealOrLP
    ? (freightValue || 0) + (insuranceValue || 0) + (accessoryExpensesValue || 0)
    : 0
  ```
- [ ] **T10** — Linha 1023 em `content.component.tsx`: substituir `isLucroRealProd ? finalSalePriceForSave : salePriceToSave` para incluir LP: `(isLucroRealProd || isLucroPresumidoProd) ? finalSalePriceForSave : salePriceToSave`
- [ ] **T11** — Testar: produto LP com frete R$10, IS 1%, IBS 5% → preço inclui terceirizadas e impostos por fora → breakdown exibido corretamente

---

### Arquivos Afetados

- `src/page-parts/products/product-price.component.tsx`
- `src/page-parts/products/content.component.tsx`

---

---

# Story LP-PARIDADE-LR-008
## Formulário de Itens: ICMS Diferido e Custo Líquido para LP

**Status:** Ready
**Arquivos principais:**
- `src/page-parts/items/new-item-form.component.tsx`
- `src/pages/itens/index.tsx`

---

### Contexto de Negócio

O formulário de cadastro de itens (insumos) para Lucro Real possui:
1. **Campo `icms_rate`** — alíquota de ICMS na compra
2. **Switch `icms_deferido_enabled`** + **campo `icms_deferido_rate`** — percentual de diferimento de ICMS
3. **Campos `pis_rate` e `cofins_rate`** — alíquotas PIS/COFINS NÃO-CUMULATIVO (exclusivo LR)
4. **Cálculo de `cost_net`** (`recalcNetCost`) — deduz ICMS + PIS/COFINS do preço de compra para chegar no custo líquido real
5. **`fetchAndFillNcmRates`** — auto-preenche PIS/COFINS não-cumulativo via NCM (exclusivo LR)

Para LP: os campos **1, 2** e o cálculo adaptado de custo líquido (**somente ICMS**, sem PIS/COFINS) devem estar disponíveis. Os campos PIS/COFINS e o fetch de NCM PIS/COFINS permanecem **exclusivos do LR**.

---

### Critérios de Aceitação

- [ ] No formulário de item, quando regime for LP, exibir campos `icms_rate` e `icms_deferido_enabled/rate` (campos 1 e 2 acima)
- [ ] Os campos `pis_rate` e `cofins_rate` **não** aparecem para LP
- [ ] `recalcNetCost()` funciona para LP, mas deduz somente ICMS (sem PIS/COFINS):
  ```typescript
  const recalcNetCost = useCallback(() => {
    if (!isLucroReal && !isLucroPresumido) return  // Adaptado para LP
    const values = form.getFieldsValue()
    const isDeferidoEnabled = Boolean(values.icms_deferido_enabled)
    const priceNum = parseFloat(String(values.price || '0').replace(/\./g, '').replace(',', '.')) || 0
    const icms = Number(values.icms_rate) || 0
    const icmsDeferido = isDeferidoEnabled ? (Number(values.icms_deferido_rate) || 0) : 0
    // Para LP: somente ICMS (sem PIS/COFINS)
    const pis = isLucroReal ? (Number(values.pis_rate) || 0) : 0
    const cofins = isLucroReal ? (Number(values.cofins_rate) || 0) : 0
    // ... resto do cálculo igual
  }, [form, isLucroReal, isLucroPresumido])
  ```
- [ ] `fetchAndFillNcmRates()` continua exclusivo do LR (não busca PIS/COFINS para LP) — verificar condição atual na linha 102
- [ ] Display de `impostosRecuperaveisDisplay` e `netCostDisplay` é exibido para LP
- [ ] O `useEffect` da linha 226 (`if (!isLucroReal) return`) é adaptado para `if (!isLucroReal && !isLucroPresumido) return`

---

### Tarefas de Implementação

- [ ] **T1** — Em `new-item-form.component.tsx` linha 49, adicionar: `const isLucroPresumido = taxableRegime === 'LUCRO_PRESUMIDO'`
- [ ] **T2** — Linha 68: substituir `if (!isLucroReal) return` por `if (!isLucroReal && !isLucroPresumido) return`
- [ ] **T3** — Dentro de `recalcNetCost()` linhas 75-76, tornar PIS/COFINS condicionais ao LR:
  ```typescript
  const pis = isLucroReal ? (Number(values.pis_rate) || 0) : 0
  const cofins = isLucroReal ? (Number(values.cofins_rate) || 0) : 0
  ```
- [ ] **T4** — Linha 102: garantir que `fetchAndFillNcmRates` ainda verifica `!isLucroReal` (não estender para LP — PIS/COFINS não-cumulativo não se aplica)
- [ ] **T5** — Linha 226: substituir `if (!isLucroReal) return` por `if (!isLucroReal && !isLucroPresumido) return`
- [ ] **T6** — No JSX do formulário, localizar o bloco condicional que exibe campos `icms_rate`, `icms_deferido_enabled/rate`, `pis_rate`, `cofins_rate` (por volta das linhas 420-550 do arquivo) e:
  - `icms_rate`: mostrar para `isLucroReal || isLucroPresumido`
  - `icms_deferido_enabled/rate`: mostrar para `isLucroReal || isLucroPresumido`
  - `pis_rate`: manter somente para `isLucroReal`
  - `cofins_rate`: manter somente para `isLucroReal`
- [ ] **T7** — No display de `impostosRecuperaveisDisplay`, adaptar label para LP: para LP mostrar "ICMS recuperável" em vez de "Impostos recuperáveis (ICMS + PIS/COFINS)"
- [ ] **T8** — Em `itens/index.tsx` linha 872, confirmar que `icms_rate` salva para LP (coberto em LP-004-T3)
- [ ] **T9** — Testar: criar item LP → campos ICMS e deferido aparecem → PIS/COFINS não aparecem → custo líquido calculado deduzindo somente ICMS → display correto

---

### Arquivos Afetados

- `src/page-parts/items/new-item-form.component.tsx`
- `src/pages/itens/index.tsx` (save já coberto em LP-004)

---

---

# Story LP-PARIDADE-LR-009
## Motor de Precificação (Edge Function): Adicional IRPJ 2 Passos para LP

**Status:** Ready
**Arquivos principais:**
- `supabase/functions/calc-tax-engine/index.ts`
- `src/utils/calc-tax-preview.ts`

---

### Contexto de Negócio

O motor de precificação (`calc-tax-engine`) usa um **cálculo de 2 passos** para o Lucro Real:
1. **1º passo**: calcula o preço sem adicional IRPJ
2. **2º passo**: calcula o adicional IRPJ (10% sobre lucro > R$20.000/mês) baseado no preço do 1º passo e recalcula o preço final

Atualmente isso está restrito à condição `regime === "LUCRO_REAL"` (linhas 162-171). Para paridade, o LP deve usar o mesmo cálculo de 2 passos — especialmente porque o usuário pode configurar `additional_irpj_percent` manualmente para LP (story LP-002).

Também em `calc-tax-preview.ts`, a lógica de cálculo do LP (linhas 153-221) pode precisar incluir o `additionalIrpjPercent` quando configurado.

---

### Critérios de Aceitação

- [ ] Em `calc-tax-engine/index.ts` linha 162, a condição do 2º passo inclui LP:
  ```typescript
  if ((regime === "LUCRO_REAL" || regime === "LUCRO_PRESUMIDO") && result1.isValid && result1.priceUnit > 0) {
  ```
- [ ] O cálculo do `irpjAdditionalEquiv` (10% sobre lucro excedente a R$20k/mês) funciona identicamente para LP
- [ ] O preço final do LP no motor inclui o adicional IRPJ quando aplicável
- [ ] Em `calc-tax-preview.ts`, a função que calcula LP (linhas ~153-221) passa a aceitar e usar o parâmetro `additionalIrpjPercent` quando fornecido:
  - Se `additionalIrpjPercent > 0`, adicionar ao total efetivo de impostos do LP
  - A função `fetchTaxPreview` passa a receber e repassar esse parâmetro para o regime LP

---

### Tarefas de Implementação

- [ ] **T1** — Em `calc-tax-engine/index.ts` linha 162, substituir `regime === "LUCRO_REAL"` por `(regime === "LUCRO_REAL" || regime === "LUCRO_PRESUMIDO")`
- [ ] **T2** — Verificar que `profitPctFromBody` e `profitPctNorm` estão disponíveis para LP no momento do cálculo (provavelmente já estão, são parâmetros gerais do body)
- [ ] **T3** — Em `calc-tax-preview.ts`, localizar a função do bloco LP (linha ~153):
  ```typescript
  if (regime === 'LUCRO_PRESUMIDO') { ... }
  ```
  Verificar se recebe parâmetro de `additionalIrpjPercent`. Se não, adicionar ao resultado:
  ```typescript
  // Após calcular totalPct para LP
  const additionalIrpj = additionalIrpjPercent || 0
  return {
    ...result,
    totalPct: result.totalPct + additionalIrpj,
  }
  ```
- [ ] **T4** — Verificar chamadas de `fetchTaxPreview` em `content.component.tsx` para garantir que `additionalIrpjPercent` é passado para LP também (linha ~366 do content)
- [ ] **T5** — Testar: produto LP com `additional_irpj_percent = 2%` e lucro projetado alto → motor calcula em 2 passos → adicional IRPJ incluído no preço final

---

### Arquivos Afetados

- `supabase/functions/calc-tax-engine/index.ts`
- `src/utils/calc-tax-preview.ts`

---

## Definição de Pronto (DoD) do Epic

- [ ] Todas as 9 stories com status `Done`
- [ ] Nenhum erro de lint (`npm run lint`)
- [ ] Build sem erros (`npm run build`)
- [ ] Migration SQL aplicada no Supabase (story LP-004)
- [ ] **Lucro Real testado e sem regressões** em todos os fluxos modificados (crítico — não quebrar nada)
- [ ] Lucro Presumido testado nos novos fluxos:
  - [ ] Onboarding com IBS/CBS
  - [ ] Configurações com IBS/CBS
  - [ ] Produto LP: campos impostos, ICMS auto-fill, terceirizadas, impostos por fora, adicional IRPJ
  - [ ] Serviço LP: idem
  - [ ] Item LP: ICMS rate, ICMS diferido, custo líquido (somente ICMS)
  - [ ] Fluxo de caixa LP: categorias IRPJ/CSLL/impostos faturamento por dentro
  - [ ] Dashboard LP: widget restituições ICMS
  - [ ] Motor de precificação LP: adicional IRPJ 2 passos
- [ ] `taxes_launched` no LP **não bloqueia** agenda/vendas (verificação crítica)
