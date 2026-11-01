-- Os CASOS da 20261031000003 (o catálogo é soberano), sobre o estado de 31/10/2026 (09_estado.sql). Cada caso roda numa subtransação e se desfaz
-- (P0099): os casos não dependem uns dos outros. Imprime "ok: ..." ou "FALHOU ...". A contagem dos "-- CASO " é o que o run.sh espera.
\set ON_ERROR_STOP 0
set client_min_messages = notice;

-- os nomes do estado (os ids de produção)
create or replace function pg_temp.k(n text) returns text language sql stable as $$
  select case n
    when 'W'  then '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'   -- Wolf Perfis
    when 'IM' then 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8'   -- IMAB
    when 'ES' then '520b1fb2-8834-421d-88ee-91790fa04bcb'   -- Estrela
    when 'M'  then '9a233c55-f377-45d3-b2ae-b1a740a98e44'   -- Motor_Wolf_PVC
    when 'T1' then '72366020-57c9-489f-9385-397b7fa3dedb'   -- a tabela de antes, com o motor
    when 'T2' then '21acfa75-e4e7-4de6-9b96-cdd95525467d'   -- PVC / PERFIL
    when 'TI' then 'fe2c6667-652f-43bd-89d2-fd63673dc966'   -- PVC / FERRAGENS (IMAB)
    when 'TE' then '5f7acebf-3c91-46de-af00-57a47f8be288'   -- Estrela, sem família
    when 'MP' then '79d764fe-4acd-43e2-bed9-38e20667ca3d'   -- Esquadrias de PVC WOLF
    when 'DP' then '20e08592-f957-4e72-b7eb-251387e34eb9'   -- Esquadrias De Paula
    when 'SA' then 'e0000000-0000-0000-0000-000000000001'   -- super admin
    when 'NS' then 'e0000000-0000-0000-0000-000000000002'   -- não é super admin
    when 'IT' then '1e000000-0000-0000-0000-0000000000a1'   -- o item de levantamento
    when 'LV' then '1e000000-0000-0000-0000-000000000001'   -- o levantamento
    when 'C1' then (select id::text from public.orcamentista_etapa_catalogo where ordem = 1)   -- etapa do catálogo da etapa 1 (o semeio da 20261031000002 gera o id)
    when 'C2' then (select id::text from public.orcamentista_etapa_catalogo where ordem = 2)   -- da etapa 2
    when 'C3' then (select id::text from public.orcamentista_etapa_catalogo where ordem = 3)   -- da etapa 3
  end
$$;
create or replace function pg_temp.medir(t text, c text) returns jsonb language sql as $$ select public.superadmin_arrasto_do_catalogo(t, c) $$;
create or replace function pg_temp.assin(t text, c text) returns text language sql as $$ select public.superadmin_arrasto_do_catalogo(t, c) ->> 'assinatura' $$;
create or replace function pg_temp.remover(t text, c text) returns jsonb language sql as $$
  select public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, t, c, pg_temp.assin(t, c)) $$;
-- o passo da medição pela tabela e ação (o primeiro que casa)
create or replace function pg_temp.passo(m jsonb, t text, a text) returns jsonb language sql as $$
  select x from jsonb_array_elements(m -> 'passos') x where x ->> 'tabela' = t and x ->> 'acao' = a order by (x ->> 'passo')::int limit 1 $$;
-- as linhas de log de uma remoção do catálogo
create or replace function pg_temp.logs(tp text) returns setof public.superadmin_alteracao_log language sql as $$
  select * from public.superadmin_alteracao_log l where l.antes -> 'remocao_do_catalogo' ->> 'tipo' = tp $$;
