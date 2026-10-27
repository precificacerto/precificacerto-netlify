-- Os casos da 20261027000009. Cada caso desfaz o que fez (P0099), salvo indicação.
-- `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.
create or replace function public.h_erro(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics msg = message_text, cod = returned_sqlstate;
  return cod || '|' || msg;
end $f$;

-- CASO U1 — a CHECK do Perfil saiu; a do par ficou com a definição exata; as colunas seguem nulas
do $$
declare def text;
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.orcamentista_tabela'::regclass and conname = 'orcamentista_tabela_perfil_exige_motor') then
    raise exception 'FALHOU caso U1: a CHECK do Perfil ainda existe'; end if;
  select pg_get_constraintdef(oid) into def from pg_constraint where conrelid = 'public.orcamentista_tabela'::regclass and conname = 'orcamentista_tabela_motor_par';
  if def is distinct from 'CHECK (((motor_path IS NULL) = (motor_nome IS NULL)))' then raise exception 'FALHOU caso U1: a CHECK do par mudou: %', coalesce(def, '(ausente)'); end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orcamentista_tabela' and column_name in ('motor_path', 'motor_nome') and is_nullable = 'YES') <> 2 then
    raise exception 'FALHOU caso U1: as colunas deixaram de aceitar nulo'; end if;
  raise notice 'ok: caso U1 — a CHECK do Perfil saiu, a do par ficou, as colunas seguem nulas';
end $$;
-- CASO U2 — PERFIL sem motor grava: nulo, vazio, e por UPDATE (a Estrela declara PERFIL)
do $$
declare r text;
begin
  begin
    r := public.h_erro($q$insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('f0000000-0000-0000-0000-0000000000c1', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil.xlsx', null, null, 'PVC', 'PERFIL')$q$);
    if r <> 'ok' then raise exception 'FALHOU caso U2a: PERFIL sem motor (nulo) foi recusado: %', r; end if;
    r := public.h_erro($q$insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('f0000000-0000-0000-0000-0000000000c2', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil2.xlsx', '', '', 'PVC', 'PERFIL')$q$);
    if r <> 'ok' then raise exception 'FALHOU caso U2b: PERFIL com motor vazio foi recusado: %', r; end if;
    r := public.h_erro($q$update public.orcamentista_tabela set categoria_chave = 'PERFIL' where id = '5f7acebf-3c91-46de-af00-57a47f8be288'$q$);
    if r <> 'ok' then raise exception 'FALHOU caso U2c: a Estrela (motor vazio) nao declarou PERFIL: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso U2 — PERFIL sem motor grava (nulo, vazio e por UPDATE)';
end $$;
-- CASO U3 — o par segue: caminho sem nome, e nome sem caminho, são recusados em PERFIL e em REFORCO
do $$
declare r text; c text;
begin
  foreach c in array array['PERFIL', 'REFORCO'] loop
    r := public.h_erro(format($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'r.xlsx', 'so-o-caminho', null, 'PVC', %L)$q$, c));
    if r not like '23514|%orcamentista_tabela_motor_par%' then raise exception 'FALHOU caso U3a (%): %', c, r; end if;
    r := public.h_erro(format($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'r.xlsx', null, 'so-o-nome.xlsx', 'PVC', %L)$q$, c));
    if r not like '23514|%orcamentista_tabela_motor_par%' then raise exception 'FALHOU caso U3b (%): %', c, r; end if;
  end loop;
  raise notice 'ok: caso U3 — o par motor_path/motor_nome segue recusando a metade, em PERFIL e em REFORCO';
end $$;
-- CASO U4 — NENHUMA linha mudou: o hash de cada linha de hoje é o de antes da migração
do $$
declare n int;
begin
  select count(*) into n from public.h_foto_conteudo f join public.orcamentista_tabela t on t.id = f.id where md5(t::text) <> f.h;
  if n <> 0 then raise exception 'FALHOU caso U4: % linha(s) mudaram', n; end if;
  if (select count(*) from public.orcamentista_tabela) <> (select count(*) from public.h_foto_conteudo) then raise exception 'FALHOU caso U4: a contagem de linhas mudou'; end if;
  raise notice 'ok: caso U4 — as % tabelas de hoje seguem byte a byte iguais (hash de cada linha)', (select count(*) from public.h_foto_conteudo);
end $$;
-- CASO U5 — só UMA restrição saiu: as demais da tabela e os gatilhos seguem como estavam
do $$
declare saiu text; mudou int; gat int;
begin
  select string_agg(conname, ',') into saiu from public.h_foto_restricoes f where not exists (select 1 from pg_constraint c where c.conrelid = 'public.orcamentista_tabela'::regclass and c.conname = f.conname);
  if saiu is distinct from 'orcamentista_tabela_perfil_exige_motor' then raise exception 'FALHOU caso U5: saiu % (esperado so a do Perfil)', coalesce(saiu, '(nada)'); end if;
  select count(*) into mudou from public.h_foto_restricoes f join pg_constraint c on c.conrelid = 'public.orcamentista_tabela'::regclass and c.conname = f.conname where pg_get_constraintdef(c.oid) <> f.def;
  if mudou <> 0 then raise exception 'FALHOU caso U5: % restricao(oes) mudaram de definicao', mudou; end if;
  if (select count(*) from pg_constraint where conrelid = 'public.orcamentista_tabela'::regclass) <> (select count(*) from public.h_foto_restricoes) - 1 then raise exception 'FALHOU caso U5: apareceu restricao nova'; end if;
  select count(*) into gat from public.h_foto_gatilhos g where not exists (select 1 from pg_trigger t where t.tgrelid = 'public.orcamentista_tabela'::regclass and t.tgname = g.tgname and not t.tgisinternal);
  if gat <> 0 then raise exception 'FALHOU caso U5: % gatilho(s) sumiram', gat; end if;
  raise notice 'ok: caso U5 — so a CHECK do Perfil saiu; as outras restricoes e os gatilhos seguem iguais';
end $$;
-- CASO U6 — a trava de INSERT da categoria (000005) segue de pé: tabela nova sem categoria é recusada
do $$
declare r text;
begin
  r := public.h_erro($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'sem-categoria.xlsx', null, null, 'PVC')$q$);
  if r not like '23514|%orcamentista_tabela_categoria_obrigatoria%' then raise exception 'FALHOU caso U6: %', r; end if;
  raise notice 'ok: caso U6 — tabela nova sem categoria segue recusada pelo gatilho da 000005';
end $$;
