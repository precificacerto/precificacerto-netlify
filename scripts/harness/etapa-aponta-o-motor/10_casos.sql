-- Os casos da 20261027000007 (T) e da 20261027000008 (E e A). Cada caso desfaz o que fez (P0099), salvo indicação.
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
create or replace function public.h_gravar(p_familia text, p_etapas jsonb) returns text language sql as $f$
  select public.h_erro(format('select public.superadmin_gravar_etapas_da_familia(%L, %L, %L::jsonb)', p_familia, 'e0000000-0000-0000-0000-000000000001', p_etapas::text))
$f$;
create or replace function public.h_arquivar(p_motor uuid) returns text language sql as $f$
  select public.h_erro(format('select public.superadmin_arquivar_motor(%L, %L)', p_motor, 'e0000000-0000-0000-0000-000000000001'))
$f$;

-- ═══ 20261027000007 — o motor só é exigido no PERFIL ═══
-- CASO T1 — as duas tabelas de hoje seguem iguais: com motor, categoria nula
do $$
declare n int;
begin
  select count(*) into n from public.orcamentista_tabela where motor_path is not null and motor_nome is not null and categoria_chave is null;
  if n <> 2 then raise exception 'FALHOU caso T1: % tabelas de hoje com motor nao nulo e categoria nula (esperado 2)', n; end if;
  select count(*) into n from public.orcamentista_tabela where motor_path = '' and motor_nome = '' and categoria_chave is null;
  if n <> 1 then raise exception 'FALHOU caso T1: % tabelas de hoje com motor VAZIO (esperado 1, a Estrela)', n; end if;
  raise notice 'ok: caso T1 — Wolff (motor preenchido) e Estrela (motor vazio, como em producao) seguem sem categoria';
end $$;
-- CASO T2 — Reforço e Acessórios sem arquivo de motor gravam
do $$
begin
  begin
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'reforco.xlsx', null, null, 'PVC', 'REFORCO'),
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'acessorios.xlsx', null, null, 'PVC', 'ACESSORIOS_VEDACAO');
    if (select count(*) from public.orcamentista_tabela where motor_path is null) <> 2 then raise exception 'FALHOU caso T2: as duas sem motor nao ficaram'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T2 — Reforço e Acessórios gravam sem arquivo de motor';
