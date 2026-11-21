#!/bin/bash
# HARNESS da migração 20261115000001 (o DELETE com "WHERE true" na importação do índice dos desenhos). NÃO TOCA PRODUÇÃO.
# Base: a do harness da 20261111000001 (00_base.sql) + a 20261111000001 aplicada (o estado de produção ANTES de 15/11). Depois: a migração DUAS
# vezes, os casos e as guardas. A extensão safeupdate NÃO existe no Postgres local: a prova de que o "WHERE true" passa por ela é a importação
# de produção de 15/11/2026 21:22:35 UTC (3.190 linhas, log com 'migracao' = '20261115000001'); aqui se prova o resto.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base ou a migração abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261115000001_importar_desenhos_where_true.sql}
ANTES=$R/supabase/migrations/20261111000001_desenhos_das_tipologias.sql
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_where_true}
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || exit 2
$P -d $D -v ON_ERROR_STOP=1 -f $R/scripts/harness/desenhos-das-tipologias/00_base.sql >/dev/null 2>&1 || { echo "BASE FALHOU"; exit 2; }
$P -d $D -v ON_ERROR_STOP=1 -f "$ANTES" >/dev/null 2>&1 || { echo "A 20261111000001 FALHOU"; exit 2; }
OKS=0; FALHAS=0
ok() { echo "ok: $1"; OKS=$((OKS+1)); }
falha() { echo "FALHOU: $1"; FALHAS=$((FALHAS+1)); }
q() { $P -d $D -At -c "$1" 2>&1; }

# a importação de antes, para haver o que apagar
q "select superadmin_importar_desenhos(null, repeat('a', 64), '[{\"fonte\":\"principal\",\"codigo\":\"A1\"},{\"fonte\":\"principal\",\"codigo\":\"A2\"},{\"fonte\":\"principal\",\"codigo\":\"A3\"}]'::jsonb, false)" >/dev/null

for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "A MIGRACAO ABORTOU (vez $i)"; echo "$OUT" | grep -E "ERROR" | head -3; exit 2; }
done
ok "a migração aplica sobre o corpo da 20261111000001 e reaplica sobre o próprio"

M=$(q "select md5(prosrc) from pg_proc where proname = 'superadmin_importar_desenhos'")
[ "$M" = "be16513def2c92be4dcb1eff51c585ff" ] && ok "o corpo gravado tem o md5 do prosrc de produção (be16513d…)" || falha "md5 do corpo: $M"
q "select prosrc from pg_proc where proname = 'superadmin_importar_desenhos'" | grep -Eq "DELETE FROM public\.orcamentista_tipologia_desenho WHERE true;" \
  && ok "o DELETE tem WHERE" || falha "o DELETE sem WHERE"
[ "$(q "select count(*) from orcamentista_tipologia_desenho")" = "3" ] && ok "aplicar a migração não toca nas linhas (3 continuam)" || falha "linhas mudaram"

# encolher sem permissão: recusa ANTES de apagar
SAI=$(q "select superadmin_importar_desenhos(null, repeat('b', 64), '[{\"fonte\":\"principal\",\"codigo\":\"B1\"}]'::jsonb, false)")
echo "$SAI" | grep -q "encolher exige permitir_encolher = true" && [ "$(q "select string_agg(codigo, ',' order by codigo) from orcamentista_tipologia_desenho")" = "A1,A2,A3" ] \
  && ok "índice menor sem a marca: recusado, as 3 linhas intactas" || falha "encolher: $SAI"

# falha no meio da gravação (a 2ª linha fura a CHECK do codigo_dp): nada se perde — apagar e regravar é uma transação só
SAI=$(q "select superadmin_importar_desenhos(null, repeat('c', 64), '[{\"fonte\":\"principal\",\"codigo\":\"C1\"},{\"fonte\":\"principal\",\"codigo\":\"C2\",\"codigo_dp\":\"XX\"},{\"fonte\":\"principal\",\"codigo\":\"C3\"},{\"fonte\":\"principal\",\"codigo\":\"C4\"}]'::jsonb, false)")
echo "$SAI" | grep -q "orcamentista_tipologia_desenho_codigo_dp_forma" && [ "$(q "select string_agg(codigo, ',' order by codigo) from orcamentista_tipologia_desenho")" = "A1,A2,A3" ] \
  && ok "falha no meio do INSERT: a tabela continua com as 3 de antes (não fica vazia)" || falha "transação: $SAI"

# a importação que vale grava inteira, e o log diz a migração nova
q "select superadmin_importar_desenhos(null, repeat('d', 64), '[{\"fonte\":\"principal\",\"codigo\":\"D1\"},{\"fonte\":\"principal\",\"codigo\":\"D2\"},{\"fonte\":\"principal\",\"codigo\":\"D3\"},{\"fonte\":\"principal\",\"codigo\":\"D4\"}]'::jsonb, false)" >/dev/null
[ "$(q "select string_agg(codigo, ',' order by codigo) from orcamentista_tipologia_desenho")" = "D1,D2,D3,D4" ] \
  && [ "$(q "select depois->>'migracao' from superadmin_alteracao_log where chave = repeat('d', 64)")" = "20261115000001" ] \
  && ok "importar grava a tabela inteira; o log marca 20261115000001" || falha "importar"
R2=$(q "select superadmin_importar_desenhos(null, repeat('d', 64), '[{\"fonte\":\"principal\",\"codigo\":\"D1\"},{\"fonte\":\"principal\",\"codigo\":\"D2\"},{\"fonte\":\"principal\",\"codigo\":\"D3\"},{\"fonte\":\"principal\",\"codigo\":\"D4\"}]'::jsonb, false)")
echo "$R2" | grep -q '"igual"' && [ "$(q "select count(*) from orcamentista_tipologia_desenho")" = "4" ] && ok "importar de novo o mesmo índice: 'igual', 4 linhas" || falha "idempotência: $R2"

# GUARDA: corpo diferente dos dois conhecidos aborta e não troca nada
G=${D}_guarda; $P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G template $D" >/dev/null
$P -d $G -c "create or replace function public.superadmin_importar_desenhos(p_por uuid, p_sha256 text, p_linhas jsonb, p_permitir_encolher boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as \$\$ begin return null; end \$\$" >/dev/null
SAI=$($P -d $G -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
echo "$SAI" | grep -q "nem o da 20261111000001 nem o desta" && [ "$($P -d $G -At -c "select prosrc from pg_proc where proname='superadmin_importar_desenhos'" | tr -d ' \n')" = "beginreturnnull;end" ] \
  && ok "guarda: corpo desconhecido aborta, a função fica como estava" || falha "guarda 1: $SAI"
V=${D}_vazio; $P -c "drop database if exists $V" >/dev/null 2>&1; $P -c "create database $V" >/dev/null
SAI=$($P -d $V -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
echo "$SAI" | grep -q "nao existe em $V" && ok "guarda: banco sem a função (o projeto errado) aborta nomeando o banco" || falha "guarda 2: $SAI"

echo "$OKS ok, $FALHAS falhas"; [ $FALHAS -eq 0 ]
