# EPIC-MRM-V6-DISCOUNT-MODES — Reativação dos 3 Modos de Desconto (Reversão da Decisão R2)

**ID:** EPIC-MRM-V6-DISCOUNT-MODES
**Versão:** 1.0
**Data:** 2026-05-22
**Status:** Draft (PRD v1.0 — aguardando validação @po + @architect ADR-009)
**Owner:** @pm Morgan (Product Management)
**Commit baseline:** `d13b54e` — "feat: implement Motor RRO v4 with enhanced tax calculations and UI components"
**Engine baseline:** `MRM_ENGINE_VERSION = 2.2.0` (Epic V5 em produção)
**Engine alvo:** `MRM_ENGINE_VERSION = 2.3.0` (bump MINOR — apenas campo `discount_mode` opcional retrocompatível no `ReapurationInput`)
**Regime:** Todos (MEI, SN, LP, LR)
**Template:** `aios-core/development/templates/brownfield-prd-tmpl.yaml`
**Decisão revertida:** **R2 da spec original Motor V2** (que descontinuou os modos `PROFIT_REDUCTION` e `SELLER_REDUCTION`)
**Decisão originadora:** Aprovação Founder Hyago — **Opção A** (Reativar os 3 modos com isolamento total dos tributos)

> **Restrição CRÍTICA do usuário (HERDADA do Epic V5 — restrição-mãe inegociável):** *"Não é para criar novas abas, somente ajustar a lógica."*
> Nenhum novo screen/tab/route será introduzido. Toda exposição/seleção de modo será feita **dentro dos componentes já existentes** (`<Select>` que hoje aparece desabilitado em `orcamentos/index.tsx:2315-2322`, replicado em `pedidos/index.tsx` e `vendas/index.tsx`; `residual-distribution-block.component.tsx` ganha rendering condicional dos cards).

> **Invariante tributária INEGOCIÁVEL desta Epic:** **"Desconto reduz RV apenas. Os modos SELLER/PROFIT/PROPORTIONAL afetam EXCLUSIVAMENTE a distribuição do RRO entre comissão e lucro — IMP, CP, MOD, DOP, CSLL e IRPJ são invariantes."** Isto significa que para os mesmos `(rb, desconto, regime, alíquotas, cp, mod, dop)`, o valor de RRO, ICMS, ISS, PIS, COFINS, IBS, CBS, IPI, DIFAL, FCP, CSLL e IRPJ é **idêntico** nos 3 modos — o que muda é apenas como os componentes residuais "Comissão" e "Lucro Líquido" são preenchidos a partir do mesmo bolo de RRO.

---

## 1. Resumo Executivo

### 1.1 Problema
O Motor V2 introduziu a Decisão **R2** que descontinuou dois modos de desconto historicamente disponíveis no Precifica Certo (`PROFIT_REDUCTION` e `SELLER_REDUCTION`), forçando o sistema a operar **exclusivamente** em modo `PROPORTIONAL` sempre que `mrmConfig.enabled === true` (estado atual em produção pós Epic V5). A justificativa original do R2 era "simplificar o motor e evitar ambiguidade de UX durante a transição V1→V2".

Após 3 meses de uso em produção pós Epic V4/V5, o Founder Hyago e a área comercial reportaram impacto negativo de negócio:

1. **Vendedores perderam ferramenta de negociação:** sem `SELLER_REDUCTION`, o vendedor não consegue "abrir mão da própria comissão" em troca de fechar um negócio (cenário comum em segmentos B2B com margem apertada).
2. **Empresários sem flexibilidade comercial:** sem `PROFIT_REDUCTION`, o dono não consegue "abrir mão de lucro" sem mexer na comissão do vendedor (cenário comum em campanhas de queima de estoque, vendas estratégicas para abrir mercado).
3. **Demanda explícita do mercado:** clientes solicitam o retorno desses modos via suporte recorrentemente; concorrentes do segmento (Granatum, Conta Azul, ContaAzul Pro) oferecem opções equivalentes.

Estado técnico atual mapeado:
- **Type-level**: `src/types/mrm.ts:64` já declara `DiscountMode = 'PROPORTIONAL' | 'PROFIT_REDUCTION' | 'SELLER_REDUCTION' | 'MRM'` — os 3 modos JÁ existem no type system (não é invenção nova).
- **Preview**: `src/utils/calculate-discount.ts:calculateDiscountedPrice` JÁ tem switch implementado para os 3 modos — usado apenas em preview de preço, não pelo motor MRM.
- **Coerção legacy**: `src/config/feature-flags.ts` declara `mrm.legacy_modes_visible: false` e exporta `coerceLegacyDiscountMode()` que força PROPORTIONAL.
- **UI bloqueada**: `src/pages/orcamentos/index.tsx:2315-2322` renderiza literalmente:
  ```tsx
  <Select value="PROPORTIONAL" disabled options={[{ value: 'PROPORTIONAL', label: 'Proporcional' }]} />
  ```
- **Inicialização forçada**: `src/pages/orcamentos/index.tsx:1109` faz `setDiscountMode(mrmConfig.enabled ? 'PROPORTIONAL' : legacyMode)` — força PROPORTIONAL ao carregar quando MRM ativo.
- **Motor não recebe modo**: `src/utils/margin-reapuration.ts:299-301` distribui RRO proporcional ao peso de cada componente sem conhecer `discount_mode`:
  ```ts
  const combined_pct = commission_pct + profit_pct + csll_pct_effective + irpj_pct_effective
  const peso_comm = combined_pct > 0 ? commission_pct / combined_pct : 0
  const peso_lucro = combined_pct > 0 ? profit_pct / combined_pct : 0
  ```
- **maxDiscount não conhece modo**: `src/pages/orcamentos/index.tsx:524-534` calcula teto baseado em `(comm+prof)/total` (soma fixa) — não considera que SELLER limita teto a `comm/total` apenas, e PROFIT limita a `prof/total` apenas.
- **Distribuição UI fixa**: `src/page-parts/shared/residual-distribution-block.component.tsx:95-105` monta cards fixos `[Comissão, Lucro]` + condicionalmente `[IRPJ, CSLL]` (controlado por `hidesProfitTaxes`). Não há prop para esconder Comissão OU Lucro individualmente conforme o modo.

### 1.2 Valor
- **Flexibilidade comercial restaurada:** vendedor pode negociar abrindo mão de comissão sem afetar lucro da empresa (SELLER); empresa pode oferecer desconto cobrindo da própria margem sem penalizar vendedor (PROFIT); rateio proporcional continua como default seguro (PROPORTIONAL).
- **Conformidade tributária preservada:** os 3 modos NÃO alteram nenhum cálculo de imposto (IMP/ICMS/ISS/PIS/COFINS/IBS/CBS/IPI/DIFAL/FCP/CSLL/IRPJ) — apenas a distribuição do RRO entre os componentes "Comissão" e "Lucro Líquido". Reforma tributária 2027 (IBS/CBS) e fórmulas STF do Epic V4/V5 continuam intactas.
- **Retrocompatibilidade total:** snapshots V4/V5 (`engine_version ∈ {'2.1.0', '2.2.0'}`) persistidos com `discount_mode='MRM'` continuam válidos para leitura e são interpretados como sinônimo de `PROPORTIONAL` (mesma matemática). ADR-003 (snapshot imutável) preservado.
- **Custo de desenvolvimento baixo:** type system, função de preview e UI placeholder já existem. Trabalho restante é primariamente: (a) propagar `discount_mode` até o motor, (b) ajustar 3 linhas no rateio do RRO, (c) habilitar `<Select>` em 3 páginas, (d) condicional de cards em 1 componente compartilhado.

