# Harness do levantamento por nome (migração 20261025000003)

Postgres local, o mesmo dos outros harness (ver `../tres-niveis/`). NÃO TOCA PRODUÇÃO.

```bash
bash scripts/harness/levantamento-por-nome/run.sh                 # aplica 2x e roda os 12 casos
python3 -B scripts/harness/levantamento-por-nome/mutacoes.py       # as 12 mutações e o controle
```

`00_como_em_producao.sql` monta `tenants` e `orcamentista_remetente_autorizado` com as colunas e as
constraints medidas em produção em 25/10/2026, e os DEFAULT PRIVILEGES do Supabase (sem eles o REVOKE
passaria verde sem ter o que revogar).

| caso | o que prova |
|---|---|
| 1–3 | no máximo UM `EM_MONTAGEM` por vendedor; COMPLETO e outro vendedor não contam |
| 4–5 | o nome é único por VENDEDOR (decisão 2): o mesmo vendedor não repete; outro vendedor pode |
| 6 | o estado é `EM_MONTAGEM` ou `COMPLETO` — `COMPLETA` (o da pre_definicao) é recusado |
| 7–8 | as FKs são compostas: remetente e levantamento de outro tenant são recusados |
| 9–10 | a ordem é única por levantamento; `escolhas` só objeto |
| 11 | apagar o levantamento leva os itens |
| 12 | anon e authenticated sem acesso, perguntado agindo como o papel |

As V são barradas pela verificação de dentro da migração; as B desligam a verificação junto e provam
que o caso, sozinho, também pega. Medido em 25/10/2026: 12 de 12 vermelhas, M0 verde.

## As mutações do CÓDIGO

```bash
python3 -B scripts/harness/levantamento-por-nome/mutacoes-do-codigo.py   # N1–N17 e o controle N0
```

Só jest, sem banco. Cada mutação estraga uma das quatro decisões do dono do produto no roteamento
(`nome-do-levantamento.ts`, `levantamento-em-montagem.ts`, `conversa-da-ia.ts`, `inbound.ts`) e
exige que um caso nomeado caia. As baterias vizinhas `../levantamento-na-conversa/` e
`../escolhas-na-conversa/` foram reapontadas aos portões novos no mesmo PR.
