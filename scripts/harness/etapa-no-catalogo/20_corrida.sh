#!/bin/bash
# As CORRIDAS da 20261031000002, com duas sessões de verdade. $1 = o psql; $2 = o banco. Saída: `ok:` / `FALHOU`. Cada corrida desfaz o que fez.
P=$1; D=$2
T=20e08592-f957-4e72-b7eb-251387e34eb9; SU=e0000000-0000-0000-0000-000000000001; PV=79d764fe-4acd-43e2-bed9-38e20667ca3d
E1=bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d
# um item SEM uso para as duas corridas; a etapa 1 passa a apontá-lo na lista que a gravação manda
NOVO=$($P -d $D -At -c "select public.superadmin_criar_etapa_do_catalogo('$SU', 'Item da corrida', 'ENVIAR', '{}') ->> 'id'")
LISTA=$($P -d $D -At -c "select jsonb_agg(case when id = '$E1' then public.h_item(id) || jsonb_build_object('etapa_catalogo_id', '$NOVO') else public.h_item(id) end order by numero) from public.orcamentista_familia_etapa where materia_prima_id = '$PV'")
FOTO=$($P -d $D -At -c "select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e")
igual() { [ "$($P -d $D -At -c "select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e")" = "$FOTO" ]; }

# CORRIDA 1 — REMOVER o item (segura a linha) e, no meio, outra sessão gravar as etapas apontando-o: a gravação espera, vê que o item saiu e RECUSA
# com a frase (não um erro de FK)
( $P -d $D -c "begin; select public.superadmin_remover_etapa_do_catalogo('$SU', '$NOVO'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s%N)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$PV', '$LISTA'::jsonb)" 2>&1); FIM=$(date +%s%N); wait
MS=$(( (FIM-INI)/1000000 ))
if echo "$SAIDA" | grep -q "etapa 1: a etapa do catalogo nao existe" && igual && [ $MS -ge 1000 ]; then
  echo "NOTICE:  ok: corrida 1 — gravar espera a remocao do item, ve que ele saiu e recusa com a frase; as etapas intactas (esperou $MS ms)"
else echo "ERROR:  FALHOU corrida 1: esperou $MS ms saida=$SAIDA"; fi

# CORRIDA 2 — GRAVAR as etapas apontando o item (segura) e, no meio, outra sessão REMOVÊ-LO: a remoção espera, vê o uso e RECUSA nomeando a etapa
NOVO=$($P -d $D -At -c "select public.superadmin_criar_etapa_do_catalogo('$SU', 'Item da corrida', 'ENVIAR', '{}') ->> 'id'")
LISTA=$($P -d $D -At -c "select jsonb_agg(case when id = '$E1' then public.h_item(id) || jsonb_build_object('etapa_catalogo_id', '$NOVO') else public.h_item(id) end order by numero) from public.orcamentista_familia_etapa where materia_prima_id = '$PV'")
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_materia_prima('$T', '$SU', '$PV', '$LISTA'::jsonb); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s%N)
SAIDA=$($P -d $D -At -c "select public.superadmin_remover_etapa_do_catalogo('$SU', '$NOVO')" 2>&1); FIM=$(date +%s%N); wait
MS=$(( (FIM-INI)/1000000 ))
AINDA=$($P -d $D -At -c "select count(*) from public.orcamentista_etapa_catalogo where id = '$NOVO'")
if echo "$SAIDA" | grep -q 'a etapa "Item da corrida" do catalogo esta em uso em 1 etapa(s) de conta (Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 1)' \
   && [ "$AINDA" = "1" ] && [ $MS -ge 1000 ]; then
  echo "NOTICE:  ok: corrida 2 — remover espera a gravacao, ve o uso e recusa nomeando a etapa; o item fica (esperou $MS ms)"
else echo "ERROR:  FALHOU corrida 2: item=$AINDA esperou $MS ms saida=$SAIDA"; fi
# volta: a etapa 1 ao item dela, o item da corrida sai
$P -d $D -c "update public.orcamentista_familia_etapa e set etapa_catalogo_id = a.c from (select id, (select id from public.orcamentista_etapa_catalogo where ordem = 1) c from public.orcamentista_familia_etapa where id = '$E1') a where e.id = a.id;
  delete from public.orcamentista_etapa_catalogo where nome = 'Item da corrida';" >/dev/null
