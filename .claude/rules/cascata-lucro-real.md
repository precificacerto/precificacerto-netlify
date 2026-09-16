# Regras da Cascata do Orçamento — Lucro Real

**Escopo.** Vale para tenants em **Lucro Real**, nos três segmentos da cadeia:
industrialização, revenda/varejo e prestação de serviço. Fora do Lucro Real a
cascata tributária muda e estas regras não se aplicam — a regra do Simples
Nacional e MEI é outra, e já está escrita.

**Estado no código, medido em 14/09/2026.** O Lucro Real **já roda**: 87 dos 109
registros de `pricing_calculations` são `LUCRO_REAL`, contra 18 do Simples e 4 do
MEI. É o regime dominante e **nunca teve a regra escrita** — só o Simples e o MEI
tiveram. Este arquivo corrige essa assimetria: documenta o que já existe e fixa o
que precisa mudar.

---

## Parte 0 — A matriz é a fonte única

Duas raízes determinam o formato da construção: o **regime tributário** e o
**segmento da cadeia**. Elas definem quais impostos existem e de que lado da
operação cada um fica.

| Imposto | Industrialização | Revenda / Varejo | Prestação de serviço |
|---|---|---|---|
| ICMS | POR DENTRO | POR DENTRO | INEXISTENTE |
| ISS | INEXISTENTE | INEXISTENTE | POR DENTRO |
| PIS/COFINS | POR DENTRO | POR DENTRO | POR DENTRO |
| IPI | POR FORA | INEXISTENTE | INEXISTENTE |
| IS | POR FORA | POR FORA | INEXISTENTE |
| IBS | POR FORA | POR FORA | POR FORA |
| CBS | POR FORA | POR FORA | POR FORA |

**INEXISTENTE não é zero.** Zero é uma alíquota que resulta em valor nulo mas
ocupa linha, entra em soma e aparece na decomposição. Inexistente não tem linha.
Tratar os dois como a mesma coisa é o que permite que uma alíquota de ICMS
vaze para um orçamento de serviço sem que nada falhe.

**A construção lê a matriz. A decomposição lê A MESMA matriz.** A decomposição
não infere de que lado um imposto está — ela lê. Divergência entre as duas é
erro, e o teste tem de prová-lo, não confiar.

### Segmento também decide o que é custo e o que é margem

| Categoria | Industrialização | Revenda | Serviço |
|---|---|---|---|
| Custo líquido do item | Custo | Custo | Custo |
| MO produtiva | Custo, se Principal | Não se aplica | Custo, se Principal |
| MO indireta | Margem de contribuição | Margem de contribuição | **Custo** |
| Despesa fixa | Margem de contribuição | Margem de contribuição | **Custo** |

No serviço, MO indireta e despesa fixa entram no custo em R$ e ficam **fora** da
margem de contribuição. Nunca nos dois lugares — isso é dupla contagem.
`structurePctForEngine` já implementa essa exclusão; o comentário dela foi
corrigido no #14. Ela é uma constante local em
`src/page-parts/products/content.component.tsx:751` e alimenta `calculatePricing` —
**não é o divisor da cascata**. Ver Parte 4.

### Principal e Secundária

`products.product_type` = `PRODUZIDO` é Principal; `REVENDA` é Secundária.
Secundária tem só o custo do item, sem nenhuma mão de obra. No segmento
Revenda/Varejo todo item é secundário por definição — o seletor não deve existir.

---

## Parte 1 — Construção (R1 a R9)

**R1 · Fragmentação.** Cada produto entra individualmente. Itens lançados como
manual ficam fora do motor e entram só como valor não distribuível.

**R2 · Custo líquido.** `custo_líquido = custo de aquisição − tributos
recuperáveis`. Tributos não recuperáveis permanecem como custo. A fonte é
`items.cost_net`, gravada contra `items.cost_gross`.

> **Medição:** `item_tax_credits` tem 0 linhas e
> `pricing_calculations.total_credit_icms/pis_cofins/ipi/cbs/ibs` estão zerados
> em 100% dos 87 cálculos de Lucro Real. São estrutura paralela **não usada**.
> O crédito real vive em `items.cost_net`. Enquanto isso não for unificado,
> ler `total_credit_*` devolve zero e produz custo bruto silenciosamente.

