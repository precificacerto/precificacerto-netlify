#!/bin/bash
# HARNESS da migração 20261029000001 (trocar o arquivo do motor = motor novo; editar categoria e fornecedor só sem uso). NÃO TOCA PRODUÇÃO.
# Cadeia: as migrações REAIS até a 20261027000010 (o que a pasta não traz vem dos stubs e complementos, os de familia-instancia) -> o estado de
# PRODUÇÃO de 28/10/2026 (os mesmos ids) -> a 20261028000001 e a 20261028000002, como em produção em 29/10/2026 -> um levantamento antigo que leu
# o motor da Wolff -> a 20261029000001 DUAS vezes -> os casos e as corridas. A GUARDA roda num banco à parte, sem a 20261028000001.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261029000001_trocar_arquivo_e_editar_motor.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_trocar_arquivo}
A=${D}_antes; G0=${D}_sem_000001
REM=$(mktemp --suffix=.sql)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima/{on=1} on && /^-- ── 8\. FECHADAS/{on=0} on{print}' $M/20261023000003_funcoes_dos_tres_niveis.sql > "$REM"
for x in $D $A $G0; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
$P -c "create database $G0" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $S/05_stubs.sql $S/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql "$REM" $S/08_estado_de_antes.sql; do
  $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $G0 -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
$P -c "create database $A template $G0" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for f in $M/20261028000001_familia_instancia_e_catalogo_de_motores.sql $M/20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.sql $S/09_dados.sql; do
  $P -d $A -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $A -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
$P -c "create database $D template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in 1 2; do $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "BASE FALHOU: a migracao (vez $i)"; $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -E "ERROR|DETAIL" | head -3; exit 2; }; done
guarda() { # sem a 20261028000001: aborta com a frase, e nenhuma das duas funções nasce
  local SAI; SAI=$($P -d $G0 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  local F; F=$($P -d $G0 -At -c "select count(*) from pg_proc where proname in ('superadmin_trocar_arquivo_do_motor', 'superadmin_editar_motor')")
  if echo "$SAI" | grep -q "dependencia ausente" && [ "$F" = "0" ]; then echo "NOTICE:  ok: guarda 1 — sem a 20261028000001, aborta com a frase e nenhuma funcao nasce"; else echo "ERROR:  FALHOU guarda 1: funcoes=$F saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guarda) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + 1 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $A $G0; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
