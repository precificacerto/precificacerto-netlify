-- OS CASOS da 20261106000002, sobre a base com a migração aplicada DUAS vezes. Cada caso diz "ok: …" (NOTICE) ou "FALHOU …" (EXCEPTION).
-- O run.sh conta os "-- CASO " deste arquivo e do 20_depois_de_reaplicar.sql e exige um "ok" por caso.
\set ON_ERROR_STOP 0
create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'aceitou'; exception when others then return sqlstate; end $f$;
create or replace function pg_temp.lev(p_tenant uuid, p_remetente uuid, p_nome text) returns integer language plpgsql as $f$
declare v integer;
begin
  insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    values (p_tenant, p_remetente, p_nome, lower(p_nome), 'EM_MONTAGEM') returning numero into v;
  return v;
end $f$;

-- CASO 1: NADA FOI APAGADO NEM REESCRITO — os 8 levantamentos, os 12 itens e a pergunta em aberto são os da foto, linha a linha (tirando só
-- as colunas novas); o "Maria Cristina" está lá
DO $c$
DECLARE v_dif int; v_lev int; v_itens int; v_maria int;
BEGIN
  SELECT count(*) INTO v_dif FROM (
    SELECT tabela, id, md5 FROM harness_foto
    EXCEPT
    (SELECT 'L', l.id, md5((to_jsonb(l) - ARRAY['numero', 'telefone', 'email', 'edificacao', 'endereco', 'obs_obra', 'data_entrega', 'comissao_percentual',
        'comissao_modo', 'reserva_tecnica_percentual', 'reserva_tecnica_responsavel', 'lucro_projetado_percentual', 'vendedor_nome', 'vendedor_employee_id'])::text) FROM orcamentista_levantamento l
     UNION ALL SELECT 'I', i.id, md5((to_jsonb(i) - ARRAY['ambientes', 'obs'])::text) FROM orcamentista_levantamento_item i
     UNION ALL SELECT 'P', p.remetente_id, md5(to_jsonb(p)::text) FROM orcamentista_pergunta_em_aberto p)) d;
  SELECT count(*) INTO v_lev FROM orcamentista_levantamento;
  SELECT count(*) INTO v_itens FROM orcamentista_levantamento_item;
  SELECT count(*) INTO v_maria FROM orcamentista_levantamento WHERE id = 'c8b56b73-05b3-4d4e-82d0-41ecba58b893' AND nome = 'Maria Cristina';
  IF v_dif = 0 AND v_lev = 8 AND v_itens = 12 AND v_maria = 1 THEN
    RAISE NOTICE 'ok: caso 1 — nada apagado nem reescrito: 8 levantamentos, 12 itens e a pergunta em aberto iguais a foto (fora as colunas novas); o Maria Cristina esta la';
  ELSE RAISE EXCEPTION 'FALHOU caso 1: diferentes=% lev=% itens=% maria=%', v_dif, v_lev, v_itens, v_maria; END IF;
END $c$;

-- CASO 2: os números dos que existiam — por empresa, pela ordem de criado_em (o empate pelo id), não pela de inserção; o contador no próximo
DO $c$
DECLARE v text; v_cont text;
BEGIN
  SELECT string_agg(left(tenant_id::text, 2) || ':' || nome || '=' || numero, ',' ORDER BY tenant_id, numero) INTO v FROM orcamentista_levantamento;
  SELECT string_agg(left(tenant_id::text, 2) || '=' || proximo, ',' ORDER BY tenant_id) INTO v_cont FROM orcamentista_levantamento_contador;
  IF v = '20:Teste 1=1,20:Teste 2=2,20:Teste 3=3,20:Teste 4=4,20:Maria Cristina=5,a0:B mais antigo=1,a0:B mesmo instante 1=2,a0:B mesmo instante 2=3'
     AND v_cont = '20=6,a0=4' THEN
    RAISE NOTICE 'ok: caso 2 — a De Paula fica com 1 a 5 por criado_em (Maria Cristina = 5) e o contador em 6; a outra empresa 1 a 3 (o empate pelo id) e o contador em 4; a sem levantamento sem contador';
  ELSE RAISE EXCEPTION 'FALHOU caso 2: % / contador %', v, v_cont; END IF;
