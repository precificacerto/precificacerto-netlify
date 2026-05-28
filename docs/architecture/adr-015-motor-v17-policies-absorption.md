# ADR-015 — Motor V17: Policies of Absorption (Camada 1 + Camada 2)

**Status:** ACCEPTED (2026-05-28 — confirmado pelo Founder)
**Data:** 2026-05-28
**Revisão:** 2026-05-28 (Founder esclareceu contexto pré-lançamento — estratégia simplificada)
**Stakeholders:** Founder, @architect (Aria), @qa (Quinn), @pm (Morgan), @dev (Dex)
**Supersedes:** —
**Related:** ADR-003 (snapshot imutabilidade), ADR-010 (V9 cascade sequencial), ADR-011 (V10 children), ADR-013 (V12 PIS/COFINS base), V16.3 patch

---

## ⚠️ CONTEXTO CRÍTICO

**Sistema em PRÉ-LANÇAMENTO.** Não há clientes reais em produção — todos os tenants existentes são contas de teste do Founder. Estamos finalizando ajustes antes do lançamento oficial.

**Implicações arquiteturais:**
- ❌ NÃO precisa feature flag por tenant
- ❌ NÃO precisa motores paralelos V16+V17
- ❌ NÃO precisa shadow mode V16↔V17
- ❌ NÃO precisa snapshot freeze de orçamentos legados
- ❌ NÃO precisa migração assistida
- ❌ NÃO precisa tenants beta com convite
- ✅ V17 substitui V16 diretamente (cutover único)
- ✅ Foco em **qualidade do motor antes do lançamento**
- ✅ Aderência ao PDF desde o dia 1

## Decisões Founder confirmadas (2026-05-28 + revisão)

| Q | Decisão |
|---|---------|
| 1 | PDF = verdade normativa do motor (não apenas referência conceitual) |
| 2 | **Camada 2 MVP:** 2 flavors apenas — `RRO_PROPORTIONAL` (default PDF) + `COMMISSION_PROTECTED`. Outras 3 entram conforme demanda real pós-lançamento |
| 3 | **Tenants beta:** ❌ DESCARTADO — não há clientes reais. Substituído por **testes sintéticos abrangentes** baseados em 3 fixtures (SIMPLE, MULTI_PRODUCT usando dados reais de Esquadrias, AGGRESSIVE_DISCOUNT) |
| 4 | **Parecer contábil (D2 efetivas vs nominais):** ADIADO para pós-lançamento — não bloqueia Camada 1 |
| 5 | Snapshot freeze ❌ DESCARTADO — não há orçamentos reais para proteger |
| 6 | **Motor único V17** (cutover direto) — V16 é descontinuado simultaneamente |
| 7 | V16.3 confirmado aderente ao PDF Seção 10 (despesas integrais) — princípio preservado em V17 |

---

## Contexto

Founder forneceu três PDFs oficiais que definem a **engenharia matemática normativa** do produto:

1. **"Documentação Oficial — Motor RRO.pdf"** — 30 seções, 17 etapas obrigatórias
2. **"Relatorio_Resumo_RRO_Engenharia_Completa.pdf"** — exemplo numérico canônico
3. **"Relatorio_Ponto_Equilibrio_Precifica_Certo_Atualizado.pdf"** — fórmula PE oficial

Após análise consolidada de @architect, @qa e @pm, o Founder confirmou:

- O PDF é **verdade normativa**, não referência conceitual
- Sistema em produção (V16.3) está saudável mas **estruturalmente divergente** do PDF
- Comissão **não deve ser fixa** — pode ser protegida, lucro pode absorver, vendedor pode absorver, absorção pode ser híbrida

Esta última decisão é o **insight central** que orienta o design: o sistema precisa de **dois níveis de cálculo** — um matemático puro (alinhado ao PDF) e outro de política comercial (parametrizada pelo tenant).

---

## Decisão

Construir **Motor V17 — "Policies of Absorption"** com arquitetura de duas camadas:

### Camada 1 — Motor Matemático Oficial (aderente ao PDF)

Função pura encadeada em 3 passos:

```
1. consolidateItems(items[]) → ConsolidatedView
   - Σ Custos, Σ MO Admin, Σ DF, Σ DV, Σ DFin
   - Σ Comissão R$, Σ Lucro R$, Σ IRPJ R$, Σ CSLL R$
   - Σ ICMS R$, Σ ISS R$, Σ PIS/COFINS R$
   - peso_interno + peso_externo (PDF Seção 15)
   - pesos_originais Comissão/Lucro/IRPJ/CSLL pré-desconto (PDF Seção 23)

2. applyMotorRRO(consolidatedView, desconto) → MotorOutput
   - Etapas 11-15 do PDF executadas SEQUENCIALMENTE sobre consolidado
   - Retorna RRO único + cascade_trace única

3. applyAbsorptionPolicy(motorOutput, policy) → FinalDistribution
   - "Camada 2" — quem absorve o desconto
```

