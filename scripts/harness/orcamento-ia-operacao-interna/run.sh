#!/bin/bash
# HARNESS da migração 20261110000001 (a operação interna do orçamento I.A.). NÃO TOCA PRODUÇÃO.
#   D  = a base de ../orcamento-ia-arquivo (00_base, 01_producao, a função dos ambientes) + 0001..0005 + esta DUAS vezes -> 10_casos.sql;
#   contraste 1: sem a 20261109000005 -> a guarda aborta, e nada fica;
#   contraste 2: um orçamento que já tem valor de venda -> a guarda aborta (não se recalcula para trás), e nada fica;
#   contraste 3: uma constraint a mais no item -> a guarda aborta (50), e nada fica;
#   contraste 4: uma coluna a mais no orçamento -> a guarda aborta (29), e nada fica;
#   contraste 5: valor_operacao_interna que já existe como text -> a migração aborta (a CHECK não se aplica a text), e nada fica;
#   contraste 6: uma com_a_venda de mesmo nome e outra definição -> a verificação 2 aborta;
#   contraste 7: um grant a authenticated no orçamento -> a verificação 5 aborta, e nada fica;
#   contraste 8: o service_role sem UPDATE no orçamento -> a verificação 6 aborta, e nada fica.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261110000001_orcamento_ia_operacao_interna.sql}
A=$S/../orcamento-ia-arquivo; BASE=$S/../orcamento-ia/00_base.sql; PROD=$S/../orcamento-ia-fiscal/01_producao.sql; FN=$A/02_funcao_dos_ambientes.sql
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_orcamento_interna}; TODOS="$D ${D}_c1 ${D}_c2 ${D}_c3 ${D}_c4 ${D}_c5 ${D}_c6 ${D}_c7 ${D}_c8"
for x in $TODOS; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  $P -d $x -c "do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$; do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$; do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;" >/dev/null 2>&1
  $P -c "alter role service_role bypassrls" >/dev/null 2>&1  # como em producao: o service_role ignora a RLS
  $P -d $x -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role" >/dev/null
  for f in $BASE $PROD $FN $M/20261109000001_orcamento_ia.sql $M/20261109000002_orcamento_ia_precificacao.sql $M/20261109000003_orcamento_ia_material.sql $M/20261109000004_orcamento_ia_fiscal.sql $M/20261109000005_orcamento_ia_arquivo.sql; do
    [ $x = ${D}_c1 ] && [ $f = $M/20261109000005_orcamento_ia_arquivo.sql ] && continue
    OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $f 2>&1) || { echo "BASE FALHOU em $x: $f"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  done
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1)
resto() { $P -d $1 -At -c "select (select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento' and column_name = 'valor_operacao_interna' and data_type = 'numeric') + (select count(*) from pg_constraint where conname like 'orcamentista_orcamento_operacao_interna_%' and conname <> 'orcamentista_orcamento_operacao_interna_com_a_venda')"; }
contraste() { # nome, banco, frase do erro, o que pode ficar
  local SAI; SAI=$($P -d $2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1); local RESTO; RESTO=$(resto $2)
  if echo "$SAI" | grep -qF "ERROR:  $3" && [ "$RESTO" = "$4" ]; then SAIDA="$SAIDA"$'\n'"NOTICE:  ok: $1"
  else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: $1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
contraste "contraste 1 - sem a 20261109000005 a guarda aborta, e nada fica" ${D}_c1 "dependencia ausente: orcamentista_orcamento_arquivo (a migracao 20261109000005). Nada foi alterado." 0
$P -d ${D}_c2 -c "insert into public.tenants (id) values ('00000000-0000-0000-0000-0000000000a1'); insert into public.orcamentista_orcamento (id, tenant_id, nome, numero, origem, criado_por, valor_total_bruto, valor_total_liquido, valor_venda) values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', 'X', 1, 'manual', gen_random_uuid(), 80, 70, 120)" >/dev/null
contraste "contraste 2 - um orcamento com valor de venda: a guarda aborta, e nada fica" ${D}_c2 "guarda: 1 orcamento(s) ja tem valor_venda; a interna deles nao e recalculada para tras. Nada foi alterado." 0
$P -d ${D}_c3 -c "alter table public.orcamentista_orcamento_item add constraint orcamentista_orcamento_item_extra_check check (true)" >/dev/null
contraste "contraste 3 - uma constraint a mais: a guarda aborta (50), e nada fica" ${D}_c3 "guarda: orcamentista_orcamento e orcamentista_orcamento_item tem 50 constraint(s) alem das novas, e deviam ter 49." 0
$P -d ${D}_c4 -c "alter table public.orcamentista_orcamento add column extra text" >/dev/null
contraste "contraste 4 - uma coluna a mais: a guarda aborta (29), e nada fica" ${D}_c4 "guarda: orcamentista_orcamento tem 29 coluna(s) alem da nova, e devia ter 28." 0
$P -d ${D}_c5 -c "alter table public.orcamentista_orcamento add column valor_operacao_interna text" >/dev/null
contraste "contraste 5 - a coluna que ja existe como text aborta, e nada fica" ${D}_c5 "operator does not exist: text > integer" 0
$P -d ${D}_c6 -c "alter table public.orcamentista_orcamento add column valor_operacao_interna numeric, add constraint orcamentista_orcamento_operacao_interna_com_a_venda check (true)" >/dev/null
contraste "contraste 6 - a com_a_venda de mesmo nome e outra definicao aborta na verificacao 2" ${D}_c6 "verificacao 2: CHECK ausente ou com outra definicao: com_a_venda." 1
$P -d ${D}_c7 -c "grant select on public.orcamentista_orcamento to authenticated" >/dev/null
contraste "contraste 7 - um grant a authenticated aborta na verificacao 5, e nada fica" ${D}_c7 "verificacao 5: 1 grant(s) a anon, authenticated ou PUBLIC em orcamentista_orcamento." 0
$P -d ${D}_c8 -c "revoke update on public.orcamentista_orcamento from service_role" >/dev/null
contraste "contraste 8 - o service_role sem UPDATE aborta na verificacao 6, e nada fica" ${D}_c8 "verificacao 6: service_role em orcamentista_orcamento tem INSERT,SELECT, e devia ter INSERT,SELECT,UPDATE." 0
for x in $TODOS; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
echo "$SAIDA" | grep -oE "(ok|FALHOU): .*|erro inesperado: .*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHOU=$(echo "$SAIDA" | grep -c "FALHOU: ")
echo "$OK ok, $FALHOU falhou"
[ "$FALHOU" = "0" ] && [ "$OK" = "${ESPERADOS:-22}" ] || exit 1
