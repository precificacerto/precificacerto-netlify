# ADR-008: Fórmula PIS/COFINS na reapuração tributária (motor RR V5)

**Status:** Accepted (estratégico — critérios técnicos 3/4/5 cumpridos durante implementação)
**Data:** 2026-05-22
**Decididores:** @architect Aria, @pm Morgan, @aios-master Orion
**Aprovado por:** **Hyago (Founder)** em 2026-05-22 (decisão estratégica). Revisão fiscal por contador externo recomendada durante shadow mode (não bloqueante).
**Contexto:** Motor RR V5 — Epic EPIC-MRM-V5-AJUSTES (Sprint S2)
**Engine baseline:** `MRM_ENGINE_VERSION = 2.1.0`
**Engine alvo:** `MRM_ENGINE_VERSION = 2.2.0`

## Contexto

A decodificação célula-a-célula do **Excel oficial** (`Motor de descontos do resultado residual operacional.xlsx`, orquestrada por Orion em 2026-05-22) revelou que a fórmula canônica de PIS/COFINS na **reapuração tributária** (Etapa 5 do PDF Motor RR) é:

```
PIS/COFINS_apuração = (Âncora_Interna − ICMS_amount) × 9,25%        (célula H43)
```

O motor V4 atual (`src/utils/margin-reapuration.ts:98`) implementa:

```
PIS/COFINS_motorV4 = (RV − ICMS_amount − ISS_amount) × 7,6775%      (linha 98)
```

As duas fórmulas são **matematicamente equivalentes apenas quando ICMS = 17%**, via identidade STF (ICMS exclusivo da base PIS/COFINS):

```
9,25% × (1 − 0,17) = 9,25% × 0,83 = 7,6775%   ✓
9,25% × (1 − 0,18) = 9,25% × 0,82 = 7,585%    ≠ 7,6775%   (divergência ICMS=18%)
9,25% × (1 − 0,12) = 9,25% × 0,88 = 8,14%     ≠ 7,6775%   (divergência ICMS=12%)
9,25% × (1 − 0,00) = 9,25% × 1,00 = 9,25%     ≠ 7,6775%   (divergência ZFM)
```

A divergência cresce linearmente com `|ICMS − 17%|`. Para tenants com:

- **ICMS = 18%** (Lucro Real comum em SP/SE pós-2024): erro de ~0,09 p.p. na alíquota efetiva
- **ICMS = 12%** (operações interestaduais N-NE): erro de ~0,47 p.p.
- **ICMS = 0%** (Zona Franca de Manaus / regime especial): erro de ~1,57 p.p.

Em volumes de R$ 100k mensais, essas divergências representam de R$ 90 a R$ 1.570 de PIS/COFINS errado na DRE gerencial — impacto direto no RRO e na precificação.

Além disso, a **dupla perspectiva** PIS/COFINS é registrada em ambos os documentos oficiais:

- **Construção da precificação** (PDF Formação Preço, Tabela 7.1; Excel C17=7,6775%): aplicada no markup divisor do módulo de formação de preço, sobre `Op_Interna_Original` (Excel H21).
- **Reapuração tributária** (PDF Motor RR, Etapa 5; Excel G43=9,25%): aplicada no motor RR, sobre `(Âncora − ICMS)`.

A v1.0 do PRD (Morgan, 2026-05-22 manhã) não distinguia explicitamente as duas perspectivas. A v1.1 (Morgan + Orion, 2026-05-22 tarde) corrigiu STORY-002.AC4 com dupla perspectiva e STORY-002.AC5 com fórmula `9,25% × (Âncora − ICMS)`. Este ADR formaliza a decisão arquitetural.

## Decisão

Motor RR V5 (`computeTaxesInside` em `src/utils/margin-reapuration.ts`) usará exclusivamente a fórmula de **reapuração tributária**:

```typescript
const baseReduzida = ancora_interna − icmsAmount − issAmount;
const pisCofinsAmount = baseReduzida × pis_cofins_apuracao_rate;
// onde pis_cofins_apuracao_rate ≈ 0.0925 para LR não-cumulativo
//                                ≈ 0.0365 para LP cumulativo
//                                ≈ 0       para MEI/SN (Guard Q5)
```

