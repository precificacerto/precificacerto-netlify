-- Os CASOS da 20261101000001 (a tabela na soberania), sobre o estado de 31/10/2026 (catalogo-soberano/09_estado.sql) com a 20261031000003 aplicada.
-- Cada caso roda numa subtransação e se desfaz (P0099). Imprime "ok: ..." ou "FALHOU ...". A contagem dos "-- CASO " é o que o run.sh espera.
\set ON_ERROR_STOP 0
set client_min_messages = notice;

create or replace function pg_temp.k(n text) returns text language sql stable as $$
  select case n
    when 'W'  then '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'   -- Wolf Perfis
    when 'M'  then '9a233c55-f377-45d3-b2ae-b1a740a98e44'   -- Motor_Wolf_PVC (a cópia do motor pelo motor_id)
    when 'T1' then '72366020-57c9-489f-9385-397b7fa3dedb'   -- a tabela de antes, com o motor
    when 'T2' then '21acfa75-e4e7-4de6-9b96-cdd95525467d'   -- PVC / PERFIL, vazia
    when 'TE' then '5f7acebf-3c91-46de-af00-57a47f8be288'   -- Estrela, sem motor
    when 'MP' then '79d764fe-4acd-43e2-bed9-38e20667ca3d'
    when 'DP' then '20e08592-f957-4e72-b7eb-251387e34eb9'   -- Esquadrias De Paula
    when 'SA' then 'e0000000-0000-0000-0000-000000000001'
    when 'IT' then '1e000000-0000-0000-0000-0000000000a1'   -- o item de levantamento
  end
$$;
create or replace function pg_temp.medir(t text, c text) returns jsonb language sql as $$ select public.superadmin_arrasto_do_catalogo(t, c) $$;
create or replace function pg_temp.remover(t text, c text) returns jsonb language sql as $$
  select public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, t, c, public.superadmin_arrasto_do_catalogo(t, c) ->> 'assinatura') $$;
create or replace function pg_temp.passo(m jsonb, t text, a text) returns jsonb language sql as $$
  select x from jsonb_array_elements(m -> 'passos') x where x ->> 'tabela' = t and x ->> 'acao' = a order by (x ->> 'passo')::int limit 1 $$;
create or replace function pg_temp.logs() returns setof public.superadmin_alteracao_log language sql as $$
  select * from public.superadmin_alteracao_log l where l.antes -> 'remocao_do_catalogo' ->> 'tipo' = 'tabela' $$;
create or replace function pg_temp.conteudo(col text, id text) returns bigint language plpgsql as $$
declare t text; n bigint := 0; k bigint;
begin
  foreach t in array array['orcamentista_motor_baguete', 'orcamentista_motor_formula', 'orcamentista_motor_formula_familia', 'orcamentista_motor_insumo',
    'orcamentista_motor_otimizacao', 'orcamentista_motor_perfil', 'orcamentista_motor_regra', 'orcamentista_motor_tipologia', 'orcamentista_motor_tipologia_detalhe',
    'orcamentista_motor_tipologia_tempo', 'orcamentista_motor_validacao', 'orcamentista_motor_variavel', 'orcamentista_motor_vidro', 'orcamentista_importacao'] loop
    execute format('select count(*) from public.%I where %I = %L::uuid', t, col, id) into k; n := n + k;
  end loop;
  return n;
end $$;

