-- Os casos da 20261029000004, sobre o estado de PRODUÇÃO de 29/10/2026 (a família PVC "PVC Wolf" com as 7 ramificações, a matéria-prima da De Paula,
-- o motor da Wolff, as 3 etapas), com a migração aplicada duas vezes. Cada caso desfaz o que fez (P0099). `ok:` é NOTICE; `FALHOU` é ERROR.
create or replace function public.h_erro(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics msg = message_text, cod = returned_sqlstate;
  return cod || '|' || msg;
end $f$;
create or replace function public.h_estado() returns text language sql as $f$
  select md5(coalesce((select string_agg(f::text, '|' order by f.chave) from public.orcamentista_familia_catalogo f), '') || '#'
          || coalesce((select string_agg(r::text, '|' order by r.familia, r.ordem) from public.orcamentista_familia_ramificacao r), '') || '#'
          || (select count(*) from public.superadmin_alteracao_log)::text)
$f$;
create or replace function public.h_ram(p text) returns text language sql as $f$
  select coalesce(string_agg(categoria_chave || ':' || ordem, ',' order by ordem), '') from public.orcamentista_familia_ramificacao where familia = p
$f$;

-- CASO M1 — aplicada duas vezes, a migração não mexe em dado: a PVC continua "PVC Wolf", ordem 1, as 7 ramificações na ordem do catálogo
do $$
begin
  if not exists (select 1 from public.orcamentista_familia_catalogo where chave = 'PVC' and rotulo = 'PVC Wolf' and ordem = 1) then raise exception 'FALHOU caso M1: a PVC mudou'; end if;
  if public.h_ram('PVC') <> 'PERFIL:1,PERSIANAS:2,REFORCO:3,FERRAGENS:4,ACESSORIOS_VEDACAO:5,VIDRO:6,INSTALACAO:7' then raise exception 'FALHOU caso M1: as ramificacoes da PVC (%)', public.h_ram('PVC'); end if;
  -- o log da família tem só a linha do nome "PVC Wolf" (a 20261028000002): esta migração não loga nada
  if (select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_catalogo') <> 1
     or not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_catalogo' and depois -> 'orcamentista_familia_catalogo' ->> 'rotulo' = 'PVC Wolf') then
    raise exception 'FALHOU caso M1: a migracao logou'; end if;
  raise notice 'ok: caso M1 — aplicada duas vezes, nada de dado muda: a PVC continua PVC Wolf, com as 7 ramificacoes';
end $$;

-- CASO C1 — CRIAR "PVC Veca" com Perfil e Vidro: a linha no fim da lista (a última + 1), as ramificações na ordem dada, o log com o depois
do $$
declare res jsonb; SUPER uuid := 'e0000000-0000-0000-0000-000000000001'; o int;
begin
  begin
    select max(ordem) into o from public.orcamentista_familia_catalogo;
    res := public.superadmin_criar_familia(SUPER, 'VECA', '  PVC Veca ', array['VIDRO', 'PERFIL']);
    if not exists (select 1 from public.orcamentista_familia_catalogo where chave = 'VECA' and rotulo = 'PVC Veca' and ordem = o + 1) then raise exception 'FALHOU caso C1: a linha'; end if;
    if public.h_ram('VECA') <> 'VIDRO:1,PERFIL:2' then raise exception 'FALHOU caso C1: as ramificacoes (%)', public.h_ram('VECA'); end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_catalogo' and chave = 'VECA' and antes is null and por = SUPER
                     and depois -> 'orcamentista_familia_catalogo' ->> 'rotulo' = 'PVC Veca' and jsonb_array_length(depois -> 'orcamentista_familia_ramificacao') = 2) then
      raise exception 'FALHOU caso C1: o log'; end if;
    if res -> 'orcamentista_familia_catalogo' ->> 'chave' is distinct from 'VECA' then raise exception 'FALHOU caso C1: o retorno'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso C1 — criar PVC Veca: no fim da lista, ramificacoes na ordem dada, log com o depois';
end $$;

-- CASO C2 — CRIAR recusa, com a frase, e NADA muda: chave que existe; nome repetido (sem olhar a caixa); sem ramificação; ramificação repetida;
-- fora do catálogo; chave fora da forma; nome longo; autor que não é super admin
do $$
declare est text := public.h_estado(); r text; SUPER text := 'e0000000-0000-0000-0000-000000000001'; g text := 'select public.superadmin_criar_familia(%L, %L, %L, %L::text[])';
begin
  r := public.h_erro(format(g, SUPER, 'PVC', 'Outra', '{PERFIL}'));            if r not like '22023|a familia de chave "PVC" ja existe.%' then raise exception 'FALHOU caso C2: chave (%)', r; end if;
  r := public.h_erro(format(g, SUPER, 'WOLF2', 'pvc wolf', '{PERFIL}'));       if r not like '22023|ja existe a familia "PVC Wolf": o nome nao se repete.%' then raise exception 'FALHOU caso C2: nome (%)', r; end if;
  r := public.h_erro(format(g, SUPER, 'X1', 'X1', '{}'));                       if r not like '22023|a familia declara ao menos uma ramificacao%' then raise exception 'FALHOU caso C2: vazia (%)', r; end if;
  r := public.h_erro(format('select public.superadmin_criar_familia(%L, %L, %L, null)', SUPER, 'X1', 'X1')); if r not like '22023|a familia declara ao menos uma ramificacao%' then raise exception 'FALHOU caso C2: nula (%)', r; end if;
  r := public.h_erro(format(g, SUPER, 'X1', 'X1', '{PERFIL,PERFIL}'));          if r not like '22023|uma ramificacao aparece mais de uma vez%' then raise exception 'FALHOU caso C2: repetida (%)', r; end if;
  r := public.h_erro(format(g, SUPER, 'X1', 'X1', '{PERFIL,INVENTADA}'));       if r not like '22023|a ramificacao "INVENTADA" nao e do catalogo de categorias.%' then raise exception 'FALHOU caso C2: fora (%)', r; end if;
  r := public.h_erro(format(g, SUPER, 'x1', 'X1', '{PERFIL}'));                 if r not like '22023|a chave da familia e maiuscula%' then raise exception 'FALHOU caso C2: forma da chave (%)', r; end if;
  r := public.h_erro(format(g, SUPER, 'X1', repeat('a', 61), '{PERFIL}'));      if r not like '22023|o nome da familia tem de 1 a 60 caracteres.%' then raise exception 'FALHOU caso C2: nome longo (%)', r; end if;
  r := public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000002', 'X1', 'X1', '{PERFIL}')); if r not like '42501|%' then raise exception 'FALHOU caso C2: autor (%)', r; end if;
  if public.h_estado() <> est then raise exception 'FALHOU caso C2: algo mudou'; end if;
  raise notice 'ok: caso C2 — criar recusa com a frase (chave, nome repetido, sem/repetida/fora do catalogo, forma, nome longo, autor) e nada muda';
end $$;

-- CASO E1 — EDITAR a PVC: o nome e as ramificações mudam, a CHAVE e a ordem não; o log tem o antes e o depois
do $$
declare SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
begin
  begin
    perform public.superadmin_editar_familia(SUPER, 'PVC', 'PVC Wolff', array['PERFIL', 'REFORCO', 'VIDRO']);
    if not exists (select 1 from public.orcamentista_familia_catalogo where chave = 'PVC' and rotulo = 'PVC Wolff' and ordem = 1) then raise exception 'FALHOU caso E1: a linha'; end if;
    if public.h_ram('PVC') <> 'PERFIL:1,REFORCO:2,VIDRO:3' then raise exception 'FALHOU caso E1: as ramificacoes (%)', public.h_ram('PVC'); end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_catalogo' and chave = 'PVC' and por = SUPER
                     and antes -> 'orcamentista_familia_catalogo' ->> 'rotulo' = 'PVC Wolf' and jsonb_array_length(antes -> 'orcamentista_familia_ramificacao') = 7
                     and depois -> 'orcamentista_familia_catalogo' ->> 'rotulo' = 'PVC Wolff' and jsonb_array_length(depois -> 'orcamentista_familia_ramificacao') = 3) then
      raise exception 'FALHOU caso E1: o log'; end if;
    -- a matéria-prima, o motor e as etapas que apontam a chave seguem apontando (a chave não mudou)
    if (select count(*) from public.orcamentista_materia_prima where familia = 'PVC') <> 1 or (select count(*) from public.orcamentista_familia_etapa where familia = 'PVC') <> 3 then
      raise exception 'FALHOU caso E1: quem aponta a chave'; end if;
    -- só o nome muda (a lista igual): vale
    perform public.superadmin_editar_familia(SUPER, 'PVC', 'PVC Wolf', array['PERFIL', 'REFORCO', 'VIDRO']);
    if not exists (select 1 from public.orcamentista_familia_catalogo where chave = 'PVC' and rotulo = 'PVC Wolf') then raise exception 'FALHOU caso E1: so o nome'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E1 — editar a PVC: nome e ramificacoes mudam, a chave e a ordem nao; quem aponta a chave segue; log antes e depois';
