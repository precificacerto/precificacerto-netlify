-- Os CASOS da 20261103000003 (responde_a na mensagem e o índice da conversa), sobre a base (00_base.sql) com a migração aplicada DUAS vezes.
-- Cada caso roda numa subtransação e se desfaz (P0099). Imprime "ok: ..." ou "FALHOU ...". A contagem dos "-- CASO " é o que o run.sh espera.
\set ON_ERROR_STOP 0
set client_min_messages = notice;

create or replace function pg_temp.t() returns uuid language sql immutable as $$ select 'a0000000-0000-0000-0000-000000000001'::uuid $$;
create or replace function pg_temp.c() returns uuid language sql immutable as $$ select 'c0000000-0000-0000-0000-000000000001'::uuid $$;
create or replace function pg_temp.entrada(k int) returns uuid language sql immutable as $$ select ('d0000000-0000-0000-0000-0000000000' || lpad(k::text, 2, '0'))::uuid $$;

-- CASO 1: a coluna responde_a é uuid, nula, sem default, com o comentário — e as 12 mensagens e a conversa de antes estão intactas, com responde_a nula
do $c$ declare col record; n int; begin
  select data_type, is_nullable, column_default into col from information_schema.columns
   where table_schema = 'public' and table_name = 'orcamentista_mensagem' and column_name = 'responde_a';
  if col is null or col.data_type <> 'uuid' or col.is_nullable <> 'YES' or col.column_default is not null then
    raise exception 'FALHOU caso 1: a coluna: %', col;
  end if;
  if coalesce(col_description('public.orcamentista_mensagem'::regclass, (select attnum from pg_attribute where attrelid = 'public.orcamentista_mensagem'::regclass and attname = 'responde_a')), '') not like '%20261103000003%' then
    raise exception 'FALHOU caso 1: sem o comentario da coluna';
  end if;
  select count(*) into n from public.orcamentista_mensagem where tenant_id = pg_temp.t() and responde_a is null
     and texto like '%de teste numero %' and wuzapi_mensagem_id like 'WA\_%';
  if n <> 12 or (select count(*) from public.orcamentista_mensagem) <> 12 or (select count(*) from public.orcamentista_conversa) <> 1 then
    raise exception 'FALHOU caso 1: as linhas de antes: % intactas de %', n, (select count(*) from public.orcamentista_mensagem);
  end if;
  raise notice 'ok: caso 1 — responde_a uuid, nula, sem default, comentada; as 12 mensagens e a conversa intactas, responde_a nula';
end $c$;

-- CASO 2: a FK: a saída aponta a entrada; um uuid que não é mensagem é recusado (23503); apagar a entrada deixa a saída e zera responde_a (SET NULL)
do $c$ declare s uuid; ok boolean := false; begin
  insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, wuzapi_mensagem_id, responde_a)
    values (pg_temp.t(), pg_temp.c(), 'saida', 'resposta a 1', 'WA_S_NOVA', pg_temp.entrada(1)) returning id into s;
  begin
    insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, responde_a)
      values (pg_temp.t(), pg_temp.c(), 'saida', 'resposta a ninguem', 'e0000000-0000-0000-0000-000000000099');
  exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'FALHOU caso 2: responde_a que nao e mensagem foi aceito'; end if;
  delete from public.orcamentista_mensagem where id = pg_temp.entrada(1);
  if (select responde_a from public.orcamentista_mensagem where id = s) is not null or not exists (select 1 from public.orcamentista_mensagem where id = s) then
    raise exception 'FALHOU caso 2: apagar a entrada nao zerou responde_a (ou apagou a saida)';
  end if;
  raise notice 'ok: caso 2 — a FK aponta a entrada, recusa uuid que nao e mensagem, e apagar a entrada zera responde_a sem apagar a saida';
  raise exception sqlstate 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 3: os índices: responde_a parcial (só preenchidas) e o da conversa (tenant, remetente, criado_em DESC), com a definição; 7 índices nas duas tabelas