### 1.3 Impacto
- **Engine:** Bump 2.2.0 → 2.3.0 (MINOR — `ReapurationInput` ganha **1 novo campo opcional** `discount_mode?: 'PROPORTIONAL' | 'SELLER_REDUCTION' | 'PROFIT_REDUCTION'` com default `'PROPORTIONAL'`; `TaxBreakdown` ganha **1 novo campo opcional** `discount_mode_applied: DiscountMode | null` para auditoria. Callers legados continuam funcionando — quando `discount_mode` é `undefined`, motor opera idêntico ao V5).
- **UI:** Zero novas telas. Apenas (a) habilita `<Select>` já existente em 3 páginas, (b) torna `maxDiscountPercent` dinâmico por modo, (c) torna cards do `residual-distribution-block` condicionais por modo.
- **Golden tests:** Os golden tests V4/V5 existentes (RB 190.055,94, desc 10%, modo implícito PROPORTIONAL) continuam passando sem alteração. **3 novos golden tests** são adicionados (mesmo input, modo SELLER / modo PROFIT / modo PROPORTIONAL explícito) validando que: RRO/ICMS/ISS/PIS/COFINS/IBS/CBS/IPI/DIFAL/FCP/CSLL/IRPJ são bit-exact iguais nos 3 modos; apenas componentes `commission` e `profit` em `TaxBreakdown` diferem.
- **Backward compatibility:**
  - Snapshots V4/V5 com `discount_mode='MRM'` → lidos como `'PROPORTIONAL'` (matematicamente equivalentes).
  - Snapshots V4/V5 sem campo `discount_mode_applied` → exibidos com fallback "PROPORTIONAL (legado)" na UI de auditoria.
  - Snapshots V3 ou anteriores (`engine_version < 2.0`) com `discount_mode ∈ {'PROFIT_REDUCTION', 'SELLER_REDUCTION'}` legítimos: passam a ser interpretados nativamente (já existem em DB; eram coagidos a PROPORTIONAL na leitura V4/V5 quando MRM ativo).
- **Migrations Supabase:** **ZERO migrations obrigatórias**. Campo `discount_mode_applied` cabe no JSONB `tax_breakdown` existente. Campo `discount_mode` nas tabelas `budgets`/`orders`/`sales` JÁ EXISTE (confirmado em `project_supabase_migrations_lessons.md` — schema difere por tabela mas todos têm a coluna).
- **Feature flag:** `mrm.legacy_modes_visible` muda default de `false` → `true`. Função `coerceLegacyDiscountMode` é mantida no código mas marcada `@deprecated` (remoção planejada em Epic V7). Tenants que queiram manter UI restrita a PROPORTIONAL podem setar a flag para `false` via tenant settings.
- **Novos ADRs:** **ADR-009** (modos de desconto reativados — isolamento da distribuição RRO vs cálculo tributário) precisa ser aprovado por @architect Aria antes da STORY-MRM-V6-001 entrar em InProgress. ADR-009 **modifica explicitamente** o ADR-004 (que registrou R2) — o ADR-004 ganha addendum "Superseded em parte pelo ADR-009 (2026-05-22)".

---

## 2. Objetivos do Epic (mensuráveis)

| # | Objetivo | KPI / Critério de medição |
|---|---------|---------------------------|
| **O1** | Reativar os 3 modos de desconto (PROPORTIONAL, SELLER_REDUCTION, PROFIT_REDUCTION) ponta-a-ponta no motor RRO | Motor recebe `discount_mode` via `ReapurationInput`; aplica rateio correto por modo; `TaxBreakdown.discount_mode_applied` persiste valor usado |
| **O2** | Garantir invariante: impostos e custos são idênticos nos 3 modos | Golden test triplo (mesmo input, 3 modos) confirma: `taxes_inside` + `taxes_outside` + `cp` + `mod` + `dop` + `csll_amount` + `irpj_amount` + `rro` bit-exact iguais; apenas `commission` e `profit` diferem |
| **O3** | UI condicional por modo nos cards de distribuição residual | `residual-distribution-block` esconde card "Lucro" em SELLER; esconde card "Comissão" em PROFIT; mostra ambos em PROPORTIONAL; IRPJ/CSLL sempre presentes quando regime permite (LP/LR) |
| **O4** | Teto de desconto (`maxDiscountPercent`) dinâmico por modo | SELLER limita teto a `commission_pct / total_pct`; PROFIT a `profit_pct / total_pct`; PROPORTIONAL mantém `(commission + profit) / total_pct` (comportamento atual) |
| **O5** | Zero regressão em snapshots V4/V5 persistidos | `npm test -- mrm-snapshot-compat.test.ts` valida 100% dos cenários: snapshots com `discount_mode ∈ {'MRM', null, undefined}` ↔ V6 lê e exibe sem erro |
| **O6** | Fallback gracioso quando modo escolhido é inviável | Se usuário força PROFIT em produto com `profit_pct = 0` (lucro zerado) → motor retorna `status='DISCOUNT_MODE_FALLBACK'`, aplica PROPORTIONAL, UI mostra banner "Modo PROFIT indisponível — produto sem margem de lucro. Aplicado PROPORTIONAL." Idem para SELLER com `commission_pct = 0` |

---

## 3. Escopo

### 3.1 IN (dentro do Epic)
- Extensão **retrocompatível** de `ReapurationInput` em `src/types/mrm.ts` (apenas adição de campo opcional `discount_mode`).
- Extensão **retrocompatível** de `TaxBreakdown` em `src/types/mrm.ts` (apenas adição de campo opcional `discount_mode_applied`).
- Ajuste lógico em `src/utils/margin-reapuration.ts` linhas 299-301 (substituição do rateio único por switch de 3 ramos — `PROPORTIONAL` / `SELLER_REDUCTION` / `PROFIT_REDUCTION`).
- Bump `MRM_ENGINE_VERSION` 2.2.0 → 2.3.0.
- Habilitação do `<Select>` (atualmente `disabled`) em `src/pages/orcamentos/index.tsx:2315-2322`, `src/pages/pedidos/index.tsx` (linha equivalente — confirmar via grep) e `src/pages/vendas/index.tsx` (linha equivalente).
- Remoção da coerção forçada `setDiscountMode(mrmConfig.enabled ? 'PROPORTIONAL' : legacyMode)` em `orcamentos/index.tsx:1109` (e equivalentes em pedidos/vendas) — passa a respeitar valor selecionado pelo usuário.
- Refatoração de `maxDiscountPercent` em `orcamentos/index.tsx:524-534` (e equivalentes) para receber `discountMode` e calcular teto correto por modo.
- Extensão do componente `src/page-parts/shared/residual-distribution-block.component.tsx` para receber nova prop `discountMode: DiscountMode` e renderizar cards condicionalmente:
  - `PROPORTIONAL` → `[Comissão, Lucro]` + `[IRPJ, CSLL]` quando aplicável (mantém comportamento atual).
  - `SELLER_REDUCTION` → `[Comissão]` apenas + `[IRPJ, CSLL]` quando aplicável (card "Lucro" não renderiza).
  - `PROFIT_REDUCTION` → `[Lucro]` apenas + `[IRPJ, CSLL]` quando aplicável (card "Comissão" não renderiza).
- Feature flag `mrm.legacy_modes_visible` muda default `false` → `true` em `src/config/feature-flags.ts`.
- `coerceLegacyDiscountMode` recebe annotation `@deprecated` (mantém função para snapshots legados que ainda chegam com 'MRM').
- Fallback PROPORTIONAL quando modo escolhido inviável (O6) com status estruturado `'DISCOUNT_MODE_FALLBACK'`.
- Golden tests adicionais (3 novos cenários cobrindo invariante tributária).
- Snapshot compat tests (cenários V4/V5 com discount_mode `'MRM'`, `null`, `undefined`).
- ADR-009 (novo) registrando reversão do R2 e isolamento distribuição-vs-tributos.
- Atualização da memória `project_motor_v2_sprint_plan_2026_05_19.md` com nota "R2 revertido por ADR-009".

### 3.2 OUT (fora do Epic — explicitamente)
- **Nenhuma nova tela, aba, rota ou modal full-page** (restrição-mãe do Hyago herdada de V5).
- Alterações em PDF de orçamento/pedido/venda — exibição do modo aplicado fica como follow-up Epic V7.
- Alterações em mensagens WhatsApp / Email — exibição do modo aplicado fica como follow-up Epic V7.
- Mudanças em `calculate-discount.ts` (preview já está correto, não precisa tocar).
- Reforma tributária 2027 (IBS/CBS) — continua em backlog próprio.
- Sincronização com módulo Formação de Preço — continua dependência futura (Epic MRM-V3 RR já cobre parcialmente).
- Remoção completa de `coerceLegacyDiscountMode` — fica `@deprecated` neste Epic; remoção real em V7 após 90 dias de uso V6 estável.
- Migração ativa de snapshots V4/V5 (`discount_mode='MRM'`) para `'PROPORTIONAL'` em DB — snapshots são imutáveis (ADR-003); coerção acontece só na leitura.
- Novos modos além dos 3 (ex.: SPLIT_50_50, CUSTOM_WEIGHTS) — fora de escopo, registrar como backlog se demandado.
- Auditoria histórica de orçamentos pré-V4 que tinham SELLER/PROFIT salvos legitimamente — relatório opcional, não bloqueante.

