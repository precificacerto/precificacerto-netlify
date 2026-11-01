-- Os CASOS da 20261101000002 ("Subido em" = arquivo_em), sobre o estado de produção de 01/11/2026 (09_estado.sql) com a migração aplicada DUAS vezes.
-- Cada caso roda numa subtransação e se desfaz (P0099). Imprime "ok: ..." ou "FALHOU ...". A contagem dos "-- CASO " é o que o run.sh espera.
\set ON_ERROR_STOP 0
set client_min_messages = notice;

create or replace function pg_temp.k(n text) returns text language sql stable as $$
  select case n
    when 'T2' then '21acfa75-e4e7-4de6-9b96-cdd95525467d'   -- Wolf Perfis, PVC / PERFIL — o arquivo trocado hoje
    when 'TF' then 'fe2c6667-652f-43bd-89d2-fd63673dc966'   -- IMAB, PVC / FERRAGENS
    when 'TE' then '5f7acebf-3c91-46de-af00-57a47f8be288'   -- Estrela, arquivo_path ''
    when 'W'  then '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'
    when 'SA' then 'e0000000-0000-0000-0000-000000000001'
  end
$$;
create or replace function pg_temp.em(p_id text) returns timestamptz language sql as $$ select arquivo_em from public.orcamentista_tabela where id = p_id::uuid $$;
create or replace function pg_temp.semeio() returns setof public.superadmin_alteracao_log language sql as $$
  select * from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_tabela' and l.antes ->> 'migracao' = '20261101000002_arquivo_em_da_tabela' $$;

-- CASO 1: o semeio — as três de produção com arquivo_em = criado_em, exatos; UM log por linha (a segunda aplicação não logou), sem tenant e sem autor,
-- o antes sem arquivo_em, o depois com ele, e a origem dita
do $c$ declare n int; begin
  if pg_temp.em(pg_temp.k('T2')) is distinct from '2026-10-29 19:26:10.322233+00'::timestamptz
     or pg_temp.em(pg_temp.k('TF')) is distinct from '2026-10-28 16:24:41.563921+00'::timestamptz
     or pg_temp.em(pg_temp.k('TE')) is distinct from '2026-10-25 18:56:49.619728+00'::timestamptz then
    raise exception 'FALHOU caso 1: arquivo_em semeado diferente de criado_em: %', (select jsonb_agg(jsonb_build_object(id, arquivo_em)) from public.orcamentista_tabela);
  end if;
  select count(*) into n from pg_temp.semeio() l
   where l.tenant_id is null and l.por is null and not (l.antes -> 'orcamentista_tabela' ? 'arquivo_em')
     and (l.depois -> 'orcamentista_tabela' ->> 'arquivo_em')::timestamptz = (l.antes -> 'orcamentista_tabela' ->> 'criado_em')::timestamptz
     and l.depois ->> 'origem_de_arquivo_em' like 'criado_em:%';
  if n is distinct from 3 or (select count(*) from pg_temp.semeio()) is distinct from 3::bigint
     or (select count(distinct chave) from pg_temp.semeio()) is distinct from 3::bigint then
    raise exception 'FALHOU caso 1: o log do semeio: % na forma, % no total', n, (select count(*) from pg_temp.semeio());
  end if;
  raise notice 'ok: caso 1 — as 3 de producao semeadas com criado_em, um log por linha (a 2a aplicacao nao logou)';
end $c$;

-- CASO 2: a TROCA de arquivo (o UPDATE que o PATCH faz): arquivo_em vira o instante da troca; criado_em não muda
do $c$ begin
  begin
    update public.orcamentista_tabela set arquivo_path = pg_temp.k('W') || '/arquivo/novo.xlsx', arquivo_nome = 'novo.xlsx' where id = pg_temp.k('T2')::uuid;
    if pg_temp.em(pg_temp.k('T2')) is distinct from now()
       or (select criado_em from public.orcamentista_tabela where id = pg_temp.k('T2')::uuid) is distinct from '2026-10-29 19:26:10.322233+00'::timestamptz then
      raise exception 'FALHOU caso 2: arquivo_em % (esperado %), criado_em %', pg_temp.em(pg_temp.k('T2')), now(), (select criado_em from public.orcamentista_tabela where id = pg_temp.k('T2')::uuid);
    end if;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null; end;
  raise notice 'ok: caso 2 — trocar o arquivo_path grava o instante da troca em arquivo_em; criado_em fica';
end $c$;

-- CASO 3: os outros UPDATEs não mexem em arquivo_em: vigência, família, vigente, o nome sozinho, o motor da tabela, a categoria
do $c$ declare v_antes timestamptz := pg_temp.em(pg_temp.k('TF')); c text; begin
  foreach c in array array['vigencia = ''01/11 a 30/11''', 'familia = null', 'vigente = true', 'arquivo_nome = ''outro nome.xlsx''',
                           'motor_path = ''x/motor/m.xlsx'', motor_nome = ''m.xlsx''', 'fornecedor_id = fornecedor_id'] loop
    begin
      execute format('update public.orcamentista_tabela set %s where id = %L::uuid', c, pg_temp.k('TF'));
      if pg_temp.em(pg_temp.k('TF')) is distinct from v_antes then raise exception 'FALHOU caso 3: "%" mudou arquivo_em para %', c, pg_temp.em(pg_temp.k('TF')); end if;
      raise exception using errcode = 'P0099';
    exception when sqlstate 'P0099' then null; end;
  end loop;
  raise notice 'ok: caso 3 — vigencia, familia, vigente, nome, motor e fornecedor nao mexem em arquivo_em';
end $c$;

