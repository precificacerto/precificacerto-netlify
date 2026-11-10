#!/bin/bash
# HARNESS da migracao 20261111000001 (arquivar o orcamento I.A.). NAO TOCA PRODUCAO.
#   D  = a base da 20261110000001 (00_base, 01_producao, a funcao dos ambientes, 0001..0005, 20261110000001) + um orcamento COM venda,
#        interna e um item semeado ANTES; a migracao DUAS vezes; o md5 da linha (sem as colunas novas) igual antes e depois; -> 10_casos.sql;
#   contraste 1: sem a 20261110000001 -> a guarda aborta, e nada fica;
#   contraste 2: uma coluna a mais no orcamento -> a guarda aborta (30), e nada fica;
#   contraste 3: uma constraint a mais no item -> a guarda aborta (53), e nada fica;
#   contraste 4: deleted_at que ja existe como text -> a verificacao 1 aborta, e nada fica;
#   contraste 5: deleted_by que ja existe com FK -> a verificacao 3 aborta, e nada fica;
#   contraste 6: a CHECK de mesmo nome e outra definicao -> a verificacao 4 aborta;
#   contraste 7: um grant a authenticated -> a verificacao 8 aborta, e nada fica;
#   contraste 8: o service_role sem UPDATE -> a verificacao 9 aborta, e nada fica.
# Uso: run.sh [arquivo da migracao]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261111000001_orcamento_ia_arquivar.sql}
A=$S/../orcamento-ia-arquivo; BASE=$S/../orcamento-ia/00_base.sql; PROD=$S/../orcamento-ia-fiscal/01_producao.sql; FN=$A/02_funcao_dos_ambientes.sql
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_orcamento_arquivar}; TODOS="$D ${D}_c1 ${D}_c2 ${D}_c3 ${D}_c4 ${D}_c5 ${D}_c6 ${D}_c7 ${D}_c8"
for x in $TODOS; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  $P -d $x -c "do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$; do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$; do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;" >/dev/null 2>&1
  $P -c "alter role service_role bypassrls" >/dev/null 2>&1  # como em producao: o service_role ignora a RLS
  $P -d $x -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role" >/dev/null
  for f in $BASE $PROD $FN $M/20261109000001_orcamento_ia.sql $M/20261109000002_orcamento_ia_precificacao.sql $M/20261109000003_orcamento_ia_material.sql $M/20261109000004_orcamento_ia_fiscal.sql $M/20261109000005_orcamento_ia_arquivo.sql $M/20261110000001_orcamento_ia_operacao_interna.sql; do
    [ $x = ${D}_c1 ] && [ $f = $M/20261110000001_orcamento_ia_operacao_interna.sql ] && continue
    OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $f 2>&1) || { echo "BASE FALHOU em $x: $f"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  done
done
# o orcamento de antes: venda, interna e um item (a migracao nao pode tocar em nada disso)
$P -d $D -v ON_ERROR_STOP=1 -c "insert into public.tenants (id) values ('00000000-0000-0000-0000-0000000000a1');
  insert into public.orcamentista_orcamento (id, tenant_id, nome, numero, origem, criado_por) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Orc A', 1, 'manual', gen_random_uuid());
  update public.orcamentista_orcamento set valor_total_bruto = 80, valor_total_liquido = 70, valor_venda = 120.47, valor_operacao_interna = 100.00 where id = '00000000-0000-0000-0000-00000000000a';
  insert into public.orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, tipologia, quantidade) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 1, 'DP-02', 1)" >/dev/null || { echo "BASE FALHOU: a semente"; exit 2; }
