-- Os casos da migração do Orçamentista. `ok:` / `FALHOU:` é o que o runner lê; cada caso é
-- marcado com `-- CASO` (o runner conta). Comparações com `IS DISTINCT FROM`, nunca `<>`.
\set QUIET on
set client_min_messages = notice;

-- Duas contas, um usuário em cada, e o super admin (sem tenant).
insert into public.tenants values ('00000000-0000-0000-0000-00000000000a', 'Indústria '), ('00000000-0000-0000-0000-00000000000b', null);
insert into public.users values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'a@x', 'admin', false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'b@x', 'admin', false),
  ('00000000-0000-0000-0000-0000000000f1', null, 's@x', 'super_admin', true);
insert into public.tenant_settings (tenant_id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

-- Executa `sql` como `authenticated` com o `sub` dado (NULL = anon) e devolve 'OK|<linhas>' ou
-- 'SQLSTATE|mensagem'. As linhas afetadas importam: UPDATE barrado por RLS não erra, devolve 0.
create function como(quem uuid, sql text) returns text language plpgsql as $$
declare n bigint; st text; msg text; begin
  if quem is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
  perform set_config('request.jwt.claims', case when quem is null then '' else json_build_object('sub', quem)::text end, true);
  execute sql; get diagnostics n = row_count;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  return 'OK|' || n;
exception when others then
  get stacked diagnostics st = returned_sqlstate, msg = message_text;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  return st || '|' || msg;
end $$;
-- A ROTA: executa `sql` como `service_role` (BYPASSRLS, sem `sub` — `auth.uid()` nulo), como o
-- `supabaseAdmin`. Devolve 'OK|<linhas>' ou 'SQLSTATE|mensagem'.
create function pela_rota(sql text) returns text language plpgsql as $$
declare n bigint; st text; msg text; begin
  execute 'set local role service_role'; perform set_config('request.jwt.claims', '', true);
  execute sql; get diagnostics n = row_count;
  execute 'reset role';
  return 'OK|' || n;
exception when others then
  get stacked diagnostics st = returned_sqlstate, msg = message_text;
  execute 'reset role';
  return st || '|' || msg;
end $$;
-- O mesmo, para SELECT count(*): devolve o número.
create function conta(quem uuid, sql text) returns text language plpgsql as $$
declare n bigint; st text; begin
  if quem is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
  perform set_config('request.jwt.claims', case when quem is null then '' else json_build_object('sub', quem)::text end, true);
  execute sql into n;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  return n::text;
exception when others then
  get stacked diagnostics st = returned_sqlstate;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  return 'ERRO ' || st;
end $$;
create function sa() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000f1'::uuid $$;
create function ua() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000a1'::uuid $$;
create function ub() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000b1'::uuid $$;
create function ta() returns text language sql as $$ select '00000000-0000-0000-0000-00000000000a' $$;
create function tb() returns text language sql as $$ select '00000000-0000-0000-0000-00000000000b' $$;
-- O upsert da rota, reconstruído: `INSERT ... ON CONFLICT (tenant_id) DO UPDATE SET` as colunas do
-- payload — o que o PostgREST faz com `upsert(linha, { onConflict: 'tenant_id' })`.
create function upsert_da_rota(conta text, ativo boolean, autor uuid, quando timestamptz, carimba_ativacao boolean) returns text language sql as $$
  select pela_rota(case when carimba_ativacao then
    format($q$insert into public.orcamentista_config (tenant_id, ativo, valor_adicional_brl, teto_de_consumo_brl, acao_ao_atingir_teto, atualizado_por, atualizado_em, ativado_por, ativado_em)
              values (%L, %L, 10, null, 'AVISAR', %L, %L, %L, %L)
              on conflict (tenant_id) do update set ativo = excluded.ativo, valor_adicional_brl = excluded.valor_adicional_brl,
                teto_de_consumo_brl = excluded.teto_de_consumo_brl, acao_ao_atingir_teto = excluded.acao_ao_atingir_teto,
                atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em,
                ativado_por = excluded.ativado_por, ativado_em = excluded.ativado_em$q$, conta, ativo, autor, quando, autor, quando)
  else
    format($q$insert into public.orcamentista_config (tenant_id, ativo, valor_adicional_brl, teto_de_consumo_brl, acao_ao_atingir_teto, atualizado_por, atualizado_em)
              values (%L, %L, 10, null, 'AVISAR', %L, %L)
              on conflict (tenant_id) do update set ativo = excluded.ativo, valor_adicional_brl = excluded.valor_adicional_brl,
                teto_de_consumo_brl = excluded.teto_de_consumo_brl, acao_ao_atingir_teto = excluded.acao_ao_atingir_teto,
                atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em$q$, conta, ativo, autor, quando)
  end) $$;
grant execute on function como(uuid, text), conta(uuid, text) to anon, authenticated;
grant execute on function pela_rota(text) to service_role;

-- CASO 1 — A ROTA (service_role) cria a configuração das duas contas; o SUPER ADMIN pelo PostgREST
-- (authenticated) NÃO cria: o REVOKE vale para ele também
do $$ declare r text; begin
  r := como(sa(), format('insert into public.orcamentista_config (tenant_id, ativo) values (%L, false)', ta()));
  if split_part(r, '|', 1) is distinct from '42501' or r not like '%permission denied%' then raise exception 'FALHOU 1: o super admin inseriu pelo PostgREST: %', r; end if;
  r := pela_rota(format($q$insert into public.orcamentista_config (tenant_id, ativo, valor_adicional_brl, teto_de_consumo_brl, acao_ao_atingir_teto, ativado_por, ativado_em, atualizado_por)
                          values (%L, true, 99.90, 500, 'BLOQUEAR', %L, now(), %L), (%L, true, 49.90, null, default, %L, now(), %L)$q$, ta(), sa(), sa(), tb(), sa(), sa()));
  if r is distinct from 'OK|2' then raise exception 'FALHOU 1: a rota não inseriu: %', r; end if;
  raise notice 'ok: 1 — a rota (service_role) cria as duas; o super admin pelo PostgREST: 42501 permission denied';
end $$;

-- CASO 2 — o TENANT LÊ a própria linha, e SÓ a própria
do $$ begin
  if conta(ua(), 'select count(*) from public.orcamentista_config') is distinct from '1' then raise exception 'FALHOU 2: A não vê exatamente uma linha'; end if;
  if conta(ua(), format('select count(*) from public.orcamentista_config where tenant_id = %L', tb())) is distinct from '0' then raise exception 'FALHOU 2: A vê a linha de B'; end if;
  if conta(sa(), 'select count(*) from public.orcamentista_config') is distinct from '2' then raise exception 'FALHOU 2: o super admin não lê as duas'; end if;
  raise notice 'ok: 2 — o tenant lê a própria configuração e não vê a da outra conta; o super admin lê as duas';
end $$;

-- CASO 3 — o TENANT NÃO ESCREVE: UPDATE, DELETE e INSERT, os três 42501 (privilégio)
do $$ declare r text; begin
  r := como(ua(), format('update public.orcamentista_config set ativo = false where tenant_id = %L', ta()));
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 3: UPDATE do tenant não deu 42501: %', r; end if;
  r := como(ua(), format('delete from public.orcamentista_config where tenant_id = %L', ta()));
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 3: DELETE do tenant não deu 42501: %', r; end if;
  delete from public.orcamentista_config where tenant_id = tb()::uuid;
  r := como(ub(), format('insert into public.orcamentista_config (tenant_id, ativo) values (%L, false)', tb()));
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 3: o tenant inseriu a própria linha: %', r; end if;
  if (select ativo from public.orcamentista_config where tenant_id = ta()::uuid) is distinct from true then raise exception 'FALHOU 3: a linha de A mudou'; end if;
  raise notice 'ok: 3 — o tenant não liga, não desliga, não cria e não apaga: UPDATE, DELETE e INSERT 42501';
end $$;

-- CASO 4 — DESLIGAR NUMA CONTA NÃO AFETA A OUTRA, pelo upsert da rota; e o upsert MOVE `atualizado_em`
do $$ declare r text; antes_b text; begin
  insert into public.orcamentista_config (tenant_id, ativo, valor_adicional_brl, ativado_por, ativado_em) values (tb()::uuid, true, 49.90, sa(), now());
  select row(b.*)::text into antes_b from public.orcamentista_config b where tenant_id = tb()::uuid;
  r := upsert_da_rota(ta(), false, sa(), '2030-01-01 12:00:00+00', false);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 4: a rota não desligou A: %', r; end if;
  if (select ativo from public.orcamentista_config where tenant_id = ta()::uuid) is distinct from false then raise exception 'FALHOU 4: A não desligou'; end if;
  if (select row(b.*)::text from public.orcamentista_config b where tenant_id = tb()::uuid) is distinct from antes_b then raise exception 'FALHOU 4: B mudou'; end if;
  if (select ativado_por from public.orcamentista_config where tenant_id = ta()::uuid) is distinct from sa() then raise exception 'FALHOU 4: desligar apagou o ativado_por'; end if;
  if (select atualizado_em from public.orcamentista_config where tenant_id = ta()::uuid) is distinct from '2030-01-01 12:00:00+00'::timestamptz then
    raise exception 'FALHOU 4: o upsert não gravou o atualizado_em do payload'; end if;
  raise notice 'ok: 4 — desligar A deixa B byte a byte igual, A guarda quem a ativou, e o atualizado_em é o do payload';
end $$;

-- CASO 5 — ANON não vê nada
do $$ begin
  if conta(null, 'select count(*) from public.orcamentista_config') not in ('0', 'ERRO 42501') then raise exception 'FALHOU 5: anon leu linhas'; end if;
  raise notice 'ok: 5 — anon não lê a configuração (%)', conta(null, 'select count(*) from public.orcamentista_config');
end $$;

-- CASO 6 — LIGADO EXIGE RASTRO: sem ativado_por/ativado_em, recusa — inclusive para a rota
do $$ declare r text; begin
  r := pela_rota(format('update public.orcamentista_config set ativo = true, ativado_por = null where tenant_id = %L', ta()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 6: ligado sem quem ligou passou: %', r; end if;
  raise notice 'ok: 6 — ligado sem ativado_por: 23514 (orcamentista_config_ativacao_rastreada), mesmo para service_role';
end $$;

-- CASO 7 — A AÇÃO: default AVISAR quando omitida; só BLOQUEAR/AVISAR; nunca nula
do $$ declare r text; begin
  delete from public.orcamentista_config where tenant_id = tb()::uuid;
  r := pela_rota(format('insert into public.orcamentista_config (tenant_id) values (%L)', tb()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 7: insert mínimo recusado: %', r; end if;
  if (select acao_ao_atingir_teto from public.orcamentista_config where tenant_id = tb()::uuid) is distinct from 'AVISAR' then
    raise exception 'FALHOU 7: a ação omitida não virou AVISAR: %', (select acao_ao_atingir_teto from public.orcamentista_config where tenant_id = tb()::uuid); end if;
  if (select ativo from public.orcamentista_config where tenant_id = tb()::uuid) is distinct from false then raise exception 'FALHOU 7: nasceu ligado'; end if;
  r := pela_rota(format($q$update public.orcamentista_config set acao_ao_atingir_teto = 'DESLIGAR' where tenant_id = %L$q$, tb()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 7: ação fora do domínio passou: %', r; end if;
  r := pela_rota(format('update public.orcamentista_config set acao_ao_atingir_teto = null where tenant_id = %L', tb()));
  if split_part(r, '|', 1) is distinct from '23502' then raise exception 'FALHOU 7: ação nula passou: %', r; end if;
  raise notice 'ok: 7 — ação omitida = AVISAR, desligado por padrão; DESLIGAR 23514; nula 23502';
end $$;

-- CASO 8 — VALORES: adicional negativo e teto zero recusados
do $$ declare r text; begin
  r := pela_rota(format('update public.orcamentista_config set valor_adicional_brl = -1 where tenant_id = %L', tb()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 8: adicional negativo passou: %', r; end if;
  r := pela_rota(format('update public.orcamentista_config set teto_de_consumo_brl = 0 where tenant_id = %L', tb()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 8: teto zero passou: %', r; end if;
  raise notice 'ok: 8 — adicional negativo e teto zero: 23514';
end $$;

-- CASO 9 — AS CONSTRAINTS TÊM OS NOMES QUE A VERIFICAÇÃO DA MIGRAÇÃO ESPERA — e NENHUMA FK para users
do $$ declare nomes text; begin
  select string_agg(conname, ',' order by conname) into nomes from pg_constraint where conrelid = 'public.orcamentista_config'::regclass;
  if nomes is distinct from 'orcamentista_config_acao_ao_atingir_teto_check,orcamentista_config_ativacao_rastreada,orcamentista_config_pkey,orcamentista_config_tenant_id_fkey,orcamentista_config_teto_de_consumo_brl_check,orcamentista_config_valor_adicional_brl_check' then
    raise exception 'FALHOU 9: constraints diferentes da VERIFICAÇÃO: %', nomes; end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.orcamentista_config'::regclass and contype = 'f' and confrelid = 'public.users'::regclass) then
    raise exception 'FALHOU 9: há FK para users'; end if;
  raise notice 'ok: 9 — as 6 constraints com os nomes da VERIFICAÇÃO (5), nenhuma FK para users';
end $$;

-- CASO 10 — NADA MAIS FOI TOCADO: tenant_settings (colunas, política e privilégios) e tenants.segment
do $$ begin
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='tenant_settings') is distinct from 3 then
    raise exception 'FALHOU 10: tenant_settings ganhou coluna'; end if;
  if (select count(*) from pg_policies where tablename='tenant_settings') is distinct from 1 then raise exception 'FALHOU 10: política de tenant_settings mudou'; end if;
  if not (has_table_privilege('authenticated', 'public.tenant_settings', 'INSERT') and has_table_privilege('authenticated', 'public.tenant_settings', 'UPDATE')
          and has_table_privilege('authenticated', 'public.tenant_settings', 'DELETE')) then raise exception 'FALHOU 10: o REVOKE alcançou tenant_settings'; end if;
  if (select segment from public.tenants where id = ta()::uuid) is distinct from 'Indústria ' then raise exception 'FALHOU 10: tenants.segment mudou'; end if;
  raise notice 'ok: 10 — tenant_settings com as 3 colunas do harness, 1 política e os privilégios de antes; tenants.segment intacto';
end $$;

-- CASO 11 — OS PRIVILÉGIOS, OS SETE, como a VERIFICAÇÃO (4) os afirma: authenticated SELECT e
-- nenhum outro; service_role os sete; anon nenhum
do $$ declare linha text; begin
  select string_agg(r.papel || '=' || coalesce((select string_agg(c.cmd, ',' order by c.cmd)
           from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) c(cmd)
          where has_table_privilege(r.papel, 'public.orcamentista_config', c.cmd)), '-'), ' ' order by r.papel) into linha
    from (values ('anon'), ('authenticated'), ('service_role')) r(papel);
  if linha is distinct from 'anon=- authenticated=SELECT service_role=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE' then
    raise exception 'FALHOU 11: privilégios diferentes da VERIFICAÇÃO (4): %', linha; end if;
  raise notice 'ok: 11 — authenticated só SELECT, nenhum outro dos sete; service_role os sete; anon nenhum';
end $$;

-- CASO 12 — A CAMADA DA POLÍTICA, SOZINHA: com o privilégio devolvido a authenticated (o engano que
-- a segunda camada existe para cobrir), o tenant continua sem escrever e o super admin escreve.
-- Tudo dentro de uma subtransação desfeita no fim.
do $$ declare up text; de text; ins text; sup text; begin
  begin
    grant insert, update, delete on public.orcamentista_config to authenticated;
    up  := como(ua(), format('update public.orcamentista_config set ativo = true where tenant_id = %L', ta()));
    de  := como(ua(), format('delete from public.orcamentista_config where tenant_id = %L', ta()));
    ins := como(ub(), format('insert into public.orcamentista_config (tenant_id) values (%L) on conflict do nothing', '00000000-0000-0000-0000-00000000000c'));
    sup := como(sa(), format('update public.orcamentista_config set valor_adicional_brl = 1 where tenant_id = %L', ta()));
    raise exception using errcode = 'ZZ001', message = 'desfaz';
  exception when sqlstate 'ZZ001' then null;
  end;
  if up is distinct from 'OK|0' then raise exception 'FALHOU 12: com o privilégio, o tenant atualizou: %', up; end if;
  if de is distinct from 'OK|0' then raise exception 'FALHOU 12: com o privilégio, o tenant apagou: %', de; end if;
  if split_part(ins, '|', 1) is distinct from '42501' or ins not like '%row-level security%' then raise exception 'FALHOU 12: com o privilégio, o INSERT do tenant não foi barrado pela RLS: %', ins; end if;
  if sup is distinct from 'OK|1' then raise exception 'FALHOU 12: com o privilégio, o super admin não atualizou: %', sup; end if;
  if has_table_privilege('authenticated', 'public.orcamentista_config', 'UPDATE') then raise exception 'FALHOU 12: o GRANT do caso não foi desfeito'; end if;
  raise notice 'ok: 12 — só a política: tenant UPDATE 0, DELETE 0, INSERT 42501 (RLS); super admin UPDATE 1';
end $$;

-- CASO 13 — A CAMADA DO PRIVILÉGIO, SOZINHA: com uma política que deixa tudo passar, o tenant
-- continua sem escrever. Subtransação desfeita no fim.
do $$ declare up text; de text; ins text; begin
  begin
    create policy aberta_de_proposito on public.orcamentista_config for all to authenticated using (true) with check (true);
    up  := como(ua(), format('update public.orcamentista_config set ativo = true where tenant_id = %L', ta()));
    de  := como(ua(), format('delete from public.orcamentista_config where tenant_id = %L', ta()));
    ins := como(ub(), format('insert into public.orcamentista_config (tenant_id) values (%L) on conflict do nothing', '00000000-0000-0000-0000-00000000000c'));
    raise exception using errcode = 'ZZ001', message = 'desfaz';
  exception when sqlstate 'ZZ001' then null;
  end;
  if up not like '42501|%permission denied%' then raise exception 'FALHOU 13: com a política aberta, o tenant atualizou: %', up; end if;
  if de not like '42501|%permission denied%' then raise exception 'FALHOU 13: com a política aberta, o tenant apagou: %', de; end if;
  if ins not like '42501|%permission denied%' then raise exception 'FALHOU 13: com a política aberta, o tenant inseriu: %', ins; end if;
  if exists (select 1 from pg_policies where policyname = 'aberta_de_proposito') then raise exception 'FALHOU 13: a política do caso não foi desfeita'; end if;
  raise notice 'ok: 13 — só o privilégio: tenant UPDATE, DELETE e INSERT 42501 permission denied';
end $$;

-- CASO 14 — APAGAR O USUÁRIO QUE LIGOU NÃO FALHA, com a conta LIGADA (a CHECK de rastro de pé), e o
-- autor fica gravado. Subtransação desfeita no fim.
do $$ declare r text; apagou text; autor uuid; ainda boolean; begin
  begin
    r := upsert_da_rota(ta(), true, sa(), now(), true);
    if r is distinct from 'OK|1' then raise exception 'FALHOU 14: a rota não ligou A: %', r; end if;
    begin
      delete from public.users where id = sa();
      apagou := 'OK';
    exception when others then apagou := sqlstate || ' ' || sqlerrm;
    end;
    select ativado_por, ativo into autor, ainda from public.orcamentista_config where tenant_id = ta()::uuid;
    raise exception using errcode = 'ZZ001', message = 'desfaz';
  exception when sqlstate 'ZZ001' then null;
  end;
  if apagou is distinct from 'OK' then raise exception 'FALHOU 14: apagar o usuário que ligou falhou: %', apagou; end if;
  if autor is distinct from sa() or ainda is distinct from true then raise exception 'FALHOU 14: o autor ou o estado mudou: % %', autor, ainda; end if;
  if not exists (select 1 from public.users where id = sa()) then raise exception 'FALHOU 14: o usuário do caso não foi restaurado'; end if;
  raise notice 'ok: 14 — usuário que ligou apagado, conta ligada intacta, ativado_por ainda é o id dele';
end $$;

-- CASO 15 — NÃO HÁ TRIGGER: um UPDATE que não manda `atualizado_em` NÃO o move. É a consequência
-- conhecida da escolha (b) — e o motivo de a rota mandar o campo SEMPRE.
do $$ declare antes timestamptz; r text; begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.orcamentista_config'::regclass and not tgisinternal) then
    raise exception 'FALHOU 15: há trigger na tabela'; end if;
  select atualizado_em into antes from public.orcamentista_config where tenant_id = ta()::uuid;
  r := pela_rota(format('update public.orcamentista_config set valor_adicional_brl = 77 where tenant_id = %L', ta()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 15: update da rota recusado: %', r; end if;
  if (select atualizado_em from public.orcamentista_config where tenant_id = ta()::uuid) is distinct from antes then
    raise exception 'FALHOU 15: algo moveu o atualizado_em sem a rota mandar'; end if;
  raise notice 'ok: 15 — nenhum trigger; UPDATE sem atualizado_em não o move (quem move é a rota)';
end $$;