**R3 · Coeficiente da operação por fora (c).** Cada imposto por fora tem base
própria. A base é linear em `c`, o que permite solução algébrica — **sem
referência circular e sem cálculo iterativo**.

```
Para cada tributo k:  base_k = alfa_k + beta_k × c

i = ICMS · s = ISS · p = PIS/COFINS
  código 1 → alfa = 1                         beta = −1
  código 2 → alfa = (1 − s) − i                beta = −(1 − s)
  código 3 → alfa = (1 − p)((1 − s) − i)       beta = −(1 − p)(1 − s)
  código 4 → alfa = alfa_3 + a_IS × alfa_IS    beta = beta_3 + a_IS × beta_IS
  código 5 → alfa = alfa_4 + a_IPI × alfa_IPI  beta = beta_4 + a_IPI × beta_IPI

a_k = alíquota original × (1 − fator de redução)

c = Σ(a_k × alfa_k) ÷ (1 − Σ(a_k × beta_k))
```

Ordem: IS e IPI primeiro (códigos 1 a 3); depois IBS e CBS, que podem
referenciá-los. Não há recursão.

**Códigos de base — padrão por tributo**

| Código | Base | Padrão |
|---|---|---|
| 1 | P | IPI, IS |
| 2 | P − ICMS/ISS | — |
| 3 | P − ICMS/ISS − PIS/COFINS | — |
| 4 | P − ICMS/ISS − PIS/COFINS + IS | **IBS, CBS** |
| 5 | código 4 + IPI | reserva |

A LC 214/2025, art. 12, §2º, II, **exclui expressamente o IPI** da base do
IBS/CBS. O IS não está entre as exclusões e **integra**. Daí o código 4 ser o
padrão, e não o 5.

**R4 · Fator de redução do IVA DUAL.** O fator é o percentual de **redução**
aplicado sobre a alíquota original do tributo:

```
alíquota efetiva = alíquota original × (1 − fator/100)
```

Formulação do dono do produto, registrada como está:

> Alíquota 10% com fator 50 resulta em efetiva 5%.

É **individual de cada produto ou serviço**
(`products.iva_dual_reduction_factor`, `services.iva_dual_reduction_factor`) —
nunca configuração do tenant — e entra **antes** do cálculo de `c`, porque altera
a base agregada. Não é desconto aplicado no fim.

**A tela é LISTA FECHADA. O banco é mais largo. De propósito.**

A LC 214/2025 tem **oito faixas** de redução, e a tela oferece essas oito e só
essas — sem opção "Outro", sem digitação livre:

| Fator | Enquadramento | Artigo |
|---|---|---|
| 0 | Integral — regime regular | art. 16 |
| 30 | Profissões intelectuais regulamentadas | art. 127 |
| 40 | **Faixa prevista; enquadramento NÃO confirmado** | — |
| 50 | Operações com imóveis — alienação e construção civil | art. 261 |
| 60 | Treze setores: saúde, educação, medicamentos, alimentos, insumos agropecuários, cultura, transporte coletivo | art. 128 |
| 70 | Locação de imóveis | art. 261 |
| 80 | Locação de imóvel reabilitado em zona histórica | art. 158, § único |
| 100 | Alíquota zero — cesta básica, medicamentos | art. 125 e 143 |

**Duas ressalvas que fazem parte da tabela, não notas de rodapé:**

- **O 40 não tem enquadramento confirmado.** A faixa existe na lei; o setor não
  foi verificado. O rótulo na tela diz isso, e continua dizendo até alguém
  confirmar. Inventar o setor seria tratar ausência como valor —
  `ausente-vs-falso.md` vale para texto de tela também.
- **50, 70 e 80 tratam de imóveis e locação, e as fontes divergem.** Material de
  2026 não bate com o de 2025 sobre esses enquadramentos. A divergência está
  registrada **sem escolha de lado**: quem for decidir precisa saber que há o que
  decidir.

**A CHECK do banco aceita `[0, 100]`, mais largo que a lista — e fica assim.**
Motivo, decidido pelo dono do produto: a lista muda com lei nova, e constraint
enumerada obriga migração a cada mudança. **A tela restringe, o banco tolera.**

A consequência tem de ser honrada no código: um fator fora da lista **pode
chegar** — por importação, por API, ou de linha gravada antes de uma mudança de
lista. Por isso as duas perguntas são funções diferentes:

| Pergunta | Função | O 45 é |
|---|---|---|
| está na lista que a tela oferece? | `isOptionPct` | **não** |
| cabe na faixa que o banco aceita? | `isValidReductionFactorPct` | **sim** |
| converte para o motor? | `reductionFactorPctToFraction` | **sim** |

Fazer o conversor recusar o que não está na lista seria a tela legislando sobre o
motor, e apagaria dado legítimo já gravado.

**As reduções NÃO se acumulam.** Art. 7º-A da LC 227/2026: quando uma operação se
enquadra em mais de um benefício, aplica-se o de **maior hierarquia ou maior
redução**, salvo autorização expressa. O campo é **um** por produto, então a
estrutura já força isso — está escrito para que ninguém proponha somar dois
fatores depois.

**`NULL` não é `0`.** `NULL` é *não classificado*; `0` é *integral, regime
regular* — classificado, e com o mesmo resultado aritmético. A distinção não muda
conta nenhuma, e é justamente por isso que ela se perde fácil
(`ausente-vs-falso.md`). O motor calcula e **não classifica**: para o `c`, ausente
e zero dão o mesmo número, e a distinção fica onde é acionável — no dado e na
tela.

**Duas unidades, e elas não se misturam.** Banco e tela usam percentual inteiro
em `[0, 100]`; o motor usa fração em `[0, 1]`. `reductionFactorPctToFraction`
(`src/utils/iva-dual-reduction-factor.ts`) é a única travessia autorizada.

**R5 · Percentual efetivado.** Toda categoria da operação interna é cadastrada
como **% Original sobre o total geral** e convertida para cálculo:

```
% Efetivada = % Original ÷ (1 − c)
```

**Duas exceções, e só duas:**
- **PIS/COFINS** — a alíquota nominal incide sobre `P − ICMS − ISS`. Não aplicar
  a conversão padrão: `efetivada = nominal × (1 − ICMS efetivada − ISS
  efetivada)`. O código **já faz isso corretamente** (9,25% → 7,678% = 9,25% ×
  0,83). Preservar ao introduzir `c`.
- **ISS no serviço** — a base do IBS/CBS exclui o ISS, mas o IBS/CBS não entra na
  base do ISS. O ISS não sofre gross-up: `efetivada = original`.

**R6 · IRPJ e CSLL.** Base de cálculo é o **valor do lucro**.
`% Original IRPJ = alíquota IRPJ × % Lucro`. Idem CSLL. O adicional de 10% tem
campo próprio (`products.additional_irpj_percent`).

**R7 · Margem de contribuição e preço.**
```
MC = 1 − Σ % Efetivadas
P  = Total custo ÷ MC
```
Se `MC ≤ 0`, abortar com erro de parametrização. Nunca produzir preço negativo
nem cair em default silencioso.

**R8 · Operação por fora.**
```
Total do produto = P ÷ (1 − c)
valor do tributo k = Total do produto × alíquota efetivada de k
```

**R9 · Contexto da venda.** O produto guarda a **ficha tributária**; o orçamento
aplica o **contexto** e recalcula. O preço não é congelado no cadastro — a tela
já anuncia isso ("o imposto não fica fixo no produto") e a regra confirma.

| Tipo de comprador | IPI na base do ICMS | DIFAL |
|---|---|---|
| Contribuinte — revenda ou industrialização | Não | Não |
| Contribuinte — uso, consumo ou ativo | Sim | Sim, se interestadual |
| Não contribuinte (consumidor final) | Sim | Sim, se interestadual |

**Somar o IPI por cima do preço sem IPI é erro, não atalho.** O IPI altera `c`,
que altera a MC, que altera o preço inteiro. Medido com custo R$ 1.000,00,
40,00% de despesas e margem, ICMS 17,00%, IBS/CBS 9,80%, IPI 5,00%: o preço
correto é R$ 3.168,64; somando por cima dá R$ 2.939,70 e o ICMS devido excede o
precificado em R$ 22,11.

> **Medição:** `pricing_calculations.buyer_type` só tem `CONSUMIDOR_FINAL` e
> `sale_scope` só tem `INTRAESTADUAL` em 100% das linhas. A estrutura existe e
> nunca foi exercitada com outro valor. Teste que não exercita não prova nada.

