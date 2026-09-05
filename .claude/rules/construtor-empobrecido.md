# Construtor Empobrecido

> **Esta regra é independente da correção que a originou.** Nasceu no PR do custo no snapshot
> porque foi ali que o mecanismo precisou ser nomeado, mas não depende dele.

## Por que NÃO é a quarta aparição da cópia divergente

O #27, o #28 e o #45 são **cópia divergente**: o mesmo mapeamento escrito duas vezes, uma
delas esquecendo um campo. A tentação de contar este caso como o quarto é forte — o resultado
é idêntico, um campo não chega e nada falha. **O método do `registro-de-classe.md` manda
verificar o MECANISMO, não o resultado**, e os três discriminantes aplicados separam:

| | cópia divergente (#27, #28, #45) | construtor empobrecido |
|---|---|---|
| **intenção** | as duas rotas eram para ser IDÊNTICAS e derivaram | as duas rotas **nunca** foram para ser idênticas: uma monta a entrada do motor em runtime, a outra grava o snapshot |
| **modo de falha** | o campo existia na interface, o `select` não o trazia, chegava `undefined` | o campo existia como **opcional com default**, e nenhum produtor o preenchia |
| **detectabilidade** | acha-se **comparando dois blocos parecidos** | os dois blocos **não se parecem** — 120 linhas num arquivo, 40 noutro; nenhum diff os aproxima |

**O critério de decisão foi a detectabilidade**, porque a utilidade de uma classe está em
ensinar ONDE PROCURAR. A intenção é ambígua (as duas rotas produzem o mesmo tipo para o mesmo
consumidor, então "nunca foram para ser idênticas" é discutível) e o modo de falha é próximo
demais (`?? null` e `?? 0` são o mesmo gesto). O que é inequivocamente diferente é a busca:

- cópia divergente: **ponha as duas rotas lado a lado.**
- construtor empobrecido: **enumere quem produz o mesmo tipo e compare a COBERTURA DE CAMPOS.**

E o remédio também difere. Lá é módulo único mais teste de contrato ligando a lista de
colunas à interface. Aqui é **tornar o campo obrigatório**, para o compilador recusar quem
esquecer — não há lista a afirmar, há tipo a fechar.

## O critério

**Dois produtores do mesmo contrato, um deles com menos campos, e nada falha** — porque os
campos que faltam são opcionais com default neutro, e default neutro não levanta erro.

O default é o que torna o defeito silencioso. `cp_unit?: number` com `?? 0` aceita a omissão e
afirma "o custo é zero", que é uma frase sobre o mundo, não uma lacuna. É a mesma distinção de
`ausente-vs-falso.md`, com o default **na assinatura da função** em vez de numa coluna.

## As aparições

| # | Contrato | Produtor completo | Produtor empobrecido | O que sumia |
|---|---|---|---|---|
| 1 | `ReapurationInput` → `calculateMarginReapuration` | `buildMotorInput` (`mrm-orchestrator.ts:300`) | `hydrateItemSnapshot` (`lib/items-snapshot.ts`) | `cp`, `mod`, `dop` — o RRO virava o preço inteiro |
| 2 | `ItemTaxRates` → motor | `legacy-adapter.ts:856` (V17) lê `das_pct` | `margin-reapuration.ts` **não tem o campo** | a alíquota por item; o imposto sai zerado do snapshot |

As duas com a mesma assinatura: o valor é calculado corretamente, entregue a um consumidor que
o lê e a outro que não tem onde recebê-lo, e o segundo caminho não reclama.

### Nota da busca por precedentes

A busca foi feita conforme `registro-de-classe.md`. Ela **rejeitou** as três aparições da
cópia divergente (#27, #28, #45) pelo discriminante da detectabilidade, e **não forçou** uma
terceira linha: duas aparições honestas mais o registro do porquê valem mais que quatro
empurradas para fechar uma contagem. O limite do #41 vale aqui e foi o que decidiu a forma
desta página.

## O corolário aplicável ANTES do defeito existir

**Campo opcional com default neutro num contrato de cálculo é um defeito à espera de
produtor.** Se o valor é necessário para o resultado estar certo, ele é **obrigatório** — e o
custo de torná-lo obrigatório é exatamente o benefício: o compilador enumera, na hora, todos
os produtores que não o preenchem.

Foi o que aconteceu ao fechar a aparição 1: tornar `cp`, `mod` e `dop` obrigatórios fez o
`tsc` apontar os três chamadores restantes de uma vez. Nenhum deles teria sido encontrado por
leitura.

### Como reconhecer

1. Um tipo de entrada é construído em **mais de um lugar**.
2. Os construtores estão em arquivos diferentes e **não se parecem**.
3. O tipo tem campos **opcionais** que participam do resultado numérico.
4. Nenhum teste compara a cobertura de campos entre os construtores.

Quando os quatro coincidem, procure a diferença de cobertura antes de procurar o erro de
conta — o número errado vem da entrada vazia, não da fórmula.

## Relação com as outras regras

`registro-de-classe.md` é o método que decidiu que esta página existe separada. 
`ausente-vs-falso.md` cobre o significado do default; esta cobre **onde o default se esconde**
— na assinatura, e não no schema. `fato-vs-referencia.md` trata de ler o parâmetro errado;
esta trata de não ler parâmetro nenhum.
