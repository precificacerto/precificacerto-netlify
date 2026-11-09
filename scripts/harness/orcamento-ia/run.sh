#!/bin/bash
# HARNESS da migração 20261109000001 (o orçamento I.A. e os itens). NÃO TOCA PRODUÇÃO.
#   D  = base + esta migração DUAS vezes -> os casos (10_casos.sql);
#   contraste 1: a base SEM a UNIQUE (id, tenant_id) do levantamento -> a guarda aborta com a frase, e nada fica;
#   contraste 2: uma orcamentista_orcamento que já existe com OUTRA forma -> a verificação aborta, e a tabela de item não fica;
#   contraste 3: a base SEM o privilégio padrão de produção -> a migração passa igual (o REVOKE não depende dele);
#   contraste 4: a VERSÃO ANTERIOR da migração (o commit 6193b315, a FK de coluna única) -> o insert do caso 11 PASSA: o caso distingue o
#                antes do depois;
#   contraste 5: a base com orcamentista_levantamento_item.tenant_id nulável -> a guarda aborta com a frase, e nada fica;
#   contraste 6: a base com uma chave a mais no item do levantamento -> a verificação 11 aborta, e nada fica.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261109000001_orcamento_ia.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_orcamento_ia}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3; C4=${D}_c4; C5=${D}_c5; C6=${D}_c6
for x in $D $C1 $C2 $C3 $C4 $C5 $C6; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1)
# CONTRASTE 1
$P -d $C1 -c "alter table public.orcamentista_levantamento drop constraint orcamentista_levantamento_id_tenant_key" >/dev/null 2>&1
SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
RESTO=$($P -d $C1 -At -c "select count(*) from pg_class where relname in ('orcamentista_orcamento', 'orcamentista_orcamento_item')")
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: orcamentista_levantamento_id_tenant_key UNIQUE (id, tenant_id). Nada foi alterado." && [ "$RESTO" = "0" ]; then
  SAIDA="$SAIDA"$'\n'"NOTICE:  ok: contraste 1 — sem a UNIQUE do levantamento a guarda aborta, e nada fica"
else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: contraste 1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
# CONTRASTE 2
$P -d $C2 -c "create table public.orcamentista_orcamento (id uuid primary key, tenant_id uuid not null, nome text)" >/dev/null 2>&1
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
RESTO=$($P -d $C2 -At -c "select count(*) from pg_class where relname = 'orcamentista_orcamento_item'")
if echo "$SAI" | grep -q "ERROR:" && [ "$RESTO" = "0" ]; then
  SAIDA="$SAIDA"$'\n'"NOTICE:  ok: contraste 2 — a tabela de outra forma faz a migracao abortar, e a de item nao fica"
else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: contraste 2: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
# CONTRASTE 3
$P -d $C3 -c "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role" >/dev/null 2>&1
SAI=$($P -d $C3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if [ $? -eq 0 ]; then SAIDA="$SAIDA"$'\n'"NOTICE:  ok: contraste 3 — sem o privilegio padrao a migracao passa igual"
else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: contraste 3: $(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 4: a versão anterior (FK de coluna única) deixa o insert de outra empresa passar
ANTIGA=$(mktemp --suffix=.sql); git -C "$R" show 6193b315:supabase/migrations/20261109000001_orcamento_ia.sql > "$ANTIGA"
$P -d $C4 -v ON_ERROR_STOP=1 -f "$ANTIGA" >/dev/null 2>&1
$P -d $C4 -v ON_ERROR_STOP=1 -c "insert into orcamentista_orcamento (id, tenant_id, numero, origem, levantamento_id, nome) values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 1, 'agente', '10000000-0000-4000-8000-000000000001', 'Antonio Rock')" >/dev/null 2>&1
if $P -d $C4 -v ON_ERROR_STOP=1 -c "insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, levantamento_item_id, quantidade) values ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 5, '20000000-0000-4000-8000-000000000009', 1)" >/dev/null 2>&1; then
  SAIDA="$SAIDA"$'\n'"NOTICE:  ok: contraste 4 — na versao anterior o item de outra empresa PASSA (o caso 11 distingue o antes do depois)"
else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: contraste 4: na versao anterior o insert de outra empresa nao passou"; fi
rm -f "$ANTIGA"
# CONTRASTE 5
$P -d $C5 -c "alter table public.orcamentista_levantamento_item alter column tenant_id drop not null" >/dev/null 2>&1
SAI=$($P -d $C5 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
RESTO=$($P -d $C5 -At -c "select (select count(*) from pg_class where relname in ('orcamentista_orcamento', 'orcamentista_orcamento_item')) + (select count(*) from pg_constraint where conname = 'orcamentista_levantamento_item_id_tenant_key')")
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: orcamentista_levantamento_item.tenant_id uuid NOT NULL. Nada foi alterado." && [ "$RESTO" = "0" ]; then
  SAIDA="$SAIDA"$'\n'"NOTICE:  ok: contraste 5 — tenant_id nulavel no item do levantamento aborta na guarda, e nada fica"
else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: contraste 5: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
# CONTRASTE 6
$P -d $C6 -c "alter table public.orcamentista_levantamento_item add constraint orcamentista_levantamento_item_extra_key unique (levantamento_id, id)" >/dev/null 2>&1
SAI=$($P -d $C6 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
RESTO=$($P -d $C6 -At -c "select (select count(*) from pg_class where relname in ('orcamentista_orcamento', 'orcamentista_orcamento_item')) + (select count(*) from pg_constraint where conname = 'orcamentista_levantamento_item_id_tenant_key')")
if echo "$SAI" | grep -q "ERROR:  verificacao 11: as chaves de orcamentista_levantamento_item sao" && [ "$RESTO" = "0" ]; then
  SAIDA="$SAIDA"$'\n'"NOTICE:  ok: contraste 6 — uma chave a mais no item do levantamento aborta na verificacao 11, e nada fica"
else SAIDA="$SAIDA"$'\n'"NOTICE:  FALHOU: contraste 6: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
for x in $D $C1 $C2 $C3 $C4 $C5 $C6; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
echo "$SAIDA" | grep -oE "(ok|FALHOU): .*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHOU=$(echo "$SAIDA" | grep -c "FALHOU: ")
echo "$OK ok, $FALHOU falhou"
[ "$FALHOU" = "0" ] && [ "$OK" = "${ESPERADOS:-45}" ] || exit 1
