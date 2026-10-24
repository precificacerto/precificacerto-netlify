# Harness — o avaliador de fórmulas (as mutações)

**NÃO TOCA PRODUÇÃO nem banco nenhum.** Só jest. Prova que cada regra de
`src/lib/atendimentos-ia/avaliador-de-formulas.ts` tem um caso em
`src/utils/__tests__/avaliador-de-formulas.test.ts` que **fica vermelho** quando a regra é retirada —
e, em quase todas, que o caso que cai é **o caso daquela regra**, não outro qualquer.

## Como rodar

```bash
python3 -B scripts/harness/avaliador-de-formulas/mutacoes.py          # as 31 (~8 s cada)
python3 -B scripts/harness/avaliador-de-formulas/mutacoes.py M3 M10   # só estas
```

Mesmos vereditos de `scripts/harness/agrupador-de-barras/README.md`. O 5º elemento de uma mutação é
um trecho que TEM de aparecer na saída da falha: com `--silent` a saída do jest só lista os casos que
FALHARAM (medido em 24/10/2026), então um nome de caso exigido discrimina.

## As 30 mutações

Medido em 24/10/2026: **42 casos; 30 de 30 vermelhas, cada uma com o caso exigido; o controle verde.**

| # | mutação | casos | exige |
|---|---|---:|---|
| M1 | o IIF avalia OS DOIS ramos | 18 | IIF só avalia o ramo escolhido |
| M2 | o `and` avalia os dois lados | 1 | and/or só avaliam o lado que decide |
| M3 | `&X` sem colchete vira ZERO | 2 | os padrões (ARE = 1, MAE = 1) não fecham |
| M4 | ARREDMAIOR é o piso | 2 | ARREDMAIOR é o teto |
| M5 | a soma em ponto flutuante | 1 | a conta é exata |
| M6 | sem precedência | 1 | precedência |
| M7 | sem detecção de ciclo | 1 | CICLO |
| M8 | WOLSPVC = 0 | 4 | as constantes do Leia-me |
| M9 | o Padrão é ignorado | 19 | X e Y saem do Padrão |
| M10 | a escolha é ignorada | 14 | a escolha vale sobre o Padrão |
| M11 | a espessura não filtra o baguete | 5 | vidro de 20 mm |
| M12 | sem a espessura, o baguete sai sem recusa | 1 | sem a espessura |
| M13 | espessura que nenhum baguete atende passa calada | 1 | nenhum baguete atende |
| M14 | Qtd fracionária é aceita | 1 | Qtd fracionária |
| M15 | comprimento zero ou negativo é aceito | 1 | comprimento zero ou negativo |
| M16 | a validação falsa não vira aviso | 2 | H = 380 |
| M17 | os limites do detalhe são ignorados | 2 | H = 380 |
| M18 | limite NULL vira limite ZERO | 20 | largura sem limite |
| M19 | o % do excesso sobre o valor, e não sobre o limite | 2 | H = 380 |
| M20 | a recusa não diz linha, perfil nem campo | 6 | os padrões não fecham |
| M21 | só a primeira recusa sai | 5 | todas as recusas saem |
| M22 | o cabeçalho não é conferido | 1 | coluna que falta no cabeçalho |
| M23 | o número de argumentos não é conferido | 1 | recusas nomeadas |
| M24 | função desconhecida não é recusada como tal | 1 | recusas nomeadas |
| M25 | a vírgula decimal da família vira número | 2 | vírgula decimal da família |
| M26 | "sempre" não é verdadeiro | 19 | as 17 peças |
| M27 | o comprimento arredondado ao mm, não ao µm | 1 | as 17 peças |
| M28 | Qtd zero vira peça de quantidade zero | 1 | Qtd zero |
| M29 | a escolha fora das opções é aceita | 1 | escolha fora das opções |
| M30 | nome sem valor vira ZERO | 2 | variável sem valor nem padrão |
| **M0** | **controle: nada muda** | **0** | **verde** |

## Dois furos no próprio instrumento, achados ao rodá-lo

- **O `and`/`or` sem caso.** O cabeçalho do módulo afirmava que `and` e `or` só avaliam o lado que
  decide, e nenhum caso exercitava isso: na DP-02 nenhuma condição depende disso, e a M2 passaria
  verde. O caso foi escrito antes de a bateria rodar (`teste-que-nao-exercita.md`).
- **O trecho exigido da M10 estava com "A" maiúsculo** e o título do caso tem "a". A M10 derrubou o
  caso certo e saiu `NAO DERRUBOU O EXIGIDO` — o instrumento mentiu no sentido oposto do
  verde-por-construção. O trecho foi copiado do título, e uma conferência passou a afirmar que todo
  trecho exigido está, literalmente, em algum título do portão (zero fora).
