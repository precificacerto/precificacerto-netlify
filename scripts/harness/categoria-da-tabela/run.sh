#!/bin/bash
# HARNESS da categoria da tabela de fornecedor (20261027000005). NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local dos outros harness desta pasta (ver o README de `../tres-niveis/`).
#
# Monta uma réplica do que a migração toca, como a consulta a produção devolveu em 27/10/2026
# (`05_estado_de_producao.sql`), aplica a migração DUAS VEZES (idempotência) e roda os casos.
#
# Uso:   run.sh [arquivo da migração]      (sem argumento: a do repositório — o argumento é como as mutações trocam por uma cópia estragada)
# Saída: uma linha `ok:` ou `FALHOU:` por caso, e "N de M casos ok". Sai com 1 se faltar ok; com 2 se a base/migração abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261027000005_categoria_da_tabela_de_fornecedor.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=harness_categoria_da_tabela
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $S/05_estado_de_producao.sql "$MIG" "$MIG"; do
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
