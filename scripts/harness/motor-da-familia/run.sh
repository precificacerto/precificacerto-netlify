#!/bin/bash
# HARNESS do motor da família (20261027000006). NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local dos outros harness desta pasta (ver o README de `../tres-niveis/`).
# Monta a réplica do que a migração toca (`05_estado_de_producao.sql`), aplica a migração DUAS VEZES e roda os casos.
# Uso:   run.sh [arquivo da migração]   (o argumento é como as mutações trocam por uma cópia estragada)
# Sai com 1 se faltar ok; com 2 se a base/migração abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261027000006_motor_da_familia.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=harness_motor_da_familia
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $S/05_estado_de_producao.sql "$MIG" "$MIG"; do
  $P -d $D -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep ERROR | head -3; exit 2; }
done
# O FILTRO LÊ A LINHA INTEIRA: um erro que não começa com FALHOU aparece como ERRO NAO PREVISTO e não conta como caso verde.
SAIDA=$(cd $S && $P -d $D -f 10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
