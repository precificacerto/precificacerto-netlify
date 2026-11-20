# A família como divisão econômica — desenho (20/11/2026)

> Proposta, **sem código e sem migração escrita ainda**. Pedido do dono do produto, 20/11/2026: "A FAMILIA PASSA A SER UMA DIVISAO ECONOMICA, nao so
> de catalogo [...] cada familia tem a sua politica comercial e o seu MODO DE PRECIFICACAO." Vocabulário reaproveitado: `PRODUZIDO` e `REVENDA`, o
> mesmo enum `public.product_type` da tabela `products`.

## O que foi medido em produção (20/11/2026, só leitura)

| o quê | medida |
|---|---|
| `orcamentista_familia_catalogo` | 1 linha: `PVC`, "De Paula - PVC Wolf", ordem 1; colunas `chave`, `rotulo`, `ordem`; 6 FKs apontam para ela (etapa, ramificação, tabela, matéria-prima, item de levantamento, motor_familia), todas `RESTRICT` |
| `public.product_type` | enum com `PRODUZIDO`, `REVENDA` |
| `orcamentista_vendedor_perfil` | 1 linha, 1 empresa; PK `(tenant_id, employee_id)`; quatro campos nulos (`comissao_percentual`, `comissao_modo` ∈ {PROPORCIONAL, CONGELADA}, `reserva_tecnica_percentual`, `lucro_projetado_percentual`) com CHECK 0..100 |
| quem grava o perfil | `superadmin_gravar_vendedor_perfil` (md5 sem `\r` `f4a37b75…`), com `ON CONFLICT (tenant_id, employee_id)` — **trocar a chave quebra esta função**, então ela muda na mesma migração |
| quem lê o perfil | `arquivo-do-levantamento.ts:116` (uma linha por vendedor), `base-de-conhecimento-servidor.ts:140` (a lista da tela) |
| `orcamentista_levantamento` | também guarda os cinco percentuais (o que o vendedor negociou NAQUELE levantamento, `20261106000002`) — um jogo só, sem família |
| `orcamentista_orcamento` | 11 orçamentos; o cabeçalho CONGELA os percentuais (comissão, modo, RT, responsável, lucro) e os totais (`valor_total_bruto`, `valor_total_liquido`, `valor_venda`); `calculo_versao` nula em 5, `consumo-do-item-2026-11-16` em 6 |
| `orcamentista_orcamento_item` | 52 itens, **45 com `familia = PVC`, 7 com família nula** (orçamentos 1 e 2); os 52 têm `custo_fabricacao` — hoje tudo é tratado como PRODUZIDO |
| Postgres | 17.6 (tem `UNIQUE NULLS NOT DISTINCT`) |

## O desenho

### (1) O MODO na família — `orcamentista_familia_catalogo.modo`

- `modo public.product_type NOT NULL` (o enum que já existe; nada de `text` com CHECK paralelo, que seria o dialeto próprio).
- A migração: acrescenta nula → `UPDATE … SET modo = 'PRODUZIDO' WHERE chave = 'PVC'` (1 linha, com antes e depois no log) → `SET NOT NULL`. **Sem
  DEFAULT**: família nova declara o modo (`construtor-empobrecido.md` — o default neutro esconderia a porta interna tratada como produzida). A guarda aborta
  se houver outra família além da PVC na hora de aplicar.
- `superadmin_criar_familia` ganha `p_modo` (obrigatório); `superadmin_editar_familia` aceita trocar o modo. A troca vale para os orçamentos NOVOS — o
  orçamento já gravado congela o modo dele (abaixo). Guarda pelos md5 de produção (`aa798afd…` criar, `74341b18…` editar).
- A aba Famílias do catálogo mostra e pede o modo.

### (2) A família no perfil do vendedor — `orcamentista_vendedor_perfil.familia`

- `familia text NULL` → FK para `orcamentista_familia_catalogo(chave)` `ON DELETE RESTRICT`.
- A chave: sai a PK `(tenant_id, employee_id)`; entra **`UNIQUE NULLS NOT DISTINCT (tenant_id, employee_id, familia)`** — a linha com `familia` nula é
  o PADRÃO do vendedor (a de hoje, que fica como está), e só pode haver uma; a linha com família SOBREPÕE. Aditivo: a linha que existe não muda.
  (Uma PK não aceita coluna nula; a tabela passa a ter `id uuid` PK `DEFAULT gen_random_uuid()` para quem precisar de uma chave por linha. Alternativa:
  ficar sem PK — não recomendo.)
- **A sobreposição é campo a campo** (`ausente-vs-falso.md`): na linha da família, o campo NULO é "não informado nesta família" → vale o do padrão do
  vendedor; o 0 é zero. Ex.: comissão PVC nula + padrão 3% → 3%; comissão REVENDA 5% → 5%.
