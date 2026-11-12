# Os dois layouts da tabela de fornecedor — MEDIDOS NO CÓDIGO em 12/11/2026

Fonte: `src/utils/atendimentos-ia-importacao.ts` (`lerTabelaDePreco`, `lerItensDoLayoutUnico`, `lerPreco`, `Leitor`) e
`src/utils/atendimentos-ia-importacao-celula.ts` (`valorDaCelula`). Nada aqui é deduzido de planilha.

## Qual leitor roda

`lerTabelaDePreco`: se o arquivo tem uma aba chamada **ITENS** ou **CABECALHO** — o nome comparado **sem os espaços das pontas e sem caixa**
("itens", " Itens " valem; **acento NÃO é ignorado**: "CABEÇALHO" com cedilha **não** é a aba) —, roda o **layout único**, e a ITENS tem de existir.
Sem nenhuma das duas, roda o **layout antigo**: a aba de nome **exatamente** `Tabela Wolff` (comparação exata do exceljs). Com as duas formas no
mesmo arquivo, vence o layout único. **Abas a mais são ignoradas** nos dois (conferencia, leia-me, "Sem uso no motor").

## Regras de célula (os dois layouts)

- **Fórmula:** vale o resultado gravado no arquivo; fórmula sem resultado gravado vira vazio, com aviso `celula_com_erro`.
- **Texto:** aparado nas pontas; vazio (ou só espaço) é vazio. **Data** vira `aaaa-mm-dd`. **Booleano** vira `VERDADEIRO`/`FALSO`.
- **Código:** o texto da célula; se for só dígitos com vírgula (`"123,45"`), vira `"123.45"` com o aviso `codigo_normalizado`. Linha sem código
  é pulada sem aviso. **Código repetido: fica a primeira linha**, com o aviso `codigo_repetido` (e "VALORES DIFERENTES" se os preços diferem).
- **NCM** é lido como TEXTO: se a célula for número no Excel, o zero à esquerda já se perdeu no arquivo — formate a coluna como texto.

## 1. O LAYOUT ÚNICO (aba ITENS)

- **Cabeçalho na linha 1**, os itens da linha 2 em diante. Os nomes do cabeçalho são comparados **exatos, só sem os espaços das pontas**:
  **maiúscula e acento CONTAM** (`CUSTO_BRUTO` ≠ `custo_bruto`; `descrição` ≠ `descricao`).
- **Coluna desconhecida é ignorada**, sem aviso (`_estado` passa). **Coluna repetida** (das conhecidas) é recusa.
- Sem `codigo` na linha 1: recusa "cabeçalho não reconhecível". Faltando qualquer das 28 obrigatórias: recusa nomeando todas as que faltam.
- **Numérica:** número, ou texto numérico brasileiro (`1.234,56`, `12,5`) ou com ponto (`12.5`). Qualquer outra coisa — texto, data, erro do
  Excel — é **recusa nomeada** (linha, coluna, valor). Vazio é NULL; 0 é 0.

| coluna do arquivo | obrigatória | tipo | vai para `orcamentista_tabela_item` |
|---|---|---|---|
| `codigo` | sim | texto | `codigo` |
| `descricao` | sim (a coluna; a célula pode ser vazia) | texto | `descricao` |
| `secao` | sim | texto | `secao` |
| `segmento` | sim | texto | `segmento` (a categoria do fornecedor; a tabela que declara categoria recusa arquivo com mais de uma, sem olhar caixa) |
| `linha` | sim | — | **nenhuma** (exigida, não gravada; aviso `colunas_sem_destino_no_layout_unico` se vier com valor) |
| `cor` | sim | — | **nenhuma** (idem) |
| `codigo_wvetro` | sim | — | **nenhuma** (idem) |
| `unidade` | sim | texto | `unidade` |
| `vendido_por` | sim | `barra` ou `unidade` (sem caixa); vazio = NULL; outro = recusa | `vendido_por` |
| `medida_barra_m` | sim | número | `medida_barra_m` |
| `peso_kg_por_m` | sim | número | `peso` |
| `multiplo_compra` | sim | — | **nenhuma** (exigida, não gravada, não validada) |
| `custo_bruto` | sim | número | `custo`; e `valor_barra_interno` = `custo_bruto` quando `vendido_por = barra` (senão NULL + aviso `tabela_sem_valor_por_barra`); vazio = NULL + aviso `itens_sem_custo` |
| `valor_metro` | sim | número | `valor_metro_interno` |
| `valor_kg` | sim | — | **nenhuma** (exigida, não gravada, não validada) |
| `cred_icms_pct`, `cred_pis_cofins_pct`, `cred_ibs_pct`, `cred_cbs_pct`, `cred_ipi_pct` | sim | número 0..100 | as colunas de mesmo nome |
| `nc_ipi_pct`, `nc_icms_st_pct`, `nc_difal_pct`, `nc_is_pct` | sim | número 0..100 | as colunas de mesmo nome |
| `ncm` | sim | texto | `ncm` |
| `credito_pct` | sim | número 0..100 | `credito_pct` |
| `credito_valor`, `custo_liquido` | sim | número (R$) | as colunas de mesmo nome |
| **`valor_metro_12`** | **não** (12/11/2026) | número | `valor_metro_12`; ausente = NULL + aviso `coluna_de_12_ausente`; célula vazia = NULL + aviso `itens_sem_valor_de_12` |
| **`valor_barra_12`** | **não** (12/11/2026) | número | `valor_barra_12`; idem |

