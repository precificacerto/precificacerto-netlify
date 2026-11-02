#!/bin/bash
# HARNESS da migração 20261101000002 ("Subido em" = arquivo_em). NÃO TOCA PRODUÇÃO.
# Base: a da tabela-soberana (as migrações REAIS até a 20261101000001, com o estado medido em produção), construída por ela com BASE_SO=1.
# Depois, duas cópias:
#   D  = base + o estado de produção de 01/11/2026 depois das 21:08 (09_estado.sql) + esta migração DUAS vezes -> os casos desta (10_casos.sql);
#   RG = base + esta migração DUAS vezes -> os casos da tabela-soberana e da catalogo-soberano (regressão: o arrasto não muda com a coluna e o gatilho).
# E o contraste da reaplicação: uma tabela criada DEPOIS da primeira aplicação não é semeada nem logada, e a verificação não aborta.
# Uso: run.sh [arquivo da migração]. REUSA_BASE=1 não reconstrói a base (as mutações). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261101000002_arquivo_em_da_tabela.sql}; TS=$H/tabela-soberana; CS=$H/catalogo-soberano
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_arquivo_em}; BASE=${D}_base; RG=${D}_regressao; GC=${D}_contraste
if [ -z "$REUSA_BASE" ] || ! $P -At -c "select 1 from pg_database where datname = '$BASE'" | grep -q 1; then
  HARNESS_DB=$BASE BASE_SO=1 bash $TS/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: a base da tabela-soberana"; exit 2; }
fi
# o PRIVILÉGIO PADRÃO de funções do schema public, como em produção (medido em 02/11/2026, pg_default_acl): o que o postgres cria dá EXECUTE a
# authenticated e service_role por grant PRÓPRIO, não herdado de PUBLIC. Sem isto, o REVOKE só de PUBLIC passava aqui e abortava lá (02/11/2026).
$P -d $BASE -v ON_ERROR_STOP=1 -c "alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role" >/dev/null 2>&1 \
  || { echo "BASE FALHOU: o privilegio padrao"; exit 2; }
G2=${D}_contraste2
for x in $D $RG $GC $G2; do $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }; done
OUT=$($P -d $D -v ON_ERROR_STOP=1 -f $S/09_estado.sql 2>&1) || { echo "BASE FALHOU: o estado"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
for db in $D $RG; do for i in 1 2; do
  OUT=$($P -d $db -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao em $db (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done; done

contrastes() {
# CONTRASTE 1: aplicada uma vez, uma tabela nova nasce (com arquivo_em pelo gatilho), e a reaplicação nem a semeia nem a loga, nem aborta
$P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "ERROR:  FALHOU contraste 1: a primeira aplicacao"; return; }
$P -d $GC -v ON_ERROR_STOP=1 -c "insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x/arquivo/nova.xlsx', 'nova.xlsx', 'PVC', 'REFORCO')" >/dev/null 2>&1 \
  || { echo "ERROR:  FALHOU contraste 1: a tabela nova nao entrou"; return; }
local L1; L1=$($P -d $GC -At -c "select count(*) from public.superadmin_alteracao_log where antes ->> 'migracao' = '20261101000002_arquivo_em_da_tabela'")
local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "ERROR:  FALHOU contraste 1: a reaplicacao abortou: $(echo "$SAI" | grep ERROR | head -1)"; return; }
local L2; L2=$($P -d $GC -At -c "select count(*) from public.superadmin_alteracao_log where antes ->> 'migracao' = '20261101000002_arquivo_em_da_tabela'")
local T; T=$($P -d $GC -At -c "select count(*) from public.orcamentista_tabela")
if [ "$L1" = "$T" ] || [ "$L1" != "$L2" ] || [ "$(( T - 1 ))" != "$L1" ]; then echo "ERROR:  FALHOU contraste 1: log $L1 -> $L2, tabelas $T"; return; fi
echo "NOTICE:  ok: contraste 1 — a tabela criada entre as aplicacoes nao e semeada nem logada, e a reaplicacao nao aborta ($L1 logs, $T tabelas)"
# CONTRASTE 2: a verificação 3 — com o REVOKE só de PUBLIC (a versão que abortou em produção em 02/11/2026), authenticated fica com EXECUTE pelo
# privilégio padrão, e a migração aborta com a frase; nada muda (nem coluna, nem função, nem log)
# (sem o bloco $verifica$ — a segunda passada das mutações — não há frase a esperar: quem pega o REVOKE só de PUBLIC ali é o caso 8)
if ! grep -q '^DO \$verifica\$' "$MIG"; then echo "NOTICE:  ok: contraste 2 — sem o bloco \$verifica\$, nao se aplica (o caso 8 confere o privilegio)"; return; fi
local SO_PUBLIC; SO_PUBLIC=$(mktemp --suffix=.sql)
sed 's/^REVOKE ALL ON FUNCTION public.orcamentista_tabela_arquivo_em() FROM PUBLIC, anon, authenticated;$/REVOKE ALL ON FUNCTION public.orcamentista_tabela_arquivo_em() FROM PUBLIC;/' "$MIG" > "$SO_PUBLIC"
if cmp -s "$MIG" "$SO_PUBLIC"; then echo "ERROR:  FALHOU contraste 2: a linha do REVOKE nao foi achada na migracao"; return; fi
SAI=$($P -d $G2 -v ON_ERROR_STOP=1 -f "$SO_PUBLIC" 2>&1)
local RESTO; RESTO=$($P -d $G2 -At -c "select (select count(*) from information_schema.columns where table_name = 'orcamentista_tabela' and column_name = 'arquivo_em')
  + (select count(*) from pg_proc where proname = 'orcamentista_tabela_arquivo_em') + (select count(*) from public.superadmin_alteracao_log where antes ->> 'migracao' = '20261101000002_arquivo_em_da_tabela')")
if echo "$SAI" | grep -q "ERROR:  verificacao 3: a funcao orcamentista_tabela_arquivo_em esta aberta a anon ou authenticated" && [ "$RESTO" = "0" ]; then
  echo "NOTICE:  ok: contraste 2 — o REVOKE so de PUBLIC aborta na verificacao 3 (authenticated tem EXECUTE pelo privilegio padrao), e nada muda"
else echo "ERROR:  FALHOU contraste 2: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; cd $TS && $P -d $RG -f 10_casos.sql 2>&1; cd $CS && $P -d $RG -f 10_casos.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^-- CASO " $TS/10_casos.sql) + $(grep -c "^-- CASO " $CS/10_casos.sql) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $RG $GC $G2; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
