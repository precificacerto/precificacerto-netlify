# A Mutação na Árvore de Trabalho

> Registrada em 08/11/2026, no #247, a partir de um tropeço do assistente. Vale para todo harness que **altera arquivos do
> repositório para medir** — as baterias de mutação de `scripts/harness/*/mutacoes*.py`, e qualquer script que troque um trecho,
> rode os testes e restaure.

## O critério

Formulação do dono do produto, registrada como está:

> NÃO RODE HARNESS DE MUTAÇÃO EM PARALELO com trabalho na mesma árvore. Foi a janela que deixou uma mutação aplicada entrar num
> commit. Harness de mutação roda sozinho, ou numa cópia separada. Você já fez isso antes com worktree; passe a ser sempre.

**Enquanto um harness de mutação roda, a árvore de trabalho não é o código: é o código com uma mutação aplicada.** Tudo o que lê a
árvore nesse intervalo — `git add -A`, um commit, outra bateria, o `test:ci`, o lint, o build — lê o código mutado, ou o arquivo
de cópia que o harness deixou ao lado (`.bak`).

## Por que a distinção é difícil de ver

Porque o harness **restaura** ao fim de cada mutação, e por isso parece inofensivo. A janela em que o arquivo está mutado dura o
tempo de uma suíte — segundos, minutos —, e se repete a cada mutação. Um comando que cai dentro dela não vê nada de errado: o
arquivo tem sintaxe válida, compila, e a diferença é de um operador ou de uma linha. O `git status` mostra o arquivo modificado,
mas ele estava modificado também pela mudança de verdade do PR.

E o harness em segundo plano não avisa que está no meio de uma mutação. Quem dispara outro comando "enquanto espera" não sabe em
qual estado a árvore está naquele instante.

## As aparições

| # | Quando | O que rodava em paralelo | O que entrou | Estado |
|---|---|---|---|---|
| 1 | 08/11/2026, #247 | o harness `levantamento-de-barras/mutacoes.py` em segundo plano, e um segundo harness lançado na mesma árvore | o `git add -A` de um commit pegou `conversa-da-ia.ts` com uma mutação aplicada e o `conversa-da-ia.ts.bak` do harness (1.791 linhas); a árvore ficou, ao fim, com outra mutação em `levantamento-de-barras.ts` | **corrigido antes do push**: o commit foi desfeito, o código restaurado do commit que passou nos portões (`f11f04c7`) e comparado por `git diff --stat` (nenhuma diferença em `src/`), e os harness rodaram de novo, um de cada vez |

Uma aparição. Pelo `registro-de-classe.md`, é anedota, e não critério de padrão; está aqui como regra de método do dono do produto,
que não depende de contagem.

## O remédio

1. **Harness de mutação roda sozinho.** Nada mais na mesma árvore enquanto ele roda: nem commit, nem outro harness, nem portão.
   Se ele roda em segundo plano, a espera é pelo aviso de término dele (`instrumento-que-se-enxerga.md`, o remédio 1), e só depois
   vem o próximo comando.
2. **Ou numa cópia separada**, quando houver trabalho a fazer em paralelo: um `git worktree` próprio para a bateria, criado do
   commit que se quer medir. A árvore de trabalho fica intocada.
3. **Antes de commitar depois de uma bateria, confira que a árvore é o código:** `git status` sem `.bak` nem arquivo inesperado, e
   `git diff` do que vai entrar, olhado — não `git add -A` às cegas.

## O corolário aplicável ANTES do defeito existir

Antes de lançar qualquer coisa em segundo plano que **escreve** em arquivos versionados, pergunte o que mais vai ler esses arquivos
até ela terminar. Se a resposta não for "nada", a bateria vai para uma worktree.

## As ressalvas de método

- **Não mede quantas vezes isso já aconteceu sem ser notado.** A aparição 1 foi vista porque o `.bak` apareceu no `git status`; uma
  mutação de um operador, restaurada a tempo, não deixaria rastro.
- **Não diz que os harness estão errados.** Restaurar ao fim de cada mutação é o desenho certo para uma árvore usada só por eles.

## Relação com as outras regras

`instrumento-que-se-enxerga.md` é a vizinha: lá o instrumento se confunde com o que mede (o `pgrep` que casa consigo); aqui o
instrumento **altera** o que outro passo lê. O remédio da espera (o aviso de término, não o laço) é o mesmo. `portao-que-nao-alcanca.md`
explica por que os portões não pegariam isto: o `test:ci` rodado na janela mediria o código mutado. `trabalho-que-vive-no-container.md`
é a razão de o erro ter sido barrado a tempo: o commit ainda não tinha sido empurrado.
