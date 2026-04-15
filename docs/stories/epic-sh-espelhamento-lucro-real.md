# Epic: Simples Híbrido — Espelhamento Total do Lucro Real

**ID:** SH-ESPELHAMENTO-LR
**Status:** Done
**Data:** 2026-04-15
**Regime:** Simples Híbrido (SIMPLES_HIBRIDO)
**PM:** Morgan (@pm)
**Orquestrador:** Orion (@aios-master)

---

## Objetivo

Construir o regime **Simples Híbrido** como espelho completo e funcional do **Lucro Real**: mesma lógica tributária, mesmas configurações, mesma UX de precificação, mesmos blocos de despesas, mesma DRE e mesmo motor de cálculo.

O Simples Híbrido é um **regime personalizado** do Precifica Certo (não existe na legislação brasileira como tal). O conceito é: empresa optante do Simples Nacional que, por questões de planejamento tributário, precifica seus produtos/serviços como se fosse Lucro Real — usando PIS/COFINS não-cumulativo (9,25%), ICMS por dentro, IRPJ (15% sobre lucro), CSLL (9% sobre lucro) e adicional IRPJ.

O **Lucro Real não deve ser alterado** — apenas o Simples Híbrido deve ser construído/expandido para ter paridade total com o LR.

---

## Contexto Técnico

### O que o Lucro Real tem (referência a espelhar)

| Camada | Funcionalidade | Status LR |
|--------|---------------|-----------|
| **DB** | Enum `LUCRO_REAL` no `tax_regime` | ✅ Completo |
| **DB** | Colunas `icms_contribuinte`, `iss_municipality_rate` em `tenant_settings` | ✅ Completo |
| **DB** | Colunas `lp_estimated_annual_revenue`, `ibs_reference_pct`, `cbs_reference_pct` | ✅ Completo |
| **DB** | `additional_irpj_percent` em `products` e `services` | ✅ Completo |
| **DB** | `valor_precificado_icms_piscofins` em `products` e `services` | ✅ Completo |
| **Onboarding** | Seleção do regime | ✅ Completo |
| **Onboarding** | Campos ICMS contribuinte, ISS municipal, receita anual estimada | ✅ Completo |
| **Configurações** | Tab tributária completa (ICMS, ISS, IBS/CBS, adicional IRPJ) | ✅ Completo |
| **Produtos** | IRPJ + CSLL sobre lucro visíveis e calculados | ✅ Completo |
| **Produtos** | Adicional IRPJ editável | ✅ Completo |
| **Produtos** | ICMS (%) editável | ✅ Completo |
| **Produtos** | PIS/COFINS (% NCM) editável | ✅ Completo |
| **Produtos** | Seção Atividades Terceirizadas (Frete, Seguros, Despesas Acessórias) | ✅ Completo |
| **Produtos** | Seção IBS/CBS — Impostos por Fora | ✅ Completo |
| **Produtos** | Seção IS/IPI — Impostos por Fora | ✅ Completo |
| **Serviços** | IRPJ + CSLL + adicional IRPJ + PIS/COFINS + IBS/CBS/IS/IPI | ✅ Completo |
| **Serviços** | Fator de redução IVA DUAL | ✅ Completo |
| **Engine** | `calc-tax-preview.ts` com lógica LR completa | ✅ Completo |
| **Engine** | Edge function `calc-tax-engine` com lógica LR completa | ✅ Completo |
| **Auth Context** | `computeTaxableRegimeValue()` para LR | ✅ Completo |
| **DRE** | `buildDreLucroRealPresumido()` — DRE gerencial completa | ✅ Completo |
| **Expense Blocks** | `BLOCK_IMPOSTOS_SOBRE_LUCRO_LR`, `BLOCK_IMPOSTOS_FATURAMENTO_DENTRO_LR`, etc. | ✅ Completo |
| **Cashier** | Categorias de imposto para LR | ✅ Completo |

### O que o Simples Híbrido tem hoje (baseline)

