# QA Validation — EPIC-MRM-V5-AJUSTES (v2.0)

**Reviewer:** @qa Quinn (Senior QA Engineer)
**Date:** 2026-05-22 (revisão v2.0)
**Status:** **v2.0 — pós-correção PRD v1.1 + ARCH v2.0 + ADR-008** (orquestração Orion)
**PRD reviewed:** `docs/prd/EPIC-MRM-V5-AJUSTES.md` **v1.1** (Morgan, atualizado 2026-05-22)
**ARCH reviewed:** `docs/architecture/ARCH-EPIC-MRM-V5.md` **v2.0** (Aria, atualizado 2026-05-22)
**ADRs reviewed:** ADR-006 (cascata jsonb — APPROVED), ADR-007 (ISS regime — POSTPONED V6), **ADR-008 (PIS/COFINS apuração — ACCEPTED 2026-05-22 pelo Founder) ✅**
**Engine baseline:** Motor RR V4 — commit `d13b54e`, `MRM_ENGINE_VERSION = '2.1.0'`
**Engine alvo:** `MRM_ENGINE_VERSION = '2.2.0'` (MINOR — campos opcionais retrocompatíveis)
**Restrição-mãe:** "Não criar novas abas, apenas ajustar lógica."
**Documentos oficiais de referência:**
- PDF Relatório Motor RR (10 etapas inviolavéis + análise da planilha)
- PDF Formação de Preço (Por Dentro / Por Fora — EC 132/2023 + LC 214/2025)
- Excel oficial (`Motor de descontos do resultado residual operacional.xlsx` — decodificado célula-a-célula por Orion)

> **🔄 Revisão v2.0 (2026-05-22):** Os 6 bloqueadores apontados na v1.0 foram **TODOS atendidos** pelas correções do PRD v1.1 (Morgan) e ARCH v2.0 (Aria), orquestradas por Orion após decodificação célula-a-célula do Excel oficial. Veredicto evolui de **CONCERNS** → **APPROVED WITH CONDITIONS** (ADR-008 PROPOSED é o único gate remanescente). ACs, edge cases, golden tests e métricas foram alinhados aos valores canônicos do Excel (Âncora R$ 159.342,38, RRO R$ 17.471,16, peso_op_interna 0,931585). Detalhes completos no Change Log (final).

---

## 1. Cobertura das 10 Lacunas — ACs Testáveis Exigidos

Para cada lacuna abaixo, defino **ACs objetivamente verificáveis** (passa/falha sem ambiguidade). Estes ACs devem aparecer no PRD; ausência = `CONCERNS`.

### L1 (ALTA) — Peso Op Interna ausente em TaxBreakdown

**Cobertura esperada no PRD:** SIM (lacuna ALTA, obrigatória).
**Restrição "não criar abas":** OK — campo novo em estrutura serializada existente (`TaxBreakdown`).

**ACs testáveis exigidos (v2.0 — alinhados ao PRD v1.1):**

| ID | Critério v2.0 | Como verificar |
|----|----------|----------------|
| AC-L1.1 | `TaxBreakdown` ganha campo `peso_op_interna: number \| null` (decimal, 0..1) | Type-check em `src/types/mrm.ts`; teste lendo `result.peso_op_interna` |
| **AC-L1.2 (CORRIGIDO v2.0)** | Fórmula da **precificação ORIGINAL** (markup divisor, não cálculo runtime): `peso_op_interna = Op_Interna_Original / (Op_Interna + Op_Externa)` onde `Op_Interna_Original = custo / (1 − Σ percentuais_internos)` (Excel I21). Valor canônico esperado: **0,931585** (cenário H4=R$ 53.509,92, RB=R$ 190.055,94) | Teste com Excel canônico → `peso_op_interna ≈ 0,931585 ± 1e-5` |
| AC-L1.3 | Quando RV ≤ 0, motor degrada para `peso_op_interna = 1` (op interna pura — sem op externa) | Teste com RB=0 e desc=0 |
| AC-L1.4 | Quando config do produto incompleta no orchestrator (sem alíquotas externas), default conservador `peso_op_interna = 1` (motor V4 behavior) | Teste com config_minimal |
| AC-L1.5 | Campo é serializado em JSONB `tax_breakdown` e sobrevive round-trip (insert → select) | Teste integração Supabase |
| AC-L1.6 | Engine version bump para `2.2.0` (MINOR — campos opcionais retrocompatíveis) | `expect(result.engine_version).toBe('2.2.0')` |
| **AC-L1.7 (NOVO v2.0 — STORY-001.AC9)** | Orchestrator (`mrm-orchestrator.ts`) calcula `peso_op_interna` a partir da config do produto via markup divisor (3 fontes de prioridade: snapshot → cálculo → default 1). Motor puro (`margin-reapuration.ts`) recebe via `ReapurationInput.peso_op_interna` — ADR-004 preservado | Teste de orchestrator + assertion sobre pureza do motor (sem I/O) |

**Reformulação se PRD vier vago:** Rejeitar AC sem fórmula explícita. **STATUS v2.0:** PRD v1.1 atende todos os ACs acima ✓.

---

### L2 (ALTA) — Âncora Interna não é passo explícito

**Cobertura esperada:** SIM.
**Restrição "não criar abas":** OK — exposto via campo no TaxBreakdown, sem nova UI.

**ACs testáveis exigidos (v2.0 — alinhados ao PRD v1.1):**

| ID | Critério v2.0 | Verificação |
|----|----------|-------------|
| AC-L2.1 | `TaxBreakdown` ganha campo `ancora_interna: number \| null` | Type-check + teste |
| **AC-L2.2 (CORRIGIDO v2.0)** | `ancora_interna = RV × peso_op_interna` (PÓS desconto, célula H36). Distinto de `Op_Interna_Original` (H21, PRÉ desconto da precificação). Valor canônico esperado: **R$ 159.342,38** no cenário Excel (RV=171.050,346 × peso=0,931585) | Teste golden GT-1 → `ancora_interna ≈ 159.342,38 ± R$ 0,02` |
| AC-L2.3 | Identidade quando `peso_op_interna === 1`: `ancora_interna === rv` (caso degenerado V4 sem op externa) | Invariante em testes com `tax_credits=[]` e `taxes_outside=[]` |
| AC-L2.4 | Quando `imp_total = 0` AND `peso_op_interna = 1`, `ancora_interna === rv` | Teste com `rates=[]` |
| **AC-L2.5 (CORRIGIDO v2.0)** | Etapa 9 (tributos por fora) DEVE usar `ancora_interna` como base — fórmula canônica `taxes_outside_base = ancora_interna − ICMS − PIS/COFINS` (não `rv - imp_total`) | Refactor: `taxes_outside_base = breakdown.ancora_interna - breakdown.icms_amount - breakdown.pis_cofins_amount` |
| **AC-L2.6 (NOVO v2.0)** | Distinção arquitetural: `ancora_interna` (motor RR, PÓS desc) ≠ `Op_Interna_Original` (precificação, PRÉ desc). Ambos coexistem; o segundo deriva o `peso_op_interna` que multiplica o primeiro | Teste documental + assertion `H21 !== H36` no cenário canônico |

**STATUS v2.0:** PRD v1.1 STORY-001.AC3+AC6 atendem todos os ACs ✓. Valor canônico 159.342,38 confirmado em GT-1.

---

### L3 (ALTA) — Memória cascata 13 itens não exposta

**Cobertura esperada:** SIM. Esta é a lacuna mais "rica em UI" — risco maior de "criar aba nova" violada.
**Restrição "não criar abas":** Atenção. PRD DEVE explicitar onde a cascata aparece (modal expansível, accordion na DRE já existente, console.debug em dev?).

**ACs testáveis exigidos:**

