# QA — Critérios de Aceite e Casos de Teste — Melhorias Maio/2026

**Autor:** Quinn (@qa)
**Data:** 2026-05-16
**Sprint:** Melhorias-Mai2026
**Stack:** Next.js + TypeScript + Supabase + Jest
**Escopo:** 4 ajustes (MO Administrativa espelhada do HUB, Ponto de Equilíbrio, Relatório de Comissões, Desconto Lucro Real)

---

## 1. Sumário (estratégia geral)

A estratégia combina (a) testes unitários determinísticos sobre as funções puras de cálculo (`breakeven-calculator.ts`, `commission-calc.ts`, `calculate-discount.ts`, `recalc-expense-config.ts`), (b) testes de integração sobre `hub-engine` e o pipeline HUB → recálculo → UI, e (c) E2E manual cobrindo dashboard, criação de produto/serviço, relatório de comissões e fluxos de orçamento/agenda no regime Lucro Real. O ajuste 2 (PE) é a prioridade máxima e exige um teste unitário com o exemplo numérico real do usuário (294.621 → 295.700) para travar a regressão definitivamente. Bug crítico de "Invalid Date" no relatório de comissões é classificado como blocker. Cada ajuste tem critérios Given/When/Then, casos manuais numerados em PT-BR, testes unitários sugeridos, regressões, dados de teste e casos negativos. Veredicto final do gate depende da combinação destes resultados conforme a seção 7.

---

## 2. Riscos por ajuste

| Ajuste | Risco | Justificativa |
|--------|-------|---------------|
| 1 — MO Administrativa espelha HUB | **Médio** | Mudança em camada de configuração (`recalc-expense-config.ts`) afeta todos os produtos e serviços; precisa garantir reatividade sem recarregar página. Baixo risco de cálculo, alto risco de UX/cache. |
| 2 — Ponto de Equilíbrio | **Alto** | Métrica financeira central no dashboard. Fórmula validada manualmente pelo usuário com exemplo real; um erro silencioso já está em produção. Mudança em `taxesInsidePct`/`commissionPct` afeta inputs do HUB e pode propagar viés a relatórios derivados. |
| 3 — Relatório de Comissões | **Alto** | 3 bugs simultâneos (data inválida, valores zerados e responsividade). "Invalid Date" quebra exportação PDF/Excel. Fallback de comissão exige acesso a `employees.commission_percent` — risco de violar RLS se não cuidado. |
| 4 — Desconto Lucro Real | **Alto** | Mudança semântica do `discountPercent` (era % da margem; passa a ser % do preço apenas em LR). Impacto direto em orçamentos e agenda (faturamento). Precisa preservar regimes Simples/Presumido sem alteração. Recálculo de ICMS/PIS/COFINS "por dentro" é matematicamente sensível. |

---

## 3. AJUSTE 1 — MO Administrativa em Produtos/Serviços espelha HUB

**Arquivos impactados:** `src/utils/recalc-expense-config.ts:71-74`, `src/pages/index.tsx:114`, `src/page-parts/products/product-price.component.tsx:86`, `src/page-parts/products/content-service.tsx:72`.

### 3.1 Critérios de Aceitação Funcionais (Given/When/Then)

1. **GIVEN** o HUB do tenant tem grupo `MAO_DE_OBRA_ADMINISTRATIVA` com soma R$ 5.000 e faturamento médio R$ 100.000, **WHEN** o usuário abre a tela de criação de produto, **THEN** o campo de MO Administrativa exibe 5,00% e está em modo somente-leitura.
2. **GIVEN** usuário está em `/produtos/criar`, **WHEN** clica no input MO Administrativa, **THEN** o campo não permite edição manual (atributo `readOnly` ou `disabled`) e nenhum erro é lançado ao foco.
3. **GIVEN** usuário tem o produto aberto na aba A, **WHEN** outro lançamento de MO Administrativa de R$ 1.000 é registrado no HUB (aba B) e o usuário volta para aba A, **THEN** o produto atualiza o percentual MO Administrativa automaticamente para 6,00% sem reload manual.
4. **GIVEN** novo serviço sendo cadastrado em `content-service.tsx`, **WHEN** o cadastro é salvo, **THEN** o valor persistido reflete o percentual derivado do HUB no momento do save, e o servidor não aceita override manual.
5. **GIVEN** HUB com grupo `MAO_DE_OBRA_ADMINISTRATIVA` zerado, **WHEN** dashboard é renderizado, **THEN** percentual MO Administrativa em produtos = 0,00% e cálculo de coeficiente segue íntegro (não quebra divisão por zero).
6. **GIVEN** tenant sem registros no HUB ainda, **WHEN** usuário acessa Produtos, **THEN** sistema mostra MO Administrativa = 0,00% com tooltip/aviso "Configure o HUB para ativar este percentual" e não trava a tela.

