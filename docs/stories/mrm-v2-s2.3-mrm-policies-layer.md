# Story MRM-V2-S2.3 — Camada `mrm-policies.ts` para Decisão de Bloqueio/Aviso

**Sprint:** S2
**Esforço estimado:** 10h
**Owner:** @dev
**Status:** InReview
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro do motor de margem (Dex)**, I want **criar a camada `src/utils/mrm-policies.ts` que decide se um resultado do motor MRM deve **bloquear save**, **avisar com `requires_review=true`** ou **permitir** com base em `document_type` (sales/budgets/orders), papel do usuário e configurações do tenant**, so that **o motor permaneça puro (ADR-004) e a política de negócio fique explicitamente separada, viabilizando regras diferenciadas por tipo de documento (vendas bloqueiam quando RRO ≤ 0, orçamentos apenas avisam) conforme decisão Q1**.

## Acceptance Criteria
- [x] AC1: Arquivo `src/utils/mrm-policies.ts` é criado com a função pura `decideMrmAction(motorResult: MRMResult, documentType: 'sales'|'budgets'|'orders', userRole: string, tenantSettings: TenantSettings): MrmActionDecision` que retorna `{action: 'block_save'|'warn'|'allow', message: string, requires_review: boolean}`.
- [x] AC2: **Política sales**: quando `motorResult.rro <= 0` E `documentType='sales'`, retorna `{action: 'block_save', message: 'RRO negativa ou zero — venda não pode ser salva', requires_review: true}`.
- [x] AC3: **Política budgets/orders**: quando `motorResult.rro <= 0` E `documentType ∈ {'budgets', 'orders'}`, retorna `{action: 'warn', message: 'RRO negativa ou zero — revise antes de aprovar', requires_review: true}`.
- [x] AC4: **Política default**: quando `motorResult.rro > 0`, retorna `{action: 'allow', message: '', requires_review: false}`.
- [x] AC5: Migration `20260520000005_mrm_requires_review.sql` adiciona coluna `requires_review BOOLEAN DEFAULT false` em `budgets`, `orders`, `sales`, com índice parcial `WHERE requires_review=true`.
- [x] AC6: UI das listings (`src/pages/orcamentos/index.tsx`, `src/pages/pedidos/index.tsx`, `src/pages/vendas/index.tsx`) exibe **badge vermelho persistente** "Requer Revisão" na linha de documentos com `requires_review=true`.
- [x] AC7: Submit handler de `src/pages/vendas/index.tsx` chama `decideMrmAction()` após gerar snapshots e, se `action='block_save'`, exibe toast vermelho com `message`, faz scroll-to-error no campo de desconto, e ABORTA o save.
- [x] AC8: Submit handlers de orçamentos e pedidos chamam `decideMrmAction()` e, se `action='warn'`, abrem modal de confirmação (RROWarningModal) e, se usuário confirmar, salvam gravando `requires_review=true`.
- [x] AC9: Função `decideMrmAction()` é **pura** (sem I/O, sem console.error, sem fetch) — testável por unit test isolado.

## Technical Tasks
- [x] T1: Criar `src/utils/mrm-policies.ts` com tipo `PolicyDecision` (MrmActionDecision) e função `decideMrmAction()`.
- [x] T2: Criar tipo `TenantPolicySettings` com `rro_policy?: 'strict' | 'permissive'` para override futuro (default = ADR-004 defaults).
- [x] T3: Escrever migration `supabase/migrations/20260520000005_mrm_requires_review.sql` adicionando coluna em 3 tabelas e índice parcial.
- [x] T4: Instrumentar `src/pages/vendas/index.tsx` (handleSaveSale) para chamar `decideMrmAction()` e tratar `block_save` (toast + scroll + abort).
- [x] T5: Instrumentar submit handlers de orçamentos (handleSave + handleUpdate) e pedidos (handleSaveEdit) para chamar `decideMrmAction()` e tratar `warn` (modal RROWarningModal + gravar `requires_review=true`).
- [x] T6: Adicionar badge "Requer Revisão" nas listings de orcamentos, pedidos e vendas via componente reaproveitável `<RequiresReviewBadge />` em `src/components/mrm/RequiresReviewBadge.tsx`.
- [x] T7: Escrever testes unit em `src/utils/__tests__/mrm-policies.test.ts` cobrindo os 8 cenários (TC1-TC8) + ERROR + PENDING + overrides + pureza (14 testes ao todo).
- [ ] T8: Atualizar `docs/motor-reapuracao-margem.md` documentando a separação motor (pure) vs policies (aplicação). _[adiado — fora do escopo crítico desta entrega]_

