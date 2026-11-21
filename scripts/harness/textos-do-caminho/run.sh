#!/bin/bash
# HARNESS da 20261121000003 (os textos por fornecedor e por familia). NAO TOCA PRODUCAO.
# Uso: run.sh [arquivo da migracao]. Sai 1 se algum caso falhar; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261121000003_textos_do_caminho.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_textos_do_caminho}
OKS=0; FALHAS=0
caso() { if [ "$2" = "$3" ]; then echo "ok: $1"; OKS=$((OKS+1)); else echo "FALHOU: $1 — esperado [$3], veio [$2]"; FALHAS=$((FALHAS+1)); fi; }
base() { $P -c "drop database if exists $1" >/dev/null 2>&1; $P -c "create database $1" >/dev/null || exit 2
  $P -d $1 -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "BASE FALHOU"; exit 2; }; }
aplica() { $P -d $1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -oE 'guarda: [^.:(]*|verificacao [0-9]: [^.]*' | head -1; }
q() { $P -d $1 -tA -c "$2" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
erro() { $P -d $1 -tA -c "$2" 2>&1 | grep -oE 'texto do caminho: [^.]*|violates [a-z ]+ constraint "[a-z_]+"|permission denied' | head -1; }
T="'20e08592-f957-4e72-b7eb-251387e34eb9'"; U="'44444444-4444-4444-4444-444444444444'"
g() { echo "select superadmin_gravar_texto_do_caminho($T, $U, '$1'::jsonb)->>'resultado'"; }
WOLF=44c5c0fe-a0d3-4aab-802d-20a6eff3f654; ESTRELA=520b1fb2-8834-421d-88ee-91790fa04bcb; CELSUS=a4acc4f2-d6fd-4bfb-a7d9-4368fe5676da
VECA=55555555-5555-5555-5555-555555555555; PROPRIO=66666666-6666-6666-6666-666666666666
LOG="select count(*) from superadmin_alteracao_log where tabela='orcamentista_texto_do_caminho'"

base $D
caso 'aplica' "$(aplica $D)" ''
caso 'reaplica sem erro' "$(aplica $D)" ''
caso 'nenhuma linha gravada pela migracao' "$(q $D 'select count(*) from orcamentista_texto_do_caminho')" '0'
caso 'familia da empresa: cria, aparado' "$(q $D "$(g '{"familia":"PVC","texto":"  Linha Wolf; perfil branco.  "}')"; echo -n ' '; q $D "select texto from orcamentista_texto_do_caminho where familia='PVC'")" 'criada Linha Wolf; perfil branco.'
caso '... logou com antes nulo, o tenant e a funcao' "$(q $D "select count(*) from superadmin_alteracao_log where antes is null and tenant_id=$T and depois->>'funcao'='superadmin_gravar_texto_do_caminho'")" '1'
caso 'o mesmo texto: igual, sem logar' "$(q $D "$(g '{"familia":"PVC","texto":"Linha Wolf; perfil branco."}')"; echo -n ' '; q $D "$LOG")" 'igual 1'
$P -d $D -c "update orcamentista_texto_do_caminho set atualizado_por = null where familia='PVC'" >/dev/null
caso 'troca o texto da familia, com antes e depois' "$(q $D "$(g '{"familia":"PVC","texto":"Novo"}')"; echo -n ' '; q $D "select antes->>'texto'||'>'||(depois->>'texto') from superadmin_alteracao_log where antes is not null")" 'trocada Linha Wolf; perfil branco.>Novo'
caso '... a troca grava quem trocou' "$(q $D "select atualizado_por from orcamentista_texto_do_caminho where familia='PVC'")" '44444444-4444-4444-4444-444444444444'
caso 'fornecedor vinculado (Wolf, PERFIL): cria' "$(q $D "$(g '{"fornecedor_id":"'$WOLF'","texto":"Tabela Wolf rev2"}')")" 'criada'
caso 'fornecedor vinculado (Estrela, VIDRO): cria' "$(q $D "$(g '{"fornecedor_id":"'$ESTRELA'","texto":"Vidro em m2"}')")" 'criada'
caso 'fornecedor do motor que a etapa aponta: cria' "$(q $D "$(g '{"fornecedor_id":"'$PROPRIO'","texto":"x"}')")" 'criada'
caso 'limpar grava NULL e NAO apaga a linha' "$(q $D "$(g '{"fornecedor_id":"'$PROPRIO'","texto":"   "}')"; echo -n ' '; q $D "select count(*)||':'||count(texto) from orcamentista_texto_do_caminho where fornecedor_id='$PROPRIO'")" 'trocada 1:0'
$P -d $D -c "delete from orcamentista_texto_do_caminho where fornecedor_id='$PROPRIO'" >/dev/null
caso 'limpar o que nunca foi escrito: igual, nao cria linha' "$(q $D "$(g '{"fornecedor_id":"'$PROPRIO'","texto":""}')"; echo -n ' '; q $D "select count(*) from orcamentista_texto_do_caminho where fornecedor_id='$PROPRIO'")" 'igual 0'
caso 'fornecedor de OUTRA empresa: recusa' "$(erro $D "$(g '{"fornecedor_id":"'$CELSUS'","texto":"x"}')")" "texto do caminho: o fornecedor $CELSUS nao esta no caminho desta empresa"
caso 'motor de OUTRA empresa: recusa' "$(erro $D "$(g '{"fornecedor_id":"'$VECA'","texto":"x"}')")" "texto do caminho: o fornecedor $VECA nao esta no caminho desta empresa"
caso 'familia de OUTRA empresa: recusa' "$(erro $D "$(g '{"familia":"ALU","texto":"x"}')")" 'texto do caminho: a familia ALU nao e de nenhuma materia-prima desta empresa'
caso 'familia E fornecedor: recusa' "$(erro $D "$(g '{"familia":"PVC","fornecedor_id":"'$WOLF'","texto":"x"}')")" 'texto do caminho: diga a familia OU o fornecedor, um so'
caso 'nenhum alvo: recusa' "$(erro $D "$(g '{"texto":"x"}')")" 'texto do caminho: diga a familia OU o fornecedor, um so'
caso 'chave desconhecida: recusa nomeada' "$(erro $D "$(g '{"familia":"PVC","linha":"EUROPA 42","texto":"x"}')")" 'texto do caminho: chave desconhecida "linha"'
caso 'texto nao textual: recusa' "$(erro $D "$(g '{"familia":"PVC","texto":5}')")" 'texto do caminho: o texto tem de ser texto ou nulo'
caso 'acima de 1500: recusa nomeando o numero' "$(erro $D "select superadmin_gravar_texto_do_caminho($T,$U,jsonb_build_object('familia','PVC','texto',repeat('x',1501)))")" 'texto do caminho: o texto tem 1501 caracteres; o limite e 1500'
caso '1500 cabe' "$(q $D "select superadmin_gravar_texto_do_caminho($T,$U,jsonb_build_object('familia','PVC','texto',repeat('x',1500)))->>'resultado'")" 'trocada'
caso 'a CHECK barra o vazio por fora' "$(erro $D "update orcamentista_texto_do_caminho set texto = '' where familia='PVC'")" 'violates check constraint "orcamentista_texto_do_caminho_texto_forma"'
caso 'a CHECK barra os dois alvos por fora' "$(erro $D "insert into orcamentista_texto_do_caminho (tenant_id, familia, fornecedor_id) values ($T,'PVC','$WOLF')")" 'violates check constraint "orcamentista_texto_do_caminho_um_alvo"'
caso 'a chave e unica' "$(erro $D "insert into orcamentista_texto_do_caminho (tenant_id, familia) values ($T,'PVC')")" 'violates unique constraint "orcamentista_texto_do_caminho_uma_por_chave"'
caso 'a recusa nao deixou log' "$(q $D "$LOG")" '7'
caso 'anon nao executa' "$(erro $D "set role anon; $(g '{"familia":"PVC","texto":"y"}')")" 'permission denied'
caso 'authenticated nao executa' "$(erro $D "set role authenticated; $(g '{"familia":"PVC","texto":"y"}')")" 'permission denied'
caso 'authenticated nao le a tabela' "$(erro $D "set role authenticated; select * from orcamentista_texto_do_caminho")" 'permission denied'
caso 'service_role executa' "$(q $D "set role service_role; $(g '{"familia":"PVC","texto":"y"}')")" 'trocada'

# CORRIDA: duas gravacoes da mesma chave nova -> a primeira cria, a segunda espera e troca (nunca a violacao de unicidade)
A=$(mktemp)
$P -d $D -c "delete from orcamentista_texto_do_caminho where fornecedor_id='$PROPRIO'" >/dev/null
( $P -d $D -tA -c "begin; $(g '{"fornecedor_id":"'$PROPRIO'","texto":"um"}'); select pg_sleep(1); commit;" >$A 2>&1 ) &
sleep 0.3
B=$(q $D "$(g '{"fornecedor_id":"'$PROPRIO'","texto":"dois"}')"); wait
caso 'corrida: a primeira cria, a segunda espera e troca' "$(grep -oE 'criada' $A) $B" 'criada trocada'
caso 'corrida: uma linha, a da segunda' "$(q $D "select count(*)||texto from orcamentista_texto_do_caminho where fornecedor_id='$PROPRIO' group by texto")" '1dois'
rm -f $A

# GUARDAS: num banco novo, nada e criado
base ${D}_g; $P -d ${D}_g -c "drop table orcamentista_familia_etapa" >/dev/null
caso 'guarda: dependencia ausente' "$(aplica ${D}_g)" "guarda: dependencia ausente no banco ${D}_g "
caso 'guarda: nada criado' "$(q ${D}_g "select to_regclass('orcamentista_texto_do_caminho') is null and to_regprocedure('superadmin_gravar_texto_do_caminho(uuid,uuid,jsonb)') is null")" 't'
base ${D}_g; $P -d ${D}_g -c "create table orcamentista_texto_do_caminho (id int)" >/dev/null
caso 'guarda: tabela com outra forma' "$(aplica ${D}_g)" 'guarda: orcamentista_texto_do_caminho ja existe com outra forma'

echo "$OKS ok, $FALHAS falhas"; [ $FALHAS -eq 0 ]
