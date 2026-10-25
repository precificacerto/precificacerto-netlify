---
paths:
  - "src/lib/atendimentos-ia/**"
  - "src/pages/api/atendimentos-ia/**"
  - "supabase/migrations/**"
---

# A Coluna Que Parece Enumeração

> **Esta regra é independente da rodada que a originou.** Nasceu em 20/10/2026, na DP-02, ao
> ler o arquivo de tipologias da Wolff, e viveu até 24/10/2026 na base de conhecimento do
> projeto, **fora do repositório** — onde foi citada duas vezes como se fosse arquivo daqui.
> Versionada em 24/10/2026, na medição da ponte entre o código do motor e o da tabela de preço.
> **Não depende da Wolff nem do motor**: vale para toda coluna cujo nome é um atributo e que é
> usada como filtro por igualdade.

## O critério

Formulação do dono do produto, registrada como está:

> A coluna `cor` do motor guarda 1MM, 3MM, 5MM, IL50, BZ1770, LINHA 42, CLICK e (DESAGUE) —
> **não é cor, é discriminador de variante.** Filtrar por igualdade nela descarta regra legítima
> em silêncio.

**Uma coluna com nome de atributo pode guardar, além dos valores do atributo, qualquer outra
coisa que distinga uma linha da vizinha.** Lida pelo nome, ela parece uma enumeração fechada
(BRANCO, PRETO, GOLDEN OAK…) e convida ao filtro `cor = <a escolhida>`. Lida pelos valores, ela é
o lugar onde o fornecedor pôs **o que diferencia duas peças de mesmo perfil** — e às vezes isso é
uma cor, às vezes uma espessura, às vezes o nome de outro perfil.

## Por que a distinção é difícil de ver

Porque **a maioria dos valores É cor**. Dos 72 valores distintos da coluna na tabela Wolff, 56
trazem um acabamento — alguns colados ao nome de uma peça, como *"GUARNIÇÃO ARREMATE INTERNO
17X70MM LAMINADO BRONZE"*; quem olha as primeiras linhas, ou o nome da coluna, ou a aba
filtrada por um perfil comum, vê uma enumeração de cores e conclui o tipo da coluna. Os valores
que desmentem são poucos e estão em peças pequenas — calço, escova, botão, capa d'água.

E o filtro errado **não falha**. Uma regra descartada por `cor <> 'BRANCO'` não produz erro nem
peça negativa: ela simplesmente não aparece no levantamento. A esquadria sai com uma peça a
menos, o preço sai menor, e o total continua fechando consigo mesmo.

O gesto que produz o defeito é o gesto certo para uma coluna que fosse mesmo de cor. Escolher a
cor da esquadria e filtrar as regras por ela é exatamente o desenho que se esperaria — e é
justamente por parecer certo que ninguém lista os valores antes.

## A aparição

| # | Onde | O que a coluna guardava além de cor | O que o filtro por igualdade faria |
|---|---|---|---|
| 1 | `orcamentista_motor_regra.cor`, tabela Wolff (`72366020-…`), medido em 24/10/2026 | `1MM`, `3MM`, `5MM`, `IL50`, `BZ1770`, `LINHA 42`, `CLICK`, `(DESAGUE)` — **200 regras** na tabela inteira; e mais oito valores, 173 regras, achados ao listar (seção abaixo) | na DP-02, descartaria **8 regras**, **7 delas com condição própria que já as governa** — 10 e 9 com os achados |

As 8 da DP-02, como estão no banco:

| `cor` | código | peça | condição |
|---|---|---|---|
| `(DESAGUE)` | 87341 | CAPA D'AGUA COM FLIP | `(CA=1)` |
| `1MM` | 8595 | CALÇO DE VIDRO - 1MM | `(FV=5) or (FV=6)` |
| `3MM` | 8596 | CALÇO DE VIDRO - 3MM | `(FV=1) or (FV=2)` |
| `5MM` | 8597 | CALÇO DE VIDRO - 5MM | `(FV=3) or (FV=4) or (FV=5) or (FV=6)` |
| `BZ1770` | 9074 | BOTÃO PARA GUARNIÇÃO DE 70MM | `(ARI=2)` |
| `CLICK` | 10491 | BZ0012 - BASE DA GUARNIÇÃO | `(ARI=1)` |
| `IL50` | 9347 | ESCOVA DE VEDAÇÃO COM BARREIRA 10X6MM | `(INT=2)` |
| `LINHA 42` | 1399 | BATENTE CORRER (STOPPER) 19MM | — |

