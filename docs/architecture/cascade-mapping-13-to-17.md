# Mapeamento Cascade — 13 Etapas (V16) ↔ 17 Etapas (PDF Oficial)

**Status:** Onda 1 — documentação (sem refator de código)
**Data:** 2026-05-28
**Contexto:** Doc Oficial Motor RRO PDF tem 17 etapas; código atual implementa 13. Este mapeamento esclarece a equivalência.

---

## Visão geral

O `cascade_trace` exposto pelo motor V16 (`margin-reapuration.ts:601-820`) tem **13 etapas**. O PDF oficial define **17 etapas obrigatórias**. As 4 "etapas faltantes" são **implícitas** no fluxo atual — elas existem semanticamente mas não aparecem como entrada explícita no trace.

Esta divergência é **arquitetural, não matemática**: o motor V16 produz resultado correto para o caminho item-by-item, mas perde rastreabilidade das etapas de fragmentação/consolidação que o PDF exige.

A Onda 2 (Motor V17) implementará as 17 etapas explicitamente sob a Camada 1 (`consolidateItems` + `applyMotorRRO`).

---

## Tabela de Equivalência

| Etapa PDF | Descrição PDF | Etapa V16 (atual) | Implementação atual | Status |
|:---------:|---------------|:-----------------:|---------------------|:------:|
| **1** | Fragmentação individual dos produtos | — (implícita) | Items separados em `budgets/orders/sales` + `*_items` | ⚠ Implícita |
| **2** | Construção matemática individual | — (implícita) | `pricing_calculations` por produto (V14 snapshot) | ⚠ Implícita |
| **3** | Agrupamento por categorias equivalentes | — (ausente) | Display agrega via `mrm-display-extractor.ts`; motor não consolida | ❌ Ausente |
| **4** | Consolidação dos custos | — (ausente) | Item-by-item; soma só na DRE | ❌ Ausente |
| **5** | Consolidação das despesas | — (ausente) | Item-by-item; soma só na DRE | ❌ Ausente |
| **6** | Consolidação das margens | — (ausente) | Item-by-item; soma só na DRE | ❌ Ausente |
| **7** | Formação Op Interna (Custos+Despesas+Margens+Trib.Int) | 5 — Âncora Interna | `rv × peso_op_interna` (Excel H21 equivalente) | ⚠ Aproximação |
| **8** | Formação Op Externa (+ Trib. Externos) | 13 — Reapuração tributos por fora | Aplicado após RRO (não antes) | ⚠ Ordem diferente |
| **9** | Formação venda consolidada | — (ausente) | RB já vem consolidada na entrada | ⚠ Implícita |
| **10** | Cálculo pesos estruturais (interno + externo) | 4 — Aplicação Peso Op Interna | `peso_op_interna` único (sem `peso_op_externa`) | ⚠ Único peso |
| **11** | Aplicação do desconto sobre total | 2 — Desconto aplicado | `rv = rb − rb × desc` | ✅ Alinhado |
| **12** | Redistribuição proporcional | 4 — Aplicação Peso | `âncora = rv × peso_op_interna` | ✅ Alinhado |
| **13** | Efeito cascata tributário (ICMS→ISS→PIS/COFINS) | 6, 7, 8 | Sequencial, base atualizada (V9-I3) | ✅ Alinhado |
| **14** | Efeito cascata custos e despesas | 9, 10 | -Custos, -Despesas (V9-I3 + V16.3 imutável) | ✅ Alinhado |
| **15** | Resultado Residual Operacional (RRO) | 11 — RRO | `rro = ancora − imp − cp − dop` | ✅ Alinhado |
| **16** | Redistribuição residual final | 12 — Redistribuição proporcional | Usa `commission_pct + profit_pct + ...` (não pesos originais) | ❌ Divergência D1 |
| **17** | Consolidação final | — (implícita) | `total_venda_com_desconto` | ⚠ Implícita |

---

## Resumo de Status

| Status | Quantidade | % do total | Etapas |
|--------|:----------:|:----------:|--------|
| ✅ Alinhado | 5 | 29% | 11, 12, 13, 14, 15 |
| ⚠ Implícita ou aproximada | 7 | 41% | 1, 2, 7, 8, 9, 10, 17 |
| ❌ Ausente ou divergente | 5 | 30% | 3, 4, 5, 6, 16 |

---

## Detalhamento das divergências críticas

### Etapas 3-6: Consolidação cross-produto ausente

