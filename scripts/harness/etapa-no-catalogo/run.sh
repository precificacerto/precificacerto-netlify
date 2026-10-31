#!/bin/bash
# HARNESS da migração 20261031000002 (a etapa vira item de catálogo). NÃO TOCA PRODUÇÃO.
# Cadeia: a mesma de excluir-etapa-na-conta (as migrações REAIS, os stubs e o estado de PRODUÇÃO, os mesmos ids) -> a 20261029000003, a 20261029000004 e
# a 20261029000005, como em produção -> o estado das 3 etapas medido em 31/10/2026 (excluir-etapa-na-conta/09_dados.sql) -> a 20261031000001 (que
# vem antes, na ordem acordada) -> a foto do antes -> a 20261031000002 DUAS vezes -> os casos e as corridas. As GUARDAS rodam em cópias à parte.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations; B=$H/familia-do-motor-so-no-perfil
MIG=${1:-$M/20261031000002_etapa_no_catalogo.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_etapa_no_catalogo}
A=${D}_antes; G0=${D}_sem_000001; GC=${D}_guarda
REM=$(mktemp --suffix=.sql)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima/{on=1} on && /^-- ── 8\. FECHADAS/{on=0} on{print}' $M/20261023000003_funcoes_dos_tres_niveis.sql > "$REM"
for x in $D $A $G0 $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
$P -c "create database $G0" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $B/05_stubs.sql $B/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql "$REM" $B/08_estado_de_antes.sql $M/20261028000001_familia_instancia_e_catalogo_de_motores.sql $M/20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.sql $B/09_dados.sql $M/20261029000001_trocar_arquivo_e_editar_motor.sql $M/20261029000002_familia_do_motor_so_no_perfil.sql $H/motor-para-n-familias/09_dados.sql $M/20261029000003_motor_para_n_familias.sql $M/20261029000004_familias_do_catalogo.sql $M/20261029000005_nome_do_motor_e_arquivar_em_uso.sql; do
  $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
# o estado das 3 etapas de 31/10/2026 (o mesmo arquivo do harness da 000001) sem as fotos que ele tira
grep -v '^create table public.h_' $H/excluir-etapa-na-conta/09_dados.sql | $P -d $G0 -v ON_ERROR_STOP=1 >/dev/null 2>&1 || { echo "BASE FALHOU: o estado de 31/10"; exit 2; }
# medido em produção em 31/10/2026: as 3 etapas têm autor, um super admin (quem as gravou pela tela); aqui, o super admin dos stubs
$P -d $G0 -v ON_ERROR_STOP=1 -c "update public.orcamentista_familia_etapa set atualizado_por = 'e0000000-0000-0000-0000-000000000001' where materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'" >/dev/null 2>&1 || { echo "BASE FALHOU: o autor das etapas"; exit 2; }
$P -c "create database $A template $G0" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
$P -d $A -v ON_ERROR_STOP=1 -f $M/20261031000001_excluir_etapa_na_conta.sql >/dev/null 2>&1 || { echo "BASE FALHOU: a 20261031000001"; exit 2; }
$P -d $A -v ON_ERROR_STOP=1 -c "create table public.h_etapas_antes_do_catalogo as select * from public.orcamentista_familia_etapa;
  create table public.h_log_antes_do_catalogo as select count(*) as n from public.superadmin_alteracao_log;" >/dev/null || { echo "FOTO NAO TIRADA"; exit 2; }
$P -c "create database $D template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in 1 2; do
  $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "BASE FALHOU: a migracao (vez $i)"; $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  [ $i = 1 ] && $P -d $D -c "create table public.h_log_depois_da_1 as select count(*) as n from public.superadmin_alteracao_log" >/dev/null
done

