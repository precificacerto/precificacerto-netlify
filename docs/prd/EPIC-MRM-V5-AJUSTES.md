# EPIC-MRM-V5-AJUSTES — Ajustes Estruturais Motor RRO (V4 → V5)

**ID:** EPIC-MRM-V5-AJUSTES
**Versão:** 1.1
**Data:** 2026-05-22
**Status:** Draft (PRD v1.1 — corrigido com fórmulas decodificadas do Excel oficial)
**Owner:** @pm Morgan (Product Management)
**Commit baseline:** `d13b54e` — "feat: implement Motor RRO v4 with enhanced tax calculations and UI components"
**Engine baseline:** `MRM_ENGINE_VERSION = 2.1.0`
**Engine alvo:** `MRM_ENGINE_VERSION = 2.2.0` (bump MINOR — apenas campos novos opcionais retrocompatíveis no `TaxBreakdown`)
**Regime:** Todos (MEI, SN, LP, LR)
**Template:** `aios-core/development/templates/brownfield-prd-tmpl.yaml`

> **Restrição CRÍTICA do usuário:** *"Não é para criar novas abas, somente ajustar a lógica."*
> Nenhum novo screen/tab/route será introduzido. Toda exposição de dados será feita **dentro de componentes já existentes** (`consolidated-dre-block`, `residual-distribution-block`, modais de detalhe de imposto, tooltips, expansíveis).

> **🔄 Nota de revisão v1.1 (2026-05-22):** Esta versão corrige **4 divergências críticas** identificadas após decodificação célula-a-célula do Excel oficial (`Motor de descontos do resultado residual operacional.xlsx`), orquestrada por Orion (aios-master). Mudanças principais: (a) fórmula de `peso_op_interna` (D1) — vem da precificação original do produto, não de `cp+mod+dop/rv`; (b) valor numérico de `ancora_interna` no exemplo (D2) — é PÓS-desconto; (c) base canônica dos tributos por fora (D3) — `Âncora − ICMS − PIS/COFINS`, não `RV − ICMS − PIS − COFINS`; (d) fórmula PIS/COFINS na reapuração (D4) — `9,25% sobre (Âncora − ICMS)`, não `7,6775% sobre RV`. Detalhes completos no Change Log (Seção 10).

---

## 1. Resumo Executivo

### 1.1 Problema
O Motor RRO V4 (commit `d13b54e`) já entrega reapuração de margem ponta-a-ponta para os 4 regimes, com fórmula PIS/COFINS alinhada ao STF (sobre `RV − ICMS − ISS`), bloqueio de save quando `RRO ≤ 0` e exibição do `limite_minimo`. Entretanto, a auditoria cruzando o motor com **3 documentos oficiais** — (a) *Relatório Motor Descontos Resultado Residual Operacional*, (b) *Formação Preço Por Dentro/Fora* (EC 132/2023 + LC 214/2025), (c) planilha Excel de referência — identificou **10 lacunas** que comprometem:

- **Rastreabilidade** dos cálculos (memória de cálculo em cascata de 13 itens não exposta na UI),
- **Fidelidade conceitual** à spec oficial ("Peso Op Interna" e "Âncora Interna" não existem como passos explícitos no motor),
- **Conformidade tributária** (base dos tributos por fora difere da fórmula canônica `Total_Op_Dentro − PIS/COFINS − ICMS` da planilha de referência),
- **Robustez de invariantes** (relação PIS/COFINS construção 7,6775% × apuração 9,25% não é validada; ISS sem segregação RPS/SN),
- **Coesão arquitetural** (regime e alíquotas duplicados entre `calc-tax-engine` edge e `mrm-orchestrator` client; créditos tributários fora do motor; guard MEI/SN apenas em `console.warn`).

### 1.2 Valor
- **Auditável:** Usuário e contador conseguem, dentro do próprio orçamento/pedido/venda, abrir uma "memória de cálculo" com os 13 itens cascateados (RB → desconto → RV → ICMS → ISS → PIS/COFINS → CP/MOD/DOP → RRO → componentes proporcionais → tributos por fora).
- **Confiável:** Base dos tributos por fora passa a refletir exatamente a fórmula da planilha de referência (R$ 0,02 de tolerância em golden tests).
- **Robusto:** Invariantes tributárias (PIS/COFINS construção vs apuração) são validadas por contract test; aviso de UI (não só `console.warn`) quando regime bloqueia CSLL/IRPJ.
- **Coeso:** Créditos tributários (recuperáveis vs não-recuperáveis) integram o `ReapurationInput`; única fonte de verdade de regime+alíquotas entre edge e client (`mrm-rates-loader` autoritativo).

### 1.3 Impacto
- **Engine:** Bump 2.1.0 → 2.2.0 (MINOR — schema do `TaxBreakdown` ganha **5 novos campos opcionais** (`peso_op_interna`, `ancora_interna`, `cascade_trace`, `taxes_outside_base`, `tax_credits_applied`) + `ReapurationInput` ganha **2 campos opcionais** (`peso_op_interna`, `tax_credits`); callers legados continuam funcionando).
- **UI:** Zero novas telas. Apenas **expansão/tooltip/badge** em componentes existentes.
- **Golden tests:** Devem continuar passando com tolerância R$ 0,02 (Excel R$ 17.471,16 ± 0,02 para RRO no cenário canônico RB=190.055,94 com desconto 10%). Novos golden tests cobrem L4 (base tributos por fora canônica = Âncora − ICMS − PIS/COFINS) e L8 (invariante PIS/COFINS dupla perspectiva 7,6775%↔9,25%).
- **Backward compatibility:** `TaxBreakdown` antigos (V4 com `engine_version=2.1.0`) seguem válidos para leitura; campos novos são `null` em snapshots antigos. ADR-003 (snapshot imutável) garante que snapshots antigos NÃO são recalculados.
- **Migrations Supabase:** **ZERO migrations obrigatórias** — todos os campos novos cabem no JSONB existente `tax_breakdown` em `budget_items`/`order_items`/`sale_items`. Confirmado pela análise da Aria (ARCH-EPIC-MRM-V5 § 2A). Migration L9 (ISS regime) postergada como follow-up (confirmação de @architect via ADR-007).
- **Novos ADRs:** ADR-008 (D4 — mudança fórmula PIS/COFINS default) precisa ser aprovado por @architect antes do início da implementação da STORY-002.AC5.

