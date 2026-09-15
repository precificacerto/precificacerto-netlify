# A Decomposição na Tela

> **Esta regra é independente do regime tributário.** Ela vive fora de
> `cascata-lucro-real.md` de propósito: aquela página declara, no primeiro parágrafo, que
> "fora do Lucro Real a cascata tributária muda e estas regras não se aplicam". Os requisitos
> abaixo **não dependem do regime** — a tabela da decomposição é a mesma no Simples, no MEI e
> no Lucro Presumido, porque o que ela fixa é COMO O NÚMERO É APRESENTADO, não qual número é.
> Guardá-los lá os faria herdar um escopo que não é o deles, e quem revisasse o regime um dia
> poderia levá-los junto sem perceber.

## De onde isto veio, e por que sair de lá era o ponto

A regra estava num PDF fora do repositório — o relatório "Motor RRO — Lucro Real", seções 5.4,
6.2 e 6.4. É a condição exata que `razao-longe-da-restricao.md` descreve: a restrição é
IMPOSTA no componente e a razão dela mora noutro lugar, então quem vem mexer na tela lê o
ponto onde ela é declarada — e esse é justamente o que está mudo.

O caso que a originou não é hipotético. Uma coluna congelada à esquerda, um rótulo "% médio" e
um `white-space: nowrap` parecem escolha de estilo para quem chega depois, e escolha de estilo
convida a ser "melhorada". Nenhuma das três é estilo.

**O que NÃO está aqui, e onde está:** ordem das seções, montante a carregar, critérios de
rateio, item manual sem gross-up, coluna Total como soma, congelados, ordem do DRE e
distribuição do RRO são **R10 a R20 de `cascata-lucro-real.md`** — já versionados, e não
duplicados aqui. Esta página cobre só o que faltava.

---

## As colunas da decomposição, e a função de cada uma

| Coluna | Conteúdo | Por que existe |
|---|---|---|
| **Demonstrativo** | A linha do DRE. **Congelada à esquerda.** | É o eixo de leitura: sem ela fixa, rolar até a sexta coluna de produto deixa o leitor sem saber que linha está lendo |
| **Base de cálculo** | O valor sobre o qual o percentual incide | Sem a base, o percentual é um número solto e não dá para conferir a conta |
| **Percentual** | Alíquota ou peso. Com produtos heterogêneos, **rotulado "% médio"** | Ver a seção seguinte — é a coluna que mente se não se declarar |
| **Produto 1 … N** | O valor da linha naquele produto. **Scroll horizontal.** | É a correção inteira: sem coluna por produto não há como ver qual produto corroeu a margem |
| **Total** | Soma das colunas de produto (R16) | Nunca percentual aplicado sobre o total |
| **AV %** | Análise vertical sobre a **receita após descontos** | A base é após desconto, não a receita bruta: é o que torna a corrosão visível |

**A última linha é o RESIDUAL, e ela exibe R$ 0,00.** Diferente de zero → **alerta explícito**,
não um número em cinza ao lado dos outros. Um residual fora de zero significa que a
distribuição do RRO não fechou, e os números daquela decomposição não podem ser usados. Uma
tela que o exibisse discretamente seria `portao-que-nao-alcanca.md` em forma de interface: o
sinal existe, e não interrompe ninguém.

---

## "% MÉDIO" — o rótulo é a regra, não um detalhe de redação

Com produtos de alíquotas diferentes no mesmo documento, o percentual da linha de total **não
é uma alíquota**: é média ponderada derivada dos produtos. No cenário de referência, com ICMS
de 17,00% num produto e 12,00% no outro, o percentual do total sai **15,7324%** — um número
que nenhum dos dois produtos tem e que a construção nunca usou.

Exibi-lo sem rótulo o transforma numa alíquota aos olhos de quem lê. É por isso que o rótulo
vai na **coluna Percentual**, junto do número, e não na descrição da linha: quem confere
alíquota olha a coluna, não a prosa ao lado.

**E o contrário também é regra: com a MESMA alíquota em todos os produtos, ou com um produto
só, o percentual É a alíquota e NÃO se rotula "% médio".** Rotular tudo como média é o erro
espelhado — chama de derivado o que é cadastrado, e ensina o leitor a ignorar o rótulo.

> A distinção é a mesma de `ausente-vs-falso.md`, num material diferente: lá o default
> silencioso afirma um valor que ninguém apurou; aqui o percentual sem rótulo afirma uma
> alíquota que ninguém cadastrou.

---

## Nenhum texto ou valor truncado, em nenhuma coluna, em nenhum breakpoint

Sem `ellipsis`, sem largura fixa em célula de valor, sem quebra que esconda dígito.

A razão é que **um número truncado não parece truncado**. `R$ 1.234...` avisa; `R$ 1.23` não —
ele parece um valor legítimo, e o leitor não tem como saber que faltou ordem de grandeza. A
saída, quando não cabe, é **rolar a tabela**, nunca espremer a célula.

Daí as duas decisões de layout serem a mesma decisão: a coluna Demonstrativo fica grudada à
esquerda **para que** as colunas de produto possam rolar em vez de encolher.

**Formato brasileiro obrigatório:** `R$ 1.234,56` e `12,34%`. Valor ausente exibe travessão,
jamais `R$ 0,00` nem `0,00%` — zero é uma afirmação sobre o mundo, e "não apurado" não é zero.

---

## Desconto: os dois números, lado a lado

Com repasse no documento, **o desconto nominal e o desconto efetivo sobre os produtos
divergem** — porque itens manuais e acréscimos saem inteiros (R14) e o desconto recai
integralmente sobre os produtos.

