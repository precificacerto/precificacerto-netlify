# Harness de várias montagens por remetente (migração 20261105000001)

Postgres local, o mesmo dos outros harness (ver `../tres-niveis/`). NÃO TOCA PRODUÇÃO.

```bash
bash scripts/harness/varias-montagens/run.sh                 # base + 20261025000003, aplica 2x e roda os 11 casos
python3 -B scripts/harness/varias-montagens/mutacoes.py       # as 7 mutações, o limite declarado e o controle
```

A base é `../levantamento-por-nome/00_como_em_producao.sql` + a `20261025000003` (que cria a tabela e o índice
`orcamentista_levantamento_um_em_montagem`): o estado de produção medido em 05/11/2026 às 17h UTC (o índice com a
definição exata, 6 constraints, 3 outros índices, 4 levantamentos e 0 em montagem).

| caso | o que prova |
|---|---|
| idempotência | aplicada duas vezes, o schema é idêntico (`DROP INDEX IF EXISTS`) |
| 1–2 | O CASO DA MARIA CRISTINA: dois e três `EM_MONTAGEM` do mesmo vendedor entram; o Jorge Koss não é tocado |
| 3 | o que NÃO mudou: o mesmo nome do mesmo vendedor continua recusado (`nome_key`) |
| 4 | o que NÃO mudou: o CHECK do estado continua `EM_MONTAGEM | COMPLETO` (ABANDONADO é recusado) |
| 5 | o mesmo nome em outro vendedor e em outro tenant entra |
| 6 | sem o índice; 3 índices e 6 constraints como antes |
| 7 | o comentário da tabela registra a mudança |
| contraste 1 | o índice com OUTRA definição aborta na guarda, e fica |
| contraste 2 | sem a tabela, a guarda aborta com a frase da dependência |
| contraste 3 | um índice a mais aborta na verificação 5, e o `um_em_montagem` fica (a transação volta) |

As V são barradas pela verificação de dentro da migração ou pelos contrastes; a B tira as verificações junto e
prova que o caso 1, sozinho, pega. V6 é o **limite declarado** do instrumento: a lista da verificação 2 sem o
`nome_key` passa, porque a verificação 3 conta as constraints no banco (6) e não vê a lista encurtada — quem
exercita a UNIQUE de fato é o caso 3. Medido em 05/11/2026: 7 de 7 vermelhas, V6 verde como declarado, M0 verde.