### Camada 2 — Política Comercial Parametrizada

Tipos suportados (versão inicial):

- `RRO_PROPORTIONAL` (PDF padrão): redistribui RRO conforme pesos originais
- `COMMISSION_PROTECTED`: comissão fica integral, restante absorve desconto
- `PROFIT_ABSORBS_ALL`: lucro come desconto, demais ficam integrais
- `SELLER_ABSORBS_PCT`: vendedor absorve X% do desconto, sistema absorve resto
- `HYBRID`: política configurável com pesos personalizados

Persistência: `tenant_absorption_policies` (novo)

---

## Princípios não-negociáveis (do PDF, mantidos)

1. **Efeito cascata inviolável** — ordem ICMS → ISS → PIS/COFINS preservada
2. **Despesas operacionais imutáveis a desconto** — V16.3 confirmado aderente
3. **Custos imutáveis a desconto** — V9-I5 + V16.2 confirmados aderentes
4. **Tributos zerados permanecem estruturalmente** — V10 children
5. **Snapshot freeze** — orçamentos APPROVED/CONFIRMED nunca recalculam
6. **Rastreabilidade matemática** — cada R$ tem origem proporcional

---

## Divergências aceitas (vs PDF) — estado V16.3

| # | Divergência | Severidade | Status V17 |
|---|-------------|:----------:|:----------:|
| D1 | Redistribuição RRO usa `commission_pct/profit_pct` configurados ao invés de pesos derivados de valores absolutos pré-desconto | BLOCKER | **Será resolvido na Camada 1** |
| D2 | Cascata tributária aplica alíquotas **nominais** sobre Âncora; PDF aplica **efetivas** sobre Op Por Dentro residual | HIGH | **Aguarda parecer contábil externo** |
| D3 | Motor opera **item-by-item**; PDF exige consolidação cross-produto antes da redistribuição | HIGH | **Será resolvido na Camada 1 (`consolidateItems`)** |
| D4 | `peso_op_interna` único; PDF tem peso interno + peso externo separados | MEDIUM | **Será resolvido na Camada 1** |
| D5 | PE usa `hub_average_revenue` pré-calculada; PDF é explícito sobre divisor = nº meses contabilizados | MEDIUM | **Onda 1: adicionar testes + validação** |
| D6 | Cascade trace tem 13 etapas; PDF tem 17 | LOW | **Onda 1: mapeamento documental (sem refator)** |

---

## Roadmap REVISADO — Pré-Lançamento

### Onda 1 — Preparação (ENTREGUE 2026-05-28)

- ✅ Suite de testes para `breakeven-calculator.ts` (PE PDF canônico 308.968,15)
- ✅ Doc mapeamento 13→17 etapas (`docs/architecture/cascade-mapping-13-to-17.md`)
- ✅ ADR-015 (este documento)
- ✅ Memory project com plano V17

### Onda 2 — Motor V17 + Camada 2 MVP (1-2 semanas — ÚNICO SPRINT)

Sprint único combinando Camada 1 + Camada 2 MVP, sem feature flag:

**Implementação técnica:**
- Criar `src/utils/mrm-engine-v17.ts` com 3 funções puras encadeadas:
  - `consolidateItems(items)` — agrega cross-produto (PDF Etapas 1-9)
  - `applyMotorRRO(view, discount)` — cascata + RRO consolidado (PDF Etapas 10-15)
  - `applyAbsorptionPolicy(motor, policy)` — distribuição final (PDF Etapas 16-17 + Camada 2)
- Substituir uso de `margin-reapuration.ts` por `mrm-engine-v17.ts` em:
  - `src/pages/orcamentos/index.tsx`
  - `src/pages/vendas/index.tsx`
  - `src/pages/pedidos/index.tsx`
- Migration `tenants.absorption_policy` (default `RRO_PROPORTIONAL`)
- Migration `documents.consolidated_breakdown` (JSON opcional)

**Validação:**
- Cenário PDF canônico (RRO 3.093,37) como teste oficial obrigatório
- Cenário Hyago (RRO 13.924,06) como teste de regressão
- 3 fixtures sintéticas: SIMPLE, MULTI_PRODUCT (dados de Esquadrias), AGGRESSIVE
- Smoke test manual do Founder antes do go-live

