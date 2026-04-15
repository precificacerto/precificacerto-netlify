# Epic: Lucro Presumido RET — Paridade Total com Simples Nacional

**ID:** LP-RET-PARIDADE-SN
**Status:** Ready
**Data:** 2026-04-15
**Regime:** Lucro Presumido RET (LUCRO_PRESUMIDO_RET)
**PM:** Morgan (@pm)
**Orquestrador:** Orion (@aios-master)

---

## Objetivo

Espelhar no regime **Lucro Presumido RET** TODAS as funcionalidades do **Simples Nacional**: onboarding, configurações, produtos, serviços, formulário de itens, motor de precificação, fluxo de caixa, despesas, DRE e dashboard.

O LP RET deve ter a **mesma qualidade, completude e UX** do Simples Nacional, adaptando a lógica tributária para o Regime Especial de Tributação (RET) — alíquota consolidada de 4% (IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41%), aplicável a incorporação imobiliária, parcelamento de solo e construção de casas populares (Lei 10.931/2004).

O Simples Nacional **não deve ser alterado** — apenas o LP RET deve ser expandido para ter paridade total.

---

## Contexto Técnico

### O que o Simples Nacional tem (referência)

| Camada | Funcionalidade | Status SN |
|--------|---------------|-----------|
| **DB** | Tabela `simples_nacional_brackets` (6 faixas × 5 anexos) | ✅ Completo |
| **DB** | Campos `simples_anexo`, `simples_revenue_12m` em `tenant_settings` | ✅ Completo |
| **DB** | RLS policies para tabela de brackets | ✅ Completo |
| **Onboarding** | Detecção de anexo por CNAE | ✅ Completo |
| **Onboarding** | Input faturamento 12 meses | ✅ Completo |
| **Onboarding** | Preview de alíquota em tempo real | ✅ Completo |
| **Configurações** | Tab tributária completa (anexo + receita + alíquota efetiva) | ✅ Completo |
| **Produtos** | Integração com engine de precificação | ✅ Completo |
| **Produtos** | Breakdown de impostos visível (DAS consolidado) | ✅ Completo |
| **Serviços** | Integração com engine de precificação | ✅ Completo |
| **Itens** | Formulário de itens com campos tributários | ✅ Completo |
| **Despesas** | Categoria DAS (REGIME_TRIBUTARIO) | ✅ Completo |
| **Despesas** | Blocos de setup específicos do SN | ✅ Completo |
| **Fluxo de Caixa** | Categorias de receita/despesa para SN | ✅ Completo |
| **DRE** | Demonstração de resultado específica SN | ✅ Completo |
| **Dashboard** | Exibição de alíquota efetiva na navbar | ✅ Completo |
| **Engine** | `fetchTaxPreview()` com cálculo correto SN | ✅ Completo |
| **Engine** | Edge function `calc-tax-engine` para SN | ✅ Completo |
| **API** | `POST /api/onboarding/complete` com campos SN | ✅ Completo |

### O que o LP RET tem hoje (baseline)

| Camada | Funcionalidade | Status LP RET |
|--------|---------------|---------------|
| **DB** | Enum `LUCRO_PRESUMIDO_RET` no `tax_regime` | ✅ Feito |
| **DB** | Campo `ret_rate` em `tenant_settings` | ⚠️ Código SIM, migration NÃO |
| **DB** | Campos `lp_irpj_presumption_percent`, `lp_csll_presumption_percent` | ✅ Feito |
| **DB** | Campo `lp_estimated_annual_revenue` | ✅ Feito |
| **Onboarding** | Seleção do regime LP RET | ✅ Feito |
| **Onboarding** | Input `ret_rate` com default 4% | ✅ Feito |
| **Configurações** | Campo `ret_rate` visível quando LP RET | ✅ Feito |
| **Engine** | `fetchTaxPreview()` com taxa única `ret_rate` | ✅ Feito |
| **Engine** | Edge function com taxa única `ret_rate` | ✅ Feito |
| **Categorias** | `IMPOSTO_RET` e `BLOCK_IMPOSTOS_PRESUMIDO_RET` | ✅ Feito |
| **DRE** | `buildDrePresumidoRET()` básico | ⚠️ Parcial |
| **Produtos** | Integração básica via `taxableRegimePercent` | ⚠️ Parcial |
| **Serviços** | Integração básica via `taxableRegimePercent` | ⚠️ Parcial |
| **Itens** | Formulário sem campos específicos LP RET | ❌ Faltando |
| **Onboarding** | Detecção de atividade por CNAE para LP RET | ❌ Faltando |
| **Onboarding** | Preview de alíquota em tempo real (como SN) | ❌ Faltando |
| **Configurações** | Tab tributária completa e rica (como SN) | ❌ Faltando |
| **Despesas** | Setup completo de despesas LP RET (como SN tem para DAS) | ❌ Faltando |
| **Dashboard** | Widgets específicos LP RET | ❌ Faltando |

---

## Regras Críticas (não violar)

- **Não alterar nenhuma lógica existente do Simples Nacional** — condições `isSimplesNacional` não devem ser alteradas; apenas estender para `|| isLpRet` quando explicitamente indicado
- **Não alterar Lucro Presumido normal** — LP RET é regime separado (`LUCRO_PRESUMIDO_RET ≠ LUCRO_PRESUMIDO`)
- **`ret_rate` é alíquota consolidada** — engloba IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41% = 4,00% (default). ISS e ICMS são calculados SEPARADAMENTE
- **LP RET é regime cumulativo** — PIS/COFINS **não geram crédito**. O formulário de itens LP RET DEVE bloquear seleção de créditos de PIS/COFINS com mensagem: "PIS/COFINS não geram crédito no LP RET (regime cumulativo)". Apenas ICMS pode gerar crédito.
- **LP RET aplica-se a incorporação imobiliária e construção** — CNAE deve ser validado e o usuário alertado sobre restrições legais (Lei 10.931/2004)
- **LP RET é por OBRA, não por empresa** — tecnicamente, o RET é opcionado por incorporação/obra específica. O sistema trata como regime da empresa por simplicidade, mas deve exibir aviso: "O RET é aplicado por obra/incorporação. Certifique-se de optar pelo RET em cada SPE ou obra junto à Receita Federal."
- **INSS Retido na Fonte** — para cessão de mão de obra (construção), o tomador dos serviços retém 11% de INSS. Isso REDUZ o valor recebido. O fluxo de caixa deve ter categoria `INSS_RETIDO_FONTE` para controle desse impacto
- **ISS pode ser retido pelo tomador** — quando o cliente (tomador) é responsável tributário do ISS, a empresa recebe valor LÍQUIDO (sem ISS). O fluxo de caixa deve diferenciar "ISS pago pela empresa" vs "ISS retido pelo tomador"
- **Período de apuração do RET é MENSAL** — diferente do LP normal (IRPJ/CSLL trimestrais). O RET é recolhido mensalmente via DARF, código 1068. As estimativas e sugestões de lançamento devem ser mensais
- **Backward compatibility** — todas as empresas já cadastradas como LP RET devem continuar funcionando sem migração de dados
- **`taxes_launched` é opcional no LP RET** — produto/serviço fica ativo mesmo sem impostos lançados (igual ao LP normal)
- **`lp_irpj_presumption_percent` e `lp_csll_presumption_percent` não se aplicam ao LP RET** — no LP RET, IRPJ e CSLL já estão embutidos na taxa consolidada de 4%. Esses campos devem ser ignorados/ocultados para LP RET

---

## Lógica Tributária LP RET (referência de implementação)

### Cálculo da Alíquota Efetiva

```
RET Rate = 4% (consolidado, ou configurável pelo usuário)

Breakdown interno (informativo):
  IRPJ:   1,71%
  CSLL:   0,51%
  PIS:    0,37%
  COFINS: 1,41%
  Total:  4,00%

ISS = configurado separadamente (iss_municipality_rate)
ICMS = 0% para LP RET (serviços de construção são isentos de ICMS na maioria dos estados)
```

### Integração com Coeficiente de Precificação

