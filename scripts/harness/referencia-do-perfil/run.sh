#!/bin/bash
# HARNESS da migracao 20261124000002 (a referencia do perfil no item da tabela). NAO TOCA PRODUCAO.
# Base: a do bloco-tributario (as migracoes reais ate a 20261102000001) + a 20261112000003/4/5 + a 20261123000004 + a 20261124000001 - o estado
# de producao de 24/11/2026: o corpo de importar_conteudo_da_tabela com md5 fc86097a... e a ACL {postgres=X/postgres} (conferidos abaixo).
# A tabela `orcamentista_orcamento_item_material` e um DUBLE (so `id` e `resolucao`), com a CHECK de producao medida em 24/11/2026 e uma linha por
# valor: a base do bloco-tributario nao chega as migracoes do orcamento, e o que esta migracao toca nela e so a CHECK.
#   D = base + itens de antes + esta migracao DUAS vezes -> os casos (10_casos.sql);
#   CONTRASTE 1 = a guarda da funcao: com o corpo diferente do medido, a migracao aborta e a coluna nao nasce;
#   CONTRASTE 2 = a verificacao 6: com um GRANT posto no meio (simulando a ACL mudada), a migracao aborta;
#   CONTRASTE 3 = a guarda da CHECK: com a CHECK da resolucao diferente da medida, a migracao aborta e a coluna nao nasce.
# Uso: run.sh [arquivo da migracao]. REUSA_BASE=1 nao reconstroi a base (as mutacoes). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261124000002_referencia_do_perfil_do_item_da_tabela.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_referencia_do_perfil}; B0=${D}_bt; BASE=${D}_base; G1=${D}_contraste1; G2=${D}_contraste2; G3=${D}_contraste3
if [ -z "$REUSA_BASE" ] || ! $P -At -c "select 1 from pg_database where datname = '$BASE'" | grep -q 1; then
  HARNESS_DB=$B0 bash $H/bloco-tributario/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: a base do bloco-tributario"; exit 2; }
  $P -c "drop database if exists $BASE" >/dev/null 2>&1; $P -c "create database $BASE template $B0" >/dev/null || { echo "BASE FALHOU: copia"; exit 2; }
  for m in 20261112000003_importacao_que_nao_encolhe 20261112000004_devolve_execute_da_importacao_ao_service_role 20261112000005_corta_o_caminho_por_fora_da_importacao 20261123000004_cor_do_item_da_tabela 20261124000001_codigo_wvetro_do_item_da_tabela; do
    OUT=$($P -d $BASE -v ON_ERROR_STOP=1 -f $M/$m.sql 2>&1) || { echo "BASE FALHOU: $m"; echo "$OUT" | grep ERROR | head -2; exit 2; }
  done
  $P -d $BASE -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || { echo "BASE FALHOU: o duble da tabela de material"; exit 2; }
create table public.orcamentista_orcamento_item_material (id bigserial primary key, resolucao text);
alter table public.orcamentista_orcamento_item_material add constraint orcamentista_orcamento_item_material_resolucao_check
  check (resolucao = any (array['ponte'::text, 'exato'::text, 'cor'::text, 'nome_tecnico'::text, 'vidro_escolhido'::text, 'vidro_traduzido'::text, 'vidro_padrao'::text]));
insert into public.orcamentista_orcamento_item_material (resolucao) values ('ponte'), ('exato'), ('cor'), ('nome_tecnico'), ('vidro_escolhido'), ('vidro_traduzido'), ('vidro_padrao'), (null);
SQL
fi
E=$($P -d $BASE -At -c "select md5(replace(prosrc, E'\r', '')) || ' ' || proacl::text from pg_proc where proname = 'importar_conteudo_da_tabela'")
[ "$E" = "fc86097aae3ef437bbfd451c902b72a3 {postgres=X/postgres}" ] || { echo "BASE FALHOU: a funcao da base nao e a de producao ($E)"; exit 2; }
for x in $D $G1 $G2 $G3; do $P -c "drop database if exists $x" >/dev/null 2>&1; $P -c "create database $x template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }; done
$P -d $D -v ON_ERROR_STOP=1 -c "insert into public.orcamentista_tabela_item (tabela_id, codigo, custo, segmento, cor, codigo_wvetro) select t.id, 'REF-ANTES-' || g, g * 10.5, 'Perfil PVC', 'BRANCO', case when g = 1 then 'VFIN05' end from (select id from public.orcamentista_tabela order by id limit 1) t, generate_series(1, 5) g" >/dev/null \
  || { echo "BASE FALHOU: os itens de antes"; exit 2; }
