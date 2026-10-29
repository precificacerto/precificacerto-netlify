#!/bin/bash
# As CORRIDAS da 20261029000002, com duas sessões de verdade. $1 = o psql; $2 = o banco. Saída: `ok:` / `FALHOU`. Cada corrida desfaz o que fez.
P=$1; D=$2
T=20e08592-f957-4e72-b7eb-251387e34eb9; SU=e0000000-0000-0000-0000-000000000001; RS=f2000000-0000-0000-0000-000000000002; AL=a1000000-0000-0000-0000-0000000000a1
novo_motor() { $P -d $D -At -c "select public.h_motor('PERSIANAS', null)" | head -1; }
caminho() { $P -d $D -At -c "select arquivo_path from public.orcamentista_motor where id = '$1'"; }
limpar() { $P -d $D -c "delete from public.orcamentista_familia_etapa where materia_prima_id = '$AL'; delete from public.orcamentista_motor where id = '$1'" >/dev/null; }

# CORRIDA 1 — EDITAR um motor de persiana para PERFIL PVC (segura o motor) e, no meio, a família ALUMINIO apontá-lo: a etapa espera, vê o motor
# já PVC e RECUSA; nenhuma etapa da ALUMINIO fica com ele
M=$(novo_motor); C=$(caminho $M)
( $P -d $D -c "begin; select public.superadmin_editar_motor('$SU', '$M', '$RS', 'PERFIL', 'PVC', '$C'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$AL', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb)" 2>&1); FIM=$(date +%s); wait
N=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where motor_id = '$M'"); F=$($P -d $D -At -c "select familia_exigida from public.orcamentista_motor where id = '$M'")
if echo "$SAIDA" | grep -q "o motor e do tipo PVC, e a familia e do tipo ALUMINIO" && [ "$N" = "0" ] && [ "$F" = "PVC" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 1 — apontar o motor espera a edicao para PERFIL PVC, ve a familia nova e recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 1: etapas=$N exigida=$F esperou $((FIM-INI)) s saida=$SAIDA"; fi
limpar $M

# CORRIDA 2 — a família ALUMINIO APONTANDO um motor de persiana (segura o motor) e EDITÁ-LO para PERFIL PVC no meio: a edição espera, vê a etapa e
# RECUSA; o motor continua sem família, e a etapa exige '*'
M=$(novo_motor); C=$(caminho $M)
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$AL', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_editar_motor('$SU', '$M', '$RS', 'PERFIL', 'PVC', '$C')" 2>&1); FIM=$(date +%s); wait
F=$($P -d $D -At -c "select coalesce(familia, '(nula)') from public.orcamentista_motor where id = '$M'"); E=$($P -d $D -At -c "select motor_familia_exigida from public.orcamentista_familia_etapa where motor_id = '$M'")
if echo "$SAIDA" | grep -q "o motor tem uso (1 etapa(s)" && [ "$F" = "(nula)" ] && [ "$E" = "*" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 2 — editar espera a etapa que aponta o motor, ve a etapa e recusa; o motor segue sem familia (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 2: familia=$F exigida=$E esperou $((FIM-INI)) s saida=$SAIDA"; fi
limpar $M
