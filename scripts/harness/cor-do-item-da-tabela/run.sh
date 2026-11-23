#!/bin/bash
# HARNESS da migracao 20261123000004 (a cor do item da tabela). NAO TOCA PRODUCAO.
# Base: a do bloco-tributario (as migracoes reais ate a 20261102000001) + a 20261112000003/4/5 — o estado de producao de 23/11/2026: o corpo de
# importar_conteudo_da_tabela com md5 d9880043... e a ACL {postgres=X/postgres} (conferidos abaixo).
#   D = base + itens de antes + esta migracao DUAS vezes -> os casos (10_casos.sql);
#   CONTRASTE 1 = a guarda: com o corpo diferente do medido, a migracao aborta e a coluna nao nasce;
#   CONTRASTE 2 = a verificacao 6: com um GRANT a service_role posto no meio (simulando a ACL mudada), a migracao aborta.
# Uso: run.sh [arquivo da migracao]. REUSA_BASE=1 nao reconstroi a base (as mutacoes). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261123000004_cor_do_item_da_tabela.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_cor_do_item}; B0=${D}_bt; BASE=${D}_base; G1=${D}_contraste1; G2=${D}_contraste2
if [ -z "$REUSA_BASE" ] || ! $P -At -c "select 1 from pg_database where datname = '$BASE'" | grep -q 1; then
  HARNESS_DB=$B0 bash $H/bloco-tributario/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: a base do bloco-tributario"; exit 2; }
  $P -c "drop database if exists $BASE" >/dev/null 2>&1; $P -c "create database $BASE template $B0" >/dev/null || { echo "BASE FALHOU: copia"; exit 2; }
  for m in 20261112000003_importacao_que_nao_encolhe 20261112000004_devolve_execute_da_importacao_ao_service_role 20261112000005_corta_o_caminho_por_fora_da_importacao; do
    OUT=$($P -d $BASE -v ON_ERROR_STOP=1 -f $M/$m.sql 2>&1) || { echo "BASE FALHOU: $m"; echo "$OUT" | grep ERROR | head -2; exit 2; }
  done
fi
E=$($P -d $BASE -At -c "select md5(replace(prosrc, E'\r', '')) || ' ' || proacl::text from pg_proc where proname = 'importar_conteudo_da_tabela'")
[ "$E" = "d98800431ea61fede9cab6593d01f007 {postgres=X/postgres}" ] || { echo "BASE FALHOU: a funcao da base nao e a de producao ($E)"; exit 2; }
for x in $D $G1 $G2; do $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }; done
$P -d $D -v ON_ERROR_STOP=1 -c "insert into public.orcamentista_tabela_item (tabela_id, codigo, custo, segmento) select t.id, 'COR-ANTES-' || g, g * 10.5, 'Vidro' from (select id from public.orcamentista_tabela order by id limit 1) t, generate_series(1, 5) g" >/dev/null \
  || { echo "BASE FALHOU: os itens de antes"; exit 2; }
# a foto de ANTES da migracao: id, custo e segmento de todas as linhas
$P -d $D -v ON_ERROR_STOP=1 -c "create table public.antes_da_cor as select md5(string_agg(id::text || coalesce(custo::text,'~') || coalesce(segmento,'~'), ',' order by id)) v, count(*) n from public.orcamentista_tabela_item" >/dev/null \
  || { echo "BASE FALHOU: a foto de antes"; exit 2; }
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
contrastes() {
  # CONTRASTE 1: o corpo da funcao diferente do medido — a guarda aborta e a coluna nao nasce
  $P -d $G1 -At -c "select pg_get_functiondef('public.importar_conteudo_da_tabela(uuid, jsonb)'::regprocedure)" | sed 's/^BEGIN$/BEGIN\n  -- uma mudanca que a migracao nao conhece/' > /tmp/harness-cor-fn.sql
  $P -d $G1 -v ON_ERROR_STOP=1 -f /tmp/harness-cor-fn.sql >/dev/null 2>&1 || { echo "ERROR:  FALHOU contraste 1: nao consegui mudar o corpo"; return; }
  local SAI; SAI=$($P -d $G1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  local N; N=$($P -d $G1 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_tabela_item' and column_name = 'cor'")
  if echo "$SAI" | grep -q "guarda: o corpo" && [ "$N" = 0 ]; then echo "NOTICE:  ok: contraste 1 — com o corpo diferente do medido, a guarda aborta e a coluna nao nasce"; else echo "ERROR:  FALHOU contraste 1 ($N)"; fi
  # CONTRASTE 2: a ACL que muda no meio da transacao (um GRANT inserido antes da verificacao) — a verificacao 6 aborta
  sed 's/^-- 4\. a verificacao que ABORTA, na mesma transacao$/GRANT EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) TO PUBLIC;/' "$MIG" > /tmp/harness-cor-acl.sql
  SAI=$($P -d $G2 -v ON_ERROR_STOP=1 -f /tmp/harness-cor-acl.sql 2>&1)
  N=$($P -d $G2 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_tabela_item' and column_name = 'cor'")
  if echo "$SAI" | grep -q "verificacao 6" && [ "$N" = 0 ]; then echo "NOTICE:  ok: contraste 2 — a ACL mudada aborta na verificacao 6, e nada fica"; else echo "ERROR:  FALHOU contraste 2 ($N)"; fi
}
SAIDA=$( { $P -d $D -f $S/10_casos.sql 2>&1; contrastes; } )
echo "$SAIDA" | grep -oE "(ok|FALHOU)[^\"]*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHA=$(echo "$SAIDA" | grep -c "FALHOU")
echo "$OK de 8 casos ok"
[ "$OK" = 8 ] && [ "$FALHA" = 0 ]
