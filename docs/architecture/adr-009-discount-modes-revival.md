# ADR-009: Reativação dos 3 Modos de Desconto (PROPORTIONAL, SELLER_REDUCTION, PROFIT_REDUCTION) — Reversão da Decisão R2

**Status:** ACCEPTED (Quinn aprovou QA-VALIDATION-EPIC-MRM-V6 v1.0 em 2026-05-22 — APPROVED WITH CONDITIONS; condições de merge permanecem: ADR-CON-1 validação Hyago `rv_original` + CON-1/CON-2 do PRD via patch v1.1)
**Data:** 2026-05-22
**Author:** @architect Aria
**Decididores:** @architect Aria, @pm Morgan, @qa Quinn (APPROVED 2026-05-22), Hyago (Founder — Opção A aprovada em 2026-05-22; validação canônica de `rv_original` pendente como gate de merge da STORY-MRM-V6-001)
**Contexto:** Motor RR V6 — Epic EPIC-MRM-V6-DISCOUNT-MODES
**Engine baseline:** `MRM_ENGINE_VERSION = 2.2.0` (V5 em produção pós EPIC-MRM-V5)
**Engine alvo:** `MRM_ENGINE_VERSION = 2.3.0` (MINOR — campo opcional retrocompatível)

---

## 1. Contexto

A spec original do **Motor V2** (consolidada em 2026-05-19, ver memória `project_motor_v2_sprint_plan_2026_05_19.md`) introduziu a **Decisão R2**:

> *"Os modos `PROFIT_REDUCTION` e `SELLER_REDUCTION` são descontinuados. O sistema opera exclusivamente em `PROPORTIONAL` quando MRM ativo. Justificativa: simplificar o motor e evitar ambiguidade de UX durante a transição V1→V2."*

R2 está registrada como diretriz inegociável no header de `src/types/mrm.ts:7` (`R2: Modos PROFIT_REDUCTION e SELLER_REDUCTION descontinuados`) e cristalizada operacionalmente em três pontos:

1. **Feature flag** `mrm.legacy_modes_visible: false` em `src/config/feature-flags.ts:53` — UI esconde modos legados.
2. **Coerção forçada** em `coerceLegacyDiscountMode()` (`src/config/feature-flags.ts:83-107`) que reescreve `'PROFIT_REDUCTION'`/`'SELLER_REDUCTION'` → `'PROPORTIONAL'` no save handler.
3. **Motor MRM ignorante do modo:** `src/utils/margin-reapuration.ts:297-303` aplica rateio único proporcional ao peso de cada componente; `ReapurationInput` (em `src/types/mrm.ts:332-385`) não tem campo `discount_mode`.

### O que mudou em 2026-05-22

Após 3 meses de uso em produção pós EPIC-MRM-V4/V5, o **Founder Hyago** e a área comercial reportaram impacto de negócio:

- **Vendedores sem ferramenta de negociação:** sem `SELLER_REDUCTION`, vendedor não consegue "abrir mão da própria comissão" para fechar negócio B2B com margem apertada.
- **Empresários sem flexibilidade comercial:** sem `PROFIT_REDUCTION`, dono não consegue absorver desconto na própria margem sem penalizar vendedor (queima de estoque, vendas estratégicas).
- **Concorrência:** Granatum, Conta Azul e outros oferecem modos equivalentes — gap competitivo confirmado por suporte.

Hyago aprovou explicitamente a **Opção A — Reativar os 3 modos com isolamento total dos tributos** na reunião de 2026-05-22 (registrada no PRD do Morgan em `docs/prd/EPIC-MRM-V6-DISCOUNT-MODES.md:14`).

### Estado técnico vigente (mapeado por inspeção do código em 2026-05-22)

