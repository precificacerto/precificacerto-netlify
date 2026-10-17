-- TODA comparação é `IS DISTINCT FROM`, nunca `<>`. Com `<>`, um valor que vira NULL dá
-- `NULL <> x` = NULL, e `IF NULL` não dispara: a mutação "forma sem coalesce" APAGAVA a forma e
-- o caso 4 seguia verde (`assercao-negativa-que-nunca-falha.md`, no SQL).
-- Os casos da …000003. Cada caso é marcado com `-- CASO` (o runner conta), monta o estado,
-- chama, e afirma NO BANCO. `ok:` / `FALHOU:` é o que o runner lê.
\set QUIET on
set client_min_messages = notice;

insert into public.tenants values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b') on conflict do nothing;

create or replace function fx_reset() returns void language sql as $$
  delete from public.parcela_reajuste_log; delete from public.cash_entries; $$;
-- uma parcela; `p_venda` nulo = SEM SÉRIE; `p_pago` nulo = em aberto
create or replace function fx(p_id int, p_venda int, p_valor numeric, p_venc date, p_pago date default null,
                              p_forma public.payment_method default 'BOLETO', p_tenant char default 'a')
returns uuid language sql as $$
  insert into public.cash_entries (id, tenant_id, type, amount, due_date, paid_date, origin_type, origin_id, payment_method)
  values (('00000000-0000-0000-0000-' || lpad(p_id::text,12,'0'))::uuid,
          ('00000000-0000-0000-0000-00000000000' || p_tenant)::uuid, 'INCOME', p_valor, p_venc, p_pago,
          case when p_venda is null then null else 'SALE' end,
          case when p_venda is null then null else ('00000000-0000-0000-0001-' || lpad(p_venda::text,12,'0'))::uuid end,
          p_forma)
  returning id $$;
create or replace function pid(p int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(p::text,12,'0'))::uuid $$;
create or replace function retrato() returns text language sql as $$
  select coalesce(string_agg(right(id::text,4)||'|'||amount||'|'||coalesce(paid_date::text,'-')||'|'||coalesce(payment_method::text,'-'), ';' order by id),'')
         || '#log=' || (select count(*) from public.parcela_reajuste_log) from public.cash_entries $$;
create or replace function autor() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000a1'::uuid $$;
create or replace function ta() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000000a'::uuid $$;
-- chama e devolve 'SQLSTATE|DETAIL|MENSAGEM', ou 'OK|<jsonb>'
create or replace function tentar(sql text) returns text language plpgsql as $$
declare r jsonb; st text; det text; msg text; begin
  execute sql into r; return 'OK|' || r::text;
exception when others then
  get stacked diagnostics st = returned_sqlstate, det = pg_exception_detail, msg = message_text;
  return st || '|' || coalesce(det,'') || '|' || msg;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- CASO 1 — baixa simples na ÚNICA em aberto da série: ACEITA, log com autor, valor intacto
do $$ declare r text; l record; begin
  perform fx_reset();
  perform fx(1,1,100.00,'2026-08-10','2026-08-10'); perform fx(2,1,100.00,'2026-09-10','2026-09-10');
  perform fx(3,1,123.45,'2026-10-10');
  r := tentar(format('select public.dar_baixa_simples(%L, %L, %L, %L, null)', pid(3), ta(), autor(), '2026-10-17'));
  if r not like 'OK|%' then raise exception 'FALHOU 1: recusou: %', r; end if;
  select * into l from public.parcela_reajuste_log;
  if (select count(*) from public.parcela_reajuste_log) is distinct from 1 then raise exception 'FALHOU 1: log com % linhas', (select count(*) from public.parcela_reajuste_log); end if;
  if l.criado_por is distinct from autor() or l.papel is distinct from 'PAGA' or l.valor_antes is distinct from 123.45 or l.valor_depois is distinct from 123.45 or l.delta_da_serie is distinct from 0
     or l.parcela_id is distinct from pid(3) or l.pago_em is distinct from '2026-10-17' then raise exception 'FALHOU 1: linha do log errada: %', row_to_json(l); end if;
  if (select amount from public.cash_entries where id = pid(3)) is distinct from 123.45 then raise exception 'FALHOU 1: amount mudou'; end if;
  if (select paid_date from public.cash_entries where id = pid(3)) is distinct from '2026-10-17' then raise exception 'FALHOU 1: paid_date'; end if;
  raise notice 'ok: 1 — única em aberto da série ACEITA (a aplicada dá PC005); log PAGA 123.45→123.45 delta 0, autor %', right(l.criado_por::text,4);