---

## Parte 2 — Orçamento, pedido e venda

**R10 · Ordem das seções.** Fixa, e a ordem é funcional, não estética.

| # | Seção | Natureza |
|---|---|---|
| 1 | Produtos precificados | Cascata completa por produto |
| 2 | Itens manuais | Repasse **sem** tributo |
| — | **= Montante a carregar** | Subtotal: base da cotação do frete |
| 3 | Frete, seguro e despesas acessórias | Repasse **com** tributo, rateado |
| 4 | **= Total geral — valor da proposta** | |
| 5 | Modo e desconto | |
| 6 | Decomposição | DRE por produto |

Se o bloco de acréscimos aparecer antes da operação interna, o usuário entende —
com razão — que despesa fixa e financeira incidem sobre o frete. Não incidem, e a
ordem tem de comunicar isso.

**R11 · Acréscimos pertencem ao orçamento, não ao produto.** Um frete atende
vários produtos. `products.freight_value`, `insurance_value` e
`accessory_expenses_value` deixam de ser alimentados **daqui para frente**; os 4
produtos que já têm valor ali permanecem como estão, **sem migração retroativa**.

**R12 · Rateio.** A NF-e tem `vFrete` no nível do item — o layout já obriga o
rateio. Cada parcela **herda as alíquotas do produto que a recebeu**; não se
inventa alíquota para o frete. Critérios: por valor (padrão), por peso, por
volume, manual. A base do rateio é o **montante a carregar**, fixada antes do
gross-up — não há circularidade.

A parcela que cai em item manual **não sofre gross-up**: é repasse puro, coerente
com o item de origem. Prever flag para quando o frete é emitido como item da
própria nota.

**R13 · Repasse não passa por margem.** Acréscimos e itens manuais não tocam
despesa, comissão, RT, lucro, IRPJ nem CSLL. Cascata própria:
```
MC dos acréscimos   = 1 − ICMS efetivada − ISS efetivada − PIS/COFINS efetivada
Preço dos acréscimos = parcela rateada ÷ MC dos acréscimos
Total dos acréscimos = Preço dos acréscimos ÷ (1 − c)
```

**R14 · Desconto.** Incide sobre o total geral, mas **itens manuais e acréscimos
saem inteiros** — o desconto recai integralmente sobre os produtos. É o
comportamento que o motor já tem. Consequência a exibir na tela: com repasse no
orçamento, desconto nominal e desconto efetivo sobre produtos divergem.

**R21 · A travessia dos acréscimos — a venda CONGELA, e sabe quando o congelado
deixou de valer.**

> A numeração salta porque as regras são identificadas pelo NÚMERO, não pela
> posição. Esta mora aqui, ao lado da R12 e da R13 que a produzem, e não no fim da
> Parte 3 — renumerar quebraria toda referência já escrita.

A pergunta que a originou foi binária — a venda congela o rateio do orçamento ou
recalcula? — e a resposta honesta não é nenhuma das duas, porque **são dois
valores de naturezas diferentes**:

| O quê | Natureza | Na travessia |
|---|---|---|
| **Valor cotado** (`freight_value` e os outros dois) | Fato histórico EXTERNO — veio de uma transportadora, não de uma fórmula | **Congela sempre.** Recalcular não o atualiza; não há o que recalcular |
| **Parcela por item** (`freight_allocated_value`) | DERIVAÇÃO do cotado sobre um CONJUNTO | **Congela enquanto o conjunto for o mesmo** |
| **Conjunto mudou** | — | O congelado deixou de ser aplicável: **avisar, nunca recalcular em silêncio** |

**Por que NÃO recalcular.** O share de cada item é `grandeza_k ÷ Σ grandezas`
(`budget-accessories.ts`). O denominador é o conjunto inteiro, então **remover um
item muda a parcela de TODOS os outros** — um item que ninguém tocou teria o
número alterado pelo movimento de outro. É `fato-vs-referencia.md` na forma mais
direta: o rateio é memória de uma cotação que aconteceu, e relê-lo contra o
conjunto de hoje reescreve o passado.

**Por que congelar cegamente também não serve.** Se a venda sai com menos itens
que o orçamento, a soma das parcelas herdadas fica MENOR que o valor cotado. O
documento cobra menos frete do que foi cotado, a diferença não aparece em lugar
nenhum, e ninguém vê.

