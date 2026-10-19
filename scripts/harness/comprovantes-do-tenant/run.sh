#!/bin/bash
# HARNESS da migração que prende o bucket `comprovantes` ao tenant (20261019000002). NÃO TOCA
# PRODUÇÃO. Mesmo Postgres local de `../baixa-com-valor-diferente/run.sh`.
# Base: `../orcamentista/00_schema.sql` (papéis, auth.uid, users, get_auth_tenant_id) e
# `../atendimentos-ia-2b1/00_storage.sql` (storage reduzido, com as 3 políticas EXTRAÍDAS de
# produção), mais `00_foldername.sql`.
#
# O QUE ELE NÃO PROVA: o caminho do Storage API até o Postgres (o JWT virando `authenticated`
# com o `sub`); aqui o `sub` é posto à mão, como nos outros harnesses.
#
# Uso: run.sh <arquivo da migração>   — para medir o ANTES, passe um arquivo vazio.
S=$(cd "$(dirname "$0")" && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
$P -c 'drop database if exists harness_comprovantes' >/dev/null 2>&1; $P -c 'create database harness_comprovantes' >/dev/null
for f in $S/../orcamentista/00_schema.sql $S/../atendimentos-ia-2b1/00_storage.sql $S/00_foldername.sql; do
  $P -d harness_comprovantes -v ON_ERROR_STOP=1 -f $f >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; exit 2; }
done
$P -d harness_comprovantes -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU"; $P -d harness_comprovantes -v ON_ERROR_STOP=1 -f "$1" 2>&1 | grep ERROR | head -3; exit 2; }
SAIDA=$($P -d harness_comprovantes -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