---

## 2. Objetivos do Epic (mensuráveis)

| # | Objetivo | KPI / Critério de medição |
|---|---------|---------------------------|
| **O1** | Expor "Peso Op Interna", "Âncora Interna" e os 13 itens da memória de cálculo cascata em `TaxBreakdown` + componentes existentes | 4 novos campos persistidos em `TaxBreakdown` (`peso_op_interna`, `ancora_interna`, `cascade_trace`, `taxes_outside_base`); painel expansível na UI exibe os 13 itens |
| **O2** | Alinhar base dos tributos por fora com a planilha de referência (`Total_Op_Dentro − PIS/COFINS − ICMS`) | Golden test do Excel (RB R$ 190.055,94, desc 10%) com tolerância R$ 0,02 mantém-se passando; tributos por fora têm `base` igual à fórmula canônica |
| **O3** | Garantir invariante PIS/COFINS construção 7,6775% × apuração 9,25% por contract test | Contract test bloqueia tax-rate-period inválido em `mrm-rates-loader`; CI quebra se invariante for violada |
| **O4** | Integrar créditos tributários (recuperáveis/não-recuperáveis) ao motor RRO sem novas telas | `ReapurationInput` ganha `tax_credits: { recoverable: number, non_recoverable: number }`; valores são lidos do cadastro já existente do item; impacto refletido no `TaxBreakdown` |
| **O5** | Unificar fonte de verdade de regime+alíquotas (`mrm-rates-loader`) e remover duplicação `calc-tax-engine` ↔ `mrm-orchestrator` | Diff de regime/alíquotas entre edge e client = 0 em shadow-mode; eliminação de 1 ponto de duplicação |
| **O6** | Substituir `console.warn` do guard MEI/SN por aviso UI persistente em `residual-distribution-block` | Quando regime ∈ {MEI, SN} e usuário tenta digitar CSLL/IRPJ > 0, aparece banner inline "Guard ativo — CSLL/IRPJ forçados a 0 neste regime" |

---

## 3. Escopo

### 3.1 IN (dentro do Epic)
- Ajuste lógico em `src/utils/margin-reapuration.ts` (etapas 4, 5, 7, 9 da spec oficial).
- Extensão **retrocompatível** de `TaxBreakdown` em `src/types/mrm.ts` (apenas adição de campos opcionais).
- Extensão de `ReapurationInput` para suportar créditos tributários.
- Refactor de `mrm-orchestrator.ts` para consumir alíquotas exclusivamente via `mrm-rates-loader`.
- Validação de invariante PIS/COFINS em `mrm-rates-loader.ts` (assert no carregamento de períodos).
- Migração do guard MEI/SN: motor mantém `console.warn` estruturado; UI ganha banner.
- Exposição da memória cascata (13 itens) em painel expansível **dentro** de `consolidated-dre-block.component.tsx`.
- Exibição de "Peso Op Interna" e "Âncora Interna" em tooltip/linha de `consolidated-dre-block` (componente existente).
- Banner "Guard ativo" em `residual-distribution-block.component.tsx` (componente existente).
- Golden tests novos para L4 (base tributos por fora) e L8 (invariante PIS/COFINS).
- Backfill: snapshots existentes continuam válidos; campos novos = `null` quando ausentes.

### 3.2 OUT (fora do Epic — explicitamente)
- **Nenhuma nova tela, aba, rota ou modal full-page** (restrição crítica do usuário).
- Alterações em `edge-function calc-tax-engine` além das estritamente necessárias para eliminar duplicação (L7) — a unificação roda do lado client.
- Reescrita do motor (continua sendo função pura).
- Mudanças em DB schema fora do `TaxBreakdown` JSON.
- Reforma tributária 2027 (IBS/CBS) — segue em backlog separado.
- Sincronização com módulo Formação de Preço — recomendação do PDF 1 fica como dependência futura (Epic posterior).
- Refatoração de `calc-tax-preview.ts` (preview puro, sem reapuração).

### 3.3 Premissas
- Engine continua sendo função **pura** (ADR-004 — sem I/O, sem fetch). UI faz I/O e injeta dados.
- Modos `PROFIT_REDUCTION` / `SELLER_REDUCTION` permanecem descontinuados (R2 da spec).
- Reapuração roda em orçamento, pedido E venda (R4).
- MOD continua imune (R6).
- Bloqueio de save quando `RRO ≤ 0` (já em V4) permanece.

---

## 4. Stories Propostas (5 stories — 32 horas estimadas)

| ID | Título curto | Sprint | Horas | Lacunas |
|----|--------------|--------|-------|---------|
| STORY-MRM-V5-001 | Adicionar `peso_op_interna` (snapshot+orchestrator) + `ancora_interna` + `cascade_trace` ao motor e schema | S1 | 10h | L1, L2, L3 (motor) |
| STORY-MRM-V5-002 | Corrigir base canônica dos tributos por fora (`Âncora − ICMS − PIS/COFINS`) + invariante PIS/COFINS dupla perspectiva + fórmula 9,25% apuração + ADR-008 | S2 | 8h | L4, L8 |
| STORY-MRM-V5-003 | Unificar fonte de regime/alíquotas via `mrm-rates-loader`; mover validação `RRO > 0` para motor | S2 | 6h | L5, L7 |
| STORY-MRM-V5-004 | Integrar créditos tributários (recuperáveis/não) ao `ReapurationInput` + segregar ISS por regime | S3 | 6h | L6, L9 |
| STORY-MRM-V5-005 | Exposição UI: memória cascata (13 itens) + banner guard MEI/SN — sem novas telas | S4 | 6h | L3 (UI), L10 |