-- o conteúdo do motor (as 13 tabelas e a importação) de um dono
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
-- a soma das linhas de TODAS as tabelas que algum passo alcança (para provar que medir não apaga)
create or replace function pg_temp.tudo() returns bigint language plpgsql as $$
declare t text; n bigint := 0; k bigint;
begin
  for t in select distinct x ->> 't' from unnest(array['etapa', 'motor', 'fornecedor', 'familia']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x loop
    execute format('select count(*) from public.%I', t) into k; n := n + k;
  end loop;
  return n + (select count(*) from public.superadmin_alteracao_log);
end $$;

-- CASO 1: as duas funções da tela são só do service_role; as três auxiliares não têm grant nenhum
do $c$ declare f text; begin
  foreach f in array array['public.superadmin_arrasto_do_catalogo(text, text)', 'public.superadmin_remover_do_catalogo(uuid, text, text, text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') or not has_function_privilege('service_role', f, 'EXECUTE')
       or not (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'FALHOU caso 1: % aberta ou sem SECURITY DEFINER', f;
    end if;
  end loop;
  foreach f in array array['public.orcamentista_arrasto_passos(text)', 'public.orcamentista_arrasto_conjuntos(text, text)', 'public.orcamentista_arrasto_medir(text, text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'FALHOU caso 1: auxiliar % com grant', f;
    end if;
  end loop;
  raise notice 'ok: caso 1 — medir e remover so pelo service_role; as auxiliares sem grant';
end $c$;

-- CASO 2: saem as remoções que recusavam o uso
do $c$ begin
  if to_regprocedure('public.superadmin_remover_familia(uuid, text)') is not null or to_regprocedure('public.superadmin_remover_etapa_do_catalogo(uuid, uuid)') is not null then
    raise exception 'FALHOU caso 2: a recusa por uso ainda existe';
  end if;
  raise notice 'ok: caso 2 — superadmin_remover_familia e superadmin_remover_etapa_do_catalogo fora';
end $c$;

-- CASO 3: tipo desconhecido é 22023, na medição e na remoção
do $c$ declare n int := 0; begin
  begin perform pg_temp.medir('fornecedores', pg_temp.k('W')); exception when sqlstate '22023' then n := n + 1; end;
  begin perform public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, 'tabela', pg_temp.k('T1'), 'x'); exception when sqlstate '22023' then n := n + 1; end;
  if n is distinct from 2 then raise exception 'FALHOU caso 3: % de 2 recusas 22023', n; end if;
  raise notice 'ok: caso 3 — tipo desconhecido e 22023';
end $c$;

-- CASO 4: o que não existe é P0002 (uuid que não existe, chave que não é uuid, família inexistente, chave nula)
do $c$ declare n int := 0; begin
  begin perform pg_temp.medir('motor', gen_random_uuid()::text); exception when sqlstate 'P0002' then n := n + 1; end;
  begin perform pg_temp.medir('motor', 'nao-e-uuid'); exception when sqlstate 'P0002' then n := n + 1; end;
  begin perform pg_temp.medir('familia', 'NAO_EXISTE'); exception when sqlstate 'P0002' then n := n + 1; end;
  begin perform pg_temp.medir('etapa', null); exception when sqlstate 'P0002' then n := n + 1; end;
  begin perform public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, 'fornecedor', gen_random_uuid()::text, 'x'); exception when sqlstate 'P0002' then n := n + 1; end;
  if n is distinct from 5 then raise exception 'FALHOU caso 4: % de 5 recusas P0002', n; end if;
  raise notice 'ok: caso 4 — o que nao existe e P0002, nomeado';
end $c$;

-- CASO 5: medir não apaga nem loga nada, nos quatro tipos
do $c$ declare a bigint := pg_temp.tudo(); begin
  perform pg_temp.medir('fornecedor', pg_temp.k('W')); perform pg_temp.medir('familia', 'PVC');
  perform pg_temp.medir('motor', pg_temp.k('M')); perform pg_temp.medir('etapa', pg_temp.k('C2'));
  if pg_temp.tudo() is distinct from a then raise exception 'FALHOU caso 5: medir mudou % linha(s)', pg_temp.tudo() - a; end if;
  raise notice 'ok: caso 5 — medir nao apaga nem loga (% linhas iguais)', a;
end $c$;

-- CASO 6: quem não é super admin (ou autor nulo) é 42501, e nada sai
do $c$ declare n int := 0; a text := pg_temp.assin('motor', pg_temp.k('M')); begin
  begin perform public.superadmin_remover_do_catalogo(pg_temp.k('NS')::uuid, 'motor', pg_temp.k('M'), a); exception when sqlstate '42501' then n := n + 1; end;
  begin perform public.superadmin_remover_do_catalogo(null, 'motor', pg_temp.k('M'), a); exception when sqlstate '42501' then n := n + 1; end;
  if n is distinct from 2 or not exists (select 1 from public.orcamentista_motor where id = pg_temp.k('M')::uuid) then raise exception 'FALHOU caso 6: % de 2', n; end if;
  raise notice 'ok: caso 6 — so super admin remove (42501), e nada sai';
end $c$;

-- CASO 7: a assinatura errada (ou nula, ou a de outro item) é 40001, e nada sai
do $c$ declare n int := 0; begin
  begin perform public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, 'fornecedor', pg_temp.k('W'), 'errada'); exception when sqlstate '40001' then n := n + 1; end;
  begin perform public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, 'fornecedor', pg_temp.k('W'), null); exception when sqlstate '40001' then n := n + 1; end;
  begin perform public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, 'fornecedor', pg_temp.k('W'), pg_temp.assin('motor', pg_temp.k('M'))); exception when sqlstate '40001' then n := n + 1; end;
  if n is distinct from 3 or not exists (select 1 from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid) then raise exception 'FALHOU caso 7: % de 3', n; end if;
  raise notice 'ok: caso 7 — assinatura errada, nula ou de outro item: 40001, nada sai';
end $c$;

-- CASO 8: o arrasto mudou depois de mostrado (um item de preço a mais): 40001 com a frase, e nada sai
do $c$ declare a text := pg_temp.assin('fornecedor', pg_temp.k('W')); ok boolean := false; begin
  begin
    insert into public.orcamentista_tabela_item (tabela_id, codigo) values (pg_temp.k('T1')::uuid, 'W-NOVO');
    begin
      perform public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, 'fornecedor', pg_temp.k('W'), a);
    exception when sqlstate '40001' then ok := sqlerrm like 'o arrasto mudou desde que foi mostrado%Nada foi removido.';
    end;
    if not ok or not exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('T1')::uuid) then raise exception 'FALHOU caso 8: removeu com o arrasto mudado'; end if;
    raise notice 'ok: caso 8 — o arrasto mudou desde a medicao: 40001 com a frase, nada sai';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 9: FORNECEDOR Wolf Perfis — a medição (o aviso da conversa, o que fica) e a remoção (cada linha que sai, cada vínculo que cai, o log linha a linha)
