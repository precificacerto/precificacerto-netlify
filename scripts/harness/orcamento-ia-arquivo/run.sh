#!/bin/bash
# HARNESS da migração 20261109000005 (o arquivo "Orçamento"). NÃO TOCA PRODUÇÃO.
#   D  = a base (../orcamento-ia/00_base.sql) + os tipos e a tabela de UFs de produção (../orcamento-ia-fiscal/01_producao.sql) + a função dos
#        ambientes (02_funcao_dos_ambientes.sql, o corpo de produção) + 0001..0004 + esta DUAS vezes -> 10_casos.sql;
#   contraste 1: sem a 20261109000004 -> a guarda aborta, e nada fica;
#   contraste 2: a função dos ambientes com outro corpo -> a guarda aborta, e nada fica;
#   contraste 3: sem a função dos ambientes -> a guarda aborta, e nada fica;
#   contraste 4: uma constraint a mais no item -> a verificação 3 aborta (50), e nada fica;
#   contraste 5: um orcamentista_orcamento_arquivo que já existe com outra forma -> a migração aborta (no índice), e nada fica;
#   contraste 6: um grant a authenticated no item -> a verificação 10 aborta, e nada fica;
#   contraste 7: ambientes que já existe como text -> a migração aborta (a CHECK não se aplica a text), e nada fica;
#   contraste 8: a chave (id, tenant_id) do orçamento com outro nome -> a guarda aborta, e nada fica;
#   contraste 9: uma escolhas_objeto de mesmo nome e outra definição -> a verificação 1 aborta;
#   contraste 10: uma coluna a mais no item -> a verificação 4 aborta (31);
#   contraste 11: ambientes que já existe como jsonb COM default -> a verificação 5 aborta.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261109000005_orcamento_ia_arquivo.sql}
BASE=$S/../orcamento-ia/00_base.sql; PROD=$S/../orcamento-ia-fiscal/01_producao.sql; FN=$S/02_funcao_dos_ambientes.sql
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_orcamento_arquivo}; TODOS="$D ${D}_c1 ${D}_c2 ${D}_c3 ${D}_c4 ${D}_c5 ${D}_c6 ${D}_c7 ${D}_c8 ${D}_c9 ${D}_c10 ${D}_c11"
for x in $TODOS; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  $P -d $x -c "do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$; do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$; do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;" >/dev/null 2>&1
  $P -c "alter role service_role bypassrls" >/dev/null 2>&1  # como em producao: o service_role ignora a RLS
  # o privilegio padrao de producao: o que o postgres cria no public da ALL a anon, authenticated e service_role (medido na 20261101000002)
  $P -d $x -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role" >/dev/null
  for f in $BASE $PROD $FN $M/20261109000001_orcamento_ia.sql $M/20261109000002_orcamento_ia_precificacao.sql $M/20261109000003_orcamento_ia_material.sql $M/20261109000004_orcamento_ia_fiscal.sql; do
    [ $x = ${D}_c1 ] && [ $f = $M/20261109000004_orcamento_ia_fiscal.sql ] && continue
    [ $x = ${D}_c3 ] && [ $f = $FN ] && continue
    OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $f 2>&1) || { echo "BASE FALHOU em $x: $f"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  done
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1)
resto() { $P -d $1 -At -c "select (select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento_item' and column_name = 'escolhas') + (select count(*) from pg_class where relname = 'orcamentista_orcamento_arquivo' and exists (select 1 from information_schema.columns where table_name = 'orcamentista_orcamento_arquivo' and column_name = 'sha256')) + (select count(*) from pg_constraint where conname = 'orcamentista_orcamento_item_ambientes_forma')"; }
contraste() { # nome, banco, frase do erro, o que pode ficar
  local SAI; SAI=$($P -d $2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1); local RESTO; RESTO=$(resto $2)
  if echo "$SAI" | grep -qF "ERROR:  $3" && [ "$RESTO" = "$4" ]; then SAIDA="$SAIDA"$'\n'"NOTICE:  ok: $1"
  else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: $1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
contraste "contraste 1 - sem a 20261109000004 a guarda aborta, e nada fica" ${D}_c1 "dependencia ausente: orcamentista_orcamento.uf_destino (a migracao 20261109000004). Nada foi alterado." 0
$P -d ${D}_c2 -c "create or replace function public.orcamentista_levantamento_ambientes_validos(p jsonb) returns boolean language sql immutable as \$f\$ select true \$f\$" >/dev/null
contraste "contraste 2 - a funcao dos ambientes com outro corpo: a guarda aborta, e nada fica" ${D}_c2 "dependencia ausente ou com outro corpo: public.orcamentista_levantamento_ambientes_validos(jsonb)" 0
contraste "contraste 3 - sem a funcao dos ambientes: a guarda aborta, e nada fica" ${D}_c3 "dependencia ausente ou com outro corpo: public.orcamentista_levantamento_ambientes_validos(jsonb)" 0
$P -d ${D}_c4 -c "alter table public.orcamentista_orcamento_item add constraint orcamentista_orcamento_item_extra_check check (true)" >/dev/null
contraste "contraste 4 - uma constraint a mais aborta na verificacao 3 (50), e nada fica" ${D}_c4 "verificacao 3: orcamentista_orcamento e orcamentista_orcamento_item tem 50 constraint(s), e deviam ter 49." 0
$P -d ${D}_c5 -c "create table public.orcamentista_orcamento_arquivo (id uuid primary key)" >/dev/null
contraste "contraste 5 - o arquivo que ja existe com outra forma aborta (no indice), e nada fica" ${D}_c5 'column "orcamento_id" does not exist' 0
$P -d ${D}_c6 -c "grant select on public.orcamentista_orcamento_item to authenticated" >/dev/null
contraste "contraste 6 - um grant a authenticated aborta na verificacao 10, e nada fica" ${D}_c6 "verificacao 10: 1 grant(s) a anon, authenticated ou PUBLIC nas tres tabelas." 0
$P -d ${D}_c7 -c "alter table public.orcamentista_orcamento_item add column ambientes text" >/dev/null
contraste "contraste 7 - ambientes que ja existe como text aborta, e nada fica" ${D}_c7 "function public.orcamentista_levantamento_ambientes_validos(text) does not exist" 0
$P -d ${D}_c8 -c "alter table public.orcamentista_orcamento rename constraint orcamentista_orcamento_id_tenant_key to orcamentista_orcamento_outra_chave" >/dev/null
contraste "contraste 8 - sem a chave (id, tenant_id) do orcamento: a guarda aborta, e nada fica" ${D}_c8 "dependencia ausente: orcamentista_orcamento_id_tenant_key UNIQUE (id, tenant_id)" 0
$P -d ${D}_c9 -c "alter table public.orcamentista_orcamento_item add column escolhas jsonb, add constraint orcamentista_orcamento_item_escolhas_objeto check (true)" >/dev/null
contraste "contraste 9 - a CHECK das escolhas de mesmo nome e outra definicao aborta na verificacao 1" ${D}_c9 "verificacao 1: constraint ausente ou com outra definicao: orcamentista_orcamento_item_escolhas_objeto." 1
$P -d ${D}_c10 -c "alter table public.orcamentista_orcamento_item add column extra text" >/dev/null
contraste "contraste 10 - uma coluna a mais no item aborta na verificacao 4 (31), e nada fica" ${D}_c10 "verificacao 4: orcamentista_orcamento_item tem 31 coluna(s), e devia ter 30." 0
$P -d ${D}_c11 -c "alter table public.orcamentista_orcamento_item add column ambientes jsonb default null::jsonb" >/dev/null
$P -d ${D}_c11 -c "alter table public.orcamentista_orcamento_item alter column ambientes set default '[{\"ambiente\": \"Sala\", \"quantidade\": 1}]'::jsonb" >/dev/null
contraste "contraste 11 - ambientes com default aborta na verificacao 5, e nada fica" ${D}_c11 "verificacao 5: ambientes ou escolhas do item ausente ou com outra forma" 0
for x in $TODOS; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
echo "$SAIDA" | grep -oE "(ok|FALHOU): .*|erro inesperado: .*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHOU=$(echo "$SAIDA" | grep -c "FALHOU: ")
echo "$OK ok, $FALHOU falhou"
[ "$FALHOU" = "0" ] && [ "$OK" = "${ESPERADOS:-34}" ] || exit 1
