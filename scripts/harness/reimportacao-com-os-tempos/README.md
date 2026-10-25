# Harness — a reimportação com os tempos na tabela própria

**NÃO TOCA PRODUÇÃO.** Postgres local, o mesmo dos outros harness desta pasta (subir uma vez por
container: ver o README de `../tres-niveis/`).

O teste que vale (dono do produto, 25/10/2026): **com os 164 tempos na tabela nova, uma reimportação
completa roda até o fim e os 164 tempos continuam lá depois.** É a prova de que a trava do tempo na
importação (#147) perdeu a razão de existir: o tempo mora em `orcamentista_motor_tipologia_tempo`
(20261024000003), que a função de importação (20261025000004) não alcança.

```bash
bash scripts/harness/reimportacao-com-os-tempos/run.sh              # a função do repositório
python3 -B scripts/harness/reimportacao-com-os-tempos/mutacoes.py   # as 4, e o controle
```

| arquivo | o que é |
|---|---|
| `05_estado_de_producao.sql` | o estado de produção medido em 25/10/2026: 164 tempos ESTIMADO, soma 87.300, nas colunas antigas da c1; e uma c2 com um tempo IMPORTADO |
| `08_payload.sql` | o payload de uma reimportação completa: as 164 tipologias e linhas em todas as 13 listas que a função exige |
| `10_casos.sql` | os 6 casos |
| `mutacoes.py` | a função de importação alcançando o tempo de quatro jeitos — cada um tem de derrubar um caso |

Os casos:

1. o preparo: a 20261024000003 copiou os 164 (soma 87.300) e o da c2;
2. a reimportação completa roda até o fim, e as 13 contagens batem com o enviado;
3. **depois dela, os 164 tempos continuam lá, idênticos linha a linha**;
4. o tempo da outra tabela (c2) não muda;
5. as colunas ANTIGAS da c1 ficam vazias — dito, não calado: a importação apaga e regrava
   `orcamentista_motor_tipologia` sem elas. São obsoletas desde a 20261024000003 e saem numa
   migração posterior;
6. uma segunda reimportação também deixa os 164.

**O que ele NÃO mede:** o volume do arquivo real (são 2 linhas por aba por tipologia, não as ~50 mil
do arquivo da Wolff) — o limite e o tempo da chamada só a importação de produção mede.
