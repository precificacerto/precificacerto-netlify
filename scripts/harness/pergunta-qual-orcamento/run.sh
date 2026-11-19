#!/bin/bash
# HARNESS da migracao 20261118000002 (a pergunta QUAL_ORCAMENTO). NAO TOCA PRODUCAO.
# Base: a tabela da pergunta em aberto como em producao em 18/11/2026 (00_base.sql), uma linha de cada codigo de antes.
#   D  = base + esta migracao DUAS vezes -> os casos (10_casos.sql);
#   contraste 1: a CHECK de pergunta com OUTRA lista (alguem mudou por outro caminho) -> a guarda aborta nomeando-a, e a CHECK fica;
#   contraste 2: sem a tabela -> a guarda aborta com a frase da dependencia;
#   contraste 3: a CHECK de itens com outra definicao -> a verificacao 1 aborta, e a CHECK de pergunta volta a de antes (rollback).
# Uso: run.sh [arquivo da migracao]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261118000002_pergunta_qual_orcamento.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_qual_orcamento}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3
for x in $D $C1 $C2 $C3; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
DEF="select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_pergunta_em_aberto_pergunta_valida'"
contrastes() {
# CONTRASTE 1: a CHECK de pergunta com outra lista -> a guarda aborta nomeando-a; a CHECK fica como estava
$P -d $C1 -c "alter table public.orcamentista_pergunta_em_aberto drop constraint orcamentista_pergunta_em_aberto_pergunta_valida; alter table public.orcamentista_pergunta_em_aberto add constraint orcamentista_pergunta_em_aberto_pergunta_valida check (pergunta in ('NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO', 'CONFIRMAR_APANHADO', 'OUTRA'))" >/dev/null 2>&1
local SAI; SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
local RESTO; RESTO=$($P -d $C1 -At -c "$DEF")
if echo "$SAI" | grep -q "ERROR:  a CHECK de pergunta nao e a da 20261026000003 nem a desta: CHECK" && echo "$RESTO" | grep -q "OUTRA"; then
  echo "NOTICE:  ok: contraste 1 — a CHECK com outra lista aborta na guarda, nomeada, e fica como estava"
else echo "ERROR:  FALHOU contraste 1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
# CONTRASTE 2: sem a tabela -> a frase da dependencia
$P -d $C2 -c "drop table public.orcamentista_pergunta_em_aberto" >/dev/null 2>&1
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: public.orcamentista_pergunta_em_aberto (20261026000002) no banco"; then echo "NOTICE:  ok: contraste 2 — sem a tabela, a guarda aborta com a frase da dependencia"
else echo "ERROR:  FALHOU contraste 2: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 3: a CHECK de itens com outra definicao -> a verificacao 1 aborta, e a transacao volta: a CHECK de pergunta continua a de antes
$P -d $C3 -c "alter table public.orcamentista_pergunta_em_aberto drop constraint orcamentista_pergunta_em_aberto_itens_array; alter table public.orcamentista_pergunta_em_aberto add constraint orcamentista_pergunta_em_aberto_itens_array check (jsonb_typeof(itens) in ('array', 'object'))" >/dev/null 2>&1
SAI=$($P -d $C3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
RESTO=$($P -d $C3 -At -c "$DEF")
if echo "$SAI" | grep -q "ERROR:  verificacao 1: constraint ausente ou com outra definicao: orcamentista_pergunta_em_aberto_itens_array" && ! echo "$RESTO" | grep -q "QUAL_ORCAMENTO"; then
  echo "NOTICE:  ok: contraste 3 — a verificacao 1 aborta, e a CHECK de pergunta volta a de antes"
else echo "ERROR:  FALHOU contraste 3: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $C1 $C2 $C3; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