**Total:** 36h (dentro da janela 30-40h definida pelo usuário; aumento de 4h vs v1.0 absorvido pelas correções D1+D4 — cálculo peso no orchestrator e ADR-008).

---

### STORY-MRM-V5-001 — Adicionar Peso/Âncora Op Interna + memória cascata ao motor

**Sprint:** S1 | **Estimativa:** 8h | **Owner sugerido:** @dev Dex | **Validador:** @architect Aria + @qa Quinn

**User story:**
> **Como** auditor/contador do cliente,
> **quero** ver explicitamente "Peso Op Interna" e "Âncora Interna" calculados pelo motor e a memória cascata dos 13 itens da spec oficial,
> **para** validar etapa a etapa que o RRO foi apurado conforme o *Relatório Motor Descontos Resultado Residual Operacional*.

**Critérios de aceitação (8):**
1. **AC1 — Schema:** `TaxBreakdown` em `src/types/mrm.ts` ganha 3 novos campos opcionais retrocompatíveis: `peso_op_interna: number | null`, `ancora_interna: number | null`, `cascade_trace: CascadeStep[] | null`. Snapshots V4 são lidos sem erro (campos = `null`).
2. **AC2 — Origem e cálculo do Peso (CORRIGIDO v1.1 — D1):** O `peso_op_interna` é **propriedade da precificação original do item/serviço** (não cálculo runtime sobre cp/mod/dop do orçamento). Vem do markup divisor da configuração do produto:
   ```
   Op_Interna_Original = custo_unitario / (1 − Σ percentuais_internos)
       onde Σ percentuais_internos = comissão_pct + lucro_pct + irpj_pct + csll_pct
                                   + MO_admin_pct + desp_fixa_pct + desp_var_pct + desp_fin_pct
                                   + icms_pct + pis_cofins_pct
   Op_Externa_Original = Σ (IBS, CBS, IPI, ICMS-ST, DIFAL, FCP)
                          aplicado sobre (Op_Interna_Original − ICMS − PIS/COFINS)
   RB_total            = Op_Interna_Original + Op_Externa_Original
   peso_op_interna     = Op_Interna_Original / RB_total       (célula I21 do Excel)
   peso_op_externa     = 1 − peso_op_interna                  (célula I26 do Excel)
   ```
   Excel ref (cenário canônico H4=R$ 53.509,92, RB total H28=R$ 190.055,94): `peso_op_interna ≈ 0,931585` (93,1585%), `peso_op_externa ≈ 0,068415` (6,8415%). O motor consome esse peso como INPUT (snapshotado/carregado do item), não o computa em tempo de reapuração.
3. **AC3 — Âncora PÓS-desconto (CORRIGIDO v1.1 — D2):** `ancora_interna = rv × peso_op_interna`, onde `rv = rb − desconto`. É a base operacional reapurada PÓS-desconto (célula H36 do Excel), **distinta** de `Op_Interna_Original` (H21, que é PRÉ-desconto, do markup divisor original). Excel ref no cenário canônico com 10% de desconto: `ancora_interna ≈ R$ 159.342,38` (= 171.050,35 × 0,931585), não R$ 177.053,25.
4. **AC4 — Memória cascata:** `cascade_trace` é um array de exatamente **13 entradas** (1 por item da spec oficial: RB, Desconto, RV, ICMS sobre RV, Base pós-ICMS, ISS, Base pós-ISS, PIS, COFINS, CP, MOD, DOP, RRO). Cada entrada tem `{ step: number, label: string, base: number, rate: number | null, amount: number }`.
5. **AC5 — Engine version:** `MRM_ENGINE_VERSION` é bumped para `2.2.0`. Constante exportada e usada no campo `engine_version` do breakdown.
6. **AC6 — Golden test (CORRIGIDO v1.1 — D2):** Test do Excel (RB R$ 190.055,94, desc 10%) continua passando com tolerância R$ 0,02 para `rro` (esperado ≈ R$ 17.471,16 — célula H54) e ganha 4 asserções novas:
   - `peso_op_interna ≈ 0,931585` (célula I21, ± 1e-5)
   - `peso_op_externa ≈ 0,068415` (célula I26, ± 1e-5)
   - `ancora_interna ≈ R$ 159.342,38` (célula H36, PÓS desconto, ± R$ 0,02)
   - `cascade_trace.length === 13` (exatamente 13 itens)
7. **AC7 — Pureza:** Motor permanece função pura (ADR-004) — sem I/O, sem fetch. `cascade_trace` é construído inline.
8. **AC8 — Documentação inline:** Comentários JSDoc no motor referenciam Etapas 2, 4, 5, 7 da spec oficial.
9. **AC9 — Snapshot do `peso_op_interna` (NOVO v1.1 — D1):** O `peso_op_interna` é INPUT obrigatório do motor (não output computado). Fontes em ordem de prioridade:
   1. **Snapshot histórico**: se o item já possui `peso_op_interna` persistido em `budget_items.tax_breakdown` / `order_items.tax_breakdown` / `sale_items.tax_breakdown`, usar o valor histórico (imutabilidade — ADR-003).
   2. **Cálculo runtime no orchestrator** (não no motor puro): se ausente, `src/utils/mrm-orchestrator.ts` lê configuração do produto/serviço (`products.cost`, percentuais de comissão/lucro/IRPJ/CSLL/MO/despesas, alíquotas internas e externas configuradas em `tax_rate_periods`), aplica markup divisor e calcula `Op_Interna_Original`, `Op_Externa_Original` e `peso_op_interna = Op_Interna / (Op_Interna + Op_Externa)`.
   3. **Default conservador**: se config incompleta, `peso_op_interna = 1` (motor degrada para comportamento V4 — toda a operação é interna, zero tributos por fora).
   
   O motor puro recebe o peso já calculado via `ReapurationInput.peso_op_interna` (campo opcional retrocompatível). Pureza ADR-004 preservada — motor não faz I/O nem markup divisor.

