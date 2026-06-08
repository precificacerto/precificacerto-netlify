# EPIC-POR-FORA-V2 — Ajuste completo dos cálculos "por fora" (IS, IBS/CBS, IPI, ICMS-ST, DIFAL, ICMS Complementar)

> **Data:** 2026-06-08
> **Orquestrador:** Orion (aios-master)
> **Fontes de verdade:** `Base_Conhecimento_Precificacao_Fiscal_v4.docx` (Junho/2026) + `Motor RRO 29.05.xlsx` (exemplo numérico canônico, 3 produtos)
> **Substitui:** decisão parcial da Conferência Fiscal de 05/06 (que mantinha Desp. Acessórias FORA da base do IS)

---

## 1. Decisões do produto (aprovadas pelo Hyago em 08/06)

| # | Decisão | Valor aprovado |
|---|---------|----------------|
| D1 | **Base do IS** inclui Despesas Acessórias | `BC IS = (OpD − ICMS − ISS − PIS/COFINS) + Desp.Acess` (Excel E28 / doc Tabelas 69 e 71) |
| D2 | **Escopo** | **COMPLETO** — inclui ICMS-ST e DIFAL avançados (MVA, ALQ interna/interestadual, presumido−próprio, recálculo na âncora pós-desconto) |
| D3 | **Frete no desconto em cascata** | **Frete fixo nos dois** (ICMS-ST e DIFAL): `BC = OpD×(1−d) + frete + IPI` (recomendação Tabela 77; padroniza vs. Excel que usava critérios distintos) |

---

## 2. Bases de cálculo canônicas (referência de implementação)

Convenção: alíquotas em base 100 na entrada do helper. `OpD` = operação por dentro (preço NF-e, ICMS/ISS/PIS embutidos, **sem** Desp. Acessórias). `Desp.Acess` = frete + seguro + despesas acessórias cobradas do adquirente.

### 2.1 Reforma Tributária (IVA Dual)
```
Base econômica IVA = OpD − ICMS − ISS − PIS/COFINS          (X)
Base do IS         = X + Desp.Acess                          ← D1 (mudança)
IS                 = Base do IS × alíq.IS
Base IBS/CBS       = X + IS + Desp.Acess
IBS                = Base IBS/CBS × alíq.IBS
CBS                = Base IBS/CBS × alíq.CBS
Base IPI           = OpD + Desp.Acess                        (RIPI; não deduz ICMS)
IPI                = Base IPI × alíq.IPI
```

### 2.2 ICMS Complementar (LC 87/96, art. 13 §1º II) — só consumidor final NÃO contribuinte
```
BC ICMS Compl = IPI(R$) + Desp.Acess
ICMS Compl    = BC × alíq.ICMS
```

### 2.3 ICMS-ST (LC 87/96 art. 8º II) — guia "Alíquotas adicionais (avançado)"
```
BC própria        = OpD + IPI(R$) + Desp.Acess (frete CIF c/ vínculo + seguro)
MVA ajustada      = [(1+MVA_orig)×(1−ALQ_inter)/(1−ALQ_intra)] − 1     (só interestadual)
BC-ST             = BC própria × (1 + MVA[_ajustada se inter])
ICMS presumido    = BC-ST × ALQ_interna_destino
ICMS próprio      = BC própria × (intra: ALQ_interna_destino | inter: ALQ_interestadual_origem)
ICMS-ST           = ICMS presumido − ICMS próprio
```
Validação Excel (Produto 1, interestadual): BC própria 144.669,80 · MVA_aj 0,4843 · BC-ST 214.738,79 · presumido 36.505,59 · próprio 17.360,38 · **ICMS-ST 19.145,22** ✓

### 2.4 DIFAL (LC 87/96 art. 13 + EC 87/2015 + LC 190/2022)
```
BC DIFAL          = OpD + Frete (CIF e FOB) + Seguro + IPI(R$)
Base simples      = BC × (ALQ_destino − ALQ_origem)
Base dupla (UF)   = [(BC − ICMS_origem) / (1 − ALQ_destino)]×ALQ_destino − BC×ALQ_origem
FCP               = BC × alíq.FCP   (GNRE separado, não soma ao DIFAL)
```
Validação Excel (Produto 1): BC 144.669,80 · ALQ dest 17% · ALQ orig 12% · **DIFAL 7.233,49** ✓

### 2.5 Desconto em cascata (Motor RRO)
- **Âncora gerencial** = `OpD × (1−d)` → cascata interna (ICMS/ISS/PIS, custos, despesas) e RRO.
- **Âncora fiscal (ST/DIFAL)** = `OpD × (1−d) + frete + IPI` (frete fixo — D3).
- ICMS Complementar = **fixo** (BC = IPI + Desp.Acess, não sofre desconto).
- ST/DIFAL **recalculados** sobre a âncora, nunca redistribuídos. Não integram o RRO.

---

## 3. Estado atual × alvo (gaps)