```
Coeficiente = 1 - (ret_rate + iss_pct + structure_pct + commission_pct + profit_pct)

Preço Venda = Custo Total / Coeficiente
```

### Fórmula de Preview (para UI em tempo real)

```typescript
// Similar ao calcSimplesRate() do Simples Nacional
const calcLpRetPreview = (retRate: number, issRate: number): {
  effectivePct: number,
  label: string,
  breakdown: { irpj: number, csll: number, pis: number, cofins: number, iss: number }
}
```

---

## Histórias do Epic

| ID | Título | Prioridade | Estimativa |
|----|--------|------------|------------|
| LP-RET-001 | Database: Migration `ret_rate` e schema completo LP RET | Crítica | P0 |
| LP-RET-002 | Onboarding: Fluxo completo LP RET com detecção CNAE e preview | Alta | P1 |
| LP-RET-003 | Configurações: Tab tributária LP RET completa (paridade SN) | Alta | P1 |
| LP-RET-004 | Produtos: Paridade de campos, breakdown e precificação LP RET | Alta | P1 |
| LP-RET-005 | Serviços: Paridade de campos e precificação LP RET com ISS | Alta | P1 |
| LP-RET-006 | Itens: Formulário de itens completo para LP RET | Média | P2 |
| LP-RET-007 | Despesas: Setup blocks e categorias de impostos LP RET | Alta | **P1** |
| LP-RET-008 | Fluxo de Caixa: Categorias e entradas LP RET (paridade SN) | Média | P2 |
| LP-RET-009 | DRE: Demonstração de resultado completa LP RET | Alta | **P1** |
| LP-RET-010 | Dashboard: Widgets e exibição de alíquota LP RET | Média | P2 |
| LP-RET-011 | Motor de Precificação (Edge Function): LP RET com ISS separado | Alta | P1 |
| LP-RET-012 | API Routes: Endpoints LP RET completos | Alta | P1 |
| LP-RET-013 | INSS e ISS Retidos na Fonte: Fluxo de caixa e lógica de retenção | Alta | **P1** (depende de LP-RET-007 e LP-RET-009) |

**Ordem de implementação recomendada:**
`001 → 002 → 012 → 011 → 003 → 004 → 005 → 007 → 009 → 013 → 006 → 008 → 010`

**Features além da paridade com SN** (funcionalidades específicas do LP RET, não existentes no SN):
- Campo "tipo de contrato" no fluxo de caixa (LP-RET-008) — específico de construção civil
- Checklist de INSS/ISS retidos na fonte ao lançar receita (LP-RET-013) — mecanismo de retenção inexistente no SN
- `ret_rate_override` por item (LP-RET-006) — flexibilidade adicional do LP RET

---

---

# Story LP-RET-001
## Database: Migration `ret_rate` e Schema Completo LP RET

**Status:** Ready
**Prioridade:** CRÍTICA (P0 — bloqueante para todas as outras stories)

**Arquivos principais:**
- `supabase/migrations/` (nova migration)
- `src/supabase/database.types.ts` (regenerar após migration)

### Contexto

O campo `ret_rate` é usado em todo o código (`calc-tax-preview.ts`, `calc-tax-engine/index.ts`, `onboarding.tsx`, `configuracoes/index.tsx`) mas **nunca foi criado via migration SQL**. Sem isso, o campo não persiste no banco em produção.

Além disso, faltam campos adicionais para que LP RET tenha paridade completa com o Simples Nacional em termos de configuração.

### Acceptance Criteria

- [ ] Migration cria `ret_rate numeric DEFAULT 0.04` em `tenant_settings` com `ADD COLUMN IF NOT EXISTS` — **unidade: decimal 0-1** (0.04 = 4%). O formulário exibe em porcentagem (0-100) e converte com `/100` antes de salvar. A edge function lê decimal 0-1 diretamente. Esta convenção de unidade DEVE ser documentada no COMMENT ON COLUMN.
- [ ] Migration cria `ret_iss_separate boolean DEFAULT true` — indica se ISS é calculado separadamente do RET (true = ISS é campo `iss_municipality_rate`; false = ISS já embutido no `ret_rate`)
- [ ] Migration cria `ret_activity_type text DEFAULT 'INCORPORACAO_IMOBILIARIA'` — tipo de atividade LP RET. Valores válidos: `INCORPORACAO_IMOBILIARIA`, `CONSTRUCAO_CIVIL`, `PARCELAMENTO_SOLO`, `CONSTRUCAO_CASAS_POPULARES`
- [ ] Migration cria `ret_estimated_monthly_revenue numeric DEFAULT 0` — receita mensal estimada (para dashboard e planejamento). **Unidade: Reais (R$)**, sem conversão.
- [ ] Migration NÃO cria `iss_municipality_rate` — este campo já existe desde `20260213000000_fiscal_tax_engine.sql` linha 191. **Não duplicar.**
- [ ] Migration NÃO cria `ret_rate_override` em `tenant_settings` — este campo é por ITEM e deve ir na tabela `items` ou `pricing_items`. Ver LP-RET-006 para detalhes.
- [ ] Migration adiciona COMMENT ON COLUMN em todos os novos campos, incluindo explicitamente a unidade (decimal 0-1 ou Reais ou boolean)
- [ ] `database.types.ts` é regenerado e reflete todos os novos campos
- [ ] RLS policies existentes em `tenant_settings` cobrem os novos campos automaticamente (sem mudança necessária)
- [ ] Migration é idempotente (pode rodar múltiplas vezes sem erro)
- [ ] Empresas já cadastradas como `LUCRO_PRESUMIDO_RET` recebem os defaults corretos automaticamente

### Tasks

- [ ] Criar arquivo `supabase/migrations/20260415000003_lp_ret_complete_schema.sql`
- [ ] Adicionar `ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ret_rate numeric DEFAULT 0.04`
- [ ] Adicionar `ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ret_iss_separate boolean DEFAULT true`
- [ ] Adicionar `ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ret_activity_type text DEFAULT 'INCORPORACAO_IMOBILIARIA'`
- [ ] Adicionar `ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ret_estimated_monthly_revenue numeric DEFAULT 0`
- [ ] Adicionar COMMENT ON COLUMN para cada campo
- [ ] Executar `supabase db push` (via @devops)
- [ ] Executar `supabase gen types typescript` e atualizar `src/supabase/database.types.ts`
- [ ] Verificar que código existente que usa `ret_rate` funciona sem alterações

### File List

- `supabase/migrations/20260415000003_lp_ret_complete_schema.sql` (criar)
- `src/supabase/database.types.ts` (atualizar — regenerar)

---

---

# Story LP-RET-002
## Onboarding: Fluxo Completo LP RET com Detecção CNAE e Preview

**Status:** Ready
**Prioridade:** Alta (P1)

**Arquivos principais:**
- `src/pages/onboarding.tsx`
- `src/pages/api/onboarding/complete.ts`

### Contexto

O onboarding do Simples Nacional tem detecção automática de Anexo por CNAE, preview de alíquota em tempo real e configuração rica. O LP RET atualmente tem apenas um input de `ret_rate` com default 4%. Precisa ter a mesma qualidade de onboarding.

**Referência SN (o que deve ser espelhado):**
- Detecção automática de Anexo por CNAE → LP RET: detecção de `ret_activity_type` por CNAE (construção = CNAE 41xx, 42xx, 43xx)
- Input faturamento 12 meses (`simples_revenue_12m`) → LP RET: `ret_estimated_monthly_revenue`
- Preview de alíquota efetiva em tempo real (`calcSimplesRate`) → LP RET: preview do `ret_rate` + ISS

### Acceptance Criteria

