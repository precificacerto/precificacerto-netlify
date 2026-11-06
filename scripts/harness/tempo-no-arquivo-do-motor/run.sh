#!/bin/bash
# HARNESS da migração 20261106000001 (o tempo de fabricação no arquivo do motor). NÃO TOCA PRODUÇÃO.
# Base: a de `nome-do-motor-e-arquivar` (a cadeia REAL até a 20261029000005, com o estado de produção daquela data e os mesmos ids), montada pelo
# run.sh dela num banco próprio. Os corpos de `superadmin_criar_motor` e `superadmin_trocar_arquivo_do_motor` ali são os de produção em 06/11/2026
# (md5 sem o \r conferido: a guarda desta migração aborta se não forem). A tabela de tempos tem a estrutura de produção (a CHECK de antes, o índice
# único parcial do motor, a CHECK do positivo) e 167 linhas (2 por motor_id, no motor da Wolff, e 165 por tabela_id).
#   D  = base + a foto dos tempos + esta migração DUAS vezes -> os casos (10_casos.sql);
#   guardas, cada uma numa cópia da base, com o estado que a dispara: aborta com a frase, e NADA muda (a CHECK de antes e o corpo de antes ficam);
#   contraste: a base com os corpos em CRLF (como o SQL Editor os grava) -> a guarda ACEITA.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd); M=$R/supabase/migrations
MIG=${1:-$M/20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_tempo_no_arquivo}; B=${D}_base; G=${D}_guarda
if [ -z "$REUSAR_BASE" ] || [ "$($P -At -c "select count(*) from pg_database where datname = '$B'")" != "1" ]; then
  HARNESS_DB=$B bash $R/scripts/harness/nome-do-motor-e-arquivar/run.sh >/dev/null 2>&1 || { echo "BASE FALHOU: o run.sh de nome-do-motor-e-arquivar"; exit 2; }
  $P -d $B -v ON_ERROR_STOP=1 -c "create table public.h_tempos_antes_da_000001 as select * from public.orcamentista_motor_tipologia_tempo" >/dev/null || { echo "BASE FALHOU: a foto"; exit 2; }
fi
for x in $D $G; do $P -c "drop database if exists $x" >/dev/null 2>&1; done
$P -c "create database $D template $B" >/dev/null || { echo "COPIA NAO CRIADA"; exit 2; }
for i in 1 2; do OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "BASE FALHOU: a migracao (vez $i)"; echo "$OUT" | grep -E "ERROR|DETAIL|CONTEXT" | head -4; exit 2; }; done

