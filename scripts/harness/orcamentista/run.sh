#!/bin/bash
# HARNESS da migração do Orçamentista (bloco 1). NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local de `../baixa-com-valor-diferente/run.sh` (ver o cabeçalho de lá para subir).
#
# O QUE ELE NÃO PROVA: que o PostgREST faz o upsert exatamente como o `pela_rota` dos casos — o
# `INSERT ... ON CONFLICT DO UPDATE SET <colunas do payload>` é reconstruído. `service_role` aqui
# é BYPASSRLS, como em produção. QUEM a rota deixa passar é do portão do jest; aqui é o BANCO.
#
# Uso: run.sh <arquivo da migração>   Saída: `ok:` / `FALHOU:` por caso, e a contagem.
S=$(cd "$(dirname "$0")" && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
$P -c 'drop database if exists harness_orcamentista' >/dev/null 2>&1; $P -c 'create database harness_orcamentista' >/dev/null
$P -d harness_orcamentista -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "SCHEMA FALHOU"; exit 2; }
$P -d harness_orcamentista -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU"; $P -d harness_orcamentista -v ON_ERROR_STOP=1 -f "$1" 2>&1 | grep ERROR | head -3; exit 2; }
SAIDA=$($P -d harness_orcamentista -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
