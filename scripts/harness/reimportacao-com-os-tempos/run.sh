#!/bin/bash
# HARNESS da reimportação com os tempos na tabela própria. NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local dos outros harness desta pasta (ver o README de `../tres-niveis/`).
#
# Monta o banco do Atendimentos I.A. (o mesmo de `../tempo-em-tabela-propria/`), reproduz o estado de
# produção de 25/10/2026 (`05_estado_de_producao.sql`: 164 tempos ESTIMADO, soma 87.300, nas colunas
# antigas), aplica a 20261024000003 (que os copia para a tabela nova) e a 20261025000004 (a função de
# importação vigente), e roda os casos (`10_casos.sql`): uma reimportação COMPLETA roda até o fim e os
# 164 tempos continuam lá.
#
# Uso:   run.sh [arquivo da 20261025000004]      (sem argumento: a do repositório)
#        — o argumento é como as mutações trocam a função de importação por uma cópia estragada.
# Saída: uma linha `ok:` ou `FALHOU:` por caso, e "N de M casos ok". Sai com 1 se faltar ok.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$S/../tempo-em-tabela-propria
IMP=${1:-$R/supabase/migrations/20261025000004_abas_do_motor_por_tipologia.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=harness_reimportacao_com_os_tempos
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $S/../orcamentista/00_schema.sql \
         $R/supabase/migrations/20261018000001_orcamentista_bloco_1.sql \
         $S/../atendimentos-ia-2b1/00_storage.sql \
         $R/supabase/migrations/20261019000001_atendimentos_ia_bloco_2b1.sql \
         $R/supabase/migrations/20261020000001_atendimentos_ia_importacao.sql \
         $R/supabase/migrations/20261020000002_importar_conteudo_da_tabela.sql \
         $R/supabase/migrations/20261024000001_tempo_de_fabricacao_por_tipologia.sql \
         $S/05_estado_de_producao.sql \
         $R/supabase/migrations/20261024000003_tempo_da_tipologia_em_tabela_propria.sql \
         "$IMP"; do
  $P -d $D -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep ERROR | head -3; exit 2; }
done
# O FILTRO LÊ A LINHA INTEIRA: um erro que não começa com FALHOU aparece como ERRO NAO PREVISTO e não
# conta como caso verde (`instrumento-que-nao-enxerga.md`).
SAIDA=$(cd $S && $P -d $D -f 10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
