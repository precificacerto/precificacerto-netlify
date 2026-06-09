# EPIC-POR-FORA-V3 — Refinamento UI/lógica das "Alíquotas tributárias adicionais (avançado)"

> **Data:** 2026-06-09
> **Orquestrador:** Orion (aios-master)
> **Sequência de orquestração:** PM (Morgan) → QA (Quinn) + Arquiteto (Aria) [avaliação paralela]
> **Fonte de verdade:** `Alíquotas tributárias adicionais (avançado).docx` (09/06/2026, 4 mockups)
> **Continuação de:** [[EPIC-POR-FORA-V2-2026-06-08]] (camada de cálculo `icms-st-difal.ts`, migration `20260608000001`)
> **Status:** Draft (planejamento — NÃO implementado)
> **Frentes do EPIC:** (A) Stories S1–S6 — tributação avançada (ICMS-ST/DIFAL/ICMS Complementar). (B) **Sprint M (S1–M13) — Responsividade Mobile/Tablet** (adicionada 09/06, orquestração UX Uma + PM Morgan; fonte `Alterações mobile.docx`). Ver §9.

---

## 0. Resumo executivo

O documento do cliente pede 4 refinamentos na seção **Produtos → Precificação → "Alíquotas tributárias adicionais (avançado)"**. A análise revelou que **a camada de cálculo já está pronta** (`src/utils/icms-st-difal.ts`, 583/583 testes) e que **a migration já está aplicada no banco** (confirmado via Supabase REST: colunas avançadas existem em `products`/`services`/`budgets`/`orders`/`sales`). **Nenhuma mudança de schema é necessária.**

O trabalho é, portanto, predominantemente de **lógica/comportamento de UI** (não de cálculo nem de banco) + **a correção de um bug fiscal real de dupla contagem** descoberto na análise.

---

## 1. Decisões do produto (aprovadas pelo Hyago em 09/06)

| # | Decisão | Valor aprovado |
|---|---------|----------------|
| D1 | **Remover a "seção superior"** | Remover os **7 campos** % simples: ISS, ISS Retido, ICMS-ST%, DIFAL%, FCP%, IRPJ, CSLL. Confirmado: **nenhum produto usa override de ISS por item** → ISS passa a vir do padrão do tenant. |
| D2 | **Base de cálculo automática** | A base é **readonly**, derivada do preço montado (custo+despesas+lucro). NÃO é campo editável. Fonte canônica = `IcmsStResult.bcPropria` / `DifalResult.bc` (que já encapsulam `sale_price_base − frete − seguro − desp.acess`, pós-desconto + IPI). **Não recomputar a base na UI.** |
| D3 | **Escopo de UI = só lógica** | **NÃO criar painel nem tela nova.** Os painéis "AUDITORIA — DECOMPOSIÇÃO ICMS-ST" e "RESUMO FINAL" dos mockups são **ilustrativos**. Permitido: remover UI existente; exibir campos *readonly* e *labels inline* anexados aos controles que já existem. Proibido: qualquer container/section/tabela de auditoria ou resumo novo. |
| D4 | **Escopo de entidades** | Aplicar correção em **Produtos E Serviços** (Serviços têm o mesmo bug de dupla contagem confirmado). |

---

## 2. Bases canônicas e oráculos numéricos (os mockups SÃO os testes)

Convenção: alíquotas em base 100. As fórmulas já estão implementadas em `icms-st-difal.ts` (sem alteração).

### 2.1 ICMS-ST — Operação Interna (mockup 3)
```
Entrada: Base 100.000 · MVA original 40% · ALQ interna 17%
BC própria     = 100.000
MVA aplicada   = 40% (original — modo interna)
MVA ajustada   = 48,4337% (EXIBIDA esmaecida/readonly, NÃO aplica)
BC-ST          = 100.000 × 1,40 = 140.000,00
ICMS presumido = 140.000 × 17% = 23.800,00
ICMS próprio   = 100.000 × 17% = 17.000,00
► ICMS-ST      = 23.800 − 17.000 = R$ 6.800,00 ✓
```

