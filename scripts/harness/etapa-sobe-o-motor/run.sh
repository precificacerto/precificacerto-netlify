#!/bin/bash
# HARNESS da migração 20261027000010 (a etapa sobe o motor, e o título da família é digitado). NÃO TOCA PRODUÇÃO.
# Cadeia: a cadeia REAL de migrações (a mesma ordem de produção; o que a pasta não traz vem dos stubs e dos complementos) até a 000009
# -> o estado de antes -> a 000010 DUAS vezes -> os casos -> as corridas.
# Uso:   run.sh [arquivo da 000010]   (o argumento é como as mutações trocam por cópias estragadas)
# Sai com 1 se faltar ok; com 2 se a base/migração abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
M10=${1:-$M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_etapa_sobe_o_motor}
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $S/05_stubs.sql $S/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $S/08_estado_de_antes.sql "$M10" "$M10"; do
  $P -d $D -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
# O FILTRO LÊ A LINHA INTEIRA: um erro que não começa com FALHOU aparece como ERRO NAO PREVISTO e não conta como caso verde.
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + 3 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
