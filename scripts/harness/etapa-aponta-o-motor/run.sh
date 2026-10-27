#!/bin/bash
# HARNESS das migrações 20261027000007 (motor só para PERFIL) e 20261027000008 (a etapa aponta o motor). NÃO TOCA PRODUÇÃO.
# Cadeia: a réplica de `../motor-da-familia/05_estado_de_producao.sql` -> complementos -> a 20261027000006 REAL -> as funções da
# 20261027000003 REAIS (cortadas do arquivo) -> o estado de antes -> a 000007 e a 000008, cada uma DUAS vezes -> os casos -> as corridas.
# Uso:   run.sh [arquivo da 000007 [arquivo da 000008]]   (os argumentos são como as mutações trocam por cópias estragadas)
# Sai com 1 se faltar ok; com 2 se a base/migração abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
M7=${1:-$R/supabase/migrations/20261027000007_motor_so_para_perfil.sql}
M8=${2:-$R/supabase/migrations/20261027000008_etapa_aponta_o_motor.sql}
F3=$R/supabase/migrations/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=harness_etapa_aponta_o_motor
FUN=$(mktemp --suffix=.sql)
# as duas funções de ANTES: do primeiro CREATE da gravação até o GRANT do arquivar (o texto real da 000003)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_gravar_etapas_da_familia/{on=1} on{print} /^GRANT EXECUTE ON FUNCTION public.superadmin_arquivar_motor/{on=0}' "$F3" > "$FUN"
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $S/../motor-da-familia/05_estado_de_producao.sql $S/06_complementos.sql $R/supabase/migrations/20261027000006_motor_da_familia.sql "$FUN" $S/08_estado_de_antes.sql "$M7" "$M7" "$M8" "$M8"; do
  $P -d $D -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep ERROR | head -3; exit 2; }
done
# O FILTRO LÊ A LINHA INTEIRA: um erro que não começa com FALHOU aparece como ERRO NAO PREVISTO e não conta como caso verde.
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + 2 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
