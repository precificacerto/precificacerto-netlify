-- OS CASOS da 20261106000002, sobre a base com a migração aplicada DUAS vezes. Cada caso diz "ok: …" (NOTICE) ou "FALHOU …" (EXCEPTION).
-- O run.sh conta os "-- CASO " deste arquivo e exige um "ok" por caso.
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

-- CASO 1: o apagamento — os 5 e os 11 saíram, cada linha no log com a marca, o tenant e a linha inteira; a pergunta que citava sai, a outra fica
DO $c$
DECLARE v_lev int; v_itens int; v_perg int; v_log_lev int; v_log_item int; v_log_perg int; v_outro int; v_fica int;
BEGIN
  SELECT count(*) INTO v_lev FROM orcamentista_levantamento;
  SELECT count(*) INTO v_itens FROM orcamentista_levantamento_item;
  SELECT count(*) INTO v_perg FROM orcamentista_pergunta_em_aberto WHERE remetente_id = '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2';
  SELECT count(*) INTO v_fica FROM orcamentista_pergunta_em_aberto WHERE remetente_id = 'b0000000-0000-0000-0000-000000000002';
  SELECT count(*) INTO v_log_lev FROM superadmin_alteracao_log WHERE tabela = 'orcamentista_levantamento' AND antes ->> 'remocao' = '20261106000002'
    AND depois IS NULL AND tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND antes ->> 'nome' LIKE 'Teste _' AND chave = antes ->> 'id';
  SELECT count(*) INTO v_log_item FROM superadmin_alteracao_log WHERE tabela = 'orcamentista_levantamento_item' AND antes ->> 'remocao' = '20261106000002'
    AND depois IS NULL AND antes ->> 'tipologia' = 'DP-02' AND antes ? 'levantamento_id';
  SELECT count(*) INTO v_log_perg FROM superadmin_alteracao_log WHERE tabela = 'orcamentista_pergunta_em_aberto' AND antes ->> 'remocao' = '20261106000002';
  SELECT count(*) INTO v_outro FROM superadmin_alteracao_log WHERE tabela = 'outra';
  IF v_lev = 0 AND v_itens = 0 AND v_perg = 0 AND v_fica = 1 AND v_log_lev = 5 AND v_log_item = 11 AND v_log_perg = 1 AND v_outro = 1 THEN
    RAISE NOTICE 'ok: caso 1 — 5 levantamentos, 11 itens e 1 pergunta apagados e logados (a linha inteira, a marca, o tenant); a outra pergunta e o log de antes ficam';
  ELSE RAISE EXCEPTION 'FALHOU caso 1: lev=% itens=% perg=% fica=% log=%/%/% outro=%', v_lev, v_itens, v_perg, v_fica, v_log_lev, v_log_item, v_log_perg, v_outro; END IF;
END $c$;

-- CASO 2: o número é por empresa, começa em 1 e sobe de 1 em 1 — gravado pelo service_role, como a conversa grava
set role service_role;
insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values
  ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra Um', 'obra um', 'EM_MONTAGEM');
insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values
  ('20e08592-f957-4e72-b7eb-251387e34eb9', 'b0000000-0000-0000-0000-000000000002', 'Obra Dois', 'obra dois', 'EM_MONTAGEM');
insert into public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado) values
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'Obra Um', 'obra um', 'EM_MONTAGEM');
reset role;
DO $c$
DECLARE v text;
BEGIN
  SELECT string_agg(left(tenant_id::text, 2) || ':' || nome || '=' || numero, ',' ORDER BY tenant_id, numero) INTO v FROM orcamentista_levantamento;
  IF v = '20:Obra Um=1,20:Obra Dois=2,a0:Obra Um=1' THEN RAISE NOTICE 'ok: caso 2 — o numero e por empresa: a De Paula 1 e 2, a outra 1 (gravado pelo service_role)';
  ELSE RAISE EXCEPTION 'FALHOU caso 2: %', v; END IF;
END $c$;

