-- Os CASOS da 20261102000002 (as categorias ganham tela), sobre o estado de 02/11/2026 (09_estado.sql) com a 20261031000003 e a 20261101000001
-- aplicadas. Cada caso roda numa subtransação e se desfaz (P0099): os casos não dependem uns dos outros. Imprime "ok: ..." ou "FALHOU ...".
-- A contagem dos "-- CASO " é o que o run.sh espera.
\set ON_ERROR_STOP 0
set client_min_messages = notice;

create or replace function pg_temp.k(n text) returns text language sql stable as $$
  select case n
    when 'W'  then '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'   -- Wolf Perfis
    when 'ES' then '520b1fb2-8834-421d-88ee-91790fa04bcb'   -- Estrela
    when 'M'  then '9a233c55-f377-45d3-b2ae-b1a740a98e44'   -- Motor_Wolf_PVC (PERFIL)
    when 'TP' then '7a000000-0000-4000-8000-0000000000aa'   -- Persianas_-_Wolff.xlsx (PERSIANAS, 5 itens; 09_estado.sql)
    when 'MP' then '79d764fe-4acd-43e2-bed9-38e20667ca3d'   -- Esquadrias de PVC WOLF (a matéria-prima da De Paula)
    when 'DP' then '20e08592-f957-4e72-b7eb-251387e34eb9'   -- Esquadrias De Paula
    when 'SA' then 'e0000000-0000-0000-0000-000000000001'   -- super admin
    when 'NS' then 'e0000000-0000-0000-0000-000000000002'   -- não é super admin
    when 'IT' then '1e000000-0000-0000-0000-0000000000a1'   -- o item de levantamento
    when 'E1' then 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d'   -- a etapa 1 da De Paula (aponta o Motor_Wolf_PVC)
  end
$$;
create or replace function pg_temp.medir(t text, c text) returns jsonb language sql as $$ select public.superadmin_arrasto_do_catalogo(t, c) $$;
create or replace function pg_temp.assin(t text, c text) returns text language sql as $$ select public.superadmin_arrasto_do_catalogo(t, c) ->> 'assinatura' $$;
create or replace function pg_temp.remover(t text, c text) returns jsonb language sql as $$
  select public.superadmin_remover_do_catalogo(pg_temp.k('SA')::uuid, t, c, pg_temp.assin(t, c)) $$;
create or replace function pg_temp.criar(c text, r text) returns jsonb language sql as $$ select public.superadmin_criar_categoria(pg_temp.k('SA')::uuid, c, r) $$;
create or replace function pg_temp.editar(c text, r text) returns jsonb language sql as $$ select public.superadmin_editar_categoria(pg_temp.k('SA')::uuid, c, r) $$;
-- o passo da medição pela tabela e ação (o primeiro que casa)
create or replace function pg_temp.passo(m jsonb, t text, a text) returns jsonb language sql as $$
  select x from jsonb_array_elements(m -> 'passos') x where x ->> 'tabela' = t and x ->> 'acao' = a order by (x ->> 'passo')::int limit 1 $$;
-- as linhas de log de uma remoção do catálogo do tipo categoria
create or replace function pg_temp.logs() returns setof public.superadmin_alteracao_log language sql as $$
  select * from public.superadmin_alteracao_log l where l.antes -> 'remocao_do_catalogo' ->> 'tipo' = 'categoria' $$;
-- as chaves do catálogo, na ordem
create or replace function pg_temp.catalogo() returns text language sql as $$
  select string_agg(chave || ':' || ordem || ':' || rotulo, ',' order by ordem) from public.orcamentista_categoria_catalogo $$;
