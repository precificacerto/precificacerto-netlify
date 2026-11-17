#!/bin/bash
# HARNESS da migração 20261117000002 (as regras do WVetro no motor). NÃO TOCA PRODUÇÃO.
# Base: o banco que o run.sh de `tempo-no-arquivo-do-motor` deixa (a cadeia real até a 20261106000001 aplicada, os corpos de criar e trocar de
# produção, conferidos pelo md5, e os ajudantes dos casos de lá). Montada por ele se não existir.
#   D  = base + esta migração DUAS vezes -> os casos (10_casos.sql);
#   guardas, cada uma numa cópia da base, com o estado que a dispara: aborta com a frase, e NADA muda (o corpo de antes e nenhuma coluna);
#   contraste: o corpo de produção em CRLF (como o SQL Editor o grava) -> a guarda ACEITA.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261117000002_regras_do_wvetro_no_motor.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
B=harness_tempo_no_arquivo; D=harness_regras_do_wvetro; G=${D}_guarda
if [ "$($P -At -c "select count(*) from pg_database where datname = '$B'")" != "1" ]; then
  bash $R/scripts/harness/tempo-no-arquivo-do-motor/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: o run.sh de tempo-no-arquivo-do-motor"; exit 2; }
fi
for x in $D $G; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
$P -c "create database $D template $B" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in 1 2; do OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }; done

ANTES=88a3d866178a5309a098271f97dc090c
nada_mudou() {
  [ "$($P -d $G -At -c "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'superadmin_criar_motor'")" = "$1" ] \
  && [ "$($P -d $G -At -c "select count(*) from information_schema.columns where table_schema = 'public' and column_name in ('esp_vidro', 'condicao_opcoes') and table_name in ('orcamentista_motor_insumo', 'orcamentista_motor_vidro', 'orcamentista_motor_variavel')")" = "$2" ]
}
guarda() { # $1 número, $2 o SQL do estado, $3 a frase esperada (grep), $4 a descrição, $5 colunas que ficam
  $P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G template $B" >/dev/null
  [ -n "$2" ] && $P -d $G -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1
  local MD SAI; MD=$($P -d $G -At -c "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'superadmin_criar_motor'")
  SAI=$($P -d $G -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q -- "$3" && nada_mudou "$MD" "${5:-0}"; then echo "NOTICE:  ok: guarda $1 — $4"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
guardas() {
guarda 1 "create or replace function public.superadmin_criar_motor(p_por uuid, p_fornecedor uuid, p_categoria text, p_familias text[], p_nome text, p_arquivo_path text, p_arquivo_nome text, p_payload jsonb) returns jsonb language plpgsql as \$x\$ begin return null; end \$x\$" \
  "tem o corpo .* (esperado $ANTES ou" "o corpo de criar diferente do de producao: aborta nomeando o md5 achado, e nada muda"
guarda 2 "alter table public.orcamentista_motor_insumo add column esp_vidro integer" \
  "orcamentista_motor_insumo.esp_vidro existe com outra forma;" "a coluna ja existe com outro tipo: aborta nomeando-a" 1
guarda 3 "alter table public.orcamentista_motor_variavel add column condicao_opcoes text default ''" \
  "orcamentista_motor_variavel.condicao_opcoes existe com outra forma;" "a coluna ja existe com default: aborta nomeando-a" 1
$P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G" >/dev/null
SAI=$($P -d $G -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "superadmin_criar_motor(uuid, uuid, text, text\[\], text, text, text, jsonb) nao existe;.*public.orcamentista_motor_vidro nao existe;"; then
  echo "NOTICE:  ok: guarda 4 — num banco vazio aborta nomeando o banco, a funcao e as tabelas"; else echo "ERROR:  FALHOU guarda 4: $(echo "$SAI" | grep ERROR | head -1)"; fi
}
contraste() {
  $P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G template $B" >/dev/null
  local TMP; TMP=$(mktemp --suffix=.sql)
  python3 - "$M/20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.sql" "$TMP" <<'PY'
import sys
t = open(sys.argv[1]).read()
i = t.index('CREATE OR REPLACE FUNCTION public.superadmin_criar_motor('); a = t.index('AS $fn$', i) + 7; b = t.index('$fn$;', a)
open(sys.argv[2], 'w', newline='').write(t[i:a] + t[a:b].replace('\n', '\r\n') + '$fn$;\n')
PY
  $P -d $G -v ON_ERROR_STOP=1 -f "$TMP" >/dev/null 2>&1
  local CR; CR=$($P -d $G -At -c "select count(*) from pg_proc where proname = 'superadmin_criar_motor' and position(chr(13) in prosrc) > 0")
  if [ "$CR" = "1" ] && $P -d $G -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; then echo "NOTICE:  ok: contraste — o corpo de producao em CRLF: a guarda aceita, e a migracao aplica"
  else echo "ERROR:  FALHOU contraste: corpo com CR=$CR"; fi
  rm -f "$TMP"
}
SAIDA=$( { (cd $S && $P -d $D -f 10_casos.sql 2>&1); guardas; contraste; } | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + 4 + 1 ))
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
$P -c "drop database if exists $G" >/dev/null 2>&1
[ "$OKS" = "$ESPERADO" ] || exit 1