-- CASO 3: o número NUNCA é reaproveitado — apagar o último e criar outro dá o seguinte, não o apagado
DO $c$
DECLARE v_n integer; v_ultimo integer;
BEGIN
  DELETE FROM orcamentista_levantamento WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND numero = 2;
  v_n := pg_temp.lev('20e08592-f957-4e72-b7eb-251387e34eb9', 'b0000000-0000-0000-0000-000000000002', 'Obra Tres');
  SELECT ultimo INTO v_ultimo FROM orcamentista_levantamento_contador WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  IF v_n = 3 AND v_ultimo = 3 THEN RAISE NOTICE 'ok: caso 3 — apagado o 2, o proximo e 3: o numero nunca e reaproveitado';
  ELSE RAISE EXCEPTION 'FALHOU caso 3: novo=% ultimo=%', v_n, v_ultimo; END IF;
END $c$;

-- CASO 4: o número não se informa no INSERT — 22023, nada gravado, o contador intacto
DO $c$
DECLARE v text; v_ultimo integer; v_n integer;
BEGIN
  v := pg_temp.erro($s$insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado, numero)
    values ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra X', 'obra x', 'EM_MONTAGEM', 99)$s$);
  SELECT ultimo INTO v_ultimo FROM orcamentista_levantamento_contador WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  SELECT count(*) INTO v_n FROM orcamentista_levantamento WHERE nome = 'Obra X';
  IF v = '22023' AND v_ultimo = 3 AND v_n = 0 THEN RAISE NOTICE 'ok: caso 4 — o numero informado no insert e recusado (22023), sem gravar nem avancar o contador';
  ELSE RAISE EXCEPTION 'FALHOU caso 4: % ultimo=% gravou=%', v, v_ultimo, v_n; END IF;
END $c$;

