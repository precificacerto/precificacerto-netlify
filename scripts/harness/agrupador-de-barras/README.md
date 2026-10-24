# Harness — o agrupador de barras (as mutações)

**NÃO TOCA PRODUÇÃO nem banco nenhum.** Só jest. Prova que cada regra de
`src/lib/atendimentos-ia/agrupador-de-barras.ts` tem um caso em
`src/utils/__tests__/agrupador-de-barras.test.ts` que **fica vermelho** quando a regra é retirada:
27 mutações reais e um controle.

## Como rodar

```bash
python3 -B scripts/harness/agrupador-de-barras/mutacoes.py          # as 28 (~5 s cada)
python3 -B scripts/harness/agrupador-de-barras/mutacoes.py M3 M24   # só estas
```

Precisa de `node_modules` (`npm ci`). O script se posiciona sozinho na raiz do repositório.

| veredito | significa |
|---|---|
| `VERMELHO` | a linha `Tests:` do jest traz `N failed`, N > 0 — a mutação derrubou caso |
| `NAO DERRUBOU` | tudo verde. Numa mutação real, é um caso que não exercita a regra |
| `NAO CARREGOU` | exit ≠ 0 **sem** caso falho: a suíte não carregou. **Não conta como vermelho** |
| `TRECHO APARECE N VEZES` | o código mudou e a mutação não se aplica mais — ajuste-a, não a apague |

Sai com **1** se alguma mutação real não sair `VERMELHO` ou se o controle `M0` não sair verde; com
**2** se o arquivo-alvo não voltar byte a byte ao que era. A mutação é escrita **no arquivo do
repositório** (com `.bak`, restaurada em `finally`): o script recusa rodar com o arquivo-alvo sujo,
e **não se commita enquanto ele roda**.

## As regras que o portão fixa

As da mensagem do dono do produto de 24/10/2026. A seção XL de `claude/Regra_Secao_Clientes.md`,
citada como fonte, **não está no repositório e não foi lida**.

**O modelo do corte** é o que o dono do produto corrigiu em 24/10/2026, substituindo o "um corte por
peça, sempre" do #143 (com ele, uma peça de 6.000 mm não cabia numa barra de 6.000 mm):

    cortes = (n − 1) + (1 se sobrar material, 0 se a soma fechar exata)

As peças cabem se `Σ peças + (n − 1) × serra ≤ barra`. Quando sobra menos que a largura da serra,
elas cabem e o último corte come só o resto (decisão do dono do produto, mesma data). Para
3 × 1.900 numa barra de 6.000, a serra que discrimina é **151 mm** (6.002 > 6.000); **150 mm é a
FRONTEIRA**, em que a soma fecha exata com 2 cortes (M3). A M19 é a volta ao modelo do #143, e
derruba o caso do 6.000 em 6.000.

## As 27 mutações — o que cada uma derruba

Medido em 24/10/2026, com o caso de monotonicidade: **26 casos; 27 de 27 vermelhas, e o controle
verde.**