end $$;

-- CASO E3 — EDITAR só as RAMIFICAÇÕES, com o mesmo nome: vale (não é "nada mudou"), e a lista nova é a gravada, na ordem dada
do $$
declare SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
begin
  begin
    perform public.superadmin_editar_familia(SUPER, 'PVC', 'PVC Wolf', array['VIDRO', 'PERFIL']);
    if public.h_ram('PVC') <> 'VIDRO:1,PERFIL:2' then raise exception 'FALHOU caso E3: as ramificacoes (%)', public.h_ram('PVC'); end if;
    if not exists (select 1 from public.orcamentista_familia_catalogo where chave = 'PVC' and rotulo = 'PVC Wolf' and ordem = 1) then raise exception 'FALHOU caso E3: a linha'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E3 — editar so as ramificacoes, com o mesmo nome: vale, e grava a lista nova na ordem dada';
end $$;

-- CASO E2 — EDITAR recusa, com a frase, e NADA muda: nada mudou; o nome de outra família; família inexistente; sem ramificação; fora do catálogo;
-- nome vazio; autor comum
do $$
declare est text; r text; SUPER text := 'e0000000-0000-0000-0000-000000000001'; g text := 'select public.superadmin_editar_familia(%L, %L, %L, %L::text[])';
  todas text := '{PERFIL,PERSIANAS,REFORCO,FERRAGENS,ACESSORIOS_VEDACAO,VIDRO,INSTALACAO}';