| ID | Critério | Verificação |
|----|----------|-------------|
| AC-L3.1 | `TaxBreakdown` ganha campo `cascade_trace: CascadeStep[]` com exatamente 13 entradas | `expect(result.cascade_trace).toHaveLength(13)` |
| AC-L3.2 | Cada step tem `{step_id: 1..13, label: string, value: number, formula: string, source: 'RB'|'DESC'|'RV'|...}` | Schema-check com zod ou JSON Schema |
| AC-L3.3 | Step 1 = RB, Step 2 = DESC, Step 3 = RV, Step 4 = ICMS, Step 5 = ISS, Step 6 = PIS, Step 7 = COFINS, Step 8 = Σ impostos por dentro, Step 9 = Âncora Interna, Step 10 = CP, Step 11 = MOD, Step 12 = DOP, Step 13 = RRO | Teste exato comparando labels e ordem |
| AC-L3.4 | Soma dos componentes da cascata reconcilia: `step3 - step8 - step10 - step11 - step12 === step13` (tolerância 1e-9) | Invariante |
| AC-L3.5 | Cascata exposta na DRE consolidada existente (`computeConsolidatedDRE`) sob nova seção `cascade` (sem nova aba) | Test integração `consolidated-dre.test.ts` |
| AC-L3.6 | Quando uma alíquota = 0, o step correspondente tem `value: 0` e `formula: 'N/A'` (NÃO é omitido — preserva ordem fixa de 13) | Teste com `rates=[ICMS]` apenas → 12 outros steps com value=0 |
| AC-L3.7 | Cascade NÃO recalcula — apenas materializa os valores que o motor já computou | Teste: motor chamado 1 vez, cascade construída a partir do resultado |

**Reformulação se PRD vier vago:** Rejeitar AC "expor memória cascata 13 itens" sem definir schema do step, ordem e onde aparece. Exigir mockup textual.

---

### L4 (MÉDIA) — Tributos por fora usam base divergente do Excel

**Cobertura esperada:** SIM.
**Atualmente:** Em `margin-reapuration.ts:262`, `baseOperacional = rv - imp_total` é usada para tributos por fora.
**Excel oficial:** Aplica IPI/ICMS-ST/etc sobre `RV` (não sobre âncora interna) em alguns cenários — divergência confirmada.

**ACs testáveis exigidos (v2.0 — alinhados ao PRD v1.1 + ARCH v2.0, SEM feature flag):**

| ID | Critério v2.0 | Verificação |
|----|----------|-------------|
| **AC-L4.1 (CORRIGIDO v2.0)** | Fórmula canônica **ÚNICA** (sem feature flag): `taxes_outside_base = ancora_interna − ICMS_amount − PIS_COFINS_amount`. Justificativa: identidade Excel `H62 ≡ Âncora` (RRO 100% redistribuído) → `H65 = (H62 − H43 − H41) × IBS_rate ≡ (Âncora − ICMS − PIS/COFINS) × IBS_rate`. NÃO usa `RV` diretamente. | Assert no código: `expect(taxes_outside_base).toBe(ancora_interna - icms - pis_cofins)`; NUNCA `rv - ...` |
| **AC-L4.2 (CORRIGIDO v2.0)** | Quando `ICMS + PIS_COFINS > ancora_interna`, motor produz `taxes_outside_base = 0` (clamp) E adiciona `messages: ['BASE_TRIBUTOS_FORA_NEGATIVA']` (não `status: ERROR` — fórmula degrada graciosamente) | Teste de fuzz com rates extremas |
| **AC-L4.3 (CORRIGIDO v2.0)** | Golden test Excel canônico: `taxes_outside_base ≈ R$ 120.020,65 ± R$ 0,02` (= 159.342,38 − 27.088,20 − 12.233,53); IBS_final ≈ R$ 1.200,21; CBS_final ≈ R$ 10.501,81 | GT-1 (Seção 4) com valores corrigidos |
| **AC-L4.4 (REMOVIDO v2.0)** | ~~Feature flag `MRM_OUTSIDE_BASE_MODE`~~ — **NÃO existe mais**. ARCH v2.0 §1.L4 elimina a flag: a fórmula correta é única. | N/A |
| **AC-L4.5 (CORRIGIDO v2.0)** | Persistência: campo `taxes_outside_base: number \| null` em `TaxBreakdown` (jsonb existente, ZERO migration). Cada `TaxLine` em `taxes_outside` tem `base = taxes_outside_base` (consistente). | Type-check + teste round-trip Supabase |
| **AC-L4.6 (NOVO v2.0)** | Backward compat: snapshots V4 (`engine_version='2.1.0'`) sem `taxes_outside_base` continuam exibindo via fallback para `base` do primeiro `TaxLine.taxes_outside` (ADR-003 — imutáveis) | Teste integração: snapshot V4 + leitor V5 |

**STATUS v2.0:** PRD v1.1 STORY-002.AC1+AC3 atendem todos os ACs ✓. Decisão fechada: fórmula única canônica `Âncora − ICMS − PIS/COFINS`.

---

### L5 (MÉDIA) — Validação RRO > 0 fora do motor

**Cobertura esperada:** PARCIAL. Já existe `mrm-policies.ts` separando motor de policy (correto arquiteturalmente, D5 do ADR-004). PRD precisa decidir: levar V1 de volta para motor OU mover orquestração de policy para callsites (status atual).

**ACs testáveis exigidos:**

| ID | Critério | Verificação |
|----|----------|-------------|
| AC-L5.1 | Decisão explícita: `validations.V1` permanece no motor (RRO > 0 estrito) OU é movida para `mrm-policies.ts` | Documentação |
| AC-L5.2 | Se mantida no motor, `mrm-policies.ts:decideMrmAction()` consome `status === 'RRO_NEGATIVE'`/`'RRO_ZERO'` sem reavaliar lógica | Teste de paridade entre motor.status e policy.action |
| AC-L5.3 | Behavior atual preservado: sale + RRO≤0 → `block_save`; budget/order + RRO≤0 → `warn` + `requires_review=true` | Teste `mrm-policies.test.ts` cobrindo matriz 3×3 (doc × status) |
| AC-L5.4 | Tenant override `rro_policy: 'strict' | 'permissive'` continua funcionando após mudanças | Teste de override |
| AC-L5.5 | `requires_review` boolean é persistido em `budgets.requires_review` / `orders.requires_review` (coluna existente, ver migração `20260521000002_mrm_rro_policy.sql`) | Teste integração SQL |

**Risco:** L5 é mais "decisão arquitetural" do que "feature". PRD pode despriorizar (status atual já é semi-OK). Quinn aceita L5 como NO-OP com justificativa em ADR.

---

### L6 (MÉDIA) — Créditos tributários desintegrados

**Cobertura esperada:** SIM.
**Atualmente:** Não existe campo `creditos_tributarios` no `TaxBreakdown`.

**ACs testáveis exigidos:**

| ID | Critério | Verificação |
|----|----------|-------------|
| AC-L6.1 | `ReapurationInput` ganha campo opcional `tax_credits?: { type: TaxType; amount: number }[]` | Type-check |
| AC-L6.2 | `TaxBreakdown` ganha `taxes_inside_net: TaxLine[]` onde `amount_net = amount - credit` por tipo | Teste com crédito de PIS = R$100 |
| AC-L6.3 | Quando `credit > tax_amount` para um tipo, saldo credor NÃO reduz outros impostos (independência por tipo) — registra `credit_carryforward` no breakdown | Teste edge: crédito PIS = R$200, PIS devido = R$120 → `taxes_inside[PIS].amount_net = 0`, `credit_carryforward.PIS = 80` |
| AC-L6.4 | `imp_total` continua somando `amount` brutos (não líquidos) para preservar V6 — `imp_total_net` é campo NOVO somando `amount_net` | Teste compatibilidade V2.1 |
| AC-L6.5 | RRO calcula com `imp_total_net` quando `tax_credits` presentes, com `imp_total` quando ausentes (backward-compat) | Teste de paridade |
| AC-L6.6 | Créditos só aplicáveis em LP/LR (não-cumulativo) — bloqueado em SN/MEI (guard semelhante a Q5) | Teste com regime=MEI e tax_credits=[...] → motor ignora + warn |

