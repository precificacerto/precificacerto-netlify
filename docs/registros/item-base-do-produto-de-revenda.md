# O seletor "Item base (mercadoria para revenda)" — o que ele alimenta

> **Registro de PENDÊNCIA, não de defeito.** A remoção do seletor foi pedida em 17/09/2026
> a partir do teste no preview, a medição abaixo foi feita antes de remover, e o dono do
> produto decidiu **não remover nesta rodada**: é escopo próprio, não ajuste de tela.
>
> Esta página existe para que quem for removê-lo **ache isto escrito** em vez de descobrir
> pelo estoque quebrado.

## O que o seletor é, na tela

No cadastro de produto, quando `product_type = 'REVENDA'`, o formulário oferece um seletor
de **item base**: a mercadoria de `items` que aquele produto revende. Ele grava
`products.base_item_id`.

A leitura natural é que ele seja apresentação — um vínculo informativo entre o produto e o
insumo. **Não é.**

## MEDIÇÃO — 17/09/2026

| | |
|---|---|
| produtos com `product_type = 'REVENDA'` | **77** |
| **com** `base_item_id` preenchido | **62** |
| **sem** `base_item_id` | **15** |

**Os dois caminhos já convivem.** Não há um estado "correto" e um "legado": 15 produtos de
revenda operam hoje sem item base, e 62 com. Quem remover o seletor não está migrando todo
mundo de um caminho para o outro — está apagando um dos dois que já funcionam.

## OS CINCO PONTOS QUE LEEM `base_item_id`

Nenhum deles é a tela de cadastro. Removê-lo do formulário sem tocar nestes deixa a coluna
a ser preenchida por ninguém, e os cinco caem no caminho de quem não tem item base.

| # | Onde | O que faz com o campo |
|---|---|---|
| 1 | `page-parts/products/content.component.tsx:611-641` | **Montagem do custo.** Com item base, o CMV do produto de revenda vem do `cost_net` daquele item; sem ele, do custo digitado no próprio produto |
| 2 | `page-parts/products/content.component.tsx:1034` | **Gravação.** O bloco de save escreve `base_item_id` junto com o resto do produto |
| 3 | `pages/produtos/index.tsx:699` | **Recálculo de custo.** Quando o item base muda de preço, é por aqui que o produto é recalculado |
| 4 | `pages/itens/index.tsx` — 4 pontos | **Sincronização de estoque e `needs_cost_update`.** Movimentar o item marca os produtos que o têm como base |
| 5 | `pages/estoque/index.tsx:324` | **Criação de estoque.** A entrada de estoque do produto de revenda se resolve pelo item base |

O ponto 4 é o que justifica o aviso do dono do produto: **é pelo estoque que a quebra
aparece**, e ela aparece depois, num produto que ninguém editou.

## O que esta página NÃO diz

1. **Não diz que o seletor deve ficar.** A decisão de 17/09/2026 foi só *não nesta rodada*.
2. **Não mede o dano de remover.** Os cinco pontos foram localizados por leitura; o
   comportamento de cada um com `base_item_id` nulo **não foi exercitado**. Que eles
   degradem graciosamente é hipótese, não medição — `hipotese-derrubada-pela-propria-medicao.md`
   manda testar, e o teste não foi escrito porque a remoção não foi feita.
3. **Não classifica os 62 como corretos nem os 15 como incompletos.** A medição conta
   estados, não intenção.

## Relação com as regras

`razao-longe-da-restricao.md` é a razão desta página existir: o seletor é uma restrição
declarada numa tela e a razão dela mora em cinco arquivos que ninguém abre ao mexer no
formulário. A regra de lá se aplica inteira — **restrição sem razão citada no ponto de
declaração não autoriza remoção, autoriza pergunta** — e foi exatamente o que aconteceu:
a pergunta foi feita, a medição respondeu, e a remoção ficou para uma rodada própria.
`registro-de-classe.md` decidiu que isto mora em arquivo versionado em vez de corpo de PR.
