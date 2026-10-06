# O Instrumento Que Não Enxerga o Que Procura

> **Esta regra é independente da correção que a originou.** Nasceu na campanha das escritas
> mudas do Supabase, em 05 e 06/10/2026, porque foi ali que a quarta aparição fechou a contagem.
> Não depende daquela correção: vale para toda medição feita com `grep`, com regex ou com
> qualquer filtro escrito à mão.

## O critério

Formulação do dono do produto, registrada como está:

> O indicador exigia o cast e por isso não podia ver o que procurava.

É `portao-que-nao-alcanca.md`, pergunta 4, aplicada à **leitura** em vez do CI: *o número que eu
estou conferindo pode mudar no caso que eu quero detectar?* Lá o instrumento é o portão e o
verde é decorativo. Aqui o instrumento é o `grep`, e o que é decorativo é a **contagem**.

E a contagem é pior que o verde, porque ela **convence**. "São 3" tem a forma de um fato
medido. Ninguém pede a prova de um número que veio de um comando.

## Por que a distinção é difícil de ver

Porque o instrumento **funciona**. Ele roda, não dá erro, devolve linhas, e as linhas que devolve
estão todas certas. O defeito não está no que ele mostra — está no que ele **não tem como
mostrar**, e isso não aparece na saída. A saída de um padrão que perde metade dos casos é
indistinguível da saída de um padrão completo: as duas são uma lista de linhas plausíveis.

E quem escreve o padrão é quem já tem na cabeça a forma do que procura. Escrevi
`await (supabase as any)` porque foi assim que vi o primeiro caso. O padrão não era uma
hipótese a testar: era a memória do exemplo, promovida a critério.

## As aparições

Todas a mesma classe: **a mesma pergunta, instrumentos sucessivos, números diferentes.**

| # | o padrão | o que ele não podia ver | reportei | havia |
|---|---|---|---|---|
| 1 | `await (supabase as any)` | chamadas por `supabase`, `sb2`, `sbp` **sem o cast** | **3** | 25 |
| 2 | `await (supabase\|sb2\|sbp)\.` | `await supabase` com o `.from(` na **linha seguinte** | **21** | 23 |
| 3 | o mesmo, mais a linha sem ponto | `await supabase   // comentário` — a forma sem ponto **com comentário depois** | **234** | 244 |
| 4 | `^(\s*)await …` — só `await` NU | `const { data: x } = await supabase…` — o await **atribuído** | **0 em `agenda/index.tsx`** | 3 |

A quarta é a que dói. Com ela eu havia declarado um arquivo **fechado**, e o relatório dizia
"zero escritas mudas". O número estava errado porque o padrão só via `await` no começo da linha,
e metade das chamadas de leitura-com-escrita atribui o resultado.

### De quem são

**As quatro são do assistente.** Está escrito assim porque suavizar apagaria o mecanismo: quem
escreve o padrão é quem acabou de ver o exemplo, e o exemplo vira o critério sem passar por
verificação. O dono do produto apontou a primeira ao ler o relatório; as outras três apareceram
porque a próxima versão do instrumento foi **testada** antes de ser usada.

### O que NÃO é

Não é desatenção. Nenhuma das quatro teria sido evitada lendo a mesma saída com mais cuidado —
a saída estava correta. Se fosse descuido, a correção seria "confira melhor", e não haveria
regra a escrever.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, sobre esta mesma campanha. As quatro aparições são do
mesmo levantamento, em três dias, e é justamente a repetição dentro de uma campanha só que as
torna classe em vez de acidente. Não forcei uma quinta: os dois defeitos de APLICAÇÃO que
apareceram no caminho — a desestruturação dupla (`const { data } = const { error: X } = await`)
e a chave `error` ausente — **não entram**, porque ali o instrumento enxergou certo e o gesto é
que estava errado. São de outra classe, e o `tsc` os pegou em segundos.

## O corolário aplicável ANTES do defeito existir

**Antes de confiar num número que saiu de um padrão escrito à mão, construa de propósito um caso
que deveria aparecer e verifique se o instrumento o enxerga.**

Não é "revise o regex". É escrever a fixture, rodar, e contar. Na terceira versão do detector
desta campanha, a fixture tinha uma ocorrência de cada forma já conhecida, e ela pegou **duas**
formas novas antes de o padrão tocar o repositório — a do comentário e a do `await` atribuído.
Custo: oito linhas de arquivo falso. O que se compra é a diferença entre 244 e 234, e entre
"fechado" e "faltavam três".

Sinais de que o número não vale ainda, em ordem de força:

1. O padrão foi escrito **a partir de um exemplo**, e o exemplo é o primeiro caso que se viu.
2. Ele exige uma forma SINTÁTICA que não é essencial ao que se procura — um cast, um nome de
   variável, o início da linha, uma chamada na mesma linha.
3. A contagem vai virar **premissa de decisão** — escopo de rodada, "está fechado", ordem de
   prioridade.
4. Nenhuma fixture foi rodada contra ele.

Quando o 3 e o 4 coincidem, o número não vale. Construa o caso.

### E quando o instrumento muda, a contagem anterior volta a ser hipótese

Corolário do corolário, e foi o que a aparição 4 ensinou: **melhorar o detector invalida as
medições feitas com a versão antiga, inclusive as que deram zero.** Um "fechado" medido com
instrumento pior não é um fato estabelecido — é um resultado que precisa ser refeito. Quem
melhora o padrão tem de rodar o padrão novo sobre o que já foi declarado pronto.

## Relação com as outras regras

`portao-que-nao-alcanca.md` é a origem do critério, no instrumento do CI; a pergunta 4 dela é
esta regra em uma linha, e esta página é o que acontece quando a mesma pergunta se aplica ao
`grep` em vez do portão. `hipotese-derrubada-pela-propria-medicao.md` é a vizinha espelhada: lá
a medição derruba a hipótese de quem a formulou; aqui a medição **confirma** a hipótese de quem
a formulou, porque o instrumento foi feito à imagem dela. `baseline-measurement.md` trata da
medição feita na árvore errada — mesmo erro, outro eixo: lá o número está certo e a premissa
errada, aqui a premissa está certa e o número é que não mede. `registro-de-classe.md` decidiu a
forma desta página e o limite que manteve a tabela em quatro linhas.
