#!/bin/bash
# As CORRIDAS da 20261103000001, em duas sessões de verdade, cada uma numa cópia nova da base. $1 = o psql, $2 = a base.
# Marcar uma categoria na ramificação e pôr uma matéria-prima na família ao mesmo tempo: nas duas ordens, a matéria-prima termina com a linha.
# Quem serializa é a linha da família: o FOR UPDATE de superadmin_editar_familia contra o FOR KEY SHARE da FK de orcamentista_materia_prima.familia.
P=$1; D=$2; C=${D}_corrida
SA=e0000000-0000-0000-0000-000000000001; B=b0000000-0000-0000-0000-00000000000b; MB=c1000000-0000-0000-0000-00000000000b
nova() { $P -c "drop database if exists $C" >/dev/null 2>&1; $P -c "create database $C template $D" >/dev/null; }
MARCA="select public.superadmin_editar_familia('$SA', 'ALUMINIO', 'Esquadrias de aluminio', array['PERFIL', 'VEDACAO'])"
TROCA="select public.superadmin_definir_familia_da_materia_prima('$B', '$SA', '$MB', 'ALUMINIO')"
confere() { [ "$($P -d $C -At -c "select string_agg(categoria_chave, ',' order by categoria_chave) from orcamentista_mp_categoria where materia_prima_id = '$MB'")" = "PERFIL,VEDACAO" ]; }

# CORRIDA 1: a marcação primeiro (transação aberta), a troca de família depois: a troca espera a marcação e lê a ramificação nova
nova
( $P -d $C -At -c "begin; $MARCA; select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "$TROCA" 2>&1 >/dev/null); wait
if [ -z "$OUT" ] && confere; then echo "NOTICE:  ok: corrida 1 — marcar e, em paralelo, por a materia-prima na familia: ela termina com as duas linhas"
else echo "ERROR:  FALHOU corrida 1: $OUT $($P -d $C -At -c "select string_agg(categoria_chave, ',') from orcamentista_mp_categoria where materia_prima_id = '$MB'")"; fi

# CORRIDA 2: a troca de família primeiro (transação aberta), a marcação depois: a marcação espera a troca e acha a matéria-prima na família
nova
( $P -d $C -At -c "begin; $TROCA; select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "$MARCA" 2>&1 >/dev/null); wait
if [ -z "$OUT" ] && confere; then echo "NOTICE:  ok: corrida 2 — por a materia-prima na familia e, em paralelo, marcar: ela termina com as duas linhas"
else echo "ERROR:  FALHOU corrida 2: $OUT $($P -d $C -At -c "select string_agg(categoria_chave, ',') from orcamentista_mp_categoria where materia_prima_id = '$MB'")"; fi
$P -c "drop database if exists $C" >/dev/null 2>&1
