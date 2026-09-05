# Hipótese Derrubada Pela Própria Medição

> **Esta regra é independente da correção que a originou.** Nasceu no PR do `das_pct` porque
> foi ali que o padrão precisou ser nomeado, mas não depende dele.

## O critério

Formulação do dono do produto, registrada como está:

> A suposição contrária era dela, corrigida pela própria medição. Mesmo padrão do K tautológico
> e do baseline pós-stash — **a medição derrubando a hipótese de quem a formulou**.

Não é sobre errar. É sobre **quem descobre**. Nas três aparições abaixo a hipótese e a medição
que a derruba têm o mesmo autor, e o intervalo entre uma e outra é de minutos: a pessoa escreve
o caso para provar o que acredita, roda, e o número diz outra coisa.

## De quem é a hipótese

**Duas das três são do assistente, uma é do próprio desenho da ADR.** Está escrito assim
porque o dono do produto pediu autoria plana, e porque suavizar apagaria o que torna isto útil:
o valor do padrão está justamente em o autor ser o corretor. Registrar como "descobriu-se que"
esconderia o mecanismo.

## Por que a distinção é difícil de ver

Porque a hipótese **não parece hipótese**. Ela chega como justificativa de um passo — "o teste
precisa de desconto para exercitar o campo", "o `stash` me dá a árvore do main", "esta
validação cruza card e cascata". Nenhuma das três foi enunciada como conjectura a testar; as
três foram enunciadas como razão para fazer outra coisa.

E o método que as derruba é o mesmo que as teria confirmado. Não houve revisão externa, nem
contraexemplo trazido por outra pessoa: **o mesmo teste que a hipótese pedia foi o que a
desmentiu.** Por isso o padrão só aparece em quem escreve o caso completo em vez de assumir.

## As aparições

| # | A hipótese | O que a medição mostrou | Autoria |
|---|---|---|---|
| 1 | **K tautológico** (ADR-019): a validação card × Etapa 16 na tela serve de rede de segurança | Card e cascata **leem a mesma fonte** (`motorResultsByItem`) — a validação é tautológica ali e não valida nada. Vale só como regressão em teste; o valor real seria estendê-la a PDF/WhatsApp | do desenho da ADR |
| 2 | **Baseline pós-stash**: `git stash` devolve a árvore do `main` para medir o baseline | O `HEAD` continua no branch — o que sobra é "o branch menos o não commitado". Mediu 393 erros e 19 falhas onde o `main` real tinha 385 e zero | do assistente |
| 3 | **`discount_mode` sem desconto**: sem desconto os dois modos de absorção coincidem, logo o caso do teste precisa de desconto | **126,92 no `PROPORTIONAL` contra 380,77 no `SELLER_REDUCTION`, mesmo item, desconto zero.** O modo governa o rateio do RRO SEMPRE | do assistente |

### Nota da busca por precedentes

A busca foi feita conforme `registro-de-classe.md`, e a pista veio do próprio dono do produto,
que citou as duas primeiras ao ler a terceira — o mesmo mérito dividido que
`ausente-vs-falso.md` registra: a forma é de quem escreve, a pista é de quem formulou.

A aparição 1 foi **discutida antes de ser incluída**, porque o mecanismo não é idêntico: ali
não houve medição numérica, houve leitura do código mostrando que as duas pontas comparadas
tinham a mesma origem. Entrou porque o discriminante que importa é o mesmo — **a hipótese e a
sua refutação têm o mesmo autor, e a refutação sai do próprio trabalho de verificar**. O que
muda é o instrumento, não a estrutura.

Nenhuma quarta linha foi forçada.

## O que a aparição 3 acrescenta, e é o motivo do destaque

Nas duas primeiras a hipótese errada **atrasava** o trabalho. Na terceira ela **subestimava um
defeito em produção**:

> O modo governa o rateio do RRO **sempre**, não só com desconto. O campo ausente afetava
> **todo documento gravado**, não apenas os com desconto.

A suposição do dono do produto era que só os documentos com desconto estariam afetados. A
medição mostrou que não. Isso muda o alcance do defeito corrigido no #48 de um subconjunto para
a população inteira — e é a razão de a consequência ficar como item próprio: **medir quantos
documentos têm `tax_breakdown` gravado sob o modo errado.** Só medição, sem correção de dado
histórico.

## O corolário aplicável ANTES do defeito existir

**Quando a razão para NÃO testar um caso é uma suposição sua, teste o caso.**

As três aparições têm a mesma forma verbal: *"como X, então não preciso de Y"*. É exatamente
aí que a suposição entra sem ser examinada, porque ela aparece como economia, não como
afirmação. O custo de escrever o caso mesmo assim é uma linha; o de não escrever foi, na
terceira, subestimar o alcance de um defeito.

Sinais, em ordem de força:

1. Uma frase justifica **pular** um caso, um contraste ou uma variação.
2. A justificativa é sobre **comportamento do sistema**, não sobre escopo acordado.
3. Ninguém mediu aquele comportamento — ele é conhecido "por dedução".
4. Medir custa pouco: é um segundo caso ao lado do primeiro.

Quando os quatro coincidem, escreva o caso. Ele confirma a suposição — ou é esta página de novo.

## Relação com as outras regras

`baseline-measurement.md` guarda a aparição 2 como procedimento, e é a prova de que registrar
o caso não basta: a regra ali é sobre COMO medir, esta é sobre QUANDO desconfiar da razão para
não medir. `registro-de-classe.md` é o método que decidiu a forma desta página, incluindo o
limite que a manteve em três linhas. `estado-relatado-vs-real.md` é a vizinha mais próxima —
lá a fonte secundária substitui a consulta; aqui a dedução substitui a medição.
