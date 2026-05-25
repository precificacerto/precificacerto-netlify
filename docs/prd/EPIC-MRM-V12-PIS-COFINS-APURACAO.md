# EPIC-MRM-V12-PIS-COFINS-APURACAO — Fórmula apuração STF/Excel

**Status:** Approved (Founder OK 2026-05-25)
**Engine version:** 2.5.0 → 2.6.0 (MINOR — campos opcionais retrocompatíveis)

## Diretiva (Founder)

Etapa 8 do cascade (Reapuração PIS/COFINS) deve usar a fórmula de **APURAÇÃO** (ADR-008 reforçado):

```
PIS/COFINS_apuração = PIS/COFINS_construção / (1 − ICMS)
amount               = (Âncora − ICMS) × PIS/COFINS_apuração
```

**Exemplo canônico Hyago:**
- Construção (vinda do produto/tenant): 7,6775%
- ICMS: 17%
- Apuração: 7,6775% / 0,83 = **9,25%**
- Base: Âncora − ICMS = R$ 126.995,94 − R$ 21.589,31 = R$ 105.406,63
- Amount: 105.406,63 × 9,25% = **R$ 9.750,11** ✓

## Motor V10 atual (errado)

```
base_reduzida = Âncora − ICMS − ISS
amount = base_reduzida × (pis_rate + cofins_rate)
       = 105.406,63 × 7,6775%
       = R$ 8.092,57 ❌
```

Diferença: R$ 1.657,54 a menos = motor V10 produz RRO ligeiramente maior, mas matemática diverge do Excel oficial.

## Mudanças

1. `computeTaxesInside` em `margin-reapuration.ts`:
   - Base PIS/COFINS = **`Âncora − ICMS`** (sem subtrair ISS — ADR-013 §3.2)
   - Alíquota aplicada = **`(pis + cofins) / (1 − icms)`** (apuração)
   - PIS/COFINS continuam como 2 TaxLines separados (retrocompat) com rate proporcional
2. Bump engine 2.5.0 → 2.6.0.
3. Atualizar V7 validation: checar faixa **CONSTRUÇÃO** (7,6775% LR / 3,65% LP) em vez de apuração.
4. Atualizar tests V5/V6/V9/V10 que esperavam fórmula antiga (ICMS×17% caso canônico).

## Decisão D1 (Founder approved)

Assumir que `rates` vem em perspectiva **CONSTRUCAO** (alinhado com `pricing_calculations` do produto). Motor converte para apuração internamente. Quando ICMS=0, construção ≡ apuração.

## Não-impactos

- Snapshots V5/V6/V9/V10 imutáveis (ADR-003) — engine_version preserva semântica antiga.
- `taxes_outside_base` continua `Âncora − ICMS − PIS/COFINS` (Excel H62) — base agora reflete apuração.

## Invariantes V12

- V12-I1: `pis_cofins_amount === (ancora − icms) × (pis + cofins) / (1 − icms)` quando icms > 0
- V12-I2: quando icms = 0, fórmula degenera para `(ancora) × (pis + cofins)` (preserva degenerescência)
- V12-I3: cenário Hyago (RB=141.106,60, desc=10%, ICMS=17%, PIS+COFINS=7,6775%) produz PIS/COFINS = R$ 9.750,11 exato

## ZERO migrations Supabase