### 3.3 Premissas
- Engine continua sendo função **pura** (ADR-004 — sem I/O, sem fetch). UI faz I/O e injeta `discount_mode` no input.
- Motor V5 (engine 2.2.0) com 5 campos novos (`peso_op_interna`, `ancora_interna`, `cascade_trace`, `taxes_outside_base`, `tax_credits_applied`) continua funcionando integralmente — V6 apenas adiciona campos, não remove.
- Os 3 modos afetam EXCLUSIVAMENTE a distribuição de RRO entre `commission` e `profit`. Etapas 1-7 da spec oficial (RB → RV → ICMS → ISS → PIS/COFINS → CP/MOD/DOP → RRO) permanecem inalteradas.
- IRPJ e CSLL aparecem em TODOS os 3 modos quando regime ∈ {LP, LR} (são incidências sobre o lucro residual com base própria, separados da decisão de distribuição comissão/lucro).
- Bloqueio de save quando `RRO ≤ 0` (V4) permanece — não interage com discount_mode.
- Cliente Hyago aprovou explicitamente a Opção A (reativar 3 modos) na reunião de 2026-05-22.

---

## 4. Diagrama ASCII — 3 Fluxos para o Mesmo Input

**Cenário canônico (mesmo input nos 3 modos):**
```
RB = R$ 190.055,94
Desconto = 10% (R$ 19.005,59)
RV = R$ 171.050,35
Regime = LR | ICMS = 17% | ISS = 0% | PIS+COFINS = 9,25% sobre (Âncora − ICMS)
Componentes (% sobre Op_Interna): comissão=8% | lucro=12% | csll=1,08% | irpj=1,2%
CP = R$ 53.509,92 | MOD = R$ 8.500,00 | DOP = R$ 3.200,00
```

**Etapas comuns aos 3 modos (INVARIANTES — exatamente iguais):**
```
                ┌──────────────────────────────────────────────────────┐
                │   ETAPAS 1-7 DA SPEC OFICIAL (não dependem do modo)  │
                ├──────────────────────────────────────────────────────┤
                │  RB ────[ − desconto ]────► RV                       │
                │  RV ────[ × peso_op_interna ]────► Âncora            │
                │  Âncora ────[ × 17% ]────► ICMS_amount  ≈ 27.088,20  │
                │  (Âncora − ICMS) ────[ × 9,25% ]────► PIS+COFINS     │
                │                                       ≈ 12.233,53    │
                │  base_outside = Âncora − ICMS − PIS/COFINS           │
                │  IBS/CBS/IPI/DIFAL/FCP ────[ × rates ]────► outside  │
                │  CP + MOD + DOP ──────────► custos diretos           │
                │  ──────────────────────────────────────────────────  │
                │  RRO = Âncora − Σ(tributos) − Σ(custos) ≈ 17.471,16  │
                │  CSLL_amount = RRO × csll_pct_effective              │
                │  IRPJ_amount = RRO × irpj_pct_effective              │
                │  RRO_após_impostos = RRO − CSLL − IRPJ               │
                └──────────────────────────────────────────────────────┘
                                          │
                                          │  RRO_após_impostos = R$ X
                                          │  (mesmo X nos 3 modos)
                                          ▼
                ┌──────────────────────────────────────────────────────┐
                │   ETAPA 8 (DISTRIBUIÇÃO RESIDUAL — DEPENDE DO MODO)  │
                └──────────────────────────────────────────────────────┘
                       │                  │                  │
       ┌───────────────┘                  │                  └───────────────┐
       ▼                                  ▼                                  ▼
┌──────────────┐                  ┌──────────────┐                  ┌──────────────┐
│ PROPORTIONAL │                  │   SELLER     │                  │   PROFIT     │
│   (default)  │                  │  REDUCTION   │                  │  REDUCTION   │
├──────────────┤                  ├──────────────┤                  ├──────────────┤
│ peso_comm =  │                  │ commission = │                  │ commission = │
│  comm_pct /  │                  │  RRO_após −  │                  │  RV ×        │
│  (comm+prof) │                  │  (comm_pct × │                  │  comm_pct    │
│              │                  │   RV_origina │                  │  (original)  │
│ peso_lucro = │                  │   l −        │                  │              │
│  prof_pct /  │                  │   desconto)  │                  │ profit =     │
│  (comm+prof) │                  │              │                  │  RRO_após −  │
│              │                  │ profit =     │                  │  commission  │
│ commission = │                  │  RV ×        │                  │              │
│  RRO_após ×  │                  │  prof_pct    │                  │ ► Lucro      │
│  peso_comm   │                  │  (original)  │                  │   absorve    │
│              │                  │              │                  │   desconto   │
│ profit =     │                  │ ► Comissão   │                  │              │
│  RRO_após ×  │                  │   absorve    │                  │ ► Comissão   │
│  peso_lucro  │                  │   desconto   │                  │   intacta    │
│              │                  │              │                  │              │
│ ► Ambos      │                  │ ► Lucro      │                  │              │
│   reduzem    │                  │   intacto    │                  │              │
│   propor-    │                  │              │                  │              │
│   cional-    │                  │              │                  │              │
│   mente      │                  │              │                  │              │
├──────────────┤                  ├──────────────┤                  ├──────────────┤
│ Cards UI:    │                  │ Cards UI:    │                  │ Cards UI:    │
│ [Comissão]   │                  │ [Comissão]   │                  │              │
│ [Lucro]     │                  │              │                  │ [Lucro]      │
│ [IRPJ]       │                  │ [IRPJ]       │                  │ [IRPJ]       │
│ [CSLL]       │                  │ [CSLL]       │                  │ [CSLL]       │
└──────────────┘                  └──────────────┘                  └──────────────┘

INVARIANTES (idênticos nos 3 modos):
  ICMS_amount, PIS, COFINS, IBS, CBS, IPI, DIFAL, FCP, ISS,
  CP, MOD, DOP, RRO, CSLL_amount, IRPJ_amount, RRO_após_impostos
```

**Leitura do diagrama:** o "bolo" residual (RRO_após_impostos) é o mesmo nos 3 modos — o desconto sempre reduz RV em 10%. O que muda é APENAS a fatia que vai para "Comissão" vs "Lucro": PROPORTIONAL divide o bolo na razão `comm_pct : prof_pct`; SELLER dá ao Lucro o que ele teria SEM desconto (`RV_original × prof_pct`) e a Comissão fica com o resto; PROFIT faz o inverso (Comissão recebe `RV_original × comm_pct` e o Lucro absorve o resto).

---

## 5. Stories Propostas (4 stories — ~12 horas estimadas)

| ID | Título curto | Sprint | Horas | Objetivos cobertos |
|----|--------------|--------|-------|--------------------|
| STORY-MRM-V6-001 | Motor + Schema (aceitar `discount_mode`, ajustar rateio das linhas 299-301) | S1 | 4h | O1, O2, O6 |
| STORY-MRM-V6-002 | UI Seletor 3 páginas (orcamentos/pedidos/vendas) + `maxDiscountPercent` dinâmico | S1 | 3h | O4 |
| STORY-MRM-V6-003 | Distribuição UI condicional (`residual-distribution-block` aceita prop `discountMode`) | S2 | 2h | O3 |
| STORY-MRM-V6-004 | Feature flag + ADR-009 + testes de regressão (snapshots V4/V5) | S2 | 3h | O5, governance |

**Total:** 12h (alvo: 10-14h conforme briefing).

---

### STORY-MRM-V6-001 — Motor + Schema (rateio condicional por discount_mode)

**Sprint:** S1 | **Estimativa:** 4h | **Owner sugerido:** @dev Dex | **Validador:** @architect Aria + @qa Quinn

