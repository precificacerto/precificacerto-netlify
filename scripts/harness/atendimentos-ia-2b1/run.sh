#!/bin/bash
# HARNESS da migração do Atendimentos I.A., bloco 2B.1. NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local de `../baixa-com-valor-diferente/run.sh` (ver o cabeçalho de lá para subir).
# Monta o banco do bloco 1 (`../orcamentista/00_schema.sql` + a migração 20261018000001), o
# Storage reduzido (`00_storage.sql`), e aplica a migração dada por cima.
#
# Uso: run.sh <arquivo da migração>   Saída: `ok:` / `FALHOU:` por caso, e a contagem.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
B1=$R/supabase/migrations/20261018000001_orcamentista_bloco_1.sql
$P -c 'drop database if exists harness_atendimentos_ia' >/dev/null 2>&1; $P -c 'create database harness_atendimentos_ia' >/dev/null
for f in $S/../orcamentista/00_schema.sql $B1 $S/00_storage.sql; do
  $P -d harness_atendimentos_ia -v ON_ERROR_STOP=1 -f $f >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; exit 2; }
done
$P -d harness_atendimentos_ia -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU"; $P -d harness_atendimentos_ia -v ON_ERROR_STOP=1 -f "$1" 2>&1 | grep ERROR | head -3; exit 2; }
SAIDA=$($P -d harness_atendimentos_ia -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