linhas() { $P -d $D -At -c "select md5(string_agg(x, '|' order by x)) from (select (to_jsonb(o) - 'deleted_at' - 'deleted_by')::text x from public.orcamentista_orcamento o union all select to_jsonb(i)::text from public.orcamentista_orcamento_item i) t"; }
ANTES=$(linhas)
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
DEPOIS=$(linhas)
if [ -n "$ANTES" ] && [ "$ANTES" = "$DEPOIS" ]; then SAIDA="NOTICE:  ok: 0 - nenhuma linha alterada pela migracao (md5 das linhas igual antes e depois, duas aplicacoes)"
else SAIDA="NOTICE:  FALHOU: 0 - linhas alteradas: $ANTES -> $DEPOIS"; fi
SAIDA="$SAIDA"$'\n'"$($P -d $D -f $S/10_casos.sql 2>&1)"
resto() { $P -d $1 -At -c "select (select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento' and column_name in ('deleted_at', 'deleted_by')) + (select count(*) from pg_constraint where conname = 'orcamentista_orcamento_arquivado_com_autor')"; }
contraste() { # nome, banco, frase do erro, o que pode ficar
  local SAI; SAI=$($P -d $2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1); local RESTO; RESTO=$(resto $2)
  if echo "$SAI" | grep -qF "ERROR:  $3" && [ "$RESTO" = "$4" ]; then SAIDA="$SAIDA"$'\n'"NOTICE:  ok: $1"
  else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: $1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
contraste "contraste 1 - sem a 20261110000001 a guarda aborta, e nada fica" ${D}_c1 "dependencia ausente: orcamentista_orcamento.valor_operacao_interna (a migracao 20261110000001). Nada foi alterado." 0
$P -d ${D}_c2 -c "alter table public.orcamentista_orcamento add column extra text" >/dev/null
contraste "contraste 2 - uma coluna a mais: a guarda aborta (30), e nada fica" ${D}_c2 "guarda: orcamentista_orcamento tem 30 coluna(s) alem das novas, e devia ter 29." 0
$P -d ${D}_c3 -c "alter table public.orcamentista_orcamento_item add constraint orcamentista_orcamento_item_extra_check check (true)" >/dev/null
contraste "contraste 3 - uma constraint a mais: a guarda aborta (53), e nada fica" ${D}_c3 "guarda: orcamentista_orcamento e orcamentista_orcamento_item tem 53 constraint(s) alem da nova, e deviam ter 52." 0
$P -d ${D}_c4 -c "alter table public.orcamentista_orcamento add column deleted_at text" >/dev/null
contraste "contraste 4 - deleted_at que ja existe como text: a verificacao 1 aborta, e nada fica" ${D}_c4 "verificacao 1: deleted_at ausente ou com outra forma (timestamptz, nula, sem default)." 1
# a FK conta como constraint: tira-se outra para a contagem ficar em 52 e a FK passar da guarda e chegar a verificacao 3
$P -d ${D}_c5 -c "alter table public.orcamentista_orcamento drop constraint orcamentista_orcamento_marca_inteira, add column deleted_by uuid references public.tenants(id)" >/dev/null
contraste "contraste 5 - deleted_by que ja existe com FK: a verificacao 3 aborta, e nada fica" ${D}_c5 "verificacao 3: deleted_by tem 1 chave(s) estrangeira(s), e devia seguir criado_por (sem FK)." 1
$P -d ${D}_c6 -c "alter table public.orcamentista_orcamento add column deleted_at timestamptz, add column deleted_by uuid, add constraint orcamentista_orcamento_arquivado_com_autor check (true)" >/dev/null
contraste "contraste 6 - a CHECK de mesmo nome e outra definicao aborta na verificacao 4" ${D}_c6 "verificacao 4: CHECK orcamentista_orcamento_arquivado_com_autor ausente ou com outra definicao." 3
$P -d ${D}_c7 -c "grant select on public.orcamentista_orcamento to authenticated" >/dev/null
contraste "contraste 7 - um grant a authenticated aborta na verificacao 8, e nada fica" ${D}_c7 "verificacao 8: 1 grant(s) a anon, authenticated ou PUBLIC em orcamentista_orcamento." 0
$P -d ${D}_c8 -c "revoke update on public.orcamentista_orcamento from service_role" >/dev/null
contraste "contraste 8 - o service_role sem UPDATE aborta na verificacao 9, e nada fica" ${D}_c8 "verificacao 9: service_role em orcamentista_orcamento tem INSERT,SELECT, e devia ter INSERT,SELECT,UPDATE." 0
for x in $TODOS; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
echo "$SAIDA" | grep -oE "(ok|FALHOU): .*|erro inesperado: .*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHOU=$(echo "$SAIDA" | grep -c "FALHOU: ")
echo "$OK ok, $FALHOU falhou"
[ "$FALHOU" = "0" ] && [ "$OK" = "${ESPERADOS:-19}" ] || exit 1