### 2.2 ICMS-ST — Operação Interestadual (mockup 4)
```
Entrada: ALQ inter. origem 12% · ALQ interna destino 17% · Base 100.000 · MVA orig 40%
MVA ajustada   = [(1,40)×(1−0,12)/(1−0,17)]−1 = 48,4337%   (readonly, aplica)
BC-ST          = 100.000 × 1,484337 = 148.433,73
ICMS presumido = 148.433,73 × 17% = 25.233,73
ICMS próprio   = 100.000 × 12% = 12.000,00              (próprio usa INTERESTADUAL)
► ICMS-ST      = 25.233,73 − 12.000 = R$ 13.233,73 ✓
```

### 2.3 DIFAL (mockup 2)
```
Base capturada automaticamente (readonly) = preço montado
DIFAL = ICMS destino − ICMS origem        (decomposto inline)
FCP   = BC × alíq.FCP                       (GNRE separado)
```

### 2.4 ICMS Complementar (LC 87/96 art. 13 §1º II)
```
BC = IPI(R$) + Desp.Acessórias    ·    ICMS Compl = BC × alíq.ICMS
Automático SE: cliente NÃO contribuinte (customers.is_icms_contributor === false) E bases > 0
```

---

## 3. Estado atual × alvo (gaps)

| Frente | Hoje | Alvo |
|--------|------|------|
| Seção superior (7 campos) | `content.component.tsx` ~2043-2076 (produtos) e equivalente em serviços | **Removida** (D1) |
| Dupla contagem ST/DIFAL/FCP | `icms_st_pct/difal_pct/fcp_pct` legados entram no motor via `buildItemTaxRatesFromProduct` → `mergeItemAndTenantRates` **ao mesmo tempo** que `consolidateStDifalFromItems` | **Neutralizada condicionalmente** (S2) |
| Base de cálculo | Não exibida; cálculo usa `sale_price_base` internamente | **Readonly** exibindo `bcPropria`/`bc` (D2) |
| ICMS-ST modo | Checkbox "Operação interestadual" | Comportamento interna/interestadual + **MVA ajustada readonly** |
| DIFAL | Toggle existe; sem base nem decomposição | Base readonly + DIFAL decomposto inline |
| ICMS Complementar | Automático no motor (rodapé informativo) | Confirmar gate `is_icms_contributor === false` + bases > 0 |
| Banco | Migration `20260608000001` aplicada | **Sem mudança** |
| Cálculo (`icms-st-difal.ts`) | Pronto, 583 testes | **Sem mudança** (apenas estender testes) |

---

## 4. Stories de execução (revisadas pós-QA/Arquiteto)

### S1 — Remover a seção superior (7 campos) em Produtos e Serviços
**Descrição:** Remover o grid dos 7 campos % simples (ISS, ISS Retido, ICMS-ST%, DIFAL%, FCP%, IRPJ, CSLL) do `<details>` "avançado", mantendo o bloco "ICMS-ST e DIFAL (cálculo completo)". Remover os `useState` órfãos correspondentes e a hidratação no load.
**Critérios de aceite:**
- [ ] AC1.1 — Os 7 campos somem da UI de **Produto** (`content.component.tsx` ~2043-2076) **e de Serviço** (`services/content.component.tsx`).
- [ ] AC1.2 — O `<details>` permanece e passa a abrir direto no bloco completo; nenhum `useState` órfão nem código de hidratação morto (`serviceData?.icms_st_pct` etc.).
- [ ] AC1.3 — `npm run build` + `typecheck` + `lint` passam.
**Arquivos:** `src/page-parts/products/content.component.tsx`, `src/page-parts/services/content.component.tsx`.
**Dependência:** atômica com S2 (mesmo PR — evita estado intermediário com motor duplicando).