**Lacunas cobertas:** L1, L2, L3 (parte motor).

**Arquivos afetados:**
- `src/types/mrm.ts` (extensão `TaxBreakdown` + `ReapurationInput.peso_op_interna` opcional + novo type `CascadeStep`)
- `src/utils/margin-reapuration.ts` (consome peso via input + populate cascade_trace + cálculo âncora pós-desconto)
- `src/utils/mrm-orchestrator.ts` (calcula `peso_op_interna` via markup divisor a partir de config do produto, quando ausente no snapshot)
- `src/utils/__tests__/margin-reapuration.test.ts` (golden Excel + novos asserts: peso, peso_externo, âncora pós-desconto, cascade 13 itens)
- `src/utils/__tests__/mrm-orchestrator.test.ts` (test do cálculo de peso a partir da config do produto)

**Riscos:**
- (R) Snapshots V4 persistidos em `budget_items.tax_breakdown` podem causar warnings de schema se TypeScript não tratar `| null`. Mitigação: campos opcionais com default `null` em deserialização.
- (M) Cálculo do `peso_op_interna` no orchestrator depende de alíquotas externas (IBS/CBS/IPI/ICMS-ST) estarem cadastradas em `tax_rate_periods`. Mitigação: default conservador `peso_op_interna = 1` mantém comportamento V4.

**Dependências:** Nenhuma.

---

### STORY-MRM-V5-002 — Base canônica dos tributos por fora + invariante PIS/COFINS

**Sprint:** S2 | **Estimativa:** 6h | **Owner sugerido:** @dev Dex | **Validador:** @architect Aria

**User story:**
> **Como** desenvolvedor que precisa reproduzir os números da planilha Excel oficial,
> **quero** que `computeTaxesOutside` use a base canônica `Total_Op_Dentro − PIS/COFINS − ICMS`,
> **para** que IBS/CBS/IPI/ICMS-ST/DIFAL/FCP/ISS_RETIDO sejam apurados sobre a base correta da EC 132/2023.

**Critérios de aceitação (7):**
1. **AC1 — Cálculo base canônica (CORRIGIDO v1.1 — D3, alinhado Excel H62/H65/H66):** Nova função `computeTaxesOutsideBase(breakdown): number` em `margin-reapuration.ts` retorna `ancora_interna − Σ(ICMS + PIS + COFINS)`. **Justificativa matemática**: na célula H62 do Excel, `Total_Op_Dentro_Final = Σ(componentes_distribuídos + custos + despesas + ICMS + PIS/COFINS) ≡ Âncora_Interna` (identidade válida porque RRO é 100% redistribuído entre Comissão+Lucro+IRPJ+CSLL na Etapa 4). Portanto:
   ```
   H65 (IBS final) = (H62 − H43 − H41) × C65
                   ≡ (Âncora − PIS/COFINS − ICMS) × IBS_rate
   H66 (CBS final) = (H62 − H43 − H41) × C66
                   ≡ (Âncora − PIS/COFINS − ICMS) × CBS_rate
   ```
   ISS NÃO entra na base canônica (não aparece na planilha; ICMS e PIS/COFINS são os tributos isolados pela LC 214/2025). Quando houver ISS, ele entra no grupo "por dentro" mas a base por fora permanece `Âncora − ICMS − PIS/COFINS`.
2. **AC2 — Persistência:** `TaxBreakdown` ganha novo campo opcional `taxes_outside_base: number | null` que armazena essa base canônica (= `ancora_interna − ICMS − PIS/COFINS`). Cada `TaxLine` em `taxes_outside` passa a ter `base = taxes_outside_base` (consistente).
3. **AC3 — Golden test (CORRIGIDO v1.1 — D3):** Para o cenário Excel ref (RB 190.055,94, desc 10%, IBS 1%, CBS 8,75%), soma `tax_amount` dos por-fora bate ± R$ 0,02 com planilha. Valores intermediários esperados:
   - `ancora_interna ≈ R$ 159.342,38` (H36)
   - `ICMS_reapurado ≈ R$ 27.088,20` (H41 = Âncora × 17%)
   - `PIS/COFINS_reapurado ≈ R$ 12.233,53` (H43 = (Âncora − ICMS) × 9,25%)
   - `taxes_outside_base ≈ R$ 120.020,65` (Âncora − ICMS − PIS/COFINS)
   - `IBS_final ≈ R$ 1.200,21` (base × 1%, H65)
   - `CBS_final ≈ R$ 10.501,81` (base × 8,75%, H66)
4. **AC4 — Invariante PIS/COFINS construção × apuração (CORRIGIDO v1.1 — D4):** Em `src/utils/mrm-rates-loader.ts`, ao carregar `TaxRatePeriod[]` para regime LR, validar duas perspectivas distintas e SEPARADAS:
   - **Construção (precificação original)**: `pis_construcao_pct + cofins_construcao_pct ≈ 7,6775%` (tolerância 1e-4). Aplica-se sobre `Op_Interna_Original` (H21) no markup divisor da precificação.
   - **Apuração (reapuração tributária no motor RRO)**: `pis_apuracao_pct + cofins_apuracao_pct ≈ 9,25%` (tolerância 1e-4). Aplica-se sobre `(Âncora_Interna − ICMS)` na Etapa 5 do motor (célula H43).
   - **Equivalência matemática para ICMS=17%**: `9,25% × (1 − 0,17) = 7,6775%`. Validar via assert no contract test que as duas perspectivas são consistentes para o ICMS configurado.
