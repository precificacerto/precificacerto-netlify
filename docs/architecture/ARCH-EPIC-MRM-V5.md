# ARCH-EPIC-MRM-V5 — Análise Técnica do Epic Motor RR V5

**Status:** Approved with Conditions (Architect Review v2.0 — pós-correção do PRD v1.1)
**Data:** 2026-05-22 (revisão v2.0)
**Arquiteta responsável:** @architect Aria
**Restrição global:** "Não criar novas abas, somente ajustar lógica" — sem novas screens, apenas evolução do motor + persistência semântica.
**Engine atual:** `MRM_ENGINE_VERSION = '2.1.0'` (motor RR V4, commit `d13b54e`).
**Engine alvo:** `MRM_ENGINE_VERSION = '2.2.0'` (motor RR V5, retrocompatível via campos opcionais + ADR-003 imutabilidade).
**Referências:** ADR-001 (single source of truth), ADR-002 (semver engine_version), ADR-003 (snapshot fiscal invariante), ADR-004 (motor puro vs policies), ADR-005 (deprecação edge), **ADR-008 (PIS/COFINS apuração — NOVO)**.

> **🔄 Revisão v2.0 (2026-05-22):** Esta versão reflete as correções aplicadas no PRD v1.1 pelo @pm Morgan, orquestradas por Orion (aios-master), após decodificação célula-a-célula do Excel oficial. **Resolveu 3 das 4 decisões pendentes** (L1/L2 fórmula peso, L4 base canônica única sem feature flag, L8 dupla perspectiva PIS/COFINS). Resta apenas L5 (rro_threshold_check observacional) — não bloqueante. **L9 (ISS regime)** postergado para Epic V6.

---

## 0. Sumário Executivo

| Item | Resposta v2.0 |
|------|----------|
| **Veredicto** | **APPROVED** (v2.1 — ADR-008 promovido para Accepted em 2026-05-22 pela aprovação do Founder; shadow mode 7d é o único gate antes do promote para produção) |
| **Migrations Supabase obrigatórias** | **ZERO** (todos os 5 campos novos cabem no jsonb existente `tax_breakdown`) |
| **Migrations opcionais** | 1 doc-only (atualizar COMMENT SQL) + 1 future (L9 ISS regime — Epic V6) |
| **Lacunas inviáveis** | nenhuma |
| **Lacunas que exigem ADR novo** | 3 — ADR-006 (memória cascata jsonb, APPROVED), ADR-007 (ISS regime — POSTPONED para V6), **ADR-008 (PIS/COFINS apuração — ACCEPTED 2026-05-22 ✅)** |
| **Bump semver** | `2.1.0 → 2.2.0` (MINOR — 5 campos opcionais no `TaxBreakdown` + 2 em `ReapurationInput`; mudança de fórmula PIS/COFINS é equivalente em ICMS=17%, ADR-008 documenta) |
| **Risco principal** | mudança de fórmula PIS/COFINS (ADR-008) altera valor canônico quando ICMS ≠ 17% — exige validação fiscal antes do release |
| **Decisões pendentes da v1.0** | 4 → **0** (todas fechadas — ADR-008 promovido para Accepted 2026-05-22 pelo Founder; único gate operacional remanescente é shadow mode 7d antes do promote) |

---

## 1. Análise de Viabilidade Técnica (L1–L10)

### L1 — Peso Op Interna ausente em `TaxBreakdown` (REVISADO v2.0)

- **Viabilidade:** ALTA
- **Approach corrigido (pós-Excel):** `peso_op_interna` é **propriedade da precificação ORIGINAL do produto/serviço**, calculada via markup divisor:
  ```
  Op_Interna_Original = custo / (1 − Σ percentuais_internos)   ← Excel H21 (markup divisor)
  Op_Externa_Original = Σ(IBS, CBS, IPI, ICMS-ST, DIFAL) × (Op_Interna − ICMS − PIS/COFINS)
  peso_op_interna     = Op_Interna_Original / (Op_Interna + Op_Externa)  ← Excel I21 = 93,1585%
  ```
  **Não é cálculo runtime sobre cp+mod+dop** (como a v1.0 do PRD sugeria erroneamente). É um INPUT do motor, vindo de duas fontes (ver ADR-004):
  1. **Snapshot histórico** em `tax_breakdown.peso_op_interna` (ADR-003 imutável)
  2. **Cálculo no orchestrator** (`mrm-orchestrator.ts`) a partir da config do produto quando snapshot ausente
- **Arquivos a tocar:** `src/types/mrm.ts` (campo + `ReapurationInput.peso_op_interna`), `src/utils/margin-reapuration.ts` (consome via input), `src/utils/mrm-orchestrator.ts` (calcula via markup divisor — I/O permitido), `src/page-parts/shared/residual-distribution-block.component.tsx` (display).
- **Princípios:** ADR-002 (MINOR bump), **ADR-004 reforçado** (motor puro NÃO faz markup divisor — fica no orchestrator), ADR-003 (snapshot imutável).

