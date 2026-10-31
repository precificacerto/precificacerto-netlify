#!/bin/bash
# As CORRIDAS da 20261031000001, com duas sessões de verdade. $1 = o psql; $2 = o banco. Saída: `ok:` / `FALHOU`. Cada corrida desfaz o que fez.
P=$1; D=$2
T=20e08592-f957-4e72-b7eb-251387e34eb9; SU=e0000000-0000-0000-0000-000000000001; PV=79d764fe-4acd-43e2-bed9-38e20667ca3d
E1=bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d; E2=ed9a9b06-d898-4f75-8487-e260d8ba8ec0; E3=dd8d3526-f08e-47e1-81c3-a6770214516f
# a foto das 3, para voltar ao estado de produção depois de cada corrida (o log fica: os casos já rodaram)
restaurar() { $P -d $D -c "delete from public.orcamentista_familia_etapa where materia_prima_id = '$PV'; insert into public.orcamentista_familia_etapa select * from public.h_etapas_antes_da_000001 where materia_prima_id = '$PV';" >/dev/null; }
lista() { $P -d $D -At -c "select jsonb_agg(public.h_item(x) order by o) from unnest(array[$1]::uuid[]) with ordinality u(x, o)"; }

# CORRIDA 1 — REMOVER a 2 (segura a família) e, no meio, outra sessão salvar a lista INTEIRA, com a 2: espera, vê que a 2 saiu e RECUSA (não a recria)
L13=$(lista "'$E1','$E3'"); L123=$(lista "'$E1','$E2','$E3'")
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$PV', '$L13'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$PV', '$L123'::jsonb)" 2>&1); FIM=$(date +%s); wait
N2=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_etapa where id = '$E2'")
NS=$($P -d $D -At -c "select string_agg(numero::text, ',' order by numero) from public.orcamentista_familia_etapa where materia_prima_id = '$PV'")
if echo "$SAIDA" | grep -q "etapa 2: o id nao e de uma etapa desta familia" && [ "$N2" = "0" ] && [ "$NS" = "1,2" ] && [ $((FIM-INI)) -ge 1 ]; then
  echo "NOTICE:  ok: corrida 1 — salvar a lista inteira espera a remocao, ve a 2 fora e recusa, sem recria-la (esperou $((FIM-INI)) s)"
else echo "ERROR:  FALHOU corrida 1: e2=$N2 numeros=$NS esperou $((FIM-INI)) s saida=$SAIDA"; fi
restaurar

# CORRIDA 2 — RENOMEAR a 2 (segura a família) e, no meio, outra sessão REMOVÊ-LA: a remoção espera, e o log da remoção guarda o rótulo NOVO (o que
# estava gravado quando ela saiu, não o que a segunda sessão leu antes)
L123N=$($P -d $D -At -c "select jsonb_agg(case when x = '$E2' then public.h_item(x) || jsonb_build_object('rotulo', 'Renomeada na corrida') else public.h_item(x) end order by o) from unnest(array['$E1','$E2','$E3']::uuid[]) with ordinality u(x, o)")
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$PV', '$L123N'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$PV', '$L13'::jsonb) -> 'etapas_removidas' -> 0 ->> 'rotulo'" 2>&1); FIM=$(date +%s); wait
LOG=$($P -d $D -At -c "select l.antes -> 'orcamentista_familia_etapa' ->> 'rotulo' from public.superadmin_alteracao_log l where l.chave = '$E2' and (l.antes ->> 'remocao_da_etapa')::boolean order by l.em desc limit 1")
if [ "$SAIDA" = "Renomeada na corrida" ] && [ "$LOG" = "Renomeada na corrida" ] && [ $((FIM-INI)) -ge 1 ]; then
  echo "NOTICE:  ok: corrida 2 — remover espera a renomeacao, e o log e a resposta trazem o rotulo novo (esperou $((FIM-INI)) s)"
else echo "ERROR:  FALHOU corrida 2: resposta=$SAIDA log=$LOG esperou $((FIM-INI)) s"; fi
restaurar
