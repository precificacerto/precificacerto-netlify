# ADR-017 — Bases individualizadas dos tributos por fora + ICMS Complementar (Conferência Fiscal)

**Status:** ACCEPTED (Founder 2026-06-05)
**Engine:** Motor V17 (`src/utils/mrm-engine-v17/absorption.ts`) + fonte de preview (`src/utils/iva-dual-outside.ts`)
**Relaciona-se a:** ADR-001 (Single Source of Truth — ver §Conflito), ADR-015 (Camada 2 / Etapa 17), ADR-016 (PIS/COFINS base)
**Documento de origem:** `BasesTributosPorFora_ConferenciaFiscal.pdf` (LC 214/2025, RIPI Decreto 7.212/2010, LC 87/1996)

## Context

O Founder formalizou, via documento de Conferência Fiscal, as **bases de cálculo individualizadas** de cada tributo "por fora" e introduziu um tributo ausente do sistema: o **ICMS Complementar**. O modelo anterior (ADR pós-2026-06-02) somava frete/seguro/despesas acessórias **dentro** da Operação Interna, fazendo-as sofrer dedução de ICMS/PIS e entrar indevidamente na base do IS; e não calculava ICMS Complementar.

Notação: **OpDentro** = preço por dentro (ICMS/ISS/PIS-COFINS embutidos), **sem** despesas acessórias. **Desp. Acessórias** = frete + seguro + despesas acessórias cobradas do adquirente (`products/services.freight_value + insurance_value + accessory_expenses_value`).

## Decision

### Bases individualizadas (cada tributo respeita sua própria base)

```
Base IS       = OpDentro − ICMS − PIS/COFINS − ISS        (SEM Desp. Acessórias)
Base IBS/CBS  = (OpDentro − ICMS − PIS/COFINS − ISS) + IS + Desp. Acessórias
Base IPI      = OpDentro + Desp. Acessórias               (RIPI art. 190 — NÃO deduz ICMS)
ICMS Compl.   = (valor IPI + Desp. Acessórias) × alíq. ICMS
Preço Final   = OpDentro + Desp. Acessórias + (IS + IBS + CBS + IPI + ICMS Compl.)
```

Cenário canônico validado (OpDentro 98.403,56 · ICMS 17% · Desp. 1.200): baseIS 81.674,95 · baseIBS/CBS 82.874,95 · IBS 1% = **828,75** · CBS 8,8% = **7.293,00** · IPI 5% = **4.980,18** · ICMS Compl. 17% = **1.050,63**.

### ICMS Complementar — gate de ativação (LC 87/1996, art. 13, §1º, II)

Devido **apenas** quando o destinatário for **consumidor final NÃO contribuinte** do ICMS. Gatilho: `customers.is_icms_contributor === false`. Default fail-safe: sem cliente selecionado → **não aplica** (não infla preço). Novo `TaxType` `ICMS_COMPL` (sem coluna própria no item — é derivado da alíquota ICMS; por isso `ITEM_RATE_BY_TAX_TYPE` virou `Partial<Record<TaxType, ...>>`).

### Persistência — coluna dedicada

`budgets/orders/sales.icms_compl_value` (migration `20260605000001`, default 0). Valor consolidado gravado a partir do **mesmo** `motorResultsByItem`/`saveV17Results` que alimenta o display (sem cálculo paralelo). Propagação na cadeia: orçamento → pedido (espelha) → orçamento-espelho → venda. `valor_final` da `FinalDistribution` passa a incluir `desp_acessorias`; invariante I-V17-9 (`checkI7ValorFinal`) atualizada de acordo.

## Conflito com ADR-001 (Single Source of Truth) — resolução

A hierarquia é implementada em **dois** lugares: `computeIvaDualOutside` (preview do cadastro de produto/serviço) e `absorption.ts` Etapa 17 (orçamento/pedido/venda, autoritativo). Isso é uma exceção tolerada ao ADR-001, com a seguinte mitigação e ressalva conhecida:

- **Equivalência garantida** no caminho de produto (ISS = 0, PIS/COFINS plano) — coberto por testes em ambos os lados com o cenário canônico.
- **Divergência conhecida quando ISS > 0 ou transmutação PIS/COFINS (ADR-016) ativa:** o motor usa cascata sequencial + valor transmutado (mais correto), enquanto o helper usa percentuais planos sobre OpDentro. Para serviços (ISS > 0), o **preview** pode diferir do valor **autoritativo** do orçamento. O motor é a fonte de verdade fiscal; o helper é preview.
- **Follow-up recomendado (não bloqueante):** alinhar o helper ao motor (ou fazer o preview de serviço derivar do motor) para fechar a divergência. Registrado como dívida técnica.

## Consequences

- Valores "por fora" de orçamentos/vendas já existentes podem mudar ao reabrir/recalcular (despesas saem da base do IS e da dedução de ICMS/PIS).
- ICMS Complementar aparece apenas em fluxos com destinatário (orçamento/pedido/venda), nunca no cadastro de produto.
- Testes: `iva-dual-outside.test.ts` (cenário canônico) + `mrm-v17-stage17-acessorias.test.ts` (Etapa 17, incl. IS>0/ISS>0 com despesas e ICMS Compl. condicional). Suíte 547+ verde.

## Files

- `src/types/mrm.ts`, `src/utils/iva-dual-outside.ts`, `src/utils/mrm-engine-v17/absorption.ts`, `invariants.ts`, `mrm-engine-v17.ts`, `legacy-adapter.ts`, `item-tax-rates.ts`
- `src/page-parts/shared/consolidated-dre-block.component.tsx`, `src/page-parts/products/*`
- `src/pages/orcamentos/index.tsx`, `src/pages/vendas/index.tsx`, `src/pages/pedidos/index.tsx`
- `supabase/migrations/20260605000001_add_icms_compl_value.sql`