do $c$ declare m jsonb; r jsonb; v_sai bigint; v_pv bigint; e text;
  v_ct bigint := pg_temp.conteudo('tabela_id', pg_temp.k('T1')) + pg_temp.conteudo('tabela_id', pg_temp.k('T2'));
  v_cm bigint := pg_temp.conteudo('motor_id', pg_temp.k('M')); begin
  begin
    m := pg_temp.medir('fornecedor', pg_temp.k('W'));
    -- a medição
    if m -> 'avisos' is distinct from jsonb_build_array(jsonb_build_object('tipo', 'conversa_para', 'tabela_id', pg_temp.k('T1'), 'arquivo', 'Perfis_de_PVC_-_Wolff.xlsx',
                                                                           'empresas', jsonb_build_array('Esquadrias De Paula Ltda'))) then
      raise exception 'FALHOU caso 9: o aviso da conversa: %', m -> 'avisos';
    end if;
    if (select (x ->> 'quantidade')::int from jsonb_array_elements(m -> 'ficam') x where x ->> 'rotulo' like 'arquivo no Storage%') is distinct from 9
       or (select (x ->> 'quantidade')::int from jsonb_array_elements(m -> 'ficam') x where x ->> 'rotulo' like 'texto fornecedor_perfil%') is distinct from 1 then
      raise exception 'FALHOU caso 9: o que fica: %', m -> 'ficam';
    end if;
    if (pg_temp.passo(m, 'orcamentista_tabela', 'sai') ->> 'quantidade')::int is distinct from 2 or (pg_temp.passo(m, 'orcamentista_motor', 'sai') ->> 'quantidade')::int is distinct from 1
       or (pg_temp.passo(m, 'orcamentista_familia_etapa', 'perde_o_vinculo') ->> 'quantidade')::int is distinct from 3
       or (pg_temp.passo(m, 'orcamentista_mp_categoria_fornecedor', 'sai') ->> 'quantidade')::int is distinct from 1
       or (pg_temp.passo(m, 'orcamentista_conta_tabela', 'sai') ->> 'quantidade')::int is distinct from 1
       or pg_temp.passo(m, 'orcamentista_fornecedor', 'sai') -> 'nomes' is distinct from '["Wolf Perfis"]' then
      raise exception 'FALHOU caso 9: a medicao por passo';
    end if;
    v_sai := (m ->> 'sai')::bigint; v_pv := (m ->> 'perde_o_vinculo')::bigint;
    -- a remoção
    r := pg_temp.remover('fornecedor', pg_temp.k('W'));
    if not (r ->> 'removido')::boolean or r ->> 'assinatura' is distinct from m ->> 'assinatura' then raise exception 'FALHOU caso 9: o retorno'; end if;
    if exists (select 1 from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid) or exists (select 1 from public.orcamentista_motor where id = pg_temp.k('M')::uuid)
       or exists (select 1 from public.orcamentista_tabela where id in (pg_temp.k('T1')::uuid, pg_temp.k('T2')::uuid))
       or exists (select 1 from public.orcamentista_tabela_item where tabela_id = pg_temp.k('T1')::uuid)
       or exists (select 1 from public.orcamentista_conta_tabela where tabela_id = pg_temp.k('T1')::uuid)
       or pg_temp.conteudo('tabela_id', pg_temp.k('T1')) is distinct from 0 or pg_temp.conteudo('motor_id', pg_temp.k('M')) is distinct from 0
       or exists (select 1 from public.orcamentista_motor_familia where motor_id = pg_temp.k('M')::uuid)
       or exists (select 1 from public.orcamentista_mp_categoria_fornecedor where fornecedor_id = pg_temp.k('W')::uuid) then
      raise exception 'FALHOU caso 9: sobrou algo do fornecedor';
    end if;
    -- o que fica: os outros fornecedores e tabelas, o vínculo de VIDRO, as etapas (sem motor), o Storage, o texto
    if not exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('TI')::uuid) or not exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('TE')::uuid)
       or (select count(*) from public.orcamentista_mp_categoria_fornecedor where fornecedor_id = pg_temp.k('ES')::uuid) is distinct from 1
       or (select count(*) from public.orcamentista_familia_etapa where materia_prima_id = pg_temp.k('MP')::uuid and motor_id is null and motor_familia_exigida is null) is distinct from 3
       or (select array_agg(numero order by numero) from public.orcamentista_familia_etapa where materia_prima_id = pg_temp.k('MP')::uuid) is distinct from '{1,2,3}'
       or (select count(*) from storage.objects where name like pg_temp.k('W') || '/%') is distinct from 9
       or (select count(*) from public.orcamentista_esquadrias_base where fornecedor_perfil = 'Wolf Perfis') is distinct from 1
       or (select count(*) from public.orcamentista_mp_categoria where materia_prima_id = pg_temp.k('MP')::uuid) is distinct from 7 then
      raise exception 'FALHOU caso 9: saiu o que devia ficar';
    end if;
    -- o log: uma linha por linha mexida; a linha inteira em antes; depois nulo no que sai; o tenant de quem era
    if (select count(*) from pg_temp.logs('fornecedor')) is distinct from v_sai + v_pv or (select count(*) from pg_temp.logs('fornecedor') where depois is null) is distinct from v_sai then
      raise exception 'FALHOU caso 9: o log tem % linhas (% sai, % perde o vinculo)', (select count(*) from pg_temp.logs('fornecedor')), v_sai, v_pv;
    end if;
    if (select antes -> 'orcamentista_tabela' ->> 'motor_path' from pg_temp.logs('fornecedor') where tabela = 'orcamentista_tabela' and chave = pg_temp.k('T1')) is distinct from '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/wolff-motor.xlsx'
       or (select tenant_id from pg_temp.logs('fornecedor') where tabela = 'orcamentista_conta_tabela')::text is distinct from pg_temp.k('DP')
       or (select tenant_id from pg_temp.logs('fornecedor') where tabela = 'orcamentista_mp_categoria_fornecedor')::text is distinct from pg_temp.k('DP')
       or (select tenant_id from pg_temp.logs('fornecedor') where tabela = 'orcamentista_motor') is not null
       or (select por from pg_temp.logs('fornecedor') limit 1)::text is distinct from pg_temp.k('SA')
       or (select count(*) from pg_temp.logs('fornecedor') where tabela = 'orcamentista_familia_etapa' and tenant_id = pg_temp.k('DP')::uuid
            and antes -> 'orcamentista_familia_etapa' ->> 'motor_id' = pg_temp.k('M') and depois -> 'orcamentista_familia_etapa' ->> 'motor_id' is null
            and depois -> 'orcamentista_familia_etapa' ->> 'etapa_catalogo_id' is not null) is distinct from 3
       or exists (select 1 from pg_temp.logs('fornecedor') where antes -> 'remocao_do_catalogo' ->> 'nome' is distinct from 'Wolf Perfis') then
      raise exception 'FALHOU caso 9: o conteudo do log';
    end if;
    -- contado à parte, antes: cada linha do conteúdo (das tabelas e do motor) tem a sua linha de log — nenhuma saiu por cascata, sem log
    if (select count(*) from pg_temp.logs('fornecedor') l where l.tabela like 'orcamentista_motor\_%' escape '\' or l.tabela = 'orcamentista_importacao')
         - (select count(*) from pg_temp.logs('fornecedor') l where l.tabela in ('orcamentista_motor_familia'))
       is distinct from v_ct + v_cm or v_ct + v_cm = 0 then
      raise exception 'FALHOU caso 9: o conteudo tinha % linhas (% das tabelas, % do motor) e o log tem %', v_ct + v_cm, v_ct, v_cm,
        (select count(*) from pg_temp.logs('fornecedor') l where l.tabela like 'orcamentista_motor\_%' escape '\' or l.tabela = 'orcamentista_importacao');
    end if;
    raise notice 'ok: caso 9 — fornecedor Wolf Perfis: aviso da conversa, % linhas saem e % perdem o vinculo, Storage e texto ficam, log linha a linha', v_sai, v_pv;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 10: FAMÍLIA PVC — o motor só-PVC e a tabela de Perfil saem; a de outra categoria e a matéria-prima ficam sem a família; as etapas da família saem;
-- as categorias e os dados da conta ficam; nada impede
do $c$ declare m jsonb; v_sai bigint; v_pv bigint; v_t1 bigint := pg_temp.conteudo('tabela_id', pg_temp.k('T1')); begin
  begin
    m := pg_temp.medir('familia', 'PVC');
    if jsonb_array_length(m -> 'impedimentos') is distinct from 0 or jsonb_array_length(m -> 'avisos') is distinct from 0
       or pg_temp.passo(m, 'orcamentista_motor', 'sai') -> 'nomes' is distinct from '["Motor_Wolf_PVC"]'
       or (pg_temp.passo(m, 'orcamentista_tabela', 'sai') ->> 'quantidade')::int is distinct from 1
       or (pg_temp.passo(m, 'orcamentista_tabela', 'perde_o_vinculo') ->> 'quantidade')::int is distinct from 1
       or (pg_temp.passo(m, 'orcamentista_materia_prima', 'perde_o_vinculo') ->> 'quantidade')::int is distinct from 1
       or (pg_temp.passo(m, 'orcamentista_familia_etapa', 'sai') ->> 'quantidade')::int is distinct from 3
       or (pg_temp.passo(m, 'orcamentista_familia_ramificacao', 'sai') ->> 'quantidade')::int is distinct from 7
       or (select (x ->> 'quantidade')::int from jsonb_array_elements(m -> 'ficam') x where x ->> 'rotulo' like 'categoria da materia-prima%') is distinct from 7 then
      raise exception 'FALHOU caso 10: a medicao: %', m;
    end if;
    v_sai := (m ->> 'sai')::bigint; v_pv := (m ->> 'perde_o_vinculo')::bigint;
    perform pg_temp.remover('familia', 'PVC');
    if exists (select 1 from public.orcamentista_familia_catalogo where chave = 'PVC') or exists (select 1 from public.orcamentista_familia_ramificacao where familia = 'PVC')
       or exists (select 1 from public.orcamentista_motor where id = pg_temp.k('M')::uuid) or pg_temp.conteudo('motor_id', pg_temp.k('M')) is distinct from 0
       or exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('T2')::uuid)
       or exists (select 1 from public.orcamentista_familia_etapa where materia_prima_id = pg_temp.k('MP')::uuid) then
      raise exception 'FALHOU caso 10: sobrou algo da familia';
    end if;
    if (select familia from public.orcamentista_tabela where id = pg_temp.k('TI')::uuid) is not null
       or (select categoria_chave from public.orcamentista_tabela where id = pg_temp.k('TI')::uuid) is distinct from 'FERRAGENS'
       or not exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('T1')::uuid) or pg_temp.conteudo('tabela_id', pg_temp.k('T1')) is distinct from v_t1
       or (select familia from public.orcamentista_materia_prima where id = pg_temp.k('MP')::uuid) is not null
       or (select nome from public.orcamentista_materia_prima where id = pg_temp.k('MP')::uuid) is distinct from 'Esquadrias de PVC WOLF'
       or (select count(*) from public.orcamentista_mp_categoria where materia_prima_id = pg_temp.k('MP')::uuid) is distinct from 7
       or (select count(*) from public.orcamentista_mp_ferragem f join public.orcamentista_mp_categoria c on c.id = f.mp_categoria_id where c.materia_prima_id = pg_temp.k('MP')::uuid) is distinct from 4
       or (select count(*) from public.orcamentista_mp_categoria_fornecedor) is distinct from 2
       or not exists (select 1 from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid) then
      raise exception 'FALHOU caso 10: saiu (ou nao perdeu a familia) o que devia ficar';
    end if;
    if (select count(*) from pg_temp.logs('familia')) is distinct from v_sai + v_pv
       or (select tenant_id from pg_temp.logs('familia') where tabela = 'orcamentista_materia_prima')::text is distinct from pg_temp.k('DP')
       or (select antes -> 'orcamentista_materia_prima' ->> 'familia' from pg_temp.logs('familia') where tabela = 'orcamentista_materia_prima') is distinct from 'PVC'
       or (select depois -> 'orcamentista_materia_prima' ->> 'familia' from pg_temp.logs('familia') where tabela = 'orcamentista_materia_prima') is not null
       or (select count(*) from pg_temp.logs('familia') where tabela = 'orcamentista_familia_etapa' and depois is null and tenant_id = pg_temp.k('DP')::uuid) is distinct from 3 then
      raise exception 'FALHOU caso 10: o log';
    end if;
    raise notice 'ok: caso 10 — familia PVC: motor so-PVC e tabela de Perfil saem; FERRAGENS e a materia-prima ficam sem familia; % saem, % perdem o vinculo', v_sai, v_pv;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 11: FAMÍLIA PVC com o motor atuando também em ALUMINIO — o motor FICA (só perde a ligação PVC), com o conteúdo
