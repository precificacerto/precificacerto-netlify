# O Restauro da Mutação Apagou o Trabalho, e o Indicador Não Acusou

> **Incidente do assistente, 17/09/2026.** Registrado em `docs/registros/` e **não** como
> aparição de `.claude/rules/portao-que-nao-alcanca.md` — a afinidade é discutida no fim, e a
> decisão de contá-la ou não é do dono do produto. `registro-de-classe.md` proíbe forçar.
>
> **Nome proposto, se um dia virar regra:** `restauro-para-a-referencia-errada.md`.

## O que aconteceu

Na rodada do Repasse, com o trabalho **escrito e não commitado**, rodei o harness de mutação.
Cada mutação era aplicada com um `replace` e desfeita assim:

```python
subprocess.run(['git','checkout','--',arq])
```

`git checkout -- <arquivo>` **não desfaz a mutação: restaura o arquivo ao HEAD.** Como o
trabalho não estava commitado, a primeira restauração apagou, de uma vez, as edições de seis
arquivos — a fonte única dos grupos, o DFC inteiro, o seletor de categorias, a linha da
decomposição e dois botões.

Nada foi perdido para sempre: as edições foram refeitas a partir do próprio histórico da
sessão, e a suíte, o `tsc` e o `build` confirmaram o estado. O custo foi de tempo, e a lição
não é sobre o tempo.

## O indicador não podia acusar, e é esta a parte que importa

O harness imprimia `morta` quando a suíte ficava vermelha depois da mutação. A partir da
primeira restauração errada, **a suíte estava vermelha porque o trabalho tinha sumido** — e
`morta` continuou aparecendo, mutação após mutação.

A evidência estava na saída e eu não a li: as contagens de falha **cresciam
monotonicamente**.

```
morta  M15 …  | Tests: 48 failed
morta  M16 …  | Tests: 48 failed
morta  M17 …  | Tests: 50 failed
morta  M18 …  | Tests: 51 failed
morta  M19 …  | Tests: 53 failed
morta  M20 …  | Tests: 54 failed
```

Uma mutação por vez, desfeita entre uma e outra, não faz o número subir em escada. Esse
desenho é assinatura de **acumulação**, e estava impresso na tela.

E havia um segundo sinal, igualmente ignorado: onze mutações reportaram `padrão não achado`.
A leitura óbvia é "o padrão que escrevi está errado"; a verdadeira era "o arquivo não tem mais
o código onde o padrão morava".

**O relatório final dizia `20/20 mortas`, e ele era decorativo**: nenhuma das seis últimas
mutações foi medida contra o estado correto.

## O corolário, e ele tem duas metades

### 1. Restauro é para um ESTADO, não para uma referência

`git checkout --` restaura para o **HEAD**. O harness precisava restaurar para o **estado
imediatamente anterior à mutação**, que é outra coisa sempre que há trabalho não commitado.

O restauro certo é por cópia:

```python
shutil.copy2(arq, arq + '.bak')   # antes de mutar
...
shutil.move(arq + '.bak', arq)    # depois de medir
```

E há um segundo corolário barato que teria evitado tudo: **commite antes de mutar.** Com o
trabalho commitado, `git checkout --` teria sido inofensivo — e é justamente por isso que o
erro passou despercebido tantas vezes antes: ele só faz estrago na árvore suja.

**Arquivo NÃO RASTREADO nem sequer é restaurável por `git checkout`** — ele devolve
`pathspec did not match any file(s) known to git` e segue. A migração nova desta rodada
acumulou três mutações e ficou com três linhas a menos, e nada avisou.

### 2. O indicador precisa poder DISTINGUIR o caso de interesse

`morta` afirma "a suíte ficou vermelha". Ele não afirma "esta mutação a deixou vermelha", e
nunca afirmou — a diferença só aparece quando a suíte pode estar vermelha por outro motivo.

O portão que faltava é de uma linha, e é o que o harness tem agora:

```python
assert limpa(), f'ÁRVORE NÃO VOLTOU LIMPA depois de {nome}'
```

