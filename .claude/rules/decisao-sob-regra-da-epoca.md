# Decisão Correta Sob a Regra da Época

> **Esta regra é independente da funcionalidade que a originou.** Ela nasceu na rodada do
> `expense_snapshot` por documento porque foi ali que o critério precisou ser aplicado, mas
> **não depende dela**: vale para qualquer descrição de trabalho passado, em qualquer parte
> do repositório. Reverter aquela correção não deve levar esta página junto.

## O critério

Formulação do dono do produto, registrada como está:

> O termo carrega insinuação de descuido de quem construiu, e **não há descuido**. Quando o
> #26 foi feito, **a regra do congelamento por documento ainda não existia** — ela nasceu no
> D-A (#34). O #26 resolveu o nível que a regra da época cobria, e resolveu certo.

Uma decisão tomada sob uma regra que depois mudou **não é uma falha**. Descrevê-la com um
termo que a faz parecer falha — "ausência", "esqueceram", "não previram" — não é só injusto:
**aponta a investigação para o lugar errado**, para a pessoa, em vez de para o momento em que
a regra mudou. E o momento em que a regra mudou é a informação útil.

## De quem é o erro

**As três aparições são do dono do produto** — duas em que ele fez a distinção corretamente e
uma em que ele mesmo escorregou e se corrigiu. Está escrito assim porque ele pediu que ficasse
assim, e porque suavizar a autoria apagaria o que torna isto uma classe: quem já tinha
formulado a distinção duas vezes voltou a usar o termo errado três dias depois.

## Por que a distinção é difícil de ver

Porque o defeito é **real** e o código **está** errado hoje. Olhando só para o estado atual,
"falta a coluna" e "a coluna nunca foi pedida" descrevem a mesma tela. A diferença não está no
código — está no calendário, e o calendário não aparece no diff.

E há a assimetria de esforço: escrever "ausência estrutural" custa duas palavras; reconstruir
qual regra valia na data do PR custa uma consulta ao histórico. O termo barato ganha por
inércia, não por convicção.

## As aparições

| # | Onde | O termo em jogo | Como foi resolvido |
|---|------|-----------------|--------------------|
| 1 | 6ª aparição de `fato-vs-referencia` — a Etapa 4 lendo o CMV do cadastro vivo | "omissão" descreveria as cinco anteriores, **não** esta: aqui houve **decisão explícita**, com autor e data no comentário do código | Corrigido **antes de escrever**, por instrução do dono do produto: *"registre com a distinção que você mesma apontou"*. A página diz que **a razão de junho era boa** |
| 2 | Corpo do PR #34, item 3, sobre o `expense_snapshot` do #26 (02/09) | *"**Não foi erro de execução:** a regra do congelamento por documento não existia quando o 26 foi feito"* | Exigido pelo dono do produto e escrito no PR — **mas só no corpo do PR** |
| 3 | Mesmo assunto, três dias depois (05/09): o `expense_snapshot` descrito como **"ausência estrutural"** | O termo insinua descuido de quem construiu | Autocorrigido pelo dono do produto, que substituiu por **"nível de congelamento anterior ao D-A"** |

### O que a busca por precedentes encontrou, e o que não encontrou

A busca foi feita, conforme `registro-de-classe.md`. Ela **não** contou como quarta aparição o
`NOT NULL DEFAULT 0` do `rt_pct` no D8, descrito em `ausente-vs-falso.md` como algo que "o D8
pagou caro": ali o termo fala do **custo** da escolha, não da competência de quem a fez — não
é a mesma coisa, e forçá-lo para chegar a quatro é exatamente o que o limite do método proíbe.
Três aparições honestas.

## O que as aparições 2 e 3 provam juntas

Elas são **o mesmo assunto, com três dias de intervalo**. A distinção foi feita corretamente
em 02/09 e perdida em 05/09 — e a razão está escrita em `registro-de-classe.md`:

> Corpo de PR mergeado **fica soterrado**.

É o segundo caso com essa forma no repositório. O primeiro foi o procedimento de limpar o
`tsbuildinfo` antes de medir, que viveu em corpo de PR até o #28 versioná-lo, e no meio do
caminho a mesma medição enganosa aconteceu de novo. Aqui o conhecimento também existia, também
estava certo, e também não foi lido no momento em que importava — **porque estava no lugar em
que não se lê**.

Esta página existe para tirá-lo de lá.

## O critério aplicável ANTES do defeito existir

É a parte que previne em vez de explicar:

**Antes de nomear um defeito em código que alguém escreveu, pergunte: a regra que ele viola
existia quando ele foi escrito?**

| Se a regra… | O defeito é | E o termo é |
|---|---|---|
| já existia e foi ignorada | falha de execução | "não foi aplicado", "faltou" |
| **não existia ainda** | **nível anterior à regra** | "nível de congelamento anterior ao D-A", "cobria o nível da época" |
| existia e foi **deliberadamente revertida** | decisão consciente em conflito | "reverte a precedência X, por Y" — com autor e data |

O custo de errar não é diplomático, é técnico: quem lê "ausência" procura quem esqueceu; quem
lê "nível anterior à regra" procura **quando a regra mudou** — e é essa data que explica por
que outros pontos do sistema têm o mesmo limite.

### O corolário para o `expense_snapshot`

A forma da correção **não muda** por causa do enquadramento. Continua sendo migração
acrescentando a coluna em `budget_items`, `order_items` e `sale_items`, mais o preenchimento
nos caminhos de cópia. O que muda é o que o PR **diz** sobre o #26 — e, por consequência, para
onde a próxima pessoa olha ao encontrar outro ponto com o mesmo limite.

## Relação com as outras regras

`registro-de-classe.md` diz onde os registros moram e que forma têm — e é dela que vem o
diagnóstico da aparição 3. `estado-relatado-vs-real.md` trata de afirmar estado sem consultar a
fonte; esta trata de **julgar decisão passada pela regra de hoje**. `fato-vs-referencia.md`
guarda a aparição 1.

As quatro compartilham a mesma origem: **confiar num sinal indireto em vez de olhar o fato** —
aqui, o fato sendo a data em que a regra passou a existir.
