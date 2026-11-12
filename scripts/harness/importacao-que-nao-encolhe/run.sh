#!/usr/bin/env bash
# O HARNESS da 20261112000003 (a importação que não encolhe sem permissão), num Postgres 16 local. A guarda é provada com o CORPO DE
# PRODUÇÃO de importar_conteudo_da_tabela (corpo-de-producao-…sql, md5 conferido); os casos de execução trocam a de dentro por uma versão
# mínima que apaga e regrava os itens (as outras doze tabelas do conteúdo não mudam a trava). Falha por código de saída.
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
MIG="$RAIZ/supabase/migrations/20261112000003_importacao_que_nao_encolhe.sql"
PSQL=(psql -h "${PGHOST:-/tmp/harness-pg}" -p "${PGPORT:-54329}" -U postgres -v ON_ERROR_STOP=1 -q -At)
BANCO=harness_importacao
falhas=0
ok()  { echo "ok    $1"; }
nao() { echo "FALHA $1"; falhas=$((falhas + 1)); }
q()   { "${PSQL[@]}" -d $BANCO -c "$1"; }
T=00000000-0000-4000-8000-0000000000a1
U=00000000-0000-4000-8000-0000000000b1
SHA=$(printf 'arquivo' | sha256sum | cut -d' ' -f1)
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
INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo) SELECT '$T', c FROM unnest(ARRAY['1','2','3','4','5']) c;
SQL
  "${PSQL[@]}" -d $BANCO -f "$AQUI/corpo-de-producao-importar_conteudo_da_tabela.sql" >/dev/null
  q "GRANT EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) TO service_role" >/dev/null
}
# a de dentro, MÍNIMA, para os casos de execução: apaga e regrava os itens; com 'falhar_contagem', grava um a menos (a conferência pega)
minima() {
  "${PSQL[@]}" -d $BANCO >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.importar_conteudo_da_tabela(p_tabela_id uuid, p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $m$
DECLARE n int;
BEGIN
  DELETE FROM public.orcamentista_tabela_item WHERE tabela_id = p_tabela_id;
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo)
    SELECT p_tabela_id, x->>'codigo' FROM jsonb_array_elements(p_payload->'itens') WITH ORDINALITY AS e(x, k)
     WHERE NOT (coalesce((p_payload->>'falhar_contagem')::boolean, false) AND k = 1);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('itens', n);
END $m$;
SQL
}
payload() { printf '{"itens":[%s]}' "$(for c in "$@"; do printf '{"codigo":"%s"},' "$c"; done | sed 's/,$//')"; }
importa() { q "SELECT public.superadmin_importar_tabela('$U', '$T', $1, '$2'::jsonb, $3, $4, $5)" 2>&1; }
itens()   { q "SELECT string_agg(codigo, ',' ORDER BY codigo) FROM public.orcamentista_tabela_item WHERE tabela_id = '$T'"; }
logs()    { q "SELECT count(*) FROM public.superadmin_alteracao_log"; }

# ── a migração e a guarda ──
base
"${PSQL[@]}" -d $BANCO -f "$MIG" >/dev/null 2>&1 && ok "aplica, com o corpo de produção da de dentro" || nao "aplica"
"${PSQL[@]}" -d $BANCO -f "$MIG" >/dev/null 2>&1 && ok "reaplica (idempotente)" || nao "reaplica"
[ "$(q "SELECT has_function_privilege('service_role', 'public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)', 'EXECUTE')")" = t ] && ok "service_role executa a nova" || nao "service_role nova"
[ "$(q "SELECT has_function_privilege('service_role', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'EXECUTE')")" = f ] && ok "service_role NÃO executa mais a de dentro (sem caminho por fora)" || nao "de dentro com execute"
[ "$(q "SELECT has_function_privilege('anon', 'public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)', 'EXECUTE')")" = f ] && ok "anon não executa a nova" || nao "anon"
[ "$(q "SELECT pronargdefaults FROM pg_proc WHERE proname = 'superadmin_importar_tabela'")" = 0 ] && ok "nenhum parâmetro com default" || nao "default"
q "SELECT proconfig FROM pg_proc WHERE proname = 'superadmin_importar_tabela'" | grep -q "statement_timeout=35s" && ok "o statement_timeout de 35s (o PostgREST o iça)" || nao "timeout"
base
q "CREATE OR REPLACE FUNCTION public.importar_conteudo_da_tabela(p_tabela_id uuid, p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS \$x\$ BEGIN RETURN '{}'; END \$x\$" >/dev/null
saida=$("${PSQL[@]}" -d $BANCO -f "$MIG" 2>&1) && nao "guarda do corpo" || { echo "$saida" | grep -q "tem outro corpo" && ok "guarda: a de dentro com outro corpo aborta" || nao "guarda ($saida)"; }
[ "$(q "SELECT count(*) FROM pg_proc WHERE proname = 'superadmin_importar_tabela'")" = 0 ] && ok "guarda: nada foi criado" || nao "guarda criou"