A fórmula de **construção** (7,6775%) **permanece intacta no módulo de formação de preço** (`src/utils/pricing-engine.ts` ou equivalente — fora do scope deste Epic). O motor RR não a usa.

O `mrm-rates-loader.ts` valida ambas as perspectivas separadamente (invariante dupla):

```typescript
// Carrega tax_rate_periods e valida:
assert(|pis_construcao_pct + cofins_construcao_pct − 0.076775| < 1e-4);  // Construção
assert(|pis_apuracao_pct + cofins_apuracao_pct − 0.0925| < 1e-4);        // Apuração LR
assert(|0.0925 × (1 − icms_pct) − 0.076775| < 1e-3);                     // Equivalência ICMS=17%
```

Bump engine: `2.1.0 → 2.2.0` (MINOR, retrocompatível via ADR-002 + ADR-003).

## Consequências

### Positivas

- **Alinhamento canônico** com Excel oficial célula H43 e PDF Motor RR Etapa 5.
- **Correção numérica automática** para tenants com `ICMS ≠ 17%` (estimativa: ~30% da base ativa, principalmente SP/SE com 18% e operações interestaduais).
- **Eliminação de débito técnico**: a fórmula 7,6775% × RV era um "atalho válido apenas para ICMS=17%" sem documentação formal.
- **Separação clara de responsabilidades**: módulo de formação de preço (construção 7,6775%) ↔ motor RR (apuração 9,25%). Cada um na sua etapa do PDF Formação Preço Por Dentro/Por Fora.

### Negativas

- **Mudança de valor canônico** para tenants com `ICMS ≠ 17%`. Mitigação via:
  - Snapshots V4 com `engine_version='2.1.0'` **NÃO recalculam** (ADR-003 imutável). Apenas novos cálculos V5 usam a fórmula corrigida.
  - Shadow mode obrigatório por 7 dias antes de promote (vide QA-VALIDATION-EPIC-MRM-V5 §5.1).
  - Golden test V2 item 13 (LR, ICMS=18%) precisa validação prévia — pode exigir atualização de expected value OU mantém golden congelado em modo `engine_version='2.1.0'` (snapshot histórico).
- **Necessidade de atualização do `tax_rate_periods`** para incluir ambos os campos:
  - `pis_construcao_pct`, `cofins_construcao_pct` (perspectiva precificação)
  - `pis_apuracao_pct`, `cofins_apuracao_pct` (perspectiva reapuração)
  - Pode ser feito via campos opcionais no jsonb existente, ou nova coluna se `mrm-rates-loader` exigir. Decisão delegada a @data-engineer Dara.

### Neutras

- **Engine version bump MINOR** (não MAJOR): o comportamento numérico é equivalente para a maioria dos tenants (`ICMS = 17%`). Tenants com `ICMS ≠ 17%` veem correção, não regressão.

## Alternativas consideradas

### A1 — Manter `7,6775% × RV` (V4)

- **Rejeitada.** Diverge do Excel oficial quando `ICMS ≠ 17%`. Perpetua débito técnico. Falha o golden test do Excel para tenants com ICMS=18%.

### A2 — Feature flag `MRM_PIS_COFINS_MODE = 'construction' | 'apuration'`

- **Rejeitada.** A fórmula 9,25% sobre base reduzida é a forma **canônica única** segundo ADR-001 (single source of truth). Introduzir flag perpetuaria a confusão conceitual entre construção e apuração. Construção vive no módulo de formação de preço; apuração vive no motor RR — separação por **módulo**, não por **flag**.

### A3 — Bump MAJOR `3.0.0`

- **Rejeitada.** Comportamento numérico é equivalente para `ICMS = 17%` (default da maioria dos tenants ativos). MINOR `2.2.0` é apropriado, com test gating para detectar tenants com ICMS divergente antes do promote.

### A4 — Recalcular snapshots V4 com nova fórmula

