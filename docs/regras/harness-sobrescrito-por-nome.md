# O Harness Sobrescrito por Nome

> Registrada em 09/11/2026, no #256, a partir de um tropeço do assistente. Vale para todo harness de `scripts/harness/` — os de
> migração e os de código — e para qualquer arquivo novo cujo caminho é escolhido pelo nome do assunto.

## O critério

Formulação do dono do produto, registrada como está:

> Harness novo nasce em diretório próprio e o nome se confere antes de escrever. Um harness sobrescrito deixa de matar as mutações que
> matava e nada acusa.

**O diretório de um harness é escolhido pelo NOME do assunto, e assuntos vizinhos têm nomes vizinhos.** `orcamento-ia-precificacao` é o
nome natural tanto para o harness da migração da precificação quanto para o harness da tela da precificação — e o segundo, escrito com o
mesmo `mutacoes.py`, apaga o primeiro.

## Por que a distinção é difícil de ver

Porque escrever o arquivo **não falha**. A ferramenta de escrita sobrescreve sem perguntar, o `git status` mostra o arquivo como
modificado (e não como novo) numa linha entre outras, e o harness novo roda verde — ele é o que foi escrito.

E o dano é exatamente a ausência de sinal: o harness antigo deixa de existir, as mutações que ele matava deixam de ser aplicadas, e
nenhuma suíte, nenhum portão e nenhum CI roda um harness de migração. A cobertura some sem que nada fique vermelho
(`portao-que-nao-alcanca.md`).

## As aparições

| # | Quando | O que foi escrito | O que foi apagado | Estado |
|---|---|---|---|---|
| 1 | 09/11/2026, #256 | o harness de mutação do modo "orçamento" da tela de Produtos, em `scripts/harness/orcamento-ia-precificacao/mutacoes.py` | o `mutacoes.py` da migração `20261109000002`, no mesmo caminho (as mutações da provisão da precificação) — entrou assim no commit `45fee394` | **corrigido no commit seguinte** (`933fb313`): o arquivo voltou à versão de `c262b6c9`, a última antes da sobrescrita — md5 `bfe7a3209b687473809575f622873c2c` nos dois, conferido por `git show <commit>:<arquivo> \| md5sum` —, e o harness da tela foi para `scripts/harness/orcamento-ia-precificacao-tela/` |

Achado pelo próprio autor ao conferir `git ls-files` da pasta, depois do push. Uma aparição: pelo `registro-de-classe.md`, é anedota, e
está aqui como regra de método do dono do produto, que não depende de contagem.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, em 09/11/2026: os 54 diretórios de `scripts/harness/`, e, para cada `mutacoes*.py` com mais de um
commit, o assunto de cada commit. Todos os outros foram alterados por commits do mesmo assunto (o harness seguindo o trecho que mede).
**Nenhuma segunda aparição foi forçada.**

## O remédio

1. **Antes de escrever um harness, confira que o diretório não existe:** `ls scripts/harness/<nome>` sem resultado. Se existe, o harness
   novo vai para outro nome — o assunto mais um sufixo (`-tela`, `-codigo`) —, nunca para dentro do existente.
2. **Ao commitar, o arquivo de harness aparece como NOVO** (`A`, ou `??` antes do `add`). Um `M` num harness que não era o assunto do
   commit é o sinal desta classe.
3. **Restaurar se confere por hash, não a olho:** o md5 do arquivo restaurado contra o do último commit em que ele estava certo.

## O corolário aplicável ANTES do defeito existir

Antes de criar um arquivo cujo caminho você derivou do nome do assunto, pergunte se outro assunto de nome vizinho já está lá. A pergunta
custa um `ls`; a resposta errada custa uma cobertura que some calada.

## Relação com as outras regras

`mutacao-na-arvore-de-trabalho.md` é a vizinha: lá o harness **altera** o código que outro passo lê; aqui um harness **apaga** outro
harness. As duas são do mesmo lado — o instrumento de medida estragando o que mede ou o que mediria —, e a terceira do grupo, nomeada
pelo dono do produto, é o artefato de harness que entra no commit (o `.bak` e o `__pycache__`): ainda sem página própria, e o `.bak`
aparece como sintoma em `mutacao-na-arvore-de-trabalho.md`. `portao-que-nao-alcanca.md` explica por que nada acusa: nenhum portão roda os harness de migração.