- [ ] Quando regime selecionado é `LUCRO_PRESUMIDO_RET`, o onboarding exibe seção específica LP RET
- [ ] Campo `ret_activity_type` com Select (Incorporação Imobiliária, Construção Civil, Parcelamento de Solo, Construção de Casas Populares)
- [ ] Detecção automática de `ret_activity_type` por CNAE: prefixos 41xx, 42xx, 43xx → "Construção Civil"; 68xx → "Incorporação Imobiliária"
- [ ] Tooltip explicativo: "LP RET é aplicável a incorporações imobiliárias e construções conforme Lei 10.931/2004. Confirme com seu contador."
- [ ] Campo `ret_rate` com label "Alíquota RET (%)", default 4%, min 0, max 100, step 0.01
- [ ] Breakdown informativo da alíquota RET: "IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41% = 4,00%"
- [ ] Campo `iss_municipality_rate` com label "Alíquota ISS Municipal (%)" com tooltip explicando que ISS é cobrado separadamente do RET
- [ ] Campo `ret_estimated_monthly_revenue` com label "Receita Mensal Estimada (R$)" para planejamento
- [ ] Preview em tempo real: exibe "Carga tributária total: X% (RET Y% + ISS Z%)"
- [ ] Preview atualiza automaticamente ao mudar `ret_rate` ou `iss_municipality_rate`
- [ ] `POST /api/onboarding/complete` persiste todos os novos campos LP RET: `ret_rate`, `ret_activity_type`, `ret_iss_separate`, `ret_estimated_monthly_revenue`
- [ ] Campos são salvos corretamente em `tenant_settings`

### Tasks

- [ ] Em `onboarding.tsx`, criar bloco condicional `isLpRet` com todos os campos LP RET
- [ ] Implementar `detectLpRetActivity(cnae: string): string` — mapeia CNAE para tipo de atividade LP RET
- [ ] Implementar `calcLpRetPreview(retRate: number, issRate: number)` — retorna alíquota total e breakdown
- [ ] Adicionar Select de `ret_activity_type` com 4 opções
- [ ] Adicionar InputNumber de `ret_rate` com formatação %
- [ ] Adicionar breakdown informativo (IRPJ/CSLL/PIS/COFINS) como texto informativo (não editável)
- [ ] Adicionar InputNumber de `iss_municipality_rate` com tooltip
- [ ] Adicionar InputNumber de `ret_estimated_monthly_revenue`
- [ ] Adicionar preview de carga tributária total em tempo real
- [ ] Atualizar `POST /api/onboarding/complete` para incluir campos LP RET no UPDATE de `tenant_settings`
- [ ] Adicionar validação: se CNAE não é construção/imóveis, exibir aviso (não bloqueante)

### File List

- `src/pages/onboarding.tsx` (modificar)
- `src/pages/api/onboarding/complete.ts` (modificar)

---

---

# Story LP-RET-003
## Configurações: Tab Tributária LP RET Completa (Paridade SN)

**Status:** Ready
**Prioridade:** Alta (P1)

**Arquivos principais:**
- `src/pages/configuracoes/index.tsx`

### Contexto

A página de Configurações tem uma tab tributária rica para o Simples Nacional (select de Anexo, input de receita 12m, display de alíquota efetiva com cor visual, botão salvar). O LP RET tem apenas um input de `ret_rate` básico. Precisa de paridade completa.

**Referência SN (o que deve ser espelhado):**
```typescript
// SN: função calcSimplesRate() — busca brackets e calcula efetiva em tempo real
// → LP RET: função calcLpRetRate() — calcula carga total (ret_rate + iss)
```

### Acceptance Criteria

- [ ] Quando `tax_regime === 'LUCRO_PRESUMIDO_RET'`, a tab tributária exibe seção completa LP RET
- [ ] Select de `ret_activity_type` (Incorporação, Construção, Parcelamento, Casas Populares) editável
- [ ] InputNumber de `ret_rate` (%) com label "Alíquota RET" e tooltip explicativo
- [ ] Breakdown da alíquota RET exibido como card informativo: IRPJ 1,71% / CSLL 0,51% / PIS 0,37% / COFINS 1,41%
- [ ] InputNumber de `iss_municipality_rate` (%) com label "ISS Municipal" e campo editável
- [ ] InputNumber de `ret_estimated_monthly_revenue` (R$) com label "Receita Mensal Estimada"
- [ ] Card de "Carga Tributária Total" com cor visual (igual ao card de alíquota efetiva do SN):
  - Exibe: `ret_rate + iss_municipality_rate` em %
  - Label: "Carga Total LP RET"
  - Atualiza em tempo real ao mudar qualquer campo
- [ ] Card de "Breakdown por Imposto" mostrando cada componente:
  - IRPJ: X% (dentro do RET)
  - CSLL: X% (dentro do RET)
  - PIS: X% (dentro do RET)
  - COFINS: X% (dentro do RET)
  - ISS: X% (separado, municipal)
  - Total: X%
- [ ] Botão "Salvar Configurações" persiste todos os campos LP RET
- [ ] Ao salvar, exibe feedback visual de sucesso/erro
- [ ] Toggle `ret_iss_separate` (ISS Separado) com label "ISS cobrado separadamente do RET"

### Tasks

- [ ] Criar função `calcLpRetRate(retRate: number, issRate: number)` em `configuracoes/index.tsx`
- [ ] Criar componente de card de "Carga Tributária LP RET" (similar ao card de alíquota efetiva do SN)
- [ ] Criar componente de breakdown de impostos por componente
- [ ] Adicionar Select de `ret_activity_type`
- [ ] Adicionar InputNumber de `ret_rate` com formatação
- [ ] Adicionar InputNumber de `iss_municipality_rate`
- [ ] Adicionar InputNumber de `ret_estimated_monthly_revenue`
- [ ] Adicionar Toggle `ret_iss_separate`
- [ ] Implementar lógica de update: persistir todos os campos no endpoint de configurações
- [ ] Atualizar API de configurações para aceitar e salvar todos os campos LP RET

### File List

- `src/pages/configuracoes/index.tsx` (modificar)
- `src/pages/api/configuracoes/` (verificar e modificar se necessário)

---

---

# Story LP-RET-004
## Produtos: Paridade de Campos, Breakdown e Precificação LP RET

**Status:** Ready
**Prioridade:** Alta (P1)

**Arquivos principais:**
- `src/page-parts/products/content.component.tsx`
- `src/page-parts/products/product-price.component.tsx`
- `src/pages/produtos/index.tsx`

### Contexto

O Simples Nacional tem integração completa com o motor de precificação para produtos: breakdown de impostos visível, coeficiente correto, preview de preço. O LP RET usa o campo `taxableRegimePercent` de forma básica. Precisa de paridade completa com breakdown visível e cálculo correto (RET + ISS se aplicável).

**Referência SN para produtos:**
- `taxableRegimePercent` = alíquota efetiva do DAS
- Breakdown: "DAS Simples Nacional: X%"
- Coeficiente: `1 - (das + structure + commission + profit)`

**LP RET para produtos:**
- `taxableRegimePercent` = `ret_rate` (sem ISS, pois construção geralmente não tem ICMS)
- Breakdown: "RET: X% (IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41%)"
- Coeficiente: `1 - (ret_rate + structure + commission + profit)`

### Acceptance Criteria

- [ ] Na lista de produtos, quando regime é LP RET, exibe badge "LP RET" e alíquota RET
- [ ] No formulário de produto, quando regime é LP RET, exibe seção "Impostos LP RET":
  - Campo de visualização `ret_rate` (não editável — só nas configurações)
  - Breakdown informativo: IRPJ / CSLL / PIS / COFINS
- [ ] O preview de preço (`product-price.component.tsx`) exibe breakdown correto para LP RET:
  - Linha "RET (IRPJ+CSLL+PIS+COFINS): X%" com valor em R$
  - Linha "Custo Tributário Total: R$ X"
- [ ] Coeficiente de precificação usa `ret_rate` corretamente (sem duplicação de impostos)
- [ ] Ao calcular preço sugerido, o resultado reflete a carga LP RET corretamente
- [ ] Produto com LP RET ativo mostra "Impostos: X% RET" no card da lista
- [ ] Campos opcionais para produto LP RET: `ret_fiscal_note` (observação fiscal), similar aos campos de LP normal
- [ ] Ao salvar produto, os campos LP RET são persistidos corretamente

### Tasks

