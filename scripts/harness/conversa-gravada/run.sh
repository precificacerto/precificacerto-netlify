#!/bin/bash
# HARNESS da migração 20261103000003 (responde_a na mensagem e o índice da conversa). NÃO TOCA PRODUÇÃO.
# Base: as duas tabelas da conversa como em produção em 03/11/2026 (00_base.sql), com 1 conversa e 12 mensagens sintéticas.
#   D  = base + esta migração DUAS vezes -> os casos (10_casos.sql);
#   contraste 1: a coluna responde_a já existe como text -> a guarda aborta com a frase, e nada muda;
#   contraste 2: o índice da conversa existe com OUTRA definição -> a verificação aborta, e a coluna não fica;
#   contraste 3: a base SEM o índice da conversa (o estado antes de ele ser criado) -> a migração o cria com a definição;
#   contraste 4: a base SEM as duas tabelas -> a guarda aborta com a frase da dependência.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261103000003_responde_a_na_mensagem.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_conversa_gravada}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3; C4=${D}_c4
for x in $D $C1 $C2 $C3 $C4; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done

contrastes() {
# CONTRASTE 1: responde_a já existe como text -> aborta na guarda com a frase; nem FK nem índice ficam
$P -d $C1 -v ON_ERROR_STOP=1 -c "alter table public.orcamentista_mensagem add column responde_a text" >/dev/null 2>&1
local SAI; SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
local RESTO; RESTO=$($P -d $C1 -At -c "select (select count(*) from pg_constraint where conname = 'orcamentista_mensagem_responde_a_fkey') + (select count(*) from pg_indexes where indexname = 'orcamentista_mensagem_responde_a_idx') + (select count(*) from information_schema.columns where table_name = 'orcamentista_mensagem' and column_name = 'responde_a' and data_type = 'uuid')")
if echo "$SAI" | grep -q "ERROR:  orcamentista_mensagem.responde_a ja existe com o tipo text, e devia ser uuid. Nada foi alterado." && [ "$RESTO" = "0" ]; then
  echo "NOTICE:  ok: contraste 1 — responde_a como text aborta na guarda, e nada muda"
else echo "ERROR:  FALHOU contraste 1: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
# CONTRASTE 2: o índice da conversa com OUTRA definição -> a verificação 5 aborta, e a coluna não fica (sem o bloco $verifica$ não há frase a esperar)
if ! grep -q '^DO \$verifica\$' "$MIG"; then echo "NOTICE:  ok: contraste 2 — sem o bloco \$verifica\$, nao se aplica"; else
$P -d $C2 -v ON_ERROR_STOP=1 -c "drop index public.orcamentista_conversa_remetente_idx; create index orcamentista_conversa_remetente_idx on public.orcamentista_conversa (tenant_id, remetente_id)" >/dev/null 2>&1
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
RESTO=$($P -d $C2 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_mensagem' and column_name = 'responde_a'")
if echo "$SAI" | grep -q "ERROR:  verificacao 5: indice ausente ou com outra definicao: orcamentista_conversa_remetente_idx. Nada foi alterado." && [ "$RESTO" = "0" ]; then
  echo "NOTICE:  ok: contraste 2 — o indice da conversa com outra definicao aborta na verificacao 5, e a coluna nao fica"
else echo "ERROR:  FALHOU contraste 2: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
fi
# CONTRASTE 3: a base SEM o índice da conversa -> a migração o cria, com a definição
$P -d $C3 -v ON_ERROR_STOP=1 -c "drop index public.orcamentista_conversa_remetente_idx" >/dev/null 2>&1
SAI=$($P -d $C3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "ERROR:  FALHOU contraste 3: a migracao abortou sem o indice: $(echo "$SAI" | grep ERROR | head -1)"; return; }
RESTO=$($P -d $C3 -At -c "select count(*) from pg_indexes where indexname = 'orcamentista_conversa_remetente_idx' and indexdef = 'CREATE INDEX orcamentista_conversa_remetente_idx ON public.orcamentista_conversa USING btree (tenant_id, remetente_id, criado_em DESC)'")
if [ "$RESTO" = "1" ]; then echo "NOTICE:  ok: contraste 3 — sem o indice da conversa, a migracao o cria com a definicao"
else echo "ERROR:  FALHOU contraste 3: indice=$RESTO"; fi
# CONTRASTE 4: sem as duas tabelas -> a guarda aborta com a frase da dependência (e não com outro erro)
$P -d $C4 -v ON_ERROR_STOP=1 -c "drop table public.orcamentista_mensagem, public.orcamentista_conversa" >/dev/null 2>&1
SAI=$($P -d $C4 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "ERROR:  dependencia ausente: public.orcamentista_mensagem ou public.orcamentista_conversa. Nada foi alterado."; then
  echo "NOTICE:  ok: contraste 4 — sem as tabelas, a guarda aborta com a frase da dependencia"
else echo "ERROR:  FALHOU contraste 4: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $C1 $C2 $C3 $C4; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
