# Como chegam os % de Despesas Fixas, Variáveis e Financeiras na precificação

Este documento explica **valor por valor** como o sistema calcula ou usa os percentuais de **Despesas fixas**, **Despesas variáveis** e **Despesas financeiras** que entram na precificação dos produtos/serviços.

---

## 1. De onde vêm esses percentuais?

Eles vêm da tabela **`tenant_expense_config`** (Configurações > Custos e Despesas):

| Campo no banco              | Nome na tela           | Significado                                      |
|----------------------------|------------------------|--------------------------------------------------|
| `fixed_expense_percent`    | Despesas Fixas (%)     | % do faturamento que você usa em despesas fixas  |
| `variable_expense_percent` | Despesas Variáveis (%) | % do faturamento em despesas variáveis           |
| `financial_expense_percent`| Despesas Financeiras (%) | % do faturamento em despesas financeiras       |

Você pode:

1. **Digitar manualmente** em Configurações > Custos e Despesas (campos em %).
2. **Recalcular a partir do Fluxo de Caixa**: o sistema soma as despesas dos últimos 12 meses por tipo e divide pela receita mensal para obter cada %.

---

## 2. Cálculo quando você usa “Recalcular do Fluxo de Caixa”

O sistema usa a função **`recalcExpenseConfigFromCashflow`** (arquivo `src/utils/recalc-expense-config.ts`).

### Passo a passo

1. **Janela de dados**  
   - Considera apenas **despesas** (`cash_entries` com `type = 'EXPENSE'`) dos **últimos 12 meses** (pela `due_date`).  
   - Só entra despesa que tiver **`expense_group`** preenchido.

2. **Contagem de meses**  
   - Conta **quantos meses distintos** têm pelo menos uma despesa nessa janela.  
   - Exemplo: se há despesas em jan, fev, mar, …, dez, são 12 meses.  
   - Esse número é usado como divisor para “média mensal” (abaixo chamado de `monthCount`).

3. **Receita mensal (média mensal)**  
   A média mensal da receita vem **sempre** do que foi preenchido no **onboarding** ou em **Configurações** (`tenant_settings`):
   - **Valor total** = `simples_revenue_12m` (valor total do faturamento no período).
   - **Quantidade de meses** = `revenue_period_months` (ex.: 12 para “total dos últimos 12 meses”, 6 para “total dos últimos 6 meses”).
   - **Média mensal** = `simples_revenue_12m ÷ revenue_period_months`.  
   Ex.: total 12 meses = 600.000 e `revenue_period_months = 12` → média mensal = 50.000.  
   Se o faturamento **não** estiver preenchido no onboarding/config, o recálculo **não é feito** (retorna null).

4. **Soma das despesas por tipo**  
   Cada lançamento de despesa tem um **`expense_group`** (tipo de despesa). O sistema soma o **valor** (`amount`) de todas as despesas de cada tipo:

   - **DESPESA_FIXA** → soma vai para **Despesas fixas** (ex.: aluguel, luz, água, internet, contador, seguros).
   - **DESPESA_VARIAVEL** → soma vai para **Despesas variáveis** (ex.: embalagens, matéria-prima, marketing, frete).
   - **DESPESA_FINANCEIRA** → soma vai para **Despesas financeiras** (ex.: taxa de cartão, tarifas bancárias, juros).

5. **Média mensal de cada tipo**  
   - **Total fixas** = soma de todos os `amount` com `expense_group = 'DESPESA_FIXA'`.  
   - **Total variáveis** = soma com `expense_group = 'DESPESA_VARIAVEL'`.  
   - **Total financeiras** = soma com `expense_group = 'DESPESA_FINANCEIRA'`.  

   Aí divide cada total pelo **número de meses** (passo 2):

   - `média_fixas_mês = total_fixas ÷ monthCount`
   - `média_variáveis_mês = total_variáveis ÷ monthCount`
   - `média_financeiras_mês = total_financeiras ÷ monthCount`

6. **Fórmula dos percentuais**  
   **Total da despesa ÷ média mensal × 100 = %** (onde “total da despesa” é convertido em média mensal da despesa):

   ```
   média_mensal_despesa = total_da_despesa_no_período ÷ monthCount
   % = (média_mensal_despesa ÷ média_mensal_receita) × 100
   ```

   Ou seja:
   - Despesas Fixas (%)       = (média_fixas_mês     ÷ receita_mensal) × 100
   - Despesas Variáveis (%)   = (média_variáveis_mês ÷ receita_mensal) × 100
   - Despesas Financeiras (%) = (média_financeiras_mês ÷ receita_mensal) × 100

   O resultado é limitado a no máximo **100%** por tipo e arredondado em 2 casas. Esses valores são salvos em `tenant_expense_config` como `fixed_expense_percent`, `variable_expense_percent` e `financial_expense_percent`.