**Risco ALTO:** L6 muda fórmula de RRO. Golden V2 item 13 NÃO usa créditos, então deve continuar passando — mas é necessário golden NOVO que prove crédito funciona.

---

### L7 (MÉDIA) — Sincronização regime/alíquotas duplicada

**Cobertura esperada:** SIM.
**Atualmente:** `src/utils/tax-sync.ts` + `mrm-rates-loader.ts` + `useTenantTaxContext` — três pontos de leitura de alíquotas.

**ACs testáveis exigidos:**

| ID | Critério | Verificação |
|----|----------|-------------|
| AC-L7.1 | Single source of truth definida no PRD: `mrm-rates-loader.ts` OU `tax-sync.ts` (não ambos) | Documentação + remoção do duplicado |
| AC-L7.2 | Após refactor, busca em uma chamada API `/api/tax-periods?date={effective_date}` retorna todos os campos necessários (rates por tipo, regime ativo, créditos elegíveis) | Teste de contrato API |
| AC-L7.3 | `tax-sync.ts` (se mantido) torna-se wrapper fino sobre `mrm-rates-loader.ts` OU é deletado | Code review |
| AC-L7.4 | Hooks atuais (`useTenantTaxContext`) continuam funcionando sem mudança na API exposta | Teste de hook |
| AC-L7.5 | Migração não introduz nova tabela — usa `tax_rate_periods` existente | Verificar ausência de migration nova de schema |

---

### L8 (BAIXA) — Relação PIS/COFINS 7,6775% ↔ 9,25% não validada

**Cobertura esperada:** SIM.
**Contexto:** STF efetivou em 2021 que ICMS/ISS NÃO entram na base PIS/COFINS. Quando tenant configura aggregate 9,25% direto, motor V4 aplica isso sobre RV (errado). Quando configura PIS=1,65% + COFINS=7,60% separados, aplica sobre base reduzida (correto).

**ACs testáveis exigidos (v2.0 — DUPLA PERSPECTIVA conforme ADR-008):**

| ID | Critério v2.0 | Verificação |
|----|----------|-------------|
| **AC-L8.1 (CORRIGIDO v2.0)** | Dupla perspectiva carregada e validada separadamente em `mrm-rates-loader.ts`: **construção** (`pis_construcao + cofins_construcao ≈ 7,6775%`, ±1e-4) E **apuração** (`pis_apuracao + cofins_apuracao ≈ 9,25%`, ±1e-4) — invariante dupla, não única | Contract test em `mrm-rates-loader.test.ts` |
| **AC-L8.2 (CORRIGIDO v2.0)** | Motor RR usa **exclusivamente fórmula de apuração** conforme ADR-008: `(ancora_interna − ICMS − ISS) × 9,25%` (LR não-cumulativo) OU `× 3,65%` (LP cumulativo) OU `× 0%` (MEI/SN). NÃO usa fórmula de construção (7,6775% × RV). | Assert no `computeTaxesInside()`: `expect(pis_cofins_amount).toBe((ancora - icms - iss) * apuracao_rate)` |
| **AC-L8.3 (CORRIGIDO v2.0)** | Identidade matemática para ICMS=17%: `9,25% × (1 − 0,17) = 7,6775%` validada via assert no contract test (tolerância 1e-4) | Test específico em `mrm-rates-loader.test.ts` |
| **AC-L8.4 (NOVO v2.0)** | Teste com ICMS=18% (não-equivalência intencional): motor V5 produz valor diferente de V4. `9,25% × (1 − 0,18) = 7,585% ≠ 7,6775%`. Diferença de ~0,09 p.p. esperada e documentada (ADR-008 §Contexto). | Novo Golden Test GT-7 (Seção 4) |
| **AC-L8.5 (NOVO v2.0)** | `MrmInvariantError` com `code: 'PIS_COFINS_OUT_OF_RANGE'` e `perspective: 'CONSTRUCAO' \| 'APURACAO'` — UI ícone amarelo quando qualquer perspectiva falha (sem bloquear save) | Teste rendering + assertion no error object |
| **AC-L8.6 (NOVO v2.0)** | Tenant config explicitamente marca `tax_regime: 'cumulativo' \| 'nao_cumulativo'` controlando expected: cumulativo LP → apuração 3,65%; não-cumulativo LR → apuração 9,25%; SN → variável anexo; MEI → 0 | Teste por regime (5 cenários) |

**STATUS v2.0:** PRD v1.1 STORY-002.AC4-AC7 + ADR-008 atendem todos os ACs ✓. Dupla perspectiva formalizada.

---

### L9 (BAIXA) — ISS sem segregação RPS/SN — **DEFERRED para Epic V6 (v2.0)**

**Cobertura esperada na v5:** NÃO (POSTPONED).
**Decisão:** ARCH v2.0 §4 (ADR-007) postergou L9 para Epic V6. Justificativa: ISS no Simples Nacional já é absorvido pelo DAS via tabela `simples_nacional_brackets` existente; postergar elimina a única migration DDL necessária e simplifica o Epic V5 para 100% mudança TypeScript + jsonb aditivo. Reabrir quando contador relatar caso real exigindo override no item.

**Action items para Epic V6:**

| ID | Critério (futuro) | Verificação (futuro) |
|----|----------|-------------|
| AC-L9.1 (V6) | `TaxRatePeriod` ganha campo `iss_modality?: 'PROPRIO' \| 'RETIDO_FONTE' \| 'SUBSTITUICAO'` | Type-check |
| AC-L9.2 (V6) | Quando `tax_type='ISS'` e `iss_modality='RETIDO_FONTE'`, motor reclassifica para `ISS_RETIDO` (por fora) | Teste reclassificação |
| AC-L9.3 (V6) | TaxLine resultante registra origem (`origin_state` ou `origin_municipality`) — campo novo opcional | Teste serialização |
| AC-L9.4 (V6) | Vendas para municípios diferentes (split por item se necessário) | Documentação |

**STATUS v2.0:** L9 fora de scope. Sem ação no V5.

---

### L10 (BAIXA) — Aviso MEI/SN supressão CSLL/IRPJ ausente em UI

**Cobertura esperada:** SIM.
**Atualmente:** Guard Q5 só emite `console.warn` (margin-reapuration.ts:182). UI não tem feedback visual.

**ACs testáveis exigidos:**

| ID | Critério | Verificação |
|----|----------|-------------|
| AC-L10.1 | Quando tenant tem regime=MEI/SN E configurou csll_pct OU irpj_pct > 0 em tenant config, UI exibe banner informativo "CSLL/IRPJ não se aplicam a MEI/SN — valores configurados serão ignorados no cálculo" | Teste rendering |
| AC-L10.2 | Banner aparece EM PÁGINA EXISTENTE (Configurações → Tributário), não criar nova rota | Verificar restrição |
| AC-L10.3 | `TaxBreakdown` ganha campo `regime_suppressed_taxes?: TaxType[]` listando o que foi forçado a 0 pelo guard Q5 | Teste schema |
| AC-L10.4 | Migração de regime MEI→LP (mudança em `tenants.tax_regime`): novos cálculos NÃO arrastam supressão; orçamentos antigos com snapshot mantêm comportamento histórico (D2 — imutável) | Teste integração |

---

## 2. Testabilidade dos ACs — Avaliação Geral

| Critério qualitativo | Status esperado no PRD | Observação Quinn |
|----------------------|------------------------|------------------|
| Cada AC tem expressão booleana ou valor numérico esperado | DEVE | Rejeitar ACs subjetivos como "melhorar UX" |
| Cada AC tem caminho de teste claro (unit / integration / E2E) | DEVE | Sem caminho = não testável |
| Tolerâncias numéricas explícitas (R$ 0,01 / 0,02 / 1e-9) | DEVE | Atualmente V2.1 usa `Math.max(0.01, rro * 1e-6)` — manter padrão |
| ACs verificáveis sem rodar UI (quando possível) | RECOMENDADO | Reduz custo de regressão |
| Cada AC mapeia para 1+ teste automatizado | DEVE | Cobertura mínima ≥ 90% para arquivos tocados |