-- CASO 4: arquivo_em não se escreve à mão — sozinho fica como estava; junto com a troca do arquivo, vale o instante da troca
do $c$ declare v_antes timestamptz := pg_temp.em(pg_temp.k('TE')); begin
  begin
    update public.orcamentista_tabela set arquivo_em = '2030-01-01' where id = pg_temp.k('TE')::uuid;
    if pg_temp.em(pg_temp.k('TE')) is distinct from v_antes then raise exception 'FALHOU caso 4: arquivo_em escrito a mao: %', pg_temp.em(pg_temp.k('TE')); end if;
    update public.orcamentista_tabela set arquivo_em = '2030-01-01', arquivo_path = 'e/arquivo/novo.xlsx' where id = pg_temp.k('TE')::uuid;
    if pg_temp.em(pg_temp.k('TE')) is distinct from now() then raise exception 'FALHOU caso 4: com a troca, arquivo_em %', pg_temp.em(pg_temp.k('TE')); end if;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null; end;
  raise notice 'ok: caso 4 — arquivo_em escrito a mao e ignorado; com a troca do arquivo vale o instante da troca';
end $c$;

-- CASO 5: o mesmo arquivo_path de novo não é troca (o Estrela tem '' — e '' continua '' sem mudar a data)
do $c$ declare v_antes timestamptz := pg_temp.em(pg_temp.k('TE')); begin
  begin
    update public.orcamentista_tabela set arquivo_path = '' where id = pg_temp.k('TE')::uuid;
    if pg_temp.em(pg_temp.k('TE')) is distinct from v_antes then raise exception 'FALHOU caso 5: o mesmo arquivo mudou a data: %', pg_temp.em(pg_temp.k('TE')); end if;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null; end;
  raise notice 'ok: caso 5 — gravar o mesmo arquivo_path nao e troca';
end $c$;

-- CASO 6: a CRIAÇÃO — arquivo_em = criado_em (o default e o criado_em explícito); o arquivo_em mandado no INSERT é ignorado
do $c$ declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); begin
  begin
    insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave, arquivo_em)
    values (a, pg_temp.k('W')::uuid, pg_temp.k('W') || '/arquivo/a.xlsx', 'a.xlsx', 'PVC', 'REFORCO', '2030-01-01');
    insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave, criado_em)
    values (b, pg_temp.k('W')::uuid, pg_temp.k('W') || '/arquivo/b.xlsx', 'b.xlsx', 'PVC', 'ACESSORIOS_VEDACAO', '2026-10-01 10:00:00+00');
    if pg_temp.em(a::text) is distinct from now() or (select criado_em from public.orcamentista_tabela where id = a) is distinct from now()
       or pg_temp.em(b::text) is distinct from '2026-10-01 10:00:00+00'::timestamptz then
      raise exception 'FALHOU caso 6: a % (esperado %), b %', pg_temp.em(a::text), now(), pg_temp.em(b::text);
    end if;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null; end;
  raise notice 'ok: caso 6 — a tabela nova nasce com arquivo_em = criado_em; o arquivo_em do INSERT e ignorado';
end $c$;

-- CASO 7: o arrasto do catálogo continua: remover a família PVC leva a tabela de PERFIL (o log tem a linha inteira, com arquivo_em) e
-- a de FERRAGENS só perde a família — sem mudar arquivo_em
do $c$ declare v_antes timestamptz := pg_temp.em(pg_temp.k('TF')); v_t2 timestamptz := pg_temp.em(pg_temp.k('T2')); begin
  begin
    perform public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, 'familia', 'PVC', public.superadmin_arrasto_do_catalogo('familia', 'PVC') ->> 'assinatura');
    if exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('T2')::uuid)
       or (select familia from public.orcamentista_tabela where id = pg_temp.k('TF')::uuid) is not null
       or pg_temp.em(pg_temp.k('TF')) is distinct from v_antes then
      raise exception 'FALHOU caso 7: T2 ficou? %; TF familia %, arquivo_em %', exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('T2')::uuid),
        (select familia from public.orcamentista_tabela where id = pg_temp.k('TF')::uuid), pg_temp.em(pg_temp.k('TF'));
    end if;
    if not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_tabela' and l.chave = pg_temp.k('T2') and l.depois is null
                    and (l.antes -> 'orcamentista_tabela' ->> 'arquivo_em')::timestamptz = v_t2) then
      raise exception 'FALHOU caso 7: o log da remocao da T2 sem arquivo_em: %', (select jsonb_agg(l.antes) from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_tabela' and l.chave = pg_temp.k('T2') and l.depois is null);
    end if;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null; end;
  raise notice 'ok: caso 7 — o arrasto da familia segue: a de PERFIL sai logada com arquivo_em; a de FERRAGENS perde a familia e guarda arquivo_em';
end $c$;

-- CASO 8: a forma — a coluna timestamptz NOT NULL default now(); o gatilho em INSERT e em UPDATE de qualquer coluna; a função fechada a anon e authenticated
do $c$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orcamentista_tabela' and column_name = 'arquivo_em'
                   and data_type = 'timestamp with time zone' and is_nullable = 'NO' and column_default = 'now()')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.orcamentista_tabela'::regclass and tgname = 'orcamentista_tabela_arquivo_em' and tgenabled = 'O'
                      and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE ON public.orcamentista_tabela FOR EACH ROW%')
     or has_function_privilege('anon', 'public.orcamentista_tabela_arquivo_em()', 'execute')
     or has_function_privilege('authenticated', 'public.orcamentista_tabela_arquivo_em()', 'execute') then
    raise exception 'FALHOU caso 8: a forma da coluna, do gatilho ou da funcao';
  end if;
  raise notice 'ok: caso 8 — coluna timestamptz NOT NULL default now(); gatilho BEFORE INSERT OR UPDATE; funcao fechada';
end $c$;
