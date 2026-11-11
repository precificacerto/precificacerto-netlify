-- CASOS do harness da 20261111000001. Cada um diz "ok: ..." (NOTICE) ou "FALHOU ..." (ERROR). O run.sh conta os "-- CASO ".
\set ON_ERROR_STOP 0
-- o retorno de cada chamada fica numa tabela temporária: o psql não interpola variável dentro de $...$
CREATE TEMP TABLE ret (caso int, v jsonb, ids text);
CREATE TEMP TABLE tres AS SELECT $j$[
  {"fonte":"por_variavel","grupo":"PVC","codigo":"DP-017","codigo_dp":"DP-17","descricao":"","condicao":"(N=1)","caminho_no_storage":"tipologias/pvc/00001__X.jpg"},
  {"fonte":"por_variavel","grupo":"PVC","codigo":"DP-17","codigo_dp":"DP-17","descricao":null,"condicao":"(N=2)","caminho_no_storage":"tipologias/pvc/00001__Y.jpg"},
  {"fonte":"principal","grupo":"Alumínio","codigo":"30-FIX-01","codigo_dp":null,"descricao":"PAINEL FIXO COM \"N\" MÓDULOS","liberado_para_venda":false,"condicao":null,"caminho_no_storage":null}
]$j$::jsonb AS v;
GRANT SELECT, INSERT ON ret, tres TO service_role;

