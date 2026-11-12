# O Vidro É por Metro Quadrado — e a Coluna Diz Outra Coisa

> **Esta regra é independente da rodada que a originou.** Nasceu em 12/11/2026, no comando único (o caminho de custo do vidro), quando a tabela
> de vidro da Estrela foi lida para traduzir o vidro dito pelo vendedor. **Não depende da Estrela**: vale para toda tabela da categoria VIDRO.

## O critério

Decisão do dono do produto, 12/11/2026, registrada como está:

> `vendido_por = 'metro_quadrado'` FICA DE FORA por ora, pelo custo. Então a categoria VIDRO é sempre por m², por categoria. [...] `unidade='PC'`
> e `vendido_por='unidade'` nos 21 itens da Estrela estão ERRADOS e o número é R$/m². Coluna que mente sem aviso é armadilha para o próximo.

**Na categoria VIDRO, o `custo` do item é o preço do METRO QUADRADO**, qualquer que seja o que `unidade` e `vendido_por` dizem. O custo do vidro de
uma esquadria é: a área de cada pano (as fórmulas do motor, `LVID × HVID`) × os panos × as unidades da esquadria × o `custo` × a cascata do crédito.
A linha do material grava `unidade_compra = 'M2'` e o consumo em m².

## Por que a distinção é difícil de ver

Porque a coluna **parece certa**. `unidade = 'PC'` e `vendido_por = 'unidade'` são valores válidos, aceitos pela CHECK e pela importação, e leem
como "uma peça". Quem ler a tabela pela coluna somaria o preço de UM pano por esquadria — e o preço sairia muito menor, sem erro nenhum. É
`a-coluna-que-parece-enumeracao.md` no eixo da unidade: o nome da coluna é a hipótese; o que o fornecedor quis dizer é o dado.

## A aparição

| # | Quando | A tabela | O que a coluna diz | O que o número é |
|---|---|---|---|---|
| 1 | 12/11/2026 | Vidro — Vidros Estrela, 21 itens (`VIN04` 74,96; `VTIN06` 115,67; `VTIN10` 208,71; `VLAMIN3+3` 170,08 …) | `unidade = 'PC'`, `vendido_por = 'unidade'` | R$/m² |

## O remédio

- **No código:** o caminho do vidro (`custo-do-orcamento.ts`) lê o `custo` como R$/m² pela CATEGORIA, nunca pela coluna `unidade` nem por
  `vendido_por`. Está escrito no cabeçalho do módulo e aponta para esta página.
- **No dado (a decisão adiada):** `vendido_por = 'metro_quadrado'` exige uma CHECK nova em `orcamentista_tabela_item.vendido_por`, o leitor da
  planilha e a importação aprendendo o valor, e a tela mostrando-o. Fica para quando o custo valer.

## As ressalvas de método — o que esta regra NÃO diz

- **Não corrige a tabela.** As 21 linhas continuam com `PC`/`unidade`; a regra diz que estão erradas e como o código as lê.
- **Não vale para outra categoria.** Um insumo vendido por unidade é por unidade (o `custo` da unidade, decisão 1.3 do mesmo dia).
