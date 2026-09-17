# Regime e Segmento Determinam a Construção, e a Construção Manda na Decomposição

> **Esta regra é independente da frente que a originou.** Nasceu no levantamento do percentual
> efetivo sobre o total geral, em 12/09/2026, porque foi ali que a ausência da matriz apareceu.
> **Não depende daquela frente**: vale para toda alteração do sistema que toque formação de
> preço, cascata, relatório ou gravação. Reverter aquela funcionalidade não deve levar esta
> página junto.

## O critério

Formulação do dono do produto, registrada como está:

> **DUAS RAÍZES determinam o FORMATO da construção do preço** — o **REGIME TRIBUTÁRIO** e o
> **SEGMENTO DA CADEIA** (industrialização, revenda, prestação de serviço). Elas determinam
> quais impostos existem, quais são POR DENTRO e quais são POR FORA. E **o formato usado na
> construção é a regra que a decomposição da cascata tem que obedecer: a decomposição NÃO
> INFERE, ela LÊ o que a construção usou.** Inviolável.

São duas afirmações, e a segunda é a que tem dente:

1. **O formato não é global.** Não existe "o jeito de formar preço" — existem tantos quantos
   forem os pares regime × segmento. Industrialização, revenda e prestação de serviço são
   **formas autônomas**, cada uma com o seu formato, e esse formato se replica na precificação.
2. **A decomposição é subordinada.** Ela não tem opinião sobre quais impostos existem nem sobre
   onde eles incidem. Ela lê o que a construção usou — e, se não consegue ler, **falha**, em vez
   de reconstruir por dedução.

### Os exemplos que fixam o sentido

Sem eles a regra vira parágrafo abstrato e ninguém a aplica.

- **No Simples Nacional, IBS e CBS estão DENTRO da guia única.** Não há operação por fora, e
  `k = 1` ali é **CORRETO POR LEI** — não é falha, não é dado faltando, não é coisa a consertar.
  Quem ler `k = 1` como defeito vai "corrigir" o que estava certo.
- **No Lucro Real é diferente: há por fora de verdade.** O mesmo campo, a mesma coluna, o mesmo
  motor — e a resposta certa é outra, porque a raiz é outra.
- **O IPI só existe em industrialização.** Em revenda não deveria aparecer. Um IPI numa revenda
  não é alíquota errada: é imposto que **não existe** naquele formato.

## Por que a distinção é difícil de ver

Porque **os dois lados fecham entre si**. É esta a frase que justifica a página inteira.

Quando a decomposição infere o formato em vez de lê-lo, ela produz um conjunto de números
internamente coerente: a soma bate, o total fecha, o invariante passa. O que ela devolve é **um
percentual que a construção nunca usou** — e não há sintoma, porque não existe segunda opinião
com quem confrontar. A validação compara a decomposição com ela mesma.

E o gesto que produz o erro é o gesto competente. Reconstruir o custo invertendo o markup,
derivar o peso por divisão, inferir a faixa de apuração pelo regime: **tudo isso é raciocínio
correto sobre premissas que ninguém verificou serem as da construção.** Não é descuido, é
dedução — e por isso não se parece com erro enquanto está sendo escrita.

O sintoma, quando aparece, aparece longe: um lucro apurado mais baixo do que o cadastrado, um
percentual de comissão que não bate com a tela de cadastro, uma margem que muda ao reabrir o
documento. Nenhum deles aponta para a linha que inferiu.

## As aparições

Todas com a mesma assinatura: **a decomposição recompõe um parâmetro da construção em vez de
lê-lo, e o resultado fecha consigo mesmo.**

