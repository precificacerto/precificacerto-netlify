#!/bin/bash
# HARNESS da opção no catálogo (migração 20261024000002). NÃO TOCA PRODUÇÃO.
# Como subir o Postgres local e o que cada mutação derruba: ver o README desta pasta.
#
# Monta o banco mínimo (`../base-de-conhecimento/00_base.sql` + `../tres-niveis/01_pre.sql`),
# aplica as migrações de que esta depende — 20261022000003, 20261022000004, 20261023000001,
# 20261023000002 e 20261023000003 —, reproduz o estado de produção (`05_como_em_producao.sql`:
# o mojibake e uma empresa com PERFIL já configurado), aplica DUAS VEZES a migração dada, confere
# que a segunda deixou o schema idêntico e roda os casos (`10_casos.sql`).
#
# Uso:   run.sh [arquivo da migração]      (sem argumento: a do repositório)
#        SO_APLICAR=1 run.sh <arquivo>     (só as duas aplicações — é o que as mutações V usam)
# Saída: uma linha `ok:` ou `FALHOU:` por caso, e "N de M casos ok". Sai com 1 se faltar ok.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261024000002_opcao_no_catalogo_e_criterio_da_barra.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
DUMP="pg_dump -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -s"
D=harness_opcao_catalogo
TMP=$(mktemp -d)
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $R/scripts/harness/base-de-conhecimento/00_base.sql \
         $R/supabase/migrations/20261022000003_employees_unique_id_tenant.sql \
         $R/supabase/migrations/20261022000004_atendimentos_ia_base_de_conhecimento.sql \
         $R/supabase/migrations/20261023000001_funcoes_da_base_de_conhecimento.sql \
         $R/scripts/harness/tres-niveis/01_pre.sql \
         $R/supabase/migrations/20261023000002_base_conhecimento_tres_niveis.sql \
         $R/supabase/migrations/20261023000003_funcoes_dos_tres_niveis.sql \
         $S/05_como_em_producao.sql; do
  $P -d $D -v ON_ERROR_STOP=1 -f $f >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f $f 2>&1 | grep ERROR | head -3; exit 2; }
done
# TEXTO_CERTO_COM_A_TIL=1: um rótulo de campo CORRETO com "Ã" maiúsculo, que a verificação 3a não pode
# acusar (`06_texto_certo_com_a_til.sql`). É o caso que a produção ainda não tem, e que a verificação
# antiga, por chr(195) sozinho, recusaria.
if [ -n "$TEXTO_CERTO_COM_A_TIL" ]; then
  $P -d $D -v ON_ERROR_STOP=1 -f $S/06_texto_certo_com_a_til.sql >/dev/null 2>&1 || { echo "BASE FALHOU: 06_texto_certo_com_a_til.sql"; exit 2; }
fi
for vez in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "MIGRACAO ABORTOU na aplicação $vez: $(echo "$OUT" | grep -E 'ERROR' | head -2)"; exit 3; }
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
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