### L2 — Âncora Interna não é passo explícito (`RV × Peso_Op_Interna`) (REVISADO v2.0)

- **Viabilidade:** ALTA
- **Approach corrigido (pós-Excel):** `ancora_interna` é a base operacional **PÓS-desconto** (Excel H36):
  ```
  RV             = RB − desconto         ← Excel H35
  ancora_interna = RV × peso_op_interna  ← Excel H36 = R$ 159.342,38 (no cenário canônico)
  ```
  **Distinção crítica vs v1.0:** `ancora_interna ≠ Op_Interna_Original`. A Âncora é PÓS-desconto (resultado dinâmico do orçamento); `Op_Interna_Original` (H21) é PRÉ-desconto (configuração estática do produto). O motor produz a Âncora; o orchestrator (ou snapshot) fornece o peso.
- **Persistência:** campo `ancora_interna: number | null` em `TaxBreakdown` (jsonb existente, sem nova coluna).
- **Arquivos a tocar:** mesmos de L1.
- **Princípios:** alinhamento nomenclatura PDF Motor RR + Excel; sem regressão numérica em cenários V4 (Âncora ≡ `RV − imp_total` quando peso=1).

### L3 — Memória cascata 13 itens não exposta

- **Viabilidade:** ALTA
- **Approach:** adicionar dois campos em `TaxBreakdown`:
  - `bases_intermediarias_cascata: Array<{ passo: number; descricao: string; base: number; tributo: TaxType | null; aliquota: number | null; valor: number; base_acumulada_pos: number }>` (~7-13 entradas dependendo de quantos tributos por dentro estão ativos)
  - `memoria_cascata: Array<{ ordem: number; etiqueta: string; formula: string; valor: number }>` (versão "human-readable" para PDF/export)

  Motor expõe ambos como subprodutos da Etapa 4 (`computeTaxesInside`) — não altera fórmula. Tamanho estimado: ~1.6-1.8 KB extra por item no jsonb (toleráveis dentro do limite de jsonb do Postgres).
- **Arquivos a tocar:** `src/types/mrm.ts`, `src/utils/margin-reapuration.ts` (atualizar `computeTaxesInside` para acumular trace), `src/page-parts/shared/residual-distribution-block.component.tsx` (UI accordion ou expandable, **sem nova aba**).
- **Princípios:** motor puro continua puro (trace é parte do output, não side effect). Memoization opcional — não persistir `memoria_cascata` quando `engine_minimal=true` (otimização futura).

### L4 — Tributos por fora: base canônica `Âncora − ICMS − PIS/COFINS` (REVISADO v2.0)

- **Viabilidade:** ALTA (decisão fechada via análise do Excel)
- **Approach corrigido (pós-Excel):** fórmula única, sem feature flag. Identidade matemática descoberta:
  ```
  Excel H62 (Total_Op_Dentro_Final) ≡ Âncora_Interna
    porque RRO é 100% redistribuído entre Comissão+Lucro+IRPJ+CSLL (Etapa 8)
    e Âncora = ICMS + PIS/COFINS + custos + despesas + (componentes_distribuídos)
                                                        ← = RRO redistribuído
  
  Logo: H65 (IBS) = (H62 − H43 − H41) × IBS_rate
                  ≡ (Âncora − PIS/COFINS − ICMS) × IBS_rate
        H66 (CBS) = (Âncora − PIS/COFINS − ICMS) × CBS_rate
  ```
  **Substituir** `baseOperacional = rv - imp_total` (linha 261-262) por `taxes_outside_base = ancora_interna - ICMS_amount - PIS_COFINS_amount`. Persistir como campo `taxes_outside_base: number | null` em `TaxBreakdown` (jsonb existente).
- **Feature flag NÃO necessária:** a v1.0 do ARCH propunha `outside_base_mode` enum. **Retirada.** A fórmula correta é única; equivalência com V4 (`rv - imp_total`) só vale quando peso=1 e cenário sem ICMS/PIS/COFINS — caso raro. ADR-008 não cobre L4 (só PIS/COFINS apuração); L4 é puramente fórmula direta.
- **Arquivos a tocar:** `src/utils/margin-reapuration.ts` (substituir base), `src/types/mrm.ts` (campo novo, sem enum).
- **Princípios:** ADR-001 (single source of truth); a base canônica Excel ≡ base canônica do código.

### L5 — Validação RRO > 0 vive no policy layer, não no motor puro