| # | Onde | O que é inferido | Como diverge da construção |
|---|---|---|---|
| 1 | **CMV por markup reverso** — `mrm-engine-v17/legacy-adapter.ts:833-837`, quando `cost_total = 0` | O custo do item, invertendo `custo = Op_Interna × (1 − Σ%)` | A lista de percentuais é **escrita à mão duas vezes** e **já diverge**: a construção (`pricing-engine.ts:231`) soma `structure + tax + rtReserve + commission + profit`; a decomposição soma `icms + pis + cofins + iss + commission + profit + csll + irpj + dop_nominal` — **sem `rtReserve`**. Com RT > 0, o CMV reverso sai MAIOR que o real, e o lucro apurado sai MENOR |
| 2 | **`peso_op_interna`** — `mrm-engine-v17/legacy-adapter.ts:780-792` | A divisão interna/externa, por `(sale_price_base − terceirizadas) ÷ (unit_price − terceirizadas)` | A construção **sabia** quais tributos eram por fora (ela os aplicou, em `iva-dual-outside.ts`); a decomposição **redescobre** a proporção dividindo dois preços do cadastro VIVO. Nenhuma das três tabelas de item tem coluna para o que a construção usou |
| 3 | **Faixa de apuração PIS/COFINS (V7)** — `margin-reapuration.ts:484-486` | Se a alíquota agregada é "válida", comparando com `0,0925` (LR) e `0,0365` (LP) **hard-coded** | A validação **infere o formato pelo regime** em vez de ler o que a construção usou. Um tenant fora dessas duas faixas é marcado inválido sem estar; e a checagem é informacional, então nem bloqueia — só emite um aviso possivelmente falso |

### A medição da aparição 1, e o que ela NÃO mede

Medido em 12/09/2026 sobre o cadastro inteiro:

| | |
|---|---|
| produtos | **159** |
| com `cost_total = 0` (o gatilho do markup reverso) | **83** |
| com `rt_reserve_percent > 0` (o campo que a decomposição esquece) | **69** |
| **com os dois ao mesmo tempo** | **52** |

**Ressalvas, e elas importam mais que o número:**

1. **52 é o gatilho, não o dano.** O markup reverso só roda quando `cost_total = 0` **e**
   `sale_price_base > 0`. Não medi a segunda condição por produto, então 52 é **limite
   superior** da população exposta, não a população afetada.
2. **A magnitude do erro NÃO foi medida.** Ela depende do RT de cada produto e do preço, e
   apurá-la exigiria rodar os dois cálculos lado a lado — trabalho de correção, não de
   levantamento. **Não estimar, não inferir, não preencher com o mais provável**
   (`ausente-vs-falso.md`).
3. **As outras duas divergências da mesma lista não foram quantificadas.** O `taxPct` da
   construção é uma alíquota ÚNICA consolidada e a decomposição a re-decompõe em seis parcelas;
   o `structurePct` agrupa fixa + variável + financeira + MO indireta e a decomposição usa
   `dop_pct_nominal`. **Que os dois lados fechem é hipótese, não medição** — e é exatamente a
   hipótese que `hipotese-derrubada-pela-propria-medicao.md` manda testar em vez de assumir.
4. **Serviços não entram na conta.** São 10, nenhum com RT. Amostra pequena demais para
   qualquer afirmação, e registrada só para ninguém a procurar depois.

### O caso-limite honesto — o que NÃO é esta classe

Nem toda derivação é inferência proibida. **Derivar um valor de EXIBIÇÃO quando não existe
parâmetro único a ler é legítimo**, e há dois casos assim no motor:

- `absorption.ts:230-233` — no multi-produto a alíquota exibida é `valor ÷ base`, porque
  **não existe** uma alíquota nominal: cada produto tem a sua, e aplicar a de um sobre a base
  do outro seria pior;
- `legacy-adapter.ts:985` — o `rate_pct` do DAS é `valor ÷ âncora`, e o DAS é uma guia única
  sem alíquota decomposta por tributo.

O discriminante: **a construção tinha um parâmetro que a decomposição poderia ter lido?** Se
tinha, inferir é a violação. Se não tinha — porque o parâmetro não existe naquele formato —
derivar para exibir é a única saída, e deve vir com o rótulo dizendo que é efetiva, não nominal.