END $c$;

-- CASO 3: cada número dado está no log — antes nulo, depois o número e a marca do preenchimento, o tenant da linha; nada mais foi logado
DO $c$
DECLARE v_ok int; v_total int;
BEGIN
  SELECT count(*) INTO v_ok FROM superadmin_alteracao_log g JOIN orcamentista_levantamento l ON g.chave = l.id::text
    WHERE g.tabela = 'orcamentista_levantamento' AND g.tenant_id = l.tenant_id AND g.antes = '{"numero": null}'::jsonb
      AND g.depois = jsonb_build_object('numero', l.numero, 'preenchimento', '20261106000002');
  SELECT count(*) INTO v_total FROM superadmin_alteracao_log WHERE tabela <> 'outra';
  IF v_ok = 8 AND v_total = 8 THEN RAISE NOTICE 'ok: caso 3 — os 8 numeros dados estao no log (antes nulo, depois o numero e a marca), e nada mais foi logado';
  ELSE RAISE EXCEPTION 'FALHOU caso 3: ok=% total=%', v_ok, v_total; END IF;
END $c$;

-- CASO 4: os novos continuam de onde o contador aponta — a De Paula 6, a outra 4, a empresa sem levantamento 1 — gravados pelo service_role
set role service_role;
insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values
  ('20e08592-f957-4e72-b7eb-251387e34eb9', 'b0000000-0000-0000-0000-000000000002', 'Obra Seis', 'obra seis', 'EM_MONTAGEM');
insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'Obra B', 'obra b', 'EM_MONTAGEM');
insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004', 'Obra C', 'obra c', 'EM_MONTAGEM');
insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004', 'Obra C2', 'obra c2', 'EM_MONTAGEM');
reset role;
DO $c$
DECLARE v text;
BEGIN
  SELECT string_agg(nome || '=' || numero, ',' ORDER BY nome) INTO v FROM orcamentista_levantamento WHERE nome LIKE 'Obra %';
  IF v = 'Obra B=4,Obra C=1,Obra C2=2,Obra Seis=6' THEN RAISE NOTICE 'ok: caso 4 — os novos seguem o contador: De Paula 6, a outra 4, a empresa nova 1 e 2 (gravados pelo service_role)';
  ELSE RAISE EXCEPTION 'FALHOU caso 4: %', v; END IF;
END $c$;

-- CASO 5: o número NUNCA é reaproveitado — apagar o último e criar outro dá o seguinte, não o apagado
DO $c$
DECLARE v_n integer; v_prox integer;
BEGIN
  DELETE FROM orcamentista_levantamento WHERE nome = 'Obra Seis';
  v_n := pg_temp.lev('20e08592-f957-4e72-b7eb-251387e34eb9', 'b0000000-0000-0000-0000-000000000002', 'Obra Sete');
  SELECT proximo INTO v_prox FROM orcamentista_levantamento_contador WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  IF v_n = 7 AND v_prox = 8 THEN RAISE NOTICE 'ok: caso 5 — apagado o 6, o proximo e 7: o numero nunca e reaproveitado';
  ELSE RAISE EXCEPTION 'FALHOU caso 5: novo=% proximo=%', v_n, v_prox; END IF;
END $c$;

-- CASO 6: o número não se informa no INSERT — 22023, nada gravado, o contador intacto
DO $c$
DECLARE v text; v_prox integer; v_n integer;
BEGIN
  v := pg_temp.erro($s$insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado, numero)
    values ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra X', 'obra x', 'EM_MONTAGEM', 99)$s$);
  SELECT proximo INTO v_prox FROM orcamentista_levantamento_contador WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  SELECT count(*) INTO v_n FROM orcamentista_levantamento WHERE nome = 'Obra X';
  IF v = '22023' AND v_prox = 8 AND v_n = 0 THEN RAISE NOTICE 'ok: caso 6 — o numero informado no insert e recusado (22023), sem gravar nem avancar o contador';
  ELSE RAISE EXCEPTION 'FALHOU caso 6: % proximo=% gravou=%', v, v_prox, v_n; END IF;
