# Faltou Dado: Recusa Nomeada

> **Esta regra é independente da rodada que a originou.** Foi decidida em 23/10/2026, no caso do
> inox, e registrada aqui em 24/10/2026, quando a ligação avaliador → agrupador precisou dela para
> os pares de código e para a cor. **Não depende do orçamentista nem do motor do fornecedor**:
> vale para todo cálculo que vira preço, quantidade ou imposto, em qualquer tela, rota ou módulo.

## O critério

Formulação do dono do produto, registrada como está:

> Quando faltar dado — cor, referência, código, tabela, valor — o sistema **RECUSA e DIZ O QUE
> FALTA**, com nome e número, para que seja inserido. **Nunca aproxima, nunca escolhe o parecido,
> nunca calcula com o que sobrou.**

E o caso que a fixou, da base de conhecimento do projeto (seção XL, decisão de 23/10/2026, fora
do repositório e **não lida aqui** — citada pelo dono do produto):

> "Não consigo fazer porque está faltando isso, isso e isso."

E a forma dela para o preço de material, do mesmo dono, em 24/10/2026:

> **Barra → referência → código → valor, um valor por código.** Dois códigos para a mesma peça é
> **dado incompleto**, não ambiguidade aceitável.

São três proibições e uma obrigação, e as quatro são necessárias:

| o gesto | por que é proibido |
|---|---|
| **aproximar** — um padrão, um zero, um "6 m na falta do item" | o número sai plausível, e plausível é o que ninguém confere |
| **escolher o parecido** — o primeiro de dois, o de nome mais próximo, o "branco" para "Branco" | a escolha foi feita por quem não tinha o dado para fazê-la |
| **calcular com o que sobrou** — somar os que têm preço e calar os que não têm | o total parece de todos e é de alguns |
| **e a obrigação: nomear** — o quê, de qual peça, com que número | uma recusa sem nome trava sem dizer o que destrava; quem lê não sabe o que inserir |

## Por que a distinção é difícil de ver

Porque **todo fallback parece prudência**. `?? 0` evita um `NaN`; pegar o primeiro de dois evita
travar a tela; somar os itens com preço evita um total vazio. Cada um desses gestos é escrito para
o sistema "não quebrar", e é exatamente por não quebrar que o defeito passa: o resultado sai,
fecha consigo mesmo, e ninguém vê que um pedaço dele foi inventado.

E a recusa parece falha. Uma tela que diz "não consigo" lê como sistema incompleto; uma tela que
mostra um preço lê como sistema pronto. A pressão vai sempre para o lado do número — e é por isso
que a regra precisa estar escrita do lado da recusa.

O sintoma do fallback não aparece no dia: aparece quando alguém compara o preço com a nota do
fornecedor, ou quando a margem não fecha no fim do mês. Nesse ponto ninguém sabe mais qual
número foi suposto.

## As aparições

| # | Quando | Onde | O dado que faltava | O que o sistema faz |
|---|---|---|---|---|
| 1 | 12/10/2026 | `decomposition-dre.ts` — a ETAPA 13C do Lucro Presumido | as alíquotas de presunção do IRPJ e da CSLL | **ERRO que nomeia a 13C**, em vez de deduzir menos. Sem ele, o RRO saía **maior** do que a construção reservou, e os dois lados fechavam entre si (`a-13c-do-presumido.test.ts`, *"O PAR QUE DISCRIMINA"*) |
| 2 | 22/10/2026 | `pages/api/atendimentos-ia/inbound.ts` — o autorizado da conversa | um autorizado ÚNICO para o telefone: havia **duas** linhas ativas na mesma forma normalizada | *"NÃO se escolhe uma — é recusa"*, e o log registra a ambiguidade |
| 3 | 23/10/2026 | o caso do inox — base de conhecimento do projeto, seção XL, **fora do repositório** | não lido aqui; citado pelo dono do produto como a decisão que fixou a frase | *"não consigo fazer porque está faltando isso, isso e isso"* |
| 4 | 24/10/2026 | `agrupador-de-barras.ts` | o comprimento da barra no item; uma barra que comporte a peça | `BARRA_SEM_COMPRIMENTO` (*"nenhum comprimento é suposto"*) e `PECA_MAIOR_QUE_A_BARRA`, com os dois números (*"a peça não se emenda"*) |
| 5 | 24/10/2026 | `avaliador-de-formulas.ts` | a medida entre colchetes da opção escolhida (`&MAE` em "MEDIDA DO VÃO") | `MEDIDA_DA_OPCAO_AUSENTE`, com a variável e a opção: *"&MAE não tem valor, e nenhum é suposto"* — "medida do vão" quer dizer +0 para quem lê, mas o arquivo não diz isso |
| 6 | 24/10/2026 | a ligação avaliador → agrupador (PR seguinte) | um código de item ÚNICO para (perfil, cor): `BZ4556/WOLFF` em BRANCO tem **dois** — `1027.1` a R$ 209,86 e `10271` a R$ 1.055,25; e cor sem código (`BZ0012/WOLFF` só tem `CLICK`) | recusa com os dois códigos e os dois valores; recusa com as variantes que existem |