5. **AC5 — Fórmula PIS/COFINS no motor (NOVO v1.1 — D4):** `computeTaxesInside()` em `src/utils/margin-reapuration.ts` deve aplicar PIS/COFINS na reapuração como `(ancora_interna − ICMS_amount − ISS_amount) × 9,25%`, NÃO como `RV × 7,6775%`. As duas fórmulas são MATEMATICAMENTE equivalentes apenas para ICMS=17% e ISS=0; quando ICMS varia (ex.: 18%, ZFM, alíquotas estaduais), apenas a fórmula de apuração 9,25% sobre base reduzida produz o valor canônico do PDF Motor RR (Etapa 5). Manter `engine_version=2.2.0` mas documentar em ADR-008 (novo) a mudança de fórmula default.
6. **AC6 — Erro estruturado:** Se invariante AC4 violada, lançar `MrmInvariantError` com `code: 'PIS_COFINS_OUT_OF_RANGE'`, `actual: number`, `expected: '7.6775% (construção) ou 9.25% (apuração)'`, `perspective: 'CONSTRUCAO' | 'APURACAO'`. Captura em testes (não derruba motor — apenas indica config tributária inválida).
7. **AC7 — Contract test:** Novo test em `src/utils/__tests__/mrm-rates-loader.test.ts` cobre 6 casos: construção válida 7,6775% / apuração válida 9,25% / equivalência 9,25%×0,83=7,6775% / inválido 5% / inválido 12% / ICMS variando (17%, 18%, 12%).
8. **AC8 — Backward compatibility:** Snapshots V4 lidos sem `taxes_outside_base` continuam exibindo na UI com fallback para `base` do primeiro `TaxLine.taxes_outside`. Snapshots V4 com PIS/COFINS calculado via fórmula antiga (7,6775% × RV) são identificados por `engine_version='2.1.0'` e NÃO recalculados (ADR-003 — snapshot imutável).

**Lacunas cobertas:** L4, L8.

**Arquivos afetados:**
- `src/utils/margin-reapuration.ts` (computeTaxesOutsideBase canônica + computeTaxesInside com fórmula 9,25% apuração)
- `src/utils/mrm-rates-loader.ts` (invariante PIS/COFINS dupla perspectiva: construção 7,6775% × apuração 9,25%)
- `src/types/mrm.ts` (campo `taxes_outside_base` + class `MrmInvariantError` com `perspective`)
- `src/utils/__tests__/margin-reapuration.test.ts`
- `src/utils/__tests__/mrm-rates-loader.test.ts`
- `docs/architecture/ADR-008-pis-cofins-apuracao-fórmula.md` (NOVO — registrar mudança de fórmula default 7,6775%×RV → 9,25%×(Âncora−ICMS))

**Riscos:**
- (M) Existem tenants com `tax_rate_periods` configurados com somas fora das faixas (ex.: ZFM). Mitigação: invariante emite warn (não erro) em modo permissivo durante 1 sprint; bloqueio hard só no sprint seguinte.
- (A) Mudança de fórmula PIS/COFINS (AC5) pode alterar valor canônico para tenants com ICMS ≠ 17%. Mitigação: golden test V2 item 13 (LR, ICMS=18%) precisa de validação prévia — pode ser necessário atualizar valor esperado ou manter feature flag.
- (B) ADR-008 precisa aprovação @architect Aria antes de iniciar implementação de AC5.

**Dependências:** STORY-MRM-V5-001 (campos novos no schema + ReapurationInput.peso_op_interna).

---

### STORY-MRM-V5-003 — Unificar fonte regime/alíquotas + mover validação RRO>0 para motor

**Sprint:** S2 | **Estimativa:** 6h | **Owner sugerido:** @architect Aria + @dev Dex | **Validador:** @qa Quinn

**User story:**
> **Como** arquiteto do sistema,
> **quero** uma única fonte de verdade para regime e alíquotas (`mrm-rates-loader`) e a validação `RRO > 0` dentro do próprio motor,
> **para** eliminar duplicação `calc-tax-engine` ↔ `mrm-orchestrator` e tornar `mrm-policies` um layer mais fino.

**Critérios de aceitação (7):**
1. **AC1 — Single source:** `mrm-orchestrator.ts` deixa de inferir regime/alíquotas por seus próprios meios; passa a chamar `mrm-rates-loader.loadRatesForTenant(tenantId, effective_date)` como única entrada.
2. **AC2 — Edge alinhada:** `calc-tax-engine` edge function (caso ainda chamado) continua funcionando, mas em modo shadow: orchestrator compara resultado edge × resultado loader e loga divergências em `mrm-shadow.ts` (dashboard já existente). Zero divergências esperadas.
3. **AC3 — Validação no motor:** `calculateMarginReapuration` retorna `status: 'RRO_NEGATIVE' | 'RRO_ZERO' | 'VALID'` (já existe — confirmar uso). `mrm-policies.ts` apenas mapeia esse status para mensagem UI; não recalcula RRO > 0.
4. **AC4 — Test orchestrator:** Test cobre cenário em que edge e loader retornam alíquotas diferentes — orchestrator usa loader e loga divergência.
5. **AC5 — Sem regressão `mrm-policies`:** Policies passam a depender apenas de `breakdown.status`, não recalculam invariantes; cobertura de teste atual mantida.
6. **AC6 — Documentação ADR:** Atualizar ADR-002/004 (ou criar ADR-005) registrando "loader é autoritativo; edge é shadow".
7. **AC7 — Shadow mode em produção:** Após deploy, observar 7 dias `mrm-shadow` antes de remover `calc-tax-engine` (out of scope deste Epic; cria ticket follow-up).

