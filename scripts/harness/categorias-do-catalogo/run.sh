#!/bin/bash
# HARNESS da migração 20261102000002 (as categorias ganham tela: criar, editar o rótulo e a sexta raiz do arrasto). NÃO TOCA PRODUÇÃO.
# Base: a da tabela-soberana (as migrações REAIS, com BASE_SO=1 — o estado de 31/10/2026 com a 20261031000003 e a 20261101000001) + o privilégio
# padrão de funções de produção + a 20261101000002 + a 20261102000001 (aplicadas em produção em 02/11/2026) + 09_estado.sql (o catálogo de campos,
# como em produção). A base confere que os cinco corpos do arrasto têm o md5 medido em produção em 02/11/2026.
# Depois:
#   D = base + a tabela de persianas (09_persianas.sql) + esta migração DUAS vezes -> os casos (10_casos.sql) e as corridas (20_corrida.sh);
#   R = base + esta migração -> a REGRESSÃO dos casos da 20261031000003 e da 20261101000001 (as cinco raízes de antes não mudam; sem a tabela de
#       persianas, que mudaria as contagens do fornecedor Wolf que aqueles casos afirmam);
#   as guardas, cada uma numa cópia da base com o estado que a dispara: aborta com a frase e nada muda.
# Uso: run.sh [arquivo da migração]. REUSA_BASE=1 não reconstrói a base (as mutações). VEZES=1 aplica uma vez (as mutações: o corpo mutado tem outro
# md5 e a guarda da reaplicação o recusaria — morte falsa). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261102000002_categorias_do_catalogo.sql}; TS=$H/tabela-soberana; CS=$H/catalogo-soberano
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_categorias}; B0=${D}_ts; BASE=${D}_base; GC=${D}_guarda; RG=${D}_regressao
if [ -z "$REUSA_BASE" ] || ! $P -At -c "select 1 from pg_database where datname = '$BASE'" | grep -q 1; then
  HARNESS_DB=$B0 BASE_SO=1 bash $TS/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: a base da tabela-soberana"; exit 2; }
  $P -c "drop database if exists $BASE" >/dev/null 2>&1; $P -c "create database $BASE template $B0" >/dev/null || { echo "BASE FALHOU: copia"; exit 2; }
  $P -d $BASE -v ON_ERROR_STOP=1 -c "alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role" >/dev/null 2>&1 \
    || { echo "BASE FALHOU: o privilegio padrao"; exit 2; }
  for f in $M/20261101000002_arquivo_em_da_tabela.sql $M/20261102000001_bloco_tributario_do_item.sql $S/09_estado.sql; do
    OUT=$($P -d $BASE -v ON_ERROR_STOP=1 -f "$f" 2>&1) || { echo "BASE FALHOU: $f"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  done
  $P -c "drop database if exists $B0" >/dev/null 2>&1
fi
# os cinco corpos do arrasto na base são os de produção (medidos em 02/11/2026)
H0=$($P -d $BASE -At -c "select string_agg(proname || '=' || md5(replace(prosrc, E'\r', '')), ',' order by proname) from pg_proc where proname in ('orcamentista_arrasto_passos', 'orcamentista_arrasto_conjuntos', 'orcamentista_arrasto_medir', 'superadmin_arrasto_do_catalogo', 'superadmin_remover_do_catalogo')")
[ "$H0" = "orcamentista_arrasto_conjuntos=790b7d036726b5944c801a58d7ddc5e9,orcamentista_arrasto_medir=c68e4124320ac56e658362a20d38af57,orcamentista_arrasto_passos=c5beabd1f3179b55d279f5c6d411502e,superadmin_arrasto_do_catalogo=353e8ee77a0e4f903c79b9846a54ce44,superadmin_remover_do_catalogo=24ade9ea78cb348ecd44658390d92bfd" ] \
  || { echo "BASE FALHOU: os corpos do arrasto na base nao sao os de producao ($H0)"; exit 2; }
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
$P -d $D -v ON_ERROR_STOP=1 -f $S/09_persianas.sql >/dev/null 2>&1 || { echo "BASE FALHOU: a tabela de persianas"; exit 2; }
for i in $(seq 1 ${VEZES:-2}); do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
$P -c "drop database if exists $RG" >/dev/null 2>&1; $P -c "create database $RG template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
OUT=$($P -d $RG -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao na copia da regressao"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }

# as GUARDAS: cada uma numa cópia com o estado que a dispara; aborta com a frase, e nada muda (o tipo 'categoria' continua desconhecido)
nada_mudou() { ! $P -d $1 -v ON_ERROR_STOP=1 -At -c "select public.orcamentista_arrasto_passos('categoria')" >/dev/null 2>&1 && [ "$($P -d $1 -At -c "select count(*) from pg_proc where proname = 'superadmin_criar_categoria'")" = "0" ]; }
guarda() { # $1 número, $2 o SQL que monta o estado, $3 a frase esperada, $4 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $BASE" >/dev/null
  [ -n "$2" ] && { $P -d $GC -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1 || { echo "ERROR:  FALHOU guarda $1: o estado nao montou"; return; }; }
  local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q "$3" && nada_mudou $GC; then echo "NOTICE:  ok: guarda $1 — $4"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
guardas() {
guarda 1 "create or replace function public.superadmin_arrasto_do_catalogo(p_tipo text, p_chave text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as \$x\$ begin return public.orcamentista_arrasto_medir(p_tipo, p_chave) || '{}'; end \$x\$;" \
  "public.superadmin_arrasto_do_catalogo(text, text): md5 d13965bec434c1efdad3d55fbaff8e70, esperado 353e8ee77a0e4f903c79b9846a54ce44" "um corpo do arrasto diferente do aplicado: aborta nomeando a funcao, o md5 achado e o esperado"
guarda 2 "update public.orcamentista_categoria_catalogo set rotulo = ' Perfil ' where chave = 'PERFIL';" \
  "ERROR:  guarda: categoria fora da forma que a migracao exige: PERFIL" "uma linha do catalogo fora da forma das CHECKs novas: aborta, nomeando-a"
guarda 3 "create table public.h_aponta_mp_categoria (i uuid references public.orcamentista_mp_categoria (id));" \
  "ERROR:  guarda: o fecho da remocao nao conhece estas chaves estrangeiras: h_aponta_mp_categoria -> orcamentista_mp_categoria" "uma tabela nova que aponta a categoria da familia de conta: aborta (o fecho nao a conhece)"
# o banco ERRADO (02/11/2026: a migracao foi colada no SQL Editor de OUTRO projeto, sem nenhuma funcao do arrasto): a guarda nomeia o banco e diz
# que as cinco nao existem, em vez de "corpos: {}"
local VAZIO=${D}_vazio
$P -c "drop database if exists $VAZIO" >/dev/null 2>&1; $P -c "create database $VAZIO" >/dev/null
SAI=$($P -d $VAZIO -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "dependencia ausente no banco $VAZIO" && echo "$SAI" | grep -q "orcamentista_arrasto_conjuntos(text, text): nao existe" \
   && echo "$SAI" | grep -q "superadmin_remover_do_catalogo(uuid, text, text, text): nao existe" && [ "$($P -d $VAZIO -At -c "select count(*) from pg_proc where proname like 'superadmin_%'")" = "0" ]; then
  echo "NOTICE:  ok: guarda 4 — um banco sem nenhuma funcao do arrasto (o projeto errado): aborta nomeando o banco e cada funcao que nao existe"
else echo "ERROR:  FALHOU guarda 4: $(echo "$SAI" | grep ERROR | head -1)"; fi
$P -c "drop database if exists $VAZIO" >/dev/null 2>&1
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; cd $CS && $P -d $RG -f 10_casos.sql 2>&1; cd $TS && $P -d $RG -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guardas) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^-- CASO " $CS/10_casos.sql) + $(grep -c "^-- CASO " $TS/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + $(grep -c "^guarda [0-9]" $S/run.sh) + 1 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
$P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "drop database if exists $RG" >/dev/null 2>&1
[ "$OKS" = "$ESPERADO" ] || exit 1
