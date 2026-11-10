# A Mutação Que Não Se Aplica

> Registrada em 10/11/2026, a partir do F10 do harness da `20261109000005` (#258), cujo trecho deixou de casar e a bateria contou a
> mutação como viva. Vale para toda bateria de mutação, de banco ou de código: `scripts/harness/*/mutacoes*.py` e `scripts/mutacoes/*.py`.

## O critério

Formulação do dono do produto, registrada como está:

> Toda bateria de mutação tem de FALHAR ALTO quando o trecho de uma mutação não é encontrado EXATAMENTE UMA VEZ no arquivo alvo. Zero
> ocorrências é erro; duas ou mais também. "Não aplicada" nunca pode ser contada como "morta", e nunca pode passar em silêncio. […] Se
> alguma deixar, o placar daquele harness nunca foi o que dizia.

**Uma mutação que não se aplica não testou nada.** O placar "N de M mortas" só fala das mutações que trocaram o código. Uma que
não trocou nada não morreu e não sobreviveu: ficou fora da medição, e o placar dá como coberto um trecho que ninguém mexeu.

## Por que a distinção é difícil de ver

Porque o trecho some **por uma mudança certa** em outro lugar. O código é refatorado, e a linha que a mutação procura passa a
terminar em vírgula, ganha um parâmetro ou muda de indentação. Ninguém mexeu na bateria, e a bateria continua rodando.

E a falta sai com a cara de um resultado. Nas baterias medidas, a mutação sem trecho saía:
- impressa e somada às sobreviventes, que é exatamente o que a sobrevivente real faz;
- ou impressa e pulada, sem mudar o código de saída;
- ou abortando com o código 1, o mesmo das sobreviventes.

Quem lê "3 vivas" vai atrás de 3 testes fracos, e não de 3 trechos que sumiram.

A rodada parcial esconde o resto. As baterias aceitam rodar só algumas mutações (`mutacoes.py L19 L48`). A rodada que confere só as
pedidas não vê que as outras deixaram de se aplicar, e é o gesto natural depois de corrigir uma.

## As aparições

| # | Quando | Onde | O que não se aplicava | Como foi visto | Estado |
|---|---|---|---|---|---|
| 1 | 08/11/2026, `05de1969` | `levantamento-de-barras`, M19 | o trecho mudou no #245 | a bateria imprimiu e somou às sobreviventes | trecho reapontado |
| 2 | 08/11/2026, `7ce553eb` | `levantamento-de-barras` M10, M11, M16, M20 e `levantamento-na-conversa` L14, L20, L31, L33 | o código mudou no mesmo PR; *"M16 já estava com trecho velho na main"* | idem | reapontadas |
| 3 | 08/11/2026, `1c317e34` | `levantamento-na-conversa` L19 e L48; `levantamento-por-nome` E14 | idem | idem | as três reapontadas, mas **no mesmo commit outras 15 da `levantamento-na-conversa` continuavam sem trecho** (medido no commit, abaixo) |
| 4 | 09/11/2026, #258 | `orcamento-ia-arquivo`, F10 | o trecho passou a terminar em vírgula | a bateria imprimiu `NAO APLICADA` e contou como viva | trecho reapontado no #258; a bateria ainda não chama o verificador (abaixo) |
| 5 | 10/11/2026, `origin/main` `38716006` | 7 baterias, **59 mutações** (tabela seguinte) | o código mudou depois da bateria | medição desta página | **as 7 abortam** com o código 3 desde este PR; os trechos não foram reapontados |

### A medição de 10/11/2026

**Método.** Um instrumento roda cada bateria com os subprocessos desligados (nenhuma suíte, nenhum Postgres). Os textos lidos de
arquivo passam a ser uma subclasse de `str`, que registra o número real de ocorrências de cada trecho procurado com `.count()` e
devolve 1, para a bateria seguir até a última mutação em vez de parar na primeira falta. Tudo roda numa worktree de `origin/main`.

Antes de valer, o instrumento passou por uma fixture com um trecho presente, um ausente e um repetido, e ela mostrou dois defeitos:
- um filtro `len > 2` escondia trechos curtos, e saiu;
- passar o trecho por `$(… | base64 -d)` cortava a quebra de linha final, e o trecho passou a ir em base64, decodificado no Python.

Também exigi que cada uma das 57 chegasse ao próprio resumo final, para não contar uma bateria que tivesse parado no meio.

| bateria | não se aplicam | de | no commit da própria bateria |
|---|---:|---:|---|
| `escolhas-na-conversa/mutacoes.py` | 10 | 25 | 0 (`df562c0a`, 25/10) |
| `levantamento-na-conversa/mutacoes.py` | 19 | 49 | 0 em `e895a432` (25/10); **19, 15, 15, 17 e 17** nos cinco commits de 08/11, de `57d734f7` a `c28c5244` |
| `levantamento-por-nome/mutacoes-do-codigo.py` | 9 | 35 | 0 (`52fe671e`, 25/10) |
| `levantamento-por-nome/mutacoes-maria.py` | 2 | 29 | 0 (`4f54206e`, 05/11) |
| `levantamento-por-nome/mutacoes-reenvio.py` | 6 | 20 | 0 (`b0c074c3`, 06/11) |
| `tela-tres-niveis/mutacoes.py` | 12 | 60 | 0 (`aa4a77df`, 24/10) |
| `variavel-sem-padrao/mutacoes.py` | 1 | 20 | 0 (`35f79c8e`, 06/11) |
| **as 50 outras** | **0** | | |
| **57 baterias** | **59** | **1.642** | |

As 1.642 contam as duas passadas da `numero-e-dados-do-levantamento` (com e sem a verificação) e os controles. As 59 são, por
bateria: E7–E9, E13–E15, E17–E19, E23; L4–L7, L9, L10, L13, L24, L28, L32, L34, L36–L40, L44–L46; N3, N6, N10, N13, N14, N22, N25,
N31, N32; M10, M20; R8, R16–R20; M7, M16, M19, M20, M28–M30, M36–M38, M44, M60; V11. Cada ausência foi conferida por grep no arquivo
alvo de hoje.

**O que a coluna da direita diz, ao pé da letra do dono do produto.** Seis das sete baterias se aplicavam inteiras quando foram
escritas: o placar delas, na data, foi o que dizia, e deixou de ser depois, quando o código mudou. A `levantamento-na-conversa` **já
tinha de 15 a 19 mutações sem trecho em cada um dos cinco commits de 08/11 que mexeram nela**, dois deles para reapontar trechos (#2 e
#3 acima). Dali em diante, um placar dela que não listasse as faltas não foi o que dizia.

### Como cada bateria tratava a falta, em `origin/main` `38716006`

| tratamento | baterias | efeito |
|---|---:|---|
| conferia todas antes de rodar e abortava com o código 1 | 16 | alto, mas com o código das sobreviventes |
| abortava no laço, ao chegar na mutação | 22 | alto, porém depois de rodar as anteriores; a rodada parcial não conferia as outras |
| imprimia e somava às vivas ou sobreviventes | 18 | misturada às sobreviventes reais; sete delas isentavam do critério a troca de um trecho por ele mesmo (`velho != troca`), que era o controle |
| imprimia e pulava (`continue`), e saía com 0 | 1 (`bloco-tributario`) | **passava em silêncio** |

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, em 10/11/2026:
- nos commits da `main` com "mutação" ou "trecho" na mensagem;
- nas 57 baterias, em `origin/main` e no último commit não-merge de cada uma das sete com falta.

A clone estava rasa: 73 commits, e o primeiro merge parecia ser o commit de todas. Foi aprofundada (`git fetch --unshallow`) antes
de medir por época.

**Examinados e NÃO contados:**

| o quê | por que não entra |
|---|---|
| `02f0d669` (06/11), *"o trecho da mutação C7 com a indentação do código atual"* | não há como medir, pelo commit, se a C7 chegou a rodar sem trecho na `main` ou se foi corrigida antes; fica registrada como vizinha |
| `63766a67` (24/10), *"o trecho exigido da M10 copiado do título do caso"* | é o texto que a bateria espera na SAÍDA da suíte, não o trecho a mutar; a falha ali é de veredito, e é outra classe |
| a `neutraliza` da `orcamento-ia-precificacao`, que exige o trecho **duas** vezes | é de propósito: a CHECK aparece na lista que cria e na que a verificação compara, e ela já recusava qualquer outra contagem. O verificador a trata como troca-função |

## O remédio — `scripts/harness/trecho_unico.py`

**Toda bateria chama `exigir_trecho_unico` antes de rodar qualquer suíte, com todas as suas mutações**, inclusive quando quem a
chamou pediu só algumas. Um trecho com zero ocorrências, ou com duas ou mais, aborta a bateria inteira:
- **código 3**, que não é o das sobreviventes;
- a marca `MUTAÇÃO QUE NÃO SE APLICA`;
- a lista de todas as que faltam.

As trocas de uma mesma mutação se encadeiam como na bateria. O controle é a mutação sem trocas, e substitui a troca de `export` por
`export`, que vivia de uma isenção. A troca que é uma função conta como falta quando devolve o texto igual ou quando recusa.

**Provado nas 57, no mesmo instrumento:**
1. Com o código de hoje, as 7 baterias com faltas abortam com o código 3 **sem rodar suíte nenhuma**, e listam as mesmas 59.
2. Nas outras 50, injetado um trecho que passa a "aparecer 0 vezes", **as 50 abortam com o código 3 sem rodar suíte nenhuma**.
3. Uma fixture do verificador cobre, cada caso com o seu resultado: uma vez, zero, duas, encadeada certa, encadeada que só existe no
   original, função que muda, função que não muda, função que recusa e controle.

Os 59 trechos **não foram reapontados** neste PR. Reapontar é reescrever a mutação contra o código novo, e conferir que ela ainda
derruba o que dizia. É trabalho de cada bateria, e cada uma delas fica parada (código 3) até lá.

## O corolário aplicável ANTES do defeito existir

**Bateria nova nasce chamando `exigir_trecho_unico` antes da primeira suíte.** E, ao mudar código que uma bateria muta, rode a
bateria inteira, ou ao menos o verificador. Rodar só as mutações que você acha que mudaram é o gesto da aparição 3.

Sinais, em ordem de força:
1. A bateria tem um ramo para "trecho não achado" que não termina em abortar.
2. O placar soma vivas e não aplicadas na mesma lista.
3. O PR mexe num arquivo que uma bateria muta, e a bateria não rodou no PR.
4. A rodada foi parcial (`mutacoes.py X Y`).

## As ressalvas de método — o que a medição NÃO diz

- **Não diz que as outras 1.583 mutações morrem.** Diz que o trecho delas aparece uma vez. Se a suíte as derruba é o placar de cada
  bateria, que esta medição não rodou: os subprocessos estavam desligados.
- **Não mede desde quando cada uma das 59 está sem trecho.** A coluna "no commit da própria bateria" dá o início do intervalo; o fim
  é hoje. Achar o commit exato que tirou cada trecho exigiria percorrer a história do arquivo alvo, e não foi feito.
- **Não cobre baterias fora de `main`.** A do #258 (`orcamento-ia-arquivo/mutacoes.py`) ainda imprime `NAO APLICADA` e soma às
  vivas; ela passa a chamar o verificador no próprio #258.
- **Não é portão.** Nenhum CI roda as baterias (`portao-que-nao-alcanca.md`). O verificador falha alto quando alguém roda a bateria;
  se ninguém roda, nada acusa. Um portão possível, não implementado: um job que rode só o verificador de cada bateria, sem suítes, em
  segundos.

## Relação com as outras regras

São as vizinhas de grupo, do mesmo lado: o instrumento de medida estragando o que mede ou o que mediria.
- `mutacao-na-arvore-de-trabalho.md`: o harness altera o código que outro passo lê.
- `harness-sobrescrito-por-nome.md`: um harness apaga outro.
- O artefato de harness que entra no commit (`.bak`, `__pycache__`), nomeado pelo dono do produto e ainda sem página própria.
- Esta página: o harness deixa de mexer no código e continua dando placar.

`teste-que-nao-exercita.md` é a mesma pergunta feita a um teste: a asserção falharia sem a correção? Aqui, a mutação trocou alguma
coisa? `instrumento-que-nao-enxerga.md` decidiu a fixture do instrumento, e foi ela que achou os dois defeitos dele.
`portao-que-nao-alcanca.md` é a ressalva de não haver portão. `registro-de-classe.md` decidiu a forma desta página.
