#!/bin/bash
# HARNESS da migracao 20261118000001 (a autorizacao da medida fora do limite, no item). NAO TOCA PRODUCAO.
# Base: o item do levantamento como em producao em 18/11/2026 (00_base.sql), com dados sinteticos.
#   D  = base + esta migracao DUAS vezes -> os casos (10_casos.sql);
#   contraste 1: limite_tipologia ja existe como integer -> a guarda aborta com a frase, e nada muda;
#   contraste 2: o remetente sem UNIQUE (id, tenant_id) -> a guarda aborta com a frase;
#   contraste 3: sem a tabela do item -> a guarda aborta com a frase da dependencia.
# Uso: run.sh [arquivo da migracao]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261118000001_autorizacao_da_medida_fora_do_limite.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_autorizacao_do_limite}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3
for x in $D $C1 $C2 $C3; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
contrastes() {
# CONTRASTE 1: limite_tipologia ja existe como integer -> aborta na guarda; nenhuma constraint do limite fica
$P -d $C1 -c "alter table public.orcamentista_levantamento_item add column limite_tipologia integer" >/dev/null 2>&1
local SAI; SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
local RESTO; RESTO=$($P -d $C1 -At -c "select (select count(*) from pg_constraint where conname like 'orcamentista_levantamento_item_limite%') + (select count(*) from information_schema.columns where table_name = 'orcamentista_levantamento_item' and column_name like 'limite\_%')")
if echo "$SAI" | grep -q "ERROR:  orcamentista_levantamento_item: a coluna limite_tipologia:integer ja existe com outro tipo ou nao e desta migracao. Nada foi alterado." && [ "$RESTO" = "1" ]; then
  echo "NOTICE:  ok: contraste 1 — limite_tipologia como integer aborta na guarda, e nada muda"
else echo "ERROR:  FALHOU contraste 1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
# CONTRASTE 2: o remetente sem UNIQUE (id, tenant_id) -> a guarda aborta com a frase
$P -d $C2 -c "alter table public.orcamentista_remetente_autorizado drop constraint orcamentista_remetente_autorizado_id_tenant_key" >/dev/null 2>&1
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  orcamentista_remetente_autorizado sem UNIQUE (id, tenant_id)"; then echo "NOTICE:  ok: contraste 2 — sem o UNIQUE do remetente, a guarda aborta"
else echo "ERROR:  FALHOU contraste 2: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 3: sem a tabela do item -> a frase da dependencia
$P -d $C3 -c "drop table public.orcamentista_levantamento_item" >/dev/null 2>&1
SAI=$($P -d $C3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: public.orcamentista_levantamento_item ou public.orcamentista_remetente_autorizado"; then echo "NOTICE:  ok: contraste 3 — sem a tabela do item, a guarda aborta com a frase da dependencia"
else echo "ERROR:  FALHOU contraste 3: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -oE "'caso [0-9]+[a-z]? —|caso [0-9]+ — " $S/10_casos.sql | wc -l) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $C1 $C2 $C3; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