| Componente | Estado atual | Linha-chave |
|------------|--------------|-------------|
| Type `DiscountMode` | JÁ declara os 4 valores (`'PROPORTIONAL' \| 'PROFIT_REDUCTION' \| 'SELLER_REDUCTION' \| 'MRM'`) | `src/types/mrm.ts:64` |
| Preview `calculateDiscountedPrice()` | JÁ implementa switch dos 3 modos (`PROFIT_REDUCTION`, `SELLER_REDUCTION`, `PROPORTIONAL`) | `src/utils/calculate-discount.ts:52-77` |
| Feature flag | `mrm.legacy_modes_visible: false` (default seguro pós-R2) | `src/config/feature-flags.ts:53` |
| Coerção forçada | `coerceLegacyDiscountMode()` força legados → PROPORTIONAL com `console.warn` | `src/config/feature-flags.ts:83-107` |
| `ReapurationInput.discount_mode` | **NÃO EXISTE** | `src/types/mrm.ts:332-385` |
| `TaxBreakdown.discount_mode_applied` | **NÃO EXISTE** | `src/types/mrm.ts:180-327` |
| Rateio do RRO no motor | Switch único ignora qualquer modo | `src/utils/margin-reapuration.ts:297-303` |
| UI `<Select>` em orcamentos | Desabilitado, 1 opção fixa | `src/pages/orcamentos/index.tsx:2315-2322` (citado no PRD) |
| `residual-distribution-block` | Cards fixos `[Comissão, Lucro]` + condicional IRPJ/CSLL via `hidesProfitTaxes` | `src/page-parts/shared/residual-distribution-block.component.tsx:95-105` |

### Por que isto é um problema arquitetural

R2 foi tomada quando o motor V2 ainda estava em estabilização e havia risco de bug de cálculo durante o ramp-up. Com EPIC-MRM-V4 (validações STF) e EPIC-MRM-V5 (peso operacional + ADR-008 PIS/COFINS apuração) consolidados, o motor é hoje **estável o suficiente para suportar variações de distribuição sem impacto na correção tributária** — desde que essas variações sejam **isoladas da Etapa 5 (apuração de impostos)**.

A oportunidade é reverter R2 **sem comprometer ADR-004 (motor puro), ADR-008 (PIS/COFINS apuração) nem ADR-003 (snapshot imutável)** — isto é, sem inventar lógica nova de cálculo tributário; apenas reabrindo o ramo de distribuição residual que já existe no preview (`calculate-discount.ts:52-77`) para o motor MRM.

---

## 2. Decisão

Os **3 modos de desconto voltam a ser oferecidos** pelo Precifica Certo a partir de `MRM_ENGINE_VERSION = '2.3.0'`. O motor MRM (`calculateMarginReapuration`) passa a aceitar `discount_mode` no `ReapurationInput` e aplica a escolha **exclusivamente na Etapa 9 (distribuição do RRO entre Comissão e Lucro)** — Etapas 1-8 da spec V5 são **invariantes**.

### 2.1 Mapa de propagação

```
UI <Select> em orcamentos/pedidos/vendas
   │
   ▼  (event handler do form)
discount_mode: 'PROPORTIONAL' | 'SELLER_REDUCTION' | 'PROFIT_REDUCTION'
   │
   ▼  (orchestrator mrm-orchestrator.ts monta ReapurationInput)
ReapurationInput.discount_mode  (campo novo OPCIONAL)
   │
   ▼  (motor puro — calculateMarginReapuration)
margin-reapuration.ts linhas 297-303 (rateio Etapa 9)
   │
   ▼  (output do motor)
TaxBreakdown.discount_mode_applied  (campo novo OPCIONAL — auditoria)
   │
   ▼  (persistência)
*_items.tax_breakdown  (JSONB existente — sem nova coluna)
   │
   ▼  (UI condicional)
residual-distribution-block.component.tsx (prop discountMode)
```

### 2.2 Invariante INEGOCIÁVEL

> **Para os mesmos `(rb, desconto, regime, alíquotas, cp, mod, dop, csll_pct, irpj_pct)`, os valores de `ICMS_amount`, `ISS_amount`, `PIS_amount`, `COFINS_amount`, `IBS_amount`, `CBS_amount`, `IPI_amount`, `DIFAL_amount`, `FCP_amount`, `cp`, `mod`, `dop`, `csll_amount`, `irpj_amount`, `rro`, `peso_op_interna`, `ancora_interna`, `taxes_outside_base` e `taxes_outside_total` são bit-exact iguais nos 3 modos.** Apenas `new_commission` e `new_profit` em `TaxBreakdown` diferem.

Esta invariante é validada por **golden test triplo** (mesmo input rodando os 3 modos com tolerância R$ 0,02 — vide AC6 da STORY-MRM-V6-001).

---

## 3. Consequências

### 3.1 Positivas

