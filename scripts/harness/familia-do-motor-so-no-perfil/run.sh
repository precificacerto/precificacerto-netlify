#!/bin/bash
# HARNESS da migração 20261029000002 (a família do motor só no Perfil, com a trava declarativa). NÃO TOCA PRODUÇÃO.
# Cadeia: as migrações REAIS até a 20261027000010 (o que a pasta não traz vem dos stubs e complementos, os de familia-instancia) -> o estado de
# PRODUÇÃO de 28/10/2026 (os mesmos ids) -> a 20261028000001, a 20261028000002 e a 20261029000001, como em produção em 29/10/2026 -> os dados dos
# casos -> a 20261029000002 DUAS vezes -> os casos e as corridas. As GUARDAS rodam em cópias à parte, cada uma com o estado que a dispara.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261029000002_familia_do_motor_so_no_perfil.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_familia_so_no_perfil}
A=${D}_antes; G0=${D}_sem_000001; GC=${D}_guarda
REM=$(mktemp --suffix=.sql)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima/{on=1} on && /^-- ── 8\. FECHADAS/{on=0} on{print}' $M/20261023000003_funcoes_dos_tres_niveis.sql > "$REM"
for x in $D $A $G0 $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
$P -c "create database $G0" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $S/05_stubs.sql $S/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql "$REM" $S/08_estado_de_antes.sql $M/20261028000001_familia_instancia_e_catalogo_de_motores.sql $M/20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.sql $S/09_dados.sql; do
  $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
$P -c "create database $A template $G0" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
$P -d $A -v ON_ERROR_STOP=1 -f $M/20261029000001_trocar_arquivo_e_editar_motor.sql >/dev/null 2>&1 || { echo "BASE FALHOU: 20261029000001"; exit 2; }
$P -c "create database $D template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in 1 2; do $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "BASE FALHOU: a migracao (vez $i)"; $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -E "ERROR|DETAIL" | head -3; exit 2; }; done

# as GUARDAS: cada uma numa cópia, com o estado que a dispara; aborta com a frase e NADA muda (a coluna gerada não nasce, a família segue NOT NULL)
nada_mudou() { [ "$($P -d $1 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_motor' and column_name = 'familia_exigida'")" = "0" ] \
  && [ "$($P -d $1 -At -c "select count(*) from information_schema.columns where column_name = 'motor_familia_exigida'")" = "0" ] \
  && [ "$($P -d $1 -At -c "select count(*) from pg_constraint where conname = 'orcamentista_motor_familia_so_no_perfil'")" = "0" ]; }
guarda() { # $1 número, $2 base (template), $3 o SQL que monta o estado, $4 a frase esperada, $5 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $2" >/dev/null
  [ -n "$3" ] && $P -d $GC -v ON_ERROR_STOP=1 -c "$3" >/dev/null 2>&1
  local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q "$4" && nada_mudou $GC; then echo "NOTICE:  ok: guarda $1 — $5"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
SU=e0000000-0000-0000-0000-000000000001; WM=9a233c55-f377-45d3-b2ae-b1a740a98e44; RS=f2000000-0000-0000-0000-000000000002; T=20e08592-f957-4e72-b7eb-251387e34eb9
guardas() {
guarda 1 $G0 "" "dependencia ausente" "sem a 20261029000001, aborta com a frase e nada muda"
guarda 2 $A "insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('PVC', '$RS', 'PERSIANAS', 'p.xlsx', '$RS/motor/p.xlsx')" \
  "motor(es) fora do Perfil com familia" "um motor de persiana com familia: aborta (esvaziar a familia dele nao foi autorizado)"
guarda 3 $A "insert into public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, rotulo, acao, motor_id) values ('$T', '79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 4, 'Quarta', 'APANHAR', '$WM')" \
  "nao sao as 3 medidas" "uma quarta etapa com motor: aborta (o preenchimento autorizado e o das 3)"
guarda 4 $A "delete from public.orcamentista_familia_etapa where numero = 3" "nao sao as 3 medidas" "so 2 das 3 etapas com motor: aborta"
guarda 5 $A "update public.orcamentista_levantamento_item set motor_id = '$WM'" "item(ns) de levantamento com motor" "um item de levantamento com motor: aborta (o item nao tem preenchimento autorizado)"
guarda 6 $A "alter table public.orcamentista_familia_etapa drop constraint orcamentista_familia_etapa_motor_fkey;
  insert into public.orcamentista_motor (id, familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('a1000000-0000-0000-0000-00000000000f', 'ALUMINIO', '$RS', 'PERFIL', 'a.xlsx', '$RS/motor/a.xlsx');
  update public.orcamentista_familia_etapa set motor_id = 'a1000000-0000-0000-0000-00000000000f' where numero = 1" \
  "motor sem familia, de outra familia ou fora do Perfil" "uma das 3 etapas com motor de OUTRA familia (sem a FK de hoje): aborta"
guarda 7 $A "alter table public.orcamentista_familia_etapa drop constraint orcamentista_familia_etapa_motor_fkey;
  alter table public.orcamentista_motor alter column familia drop not null; update public.orcamentista_motor set familia = null where id = '$WM'" \
  "motor sem familia, de outra familia ou fora do Perfil" "uma das 3 etapas com motor SEM familia: aborta"
guarda 8 $A "alter table public.orcamentista_familia_catalogo drop constraint orcamentista_familia_catalogo_chave_forma;
  alter table public.orcamentista_familia_catalogo add constraint orcamentista_familia_catalogo_chave_forma check (chave ~ '^.+$')" \
  "poderia ser chave" "a forma da chave de familia nao e a medida (o '*' poderia ser chave): aborta"
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guardas) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + $(grep -c "^guarda [0-9]" $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $A $G0 $GC; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
