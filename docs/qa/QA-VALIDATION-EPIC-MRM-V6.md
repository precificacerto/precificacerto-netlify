# QA Validation — EPIC-MRM-V6-DISCOUNT-MODES (v1.0)

**Reviewer:** @qa Quinn (Senior QA Engineer)
**Date:** 2026-05-22
**Status:** **v1.0 — Review formal do PRD do Morgan + ADR-009 da Aria**
**PRD reviewed:** `docs/prd/EPIC-MRM-V6-DISCOUNT-MODES.md` v1.0 (Morgan, 2026-05-22)
**ADR reviewed:** `docs/architecture/adr-009-discount-modes-revival.md` v1.0 PROPOSED (Aria, 2026-05-22)
**Engine baseline:** Motor RR V5 — `MRM_ENGINE_VERSION = '2.2.0'` (commit `d13b54e`)
**Engine alvo:** `MRM_ENGINE_VERSION = '2.3.0'` (MINOR — campo opcional retrocompatível)
**Decisão de negócio:** Founder Hyago aprovou Opção A — reativar os 3 modos com isolamento total dos tributos (2026-05-22)
**Restrição-mãe (herdada V5):** "Não criar novas abas, somente ajustar a lógica."
**Documentos de referência:**
- PRD `EPIC-MRM-V6-DISCOUNT-MODES.md` v1.0
- ADR-009 `adr-009-discount-modes-revival.md` v1.0 PROPOSED
- ADR-004 `adr-004-separacao-motor-pure-vs-policies.md` (R2 superseded em parte)
- ADR-008 `adr-008-pis-cofins-apuracao-formula.md` (invariante mesmo com novo discount_mode)
- ARCH `ARCH-EPIC-MRM-V5.md` v2.0 (baseline arquitetural vigente)
- Excel oficial `Motor de descontos do resultado residual operacional.xlsx`

> **Resumo do veredito:** PRD do Morgan e ADR-009 da Aria estão **alinhados, testáveis e respeitam a invariante tributária** declarada (impostos/custos bit-exact iguais nos 3 modos). Veredito Quinn: **APPROVED WITH CONDITIONS** — 2 condições mínimas (banner UI obrigatório para fallback + validação Hyago da decisão `rv_original` antes de merge) antes de o ADR-009 transitar para ACCEPTED.

---

## 1. Escopo do Review

Validar formalmente que o **revival dos 3 modos de desconto** (PROPORTIONAL, SELLER_REDUCTION, PROFIT_REDUCTION) é seguro para produção sem regressão do Motor V5 — em especial:

1. **Invariante tributária:** os 3 modos NÃO devem alterar ICMS/ISS/PIS/COFINS/IBS/CBS/IPI/DIFAL/FCP/CSLL/IRPJ/RRO/Âncora/peso_op_interna/taxes_outside_base. Apenas `new_commission` e `new_profit` divergem.
2. **Retrocompatibilidade:** snapshots V4 (`engine 2.1.0`) e V5 (`engine 2.2.0`) persistidos com `discount_mode='MRM'`/`null`/`undefined` continuam abrindo sem erro, interpretados como `'PROPORTIONAL'` (ADR-003 preservado — sem recálculo).
3. **Fallback gracioso:** quando o modo solicitado é inviável (`commission_pct=0` em SELLER, `profit_pct=0` em PROFIT, base preservada > RRO_após_impostos), motor degrada para PROPORTIONAL com sinal estruturado (`status='DISCOUNT_MODE_FALLBACK'` + warning + `discount_mode_applied ≠ discount_mode_requested`) e UI exibe banner orientativo.
4. **UI condicional sem inventar telas:** apenas (a) `<Select>` em `orcamentos/pedidos/vendas` reabilitado, (b) `maxDiscountPercent` dinâmico por modo, (c) cards de `residual-distribution-block` condicionais. Zero nova rota/aba/modal.
5. **Pureza do motor:** ADR-004 respeitado — `discount_mode` chega como input, não como contexto externo. Motor permanece função pura.

---

## 2. Matriz de Testes — Motor (calculateMarginReapuration)

Cenário canônico V5 (referência herdada): `RB=190.055,94`, `desconto=10%` (R$ 19.005,59), `RV=171.050,35`, regime `LR`, `ICMS=17%`, `ISS=0%`, `PIS+COFINS=9,25%` (apuração — ADR-008), `peso_op_interna=0,931585`, `Âncora=159.342,38`, `CP=53.509,92`, `MOD=8.500,00`, `DOP=3.200,00`, `commission_pct=8%`, `profit_pct=12%`, `csll_pct=1,08%`, `irpj_pct=1,2%`. Esperado V5: `RRO ≈ R$ 17.471,16` (± R$ 0,02).