- [ ] Em `content.component.tsx`, adicionar bloco condicional `isLpRet` com campos específicos
- [ ] Criar `LpRetTaxInfo` component — exibe breakdown RET (IRPJ/CSLL/PIS/COFINS) em modo readonly
- [ ] Em `product-price.component.tsx`, adicionar linha de breakdown "RET: X% = R$ Y" para LP RET
- [ ] Verificar que `taxableRegimePercent` recebe `ret_rate` corretamente via `fetchTaxPreview()`
- [ ] Adicionar badge "LP RET" na lista de produtos quando regime é LP RET
- [ ] Testar cálculo de preço com ret_rate = 4% e verificar coeficiente correto
- [ ] Garantir que campo `taxes_launched` é OPCIONAL para LP RET (não bloqueia produto)

### File List

- `src/page-parts/products/content.component.tsx` (modificar)
- `src/page-parts/products/product-price.component.tsx` (modificar)
- `src/pages/produtos/index.tsx` (verificar e modificar)

---

---

# Story LP-RET-005
## Serviços: Paridade de Campos e Precificação LP RET com ISS

**Status:** Ready
**Prioridade:** Alta (P1)

**Arquivos principais:**
- `src/page-parts/services/content.component.tsx`
- `src/pages/servicos/index.tsx`

### Contexto

Para serviços de construção/incorporação em LP RET, o ISS é calculado SEPARADAMENTE do RET. O ISS é um imposto municipal (2-5%) que incide sobre serviços. O RET cobre IRPJ+CSLL+PIS+COFINS. Portanto, o coeficiente para serviços LP RET é:

```
Coeficiente = 1 - (ret_rate + iss_rate + structure_pct + commission_pct + profit_pct)
```

O Simples Nacional para serviços usa o DAS unificado (que já inclui ISS no Anexo III/IV). LP RET deve ter paridade mas com ISS separado.

### Acceptance Criteria

- [ ] No formulário de serviço, quando regime é LP RET, exibe seção "Impostos LP RET":
  - Campo visualização `ret_rate` (readonly — configurado na tab de configurações)
  - Campo visualização `iss_municipality_rate` (readonly — configurado nas configurações)
  - Breakdown: "RET: X% + ISS: Y% = Total: Z%"
- [ ] Coeficiente de precificação de serviços usa `ret_rate + iss_rate` corretamente
- [ ] Preview de preço de serviço (`service-price.component`) exibe:
  - Linha "RET (IRPJ+CSLL+PIS+COFINS): X% = R$ Y"
  - Linha "ISS Municipal: X% = R$ Y"
  - Linha "Carga Tributária Total: R$ Y"
- [ ] Toggle `ret_iss_separate` afeta o cálculo: se `false`, ISS já está embutido no `ret_rate`
- [ ] Lista de serviços exibe badge "LP RET" e alíquota total (RET + ISS)
- [ ] Campo `nbs_code` (Nomenclatura Brasileira de Serviços) para serviços LP RET — igual ao LP normal
- [ ] Ao salvar serviço, todos os campos LP RET são persistidos

### Tasks

- [ ] Em `content.component.tsx` de serviços, adicionar bloco condicional `isLpRet`
- [ ] Criar `LpRetServiceTaxInfo` component — exibe RET + ISS com toggle `ret_iss_separate`
- [ ] Criar `src/page-parts/services/service-price.component.tsx` (não existe atualmente — criar novo, análogo ao `product-price.component.tsx` de produtos) com breakdown LP RET: linha "RET: X% = R$ Y" + linha "ISS: X% = R$ Y" + linha "Total Tributos: R$ Z"
- [ ] Atualizar cálculo de coeficiente em serviços para LP RET: `1 - (ret_rate + iss_rate + ...)`
- [ ] Garantir que `iss_municipality_rate` do `tenant_settings` é usado no cálculo
- [ ] Adicionar badge "LP RET" na lista de serviços
- [ ] Testar cálculo: ret_rate=4%, iss=5%, structure=20%, commission=5%, profit=15% → coeficiente = 0.51

### File List

- `src/page-parts/services/content.component.tsx` (modificar)
- `src/pages/servicos/index.tsx` (verificar e modificar)

---

---

# Story LP-RET-006
## Itens: Formulário de Itens Completo para LP RET

**Status:** Ready
**Prioridade:** Média (P2)

**Arquivos principais:**
- `src/page-parts/items/` (formulário de itens)
- `src/pages/itens/` (página de itens)

### Contexto

O formulário de itens no Simples Nacional e LP normal tem campos tributários específicos (NCM, ICMS, etc.). O LP RET precisa de paridade: campos de NCM/NBS, ICMS (pois LP RET ainda pode ter ICMS em alguns casos), e campos específicos do regime.

**Nota:** LP RET é principalmente construção civil (serviços), então a maioria dos itens são serviços. ICMS aparece apenas se o item incluir materiais (subempreitada com materiais). PIS/COFINS não geram crédito (regime cumulativo).

**`ret_rate_override` — Persistência:** Este campo é por item. Deve ser persistido como coluna na tabela `items` (ou `pricing_items`, verificar qual tabela o sistema usa para itens). A migration para este campo deve ser criada como parte desta story (não da LP-RET-001 que é exclusiva de `tenant_settings`).

### Acceptance Criteria

- [ ] Migration adiciona `ret_rate_override numeric` (nullable) na tabela `items` ou equivalente — **unidade: decimal 0-1**, mesmo padrão do `ret_rate`. Se null, usar o `ret_rate` do tenant.
- [ ] No formulário de item, quando regime é LP RET, exibe campos específicos:
  - Campo `ret_applies` (boolean) — "RET se aplica a este item?"
  - Campo `ret_rate_override` (numeric, opcional, em %) — "Alíquota RET específica para este item (se diferente do padrão de X%)". Exibir em %, persistir como decimal (÷100).
  - Campo `iss_applies` (boolean) — "ISS se aplica a este item?"
  - Campo `icms_applies` (boolean) — "ICMS se aplica a este item? (ex: materiais em obra)"
- [ ] Se `icms_applies = true`, exibe campo de alíquota ICMS (igual ao LP normal)
- [ ] NCM code disponível se item tem materiais (ICMS pode incidir)
- [ ] NBS code disponível se item é serviço puro
- [ ] Custo líquido calculado corretamente: `custo_bruto - crédito_icms` (apenas ICMS, sem PIS/COFINS)
- [ ] Créditos de PIS/COFINS estão **BLOQUEADOS** para LP RET — se o usuário tentar selecionar crédito de PIS ou COFINS, exibir mensagem: "PIS/COFINS não geram crédito no LP RET (regime cumulativo). Apenas ICMS é creditável."
- [ ] Campos `lp_irpj_presumption_percent` e `lp_csll_presumption_percent` ficam **OCULTOS** no formulário quando regime é LP RET (esses campos só fazem sentido no LP normal)
- [ ] Campo de observação fiscal `ret_fiscal_note` (texto livre)
- [ ] Ao salvar item, campos LP RET persistidos em `item_settings` ou tabela específica de itens
- [ ] Lista de itens exibe quais impostos se aplicam (RET / ISS / ICMS)

### Tasks

- [ ] Mapear formulário de item atual e identificar campos a adicionar para LP RET
- [ ] Adicionar Toggle `ret_applies` no formulário
- [ ] Adicionar Toggle `iss_applies` no formulário
- [ ] Adicionar Toggle `icms_applies` no formulário (com campo de alíquota condicional)
- [ ] Adicionar InputNumber `ret_rate_override` (opcional, condicional a `ret_applies`)
- [ ] Adicionar campo `ret_fiscal_note`
- [ ] Verificar cálculo de custo líquido para LP RET (apenas ICMS como crédito)
- [ ] Adicionar badges de impostos na lista de itens para LP RET

### File List

- `src/page-parts/items/` (modificar — identificar arquivos específicos)
- `src/pages/itens/` (verificar e modificar)

---

---

# Story LP-RET-007
## Despesas: Setup Blocks e Categorias de Impostos LP RET

**Status:** Ready
**Prioridade:** Média (P2)