**User story:**
> **Como** desenvolvedor responsável pelo motor MRM,
> **quero** que `calculateMarginReapuration` aceite `discount_mode` no `ReapurationInput` e aplique o rateio correto entre Comissão e Lucro conforme o modo,
> **para** que os 3 modos de desconto (PROPORTIONAL, SELLER_REDUCTION, PROFIT_REDUCTION) sejam suportados ponta-a-ponta sem alterar nenhum cálculo de imposto.

**Critérios de aceitação (8):**
1. **AC1 — Schema input:** `ReapurationInput` em `src/types/mrm.ts` ganha campo opcional `discount_mode?: 'PROPORTIONAL' | 'SELLER_REDUCTION' | 'PROFIT_REDUCTION'`. Default quando ausente: `'PROPORTIONAL'`. Snapshots V4/V5 sem o campo deserializam normalmente.
2. **AC2 — Schema output:** `TaxBreakdown` ganha campo opcional `discount_mode_applied: 'PROPORTIONAL' | 'SELLER_REDUCTION' | 'PROFIT_REDUCTION' | null`. Quando motor recebeu `undefined`, persiste `'PROPORTIONAL'` (não `null`) — `null` reservado exclusivamente para snapshots legados V4/V5 lidos sem o campo.
3. **AC3 — Lógica do rateio (substituição das linhas 299-301 de `margin-reapuration.ts`):** Substituir o cálculo único `peso_comm` / `peso_lucro` por switch:
   ```ts
   const rro_apos_impostos = rro - csll_amount - irpj_amount
   const commission_base_original = rv_original * commission_pct  // PRÉ-desconto seria sobre RB; aqui sobre RV original
   const profit_base_original = rv_original * profit_pct
   
   let commission: number, profit: number
   switch (discount_mode ?? 'PROPORTIONAL') {
     case 'PROPORTIONAL': {
       const combined_pct = commission_pct + profit_pct
       const peso_comm = combined_pct > 0 ? commission_pct / combined_pct : 0
       commission = rro_apos_impostos * peso_comm
       profit = rro_apos_impostos * (1 - peso_comm)
       break
     }
     case 'SELLER_REDUCTION': {
       // Lucro preservado no valor original; comissão absorve o desconto
       profit = profit_base_original
       commission = rro_apos_impostos - profit
       break
     }
     case 'PROFIT_REDUCTION': {
       // Comissão preservada no valor original; lucro absorve o desconto
       commission = commission_base_original
       profit = rro_apos_impostos - commission
       break
     }
   }
   ```
   (Pseudocódigo — implementação real deve respeitar arredondamento padrão do motor V5, com ajuste no maior componente para fechar centavos.)
4. **AC4 — Fallback PROPORTIONAL (O6):** Se modo escolhido produz valor negativo em commission ou profit (ex.: PROFIT com `commission_pct = 0` faria `commission = 0` e `profit = rro_apos_impostos`, que é válido — mas SELLER com `profit_pct = 0` faria `profit = 0` e `commission = rro_apos_impostos`, também válido; cenário REAL inviável é quando `commission_base_original > rro_apos_impostos` em PROFIT, ou `profit_base_original > rro_apos_impostos` em SELLER): motor retorna `status: 'DISCOUNT_MODE_FALLBACK'` e aplica PROPORTIONAL silenciosamente; persiste `discount_mode_applied = 'PROPORTIONAL'` e adiciona warning estruturado em `breakdown.warnings: ['DISCOUNT_MODE_FALLBACK: requested=PROFIT, reason=commission_base_excede_rro']`.
5. **AC5 — Engine version:** `MRM_ENGINE_VERSION` bumped para `'2.3.0'`. Constante exportada e populada em `breakdown.engine_version`.
6. **AC6 — Golden test triplo (INVARIANTE TRIBUTÁRIA):** Novo teste em `src/utils/__tests__/margin-reapuration.test.ts`:
   - Mesmo input canônico (RB 190.055,94, desc 10%, regime LR, comm 8%, prof 12%, csll 1,08%, irpj 1,2%).
   - Roda 3 vezes com `discount_mode ∈ {'PROPORTIONAL', 'SELLER_REDUCTION', 'PROFIT_REDUCTION'}`.
   - Assert `bit-exact` (tolerância R$ 0,02 só por arredondamento): `breakdown.taxes_inside`, `breakdown.taxes_outside`, `breakdown.cp`, `breakdown.mod`, `breakdown.dop`, `breakdown.csll_amount`, `breakdown.irpj_amount`, `breakdown.rro`, `breakdown.ancora_interna`, `breakdown.peso_op_interna`, `breakdown.taxes_outside_base` são iguais nos 3 modos.
   - Assert `commission + profit ≈ rro − csll_amount − irpj_amount` (± R$ 0,02) nos 3 modos.
   - Assert `breakdown.discount_mode_applied` reflete corretamente o modo solicitado.
7. **AC7 — Pureza:** Motor permanece função pura (ADR-004). Sem I/O, sem fetch. `discount_mode` é argumento de entrada; warnings são array do output.
8. **AC8 — Documentação inline:** Comentários JSDoc no switch referenciam ADR-009 e citam a invariante "modos afetam apenas distribuição Comissão/Lucro; impostos e custos invariantes".

**Lacunas/decisões cobertas:** Reversão R2 (objetivo principal); O1, O2, O6.

**Arquivos afetados:**
- `src/types/mrm.ts` (extensão `ReapurationInput.discount_mode` + `TaxBreakdown.discount_mode_applied` + `TaxBreakdown.warnings`)
- `src/utils/margin-reapuration.ts` (substituição linhas 299-301 por switch de 3 ramos + lógica de fallback)
- `src/utils/__tests__/margin-reapuration.test.ts` (golden test triplo + cenário de fallback)

**Riscos:**
- (M) Decisão de qual base usar para "comissão original" em SELLER/PROFIT: `RV_original` (antes do desconto) ou `RV` (após desconto). O briefing implica `RV_original` (vendedor "abre mão da própria comissão" = comissão sai do que ELE ganharia sem desconto). Documentar escolha em ADR-009 e validar com Hyago antes do merge.
- (B) Tenants podem ter `commission_pct = 0` ou `profit_pct = 0` em produtos específicos — golden test deve cobrir ambos os edge cases.
- (B) Arredondamento pode diferir entre PROPORTIONAL e os outros 2 modos (subtração vs multiplicação) — usar ajuste-no-maior-componente padrão V5.

**Dependências:** Nenhuma (motor V5 já em produção).

---

### STORY-MRM-V6-002 — UI Seletor 3 páginas + maxDiscountPercent dinâmico

**Sprint:** S1 | **Estimativa:** 3h | **Owner sugerido:** @dev Dex | **Validador:** @qa Quinn

**User story:**
> **Como** usuário final (vendedor/empresário),
> **quero** escolher entre 3 modos de desconto no `<Select>` que hoje aparece desabilitado, em orçamentos, pedidos e vendas,
> **para** flexibilizar minha negociação comercial sem trocar de aba ou rota.

**Critérios de aceitação (8):**
1. **AC1 — Habilitar Select em orcamentos:** Em `src/pages/orcamentos/index.tsx:2315-2322`, remover `disabled` e substituir options de 1 item por 3 itens:
   ```tsx
   <Select 
     value={discountMode} 
     onChange={(e) => setDiscountMode(e.target.value as DiscountMode)}
     options={[
       { value: 'PROPORTIONAL', label: 'Proporcional (padrão)' },
       { value: 'SELLER_REDUCTION', label: 'Reduzir comissão (vendedor absorve)' },
       { value: 'PROFIT_REDUCTION', label: 'Reduzir lucro (empresa absorve)' },
     ]}
   />
   ```
2. **AC2 — Replicar em pedidos:** Mesma mudança em `src/pages/pedidos/index.tsx` (localizar via `grep "value=\"PROPORTIONAL\" disabled"`).
3. **AC3 — Replicar em vendas:** Mesma mudança em `src/pages/vendas/index.tsx` (localizar via grep).
4. **AC4 — Remover coerção forçada:** Em `src/pages/orcamentos/index.tsx:1109`, alterar:
   ```ts
   setDiscountMode(mrmConfig.enabled ? 'PROPORTIONAL' : legacyMode)
   ```
   para:
   ```ts
   setDiscountMode(savedMode ?? legacyMode ?? 'PROPORTIONAL')
   ```
   onde `savedMode` é o `discount_mode` persistido no orçamento (campo já existe em `budgets`). Replicar lógica em pedidos/vendas.
