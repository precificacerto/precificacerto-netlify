# Descrição Completa do Sistema Precifica Certo (para contexto de IA)

Este documento descreve o sistema **Precifica Certo** de forma completa: funcionalidades, tabelas do banco de dados, regras de negócio, todos os cálculos (precificação, despesas, impostos) e os regimes tributários. Serve como contexto para uma IA implementar as regras de **Simples Nacional**, **Simples Híbrido**, **Lucro Real** e **Lucro Presumido**.

---

## 1. Visão Geral do Sistema

- **Nome:** Precifica Certo  
- **Tipo:** SaaS B2B multi-tenant para gestão financeira e comercial de pequenos negócios no Brasil.  
- **Stack:** Next.js (Pages Router), React, Ant Design, Supabase (PostgreSQL, Auth, Edge Functions, Storage).  
- **Idioma:** pt-BR.  
- **Multi-tenant:** Toda lógica e dados são isolados por `tenant_id` (uma empresa = um tenant).

**Principais capacidades:**

- Cadastro de itens, produtos (produzido/revenda), serviços.
- Precificação com custo (CMV), despesas (fixas, variáveis, financeiras), mão de obra, impostos (por regime tributário), comissão e lucro.
- Orçamentos e vendas; fluxo de caixa; clientes; funcionários; agenda; relatórios.
- Configuração por tenant: regime tributário, tipo de cálculo (industrialização/revenda/serviço), despesas %, carga horária, etc.

---

## 2. Funcionalidades por Módulo

| Módulo | Descrição |
|--------|-----------|
| **Dashboard** | KPIs (entradas/saídas do mês), gráficos; dados agregados do tenant. |
| **Produtos** | CRUD de produtos; composição por itens (`product_items`); tipo Produzido/Revenda; preço de venda e custo por unidade; cálculo de preço via motor (coeficiente) ou manual. |
| **Serviços** | CRUD de serviços; itens consumidos (`service_items`); preço base e custo; mesma lógica de precificação (estrutura + imposto + comissão + lucro). |
| **Itens** | Insumos/matéria-prima; custo, unidade, `cost_per_base_unit`; vinculados a produtos e serviços. |
| **Estoque** | Saldo atual por item/produto/serviço (`stock`); movimentações. |
| **Orçamentos** | Orçamentos com itens (produtos/serviços), status (rascunho, enviado, aprovado, etc.), vínculo com cliente e venda. |
| **Vendas** | Vendas (balcão ou a partir de orçamento); itens de venda; valor final. |
| **Fluxo de Caixa (Caixa)** | Lançamentos de entrada/saída por mês (`cash_entries`); tipo (INCOME/EXPENSE); categoria; `expense_group` (DESPESA_FIXA, DESPESA_VARIAVEL, DESPESA_FINANCEIRA) para recálculo de despesas. |
| **Clientes** | CRUD; dono opcional (`owner_id` = employee_id); endereço, IE, contribuinte ICMS. |
| **Funcionários** | CRUD; vínculo com `users`; permissões por módulo (Não ver / Visualizar / Editar). |
| **Agenda** | Eventos por usuário; conclusão de serviço e lançamento de pagamento no caixa. |
| **Configurações** | Dados da empresa; **regime tributário**; tipo de cálculo; despesas % (fixas, variáveis, financeiras); mão de obra; recalcular despesas a partir do fluxo de caixa; WhatsApp; etc. |
| **Onboarding** | Fluxo inicial: empresa, endereço, tributação (regime, anexo Simples, faturamento 12m, atividade Lucro Presumido), equipe, conclusão. |

---

## 3. Tabelas do Banco de Dados (Supabase / PostgreSQL)

### 3.1 Tabelas por domínio

**Tenant e configuração**