- **Flexibilidade comercial restaurada.** Vendedor (SELLER) e empresário (PROFIT) recuperam ferramentas de negociação removidas em R2; PROPORTIONAL continua como default seguro.
- **Paridade entre preview e motor.** Hoje `calculate-discount.ts:52-77` já implementa os 3 modos — havia divergência semântica entre o preview (3 modos) e o snapshot fiscal (1 modo). V6 elimina a divergência.
- **Melhor ferramenta de venda.** Reduz pressão de suporte por "modos sumiram" e fecha gap competitivo com Granatum/Conta Azul.
- **Custo baixo de implementação.** Type-level, função de preview e UI placeholder já existem — trabalho residual é primariamente propagação (~12h estimado pelo PRD do Morgan).

### 3.2 Negativas / Trade-offs

- **Superfície maior de testes.** Golden tests V5 (1 cenário canônico) crescem para 3 cenários (1 por modo) + 2 edge cases de fallback — manutenção fica mais rica mas exige disciplina.
- **Snapshots V5 antigos com `discount_mode='MRM'`** precisam lookup fallback no parser (matematicamente equivalentes a PROPORTIONAL — sem recálculo, vide ADR-003).
- **Documentação de produto** (telas de ajuda, vídeos) precisa ser atualizada para explicar os 3 modos novamente.
- **Risco cultural.** Vendedores podem usar SELLER indiscriminadamente para zerar a própria comissão (R5 do PRD do Morgan) — mitigação cabe a UX/Hyago pós-deploy (tooltip educacional + eventual gate por role em Epic V7).

### 3.3 Neutras

- **Engine version bump MINOR (`2.2.0 → 2.3.0`)** conforme ADR-002 — campo novo opcional, callers legados continuam funcionando sem mudança de assinatura.
- **Zero migrations Supabase obrigatórias** — confirmado pela memória `project_supabase_migrations_lessons.md` (coluna `discount_mode` já existe nas tabelas `budgets`/`orders`/`sales`) e o novo `discount_mode_applied` cabe no JSONB `tax_breakdown` existente.

### 3.4 Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| AR1 | Usuário escolhe `SELLER_REDUCTION` em produto com `commission_pct = 0` → motor degrada para PROPORTIONAL silenciosamente | MÉDIA | Fallback estruturado: motor retorna `status='DISCOUNT_MODE_FALLBACK'` + warning em `messages[]` + popula `discount_mode_applied='PROPORTIONAL'` com sinal explícito `discount_mode_requested='SELLER_REDUCTION'`. UI exibe banner. |
| AR2 | Arredondamento diverge entre PROPORTIONAL (multiplicação) e SELLER/PROFIT (subtração) | BAIXA | Ajuste-no-maior-componente padrão V5 (linhas 324-341) preserva soma exata `commission + profit + csll + irpj === RRO`. Aplica nos 3 ramos. |
| AR3 | Decisão de base "comissão original" em SELLER (RV_original vs RV_pós_desconto) gera valor diferente do esperado | ALTA | **Decisão fechada neste ADR §4.3:** SELLER usa `profit_base_original = rv_original * profit_pct` (lucro intacto pré-desconto). Validação Hyago obrigatória em cenário canônico antes do merge da STORY-MRM-V6-001. |
| AR4 | Snapshots V4/V5 com `discount_mode='MRM'` quebram leitura V6 | MÉDIA | Parser interpreta `'MRM'`/`null`/`undefined` → PROPORTIONAL (matematicamente equivalentes). Coberto por AC5 da STORY-MRM-V6-004 (6 cenários compat). |

---

## 4. Alternativas consideradas

### A — Apenas habilitar UI sem mudar motor

- **Descrição:** Habilitar `<Select>` em orcamentos/pedidos/vendas com as 3 opções, mas manter motor inalterado (continua aplicando rateio proporcional ignorando a escolha).
- **Veredito:** **REJEITADA.**
- **Por quê:** A escolha do usuário ficaria semanticamente vazia — UI mostraria "SELLER" mas o resultado em `TaxBreakdown` seria idêntico ao PROPORTIONAL. Quebra confiança e cria divergência entre preview (`calculate-discount.ts` aplica corretamente) e snapshot fiscal (`margin-reapuration.ts` ignora). Pior cenário de UX possível.

### B — Implementar via pre-processamento dos `commission_pct`/`profit_pct` (transferir profit para comm em SELLER)

