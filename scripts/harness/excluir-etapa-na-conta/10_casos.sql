-- Os casos da 20261031000001, sobre o estado de PRODUÇÃO de 31/10/2026 (os mesmos ids), com a migração aplicada duas vezes.
-- Cada caso desfaz o que fez (P0099). `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.
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
  select md5(coalesce((select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e), '') || '#'
          || (select count(*) from public.superadmin_alteracao_log)::text)
$f$;
-- o item da lista como a tela o manda, a partir da linha gravada (sem motor_id: o motor fica como está)
create or replace function public.h_item(p_id uuid) returns jsonb language sql as $f$
  select jsonb_build_object('id', x.id, 'rotulo', x.rotulo, 'acao', x.acao, 'instrucao', x.instrucao, 'abas', to_jsonb(x.abas))
    from public.orcamentista_familia_etapa x where x.id = p_id
$f$;
create or replace function public.h_gravar(p_mp uuid, p_lista jsonb, p_por uuid default 'e0000000-0000-0000-0000-000000000001', p_tenant uuid default '20e08592-f957-4e72-b7eb-251387e34eb9')
returns jsonb language sql as $f$ select public.superadmin_gravar_etapas_da_materia_prima(p_tenant, p_por, p_mp, p_lista) $f$;
create or replace function public.h_log_novo() returns bigint language sql as $f$
  select count(*) - (select n from public.h_log_antes_da_000001) from public.superadmin_alteracao_log
$f$;

-- CASO X1 — aplicada DUAS vezes sobre o estado de produção: as 3 etapas iguais à foto, nenhuma linha de log nova, a recusa antiga fora
do $$
begin
  if exists (select * from public.orcamentista_familia_etapa except select * from public.h_etapas_antes_da_000001)
     or exists (select * from public.h_etapas_antes_da_000001 except select * from public.orcamentista_familia_etapa)
     or public.h_log_novo() <> 0
     or (select prosrc from pg_proc where proname = 'superadmin_gravar_etapas_da_materia_prima') like '%remover etapa nao e permitido%' then
    raise exception 'FALHOU caso X1';
  end if;
  raise notice 'ok: caso X1 — aplicada duas vezes: as 3 etapas intactas, nenhum log novo, a recusa de remover saiu';
end $$;

-- CASO X2 — REMOVER a etapa do MEIO (a 2): a lista [1, 3] apaga a 2, e a 3 vira 2 (sem buraco), com o motor e o resto intactos; uma linha de log da
-- remoção (o tenant, a linha inteira no antes, `remocao_da_etapa`, depois nulo, o autor) e a da lista; a função devolve a removida
do $$
declare PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; E1 uuid := 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d'; E2 uuid := 'ed9a9b06-d898-4f75-8487-e260d8ba8ec0';
  E3 uuid := 'dd8d3526-f08e-47e1-81c3-a6770214516f'; r jsonb; antes3 public.orcamentista_familia_etapa;
begin
  select * into antes3 from public.orcamentista_familia_etapa where id = E3;
  begin
    r := public.h_gravar(PV, jsonb_build_array(public.h_item(E1), public.h_item(E3)));
    if exists (select 1 from public.orcamentista_familia_etapa where id = E2)
       or (select array_agg(id order by numero) from public.orcamentista_familia_etapa where materia_prima_id = PV) <> array[E1, E3]
       or (select array_agg(numero order by numero) from public.orcamentista_familia_etapa where materia_prima_id = PV) <> array[1, 2]
       or (select (rotulo, acao, abas, motor_id, motor_familia_exigida) from public.orcamentista_familia_etapa where id = E3)
          is distinct from (antes3.rotulo, antes3.acao, antes3.abas, antes3.motor_id, antes3.motor_familia_exigida)
       or r -> 'etapas_removidas' <> jsonb_build_array(jsonb_build_object('id', E2, 'numero', 2, 'rotulo', 'Relação de barras, materiais e tempo fabricaçãoprodução'))
       or public.h_log_novo() <> 2
       or not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_familia_etapa' and l.chave = E2::text
                        and l.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' and l.por = 'e0000000-0000-0000-0000-000000000001' and l.depois is null
                        and l.antes -> 'orcamentista_familia_etapa' ->> 'id' = E2::text and l.antes -> 'orcamentista_familia_etapa' ->> 'numero' = '2'
                        and l.antes -> 'orcamentista_familia_etapa' ->> 'motor_id' is not null and (l.antes ->> 'remocao_da_etapa')::boolean)
       or not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_familia_etapa' and l.chave = PV::text
                        and jsonb_array_length(l.antes -> 'orcamentista_familia_etapa') = 3 and jsonb_array_length(l.depois -> 'orcamentista_familia_etapa') = 2) then
      raise exception 'FALHOU caso X2: %', r;
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso X2 — remover a 2: ela sai (log com tenant, a linha inteira e depois nulo), a 3 vira 2 intacta, a lista volta na resposta';
end $$;

-- CASO X3 — a LISTA VAZIA remove TODAS: 0 etapas, 3 linhas de log de remoção (uma por etapa) e a da lista; a resposta traz as 3, na ordem
do $$
declare PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; r jsonb;
begin
  begin
    r := public.h_gravar(PV, '[]'::jsonb);
    if exists (select 1 from public.orcamentista_familia_etapa where materia_prima_id = PV) or public.h_log_novo() <> 4
       or (select array_agg((x ->> 'numero')::int) from jsonb_array_elements(r -> 'etapas_removidas') x) <> array[1, 2, 3]
       or (select count(*) from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_familia_etapa' and (l.antes ->> 'remocao_da_etapa')::boolean
             and l.chave in (select id::text from public.h_etapas_antes_da_000001)) <> 3 then
      raise exception 'FALHOU caso X3: %', r;
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso X3 — a lista vazia remove as 3, cada uma com o seu log, e a resposta as traz em ordem';
end $$;

-- CASO X4 — remover, INSERIR e REORDENAR de uma vez: [nova, 3, 1] apaga a 2 e numera 1..3 na ordem da lista, sem buraco
do $$
declare PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; E1 uuid := 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d'; E2 uuid := 'ed9a9b06-d898-4f75-8487-e260d8ba8ec0';
  E3 uuid := 'dd8d3526-f08e-47e1-81c3-a6770214516f';
begin
  begin
    perform public.h_gravar(PV, jsonb_build_array(jsonb_build_object('rotulo', 'Nova etapa', 'acao', 'APANHAR'), public.h_item(E3), public.h_item(E1)));
    if exists (select 1 from public.orcamentista_familia_etapa where id = E2)
       or (select array_agg(numero order by numero) from public.orcamentista_familia_etapa where materia_prima_id = PV) <> array[1, 2, 3]
       or (select rotulo from public.orcamentista_familia_etapa where materia_prima_id = PV and numero = 1) <> 'Nova etapa'
       or (select id from public.orcamentista_familia_etapa where materia_prima_id = PV and numero = 2) <> E3
       or (select id from public.orcamentista_familia_etapa where materia_prima_id = PV and numero = 3) <> E1 then
      raise exception 'FALHOU caso X4';
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso X4 — remover, inserir e reordenar juntos: 1..3 na ordem da lista, a 2 fora';
end $$;

-- CASO X5 — ATÔMICO: a lista que tira a 2 e a 3 mas traz um item inválido (rótulo vazio, recusado pela CHECK depois da remoção) é recusada, e a 2 e a
-- 3 CONTINUAM lá — nada muda, nem o log
do $$
declare PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; E1 uuid := 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d'; e text := public.h_estado(); x text;
begin
  x := public.h_erro(format('select public.h_gravar(%L, %L::jsonb)', PV, jsonb_build_array(public.h_item(E1), jsonb_build_object('rotulo', '', 'acao', 'APANHAR'))));
  if x not like '22023|etapa 2: o rotulo tem de ter de 1 a 60 caracteres%' or public.h_estado() <> e then
    raise exception 'FALHOU caso X5: %', x;
  end if;
  raise notice 'ok: caso X5 — um item invalido depois da remocao: recusa, e as etapas removidas voltam (nada muda, nem o log)';
end $$;

-- CASO X6 — só sai etapa DESTA família: gravar a de PVC não toca a de ALUMÍNIO da mesma empresa; e o id de uma etapa de PVC na lista do ALUMÍNIO é
-- recusa, sem mudar nada (não "rouba" nem apaga a etapa da outra família)
do $$
declare PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; AL uuid := 'a1000000-0000-0000-0000-0000000000a1'; E1 uuid := 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d';
  ea uuid; e text; x text;
begin
  begin
    perform public.h_gravar(AL, jsonb_build_array(jsonb_build_object('rotulo', 'Apanhar alumínio', 'acao', 'APANHAR')));
    select id into ea from public.orcamentista_familia_etapa where materia_prima_id = AL;
    perform public.h_gravar(PV, jsonb_build_array(public.h_item(E1)));
    if not exists (select 1 from public.orcamentista_familia_etapa where id = ea and numero = 1 and rotulo = 'Apanhar alumínio')
       or (select count(*) from public.orcamentista_familia_etapa where materia_prima_id = PV) <> 1 then
      raise exception 'FALHOU caso X6: a outra familia mudou';
    end if;
    e := public.h_estado();
    x := public.h_erro(format('select public.h_gravar(%L, %L::jsonb)', AL, jsonb_build_array(public.h_item(E1))));
    if x <> '22023|etapa 1: o id nao e de uma etapa desta familia' or public.h_estado() <> e then
      raise exception 'FALHOU caso X6: %', x;
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso X6 — so sai etapa desta familia: a do aluminio fica; o id de outra familia na lista e recusa, sem mudar nada';
end $$;

-- CASO X7 — as recusas de sempre continuam, ANTES de apagar qualquer coisa: autor que não é super admin (42501), matéria-prima de outra empresa (P0002)
do $$
declare PV uuid := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; e text := public.h_estado(); x1 text; x2 text;
begin
  x1 := public.h_erro(format('select public.h_gravar(%L, %L::jsonb, %L)', PV, '[]', 'e0000000-0000-0000-0000-000000000002'));
  x2 := public.h_erro(format('select public.h_gravar(%L, %L::jsonb, %L, %L)', PV, '[]', 'e0000000-0000-0000-0000-000000000001', gen_random_uuid()));
  if x1 <> '42501|o autor da alteracao nao e super admin' or x2 not like 'P0002|%' or public.h_estado() <> e then
    raise exception 'FALHOU caso X7: % / %', x1, x2;
  end if;
  raise notice 'ok: caso X7 — autor comum e empresa errada sao recusa antes de apagar: nada muda';
end $$;

-- CASO P1 — a função FECHADA (só service_role), SECURITY DEFINER e com search_path fixo
do $$
declare f regprocedure := to_regprocedure('public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)');
begin
  if f is null or has_function_privilege('public', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
     or not has_function_privilege('service_role', f, 'EXECUTE')
     or not exists (select 1 from pg_proc p where p.oid = f and p.prosecdef and 'search_path=public, pg_temp' = any (p.proconfig)) then
    raise exception 'FALHOU caso P1';
  end if;
  raise notice 'ok: caso P1 — a gravacao das etapas fechada, SECURITY DEFINER, search_path fixo';
end $$;