end $$;
-- CASO T3 — PERFIL sem motor é recusado pelo banco (23514, perfil_exige_motor); com motor grava
do $$
declare r text;
begin
  r := public.h_erro($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil.xlsx', null, null, 'PVC', 'PERFIL')$q$);
  if r not like '23514|%orcamentista_tabela_perfil_exige_motor%' then raise exception 'FALHOU caso T3a: %', r; end if;
  r := public.h_erro($q$insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('f0000000-0000-0000-0000-0000000000a1', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil.xlsx', 'p', 'm.xlsx', 'PVC', 'PERFIL')$q$);
  if r <> 'ok' then raise exception 'FALHOU caso T3b: %', r; end if;
  delete from public.orcamentista_tabela where id = 'f0000000-0000-0000-0000-0000000000a1';
  raise notice 'ok: caso T3 — PERFIL sem motor é recusado (23514); PERFIL com motor grava';
end $$;
-- CASO T3c — PERFIL com o motor VAZIO ou em branco NÃO tem motor: o banco recusa (achado do dono do produto, 27/10/2026)
do $$
declare r text; v text;
begin
  foreach v in array array['', '   ', E'\t', E'\n '] loop
    r := public.h_erro(format($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil.xlsx', %L, %L, 'PVC', 'PERFIL')$q$, v, v));
    if r not like '23514|%orcamentista_tabela_perfil_exige_motor%' then raise exception 'FALHOU caso T3c: PERFIL com motor_path % passou ou caiu em outra trava: %', quote_literal(v), r; end if;
  end loop;
  -- por UPDATE também: a Estrela (motor vazio) não pode declarar PERFIL; declarar VIDRO passa (a regra é só do PERFIL)
  r := public.h_erro($q$update public.orcamentista_tabela set categoria_chave = 'PERFIL' where id = '5f7acebf-3c91-46de-af00-57a47f8be288'$q$);
  if r not like '23514|%orcamentista_tabela_perfil_exige_motor%' then raise exception 'FALHOU caso T3d: a Estrela (motor vazio) declarou PERFIL: %', r; end if;
  raise notice 'ok: caso T3c — PERFIL com motor vazio ou em branco é recusado, no INSERT e no UPDATE (a Estrela não declara PERFIL)';
end $$;
-- CASO T4 — arquivo sem nome (ou nome sem arquivo) é recusado (motor_par)
do $$
declare r text;
begin
  r := public.h_erro($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'r.xlsx', 'so-o-caminho', null, 'PVC', 'REFORCO')$q$);
  if r not like '23514|%orcamentista_tabela_motor_par%' then raise exception 'FALHOU caso T4a: %', r; end if;
  r := public.h_erro($q$insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'r.xlsx', null, 'so-o-nome.xlsx', 'PVC', 'REFORCO')$q$);
  if r not like '23514|%orcamentista_tabela_motor_par%' then raise exception 'FALHOU caso T4b: %', r; end if;
  raise notice 'ok: caso T4 — motor com caminho sem nome, ou nome sem caminho, é recusado';
end $$;
-- CASO T5 — declarar PERFIL numa tabela sem motor é recusado; declarar VIDRO na Estrela (que tem motor) passa
do $$
declare r text;
begin
  begin
    insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia) values
      ('f0000000-0000-0000-0000-0000000000a2', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'antiga.xlsx', null, null, 'PVC');
    r := public.h_erro($q$update public.orcamentista_tabela set categoria_chave = 'PERFIL' where id = 'f0000000-0000-0000-0000-0000000000a2'$q$);
    if r not like '23514|%orcamentista_tabela_perfil_exige_motor%' then raise exception 'FALHOU caso T5a: %', r; end if;
    r := public.h_erro($q$update public.orcamentista_tabela set categoria_chave = 'VIDRO' where id = '5f7acebf-3c91-46de-af00-57a47f8be288'$q$);
    if r <> 'ok' then raise exception 'FALHOU caso T5b: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T5 — PERFIL sem motor por UPDATE é recusado; a Estrela ganha VIDRO com o motor que já tem';
end $$;

-- ═══ 20261027000008 — a etapa aponta o motor ═══
-- CASO E1 — o payload de HOJE (sem a chave motor_id) segue funcionando, como antes
do $$
declare r text; n int;
begin
  begin
    r := public.h_gravar('PVC', '[{"rotulo":"Apanhado","acao":"APANHAR","instrucao":"x","abas":["tipologias"]},{"rotulo":"Levantamento","acao":"GERAR_LEVANTAMENTO"}]'::jsonb);
    if r <> 'ok' then raise exception 'FALHOU caso E1: %', r; end if;
    select count(*) into n from public.orcamentista_familia_etapa where familia = 'PVC' and motor_id is null;
    if n <> 2 then raise exception 'FALHOU caso E1: % etapas sem motor (esperado 2)', n; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E1 — a lista sem motor_id grava as etapas como sempre';
end $$;
-- CASO E2 — A REGRESSÃO QUE IMPORTA: etapa que já aponta um motor NÃO o perde quando a lista vem sem a chave
do $$
declare r text; m uuid; id1 uuid;
begin
  begin
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao, motor_id) values ('PVC', 1, 'Apanhado', 'APANHAR', 'c0000000-0000-0000-0000-000000000001') returning id into id1;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado 2","acao":"APANHAR"}]', id1)::jsonb);
    if r <> 'ok' then raise exception 'FALHOU caso E2: %', r; end if;
    select motor_id into m from public.orcamentista_familia_etapa where id = id1;
    if m is distinct from 'c0000000-0000-0000-0000-000000000001'::uuid then raise exception 'FALHOU caso E2: o motor da etapa virou %', m; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E2 — salvar a etapa sem a chave motor_id não apaga o motor já apontado';
end $$;
-- CASO E3 — apontar, trocar e limpar: uuid aponta, outro uuid troca, null limpa
do $$
declare r text; m uuid; id1 uuid;
begin
  begin
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao) values ('PVC', 1, 'Apanhado', 'APANHAR') returning id into id1;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":"c0000000-0000-0000-0000-000000000001"}]', id1)::jsonb);
    select motor_id into m from public.orcamentista_familia_etapa where id = id1;
    if r <> 'ok' or m is distinct from 'c0000000-0000-0000-0000-000000000001'::uuid then raise exception 'FALHOU caso E3a: % / %', r, m; end if;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":"9a233c55-f377-45d3-b2ae-b1a740a98e44"}]', id1)::jsonb);
    select motor_id into m from public.orcamentista_familia_etapa where id = id1;
    if r <> 'ok' or m is distinct from '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid then raise exception 'FALHOU caso E3b: % / %', r, m; end if;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":null}]', id1)::jsonb);
    select motor_id into m from public.orcamentista_familia_etapa where id = id1;
    if r <> 'ok' or m is not null then raise exception 'FALHOU caso E3c: % / %', r, m; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E3 — apontar, trocar e limpar (null) o motor da etapa';