**Arquivos principais:**
- `src/constants/expense-setup-blocks.ts`
- `src/constants/cashier-category.ts`

### Contexto

O Simples Nacional tem um bloco de setup específico com a categoria `DAS (Documento de Arrecadação do Simples Nacional)` no grupo `REGIME_TRIBUTARIO`. O LP RET já tem `IMPOSTO_RET` como categoria e um bloco `BLOCK_IMPOSTOS_PRESUMIDO_RET` (existente).

**Estratégia de blocos:** O bloco existente `BLOCK_IMPOSTOS_PRESUMIDO_RET` contém apenas impostos. Esta story cria `BLOCK_DESPESAS_LP_RET` como bloco COMPLETO (superconjunto) que inclui todos os impostos do `BLOCK_IMPOSTOS_PRESUMIDO_RET` MAIS as despesas operacionais específicas da construção. O `BLOCK_IMPOSTOS_PRESUMIDO_RET` NÃO é alterado — o novo bloco o complementa. A função `getExpenseSetupBlocks()` para LP RET deve retornar `BLOCK_DESPESAS_LP_RET` (que já inclui todos os impostos). Documentar isso no código com comentário explícito.

**Referência SN:**
```typescript
{ key: 'IMPOSTO_DAS', label: 'DAS (Documento de Arrecadação do Simples Nacional)', expense_group: 'REGIME_TRIBUTARIO' }
```

**LP RET precisa de:**
```typescript
// Guias de recolhimento específicas do LP RET:
{ key: 'IMPOSTO_RET', label: 'RET - Regime Especial de Tributação', expense_group: 'REGIME_TRIBUTARIO' }
{ key: 'IMPOSTO_RET_ISS', label: 'ISS - Imposto sobre Serviços (LP RET)', expense_group: 'REGIME_TRIBUTARIO' }
{ key: 'IMPOSTO_RET_INSS', label: 'INSS - Previdência Social (LP RET)', expense_group: 'REGIME_TRIBUTARIO' }
```

### Acceptance Criteria

- [ ] `BLOCK_DESPESAS_LP_RET` criado em `expense-setup-blocks.ts` com todas as categorias do regime:
  - Impostos: IMPOSTO_RET, IMPOSTO_RET_ISS, IMPOSTO_RET_INSS, IMPOSTO_ICMS (se aplicável)
  - Folha de pagamento: CPP, FGTS, férias, 13º salário
  - Operacionais: materiais de obra, subempreitada, aluguel de equipamentos
  - Administrativo: escritório, contabilidade, alvará, licenças
  - Financeiro: juros, tarifas bancárias, seguros
- [ ] `getTaxCategories()` retorna categorias corretas para LP RET
- [ ] `getExpenseSetupBlocks()` retorna `BLOCK_DESPESAS_LP_RET` quando regime é LP RET
- [ ] No modal de setup de despesas, ao selecionar regime LP RET, o bloco LP RET é sugerido automaticamente
- [ ] Categoria `IMPOSTO_RET` tem label "RET (Regime Especial de Tributação)" e emoji fiscal
- [ ] Categoria `IMPOSTO_RET_ISS` tem label "ISS Municipal (LP RET)"
- [ ] Todas as categorias LP RET têm `expense_group` correto: impostos → `REGIME_TRIBUTARIO`

### Tasks

- [ ] Criar `BLOCK_DESPESAS_LP_RET` em `expense-setup-blocks.ts`
- [ ] Adicionar todas as categorias de despesa específicas do LP RET
- [ ] Verificar e atualizar `getTaxCategories()` para LP RET retornar categorias corretas
- [ ] Verificar e atualizar `getExpenseSetupBlocks()` para LP RET
- [ ] Garantir que modal de setup de despesas detecta LP RET e oferece bloco correto
- [ ] Adicionar categorias RET_ISS e RET_INSS se não existirem em `cashier-category.ts`

### File List

- `src/constants/expense-setup-blocks.ts` (modificar)
- `src/constants/cashier-category.ts` (modificar)

---

---

# Story LP-RET-008
## Fluxo de Caixa: Categorias e Entradas LP RET (Paridade SN)

**Status:** Ready
**Prioridade:** Média (P2)

**Arquivos principais:**
- `src/pages/fluxo-de-caixa/` ou equivalente (página de fluxo de caixa)
- `src/components/cashflow-setup-modal.component.tsx`

### Contexto

O Simples Nacional no fluxo de caixa tem a categoria DAS como despesa tributária. O LP RET deve ter categorias equivalentes para:
1. **Receitas:** entradas por tipo de contrato (obra, incorporação, etc.)
2. **Despesas tributárias:** RET mensal, ISS mensal, INSS
3. **Despesas operacionais:** específicas da construção civil

### Acceptance Criteria

- [ ] No fluxo de caixa, quando regime é LP RET, as categorias de despesas exibem as categorias LP RET (IMPOSTO_RET, IMPOSTO_RET_ISS, IMPOSTO_RET_INSS)
- [ ] A categoria `IMPOSTO_RET` exibe no fluxo como "RET — Regime Especial de Tributação"
- [ ] O grupo `REGIME_TRIBUTARIO` agrupa RET + ISS + INSS para LP RET
- [ ] No modal de setup do fluxo de caixa (`cashflow-setup-modal`), quando LP RET é detectado, sugere configurar as categorias corretas
- [ ] Entrada de receita no fluxo de caixa para LP RET suporta campo "tipo de contrato" (empreitada global, empreitada parcial, incorporação)
- [ ] Ao lançar RET no fluxo de caixa, o valor é calculado como `receita_periodo × ret_rate` (sugestão automática, editável)
- [ ] Ao lançar ISS no fluxo de caixa, o valor é calculado como `receita_periodo × iss_rate` (sugestão automática)
- [ ] Relatório do fluxo de caixa segrega tributos LP RET (RET / ISS / INSS) separadamente
- [ ] Histórico de pagamentos de RET visível no fluxo de caixa

### Tasks

- [ ] Verificar página de fluxo de caixa e identificar onde categorias SN são exibidas
- [ ] Adaptar exibição de categorias para LP RET (usar `BLOCK_IMPOSTOS_PRESUMIDO_RET` já existente)
- [ ] Adicionar categorias RET_ISS e RET_INSS no fluxo de caixa
- [ ] Atualizar `cashflow-setup-modal.component.tsx` para detectar LP RET e sugerir setup correto
- [ ] Adicionar campo "tipo de contrato" nas entradas de receita para LP RET
- [ ] Implementar sugestão automática de valor RET ao lançar despesa RET
- [ ] Garantir que relatório do fluxo segrega tributos LP RET corretamente

### File List

- `src/pages/fluxo-de-caixa/` (verificar e modificar)
- `src/components/cashflow-setup-modal.component.tsx` (modificar)

---

---

# Story LP-RET-009
## DRE: Demonstração de Resultado Completa LP RET

**Status:** Ready
**Prioridade:** Média (P2)

**Arquivos principais:**
- `src/pages/dfc/index.tsx`

### Contexto

O LP RET já tem `buildDrePresumidoRET()` mas é uma implementação básica. Precisa de uma DRE completa espelhando a qualidade da DRE do Simples Nacional, com todas as linhas relevantes, breakdown correto de impostos e segregação por tipo.

**DRE LP RET completa deve ter (estrutura contábil correta NBC TG 26):**

