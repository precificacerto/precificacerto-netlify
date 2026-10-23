# Harness — as funções dos três níveis (migração `20261023000003`)

**NÃO TOCA PRODUÇÃO.** Roda num Postgres local descartável. Prova o que as sete funções da
`20261023000003_funcoes_dos_tres_niveis.sql` fazem, e prova que cada proteção declarada **fica
vermelha** quando é retirada — as 23 mutações abaixo.

## Como rodar

Subir o Postgres local (uma vez por container — é o mesmo dos outros harness desta pasta):

```bash
B=/usr/lib/postgresql/16/bin; D=/tmp/harness-pg; mkdir -p $D && chown postgres:postgres $D
su postgres -c "$B/initdb -D $D/data -U postgres --auth=trust -E UTF8 --locale=C.UTF-8"
su postgres -c "$B/pg_ctl -D $D/data -o '-p 54329 -k $D' -l $D/log.txt start"
```

`PGHOST` e `PGPORT` trocam o endereço (padrão: `/tmp/harness-pg`, `54329`).

Os casos:

```bash
bash scripts/harness/tres-niveis/run.sh          # a migração do repositório
bash scripts/harness/tres-niveis/run.sh <copia>  # uma cópia alterada
```

Saída: uma linha `ok:` ou `FALHOU:` por caso, e `47 de 47 casos ok`. Sai com 1 se faltar algum.
Um erro que não começa com `FALHOU` aparece como `ERRO NAO PREVISTO` e não conta como verde.

As mutações:

```bash
python3 scripts/harness/tres-niveis/mutacoes.py         # as 23
python3 scripts/harness/tres-niveis/mutacoes.py B9 V4   # só estas
```

Cada mutação estraga uma coisa numa **cópia** da migração (o arquivo do repositório nunca é
escrito, e o script confere isso no fim) e roda `run.sh` sobre ela. Saída: `VERMELHO` ou
`NAO DERRUBOU` por mutação; sai com 1 se alguma não derrubar. Conferido em 23/10/2026 que o
detector não é verde por construção: uma mutação que não muda nada sai `NAO DERRUBOU`.

## O que o `run.sh` faz

1. Cria o banco `harness_tres_niveis` e aplica, nesta ordem: `../base-de-conhecimento/00_base.sql`
   (os papéis `anon`, `authenticated` e `service_role`, e os DEFAULT PRIVILEGES do Supabase que
   dão tudo a anon e authenticated — sem eles o REVOKE passaria verde sem ter o que revogar),
   `20261022000003`, `20261022000004`, `20261023000001`, `01_pre.sql` e `20261023000002`.
2. Aplica **duas vezes** a migração dada e confere que a segunda deixou o schema idêntico.
3. Roda os 46 casos de `10_casos.sql` e o caso de concorrência de `20_concorrencia.sh`: 47.

## As 23 mutações — o que cada uma tem de derrubar

| # | mutação | derruba |
|---|---|---|
| V1 | sem o REVOKE de uma função | verificação (2): "aberta a PUBLIC/anon/authenticated" |
| V2 | sem SECURITY DEFINER | verificação (1): "sem SECURITY DEFINER ou sem search_path" |
| V3 | sem o search_path | verificação (1) |
| V4 | GRANT a PUBLIC com a checagem (2) cega | verificação (3): "EXECUTE herdável por PUBLIC" |
| B1 | a função 1 apaga a matéria-prima que não veio | "matéria-prima fora da lista NÃO é apagada" |
| B2 | a ordem não vem da posição | "ordem pela posição" e "reordenar" |
| B3 | matéria-prima nova sem as 6 categorias | "as 6 categorias com config NULL" |
| B4 | config substituído em vez de merge | "merge — ausente fica" |
| B5 | inteiro sem conferir a parte fracionária | "barra_mm 6000.5" aceito |
| B6 | chave fora do catálogo aceita | "chave fora do catálogo" e "FERRAGENS não tem campo" |
| B7 | a categoria não confere o tenant da matéria-prima | "matéria-prima de OUTRA empresa" aceita |
| B8 | só recusa principal > 1 | "ZERO principal" aceito |
| B9 | sem zerar os principais antes do upsert | caso 25b: violação do índice único `…_um_principal` |
| B10 | principal ausente vira false | "principal ausente mantém o de antes" |
| B11 | sem conferir o nicho do fornecedor | "fornecedor de OUTRO nicho" aceito |
| B12 | `onde_predomina` ausente vira lista vazia | "vazio e ausente são estados diferentes" |
| B13 | vidro sem conferir que a categoria é VIDRO | o caso esperava 22023 e vem 23503 da FK composta |
| B14 | `usa` ausente vira false | "usa NULL e false sobrevivem ao round-trip" |
| B15 | remover lê o antes depois do DELETE | "árvore inteira no antes" — sai vazia |
| B16 | remover não loga as categorias | "árvore inteira no antes" |
| B17 | a função de vidros não loga | "o log falhando desfaz a gravação" |
| B18 | sem conferir o super admin | "autor que não é super admin" aceito |
| B19 | sem o advisory lock na função 1 | concorrência: o antes da segunda gravação sai `[]` |

### Três que merecem a nota

- **B9 ficou VERDE na primeira rodada.** O caso 24 mandava o fornecedor que deixa de ser principal
  ANTES do novo, e por isso nunca passava pelo estado intermediário com dois principais. O caso
  25b (o novo principal primeiro na lista) é o que exercita o zeramento — e com ele a mutação fica
  vermelha. É a variante 2 de `teste-que-nao-exercita.md`: o caso escolhido não discriminava.
- **V4 só fica vermelha com a checagem (2) desligada.** Enquanto a (2) existir, a (3) nunca dispara
  sozinha: `has_function_privilege` já enxerga o EXECUTE herdado de PUBLIC. A (3) é segunda linha.
- **B13 é segurada também pelo schema.** Sem a checagem da função, a FK composta da `20261023000002`
  ainda recusa — com 23503 e sem a mensagem nomeada. O caso fica vermelho pelo código do erro.

## O que este harness NÃO alcança

- **A versão.** Roda PostgreSQL 16.15; produção é 17.x. As funções não usam nada específico de
  versão, mas isso é raciocínio, não medição — a mesma pendência de `../baixa-com-valor-diferente/`.
- **O schema real.** `01_pre.sql` é RECONSTRUÍDO (só as colunas que as funções leem de
  `orcamentista_fornecedor` e `orcamentista_config`), e `00_base.sql` é o mínimo do harness da
  base de conhecimento. As migrações dos três níveis, essas sim, são as do repositório.
- **O PostgREST e as rotas.** O harness chama as funções direto, como o `service_role` faria. Não
  há rota que chame estas funções ainda.
- **A concorrência das funções de lista.** Só a função 1 tem caso de concorrência (é a única em
  que, na primeira gravação, não existe linha para o `FOR UPDATE` travar). Nas outras, a linha da
  categoria é travada com `FOR UPDATE` antes de tudo; o advisory lock é redundância não medida.
