# QA-VALIDATION-EPIC-MRM-V9 — Alinhamento Motor RR ↔ DRE Consolidada

**Status:** ✅ APPROVED — S1+S2 implementadas (363/363 tests). Restam smoke-test no browser + shadow mode 7 dias.
**Owner:** Quinn (QA)
**Versão:** 1.0
**Criado:** 2026-05-25
**PRD:** `docs/prd/EPIC-MRM-V9-MOTOR-ALIGN.md`
**ARCH:** `docs/architecture/ARCH-EPIC-MRM-V9.md`
**ADR:** `docs/architecture/adr-010-cascade-sequential-base-propagation.md`

---

## 1. Resumo do gate

| Critério | Resultado |
|---|---|
| PRD claro e mensurável | ✅ PASS |
| Causa raiz documentada | ✅ PASS |
| Invariantes V9-I1..I5 testáveis | ✅ PASS |
| Cenário canônico Hyago 2026-05-25 reproducible | ✅ PASS |
| Zero migrations Supabase | ✅ PASS |
| Snapshots V5 preservados (ADR-003) | ✅ PASS |
| Shadow mode obrigatório | ✅ PASS |
| Cobertura tests ≥ baseline + 20 novos | ⏳ A confirmar em S1-S3 |
| ADR-010 PROPOSED | ⏳ Gate Founder |

**Verdict:** ✅ **APPROVED WITH CONDITIONS** — liberado para @sm fatiar stories e @dev implementar S1.

**Condição bloqueante:** ADR-010 ACCEPTED pelo Founder antes de @devops promover V9 para default.

---

## 2. Cenários Golden — testes obrigatórios

### GT-V9-001 — Cenário canônico Hyago 2026-05-25 (bug original)

**Inputs:**
```typescript
{
  rb: 141106.60,
  desc_value: 14110.66,  // 10% de 141.106,60
  regime: 'LUCRO_REAL',
  rates: [
    { tax_type: 'ICMS', rate_pct: 0.17 },
    { tax_type: 'PIS', rate_pct: 0.0165 },     // ADR-008: PIS 1,65%
    { tax_type: 'COFINS', rate_pct: 0.076 },    // ADR-008: COFINS 7,60%
  ],
  cp: 42645.94,           // CMV canônico (V9 D2)
  mod: 0,                  // V9 D1
  dop: 39086.52,
  commission_pct: 0.05,    // 5%
  profit_pct: 0.10,        // 10%
  csll_pct: 0.024,         // 2,4% LR
  irpj_pct: 0.048,         // 4,8% LR
  peso_op_interna: 1,
  discount_mode: 'PROPORTIONAL',
}
```

**Expected outputs:**

| Campo | Valor esperado |
|---|---|
| `rv` | R$ 126.995,94 |
| `ancora_interna` | R$ 126.995,94 (peso=1) |
| `inside.lines[ICMS].amount` | -R$ 21.589,31 (17% × 126.995,94) |
| `inside.lines[PIS].amount + COFINS.amount` | -R$ 9.750,11 (9,25% × 105.406,63) |
| `cascade_trace[5].amount` (Step 6 ICMS) | -R$ 21.589,31 sobre base 126.995,94 |
| `cascade_trace[6].amount` (Step 7 ISS) | R$ 0 sobre base 105.406,63 |
| `cascade_trace[7].amount` (Step 8 PIS/COFINS) | -R$ 9.750,11 sobre base 105.406,63 |
| `cascade_trace[8].amount` (Step 9 Custos) | -R$ 42.645,94 sobre base 95.656,52 |
| `cascade_trace[9].amount` (Step 10 Despesas) | -R$ 39.086,52 sobre base 53.010,58 |
| `cascade_trace[10].amount` (Step 11 RRO) | **R$ 13.924,06** sobre base 13.924,06 |
| `new_commission` | R$ 4.001,17 (peso 28,74% s/ 13.924,06) |
| `new_profit` | R$ 8.002,33 (peso 57,47%) |
| `new_csll + new_irpj` | R$ 1.920,56 (peso 13,79%) |
| `status` | `'VALID'` |
| `valid` | `true` |

**Tolerância:** ±R$ 0,02 por arredondamento contábil (V4 ajuste no maior componente).

---

### GT-V9-002 — Regressão Excel canônico V5 (peso=0,931585)

**Manter** todos os 7 valores documentados em EPIC-MRM-V5:
- `peso_op_interna = 0,931585`
- `RV = R$ 171.050,346`
- `ancora_interna = R$ 159.342,38`
- `ICMS_amount = R$ 27.088,20`
- `PIS/COFINS_amount = R$ 12.233,53`
- `RRO = R$ 17.471,16`
- `IBS_final = R$ 1.200,21`

**Critério:** ZERO divergência matemática vs V5 quando `mod=0` e `cp` for o mesmo (cenário Excel já assume CMV canônico).

---

### GT-V9-003 — Equivalência Motor ↔ DRE Consolidada (V9-I1)

**Setup:** 3 budgets sintéticos (cenários simples / médio / Hyago).

**Assert:**
```typescript
for (const item of items) {
  const motorResult = calculateMarginReapuration(buildMotorInput(item, ctx))
  const dre = computeConsolidatedDRE({ items: [item], ..., tenantTaxRates })

  expect(motorResult.rro).toBeCloseTo(dre.rro.valor, 2) // ±R$ 0,01
}
```

