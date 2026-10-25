# Cópia Divergente

> **Esta regra é independente da correção que a originou.** Nasceu no PR que unificou o motor
> do gravador porque foi ali que a quarta aparição fechou a contagem, mas não depende dele.

## O critério

**O mesmo mapeamento escrito duas vezes, uma delas esquecendo um campo — e nada falha.**

O campo esquecido não produz erro: ele chega `undefined`, cai num `?? null` ou num fallback, e
o sistema segue. O defeito só aparece depois, no ponto que dependia daquele campo, e sem
sintoma que aponte para a cópia.

## Por que a distinção é difícil de ver

Porque as duas cópias **estavam certas quando foram escritas**. Ninguém copia um bloco já
errado; copia-se um bloco correto, e a divergência nasce na terceira edição — quando alguém
acrescenta um campo numa cópia e não sabe que existe a outra.

E o gesto que a produz é o gesto certo em toda outra circunstância: acrescentar um campo ao
mapeamento **é** o trabalho. O que falha é a suposição tácita de que só existe um lugar.

## As aparições

| # | Onde | O campo que sumiu | O que acontecia |
|---|------|-------------------|-----------------|
| 1 | #27 · duas rotas criando venda a partir de orçamento (`vendas/` e `orcamentos/`), cada uma com sua cópia do mapeamento | `service_id`, `commission_pct`, `profit_pct`, `tax_breakdown`, `manual_description` | o item de SERVIÇO virava linha sem produto E sem serviço, indistinguível de item manual; a herança fiscal se perdia |
| 2 | #28 · lista de colunas do `select` escrita à mão, ao lado do contrato do mapeador | `rt_pct` | `resolveInheritedRtPctDecimal` recebia `undefined` e caía no cadastro VIVO, ignorando o RT congelado (D8) |
| 3 | #45 · o mesmo, na travessia orçamento → **pedido** | `destination_snapshot` | o pedido voltava a resolver o destino pela matriz do `calc_type` atual — o D12 outra vez. Medido: 6 de 6 pares perderam |
| 4 | este PR · o enriquecimento do item para o motor V17, em **quatro** cópias — 1 em `orcamentos/index.tsx` e 3 em `vendas/index.tsx` | `cost_total` recomputado, `productive_labor_unit`, `financial_expense_unit`, `expense_breakdown_unit`, `rt_reserve_percent`, `yield_quantity`, `is_manual_cost` | item manual entrava na cascata de produtos e recebia comissão/lucro; RT saía zero; o motor caía no snapshot V14 stale |

A quarta é a mais grave das quatro em número de campos, e a única com **três** cópias
empobrecidas em vez de uma.

### Nota da busca por precedentes

A busca foi feita conforme `registro-de-classe.md`, e o agrupamento das três primeiras já
estava registrado em `construtor-empobrecido.md` — foi lá que a classe recebeu nome, ao ser
usada como termo de comparação. Esta página a tira do corpo daquela e a coloca onde ela mora,
com a quarta aparição que fecha a contagem.

**Nenhuma quinta foi forçada.**

## O discriminante contra o CONSTRUTOR EMPOBRECIDO

As duas classes têm o mesmo resultado — um campo não chega e nada falha — e mecanismos
diferentes. O critério que as separa é a **detectabilidade**, porque a utilidade de uma classe
está em ensinar ONDE PROCURAR:

| | cópia divergente | construtor empobrecido |
|---|---|---|
| os blocos | **SE PARECEM** — são cópias literais | **NÃO se parecem** — 120 linhas num arquivo, 40 noutro |
| como se acha | **põe os dois lado a lado** | **enumera quem produz o mesmo tipo** e compara a cobertura de campos |
| o remédio | **módulo único** + teste ligando o contrato à lista | **tornar o campo obrigatório**, para o compilador enumerar os produtores |

Quando o campo faltante é OPCIONAL COM DEFAULT NEUTRO e os produtores não se parecem, é
construtor empobrecido — ver `construtor-empobrecido.md`.

## O corolário aplicável ANTES do defeito existir

**Antes de acrescentar um campo a um mapeamento, procure a segunda cópia.**

Sinais, em ordem de força:

1. O bloco monta um objeto a partir de outro, campo a campo.
2. O objeto atravessa uma fronteira — tabela, motor, tela — e alguém do outro lado o lê.
3. O mesmo tipo de travessia existe em mais de uma tela (orçamento, pedido, venda).
4. Não há teste que ligue a lista de campos ao contrato do consumidor.

Quando os quatro coincidem, a segunda cópia existe. `grep` por um campo característico do
bloco — foi assim que as quatro foram achadas.

E o remédio, quando ela existe, **não é conferir as duas**: é apagar uma. Com um construtor
só, acrescentar um campo vale para todas as rotas, e a omissão deixa de ser possível.

### O reforço que o tipo dá

Extrair para módulo não basta sozinho, porque o `select` (ou a lista de colunas) continua
sendo a outra metade do mapeamento. O que fecha é **um teste afirmando que toda propriedade do
contrato está na lista** — assim acrescentar um campo sem acrescentá-lo à lista quebra o
build, em vez de chegar vazio em silêncio. É o desenho de `BUDGET_ITEM_COLUMNS_FOR_SALE` e de
`BUDGET_ITEM_COLUMNS_FOR_ORDER`.

## Relação com as outras regras

`registro-de-classe.md` é o método que decidiu a forma desta página e o limite que a manteve em
quatro linhas. `construtor-empobrecido.md` é a vizinha mais próxima, e a fronteira entre as
duas está na tabela acima. `ausente-vs-falso.md` explica por que o campo faltante não
reclama — o default neutro afirma em vez de calar. `fato-vs-referencia.md` é onde a aparição 2
e a 3 causaram dano: sem o campo congelado, o documento voltava a ler o cadastro vivo.