### 3.2 Casos de Teste Manual (E2E)

1. Logar com usuário admin do tenant.
2. Abrir `/hub` em uma aba.
3. Verificar valor atual do grupo `MAO_DE_OBRA_ADMINISTRATIVA` (anote total).
4. Abrir `/produtos/criar` em outra aba.
5. Conferir que MO Administrativa aparece preenchida e bloqueada.
6. Voltar ao HUB e adicionar lançamento de R$ 1.000 no grupo.
7. Sem recarregar, voltar à aba do produto e observar (aguardar até 3s) a atualização do percentual.
8. Repetir teste para `/servicos/criar` com o componente `content-service.tsx`.
9. Tentar digitar no campo MO Administrativa — confirmar que nada é aceito.
10. Repetir steps com tenant zerado.

### 3.3 Testes Unitários Sugeridos

- `recalc-expense-config.adminLabor.spec.ts` → `recalcExpenseConfig` deve derivar `indirect_labor_percent` exclusivamente do `MAO_DE_OBRA_ADMINISTRATIVA` do HUB ignorando qualquer override.
- `recalc-expense-config.adminLabor.zero.spec.ts` → quando HUB não tem entradas no grupo, retorna 0 e não quebra (`NaN` proibido).
- `recalc-expense-config.adminLabor.update.spec.ts` → reagregar quando o HUB é atualizado entre duas chamadas consecutivas.
- `recalc-expense-config.adminLabor.precision.spec.ts` → cálculo arredonda a 2 casas decimais e nunca retorna negativo.

### 3.4 Testes de Regressão

- Cálculo de coeficiente final em `product-price.component.tsx` deve permanecer correto.
- Outros campos derivados do HUB (MO Produtiva, Despesas Fixas) não podem ser afetados.
- Edição de produto existente (não criação) precisa continuar carregando valor atualizado.
- Permissões: usuário sem acesso ao HUB ainda deve poder visualizar produto com valor herdado.

### 3.5 Dados de Teste

- Cenário A: HUB 5.000 + faturamento 100.000 → 5,00%
- Cenário B: HUB 0 → 0,00%
- Cenário C: HUB 12.345,67 + faturamento 234.567,89 → ~5,26%
- Cenário D: faturamento médio zero (mês inicial) → 0,00% sem crash

---

## 4. AJUSTE 2 — Ponto de Equilíbrio (PRIORIDADE MÁXIMA)

**Arquivos impactados:** `src/utils/breakeven-calculator.ts:36-115`, `src/utils/hub-engine.ts:405-434`, `src/utils/recalc-expense-config.ts:36-152`, `src/pages/index.tsx:299-345,681-698`.

### 4.1 Critérios de Aceitação Funcionais (Given/When/Then)