### Exemplo numérico (Recalcular do Fluxo)

- **Últimos 12 meses**: 12 meses com despesas.
- **Receita mensal** (faturamento de referência): R$ 50.000 (ou 600.000/12).
- **Soma das despesas nos 12 meses**:  
  - Fixas: R$ 120.000 → média mensal = 120.000 ÷ 12 = **R$ 10.000**  
  - Variáveis: R$ 60.000 → média mensal = **R$ 5.000**  
  - Financeiras: R$ 3.000 → média mensal = **R$ 250**

Cálculo dos %:

- **Despesas Fixas** = (10.000 ÷ 50.000) × 100 = **20%**
- **Despesas Variáveis** = (5.000 ÷ 50.000) × 100 = **10%**
- **Despesas Financeiras** = (250 ÷ 50.000) × 100 = **0,5%**

Esses 20%, 10% e 0,5% são os que aparecem em Configurações e entram na precificação.

---

## 3. Como esses % entram na precificação (fórmula do preço)

O motor de precificação usa um **coeficiente** que é “a fatia do preço que sobra para cobrir custo + margem”. Todas as despesas e margens são percentuais **sobre o preço de venda**.

### Estrutura (structurePct)

O sistema junta os três tipos de despesa em um único número chamado **estrutura**:

```
estrutura (%) = Despesas Fixas (%) + Despesas Variáveis (%) + Despesas Financeiras (%)
```

No código isso vem de **`build-calc-base.ts`**:

- `structurePct` = `fixed_expense_percent + variable_expense_percent + financial_expense_percent`  
- Esse valor é passado para o motor em **decimal** (dividido por 100 quando for calcular).

Ou seja, no exemplo acima:  
estrutura = 20 + 10 + 0,5 = **30,5%** do preço.

### Coeficiente e preço unitário

O motor usa (em `src/utils/pricing-engine.ts`):

- **laborPct** = % de mão de obra (já em decimal, ex.: 0,0322 para 3,22%).
- **structurePct** = estrutura em decimal (ex.: 0,305 para 30,5%).
- **taxPct**, **commissionPct**, **profitPct** = imposto, comissão e lucro em decimal.

Fórmula:

```
coeficiente = 1 − (laborPct + structurePct + taxPct + commissionPct + profitPct)
```

O **preço unitário** é:

```
preço_unitário = custo_unitário_dos_itens ÷ coeficiente
```

Ou seja: o preço é o custo “inflado” para que, quando você tirar do preço todos esses %, sobre o preço (mão de obra, despesas fixas, variáveis, financeiras, imposto, comissão, lucro), reste exatamente o custo.

### Valor em R$ de cada despesa no preço

No preço final, a parte em **reais** que corresponde a cada tipo de despesa é:

```
Despesas fixas (R$)      = preço_unitário × (Despesas Fixas % ÷ 100)
Despesas variáveis (R$)  = preço_unitário × (Despesas Variáveis % ÷ 100)
Despesas financeiras (R$) = preço_unitário × (Despesas Financeiras % ÷ 100)
```

Ou seja: o **percentual** que você configurou (manual ou recalculado do fluxo) é aplicado **em cima do preço de venda** daquele produto/serviço.

---

## 4. Resumo em uma frase por conceito

| O quê | Como |
|-------|------|
| **Despesas Fixas (%)** | No “Recalcular do Fluxo”: (média mensal das despesas com `DESPESA_FIXA`) ÷ receita mensal × 100. Manual: o número que você digita em Configurações. |
| **Despesas Variáveis (%)** | No “Recalcular do Fluxo”: (média mensal das despesas com `DESPESA_VARIAVEL`) ÷ receita mensal × 100. Manual: o número que você digita. |
| **Despesas Financeiras (%)** | No “Recalcular do Fluxo”: (média mensal das despesas com `DESPESA_FINANCEIRA`) ÷ receita mensal × 100. Manual: o número que você digita. |
| **Uso na precificação** | Estrutura = Fixas + Variáveis + Financeiras (em %). Coeficiente = 1 − (mão de obra% + estrutura% + imposto% + comissão% + lucro%). Preço = custo unitário ÷ coeficiente. O valor em R$ de cada despesa no preço = preço unitário × (respectivo % ÷ 100). |

Assim você consegue reproduzir no sistema (e fora dele) exatamente como cada valor é obtido e como chega no preço final.
