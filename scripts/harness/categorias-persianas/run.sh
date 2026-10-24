#!/bin/bash
# HARNESS do catálogo de categorias (migração 20261024000004). NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local dos outros harness desta pasta (subir uma vez por container: ver o README
# de `../tres-niveis/`). `PGHOST` e `PGPORT` trocam o endereço (padrão: `/tmp/harness-pg`, `54329`).
#
# Monta o banco mínimo e as migrações da base de conhecimento até a 20261024000002, reproduz o
# estado de produção (`05_como_em_producao.sql`), aplica DUAS VEZES a migração dada, confere que a
# segunda deixou o schema E os dados idênticos, e roda os casos (`10_casos.sql`).
#
# Uso:   run.sh [arquivo da migração]      (sem argumento: a do repositório)
# Saída: uma linha `ok:` ou `FALHOU:` por caso, e "N de M casos ok". Sai com 1 se faltar ok.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261024000004_categorias_persianas_e_reforco.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
DUMP="pg_dump -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -s"
D=harness_categorias_persianas
TMP=$(mktemp -d)
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $R/scripts/harness/base-de-conhecimento/00_base.sql \
         $R/supabase/migrations/20261022000003_employees_unique_id_tenant.sql \
         $R/supabase/migrations/20261022000004_atendimentos_ia_base_de_conhecimento.sql \
         $R/supabase/migrations/20261023000001_funcoes_da_base_de_conhecimento.sql \
         $R/scripts/harness/tres-niveis/01_pre.sql \
         $R/supabase/migrations/20261023000002_base_conhecimento_tres_niveis.sql \
         $R/supabase/migrations/20261023000003_funcoes_dos_tres_niveis.sql \
         $R/supabase/migrations/20261024000002_opcao_no_catalogo_e_criterio_da_barra.sql \
         $S/05_como_em_producao.sql; do
  $P -d $D -v ON_ERROR_STOP=1 -f $f >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f $f 2>&1 | grep ERROR | head -3; exit 2; }
done
DADOS="SELECT 'cat', ordem::text, chave, rotulo FROM orcamentista_categoria_catalogo
       UNION ALL SELECT 'mpc', id::text, categoria_chave, coalesce(config::text, 'NULL') || ' ' || coalesce(atualizado_por::text, '-') || ' ' || atualizado_em::text FROM orcamentista_mp_categoria
       UNION ALL SELECT 'campo', categoria_chave, chave, rotulo FROM orcamentista_categoria_campo ORDER BY 1, 2, 3"
for vez in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "MIGRACAO ABORTOU na aplicação $vez: $(echo "$OUT" | grep -E 'ERROR' | head -2)"; exit 3; }
  $DUMP $D | grep -vE '^\\(un)?restrict ' > $TMP/dump-$vez.sql
  $P -d $D -At -c "$DADOS" > $TMP/dados-$vez.txt
done
if diff -q $TMP/dump-1.sql $TMP/dump-2.sql >/dev/null; then
  echo "ok: a migração aplicada duas vezes deixa o schema IDÊNTICO"
else
  echo "FALHOU: a segunda aplicação mudou o schema"; exit 1
fi
if diff -q $TMP/dados-1.txt $TMP/dados-2.txt >/dev/null; then
  echo "ok: a segunda aplicação deixa os DADOS idênticos (catálogo, mp_categoria e campos, linha a linha)"
else
  echo "FALHOU: a segunda aplicação mudou os dados"; diff $TMP/dados-1.txt $TMP/dados-2.txt | head -5; exit 1
fi
# O FILTRO LÊ A LINHA INTEIRA: um erro que não começa com FALHOU aparece como ERRO NAO PREVISTO
# e não conta como caso verde (`instrumento-que-nao-enxerga.md`).
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