end $$;

-- CASO 2 — baixa simples SEM SÉRIE (origin_id nulo): ACEITA, log com autor e série nula
do $$ declare r text; l record; begin
  perform fx_reset();
  perform fx(1,null,75.00,'2026-10-10');
  r := tentar(format('select public.dar_baixa_simples(%L, %L, %L, %L, null)', pid(1), ta(), autor(), '2026-10-17'));
  if r not like 'OK|%' then raise exception 'FALHOU 2: recusou: %', r; end if;
  select * into l from public.parcela_reajuste_log;
  if l.criado_por is distinct from autor() or l.serie_origin_id is not null or l.serie_origin_type is not null then raise exception 'FALHOU 2: %', row_to_json(l); end if;
  raise notice 'ok: 2 — sem série ACEITA (a aplicada dá PC002); log com autor e série nula';
end $$;

-- CASO 3 — baixa simples em parcela JÁ PAGA: PC010, nada gravado
do $$ declare r text; antes text; begin
  perform fx_reset();
  perform fx(1,1,100.00,'2026-10-10','2026-10-11','PIX');
  antes := retrato();
  r := tentar(format('select public.dar_baixa_simples(%L, %L, %L, %L, %L)', pid(1), ta(), autor(), '2026-10-17', 'DINHEIRO'));
  if split_part(r,'|',1) is distinct from 'PC010' then raise exception 'FALHOU 3: esperava PC010, veio %', r; end if;
  if retrato() is distinct from antes then raise exception 'FALHOU 3: gravou: % → %', antes, retrato(); end if;
  raise notice 'ok: 3 — já paga recusada com PC010; data, forma e log intactos';
end $$;

-- CASO 4 — forma: NULL preserva a combinada; uma forma dada é gravada
do $$ declare r text; begin
  perform fx_reset();
  perform fx(1,null,10.00,'2026-10-10',null,'BOLETO'); perform fx(2,null,10.00,'2026-10-10',null,'BOLETO');
  r := tentar(format('select public.dar_baixa_simples(%L, %L, %L, %L, null)', pid(1), ta(), autor(), '2026-10-17'));
  r := tentar(format('select public.dar_baixa_simples(%L, %L, %L, %L, %L)', pid(2), ta(), autor(), '2026-10-17', 'PIX'));
  if (select payment_method::text from public.cash_entries where id = pid(1)) is distinct from 'BOLETO' then raise exception 'FALHOU 4: NULL apagou a forma'; end if;
  if (select payment_method::text from public.cash_entries where id = pid(2)) is distinct from 'PIX' then raise exception 'FALHOU 4: PIX não gravou'; end if;
  raise notice 'ok: 4 — forma NULL preserva BOLETO; PIX é gravada';
end $$;

-- CASO 5 — parcela de OUTRO tenant, ou inexistente: PC011, nada gravado
do $$ declare r1 text; r2 text; antes text; begin
  perform fx_reset();
  perform fx(1,null,10.00,'2026-10-10',null,'BOLETO','b');
  antes := retrato();
  r1 := tentar(format('select public.dar_baixa_simples(%L, %L, %L, %L, null)', pid(1), ta(), autor(), '2026-10-17'));
  r2 := tentar(format('select public.dar_baixa_simples(%L, %L, %L, %L, null)', pid(99), ta(), autor(), '2026-10-17'));
  if split_part(r1,'|',1) is distinct from 'PC011' or split_part(r2,'|',1) is distinct from 'PC011' then raise exception 'FALHOU 5: % / %', r1, r2; end if;
  if retrato() is distinct from antes then raise exception 'FALHOU 5: gravou'; end if;
  raise notice 'ok: 5 — outro tenant e inexistente recusados com PC011';