begin
  begin
    perform public.superadmin_criar_familia(SUPER::uuid, 'VECA', 'PVC Veca', array['PERFIL']);
    est := public.h_estado();
    r := public.h_erro(format(g, SUPER, 'PVC', ' PVC Wolf ', todas));           if r not like '22023|nada mudou:%' then raise exception 'FALHOU caso E2: nada mudou (%)', r; end if;
    r := public.h_erro(format(g, SUPER, 'PVC', 'pvc veca', todas));             if r not like '22023|ja existe a familia "PVC Veca": o nome nao se repete.%' then raise exception 'FALHOU caso E2: nome de outra (%)', r; end if;
    r := public.h_erro(format(g, SUPER, 'NAO_HA', 'Nao ha', '{PERFIL}'));       if r not like 'P0002|familia inexistente' then raise exception 'FALHOU caso E2: inexistente (%)', r; end if;
    r := public.h_erro(format(g, SUPER, 'PVC', 'PVC Wolf', '{}'));              if r not like '22023|a familia declara ao menos uma ramificacao%' then raise exception 'FALHOU caso E2: vazia (%)', r; end if;
    r := public.h_erro(format(g, SUPER, 'PVC', 'PVC Wolf', '{PERFIL,NAO}'));    if r not like '22023|a ramificacao "NAO" nao e do catalogo%' then raise exception 'FALHOU caso E2: fora (%)', r; end if;
    r := public.h_erro(format(g, SUPER, 'PVC', '   ', todas));                  if r not like '22023|o nome da familia tem de 1 a 60 caracteres.%' then raise exception 'FALHOU caso E2: nome vazio (%)', r; end if;
    r := public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000002', 'PVC', 'Outro', todas)); if r not like '42501|%' then raise exception 'FALHOU caso E2: autor (%)', r; end if;
    if public.h_estado() <> est then raise exception 'FALHOU caso E2: algo mudou'; end if;
    -- o nome da PRÓPRIA família, em outra caixa, não é "de outra": vale (renomear para a mesma grafia com outra caixa)
    if public.h_erro(format(g, SUPER, 'VECA', 'pvc veca', '{PERFIL}')) <> 'ok' then raise exception 'FALHOU caso E2: a propria em outra caixa'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E2 — editar recusa com a frase (nada mudou, nome de outra, inexistente, sem/fora do catalogo, nome vazio, autor) e nada muda';
