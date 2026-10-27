#!/bin/bash
# As duas CORRIDAS entre gravar a etapa e arquivar o motor, com duas sessões de verdade. Saída: linhas `ok:` / `FALHOU`.
# Usa o banco já montado por run.sh. $1 = o psql; $2 = o banco.
P=$1; D=$2
U=e0000000-0000-0000-0000-000000000001; M=c0000000-0000-0000-0000-000000000001
limpa() { $P -d $D -c "delete from public.orcamentista_familia_etapa; update public.orcamentista_motor set arquivado_em = null where id = '$M'" >/dev/null; }

# CORRIDA 1 — a etapa é gravada PRIMEIRO (segura o motor) e o arquivamento chega no meio: ele espera e RECUSA
limpa
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_familia('PVC', '$U', '[{\"rotulo\":\"Apanhado\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1
INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_arquivar_motor('$M', '$U')" 2>&1)
FIM=$(date +%s)
wait
ARQ=$($P -d $D -At -c "select arquivado_em is not null from public.orcamentista_motor where id = '$M'")
if echo "$SAIDA" | grep -q "o motor e o da etapa 1" && [ "$ARQ" = "f" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 1 — arquivar espera a etapa que estava sendo gravada e a vê: recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 1: arquivado=$ARQ, esperou $((FIM-INI)) s, saida=$SAIDA"; fi

# CORRIDA 2 — o arquivamento vem PRIMEIRO (segura o motor) e a etapa chega no meio: ela espera, vê o motor arquivado e RECUSA
limpa
( $P -d $D -c "begin; select public.superadmin_arquivar_motor('$M', '$U'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1
INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_familia('PVC', '$U', '[{\"rotulo\":\"Apanhado\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb)" 2>&1)
FIM=$(date +%s)
wait
N=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where motor_id = '$M'")
if echo "$SAIDA" | grep -q "o motor esta arquivado" && [ "$N" = "0" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 2 — gravar a etapa espera o arquivamento e vê o motor arquivado: recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 2: etapas=$N, esperou $((FIM-INI)) s, saida=$SAIDA"; fi
limpa