Ele responde exatamente a pergunta que `portao-que-nao-alcanca.md` manda fazer — *o que faz
este portão ficar vermelho?* — para o caso que interessa: a árvore ter sobrado suja. Na
segunda rodada ele não disparou nenhuma vez, e as contagens deixaram de ser monotônicas
(2, 3, 4, 1, 2, 2, 2, 3, 3, 1, 1, 3, 1, 4, 1, 8, 1, 1, 2, 1, 2, 1), que é a evidência
positiva de que não houve acumulação.

**22/22 mortas, com o portão ligado.** É esse o número que vale; o `20/20` da primeira rodada
não vale nada.

## A SEGUNDA ocorrência, 17/09/2026 — o mesmo indicador, o outro falso

Com o restauro já corrigido, o harness marcou `morta` uma mutação que ele **não tinha
medido**. A linha de contagem estava na tela:

```
morta  P1  o CONDICIONAL do LR volta a ser a RÉGUA  | Tests: 26 passed, 26 total
```

**`26 passed, 26 total`, e nenhum `failed`.** O `morta` veio de o harness ler
`Test Suites: … failed` — o que era verdade, e não pelo motivo que ele supunha: a mutação
substituía uma string que existe em **três** builders, e nos outros dois a variável
`isLrOrHibrido` não existe. A suíte **não compilou**. O total caiu de 178 casos para 26, e
zero casos exercitaram coisa alguma.

É a aparição 6 de `portao-que-nao-alcanca.md` pelo avesso, e no mesmo instrumento da primeira
metade desta página: **uma suíte que não carrega não contribui caso nenhum**, então nem o
`passed` nem o `failed` dizem o que se quer saber. Lá o número não podia subir; aqui não podia
descer.

### O portão, e ele é de uma linha

O harness passou a **contar os casos** e a comparar com o baseline de quando tudo carrega:

```python
_, _, BASE_TOTAL, _, _ = roda()      # 178, com a árvore limpa
...
carregou = (total == BASE_TOTAL)
if not carregou:   print('INCONCLUSIVA  …')   # ← o estado que não existia
elif falhou:       print('morta         …')
else:              print('SOBREVIVEU    …')
```

**O que faltava não era um teste a mais: era o terceiro estado.** O harness só sabia dizer
`morta` e `SOBREVIVEU`, e uma mutação que não compila não é nenhum dos dois — é
**INCONCLUSIVA**, e precisa ser reescrita, não contada.

Refeita para mutar só o builder do Lucro Real, ela morreu de verdade: **178 casos carregados,
3 falharam.**

### O que as duas ocorrências têm em comum, e é o que as torna uma classe

Nas duas, o harness reportou `morta` sobre uma medição que não aconteceu. E nas duas **o
número que desmentia estava impresso ao lado da palavra** — a escada de falhas na primeira, o
total de casos na segunda. O defeito não é de atenção: é de o indicador não ter poder de
discriminação para o caso de interesse, e por isso nenhuma quantidade de cuidado o corrigiria.

Com duas ocorrências a página deixa de ser anedota e passa a ser padrão. **Ainda não é
critério** — `registro-de-classe.md` fixa o limiar em quatro —, e continua morando aqui em
vez de `.claude/rules/`.

## A LIÇÃO, e é maior que o harness

Formulação do dono do produto, 17/09/2026, registrada como está:

> Mutação que não compila **não é morta nem sobrevivente — é INCONCLUSIVA**, e chamá-la de
> morta é o mesmo erro de ontem em forma nova. **O instrumento de medição precisa do mesmo
> rigor que o código medido — e ninguém estava medindo o instrumento.**

É essa última oração que fecha a página, e ela explica as duas ocorrências de uma vez.

Este repositório tem disciplina de sobra sobre o código: `teste-que-nao-exercita.md` exige que
cada asserção falhe sem a sua correção; `portao-que-nao-alcanca.md` exige perguntar o que faz
cada portão ficar vermelho; `baseline-measurement.md` prescreve como medir sem se enganar.
**Nada disso foi aplicado ao harness**, que é justamente o instrumento com que se decide se as
outras medições valem.

E o harness não era um script menor: ele é quem responde "os testes desta rodada realmente
pegam o defeito?". Um relatório dele errado **valida uma rodada inteira sem base** — foi o que
o `20/20 mortas` da primeira ocorrência fez.

### Por que ninguém o mediu, e não é descuido