| ID | Cenário | Input | Output esperado | Validação |
|----|---------|-------|-----------------|-----------|
| **C1** | PROPORTIONAL + sem desconto + LR (baseline V5) | Canônico com `desc_value=0`, `discount_mode='PROPORTIONAL'` | `rro` igual ao V5 atual; `new_commission` = `rro_apos_impostos × (8/(8+12))`; `new_profit` = restante; `discount_mode_applied='PROPORTIONAL'` | Não regride os 206 testes V5 — assert valores idênticos ao snapshot atual de `margin-reapuration.test.ts` "Caso Tabela 21 + golden V5". |
| **C2** | PROPORTIONAL + desconto 10% + LR | Canônico V6 com `discount_mode='PROPORTIONAL'` | Idêntico ao V5 vigente (cenário canônico Excel): `Âncora≈159.342,38`; `RRO≈17.471,16`; commission/profit rateados proporcionalmente | Regression baseline — compara campo-a-campo com snapshot V5 atual (esperado ZERO divergência). |
| **C3** | SELLER_REDUCTION + desconto 10% + LR | Canônico V6 com `discount_mode='SELLER_REDUCTION'` | `profit = profit_base_original = rv_original × 0,12 = 190.055,94 × 0,12 = R$ 22.806,71` clamp ao `rro_apos_impostos`; `new_commission = rro_apos_impostos − new_profit`. Lucro preservado pré-desconto; vendedor absorve toda redução. | Assert `new_profit ≈ rv_original × profit_pct` (± R$ 0,02). Se `profit_base_original > rro_apos_impostos`, esperar `status='DISCOUNT_MODE_FALLBACK'` (validar via C9). |
| **C4** | PROFIT_REDUCTION + desconto 10% + LR | Canônico V6 com `discount_mode='PROFIT_REDUCTION'` | `commission = commission_base_original = rv_original × 0,08 = R$ 15.204,48`; `new_profit = rro_apos_impostos − new_commission`. Comissão preservada pré-desconto; empresa absorve toda redução. | Assert `new_commission ≈ rv_original × commission_pct` (± R$ 0,02). Idem fallback se `commission_base > rro_apos_impostos`. |
| **C5** | SELLER + `commission_pct=0` (produto sem comissão) → FALLBACK | Canônico com `commission_pct=0`, `profit_pct=0,12`, `discount_mode='SELLER_REDUCTION'` | `status='DISCOUNT_MODE_FALLBACK'`; `discount_mode_applied='PROPORTIONAL'`; `discount_mode_requested='SELLER_REDUCTION'`; `messages` contém `'DISCOUNT_MODE_FALLBACK: requested=SELLER_REDUCTION, reason=commission_pct_zero'`; `new_commission=0`; `new_profit = rro_apos_impostos × (0/(0+0,12))` → ramo PROPORTIONAL com 100% para lucro | Vide ADR-009 §5.4. Assert `result.status === 'DISCOUNT_MODE_FALLBACK'` E `result.messages.some(m => m.includes('commission_pct_zero'))`. |
| **C6** | PROFIT + `profit_pct=0` → FALLBACK | Canônico com `commission_pct=0,08`, `profit_pct=0`, `discount_mode='PROFIT_REDUCTION'` | Espelho de C5: `status='DISCOUNT_MODE_FALLBACK'`; `messages` contém `'profit_pct_zero'`; rateio PROPORTIONAL aplicado | Igual a C5, lado oposto. |
| **C7** | MEI/SN + qualquer modo → `hidesProfitTaxes=true` | Canônico com `regime='SIMPLES_NACIONAL'`, `csll_pct=0,0108`, `irpj_pct=0,012`, `discount_mode='SELLER_REDUCTION'` | Guard Q5 ativo (margin-reapuration.ts:233-250): `csll_pct_effective=0`, `irpj_pct_effective=0`, `new_csll=0`, `new_irpj=0`. Comm + Lucro continuam funcionando conforme SELLER. `discount_mode_applied='SELLER_REDUCTION'`. | Mesmo input nos 3 modos, regime SN/MEI: `new_csll=0` E `new_irpj=0` SEMPRE; new_commission/new_profit obedecem ao modo. |
| **C8** | PROPORTIONAL + desconto + LP | Canônico com `regime='LUCRO_PRESUMIDO'`, `pis_rate=0,0065`, `cofins_rate=0,03` (≈3,65% LP), `discount_mode='PROPORTIONAL'` | `csll_amount` e `irpj_amount` rateados normalmente como peso × RRO (não bloqueado pelo guard Q5). PIS/COFINS apuração validada em 3,65% (ADR-008 perspectiva cumulativa). | Assert `validations.V7 === true` (faixa LP=3,65% reconhecida); CSLL+IRPJ presentes no rateio. |
| **C9** | SELLER com desconto 50% + `commission_pct=3%` + `profit_pct=5%` (conferência manual) | `RB=10.000`, `desc=5.000` (50%), `commission_pct=0,03`, `profit_pct=0,05`, `discount_mode='SELLER_REDUCTION'`, regime LR padrão | `profit_base_original = 10.000 × 0,05 = R$ 500`. Se `rro_apos_impostos ≥ 500`: `new_profit=500`, `new_commission = rro_apos_impostos − 500`. Se `rro_apos_impostos < 500`: FALLBACK PROPORTIONAL (reason=`profit_base_excede_rro`). | Conferência manual com calculadora; documentar no comentário do teste qual ramo o cenário cai (provavelmente fallback dado desconto 50%). |
| **C10** | PROFIT com mesmos inputs de C9 (conferência manual) | Igual a C9, mas `discount_mode='PROFIT_REDUCTION'` | `commission_base_original = 10.000 × 0,03 = R$ 300`. Se `rro_apos_impostos ≥ 300`: `new_commission=300`, `new_profit = rro_apos_impostos − 300`. Caso contrário FALLBACK. | Idem C9, lado oposto. |
| **C-GOLDEN** | **Invariante tributária triplo** (3 modos = mesmo input) | Cenário canônico V6, 3 execuções com `discount_mode ∈ {'PROPORTIONAL', 'SELLER_REDUCTION', 'PROFIT_REDUCTION'}` | Bit-exact iguais nos 3 modos (tolerância R$ 0,02 para arredondamento): `taxes_inside` (todas as linhas ICMS+PIS+COFINS+ISS), `taxes_outside` (todas as linhas IBS+CBS+IPI+DIFAL+FCP), `cp`, `mod`, `dop`, `imp_total`, `rro`, `ancora_interna`, `peso_op_interna`, `taxes_outside_base`, `taxes_outside_total`, `new_csll`, `new_irpj`. Apenas `new_commission` E `new_profit` divergem entre os modos. `commission + profit + csll + irpj === rro` nos 3 modos. | Test triplo conforme ADR-009 §5.5. Loop por linha em arrays. Asserções com `toBeCloseTo(_, 2)`. |

