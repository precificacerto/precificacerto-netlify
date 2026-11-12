#!/usr/bin/env bash
# O HARNESS da 20261112000004 (devolve o EXECUTE da de dentro ao service_role) e da 20261112000005 (corta o caminho por fora),
# num Postgres 16 local, sobre a 20261112000003 aplicada como em produção. A guarda é provada com o CORPO DE PRODUÇÃO de
# importar_conteudo_da_tabela (o do harness da 20261112000003, md5 conferido). Falha por código de saída.
# MIG4/MIG5 podem apontar outra cópia do arquivo (é como as mutações rodam).
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
MIG3="$RAIZ/supabase/migrations/20261112000003_importacao_que_nao_encolhe.sql"
MIG4="${MIG4:-$RAIZ/supabase/migrations/20261112000004_devolve_execute_da_importacao_ao_service_role.sql}"
MIG5="${MIG5:-$RAIZ/supabase/migrations/20261112000005_corta_o_caminho_por_fora_da_importacao.sql}"
CORPO="$RAIZ/scripts/harness/importacao-que-nao-encolhe/corpo-de-producao-importar_conteudo_da_tabela.sql"
PSQL=(psql -h "${PGHOST:-/tmp/harness-pg}" -p "${PGPORT:-54329}" -U postgres -v ON_ERROR_STOP=1 -q -At)
BANCO=harness_execute_da_importacao
falhas=0
ok()  { echo "ok    $1"; }
nao() { echo "FALHA $1"; falhas=$((falhas + 1)); }
q()   { "${PSQL[@]}" -d $BANCO -c "$1"; }
aplica() { "${PSQL[@]}" -d $BANCO -f "$1" 2>&1; }
T=00000000-0000-4000-8000-0000000000a1
U=00000000-0000-4000-8000-0000000000b1
SHA=$(printf 'arquivo' | sha256sum | cut -d' ' -f1)
INTERNA="public.importar_conteudo_da_tabela(uuid, jsonb)"
NOVA="public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)"
sr_interna() { q "SELECT has_function_privilege('service_role', '$INTERNA', 'EXECUTE')"; }
sr_nova()    { q "SELECT has_function_privilege('service_role', '$NOVA', 'EXECUTE')"; }
acl_interna() { q "SELECT proacl::text FROM pg_proc WHERE oid = to_regprocedure('$INTERNA')"; }

# a base: as três tabelas, os papéis, o corpo de produção da de dentro com o GRANT de antes de 12/11
base() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" -c "CREATE DATABASE $BANCO" >/dev/null 2>&1
  "${PSQL[@]}" -d $BANCO <<SQL >/dev/null
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END \$\$;
CREATE TABLE public.orcamentista_tabela (id uuid PRIMARY KEY, arquivo_path text NOT NULL, arquivo_nome text NOT NULL);
CREATE TABLE public.orcamentista_tabela_item (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tabela_id uuid NOT NULL, codigo text NOT NULL);
CREATE TABLE public.superadmin_alteracao_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, tabela text NOT NULL, chave text NOT NULL, antes jsonb, depois jsonb, por uuid, em timestamptz NOT NULL DEFAULT now());
INSERT INTO public.orcamentista_tabela VALUES ('$T', 'arquivo/velho.xlsx', 'velho.xlsx');
INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo) SELECT '$T', c FROM unnest(ARRAY['1','2','3']) c;
SQL
  "${PSQL[@]}" -d $BANCO -f "$CORPO" >/dev/null
  q "REVOKE ALL ON FUNCTION $INTERNA FROM PUBLIC; GRANT EXECUTE ON FUNCTION $INTERNA TO service_role" >/dev/null
}
# produção às 15:46 UTC de 12/11/2026: a 20261112000003 aplicada inteira, o REVOKE valendo
producao_cortada() { base; aplica "$MIG3" >/dev/null; }
# a de dentro trocada por uma MÍNIMA (o CREATE OR REPLACE preserva a ACL): apaga e regrava os itens
minima() {
  "${PSQL[@]}" -d $BANCO >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.importar_conteudo_da_tabela(p_tabela_id uuid, p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $m$
DECLARE n int;
BEGIN
  DELETE FROM public.orcamentista_tabela_item WHERE tabela_id = p_tabela_id;
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo) SELECT p_tabela_id, x->>'codigo' FROM jsonb_array_elements(p_payload->'itens') x;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('itens', n);
END $m$;
SQL
}
como_service_role() { "${PSQL[@]}" -d $BANCO -c "SET ROLE service_role; $1" 2>&1; }

