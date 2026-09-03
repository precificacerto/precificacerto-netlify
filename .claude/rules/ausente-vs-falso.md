# Dado Ausente ou Dado Falso

## O critério

Formulação do dono do produto, registrada como está:

> Campo que sempre mostra zero **AFIRMA que não houve desconto**. A omissão **NÃO AFIRMA
> NADA**. É a diferença entre **DADO AUSENTE** e **DADO FALSO** — a mesma distinção do
> `NULL` versus `FORA` do D-A.

Este é o critério que decide o que exibir em **qualquer** campo sem dado, não só no desconto
que o originou. Diante de um campo cujo valor não é conhecido, há duas saídas, e elas não são
equivalentes:

| | o que a tela diz | o que o leitor conclui |
|---|---|---|
| **Exibir o default** (zero, vazio, traço) | "o valor é este" | tomou uma decisão sobre um fato que ninguém apurou |
| **Omitir o campo** | nada | não sabe, e sabe que não sabe |

Exibir o default é **mais** informação aparente e **menos** informação real: transforma
ausência em afirmação. Omitir custa uma linha em branco na tela e não mente.

## Por que a distinção é difícil de ver

Porque o default parece inofensivo. Zero é um número; branco é um espaço. Nenhum dos dois
*parece* uma afirmação — mas quem lê a tela não tem como distinguir "zero porque foi zero" de
"zero porque ninguém gravou". Os dois chegam idênticos, e a decisão sobre qual deles é o caso
já foi tomada pela tela, em silêncio, sem quem a tomasse.

O sintoma não aparece no dia em que o campo é criado; aparece quando alguém confia nele.

## As aparições

| # | Onde | O que o default afirmava | Estado |
|---|------|--------------------------|--------|
| 1 | `rt_pct` `NOT NULL DEFAULT 0` (D8) | "o RT é zero" — quando era "nunca gravado". A cura do legado depende de preferir a origem só quando positiva | Contornado |
| 2 | `destination_snapshot` `NULL` (D-A) | `NULL` lido como `FORA` transformaria **todo item legado em item sem custo**: FORA tira a conversão do CMV, silenciosamente | Prevenido — PR #34 |
| 3 | **Desconto no Histórico do Cliente** | Campo de desconto sempre em zero afirmaria que **não houve desconto**, quando `sale_items.discount` está zerado em 111 de 111 linhas e `sales` não tem a coluna: **ausência de gravação, não de exibição** | Omitido — PR #36 |
| 4 | **Parcelamento no Histórico do Cliente** | Lista vazia diria "zero parcelas"; sete das 63 vendas ativas não têm lançamento nenhum, e "não conhecido" não é "zero" | Omitido — PR #36 |

## Como aplicar

1. Antes de exibir um campo, perguntar: **existe um valor gravado, ou existe um default?**
2. Se é default, perguntar: **o default é distinguível de um valor legítimo igual a ele?**
   Zero gravado e zero por ausência são o mesmo byte — não são distinguíveis depois.
3. Quando não são distinguíveis, a coluna precisa ser **nulável e sem `DEFAULT`**, e a tela
   precisa **omitir** em vez de exibir o default.
4. Não estimar, não inferir a partir de outro campo, não preencher com o "mais provável". Um
   valor inferido exibido sem marca é indistinguível de um valor apurado.

## O corolário no schema

`NOT NULL DEFAULT 0` numa coluna que pode legitimamente valer zero **apaga a distinção para
sempre**. Foi o que o D8 pagou caro em `rt_pct`, e é por isso que as cinco colunas de
`destination_snapshot` do D-A nasceram **nuláveis e sem default**: para que `NULL` continuasse
significando "nunca classificado" e nunca pudesse ser lido como uma classificação.

## Relação com as outras regras

`fato-vs-referencia.md` trata do que o dado **significa** — memória de um cálculo, ou ponteiro
para uma configuração viva. Esta trata do que a **ausência** de dado significa, e de quando
exibi-la é pior que calá-la. As duas se encontram no D-A, onde `NULL` precisa dizer "sem
snapshot" e jamais "destino FORA".