do $c$ declare m jsonb; v bigint := pg_temp.conteudo('motor_id', pg_temp.k('M')); begin
  begin
    insert into public.orcamentista_motor_familia (motor_id, familia) values (pg_temp.k('M')::uuid, 'ALUMINIO');
    m := pg_temp.medir('familia', 'PVC');
    if pg_temp.passo(m, 'orcamentista_motor', 'sai') ->> 'quantidade' is distinct from '0' or pg_temp.passo(m, 'orcamentista_motor_familia', 'sai') -> 'nomes' is distinct from '["Motor_Wolf_PVC / PVC"]' then
      raise exception 'FALHOU caso 11: a medicao do motor de duas familias';
    end if;
    perform pg_temp.remover('familia', 'PVC');
    if not exists (select 1 from public.orcamentista_motor where id = pg_temp.k('M')::uuid) or pg_temp.conteudo('motor_id', pg_temp.k('M')) is distinct from v
       or (select array_agg(familia) from public.orcamentista_motor_familia where motor_id = pg_temp.k('M')::uuid) is distinct from '{ALUMINIO}' then
      raise exception 'FALHOU caso 11: o motor de duas familias saiu ou perdeu conteudo';
    end if;
    raise notice 'ok: caso 11 — motor de duas familias fica, com o conteudo (% linhas); so a ligacao PVC sai', v;
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 12: MOTOR — o conteúdo do motor sai; as etapas perdem o motor; a tabela (e o conteúdo dela) e o fornecedor ficam; remover de novo é P0002
do $c$ declare m jsonb; v_t1 bigint := pg_temp.conteudo('tabela_id', pg_temp.k('T1')); ok boolean := false; begin
  begin
    m := pg_temp.medir('motor', pg_temp.k('M'));
    if jsonb_array_length(m -> 'avisos') is distinct from 0 or (pg_temp.passo(m, 'orcamentista_familia_etapa', 'perde_o_vinculo') ->> 'quantidade')::int is distinct from 3
       or exists (select 1 from jsonb_array_elements(m -> 'passos') x where x ->> 'tabela' in ('orcamentista_tabela', 'orcamentista_tabela_item', 'orcamentista_fornecedor')) then
      raise exception 'FALHOU caso 12: a medicao do motor alcanca a tabela ou o fornecedor';
    end if;
    perform pg_temp.remover('motor', pg_temp.k('M'));
    if exists (select 1 from public.orcamentista_motor where id = pg_temp.k('M')::uuid) or pg_temp.conteudo('motor_id', pg_temp.k('M')) is distinct from 0
       or pg_temp.conteudo('tabela_id', pg_temp.k('T1')) is distinct from v_t1 or not exists (select 1 from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid)
       or (select count(*) from public.orcamentista_conta_tabela) is distinct from 1
       or (select count(*) from public.orcamentista_familia_etapa where materia_prima_id = pg_temp.k('MP')::uuid and motor_id is null) is distinct from 3
       or (select count(*) from pg_temp.logs('motor')) is distinct from (m ->> 'sai')::bigint + (m ->> 'perde_o_vinculo')::bigint then
      raise exception 'FALHOU caso 12: a remocao do motor';
    end if;
    begin perform pg_temp.remover('motor', pg_temp.k('M')); exception when sqlstate 'P0002' then ok := true; end;
    if not ok then raise exception 'FALHOU caso 12: remover de novo nao foi P0002'; end if;
    raise notice 'ok: caso 12 — motor: % linhas do motor saem, 3 etapas ficam sem motor, a tabela e o fornecedor ficam', m ->> 'sai';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 13: TRAVA C pela FAMÍLIA — o item de levantamento com família, motor e tabela de Perfil FICA e perde os três vínculos; o resto dele não muda