```
RECEITA BRUTA DE SERVIÇOS/OBRAS

  (-) Deduções da Receita Bruta:      ← impostos SOBRE a receita
      (-) ISS Municipal
      (-) INSS Retido na Fonte (11%)   ← quando tomador retém
      (-) ISS Retido pelo Tomador      ← quando tomador retém
      (-) PIS (0,37% — componente RET) ← PIS é dedução da receita
      (-) COFINS (1,41% — componente RET) ← COFINS é dedução da receita
      (-) Devoluções/Cancelamentos

= RECEITA LÍQUIDA DE SERVIÇOS/OBRAS

  (-) Custos Diretos (CPV):
      (-) Materiais de obra
      (-) Mão de obra direta
      (-) Subempreitadas
      (-) Aluguel de equipamentos

= RESULTADO BRUTO (Margem Bruta)

  (-) Despesas Operacionais:
      (-) Despesas Comerciais
      (-) Despesas Administrativas
      (-) INSS Patronal (sobre folha)

  (-) Despesas Financeiras:
      (-) Juros e encargos bancários

= RESULTADO ANTES DOS IMPOSTOS SOBRE O LUCRO

  (-) Impostos sobre o Lucro (componentes IRPJ+CSLL do RET):
      (-) IRPJ (1,71% — componente RET)
      (-) CSLL (0,51% — componente RET)

= LUCRO/PREJUÍZO LÍQUIDO DO PERÍODO

Nota: Exibir também "RET Total Recolhido (DARF 1068): R$ X" como linha informativa.
```

**ATENÇÃO: PIS/COFINS são deduções da receita bruta (não despesa operacional).** IRPJ/CSLL são impostos sobre o lucro (abaixo do resultado operacional). Esta estrutura está correta segundo a NBC TG 26 e padrão contábil brasileiro. O sistema pode opcionalmente exibir a linha "RET Total (DARF 1068): R$ X" como resumo consolidado, mas a DRE formal deve manter os componentes nas posições corretas.

### Acceptance Criteria

- [ ] `buildDrePresumidoRET()` em `dfc/index.tsx` produz DRE com todas as linhas acima
- [ ] Linha "RET (IRPJ+CSLL+PIS+COFINS)" mostra o total pago de RET no período
- [ ] Linha "ISS Municipal" mostra ISS pago separadamente
- [ ] Linha "INSS Patronal" mostra INSS pago
- [ ] Deduções da receita incluem ISS (pois ISS é imposto sobre receita)
- [ ] Breakdown de custo direto: materiais / mão de obra / subempreitada / equipamentos
- [ ] Resultado final mostra Lucro/Prejuízo Líquido após todos os tributos
- [ ] Alíquota efetiva total é exibida: "Carga Tributária Efetiva do Período: X%"
- [ ] DRE suporta filtro por período (mês, trimestre, semestre, ano)
- [ ] DRE é exportável (PDF/Excel) — mesma funcionalidade do SN
- [ ] Labels corretos para LP RET (sem mencionar "Simples" ou "DAS")

### Tasks

- [ ] Reescrever `buildDrePresumidoRET()` com todas as linhas da DRE completa
- [ ] Implementar agrupamento de categorias: custo direto / operacional / tributos / financeiro
- [ ] Adicionar linha de ISS nas deduções da receita bruta
- [ ] Adicionar cálculo de alíquota efetiva total do período
- [ ] Verificar filtro por período e adaptar para LP RET
- [ ] Testar DRE com dados reais de empresa LP RET
- [ ] Garantir que alias 'PRESUMIDO_RET' e 'LUCRO_PRESUMIDO_RET' continuam funcionando

### File List

- `src/pages/dfc/index.tsx` (modificar)

---

---

# Story LP-RET-010
## Dashboard: Widgets e Exibição de Alíquota LP RET

**Status:** Ready
**Prioridade:** Média (P2)

**Arquivos principais:**
- `src/contexts/auth.context.tsx`
- `src/components/navbar/` ou equivalente (navbar com alíquota)
- `src/pages/dashboard/` ou equivalente

### Contexto

O Simples Nacional exibe a alíquota efetiva na navbar (`taxableRegimeValue`) e tem widgets no dashboard mostrando impostos do período. O LP RET precisa exibir sua carga tributária (RET + ISS) da mesma forma.

**Referência SN:**
```typescript
// auth.context.tsx: computeTaxableRegimeValue()
// → Para SN: effectiveRate (calculado via brackets)
// → Para LP RET: ret_rate + iss_rate (total)
```

### Acceptance Criteria

- [ ] `computeTaxableRegimeValue()` para LP RET retorna `ret_rate + iss_municipality_rate` (total) em %
- [ ] Navbar exibe "Impostos: X% (LP RET)" onde X = ret_rate + iss_rate
- [ ] Label correto: "LP RET" (não "Lucro Presumido RET" completo — muito longo para navbar)
- [ ] Dashboard tem widget "Tributação LP RET" mostrando:
  - RET mensal estimado: `ret_estimated_monthly_revenue × ret_rate`
  - ISS mensal estimado: `ret_estimated_monthly_revenue × iss_rate`
  - Total mensal estimado de tributos
- [ ] Dashboard tem widget "Regime: LP RET" com tipo de atividade
- [ ] Dashboard tem card de "Alerta LP RET" se `ret_rate` não foi configurado (ainda está em 0)
- [ ] `taxableRegimeValue` atualiza ao salvar configurações LP RET

### Tasks

- [ ] Atualizar `computeTaxableRegimeValue()` em `auth.context.tsx` para LP RET retornar `ret_rate + iss_rate`
- [ ] Verificar label na navbar para LP RET (deve ser "LP RET" ou "Lucro Presumido RET")
- [ ] Criar/atualizar widget de tributação no dashboard para LP RET
- [ ] Criar widget de estimativa mensal (RET + ISS)
- [ ] Adicionar alerta se ret_rate está em 0 (configuração pendente)
- [ ] Testar que ao mudar configurações, dashboard atualiza corretamente

### File List

- `src/contexts/auth.context.tsx` (modificar)
- `src/pages/dashboard/` (verificar e modificar)
- Navbar component (identificar e modificar)

---

---

# Story LP-RET-011
## Motor de Precificação (Edge Function): LP RET com ISS Separado

**Status:** Ready
**Prioridade:** Alta (P1)

**Arquivos principais:**
- `supabase/functions/calc-tax-engine/index.ts`
- `src/utils/calc-tax-preview.ts`

### Contexto

Atualmente, a edge function `calc-tax-engine` trata LP RET com uma taxa única (`ret_rate`) sem breakdown. Precisa ser expandida para:
1. Calcular RET + ISS separados
2. Respeitar o toggle `ret_iss_separate`
3. Retornar breakdown completo de impostos
4. Suportar `ret_rate_override` por item (quando configurado)

**Referência SN na edge function:**
```typescript
// SN: Busca brackets, calcula efetiva, retorna label
// LP RET atual: apenas ret_rate fixo, sem breakdown
// LP RET novo: ret_rate + iss_rate, com breakdown IRPJ/CSLL/PIS/COFINS/ISS
```

### Acceptance Criteria

- [ ] **Convenção de unidades** — CRÍTICO para evitar bugs: `ret_rate` e `iss_municipality_rate` são lidos do banco como **decimal 0-1** (ex: 0.04 = 4%). A engine NUNCA recebe ou retorna valores em porcentagem (0-100) — apenas o formulário frontend faz a conversão com ÷100 antes de salvar.
- [ ] `fetchTaxPreview()` para LP RET retorna:
  ```typescript
  // ret_rate e iss_rate são DECIMAIS lidos do banco (ex: 0.04 e 0.03)
  {
    effectiveTaxPct: ret_rate + (ret_iss_separate ? iss_rate : 0),  // decimal 0-1
    taxLabel: 'LP RET (4,00% + ISS 3,00%)',
    isMei: false,
    taxableRegimePercent: (ret_rate + iss_rate) * 100,  // porcentagem para exibição (7.00)
    breakdown: {
      irpj: 0.0171,    // decimal — 1,71% dentro do RET
      csll: 0.0051,    // decimal — 0,51% dentro do RET
      pis: 0.0037,     // decimal — 0,37% dentro do RET
      cofins: 0.0141,  // decimal — 1,41% dentro do RET
      iss: iss_rate,   // decimal — alíquota municipal
      total: ret_rate + iss_rate  // decimal total
    }
  }
  ```
  **Nota legal:** As alíquotas 1,71% + 0,51% + 0,37% + 1,41% = 4,00% correspondem à Lei 10.931/2004. Adicionar tooltip na UI: "Confirme as alíquotas vigentes com seu contador. A legislação pode ter sido atualizada."