**O terceiro estado é o que a formulação binária não tinha.** Quando o conjunto
muda, o rateio herdado é **inválido** — e a escolha entre re-cotar e re-ratear o
mesmo valor é do usuário, no documento, com os dois números à vista.

**Como se sabe que o conjunto mudou.** Gravando o **montante a carregar** vigente
no rateio (`freight_allocation_base`). Sem ele a divergência é indetectável:
comparar a soma das parcelas com o cotado pega item removido ou acrescentado, mas
**não pega troca de quantidade que preserve a soma** — e aí o share correto mudou
e o congelado continua fechando. Um congelamento que não sabe dizer quando deixou
de valer afirma "esta parcela é a deste item" quando o certo seria não afirmar
nada.

---

## Parte 3 — Decomposição (R15 a R20)

**R15 · A decomposição existe apenas em orçamento, pedido e venda.** Na
precificação existe só a construção.

**R16 · Coluna Total é a soma das colunas de produto.** Nunca percentual
aplicado sobre o total. Cada produto calcula com os próprios parâmetros — ficha
tributária, MC, RT, comissão, lucro e fator de redução são individuais. Com
produtos heterogêneos, o percentual da linha de total é **média ponderada
derivada** e deve ser rotulado como tal.

**R17 · Percentuais aplicados são os % Originais**, com base no total geral.
Nunca misturar % Original com base P.

**As duas metades da conta usam alíquotas DIFERENTES, e isto não é detalhe:**

| | qual alíquota | sobre que base |
|---|---|---|
| **CONSTRUÇÃO** | **EFETIVA** — `% Original ÷ (1 − c)` (R5) | a operação interna **P** |
| **DECOMPOSIÇÃO** | **ORIGINAL** — a cadastrada, como está na tela | o **total geral** |

A efetivada existe porque o preço precisa ser formado; ela é o instrumento do
gross-up. **Exibi-la na decomposição afirma que a alíquota cadastrada é outra** —
um número que o usuário nunca digitou, apresentado como se tivesse digitado.

Vale também para a **distribuição do RRO**: ali a base é o **RRO** e o percentual
é o **PESO** da R20, nunca a efetivada. Uma tela que rotulasse "efetiva 6,1883%"
na linha da Comissão estaria exibindo o instrumento da construção no lugar da
repartição — e foi exatamente o que a Memória Cascata de 17 etapas fazia, porque
esta regra não dizia isto com todas as letras.

**R18 · Congelados.** Custos, despesas, acréscimos e itens manuais são valores em
R$ herdados da construção e **não encolhem com o desconto**. É exatamente isso
que revela a corrosão da margem.

**A UNIDADE EM QUE O PARÂMETRO CHEGA NÃO DECIDE NADA.** Custo, acréscimos e itens
manuais chegam em R$ e congelaram por acidente — não havia como recalculá-los. A
**despesa chega em PERCENTUAL**, e por isso foi recalculada junto com as linhas de
imposto, que são as vizinhas na escrita. Formulação do dono do produto, registrada
como está: *"Não é decisão errada, é AUSÊNCIA DE DECISÃO — ninguém marcou 'esta é
percentual mas não recalcula'."* A base da despesa congelada é a **receita de
produtos SEM desconto**, que é o total do produto.

Medido no ORC-5487, 5% de desconto: recalculada `34.919,79 × 22,92% = R$ 8.003,62`;
congelada `36.757,67 × 22,92% = R$ 8.424,86`. Diferença de R$ 421,24, que ia toda
para o RRO e inflava comissão e lucro.

**A assimetria é econômica, e vale nos dois sentidos.** IBS, CBS, IS, IPI, ICMS, ISS,
PIS/COFINS e a **Comissão RT recalculam MESMO**: tributo acompanha a receita — faturou
menos, paga menos. Custo e despesa não acompanham, porque já aconteceram. Congelar o
tributo junto é o erro espelhado.

**Linha congelada não tem base nem percentual.** Exibi-los afirma um cálculo que não
existe, e o número que ele produziria é o errado — `ausente-vs-falso.md` na coluna.

