# Harness do levantamento de barras — a ligação avaliador → agrupador

Só jest. Não toca banco nem produção.

```bash
python3 -B scripts/harness/levantamento-de-barras/mutacoes.py          # todas
python3 -B scripts/harness/levantamento-de-barras/mutacoes.py M2 M12   # só estas
```

Cada mutação estraga UMA regra de `src/lib/atendimentos-ia/levantamento-de-barras.ts` e roda o
portão `src/utils/__tests__/levantamento-de-barras.test.ts`. O veredito é `VERMELHO` quando derruba
pelo menos um caso **e** o nome do caso exigido aparece na saída; `M0` é o controle e tem de sair
verde. O arquivo-alvo é mutado no lugar, com `.bak`, e conferido por sha256 no fim — o script recusa
rodar com o alvo sujo.

## As regras que as mutações estragam

| | regra | caso que a guarda |
|---|---|---|
| M1 | a cor escolhe o código | COR SEM CÓDIGO |
| M2 | dois códigos é recusa, nunca o primeiro | DOIS CÓDIGOS para o mesmo perfil e cor |
| M3 | perfil sem variante usa o único código | perfil SEM VARIANTE |
| M4 | a cor vazia ao lado de outras não é coringa | cor vazia AO LADO de outras cores não é coringa |
| M5 | a cor é comparada exata | a cor é comparada EXATA |
| M6 | perfil sem regra é recusa | PERFIL SEM REGRA |
| M7 | a quantidade da esquadria multiplica | multiplica as peças |
| M8 | a quantidade da esquadria é validada | QUANTIDADE DA ESQUADRIA inválida |
| M9 | o agrupamento é do levantamento inteiro | dividem barra |
| M10 | item ausente é recusa | ITEM AUSENTE |
| M11 | item em duas linhas é recusa | duas linhas |
| M12 | com recusa, nenhuma barra sai | NÃO SAI BARRA NENHUMA |
| M13 | todas as recusas saem | TODAS AS RECUSAS |
| M14 | a mesma falta sai uma vez, com as esquadrias juntas | UMA vez |
| M15 | a ordem das recusas não segue a da entrada | DETERMINÍSTICO |
| M16, M17 | a recusa do avaliador sai, e com a esquadria | a recusa do AVALIADOR |
| M18 | tipologia sem definição é recusa | TIPOLOGIA SEM DEFINIÇÃO |
| M19 | a recusa do agrupador sai com o perfil | a recusa do AGRUPADOR |
| M20 | o preço ausente é nomeado | PREÇO AUSENTE |
| M21 | a frase dos dois códigos traz os dois valores | os dois valores |
| M22 | a frase da cor sem código traz as variantes | nomeando a variante |
| M23 | a cor desta versão é BRANCO | só BRANCO |
| M24 | o real é formatado à mão, com vírgula | sem depender do ICU |
| M25 | o código do item sai com o perfil | CÓDIGOS DO ITEM |
| M26 | o código que vai ao agrupador é o do item | CÓDIGOS DO ITEM |
| M27 | os avisos do avaliador saem | os AVISOS |

## O que a bateria pegou ao ser escrita

A M15 passou verde na primeira rodada. O caso de determinismo usava duas recusas da ponte, e a
ponte percorre os perfis em ordem de texto: as duas já saíam na mesma ordem, com ou sem a
ordenação final. O caso foi trocado por um par que só a ordenação decide — uma recusa de esquadria
e uma do avaliador, que nascem no mesmo passo, na ordem da entrada (`teste-que-nao-exercita.md`,
variante 2).
