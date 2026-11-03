#!/bin/bash
# As CORRIDAS da 20261103000002, em duas sessões de verdade, cada uma numa cópia nova da base. $1 = o psql, $2 = a base.
# A função nova trava a linha da categoria (FOR UPDATE), e a gravar_mp_categoria também: as duas escritas na mesma categoria se enfileiram, e
# nenhuma apaga a outra (a config não toca a instrução, a instrução não toca a config).
P=$1; D=$2; C=${D}_corrida
SA=e0000000-0000-0000-0000-000000000001; DP=20e08592-f957-4e72-b7eb-251387e34eb9; MP=79d764fe-4acd-43e2-bed9-38e20667ca3d
nova() { $P -c "drop database if exists $C" >/dev/null 2>&1; $P -c "create database $C template $D" >/dev/null; CAT=$($P -d $C -At -c "select id from orcamentista_mp_categoria where materia_prima_id = '$MP' and categoria_chave = 'PERFIL'"); }
INSTR1="select public.superadmin_gravar_instrucao_da_categoria('$DP', '$SA', '$CAT', '\"primeira\"')"
# a config comparada como jsonb (o texto reordena as chaves): 'primeira|true' e o esperado
estado() { $P -d $C -At -c "select instrucao || '|' || (config = '{\"cores\": null, \"cor_predominante\": \"BRANCO\", \"serra_mm\": 9}'::jsonb)::text from orcamentista_mp_categoria where id = '$CAT'"; }

# CORRIDA 1: a instrução (transação aberta) e, em paralelo, a config pela gravar_mp_categoria: a config espera, e ficam as duas
nova
INSTR1="select public.superadmin_gravar_instrucao_da_categoria('$DP', '$SA', '$CAT', '\"primeira\"')"
( $P -d $C -At -c "begin; $INSTR1; select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_gravar_mp_categoria('$DP', '$SA', '$MP', 'PERFIL', '{\"serra_mm\": 9}')" 2>&1 >/dev/null); wait
if [ -z "$OUT" ] && [ "$(estado)" = 'primeira|true' ]; then echo "NOTICE:  ok: corrida 1 — instrucao e config na mesma categoria, em paralelo: ficam as duas"
else echo "ERROR:  FALHOU corrida 1: $OUT $(estado)"; fi

# CORRIDA 2: a config (transação aberta) e, em paralelo, a instrução: a instrução espera, e ficam as duas; um log de cada
nova
INSTR1="select public.superadmin_gravar_instrucao_da_categoria('$DP', '$SA', '$CAT', '\"primeira\"')"
( $P -d $C -At -c "begin; select public.superadmin_gravar_mp_categoria('$DP', '$SA', '$MP', 'PERFIL', '{\"serra_mm\": 9}'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "$INSTR1" 2>&1 >/dev/null); wait
N=$($P -d $C -At -c "select count(*) from superadmin_alteracao_log where tabela = 'orcamentista_mp_categoria' and chave = '$CAT' and antes ->> 'remocao' is null")
if [ -z "$OUT" ] && [ "$(estado)" = 'primeira|true' ] && [ "$N" = "2" ]; then echo "NOTICE:  ok: corrida 2 — config e instrucao na mesma categoria, na outra ordem: ficam as duas, um log de cada"
else echo "ERROR:  FALHOU corrida 2: $OUT $(estado) logs=$N"; fi

# CORRIDA 3: duas instruções na mesma categoria: a segunda espera a primeira e vence; dois logs, o segundo com o antes = a primeira
nova
INSTR1="select public.superadmin_gravar_instrucao_da_categoria('$DP', '$SA', '$CAT', '\"primeira\"')"
( $P -d $C -At -c "begin; $INSTR1; select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_gravar_instrucao_da_categoria('$DP', '$SA', '$CAT', '\"segunda\"')" 2>&1 >/dev/null); wait
ANTES=$($P -d $C -At -c "select antes -> 'orcamentista_mp_categoria' ->> 'instrucao' from superadmin_alteracao_log where depois ->> 'campo' = 'instrucao' and depois -> 'orcamentista_mp_categoria' ->> 'instrucao' = 'segunda'")
if [ -z "$OUT" ] && [ "$($P -d $C -At -c "select instrucao from orcamentista_mp_categoria where id = '$CAT'")" = "segunda" ] && [ "$ANTES" = "primeira" ]; then
  echo "NOTICE:  ok: corrida 3 — duas instrucoes em paralelo: a segunda espera e vence, e o log dela tem a primeira no antes"
else echo "ERROR:  FALHOU corrida 3: $OUT antes=$ANTES"; fi
$P -c "drop database if exists $C" >/dev/null 2>&1
