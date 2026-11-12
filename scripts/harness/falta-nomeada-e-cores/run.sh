#!/usr/bin/env bash
# O HARNESS da 20261112000006 (a falta nomeada, as cores do fornecedor, a fotografia, o caminho do material e o código do vidro), num
# Postgres 16 local, com as tabelas de que ela depende na forma de produção (medida em 12/11/2026) e o privilégio padrão de produção
# (o que o postgres cria no public dá acesso a authenticated e service_role). Falha por código de saída. MIG pode apontar outra cópia.
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
MIG="${MIG:-$RAIZ/supabase/migrations/20261112000006_falta_nomeada_cores_e_tres_caminhos.sql}"
PSQL=(psql -h "${PGHOST:-/tmp/harness-pg}" -p "${PGPORT:-54329}" -U postgres -v ON_ERROR_STOP=1 -q -At)
BANCO=harness_falta_nomeada
falhas=0
ok()  { echo "ok    $1"; }
nao() { echo "FALHA $1"; falhas=$((falhas + 1)); }
q()   { "${PSQL[@]}" -d $BANCO -c "$1"; }
aplica() { "${PSQL[@]}" -d $BANCO -f "$MIG" 2>&1; }
W=44c5c0fe-a0d3-4aab-802d-20a6eff3f654
T=00000000-0000-4000-8000-0000000000a1
I=00000000-0000-4000-8000-0000000000c1
C=00000000-0000-4000-8000-0000000000d1
base() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $BANCO" -c "CREATE DATABASE $BANCO" >/dev/null 2>&1
  "${PSQL[@]}" -d $BANCO <<SQL >/dev/null
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END \$\$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS 'SELECT false';
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.orcamentista_fornecedor (id uuid PRIMARY KEY, nome text NOT NULL);
CREATE TABLE public.orcamentista_orcamento_item (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, vidro text, UNIQUE (id, tenant_id));
CREATE TABLE public.orcamentista_levantamento_item (id uuid PRIMARY KEY, vidro text);
CREATE TABLE public.orcamentista_orcamento_item_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, orcamento_item_id uuid NOT NULL, calculo_id uuid NOT NULL,
  ordem integer NOT NULL, codigo text NOT NULL, custo_bruto_unidade numeric NOT NULL,
  CONSTRAINT orcamentista_orcamento_item_material_codigo_key UNIQUE (orcamento_item_id, calculo_id, codigo));
INSERT INTO public.tenants VALUES ('$T');
INSERT INTO public.orcamentista_fornecedor VALUES ('$W', 'Wolf');
INSERT INTO public.orcamentista_orcamento_item VALUES ('$I', '$T', '4 mm');
SQL
}
mat() { q "INSERT INTO public.orcamentista_orcamento_item_material (tenant_id, orcamento_item_id, calculo_id, ordem, codigo, custo_bruto_unidade, caminho) VALUES ('$T', '$I', '$C', $1, '$2', 1, $3)" 2>&1; }
falta() { q "INSERT INTO public.orcamentista_orcamento_falta (tenant_id, orcamento_item_id, calculo_id, ordem, caminho, codigo_do_motor, tipologia, esquadria, motivo, frase) VALUES ('$T', '$I', '$C', $1, $2, 'SF92/WOLFF', 'DP-02', 1, $3, 'o perfil SF92/WOLFF em BRANCO nao tem preco')" 2>&1; }

# ── aplica, reaplica, e o que ela cria ──
base
s=$(aplica) && ok "aplica sobre a base de produção" || nao "aplica ($s)"
s=$(aplica) && ok "reaplica sem erro (idempotente)" || nao "reaplica ($s)"
[ "$(q "SELECT grupo || ':' || count(*) FROM public.orcamentista_fornecedor_cor GROUP BY grupo ORDER BY grupo" | tr '\n' ' ')" = "ACESSORIOS:4 PERFIS DE PVC:15 " ] && ok "as 19 cores da Wolf: 15 de PERFIS DE PVC e 4 de ACESSORIOS — uma vez só depois de reaplicar" || nao "cores"
[ "$(q "SELECT nome FROM public.orcamentista_fornecedor_cor WHERE grupo = 'PERFIS DE PVC' AND codigo = '21'")" = "AMADEIRADO GOLDEN OAK" ] && ok "o par lido da aba CORES: 21 = AMADEIRADO GOLDEN OAK" || nao "par 21"
r=$(q "INSERT INTO public.orcamentista_fornecedor_cor (fornecedor_id, grupo, codigo, nome) VALUES ('$W', 'PERFIS DE PVC', '1.1', 'FACE MENOR')" 2>&1); echo "$r" | grep -q codigo_forma && ok "o '.1' (face menor) não é código de cor: a CHECK recusa" || nao "face menor ($r)"
r=$(q "INSERT INTO public.orcamentista_fornecedor_cor (fornecedor_id, grupo, codigo, nome) VALUES ('$W', 'PERFIS DE PVC', '99', 'branco')" 2>&1); echo "$r" | grep -q nome_key && ok "o mesmo nome de cor duas vezes no grupo (sem olhar a caixa): recusa" || nao "nome repetido ($r)"
r=$(q "DELETE FROM public.orcamentista_fornecedor WHERE id = '$W'" 2>&1); echo "$r" | grep -q "violates foreign key" && ok "remover o fornecedor com cores: RESTRICT (nunca some sem log)" || nao "restrict ($r)"