-- CASO 5: o número e a empresa não mudam; o resto do levantamento se edita
DO $c$
DECLARE v1 text; v2 text; v3 text; v_n integer;
BEGIN
  v1 := pg_temp.erro($s$update orcamentista_levantamento set numero = 50 where nome = 'Obra Um' and tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9'$s$);
  v2 := pg_temp.erro($s$update orcamentista_levantamento set tenant_id = 'a0000000-0000-0000-0000-000000000002' where nome = 'Obra Tres'$s$);
  v3 := pg_temp.erro($s$update orcamentista_levantamento set telefone = '(51) 99999-0000', estado = 'COMPLETO' where nome = 'Obra Um' and tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9'$s$);
  SELECT numero INTO v_n FROM orcamentista_levantamento WHERE nome = 'Obra Um' AND tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  IF v1 = '22023' AND v2 = '22023' AND v3 = 'aceitou' AND v_n = 1 THEN RAISE NOTICE 'ok: caso 5 — trocar o numero ou a empresa e recusado (22023); editar o telefone e o estado nao toca o numero';
  ELSE RAISE EXCEPTION 'FALHOU caso 5: numero=% empresa=% edicao=% n=%', v1, v2, v3, v_n; END IF;
END $c$;

-- CASO 6: o INSERT que falha por outro motivo (o nome repetido) não gasta número
DO $c$
DECLARE v text; v_n integer;
BEGIN
  v := pg_temp.erro($s$insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    values ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra Um', 'obra um', 'EM_MONTAGEM')$s$);
  v_n := pg_temp.lev('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra Quatro');
  IF v = '23505' AND v_n = 4 THEN RAISE NOTICE 'ok: caso 6 — o insert recusado pelo nome repetido (23505) nao gasta numero: o seguinte e 4';
  ELSE RAISE EXCEPTION 'FALHOU caso 6: % proximo=%', v, v_n; END IF;
END $c$;

-- CASO 7: as colunas novas nascem nulas e nenhuma tem DEFAULT (o percentual nunca é inventado); só o numero é NOT NULL
DO $c$
DECLARE r record; v_defaults int; v_nulas boolean;
BEGIN
  SELECT count(*) INTO v_defaults FROM information_schema.columns c WHERE c.table_name IN ('orcamentista_levantamento', 'orcamentista_levantamento_item')
    AND c.column_name IN ('numero', 'telefone', 'email', 'edificacao', 'endereco', 'obs_obra', 'data_entrega', 'comissao_percentual', 'comissao_modo',
      'reserva_tecnica_percentual', 'reserva_tecnica_responsavel', 'lucro_projetado_percentual', 'vendedor_nome', 'ambientes', 'obs')
    AND c.column_default IS NOT NULL;
  SELECT * INTO r FROM orcamentista_levantamento WHERE nome = 'Obra Quatro';
  v_nulas := r.telefone IS NULL AND r.email IS NULL AND r.edificacao IS NULL AND r.endereco IS NULL AND r.obs_obra IS NULL AND r.data_entrega IS NULL
    AND r.comissao_percentual IS NULL AND r.comissao_modo IS NULL AND r.reserva_tecnica_percentual IS NULL AND r.reserva_tecnica_responsavel IS NULL
    AND r.lucro_projetado_percentual IS NULL AND r.vendedor_nome IS NULL;
  IF v_defaults = 0 AND v_nulas THEN RAISE NOTICE 'ok: caso 7 — nenhuma coluna nova tem DEFAULT, e o levantamento criado sem elas as tem nulas';
  ELSE RAISE EXCEPTION 'FALHOU caso 7: defaults=% nulas=%', v_defaults, v_nulas; END IF;
END $c$;

-- CASO 8: os três percentuais de 0 a 100 (os limites entram), e o modo só PROPORCIONAL ou CONGELADA — a CHECK do perfil do vendedor
DO $c$
DECLARE v text := ''; c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['comissao_percentual', 'reserva_tecnica_percentual', 'lucro_projetado_percentual'] LOOP
    v := v || c || ':' || pg_temp.erro(format('update orcamentista_levantamento set %I = 0 where nome = %L', c, 'Obra Quatro'))
           || '/' || pg_temp.erro(format('update orcamentista_levantamento set %I = 100 where nome = %L', c, 'Obra Quatro'))
           || '/' || pg_temp.erro(format('update orcamentista_levantamento set %I = 2.5 where nome = %L', c, 'Obra Quatro'))
           || '/' || pg_temp.erro(format('update orcamentista_levantamento set %I = -0.01 where nome = %L', c, 'Obra Quatro'))
           || '/' || pg_temp.erro(format('update orcamentista_levantamento set %I = 100.01 where nome = %L', c, 'Obra Quatro')) || ' ';
  END LOOP;
  v := v || 'modo:' || pg_temp.erro($s$update orcamentista_levantamento set comissao_modo = 'PROPORCIONAL' where nome = 'Obra Quatro'$s$)
         || '/' || pg_temp.erro($s$update orcamentista_levantamento set comissao_modo = 'CONGELADA' where nome = 'Obra Quatro'$s$)
         || '/' || pg_temp.erro($s$update orcamentista_levantamento set comissao_modo = 'INSTALLMENT' where nome = 'Obra Quatro'$s$)
         || '/' || pg_temp.erro($s$update orcamentista_levantamento set comissao_modo = 'proporcional' where nome = 'Obra Quatro'$s$);
  IF v = 'comissao_percentual:aceitou/aceitou/aceitou/23514/23514 reserva_tecnica_percentual:aceitou/aceitou/aceitou/23514/23514 lucro_projetado_percentual:aceitou/aceitou/aceitou/23514/23514 modo:aceitou/aceitou/23514/23514' THEN
    RAISE NOTICE 'ok: caso 8 — percentuais de 0 a 100 (fora: 23514), modo PROPORCIONAL ou CONGELADA (INSTALLMENT e a caixa errada: 23514)';
  ELSE RAISE EXCEPTION 'FALHOU caso 8: %', v; END IF;
END $c$;

-- CASO 9: os textos — sem espaço nas pontas, não vazios, no limite; o e-mail com um "@" e sem espaço
DO $c$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('telefone', 40), ('edificacao', 120), ('endereco', 300), ('obs_obra', 1000), ('reserva_tecnica_responsavel', 120), ('vendedor_nome', 120)) AS t(c, lim) LOOP
    v := v || r.c || ':'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, 'x', 'Obra Quatro')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, repeat('x', r.lim), 'Obra Quatro')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, 'Rua A, 10' || E'\n' || 'fundos', 'Obra Quatro')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, repeat('x', r.lim + 1), 'Obra Quatro')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, ' x', 'Obra Quatro')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, 'x ', 'Obra Quatro')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, E'x\n', 'Obra Quatro')) || '/'
      || pg_temp.erro(format('update orcamentista_levantamento set %I = %L where nome = %L', r.c, '', 'Obra Quatro')) || ' ';
  END LOOP;
  v := v || 'email:' || pg_temp.erro($s$update orcamentista_levantamento set email = 'cliente@obra.com.br' where nome = 'Obra Quatro'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento set email = 'sem-arroba' where nome = 'Obra Quatro'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento set email = 'a b@obra.com' where nome = 'Obra Quatro'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento set email = 'a@b@c' where nome = 'Obra Quatro'$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento set email = '' where nome = 'Obra Quatro'$s$);
  IF v = replace('telefone:A edificacao:A endereco:A obs_obra:A reserva_tecnica_responsavel:A vendedor_nome:A ', 'A', 'aceitou/aceitou/aceitou/23514/23514/23514/23514/23514')
       || 'email:aceitou/23514/23514/23514/23514' THEN
    RAISE NOTICE 'ok: caso 9 — os seis textos: um caractere, o limite e a quebra de linha no meio entram; acima do limite, espaco ou quebra nas pontas e vazio: 23514; o e-mail com um @ so';
  ELSE RAISE EXCEPTION 'FALHOU caso 9: %', v; END IF;
