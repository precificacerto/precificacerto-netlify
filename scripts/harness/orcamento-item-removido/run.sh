#!/bin/bash
# HARNESS LOCAL da 20261113000002 (o item removido por marca, e a ordem única só entre os que valem). NÃO TOCA PRODUÇÃO.
# Subir o Postgres local: ver scripts/harness/baixa-com-valor-diferente/run.sh. Produção é 17.6; aqui é 16.x — a forma de pg_get_indexdef e
# pg_get_constraintdef usada na guarda e na verificação é a mesma nas duas (premissa, não medição; a verificação em produção é por consulta).
# Uso: run.sh <arquivo da migração>. Uma linha `ok:` ou `FALHOU:` por caso; sai 1 se algum falhar.
S=$(cd "$(dirname "$0")" && pwd); M=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
falhas=0
caso() { if [ "$2" = "$3" ]; then echo "ok: $1"; else echo "FALHOU: $1 — esperado [$3], veio [$2]"; falhas=$((falhas + 1)); fi; }
base() { $P -c "drop database if exists $1" >/dev/null 2>&1; $P -c "create database $1" >/dev/null; $P -d $1 -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "SCHEMA FALHOU"; exit 2; }; }
aplica() { $P -d $1 -v ON_ERROR_STOP=1 -f "$M" >/dev/null 2>&1 && echo aplicou || echo abortou; }
# o PORQUÊ do aborto: a recusa nomeada da guarda ('guarda: ...'), nunca o erro cru do Postgres que viria depois dela
porque() { $P -d $1 -v ON_ERROR_STOP=1 -f "$M" 2>&1 >/dev/null | grep -oE 'guarda: [^.]*' | head -1; }
q() { $P -d $1 -tA -c "$2" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
erro() { $P -d $1 -tA -c "$2" 2>&1 | grep -oE 'violates [a-z ]+ constraint "[a-z_]+"|duplicate key value violates unique constraint "[a-z_]+"' | head -1; }
ESTADO="select count(*)||'/'||coalesce(string_agg(id::text||':'||ordem||':'||coalesce(tipologia,'-'), ',' order by id),'') from orcamentista_orcamento_item"
O1="00000000-0000-0000-0000-0000000000a1"; T="20e08592-f957-4e72-b7eb-251387e34eb9"

# 1. aplica na base medida, e o resultado é o pedido
base r1
antes=$(q r1 "$ESTADO")
caso 'aplica na base medida' "$(aplica r1)" 'aplicou'
caso 'nenhuma linha mudou (contagem, ids, ordens, tipologias)' "$(q r1 "$ESTADO")" "$antes"
caso 'a coluna: timestamptz, nula, sem default, nula em toda linha' "$(q r1 "select data_type||'|'||is_nullable||'|'||coalesce(column_default,'-')||'|'||(select count(*) from orcamentista_orcamento_item where removido_em is not null) from information_schema.columns where table_name='orcamentista_orcamento_item' and column_name='removido_em'")" 'timestamp with time zone|YES|-|0'
caso 'o índice novo é único e parcial' "$(q r1 "select pg_get_indexdef('orcamentista_orcamento_item_ordem_ativa_key'::regclass)")" 'CREATE UNIQUE INDEX orcamentista_orcamento_item_ordem_ativa_key ON public.orcamentista_orcamento_item USING btree (orcamento_id, ordem) WHERE (removido_em IS NULL)'
caso 'a restrição antiga e o índice antigo não existem' "$(q r1 "select (select count(*) from pg_constraint where conname='orcamentista_orcamento_item_ordem_key')||'/'||coalesce(to_regclass('orcamentista_orcamento_item_ordem_key')::text,'nada')")" '0/nada'
caso 'as outras restrições da tabela ficam (id+tenant, ordem positiva, FK do orçamento, FK do material)' "$(q r1 "select string_agg(conname, ',' order by conname) from pg_constraint where conrelid in ('orcamentista_orcamento_item'::regclass,'orcamentista_orcamento_item_material'::regclass) and conname like 'orcamentista_orcamento_item%' and conname <> 'orcamentista_orcamento_item_material_pkey'")" 'orcamentista_orcamento_item_id_tenant_key,orcamentista_orcamento_item_material_item_fkey,orcamentista_orcamento_item_orcamento_fkey,orcamentista_orcamento_item_ordem_positiva,orcamentista_orcamento_item_pkey'
# 2. o comportamento que a decisão pede
caso 'dois itens VALENDO com a mesma ordem: recusa' "$(erro r1 "insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem) values ('$T','$O1',3)")" 'duplicate key value violates unique constraint "orcamentista_orcamento_item_ordem_ativa_key"'
caso 'o item 3 removido FICA, e um item novo na ordem 3 entra' "$(q r1 "update orcamentista_orcamento_item set removido_em = now() where id='00000000-0000-0000-0000-000000000013'; insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, tipologia) values ('$T','$O1',3,'DP-100'); select count(*) filter (where removido_em is null)||'/'||count(*) from orcamentista_orcamento_item where orcamento_id='$O1' and ordem=3")" '1/2'
caso 'o material do removido continua lá (a FK RESTRICT intacta)' "$(q r1 "select count(*) from orcamentista_orcamento_item_material where orcamento_item_id='00000000-0000-0000-0000-000000000013'")" '1'
caso 'outro item valendo na ordem 3: recusa de novo' "$(erro r1 "insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem) values ('$T','$O1',3)")" 'duplicate key value violates unique constraint "orcamentista_orcamento_item_ordem_ativa_key"'
caso 'a mesma ordem em OUTRO orçamento continua valendo' "$(q r1 "select count(*) from orcamentista_orcamento_item where ordem=1 and removido_em is null")" '2'
# 3. reaplicar: a guarda aborta e nada muda
caso 'reaplicar aborta pela guarda (a coluna já existe)' "$(aplica r1)" 'abortou'
caso 'reaplicar não desfaz o índice novo' "$(q r1 "select coalesce(to_regclass('orcamentista_orcamento_item_ordem_ativa_key')::text,'nada')")" 'orcamentista_orcamento_item_ordem_ativa_key'
# 4. as guardas, cada uma numa base própria: aborta e não altera nada
nada() { q $1 "select (select count(*) from information_schema.columns where table_name='orcamentista_orcamento_item' and column_name='removido_em')||'/'||coalesce(to_regclass('orcamentista_orcamento_item_ordem_ativa_key')::text,'sem_novo')||'/'||(select count(*) from pg_constraint where conname='orcamentista_orcamento_item_ordem_key')"; }
base r2; q r2 "alter table orcamentista_orcamento_item drop constraint orcamentista_orcamento_item_ordem_key; alter table orcamentista_orcamento_item add constraint orcamentista_orcamento_item_ordem_key unique (orcamento_id, ordem, tenant_id)" >/dev/null
# o controle da preparação: a restrição foi mesmo redefinida (uma preparação que falha volta atrás inteira, e o caso passaria a medir a base de sempre)
caso 'preparação do r2: a restrição é a OUTRA definição' "$(q r2 "select pg_get_constraintdef(oid) from pg_constraint where conname='orcamentista_orcamento_item_ordem_key'")" 'UNIQUE (orcamento_id, ordem, tenant_id)'
caso 'guarda: a unicidade de hoje não é a medida (outra definição)' "$(aplica r2)/$(nada r2)" 'abortou/0/sem_novo/1'
base r3; q r3 "alter table orcamentista_orcamento_item drop constraint orcamentista_orcamento_item_ordem_key; create unique index orcamentista_orcamento_item_ordem_key on orcamentista_orcamento_item (orcamento_id, ordem)" >/dev/null
caso 'guarda: só um índice com o nome, sem a restrição' "$(aplica r3)/$(q r3 "select count(*) from information_schema.columns where column_name='removido_em'")/$(q r3 "select coalesce(to_regclass('orcamentista_orcamento_item_ordem_key')::text,'nada')")" 'abortou/0/orcamentista_orcamento_item_ordem_key'
base r4; q r4 "create table depende (o uuid, n int, foreign key (o, n) references orcamentista_orcamento_item (orcamento_id, ordem))" >/dev/null
caso 'guarda: uma FK depende da unicidade de hoje' "$(porque r4)|$(aplica r4)/$(nada r4)" 'guarda: 1 FK(s) dependem do índice da unicidade de hoje|abortou/0/sem_novo/1'
base r5; q r5 "create index orcamentista_orcamento_item_ordem_ativa_key on orcamentista_orcamento_item (ordem)" >/dev/null
caso 'guarda: o índice novo já existe' "$(porque r5)|$(aplica r5)/$(q r5 "select count(*) from information_schema.columns where column_name='removido_em'")/$(q r5 "select count(*) from pg_constraint where conname='orcamentista_orcamento_item_ordem_key'")" 'guarda: o índice orcamentista_orcamento_item_ordem_ativa_key já existe|abortou/0/1'
base r6; q r6 "alter table orcamentista_orcamento_item add column removido_em timestamptz" >/dev/null
caso 'guarda: a coluna já existe' "$(porque r6)|$(aplica r6)/$(q r6 "select coalesce(to_regclass('orcamentista_orcamento_item_ordem_ativa_key')::text,'sem_novo')||'/'||(select count(*) from pg_constraint where conname='orcamentista_orcamento_item_ordem_key')")" 'guarda: a coluna removido_em já existe|abortou/sem_novo/1'
$P -c 'drop database if exists r_vazio' >/dev/null 2>&1; $P -c 'create database r_vazio' >/dev/null
caso 'guarda: banco vazio (o projeto errado)' "$(aplica r_vazio)" 'abortou'
# a guarda da ordem duplicada: só se alcança sem a unicidade de hoje — por isso o caso usa a definição medida recriada SEM valer (NOT VALID não
# existe para UNIQUE); a duplicata entra antes da restrição, que então não pode ser criada. Medido: o Postgres recusa criar a restrição com
# duplicata. A guarda existe para o banco em que alguém tirou a restrição à mão; aqui ela é exercida com a tabela sem restrição nenhuma.
base r7; q r7 "alter table orcamentista_orcamento_item drop constraint orcamentista_orcamento_item_ordem_key; insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem) values ('$T','$O1',2)" >/dev/null
caso 'preparação do r7: a duplicata está lá' "$(q r7 "select count(*) from orcamentista_orcamento_item where orcamento_id='$O1' and ordem=2")" '2'
caso 'guarda: ordem duplicada (sem a restrição) — aborta antes, pela restrição ausente' "$(aplica r7)/$(q r7 "select count(*) from information_schema.columns where column_name='removido_em'")" 'abortou/0'
# 5. o arquivo: só o que foi autorizado
SEM_COMENTARIO=$(grep -vE '^\s*--' "$M")
caso 'nenhum DELETE/UPDATE/INSERT/TRUNCATE/REVOKE/GRANT no arquivo' "$(echo "$SEM_COMENTARIO" | grep -ciE '\b(delete|update|insert|truncate|revoke|grant)\b')" '0'
caso 'nenhuma tabela, nem temporária' "$(echo "$SEM_COMENTARIO" | grep -ciE '\bcreate\b.*\btable\b')" '0'
caso 'um DROP só, o da restrição de hoje' "$(echo "$SEM_COMENTARIO" | grep -iE '\bdrop\b' | tr -s ' ')" 'ALTER TABLE public.orcamentista_orcamento_item DROP CONSTRAINT orcamentista_orcamento_item_ordem_key;'
caso 'os ALTERs: a coluna e o DROP, nessa ordem' "$(echo "$SEM_COMENTARIO" | grep -iE '^\s*alter\b' | tr -s ' ' | tr '\n' '|')" 'ALTER TABLE public.orcamentista_orcamento_item ADD COLUMN removido_em timestamptz NULL;|ALTER TABLE public.orcamentista_orcamento_item DROP CONSTRAINT orcamentista_orcamento_item_ordem_key;|'
caso 'o CREATE do índice vem DEPOIS do DROP, na mesma transação' "$(echo "$SEM_COMENTARIO" | grep -nE '^(BEGIN;|COMMIT;|ALTER TABLE .* DROP CONSTRAINT|CREATE UNIQUE INDEX)' | cut -d: -f2 | cut -c1-20 | tr '\n' '|')" 'BEGIN;|ALTER TABLE public.o|CREATE UNIQUE INDEX |COMMIT;|'
for d in r1 r2 r3 r4 r5 r6 r7 r_vazio; do $P -c "drop database if exists $d" >/dev/null 2>&1; done
[ $falhas -eq 0 ] && echo "todos verdes" || { echo "$falhas falharam"; exit 1; }