# ── os casos, com a de dentro mínima ──
base; "${PSQL[@]}" -d $BANCO -f "$MIG" >/dev/null 2>&1; minima
r=$(importa "'$SHA'" "$(payload 1 2 3 4 5 6)" false NULL NULL)
[ "$(itens)" = "1,2,3,4,5,6" ] && echo "$r" | grep -q '"itens_antes": 5' && echo "$r" | grep -q '"itens_depois": 6' && ok "cresce: entram 6 sobre 5, as contagens na resposta" || nao "cresce ($r)"
[ "$(q "SELECT antes->>'itens' || '>' || (depois->>'itens') || ' ' || (depois->>'sha256') || ' ' || por FROM public.superadmin_alteracao_log")" = "5>6 $SHA $U" ] && ok "o log: antes 5, depois 6, o sha256 e quem importou" || nao "log"
r=$(importa "'$SHA'" "$(payload 1 2 3)" false NULL NULL)
echo "$r" | grep -q "traz 3 itens, e a tabela tem 6 hoje: a tabela encolheria 3 itens" && [ "$(itens)" = "1,2,3,4,5,6" ] && [ "$(logs)" = 1 ] && ok "ENCOLHER sem permissão: recusa com as contagens, nada muda, nada loga" || nao "encolher ($r)"
r=$(importa "'$SHA'" "$(payload 1 2 3)" true NULL NULL)
[ "$(itens)" = "1,2,3" ] && [ "$(q "SELECT depois->>'permitiu_encolher' FROM public.superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1")" = true ] && ok "encolher COM permissão: grava, e o log diz que permitiu" || nao "encolher permitido ($r)"
r=$(importa "'$SHA'" "$(payload 1 2 3)" NULL NULL NULL); echo "$r" | grep -q "p_permitir_encolher e obrigatorio" && ok "permitir nulo: recusa (22023)" || nao "permitir nulo ($r)"
r=$(importa "'abc'" "$(payload 1 2 3)" false NULL NULL); echo "$r" | grep -q "64 hexadecimais" && ok "sha256 fora da forma: recusa" || nao "sha ($r)"
r=$(importa "'$SHA'" "$(payload 1 2 3)" false "'arquivo/novo.xlsx'" NULL); echo "$r" | grep -q "pela metade" && ok "arquivo pela metade: recusa" || nao "metade ($r)"
r=$(importa "'$SHA'" "$(payload 1 2 3 9)" false "'arquivo/novo.xlsx'" "'novo.xlsx'")
[ "$(q "SELECT arquivo_path || ' ' || arquivo_nome FROM public.orcamentista_tabela")" = "arquivo/novo.xlsx novo.xlsx" ] && [ "$(q "SELECT (antes->>'arquivo_nome') || '>' || (depois->>'arquivo_nome') FROM public.superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1")" = "velho.xlsx>novo.xlsx" ] && ok "a TROCA DO ARQUIVO no mesmo lugar, junto dos itens, e o log com o de antes e o de agora" || nao "troca ($r)"
n=$(logs); r=$(importa "'$SHA'" '{"itens":[{"codigo":"1"},{"codigo":"2"},{"codigo":"3"},{"codigo":"4"},{"codigo":"5"}],"falhar_contagem":true}' false "'arquivo/outro.xlsx'" "'outro.xlsx'")
echo "$r" | grep -q "a gravacao deixou 4 itens, e entraram 5" && [ "$(itens)" = "1,2,3,9" ] && [ "$(q "SELECT arquivo_nome FROM public.orcamentista_tabela")" = "novo.xlsx" ] && [ "$(logs)" = "$n" ] && ok "ATÔMICA: a contagem que não fecha desfaz o DELETE, o INSERT e a troca — nada muda" || nao "atômica ($r)"
r=$(q "SELECT public.superadmin_importar_tabela('$U', '00000000-0000-4000-8000-0000000000ff', '$SHA', '{\"itens\":[]}'::jsonb, false, NULL, NULL)" 2>&1); echo "$r" | grep -q "Tabela nao encontrada" && ok "tabela que não existe: P0002" || nao "inexistente ($r)"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" >/dev/null 2>&1
echo "falhas: $falhas"; exit $([ $falhas -eq 0 ] && echo 0 || echo 1)