**Total: 11 cenários (C1-C10 + C-GOLDEN)** cobrindo: baseline V5 sem regressão, 3 modos × cenários canônicos, fallback estruturado (×2), regime MEI/SN guard, regime LP, conferência manual com desconto agressivo, invariante tributária triplo bit-exact.

---

## 3. Matriz de Testes — UI Componente (`residual-distribution-block`)

| ID | Cenário | Input (props) | Render esperado | Validação |
|----|---------|---------------|-----------------|-----------|
| **U1** | PROPORTIONAL — cards completos LR | `distribution={ hasDiscount:true, hidesProfitTaxes:false, ... }`, `discountMode='PROPORTIONAL'` | Renderiza 4 cards na ordem: `[Comissão do Vendedor, Lucro da Empresa, IRPJ, CSLL]` | Snapshot test do array `cards`; assert `cards.length === 4`. |
| **U2** | SELLER_REDUCTION — sem Lucro | Idem U1 mas `discountMode='SELLER_REDUCTION'` | Renderiza 3 cards: `[Comissão do Vendedor, IRPJ, CSLL]`. Card "Lucro da Empresa" NÃO renderiza. | Assert `cards.some(c => c.label==='Lucro da Empresa') === false`; `cards.length === 3`. |
| **U3** | PROFIT_REDUCTION — sem Comissão | Idem U1 mas `discountMode='PROFIT_REDUCTION'` | Renderiza 3 cards: `[Lucro da Empresa, IRPJ, CSLL]`. Card "Comissão do Vendedor" NÃO renderiza. | Espelho de U2: `cards.some(c => c.label==='Comissão do Vendedor') === false`; `cards.length === 3`. |
| **U4** | Regime MEI + qualquer modo → IRPJ/CSLL ocultos | `distribution={ hidesProfitTaxes:true, ... }`, `discountMode` variando | `hidesProfitTaxes=true` esconde IRPJ/CSLL nos 3 modos. PROPORTIONAL → `[Comissão, Lucro]`; SELLER → `[Comissão]`; PROFIT → `[Lucro]`. Combinação SELLER+MEI = 1 card só (Comissão). | Assert por modo: cards corretos e ausência de IRPJ/CSLL. UX (Uma) deve validar visual "1 card só não fica feio". |
| **U5** | `discount_mode_applied !== discount_mode_requested` → banner | Caller passa prop nova `discountModeFallback={ requested:'SELLER_REDUCTION', applied:'PROPORTIONAL', reason:'commission_pct_zero' }` (ou consome direto de `breakdown.messages`) | Banner amarelo (cor já existente em `regimeGuardActive` style: `rgba(234,179,8,0.10)`) renderiza acima dos cards com texto: "Modo SELLER_REDUCTION solicitado, mas aplicado PROPORTIONAL automaticamente. Motivo: produto sem comissão configurada." Tem `role="alert"`. | AC4 da STORY-MRM-V6-003. Validar acessibilidade (`role="alert"`) e que aparece SOMENTE quando há fallback (não na operação normal). |

