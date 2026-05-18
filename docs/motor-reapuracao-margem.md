# Motor de Reapuração de Margem Operacional (MRM)

**Versão:** 2.0.0 — Maio/2026
**Spec oficial:** `Motor_Reapuracao_Margem_Precifica_Certo.docx` (v1.0)
**Status:** Implementado — rollout big-bang via feature flag

---

## Visão geral

O MRM substitui a lógica anterior de desconto (3 modos: `PROPORTIONAL` / `PROFIT_REDUCTION` / `SELLER_REDUCTION`) por um motor único de reapuração que:

1. **Preserva** custos líquidos (CP), mão de obra direta (MOD) e despesas operacionais (DOP) — imunes ao desconto.
2. **Reapura** sequencialmente impostos por dentro (ICMS → PIS → COFINS → ISS) sobre a nova base operacional.
3. **Redistribui** comissão e lucro proporcionalmente sobre o Resultado Residual Operacional (RRO).
4. **Recalcula** tributos por fora (IPI, ICMS-ST, DIFAL, FCP — extensível para IBS/CBS em 2027) sobre a nova base.
5. **Valida** 6 invariantes (V1-V6) e orienta o usuário quando RRO ≤ 0.

### Diretrizes oficiais (R1-R6)

| ID | Diretriz |
|----|----------|
| R1 | Reforma tributária gradual: ICMS/PIS/COFINS/ISS hoje → IBS/CBS em 2027 (modelo extensível em `tax_rates_periods`) |
| R2 | `PROFIT_REDUCTION` e `SELLER_REDUCTION` descontinuados — toda redução passa pelo motor |
| R3 | Reapuração para TODOS os regimes: MEI, Simples Nacional, Lucro Presumido, Lucro Real |
| R4 | Roda em orçamento, pedido E venda |
| R5 | Se RRO ≤ 0, sistema orienta usuário (não força valor) |
| R6 | MOD imune sem exceções |

---

## Arquitetura

```
UI (orcamentos, pedidos, vendas)
      │
      ▼
useMrmConfig()  →  tenant_expense_config.margin_reapuration_enabled
      │                                  use_snapshot_rates
      ▼
orchestrateReapuration()  ←  prev_breakdown? (snapshot reuse)
      │                       loadTaxRates() → /api/tax-periods
      ▼
calculateMarginReapuration()  (função pura — 11 etapas)
      │
      ▼
TaxBreakdown  →  *_items.tax_breakdown (persistido)
```

### Componentes-chave

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/utils/margin-reapuration.ts` | Motor puro (11 etapas + V1-V6) |
| `src/utils/mrm-orchestrator.ts` | Combina loader + motor + snapshot (D2) |
| `src/utils/mrm-rates-loader.ts` | Cliente para `/api/tax-periods` com cache |
| `src/utils/mrm-feature-flag.ts` | Resolve flag global (env) + override por tenant |
| `src/hooks/use-mrm-config.ts` | Hook React (SWR) para config do tenant |
| `src/types/mrm.ts` | Tipos compartilhados (TaxBreakdown, ReapurationInput, etc) |
| `src/pages/api/tax-periods/index.ts` | GET alíquotas vigentes na data |

### Schema Supabase

| Tabela | Colunas MRM |
|--------|-------------|
| `tax_rates_periods` (nova) | id, tenant_id, tax_type, origin_state, dest_state, rate_pct, valid_from, valid_until, notes |
| `tenant_expense_config` | + `use_snapshot_rates` (D2) + `margin_reapuration_enabled` |
| `budget_items` / `sale_items` / `order_items` | + `commission_pct`, `profit_pct`, `tax_breakdown` (jsonb) |
| `budgets` / `sales` / `orders` | + `engine_version`, `reapuration_status`, `reapuration_errors` |

---

## Fluxo das 11 etapas

1. **Receber RB** (Receita Bruta original)
2. **RV = RB − DESC** (Receita após desconto)
3. **Confirmar RV** como nova âncora da precificação
4. **Reapurar impostos por dentro sequencialmente** (Tabela 13): ICMS sobre RV, PIS sobre (RV − ICMS), COFINS sobre base remanescente, ISS por último
5. **Remover custos líquidos (CP)**
6. **Remover despesas operacionais (DOP)** — MOD imune (R6) é considerada à parte
7. **Calcular RRO** = RV − IMP − CP − MOD − DOP
8. **Validar V1** (RRO > 0). Se falhar: status `RRO_ZERO` / `RRO_NEGATIVE` + mensagem orientativa (R5), motor não força valor
9. **Redistribuir** comissão e lucro proporcionalmente: peso_comm = comm/(comm+lucro), peso_lucro = lucro/(comm+lucro)
10. **Recalcular tributos por fora** sobre base operacional descontada (RV − impostos por dentro)
11. **Validar V2-V6** (consistência fiscal)

### Validações

| ID | Critério |
|----|----------|
| V1 | RRO > 0 (bloqueia/orienta se ≤ 0) |
| V2 | ValorFinal = Base + Tributos por fora |
| V3 | PesoComissao + PesoLucro = 1 |
| V4 | NovaComissao + NovoLucro = RRO |
| V5 | RV < RB (quando desconto > 0) |
| V6 | IMP calculado sobre RV (não RB) |

---

## Feature flag (D4 — rollout big-bang)

Resolução em runtime via `isMrmEnabled(tenantOverride)`:

```
NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED  (env, global)
                  +
