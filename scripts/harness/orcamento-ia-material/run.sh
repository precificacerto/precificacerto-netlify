#!/bin/bash
# HARNESS da migração 20261109000003 (o material consumido no item do orçamento I.A.). NÃO TOCA PRODUÇÃO.
#   D  = a base da 20261109000001 (../orcamento-ia/00_base.sql) + a 20261109000001 + a 20261109000002 + esta migração DUAS vezes -> 10_casos.sql;
#   contraste 1: sem a 20261109000002 -> a guarda aborta com a frase, e nada fica;
#   contraste 2: sem a 20261109000001 -> a guarda aborta com a frase;
#   contraste 3: uma orcamentista_orcamento_item_material que já existe com outra forma -> a migração aborta (no índice), e a chave nova do item não fica;
#   contraste 4: uma chave a mais no item -> a verificação 3 aborta (a contagem), e nada fica;
#   contraste 5: a mesma contagem com uma chave trocada -> a verificação 4 aborta, e nada fica.
#   O caso 3a (o material da empresa A no item da B) é o que a FK de coluna única deixaria passar: a mutação M1 o prova.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261109000003_orcamento_ia_material.sql}
BASE=$S/../orcamento-ia/00_base.sql; M1=$M/20261109000001_orcamento_ia.sql; M2=$M/20261109000002_orcamento_ia_precificacao.sql
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_orcamento_material}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3; C4=${D}_c4; C5=${D}_c5
for x in $D $C1 $C2 $C3 $C4 $C5; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $BASE 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  [ $x = $C2 ] && continue
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $M1 2>&1) || { echo "BASE FALHOU: a 20261109000001 em $x"; exit 2; }
  [ $x = $C1 ] && continue
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $M2 2>&1) || { echo "BASE FALHOU: a 20261109000002 em $x"; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1)
resto() { $P -d $1 -At -c "select (select count(*) from pg_class where relname = 'orcamentista_orcamento_item_material' and relkind = 'r' and to_regclass('public.orcamentista_orcamento_item_material') is not null and not exists (select 1 from information_schema.columns where table_name = 'orcamentista_orcamento_item_material' and column_name = 'nome_antigo')) + (select count(*) from pg_constraint where conname = 'orcamentista_orcamento_item_id_tenant_key') + (select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento_item' and column_name = 'calculo_id')"; }
contraste() { # nome, banco, frase do erro, o que pode ficar
  local SAI; SAI=$($P -d $2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1); local RESTO; RESTO=$(resto $2)
  if echo "$SAI" | grep -qF "ERROR:  $3" && [ "$RESTO" = "$4" ]; then SAIDA="$SAIDA"$'\n'"NOTICE:  ok: $1"
  else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: $1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
contraste "contraste 1 — sem a 20261109000002 a guarda aborta, e nada fica" $C1 "dependencia ausente: orcamentista_orcamento_item.custo_liquido_total (a migracao 20261109000002). Nada foi alterado." 0
contraste "contraste 2 — sem a 20261109000001 a guarda aborta" $C2 "dependencia ausente: public.orcamentista_orcamento_item ou public.tenants (a migracao 20261109000001). Nada foi alterado." 0
$P -d $C3 -c "create table public.orcamentista_orcamento_item_material (id uuid primary key, nome_antigo text)" >/dev/null
contraste "contraste 3 — a tabela de outra forma faz a migracao abortar (no indice, antes da verificacao), e a chave nova do item nao fica" $C3 'column "orcamento_item_id" does not exist' 0
$P -d $C4 -c "alter table public.orcamentista_orcamento_item add constraint orcamentista_orcamento_item_extra_key unique (orcamento_id, id)" >/dev/null
contraste "contraste 4 — uma chave a mais no item aborta na verificacao 3 (45 constraints), e nada fica" $C4 "verificacao 3: orcamentista_orcamento e orcamentista_orcamento_item tem 45 constraint(s), e deviam ter 44." 0
$P -d $C5 -c "alter table public.orcamentista_orcamento_item drop constraint orcamentista_orcamento_item_ordem_key, add constraint orcamentista_orcamento_item_ordem_key unique (orcamento_id, ordem, quantidade)" >/dev/null
contraste "contraste 5 — a mesma contagem com uma chave trocada aborta na verificacao 4, e nada fica" $C5 "verificacao 4: as chaves de orcamentista_orcamento_item sao" 0
for x in $D $C1 $C2 $C3 $C4 $C5; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
echo "$SAIDA" | grep -oE "(ok|FALHOU): .*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHOU=$(echo "$SAIDA" | grep -c "FALHOU: ")
echo "$OK ok, $FALHOU falhou"
[ "$FALHOU" = "0" ] && [ "$OK" = "${ESPERADOS:-37}" ] || exit 1