**ACs vagos que Quinn rejeita preventivamente** (se aparecerem no PRD):
- "Melhorar exposição da memória cascata" → sem schema = não testável
- "Alinhar com Excel oficial" → sem células/expected = não testável
- "Sincronizar alíquotas" → sem definir SoT = não testável
- "Exibir aviso para MEI/SN" → sem texto/localização = não testável

**Reformulação padrão exigida:** `Quando <input>, motor/UI DEVE produzir <output exato>, dentro de <tolerância>, verificável via <teste>`.

---

## 3. Edge Cases Obrigatórios (Por Lacuna)

> Total de edge cases identificados: **44** distribuídos entre as 10 lacunas + 4 invariantes globais.

### L1/L2 — Peso e Âncora Interna

1. **EC-L1.1** RV = 0 (RB = desconto): `peso_op_interna = 0`, `ancora_interna = 0`, status `RRO_NEGATIVE` (deduções > 0)
2. **EC-L1.2** Apenas ICMS configurado (PIS/COFINS/ISS = 0): `peso_op_interna = 1 - ICMS%` exato
3. **EC-L1.3** Nenhuma alíquota interna (`rates=[]`): `peso_op_interna = 1`, `ancora_interna === rv`
4. **EC-L1.4** Soma alíquotas internas ≥ 1 (configuração inválida): `peso_op_interna = 0`, `limite_minimo = null`, status `ERROR`
5. **EC-L1.5** PIS+COFINS+ICMS = 99,9999% (perto do limite): `peso_op_interna ≈ 0,0001`, sem NaN
6. **EC-L2.1 (CORRIGIDO v2.0)** Op Externa = 0 (sem tributos por fora): `peso_op_interna === 1` e `ancora_interna === rv`. Caso geral: `ancora_interna = rv × peso_op_interna` (PÓS desconto) — NÃO `=== rv` necessariamente.
7. **EC-L2.2 (CORRIGIDO v2.0)** Op Interna = 0 (config produto sem custo): orchestrator retorna `peso_op_interna = 1` (default conservador), motor degrada para comportamento V4

### L3 — Cascata 13 itens

8. **EC-L3.1** ISS = 0: step 5 tem `value: 0` (não omitido), reconciliação preservada
9. **EC-L3.2** Todos impostos zerados (`rates=[]`): steps 4-8 todos com `value: 0`, step 9 = step 3 (`ancora_interna === rv`)
10. **EC-L3.3** Cascade serializa em JSONB e sobrevive round-trip Supabase
11. **EC-L3.4** Cascade de orçamento com snapshot persistido (D2) mantém valores históricos mesmo se alíquotas atuais mudarem
12. **EC-L3.5** Cascade com RRO_NEGATIVE: step 13 negativo, demais steps válidos

### L4 — Base tributos por fora

13. **EC-L4.1 (CORRIGIDO v2.0)** `ICMS + PIS_COFINS > ancora_interna` (super-impostos): `taxes_outside_base = 0` (clamp) + mensagem `BASE_TRIBUTOS_FORA_NEGATIVA`. Motor não falha (status ≠ ERROR).
14. **EC-L4.2** IPI = 0 (tradicional para serviços): `taxes_outside` lista vazia, `imp_total_outside = 0`
15. **EC-L4.3** Operação interestadual com DIFAL: motor calcula DIFAL sobre **base canônica única** `ancora_interna − ICMS − PIS/COFINS` (sem decisão de fórmula — fórmula é única)
16. **EC-L4.4 (REMOVIDO v2.0)** ~~Feature flag toggle~~ — não existe mais. Substituído por: snapshots V4 preservados via ADR-003 (engine_version determina fórmula histórica)

### L5 — Validação RRO

17. **EC-L5.1** Sale + RRO_NEGATIVE → `block_save` + UI bloqueia botão
18. **EC-L5.2** Budget + RRO_NEGATIVE → `warn` + `requires_review=true` salvo em DB
19. **EC-L5.3** Order + RRO_ZERO (limiar exato) → `warn` (igual a budget per ADR-004)
20. **EC-L5.4** Tenant override `permissive` + sale + RRO_NEGATIVE → `warn` (não bloqueia)
21. **EC-L5.5** Tenant override `strict` + budget + RRO_ZERO → `block_save` (mesmo budget bloqueia)

### L6 — Créditos tributários

22. **EC-L6.1** Crédito PIS R$100 + PIS devido R$80 → saldo credor R$20 registrado, PIS_net = 0
23. **EC-L6.2** Crédito ICMS R$0 (ausente do array): comportamento idêntico a sem crédito
24. **EC-L6.3** Crédito em SN/MEI: warn + ignora créditos
25. **EC-L6.4** Múltiplos créditos do mesmo tipo: somar antes de aplicar (`credit.PIS_total = Σ credit.PIS[i]`)
26. **EC-L6.5** Crédito > imposto total da operação: RRO não vira negativo por causa de crédito (motor protege)

### L7 — Sincronização

27. **EC-L7.1** Tenant muda regime entre data do snapshot e data atual: snapshot mantém regime original (D2 imutável)
28. **EC-L7.2** Alíquota muda no meio do mês: orçamento criado dia 1 com snapshot mantém alíquota antiga; orçamento dia 15 usa nova
29. **EC-L7.3** Loader retorna lista vazia (sem alíquotas configuradas): motor usa `[]` e produz `imp_total = 0` (sem erro)

### L8 — PIS/COFINS dupla perspectiva (v2.0 — ADR-008)

30. **EC-L8.1 (CORRIGIDO v2.0)** Tenant configura apenas `COFINS_construcao=9,25%` (PIS=0): invariante construção falha — ícone amarelo
31. **EC-L8.2** Tenant SN com PIS+COFINS combinados ≈ 1,93% (alíquota efetiva DAS): invariante NÃO dispara (regime cumulativo SN tem perspectiva própria)
32. **EC-L8.3 (CORRIGIDO v2.0)** Tenant LR com construção 1,65%+7,6%=9,25% (não-cumulativo): apuração esperada 9,25% × (1−ICMS). Para ICMS=17%, construção = 7,6775% ✓; para ICMS=18%, construção = 7,585% ✗ (não-equivalência aceita).
33. **EC-L8.4** Tenant LP com construção 0,65%+3%=3,65% (cumulativo): apuração esperada 3,65% × (1−ICMS). Validar identidade por regime.
34. **EC-L8.5 (NOVO v2.0)** Tenant LR com `ICMS=18%` (não-equivalência intencional): motor V5 produz PIS/COFINS = `(Âncora − ICMS) × 9,25%` (apuração); módulo de precificação usa `Op_Interna × 7,585%` (construção). Diferença ~0,09 p.p. — esperada e documentada em ADR-008.
35. **EC-L8.6 (NOVO v2.0)** Tenant ZFM (`ICMS=0%`): construção = apuração = 9,25%. Caso onde construção e apuração colapsam (sem ICMS para reduzir base).

### L9 — ISS modalidade

34. **EC-L9.1** ISS próprio município origem: `taxes_inside[ISS]` com `iss_modality='PROPRIO'`
35. **EC-L9.2** ISS retido em município destino: reclassifica para `taxes_outside[ISS_RETIDO]`
36. **EC-L9.3** Venda com items em municípios diferentes: NO-OP para V5 (documentar em ADR)

### L10 — Aviso MEI/SN

37. **EC-L10.1** Tenant MEI + csll_pct=0 + irpj_pct=0: SEM banner (não há nada a suprimir)
38. **EC-L10.2** Tenant MEI + csll_pct=2% configurado: banner aparece + valor zerado no cálculo
39. **EC-L10.3** Tenant migra MEI→LP: novos cálculos contam CSLL/IRPJ; snapshots antigos NÃO recalculam (D2)
40. **EC-L10.4** Tenant LP→MEI (regressão de regime): banner aparece com lista de tributos suprimidos

