-- Os casos do bucket `comprovantes` preso ao tenant. `ok:` / `FALHOU:` é o que o runner lê; cada
-- caso é marcado com `-- CASO`. Os caminhos são os que o CÓDIGO monta (medidos em 19/10/2026):
--   orçamentos e agenda: <tenant>/customers/<customer>/<uuid>.<ext>
--   vendas:              <tenant>/<saleId>.<ext>, com upsert
\set QUIET on
set client_min_messages = notice;

insert into public.tenants values ('00000000-0000-0000-0000-00000000000a', null), ('00000000-0000-0000-0000-00000000000b', null);
insert into public.users values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'a@x', 'admin', false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'b@x', 'admin', false),
  ('00000000-0000-0000-0000-0000000000f1', null, 's@x', 'super_admin', true);

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
grant execute on function como(uuid, text), conta(uuid, text) to anon, authenticated;

-- O arquivo da conta B, posto pela rota (service_role, BYPASSRLS), com o caminho do orçamento.
insert into storage.objects (bucket_id, name) values ('comprovantes', '00000000-0000-0000-0000-00000000000b/customers/c-b/1.pdf');

-- CASO 1 — A CONTA A NÃO LÊ o comprovante da conta B; a conta B lê o dela
do $$ begin
  if conta(ua(), $q$select count(*) from storage.objects where bucket_id = 'comprovantes'$q$) is distinct from '0' then raise exception 'FALHOU 1: A lê o comprovante de B'; end if;
  if conta(ub(), $q$select count(*) from storage.objects where bucket_id = 'comprovantes'$q$) is distinct from '1' then raise exception 'FALHOU 1: B não lê o próprio comprovante'; end if;
  raise notice 'ok: 1 — A lê 0 comprovantes de B; B lê o dela';
end $$;

-- CASO 2 — A CONTA A NÃO GRAVA na pasta de B, nem na raiz; grava na dela, nos DOIS formatos que o
-- código monta (orçamento/agenda e vendas)
do $$ declare r text; begin
  r := como(ua(), $q$insert into storage.objects (bucket_id, name) values ('comprovantes', '00000000-0000-0000-0000-00000000000b/customers/c-b/2.pdf')$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 2: A gravou na pasta de B: %', r; end if;
  r := como(ua(), $q$insert into storage.objects (bucket_id, name) values ('comprovantes', 'solto.pdf')$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 2: A gravou na raiz: %', r; end if;
  r := como(ua(), $q$insert into storage.objects (bucket_id, name) values ('comprovantes', '00000000-0000-0000-0000-00000000000a/customers/c-a/1.pdf')$q$);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 2: A não gravou na própria pasta (orçamento): %', r; end if;
  r := como(ua(), $q$insert into storage.objects (bucket_id, name) values ('comprovantes', '00000000-0000-0000-0000-00000000000a/venda-1.pdf')$q$);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 2: A não gravou na própria pasta (vendas): %', r; end if;
  raise notice 'ok: 2 — A na pasta de B e na raiz: 42501; na própria, nos dois formatos do código: grava';
end $$;

-- CASO 3 — O UPSERT de vendas: refazer o mesmo caminho na própria pasta passa; e A NÃO SOBRESCREVE
-- o arquivo de B pelo upsert
do $$ declare r text; begin
  r := como(ua(), $q$insert into storage.objects (bucket_id, name) values ('comprovantes', '00000000-0000-0000-0000-00000000000a/venda-1.pdf')
                    on conflict (bucket_id, name) do update set owner = '00000000-0000-0000-0000-0000000000a1'$q$);
  if r is distinct from 'OK|1' then raise exception 'FALHOU 3: o upsert na própria pasta falhou: %', r; end if;
  r := como(ua(), $q$insert into storage.objects (bucket_id, name) values ('comprovantes', '00000000-0000-0000-0000-00000000000b/customers/c-b/1.pdf')
                    on conflict (bucket_id, name) do update set owner = '00000000-0000-0000-0000-0000000000a1'$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 3: A sobrescreveu o arquivo de B pelo upsert: %', r; end if;
  raise notice 'ok: 3 — upsert na própria pasta passa; sobre o arquivo de B: 42501';
end $$;

-- CASO 4 — UPDATE: A não altera o de B, e não move o dela para a pasta de B. Os dois SEM WHERE e
-- sem ler coluna: com WHERE, o Postgres aplica também a política de SELECT, e o caso não
-- distinguiria uma política de UPDATE aberta. E o resultado é afirmado EXATO: com o USING aberto,
-- o UPDATE alcança a linha de B e quem recusa é o WITH CHECK (42501) — o 'OK|0' distingue.
do $$ declare r text; begin
  -- A tem 2 arquivos (caso 2); o de B fica intocado.
  r := como(ua(), $q$update storage.objects set owner = '00000000-0000-0000-0000-0000000000a1'$q$);
  if r is distinct from 'OK|2' then raise exception 'FALHOU 4: o UPDATE de A não ficou só nos 2 arquivos dela: %', r; end if;
  if (select owner from storage.objects where name = '00000000-0000-0000-0000-00000000000b/customers/c-b/1.pdf') is not null then raise exception 'FALHOU 4: A alterou o arquivo de B'; end if;
  r := como(ua(), $q$update storage.objects set name = '00000000-0000-0000-0000-00000000000b/roubado-' || gen_random_uuid() || '.pdf'$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 4: A moveu arquivo dela para a pasta de B: %', r; end if;
  raise notice 'ok: 4 — A não altera o arquivo de B, e mover o dela para a pasta de B: 42501';
end $$;

-- CASO 5 — SUPER ADMIN (sem tenant) e ANON: não leem nem gravam
do $$ declare r text; begin
  if conta(sa(), $q$select count(*) from storage.objects where bucket_id = 'comprovantes'$q$) is distinct from '0' then raise exception 'FALHOU 5: o super admin lê comprovante'; end if;
  r := como(sa(), $q$insert into storage.objects (bucket_id, name) values ('comprovantes', '00000000-0000-0000-0000-00000000000a/sa.pdf')$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 5: o super admin gravou: %', r; end if;
  if conta(null, $q$select count(*) from storage.objects where bucket_id = 'comprovantes'$q$) is distinct from '0' then raise exception 'FALHOU 5: anon lê comprovante'; end if;
  r := como(null, $q$insert into storage.objects (bucket_id, name) values ('comprovantes', '00000000-0000-0000-0000-00000000000a/anon.pdf')$q$);
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 5: anon gravou: %', r; end if;
  raise notice 'ok: 5 — super admin (sem tenant) e anon: leitura 0, gravação 42501';
end $$;

-- CASO 6 — A FORMA: três políticas, os mesmos três comandos, NENHUMA de DELETE, todas para
-- `authenticated`, e A não apaga nada
do $$ declare r text; begin
  if (select string_agg(cmd || ':' || roles::text, ',' order by cmd) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'comprovantes%')
     is distinct from 'INSERT:{authenticated},SELECT:{authenticated},UPDATE:{authenticated}' then raise exception 'FALHOU 6: as políticas mudaram de forma'; end if;
  r := como(ua(), $q$delete from storage.objects$q$);
  if r is distinct from 'OK|0' then raise exception 'FALHOU 6: A apagou: %', r; end if;
  raise notice 'ok: 6 — três políticas (INSERT, SELECT, UPDATE), só authenticated, sem DELETE; A não apaga';
end $$;