end $$;

-- CASO 6 — autor nulo: PC001, nada gravado — o log não nasce anônimo (simples e lote)
do $$ declare r1 text; r2 text; antes text; begin
  perform fx_reset();
  perform fx(1,null,10.00,'2026-10-10');
  antes := retrato();
  r1 := tentar(format('select public.dar_baixa_simples(%L, %L, null, %L, null)', pid(1), ta(), '2026-10-17'));
  r2 := tentar(format('select public.dar_baixa_em_lote(array[%L]::uuid[], %L, null, %L, array[null]::public.payment_method[])', pid(1), ta(), '2026-10-17'));
  if split_part(r1,'|',1) is distinct from 'PC001' or split_part(r2,'|',1) is distinct from 'PC001' then raise exception 'FALHOU 6: % / %', r1, r2; end if;
  if retrato() is distinct from antes then raise exception 'FALHOU 6: gravou sem autor'; end if;
  raise notice 'ok: 6 — sem autor: PC001 nas duas, nada gravado';
end $$;

-- CASO 7 — LOTE DE 3: as três gravadas, três linhas de log, UMA operação, ids na resposta
do $$ declare r text; j jsonb; begin
  perform fx_reset();
  perform fx(1,1,100.10,'2026-10-10'); perform fx(2,2,200.20,'2026-10-10'); perform fx(3,null,300.30,'2026-10-10');
  r := tentar(format('select public.dar_baixa_em_lote(array[%L,%L,%L]::uuid[], %L, %L, %L, array[null,null,null]::public.payment_method[])',
                     pid(3), pid(1), pid(2), ta(), autor(), '2026-10-17'));
  if r not like 'OK|%' then raise exception 'FALHOU 7: recusou: %', r; end if;
  j := substr(r, 4)::jsonb;
  if (select count(*) from public.cash_entries where paid_date = '2026-10-17') is distinct from 3 then raise exception 'FALHOU 7: não gravou as 3'; end if;
  if (select count(*) from public.parcela_reajuste_log where papel='PAGA' and criado_por = autor()) is distinct from 3 then raise exception 'FALHOU 7: log'; end if;
  if (select count(distinct operacao_id) from public.parcela_reajuste_log) is distinct from 1 then raise exception 'FALHOU 7: mais de uma operação'; end if;
  if (select operacao_id::text from public.parcela_reajuste_log limit 1) is distinct from j->>'operacao_id' then raise exception 'FALHOU 7: operação devolvida não é a do log'; end if;
  if (j->>'gravadas')::int is distinct from 3 or j->'ids' is distinct from to_jsonb(array[pid(1),pid(2),pid(3)]) then raise exception 'FALHOU 7: resposta %', j; end if;
  raise notice 'ok: 7 — lote de 3: 3 pagas, 3 linhas PAGA com autor, 1 operação, ids em ordem';
end $$;

-- CASO 8 — LOTE DE 3 COM A 2ª (em ordem de id) JÁ PAGA: NADA gravado, exceção nomeia a 2ª.
--          A 1ª é processada ANTES da 2ª: ela ter voltado é o que prova uma transação só.
do $$ declare r text; antes text; begin
  perform fx_reset();
  perform fx(1,1,100.00,'2026-10-10'); perform fx(2,1,100.00,'2026-11-10','2026-10-01','PIX'); perform fx(3,1,100.00,'2026-12-10');
  antes := retrato();
  r := tentar(format('select public.dar_baixa_em_lote(array[%L,%L,%L]::uuid[], %L, %L, %L, array[null,null,null]::public.payment_method[])',
                     pid(1), pid(2), pid(3), ta(), autor(), '2026-10-17'));
  if split_part(r,'|',1) is distinct from 'PC010' then raise exception 'FALHOU 8: esperava PC010, veio %', r; end if;
  if split_part(r,'|',2) is distinct from pid(2)::text then raise exception 'FALHOU 8: DETAIL não nomeia a 2ª: %', r; end if;
  if position(pid(2)::text in split_part(r,'|',3)) = 0 then raise exception 'FALHOU 8: mensagem não nomeia a 2ª: %', r; end if;
  if retrato() is distinct from antes then raise exception 'FALHOU 8: gravou parte do lote: % → %', antes, retrato(); end if;
  raise notice 'ok: 8 — 2ª paga: PC010 nomeando %, e NADA gravado (nem a 1ª)', right(pid(2)::text,4);