1. **GIVEN** HUB com produtos=57,64%, despesas variáveis=6,12%, comissões=2,58%, impostos sobre faturamento=1,14%, despesas financeiras=0,43%, MO Produtiva=11,68%, MO Adm=10,51%, despesas fixas=10,01% e faturamento médio R$ 294.621, **WHEN** dashboard calcula PE, **THEN** valor exibido é R$ 295.700 ± R$ 100.
2. **GIVEN** mesmo cenário acima, **WHEN** o usuário inspeciona MC, **THEN** valor é 32,09% ± 0,1%.
3. **GIVEN** usuário sem configuração de regime tributário cadastrada manualmente, **WHEN** PE é calculado, **THEN** `taxesInsidePct` vem de `hub_average_revenue / impostos sobre faturamento` do HUB, NÃO de `taxableRegimeValue` do cadastro do usuário.
4. **GIVEN** dashboard renderizado, **WHEN** usuário passa o mouse sobre o tooltip do card PE, **THEN** o texto "(abra o console F12 para ver os valores)" NÃO está mais presente.
5. **GIVEN** página `/` é carregada em produção, **WHEN** o usuário abre DevTools, **THEN** não há `console.warn('[PE]...'` na aba console.
6. **GIVEN** faturamento médio HUB = 0, **WHEN** PE é renderizado, **THEN** exibe "—" e mensagem amigável "Faturamento médio do HUB indisponível".
7. **GIVEN** soma de variáveis ≥ 100% (MC ≤ 0), **WHEN** PE é renderizado, **THEN** exibe "—" sem crash.
8. **GIVEN** `commissionPct` derivado do HUB muda (ex.: passa de 2,58% para 3%), **WHEN** dashboard é re-renderizado, **THEN** PE recalcula automaticamente sem reload.

### 4.2 Casos de Teste Manual (E2E)

1. Logar como usuário com HUB populado (conforme cenário do critério 1).
2. Abrir o dashboard `/`.
3. Conferir card "Ponto de Equilíbrio" — esperado R$ 295.700.
4. Posicionar o mouse no tooltip de PE — confirmar AUSÊNCIA do texto "(abra o console F12...)".
5. Abrir DevTools (F12) → Console → recarregar página — confirmar AUSÊNCIA de logs `[PE]`.
6. Alterar percentual de comissões no HUB para 3% — voltar ao dashboard e verificar que PE muda coerentemente (cai um pouco, pois variáveis sobem).
7. Zerar o HUB de faturamento e conferir que PE exibe "—".
8. Restaurar HUB e revalidar valor de 295.700.
9. Repetir o teste 1 com regime tributário do cadastro do usuário propositalmente errado (ex.: 30%) — confirmar que PE continua usando o HUB.

### 4.3 Testes Unitários Sugeridos

- `breakeven-calculator.userExample.spec.ts` → reproduz exemplo real do usuário:
  - Input: `productCostPct=57.64, variableExpensePct=6.12, commissionPct=2.58, taxesInsidePct=1.14, financialExpensePct=0.43, productionLaborPct=11.68, adminLaborPct=10.51, fixedExpensePct=10.01, averageRevenue=294621`
  - Esperado: `breakeven ≈ 295700 ± 100`, `marginOfContribution ≈ 0.3209`, `fixedCostMonthly ≈ 94900`.
- `breakeven-calculator.invalidRevenue.spec.ts` → faturamento médio 0 retorna `{ isValid:false, breakeven:null, reason:'Faturamento médio do HUB indisponível...' }`.
- `breakeven-calculator.marginNegative.spec.ts` → soma de variáveis ≥ 100 retorna `{ isValid:false }`.
- `breakeven-calculator.zeroFixed.spec.ts` → custos fixos zerados retornam `{ isValid:false }`.
- `recalc-expense-config.hubDerivedInputs.spec.ts` → confirma que `commissionPct` e `taxesInsidePct` em `buildBreakevenInputFromConfig` vêm das fontes do HUB e não da configuração cadastrada do usuário.
- `hub-engine.averageRevenue.spec.ts` → garante que `hub_average_revenue` retorna a média mensal dos meses fechados (mínimo 4 testes: 0 meses, 1 mês, 3 meses parciais, 12 meses fechados).

### 4.4 Testes de Regressão

- Card de PE no dashboard renderiza em <300ms (não introduzir re-render-loop).
- Cálculo de coeficiente de precificação (`product-price.component.tsx`) não pode mudar.
- DRE e Caixa não podem alterar valores como efeito colateral.
- API `/api/dashboard/*` não pode mudar contrato.

### 4.5 Dados de Teste