do $c$ declare a jsonb; d jsonb; begin
  begin
    update public.orcamentista_levantamento_item set familia = 'PVC', motor_id = pg_temp.k('M')::uuid, motor_familia_exigida = 'PVC', tabela_id = pg_temp.k('T2')::uuid
     where id = pg_temp.k('IT')::uuid;
    a := to_jsonb(i) - array['familia', 'motor_id', 'motor_familia_exigida', 'tabela_id'] from public.orcamentista_levantamento_item i where id = pg_temp.k('IT')::uuid;
    perform pg_temp.remover('familia', 'PVC');
    select to_jsonb(i) into d from public.orcamentista_levantamento_item i where id = pg_temp.k('IT')::uuid;
    if d is null or not exists (select 1 from public.orcamentista_levantamento where id = pg_temp.k('LV')::uuid) then raise exception 'FALHOU caso 13: o documento de cliente saiu'; end if;
    if d ->> 'familia' is not null or d ->> 'motor_id' is not null or d ->> 'motor_familia_exigida' is not null or d ->> 'tabela_id' is not null
       or d - array['familia', 'motor_id', 'motor_familia_exigida', 'tabela_id'] is distinct from a then
      raise exception 'FALHOU caso 13: o item nao perdeu (so) os vinculos: %', d;
    end if;
    if (select count(*) from pg_temp.logs('familia') where tabela = 'orcamentista_levantamento_item' and tenant_id = pg_temp.k('DP')::uuid
          and antes -> 'orcamentista_levantamento_item' ->> 'familia' = 'PVC') is distinct from 1
       or (select count(*) from pg_temp.logs('familia') where tabela = 'orcamentista_levantamento_item' and depois -> 'orcamentista_levantamento_item' ->> 'tabela_id' is null
          and antes -> 'orcamentista_levantamento_item' ->> 'tabela_id' = pg_temp.k('T2')) is distinct from 1 then
      raise exception 'FALHOU caso 13: o log do item';
    end if;
    raise notice 'ok: caso 13 — trava C pela familia: o item fica, perde familia, motor e tabela, com antes e depois no log';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 14: TRAVA C pelo FORNECEDOR — o item com a tabela e o motor do fornecedor fica, perde os dois, e a família dele fica