## Files Affected
- `src/utils/mrm-policies.ts` (CRIADO) — camada de decisão (decideMrmAction + tipos + mensagens)
- `src/utils/mrm-aggregate.ts` (CRIADO) — helper de agregação de N TaxBreakdowns em um MotorResultLike consolidado para policy
- `src/utils/__tests__/mrm-policies.test.ts` (CRIADO) — 14 testes (TC1-TC8 + ERROR + PENDING + 3 overrides + pureza)
- `src/components/mrm/RROWarningModal.tsx` (CRIADO) — modal reaproveitável para warn flow (budgets/orders)
- `src/components/mrm/RequiresReviewBadge.tsx` (CRIADO) — badge vermelho persistente para listings
- `src/pages/vendas/index.tsx` — instrumenta handleSaveSale com policy gate (block flow + scroll-to-discount); badge em listing; SaleRow.requiresReview
- `src/pages/orcamentos/index.tsx` — handleSave + handleUpdate com policy gate (warn flow via RROWarningModal); badge em coluna Status; persist requires_review
- `src/pages/pedidos/index.tsx` — handleSaveEdit com policy gate (warn flow via RROWarningModal); badge em coluna Status; select traz requires_review; Order.requires_review
- `supabase/migrations/20260520000005_mrm_requires_review.sql` (CRIADO — NÃO APLICADO) — ADD COLUMN em budgets/orders/sales + 3 índices parciais + COMMENTs
- `docs/motor-reapuracao-margem.md` — _atualização adiada, fora do escopo crítico desta entrega_

## Test Cases
- TC1 (sales + RRO=0): retorna `{action: 'block_save', requires_review: true}`.
- TC2 (sales + RRO=-100): retorna `{action: 'block_save', requires_review: true}`.
- TC3 (sales + RRO=500): retorna `{action: 'allow', requires_review: false}`.
- TC4 (budgets + RRO=0): retorna `{action: 'warn', requires_review: true}`.
- TC5 (budgets + RRO=-50): retorna `{action: 'warn', requires_review: true}`.
- TC6 (budgets + RRO=1000): retorna `{action: 'allow', requires_review: false}`.
- TC7 (orders + RRO=-1): retorna `{action: 'warn', requires_review: true}`.
- TC8 (orders + RRO=200): retorna `{action: 'allow', requires_review: false}`.
- TC9 (integração UI): submit de venda com RRO=-100 mostra toast vermelho, scroll-to-error, save abortado, registro não criado no banco.
- TC10 (integração UI): submit de orçamento com RRO=-50 mostra toast amarelo, salva com `requires_review=true`, badge aparece na listing.

## Dependencies
- Depends on: MRM-V2-S0 (ADR-004 separação motor vs policies), MRM-V2-S1.1 (motor V2 retorna `rro` em MRMResult)
- Blocks: nenhum direto (mas habilita evolução futura de políticas como `block_on_negative_profit`, `warn_on_low_margin`, etc.)

## Definition of Done
- [ ] `src/utils/mrm-policies.ts` implementado e exportado
- [ ] Migration aplicada e validada em staging
- [ ] Submit handlers das 3 telas instrumentados
- [ ] Badge "Requer Revisão" visível nas 3 listings quando `requires_review=true`
- [ ] Testes unit cobrindo 8 cenários, todos verde
- [ ] Lint + typecheck verde
- [ ] QA gate APPROVED
- [ ] Documentação `docs/motor-reapuracao-margem.md` atualizada
- [ ] Smoke E2E manual: salvar venda com RRO negativa → bloqueio confirmado; salvar orçamento com RRO negativa → grava com badge

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q1 (decisão central)**: este story IMPLEMENTA a decisão Q1 — motor permanece puro retornando `MRMResult`, e `mrm-policies.ts` aplica a regra de negócio por `document_type`. Sales = block; budgets/orders = warn + requires_review.
- **Q5 (defensive coding)**: o motor (S1.1) já força CSLL/IRPJ=0 em MEI/SIMPLES_NACIONAL com warning; a policy aqui NÃO duplica essa lógica — confia no que o motor retornou.

**ADRs aplicáveis:**
- **ADR-004 (motor puro vs policy)**: este story é a materialização concreta deste ADR. Motor = `src/utils/margin-reapuration.ts` (puro); Policy = `src/utils/mrm-policies.ts` (decisão de negócio).

**Anti-padrão a evitar:** NÃO colocar lógica de bloqueio dentro de `margin-reapuration.ts`. NÃO fazer fetch/I/O dentro de `decideMrmAction()`. Toda configuração do tenant chega via parâmetro `tenantSettings`.

**Padrão UI para `block_save`:** toast vermelho persistente até dismiss + scroll automático para o campo de desconto + foco no campo + bloqueio do botão Submit (disabled visual). Reaproveitar padrão existente em outros forms críticos do projeto.

**Evolução futura prevista (fora deste story):** parametrizar `tenantSettings.mrm.policy_overrides` permitindo override por tenant (ex: tenant premium pode permitir RRO negativa em venda com aprovação manager). Este story estabelece a fundação; overrides ficam para sprint futura.