| Tabela | Finalidade |
|--------|------------|
| `tenants` | Empresa: id, CNPJ/CPF, nome, endereço, etc. |
| `tenant_settings` | Configurações por tenant: **regime tributário**, tipo de cálculo, UF, faturamento 12m, anexo Simples, atividade Lucro Presumido, carga horária, funcionários, ISS, etc. |
| `tenant_expense_config` | Percentuais de despesas e custos: fixas, variáveis, financeiras, mão de obra indireta/produtiva, comissão, lucro, **percentual do regime tributário** (DAS/equivalente). |
| `tenant_invitations` | Convites para usuários entrarem no tenant. |
| `tenant_billing` | Faturamento/assinatura do tenant (Stripe, plano). |

**Usuários e permissões**

| Tabela | Finalidade |
|--------|------------|
| `users` | Usuários do Auth; `tenant_id`, `role` (super_admin, admin, user). |
| `employees` | Funcionários; `tenant_id`, `user_id` (opcional); permissões pendentes. |
| `permissions` | Definição de permissões por módulo. |
| `user_module_permissions` | Permissão por usuário/módulo (Não ver / Visualizar / Editar). |
| `user_item_access` | Acesso a itens específicos (se usado). |
| `user_price_table_access` | Acesso a tabela de preço (A/B/C/D). |

**Cadastros operacionais**

| Tabela | Finalidade |
|--------|------------|
| `items` | Insumos; custo, unidade, `cost_per_base_unit`; tenant. |
| `products` | Produtos; tipo (PRODUZIDO/REVENDA); `sale_price`, `cost_total` (por unidade); `yield_quantity`; tenant. |
| `product_items` | Composição produto → itens; `quantity_needed`; custo por base. |
| `services` | Serviços; preço base, custo; tenant. |
| `service_items` | Itens consumidos por serviço; quantidade, `cost_per_base_unit`. |
| `customers` | Clientes; `owner_id` (employee); endereço, IE, contribuinte ICMS. |
| `suppliers` | Fornecedores (opcional). |

**Comercial e caixa**

| Tabela | Finalidade |
|--------|------------|
| `budgets` | Orçamentos; cliente, status, venda vinculada, criado por. |
| `budget_items` | Itens do orçamento (produto/serviço, quantidade, valor). |
| `sales` | Vendas; valor final, orçamento vinculado. |
| `sale_items` | Itens da venda. |
| `cash_entries` | Lançamentos do fluxo de caixa; tipo INCOME/EXPENSE; valor; data; **expense_group** (DESPESA_FIXA, DESPESA_VARIAVEL, DESPESA_FINANCEIRA) para recálculo de despesas. |
| `cashier_categories` | Categorias de lançamento. |
| `cashier_months` | Metadados do caixa por mês. |

**Estoque**

| Tabela | Finalidade |
|--------|------------|
| `stock` | Saldo atual; tenant; product_id ou item_id ou service_id; quantidade. |
| `stock_movements` | Histórico de movimentações. |

**Precificação e fiscal**

| Tabela | Finalidade |
|--------|------------|
| `pricing_calculations` | Snapshot do último cálculo de preço por produto (e regime); CMV, percentuais, coeficiente, preço unitário, `pct_taxable_regime`, `val_taxable_regime`, etc. |
| `pricing_history` | Histórico de cálculos (auditoria). |
| `labor_costs` | Custos de mão de obra (própria/terceirizada) por tenant/produto. |
| `item_tax_credits` | Créditos tributários por item (ICMS, PIS, COFINS, etc.); acionador ativo/inativo. |
| `fixed_expenses` | Despesas fixas cadastradas (se usado). |

**Referência fiscal (globais, sem tenant)**

