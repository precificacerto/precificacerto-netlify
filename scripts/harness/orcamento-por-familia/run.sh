#!/bin/bash
# HARNESS da 20261123000002 (a sigla da familia e o orcamento por familia) e da 20261123000003 (solta o um por levantamento). NAO TOCA PRODUCAO.
# Uso: run.sh [migracao 2] [migracao 3]. Sai 1 se algum caso falhar; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261123000002_um_orcamento_por_familia.sql}
MIG3=${2:-$R/supabase/migrations/20261123000003_solta_o_um_por_levantamento.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_orcamento_por_familia}
OKS=0; FALHAS=0
caso() { if [ "$2" = "$3" ]; then echo "ok: $1"; OKS=$((OKS+1)); else echo "FALHOU: $1 — esperado [$3], veio [$2]"; FALHAS=$((FALHAS+1)); fi; }
base() { $P -c "drop database if exists $1" >/dev/null 2>&1; $P -c "create database $1" >/dev/null || exit 2
  $P -d $1 -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "BASE FALHOU"; exit 2; }
  $P -d $1 -v ON_ERROR_STOP=1 -f $S/01_criar_familia_de_producao.sql >/dev/null 2>&1 || { echo "BASE FALHOU (funcao)"; exit 2; }; }
aplica() { $P -d $1 -v ON_ERROR_STOP=1 -f "$2" 2>&1 | grep -oE 'guarda: [^.:(]*|verificacao [0-9]: [^.]*' | head -1; }
q() { $P -d $1 -tA -c "$2" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
erro() { $P -d $1 -tA -c "$2" 2>&1 | grep -oE 'a familia nova pede a sigla[^:.]*|a sigla da familia tem exatamente 3 letras|a sigla [A-Z]+ ja e da familia|a sigla da familia [A-Z]+ e [A-Z]+ e nao muda|violates [a-z ]+ constraint "[a-z_]+"|duplicate key value violates unique constraint "[a-z_]+"|permission denied|null value in column "[a-z_]+"' | head -1; }
U="'44444444-4444-4444-4444-444444444444'"
cria() { echo "select superadmin_criar_familia($U, $1, $2, array['PERFIL'], $3)->'orcamentista_familia_catalogo'->>'sigla'"; }
LOG="select count(*) from superadmin_alteracao_log where tabela='orcamentista_familia_catalogo'"
T="'20e08592-f957-4e72-b7eb-251387e34eb9'"

base $D
caso 'a funcao de producao e a lida em producao (md5)' "$(q $D "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='superadmin_criar_familia'")" 'aa798afd03594cbd48d261a29af36188'
caso 'aplica' "$(aplica $D $MIG)" ''
caso 'a PVC recebe a sigla PVC' "$(q $D "select sigla from orcamentista_familia_catalogo where chave='PVC'")" 'PVC'
caso '... com antes e depois no log, a origem, sem autor e sem empresa' "$(q $D "select (antes->>'sigla') is null, depois->>'sigla', depois->>'origem', por is null, tenant_id is null from superadmin_alteracao_log")" 't|PVC|preenchimento 20261123000002|t|t'
caso 'reaplica sem erro e sem logar de novo' "$(aplica $D $MIG; q $D "$LOG")" '1'
caso 'nenhum orcamento foi tocado: os 12 com a familia nula' "$(q $D "select count(*) filter (where familia is null), count(*) from orcamentista_orcamento")" '12|12'
caso 'criar com a sigla (caixa e espaco nao importam)' "$(q $D "$(cria "'ALUMINIO'" "'Aluminio Suprema'" "' alu '")")" 'ALU'
caso '... logou a familia nova com a sigla' "$(q $D "select depois->'orcamentista_familia_catalogo'->>'sigla' from superadmin_alteracao_log where chave='ALUMINIO'")" 'ALU'
caso 'sem sigla: recusa nomeada' "$(erro $D "$(cria "'VIDRO_TEMP'" "'Temperado'" "null")")" 'a familia nova pede a sigla de 3 letras (ex'
caso 'sigla vazia: recusa nomeada' "$(erro $D "$(cria "'VIDRO_TEMP'" "'Temperado'" "'  '")")" 'a familia nova pede a sigla de 3 letras (ex'
caso 'sigla de 2 letras: recusa' "$(erro $D "$(cria "'VIDRO_TEMP'" "'Temperado'" "'AL'")")" 'a sigla da familia tem exatamente 3 letras'
caso 'sigla de 4 letras: recusa' "$(erro $D "$(cria "'VIDRO_TEMP'" "'Temperado'" "'ALUM'")")" 'a sigla da familia tem exatamente 3 letras'
caso 'sigla com numero: recusa' "$(erro $D "$(cria "'VIDRO_TEMP'" "'Temperado'" "'AL1'")")" 'a sigla da familia tem exatamente 3 letras'
caso 'sigla com acento: recusa' "$(erro $D "$(cria "'VIDRO_TEMP'" "'Temperado'" "'ALÚ'")")" 'a sigla da familia tem exatamente 3 letras'
caso 'sigla repetida: recusa nomeando a familia dela' "$(erro $D "$(cria "'VIDRO_TEMP'" "'Temperado'" "'pvc'")")" 'a sigla PVC ja e da familia'
caso 'a recusa nao criou a familia nem logou' "$(q $D "select count(*) from orcamentista_familia_catalogo where chave='VIDRO_TEMP'"; echo -n ' '; q $D "$LOG")" '0 2'
caso 'a assinatura de antes (sem sigla): recusa nomeada, nunca o NOT NULL' "$(erro $D "select superadmin_criar_familia($U, 'VIDRO_TEMP', 'Temperado', array['PERFIL'])")" 'a familia nova pede a sigla de 3 letras (ex'
caso 'quem nao e super admin: recusa' "$(q $D "select superadmin_criar_familia('55555555-5555-5555-5555-555555555555', 'XX', 'Xx', array['PERFIL'], 'XXX')" 2>&1 | grep -oE 'nao e super admin' | head -1)" 'nao e super admin'
caso 'a sigla NAO muda depois de dada' "$(erro $D "update orcamentista_familia_catalogo set sigla='PVX' where chave='PVC'")" 'a sigla da familia PVC e PVC e nao muda'
caso '... mudar o rotulo continua livre' "$(q $D "update orcamentista_familia_catalogo set rotulo='PVC Wolf' where chave='PVC'; select rotulo||':'||sigla from orcamentista_familia_catalogo where chave='PVC'")" 'PVC Wolf:PVC'
caso 'a CHECK barra a sigla fora da forma por fora' "$(erro $D "insert into orcamentista_familia_catalogo (chave, ordem, rotulo, sigla) values ('ZZ', 9, 'Zz', 'zz1')")" 'violates check constraint "orcamentista_familia_catalogo_sigla_forma"'
caso 'o NOT NULL barra a familia sem sigla por fora' "$(erro $D "insert into orcamentista_familia_catalogo (chave, ordem, rotulo) values ('ZZ', 9, 'Zz')")" 'null value in column "sigla"'
caso 'o UNIQUE barra a sigla repetida por fora' "$(erro $D "insert into orcamentista_familia_catalogo (chave, ordem, rotulo, sigla) values ('ZZ', 9, 'Zz', 'ALU')")" 'duplicate key value violates unique constraint "orcamentista_familia_catalogo_sigla_key"'
caso 'anon nao cria familia' "$(erro $D "set role anon; $(cria "'ZZ'" "'Zz'" "'ZZZ'")")" 'permission denied'
caso 'authenticated nao cria familia' "$(erro $D "set role authenticated; $(cria "'ZZ'" "'Zz'" "'ZZZ'")")" 'permission denied'
caso 'nem a assinatura de antes' "$(erro $D "set role anon; select superadmin_criar_familia($U, 'ZZ', 'Zz', array['PERFIL'])")" 'permission denied'
caso 'o gatilho da sigla nao e chamavel direto' "$(q $D "select has_function_privilege('service_role', 'orcamentista_familia_catalogo_sigla_fixa()', 'EXECUTE')")" 'f'
caso 'a familia do orcamento: a forma da chave' "$(erro $D "update orcamentista_orcamento set familia='pvc' where numero=1")" 'violates check constraint "orcamentista_orcamento_familia_forma"'

# o indice: um por levantamento E familia (o de antes ainda vale ate a 20261123000003)
L="(select levantamento_id from orcamentista_orcamento where numero=12)"
ins() { echo "insert into orcamentista_orcamento (tenant_id, numero, levantamento_id, nome, familia) values ($T, $1, $L, 'x', $2)"; }
caso 'com o indice de antes: um segundo orcamento do mesmo levantamento (outra familia) ainda e barrado' "$(erro $D "$(ins 13 "'ALUMINIO'")")" 'duplicate key value violates unique constraint "orcamentista_orcamento_um_por_levantamento"'
caso 'a 20261123000003 aplica' "$(aplica $D $MIG3)" ''
caso '... e reaplica' "$(aplica $D $MIG3)" ''
caso 'sem o de antes: o mesmo levantamento ganha o orcamento de OUTRA familia' "$(q $D "$(ins 13 "'ALUMINIO'"); select count(*) from orcamentista_orcamento where levantamento_id=$L")" '2'
caso '... e a mesma familia duas vezes e barrada' "$(erro $D "$(ins 14 "'ALUMINIO'")")" 'duplicate key value violates unique constraint "orcamentista_orcamento_um_por_familia"'
caso '... e o de antes (familia nula) continua um so por levantamento' "$(erro $D "$(ins 15 "null")")" 'duplicate key value violates unique constraint "orcamentista_orcamento_um_por_familia"'
caso 'o orcamento manual (sem levantamento) nao entra no indice' "$(q $D "insert into orcamentista_orcamento (tenant_id, numero, nome, familia) values ($T, 20, 'm', 'PVC'), ($T, 21, 'm', 'PVC'); select count(*) from orcamentista_orcamento where levantamento_id is null")" '2'

# CORRIDA: duas criacoes com a mesma sigla se enfileiram (a trava de aviso): a segunda ve a primeira e recusa
A=$(mktemp)
( $P -d $D -tA -c "begin; $(cria "'C1'" "'Corrida 1'" "'COR'"); select pg_sleep(1); commit;" >$A 2>&1 ) &
sleep 0.3
B=$(erro $D "$(cria "'C2'" "'Corrida 2'" "'COR'")"); wait
caso 'corrida: a primeira cria, a segunda espera e recusa pela sigla' "$(grep -oE '^COR$' $A) $B" 'COR a sigla COR ja e da familia'
rm -f $A

# GUARDAS
base ${D}_g; $P -d ${D}_g -c "drop table orcamentista_familia_ramificacao" >/dev/null
caso 'guarda: dependencia ausente' "$(aplica ${D}_g $MIG)" "guarda: dependencia ausente no banco ${D}_g "
base ${D}_g; $P -d ${D}_g -c "insert into orcamentista_familia_catalogo values ('ALUMINIO', 2, 'Aluminio')" >/dev/null
caso 'guarda: catalogo de familias fora do medido' "$(aplica ${D}_g $MIG)" 'guarda: o catalogo de familias nao esta como medido em 23/11/2026 '
caso 'guarda: nada alterado' "$(q ${D}_g "select count(*) from information_schema.columns where table_name='orcamentista_familia_catalogo' and column_name='sigla'"; echo -n ' '; q ${D}_g "select count(*) from superadmin_alteracao_log")" '0 0'
base ${D}_g; $P -d ${D}_g -c "create or replace function superadmin_criar_familia(p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]) returns jsonb language sql as \$\$ select null::jsonb \$\$" >/dev/null
caso 'guarda: criar_familia com outro corpo' "$(aplica ${D}_g $MIG)" 'guarda: superadmin_criar_familia tem outro corpo '
base ${D}_g; $P -d ${D}_g -c "alter table orcamentista_orcamento add column familia integer" >/dev/null
caso 'guarda: a familia do orcamento com outra forma' "$(aplica ${D}_g $MIG)" 'guarda: orcamentista_orcamento'
base ${D}_g
caso 'guarda da 03: sem a 02, nao tira o indice' "$(aplica ${D}_g $MIG3)" 'guarda: o indice orcamentista_orcamento_um_por_familia '
caso '... e o de antes continua' "$(q ${D}_g "select to_regclass('orcamentista_orcamento_um_por_levantamento') is not null")" 't'

# CONTRASTE do privilegio padrao: sem o REVOKE de anon e authenticated, a verificacao 5 aborta pela funcao NOVA (a de 4 argumentos ja existia:
# o CREATE OR REPLACE preserva o ACL dela, e por isso ela nao aparece aqui)
base ${D}_c; sed 's/FROM PUBLIC, anon, authenticated;/FROM PUBLIC;/' "$MIG" > /tmp/orcamento_por_familia_contraste.sql
caso 'contraste: REVOKE so de PUBLIC aborta na verificacao 5' "$(aplica ${D}_c /tmp/orcamento_por_familia_contraste.sql)" 'verificacao 5: superadmin_criar_familia fora da forma (SECURITY DEFINER, search_path, EXECUTE so do service_role): superadmin_criar_familia(uuid,text,text,text[],text)'

for x in $D ${D}_g ${D}_c; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
echo "$OKS ok, $FALHAS falhas"
[ $FALHAS -eq 0 ]