# as GUARDAS: cada uma numa cópia, com o estado que a dispara; aborta com a frase e NADA muda (a etapa continua com rotulo/acao/abas e sem catálogo)
nada_mudou() { [ "$($P -d $1 -At -c "select (select count(*) from information_schema.columns where table_name = 'orcamentista_familia_etapa' and column_name in ('rotulo','acao','abas'))::text || '|' || (to_regclass('public.orcamentista_etapa_catalogo') is null)::text")" = "3|true" ]; }
guarda() { # $1 número, $2 base (template), $3 o SQL que monta o estado, $4 a frase esperada, $5 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $2" >/dev/null
  [ -n "$3" ] && { $P -d $GC -v ON_ERROR_STOP=1 -c "$3" >/dev/null 2>&1 || { echo "ERROR:  FALHOU guarda $1: o estado nao montou"; return; }; }
  local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  local OK=1; [ "$6" = "catalogo_vazio" ] && OK=$([ "$($P -d $GC -At -c "select count(*) from public.orcamentista_etapa_catalogo")" = "1" ] && echo 1 || echo 0)
  if echo "$SAI" | grep -q "$4" && { [ "$6" = "catalogo_vazio" ] && [ "$OK" = 1 ] || nada_mudou $GC; }; then echo "NOTICE:  ok: guarda $1 — $5"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
guardas() {
guarda 1 $G0 "" "ERROR:  dependencia ausente: a 20261031000001" "sem a 20261031000001, aborta com a frase e nada muda"
guarda 2 $A "create or replace function public.superadmin_arquivar_motor(p_motor uuid, p_por uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as \$f\$ begin return null; end \$f\$;" \
  "ERROR:  guarda: superadmin_arquivar_motor nao tem o corpo da 20261029000005" "o arquivar com outro corpo: aborta (nao substitui o que nao leu)"
guarda 3 $A "update public.orcamentista_familia_etapa set rotulo = 'RELAÇÃO DE BARRAS E MATERIAIS' where numero = 2;" \
  "ERROR:  guarda: etapas com o mesmo nome e conteudo diferente" "dois rotulos iguais sem olhar a caixa, com grafia e abas diferentes: aborta (escolher qual vale nao foi autorizado)"
guarda 4 $A "update public.orcamentista_familia_etapa set abas = array['tipologias'] where numero = 2; update public.orcamentista_familia_etapa set rotulo = 'Relação de barras e materiais' where numero = 2;" \
  "ERROR:  guarda: etapas com o mesmo nome e conteudo diferente" "mesmo rotulo e acao, abas diferentes: aborta"
guarda 5 $A "create table public.orcamentista_etapa_catalogo (id uuid primary key default gen_random_uuid(), nome text, acao text, abas text[], ordem int, criado_por uuid, criado_em timestamptz); insert into public.orcamentista_etapa_catalogo (nome) values ('feito a mao');" \
  "ERROR:  guarda: o catalogo de etapas ja existe com 1 item" "o catalogo ja existe com item e a etapa ainda tem acao: aborta" catalogo_vazio
}
# o SEMEIO de duas etapas IGUAIS em tudo (nome, ação, abas): um item só, as duas apontando-o (numa cópia, a 2 vira igual à 3)
semeio() { # $1 número, $2 o SQL que monta o estado, $3 a consulta, $4 o esperado, $5 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $A" >/dev/null
  $P -d $GC -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1 && $P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
  local V; V=$($P -d $GC -At -c "$3" 2>&1)
  if [ "$V" = "$4" ]; then echo "NOTICE:  ok: semeio $1 — $5"; else echo "ERROR:  FALHOU semeio $1: $V"; fi
}
semeios() {
semeio 1 "update public.orcamentista_familia_etapa set rotulo = 'Relação de barras e materiais', abas = (select abas from public.orcamentista_familia_etapa where numero = 3) where numero = 2;" \
  "select (select count(*) from public.orcamentista_etapa_catalogo)::text || '|' || (select count(distinct etapa_catalogo_id) from public.orcamentista_familia_etapa where numero in (2, 3))::text || '|' || (select string_agg(ordem::text || ':' || nome, ',' order by ordem) from public.orcamentista_etapa_catalogo)" \
  "2|1|1:Apanhado e levantamento de esquadrias,2:Relação de barras e materiais" "duas etapas iguais em tudo viram UM item, as duas apontando-o, na ordem do menor numero"
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guardas; semeios) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + $(grep -c "^guarda [0-9]" $S/run.sh) + $(grep -c "^semeio [0-9]" $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $A $G0 $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