| Camada | Funcionalidade | Status SH |
|--------|---------------|-----------|
| **DB** | Enum `SIMPLES_HIBRIDO` no `tax_regime` | ✅ Feito |
| **DB** | `database.types.ts` atualizado | ✅ Feito |
| **Engine** | `calc-tax-engine`: usa lógica do Simples Nacional (**ERRADO**) | ❌ Precisa LR |
| **Engine** | `calc-tax-preview.ts`: usa lógica do Simples Nacional (**ERRADO**) | ❌ Precisa LR |
| **DFC** | Routes para `buildDreSimplesNacional` (**ERRADO**) | ❌ Precisa LR |
| **DFC** | Label "Simples Híbrido" definido | ✅ Feito |
| **Export Excel** | Label "Simples Hibrido" definido | ✅ Feito |
| **Onboarding** | Seleção do regime SH | ❌ Faltando |
| **Onboarding** | Campos tributários específicos (ICMS, ISS, receita anual) | ❌ Faltando |
| **Configurações** | Tab tributária para SH | ❌ Faltando |
| **Produtos** | Flag `isSimplesHibrido` + campos LR (IRPJ, CSLL, ICMS...) | ❌ Faltando |
| **Serviços** | Flag `isShDisplay` + campos LR | ❌ Faltando |
| **Auth Context** | Bloco `computeTaxableRegimeValue()` para SH | ❌ Faltando |
| **DRE** | Roteamento para `buildDreLucroRealPresumido` | ❌ Faltando |
| **Expense Blocks** | Blocos de despesas espelho do LR | ❌ Faltando |
| **Cashier Categories** | Categorias de imposto para SH | ❌ Faltando |
| **DB** | Colunas específicas SH em `tenant_settings` (ICMS, ISS, IBS/CBS, receita) | ❌ Faltando |
| **DB** | `additional_irpj_percent` e `valor_precificado_icms_piscofins` em `products`/`services` | ✅ Já existe (LR usa as mesmas colunas) |

---

## Regras Críticas (não violar)

- **Não alterar nenhuma lógica existente do Lucro Real** — condições `isLucroReal`/`LUCRO_REAL` não devem ser alteradas; apenas estender com `|| isSimplesHibrido` onde explicitamente indicado nas stories
- **Não alterar Simples Nacional** — SH é regime separado (`SIMPLES_HIBRIDO ≠ SIMPLES_NACIONAL`)
- **Reutilizar colunas LR existentes** — `additional_irpj_percent`, `icms_contribuinte`, `iss_municipality_rate`, `lp_estimated_annual_revenue`, `ibs_reference_pct`, `cbs_reference_pct`, `valor_precificado_icms_piscofins` são compartilhadas, NÃO criar duplicatas
- **PIS/COFINS não-cumulativo (9,25%)** — igual ao LR. Créditos de PIS/COFINS PERMITIDOS (diferente do LP RET)
- **ICMS segue a mesma regra do LR** — contribuinte configurável, por dentro no preço
- **IRPJ = 15% sobre lucro, CSLL = 9% sobre lucro, adicional IRPJ quando lucro > R$ 20k/mês** — idêntico ao LR
- **Migrations idempotentes** — usar `ADD COLUMN IF NOT EXISTS`, sem recriar colunas existentes
- **SH usa a função `buildDreLucroRealPresumido`** — NÃO criar nova função DRE; reutilizar a do LR

---

## Stories do Epic

### SH-001 — Database: Schema e Migração para Simples Híbrido

**Objetivo:** Criar migration documentando o compartilhamento de colunas LR com SH, verificar baseline e identificar tenants existentes com SIMPLES_HIBRIDO que precisam de correção.

**Acceptance Criteria:**
- [ ] Migration `20260415000010_sh_espelhamento_lr.sql` criada e idempotente
- [ ] Migration adiciona `COMMENT ON COLUMN` nas colunas compartilhadas documentando que SH as utiliza:
  - `tenant_settings.icms_contribuinte` — "Usado por LUCRO_REAL e SIMPLES_HIBRIDO"
  - `tenant_settings.iss_municipality_rate` — "Usado por LUCRO_REAL, LUCRO_PRESUMIDO_RET e SIMPLES_HIBRIDO"
  - `tenant_settings.lp_estimated_annual_revenue` — "Receita anual estimada, usado por LP, LR e SIMPLES_HIBRIDO"
  - `tenant_settings.ibs_reference_pct` e `cbs_reference_pct` — "Usado por LR e SIMPLES_HIBRIDO"
