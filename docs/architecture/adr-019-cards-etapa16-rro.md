# ADR-019: Cards de Distribuição = Etapa 16 do Motor RRO (Regra Inviolável)

**Status:** ACCEPTED (Orion, 2026-06-26 — review @qa Quinn = PASS, @architect Aria = APPROVED WITH CONDITIONS)
**Data:** 2026-06-26
**Author:** @aios-master Orion
**Decididores:** Hyago (Founder — documento "Regra Inviolável" BUG-CARDS-RRO-001), @qa Quinn, @architect Aria
**Supersede:** [ADR-010](./adr-010-display-vs-fiscal-snapshot.md) — **parcial**, apenas a camada Display-First de Comissão/Lucro
**Engine:** inalterado — esta ADR é sobre a fronteira de consumo (`residual-distribution.ts`), não sobre o motor.

---

## 1. Contexto

O Motor RRO (Resultado Residual Operacional) calcula, em cascata, todos os componentes
financeiros de uma operação. Comissão e Lucro são produto da **Etapa 16** (redistribuição
do RRO apurado na Etapa 15 pelos pesos estruturais). O documento técnico **BUG-CARDS-RRO-001**
("Regra Inviolável", Junho/2026) identificou que os cards "Distribuição do Resultado" no
orçamento exibiam valores **inflados**: aplicavam **proporção simples** — alíquota % de
comissão/lucro calculada pré-desconto (Etapa 6) × total pós-desconto — em vez de **ler** a
Etapa 16.

Causa: o caminho **Display-First** introduzido pelo ADR-010 (Epic MRM-V7) era ativado sempre
que `discountPct` era passado, recalculando via `calculateDiscountedPrice` e **descartando**
os valores que o motor já havia apurado (`motor_new_commission`/`motor_new_profit`).

**Cenário canônico (doc):** 3 produtos, 5% desconto, modo Proporcional.

| Indicador | Cards (errado) | Etapa 16 (correto) | Divergência |
|---|---|---|---|
| Comissão | R$ 4.866,88 | R$ 4.260,26 | +R$ 606,62 |
| Lucro | R$ 9.815,03 | R$ 8.799,22 | +R$ 1.015,81 |

(Comissão correta = peso 0,281 × RRO 15.171,29 = 4.260,26.)

## 2. Decisão

**REGRA INVIOLÁVEL:** Os cards de "Distribuição do Resultado" (e PDF/WhatsApp) são displays
de leitura da Etapa 16. É **proibido** recalcular Comissão e Lucro de forma independente da
cascata quando o motor está disponível.

Implementação em `computeResidualDistribution` (`src/utils/residual-distribution.ts`):
inversão de prioridade no loop de agregação. Por item, a primeira fonte que existir vence:

1. Snapshot persistido `tax_breakdown.new_*` (Etapa 16 gravada).
2. Motor runtime `motor_new_*` (Etapa 16 em memória — usado na tela em edição).
3. **Fallback** display-first (`calculateDiscountedPrice`) — SOMENTE para itens sem fonte
   do motor (legacy/edição inicial). Nunca sobrepõe a cascata.

IRPJ/CSLL: vêm da Etapa 16 quando há fonte do motor; no fallback display-first **puro**
(nenhum item teve fonte) são `tenantTaxRates × totalNet`.

Percentual exibido: mantém-se `effectivePct = amount / Vₗ` (convenção EPIC-RR-DISPLAY,
"proibido outro denominador que não Vₗ"). O numerador passou a ser o valor da Etapa 16 —
era ele o bug. O denominador Vₗ casa com o label "sobre o total c/ desconto".

Validação de integridade (item 5.2 do doc): helper `validateResidualVsCascade` + verificação
dev-only não-bloqueante (`console.warn`) na tela de orçamento. Decisão do Founder: **aviso/log,
não bloqueio de emissão** (evita travar por arredondamento de ponto flutuante).

## 3. Consequências

**Positivas:**
- Cards, PDF e WhatsApp espelham a Etapa 16 (fonte de verdade única).
- Oráculos do motor (RRO/cascata) intocados — mudança estritamente na fronteira de consumo.
- 642/642 testes `src/utils` passam + 6 novos (`residual-distribution-cards-rro.test.ts`).

**Dívidas / follow-ups aceitos (Aria):**
- **Telas de pedido / venda-detalhe:** passam `tax_breakdown` (snapshot) + `discountPct` editado
  ao vivo. Antes, o desconto digitado movia os cards (via display-first = o bug). Agora o
  snapshot vence e os cards ficam estáveis até re-rodar o motor / salvar. Comportamento mais
  correto, porém observável — requer decisão/teste explícito.
- **Cross-superfície pré-save:** tela (runtime motor) vs PDF/WhatsApp (snapshot persistido) só
  são idênticos APÓS salvar. Mitigar via UX (avisar/save antes de exportar).
- **Oráculos V7 "BLOCKING — QG-001":** passam itens sem motor → exercitam apenas o fallback.
  Reanotados como FALLBACK-ONLY; o caminho de produção é coberto por `residual-distribution-cards-rro.test.ts`.
- **Fallback display-first:** candidato a remoção futura (deprecation gate guiado por telemetria),
  pois reproduz o bug corrigido para itens sem motor. `requiresReview` agora dispara em fonte
  MISTA (motor + fallback) para denunciar perda silenciosa de motor.
- **Validação 5.2 na tela:** como card e cascata leem a mesma fonte (`motorResultsByItem`), é
  tautológica ali — vale como rede de regressão nos testes; estender a PDF/WhatsApp (snapshot)
  agregaria valor real.

## 4. Alternativas consideradas

- **Mudar o denominador para âncora interna pós-desconto (doc 5.1):** rejeitada — quebraria os
  oráculos de display e a convenção Vₗ; só difere com operação externa/tributos por fora; o bug
  era o numerador, não o denominador.
- **Bloqueio duro de emissão (doc 5.2):** rejeitada pelo Founder — risco de travar por
  arredondamento. Adotado aviso/log.
