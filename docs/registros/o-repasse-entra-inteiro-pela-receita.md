# O Repasse Entra Inteiro Pela Receita, e Só Sai Pela Despesa

> **Levantamento da assimetria do desenho (i)**, escrito a pedido do dono do produto em
> 17/09/2026: *"Quem for resolver de vez precisa achar o levantamento pronto."*
>
> **Não é registro de classe de defeito.** Não há tabela de aparições nem corolário preventivo,
> porque a assimetria não é um erro a evitar — é uma escolha tomada, com custo conhecido, e
> este arquivo existe para que o custo não precise ser redescoberto.

## O desenho escolhido — (i)

Formulação do dono do produto, registrada como está:

> **O repasse entra nas despesas, mensurando que o valor recebido teve destino.**

O dinheiro entra pela venda, como já entra hoje, e o lançamento de Repasse na despesa registra
que aquele valor **saiu**. As duas se anulam na demonstração: entra +X na receita bruta, sai
−X na dedução logo abaixo.

Implementado em 17/09/2026: grupo `REPASSE` em `EXPENSE_GROUP_KEYS`, `case` próprio no
`switch` do DFC, e **linha própria** nas três variantes de demonstração, imediatamente depois
de "(−) Devoluções e Deduções da Receita" e nunca somada a ela.

## A ASSIMETRIA, e é ela que este arquivo existe para registrar

**O lado da SAÍDA é escolhido a mão. O lado da ENTRADA não é lido por grupo nenhum.**

O resultado fica certo; o **faturamento**, não. Uma empresa que repassa R$ 100 mil num mês
exibe R$ 100 mil a mais de receita bruta e R$ 100 mil de dedução logo abaixo. O lucro está
correto e o topo da demonstração está inflado — e é o topo que vai para "quanto eu faturei".

### O mecanismo, medido em `src/pages/dfc/index.tsx`

```ts
if (entry.type === 'INCOME') {
  if ((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') && !entry.paid_date) continue
  data.receitaBruta[monthKey] += effectiveIncomeAmount(entry)
  continue          // ← corta ANTES do switch
}
```

O `continue` está antes do `switch (group)`. **Todo INCOME vira receita bruta sem o grupo ser
lido**, e por isso marcar o lançamento de entrada não é "acrescentar uma coluna": é reescrever
a leitura do INCOME.

### Os números, medidos em 17/09/2026

| `origin_type` | `type` | linhas | com `expense_group` | grupos distintos | soma |
|---|---|---:|---:|---:|---:|
| MANUAL | EXPENSE | 1.072 | 1.072 | 14 | R$ 6.412.208,10 |
| RECURRING_EXPENSE | EXPENSE | 264 | 264 | 5 | R$ 479.902,24 |
| **SALE** | **INCOME** | **176** | **0** | **0** | **R$ 7.723.152,50** |
| FIXED_EXPENSE | EXPENSE | 100 | 100 | 4 | R$ 714.500,00 |
| PREV_MONTH_BALANCE | INCOME | 1 | 0 | 0 | R$ 15.000,00 |
| (nulo) | INCOME | 1 | 0 | 0 | R$ 100.000,00 |

**Nenhum INCOME tem `expense_group`, e nem poderia ter**: a coluna se chama *expense*\_group.
Os 176 lançamentos de venda são R$ 7.723.152,50 que chegam à receita bruta sem classificação
de espécie alguma.

E o quanto disto é repasse, na base de hoje:

| | |
|---|---:|
| itens manuais em `sale_items` | **16** |
| vendas com ao menos um | **16** de 98 |
| valor dos itens manuais | **R$ 1.980.321,17** |
| lançamentos de venda com `origin_id` preenchido | **175** de 176 |

**Item manual não tem coluna própria em `sale_items`** — não há `is_manual` nem
`manual_description`. Ele é o item com `product_id` **e** `service_id` nulos, que é o mesmo
critério do #27.

### Ressalvas de método, e elas importam mais que o número

1. **R$ 1.980.321,17 é o repasse CADASTRADO, não o repasse RECEBIDO.** Ele soma
   `unit_price × quantity` dos itens manuais de todas as vendas, independentemente de o
   recebimento ter acontecido. O que infla a receita bruta é o recebido, e a proporção entre
   os dois não foi medida.
2. **A soma não desconta o rateio de frete que cai no item manual** (R12). A parcela rateada
   nele também é repasse, e também entra inteira — não está nesta conta.