| Tabela | Finalidade |
|--------|------------|
| `brazilian_states` | UFs; `code`, `icms_internal_rate` (alíquota interna padrão). |
| `icms_interstate_rates` | Alíquotas interestaduais (origem, destino, %). |
| `simples_nacional_brackets` | Faixas do Simples por anexo; revenue_min/max, nominal_rate, deduction; composição (ICMS, PIS, COFINS, etc.). |
| `lucro_presumido_rates` | Alíquotas por tipo de atividade (INDUSTRIA, COMERCIO, SERVICO_GERAL, etc.): presunção IRPJ/CSLL, alíquotas. |
| `lucro_real_params` | Parâmetros do Lucro Real: alíquotas IRPJ, CSLL, PIS, COFINS; limite adicional IRPJ. |
| `ncm_codes` | NCM (nomenclatura mercosul); PIS/COFINS, IPI, etc. |
| `nbs_codes` | NBS (serviços); ISS. |
| `tax_update_logs` | Log de atualizações fiscais (n8n, etc.). |
| `n8n_sync_config` | Configuração de webhooks n8n. |

**Agenda e outros**

| Tabela | Finalidade |
|--------|------------|
| `calendar_events` | Eventos da agenda; usuário, tenant, tipo. |
| `schedule_employees` | Vínculo evento-funcionário. |
| `completed_services` | Serviços concluídos (agenda). |
| `customer_service_history` | Histórico de serviços por cliente. |
| `customer_attachments` | Anexos do cliente. |
| `message_templates` | Modelos de mensagem (WhatsApp). |
| `whatsapp_dispatches` | Envios WhatsApp. |
| `report_snapshots` | Snapshots de relatórios. |
| `card_anticipations` | Antecipação de recebíveis. |
| `dre_yearly` | DRE anual (se usado). |
| `orders` / `productions` / `production_items` | Pedidos/produção (se usados). |
| `payment_methods` | Formas de pagamento. |
| `allocations`, `automation_rules`, `automation_logs`, `ai_agent_config` | Automações e integrações. |
| `user_sessions`, `tenant_owners` | Sessões e donos do tenant. |
| `user_permissions` | Permissões (legado/alternativo). |
| `item_tax_details` | Detalhes fiscais por item (legado; preferir item_tax_credits). |

---

## 4. Regras de Negócio e Permissões

### 4.1 Roles

- **super_admin:** sem tenant fixo; acesso global (ex.: suporte).  
- **admin:** dono da empresa; vê e edita tudo do tenant.  
- **user:** funcionário; vê conforme permissões por módulo e escopo (ex.: só “seus” clientes).

### 4.2 Permissões por módulo

- **Não ver:** aba não aparece; usuário não acessa a rota.  
- **Visualizar:** só leitura.  
- **Editar:** criar e editar (dentro do escopo).

### 4.3 Escopo por usuário

- **Clientes:** user vê só onde `owner_id = get_my_employee_id()`.  
- **Funcionários:** user vê só a linha onde `employees.user_id = auth.uid()`.  
- **Orçamentos e Vendas:** por tenant (todos da tenant); admin vê tudo.  
- **Agenda:** user vê só seus eventos (`user_id = auth.uid()`).  
- **Relatórios:** `report_snapshots` por `created_by`.  
- **Itens, Produtos, Serviços, Estoque:** por tenant (todos da tenant).

### 4.4 RLS (Row Level Security)

- Maioria das tabelas: filtro por `tenant_id = get_auth_tenant_id()`.  
- Clientes: SELECT/UPDATE/DELETE para não-admin só onde `owner_id = get_my_employee_id()`.  
- Tabelas de referência fiscal (simples_nacional_brackets, lucro_presumido_rates, brazilian_states, etc.): SELECT público (true).

---

## 5. Cálculos do Sistema

### 5.1 Fórmula geral de precificação

O motor de preço está em `src/utils/pricing-engine.ts` e na Edge Function `calc-tax-engine`.  
Todos os percentuais entram em **decimal** (0–1). Ex.: 10% → 0,10.

**Ordem do cálculo:**

1. **CMV por unidade**  
   - Custo dos itens do produto/serviço (por receita) + mão de obra produtiva (minutos × custo por minuto).  
   - `cmvUnit = itemsCostPerUnit + productiveLaborCost`  
   - `productiveLaborCost = productiveLaborMinutes × productiveLaborCostPerMinute`