**Sem precisar:**
- ❌ Feature flag
- ❌ Shadow mode
- ❌ Motores paralelos
- ❌ Migração assistida
- ❌ Snapshot freeze

### Onda 3 — Pós-lançamento (3-6 meses, condicional a demanda real)

- Avaliar D2 (efetivas vs nominais) com parecer contábil se cliente exigir
- Adicionar flavors da Camada 2 (PROFIT_ABSORBS_ALL, SELLER_ABSORBS_PCT, HYBRID) conforme pedido
- Refinamentos baseados em feedback de clientes reais

---

## Estratégia de cutover (REVISADA — pré-lançamento)

**Princípio:** sistema ainda não lançou, não há documentos contábeis reais. Cutover único direto.

| Etapa | Ação |
|-------|------|
| 1 | Implementar `mrm-engine-v17.ts` com cobertura de testes completa |
| 2 | Substituir todas as chamadas de `calculateMarginReapuration` por `calculateMotorV17` |
| 3 | Apagar dados de teste obsoletos no Supabase (orçamentos antigos pré-V17) |
| 4 | Smoke test manual em todos os fluxos críticos (orçamento, pedido, venda) |
| 5 | Deploy V17 como motor único |
| 6 | `margin-reapuration.ts` mantido por 1 release como backup, depois deprecado |

**Campos novos a persistir:**
- `tenants.absorption_policy` (enum: `RRO_PROPORTIONAL` | `COMMISSION_PROTECTED`, default `RRO_PROPORTIONAL`)
- `documents.consolidated_breakdown` (JSON, opcional — auditoria)

**Campos descartados (não necessários):**
- ~~`documents.motor_version`~~ — só existe um motor
- ~~`tenants.motor_version_default`~~ — só existe um motor

---

## Quality Gates

### Pré-Onda 2 (obrigatórios antes de codar Camada 1)
- [ ] Suite testes `breakeven-calculator.ts` verde (Onda 1)
- [ ] Documentação mapeamento 13→17 publicada
- [ ] ADR-015 ACCEPTED (estado atual: PROPOSED)
- [ ] @qa redige plano de shadow mode

### Pré-Onda 3 (obrigatórios antes da Camada 2)
- [ ] Camada 1 com 100% testes (cenário Hyago + cenário PDF + 5 cenários multi-produto)
- [ ] 2 tenants beta validaram V17 por ≥ 2 semanas em shadow mode
- [ ] Parecer contábil externo sobre D2 (efetivas vs nominais)
- [ ] @data-engineer aprovou schema novo

### Pré-cutover V17 default
- [ ] 30 dias em shadow mode sem divergência crítica
- [ ] Comunicação proativa aos tenants (e-mail + in-app banner)
- [ ] Playbook suporte preparado
- [ ] Rollback plan validado (`motor_version = V16` per tenant)

---

## Consequências

### Positivas
- Aderência normativa ao PDF (auditável, ERP-like, enterprise-ready)
- Diferencial competitivo: políticas de absorção parametrizadas (raro em SaaS de precificação)
- Schema mais simples no consolidado vs N tax_breakdowns por item
- Cascade single-source-of-truth elimina ambiguidade de agregação

### Negativas
- Manutenção de 2 motores em paralelo por 3-6 meses (custo dev + cognitive load)
- Migração de schema com freeze obrigatório
- Risco de divergência em tenants beta exige acompanhamento próximo
- Investimento R$ 5-15k em parecer contábil externo

### Neutras
- V16.3 continua válido como motor legacy (não-quebra)
- Pesos originais já estão calculáveis em `pricing_calculations.val_*` (V14)
- `cascade_trace` atual pode ser estendido para 17 etapas com retrocompat

---

## Decisão final do Founder (2026-05-28)

> "Vamos seguir o que vc planejou tá, pode prosseguir e fazer os ajustes, tanto no motor quanto no ponto de equilíbrio"

Onda 1 autorizada. Onda 2 e Onda 3 aguardam respostas formais às 8 perguntas executivas (já documentadas em diagnóstico Orion).

---

## Referências

- PDF: `Documentação Oficial - Motor RRO.pdf` (raiz do projeto)
- PDF: `Relatorio_Resumo_RRO_Engenharia_Completa.pdf`
- PDF: `Relatorio_Ponto_Equilibrio_Precifica_Certo_Atualizado.pdf`
- Código motor atual: `src/utils/margin-reapuration.ts`, `src/utils/mrm-orchestrator.ts`
- Código PE atual: `src/utils/breakeven-calculator.ts`
- Memory: `project_epic_mrm_v17_policies_absorption.md` (a criar)