- **Descrição:** Em vez de adicionar switch no motor, o orchestrator faria a transformação ANTES de chamar `calculateMarginReapuration`:
  - SELLER: `effective_commission_pct = commission_pct + profit_pct`; `effective_profit_pct = 0`
  - PROFIT: `effective_commission_pct = 0`; `effective_profit_pct = commission_pct + profit_pct`
  - PROPORTIONAL: passa intacto
  Depois o motor aplica o rateio proporcional original (linhas 297-303 inalteradas).
- **Veredito:** **CONSIDERADA — variante adotada parcialmente.**
- **Por quê:** Implementação extremamente simples (3 linhas no orchestrator + zero mudança no motor). Mantém motor 100% puro e ignorante do modo. Porém, **perde fidelidade ao requisito de "comissão/lucro original preservado"** — em SELLER o vendedor deveria ver `profit = profit_base_original` (lucro PRÉ-desconto, intacto) e `commission = rro_apos_impostos - profit`. Pre-processar `pct` mantém o rateio proporcional sobre RRO_após_impostos mas não preserva o valor monetário absoluto pré-desconto da rubrica não-tocada. O usuário enxerga rubricas distorcidas.
  Solução adotada: usar a **forma absoluta** descrita em §4.3 (que respeita "rubrica original intacta") como decisão arquitetural; o pre-processamento de pct fica como **fallback simplificado quando `rv_original` não está disponível** (caller legado sem desconto).

### C — Adicionar nova lógica de cálculo paralela ao motor

- **Descrição:** Criar `src/utils/margin-reapuration-v3.ts` separado, com lógica completa duplicada e variação por modo. Motor V2 fica para callers PROPORTIONAL, V3 para SELLER/PROFIT.
- **Veredito:** **REJEITADA.**
- **Por quê:** Viola **ADR-001 (single source of truth)** — passariam a existir dois motores. Duplicação de lógica tributária é exatamente o que ADR-001 evita. Manutenção (próximas reformas tributárias, ADRs futuros) precisaria sincronizar dois arquivos. Inviável.

---

## 5. Implementation Notes

### 5.1 Local exato da mudança

`src/utils/margin-reapuration.ts:295-310` — bloco "Etapa 8: Redistribuição proporcional 4 componentes". O cálculo de `combined_pct`, `peso_comm`, `peso_lucro`, `peso_csll`, `peso_irpj` permanece intacto; o que muda é como `new_commission` e `new_profit` são derivados de `rro_distrib`.

### 5.2 Algoritmo proposto (pseudocódigo arquitetural — Dev refina implementação)

```typescript
// ETAPAS 1-7 (invariantes — não tocar):
//   - rv = rb - desc_value
//   - peso_op_interna, ancora_interna, inside, cp_efetivo, rro, csll_amount, irpj_amount
//     são calculados EXATAMENTE como em V5 (linhas 252-303).
//
// ETAPA 8 (NOVO — switch por discount_mode):

const rv_original = rb  // ATENÇÃO: spec do PRD usa "RV original" = receita SEM desconto = RB.
                         //          Em SELLER/PROFIT, a rubrica preservada é calculada SOBRE RB.
                         //          Documentar com clareza em JSDoc para evitar confusão.

const csll_amount = rro_distrib * peso_csll
const irpj_amount = rro_distrib * peso_irpj
const rro_apos_impostos_residuais = rro_distrib - csll_amount - irpj_amount

let new_commission: number
let new_profit: number
let discount_mode_applied: DiscountMode = discount_mode ?? 'PROPORTIONAL'
const warnings: string[] = []

switch (discount_mode ?? 'PROPORTIONAL') {
  case 'PROPORTIONAL': {
    // Comportamento V5 idêntico — preservado bit-exact
    new_commission = rro_apos_impostos_residuais * (commission_pct / (commission_pct + profit_pct))
    new_profit = rro_apos_impostos_residuais - new_commission
    break
  }
  case 'SELLER_REDUCTION': {
    // Lucro PRÉ-desconto intacto; comissão absorve toda a redução
    const profit_base_original = rv_original * profit_pct  // valor "que o lucro receberia sem desconto"
    if (commission_pct === 0 || profit_base_original > rro_apos_impostos_residuais) {
      // Fallback PROPORTIONAL — caso inviável
      warnings.push(`DISCOUNT_MODE_FALLBACK: requested=SELLER_REDUCTION, reason=${
        commission_pct === 0 ? 'commission_pct_zero' : 'profit_base_excede_rro'
      }`)
      discount_mode_applied = 'PROPORTIONAL'
      new_commission = rro_apos_impostos_residuais * (commission_pct / (commission_pct + profit_pct))
      new_profit = rro_apos_impostos_residuais - new_commission
    } else {
      new_profit = profit_base_original
      new_commission = rro_apos_impostos_residuais - new_profit
    }
    break
  }
  case 'PROFIT_REDUCTION': {
    // Comissão PRÉ-desconto intacta; lucro absorve toda a redução
    const commission_base_original = rv_original * commission_pct
    if (profit_pct === 0 || commission_base_original > rro_apos_impostos_residuais) {
      warnings.push(`DISCOUNT_MODE_FALLBACK: requested=PROFIT_REDUCTION, reason=${
        profit_pct === 0 ? 'profit_pct_zero' : 'commission_base_excede_rro'
      }`)
      discount_mode_applied = 'PROPORTIONAL'
      new_commission = rro_apos_impostos_residuais * (commission_pct / (commission_pct + profit_pct))
      new_profit = rro_apos_impostos_residuais - new_commission
    } else {
      new_commission = commission_base_original
      new_profit = rro_apos_impostos_residuais - new_commission
    }
    break
  }
}

// Ajuste-no-maior-componente (preserva soma exata) permanece o MESMO de V5.
// new_csll e new_irpj NÃO mudam — derivam de peso_csll/peso_irpj × rro_distrib.
```