> **A planilha diverge nesta única linha.** A aba "Orçamento" recalcula a despesa
> (`331.968,38 × 22,92% = 76.087,15`), e o congelamento dá `350.119,13 × 22,92% =
> 80.247,31`. Não é falha dela: foi construída sob o nível anterior, antes de a
> distinção existir (`decisao-sob-regra-da-epoca.md`). A decisão pelo congelamento é do
> dono do produto, em **16/09/2026**. Todas as outras linhas da planilha seguem valendo
> ao centavo.

**R19 · Ordem do DRE.**

```
RECEITA BRUTA (agrupamento)
(−) Desconto concedido
= RECEITA APÓS DESCONTO
(−) Itens manuais + frete rateado neles      [repasse sem tributo]
(−) Acréscimos dos produtos                  [repasse com tributo]
= RECEITA DE PRODUTOS
(−) IBS · CBS · IS · IPI
= OPERAÇÃO POR DENTRO (P)
(−) ICMS · ISS · PIS/COFINS
= RECEITA LÍQUIDA
(−) Custos · Despesas operacionais · Comissão RT
= RRO — RESULTADO RESIDUAL OPERACIONAL
    Comissão · Lucro · IRPJ · CSLL
= RESIDUAL (deve ser zero)
```

**A ORDEM DAS DEDUÇÕES É ESTA, SEM EXCEÇÃO:**

| # | dedução |
|---|---|
| 1º | **produtos manuais e acréscimos** — repasse, sai primeiro |
| 2º | **operação por fora** — IBS · CBS · IS · IPI |
| 3º | **operação por dentro** — ICMS · ISS · PIS/COFINS |
| 4º | **custos, despesas, comissão RT** |
| 5º | **RRO** — a última sobra |

**O RRO é o resíduo da conta INTEIRA. Qualquer coisa que apareça DEPOIS dele na
ordem está no lugar errado** — e o "depois" não é de layout, é de conta: um
tributo deduzido após o RRO não teria participado da formação dele, e o número
que sobra deixaria de ser o que se reparte na R20.

O caso que obrigou a escrever isto: a Memória Cascata punha IBS e CBS na Etapa
17, **depois** do RRO. A soma fechava — os dois lados fechavam entre si, que é o
sintoma de `regime-e-segmento-determinam-a-construcao.md` — e o RRO repartido era
de uma conta que ainda tinha tributo a deduzir.

**R20 · Distribuição do RRO.** As quatro categorias caem **proporcionalmente,
sem hierarquia entre elas**.

```
soma_RRO = % Comissão + % Lucro + % IRPJ + % CSLL
peso_k   = % k ÷ soma_RRO
valor_k  = RRO × peso_k
```

**Não subtrair a comissão primeiro para aplicar IRPJ sobre o resto** — isso
quebra a engenharia reversa: sem desconto, o IRPJ voltaria como 1,86% em vez dos
1,50% cadastrados. **Não criar linha de lucro líquido dentro do RRO**: as quatro
vieram da construção como categorias independentes e retornam assim.

A proporção preserva a relação legal sozinha: `peso IRPJ ÷ peso Lucro` = alíquota
do IRPJ, em qualquer nível de desconto.

---

## Parte 4 — O que muda, e o risco de cada mudança

| # | Mudança | Onde | Risco |
|---|---|---|---|
| 1 | Denominador do % efetivado passa a `(1 − c)` | `pricing-engine.ts:232` (o divisor) e `document-snapshot.ts` (a gravação) | **Médio** |
| 2 | Código de base por tributo | DDL aditivo + matriz | Baixo |
| 3 | Valores do fator de redução | Dado | Muito baixo |
| 4 | Acréscimos no orçamento | DDL aditivo + `document-snapshot.ts` | **Médio** |
| 5 | Decomposição por produto | `budget_items.tax_breakdown` já existe | Baixo |
| 6 | Renomear Cascata → Decomposição | UI + `permissions` | Baixo |

Nenhuma exige DROP de coluna. Nenhuma reescreve o motor.

**Onde fica o divisor, com precisão.** `src/utils/pricing-engine.ts:232`:
`coefficient = 1 - (structurePct + taxPct + rtReservePct + commissionPct + profitPct)`,
e logo abaixo `priceUnit = cmvUnit / coefficient`. É esse `coefficient` que passa a ser
dividido por `(1 - c)`. Não é `structurePctForEngine`, que só monta um dos cinco
percentuais que entram nele.

