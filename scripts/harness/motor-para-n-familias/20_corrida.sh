#!/bin/bash
# As CORRIDAS da 20261029000003, com duas (ou três) sessões de verdade. $1 = o psql; $2 = o banco. Saída: `ok:` / `FALHOU`. Cada corrida desfaz o que fez.
P=$1; D=$2
T=20e08592-f957-4e72-b7eb-251387e34eb9; SU=e0000000-0000-0000-0000-000000000001; RS=f2000000-0000-0000-0000-000000000002; AL=a1000000-0000-0000-0000-0000000000a1
novo_motor() { $P -d $D -At -c "select public.h_motor('PERSIANAS', array['PVC', 'ALUMINIO'])" | head -1; }
caminho() { $P -d $D -At -c "select arquivo_path from public.orcamentista_motor where id = '$1'"; }
limpar() { $P -d $D -c "delete from public.orcamentista_familia_etapa where materia_prima_id = '$AL'; delete from public.orcamentista_motor where id = '$1'" >/dev/null; }

# CORRIDA 1 — EDITAR tirando ALUMINIO de um motor de PVC e ALUMINIO (segura o motor) e, no meio, a instância ALUMINIO apontá-lo: a etapa espera, vê o
# motor sem ALUMINIO e RECUSA; nenhuma etapa fica com ele
M=$(novo_motor); C=$(caminho $M)
( $P -d $D -c "begin; select public.superadmin_editar_motor('$SU', '$M', '$RS', 'PERSIANAS', array['PVC'], '$C'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$AL', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb)" 2>&1); FIM=$(date +%s); wait
N=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where motor_id = '$M'"); F=$($P -d $D -At -c "select public.h_familias('$M')")
if echo "$SAIDA" | grep -q "etapa 1: o motor nao atua na familia ALUMINIO" && [ "$N" = "0" ] && [ "$F" = "PVC" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 1 — apontar o motor espera a edicao que tira ALUMINIO, ve e recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 1: etapas=$N familias=$F esperou $((FIM-INI)) s saida=$SAIDA"; fi
limpar $M

# CORRIDA 2 — a instância ALUMINIO APONTANDO o motor (segura o motor) e, no meio, EDITAR tirando ALUMINIO: a edição espera, vê a etapa e RECUSA (23001,
# nomeando a etapa); o motor fica com as duas famílias
M=$(novo_motor); C=$(caminho $M)
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$AL', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_editar_motor('$SU', '$M', '$RS', 'PERSIANAS', array['PVC'], '$C')" 2>&1); FIM=$(date +%s); wait
F=$($P -d $D -At -c "select public.h_familias('$M')"); E=$($P -d $D -At -c "select motor_familia_exigida from public.orcamentista_familia_etapa where motor_id = '$M'")
if echo "$SAIDA" | grep -q 'a familia ALUMINIO nao pode sair do motor: em uso por 1 etapa(s) (Esquadrias De Paula Ltda / Esquadrias de alumínio / etapa 1)' && [ "$F" = "ALUMINIO,PVC" ] && [ "$E" = "ALUMINIO" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 2 — tirar a familia espera a etapa que a aponta, ve e recusa nomeando (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 2: familias=$F exigida=$E esperou $((FIM-INI)) s saida=$SAIDA"; fi
limpar $M

# CORRIDA 3 — duas transações tiram, cada uma, uma família DIFERENTE do mesmo motor (sem uso), e as duas CONFERÊNCIAS se encontram: cada uma força a
# conferência adiada na hora (SET CONSTRAINTS ... IMMEDIATE, que confere o que estava pendente) e segura a transação aberta. A segunda espera a trava do
# motor que a primeira tomou, conta de novo depois do COMMIT dela e RECUSA. Sem a trava, as duas contariam a família da outra e o motor ficaria sem nenhuma
M=$(novo_motor); XA=$(mktemp); XB=$(mktemp)
( $P -d $D -c "begin; delete from public.orcamentista_motor_familia where motor_id = '$M' and familia = 'PVC'; set constraints orcamentista_motor_sem_familia immediate; select pg_sleep(3); commit;" > $XA 2>&1 ) &
sleep 1
( $P -d $D -c "begin; delete from public.orcamentista_motor_familia where motor_id = '$M' and familia = 'ALUMINIO'; set constraints orcamentista_motor_sem_familia immediate; commit;" > $XB 2>&1 ) &
wait
ERROS_A=$(grep -c "o motor $M ficou sem familia" $XA); ERROS_B=$(grep -c "o motor $M ficou sem familia" $XB); L=$($P -d $D -At -c "select public.h_familias('$M')")
if [ "$ERROS_A" = "0" ] && [ "$ERROS_B" = "1" ] && [ "$L" = "ALUMINIO" ]; then echo "NOTICE:  ok: corrida 3 — duas conferencias ao mesmo tempo tirando familias diferentes: a segunda espera a trava do motor, conta de novo e recusa; o motor fica com uma"; else echo "ERROR:  FALHOU corrida 3: recusas=$ERROS_A/$ERROS_B familias=$L"; fi
rm -f $XA $XB
limpar $M