end $$;
-- CASO E4 — as recusas, cada uma com a etapa e o porquê (22023): motor de outra família, arquivado, inexistente, não-uuid, número
do $$
declare r text; id1 uuid;
begin
  begin
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao) values ('PVC', 1, 'Apanhado', 'APANHAR') returning id into id1;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":"c0000000-0000-0000-0000-000000000002"}]', id1)::jsonb);
    if r not like '22023|etapa 1: o motor e da familia ALUMINIO, e a etapa e da familia PVC' then raise exception 'FALHOU caso E4a: %', r; end if;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":"c0000000-0000-0000-0000-000000000003"}]', id1)::jsonb);
    if r not like '22023|etapa 1: o motor esta arquivado' then raise exception 'FALHOU caso E4b: %', r; end if;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":"c0000000-0000-0000-0000-0000000000ff"}]', id1)::jsonb);
    if r not like '22023|etapa 1: o motor nao existe' then raise exception 'FALHOU caso E4c: %', r; end if;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":"nao-e-uuid"}]', id1)::jsonb);
    if r not like '22023|etapa 1: o motor_id nao e um uuid%' then raise exception 'FALHOU caso E4d: %', r; end if;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":7}]', id1)::jsonb);
    if r not like '22023|etapa 1: o motor_id nao e um uuid%' then raise exception 'FALHOU caso E4e: %', r; end if;
    if (select motor_id from public.orcamentista_familia_etapa where id = id1) is not null then raise exception 'FALHOU caso E4: alguma recusa gravou o motor'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E4 — outra família, arquivado, inexistente, não-uuid e número são recusados (22023), sem gravar nada';
end $$;
-- CASO E5 — etapa NOVA com motor; campo desconhecido segue recusado, agora citando motor_id na frase
do $$
declare r text; m uuid;
begin
  begin
    r := public.h_gravar('PVC', '[{"rotulo":"Apanhado","acao":"APANHAR","motor_id":"c0000000-0000-0000-0000-000000000001"}]'::jsonb);
    select motor_id into m from public.orcamentista_familia_etapa where familia = 'PVC' and numero = 1;
    if r <> 'ok' or m is distinct from 'c0000000-0000-0000-0000-000000000001'::uuid then raise exception 'FALHOU caso E5a: % / %', r, m; end if;
    r := public.h_gravar('PVC', (select jsonb_build_array(jsonb_build_object('id', id, 'rotulo', 'x', 'acao', 'APANHAR', 'foo', 1)) from public.orcamentista_familia_etapa where familia = 'PVC'));
    if r not like '22023|etapa 1: o campo "foo" nao existe (so id, rotulo, acao, instrucao, abas e motor_id)' then raise exception 'FALHOU caso E5b: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E5 — etapa nova com motor grava; campo desconhecido segue recusado';
end $$;
-- CASO E6 — o log leva o motor (o to_jsonb da etapa), antes e depois
do $$
declare r text; d jsonb;
begin
  begin
    r := public.h_gravar('PVC', '[{"rotulo":"Apanhado","acao":"APANHAR","motor_id":"c0000000-0000-0000-0000-000000000001"}]'::jsonb);
    select depois into d from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_etapa' order by em desc limit 1;
    if r <> 'ok' or d -> 'orcamentista_familia_etapa' -> 0 ->> 'motor_id' is distinct from 'c0000000-0000-0000-0000-000000000001' then raise exception 'FALHOU caso E6: % / %', r, d; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E6 — o log guarda o motor da etapa';
