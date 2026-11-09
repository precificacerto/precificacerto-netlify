#!/bin/bash
# HARNESS da migração 20261109000002 (a provisão da precificação do orçamento I.A.). NÃO TOCA PRODUÇÃO.
#   D  = a base da 20261109000001 (../orcamento-ia/00_base.sql) + a 20261109000001 + esta migração DUAS vezes -> os casos (10_casos.sql);
#   contraste 1: sem a 20261109000001 -> a guarda aborta com a frase;
#   contraste 2: uma coluna de mesmo nome com DEFAULT 0 -> a verificação 1 aborta, e nenhuma coluna nova fica;
#   contraste 3: uma CHECK de mesmo nome com outra definição -> a verificação 3 aborta, e nenhuma coluna nova fica;
#   contraste 4: uma constraint a mais nas tabelas -> a verificação 4 aborta;
#   contraste 5: um grant a anon -> a verificação 5 aborta;
#   contraste 9: um reserva_tecnica_responsavel que já existe com CHECK sem o limite de 120 -> a verificação 3 aborta;
#   contraste 8: a 20261109000001 sem a CHECK origem_amarrada -> a guarda aborta com a frase;
#   contraste 7: o service_role com DELETE -> a verificação 6 aborta;
#   contraste 6: SEM esta migração, o update do caso 3a falha (as colunas não existem): o caso distingue o antes do depois.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261109000002_orcamento_ia_precificacao.sql}
BASE=$S/../orcamento-ia/00_base.sql; ANTES=$M/20261109000001_orcamento_ia.sql
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_orcamento_precificacao}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3; C4=${D}_c4; C5=${D}_c5; C6=${D}_c6; C7=${D}_c7; C8=${D}_c8; C9=${D}_c9
for x in $D $C1 $C2 $C3 $C4 $C5 $C6 $C7 $C8 $C9; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $BASE 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  [ $x = $C1 ] && continue
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $ANTES 2>&1) || { echo "BASE FALHOU: a 20261109000001 em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1)
novas() { $P -d $1 -At -c "select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('orcamentista_orcamento', 'orcamentista_orcamento_item') and column_name in ('custo_bruto_materiais', 'cred_icms_pct', 'custo_liquido_total', 'comissao_percentual', 'aproveitamento_modo', 'valor_venda')"; }
contraste() { # nome, banco, frase do erro, quantas colunas novas podem ficar
  local SAI; SAI=$($P -d $2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1); local RESTO; RESTO=$(novas $2)
  if echo "$SAI" | grep -qF "ERROR:  $3" && [ "$RESTO" = "$4" ]; then SAIDA="$SAIDA"$'\n'"NOTICE:  ok: $1"
  else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: $1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
contraste "contraste 1 — sem a 20261109000001 a guarda aborta" $C1 "dependencia ausente: orcamentista_orcamento ou orcamentista_orcamento_item (a migracao 20261109000001). Nada foi alterado." 0
$P -d $C2 -c "alter table public.orcamentista_orcamento add column valor_venda numeric default 0" >/dev/null
contraste "contraste 2 — a coluna com DEFAULT 0 aborta na verificacao 1, e so ela fica" $C2 "verificacao 1: coluna ausente ou com outra forma (tipo, nula, sem default): orcamentista_orcamento.valor_venda." 1
$P -d $C3 -c "alter table public.orcamentista_orcamento add constraint orcamentista_orcamento_venda_derivada check (true)" >/dev/null
contraste "contraste 3 — a CHECK de mesmo nome e outra definicao aborta na verificacao 3" $C3 "verificacao 3: constraint ausente ou com outra definicao: orcamentista_orcamento_venda_derivada." 0
$P -d $C4 -c "alter table public.orcamentista_orcamento_item add constraint orcamentista_orcamento_item_extra check (ordem < 100000)" >/dev/null
contraste "contraste 4 — uma constraint a mais aborta na verificacao 4" $C4 "verificacao 4: as duas tabelas tem 42 constraint(s), e deviam ter 41." 0
$P -d $C5 -c "grant select on public.orcamentista_orcamento to anon" >/dev/null
contraste "contraste 5 — um grant a anon aborta na verificacao 5" $C5 "verificacao 5: 1 grant(s) a anon, authenticated ou PUBLIC nas duas tabelas." 0
$P -d $C7 -c "grant delete on public.orcamentista_orcamento_item to service_role" >/dev/null
contraste "contraste 7 — o service_role com DELETE aborta na verificacao 6" $C7 "verificacao 6: service_role nas duas tabelas tem DELETE,INSERT,SELECT,UPDATE, e devia ter INSERT,SELECT,UPDATE." 0
$P -d $C8 -c "alter table public.orcamentista_orcamento drop constraint orcamentista_orcamento_origem_amarrada" >/dev/null
contraste "contraste 8 — sem a CHECK origem_amarrada a guarda aborta" $C8 "dependencia ausente: orcamentista_orcamento_origem_amarrada (a migracao 20261109000001). Nada foi alterado." 0
$P -d $C9 -c "alter table public.orcamentista_orcamento add column reserva_tecnica_responsavel text, add constraint orcamentista_orcamento_reserva_tecnica_responsavel_forma check ((reserva_tecnica_responsavel IS NULL) OR (reserva_tecnica_responsavel ~ '^\\S(.*\\S)?$'::text))" >/dev/null
contraste "contraste 9 — o responsavel com CHECK sem o limite de 120 aborta na verificacao 3" $C9 "verificacao 3: constraint ausente ou com outra definicao: orcamentista_orcamento_reserva_tecnica_responsavel_forma." 0
$P -d $C6 -c "insert into orcamentista_orcamento (id, tenant_id, numero, origem, nome, criado_por) values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 1, 'manual', 'x', '40000000-0000-4000-8000-000000000001')" >/dev/null
if $P -d $C6 -v ON_ERROR_STOP=1 -c "update orcamentista_orcamento set valor_venda = 1 where id = '30000000-0000-4000-8000-000000000001'" >/dev/null 2>&1; then
  SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: contraste 6: sem a migracao a coluna existe"
else SAIDA="$SAIDA"$'\n'"NOTICE:  ok: contraste 6 — sem esta migracao o valor de venda nao tem onde ser gravado"; fi
for x in $D $C1 $C2 $C3 $C4 $C5 $C6 $C7 $C8 $C9; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
echo "$SAIDA" | grep -oE "(ok|FALHOU): .*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHOU=$(echo "$SAIDA" | grep -c "FALHOU: ")
echo "$OK ok, $FALHOU falhou"
[ "$FALHOU" = "0" ] && [ "$OK" = "${ESPERADOS:-90}" ] || exit 1