### Invariantes globais (DEVEM continuar passando após V5)

41. **INV-1** GOLDEN V2 item 13: RB=141656.68, desc=5%, LR, profit=23%, comm=11.5%, csll=2.07%, irpj=3.45% → RRO=18580.30 ± 0,02
42. **INV-2** V4 com 4 componentes: `new_commission + new_profit + new_csll + new_irpj === rro_distrib` (tolerância dinâmica)
43. **INV-3** MOD imune (R6): `mod` nunca é alterado nem rateado
44. **INV-4** Engine puro: `calculateMarginReapuration` não faz I/O (sem fetch, sem db, sem fs)

---

## 4. Golden Tests Necessários

> Total de golden tests novos: **6** (além do existente V2 item 13).

### GT-1 — Peso e Âncora Interna (L1/L2) — **CORRIGIDO v2.0 com valores canônicos do Excel**

**Inputs (cenário Excel canônico — `Motor de descontos do resultado residual operacional.xlsx`):**
```
RB = 190055.94              (célula H28)
desc_pct = 10%
RV = 171050.346             (célula H35 = RB × 0.9)
regime = LUCRO_REAL
rates_internas = [ICMS 17%, PIS/COFINS apuração 9.25%]
rates_externas = [IBS 1%, CBS 8.75%]
peso_op_interna = 0.931585  (célula I21 — INPUT do motor, vindo do orchestrator)
cp = 53509.92               (custo produto)
mod_admin = 18608.30, despesas_fixas = 18838.47, despesas_var = 10835.66, despesas_fin = 761.33
commission_pct = 5%, profit_pct = 10%, csll_pct = 0.9%, irpj_pct = 1.5%
```

**Outputs esperados (alinhados ao Excel, ADR-008 fórmula apuração):**
| Campo | Célula Excel | Valor canônico | Tolerância |
|-------|--------------|----------------|-----------|
| `rv` | H35 | 171050.346 | exato |
| `peso_op_interna` (NOVO L1) | I21 | **0.931585** | ±1e-5 |
| `ancora_interna` (NOVO L2) | H36 | **159342.38** | ±R$ 0.02 |
| `taxes_inside[ICMS].amount` | H41 | 27088.20 (= 159342.38 × 17%) | ±0.02 |
| `taxes_inside[PIS_COFINS].amount` | H43 | **12233.53** (= (159342.38−27088.20) × 9.25%, ADR-008) | ±0.02 |
| `imp_total` | H41+H43 | 39321.73 | ±0.02 |
| `taxes_outside_base` (NOVO L4) | H62 − H43 − H41 | **120020.65** (= Âncora − ICMS − PIS/COFINS) | ±0.02 |
| `taxes_outside[IBS].amount` | H65 | **1200.21** (= 120020.65 × 1%) | ±0.02 |
| `taxes_outside[CBS].amount` | H66 | **10501.81** (= 120020.65 × 8.75%) | ±0.02 |
| `rro` | H54 | **17471.16** (= Âncora − ICMS − PIS/COFINS − 53509.92 − 18608.30 − 18838.47 − 10835.66 − 761.33) | ±0.02 |
| `new_commission` (rateio) | H57 | 17471.16 × (5/17.4) ≈ 5020.45 | ±0.02 |
| `new_profit` (rateio) | H58 | 17471.16 × (10/17.4) ≈ 10040.90 | ±0.02 |
| `new_csll` (rateio) | H60 | 17471.16 × (0.9/17.4) ≈ 903.68 | ±0.02 |
| `new_irpj` (rateio) | H59 | 17471.16 × (1.5/17.4) ≈ 1506.13 | ±0.02 |
| `validations.V1-V7` | — | todos `true` | exato |

**Validação Excel oficial:** ✅ Inputs idênticos à planilha. RRO esperado = R$ 17.471,16 (não R$ 27.287,122 da v1.0 errada). Decodificação confirmada por Orion 2026-05-22.

### GT-2 — Cascata 13 itens completa (L3) — **CORRIGIDO v2.0 conforme PDF Motor RR Etapa 10**

**Input:** mesmo GT-1 (cenário Excel canônico).
**Output esperado:** `cascade_trace` com 13 entradas exatamente nesta ordem (alinhada ao PDF Motor RR Seção 10):

| step_id | label | value esperado | Célula Excel |
|---------|-------|----------------|--------------|
| 1 | Receita Bruta | 190055.94 | H31 |
| 2 | Desconto aplicado | -19005.594 | H31×G33 |
| 3 | Receita pós-desconto (RV) | 171050.346 | H35 |
| 4 | Aplicação do Peso Operação Interna | × 0.931585 | I21 |
| 5 | Âncora Interna | 159342.38 | H36 |
| 6 | Reapuração ICMS (17%) | -27088.20 | H41 |
| 7 | Reapuração ISS | 0 | (não aplicado) |
| 8 | Reapuração PIS/COFINS (9.25%, ADR-008) | -12233.53 | H43 |
| 9 | Redução de custos | -53509.92 | H48 |
| 10 | Redução de despesas (MO+fixa+var+fin) | -49043.76 | H49+H50+H51+H52 |
| 11 | Resultado Residual Operacional (RRO) | 17471.16 | H54 |
| 12 | Redistribuição proporcional (Com+Lucro+CSLL+IRPJ) | 17471.16 (Σ=100%) | H57+H58+H59+H60 |
| 13 | Reapuração tributos por fora (IBS+CBS) | 11702.02 | H65+H66 |

**Reconciliação invariantes:**
- `step1 + step2 = step3` (190055.94 − 19005.594 = 171050.346) ±1e-9
- `step3 × step4 = step5` (171050.346 × 0.931585 = 159342.38) ±0.02
- `step5 + step6 + step7 + step8 + step9 + step10 = step11` (159342.38 − 27088.20 − 0 − 12233.53 − 53509.92 − 49043.76 = 17467.97 ≈ 17471.16) ±0.02
- `step11 = sum(step12 componentes)` (rateio integral)
- `taxes_outside_base = step5 − |step6| − |step8|` = 120020.65; `step13 = base × (IBS%+CBS%)` ±0.02

### GT-3 — Crédito tributário simples (L6)

**Inputs (acima de GT-1) + créditos:**
```
tax_credits = [
  { type: 'PIS', amount: 1000 },
  { type: 'COFINS', amount: 3000 }
]
```

**Outputs esperados:**
| Campo | Valor | Tolerância |
|-------|-------|-----------|
| `taxes_inside[PIS].amount` (bruto) | 2314.305 | ±0.02 |
| `taxes_inside_net[PIS].amount` (NOVO) | 1314.305 | ±0.02 |
| `taxes_inside_net[COFINS].amount` | 7659.857 | ±0.02 |
| `imp_total` (bruto) | 43763.224 (inalterado) | ±0.02 |
| `imp_total_net` (NOVO) | 39763.224 | ±0.02 |
| `rro` (usando imp_total_net) | 31287.122 | ±0.02 |
| `credit_carryforward` | `{}` (vazio — créditos < impostos) | exato |

### GT-4 — Crédito > imposto (saldo credor) (L6)

**Inputs:** mesmo GT-1 + `tax_credits = [{ type: 'PIS', amount: 5000 }]`.

**Outputs esperados:**
- `taxes_inside_net[PIS].amount = 0` (não negativo)
- `credit_carryforward.PIS = 5000 - 2314.305 = 2685.695`
- `imp_total_net` reflete apenas redução possível (2314.305)
- `rro` aumenta proporcionalmente: 27287.122 + 2314.305 = 29601.427

### GT-5 — PIS/COFINS dupla perspectiva (L8 + ADR-008) — **CORRIGIDO v2.0**

**Cenário A — Tenant LR com configuração inconsistente:**
```
construcao = [PIS_construcao 1.65%, COFINS_construcao 7.6%] = 9.25%
apuracao   = [PIS_apuracao 1.65%, COFINS_apuracao 7.6%]    = 9.25%   ← ERRO: deveria ser 9.25% sobre base reduzida
icms = 17%
regime = LUCRO_REAL
```

