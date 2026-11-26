-- Os casos da 20261125000001, depois de aplicada. Cada um diz ok ou aborta.
DO $c$
DECLARE n int; ok boolean;
BEGIN
  -- 1. a entrada com a midia (o objeto do evento) entra
  insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, wuzapi_mensagem_id, midia)
    values ('20e08592-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'entrada', '[imagem]', '3EB0705D', '{"tipo":"imagem","mimetype":"image/jpeg"}');
  RAISE NOTICE 'ok: caso 1 - a entrada com a midia (objeto) entra';
  -- 2. as linhas de antes ficaram como estavam, com a midia nula
  SELECT count(*) INTO n FROM public.orcamentista_mensagem WHERE midia IS NULL;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHOU caso 2: % linhas com midia nula, e deviam ser 2', n; END IF;
  RAISE NOTICE 'ok: caso 2 - as linhas de antes ficam, com a midia nula';
  -- 3. a midia numa SAIDA e recusada
  BEGIN
    insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, midia)
      values ('20e08592-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'saida', 'x', '{"tipo":"imagem"}');
    RAISE EXCEPTION 'FALHOU caso 3: a saida com midia entrou';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: caso 3 - a saida com midia e recusada';
  END;
  -- 4. a midia que nao e objeto (lista, texto, numero) e recusada
  FOR ok IN SELECT unnest(ARRAY[true, true, true]) LOOP NULL; END LOOP;
  BEGIN
    insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, midia)
      values ('20e08592-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'entrada', 'x', '[1,2]');
    RAISE EXCEPTION 'FALHOU caso 4: a midia lista entrou';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: caso 4 - a midia que nao e objeto (lista) e recusada';
  END;
  BEGIN
    insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, midia)
      values ('20e08592-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'entrada', 'x', '"imagem"');
    RAISE EXCEPTION 'FALHOU caso 4b: a midia texto entrou';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: caso 4b - a midia texto e recusada';
  END;
  -- 5. a entrada sem midia continua entrando
  insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto) values ('20e08592-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'entrada', 'oi');
  RAISE NOTICE 'ok: caso 5 - a entrada sem midia entra';
  -- 6. os indices de antes, os 4, como estavam
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'orcamentista_mensagem';
  IF n <> 4 THEN RAISE EXCEPTION 'FALHOU caso 6: % indices, e deviam ser 4', n; END IF;
  RAISE NOTICE 'ok: caso 6 - os 4 indices de antes, nenhum a mais';
  -- 7. o comentario da coluna
  IF col_description('public.orcamentista_mensagem'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.orcamentista_mensagem'::regclass AND attname = 'midia')) NOT LIKE '%20261125000001%' THEN
    RAISE EXCEPTION 'FALHOU caso 7: o comentario da coluna';
  END IF;
  RAISE NOTICE 'ok: caso 7 - o comentario da coluna nomeia a migracao';
END
$c$;