- [ ] Edge function `calc-tax-engine` para LP RET:
  - Lê `ret_rate` e `iss_municipality_rate` do `tenant_settings`
  - Respeita `ret_iss_separate`: se false, considera ISS embutido no `ret_rate`
  - Retorna `effectiveTaxPct = ret_rate + (ret_iss_separate ? iss_rate : 0)`
  - Salva breakdown em `pricing_calculations` se tabela suportar
- [ ] `ret_rate_override` no item sobrepõe o `ret_rate` do tenant para aquele item específico
- [ ] Coeficiente calculado corretamente: `1 - (efectiveTaxPct + structure + commission + profit)`
- [ ] Preço de venda calculado corretamente com carga LP RET completa

### Tasks

- [ ] Atualizar bloco `LUCRO_PRESUMIDO_RET` na edge function `index.ts`
- [ ] Ler `iss_municipality_rate` e `ret_iss_separate` do `tenant_settings`
- [ ] Calcular `effectiveTaxPct` = `ret_rate + (ret_iss_separate ? iss_rate : 0)`
- [ ] Retornar `breakdown` com componentes individuais
- [ ] Suportar `ret_rate_override` por item se campo existir
- [ ] Atualizar `fetchTaxPreview()` em `calc-tax-preview.ts` com mesma lógica
- [ ] Testar: ret_rate=4%, iss=3%, structure=20%, profit=15% → coeficiente=0.58, preço=custo/0.58
- [ ] Garantir backward compatibility: empresas LP RET sem `iss_rate` configurado continuam funcionando (iss_rate = 0)

### File List

- `supabase/functions/calc-tax-engine/index.ts` (modificar)
- `src/utils/calc-tax-preview.ts` (modificar)

---

---

# Story LP-RET-012
## API Routes: Endpoints LP RET Completos

**Status:** Ready
**Prioridade:** Alta (P1)

**Arquivos principais:**
- `src/pages/api/onboarding/complete.ts`
- `src/pages/api/configuracoes/` (ou equivalente)

### Contexto

As API routes de onboarding e configurações precisam persistir corretamente todos os campos LP RET adicionados nas stories anteriores. Atualmente, algumas rotas já suportam LP RET parcialmente, mas com a adição de novos campos (ret_activity_type, ret_iss_separate, ret_estimated_monthly_revenue), todas as rotas precisam ser verificadas e atualizadas.

### Acceptance Criteria

- [ ] `POST /api/onboarding/complete` persiste todos os campos LP RET:
  - `ret_rate` (decimal, ex: 0.04)
  - `ret_activity_type` (string)
  - `ret_iss_separate` (boolean)
  - `ret_estimated_monthly_revenue` (numeric)
  - `iss_municipality_rate` (decimal)
- [ ] Endpoint de configurações (`POST /api/configuracoes` ou equivalente) persiste todos os campos LP RET
- [ ] Nenhum campo LP RET é perdido silenciosamente (sem erro 500 ou ignore silencioso)
- [ ] Validação de tipo: `ret_rate` é número válido entre 0 e 1; `ret_activity_type` é um dos 4 valores permitidos
- [ ] Backward compatibility: campos não enviados usam valores default do banco (não sobrescrevem com null)
- [ ] Resposta da API inclui os campos LP RET atualizados para confirmar persistência

### Tasks

- [ ] Revisar `src/pages/api/onboarding/complete.ts` — adicionar todos os campos LP RET ao UPDATE
- [ ] Verificar endpoint de configurações — adicionar campos LP RET ao update
- [ ] Adicionar validação de `ret_activity_type` (deve ser um dos 4 valores)
- [ ] Adicionar validação de `ret_rate` (0 a 1)
- [ ] Garantir que campos não enviados não sobrescrevem dados existentes
- [ ] Testar onboarding completo LP RET end-to-end

### File List

- `src/pages/api/onboarding/complete.ts` (modificar)
- `src/pages/api/configuracoes/` (verificar e modificar — identificar arquivo exato)

---

---

# Story LP-RET-013
## INSS e ISS Retidos na Fonte: Fluxo de Caixa e Lógica de Retenção

**Status:** Ready
**Prioridade:** Alta (P1)

**Arquivos principais:**
- `src/constants/cashier-category.ts`
- `src/constants/expense-setup-blocks.ts`
- `src/pages/fluxo-de-caixa/` ou equivalente

### Contexto

LP RET para construção civil tem dois mecanismos de **retenção na fonte** que impactam diretamente o fluxo de caixa:

**1. INSS Retido (11%)** — Quando a empresa presta serviço com cessão de mão de obra (empreitada com cessão), o **cliente (tomador)** retém 11% da nota sobre o valor do serviço e recolhe diretamente ao INSS. A empresa recebe o valor **líquido** (sem os 11%).

**Exemplo:**
```
NF emitida: R$ 10.000
INSS retido pelo tomador (11%): R$ 1.100
Valor recebido pela empresa: R$ 8.900

A empresa deve registrar:
- Receita bruta: R$ 10.000
- INSS retido na fonte: R$ 1.100 (saída / dedução)
- Entrada de caixa real: R$ 8.900
```

**2. ISS Retido pelo Tomador** — Em muitos municípios, para serviços de construção, o **tomador** (prefeitura, construtoras grandes, etc.) é responsável pelo ISS. A empresa emite NF com ISS destacado, mas recebe o valor SEM ISS.

**Exemplo:**
```
NF emitida: R$ 10.000
ISS retido pelo tomador (3%): R$ 300
Valor recebido pela empresa: R$ 9.700
```

**3. Código DARF do RET** — O RET é recolhido mensalmente via DARF código **1068**. Cada obra/incorporação tem seu recolhimento separado. O sistema deve exibir essa informação como orientação.

### Acceptance Criteria

- [ ] Nova categoria de fluxo de caixa: `INSS_RETIDO_FONTE` com label "INSS Retido na Fonte (11%)" e grupo `DEDUCAO_RECEITA`
- [ ] Nova categoria: `ISS_RETIDO_TOMADOR` com label "ISS Retido pelo Tomador" e grupo `DEDUCAO_RECEITA`
- [ ] Ao lançar uma entrada de receita para LP RET, exibir checklist opcional:
  - Toggle "INSS foi retido pelo tomador? (cessão de mão de obra)"
  - Toggle "ISS foi retido pelo tomador?"
  - Se marcado, sugere lançamento automático de dedução correspondente
- [ ] Quando `INSS_RETIDO_FONTE` marcado: calcula automaticamente 11% da nota e lança como dedução
- [ ] Quando `ISS_RETIDO_TOMADOR` marcado: calcula ISS pela `iss_municipality_rate` e lança como dedução
- [ ] No relatório do fluxo de caixa, "Receita Líquida LP RET" = receita bruta - INSS retido - ISS retido
- [ ] DRE LP RET (LP-RET-009) inclui linha "(-) INSS Retido na Fonte" nas deduções da receita
- [ ] DRE LP RET inclui linha "(-) ISS Retido pelo Tomador" nas deduções da receita
- [ ] Aviso orientativo no fluxo de caixa: "RET recolhido mensalmente via DARF código 1068 para cada obra/incorporação"
- [ ] O campo `ret_activity_type` = 'CONSTRUCAO_CIVIL' ativa automaticamente a sugestão de INSS retido (pois cessão de mão de obra é mais comum em construção civil)
- [ ] `BLOCK_DESPESAS_LP_RET` (LP-RET-007) inclui as categorias `INSS_RETIDO_FONTE` e `ISS_RETIDO_TOMADOR`

### Tasks