-- CASO 1: a migração não grava dado; RLS ligada; nenhum privilégio de tabela a anon/authenticated; a função só para o service_role
DO $c$ BEGIN
  IF (SELECT count(*) FROM orcamentista_tipologia_desenho) <> 0 THEN RAISE EXCEPTION 'FALHOU caso 1: a tabela nasceu com linhas'; END IF;
  IF has_table_privilege('authenticated', 'orcamentista_tipologia_desenho', 'SELECT') OR has_table_privilege('anon', 'orcamentista_tipologia_desenho', 'SELECT') THEN
    RAISE EXCEPTION 'FALHOU caso 1: anon ou authenticated le a tabela (o privilegio padrao nao foi revogado)'; END IF;
  IF has_function_privilege('authenticated', 'superadmin_importar_desenhos(uuid, text, jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU caso 1: authenticated executa a funcao'; END IF;
  IF NOT has_function_privilege('service_role', 'superadmin_importar_desenhos(uuid, text, jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU caso 1: service_role nao executa'; END IF;
  RAISE NOTICE 'ok: caso 1 — vazia, RLS, sem privilegio a anon/authenticated, funcao so do service_role';
END $c$;

-- CASO 2: a importação pelo service_role: as 3 linhas, o CRU ao lado do normalizado (DP-017 e DP-17 NÃO se fundem), o vazio fica como veio,
-- liberado ausente é NULO, caminho ausente é NULO; uma linha de log com o sha256 e as contagens
SET ROLE service_role;
INSERT INTO ret SELECT 2, superadmin_importar_desenhos('00000000-0000-0000-0000-0000000000aa', repeat('a', 64), (SELECT v FROM tres));
RESET ROLE;
DO $c$ DECLARE r jsonb := (SELECT v FROM ret WHERE caso = 2); BEGIN
  IF r->>'resultado' <> 'importado' OR (r->>'linhas')::int <> 3 OR (r->>'antes')::int <> 0 THEN RAISE EXCEPTION 'FALHOU caso 2: retorno %', r; END IF;
  IF (SELECT count(*) FROM orcamentista_tipologia_desenho WHERE codigo_dp = 'DP-17') <> 2
     OR (SELECT array_agg(codigo ORDER BY codigo) FROM orcamentista_tipologia_desenho WHERE codigo_dp = 'DP-17') <> ARRAY['DP-017', 'DP-17'] THEN
    RAISE EXCEPTION 'FALHOU caso 2: o cru e o normalizado nao estao lado a lado'; END IF;
  IF (SELECT descricao FROM orcamentista_tipologia_desenho WHERE codigo = 'DP-017') IS DISTINCT FROM ''
     OR (SELECT descricao FROM orcamentista_tipologia_desenho WHERE codigo = 'DP-17') IS NOT NULL THEN RAISE EXCEPTION 'FALHOU caso 2: o vazio e o nulo nao ficaram como vieram'; END IF;
  IF (SELECT liberado_para_venda FROM orcamentista_tipologia_desenho WHERE codigo = 'DP-17') IS NOT NULL
     OR (SELECT liberado_para_venda FROM orcamentista_tipologia_desenho WHERE codigo = '30-FIX-01') IS DISTINCT FROM false
     OR (SELECT caminho_no_storage FROM orcamentista_tipologia_desenho WHERE codigo = '30-FIX-01') IS NOT NULL THEN RAISE EXCEPTION 'FALHOU caso 2: liberado ou caminho'; END IF;
  IF (SELECT count(*) FROM superadmin_alteracao_log WHERE tabela = 'orcamentista_tipologia_desenho' AND chave = repeat('a', 64)
        AND (antes->>'linhas')::int = 0 AND (depois->>'linhas')::int = 3 AND por = '00000000-0000-0000-0000-0000000000aa') <> 1 THEN RAISE EXCEPTION 'FALHOU caso 2: o log'; END IF;
  RAISE NOTICE 'ok: caso 2 — importa pelo service_role, cru ao lado do normalizado, vazio e nulo como vieram, o log com sha256 e contagens';
END $c$;

-- CASO 3: o MESMO índice outra vez: 'igual' — nada apagado nem regravado (os ids continuam), nenhum log novo
INSERT INTO ret SELECT 3, superadmin_importar_desenhos(NULL, repeat('a', 64), (SELECT v FROM tres)),
  (SELECT string_agg(id::text, ',' ORDER BY id) FROM orcamentista_tipologia_desenho);
DO $c$ DECLARE r jsonb := (SELECT v FROM ret WHERE caso = 3); BEGIN
  IF r->>'resultado' <> 'igual' THEN RAISE EXCEPTION 'FALHOU caso 3: retorno %', r; END IF;
  IF (SELECT string_agg(id::text, ',' ORDER BY id) FROM orcamentista_tipologia_desenho) <> (SELECT ids FROM ret WHERE caso = 3) THEN RAISE EXCEPTION 'FALHOU caso 3: as linhas foram regravadas'; END IF;
  IF (SELECT count(*) FROM superadmin_alteracao_log WHERE tabela = 'orcamentista_tipologia_desenho') <> 1 THEN RAISE EXCEPTION 'FALHOU caso 3: log novo'; END IF;
  RAISE NOTICE 'ok: caso 3 — o mesmo indice: igual, nada apagado nem regravado, nenhum log';
END $c$;

-- CASO 4: OUTRO índice: APAGA E REGRAVA — a linha que saiu do índice sai da tabela; o log diz antes 3, depois 1
INSERT INTO ret SELECT 4, superadmin_importar_desenhos(NULL, repeat('b', 64), '[{"fonte":"principal","grupo":"PVC","codigo":"DP-02","codigo_dp":"DP-2","condicao":null,"caminho_no_storage":"tipologias/pvc/a..jpg"}]'::jsonb);
DO $c$ DECLARE r jsonb := (SELECT v FROM ret WHERE caso = 4); BEGIN
  IF r->>'resultado' <> 'importado' OR (r->>'antes')::int <> 3 OR (r->>'linhas')::int <> 1 THEN RAISE EXCEPTION 'FALHOU caso 4: retorno %', r; END IF;
  IF (SELECT array_agg(codigo) FROM orcamentista_tipologia_desenho) <> ARRAY['DP-02'] THEN RAISE EXCEPTION 'FALHOU caso 4: sobrou linha do indice anterior'; END IF;
  IF (SELECT count(*) FROM superadmin_alteracao_log WHERE chave = repeat('b', 64) AND (antes->>'linhas')::int = 3 AND (depois->>'linhas')::int = 1) <> 1 THEN RAISE EXCEPTION 'FALHOU caso 4: o log'; END IF;
  RAISE NOTICE 'ok: caso 4 — outro indice: apaga e regrava, a linha que saiu sai, o log com antes e depois';
END $c$;

-- CASO 5: as RECUSAS nomeadas, e nenhuma muda a tabela: chave desconhecida, sha256 fora da forma, lista vazia, e as três CHECKs
DO $c$
DECLARE
  antes text := (SELECT string_agg(id::text || codigo, ',') FROM orcamentista_tipologia_desenho);
  pedido record;
  msg text;
BEGIN
  FOR pedido IN SELECT * FROM (VALUES
    (repeat('c', 64), '[{"fonte":"principal","zip":"x.zip"}]', 'chave desconhecida "zip"'),
    ('ABC', '[{"fonte":"principal"}]', 'sha256 do indice'),
    (repeat('c', 64), '[]', 'linhas: obrigatorias'),
    (repeat('c', 64), '[{"fonte":"por_variavel","codigo_dp":"DP-017"}]', 'orcamentista_tipologia_desenho_codigo_dp_forma'),
    (repeat('c', 64), '[{"fonte":"principal","caminho_no_storage":"outra/pasta/x.jpg"}]', 'orcamentista_tipologia_desenho_caminho_forma'),
    (repeat('c', 64), '[{"fonte":"secundaria"}]', 'orcamentista_tipologia_desenho_fonte')
  ) v(sha, linhas, frase) LOOP
    BEGIN
      PERFORM superadmin_importar_desenhos(NULL, pedido.sha, pedido.linhas::jsonb);
      RAISE EXCEPTION 'FALHOU caso 5: aceitou %', pedido.linhas;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
      IF msg LIKE 'FALHOU%' THEN RAISE; END IF;
      IF position(pedido.frase IN msg) = 0 THEN RAISE EXCEPTION 'FALHOU caso 5: esperava "%", veio "%"', pedido.frase, msg; END IF;
    END;
  END LOOP;
  IF (SELECT string_agg(id::text || codigo, ',') FROM orcamentista_tipologia_desenho) <> antes THEN RAISE EXCEPTION 'FALHOU caso 5: uma recusa mudou a tabela'; END IF;
  RAISE NOTICE 'ok: caso 5 — chave desconhecida, sha256, lista vazia e as tres CHECKs recusam nomeando, e a tabela nao muda';
END $c$;
