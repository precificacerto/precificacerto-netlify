#!/bin/bash
# HARNESS do tempo em tabela própria (migração 20261024000003). NÃO TOCA PRODUÇÃO.
# Mesmo Postgres local dos outros harness desta pasta (subir uma vez por container: ver o README
# de `../tres-niveis/`). `PGHOST` e `PGPORT` trocam o endereço (padrão: `/tmp/harness-pg`, `54329`).
#
# Monta o banco do Atendimentos I.A. até a 20261024000001 (o schema mínimo de `../orcamentista/`,
# o Storage reduzido de `../atendimentos-ia-2b1/`, e as migrações 20261018000001, 20261019000001,
# 20261020000001, 20261020000002 e 20261024000001), reproduz o estado de produção
# (`05_como_em_producao.sql`), aplica DUAS VEZES a migração dada, confere que a segunda deixou o
# schema idêntico, roda os casos (`10_casos.sql`) e, por fim, o caso da reaplicação com a tabela
# nova já divergente — que tem de ABORTAR sem mudar nada.
#
# Uso:   run.sh [arquivo da migração]      (sem argumento: a do repositório)
# Saída: uma linha `ok:` ou `FALHOU:` por caso, e "N de M casos ok". Sai com 1 se faltar ok.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261024000003_tempo_da_tipologia_em_tabela_propria.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
DUMP="pg_dump -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -s"
D=harness_tempo_tabela_propria
TMP=$(mktemp -d)
$P -c "drop database if exists $D" >/dev/null 2>&1; $P -c "create database $D" >/dev/null || { echo "BANCO NAO CRIADO"; exit 2; }
for f in $S/../orcamentista/00_schema.sql \
         $R/supabase/migrations/20261018000001_orcamentista_bloco_1.sql \
         $S/../atendimentos-ia-2b1/00_storage.sql \
         $R/supabase/migrations/20261019000001_atendimentos_ia_bloco_2b1.sql \
         $R/supabase/migrations/20261020000001_atendimentos_ia_importacao.sql \
         $R/supabase/migrations/20261020000002_importar_conteudo_da_tabela.sql \
         $R/supabase/migrations/20261024000001_tempo_de_fabricacao_por_tipologia.sql \
         $S/05_como_em_producao.sql; do
  $P -d $D -v ON_ERROR_STOP=1 -f $f >/dev/null 2>&1 || { echo "BASE FALHOU: $f"; $P -d $D -v ON_ERROR_STOP=1 -f $f 2>&1 | grep ERROR | head -3; exit 2; }
done
for vez in 1 2; do
  OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) || { echo "MIGRACAO ABORTOU na aplicação $vez: $(echo "$OUT" | grep -E 'ERROR' | head -2)"; exit 3; }
  $DUMP $D | grep -vE '^\\(un)?restrict ' > $TMP/dump-$vez.sql
done
if diff -q $TMP/dump-1.sql $TMP/dump-2.sql >/dev/null; then
  echo "ok: a migração aplicada duas vezes deixa o schema IDÊNTICO"
else
  echo "FALHOU: a segunda aplicação mudou o schema"; exit 1
fi
# O CASO DA REAPLICAÇÃO, fora do SQL porque reaplica o arquivo, e ANTES dos outros: com a tabela
# nova já divergente da antiga, a reaplicação tem de ABORTAR na verificação 2, e a tabela nova tem
# de continuar como estava. Ele roda com a tabela antiga AINDA CHEIA — depois do caso 4 a
# importação já apagou os tempos antigos, e não sobraria divergência para a verificação ver
# (foi o que a primeira versão deste harness fez, e o caso ficou vermelho pelo motivo errado).
# Depois dele o DP-02 volta a 150 IMPORTADO, que é o estado de que os casos partem.
$P -d $D -c "UPDATE public.orcamentista_motor_tipologia_tempo SET tempo_fabricacao_min = 777, tempo_origem = 'IMPORTADO' WHERE tipologia = 'DP-02'" >/dev/null
OUT=$($P -d $D -v ON_ERROR_STOP=1 -f "$MIG" 2>&1)
DEPOIS=$($P -d $D -At -c "SELECT tempo_fabricacao_min || '/' || tempo_origem FROM public.orcamentista_motor_tipologia_tempo WHERE tipologia = 'DP-02'")
if echo "$OUT" | grep -q 'verificacao 2' && [ "$DEPOIS" = "777/IMPORTADO" ]; then
  REAP="ok: reaplicar com a tabela nova divergente ABORTA na verificação 2, e o tempo novo fica (777/IMPORTADO)"
else
  REAP="FALHOU: a reaplicação com divergência não abortou na verificação 2, ou mexeu no tempo novo (ficou $DEPOIS)"
fi
echo "$REAP"
$P -d $D -c "UPDATE public.orcamentista_motor_tipologia_tempo SET tempo_fabricacao_min = 150, tempo_origem = 'IMPORTADO' WHERE tipologia = 'DP-02'" >/dev/null
# O FILTRO LÊ A LINHA INTEIRA: um erro que não começa com FALHOU aparece como ERRO NAO PREVISTO
# e não conta como caso verde (`instrumento-que-nao-enxerga.md`).
FILTRO='s/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p'
SAIDA=$($P -d $D -f $S/10_casos.sql 2>&1 | sed -nE "$FILTRO")
# O CASO 8 — a reimportação completa com os 164 tempos — roda com as DUAS versões da função de
# importação: a da 20261020000002 (a da base acima) e a da 20261025000004, que a substitui e apaga
# também as nove abas. Cada rodada conta como um caso.
CASO8=$($P -d $D -f $S/20_reimportacao_completa.sql 2>&1 | sed -nE "$FILTRO" | sed 's/^/[função 20261020000002] /')
$P -d $D -v ON_ERROR_STOP=1 -f $R/supabase/migrations/20261025000004_abas_do_motor_por_tipologia.sql >/dev/null 2>&1 \
  || { echo "BASE FALHOU: 20261025000004"; exit 2; }
CASO8="$CASO8
$($P -d $D -f $S/20_reimportacao_completa.sql 2>&1 | sed -nE "$FILTRO" | sed 's/^/[função 20261025000004] /')"
SAIDA="$SAIDA
$CASO8"
echo "$SAIDA"
ESPERADO=$(( $(grep -c "^-- CASO " $S/10_casos.sql) + 2 + 1 ))
OKS=$( (echo "$SAIDA"; echo "$REAP") | grep -cE '^(\[função [0-9]+\] )?ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
