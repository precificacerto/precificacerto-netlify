#!/bin/bash
# HARNESS da migração 20261111000001 (o índice dos desenhos das tipologias). NÃO TOCA PRODUÇÃO.
# Base: 00_base.sql (os papéis, o privilégio padrão de produção, is_super_admin e o log com as colunas de produção). Depois: D = base + a
# migração DUAS vezes -> os casos (10_casos.sql), a corrida (duas importações ao mesmo tempo se enfileiram) e as guardas.
# Uso: run.sh [arquivo da migração]. VEZES=1 aplica uma vez (as mutações). Sai 1 se faltar ok; 2 se a base ou a migração abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261111000001_desenhos_das_tipologias.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_desenhos}; BASE=${D}_base; GC=${D}_guarda

$P -c "drop database if exists $BASE" >/dev/null 2>&1; $P -c "create database $BASE" >/dev/null || { echo "BASE FALHOU: create"; exit 2; }
OUT=$($P -d $BASE -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU"; echo "$OUT" | grep ERROR | head -3; exit 2; }
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D template $BASE" >/dev/null || exit 2
for i in $(seq 1 ${VEZES:-2}); do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "A MIGRACAO ABORTOU (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done

corrida() {
# CORRIDA 1: duas importações ao mesmo tempo se ENFILEIRAM na trava: a segunda espera a primeira terminar e o estado final é o dela, inteiro
  $P -d $D -c "select superadmin_importar_desenhos(null, repeat('d', 64), '[{\"fonte\":\"principal\",\"codigo\":\"X1\"},{\"fonte\":\"principal\",\"codigo\":\"X2\"}]'::jsonb, true)" >/dev/null
  ( $P -d $D -c "begin; select superadmin_importar_desenhos(null, repeat('e', 64), '[{\"fonte\":\"principal\",\"codigo\":\"A1\"}]'::jsonb, true); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
  sleep 0.5
  local T0=$(date +%s%N)
  $P -d $D -c "select superadmin_importar_desenhos(null, repeat('f', 64), '[{\"fonte\":\"principal\",\"codigo\":\"B1\"},{\"fonte\":\"principal\",\"codigo\":\"B2\"},{\"fonte\":\"principal\",\"codigo\":\"B3\"}]'::jsonb, false)" >/dev/null 2>&1
  local MS=$(( ($(date +%s%N) - T0) / 1000000 )); wait
  local FINAL=$($P -d $D -At -c "select string_agg(codigo, ',' order by codigo) from orcamentista_tipologia_desenho")
  local LOG=$($P -d $D -At -c "select (antes->>'linhas') || '>' || (depois->>'linhas') from superadmin_alteracao_log where chave = repeat('f', 64)")
  if [ "$MS" -ge 1000 ] && [ "$FINAL" = "B1,B2,B3" ] && [ "$LOG" = "1>3" ]; then
    echo "NOTICE:  ok: corrida 1 — a segunda importacao esperou a trava (${MS} ms), viu as linhas da primeira (antes 1) e deixou as suas, inteiras"
  else echo "ERROR:  FALHOU corrida 1: esperou ${MS} ms, final=$FINAL, log=$LOG"; fi
}

guardas() {
  # GUARDA 1: um banco sem is_super_admin nem o log (o projeto errado): aborta nomeando o banco, e nada é criado
  local V=${D}_vazio
  $P -c "drop database if exists $V" >/dev/null 2>&1; $P -c "create database $V" >/dev/null
  local SAI; SAI=$($P -d $V -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q "dependencia ausente: is_super_admin() ou superadmin_alteracao_log. Banco: $V" \
     && [ "$($P -d $V -At -c "select count(*) from pg_class where relname = 'orcamentista_tipologia_desenho'")" = "0" ]; then
    echo "NOTICE:  ok: guarda 1 — banco sem as dependencias: aborta nomeando o banco, nada criado"
  else echo "ERROR:  FALHOU guarda 1: $(echo "$SAI" | grep ERROR | head -1)"; fi
  $P -c "drop database if exists $V" >/dev/null 2>&1
  # GUARDA 2: a tabela já existe com outra forma: aborta, e a tabela de antes fica como estava
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $BASE" >/dev/null
  $P -d $GC -c "create table public.orcamentista_tipologia_desenho (id uuid primary key, codigo text)" >/dev/null
  SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q "orcamentista_tipologia_desenho ja existe com 2 colunas (esta migracao cria 9)" \
     && [ "$($P -d $GC -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_tipologia_desenho'")" = "2" ] \
     && [ "$($P -d $GC -At -c "select count(*) from pg_proc where proname = 'superadmin_importar_desenhos'")" = "0" ]; then
    echo "NOTICE:  ok: guarda 2 — a tabela com outra forma: aborta, a de antes fica, a funcao nao e criada"
  else echo "ERROR:  FALHOU guarda 2: $(echo "$SAI" | grep ERROR | head -1)"; fi
  $P -c "drop database if exists $GC" >/dev/null 2>&1
  # GUARDA 3: REAPLICADA DEPOIS DE UMA IMPORTAÇÃO: não aborta, e as linhas importadas ficam como estavam (a idempotência do cabeçalho)
  local ANTES; ANTES=$($P -d $D -At -c "select count(*) || ':' || md5(string_agg(id::text || coalesce(codigo, ''), ',' order by id)) from orcamentista_tipologia_desenho")
  SAI=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1); local C=$?
  local DEPOIS; DEPOIS=$($P -d $D -At -c "select count(*) || ':' || md5(string_agg(id::text || coalesce(codigo, ''), ',' order by id)) from orcamentista_tipologia_desenho")
  if [ "$C" = "0" ] && [ "$ANTES" = "$DEPOIS" ] && [ "${ANTES%%:*}" != "0" ]; then
    echo "NOTICE:  ok: guarda 3 — reaplicada com ${ANTES%%:*} linhas importadas: nao aborta, as linhas ficam"
  else echo "ERROR:  FALHOU guarda 3: codigo $C, antes $ANTES, depois $DEPOIS: $(echo "$SAI" | grep ERROR | head -1)"; fi
}

SAIDA=$( ($P -d $D -f $S/10_casos.sql 2>&1; corrida 2>&1; guardas 2>&1) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CORRIDA " $S/run.sh) + $(grep -c "# GUARDA [0-9]" $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