2. **Comissão e lucro sobre o custo**  
   - `commissionValue = cmvUnit × commissionPct`  
   - `profitValue = cmvUnit × profitPct`  
   - `subtotalAfterCommissionAndProfit = cmvUnit + commissionValue + profitValue`

3. **Mão de obra, estrutura e impostos sobre esse subtotal**  
   - `laborValue = subtotal × laborPct`  
   - `structureValue = subtotal × structurePct`  
   - `taxValue = subtotal × taxPct`  
   - `priceUnit = subtotal + laborValue + structureValue + taxValue`

**Estrutura (structurePct):**

- `structurePct = fixed_expense_percent + variable_expense_percent + financial_expense_percent`  
- Em **REVENDA** entra também `production_labor_percent` na parte exibida/estrutura.  
- Valores vêm de `tenant_expense_config`.

**Imposto (taxPct):**

- Vem do regime tributário (ver seção 6).  
- Único percentual efetivo usado no motor: `taxPct` (decimal).  
- Persistido em `tenant_expense_config.taxable_regime_percent` e em `pricing_calculations.pct_taxable_regime` / `val_taxable_regime`.

### 5.2 Mão de obra

- **Mão de obra indireta:** percentual sobre o preço (incluído em “estrutura” ou tratado separado no front; em `tenant_expense_config`: `indirect_labor_percent` ou `admin_labor_percent`).  
- **Mão de obra produtiva:**  
  - Custo mensal em R$ em `tenant_expense_config.production_labor_cost`.  
  - Carga mensal em minutos: `monthly_workload` (em `tenant_settings`) convertida para minutos conforme `workload_unit` (HOURS → ×60, DAYS → ×480).  
  - Custo por minuto = `production_labor_cost / monthly_workload_minutes`.  
  - Por produto/serviço: `productiveLaborMinutes × costPerMinute` entra no CMV.  
- **Revenda:** pode usar `production_labor_percent` sobre o preço (comportamento específico no front/edge).

### 5.3 Recálculo de despesas a partir do fluxo de caixa

Função: `recalcExpenseConfigFromCashflow` (em `src/utils/recalc-expense-config.ts`).

- **Entrada:** despesas em `cash_entries` (type = 'EXPENSE') com `expense_group` preenchido, últimos 12 meses.  
- **Contagem de meses:** número de meses distintos com pelo menos uma despesa (`monthCount`).  
- **Receita mensal:**  
  - `simples_revenue_12m / revenue_period_months` (média mensal).  
  - `revenue_period_months` e `simples_revenue_12m` em `tenant_settings`.  
- **Soma por tipo:**  
  - DESPESA_FIXA → total fixas  
  - DESPESA_VARIAVEL → total variáveis  
  - DESPESA_FINANCEIRA → total financeiras  
- **Média mensal de cada tipo:** total do tipo ÷ monthCount.  
- **Percentual:**  
  - `fixed_expense_percent = (média_fixas_mês / receita_mensal) × 100`  
  - Idem para variáveis e financeiras.  
- Limite máximo 100% por tipo; arredondamento 2 decimais.  
- Resultado salvo em `tenant_expense_config`.

### 5.4 Coeficiente (compatibilidade)

- `coefficient = subtotalAfterCommissionAndProfit / priceUnit` (fração do preço que é “custo + comissão + lucro”).  
- Usado para exibição e histórico em `pricing_calculations`.

---

## 6. Regimes Tributários (Impostos na Precificação)

O sistema já suporta **MEI**, **SIMPLES_NACIONAL**, **LUCRO_PRESUMIDO** e **LUCRO_REAL**.  
Os enums incluem também **SIMPLES_HIBRIDO** e **LUCRO_PRESUMIDO_RET**, que ainda **não** têm lógica de cálculo implementada.

### 6.1 Enum `tax_regime`

Valores:  
`SIMPLES_NACIONAL` | `LUCRO_PRESUMIDO` | `LUCRO_REAL` | `MEI` | `SIMPLES_HIBRIDO` | `LUCRO_PRESUMIDO_RET`

### 6.2 Onde o imposto é calculado