-- a soma das linhas de TODAS as tabelas que algum passo dos seis tipos alcança (para provar que medir e recusar não apagam)
create or replace function pg_temp.tudo() returns bigint language plpgsql as $$
declare t text; n bigint := 0; k bigint;
begin
  for t in select distinct x ->> 't' from unnest(array['etapa', 'motor', 'fornecedor', 'familia', 'tabela', 'categoria']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x loop
    execute format('select count(*) from public.%I', t) into k; n := n + k;
  end loop;
  return n + (select count(*) from public.superadmin_alteracao_log);
end $$;
-- a foto das FKs do schema public
create or replace function pg_temp.fks() returns text language sql as $$
  select string_agg(conname || '=' || md5(pg_get_constraintdef(oid)), ',' order by conname) from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace $$;
-- erra se o SQL não falhar com o sqlstate e a frase esperados; devolve a mensagem
create or replace function pg_temp.recusa(sql text, estado text, frase text) returns text language plpgsql as $$
declare m text; s text;
begin
  begin execute sql; exception when others then get stacked diagnostics m = message_text, s = returned_sqlstate;
    if s <> estado or position(frase in m) = 0 then raise exception 'esperava % "%", veio % "%"', estado, frase, s, m; end if;
    return m;
  end;
  raise exception 'esperava a recusa % "%", e passou', estado, frase;
end $$;

-- CASO 1: as duas funções novas são só do service_role (as quatro do arrasto continuam fechadas), e as estruturais são as quatro
do $c$ declare f text; begin
  foreach f in array array['superadmin_criar_categoria(uuid, text, text)', 'superadmin_editar_categoria(uuid, text, text)', 'superadmin_remover_do_catalogo(uuid, text, text, text)'] loop
    if has_function_privilege('authenticated', 'public.' || f, 'execute') or has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'FALHOU caso 1: % aberta', f; end if;
    if not has_function_privilege('service_role', 'public.' || f, 'execute') then raise exception 'FALHOU caso 1: % sem o service_role', f; end if;
  end loop;
  foreach f in array array['orcamentista_arrasto_passos(text)', 'orcamentista_arrasto_conjuntos(text, text)', 'orcamentista_arrasto_medir(text, text)'] loop
    if has_function_privilege('authenticated', 'public.' || f, 'execute') or has_function_privilege('service_role', 'public.' || f, 'execute') then raise exception 'FALHOU caso 1: % com grant', f; end if;
  end loop;
  if public.orcamentista_categorias_estruturais() is distinct from array['PERFIL', 'VIDRO', 'FERRAGENS', 'INSTALACAO'] then raise exception 'FALHOU caso 1: estruturais %', public.orcamentista_categorias_estruturais(); end if;
  if (select count(*) from pg_proc where proname in ('superadmin_criar_categoria', 'superadmin_editar_categoria', 'orcamentista_categorias_estruturais') and prosecdef and 'search_path=public, pg_temp' = any (proconfig)) <> 2 then
    raise exception 'FALHOU caso 1: as duas funções da tela não são SECURITY DEFINER com search_path fixo'; end if;
  raise notice 'ok: caso 1 — criar e editar só do service_role, SECURITY DEFINER com search_path fixo; o arrasto segue fechado; as quatro estruturais';
end $c$;

-- CASO 2: o tipo 'categoria' tem exatamente os 43 passos, na ordem: o item e a etapa perdem o vínculo; o conteúdo dos motores e das tabelas,
-- a importação, os itens, a conta_tabela, a ligação, o motor e a tabela saem; depois a base de conhecimento (fornecedor escolhido, vidro, ferragem,
-- instalação, categoria da família de conta), os campos, as ramificações e a categoria. E os tipos de antes não ganharam passo da categoria
do $c$ declare v text; c text; begin
  select string_agg((x ->> 't') || ':' || (x ->> 'acao'), ',' order by o) into v from jsonb_array_elements(public.orcamentista_arrasto_passos('categoria')) with ordinality z(x, o);
  select string_agg(t || ':sai', ',' order by o) into c from unnest(array['orcamentista_motor_baguete', 'orcamentista_motor_formula', 'orcamentista_motor_formula_familia', 'orcamentista_motor_insumo',
    'orcamentista_motor_otimizacao', 'orcamentista_motor_perfil', 'orcamentista_motor_regra', 'orcamentista_motor_tipologia', 'orcamentista_motor_tipologia_detalhe',
    'orcamentista_motor_tipologia_tempo', 'orcamentista_motor_validacao', 'orcamentista_motor_variavel', 'orcamentista_motor_vidro']) with ordinality z(t, o);
  if v is distinct from 'orcamentista_levantamento_item:perde_o_vinculo,orcamentista_levantamento_item:perde_o_vinculo,orcamentista_familia_etapa:perde_o_vinculo,'
     || c || ',' || c || ',orcamentista_importacao:sai,orcamentista_tabela_item:sai,orcamentista_conta_tabela:sai,orcamentista_motor_familia:sai,orcamentista_motor:sai,orcamentista_tabela:sai,'
     || 'orcamentista_mp_categoria_fornecedor:sai,orcamentista_mp_vidro:sai,orcamentista_mp_ferragem:sai,orcamentista_mp_instalacao:sai,orcamentista_mp_categoria:sai,'
     || 'orcamentista_categoria_campo:sai,orcamentista_familia_ramificacao:sai,orcamentista_categoria_catalogo:sai' then raise exception 'FALHOU caso 2: %', v; end if;
  -- os filtros da base de conhecimento vão pela categoria da família de conta (mp_categoria.categoria_chave), e o item perde a tabela ($3) e o motor ($2)
  if (select count(*) from jsonb_array_elements(public.orcamentista_arrasto_passos('categoria')) x where x ->> 't' in ('orcamentista_mp_categoria_fornecedor', 'orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao')
        and x ->> 'filtro' = 'x.mp_categoria_id IN (SELECT c.id FROM public.orcamentista_mp_categoria c WHERE c.categoria_chave = $1)') <> 4 then raise exception 'FALHOU caso 2: os filtros da base de conhecimento'; end if;
  if (select x ->> 'anula' from jsonb_array_elements(public.orcamentista_arrasto_passos('categoria')) x where x ->> 't' = 'orcamentista_levantamento_item' and x ->> 'filtro' = 'x.motor_id = ANY ($2)') <> 'motor_id = NULL, motor_familia_exigida = NULL'
     or (select x ->> 'anula' from jsonb_array_elements(public.orcamentista_arrasto_passos('categoria')) x where x ->> 't' = 'orcamentista_levantamento_item' and x ->> 'filtro' = 'x.tabela_id = ANY ($3)') <> 'tabela_id = NULL' then
    raise exception 'FALHOU caso 2: o item de levantamento não perde só o vínculo'; end if;
  if exists (select 1 from unnest(array['etapa', 'motor', 'fornecedor', 'familia', 'tabela']) tp, jsonb_array_elements(public.orcamentista_arrasto_passos(tp)) x
              where x ->> 't' in ('orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao', 'orcamentista_mp_categoria', 'orcamentista_categoria_campo', 'orcamentista_categoria_catalogo')) then
    raise exception 'FALHOU caso 2: um tipo de antes ganhou passo da categoria'; end if;
  if public.orcamentista_arrasto_passos('tabela') @> jsonb_build_array(jsonb_build_object('t', 'orcamentista_motor')) then raise exception 'FALHOU caso 2: a tabela passou a levar o motor'; end if;
  raise notice 'ok: caso 2 — o tipo categoria tem os 43 passos na ordem; a base de conhecimento filtra pela categoria da família de conta; o item só perde o vínculo; os tipos de antes não mudaram';
end $c$;

-- CASO 3: medir PERSIANAS: nome, o que sai (5 itens, a tabela, a categoria da família de conta, a ramificação, a categoria), os nomes, a empresa
-- nomeada com a contagem, sem impedimento; a assinatura é dos passos; medir não apaga nada
do $c$ declare m jsonb; a bigint := pg_temp.tudo(); begin
  m := pg_temp.medir('categoria', 'PERSIANAS');
  if m ->> 'nome' <> 'Persianas' or m ->> 'tipo' <> 'categoria' or m ->> 'chave' <> 'PERSIANAS' then raise exception 'FALHOU caso 3: cabeçalho %', m - 'passos'; end if;
  if (m ->> 'sai')::int <> 9 or (m ->> 'perde_o_vinculo')::int <> 0 or jsonb_array_length(m -> 'impedimentos') <> 0 or jsonb_array_length(m -> 'avisos') <> 0 then raise exception 'FALHOU caso 3: totais %', m - 'passos'; end if;
  if (pg_temp.passo(m, 'orcamentista_tabela_item', 'sai') ->> 'quantidade')::int <> 5 or pg_temp.passo(m, 'orcamentista_tabela_item', 'sai') -> 'nomes' <> '["PS-1","PS-2","PS-3","PS-4","PS-5"]'::jsonb then raise exception 'FALHOU caso 3: itens %', pg_temp.passo(m, 'orcamentista_tabela_item', 'sai'); end if;
  if pg_temp.passo(m, 'orcamentista_tabela', 'sai') -> 'nomes' <> '["Wolf Perfis / Persianas_-_Wolff.xlsx (7a000000)"]'::jsonb then raise exception 'FALHOU caso 3: tabela %', pg_temp.passo(m, 'orcamentista_tabela', 'sai'); end if;
  if pg_temp.passo(m, 'orcamentista_mp_categoria', 'sai') -> 'nomes' <> '["Esquadrias De Paula Ltda / Esquadrias de PVC WOLF"]'::jsonb then raise exception 'FALHOU caso 3: mp_categoria %', pg_temp.passo(m, 'orcamentista_mp_categoria', 'sai'); end if;
  if pg_temp.passo(m, 'orcamentista_familia_ramificacao', 'sai') -> 'nomes' <> '["PVC"]'::jsonb or pg_temp.passo(m, 'orcamentista_categoria_catalogo', 'sai') -> 'nomes' <> '["Persianas"]'::jsonb then raise exception 'FALHOU caso 3: ramificação/catálogo'; end if;
  if (pg_temp.passo(m, 'orcamentista_categoria_campo', 'sai') ->> 'quantidade')::int <> 0 or (pg_temp.passo(m, 'orcamentista_motor', 'sai') ->> 'quantidade')::int <> 0 then raise exception 'FALHOU caso 3: campo/motor'; end if;
  if m -> 'empresas' <> '[{"empresa": "Esquadrias De Paula Ltda", "categorias": 1, "fornecedores": 0, "vidros": 0, "ferragens": 0, "instalacao": 0}]'::jsonb then raise exception 'FALHOU caso 3: empresas %', m -> 'empresas'; end if;
  if m ->> 'assinatura' <> md5((select string_agg((x ->> 'passo') || ':' || (x ->> 'quantidade'), ',' order by (x ->> 'passo')::int) from jsonb_array_elements(m -> 'passos') x)) then raise exception 'FALHOU caso 3: assinatura'; end if;
  if jsonb_array_length(m -> 'passos') <> 43 then raise exception 'FALHOU caso 3: % passos', jsonb_array_length(m -> 'passos'); end if;
  if pg_temp.tudo() <> a then raise exception 'FALHOU caso 3: medir apagou'; end if;
  raise notice 'ok: caso 3 — medir PERSIANAS: 9 saem (5 itens, a tabela, a categoria da conta, a ramificação, a categoria), nomes certos, a empresa com a contagem, sem impedimento; medir não apaga';
end $c$;

-- CASO 4: as quatro estruturais: medir diz o impedimento categoria_estrutural; remover recusa com 23514 e a frase, e nada sai
do $c$ declare m jsonb; c text; a bigint := pg_temp.tudo(); cat text := pg_temp.catalogo(); begin
  foreach c in array array['PERFIL', 'VIDRO', 'FERRAGENS', 'INSTALACAO'] loop
    m := pg_temp.medir('categoria', c);
    if m -> 'impedimentos' <> jsonb_build_array(jsonb_build_object('tipo', 'categoria_estrutural', 'categoria', c)) then raise exception 'FALHOU caso 4: impedimento de % = %', c, m -> 'impedimentos'; end if;
    perform pg_temp.recusa(format('select public.superadmin_remover_do_catalogo(%L, ''categoria'', %L, %L)', pg_temp.k('SA'), c, m ->> 'assinatura'), '23514',
                           'a categoria ' || c || ' e estrutural: o codigo e o banco dependem da chave dela (CHECKs e funcoes). Nada foi removido.');
  end loop;
  if pg_temp.tudo() <> a or pg_temp.catalogo() <> cat or (select count(*) from pg_temp.logs()) <> 0 then raise exception 'FALHOU caso 4: algo saiu'; end if;
  -- a estrutural ainda é medida inteira: VIDRO nomeia o fornecedor escolhido e os 4 vidros da De Paula
  m := pg_temp.medir('categoria', 'VIDRO');
  if m -> 'empresas' <> '[{"empresa": "Esquadrias De Paula Ltda", "categorias": 1, "fornecedores": 1, "vidros": 4, "ferragens": 0, "instalacao": 0}]'::jsonb then raise exception 'FALHOU caso 4: empresas do VIDRO %', m -> 'empresas'; end if;
  if pg_temp.passo(m, 'orcamentista_mp_categoria_fornecedor', 'sai') -> 'nomes' <> '["Esquadrias De Paula Ltda / INDUSTRIA DE VIDROS TEMPERADOS ESTRELA LTDA"]'::jsonb then raise exception 'FALHOU caso 4: fornecedor escolhido %', pg_temp.passo(m, 'orcamentista_mp_categoria_fornecedor', 'sai'); end if;
  if (pg_temp.passo(m, 'orcamentista_mp_vidro', 'sai') ->> 'quantidade')::int <> 4 or (pg_temp.passo(m, 'orcamentista_mp_vidro', 'sai') -> 'nomes' ->> 0) not like 'Esquadrias De Paula Ltda / %' then raise exception 'FALHOU caso 4: vidros %', pg_temp.passo(m, 'orcamentista_mp_vidro', 'sai'); end if;
  if (pg_temp.medir('categoria', 'FERRAGENS') -> 'empresas' -> 0 ->> 'ferragens')::int <> 4 or (pg_temp.medir('categoria', 'INSTALACAO') -> 'empresas' -> 0 ->> 'instalacao')::int <> 3 then raise exception 'FALHOU caso 4: ferragens/instalação'; end if;
  raise notice 'ok: caso 4 — PERFIL, VIDRO, FERRAGENS e INSTALACAO: impedimento categoria_estrutural, remoção recusada (23514) com a frase, nada sai; a medição nomeia a empresa com fornecedor, vidros, ferragens e instalação';
end $c$;

-- CASO 5: remover PERSIANAS: saem a tabela com os 5 itens, a categoria da família de conta, a ramificação e a categoria; cada linha no log com o
-- tenant de quem era; as outras seis categorias, as outras tabelas, os outros campos e ramificações ficam; nenhuma FK mudou
do $c$ declare r jsonb; f text := pg_temp.fks(); begin
  r := pg_temp.remover('categoria', 'PERSIANAS');
  if (r ->> 'removido')::boolean is not true or (r ->> 'sai')::int <> 9 then raise exception 'FALHOU caso 5: retorno %', r - 'passos'; end if;
  if pg_temp.catalogo() <> 'PERFIL:1:Perfil,REFORCO:3:Reforço metálico,FERRAGENS:4:Ferragens,ACESSORIOS_VEDACAO:5:Acessórios e vedação,VIDRO:6:Vidro,INSTALACAO:7:Instalação' then raise exception 'FALHOU caso 5: catálogo %', pg_temp.catalogo(); end if;
  if exists (select 1 from public.orcamentista_tabela where id = pg_temp.k('TP')::uuid) or exists (select 1 from public.orcamentista_tabela_item where tabela_id = pg_temp.k('TP')::uuid) then raise exception 'FALHOU caso 5: a tabela ficou'; end if;
  if (select count(*) from public.orcamentista_tabela) <> 6 or (select count(*) from public.orcamentista_mp_categoria) <> 6 or exists (select 1 from public.orcamentista_mp_categoria where categoria_chave = 'PERSIANAS') then raise exception 'FALHOU caso 5: tabelas/mp_categoria'; end if;
  if (select string_agg(categoria_chave, ',' order by ordem) from public.orcamentista_familia_ramificacao where familia = 'PVC') <> 'PERFIL,REFORCO,FERRAGENS,ACESSORIOS_VEDACAO,VIDRO,INSTALACAO' then raise exception 'FALHOU caso 5: ramificações'; end if;
  if (select count(*) from public.orcamentista_categoria_campo) <> 13 or (select count(*) from public.orcamentista_mp_vidro) <> 4 or (select count(*) from public.orcamentista_mp_categoria_fornecedor) <> 2 then raise exception 'FALHOU caso 5: a base de conhecimento das outras saiu'; end if;
  if exists (select 1 from public.orcamentista_motor where id = pg_temp.k('M')::uuid) is not true or (select count(*) from public.orcamentista_familia_etapa where motor_id is not null) <> 3 then raise exception 'FALHOU caso 5: o motor do PERFIL'; end if;
  if (select string_agg(tabela || '=' || n, ',' order by tabela) from (select tabela, count(*) n from pg_temp.logs() group by 1) z)
     <> 'orcamentista_categoria_catalogo=1,orcamentista_familia_ramificacao=1,orcamentista_mp_categoria=1,orcamentista_tabela=1,orcamentista_tabela_item=5' then
    raise exception 'FALHOU caso 5: log %', (select string_agg(tabela || '=' || n, ',' order by tabela) from (select tabela, count(*) n from pg_temp.logs() group by 1) z); end if;
  if exists (select 1 from pg_temp.logs() where depois is not null or por <> pg_temp.k('SA')::uuid or antes -> 'remocao_do_catalogo' ->> 'chave' <> 'PERSIANAS' or antes -> 'remocao_do_catalogo' ->> 'nome' <> 'Persianas') then raise exception 'FALHOU caso 5: a origem no log'; end if;
  if (select tenant_id from pg_temp.logs() where tabela = 'orcamentista_mp_categoria') <> pg_temp.k('DP')::uuid or (select chave from pg_temp.logs() where tabela = 'orcamentista_categoria_catalogo') <> 'PERSIANAS'
     or (select antes -> 'orcamentista_categoria_catalogo' ->> 'rotulo' from pg_temp.logs() where tabela = 'orcamentista_categoria_catalogo') <> 'Persianas' then raise exception 'FALHOU caso 5: o tenant/a linha no log'; end if;
  if (select count(*) from pg_temp.logs() where tabela = 'orcamentista_tabela_item' and antes -> 'orcamentista_tabela_item' ->> 'codigo' like 'PS-%') <> 5 then raise exception 'FALHOU caso 5: os itens no log'; end if;
  if pg_temp.fks() <> f then raise exception 'FALHOU caso 5: uma FK mudou'; end if;
  raise notice 'ok: caso 5 — remover PERSIANAS: a tabela com os 5 itens, a categoria da conta (log com o tenant), a ramificação e a categoria saem, logadas linha a linha; as outras seis ficam inteiras';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 6: remover REFORCO leva os 3 campos da categoria (nomeados), e os campos do PERFIL e de ACESSORIOS_VEDACAO ficam
do $c$ declare m jsonb; r jsonb; begin
  m := pg_temp.medir('categoria', 'REFORCO');
  if pg_temp.passo(m, 'orcamentista_categoria_campo', 'sai') -> 'nomes' <> '["material","par_inox_referencia","usa"]'::jsonb or (m ->> 'sai')::int <> 6 then raise exception 'FALHOU caso 6: medição %', m - 'passos'; end if;
  r := pg_temp.remover('categoria', 'REFORCO');
  if (select string_agg(categoria_chave || '=' || n, ',' order by categoria_chave) from (select categoria_chave, count(*) n from public.orcamentista_categoria_campo group by 1) z) <> 'ACESSORIOS_VEDACAO=3,PERFIL=7' then raise exception 'FALHOU caso 6: campos'; end if;
  if (select count(*) from pg_temp.logs() where tabela = 'orcamentista_categoria_campo' and antes -> 'orcamentista_categoria_campo' ->> 'categoria_chave' = 'REFORCO') <> 3 then raise exception 'FALHOU caso 6: log dos campos'; end if;
  raise notice 'ok: caso 6 — remover REFORCO leva os 3 campos dela, nomeados e logados; os 10 campos das outras ficam';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 7: a assinatura mudou (um item entrou na tabela depois de medir) → 40001, nada sai; a mesma assinatura de novo → remove
do $c$ declare a text := pg_temp.assin('categoria', 'PERSIANAS'); t bigint := pg_temp.tudo(); begin
  insert into public.orcamentista_tabela_item (tabela_id, codigo) values (pg_temp.k('TP')::uuid, 'PS-6');
  perform pg_temp.recusa(format('select public.superadmin_remover_do_catalogo(%L, ''categoria'', ''PERSIANAS'', %L)', pg_temp.k('SA'), a), '40001', 'o arrasto mudou desde que foi mostrado');
  if pg_temp.tudo() <> t + 1 or (select count(*) from pg_temp.logs()) <> 0 then raise exception 'FALHOU caso 7: algo saiu'; end if;
  perform pg_temp.remover('categoria', 'PERSIANAS');
  if (select count(*) from pg_temp.logs() where tabela = 'orcamentista_tabela_item') <> 6 then raise exception 'FALHOU caso 7: a remoção com a assinatura nova'; end if;
  raise notice 'ok: caso 7 — assinatura que mudou → 40001 e nada sai; medida de novo, remove (os 6 itens no log)';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 8: categoria inexistente (ou um uuid no lugar da chave) → P0002 ao medir e ao remover; tipo desconhecido → 22023; não super admin → 42501
do $c$ declare t bigint := pg_temp.tudo(); begin
  perform pg_temp.recusa('select public.superadmin_arrasto_do_catalogo(''categoria'', ''NAO_EXISTE'')', 'P0002', 'o item do catalogo nao existe (categoria NAO_EXISTE)');
  perform pg_temp.recusa(format('select public.superadmin_remover_do_catalogo(%L, ''categoria'', ''NAO_EXISTE'', ''x'')', pg_temp.k('SA')), 'P0002', 'o item do catalogo nao existe');
  perform pg_temp.recusa(format('select public.superadmin_remover_do_catalogo(%L, ''categoria'', %L, ''x'')', pg_temp.k('SA'), pg_temp.k('M')), 'P0002', 'o item do catalogo nao existe');
  perform pg_temp.recusa('select public.orcamentista_arrasto_passos(''categorias'')', '22023', 'tipo de remocao desconhecido: categorias');
  perform pg_temp.recusa(format('select public.superadmin_remover_do_catalogo(%L, ''categoria'', ''PERSIANAS'', %L)', pg_temp.k('NS'), pg_temp.assin('categoria', 'PERSIANAS')), '42501', 'nao e super admin');
  if pg_temp.tudo() <> t then raise exception 'FALHOU caso 8: algo saiu'; end if;
  raise notice 'ok: caso 8 — inexistente e uuid → P0002; tipo desconhecido → 22023; não super admin → 42501; nada sai';
end $c$;

-- CASO 9: categoria não estrutural com motor (copiado do Motor_Wolf_PVC, na família PVC), com conteúdo, apontado por uma etapa da conta e por um
-- item de levantamento: a etapa fica sem motor, o item (documento de cliente) só perde o vínculo, o conteúdo, a ligação e o motor saem
do $c$ declare m jsonb; r jsonb; n uuid := gen_random_uuid(); begin
  insert into public.orcamentista_motor (id, fornecedor_id, arquivo_nome, arquivo_path, categoria_chave, nome)
    select n, fornecedor_id, 'Persianas_motor.xlsm', 'wolf/persianas.xlsm', 'PERSIANAS', 'Motor_Persianas' from public.orcamentista_motor where id = pg_temp.k('M')::uuid;
  insert into public.orcamentista_motor_familia (motor_id, familia) values (n, 'PVC');
  insert into public.orcamentista_motor_tipologia (motor_id, tipologia, n_regras, n_condicionais, variaveis) values (n, 'PS-FIXA', 0, 0, '{}');
  update public.orcamentista_familia_etapa set motor_id = n, motor_familia_exigida = 'PVC' where id = pg_temp.k('E1')::uuid;
  update public.orcamentista_levantamento_item set familia = 'PVC', motor_id = n, motor_familia_exigida = 'PVC', tabela_id = pg_temp.k('TP')::uuid where id = pg_temp.k('IT')::uuid;
  m := pg_temp.medir('categoria', 'PERSIANAS');
  if (m ->> 'sai')::int <> 12 or (m ->> 'perde_o_vinculo')::int <> 3 then raise exception 'FALHOU caso 9: totais %', m - 'passos'; end if;
  if pg_temp.passo(m, 'orcamentista_familia_etapa', 'perde_o_vinculo') -> 'nomes' <> '["Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 1"]'::jsonb then raise exception 'FALHOU caso 9: etapa %', pg_temp.passo(m, 'orcamentista_familia_etapa', 'perde_o_vinculo'); end if;
  if (pg_temp.passo(m, 'orcamentista_motor', 'sai') -> 'nomes') <> '["Motor_Persianas"]'::jsonb or (pg_temp.passo(m, 'orcamentista_motor_tipologia', 'sai') ->> 'quantidade')::int <> 1 or (pg_temp.passo(m, 'orcamentista_motor_familia', 'sai') -> 'nomes') <> '["Motor_Persianas / PVC"]'::jsonb then raise exception 'FALHOU caso 9: motor %', m -> 'passos'; end if;
  r := pg_temp.remover('categoria', 'PERSIANAS');
  if exists (select 1 from public.orcamentista_motor where id = n) or exists (select 1 from public.orcamentista_motor_tipologia where motor_id = n) or exists (select 1 from public.orcamentista_motor_familia where motor_id = n) then raise exception 'FALHOU caso 9: o motor ficou'; end if;
  if (select motor_id is null and motor_familia_exigida is null and familia = 'PVC' from public.orcamentista_familia_etapa where id = pg_temp.k('E1')::uuid) is not true then raise exception 'FALHOU caso 9: a etapa'; end if;
  if (select motor_id is null and motor_familia_exigida is null and tabela_id is null and familia = 'PVC' from public.orcamentista_levantamento_item where id = pg_temp.k('IT')::uuid) is not true then raise exception 'FALHOU caso 9: o item'; end if;
  if (select count(*) from pg_temp.logs() where tabela = 'orcamentista_familia_etapa' and depois -> 'orcamentista_familia_etapa' ->> 'motor_id' is null and antes -> 'orcamentista_familia_etapa' ->> 'motor_id' = n::text and tenant_id = pg_temp.k('DP')::uuid) <> 1
     or (select count(*) from pg_temp.logs() where tabela = 'orcamentista_levantamento_item' and depois is not null) <> 2 then raise exception 'FALHOU caso 9: o log dos vínculos'; end if;
  if exists (select 1 from public.orcamentista_motor where id = pg_temp.k('M')::uuid) is not true or (select count(*) from public.orcamentista_familia_etapa where motor_id = pg_temp.k('M')::uuid) <> 2 then raise exception 'FALHOU caso 9: o motor do PERFIL'; end if;
  raise notice 'ok: caso 9 — categoria com motor: a etapa fica sem motor, o item só perde o vínculo (antes e depois no log), o conteúdo, a ligação e o motor saem; o motor do PERFIL fica';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 10: criar: a linha nasce com o rótulo aparado e a ordem = última + 1, volta no retorno, e o log tem a linha (tenant nulo, antes nulo)
do $c$ declare r jsonb; begin
  r := pg_temp.criar('TELAS', '  Telas mosquiteiras ');
  if r -> 'orcamentista_categoria_catalogo' ->> 'chave' <> 'TELAS' or r -> 'orcamentista_categoria_catalogo' ->> 'rotulo' <> 'Telas mosquiteiras' or (r -> 'orcamentista_categoria_catalogo' ->> 'ordem')::int <> 8 then raise exception 'FALHOU caso 10: retorno %', r; end if;
  if (select rotulo || ':' || ordem from public.orcamentista_categoria_catalogo where chave = 'TELAS') <> 'Telas mosquiteiras:8' then raise exception 'FALHOU caso 10: a linha'; end if;
  if (select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_categoria_catalogo' and chave = 'TELAS' and tenant_id is null and antes is null and depois = r and por = pg_temp.k('SA')::uuid) <> 1 then raise exception 'FALHOU caso 10: log'; end if;
  -- a próxima nasce depois (a ordem não repete: UNIQUE)
  if (pg_temp.criar('GRADES', 'Grades') -> 'orcamentista_categoria_catalogo' ->> 'ordem')::int <> 9 then raise exception 'FALHOU caso 10: a segunda'; end if;
  -- e é medida e removida como as outras: nada pende dela
  if (pg_temp.medir('categoria', 'TELAS') ->> 'sai')::int <> 1 or pg_temp.medir('categoria', 'TELAS') -> 'empresas' <> '[]'::jsonb then raise exception 'FALHOU caso 10: medir a nova'; end if;
  r := pg_temp.remover('categoria', 'TELAS');
  if (r ->> 'removido')::boolean is not true or exists (select 1 from public.orcamentista_categoria_catalogo where chave = 'TELAS') then raise exception 'FALHOU caso 10: remover a nova'; end if;
  raise notice 'ok: caso 10 — criar: rótulo aparado, ordem = última + 1, retorno e log; a segunda vem depois; a nova é medida (só ela sai) e removida';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 11: criar recusa, com a frase e sem gravar: chave repetida, nome repetido (sem caixa, aparado), chave fora da forma (4 jeitos), rótulo vazio
-- e com 61, não super admin
do $c$ declare cat text := pg_temp.catalogo(); n bigint := (select count(*) from public.superadmin_alteracao_log); begin
  perform pg_temp.recusa('select pg_temp.criar(''PERFIL'', ''Outro'')', '22023', 'a categoria de chave "PERFIL" ja existe. Nada foi gravado.');
  perform pg_temp.recusa('select pg_temp.criar(''PERFIL_2'', ''  perfil '')', '22023', 'ja existe a categoria "Perfil": o nome nao se repete. Nada foi gravado.');
  perform pg_temp.recusa('select pg_temp.criar(''telas'', ''Telas'')', '22023', 'a chave da categoria e maiuscula, comeca por letra e tem ate 40 caracteres (letras, digitos e _). Nada foi gravado.');
  perform pg_temp.recusa('select pg_temp.criar(''1TELAS'', ''Telas'')', '22023', 'a chave da categoria e maiuscula');
  perform pg_temp.recusa('select pg_temp.criar(''TELAS-X'', ''Telas'')', '22023', 'a chave da categoria e maiuscula');
  perform pg_temp.recusa('select pg_temp.criar(repeat(''A'', 41), ''Telas'')', '22023', 'a chave da categoria e maiuscula');
  perform pg_temp.recusa('select pg_temp.criar(''TELAS'', ''   '')', '22023', 'o nome da categoria tem de 1 a 60 caracteres. Nada foi gravado.');
  perform pg_temp.recusa('select pg_temp.criar(''TELAS'', null)', '22023', 'o nome da categoria tem de 1 a 60 caracteres');
  perform pg_temp.recusa('select pg_temp.criar(''TELAS'', repeat(''x'', 61))', '22023', 'o nome da categoria tem de 1 a 60 caracteres');
  perform pg_temp.recusa(format('select public.superadmin_criar_categoria(%L, ''TELAS'', ''Telas'')', pg_temp.k('NS')), '42501', 'nao e super admin');
  perform pg_temp.recusa('select public.superadmin_criar_categoria(null, ''TELAS'', ''Telas'')', '42501', 'nao e super admin');
  if pg_temp.catalogo() <> cat or (select count(*) from public.superadmin_alteracao_log) <> n then raise exception 'FALHOU caso 11: gravou'; end if;
  -- a chave com 40 e o rótulo com 60 passam
  if (pg_temp.criar(repeat('A', 40), repeat('x', 60)) -> 'orcamentista_categoria_catalogo' ->> 'ordem')::int <> 8 then raise exception 'FALHOU caso 11: os limites'; end if;
  raise notice 'ok: caso 11 — criar recusa chave repetida, nome repetido sem caixa, chave fora da forma, rótulo vazio/nulo/61 e não super admin, sem gravar; 40 e 60 passam';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 12: editar só o rótulo: aparado, antes e depois no log, a chave e a ordem não mudam; recusa nada mudou, nome de outra (sem caixa),
-- inexistente, rótulo fora da forma, não super admin
do $c$ declare r jsonb; cat text; n bigint; begin
  r := pg_temp.editar('PERSIANAS', '  Persianas e cortinas ');
  if r -> 'orcamentista_categoria_catalogo' ->> 'rotulo' <> 'Persianas e cortinas' or (select chave || ':' || ordem || ':' || rotulo from public.orcamentista_categoria_catalogo where ordem = 2) <> 'PERSIANAS:2:Persianas e cortinas' then raise exception 'FALHOU caso 12: a edição %', r; end if;
  if (select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_categoria_catalogo' and chave = 'PERSIANAS' and tenant_id is null
        and antes -> 'orcamentista_categoria_catalogo' ->> 'rotulo' = 'Persianas' and depois -> 'orcamentista_categoria_catalogo' ->> 'rotulo' = 'Persianas e cortinas' and por = pg_temp.k('SA')::uuid) <> 1 then raise exception 'FALHOU caso 12: log'; end if;
  cat := pg_temp.catalogo(); n := (select count(*) from public.superadmin_alteracao_log);
  perform pg_temp.recusa('select pg_temp.editar(''PERSIANAS'', '' Persianas e cortinas '')', '22023', 'nada mudou: o nome e o de agora. Nada foi gravado.');
  perform pg_temp.recusa('select pg_temp.editar(''PERSIANAS'', ''REFORÇO METÁLICO'')', '22023', 'ja existe a categoria "Reforço metálico": o nome nao se repete. Nada foi gravado.');
  perform pg_temp.recusa('select pg_temp.editar(''NAO_EXISTE'', ''Telas'')', 'P0002', 'categoria inexistente');
  perform pg_temp.recusa('select pg_temp.editar(''PERSIANAS'', '''')', '22023', 'o nome da categoria tem de 1 a 60 caracteres. Nada foi gravado.');
  perform pg_temp.recusa('select pg_temp.editar(''PERSIANAS'', repeat(''x'', 61))', '22023', 'o nome da categoria tem de 1 a 60 caracteres');
  perform pg_temp.recusa(format('select public.superadmin_editar_categoria(%L, ''PERSIANAS'', ''Outro'')', pg_temp.k('NS')), '42501', 'nao e super admin');
  if pg_temp.catalogo() <> cat or (select count(*) from public.superadmin_alteracao_log) <> n then raise exception 'FALHOU caso 12: gravou'; end if;
  -- a estrutural tem o rótulo editável: só a remoção é recusada
  if pg_temp.editar('PERFIL', 'Perfil de PVC') -> 'orcamentista_categoria_catalogo' ->> 'chave' <> 'PERFIL' then raise exception 'FALHOU caso 12: a estrutural'; end if;
  raise notice 'ok: caso 12 — editar o rótulo: aparado, antes e depois no log, chave e ordem intactas; recusa nada mudou, nome de outra, inexistente, forma e não super admin; a estrutural renomeia';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 13: as CHECKs valem fora das funções: chave fora da forma e rótulo fora da forma são recusados pelo banco, com o nome da constraint
do $c$ begin
  perform pg_temp.recusa('insert into public.orcamentista_categoria_catalogo (chave, rotulo, ordem) values (''telas'', ''Telas'', 99)', '23514', 'orcamentista_categoria_catalogo_chave_forma');
  perform pg_temp.recusa('insert into public.orcamentista_categoria_catalogo (chave, rotulo, ordem) values (''TELAS'', '' Telas'', 99)', '23514', 'orcamentista_categoria_catalogo_rotulo_forma');
  perform pg_temp.recusa('update public.orcamentista_categoria_catalogo set rotulo = repeat(''x'', 61) where chave = ''PERFIL''', '23514', 'orcamentista_categoria_catalogo_rotulo_forma');
  perform pg_temp.recusa('update public.orcamentista_categoria_catalogo set chave = ''perfil'' where chave = ''PERFIL''', '23514', 'orcamentista_categoria_catalogo_chave_forma');
  raise notice 'ok: caso 13 — as duas CHECKs de forma valem no banco, fora das funções';
end $c$;

-- CASO 14: a verificação da migração: os 43 passos e a ordem viram dado (o comentário da migração os lista); uma estrutural fora do catálogo ou um
-- corpo do arrasto trocado é o que as guardas do run.sh provam. Aqui: a remoção de uma categoria com fornecedor escolhido por conta (VIDRO é
-- estrutural, então a prova usa PERSIANAS com um fornecedor escolhido inserido) leva a escolha, nomeando a empresa e o fornecedor
do $c$ declare m jsonb; begin
  insert into public.orcamentista_mp_categoria_fornecedor (tenant_id, mp_categoria_id, fornecedor_id) select tenant_id, id, pg_temp.k('W')::uuid from public.orcamentista_mp_categoria where categoria_chave = 'PERSIANAS';
  m := pg_temp.medir('categoria', 'PERSIANAS');
  if pg_temp.passo(m, 'orcamentista_mp_categoria_fornecedor', 'sai') -> 'nomes' <> '["Esquadrias De Paula Ltda / Wolf Perfis"]'::jsonb or (m -> 'empresas' -> 0 ->> 'fornecedores')::int <> 1 then raise exception 'FALHOU caso 14: %', m - 'passos'; end if;
  perform pg_temp.remover('categoria', 'PERSIANAS');
  if (select count(*) from pg_temp.logs() where tabela = 'orcamentista_mp_categoria_fornecedor' and tenant_id = pg_temp.k('DP')::uuid) <> 1 or (select count(*) from public.orcamentista_mp_categoria_fornecedor) <> 2 then raise exception 'FALHOU caso 14: o fornecedor escolhido'; end if;
  raise notice 'ok: caso 14 — o fornecedor escolhido por conta na categoria sai com ela, nomeando a empresa e o fornecedor, logado com o tenant; os das outras ficam';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;
