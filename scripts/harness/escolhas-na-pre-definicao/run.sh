#!/bin/bash
# HARNESS da coluna escolhas (migração 20261025000001). NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local dos outros harness desta pasta (ver o README de `../tres-niveis/`).
# Monta a tabela como em produção, aplica DUAS VEZES a migração dada, confere que a segunda deixou o
# schema e os dados idênticos, e roda os casos.
# Uso:   run.sh [arquivo da migração]      (sem argumento: a do repositório)
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261025000001_escolhas_na_pre_definicao.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
DUMP="pg_dump -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -s"
D=harness_escolhas_na_pre_definicao
TMP=$(mktemp -d)
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
$P -d $D -v ON_ERROR_STOP=1 -f $S/00_como_em_producao.sql >/dev/null 2>&1 || { echo "BASE FALHOU"; exit 2; }
DADOS="SELECT id, coalesce(escolhas::text, 'NULL'), estado FROM orcamentista_pre_definicao ORDER BY id"
for vez in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "MIGRACAO ABORTOU na aplicação $vez: $(echo "$OUT" | grep -E 'ERROR' | head -2)"; exit 3; }
  $DUMP $D | grep -vE '^\\(un)?restrict ' > $TMP/dump-$vez.sql
  $P -d $D -At -c "$DADOS" > $TMP/dados-$vez.txt
done
diff -q $TMP/dump-1.sql $TMP/dump-2.sql >/dev/null && echo "ok: a migração aplicada duas vezes deixa o schema IDÊNTICO" || { echo "FALHOU: a segunda aplicação mudou o schema"; exit 1; }
diff -q $TMP/dados-1.txt $TMP/dados-2.txt >/dev/null && echo "ok: a segunda aplicação deixa os DADOS idênticos" || { echo "FALHOU: a segunda aplicação mudou os dados"; exit 1; }
# O filtro lê a linha inteira: erro que não começa com FALHOU aparece como ERRO NAO PREVISTO.
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