**Seis aparições, de três rodadas diferentes, e as seis com a mesma forma:** o dado que faltava
tinha um substituto à mão — um zero, a primeira linha, um "+0", o preço do outro código — e o
substituto foi recusado em favor de uma frase que diz o que falta.

### De quem são

As decisões são do dono do produto: a 3 é a que deu a forma, e a 6 foi decidida em 24/10/2026
contra uma proposta do assistente (*"preço igual, usa os dois"*), rejeitada. A 1, a 2, a 4 e a 5
foram implementadas pelo assistente sob instruções que já diziam "recusar" — e a 1 foi corrigida
dentro da própria rodada, quando um caso de outro arquivo mostrou que a primeira versão ainda
deixava uma linha zerada no lugar da ausência.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, em 24/10/2026, sobre `src/`: as frases *"nenhum é
suposto"*, *"não se escolhe"*, *"ACUSA"*, *"recusa"*, e os comentários de `null` que não é zero.
O dono do produto apontou três candidatas (o inox, o `&` sem valor, a peça maior que a barra); a
busca achou mais duas (a 1 e a 2), e a 6 nasceu na mesma rodada.

**Examinadas e NÃO contadas**, com a razão:

| onde | por que não entra |
|---|---|
| as dezenas de *"ausente não é zero"* em telas e utilitários | são de `ausente-vs-falso.md`: decidem o que **EXIBIR** quando falta o dado (travessão, omitir). Esta página decide o que **CALCULAR** — e a resposta é não calcular |
| R7 da `cascata-lucro-real.md` — `MC ≤ 0` aborta | o dado não falta: está presente e é inválido |
| a recusa da matriz em `buildProductConstruction` (17/09/2026) | o dado não falta: **sobra** — alíquota onde a matriz diz INEXISTENTE |
| a trava da importação, `fraseDaImportacaoTravadaPeloTempo` (#147, removida em 25/10/2026) | não falta dado: a recusa protege dado que **existe** de ser apagado (`tabela-que-a-importacao-apaga.md`) |

**E uma que CONTRADIZ a regra, registrada em vez de escondida:** `somaDoDenominador`, em
`src/utils/limite-de-desconto.ts`, decidida em 13/10/2026 (`limite-do-desconto.md`). Quando a
matriz manda somar um tributo e o chamador não traz a alíquota, ele **contribui zero na soma** —
*"porque não há outro número a usar"* — e a lista `semAliquota` sai para a tela dizer que o limite
está incompleto. **Nomeia, mas calcula com o que sobrou.** Pela régua de hoje, seria recusa. Ela
foi decidida antes desta regra existir (`decisao-sob-regra-da-epoca.md`), e **não é alterada
aqui**: mudá-la é decisão do dono do produto, sobre uma tela que trava o save.

Nenhuma sétima foi forçada.

## O corolário aplicável ANTES do defeito existir

**Antes de escrever um fallback num cálculo que vira preço, quantidade ou imposto, pergunte se ele
está substituindo um dado que falta. Se está, o lugar dele é uma recusa com nome e número.**

Sinais, em ordem de força:

1. `?? 0`, `|| 0`, `?? <constante>` sobre uma **entrada** do cálculo — não sobre uma saída de tela.
2. `.find(...)` ou `[0]` sobre uma busca que **pode** devolver mais de um — o primeiro é escolhido
   por quem não sabe qual é o certo.
3. Normalização feita para **fazer casar** — caixa, acento, prefixo, `ilike` — entre dois cadastros
   que deviam usar o mesmo valor. Casar o parecido é escolher o parecido.
4. Uma soma que pula os que não têm valor e devolve o total dos que têm.

E a forma da recusa, que é a parte que a torna útil:

- **o quê** falta (o código, a cor, a alíquota, o comprimento);
- **de quem** (a peça, a linha, a esquadria, o item);
- **com o número** que existe ao lado (os dois códigos e os dois preços; a peça e a barra);
- **todas** as recusas de uma vez — uma não esconde as outras. "Isso, isso e isso", não "isso" e
  depois de corrigido "isso".

### A aparição 5 foi DECIDIDA pelo dono do produto — 25/10/2026

A falta que a aparição 5 recusava foi preenchida por quem tinha o dado, e é assim que esta página
pede que ela termine: com a decisão escrita, não com um número suposto. Formulação do dono do produto:

> MAE opção 1 ("MEDIDA DO VÃO") vale &MAE = 0 mm. Fundamento, do Leia-me do motor: "&MAE, &ARI, &FV,
> &FF etc. são o valor (mm) da opção escolhida". As opções 2 e 3 são "VÃO+50MM [50,00]" e
> "VÃO+100MM [100,00]" — o colchete é o "+50"/"+100" do nome. Opção cujo nome não anuncia acréscimo e
> não traz colchete vale 0; isso é regra geral, não exceção da DP-02.

Desde então: sem colchete e sem acréscimo no nome → 0; nome que ANUNCIA acréscimo ("+" e número) sem
o colchete → continua recusa, porque o número do nome não é lido no lugar do colchete
(`avaliador-de-formulas.ts`, `ANUNCIA_ACRESCIMO`). A recusa de 24/10 estava certa sob a regra da época
(`decisao-sob-regra-da-epoca.md`).

## As ressalvas de método — o que esta página NÃO diz

- **Não substitui `ausente-vs-falso.md`.** Aquela decide a TELA quando falta o dado; esta decide o
  CÁLCULO. As duas valem juntas: o cálculo recusa, e a tela exibe a recusa — nunca um zero.
- **Não diz que todo campo opcional é dado faltante.** Um campo cujo vazio tem significado
  declarado (o `NULL` = "não classificado" do fator de redução, R4 da `cascata-lucro-real.md`) não
  falta: ele afirma. A pergunta é se o cálculo **precisa** do valor para estar certo.
- **Não altera o agrupador.** Ele já devolve o total `null` quando um código não tem preço — não
  calcula com o que sobrou —, mas não diz **qual** código. A ligação avaliador → agrupador é quem
  nomeia, no PR seguinte; mexer no agrupador ficou fora do escopo.
- **Não muda o `somaDoDenominador`.** Ver acima.

## Relação com as outras regras

`ausente-vs-falso.md` é a vizinha imediata e a fronteira está na tabela da nota da busca: lá a
tela, aqui o cálculo. `regime-e-segmento-determinam-a-construcao.md` é esta regra no formato do
preço: *"a decomposição não infere, ela lê"* — e quando não consegue ler, falha.
`a-coluna-que-parece-enumeracao.md` é o caso em que "escolher o parecido" se esconde num filtro.
`construtor-empobrecido.md` é o fallback no contrato: o default neutro na assinatura é a forma mais
silenciosa de calcular com o que sobrou. `decisao-sob-regra-da-epoca.md` é a razão de o
`somaDoDenominador` estar registrado como contradição datada, não como defeito.
`registro-de-classe.md` decidiu a forma desta página.