END $c$;

-- CASO 7: o número e a empresa não mudam; o resto do levantamento se edita (o Maria Cristina continua editável, para o teste de reenvio)
DO $c$
DECLARE v1 text; v2 text; v3 text; v_n integer;
BEGIN
  v1 := pg_temp.erro($s$update orcamentista_levantamento set numero = 50 where id = 'c8b56b73-05b3-4d4e-82d0-41ecba58b893'$s$);
  v2 := pg_temp.erro($s$update orcamentista_levantamento set tenant_id = 'a0000000-0000-0000-0000-000000000002' where nome = 'Obra Sete'$s$);
  v3 := pg_temp.erro($s$update orcamentista_levantamento set telefone = '(51) 99999-0000', estado = 'EM_MONTAGEM' where id = 'c8b56b73-05b3-4d4e-82d0-41ecba58b893'$s$);
  SELECT numero INTO v_n FROM orcamentista_levantamento WHERE id = 'c8b56b73-05b3-4d4e-82d0-41ecba58b893';
  IF v1 = '22023' AND v2 = '22023' AND v3 = 'aceitou' AND v_n = 5 THEN
    RAISE NOTICE 'ok: caso 7 — trocar o numero ou a empresa e recusado (22023); editar o telefone e o estado do Maria Cristina nao toca o numero 5';
  ELSE RAISE EXCEPTION 'FALHOU caso 7: numero=% empresa=% edicao=% n=%', v1, v2, v3, v_n; END IF;
END $c$;

-- CASO 8: o INSERT que falha por outro motivo (o nome repetido) não gasta número
DO $c$
DECLARE v text; v_n integer;
BEGIN
  v := pg_temp.erro($s$insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    values ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Maria Cristina', 'maria cristina', 'EM_MONTAGEM')$s$);
  v_n := pg_temp.lev('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra Oito');
  IF v = '23505' AND v_n = 8 THEN RAISE NOTICE 'ok: caso 8 — o insert recusado pelo nome repetido (23505) nao gasta numero: o seguinte e 8';
  ELSE RAISE EXCEPTION 'FALHOU caso 8: % proximo=%', v, v_n; END IF;
END $c$;

-- CASO 9: as colunas novas nascem nulas e nenhuma tem DEFAULT (o percentual nunca é inventado); só o numero é NOT NULL
DO $c$
DECLARE r record; v_defaults int; v_nulas boolean;
BEGIN
  SELECT count(*) INTO v_defaults FROM information_schema.columns c WHERE c.table_name IN ('orcamentista_levantamento', 'orcamentista_levantamento_item')
    AND c.column_name IN ('numero', 'telefone', 'email', 'edificacao', 'endereco', 'obs_obra', 'data_entrega', 'comissao_percentual', 'comissao_modo',
      'reserva_tecnica_percentual', 'reserva_tecnica_responsavel', 'lucro_projetado_percentual', 'vendedor_nome', 'vendedor_employee_id', 'ambientes', 'obs')
    AND c.column_default IS NOT NULL;
  SELECT * INTO r FROM orcamentista_levantamento WHERE nome = 'Obra Oito';
  v_nulas := r.telefone IS NULL AND r.email IS NULL AND r.edificacao IS NULL AND r.endereco IS NULL AND r.obs_obra IS NULL AND r.data_entrega IS NULL
    AND r.comissao_percentual IS NULL AND r.comissao_modo IS NULL AND r.reserva_tecnica_percentual IS NULL AND r.reserva_tecnica_responsavel IS NULL
    AND r.lucro_projetado_percentual IS NULL AND r.vendedor_nome IS NULL AND r.vendedor_employee_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM orcamentista_levantamento l WHERE l.comissao_percentual IS NOT NULL OR l.lucro_projetado_percentual IS NOT NULL OR l.reserva_tecnica_percentual IS NOT NULL);
  IF v_defaults = 0 AND v_nulas THEN RAISE NOTICE 'ok: caso 9 — nenhuma coluna nova tem DEFAULT; o levantamento novo e os de antes tem os percentuais nulos';
  ELSE RAISE EXCEPTION 'FALHOU caso 9: defaults=% nulas=%', v_defaults, v_nulas; END IF;