end $$;

-- CASO 9 — id REPETIDO: PC013, nomeando o id
do $$ declare r text; antes text; begin
  perform fx_reset();
  perform fx(1,1,100.00,'2026-10-10'); perform fx(2,1,100.00,'2026-11-10');
  antes := retrato();
  r := tentar(format('select public.dar_baixa_em_lote(array[%L,%L,%L]::uuid[], %L, %L, %L, array[null,null,null]::public.payment_method[])',
                     pid(1), pid(2), pid(1), ta(), autor(), '2026-10-17'));
  if split_part(r,'|',1) is distinct from 'PC013' or split_part(r,'|',2) is distinct from pid(1)::text then raise exception 'FALHOU 9: %', r; end if;
  if retrato() is distinct from antes then raise exception 'FALHOU 9: gravou'; end if;
  raise notice 'ok: 9 — id repetido: PC013 nomeando %', right(pid(1)::text,4);
end $$;

-- CASO 10 — ARRAY VAZIO: PC012
do $$ declare r text; begin
  r := tentar(format('select public.dar_baixa_em_lote(array[]::uuid[], %L, %L, %L, array[]::public.payment_method[])', ta(), autor(), '2026-10-17'));
  if split_part(r,'|',1) is distinct from 'PC012' then raise exception 'FALHOU 10: %', r; end if;
  r := tentar(format('select public.dar_baixa_em_lote(null, %L, %L, %L, null)', ta(), autor(), '2026-10-17'));
  if split_part(r,'|',1) is distinct from 'PC012' then raise exception 'FALHOU 10 (null): %', r; end if;
  raise notice 'ok: 10 — vazio e nulo: PC012';
end $$;

-- CASO 11 — 51 IDS: PC014; e 50 passam (o limite é inclusivo)
do $$ declare r text; ids uuid[]; formas public.payment_method[]; begin
  perform fx_reset();
  for i in 1..51 loop perform fx(i,1,1.00,'2026-10-10'); end loop;
  select array_agg(pid(i) order by i), array_agg(null::public.payment_method) into ids, formas from generate_series(1,51) i;
  r := tentar(format('select public.dar_baixa_em_lote(%L::uuid[], %L, %L, %L, %L::public.payment_method[])', ids, ta(), autor(), '2026-10-17', formas));
  if split_part(r,'|',1) is distinct from 'PC014' then raise exception 'FALHOU 11: %', r; end if;
  r := tentar(format('select public.dar_baixa_em_lote(%L::uuid[], %L, %L, %L, %L::public.payment_method[])', ids[1:50], ta(), autor(), '2026-10-17', formas[1:50]));
  if r not like 'OK|%' or (substr(r,4)::jsonb->>'gravadas')::int is distinct from 50 then raise exception 'FALHOU 11: 50 não passou: %', left(r,200); end if;
  raise notice 'ok: 11 — 51 ids: PC014; 50 ids: 50 gravadas';
end $$;

-- CASO 12 — FORMAS com cardinalidade diferente: PC015, e nada gravado
do $$ declare r text; antes text; begin
  perform fx_reset();
  perform fx(1,1,100.00,'2026-10-10'); perform fx(2,1,100.00,'2026-11-10');
  antes := retrato();
  r := tentar(format('select public.dar_baixa_em_lote(array[%L,%L]::uuid[], %L, %L, %L, array[%L]::public.payment_method[])',
                     pid(1), pid(2), ta(), autor(), '2026-10-17', 'PIX'));
  if split_part(r,'|',1) is distinct from 'PC015' then raise exception 'FALHOU 12: %', r; end if;
  if retrato() is distinct from antes then raise exception 'FALHOU 12: gravou'; end if;
  raise notice 'ok: 12 — 2 ids e 1 forma: PC015';
