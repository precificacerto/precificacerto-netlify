# Fato Histórico ou Referência Viva

## A pergunta que define a classe

Formulação do dono do produto, registrada como está:

> Em cada ponto de gravação, o valor é **FATO HISTÓRICO** ou **REFERÊNCIA VIVA**?
> Fato histórico congela; referência viva relê.

**Ninguém tomou essa decisão explicitamente em nenhum ponto do sistema, então o DEFAULT
VIROU RELER** — que é o errado para quase tudo que compõe preço.

Um preço formado é um fato histórico: foi calculado num dia, com parâmetros daquele dia, e o
cliente o aceitou. Reler os parâmetros de hoje para decompor aquele preço não é atualizar
nada — é reescrever o passado.

## Por que a classe é difícil de ver

Também nas palavras dele:

> O defeito **não aparece na gravação nem na leitura**; aparece só quando o **PARÂMETRO MUDA
> ENTRE AS DUAS**. Sistema novo não exibe sintoma; sistema com meses de operação exibe em
> silêncio.

É o que torna o teste comum inútil aqui: gravar e ler na mesma sessão passa sempre. Só falha
quem gravou em agosto e leu em setembro, depois de alguém mexer na configuração — e falha sem
erro, sem log, sem alerta. O número simplesmente fica diferente.

Por isso o teste desta classe tem sempre a mesma forma: **grava com um parâmetro, muda o
parâmetro, lê, e afirma que o valor NÃO mudou.**

## As cinco aparições

Todas com a mesma estrutura: valor gravado lido contra parâmetro atual.

| # | Onde | O que foi lido do estado atual | Estado |
|---|------|-------------------------------|--------|
| 1 | `expense_snapshot` | Serviço lia o `tenant_expense_config` ATUAL em vez das alíquotas da construção | Corrigido — PR #26 |
| 2 | `diasPorMes` | Dias por mês relidos do estado atual | Corrigido — PR #13 |
| 3 | **Desconto reaberto** | Orçamento gravado dentro do teto que fica fora dele quando o teto muda; a reabertura carrega o desconto salvo **sem revalidar**. **O orçamento se torna inválido sem ninguém agir.** | **ABERTO** |
| 4 | `\|\|` no cadastro de serviço | Zero digitado pelo usuário sobrescrito pela alíquota do tenant | Corrigido — PR #17 (`firstConfiguredPercent`) |
| 5 | `rt_pct` | RT congelado ignorado: o `select` não pedia a coluna e caía no cadastro vivo | Corrigido — PR #28 |
| 6 | **Custo do item** | O preço é congelado em `unit_price`; o CUSTO é relido do cadastro vivo a cada abertura. **ABERTO** | Ver abaixo |

Quatro foram corrigidas uma a uma, cada uma parecendo um defeito isolado. **Não eram.**

## A sexta é de outra natureza: foi DECISÃO, não omissão

Nas cinco anteriores a releitura era **OMISSÃO** — ninguém decidiu congelar, o default silencioso
produziu o defeito. Na sexta houve **DECISÃO EXPLÍCITA**, com rastro no comentário do código,
data e autor (`item-tax-rates.ts:180-187`):

> ★ PC-BUG-CMV-ETAPA4-004 (PO Cristiano, 2026-06-30) — REVERTE a precedência V8.8: A Etapa 4
> **DEVE somar o CMV ATUAL, recalculado do cadastro VIVO** de cada produto, **NUNCA o snapshot
> serializado** `pricing_calculations.cmv`. Motivo: o snapshot fica STALE após o ciclo
> save/reopen do produto/orçamento.

**É a primeira aparição em que corrigir significa REVERTER UMA ESCOLHA CONSCIENTE, e não
preencher uma lacuna.** E a razão de junho era boa: o snapshot ficava obsoleto no ciclo
save/reopen — que é o defeito do orçamento que não preserva os quatro campos, registrado no
PR #34. Trocou-se de fonte para tratar o sintoma, e a troca criou esta aparição.