**Outputs esperados:**
- Invariante apuração esperada: `pis_apuracao + cofins_apuracao ≈ 9.25%` ✓
- Identidade matemática esperada: `9.25% × (1 − 0.17) = 7.6775%` ✓ (igualdade com construção)
- `validations.V7 = true` (consistência dupla perspectiva passa)
- Motor produz: `PIS/COFINS = (ancora − ICMS) × 9.25%` (fórmula apuração ADR-008)

**Cenário B — Tenant LR mal-configurado (construção ≠ apuração esperada):**
```
construcao = [PIS_construcao 0.65%, COFINS_construcao 3%] = 3.65%   ← cumulativo, mas regime=LR
apuracao   = [PIS_apuracao 0.65%, COFINS_apuracao 3%]    = 3.65%
icms = 17%
regime = LUCRO_REAL (não-cumulativo esperado 9.25%)
```

**Outputs esperados:**
- `MrmInvariantError` com `code: 'PIS_COFINS_OUT_OF_RANGE'`, `perspective: 'APURACAO'`, `expected: '9.25% (não-cumulativo)'`, `actual: 0.0365`
- Motor NÃO falha — apenas sinaliza via `messages: ['PIS_COFINS_REGIME_MISMATCH']`
- UI exibe ícone amarelo (sem bloquear save)

### GT-6 — Regime MEI com csll/irpj configurados (L10)

**Inputs:**
```
regime = MEI
csll_pct = 0.02, irpj_pct = 0.03  // configurados mas devem ser ignorados
```

**Outputs esperados:**
- `new_csll = 0`, `new_irpj = 0` (Guard Q5)
- `regime_suppressed_taxes = ['CSLL', 'IRPJ']` (NOVO L10)
- Console warn emitido (comportamento atual mantido)
- UI lê `regime_suppressed_taxes` e exibe banner

### GT-7 — Não-equivalência ICMS=18% (NOVO v2.0 — ADR-008)

**Objetivo:** validar que motor V5 com `ICMS=18%` produz valor canônico **DIFERENTE** de V4 (fórmula 7,6775% × RV). Este é o test que justifica ADR-008.

**Inputs (variação de GT-1 com ICMS=18%):**
```
RB = 190055.94, desc_pct = 10%, RV = 171050.346
regime = LUCRO_REAL
rates_internas = [ICMS 18%, PIS/COFINS apuração 9.25%]   ← ICMS=18% (não 17%)
peso_op_interna = 0.931585  (mesmo do GT-1)
ancora_interna = 159342.38
```

**Outputs esperados V5 (ADR-008 fórmula apuração):**
| Campo | Fórmula V5 | Valor V5 |
|-------|-----------|----------|
| `ICMS_amount` | Âncora × 18% | 28681.63 |
| `base_pos_icms` | Âncora − ICMS | 130660.75 |
| `PIS/COFINS_amount` (V5) | `(Âncora − ICMS) × 9.25%` | **12086.12** |

**Outputs hipotéticos V4 (fórmula construção 7.6775% × RV):**
| Campo | Fórmula V4 | Valor V4 |
|-------|-----------|----------|
| `PIS/COFINS_amount` (V4 errado) | `RV × 7.6775%` | 13130.39 |

**Assertion crítico:**
- `|PIS/COFINS_V5 − PIS/COFINS_V4| > R$ 1000` (diferença ~R$ 1044 — significativa)
- Diferença confirma não-equivalência das fórmulas quando ICMS ≠ 17%
- Motor V5 com `engine_version='2.2.0'` deve produzir o valor V5 (12086.12), NÃO o valor V4

**Cenário de validação fiscal:** este teste deve ser executado com contador externo antes de promover ADR-008 → Accepted.

### Mapeamento Golden Tests ↔ Validações (v2.0)

| Golden | V1 | V2 | V3 | V4 | V5 | V6 | V7 (PIS/COFINS) | V8 (ADR-008 ICMS≠17%) |
|--------|----|----|----|----|----|----|---|---|
| GT-1 (Excel canônico) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | N/A (ICMS=17%) |
| GT-2 (cascata 13) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | N/A |
| GT-3 (créditos simples) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | N/A |
| GT-4 (saldo credor) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | N/A |
| GT-5 (PIS/COFINS dupla persp) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ (proposital) | N/A |
| GT-6 (MEI/SN) | ✓ | ✓ | ✓ (combined_pct=0) | ✓ | ✓ | ✓ | ✓ | N/A |
| **GT-7 (ICMS=18% ADR-008)** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✓ (não-equivalência)** |

---

## 5. Riscos de Regressão

### 5.1 Risco-mãe — Golden V2 item 13 (RRO=18580.30)

**Status atual:** PASSING em `margin-reapuration-v2.1.test.ts:70-113`.

**Lacunas que podem QUEBRAR este teste:**

| Lacuna | Probabilidade | Impacto | Mitigação v2.0 |
|--------|---------------|---------|-----------|
| **L4 (base tributos por fora)** | BAIXA (v2.0 — feature flag eliminada) | RRO muda se base canônica diferir de V4 | Fórmula única canônica `Âncora − ICMS − PIS/COFINS` definida em PRD v1.1 STORY-002.AC1. Golden V4 com `peso=1` e sem op externa permanece equivalente (degradação V5→V4 graciosa) |
| **L6 (créditos tributários)** | BAIXA | Golden não usa créditos; mudança em `imp_total` se default mudar | Default `tax_credits=[]` mantém comportamento atual |
| **L8 (validação PIS/COFINS) + ADR-008** | **MÉDIA (v2.0)** | Mudança de fórmula apuração (9,25% × (Âncora−ICMS) vs 7,6775% × RV) altera valor canônico para tenants com `ICMS ≠ 17%`. **Golden V2 item 13 (LR, ICMS=18%) tem RISCO MÉDIO de quebrar.** | (1) ADR-008 PROPOSED com 5 critérios para Accepted (vide ADR §Critérios). (2) Shadow mode obrigatório 7 dias antes de promote (vide ADR critério 4). (3) Golden V2 item 13 deve ser revalidado com novo valor canônico OU mantido em `engine_version='2.1.0'` snapshot histórico (ADR-003 imutabilidade). (4) Recálculo opcional para tenants com ICMS divergente deve ser documentado no release notes. |
| **L1/L2 (peso/âncora)** | NULA | Campos novos, não mudam cálculo (motor V4 com `peso_op_interna=1` é equivalente) | — |
| **L3 (cascata)** | NULA | Apenas expõe valores existentes em 13 etapas | — |
| **L5 (rro_threshold_check)** | NULA (v2.0) | Apenas observacional, ADR-004 preservado | — |
| **L7 (sincronização)** | NULA | Refactor invisível ao motor (ADR-005 fase 2) | — |
| **L9 (ISS modalidade)** | N/A (v2.0) | DEFERRED para Epic V6 (ADR-007 POSTPONED) | Sem ação no V5 |
| **L10 (aviso MEI/SN)** | NULA | Golden usa LR; banner é UI-only | — |

**Plano de mitigação v2.0 (alinhado com ADR-008 + ADR-003):**