### Nota da busca por precedentes

A busca foi feita conforme `registro-de-classe.md`, sobre o motor, o gravador e as duas telas
de precificação. **Três aparições. Nenhuma quarta foi forçada** — os dois casos de derivação
para exibição foram examinados e **rejeitados** pelo discriminante acima, e ficam registrados
na seção anterior justamente para que a próxima pessoa saiba que foram olhados e por que não
contam.

## A FORMA que a regra tem de ter: MATRIZ, não parágrafo

Formulação do dono do produto, registrada como está:

> Ela **NÃO vive como parágrafo, vive como MATRIZ** — regime × segmento, e para cada imposto:
> **POR DENTRO, POR FORA, ou INEXISTENTE**. A construção lê a matriz. A decomposição lê **A
> MESMA** matriz. **Uma fonte única. Divergência entre as duas é ERRO, não número diferente — e
> o teste tem que PROVAR isso, não confiar.**

O eixo das linhas é o par **(regime, segmento)**; o das colunas, cada tributo. Cada célula tem
exatamente três valores possíveis, e os três são afirmações distintas:

| valor | o que afirma |
|---|---|
| **POR DENTRO** | o tributo existe e está embutido na operação interna — entra no coeficiente do markup |
| **POR FORA** | o tributo existe e é destacado acima da operação interna — compõe o total geral |
| **INEXISTENTE** | o tributo **não se aplica** àquele formato — e isto **não é zero** |

**`INEXISTENTE` e uma alíquota de 0% são coisas diferentes**, e confundi-las é
`ausente-vs-falso.md` no schema da matriz: zero afirma "existe e vale nada"; inexistente afirma
"não há o que apurar aqui". IPI em revenda é inexistente, não zero. IBS/CBS por fora no Simples
é inexistente, não zero — eles existem, mas **por dentro**, na guia única.

### O que a matriz NÃO decide

Ela decide **formato**, nunca **valor**. Alíquota, fator de redução do IVA Dual, base reduzida
e alíquota efetiva continuam vindo do cadastro do item e do tenant. A matriz responde "este
tributo existe aqui, e de que lado?" — e só.

### Por que UMA fonte, e não duas conferidas

Porque conferir duas listas é o remédio que `copia-divergente.md` já descartou:

> E o remédio, quando ela existe, **não é conferir as duas**: é apagar uma. Com um construtor
> só, acrescentar um campo vale para todas as rotas, e a omissão deixa de ser possível.

A aparição 1 desta página é exatamente uma cópia divergente entre construção e decomposição —
duas listas de percentuais escritas à mão, uma delas sem o RT. Com a matriz como fonte única,
acrescentar um tributo passa a valer para os dois lados, e esquecer um deles deixa de ser
possível **em vez de ser improvável**.

## O que quebraria se a regra fosse violada

É a parte que a torna verificável, e é a razão de ela existir:

> **A decomposição devolveria um percentual que a construção NUNCA USOU — e ninguém veria,
> porque os dois lados fecham entre si.**

Concretamente, nesta ordem de gravidade:

1. **O lucro apurado diverge do lucro cadastrado, e nada acusa.** O usuário cadastra 20,00%, a
   cascata devolve outro número, e a soma continua fechando. É a aparição 1 acontecendo hoje.
2. **Um tributo INEXISTENTE aparece como zero** e passa a ocupar linha na demonstração — ou,
   pior, entra numa base de cálculo com valor nulo e faz a base parecer apurada quando não é.
3. **Um `k = 1` correto por lei é lido como dado faltando**, e alguém "corrige" o Simples
   Nacional para ter operação por fora que a lei não prevê.
4. **A validação confirma o erro.** Invariantes que comparam a decomposição consigo mesma
   passam verdes sobre um formato errado — é `teste-que-nao-exercita.md` no nível do desenho:
   o caso escolhido não distingue o formato certo do formato inferido.