Os dois princípios estão em conflito, e o conflito está escrito no mesmo arquivo: em junho
decidiu-se ler o vivo porque o snapshot ficava obsoleto; em setembro estabeleceu-se que ler o
vivo reescreve o passado.

### Onde ela aparece

`budget_items`, `sale_items` e `order_items` guardam preço, quantidade, desconto, comissão,
lucro, RT, `tax_breakdown` e o destino (D-A). **Nenhuma das três tem coluna de custo** — o
custo, insumo mais básico do preço, é o único que nunca foi congelado. A cascata o resolve em
tempo de leitura por `resolveProductCostAndLabor` → `resolveProductCostTotal`, sempre do
cadastro.

Caso medido: produto "Agua mineral" no ORC-2356. Orçamento de 01/09; produto e
`pricing_calculations` atualizados em 02/09. Custo que formou o preço R$ 4,62: **R$ 0,849618**.
Custo que a cascata usa hoje: **R$ 1,00**. Diferença **R$ 0,150382 — 17,7%**, com efeito medido
na comissão efetiva (4,7966% contra 5,0000%).

### Duas ressalvas de método na medição

Medido em 03/09/2026 sobre 272 itens de documento com cadastro vinculado: **109** com preço
divergente do cadastro atual, **174 (64%)** pertencentes a documentos anteriores à última
alteração do cadastro.

1. **Não há histórico de custo.** `products.cost_total` não tem versionamento, então a data em
   que o custo divergiu **não é recuperável**. O `updated_at` do cadastro é o melhor proxy
   disponível, e é **global** — qualquer edição do produto o move, não só a do custo.
2. **"Preço ≠ cadastro" é LIMITE INFERIOR.** Mede só o subconjunto em que a mudança chegou ao
   preço. **Produto cujo custo subiu sem repasse não aparece ali** — e é justamente o caso em
   que a margem apurada mente sem que nada denuncie.

MATERIALIZADO, não armado.

## O que NÃO é o remédio

O **D-A** — snapshot de destino por item na cascata — é o caso geral **do destino**, não da
classe inteira. Corrigi-lo fecha uma aparição a mais, não a família.

**A classe se resolve com um INVENTÁRIO:** listar todo ponto de gravação que compõe preço e
classificar cada campo como **fato** ou **referência**. A decisão precisa ser tomada campo a
campo, explicitamente, e ficar escrita — porque o default silencioso é o que produz o defeito.

### Item de RODADA PRÓPRIA — não é trabalho de PR

O inventário tem escopo e rodada próprios. Não faz parte de nenhuma correção de defeito e não
deve ser puxado no meio de uma. Até ele existir, cada aparição continua sendo tratada
individualmente, e esta página é o registro de que elas são a mesma coisa.

## Como reconhecer uma sexta

Sinais, em ordem de força:

1. Um valor **gravado** é decomposto, exibido ou revalidado com um parâmetro **lido agora**.
2. O parâmetro tem tela de edição — configuração de despesas, carga horária, tabela de
   comissão, alíquota do regime.
3. A gravação e a leitura estão separadas por tempo: orçamento reaberto, pedido convertido em
   venda, relatório de meses atrás, cascata de um documento antigo.
4. Nenhum teste cobre "muda o parâmetro entre gravar e ler" — porque nenhum teste comum cobre.

Quando os quatro coincidem, é esta classe.

## Relação com as outras regras

`migration-delivery.md` trata do que o banco tem contra o que o repositório declara.
`baseline-measurement.md` trata de medir o efeito de um PR sem se enganar. Esta trata do que
o dado **significa**: se ele é memória de um cálculo que aconteceu, ou ponteiro para uma
configuração que muda.

As três compartilham a mesma origem — confiar num sinal indireto em vez de olhar o fato.
