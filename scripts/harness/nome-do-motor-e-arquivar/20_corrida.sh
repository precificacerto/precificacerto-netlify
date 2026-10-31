#!/bin/bash
# As CORRIDAS da 20261029000005, com duas sessões de verdade. $1 = o psql; $2 = o banco. Saída: `ok:` / `FALHOU`. Cada corrida desfaz o que fez.
P=$1; D=$2
T=20e08592-f957-4e72-b7eb-251387e34eb9; SU=e0000000-0000-0000-0000-000000000001; AL=a1000000-0000-0000-0000-0000000000a1
novo_motor() { $P -d $D -At -c "select public.h_motor('Corrida ' || gen_random_uuid(), array['PVC', 'ALUMINIO'])" | head -1; }
limpar() { $P -d $D -c "delete from public.orcamentista_familia_etapa where materia_prima_id = '$AL'; delete from public.orcamentista_motor where id = '$1'" >/dev/null; }

# CORRIDA 1 — a instância ALUMINIO APONTANDO o motor (segura o motor) e, no meio, ARQUIVÁ-LO: o arquivar espera, VÊ a etapa e a deixa sem motor,
# devolvendo-a na lista
M=$(novo_motor)
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$AL', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select jsonb_array_length(public.superadmin_arquivar_motor('$M', '$SU') -> 'etapas_sem_motor')" 2>&1); FIM=$(date +%s); wait
E=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where materia_prima_id = '$AL' and motor_id is null and motor_familia_exigida is null")
if [ "$SAIDA" = "1" ] && [ "$E" = "1" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 1 — arquivar espera a etapa que aponta o motor, a ve e a deixa sem motor (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 1: lista=$SAIDA etapas_sem=$E esperou $((FIM-INI)) s"; fi
limpar $M

# CORRIDA 2 — ARQUIVAR o motor (segura o motor) e, no meio, a instância ALUMINIO apontá-lo: a etapa espera, vê o motor arquivado e RECUSA
M=$(novo_motor)
( $P -d $D -c "begin; select public.superadmin_arquivar_motor('$M', '$SU'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$AL', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb)" 2>&1); FIM=$(date +%s); wait
N=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where motor_id = '$M'")
if echo "$SAIDA" | grep -q "etapa 1: o motor esta arquivado" && [ "$N" = "0" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 2 — apontar espera o arquivamento, ve o motor arquivado e recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 2: etapas=$N esperou $((FIM-INI)) s saida=$SAIDA"; fi
limpar $M
