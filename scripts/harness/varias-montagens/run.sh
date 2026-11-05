#!/bin/bash
# HARNESS da migração 20261105000001 (várias montagens por remetente: cai o índice um_em_montagem). NÃO TOCA PRODUÇÃO.
# Base: o banco mínimo do harness `levantamento-por-nome` + a 20261025000003 (que cria a tabela e o índice): o estado de produção em 05/11/2026.
#   D  = base + esta migração DUAS vezes (a segunda com o índice já ausente: DROP IF EXISTS) -> schema idêntico, e os casos (10_casos.sql);
#   contraste 1: o índice existe com OUTRA definição -> a guarda aborta com a frase, e o índice fica;
#   contraste 2: a base SEM a tabela -> a guarda aborta com a frase da dependência;
#   contraste 3: sobra um índice a mais na tabela -> a verificação 5 aborta, e o um_em_montagem NÃO cai (a transação volta).
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261105000001_varias_montagens_por_remetente.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
DUMP="pg_dump -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -s"
D=${HARNESS_DB:-harness_varias_montagens}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3
TMP=$(mktemp -d)
for x in $D $C1 $C2 $C3; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/../levantamento-por-nome/00_como_em_producao.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  if [ "$x" != "$C2" ]; then
    OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $M/20261025000003_levantamento_por_nome.sql 2>&1) || { echo "BASE FALHOU em $x: a 20261025000003"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  fi
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
  $DUMP $D | grep -vE '^\\(un)?restrict ' > $TMP/dump-$i.sql
done
idempotencia() { diff -q $TMP/dump-1.sql $TMP/dump-2.sql >/dev/null && echo "NOTICE:  ok: a migracao aplicada duas vezes deixa o schema IDENTICO" || echo "ERROR:  FALHOU: a segunda aplicacao mudou o schema"; }

contrastes() {
# CONTRASTE 1: o índice existe com OUTRA definição -> a guarda aborta com a frase, e o índice fica
$P -d $C1 -v ON_ERROR_STOP=1 -c "drop index public.orcamentista_levantamento_um_em_montagem; create unique index orcamentista_levantamento_um_em_montagem on public.orcamentista_levantamento (tenant_id, remetente_id)" >/dev/null 2>&1
local SAI; SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
local RESTO; RESTO=$($P -d $C1 -At -c "select count(*) from pg_indexes where indexname = 'orcamentista_levantamento_um_em_montagem'")
if echo "$SAI" | grep -q "ERROR:  orcamentista_levantamento_um_em_montagem existe com outra definicao: .*Nada foi alterado." && [ "$RESTO" = "1" ]; then
  echo "NOTICE:  ok: contraste 1 — o indice com outra definicao aborta na guarda, e fica"
else echo "ERROR:  FALHOU contraste 1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
# CONTRASTE 2: a base SEM a tabela -> a guarda aborta com a frase da dependência
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: public.orcamentista_levantamento. Nada foi alterado."; then
  echo "NOTICE:  ok: contraste 2 — sem a tabela, a guarda aborta com a frase da dependencia"
else echo "ERROR:  FALHOU contraste 2: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 3: um índice a mais na tabela -> a verificação 5 aborta, e o um_em_montagem NÃO cai (sem o bloco $verifica$ não há frase a esperar)
if ! grep -q '^DO \$verifica\$' "$MIG"; then echo "NOTICE:  ok: contraste 3 — sem o bloco \$verifica\$, nao se aplica"; else
$P -d $C3 -v ON_ERROR_STOP=1 -c "create index orcamentista_levantamento_extra_idx on public.orcamentista_levantamento (criado_em)" >/dev/null 2>&1
SAI=$($P -d $C3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
RESTO=$($P -d $C3 -At -c "select count(*) from pg_indexes where indexname = 'orcamentista_levantamento_um_em_montagem'")
if echo "$SAI" | grep -q "ERROR:  verificacao 5: orcamentista_levantamento tem 4 indice(s), e devia ter 3. Nada foi alterado." && [ "$RESTO" = "1" ]; then
  echo "NOTICE:  ok: contraste 3 — um indice a mais aborta na verificacao 5, e o um_em_montagem fica"
else echo "ERROR:  FALHOU contraste 3: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
fi
}
SAIDA=$( { idempotencia; $P -d $D -f $S/10_casos.sql 2>&1; contrastes; } | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
OK=$(echo "$SAIDA" | grep -c '^ok: '); TOTAL=$(echo "$SAIDA" | grep -c .)
echo "$OK de $TOTAL casos ok"
rm -rf $TMP
[ "$OK" = "$TOTAL" ] && [ "$TOTAL" = "11" ]