| Área | Arquivo | Estado atual | Ação |
|------|---------|--------------|------|
| Base IS | `src/utils/iva-dual-outside.ts:126,129` | IS sem Desp.Acess | **S1** corrigir |
| Base IS (motor) | `src/utils/mrm-engine-v17/absorption.ts:95-98` | duplicado, IS sem Desp.Acess | **S3** unificar no helper |
| ST/DIFAL | `absorption.ts:125-127` | % plano sobre base_iva (placeholder) | **S2** módulo dedicado |
| Desp.Acess no modal | `src/components/lancamento-impostos-modal.tsx:47` | não passa `despAcessorias` | **S4** ligar frete/seguro |
| Campos ST/DIFAL | DB | só `icms_st_pct`/`difal_pct` simples | **S2-DB** novos campos (MVA, ALQ, base dupla, valores) |
| UI avançado | produto/serviço | sem guia "Alíquotas adicionais" | **S5** formulário |

---

## 4. Sprints

- **S1 — Núcleo IVA Dual (calc):** corrige base do IS no helper `iva-dual-outside.ts`; atualiza testes; valida contra Excel. _(sem DB/UI — baixo risco)_
- **S2 — ICMS-ST + DIFAL (calc + DB):** novo módulo `src/utils/icms-st-difal.ts` (puro) + migration com campos avançados em products/services; testes contra Excel.
- **S3 — Unificação Motor V17:** `absorption.ts` passa a consumir os helpers (fonte única); recálculo na âncora pós-desconto (frete fixo).
- **S4 — Wiring formação:** modal/produto/serviço/orçamento passam Desp.Acess e contexto (sale_scope/buyer_type/UF) aos helpers; persistência dos valores.
- **S5 — UI avançada:** guia "Alíquotas tributárias adicionais (avançado)" + Contexto da Venda.

---

## 5. Validação canônica (Excel 29.05 — Produto 1, sem desconto)

| Campo | Esperado |
|-------|----------|
| OpD | 143.669,80 |
| IS base (D1, IS=0 no exemplo) | 120.245,94 |
| IBS (0,1%) | 126,26 |
| CBS (0,9%) | 1.136,32 |
| ICMS-ST | 19.145,22 |
| DIFAL | 7.233,49 |
| ICMS Complementar | 170,00 |
| Valor do orçamento P1 | 178.493,39 |

> Pós-desconto 10% e consolidação dos 3 produtos: RRO total **39.125,45** · Lucro **22.485,89** · Comissão **11.242,95** (Excel linhas 112/116/115, coluna Total).

---

## 6. File List (mantido durante execução)
- [x] `src/utils/iva-dual-outside.ts` — base do IS inclui Desp.Acess (D1); novo campo `baseIS`
- [x] `src/utils/__tests__/iva-dual-outside.test.ts` — atualizado + validação Excel (18/18)
- [x] `src/utils/icms-st-difal.ts` — **novo**: computeIcmsSt / computeDifal / computeIcmsComplementar / mvaAjustada
- [x] `src/utils/__tests__/icms-st-difal.test.ts` — **novo**: 18/18 contra Excel
- [x] `src/utils/mrm-engine-v17/absorption.ts` — base do IS com Desp.Acess (D1); ST/DIFAL placeholder sinalizado p/ S3/S4
- [x] `src/utils/__tests__/mrm-v17-stage17-acessorias.test.ts` — asserções D1 atualizadas
- [x] `src/components/lancamento-impostos-modal.tsx` — passa Desp.Acess (frete+seguro+acessórias) ao helper
- [x] `supabase/migrations/20260608000001_st_difal_advanced_fields.sql` — **novo (PENDENTE DEPLOY no Supabase SQL Editor)**
- [x] `supabase` — **migration APLICADA** (08/06, validada via service_role: 33 colunas em products/services/budgets/orders/sales)
- [x] **S5 (produto)** — `src/page-parts/products/content.component.tsx`: seção "Alíquotas tributárias adicionais" estendida com ICMS-ST/DIFAL avançados (acionadores exclusivos, MVA, ALQ destino/origem, base dupla, FCP); calcula via `computeIcmsSt/computeDifal` e persiste `icms_st_value/difal_value/fcp_value` + params (base 100 direta, P0-3)
- [x] **P0-1** — núcleo único `computeIvaDualFromBase` (ADR-017); `iva-dual-outside.ts` e `absorption.ts` consomem; `src/utils/__tests__/iva-dual-equivalence.test.ts` (4 casos) trava a equivalência
- [x] **S4a** — consolidação lateral ICMS-ST/DIFAL/FCP por produto (frete fixo, desconto) em `orcamentos/index.tsx` (criar+atualizar), cópia orçamento→pedido, pedido→venda, budget→venda e venda direta (`pedidos/index.tsx`, `vendas/index.tsx`); persistido como `icms_st_value/difal_value/fcp_value` (mesmo padrão de `icms_compl_value`, à parte do `total_value`)
- [x] **S4b (decisão)** — ST/DIFAL NÃO entram na cascata do motor (são laterais, não integram RRO — ADR-018); computados fora do motor consolidado, por produto. Placeholder removido de `absorption.ts`
- [~] **S5 (serviço)** — **NÃO replicado** por correção fiscal: ICMS-ST/DIFAL são tributos de ICMS/mercadoria; serviço é ISS. Confirmar com Hyago se algum serviço atípico precisa.

