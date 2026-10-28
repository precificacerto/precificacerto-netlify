#!/bin/bash
# As CORRIDAS, com duas sessões de verdade. $1 = o psql; $2 = o banco. Saída: `ok:` / `FALHOU`.
P=$1; D=$2
T=20e08592-f957-4e72-b7eb-251387e34eb9; MP=79d764fe-4acd-43e2-bed9-38e20667ca3d; SU=e0000000-0000-0000-0000-000000000001; W=9a233c55-f377-45d3-b2ae-b1a740a98e44
LISTA='[{"id":"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d","rotulo":"a","acao":"APANHAR"},{"id":"ed9a9b06-d898-4f75-8487-e260d8ba8ec0","rotulo":"b","acao":"APANHAR"},{"id":"dd8d3526-f08e-47e1-81c3-a6770214516f","rotulo":"c","acao":"APANHAR"},{"rotulo":"d","acao":"ENVIAR"}]'

# CORRIDA 1 — gravar as etapas (segura a família) e trocar o tipo dela no meio: a troca espera, vê a etapa nova e RECUSA
MP2=$($P -d $D -At -c "insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('$T', 'Corrida 1', 9, 'PVC') returning id" | head -1)
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$MP2', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\"}]'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_definir_familia_da_materia_prima('$T', '$SU', '$MP2', 'ALUMINIO')" 2>&1); FIM=$(date +%s); wait
FAM=$($P -d $D -At -c "select familia from public.orcamentista_materia_prima where id = '$MP2'")
if echo "$SAIDA" | grep -q "etapa(s) cadastrada(s)" && [ "$FAM" = "PVC" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 1 — trocar o tipo espera a gravacao das etapas, ve a etapa nova e recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 1: familia=$FAM esperou $((FIM-INI)) s saida=$SAIDA"; fi
$P -d $D -c "delete from public.orcamentista_familia_etapa where materia_prima_id = '$MP2'; delete from public.orcamentista_materia_prima where id = '$MP2'" >/dev/null

# CORRIDA 2 — trocar o tipo PRIMEIRO (segura a linha) e gravar as etapas no meio: a gravação espera e grava com o tipo NOVO
MP3=$($P -d $D -At -c "insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('$T', 'Corrida 2', 9, 'PVC') returning id" | head -1)
( $P -d $D -c "begin; select public.superadmin_definir_familia_da_materia_prima('$T', '$SU', '$MP3', 'ALUMINIO'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$MP3', '[{\"rotulo\":\"x\",\"acao\":\"APANHAR\"}]'::jsonb)" 2>&1); FIM=$(date +%s); wait
FE=$($P -d $D -At -c "select familia from public.orcamentista_familia_etapa where materia_prima_id = '$MP3'")
if [ "$FE" = "ALUMINIO" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 2 — gravar as etapas espera a troca do tipo e grava com o tipo novo (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 2: familia da etapa=$FE esperou $((FIM-INI)) s saida=$SAIDA"; fi
$P -d $D -c "delete from public.orcamentista_familia_etapa where materia_prima_id = '$MP3'; delete from public.orcamentista_materia_prima where id = '$MP3'" >/dev/null

# CORRIDA 3 — arquivar um motor (segura a linha) e uma etapa apontá-lo no meio: a etapa espera, vê o motor arquivado e RECUSA
M=$($P -d $D -At -c "insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('PVC', 'f2000000-0000-0000-0000-000000000002', 'PERSIANAS', 'c.xlsx', 'f2000000-0000-0000-0000-000000000002/motor/c.xlsx') returning id" | head -1)
( $P -d $D -c "begin; select public.superadmin_arquivar_motor('$M', '$SU'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$MP', '[{\"id\":\"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d\",\"rotulo\":\"a\",\"acao\":\"APANHAR\",\"motor_id\":\"$M\"},{\"id\":\"ed9a9b06-d898-4f75-8487-e260d8ba8ec0\",\"rotulo\":\"b\",\"acao\":\"APANHAR\"},{\"id\":\"dd8d3526-f08e-47e1-81c3-a6770214516f\",\"rotulo\":\"c\",\"acao\":\"APANHAR\"}]'::jsonb)" 2>&1); FIM=$(date +%s); wait
N=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where motor_id = '$M'")
if echo "$SAIDA" | grep -q "o motor esta arquivado" && [ "$N" = "0" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 3 — apontar a etapa espera o arquivamento, ve o motor arquivado e recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 3: etapas=$N esperou $((FIM-INI)) s saida=$SAIDA"; fi

# CORRIDA 4 — duas gravações da MESMA família, cada uma com uma etapa nova: a segunda espera, vê a etapa da primeira fora da sua lista e RECUSA
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$MP', '[{\"id\":\"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d\",\"rotulo\":\"a\",\"acao\":\"APANHAR\"},{\"id\":\"ed9a9b06-d898-4f75-8487-e260d8ba8ec0\",\"rotulo\":\"b\",\"acao\":\"APANHAR\"},{\"id\":\"dd8d3526-f08e-47e1-81c3-a6770214516f\",\"rotulo\":\"c\",\"acao\":\"APANHAR\"},{\"rotulo\":\"Primeira\",\"acao\":\"ENVIAR\"}]'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$MP', '[{\"id\":\"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d\",\"rotulo\":\"a\",\"acao\":\"APANHAR\"},{\"id\":\"ed9a9b06-d898-4f75-8487-e260d8ba8ec0\",\"rotulo\":\"b\",\"acao\":\"APANHAR\"},{\"id\":\"dd8d3526-f08e-47e1-81c3-a6770214516f\",\"rotulo\":\"c\",\"acao\":\"APANHAR\"},{\"rotulo\":\"Segunda\",\"acao\":\"ENVIAR\"}]'::jsonb)" 2>&1); FIM=$(date +%s); wait
N=$($P -d $D -At -c "select string_agg(rotulo, ',' order by numero) from public.orcamentista_familia_etapa where materia_prima_id = '$MP' and numero = 4")
if echo "$SAIDA" | grep -q "nao veio na lista" && [ "$N" = "Primeira" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 4 — a segunda gravacao da mesma familia espera, ve a etapa da primeira fora da lista e recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 4: etapa 4=$N esperou $((FIM-INI)) s saida=$SAIDA"; fi
$P -d $D -c "delete from public.orcamentista_familia_etapa where materia_prima_id = '$MP' and numero = 4; update public.orcamentista_familia_etapa e set rotulo = a.rotulo, acao = a.acao, motor_id = a.motor_id from public.h_etapas_antes a where a.id = e.id" >/dev/null

# CORRIDA 5 — uma etapa apontando o motor (segura o motor) e arquivá-lo no meio: o arquivamento espera, vê a etapa e RECUSA
M2=$($P -d $D -At -c "insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('PVC', 'f2000000-0000-0000-0000-000000000002', 'PERSIANAS', 'd.xlsx', 'f2000000-0000-0000-0000-000000000002/motor/d.xlsx') returning id" | head -1)
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$MP', '[{\"id\":\"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d\",\"rotulo\":\"a\",\"acao\":\"APANHAR\",\"motor_id\":\"$M2\"},{\"id\":\"ed9a9b06-d898-4f75-8487-e260d8ba8ec0\",\"rotulo\":\"b\",\"acao\":\"APANHAR\"},{\"id\":\"dd8d3526-f08e-47e1-81c3-a6770214516f\",\"rotulo\":\"c\",\"acao\":\"APANHAR\"}]'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_arquivar_motor('$M2', '$SU')" 2>&1); FIM=$(date +%s); wait
ARQ=$($P -d $D -At -c "select arquivado_em is null from public.orcamentista_motor where id = '$M2'")
if echo "$SAIDA" | grep -q "aponte a etapa para outro motor" && [ "$ARQ" = "t" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 5 — arquivar espera a etapa que aponta o motor, ve a etapa e recusa (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 5: nao-arquivado=$ARQ esperou $((FIM-INI)) s saida=$SAIDA"; fi
$P -d $D -c "update public.orcamentista_familia_etapa e set rotulo = a.rotulo, acao = a.acao, motor_id = a.motor_id from public.h_etapas_antes a where a.id = e.id" >/dev/null