**DDL aditivo necessário**

| Tabela | Colunas |
|---|---|
| `budgets` | `freight_value`, `insurance_value`, `accessory_expenses_value`, `freight_allocation_criteria` |
| `budget_items`, `order_items` | `freight_allocated_value`, `accessories_allocated_value` |
| `products` | `icms_base_code`, `ibs_base_code`, `cbs_base_code`, `is_base_code`, `ipi_base_code` |

Todas com default que preserva o comportamento atual.

### A rota que grava

Medido em 15/09/2026: o caminho vivo é **um só**.

`hydrateDocumentSnapshots` (`src/lib/document-snapshot.ts`) →
`calculateMotorV17ForPageFull` (`src/utils/mrm-engine-v17/legacy-adapter.ts`) → V17.
É por ele que orçamento, pedido e venda gravam `tax_breakdown`.

As duas rotas que este arquivo citava antes **estão mortas em produção**:
`hydrateItemSnapshot` (`src/lib/items-snapshot.ts:182`) só é chamado de `__tests__`, e
`buildMotorInput` (`src/utils/mrm-orchestrator.ts:302`) vive num módulo que nenhum
arquivo de produção importa. `items-snapshot.ts` continua ligado ao 2.6.0 e exporta os
tipos `ItemSnapshot` e `TenantSnapshotContext`, que cinco arquivos de produção importam
— por isso ele não pode ser simplesmente apagado.

**A lição do #47 continua valendo; só mudou o alvo.** Lá, `cp_unit`, `mod_unit` e
`dop_unit` eram opcionais com default 0, nenhum chamador passava, e o RRO virava o preço
inteiro — no ORC-0689, 382,28 + 114,68 = 496,96, o preço exato do orçamento. O defeito
não era existirem duas rotas: era **default neutro em contrato de cálculo**, que
transforma erro em silêncio. Com uma rota só o risco não some — ele se concentra.

