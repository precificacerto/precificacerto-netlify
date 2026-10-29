-- Os casos da 20261029000002, sobre o estado de PRODUÇÃO de 29/10/2026 (os mesmos ids), com a migração aplicada duas vezes.
-- Cada caso desfaz o que fez (P0099). `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.
-- Os casos K são a TRAVA (DML direto, como postgres: o banco recusa sem função nenhuma no meio); os F são as funções.
create or replace function public.h_erro(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text; con text;
begin
  execute p_sql;
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
-- um motor direto na tabela (os casos K não passam por função)
create or replace function public.h_motor(p_cat text, p_fam text) returns uuid language sql as $f$
  insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path)
  values (p_fam, 'f2000000-0000-0000-0000-000000000002', p_cat, 'm.xlsx', 'f2000000-0000-0000-0000-000000000002/motor/' || gen_random_uuid() || '.xlsx') returning id
$f$;
-- uma etapa direta na tabela: a instância (PVC ou ALUMINIO), o número, o motor e a exigida
create or replace function public.h_sql_etapa(p_mp uuid, p_fam text, p_num int, p_motor uuid, p_exigida text) returns text language sql as $f$
  select format('insert into public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, rotulo, acao, motor_id, motor_familia_exigida)
                 values (%L, %L, %L, %s, %L, %L, %L, %L)', '20e08592-f957-4e72-b7eb-251387e34eb9', p_mp, p_fam, p_num, 'Etapa ' || p_num, 'APANHAR', p_motor, p_exigida)
$f$;
-- a lista de etapas que existe, para a função de gravar (sem o motor_id: ausente MANTÉM)
create or replace function public.h_lista(p_mp uuid) returns jsonb language sql as $f$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'rotulo', e.rotulo, 'acao', e.acao, 'abas', to_jsonb(e.abas)) order by e.numero), '[]'::jsonb)
    from public.orcamentista_familia_etapa e where e.materia_prima_id = p_mp
$f$;
-- o que nenhuma recusa pode mudar: motores, etapas, itens e log
create or replace function public.h_estado() returns text language sql as $f$
  select md5(coalesce((select string_agg(m::text, '|' order by m.id) from public.orcamentista_motor m), '') || '#'
          || coalesce((select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e), '') || '#'
          || coalesce((select string_agg(i::text, '|' order by i.id) from public.orcamentista_levantamento_item i), '') || '#'
          || (select count(*) from public.superadmin_alteracao_log)::text)
$f$;

-- CASO M1 — a migração sobre o estado de PRODUÇÃO, aplicada DUAS vezes: o motor da Wolff exige PVC; as 3 etapas ganham 'PVC' e nada mais delas
-- muda; o conteúdo e os tempos do motor, o item de levantamento e o motor intactos; o log tem EXATAMENTE 3 linhas novas (a segunda aplicação não loga)
do $$
declare n int; WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44';
begin
  if not exists (select 1 from public.orcamentista_motor where id = WM and familia = 'PVC' and categoria_chave = 'PERFIL' and familia_exigida = 'PVC') then
    raise exception 'FALHOU caso M1: o motor da Wolff nao exige PVC'; end if;
  if exists (select m.id, m.familia, m.fornecedor_id, m.categoria_chave, m.arquivo_nome, m.arquivo_path, m.arquivado_em from public.orcamentista_motor m
             except select a.id, a.familia, a.fornecedor_id, a.categoria_chave, a.arquivo_nome, a.arquivo_path, a.arquivado_em from public.h_motor_antes_da_000002 a) then
    raise exception 'FALHOU caso M1: o motor mudou'; end if;
  if (select count(*) from public.orcamentista_familia_etapa where motor_id = WM and motor_familia_exigida = 'PVC'
        and id in ('bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d', 'ed9a9b06-d898-4f75-8487-e260d8ba8ec0', 'dd8d3526-f08e-47e1-81c3-a6770214516f')) <> 3 then
    raise exception 'FALHOU caso M1: as 3 etapas nao exigem PVC'; end if;
  if exists (select e.id, e.tenant_id, e.materia_prima_id, e.familia, e.numero, e.rotulo, e.acao, e.instrucao, e.abas, e.motor_id, e.atualizado_por, e.atualizado_em
               from public.orcamentista_familia_etapa e
             except select a.id, a.tenant_id, a.materia_prima_id, a.familia, a.numero, a.rotulo, a.acao, a.instrucao, a.abas, a.motor_id, a.atualizado_por, a.atualizado_em
               from public.h_etapas_antes_da_000002 a)
     or (select count(*) from public.orcamentista_familia_etapa) <> (select count(*) from public.h_etapas_antes_da_000002) then
    raise exception 'FALHOU caso M1: outra coisa das etapas mudou'; end if;
  if public.h_foto_do_motor(WM) is distinct from (select foto from public.h_foto_antes) then raise exception 'FALHOU caso M1: o conteudo do motor mudou'; end if;
  if exists (select i.id, i.familia, i.motor_id from public.orcamentista_levantamento_item i except select a.id, a.familia, a.motor_id from public.h_itens_antes_da_000002 a)
     or exists (select 1 from public.orcamentista_levantamento_item where motor_familia_exigida is not null) then
    raise exception 'FALHOU caso M1: o item de levantamento mudou'; end if;
  select count(*) into n from public.superadmin_alteracao_log l
   where l.tabela = 'orcamentista_familia_etapa' and l.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' and l.por is null
     and l.antes ->> 'migracao' = '20261029000002_familia_do_motor_so_no_perfil'
     and l.antes -> 'orcamentista_familia_etapa' ? 'motor_familia_exigida' and l.antes -> 'orcamentista_familia_etapa' ->> 'motor_familia_exigida' is null
     and l.depois -> 'orcamentista_familia_etapa' ->> 'motor_familia_exigida' = 'PVC';
  if n <> 3 or (select count(*) from public.superadmin_alteracao_log) - (select h.n from public.h_log_antes_da_000002 h) <> 3 then
    raise exception 'FALHOU caso M1: o log (% da migracao; % novas no total)', n, (select count(*) from public.superadmin_alteracao_log) - (select h.n from public.h_log_antes_da_000002 h); end if;
  -- a estrutura: a familia do motor nula permitida; as FKs (motor_id, familia) e o UNIQUE (id, familia) fora; as novas no lugar
  if (select is_nullable from information_schema.columns where table_name = 'orcamentista_motor' and column_name = 'familia') <> 'YES'
     or exists (select 1 from pg_constraint where conname in ('orcamentista_familia_etapa_motor_fkey', 'orcamentista_levantamento_item_motor_familia_fkey', 'orcamentista_motor_id_familia_key'))
     or (select count(*) from pg_constraint where conname in ('orcamentista_motor_familia_so_no_perfil', 'orcamentista_motor_id_familia_exigida_key',
           'orcamentista_familia_etapa_motor_familia_exigida', 'orcamentista_familia_etapa_motor_exigida_fkey',
           'orcamentista_levantamento_item_motor_familia_exigida', 'orcamentista_levantamento_item_motor_exigida_fkey')) <> 6
     or not exists (select 1 from pg_constraint where conname = 'orcamentista_levantamento_item_motor_fkey') then
    raise exception 'FALHOU caso M1: a estrutura (as constraints antigas, as novas ou o NOT NULL)'; end if;
  raise notice 'ok: caso M1 — aplicada duas vezes: as 3 etapas exigem PVC e nada mais muda; motor, conteudo, tempos e item intactos; 3 linhas de log, nenhuma da segunda vez';
end $$;

-- CASO K1 — etapa PVC -> motor PERFIL PVC, dizendo PVC: passa
do $$
declare r text;
begin
  begin
    r := public.h_erro(public.h_sql_etapa('79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 10, '9a233c55-f377-45d3-b2ae-b1a740a98e44', 'PVC'));
    if r <> 'ok' then raise exception 'FALHOU caso K1: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K1 — etapa PVC aponta motor PERFIL PVC';
end $$;

-- CASO K2 — etapa PVC -> motor PERFIL ALUMINIO dizendo PVC, e dizendo '*' (a tentativa de burlar): a FK recusa as duas — o motor exige ALUMINIO
do $$
declare r1 text; r2 text; m uuid;
begin
  begin
    m := public.h_motor('PERFIL', 'ALUMINIO');
    r1 := public.h_erro(public.h_sql_etapa('79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 10, m, 'PVC'));
    r2 := public.h_erro(public.h_sql_etapa('79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 10, m, '*'));
    if r1 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' or r2 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' then
      raise exception 'FALHOU caso K2: % / %', r1, r2; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K2 — etapa PVC nao aponta motor PERFIL ALUMINIO, nem dizendo PVC nem dizendo * (a FK recusa as duas)';
end $$;

-- CASO K3 — etapa PVC -> motor PERFIL ALUMINIO dizendo ALUMINIO: a CHECK recusa (a exigida é a família da etapa ou '*')
do $$
declare r text; m uuid;
begin
  begin
    m := public.h_motor('PERFIL', 'ALUMINIO');
    r := public.h_erro(public.h_sql_etapa('79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 10, m, 'ALUMINIO'));
    if r not like '23514|orcamentista_familia_etapa_motor_familia_exigida|%' then raise exception 'FALHOU caso K3: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K3 — etapa PVC dizendo a linha ALUMINIO do motor: a CHECK recusa';
end $$;

-- CASO K4 — o MESMO motor de persiana (sem família) serve a etapa PVC e a etapa ALUMINIO, as duas dizendo '*'; dizendo PVC, a FK recusa
do $$
declare r1 text; r2 text; r3 text; m uuid;
begin
  begin
    m := public.h_motor('PERSIANAS', null);
    if (select familia_exigida from public.orcamentista_motor where id = m) is distinct from '*' then raise exception 'FALHOU caso K4: o motor sem familia nao exige *'; end if;
    r1 := public.h_erro(public.h_sql_etapa('79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 10, m, '*'));
    r2 := public.h_erro(public.h_sql_etapa('a1000000-0000-0000-0000-0000000000a1', 'ALUMINIO', 1, m, '*'));
    r3 := public.h_erro(public.h_sql_etapa('79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 11, m, 'PVC'));
    if r1 <> 'ok' or r2 <> 'ok' or r3 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' then raise exception 'FALHOU caso K4: % / % / %', r1, r2, r3; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K4 — um motor de persiana so serve a etapa PVC e a ALUMINIO; dizendo PVC, a FK recusa';
end $$;

-- CASO K5 — a exigida existe se e só se há motor: com motor e sem exigida, e com exigida e sem motor, a CHECK recusa
do $$
declare r1 text; r2 text;
begin
  begin
    r1 := public.h_erro(public.h_sql_etapa('79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 10, '9a233c55-f377-45d3-b2ae-b1a740a98e44', null));
    r2 := public.h_erro(public.h_sql_etapa('79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC', 10, null, '*'));
    if r1 not like '23514|orcamentista_familia_etapa_motor_familia_exigida|%' or r2 not like '23514|orcamentista_familia_etapa_motor_familia_exigida|%' then
      raise exception 'FALHOU caso K5: % / %', r1, r2; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K5 — motor sem exigida e exigida sem motor: a CHECK recusa os dois';
end $$;

-- CASO K6 — o motor: PERFIL sem família e PERSIANAS com família, a CHECK recusa os dois; a exigida é GERADA e não se escreve
do $$
declare r1 text; r2 text; r3 text;
begin
  r1 := public.h_erro($q$select public.h_motor('PERFIL', null)$q$);
  r2 := public.h_erro($q$select public.h_motor('PERSIANAS', 'PVC')$q$);
  r3 := public.h_erro($q$insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path, familia_exigida)
                        values (null, 'f2000000-0000-0000-0000-000000000002', 'PERSIANAS', 'm.xlsx', 'x/motor/m.xlsx', 'PVC')$q$);
  if r1 not like '23514|orcamentista_motor_familia_so_no_perfil|%' or r2 not like '23514|orcamentista_motor_familia_so_no_perfil|%' or r3 not like '428C9|%' then
    raise exception 'FALHOU caso K6: % / % / %', r1, r2, r3; end if;
  raise notice 'ok: caso K6 — motor PERFIL sem familia e PERSIANAS com familia: a CHECK recusa; a exigida e gerada e nao se escreve';
end $$;

-- CASO K7 — trocar a família de um motor COM USO, e dar família a um motor de persiana COM USO: a FK recusa (ON UPDATE NO ACTION na coluna gerada)
do $$
declare r1 text; r2 text; m uuid;
begin
  begin
    r1 := public.h_erro($q$update public.orcamentista_motor set familia = 'ALUMINIO' where id = '9a233c55-f377-45d3-b2ae-b1a740a98e44'$q$);
    m := public.h_motor('PERSIANAS', null);
    perform public.h_erro(public.h_sql_etapa('a1000000-0000-0000-0000-0000000000a1', 'ALUMINIO', 1, m, '*'));
    r2 := public.h_erro(format($q$update public.orcamentista_motor set categoria_chave = 'PERFIL', familia = 'ALUMINIO' where id = %L$q$, m));
    if r1 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' or r2 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' then
      raise exception 'FALHOU caso K7: % / %', r1, r2; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K7 — a familia de um motor com uso nao muda, nem a do motor de persiana (a FK recusa)';
end $$;

-- CASO K8 — o ITEM de levantamento tem a mesma trava: persiana dizendo '*' passa; PERFIL ALUMINIO dizendo '*' a FK recusa; motor sem exigida a CHECK recusa
do $$
declare r1 text; r2 text; r3 text; mp uuid; ma uuid;
  g text := 'insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, familia, motor_id, motor_familia_exigida) values (%L, %L, %s, %L, %L, %L, %L)';
begin
  begin
    mp := public.h_motor('PERSIANAS', null); ma := public.h_motor('PERFIL', 'ALUMINIO');
    r1 := public.h_erro(format(g, '20e08592-f957-4e72-b7eb-251387e34eb9', '1e000000-0000-0000-0000-000000000001', 2, 'P-1', 'PVC', mp, '*'));
    r2 := public.h_erro(format(g, '20e08592-f957-4e72-b7eb-251387e34eb9', '1e000000-0000-0000-0000-000000000001', 3, 'P-2', 'PVC', ma, '*'));
    r3 := public.h_erro(format(g, '20e08592-f957-4e72-b7eb-251387e34eb9', '1e000000-0000-0000-0000-000000000001', 4, 'P-3', 'PVC', '9a233c55-f377-45d3-b2ae-b1a740a98e44', null));
    if r1 <> 'ok' or r2 not like '23503|orcamentista_levantamento_item_motor_exigida_fkey|%' or r3 not like '23514|orcamentista_levantamento_item_motor_familia_exigida|%' then
      raise exception 'FALHOU caso K8: % / % / %', r1, r2, r3; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K8 — o item de levantamento: persiana passa; PERFIL de outra linha a FK recusa; motor sem exigida a CHECK recusa';
end $$;

-- CASO F1 — criar motor de PERSIANA SEM família: nasce com família nula, exige '*', e loga; com família, recusa com frase e nada muda
do $$
declare res jsonb; m uuid; r text; est text; RS uuid := 'f2000000-0000-0000-0000-000000000002'; SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
begin
  begin
    res := public.superadmin_criar_motor(SUPER, RS, 'PERSIANAS', null, RS::text || '/motor/u1-persiana.xlsx', 'persiana.xlsx', public.h_payload(1));
    m := (res ->> 'motor_id')::uuid;
    if not exists (select 1 from public.orcamentista_motor where id = m and familia is null and familia_exigida = '*' and categoria_chave = 'PERSIANAS') then
      raise exception 'FALHOU caso F1: o motor de persiana nao nasceu sem familia'; end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = m::text and antes is null) then raise exception 'FALHOU caso F1: o log'; end if;
    est := public.h_estado();
    r := public.h_erro(format('select public.superadmin_criar_motor(%L, %L, %L, %L, %L, %L, %L::jsonb)', SUPER, RS, 'PERSIANAS', 'PVC', RS::text || '/motor/u2.xlsx', 'p.xlsx', public.h_payload(1)::text));
    if r not like '22023||so o motor de Perfil tem familia (linha): o de PERSIANAS serve qualquer linha.%' or public.h_estado() <> est then raise exception 'FALHOU caso F1: com familia (%)', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F1 — criar motor de persiana sem familia: nasce nula e exige *; com familia, recusa com frase e nada muda';
end $$;

-- CASO F2 — criar motor de PERFIL: sem família, ou com família fora do catálogo, recusa com frase e nada muda; com ALUMINIO, nasce e exige ALUMINIO
do $$
declare r1 text; r2 text; m uuid; est text; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
  g text := 'select public.superadmin_criar_motor(%L, %L, %L, %L, %L, %L, %L::jsonb)';
begin
  begin
    est := public.h_estado();
    r1 := public.h_erro(format(g, SUPER, W, 'PERFIL', null, W::text || '/motor/u.xlsx', 'u.xlsx', public.h_payload(1)::text));
    r2 := public.h_erro(format(g, SUPER, W, 'PERFIL', 'VECA', W::text || '/motor/u.xlsx', 'u.xlsx', public.h_payload(1)::text));
    if r1 not like '22023||o motor de Perfil tem familia (linha), e ela tem de ser do catalogo.%' or r2 not like '22023||o motor de Perfil tem familia (linha)%' or public.h_estado() <> est then
      raise exception 'FALHOU caso F2: % / %', r1, r2; end if;
    m := (public.superadmin_criar_motor(SUPER, W, 'PERFIL', 'ALUMINIO', W::text || '/motor/u.xlsx', 'u.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    if not exists (select 1 from public.orcamentista_motor where id = m and familia = 'ALUMINIO' and familia_exigida = 'ALUMINIO') then raise exception 'FALHOU caso F2: o motor ALUMINIO'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F2 — motor de Perfil sem familia ou com familia fora do catalogo: recusa com frase; com ALUMINIO, nasce e exige ALUMINIO';
end $$;

-- CASO F3 — gravar etapas: o motor de persiana serve a família PVC e a ALUMINIO (a exigida é '*'); a lista sem motor_id MANTÉM motor e exigida; null
-- limpa os dois; apontar de novo o da Wolff volta a exigir PVC
do $$
declare m uuid; RS uuid := 'f2000000-0000-0000-0000-000000000002'; SUPER uuid := 'e0000000-0000-0000-0000-000000000001'; T uuid := '20e08592-f957-4e72-b7eb-251387e34eb9';
  PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; AL uuid := 'a1000000-0000-0000-0000-0000000000a1'; E1 uuid := 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d';
begin
  begin
    m := (public.superadmin_criar_motor(SUPER, RS, 'PERSIANAS', null, RS::text || '/motor/u1.xlsx', 'p.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    perform public.superadmin_gravar_etapas_da_materia_prima(T, SUPER, AL, jsonb_build_array(jsonb_build_object('rotulo', 'Persiana', 'acao', 'APANHAR', 'motor_id', m)));
    perform public.superadmin_gravar_etapas_da_materia_prima(T, SUPER, PV, public.h_lista(PV) || jsonb_build_array(jsonb_build_object('rotulo', 'Persiana', 'acao', 'APANHAR', 'motor_id', m)));
    if (select count(*) from public.orcamentista_familia_etapa where motor_id = m and motor_familia_exigida = '*') <> 2 then raise exception 'FALHOU caso F3: a persiana nas duas familias'; end if;
    if (select count(*) from public.orcamentista_familia_etapa where materia_prima_id = PV and motor_id = '9a233c55-f377-45d3-b2ae-b1a740a98e44' and motor_familia_exigida = 'PVC') <> 3 then
      raise exception 'FALHOU caso F3: a lista sem motor_id nao manteve as 3'; end if;
    perform public.superadmin_gravar_etapas_da_materia_prima(T, SUPER, PV,
      (select jsonb_agg(case when x ->> 'id' = E1::text then x || jsonb_build_object('motor_id', null) else x end) from jsonb_array_elements(public.h_lista(PV)) x));
    if not exists (select 1 from public.orcamentista_familia_etapa where id = E1 and motor_id is null and motor_familia_exigida is null) then raise exception 'FALHOU caso F3: null nao limpou os dois'; end if;
    perform public.superadmin_gravar_etapas_da_materia_prima(T, SUPER, PV,
      (select jsonb_agg(case when x ->> 'id' = E1::text then x || jsonb_build_object('motor_id', '9a233c55-f377-45d3-b2ae-b1a740a98e44') else x end) from jsonb_array_elements(public.h_lista(PV)) x));
    if not exists (select 1 from public.orcamentista_familia_etapa where id = E1 and motor_id = '9a233c55-f377-45d3-b2ae-b1a740a98e44' and motor_familia_exigida = 'PVC') then
      raise exception 'FALHOU caso F3: apontar de novo nao exigiu PVC'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F3 — gravar etapas: persiana nas familias PVC e ALUMINIO (exige *); sem motor_id mantem; null limpa os dois; apontar de novo exige PVC';
end $$;

-- CASO F4 — gravar etapas: a família PVC apontando motor PERFIL ALUMINIO recusa com a frase da função, e nada muda
do $$
declare m uuid; r text; est text; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
  PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d';
begin
  begin
    m := (public.superadmin_criar_motor(SUPER, W, 'PERFIL', 'ALUMINIO', W::text || '/motor/u.xlsx', 'u.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    est := public.h_estado();
    r := public.h_erro(format('select public.superadmin_gravar_etapas_da_materia_prima(%L, %L, %L, %L::jsonb)', '20e08592-f957-4e72-b7eb-251387e34eb9', SUPER, PV,
           (public.h_lista(PV) || jsonb_build_array(jsonb_build_object('rotulo', 'Outra linha', 'acao', 'APANHAR', 'motor_id', m)))::text));
    if r not like '22023||etapa 4: o motor e do tipo ALUMINIO, e a familia e do tipo PVC' or public.h_estado() <> est then raise exception 'FALHOU caso F4: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F4 — gravar etapas: a familia PVC apontando motor PERFIL ALUMINIO recusa com a frase da funcao, e nada muda';
end $$;

-- CASO F5 — EDITAR (sem uso): a família anda com a categoria — PERSIANAS -> PERFIL PVC, PERFIL PVC -> PERFIL ALUMINIO, PERFIL -> PERSIANAS sem família,
-- cada um com log; PERSIANAS com família, PERFIL sem família ou fora do catálogo, e nada mudado (a família conta) recusam com frase e nada muda
do $$
declare m uuid; p text; r1 text; r2 text; r3 text; r4 text; est text; n int;
  RS uuid := 'f2000000-0000-0000-0000-000000000002'; SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
  g text := 'select public.superadmin_editar_motor(%L, %L, %L, %L, %L, %L)';
begin
  begin
    m := (public.superadmin_criar_motor(SUPER, RS, 'PERSIANAS', null, RS::text || '/motor/u1.xlsx', 'p.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    p := RS::text || '/motor/u1.xlsx';
    select count(*) into n from public.superadmin_alteracao_log;
    perform public.superadmin_editar_motor(SUPER, m, RS, 'PERFIL', 'PVC', p);
    if not exists (select 1 from public.orcamentista_motor where id = m and categoria_chave = 'PERFIL' and familia = 'PVC' and familia_exigida = 'PVC') then raise exception 'FALHOU caso F5: para PERFIL PVC'; end if;
    perform public.superadmin_editar_motor(SUPER, m, RS, 'PERFIL', 'ALUMINIO', p);
    if not exists (select 1 from public.orcamentista_motor where id = m and familia = 'ALUMINIO') then raise exception 'FALHOU caso F5: so a familia'; end if;
    perform public.superadmin_editar_motor(SUPER, m, RS, 'PERSIANAS', null, p);
    if not exists (select 1 from public.orcamentista_motor where id = m and categoria_chave = 'PERSIANAS' and familia is null and familia_exigida = '*') then raise exception 'FALHOU caso F5: de volta a PERSIANAS'; end if;
    if (select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = m::text) <> 4
       or (select count(*) from public.superadmin_alteracao_log) - n <> 3
       or not exists (select 1 from public.superadmin_alteracao_log where chave = m::text and antes -> 'orcamentista_motor' ->> 'familia' = 'PVC' and depois -> 'orcamentista_motor' ->> 'familia' = 'ALUMINIO') then
      raise exception 'FALHOU caso F5: o log'; end if;
    est := public.h_estado();
    r1 := public.h_erro(format(g, SUPER, m, RS, 'PERSIANAS', 'PVC', p));
    r2 := public.h_erro(format(g, SUPER, m, RS, 'PERFIL', null, p));
    r3 := public.h_erro(format(g, SUPER, m, RS, 'PERFIL', 'VECA', p));
    r4 := public.h_erro(format(g, SUPER, m, RS, 'PERSIANAS', null, p));
    if r1 not like '22023||so o motor de Perfil tem familia (linha): o de PERSIANAS serve qualquer linha.%' or r2 not like '22023||o motor de Perfil tem familia (linha)%'
       or r3 not like '22023||o motor de Perfil tem familia (linha)%' or r4 not like '22023||nada mudou: o fornecedor, a categoria e a familia sao os de agora.%' or public.h_estado() <> est then
      raise exception 'FALHOU caso F5: % / % / % / %', r1, r2, r3, r4; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F5 — editar sem uso: a familia anda com a categoria (3 edicoes, 3 logs); com familia fora do Perfil, sem familia no Perfil e nada mudado, recusa com frase';
end $$;

-- CASO F6 — EDITAR o motor da Wolff (com uso): continua recusado, nomeando quantos; a assinatura antiga (sem a família) não existe mais
do $$
declare r text; est text := public.h_estado();
begin
  r := public.h_erro($q$select public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', '9a233c55-f377-45d3-b2ae-b1a740a98e44',
                        '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERSIANAS', null, '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/wolff.xlsx')$q$);
  if r not like '22023||o motor tem uso (3 etapa(s), 0 item(ns) de levantamento)%' or public.h_estado() <> est then raise exception 'FALHOU caso F6: %', r; end if;
  if to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text)') is not null then raise exception 'FALHOU caso F6: a assinatura antiga continua'; end if;
  raise notice 'ok: caso F6 — editar o motor da Wolff (com uso) continua recusado; a assinatura antiga saiu';
end $$;

-- CASO F7 — TROCAR O ARQUIVO de um motor de persiana usado pelas famílias PVC e ALUMINIO: o novo nasce SEM família, as duas etapas passam a ele
-- exigindo '*', o antigo é arquivado; e trocar o da Wolff continua: o novo é PERFIL PVC e as 3 etapas exigem PVC
do $$
declare m uuid; novo uuid; novo_w uuid; RS uuid := 'f2000000-0000-0000-0000-000000000002'; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654';
  SUPER uuid := 'e0000000-0000-0000-0000-000000000001'; T uuid := '20e08592-f957-4e72-b7eb-251387e34eb9';
  PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; AL uuid := 'a1000000-0000-0000-0000-0000000000a1';
begin
  begin
    m := (public.superadmin_criar_motor(SUPER, RS, 'PERSIANAS', null, RS::text || '/motor/u1.xlsx', 'p.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    perform public.superadmin_gravar_etapas_da_materia_prima(T, SUPER, AL, jsonb_build_array(jsonb_build_object('rotulo', 'Persiana', 'acao', 'APANHAR', 'motor_id', m)));
    perform public.superadmin_gravar_etapas_da_materia_prima(T, SUPER, PV, public.h_lista(PV) || jsonb_build_array(jsonb_build_object('rotulo', 'Persiana', 'acao', 'APANHAR', 'motor_id', m)));
    novo := (public.superadmin_trocar_arquivo_do_motor(SUPER, m, RS::text || '/motor/u2.xlsx', 'p2.xlsx', public.h_payload(2)) ->> 'motor_id')::uuid;
    if not exists (select 1 from public.orcamentista_motor where id = novo and familia is null and familia_exigida = '*' and categoria_chave = 'PERSIANAS') then raise exception 'FALHOU caso F7: o novo'; end if;
    if (select count(*) from public.orcamentista_familia_etapa where motor_id = novo and motor_familia_exigida = '*') <> 2
       or not exists (select 1 from public.orcamentista_motor where id = m and arquivado_em is not null) then raise exception 'FALHOU caso F7: as etapas ou o antigo'; end if;
    novo_w := (public.superadmin_trocar_arquivo_do_motor(SUPER, '9a233c55-f377-45d3-b2ae-b1a740a98e44', W::text || '/motor/u3.xlsx', 'w2.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    if not exists (select 1 from public.orcamentista_motor where id = novo_w and familia = 'PVC' and categoria_chave = 'PERFIL')
       or (select count(*) from public.orcamentista_familia_etapa where motor_id = novo_w and motor_familia_exigida = 'PVC') <> 3 then raise exception 'FALHOU caso F7: a troca da Wolff'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F7 — trocar o arquivo da persiana: o novo nasce sem familia e as duas etapas passam a ele exigindo *; a troca da Wolff segue PERFIL PVC';
end $$;

-- CASO P1 — as três funções reescritas FECHADAS: nem public, nem anon, nem authenticated as executam; o service_role, sim
do $$
declare nome text; f regprocedure;
begin
  foreach nome in array array['public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)', 'public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)',
                              'public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text)'] loop
    f := to_regprocedure(nome);
    if f is null or has_function_privilege('public', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then raise exception 'FALHOU caso P1: %', nome; end if;
  end loop;
  raise notice 'ok: caso P1 — criar, gravar etapas e editar: fechadas, so o service_role executa';
end $$;

-- CASO K9 — as FKs novas são ON DELETE RESTRICT: apagar o motor que uma etapa aponta, ou o que um item de levantamento leu, é recusado
do $$
declare r1 text; r2 text; m uuid; me uuid;
begin
  begin
    -- um motor SEM conteúdo (o da Wolff tem: a FK do conteúdo recusaria antes, e o caso não veria a da etapa)
    me := public.h_motor('PERSIANAS', null);
    perform public.h_erro(public.h_sql_etapa('a1000000-0000-0000-0000-0000000000a1', 'ALUMINIO', 1, me, '*'));
    r1 := public.h_erro(format('delete from public.orcamentista_motor where id = %L', me));
    m := public.h_motor('PERSIANAS', null);
    insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, familia, motor_id, motor_familia_exigida)
    values ('20e08592-f957-4e72-b7eb-251387e34eb9', '1e000000-0000-0000-0000-000000000001', 2, 'P-1', 'PVC', m, '*');
    r2 := public.h_erro(format('delete from public.orcamentista_motor where id = %L', m));
    if r1 not like '23503|orcamentista_familia_etapa_motor_exigida_fkey|%' or r2 not like '23503|%' then raise exception 'FALHOU caso K9: % / %', r1, r2; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K9 — apagar o motor que uma etapa aponta ou que um item leu: a FK RESTRICT recusa';
end $$;