- [ ] Confirmar que `additional_irpj_percent` em `products` e `services` JÁ EXISTE (não recriar)
- [ ] Confirmar que `valor_precificado_icms_piscofins` em `products` e `services` JÁ EXISTE (não recriar)
- [ ] `database.types.ts` já inclui `SIMPLES_HIBRIDO` no enum (verificar, não duplicar)
- [ ] `src/supabase/types.ts`: `TaxRegime` já inclui `'SIMPLES_HIBRIDO'` (verificar)
- [ ] **Verificar tenants existentes:** executar `SELECT id, name FROM tenants t JOIN tenant_settings ts ON t.id = ts.tenant_id WHERE ts.tax_regime = 'SIMPLES_HIBRIDO'` — registrar count no PR description
- [ ] Migration aplicada sem erros no ambiente local

**Arquivos a modificar:**
- `supabase/migrations/20260415000010_sh_espelhamento_lr.sql` (CRIAR)

**Dependências:** Nenhuma

---

### SH-002 — Motor de Cálculo: calc-tax-preview.ts para Simples Híbrido

**Objetivo:** Substituir a lógica incorreta (Simples Nacional) do SH em `calc-tax-preview.ts` pela lógica correta (espelho do Lucro Real).

**Acceptance Criteria:**
- [ ] Bloco `if (regime === 'SIMPLES_HIBRIDO')` em `calc-tax-preview.ts` substituído por lógica idêntica ao bloco LUCRO_REAL
- [ ] ICMS: `ts.icms_contribuinte ? icmsRateDecimal : 0` (produtos); 0 para serviços
- [ ] PIS/COFINS não-cumulativo: 9,25% (nominal), ajustado pela base ICMS por dentro quando aplicável
- [ ] ISS: `ts.iss_municipality_rate || 0.05` para serviços
- [ ] IRPJ: `profitPct * 0.15`
- [ ] CSLL: `profitPct * 0.09`
- [ ] `effectiveTaxPct = ICMS + PIS/COFINS + ISS + IRPJ + CSLL`
- [ ] Return com campos: `effectiveTaxPct`, `taxLabel: 'Simples Híbrido'`, `isMei: false`, `taxesPercent`, `taxableRegimePercent`, `regimeLabel: 'Simples Híbrido'`
- [ ] Teste manual: regime SH com ICMS 12% contribuinte → `effectiveTaxPct` correto calculado

**Arquivos a modificar:**
- `src/utils/calc-tax-preview.ts` — substituir bloco SIMPLES_HIBRIDO

**Dependências:** SH-001

---

### SH-003 — Motor de Cálculo: Edge Function calc-tax-engine para Simples Híbrido

**Objetivo:** Substituir a lógica incorreta do SH na edge function `calc-tax-engine/index.ts` pela lógica espelho do Lucro Real.

**Acceptance Criteria:**
- [ ] Bloco `if (regime === "SIMPLES_HIBRIDO")` na edge function substituído por lógica idêntica ao bloco LUCRO_REAL
- [ ] ICMS: mesma regra LR (`icms_contribuinte`, `icmsRateDecimal`)
- [ ] PIS/COFINS não-cumulativo: 9,25% com ajuste de base ICMS
- [ ] ISS para serviços: `ts.iss_municipality_rate || 0.05`
- [ ] IRPJ + CSLL sobre lucro projetado (igual ao LR)
- [ ] Adicional IRPJ em 2º passe (lucro > R$ 20k/mês → 10% sobre excedente) para SH
- [ ] Créditos de PIS/COFINS HABILITADOS para SH (diferente do LP RET que bloqueia)
- [ ] `pctIcms`, `pctPisCofins`, `pctIss`, `pctIrpj`, `pctCsll` retornados corretamente
- [ ] Teste com Supabase CLI ou curl no ambiente local

**Arquivos a modificar:**
- `supabase/functions/calc-tax-engine/index.ts` — substituir bloco SIMPLES_HIBRIDO

**Dependências:** SH-001

---

### SH-004 — Auth Context: computeTaxableRegimeValue para Simples Híbrido

**Objetivo:** Adicionar bloco dedicado para SH em `computeTaxableRegimeValue()` para que a navbar e o dashboard exibam a alíquota correta.