**As sete condições são a prova de que a coluna não decide nada ali.** Quem escolhe entre o
calço de 1, 3 ou 5 mm é `FV` (a espessura do vidro), não a cor; quem liga a escova é `INT`.
Filtrar pela cor da esquadria retiraria uma decisão que a própria regra já toma, por outra
variável.

Na tabela inteira, as 200 regras se distribuem assim: `(DESAGUE)` 27, `1MM` 41, `3MM` 41,
`5MM` 41, `BZ1770` 5, `CLICK` 7, `IL50` 16, `LINHA 42` 22.

### A lista não fecha em oito

Os oito valores acima são os da formulação. **Listar os 72 — o remédio desta página, aplicado a
ela mesma ao escrevê-la — mostrou mais oito** que, lidos, também não são cor:

| `cor` | regras | na DP-02 | o que o valor nomeia |
|---|---:|---:|---|
| `ALUMÍNIO` | 75 | 0 | material |
| `AÇO GALVANIZADO (Z275)` | 31 | 0 | material |
| `AÇO` | 3 | 0 | material |
| `SF106  AÇO GALVANIZADO (Z275) (PE630-1)` | 16 | 0 | perfil de reforço e material |
| `FOLHA PORTA ABERTURA INTERNA` | 18 | 0 | função da peça |
| `GUARNIÇÃO ARREMATE INTERNO 17X70MM` | 14 | **2**, as duas com condição | nome da peça, sem acabamento |
| `SEM VENTILAÇÃO` | 13 | 0 | variante da persiana |
| `PINGADEIRA` | 3 | 0 | função da peça |

**173 regras a mais**, 373 no total; na DP-02, **10 regras**, 9 com condição. A coluna "o que o
valor nomeia" é **leitura**, não medição — material e acabamento se confundem no reforço, e quem
precisar da fronteira exata decide valor a valor. O que é medição é que nenhum dos dezesseis
coincide com um item da lista `cores` da base, e que um filtro `cor = <cor da esquadria>` os
descartaria.

### O mesmo texto em outro papel

`IL50` está nesta coluna como variante da escova `9347` — e está **também** como código WVetro
de outra peça, `IL50/WOLFF`, o interlock de porta, em 180 regras. A busca que procurou `IL50`
só como código, na coluna errada, concluiu que ele não existia no banco. Esse erro é de
instrumento, não desta classe, e está registrado como a aparição 5 de
`instrumento-que-nao-enxerga.md`.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, em 24/10/2026, aplicando o remédio abaixo às outras
colunas com nome de atributo das duas tabelas da importação, na tabela Wolff. **Uma aparição, e
nenhuma segunda foi forçada.**

| coluna | valores distintos | por que não entra |
|---|---|---|
| `motor_regra.segmento` | Perfil PVC, Reforço, Acessórios | todos são segmento |
| `motor_regra.tipo` | Perfil, Insumo | todos são tipo |
| `motor_regra.linha` | EUROPA 60, EUROPA 42, DESIGN | todos são linha |
| `motor_regra.eixo` | Altura, Largura, vazio | todos são eixo; o vazio é das 731 regras de Insumo |
| `motor_regra.corte` | 90/90, 45S/45S, 45/45, 90/45S, 45S/90, 90/45, 45/90, vazio | todos são corte |
| `tabela_item.segmento` | Perfil PVC, Reforço, Acessórios, **`acessórios`**, vazio | a variante em minúscula é **caixa**, não outro atributo — outra classe |
| `tabela_item.unidade` | MT, PC, **`pc`**, vazio | idem |
| `tabela_item.vendido_por` | barra, unidade | todos são o atributo |
| `tabela_item.pacote` | 1, 2, 4, 10, 15, 20, 25, vazio | todos são quantidade |

