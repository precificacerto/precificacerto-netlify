#!/bin/bash
# HARNESS das FUNÇÕES da base de conhecimento. NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local de `../baixa-com-valor-diferente/run.sh` (ver o cabeçalho de lá para subir);
# PGHOST e PGPORT trocam o endereço.
#
# Monta o banco mínimo (`00_base.sql`), aplica as migrações das tabelas (20261022000003 e
# 20261022000004), aplica DUAS VEZES a migração de funções dada, confere que a segunda aplicação
# deixou o schema idêntico, roda os casos (`10_casos.sql`) e o de concorrência, com duas sessões
# (`20_concorrencia.sh`).
#
# Uso: run.sh <arquivo da migração de funções>   Saída: `ok:` / `FALHOU:` por caso, e a contagem.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
DUMP="pg_dump -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -s harness_base_de_conhecimento"
M3=$R/supabase/migrations/20261022000003_employees_unique_id_tenant.sql
M4=$R/supabase/migrations/20261022000004_atendimentos_ia_base_de_conhecimento.sql
$P -c 'drop database if exists harness_base_de_conhecimento' >/dev/null 2>&1; $P -c 'create database harness_base_de_conhecimento' >/dev/null
for f in $S/00_base.sql $M3 $M4; do
  $P -d harness_base_de_conhecimento -v ON_ERROR_STOP=1 -f $f >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; exit 2; }
done
for vez in 1 2; do
  $P -d harness_base_de_conhecimento -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU na aplicação $vez"; $P -d harness_base_de_conhecimento -v ON_ERROR_STOP=1 -f "$1" 2>&1 | grep ERROR | head -3; exit 2; }
  $DUMP | grep -vE '^\\(un)?restrict ' > /tmp/harness-base-de-conhecimento-$vez.sql
done
if diff -q /tmp/harness-base-de-conhecimento-1.sql /tmp/harness-base-de-conhecimento-2.sql >/dev/null; then
  echo "ok: a migração de funções aplicada duas vezes deixa o schema IDÊNTICO"
else
  echo "FALHOU: a segunda aplicação mudou o schema"; exit 1
fi
SAIDA=$($P -d harness_base_de_conhecimento -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
SAIDA="$SAIDA
$(bash $S/20_concorrencia.sh "$P")"
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + 1 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