end $$;

-- CASO R1 — REMOVER a família SEM uso: sai a linha e as ramificações dela, e o log guarda o antes
do $$
declare SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
begin
  begin
    perform public.superadmin_criar_familia(SUPER, 'VECA', 'PVC Veca', array['PERFIL', 'VIDRO']);
    perform public.superadmin_remover_familia(SUPER, 'VECA');
    if exists (select 1 from public.orcamentista_familia_catalogo where chave = 'VECA') or exists (select 1 from public.orcamentista_familia_ramificacao where familia = 'VECA') then
      raise exception 'FALHOU caso R1: nao saiu'; end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_catalogo' and chave = 'VECA' and depois is null and por = SUPER
                     and antes -> 'orcamentista_familia_catalogo' ->> 'rotulo' = 'PVC Veca' and jsonb_array_length(antes -> 'orcamentista_familia_ramificacao') = 2) then
      raise exception 'FALHOU caso R1: o log'; end if;
    if public.h_ram('PVC') <> 'PERFIL:1,PERSIANAS:2,REFORCO:3,FERRAGENS:4,ACESSORIOS_VEDACAO:5,VIDRO:6,INSTALACAO:7' then raise exception 'FALHOU caso R1: a PVC foi tocada'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso R1 — remover a familia sem uso: saem a linha e as ramificacoes; log com o antes; a PVC intacta';
end $$;

-- CASO R2 — REMOVER a PVC (em uso): RECUSA NOMEADA — a matéria-prima pela empresa e pelo nome, o motor pelo fornecedor e pelo arquivo, as etapas
-- contadas — e NADA sai (nem as ramificações)
do $$
declare est text := public.h_estado(); r text;
begin
  r := public.h_erro($q$select public.superadmin_remover_familia('e0000000-0000-0000-0000-000000000001', 'PVC')$q$);
  if r not like '22023|a familia "PVC Wolf" esta em uso: %. Tire o uso antes de remover. Nada foi removido.'
     or r not like '%1 materia(s)-prima(s) (Esquadrias De Paula Ltda / Esquadrias de PVC WOLF)%'
     or r not like '%1 motor(es) (Wolf Perfis / Motor_Wolf_PVC.xlsx)%'
     or r not like '%3 etapa(s)%' then raise exception 'FALHOU caso R2: a frase (%)', r; end if;
  if public.h_estado() <> est then raise exception 'FALHOU caso R2: algo mudou'; end if;
  raise notice 'ok: caso R2 — remover a PVC em uso: recusa nomeada (materia-prima por empresa e nome, motor por fornecedor e arquivo, etapas) e nada sai';
end $$;