**Lacunas cobertas:** L5, L7.

**Arquivos afetados:**
- `src/utils/mrm-orchestrator.ts`
- `src/utils/mrm-policies.ts` (simplificação)
- `src/utils/mrm-shadow.ts` (registro de divergências orchestrator vs edge)
- `docs/architecture/ADR-005-rates-loader-authoritative.md` (novo ADR)

**Riscos:**
- (A) Edge function `calc-tax-engine` ainda é referenciada em call-sites legados (ver Story `mrm-v2-s4.2-remover-call-sites-edge.md`). Mitigação: confirmar com @architect que todos call-sites já foram migrados antes de iniciar AC2.

**Dependências:** STORY-MRM-V5-001 (versão 2.2.0).

---

### STORY-MRM-V5-004 — Créditos tributários no `ReapurationInput` + ISS segregado por regime

**Sprint:** S3 | **Estimativa:** 6h | **Owner sugerido:** @dev Dex + @data-engineer Dara | **Validador:** @architect Aria

**User story:**
> **Como** usuário em regime Lucro Real,
> **quero** que créditos tributários recuperáveis (já cadastrados no item) reduzam meu custo efetivo no RRO, e que ISS seja segregado por regime (RPS vs SN),
> **para** que minha apuração reflita corretamente a não-cumulatividade e a particularidade do Simples Nacional.

**Critérios de aceitação (7):**
1. **AC1 — Schema input:** `ReapurationInput` ganha campo opcional `tax_credits?: { recoverable: number; non_recoverable: number }`. Default `{ recoverable: 0, non_recoverable: 0 }`.
2. **AC2 — Lógica:** `recoverable` é somado a `cp` como crédito (`cp_efetivo = cp − recoverable`); `non_recoverable` permanece no custo. RRO recalculado com `cp_efetivo`.
3. **AC3 — Schema output:** `TaxBreakdown` ganha campo opcional `tax_credits_applied: { recoverable: number; non_recoverable: number } | null` para auditoria.
4. **AC4 — Fonte de dados:** Orchestrator lê créditos do cadastro do item já existente (sem novas telas). Quando regime ∈ {MEI, SN}, créditos são forçados a `0` (regime cumulativo).
5. **AC5 — ISS segregado:** `computeTaxesInside` em `margin-reapuration.ts` aceita variação de alíquota ISS conforme regime: SN usa alíquota efetiva do anexo (já vem do `mrm-rates-loader`); LP/LR usam alíquota municipal RPS. Verificação por regime no loader, não no motor (motor permanece puro).
6. **AC6 — Golden test:** Novo cenário: RB R$ 100.000, ICMS 18%, créditos recuperáveis R$ 5.000 → `cp_efetivo` reflete dedução; `tax_credits_applied.recoverable === 5000`.
7. **AC7 — UI sem nova tela:** Créditos aparecem em **linha já existente** do `consolidated-dre-block` (sub-item de "Custos"). Sem novo modal.

**Lacunas cobertas:** L6, L9.

**Arquivos afetados:**
- `src/types/mrm.ts` (`ReapurationInput.tax_credits`, `TaxBreakdown.tax_credits_applied`)
- `src/utils/margin-reapuration.ts` (uso de `cp_efetivo`)
- `src/utils/mrm-orchestrator.ts` (leitura de créditos do item)
- `src/utils/mrm-rates-loader.ts` (variação ISS por regime)
- `src/components/.../consolidated-dre-block.component.tsx` (linha de créditos — componente existente)
- `src/utils/__tests__/margin-reapuration.test.ts`

**Riscos:**
- (M) Cadastro de item pode não ter campo de créditos hoje. Mitigação: default `0` mantém comportamento atual; cadastro é OUT deste Epic.
- (B) ISS SN diverge significativamente de RPS em algumas cidades — invariante PIS/COFINS (Story 002) NÃO se aplica a ISS.

**Dependências:** STORY-MRM-V5-001 (campos novos no schema).

---

### STORY-MRM-V5-005 — Exposição UI: memória cascata + banner guard MEI/SN

**Sprint:** S4 | **Estimativa:** 6h | **Owner sugerido:** @dev Dex + @ux-design-expert Uma | **Validador:** @qa Quinn

**User story:**
> **Como** usuário final do Precifica Certo (vendedor/contador),
> **quero** abrir um expansível dentro do bloco DRE consolidada para ver os 13 passos cascateados, e ver um banner inline quando meu regime bloqueia CSLL/IRPJ,
> **para** entender como o RRO foi formado sem precisar abrir o console F12 ou consultar planilha externa.

**Critérios de aceitação (8):**
1. **AC1 — Expansível cascata:** `consolidated-dre-block.component.tsx` ganha componente filho **inline** (não modal full-page) — pode ser `<Collapse>` ou `<details>` — exibindo `cascade_trace` (13 itens). Render condicional: só aparece se `breakdown.cascade_trace !== null`.
2. **AC2 — Render dos 13 itens:** Cada item exibido em linha-tabela: `step | label | base (R$) | rate (%) | amount (R$)`. Formatação BR (vírgula decimal).
3. **AC3 — Peso/Âncora:** Linhas "Peso Op Interna" (% com 4 casas) e "Âncora Interna" (R$) aparecem **acima** do expansível, como informação direta (não dentro do collapse).
4. **AC4 — Banner guard:** `residual-distribution-block.component.tsx` ganha banner `<Alert type="warning">` quando `regime ∈ {MEI, SIMPLES_NACIONAL}` E (`csll_pct > 0` OU `irpj_pct > 0`). Texto: "Guard ativo: regime [MEI|SN] não rateia CSLL/IRPJ. Valores forçados a 0."
5. **AC5 — Mobile:** Expansível e banner respondem corretamente em `<640px` (usando classes globais `.auth-page/.auth-card` já existentes onde aplicável).
6. **AC6 — Acessibilidade:** Expansível tem `aria-expanded`; banner tem `role="alert"`.
7. **AC7 — Não-regressão:** Páginas `orcamentos`, `pedidos`, `vendas` continuam carregando sem novos warnings de console.
8. **AC8 — Sem novas rotas:** `git diff` em `src/pages/` mostra apenas alterações em arquivos existentes; nenhuma nova rota Next.js criada.

