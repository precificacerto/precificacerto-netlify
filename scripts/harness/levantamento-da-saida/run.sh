#!/bin/bash
# HARNESS da migração 20261118000005 (levantamento_id na saída: o contexto do turno). NÃO TOCA PRODUÇÃO.
# Base: as tabelas da conversa como em produção + a 20261103000003 + o mínimo do levantamento (00_base.sql).
#   D  = base + esta migração DUAS vezes -> os casos (10_casos.sql);
#   contraste 1: a coluna já existe como text -> a guarda aborta com a frase, e nada muda;
#   contraste 2: o levantamento sem o UNIQUE (id, tenant_id) -> a guarda aborta com a frase, e a coluna não fica;
#   contraste 3: a base SEM as tabelas -> a guarda aborta com a frase da dependência;
#   contraste 4: uma constraint a mais na mensagem -> a verificação 3 aborta, e a coluna não fica.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261118000005_levantamento_da_saida.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_levantamento_da_saida}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3; C4=${D}_c4
for x in $D $C1 $C2 $C3 $C4; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $M/20261103000003_responde_a_na_mensagem.sql 2>&1) || { echo "BASE FALHOU (20261103000003) em $x"; echo "$OUT" | grep ERROR | head -3; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
coluna() { $P -d $1 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_mensagem' and column_name = 'levantamento_id' and data_type = 'uuid'"; }
contrastes() {
# CONTRASTE 1: a coluna já existe como text -> aborta na guarda
$P -d $C1 -c "alter table public.orcamentista_mensagem add column levantamento_id text" >/dev/null 2>&1
local SAI; SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
local FK; FK=$($P -d $C1 -At -c "select count(*) from pg_constraint where conname = 'orcamentista_mensagem_levantamento_fkey'")
if echo "$SAI" | grep -q "ERROR:  orcamentista_mensagem.levantamento_id ja existe com o tipo text. Nada foi alterado." && [ "$FK" = "0" ]; then
  echo "NOTICE:  ok: contraste 1 — a coluna como text aborta na guarda, e nada muda"; else echo "ERROR:  FALHOU contraste 1: $(echo "$SAI" | grep ERROR | head -1) fk=$FK"; fi
# CONTRASTE 2: sem o UNIQUE (id, tenant_id) do levantamento -> aborta na guarda
$P -d $C2 -c "alter table public.orcamentista_levantamento drop constraint orcamentista_levantamento_id_tenant_id_key" >/dev/null 2>&1
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  orcamentista_levantamento sem UNIQUE (id, tenant_id): a FK do contexto nao tem onde apontar. Nada foi alterado." && [ "$(coluna $C2)" = "0" ]; then
  echo "NOTICE:  ok: contraste 2 — sem o UNIQUE do levantamento, a guarda aborta e a coluna nao fica"; else echo "ERROR:  FALHOU contraste 2: $(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 3: sem as tabelas -> a frase da dependência
$P -d $C3 -c "drop table public.orcamentista_mensagem, public.orcamentista_conversa, public.orcamentista_levantamento" >/dev/null 2>&1
SAI=$($P -d $C3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: orcamentista_mensagem ou orcamentista_levantamento no banco"; then
  echo "NOTICE:  ok: contraste 3 — sem as tabelas, a guarda aborta com a frase da dependencia"; else echo "ERROR:  FALHOU contraste 3: $(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 4: uma constraint a mais na mensagem -> a verificação 3 aborta, e a coluna não fica
$P -d $C4 -c "alter table public.orcamentista_mensagem add constraint orcamentista_mensagem_texto_curto check (char_length(texto) < 100000)" >/dev/null 2>&1
SAI=$($P -d $C4 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  verificacao 3: a tabela tem 7 constraint(s), e devia ter 6." && [ "$(coluna $C4)" = "0" ]; then
  echo "NOTICE:  ok: contraste 4 — uma constraint a mais aborta na verificacao 3, e a coluna nao fica"; else echo "ERROR:  FALHOU contraste 4: $(echo "$SAI" | grep ERROR | head -1)"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $C1 $C2 $C3 $C4; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
