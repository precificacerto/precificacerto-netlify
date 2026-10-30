#!/bin/bash
# HARNESS da migração 20261029000005 (o nome do motor; arquivar motor em uso deixa as etapas sem motor). NÃO TOCA PRODUÇÃO.
# Cadeia: a mesma de motor-para-n-familias (as migrações REAIS, os stubs e o estado de PRODUÇÃO, os mesmos ids) -> a 20261029000001, a
# 20261029000002 e a 20261029000003, como em produção em 29/10/2026 (conferido: 1 motor, o da Wolff, sem nome; 3 etapas com ele; 4 itens, nenhum
# com motor) -> a foto do antes -> a 20261029000005 DUAS vezes -> os casos e as corridas. As GUARDAS rodam em cópias à parte. As ORDENS com a
# 20261029000004 (mergeada no #198 em 30/10/2026; o arquivo vem de $MIG4, ou da pasta de migrações) rodam em cópias à parte.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations; B=$H/familia-do-motor-so-no-perfil
MIG=${1:-$M/20261029000005_nome_do_motor_e_arquivar_em_uso.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_nome_do_motor}
A=${D}_antes; G0=${D}_sem_000003; GC=${D}_guarda
MIG4=${MIG4:-$M/20261029000004_familias_do_catalogo.sql}
REM=$(mktemp --suffix=.sql)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima/{on=1} on && /^-- ── 8\. FECHADAS/{on=0} on{print}' $M/20261023000003_funcoes_dos_tres_niveis.sql > "$REM"
for x in $D $A $G0 $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
$P -c "create database $G0" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $B/05_stubs.sql $B/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql "$REM" $B/08_estado_de_antes.sql $M/20261028000001_familia_instancia_e_catalogo_de_motores.sql $M/20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.sql $B/09_dados.sql $M/20261029000001_trocar_arquivo_e_editar_motor.sql $M/20261029000002_familia_do_motor_so_no_perfil.sql $H/motor-para-n-familias/09_dados.sql; do
  $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
$P -c "create database $A template $G0" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for f in $M/20261029000003_motor_para_n_familias.sql $S/09_dados.sql; do
  $P -d $A -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; exit 2; }
done
$P -c "create database $D template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in 1 2; do $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "BASE FALHOU: a migracao (vez $i)"; $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -E "ERROR|DETAIL" | head -3; exit 2; }; done

# as GUARDAS: cada uma numa cópia, com o estado que a dispara; aborta com a frase e NADA muda (a coluna nome não nasce, as FKs seguem RESTRICT)
nada_mudou() { [ "$($P -d $1 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_motor' and column_name = 'nome'")" = "0" ] \
  && [ "$($P -d $1 -At -c "select count(*) from pg_constraint where conname like '%_motor_exigida_fkey' and confdeltype = 'n'")" = "0" ]; }
guarda() { # $1 número, $2 base (template), $3 o SQL que monta o estado, $4 a frase esperada, $5 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $2" >/dev/null
  [ -n "$3" ] && $P -d $GC -v ON_ERROR_STOP=1 -c "$3" >/dev/null 2>&1
  local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q "$4" && nada_mudou $GC; then echo "NOTICE:  ok: guarda $1 — $5"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
RS=f2000000-0000-0000-0000-000000000002; W=44c5c0fe-a0d3-4aab-802d-20a6eff3f654
guardas() {
guarda 1 $G0 "" "ERROR:  dependencia ausente: a 20261029000003" "sem a 20261029000003, aborta com a frase e nada muda"
guarda 2 $A "begin; with m as (insert into public.orcamentista_motor (fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('$RS', 'PERSIANAS', '.xlsx', '$RS/motor/x.xlsx') returning id) insert into public.orcamentista_motor_familia select id, 'PVC' from m; commit;" \
  "ERROR:  guarda: o nome tirado do arquivo nao tem de 1 a 80 caracteres" "um motor cujo arquivo sem a extensao fica vazio: aborta (dar nome a ele nao foi autorizado)"
guarda 3 $A "begin; with m as (insert into public.orcamentista_motor (fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('$W', 'PERSIANAS', 'Motor_Wolf_PVC.xlsm', '$W/motor/y.xlsm') returning id) insert into public.orcamentista_motor_familia select id, 'PVC' from m; commit;" \
  "ERROR:  guarda: motores ativos do mesmo fornecedor teriam o mesmo nome" "dois motores ativos da Wolf que dariam o mesmo nome: aborta (escolher os nomes nao foi autorizado)"
}
# as ORDENS com a 20261029000004 (as famílias do catálogo): as duas aplicam, e as funções das duas existem no fim
ordem() { # $1 número, $2 primeira, $3 segunda, $4 descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $A" >/dev/null
  if [ ! -s "$MIG4" ]; then echo "ERROR:  FALHOU ordem $1: o arquivo da 20261029000004 nao foi achado"; return; fi
  local SAI; SAI=$( { $P -d $GC -v ON_ERROR_STOP=1 -f "$2" && $P -d $GC -v ON_ERROR_STOP=1 -f "$3"; } 2>&1 >/dev/null | grep -E "^.*ERROR" | head -1)
  local F; F=$($P -d $GC -At -c "select count(*) from pg_proc where proname in ('superadmin_criar_familia', 'superadmin_remover_familia') or oid = to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)')")
  if [ -z "$SAI" ] && [ "$F" = "3" ]; then echo "NOTICE:  ok: ordem $1 — $4"; else echo "ERROR:  FALHOU ordem $1: funcoes=$F saida=$SAI"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guardas; ordem 1 "$MIG4" "$MIG" "a 000004 e depois a 000005: as duas aplicam"; ordem 2 "$MIG" "$MIG4" "a 000005 e depois a 000004: as duas aplicam") | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + $(grep -c "^guarda [0-9]" $S/run.sh) + 2 ))  # + as 2 ordens com a 000004
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $A $G0 $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