-- CASO 1: o tipo 'tabela' tem exatamente os passos da tabela, na ordem, e nenhum de motor, ligação, etapa ou fornecedor
do $c$ declare v text; begin
  select string_agg((x ->> 't') || ':' || (x ->> 'acao'), ',' order by o) into v from jsonb_array_elements(public.orcamentista_arrasto_passos('tabela')) with ordinality z(x, o);
  if v is distinct from 'orcamentista_levantamento_item:perde_o_vinculo,orcamentista_motor_baguete:sai,orcamentista_motor_formula:sai,orcamentista_motor_formula_familia:sai,'
       || 'orcamentista_motor_insumo:sai,orcamentista_motor_otimizacao:sai,orcamentista_motor_perfil:sai,orcamentista_motor_regra:sai,orcamentista_motor_tipologia:sai,'
       || 'orcamentista_motor_tipologia_detalhe:sai,orcamentista_motor_tipologia_tempo:sai,orcamentista_motor_validacao:sai,orcamentista_motor_variavel:sai,'
       || 'orcamentista_motor_vidro:sai,orcamentista_importacao:sai,orcamentista_tabela_item:sai,orcamentista_conta_tabela:sai,orcamentista_tabela:sai' then
    raise exception 'FALHOU caso 1: %', v;
  end if;
  if exists (select 1 from jsonb_array_elements(public.orcamentista_arrasto_passos('tabela')) x where x ->> 'filtro' like '%$2%' and x ->> 't' <> 'orcamentista_importacao') then
    raise exception 'FALHOU caso 1: um passo da tabela filtra pelos motores';
  end if;
  raise notice 'ok: caso 1 — o tipo tabela: 18 passos, os da tabela, sem motor, ligacao, etapa nem fornecedor';
end $c$;

-- CASO 2: a MEDIÇÃO da tabela da Wolff — o nome, o aviso da conversa (a De Paula PARA), os arquivos que ficam, e sem apagar nada
do $c$ declare m jsonb; n bigint := (select count(*) from public.orcamentista_tabela_item) + (select count(*) from public.superadmin_alteracao_log); begin
  m := pg_temp.medir('tabela', pg_temp.k('T1'));
  if m ->> 'nome' is distinct from 'Wolf Perfis / Perfis_de_PVC_-_Wolff.xlsx (72366020)' then raise exception 'FALHOU caso 2: o nome %', m ->> 'nome'; end if;
  if m -> 'avisos' is distinct from jsonb_build_array(jsonb_build_object('tipo', 'conversa_para', 'tabela_id', pg_temp.k('T1'), 'arquivo', 'Perfis_de_PVC_-_Wolff.xlsx',
       'empresas', jsonb_build_array('Esquadrias De Paula Ltda'))) then
    raise exception 'FALHOU caso 2: o aviso da conversa %', m -> 'avisos';
  end if;
  if (select x -> 'nomes' from jsonb_array_elements(m -> 'ficam') x where x ->> 'rotulo' like 'arquivo no Storage%')
     is distinct from '["44c5c0fe-a0d3-4aab-802d-20a6eff3f654/arquivo/wolff.xlsm", "44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/wolff-motor.xlsx"]'::jsonb then
    raise exception 'FALHOU caso 2: os arquivos que ficam %', m -> 'ficam';
  end if;
  if (pg_temp.passo(m, 'orcamentista_tabela_item', 'sai') ->> 'quantidade')::int is distinct from 7
     or (pg_temp.passo(m, 'orcamentista_conta_tabela', 'sai') ->> 'quantidade')::int is distinct from 1
     or (pg_temp.passo(m, 'orcamentista_importacao', 'sai') ->> 'quantidade')::int is distinct from 2
     or (pg_temp.passo(m, 'orcamentista_tabela', 'sai') ->> 'quantidade')::int is distinct from 1
     or (m ->> 'sai')::bigint is distinct from 7 + 1 + 1 + pg_temp.conteudo('tabela_id', pg_temp.k('T1')) then
    raise exception 'FALHOU caso 2: a medicao por passo: %', m ->> 'sai';
  end if;
  if (select count(*) from public.orcamentista_tabela_item) + (select count(*) from public.superadmin_alteracao_log) is distinct from n then raise exception 'FALHOU caso 2: medir apagou'; end if;
  raise notice 'ok: caso 2 — medir a tabela da Wolff: o aviso da conversa (De Paula), os 2 arquivos que ficam, % linhas saem, nada apagado', m ->> 'sai';
end $c$;

