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

## Ressalvas de método

1. **É UMA ocorrência.** Não há tabela de aparições porque não há aparições a tabelar. A busca
   por precedentes foi feita e está na seção seguinte.
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
