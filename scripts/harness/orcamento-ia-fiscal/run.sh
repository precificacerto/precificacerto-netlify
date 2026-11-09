#!/bin/bash
# HARNESS da migração 20261109000004 (o bloco fiscal do orçamento I.A.). NÃO TOCA PRODUÇÃO.
#   D  = a base (../orcamento-ia/00_base.sql) + os dois tipos de produção (01_producao.sql: os dois tipos e brazilian_states) + 0001 + 0002 + 0003 + esta DUAS vezes -> 10_casos.sql;
#   contraste 1: sem a 20261109000002 -> a guarda aborta, e nada fica;
#   contraste 2: sem o tipo sale_scope -> a guarda aborta, e nada fica;
#   contraste 3: buyer_type_enum com um rótulo a mais -> a guarda aborta (o domínio mudaria sem ninguém ver);
#   contraste 4: uma constraint a mais no item -> a verificação 3 aborta (48), e nada fica;
#   contraste 5: uma ncm_code que já existe como varchar -> a verificação 1 aborta, e as outras duas não ficam;
#   contraste 6: uma CHECK de mesmo nome e outra definição -> a verificação 2 aborta;
#   contraste 7: um grant a authenticated -> a verificação 5 aborta;
#   contraste 8: o service_role com DELETE -> a verificação 6 aborta;
#   contraste 9: uma coluna a mais no orçamento -> a verificação 4 aborta (29);
#   contraste 10: brazilian_states sem UNIQUE em code -> a guarda aborta (a FK pediria alterar a referência), e nada fica;
#   contraste 11: uma uf_destino_do_escopo de mesmo nome e outra definição (sem o escopo nulo) -> a verificação 2 aborta;
#   contraste 12: uma uf_destino_fkey de mesmo nome e outra definição (ON DELETE CASCADE) -> a verificação 2 aborta;
#   contraste 13: uma uf_destino que já existe como character(3) -> a verificação 1 aborta nomeando-a.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261109000004_orcamento_ia_fiscal.sql}
BASE=$S/../orcamento-ia/00_base.sql; M1=$M/20261109000001_orcamento_ia.sql; M2=$M/20261109000002_orcamento_ia_precificacao.sql; M3=$M/20261109000003_orcamento_ia_material.sql
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_orcamento_fiscal}; TODOS="$D ${D}_c1 ${D}_c2 ${D}_c3 ${D}_c4 ${D}_c5 ${D}_c6 ${D}_c7 ${D}_c8 ${D}_c9 ${D}_c10 ${D}_c11 ${D}_c12 ${D}_c13"
for x in $TODOS; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  $P -d $x -c "do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$; do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$; do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;" >/dev/null 2>&1
  for f in $BASE $S/01_producao.sql $M1 $M2 $M3; do
    [ $x = ${D}_c1 ] && [ $f = $M2 -o $f = $M3 ] && continue
    [ $x = ${D}_c2 ] && [ $f = $S/01_producao.sql ] && { grep -v "public.sale_scope AS" $S/01_producao.sql | $P -d $x >/dev/null; continue; }
    OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $f 2>&1) || { echo "BASE FALHOU em $x: $f"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  done
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1)
resto() { $P -d $1 -At -c "select (select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento' and column_name in ('sale_scope', 'buyer_type')) + (select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento' and column_name = 'uf_destino' and character_maximum_length = 2) + (select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento' and column_name = 'ncm_code' and data_type = 'text')"; }
contraste() { # nome, banco, frase do erro, o que pode ficar
  local SAI; SAI=$($P -d $2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1); local RESTO; RESTO=$(resto $2)
  if echo "$SAI" | grep -qF "ERROR:  $3" && [ "$RESTO" = "$4" ]; then SAIDA="$SAIDA"$'\n'"NOTICE:  ok: $1"
  else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: $1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
contraste "contraste 1 - sem a 20261109000002 a guarda aborta, e nada fica" ${D}_c1 "dependencia ausente: orcamentista_orcamento.valor_venda (a migracao 20261109000002). Nada foi alterado." 0
contraste "contraste 2 - sem o tipo sale_scope a guarda aborta, e nada fica" ${D}_c2 "dependencia ausente ou com outra forma: o tipo public.sale_scope" 0
$P -d ${D}_c3 -c "ALTER TYPE public.buyer_type_enum ADD VALUE 'ISENTO'" >/dev/null
contraste "contraste 3 - buyer_type_enum com outro rotulo: a guarda aborta, e nada fica" ${D}_c3 "dependencia ausente ou com outra forma: o tipo public.buyer_type_enum" 0
$P -d ${D}_c4 -c "alter table public.orcamentista_orcamento_item add constraint orcamentista_orcamento_item_extra_check check (true)" >/dev/null
contraste "contraste 4 - uma constraint a mais aborta na verificacao 3 (48), e nada fica" ${D}_c4 "verificacao 3: orcamentista_orcamento e orcamentista_orcamento_item tem 48 constraint(s), e deviam ter 47." 0
$P -d ${D}_c5 -c "alter table public.orcamentista_orcamento add column ncm_code varchar(10)" >/dev/null
contraste "contraste 5 - ncm_code de outro tipo aborta na verificacao 1, e as outras tres nao ficam" ${D}_c5 "verificacao 1: coluna ausente ou com outra forma (tipo, nula, sem default): ncm_code." 0
$P -d ${D}_c6 -c "alter table public.orcamentista_orcamento add column ncm_code text, add constraint orcamentista_orcamento_ncm_forma check (ncm_code ~ '^[0-9]{8}\$')" >/dev/null
contraste "contraste 6 - a CHECK de mesmo nome e outra definicao aborta na verificacao 2" ${D}_c6 "verificacao 2: orcamentista_orcamento_ncm_forma ausente ou com outra definicao." 1
$P -d ${D}_c7 -c "grant select on public.orcamentista_orcamento to authenticated" >/dev/null
contraste "contraste 7 - um grant a authenticated aborta na verificacao 5, e nada fica" ${D}_c7 "verificacao 5: 1 grant(s) a anon, authenticated ou PUBLIC em orcamentista_orcamento." 0
$P -d ${D}_c8 -c "grant delete on public.orcamentista_orcamento to service_role" >/dev/null
contraste "contraste 8 - o service_role com DELETE aborta na verificacao 6, e nada fica" ${D}_c8 "verificacao 6: service_role em orcamentista_orcamento tem DELETE,INSERT,SELECT,UPDATE, e devia ter INSERT,SELECT,UPDATE." 0
$P -d ${D}_c9 -c "alter table public.orcamentista_orcamento add column extra text" >/dev/null
contraste "contraste 9 - uma coluna a mais aborta na verificacao 4 (29), e nada fica" ${D}_c9 "verificacao 4: orcamentista_orcamento tem 29 coluna(s), e devia ter 28." 0
$P -d ${D}_c10 -c "alter table public.brazilian_states drop constraint brazilian_states_code_key" >/dev/null
contraste "contraste 10 - brazilian_states sem UNIQUE em code: a guarda aborta, e nada fica" ${D}_c10 "dependencia ausente ou com outra forma: public.brazilian_states.code character(2) com UNIQUE ou PK so nela. Nada foi alterado." 0
$P -d ${D}_c11 -c "alter table public.orcamentista_orcamento add column sale_scope public.sale_scope, add column uf_destino character(2), add constraint orcamentista_orcamento_uf_destino_do_escopo check ((sale_scope = 'INTERESTADUAL') = (uf_destino is not null))" >/dev/null
contraste "contraste 11 - a CHECK da UF de mesmo nome e outra definicao aborta na verificacao 2" ${D}_c11 "verificacao 2: orcamentista_orcamento_uf_destino_do_escopo ausente ou com outra definicao." 2
$P -d ${D}_c12 -c "alter table public.orcamentista_orcamento add column uf_destino character(2), add constraint orcamentista_orcamento_uf_destino_fkey foreign key (uf_destino) references public.brazilian_states(code) on delete cascade" >/dev/null
contraste "contraste 12 - a FK da UF de mesmo nome e outra definicao aborta na verificacao 2" ${D}_c12 "verificacao 2: orcamentista_orcamento_uf_destino_fkey ausente ou com outra definicao." 1
$P -d ${D}_c13 -c "alter table public.orcamentista_orcamento add column uf_destino character(3)" >/dev/null
contraste "contraste 13 - uf_destino de outro tamanho aborta na verificacao 1, nomeando-a" ${D}_c13 "verificacao 1: coluna ausente ou com outra forma (tipo, nula, sem default): uf_destino." 0
for x in $TODOS; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
echo "$SAIDA" | grep -oE "(ok|FALHOU): .*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHOU=$(echo "$SAIDA" | grep -c "FALHOU: ")
echo "$OK ok, $FALHOU falhou"
[ "$FALHOU" = "0" ] && [ "$OK" = "${ESPERADOS:-39}" ] || exit 1