## 6.1 Validação QA (Quinn) + Arquitetura (Aria) — 08/06

**QA — GATE: PASS** (2 concerns não-bloqueantes): 583/583 testes; todos os números canônicos do Excel exatos ao centavo; edge cases protegidos (div/0 em MVA, desconto ≥100%, ICMS-ST negativo, base dupla). Concerns: (1) garantir unidade base-100 dos campos avançados na fiação; (2) placeholder ST/DIFAL no motor — **RESOLVIDO**.

**Arquitetura — APPROVED WITH CONDITIONS.** Condições P0/P1:
- **P0-2 (RESOLVIDO 08/06):** placeholder ST/DIFAL/FCP removido de `absorption.ts` (só `ISS_RETIDO` segue como % plano) — evitava inflar `valor_final` com valor errado.
- **P1-1 (RESOLVIDO 08/06):** adicionada coluna `fcp_alq_pct` (base 100) à migration.
- **P0-1 (S4):** unificar a matemática IVA Dual duplicada (helper × absorption) num núcleo `computeIvaDualFromBase` + teste de equivalência. → **ADR-017**.
- **P0-3 (S4):** colunas avançadas nunca passam pela heurística decimal `n<1?n:n/100` — leitura direta base-100; validar range no save (MVA 0-300, ALQ 0-35).
- **P1-2 (S4):** precedência `*_active` (avançado) > `*_pct` simples (S10).
- **P1-3 (S4):** contexto fiscal da OPERAÇÃO (UF destino, interestadual, contribuinte) sobrescreve default do PRODUTO em vendas multi-UF. → **ADR-019**.

**ADRs recomendados:** ADR-017 (fonte única por fora), ADR-018 (ST/DIFAL fora da cascata RRO; FCP em GNRE separado não soma ao valor_final), ADR-019 (precedência contexto produto×operação), ADR-020 (convenção de unidade de alíquotas).

**Decisão de produto (Hyago 08/06):** ICMS-ST/DIFAL/ICMS Complementar ficam na seção **"Alíquotas tributárias adicionais"** na construção do produto. ADR-019 registra que UF/comprador da operação sobrescreve o default do produto.

## 6.2 Validação fase 2 (08/06) — Quinn + Aria

- **QA — GATE PASS:** 591/591; equivalência núcleo×motor confirmada; consolidação/propagação completas; unidade consistente. Só nits.
- **Arquitetura — APPROVED WITH CONDITIONS:** P0-1/P0-2/P0-3 **cumpridas**. R5 (duplicação) **RESOLVIDO** via `consolidateStDifalFromItems`. Pendências:
  - **R1 (RESOLVIDO — Hyago aprovou "Sim"):** helper derivado `computeTotalACobrar(record)` = total_value + ICMS-ST + DIFAL + FCP + ICMS-Compl (NÃO contamina total_value/RRO). Exibido como linha **"Total a cobrar"** no formulário do orçamento (aditiva, só aparece com tributo por fora > 0). **Falta wirar nas demais superfícies de exibição:** PDF do cliente (`api/orcamentos/preview-pdf.ts`), WhatsApp (`api/orcamentos/[id]/send-whatsapp.ts`), lista/detalhe de pedido e venda — o helper está pronto para drop-in.
  - **R2 (ALTA — fiscal latente):** params ST/DIFAL vêm do PRODUTO (UF destino fixa) → erro em venda multi-UF. **ADR-019**: contexto da operação (UF origem×destino, comprador) sobrescreve; produto vira fallback/atributos invariantes (MVA por NCM, elegibilidade).
  - **R3 (MÉDIA):** DRE (`consolidated-dre-block`) rotula "ICMS-ST/DIFAL" mas não soma os valores laterais (mostra 0) — somar ou ajustar rótulo.
  - **R4/R6 (baixa):** adaptador `ratesDecimalToBase100` em absorption; documentar que o lateral ignora `discount_mode`.
- **ADRs a registrar:** ADR-017 (núcleo único — ACCEPTED), ADR-018 (ST/DIFAL lateral fora da cascata), ADR-019 (contexto operação×produto).

## 7. Status (08/06)
- **Camada de cálculo COMPLETA e auditada** contra o Excel 29.05 (IS/IBS/CBS/IPI/ICMS-ST/DIFAL/FCP/ICMS Compl.). `src/`: 583/583 testes verdes.
- **Bloqueio para S4/S5:** depende do deploy da migration `20260608000001` (DDL — `service_role` não executa; aplicar no SQL Editor).
- ST/DIFAL no Motor RRO ainda usam placeholder (% plano) até a fiação S4 plumbar os parâmetros avançados — **sem impacto hoje** pois nenhum produto tem `icms_st_pct`/`difal_pct` preenchido.
