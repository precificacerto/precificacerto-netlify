-- Os casos da 20261029000003, sobre o estado de PRODUÇÃO de 29/10/2026 (os mesmos ids), com a migração aplicada duas vezes.
-- Cada caso desfaz o que fez (P0099). `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.
-- Os casos K são a TRAVA (DML direto, como postgres: o banco recusa sem função nenhuma no meio); os F são as funções. O gatilho adiado roda no COMMIT,
-- que um caso desfeito não alcança: aqui ele é disparado por `SET CONSTRAINTS ALL IMMEDIATE` (que confere, na hora, o que estava adiado); os
-- commits de verdade estão em 15_commit.sh.
create or replace function public.h_erro(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text; con text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics msg = message_text, cod = returned_sqlstate, con = constraint_name;
  return cod || '|' || coalesce(con, '') || '|' || msg;
end $f$;
-- o SQL e, logo depois, o que o COMMIT conferiria (o gatilho adiado)
create or replace function public.h_erro_no_commit(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text; con text;
begin
  execute p_sql;
  set constraints all immediate;
  set constraints all deferred;
  return 'ok';
exception when others then
  get stacked diagnostics msg = message_text, cod = returned_sqlstate, con = constraint_name;
  return cod || '|' || coalesce(con, '') || '|' || msg;
end $f$;
create or replace function public.h_payload(n int) returns jsonb language sql as $f$
  select jsonb_build_object(
    'regras', (select coalesce(jsonb_agg(jsonb_build_object('codigo', 'C' || i, 'descricao', 'regra', 'linha', 'EUROPA 42', 'tipo', 'Perfil', 'tipologias', jsonb_build_array('T' || i))), '[]'::jsonb) from generate_series(1, n) i),
    'tipologias', (select coalesce(jsonb_agg(jsonb_build_object('tipologia', 'T' || i, 'linha', 'EUROPA 42', 'n_regras', 1, 'n_condicionais', 0, 'variaveis', jsonb_build_array('L'))), '[]'::jsonb) from generate_series(1, n) i),
    'formulas', jsonb_build_array(jsonb_build_object('linha', 'EUROPA 42', 'linha_original', 'PVC EUROPA 42', 'variavel', 'HFOL', 'formula', '(H-10)')),
    'detalhes', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'descricao', 'Janela ' || i, 'tipo', 'Correr')), '[]'::jsonb) from generate_series(1, n) i),
    'formulas_da_tipologia', '[]'::jsonb, 'perfis', '[]'::jsonb,
    'vidros', '[]'::jsonb, 'baguetes', '[]'::jsonb, 'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb,
    'otimizacao', '[]'::jsonb, 'avisos', '[]'::jsonb, 'contagens', jsonb_build_object('normalizados', 0))
$f$;
-- um motor direto nas tabelas (os casos K não passam por função): o motor e as famílias dele
create or replace function public.h_motor(p_cat text, p_familias text[]) returns uuid language plpgsql as $f$
declare m uuid;
begin
  insert into public.orcamentista_motor (fornecedor_id, categoria_chave, arquivo_nome, arquivo_path)
  values ('f2000000-0000-0000-0000-000000000002', p_cat, 'm.xlsx', 'f2000000-0000-0000-0000-000000000002/motor/' || gen_random_uuid() || '.xlsx') returning id into m;
  insert into public.orcamentista_motor_familia (motor_id, familia) select m, f from unnest(p_familias) f;
  return m;
end $f$;
-- uma etapa direta na tabela: a instância (PVC ou ALUMINIO), o número, o motor e a exigida
create or replace function public.h_sql_etapa(p_mp uuid, p_fam text, p_num int, p_motor uuid, p_exigida text) returns text language sql as $f$
  select format('insert into public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, rotulo, acao, motor_id, motor_familia_exigida)
                 values (%L, %L, %L, %s, %L, %L, %L, %L)', '20e08592-f957-4e72-b7eb-251387e34eb9', p_mp, p_fam, p_num, 'Etapa ' || p_num, 'APANHAR', p_motor, p_exigida)
$f$;
create or replace function public.h_sql_item(p_ordem int, p_fam text, p_motor uuid, p_exigida text) returns text language sql as $f$
  select format('insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, familia, motor_id, motor_familia_exigida)
                 values (%L, %L, %s, %L, %L, %L, %L)', '20e08592-f957-4e72-b7eb-251387e34eb9', '1e000000-0000-0000-0000-000000000001', p_ordem, 'P-' || p_ordem, p_fam, p_motor, p_exigida)
$f$;
create or replace function public.h_familias(m uuid) returns text language sql as $f$
  select coalesce(string_agg(familia, ',' order by familia), '') from public.orcamentista_motor_familia where motor_id = m
$f$;
-- o que nenhuma recusa pode mudar: motores, ligações, etapas, itens e log
create or replace function public.h_estado() returns text language sql as $f$
  select md5(coalesce((select string_agg(m::text, '|' order by m.id) from public.orcamentista_motor m), '') || '#'
          || coalesce((select string_agg(l::text, '|' order by l.motor_id, l.familia) from public.orcamentista_motor_familia l), '') || '#'
          || coalesce((select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e), '') || '#'
          || coalesce((select string_agg(i::text, '|' order by i.id) from public.orcamentista_levantamento_item i), '') || '#'
          || (select count(*) from public.superadmin_alteracao_log)::text)
$f$;
-- PVC: a instância "Esquadrias de PVC WOLF" (as 3 etapas de produção); AL: a instância de ALUMINIO da mesma empresa, sem etapa
create or replace function public.h_pvc() returns uuid language sql as $f$ select '79d764fe-4acd-43e2-bed9-38e20667ca3d'::uuid $f$;
create or replace function public.h_al() returns uuid language sql as $f$ select 'a1000000-0000-0000-0000-0000000000a1'::uuid $f$;

-- CASO M1 — a migração sobre o estado de PRODUÇÃO, aplicada DUAS vezes: o motor da Wolff tem EXATAMENTE a ligação PVC; as colunas da família saíram
-- do motor e nada mais dele muda; as 3 etapas e o item ficam iguais; conteúdo e tempos intactos; o log tem EXATAMENTE 1 linha nova (o semeio)
do $$
declare n int; WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44';
begin
  if (select count(*) from public.orcamentista_motor_familia) <> 1 or public.h_familias(WM) <> 'PVC' then
    raise exception 'FALHOU caso M1: as ligacoes sao %', (select string_agg(motor_id || ':' || familia, ',') from public.orcamentista_motor_familia); end if;
  if exists (select m.id, m.fornecedor_id, m.categoria_chave, m.arquivo_nome, m.arquivo_path, m.arquivado_em, m.criado_por from public.orcamentista_motor m
             except select a.id, a.fornecedor_id, a.categoria_chave, a.arquivo_nome, a.arquivo_path, a.arquivado_em, a.criado_por from public.h_motor_antes_da_000003 a)
     or (select count(*) from public.orcamentista_motor) <> (select count(*) from public.h_motor_antes_da_000003) then
    raise exception 'FALHOU caso M1: o motor mudou'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'orcamentista_motor' and column_name in ('familia', 'familia_exigida')) then
    raise exception 'FALHOU caso M1: o motor ainda tem a familia'; end if;
  if exists (select to_jsonb(e) from public.orcamentista_familia_etapa e except select to_jsonb(a) from public.h_etapas_antes_da_000003 a)
     or (select count(*) from public.orcamentista_familia_etapa) <> 3 then
    raise exception 'FALHOU caso M1: as etapas mudaram'; end if;
  if exists (select to_jsonb(i) from public.orcamentista_levantamento_item i except select to_jsonb(a) from public.h_itens_antes_da_000003 a) then
    raise exception 'FALHOU caso M1: o item de levantamento mudou'; end if;
  if public.h_foto_do_motor(WM) is distinct from (select foto from public.h_foto_antes) then raise exception 'FALHOU caso M1: o conteudo do motor mudou'; end if;
  select count(*) into n from public.superadmin_alteracao_log l
   where l.tabela = 'orcamentista_motor_familia' and l.chave = WM::text and l.tenant_id is null and l.por is null
     and l.antes ->> 'migracao' = '20261029000003_motor_para_n_familias'
     and l.antes -> 'orcamentista_motor' ->> 'familia' = 'PVC' and l.antes -> 'orcamentista_motor' ->> 'categoria_chave' = 'PERFIL'
     and l.depois -> 'orcamentista_motor_familia' = jsonb_build_array(jsonb_build_object('motor_id', WM, 'familia', 'PVC'));
  if n <> 1 or (select count(*) from public.superadmin_alteracao_log) - (select h.n from public.h_log_antes_da_000003 h) <> 1 then
    raise exception 'FALHOU caso M1: o log (% do semeio; % novas no total)', n, (select count(*) from public.superadmin_alteracao_log) - (select h.n from public.h_log_antes_da_000003 h); end if;
  if (select count(*) from pg_constraint where conname like '%exigida%' or conname like 'orcamentista_motor_familia%' or conname = 'orcamentista_motor_sem_familia') <> 9
     or not exists (select 1 from pg_constraint where conname = 'orcamentista_levantamento_item_motor_fkey') then
    raise exception 'FALHOU caso M1: a estrutura (% constraints)', (select string_agg(conname, ',') from pg_constraint where conname like '%exigida%' or conname like 'orcamentista_motor_familia%' or conname = 'orcamentista_motor_sem_familia'); end if;
  raise notice 'ok: caso M1 — aplicada duas vezes: o motor da Wolff tem so a ligacao PVC; a familia saiu do motor; etapas, item, conteudo e tempos intactos; 1 linha de log';
end $$;

-- CASO K1 — o motor com DUAS famílias: a etapa de cada uma aponta o MESMO motor (PVC exigindo PVC, ALUMINIO exigindo ALUMINIO)
do $$
declare r1 text; r2 text; m uuid;
begin
  begin
    m := public.h_motor('PERFIL', array['PVC', 'ALUMINIO']);
    r1 := public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 10, m, 'PVC'));
    r2 := public.h_erro(public.h_sql_etapa(public.h_al(), 'ALUMINIO', 1, m, 'ALUMINIO'));
    if r1 <> 'ok' or r2 <> 'ok' or (select count(*) from public.orcamentista_familia_etapa where motor_id = m) <> 2 then raise exception 'FALHOU caso K1: % / %', r1, r2; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K1 — motor com 2 familias: a etapa de cada uma aponta o mesmo motor';
end $$;

-- CASO K2 — a etapa de família X NÃO aponta motor que só tem Y: dizendo X, a FK recusa (não há a ligação); dizendo Y, ou '*', a CHECK recusa
do $$
declare r1 text; r2 text; r3 text; m uuid;
begin
  begin
    m := public.h_motor('PERFIL', array['ALUMINIO']);
    r1 := public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 10, m, 'PVC'));
    r2 := public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 10, m, 'ALUMINIO'));
    r3 := public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 10, m, '*'));
    if r1 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' or r2 not like '23514|orcamentista_familia_etapa_motor_familia_exigida|%'
       or r3 not like '23514|orcamentista_familia_etapa_motor_familia_exigida|%' then
      raise exception 'FALHOU caso K2: % / % / %', r1, r2, r3; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K2 — etapa PVC nao aponta motor so ALUMINIO: dizendo PVC a FK recusa; dizendo ALUMINIO ou * a CHECK recusa';
end $$;

-- CASO K3 — a exigida existe se e só se há motor: com motor e sem exigida, e com exigida e sem motor, a CHECK recusa
do $$
declare r1 text; r2 text;
begin
  r1 := public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 10, '9a233c55-f377-45d3-b2ae-b1a740a98e44', null));
  r2 := public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 10, null, 'PVC'));
  if r1 not like '23514|orcamentista_familia_etapa_motor_familia_exigida|%' or r2 not like '23514|orcamentista_familia_etapa_motor_familia_exigida|%' then
    raise exception 'FALHOU caso K3: % / %', r1, r2; end if;
  raise notice 'ok: caso K3 — motor sem exigida e exigida sem motor: a CHECK recusa os dois';
end $$;

-- CASO K4 — tirar do motor a família que uma etapa usa é recusado pela FK (RESTRICT), e trocá-la também (NO ACTION): o motor da Wolff e as 3 etapas
do $$
declare r1 text; r2 text; e text := public.h_estado();
begin
  r1 := public.h_erro($q$delete from public.orcamentista_motor_familia where motor_id = '9a233c55-f377-45d3-b2ae-b1a740a98e44' and familia = 'PVC'$q$);
  r2 := public.h_erro($q$update public.orcamentista_motor_familia set familia = 'ALUMINIO' where motor_id = '9a233c55-f377-45d3-b2ae-b1a740a98e44'$q$);
  if r1 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' or r2 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' or public.h_estado() <> e then
    raise exception 'FALHOU caso K4: % / %', r1, r2; end if;
  raise notice 'ok: caso K4 — a familia PVC em uso pelas 3 etapas nao sai do motor da Wolff, nem se troca (a FK recusa)';
end $$;

-- CASO K5 — o ITEM de levantamento tem a mesma trava: motor de 2 famílias serve o item ALUMINIO; motor só ALUMINIO recusa o item PVC (FK); '*' a
-- CHECK recusa; e a família que o item usa não sai do motor
do $$
declare r1 text; r2 text; r3 text; r4 text; m2 uuid; ma uuid;
begin
  begin
    m2 := public.h_motor('PERFIL', array['PVC', 'ALUMINIO']); ma := public.h_motor('PERFIL', array['ALUMINIO']);
    r1 := public.h_erro(public.h_sql_item(2, 'ALUMINIO', m2, 'ALUMINIO'));
    r2 := public.h_erro(public.h_sql_item(3, 'PVC', ma, 'PVC'));
    r3 := public.h_erro(public.h_sql_item(4, 'PVC', m2, '*'));
    r4 := public.h_erro(format($q$delete from public.orcamentista_motor_familia where motor_id = %L and familia = 'ALUMINIO'$q$, m2));
    if r1 <> 'ok' or r2 not like '23503|orcamentista_levantamento_item_motor_exigida_fkey|%' or r3 not like '23514|orcamentista_levantamento_item_motor_familia_exigida|%'
       or r4 not like '23503|orcamentista_levantamento_item_motor_exigida_fkey|%' then
      raise exception 'FALHOU caso K5: % / % / % / %', r1, r2, r3, r4; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K5 — o item: motor de 2 familias serve, motor de outra familia nao (FK), * nao (CHECK), familia em uso nao sai';
end $$;

-- CASO K6 — TODO MOTOR TEM PELO MENOS UMA FAMÍLIA (o gatilho adiado, conferido como no COMMIT): o motor sem ligação, tirar a única ligação, ou movê-la
-- para outro motor é recusado nomeando o motor; o motor com ligação, tirar uma de duas, e apagar o motor sem uso (o CASCADE leva a ligação) passam
do $$
declare r1 text; r2 text; r3 text; r4 text; r5 text; r6 text; m uuid; m2 uuid; e text := public.h_estado();
begin
  r1 := public.h_erro_no_commit($q$insert into public.orcamentista_motor (fornecedor_id, categoria_chave, arquivo_nome, arquivo_path)
                                   values ('f2000000-0000-0000-0000-000000000002', 'PERSIANAS', 'p.xlsx', 'f2000000-0000-0000-0000-000000000002/motor/p.xlsx')$q$);
  begin
    m := public.h_motor('PERSIANAS', array['ALUMINIO']);
    r2 := public.h_erro_no_commit('select 1');
    r3 := public.h_erro_no_commit(format($q$delete from public.orcamentista_motor_familia where motor_id = %L$q$, m));
    m2 := public.h_motor('PERSIANAS', array['PVC', 'ALUMINIO']);
    r4 := public.h_erro_no_commit(format($q$delete from public.orcamentista_motor_familia where motor_id = %L and familia = 'ALUMINIO'$q$, m2));
    r5 := public.h_erro_no_commit(format($q$update public.orcamentista_motor_familia set motor_id = %L where motor_id = %L$q$, m2, m));
    r6 := public.h_erro_no_commit(format($q$delete from public.orcamentista_motor where id = %L$q$, m));
    if r1 not like '23514|orcamentista_motor_sem_familia|o motor % ficou sem familia%' or r2 <> 'ok'
       or r3 <> format('23514|orcamentista_motor_sem_familia|o motor %s ficou sem familia: todo motor atua em pelo menos uma familia', m)
       or r4 <> 'ok'
       or r5 <> format('23514|orcamentista_motor_sem_familia|o motor %s ficou sem familia: todo motor atua em pelo menos uma familia', m)
       or r6 <> 'ok' or exists (select 1 from public.orcamentista_motor_familia where motor_id = m) or public.h_familias(m2) <> 'PVC' then
      raise exception 'FALHOU caso K6: % / % / % / % / % / %', r1, r2, r3, r4, r5, r6; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  if public.h_estado() <> e then raise exception 'FALHOU caso K6: o estado mudou'; end if;
  raise notice 'ok: caso K6 — o motor sem familia, tirar a unica, move-la: recusa nomeando o motor; com familia, tirar uma de duas e apagar o motor passam';
end $$;

-- CASO K7 — a ligação: a família tem de ser do catálogo; a mesma família duas vezes não; tirar do catálogo a família que um motor usa, não (RESTRICT)
do $$
declare r1 text; r2 text; r3 text;
begin
  r1 := public.h_erro($q$insert into public.orcamentista_motor_familia values ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'XYZ')$q$);
  r2 := public.h_erro($q$insert into public.orcamentista_motor_familia values ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'PVC')$q$);
  begin
    -- as etapas usam PVC pela matéria-prima e pela etapa: um motor só ALUMINIO, sem uso, para a recusa ser a da ligação
    perform public.h_motor('PERSIANAS', array['ALUMINIO']);
    delete from public.orcamentista_materia_prima where id = public.h_al();
    r3 := public.h_erro($q$delete from public.orcamentista_familia_catalogo where chave = 'ALUMINIO'$q$);
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  if r1 not like '23503|orcamentista_motor_familia_familia_fkey|%' or r2 not like '23505|orcamentista_motor_familia_pkey|%'
     or r3 not like '23503|orcamentista_motor_familia_familia_fkey|%' then
    raise exception 'FALHOU caso K7: % / % / %', r1, r2, r3; end if;
  raise notice 'ok: caso K7 — familia fora do catalogo, repetida e a do catalogo em uso por um motor: recusadas';
end $$;

-- CASO K8 — a ligação tem a RLS e as MESMAS políticas e grants do motor: as quatro, mesma operação, mesma expressão, mesmos papéis; nenhum grant a
-- anon e authenticated; service_role com todos
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.orcamentista_motor_familia'::regclass) then raise exception 'FALHOU caso K8: sem RLS'; end if;
  if exists (
       (select replace(polname, 'orcamentista_motor_', ''), polcmd, polroles, polpermissive, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
          from pg_policy where polrelid = 'public.orcamentista_motor'::regclass
        except
        select replace(polname, 'orcamentista_motor_familia_', ''), polcmd, polroles, polpermissive, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
          from pg_policy where polrelid = 'public.orcamentista_motor_familia'::regclass)
       union all
       (select replace(polname, 'orcamentista_motor_familia_', ''), polcmd, polroles, polpermissive, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
          from pg_policy where polrelid = 'public.orcamentista_motor_familia'::regclass
        except
        select replace(polname, 'orcamentista_motor_', ''), polcmd, polroles, polpermissive, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
          from pg_policy where polrelid = 'public.orcamentista_motor'::regclass))
     or (select count(*) from pg_policy where polrelid = 'public.orcamentista_motor_familia'::regclass) <> 4 then
    raise exception 'FALHOU caso K8: as politicas diferem das do motor'; end if;
  if has_table_privilege('anon', 'public.orcamentista_motor_familia', 'SELECT') or has_table_privilege('authenticated', 'public.orcamentista_motor_familia', 'SELECT')
     or has_table_privilege('authenticated', 'public.orcamentista_motor_familia', 'INSERT') or has_table_privilege('anon', 'public.orcamentista_motor_familia', 'DELETE')
     or not has_table_privilege('service_role', 'public.orcamentista_motor_familia', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'FALHOU caso K8: os grants'; end if;
  raise notice 'ok: caso K8 — a ligacao tem RLS, as quatro politicas do motor e so o service_role';
end $$;

-- CASO F1 — CRIAR motor com as famílias PVC e ALUMINIO (fora de ordem): as duas ligações, o log da criação com as famílias em ordem, e o COMMIT passa
do $$
declare r jsonb; m uuid; c text;
begin
  begin
    r := public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002', 'PERSIANAS', array['PVC', 'ALUMINIO'],
                                       'f2000000-0000-0000-0000-000000000002/motor/n.xlsx', 'n.xlsx', public.h_payload(2));
    m := (r ->> 'motor_id')::uuid;
    c := public.h_erro_no_commit('select 1');
    if public.h_familias(m) <> 'ALUMINIO,PVC' or (r ->> 'tipologias')::int <> 2 or c <> 'ok'
       or not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_motor' and l.chave = m::text
                        and l.depois -> 'familias' = '["ALUMINIO", "PVC"]'::jsonb and l.depois -> 'orcamentista_motor' ->> 'categoria_chave' = 'PERSIANAS') then
      raise exception 'FALHOU caso F1: familias=% retorno=% commit=%', public.h_familias(m), r, c; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F1 — criar motor com PVC e ALUMINIO: duas ligacoes, log com as familias, o commit passa';
end $$;

-- CASO F2 — CRIAR: lista nula, vazia, com família nula, com repetida (nomeada) e com famílias fora do catálogo (nomeadas, em ordem): recusa 22023, e nada muda
do $$
declare e text := public.h_estado(); r1 text; r2 text; r3 text; r4 text; r5 text;
  g text := $q$select public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002', 'PERFIL', %s,
               'f2000000-0000-0000-0000-000000000002/motor/n.xlsx', 'n.xlsx', public.h_payload(1))$q$;
begin
  r1 := public.h_erro(format(g, 'null'));
  r2 := public.h_erro(format(g, $q$'{}'::text[]$q$));
  r3 := public.h_erro(format(g, $q$array['PVC', null]$q$));
  r4 := public.h_erro(format(g, $q$array['PVC', 'ALUMINIO', 'PVC']$q$));
  r5 := public.h_erro(format(g, $q$array['XYZ', 'PVC', 'ABC']$q$));
  if r1 <> '22023||o motor atua em pelo menos uma familia: a lista veio vazia. Nada foi gravado.'
     or r2 <> '22023||o motor atua em pelo menos uma familia: a lista veio vazia. Nada foi gravado.'
     or r3 <> '22023||uma familia da lista veio vazia. Nada foi gravado.'
     or r4 <> '22023||a familia PVC aparece mais de uma vez na lista. Nada foi gravado.'
     or r5 <> '22023||familia fora do catalogo: ABC, XYZ. Nada foi gravado.'
     or public.h_estado() <> e then
    raise exception 'FALHOU caso F2: % / % / % / % / %', r1, r2, r3, r4, r5; end if;
  raise notice 'ok: caso F2 — criar: lista nula, vazia, com nula, repetida e fora do catalogo: recusas nomeadas, nada muda';
end $$;

-- CASO F3 — EDITAR o motor da Wolff (COM uso) só nas famílias: acrescentar ALUMINIO passa (com antes e depois no log); tirar ALUMINIO, sem uso, passa
do $$
declare WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; p text; r jsonb; n0 int := (select count(*) from public.superadmin_alteracao_log);
begin
  begin
    select arquivo_path into p from public.orcamentista_motor where id = WM;
    r := public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', WM, '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERFIL', array['ALUMINIO', 'PVC'], p);
    if public.h_familias(WM) <> 'ALUMINIO,PVC' or r -> 'familias' <> '["ALUMINIO", "PVC"]'::jsonb
       or not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_motor' and l.chave = WM::text
                        and l.antes -> 'familias' = '["PVC"]'::jsonb and l.depois -> 'familias' = '["ALUMINIO", "PVC"]'::jsonb) then
      raise exception 'FALHOU caso F3: acrescentar: % / %', public.h_familias(WM), r; end if;
    r := public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', WM, '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERFIL', array['PVC'], p);
    if public.h_familias(WM) <> 'PVC' or (select count(*) from public.superadmin_alteracao_log) - n0 <> 2
       or (select fornecedor_id || categoria_chave || arquivo_path from public.orcamentista_motor where id = WM)
          <> '44c5c0fe-a0d3-4aab-802d-20a6eff3f654PERFIL' || p then
      raise exception 'FALHOU caso F3: tirar: %', public.h_familias(WM); end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F3 — editar as familias com uso: acrescentar e tirar a que ninguem usa passam, com log; o resto do motor nao muda';
end $$;

-- CASO F4 — EDITAR: tirar a família que etapas e um item usam é RECUSA 23001, nomeando a família, as etapas (empresa / família-instância / etapa) e o
-- levantamento do item; com mais de 3 etapas, "e mais N"; nada muda
do $$
declare WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; p text; r1 text; r2 text; e text;
begin
  begin
    select arquivo_path into p from public.orcamentista_motor where id = WM;
    insert into public.orcamentista_motor_familia values (WM, 'ALUMINIO');
    e := public.h_estado();
    r1 := public.h_erro(format($q$select public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', %L, '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERFIL', array['ALUMINIO'], %L)$q$, WM, p));
    perform public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 4, WM, 'PVC'));
    perform public.h_erro(public.h_sql_item(2, 'PVC', WM, 'PVC'));
    r2 := public.h_erro(format($q$select public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', %L, '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERFIL', array['ALUMINIO'], %L)$q$, WM, p));
    if r1 <> '23001||a familia PVC nao pode sair do motor: em uso por 3 etapa(s) (Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 1; Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 2; Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 3). Aponte-os para outro motor antes. Nada foi gravado.'
       or r2 <> '23001||a familia PVC nao pode sair do motor: em uso por 4 etapa(s) (Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 1; Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 2; Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 3; e mais 1) e 1 item(ns) de levantamento (Esquadrias De Paula Ltda / levantamento "Obra da Rua A"). Aponte-os para outro motor antes. Nada foi gravado.'
       or public.h_familias(WM) <> 'ALUMINIO,PVC' then
      raise exception 'FALHOU caso F4: % // %', r1, r2; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F4 — tirar a familia em uso: 23001 nomeando etapas (empresa / familia / etapa, e mais N) e o levantamento do item; nada muda';
end $$;

-- CASO F5 — EDITAR: fornecedor ou categoria com uso continua recusado (as famílias, não); as mesmas famílias em outra ordem é "nada mudou"; lista vazia,
-- repetida e fora do catálogo, as recusas da criação; nada muda
do $$
declare WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; p text; e text := public.h_estado(); r1 text; r2 text; r3 text; r4 text; r5 text;
  g text := $q$select public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', '9a233c55-f377-45d3-b2ae-b1a740a98e44', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', %L, %s, %L)$q$;
begin
  select arquivo_path into p from public.orcamentista_motor where id = WM;
  r1 := public.h_erro(format(g, 'PERSIANAS', $q$array['PVC', 'ALUMINIO']$q$, p));
  r2 := public.h_erro(format(g, 'PERFIL', $q$array['PVC']$q$, p));
  r3 := public.h_erro(format(g, 'PERFIL', $q$'{}'::text[]$q$, p));
  r4 := public.h_erro(format(g, 'PERFIL', $q$array['ALUMINIO', 'ALUMINIO']$q$, p));
  r5 := public.h_erro(format(g, 'PERFIL', $q$array['PVC', 'QQ']$q$, p));
  if r1 <> '22023||o motor tem uso (3 etapa(s), 0 item(ns) de levantamento): categoria e fornecedor so se editam em motor sem uso (as familias se editam com uso). Para outro arquivo, troque o arquivo. Nada foi gravado.'
     or r2 <> '22023||nada mudou: o fornecedor, a categoria e as familias sao os de agora. Nada foi gravado.'
     or r3 <> '22023||o motor atua em pelo menos uma familia: a lista veio vazia. Nada foi gravado.'
     or r4 <> '22023||a familia ALUMINIO aparece mais de uma vez na lista. Nada foi gravado.'
     or r5 <> '22023||familia fora do catalogo: QQ. Nada foi gravado.'
     or public.h_estado() <> e then
    raise exception 'FALHOU caso F5: % / % / % / % / %', r1, r2, r3, r4, r5; end if;
  raise notice 'ok: caso F5 — editar: categoria com uso, nada mudou, lista vazia, repetida e fora do catalogo: recusas nomeadas, nada muda';
end $$;

-- CASO F6 — EDITAR um motor SEM uso: categoria e famílias juntas passam (PERSIANAS PVC -> FERRAGENS ALUMINIO+PVC), na mesma chamada
do $$
declare m uuid; p text; r jsonb;
begin
  begin
    m := public.h_motor('PERSIANAS', array['PVC']);
    select arquivo_path into p from public.orcamentista_motor where id = m;
    r := public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', m, 'f2000000-0000-0000-0000-000000000002', 'FERRAGENS', array['PVC', 'ALUMINIO'], p);
    if public.h_familias(m) <> 'ALUMINIO,PVC' or (select categoria_chave from public.orcamentista_motor where id = m) <> 'FERRAGENS'
       or r -> 'orcamentista_motor' ->> 'categoria_chave' <> 'FERRAGENS' then
      raise exception 'FALHOU caso F6: % / %', public.h_familias(m), r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F6 — editar sem uso: categoria e familias juntas';
end $$;

-- CASO F7 — GRAVAR ETAPAS: o motor de PVC e ALUMINIO serve a instância PVC e a ALUMINIO (cada etapa exige a sua); o motor só PVC, na ALUMINIO, é recusa
-- com a família nomeada; a lista sem motor_id MANTÉM; null LIMPA motor e exigida
do $$
declare m uuid; mp uuid; r text; e text; lista jsonb;
begin
  begin
    m := public.h_motor('PERFIL', array['PVC', 'ALUMINIO']); mp := public.h_motor('PERFIL', array['PVC']);
    perform public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', public.h_al(),
              jsonb_build_array(jsonb_build_object('rotulo', 'Apanhado', 'acao', 'APANHAR', 'motor_id', m)));
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'rotulo', x.rotulo, 'acao', x.acao, 'motor_id', m) order by x.numero), '[]') into lista
      from public.orcamentista_familia_etapa x where x.materia_prima_id = public.h_pvc();
    perform public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', public.h_pvc(), lista);
    if (select string_agg(familia || ':' || motor_familia_exigida, ',' order by familia, numero) from public.orcamentista_familia_etapa where motor_id = m)
       <> 'ALUMINIO:ALUMINIO,PVC:PVC,PVC:PVC,PVC:PVC' then
      raise exception 'FALHOU caso F7: o motor de 2 familias'; end if;
    e := public.h_estado();
    r := public.h_erro(format($q$select public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', %L,
              jsonb_build_array(jsonb_build_object('id', (select id from public.orcamentista_familia_etapa where materia_prima_id = %L), 'rotulo', 'Apanhado', 'acao', 'APANHAR', 'motor_id', %L::uuid)))$q$,
              public.h_al(), public.h_al(), mp));
    if r <> '22023||etapa 1: o motor nao atua na familia ALUMINIO' or public.h_estado() <> e then raise exception 'FALHOU caso F7: a recusa: %', r; end if;
    perform public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', public.h_al(),
              jsonb_build_array(jsonb_build_object('id', (select id from public.orcamentista_familia_etapa where materia_prima_id = public.h_al()), 'rotulo', 'Apanhado', 'acao', 'APANHAR')));
    if (select motor_id::text || motor_familia_exigida from public.orcamentista_familia_etapa where materia_prima_id = public.h_al()) <> m::text || 'ALUMINIO' then
      raise exception 'FALHOU caso F7: ausente nao manteve'; end if;
    perform public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', public.h_al(),
              jsonb_build_array(jsonb_build_object('id', (select id from public.orcamentista_familia_etapa where materia_prima_id = public.h_al()), 'rotulo', 'Apanhado', 'acao', 'APANHAR', 'motor_id', null)));
    if exists (select 1 from public.orcamentista_familia_etapa where materia_prima_id = public.h_al() and (motor_id is not null or motor_familia_exigida is not null)) then
      raise exception 'FALHOU caso F7: null nao limpou'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F7 — gravar etapas: o motor de 2 familias serve as duas instancias; o de outra familia e recusa nomeada; ausente mantem; null limpa';
end $$;

-- CASO F8 — TROCAR O ARQUIVO de um motor de PVC e ALUMINIO usado pelas duas instâncias: o novo nasce com as MESMAS famílias, as etapas passam a ele com a
-- exigida delas, e o antigo é arquivado com as ligações intactas
do $$
declare m uuid; r jsonb; novo uuid;
begin
  begin
    m := public.h_motor('PERFIL', array['PVC', 'ALUMINIO']);
    perform public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 10, m, 'PVC'));
    perform public.h_erro(public.h_sql_etapa(public.h_al(), 'ALUMINIO', 1, m, 'ALUMINIO'));
    r := public.superadmin_trocar_arquivo_do_motor('e0000000-0000-0000-0000-000000000001', m, 'f2000000-0000-0000-0000-000000000002/motor/novo.xlsx', 'novo.xlsx', public.h_payload(1));
    novo := (r ->> 'motor_id')::uuid;
    if public.h_familias(novo) <> 'ALUMINIO,PVC' or public.h_familias(m) <> 'ALUMINIO,PVC' or (r ->> 'etapas_reapontadas')::int <> 2
       or (select string_agg(familia || ':' || motor_familia_exigida, ',' order by familia) from public.orcamentista_familia_etapa where motor_id = novo) <> 'ALUMINIO:ALUMINIO,PVC:PVC'
       or (select arquivado_em from public.orcamentista_motor where id = m) is null or public.h_erro_no_commit('select 1') <> 'ok' then
      raise exception 'FALHOU caso F8: % / %', public.h_familias(novo), r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F8 — trocar o arquivo: o novo com as mesmas 2 familias, as 2 etapas reapontadas com a exigida delas, o antigo arquivado';
end $$;

-- CASO P1 — as quatro funções reescritas e a do gatilho FECHADAS; as assinaturas antigas (p_familia text) não existem mais
do $$
declare f regprocedure; nome text;
begin
  foreach nome in array array['public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb)', 'public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text)',
                              'public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)', 'public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)'] loop
    f := to_regprocedure(nome);
    if f is null or has_function_privilege('public', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then raise exception 'FALHOU caso P1: %', nome; end if;
  end loop;
  f := to_regprocedure('public.orcamentista_motor_confere_familias()');
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then raise exception 'FALHOU caso P1: a do gatilho aberta'; end if;
  if to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)') is not null
     or to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text)') is not null then
    raise exception 'FALHOU caso P1: uma assinatura antiga continua'; end if;
  raise notice 'ok: caso P1 — as funcoes fechadas; as assinaturas antigas sairam';
end $$;