do $c$ declare d jsonb; begin
  begin
    update public.orcamentista_levantamento_item set familia = 'PVC', motor_id = pg_temp.k('M')::uuid, motor_familia_exigida = 'PVC', tabela_id = pg_temp.k('T1')::uuid
     where id = pg_temp.k('IT')::uuid;
    perform pg_temp.remover('fornecedor', pg_temp.k('W'));
    select to_jsonb(i) into d from public.orcamentista_levantamento_item i where id = pg_temp.k('IT')::uuid;
    if d is null or d ->> 'motor_id' is not null or d ->> 'motor_familia_exigida' is not null or d ->> 'tabela_id' is not null or d ->> 'familia' is distinct from 'PVC' then
      raise exception 'FALHOU caso 14: %', d;
    end if;
    if (select count(*) from pg_temp.logs('fornecedor') where tabela = 'orcamentista_levantamento_item' and tenant_id = pg_temp.k('DP')::uuid) is distinct from 2 then
      raise exception 'FALHOU caso 14: o log do item (motor e tabela)';
    end if;
    raise notice 'ok: caso 14 — trava C pelo fornecedor: o item fica, perde motor e tabela, mantem a familia';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 15: TRAVA C pelo MOTOR — o item fica, perde o motor, mantém família e tabela
do $c$ declare d jsonb; begin
  begin
    update public.orcamentista_levantamento_item set familia = 'PVC', motor_id = pg_temp.k('M')::uuid, motor_familia_exigida = 'PVC', tabela_id = pg_temp.k('T1')::uuid
     where id = pg_temp.k('IT')::uuid;
    perform pg_temp.remover('motor', pg_temp.k('M'));
    select to_jsonb(i) into d from public.orcamentista_levantamento_item i where id = pg_temp.k('IT')::uuid;
    if d is null or d ->> 'motor_id' is not null or d ->> 'motor_familia_exigida' is not null or d ->> 'tabela_id' is distinct from pg_temp.k('T1') or d ->> 'familia' is distinct from 'PVC' then
      raise exception 'FALHOU caso 15: %', d;
    end if;
    raise notice 'ok: caso 15 — trava C pelo motor: o item fica, perde o motor, mantem familia e tabela';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 16: ETAPA DO CATÁLOGO em uso — a etapa 2 da conta sai, as de baixo sobem (1..N sem buraco), a instrução e o motor das que ficam não mudam