END $c$;

-- CASO 10: os três percentuais de 0 a 100 (os limites entram), e o modo só PROPORCIONAL ou CONGELADA — a CHECK do perfil do vendedor
DO $c$
DECLARE v text := ''; c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['comissao_percentual', 'reserva_tecnica_percentual', 'lucro_projetado_percentual'] LOOP
    v := v || c || ':' || pg_temp.erro(format('update orcamentista_levantamento set %I = 0 where nome = %L', c, 'Obra Oito'))
           || '/' || pg_temp.erro(format('update orcamentista_levantamento set %I = 100 where nome = %L', c, 'Obra Oito'))
           || '/' || pg_temp.erro(format('update orcamentista_levantamento set %I = 2.5 where nome = %L', c, 'Obra Oito'))
           || '/' || pg_temp.erro(format('update orcamentista_levantamento set %I = -0.01 where nome = %L', c, 'Obra Oito'))
           || '/' || pg_temp.erro(format('update orcamentista_levantamento set %I = 100.01 where nome = %L', c, 'Obra Oito')) || ' ';
  END LOOP;
  v := v || 'modo:' || pg_temp.erro($s$update orcamentista_levantamento set comissao_modo = 'PROPORCIONAL' where nome = 'Obra Oito'$s$)
         || '/' || pg_temp.erro($s$update orcamentista_levantamento set comissao_modo = 'CONGELADA' where nome = 'Obra Oito'$s$)
         || '/' || pg_temp.erro($s$update orcamentista_levantamento set comissao_modo = 'INSTALLMENT' where nome = 'Obra Oito'$s$)
         || '/' || pg_temp.erro($s$update orcamentista_levantamento set comissao_modo = 'proporcional' where nome = 'Obra Oito'$s$);
  IF v = 'comissao_percentual:aceitou/aceitou/aceitou/23514/23514 reserva_tecnica_percentual:aceitou/aceitou/aceitou/23514/23514 lucro_projetado_percentual:aceitou/aceitou/aceitou/23514/23514 modo:aceitou/aceitou/23514/23514' THEN
    RAISE NOTICE 'ok: caso 10 — percentuais de 0 a 100 (fora: 23514), modo PROPORCIONAL ou CONGELADA (INSTALLMENT e a caixa errada: 23514)';
  ELSE RAISE EXCEPTION 'FALHOU caso 10: %', v; END IF;
END $c$;

-- CASO 11: os textos — sem espaço nas pontas, não vazios, no limite; o e-mail com um "@" e sem espaço
DO $c$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('telefone', 40), ('edificacao', 120), ('endereco', 300), ('obs_obra', 1000), ('reserva_tecnica_responsavel', 120), ('vendedor_nome', 120)) AS t(c, lim) LOOP
    v := v || r.c || ':'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, 'x', 'Obra Oito')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, repeat('x', r.lim), 'Obra Oito')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, 'Rua A, 10' || E'\n' || 'fundos', 'Obra Oito')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, repeat('x', r.lim + 1), 'Obra Oito')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, ' x', 'Obra Oito')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, 'x ', 'Obra Oito')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, E'x\n', 'Obra Oito')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, '', 'Obra Oito')) || ' ';
  END LOOP;
  v := v || 'email:' || pg_temp.erro($s$update orcamentista_levantamento set email = 'cliente@obra.com.br' where nome = 'Obra Oito'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento set email = 'sem-arroba' where nome = 'Obra Oito'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento set email = 'a b@obra.com' where nome = 'Obra Oito'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento set email = 'a@b@c' where nome = 'Obra Oito'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento set email = '' where nome = 'Obra Oito'$s$);
  IF v = replace('telefone:A edificacao:A endereco:A obs_obra:A reserva_tecnica_responsavel:A vendedor_nome:A ', 'A', 'aceitou/aceitou/aceitou/23514/23514/23514/23514/23514')
       || 'email:aceitou/23514/23514/23514/23514' THEN
    RAISE NOTICE 'ok: caso 11 — os seis textos: um caractere, o limite e a quebra de linha no meio entram; acima do limite, espaco ou quebra nas pontas e vazio: 23514; o e-mail com um @ so';
  ELSE RAISE EXCEPTION 'FALHOU caso 11: %', v; END IF;
