#!/bin/bash
# HARNESS da ÁRVORE NUMA TRANSAÇÃO (migração 20261023000004). NÃO TOCA PRODUÇÃO.
# Como subir o Postgres local e o que cada mutação derruba: ver o README desta pasta.
#
# Monta o banco mínimo (`../base-de-conhecimento/00_base.sql` + `../tres-niveis/01_pre.sql`) e
# aplica, nesta ordem, as migrações de que esta depende: 20261022000003, 20261022000004,
# 20261023000001, 20261023000002 e 20261023000003 (as sete funções). Aplica DUAS VEZES a migração
# dada, confere que a segunda deixou o schema idêntico, e roda os casos (`10_casos.sql`), a
# concorrência (`20_concorrencia.sh`, dois casos) e a atomicidade (`30_atomicidade.sh`).
#
# Uso:   run.sh [arquivo da migração]      (sem argumento: a do repositório)
#        SO_APLICAR=1 run.sh <arquivo>     (só as duas aplicações — é o que as mutações V usam)
#        SEM_AS_SETE=1 run.sh              (sem a 20261023000003: a migração tem de ABORTAR)
# Saída: uma linha `ok:` ou `FALHOU:` por caso, e "N de M casos ok". Sai com 1 se faltar ok.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261023000004_gravar_arvore.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
DUMP="pg_dump -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -s"
D=harness_arvore
TMP=$(mktemp -d)
AS_SETE=$R/supabase/migrations/20261023000003_funcoes_dos_tres_niveis.sql
[ "$SEM_AS_SETE" = 1 ] && AS_SETE=
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $R/scripts/harness/base-de-conhecimento/00_base.sql \
         $R/supabase/migrations/20261022000003_employees_unique_id_tenant.sql \
         $R/supabase/migrations/20261022000004_atendimentos_ia_base_de_conhecimento.sql \
         $R/supabase/migrations/20261023000001_funcoes_da_base_de_conhecimento.sql \
         $R/scripts/harness/tres-niveis/01_pre.sql \
         $R/supabase/migrations/20261023000002_base_conhecimento_tres_niveis.sql \
         $AS_SETE; do
  $P -d $D -v ON_ERROR_STOP=1 -f $f >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f $f 2>&1 | grep ERROR | head -3; exit 2; }
done
for vez in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || {
    echo "MIGRACAO ABORTOU na aplicação $vez: $(echo "$OUT" | grep -E 'ERROR' | head -2)"
    # sem as sete, o aborto TEM de vir da guarda do começo, antes de criar qualquer coisa — o
    # bloco de verificação do fim também abortaria, e é por isso que a mensagem é o que distingue
    if [ "$SEM_AS_SETE" = 1 ]; then
      if echo "$OUT" | grep -q 'dependencia(s) ausente(s)'; then echo "ok: sem as sete, a migração aborta NA GUARDA das dependências"; exit 0
      else echo "FALHOU: sem as sete, a migração abortou FORA da guarda das dependências"; exit 1; fi
    fi
    exit 3; }
  $DUMP $D | grep -vE '^\\(un)?restrict ' > $TMP/dump-$vez.sql
done
if diff -q $TMP/dump-1.sql $TMP/dump-2.sql >/dev/null; then
  echo "ok: a migração aplicada duas vezes deixa o schema IDÊNTICO"
else
  echo "FALHOU: a segunda aplicação mudou o schema"; exit 1
fi
[ "$SO_APLICAR" = 1 ] && exit 0
# O FILTRO LÊ A LINHA INTEIRA: um erro que não começa com FALHOU aparece como ERRO NAO PREVISTO
# e não conta como caso verde (`instrumento-que-nao-enxerga.md`).
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
SAIDA="$SAIDA
$(bash $S/20_concorrencia.sh "$P" $D)
$(bash $S/30_atomicidade.sh "$P" $D)"
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + 3 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
