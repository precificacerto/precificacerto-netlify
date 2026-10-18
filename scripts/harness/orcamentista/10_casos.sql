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
grant execute on function como(uuid, text), conta(uuid, text) to anon, authenticated;

-- CASO 1 — o SUPER ADMIN cria a configuração das duas contas
do $$ declare r text; begin
  r := como(sa(), format($q$insert into public.orcamentista_config (tenant_id, ativo, valor_adicional_brl, teto_de_consumo_brl, acao_ao_atingir_teto, ativado_por, ativado_em, atualizado_por)
                          values (%L, true, 99.90, 500, 'BLOQUEAR', %L, now(), %L), (%L, true, 49.90, null, null, %L, now(), %L)$q$, ta(), sa(), sa(), tb(), sa(), sa()));
  if r is distinct from 'OK|2' then raise exception 'FALHOU 1: super admin não inseriu: %', r; end if;
  raise notice 'ok: 1 — super admin insere a configuração das duas contas';
end $$;

-- CASO 2 — o TENANT LÊ a própria linha, e SÓ a própria
do $$ begin
  if conta(ua(), 'select count(*) from public.orcamentista_config') is distinct from '1' then raise exception 'FALHOU 2: A não vê exatamente uma linha'; end if;
  if conta(ua(), format('select count(*) from public.orcamentista_config where tenant_id = %L', tb())) is distinct from '0' then raise exception 'FALHOU 2: A vê a linha de B'; end if;
  raise notice 'ok: 2 — o tenant lê a própria configuração e não vê a da outra conta';
end $$;

-- CASO 3 — o TENANT NÃO ESCREVE: nem UPDATE (0 linhas), nem INSERT (42501), nem DELETE (0 linhas)
do $$ declare r text; begin
  r := como(ua(), format('update public.orcamentista_config set ativo = false where tenant_id = %L', ta()));
  if r is distinct from 'OK|0' then raise exception 'FALHOU 3: o tenant atualizou a própria linha: %', r; end if;
  r := como(ua(), format('delete from public.orcamentista_config where tenant_id = %L', ta()));
  if r is distinct from 'OK|0' then raise exception 'FALHOU 3: o tenant apagou a própria linha: %', r; end if;
  delete from public.orcamentista_config where tenant_id = tb()::uuid;
  r := como(ub(), format('insert into public.orcamentista_config (tenant_id, ativo) values (%L, false)', tb()));
  if split_part(r, '|', 1) is distinct from '42501' then raise exception 'FALHOU 3: o tenant inseriu a própria linha: %', r; end if;
  if (select ativo from public.orcamentista_config where tenant_id = ta()::uuid) is distinct from true then raise exception 'FALHOU 3: a linha de A mudou'; end if;
  raise notice 'ok: 3 — o tenant não liga, não desliga, não cria e não apaga: UPDATE 0, DELETE 0, INSERT 42501';
end $$;

