#!/bin/bash
# HARNESS da migracao 20261118000003 (o uso da transcricao de audio). NAO TOCA PRODUCAO.
#   D = base + a migracao DUAS vezes -> os casos (10_casos.sql), com a RLS provada por papel (empresa A, empresa B, super admin, anon);
#   contraste 1: sem get_auth_tenant_id() -> a guarda aborta com a frase da dependencia, e nenhuma tabela fica;
#   contraste 2: uma audio_transcription_usage de outro desenho ja existe -> a guarda aborta, e ela fica como estava.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261118000003_uso_da_transcricao_de_audio.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_uso_da_transcricao}; C1=${D}_c1; C2=${D}_c2
for x in $D $C1 $C2; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR" | head -3; exit 2; }
done
for i in 1 2; do OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|CONTEXT" | head -4; exit 2; }; done
contrastes() {
# CONTRASTE 1
$P -d $C1 -c "drop function public.get_auth_tenant_id()" >/dev/null 2>&1
local SAI; SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
local RESTO; RESTO=$($P -d $C1 -At -c "select count(*) from pg_class where relname like 'audio_transcription%' and relkind = 'r'")
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: public.get_auth_tenant_id() ou public.is_super_admin()" && [ "$RESTO" = "0" ]; then echo "NOTICE:  ok: contraste 1 — sem a funcao de RLS, a guarda aborta e nada fica"
else echo "ERROR:  FALHOU contraste 1: $(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
# CONTRASTE 2
$P -d $C2 -c "create table public.audio_transcription_usage (x int)" >/dev/null 2>&1
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
RESTO=$($P -d $C2 -At -c "select count(*) from information_schema.columns where table_name = 'audio_transcription_usage'")
if echo "$SAI" | grep -q "ERROR:  audio_transcription_usage ja existe e nao e desta migracao" && [ "$RESTO" = "1" ]; then echo "NOTICE:  ok: contraste 2 — a tabela de outro desenho aborta na guarda, e fica como estava"
else echo "ERROR:  FALHOU contraste 2: $(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; contrastes) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $C1 $C2; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
