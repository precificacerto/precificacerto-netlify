# Harness da mídia da entrada (migração 20261125000001, pedido 0029)

Postgres local, o mesmo dos outros harness (ver `../tres-niveis/`). NÃO TOCA PRODUÇÃO.

```bash
bash scripts/harness/midia-da-entrada/run.sh             # a base, a migração 2x, os casos e os 4 contrastes
python3 -B scripts/harness/midia-da-entrada/mutacoes.py  # as 11 mutações, sobre uma cópia do arquivo
```

A base (`00_como_em_producao.sql`) é a `orcamentista_mensagem` como está em produção, medida por consulta em
25/11/2026: 9 colunas, 6 constraints e 4 índices, com o mínimo que as FKs pedem.

| caso | o que prova |
|---|---|
| idempotência | aplicada duas vezes, o schema é idêntico |
| 1 | a entrada com a mídia (objeto) entra |
| 2 | as linhas de antes ficam, com a mídia nula |
| 3 | a SAÍDA com mídia é recusada |
| 4, 4b | a mídia que não é objeto (lista, texto) é recusada |
| 5 | a entrada sem mídia entra |
| 6 | os 4 índices de antes, nenhum a mais |
| 7 | o comentário da coluna nomeia a migração |
| contraste 1 | `midia` com outro tipo aborta na guarda, e fica |
| contraste 2 | sem a tabela, a guarda aborta nomeando o banco e o usuário |
| contraste 3 | uma constraint a mais aborta na verificação 3, e a coluna não fica (a transação volta) |
| contraste 4 | a CHECK de mesmo nome e outra definição aborta na guarda |

Medido em 25/11/2026: 13 ok, 0 falhas; mutações 11 de 11 mortas.