**Lacunas cobertas:** L3 (parte UI), L10.

**Arquivos afetados:**
- `src/components/.../consolidated-dre-block.component.tsx`
- `src/components/.../residual-distribution-block.component.tsx`
- `src/styles/globals.scss` (caso necessário, apenas classes existentes)
- Testes E2E (Playwright) — se existirem para esses componentes

**Riscos:**
- (B) Layout do `consolidated-dre-block` pode ficar muito carregado em mobile. Mitigação: collapse fechado por default; UX revisa antes do merge.

**Dependências:** STORY-MRM-V5-001 (campo `cascade_trace` no schema) + STORY-MRM-V5-004 (linha de créditos).

---

## 5. Métricas de Sucesso

| ID | Métrica | Valor alvo | Como medir |
|----|---------|-----------|------------|
| **M1** | Golden test Excel (RRO R$ 17.471,16) | tolerância ≤ R$ 0,02 | `npm test -- margin-reapuration.test.ts` |
| **M2** | Memória cascata exposta | exatamente 13 itens | Assert em test + verificação manual UI |
| **M3** | `peso_op_interna` no cenário Excel (= Op_Interna_Original / RB_total, célula I21) | ≈ 0,931585 (4 casas) | Golden test |
| **M3b** | `ancora_interna` PÓS-desconto no cenário Excel (= RV × peso, célula H36) | ≈ R$ 159.342,38 (± R$ 0,02) | Golden test |
| **M4** | Soma tributos por fora bate planilha | ± R$ 0,02 | Golden test |
| **M5** | Divergências shadow-mode orchestrator × edge | 0 em 7 dias | `mrm-shadow` dashboard |
| **M6** | Contract test PIS/COFINS invariante | 4/4 casos passam | `mrm-rates-loader.test.ts` |
| **M7** | Banner guard aparece em MEI/SN com CSLL/IRPJ > 0 | 100% dos casos | Teste manual + Playwright |
| **M8** | Zero novas rotas Next.js | `find src/pages -newer baseline = 0` | `git diff --stat src/pages` |
| **M9** | Snapshots V4 (`engine_version = 2.1.0`) carregam sem erro | 100% | Test de retro-compatibilidade |
| **M10** | Bump engine version | `MRM_ENGINE_VERSION === '2.2.0'` | Grep no código |
| **M11** | Fórmula PIS/COFINS apuração no motor (D4) | `(Âncora − ICMS) × 9,25%` produz mesmo valor que Excel H43 (± R$ 0,02) | Golden test ICMS=17% e ICMS=18% |
| **M12** | Base canônica tributos por fora (D3) | `Âncora − ICMS − PIS/COFINS` produz mesmo valor que Excel H65/H66 base (± R$ 0,02) | Golden test |
| **M13** | Snapshot `peso_op_interna` em `tax_breakdown` JSONB (D1) | Campo presente em 100% dos novos saves V2.2 e ausente em snapshots V2.1 lidos | Query SQL + test integração |

---

## 6. Roadmap Sequencial

| Sprint | Duração | Stories | Horas | Objetivos cobertos |
|--------|---------|---------|-------|-------------------|
| **S1 — Schema & cálculo (motor + orchestrator)** | ~1 semana | STORY-MRM-V5-001 | 10h | O1 (parte motor) |
| **S2 — Tributos por fora + unificação + ADR-008** | ~1 semana | STORY-MRM-V5-002, STORY-MRM-V5-003 | 14h | O2, O3, O5 |
| **S3 — Créditos + ISS segregado** | ~1 semana | STORY-MRM-V5-004 | 6h | O4 |
| **S4 — UI exposição** | ~1 semana | STORY-MRM-V5-005 | 6h | O1 (parte UI), O6 |

**Caminho crítico:** S1 → (S2 ∥ S3) → S4. S2 e S3 podem rodar em paralelo após S1.

**Estimativa total:** 36 horas | **Janela alvo:** 30-40 horas (dentro).

---

## 7. Stakeholders

| Papel | Agente / Pessoa | Responsabilidade |
|-------|-----------------|------------------|
| **PM (autor)** | @pm Morgan | Manutenção deste PRD; trade-offs de escopo |
| **Architect** | @architect Aria | ADR-005 (loader autoritativo); revisão de S2, S3, S4 |
| **Dev** | @dev Dex | Implementação de S1–S5; testes |
| **Data Engineer** | @data-engineer Dara | Suporte em S4 (campos opcionais no `TaxBreakdown` JSON, sem DDL) |
| **QA** | @qa Quinn | QA Gate de cada story; golden tests; contract tests |
| **UX** | @ux-design-expert Uma | Revisão visual do expansível cascata + banner guard (S5) |
| **DevOps** | @devops Gage | Push, PR, deploy; observação shadow-mode pós-merge |
| **Usuário final** | Hyago (cliente) | Validação de aceitação: "memória cascata reflete o relatório oficial" |

---

## 8. Mapa de Lacunas → Stories