**Total: 5 cenários UI componente.**

---

## 4. Matriz de Testes — UI Página (orcamentos / pedidos / vendas)

| ID | Cenário | Ação | Esperado | Validação |
|----|---------|------|----------|-----------|
| **P1** | Select habilitado mostra 3 opções | Abrir `/orcamentos` em modo novo orçamento | `<Select>` em `orcamentos/index.tsx:2315-2322` NÃO está `disabled`; mostra 3 opções: "Proporcional (padrão)", "Reduzir comissão (vendedor absorve)", "Reduzir lucro (empresa absorve)". Default selecionado: `'PROPORTIONAL'`. | E2E Playwright manual: inspecionar atributo `disabled` ausente; contar `<option>` = 3. Repetir em `/pedidos` e `/vendas`. |
| **P2** | Trocar modo dispara recálculo | Em `/orcamentos` com item adicionado, alterar Select de PROPORTIONAL → SELLER_REDUCTION | Bloco `residual-distribution-block` re-renderiza imediatamente: card "Lucro" desaparece, card "Comissão" mostra novo valor (lucro preservado pré-desconto). Payload enviado ao motor (visível em DevTools Network) contém `discount_mode: 'SELLER_REDUCTION'`. | E2E manual: inspecionar DevTools → request a `mrm-orchestrator` ou estado React; conferir card removido. |
| **P3** | `maxDiscountPercent` ajusta conforme modo | Em `/orcamentos`, com `commission_pct=8%` e `profit_pct=12%`: <br>- Modo PROPORTIONAL → teto desconto = `(8+12)/total = 20%/total` <br>- Modo SELLER → teto = `8/total` <br>- Modo PROFIT → teto = `12/total` | Slider/input de desconto bloqueia valores acima do teto correspondente; tooltip exibe explicação ("Em SELLER, o teto é a sua comissão"). Cálculo em `discount-helpers.ts` (centralizado) ou inline na página. | E2E manual + unit test em `discount-helpers.test.ts` para `maxDiscountPercent(8, 12, 100, mode)` retornando 20/8/12 conforme modo. |
| **P4** | Snapshot V5 com `discount_mode='MRM'` abre como PROPORTIONAL | Carregar budget existente (`engine_version='2.2.0'`, `discount_mode='MRM'`) | UI carrega Select preselecionado em `'PROPORTIONAL'` (não em 'MRM' que não existe nas options); cards renderizam corretamente; **nada é recalculado** — `tax_breakdown` salvo é exibido como está (ADR-003 preservado). | Cenário crítico — risco HIGH conforme §7. Testar com snapshot real de produção; conferir que ZERO chamada de recálculo dispara ao abrir. |
| **P5** | Save persiste discount_mode escolhido | Em novo orçamento, escolher SELLER_REDUCTION e salvar | DB tabela `budgets` recebe `discount_mode='SELLER_REDUCTION'` (não coercido para 'MRM' ou 'PROPORTIONAL'); `tax_breakdown.discount_mode_applied='SELLER_REDUCTION'`. Reload da página recupera o modo. | Test integração Supabase (insert + select); conferir que `coerceLegacyDiscountMode` NÃO é chamado no save path (apenas no read path para snapshots legados). |

**Total: 5 cenários UI página.**

---

## 5. Matriz de Testes — Retrocompatibilidade

