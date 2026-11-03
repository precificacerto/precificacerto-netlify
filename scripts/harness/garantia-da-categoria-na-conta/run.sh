#!/bin/bash
# HARNESS da migração 20261103000001 (a categoria da família chega na conta). NÃO TOCA PRODUÇÃO.
# Base: o banco final do harness das categorias (scripts/harness/categorias-do-catalogo: a cadeia real até a 20261102000002 aplicada, como em
# produção) + a superadmin_gravar_materia_prima de produção (corpos-de-producao/, md5 igual ao medido em 02/11/2026) + 09_estado.sql (a VEDACAO
# criada e marcada na PVC pelas funções de hoje: a falta medida em produção). A base confere que os quatro corpos que a migração troca têm os md5
# de produção, e que a falta é a de produção (uma linha).
# Depois: D = base + a migração DUAS vezes -> os casos (10_casos.sql), as corridas (20_corrida.sh) e as guardas (cada uma numa cópia da base com
# o estado que a dispara: aborta com a frase e nada muda).
# Uso: run.sh [arquivo da migração]. REUSA_BASE=1 não reconstrói a base. VEZES=1 aplica uma vez (as mutações). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261103000001_garantia_da_categoria_na_conta.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_garantia}; CAT=${D}_cat; BASE=${D}_base; GC=${D}_guarda
if [ -z "$REUSA_BASE" ] || ! $P -At -c "select 1 from pg_database where datname = '$BASE'" | grep -q 1; then
  HARNESS_DB=$CAT bash $H/categorias-do-catalogo/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: o harness das categorias"; exit 2; }
  $P -c "drop database if exists $BASE" >/dev/null 2>&1; $P -c "create database $BASE template $CAT" >/dev/null || { echo "BASE FALHOU: copia"; exit 2; }
  F=$(mktemp --suffix=.sql)
  { printf 'CREATE OR REPLACE FUNCTION public.superadmin_gravar_materia_prima(p_tenant uuid, p_por uuid, p_lista jsonb) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, pg_temp\nAS $fn$'
    cat $S/corpos-de-producao/superadmin_gravar_materia_prima.sql
    printf '$fn$;\nREVOKE ALL ON FUNCTION public.superadmin_gravar_materia_prima(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.superadmin_gravar_materia_prima(uuid, uuid, jsonb) TO service_role;\n'; } > $F
  for f in $F $S/09_estado.sql; do
    OUT=$($P -d $BASE -v ON_ERROR_STOP=1 -f "$f" 2>&1) || { echo "BASE FALHOU: $f"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  done
  for x in $CAT ${CAT}_base; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
fi
# os quatro corpos que a migração troca são os de produção (medidos em 02/11/2026)
H0=$($P -d $BASE -At -c "select string_agg(proname || '=' || md5(replace(prosrc, E'\r', '')), ',' order by proname) from pg_proc where proname in ('superadmin_criar_familia', 'superadmin_editar_familia', 'superadmin_definir_familia_da_materia_prima', 'superadmin_gravar_materia_prima')")
[ "$H0" = "superadmin_criar_familia=aa90f740d27a6f55902fd58a643c29dd,superadmin_definir_familia_da_materia_prima=e7e49ec7a9eef706f49e5ea635543435,superadmin_editar_familia=2553cf7ce56248b9ad376839c4a4adca,superadmin_gravar_materia_prima=49ffa56e7614f115aefc5d00d4881e3f" ] \
  || { echo "BASE FALHOU: os corpos na base nao sao os de producao ($H0)"; exit 2; }
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in $(seq 1 ${VEZES:-2}); do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done

# as GUARDAS: cada uma numa cópia da base com o estado que a dispara; aborta com a frase, e nada muda (criar_familia segue a de produção; a falta continua)
nada_mudou() { [ "$($P -d $1 -At -c "select md5(replace(prosrc, E'\\r', '')) from pg_proc where proname = 'superadmin_criar_familia'")" = "aa90f740d27a6f55902fd58a643c29dd" ] \
  && [ "$($P -d $1 -At -c "select count(*) from orcamentista_mp_categoria where categoria_chave = 'VEDACAO'")" = "0" ]; }
guarda() { # $1 número, $2 o SQL que monta o estado, $3 a frase esperada, $4 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $BASE" >/dev/null
  [ -n "$2" ] && { $P -d $GC -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1 || { echo "ERROR:  FALHOU guarda $1: o estado nao montou"; return; }; }
  local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -qF "$3" && nada_mudou $GC; then echo "NOTICE:  ok: guarda $1 — $4"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
guardas() {
guarda 1 "create or replace function public.superadmin_editar_familia(p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]) returns jsonb language plpgsql security definer set search_path = public, pg_temp as \$x\$ begin return '{}'::jsonb; end \$x\$;" \
  "public.superadmin_editar_familia(uuid, text, text, text[]): md5 " "um corpo diferente do lido em producao: aborta nomeando a funcao e o md5"
guarda 2 "insert into public.orcamentista_materia_prima (id, tenant_id, nome, familia) values ('c2000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'PVC da B', 'PVC');" \
  "guarda: faltam linhas de orcamentista_mp_categoria alem da VEDACAO da De Paula: Vidraçaria B / PVC da B (c2000000-0000-0000-0000-00000000000b) / PERFIL" "outra falta alem da medida: aborta nomeando-a (o cabecalho nunca diz menos do que a migracao grava)"
guarda 3 "create function public.orcamentista_garantir_categorias_da_familia(p_por uuid, p_familia text, p_materia_prima uuid, p_origem text) returns integer language sql as \$x\$ select 0 \$x\$;" \
  "public.orcamentista_garantir_categorias_da_familia: ja existe com outro corpo" "a auxiliar ja existe com outro corpo: aborta"
local VAZIO=${D}_vazio
$P -c "drop database if exists $VAZIO" >/dev/null 2>&1; $P -c "create database $VAZIO" >/dev/null
SAI=$($P -d $VAZIO -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "dependencia ausente no banco $VAZIO" && echo "$SAI" | grep -q "public.superadmin_editar_familia(uuid, text, text, text\[\]): nao existe" \
   && [ "$($P -d $VAZIO -At -c "select count(*) from pg_proc where proname like 'orcamentista_%'")" = "0" ]; then
  echo "NOTICE:  ok: guarda 4 — um banco sem as funcoes (o projeto errado): aborta nomeando o banco e cada funcao que nao existe"
else echo "ERROR:  FALHOU guarda 4: $(echo "$SAI" | grep ERROR | head -1)"; fi
$P -c "drop database if exists $VAZIO" >/dev/null 2>&1
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guardas) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + $(grep -c "^guarda [0-9]" $S/run.sh) + 1 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
$P -c "drop database if exists $GC" >/dev/null 2>&1
[ "$OKS" = "$ESPERADO" ] || exit 1
