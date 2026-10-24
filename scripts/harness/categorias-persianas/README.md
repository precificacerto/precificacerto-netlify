# Harness — o catálogo de categorias (migração 20261024000004)

**NÃO TOCA PRODUÇÃO.** Postgres local. Prova que a migração que põe PERSIANAS no catálogo, troca o
rótulo de REFORCO e assenta a ordem nova roda duas vezes, preenche a linha nova de cada
matéria-prima sem tocar nas outras, e não desfaz o conserto de mojibake da 20261024000002.

## Como rodar

O Postgres local é o mesmo dos outros harness desta pasta (subir uma vez por container: ver o
README de `../tres-niveis/`). `PGHOST` e `PGPORT` trocam o endereço (padrão: `/tmp/harness-pg`,
`54329`).

```bash
bash scripts/harness/categorias-persianas/run.sh              # a migração do repositório
bash scripts/harness/categorias-persianas/run.sh <copia>      # uma cópia alterada
python3 -B scripts/harness/categorias-persianas/mutacoes.py   # as 12, e o controle
```

`run.sh` monta a base de conhecimento até a 20261024000002, cria duas matérias-primas **pela função
de produção** (`superadmin_gravar_materia_prima`) — a PVC com config em PERFIL, a Alumínio sem config
— e guarda uma cópia das 12 linhas de `orcamentista_mp_categoria`. Aplica a migração **duas vezes**
e confere que o schema **e os dados** (catálogo, mp_categoria e campos, linha a linha) ficaram
idênticos. Depois roda os 7 casos.

## Os casos

Medido em 24/10/2026: **7 de 7**, mais as duas igualdades da segunda aplicação.

| caso | o que prova |
|---|---|
| 1 | o catálogo: 7 linhas, na ordem e com os rótulos decididos — escritos no caso como o dono do produto os decidiu, independentes da tabela `_alvo` da migração |
| 2 | o hex de "Reforço metálico" (`5265666f72c3a76f206d6574c3a16c69636f`): chegou em UTF-8 |
| 3 | **o backfill:** as 2 matérias-primas com 7 linhas, uma por chave, PERSIANAS sem config |
| 4 | sem tocar nas outras: as 12 linhas de antes iguais em id, config, autor e data; o PERFIL da PVC com o config que tinha |
| 5 | uma matéria-prima criada DEPOIS da migração, pela função de produção, nasce com as 7 |
| 6 | PERSIANAS sem campo escalar; os campos das outras como estavam |
| 7 | nenhum dos três COMMENTs reescritos diz quantas categorias são |

## As 12 mutações

Medido em 24/10/2026: **12 de 12 derrubaram o que deviam; o controle verde.** As B tiram a
verificação JUNTO com a regra, para provar que o CASO, sozinho, também pega.

| # | mutação | derruba |
|---|---|---|
| V1 | sem o backfill de PERSIANAS | verificação 3 |
| **B1** | **sem o backfill E sem a verificação 3** | **caso 3** |
| V2 | reordena com UPDATE direto, sem deslocar para a faixa livre | `duplicate key … ordem_key` — o UNIQUE colide, medido |
| V3 | REFORCO fica com o rótulo antigo | verificação 1 |
| B2 | o rótulo antigo E sem o md5 da verificação 1 | caso 1 |
| V4 | PERSIANAS e REFORCO trocados de lugar | verificação 1 |
| V5 | o backfill grava config vazio em vez de NULL | verificação 3 |
| V6 | o backfill refaz todas as categorias e zera o config | verificação 4 |
| V7 | o arquivo inteiro pela área de transferência (Latin-1 → UTF-8) | verificação 1 |
| V8 | um rótulo de campo volta com mojibake | verificação 2 |
| V9 | o COMMENT do catálogo continua com "As 6 categorias…" | verificação 1 |
| V10 | PERSIANAS ganha um campo escalar | verificação 5 |
| **M0** | **controle: nada muda** | **verde — 7 de 7** |