- **Frontend:** `src/utils/calc-tax-preview.ts` → `fetchTaxPreview(tenantId)`  
- **Auth (perfil):** `src/contexts/auth.context.tsx` → `computeTaxableRegimeValue(settings)`  
- **Edge Function:** `supabase/functions/calc-tax-engine/index.ts` → `computeEffectiveTax(ts, states)`  
- **Configurações:** ao salvar regime/anexo/faturamento, pode ser chamado cálculo da alíquota efetiva do Simples e atualização de `tenant_expense_config.taxable_regime_percent`.

### 6.3 MEI

- Alíquota efetiva = **0%**.  
- Não usa tabelas de faixas.

### 6.4 Simples Nacional (implementado)

- **Fonte:** `tenant_settings`: `tax_regime = 'SIMPLES_NACIONAL'`, `simples_anexo` (I, II, III, IV, V), `simples_revenue_12m`.  
- **Tabela:** `simples_nacional_brackets`  
  - Colunas: `anexo`, `bracket_order`, `revenue_min`, `revenue_max`, `nominal_rate`, `deduction`, e composição (icms_percent, pis_percent, cofins_percent, irpj_percent, csll_percent, cpp_percent, iss_percent, ipi_percent).  
- **Lógica:**  
  1. Normalizar anexo (ex.: "ANEXO_III" → "III").  
  2. Buscar faixa onde `revenue_12m >= revenue_min AND revenue_12m <= revenue_max`.  
  3. Alíquota efetiva:  
     `effectiveRate = (revenue_12m * nominal_rate - deduction) / revenue_12m`  
     (se revenue_12m = 0, usar nominal_rate).  
  4. Percentual para o motor: `effectiveRate * 100` (ex.: 0,12 → 12%).  
- **Função SQL:** `calc_simples_effective_rate(p_anexo, p_revenue_12m)` retorna a alíquota efetiva (0–1).  
- **Uso:** esse percentual é o `taxPct` (em decimal) usado no motor e salvo como “regime tributário” (DAS).

### 6.5 Lucro Presumido (implementado)

- **Fonte:** `tenant_settings`: `tax_regime = 'LUCRO_PRESUMIDO'`, `calc_type` (INDUSTRIALIZACAO | REVENDA | SERVICO), `state_code`, `iss_municipality_rate`, `lucro_presumido_activity`.  
- **Tabelas:**  
  - `brazilian_states`: `icms_internal_rate` para a UF do tenant.  
  - `lucro_presumido_rates`: por `activity_type` (COMERCIO, INDUSTRIA, SERVICO_GERAL, etc.); `irpj_presumption_percent`, `csll_presumption_percent`, `irpj_rate`, `csll_rate`.  
- **Lógica no frontend (`calc-tax-preview.ts`):**  
  - PIS/COFINS: 0,65% + 3% = 3,65% (cumulativo).  
  - ICMS: se calc_type ≠ SERVICO, usar `icms_internal_rate` do estado.  
  - ISS: se calc_type = SERVICO, usar `iss_municipality_rate` (ex.: 5%).  
  - IRPJ: `(irpj_presumption_percent/100) * irpj_rate` (ex.: 8% × 15% = 1,2%).  
  - CSLL: `(csll_presumption_percent/100) * csll_rate` (ex.: 12% × 9% = 1,08%).  
  - Total = PIS+COFINS + ICMS ou ISS + IRPJ + CSLL.  
- **Edge Function:** atualmente usa valores fixos (PIS/COFINS 3,65%; IRPJ 8%×15%; CSLL 12%×9%); não lê `lucro_presumido_rates` por atividade. **Pontos para unificar:** usar mesma tabela e mesma regra de atividade que o front.

### 6.6 Lucro Real (implementado)