- **Rejeitada.** Viola **ADR-003 (snapshot fiscal invariante)**. Snapshots V4 representam o estado fiscal no momento da venda — recalcular alteraria registros legais já emitidos. Apenas novos cálculos usam V5.

## Critérios para Accepted — Status atualizado (2026-05-22)

| # | Critério | Status | Responsável |
|---|----------|--------|-------------|
| 1 | Decodificação do Excel confirmada | ✅ Completo | Orion + Aria |
| 2 | Aprovação estratégica pelo founder | ✅ Completo | Hyago (Founder) — 2026-05-22 |
| 3 | Revisão fiscal por contador externo (não bloqueante) | ⏳ Recomendado durante shadow mode | @pm Morgan |
| 4 | Golden test ICMS=18% (GT-7) implementado | ⏳ Durante STORY-002.AC5 | @dev Dex |
| 5 | Shadow mode 7 dias com diff < R$ 0,02 em 99% tenants ICMS=17% | ⏳ Antes do promote | @devops Gage |
| 6 | Atualização de `docs/motor-reapuracao-margem.md` referenciando este ADR | ⏳ Durante S2 | @architect Aria |

**Decisão estratégica liberada:** STORY-MRM-V5-002.AC5 pode iniciar implementação. Critérios 3-6 são **acompanhamento** durante a execução, não pré-requisitos bloqueantes.

**Gate de promote para produção:** Critério 5 (shadow mode 7 dias) é OBRIGATÓRIO antes de promover para produção. Se shadow mode revelar divergência inaceitável, executar Rollback Plan (vide próxima seção).

## Rollback plan

Caso o golden test V2 item 13 (LR, ICMS=18%) ou o shadow mode (Critério 4) revelem regressão inaceitável:

1. Reverter `computeTaxesInside` para a fórmula V4 (`7,6775% × RV`) — diff trivial.
2. Manter `engine_version='2.2.0'` (campos novos opcionais já persistidos não conflitam).
3. Reabrir este ADR como `Rejected` ou propor variante A2 (feature flag).

Tempo estimado de rollback: < 30 minutos (apenas TypeScript + redeploy, sem migration).

## Referências

- `Motor de descontos do resultado residual operacional.xlsx` — célula H43 (decodificada por Orion 2026-05-22)
- `Relatorio Motor Descontos Resultado Residual Operacional.pdf` — Etapa 5 (Reapuração dos impostos por dentro)
- `Relatorio_Formacao_Preco_Operacao_Interna_Por_Dentro.pdf` — Seções 7, 8 (Construção da precificação)
- [ADR-001](./adr-001-single-source-of-truth-motor.md) — Single source of truth do motor
- [ADR-002](./adr-002-versionamento-engine-version.md) — Semver engine_version
- [ADR-003](./adr-003-snapshot-fiscal-invariante.md) — Snapshot fiscal invariante
- [ADR-004](./adr-004-separacao-motor-pure-vs-policies.md) — Motor puro vs policies
- [ARCH-EPIC-MRM-V5.md](./ARCH-EPIC-MRM-V5.md) — Análise técnica do Epic V5 (v2.0)
- [docs/prd/EPIC-MRM-V5-AJUSTES.md](../prd/EPIC-MRM-V5-AJUSTES.md) — PRD v1.1, STORY-002.AC4-AC5

## Change Log

| Data | Versão | Status | Autor | Descrição |
|------|--------|--------|-------|-----------|
| 2026-05-22 | 1.0 | Proposed | @architect Aria + @pm Morgan + Orion | Criação do ADR após decodificação do Excel oficial (orquestração Orion). Aprovação formal pendente. |
| 2026-05-22 | 1.1 | **Accepted** | Hyago (Founder) + Orion | **Aprovação estratégica pelo founder.** Critérios 3-6 (revisão fiscal, GT-7, shadow mode, atualização docs) reclassificados de pré-requisitos bloqueantes para acompanhamento durante implementação. Único gate obrigatório remanescente: shadow mode 7 dias antes do promote para produção. STORY-002.AC5 liberada para @dev. |
