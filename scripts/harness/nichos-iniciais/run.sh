#!/bin/bash
# HARNESS da semente de nichos (20261019000003). NÃO TOCA PRODUÇÃO. Mesmo Postgres local de
# `../baixa-com-valor-diferente/run.sh`. Base: o schema do bloco 1, a migração do bloco 1, o
# Storage reduzido e a `20261019000001`; depois UM nicho criado "pela tela" com outra caixa
# ('esquadrias', com autor), e a semente aplicada DUAS vezes.
#
# Uso: run.sh <arquivo da semente>   Saída: `ok:` / `FALHOU:` por caso, e a contagem.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
$P -c 'drop database if exists harness_nichos' >/dev/null 2>&1; $P -c 'create database harness_nichos' >/dev/null
for f in $S/../orcamentista/00_schema.sql $R/supabase/migrations/20261018000001_orcamentista_bloco_1.sql $S/../atendimentos-ia-2b1/00_storage.sql $R/supabase/migrations/20261019000001_atendimentos_ia_bloco_2b1.sql; do
  $P -d harness_nichos -v ON_ERROR_STOP=1 -f $f >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; exit 2; }
done
$P -d harness_nichos -c "insert into public.orcamentista_nicho (modelo, nome, criado_por) values ('FABRICACAO', 'esquadrias', '00000000-0000-0000-0000-0000000000f1')" >/dev/null
for vez in 1 2; do
  $P -d harness_nichos -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "FALHOU: a semente não rodou na vez $vez"; $P -d harness_nichos -v ON_ERROR_STOP=1 -f "$1" 2>&1 | grep ERROR | head -2; exit 1; }
done
SAIDA=$($P -d harness_nichos -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/10_casos.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
