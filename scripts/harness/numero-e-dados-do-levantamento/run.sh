#!/bin/bash
# HARNESS da migração 20261106000002 (número, dados do cliente, percentuais e vendedor no levantamento; ambientes e obs no item; o apagamento
# dos 5 levantamentos de teste). NÃO TOCA PRODUÇÃO.
# Base: as tabelas como em produção em 06/11/2026, o privilégio padrão de produção e os 5 + 11 com os ids reais (00_base.sql).
#   D  = base + esta migração DUAS vezes -> 10_casos.sql -> a migração uma TERCEIRA vez, sobre a base usada -> 20_depois_de_reaplicar.sql;
#   corrida 1: duas transações criam levantamento na mesma empresa ao mesmo tempo -> números diferentes, nenhum perdido;
#   contrastes 1 a 6: as guardas, cada uma num banco próprio, abortam com a frase e NADA muda;
#   contraste 7: o arquivo em CRLF (a colagem pelo SQL Editor no Windows) -> o md5 sem o \r bate, e a verificação passa.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261106000002_numero_cliente_e_percentuais_do_levantamento.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_numero_levantamento}
COPIAS="${D}_k1 ${D}_g1 ${D}_g2 ${D}_g3 ${D}_g4 ${D}_g5 ${D}_g6 ${D}_g7"
for x in $D $COPIAS; do
  $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
  [ "$x" = "${D}_g6" ] && continue   # a guarda 6 é a de um banco sem as tabelas
  OUT=$($P -d $x -v ON_ERROR_STOP=1 -f $S/00_base.sql 2>&1) || { echo "BASE FALHOU em $x"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
done
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done

reaplicar() {
  local OUT; OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "ERROR:  FALHOU a reaplicacao sobre a base usada: $(echo "$OUT" | grep ERROR | head -1)"; return; }
}

