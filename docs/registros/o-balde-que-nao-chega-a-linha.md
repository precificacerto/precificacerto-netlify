# O Balde Que Não Chega a Linha Nenhuma

> **Achado de 17/09/2026, medido e NÃO corrigido**, por decisão do dono do produto:
>
> > Não corrija. Registre com os números e diga o que a correção exigiria, porque decidir onde
> > a linha entra em cada variante é mudança de conta e é minha.
>
> Ele apareceu ao responder a pergunta *"as outras variantes têm alguma sutileza?"*, feita na
> rodada da uniformização da análise vertical. **Não depende daquela rodada** e não deve ser
> levado junto se ela for revertida.

## O critério

**Um valor é somado pelo agregador e não aparece em linha nenhuma da demonstração.** Não é
exibido, não é deduzido, não entra em subtotal. O dinheiro entra no balde e morre ali.

É diferente de um grupo que cai no `default` do `switch` — esse nem chega a balde. Aqui o
balde **existe, é preenchido corretamente, e nenhuma variante o lê.**

## Os três baldes, por variante

Medido por contagem de referências a `agg.<campo>` dentro de cada builder de
`src/pages/dfc/index.tsx`:

| balde | de onde vem | LR / SH | LP | RET | SN |
|---|---|---:|---:|---:|---:|
| `atividadesTerceirizadas` | `case 'ATIVIDADES_TERCEIRIZADAS'` | 3 usos | **0** | **0** | **0** |
| `impostoPorDentro` | `case 'IMPOSTO_FATURAMENTO_DENTRO'` | 2 usos | 2 usos | **0** | **0** |
| `impostosRecuperaveisCusto` | **derivado** — `valor_icms + valor_pis + …` dentro do bloco de `CUSTO_PRODUTOS` | 2 usos | 2 usos | **0** | **0** |

**Os três não são a mesma coisa, e a distinção decide quem protege o quê.** Os dois primeiros
são **grupos** de `EXPENSE_GROUP_KEYS`. O terceiro **não é grupo nenhum**: ele é calculado a
partir das colunas `valor_*` de um lançamento que já foi classificado como custo de produto.
`DFC_GROUPS_QUE_SOMAM` nem tem como cobri-lo — não há chave a listar.

## Por que o portão não pegou, e ele é meu

`DFC_GROUPS_QUE_SOMAM` existe exatamente para impedir que um grupo novo caia no `default`
silencioso do `switch`. O comentário dele diz: *"Um grupo acrescentado a `EXPENSE_GROUP_KEYS`
e esquecido no `switch` do DFC deixa este conjunto incompleto, e o caso fica VERMELHO em vez
de o valor sumir da demonstração sem aviso."*

**Ele afirma que o grupo soma num BALDE. Não afirma que o balde chega a uma LINHA.**

São duas travessias, e o portão alcança só a primeira:

```
expense_group  ──[ o switch ]──▶  balde do agregador  ──[ os builders ]──▶  linha do DRE
               └── DFC_GROUPS_QUE_SOMAM cobre ──┘      └── ninguém cobre ──┘
```

É a mesma forma de `.claude/rules/portao-que-nao-alcanca.md`, agora no portão que eu mesmo
escrevi para tapar aquele buraco: **o nome promete mais do que o instrumento alcança.** O
critério da regra, aplicado a ele, responde na hora — *"se eu introduzir o defeito que este
portão existe para barrar, ele fica vermelho?"* O defeito "grupo sem `case`" sim; o defeito
"balde sem linha" não, e nunca ficou.

## A exposição, medida sobre `cash_entries` confirmadas

| regime | tenants | com lançamento | `ATIVIDADES_TERCEIRIZADAS` | `IMPOSTO_FATURAMENTO_DENTRO` | impostos recuperáveis |
|---|---:|---:|---:|---:|---:|
| **LUCRO_REAL** | 3 | 3 | 6 · R$ 8.721,20 | 17 · R$ 185.321,52 | 159 · R$ 516.120,20 |
| SIMPLES_NACIONAL | 20 | 4 | **0** | **0** | **0** |
| MEI | 3 | 1 | **0** | **0** | **0** |
| SIMPLES_HIBRIDO | 1 | 1 | 0 | 0 | 0 |
| **LUCRO_PRESUMIDO** | **0** | — | — | — | — |
| **PRESUMIDO_RET** | **0** | — | — | — | — |

**Exposição hoje: ZERO.** Todo lançamento dos três está em tenants de Lucro Real — a variante
que os exibe.

