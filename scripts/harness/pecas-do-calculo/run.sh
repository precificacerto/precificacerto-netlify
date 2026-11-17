#!/bin/bash
# HARNESS da migração 20261117000001 (as peças do cálculo, para o relatório de corte). NÃO TOCA PRODUÇÃO.
# Base: 00_base.sql (os papéis, o privilégio padrão do postgres como em produção, tenants e o item com a UNIQUE (id, tenant_id)).
#   D  = base + esta migração DUAS vezes -> os casos (10_casos.sql);
#   contraste 1: o item SEM a UNIQUE (id, tenant_id) -> a guarda aborta com a frase, e a tabela não fica;
#   contraste 2: a tabela já existe com OUTRA forma -> a guarda aborta com a frase;
#   contraste 3: sem as tabelas de que depende -> a guarda aborta com a frase da dependência;
#   contraste 4: a migração SEM o REVOKE de authenticated -> a verificação 5 aborta (prova que ela vê o privilégio padrão).
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261117000001_pecas_do_calculo.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_pecas_do_calculo}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3; C4=${D}_c4
for x in $D $C1 $C2 $C3 $C4; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
existe() { $P -d $1 -At -c "select count(*) from pg_class where relname = 'orcamentista_orcamento_item_peca'"; }
contrastes() {
# CONTRASTE 1: o item sem a UNIQUE (id, tenant_id)
$P -d $C1 -c "alter table public.orcamentista_orcamento_item drop constraint orcamentista_orcamento_item_id_tenant_key" >/dev/null 2>&1
local SAI; SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  orcamentista_orcamento_item nao tem a UNIQUE (id, tenant_id) que a FK composta usa. Nada foi alterado." && [ "$(existe $C1)" = "0" ]; then
  echo "NOTICE:  ok: contraste 1 — sem a UNIQUE do item, a guarda aborta e a tabela nao fica"
else echo "ERROR:  FALHOU contraste 1: $(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 2: a tabela já existe com outra forma
$P -d $C2 -c "create table public.orcamentista_orcamento_item_peca (id uuid primary key, x text)" >/dev/null 2>&1
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  orcamentista_orcamento_item_peca ja existe com 2 colunas, e esta migracao cria 16: e outra tabela. Nada foi alterado."; then
  echo "NOTICE:  ok: contraste 2 — a tabela com outra forma aborta na guarda"
else echo "ERROR:  FALHOU contraste 2: $(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 3: sem as dependências
$P -d $C3 -c "drop table public.orcamentista_orcamento_item; drop table public.tenants" >/dev/null 2>&1
SAI=$($P -d $C3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: orcamentista_orcamento_item ou tenants"; then
  echo "NOTICE:  ok: contraste 3 — sem as dependencias, a guarda aborta com a frase"
else echo "ERROR:  FALHOU contraste 3: $(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 4: a migração sem o REVOKE de authenticated -> a verificação 5 vê o privilégio padrão e aborta
local T; T=$(mktemp); sed 's/REVOKE ALL ON public.orcamentista_orcamento_item_peca FROM PUBLIC, anon, authenticated, service_role;/REVOKE ALL ON public.orcamentista_orcamento_item_peca FROM PUBLIC, anon, service_role;/' "$MIG" > $T
SAI=$($P -d $C4 -v ON_ERROR_STOP=1 -f $T 2>&1); rm -f $T
if echo "$SAI" | grep -q "ERROR:  verificacao 5: os grants deviam ser so INSERT e SELECT do service_role" && [ "$(existe $C4)" = "0" ]; then
  echo "NOTICE:  ok: contraste 4 — sem o REVOKE de authenticated, a verificacao 5 aborta e a tabela nao fica"
else echo "ERROR:  FALHOU contraste 4: $(echo "$SAI" | grep ERROR | head -1)"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*NOTICE:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $C1 $C2 $C3 $C4; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