do $c$ declare m jsonb; begin
  begin
    update public.orcamentista_familia_etapa set instrucao = 'instrucao ' || numero where materia_prima_id = pg_temp.k('MP')::uuid;
    m := pg_temp.medir('etapa', pg_temp.k('C2'));
    if m -> 'avisos' is distinct from '[{"tipo": "renumeracao"}]'::jsonb or pg_temp.passo(m, 'orcamentista_familia_etapa', 'sai') -> 'nomes' is distinct from '["Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 2"]' then
      raise exception 'FALHOU caso 16: a medicao: %', m;
    end if;
    perform pg_temp.remover('etapa', pg_temp.k('C2'));
    if exists (select 1 from public.orcamentista_etapa_catalogo where id = pg_temp.k('C2')::uuid)
       or (select array_agg(numero || ':' || etapa_catalogo_id || ':' || instrucao || ':' || (motor_id is not null) order by numero) from public.orcamentista_familia_etapa where materia_prima_id = pg_temp.k('MP')::uuid)
          is distinct from array['1:' || pg_temp.k('C1') || ':instrucao 1:true', '2:' || pg_temp.k('C3') || ':instrucao 3:true']
       or (select count(*) from public.orcamentista_etapa_catalogo) is distinct from 2 then
      raise exception 'FALHOU caso 16: a remocao da etapa ou a renumeracao';
    end if;
    if (select count(*) from pg_temp.logs('etapa')) is distinct from 3
       or (select jsonb_array_length(antes -> 'orcamentista_familia_etapa') || '>' || jsonb_array_length(depois -> 'orcamentista_familia_etapa') from pg_temp.logs('etapa')
            where chave = pg_temp.k('MP')) is distinct from '2>2'
       or (select tenant_id from pg_temp.logs('etapa') where tabela = 'orcamentista_etapa_catalogo') is not null then
      raise exception 'FALHOU caso 16: o log (etapa, item e renumeracao)';
    end if;
    raise notice 'ok: caso 16 — etapa do catalogo em uso: a etapa 2 sai, a 3 vira 2, instrucao e motor intactos, log da renumeracao';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 17: ETAPA DO CATÁLOGO sem uso — sai sozinha, sem aviso nem renumeração
do $c$ declare v uuid; m jsonb; begin
  begin
    insert into public.orcamentista_etapa_catalogo (nome, acao, abas, ordem) values ('Etapa sem uso', 'CALCULAR_BARRAS', '{}', 9) returning id into v;
    m := pg_temp.medir('etapa', v::text);
    if jsonb_array_length(m -> 'avisos') is distinct from 0 or (m ->> 'sai')::int is distinct from 1 or (m ->> 'perde_o_vinculo')::int is distinct from 0 then raise exception 'FALHOU caso 17: a medicao %', m; end if;
    perform pg_temp.remover('etapa', v::text);
    if exists (select 1 from public.orcamentista_etapa_catalogo where id = v) or (select count(*) from pg_temp.logs('etapa')) is distinct from 1
       or (select count(*) from public.orcamentista_familia_etapa) is distinct from 3 then
      raise exception 'FALHOU caso 17';
    end if;
    raise notice 'ok: caso 17 — etapa do catalogo sem uso: sai sozinha, sem renumerar';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 18: os nomes são até 10, e o resto é "mais N"
do $c$ declare p jsonb; begin
  begin
    insert into public.orcamentista_tabela_item (tabela_id, codigo) select pg_temp.k('T1')::uuid, 'X' || g from generate_series(1, 5) g;
    p := pg_temp.passo(pg_temp.medir('fornecedor', pg_temp.k('W')), 'orcamentista_tabela_item', 'sai');
    if (p ->> 'quantidade')::int is distinct from 12 or jsonb_array_length(p -> 'nomes') is distinct from 10 or (p ->> 'mais')::int is distinct from 2 then raise exception 'FALHOU caso 18: %', p; end if;
    raise notice 'ok: caso 18 — 12 itens de preco: 10 nomes e "mais 2"';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 19: o IMPEDIMENTO — a tabela FERRAGENS da IMAB, vigente na PVC, colidiria com outra vigente FERRAGENS sem família: a medição nomeia as duas, a
