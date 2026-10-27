#!/bin/bash
# HARNESS da migração 20261027000009 (sai a CHECK `orcamentista_tabela_perfil_exige_motor`). NÃO TOCA PRODUÇÃO.
# Cadeia: a réplica de `../motor-da-familia/05_estado_de_producao.sql` -> complementos -> a 20261027000006 REAL -> a categoria
# (20261027000005 REAL) -> a 20261027000007 REAL (como está aplicada em produção) -> o estado de antes (a Estrela vazia, a FOTO) -> a 000009,
# DUAS vezes -> os casos.
# Uso:   run.sh [arquivo da 000009]   (o argumento é como as mutações trocam por cópias estragadas)
# Sai com 1 se faltar ok; com 2 se a base/migração abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
M9=${1:-$R/supabase/migrations/20261027000009_tira_perfil_exige_motor.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=harness_perfil_sem_motor_obrigatorio
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $S/../motor-da-familia/05_estado_de_producao.sql $S/../etapa-aponta-o-motor/06_complementos.sql $R/supabase/migrations/20261027000005_categoria_da_tabela_de_fornecedor.sql $R/supabase/migrations/20261027000006_motor_da_familia.sql $R/supabase/migrations/20261027000007_motor_so_para_perfil.sql $S/08_estado_de_antes.sql "$M9" "$M9"; do
  $P -d $D -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep ERROR | head -3; exit 2; }
done
# O FILTRO LÊ A LINHA INTEIRA: um erro que não começa com FALHOU aparece como ERRO NAO PREVISTO e não conta como caso verde.
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