**Todo campo novo desta regra entra no contrato do V17 sem default neutro.** Campo de
cálculo é obrigatório; ausência é erro, não zero. A classe está catalogada em
`construtor-empobrecido.md`, `ausente-vs-falso.md` e `copia-divergente.md`, com quatro
reincidências (#27, #28, #45, #47).

### Renomeação

`Cascata` · `Cascata RRO` · `Memória Cascata` → **Decomposição**. Renomear o item
de menu exige renomear a seção em Permissões de Acesso **no mesmo commit** —
paridade menu-permissões é inviolável.

---

## Parte 5 — Verificação obrigatória

| # | Teste | Esperado | Criticidade |
|---|---|---|---|
| 1 | `c = 0` (sem tributos por fora) | **Resultado idêntico ao motor atual** | **Regressão — bloqueante** |
| 2 | Σ linhas da operação interna + custo | = P | Bloqueante |
| 3 | Decomposição com desconto zero | Devolve os % Originais cadastrados | Bloqueante |
| 4 | Residual da decomposição, total e por produto | = R$ 0,00 | Bloqueante |
| 5 | ICMS apurado | = alíquota × base do código configurado | Bloqueante |
| 6 | PIS/COFINS apurado | = alíquota × (P − ICMS − ISS) | Bloqueante |
| 7 | IBS/CBS apurado | = alíquota efetiva × base do código 4 | Bloqueante |
| 8 | Repasse entra R$ X e sai R$ X | Igualdade exata | Bloqueante |
| 9 | IRPJ ÷ Lucro na decomposição | = alíquota de IRPJ | Bloqueante |
| 10 | Soma das colunas de produto | = coluna Total, linha a linha | Bloqueante |
| 11 | Produtos com alíquotas diferentes no mesmo orçamento | Residual zero por produto e no total | Alta |
| 12 | Fator de redução 30%, 60% e 100% | `c` cai proporcionalmente, decomposição fecha | Alta |
| 13 | Troca de `buyer_type` | Base do ICMS muda e o preço é recalculado | Alta |
| 14 | Rateio por valor, peso e volume | Σ parcelas = valor original do frete | Alta |
| 15 | Serviço: ICMS INEXISTENTE | Não há linha; `c` usa ISS | Alta |
| 16 | Cenário 2026: PIS/COFINS 9,25%, IBS 0,10%, CBS 0,90% | Todas as bases conferem | Alta |

**O teste 1 é o que protege a base instalada.** Com `c = 0`, o motor precisa
reproduzir exatamente o resultado de hoje. Hoje `cbs_active` e `ibs_active` são
`false` em **100%** dos cálculos, então `c = 0` é o estado real de produção — o
teste cobre todas as precificações existentes.

**Os testes 12, 13 e 15 exercitam caminhos com zero registros em produção.**
`tax_reduction_factor` está zerado em 109 de 109; `buyer_type` só tem
`CONSUMIDOR_FINAL`; `sale_scope` só tem `INTRAESTADUAL`. São caminhos declarados
e nunca percorridos. Teste que não exercita não prova nada —
`teste-que-nao-exercita.md`.

---

## Parte 6 — Pendências que não bloqueiam

Nenhuma das quatro impede a implementação. Ficam registradas para não virarem
descoberta tardia.

| Pendência | Situação | Bloqueia? |
|---|---|---|
| Migração legacy → V2 parada | `mrm_legacy_audit_log` com 91 registros; nenhum orçamento com `engine_version` ≠ `legacy`/nulo | **Não** — mas decidir em qual motor as mudanças entram, antes de começar |
| `item_tax_credits` e `total_credit_*` vazios | Estrutura paralela; o crédito real vive em `items.cost_net` | Não — mas quem ler `total_credit_*` recebe zero |
| `tax_rates_periods` vazia | Alíquotas por período, previstas para o MRM | Não — as alíquotas vêm hoje do produto e do tenant |
| `labor_costs` e `fixed_expenses` vazias | Percentuais vêm de `tenant_expense_config` | Não |

---

## Estado do motor — medido em 15/09/2026

Três gerações coexistem. A que roda é a V17.

| Geração | Versão | Arquivo | Situação |
|---|---|---|---|
| MRM | 2.6.0 | `src/utils/margin-reapuration.ts` | Aposentada. 159 snapshots gravados |
| V17 | 3.0.0 | `src/utils/mrm-engine-v17/` | **EM PRODUÇÃO.** 17 snapshots |
| Construção de preço | — | `src/utils/pricing-engine.ts` | Em produção. Divisor na linha 232 |

**DEFEITO ABERTO: `documents.engine_version` mente.** Grava `'legacy'` em 113 de 113
orçamentos cujos itens foram calculados por 2.6.0 e 3.0.0. O rótulo vem da feature flag
(`mrm-feature-flag.ts`), que está `false` explícito nos 27 tenants — mas a flag decide o
rótulo e parte da UI, não se o motor roda. As telas chamam `hydrateDocumentSnapshots` sem
passar pela flag.

Classe: `ausente-vs-falso` no nível do schema. Qualquer decisão tomada a partir desse
campo parte de dado falso. Ou passa a gravar a versão real, ou para de ser gravado.

O `mrm_legacy_audit_log` tem 91 registros, todos de 19/05/2026 — 78 `LOCK_LEGACY` e 13
`MARK_LAZY_RECALC`. Rodada única, nunca repetida. Nada no `src` insere ali.

**DECISÃO:** as correções desta regra entram no **V17**. O 2.6.0 é limpeza legítima em PR
próprio, depois, e não é pré-requisito de nada. Mover os tipos `ItemSnapshot` e
`TenantSnapshotContext` para fora de `items-snapshot.ts` é pré-requisito da **remoção**,
não da correção.

## Premissas parametrizáveis

| Premissa | Situação | Tratamento |
|---|---|---|
| IBS/CBS na base do ICMS a partir de 2027 | Manifestações estaduais (SP, DF); PLP 16/2025 propõe proibir | Flag por UF e ano |
| IBS/CBS na base do ISS | Sem posição municipal consolidada | Flag por município. **Padrão: não entra** |
| Alíquotas de transição | 2026: IBS 0,10% e CBS 0,90% | Tabela por ano |
| Frete emitido como item da própria nota | Muda a tributação da parcela dos itens manuais | Flag na seção de acréscimos |

## Fora do escopo

ICMS-ST e DIFAL (bases por MVA e diferencial, linha própria); apuração
débito × crédito do período; calibração dos percentuais, que vem do diagnóstico
do negócio e não da estrutura de cálculo.
