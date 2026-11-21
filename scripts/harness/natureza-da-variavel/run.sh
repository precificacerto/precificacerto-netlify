#!/bin/bash
# HARNESS da 20261121000001 (a natureza da variável). NÃO TOCA PRODUÇÃO.
# Base: ../vidro-padrao-por-grupo/00_schema.sql + a 20261113000001 (as duas sementes do vidro padrão, como em produção) + 01_estado.sql (a política
# da De Paula como medida em 21/11/2026 e o log). Depois: a migração DUAS vezes, os casos, as guardas e o contraste.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base ou a migração abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261121000001_natureza_da_variavel.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_natureza}
OKS=0; FALHAS=0
caso() { if [ "$2" = "$3" ]; then echo "ok: $1"; OKS=$((OKS+1)); else echo "FALHOU: $1 — esperado [$3], veio [$2]"; FALHAS=$((FALHAS+1)); fi; }
base() {
  $P -c "drop database if exists $1" >/dev/null 2>&1; $P -c "create database $1" >/dev/null || exit 2
  $P -d $1 -v ON_ERROR_STOP=1 -f $R/scripts/harness/vidro-padrao-por-grupo/00_schema.sql >/dev/null 2>&1 || { echo "BASE FALHOU (schema)"; exit 2; }
  $P -d $1 -v ON_ERROR_STOP=1 -f $R/supabase/migrations/20261113000001_vidro_padrao_por_grupo.sql >/dev/null 2>&1 || { echo "BASE FALHOU (20261113000001)"; exit 2; }
  $P -d $1 -v ON_ERROR_STOP=1 -f $S/01_estado.sql >/dev/null 2>&1 || { echo "BASE FALHOU (estado)"; exit 2; }
}
aplica() { $P -d $1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -oE 'guarda: [^.]*|verificacao: [^.]*' | head -1; }
q() { $P -d $1 -tA -c "$2" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
erro() { $P -d $1 -tA -c "$2" 2>&1 | grep -oE 'violates [a-z ]+ constraint "[a-z_]+"|permission denied' | head -1; }
T="'20e08592-f957-4e72-b7eb-251387e34eb9'"

base $D
caso 'aplica na base medida' "$(aplica $D)" ''
caso 'reaplica sem erro' "$(aplica $D)" ''
caso '14 linhas, todas POLITICA da De Paula, familia PVC' "$(q $D "select count(*)||' '||count(*) filter (where natureza='POLITICA' and familia='PVC' and tenant_id=$T) from orcamentista_natureza_da_variavel")" '14 14'
caso 'reaplicar não duplica nem loga de novo' "$(q $D "select count(*) from superadmin_alteracao_log where tabela='orcamentista_natureza_da_variavel'")" '14'
caso 'a política como estava gravada' "$(q $D "select string_agg(variavel||'='||opcao_padrao, ',' order by variavel) from orcamentista_natureza_da_variavel where variavel <> 'VIDRO'")" 'ARE=BZ0010,ARI=BZ1770,BARRA_MM=6000,FOLGA_INSTALACAO_X=0,FOLGA_INSTALACAO_Y=0,GUARNICAO_EXTERNA_MM=20,GUARNICAO_INTERNA_MM=70,MAE=VAO+50MM (CORTE 90/90),MTE=PERIMETRAL,RL=SIM,SOLDA=SPVCAL 6MM,USA_CONTRAMARCO=NAO'
caso 'o vidro padrão pelo grupo' "$(q $D "select string_agg(formato||'='||opcao_padrao, ',' order by formato) from orcamentista_natureza_da_variavel where variavel = 'VIDRO'")" 'janela correr=VIN05,maxim-ar=VBO3,4'
caso 'as tabelas de antes ficam intactas' "$(q $D "select (select count(*) from orcamentista_esquadrias_base)||' '||(select count(*) from orcamentista_vidro_padrao)")" '1 2'
caso 'POLITICA sem opção: recusa' "$(erro $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, variavel, natureza) values ($T,'PVC','UT','POLITICA')")" 'violates check constraint "orcamentista_natureza_opcao_so_na_politica"'
caso 'ITEM com opção: recusa' "$(erro $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, variavel, natureza, opcao_padrao) values ($T,'PVC','UT','ITEM','SIM')")" 'violates check constraint "orcamentista_natureza_opcao_so_na_politica"'
caso 'CALCULO sem opção: aceita' "$(q $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, variavel, natureza) values ($T,'PVC','INT','CALCULO') returning natureza")" 'CALCULO'
caso 'natureza fora das três: recusa' "$(erro $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, variavel, natureza) values ($T,'PVC','UT','OUTRA')")" 'violates check constraint "orcamentista_natureza_natureza"'
caso 'a mesma chave duas vezes: recusa' "$(erro $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, variavel, natureza, opcao_padrao) values ($T,'PVC','ARI','POLITICA','BZ0006')")" 'violates unique constraint "orcamentista_natureza_uma_por_chave"'
caso 'linha/formato numa variável do motor (1a fase): recusa' "$(erro $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, formato, variavel, natureza, opcao_padrao) values ($T,'PVC','maxim-ar','ARI','POLITICA','BZ0006')")" 'violates check constraint "orcamentista_natureza_linha_formato_so_no_vidro"'
caso 'VIDRO de outro formato: aceita' "$(q $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, formato, variavel, natureza, opcao_padrao) values ($T,'PVC','porta correr','VIDRO','POLITICA','VIN08') returning formato")" 'porta correr'
caso 'opção com espaço na ponta: recusa' "$(erro $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, variavel, natureza, opcao_padrao) values ($T,'PVC','MF','POLITICA',' SIM')")" 'violates check constraint "orcamentista_natureza_opcao_forma"'
caso 'familia fora da forma da chave: recusa' "$(erro $D "insert into orcamentista_natureza_da_variavel (tenant_id, familia, variavel, natureza) values ($T,'pvc','UT','ITEM')")" 'violates check constraint "orcamentista_natureza_familia_forma"'
caso 'authenticated não lê' "$(erro $D "set role authenticated; select * from orcamentista_natureza_da_variavel")" 'permission denied'
caso 'service_role tem o privilégio (a RLS ele atravessa em produção: BYPASSRLS)' "$(q $D "select has_table_privilege('service_role','orcamentista_natureza_da_variavel','SELECT,INSERT,UPDATE,DELETE')")" 't'