-- CASO R3 — cada uso SOZINHO recusa, nomeado: uma tabela de fornecedor; um motor; um item de levantamento; uma matéria-prima. E mais de três
-- matérias-primas dizem "e mais N"
do $$
declare r text; SUPER uuid := 'e0000000-0000-0000-0000-000000000001'; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; T uuid := '20e08592-f957-4e72-b7eb-251387e34eb9';
begin
  begin
    perform public.superadmin_criar_familia(SUPER, 'VECA', 'PVC Veca', array['PERFIL']);
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave) values (W, W::text || '/arquivo/v.xlsx', 'veca.xlsx', 'VECA', 'PERFIL');
    r := public.h_erro($q$select public.superadmin_remover_familia('e0000000-0000-0000-0000-000000000001', 'VECA')$q$);
    if r not like '22023|a familia "PVC Veca" esta em uso: 1 tabela(s) de fornecedor (Wolf Perfis / veca.xlsx). Tire%' then raise exception 'FALHOU caso R3: tabela (%)', r; end if;
    delete from public.orcamentista_tabela where familia = 'VECA';
    -- o motor que atua em DUAS famílias (PVC e VECA, 20261029000003) também é uso da VECA: a recusa o nomeia
    with m as (insert into public.orcamentista_motor (fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values (W, 'PERFIL', 'veca-motor.xlsx', W::text || '/motor/v.xlsx') returning id)
    insert into public.orcamentista_motor_familia (motor_id, familia) select m.id, f from m, unnest(array['PVC', 'VECA']) f;
    r := public.h_erro($q$select public.superadmin_remover_familia('e0000000-0000-0000-0000-000000000001', 'VECA')$q$);
    if r not like '22023|a familia "PVC Veca" esta em uso: 1 motor(es) (Wolf Perfis / veca-motor.xlsx). Tire%' then raise exception 'FALHOU caso R3: motor (%)', r; end if;
    delete from public.orcamentista_motor where arquivo_nome = 'veca-motor.xlsx';
    insert into public.orcamentista_levantamento (id, tenant_id) values ('1e000000-0000-0000-0000-0000000000f1', T);
    insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, familia) values (T, '1e000000-0000-0000-0000-0000000000f1', 1, 'X', 'VECA');
    r := public.h_erro($q$select public.superadmin_remover_familia('e0000000-0000-0000-0000-000000000001', 'VECA')$q$);
    if r not like '22023|a familia "PVC Veca" esta em uso: 1 item(ns) de levantamento. Tire%' then raise exception 'FALHOU caso R3: item (%)', r; end if;
    delete from public.orcamentista_levantamento_item where familia = 'VECA';
    insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) select T, 'Veca ' || i, 10 + i, 'VECA' from generate_series(1, 5) i;
    r := public.h_erro($q$select public.superadmin_remover_familia('e0000000-0000-0000-0000-000000000001', 'VECA')$q$);
    if r not like '22023|a familia "PVC Veca" esta em uso: 5 materia(s)-prima(s) (Esquadrias De Paula Ltda / Veca 1, Esquadrias De Paula Ltda / Veca 2, Esquadrias De Paula Ltda / Veca 3 e mais 2). Tire%' then
      raise exception 'FALHOU caso R3: materias-primas (%)', r; end if;
    if not exists (select 1 from public.orcamentista_familia_catalogo where chave = 'VECA') then raise exception 'FALHOU caso R3: saiu'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso R3 — cada uso sozinho recusa nomeado (tabela, motor, item, materia-prima; mais de tres dizem "e mais N"), e nada sai';
end $$;

-- CASO R4 — remover recusa sem mudar nada: família inexistente (P0002), autor comum (42501); e a FK continua RESTRICT: o DELETE direto da PVC é 23503
do $$
declare est text := public.h_estado(); r1 text; r2 text; r3 text;
begin
  r1 := public.h_erro($q$select public.superadmin_remover_familia('e0000000-0000-0000-0000-000000000001', 'NAO_HA')$q$);
  r2 := public.h_erro($q$select public.superadmin_remover_familia('e0000000-0000-0000-0000-000000000002', 'PVC')$q$);
  r3 := public.h_erro($q$delete from public.orcamentista_familia_catalogo where chave = 'PVC'$q$);
  if r1 <> 'P0002|familia inexistente' or r2 not like '42501|%' or r3 not like '23503|%' then raise exception 'FALHOU caso R4: % / % / %', r1, r2, r3; end if;
  if public.h_estado() <> est then raise exception 'FALHOU caso R4: algo mudou'; end if;
  raise notice 'ok: caso R4 — inexistente e autor comum recusam sem mudar nada; o DELETE direto da PVC esbarra na FK RESTRICT';
end $$;

-- CASO P1 — as três funções FECHADAS: nem public, nem anon, nem authenticated as executam; o service_role, sim
do $$
declare nome text; f regprocedure;
begin
  foreach nome in array array['public.superadmin_criar_familia(uuid, text, text, text[])', 'public.superadmin_editar_familia(uuid, text, text, text[])', 'public.superadmin_remover_familia(uuid, text)'] loop
    f := to_regprocedure(nome);
    if f is null or has_function_privilege('public', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then raise exception 'FALHOU caso P1: %', nome; end if;
  end loop;
  raise notice 'ok: caso P1 — criar, editar e remover familia: fechadas, so o service_role executa';
end $$;