### S2 — Neutralizar dupla contagem (condicional) + persistência
**Descrição:** **Correção do Arquiteto (NEEDS_REVISION):** a neutralização **NÃO** deve remover ICMS_ST/DIFAL/FCP do mapa global `ITEM_RATE_BY_TAX_TYPE` (quebraria produtos legados que usam o caminho de % plano *sem* os toggles `*_active`). Em vez disso, neutralizar **condicionalmente na leitura**, em `buildItemTaxRatesFromProduct`:
- Se `icms_st_active === true` → `icms_st_pct = null`.
- Se `difal_active === true` → `difal_pct = null` e `fcp_pct = null`.
- Caso contrário → preserva o legado (retrocompatível).
Adicionalmente, parar de persistir os 3 pcts no save (dados futuros).
**Critérios de aceite:**
- [ ] AC2.1 (leitura condicional) — Produto/serviço com `icms_st_active=true` NÃO emite override `ICMS_ST` em `mergeItemAndTenantRates`; idem `difal_active` → `DIFAL`+`FCP`. Mapa global intacto (IS/IBS/CBS/IPI/ISS_RETIDO inalterados).
- [ ] AC2.2 (legado preservado) — Produto **sem** `*_active` mas com `icms_st_pct` legado gravado continua emitindo o override (não quebra dados de produção antigos).
- [ ] AC2.3 (persistência) — Save de produto/serviço não grava mais `icms_st_pct/difal_pct/fcp_pct` (ficam `null`).
- [ ] AC2.4 (anti-dupla-contagem) — Teste de integração no motor/orçamento: produto com ST ativo **+** `icms_st_pct` legado → ICMS-ST aparece **uma só vez** no resultado (lateral), some do `taxes_outside` do RRO.
- [ ] AC2.5 (IRPJ/CSLL) — Em LUCRO_REAL, remover override cai em `resolveStructuralProfitTaxes` (profit×15%/9%) — comportamento canônico. Regressão por regime (LR estrutural; Presumido/Simples/MEI via tenant) documentada e testada.
**Arquivos:** `src/utils/item-tax-rates.ts` (`buildItemTaxRatesFromProduct` ~515-557), `content.component.tsx` (persistência ~1052-1054) produtos+serviços.

### S3 — DIFAL: base automática readonly + decomposição inline
**Descrição:** Ao ativar DIFAL, exibir a base **readonly** (`DifalResult.bc`) e exibir inline ICMS destino, ICMS origem e DIFAL = destino − origem. Sem painel novo (D3).
**Critérios de aceite:**
- [ ] AC3.1 — Base do DIFAL readonly, refletindo `DifalResult.bc` (não recomputada na UI).
- [ ] AC3.2 — Exibe inline (labels readonly): ICMS destino, ICMS origem, **DIFAL** e FCP, coerentes com `computeDifal`.
- [ ] AC3.3 — Rótulo "valor de referência (sem desconto)" para alinhar com a divergência cadastro (base cheia) × transação (pós-desconto).
- [ ] AC3.4 — Nenhum container/section novo (gate D3).
**Arquivos:** `content.component.tsx` (bloco DIFAL ~2117-2138) produtos+serviços.

### S4 — ICMS-ST: modos interna/interestadual + MVA ajustada readonly
**Descrição:** Modo **Interna**: usa MVA original; "MVA ajustada" exibida esmaecida/readonly (não aplica). Modo **Interestadual**: MVA ajustada calculada (`mvaAjustada`) readonly; ICMS próprio usa interestadual, presumido usa interna. Base readonly.
**Critérios de aceite:**
- [ ] AC4.1 — Modo Interna: `mvaAplicada === pct(mvaOriginal)`; MVA ajustada exibida readonly/esmaecida = `mvaAjustada()`. **Oráculo 2.1 → ICMS-ST R$ 6.800,00.**
- [ ] AC4.2 — Modo Interestadual: MVA ajustada = `[(1+MVA)(1−inter)/(1−intra)−1]` readonly; próprio = base×interestadual; presumido = BC-ST×interna. **Oráculo 2.2 → ICMS-ST R$ 13.233,73.**
- [ ] AC4.3 — Base readonly (D2); invariante "ST e DIFAL nunca coexistem" travada por teste.
- [ ] AC4.4 — Nenhum container/section novo (gate D3).
**Arquivos:** `content.component.tsx` (bloco ICMS-ST ~2101-2138) produtos+serviços.

### S5 — ICMS Complementar automático condicionado
**Descrição:** Garantir cálculo automático (`computeIcmsComplementar`) **apenas** quando cliente é não-contribuinte (`customers.is_icms_contributor === false`) e há IPI/frete/seguro. Sem coluna pct própria (derivado na Etapa 17 — `absorption.ts`). Sem painel.
**Critérios de aceite:**
- [ ] AC5.1 — Cliente contribuinte → Complementar = 0; não-contribuinte com bases > 0 → `(IPI + Desp.Acess) × ICMS`.
- [ ] AC5.2 — Bases vazias → 0.
- [ ] AC5.3 — Wiring validado no orçamento (`orcamentos/index.tsx`, gate `icmsComplApplies`).
**Arquivos:** `src/pages/orcamentos/index.tsx`, validação em `content.component.tsx`.

