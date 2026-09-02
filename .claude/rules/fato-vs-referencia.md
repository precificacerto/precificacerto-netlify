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

Quatro foram corrigidas uma a uma, cada uma parecendo um defeito isolado. **Não eram.**

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