- **Cenário canônico (usuário):** entradas conforme item 4.1 critério 1 → PE 295.700.
- Cenário B: MC 50%, fixos R$ 50.000 → PE R$ 100.000.
- Cenário C: MC = 0 (variáveis 100%) → "—".
- Cenário D: averageRevenue=0 → "—".
- Cenário E: fixos zerados → "—".

---

## 5. AJUSTE 3 — Relatório de Comissões

**Arquivos impactados:** `src/pages/relatorio-vendas/index.tsx:540-662,1560-1730`, `src/utils/commission-calc.ts:33-56`.

### 5.1 Critérios de Aceitação Funcionais (Given/When/Then)

1. **GIVEN** venda com `sale_date` válido, **WHEN** relatório de comissões é exibido, **THEN** coluna "Data" mostra `DD/MM/YYYY` e nunca "Invalid Date".
2. **GIVEN** venda com `sale_date = null` ou inválido, **WHEN** relatório é renderizado, **THEN** coluna "Data" mostra "—" (não "Invalid Date" e não crash).
3. **GIVEN** venda com `sale.commission_amount=0` e `sale_items.commission_percent=0`, **WHEN** o vendedor associado tem `employees.commission_percent=5`, **THEN** a coluna "% Comissão" exibe 5% e "R$ Comissão" exibe 5% × `final_value`.
4. **GIVEN** venda com `sale.commission_amount > 0`, **WHEN** relatório é renderizado, **THEN** o valor exibido é `commission_amount` (prioridade sobre fallback).
5. **GIVEN** acesso pelo mobile (≤480px) ou viewport reduzido, **WHEN** o usuário abre o relatório, **THEN** a tabela é responsiva (scroll horizontal contido OU layout colapsado em cards, conforme padrão das outras listagens).
6. **GIVEN** o usuário clica em "Exportar PDF" ou "Exportar Excel", **WHEN** o arquivo é gerado, **THEN** todas as 7 colunas cabem na largura do papel/planilha sem cortes e nenhuma célula mostra "Invalid Date".
7. **GIVEN** vendedor não cadastrado em `employees`, **WHEN** o relatório é montado, **THEN** o fallback retorna 0% sem crashar e mostra "—" para o vendedor.

### 5.2 Casos de Teste Manual (E2E)

1. Logar como admin.
2. Criar 3 vendas de teste:
   - Venda A: `commission_amount=100`, `final_value=2.000`.
   - Venda B: `commission_amount=0`, item com `commission_percent=10`, `final_value=500`.
   - Venda C: `commission_amount=0`, item com `commission_percent=0`, vendedor com `employees.commission_percent=4`, `final_value=1.000`.
3. Forçar uma venda D com `sale_date=null` via SQL.
4. Acessar `/relatorio-vendas` aba "Comissões".
5. Validar coluna Data: A/B/C com formato `DD/MM/YYYY`, D com "—".
6. Validar coluna % Comissão: A=5%, B=10%, C=4%, D consistente.
7. Validar coluna R$ Comissão: A=100, B=50, C=40, D consistente.
8. Reduzir viewport para 375px e confirmar responsividade.
9. Exportar PDF e Excel — abrir e validar que todas as colunas cabem.
10. Tentar uma venda com vendedor deletado/null em `employees` → confirmar "—".

### 5.3 Testes Unitários Sugeridos

- `commission-calc.fallbackEmployees.spec.ts` → quando `sale.commission_amount=0` e itens com `commission_percent=0`, função aceita parâmetro adicional `employeeDefaultPercent` e o aplica sobre `final_value`.
- `commission-calc.priority.spec.ts` → `sale.commission_amount > 0` tem prioridade sobre fallback de itens e de employees.
- `commission-calc.hasData.spec.ts` → quando nenhum dado existe (nenhum fallback), `hasData=false` e `comissaoPaga=0`.
- `commission-calc.invalidNumbers.spec.ts` → strings, null e undefined em quantity/unit_price/commission_percent não geram NaN.
- `relatorio-vendas.date-format.spec.ts` (integration) → `dayjs(v + 'T00:00:00')` com `v=null/''/'invalid'` retorna "—" e não "Invalid Date".

### 5.4 Testes de Regressão