5. **AC5 — maxDiscountPercent dinâmico:** Em `src/pages/orcamentos/index.tsx:524-534`, refatorar função para receber `discountMode`:
   ```ts
   function maxDiscountPercent(commission_pct: number, profit_pct: number, total_pct: number, mode: DiscountMode): number {
     switch (mode) {
       case 'PROPORTIONAL': return (commission_pct + profit_pct) / total_pct  // teto atual
       case 'SELLER_REDUCTION': return commission_pct / total_pct  // só comissão pode absorver
       case 'PROFIT_REDUCTION': return profit_pct / total_pct  // só lucro pode absorver
     }
   }
   ```
   Replicar em pedidos/vendas se função for duplicada (ou centralizar em util).
6. **AC6 — Propagar até motor:** `discountMode` selecionado pelo usuário é passado para `mrm-orchestrator` ao computar `ReapurationInput.discount_mode`. Confirmar via inspeção de payload em DevTools.
7. **AC7 — Persistência:** Ao salvar orçamento/pedido/venda, `discount_mode` é gravado na coluna correspondente (já existe em DB — ver `project_supabase_migrations_lessons.md`). Reload da página recupera o modo escolhido.
8. **AC8 — Mobile responsiveness:** `<Select>` com 3 opções renderiza corretamente em `<640px` (classes globais `.auth-page/.auth-card` já existentes — ver `project_responsive_system.md`).

**Lacunas/decisões cobertas:** O4.

**Arquivos afetados:**
- `src/pages/orcamentos/index.tsx` (Select habilitado + coerção removida + maxDiscountPercent dinâmico)
- `src/pages/pedidos/index.tsx` (idem)
- `src/pages/vendas/index.tsx` (idem)
- Possivelmente `src/utils/mrm-orchestrator.ts` (propagação do campo se ele não fluir automaticamente)
- Possivelmente `src/utils/discount-helpers.ts` (se função `maxDiscountPercent` for centralizada)

**Riscos:**
- (M) `maxDiscountPercent` pode estar duplicado em 3 páginas — recomendar centralização em `src/utils/discount-helpers.ts` durante a refatoração.
- (B) `setDiscountMode` em `orcamentos/index.tsx:1109` pode rodar dentro de `useEffect` com dependências — confirmar que mudança não causa loop infinito.
- (B) `savedMode` precisa ser lido da query Supabase do orçamento — verificar se o select já inclui `discount_mode` ou se precisa adicionar.

**Dependências:** STORY-MRM-V6-001 (motor precisa aceitar `discount_mode` antes da UI propagar).

---

### STORY-MRM-V6-003 — Distribuição UI condicional (residual-distribution-block)

**Sprint:** S2 | **Estimativa:** 2h | **Owner sugerido:** @dev Dex + @ux-design-expert Uma | **Validador:** @qa Quinn

**User story:**
> **Como** usuário final visualizando a distribuição residual de um orçamento/pedido/venda,
> **quero** ver apenas os cards relevantes ao modo de desconto escolhido (sem ver "Lucro" em SELLER, sem ver "Comissão" em PROFIT),
> **para** que a UI reflita corretamente quem está absorvendo o desconto e eu não fique confuso com valores zerados.

**Critérios de aceitação (7):**
1. **AC1 — Nova prop:** `src/page-parts/shared/residual-distribution-block.component.tsx` ganha prop opcional `discountMode?: DiscountMode` (default: `'PROPORTIONAL'`).
2. **AC2 — Render condicional:** Substituir array fixo `[Comissão, Lucro]` em `:95-105` por lógica condicional:
   ```tsx
   const baseCards = []
   if (discountMode !== 'PROFIT_REDUCTION') baseCards.push({ label: 'Comissão', value: commission })
   if (discountMode !== 'SELLER_REDUCTION') baseCards.push({ label: 'Lucro', value: profit })
   const taxCards = !hidesProfitTaxes ? [{ label: 'IRPJ', value: irpj }, { label: 'CSLL', value: csll }] : []
   const allCards = [...baseCards, ...taxCards]
   ```
3. **AC3 — IRPJ/CSLL sempre presentes (quando regime aplicável):** Cards de IRPJ e CSLL aparecem nos 3 modos quando regime ∈ {LP, LR} (controle continua via `hidesProfitTaxes` herdado de `computeResidualDistribution`). Modo SELLER ou PROFIT não esconde IRPJ/CSLL.
4. **AC4 — Banner de fallback:** Quando `breakdown.discount_mode_applied !== breakdown.discount_mode_requested` (caso O6), renderizar banner `<Alert type="info">`: "Modo {requested} indisponível para este item — aplicado PROPORTIONAL automaticamente. Motivo: {warning_reason}". Banner aparece acima dos cards.
5. **AC5 — Layout responsivo:** Em mobile (`<640px`), cards re-fluem corretamente; em SELLER há 1-3 cards visíveis (Comissão + IRPJ + CSLL), em PROFIT há 1-3 (Lucro + IRPJ + CSLL), em PROPORTIONAL há 2-4. Sem overflow horizontal.
6. **AC6 — Acessibilidade:** Cards mantêm semântica existente; banner tem `role="alert"`; mudança de modo trigger re-render audível (`aria-live="polite"` no container).
7. **AC7 — Backward compat:** Componente chamado SEM prop `discountMode` (snapshots V4/V5 lidos sem o campo) renderiza idêntico ao V5 (`[Comissão, Lucro]` + IRPJ/CSLL condicional) — comportamento default preservado.

**Lacunas/decisões cobertas:** O3.

**Arquivos afetados:**
- `src/page-parts/shared/residual-distribution-block.component.tsx` (nova prop + render condicional + banner fallback)
- Callers em `orcamentos`, `pedidos`, `vendas` (passar `discountMode` como prop)
- `src/utils/residual-distribution.ts` (eventualmente — se decidir mover lógica de seleção para a função pura `computeResidualDistribution`; opcional)
- Testes E2E Playwright (se existirem para `residual-distribution-block`)

**Riscos:**
- (B) Caller que não passa a prop continua funcionando (default PROPORTIONAL), mas pode renderizar inconsistente se motor já retornou outro modo. Mitigação: callers passam prop derivada de `breakdown.discount_mode_applied` em vez do estado do form.
- (B) UX precisa validar visualmente se "1 card só" (caso PROFIT/SELLER + regime MEI sem IRPJ/CSLL) não fica feio — Uma revisa antes do merge.

**Dependências:** STORY-MRM-V6-001 (precisa de `discount_mode_applied` no breakdown).

---

### STORY-MRM-V6-004 — Feature flag + ADR-009 + testes de regressão snapshots

**Sprint:** S2 | **Estimativa:** 3h | **Owner sugerido:** @dev Dex + @architect Aria | **Validador:** @qa Quinn

**User story:**
> **Como** arquiteto/QA do sistema,
> **quero** ADR-009 publicado, feature flag invertida e cobertura de regressão para snapshots V4/V5,
> **para** garantir que a reversão da R2 está documentada, governada e não quebra nenhum orçamento/pedido/venda persistido em produção.