END $c$;

-- CASO 10: a data de entrega é uma data (date): a de calendário entra, a que não existe não chega a ser valor
DO $c$
DECLARE v1 text; v2 text; v3 text;
BEGIN
  v1 := pg_temp.erro($s$update orcamentista_levantamento set data_entrega = '2026-11-27' where nome = 'Obra Quatro'$s$);
  v2 := pg_temp.erro($s$update orcamentista_levantamento set data_entrega = '2027-02-31' where nome = 'Obra Quatro'$s$);
  v3 := pg_temp.erro($s$update orcamentista_levantamento set data_entrega = 'em 30 dias' where nome = 'Obra Quatro'$s$);
  IF v1 = 'aceitou' AND v2 = '22008' AND v3 = '22007' AND (SELECT data_entrega FROM orcamentista_levantamento WHERE nome = 'Obra Quatro') = '2026-11-27' THEN
    RAISE NOTICE 'ok: caso 10 — data_entrega e date: 27/11/2026 entra; 31/02/2027 (22008) e texto (22007) nao';
  ELSE RAISE EXCEPTION 'FALHOU caso 10: % % %', v1, v2, v3; END IF;
END $c$;

-- CASO 11: os ambientes — a lista [{ambiente, quantidade}], não vazia; e cada forma errada recusada
DO $c$
DECLARE v text := ''; a text; v_item uuid;
BEGIN
  INSERT INTO orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, quantidade)
    SELECT tenant_id, id, 1, 'DP-02', 3 FROM orcamentista_levantamento WHERE nome = 'Obra Quatro' RETURNING id INTO v_item;
  FOREACH a IN ARRAY ARRAY[
      'null', '[{"ambiente": "Sala", "quantidade": 2}, {"ambiente": "Quarto do casal", "quantidade": 1}]', '[{"quantidade": 1, "ambiente": "Sala"}]',
      '[{"ambiente": "Sala", "quantidade": 1e2}]', '[{"ambiente": "Sala", "quantidade": 2147483647}]', '[{"ambiente": "Sala", "quantidade": 1.0}]',
      '{"ambiente": "Sala", "quantidade": 1}', '[]', '[1]', '[{"ambiente": "Sala"}]', '[{"quantidade": 1}]',
      '[{"ambiente": "Sala", "quantidade": 1, "obs": "x"}]', '[{"ambiente": "Sala", "quantidade": 0}]', '[{"ambiente": "Sala", "quantidade": -1}]',
      '[{"ambiente": "Sala", "quantidade": 1.5}]', '[{"ambiente": "Sala", "quantidade": "2"}]', '[{"ambiente": "Sala", "quantidade": 2147483648}]',
      '[{"ambiente": " Sala", "quantidade": 1}]', '[{"ambiente": "Sala ", "quantidade": 1}]', '[{"ambiente": "", "quantidade": 1}]',
      '[{"ambiente": 7, "quantidade": 1}]', '[{"ambiente": null, "quantidade": 1}]', '[{"ambiente": "Sala", "quantidade": null}]',
      format('[{"ambiente": "%s", "quantidade": 1}]', repeat('x', 80)), format('[{"ambiente": "%s", "quantidade": 1}]', repeat('x', 81)),
      '[{"ambiente": "Sala", "quantidade": 1}, {"ambiente": "", "quantidade": 1}]'] LOOP
    v := v || pg_temp.erro(format('update orcamentista_levantamento_item set ambientes = %s where id = %L', CASE WHEN a = 'null' THEN 'null' ELSE quote_literal(a) || '::jsonb' END, v_item)) || ',';
  END LOOP;
  IF v = 'aceitou,aceitou,aceitou,aceitou,aceitou,aceitou,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,23514,aceitou,23514,23514,' THEN
    RAISE NOTICE 'ok: caso 11 — ambientes: nulo, a lista de objetos {ambiente, quantidade} (inteiro de 1 ao maior integer; 80 caracteres) entram; as 19 formas erradas, 23514';
  ELSE RAISE EXCEPTION 'FALHOU caso 11: %', v; END IF;
