#!/bin/bash
# As CORRIDAS da 20261029000004, com duas sessões de verdade. $1 = o psql; $2 = o banco. Saída: `ok:` / `FALHOU`. Cada corrida desfaz o que fez.
P=$1; D=$2
T=20e08592-f957-4e72-b7eb-251387e34eb9; SU=e0000000-0000-0000-0000-000000000001
criar() { $P -d $D -c "select public.superadmin_criar_familia('$SU', 'VECA', 'PVC Veca', array['PERFIL'])" >/dev/null 2>&1; }
limpar() { $P -d $D -c "delete from public.orcamentista_materia_prima where familia = 'VECA'; delete from public.orcamentista_familia_ramificacao where familia = 'VECA'; delete from public.orcamentista_familia_catalogo where chave = 'VECA'" >/dev/null 2>&1; }

# CORRIDA 1 — REMOVER a família (segura a linha) e, no meio, uma matéria-prima apontá-la: o INSERT espera, e esbarra na FK — a família saiu
criar
( $P -d $D -c "begin; select public.superadmin_remover_familia('$SU', 'VECA'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('$T', 'Corrida 1', 30, 'VECA')" 2>&1); FIM=$(date +%s); wait
F=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_catalogo where chave = 'VECA'"); M=$($P -d $D -At -c "select count(*) from public.orcamentista_materia_prima where familia = 'VECA'")
if echo "$SAIDA" | grep -q "foreign key" && [ "$F" = "0" ] && [ "$M" = "0" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 1 — apontar a familia espera a remocao e esbarra na FK: nada aponta familia que nao existe (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 1: familia=$F mps=$M esperou $((FIM-INI)) s saida=$SAIDA"; fi
limpar

# CORRIDA 2 — uma matéria-prima APONTANDO a família (segura a chave) e REMOVER no meio: a remoção espera, conta a matéria-prima e RECUSA nomeando-a
criar
( $P -d $D -c "begin; insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('$T', 'Corrida 2', 31, 'VECA'); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1; INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_remover_familia('$SU', 'VECA')" 2>&1); FIM=$(date +%s); wait
F=$($P -d $D -At -c "select count(*) from public.orcamentista_familia_catalogo where chave = 'VECA'")
if echo "$SAIDA" | grep -q "esta em uso: 1 materia(s)-prima(s) (Esquadrias De Paula Ltda / Corrida 2)" && [ "$F" = "1" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 2 — remover espera a materia-prima que aponta a familia, conta-a e recusa nomeando (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 2: familia=$F esperou $((FIM-INI)) s saida=$SAIDA"; fi
limpar
