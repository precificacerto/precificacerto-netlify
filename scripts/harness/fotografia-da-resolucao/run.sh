#!/usr/bin/env bash
# O HARNESS da 20261112000001 (a fotografia da resolução de referência), num Postgres 16 local: a base com a tabela do material como em
# produção (as colunas lidas do information_schema em 12/11/2026), a migração DUAS vezes, os casos e as guardas. Falha por código de saída.
set -uo pipefail
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
MIG="$RAIZ/supabase/migrations/20261112000001_fotografia_da_resolucao.sql"
PSQL=(psql -h "${PGHOST:-/tmp/harness-pg}" -p "${PGPORT:-54329}" -U postgres -v ON_ERROR_STOP=1 -q -At)
BANCO=harness_fotografia
falhas=0
ok()  { echo "ok    $1"; }
nao() { echo "FALHA $1"; falhas=$((falhas + 1)); }
base() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" -c "CREATE DATABASE $BANCO" >/dev/null
  "${PSQL[@]}" -d $BANCO <<'SQL' >/dev/null
CREATE TABLE public.orcamentista_orcamento_item_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, orcamento_item_id uuid NOT NULL, calculo_id uuid NOT NULL,
  ordem integer NOT NULL, codigo text NOT NULL, descricao text, unidade_compra text, medida_unidade numeric, custo_bruto_unidade numeric NOT NULL,
  cred_icms_pct numeric, cred_pis_cofins_pct numeric, cred_ipi_pct numeric, nc_ipi_pct numeric, cred_ibs_pct numeric, cred_cbs_pct numeric,
  credito_nao_apurado text, custo_liquido_unidade numeric NOT NULL, custo_liquido_fracao numeric, consumo_item numeric NOT NULL,
  custo_bruto_material numeric NOT NULL, custo_liquido_material numeric NOT NULL, criado_em timestamptz NOT NULL DEFAULT now());
INSERT INTO public.orcamentista_orcamento_item_material (tenant_id, orcamento_item_id, calculo_id, ordem, codigo, custo_bruto_unidade, custo_liquido_unidade, consumo_item, custo_bruto_material, custo_liquido_material)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, '9641', 100, 80, 6, 100, 80);
SQL
}
linha() { "${PSQL[@]}" -d $BANCO -c "INSERT INTO public.orcamentista_orcamento_item_material (tenant_id, orcamento_item_id, calculo_id, ordem, codigo, custo_bruto_unidade, custo_liquido_unidade, consumo_item, custo_bruto_material, custo_liquido_material, codigo_na_tabela, resolucao) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 2, '1023', 1, 1, 1, 1, 1, $1, $2)" >/dev/null 2>&1; }

base
"${PSQL[@]}" -d $BANCO -f "$MIG" >/dev/null 2>&1 && ok "aplica" || nao "aplica"
"${PSQL[@]}" -d $BANCO -f "$MIG" >/dev/null 2>&1 && ok "reaplica (idempotente)" || nao "reaplica"
[ "$("${PSQL[@]}" -d $BANCO -c "SELECT count(*) FROM public.orcamentista_orcamento_item_material WHERE codigo_na_tabela IS NULL AND resolucao IS NULL")" = 1 ] && ok "a linha de antes fica nula (nada alterado)" || nao "linha de antes"
for r in exato sufixo_do_fornecedor cor aproximado_com_descricao; do linha "'1023/WOLFF'" "'$r'" && ok "aceita $r" || nao "aceita $r"; done
linha "'1023'" "NULL" && ok "aceita resolucao nula" || nao "aceita nula"
# a recusa só conta quando É a CHECK que recusa (um erro qualquer — banco fora — não é recusa)
recusa() { saida=$("${PSQL[@]}" -d $BANCO -c "INSERT INTO public.orcamentista_orcamento_item_material (tenant_id, orcamento_item_id, calculo_id, ordem, codigo, custo_bruto_unidade, custo_liquido_unidade, consumo_item, custo_bruto_material, custo_liquido_material, codigo_na_tabela, resolucao) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 2, '1023', 1, 1, 1, 1, 1, '1023', $1)" 2>&1) && return 1; echo "$saida" | grep -q orcamentista_orcamento_item_material_resolucao_check; }
recusa "'palpite'" && ok "recusa 'palpite' (pela CHECK)" || nao "recusa palpite"
recusa "'EXATO'" && ok "recusa 'EXATO' (a caixa conta, pela CHECK)" || nao "recusa EXATO"
# guarda: a coluna já existe com outro tipo
base
"${PSQL[@]}" -d $BANCO -c "ALTER TABLE public.orcamentista_orcamento_item_material ADD COLUMN resolucao integer" >/dev/null
saida=$("${PSQL[@]}" -d $BANCO -f "$MIG" 2>&1) && nao "guarda do tipo" || { echo "$saida" | grep -q "ja existe com o tipo int4" && ok "guarda: resolucao int aborta, nomeando" || nao "guarda: frase ($saida)"; }
[ "$("${PSQL[@]}" -d $BANCO -c "SELECT count(*) FROM information_schema.columns WHERE table_name='orcamentista_orcamento_item_material' AND column_name='codigo_na_tabela'")" = 0 ] && ok "guarda: nada foi alterado" || nao "guarda alterou"
# guarda: a tabela não existe
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" -c "CREATE DATABASE $BANCO" >/dev/null
saida=$("${PSQL[@]}" -d $BANCO -f "$MIG" 2>&1) && nao "guarda da tabela" || { echo "$saida" | grep -q "dependencia ausente" && ok "guarda: sem a tabela aborta" || nao "guarda tabela ($saida)"; }
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" >/dev/null
echo "falhas: $falhas"; exit $([ $falhas -eq 0 ] && echo 0 || echo 1)