- Total geral do relatório (soma `final_value`) não pode mudar.
- Filtros de período (data inicial/final) continuam funcionando.
- Filtro por vendedor continua filtrando.
- Outras abas do `/relatorio-vendas` (ex.: produtos, geral) sem regressão.
- RLS: usuário com acesso restrito não pode ver vendas de outros vendedores.

### 5.5 Dados de Teste

- Venda A: `id=1`, `sale_date=2026-05-10`, `final_value=2000`, `commission_amount=100`.
- Venda B: `id=2`, `sale_date=2026-05-11`, `final_value=500`, items=[{qty:1, unit_price:500, commission_percent:10}].
- Venda C: `id=3`, `sale_date=2026-05-12`, `final_value=1000`, items=[{qty:1, unit_price:1000, commission_percent:0}], vendedor com `commission_percent=4`.
- Venda D: `id=4`, `sale_date=null`, `final_value=300` (esperar "—" na data).

---

## 6. AJUSTE 4 — Desconto Lucro Real (orçamento + agenda)

**Arquivos impactados:** `src/utils/calculate-discount.ts:1-50`, `src/pages/orcamentos/index.tsx:444-509,1922-1967`, `src/pages/agenda/index.tsx:130-131,25`, `src/page-parts/products/product-price.component.tsx:126-132` (referência ICMS/PIS por dentro).

### 6.1 Critérios de Aceitação Funcionais (Given/When/Then)

1. **GIVEN** tenant com regime `LUCRO_REAL`, **WHEN** aplico 5% de desconto sobre preço R$ 200 em orçamento, **THEN** novo preço = R$ 190 (200 × 0,95) — desconto é % do preço, NÃO % da margem.
2. **GIVEN** mesmo cenário do critério 1, **WHEN** o sistema recalcula impostos, **THEN** ICMS por dentro é recalculado sobre R$ 190 e PIS/COFINS por dentro também é recalculado sobre R$ 190.
3. **GIVEN** desconto de 10% em orçamento LR onde comissão=4% e lucro=3%, **WHEN** valido a regra, **THEN** sistema bloqueia o desconto e exibe mensagem "Desconto não pode exceder comissão+lucro (4% + 3% = 7%)".
4. **GIVEN** desconto de 5% em orçamento LR onde comissão=4% e lucro=3%, **WHEN** salvo o orçamento, **THEN** redução é absorvida proporcionalmente: comissão final ≈ 4% × (1 − 5/7) = 1,14%; lucro final ≈ 3% × (1 − 5/7) = 0,86%.
5. **GIVEN** tenant com regime `SIMPLES_NACIONAL` ou `LUCRO_PRESUMIDO`, **WHEN** aplico desconto, **THEN** comportamento permanece igual ao atual (`% da margem` com modo PROPORTIONAL/PROFIT/SELLER) — nenhum cálculo regrede.
6. **GIVEN** atendimento de serviço em `/agenda` para tenant LR sendo concluído com desconto de 5%, **WHEN** confirmo a finalização, **THEN** o preço final aplicado segue regra LR (5% direto sobre preço) e impostos recalculados.
7. **GIVEN** orçamento LR com 3 itens e desconto de 5% global, **WHEN** salvo, **THEN** o desconto é aplicado item-a-item (proporcional ao preço de cada item), mantendo o total coerente com a regra LR.
8. **GIVEN** desconto = 0, **WHEN** salvo, **THEN** nenhum recálculo ocorre e o preço final é igual ao original.

### 6.2 Casos de Teste Manual (E2E)

1. Configurar tenant com `LUCRO_REAL`.
2. Criar produto P1 com preço R$ 200, comissão 4%, lucro 3%, ICMS 18% por dentro, PIS+COFINS 9,25% por dentro.
3. Abrir `/orcamentos` → novo orçamento → adicionar P1 → aplicar desconto 5%.
4. Validar preço final = R$ 190 e impostos recalculados sobre R$ 190.
5. Conferir comissão e lucro reduzidos proporcionalmente.
6. Tentar desconto 10% — deve bloquear (4+3=7%).
7. Salvar orçamento e exportar PDF — validar valores.
8. Mudar tenant para `SIMPLES_NACIONAL` e repetir step 3-5: comportamento velho preservado.
9. Voltar a LR. Acessar `/agenda` → finalizar serviço com desconto 5% → validar mesma regra.
10. Repetir cenário com 3 itens de preços distintos no orçamento.