# ── a falta ──
r=$(falta 1 "'perfil'" "'SEM_VALOR'") && ok "a falta grava (caminho, código do motor, tipologia, esquadria, motivo, frase)" || nao "falta ($r)"
r=$(falta 2 "'porta'" "'SEM_VALOR'"); echo "$r" | grep -q caminho_valido && ok "caminho fora de perfil/insumo/vidro: recusa" || nao "caminho ($r)"
r=$(falta 3 "'vidro'" "'sem valor'"); echo "$r" | grep -q motivo_forma && ok "motivo fora da forma: recusa" || nao "motivo ($r)"
r=$(falta 1 "'insumo'" "'SEM_VALOR'"); echo "$r" | grep -q ordem_key && ok "a mesma ordem duas vezes no mesmo cálculo: recusa" || nao "ordem ($r)"
r=$(q "INSERT INTO public.orcamentista_orcamento_falta (tenant_id, orcamento_item_id, calculo_id, ordem, caminho, codigo_do_motor, tipologia, esquadria, motivo, frase) VALUES ('$T', gen_random_uuid(), '$C', 1, 'vidro', 'VIDRO', 'DP-02', 1, 'X', 'x')" 2>&1); echo "$r" | grep -q falta_item_fkey && ok "falta de item que não existe: a FK recusa" || nao "fk ($r)"
[ "$(q "SELECT has_table_privilege('anon', 'public.orcamentista_orcamento_falta', 'SELECT')::text || has_table_privilege('authenticated', 'public.orcamentista_orcamento_falta', 'SELECT')::text || has_table_privilege('service_role', 'public.orcamentista_orcamento_falta', 'UPDATE')::text || has_table_privilege('service_role', 'public.orcamentista_orcamento_falta', 'INSERT')::text")" = falsefalsefalsetrue ] && ok "a falta: só INSERT e SELECT do service_role, mesmo com o privilégio padrão de produção" || nao "grants falta"

# ── o material: o caminho na UNIQUE, a fotografia ──
r=$(mat 1 8431 "'perfil'") && r2=$(mat 2 8431 "'insumo'") && ok "o mesmo código como perfil E como insumo no mesmo cálculo: cabe" || nao "dois caminhos ($r $r2)"
r=$(mat 3 8431 "'perfil'"); echo "$r" | grep -q caminho_codigo_key && ok "o mesmo código no mesmo caminho duas vezes: recusa" || nao "unique ($r)"
r=$(mat 4 8431 NULL); echo "$r" | grep -q caminho_codigo_key && ok "o material de antes (caminho nulo) conta como perfil na UNIQUE" || nao "nulo como perfil ($r)"
r=$(q "UPDATE public.orcamentista_orcamento_item_material SET resolucao = 'aproximado_com_descricao' WHERE ordem = 1" 2>&1); echo "$r" | grep -q resolucao_check && ok "o degrau que saiu (aproximado_com_descricao) não é mais aceito" || nao "degrau velho ($r)"
q "UPDATE public.orcamentista_orcamento_item_material SET resolucao = 'nome_tecnico', codigo_na_tabela = '9691' WHERE ordem = 1" >/dev/null && ok "os degraus novos: nome_tecnico aceito" || nao "degrau novo"
q "UPDATE public.orcamentista_orcamento_item_material SET resolucao = 'vidro_traduzido' WHERE ordem = 1" >/dev/null && ok "o degrau do vidro: vidro_traduzido aceito" || nao "degrau do vidro"
r=$(q "UPDATE public.orcamentista_orcamento_item SET vidro_codigo = ' VIN04' WHERE id = '$I'" 2>&1); echo "$r" | grep -q vidro_codigo_forma && ok "vidro_codigo com espaço na ponta: recusa" || nao "vidro ($r)"

# ── as guardas: nada é alterado ──
base; q "UPDATE public.orcamentista_fornecedor SET nome = 'Wolff'" >/dev/null
s=$(aplica) && nao "guarda Wolf" || { echo "$s" | grep -q "nao tem dono" && [ "$(q "SELECT to_regclass('public.orcamentista_orcamento_falta') IS NULL")" = t ] && ok "guarda: o fornecedor Wolf com outro nome aborta, nada criado" || nao "guarda Wolf ($s)"; }
base; q "ALTER TABLE public.orcamentista_orcamento_item ADD COLUMN vidro_codigo integer" >/dev/null
s=$(aplica) && nao "guarda tipo" || { echo "$s" | grep -q "devia ser text" && ok "guarda: vidro_codigo já existente com outro tipo aborta" || nao "guarda tipo ($s)"; }
base; q "ALTER TABLE public.orcamentista_orcamento_item_material DROP CONSTRAINT orcamentista_orcamento_item_material_codigo_key; ALTER TABLE public.orcamentista_orcamento_item_material ADD CONSTRAINT orcamentista_orcamento_item_material_codigo_key UNIQUE (orcamento_item_id, codigo)" >/dev/null
s=$(aplica) && nao "guarda unique" || { echo "$s" | grep -q "outra definicao" && ok "guarda: a UNIQUE antiga com outra definição aborta" || nao "guarda unique ($s)"; }
base; aplica >/dev/null; q "UPDATE public.orcamentista_fornecedor_cor SET nome = 'BRANCO NEVE' WHERE codigo = '1' AND grupo = 'ACESSORIOS'" >/dev/null
s=$(aplica) && nao "guarda cor" || { echo "$s" | grep -q "nao sobrescreve" && ok "guarda: uma cor da Wolf já gravada com outro nome aborta a reaplicação" || nao "guarda cor ($s)"; }

echo; [ $falhas -eq 0 ] && echo "TUDO OK" || echo "$falhas FALHA(S)"
exit $falhas