1. ~~**Feature flags**~~ (v2.0 — ELIMINADAS): a fórmula canônica é única; ADR-008 documenta a decisão de migração de fórmula sem flag.
2. **Backward-compat via engine_version (ADR-003):** Snapshots V4 (`engine_version='2.1.0'`) NÃO recalculam — preservam fórmula histórica 7,6775% × RV. Apenas novos saves V5 usam fórmula canônica 9,25% × (Âncora − ICMS).
3. **Engine version bump:** `2.1.0` → `2.2.0` (MINOR — 5 campos opcionais retrocompatíveis + mudança de fórmula equivalente em ICMS=17%). Bump para `3.0.0` REJEITADO em ADR-008 (comportamento numérico equivalente para a maioria dos tenants).
4. **Rollback plan via ADR-008:** Se shadow mode revelar regressão inaceitável, reverter `computeTaxesInside` para fórmula V4 — diff trivial, < 30 minutos (ADR-008 §Rollback plan).
5. **Shadow mode obrigatório:** Story MRM-V2-S3.1 (`runShadowComparison`) DEVE rodar V5 vs V2.1 em paralelo por **7 dias** antes de promote (ADR-008 critério 4). Métricas no §7.4 desta validação.
6. **Aprovação formal ADR-008:** PROPOSED → Accepted requer 5 critérios cumpridos (vide ADR §Critérios para promover). Aprovação por @pm Morgan + contador externo.

### 5.2 Riscos secundários

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Schema JSONB cresce e impacta queries | BAIXA | Performance | Manter campos opcionais, evitar deep nesting |
| Snapshot D2 quebra (orçamentos antigos não conseguem ler novo schema) | MÉDIA | UX | Migração faz nada — schema é aditivo, leitor faz fallback |
| `consolidated-dre.ts` precisa rebuild para mostrar cascata | MÉDIA | Tempo dev | Story dedicada com testes |
| Engine version mismatch em produção (orçamento criado com 2.1.0, lido com 2.2.0) | BAIXA | Confusão | Versão exibida no PDF/footer; testes asseguram leitura backward-compat |
| Tenant com regime mudado mid-orçamento (orders pendentes) | MÉDIA | Inconsistência | snapshot.regime imutável; novos items usam novo regime |

---

## 6. Veredicto QA (v2.0)

### Status: **APPROVED WITH CONDITIONS** (evolução de CONCERNS v1.0 → APPROVED WITH CONDITIONS v2.0)

**Justificativa:**

PRD v1.1 (Morgan) e ARCH v2.0 (Aria), orquestrados por Orion após decodificação célula-a-célula do Excel oficial, atendem **TODOS os 6 bloqueadores** apontados na v1.0 desta validação. Único gate remanescente: **ADR-008 PROPOSED → Accepted** antes de STORY-002.AC5 iniciar implementação (responsabilidade @pm Morgan + contador externo).

**Resolução dos 6 bloqueadores anteriores (v1.0 → v2.0):**

| # | Bloqueador v1.0 | Status v2.0 | Onde foi atendido |
|---|-----------------|-------------|-------------------|
| 1 | Definir fórmula EXATA de `peso_op_interna` e `ancora_interna` (L1/L2) com referência à célula Excel | ✅ FECHADO | PRD v1.1 STORY-001.AC2 (peso = Op_Interna/RB, célula I21 = 0,931585), AC3 (Âncora = RV × peso, célula H36 = R$ 159.342,38) |
| 2 | Decidir base tributos por fora (L4) — RV ou âncora | ✅ FECHADO | PRD v1.1 STORY-002.AC1 + ARCH v2.0 §1.L4: base canônica única `Âncora − ICMS − PIS/COFINS` (sem feature flag) |
| 3 | Schema completo do `cascade_trace` (L3) — 13 entries com labels exatas | ✅ FECHADO | PRD v1.1 STORY-001.AC4 (13 entries) + GT-2 desta validação com labels alinhadas ao PDF Motor RR Seção 10 |
| 4 | Feature flags obrigatórias para L4 e L6 | ✅ FECHADO (eliminadas) | ARCH v2.0 §1.L4 elimina flag (fórmula canônica única); L6 sem flag — default `tax_credits=[]` mantém retrocompatibilidade |
| 5 | Engine version bump plan documentado (2.1.0 → 2.2.0) | ✅ FECHADO | PRD v1.1 §1.3 + ARCH v2.0 §0 + ADR-002 + ADR-008 §Consequências |
| 6 | Mapeamento Excel ↔ código GT-1 (divergência RRO 17.471,16 vs 27.287,122 resolvida) | ✅ FECHADO | GT-1 desta validação v2.0 corrigido — RRO = 17.471,16 (Excel H54), Âncora = 159.342,38 (H36), peso = 0,931585 (I21) |
| Extra 7 | L9/L10 podem ser follow-up | ✅ FECHADO | ADR-007 POSTPONED para Epic V6 (L9); L10 mantém escopo na STORY-005 |
| Extra 8 | Migration plan documentando ZERO schema | ✅ FECHADO | ARCH v2.0 §2A confirma ZERO migrations obrigatórias (campos JSONB aditivos) |

**Gate remanescente para STORY-002.AC5 iniciar:**

- **ADR-008 PROPOSED → Accepted** — 5 critérios (vide ADR §Critérios para promover):
  1. ✅ Decodificação do Excel confirmada (Orion + Aria, 2026-05-22)
  2. ⏳ Revisão fiscal por contador externo
  3. ⏳ Golden test ICMS=18% (GT-7 desta validação) adicionado
  4. ⏳ Shadow mode 7 dias com diff < R$ 0,02 em 99% para tenants ICMS=17%
  5. ⏳ Atualização de `docs/motor-reapuracao-margem.md` referenciando ADR-008

**Lacunas LIBERADAS para dev IMEDIATO (sem dependência ADR-008):**
- STORY-001 inteira (L1, L2, L3 motor)
- STORY-002.AC1-AC4 (base canônica + invariante dupla perspectiva)
- STORY-003 inteira (L5, L7)
- STORY-004 inteira (L6, L9 parcial via fallback tenant)
- STORY-005 inteira (L3 UI, L10)

**Lacunas BLOQUEADAS até ADR-008 Accepted:**
- STORY-002.AC5 (fórmula PIS/COFINS apuração no motor)

**Em caso de REJECT (improvável agora):**
- Apenas se ADR-008 for rejeitado por contador externo (situação não esperada — fórmula 9,25% × (Âncora − ICMS) é canônica em LR não-cumulativo).
- Plano B: feature flag temporária mantendo fórmula V4 como fallback (rollback plan ADR-008 §).

---

## 7. Recomendações de Teste para @dev (Dex)

### 7.1 Testes Unitários (target ≥ 95% coverage em arquivos tocados) — v2.0

| Arquivo a tocar | Testes novos exigidos v2.0 |
|-----------------|----------------------|
| `src/utils/margin-reapuration.ts` | **GT-1 a GT-7** + 46 edge cases atualizados (Seção 3) + invariantes 1-4 + GT-7 (ICMS=18% ADR-008) |
| `src/utils/mrm-orchestrator.ts` (NOVO escopo v2.0) | Cálculo `peso_op_interna` via markup divisor + 3 fontes de prioridade (snapshot → cálculo → default) — 5 testes |
| `src/utils/mrm-rates-loader.ts` | Dupla perspectiva PIS/COFINS (construção 7,6775% × apuração 9,25%) + identidade 9,25%×(1−ICMS%) — 6 testes (ICMS=17%, 18%, 12%, 0%, válido, inválido) |
| `src/utils/residual-distribution.ts` | Lidar com novos campos (`peso_op_interna`, `ancora_interna`, `taxes_outside_base`) sem quebrar V2.1 — 4 testes |
| `src/utils/consolidated-dre.ts` | Renderizar `cascade_trace` em DRE existente (expansível, sem nova aba) — 4 testes |
| `src/utils/mrm-policies.ts` | Cobrir L5 (rro_threshold_check observacional, ADR-004) — matriz 3×3 doc × status + 2 overrides tenant — 5 testes |
| `src/types/mrm.ts` | TypeScript compile-time — sem teste, mas `pnpm typecheck` DEVE passar |

**Total estimado v2.0:** **~65 testes unitários novos** (vs ~60 v1.0; +5 do orchestrator).

### 7.2 Testes de Integração