**Critérios de aceitação (8):**
1. **AC1 — ADR-009 publicado:** Criar `docs/architecture/ADR-009-discount-modes-revival.md` com seções: Contexto (R2 do Motor V2 + decisão Hyago Opção A), Decisão (reativar 3 modos com isolamento distribuição-vs-tributos), Consequências (engine 2.3.0, retrocompat, ADR-004 superseded em parte), Alternativas consideradas (manter PROPORTIONAL único, adicionar 5+ modos), Status (Accepted após validação Aria).
2. **AC2 — Addendum ADR-004:** Adicionar nota no topo de `docs/architecture/ADR-004-engine-purity.md` (ou equivalente que registrou R2): "**Addendum 2026-05-22:** A descontinuação dos modos SELLER_REDUCTION e PROFIT_REDUCTION (originalmente prevista em R2 deste ADR) foi REVERTIDA pelo ADR-009. Os 3 modos voltam a ser suportados a partir de engine 2.3.0. Pureza do motor (escopo principal deste ADR) permanece inalterada."
3. **AC3 — Feature flag invertida:** Em `src/config/feature-flags.ts`, mudar `mrm.legacy_modes_visible: false` → `true` (default global). Adicionar comentário JSDoc: `// V6 (2026-05-22): Default true — Opção A aprovada por Hyago. Override para false em tenant_settings se quiser restringir UI.`
4. **AC4 — `coerceLegacyDiscountMode` deprecated:** Função mantém implementação atual (força PROPORTIONAL) mas ganha JSDoc `@deprecated since 2.3.0 — Use discount_mode propagation. Retained for V4/V5 snapshot reads only. Remove in Epic V7 (2026-08+).`
5. **AC5 — Snapshot compat test:** Novo `src/utils/__tests__/mrm-snapshot-compat.test.ts` com 6 cenários:
   - V4 snapshot (`engine_version='2.1.0'`, `discount_mode='MRM'`) → motor lê como PROPORTIONAL, sem erro.
   - V4 snapshot sem campo `discount_mode` → motor lê como PROPORTIONAL.
   - V5 snapshot (`engine_version='2.2.0'`, `discount_mode='MRM'`) → motor lê como PROPORTIONAL.
   - V5 snapshot sem `discount_mode_applied` no breakdown → UI renderiza com fallback "PROPORTIONAL (legado)".
   - V6 snapshot (`engine_version='2.3.0'`, `discount_mode='SELLER_REDUCTION'`) → motor lê nativamente.
   - V6 snapshot com `discount_mode_applied != discount_mode_requested` (fallback caso O6) → UI renderiza banner.
6. **AC6 — Golden test V5 não regride:** Re-rodar `npm test -- margin-reapuration.test.ts` no cenário Excel canônico V5 (RB 190.055,94, desc 10%, sem discount_mode informado). Assert: RRO ≈ R$ 17.471,16 (± R$ 0,02) MANTIDO. Os 5 campos V5 (`peso_op_interna`, `ancora_interna`, `cascade_trace`, `taxes_outside_base`, `tax_credits_applied`) MANTIDOS no breakdown.
7. **AC7 — Memory update:** Atualizar `project_motor_v2_sprint_plan_2026_05_19.md` adicionando linha: "**Atualização 2026-05-22 (Epic V6):** R2 revertida pelo ADR-009 — modos PROFIT_REDUCTION e SELLER_REDUCTION reativados; PROPORTIONAL continua default."
8. **AC8 — QA Gate:** @qa Quinn valida que os 4 stories combinados não introduzem regressão em: (a) cálculos tributários (golden tests V5 passam), (b) snapshots persistidos (compat tests passam), (c) UI mobile (verificação visual nas 3 páginas), (d) bloqueio save quando RRO ≤ 0 (V4) continua funcionando.

**Lacunas/decisões cobertas:** O5; governance ADR; retrocompat completa.

**Arquivos afetados:**
- `docs/architecture/ADR-009-discount-modes-revival.md` (NOVO)
- `docs/architecture/ADR-004-engine-purity.md` (addendum no topo — confirmar nome real do ADR via Aria)
- `src/config/feature-flags.ts` (flag invertida + comentário)
- `src/utils/coerce-legacy-discount-mode.ts` ou local equivalente (annotation `@deprecated`)
- `src/utils/__tests__/mrm-snapshot-compat.test.ts` (NOVO — 6 cenários)
- `src/utils/__tests__/margin-reapuration.test.ts` (regressão V5 mantida)
- Memory `project_motor_v2_sprint_plan_2026_05_19.md` (atualização)

**Riscos:**
- (M) Nome exato do ADR que registrou R2 precisa ser confirmado com Aria — pode ser ADR-002, 003 ou 004. Se for ADR diferente do esperado, AC2 adapta-se.
- (B) Tenants com `tenant_settings.mrm_legacy_modes_visible = false` salvo explicitamente NÃO veem o `<Select>` habilitado — confirmar com Hyago se esse override é desejado ou se v6 ignora setting tenant.
- (B) Snapshot compat tests precisam de fixtures realistas — coletar 3-5 snapshots reais de DB de staging para garantir cobertura.

**Dependências:** STORY-MRM-V6-001, STORY-MRM-V6-002, STORY-MRM-V6-003 (testes de regressão validam o conjunto).

---

## 6. Métricas de Sucesso

| ID | Métrica | Valor alvo | Como medir |
|----|---------|-----------|------------|
| **M1** | 3 modos ativos no `<Select>` em 3 páginas | 100% (3/3 páginas habilitadas) | Inspeção manual + Playwright |
| **M2** | Invariante tributária (impostos iguais nos 3 modos) | 100% bit-exact (± R$ 0,02 arredondamento) | Golden test triplo `margin-reapuration.test.ts` |
| **M3** | Snapshots V4/V5 carregam sem erro | 100% (6/6 cenários compat test passam) | `npm test -- mrm-snapshot-compat.test.ts` |
| **M4** | Golden test V5 (cenário Excel) não regride | RRO ≈ R$ 17.471,16 (± R$ 0,02) | `npm test -- margin-reapuration.test.ts` |
| **M5** | `maxDiscountPercent` correto por modo | SELLER ≤ commission_pct/total; PROFIT ≤ profit_pct/total; PROPORTIONAL ≤ (comm+prof)/total | Test unit `discount-helpers.test.ts` (NOVO) |
| **M6** | Distribuição UI condicional | SELLER esconde "Lucro"; PROFIT esconde "Comissão"; PROPORTIONAL mostra ambos | Playwright assertion em 3 cenários |
| **M7** | Banner de fallback aparece quando modo inviável | 100% dos casos com `discount_mode_applied != requested` | Test unit + Playwright |
| **M8** | Engine version bumped | `MRM_ENGINE_VERSION === '2.3.0'` | Grep no código |
| **M9** | ADR-009 publicado e Aria approved | Arquivo existe; status = Accepted | `git log` + revisão Aria |
| **M10** | ADR-004 (ou equivalente R2) com addendum | Header tem nota "Superseded em parte pelo ADR-009" | Inspeção manual |
| **M11** | Zero novas rotas Next.js | `git diff --stat src/pages` mostra apenas alterações em arquivos existentes | `git diff` |
| **M12** | Feature flag `legacy_modes_visible` default = true | `src/config/feature-flags.ts` linha correspondente | Grep |
| **M13** | Suporte de tickets pós-deploy com queixa "modos sumiram" | 0 em 14 dias | Dashboard suporte / Notion |
| **M14** | Adoção SELLER/PROFIT em 14 dias pós-deploy | ≥ 5% dos novos orçamentos usam modo ≠ PROPORTIONAL | Query SQL `budgets.discount_mode` últimos 14 dias |

---

## 7. Roadmap Sequencial

| Sprint | Duração | Stories | Horas | Objetivos cobertos |
|--------|---------|---------|-------|--------------------|
| **S1 — Motor + UI Seletor** | ~3 dias úteis | STORY-MRM-V6-001, STORY-MRM-V6-002 | 7h | O1, O2, O4, O6 |
| **S2 — UI Condicional + Governance** | ~2 dias úteis | STORY-MRM-V6-003, STORY-MRM-V6-004 | 5h | O3, O5, ADRs |

**Caminho crítico:** S1.001 → S1.002 → S2.003 → S2.004. Stories podem ser quebradas em paralelo após S1.001 entregar `discount_mode` no motor.

**Estimativa total:** 12 horas | **Janela alvo briefing:** 10-14 horas (dentro).

---

## 8. Stakeholders

| Papel | Agente / Pessoa | Responsabilidade |
|-------|-----------------|------------------|
| **PM (autor)** | @pm Morgan | Manutenção deste PRD; trade-offs de escopo; validação Hyago |
| **Architect** | @architect Aria | ADR-009 (revival); addendum ADR-004; revisão de S1.001 |
| **Dev** | @dev Dex | Implementação das 4 stories; golden tests; snapshot compat tests |
| **Data Engineer** | @data-engineer Dara | Confirmação que `discount_mode` existe em `budgets`/`orders`/`sales` (já existe — sem nova migration) |
| **QA** | @qa Quinn | QA Gate de cada story; validação invariante tributária; regressão V5 |
| **UX** | @ux-design-expert Uma | Revisão visual do `residual-distribution-block` condicional (S2.003) + banner fallback |
| **DevOps** | @devops Gage | Push, PR, deploy; observação dashboards pós-deploy |
| **Founder/Cliente** | Hyago | Validação Opção A; validação base "comissão original" usar RV_original (Story 001 risco M); validação UX final |

