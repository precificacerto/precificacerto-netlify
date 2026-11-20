#!/bin/bash
# HARNESS LOCAL da 20261120000001 (a descrição da etapa no catálogo). NÃO TOCA PRODUÇÃO.
# Subir o Postgres local: ver scripts/harness/baixa-com-valor-diferente/run.sh. Produção é 17.6; aqui é 16.x — premissa, não medição.
# Uso: run.sh <arquivo da migração>. Uma linha `ok:` ou `FALHOU:` por caso; sai 1 se algum falhar.
S=$(cd "$(dirname "$0")" && pwd); M=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
falhas=0
caso() { if [ "$2" = "$3" ]; then echo "ok: $1"; else echo "FALHOU: $1 — esperado [$3], veio [$2]"; falhas=$((falhas + 1)); fi; }
base() { $P -c "drop database if exists $1" >/dev/null 2>&1; $P -c "create database $1" >/dev/null; $P -d $1 -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "SCHEMA FALHOU"; exit 2; }; }
aplica() { $P -d $1 -v ON_ERROR_STOP=1 -f "$M" >/dev/null 2>&1 && echo aplicou || echo abortou; }
q() { $P -d $1 -tA -c "$2" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
erro() { $P -d $1 -tA -c "$2" 2>&1 | grep -oE 'violates check constraint "[a-z_]+"|permission denied|a descricao da etapa tem [0-9]+ caracteres; o limite e 1500|nao e super admin|inexistente' | head -1; }
SA=00000000-0000-0000-0000-000000000001; NAO=00000000-0000-0000-0000-000000000002; E1=aaaaaaaa-0000-0000-0000-000000000001
grava() { q $1 "select (superadmin_gravar_descricao_da_etapa('$SA', '$E1', $2))->>'descricao'"; }

base de1
caso 'aplica na base medida' "$(aplica de1)" 'aplicou'
caso 'nenhuma linha ganhou descrição' "$(q de1 'select count(*) from orcamentista_etapa_catalogo where descricao is not null')" '0'
caso 'reaplicar: aplica e nada muda' "$(aplica de1)/$(q de1 'select count(*) from orcamentista_etapa_catalogo where descricao is not null')" 'aplicou/0'
caso 'grava aparada' "$(grava de1 "'  Entrega o levantamento; NAO calcula peca.  '")" 'Entrega o levantamento; NAO calcula peca.'
caso 'grava loga antes e depois' "$(q de1 "select count(*) from superadmin_alteracao_log where tabela='orcamentista_etapa_catalogo' and depois->>'campo'='descricao'")" '1'
caso 'a mesma descrição não loga de novo' "$(grava de1 "'Entrega o levantamento; NAO calcula peca.'")/$(q de1 "select count(*) from superadmin_alteracao_log")" 'Entrega o levantamento; NAO calcula peca./1'
caso 'vazio limpa (NULL, nunca vazio)' "$(grava de1 "'   '")|$(q de1 "select descricao is null from orcamentista_etapa_catalogo where id='$E1'")" '|t'
caso 'acima de 1500 recusa nomeando o número' "$(erro de1 "select superadmin_gravar_descricao_da_etapa('$SA', '$E1', repeat('x', 1501))")" 'a descricao da etapa tem 1501 caracteres; o limite e 1500'
caso '1500 cabe' "$(q de1 "select char_length((superadmin_gravar_descricao_da_etapa('$SA', '$E1', repeat('x', 1500)))->>'descricao')")" '1500'
caso 'quem não é super admin: recusa' "$(erro de1 "select superadmin_gravar_descricao_da_etapa('$NAO', '$E1', 'x')")" 'nao e super admin'
caso 'item inexistente: recusa' "$(erro de1 "select superadmin_gravar_descricao_da_etapa('$SA', gen_random_uuid(), 'x')")" 'inexistente'
caso 'a CHECK barra o vazio por fora da função' "$(erro de1 "update orcamentista_etapa_catalogo set descricao = '' where id='$E1'")" 'violates check constraint "orcamentista_etapa_catalogo_descricao_forma"'
caso 'a CHECK barra o espaço na ponta' "$(erro de1 "update orcamentista_etapa_catalogo set descricao = ' x' where id='$E1'")" 'violates check constraint "orcamentista_etapa_catalogo_descricao_forma"'
caso 'anon e authenticated sem EXECUTE; service_role com' "$(q de1 "select has_function_privilege('anon','superadmin_gravar_descricao_da_etapa(uuid,uuid,text)','EXECUTE')::text||has_function_privilege('authenticated','superadmin_gravar_descricao_da_etapa(uuid,uuid,text)','EXECUTE')::text||has_function_privilege('service_role','superadmin_gravar_descricao_da_etapa(uuid,uuid,text)','EXECUTE')::text")" 'falsefalsetrue'
caso 'o corpo não tem \r nem fora do ASCII' "$(q de1 "select (prosrc ~ E'\\\\r')::text||(prosrc ~ '[^[:ascii:]]')::text from pg_proc where proname='superadmin_gravar_descricao_da_etapa'")" 'falsefalse'
# as guardas
base de2; q de2 "drop table superadmin_alteracao_log" >/dev/null
caso 'guarda: sem o log, aborta e não cria a coluna' "$(aplica de2)/$(q de2 "select count(*) from information_schema.columns where table_name='orcamentista_etapa_catalogo' and column_name='descricao'")" 'abortou/0'
base de3; q de3 "alter table orcamentista_etapa_catalogo add column descricao varchar(10) default 'x'" >/dev/null
caso 'guarda: a coluna com outra forma aborta' "$(aplica de3)" 'abortou'
# contraste: a verificação 4 pega o REVOKE só de PUBLIC (o privilégio padrão de produção dá EXECUTE a authenticated)
base de4; sed 's/FROM PUBLIC, anon, authenticated;/FROM PUBLIC;/' "$M" > /tmp/harness-descricao-contraste.sql
caso 'contraste: REVOKE só de PUBLIC aborta na verificação 4' "$($P -d de4 -v ON_ERROR_STOP=1 -f /tmp/harness-descricao-contraste.sql 2>&1 | grep -c 'verificacao 4')" '1'
echo "falhas: $falhas"; [ $falhas -eq 0 ]
