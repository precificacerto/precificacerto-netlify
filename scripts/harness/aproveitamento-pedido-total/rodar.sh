#!/bin/bash
# HARNESS da 20261126000001 (pedido 0034-B): a tabela com as 7 CHECKs do aproveitamento como em producao (26/11/2026), a migracao
# duas vezes, e os casos. Postgres 16 local em /tmp/harness-pg, porta 54329. Uso: bash rodar.sh
set -u
P="psql -h /tmp/harness-pg -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
R=$(cd "$(dirname "$0")/../../.." && pwd)
M=$R/supabase/migrations/20261126000001_aproveitamento_pelo_pedido_total.sql
psql -h /tmp/harness-pg -p 54329 -U postgres -q -c "drop database if exists pedido_total" -c "create database pedido_total"
P="$P -d pedido_total"
$P <<'SQL'
create table public.orcamentista_orcamento (id serial primary key, aproveitamento_modo text, aproveitamento_origem text, aproveitamento_motivo text, aproveitamento_por uuid,
  constraint orcamentista_orcamento_aproveitamento_modo_valido check (((aproveitamento_modo IS NULL) OR (aproveitamento_modo = ANY (ARRAY['COM'::text, 'SEM'::text])))),
  constraint orcamentista_orcamento_aproveitamento_inteiro check (((aproveitamento_modo IS NULL) = (aproveitamento_origem IS NULL))),
  constraint orcamentista_orcamento_aproveitamento_motivo check ((((aproveitamento_origem IS NULL) OR (aproveitamento_origem = 'base_de_conhecimento'::text)) = (aproveitamento_motivo IS NULL))),
  constraint orcamentista_orcamento_aproveitamento_motivo_forma check (((aproveitamento_motivo IS NULL) OR ((aproveitamento_motivo ~ '^\S(.*\S)?$'::text) AND (char_length(aproveitamento_motivo) <= 500)))),
  constraint orcamentista_orcamento_aproveitamento_por check (((NOT (aproveitamento_origem IS DISTINCT FROM 'alterado_no_orcamento'::text)) = (aproveitamento_por IS NOT NULL))),
  constraint orcamentista_orcamento_aproveitamento_origem_valida check (((aproveitamento_origem IS NULL) OR (aproveitamento_origem = ANY (ARRAY['base_de_conhecimento'::text, 'alterado_no_orcamento'::text, 'fallback_barra_inteira'::text, 'consumo_do_item'::text])))),
  constraint orcamentista_orcamento_aproveitamento_fallback check (((aproveitamento_origem <> ALL (ARRAY['fallback_barra_inteira'::text, 'consumo_do_item'::text])) OR (aproveitamento_modo = 'SEM'::text))));
insert into public.orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo) values ('SEM','consumo_do_item','m'),('SEM','fallback_barra_inteira','m'),(null,null,null);
SQL
ok=0; falhou=0
caso() { if eval "$2" >/dev/null 2>&1; then [ "$3" = passa ] && { ok=$((ok+1)); echo "ok   $1"; } || { falhou=$((falhou+1)); echo "FALHOU $1 (devia recusar)"; }
         else [ "$3" = recusa ] && { ok=$((ok+1)); echo "ok   $1"; } || { falhou=$((falhou+1)); echo "FALHOU $1 (devia passar)"; }; fi; }
caso "antes da migracao, pedido_total e recusado" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo, aproveitamento_por) values ('COM','pedido_total','m','00000000-0000-0000-0000-000000000001')\"" recusa
caso "a migracao aplica" "$P -f $M" passa
caso "a migracao aplica de novo (idempotente)" "$P -f $M" passa
caso "pedido_total, COM, com quem escolheu" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo, aproveitamento_por) values ('COM','pedido_total','m','00000000-0000-0000-0000-000000000001')\"" passa
caso "pedido_total SEM quem escolheu" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo) values ('COM','pedido_total','m')\"" recusa
caso "pedido_total no modo SEM" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo, aproveitamento_por) values ('SEM','pedido_total','m','00000000-0000-0000-0000-000000000001')\"" recusa
caso "pedido_total sem motivo" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_por) values ('COM','pedido_total','00000000-0000-0000-0000-000000000001')\"" recusa
caso "consumo_do_item continua sem quem escolheu" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo) values ('SEM','consumo_do_item','m')\"" passa
caso "consumo_do_item com quem escolheu e recusado" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo, aproveitamento_por) values ('SEM','consumo_do_item','m','00000000-0000-0000-0000-000000000001')\"" recusa
caso "alterado_no_orcamento continua exigindo quem escolheu" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo) values ('COM','alterado_no_orcamento','m')\"" recusa
caso "origem desconhecida continua recusada" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo) values ('COM','qualquer','m')\"" recusa
caso "a linha nula continua valendo" "$P -c \"insert into orcamentista_orcamento (aproveitamento_modo) values (null)\"" passa
caso "8 constraints de aproveitamento" "test \$($P -tA -c \"select count(*) from pg_constraint where conrelid='orcamentista_orcamento'::regclass and conname like 'orcamentista_orcamento_aproveitamento%'\") = 8" passa
# a guarda: uma linha que violaria a CHECK nova aborta a migracao inteira
$P -c "alter table orcamentista_orcamento drop constraint orcamentista_orcamento_aproveitamento_por; insert into orcamentista_orcamento (aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo) values ('COM','pedido_total','m')"
caso "a guarda aborta com linha que violaria a CHECK" "$P -f $M" recusa
echo "$ok ok, $falhou falharam"; [ $falhou = 0 ]
