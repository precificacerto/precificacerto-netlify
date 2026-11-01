#!/bin/bash
# A PROVA DE VOLUME da 20261031000003: o fornecedor Wolf Perfis com o conteúdo do motor no tamanho de produção (medido em 31/10/2026: 62.295 linhas por
# tabela_id na 72366020 e 62.295 por motor_id no 9a233c55; aqui 62.300 + 62.300 em regra, tipologia, perfil e insumo), removido pela função, dentro do
# statement_timeout dela (80 s). Uso: 30_volume.sh <psql> <base com a migração>. Sai 1 se passar do tempo ou se a contagem não fechar.
P=$1; D=$2; C=${D}_volume
SA=e0000000-0000-0000-0000-000000000001; W=44c5c0fe-a0d3-4aab-802d-20a6eff3f654; T1=72366020-57c9-489f-9385-397b7fa3dedb; M=9a233c55-f377-45d3-b2ae-b1a740a98e44
$P -c "drop database if exists $C" >/dev/null 2>&1; $P -c "create database $C template $D" >/dev/null || exit 2
$P -d $C -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "VOLUME NAO MONTOU"; exit 2; }
insert into orcamentista_motor_regra (tabela_id, codigo, tipologias) select '$T1', 'V' || g, array['T1'] from generate_series(1, 40000) g;
insert into orcamentista_motor_regra (motor_id, codigo, tipologias) select '$M', 'V' || g, array['T1'] from generate_series(1, 40000) g;
insert into orcamentista_motor_perfil (tabela_id, ordem, tipologia) select '$T1', g + 1, 'T' from generate_series(1, 12000) g;
insert into orcamentista_motor_perfil (motor_id, ordem, tipologia) select '$M', g + 1, 'T' from generate_series(1, 12000) g;
insert into orcamentista_motor_insumo (tabela_id, ordem, tipologia) select '$T1', g + 1, 'T' from generate_series(1, 10000) g;
insert into orcamentista_motor_insumo (motor_id, ordem, tipologia) select '$M', g + 1, 'T' from generate_series(1, 10000) g;
insert into orcamentista_motor_tipologia (tabela_id, tipologia, n_regras, n_condicionais, variaveis) select '$T1', 'TV' || g, 1, 0, '{}' from generate_series(1, 300) g;
insert into orcamentista_motor_tipologia (motor_id, tipologia, n_regras, n_condicionais, variaveis) select '$M', 'TV' || g, 1, 0, '{}' from generate_series(1, 300) g;
analyze;
SQL
TOTAL=$($P -d $C -At -c "select (public.superadmin_arrasto_do_catalogo('fornecedor', '$W') ->> 'sai')::bigint + (public.superadmin_arrasto_do_catalogo('fornecedor', '$W') ->> 'perde_o_vinculo')::bigint")
INI=$(date +%s.%N)
OUT=$($P -d $C -At -c "select public.superadmin_remover_do_catalogo('$SA', 'fornecedor', '$W', public.superadmin_arrasto_do_catalogo('fornecedor', '$W') ->> 'assinatura') ->> 'removido'" 2>&1)
FIM=$(date +%s.%N); S=$(echo "$FIM - $INI" | bc)
LOG=$($P -d $C -At -c "select count(*) from superadmin_alteracao_log where antes -> 'remocao_do_catalogo' ->> 'tipo' = 'fornecedor'")
$P -c "drop database if exists $C" >/dev/null 2>&1
if [ "$OUT" = "true" ] && [ "$LOG" = "$TOTAL" ] && [ "$(echo "$S < 80" | bc)" = "1" ]; then
  echo "ok: volume — $TOTAL linhas (sai + perde o vinculo) removidas e logadas uma a uma em ${S}s (limite 80 s)"
else echo "FALHOU volume: saida=$OUT log=$LOG de $TOTAL em ${S}s"; exit 1; fi
