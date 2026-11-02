#!/bin/bash
# As CORRIDAS da 20261102000002, em duas sessões de verdade, cada uma numa cópia nova da base. $1 = o psql, $2 = a base.
P=$1; D=$2; C=${D}_corrida
SA=e0000000-0000-0000-0000-000000000001
nova() { $P -c "drop database if exists $C" >/dev/null 2>&1; $P -c "create database $C template $D" >/dev/null; }

# CORRIDA 1: duas remoções da mesma categoria: uma remove (log uma vez), a outra espera e recebe P0002
nova
A=$($P -d $C -At -c "select public.superadmin_arrasto_do_catalogo('categoria', 'PERSIANAS') ->> 'assinatura'")
( $P -d $C -At -c "begin; select public.superadmin_remover_do_catalogo('$SA', 'categoria', 'PERSIANAS', '$A'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_remover_do_catalogo('$SA', 'categoria', 'PERSIANAS', '$A')" 2>&1); wait
if echo "$OUT" | grep -q "o item do catalogo nao existe" && [ "$($P -d $C -At -c "select count(*) from orcamentista_categoria_catalogo where chave = 'PERSIANAS'")" = "0" ] \
   && [ "$($P -d $C -At -c "select count(*) from superadmin_alteracao_log where antes -> 'remocao_do_catalogo' ->> 'tipo' = 'categoria' and tabela = 'orcamentista_categoria_catalogo'")" = "1" ]; then
  echo "NOTICE:  ok: corrida 1 — duas remocoes da mesma categoria: uma remove (logada uma vez), a outra espera e recebe P0002"
else echo "ERROR:  FALHOU corrida 1: $OUT"; fi

# CORRIDA 2: remover a categoria (transação aberta) x editar o rótulo dela: a edição espera a remoção e recebe P0002 (categoria inexistente), sem gravar
nova
A=$($P -d $C -At -c "select public.superadmin_arrasto_do_catalogo('categoria', 'PERSIANAS') ->> 'assinatura'")
( $P -d $C -At -c "begin; select public.superadmin_remover_do_catalogo('$SA', 'categoria', 'PERSIANAS', '$A'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_editar_categoria('$SA', 'categoria' , 'Persianas e cortinas')" 2>&1); OUT=$($P -d $C -At -c "select public.superadmin_editar_categoria('$SA', 'PERSIANAS', 'Persianas e cortinas')" 2>&1); wait
if echo "$OUT" | grep -q "categoria inexistente" && [ "$($P -d $C -At -c "select count(*) from orcamentista_categoria_catalogo where chave = 'PERSIANAS'")" = "0" ] \
   && [ "$($P -d $C -At -c "select count(*) from superadmin_alteracao_log where tabela = 'orcamentista_categoria_catalogo' and chave = 'PERSIANAS' and depois is not null")" = "0" ]; then
  echo "NOTICE:  ok: corrida 2 — remover a categoria x editar o rotulo dela: a edicao espera e recebe P0002, sem gravar"
else echo "ERROR:  FALHOU corrida 2: $OUT"; fi

# CORRIDA 3: duas criações com o mesmo nome (chaves diferentes) ao mesmo tempo: a trava de aviso serializa, e a segunda recebe "o nome nao se repete"
nova
( $P -d $C -At -c "begin; select public.superadmin_criar_categoria('$SA', 'TELAS', 'Telas mosquiteiras'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
OUT=$($P -d $C -At -c "select public.superadmin_criar_categoria('$SA', 'TELAS_2', 'telas mosquiteiras')" 2>&1); wait
if echo "$OUT" | grep -q "o nome nao se repete" && [ "$($P -d $C -At -c "select count(*) from orcamentista_categoria_catalogo where lower(rotulo) = 'telas mosquiteiras'")" = "1" ]; then
  echo "NOTICE:  ok: corrida 3 — duas criacoes com o mesmo nome ao mesmo tempo: a segunda espera a trava e e recusada"
else echo "ERROR:  FALHOU corrida 3: $OUT"; fi
# CORRIDA 4: editar o rótulo (transação aberta) x remover a categoria: a remoção TRAVA a linha antes de medir, espera a edição, e o log nomeia a
# categoria pelo rótulo NOVO nos dois lugares (a origem e a linha apagada) — sem a trava, a origem levaria o rótulo velho
nova
( $P -d $C -At -c "begin; select public.superadmin_editar_categoria('$SA', 'PERSIANAS', 'Persianas e cortinas'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
A=$($P -d $C -At -c "select public.superadmin_arrasto_do_catalogo('categoria', 'PERSIANAS') ->> 'assinatura'")
OUT=$($P -d $C -At -c "select public.superadmin_remover_do_catalogo('$SA', 'categoria', 'PERSIANAS', '$A') ->> 'nome'" 2>&1); wait
if [ "$OUT" = "Persianas e cortinas" ] && [ "$($P -d $C -At -c "select count(*) from superadmin_alteracao_log where tabela = 'orcamentista_categoria_catalogo' and antes -> 'remocao_do_catalogo' ->> 'nome' = 'Persianas e cortinas' and antes -> 'orcamentista_categoria_catalogo' ->> 'rotulo' = 'Persianas e cortinas' and depois is null")" = "1" ]; then
  echo "NOTICE:  ok: corrida 4 — editar o rotulo x remover: a remocao trava a linha, espera a edicao, e nomeia a categoria pelo rotulo novo"
else echo "ERROR:  FALHOU corrida 4: $OUT"; fi
$P -c "drop database if exists $C" >/dev/null 2>&1