- `superadmin_gravar_vendedor_perfil`: aceita a chave `familia` no corpo e faz `ON CONFLICT (tenant_id, employee_id, familia)`. Guarda pelo md5 `f4a37b75…`.
- **O arrasto do catálogo** (`orcamentista_arrasto_passos`, a soberania de 31/10): a FK nova aponta para a família, e a guarda do fecho aborta qualquer
  migração que crie FK para tabela de onde se apaga sem passo. Então a remoção da família ganha um passo: as linhas de perfil daquela família SAEM, com
  log linha a linha e nomeando a empresa (é configuração de conta, não documento de cliente; a linha padrão, `familia` nula, nunca é tocada). Guarda
  pelos md5 dos corpos do arrasto (`6a7f7376…`, `3a9438f8…`, `24f74d56…`).
- No código: `arquivo-do-levantamento.ts` lê as linhas do vendedor e resolve por família; a tela da base de conhecimento (seção Vendedores) ganha, por
  vendedor, o padrão e uma linha por família da empresa.

### (3) O orçamento somando POR FAMÍLIA — `orcamentista_orcamento_familia` (tabela nova)

```
orcamento_id uuid  → orcamentista_orcamento(id) ON DELETE CASCADE   -- é filho do documento, como os itens
tenant_id    uuid  (FK composta com o orçamento, como os itens)
familia      text  → orcamentista_familia_catalogo(chave) ON DELETE RESTRICT? (ver pergunta 4)
modo         public.product_type NOT NULL            -- FATO congelado: o modo da família NO DIA do orçamento
comissao_percentual, comissao_modo, reserva_tecnica_percentual, reserva_tecnica_responsavel, lucro_projetado_percentual  -- congelados, por família
custo_bruto_materiais, custo_liquido_materiais, custo_fabricacao, custo_liquido_total, valor_venda  -- o subtotal da família
PRIMARY KEY (orcamento_id, familia)
```

- O item continua com `familia` (já existe) — é ele que liga o item ao subtotal. O total do cabeçalho (`valor_total_*`, `valor_venda`) passa a ser a
  SOMA dos subtotais, gravada como hoje (o cabeçalho continua sendo o que as telas e o PDF leem).
- **PRODUZIDO:** custo líquido dos materiais + fabricação (`tempo_fabricacao_min × valor_minuto`) + margem da família.
  **REVENDA:** custo líquido de compra + margem da família; `tempo_fabricacao_min`, `valor_minuto` e `custo_fabricacao` do item ficam **NULOS** (não
  zero: não existe fabricação, e zero diria que existe e custou nada). Um item REVENDA com tempo é recusa nomeada; um PRODUZIDO sem tempo continua a
  recusa de hoje ("a mão de obra não sai").
- Um orçamento com uma família só tem UMA linha aqui — e dá o mesmo número que daria hoje.
- `calculo_versao` nova (ex.: `familia-economica-2026-11-2x`) marca os orçamentos feitos pela regra nova.

### O que acontece com os 11 orçamentos que já existem

**Nada.** A migração não recalcula, não preenche `orcamentista_orcamento_familia` para eles e não toca em item nenhum. A leitura distingue pela
`calculo_versao`: as duas versões de antes (nula e `consumo-do-item-2026-11-16`) continuam lidas pelo cabeçalho, com os percentuais e totais
congelados lá; só a versão nova lê as linhas por família. Os 7 itens sem família (orçamentos 1 e 2) ficam como estão. Isso é `fato-vs-referencia.md`:
o orçamento é fato histórico, e o modo da família é congelado nele, nunca relido do catálogo.

### O que a migração faz, em ordem (a escrever depois do seu de acordo)

1. guarda: corpos de produção pelos md5 acima; uma família só (PVC); 1 linha de perfil; nenhuma FK nova inesperada;
2. `familia_catalogo.modo` (nula → PVC = PRODUZIDO com log → NOT NULL);
3. `vendedor_perfil`: `id`, `familia`, FK, troca da PK pela UNIQUE NULLS NOT DISTINCT; a linha que existe fica com `familia` nula;
4. `orcamentista_orcamento_familia` com RLS e grants espelhados de `orcamentista_orcamento_item` (lidos do banco na hora de escrever);
5. as funções: criar/editar família com o modo, gravar perfil com a família, o passo novo do arrasto;
6. `$verifica$`: contagens antes e depois (1 família, 1 perfil, 11 orçamentos, 52 itens, 0 linhas por família), os md5 novos, nenhum `\r`.
Escrita e NÃO aplicada; o PR traz caminho, md5 e número de linhas, e o harness com o estado de produção.

## As perguntas que preciso que você leve ao PO (o desenho não as decide)