**Critério V9-I1:** delta `|motor.rro − dre.rro.valor| ≤ R$ 0,01` em todos cenários.

---

### GT-V9-004 — Cascade sequencial (V9-I2, V9-I3)

```typescript
const trace = result.cascade_trace
for (let i = 6; i <= 11; i++) {
  const step = trace[i - 1]      // 0-indexed
  const prevStep = trace[i - 2]
  const expectedBase = prevStep.base !== null
    ? prevStep.base - Math.abs(prevStep.amount)
    : null
  if (expectedBase !== null) {
    expect(step.base).toBeCloseTo(expectedBase, 2)
  }
}
// V9-I2: step 11 amount ≡ motor.rro
expect(trace[10].amount).toBeCloseTo(result.rro, 2)
```

---

### GT-V9-005 — MOD = 0 invariante (V9-I4)

```typescript
const input = buildMotorInput({
  item: { unit_price: 100, quantity: 1, cost_total: 30 },
  tenantCtx: { mod_pct: 0.10, dop_pct: 0.20, ... }, // mod_pct configurado
  globalDiscountPercent: 0,
  itemTaxRates: null,
  discountMode: 'PROPORTIONAL',
})
expect(input.mod).toBe(0) // V9 D1 — sempre zero
```

---

### GT-V9-006 — CP canônico (V9-I5)

```typescript
const item = {
  unit_price: 100,
  quantity: 2,
  cost_total: 30,                          // legacy
  pricing_calculations: [{ cmv: 35 }],     // canônico V8.8
}
const input = buildMotorInput({ item, ... })
expect(input.cp).toBeCloseTo(35 * 2, 2)    // usa CMV, não cost_total
```

---

## 3. Checklist 7 quality checks (gate operacional)

| # | Check | V9 status |
|---|---|---|
| 1 | Unit tests passam (158 V5 baseline + 20+ V9) | ⏳ confirmar pós-implementação |
| 2 | Integration tests passam | ⏳ confirmar |
| 3 | Type checking (`npm run typecheck`) limpo | ⏳ confirmar |
| 4 | Lint (`npm run lint`) limpo | ⏳ confirmar |
| 5 | Shadow mode 7 dias sem alerta `RRO_DRIFT` | ⏳ pós-deploy |
| 6 | Cenário canônico Hyago reproducible no browser | ⏳ smoke test pós-S1+S2 |
| 7 | Doc `docs/motor-reapuracao-margem.md` atualizado | ⏳ confirmar fim de S3 |

---

## 4. Riscos QA-monitorados

| ID | Risco | Detecção |
|---|---|---|
| QR1 | Tenant legacy com `mod_pct > 0` vê RRO mudar de valor após V9 | `mrm-shadow.runShadowComparison` registra diff por tenant_id |
| QR2 | Snapshot V5 renderiza cascade_trace com base=null (visual quebrado) | Smoke test em `ConsolidatedDREBlock` — coluna "Base" mostra `—` quando step.base=null (já implementado) |
| QR3 | Alíquotas PIS+COFINS no banco somam 7,6775% (não 9,25%) | Story V9-003 AC1 investiga; banner V7 informacional já alerta |
| QR4 | `resolveProductCostTotal` retorna 0 para produto sem `pricing_calculations` populado | Fallback Nível 2 do helper (item_cost_net + labor / yield) — testado em item-tax-rates.test.ts |

---

## 5. Test plan operacional

### 5.1. Unit tests novos (mínimo 20)

| Suite | Quantidade |
|---|---|
| `build-motor-input.test.ts` | 10 (cobre 5 invariantes V9-I1..I5 + edge cases) |
| `margin-reapuration-v9-cascade-sequential.test.ts` | 5 (steps 6-11 com base propagada + regressão V5) |
| `discount-engine-integration-v9.test.ts` | 3 (cenários Hyago + Excel + tenant SN/MEI) |
| `consolidated-dre-block-v9.test.ts` (opcional) | 2 (visual coluna Base renderizada) |

### 5.2. Manual smoke tests (pós-S1)

1. Abrir `/orcamentos`, criar orçamento com 1 item (RB ~ R$ 141K, desc 10%) → conferir RRO ≥ 0 e cascade_trace step 11 = R$ 13.924,06.
2. Repetir em `/vendas` (criar venda balcão).
3. Editar orçamento legacy (engine 2.2.0) → confirmar badge "Atualizando para nova versão do motor" aparece e recalcula com V9.

---

## 6. Verdict de Quinn

✅ **APPROVED WITH CONDITIONS**

**Liberado para:**
- @sm River fatiar STORY-V9-001, V9-002, V9-003
- @dev Dex iniciar S1 (paralelo à aprovação ADR-010)

**Condições para deploy produção:**
1. Founder aprova ADR-010 (gate único bloqueante)
2. 6/6 golden tests verdes (GT-V9-001 a GT-V9-006)
3. Shadow mode 7 dias sem alerta (R1 PRD + QR1 deste doc)
4. Hyago smoke-test reproducível (cenário 2026-05-25 fecha RRO=13.924,06)

---

**Quinn (QA)**, 2026-05-25 — fim do QA-VAL v1.0.
