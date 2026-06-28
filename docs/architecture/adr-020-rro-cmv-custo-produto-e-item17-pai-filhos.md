# ADR-020: CMV do Item 4 = "Custo produto" canônico + Item 17 = Σ Filhos (Pai = Σ Filhos)

**Status:** ACCEPTED (Orion, 2026-06-28 — review @qa Quinn = CONCERNS→GO, @architect Aria = APPROVED WITH CONDITIONS)
**Data:** 2026-06-28
**Author:** @aios-master Orion
**Decididores:** Hyago (Founder — documento "Relatório de Correção — Motor RRO v1.0", 26/06/2026), @qa Quinn, @architect Aria
**Supersede:**
- **EPIC-MRM-V14** — *parcial*, apenas a camada de **CMV** (precedência do `cmv_unit` snapshot). As despesas (4 buckets) continuam seguindo o snapshot V14.
- Relatório 20/06/2026, Item 1 — *total*, quanto à composição do `amount` do **Step 17** (a âncora deixa de ser injetada).
**Engine:** `src/utils/mrm-engine-v17/` — camadas `legacy-adapter.ts` (CMV) e `absorption.ts` (Step 17).

---

## 1. Contexto

O **Relatório de Correção — Motor RRO v1.0** (26/06/2026) é a fonte de verdade desta ADR. Ele
reafirma a **regra inviolável** do sistema:

> **Pai = Σ Filhos** — o valor exibido em qualquer categoria da cascata deve ser
> EXCLUSIVAMENTE a soma dos valores das suas subcategorias diretas. Não há acumulação de
> itens externos à hierarquia do pai.

Duas inconsistências foram identificadas na cascata de orçamentos:

### Correção 1 — Item 4 (CMV Efetivo) com valor incorreto
O Item 4 (Consolidação dos custos / CMV Efetivo) exibia **R$ 150.319,70**, divergente da soma
real dos custos dos produtos. O motor priorizava uma **base intermediária** (o snapshot V14
`expense_breakdown_unit.cmv_unit`) em vez do campo canônico **"Custo produto"** da Operação
Interna de cada produto.

| Produto | Custo produto (R$) |
|---|---|
| AAATeste0506 | 55.901,92 |
| AAAtesteCBS5 | 39.929,94 |
| Obra Josue Pvc Branco (Daniel) | 45.340,99 |
| **TOTAL CORRETO** | **141.172,85** |
| Valor incorreto na cascata | 150.319,70 |
| **Diferença (erro)** | **9.146,85** |

Onde **Custo produto = Σ Itens do produto + Mão de Obra Produtiva (MOD)**, exibido em vermelho
no cadastro. Os testes `margin-reapuration-v14-expense-snapshot.test.ts` confirmam que o
`cmv_unit` foi *projetado* para ser igual a `Itens + MOD` (ex.: `710,91 = 167,71 + 543,20`) —
logo, a divergência observada é um **snapshot stale/divergente na origem**, e ler o "Custo
produto" diretamente sana o sintoma de forma consistente com o design original.

### Correção 2 — Item 17 (Consolidação final) quebrando Pai = Σ Filhos
O Item 17 exibia **R$ 351.346,81** (o acumulado de toda a operação), enquanto a soma dos seus
filhos diretos era **IBS + CBS + IPI = R$ 8.049,75**. O `amount` injetava
`motor.ancora + desp_acessorias`, que **não são filhos** deste nível.

---

## 2. Decisão

### D1 — CMV (Item 4): precedência invertida, "Custo produto" é a fonte primária
Em `legacy-adapter.ts` (duas ocorrências: caminho `calculateMotorV17ForPage` ~215-219 e
caminho `calculateMotorV17ForPageFull` ~678-681), a precedência do CMV passa a ser:

1. **`custoProduto = (cost_total + productive_labor_unit) × qty`** (Itens + MOD) — **PRIMÁRIO**.
2. **`snapshot.cmv_unit × qty`** (snapshot V14) — **FALLBACK** defensivo, só quando o Custo
   produto for ausente/zero (produto sem custo cadastrado).
