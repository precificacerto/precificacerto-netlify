# Portão Que Não Alcança

> **Esta regra é independente da correção que a originou.** Nasceu na rodada em que o motor
> passou a receber os tributos separados, porque foi ali que o espelho da edge quebrou e os
> gates não viram, mas não depende dela.

## O critério

Formulação do dono do produto, registrada como está:

> Os três gates obrigatórios do job `gates` ficam verdes com o espelho da edge quebrado.

A transposição de `teste-que-nao-exercita.md` para o outro instrumento. Lá o critério é *cada
asserção precisa FALHAR sem a sua correção*. Aqui: **cada portão precisa FICAR VERMELHO quando
o defeito que ele declara barrar existe de verdade.**

Um portão verde não prova que o que ele protege está inteiro. Prova que **aquele portão**
passou. Quando o instrumento não alcança o que o portão diz proteger, o verde é decorativo:
ele existiria igual com o defeito presente — e existiu, hoje, medido.

## Por que a distinção é difícil de ver

Porque o portão **parece** proteger. Ele tem nome bom, está no job chamado `Gates obrigatórios`,
o comentário do arquivo diz `falha aqui bloqueia o merge`, e o verde chega. O painel do PR
mostra três checks verdes e um diagnóstico, e a leitura natural é que três coisas foram
verificadas.

O que não aparece na leitura é o **alcance** de cada um. `next build` verde parece dizer "o
projeto compila"; ele diz "o Next emitiu os bundles", e com `ignoreBuildErrors: true` essas duas
frases não são a mesma. `check-pricing-engine` verde parece dizer "o espelho está bom"; ele diz
"os dois arquivos são iguais" — e dois arquivos igualmente quebrados são iguais.

E o instrumento que **alcançava** o defeito estava rodando o tempo todo, no job ao lado, com
`continue-on-error: true`. Ele ficou vermelho e não bloqueou nada. O sinal existia; o portão é
que não estava nele.

## As aparições

| # | Portão | O que ele afirma | O que ele realmente alcança |
|---|---|---|---|
| 1 | `npm run build` (gate obrigatório) | que o projeto compila | `next.config.js` traz `typescript: { ignoreBuildErrors: true }` e `eslint: { ignoreDuringBuilds: true }`. O build **não checa tipo nenhum, em arquivo nenhum**, e não roda lint. Verde com 384 erros de tsc na árvore |
| 2 | `npm run check-pricing-engine` (gate obrigatório) | que o espelho da edge está sincronizado | compara o checksum do conteúdo lógico entre fonte e espelho. Prova IGUALDADE entre os dois arquivos, nunca que qualquer um dos dois resolve seus imports. Verde com o import morto presente nos dois |
| 3 | `npm run test:ci` (gate obrigatório) | que o comportamento está preservado | o jest importa `src/utils/pricing-engine.ts`, a fonte. O espelho de `supabase/functions/` não é importado por teste nenhum — é código que só roda no Deno, em produção. Verde, 1.717 casos, nenhum deles toca o arquivo quebrado |
| 4 | `npm run typecheck` (`diagnostics`) | é o único que alcança `supabase/functions/` — o `tsconfig.json` inclui `**/*.ts` e exclui só `node_modules` | roda com `continue-on-error: true` e não bloqueia. Ficou vermelho, corretamente, e não impediu nada |
| 5 | `npm run test:legacy-guard` | a story `mrm-v2-s2.1` marca `[x]` em *"Regra CI (ESLint custom ou teste de regressão) bloqueando reintrodução"* | o script existe e **nunca é executado**: não está no `ci.yml`, não há `.husky/`, não há hook ativo em `.git/hooks/`, e o `jest.config.js` não o chama. Portão declarado que nunca é acionado |

As cinco têm a mesma assinatura: **o painel fica verde e a proteção declarada não foi
exercida.** A #5 é variante — lá nada fica vermelho porque nada roda, nas outras nada fica
vermelho porque o instrumento não alcança. A distinção está registrada em vez de dissolvida,
conforme o limite de `registro-de-classe.md`.

### A medição de hoje, que é a evidência

Estado montado de propósito: o `pricing-engine.ts` importando `./external-ops-coefficient`, que
existe em `src/utils/` e **não** existe em `supabase/functions/calc-tax-engine/`. Espelho
sincronizado por `npm run sync-pricing-engine`, portanto idêntico à fonte e com o import morto.

| Portão | Resultado no estado quebrado |
|---|---|
| `npm run test:ci` | **verde** — 98 suítes, 1.717 passed, exit 0 |
| `npm run check-pricing-engine` | **verde** — `checksums match`, exit 0 |
| `npm run build` | **verde** — exit 0 |
| `npx tsc --noEmit` | **384** erros contra 382 da baseline, os dois novos no espelho: `TS2307 Cannot find module './external-ops-coefficient'` e `TS7006` como consequência |