### 6.3 Testes Unitários Sugeridos

- `calculate-discount.lucroReal.basic.spec.ts` → `calculateDiscountedPriceLR(200, taxesByInPct, 5, commission=4, profit=3)` retorna `finalPrice=190` e recálculos esperados.
- `calculate-discount.lucroReal.validation.spec.ts` → desconto > comissão+lucro lança erro / retorna `{ valid:false, reason:'EXCEEDS_MARGIN' }`.
- `calculate-discount.lucroReal.proportional.spec.ts` → reduções proporcionais conferem com fórmula `delta_i = original_i × (5/7)`.
- `calculate-discount.regimeGuard.spec.ts` → quando regime != LR, função antiga `calculateDiscountedPrice` é a usada (smoke test).
- `calculate-discount.taxesInsideRecompute.spec.ts` → ICMS por dentro `(novoPreço × aliq)/(1 − aliq)` re-calculado corretamente; valida fórmula clássica de imposto por dentro.

### 6.4 Testes de Regressão

- Regimes Simples e Presumido não podem ter mudança de comportamento.
- Cálculo de coeficiente de produto (não é desconto) permanece.
- DRE/Caixa não podem ter efeitos colaterais.
- Histórico de orçamentos antigos não pode reabrir com valores diferentes.

### 6.5 Dados de Teste

- Cenário LR-1: preço 200, comissão 4%, lucro 3%, desconto 5% → finalPrice 190; comissão final 1,14% (R$ 2,17); lucro final 0,86%.
- Cenário LR-2: preço 1.000, comissão 6%, lucro 4%, desconto 8% → finalPrice 920; redução absorvida 8/10 = 80% (comissão final 1,2%, lucro final 0,8%).
- Cenário LR-bloqueio: preço 200, comissão 2%, lucro 1%, desconto 5% → bloquear (5 > 3).
- Cenário Simples-controle: preço 200, desconto 5% no regime SIMPLES_NACIONAL → comportamento atual (% da margem) preservado.
- Cenário agenda LR-1: igual ao LR-1 mas via `/agenda`.

---

## 7. Gate QA por sprint

| Veredicto | Condições |
|-----------|-----------|
| **PASS** | Todos os critérios funcionais (AC) verdes; 100% dos testes unitários sugeridos implementados e verdes; build/lint/typecheck OK; nenhum smoke test bloqueado; teste canônico de PE (294.621 → 295.700) passa; nenhuma regressão em regimes Simples/Presumido. |
| **CONCERNS** | AC essenciais verdes mas com até 2 AC não-essenciais falhando (ex.: responsividade mobile cosmética); cobertura unitária < 100% mas ≥ 75% por ajuste; pequenas mudanças de UX pendentes; performance de PE > 500ms (aceitável até 1s temporariamente). |
| **FAIL** | Qualquer um dos itens abaixo: (a) PE não bate com exemplo do usuário (≥ ±100), (b) "Invalid Date" persiste em qualquer linha do relatório de comissões, (c) regime Simples/Presumido sofreu regressão no desconto, (d) MO Administrativa ainda exige reload manual, (e) build/lint/typecheck falham, (f) console.warn/tooltip de F12 ainda presente. |

---

## 8. Checklist de regressão geral antes de Done

- [ ] `npm run build` passa sem erros.
- [ ] `npm run lint` passa sem warnings críticos.
- [ ] `npm run typecheck` passa.
- [ ] Suíte Jest existente continua verde (`npm test`).
- [ ] Smoke test no dashboard: PE aparece (valor correto), MO Admin atualiza sem reload, Comissão renderiza com data válida, Desconto LR funciona.
- [ ] Nenhum `console.warn`/`console.log` novo deixado em produção.
- [ ] Mensagens de erro/aviso em PT-BR.
- [ ] Exportação PDF/Excel do relatório de comissões cabe em A4.
- [ ] RLS e permissões: testar com usuário `user` (não admin) — sem regressão de acesso.
- [ ] Mobile (375px e 414px): dashboard e relatórios responsivos.

