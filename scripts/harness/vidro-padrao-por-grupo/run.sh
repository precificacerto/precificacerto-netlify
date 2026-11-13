#!/bin/bash
# HARNESS LOCAL da 20261113000001 (o vidro padrão por grupo). NÃO TOCA PRODUÇÃO.
# Subir o Postgres local: ver scripts/harness/baixa-com-valor-diferente/run.sh. Produção é 17.6; aqui é 16.x (o NULLS NOT DISTINCT existe
# desde o 15; o resto é DDL comum) — a diferença de versão é premissa, não medição.
# Uso: run.sh <arquivo da migração>. Uma linha `ok:` ou `FALHOU:` por caso; sai 1 se algum falhar.
S=$(cd "$(dirname "$0")" && pwd); M=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
falhas=0
caso() { if [ "$2" = "$3" ]; then echo "ok: $1"; else echo "FALHOU: $1 — esperado [$3], veio [$2]"; falhas=$((falhas + 1)); fi; }
base() { $P -c "drop database if exists $1" >/dev/null 2>&1; $P -c "create database $1" >/dev/null; $P -d $1 -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "SCHEMA FALHOU"; exit 2; }; }
aplica() { $P -d $1 -v ON_ERROR_STOP=1 -f "$M" >/dev/null 2>&1 && echo aplicou || echo abortou; }
q() { $P -d $1 -tA -c "$2" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
erro() { $P -d $1 -tA -c "$2" 2>&1 | grep -oE 'violates [a-z ]+ constraint "[a-z_]+"|row-level security|permission denied' | head -1; }

# 1. aplica, e as sementes são as autorizadas
base vp1
caso 'aplica na base medida' "$(aplica vp1)" 'aplicou'
caso 'as duas sementes, e só elas' "$(q vp1 "select coalesce(abertura,'-')||' '||tipo||' '||item_codigo from orcamentista_vidro_padrao order by tipo")" 'janela correr VIN05 - maxim-ar VBO3,4'
caso 'RLS ligada e 4 políticas' "$(q vp1 "select relrowsecurity::text||' '||(select count(*) from pg_policy where polrelid=c.oid) from pg_class c where oid='orcamentista_vidro_padrao'::regclass")" 'true 4'
# 2. reaplicar: a guarda aborta e nada muda
caso 'reaplicar aborta pela guarda' "$(aplica vp1)" 'abortou'
caso 'reaplicar não duplica' "$(q vp1 'select count(*) from orcamentista_vidro_padrao')" '2'
# 3. a forma da chave
caso 'exceção com tipo junto: recusa' "$(erro vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, tipo, tipologia, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','correr','DP-02','VIN05')")" 'violates check constraint "orcamentista_vidro_padrao_grupo_ou_excecao"'
caso 'linha sem tipo nem tipologia: recusa' "$(erro vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, abertura, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','janela','VIN05')")" 'violates check constraint "orcamentista_vidro_padrao_grupo_ou_excecao"'
caso 'DP-017 e DP-17 são duas exceções' "$(q vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, tipologia, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','DP-017','VIN05'),('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','DP-17','VBO3,4'); select count(*) from orcamentista_vidro_padrao where tipologia is not null")" '2'
caso 'a mesma exceção duas vezes: recusa' "$(erro vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, tipologia, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','DP-17','VIN05')")" 'violates unique constraint "orcamentista_vidro_padrao_uma_por_chave"'
caso 'o grupo sem abertura (maxim-ar) duas vezes: recusa' "$(erro vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, tipo, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','maxim-ar','VIN05')")" 'violates unique constraint "orcamentista_vidro_padrao_uma_por_chave"'
caso 'abertura fora de porta/janela: recusa' "$(erro vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, abertura, tipo, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','portao','correr','VIN05')")" 'violates check constraint "orcamentista_vidro_padrao_abertura_forma"'
caso 'código com espaço na ponta: recusa' "$(erro vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, abertura, tipo, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','porta','correr',' VIN05')")" 'violates check constraint "orcamentista_vidro_padrao_item_codigo_forma"'
caso 'tipo fora da forma curta: recusa' "$(erro vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, abertura, tipo, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','porta','Correr','VIN05')")" 'violates check constraint "orcamentista_vidro_padrao_tipo_forma"'
caso 'matéria-prima de OUTRA conta: recusa pela FK composta' "$(erro vp1 "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, abertura, tipo, item_codigo) values ('11111111-1111-1111-1111-111111111111','79d764fe-4acd-43e2-bed9-38e20667ca3d','porta','correr','VIN05')")" 'violates foreign key constraint "orcamentista_vidro_padrao_materia_prima_fk"'
# 4. a RLS: quem não é super admin não lê nem grava; o service_role grava
caso 'authenticated sem super admin lê 0' "$(q vp1 "set role authenticated; select count(*) from orcamentista_vidro_padrao")" '0'
caso 'authenticated sem super admin não grava' "$(erro vp1 "set role authenticated; insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, abertura, tipo, item_codigo) values ('20e08592-f957-4e72-b7eb-251387e34eb9','79d764fe-4acd-43e2-bed9-38e20667ca3d','porta','correr','VIN05')")" 'row-level security'
caso 'authenticated super admin lê' "$(q vp1 "set harness.sa = '1'; set role authenticated; select count(*) from orcamentista_vidro_padrao")" '4'
caso 'service_role lê' "$(q vp1 "set role service_role; select count(*) from orcamentista_vidro_padrao")" '4'
caso 'anon sem privilégio de tabela' "$(erro vp1 "set role anon; select count(*) from orcamentista_vidro_padrao")" 'permission denied'
caso 'O NOTADO NO CABEÇALHO: authenticated tem privilégio de tabela (o padrão do schema, sem REVOKE)' "$(q vp1 "select has_table_privilege('authenticated','orcamentista_vidro_padrao','SELECT')")" 't'
# 5. a cascata: apagar a matéria-prima leva as linhas
caso 'apagar a matéria-prima leva as linhas' "$(q vp1 "delete from orcamentista_materia_prima; select count(*) from orcamentista_vidro_padrao")" '0'
# 6. as guardas, cada uma numa base própria: aborta e não cria nada
base vp2; q vp2 "update orcamentista_materia_prima set familia = 'ALU'" >/dev/null
caso 'guarda: a matéria-prima não é a medida' "$(aplica vp2)/$(q vp2 "select coalesce(to_regclass('orcamentista_vidro_padrao')::text,'nada')")" 'abortou/nada'
base vp3; q vp3 "delete from orcamentista_tabela_item where codigo = 'VIN05'" >/dev/null
caso 'guarda: código fora da tabela VIDRO' "$(aplica vp3)/$(q vp3 "select coalesce(to_regclass('orcamentista_vidro_padrao')::text,'nada')")" 'abortou/nada'
base vp4; q vp4 "update orcamentista_tabela set categoria_chave = 'PERFIL'" >/dev/null
caso 'guarda: o código só em tabela de outra categoria' "$(aplica vp4)/$(q vp4 "select coalesce(to_regclass('orcamentista_vidro_padrao')::text,'nada')")" 'abortou/nada'
base vp5; q vp5 "drop function is_super_admin()" >/dev/null
caso 'guarda: sem is_super_admin()' "$(aplica vp5)/$(q vp5 "select coalesce(to_regclass('orcamentista_vidro_padrao')::text,'nada')")" 'abortou/nada'
$P -c 'drop database if exists vp_vazio' >/dev/null 2>&1; $P -c 'create database vp_vazio' >/dev/null
caso 'guarda: banco vazio (o projeto errado)' "$(aplica vp_vazio)" 'abortou'
# 7. só o que foi autorizado: nenhum DROP, REVOKE nem ALTER em tabela existente (o único ALTER liga a RLS da tabela nova)
caso 'nenhum DROP/REVOKE/TRUNCATE/DELETE no arquivo' "$(grep -vE '^\s*--' "$M" | grep -ciE '\b(drop|revoke|truncate|delete from)\b')" '0'
caso 'o único ALTER é o da RLS da tabela nova' "$(grep -vE '^\s*--' "$M" | grep -iE '\balter\b' | tr -s ' ')" 'ALTER TABLE public.orcamentista_vidro_padrao ENABLE ROW LEVEL SECURITY;'
for d in vp1 vp2 vp3 vp4 vp5 vp_vazio; do $P -c "drop database if exists $d" >/dev/null 2>&1; done
[ $falhas -eq 0 ] && echo "todos verdes" || { echo "$falhas falharam"; exit 1; }