- **Viabilidade:** ALTA (mas exige discussão de ADR-004)
- **Approach:** **NÃO mover decisão de bloqueio para o motor** (violaria ADR-004 e R5). Em vez disso: explicitar no motor que `status = 'RRO_ZERO' | 'RRO_NEGATIVE'` é o **mecanismo de comunicação** com a policy. Adicionar campo `rro_threshold_check: { passed: boolean; threshold: number; observed: number }` ao output como "verificação documentada" — informativo, não decisório. A policy continua sendo quem bloqueia (mrm-policies.ts já existe).
- **Arquivos a tocar:** `src/utils/margin-reapuration.ts` (acrescentar campo informativo), `src/types/mrm.ts`, **NÃO** tocar `mrm-policies.ts` (já está correto).
- **Princípios:** ADR-004 inviolável. Lacuna é de **observabilidade**, não de comportamento.

### L6 — Créditos tributários (recuperáveis/não) desintegrados do motor

- **Viabilidade:** MÉDIA
- **Approach:** tabela `item_tax_credits` JÁ existe (migration `20260213000000_fiscal_tax_engine.sql:232`) com colunas `item_id, tax_type, is_active, rate_percent, credit_value, is_highlighted, source`. Hoje a edge function `calc-tax-engine` consome esses créditos (linhas 82-100), mas o motor RR V4 do cliente NÃO. Approach: criar `src/utils/mrm-credits-loader.ts` (loader que busca créditos do item via `item_tax_credits` quando regime ∈ {LR, LP, SH}) e integrá-lo via orchestrator. O motor puro recebe um campo opcional `tax_credits: { type: TaxType; amount: number; recoverable: boolean }[]` no `ReapurationInput`. Lógica: `CP_efetivo = CP - Σ creditos_recuperaveis` (já era a regra do edge).
- **Arquivos a tocar:** `src/utils/margin-reapuration.ts` (input opcional), `src/utils/mrm-orchestrator.ts` (loader integration), novo `src/utils/mrm-credits-loader.ts`, `src/types/mrm.ts`.
- **Princípios:** motor puro permanece puro (recebe créditos via input). Loader vive na camada orchestrator (I/O permitido lá).
- **Schema:** **nenhuma migration necessária** — tabela existe.

### L7 — Sincronização regime/alíquotas duplicada entre edge e client

- **Viabilidade:** ALTA (já existe plano formal)
- **Approach:** ADR-005 já formaliza deprecação em 3 fases. Hoje estamos em shadow-mode (S3). L7 é resolvida **NÃO criando duplicação nova** — qualquer nova lógica vai exclusivamente para o cliente. Edge function ganha apenas headers `Warning/Sunset` (fase 2 já planejada). Acelerar a fase 2 não exige código novo de motor.
- **Arquivos a tocar:** `supabase/functions/calc-tax-engine/index.ts` (headers de deprecação), nenhum motor.
- **Princípios:** ADR-001 + ADR-005. Sem novo desenvolvimento — apenas adesão ao plano.

### L8 — Relação PIS/COFINS 7,6775% ↔ 9,25% — DUPLA PERSPECTIVA (REVISADO v2.0)

- **Viabilidade:** ALTA
- **Approach corrigido (pós-Excel + ADR-008):** distinguir formalmente as duas perspectivas:
  - **Construção (precificação original)**: `pis_construcao + cofins_construcao ≈ 7,6775%` aplicado sobre H21 (Op_Interna_Original) no markup divisor.
  - **Apuração (reapuração tributária no motor)**: `pis_apuracao + cofins_apuracao ≈ 9,25%` aplicado sobre `(Âncora − ICMS)` na Etapa 5 do motor (Excel H43).
  - **Identidade matemática para ICMS=17%**: `9,25% × (1 − 0,17) = 7,6775%` ✓
- **Implementação em código:**
  1. `mrm-rates-loader.ts` valida ambas as faixas separadamente (`pis_cofins_construcao_rate` e `pis_cofins_apuracao_rate`) — invariante dupla.
  2. `computeTaxesInside()` no motor usa **APENAS** a fórmula de apuração (9,25%), conforme **ADR-008**. A perspectiva de construção é usada apenas na precificação original (módulo formação de preço, fora do scope deste Epic).
  3. Teste unitário valida identidade para ICMS = 17%, 18%, 12% (sem assumir só 17%).
- **Arquivos a tocar:** `src/utils/mrm-rates-loader.ts` (invariante dupla), `src/utils/margin-reapuration.ts` (fórmula apuração — vide ADR-008), `tests/utils/margin-reapuration.test.ts`.
- **Princípios:** ADR-008 formaliza a decisão; L8 cobre validação e teste.

### L9 — ISS sem segregação por regime (RPS vs Simples Nacional)