# nada mudou na cópia da guarda: a CHECK da origem e o corpo de criar são os de antes
nada_mudou() {
  [ "$($P -d $G -At -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_motor_tipologia_tempo_origem'")" = "$1" ] \
  && [ "$($P -d $G -At -c "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'superadmin_criar_motor'")" = "$2" ]
}
ANTES_CHECK="CHECK ((tempo_origem = ANY (ARRAY['ESTIMADO'::text, 'IMPORTADO'::text])))"
guarda() { # $1 número, $2 o SQL que monta o estado, $3 a frase esperada (grep), $4 a descrição, [$5 o banco de origem]
  $P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G template ${5:-$B}" >/dev/null
  [ -n "$2" ] && $P -d $G -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1
  local CK MD SAI; CK=$($P -d $G -At -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_motor_tipologia_tempo_origem'")
  MD=$($P -d $G -At -c "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'superadmin_criar_motor'")
  SAI=$($P -d $G -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
  if echo "$SAI" | grep -q -- "$3" && nada_mudou "$CK" "$MD"; then echo "NOTICE:  ok: guarda $1 — $4"; else echo "ERROR:  FALHOU guarda $1: saida=$(echo "$SAI" | grep ERROR | head -1)"; fi
}
guardas() {
guarda 1 "create or replace function public.superadmin_criar_motor(p_por uuid, p_fornecedor uuid, p_categoria text, p_familias text[], p_nome text, p_arquivo_path text, p_arquivo_nome text, p_payload jsonb) returns jsonb language plpgsql as \$x\$ begin return null; end \$x\$" \
  "ERROR:  guarda: este banco nao esta como o medido (banco $G, usuario postgres): public.superadmin_criar_motor(uuid, uuid, text, text\[\], text, text, text, jsonb) tem o corpo" \
  "o corpo de criar diferente do de producao: aborta nomeando o banco, o usuario e o md5 achado, e nada muda"
guarda 2 "alter table public.orcamentista_motor_tipologia_tempo drop constraint orcamentista_motor_tipologia_tempo_origem; alter table public.orcamentista_motor_tipologia_tempo add constraint orcamentista_motor_tipologia_tempo_origem check (tempo_origem in ('ESTIMADO', 'IMPORTADO', 'MEDIDO'))" \
  "a CHECK da origem e CHECK ((tempo_origem = ANY (ARRAY\['ESTIMADO'::text, 'IMPORTADO'::text, 'MEDIDO'::text\])));" \
  "a CHECK da origem com outra definicao: aborta nomeando-a, e ela fica"
guarda 3 "drop index public.orcamentista_motor_tipologia_tempo_tipologia_motor_key" \
  "o indice unico do motor e (ausente);" "sem o indice unico (motor, tipologia): aborta"
guarda 4 "drop function public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)" \
  "public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) nao existe;" "sem a funcao de trocar: aborta nomeando-a"
# guarda 5 — um banco VAZIO (o projeto errado, a lição da 20261102000002): aborta nomeando as duas funções e a tabela
$P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G" >/dev/null
SAI=$($P -d $G -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
if echo "$SAI" | grep -q "superadmin_criar_motor(uuid, uuid, text, text\[\], text, text, text, jsonb) nao existe; public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) nao existe; public.orcamentista_motor_tipologia_tempo nao existe;"; then
  echo "NOTICE:  ok: guarda 5 — num banco vazio aborta nomeando o banco, as duas funcoes e a tabela"; else echo "ERROR:  FALHOU guarda 5: $(echo "$SAI" | grep ERROR | head -1)"; fi
}
# CONTRASTE — os dois corpos de produção em CRLF (o Editor grava assim): a guarda ACEITA, e a migração aplica
contraste() {
  $P -c "drop database if exists $G" >/dev/null 2>&1; $P -c "create database $G template $B" >/dev/null
  local SRC TMP; TMP=$(mktemp --suffix=.sql)
  python3 - "$M/20261029000005_nome_do_motor_e_arquivar_em_uso.sql" "$TMP" <<'EOF'
import sys
t = open(sys.argv[1]).read(); out = []
for fn in ('superadmin_criar_motor(', 'superadmin_trocar_arquivo_do_motor('):
    i = t.index('CREATE OR REPLACE FUNCTION public.' + fn); a = t.index('AS $fn$', i) + 7; b = t.index('$fn$;', a)
    out.append(t[i:a] + t[a:b].replace('\n', '\r\n') + '$fn$;\n')
open(sys.argv[2], 'w', newline='').write('\n'.join(out))
EOF
  $P -d $G -v ON_ERROR_STOP=1 -f "$TMP" >/dev/null 2>&1
  local CR; CR=$($P -d $G -At -c "select count(*) from pg_proc where proname in ('superadmin_criar_motor', 'superadmin_trocar_arquivo_do_motor') and position(chr(13) in prosrc) > 0")
  if [ "$CR" = "2" ] && $P -d $G -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; then echo "NOTICE:  ok: contraste — os corpos de producao em CRLF: a guarda aceita, e a migracao aplica"
  else echo "ERROR:  FALHOU contraste: corpos com CR=$CR"; fi
  rm -f "$TMP"
}
SAIDA=$( { (cd $S && $P -d $D -f 10_casos.sql 2>&1); guardas; contraste; } | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + 5 + 1 ))  # + as 5 guardas e o contraste
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
$P -c "drop database if exists $G" >/dev/null 2>&1
[ "$OKS" = "$ESPERADO" ] || exit 1
