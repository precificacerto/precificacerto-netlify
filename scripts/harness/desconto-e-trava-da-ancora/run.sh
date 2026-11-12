#!/usr/bin/env bash
# O HARNESS da 20261112000002 (o desconto da tabela e a trava da âncora), num Postgres 16 local. Falha por código de saída.
set -uo pipefail
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
MIG="$RAIZ/supabase/migrations/20261112000002_desconto_da_tabela_e_trava_da_ancora.sql"
PSQL=(psql -h "${PGHOST:-/tmp/harness-pg}" -p "${PGPORT:-54329}" -U postgres -v ON_ERROR_STOP=1 -q -At)
BANCO=harness_desconto
falhas=0
ok()  { echo "ok    $1"; }
nao() { echo "FALHA $1"; falhas=$((falhas + 1)); }
q()   { "${PSQL[@]}" -d $BANCO -c "$1"; }
base() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" -c "CREATE DATABASE $BANCO" >/dev/null 2>&1
  "${PSQL[@]}" -d $BANCO <<'SQL' >/dev/null
CREATE TABLE public.orcamentista_tabela (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fornecedor_id uuid NOT NULL, arquivo_nome text NOT NULL, familia text, categoria_chave text, vigente boolean NOT NULL DEFAULT false);
CREATE TABLE public.orcamentista_config (tenant_id uuid PRIMARY KEY, ativo boolean NOT NULL DEFAULT false, modelo text);
INSERT INTO public.orcamentista_tabela (fornecedor_id, arquivo_nome, familia, categoria_chave) VALUES (gen_random_uuid(), 'Tabela_Wolff_Perfis_PVC.xlsx', 'PVC', 'PERFIL'), (gen_random_uuid(), 'Vidro.xlsx', NULL, 'VIDRO');
INSERT INTO public.orcamentista_config (tenant_id, ativo) VALUES (gen_random_uuid(), true), (gen_random_uuid(), false);
SQL
}
base
"${PSQL[@]}" -d $BANCO -f "$MIG" >/dev/null 2>&1 && ok "aplica" || nao "aplica"
"${PSQL[@]}" -d $BANCO -f "$MIG" >/dev/null 2>&1 && ok "reaplica (idempotente)" || nao "reaplica"
[ "$(q "SELECT count(*) FROM public.orcamentista_tabela WHERE desconto_pct IS NULL")" = 2 ] && ok "as tabelas de antes ficam com o desconto NULO (nada preenchido)" || nao "desconto preenchido"
[ "$(q "SELECT count(*) FILTER (WHERE NOT ancora_do_custo_ligada) FROM public.orcamentista_config")" = 2 ] && ok "toda conta nasce com a trava DESLIGADA" || nao "trava ligada"
q "INSERT INTO public.orcamentista_config (tenant_id) VALUES (gen_random_uuid())" >/dev/null && [ "$(q "SELECT count(*) FROM public.orcamentista_config WHERE ancora_do_custo_ligada")" = 0 ] && ok "conta nova também nasce desligada" || nao "conta nova"
saida=$(q "INSERT INTO public.orcamentista_config (tenant_id, ancora_do_custo_ligada) VALUES (gen_random_uuid(), NULL)" 2>&1) && nao "trava nula" || { echo "$saida" | grep -q 'null value in column "ancora_do_custo_ligada"' && ok "a trava não aceita nulo (NOT NULL)" || nao "trava nula ($saida)"; }
for v in 0 20 99.99; do q "UPDATE public.orcamentista_tabela SET desconto_pct = $v WHERE categoria_chave = 'PERFIL'" >/dev/null 2>&1 && ok "aceita desconto $v" || nao "aceita $v"; done
# a recusa só conta quando É a CHECK que recusa (um erro qualquer — banco fora, coluna ausente — não é recusa)
for v in 100 -1 150; do saida=$(q "UPDATE public.orcamentista_tabela SET desconto_pct = $v WHERE categoria_chave = 'PERFIL'" 2>&1) && nao "recusa $v" || { echo "$saida" | grep -q "orcamentista_tabela_desconto_pct_faixa" && ok "recusa desconto $v (pela CHECK)" || nao "recusa $v ($saida)"; }; done
q "UPDATE public.orcamentista_tabela SET desconto_pct = NULL" >/dev/null && ok "aceita desconto nulo" || nao "nulo"
# a verificação 4: uma conta ligada antes da reaplicação aborta
q "UPDATE public.orcamentista_config SET ancora_do_custo_ligada = true WHERE ativo" >/dev/null
saida=$("${PSQL[@]}" -d $BANCO -f "$MIG" 2>&1) && nao "verificação 4" || { echo "$saida" | grep -q "verificacao 4" && ok "reaplicar com uma conta ligada aborta (verificação 4)" || nao "v4 ($saida)"; }
# guardas
base
q "ALTER TABLE public.orcamentista_tabela ADD COLUMN desconto_pct text" >/dev/null
saida=$("${PSQL[@]}" -d $BANCO -f "$MIG" 2>&1) && nao "guarda tipo desconto" || { echo "$saida" | grep -q "desconto_pct ja existe com o tipo text" && ok "guarda: desconto_pct text aborta, nomeando" || nao "guarda ($saida)"; }
[ "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name='orcamentista_config' AND column_name='ancora_do_custo_ligada'")" = 0 ] && ok "guarda: nada foi alterado" || nao "guarda alterou"
base
q "ALTER TABLE public.orcamentista_config ADD COLUMN ancora_do_custo_ligada integer" >/dev/null
saida=$("${PSQL[@]}" -d $BANCO -f "$MIG" 2>&1) && nao "guarda tipo trava" || { echo "$saida" | grep -q "ancora_do_custo_ligada ja existe com o tipo int4" && ok "guarda: trava int aborta, nomeando" || nao "guarda ($saida)"; }
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" -c "CREATE DATABASE $BANCO" >/dev/null 2>&1
saida=$("${PSQL[@]}" -d $BANCO -f "$MIG" 2>&1) && nao "guarda tabela" || { echo "$saida" | grep -q "dependencia ausente" && ok "guarda: sem as tabelas aborta" || nao "guarda ($saida)"; }
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" >/dev/null 2>&1
echo "falhas: $falhas"; exit $([ $falhas -eq 0 ] && echo 0 || echo 1)