- **Viabilidade:** MÉDIA
- **Approach:** ISS no Simples Nacional é embutido na alíquota DAS (anexos III/IV/V — tabela `simples_nacional_brackets` já existe). Para RPS / fora do SN, ISS é destacado e calculado independentemente. Adicionar campo `iss_regime: 'RPS' | 'SIMPLES_NACIONAL' | 'NA'` em `services` (e talvez `products`, embora raro). Motor lê esse campo via orchestrator e quando `iss_regime='SIMPLES_NACIONAL'` aplica ISS=0 no cálculo por dentro (já está absorvido no DAS). **Exige nova coluna.**
- **Arquivos a tocar:** nova migration, `src/utils/margin-reapuration.ts`, `src/utils/mrm-orchestrator.ts`, `src/types/mrm.ts`.
- **Princípios:** consistência fiscal com a base já existente (`simples_nacional_brackets`).

### L10 — Guard MEI/SN → CSLL/IRPJ=0 só `console.warn`

- **Viabilidade:** ALTA
- **Approach:** trocar `console.warn` (linha 182) por log estruturado via `mrm_engine_divergences` ou nova tabela `mrm_guard_events` (alternativa: log no campo `messages` do `TaxBreakdown`, que JÁ existe). Recomendação: **persistir no array `messages`** com prefixo `[GUARD-Q5]` — não exige migration nem nova tabela. Telemetria opcional via observabilidade existente.
- **Arquivos a tocar:** `src/utils/margin-reapuration.ts` (linhas 178-187).
- **Princípios:** zero migrations, zero side effects no motor.

---

## 2. ⚠️ IMPACTO NO SUPABASE — Investigação

Investiguei o schema atual (122 migrations, base estável). Análise por item solicitado:

### A. TaxBreakdown jsonb em `*_items` — campos novos exigidos por L1, L2, L3, L4, L6 (REVISADO v2.0)

| Campo proposto | Lacuna | Cabe no jsonb existente? | Nova coluna? |
|----------------|--------|--------------------------|--------------|
| `peso_op_interna` (decimal) | L1 | **SIM** | Não |
| `peso_op_externa` (decimal) | L1 (espelho) | **SIM** | Não |
| `ancora_interna` (numeric/money) | L2 | **SIM** | Não |
| `cascade_trace` (jsonb array 13 entries) | L3 | **SIM** | Não |
| `taxes_outside_base` (numeric) | L4 | **SIM** | Não |
| `tax_credits_applied` (jsonb) | L6 | **SIM** (referência a `item_tax_credits.id` + snapshot do valor) | Não |
| `rro_threshold_check` (jsonb) | L5 | **SIM** | Não |
| `regime_suppressed_taxes` (string[]) | L10 | **SIM** | Não |

**Total: 5 campos primários novos + 3 secundários (informacionais)** — todos opcionais e retrocompatíveis.

**Justificativa reconfirmada:** `tax_breakdown` JÁ é `JSONB NULL` em `budget_items / sale_items / order_items` (migration `20260518000002_mrm_items_engine_fields.sql`). O Postgres tolera jsonb de até 1 GB — adicionar ~2 KB extra por item é irrelevante. **ZERO migrations obrigatórias para A.**

**`ReapurationInput.peso_op_interna` e `ReapurationInput.tax_credits`** são INPUTS TypeScript do motor (não persistidos diretamente — viram parte do `TaxBreakdown` output quando o snapshot é salvo). Sem necessidade de nova coluna ou tabela.

**Necessário (opcional):** 1 migration "docs-only" atualizando `COMMENT ON COLUMN ... tax_breakdown IS ...` para documentar os novos campos. Boa prática auditoria, não obrigatória para funcionamento.

### B. Validação RRO > 0 no motor (L5) — exige migration?

- **NÃO PRECISA migration.** O campo `messages: string[]` e `status: ReapurationStatus` no jsonb já transmitem semântica. A coluna `requires_review` (migration `20260520000005`) JÁ persiste a decisão da policy.
- O novo subcampo `rro_threshold_check` (vide L5) cabe dentro do jsonb existente.

### C. Créditos tributários (L6) — investigar tabela `item_tax_credits`

- **Tabela EXISTE.** Migration `20260213000000_fiscal_tax_engine.sql:232-244`:
  ```sql
  CREATE TABLE public.item_tax_credits (
    id uuid PRIMARY KEY,
    item_id uuid REFERENCES items(id),
    tax_type tax_type NOT NULL,
    is_active boolean DEFAULT false,
    rate_percent numeric,
    credit_value numeric,
    is_highlighted boolean,
    source text DEFAULT 'MANUAL',
    UNIQUE(item_id, tax_type)
  );
  ```
- Migration `20260414000002_lp_icms_credits.sql` adicionou index para LP. RLS ativada via migration `20260217000000_complete_rls_and_roles.sql`.
- **NÃO PRECISA migration.** Falta apenas o **wire-up no cliente** (loader + integração orchestrator).

### D. ISS por regime (L9) — coluna `iss_regime` em products/services?