# GUARDAS: cada uma num banco novo; nada é criado
g() { base ${D}_g; $P -d ${D}_g -c "$1" >/dev/null; caso "guarda: $2" "$(aplica ${D}_g)" "$3"; caso "guarda: $2 — nada criado" "$(q ${D}_g "select to_regclass('orcamentista_natureza_da_variavel') is null")" 't'; }
g "update orcamentista_esquadrias_base set guarnicao_interna = 'BZ0006'" 'a política mudou' 'guarda: a politica da De Paula mudou desde a medicao de 21/11/2026; confira antes de migrar'
g "insert into tenants values ('22222222-2222-2222-2222-222222222222'); insert into orcamentista_esquadrias_base (tenant_id) values ('22222222-2222-2222-2222-222222222222')" 'outra empresa na base' 'guarda: orcamentista_esquadrias_base tem 2 linhas; medida em 21/11/2026 com 1 (a De Paula)'
g "insert into orcamentista_vidro_padrao (tenant_id, materia_prima_id, tipologia, item_codigo) values ($T,'79d764fe-4acd-43e2-bed9-38e20667ca3d','DP-02','VIN04')" 'uma exceção de vidro' 'guarda: orcamentista_vidro_padrao nao e o medido em 21/11/2026 (2 linhas da De Paula: janela correr VIN05; maxim-ar VBO3,4; nenhuma excecao)'
g "update orcamentista_vidro_padrao set item_codigo = 'VIN04' where tipo = 'correr'" 'o vidro padrão mudou' 'guarda: orcamentista_vidro_padrao nao e o medido em 21/11/2026 (2 linhas da De Paula: janela correr VIN05; maxim-ar VBO3,4; nenhuma excecao)'
$P -c "drop database if exists ${D}_v" >/dev/null 2>&1; $P -c "create database ${D}_v" >/dev/null
caso 'guarda: banco sem as dependências (o projeto errado)' "$($P -d ${D}_v -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -oE "guarda: dependencia ausente em ${D}_v" | head -1)" "guarda: dependencia ausente em ${D}_v"

echo "$OKS ok, $FALHAS falhas"; [ $FALHAS -eq 0 ]