| ID | Cenário | Snapshot persistido | V6 deve | Validação |
|----|---------|---------------------|---------|-----------|
| **R1** | Snapshot V4 com modo legado legítimo | `engine_version='2.1.0'`, `discount_mode='SELLER_REDUCTION'`, `tax_breakdown` calculado pelo motor V4 | Abrir e exibir nativamente como `'SELLER_REDUCTION'` (V4/V5 coagiam para PROPORTIONAL no read path; V6 respeita o que está persistido — conforme ADR-009 §6 linha "V3 / V2 antigos") | Test integração: criar fixture com snapshot V4 + `discount_mode='SELLER_REDUCTION'`; assert UI mostra Select em SELLER, cards `[Comissão, IRPJ, CSLL]`. |
| **R2** | Snapshot V5 com `discount_mode='MRM'` | `engine_version='2.2.0'`, `discount_mode='MRM'`, `tax_breakdown.new_commission` + `new_profit` calculados PROPORTIONAL | Abrir como `'PROPORTIONAL'` (matematicamente equivalente — sem recálculo). Select preselecionado em PROPORTIONAL. Cards `[Comissão, Lucro, IRPJ, CSLL]`. | Cenário CRÍTICO — vide P4 e §7 (risco HIGH). Função `coerceLegacyDiscountMode` mantida (vide ADR-009 §6) trata isso na leitura. |
| **R3** | Doc sem `discount_mode` (null/undefined) | Snapshot antigo sem coluna ou com `discount_mode=null` | Default `'PROPORTIONAL'`. Select preselecionado em PROPORTIONAL; sem erro de runtime. | Test edge: fixture sem campo; assert default aplicado. |
| **R4** | Mudança de modo NÃO afeta tax_breakdown salvo | Abrir doc histórico (V4/V5), trocar Select de modo, **NÃO** salvar | `tax_breakdown` em DB permanece exatamente o que estava (ADR-003 — snapshot imutável). Apenas se usuário salvar, novo tax_breakdown V6 é calculado (transição V5→V6 controlada). | Test integração: snapshot.tax_breakdown antes === depois quando só houve mudança de UI sem save. |

**Total: 4 cenários retrocompatibilidade.**

---

## 6. Critérios Globais de Aceitação para Release

| # | Critério | Como medir |
|---|----------|------------|
| ✓ | 0 regressão nos 206+ testes MRM existentes (`margin-reapuration.test.ts`, `mrm-policies.test.ts`, `residual-distribution.test.ts`, `consolidated-dre.test.ts`, etc.) | `npm test` em CI sem falhas vermelhas; baseline `2.2.0` continua passando |
| ✓ | 25+ testes novos cobrindo a matriz acima (Motor C1-C10+GOLDEN = 11 + UI Componente U1-U5 = 5 + UI Página P1-P5 = 5 + Retrocompat R1-R4 = 4) | Contagem em `__tests__/margin-reapuration.test.ts` + `__tests__/residual-distribution-block.test.tsx` (criar se não existe) + `__tests__/discount-helpers.test.ts` |
| ✓ | Golden test triplo (C-GOLDEN) passa bit-exact para todos os impostos | Assert por loop em `taxes_inside`/`taxes_outside` + assertion individual para `rro`/`ancora_interna`/`peso_op_interna`/`taxes_outside_base`/`csll_amount`/`irpj_amount` |
| ✓ | Lint, typecheck e build limpos | `npm run lint && npm run typecheck && npm run build` |
| ✓ | Testado manualmente em orcamentos/pedidos/vendas com fluxo completo (criar → trocar modo → recalcular → salvar → reabrir) | Checklist E2E manual por @qa Quinn antes de marcar Done |
| ✓ | CodeRabbit sem CRITICAL (max 2 iterações self-heal — ADR-006 / rule coderabbit-integration) | Output `wsl bash -c '~/.local/bin/coderabbit --prompt-only -t uncommitted'` sem severity CRITICAL |
| ✓ | ADR-009 promovido de PROPOSED → ACCEPTED (gate condicional — vide §10) | Edit em `docs/architecture/adr-009-discount-modes-revival.md` linha 3 |
| ✓ | Validação Hyago da decisão `rv_original = rb` (PRÉ-desconto) para SELLER/PROFIT em cenário canônico (vide ADR-009 §5.3) | Confirmar via reunião/email; registrar no Change Log do ADR-009 |
| ✓ | Engine version bumped `2.2.0 → 2.3.0` em `src/types/mrm.ts:29` + entrada no comentário do bloco | Grep `MRM_ENGINE_VERSION` confirma `'2.3.0'`; comentário inclui nota "2.3.0: 3 modos de desconto..." |

---

## 7. Riscos Identificados pelo QA