| # | mutação | casos | um dos que caem |
|---|---|---:|---|
| M1 | a serra não entra na conta | 11 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M2 | só os n − 1 cortes entre as peças: o corte da sobra nunca entra | 4 | 3 peças de 1,9 m numa barra de 6 m, serra 5 mm: 5.700 + 2 × 5 = 5.710 ≤ 6.000 — cabe |
| M3 | encostar no fim da barra NÃO é permitido (< em vez de ≤) | 4 | serra de 0 a 200 mm, de 1 em 1: o número de barras de cada código e do levantamento nunca dimin… |
| M4 | códigos diferentes com a mesma barra se misturam | 6 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M5 | empacota por LINHA DA ENTRADA (esquadria), não pelo levantamento | 6 | a mesma entrada embaralhada de 20 formas (e com as quantidades quebradas) dá EXATAMENTE o mesmo… |
| M6 | a barra é uma constante de 6000, não a do item | 2 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M7 | peça maior que a barra não é recusada como tal | 2 | peça de 6,2 m num código de barra 6 m: RECUSA nomeando a peça, o código e os dois comprimentos |
| M8 | sem ordenar por tamanho (fica a ordem da entrada) | 3 | a mesma entrada embaralhada de 20 formas (e com as quantidades quebradas) dá EXATAMENTE o mesmo… |
| M9 | ordena da MENOR para a maior | 4 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M10 | códigos na ordem da maior peça, não na ordem do código | 1 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M11 | consumo real sobre os metros COMPRADOS | 4 | a diferença entre os dois é EXATAMENTE a sobra valorada (sobra × valor do metro) |
| M12 | barra inteira valorada pelos metros úteis | 3 | a diferença entre os dois é EXATAMENTE a sobra valorada (sobra × valor do metro) |
| M13 | só um dos totais (consumo real sempre null) | 4 | a diferença entre os dois é EXATAMENTE a sobra valorada (sobra × valor do metro) |
| M14 | aproveitamento do levantamento = MÉDIA dos códigos | 1 | barras por código, metros úteis e comprados, e o aproveitamento = úteis ÷ comprados (não a médi… |
| M15 | a sobra não inclui a serra | 3 | duas peças que fecham a barra EXATO com o corte entre elas: 3.000 + 5 + 2.995 = 6.00 |
| M16 | milimetrosDaBarra ingênuo (m × 1000 em ponto flutuante) | 1 | milimetrosDaBarra: 2,01 m são 2.010 mm EXATOS (2,01 × 1000 dá 2009.9999999999998 em ponto flutu… |
| M17 | a recusa da peça maior não nomeia o código | 1 | peça de 6,2 m num código de barra 6 m: RECUSA nomeando a peça, o código e os dois comprimentos |
| M18 | código sem barra supõe 6 m | 1 | código SEM comprimento de barra: recusa nomeando o código — nunca supõe 6 m |
| M19 | n cortes SEMPRE, um por peça — o modelo do #143 | 7 | peça do tamanho EXATO da barra CABE: 1 peça, 0 cortes, sobra 0, aproveitamento 100% — não há o … |
| M20 | o total soma o que tem (soma parcial) | 1 | no total do levantamento: os dois somados quando TODO código tem preço; se um não tem, o total … |
| M21 | preço ausente vira ZERO | 2 | no total do levantamento: os dois somados quando TODO código tem preço; se um não tem, o total … |
| M22 | só a primeira recusa sai | 2 | uma recusa não esconde as outras: todas saem, na ordem do código |
| M23 | quantidade fracionária é aceita | 1 | serra negativa, quantidade não inteira e comprimento não positivo: cada um vira uma recusa próp… |
| M24 | contas em MILÍMETROS com ponto flutuante, sem o micrômetro inteiro | 1 | peças com decimais que fecham EXATO a barra cabem: 2.043,4 + 2.043,3 + 1.903,3 + 2 × |
| M25 | o último corte cobra a serra INTEIRA mesmo quando sobra menos que ela | 2 | sobra MENOR que a serra: as peças cabem e o último corte come só o resto — serra 120 |
| M26 | sobra menor que a serra NÃO cabe (a leitura literal, que o dono do produto recusou) | 3 | serra de 0 a 200 mm, de 1 em 1: o número de barras de cada código e do levantamento nunca dimin… |
| M27 | o corte da sobra é contado mesmo quando a soma fecha exata | 4 | peça do tamanho EXATO da barra CABE: 1 peça, 0 cortes, sobra 0, aproveitamento 100% — não há o … |
| **M0** | **controle: nada muda** | **0** | **verde — o detector não é vermelho por construção** |

## A monotonicidade, e por que a M26 EXIGE a razão

A serra maior nunca pode dar MENOS barras. Foi isso que derrubou a leitura em que o último corte cobra
a serra inteira mesmo quando sobra menos que ela: 3 × 1.900 em barra de 6.000 dava 1 barra com serra
100, 2 de 101 a 149, 1 com 150 e 2 de 151 em diante. O caso `MONOTONICIDADE` varre a serra de 0 a
200 mm sobre um conjunto fixo de seis códigos e afirma que nenhum código, e nem o levantamento, perde
barra.

**O que ele NÃO afirma:** que o first fit decrescente seja monótono para qualquer conjunto. Medido em
27.000 conjuntos aleatórios de 3 a 23 peças, nenhuma anomalia — é medição, não teorema.

**A M26 é a mutação desse caso, e a M25 não é.** A M25 só cobra a serra inteira na conta do último
corte, sem mudar o encaixe: o número de barras não muda, e ela cai noutros casos. A M26 muda o
encaixe, e é ela que traz o outro modelo de volta.

**Ela derrubava o caso pela razão errada.** Na primeira versão o conjunto tinha uma peça de 5.400 mm
em barra de 5.500; a M26 a recusava a partir da serra 101, e o caso caía por RECUSA. O nome do caso
batia, a razão não. A peça passou a 5.200, e o `exige` da bateria procura na saída da falha a própria
queda (`T3: serra 149 → 150, 2 → 1 barras`). A M19 exige o caso do 6.000 em 6.000.

## Três casos que só ficaram certos porque a mutação os derrubou

A bateria achou, na primeira rodada, casos meus que **não discriminavam** (`teste-que-nao-exercita.md`):

- **M14, o aproveitamento do levantamento.** Os dois códigos do caso compravam 6 m cada, e com pesos
  iguais a média dos aproveitamentos é igual a úteis ÷ comprados. O caso passou a ter P2 com 2 barras:
  87,22% contra 89,17% da média.
- **M16, a conversão da barra.** O caso afirmava que `5,8 × 1000` dá `5800.000000000001`. Não dá:
  medido, dá 5800. Nenhuma medida que existe hoje em produção (6; 5,8; 5,5; 1; 100; 300) falha; 175
  das 12.000 medidas de até 3 casas até 12 m falham — o caso usa 2,01 m (`2009.9999999999998`).
- **M24, as contas em micrômetros.** O primeiro exemplo de decimais (2.994,3 + 1.896,8 + 1.093,9)
  estourava em ponto flutuante só NUMA ORDEM que o agrupador não usa. O caso passou a usar
  2.046,3 + 2.042,9 + 1.895,8, que estoura na ordem decrescente — a do agrupador. Com o modelo de
  corte corrigido, essa trinca sobra 5 mm e saiu da fronteira; o caso usa hoje 2.043,4 + 2.043,3 +
  1.903,3 + 2 × 5 = 6.000, que dá 6000.000000000001 em mm float nas operações do agrupador.

## Relação com as outras regras

`teste-que-nao-exercita.md` é o critério, e os três casos acima são a variante 2 dele.
`hipotese-derrubada-pela-propria-medicao.md` é a M16: a afirmação estava no nome do caso.
`portao-que-nao-alcanca.md` é a razão do veredito `NAO CARREGOU`.