**O teste tem de provar a igualdade entre os dois lados, não confiá-la.** A forma dele é a de
`copia-divergente.md`: um caso que afirma que **toda célula que a construção consultou é a
mesma célula que a decomposição consultou**, de modo que acrescentar um tributo num lado sem o
outro **quebre o build** em vez de chegar divergente em silêncio.

## O corolário aplicável ANTES do defeito existir

**Antes de escrever qualquer linha que decida se um imposto existe, onde ele incide, ou qual
percentual exibir, pergunte de qual par (regime, segmento) essa decisão depende — e leia a
matriz em vez de deduzir.**

Sinais de que se está prestes a violar, em ordem de força:

1. Uma fórmula **inverte** outra fórmula que existe em outro arquivo (markup reverso, peso por
   divisão, base recomposta).
2. Uma constante numérica de alíquota ou faixa aparece **no código** em vez de vir do cadastro
   (`0.0925`, `0.0365`, `1.65/9.25`).
3. Um `if` decide comportamento por regime ou por segmento **sem citar a matriz** — e o
   `if (isLRorLPorSH)` de `products/content.component.tsx:1119` é um candidato: ele pode ser a
   regra do regime JÁ IMPLEMENTADA, sem nome e sem documento, ou pode ser um buraco.
4. Uma lista de percentuais é somada, e existe outra lista em outro lugar somando "a mesma
   coisa".

Quando dois ou mais coincidem, a matriz é a resposta — e, enquanto ela não existir, **o certo é
registrar a dúvida, não escolher a metade que parece mais provável.**

### O que esta regra SUSPENDE, e por quê

Enquanto a matriz não existir, **não se decide se um par (regime, segmento) sem operação por
fora é regra ou buraco.** O caso concreto que a originou, registrado como está:

> Pela regra acima, esse `if` pode ser a regra do regime JÁ IMPLEMENTADA, só que sem nome e sem
> documento. O que sobra como defeito PROVÁVEL é o SERVIÇO em Lucro Real ou Presumido, que tem
> IBS/CBS por fora e hoje está com zero em 10 de 10. **Não sei qual metade é e não vou chutar.**

"Metade regra certa, metade buraco" é a leitura honesta de um levantamento que mediu o estado e
não mediu a intenção. **Dizer isso vale mais que uma decisão rápida** — e é o mesmo limite que
`registro-de-classe.md` impõe à contagem de aparições: anedota honesta é melhor que padrão
inventado.

## Relação com as outras regras

Esta página **generaliza** três classes já registradas, e a relação é de grau, não de tema:

| regra | o que ela cobre | o que esta acrescenta |
|---|---|---|
| `fato-vs-referencia.md` | o valor gravado é memória de um cálculo ou ponteiro para configuração viva | aqui o que se relê não é um **valor**, é o **FORMATO**: quais impostos existem e de que lado. A aparição 2 é uma aparição das duas ao mesmo tempo |
| `ausente-vs-falso.md` | default neutro afirma em vez de calar | aqui o default afirma **formato**: `INEXISTENTE` lido como zero afirma que o tributo existe e vale nada |
| `copia-divergente.md` | o mesmo mapeamento escrito duas vezes, uma esquecendo um campo | aqui as duas cópias são **construção e decomposição**, e o campo esquecido é um **tributo ou um percentual de categoria** — a aparição 1 é literalmente isso, com o RT ausente de um dos lados |

`registro-de-classe.md` decidiu a forma desta página e o limite que a manteve em três
aparições. `teste-que-nao-exercita.md` diz por que o teste da matriz tem de comparar os dois
lados e não cada um consigo mesmo. `hipotese-derrubada-pela-propria-medicao.md` é a vizinha da
ressalva 3 da medição: a razão para não medir se os dois lados fecham é uma suposição de quem a
formula.

**Todas compartilham a mesma origem: confiar num sinal indireto em vez de olhar o fato** — aqui,
o fato sendo o formato que a construção de fato usou.