tenant_expense_config.margin_reapuration_enabled  (override por tenant)
                  ↓
       enabled / disabled
```

- **Sprint 1-5:** env=`false` em produção, override por tenant em dev/staging.
- **Sprint 6 (GO):** env=`true` em produção. Override por tenant continua válido para opt-out individual emergencial.

### Como ativar

```bash
# Em .env.production
NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED=true
```

Ou via SQL (per-tenant):

```sql
UPDATE public.tenant_expense_config
SET margin_reapuration_enabled = TRUE
WHERE tenant_id = '<uuid-do-tenant>';
```

### Como desativar (rollback emergencial)

```bash
# 1) Tira flag global
NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED=false

# 2) Ou per-tenant:
UPDATE public.tenant_expense_config
SET margin_reapuration_enabled = FALSE
WHERE tenant_id = '<uuid-do-tenant>';
```

Ver `supabase/migrations/rollback_mrm.sql` para reverter persistência (não destrutivo — apenas zera flag).

---

## Snapshot de alíquotas (D2)

Configurável por tenant via `tenant_expense_config.use_snapshot_rates` (default TRUE):

- **TRUE** (default): orçamento "congela" alíquotas vigentes na data de criação em `tax_breakdown`. Edições futuras reusam essas alíquotas — preço estável mesmo se alíquotas servidor mudarem.
- **FALSE**: orçamento sempre recalcula com alíquotas atuais do servidor. Útil para tenants que querem refletir reforma tributária imediatamente.

Lógica em `mrm-orchestrator.ts:orchestrateReapuration()`:

```ts
if (use_snapshot_rates && prev_breakdown?.valid) {
  rates = snapshotToRates(prev_breakdown)   // reusa
} else {
  rates = await loadTaxRates({ date })       // busca atual
}
```

---

## Cutover de dados legados (D1)

Auto-recálculo na próxima edição. Registros pré-MRM são marcados com `engine_version='legacy'` automaticamente (migration `20260518000003`).

Ao abrir um orçamento legado com MRM ativo:
- O modo `PROFIT_REDUCTION`/`SELLER_REDUCTION` é **substituído** por `PROPORTIONAL` no estado local (R2).
- Ao salvar, `discount_mode` vira `'MRM'` e `engine_version` vira `'2.0.0'` automaticamente.

Não há banner manual — auto-recalc silencioso.

---

## Edge function `calc-tax-engine`

**NÃO faz parte do MRM** (decisão D3 — consolidar no cliente). A edge continua servindo precificação inicial em `/produtos` e `/itens`. Não recebe motor de reapuração — fica única source-of-truth para `pricing_calculations`.

---

## Testes

```bash
npm test -- margin-reapuration
npm test -- mrm-orchestrator
```

**28 testes** cobrindo:
- Caso golden Tabela 21 (RB R$10k, desc 10%, RRO R$1.500)
- Sequência ICMS → PIS → COFINS
- R6 MOD imune
- R5 RRO ≤ 0 + mensagem orientativa
- R3 todos os regimes (MEI, SN, LP, LR)
- Snapshot mid-período (D2)
- Effective date propagation

---

## Glossário (resumo da spec)

| Sigla | Significado |
|-------|-------------|
| RB | Receita Bruta original |
| DESC | Valor absoluto do desconto |
| RV | Receita após desconto (RB − DESC) — nova âncora |
| IMP | Total impostos por dentro |
| CP | Custo líquido |
| MOD | Mão de obra direta (imune — R6) |
| DOP | Despesas operacionais |
| RRO | Resultado Residual Operacional (RV − IMP − CP − MOD − DOP) |

---

## Próximos passos (fora do escopo 2026)

- IBS/CBS efetivos (2027+) — modelo `tax_rates_periods` já suporta, só plugar seed
- ISS retido (variante por tomador)
- DRE gerencial integrado ao `tax_breakdown` (relatórios reapurados)

---

## Histórico

- **2026-05-18** — v2.0.0 implementada (Sprints 1-6). Migração do app de Netlify → Vercel (domínio `app.precificacerto.com`).