end $$;
-- CASO A1 — arquivar planilha que uma etapa aponta é RECUSADO (22023), nomeando a etapa; nada muda
do $$
declare r text; arq timestamptz;
begin
  begin
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao, motor_id) values ('PVC', 1, 'Apanhado', 'APANHAR', 'c0000000-0000-0000-0000-000000000001');
    r := public.h_arquivar('c0000000-0000-0000-0000-000000000001');
    if r <> '22023|o motor e o da etapa 1 ("Apanhado") da familia PVC: aponte a etapa para outro motor antes de arquivar' then raise exception 'FALHOU caso A1: %', r; end if;
    select arquivado_em into arq from public.orcamentista_motor where id = 'c0000000-0000-0000-0000-000000000001';
    if arq is not null then raise exception 'FALHOU caso A1: o motor foi arquivado mesmo assim'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso A1 — arquivar o motor apontado por etapa é recusado, nomeando a etapa';
end $$;
-- CASO A2 — com mais de uma etapa a frase conta o resto, no plural
do $$
declare r text;
begin
  begin
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao, motor_id) values
      ('PVC', 1, 'Apanhado', 'APANHAR', 'c0000000-0000-0000-0000-000000000001'),
      ('PVC', 2, 'Levantamento', 'GERAR_LEVANTAMENTO', 'c0000000-0000-0000-0000-000000000001');
    r := public.h_arquivar('c0000000-0000-0000-0000-000000000001');
    if r <> '22023|o motor e o da etapa 1 ("Apanhado") da familia PVC (e de mais 1): aponte as etapas para outro motor antes de arquivar' then raise exception 'FALHOU caso A2: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso A2 — duas etapas apontam o motor: a frase diz "e de mais 1" e fala em etapas';
end $$;
-- CASO A3 — trocar de planilha: aponta a etapa para a nova, e SÓ ENTÃO arquiva a velha (o caminho do dono do produto)
do $$
declare r text; arq timestamptz; id1 uuid;
begin
  begin
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao, motor_id) values ('PVC', 1, 'Apanhado', 'APANHAR', 'c0000000-0000-0000-0000-000000000001') returning id into id1;
    r := public.h_gravar('PVC', format('[{"id":"%s","rotulo":"Apanhado","acao":"APANHAR","motor_id":"9a233c55-f377-45d3-b2ae-b1a740a98e44"}]', id1)::jsonb);
    if r <> 'ok' then raise exception 'FALHOU caso A3a: %', r; end if;
    r := public.h_arquivar('c0000000-0000-0000-0000-000000000001');
    select arquivado_em into arq from public.orcamentista_motor where id = 'c0000000-0000-0000-0000-000000000001';
    if r <> 'ok' or arq is null then raise exception 'FALHOU caso A3b: % / %', r, arq; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso A3 — aponta a etapa para a nova planilha e então arquiva a velha';
end $$;
-- CASO A4 — o que não é apontado por etapa arquiva como sempre; arquivado de novo segue recusado ("ja esta arquivado", antes da etapa)
do $$
declare r text;
begin
  begin
    r := public.h_arquivar('c0000000-0000-0000-0000-000000000002');
    if r <> 'ok' then raise exception 'FALHOU caso A4a: %', r; end if;
    r := public.h_arquivar('c0000000-0000-0000-0000-000000000002');
    if r <> '22023|o motor ja esta arquivado' then raise exception 'FALHOU caso A4b: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso A4 — motor sem etapa arquiva; o já arquivado segue recusado';
end $$;
-- CASO A5 — as duas funções seguem fechadas: só o service_role executa
do $$
declare f regprocedure; nome text;
begin
  foreach nome in array array['public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)', 'public.superadmin_arquivar_motor(uuid, uuid)'] loop
    f := to_regprocedure(nome);
    if f is null or has_function_privilege('public', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'FALHOU caso A5: % aberta ou ausente', nome;
    end if;
  end loop;
  raise notice 'ok: caso A5 — as duas funções só executam para service_role';
end $$;
-- CASO A6 — as duas continuam SECURITY DEFINER com o search_path fixo (CREATE OR REPLACE troca isso se o texto trocar)
do $$
declare nome text;
begin
  foreach nome in array array['public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)', 'public.superadmin_arquivar_motor(uuid, uuid)'] loop
    if not exists (select 1 from pg_proc p where p.oid = to_regprocedure(nome) and p.prosecdef and 'search_path=public, pg_temp' = any (p.proconfig)) then
      raise exception 'FALHOU caso A6: % deixou de ser SECURITY DEFINER com search_path fixo', nome;
    end if;
  end loop;
  raise notice 'ok: caso A6 — as duas seguem SECURITY DEFINER com search_path fixo';
end $$;
