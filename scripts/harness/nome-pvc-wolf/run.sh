#!/bin/bash
# HARNESS da migração 20261028000002 (o nome "PVC Wolf" e a família obrigatória só no Perfil). NÃO TOCA PRODUÇÃO.
# Cadeia: as migrações REAIS até a 20261027000010 (o que a pasta não traz vem dos stubs e complementos, os mesmos de familia-instancia)
# -> o estado de PRODUÇÃO de 28/10/2026 (os mesmos ids) -> a 000002 DUAS vezes -> os casos. Depois, a ORDEM: a 000002 aplicada depois da
# 20261028000001 (lida do branch do PR #190, porque ainda não está na main) também passa nos casos. As GUARDAS rodam em bancos à parte.
# Uso: run.sh [arquivo da migração] [arquivo da 20261028000001] (sem o segundo, usa o da pasta ou o do branch do #190). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.sql}
M1=${2:-}
# a 20261028000001: o arquivo, quando o PR #190 já estiver na main; antes disso, lido do branch dele
if [ -z "$M1" ]; then
  M1=$M/20261028000001_familia_instancia_e_catalogo_de_motores.sql
  if [ ! -f "$M1" ]; then M1=$(mktemp --suffix=.sql); git -C "$R" show origin/claude/familia-instancia-e-catalogo-de-motores:supabase/migrations/20261028000001_familia_instancia_e_catalogo_de_motores.sql > "$M1" 2>/dev/null || M1=""; fi
fi
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_nome_pvc_wolf}
A=${D}_antes
REM=$(mktemp --suffix=.sql)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima/{on=1} on && /^-- ── 8\. FECHADAS/{on=0} on{print}' $M/20261023000003_funcoes_dos_tres_niveis.sql > "$REM"
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "drop database if exists $A" >/dev/null 2>&1
$P -c "create database $A" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $S/05_stubs.sql $S/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql "$REM" $S/08_estado_de_antes.sql $S/09_tabelas_de_producao.sql; do
  $P -d $A -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $A -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
aplicar() { # $1 banco; aplica a migração duas vezes
  for i in 1 2; do $P -d $1 -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "BASE FALHOU: a migracao (vez $i)"; $P -d $1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -E "ERROR|DETAIL" | head -3; return 1; }; done
}
$P -c "create database $D template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
aplicar $D || exit 2
guarda() { # $1 nome, $2 o defeito (SQL), $3 o trecho da frase esperada
  local G=${D}_g; $P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G template $A" >/dev/null
  $P -d $G -c "$2" >/dev/null 2>&1 || { echo "ERROR:  FALHOU guarda $1: o defeito nao entrou"; return; }
  local SAI; SAI=$($P -d $G -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  local CK; CK=$($P -d $G -At -c "select count(*) from pg_constraint where conname = 'orcamentista_tabela_familia_no_perfil'")
  local LOG; LOG=$($P -d $G -At -c "select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_catalogo'")
  if echo "$SAI" | grep -q "$3" && [ "$CK" = "0" ] && [ "$LOG" = "0" ]; then echo "NOTICE:  ok: guarda $1 — aborta com a frase e nada muda"; else echo "ERROR:  FALHOU guarda $1: check=$CK log=$LOG saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
  $P -c "drop database if exists $G" >/dev/null 2>&1
}
ordem() { # a 000002 depois da 000001 (do PR #190): os casos valem do mesmo jeito
  [ -n "$M1" ] || { echo "ERROR:  FALHOU ordem: sem o arquivo da 20261028000001"; return; }
  local O=${D}_o; $P -c "drop database if exists $O" >/dev/null 2>&1; $P -c "create database $O template $A" >/dev/null
  $P -d $O -v ON_ERROR_STOP=1 -f "$M1" >/dev/null 2>&1 || { echo "ERROR:  FALHOU ordem: a 000001 nao aplicou"; return; }
  aplicar $O >/dev/null || { echo "ERROR:  FALHOU ordem: a 000002 nao aplicou depois da 000001"; return; }
  # a 000001 muda a matéria-prima e as etapas, e a FOTO do caso N2 é de antes dela: na ordem, valem N1, N3 e N4
  local SAI; SAI=$(cd $S && $P -d $O -f 10_casos.sql 2>&1)
  local ERR; ERR=$(echo "$SAI" | grep -E "ERROR" | grep -v "caso N2" | head -1)
  if echo "$SAI" | grep -q "ok: caso N1" && echo "$SAI" | grep -q "ok: caso N3" && echo "$SAI" | grep -q "ok: caso N4" && [ -z "$ERR" ]; then echo "NOTICE:  ok: ordem — depois da 20261028000001, a 000002 aplica duas vezes e passa em N1, N3 e N4"; else echo "ERROR:  FALHOU ordem: ${ERR:-falta N1, N3 ou N4}"; fi
  $P -c "drop database if exists $O" >/dev/null 2>&1
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1
  guarda 1 "update public.orcamentista_familia_catalogo set rotulo = 'PVC Linha X' where chave = 'PVC'" 'se chama "PVC Linha X"'
  guarda 2 "insert into public.orcamentista_familia_catalogo (chave, rotulo, ordem) values ('PVC_WOLF', 'pvc wolf', 9)" 'ja ha outra familia chamada'
  guarda 3 "update public.orcamentista_tabela set familia = null where id = '5f52bb9e-c83b-4f0b-b715-4fe18db2a620'" 'tabela(s) de PERFIL sem familia'
  ordem
  ) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + 3 + 1 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
$P -c "drop database if exists $A" >/dev/null 2>&1
[ "$OKS" = "$ESPERADO" ] || exit 1
