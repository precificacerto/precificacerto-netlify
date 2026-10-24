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
| 5 | `IL50` e `KT16` procurados como código **só na coluna `codigo`** do motor e da tabela de preço | o código que mora na **outra coluna**, `codigo_wvetro` | **"não existem no banco"** | `IL50/WOLFF` em **180** regras, `KT16/WOLFF` em **132** |

A quarta é a que dói. Com ela eu havia declarado um arquivo **fechado**, e o relatório dizia
"zero escritas mudas". O número estava errado porque o padrão só via `await` no começo da linha,
e metade das chamadas de leitura-com-escrita atribui o resultado.

### A quinta: a coluna errada, não o padrão errado

Medido em 24/10/2026, na tabela Wolff (`72366020-…`). Nas quatro primeiras o instrumento era um
regex estreito demais; na quinta o padrão estava certo e o **lugar** onde ele procurava é que não
continha o alvo.

O arquivo do fornecedor tem **dois códigos por peça**, lado a lado na aba "Motor por barra": o
Código Wolff (`codigo`, o que a tabela de preço usa: `9701`, `95420`…) e o Código WVetro
(`codigo_wvetro`, o que as abas de tipologia usam: `IL50/WOLFF`, `KT16/WOLFF`…). A exceção de
barra do arquivo — *"IL50/WOLFF 5.500 mm; KT16 5.800 mm"* — cita o segundo. A busca olhou só o
primeiro, achou zero, e eu relatei que os dois "não existem no banco".

| código WVetro | regras | o que é | itens de preço | barra (`medida_barra_m`) |
|---|---:|---|---:|---|
| `IL50/WOLFF` | 180 | INTERLOCK PORTA IL 50 — (MÃO DE AMIGO) | 15 | **5,5 m nos 15** |
| `KT16/WOLFF` | 132 | TAPA CANAL EUROPEU | 22 | **5,8 m em 7** (os laminados KT16); **6 m em 15** — o `9541` BRANCO e 14 itens `KT65…` da linha 60 mm, que o arquivo também põe sob `KT16/WOLFF` |

E `IL50` existe ainda num **terceiro** lugar, como valor da coluna `cor` da escova `9347` — outra
peça, que é a aparição de `a-coluna-que-parece-enumeracao.md`. O mesmo texto em três papéis: quem
procura num só deles acha uma resposta errada e plausível.

**O que a quinta custou.** A frase *"IL50 nunca foi código de item, era valor da coluna `cor`"* foi
escrita pelo dono do produto **a partir da minha medição anterior**, e quase entrou numa página de
regra. Reconhecimento dele, registrado como está:

> Registre que a frase errada foi MINHA, não sua: eu escrevi "IL50 nunca foi código de item" a
> partir da sua medição anterior, sem conferir a outra coluna. Você mediu de novo e derrubou. É o
> terceiro caso em que uma afirmação minha caiu por medição sua, e os três estão registrados.

A frase é dele; o instrumento que a sustentava é meu. As duas autorias ficam ditas porque cada
uma ensina uma coisa: a dele, que uma conclusão tirada de medição alheia herda o alcance daquela
medição; a minha, que "não existe" medido numa coluna só é afirmação sobre a coluna, não sobre o
banco.

**O corolário do corolário, aplicado:** com o instrumento corrigido (as seis colunas de texto da
regra e as duas do item), refiz a medição que tinha dado zero. `CL-006` e `CL-011`, citados no
mesmo levantamento, continuam com **zero** em todas — agora como fato, não como hipótese.

### De quem são

**As cinco são do assistente.** Está escrito assim porque suavizar apagaria o mecanismo: quem
escreve o padrão é quem acabou de ver o exemplo, e o exemplo vira o critério sem passar por
verificação. O dono do produto apontou a primeira ao ler o relatório; as outras três apareceram
porque a próxima versão do instrumento foi **testada** antes de ser usada. A quinta apareceu
quando a mesma tabela foi medida de novo por outra pergunta — a ponte entre os dois códigos — e a
coluna que a primeira busca não olhou estava no resultado.

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

A quinta não foi procurada: apareceu em 24/10/2026, noutra campanha, e entrou por instrução do
dono do produto. Ela alarga o sinal 2 do corolário abaixo — a forma que o instrumento exige não
é só sintática; pode ser **a coluna**. Nenhuma sexta foi forçada.

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
   variável, o início da linha, uma chamada na mesma linha. **Ou um LUGAR**: a coluna, a tabela,
   a aba em que se procura, quando o mesmo dado pode morar em mais de uma (aparição 5).
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
forma desta página e o limite que manteve a tabela em cinco linhas.
`a-coluna-que-parece-enumeracao.md` é onde mora o terceiro papel do `IL50` — o valor da coluna
`cor` —, e o remédio dela é o desta página aplicado a uma coluna: liste o que existe antes de
concluir o que não existe.

`instrumento-que-se-enxerga.md` é o espelho desta, com o erro no sentido oposto: lá o conjunto
examinado contém o próprio instrumento (o `pgrep` que acha a linha de comando de quem pergunta),
e a resposta sai sempre positiva. A fixture desta página ("o caso que deveria aparecer, aparece?")
passa verde lá. A de lá é a do alvo **ausente**.