### 5.3 Base "comissão original" em SELLER/PROFIT — DECISÃO FORMAL

**Pergunta:** Quando o usuário escolhe SELLER, o "valor original do lucro" preservado deve ser calculado sobre `rv_original = rb` (PRÉ-desconto) ou sobre `rv = rb - desc` (PÓS-desconto)?

**Decisão:** **Usar `rv_original = rb` (PRÉ-desconto).**

**Justificativa:** A semântica de SELLER é "vendedor abre mão da própria comissão para preservar o lucro do dono". O "lucro do dono" só faz sentido como benchmark se for o **valor que o lucro receberia sem o desconto** — caso contrário, em PROFIT o "valor original da comissão" também seria reduzido proporcionalmente ao desconto, descaracterizando o modo.

**Risco AR3 mitigado:** Validação obrigatória do Hyago em cenário canônico (RB=190.055,94, desc=10%, comm=8%, prof=12%) antes do merge da STORY-MRM-V6-001. Se rejeitar, alternativa é usar `rv` PÓS-desconto e atualizar `profit_base_original = rv * profit_pct` — diff de 1 linha.

### 5.4 Fallback safety

Quando o modo escolhido implica valor inviável (commission_pct=0 em SELLER, profit_pct=0 em PROFIT, ou base preservada > RRO_após_impostos), o motor:

1. Não falha — **degrada para PROPORTIONAL silenciosamente**.
2. Popula `discount_mode_applied = 'PROPORTIONAL'` (≠ do solicitado).
3. Popula `discount_mode_requested = 'SELLER_REDUCTION'` (ou outro — campo opcional para auditoria).
4. Adiciona warning estruturado em `breakdown.messages`: `'DISCOUNT_MODE_FALLBACK: requested=SELLER_REDUCTION, reason=commission_pct_zero'`.
5. Retorna `status = 'DISCOUNT_MODE_FALLBACK'` (novo valor de `ReapurationStatus` — adição retrocompatível em `src/types/mrm.ts:57-62`).

UI consome `discount_mode_applied !== discount_mode_requested` para renderizar banner orientativo (AC4 da STORY-MRM-V6-003).

### 5.5 Invariante reforçada (contract test)

Adicionar em `src/utils/__tests__/margin-reapuration.test.ts` (AC6 da STORY-MRM-V6-001):