### S6 — Regressão cross-módulo + auditoria de dados
**Descrição:** Garantir propagação produto/serviço → orçamento → pedido → venda → PDF/WhatsApp via fonte única (`consolidateStDifalFromItems` + `computeTotalACobrar`), sem drift. Auditar dados de risco.
**Critérios de aceite:**
- [ ] AC6.1 — `orcamentos`/`pedidos`/`vendas` consolidam via `consolidateStDifalFromItems` (fonte única); `computeTotalACobrar` correto.
- [ ] AC6.2 — Espelhamento pedido/venda: definir se filhos param de herdar o campo legado (`orcamentos/index.tsx` ~1254).
- [ ] AC6.3 — PDF/WhatsApp exibem total a cobrar correto (1 cenário ST + 1 DIFAL).
- [ ] AC6.4 (auditoria) — Identificar produtos/serviços com `*_active=true` mas parâmetros avançados (MVA/ALQs) ausentes — não podem cair a ICMS-ST=0 silenciosamente. Listar/alertar (não migration de dados sem aprovação).
**Arquivos:** `src/pages/orcamentos/index.tsx`, `src/pages/vendas/index.tsx`, geradores PDF/WhatsApp.

---

## 5. Sequenciamento

1. **S1 + S2 (atômico, mesmo PR)** — fundação: remover UI **e** neutralizar motor (com leitura condicional + testes). Estado intermediário quebraria precificação.
2. **S6-parcial** — validar a neutralização numericamente (RRO antes/depois de um produto `*_active`) **antes** de tocar a UI readonly.
3. **S4** — núcleo fiscal (ICMS-ST interna/interestadual), valida `computeIcmsSt` com os oráculos 2.1/2.2.
4. **S3** — DIFAL (análogo, menor).
5. **S5** — ICMS Complementar (depende de bases consistentes de S3/S4).
6. **S6-final** — regressão cross-módulo completa.

---

## 6. Veredictos da orquestração

| Agente | Veredicto | Resolução no plano |
|--------|-----------|--------------------|
| 🧪 QA (Quinn) | **CONCERNS** | Oráculos numéricos adicionados (§2); Serviços promovido a escopo (D4/S1/S2); ACs reescritos com valores esperados; testes de integração anti-dupla-contagem (AC2.4) |
| 🏛️ Arquiteto (Aria) | **NEEDS_REVISION** | S2 reescrita: neutralização **condicional na leitura** (não global no `ITEM_RATE_BY_TAX_TYPE`); fonte da base D2 explicitada (`bcPropria`/`bc`); IRPJ/CSLL por regime; rótulo "valor de referência (sem desconto)" |

**Constituição (Art. IV — No Invention):** todas as regras rastreiam ao documento-fonte 09/06, ao [[EPIC-POR-FORA-V2-2026-06-08]] ou ao código verificado. Nenhuma feature inventada.

---

## 7. Confirmações de infraestrutura

- ✅ **Banco:** migration `20260608000001` aplicada (verificado via Supabase REST). Sem DDL novo.
- ✅ **Cálculo:** `src/utils/icms-st-difal.ts` pronto (583/583). Apenas **estender** testes — não recriar.
- ⚠️ **Bug fiscal real:** dupla contagem ST/DIFAL/FCP (legado + lateral) — corrigida em S2.

---

## 9. SPRINT M — Responsividade Mobile/Tablet (UX Uma + PM Morgan)

> **Adicionada:** 2026-06-09 · **Fonte:** `Alterações mobile.docx` (4 diretrizes + 13 screenshots) · **Orquestração:** UX (Uma) → PM (Morgan)
> **Status:** Draft (planejamento — NÃO implementado, DM4)

### 9.1 Decisões do cliente (Hyago, 09/06 — invioláveis)

