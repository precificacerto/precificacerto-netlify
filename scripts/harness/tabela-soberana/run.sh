#!/bin/bash
# HARNESS da migração 20261101000001 (a tabela de fornecedor entra na soberania do catálogo). NÃO TOCA PRODUÇÃO.
# A cadeia é a de catalogo-soberano até a 20261031000003 aplicada (como em produção, conferida pelo md5 em 01/11/2026), e então esta DUAS vezes.
# Roda os casos novos (10_casos.sql) E os 22 casos da 20261031000003 (regressão: os quatro tipos de antes não mudam).
# Cadeia: a mesma de excluir-etapa-na-conta (as migrações REAIS, os stubs e o estado de PRODUÇÃO, os mesmos ids) -> a 20261029000003, a 20261029000004 e
# a 20261029000005 -> o estado das 3 etapas de 31/10/2026 -> a 20261031000001 e a 20261031000002 (aplicadas em produção) -> o estado do que o arrasto
# alcança, na forma medida em produção em 31/10/2026 (09_estado.sql) -> a foto do antes -> a 20261031000003 DUAS vezes -> os casos e as corridas.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations; B=$H/familia-do-motor-so-no-perfil
MIG=${1:-$M/20261101000001_tabela_na_soberania.sql}; CS=$H/catalogo-soberano
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_tabela_soberana}
A=${D}_antes; G0=${D}_sem_000003; GC=${D}_guarda
REM=$(mktemp --suffix=.sql)
awk '/^CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima/{on=1} on && /^-- ── 8\. FECHADAS/{on=0} on{print}' $M/20261023000003_funcoes_dos_tres_niveis.sql > "$REM"
for x in $D $A $G0 $GC ${D}_cadeia; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
B0=${D}_cadeia; $P -c "drop database if exists $B0" >/dev/null 2>&1
$P -c "create database $B0" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $H/orcamentista/00_schema.sql $M/20261018000001_orcamentista_bloco_1.sql $H/atendimentos-ia-2b1/00_storage.sql $M/20261019000001_atendimentos_ia_bloco_2b1.sql $M/20261020000001_atendimentos_ia_importacao.sql $M/20261020000002_importar_conteudo_da_tabela.sql $M/20261024000001_tempo_de_fabricacao_por_tipologia.sql $H/reimportacao-com-os-tempos/05_estado_de_producao.sql $M/20261024000003_tempo_da_tipologia_em_tabela_propria.sql $M/20261025000004_abas_do_motor_por_tipologia.sql $M/20261026000001_limite_de_tempo_da_importacao.sql $B/05_stubs.sql $B/06_complementos.sql $M/20261026000004_familia_da_tabela.sql $M/20261026000005_tabela_vigente.sql $M/20261027000002_motor_por_familia_e_etapas.sql $M/20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.sql $M/20261027000005_categoria_da_tabela_de_fornecedor.sql $M/20261027000006_motor_da_familia.sql $M/20261027000007_motor_so_para_perfil.sql $M/20261027000008_etapa_aponta_o_motor.sql $M/20261027000009_tira_perfil_exige_motor.sql $M/20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql "$REM" $B/08_estado_de_antes.sql $M/20261028000001_familia_instancia_e_catalogo_de_motores.sql $M/20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.sql $B/09_dados.sql $M/20261029000001_trocar_arquivo_e_editar_motor.sql $M/20261029000002_familia_do_motor_so_no_perfil.sql $H/motor-para-n-familias/09_dados.sql $M/20261029000003_motor_para_n_familias.sql $M/20261029000004_familias_do_catalogo.sql $M/20261029000005_nome_do_motor_e_arquivar_em_uso.sql; do
  $P -d $B0 -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $B0 -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E "ERROR|DETAIL|HINT" | head -4; exit 2; }