```typescript
describe('Invariante tributária V6 — 3 modos produzem mesmos impostos', () => {
  const baseInput: ReapurationInput = { /* RB=190.055,94, desc=10%, LR, ... */ }
  const modes: DiscountMode[] = ['PROPORTIONAL', 'SELLER_REDUCTION', 'PROFIT_REDUCTION']
  const results = modes.map(m => calculateMarginReapuration({ ...baseInput, discount_mode: m }))
  
  // Assertions bit-exact (tolerância R$ 0,02 só por arredondamento):
  for (let i = 1; i < results.length; i++) {
    expect(results[i].rro).toBeCloseTo(results[0].rro, 2)
    expect(results[i].imp_total).toBeCloseTo(results[0].imp_total, 2)
    expect(results[i].ancora_interna).toBeCloseTo(results[0].ancora_interna ?? 0, 2)
    expect(results[i].peso_op_interna).toBeCloseTo(results[0].peso_op_interna ?? 1, 6)
    expect(results[i].taxes_outside_base).toBeCloseTo(results[0].taxes_outside_base ?? 0, 2)
    expect(results[i].new_csll).toBeCloseTo(results[0].new_csll, 2)
    expect(results[i].new_irpj).toBeCloseTo(results[0].new_irpj, 2)
    // taxes_inside e taxes_outside arrays também bit-exact (loop por linha)
  }
  
  // Mas new_commission e new_profit DIFEREM (semântica do modo)
  expect(results[0].new_commission).not.toBeCloseTo(results[1].new_commission, 0)  // PROP ≠ SELLER
  expect(results[1].new_profit).toBeGreaterThan(results[0].new_profit)              // SELLER preserva lucro
})
```

### 5.6 Engine version bump

`MRM_ENGINE_VERSION` em `src/types/mrm.ts:29` atualizado de `'2.2.0'` → `'2.3.0'`. Adicionar entrada no comentário do bloco (linhas 21-27):

```typescript
// - 2.3.0: 3 modos de desconto (PROPORTIONAL, SELLER_REDUCTION, PROFIT_REDUCTION)
//           ReapurationInput.discount_mode opcional; TaxBreakdown.discount_mode_applied
//           opcional. Reverte R2 (ADR-009). Snapshots V4/V5 com discount_mode='MRM'
//           são lidos como PROPORTIONAL. Story MRM-V6-001.
```

Conforme **ADR-002 (Semver engine_version)**: bump MINOR é apropriado porque a mudança é **aditiva e retrocompatível** — callers que não passam `discount_mode` obtêm comportamento V5 idêntico (default `'PROPORTIONAL'`).

---

## 6. Backward Compatibility

| Snapshot | `engine_version` | `discount_mode` no DB | Interpretação V6 |
|----------|------------------|----------------------|------------------|
| V3 / V2 antigos (pré-MRM) | `'1.x'` ou ausente | `'PROFIT_REDUCTION'` ou `'SELLER_REDUCTION'` legítimos | **Lidos nativamente como o modo escolhido** (eram coagidos a PROPORTIONAL em V4/V5 quando MRM ativo — V6 respeita o que está persistido) |
| V4 | `'2.1.0'` | `'MRM'` | Interpretado como `'PROPORTIONAL'` (matematicamente equivalente — sem recálculo, ADR-003 preservado) |
| V4 | `'2.1.0'` | `null` / `undefined` | Default `'PROPORTIONAL'` |
| V5 | `'2.2.0'` | `'MRM'` | Interpretado como `'PROPORTIONAL'` |
| V5 | `'2.2.0'` | `null` / ausente | Default `'PROPORTIONAL'` |
| V6 (novos) | `'2.3.0'` | `'PROPORTIONAL'` / `'SELLER_REDUCTION'` / `'PROFIT_REDUCTION'` | Lidos nativamente |
| V6 (novos) | `'2.3.0'` | `'MRM'` (legado coexistindo) | Interpretado como `'PROPORTIONAL'` (sinônimo) |

**Garantia formal:** A função `coerceLegacyDiscountMode()` em `src/config/feature-flags.ts:83-107` é **mantida** (não removida), recebe annotation `@deprecated since 2.3.0` e continua coagindo `'MRM'` → `'PROPORTIONAL'` na **leitura**. Remoção real é planejada para Epic V7 após 90 dias de uso V6 estável.

**ADR-003 (Snapshot fiscal invariante) preservado:** Snapshots persistidos NÃO são recalculados ao serem lidos por V6 — apenas reinterpretados na semântica de display.

---

## 7. Test Strategy Reference

A estratégia completa de testes desta mudança vive em **QA-VALIDATION-EPIC-MRM-V6.md** (será criada por @qa Quinn em paralelo a este ADR). Resumo do que é exigido:

| Camada | Test | Responsável | Story |
|--------|------|-------------|-------|
| Motor — invariante tributária | Golden test triplo (3 modos, mesmo input, asserts bit-exact em todos os campos exceto commission/profit) | @qa Quinn + @dev | STORY-MRM-V6-001 AC6 |
| Motor — fallback safety | 2 cenários: SELLER com `commission_pct=0` → fallback; PROFIT com `commission_base > rro` → fallback | @qa Quinn + @dev | STORY-MRM-V6-001 AC4 |
| Motor — regressão V5 não regride | Re-rodar golden test V5 (RB=190.055,94, desc=10%, sem discount_mode) — RRO ≈ R$ 17.471,16 (± R$ 0,02) | @qa Quinn | STORY-MRM-V6-004 AC6 |
| Snapshot compat | 6 cenários de snapshots V4/V5/V6 com `discount_mode ∈ {'MRM', null, undefined, 'SELLER_REDUCTION', 'PROFIT_REDUCTION', 'PROPORTIONAL'}` lidos sem erro | @qa Quinn | STORY-MRM-V6-004 AC5 |
| UI condicional | Playwright: SELLER esconde card "Lucro"; PROFIT esconde card "Comissão"; PROPORTIONAL mostra ambos | @qa Quinn + @ux | STORY-MRM-V6-003 AC2 |
| `maxDiscountPercent` por modo | Unit `discount-helpers.test.ts`: SELLER ≤ comm/total; PROFIT ≤ prof/total; PROPORTIONAL ≤ (comm+prof)/total | @qa Quinn | STORY-MRM-V6-002 AC5 |

**Gate de Accepted deste ADR:** QA-VALIDATION-EPIC-MRM-V6.md aprovado por Quinn + golden test triplo passando em CI + validação do Hyago em cenário canônico (decisão §5.3 sobre `rv_original`).

---

## 8. Relation to Other ADRs

| Relação | ADR | Detalhe |
|---------|-----|---------|
| **Supersedes (em parte)** | **ADR-004 — Separação motor puro vs policies** (no que tange à Decisão R2) | R2 era citada no header do ADR-004 e cristalizada em `src/types/mrm.ts:7`. Esta cláusula específica fica **REVERTIDA**. O **restante do ADR-004 permanece integralmente válido**: motor continua puro (recebe `discount_mode` como INPUT, não consulta contexto externo), policies continuam separadas em `mrm-policies.ts`, decisão de bloqueio de save permanece fora do motor. ADR-004 ganha addendum no topo (vide AC2 da STORY-MRM-V6-004) referenciando este ADR-009. |
| **Builds on** | **ADR-008 — PIS/COFINS apuração** | Fórmula `9,25% × (Âncora − ICMS − ISS)` (Etapa 5 do motor V5) é **invariante absoluta** mesmo com novo `discount_mode`. Golden test triplo desta ADR valida explicitamente que ICMS/PIS/COFINS/ISS são bit-exact iguais nos 3 modos. ADR-008 NÃO sofre mudança. |
| **Respects** | **ADR-001 — Single source of truth do motor** | A nova lógica de switch vive **dentro do motor canônico** (`margin-reapuration.ts`), não em arquivo paralelo. Alternativa C (rejeitada) violaria ADR-001. |
| **Respects** | **ADR-002 — Semver engine_version** | Bump MINOR `2.2.0 → 2.3.0` justificado: adição de campo opcional retrocompatível em `ReapurationInput` + `TaxBreakdown`. |
| **Respects** | **ADR-003 — Snapshot fiscal invariante** | Snapshots V4/V5 com `discount_mode='MRM'` NÃO são recalculados. Reinterpretação acontece apenas no display. Imutabilidade preservada. |
| **Respects** | **ADR-005 — Deprecação edge function** | Edge function `calc-tax-engine` não conhece `discount_mode` — irrelevante para ela (fase de shadow mode segue ADR-005 sem mudança). |

---

## 9. Change Log

| Data | Versão | Status | Autor | Descrição |
|------|--------|--------|-------|-----------|
| 2026-05-22 | 1.0 | **PROPOSED** | @architect Aria | Criação do ADR após aprovação do Founder Hyago (Opção A — reativar 3 modos com isolamento total dos tributos). Resposta ao PRD do Morgan `EPIC-MRM-V6-DISCOUNT-MODES.md` (v1.0). Reverte parcialmente R2 do ADR-004 sem comprometer pureza do motor. Promoção para Accepted depende de aprovação Quinn em QA-VALIDATION-EPIC-MRM-V6.md + validação Hyago em cenário canônico §5.3. |

---

## Referências