E há um dado que muda o peso do achado: **não existe nenhum tenant em Lucro Presumido nem em
Presumido RET.** A variante `buildDrePresumidoRET` **nunca roda em produção**, e o ramo LP de
`buildDreLucroRealPresumido` também não. Metade do furo é, hoje, código que ninguém executa.

### O caso que PODE materializar, e é o único

**`ATIVIDADES_TERCEIRIZADAS` É oferecido no seletor do Simples Nacional** —
`BLOCK_ATIVIDADES_TERCEIRIZADAS_SN` existe e o bloco `── Atividades Terceirizadas Operacionais
de Entrega ──` aparece em `SN_EXPENSE_CATEGORY_OPTIONS`. São **20 tenants** em SN, 4 deles já
lançando.

O primeiro que lançar ali vê o valor **sumir da demonstração**: não aparece como linha, não
deduz nada, e o Lucro Líquido sai maior do que é. Sem erro, sem log, sem sinal.

Os outros dois não têm essa porta: `IMPOSTO_FATURAMENTO_DENTRO` aparece no seletor do SN, mas
com um único item (`DAS (imposto sobre vendas)`), e os impostos recuperáveis só existem para
quem preenche o detalhamento de custo, que é caminho de Lucro Real / Simples Híbrido.

### Ressalvas de método

1. **A contagem de usos é estática.** Ela conta referências a `agg.<campo>` no corpo de cada
   builder. Um campo referenciado dentro de uma expressão que não chega a `rows.push` contaria
   como uso — não foi o caso aqui, porque cada uso foi conferido, mas o método não distingue
   sozinho.
2. **"Exposição zero" é o estado de hoje, não uma garantia.** Ela mede lançamentos existentes;
   não mede o que o seletor permite lançar amanhã, e é justamente a diferença entre as duas
   que faz o caso do SN merecer registro.
3. **Não foi medido o EFEITO em R$ sobre o Lucro Líquido de um SN hipotético.** Seria o valor
   lançado, inteiro — mas afirmar isso exigiria rodar a variante com o caso montado, e não foi
   feito.

## O que a correção exigiria — e por que ela é decisão de negócio

Não é acrescentar uma linha. É responder, **para cada par (variante, balde)**, três perguntas
que só quem manda no produto responde:

1. **O balde EXISTE naquele regime?** Atividade terceirizada de entrega é despesa real em
   Simples Nacional, e provavelmente tem linha. Imposto por dentro em SN é discutível — o
   regime é guia única, e a única categoria oferecida ali é o `DAS (imposto sobre vendas)`.
   **`INEXISTENTE` não é zero**, e é a Parte 0 de `cascata-lucro-real.md` aplicada à
   demonstração: um balde que não existe no regime não deve ganhar linha com valor nulo.
2. **ONDE ele entra?** Antes ou depois da receita líquida muda o Lucro Bruto. No Lucro Real a
   atividade terceirizada é deduzida no bloco de cabeçalho, **antes** da Receita Bruta; copiar
   essa posição para o SN mudaria a régua de lá, que acabou de ser uniformizada.
3. **Ele DEDUZ ou só EXIBE?** São coisas diferentes, e a demonstração já tem os dois casos —
   `cmv_custo_prod` exibe sem deduzir por si (o pai deduz), `desp_financeira` deduz.

Qualquer uma das três respostas muda o Lucro Líquido do regime afetado. **É mudança de conta,
e por isso não foi feita aqui.**

### O que daria para fazer sem decidir nada disso

Um portão. Ele não corrige o furo — **faz o furo ficar vermelho** quando alguém acrescentar o
próximo balde e esquecer a segunda travessia:

> para cada variante, todo campo de `AggregatedData` diferente de zero na fixture ou aparece
> em alguma linha, ou está numa lista de **exceções declaradas** com a razão escrita.

É o desenho de `DFC_GROUPS_QUE_SOMAM`, um nível adiante — e a lista de exceções é o que
transforma "não aparece" de acidente em decisão registrada. **Não foi escrito nesta rodada**
porque a lista de exceções É a decisão de negócio acima: sem ela, o portão nasce vermelho.

## Relação com as outras regras

`portao-que-nao-alcanca.md` é a classe do mecanismo, e `DFC_GROUPS_QUE_SOMAM` é uma aparição
dela — o portão cobre a primeira travessia e o nome sugere as duas. `ausente-vs-falso.md`
decide a pergunta 1 da correção: balde que não existe no regime não ganha linha com zero.
`cascata-lucro-real.md`, Parte 0, é de onde vem o `INEXISTENTE não é zero` aplicado aqui.
`registro-de-classe.md` decidiu que isto mora em `docs/registros/`: é um achado com números e
uma decisão pendente, não uma classe de defeito com aparições.