---

## 9. Mapa Decisão → Stories

| Decisão | Origem | Story | Sprint |
|---------|--------|-------|--------|
| Reativar 3 modos no motor | Hyago Opção A | STORY-MRM-V6-001 | S1 |
| Isolar distribuição vs tributos | ADR-009 (novo) | STORY-MRM-V6-001 | S1 |
| Fallback PROPORTIONAL gracioso | O6 | STORY-MRM-V6-001 | S1 |
| Habilitar `<Select>` desabilitado | Análise código atual | STORY-MRM-V6-002 | S1 |
| `maxDiscountPercent` dinâmico | O4 | STORY-MRM-V6-002 | S1 |
| Distribuição UI condicional | O3 | STORY-MRM-V6-003 | S2 |
| Banner de fallback | O6 (parte UI) | STORY-MRM-V6-003 | S2 |
| Feature flag invertida | Decisão Hyago | STORY-MRM-V6-004 | S2 |
| ADR-009 publicado | Governance | STORY-MRM-V6-004 | S2 |
| Snapshot compat (V4/V5) | O5 | STORY-MRM-V6-004 | S2 |
| Addendum ADR-004 (R2 superseded) | Governance | STORY-MRM-V6-004 | S2 |

**Cobertura:** 11/11 decisões → 4 stories.

---

## 10. Principais Riscos do Epic

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| **R1** | Tenants com `commission_pct = 0` ou `profit_pct = 0` em produtos disparam fallback PROPORTIONAL silenciosamente | MÉDIA | AC4 da Story 001 retorna `status='DISCOUNT_MODE_FALLBACK'` + warning estruturado; UI exibe banner (AC4 Story 003); golden test cobre 2 edge cases |
| **R2** | Snapshots V4/V5 com `discount_mode='MRM'` (~hipoteticamente milhares em produção) podem renderizar errado | ALTA | AC5 Story 004 valida 6 cenários compat; `coerceLegacyDiscountMode` mantida `@deprecated`; default `'PROPORTIONAL'` nunca deixa renderização quebrar |
| **R3** | Decisão da base "comissão original" em SELLER (`RV_original` vs `RV_pós-desconto`) pode gerar números diferentes do esperado pelo Hyago | ALTA | ADR-009 documenta decisão explicitamente; Hyago valida cenário canônico antes de merge da Story 001 |
| **R4** | `maxDiscountPercent` duplicado em 3 páginas pode divergir entre orcamentos/pedidos/vendas se não centralizado | MÉDIA | Story 002 recomenda centralização em `src/utils/discount-helpers.ts` durante a refatoração |
| **R5** | Vendedores podem usar SELLER indiscriminadamente para fechar negócios e zerar a própria comissão (uso indevido cultural) | BAIXA | UX/Hyago decisão pós-deploy: adicionar tooltip educacional + considerar permissão por role em Epic V7 |
| **R6** | Mudança de feature flag default pode quebrar tenants que esperavam `legacy_modes_visible: false` | BAIXA | Flag continua override-able por `tenant_settings`; AC3 Story 004 documenta migração |
| **R7** | ADR-004 (ou ADR que registrou R2) pode ter nome/numeração diferente do esperado | BAIXA | Aria confirma nome exato antes de AC2 Story 004 |
| **R8** | Coluna `discount_mode` pode ter constraint CHECK em DB que rejeita `'SELLER_REDUCTION'` ou `'PROFIT_REDUCTION'` | MÉDIA | Dara valida CHECK constraint antes do início do Sprint 1; se houver, migration mínima é adicionada (out-of-scope original — reportar como bloqueador) |

---

## 11. Reversão Explícita da Decisão R2

> **R2 (Motor V2, original):** "Os modos `PROFIT_REDUCTION` e `SELLER_REDUCTION` são descontinuados; sistema opera exclusivamente em `PROPORTIONAL` quando MRM ativo. Justificativa: simplificar motor e evitar ambiguidade de UX durante transição V1→V2."

**Status pós Epic V6:** **REVERTIDA**.

**Novo posicionamento (ADR-009):**

> "Os 3 modos (`PROPORTIONAL`, `SELLER_REDUCTION`, `PROFIT_REDUCTION`) são suportados nativamente pelo motor MRM a partir de engine 2.3.0. O isolamento entre **distribuição residual** (objeto da escolha do modo) e **cálculo tributário** (invariante) é garantido por contract test — os 3 modos produzem valores idênticos para todos os impostos e custos, divergindo APENAS nos componentes `commission` e `profit` dentro de `TaxBreakdown`. A escolha do modo é exposta no `<Select>` já presente nas páginas de orçamento/pedido/venda (UI sem novas rotas, conforme restrição-mãe do Founder)."

**ADR afetados:**
- **ADR-004 (Engine Purity)** — Recebe addendum: "R2 superseded em parte pelo ADR-009". Pureza do motor permanece intacta (motor continua função pura — `discount_mode` é input, não trigger de I/O).
- **ADR-009 (Discount Modes Revival)** — **NOVO** — registra reversão R2, decisão Hyago Opção A, contract da invariante tributária.

**Cliente que aprovou a reversão:** Founder Hyago — reunião 2026-05-22.

---

## 12. Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-05-22 | 1.0 | Criação inicial do PRD do Epic MRM-V6 (4 stories, 12h, reverte R2 via ADR-009). Mapeia 11 decisões; cobre invariante tributária com golden test triplo; preserva pureza ADR-004; zero novas rotas; zero migrations Supabase obrigatórias. | @pm Morgan |

---

## Anexo A — Referências

- **EPIC-MRM-V5-AJUSTES.md** (PRD do Epic V5, baseline 2.2.0 deste Epic V6).
- **Spec original Motor V2** — registra a Decisão R2 que está sendo revertida.
- `src/types/mrm.ts:64` — declaração existente do type `DiscountMode`.
- `src/utils/calculate-discount.ts` — implementação preview dos 3 modos (referência de fórmula).
- `src/utils/margin-reapuration.ts:299-301` — bloco-alvo do refactor da Story 001.
- `src/pages/orcamentos/index.tsx:524-534, 1109, 2315-2322` — pontos de modificação UI (Story 002).
- `src/page-parts/shared/residual-distribution-block.component.tsx:95-105` — bloco-alvo do refactor da Story 003.
- `src/config/feature-flags.ts` — flag `mrm.legacy_modes_visible` (Story 004).
- Memory: `project_motor_v2_sprint_plan_2026_05_19.md`, `project_motor_reapuracao_margem.md`, `project_epic_mrm_v5_2026_05_22.md`, `project_supabase_migrations_lessons.md`, `project_responsive_system.md`.
- `.aios-core/constitution.md` — Artigos IV (No Invention — todos os 3 modos já existem no type system e no preview) e V (Quality First — golden test triplo + snapshot compat).
- **ADR-009-discount-modes-revival.md** (a ser criado na Story 004).
- **ADR-004-engine-purity.md** (a receber addendum na Story 004).

---

*Documento gerado por @pm Morgan — Synkra AIOS — em conformidade com `aios-core/development/templates/brownfield-prd-tmpl.yaml`. Reverte parcialmente a Decisão R2 do Motor V2 conforme aprovação do Founder Hyago (Opção A) em 2026-05-22.*

---

## Architectural Review (Aria, 2026-05-22)

Review arquitetural do PRD EPIC-MRM-V6-DISCOUNT-MODES v1.0 contra a arquitetura V5 vigente (`docs/architecture/ARCH-EPIC-MRM-V5.md` v2.0) e os ADRs 001-008 estabelecidos. Veredito ao final.

### APPROVED — Pontos fortes (5)

