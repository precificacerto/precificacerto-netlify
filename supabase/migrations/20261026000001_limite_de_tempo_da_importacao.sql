-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261026000001 — o LIMITE DE TEMPO PRÓPRIO da função de importação
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261026000001_limite_de_tempo_da_importacao.
-- ║ O bloco `$verifica$` ABORTA a transação se a função não sair como declarada, e o
-- ║ NOTIFY pgrst vai dentro: sem ele o PostgREST não vê o limite novo (ver abaixo).
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — medido em 25/10/2026, na reimportação da tabela da Wolff pela rota:
--   `importar_conteudo_da_tabela` grava ~61 mil linhas numa transação, e foi CANCELADA pelo
--   statement_timeout de 8 s que o papel `authenticator` (por onde o PostgREST conecta) traz em
--   rolconfig (`canceling statement due to statement timeout`, 57014). A transação abortou
--   inteira e nada foi perdido.
--
-- O QUE FAZ: dá à FUNÇÃO um statement_timeout próprio, de 35 s. NÃO mexe em papel nenhum —
-- authenticator, service_role, authenticated e anon ficam como estão (decisão do dono do produto:
-- mexer no papel afetaria o sistema inteiro).
--
-- POR QUE O SET NA FUNÇÃO FUNCIONA AQUI, E SÓ PELA API:
--   - num psql ou no SQL Editor, `SET statement_timeout` na função NÃO estende a chamada: o
--     cronômetro arma no início do comando de topo e o SET da função não o rearma. Medido num
--     PostgreSQL 16 local: sessão com 1 s, função com SET de 10 s, cancelada em 1,000 s;
--   - pelo PostgREST (≥ 12.0.0, "#3001, Add `statement_timeout` set on functions"), o limite da
--     função é IÇADO para a transação ANTES da chamada, e o cronômetro já arma com ele. É o caso
--     documentado pelo Supabase ("Function level — This works with the Database REST API").
--     A rota chama a função pelo supabase-js, portanto pelo PostgREST. O PostgREST lê o limite do
--     cache de schema: por isso o NOTIFY pgrst, 'reload schema' no fim.
--
-- POR QUE 35 s — os números, e o que cada um mede:
--   - Postgres 16 LOCAL, payload gerado pelo leitor real com o volume da Wolff (735 itens, 12.116
--     regras, as nove abas com 30.017 insumos; 17,7 MB de JSON): 1,82 s sobre o estado de hoje, e
--     1,91 a 2,25 s em reimportações sobre a tabela cheia. O parse do JSON sozinho: 0,31 s;
--   - PRODUÇÃO, na mesma operação: MAIS DE 8 s (é o que a cancelou). A produção é pelo menos 3,6×
--     mais lenta que o local nesta operação, e a CPU explica só 1,7× (a mesma consulta de JSON,
--     só leitura: 641 a 796 ms lá, 380 a 448 ms aqui). O tempo real em produção NÃO foi medido —
--     só o limite de baixo. A rota passa a registrar a duração da gravação a cada importação;
--   - o TETO: o Supabase documenta 60 s como o máximo configurável para consultas pela API
--     ("Dashboard and Client queries have a max-configurable timeout of 60 seconds"), e no
--     gateway a requisição de 25/10 gastou ~19 s ANTES de o comando começar (18,1 MB de corpo;
--     origin_time 29.046 ms; o cancelamento veio 27 s depois da chegada). 19 + 35 = 54 s, abaixo
--     dos 60 com folga de 6 s.
--   35 s é 4,4× o piso medido em produção (8 s) e 15× o tempo local. Se não bastar, a falha diz
--   "tempo" na tela, e o número certo sai do log da duração.
--
-- O lock_timeout de 8 s (também do authenticator) NÃO ganha valor próprio aqui. O FOR UPDATE em
-- orcamentista_tabela só espera quando outra transação tem lock na MESMA linha: outra importação
-- da mesma tabela (que deve mesmo esperar e desistir), uma edição da tabela, ou a inserção de uma
-- linha filha que a referencie (FOR KEY SHARE), que dura milissegundos. Se acontecer, a rota diz
-- isso na tela (55P03). Ao contrário do statement_timeout, um `SET lock_timeout` na função VALERIA
-- mesmo sem o PostgREST — medido: ele é lido quando a espera pelo lock começa.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) SET statement_timeout = '35s';

-- ── VERIFICAÇÃO — aborta se a função não ficou como declarada ────────────────────────────
DO $verifica$
DECLARE cfg text[];
BEGIN
  SELECT p.proconfig INTO cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'importar_conteudo_da_tabela'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tabela_id uuid, p_payload jsonb';
  IF cfg IS NULL THEN
    RAISE EXCEPTION 'verificacao 1: a funcao importar_conteudo_da_tabela(uuid, jsonb) nao existe, ou nao tem configuracao';
  END IF;
  IF NOT ('statement_timeout=35s' = ANY (cfg)) THEN
    RAISE EXCEPTION 'verificacao 2: a funcao nao tem statement_timeout=35s (proconfig = %)', cfg;
  END IF;
  IF NOT ('search_path=public' = ANY (cfg)) THEN
    RAISE EXCEPTION 'verificacao 3: a funcao perdeu o search_path=public (proconfig = %)', cfg;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('authenticator', 'service_role', 'authenticated', 'anon')
               AND EXISTS (SELECT 1 FROM unnest(rolconfig) c WHERE c LIKE 'statement_timeout=%' AND c NOT IN ('statement_timeout=8s', 'statement_timeout=3s'))) THEN
    RAISE EXCEPTION 'verificacao 4: algum papel da API tem statement_timeout diferente do padrao — esta migracao nao mexe em papel';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