- [ ] Adicionar `INSS_RETIDO_FONTE` em `cashier-category.ts` com grupo `DEDUCAO_RECEITA`
- [ ] Adicionar `ISS_RETIDO_TOMADOR` em `cashier-category.ts` com grupo `DEDUCAO_RECEITA`
- [ ] Atualizar `BLOCK_DESPESAS_LP_RET` em `expense-setup-blocks.ts` com as novas categorias
- [ ] No componente de lançamento de receita (fluxo de caixa), adicionar checklist de retenção para LP RET
- [ ] Implementar cálculo automático de INSS retido (11% da NF) ao marcar toggle
- [ ] Implementar cálculo automático de ISS retido (`iss_municipality_rate` × valor NF) ao marcar toggle
- [ ] Atualizar `buildDrePresumidoRET()` para incluir linhas de INSS retido e ISS retido nas deduções
- [ ] Adicionar aviso textual sobre DARF código 1068 no fluxo de caixa para LP RET
- [ ] Testar: empresa LP RET emite NF R$ 10.000, INSS 11% retido = R$ 1.100 → entrada de caixa = R$ 8.900

### File List

- `src/constants/cashier-category.ts` (modificar — adicionar INSS_RETIDO_FONTE e ISS_RETIDO_TOMADOR)
- `src/constants/expense-setup-blocks.ts` (modificar — atualizar BLOCK_DESPESAS_LP_RET)
- `src/pages/fluxo-de-caixa/` (modificar — checklist de retenção na receita)
- `src/pages/dfc/index.tsx` (modificar — linhas de retenção na DRE, complementar LP-RET-009)

---

---

## Critérios de Aceitação do Epic (Definition of Done)

O epic LP-RET-PARIDADE-SN é considerado **Done** quando:

- [x] **LP-RET-001 Done:** Migration criada (`20260415000003_lp_ret_complete_schema.sql`), campos `ret_rate`, `ret_iss_separate`, `ret_activity_type`, `ret_estimated_monthly_revenue` adicionados + `ret_rate_override` em `items`
- [x] **LP-RET-002 Done:** Onboarding LP RET expandido com `ret_activity_type`, ISS municipal, receita estimada, breakdown e aviso RET
- [x] **LP-RET-003 Done:** Tab configurações LP RET com select de atividade, cards de carga tributária, breakdown IRPJ/CSLL/PIS/COFINS/ISS, toggle ISS separado
- [ ] **LP-RET-004 Done:** Produtos LP RET têm mesmo breakdown e precificação correta
- [x] **LP-RET-005 Done:** Serviços LP RET incluem LP RET em `isLRorLPSvcComp` (ISS separado via `iss_municipality_rate`)
- [ ] **LP-RET-006 Done:** Itens LP RET têm formulário completo com campos específicos
- [x] **LP-RET-007 Done:** `BLOCK_DESPESAS_LP_RET` criado em `expense-setup-blocks.ts` com todas as categorias LP RET
- [ ] **LP-RET-008 Done:** Fluxo de caixa LP RET suporta todas as categorias do regime
- [x] **LP-RET-009 Done:** DRE LP RET reescrita com linhas completas (NBC TG 26): receita bruta → deduções → receita líquida → CPV → resultado bruto → operacional → líquido
- [x] **LP-RET-010 Done:** `computeTaxableRegimeValue()` em `auth.context.tsx` retorna `ret_rate + iss_rate` para LP RET
- [x] **LP-RET-011 Done:** Engine `calc-tax-engine` e `calc-tax-preview` calculam RET + ISS separados com breakdown completo (IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41% + ISS municipal)
- [x] **LP-RET-012 Done:** `onboarding/complete.ts` persiste todos os campos LP RET com fallback gracioso
- [x] **LP-RET-013 Done:** Categorias `INSS_RETIDO_FONTE` e `ISS_RETIDO_TOMADOR` criadas (`DEDUCAO_RECEITA`); DRE LP RET inclui linha de deduções de receita; `aggregateEntries()` processa grupo `DEDUCAO_RECEITA`
- [ ] **Testes End-to-End:** Fluxo completo LP RET (onboarding → produto → serviço → fluxo de caixa → DRE) funciona sem erros
- [ ] **Créditos PIS/COFINS bloqueados:** Formulário de itens bloqueia créditos PIS/COFINS para LP RET
- [x] **Aviso "por obra":** Onboarding e configurações exibem aviso sobre natureza por obra/incorporação do RET
- [ ] **Simples Nacional intacto:** Nenhuma regressão em funcionalidades SN
- [ ] **Lucro Presumido intacto:** Nenhuma regressão em funcionalidades LP normal

---

## Mapa de Arquivos do Epic

### Arquivos a Criar

| Arquivo | Story | Descrição |
|---------|-------|-----------|
| `supabase/migrations/20260415000003_lp_ret_complete_schema.sql` | LP-RET-001 | Migration SQL com todos os campos LP RET em tenant_settings |
| `src/page-parts/services/service-price.component.tsx` | LP-RET-005 | Novo componente de breakdown de preço para serviços (análogo ao product-price) |

### Arquivos a Modificar

| Arquivo | Stories | Modificações |
|---------|---------|--------------|
| `src/supabase/database.types.ts` | LP-RET-001 | Regenerar após migration |
| `src/pages/onboarding.tsx` | LP-RET-002 | Fluxo completo LP RET |
| `src/pages/api/onboarding/complete.ts` | LP-RET-002, LP-RET-012 | Persistir campos LP RET |
| `src/pages/configuracoes/index.tsx` | LP-RET-003 | Tab tributária completa |
| `src/page-parts/products/content.component.tsx` | LP-RET-004 | Campos e breakdown LP RET |
| `src/page-parts/products/product-price.component.tsx` | LP-RET-004 | Preview preço LP RET |
| `src/pages/produtos/index.tsx` | LP-RET-004 | Badge e lista LP RET |
| `src/page-parts/services/content.component.tsx` | LP-RET-005 | ISS separado |
| `src/pages/servicos/index.tsx` | LP-RET-005 | Badge e lista LP RET |
| `src/page-parts/items/` | LP-RET-006 | Formulário itens LP RET |
| `src/constants/expense-setup-blocks.ts` | LP-RET-007 | BLOCK_DESPESAS_LP_RET |
| `src/constants/cashier-category.ts` | LP-RET-007 | Categorias LP RET |
| `src/pages/fluxo-de-caixa/` | LP-RET-008 | Categorias e entradas LP RET |
| `src/components/cashflow-setup-modal.component.tsx` | LP-RET-008 | Setup LP RET |
| `src/pages/dfc/index.tsx` | LP-RET-009 | DRE completa LP RET |
| `src/contexts/auth.context.tsx` | LP-RET-010 | Alíquota total LP RET |
| `src/pages/dashboard/` | LP-RET-010 | Widgets LP RET |
| `supabase/functions/calc-tax-engine/index.ts` | LP-RET-011 | RET + ISS separados |
| `src/utils/calc-tax-preview.ts` | LP-RET-011 | Preview com breakdown |
| `src/pages/api/configuracoes/` | LP-RET-012 | Endpoints LP RET |
| `src/constants/cashier-category.ts` | LP-RET-007, LP-RET-013 | INSS_RETIDO_FONTE, ISS_RETIDO_TOMADOR |
| `src/constants/expense-setup-blocks.ts` | LP-RET-007, LP-RET-013 | BLOCK_DESPESAS_LP_RET atualizado |

---

## Referências

- **Lei 10.931/2004** — Define o Regime Especial de Tributação (RET) para incorporação imobiliária
- **Lei 12.844/2013** — Possíveis atualizações nas alíquotas do RET. **Validar com contador se as alíquotas 4,00% ainda são vigentes para o segmento do cliente.**
- **Instrução Normativa RFB 1.435/2013** — Regulamenta o RET
- **IN RFB 971/2009** — Regulamenta a retenção de INSS (11%) para cessão de mão de obra
- **Tabela de Alíquotas RET (Lei 10.931/2004):** IRPJ 1,71% + CSLL 0,51% + PIS/Pasep 0,37% + COFINS 1,41% = **4,00%** ⚠️ *Confirmar vigência com contador*
- **DARF Código 1068** — Código de recolhimento do RET mensalmente por obra/incorporação
- **Epic de referência:** `docs/stories/epic-lp-paridade-lr.md` (LP x LR) — seguir mesmo padrão de implementação
- **Mapeamento técnico Simples Nacional:** Ver análise completa em memória do projeto
