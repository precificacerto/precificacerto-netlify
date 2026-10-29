#!/bin/bash
# HARNESS da migração 20261029000003 (o motor serve N famílias: a ligação, a trava adiada, as FKs da etapa e do item). NÃO TOCA PRODUÇÃO.
# Cadeia: a mesma de familia-do-motor-so-no-perfil (as migrações REAIS, os stubs e o estado de PRODUÇÃO de 28/10/2026, os mesmos ids) -> a 20261029000001
# e a 20261029000002, como em produção em 29/10/2026 (conferido: 1 motor PERFIL PVC, as 3 etapas exigindo PVC, nenhum '*', nenhum item com motor) ->
# a foto do antes -> a 20261029000003 DUAS vezes -> os casos, os commits de verdade e as corridas. As GUARDAS rodam em cópias à parte.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations; B=$H/familia-do-motor-so-no-perfil
MIG=${1:-$M/20261029000003_motor_para_n_familias.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_motor_n_familias}
A=${D}_antes; G0=${D}_sem_000002; GC=${D}_guarda
REM=$(mktemp --suffix=.sql)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima/{on=1} on && /^-- ── 8\. FECHADAS/{on=0} on{print}' $M/20261023000003_funcoes_dos_tres_niveis.sql > "$REM"
for x in $D $A $G0 $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
$P -c "create database $G0" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $B/05_stubs.sql $B/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql "$REM" $B/08_estado_de_antes.sql $M/20261028000001_familia_instancia_e_catalogo_de_motores.sql $M/20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.sql $B/09_dados.sql $M/20261029000001_trocar_arquivo_e_editar_motor.sql; do
  $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
$P -c "create database $A template $G0" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for f in $M/20261029000002_familia_do_motor_so_no_perfil.sql $S/09_dados.sql; do
  $P -d $A -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; exit 2; }
done
$P -c "create database $D template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in 1 2; do $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "BASE FALHOU: a migracao (vez $i)"; $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -E "ERROR|DETAIL" | head -3; exit 2; }; done

# as GUARDAS: cada uma numa cópia, com o estado que a dispara; aborta com a frase e NADA muda (a ligação não nasce, a família do motor fica)
nada_mudou() { [ "$($P -d $1 -At -c "select count(*) from pg_class where relname = 'orcamentista_motor_familia'")" = "${2:-0}" ] \
  && [ "$($P -d $1 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_motor' and column_name = 'familia'")" = "1" ]; }
guarda() { # $1 número, $2 base (template), $3 o SQL que monta o estado, $4 a frase esperada, $5 a descrição, $6 a ligação já existia (1) ou não (vazio)
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $2" >/dev/null
  [ -n "$3" ] && $P -d $GC -v ON_ERROR_STOP=1 -c "$3" >/dev/null 2>&1
  local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q "$4" && nada_mudou $GC $6; then echo "NOTICE:  ok: guarda $1 — $5"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
RS=f2000000-0000-0000-0000-000000000002; T=20e08592-f957-4e72-b7eb-251387e34eb9
guardas() {
guarda 1 $G0 "" "ERROR:  dependencia ausente: a 20261029000002" "sem a 20261029000002, aborta com a frase e nada muda"
guarda 2 $A "insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values (null, '$RS', 'PERSIANAS', 'p.xlsx', '$RS/motor/p.xlsx')" \
  "guarda: 1 motor(es) sem familia" "um motor de persiana sem familia: aborta (dar familia a ele nao foi autorizado)"
guarda 3 $A "alter table public.orcamentista_familia_etapa drop constraint orcamentista_familia_etapa_motor_exigida_fkey;
  update public.orcamentista_familia_etapa set motor_familia_exigida = '*' where numero = 1" \
  "guarda: 1 etapa(s) e 0 item(ns) de levantamento apontam motor sem familia" "uma etapa com a exigida '*' (sem a FK de hoje): aborta"
guarda 4 $A "alter table public.orcamentista_levantamento_item drop constraint orcamentista_levantamento_item_motor_exigida_fkey;
  update public.orcamentista_levantamento_item set motor_id = '9a233c55-f377-45d3-b2ae-b1a740a98e44', motor_familia_exigida = '*'" \
  "guarda: 0 etapa(s) e 1 item(ns) de levantamento apontam motor sem familia" "um item com a exigida '*' (sem a FK de hoje): aborta"
guarda 5 $A "create table public.orcamentista_motor_familia (motor_id uuid not null, familia text not null, primary key (motor_id, familia));
  insert into public.orcamentista_motor_familia values ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'ALUMINIO')" \
  "ERROR:  semeio: 1 motor(es) com familia antes e 2 ligacao(oes) depois" "a ligacao ja existia com uma linha a mais: o semeio mede e aborta" 1
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/15_commit.sh "$P" $D 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guardas) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# COMMIT " $S/15_commit.sh) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + $(grep -c "^guarda [0-9]" $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $A $G0 $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