# ── o estado de partida reproduz o de produção ──
producao_cortada
[ "$(sr_interna)" = f ] && [ "$(sr_nova)" = t ] && ok "partida: a 20261112000003 corta a de dentro e dá a nova ao service_role (o incidente)" || nao "partida"
[ "$(q "SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc WHERE oid = to_regprocedure('$NOVA')")" = afae80234ff0b5857b923b3403ad7ae6 ] \
  && ok "o corpo local da nova tem o md5 medido em produção (afae8023…), o que a guarda da 0005 confere" || nao "md5 da nova"

# ── 0004 ──
saida=$(aplica "$MIG4") && ok "0004 aplica sobre a produção cortada" || nao "0004 aplica ($saida)"
[ "$(sr_interna)" = t ] && [ "$(acl_interna)" = "{postgres=X/postgres,service_role=X/postgres}" ] && ok "0004: a ACL volta a postgres=X | service_role=X" || nao "0004 acl ($(acl_interna))"
aplica "$MIG4" >/dev/null && [ "$(acl_interna)" = "{postgres=X/postgres,service_role=X/postgres}" ] && ok "0004 reaplica sem erro (idempotente)" || nao "0004 reaplica"
producao_cortada; q "GRANT EXECUTE ON FUNCTION $INTERNA TO service_role" >/dev/null
aplica "$MIG4" >/dev/null && [ "$(acl_interna)" = "{postgres=X/postgres,service_role=X/postgres}" ] && ok "0004 sobre o GRANT já rodado à mão: aplica, nada muda" || nao "0004 sobre o manual"
producao_cortada; minima; q "REVOKE EXECUTE ON FUNCTION $INTERNA FROM service_role" >/dev/null
saida=$(aplica "$MIG4") && nao "guarda 0004 corpo" || { echo "$saida" | grep -q "tem outro corpo" && [ "$(sr_interna)" = f ] && ok "guarda 0004: a de dentro com outro corpo aborta, nada concedido" || nao "guarda 0004 corpo ($saida)"; }
base; q "REVOKE EXECUTE ON FUNCTION $INTERNA FROM service_role" >/dev/null
saida=$(aplica "$MIG4") && nao "guarda 0004 nova" || { echo "$saida" | grep -q "dependencia ausente: public.superadmin_importar_tabela" && [ "$(sr_interna)" = f ] && ok "guarda 0004: sem a nova aborta, nada concedido" || nao "guarda 0004 nova ($saida)"; }
producao_cortada; q "GRANT EXECUTE ON FUNCTION $INTERNA TO anon" >/dev/null
saida=$(aplica "$MIG4") && nao "verificação 2 da 0004" || { echo "$saida" | grep -q "verificacao 2" && [ "$(sr_interna)" = f ] && ok "0004 verificação 2: a de dentro aberta a anon aborta, e o GRANT se desfaz" || nao "verificação 2 ($saida)"; }

