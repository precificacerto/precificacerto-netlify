# ADR-015 — Motor V17: Policies of Absorption (Camada 1 + Camada 2)

**Status:** ACCEPTED (2026-05-28 — confirmado pelo Founder)
**Data:** 2026-05-28
**Stakeholders:** Founder, @architect (Aria), @qa (Quinn), @pm (Morgan), @dev (Dex)
**Supersedes:** —
**Related:** ADR-003 (snapshot imutabilidade), ADR-010 (V9 cascade sequencial), ADR-011 (V10 children), ADR-013 (V12 PIS/COFINS base), V16.3 patch

---

## Decisões Founder confirmadas (2026-05-28)

| Q | Decisão |
|---|---------|
| 1 | PDF = verdade normativa do motor (não apenas referência conceitual) |
| 2 | **Camada 2 MVP:** 2 flavors apenas — `RRO_PROPORTIONAL` (default PDF) + `COMMISSION_PROTECTED`. Outras 3 (PROFIT_ABSORBS_ALL, SELLER_ABSORBS_PCT, HYBRID) entram em release futuro condicional a demanda |
| 3 | **Tenants beta:** sistema avalia automaticamente via query SQL em `supabase/queries/beta-tenants-candidates.sql` — Founder seleciona finalistas com base no relatório retornado |
| 4 | **Parecer contábil (D2 efetivas vs nominais):** ADIADO para Onda 3 — não bloqueia Camada 1 |
| 5 | Snapshot freeze obrigatório (orçamentos APPROVED/CONFIRMED nunca recalculam) |
| 6 | 2 motores paralelos (V16 + V17) por 3-6 meses via feature flag por tenant |
| 7 | V16.3 confirmado aderente ao PDF Seção 10 (despesas integrais) — não desfazer |

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

## Roadmap em 3 Ondas

### Onda 1 — Quick Wins (esta semana — ESCOPO DESTA ADR)

- ✅ Suite de testes para `breakeven-calculator.ts` (PE PDF canônico 308.968,15)
- ✅ Doc mapeamento 13→17 etapas (`docs/architecture/cascade-mapping-13-to-17.md`)
- ✅ ADR-015 (este documento)
- ✅ Memory project com plano V17

**Zero risco matemático.** Sistema V16.3 em produção segue funcionando.

### Onda 2 — Alinhamento Estrutural (4-6 semanas — feature flag obrigatório)

- Implementar Camada 1 completa (`consolidateItems` + `applyMotorRRO`)
- Persistir `consolidated_tax_breakdown` no documento (não no item)
- Flag por tenant: `motor_version` ∈ {`V16`, `V17`}
- Shadow mode automático V16↔V17 com diff matemático logado
- 2-3 tenants beta (perfil simples + multi-produto + agressivo em desconto)

### Onda 3 — Política Comercial + Tributação Refinada (3-6 meses)

- Implementar Camada 2 (`applyAbsorptionPolicy`)
- UI de configuração de políticas por tenant
- Decisão D2 com parecer contábil: alíquotas efetivas vs nominais (Motor V18 condicional)
- Migration assistida V16 → V17 com freeze histórico

---

## Estratégia de migração e snapshot freeze

**Princípio:** orçamentos/vendas são documentos contábeis — não mudam valor sem ação do usuário.

| Status do documento | Comportamento V17 |
|---------------------|-------------------|
| `DRAFT` | Pode recalcular com motor V17 (botão "Recalcular com Motor 3.0") |
| `APPROVED` | Congelado permanentemente, badge "Motor V16 (legado)" |
| `CONFIRMED` / `PAID` | Congelado permanentemente, nunca recalcula |
| Novos documentos pós-deploy | Default = motor do tenant (`tenant.motor_version`) |

**Campos novos a persistir:**
- `documents.motor_version` (string: "V16", "V17")
- `documents.consolidated_tax_breakdown` (JSON, NULL para V16 legado)
- `documents.absorption_policy_snapshot` (JSON, NULL para V16 legado)
- `tenants.motor_version_default` (config tenant)
- `tenants.absorption_policy_default` (config tenant)

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
