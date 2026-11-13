# O Dito que Confere com a Tipologia — Absorvido e Escrito, Nunca Perguntado

> **Esta regra é independente da rodada que a originou.** Nasceu em 13/11/2026, no caso "2 Persiana 1,50 x 1,30 1 pano" (conversa `9477e86d`),
> quando o "pano" tirou o padrão de uma esquadria que já estava inteiramente dita. **Não depende da persiana**: vale para todo dito que o motor
> não representa como variável da conversa.

## O critério

Decisão do dono do produto, 13/11/2026, registrada como está:

> "1 pano" numa tipologia sem QP diz o que a tipologia já é. Dito que o motor não representa, mas que CONFERE com a natureza fixa da tipologia, é
> absorvido e ESCRITO na linha CONSIDERADO — não em silêncio, e não vira pergunta. Dito que CONTRADIZ a natureza fixa (ex.: "3 panos" numa
> DP-07, que não tem QP) continua sendo pergunta. Dito que o motor não representa e sobre o qual a tipologia nada afirma segue na regra atual,
> DITO_SEM_REPRESENTACAO.

Três casos, decididos **pela tipologia escolhida**, nunca pelo texto sozinho:

| o dito | a tipologia | o que acontece |
|---|---|---|
| confere com o que ela é por construção | afirma (natureza fixa) | absorvido: o rastro leva `origem = dito`, e a folha o escreve no CONSIDERADO |
| contradiz o que ela é por construção | afirma | pergunta (`CONTRADIZ_A_TIPOLOGIA`), nomeando a descrição, o dito e a natureza — sem código |
| qualquer | nada afirma (a variável existe, ou as variáveis não foram lidas) | a regra de antes: `DITO_SEM_REPRESENTACAO`, sem padrão |

## A aparição

| # | Quando | O dito | A natureza, medida | Antes | Depois |
|---|---|---|---|---|---|
| 1 | 13/11/2026 | "1 pano" (persiana) | a variável `QP` ("QUANTIDADE DE PANOS DE PERSIANA") existe em 12 tipologias do motor 022fc55e e só oferece 2 ou 3; a DP-07 tem persiana e não tem `QP` — um pano por construção | `DITO_SEM_REPRESENTACAO`: pergunta | DP-07, e o CONSIDERADO diz "com persiana (1 pano)" |

## O remédio

- **No código** (`tipologia-padrao.ts`): `panosDitos` lê os panos COM número ("1 pano", "dois panos"; o número que é o fim de uma medida, "1,30
  pano", não conta); o número dito sai de `DITO_SEM_REPRESENTACAO`, e "pano" sem número continua nele. `panosDaNatureza` dá 1 para a tipologia
  com persiana e sem `QP`, e null quando ela não afirma. A decisão do padrão compara os dois depois de escolher a tipologia.
- **Na folha** (`arquivo-do-levantamento.ts`): `panosDaPersiana` lê as variáveis da tipologia na família do item, e o CONSIDERADO escreve o pano da
  persiana de pano fixo — para quem disse e para quem não disse, porque é o que ela é.

## As ressalvas de método — o que esta regra NÃO diz

- **Não captura a `QP`.** Na tipologia que tem a variável, "2 panos" continua sem padrão: a conversa não grava a escolha da `QP`. Capturá-la é
  trabalho próprio.
- **Não infere natureza que o motor não mostra.** Sem as variáveis lidas, nada se absorve. A natureza vem da AUSÊNCIA da variável numa tipologia que
  tem o extra — e só onde o motor foi medido (a persiana).
- **Não vale para o motor da persiana** (motorizada, botoeira): o acionamento é a variável `AE`, presente em toda tipologia com persiana; a
  tipologia nada afirma, e a regra de antes vale.

## Relação com as outras regras

`ausente-vs-falso.md` é a razão de a natureza só valer com as variáveis lidas: variável ausente porque ninguém leu não é variável ausente do motor.
`faltou-dado-recusa-nomeada.md` é a vizinha do caso que contradiz: a pergunta nomeia o que não fecha.