end $$;

-- CASO 13 — a FORMA É DA PARCELA, NÃO DA POSIÇÃO: ids fora de ordem, formas paralelas
do $$ declare r text; begin
  perform fx_reset();
  perform fx(1,1,10.00,'2026-10-10',null,'BOLETO'); perform fx(2,1,10.00,'2026-11-10',null,'BOLETO'); perform fx(3,1,10.00,'2026-12-10',null,'BOLETO');
  -- na chamada: 3→PIX, 1→NULL (preserva), 2→DINHEIRO. A função ordena por id; as formas têm de ir junto.
  r := tentar(format('select public.dar_baixa_em_lote(array[%L,%L,%L]::uuid[], %L, %L, %L, array[%L,null,%L]::public.payment_method[])',
                     pid(3), pid(1), pid(2), ta(), autor(), '2026-10-17', 'PIX', 'DINHEIRO'));
  if r not like 'OK|%' then raise exception 'FALHOU 13: %', r; end if;
  if (select string_agg(payment_method::text, ',' order by id) from public.cash_entries) is distinct from 'BOLETO,DINHEIRO,PIX' then
    raise exception 'FALHOU 13: formas trocadas de parcela: %', (select string_agg(payment_method::text, ',' order by id) from public.cash_entries); end if;
  raise notice 'ok: 13 — formas seguem a parcela: 1 BOLETO (preservada), 2 DINHEIRO, 3 PIX';
end $$;

-- CASO 13b — o MESMO, com o atalho do planejador DESLIGADO. A mutação "ordena os ids e não a
--           forma" SOBREVIVEU ao caso 13: o Postgres 16 ordena a entrada uma vez para todos os
--           agregados (`enable_presorted_aggregate`), e as formas saíam ordenadas por acaso do
--           plano. Desligado o atalho, só o `ORDER BY` explícito nos DOIS agregados garante.
do $$ declare r text; begin
  perform fx_reset();
  perform fx(1,1,10.00,'2026-10-10',null,'BOLETO'); perform fx(2,1,10.00,'2026-11-10',null,'BOLETO'); perform fx(3,1,10.00,'2026-12-10',null,'BOLETO');
  set local enable_presorted_aggregate = off;
  r := tentar(format('select public.dar_baixa_em_lote(array[%L,%L,%L]::uuid[], %L, %L, %L, array[%L,null,%L]::public.payment_method[])',
                     pid(3), pid(1), pid(2), ta(), autor(), '2026-10-17', 'PIX', 'DINHEIRO'));
  if r not like 'OK|%' then raise exception 'FALHOU 13b: %', r; end if;
  if (select string_agg(payment_method::text, ',' order by id) from public.cash_entries) is distinct from 'BOLETO,DINHEIRO,PIX' then
    raise exception 'FALHOU 13b: formas trocadas de parcela sem o atalho: %', (select string_agg(payment_method::text, ',' order by id) from public.cash_entries); end if;
  raise notice 'ok: 13b — formas seguem a parcela também sem enable_presorted_aggregate';
end $$;

-- CASO 14 — A SOMA, EM CENTAVOS: a soma devolvida é a soma das parcelas gravadas
do $$ declare r text; j jsonb; begin
  perform fx_reset();
  perform fx(1,1,0.10,'2026-10-10'); perform fx(2,1,0.20,'2026-11-10'); perform fx(3,1,33749.96,'2026-12-10');
  r := tentar(format('select public.dar_baixa_em_lote(array[%L,%L,%L]::uuid[], %L, %L, %L, array[null,null,null]::public.payment_method[])',
                     pid(1), pid(2), pid(3), ta(), autor(), '2026-10-17'));
  if r not like 'OK|%' then raise exception 'FALHOU 14: recusou: %', r; end if;
  j := substr(r, 4)::jsonb;
  if (j->>'soma')::numeric is distinct from (select sum(amount) from public.cash_entries where paid_date = '2026-10-17') or (j->>'soma')::numeric is distinct from 33750.26 then
    raise exception 'FALHOU 14: soma % contra %', j->>'soma', (select sum(amount) from public.cash_entries where paid_date = '2026-10-17'); end if;
  if (select sum(valor_depois) from public.parcela_reajuste_log) is distinct from 33750.26 then raise exception 'FALHOU 14: log não soma'; end if;
  raise notice 'ok: 14 — soma 0,10 + 0,20 + 33.749,96 = % no retorno, nas parcelas e no log', j->>'soma';