| Lacuna | Severidade | Story | Sprint |
|--------|-----------|-------|--------|
| L1 — Peso Op Interna não armazenado | ALTA | STORY-MRM-V5-001 | S1 |
| L2 — Âncora Interna não existe como passo explícito | ALTA | STORY-MRM-V5-001 | S1 |
| L3 — Memória cascata (13) não exposta UI | ALTA | STORY-MRM-V5-001 (motor) + STORY-MRM-V5-005 (UI) | S1 + S4 |
| L4 — Base tributos por fora difere planilha | MÉDIA | STORY-MRM-V5-002 | S2 |
| L5 — Validação RRO > 0 fora do motor | MÉDIA | STORY-MRM-V5-003 | S2 |
| L6 — Créditos tributários desintegrados | MÉDIA | STORY-MRM-V5-004 | S3 |
| L7 — Duplicação regime/alíquotas edge × client | MÉDIA | STORY-MRM-V5-003 | S2 |
| L8 — Invariante PIS/COFINS 7,6775% × 9,25% não validada | BAIXA | STORY-MRM-V5-002 | S2 |
| L9 — ISS sem segregação por regime | BAIXA | STORY-MRM-V5-004 | S3 |
| L10 — Guard MEI/SN só em console.warn | BAIXA | STORY-MRM-V5-005 | S4 |

**Cobertura:** 10/10 lacunas → 5 stories.

---

## 9. Principais Riscos do Epic

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| **R1** | Snapshots V4 (`engine_version = 2.1.0`) persistidos em `budget_items.tax_breakdown` quebrarem deserialização quando schema 2.2.0 entrar | ALTA | Campos novos são todos `optional + nullable`; teste de retro-compatibilidade em S1 |
| **R2** | Tenants com `tax_rate_periods` fora das faixas PIS/COFINS conhecidas (ex.: ZFM, regimes especiais) dispararem `MrmInvariantError` em produção | MÉDIA | Lançar invariante em **modo warn** por 1 sprint antes de promover a erro hard |
| **R3** | Edge function `calc-tax-engine` ainda referenciada em call-sites legados — unificação L7 pode quebrar caminhos não cobertos por test | MÉDIA | Auditoria de call-sites antes de iniciar S3.AC2 + shadow-mode 7 dias |
| **R4** | Expansível cascata sobrecarregar a UI mobile do `consolidated-dre-block` | BAIXA | Default fechado; UX revisa S4 antes do merge |
| **R5** | Cadastro de item não tem campo de créditos tributários → S4.AC4 retorna sempre 0 | BAIXA | Default 0 mantém comportamento atual; cadastro fica como follow-up |
| **R6** | "Memória cascata" exibida no PDF de orçamento/pedido pode aumentar significativamente o tamanho do PDF | BAIXA | Decisão UX: exibir cascata só em tela (UI), não no PDF do orçamento. PDF mantém visão sumária. (Confirmar com usuário antes de S4.) |

---

## 10. Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-05-22 | 1.0 | Criação inicial do PRD do Epic MRM-V5 (5 stories, 32h, 10 lacunas cobertas) | @pm Morgan |
| 2026-05-22 | 1.1 | **Revisão crítica pós-decodificação do Excel oficial (orquestrado por Orion/aios-master).** 4 divergências corrigidas: **D1** STORY-001.AC2 — fórmula `peso_op_interna` corrigida de `(cp+mod+dop)/rv` para `Op_Interna_Original / (Op_Interna + Op_Externa)` (markup divisor da precificação ORIGINAL, célula I21 do Excel = 93,1585%). **D2** STORY-001.AC3+AC6 — `ancora_interna` é PÓS-desconto (H36=159.342,38), não pré-desconto (H21=177.053,25). **D3** STORY-002.AC1+AC3 — base canônica dos tributos por fora corrigida para `Âncora − ICMS − PIS/COFINS` (não `RV − ICMS − PIS − COFINS`). **D4** STORY-002.AC4+AC5 — PIS/COFINS na reapuração usa 9,25% sobre `(Âncora − ICMS)` (matematicamente equivalente a 7,6775%×RV apenas para ICMS=17%). **NOVO**: AC9 STORY-001 sobre snapshot/cálculo do `peso_op_interna` no orchestrator (preserva pureza ADR-004). **NOVO**: ADR-008 registra mudança de fórmula PIS/COFINS. Estimativa: STORY-001 sobe de 8h para ~10h (adiciona cálculo orchestrator); STORY-002 sobe de 6h para ~8h (adiciona ADR-008 + dupla perspectiva). **Total epic: 32h → ~36h** (ainda dentro da janela 30-40h). | @pm Morgan + Orion |

---

## Anexo A — Referências

- **Relatório Motor Descontos Resultado Residual Operacional** (PDF 1) — 10 etapas inviolávies.
- **Formação Preço Por Dentro/Fora** (PDF 2) — EC 132/2023 + LC 214/2025.
- **Motor de descontos do resultado residual operacional.xlsx** — implementação numérica de referência (RB R$ 190.055,94 → RRO R$ 17.471,16).
- `docs/motor-reapuracao-margem.md` — spec local.
- `docs/stories/mrm-v2-*.md` — stories do Epic MRM-V2 (baseline 2.0.0 → 2.1.0).
- Memory: `project_motor_reapuracao_margem.md`, `project_motor_v2_sprint_plan_2026_05_19.md`, `project_motor_rr_taxes_over_rv_2026_05_20.md`, `project_epic_rr_v4_2026_05_22.md`.
- `.aios-core/constitution.md` — Artigos IV (No Invention) e V (Quality First) aplicáveis.

---

*Documento gerado por @pm Morgan — Synkra AIOS — em conformidade com `aios-core/development/templates/brownfield-prd-tmpl.yaml`.*