1. **De onde vem o custo de um item REVENDA** (porta interna)? Hipótese: da tabela do fornecedor, por código, uma linha por modelo — sem motor de
   peças. Isso define se a família REVENDA tem etapa de cálculo (CALCULAR_BARRAS) ou só o levantamento + preço por item.
2. **Os percentuais NEGOCIADOS no levantamento** (`orcamentista_levantamento.comissao_percentual` etc., um jogo só): valem para todas as famílias do
   levantamento, ou também passam a ser por família? (Proposta: valem para todas, como hoje, até ele pedir o contrário.)
3. **`comissao_modo` (PROPORCIONAL/CONGELADA) é por família também?** O desenho o põe por família, como os outros três.
4. **Remover uma família do catálogo com orçamento que a usa:** o orçamento é documento de cliente — a trava C diz que ele fica. Proposta: a linha
   por família não tem FK RESTRICT (guarda a chave como texto + o rótulo congelado), para a remoção não ser bloqueada nem apagar documento.
5. **A tabela `products` entra só como vocabulário** (o enum), ou a política padrão de uma família deve vir dos produtos do mesmo tipo (as médias que
   você mediu: PRODUZIDO 9,44/1,93/1,04; REVENDA 6,33/4,79/0,36)? O desenho NÃO lê `products`: a política vem do perfil do vendedor por família.

## Quantidade ou ambiente: o agente ESPELHA o que recebeu (complemento do dono do produto, 20/11/2026)

> "a distinção de ser um quantitativo para tudo ou individual vai depender do formato que o agente vai receber a informação."

Não é configuração da família nem pergunta ao vendedor: é consequência do que chega, **item a item**, e os dois modos convivem no mesmo levantamento.

- **"10 portas internas 80x210"** → UM item, `quantidade = 10`, `ambientes` nulo.
- **Uma imagem ou um texto com os ambientes discriminados** ("suíte 80x210, banheiro 70x210…") → UM item POR AMBIENTE, cada um com a sua medida,
  `quantidade` do que foi dito para aquele ambiente (1 se não dito, a regra de 03/11), e `ambientes` preenchido com o ambiente daquele item.
- **O agente NÃO pergunta** qual dos dois modos o vendedor quer, e não converte um no outro: o quantitativo não vira N itens, e os itens por ambiente
  não se fundem num quantitativo — **o agrupamento de iguais (`agruparIguais`, 03/11) passa a ter o ambiente como critério**, como o comentário dele já
  previa ("o ambiente entra nessa lista quando existir"): duas portas iguais em ambientes diferentes são dois itens.

**Medido (pelo dono do produto, 20/11/2026):** `orcamentista_levantamento_item` já tem `quantidade` e `ambientes`; `ambientes` está vazio nos 63 itens
(o caminho existe e está morto), `quantidade` é usada (17 itens com 2, máximo 2). **Não há migração**: é o agente começar a gravar o ambiente.

O que muda no código, para a PR deste pedaço:
1. a ferramenta do modelo ganha o ambiente por item (texto curto, copiado do que o vendedor ou a imagem disse — nunca inventado, conferido no texto
   como o nome e o vidro);
2. `aplicarProposta` grava `ambientes` no item; o agrupamento inclui o ambiente nos critérios; a equivalência das retidas (`esquadriasEquivalentes`)
   trata ambientes diferentes como esquadrias diferentes;
3. a folha do levantamento e o orçamento mostram o ambiente quando houver (o orçamento já copia `ambientes` do levantamento: a coluna existe em
   `orcamentista_orcamento_item`);
4. **a forma do `ambientes` já está decidida pelos leitores** (medido no código, 20/11/2026): é a lista `[{ "ambiente": "Suíte", "quantidade": 1 }]` —
   `arquivo-do-levantamento.ts:223/275` a lê assim, e o PDF do orçamento a imprime em "*LOCAL/AMBIENTE:" (`arquivo-do-orcamento.ts:298`). O agente grava
   nessa forma, sem inventar outra. A forma admite também um item com a quantidade repartida entre ambientes ("2 na suíte, 1 no banheiro" de uma porta
   igual) — **pergunta para o PO**: nesse caso é um item com dois ambientes, ou dois itens? A proposta é espelhar: se o vendedor disse as medidas
   iguais e repartiu por ambiente, um item com a lista; se disse uma medida por ambiente, um item por ambiente.

Vale para TODA família, não só para a porta interna: uma janela por ambiente da planta é o mesmo caso.

## O display da porta interna (o que antes ficava aberto)

"Levantar por quantidade total e também descer na medida de cada uma, individualmente." O desenho não fecha isso: o item de levantamento e o de
orçamento já aceitam `quantidade` > 1 com medidas, e a família REVENDA não exige medida para precificar (preço por unidade). Com o complemento acima,
ele deixa de ser decisão de tela: o levantamento já chega num dos dois modos, e a tela mostra o que chegou.