END $c$;

-- CASO 12: a data de entrega é uma data (date): a de calendário entra, a que não existe não chega a ser valor
DO $c$
DECLARE v1 text; v2 text; v3 text;
BEGIN
  v1 := pg_temp.erro($s$update orcamentista_levantamento set data_entrega = '2026-11-27' where nome = 'Obra Oito'$s$);
  v2 := pg_temp.erro($s$update orcamentista_levantamento set data_entrega = '2027-02-31' where nome = 'Obra Oito'$s$);
  v3 := pg_temp.erro($s$update orcamentista_levantamento set data_entrega = 'em 30 dias' where nome = 'Obra Oito'$s$);
  IF v1 = 'aceitou' AND v2 = '22008' AND v3 = '22007' AND (SELECT data_entrega FROM orcamentista_levantamento WHERE nome = 'Obra Oito') = '2026-11-27' THEN
    RAISE NOTICE 'ok: caso 12 — data_entrega e date: 27/11/2026 entra; 31/02/2027 (22008) e texto (22007) nao';
  ELSE RAISE EXCEPTION 'FALHOU caso 12: % % %', v1, v2, v3; END IF;
END $c$;

-- CASO 13: os ambientes — a lista [{ambiente, quantidade}], não vazia, SEM O MESMO AMBIENTE DUAS VEZES (sem olhar a caixa); cada forma errada recusada
DO $c$
DECLARE v text := ''; a text; v_item uuid;
BEGIN
  INSERT INTO orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, quantidade)
    SELECT tenant_id, id, 1, 'DP-02', 3 FROM orcamentista_levantamento WHERE nome = 'Obra Oito' RETURNING id INTO v_item;
  FOREACH a IN ARRAY ARRAY[
      'null', '[{"ambiente": "Sala", "quantidade": 2}, {"ambiente": "Quarto do casal", "quantidade": 1}]', '[{"quantidade": 1, "ambiente": "Sala"}]',
      '[{"ambiente": "Sala", "quantidade": 1e2}]', '[{"ambiente": "Sala", "quantidade": 2147483647}]', '[{"ambiente": "Sala", "quantidade": 1.0}]',
      '[{"ambiente": "Cozinha", "quantidade": 1}, {"ambiente": "Cozinha 2", "quantidade": 1}]',
      format('[{"ambiente": "%s", "quantidade": 1}]', repeat('x', 80)),
      '{"ambiente": "Sala", "quantidade": 1}', '[]', '[1]', '[{"ambiente": "Sala"}]', '[{"quantidade": 1}]',
      '[{"ambiente": "Sala", "quantidade": 1, "obs": "x"}]', '[{"ambiente": "Sala", "quantidade": 0}]', '[{"ambiente": "Sala", "quantidade": -1}]',
      '[{"ambiente": "Sala", "quantidade": 1.5}]', '[{"ambiente": "Sala", "quantidade": "2"}]', '[{"ambiente": "Sala", "quantidade": 2147483648}]',
      '[{"ambiente": " Sala", "quantidade": 1}]', '[{"ambiente": "Sala ", "quantidade": 1}]', '[{"ambiente": "", "quantidade": 1}]',
      '[{"ambiente": 7, "quantidade": 1}]', '[{"ambiente": null, "quantidade": 1}]', '[{"ambiente": "Sala", "quantidade": null}]',
      format('[{"ambiente": "%s", "quantidade": 1}]', repeat('x', 81)), '[{"ambiente": "Sala", "quantidade": 1}, {"ambiente": "", "quantidade": 1}]',
      '[{"ambiente": "Cozinha", "quantidade": 1}, {"ambiente": "Cozinha", "quantidade": 2}]',
      '[{"ambiente": "Cozinha", "quantidade": 1}, {"ambiente": "Sala", "quantidade": 1}, {"ambiente": "cozinha", "quantidade": 1}]',
      '[{"ambiente": "COZINHA", "quantidade": 1}, {"ambiente": "Cozinha", "quantidade": 1}]'] LOOP
    v := v || pg_temp.erro(format('update orcamentista_levantamento_item set ambientes = %s where id = %L', CASE WHEN a = 'null' THEN 'null' ELSE quote_literal(a) || '::jsonb' END, v_item)) || ',';
  END LOOP;
  IF v = 'aceitou,aceitou,aceitou,aceitou,aceitou,aceitou,aceitou,aceitou,'
         || '23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,' THEN
    RAISE NOTICE 'ok: caso 13 — ambientes: nulo e a lista de {ambiente, quantidade} entram (Cozinha e Cozinha 2 sao dois); as 19 formas erradas e o mesmo ambiente duas vezes (Cozinha/Cozinha, cozinha, COZINHA): 23514';
  ELSE RAISE EXCEPTION 'FALHOU caso 13: %', v; END IF;
