#!/bin/bash
# HARNESS da migração 20261101000002 ("Subido em" = arquivo_em). NÃO TOCA PRODUÇÃO.
# Base: a da tabela-soberana (as migrações REAIS até a 20261101000001, com o estado medido em produção), construída por ela com BASE_SO=1.
# Depois, duas cópias:
#   D  = base + o estado de produção de 01/11/2026 depois das 21:08 (09_estado.sql) + esta migração DUAS vezes -> os casos desta (10_casos.sql);
#   RG = base + esta migração DUAS vezes -> os casos da tabela-soberana e da catalogo-soberano (regressão: o arrasto não muda com a coluna e o gatilho).
# E o contraste da reaplicação: uma tabela criada DEPOIS da primeira aplicação não é semeada nem logada, e a verificação não aborta.
# Uso: run.sh [arquivo da migração]. REUSA_BASE=1 não reconstrói a base (as mutações). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261101000002_arquivo_em_da_tabela.sql}; TS=$H/tabela-soberana; CS=$H/catalogo-soberano
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_arquivo_em}; BASE=${D}_base; RG=${D}_regressao; GC=${D}_contraste
if [ -z "$REUSA_BASE" ] || ! $P -At -c "select 1 from pg_database where datname = '$BASE'" | grep -q 1; then
  HARNESS_DB=$BASE BASE_SO=1 bash $TS/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: a base da tabela-soberana"; exit 2; }
fi
for x in $D $RG $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }; done
OUT=$($P -d $D -v ON_ERROR_STOP=1 -f $S/09_estado.sql 2>&1) || { echo "BASE FALHOU: o estado"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
for db in $D $RG; do for i in 1 2; do
  OUT=$($P -d $db -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao em $db (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done; done

contrastes() {
# CONTRASTE 1: aplicada uma vez, uma tabela nova nasce (com arquivo_em pelo gatilho), e a reaplicação nem a semeia nem a loga, nem aborta
$P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "ERROR:  FALHOU contraste 1: a primeira aplicacao"; return; }
$P -d $GC -v ON_ERROR_STOP=1 -c "insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x/arquivo/nova.xlsx', 'nova.xlsx', 'PVC', 'REFORCO')" >/dev/null 2>&1 \
  || { echo "ERROR:  FALHOU contraste 1: a tabela nova nao entrou"; return; }
local L1; L1=$($P -d $GC -At -c "select count(*) from public.superadmin_alteracao_log where antes ->> 'migracao' = '20261101000002_arquivo_em_da_tabela'")
local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "ERROR:  FALHOU contraste 1: a reaplicacao abortou: $(echo "$SAI" | grep ERROR | head -1)"; return; }
local L2; L2=$($P -d $GC -At -c "select count(*) from public.superadmin_alteracao_log where antes ->> 'migracao' = '20261101000002_arquivo_em_da_tabela'")
local T; T=$($P -d $GC -At -c "select count(*) from public.orcamentista_tabela")
if [ "$L1" = "$T" ] || [ "$L1" != "$L2" ] || [ "$(( T - 1 ))" != "$L1" ]; then echo "ERROR:  FALHOU contraste 1: log $L1 -> $L2, tabelas $T"; return; fi
echo "NOTICE:  ok: contraste 1 — a tabela criada entre as aplicacoes nao e semeada nem logada, e a reaplicacao nao aborta ($L1 logs, $T tabelas)"
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; cd $TS && $P -d $RG -f 10_casos.sql 2>&1; cd $CS && $P -d $RG -f 10_casos.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^-- CASO " $TS/10_casos.sql) + $(grep -c "^-- CASO " $CS/10_casos.sql) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $RG $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
