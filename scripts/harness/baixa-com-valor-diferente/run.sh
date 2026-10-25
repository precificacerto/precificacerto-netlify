#!/bin/bash
# HARNESS LOCAL da RPC `dar_baixa_com_valor_diferente` (migração 20261016000001).
#
# NÃO TOCA PRODUÇÃO. O schema mínimo (00_schema.sql) foi EXTRAÍDO do catálogo vivo de
# produção em 16/10/2026 — não do histórico de migrações, que não reproduz o schema real
# (ver `migracao.md` (Parte II)). Cada bloco do schema diz se é EXTRAÍDO ou RECONSTRUÍDO.
#
# PENDÊNCIA NOMEADA — DIVERGÊNCIA DE VERSÃO: produção é PostgreSQL 17.6; este harness roda
# 16.15. A RPC não usa nada específico de versão, mas isso é RACIOCÍNIO, NÃO MEDIÇÃO. Os 14
# casos verdes provam o comportamento no 16.15; no 17.6 ele é premissa. A diferença entre as
# duas versões é o tamanho dessa incerteza, como a fronteira EXTRAÍDO/RECONSTRUÍDO é a do
# schema. Fecha-se rodando este mesmo harness num 17.x — não por leitura de changelog.
#
# Subir o Postgres local (uma vez por container):
#   B=/usr/lib/postgresql/16/bin; D=/tmp/harness-pg; mkdir -p $D && chown postgres:postgres $D
#   su postgres -c "$B/initdb -D $D/data -U postgres --auth=trust -E UTF8 --locale=C.UTF-8"
#   su postgres -c "$B/pg_ctl -D $D/data -o '-p 54329 -k $D' -l $D/log.txt start"
#
# Uso:   run.sh <arquivo da migração>
# Saída: uma linha `ok:` ou `FALHOU:` por caso. Para mutar, passe uma cópia alterada.
S=$(cd "$(dirname "$0")" && pwd); P="psql -h /tmp/harness-pg -p 54329 -U postgres -q"
$P -c 'drop database if exists harness_run' >/dev/null 2>&1; $P -c 'create database harness_run' >/dev/null
$P -d harness_run -v ON_ERROR_STOP=1 -f $S/00_schema.sql >/dev/null 2>&1 || { echo "SCHEMA FALHOU"; exit 2; }
$P -d harness_run -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>&1 || { echo "MIGRACAO FALHOU"; exit 2; }
# O FILTRO LÊ A LINHA INTEIRA, NUNCA UM PEDAÇO DELA. A versão anterior extraía `(ok|FALHOU)` de
# qualquer lugar do texto, e o "ok" de "Token" — na mensagem de erro do cast para json — era
# contado como caso verde. Um caso que MORRE sem `ok` nem `FALHOU` agora aparece como
# `ERRO NAO PREVISTO`, e não conta (`instrumento-que-nao-enxerga.md`).
$P -d harness_run -f $S/10_casos.sql 2>&1 | sed -nE 's/^.*NOTICE:  (ok: .*)$/\1/p; s/^.*ERROR:  (FALHOU.*)$/\1/p; s/^.*ERROR:  (.*)$/ERRO NAO PREVISTO: \1/p'