**PDF:** após cada produto ter sua estrutura individual completa, o sistema deve **somar por categoria** (todos os custos juntos, todas as MO Admin juntas, etc) ANTES da aplicação do desconto.

**Atual:** cada produto entra no motor isoladamente; a "consolidação" só ocorre no display (`mrm-display-extractor.ts:aggregateCascadeTraces`).

**Impacto matemático:** divergência praticamente nula quando produtos são homogêneos. Pode chegar a 1-4% em orçamentos com produtos de margens muito diferentes + desconto >5%.

**Resolução V17:** Camada 1 implementa `consolidateItems()` explícita.

### Etapa 10: Peso único vs peso duplo

**PDF:** `peso_interno = Op_Interna / (Op_Interna + Op_Externa)` E `peso_externo = Op_Externa / Total`.

**Atual:** apenas `peso_op_interna` é calculado (via markup divisor Excel I21); peso externo é implícito como `1 − peso_interna`.

**Impacto:** quase nulo quando produto não tem tributos externos relevantes (cenário Hyago: peso_interna = 100%).

**Resolução V17:** persistir ambos os pesos no `consolidated_tax_breakdown`.

### Etapa 16: Redistribuição RRO por pesos originais (BLOCKER D1)

**PDF Seção 23:** redistribuição final deve usar **pesos absolutos pré-desconto**:
```
peso_comissao = Comissão_R$_original / Σ(Comissão+Lucro+IRPJ+CSLL)_originais
peso_lucro    = Lucro_R$_original / Σ(...)
peso_irpj     = IRPJ_R$_original / Σ(...)
peso_csll     = CSLL_R$_original / Σ(...)
```

**Atual:** usa `commission_pct + profit_pct + csll_pct + irpj_pct` configurados no produto.

**Impacto:** quando há desconto > 5%, distribuição final diverge. Em cenário Hyago, diferença pode ser R$ 50-200 por orçamento.

**Resolução V17:** persistir pesos originais no `consolidated_tax_breakdown` no momento da redistribuição.

---

## Mapeamento reverso — onde cada etapa V16 vive no código

| Etapa V16 | Arquivo:linha | Função |
|:---------:|---------------|--------|
| 1. Receita Bruta | `margin-reapuration.ts:608-622` | Hardcoded como step da trace |
| 2. Desconto aplicado | `margin-reapuration.ts:624-636` | `desc_value` calculado |
| 3. Receita pós-desconto (RV) | `margin-reapuration.ts:638-650` | `rv = rb − desc_value` |
| 4. Aplicação Peso Op Interna | `margin-reapuration.ts:652-664` | `âncora = rv × peso_op_interna` |
| 5. Âncora Interna | `margin-reapuration.ts:666-678` | Reuso do `âncora` |
| 6. Reapuração ICMS | `margin-reapuration.ts:680-696` | `âncora × icms_rate` |
| 7. Reapuração ISS | `margin-reapuration.ts:698-714` | `(âncora − icms) × iss_rate` |
| 8. Reapuração PIS/COFINS | `margin-reapuration.ts:716-732` | `(âncora − icms) × pis_cofins` (V12 ADR-013) |
| 9. Redução de custos | `margin-reapuration.ts:734-746` | `base − cp_canonical` (V9-I5) |
| 10. Redução de despesas (DOP) | `margin-reapuration.ts:748-810` | `base − dop` (V16.3 imutável); children V10 |
| 11. RRO | `margin-reapuration.ts:812-820` | Step 11 amount ≡ `rro` (V9-I2) |
| 12. Redistribuição proporcional | `margin-reapuration.ts:822-840` | Pesos derivados de pct configurados |
| 13. Reapuração tributos por fora | `margin-reapuration.ts:842-860` | Children por tipo de tributo (V10) |

---

## Próximos passos (Onda 2)

A Camada 1 do Motor V17 (`mrm-engine-v17.ts` proposto) terá **17 funções nomeadas** correspondendo a cada etapa PDF, com docstrings citando este mapeamento. Cada função será testável unitariamente e o `consolidated_tax_breakdown` carregará as 17 etapas explícitas (não 13).

Retrocompatibilidade: motor V16 continua disponível via `motor_version=V16` por tenant; sem deprecation no curto prazo.

---

## Referências

- PDF: `Documentação Oficial - Motor RRO.pdf` (raiz do projeto)
- Código: `src/utils/margin-reapuration.ts` (motor V16)
- Tests: `src/utils/__tests__/margin-reapuration-v9-cascade-sequential.test.ts`
- ADR relacionada: `docs/architecture/adr-015-motor-v17-policies-absorption.md`