**Acceptance Criteria:**
- [ ] Bloco `if (regime === 'SIMPLES_HIBRIDO')` adicionado em `auth.context.tsx` ANTES do bloco LR/LP combinado
- [ ] Lógica idêntica ao bloco LUCRO_REAL: ICMS (se contribuinte) + PIS/COFINS 9,25% + ISS (se serviço) + IRPJ 15% sobre margem + CSLL 9% sobre margem
- [ ] Return: `round4((total) * 100)` — resultado em % para exibição
- [ ] Navbar exibe alíquota correta para tenant SH após login
- [ ] Não alterar o bloco existente de LUCRO_REAL

**Arquivos a modificar:**
- `src/contexts/auth.context.tsx` — adicionar bloco SH antes do bloco LP/LR

**Dependências:** SH-001

---

### SH-005 — Onboarding: Seleção e Configuração do Regime Simples Híbrido

**Objetivo:** Adicionar Simples Híbrido como opção selecionável no onboarding com os mesmos campos de configuração do Lucro Real.

**Acceptance Criteria:**
- [ ] Opção "Simples Híbrido" adicionada no `<Select>` de regime tributário em `onboarding.tsx`
- [ ] Label: `"Simples Híbrido"`, value: `"SIMPLES_HIBRIDO"`
- [ ] Quando SH selecionado, exibir bloco de configuração idêntico ao LR:
  - [ ] Toggle `icms_contribuinte` (Sim/Não) — "Empresa contribuinte de ICMS?"
  - [ ] InputNumber `iss_municipality_rate` (% ISS municipal, 0-10%, apenas se serviço)
  - [ ] InputNumber `lp_estimated_annual_revenue` (Receita bruta anual estimada em R$)
  - [ ] Info card explicativo: "Simples Híbrido usa PIS/COFINS não-cumulativo (9,25%), IRPJ 15% e CSLL 9% sobre lucro — ideal para planejamento tributário comparativo"
  - [ ] **Disclaimer obrigatório** exibido em Alert `warning` antes de confirmar a seleção: "⚠️ O Simples Híbrido é um regime de precificação comparativa do Precifica Certo e não substitui seu regime tributário legal. Consulte seu contador antes de usar estas alíquotas para fins fiscais."
- [ ] `handleFinish` envia para API: `tax_regime: 'SIMPLES_HIBRIDO'`, `icms_contribuinte`, `iss_municipality_rate` (/100), `lp_estimated_annual_revenue`
- [ ] API `/api/onboarding/complete` persiste todos os campos SH
- [ ] Onboarding completa sem erros para tenant SH

**Arquivos a modificar:**
- `src/pages/onboarding.tsx` — adicionar opção SH e bloco de config
- `src/pages/api/onboarding/complete.ts` — garantir campos SH no `settingsUpdate`

**Dependências:** SH-001

---

### SH-006 — Configurações: Tab Tributária para Simples Híbrido

**Objetivo:** Criar seção de configuração tributária completa para SH na página de configurações, espelhando a seção do Lucro Real.

**Acceptance Criteria:**
- [ ] Condição `regime === 'SIMPLES_HIBRIDO'` exibe seção dedicada em `configuracoes/index.tsx`
- [ ] Campos visíveis (idênticos ao LR):
  - [ ] Toggle `icms_contribuinte`
  - [ ] InputNumber `iss_municipality_rate` (%)
  - [ ] InputNumber `lp_estimated_annual_revenue` (R$)
  - [ ] InputNumber `ibs_reference_pct` (% alíquota referência IBS)
  - [ ] InputNumber `cbs_reference_pct` (% alíquota referência CBS)
- [ ] Cards informativos:
  - [ ] Card "Carga Tributária SH": ICMS (var) + PIS/COFINS 9,25% + ISS (var) + IRPJ 15% + CSLL 9%
  - [ ] Card "Diferença do Simples Nacional": explicação do posicionamento do regime
- [ ] `handleSaveTax` para SH persiste todos os 5 campos
- [ ] Valores carregados corretamente do banco ao abrir a página
- [ ] Conversão correta decimal ↔ % (ISS, IBS, CBS: ×100 para exibir, /100 para salvar)

**Arquivos a modificar:**
- `src/pages/configuracoes/index.tsx` — adicionar bloco SH na tab tributária

**Dependências:** SH-001, SH-005

---

### SH-007 — Precificação de Produtos: Campos Lucro Real para Simples Híbrido

**Objetivo:** Fazer o componente de precificação de produtos exibir os mesmos campos do Lucro Real quando o regime for Simples Híbrido.