END $c$;

-- CASO 14: a obs do item — sem espaço nas pontas, não vazia, até 1.000
DO $c$
DECLARE v text;
BEGIN
  v := pg_temp.erro($s$update orcamentista_levantamento_item set obs = 'com tela' where largura_mm is null and tipologia = 'DP-02'$s$)
    || '/' || pg_temp.erro(format('update orcamentista_levantamento_item set obs = %L where largura_mm is null and tipologia = %L', repeat('x', 1000), 'DP-02'))
    || '/' || pg_temp.erro(format('update orcamentista_levantamento_item set obs = %L where largura_mm is null and tipologia = %L', repeat('x', 1001), 'DP-02'))
    || '/' || pg_temp.erro($s$update orcamentista_levantamento_item set obs = ' com tela' where largura_mm is null and tipologia = 'DP-02'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento_item set obs = '' where largura_mm is null and tipologia = 'DP-02'$s$);
  IF v = 'aceitou/aceitou/23514/23514/23514' THEN RAISE NOTICE 'ok: caso 14 — obs do item: ate 1.000, sem espaco nas pontas, nao vazia';
  ELSE RAISE EXCEPTION 'FALHOU caso 14: %', v; END IF;
END $c$;

-- CASO 15: os privilégios — o service_role grava item com ambientes (a CHECK chama a função); anon e authenticated não leem o contador nem
-- executam as funções; o contador tem RLS
set role service_role;
update orcamentista_levantamento_item set ambientes = '[{"ambiente": "Sala", "quantidade": 3}]' where largura_mm is null and tipologia = 'DP-02';
reset role;
DO $c$
DECLARE v_amb jsonb; v_priv text;
BEGIN
  SELECT ambientes INTO v_amb FROM orcamentista_levantamento_item WHERE largura_mm IS NULL AND tipologia = 'DP-02';
  v_priv := has_table_privilege('anon', 'public.orcamentista_levantamento_contador', 'SELECT')::text || has_table_privilege('authenticated', 'public.orcamentista_levantamento_contador', 'SELECT')::text
    || has_table_privilege('authenticated', 'public.orcamentista_levantamento_contador', 'UPDATE')::text
    || has_function_privilege('anon', 'public.orcamentista_levantamento_numerar()', 'EXECUTE')::text || has_function_privilege('authenticated', 'public.orcamentista_levantamento_numerar()', 'EXECUTE')::text
    || has_function_privilege('anon', 'public.orcamentista_levantamento_ambientes_validos(jsonb)', 'EXECUTE')::text
    || has_function_privilege('authenticated', 'public.orcamentista_levantamento_ambientes_validos(jsonb)', 'EXECUTE')::text
    || has_table_privilege('service_role', 'public.orcamentista_levantamento_contador', 'SELECT')::text
    || (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_levantamento_contador'::regclass)::text;
  IF v_amb = '[{"ambiente": "Sala", "quantidade": 3}]'::jsonb AND v_priv = 'falsefalsefalsefalsefalsefalsefalsetruetrue' THEN
    RAISE NOTICE 'ok: caso 15 — o service_role grava ambientes; anon e authenticated sem o contador e sem as funcoes; o contador com RLS';
  ELSE RAISE EXCEPTION 'FALHOU caso 15: ambientes=% privilegios=%', v_amb, v_priv; END IF;
END $c$;

-- CASO 18: o VENDEDOR do levantamento é um funcionário da MESMA empresa — a FK composta com o tenant_id recusa o de outra empresa e o que não
-- existe; o nulo vale; gravado pelo service_role no INSERT; apagado o funcionário, só o vínculo vira nulo (o nome congelado, a empresa e o
-- número ficam)
set role service_role;
insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado, vendedor_employee_id, vendedor_nome) values
  ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra da Secretaria', 'obra da secretaria', 'EM_MONTAGEM',
   'f0000000-0000-0000-0000-0000000000a2', 'Vendedora A2');
