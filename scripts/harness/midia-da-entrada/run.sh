#!/bin/bash
# HARNESS da migracao 20261125000001 (a midia da entrada). NAO TOCA PRODUCAO.
# Base: 00_como_em_producao.sql (a tabela como em producao em 25/11/2026).
#   D  = base + a migracao DUAS vezes -> schema identico, e os casos (10_casos.sql);
#   contraste 1: `midia` ja existe como text -> a guarda aborta com a frase, e nada muda;
#   contraste 2: sem a tabela -> a guarda aborta com a frase da dependencia;
#   contraste 3: uma constraint a mais na tabela -> a verificacao 3 aborta, e a coluna NAO fica (a transacao volta);
#   contraste 4: a CHECK de mesmo nome com outra definicao -> a guarda aborta.
# Uso: run.sh [arquivo da migracao]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261125000001_midia_da_entrada.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
DUMP="pg_dump -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -s"
D=${HARNESS_DB:-harness_midia_da_entrada}; C1=${D}_c1; C2=${D}_c2; C3=${D}_c3; C4=${D}_c4
TMP=$(mktemp -d)
for x in $D $C1 $C2 $C3 $C4; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  if [ "$x" != "$C2" ]; then
    OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_como_em_producao.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  fi
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
  $DUMP $D | grep -vE '^\\(un)?restrict ' > $TMP/dump-$i.sql
done
{
diff -q $TMP/dump-1.sql $TMP/dump-2.sql >/dev/null && echo "NOTICE:  ok: a migracao aplicada duas vezes deixa o schema IDENTICO" || echo "ERROR:  FALHOU: a segunda aplicacao mudou o schema"
$P -d $D -v ON_ERROR_STOP=1 -f $S/10_casos.sql 2>&1
# CONTRASTE 1
$P -d $C1 -c "alter table public.orcamentista_mensagem add column midia text" >/dev/null 2>&1
SAI=$($P -d $C1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
TIPO=$($P -d $C1 -At -c "select data_type from information_schema.columns where table_name = 'orcamentista_mensagem' and column_name = 'midia'")
echo "$SAI" | grep -q "ERROR:  orcamentista_mensagem.midia ja existe com o tipo text, e devia ser jsonb. Nada foi alterado." && [ "$TIPO" = "text" ] \
  && echo "NOTICE:  ok: contraste 1 - midia com outro tipo aborta na guarda, e fica" || echo "ERROR:  FALHOU contraste 1: $(echo "$SAI" | grep ERROR | head -1) tipo=$TIPO"
# CONTRASTE 2
SAI=$($P -d $C2 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
echo "$SAI" | grep -q "ERROR:  dependencia ausente: public.orcamentista_mensagem (banco ${C2}, usuario postgres). Nada foi alterado." \
  && echo "NOTICE:  ok: contraste 2 - sem a tabela, a guarda aborta nomeando o banco" || echo "ERROR:  FALHOU contraste 2: $(echo "$SAI" | grep ERROR | head -1)"
# CONTRASTE 3
$P -d $C3 -c "alter table public.orcamentista_mensagem add constraint sobra check (true)" >/dev/null 2>&1
SAI=$($P -d $C3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
FICOU=$($P -d $C3 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_mensagem' and column_name = 'midia'")
echo "$SAI" | grep -q "ERROR:  verificacao 3: orcamentista_mensagem tem 8 constraint(s), e devia ter 7. Nada foi alterado." && [ "$FICOU" = "0" ] \
  && echo "NOTICE:  ok: contraste 3 - uma constraint a mais aborta na verificacao 3, e a coluna nao fica" || echo "ERROR:  FALHOU contraste 3: $(echo "$SAI" | grep ERROR | head -1) ficou=$FICOU"
# CONTRASTE 4
$P -d $C4 -c "alter table public.orcamentista_mensagem add column midia jsonb; alter table public.orcamentista_mensagem add constraint orcamentista_mensagem_midia_forma check (midia is null or jsonb_typeof(midia) = 'object')" >/dev/null 2>&1
SAI=$($P -d $C4 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
echo "$SAI" | grep -q "ERROR:  a CHECK orcamentista_mensagem_midia_forma ja existe com outra definicao: " \
  && echo "NOTICE:  ok: contraste 4 - a CHECK de mesmo nome e outra definicao aborta na guarda" || echo "ERROR:  FALHOU contraste 4: $(echo "$SAI" | grep ERROR | head -1)"
} > $TMP/saida.txt 2>&1
grep -E "ok:|FALHOU|ERROR" $TMP/saida.txt | sed 's/^psql:[^ ]* //'
OKS=$(grep -c "ok:" $TMP/saida.txt); RUINS=$(grep -c "FALHOU" $TMP/saida.txt)
echo "$OKS ok, $RUINS falhas"
[ "$OKS" = "13" ] && [ "$RUINS" = "0" ] || exit 1
