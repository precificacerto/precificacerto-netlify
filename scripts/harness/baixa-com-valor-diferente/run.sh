#!/bin/bash
# HARNESS LOCAL da RPC `dar_baixa_com_valor_diferente` (migração 20261016000001).
#
# NÃO TOCA PRODUÇÃO. O schema mínimo (00_schema.sql) foi EXTRAÍDO do catálogo vivo de
# produção em 16/10/2026 — não do histórico de migrações, que não reproduz o schema real
# (ver `migration-delivery.md`). Cada bloco do schema diz se é EXTRAÍDO ou RECONSTRUÍDO.
#
# Subir o Postgres local (uma vez por container):
#   B=/usr/lib/postgresql/16/bin; D=/tmp/harness-pg; mkdir -p $D && chown postgres:postgres $D
#   su postgres -c "$B/initdb -D $D/data -U postgres --auth=trust -E UTF8 --locale=C.UTF-8"
#   su postgres -c "$B/pg_ctl -D $D/data -o '-p 54329 -k $D' -l $D/log.txt start"
#
# Uso:   run.sh <arquivo da migração>
# Saída: uma linha `ok:` ou `FALHOU:` por caso. Para mutar, passe uma cópia alterada.
S=$(cd "$(dirname "$0")" && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q"
$P -c 'drop database if exists harness_run' >/dev/null 2>&1; $P -c 'create database harness_run' >/dev/null
$P -d harness_run -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "SCHEMA FALHOU"; exit 2; }
$P -d harness_run -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU"; exit 2; }
$P -d harness_run -f $S/10_casos.sql 2>&1 | grep -oE '(ok|FALHOU)[^"]*' | sed -E 's/ *$//'
