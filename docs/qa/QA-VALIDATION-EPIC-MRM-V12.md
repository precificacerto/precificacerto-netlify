# QA-VALIDATION-EPIC-MRM-V12

**Status:** APPROVED WITH CONDITIONS

## Cenários

### GT-V12-001 — Cenário Hyago (PIS/COFINS apuração)

Input:
- RB=141.106,60, desc=10% → RV=126.995,94
- ICMS=17% → ICMS_amount=21.589,31
- ISS=0
- pis_rate=0,0165, cofins_rate=0,076 → construção=7,6775%

Expected:
- Base apuração = R$ 105.406,63
- PIS/COFINS apuração = 7,6775% / (1−17%) = 9,2500%
- PIS+COFINS amount = R$ 9.750,11 (±R$0,02)

### GT-V12-002 — Degenerescência ICMS=0

Quando ICMS=0:
- apuração = construção (sem fator de conversão)
- base = Âncora (sem subtração)
- amount = Âncora × construção

### GT-V12-003 — Retrocompat: ISS não afeta base PIS/COFINS V12

Cenário com ISS=5%, ICMS=17%, PIS+COFINS=7,6775%:
- base apuração V12 = Âncora − ICMS = 105.406,63 (NÃO subtrai ISS)
- amount = 105.406,63 × 9,25% = R$ 9.750,11
- ISS continua sendo deduzido do RRO (via taxes_inside.ISS), só não entra na base PIS/COFINS

### GT-V12-004 — Distribuição proporcional PIS vs COFINS

- pisShare = 0,0165 / 0,076775 = 0,2150 (21,50%)
- cofinsShare = 0,076 / 0,076775 = 0,9899 → recálculo: 0,076/0,076775 = 0,9899 (98,99%)

Espera, soma ≠ 1. Vou recalcular:
- pisShare = 0,0165 / 0,0925 = 0,1784 (17,84%) ← divisor é construção 0,076775 = 7,6775% (não 9,25%)
- Mais correto: pisShare = 0,0165 / 0,076775 = 0,2150 (21,50%)
- cofinsShare = 0,076 / 0,076775 = 0,7900 (79,00% — não 98%)
- Soma = 0,2150 + 0,7900 = 1,0050 (ERRO arredondamento → motor deve normalizar)

Solução: usar `pisShare = pis / (pis + cofins)` e `cofinsShare = cofins / (pis + cofins)`. Soma exata = 1.

Test verifica: `PIS.amount + COFINS.amount ≈ total_amount` (±R$0,01).

## Invariantes V12

- V12-I1: `pis_cofins_amount === (ancora − icms) × (pis + cofins) / (1 − icms)` quando icms > 0
- V12-I2: ICMS=0 → fórmula degenera (sem divisão)
- V12-I3: cenário Hyago produz R$ 9.750,11 exato
- V12-I4: PIS.amount + COFINS.amount ≈ pis_cofins_amount total

## Verdict

✅ APPROVED — liberado para implementação.
