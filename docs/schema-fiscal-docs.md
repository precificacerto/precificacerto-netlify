# 📊 Schema Fiscal — Documentação Completa

> **Data:** 2026-02-13 | **Migration:** `20260213000000_fiscal_tax_engine.sql`

---

## 🏗️ Mapa de Tabelas (42 tabelas total)

### Tabelas de Referência Fiscal (globais, sem tenant)
| # | Tabela | Função |
|---|--------|--------|
| 1 | `brazilian_states` | 27 UFs com alíquota ICMS interna padrão |
| 2 | `icms_interstate_rates` | Alíquotas ICMS interestadual (4%, 7%, 12%) |
| 3 | `ncm_codes` | Códigos NCM com alíquotas IPI, PIS/COFINS, CBS, IBS, MVA |
| 4 | `nbs_codes` | Códigos NBS (serviços) com faixas de ISS |
| 5 | `simples_nacional_brackets` | Faixas do Simples (Anexos I-V) com composição % |
| 6 | `lucro_presumido_rates` | Bases de presunção por atividade |
| 7 | `lucro_real_params` | IRPJ 15%, CSLL 9%, PIS 1,65%, COFINS 7,6% |
| 8 | `tax_update_logs` | Logs de atualização via n8n |
| 9 | `n8n_sync_config` | Config dos webhooks n8n para sync fiscal |

### Tabelas do Tenant
| # | Tabela | Função |
|---|--------|--------|
| 10 | `tenant_settings` | Regime, CNAE, estado, carga horária, WhatsApp |
| 11 | `tenant_expense_config` | % MO indireta, fixa, variável, financeira, comissão, lucro |
| 12 | `items` | Itens com custo bruto/líquido, NCM, NBS, fornecedor |
| 13 | `item_tax_credits` | Créditos por item (ICMS, PIS/COFINS, IPI, CBS, IBS) com acionador |
| 14 | `products` | Produtos com tabelas de preço A/B/C/D, NCM, rendimento |
| 15 | `product_items` | Ficha técnica com créditos calculados por item |
| 16 | `labor_costs` | MO própria/terceirizada por produto |
| 17 | `pricing_calculations` | **Motor principal** — snapshot completo do cálculo |
| 18 | `pricing_history` | Histórico de preços para auditoria |

---

## 🔄 Fluxo de Cálculo por Regime

### Lucro Real (conforme planilha)
```
1. Item cadastrado → NCM busca alíquotas automaticamente (n8n)
2. Acionadores ativam créditos: ICMS, PIS/COFINS, IPI
3. Custo líquido = Custo bruto + IPI custo - Σ créditos
4. CMV = Σ custos líquidos + MO direta
5. Coeficiente = 1 - Σ(desp% + impostos% + comissão% + lucro%)
6. Preço venda = CMV / Coeficiente
7. ICMS/PIS-COFINS calculados "por dentro"
8. CSLL/IRPJ convertidos em equiv. sobre receita
9. CBS/IBS calculados "por fora" (reforma)
```

### Simples Nacional
```
1. Busca faixa pela receita 12 meses → alíquota efetiva
2. Coeficiente usa alíquota DAS unificada (sem créditos individuais)
3. Função: calc_simples_effective_rate(anexo, receita_12m)
```

### Lucro Presumido
```
1. Base presunção IRPJ: 8% (ind/com) ou 32% (serviço)
2. Base presunção CSLL: 12% ou 32%
3. PIS/COFINS cumulativo: 0,65% + 3,00% = 3,65% (sem créditos)
4. ICMS/ISS separados como no Lucro Real
```

---

## 🔗 Integração n8n

### Fluxo de Atualização de Impostos
```
n8n (cron diário/mensal)
  ↓
Busca dados: API IBPT / Sefaz / Receita Federal
  ↓
Webhook → Supabase Edge Function
  ↓
Atualiza tabelas: ncm_codes, icms_interstate_rates, simples_nacional_brackets
  ↓
Registra em: tax_update_logs
  ↓
Recalcula preços dos produtos afetados
```

### Tabelas que o n8n atualiza:
- `ncm_codes` → Alíquotas IPI, PIS/COFINS, MVA, CBS, IBS
- `icms_interstate_rates` → Quando estados mudam alíquotas
- `simples_nacional_brackets` → Quando faixas são atualizadas
- `lucro_presumido_rates` → Alterações nas bases de presunção
- `lucro_real_params` → Quando IRPJ/CSLL/PIS/COFINS mudam

### Config na tabela `n8n_sync_config`:
```json
{
  "config_key": "NCM_SYNC",
  "webhook_url": "https://n8n.example.com/webhook/ncm-update",
  "sync_interval_hours": 168,
  "is_active": true
}
```

---

## 📐 Funções SQL Utilitárias

| Função | Input | Output |
|--------|-------|--------|
| `calc_item_net_cost(item_id)` | UUID do item | Custo líquido (R$) |
| `calc_simples_effective_rate(anexo, receita)` | Anexo + RBT12 | Alíquota efetiva (%) |
| `calc_irpj_csll_equiv(preco, lucro)` | Preço + Lucro | % CSLL, IRPJ, adicional |