- **Fonte:** `tenant_settings`: `tax_regime = 'LUCRO_REAL'`, `calc_type`, `state_code`, `iss_municipality_rate`.  
- **Tabela:** `lucro_real_params`: `irpj_rate`, `irpj_additional_rate`, `irpj_additional_annual_threshold`, `csll_rate`, `pis_rate`, `cofins_rate`.  
- **Lógica (frontend):**  
  - PIS/COFINS: 1,65% + 7,60% = 9,25%.  
  - ICMS/ISS: mesmo critério que Lucro Presumido (por calc_type).  
  - IRPJ: 8% × 15% (equivalente sobre receita; não usa lucro real contábil no motor).  
  - CSLL: 12% × 9%.  
  - Total = soma dos percentuais.  
- **Edge Function:** valores fixos (9,25% PIS/COFINS; IRPJ/CSLL iguais ao Presumido).  
- **Função SQL:** `calc_irpj_csll_equiv` calcula equivalentes sobre receita a partir do lucro (para uso futuro).

### 6.7 Simples Híbrido (a implementar)

- **Enum:** já existe `SIMPLES_HIBRIDO`.  
- **Conceito:** parte da receita no Simples (faixas DAS) e parte tributada fora (ex.: Lucro Real/Presumido para certos produtos/serviços ou receitas).  
- **O que falta:**  
  - Definir regras (quais receitas/produtos entram em cada regime).  
  - Calcular alíquota efetiva ponderada ou dois percentuais (Simples + fora do Simples) e como entram no motor (um único taxPct ou dois campos).  
  - Possível uso de `simples_nacional_brackets` para a parte Simples e `lucro_presumido_rates`/`lucro_real_params` para a parte fora.  
  - Campos em `tenant_settings` (ex.: percentual da receita no Simples, ou critério por CNAE/NCM/NBS).

### 6.8 Lucro Presumido RET (a implementar)

- **Enum:** já existe `LUCRO_PRESUMIDO_RET`.  
- **Conceito:** Lucro Presumido com regime de retenção (ex.: retenção na fonte de IRPJ/CSLL/PIS/COFINS em certas operações).  
- **O que falta:**  
  - Definir quando aplicar RET (por tipo de cliente, operação, etc.).  
  - Ajustar alíquotas ou base de cálculo para considerar retenção (redução do imposto a pagar).  
  - Possível nova tabela ou colunas em `lucro_presumido_rates` para alíquotas/regras RET.  
  - Integrar no `computeEffectiveTax` da edge e no `fetchTaxPreview` do front.

---

## 7. Tipo de Cálculo (calc_type)

- **Enum:** `INDUSTRIALIZACAO` | `REVENDA` | `SERVICO`  
- **Uso:**  
  - **INDUSTRIALIZACAO:** produto produzido; CMV com itens + mão de obra produtiva; ICMS na saída (se regime fora do Simples).  
  - **REVENDA:** produto revendido; pode incluir `production_labor_percent` na estrutura; ICMS se aplicável.  
  - **SERVICO:** não usa ICMS na precificação; usa ISS (`iss_municipality_rate`).  
- Armazenado em `tenant_settings.calc_type` e replicado em `pricing_calculations.calc_type`.

---

## 8. Fluxos Principais

### 8.1 Onboarding

1. Empresa (tenants).  
2. Endereço.  
3. Tributação: regime, se Simples → anexo + faturamento 12m; se Lucro Presumido → atividade; `revenue_period_months`.  
4. Equipe (funcionários, carga).  
5. Salvamento em `tenant_settings` e criação/atualização de `tenant_expense_config` (incluindo `taxable_regime_percent` quando calculado).

### 8.2 Configurações > Custos e Despesas

- Edição manual dos % em `tenant_expense_config`.  
- Botão “Recalcular do Fluxo de Caixa” → `recalcExpenseConfigFromCashflow` → atualiza fixas, variáveis, financeiras (e opcionalmente mantém ou recalcula regime).

### 8.3 Configurações > Regime e Imposto

- Usuário escolhe regime, anexo (Simples), faturamento 12m, atividade (Lucro Presumido).  
- Front chama `fetchTaxPreview` ou calcula alíquota (ex.: Simples pela tabela de faixas) e atualiza `tenant_expense_config.taxable_regime_percent`.  
- Ao salvar, `tenant_settings` é atualizado.