**Acceptance Criteria:**
- [ ] Flag `isSimplesHibrido = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'` adicionada em `product-price.component.tsx`
- [ ] `showIrpjCsll` estendido: `isLucroReal || isLucroPresumed || isSimplesHibrido`
- [ ] Todas as condições `(isLucroReal || isLucroPresumed)` estendidas com `|| isSimplesHibrido` para:
  - [ ] Adicional IRPJ (editável)
  - [ ] ICMS % (editável)
  - [ ] PIS/COFINS % (NCM, editável)
  - [ ] Seção Atividades Terceirizadas (Frete, Seguros, Despesas Acessórias)
  - [ ] Seção IBS/CBS — Impostos por Fora
  - [ ] Seção IS/IPI — Impostos por Fora
  - [ ] Info "Valor precificado com ICMS, PIS/COFINS"
- [ ] Cálculos de IRPJ, CSLL, adicional, ICMS, PIS/COFINS funcionam corretamente para SH
- [ ] `mcPct` (margem de contribuição) usa a fórmula LR quando SH
- [ ] A composição do preço (barra de cores) exibe corretamente para SH
- [ ] Props existentes (`additionalIrpjPercent`, `icmsPct`, `pisCofinsLRPct`, etc.) reutilizadas — sem novas props

**Arquivos a modificar:**
- `src/page-parts/products/product-price.component.tsx` — estender flags com SH

**Dependências:** SH-002, SH-003, SH-004

---

### SH-008 — Precificação de Serviços: Campos Lucro Real para Simples Híbrido

**Objetivo:** Fazer o componente de precificação de serviços exibir os mesmos campos e calcular corretamente para Simples Híbrido.

**Acceptance Criteria:**
- [ ] Flag `isShDisplay = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'` adicionada em `services/content.component.tsx`
- [ ] `isLRorLPDisplay` estendido: `isLucroRealDisplay || isLucroPresumidoDisplay || isShDisplay`
- [ ] Ou criar `isLRorLPorSHDisplay` onde necessário para evitar mudar o nome da variável
- [ ] SH exibe as mesmas rows que LR na tabela de precificação:
  - [ ] IRPJ (15% sobre lucro)
  - [ ] CSLL (9% sobre lucro)
  - [ ] Adicional IRPJ (editável)
  - [ ] PIS/COFINS % (editável)
- [ ] Seção Fator de Redução IVA DUAL visível para SH
- [ ] Seção IBS/CBS visível para SH
- [ ] Estado `isLucroRealSvcComp` (ou equivalente) inclui SH para busca de `ibs_reference_pct`, `cbs_reference_pct`
- [ ] `isLRorLPSvcComp` em `services/content.component.tsx` (linha 88) inclui `|| isLpRetSvcComp || isShSvcComp` corretamente
- [ ] Cálculo de IRPJ+CSLL sobre lucro funciona corretamente para SH
- [ ] Salvamento de `additional_irpj_percent`, `taxable_regime_percent`, `ibs_pct`, `cbs_pct` funciona para SH

**Arquivos a modificar:**
- `src/page-parts/services/content.component.tsx` — estender flags com SH

**Dependências:** SH-002, SH-003, SH-004

---

### SH-009 — DFC/DRE: Roteamento para buildDreLucroRealPresumido

**Objetivo:** Corrigir o roteamento da DRE para que Simples Híbrido use `buildDreLucroRealPresumido` em vez de `buildDreSimplesNacional`.

**Acceptance Criteria:**
- [ ] Em `dfc/index.tsx`, linha com `taxRegime === 'SIMPLES_HIBRIDO'` removida do bloco que chama `buildDreSimplesNacional`
- [ ] SH cai no bloco padrão que chama `buildDreLucroRealPresumido(agg, calcType, taxRegime)`
- [ ] DRE exibe estrutura de Lucro Real para tenant SH:
  - [ ] Receita Bruta → Deduções Tributárias → Receita Líquida
  - [ ] CMV → Lucro Bruto → Despesas Operacionais → EBIT
  - [ ] Despesas Financeiras → Lucro Líquido
- [ ] Label "Simples Híbrido" mantido nas funções de exibição (não alterar)
- [ ] `export-dfc-excel.ts` mantém label "Simples Hibrido" (não alterar)
- [ ] DFC exibe e exporta corretamente para regime SH