| ID | Risco | Severidade | Mitigação proposta |
|----|-------|-----------|---------------------|
| **QR1** | Snapshot V5 com `discount_mode='MRM'` (forma como hoje todos os orçamentos pós-Epic V5 estão salvos) pode quebrar na leitura V6 se o read path tentar usar 'MRM' como Select option (não existe nas 3 opções novas) | **HIGH** | Testar leitura em `/orcamentos` editar com snapshot real de produção (P4 + R2). Garantir que `coerceLegacyDiscountMode` (mantido em `src/config/feature-flags.ts:83-107`) interceptie 'MRM' → 'PROPORTIONAL' ANTES de chegar ao Select. Adicionar test E2E manual obrigatório no Definition of Done. |
| **QR2** | `maxDiscountPercent` por modo pode confundir usuário ao mudar drasticamente entre opções (ex.: PROPORTIONAL aceitava 20%, SELLER aceita só 8%) — usuário pode entender como bug | **MEDIUM** | Tooltip obrigatório no Select e/ou no input de desconto explicando: "Em SELLER, o teto é a sua comissão (8%); em PROFIT, o teto é a margem de lucro (12%); em PROPORTIONAL, é a soma de ambos (20%)". UX (Uma) define copy final. |
| **QR3** | Fallback silencioso (`DISCOUNT_MODE_FALLBACK`) pode passar despercebido pelo usuário, especialmente em fluxo rápido de save — vendedor escolhe SELLER mas o sistema aplica PROPORTIONAL sem o vendedor perceber | **MEDIUM** | Banner UI **obrigatório** (U5 e AC4 da STORY-MRM-V6-003) com `role="alert"` quando `discount_mode_applied !== discount_mode_requested`. Cor amarela (já existe pattern em `regimeGuardActive`). Texto humano: "Modo X indisponível — aplicado PROPORTIONAL. Motivo: Y". |
| **QR4** | Snapshot V4 com modo legado (`'SELLER_REDUCTION'`/`'PROFIT_REDUCTION'` legítimos pré-MRM) pode ter cálculo diferente do novo motor V6 — porque V4 nem sequer usava motor MRM | **LOW** | ADR-003 garante imutabilidade: snapshot V4 só é exibido, nunca recalculado. Test R1 valida que o snapshot abre nativamente como o modo persistido sem disparar recálculo. |
| **QR5** | Vendedor pode usar SELLER indiscriminadamente para zerar a própria comissão (impacto cultural — R5 do PRD do Morgan §6.3) | **LOW** | Fora do escopo técnico V6 (cabe a UX/Hyago pós-deploy: tooltip educacional + eventual gate por role em Epic V7). Quinn registra para acompanhamento. |
| **QR6** | Arredondamento pode divergir entre PROPORTIONAL (multiplicação `× peso`) e SELLER/PROFIT (subtração `rro − base_original`) — diferença de centavos não fecha contabilidade | **LOW** | Ajuste-no-maior-componente padrão V5 (linhas 324-341 de `margin-reapuration.ts`) deve ser aplicado nos 3 ramos para preservar `commission + profit + csll + irpj === RRO` exato. AR2 do ADR-009 cobre isso. C-GOLDEN valida bit-exact. |

---

## 8. Plano de Quality Gates

| Gate ID | Camada | Cobertura | Critério PASS | Owner |
|---------|--------|-----------|---------------|-------|
| **QG-001** | Motor (`margin-reapuration.ts`) | Cenários C1-C10 + C-GOLDEN | Todos 11 testes passam; bit-exact em C-GOLDEN; fallback estruturado em C5/C6; 0 regressão V5 | @dev → @qa Quinn |
| **QG-002** | UI Componente (`residual-distribution-block.component.tsx`) | Cenários U1-U5 | Todos 5 testes passam; banner com `role="alert"` em U5; cards corretos por modo em U1-U4 | @dev + @ux Uma → @qa Quinn |
| **QG-003** | UI Página (`orcamentos`/`pedidos`/`vendas/index.tsx`) | Cenários P1-P5 | Testado manualmente E2E (Quinn + Hyago); P2 + P3 + P4 são pontos críticos; tooltip QR2 implementado | @dev → @qa Quinn (E2E manual obrigatório) |
| **QG-004** | Retrocompatibilidade (snapshots V4/V5) | Cenários R1-R4 | R2 testado com snapshot real de produção (não fixture sintético); ZERO recálculo de snapshot histórico | @dev → @qa Quinn |
| **QG-005** | Governance | ADR-009 transição PROPOSED → ACCEPTED; ADR-004 ganha addendum referenciando ADR-009 (Q4 da STORY-MRM-V6-004) | ADR-009 status linha 3 = `ACCEPTED`; ADR-004 tem nota no topo | @architect Aria + @qa Quinn |

**Sequência:** QG-001 (bloqueia QG-002) → QG-002 (bloqueia QG-003) → QG-003 (bloqueia QG-004) → QG-005 (último gate, governance). Falha em qualquer gate retorna para @dev fixar antes de avançar.

---

## 9. ACs Vagos Rejeitados Preventivamente

