#!/bin/bash
# CASO DE CONCORRÊNCIA — duas sessões gravando a PRIMEIRA linha da mesma empresa ao mesmo tempo.
# Sem a trava (`pg_advisory_xact_lock`), a segunda lê "antes = nada" (a linha da primeira ainda não
# foi confirmada), espera no ON CONFLICT e, ao entrar, grava `{} || corpo` por cima — APAGANDO o que
# a primeira gravou, e logando um "antes" falso. Com a trava, a segunda espera a primeira terminar
# e lê o antes verdadeiro. Imprime `ok:` ou `FALHOU:`.
P="$1"; D=harness_base_de_conhecimento
T="'aaaaaaaa-0000-4000-8000-000000000002'"; S="'bbbbbbbb-0000-4000-8000-000000000001'"
$P -d $D -c "BEGIN; SELECT public.superadmin_gravar_base_da_empresa($T, $S, '{\"linha_perfil\": \"Um\"}', NULL); SELECT pg_sleep(2); COMMIT;" >/dev/null 2>&1 &
sleep 0.7
$P -d $D -c "SELECT public.superadmin_gravar_base_da_empresa($T, $S, '{\"solda\": \"Dois\"}', NULL);" >/dev/null 2>&1
wait
R=$($P -d $D -At -c "SELECT coalesce(linha_perfil, 'NULO') || '/' || coalesce(solda, 'NULO') FROM public.orcamentista_esquadrias_base WHERE tenant_id = $T")
A=$($P -d $D -At -c "SELECT coalesce(antes -> 'orcamentista_esquadrias_base' ->> 'linha_perfil', 'NULO') FROM public.superadmin_alteracao_log WHERE tenant_id = $T ORDER BY em DESC LIMIT 1")
if [ "$R" = "Um/Dois" ] && [ "$A" = "Um" ]; then
  echo "ok: 19 concorrência: a segunda gravação espera a primeira, não apaga o que ela gravou, e loga o antes verdadeiro"
else
  echo "FALHOU 19: concorrência — linha=$R, antes logado=$A (esperado Um/Dois e Um)"
fi