**Arquivos a modificar:**
- `src/pages/dfc/index.tsx` — remover SIMPLES_HIBRIDO do bloco buildDreSimplesNacional

**Dependências:** SH-001

---

### SH-010 — Despesas: Blocos de Setup para Simples Híbrido

**Objetivo:** Criar blocos de setup de despesas específicos para SH, espelhando os blocos do Lucro Real.

**Acceptance Criteria:**
- [ ] `BLOCK_IMPOSTOS_SOBRE_LUCRO_SH` criado em `expense-setup-blocks.ts`:
  - [ ] IRPJ (Imposto de Renda)
  - [ ] CSLL (Contribuição Social sobre o Lucro Líquido)
  - [ ] Alíquota adicional IRPJ
- [ ] `BLOCK_IMPOSTOS_FATURAMENTO_DENTRO_SH` criado:
  - [ ] ICMS Próprio
  - [ ] PIS (por dentro)
  - [ ] COFINS (por dentro)
- [ ] `BLOCK_IMPOSTOS_COMPRAS_SH` criado:
  - [ ] IPI custo
  - [ ] ICMS DIFAL
  - [ ] ICMS-ST (Substituição Tributária)
  - [ ] IS (Imposto Seletivo)
  - [ ] FCP (Fundo de Combate à Pobreza)
- [ ] `BLOCK_IMPOSTOS_RECUPERAVEIS_SH` criado:
  - [ ] ICMS (recuperável)
  - [ ] PIS/COFINS (recuperável)
  - [ ] IPI (recuperável)
  - [ ] CBS, IBS (recuperáveis)
- [ ] Blocos SH exportados e disponíveis para uso
- [ ] Categorias de cashier utilizadas nos blocos SH existem em `cashier-category.ts` (reutilizar as do LR se possível)

**Arquivos a modificar:**
- `src/constants/expense-setup-blocks.ts` — adicionar blocos SH
- `src/constants/cashier-category.ts` — adicionar categorias SH se não existirem equivalentes LR reutilizáveis

**Dependências:** SH-001

---

### SH-011 — Formulário de Itens: Campos Tributários para Simples Híbrido

**Objetivo:** Garantir que o formulário de itens (insumos/matérias-primas) exiba os campos de crédito corretos para SH.

**Acceptance Criteria:**
- [ ] SH permite seleção de créditos de ICMS (idêntico ao LR)
- [ ] SH permite seleção de créditos de PIS/COFINS (idêntico ao LR — DIFERENTE do LP RET)
- [ ] SH permite seleção de créditos de IPI (idêntico ao LR)
- [ ] Formulário de itens reconhece regime SH e exibe campos corretos
- [ ] Nenhuma mensagem de bloqueio exibida para PIS/COFINS no SH (apenas no LP RET)
- [ ] Campos de alíquota NCM funcionam para SH (mesmos que LR)

**Arquivos a modificar:**
- Executar `grep -r "item_tax_credits\|LUCRO_REAL.*crédito\|tax_type.*ICMS" src/ --include="*.tsx" -l` para identificar o formulário de itens antes de iniciar
- Arquivo provável: `src/page-parts/items/` ou `src/pages/items/` — atualizar esta lista ao iniciar a story

**Dependências:** SH-001, SH-003

---

### SH-012 — Dashboard e Navbar: Exibição do Regime Simples Híbrido

**Objetivo:** Garantir que o dashboard e a navbar exibam informações corretas e específicas para o regime Simples Híbrido.

**Acceptance Criteria:**
- [ ] Navbar exibe label "Simples Híbrido" corretamente (não "SIMPLES_HIBRIDO" raw)
- [ ] Alíquota efetiva calculada e exibida na navbar para SH (via `computeTaxableRegimeValue`)
- [ ] Badge/pill de regime no dashboard exibe "Simples Híbrido"
- [ ] Nenhum widget de SN exibido erroneamente para tenant SH
- [ ] Tooltip/info card na navbar mostra composição: "ICMS + PIS/COFINS 9,25% + IRPJ 15% + CSLL 9%"
- [ ] Verificar se há componente de label de regime e garantir que SH está mapeado

**Arquivos a modificar:**
- `src/contexts/auth.context.tsx` (já coberto no SH-004)
- Componentes de navbar/dashboard que exibem label do regime (identificar via Grep)

**Dependências:** SH-004

---

