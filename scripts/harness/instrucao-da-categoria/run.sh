#!/bin/bash
# HARNESS da migração 20261103000002 (a instrução da categoria; os campos estruturados saem). NÃO TOCA PRODUÇÃO.
# Base: o banco final do harness da garantia (scripts/harness/garantia-da-categoria-na-conta: a cadeia real até a 20261103000001 aplicada, com o
# privilégio padrão de produção) + as SEIS funções de gravação da base de conhecimento com os corpos de PRODUÇÃO (corpos-de-producao/, md5
# conferido abaixo contra o medido em 03/11/2026, só service_role) + 09_estado.sql (as três tabelas na estrutura de produção, a config das três
# categorias e as 4 + 4 + 3 linhas da De Paula, com os ids de produção).
# Depois: D = base + a migração DUAS vezes -> os casos (10_casos.sql), as corridas (20_corrida.sh) e as guardas (cada uma numa cópia da base com o
# estado que a dispara: aborta com a frase e nada muda).
# Uso: run.sh [arquivo da migração]. REUSA_BASE=1 não reconstrói a base. VEZES=1 aplica uma vez (as mutações). Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); H=$R/scripts/harness; M=$R/supabase/migrations
MIG=${1:-$M/20261103000002_instrucao_da_categoria.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_instrucao}; GAR=${HARNESS_GARANTIA:-harness_garantia}; BASE=${D}_base; GC=${D}_guarda
MD5_PROD="superadmin_gravar_arvore=d1165c55f1e143e7a805249cc1494afe,superadmin_gravar_mp_categoria=2b40afd751691ee516a057038f0c7605,superadmin_gravar_mp_ferragens=707e4a6a222e1796d584b6a4095b07fc,superadmin_gravar_mp_fornecedores=80d9dcd2ff2e646f41a4ff092bd5e232,superadmin_gravar_mp_instalacao=8073dbf8895ecee2ed77fe65dfcbd952,superadmin_gravar_mp_vidros=933c1c6b658d1b6936179f86b4c27209"
SEIS="'superadmin_gravar_arvore', 'superadmin_gravar_mp_categoria', 'superadmin_gravar_mp_ferragens', 'superadmin_gravar_mp_fornecedores', 'superadmin_gravar_mp_instalacao', 'superadmin_gravar_mp_vidros'"
if [ -z "$REUSA_BASE" ] || ! $P -At -c "select 1 from pg_database where datname = '$BASE'" | grep -q 1; then
  HARNESS_DB=$GAR REUSA_BASE=$REUSA_BASE bash $H/garantia-da-categoria-na-conta/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: o harness da garantia"; exit 2; }
  $P -c "drop database if exists $BASE" >/dev/null 2>&1; $P -c "create database $BASE template $GAR" >/dev/null || { echo "BASE FALHOU: copia"; exit 2; }
  for f in $S/corpos-de-producao/*.sql $S/09_estado.sql; do
    OUT=$($P -d $BASE -v ON_ERROR_STOP=1 -f "$f" 2>&1) || { echo "BASE FALHOU: $f"; echo "$OUT" | grep -E "ERROR|DETAIL" | head -3; exit 2; }
  done
  # os privilégios de produção das seis: só service_role (o privilégio padrão desta base daria EXECUTE a authenticated)
  $P -d $BASE -v ON_ERROR_STOP=1 -c "DO \$x\$ DECLARE f regprocedure; BEGIN FOR f IN SELECT oid FROM pg_proc WHERE proname IN ($SEIS) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END LOOP; END \$x\$;" >/dev/null \
    || { echo "BASE FALHOU: os privilegios"; exit 2; }
fi
# os seis corpos são os de produção (medidos em 03/11/2026)
H0=$($P -d $BASE -At -c "select string_agg(proname || '=' || md5(replace(prosrc, E'\r', '')), ',' order by proname) from pg_proc where proname in ($SEIS)")
[ "$H0" = "$MD5_PROD" ] || { echo "BASE FALHOU: os corpos na base nao sao os de producao ($H0)"; exit 2; }
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D template $BASE" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in $(seq 1 ${VEZES:-2}); do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }
done

# as GUARDAS: cada uma numa cópia da base com o estado que a dispara; aborta com a frase, e nada muda (a árvore segue a de produção, as 4 linhas de
# vidro da De Paula continuam, a coluna text não existe, as 13 definições continuam, a função nova não foi criada — a árvore não entra, porque a
# guarda 1 a substitui de propósito)
MP=79d764fe-4acd-43e2-bed9-38e20667ca3d; DP=20e08592-f957-4e72-b7eb-251387e34eb9; B=b0000000-0000-0000-0000-00000000000b; MB=c1000000-0000-0000-0000-00000000000b
nada_mudou() { [ "$($P -d $1 -At -c "select count(*) from pg_proc where proname = 'superadmin_gravar_instrucao_da_categoria' and prosecdef")" = "0" ] \
  && [ "$($P -d $1 -At -c "select count(*) from orcamentista_mp_vidro where id in ('785b8a72-7c4c-4bd9-9c5d-d82235a5cd92', '71ca60ba-e753-43ef-a808-172a711d76c2', 'b5bcdb87-2a50-4efc-ba2a-e0df27fa782e', '0e297cb8-7406-46fe-ad58-67a8a97616dd')")" = "4" ] \
  && [ "$($P -d $1 -At -c "select count(*) from information_schema.columns where table_name = 'orcamentista_mp_categoria' and column_name = 'instrucao' and data_type = 'text'")" = "0" ] \
  && [ "$($P -d $1 -At -c "select count(*) from orcamentista_categoria_campo")" -ge 13 ]; }
guarda() { # $1 número, $2 o SQL que monta o estado, $3 a frase esperada, $4 a descrição
  $P -c "drop database if exists $GC" >/dev/null 2>&1; $P -c "create database $GC template $BASE" >/dev/null
  [ -n "$2" ] && { $P -d $GC -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1 || { echo "ERROR:  FALHOU guarda $1: o estado nao montou"; return; }; }
  local SAI; SAI=$($P -d $GC -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -qF "$3" && nada_mudou $GC; then echo "NOTICE:  ok: guarda $1 — $4"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
guardas() {
guarda 1 "create or replace function public.superadmin_gravar_arvore(p_tenant uuid, p_por uuid, p_arvore jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as \$x\$ begin return '{}'::jsonb; end \$x\$;" \
  "superadmin_gravar_arvore(uuid, uuid, jsonb): md5 " "a arvore com corpo diferente do lido em producao: aborta nomeando a funcao e o md5"
guarda 2 "insert into public.orcamentista_mp_vidro (id, tenant_id, mp_categoria_id, categoria_chave, descricao, ordem) select '0f000000-0000-0000-0000-000000000001', tenant_id, id, 'VIDRO', 'Vidro a mais', 5 from public.orcamentista_mp_categoria where materia_prima_id = '$MP' and categoria_chave = 'VIDRO';" \
  "orcamentista_mp_vidro 0f000000-0000-0000-0000-000000000001 (empresa $DP)" "uma linha de vidro alem das 4 medidas: aborta nomeando-a (o cabecalho nunca diz menos do que a migracao apaga)"
guarda 3 "insert into public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave, config) values ('$B', '$MB', 'REFORCO', '{\"usa\": true}');" \
  "config de REFORCO da materia-prima $MB (empresa $B)" "uma config com chave que sai em OUTRA empresa: aborta nomeando a materia-prima e a empresa"
guarda 4 "insert into public.orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem) values ('PERFIL', 'acabamento', 'texto', 'Acabamento', 9);" \
  "definicao do catalogo de campos fora do medido: PERFIL.acabamento" "uma definicao a mais no catalogo de campos: aborta nomeando-a"
guarda 5 "create function public.superadmin_gravar_instrucao_da_categoria(p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_instrucao jsonb) returns jsonb language sql as \$x\$ select '{}'::jsonb \$x\$;" \
  "superadmin_gravar_instrucao_da_categoria ja existe com outro corpo" "a funcao nova ja existe com outro corpo: aborta"
guarda 6 "alter table public.orcamentista_mp_categoria add column instrucao integer;" \
  "orcamentista_mp_categoria.instrucao ja existe com outro tipo" "a coluna ja existe com outro tipo: aborta (ADD COLUMN IF NOT EXISTS calaria)"
local VAZIO=${D}_vazio
$P -c "drop database if exists $VAZIO" >/dev/null 2>&1; $P -c "create database $VAZIO" >/dev/null
SAI=$($P -d $VAZIO -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "dependencia ausente no banco $VAZIO" && echo "$SAI" | grep -q "superadmin_gravar_arvore(uuid, uuid, jsonb): nao existe" \
   && [ "$($P -d $VAZIO -At -c "select count(*) from pg_proc where proname like 'superadmin_%'")" = "0" ]; then
  echo "NOTICE:  ok: guarda 7 — um banco sem as funcoes (o projeto errado): aborta nomeando o banco e a funcao que nao existe"
else echo "ERROR:  FALHOU guarda 7: $(echo "$SAI" | grep ERROR | head -1)"; fi
$P -c "drop database if exists $VAZIO" >/dev/null 2>&1
}
SAIDA=$( (cd $S && $P -d $D -f 10_casos.sql 2>&1; bash $S/20_corrida.sh "$P" $D 2>&1; guardas) | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + $(grep -c "^# CORRIDA " $S/20_corrida.sh) + $(grep -c "^guarda [0-9]" $S/run.sh) + 1 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
$P -c "drop database if exists $GC" >/dev/null 2>&1
[ "$OKS" = "$ESPERADO" ] || exit 1