- **NÃO EXISTE** coluna `iss_regime`. `services` tem `iss_pct` (decimal genérico), `tenant_settings` tem `iss_municipality_rate`, mas nada distingue RPS vs SN.
- **PRECISA migration.** Schema proposto (DDL alto-nível):
  ```
  ALTER TABLE services
    ADD COLUMN iss_regime TEXT NULL CHECK (iss_regime IN ('RPS','SIMPLES_NACIONAL','NA') OR iss_regime IS NULL);
  ALTER TABLE products
    ADD COLUMN iss_regime TEXT NULL CHECK (iss_regime IN ('RPS','SIMPLES_NACIONAL','NA') OR iss_regime IS NULL);
  ```
- Backfill: NULL → motor faz fallback para `tenant_settings.tax_regime === 'SIMPLES_NACIONAL' ? 'SIMPLES_NACIONAL' : 'RPS'`.
- **OPCIONAL:** se o time decidir adiar L9 para sprint posterior, esta migration pode ser separada (4ª migration opcional).

### E. RLS — qualquer nova tabela exige RLS por tenant_id

- **Nenhuma tabela nova** é estritamente necessária para L1-L10.
- Caso L10 evolua para tabela `mrm_guard_events` (não recomendado), seguir padrão de `mrm_engine_divergences` (migration `20260521000001`) — RLS por tenant + super_admin.

### F. Edge function `calc-tax-engine` — precisa ajuste para L7?

- **NÃO PRECISA mudança funcional.** ADR-005 já prescreveu: fase 2 = adicionar headers `Warning/Sunset` (alteração de 5-10 linhas em `index.ts`). Sem mudança de cálculo.
- Esta é uma **alteração de código**, não de schema.

### Resumo do impacto Supabase (REVISADO v2.0)

| Item | Veredicto | Esforço |
|------|-----------|---------|
| A. Novos campos jsonb (5 primários + 3 secundários) | NÃO PRECISA migration | 0 |
| B. RRO check (`rro_threshold_check`) | NÃO PRECISA migration | 0 |
| C. Créditos tributários (`item_tax_credits` JÁ EXISTE) | NÃO PRECISA migration | 0 |
| D. ISS regime (L9) | **POSTERGADO para Epic V6** (ADR-007) | 0 (neste Epic) |
| E. RLS | N/A (nenhuma nova tabela) | 0 |
| F. Edge function | Alteração de código (headers Warning/Sunset), sem schema | 0 |

**Adicionalmente, 1 migration "soft" recomendada (não obrigatória):**

1. Atualizar comentário SQL do `tax_breakdown` para documentar os 5 novos campos do schema 2.2.0 — boa prática auditoria. Migration `20260523000001_mrm_taxbreakdown_v22_docs.sql`.

**TOTAL: ZERO migrations obrigatórias + 1 opcional (docs-only).**

Esta é a maior simplificação de impacto da v2.0: ao postergar L9 e confirmar que TODA a evolução semântica do schema 2.2.0 cabe no jsonb existente, eliminamos completamente o caminho crítico de DDL. O Epic V5 fica 100% no domínio TypeScript + jsonb aditivo.

---

## 3. Diagrama de Fluxo Atual vs Proposto

### Fluxo atual (V4, commit d13b54e)

```
Input (rb, desc, regime, rates, cp, mod, dop, commission_pct, profit_pct, csll_pct, irpj_pct)
   ↓
1) RV = RB - DESC
   ↓
2) computeTaxesInside(RV, rates)   ─── ICMS, ISS sobre RV; PIS/COFINS sobre (RV − ICMS − ISS)
   ↓
3) limite_minimo = (CP+MOD+DOP) / (1 − Σ alíquotas internas)
   ↓
4) RRO = RV − imp_total − CP − MOD − DOP
   ↓
5) Rateio 4 componentes (commission + profit + csll + irpj) sobre RRO
   ↓
6) computeTaxesOutside(baseOperacional = RV − imp_total, rates)
   ↓
7) valor_final = baseOperacional + taxes_outside_total
   ↓
8) Validações V1–V6
   ↓
Output: TaxBreakdown { rb, rv, imp_total, rro, taxes_inside, taxes_outside, new_*, status, ... }
```

### Fluxo proposto (V5)