Porque **o harness é escrito para medir, não para ser medido.** Ele nasce como ferramenta de
uma rodada, roda uma vez, imprime um relatório e some. Não tem teste, não tem revisor, não
entra no CI, e o sinal de que ele funcionou é o próprio relatório que ele produz — que é
exatamente o que estava errado nas duas vezes.

É a mesma assimetria de `teste-que-nao-exercita.md` num degrau acima: lá, quem escreve a
asserção é quem acabou de escrever a correção; **aqui, quem escreve o instrumento é quem lê o
resultado dele, e não há terceira parte para desconfiar.**

### As três perguntas, aplicadas ao instrumento

São as de `portao-que-nao-alcanca.md`, e elas respondem na hora quando feitas do harness em
vez do CI:

1. **Se o instrumento medisse errado, eu veria?** Se a única evidência de que ele funcionou é
   o relatório dele, não.
2. **O indicador pode assumir o valor que eu quero detectar?** `morta`/`SOBREVIVEU` é binário
   sobre um mundo de três estados — a terceira possibilidade não tinha como aparecer.
3. **Existe um estado do mundo em que o instrumento não mediu nada e não diz?** Nas duas
   ocorrências, sim: a árvore suja e a suíte que não carregou.

O custo de responder as três é o que já está no harness: uma comparação de contagem e um
`assert`. **Vinte linhas ao todo**, contra uma rodada inteira de trabalho apagado e um
relatório que não valia nada.

## Ressalvas de método

1. **São DUAS ocorrências**, ambas do mesmo harness e do mesmo mecanismo. Não há tabela
   porque duas linhas não fazem tabela; a busca por precedentes está na seção seguinte.
2. **O erro é do assistente, inteiro** — o harness é meu, a decisão de rodá-lo sobre árvore
   suja é minha, e a leitura da saída também. Ninguém pediu para mutar sem commitar.
3. **O `22/22` NÃO prova que os testes são bons**, prova que estas 22 mutações morrem. Mutação
   é amostra, não cobertura.

## A busca por precedentes

Feita sobre `.claude/rules/`.

| classe | por que não foi usada |
|---|---|
| `portao-que-nao-alcanca.md` | **é a vizinha mais próxima, e a aparição 6 é quase isto.** Lá o número conferido (`Tests: N passed`) não podia mudar no caso a detectar; aqui o indicador (`morta`) não podia FALHAR no caso a detectar, porque a suíte já estava vermelha por outro motivo. O mecanismo — *indicador sem poder de discriminação para o caso de interesse* — é o mesmo, e a **contagem monotônica era o sinal disponível e não lido**, exatamente como as duas linhas do jest naquela aparição. **Não foi incorporada como sétima porque a decisão de contar é do dono do produto**, e porque metade deste incidente (o restauro para a referência errada) não é sobre indicador nenhum |
| `baseline-measurement.md` | a regra (a) diz *"nunca contra o resultado de um `git stash`"*, pela razão gêmea: `stash` também devolve uma árvore que não é a que se pensa. **É o mesmo erro, no outro instrumento** — e é por isso que o nome proposto fala em REFERÊNCIA, não em mutação |
| `teste-que-nao-exercita.md` | trata da asserção que não distingue os dois estados do CÓDIGO. Aqui a asserção estava certa; quem não distinguia era o relatório do harness |
| `estado-relatado-vs-real.md` | trata de estado de sistema EXTERNO usado como premissa sem consulta. A árvore de trabalho não é sistema externo — e, ainda assim, a lição é parente: eu presumi o estado dela em vez de olhar |

**Nenhuma cabe inteira sem forçar**, e por isso isto mora aqui. Se o dono do produto decidir
que a metade do indicador é a sétima aparição de `portao-que-nao-alcanca.md`, esta página
passa a ser o registro só da outra metade.

## Relação com as regras

`portao-que-nao-alcanca.md` é a vizinha, e o corolário 4 dela é o que se aplica à metade do
indicador. `baseline-measurement.md` (a) é o mesmo erro com `git stash`, já versionado.
`registro-de-classe.md` decidiu que isto mora em `docs/registros/` como caso único, com a
busca registrada e sem segunda aparição forçada.