### 8.4 Cálculo de preço de produto (edge function)

1. Request com `tenant_id`, `product_id`, comissão %, lucro %, workload do produto, etc.  
2. Carrega `tenant_settings`, `tenant_expense_config`, produto com `product_items` e itens, `brazilian_states`.  
3. Calcula imposto: `computeEffectiveTax(ts, states)` → taxPct.  
4. Calcula CMV dos itens (cost_per_base_unit ou cost_price/quantity).  
5. Monta structurePct a partir de expense_config (fixas, variáveis, financeiras, mão de obra indireta; revenda com labor %).  
6. Chama `calculatePricing(input)` do motor (pricing-engine).  
7. Persiste em `pricing_calculations` (e opcionalmente `pricing_history`), atualiza `products.sale_price` e `products.cost_total`.

### 8.5 Serviços

- Mesma lógica de coeficiente e percentuais; comissão e lucro por serviço; `taxable_regime_percent` vindo do tenant ou do preview.  
- Não usa edge de produto; cálculo no front com `buildCalcBase` + `calculatePricing` (ou equivalente).

---

## 9. Arquivos de Código Relevantes

| Arquivo | Uso |
|---------|-----|
| `src/utils/pricing-engine.ts` | Motor puro de preço (CMV, comissão, lucro, estrutura, imposto). |
| `src/utils/calc-tax-preview.ts` | Cálculo da alíquota efetiva por regime (Simples, LP, LR) no front. |
| `src/utils/build-calc-base.ts` | Monta base de cálculo a partir de expense_config + tax preview. |
| `src/utils/recalc-expense-config.ts` | Recalcular % de despesas a partir do fluxo de caixa. |
| `src/contexts/auth.context.tsx` | Perfil do usuário; `computeTaxableRegimeValue` para exibir % do regime. |
| `supabase/functions/calc-tax-engine/index.ts` | Edge: carrega dados, calcula imposto, chama motor, persiste pricing_calculations. |
| `supabase/migrations/20260213000000_fiscal_tax_engine.sql` | Criação de tabelas fiscais, enums, simples_nacional_brackets, lucro_presumido_rates, lucro_real_params, pricing_calculations, etc. |
| `src/pages/configuracoes/index.tsx` | Formulário de regime, anexo, faturamento, atividade LP; salvamento em tenant_settings e expense_config. |
| `src/pages/onboarding.tsx` | Onboarding; tributação e revenue_period_months. |
| `docs/CALCULO-DESPESAS-PRECIFICACAO.md` | Documentação dos % de despesas e uso na precificação. |

---

## 10. Resumo para Implementação de Regimes (IA)

- **Simples Nacional:** já implementado; usar `simples_nacional_brackets` + `simples_anexo` + `simples_revenue_12m`; fórmula efetiva `(RBT12 × Aliq - PD) / RBT12`.  
- **Simples Híbrido:** definir critério de repartição (receita/atividade/produto); calcular duas alíquotas (Simples + fora); combinar em um taxPct ou em dois campos e adaptar o motor/UI.  
- **Lucro Presumido:** já implementado; unificar edge com front (ler `lucro_presumido_rates` por `lucro_presumido_activity`; PIS/COFINS 3,65%; ICMS/ISS por calc_type).  
- **Lucro Real:** já implementado; pode evoluir para usar lucro contábil e `calc_irpj_csll_equiv` quando houver DRE por produto.  
- **Lucro Presumido RET:** novo; definir regras de retenção; novo branch em `computeEffectiveTax` e em `fetchTaxPreview`; eventualmente novas colunas ou tabela de parâmetros RET.

Este documento, junto com o código referenciado e as migrações em `supabase/migrations`, deve ser suficiente para uma IA implementar e ajustar as regras dos quatro regimes (Simples, Simples Híbrido, Lucro Real, Lucro Presumido) e a variante RET.
