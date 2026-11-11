-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261111000001 — o ÍNDICE DOS DESENHOS DAS TIPOLOGIAS (WVetro): qual imagem do Storage desenha qual tipologia, e sob qual condição.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, depois de ler o arquivo inteiro e
-- ║ conferir o md5. Ao aplicar fora do CLI, o `name` é 20261111000001_desenhos_das_tipologias.
-- ║ CRIA 1 TABELA (orcamentista_tipologia_desenho, vazia) e 1 FUNÇÃO
-- ║ (superadmin_importar_desenhos). NÃO grava dado: nenhuma linha é inserida, alterada ou
-- ║ apagada por esta migração em tabela nenhuma. A IMPORTAÇÃO é outro ato, depois dela.
-- ║ A FUNÇÃO, quando chamada, APAGA E REGRAVA a tabela inteira (ver abaixo, "a importação").
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 11/11/2026: os desenhos do WVetro vão para o Storage em tipologias/<grupo>/<arquivo> (a pasta sai da coluna
-- GRUPO do índice), e o desenho NÃO é um por tipologia: ele é escolhido avaliando uma CONDIÇÃO sobre as variáveis do item — (N=1), (N=2),
-- (HI<>1), (HI=1) and (UT=2), (LM=1). O PDF do orçamento avaliará a condição contra as escolhas gravadas do item (com o avaliador do
-- motor, `avaliarTexto`, sem cópia). Esta tabela guarda o índice canônico para isso.
--
-- O ÍNDICE CANÔNICO — tipologia_desenho.csv, no Drive do dono do produto, 819.243 bytes, sha256
-- 8c68a6d5c195c4247606312f09b8a0fd38b3ecdca5c02f2c32c0ed138b6ac9e7. Conferido em 11/11/2026: 3.190 linhas (2.419 fonte=principal e 771
-- fonte=por_variavel), 1.369 caminhos de imagem distintos, 18 linhas sem arquivo nos zips, 142 códigos DP distintos (codigo_dp) na fonte
-- por_variavel — 143 pela coluna codigo, porque DP-017 e DP-17 caem no mesmo código normalizado.
--
-- AS COLUNAS — todas NULAS e SEM DEFAULT, salvo o id: o vazio do índice fica NULO, nunca zero, nunca "" (ausente-vs-falso):
--   - fonte                 'principal' (o desenho da tipologia) ou 'por_variavel' (o desenho escolhido pela condição);
--   - grupo                 o grupo como o índice o escreve ("Portas revestidas (ACM/lambri)"); a pasta é a forma de caminho dele;
--   - codigo                o código CRU, como veio ("DP-017", "30-FIX-01") — NUNCA normalizado: é a prova de qual veio de onde;
--   - codigo_dp             o código DP NORMALIZADO, ao lado ("DP-17"); nulo na fonte principal, que não o traz. A colisão de grafias
--                           (DP-017 e DP-17) é NOMEADA pela importação e NÃO é fundida: quem decide qual é erro é o dono do produto;
--   - descricao, condicao   como vieram;
--   - liberado_para_venda   'Sim' -> true, 'Não' -> false, vazio -> NULO (a fonte por_variavel não o traz);
--   - caminho_no_storage    tipologias/<grupo>/<arquivo>, ou NULO quando o índice não achou o arquivo nos zips (as 18 linhas).
--   Ficam FORA, de propósito (o pedido nomeou as colunas): arquivo_indice, zip, caminho_no_zip e url_wvetro. Estão no CSV, identificado
--   pelo sha256 que a importação grava no log.
--
-- A IMPORTAÇÃO — superadmin_importar_desenhos(p_por, p_sha256, p_linhas, p_permitir_encolher): APAGA E REGRAVA a tabela inteira, numa
--   transação, sob trava. É o desenho certo aqui (`tabela-que-a-importacao-apaga.md`): TODAS as colunas vêm do índice, nenhuma é de outro
--   dono, e o processo sabe reescrever cada uma. A linha que saiu do índice sai da tabela. Confere que gravou exatamente as linhas que
--   recebeu (aborta se não), recusa chave desconhecida no objeto (nomeando-a), e grava UMA linha no superadmin_alteracao_log com a
--   contagem ANTES (a da tabela) e DEPOIS (a gravada), as recebidas, se encolher foi permitido, e o sha256 do índice. O MESMO sha256 da
--   última importação não apaga nem regrava: devolve 'igual'.
--
-- O PASSADO NÃO DEPENDE DESTA TABELA (dono do produto, 11/11/2026): o custo do orçamento calculado está fotografado em
--   orcamentista_orcamento_item_material, com calculo_id, e o arquivo entregue ao cliente está gravado com sha256. Trocar esta tabela não
--   muda orçamento calculado nem PDF entregue: o valor mora no documento, não num ponteiro para a tabela viva.
--
-- O RISCO É O FUTURO, e por isso a TRAVA DO ENCOLHIMENTO (dono do produto, 11/11/2026): um índice ruim que esvazia ou encolhe a tabela faz
--   os orçamentos NOVOS saírem sem desenho, em silêncio. A função RECUSA o índice com MENOS linhas do que a tabela tem, nomeando os dois
--   números, a menos que receba p_permitir_encolher = true. O parâmetro é OBRIGATÓRIO (sem default) e nulo é recusa: quem chama diz, toda
--   vez, se aceita encolher.
--
-- POR QUE UMA FUNÇÃO NO BANCO, e não delete + insert pela rota com o service_role (a pergunta do dono do produto, 11/11/2026: "Se for só
--   'fica mais limpo', prefiro sem função"). A razão é a ATOMICIDADE, e ela não existe pelo caminho que o app usa:
--   - o único cliente de banco do código do app (src/) é o supabase-js, que fala com o PostgREST. Cada chamada (.delete(), .insert()) é
--     UMA requisição HTTP e UMA transação própria; o PostgREST não abre transação que atravesse duas chamadas. "delete + insert numa
--     transação pelo service_role" não é possível por esse caminho;
--   - em duas chamadas, uma falha entre o DELETE e o INSERT (rede, tempo da função na Vercel, uma linha que a CHECK recusa) deixa a tabela
--     VAZIA — exatamente os orçamentos novos sem desenho, em silêncio, que a trava do encolhimento existe para impedir. E 3.190 linhas num
--     insert só são ~1 MB de JSON; em lotes, cada lote é outra transação;
--   - a outra saída seria uma conexão Postgres direta da rota (o pacote `pg` está no package.json, usado só por scripts de manutenção;
--     nenhum arquivo de src/ o usa). Ela exigiria uma connection string com poder total no ambiente da Vercel: MAIS superfície com poder
--     de apagar, não menos;
--   - a função é a menor superfície que dá a atomicidade: só o service_role a executa, ela só toca esta tabela (e uma linha de log), e a
--     trava do encolhimento e a conferência da contagem moram junto do DELETE, onde não há como pulá-las.
--
-- ACESSO: espelha a orcamentista_motor (medido em produção em 11/11/2026): RLS com as quatro políticas de super admin; nenhum privilégio
--   a PUBLIC, anon ou authenticated; tudo ao service_role. A função é SECURITY DEFINER com search_path fixo e só o service_role a executa
--   (o REVOKE inclui anon e authenticated: o privilégio padrão de produção os daria — a lição da 20261101000002).
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS, políticas recriadas, CREATE OR REPLACE FUNCTION. A guarda aborta se a tabela já existir com
--   outra forma.
-- GUARDA (aborta): is_super_admin() e superadmin_alteracao_log existem; a tabela não existe, ou existe vazia e com as 9 colunas desta.
-- VERIFICAÇÃO (aborta): as 9 colunas com o tipo, nulas e sem default (menos o id); as 3 CHECKs; RLS ligada e as 4 políticas; nenhum
--   privilégio de tabela a PUBLIC, anon ou authenticated; a função de 4 parâmetros SECURITY DEFINER, com search_path, executável só pelo
--   service_role, e o parâmetro de encolher SEM default; a tabela vazia.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  n int;
BEGIN
  IF to_regprocedure('public.is_super_admin()') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: is_super_admin() ou superadmin_alteracao_log. Banco: %, usuario: %. Nada foi alterado.', current_database(), current_user;
  END IF;
  IF to_regclass('public.orcamentista_tipologia_desenho') IS NOT NULL THEN
    SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tipologia_desenho';
    IF n <> 9 THEN
      RAISE EXCEPTION 'orcamentista_tipologia_desenho ja existe com % colunas (esta migracao cria 9). Nada foi alterado.', n;
    END IF;
  END IF;
END
$guarda$;

CREATE TABLE IF NOT EXISTS public.orcamentista_tipologia_desenho (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte               text NULL,
  grupo               text NULL,
  codigo              text NULL,
  codigo_dp           text NULL,
  descricao           text NULL,
  liberado_para_venda boolean NULL,
  condicao            text NULL,
  caminho_no_storage  text NULL,
  CONSTRAINT orcamentista_tipologia_desenho_fonte CHECK (fonte IN ('principal', 'por_variavel')),
  CONSTRAINT orcamentista_tipologia_desenho_codigo_dp_forma CHECK (codigo_dp ~ '^DP-[1-9][0-9]*$'),
  CONSTRAINT orcamentista_tipologia_desenho_caminho_forma CHECK (caminho_no_storage ~ '^tipologias/[a-z0-9]+(-[a-z0-9]+)*/[^/]+$')
);
COMMENT ON TABLE public.orcamentista_tipologia_desenho IS
  'Indice dos desenhos das tipologias (WVetro): qual imagem do Storage desenha qual tipologia, sob qual condicao. Gravada so por superadmin_importar_desenhos (apaga e regrava). 20261111000001.';
COMMENT ON COLUMN public.orcamentista_tipologia_desenho.codigo IS 'O codigo CRU, como veio no indice. Nunca normalizado.';
COMMENT ON COLUMN public.orcamentista_tipologia_desenho.codigo_dp IS 'O codigo DP normalizado (DP-017 -> DP-17), ao lado do cru. Colisoes sao nomeadas pela importacao, nunca fundidas.';
COMMENT ON COLUMN public.orcamentista_tipologia_desenho.caminho_no_storage IS 'tipologias/<grupo>/<arquivo> no bucket atendimentos-ia; NULO quando o indice nao achou o arquivo nos zips.';
CREATE INDEX IF NOT EXISTS orcamentista_tipologia_desenho_codigo_dp_idx ON public.orcamentista_tipologia_desenho (codigo_dp);
CREATE INDEX IF NOT EXISTS orcamentista_tipologia_desenho_codigo_idx ON public.orcamentista_tipologia_desenho (codigo);

ALTER TABLE public.orcamentista_tipologia_desenho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orcamentista_tipologia_desenho_select_super_admin ON public.orcamentista_tipologia_desenho;
DROP POLICY IF EXISTS orcamentista_tipologia_desenho_insert_super_admin ON public.orcamentista_tipologia_desenho;
DROP POLICY IF EXISTS orcamentista_tipologia_desenho_update_super_admin ON public.orcamentista_tipologia_desenho;
DROP POLICY IF EXISTS orcamentista_tipologia_desenho_delete_super_admin ON public.orcamentista_tipologia_desenho;
CREATE POLICY orcamentista_tipologia_desenho_select_super_admin ON public.orcamentista_tipologia_desenho FOR SELECT USING (is_super_admin());
CREATE POLICY orcamentista_tipologia_desenho_insert_super_admin ON public.orcamentista_tipologia_desenho FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY orcamentista_tipologia_desenho_update_super_admin ON public.orcamentista_tipologia_desenho FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY orcamentista_tipologia_desenho_delete_super_admin ON public.orcamentista_tipologia_desenho FOR DELETE USING (is_super_admin());
REVOKE ALL ON public.orcamentista_tipologia_desenho FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.orcamentista_tipologia_desenho TO service_role;

CREATE OR REPLACE FUNCTION public.superadmin_importar_desenhos(p_por uuid, p_sha256 text, p_linhas jsonb, p_permitir_encolher boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes int;
  v_depois int;
  v_recebidas int;
  v_ultimo text;
  v_chave text;
BEGIN
  -- o indice e identificado pelo sha256 do arquivo: sem ele, a importacao nao sabe dizer o que gravou
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sha256 do indice: obrigatorio, 64 caracteres hexadecimais minusculos.' USING ERRCODE = '22023';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'linhas: obrigatorias, uma lista nao vazia.' USING ERRCODE = '22023';
  END IF;
  -- quem chama diz, toda vez, se aceita encolher: nulo nao e "nao", e recusa
  IF p_permitir_encolher IS NULL THEN
    RAISE EXCEPTION 'permitir_encolher: obrigatorio, true ou false.' USING ERRCODE = '22023';
  END IF;
  -- chave desconhecida no objeto e recusa nomeada, nunca ignorada (jsonb_to_recordset a ignoraria em silencio)
  SELECT k INTO v_chave
    FROM jsonb_array_elements(p_linhas) e, jsonb_object_keys(e) k
   WHERE k NOT IN ('fonte', 'grupo', 'codigo', 'codigo_dp', 'descricao', 'liberado_para_venda', 'condicao', 'caminho_no_storage')
   LIMIT 1;
  IF v_chave IS NOT NULL THEN
    RAISE EXCEPTION 'linhas: chave desconhecida "%".', v_chave USING ERRCODE = '22023';
  END IF;

  -- duas importacoes ao mesmo tempo se enfileiram
  PERFORM pg_advisory_xact_lock(hashtext('orcamentista_tipologia_desenho'));

  -- o mesmo indice da ultima importacao: nada a apagar nem a regravar
  SELECT l.chave INTO v_ultimo FROM public.superadmin_alteracao_log l
   WHERE l.tabela = 'orcamentista_tipologia_desenho' ORDER BY l.em DESC LIMIT 1;
  SELECT count(*) INTO v_antes FROM public.orcamentista_tipologia_desenho;
  IF v_ultimo = p_sha256 AND v_antes = jsonb_array_length(p_linhas) THEN
    RETURN jsonb_build_object('resultado', 'igual', 'linhas', v_antes);
  END IF;

  -- A TRAVA DO ENCOLHIMENTO: um indice com menos linhas do que a tabela tem so entra com permissao explicita
  v_recebidas := jsonb_array_length(p_linhas);
  IF v_recebidas < v_antes AND NOT p_permitir_encolher THEN
    RAISE EXCEPTION 'o indice novo tem % linhas e a tabela tem %: encolher exige permitir_encolher = true. Nada foi alterado.', v_recebidas, v_antes
      USING ERRCODE = '22023';
  END IF;

  -- APAGA E REGRAVA: todas as colunas vem do indice (tabela-que-a-importacao-apaga.md: o processo sabe reescrever cada uma)
  DELETE FROM public.orcamentista_tipologia_desenho;
  INSERT INTO public.orcamentista_tipologia_desenho (fonte, grupo, codigo, codigo_dp, descricao, liberado_para_venda, condicao, caminho_no_storage)
  SELECT x.fonte, x.grupo, x.codigo, x.codigo_dp, x.descricao, x.liberado_para_venda, x.condicao, x.caminho_no_storage
    FROM jsonb_to_recordset(p_linhas) AS x(fonte text, grupo text, codigo text, codigo_dp text, descricao text,
                                           liberado_para_venda boolean, condicao text, caminho_no_storage text);
  GET DIAGNOSTICS v_depois = ROW_COUNT;
  IF v_depois <> v_recebidas THEN
    RAISE EXCEPTION 'a importacao gravou % linhas e recebeu %. Nada foi alterado.', v_depois, v_recebidas;
  END IF;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_tipologia_desenho', p_sha256,
          jsonb_build_object('linhas', v_antes),
          jsonb_build_object('linhas', v_depois, 'recebidas', v_recebidas, 'permitir_encolher', p_permitir_encolher,
                             'sha256', p_sha256, 'migracao', '20261111000001'),
          p_por);
  RETURN jsonb_build_object('resultado', 'importado', 'antes', v_antes, 'linhas', v_depois);
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_importar_desenhos(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_importar_desenhos(uuid, text, jsonb, boolean) TO service_role;

DO $verifica$
DECLARE
  n int;
  v_fn record;
BEGIN
  -- as 9 colunas: tipo, nulas e sem default (o id e a chave)
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tipologia_desenho'
     AND (column_name, data_type) IN (('id', 'uuid'), ('fonte', 'text'), ('grupo', 'text'), ('codigo', 'text'), ('codigo_dp', 'text'),
          ('descricao', 'text'), ('liberado_para_venda', 'boolean'), ('condicao', 'text'), ('caminho_no_storage', 'text'));
  IF n <> 9 THEN RAISE EXCEPTION 'verificacao: % de 9 colunas com o tipo esperado.', n; END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tipologia_desenho' AND column_name <> 'id'
     AND (is_nullable <> 'YES' OR column_default IS NOT NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'verificacao: % coluna(s) de dado nao nula ou com default.', n; END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_tipologia_desenho'::regclass AND contype = 'c'
     AND conname IN ('orcamentista_tipologia_desenho_fonte', 'orcamentista_tipologia_desenho_codigo_dp_forma', 'orcamentista_tipologia_desenho_caminho_forma');
  IF n <> 3 THEN RAISE EXCEPTION 'verificacao: % de 3 CHECKs.', n; END IF;
  -- acesso
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_tipologia_desenho'::regclass) THEN
    RAISE EXCEPTION 'verificacao: RLS desligada.';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_tipologia_desenho';
  IF n <> 4 THEN RAISE EXCEPTION 'verificacao: % de 4 politicas.', n; END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tipologia_desenho' AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n <> 0 THEN RAISE EXCEPTION 'verificacao: % privilegio(s) de tabela a PUBLIC, anon ou authenticated.', n; END IF;
  -- a funcao
  SELECT p.prosecdef, p.proconfig INTO v_fn FROM pg_proc p WHERE p.oid = 'public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)'::regprocedure;
  IF NOT v_fn.prosecdef OR v_fn.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_fn.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: a funcao nao e SECURITY DEFINER com search_path fixo.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)'::regprocedure AND pronargdefaults <> 0) THEN
    RAISE EXCEPTION 'verificacao: a funcao tem parametro com default; permitir_encolher tem de ser explicito.';
  END IF;
  IF has_function_privilege('anon', 'public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao: a funcao tem de ser executavel so pelo service_role.';
  END IF;
  -- nenhum dado gravado por esta migracao
  SELECT count(*) INTO n FROM public.orcamentista_tipologia_desenho;
  IF n <> 0 THEN RAISE EXCEPTION 'verificacao: a tabela tem % linha(s); esta migracao nao grava dado.', n; END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
