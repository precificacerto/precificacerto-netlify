-- Os casos da migração do Atendimentos I.A., bloco 2B.1. `ok:` / `FALHOU:` é o que o runner lê;
-- cada caso é marcado com `-- CASO` (o runner conta). Comparações com `IS DISTINCT FROM`.
\set QUIET on
set client_min_messages = notice;

-- Duas contas, um usuário em cada, e o super admin (sem tenant).
insert into public.tenants values ('00000000-0000-0000-0000-00000000000a', null), ('00000000-0000-0000-0000-00000000000b', null);
insert into public.users values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'a@x', 'admin', false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'b@x', 'admin', false),
  ('00000000-0000-0000-0000-0000000000f1', null, 's@x', 'super_admin', true);

-- Executa `sql` como `authenticated` com o `sub` dado (NULL = anon) e devolve 'OK|<linhas>' ou
-- 'SQLSTATE|mensagem'.
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
-- A ROTA: `service_role` (BYPASSRLS, `auth.uid()` nulo), como o `supabaseAdmin`.
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
-- SELECT count(*) como `quem`: devolve o número, ou 'ERRO <sqlstate>'.
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
create function ta() returns text language sql as $$ select '00000000-0000-0000-0000-00000000000a' $$;
create function tb() returns text language sql as $$ select '00000000-0000-0000-0000-00000000000b' $$;
grant execute on function como(uuid, text), conta(uuid, text) to anon, authenticated;
grant execute on function pela_rota(text) to service_role;
-- Ids fixos do catálogo montado no caso 2.
create function n_fab() returns text language sql as $$ select '10000000-0000-0000-0000-000000000001' $$;
create function n_rev() returns text language sql as $$ select '10000000-0000-0000-0000-000000000002' $$;
create function f1()    returns text language sql as $$ select '20000000-0000-0000-0000-000000000001' $$;
create function t1()    returns text language sql as $$ select '30000000-0000-0000-0000-000000000001' $$;
create function t2()    returns text language sql as $$ select '30000000-0000-0000-0000-000000000002' $$;

-- As quatro tabelas, para os laços.
create table quatro (t text);
insert into quatro values ('public.orcamentista_nicho'), ('public.orcamentista_fornecedor'), ('public.orcamentista_tabela'), ('public.orcamentista_conta_tabela');
grant select on quatro to anon, authenticated, service_role;

-- CASO 1 — PRIVILÉGIOS POR COMANDO E POR PAPEL, os sete: anon e authenticated NENHUM nas quatro;
-- service_role os sete; `orcamentista_config` inalterada (authenticated só SELECT)
do $$ declare t text; p text; c text; tem boolean; begin
  for t in select q.t from quatro q loop
    foreach p in array array['anon', 'authenticated', 'service_role'] loop
      foreach c in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        tem := has_table_privilege(p, t, c);
        if tem is distinct from (p = 'service_role') then raise exception 'FALHOU 1: % tem % em %: %', p, c, t, tem; end if;
      end loop;
    end loop;
  end loop;
  foreach c in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege('authenticated', 'public.orcamentista_config', c) is distinct from (c = 'SELECT') then raise exception 'FALHOU 1: config mudou em %', c; end if;
    if has_table_privilege('anon', 'public.orcamentista_config', c) then raise exception 'FALHOU 1: anon ganhou % em config', c; end if;
  end loop;
  raise notice 'ok: 1 — as quatro: anon e authenticated sem nenhum dos sete, service_role com os sete; config: authenticated só SELECT';
end $$;