done
# o estado das 3 etapas de 31/10/2026 (o mesmo arquivo do harness da 000001) sem as fotos que ele tira
grep -v '^create table public.h_' $H/excluir-etapa-na-conta/09_dados.sql | $P -d $B0 -v ON_ERROR_STOP=1 >/dev/null 2>&1 || { echo "BASE FALHOU: o estado de 31/10"; exit 2; }
# medido em produção em 31/10/2026: as 3 etapas têm autor, um super admin (quem as gravou pela tela); aqui, o super admin dos stubs
$P -d $B0 -v ON_ERROR_STOP=1 -c "update public.orcamentista_familia_etapa set atualizado_por = 'e0000000-0000-0000-0000-000000000001' where materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'" >/dev/null 2>&1 || { echo "BASE FALHOU: o autor das etapas"; exit 2; }
$P -d $B0 -v ON_ERROR_STOP=1 -f $M/20261031000001_excluir_etapa_na_conta.sql >/dev/null 2>&1 || { echo "BASE FALHOU: a 20261031000001"; exit 2; }
$P -c "create database $A template $B0" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for f in $M/20261031000002_etapa_no_catalogo.sql $CS/09_estado.sql; do
  OUT=$($P -d $A -v ON_ERROR_STOP=1 -f "$f" 2>&1) || { echo "BASE FALHOU: $f"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
# G0: o estado com a 20261031000002 e sem a 20261031000003 (para a guarda); A: com a 20261031000003, como em produção
$P -c "drop database if exists $G0" >/dev/null 2>&1; $P -c "create database $G0 template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
OUT=$($P -d $A -v ON_ERROR_STOP=1 -f $M/20261031000003_catalogo_soberano.sql 2>&1) || { echo "BASE FALHOU: a 20261031000003"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
$P -c "create database $D template $A" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in $(seq 1 ${VEZES:-2}); do  # as mutações rodam com VEZES=1: o corpo mutado tem outro md5, e a guarda da reaplicação o recusaria (morte falsa)
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
# BASE_SO=1: para aqui, com $D no estado de produção de hoje (a 20261101000001 aplicada) — é a base de quem vem depois (arquivo-em)
if [ -n "$BASE_SO" ]; then for x in $A $G0 ${D}_cadeia; do $P -c "drop database if exists $x" >/dev/null 2>&1; done; exit 0; fi


# as GUARDAS: cada uma numa cópia com o estado que a dispara; aborta com a frase, e nada muda (o tipo 'tabela' continua desconhecido)
nada_mudou() { ! $P -d $1 -v ON_ERROR_STOP=1 -At -c "select public.orcamentista_arrasto_passos('tabela')" >/dev/null 2>&1; }
guarda() { # $1 número, $2 base (template), $3 o SQL que monta o estado, $4 a frase esperada, $5 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $2" >/dev/null
  [ -n "$3" ] && { $P -d $GC -v ON_ERROR_STOP=1 -c "$3" >/dev/null 2>&1 || { echo "ERROR:  FALHOU guarda $1: o estado nao montou"; return; }; }
  local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q "$4" && nada_mudou $GC; then echo "NOTICE:  ok: guarda $1 — $5"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
# o CONTRASTE das guardas: o estado de produção como está. Medido em 01/11/2026, os corpos da 20261031000003 em produção têm \r (aplicada pelo
# Editor, em CRLF: 93 no dos passos, 116 no da remoção); a guarda compara sem o \r e tem de ACEITAR — sem isto, ela abortaria em produção.
aceita() { # $1 número, $2 base sem a 000003, $3 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $2" >/dev/null
  sed 's/$/\r/' $M/20261031000003_catalogo_soberano.sql | $P -d $GC -v ON_ERROR_STOP=1 >/dev/null 2>&1 || { echo "ERROR:  FALHOU aceita $1: a 20261031000003 em CRLF nao aplicou"; return; }
  local CR; CR=$($P -d $GC -At -c "select count(*) from pg_proc where proname = 'orcamentista_arrasto_passos' and position(chr(13) in prosrc) > 0")
  [ "$CR" = "1" ] || { echo "ERROR:  FALHOU aceita $1: o corpo nao ficou com \r (cr=$CR)"; return; }
  if $P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 && ! nada_mudou $GC; then echo "NOTICE:  ok: aceita $1 — $3"; else echo "ERROR:  FALHOU aceita $1: a guarda recusou o estado de producao"; fi
}
guardas() {
aceita 1 $G0 "a 20261031000003 com \r nos corpos, como em produção: a guarda aceita e a migração aplica"
guarda 1 $G0 "" "ERROR:  dependencia ausente: a 20261031000003" "sem a 20261031000003, aborta com a frase e nada muda"
guarda 2 $A "create or replace function public.superadmin_arrasto_do_catalogo(p_tipo text, p_chave text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as \$x\$ begin return public.orcamentista_arrasto_medir(p_tipo, p_chave) || '{}'; end \$x\$;" \
  "ERROR:  dependencia ausente: a 20261031000003" "um corpo da 20261031000003 diferente do aplicado (md5): aborta"
guarda 3 $A "create table public.h_aponta_tabela_item (i uuid references public.orcamentista_tabela_item (id));" \
  "ERROR:  guarda: o fecho da remocao nao conhece estas chaves estrangeiras: h_aponta_tabela_item -> orcamentista_tabela_item" "uma tabela nova que aponta o item de preco: aborta (o fecho nao a conhece)"
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; cd $CS && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guardas) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^-- CASO " $CS/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + $(grep -c "^guarda [0-9]" $S/run.sh) + $(grep -c "^aceita [0-9]" $S/run.sh) ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
for x in $A $G0 $GC ${D}_cadeia; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
[ "$OKS" = "$ESPERADO" ] || exit 1