**Não vêm do layout único e ficam NULL:** `ipi` (a coluna antiga), `pacote`, `aliquota_interna_pct`.
**Bloco tributário:** recusa `cred_ipi_pct` e `nc_ipi_pct` preenchidos juntos, e percentual fora de 0..100; o recálculo pela cascata
(`custo-liquido-por-fracao.md`) só confere: a divergência acima de R$ 0,01 grava o que veio e avisa (`bloco_tributario_divergente`).

**A aba CABECALHO** (opcional) é só lida e devolvida, nunca gravada: `categoria`, `fornecedor`, `vigencia`, `regime_tributario`, `uf_origem`,
`moeda` — os nomes na linha 1 e os valores na linha 2, ou um por linha (nome na coluna A, valor na B).

**A sua planilha da Vedação foi recusada** porque os nomes eram os da `jsonb_to_recordset` (`peso`, `custo`, `valor_metro_interno`…) e não os do
arquivo: faltaram `linha`, `cor`, `codigo_wvetro`, `peso_kg_por_m`, `multiplo_compra`, `custo_bruto`, `valor_metro`, `valor_kg`.

## 2. O LAYOUT ANTIGO (aba `Tabela Wolff`, colunas por POSIÇÃO)

- **Cabeçalho de seção:** toda linha cuja coluna **B** é `CÓDIGO` ou `CODIGO` (sem caixa). Pode haver várias seções na aba.
- **Título da seção:** o primeiro texto da linha **imediatamente acima** do cabeçalho → `secao` dos itens até o próximo cabeçalho. Essa linha não é item.
- **Itens:** toda linha não vazia com código na coluna B, inclusive antes do primeiro cabeçalho (com `secao` NULL).
- **Numéricas** (E, H, I, L, M, N, O, P): número ou texto brasileiro; **outra coisa vira NULL com aviso `celula_nao_numerica` — NÃO recusa**
  (diferente do layout único). As do bloco tributário recusam, como no layout único.
- Colunas fora das posições abaixo são ignoradas.

| coluna | vai para | observação |
|---|---|---|
| B | `codigo` | e marca o cabeçalho quando é `CÓDIGO` |
| D | `descricao` | |
| E | `medida_barra_m` | |
| F | `unidade` | |
| G | `ncm` | texto |
| H | `peso` | |
| I | `ipi` | a coluna antiga |
| J | `pacote` | texto |
| K | `segmento` | a categoria do fornecedor |
| L | `custo` | |
| M | `valor_metro_interno` | o RÓTULO do cabeçalho (ex.: `VALOR METRO 18%`) dá a alíquota |
| N | `valor_metro_12` | |
| O | `valor_barra_interno` | o rótulo também entra na alíquota e no `vendido_por` |
| P | `valor_barra_12` | |
| A, C, Q… | — | não lidas |

- **`aliquota_interna_pct`** (da seção): o `NN%` dos rótulos de M e O no cabeçalho. Iguais → esse número; diferentes → NULL com aviso
  `aliquota_divergente_no_cabecalho`; sem `%` → NULL.
- **`vendido_por`** (da seção): rótulo de M/O com `VALOR UNIT` ou `VALOR TOTAL` → `unidade`; com `BARRA` → `barra`; senão NULL.
- **Bloco tributário:** no cabeçalho de cada seção, a célula cujo texto é **exatamente** um dos 12 nomes (`cred_icms_pct`…) dá a coluna daquela
  seção; a seção que não traz o nome deixa a coluna NULL.

## 3. 17% e 12%: o que cada coluna carrega

- **O código não sabe a alíquota de nenhuma coluna do layout único:** `valor_metro` vai para `valor_metro_interno` como veio, e
  `aliquota_interna_pct` fica NULL. "Interno" é o nome histórico do layout antigo, em que a coluna M é a da alíquota **interna do estado do
  fornecedor** — a que o rótulo diz (no arquivo da Wolff medido em 20/10/2026, `VALOR METRO 18%`) — e a N/P a de **12%** (interestadual).
- **`valor_kg` não é gravado em lugar nenhum** (não há coluna). Nenhuma conta R$/kg × peso, nem CUSTO × 3,50/3,07, existe no leitor.
- **O que o leitor grava, pelo layout único:** `valor_metro_interno` = `valor_metro`; `valor_barra_interno` = `custo_bruto` se `barra`, senão
  NULL; `valor_metro_12` e `valor_barra_12` = as opcionais novas, ou NULL nomeado. **Pelo antigo:** as quatro, das colunas M, N, O e P.
- **O que o cálculo lê hoje:** o preço da barra é `valor_barra_interno` (`custo-do-orcamento.ts:181`) — NULL é "sem preço", nomeado; nos
  perfis o levantamento exige também `valor_metro_interno` (`levantamento-de-barras.ts:378`). As colunas de 12% só entram pela âncora do custo,
  atrás da trava (`ancora_do_custo_ligada`, desligada em todas as contas).
- **Consequência para a montagem:** se `valor_metro`/`custo_bruto` da planilha nova forem os de 17%, o cálculo de hoje passa a ler 17% onde a
  tabela antiga dava 18%. Isso muda preço, e a escolha de qual alíquota vai em `valor_metro` é do dono do produto, não do leitor.