Os três obrigatórios passaram. Quem pegou foi a medição manual do `tsc`, feita fora do CI por
exigência de `baseline-measurement.md`.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`. As aparições #1 a #4 saíram da leitura do `ci.yml`,
do `next.config.js` e do `tsconfig.json` no mesmo dia. A #5 veio de procurar por outros portões
declarados no repositório e conferir, um a um, se alguém os chama — e é a única que não foi
provocada por esta rodada. Nenhuma sexta foi forçada.

### Uma correção de registro, que é minha

O enunciado que abriu este registro dizia *"`next build` não typechecka `supabase/functions/`"*.
Isso veio de um relatório meu e está incompleto de um jeito que importa: o `next build` não
typechecka **nada**, por configuração explícita no `next.config.js`. Se o alcance dele fosse
apenas "tudo menos `supabase/functions/`", o furo seria estreito. Não é: erro de tipo em
`src/pages/` também passa por esse portão sem ser visto.

## O corolário aplicável ANTES do defeito existir

**Antes de chamar um check de portão, pergunte o que ele fica vermelho.** Não o que ele
verifica — o que o faz falhar.

Três perguntas, na ordem em que custam menos:

1. **Se eu introduzir o defeito que este portão existe para barrar, ele fica vermelho?** Se não,
   ele não é o portão daquele defeito, por melhor que seja o nome.
2. **O portão alcança o ARQUIVO em questão?** Código que só roda no Deno não é importado por
   teste nenhum, não entra no `next build`, e sobra para o `tsc` completo — que é o único
   instrumento do repositório que o enxerga.
3. **O portão roda, e bloqueia?** São duas perguntas, não uma. `continue-on-error: true` roda e
   não bloqueia. Script fora do `ci.yml` nem roda.

E o corolário que decide desenho, não post-mortem: **quando um arquivo é mantido por cópia,
o check da cópia prova igualdade, nunca sanidade.** Igualdade é uma propriedade entre os dois
arquivos; sanidade é uma propriedade de cada um. Um portão de igualdade precisa de um portão de
sanidade ao lado, ou a cópia propaga o defeito com o carimbo de conforme.

## As ressalvas de método — o que a medição de hoje NÃO diz

- **Não diz que os gates são inúteis.** `test:ci` pegou defeito real muitas vezes nesta
  campanha. O que ela mede é o ALCANCE de cada um, não o valor.
- **Não diz que a edge está quebrada em produção hoje.** O commit `f72d0bc` corrigiu o espelho
  por inversão de dependência antes de existir. A medição foi feita num estado montado de
  propósito e desfeito em seguida.
- **Não mede o `lint`.** Ele também roda em `diagnostics` com `continue-on-error`, e o
  `next build` o ignora por `ignoreDuringBuilds`. Não foi investigado nesta rodada.
- **Não estabelece que o `tsc` bloqueante seria verde.** Ele traz 382 erros pré-existentes nesta
  árvore — a contagem de `main` não foi medida nesta rodada e o próprio `ci.yml` fala em
  *"centenas de erros pré-existentes em main"*. Qualquer correção do furo por esse lado precisa
  resolver essa dívida primeiro, e é
  exatamente por isso que o `continue-on-error` está lá. O furo não é descuido — é uma dívida
  conhecida com consequência não catalogada.

## A correção candidata — NÃO implementada

A escolha fica para quem for mexer no CI. Duas rotas, com o custo de cada uma:

**(a) Tirar o `continue-on-error` do `typecheck`.** Cobre o caso inteiro, porque o `tsc` é o
único instrumento que alcança `supabase/functions/`. Custo: os 382 erros pré-existentes passam
a bloquear todo merge no dia seguinte. Inviável sem uma etapa antes — congelar a contagem e
falhar só no aumento, ou limitar o escopo bloqueante a um subconjunto de caminhos.

**(b) Fazer o `check-pricing-engine` resolver imports além do checksum.** Cobre só o espelho,
que é onde o defeito nasce, e não mexe na dívida de tipo. Custo: o script passa a precisar
entender módulos, e o portão fica específico de um arquivo — o próximo arquivo espelhado não
herda a proteção.

Não são exclusivas. A (b) é barata e estreita, a (a) é larga e cara.

## Relação com as outras regras

`teste-que-nao-exercita.md` é a origem do critério, aplicada ao caso do teste: lá quem escreve a
asserção é quem acabou de escrever a correção. Aqui o ponto cego não é de autoria, é de
**alcance do instrumento**, e por isso esta página é própria em vez de uma seção lá.
`copia-divergente.md` trata do defeito que o `check-pricing-engine` existe para impedir — esta
página registra que o portão dele prova menos do que o nome promete. `baseline-measurement.md`
lista `npm run build` entre os checks a medir, sem dizer que ele ignora erro de tipo; quem ler
as duas junto fica com o quadro certo. E é ela que manda medir o `tsc` à mão, o que foi a única
razão de o furo ter aparecido.
