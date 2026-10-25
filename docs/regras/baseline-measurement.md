# Procedimento de Medição de Baseline

Regras para comparar um branch com o `main` ao validar um PR. **As três andam juntas** — cada
uma cobre uma forma diferente de a medição mentir, e nenhuma delas basta sozinha.

Duas medições enganosas já aconteceram por procedimento de baseline, não por defeito no
código. Ambas custaram investigação e quase viraram diagnóstico errado.

## As três regras

### (a) Comparar sempre contra `origin/main` EXPLÍCITO

Nunca contra o resultado de um `git stash`.

```bash
git fetch origin main
git checkout origin/main        # baseline: a árvore do main, de verdade
# ... medir ...
git checkout <branch>           # branch: a árvore do PR
# ... medir ...
```

**Por quê.** `git stash` remove apenas as mudanças NÃO COMMITADAS. O `HEAD` continua sendo o
commit do branch, então o que sobra na árvore é "o branch menos o que ainda não foi
commitado" — não o `main`. Medir ali e chamar de baseline produz dois números que já incluem
o trabalho do PR, e a diferença real desaparece.

Foi assim que o baseline do `tsc` apareceu como 387 nos dois lados, escondendo dois erros
`TS7018` que eram do branch.

### (b) `rm -f tsconfig.tsbuildinfo` antes de CADA uma das duas execuções

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit -p tsconfig.json > baseline.txt 2>&1
# trocar de árvore
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit -p tsconfig.json > branch.txt 2>&1
```

Alternativa equivalente: `incremental: false` no `tsconfig.json` durante a medição.

**Por quê.** `TS2589` ("Type instantiation is excessively deep") é um diagnóstico de ORÇAMENTO
GLOBAL de instanciação, não um erro localizado. O contador é global e o modo `incremental`
reaproveita trabalho do build anterior, então a mesma árvore produz contagens diferentes
conforme o estado do cache. Já foi demonstrado que TRÊS LINHAS DE COMENTÁRIO em `main` limpo
reproduziam a variação 385 → 386.

O "385 vs 386 intermitente" atribuído ao `TS2589` no PR #15 **era cache, não intermitência**.

### (c) Comparar por ARQUIVO + CÓDIGO DE ERRO, nunca por contagem absoluta

```bash
grep -oE "^[^(]+\([0-9]+,[0-9]+\): error TS[0-9]+" saida.txt \
  | sed -E 's/\([0-9]+,[0-9]+\)//' | sort | uniq -c | sort
```

Depois `diff` entre os dois arquivos assim normalizados. Um diff vazio é a evidência; a
contagem igual, sozinha, não é.

**Por quê.** Acrescentar linhas a um arquivo desloca o número de linha de todos os erros
abaixo. Comparar a saída crua produz um diff enorme e falso. Comparar só a contagem total
esconde a troca de um erro por outro.

## O que cada regra NÃO cobre

Esta é a razão de as três serem um bloco único:

| Regra | Cobre | Não cobre |
|-------|-------|-----------|
| (a) | Baseline medido na árvore errada | Cache contaminado; ruído de número de linha |
| (b) | Contagem que varia sem o código variar | Baseline na árvore errada; ruído de linha |
| (c) | Ruído de número de linha; troca de erros | Nada, se a medição já veio suja por (a) ou (b) |

**(c) sozinha não basta.** Sobre medição contaminada por (a) ou (b), ela ainda produz
diferença falsa — com a agravante de parecer rigorosa.

## Os outros checks

`jest`, `next lint` e `npm run build` seguem o mesmo procedimento (a): medir nas duas árvores,
comparar. Não têm cache com o problema do (b), e são contagens estáveis, mas o baseline
continua tendo que ser o `main` de verdade.

## Ao reportar

Publique os dois números lado a lado e diga explicitamente que o diff por arquivo + código
saiu vazio. Um "tsc: 385" sozinho não informa nada sobre o PR.

| Check | main | branch |
|-------|------|--------|
| `npm run build` | — | passa |
| `npx tsc --noEmit` | 385 | 385 — diff por arquivo + código vazio |
| `npx jest` | 1116/1116 | 1129/1129 |
| `npx next lint` | 612 | 612 |
