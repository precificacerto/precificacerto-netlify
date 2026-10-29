#!/bin/bash
# O gatilho adiado com COMMIT DE VERDADE (os casos de 10_casos.sql desfazem a transação e não chegam ao COMMIT). $1 = o psql; $2 = o banco.
P=$1; D=$2
RS=f2000000-0000-0000-0000-000000000002; SU=e0000000-0000-0000-0000-000000000001
n_motores() { $P -d $D -At -c "select count(*) from public.orcamentista_motor"; }

# COMMIT 1 — o motor sozinho, em autocommit: o COMMIT recusa nomeando o motor, e o motor não fica
N0=$(n_motores)
SAI=$($P -d $D -c "insert into public.orcamentista_motor (fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('$RS', 'PERSIANAS', 'c.xlsx', '$RS/motor/c1.xlsx')" 2>&1)
if echo "$SAI" | grep -q "ficou sem familia: todo motor atua em pelo menos uma familia" && [ "$(n_motores)" = "$N0" ]; then echo "NOTICE:  ok: commit 1 — o motor sem familia: o COMMIT recusa e o motor nao fica"; else echo "ERROR:  FALHOU commit 1: $SAI"; fi

# COMMIT 2 — o motor e a ligação na mesma transação: o COMMIT passa (a ligação nasce depois do motor)
M=$($P -d $D -At -c "begin; insert into public.orcamentista_motor (fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('$RS', 'PERSIANAS', 'c.xlsx', '$RS/motor/c2.xlsx') returning id; insert into public.orcamentista_motor_familia select id, 'PVC' from public.orcamentista_motor where arquivo_path = '$RS/motor/c2.xlsx'; commit;" 2>&1 | head -1)
if [ "$($P -d $D -At -c "select count(*) from public.orcamentista_motor_familia where motor_id = '$M'" 2>/dev/null)" = "1" ]; then echo "NOTICE:  ok: commit 2 — o motor e a ligacao na mesma transacao: o COMMIT passa"; else echo "ERROR:  FALHOU commit 2: $M"; fi

# COMMIT 3 — tirar a única ligação de um motor sem uso, em autocommit: o COMMIT recusa e a ligação fica; tirar o motor (CASCADE) passa
SAI=$($P -d $D -c "delete from public.orcamentista_motor_familia where motor_id = '$M'" 2>&1)
L=$($P -d $D -At -c "select count(*) from public.orcamentista_motor_familia where motor_id = '$M'")
$P -d $D -c "delete from public.orcamentista_motor where id = '$M'" >/dev/null 2>&1
if echo "$SAI" | grep -q "o motor $M ficou sem familia" && [ "$L" = "1" ] && [ "$(n_motores)" = "$N0" ]; then echo "NOTICE:  ok: commit 3 — tirar a unica familia: o COMMIT recusa; apagar o motor sem uso passa"; else echo "ERROR:  FALHOU commit 3: ligacoes=$L motores=$(n_motores) $SAI"; fi

# COMMIT 4 — a função de criar, em autocommit: o motor e as duas ligações ficam
M=$($P -d $D -At -c "select public.superadmin_criar_motor('$SU', '$RS', 'PERSIANAS', array['PVC', 'ALUMINIO'], '$RS/motor/c4.xlsx', 'c4.xlsx', public.h_payload(1)) ->> 'motor_id'" 2>&1)
F=$($P -d $D -At -c "select public.h_familias('$M')" 2>&1)
if [ "$F" = "ALUMINIO,PVC" ]; then echo "NOTICE:  ok: commit 4 — criar motor pela funcao, com commit: o motor e as 2 ligacoes ficam"; else echo "ERROR:  FALHOU commit 4: $M $F"; fi
