# Harness — a árvore numa transação (migração `20261023000004`)

**NÃO TOCA PRODUÇÃO.** Roda num Postgres local descartável. Prova o que
`superadmin_gravar_arvore` faz, e que cada proteção declarada **fica vermelha** quando é
retirada: as 24 mutações abaixo.

## Como rodar

O Postgres local é o mesmo de `../tres-niveis/` (subir uma vez por container: ver o README de lá).
`PGHOST` e `PGPORT` trocam o endereço (padrão: `/tmp/harness-pg`, `54329`).

```bash
bash scripts/harness/arvore/run.sh                 # a migração do repositório
bash scripts/harness/arvore/run.sh <copia>         # uma cópia alterada
SEM_AS_SETE=1 bash scripts/harness/arvore/run.sh   # sem a 20261023000003: tem de abortar NA GUARDA
python3 -B scripts/harness/arvore/mutacoes.py      # as 24
python3 -B scripts/harness/arvore/mutacoes.py A1   # só esta
```

Saída: uma linha `ok:` ou `FALHOU:` por caso, e `24 de 24 casos ok`. Sai com 1 se faltar algum.
Um erro que não começa com `FALHOU` aparece como `ERRO NAO PREVISTO` e não conta como verde.

## O que o `run.sh` faz

1. Cria o banco `harness_arvore` e aplica `../base-de-conhecimento/00_base.sql`,
   `20261022000003`, `20261022000004`, `20261023000001`, `../tres-niveis/01_pre.sql`,
   `20261023000002` e `20261023000003` — as sete funções, do repositório.
2. Aplica **duas vezes** a migração dada e confere que a segunda deixou o schema idêntico.
3. Roda os 21 blocos de `10_casos.sql` (o 17 é o preparo do 18), os dois casos de
   `20_concorrencia.sh` e o de `30_atomicidade.sh`: 24.

Os casos de recusa conferem o código, a mensagem (um trecho, ou ela EXATA nos casos 1 e 2) e a
**foto** do banco — as seis tabelas linha a linha e a contagem do log —, que tem de sair intacta.

## Os casos que pedem nota

- **Atomicidade (`30_atomicidade.sh`).** Uma chamada em autocommit, como o rpc do PostgREST faz,
  que falha na TERCEIRA chamada interna. A mensagem `23503: materia-prima Ferro, categoria PERFIL,
  fornecedores: …` prova que a primeira e a segunda rodaram — sem a função 1 a categoria do Ferro
  não existiria e o erro seria outro. Depois: nem o Ferro, nem uma linha de log das internas.
  **O que o caso prova é que a função não engole o erro** (mutação A5). Desfazer tudo quando o
  erro sobe é do Postgres.
- **Concorrência C1.** A grava e segura a transação; B grava logo depois. Com o lock do tenant, o
  ANTES do resumo de B tem o que A gravou. Sem o lock (A1) ou com o lock depois da leitura (A2), o
  antes de B sai **vazio**: medido.
- **Concorrência C2 — o deadlock.** A remove `[PVC, Alumínio]`, B remove `[Alumínio, PVC]`. Um
  gatilho **só do harness**, criado e apagado pelo script, dorme 1,5 s em cada DELETE de
  matéria-prima para que as duas fiquem no meio ao mesmo tempo. Com o lock, B espera A e sai com
  P0002. **Sem o lock (A1): `ERROR: 40P01: remover …: deadlock detected`** — medido em 23/10/2026.

## As 24 mutações — o que cada uma tem de derrubar

| # | mutação | derruba |
|---|---|---|
| V1 | sem o REVOKE da oitava | verificação: "aberta a PUBLIC/anon/authenticated" |
| V2 | sem SECURITY DEFINER | verificação: "sem SECURITY DEFINER ou sem search_path" |
| V3 | sem o search_path | idem |
| V4 | GRANT a PUBLIC, com a checagem (2) cega | verificação (3): "EXECUTE herdavel por PUBLIC" |
| D1 | sem a guarda das dependências, num banco sem as sete | "sem as sete, a migração abortou FORA da guarda" |
| A1 | sem o lock do tenant | concorrência C1 (antes vazio) **e** C2 (40P01) |
| A2 | o lock depois de ler o antes | concorrência C1 |
| A3 | relança sem o ERRCODE | caso 14: "recusado com P0001 e nao 23503" |
| A4 | relança sem o caminho | caso 14: a mensagem não traz o caminho |
| A5 | engole o erro (avisa e segue) | atomicidade |
| A6 | sem a linha de resumo | caso 11 |
| A7 | o antes do resumo lido depois das chamadas | caso 11: "o antes do resumo nao e a arvore de ANTES" |
| A8 | o resumo sem a tabela de vidros | caso 11: "o resumo nao tem as seis tabelas" |
| A9 | `fornecedores` ausente no PERFIL vira lista vazia | caso 12: "uma lista AUSENTE foi tocada" |
| A10 | lista vazia de vidros não chama a função | caso 13: "sobraram vidros" |
| A11 | sem recusar remover e gravar a mesma | caso 19: ACEITO |
| A12 | remover por DELETE direto, sem a função 7 | casos 18 e 20 |
| A13 | campo desconhecido no topo aceito | caso 4 (cai em "nada a gravar", outra mensagem) |
| A14 | campo desconhecido na categoria aceito | caso 6: ACEITO |
| A15 | categoria fora do catálogo não recusada na frente | caso 8: P0002 em vez de 22023 |
| A16 | sem conferir o super admin na oitava | caso 1: a mensagem chega com caminho (a da função 1) |
| A17 | sem conferir a empresa na oitava | caso 2: idem |
| A18 | categoria repetida aceita | caso 7: ACEITO |
| A19 | id repetido em remover aceito | caso 10: P0002 em vez de 22023 |

### Duas que merecem a nota

- **D1 ficou VERDE na primeira rodada.** Sem a guarda do começo, a migração **aborta assim
  mesmo** — pelo bloco de verificação do fim, que confere as oito. A proteção existe em dobro; o
  que a guarda acrescenta é abortar ANTES de criar, com a mensagem que diz o que falta. O caso
  passou a afirmar a mensagem, que é a única coisa que distingue as duas.
- **A16 e A17 só ficam vermelhas pela mensagem EXATA.** Sem a checagem da oitava, a função 1
  recusa o autor (42501) e a empresa (P0002) do mesmo jeito — só que com o caminho na frente. A
  checagem da oitava é segunda linha.

## O que este harness NÃO alcança

- **A versão.** Roda PostgreSQL 16; produção é 17.x — a mesma pendência de `../tres-niveis/`.
- **O schema real.** `01_pre.sql` é RECONSTRUÍDO; as migrações dos três níveis e as sete funções
  são as do repositório.
- **Árvore × chamada avulsa.** O lock do tenant serializa DUAS ÁRVORES. Uma árvore e uma rota
  avulsa do #133 (que chama uma das sete direto) não passam por ele: ficam com os locks de cada
  função, como antes. Não medido.
- **A rota.** O harness chama a função como o `service_role` faria.