```
Input (idêntico V4 + opcional: tax_credits, iss_regime, outside_base_mode)
   ↓
1) RV = RB - DESC
   ↓
2) computeTaxesInside(RV, rates, iss_regime)   ─── ISS=0 quando iss_regime='SIMPLES_NACIONAL'
   │  retorna ADICIONALMENTE: bases_intermediarias_cascata[], memoria_cascata[]
   ↓
3) peso_op_interna = imp_total / RV         ◄── NOVO (L1)
   ancora_interna = RV × peso_op_interna     ◄── NOVO (L2)
   ↓
4) CP_efetivo = CP − Σ tax_credits.recoverable   ◄── NOVO (L6, quando regime ∈ {LR,LP,SH})
   ↓
5) limite_minimo = (CP_efetivo+MOD+DOP) / (1 − Σ alíquotas internas)
   ↓
6) RRO = RV − imp_total − CP_efetivo − MOD − DOP
   rro_threshold_check = { passed: RRO > 0, threshold: 0, observed: RRO }  ◄── NOVO (L5)
   ↓
7) Rateio 4 componentes (idem V4)
   ↓
8) outside_base = {
        'rv_minus_inside': RV − imp_total,                    (default V4)
        'rv_minus_recoverable_only': RV − ICMS − PIS − COFINS  (V5/Excel, L4)
   }[outside_base_mode]
   computeTaxesOutside(outside_base, rates)
   ↓
9) valor_final = outside_base + taxes_outside_total
   ↓
10) Validações V1–V6 + log estruturado em messages[] (L10)
   ↓
Output: TaxBreakdown {
   ...V4,
   peso_op_interna,             ◄── NOVO
   ancora_interna,              ◄── NOVO
   bases_intermediarias_cascata, ◄── NOVO
   memoria_cascata,             ◄── NOVO
   creditos_tributarios,        ◄── NOVO
   rro_threshold_check,         ◄── NOVO
   iss_regime_applied,          ◄── NOVO
   outside_base_mode_applied    ◄── NOVO
}
```

**Pontos críticos:**
- Etapas inseridas (3, 4, 8 novo) **não alteram** o output canônico de V4 quando flags ficam em defaults — retrocompatibilidade total.
- `bases_intermediarias_cascata` e `memoria_cascata` são derivações de Etapa 2 — não adicionam custo computacional relevante (~5 push em array).

---

## 4. ADRs Novos (v2.0 — pós-correção)

### ADR-006 — Memória cascata: persistência em jsonb vs tabela dedicada

- **Contexto:** L3 exige persistir 13-item trace por item. Pergunta: jsonb embutido (compacto, fácil snapshot) vs tabela `mrm_cascade_trace` (queryable, mas overhead 10x).
- **Decisão:** **jsonb embutido**. Trace é informacional/auditoria — não há query SQL prevista (busca sempre carrega o item inteiro). Tabela dedicada seria over-engineering.
- **Status v2.0:** **APPROVED** (decisão fechada — Aria + Morgan na revisão v2.0).

### ADR-007 — ISS por regime tributário (L9)

- **Contexto:** L9 propõe distinção `iss_regime` (RPS vs SN) por item.
- **Status v2.0:** **POSTPONED para Epic V6.** Justificativa: a v1.1 do PRD não inclui L9 no escopo crítico; ISS no Simples Nacional já é absorvido pelo DAS via tabela `simples_nacional_brackets` existente. Postergar L9 elimina a única migration DDL necessária e simplifica o Epic V5 para 100% mudança TypeScript + jsonb.
- **Reabrir quando:** contador relatar caso real de tenant com mix RPS+SN exigindo override no item.

### ADR-008 — Fórmula PIS/COFINS na reapuração tributária (NOVO v2.0)

- **Contexto:** Decodificação do Excel oficial (célula H43) revelou que a fórmula canônica de PIS/COFINS na **reapuração** (Etapa 5 do motor RR) é `9,25% × (Âncora − ICMS)`, não `7,6775% × RV` (como motor V4 implementa). As duas fórmulas são matematicamente equivalentes apenas para `ICMS = 17%`. Quando `ICMS ≠ 17%` (18%, ZFM 0%, alíquotas estaduais variadas), apenas a fórmula 9,25% sobre base reduzida produz o valor canônico.
- **Decisão:** Motor V5 (`computeTaxesInside`) usará `(Âncora − ICMS_amount − ISS_amount) × 9,25%` para PIS/COFINS apuração. A perspectiva de 7,6775% (construção da precificação) é preservada NO MÓDULO DE FORMAÇÃO DE PREÇO (fora do scope deste Epic), via validação cruzada no `mrm-rates-loader.ts` (invariante dupla).
- **Status v2.0:** **PROPOSED** — exige aprovação formal antes de STORY-002.AC5 iniciar (revisão fiscal + golden test com ICMS=18% obrigatório).
- **Consequências:**
  - Snapshots V4 (`engine_version='2.1.0'`) NÃO recalculam (ADR-003 — imutabilidade).
  - Golden tests com `ICMS ≠ 17%` precisam ser atualizados com novo valor canônico.
  - Documentação `docs/motor-reapuracao-margem.md` ganha referência cruzada Excel H43.