3. **reverse-markup** `Op_Interna × (1 − Σ pcts)` (`legacy-adapter.ts` ~362-395) — **ÚLTIMO
   recurso**, só no caminho `ForPage` quando `cmvUsed ≤ 0` e há `sale_price_base_unit`.
   (O caminho `ForPageFull` não possui reverse-markup; `cp = cmvUsed` direto.)

**Justificativa:** o Relatório determina "é esse campo [Custo produto] que o motor deve ler — e
somente ele … NUNCA derivar de ponto intermediário". O snapshot e o reverse-markup permanecem
apenas como rede de segurança para produtos legados sem custo cadastrado, preservando a
robustez do EPIC-MRM-V14 sem violar o Relatório no fluxo normal.

### D2 — Item 17: `amount` = Σ filhos diretos, sem âncora
Em `absorption.ts` (bloco `step.step === 17`, ~516):

```ts
// ANTES
const consolidacao_final = motor.ancora + desp_acessorias + consolidacao_total
// DEPOIS (Relatório RRO v1.0)
const consolidacao_final = consolidacao_total // Σ (IBS + CBS + IS + IPI)
```

A `formula` exibida passa de `'Âncora + Σ (IBS + CBS + IS + IPI)'` para `'Σ (IBS + CBS + IS + IPI)'`.
O filtro de filhos `['IBS','CBS','IS','IPI']` é **mantido** (IS é tributo por fora e compõe a
soma quando `> 0`; no cenário do relatório `IS = 0`, por isso só aparecem IBS+CBS+IPI).

**Independência confirmada:** `valor_final` / "Total a cobrar" é calculado separadamente
(`absorption.ts` ~266 = `motor.ancora + desp_acessorias + taxes_outside_total`) e **NÃO** lê
`step17.amount`. Remover a âncora do Item 17 não altera o que o cliente paga.

---

## 3. Consequências

- **Item 4** passa a exibir R$ 141.172,85; a redução do CMV (−9.146,85) **aumenta o RRO**
  (Etapa 15) e propaga para a Etapa 14 (Redução de custos), Etapa 16 (Comissão/Lucro/IRPJ/CSLL,
  incl. cards do [ADR-019](./adr-019-cards-etapa16-rro.md)) e Etapa 17. Comportamento **esperado
  e correto** conforme o Relatório.
- **Item 17** passa a exibir R$ 8.049,75; a Memória Cascata (DRE block, renderização genérica)
  herda o valor automaticamente — PDF/WhatsApp inclusos.
- **DRE Consolidada** (`consolidated-dre.ts`, consome `motor_cp_total`) reflete o CMV canônico.
- **Documentos legados:** orçamentos recalculam o motor em runtime ao reabrir (sem migration).
  Pedidos/vendas com `tax_breakdown` persistido mantêm o snapshot gravado (imutabilidade do
  documento) — não há backfill nesta ADR.

## 4. Invariantes / Testes

- `mrm-v17-rro-fix-relatorio-v1.test.ts` — cobre Correção 1 (cp_total = 141.172,85; MOD; qty;
  fallback snapshot; fallback reverse-markup; paridade ForPage×ForPageFull) e Correção 2
  (Pai=Σfilhos; sem âncora; IS>0; independência de `valor_final`; formula string).
- Suíte existente `mrm-v17-stage17-acessorias.test.ts` (valor_final / Step 9) permanece verde —
  nenhuma asserção dependia do `amount` do Step 17.

## 5. Follow-ups (não bloqueantes)

- (SHOULD) Adicionar invariante `V8: |step17.amount − Σ children| < 0,01` em `absorption.ts`
  para auto-verificação de Pai=Σfilhos (hoje coberto por teste).
- (SHOULD) Avaliar saneamento na ORIGEM do `cmv_unit` (gravação do snapshot) para que volte a
  coincidir com `cost_total + productive_labor_unit`, eliminando a divergência stale.
