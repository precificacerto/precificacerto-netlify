# Categorias e grupos de despesa — o que ficou registrado sem correção

Três achados do levantamento de 09/09/2026 que **não foram corrigidos** na rodada que criou
`Devoluções` e `Amortização`. Ficam aqui porque corpo de PR mergeado fica soterrado
(`.claude/rules/registro-de-classe.md`).

## (a) O `case 'LUCRO'` descarta R$ 125.318,22 da Análise Financeira

O `switch` de agregação do DFC trata `LUCRO` com `break` **sem somar nada**, sob o comentário
*"Distribuição de lucros / Investimentos — não compõem o DRE de estrutura"*.

Medido: **15 lançamentos, 14 confirmados, R$ 125.318,22 confirmados**, assim distribuídos:

| categoria | n | total confirmado |
|---|---:|---:|
| INVESTIMENTOS (Máquinas, Equipamentos, Expansão e Melhorias) | 14 | R$ 124.754,26 |
| Distribuição de lucros | 1 | R$ 563,96 |

**Pode ser intencional ou defeito**, e a diferença importa: distribuição de lucros de fato não
é despesa, mas *investimento em máquinas* é saída de caixa que não aparece em lugar nenhum da
demonstração. **É levantamento próprio, não foi decidido aqui.**

`DFC_GROUPS_QUE_SOMAM` registra a exclusão de `LUCRO` como **deliberada**, para que o teste do
`default` silencioso não a confunda com esquecimento — e para que, quando alguém decidir, a
mudança seja de uma linha e não uma arqueologia.

## (b) O botão do Fluxo de Caixa NÃO é o do #52 — não foi "revertido"

O #52 removeu do popup *"Editar Recebimento Confirmado"* um botão "Excluir" que chamava
**`/api/delete/cash-entries`** e apagava **o lançamento**.

O botão criado agora chama **`/api/delete/sales-permanent`** → `delete_sale_cascade`, e apaga
**a venda e toda a cadeia**.

> **Mesmo rótulo, mesmo lugar, AÇÃO DIFERENTE.**

Chamar isso de "reversão do #52" mandaria a próxima pessoa procurar o
`handleDeleteFromPaymentModal`, que **não voltou** e não vai voltar. A decisão da época — a
exclusão de venda existir só em Vendas — mudou, e é `.claude/rules/decisao-sob-regra-da-epoca.md`:
não houve erro no #52, houve **mudança de critério**.

O botão aparece **só quando `origin_type = 'SALE'`**: em lançamento manual não há venda a
excluir, e botão sem o que fazer **afirma que a ação existe ali**.

## (c) `cash_entries.category_id` é CÓDIGO MORTO gravando `undefined`

`controle-financeiro/index.tsx:552` grava `category_id: values.category_id` — e **não existe
Select de `category_id` em formulário nenhum**. `values.category_id` é sempre `undefined`.

É isto que explica os **1.588 NULLs**: a coluna não está vazia por desuso, está vazia **porque
o código grava `undefined` nela**. E a `cashier_categories` tem **zero linhas**, com o enum
`cash_category_type` (`REVENUE` / `EXPENSE`) e a coluna `is_calculable_in_dre` nunca usados.

**Estrutura morta, e ativá-la é rodada própria.** Registrado também o que ela custaria: popular
83+ categorias, migrar 1.312 linhas e **acrescentar naturezas ao enum** — `REVENUE` e `EXPENSE`
não descrevem nem estorno de receita nem amortização.

## O que a rodada corrigiu, e não pertence a este registro

Fonte única de grupos (eram cinco cópias divergentes), remoção dos **104** `as ExpenseGroupKey`,
as categorias `Devoluções` e `Amortização`, e a linha de deduções da receita nas três variantes
de demonstração — antes existia em **uma**.

## A leitura que foi corrigida no meio do levantamento

A primeira leitura foi que o texto livre de `expense_category` era a chave de agregação, e que
as ~80 grafias divergentes ("Água" × "Água / Esgoto", "Uso e consumo" × "Uso e Consumo")
sujariam a conta da Análise Financeira.

**Não sujam.** A Análise Financeira agrega por **`expense_group`** — uma terceira coluna,
preenchida em 100% das despesas, com 15 valores distintos, todos conhecidos. **O texto é só
rótulo.** As grafias divergentes sujam relatórios que agregam pelo texto; não sujam a conta.