Quinn rejeita os seguintes padrões se aparecerem em ACs de stories derivadas deste Epic:

- ❌ "Implementar 3 modos de desconto" → sem fórmula e sem caso canônico = não testável. Reformular como: "Quando `discount_mode='SELLER_REDUCTION'` E `commission_pct > 0` E `profit_base_original ≤ rro_apos_impostos`, motor produz `new_profit = rv × profit_pct` com tolerância R$ 0,02, verificável via test C3."
- ❌ "Habilitar Select com 3 opções" → sem texto das labels e sem default = ambíguo. Reformular como AC1 da STORY-MRM-V6-002 (já está OK no PRD).
- ❌ "Esconder card de Lucro em SELLER" → sem definir comportamento em MEI/SN nem fallback = não testável. Reformular cobrindo U2 + U4 (matriz acima).
- ❌ "Aplicar fallback quando modo é inviável" → sem definir `status`, `messages` e UI = subjetivo. Reformular cobrindo C5/C6 + U5 com status estruturado.

---

## 10. Veredito do Review

### 10.1 PRD `EPIC-MRM-V6-DISCOUNT-MODES.md` v1.0 (Morgan)

**Veredito: APPROVED WITH CONDITIONS**

**Pontos fortes (APPROVED):**
- ✅ Restrição-mãe "não criar abas" respeitada explicitamente (§1.3 + §3.1 IN/OUT bem delimitados).
- ✅ Invariante tributária declarada de forma clara e testável (linha 19 + diagrama ASCII §4).
- ✅ 6 objetivos mensuráveis (O1-O6) com KPIs explícitos (§2).
- ✅ 4 stories bem decompostas com horas estimadas realistas (4h+3h+2h+3h = 12h dentro do alvo 10-14h).
- ✅ Backward compatibility documentada em §1.3 (snapshots V4/V5 com `discount_mode='MRM'` → lidos como PROPORTIONAL).
- ✅ Fallback estruturado (O6) com sinal explícito (`status='DISCOUNT_MODE_FALLBACK'`).
- ✅ Golden test triplo obrigatório (AC6 da STORY-MRM-V6-001) — invariante tributária protegida.
- ✅ Zero migrations Supabase confirmadas (coluna `discount_mode` já existe — referência à memória `project_supabase_migrations_lessons.md`).

**Condições para aprovação plena (NÃO BLOQUEIAM merge das stories, mas DEVEM ser endereçadas antes do deploy em produção):**
1. **CON-1 (MEDIUM):** Tooltip explicativo do `maxDiscountPercent` por modo (QR2) — deve aparecer como AC adicional na STORY-MRM-V6-002 ou como follow-up explícito. UX (Uma) define copy.
2. **CON-2 (MEDIUM):** Banner UI obrigatório para fallback (QR3) — atualmente coberto por AC4 da STORY-MRM-V6-003, mas Quinn pede reforço: o banner deve ter teste automatizado E não apenas test manual, garantindo que aparece SEMPRE que houver fallback.

### 10.2 ADR-009 `adr-009-discount-modes-revival.md` v1.0 PROPOSED (Aria)

**Veredito: APPROVED WITH CONDITIONS** (recomendação: transição PROPOSED → ACCEPTED após condições atendidas)

**Pontos fortes (APPROVED):**
- ✅ Contexto técnico detalhado com mapa do estado atual do código (§1 — tabela com linhas específicas: `src/types/mrm.ts:64`, `src/utils/calculate-discount.ts:52-77`, `src/utils/margin-reapuration.ts:297-303`, etc.).
- ✅ Decisão explícita de reverter R2 sem violar ADR-001/ADR-003/ADR-004/ADR-008 (§2 + §8 tabela de relações).
- ✅ Invariante INEGOCIÁVEL declarada formalmente (§2.2) — fornece o contrato que QG-001 valida.
- ✅ 4 alternativas consideradas com vereditos (§4) — Alternativa B foi parcialmente adotada (variante com forma absoluta em §4.3), Alternativa C corretamente rejeitada por violar ADR-001.
- ✅ Pseudocódigo arquitetural (§5.2) é fiel ao motor V5 vigente e identifica o local exato da mudança (linhas 295-310 de `margin-reapuration.ts`).
- ✅ Decisão formal sobre base "comissão original" = `rv_original = rb` (PRÉ-desconto) registrada em §5.3 com justificativa semântica clara.
- ✅ Fallback safety estruturado em §5.4 com `status`/`messages`/`discount_mode_applied`/`discount_mode_requested`.
- ✅ Engine bump MINOR justificado conforme ADR-002 (§5.6).
- ✅ Backward compatibility tabelada em §6 cobrindo 6 cenários distintos.
- ✅ Test Strategy Reference (§7) referencia este QA-VALIDATION-EPIC-MRM-V6.md.
- ✅ Relation to Other ADRs (§8) — ADR-004 superseded em parte, ADR-008/003/001/002/005 preservados.