| # | Decisão |
|---|---------|
| DM1 | Gatilho de ações = **kebab ⋮ único** por linha (popup Editar \| Excluir \| Ações). Sem lápis separado. |
| DM2 | **Tablet (640–1023) mantém tabela multi-coluna.** O "Row Compacto" é exclusivo do celular (≤639). |
| DM3 | Tocar na **linha abre o detalhe/edição**; o **⋮ abre o menu de ações**. |
| DM4 | Fase atual = **SÓ PLANEJAMENTO**. Nenhum código implementado. |

### 9.2 Padrão central "Row Compacto" (mobile ≤639px)

Cada registro em **1 linha** (altura-alvo 56–72px vs ~140–300px atuais):
```
┌────────────────────────────────────────────────┐
│ Identificador (truncate)          R$ 1.234,56  ⋮ │  ← linha 1
│ subinfo · subinfo (código/data/status Tag)       │  ← linha 2 (meta)
├──────────────────────────────────────────────────┤
│  [ Ação primária ]            [ Cancelar ]       │  ← faixa inferior (SÓ pipeline)
└──────────────────────────────────────────────────┘
```
- Col 1 flex truncate (id + subinfo) · Col 2 nowrap (valor, cor verde entrada/vermelho saída) · Col 3 kebab ⋮ 44×44.
- **Faixa inferior** só em telas de pipeline (Vendas/Orçamentos/Pedidos): ação primária (esq.) + destrutiva `danger` (dir.). Editar/Excluir ficam no ⋮ (não duplicar).
- **Bugs Caixa/Serviços** (quebra letra-a-letra): causa = `word-break: break-word` (globals.scss ~2716) sobre strings sem espaço + container estreito. Fix = `overflow-wrap:anywhere; word-break:normal` + valor `nowrap` + placeholder largura plena. **Sem scroll horizontal.**
- **KPIs**: variante `.kpi-card--compact` horizontal (~64px), grid 2×2 mobile. Reusa `CardKPI`.

### 9.3 Stories

**Grupo A — Infraestrutura CSS (fundação)**
- **M1** — Classe `.pc-row-compact` (linha única 3 colunas, ≤639px, altura 56–72px, col1 truncate, col2 nowrap+cor, col3 ⋮ 44×44). Só afeta ≤639 (DM2). Arq.: `globals.scss`.
- **M2** — `.pc-row-compact__actions` (faixa pipeline: primária esq. + `danger` dir.; Editar/Excluir proibidos na faixa). Dep.: M1.
- **M3** — Fix `word-break` sistêmico (`overflow-wrap:anywhere`; valor nowrap; `.ant-table-placeholder` largura plena; sem scroll-x; zero regressão desktop). Arq.: `globals.scss ~2716`.
- **M4** — `.kpi-card--compact` (flex-row, ícone 36–40px, valor 18–20px, label 11px; reusa `CardKPI`, sem novo componente).

**Grupo B — Pipeline (faixa inferior)**
- **M5** — Orçamentos: Row Compacto [Cliente · código+data · total · ⋮] + faixa (ver §9.4). Linha abre detalhe (DM3); tablet=tabela (DM2). Dep.: M1,M2.
- **M6** — Pedidos: idem; respeitar `canModify` (Editar desabilitado em `SENT_TO_SALE`). Dep.: M1,M2.
- **M7** — Vendas: KPIs compactos + "Orçamentos para lançar" [Cliente·valor·⋮]+faixa [Lançar recebimento][Cancelar] + vendas concluídas Row Compacto. Dep.: M1,M2,M4.

**Grupo C — Listagens simples**
- **M8** — Clientes [Nome·doc/tel·⋮] e Funcionários [Nome·cargo/email·⋮], sem faixa. Dep.: M1.
- **M9** — Itens (reusa `.pc-items-grid`: Nome·valor·⋮ mesma linha) e Serviços [Nome·preço·⋮] + **fix bug Empty** (via M3). Dep.: M1,M3.
- **M10** — Produtos: padronizar lápis→⋮ (DM1). Prioridade baixa. Dep.: M1.

**Grupo D — Caixa**
- **M11** — Caixa Entradas/Saídas: fix quebra (M3) + Row Compacto [Categoria/desc · Data · valor cor · ⋮]; manter navegação de mês `‹ Abr ›`; **substituir** `no-mobile-stack`+`scroll x:max-content` por Row Compacto no mobile, tabela só ≥640 (DM2). Dep.: M1,M3. ⚠️ ver questão §9.6.3.

