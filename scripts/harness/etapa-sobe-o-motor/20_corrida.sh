#!/bin/bash
# As CORRIDAS de criar_motor_da_etapa com duas sessões de verdade. Saída: linhas `ok:` / `FALHOU`.
# Usa o banco já montado por run.sh (depois de 10_casos.sql, que deixa h_payload). $1 = o psql; $2 = o banco.
P=$1; D=$2
U=e0000000-0000-0000-0000-000000000001; E=e1000000-0000-0000-0000-000000000001
limpa() { $P -d $D -c "update public.orcamentista_familia_etapa set motor_id = null where id = '$E'" >/dev/null; }
criar() { echo "select public.superadmin_criar_motor_da_etapa('$E', '$U', 'familia/PVC/motor/$1.xlsx', '$1.xlsx', public.h_payload(2))"; }

# CORRIDA 3 — duas subidas do arquivo na MESMA etapa: a segunda espera a primeira e a vê (motor_anterior = o da primeira)
limpa
( $P -d $D -At -c "begin; $(criar corrida-a); select pg_sleep(3); commit;" > /tmp/zz_corrida3_a.txt 2>&1 ) &
sleep 1
INI=$(date +%s)
SAIDA=$($P -d $D -At -c "$(criar corrida-b)" 2>&1)
FIM=$(date +%s)
wait
MA=$(grep -o '"motor_id": "[0-9a-f-]*"' /tmp/zz_corrida3_a.txt | head -1 | grep -o '[0-9a-f-]\{36\}')
MB=$(echo "$SAIDA" | grep -o '"motor_id": "[0-9a-f-]*"' | head -1 | grep -o '[0-9a-f-]\{36\}')
ANT=$(echo "$SAIDA" | grep -o '"motor_anterior": "[0-9a-f-]*"' | grep -o '[0-9a-f-]\{36\}')
APONTA=$($P -d $D -At -c "select motor_id from public.orcamentista_familia_etapa where id = '$E'")
if [ -n "$MA" ] && [ -n "$MB" ] && [ "$ANT" = "$MA" ] && [ "$APONTA" = "$MB" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 3 — a segunda subida espera a primeira e a ve: motor_anterior e o dela, a etapa fica no ultimo (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 3: A=$MA B=$MB anterior=$ANT aponta=$APONTA esperou $((FIM-INI)) s saida=$SAIDA"; fi

# CORRIDA 4 — gravar a lista de etapas (segurando a família) e subir o arquivo: a subida espera e o motor anterior dela é o que a lista gravou
limpa
MX=$($P -d $D -At -c "select id from public.orcamentista_motor where familia = 'PVC' and fornecedor_id is null order by criado_em limit 1")
( $P -d $D -c "begin; select public.superadmin_gravar_etapas_da_familia('PVC', '$U', (select jsonb_agg(jsonb_build_object('id', id, 'rotulo', rotulo, 'acao', acao, 'motor_id', case when id = '$E' then '$MX'::uuid end) order by numero) from public.orcamentista_familia_etapa where familia = 'PVC')); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1
INI=$(date +%s)
SAIDA=$($P -d $D -At -c "$(criar corrida-c)" 2>&1)
FIM=$(date +%s)
wait
ANT=$(echo "$SAIDA" | grep -o '"motor_anterior": "[0-9a-f-]*"' | grep -o '[0-9a-f-]\{36\}')
if [ -n "$MX" ] && [ "$ANT" = "$MX" ] && [ $((FIM-INI)) -ge 1 ]; then echo "NOTICE:  ok: corrida 4 — a subida espera a gravacao da lista e a ve: motor_anterior e o que a lista gravou (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 4: lista gravou=$MX anterior=$ANT esperou $((FIM-INI)) s saida=$SAIDA"; fi

# CORRIDA 5 — o inverso: a subida segura a família e a gravação da lista espera; depois dela a lista ainda manda no motor da etapa (a lista que veio com o motor ANTIGO volta a apontá-lo — a tela relê antes)
limpa
( $P -d $D -At -c "begin; $(criar corrida-d); select pg_sleep(3); commit;" > /tmp/zz_corrida5_a.txt 2>&1 ) &
sleep 1
INI=$(date +%s)
SAIDA=$($P -d $D -At -c "select public.superadmin_gravar_etapas_da_familia('PVC', '$U', (select jsonb_agg(jsonb_build_object('id', id, 'rotulo', rotulo, 'acao', acao) order by numero) from public.orcamentista_familia_etapa where familia = 'PVC'))" 2>&1)
FIM=$(date +%s)
wait
MD=$(grep -o '"motor_id": "[0-9a-f-]*"' /tmp/zz_corrida5_a.txt | head -1 | grep -o '[0-9a-f-]\{36\}')
APONTA=$($P -d $D -At -c "select motor_id from public.orcamentista_familia_etapa where id = '$E'")
# a lista SEM o campo motor_id mantém o motor que a etapa já tem — o que a subida pôs
if [ -n "$MD" ] && [ "$APONTA" = "$MD" ] && [ $((FIM-INI)) -ge 1 ] && ! echo "$SAIDA" | grep -q ERROR; then echo "NOTICE:  ok: corrida 5 — a gravacao da lista espera a subida e, sem o campo motor_id, mantem o motor novo (esperou $((FIM-INI)) s)"; else echo "ERROR:  FALHOU corrida 5: subida=$MD aponta=$APONTA esperou $((FIM-INI)) s saida=$SAIDA"; fi
limpa