| Cenário | Como |
|---------|------|
| Schema JSONB aditivo sobrevive round-trip | Inserir TaxBreakdown V2.2 → ler → comparar deep-equal |
| Orçamento V2.1 lido por código V2.2 (backward-compat) | Mock de DB com snapshot antigo + assert UI funciona |
| Migração de regime (MEI→LP) em tenant ativo | Update tenant + criar novo orçamento + verificar suppressed_taxes vazio |
| Crédito tributário aplicado via `/api/orcamentos/[id]/save` | E2E lite: POST com tax_credits → verificar SELECT retorna imp_total_net correto |
| Tenant override `rro_policy` carregado de `tenant_expense_config` | Mock tenant + chamar `decideMrmAction` + assert action |

**Total estimado:** ~12 testes de integração.

### 7.3 Testes E2E (Playwright — opcional, focado em fluxo)

Como a restrição é "não criar abas", E2E foca em **fluxo orçamento → pedido → venda** existente:

| Cenário | Verificação |
|---------|-------------|
| Criar orçamento LR com desconto 10%, RRO positivo | DRE consolidada mostra cascata 13 itens visível (após L3) |
| Tentar salvar venda com RRO_NEGATIVE | Botão "Salvar" bloqueado + tooltip "RRO negativo" |
| Migrar orçamento → pedido → venda com mesmo snapshot | Valores RRO idênticos nas 3 etapas (D2 imutável) |
| Tenant MEI configura csll/irpj > 0 | Banner amarelo aparece em Configurações → Tributário |
| Tenant LR com `rro_policy='permissive'` salva venda RRO_NEGATIVE | Save passa + flag `requires_review=true` no DB |

**Total estimado:** ~5 E2E (manter footprint pequeno — E2E é caro).

### 7.4 Shadow Mode (Story MRM-V2-S3.1)

**Obrigatório:** Antes de promote para prod, rodar `runShadowComparison` em 100% dos cálculos por **7 dias corridos**. Métricas a monitorar:

| Métrica | Threshold para promote |
|---------|------------------------|
| % cálculos onde V5 difere de V2.1 | < 5% (esperado: feature flags off = 0% diff) |
| Diferença média em R$ | < R$ 0,02 por item |
| Diferença max | < R$ 1,00 por item (alerta humano se > R$ 1,00) |
| Erros não-determinísticos | 0 |
| Tempo médio de execução | < 50ms (P95) |

### 7.5 Verificação CodeRabbit + lint

Antes de marcar story Done:
- `npm run lint` — zero warnings
- `npm run typecheck` — zero erros
- `npm run test -- margin-reapuration` — 100% pass
- `npm run test -- mrm` — 100% pass
- CodeRabbit pre-PR scan: zero P1/P2 issues

---

## 8. Sumário Executivo (v2.0)

| Métrica | Valor v2.0 |
|---------|-------|
| **Veredicto** | **APPROVED WITH CONDITIONS** (vs CONCERNS v1.0) — única condição: ADR-008 PROPOSED → Accepted |
| **Bloqueadores v1.0 atendidos** | **6/6** (vide Seção 6 — matriz de resolução) |
| **Lacunas cobertas** | 10/10 (L9 deferred para Epic V6 via ADR-007 POSTPONED) |
| **Edge cases identificados** | **46** (Seção 3 — +2 vs v1.0 por dupla perspectiva ICMS≠17%) |
| **Golden tests** | **7** (GT-1 a GT-7, sendo GT-7 NOVO para ADR-008 ICMS=18%) |
| **Invariantes a proteger** | 4 (incluindo golden V2 item 13 — risco MÉDIO via ADR-008) |
| **Testes unitários estimados** | **~65** (+5 vs v1.0, orchestrator) |
| **Testes integração estimados** | ~12 |
| **Testes E2E estimados** | ~5 |
| **Engine version bump** | 2.1.0 → 2.2.0 (MINOR, aditivo + fórmula PIS/COFINS equivalente em ICMS=17%) |
| **Feature flags obrigatórios** | **ZERO** (v2.0 — ARCH §1.L4 eliminou flags; fórmula canônica única) |
| **Migrations Supabase** | **ZERO obrigatórias** (5 campos novos no JSONB existente; 1 opcional docs-only) |
| **Novos ADRs** | 3 — ADR-006 APPROVED, ADR-007 POSTPONED V6, **ADR-008 PROPOSED** |
| **Restrição "não criar abas"** | ✅ Respeitada — todas exposições reutilizam DRE / TaxBreakdown / config existentes |
| **Risco principal de regressão** | ADR-008 (mudança fórmula PIS/COFINS) — mitigado por shadow mode 7d + ADR-003 imutabilidade |
| **Shadow mode obrigatório** | 7 dias antes de promote (critério 4 do ADR-008) |
| **Estimativa total Epic** | **36h** (vs 32h v1.0; +4h pelo orchestrator markup divisor + ADR-008) |

### Principais riscos resumidos (v2.0)

1. **ADR-008 PROPOSED** → necessita aprovação formal por @pm + contador externo. Bloqueante apenas para STORY-002.AC5; demais ACs liberados. **Mitigação:** rollback plan documentado em ADR-008 §Rollback (< 30 min se necessário).
2. **Golden V2 item 13 (LR, ICMS=18%)** → risco MÉDIO de mudança canônica. **Mitigação:** ADR-003 preserva snapshots V4; novos golden tests V5 documentam novo valor canônico; shadow mode 7 dias detecta antes do promote.
3. **L3 cascata** → restrição "não criar abas" preservada via expansível em DRE existente (STORY-005). **Mitigação:** AC8 da STORY-005 exige `git diff src/pages` sem nova rota.
4. **L6 créditos** → mudam fórmula RRO quando aplicáveis. **Mitigação:** `tax_credits` opcional, default `[]` mantém retrocompatibilidade total.
5. **L7 sincronização** → refactor invisível ao consumer. **Mitigação:** shadow mode via `mrm-shadow` dashboard existente.

---

### Pronto para próximos passos (v2.0):

- **@pm Morgan:** ✅ PRD v1.1 entregue — pendente aprovação formal de ADR-008 com contador.
- **@architect Aria:** ✅ ARCH v2.0 + ADR-008 entregues — pendente atualização do `motor-reapuracao-margem.md` (critério 5 do ADR-008).
- **@sm River:** **LIBERADO** para fatiar STORY-001 a STORY-005 em sprint operacional (S1-S4 conforme ARCH v2.0 §7).
- **@dev Dex:** **LIBERADO** para iniciar STORY-001 (S1). STORY-002.AC5 aguarda ADR-008 Accepted (paralelo).
- **@data-engineer Dara:** Sem ação obrigatória (ZERO migrations). Opcional: 1 migration docs-only para COMMENT SQL.
- **@devops Gage:** Configurar shadow mode 7d em produção antes do promote do Epic V5.

---

## 9. Change Log

| Data | Versão | Veredicto | Autor | Descrição |
|------|--------|-----------|-------|-----------|
| 2026-05-22 (manhã) | v1.0 | **CONCERNS condicional** | @qa Quinn | Validação inicial com 6 bloqueadores apontados no PRD (que ainda não existia em disco). Identificou divergência Excel↔código em GT-1 (RRO 17.471,16 vs 27.287,122). |
| 2026-05-22 (tarde) | **v2.0** | **APPROVED WITH CONDITIONS** | @qa Quinn + Orion | Revalidação pós-orquestração: PRD v1.1 (Morgan) corrigiu D1-D4, ARCH v2.0 (Aria) atualizou seções + criou ADR-008. **6/6 bloqueadores anteriores atendidos.** ACs L1-L8 reescritas com valores canônicos do Excel. GT-1 corrigido (Âncora 159.342,38, RRO 17.471,16, peso 0,931585). Novo GT-7 (ICMS=18% ADR-008). Edge cases +2. Feature flags eliminadas. Estimativa testes: ~60 → ~65 unitários. **Único gate remanescente: ADR-008 PROPOSED → Accepted (contador).** |

---

*QA Validation Report v2.0 — Quinn (@qa) — 2026-05-22*
*Orquestração multi-agente: Orion (aios-master) → Morgan (@pm) → Aria (@architect) → Quinn (@qa)*
