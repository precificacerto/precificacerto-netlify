# Harness — o agrupador de barras (as mutações)

**NÃO TOCA PRODUÇÃO nem banco nenhum.** Só jest. Prova que cada regra de
`src/lib/atendimentos-ia/agrupador-de-barras.ts` tem um caso em
`src/utils/__tests__/agrupador-de-barras.test.ts` que **fica vermelho** quando a regra é retirada:
24 mutações reais e um controle.

## Como rodar

```bash
python3 -B scripts/harness/agrupador-de-barras/mutacoes.py          # as 25 (~5 s cada)
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

**O modelo do corte** foi decidido pelo dono do produto em 24/10/2026: cada peça consome UM corte de
`serra_mm`, inclusive a última; encostar no fim da barra é permitido (≤). O enunciado original
pedia "com serra de 100 mm, cabem só 2", o que nenhum modelo de corte fazia concordar com a conta
escrita ("5,7 + 2 cortes"). Por isso o caso que discrimina a serra usa 101 mm, e o de 100 mm é a
FRONTEIRA (M3).

## As 24 mutações — o que cada uma derruba

Medido em 24/10/2026: **22 casos; 24 de 24 vermelhas, e o controle verde.**

| # | mutação | casos | um dos que caem |
|---|---|---:|---|
| M1 | a serra não entra na conta | 7 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M2 | n − 1 cortes: a primeira peça da barra não consome serra | 4 | FRONTEIRA: serra de 100 mm dá exatamente 6.000 — encostar no fim da barra é permitido, cabem 3 |
| M3 | encostar no fim da barra NÃO é permitido (< em vez de ≤) | 2 | FRONTEIRA: serra de 100 mm dá exatamente 6.000 — encostar no fim da barra é permitido, cabem 3 |
| M4 | códigos diferentes com a mesma barra se misturam | 5 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M5 | empacota por LINHA DA ENTRADA (esquadria), não pelo levantamento | 4 | a mesma entrada embaralhada de 20 formas (e com as quantidades quebradas) dá EXATAMENTE o mesmo… |
| M6 | a barra é uma constante de 6000, não a do item | 2 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M7 | peça maior que a barra não é recusada como tal | 1 | peça de 6,2 m num código de barra 6 m: RECUSA nomeando a peça, o código e os dois comprimentos |
| M8 | sem ordenar por tamanho (fica a ordem da entrada) | 3 | a mesma entrada embaralhada de 20 formas (e com as quantidades quebradas) dá EXATAMENTE o mesmo… |
| M9 | ordena da MENOR para a maior | 3 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M10 | códigos na ordem da maior peça, não na ordem do código | 1 | a ordem: códigos em ordem de código, e em cada código a maior peça primeiro (first fit decresce… |
| M11 | consumo real sobre os metros COMPRADOS | 4 | a diferença entre os dois é EXATAMENTE a sobra valorada (sobra × valor do metro) |
| M12 | barra inteira valorada pelos metros úteis | 3 | a diferença entre os dois é EXATAMENTE a sobra valorada (sobra × valor do metro) |
| M13 | só um dos totais (consumo real sempre null) | 4 | a diferença entre os dois é EXATAMENTE a sobra valorada (sobra × valor do metro) |
| M14 | aproveitamento do levantamento = MÉDIA dos códigos | 1 | barras por código, metros úteis e comprados, e o aproveitamento = úteis ÷ comprados (não a médi… |
| M15 | a sobra não inclui a serra | 2 | o consumo da serra sai à parte, e a sobra é TUDO o que se compra e não vira peça (retalho + ser… |
| M16 | milimetrosDaBarra ingênuo (m × 1000 em ponto flutuante) | 1 | milimetrosDaBarra: 2,01 m são 2.010 mm EXATOS (2,01 × 1000 dá 2009.9999999999998 em ponto flutu… |
| M17 | a recusa da peça maior não nomeia o código | 1 | peça de 6,2 m num código de barra 6 m: RECUSA nomeando a peça, o código e os dois comprimentos |
| M18 | código sem barra supõe 6 m | 1 | código SEM comprimento de barra: recusa nomeando o código — nunca supõe 6 m |
| M19 | peça + serra maior que a barra é aceita | 1 | peça do tamanho EXATO da barra: não cabe com o corte (6.000 + 5 > 6.000) — recusa com motivo pr… |
| M20 | o total soma o que tem (soma parcial) | 1 | no total do levantamento: os dois somados quando TODO código tem preço; se um não tem, o total… |
| M21 | preço ausente vira ZERO | 2 | no total do levantamento: os dois somados quando TODO código tem preço; se um não tem, o total… |
| M22 | só a primeira recusa sai | 2 | uma recusa não esconde as outras: todas saem, na ordem do código |
| M23 | quantidade fracionária é aceita | 1 | serra negativa, quantidade não inteira e comprimento não positivo: cada um vira uma recusa próp… |
| M24 | contas em MILÍMETROS com ponto flutuante, sem o micrômetro inteiro | 1 | peças com decimais que encostam EXATAMENTE no fim da barra cabem: 2.046,3 + 2.042,9 + 1.895,8 +… |
| **M0** | **controle: nada muda** | **0** | **verde — o detector não é vermelho por construção** |

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
  2.046,3 + 2.042,9 + 1.895,8, que estoura na ordem decrescente — a do agrupador.

## Relação com as outras regras

`teste-que-nao-exercita.md` é o critério, e os três casos acima são a variante 2 dele.
`hipotese-derrubada-pela-propria-medicao.md` é a M16: a afirmação estava no nome do caso.
`portao-que-nao-alcanca.md` é a razão do veredito `NAO CARREGOU`.