-- CASO 3: REMOVER a tabela da Wolff — sai a tabela com tudo dela; o MOTOR do catálogo (a cópia pelo motor_id) fica inteiro, com as etapas apontando;
-- o fornecedor, a outra tabela e o vínculo da conta ficam; o Storage fica, também o objeto que a tabela divide com o motor; o log tem cada linha
do $c$ declare m jsonb; v_cm bigint; v_ct bigint := pg_temp.conteudo('tabela_id', pg_temp.k('T1')); v_obj bigint; begin
  begin
    -- como em produção: o motor_path da tabela é o MESMO objeto do arquivo do motor 9a233c55
    update public.orcamentista_tabela set motor_path = (select arquivo_path from public.orcamentista_motor where id = pg_temp.k('M')::uuid) where id = pg_temp.k('T1')::uuid;
    v_cm := pg_temp.conteudo('motor_id', pg_temp.k('M')); v_obj := (select count(*) from storage.objects);
    m := pg_temp.medir('tabela', pg_temp.k('T1'));
    perform pg_temp.remover('tabela', pg_temp.k('T1'));
    if exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('T1')::uuid) or exists (select 1 from public.orcamentista_tabela_item where tabela_id = pg_temp.k('T1')::uuid)
       or pg_temp.conteudo('tabela_id', pg_temp.k('T1')) <> 0 or exists (select 1 from public.orcamentista_conta_tabela where tabela_id = pg_temp.k('T1')::uuid) then
      raise exception 'FALHOU caso 3: sobrou algo da tabela';
    end if;
    if not exists (select 1 from public.orcamentista_motor where id = pg_temp.k('M')::uuid and arquivado_em is null) or pg_temp.conteudo('motor_id', pg_temp.k('M')) is distinct from v_cm
       or (select count(*) from public.orcamentista_motor_familia where motor_id = pg_temp.k('M')::uuid) is distinct from 1
       or (select count(*) from public.orcamentista_familia_etapa where materia_prima_id = pg_temp.k('MP')::uuid and motor_id = pg_temp.k('M')::uuid) is distinct from 3
       or not exists (select 1 from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid) or not exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('T2')::uuid)
       or (select count(*) from public.orcamentista_mp_categoria_fornecedor) is distinct from 2 then
      raise exception 'FALHOU caso 3: saiu (ou mudou) o que devia ficar';
    end if;
    if (select count(*) from storage.objects) is distinct from v_obj
       or not exists (select 1 from storage.objects where name = (select arquivo_path from public.orcamentista_motor where id = pg_temp.k('M')::uuid)) then
      raise exception 'FALHOU caso 3: um arquivo do Storage saiu';
    end if;
    if (select count(*) from pg_temp.logs()) is distinct from (m ->> 'sai')::bigint + (m ->> 'perde_o_vinculo')::bigint
       or (select count(*) from pg_temp.logs() where tabela like 'orcamentista_motor\_%' escape '\' or tabela = 'orcamentista_importacao') is distinct from v_ct
       or (select tenant_id from pg_temp.logs() where tabela = 'orcamentista_conta_tabela')::text is distinct from pg_temp.k('DP')
       or (select antes -> 'orcamentista_tabela' ->> 'arquivo_nome' from pg_temp.logs() where tabela = 'orcamentista_tabela') is distinct from 'Perfis_de_PVC_-_Wolff.xlsx'
       or exists (select 1 from pg_temp.logs() where depois is not null) then
      raise exception 'FALHOU caso 3: o log';
    end if;
    raise notice 'ok: caso 3 — remover a tabela da Wolff: % linhas logadas; o motor do catalogo (% linhas), as etapas, o fornecedor e o Storage ficam', m ->> 'sai', v_cm;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 4: TRAVA C pela tabela — o item de levantamento fica, perde SÓ a tabela (o motor e a família dele ficam), com antes e depois no log
do $c$ declare d jsonb; begin
  begin
    update public.orcamentista_levantamento_item set familia = 'PVC', motor_id = pg_temp.k('M')::uuid, motor_familia_exigida = 'PVC', tabela_id = pg_temp.k('T1')::uuid
     where id = pg_temp.k('IT')::uuid;
    perform pg_temp.remover('tabela', pg_temp.k('T1'));
    select to_jsonb(i) into d from public.orcamentista_levantamento_item i where id = pg_temp.k('IT')::uuid;
    if d is null or d ->> 'tabela_id' is not null or d ->> 'motor_id' is distinct from pg_temp.k('M') or d ->> 'familia' is distinct from 'PVC' then raise exception 'FALHOU caso 4: %', d; end if;
    if (select count(*) from pg_temp.logs() where tabela = 'orcamentista_levantamento_item' and tenant_id = pg_temp.k('DP')::uuid
          and antes -> 'orcamentista_levantamento_item' ->> 'tabela_id' = pg_temp.k('T1') and depois -> 'orcamentista_levantamento_item' ->> 'tabela_id' is null) is distinct from 1 then
      raise exception 'FALHOU caso 4: o log do item';
    end if;
    raise notice 'ok: caso 4 — trava C pela tabela: o item fica, perde so a tabela, mantem motor e familia';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 5: a tabela SEM motor (Estrela): sem aviso da conversa; sai com os itens
do $c$ declare m jsonb; begin
  begin
    m := pg_temp.medir('tabela', pg_temp.k('TE'));
    if jsonb_array_length(m -> 'avisos') is distinct from 0 or (m ->> 'sai')::int is distinct from 4 then raise exception 'FALHOU caso 5: %', m; end if;
    perform pg_temp.remover('tabela', pg_temp.k('TE'));
    if exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('TE')::uuid) or (select count(*) from pg_temp.logs()) is distinct from 4 then raise exception 'FALHOU caso 5: a remocao'; end if;
    raise notice 'ok: caso 5 — a tabela sem motor (Estrela): sem aviso, sai com os 3 itens';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 6: o que não existe é P0002 (uuid que não há, chave que não é uuid); a assinatura de outra tabela é 40001
