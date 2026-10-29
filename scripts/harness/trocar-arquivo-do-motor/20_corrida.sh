#!/bin/bash
# As CORRIDAS da 20261029000001, com duas sessões de verdade. $1 = o psql; $2 = o banco. Saída: `ok:` / `FALHOU`. Cada corrida desfaz o que fez.
P=$1; D=$2
T=20e08592-f957-4e72-b7eb-251387e34eb9; SU=e0000000-0000-0000-0000-000000000001; WM=9a233c55-f377-45d3-b2ae-b1a740a98e44
W=44c5c0fe-a0d3-4aab-802d-20a6eff3f654; R=f2000000-0000-0000-0000-000000000002
PAY="public.h_payload(1)"
restaurar() { # volta o motor da Wolff, as etapas e o log ao estado de antes da corrida
  $P -d $D -c "update public.orcamentista_familia_etapa e set motor_id = a.motor_id from public.h_etapas_depois_da_000001 a where a.id = e.id;
    update public.orcamentista_motor set arquivado_em = null, arquivado_por = null where id = '$WM';" >/dev/null
}

# CORRIDA 1 — TROCAR o arquivo (segura o motor) e, no meio, uma etapa NOVA apontá-lo: a etapa espera, vê o motor arquivado e RECUSA
MP2=$($P -d $D -At -c "insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('$T', 'Corrida 1', 9, 'PVC') returning id" | head -1)
( $P -d $D -c "begin; select public.superadmin_trocar_arquivo_do_motor('$SU', '$WM', '$W/motor/c1.xlsx', 'c1.xlsx', $PAY); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$MP2', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\",\"motor_id\":\"$WM\"}]'::jsonb)" 2>&1); FIM=$(date +%s); wait
N=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where materia_prima_id = '$MP2'")
NOVO=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where motor_id = (select id from public.orcamentista_motor where arquivo_path = '$W/motor/c1.xlsx')")
if echo "$SAIDA" | grep -q "arquivado" && [ "$N" = "0" ] && [ "$NOVO" = "3" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 1 — apontar o motor espera a troca do arquivo, ve o antigo arquivado e recusa; as 3 etapas ficam no novo (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 1: etapas da corrida=$N no novo=$NOVO esperou $((FIM-INI)) s saida=$SAIDA"; fi
restaurar; $P -d $D -c "delete from public.orcamentista_materia_prima where id = '$MP2'" >/dev/null

# CORRIDA 2 — duas TROCAS do mesmo motor ao mesmo tempo: a segunda espera, vê o motor arquivado e RECUSA; só um motor novo nasce
( $P -d $D -c "begin; select public.superadmin_trocar_arquivo_do_motor('$SU', '$WM', '$W/motor/c2a.xlsx', 'c2a.xlsx', $PAY); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_trocar_arquivo_do_motor('$SU', '$WM', '$W/motor/c2b.xlsx', 'c2b.xlsx', $PAY)" 2>&1); FIM=$(date +%s); wait
A=$($P -d $D -At -c "select count(*) from public.orcamentista_motor where arquivo_path = '$W/motor/c2a.xlsx'"); B=$($P -d $D -At -c "select count(*) from public.orcamentista_motor where arquivo_path = '$W/motor/c2b.xlsx'")
if echo "$SAIDA" | grep -q "arquivado" && [ "$A" = "1" ] && [ "$B" = "0" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 2 — a segunda troca do mesmo motor espera, ve o antigo arquivado e recusa; um so motor novo (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 2: a=$A b=$B esperou $((FIM-INI)) s saida=$SAIDA"; fi
restaurar

# CORRIDA 3 — uma etapa APONTANDO um motor sem uso (segura o motor) e EDITÁ-LO no meio: a edição espera, vê a etapa e RECUSA
M=$($P -d $D -At -c "select (public.superadmin_criar_motor('$SU', '$R', 'PERSIANAS', 'PVC', '$R/motor/c3.xlsx', 'c3.xlsx', $PAY) ->> 'motor_id')" | head -1)
MP3=$($P -d $D -At -c "insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('$T', 'Corrida 3', 9, 'PVC') returning id" | head -1)
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$MP3', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"}]'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_editar_motor('$SU', '$M', '$R', 'FERRAGENS', '$R/motor/c3.xlsx')" 2>&1); FIM=$(date +%s); wait
CAT=$($P -d $D -At -c "select categoria_chave from public.orcamentista_motor where id = '$M'")
if echo "$SAIDA" | grep -q "o motor tem uso (1 etapa(s)" && [ "$CAT" = "PERSIANAS" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 3 — editar espera a etapa que aponta o motor, ve a etapa e recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 3: categoria=$CAT esperou $((FIM-INI)) s saida=$SAIDA"; fi
$P -d $D -c "delete from public.orcamentista_familia_etapa where materia_prima_id = '$MP3'; delete from public.orcamentista_materia_prima where id = '$MP3'" >/dev/null
