#!/bin/bash
# HARNESS da 20261121000002 (a função que a tela da natureza chama). NÃO TOCA PRODUÇÃO.
# Base: a da natureza-da-variavel (schema + 20261113000001 + estado) + a 20261121000001 aplicada (como em produção desde 21/11/2026) + o
# privilégio padrão de produção para funções (EXECUTE a anon, authenticated e service_role). Depois: a migração DUAS vezes, os casos, as guardas.
# Uso: run.sh [arquivo da migração]. Sai 1 se faltar ok; 2 se a base abortar.
S=$(cd "$(dirname "$0")" && pwd); R=$(cd "$S/../../.." && pwd)
MIG=${1:-$R/supabase/migrations/20261121000002_gravar_natureza.sql}
P="psql -h ${PGHOST:-/tmp/harness-pg} -p ${PGPORT:-54329} -U postgres -q -X"
D=${HARNESS_DB:-harness_gravar_natureza}
OKS=0; FALHAS=0
caso() { if [ "$2" = "$3" ]; then echo "ok: $1"; OKS=$((OKS+1)); else echo "FALHOU: $1 — esperado [$3], veio [$2]"; FALHAS=$((FALHAS+1)); fi; }
base() {
  $P -c "drop database if exists $1" >/dev/null 2>&1; $P -c "create database $1" >/dev/null || exit 2
  $P -d $1 -v ON_ERROR_STOP=1 -f $R/scripts/harness/vidro-padrao-por-grupo/00_schema.sql >/dev/null 2>&1 || { echo "BASE FALHOU (schema)"; exit 2; }
  $P -d $1 -v ON_ERROR_STOP=1 -f $R/supabase/migrations/20261113000001_vidro_padrao_por_grupo.sql >/dev/null 2>&1 || { echo "BASE FALHOU (20261113000001)"; exit 2; }
  $P -d $1 -v ON_ERROR_STOP=1 -f $R/scripts/harness/natureza-da-variavel/01_estado.sql >/dev/null 2>&1 || { echo "BASE FALHOU (estado)"; exit 2; }
  [ "$2" = sem_natureza ] || $P -d $1 -v ON_ERROR_STOP=1 -f $R/supabase/migrations/20261121000001_natureza_da_variavel.sql >/dev/null 2>&1 || { echo "BASE FALHOU (20261121000001)"; exit 2; }
  $P -d $1 -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    INSERT INTO tenants VALUES ('22222222-2222-2222-2222-222222222222'); INSERT INTO users (id) VALUES ('44444444-4444-4444-4444-444444444444');
    INSERT INTO orcamentista_materia_prima VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'ALU', 'Outra');" >/dev/null 2>&1 || { echo "BASE FALHOU (extra)"; exit 2; }
}
aplica() { $P -d $1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -oE 'guarda: [^.:]*|verificacao: [^.]*' | head -1; }
q() { $P -d $1 -tA -c "$2" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
erro() { $P -d $1 -tA -c "$2" 2>&1 | grep -oE 'natureza: [^.]*|violates [a-z ]+ constraint "[a-z_]+"|permission denied' | head -1; }
T="'20e08592-f957-4e72-b7eb-251387e34eb9'"; U="'44444444-4444-4444-4444-444444444444'"
g() { echo "select superadmin_gravar_natureza($T, $U, '$1'::jsonb)->>'resultado'"; }
LOG="select count(*) from superadmin_alteracao_log where tabela='orcamentista_natureza_da_variavel'"

base $D
caso 'aplica sobre a 20261121000001' "$(aplica $D)" ''
caso 'reaplica sem erro' "$(aplica $D)" ''
caso 'log de partida: as 14 do semeio' "$(q $D "$LOG")" '14'
caso 'troca a opção de uma POLITICA' "$(q $D "$(g '{"familia":"PVC","variavel":"ARI","natureza":"POLITICA","opcao_padrao":"BZ0006"}')")" 'trocada'
caso '… gravou a opção e quem' "$(q $D "select opcao_padrao||' '||atualizado_por from orcamentista_natureza_da_variavel where variavel='ARI'")" 'BZ0006 44444444-4444-4444-4444-444444444444'
caso '… logou antes e depois, com o tenant' "$(q $D "select antes->>'opcao_padrao'||' '||(depois->>'opcao_padrao')||' '||tenant_id from superadmin_alteracao_log where tabela='orcamentista_natureza_da_variavel' and antes is not null")" 'BZ1770 BZ0006 20e08592-f957-4e72-b7eb-251387e34eb9'
caso 'o mesmo valor: igual, sem gravar nem logar' "$(q $D "$(g '{"familia":"PVC","variavel":"ARI","natureza":"POLITICA","opcao_padrao":" BZ0006 "}')"; echo -n " "; q $D "$LOG")" 'igual 15'
caso 'POLITICA vira ITEM (opção nula)' "$(q $D "$(g '{"familia":"PVC","variavel":"MTE","natureza":"ITEM","opcao_padrao":null}')"; echo -n " "; q $D "select natureza||coalesce(opcao_padrao,'-') from orcamentista_natureza_da_variavel where variavel='MTE'")" 'trocada ITEM-'
caso 'variável nova: criada' "$(q $D "$(g '{"familia":"PVC","variavel":"INT","natureza":"CALCULO"}')"; echo -n " "; q $D "select count(*) from orcamentista_natureza_da_variavel where variavel='INT' and natureza='CALCULO' and linha is null and formato is null")" 'criada 1'
caso '… logou com antes nulo' "$(q $D "select count(*) from superadmin_alteracao_log where tabela='orcamentista_natureza_da_variavel' and antes is null and depois->>'variavel'='INT' and depois->>'funcao'='superadmin_gravar_natureza'")" '1'
caso 'VIDRO por formato: troca o da janela correr' "$(q $D "$(g '{"familia":"PVC","formato":"janela correr","variavel":"VIDRO","natureza":"POLITICA","opcao_padrao":"VIN04"}')"; echo -n " "; q $D "select opcao_padrao from orcamentista_natureza_da_variavel where variavel='VIDRO' and formato='janela correr'")" 'trocada VIN04'
caso 'VIDRO por formato: cria o de porta correr, sem tocar o maxim-ar' "$(q $D "$(g '{"familia":"PVC","formato":"porta correr","variavel":"VIDRO","natureza":"POLITICA","opcao_padrao":"VIN08"}')"; echo -n " "; q $D "select string_agg(formato||'='||opcao_padrao, ',' order by formato) from orcamentista_natureza_da_variavel where variavel='VIDRO'")" 'criada janela correr=VIN04,maxim-ar=VBO3,4,porta correr=VIN08'
caso 'formato vazio é a família inteira' "$(q $D "$(g '{"familia":"PVC","formato":"","variavel":"RL","natureza":"POLITICA","opcao_padrao":"NAO"}')")" 'trocada'
caso 'POLITICA sem opção: recusa (CHECK)' "$(erro $D "$(g '{"familia":"PVC","variavel":"UT","natureza":"POLITICA","opcao_padrao":"  "}')")" 'violates check constraint "orcamentista_natureza_opcao_so_na_politica"'
caso 'ITEM com opção: recusa (CHECK)' "$(erro $D "$(g '{"familia":"PVC","variavel":"UT","natureza":"ITEM","opcao_padrao":"SIM"}')")" 'violates check constraint "orcamentista_natureza_opcao_so_na_politica"'
caso 'natureza fora das três: recusa (CHECK)' "$(erro $D "$(g '{"familia":"PVC","variavel":"UT","natureza":"OUTRA"}')")" 'violates check constraint "orcamentista_natureza_natureza"'
caso 'formato numa variável do motor: recusa (CHECK)' "$(erro $D "$(g '{"familia":"PVC","formato":"maxim-ar","variavel":"ARI","natureza":"ITEM"}')")" 'violates check constraint "orcamentista_natureza_linha_formato_so_no_vidro"'
caso 'chave desconhecida (linha): recusa nomeada' "$(erro $D "$(g '{"familia":"PVC","linha":"EUROPA 42","variavel":"VIDRO","natureza":"ITEM"}')")" 'natureza: chave desconhecida "linha"'
caso 'sem a variável: recusa' "$(erro $D "$(g '{"familia":"PVC","natureza":"ITEM"}')")" 'natureza: familia, variavel e natureza sao obrigatorias'
caso 'família de outra empresa: recusa' "$(erro $D "$(g '{"familia":"ALU","variavel":"UT","natureza":"ITEM"}')")" 'natureza: a familia ALU nao e de nenhuma materia-prima desta empresa'
caso 'família inexistente: a MESMA frase' "$(erro $D "$(g '{"familia":"XYZ","variavel":"UT","natureza":"ITEM"}')")" 'natureza: a familia XYZ nao e de nenhuma materia-prima desta empresa'
caso 'linha não objeto: recusa' "$(erro $D "select superadmin_gravar_natureza($T, $U, '[]'::jsonb)")" 'natureza: a empresa e a linha sao obrigatorias'
caso 'nada foi apagado: 14 + INT + porta correr' "$(q $D "select count(*) from orcamentista_natureza_da_variavel")" '16'
caso 'a recusa não deixou log' "$(q $D "$LOG")" '20'
caso 'anon não executa' "$(erro $D "set role anon; $(g '{"familia":"PVC","variavel":"UT","natureza":"ITEM"}')")" 'permission denied'
caso 'authenticated não executa' "$(erro $D "set role authenticated; $(g '{"familia":"PVC","variavel":"UT","natureza":"ITEM"}')")" 'permission denied'
caso 'service_role executa' "$(q $D "set role service_role; $(g '{"familia":"PVC","variavel":"UT","natureza":"ITEM"}')")" 'criada'

# CORRIDA: duas gravações da mesma chave nova ao mesmo tempo -> uma cria, a outra troca (nunca a violação de unicidade)
( $P -d $D -tA -c "begin; $(g '{"familia":"PVC","variavel":"MF","natureza":"ITEM"}'); select pg_sleep(1); commit;" >/tmp/claude-corrida-a.txt 2>&1 ) &
sleep 0.3
B=$($P -d $D -tA -c "$(g '{"familia":"PVC","variavel":"MF","natureza":"CALCULO"}')" 2>&1 | tr '\n' ' ' | sed 's/ *$//'); wait
caso 'corrida: a primeira cria, a segunda espera e troca' "$(grep -oE 'criada' /tmp/claude-corrida-a.txt) $B" 'criada trocada'
caso 'corrida: uma linha, a da segunda' "$(q $D "select count(*)||natureza from orcamentista_natureza_da_variavel where variavel='MF' group by natureza")" '1CALCULO'
rm -f /tmp/claude-corrida-a.txt

# GUARDAS: num banco novo, nada é criado
base ${D}_g sem_natureza
caso 'guarda: sem a 20261121000001' "$(aplica ${D}_g)" "guarda: orcamentista_natureza_da_variavel nao existe em ${D}_g (usuario postgres)"
caso 'guarda: sem a 20261121000001 — nada criado' "$(q ${D}_g "select to_regprocedure('superadmin_gravar_natureza(uuid,uuid,jsonb)') is null")" 't'
base ${D}_g
$P -d ${D}_g -c "alter table orcamentista_natureza_da_variavel drop constraint orcamentista_natureza_opcao_so_na_politica" >/dev/null
caso 'guarda: a tabela sem a forma conferida' "$(aplica ${D}_g)" 'guarda: orcamentista_natureza_da_variavel nao tem a forma da 20261121000001 (unicidade e CHECKs)'
caso 'guarda: forma — nada criado' "$(q ${D}_g "select to_regprocedure('superadmin_gravar_natureza(uuid,uuid,jsonb)') is null")" 't'

echo "$OKS ok, $FALHAS falhas"; [ $FALHAS -eq 0 ]