**Exibir os dois lado a lado é obrigatório.** Exibir só o nominal faz o usuário conceder mais
desconto do que pensa: ele lê 5% e a margem dos produtos cai por mais que isso. Exibir só o
efetivo desencontra a tela do que foi digitado e do que vai no documento.

---

## O DRE tem blocos, e os cabeçalhos são parte da regra

A ordem das linhas é R19. O que esta página acrescenta são os **agrupamentos** — a leitura fica
outra sem eles, porque uma dedução tributária e uma dedução de custo lidas na mesma sequência
parecem a mesma natureza de coisa:

```
(−) DEDUÇÕES — TRIBUTOS POR FORA        IBS · CBS · IS · IPI
(−) DEDUÇÕES — TRIBUTOS POR DENTRO      ICMS · ISS · PIS/COFINS
(−) CUSTOS E DESPESAS — congelados      Custos · Despesas operacionais · Comissão RT
    DISTRIBUIÇÃO PROPORCIONAL DO RRO    Comissão · Lucro · IRPJ · CSLL
```

O rótulo **"congelados"** no terceiro bloco não é ornamento: é o que explica, na própria tela,
por que aquelas linhas não encolhem com o desconto (R18) — e é justamente isso que revela a
corrosão da margem.

### A linha final: LUCRO DA VENDA

O DRE termina com o **lucro da venda em R$ e como percentual, contra o percentual
cadastrado**. No cenário de referência: R$ 23.409,54, ou 6,79% da receita após desconto,
contra os 8,00% cadastrados.

Os dois números juntos são o ponto da decomposição inteira. O lucro sozinho não diz nada; o
par diz **quanto do lucro cadastrado o desconto consumiu**, e a coluna por produto diz **em
qual produto**.

**Ela NÃO é uma linha do DRE.** A última linha da tabela é o RESIDUAL, e isso é requisito
desta mesma página. O lucro da venda é destaque SEPARADO, abaixo — na planilha é a linha 88,
depois do DRE que termina na 86. Enfiá-lo no fim da tabela tiraria do residual o lugar que a
regra lhe dá.

### SÃO DUAS BASES, e confundi-las atribui ao desconto o que é do repasse

A medição, feita ao implementar a linha e registrada porque desmentiu quem a formulou:

| Desconto | Sobre a receita APÓS DESCONTO | Sobre a RECEITA DE PRODUTOS | Cadastrado |
|---|---|---|---|
| 0% | **7,7158%** | **8,0000%** | 8,00% |
| 5% | **6,7880%** | **7,0517%** | 8,00% |

**Mesmo com desconto ZERO, o percentual sobre a receita após desconto fica abaixo do
cadastrado.** A receita após desconto inclui itens manuais e acréscimos — R$ 12.895,87 no
cenário — que são REPASSE e não geram lucro. Os 0,2842 pontos de diferença ali não são
desconto: são repasse.

Consequência para a tela, e é ela que importa: **a diferença exibida como corrosão é contra o
percentual sobre PRODUTOS**, nunca contra o da receita após desconto. Com 5% de desconto a
queda total é de 1,2120 pontos, e só 0,9482 é do desconto. Atribuir a queda inteira a ele
seria exibir um número que a construção nunca produziu — a mesma falha que
`regime-e-segmento-determinam-a-construcao.md` cataloga, num lugar em que ela é visível.

Os dois percentuais aparecem na tela, cada um com a sua base escrita ao lado. O da receita
após desconto é o que a seção 6.2 publica; o sobre produtos é o comparável com o cadastrado.

> A suposição de que "sem desconto o apurado volta aos 8%" era minha, e caiu no primeiro caso
> de teste escrito para confirmá-la. É a forma de
> `hipotese-derrubada-pela-propria-medicao.md`: a hipótese e a medição que a desmente têm o
> mesmo autor, com minutos de intervalo, e a hipótese chegou como justificativa de um passo,
> não como conjectura a testar.

---

## O corolário aplicável ANTES do defeito existir

**Antes de mudar qualquer coisa nesta tabela, pergunte o que a escolha atual estava
impedindo.** Três candidatas parecem estilo e não são:

1. **A coluna congelada à esquerda** impede que o leitor perca a linha ao rolar.
2. **O `nowrap` nas células de valor** impede que um número truncado passe por um número
   legítimo.
3. **O rótulo "% médio"** impede que uma média ponderada passe por alíquota cadastrada.

Se a razão de mexer numa delas for "fica melhor assim", ela não venceu nenhuma das três.

E a regra do lado de quem propõe é a de `razao-longe-da-restricao.md`: **restrição sem razão
citada no ponto de declaração não autoriza remoção — autoriza pergunta.** É por isso que o
componente e o módulo apontam para esta página no cabeçalho, em vez de deixarem a citação
morar só aqui.

## Relação com as outras regras

`cascata-lucro-real.md` tem R10 a R20 — a ordem das seções, o rateio, os congelados, a ordem
do DRE e a distribuição do RRO. Esta página cobre o que **a tela** acrescenta, e nada do que
já está lá. `razao-longe-da-restricao.md` é a razão de esta página existir, e o motivo de a
citação ir também no ponto de declaração. `ausente-vs-falso.md` explica por que o travessão
não é `R$ 0,00` e por que o percentual sem rótulo afirma o que não foi apurado.
`portao-que-nao-alcanca.md` é o que o residual em cinza seria. `registro-de-classe.md`
decidiu que isto mora em arquivo próprio, e por quê.