do $c$ declare n int; begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'orcamentista_mensagem_responde_a_idx'
                   and indexdef = 'CREATE INDEX orcamentista_mensagem_responde_a_idx ON public.orcamentista_mensagem USING btree (responde_a) WHERE (responde_a IS NOT NULL)') then
    raise exception 'FALHOU caso 3: o indice de responde_a: %', (select indexdef from pg_indexes where indexname = 'orcamentista_mensagem_responde_a_idx');
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'orcamentista_conversa_remetente_idx'
                   and indexdef = 'CREATE INDEX orcamentista_conversa_remetente_idx ON public.orcamentista_conversa USING btree (tenant_id, remetente_id, criado_em DESC)') then
    raise exception 'FALHOU caso 3: o indice da conversa: %', (select indexdef from pg_indexes where indexname = 'orcamentista_conversa_remetente_idx');
  end if;
  select count(*) into n from pg_indexes where schemaname = 'public' and tablename in ('orcamentista_mensagem', 'orcamentista_conversa');
  if n <> 7 then raise exception 'FALHOU caso 3: % indices, e deviam ser 7', n; end if;
  raise notice 'ok: caso 3 — os dois indices com a definicao, e 7 indices no total';
end $c$;

-- CASO 4: a UNIQUE parcial da entrada continua: a mesma (tenant, wuzapi_mensagem_id) de ENTRADA é 23505; a saída com id repetido não é (fora da UNIQUE)
do $c$ declare ok boolean := false; begin
  begin
    insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, wuzapi_mensagem_id) values (pg_temp.t(), pg_temp.c(), 'entrada', 'repetida', 'WA_E1');
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'FALHOU caso 4: a entrada repetida foi aceita'; end if;
  insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, wuzapi_mensagem_id, responde_a) values (pg_temp.t(), pg_temp.c(), 'saida', 'de novo', 'WA_S3', pg_temp.entrada(2));
  raise notice 'ok: caso 4 — a entrada repetida e 23505; a saida com id de envio repetido entra';
  raise exception sqlstate 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 5: as constraints de antes: 5 na mensagem (4 + a FK nova) e 4 na conversa, com as definições
do $c$ declare n int; begin
  select count(*) into n from pg_constraint where conrelid = 'public.orcamentista_mensagem'::regclass;
  if n <> 5 then raise exception 'FALHOU caso 5: % constraints na mensagem', n; end if;
  select count(*) into n from pg_constraint where conrelid = 'public.orcamentista_conversa'::regclass;
  if n <> 4 then raise exception 'FALHOU caso 5: % constraints na conversa', n; end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_mensagem_responde_a_fkey')
     <> 'FOREIGN KEY (responde_a) REFERENCES orcamentista_mensagem(id) ON DELETE SET NULL' then
    raise exception 'FALHOU caso 5: a FK: %', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_mensagem_responde_a_fkey');
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_mensagem_conversa_fkey')
     <> 'FOREIGN KEY (conversa_id, tenant_id) REFERENCES orcamentista_conversa(id, tenant_id) ON DELETE CASCADE' then
    raise exception 'FALHOU caso 5: a FK da conversa mudou';
  end if;
  raise notice 'ok: caso 5 — 5 constraints na mensagem e 4 na conversa, a FK nova ON DELETE SET NULL, a da conversa como era';
end $c$;

-- CASO 6: RLS ligada e não forçada, 4 políticas só de is_super_admin() por tabela, e o service_role com todos os privilégios — como antes
do $c$ declare n int; begin
  if (select count(*) from pg_class where relname in ('orcamentista_mensagem', 'orcamentista_conversa') and relrowsecurity and not relforcerowsecurity) <> 2 then
    raise exception 'FALHOU caso 6: RLS';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename in ('orcamentista_mensagem', 'orcamentista_conversa')
     and coalesce(qual, 'is_super_admin()') = 'is_super_admin()' and coalesce(with_check, 'is_super_admin()') = 'is_super_admin()';
  if n <> 8 then raise exception 'FALHOU caso 6: % politicas de is_super_admin', n; end if;
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'service_role'
     and table_name in ('orcamentista_mensagem', 'orcamentista_conversa');
  if n <> 14 then raise exception 'FALHOU caso 6: % privilegios do service_role, e deviam ser 14', n; end if;
  raise notice 'ok: caso 6 — RLS ligada e nao forcada, 8 politicas de is_super_admin, 14 privilegios do service_role';
end $c$;
