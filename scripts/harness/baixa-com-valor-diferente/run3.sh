#!/bin/bash
# HARNESS da …000003 — a baixa simples, o lote e o quarto DROP. NÃO TOCA PRODUÇÃO.
#
# Constrói sobre o que está EM PRODUÇÃO, não sobre o repositório:
#   00_schema.sql                 o schema extraído do catálogo vivo (ver o cabeçalho dele)
#   01_orders.sql                 `orders` reduzida + as CINCO políticas vivas, verbatim
#   02_000001_como_aplicada.sql   a …000001 COMO O SERVIDOR A RECEBEU: o texto do
#                                 `postgres_logs`, md5 da mensagem conferido contra o do servidor
#                                 de logs. O `prosrc` que ele produz é a0f5ddc1…, o de produção.
#                                 Os bytes são os recebidos, CRLF inclusive — não editar.
#
# >>> O QUE ESTE HARNESS **NÃO** EXERCE: A ORDEM DAS TRAVAS. <<<
# `dar_baixa_em_lote` trava as parcelas em ordem de `id` (`ORDER BY id FOR UPDATE`) para que dois
# lotes com interseção — ou um lote e uma baixa com valor diferente na mesma série — não se
# esperem em ciclo. NENHUM caso daqui prova isso: cada caso roda numa sessão só, e deadlock exige
# DUAS sessões concorrentes, cada uma segurando uma trava que a outra pede. MEDIDO em 17/10/2026:
# a mutação `ORDER BY id DESC` no `FOR UPDATE` do lote passa VERDE, 20 de 20. A ordem está
# garantida por LEITURA do corpo, não por medição — e é isso que este cabeçalho registra.
# Fechar exige um segundo `psql` em paralelo com `pg_sleep` entre as travas; não foi feito.
#
# Uso:   run3.sh <arquivo da …000003>     Saída: `ok:` / `FALHOU:` por caso, e a contagem.
# Para a …000004 (não aplicada): passe a …000003 seguida dela, concatenadas, num arquivo só.
# Sai com 1 se algum caso não imprimir `ok` — um caso que nem roda NÃO conta como verde.
S=$(cd "$(dirname "$0")" && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q -X"
$P -c 'drop database if exists harness_000003' >/dev/null 2>&1; $P -c 'create database harness_000003' >/dev/null
for f in 00_schema.sql 01_orders.sql 02_000001_como_aplicada.sql; do
  $P -d harness_000003 -v ON_ERROR_STOP=1 -f $S/$f >/dev/null 2>&1 || { echo "BASE FALHOU em $f"; exit 2; }
done
$P -d harness_000003 -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU"; exit 2; }
# O FILTRO LÊ A LINHA INTEIRA, NUNCA UM PEDAÇO DELA. A versão anterior extraía `(ok|FALHOU)` de
# qualquer lugar do texto, e o "ok" de "Token" — na mensagem de erro do cast para json — era
# contado como caso verde. Um caso que MORRE sem `ok` nem `FALHOU` agora aparece como
# `ERRO NAO PREVISTO`, e não conta (`instrumento-que-nao-enxerga.md`).
SAIDA=$($P -d harness_000003 -f $S/30_casos_000003.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p')
echo "$SAIDA"
ESPERADO=$(grep -c "^-- CASO " $S/30_casos_000003.sql)
OKS=$(echo "$SAIDA" | grep -c '^ok: ')
echo "$OKS de $ESPERADO casos ok"
[ "$OKS" = "$ESPERADO" ] || exit 1
