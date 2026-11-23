#!/bin/bash
# HARNESS da 20261123000001 (o formato da familia). NAO TOCA PRODUCAO.
# Uso: run.sh [arquivo da migracao]. Sai 1 se algum caso falhar; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261123000001_formato_da_familia.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_formato_da_familia}
OKS=0; FALHAS=0
caso() { if [ "$2" = "$3" ]; then echo "ok: $1"; OKS=$((OKS+1)); else echo "FALHOU: $1 — esperado [$3], veio [$2]"; FALHAS=$((FALHAS+1)); fi; }
base() { $P -c "drop database if exists $1" >/dev/null 2>&1; $P -c "create database $1" >/dev/null || exit 2
  $P -d $1 -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "BASE FALHOU"; exit 2; }; }
aplica() { $P -d $1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -oE 'guarda: [^.:(]*|verificacao [0-9]: [^.]*' | head -1; }
q() { $P -d $1 -tA -c "$2" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
erro() { $P -d $1 -tA -c "$2" 2>&1 | grep -oE 'formato da familia: [^.]*|violates [a-z ]+ constraint "[a-z_]+"|permission denied' | head -1; }
T="'20e08592-f957-4e72-b7eb-251387e34eb9'"; U="'44444444-4444-4444-4444-444444444444'"; MP="'79d764fe-4acd-43e2-bed9-38e20667ca3d'"
f() { echo "select superadmin_definir_formato_da_materia_prima($1, $U, $2, $3)->>'resultado'"; }
LOG="select count(*) from superadmin_alteracao_log where tabela='orcamentista_materia_prima'"

base $D
caso 'aplica' "$(aplica $D)" ''
caso 'a linha medida recebe FABRICACAO' "$(q $D "select formato from orcamentista_materia_prima where id=$MP")" 'FABRICACAO'
caso '... com antes e depois no log, a origem e sem autor' "$(q $D "select (antes->>'formato') is null, depois->>'formato', depois->>'origem', por is null from superadmin_alteracao_log")" 't|FABRICACAO|preenchimento 20261123000001|t'
caso 'reaplica sem erro e sem logar de novo' "$(aplica $D; q $D "$LOG")" '1'
caso 'o mesmo formato: igual, sem logar' "$(q $D "$(f $T $MP "'FABRICACAO'")"; echo -n ' '; q $D "$LOG")" 'igual 1'
caso 'troca para REVENDA (caixa e espaco nao importam)' "$(q $D "$(f $T $MP "'  revenda '")"; echo -n ' '; q $D "select formato||':'||atualizado_por from orcamentista_materia_prima where id=$MP")" 'trocado REVENDA:44444444-4444-4444-4444-444444444444'
caso '... logou antes e depois, com a empresa, a funcao e o autor' "$(q $D "select tenant_id, antes->>'formato', depois->>'formato', depois->>'funcao', por from superadmin_alteracao_log order by id desc limit 1")" '20e08592-f957-4e72-b7eb-251387e34eb9|FABRICACAO|REVENDA|superadmin_definir_formato_da_materia_prima|44444444-4444-4444-4444-444444444444'
caso 'formato fora da lista: recusa' "$(erro $D "$(f $T $MP "'SERVICO'")")" 'formato da familia: o formato e FABRICACAO ou REVENDA'
caso 'formato nulo: recusa (nao volta a nao escolhido)' "$(erro $D "$(f $T $MP "null")")" 'formato da familia: o formato e FABRICACAO ou REVENDA'
caso 'materia-prima de OUTRA empresa: a mesma frase do inexistente' "$(erro $D "$(f "'22222222-2222-2222-2222-222222222222'" $MP "'REVENDA'")")" 'formato da familia: a materia-prima nao e desta empresa'
caso 'materia-prima inexistente: a mesma frase' "$(erro $D "$(f $T "'00000000-0000-0000-0000-000000000000'" "'REVENDA'")")" 'formato da familia: a materia-prima nao e desta empresa'
caso 'empresa nula: recusa' "$(erro $D "$(f null $MP "'REVENDA'")")" 'formato da familia: a empresa e a materia-prima sao obrigatorias'
caso 'a CHECK barra o formato invalido por fora' "$(erro $D "update orcamentista_materia_prima set formato='SERVICO' where id=$MP")" 'violates check constraint "orcamentista_materia_prima_formato_valido"'
caso 'a recusa nao deixou log' "$(q $D "$LOG")" '2'
caso 'anon nao executa' "$(erro $D "set role anon; $(f $T $MP "'FABRICACAO'")")" 'permission denied'
caso 'authenticated nao executa' "$(erro $D "set role authenticated; $(f $T $MP "'FABRICACAO'")")" 'permission denied'
caso 'service_role executa' "$(q $D "set role service_role; $(f $T $MP "'FABRICACAO'")")" 'trocado'
caso 'uma familia nova nasce SEM formato (nulo, nunca um default)' "$(q $D "insert into orcamentista_materia_prima (id, tenant_id, nome, familia) values (gen_random_uuid(), $T, 'Nova', 'ALU'); select count(*) from orcamentista_materia_prima where nome='Nova' and formato is null")" '1'

# CORRIDA: duas trocas da mesma familia se enfileiram (FOR UPDATE): a segunda ve o que a primeira gravou
A=$(mktemp)
( $P -d $D -tA -c "begin; $(f $T $MP "'REVENDA'"); select pg_sleep(1); commit;" >$A 2>&1 ) &
sleep 0.3
B=$(q $D "$(f $T $MP "'REVENDA'")"); wait
caso 'corrida: a primeira troca, a segunda espera e ve igual' "$(grep -oE 'trocado' $A) $B" 'trocado igual'
rm -f $A

# GUARDAS: num banco novo, nada e alterado
base ${D}_g; $P -d ${D}_g -c "drop table orcamentista_config" >/dev/null
caso 'guarda: dependencia ausente' "$(aplica ${D}_g)" "guarda: dependencia ausente no banco ${D}_g "
caso 'guarda: nada alterado' "$(q ${D}_g "select count(*) from information_schema.columns where table_name='orcamentista_materia_prima' and column_name='formato'")" '0'
base ${D}_g; $P -d ${D}_g -c "insert into orcamentista_materia_prima (id, tenant_id, nome, familia) values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Outra', 'ALU')" >/dev/null
caso 'guarda: materia-prima com familia fora da medida' "$(aplica ${D}_g)" 'guarda: 1 materia-prima'
base ${D}_g; $P -d ${D}_g -c "update orcamentista_config set modelo='REVENDA'" >/dev/null
caso 'guarda: a medida nao esta como medida (a conta nao e FABRICACAO)' "$(aplica ${D}_g)" 'guarda: a materia-prima 79d764fe nao esta como medida '
caso 'guarda: nada preenchido' "$(q ${D}_g "select count(*) from superadmin_alteracao_log")" '0'
base ${D}_g; $P -d ${D}_g -c "alter table orcamentista_materia_prima add column formato text" >/dev/null
caso 'guarda: coluna com outra forma' "$(aplica ${D}_g)" 'guarda: orcamentista_materia_prima'

# CONTRASTE do privilegio padrao: sem o REVOKE de anon e authenticated, a verificacao 5 aborta (o harness ve o defeito)
base ${D}_c; sed 's/FROM PUBLIC, anon, authenticated;/FROM PUBLIC;/' "$MIG" > /tmp/formato_contraste.sql
caso 'contraste: REVOKE so de PUBLIC aborta na verificacao 5' "$($P -d ${D}_c -v ON_ERROR_STOP=1 -f /tmp/formato_contraste.sql 2>&1 | grep -oE 'verificacao 5: [^.]*' | head -1)" 'verificacao 5: o EXECUTE da funcao nao e so do service_role'

echo "$OKS ok, $FALHAS falhas"; [ $FALHAS -eq 0 ]