3. **Zero lançamentos de Repasse existem hoje**, porque o grupo nasceu nesta rodada. A
   assimetria descrita aqui é a do estado que começa agora, não a de um estado medido em
   operação.
4. **A medição é de um dia.** Serve para dimensionar a decisão, não para projetar.

## As duas alternativas medidas, com o custo de cada uma

Nenhuma foi implementada. Estão aqui com o custo apurado para que a próxima pessoa decida com
o levantamento na mão em vez de refazê-lo.

### (ii) Quebrar o lançamento na origem

Em `relatorio-vendas/index.tsx`, o recebimento vira **um** lançamento de INCOME com o valor
inteiro (dois pontos: `:868` para cartão parcelado, `:879` para o resto). A alternativa é
gravar **dois**: um INCOME de receita própria e outro do repasse.

| | |
|---|---|
| **o que resolve** | a receita bruta passa a exibir só o que é da empresa — o topo fica certo, não só o resultado |
| **o que custa** | o valor do repasse precisa ser rateado entre as PARCELAS e entre os recebimentos PARCIAIS, e o rateio tem as mesmas armadilhas da R21: o denominador é o conjunto, e um recebimento a mais muda a parcela dos outros |
| **o que quebra** | o elo `origin_id → sale_id` deixa de ser 1 recebimento : 1 lançamento. O módulo de Comissão de Vendedor lê essa cadeia (o comentário em `:870` diz isso com todas as letras), e dois lançamentos por recebimento a dobram |
| **dado histórico** | os 176 lançamentos existentes continuam inteiros. Não há como quebrá-los depois sem saber quanto de cada um era repasse — e `sales` não guarda esse total |

### (iii) Marcar o INCOME

Acrescentar a `cash_entries` uma marca de "não afeta resultado" e fazer o DFC lê-la.

| | |
|---|---|
| **o que resolve** | o mesmo que (ii), sem mexer em quantos lançamentos existem nem no elo com a venda |
| **o que custa — e é o que a torna INVASIVA** | **o `continue` do INCOME corta antes do `switch`.** Hoje nenhum INCOME é lido por grupo, em lugar nenhum do agregador. Marcar a linha exige reescrever o ramo do INCOME para classificar antes de somar — e esse ramo é o que produz a receita bruta das TRÊS variantes de demonstração e do Hub |
| **o que mais custa** | a coluna nova não pode ser `expense_group`: o nome é de despesa, a CHECK só aceita os grupos de despesa, e 0 de 178 INCOME a têm preenchida. É coluna nova, migração nova, e RLS a conferir |
| **e o pior** | um INCOME marcado que o agregador esqueça de tratar **soma na receita bruta em silêncio**, que é exatamente o `default` do `switch` — `portao-que-nao-alcanca.md` com o instrumento do outro lado |

### Por que (i) mesmo assim

Porque (i) **não tem parte invisível**: o usuário lança, a linha aparece, e o que ela afirma é
verificável na tela. (ii) e (iii) acertam o topo da demonstração e pagam com um caminho que
falha calado — e a assimetria de (i) é visível a quem abrir a demonstração, porque a dedução
está lá, nomeada, logo abaixo da receita.

## A sugestão na tela, e o que ela NÃO é

Ao registrar o recebimento de uma venda com item manual, o modal exibe o total do repasse e
diz onde lançá-lo. **Ele não lança nada.**

Foi medido antes de ser escrito, porque o dono do produto pediu que não se fizesse se exigisse
ligar venda e caixa de um jeito que não existe: **o elo existe** — `origin_type: 'SALE'` mais
`origin_id: saleId`, preenchido em 175 dos 176 lançamentos. A consulta é uma só, por
`sale_id`, disparada no clique.

Lançar sozinho gravaria uma despesa que ninguém conferiu, e não resolveria a assimetria: o
lado da entrada continuaria inteiro de qualquer jeito.

## Relação com as regras

`.claude/rules/portao-que-nao-alcanca.md` é o que (iii) arrisca e o que o `default` do
`switch` já é. `.claude/rules/ausente-vs-falso.md` decide por que a sugestão não aparece
quando a consulta falha, em vez de aparecer dizendo que não há repasse.
`.claude/rules/cascata-lucro-real.md` R13 é o que define repasse do lado do documento — esta
página é o mesmo conceito do lado do caixa. `.claude/rules/registro-de-classe.md` diz onde
isto mora e por que não é uma página de `.claude/rules/`: não há classe, há uma decisão com
custo.
