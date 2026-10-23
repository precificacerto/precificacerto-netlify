#!/bin/bash
# HARNESS dos três níveis — o caso de CONCORRÊNCIA. NÃO TOCA PRODUÇÃO.
#
# Duas sessões gravam matérias-primas da MESMA empresa, na primeira gravação dela: não há linha
# para o FOR UPDATE travar, e só o `pg_advisory_xact_lock` serializa. A segunda tem de esperar a
# primeira, e o log dela tem de ter no ANTES o que a primeira gravou. Sem o lock, o antes da
# segunda sai vazio — e o log mente. Mutação B19 do README.
#
# Uso: 20_concorrencia.sh "<psql>" <banco>   (chamado por run.sh)
P="$1"; D="$2"
T=00000000-0000-0000-0000-0000000000c3; S=00000000-0000-0000-0000-00000000005a
$P -d $D -c "BEGIN; SELECT superadmin_gravar_materia_prima('$T','$S','[{\"nome\":\"PVC\"}]'); SELECT pg_sleep(2); COMMIT;" >/dev/null 2>&1 &
sleep 0.7
$P -d $D -c "SELECT superadmin_gravar_materia_prima('$T','$S','[{\"nome\":\"Alumínio\"}]');" >/dev/null 2>&1
wait
R=$($P -d $D -At -c "SELECT (antes -> 'orcamentista_materia_prima')::text FROM superadmin_alteracao_log WHERE tenant_id = '$T' AND (depois::text LIKE '%Alumínio%') ORDER BY em DESC LIMIT 1")
if echo "$R" | grep -q '"PVC"'; then
  echo "ok: concorrencia: a segunda gravacao esperou a primeira, e o ANTES do log dela tem o PVC"
else
  echo "FALHOU: concorrencia: o antes da segunda gravacao nao viu a primeira: $R"
fi