**Grupo E — Dashboard**
- **M12** — Dashboard KPIs compactos grid 2×2 (~64px). Dep.: M4.

**Grupo F — Regressão**
- **M13** — Auditoria tablet (DM2: tabela em 640px) + desktop pixel-inalterado + convivência do card-view sistêmico (`mobile-table-labels.ts`) com Row Compacto (sem dupla renderização/labels órfãos) + tabelas com inputs inline NÃO viram card. Dep.: M5–M12.

### 9.4 Mapa de ações de pipeline (rótulos VERIFICADOS no código — não inventados)

**Orçamentos** (`orcamentos/index.tsx` statusConfig 82–89):
| Status | Primária (esq.) | Destrutiva (dir.) |
|--------|-----------------|-------------------|
| `DRAFT` | **Enviar para vendas** *ou* **Enviar para Pedido** (1 na faixa, outra no ⋮ — ver §9.6.2) | Excluir/Cancelar |
| `APPROVED`/`AWAITING_PAYMENT` | **Finalizar** | Excluir/Cancelar |
| Outros (≠`CANCELLED`) | — | Excluir/Cancelar |

**Pedidos** (`pedidos/index.tsx`):
| Status | Primária | Destrutiva |
|--------|----------|-----------|
| `DRAFT`/`AWAITING_PAYMENT`/(`SENT_TO_SALE` se `budgetBlocked`) | **Enviar para Aprovação** *(rótulo real — NÃO "Faturar")* | Excluir |
| Outros (≠`CANCELLED`) | — | Excluir |

**Vendas** (`vendas/index.tsx`):
| Contexto | Primária | Destrutiva |
|----------|----------|-----------|
| "Orçamentos para lançar" | **Lançar recebimento** | Cancelar |
| Venda `AWAITING_PAYMENT` + `FROM_ORDER` | **Lançar pagamento** *(string distinta)* | Cancelar |
| Venda concluída geral | — | Cancelar |

### 9.5 Sequenciamento

`M3 → M1 → M2 → M4` (fundação) → **M11 + M9 (bugs primeiro, maior valor)** → M5/M6/M7 (pipeline) → M8/M12 → M10 → **M13 (regressão, por último)**.

### 9.6 Riscos & questões abertas

**Riscos:** R1 card-view sistêmico já injeta `data-label` → Row Compacto deve usar opt-out `.no-mobile-stack` para não duplicar. R2 breakpoint 639 (useDevice) vs 640 (card-view CSS) — alinhar único valor. R3 alterar `word-break` global pode regredir desktop → escopar a mobile (M13 valida). R4 tabelas com inputs inline (drawers de itens) NÃO viram card. R5 Caixa hoje usa scroll-x — trocar por Row Compacto precisa confirmação.

**Questões abertas (decisão humana):**
1. Breakpoint canônico: **639** ou **640**? (recomendado: alinhar tudo em 640px CSS p/ casar com o card-view existente).
2. Orçamento `DRAFT`: qual das 2 ações ("Enviar para vendas" / "Enviar para Pedido") vira primária na faixa? A outra vai ao ⋮.
3. Caixa: confirmar remoção do scroll horizontal no mobile em favor do Row Compacto (tablet mantém tabela).
4. Manter rótulos reais do código ("Enviar para Aprovação", etc.) ou renomear (renomeação = escopo separado).
5. Quais ações secundárias entram em "Ações" no ⋮ por tela (ex.: "Enviar via WhatsApp"/"Ver" em Orçamentos).

---

## 10. Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-09 | Orion (aios-master) | Criação do EPIC pós-orquestração PM→QA→Arquiteto. Decisões D1-D4 aprovadas por Hyago. Status: Draft (planejamento, não implementado). |
| 2026-06-09 | Orion (aios-master) | **Adicionada Sprint M — Responsividade Mobile/Tablet** (§9), orquestração UX (Uma) + PM (Morgan) a partir de `Alterações mobile.docx`. Decisões DM1–DM4 aprovadas por Hyago. 13 stories (M1–M13). Status: Draft (planejamento). |