# a foto de ANTES da migracao: id, custo, segmento, cor e codigo_wvetro de todas as linhas; e as linhas de material
$P -d $D -v ON_ERROR_STOP=1 -c "create table public.antes_da_referencia as select md5(string_agg(id::text || coalesce(custo::text,'~') || coalesce(segmento,'~') || coalesce(cor,'~') || coalesce(codigo_wvetro,'~'), ',' order by id)) v, count(*) n, (select md5(string_agg(id::text || coalesce(resolucao,'~'), ',' order by id)) from public.orcamentista_orcamento_item_material) mat from public.orcamentista_tabela_item" >/dev/null \
  || { echo "BASE FALHOU: a foto de antes"; exit 2; }
for i in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done
T=$(mktemp -d)
semColuna() { $P -d $1 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_tabela_item' and column_name = 'referencia_perfil'"; }
contrastes() {
  # CONTRASTE 1: o corpo da funcao diferente do medido - a guarda aborta e a coluna nao nasce
  $P -d $G1 -At -c "select pg_get_functiondef('public.importar_conteudo_da_tabela(uuid, jsonb)'::regprocedure)" | sed 's/^BEGIN$/BEGIN\n  -- uma mudanca que a migracao nao conhece/' > $T/fn.sql
  $P -d $G1 -v ON_ERROR_STOP=1 -f $T/fn.sql >/dev/null 2>&1 || { echo "ERROR:  FALHOU contraste 1: nao consegui mudar o corpo"; return; }
  local SAI; SAI=$($P -d $G1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  local N; N=$(semColuna $G1)
  if echo "$SAI" | grep -q "guarda: o corpo" && [ "$N" = 0 ]; then echo "NOTICE:  ok: contraste 1 - com o corpo diferente do medido, a guarda aborta e a coluna nao nasce"; else echo "ERROR:  FALHOU contraste 1 ($N)"; fi
  # CONTRASTE 2: a ACL que muda no meio da transacao (um GRANT inserido antes da verificacao) - a verificacao 6 aborta
  grep -c '^-- 6\. a verificacao que ABORTA, na mesma transacao$' "$MIG" | grep -qx 1 || { echo "ERROR:  FALHOU contraste 2: o marcador da verificacao nao esta na migracao"; return; }
  sed 's/^-- 6\. a verificacao que ABORTA, na mesma transacao$/GRANT EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) TO PUBLIC;/' "$MIG" > $T/acl.sql
  SAI=$($P -d $G2 -v ON_ERROR_STOP=1 -f $T/acl.sql 2>&1)
  N=$(semColuna $G2)
  if echo "$SAI" | grep -q "verificacao 6" && [ "$N" = 0 ]; then echo "NOTICE:  ok: contraste 2 - a ACL mudada aborta na verificacao 6, e nada fica"; else echo "ERROR:  FALHOU contraste 2 ($N)"; fi
  # CONTRASTE 3: a CHECK da resolucao diferente da medida (um valor a mais que a migracao nao conhece) - a guarda aborta e a coluna nao nasce
  $P -d $G3 -v ON_ERROR_STOP=1 -c "alter table public.orcamentista_orcamento_item_material drop constraint orcamentista_orcamento_item_material_resolucao_check; alter table public.orcamentista_orcamento_item_material add constraint orcamentista_orcamento_item_material_resolucao_check check (resolucao = any (array['ponte'::text, 'exato'::text, 'cor'::text, 'nome_tecnico'::text, 'vidro_escolhido'::text, 'vidro_traduzido'::text, 'vidro_padrao'::text, 'outro_jeito'::text]))" >/dev/null 2>&1 || { echo "ERROR:  FALHOU contraste 3: nao consegui mudar a CHECK"; return; }
  SAI=$($P -d $G3 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  N=$(semColuna $G3)
  local C; C=$($P -d $G3 -At -c "select position('outro_jeito' in pg_get_constraintdef(oid)) > 0 from pg_constraint where conname = 'orcamentista_orcamento_item_material_resolucao_check'")
  if echo "$SAI" | grep -q "guarda: a CHECK da resolucao" && [ "$N" = 0 ] && [ "$C" = t ]; then echo "NOTICE:  ok: contraste 3 - com a CHECK da resolucao diferente da medida, a guarda aborta, a coluna nao nasce e a CHECK fica como estava"; else echo "ERROR:  FALHOU contraste 3 ($N, $C)"; fi
}
SAIDA=$( { $P -d $D -f $S/10_casos.sql 2>&1; contrastes; } )
rm -rf $T
echo "$SAIDA" | grep -oE "(ok|FALHOU)[^\"]*" | sed 's/^/  /'
OK=$(echo "$SAIDA" | grep -c "ok: "); FALHA=$(echo "$SAIDA" | grep -c "FALHOU")
echo "$OK de 14 casos ok"
[ "$OK" = 14 ] && [ "$FALHA" = 0 ]