# guarda: aplica numa cópia preparada; exige a frase e que nada tenha mudado (os 5 e os 11 continuam, sem a coluna numero, sem o contador)
guarda() {
  local NOME=$1 DB=$2 PREP=$3 FRASE=$4 ESPERADO=${5:-5/11/0/true/0}
  [ -n "$PREP" ] && $P -d $DB -v ON_ERROR_STOP=1 -c "$PREP" >/dev/null 2>&1
  local SAI; SAI=$($P -d $DB -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  local RESTO; RESTO=$($P -d $DB -At -c "select (select count(*) from orcamentista_levantamento) || '/' || (select count(*) from orcamentista_levantamento_item)
    || '/' || (select count(*) from information_schema.columns where table_name = 'orcamentista_levantamento' and column_name in ('telefone', 'vendedor_nome'))
    || '/' || (to_regclass('public.orcamentista_levantamento_contador') is null)
    || '/' || (select count(*) from superadmin_alteracao_log where antes ->> 'remocao' = '20261106000002')" 2>&1)
  if echo "$SAI" | grep -qF "ERROR:  $FRASE" && [ "$RESTO" = "$ESPERADO" ]; then
    echo "NOTICE:  ok: $NOME — aborta com a frase, e nada muda"
  else echo "ERROR:  FALHOU $NOME: saida=$(echo "$SAI" | grep ERROR | head -1) resto=$RESTO"; fi
}

contrastes() {
# CORRIDA 1: duas transações criam levantamento na mesma empresa ao mesmo tempo — a segunda espera a trava da linha do contador
local K=${D}_k1
$P -d $K -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
local INS="insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2'"
( $P -d $K -c "begin; $INS, 'Corrida A', 'corrida a', 'EM_MONTAGEM'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.5
local T0=$(date +%s%N)
$P -d $K -c "$INS, 'Corrida B', 'corrida b', 'EM_MONTAGEM')" >/dev/null 2>&1
local T1=$(date +%s%N); wait
local ESPEROU=$(( (T1 - T0) / 1000000 ))
local NUMS; NUMS=$($P -d $K -At -c "select string_agg(nome || '=' || numero, ',' order by numero) from orcamentista_levantamento")
if [ "$NUMS" = "Corrida A=1,Corrida B=2" ] && [ "$ESPEROU" -ge 1000 ]; then
  echo "NOTICE:  ok: corrida 1 — duas criacoes ao mesmo tempo: a segunda espera a trava (${ESPEROU} ms) e leva o 2; nenhum numero repetido nem perdido"
else echo "ERROR:  FALHOU corrida 1: numeros=$NUMS esperou=${ESPEROU}ms"; fi

# CONTRASTE 1: um sexto levantamento, fora dos 5 medidos -> a guarda aborta
guarda "guarda 1" ${D}_g1 "insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Novo de verdade', 'novo de verdade', 'EM_MONTAGEM')" \
  "ha levantamento fora dos 5 medidos em 06/11/2026:" 6/11/0/true/0
# CONTRASTE 2: um dos 5 em outra empresa -> a guarda aborta
guarda "guarda 2" ${D}_g2 "alter table orcamentista_levantamento_item drop constraint orcamentista_levantamento_item_levantamento_fkey; update orcamentista_levantamento set tenant_id = 'a0000000-0000-0000-0000-000000000002', remetente_id = 'b0000000-0000-0000-0000-000000000003' where id = 'c8b56b73-05b3-4d4e-82d0-41ecba58b893'" \
  "levantamento medido com outra empresa: c8b56b73-05b3-4d4e-82d0-41ecba58b893 (empresa a0000000-0000-0000-0000-000000000002). Nada foi alterado."
# CONTRASTE 3: um item a mais nos 5 -> a guarda aborta
guarda "guarda 3" ${D}_g3 "insert into orcamentista_levantamento_item (tenant_id, levantamento_id, ordem) values ('20e08592-f957-4e72-b7eb-251387e34eb9', 'c8b56b73-05b3-4d4e-82d0-41ecba58b893', 9)" \
  "os 5 levantamentos tem 12 item(ns), e o medido em 06/11/2026 foi 11. Nada foi alterado." 5/12/0/true/0
# CONTRASTE 4: a coluna numero já existe como text -> a guarda aborta pelo tipo
guarda "guarda 4" ${D}_g4 "alter table orcamentista_levantamento add column numero text" \
  "orcamentista_levantamento.numero ja existe com o tipo text, e devia ser integer. Nada foi alterado."
# CONTRASTE 5: a função do número já existe com outro corpo -> a guarda aborta
guarda "guarda 5" ${D}_g5 "create function public.orcamentista_levantamento_numerar() returns trigger language plpgsql as \$\$ begin return new; end \$\$" \
  "a funcao public.orcamentista_levantamento_numerar() ja existe com outro corpo"
# CONTRASTE 6: um banco sem as tabelas (o projeto errado) -> a guarda aborta nomeando o banco
local SAI; SAI=$($P -d ${D}_g6 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -qF "ERROR:  dependencia ausente no banco ${D}_g6 (usuario postgres, 0 tabela(s) orcamentista_*)"; then
  echo "NOTICE:  ok: guarda 6 — num banco sem as tabelas, aborta nomeando o banco, o usuario e as tabelas que achou"
else echo "ERROR:  FALHOU guarda 6: $(echo "$SAI" | grep ERROR | head -1)"; fi
# CONTRASTE 7: o arquivo em CRLF, como chega pelo SQL Editor no Windows, DUAS vezes -> aplica e reaplica: a guarda e a verificação comparam o md5 sem o \r
local CRLF=/tmp/harness-numero-levantamento-crlf.sql; sed 's/$/\r/' "$MIG" > $CRLF
SAI=$($P -d ${D}_g7 -v ON_ERROR_STOP=1 -f $CRLF 2>&1; $P -d ${D}_g7 -v ON_ERROR_STOP=1 -f $CRLF 2>&1)
local CR; CR=$($P -d ${D}_g7 -At -c "select count(*) from pg_proc where proname in ('orcamentista_levantamento_numerar', 'orcamentista_levantamento_ambientes_validos') and prosrc like '%' || chr(13) || '%'")
if echo "$SAI" | grep -q "20261106000002 ja aplicada" && ! echo "$SAI" | grep -q "ERROR" && [ "$CR" = "2" ]; then
  echo "NOTICE:  ok: guarda 7 — o arquivo em CRLF aplica duas vezes: os dois corpos ficam com o \\r, e o md5 sem ele bate na guarda e na verificacao"
else echo "ERROR:  FALHOU guarda 7: cr=$CR $(echo "$SAI" | grep ERROR | head -1)"; fi
rm -f $CRLF
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; reaplicar; $P -d $D -f 20_depois_de_reaplicar.sql 2>&1; contrastes) \
  | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(cat $S/10_casos.sql $S/20_depois_de_reaplicar.sql | grep -c "^-- CASO ") + $(grep -c "^# CORRIDA \|^# CONTRASTE " $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $COPIAS; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] && ! echo "$SAIDA" | grep -q "^FALHOU\|^ERRO NAO PREVISTO" || exit 1