**Achado da busca, registrado por ser útil e não por ser aparição:** `tabela_item.secao` traz os
nomes das famílias de cor como o fornecedor as escreve na tabela de preço — *"GOLDEN OAK -
AMADEIRADO"*, *"AMADEIRADO NOGUEIRA"*, *"PRETO JET BLACK"*. São os mesmos nomes da lista `cores`
da base de conhecimento da empresa (`branco`, `amadeirado`, `preto jet black`), que **não**
existem na coluna `cor` do motor. É uma pista para a ponte cor-da-base → variante-do-motor, que
está com o dono do produto para decidir. Não é desta classe: `secao` é seção, e guarda seção.

## O remédio

Formulação do dono do produto, registrada como está:

> **Antes de filtrar por igualdade numa coluna com nome de atributo, liste os valores distintos
> dela.** Se aparecerem coisas que não são daquele atributo, a coluna é discriminador, e o filtro
> está descartando trabalho.

```sql
select coalesce(cor, '(nula)') as valor, count(*)
  from orcamentista_motor_regra
 where tabela_id = '<tabela>'
 group by 1 order by 2 desc;
```

Custa uma consulta. É o mesmo gesto de `instrumento-que-nao-enxerga.md` — construir o caso antes
de confiar no número —, aplicado ao tipo de uma coluna em vez de a um padrão de busca: **o nome
da coluna é a hipótese; os valores distintos são a medição.**

## O corolário aplicável ANTES do defeito existir

Sinais, em ordem de força:

1. O filtro é **por igualdade** contra um valor escolhido pelo usuário — `cor = X`,
   `linha = Y` —, e a linha que não casa **some** em vez de virar recusa.
2. A coluna veio de **arquivo de terceiro**, onde o nome do cabeçalho é do fornecedor e o
   conteúdo também.
3. A tabela tem **outra coluna que já decide** a presença da linha — aqui, `condicao` —, e o
   filtro novo se sobrepõe a ela.
4. Ninguém listou os valores distintos da coluna antes de escrever o filtro.

Quando o 1 e o 4 coincidem, liste os valores. Se todos forem do atributo, o filtro está certo —
e a lista vira o caso de teste que prova isso.

## As ressalvas de método — o que a medição NÃO diz

- **Não decide como a ligação avaliador → agrupador trata essas regras.** A ponte entre a cor da
  base e as variantes do motor, e os pares (WVetro, cor) com mais de um código, estão com o dono
  do produto. Esta página registra por que um filtro ingênuo seria errado; não escolhe o certo.
- **Não diz o que a `cor` vazia significa.** 553 regras têm a coluna vazia. Ler o vazio como
  "vale para qualquer cor" é hipótese não medida (`ausente-vs-falso.md`), e quem desenhar o
  filtro tem de conferir antes de usá-la.
- **Não mede outras tabelas de fornecedor.** Uma tabela só, a da Wolff. Outro fornecedor pode
  usar a mesma coluna de outro jeito — e o remédio é justamente não presumir.

## Relação com as outras regras

`instrumento-que-nao-enxerga.md` é a vizinha mais próxima e guarda o outro papel do `IL50`: lá o
instrumento procura no lugar errado e não vê o que existe; aqui o filtro confia no nome da coluna
e descarta o que existe. Os dois remédios são o mesmo gesto — derivar da fonte em vez de presumir.
`regime-e-segmento-determinam-a-construcao.md` é a razão de a ponte de cor não ser inventada: a
decomposição lê, não infere, e a ligação também. `ausente-vs-falso.md` é a ressalva da `cor`
vazia. `tabela-que-a-importacao-apaga.md` trata das mesmas tabelas por outro eixo — quem as
apaga —, e esta, de quem as filtra. `registro-de-classe.md` decidiu a forma desta página e o
limite que a manteve numa aparição só, com a nota da busca.