---

## 9. Casos negativos por ajuste (o que NÃO deve acontecer)

### 9.1 Ponto de Equilíbrio
- ❌ NÃO deve voltar a usar `taxableRegimeValue` do cadastro do usuário em `buildBreakevenInputFromConfig`.
- ❌ NÃO deve haver `console.warn('[PE]...')` em `src/pages/index.tsx:320`.
- ❌ NÃO deve haver tooltip "(abra o console F12 para ver os valores)" em `src/pages/index.tsx:683`.
- ❌ NÃO deve calcular PE quando `marginOfContribution ≤ 0` (deve exibir "—").
- ❌ NÃO deve aceitar `averageRevenue` negativo (sanitizar para 0 ou retornar `isValid:false`).

### 9.2 MO Administrativa
- ❌ NÃO deve permitir digitar/colar valor manual no campo MO Administrativa em `product-price.component.tsx` nem em `content-service.tsx`.
- ❌ NÃO deve persistir overrides no banco para `indirect_labor_percent`.
- ❌ NÃO deve exigir reload da página para refletir mudança no HUB.
- ❌ NÃO deve quebrar quando o HUB está vazio (deve mostrar 0%).

### 9.3 Comissão
- ❌ NÃO deve mostrar "Invalid Date" em nenhuma coluna em nenhuma exportação.
- ❌ NÃO deve exibir comissão zerada quando o vendedor tem `employees.commission_percent` configurado.
- ❌ NÃO deve forçar scroll horizontal > 1× viewport em mobile (≤480px).
- ❌ NÃO deve crashar em vendedor null/inexistente — fallback retorna "—".
- ❌ NÃO deve violar RLS ao consultar `employees`.

### 9.4 Desconto Lucro Real
- ❌ NÃO deve permitir `desconto% > comissão% + lucro%` (deve bloquear com mensagem).
- ❌ NÃO deve aplicar a regra LR em regimes Simples ou Presumido (devem manter `% da margem` atual).
- ❌ NÃO deve esquecer de recalcular ICMS/PIS/COFINS por dentro sobre o novo preço.
- ❌ NÃO deve persistir desconto negativo.
- ❌ NÃO deve alterar histórico de orçamentos antigos já salvos.

---

## 10. Bullets dos testes mais críticos

- **Teste canônico de PE com exemplo do usuário** (`breakeven-calculator.userExample.spec.ts`): inputs 57,64/6,12/2,58/1,14/0,43/11,68/10,51/10,01 + averageRevenue=294621 → PE ≈ 295.700 ± 100, MC ≈ 32,09%, fixos ≈ R$ 94.900. Trava regressão da prioridade máxima.
- **Origem dos inputs do PE** (`recalc-expense-config.hubDerivedInputs.spec.ts`): garante que `taxesInsidePct` e `commissionPct` vêm do HUB, NÃO de `taxableRegimeValue`/configuração manual do usuário. Esse é o bug raiz do ajuste 2.
- **"Invalid Date" extinto no relatório de comissões** (`relatorio-vendas.date-format.spec.ts`): cobre `dayjs(null + 'T00:00:00')`, `''`, `'invalid'` retornando "—". Bloqueia exportação corrompida (ajuste 3, bug #1).
- **Fallback de comissão para employees** (`commission-calc.fallbackEmployees.spec.ts`): com `sale.commission_amount=0` e itens com `commission_percent=0`, usa `employees.commission_percent` como % final. Bloqueia ajuste 3, bug #2.
- **Desconto LR não pode exceder comissão+lucro** (`calculate-discount.lucroReal.validation.spec.ts`): valida bloqueio quando `discountPercent > commission+profit` e garante recálculo correto de ICMS/PIS/COFINS por dentro sobre o novo preço para regime LUCRO_REAL apenas, sem regressão nos outros regimes.

---

**Arquivo criado:** `C:\Users\mathe\OneDrive\Área de Trabalho\precificacerto-netlify\docs\qa\qa-criterios-melhorias-mai2026.md`