- **Alternativas consideradas:**
  - (a) **Manter 7,6775% × RV** — REJEITADA: diverge do Excel quando ICMS ≠ 17%.
  - (b) **Feature flag `MRM_PIS_COFINS_MODE`** — REJEITADA: a fórmula 9,25% sobre base reduzida é a forma canônica única (ADR-001 single source of truth).
  - (c) **Bump MAJOR 3.0.0** — REJEITADA: comportamento numérico equivalente em ICMS=17% (default da maioria dos tenants); MINOR 2.2.0 é apropriado, com test gating para tenants com ICMS divergente.

---

## 5. Riscos Técnicos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| **Crescimento jsonb** (cascata 13 itens × milhões de items) | MÉDIA | Estimativa: ~2 KB/item extra. Para um tenant com 100k items, isso é ~200 MB — aceitável. Adicionar GIN index parcial em `tax_breakdown->>'status'` se telemetria mostrar gargalo (opcional). |
| **Migração docs legados sem `peso_op_interna`** | MÉDIA | Todos os campos novos são `optional` (`T \| null`) e snapshot é **imutável** por ADR-003. Docs antigos continuam com schema 2.1.0; novos saves usam 2.2.0. Sem backfill obrigatório. |
| **Sincronização edge ↔ client (L7)** | BAIXA | Já endereçado por ADR-005 (shadow + warning). Sem novo risco. |
| **L4 muda valor canônico para tenants existentes** | ALTA | Default = manter V4. Flag de regime opt-in. Exige test fixture aprovado pelo contador antes do release. |
| **L10 console.warn → messages[]** | BAIXA | Migração trivial. Nenhuma quebra. |
| **Tamanho do `TaxBreakdown` ultrapassa limite de payload Next.js (4 MB)** | BAIXÍSSIMA | Limite é por request, não por item. 2 KB × 500 items = 1 MB. Suficiente. |
| **Cascata mascara bugs de cálculo (excesso de detalhe esconde erro)** | BAIXA | V1-V6 continuam sendo a validação canônica. Cascata é display. |
| **Política `outside_base_mode` por regime requer revisão fiscal** | ALTA | **BLOQUEADOR** para L4 — exige PM/contador confirmar fórmula correta por regime ANTES de dev. |

---

## 6. Veredicto do Arquiteto (v2.0)

### **APPROVED WITH CONDITIONS**

O Epic é tecnicamente viável e arquiteturalmente saudável. Motor permanece puro (ADR-004 reforçado), ADRs 1-5 são respeitados, retrocompatibilidade preservada via campos opcionais + ADR-003 imutabilidade. PRD v1.1 do Morgan corrigiu 3 das 4 decisões pendentes da v1.0.

**Decisões fechadas na v2.0** (vs 4 pendentes na v1.0):

| Decisão v1.0 | Status v2.0 | Resolução |
|--------------|-------------|-----------|
| L1/L2 fórmulas (peso/âncora) | ✅ FECHADA | PRD v1.1 STORY-001.AC2/AC3 — markup divisor original + Âncora PÓS-desconto |
| L4 fórmula tributos por fora | ✅ FECHADA | PRD v1.1 STORY-002.AC1 — base canônica única `Âncora − ICMS − PIS/COFINS`, sem feature flag |
| L8 dupla perspectiva PIS/COFINS | ✅ FECHADA | PRD v1.1 STORY-002.AC4 + ADR-008 |
| ADR-006 cascata jsonb | ✅ FECHADA | APPROVED nesta revisão |

**Condições remanescentes para iniciar implementação:**

1. **ADR-008 (PIS/COFINS apuração) precisa aprovação formal** antes de STORY-002.AC5 iniciar. Aprovador sugerido: @pm Morgan + contador externo. **Esta é a única condição bloqueante.**
2. **L5** — confirmar com @qa Quinn que `rro_threshold_check` é apenas observacional (não migra lógica de bloqueio para o motor — preserva ADR-004). Risco baixo, não bloqueante.
3. **L9 (ISS regime)** — confirmado postergado para Epic V6. Sem ação requerida no V5.

**Lacunas liberadas para dev IMEDIATO** (sem dependência):
L1, L2, L3, L5 (observacional), L6, L7, L8, L10 — toda a STORY-001, STORY-003, STORY-004, STORY-005.

**Lacunas bloqueadas até ADR-008 APPROVED:**
L4 partial (AC1-AC3 da STORY-002 livres; AC4-AC5 aguardam ADR-008).

---

## 7. Recomendações de Sequenciamento

### Dependências entre lacunas

```
L1 (peso_op_interna)  ─┐
L2 (ancora_interna)    ├─→ ambos lidos da Etapa 4; podem ir em paralelo
L3 (memoria cascata)   ─┘  L3 modifica computeTaxesInside; L1/L2 leem o resultado

L5 (rro_threshold_check) ─── independente; campo informacional

L6 (créditos tributários) ─── depende de novo loader (orchestrator), motor recebe via input

L8 (PIS/COFINS Construção) ─── apenas teste; nenhuma dependência de código

L10 (guard log) ─── modificação local em margin-reapuration.ts

L9 (ISS regime) ─── exige migration; bloqueia até ADR-007 aprovado

L4 (outside_base_mode) ─── exige ADR-008 + validação fiscal; bloqueia até decisão

L7 (sync edge) ─── apenas operacional (headers HTTP); paralelo a tudo
```

