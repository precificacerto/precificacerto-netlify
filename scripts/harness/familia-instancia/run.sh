#!/bin/bash
# HARNESS da migração 20261028000001 (a família-instância e o catálogo de motores). NÃO TOCA PRODUÇÃO.
# Cadeia: as migrações REAIS até a 20261027000010 (o que o que a pasta não traz vem dos stubs e complementos) -> o estado de PRODUÇÃO de 28/10/2026
# (os mesmos ids) -> a 000011 DUAS vezes -> os casos -> as corridas. As GUARDAS rodam em bancos à parte, cópias do "antes" com um defeito cada.
# Uso: run.sh [arquivo da migração]  (o argumento é como as mutações trocam por cópias estragadas). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261028000001_familia_instancia_e_catalogo_de_motores.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_familia_instancia}
A=${D}_antes
# a função de remover, como está em produção (o texto REAL da 20261023000003, cortado do arquivo: do CREATE dela até o próximo REVOKE)
REM=$(mktemp --suffix=.sql)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima/{on=1} on && /^-- ── 8\. FECHADAS/{on=0} on{print}' $M/20261023000003_funcoes_dos_tres_niveis.sql > "$REM"
echo "REVOKE ALL ON FUNCTION public.superadmin_remover_materia_prima(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.superadmin_remover_materia_prima(uuid, uuid, uuid) TO service_role;" >> "$REM"
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "drop database if exists $A" >/dev/null 2>&1
$P -c "create database $A" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $S/05_stubs.sql $S/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql "$REM" $S/08_estado_de_antes.sql; do
  $P -d $A -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $A -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
$P -c "create database $D template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in 1 2; do
  $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "BASE FALHOU: a migracao (vez $i)"; $P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -E "ERROR|DETAIL" | head -4; exit 2; }
done
# AS GUARDAS: cada uma num banco à parte, cópia do "antes" com UM defeito; a migração tem de abortar com a frase, e NADA pode ter mudado.
guarda() { # $1 nome, $2 o defeito (SQL), $3 o trecho da frase esperada
  local G=${D}_g; $P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G template $A" >/dev/null
  $P -d $G -c "$2" >/dev/null 2>&1 || { echo "ERROR:  FALHOU guarda $1: o defeito nao entrou"; return; }
  local SAI; SAI=$($P -d $G -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  local COL; COL=$($P -d $G -At -c "select count(*) from information_schema.columns where table_name='orcamentista_familia_etapa' and column_name='materia_prima_id'")
  local VIG; VIG=$($P -d $G -At -c "select count(*) from information_schema.columns where table_name='orcamentista_motor' and column_name='vigente'")
  if echo "$SAI" | grep -q "$3" && [ "$COL" = "0" ] && [ "$VIG" = "1" ]; then echo "NOTICE:  ok: guarda $1 — aborta com a frase e nada muda"; else echo "ERROR:  FALHOU guarda $1: col=$COL vigente=$VIG saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
  $P -c "drop database if exists $G" >/dev/null 2>&1
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1
  guarda 1 "insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('b0000000-0000-0000-0000-00000000000b', 'PVC da B', 2, 'PVC')" "ha 2 materias-primas com familia PVC"
  guarda 2 "insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao) values ('PVC', 4, 'Quarta', 'ENVIAR')" "nao sao exatamente as 3"
  guarda 3 "delete from public.orcamentista_familia_etapa where numero = 3" "nao sao exatamente as 3"
  guarda 4 "insert into public.orcamentista_motor (familia, fornecedor_id, arquivo_nome, arquivo_path, vigente) values ('PVC', null, 'da etapa.xlsx', 'familia/PVC/motor/x.xlsx', false)" "ha motor sem fornecedor"
  guarda 5 "insert into public.orcamentista_motor (familia, fornecedor_id, arquivo_nome, arquivo_path, vigente) values ('PVC', 'f2000000-0000-0000-0000-000000000002', 'roller.xlsx', 'f2000000-0000-0000-0000-000000000002/motor/x.xlsx', true)" "alem do da Wolff sem categoria"
  guarda 6 "update public.orcamentista_familia_etapa set familia = 'ALUMINIO', motor_id = null where numero = 3" "nao sao exatamente as 3"
  ) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + 6 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
$P -c "drop database if exists $A" >/dev/null 2>&1
[ "$OKS" = "$ESPERADO" ] || exit 1
