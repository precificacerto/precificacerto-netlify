#!/bin/bash
# As CORRIDAS da 20261101000001, em duas sessões de verdade, cada uma numa cópia nova da base. $1 = o psql, $2 = a base.
P=$1; D=$2; C=${D}_corrida
SA=e0000000-0000-0000-0000-000000000001; W=44c5c0fe-a0d3-4aab-802d-20a6eff3f654; T1=72366020-57c9-489f-9385-397b7fa3dedb
nova() { $P -c "drop database if exists $C" >/dev/null 2>&1; $P -c "create database $C template $D" >/dev/null; }

# CORRIDA 1: duas remoções da mesma tabela: uma remove (log uma vez), a outra espera e recebe P0002
nova
A=$($P -d $C -At -c "select public.superadmin_arrasto_do_catalogo('tabela', '$T1') ->> 'assinatura'")
( $P -d $C -At -c "begin; select public.superadmin_remover_do_catalogo('$SA', 'tabela', '$T1', '$A'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_remover_do_catalogo('$SA', 'tabela', '$T1', '$A')" 2>&1); wait
if echo "$OUT" | grep -q "o item do catalogo nao existe" && [ "$($P -d $C -At -c "select count(*) from orcamentista_tabela where id = '$T1'")" = "0" ] \
   && [ "$($P -d $C -At -c "select count(*) from superadmin_alteracao_log where antes -> 'remocao_do_catalogo' ->> 'tipo' = 'tabela' and tabela = 'orcamentista_tabela'")" = "1" ]; then
  echo "NOTICE:  ok: corrida 1 — duas remocoes da mesma tabela: uma remove (logada uma vez), a outra espera e recebe P0002"
else echo "ERROR:  FALHOU corrida 1: $OUT"; fi

# CORRIDA 2: remover a tabela (transação aberta) x remover o fornecedor medido ANTES: o fornecedor espera, o arrasto dele mudou, e recusa (40001)
nova
A=$($P -d $C -At -c "select public.superadmin_arrasto_do_catalogo('fornecedor', '$W') ->> 'assinatura'")
AT=$($P -d $C -At -c "select public.superadmin_arrasto_do_catalogo('tabela', '$T1') ->> 'assinatura'")
( $P -d $C -At -c "begin; select public.superadmin_remover_do_catalogo('$SA', 'tabela', '$T1', '$AT'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_remover_do_catalogo('$SA', 'fornecedor', '$W', '$A')" 2>&1); wait
if echo "$OUT" | grep -q "o arrasto mudou desde que foi mostrado" && [ "$($P -d $C -At -c "select count(*) from orcamentista_fornecedor where id = '$W'")" = "1" ] \
   && [ "$($P -d $C -At -c "select count(*) from orcamentista_tabela where id = '$T1'")" = "0" ]; then
  echo "NOTICE:  ok: corrida 2 — remover a tabela x remover o fornecedor medido antes: o fornecedor espera, ve o arrasto mudado e recusa (40001)"
else echo "ERROR:  FALHOU corrida 2: $OUT"; fi
$P -c "drop database if exists $C" >/dev/null 2>&1