-- remoção recusa (23505) antes de apagar, e nada sai
do $c$ declare m jsonb; ok boolean := false; begin
  begin
    update public.orcamentista_tabela set vigente = true where id = pg_temp.k('TI')::uuid;
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave, vigente)
    values (pg_temp.k('IM')::uuid, pg_temp.k('IM') || '/arquivo/ferragens-geral.xlsx', 'FERRAGENS geral.xlsx', null, 'FERRAGENS', true);
    m := pg_temp.medir('familia', 'PVC');
    if jsonb_array_length(m -> 'impedimentos') is distinct from 1 or m -> 'impedimentos' -> 0 ->> 'tipo' is distinct from 'vigentes_sem_familia'
       or m -> 'impedimentos' -> 0 ->> 'fornecedor' is distinct from 'IMAB INDUSTRIA METALURGICA LTDA' or m -> 'impedimentos' -> 0 ->> 'categoria' is distinct from 'FERRAGENS'
       or (select array_agg(a ->> 'arquivo' order by a ->> 'arquivo') from jsonb_array_elements(m -> 'impedimentos' -> 0 -> 'tabelas') a)
          is distinct from array['FERRAGENS - IMAB INDUSTRIA METALURGICA LTDA.xlsx', 'FERRAGENS geral.xlsx'] then
      raise exception 'FALHOU caso 19: a medicao do impedimento: %', m -> 'impedimentos';
    end if;
    begin perform pg_temp.remover('familia', 'PVC');
    exception when sqlstate '23505' then ok := sqlerrm like 'a remocao esta impedida:%Nada foi removido.';
    end;
    if not ok or not exists (select 1 from public.orcamentista_familia_catalogo where chave = 'PVC') or (select count(*) from pg_temp.logs('familia')) is distinct from 0 then
      raise exception 'FALHOU caso 19: removeu com impedimento';
    end if;
    raise notice 'ok: caso 19 — duas FERRAGENS vigentes ficariam sem familia: a medicao nomeia, a remocao recusa (23505), nada sai';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 20: AS FKs CONTINUAM RESTRICT — apagar a raiz direto, fora da função, ainda é recusado pelo banco
do $c$ declare n int := 0; begin
  begin delete from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid; exception when sqlstate '23503' then n := n + 1; end;
  begin delete from public.orcamentista_familia_catalogo where chave = 'PVC'; exception when sqlstate '23503' then n := n + 1; end;
  begin delete from public.orcamentista_etapa_catalogo where id = pg_temp.k('C1')::uuid; exception when sqlstate '23503' then n := n + 1; end;
  begin delete from public.orcamentista_tabela where id = pg_temp.k('T1')::uuid; exception when sqlstate '23503' then n := n + 1; end;
  if n is distinct from 4 then raise exception 'FALHOU caso 20: % de 4 DELETE diretos recusados', n; end if;
  raise notice 'ok: caso 20 — DELETE direto da raiz continua 23503 (nenhuma FK virou CASCADE)';
end $c$;

-- CASO 21: uma linha que SOME no meio da remoção (um gatilho apaga um item de preço quando as etapas perdem o motor): o passo mexe em menos do que
-- mediu, e a remoção aborta INTEIRA, nomeando o passo — nada sai
create or replace function pg_temp.h_some() returns trigger language plpgsql as $f$
begin delete from public.orcamentista_tabela_item where ctid = (select ctid from public.orcamentista_tabela_item where tabela_id = '72366020-57c9-489f-9385-397b7fa3dedb' limit 1); return null; end $f$;
do $c$ declare ok boolean := false; begin
  begin
    create trigger h_some after update on public.orcamentista_familia_etapa for each statement execute function pg_temp.h_some();
    begin perform pg_temp.remover('fornecedor', pg_temp.k('W'));
    exception when others then ok := sqlerrm like 'o passo % (orcamentista_tabela_item, sai) mexeu em 6 linha(s), e a medicao disse 7. Nada foi removido.';
      if not ok then raise exception 'FALHOU caso 21: outra frase: %', sqlerrm; end if;
    end;
    if not ok or not exists (select 1 from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid) or (select count(*) from pg_temp.logs('fornecedor')) is distinct from 0 then
      raise exception 'FALHOU caso 21: removeu com a linha que sumiu no meio';
    end if;
    raise notice 'ok: caso 21 — uma linha que some no meio: o passo nao fecha com a medicao e a remocao aborta inteira';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;

-- CASO 22: uma linha que sai FORA do arrasto (um gatilho apaga uma ferragem da conta quando a tabela escolhida sai — como faria uma FK em cascata
-- nova): a conta das tabelas não fecha, e a remoção aborta inteira, nomeando a tabela — nada sai
create or replace function pg_temp.h_fora() returns trigger language plpgsql as $f$
begin delete from public.orcamentista_mp_ferragem where ctid = (select ctid from public.orcamentista_mp_ferragem limit 1); return null; end $f$;
do $c$ declare ok boolean := false; begin
  begin
    create trigger h_fora after delete on public.orcamentista_conta_tabela for each statement execute function pg_temp.h_fora();
    begin perform pg_temp.remover('fornecedor', pg_temp.k('W'));
    exception when others then ok := sqlerrm like 'a tabela orcamentista_mp_ferragem perdeu linha(s) fora do arrasto (uma chave estrangeira em cascata): eram 4, ficaram 3. Nada foi removido.';
      if not ok then raise exception 'FALHOU caso 22: outra frase: %', sqlerrm; end if;
    end;
    if not ok or not exists (select 1 from public.orcamentista_fornecedor where id = pg_temp.k('W')::uuid) or (select count(*) from public.orcamentista_mp_ferragem) is distinct from 4 then
      raise exception 'FALHOU caso 22: removeu com uma linha saindo fora do arrasto';
    end if;
    raise notice 'ok: caso 22 — uma linha que sai fora do arrasto (cascata): a conta das tabelas nao fecha e a remocao aborta inteira';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end $c$;