reset role;
DO $c$
DECLARE v1 text; v2 text; v3 text; v4 text; v5 text; r record;
BEGIN
  v1 := pg_temp.erro($s$update orcamentista_levantamento set vendedor_employee_id = 'a4d39679-da09-43e2-b97e-f9f2b783e7a6' where nome = 'Obra Oito'$s$);
  v2 := pg_temp.erro($s$update orcamentista_levantamento set vendedor_employee_id = 'f0000000-0000-0000-0000-0000000000b1' where nome = 'Obra Oito'$s$);
  v3 := pg_temp.erro($s$update orcamentista_levantamento set vendedor_employee_id = 'f0000000-0000-0000-0000-00000000dead' where nome = 'Obra Oito'$s$);
  v4 := pg_temp.erro($s$update orcamentista_levantamento set vendedor_employee_id = null where nome = 'Obra Oito'$s$);
  v5 := pg_temp.erro($s$insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado, vendedor_employee_id)
    values ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'Obra B errada', 'obra b errada', 'EM_MONTAGEM', 'f0000000-0000-0000-0000-0000000000a2')$s$);
  DELETE FROM employees WHERE id = 'f0000000-0000-0000-0000-0000000000a2';
  SELECT * INTO r FROM orcamentista_levantamento WHERE nome = 'Obra da Secretaria';
  IF v1 = 'aceitou' AND v2 = '23503' AND v3 = '23503' AND v4 = 'aceitou' AND v5 = '23503'
     AND r.vendedor_employee_id IS NULL AND r.vendedor_nome = 'Vendedora A2' AND r.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND r.numero = 9 THEN
    RAISE NOTICE 'ok: caso 18 — vendedor da mesma empresa entra (no insert, pelo service_role, e no update); o de outra empresa e o inexistente, 23503; apagado o funcionario, so o vinculo vira nulo (nome, empresa e numero 9 ficam)';
  ELSE RAISE EXCEPTION 'FALHOU caso 18: mesma=% outra=% inexistente=% nulo=% insert_outra=% depois=%/%/%/%', v1, v2, v3, v4, v5, r.vendedor_employee_id, r.vendedor_nome, r.tenant_id, r.numero; END IF;
END $c$;

-- (sem caso) antes de o run.sh reaplicar: o último da De Paula é apagado — a reaplicação semearia o contador com o maior + 1 = 8, e ele
-- tem de ficar em 9 (o caso 16 confere que o contador nunca recua)
delete from orcamentista_levantamento where nome = 'Obra Oito';
