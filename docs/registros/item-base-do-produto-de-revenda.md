# O seletor "Item base (mercadoria para revenda)" — o que ele alimenta

> **O SELETOR FOI REMOVIDO em 17/09/2026.** Esta página nasceu no mesmo dia como registro
> de pendência — a decisão da manhã era manter — e o dono do produto reviu à tarde, depois
> de a medição mostrar o caminho. Ela permanece porque **os cinco leitores da coluna
> continuam existindo** e quem mexer neles precisa achar isto escrito.
>
> **DUAS CORREÇÕES AO QUE ESTA PÁGINA AFIRMAVA.** Estão no topo, e não no fim, porque a
> primeira muda o enquadramento inteiro.

## CORREÇÃO 1 — o seletor era UM DE DOIS produtores, e o MINORITÁRIO

A versão anterior desta página listou cinco LEITORES de `base_item_id` e tratou o seletor
como o produtor. Ele não era o produtor: era **um** deles.

`itens/index.tsx:1079` cria o produto **automaticamente** ao cadastrar um item do tipo
REVENDA, já com `base_item_id` preenchido. Essa rota não passa por tela de produto nenhuma,
e **continua preenchendo a coluna depois da remoção**.

**Medido: 30 dos 62** produtos com base têm o nome idêntico ao do item base — a assinatura
daquela criação automática. Quase metade do total, e a maioria dos que nunca tocaram o
seletor.

Correção pedida pelo dono do produto, registrada como está:

> E corrija o meu registro de ontem: o seletor é UM DE DOIS produtores de `base_item_id`.
> A criação automática em `itens/index.tsx:1079` continua preenchendo, e 30 dos 62 vieram
> de lá.

## CORREÇÃO 2 — o caso que a decisão legislou tem ZERO produtos

A decisão de remover dizia: *"com dois ou mais itens não há item base a derivar: grave
NULL"*. Medido antes de implementar, sobre os 77 produtos de revenda:

| estado | produtos | o que `null` faria |
|---|---:|---|
| com base, **1 item** na composição | **30** | deriva o MESMO valor — sem perda |
| com base, **ZERO** itens | **32** | **APAGA** o vínculo |
| com base, **2 ou mais** | **0** | — |
| sem base, 1 item | **5** | **ganham** o vínculo |
| sem base, 2 ou mais | 1 | segue sem |
| sem base, sem composição | 9 | segue sem |

**O caso "dois ou mais" não existe em produção.** O caso real é "zero itens", e são 32 —
mais da metade dos que têm base. Gravar `null` ali não é o que a decisão quis dizer: é
apagar o único vínculo de estoque de 32 produtos existentes, em silêncio, na primeira vez
que alguém abrir e salvar cada um.

Daí a regra implementada em `src/utils/base-item-derivado.ts`: **um item → deriva; zero ou
dois e mais → PRESERVA o gravado**, que num produto novo é `null`, exatamente como pedido.
Preservar não é inventar — o valor preservado foi gravado por alguém, não deduzido de um
"primeiro item".

É `hipotese-derrubada-pela-propria-medicao.md`: a razão para escolher `null` era uma
suposição sobre ONDE o vazio acontece.

## O que o seletor ERA, na tela

No cadastro de produto, quando `product_type = 'REVENDA'`, o formulário **oferecia** um
seletor de **item base** — a mercadoria de `items` que aquele produto revende — mais um
banner mandando selecioná-lo. Ele gravava `products.base_item_id`.

A leitura natural era que fosse apresentação: um vínculo informativo entre o produto e o
insumo. **Não era** — e é por isso que a remoção precisou da derivação no lugar.

**O que ficou no lugar:** ao salvar um REVENDA cuja composição tem UM item, `base_item_id`
é derivado desse item. A mensagem do bloqueio, que mandava *"selecione o item de revenda"*
num formulário sem seletor, passou a dizer *"adicione o item de revenda à composição"*. O
bloqueio em si não mudou: continua sendo um OU, e composição preenchida já passava.

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

1. **Não diz que o seletor deve voltar.** Ele saiu, e a derivação cobre o caminho.
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
