#!/bin/bash
# HARNESS da migração 20261102000001 (o bloco tributário do item). NÃO TOCA PRODUÇÃO.
# Base: a da tabela-soberana (as migrações REAIS, com BASE_SO=1) + o privilégio padrão de funções de produção + a 20261101000002 — o estado de
# produção em 02/11/2026. A base confere que a função importar_conteudo_da_tabela dela tem o md5 medido em produção (c412c59f…).
# Depois:
#   D  = base + itens de antes + esta migração DUAS vezes -> os casos (10_casos.sql);
#   CONTRASTE 1 = a guarda: com o corpo da função diferente do medido, a migração aborta e nada muda;
#   CONTRASTE 2 = a verificação 4: com o REVOKE só de PUBLIC, authenticated fica com EXECUTE pelo privilégio padrão, e a migração aborta.
# Uso: run.sh [arquivo da migração]. REUSA_BASE=1 não reconstrói a base (as mutações). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261102000001_bloco_tributario_do_item.sql}; TS=$H/tabela-soberana
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_bloco_tributario}; B0=${D}_ts; BASE=${D}_base; G1=${D}_contraste1; G2=${D}_contraste2
if [ -z "$REUSA_BASE" ] || ! $P -At -c "select 1 from pg_database where datname = '$BASE'" | grep -q 1; then
  HARNESS_DB=$B0 BASE_SO=1 bash $TS/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: a base da tabela-soberana"; exit 2; }
  $P -c "drop database if exists $BASE" >/dev/null 2>&1; $P -c "create database $BASE template $B0" >/dev/null || { echo "BASE FALHOU: copia"; exit 2; }
  # o privilégio padrão de produção (pg_default_acl, medido em 02/11/2026) e a 20261101000002, aplicada em produção
  $P -d $BASE -v ON_ERROR_STOP=1 -c "alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role" >/dev/null 2>&1 \
    || { echo "BASE FALHOU: o privilegio padrao"; exit 2; }
  OUT=$($P -d $BASE -v ON_ERROR_STOP=1 -f $M/20261101000002_arquivo_em_da_tabela.sql 2>&1) || { echo "BASE FALHOU: a 20261101000002"; echo "$OUT" | grep ERROR | head -2; exit 2; }
  # itens de antes, com ipi, aliquota e custo — o caso 2 confere que a migração não os toca
  $P -d $BASE -v ON_ERROR_STOP=1 -c "insert into public.orcamentista_tabela_item (tabela_id, codigo, ipi, aliquota_interna_pct, custo)
    select t.id, 'ANTES-' || g, case when g % 2 = 0 then 5 end, 18, g * 10.5 from (select id from public.orcamentista_tabela order by id limit 1) t, generate_series(1, 5) g" >/dev/null 2>&1 \
    || { echo "BASE FALHOU: os itens de antes"; exit 2; }
fi
H0=$($P -d $BASE -At -c "select md5(replace(prosrc, E'\r', '')) from pg_proc where proname = 'importar_conteudo_da_tabela'")
[ "$H0" = "c412c59f708174d7a3a3f800aadd8e2c" ] || { echo "BASE FALHOU: a funcao da base nao e a de producao (md5 $H0)"; exit 2; }
for x in $D $G1 $G2; do $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }; done
$P -d $D -v ON_ERROR_STOP=1 -c "create table public.antes_da_migracao as select md5(string_agg(id::text || coalesce(ipi::text,'~') || coalesce(aliquota_interna_pct::text,'~') || coalesce(custo::text,'~'), ',' order by id)) v from public.orcamentista_tabela_item" >/dev/null
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done

contrastes() {
# CONTRASTE 1: o corpo da função diferente do medido (uma linha de comentário a mais) — a guarda aborta, e nem a coluna nem a função mudam
$P -d $G1 -v ON_ERROR_STOP=1 -At -c "select pg_get_functiondef('public.importar_conteudo_da_tabela(uuid, jsonb)'::regprocedure)" \
  | sed 's/^BEGIN$/BEGIN\n  -- uma mudanca que a migracao nao conhece/' > /tmp/harness-bt-fn.sql
$P -d $G1 -v ON_ERROR_STOP=1 -f /tmp/harness-bt-fn.sql >/dev/null 2>&1 || { echo "ERROR:  FALHOU contraste 1: nao consegui mudar o corpo"; return; }
local SAI; SAI=$($P -d $G1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
local RESTO; RESTO=$($P -d $G1 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_tabela_item' and column_name like 'cred_%'")
if echo "$SAI" | grep -q "ERROR:  guarda: o corpo de importar_conteudo_da_tabela nao e o medido" && [ "$RESTO" = "0" ]; then
  echo "NOTICE:  ok: contraste 1 — com o corpo da funcao diferente do medido, a guarda aborta e nada muda"
else echo "ERROR:  FALHOU contraste 1: saida=$(echo "$SAI" | grep ERROR | head -1) colunas=$RESTO"; fi
# CONTRASTE 2: o REVOKE só de PUBLIC — com o privilégio padrão de produção, a verificação 4 aborta, e nada muda
if ! grep -q '^DO \$verifica\$' "$MIG"; then echo "NOTICE:  ok: contraste 2 — sem o bloco \$verifica\$, nao se aplica (o caso 9 confere o privilegio)"; return; fi
local SO_PUBLIC; SO_PUBLIC=$(mktemp --suffix=.sql)
sed 's/^REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC, anon, authenticated;$/REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC;/' "$MIG" > "$SO_PUBLIC"
if cmp -s "$MIG" "$SO_PUBLIC"; then echo "ERROR:  FALHOU contraste 2: a linha do REVOKE nao foi achada"; return; fi
# o privilégio padrão só age em função NOVA; a de produção já existe, então o contraste a recria do zero antes (como se nascesse hoje)
$P -d $G2 -v ON_ERROR_STOP=1 -At -c "select pg_get_functiondef('public.importar_conteudo_da_tabela(uuid, jsonb)'::regprocedure)" > /tmp/harness-bt-fn2.sql
$P -d $G2 -v ON_ERROR_STOP=1 -c "drop function public.importar_conteudo_da_tabela(uuid, jsonb)" -f /tmp/harness-bt-fn2.sql >/dev/null 2>&1 || { echo "ERROR:  FALHOU contraste 2: recriar"; return; }
SAI=$($P -d $G2 -v ON_ERROR_STOP=1 -f "$SO_PUBLIC" 2>&1)
RESTO=$($P -d $G2 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_tabela_item' and column_name like 'cred_%'")
if echo "$SAI" | grep -q "ERROR:  verificacao 4: o EXECUTE de importar_conteudo_da_tabela nao e so de service_role" && [ "$RESTO" = "0" ]; then
  echo "NOTICE:  ok: contraste 2 — o REVOKE so de PUBLIC aborta na verificacao 4, e nada muda"
else echo "ERROR:  FALHOU contraste 2: saida=$(echo "$SAI" | grep ERROR | head -1) colunas=$RESTO"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $G1 $G2; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