END $c$;

-- CASO 12: a obs do item — sem espaço nas pontas, não vazia, até 1.000
DO $c$
DECLARE v text;
BEGIN
  v := pg_temp.erro($s$update orcamentista_levantamento_item set obs = 'com tela' where ordem = 1$s$)
    || '/' || pg_temp.erro(format('update orcamentista_levantamento_item set obs = %L where ordem = 1', repeat('x', 1000)))
    || '/' || pg_temp.erro(format('update orcamentista_levantamento_item set obs = %L where ordem = 1', repeat('x', 1001)))
    || '/' || pg_temp.erro($s$update orcamentista_levantamento_item set obs = ' com tela' where ordem = 1$s$)
    || '/' || pg_temp.erro($s$update orcamentista_levantamento_item set obs = '' where ordem = 1$s$);
  IF v = 'aceitou/aceitou/23514/23514/23514' THEN RAISE NOTICE 'ok: caso 12 — obs do item: ate 1.000, sem espaco nas pontas, nao vazia';
  ELSE RAISE EXCEPTION 'FALHOU caso 12: %', v; END IF;
END $c$;

-- CASO 13: os privilégios — o service_role grava item com ambientes (a CHECK chama a função); anon e authenticated não leem o contador nem
-- executam as funções; o contador tem RLS
set role service_role;
update orcamentista_levantamento_item set ambientes = '[{"ambiente": "Sala", "quantidade": 3}]' where ordem = 1;
reset role;
DO $c$
DECLARE v_amb jsonb; v_priv text;
BEGIN
  SELECT ambientes INTO v_amb FROM orcamentista_levantamento_item WHERE ordem = 1;
  v_priv := has_table_privilege('anon', 'public.orcamentista_levantamento_contador', 'SELECT')::text || has_table_privilege('authenticated', 'public.orcamentista_levantamento_contador', 'SELECT')::text
    || has_table_privilege('authenticated', 'public.orcamentista_levantamento_contador', 'UPDATE')::text
    || has_function_privilege('anon', 'public.orcamentista_levantamento_numerar()', 'EXECUTE')::text || has_function_privilege('authenticated', 'public.orcamentista_levantamento_numerar()', 'EXECUTE')::text
    || has_function_privilege('anon', 'public.orcamentista_levantamento_ambientes_validos(jsonb)', 'EXECUTE')::text
    || has_function_privilege('authenticated', 'public.orcamentista_levantamento_ambientes_validos(jsonb)', 'EXECUTE')::text
    || has_table_privilege('service_role', 'public.orcamentista_levantamento_contador', 'SELECT')::text
    || (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_levantamento_contador'::regclass)::text;
  IF v_amb = '[{"ambiente": "Sala", "quantidade": 3}]'::jsonb AND v_priv = 'falsefalsefalsefalsefalsefalsefalsetruetrue' THEN
    RAISE NOTICE 'ok: caso 13 — o service_role grava ambientes; anon e authenticated sem o contador e sem as funcoes; o contador com RLS';
  ELSE RAISE EXCEPTION 'FALHOU caso 13: ambientes=% privilegios=%', v_amb, v_priv; END IF;
END $c$;