-- CASO 4 — DESLIGAR NUMA CONTA NÃO AFETA A OUTRA
do $$ declare r text; antes_b text; begin
  insert into public.orcamentista_config (tenant_id, ativo, valor_adicional_brl, ativado_por, ativado_em) values (tb()::uuid, true, 49.90, sa(), now());
  select row(b.*)::text into antes_b from public.orcamentista_config b where tenant_id = tb()::uuid;
  r := como(sa(), format('update public.orcamentista_config set ativo = false, atualizado_por = %L, atualizado_em = now() where tenant_id = %L', sa(), ta()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 4: o super admin não desligou A: %', r; end if;
  if (select ativo from public.orcamentista_config where tenant_id = ta()::uuid) is distinct from false then raise exception 'FALHOU 4: A não desligou'; end if;
  if (select row(b.*)::text from public.orcamentista_config b where tenant_id = tb()::uuid) is distinct from antes_b then raise exception 'FALHOU 4: B mudou'; end if;
  -- e desligar não apaga quem ligou
  if (select ativado_por from public.orcamentista_config where tenant_id = ta()::uuid) is distinct from sa() then raise exception 'FALHOU 4: desligar apagou o ativado_por'; end if;
  raise notice 'ok: 4 — desligar A deixa B byte a byte igual, e A guarda quem a ativou';
end $$;

-- CASO 5 — ANON não vê nada
do $$ begin
  if conta(null, 'select count(*) from public.orcamentista_config') not in ('0', 'ERRO 42501') then raise exception 'FALHOU 5: anon leu linhas'; end if;
  raise notice 'ok: 5 — anon não lê a configuração (%)', conta(null, 'select count(*) from public.orcamentista_config');
end $$;

-- CASO 6 — LIGADO EXIGE RASTRO: sem ativado_por/ativado_em, recusa
do $$ declare r text; begin
  r := como(sa(), format('update public.orcamentista_config set ativo = true, ativado_por = null where tenant_id = %L', ta()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 6: ligado sem quem ligou passou: %', r; end if;
  raise notice 'ok: 6 — ligado sem ativado_por: 23514 (orcamentista_config_ativacao_rastreada)';
end $$;

-- CASO 7 — TETO E AÇÃO andam juntos
do $$ declare r text; begin
  r := como(sa(), format('update public.orcamentista_config set teto_de_consumo_brl = 100, acao_ao_atingir_teto = null where tenant_id = %L', tb()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 7: teto sem ação passou: %', r; end if;
  r := como(sa(), format($q$update public.orcamentista_config set teto_de_consumo_brl = null, acao_ao_atingir_teto = 'AVISAR' where tenant_id = %L$q$, tb()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 7: ação sem teto passou: %', r; end if;
  r := como(sa(), format($q$update public.orcamentista_config set acao_ao_atingir_teto = 'DESLIGAR' where tenant_id = %L$q$, ta()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 7: ação fora do domínio passou: %', r; end if;
  raise notice 'ok: 7 — teto sem ação, ação sem teto e ação fora de BLOQUEAR/AVISAR: 23514';
end $$;

-- CASO 8 — SEGMENTO: lista fechada, e "Indústria " (com espaço) é recusado
do $$ declare r text; begin
  r := como(ua(), format($q$update public.tenant_settings set segmento_de_mercado = 'Indústria ' where tenant_id = %L$q$, ta()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 8: "Indústria " passou: %', r; end if;
  r := como(ua(), format($q$update public.tenant_settings set segmento_de_mercado = 'Outro' where tenant_id = %L$q$, ta()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 8: "Outro" passou: %', r; end if;
  r := como(ua(), format($q$update public.tenant_settings set segmento_de_mercado = 'Indústria', nicho = 'Esquadrias de alumínio' where tenant_id = %L$q$, ta()));
  if r is distinct from 'OK|1' then raise exception 'FALHOU 8: o tenant não gravou o próprio segmento: %', r; end if;
  raise notice 'ok: 8 — "Indústria " e "Outro" recusados; "Indústria" + nicho gravados PELO PRÓPRIO tenant';
end $$;

-- CASO 9 — NICHO: sem espaço nas pontas, sem vazio
do $$ declare r text; begin
  r := como(ua(), format($q$update public.tenant_settings set nicho = ' Esquadrias' where tenant_id = %L$q$, ta()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 9: nicho com espaço passou: %', r; end if;
  r := como(ua(), format($q$update public.tenant_settings set nicho = '' where tenant_id = %L$q$, ta()));
  if split_part(r, '|', 1) is distinct from '23514' then raise exception 'FALHOU 9: nicho vazio passou: %', r; end if;
  raise notice 'ok: 9 — nicho com espaço na ponta e nicho vazio: 23514';
end $$;

-- CASO 10 — o tenant B não grava o segmento de A (a política de tenant_settings segue valendo)
do $$ declare r text; begin
  r := como(ub(), format($q$update public.tenant_settings set segmento_de_mercado = 'Saúde' where tenant_id = %L$q$, ta()));
  if r is distinct from 'OK|0' then raise exception 'FALHOU 10: B gravou em A: %', r; end if;
  raise notice 'ok: 10 — B não grava o segmento de A (0 linhas)';
end $$;

-- CASO 11 — tenants.segment NÃO foi tocado
do $$ begin
  if (select segment from public.tenants where id = ta()::uuid) is distinct from 'Indústria ' then raise exception 'FALHOU 11: tenants.segment mudou'; end if;
  raise notice 'ok: 11 — tenants.segment intacto, com o espaço no fim que a regra manda NÃO normalizar agora';
end $$;