**Condições para transição PROPOSED → ACCEPTED:**
1. **ADR-CON-1 (HIGH — gate explícito do próprio ADR §7):** Validação obrigatória do Hyago em cenário canônico sobre a decisão `rv_original = rb` (PRÉ-desconto) para SELLER/PROFIT. Sem essa validação, AR3 (severidade ALTA no §3.4) permanece aberto.
2. **ADR-CON-2 (MEDIUM):** Adicionar referência cruzada explícita ao QA-VALIDATION-EPIC-MRM-V6.md v1.0 (este documento) na seção §7 ou §9 (Change Log) — atualmente §7 menciona "será criada por @qa Quinn em paralelo" mas o doc agora existe.

### 10.3 Recomendação final

✅ Se as duas condições do ADR (ADR-CON-1 + ADR-CON-2) forem atendidas, **recomendo transição imediata de ADR-009 PROPOSED → ACCEPTED**, liberando STORY-MRM-V6-001 para entrar em InProgress.

🟡 Condições do PRD (CON-1 + CON-2) NÃO bloqueiam o início das stories, mas devem estar resolvidas antes da story STORY-MRM-V6-002 (UI Seletor) entrar em Done.

---

## 11. Change Log

| Data | Versão | Status | Autor | Descrição |
|------|--------|--------|-------|-----------|
| 2026-05-22 | 1.0 | APPROVED WITH CONDITIONS | @qa Quinn | Review formal do PRD `EPIC-MRM-V6-DISCOUNT-MODES.md` v1.0 (Morgan) + ADR-009 `adr-009-discount-modes-revival.md` v1.0 PROPOSED (Aria). 25+ testes formalizados em 4 matrizes (Motor C1-C10+GOLDEN; UI Componente U1-U5; UI Página P1-P5; Retrocompat R1-R4). 6 riscos identificados (1 HIGH, 2 MEDIUM, 3 LOW) com mitigações. 5 quality gates (QG-001..QG-005). PRD aprovado com 2 condições (tooltip + banner reforçado); ADR-009 aprovado com 2 condições (validação Hyago `rv_original` + referência cruzada). Recomendação: ADR-009 transita PROPOSED → ACCEPTED após condições atendidas. |

---

## Referências

- [docs/prd/EPIC-MRM-V6-DISCOUNT-MODES.md](../prd/EPIC-MRM-V6-DISCOUNT-MODES.md) — PRD reviewed (Morgan, v1.0)
- [docs/architecture/adr-009-discount-modes-revival.md](../architecture/adr-009-discount-modes-revival.md) — ADR reviewed (Aria, v1.0 PROPOSED)
- [docs/qa/QA-VALIDATION-EPIC-MRM-V5.md](./QA-VALIDATION-EPIC-MRM-V5.md) — Template QA V5 (Quinn, v2.0)
- [docs/architecture/ARCH-EPIC-MRM-V5.md](../architecture/ARCH-EPIC-MRM-V5.md) — Arquitetura V5 vigente (baseline)
- ADR-001 (single source of truth motor), ADR-002 (semver engine_version), ADR-003 (snapshot fiscal invariante), ADR-004 (motor puro vs policies — R2 superseded em parte), ADR-006 (cascata jsonb), ADR-008 (PIS/COFINS apuração — invariante mesmo com novo discount_mode)
- `src/utils/margin-reapuration.ts` — motor puro (V5 vigente, bloco-alvo linhas 295-310)
- `src/utils/calculate-discount.ts:52-77` — switch dos 3 modos no preview (referência semântica)
- `src/page-parts/shared/residual-distribution-block.component.tsx:95-105` — cards condicionais (alvo de U1-U5)
- `src/config/feature-flags.ts:53` (flag `mrm.legacy_modes_visible`), `:83-107` (`coerceLegacyDiscountMode` — fica `@deprecated`)
- `src/utils/__tests__/margin-reapuration.test.ts` — padrão dos golden tests (referência de estilo: factory `makeInput` + describe por etapa)
- Excel oficial `Motor de descontos do resultado residual operacional.xlsx` — valores canônicos (Âncora 159.342,38, RRO 17.471,16, peso_op_interna 0,931585)
- `.aios-core/constitution.md` — Artigos IV (No Invention — os 3 modos já existem no type system e no preview) e V (Quality First — golden test triplo)