-- CASO 2 — A ROTA (service_role) monta o catálogo inteiro e liga uma tabela à conta A
do $$ declare r text; begin
  r := pela_rota(format($q$insert into public.orcamentista_nicho (id, modelo, nome, criado_por) values (%L, 'FABRICACAO', 'Esquadrias', %L), (%L, 'REVENDA', 'Loja de roupas', %L)$q$, n_fab(), sa(), n_rev(), sa()));
  if r is distinct from 'OK|2' then raise exception 'FALHOU 2: nicho: %', r; end if;
  r := pela_rota(format($q$insert into public.orcamentista_fornecedor (id, nicho_id, nome) values (%L, %L, 'Alumínio Sul')$q$, f1(), n_fab()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 2: fornecedor: %', r; end if;
  r := pela_rota(format($q$insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, vigencia)
                          values (%L, %L, 'f1/t1.xlsx', 't1.xlsx', 'f1/m1.xlsx', 'm1.xlsx', 'desde 01/10/2026'), (%L, %L, 'f1/t2.xlsx', 't2.xlsx', 'f1/m2.xlsx', 'm2.xlsx', null)$q$, t1(), f1(), t2(), f1()));
  if r is distinct from 'OK|2' then raise exception 'FALHOU 2: tabela: %', r; end if;
  r := pela_rota(format($q$insert into public.orcamentista_conta_tabela (tenant_id, tabela_id) values (%L, %L), (%L, %L)$q$, ta(), t1(), tb(), t1()));
  if r is distinct from 'OK|2' then raise exception 'FALHOU 2: conta_tabela: %', r; end if;
  r := pela_rota(format($q$insert into public.orcamentista_config (tenant_id, ativo, ativado_por, ativado_em, modelo, nicho_id) values (%L, true, %L, now(), 'FABRICACAO', %L)$q$, ta(), sa(), n_fab()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 2: config: %', r; end if;
  raise notice 'ok: 2 — a rota cria nicho, fornecedor, tabela, tabela em uso e a config com modelo e nicho';
end $$;

-- CASO 3 — NINGUÉM PELO POSTGREST: super admin, tenant e anon recebem 42501 em leitura e escrita
-- das quatro (é o privilégio que nega, antes da política)
do $$ declare t text; quem uuid; r text; begin
  for t in select q.t from quatro q loop
    foreach quem in array array[sa(), ua(), null::uuid] loop
      r := conta(quem, format('select count(*) from %s', t));
      if r is distinct from 'ERRO 42501' then raise exception 'FALHOU 3: % leu %: %', coalesce(quem::text, 'anon'), t, r; end if;
      r := como(quem, format('delete from %s', t));
      if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 3: % apagou de %: %', coalesce(quem::text, 'anon'), t, r; end if;
    end loop;
  end loop;
  r := como(sa(), $q$insert into public.orcamentista_nicho (modelo, nome) values ('SERVICO', 'Mecânica')$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 3: o super admin inseriu pelo PostgREST: %', r; end if;
  raise notice 'ok: 3 — super admin, tenant e anon: SELECT e DELETE 42501 nas quatro; INSERT do super admin 42501';
end $$;

-- CASO 4 — A SEGUNDA CAMADA: com o privilégio devolvido POR ENGANO a `authenticated`, as
-- políticas continuam negando ao tenant e deixando o super admin
do $$ declare t text; r text; begin
  for t in select q.t from quatro q loop execute format('grant all on %s to authenticated', t); end loop;
  for t in select q.t from quatro q loop
    if conta(ua(), format('select count(*) from %s', t)) is distinct from '0' then raise exception 'FALHOU 4: o tenant leu %', t; end if;
    if conta(sa(), format('select count(*) from %s', t)) = '0' then raise exception 'FALHOU 4: o super admin não leu %', t; end if;
    r := como(ua(), format('delete from %s', t));
    if r is distinct from 'OK|0' then raise exception 'FALHOU 4: o tenant apagou de %: %', t, r; end if;
  end loop;
  r := como(ua(), $q$insert into public.orcamentista_nicho (modelo, nome) values ('SERVICO', 'Mecânica')$q$);
  if split_part(r, '|', 1) is distinct from '42501' or r not like '%row-level security%' then raise exception 'FALHOU 4: o tenant inseriu nicho: %', r; end if;
  -- SEM WHERE: com WHERE, o UPDATE também exige a política de SELECT, e o caso não distinguiria
  -- uma política de UPDATE aberta.
  r := como(ua(), $q$update public.orcamentista_tabela set motor_nome = 'x'$q$);
  if r is distinct from 'OK|0' then raise exception 'FALHOU 4: o tenant mudou o motor: %', r; end if;
  r := como(sa(), $q$insert into public.orcamentista_nicho (modelo, nome) values ('SERVICO', 'Mecânica')$q$);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 4: a política negou o super admin: %', r; end if;
  delete from public.orcamentista_nicho where nome = 'Mecânica';
  for t in select q.t from quatro q loop execute format('revoke all on %s from authenticated', t); end loop;
  raise notice 'ok: 4 — com o privilégio devolvido, a RLS ainda nega ao tenant (leitura 0, escrita 0 linhas / 42501) e deixa o super admin';
end $$;

-- CASO 5 — NICHO: nome único por modelo SEM distinguir maiúsculas; o mesmo nome em outro modelo
-- passa; modelo fora dos três é recusado
do $$ declare r text; begin
  r := pela_rota($q$insert into public.orcamentista_nicho (modelo, nome) values ('FABRICACAO', 'esquadrias')$q$);
  if split_part(r, '|', 1) is distinct from '23505' then raise exception 'FALHOU 5: esquadrias minúsculo entrou no mesmo modelo: %', r; end if;
  r := pela_rota($q$insert into public.orcamentista_nicho (modelo, nome) values ('REVENDA', 'Esquadrias')$q$);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 5: o mesmo nome em outro modelo foi recusado: %', r; end if;
  r := pela_rota($q$insert into public.orcamentista_nicho (modelo, nome) values ('INDUSTRIALIZACAO', 'X')$q$);
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 5: modelo fora dos três entrou: %', r; end if;
  raise notice 'ok: 5 — Esquadrias/esquadrias no mesmo modelo 23505; em outro modelo passa; INDUSTRIALIZACAO 23514';
end $$;

-- CASO 6 — O MOTOR É OBRIGATÓRIO: tabela sem motor_path, ou sem motor_nome, é recusada (23502)
do $$ declare r text; begin
  r := pela_rota(format($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_nome) values (%L, 'a', 'a', 'm')$q$, f1()));
  if split_part(r, '|', 1) is distinct from '23502' or r not like '%motor_path%' then raise exception 'FALHOU 6: tabela sem motor_path: %', r; end if;
  r := pela_rota(format($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path) values (%L, 'a', 'a', 'm')$q$, f1()));
  if split_part(r, '|', 1) is distinct from '23502' or r not like '%motor_nome%' then raise exception 'FALHOU 6: tabela sem motor_nome: %', r; end if;
  raise notice 'ok: 6 — tabela sem motor_path ou sem motor_nome: 23502, mesmo para a rota';
end $$;

-- CASO 7 — RESTRICT: tabela em uso, fornecedor com tabela, nicho com fornecedor, nicho em uso
-- por conta — os quatro recusados (23503), mesmo pela rota
do $$ declare r text; begin
  r := pela_rota(format('delete from public.orcamentista_tabela where id = %L', t1()));
  if split_part(r, '|', 1) is distinct from '23503' then raise exception 'FALHOU 7: tabela em uso foi excluída: %', r; end if;
  -- Fornecedor e nicho são testados com filhos SEM USO: com a tabela em uso no caminho, o RESTRICT
  -- da tabela em uso recusaria sozinho, e um CASCADE no meio passaria despercebido.
  r := pela_rota(format($q$insert into public.orcamentista_nicho (id, modelo, nome) values ('10000000-0000-0000-0000-000000000003', 'FABRICACAO', 'Metalurgia');
    insert into public.orcamentista_fornecedor (id, nicho_id, nome) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'Aço Norte'),
                                                                     ('20000000-0000-0000-0000-000000000003', %L, 'Vidros Leste');
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome) values ('20000000-0000-0000-0000-000000000003', 'a', 'a', 'm', 'm')$q$, n_fab()));
  r := pela_rota('delete from public.orcamentista_fornecedor where id = ''20000000-0000-0000-0000-000000000003''');
  if split_part(r, '|', 1) is distinct from '23503' then raise exception 'FALHOU 7: fornecedor com tabela (sem uso) foi excluído: %', r; end if;
  r := pela_rota('delete from public.orcamentista_nicho where id = ''10000000-0000-0000-0000-000000000003''');
  if split_part(r, '|', 1) is distinct from '23503' then raise exception 'FALHOU 7: nicho com fornecedor (sem tabela) foi excluído: %', r; end if;
  r := pela_rota(format('update public.orcamentista_config set nicho_id = %L where tenant_id = %L', n_rev(), ta()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 7: config não aceitou o nicho: %', r; end if;
  r := pela_rota(format('delete from public.orcamentista_nicho where id = %L', n_rev()));
  if split_part(r, '|', 1) is distinct from '23503' then raise exception 'FALHOU 7: nicho em uso por conta foi excluído: %', r; end if;
  -- A tabela que NÃO está em uso sai: o RESTRICT é sobre uso, não sobre a tabela.
  r := pela_rota(format('delete from public.orcamentista_tabela where id = %L', t2()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 7: tabela sem uso não saiu: %', r; end if;
  raise notice 'ok: 7 — tabela em uso, fornecedor com tabela, nicho com fornecedor e nicho em uso: 23503 (os dois do meio com filhos sem uso); tabela sem uso sai';
end $$;

-- CASO 8 — CASCADE: excluir a conta B leva as linhas DELA em conta_tabela, e só as dela
do $$ declare r text; begin
  r := pela_rota(format('delete from public.tenants where id = %L', tb()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 8: a conta B não saiu: %', r; end if;
  if (select count(*) from public.orcamentista_conta_tabela where tenant_id = tb()::uuid) is distinct from 0::bigint then raise exception 'FALHOU 8: sobrou linha de B'; end if;
  if (select count(*) from public.orcamentista_conta_tabela where tenant_id = ta()::uuid) is distinct from 1::bigint then raise exception 'FALHOU 8: a linha de A mudou'; end if;
  raise notice 'ok: 8 — conta excluída leva as linhas dela (CASCADE); as da outra conta ficam';
end $$;

-- CASO 9 — CONFIG: modelo fora dos três é recusado; NULL é aceito; o tenant LÊ o próprio modelo e
-- NÃO o escreve
do $$ declare r text; begin
  r := pela_rota(format($q$update public.orcamentista_config set modelo = 'INDUSTRIALIZACAO' where tenant_id = %L$q$, ta()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 9: modelo fora dos três entrou: %', r; end if;
  r := pela_rota(format($q$update public.orcamentista_config set modelo = null, nicho_id = null where tenant_id = %L$q$, ta()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 9: modelo nulo recusado: %', r; end if;
  r := pela_rota(format($q$update public.orcamentista_config set modelo = 'FABRICACAO', nicho_id = %L where tenant_id = %L$q$, n_fab(), ta()));
  if conta(ua(), $q$select count(*) from public.orcamentista_config where modelo = 'FABRICACAO'$q$) is distinct from '1' then raise exception 'FALHOU 9: o tenant não lê o próprio modelo'; end if;
  r := como(ua(), $q$update public.orcamentista_config set modelo = 'REVENDA'$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 9: o tenant escreveu o modelo: %', r; end if;
  r := pela_rota(format($q$update public.orcamentista_config set nicho_id = %L where tenant_id = %L$q$, '99999999-0000-0000-0000-000000000000', ta()));
  if split_part(r, '|', 1) is distinct from '23503' then raise exception 'FALHOU 9: nicho inexistente aceito: %', r; end if;
  raise notice 'ok: 9 — config: modelo fora dos três 23514, nulo aceito, nicho inexistente 23503; o tenant lê e não escreve';
end $$;

-- CASO 10 — O BUCKET: existe, PRIVADO; o super admin grava e lê nele; o tenant e anon não leem nem
-- gravam; e o `comprovantes` segue como estava (a política nova não o alcança)
do $$ declare r text; begin
  if (select public from storage.buckets where id = 'atendimentos-ia') is distinct from false then raise exception 'FALHOU 10: bucket ausente ou público'; end if;
  r := como(sa(), $q$insert into storage.objects (bucket_id, name) values ('atendimentos-ia', 'f1/t1.xlsx')$q$);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 10: o super admin não gravou: %', r; end if;
  if conta(sa(), $q$select count(*) from storage.objects where bucket_id = 'atendimentos-ia'$q$) is distinct from '1' then raise exception 'FALHOU 10: o super admin não lê'; end if;
  r := como(ua(), $q$insert into storage.objects (bucket_id, name) values ('atendimentos-ia', 'x.xlsx')$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 10: o tenant gravou no bucket: %', r; end if;
  if conta(ua(), $q$select count(*) from storage.objects where bucket_id = 'atendimentos-ia'$q$) is distinct from '0' then raise exception 'FALHOU 10: o tenant lê o bucket'; end if;
  -- SEM WHERE: com WHERE, UPDATE e DELETE também exigem a política de SELECT, e o caso não
  -- distinguiria uma política de UPDATE ou DELETE aberta.
  r := como(ua(), $q$update storage.objects set name = 'y'$q$);
  if r is distinct from 'OK|0' then raise exception 'FALHOU 10: o tenant renomeou: %', r; end if;
  r := como(ua(), $q$delete from storage.objects$q$);
  if r is distinct from 'OK|0' then raise exception 'FALHOU 10: o tenant apagou: %', r; end if;
  r := como(null, $q$insert into storage.objects (bucket_id, name) values ('atendimentos-ia', 'x.xlsx')$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 10: anon gravou: %', r; end if;
  if conta(null, $q$select count(*) from storage.objects where bucket_id = 'atendimentos-ia'$q$) is distinct from '0' then raise exception 'FALHOU 10: anon lê o bucket'; end if;
  r := como(ua(), $q$insert into storage.objects (bucket_id, name) values ('comprovantes', 'c.pdf')$q$);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 10: o comprovantes mudou para o tenant: %', r; end if;
  r := como(sa(), $q$delete from storage.objects where bucket_id = 'atendimentos-ia'$q$);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 10: o super admin não apagou: %', r; end if;
  raise notice 'ok: 10 — bucket privado; super admin grava, lê e apaga; tenant e anon: gravação 42501, leitura 0, update/delete 0 linhas; comprovantes intacto';
end $$;