### SH-013 — Validação e QA: Paridade Completa SH ↔ LR

**Objetivo:** Validar que o Simples Híbrido tem paridade funcional completa com o Lucro Real em todos os fluxos.

**Acceptance Criteria:**
- [ ] Onboarding completa end-to-end para tenant SH sem erros
- [ ] Configurações carregam e salvam corretamente para SH
- [ ] Precificação de produto gera preço correto (IRPJ+CSLL+ICMS+PIS/COFINS) para SH
- [ ] Precificação de serviço gera preço correto para SH
- [ ] DRE exibe estrutura Lucro Real (não Simples) para tenant SH
- [ ] `npm run lint` sem erros nos arquivos modificados
- [ ] `npm run typecheck` sem erros novos introduzidos
- [ ] Teste comparativo: mesmo tenant configurado como LR vs SH com mesmos parâmetros → alíquotas efetivas idênticas
- [ ] `calc-tax-preview.ts` retorna `regimeLabel: 'Simples Híbrido'` (não 'Lucro Real')
- [ ] Nenhum regime existente (SN, LR, LP, MEI, LP RET) afetado

**Arquivos a verificar:**
- Todos os arquivos modificados nas stories SH-001 a SH-012

**Dependências:** SH-001 a SH-012

---

## Resumo do Escopo

| Story | Camada | Prioridade |
|-------|--------|-----------|
| SH-001 | Database / Schema | P0 — bloqueante |
| SH-002 | Engine (preview) | P0 — bloqueante |
| SH-003 | Engine (edge function) | P0 — bloqueante |
| SH-004 | Auth Context | P0 — bloqueante |
| SH-005 | Onboarding | P1 — alta |
| SH-006 | Configurações | P1 — alta |
| SH-007 | Produtos | P1 — alta |
| SH-008 | Serviços | P1 — alta |
| SH-009 | DFC/DRE | P1 — alta |
| SH-010 | Despesas | P2 — média |
| SH-011 | Formulário Itens | P2 — média |
| SH-012 | Dashboard/Navbar | P2 — média |
| SH-013 | QA / Validação | P3 — validação final |

---

## Ordem de Execução Recomendada

```
SH-001
  ↓ (todos em paralelo após SH-001)
SH-002 + SH-003 + SH-004 + SH-005 + SH-009
  ↓
SH-006 (depende SH-005)
  ↓ (paralelo)
SH-007 + SH-008
  ↓ (paralelo)
SH-010 + SH-011 + SH-012
  ↓
SH-013 (QA final)
```

> **Nota:** SH-005 (Onboarding) não depende do motor (SH-002/003/004) — pode rodar em paralelo. SH-009 (DFC) é trivial (1 linha), pode ser entregue com SH-002.

---

## Princípio de Design

O Simples Híbrido é, tecnicamente, um **Lucro Real com nome diferente**. A implementação deve reutilizar ao máximo o código do LR, estendendo condicionais existentes (`|| isSimplesHibrido`) em vez de duplicar lógica. A única diferença visível para o usuário é o **label** ("Simples Híbrido" vs "Lucro Real") e o **posicionamento de produto** (planejamento tributário para optantes do Simples).

---

## DoD (Definition of Done)

- [ ] SH-001: Migration aplicada, COMMENTs documentados, tenants existentes verificados
- [ ] SH-002: Engine preview retorna lógica LR para SIMPLES_HIBRIDO
- [ ] SH-003: Edge function retorna lógica LR para SIMPLES_HIBRIDO
- [ ] SH-004: Auth context exibe alíquota correta na navbar para SH
- [ ] SH-005: Onboarding com SH selecionável + disclaimer obrigatório exibido
- [ ] SH-006: Configurações com tab SH completa
- [ ] SH-007: Produtos com campos LR para SH (`isSimplesHibrido`)
- [ ] SH-008: Serviços com campos LR para SH
- [ ] SH-009: DRE roteada para buildDreLucroRealPresumido
- [ ] SH-010: Blocos de despesas SH criados
- [ ] SH-011: Formulário de itens com créditos SH (arquivo identificado)
- [ ] SH-012: Dashboard/navbar exibindo "Simples Híbrido" corretamente
- [ ] SH-013: QA completo — lint, typecheck e teste comparativo LR ↔ SH passando

— Orion, orquestrando o sistema 🎯
