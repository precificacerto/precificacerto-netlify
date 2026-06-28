# ADR-021: Step 17 redistribui a Op. Externa pós-desconto (Step 12) pelos pesos pré-desconto do Step 8

**Status:** ACCEPTED (Orion, 2026-06-28 — review @qa Quinn = PASS, @architect Aria = APPROVED WITH CONDITIONS)
**Data:** 2026-06-28
**Author:** @aios-master Orion
**Decididores:** Hyago (Founder — documento "Precifica Certo — Relatório de Correção v2.0", 28/06/2026), @qa Quinn, @architect Aria
**Supersede:**
- **[ADR-020](./adr-020-rro-cmv-custo-produto-e-item17-pai-filhos.md)** — *parcial*, apenas a **Correção 2 (Step 17)**. A Correção 1 do ADR-020 (CMV do Item 4 = "Custo produto" canônico) permanece **VIGENTE e inalterada**.
**Engine:** `src/utils/mrm-engine-v17/absorption.ts` — bloco `step.step === 17` + helper `computeStep8Outside`.

---

## 1. Contexto

A regra inviolável **Pai = Σ Filhos** continua valendo. O ADR-020 fez o Step 17 (Consolidação
final da operação) somar os tributos **reais** por fora — `taxes_outside` (IBS + CBS + IS + IPI) —
calculados sobre bases brutas pós-desconto, **com a Desp. Acessória re-adicionada** nas bases do
IPI (`Âncora + Desp.`) e de IBS/CBS (`base_iva + IS + Desp.`). No cenário do relatório isso
resultava em **R$ 8.049,75**.

O **Relatório de Correção v2.0** (28/06/2026) identificou que esse valor **não fecha** com o
**Step 12** — a Operação Externa pós-desconto (`op_externa_pos = R$ 8.024,18`), que é a
**autoridade gerencial** da cascata (o desconto de 5% é aplicado sobre a operação consolidada
inteira no Step 11; a Op. Externa do Step 12 já absorveu sua parcela proporcional do desconto).

A diferença de **R$ 25,57** decorre de a Desp. Acessória ser **fixa** (não descontada) e entrar
com peso relativo distinto em cada base — distorcendo a soma dos tributos reais frente ao valor
autoritativo do Step 12. Isso viola "Pai = Soma dos Filhos" no total da Op. Externa.

| Tributo | Valor Step 8 (original, pré-desconto) | Peso | Step 17 v2.0 (× 8.024,18) |
|---|---|---|---|
| IBS | R$ 120,45 | 1,4260% | **R$ 114,42** |
| CBS | R$ 1.084,01 | 12,8317% | **R$ 1.029,66** |
| IPI | R$ 7.243,49 | 85,7423% | **R$ 6.880,10** |
| **TOTAL** | R$ 8.447,95 | 100% | **R$ 8.024,18** (= Step 12) |

---

## 2. Decisão

### D1 — Step 17 redistribui `op_externa_pos` pelos pesos do Step 8 (pré-desconto)

No bloco `step.step === 17` de `absorption.ts`, o `amount` e os `children` deixam de ser a soma
dos `taxes_outside` e passam a ser a **redistribuição proporcional** da Op. Externa pós-desconto
do Step 12 pelos pesos da construção **original** (Step 8, pré-desconto):

```
Step17_t = op_externa_pos × (Valor_t_Step8 / Σ Valores_Step8)        t ∈ {IS, IBS, CBS, IPI}
```

Por construção `Σ pesos = 1`, logo **`Σ children = op_externa_pos = Step 12`** → Pai = Σ Filhos = Step 12.

### D2 — Pesos pré-desconto via reconstrução exata (`computeStep8Outside`)

Os pesos **devem** ser pré-desconto: os `taxes_outside` pós-desconto dariam proporção diferente
(a Desp. fixa distorce). A âncora pré-desconto (Op. Interna consolidada) é
`op_int_pre = peso_op_interna_ponderado × rb_total` (`motor-rro.ts:77`). Como ICMS/ISS/PIS/COFINS
escalam **linearmente** por `ancoraFactor = motor.ancora / op_int_pre` nos dois caminhos do motor
(por-produto `tit` e fallback uniforme), a base econômica IVA pré-desconto é **exata**:

```
factorPre    = op_int_pre / motor.ancora            (= 1 / ancoraFactor)
base_iva_pre = base_iva_pos × factorPre             (exato — homogeneidade de grau 1 em ancora)
ipi_base_pre = op_int_pre + Desp. Acessórias        (Desp. é FIXA, não escala)
```

O helper reusa o núcleo único `computeIvaDualFromBase` (ADR-017), sem ICMS Complementar
(não compõe a consolidação IS/IBS/CBS/IPI). Suporta single-product e multi-produto (Adendo 25-A,
loop sobre `outside_items`).

### D3 — Mudança DISPLAY-only (isolamento total)

A mutação fica **contida no nó cascade do Step 17**. `taxes_outside`, `taxes_outside_total`,
`valor_final` ("Total a cobrar"), `motor.ancora` e o RRO **permanecem intactos** — os valores
fiscais reais e o que o cliente paga não mudam. O oráculo `motor-rro-1106-oracle` permanece verde.

---

## 3. Consequências

- O Step 17 da Memória Cascata passa a fechar **exatamente** com o Step 12 (Pai = Σ Filhos).
  PDF/WhatsApp herdam o valor pela renderização genérica do `consolidated-dre-block`.
- O valor **R$ 8.049,75** (soma dos tributos sobre bases brutas) **deixa de aparecer** na cascata
  gerencial.
- **Total a cobrar e tributos fiscais reais inalterados** (display-only). Oráculo 11.06 intacto.
- **Documentos legados:** orçamentos recalculam o motor em runtime ao reabrir (sem migration).
  Pedidos/vendas com snapshot persistido mantêm o gravado (imutabilidade do documento).

## 4. Invariantes / Testes

- `mrm-v17-rro-fix-relatorio-v1.test.ts` (describe ADR-021): Pai=Σfilhos; `step17 === op_externa_pos`
  do Step 12 **inclusive com desconto**; display-only (`valor_final`/`taxes_outside` intactos);
  IS>0 no split; **fechamento multi-produto** (3 itens heterogêneos); e os **alvos do relatório**
  (114,42 / 1.029,66 / 6.880,10 a partir de 8.024,18) validados via núcleo único.
- `mrm-v17-stage17-acessorias.test.ts` e `mrm-adendo-25a-multiproduto-ipi.test.ts` permanecem
  verdes sem alteração — nenhuma asserção dependia do `amount` do Step 17.
- Suíte completa `src/utils`: **660/660** verde. Typecheck: zero erros novos (baseline preservado).

## 5. Dependência arquitetural (guarda)

A exatidão de `base_iva_pre = base_iva_pos / ancoraFactor` depende da **homogeneidade de grau 1**
de `base_iva` em `ancora` (todos os tributos por dentro escalam por `ancoraFactor`). Se um epic
futuro introduzir termo **não-linear** na cascata por dentro (piso/teto absoluto sobre ICMS/ISS,
não proporcional), os pesos pré-desconto perderão exatidão — revisar este helper nesse caso.

## 6. Follow-ups (não bloqueantes)

- (LOW) Coluna `iva_dual_reduction_factor` sem CHECK constraint (aceita qualquer INTEGER); a UI
  restringe via dropdown. Avaliar constraint `IN (30,40,50,60,70,80,100)` em migration futura.
- (INFO) Item 02 (faixas 80%/100%) sem teste de UI automatizado — lógica trivial (`× (1−fator/100)`).