1. **Isolamento correto entre Etapas 1-8 (tributos) e Etapa 9 (distribuição residual).** O PRD enuncia explicitamente a invariante tributária (Seção 1.3 + diagrama ASCII Seção 4) e propõe golden test triplo (AC6 da STORY-MRM-V6-001) para validá-la bit-exact. Esta separação preserva integralmente ADR-008 (PIS/COFINS apuração) e a fórmula `9,25% × (Âncora − ICMS − ISS)` da Etapa 5 — Aria confirma que essa é a abordagem arquiteturalmente saudável.
2. **Bump MINOR (2.2.0 → 2.3.0) corretamente justificado.** Adicionar `discount_mode?` opcional em `ReapurationInput` e `discount_mode_applied?` em `TaxBreakdown` é estritamente aditivo retrocompatível. Callers V5 que não passam o campo continuam recebendo comportamento idêntico (default `'PROPORTIONAL'`). Aderente a ADR-002.
3. **ADR-003 (snapshot imutável) preservado explicitamente.** Seção 1.3 documenta que snapshots V4 (`engine_version='2.1.0'`) e V5 (`engine_version='2.2.0'`) com `discount_mode='MRM'` continuam válidos para leitura, interpretados como sinônimo de PROPORTIONAL — sem recálculo. AC5 da STORY-MRM-V6-004 cobre 6 cenários compat. Excelente.
4. **Reuso de superfície existente — Constitution Artigo IV (No Invention).** O PRD demonstra que (a) `DiscountMode` type já existe em `src/types/mrm.ts:64`, (b) preview já implementa os 3 modos em `calculate-discount.ts:52-77`, (c) `<Select>` desabilitado já está renderizado em `orcamentos/index.tsx:2315-2322`, (d) coluna `discount_mode` já existe nas tabelas `budgets`/`orders`/`sales`. Zero invenção, zero migration obrigatória — alinhamento perfeito com a constituição.
5. **Fallback estruturado (O6 + AC4 STORY-001).** O design de degradação graceful para PROPORTIONAL quando o modo escolhido é inviável (commission_pct=0 em SELLER, base preservada > RRO em PROFIT) com `status='DISCOUNT_MODE_FALLBACK'` + warning estruturado + sinal `discount_mode_requested ≠ discount_mode_applied` é arquiteturalmente robusto. Evita falha do motor e fornece auditoria completa para a UI exibir banner (AC4 STORY-003).

### NEEDS_REVISION / Pontos de atenção (3 — não bloqueantes, com sugestões)

1. **Decisão "base original" (AR3) precisa estar formalmente fechada ANTES do merge da STORY-MRM-V6-001.** O PRD reconhece o risco (Riscos Story 001, R3 Seção 10) mas deixa em aberto se SELLER usa `RV_original` (= RB pré-desconto) ou `RV` (pós-desconto) como base do `profit_base_original`. **Sugestão concreta:** ADR-009 fechou a decisão em §5.3 (usar `RV_original = RB`). PRD deve incorporar referência cruzada explícita ao ADR-009 §5.3 nos AC3 da STORY-MRM-V6-001 — substituir "base original" genérica por "base PRÉ-desconto conforme ADR-009 §5.3". Isto remove ambiguidade para Dev no momento da implementação e protege contra divergência semântica entre snapshot e preview.

2. **Status `'DISCOUNT_MODE_FALLBACK'` precisa adição formal em `ReapurationStatus`.** O AC4 da STORY-MRM-V6-001 introduz novo valor de status (`'DISCOUNT_MODE_FALLBACK'`) mas não menciona explicitamente que isso exige extensão do union type em `src/types/mrm.ts:57-62` (`ReapurationStatus = 'PENDING' | 'VALID' | 'RRO_ZERO' | 'RRO_NEGATIVE' | 'ERROR'`). Sem esta extensão, TypeScript reclama; com ela, parsers/UI que fazem switch exaustivo precisam aceitar o novo case. **Sugestão concreta:** adicionar AC adicional na STORY-MRM-V6-001 (ou expandir AC4) explicitando: "Adicionar `'DISCOUNT_MODE_FALLBACK'` ao union `ReapurationStatus`; conferir que `mrm-policies.ts` interpreta esse status como `allow` (não bloqueia save — apenas avisa)". Política está coerente com ADR-004: motor não decide, policy aplica.

3. **`maxDiscountPercent` centralizado vs duplicado em 3 páginas.** AC5 da STORY-MRM-V6-002 sugere centralizar em `src/utils/discount-helpers.ts` mas deixa como "recomendação". **Sugestão concreta:** elevar de "recomendação" para "AC obrigatório" — duplicar a função em 3 lugares é dívida técnica garantida (já temos histórico desse padrão no projeto causando drift, conforme memória `project_exports_audit_2026_05.md`). Risco R4 do PRD (severidade MÉDIA) é eliminado se centralizar de saída. Custo marginal: ~30 min. Benefício: zero drift futuro.

### Veredito final

**APPROVED WITH CONDITIONS**

O PRD está arquiteturalmente saudável, respeita todos os ADRs vigentes (001/002/003/004/005/008) e propõe o mínimo de invenção possível (Constitution Artigo IV honrado). As 3 condições acima são **refinamentos de precisão**, não bloqueios estruturais — podem ser endereçadas via patch v1.1 do PRD (mesma sprint S1) sem postergar início da STORY-MRM-V6-001.

**Condições de promoção do ADR-009 para ACCEPTED:**
- (a) PRD incorpora referência cruzada §5.3 do ADR-009 sobre base PRÉ-desconto (NEEDS_REVISION #1) → @pm Morgan
- (b) STORY-MRM-V6-001 ganha AC explícito sobre extensão de `ReapurationStatus` (NEEDS_REVISION #2) → @pm Morgan
- (c) Centralização de `maxDiscountPercent` vira AC obrigatório (NEEDS_REVISION #3) → @pm Morgan
- (d) QA-VALIDATION-EPIC-MRM-V6.md aprovado por @qa Quinn → @qa Quinn (em paralelo)
- (e) Validação do Hyago em cenário canônico (RB=190.055,94, desc=10%, 3 modos) confirma escolha de `RV_original` → @pm Morgan + Hyago

Liberado para STORY-MRM-V6-001 entrar em InProgress assim que (a) + (b) forem aplicados no PRD e Quinn entregar (d). (c) pode ser endereçado dentro da própria STORY-MRM-V6-002 (não bloqueia S1). (e) é gate de merge, não de início.

**Aria, 2026-05-22**

---

## QA Review (Quinn, 2026-05-22)

**Veredito:** APPROVED WITH CONDITIONS

- ✅ Invariante tributária declarada de forma testável (§1.3 + diagrama §4) — sustenta o golden test triplo C-GOLDEN da matriz QA. Documento completo: [docs/qa/QA-VALIDATION-EPIC-MRM-V6.md](../qa/QA-VALIDATION-EPIC-MRM-V6.md) v1.0.
- ✅ 4 stories decompostas com 25+ testes formais cobrindo Motor (C1-C10+GOLDEN), UI Componente (U1-U5), UI Página (P1-P5) e Retrocompat (R1-R4). 0 regressão esperada nos 206+ testes V5 vigentes.
- ✅ Fallback estruturado (O6 / AC4 STORY-001) compatível com ADR-009 §5.4 — `status='DISCOUNT_MODE_FALLBACK'` + `discount_mode_applied ≠ discount_mode_requested` validado pelos cenários C5/C6 (motor) + U5 (UI).
- 🟡 **CON-1 (MEDIUM):** Adicionar tooltip obrigatório no Select e/ou input de desconto explicando `maxDiscountPercent` por modo (risco QR2: usuário pode entender como bug a queda de 20% → 8% ao trocar de PROPORTIONAL para SELLER). UX (Uma) define copy final. Sugiro promover como AC adicional na STORY-MRM-V6-002.
- 🟡 **CON-2 (MEDIUM):** Banner UI obrigatório para fallback (QR3) — AC4 da STORY-MRM-V6-003 cobre, mas Quinn pede reforço com teste automatizado (não só E2E manual) garantindo que o banner aparece SEMPRE que `discount_mode_applied !== discount_mode_requested`. Vide cenário U5 da matriz QA.
- ✅ Condições do ADR-009 alinhadas (CON-1+CON-2 do PRD não bloqueiam início das stories, mas devem ser fechadas antes da STORY-MRM-V6-002 entrar em Done).

**Quinn, 2026-05-22**