- [docs/prd/EPIC-MRM-V6-DISCOUNT-MODES.md](../prd/EPIC-MRM-V6-DISCOUNT-MODES.md) — PRD do Morgan (v1.0, 2026-05-22) que motivou este ADR
- [ADR-001](./adr-001-single-source-of-truth-motor.md) — Single source of truth do motor
- [ADR-002](./adr-002-versionamento-engine-version.md) — Semver engine_version
- [ADR-003](./adr-003-snapshot-fiscal-invariante.md) — Snapshot fiscal invariante
- [ADR-004](./adr-004-separacao-motor-pure-vs-policies.md) — Motor puro vs policies (R2 superseded em parte por este ADR-009)
- [ADR-005](./adr-005-deprecacao-edge-function.md) — Deprecação edge function
- [ADR-008](./adr-008-pis-cofins-apuracao-formula.md) — PIS/COFINS apuração (invariante mesmo com novo discount_mode)
- [ARCH-EPIC-MRM-V5.md](./ARCH-EPIC-MRM-V5.md) — Arquitetura V5 vigente (baseline)
- `src/types/mrm.ts:29` (MRM_ENGINE_VERSION), `:64` (DiscountMode), `:180-327` (TaxBreakdown), `:332-385` (ReapurationInput)
- `src/utils/margin-reapuration.ts:295-310` — bloco-alvo do refactor
- `src/utils/calculate-discount.ts:52-77` — referência de semântica dos 3 modos (preview)
- `src/utils/residual-distribution.ts:175-268` — função pura `computeResidualDistribution` consumida pela UI
- `src/page-parts/shared/residual-distribution-block.component.tsx:95-105` — cards condicionais
- `src/config/feature-flags.ts:53` (flag), `:83-107` (coerceLegacyDiscountMode — fica @deprecated)
- Memória: `project_motor_v2_sprint_plan_2026_05_19.md` (registro da R2 original), `project_epic_mrm_v5_2026_05_22.md` (baseline V5)
- `.aios-core/constitution.md` — Artigos IV (No Invention — os 3 modos já existem no type system e no preview) e V (Quality First — golden test triplo)
- [docs/qa/QA-VALIDATION-EPIC-MRM-V6.md](../qa/QA-VALIDATION-EPIC-MRM-V6.md) — QA Validation v1.0 (Quinn, 2026-05-22) que aprovou este ADR

---

## QA Review (Quinn, 2026-05-22)

**Veredito:** APPROVED WITH CONDITIONS (recomendação: transição PROPOSED → ACCEPTED aplicada — Status do header atualizado)

- ✅ Invariante INEGOCIÁVEL (§2.2) é exatamente o contrato testado pelo cenário C-GOLDEN da matriz QA (`docs/qa/QA-VALIDATION-EPIC-MRM-V6.md` v1.0) — bit-exact em `taxes_inside`, `taxes_outside`, `cp`, `mod`, `dop`, `rro`, `ancora_interna`, `peso_op_interna`, `taxes_outside_base`, `csll_amount`, `irpj_amount`; apenas `new_commission` e `new_profit` divergem.
- ✅ Pseudocódigo (§5.2) + decisão `rv_original = rb` (§5.3) fornecem implementação determinística para Dev; fallback estruturado (§5.4) é coberto pelos cenários C5/C6 (motor) e U5 (UI banner com `role="alert"`).
- ✅ Backward compatibility (§6) com 6 cenários tabelados é coberta pela matriz de retrocompat R1-R4 — destaque para R2 (snapshot V5 com `discount_mode='MRM'` lido como PROPORTIONAL sem recálculo, ADR-003 preservado).
- 🟡 **ADR-CON-1 (HIGH — gate explícito do próprio §7):** Validação obrigatória do Hyago em cenário canônico (RB=190.055,94, desc=10%, comm=8%, prof=12%) sobre a escolha `rv_original = rb` PRÉ-desconto. Sem essa validação, AR3 (severidade ALTA §3.4) permanece aberto. Promoção formal já aplicada no header como ACCEPTED com a ressalva no campo "Decididores".
- 🟡 **ADR-CON-2 (MEDIUM):** Referência cruzada ao QA-VALIDATION-EPIC-MRM-V6.md v1.0 adicionada nas Referências acima (anteriormente §7 prometia "será criada por @qa Quinn em paralelo" — agora o doc existe e está vinculado).

**Quinn, 2026-05-22**