### Sprints v2.0 (alinhados com PRD v1.1)

| Sprint | Stories | Lacunas | Horas | Critério |
|--------|---------|---------|-------|----------|
| **S1** (Schema & cálculo) | STORY-MRM-V5-001 | L1, L2, L3 (motor) | 10h | Sem migrations, sem decisões pendentes. Bump engine `2.1.0 → 2.2.0`. Inclui orchestrator markup divisor. Suite de testes incluindo golden Excel (RRO 17.471,16, Âncora 159.342,38). |
| **S2** (Tributos por fora + unificação + ADR-008) | STORY-MRM-V5-002 + STORY-MRM-V5-003 | L4, L5, L7, L8 | 14h | **STORY-002.AC5 bloqueada até ADR-008 APPROVED**. AC1-AC4 e toda STORY-003 podem iniciar imediatamente. |
| **S3** (Créditos + ISS regime SN/RPS) | STORY-MRM-V5-004 | L6, L9 (parcial) | 6h | Loader novo (`mrm-credits-loader.ts`) + integração orchestrator. Tabela `item_tax_credits` já existe — wire-up apenas. L9 limitada a fallback `tenant_settings.tax_regime` (sem coluna nova). |
| **S4** (UI exposição) | STORY-MRM-V5-005 | L3 (UI), L10 | 6h | Expansível cascata em DRE consolidada existente; banner guard MEI/SN; ZERO novas telas. |

**Estimativa total:** **36h** (vs 32h da v1.0 — +4h pelo cálculo markup divisor no orchestrator + ADR-008).
**Janela:** dentro de 30-40h definida pelo usuário ✓.
**Crítico path:** S1 → (S2 ∥ S3) → S4.

### Recomendação operacional v2.0

- **Iniciar S1 imediatamente** após aprovação deste ARCH v2.0 + PRD v1.1 (sem espera de migration).
- **Abrir ADR-008 para aprovação formal em paralelo** ao S1 (não bloqueia S1; só bloqueia S2.AC5).
- **Engine version bump:** `2.1.0 → 2.2.0` ao final de S1 (todos os campos novos são opcionais, retrocompatíveis).
- **Migrations:** ZERO obrigatórias. 1 opcional (`20260523000001_mrm_taxbreakdown_v22_docs.sql`) pode ser delegada a @data-engineer Dara apenas se time decidir documentar formalmente — não bloqueante.
- **L9 (ISS regime por item)** → backlog Epic V6, sem ação no V5.
- **Shadow mode** obrigatório por 7 dias antes de promote (vide ADR-008 + QA validation Quinn).

---

## 8. Apêndice — Arquivos a Tocar (consolidado)

### Código TypeScript (cliente)

- `src/types/mrm.ts` — bump VERSION, adicionar campos opcionais em `TaxBreakdown` e `ReapurationInput`
- `src/utils/margin-reapuration.ts` — Etapas novas (peso/âncora/cascata trace, `rro_threshold_check`, outside_base_mode, log estruturado)
- `src/utils/mrm-orchestrator.ts` — wire-up créditos tributários, iss_regime
- `src/utils/mrm-credits-loader.ts` — **NOVO** (loader de `item_tax_credits`)
- `src/utils/mrm-policies.ts` — **NÃO TOCAR** (ADR-004 confirma que policy já está correto)
- `src/page-parts/shared/residual-distribution-block.component.tsx` — UI para exibir peso/âncora/cascata (sem nova aba, accordion in-place)

### Edge function (Supabase)

- `supabase/functions/calc-tax-engine/index.ts` — adicionar headers `Warning/Sunset` (L7, sem mudança de cálculo)

### Migrations Supabase

- **1 obrigatória** (somente se L9 entrar no Epic):
  - `20260523000001_iss_regime_per_item.sql` — adiciona `iss_regime` em `products` e `services`
- **0-2 opcionais** (boa prática):
  - `20260523000002_mrm_taxbreakdown_v22_docs.sql` — apenas atualiza COMMENT SQL
  - (eventualmente) `20260523000003_outside_base_mode_per_regime.sql` se ADR-008 introduzir flag persistida

### Testes

- `tests/utils/margin-reapuration.test.ts` — fixtures novas (L1-L10) + L8 (identidade PIS/COFINS Construção)
- `tests/utils/mrm-orchestrator.test.ts` — integração créditos (L6)
- `tests/utils/mrm-policies.test.ts` — validar que policy continua sendo a fonte única de decisão (L5)

---

**Fim do documento ARCH-EPIC-MRM-V5.**