do $c$ declare n int := 0; begin
  begin perform pg_temp.medir('tabela', gen_random_uuid()::text); exception when sqlstate 'P0002' then n := n + 1; end;
  begin perform pg_temp.medir('tabela', 'PVC'); exception when sqlstate 'P0002' then n := n + 1; end;
  begin perform public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, 'tabela', pg_temp.k('T1'), pg_temp.medir('tabela', pg_temp.k('TE')) ->> 'assinatura');
  exception when sqlstate '40001' then n := n + 1; end;
  if n is distinct from 3 or not exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('T1')::uuid) then raise exception 'FALHOU caso 6: % de 3', n; end if;
  raise notice 'ok: caso 6 — tabela inexistente P0002; assinatura de outra tabela 40001, nada sai';
end $c$;

-- CASO 7: AS FKs CONTINUAM COMO ESTÃO — apagar a tabela direto, fora da função, ainda é recusado (a linha de conta_tabela é RESTRICT)
do $c$ declare ok boolean := false; begin
  begin delete from public.orcamentista_tabela where id = pg_temp.k('T1')::uuid; exception when sqlstate '23503' then ok := true; end;
  if not ok then raise exception 'FALHOU caso 7: o DELETE direto passou'; end if;
  raise notice 'ok: caso 7 — DELETE direto da tabela continua 23503 (conta_tabela RESTRICT)';
end $c$;

-- CASO 8: remover o FORNECEDOR depois de remover a tabela dele: o arrasto do fornecedor não conta a tabela que já saiu, e continua removendo o resto
do $c$ declare m jsonb; begin
  begin
    perform pg_temp.remover('tabela', pg_temp.k('T1'));
    m := pg_temp.medir('fornecedor', pg_temp.k('W'));
    if (pg_temp.passo(m, 'orcamentista_tabela', 'sai') ->> 'quantidade')::int is distinct from 1 or jsonb_array_length(m -> 'avisos') is distinct from 0 then
      raise exception 'FALHOU caso 8: %', m;
    end if;
    perform pg_temp.remover('fornecedor', pg_temp.k('W'));
    if exists (select 1 from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid) then raise exception 'FALHOU caso 8: o fornecedor ficou'; end if;
    raise notice 'ok: caso 8 — tabela e depois o fornecedor: o segundo arrasto ve so o que sobrou, sem aviso (a tabela com motor ja saiu)';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;
