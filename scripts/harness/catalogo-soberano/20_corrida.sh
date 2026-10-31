#!/bin/bash
# As CORRIDAS da 20261031000003, em duas sessões de verdade, cada uma numa cópia nova da base. $1 = o psql, $2 = a base.
P=$1; D=$2; C=${D}_corrida
SA=e0000000-0000-0000-0000-000000000001; M=9a233c55-f377-45d3-b2ae-b1a740a98e44; MP=79d764fe-4acd-43e2-bed9-38e20667ca3d; DP=20e08592-f957-4e72-b7eb-251387e34eb9
nova() { $P -c "drop database if exists $C" >/dev/null 2>&1; $P -c "create database $C template $D" >/dev/null; }
# a etapa 3 sem motor (para que gravar a lista dê a ela o motor e mude o arrasto)
SEM3="update public.orcamentista_familia_etapa set motor_id = null, motor_familia_exigida = null where materia_prima_id = '$MP' and numero = 3;"
LISTA="(select jsonb_agg(jsonb_build_object('id', e.id, 'etapa_catalogo_id', e.etapa_catalogo_id, 'instrucao', e.instrucao, 'motor_id', '$M') order by e.numero) from public.orcamentista_familia_etapa e where e.materia_prima_id = '$MP')"
GRAVAR="select public.superadmin_gravar_etapas_da_materia_prima('$DP', '$SA', '$MP', $LISTA)"
ASSIN="select public.superadmin_arrasto_do_catalogo('motor', '$M') ->> 'assinatura'"

# CORRIDA 1: gravar etapa que aponta o motor (transação aberta) x remover o motor medido ANTES: a remoção espera, vê a etapa nova e recusa (40001)
nova; $P -d $C -c "$SEM3" >/dev/null
A=$($P -d $C -At -c "$ASSIN")
( $P -d $C -At -c "begin; $GRAVAR; select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_remover_do_catalogo('$SA', 'motor', '$M', '$A') ->> 'removido'" 2>&1); wait
if echo "$OUT" | grep -q "o arrasto mudou desde que foi mostrado" && [ "$($P -d $C -At -c "select count(*) from orcamentista_familia_etapa where motor_id = '$M'")" = "3" ]; then
  echo "NOTICE:  ok: corrida 1 — gravar etapa x remover o motor: a remocao espera, ve a etapa nova e recusa (40001); as 3 etapas com o motor"
else echo "ERROR:  FALHOU corrida 1: $OUT"; fi

# CORRIDA 2: remover o motor (transação aberta) x gravar etapa que o aponta: a gravação espera e recusa o motor que sumiu; nenhuma etapa aponta o que não existe
nova; $P -d $C -c "$SEM3" >/dev/null
A=$($P -d $C -At -c "$ASSIN")
( $P -d $C -At -c "begin; select public.superadmin_remover_do_catalogo('$SA', 'motor', '$M', '$A'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "$GRAVAR" 2>&1); wait
if echo "$OUT" | grep -qi "motor" && echo "$OUT" | grep -q ERROR && [ "$($P -d $C -At -c "select count(*) from orcamentista_motor where id = '$M'")" = "0" ] \
   && [ "$($P -d $C -At -c "select count(*) from orcamentista_familia_etapa where motor_id is not null")" = "0" ]; then
  echo "NOTICE:  ok: corrida 2 — remover o motor x gravar etapa: a gravacao espera e recusa ($(echo "$OUT" | grep ERROR | head -1 | sed "s/^.*ERROR: *//" | cut -c1-80)); nenhuma etapa aponta o motor removido"
else echo "ERROR:  FALHOU corrida 2: $OUT"; fi

# CORRIDA 3: duas remoções do mesmo item ao mesmo tempo: uma remove, a outra espera e diz que não existe (P0002)
nova
C1=$($P -d $C -At -c "select id from orcamentista_etapa_catalogo where ordem = 1")   # o semeio da 20261031000002 gera o id
A=$($P -d $C -At -c "select public.superadmin_arrasto_do_catalogo('etapa', '$C1') ->> 'assinatura'")
( $P -d $C -At -c "begin; select public.superadmin_remover_do_catalogo('$SA', 'etapa', '$C1', '$A'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_remover_do_catalogo('$SA', 'etapa', '$C1', '$A')" 2>&1); wait
if echo "$OUT" | grep -q "o item do catalogo nao existe" && [ "$($P -d $C -At -c "select array_agg(numero order by numero) from orcamentista_familia_etapa")" = "{1,2}" ] \
   && [ "$($P -d $C -At -c "select count(*) from superadmin_alteracao_log where antes -> 'remocao_do_catalogo' ->> 'tipo' = 'etapa'")" = "3" ]; then
  echo "NOTICE:  ok: corrida 3 — duas remocoes do mesmo item: uma remove (log uma vez), a outra espera e recebe P0002"
else echo "ERROR:  FALHOU corrida 3: $OUT"; fi
$P -c "drop database if exists $C" >/dev/null 2>&1