# ── com a 0004: a rota de HOJE (a de dentro chamada direto pelo service_role) volta a funcionar ──
producao_cortada; aplica "$MIG4" >/dev/null; minima
r=$(como_service_role "SELECT public.importar_conteudo_da_tabela('$T', '{\"itens\":[{\"codigo\":\"1\"},{\"codigo\":\"2\"},{\"codigo\":\"3\"},{\"codigo\":\"4\"}]}')")
echo "$r" | grep -q '"itens": 4' && ok "depois da 0004 o service_role importa direto (a rota publicada)" || nao "rota de hoje ($r)"
"${PSQL[@]}" -d $BANCO -f "$CORPO" >/dev/null   # volta o corpo de produção (preserva a ACL)

# ── 0005 ──
saida=$(aplica "$MIG5") && ok "0005 aplica depois da 0004" || nao "0005 aplica ($saida)"
[ "$(sr_interna)" = f ] && [ "$(acl_interna)" = "{postgres=X/postgres}" ] && [ "$(sr_nova)" = t ] && ok "0005: a de dentro só do dono; a nova continua do service_role" || nao "0005 acl ($(acl_interna))"
for papel in anon authenticated; do [ "$(q "SELECT has_function_privilege('$papel', '$INTERNA', 'EXECUTE')")" = f ] || nao "0005 $papel"; done; ok "0005: anon e authenticated sem EXECUTE na de dentro"
aplica "$MIG5" >/dev/null && ok "0005 reaplica sem erro (idempotente)" || nao "0005 reaplica"
minima
r=$(como_service_role "SELECT public.importar_conteudo_da_tabela('$T', '{\"itens\":[]}')"); echo "$r" | grep -q "permission denied" && ok "depois da 0005 o service_role NÃO chama a de dentro (o caminho por fora fechado)" || nao "corte ($r)"
r=$(como_service_role "SELECT public.superadmin_importar_tabela('$U', '$T', '$SHA', '{\"itens\":[{\"codigo\":\"1\"},{\"codigo\":\"2\"},{\"codigo\":\"3\"},{\"codigo\":\"4\"},{\"codigo\":\"5\"}]}'::jsonb, false, NULL, NULL)")
echo "$r" | grep -q '"itens_depois": 5' && ok "depois da 0005 o service_role importa pela nova (ela chama a de dentro como dona)" || nao "nova depois do corte ($r)"

# ── as guardas da 0005: em cada uma nada é revogado ──
g5() { # $1 = o que prepara, $2 = o trecho da frase
  producao_cortada; aplica "$MIG4" >/dev/null; q "$1" >/dev/null
  saida=$(aplica "$MIG5") && { nao "guarda 0005 ($2)"; return; }
  echo "$saida" | grep -q "$2" && [ "$(sr_interna)" = t ] && ok "guarda 0005: $2 — aborta, nada revogado" || nao "guarda 0005 $2 ($saida)"
}
g5 "DROP FUNCTION $NOVA" "dependencia ausente: public.superadmin_importar_tabela"
g5 "CREATE OR REPLACE FUNCTION public.superadmin_importar_tabela(p_por uuid, p_tabela_id uuid, p_sha256 text, p_payload jsonb, p_permitir_encolher boolean, p_arquivo_path text, p_arquivo_nome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS \$x\$ BEGIN RETURN '{}'; END \$x\$" "superadmin_importar_tabela tem outro corpo"
g5 "ALTER FUNCTION $NOVA SECURITY INVOKER" "sem SECURITY DEFINER"
g5 "REVOKE EXECUTE ON FUNCTION $NOVA FROM service_role" "o service_role nao executa superadmin_importar_tabela"
producao_cortada; aplica "$MIG4" >/dev/null; minima
saida=$(aplica "$MIG5") && nao "guarda 0005 de dentro" || { echo "$saida" | grep -q "importar_conteudo_da_tabela tem outro corpo" && [ "$(sr_interna)" = t ] && ok "guarda 0005: a de dentro com outro corpo aborta, nada revogado" || nao "guarda 0005 de dentro ($saida)"; }

echo; [ $falhas -eq 0 ] && echo "TUDO OK" || echo "$falhas FALHA(S)"
exit $falhas