end $$;

-- CASO 15 — A APLICADA NÃO FOI TOCADA: o `prosrc` dela segue o de produção
do $$ begin
  if (select md5(prosrc) from pg_proc where proname = 'dar_baixa_com_valor_diferente') is distinct from 'a0f5ddc18383e033817332a10ac558b6' then
    raise exception 'FALHOU 15: o prosrc da aplicada mudou'; end if;
  raise notice 'ok: 15 — md5(prosrc) da aplicada segue a0f5ddc1…';
end $$;

-- CASO 16 — O QUARTO DROP: `orders` com QUATRO políticas, nenhuma *_tenant_*, RLS ligada
do $$ begin
  if (select string_agg(policyname, ',' order by policyname) from pg_policies where tablename='orders') is distinct from 'orders_delete,orders_insert,orders_select,orders_update' then
    raise exception 'FALHOU 16: %', (select string_agg(policyname, ',' order by policyname) from pg_policies where tablename='orders'); end if;
  if not (select relrowsecurity from pg_class where oid='public.orders'::regclass) then raise exception 'FALHOU 16: RLS'; end if;
  raise notice 'ok: 16 — orders: delete, insert, select, update; RLS ligada';
end $$;

-- CASO 17 — O EXECUTE NÃO VAZOU
do $$ declare s text := 'public.dar_baixa_simples(uuid,uuid,uuid,date,public.payment_method)';
             l text := 'public.dar_baixa_em_lote(uuid[],uuid,uuid,date,public.payment_method[])';
             i text := 'public._baixa_simples_na_operacao(uuid,uuid,uuid,date,public.payment_method,uuid)'; begin
  if has_function_privilege('public', s, 'EXECUTE') or has_function_privilege('anon', s, 'EXECUTE') or has_function_privilege('authenticated', s, 'EXECUTE')
     or not has_function_privilege('service_role', s, 'EXECUTE') then raise exception 'FALHOU 17: simples'; end if;
  if has_function_privilege('public', l, 'EXECUTE') or has_function_privilege('anon', l, 'EXECUTE') or has_function_privilege('authenticated', l, 'EXECUTE')
     or not has_function_privilege('service_role', l, 'EXECUTE') then raise exception 'FALHOU 17: lote'; end if;
  if has_function_privilege('public', i, 'EXECUTE') or has_function_privilege('anon', i, 'EXECUTE') or has_function_privilege('authenticated', i, 'EXECUTE')
     or has_function_privilege('service_role', i, 'EXECUTE') then raise exception 'FALHOU 17: interna exposta'; end if;
  raise notice 'ok: 17 — EXECUTE: simples e lote só service_role; interna, ninguém';
end $$;

-- CASO 18 — como service_role, o lote chama a interna (que service_role NÃO pode chamar)
do $$ declare r text; begin
  perform fx_reset();
  perform fx(1,null,5.00,'2026-10-10');
  set local role service_role;
  r := tentar(format('select public.dar_baixa_em_lote(array[%L]::uuid[], %L, %L, %L, array[null]::public.payment_method[])', pid(1), ta(), autor(), '2026-10-17'));
  if r not like 'OK|%' then raise exception 'FALHOU 18: %', r; end if;
  r := tentar(format('select public._baixa_simples_na_operacao(%L, %L, %L, %L, null, gen_random_uuid())', pid(1), ta(), autor(), '2026-10-17'));
  if split_part(r,'|',1) is distinct from '42501' then raise exception 'FALHOU 18: a interna foi chamável por service_role: %', r; end if;
  reset role;
  raise notice 'ok: 18 — service_role chama o lote; a interna direto: 42501';
end $$;
