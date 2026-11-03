-- Os CASOS da 20261103000001 (a categoria da família chega na conta), sobre o estado de produção de 02/11/2026 (09_estado.sql), com a migração
-- aplicada duas vezes. Cada caso roda numa subtransação e se desfaz (P0099): os casos não dependem uns dos outros. Imprime "ok: ..." ou
-- "FALHOU ...". A contagem dos "-- CASO " é o que o run.sh espera.
\set ON_ERROR_STOP 0
set client_min_messages = notice;

create or replace function pg_temp.k(n text) returns text language sql stable as $$
  select case n
    when 'SA' then 'e0000000-0000-0000-0000-000000000001'   -- super admin
    when 'DP' then '20e08592-f957-4e72-b7eb-251387e34eb9'   -- Esquadrias De Paula Ltda
    when 'B'  then 'b0000000-0000-0000-0000-00000000000b'   -- Vidraçaria B
    when 'MP' then '79d764fe-4acd-43e2-bed9-38e20667ca3d'   -- Esquadrias de PVC WOLF (De Paula, PVC, 3 etapas)
    when 'AL' then 'a1000000-0000-0000-0000-0000000000a1'   -- Esquadrias de alumínio (De Paula, ALUMINIO, sem linhas)
    when 'MB' then 'c1000000-0000-0000-0000-00000000000b'   -- Esquadrias da B (Vidraçaria B, sem família, sem linhas)
  end
$$;
-- as categorias de uma matéria-prima, em ordem de chave
create or replace function pg_temp.cats(mp text) returns text language sql as $$
  select coalesce(string_agg(categoria_chave, ',' order by categoria_chave), '') from public.orcamentista_mp_categoria where materia_prima_id = mp::uuid $$;
-- as linhas de log da garantia, por origem
create or replace function pg_temp.garantias(origem text) returns setof public.superadmin_alteracao_log language sql as $$
  select * from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_mp_categoria' and l.depois -> 'garantia_da_familia' ->> 'origem' = origem $$;
create or replace function pg_temp.falta() returns text language sql as $$
  select coalesce(string_agg(m.nome || ':' || r.categoria_chave, ',' order by m.nome, r.ordem), '') from public.orcamentista_materia_prima m
    join public.orcamentista_familia_ramificacao r on r.familia = m.familia
   where not exists (select 1 from public.orcamentista_mp_categoria c where c.materia_prima_id = m.id and c.categoria_chave = r.categoria_chave) $$;
create or replace function pg_temp.pvc(extra text[] default '{}') returns text[] language sql as $$
  select array['PERFIL', 'PERSIANAS', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO', 'VEDACAO'] || extra $$;
create or replace function pg_temp.recusa(sql text, frase text) returns text language plpgsql as $$
declare m text;
begin
  begin execute sql; exception when others then get stacked diagnostics m = message_text;
    if position(frase in m) = 0 then raise exception 'esperava "%", veio "%"', frase, m; end if;
    return m;
  end;
  raise exception 'esperava a recusa "%", e passou', frase;
end $$;

-- CASO 1: o preenchimento — a VEDACAO da De Paula existe, com config NULL e sem autor; uma linha de log só (a migração rodou duas vezes),
-- com o tenant da De Paula e a origem; a conta tem 8 linhas; nenhuma falta; e a consulta que a superadmin_gravar_arvore faz antes de gravar acha
-- a linha (era ali que "categoria inexistente nesta empresa" nascia)
do $c$ declare v jsonb; begin
  select to_jsonb(c) into v from public.orcamentista_mp_categoria c where c.materia_prima_id = pg_temp.k('MP')::uuid and c.categoria_chave = 'VEDACAO';
  if v is null or v -> 'config' <> 'null'::jsonb or v -> 'atualizado_por' <> 'null'::jsonb or v ->> 'tenant_id' <> pg_temp.k('DP') then raise exception 'FALHOU caso 1: a linha %', v; end if;
  if (select count(*) from pg_temp.garantias('preenchimento 20261103000001')) <> 1
     or (select tenant_id::text || chave || coalesce(por::text, 'sem') from pg_temp.garantias('preenchimento 20261103000001')) <> pg_temp.k('DP') || (v ->> 'id') || 'sem' then
    raise exception 'FALHOU caso 1: o log do preenchimento'; end if;
  if pg_temp.cats(pg_temp.k('MP')) <> 'ACESSORIOS_VEDACAO,FERRAGENS,INSTALACAO,PERFIL,PERSIANAS,REFORCO,VEDACAO,VIDRO' or (select count(*) from public.orcamentista_mp_categoria) <> 8 then
    raise exception 'FALHOU caso 1: as linhas %', pg_temp.cats(pg_temp.k('MP')); end if;
  if pg_temp.falta() <> '' then raise exception 'FALHOU caso 1: falta %', pg_temp.falta(); end if;
  if (select c.id from public.orcamentista_mp_categoria c where c.materia_prima_id = pg_temp.k('MP')::uuid and c.tenant_id = pg_temp.k('DP')::uuid and c.categoria_chave = 'VEDACAO') is null then
    raise exception 'FALHOU caso 1: a consulta da gravar_arvore'; end if;
  raise notice 'ok: caso 1 — o preenchimento: a VEDACAO da De Paula com config NULL, logada uma vez (a migracao rodou duas), 8 linhas, nenhuma falta; a gravar_arvore acha a linha';
end $c$;

-- CASO 2: a auxiliar é fechada e não é SECURITY DEFINER; as quatro continuam SECURITY DEFINER, com search_path fixo, só do service_role
do $c$ declare f text; begin
  if (select prosecdef from pg_proc where proname = 'orcamentista_garantir_categorias_da_familia')
     or has_function_privilege('authenticated', 'public.orcamentista_garantir_categorias_da_familia(uuid, text, uuid, text)', 'execute')
     or has_function_privilege('service_role', 'public.orcamentista_garantir_categorias_da_familia(uuid, text, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.orcamentista_garantir_categorias_da_familia(uuid, text, uuid, text)', 'execute') then raise exception 'FALHOU caso 2: a auxiliar aberta ou definer'; end if;
  foreach f in array array['superadmin_criar_familia(uuid, text, text, text[])', 'superadmin_editar_familia(uuid, text, text, text[])',
    'superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text)', 'superadmin_gravar_materia_prima(uuid, uuid, jsonb)'] loop
    if not has_function_privilege('service_role', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute')
       or not (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure)
       or not exists (select 1 from pg_proc where oid = ('public.' || f)::regprocedure and 'search_path=public, pg_temp' = any (proconfig)) then raise exception 'FALHOU caso 2: %', f; end if;
  end loop;
  raise notice 'ok: caso 2 — a auxiliar e fechada e nao e SECURITY DEFINER; as quatro seguem SECURITY DEFINER, search_path fixo, so do service_role';
end $c$;

-- CASO 3: MARCAR uma categoria na ramificação cria a linha em TODA matéria-prima da família, de toda empresa, com config NULL e o autor;
-- uma linha de log por linha criada, com o tenant dela; a matéria-prima de outra família e a sem família não ganham nada; o retorno é o de antes
do $c$ declare r jsonb; v_b uuid; begin
  perform public.superadmin_gravar_materia_prima(pg_temp.k('B')::uuid, pg_temp.k('SA')::uuid, '[{"nome": "Esquadrias da B"}, {"nome": "PVC da B", "familia": "PVC"}]');
  select id into v_b from public.orcamentista_materia_prima where nome = 'PVC da B';
  perform public.superadmin_criar_categoria(pg_temp.k('SA')::uuid, 'TELAS', 'Telas');   -- depois das duas: nenhuma tem TELAS
  if pg_temp.cats(v_b::text) like '%TELAS%' or pg_temp.cats(pg_temp.k('MP')) like '%TELAS%' then raise exception 'FALHOU caso 3: o estado'; end if;
  r := public.superadmin_editar_familia(pg_temp.k('SA')::uuid, 'PVC', 'PVC Wolf', pg_temp.pvc(array['TELAS']));
  if (select string_agg(jsonb_object_keys, ',' order by jsonb_object_keys) from jsonb_object_keys(r)) <> 'orcamentista_familia_catalogo,orcamentista_familia_ramificacao' then raise exception 'FALHOU caso 3: o retorno %', r; end if;
  if (select count(*) from public.orcamentista_mp_categoria where categoria_chave = 'TELAS' and config is null and atualizado_por = pg_temp.k('SA')::uuid and materia_prima_id in (pg_temp.k('MP')::uuid, v_b)) <> 2 then
    raise exception 'FALHOU caso 3: as linhas TELAS'; end if;
  if pg_temp.cats(pg_temp.k('AL')) <> '' or exists (select 1 from public.orcamentista_mp_categoria where categoria_chave = 'TELAS' and materia_prima_id = pg_temp.k('MB')::uuid) then
    raise exception 'FALHOU caso 3: a de outra familia ou a sem familia ganhou'; end if;
  if (select string_agg(tenant_id::text, ',' order by tenant_id) from pg_temp.garantias('ramificacao')) <> pg_temp.k('DP') || ',' || pg_temp.k('B')
     or exists (select 1 from pg_temp.garantias('ramificacao') where por <> pg_temp.k('SA')::uuid or antes is not null or depois -> 'garantia_da_familia' ->> 'familia' <> 'PVC'
                  or depois -> 'orcamentista_mp_categoria' ->> 'categoria_chave' <> 'TELAS' or chave <> depois -> 'orcamentista_mp_categoria' ->> 'id') then
    raise exception 'FALHOU caso 3: o log'; end if;
  if pg_temp.falta() <> '' then raise exception 'FALHOU caso 3: falta %', pg_temp.falta(); end if;
  raise notice 'ok: caso 3 — marcar TELAS na PVC cria a linha nas duas materias-primas da PVC (De Paula e B), config NULL, logadas com o tenant; a de ALUMINIO e a sem familia nao ganham';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 4: DESMARCAR não apaga nada da conta (a linha com dado fica, com o dado); REMARCAR não duplica nem loga
do $c$ declare n bigint; begin
  update public.orcamentista_mp_categoria set config = '{"vedacao": "EPDM"}' where materia_prima_id = pg_temp.k('MP')::uuid and categoria_chave = 'VEDACAO';
  n := (select count(*) from public.orcamentista_mp_categoria);
  perform public.superadmin_editar_familia(pg_temp.k('SA')::uuid, 'PVC', 'PVC Wolf', array['PERFIL', 'PERSIANAS', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO']);
  if (select count(*) from public.orcamentista_mp_categoria) <> n
     or (select config from public.orcamentista_mp_categoria where materia_prima_id = pg_temp.k('MP')::uuid and categoria_chave = 'VEDACAO') <> '{"vedacao": "EPDM"}'::jsonb then
    raise exception 'FALHOU caso 4: desmarcar mexeu na conta'; end if;
  perform public.superadmin_editar_familia(pg_temp.k('SA')::uuid, 'PVC', 'PVC Wolf', pg_temp.pvc());
  if (select count(*) from public.orcamentista_mp_categoria) <> n or (select count(*) from pg_temp.garantias('ramificacao')) <> 0
     or (select config from public.orcamentista_mp_categoria where materia_prima_id = pg_temp.k('MP')::uuid and categoria_chave = 'VEDACAO') <> '{"vedacao": "EPDM"}'::jsonb then
    raise exception 'FALHOU caso 4: remarcar duplicou, logou ou mexeu no dado'; end if;
  raise notice 'ok: caso 4 — desmarcar a VEDACAO nao apaga a linha nem o dado; remarcar nao duplica, nao loga e nao toca o dado';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 5: só reordenar as ramificações não cria nada
do $c$ declare n bigint := (select count(*) from public.orcamentista_mp_categoria); begin
  perform public.superadmin_editar_familia(pg_temp.k('SA')::uuid, 'PVC', 'PVC Wolf', array['VEDACAO', 'PERFIL', 'PERSIANAS', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO']);
  if (select count(*) from public.orcamentista_mp_categoria) <> n or (select count(*) from pg_temp.garantias('ramificacao')) <> 0 then raise exception 'FALHOU caso 5'; end if;
  raise notice 'ok: caso 5 — reordenar as ramificacoes nao cria linha nem log';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 6: criar família: a garantia é vazia (a FK impede matéria-prima de apontar família que ainda não existe), e o resto é o de antes
do $c$ declare n bigint := (select count(*) from public.orcamentista_mp_categoria); r jsonb; begin
  r := public.superadmin_criar_familia(pg_temp.k('SA')::uuid, 'MADEIRA', 'Esquadrias de madeira', array['PERFIL', 'VEDACAO']);
  if (select count(*) from public.orcamentista_mp_categoria) <> n or (select count(*) from pg_temp.garantias('ramificacao')) <> 0
     or (select string_agg(categoria_chave, ',' order by ordem) from public.orcamentista_familia_ramificacao where familia = 'MADEIRA') <> 'PERFIL,VEDACAO' then raise exception 'FALHOU caso 6: %', r; end if;
  -- e uma matéria-prima posta nela depois ganha as duas
  perform public.superadmin_definir_familia_da_materia_prima(pg_temp.k('B')::uuid, pg_temp.k('SA')::uuid, pg_temp.k('MB')::uuid, 'MADEIRA');
  if pg_temp.cats(pg_temp.k('MB')) <> 'PERFIL,VEDACAO' then raise exception 'FALHOU caso 6: a troca para a familia nova %', pg_temp.cats(pg_temp.k('MB')); end if;
  raise notice 'ok: caso 6 — criar familia nao cria linha (a FK); a materia-prima posta nela depois ganha as categorias dela';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 7: matéria-prima NOVA: continua ganhando as linhas do CATÁLOGO INTEIRO (o de antes), com ou sem família; a garantia só acrescenta (hoje,
-- nada: a ramificação é parte do catálogo), sem log de garantia; o log da gravação continua um só, com o nome de antes
do $c$ declare n_cat bigint := (select count(*) from public.orcamentista_categoria_catalogo); begin
  perform public.superadmin_gravar_materia_prima(pg_temp.k('DP')::uuid, pg_temp.k('SA')::uuid, '[{"nome": "PVC Novo", "familia": "PVC"}, {"nome": "Sem familia"}]');
  if (select count(*) from public.orcamentista_mp_categoria c join public.orcamentista_materia_prima m on m.id = c.materia_prima_id where m.nome = 'PVC Novo' and c.config is null) <> n_cat
     or (select count(*) from public.orcamentista_mp_categoria c join public.orcamentista_materia_prima m on m.id = c.materia_prima_id where m.nome = 'Sem familia') <> n_cat then
    raise exception 'FALHOU caso 7: as linhas do catalogo'; end if;
  if (select count(*) from pg_temp.garantias('materia_prima_nova')) <> 0 then raise exception 'FALHOU caso 7: log de garantia'; end if;
  if (select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_materia_prima,orcamentista_mp_categoria' and chave = pg_temp.k('DP')) <> 1 then raise exception 'FALHOU caso 7: o log da gravacao'; end if;
  if pg_temp.falta() <> '' then raise exception 'FALHOU caso 7: falta %', pg_temp.falta(); end if;
  raise notice 'ok: caso 7 — materia-prima nova: as linhas do catalogo inteiro como antes, com ou sem familia; a garantia nao duplica nem loga; o log da gravacao e o de antes';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 8: TROCAR a família pela gravação da matéria-prima (a lista com "familia") garante as linhas da família nova, logadas como troca; gravar de
-- novo sem trocar não cria nada
do $c$ begin
  perform public.superadmin_editar_familia(pg_temp.k('SA')::uuid, 'ALUMINIO', 'Esquadrias de aluminio', array['PERFIL', 'VEDACAO']);   -- marca: a AL ganha as duas
  if pg_temp.cats(pg_temp.k('AL')) <> 'PERFIL,VEDACAO' then raise exception 'FALHOU caso 8: a marcacao na ALUMINIO %', pg_temp.cats(pg_temp.k('AL')); end if;
  perform public.superadmin_gravar_materia_prima(pg_temp.k('B')::uuid, pg_temp.k('SA')::uuid, '[{"nome": "Esquadrias da B", "familia": "ALUMINIO"}]');
  if pg_temp.cats(pg_temp.k('MB')) <> 'PERFIL,VEDACAO' then raise exception 'FALHOU caso 8: a troca %', pg_temp.cats(pg_temp.k('MB')); end if;
  if (select count(*) from pg_temp.garantias('troca_de_familia') where tenant_id = pg_temp.k('B')::uuid and por = pg_temp.k('SA')::uuid and depois -> 'garantia_da_familia' ->> 'familia' = 'ALUMINIO') <> 2 then
    raise exception 'FALHOU caso 8: o log da troca'; end if;
  perform public.superadmin_gravar_materia_prima(pg_temp.k('B')::uuid, pg_temp.k('SA')::uuid, '[{"nome": "Esquadrias da B", "familia": "ALUMINIO"}]');
  if (select count(*) from pg_temp.garantias('troca_de_familia')) <> 2 or pg_temp.cats(pg_temp.k('MB')) <> 'PERFIL,VEDACAO' then raise exception 'FALHOU caso 8: gravar de novo criou'; end if;
  raise notice 'ok: caso 8 — trocar a familia pela gravacao da materia-prima garante as linhas da familia nova (logadas como troca); gravar de novo nao cria nada';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 9: TROCAR a família pela função própria garante as linhas; tirar a família (NULL) não apaga nada; voltar para ela não duplica
do $c$ begin
  perform public.superadmin_editar_familia(pg_temp.k('SA')::uuid, 'ALUMINIO', 'Esquadrias de aluminio', array['PERFIL', 'VEDACAO']);
  perform public.superadmin_definir_familia_da_materia_prima(pg_temp.k('B')::uuid, pg_temp.k('SA')::uuid, pg_temp.k('MB')::uuid, 'ALUMINIO');
  if pg_temp.cats(pg_temp.k('MB')) <> 'PERFIL,VEDACAO' then raise exception 'FALHOU caso 9: a troca %', pg_temp.cats(pg_temp.k('MB')); end if;
  if (select count(*) from pg_temp.garantias('troca_de_familia') where tenant_id = pg_temp.k('B')::uuid) <> 2 then raise exception 'FALHOU caso 9: o log'; end if;
  perform public.superadmin_definir_familia_da_materia_prima(pg_temp.k('B')::uuid, pg_temp.k('SA')::uuid, pg_temp.k('MB')::uuid, NULL);
  if pg_temp.cats(pg_temp.k('MB')) <> 'PERFIL,VEDACAO' then raise exception 'FALHOU caso 9: tirar a familia apagou'; end if;
  perform public.superadmin_definir_familia_da_materia_prima(pg_temp.k('B')::uuid, pg_temp.k('SA')::uuid, pg_temp.k('MB')::uuid, 'ALUMINIO');
  if pg_temp.cats(pg_temp.k('MB')) <> 'PERFIL,VEDACAO' or (select count(*) from pg_temp.garantias('troca_de_familia')) <> 2 then raise exception 'FALHOU caso 9: voltar duplicou ou logou'; end if;
  raise notice 'ok: caso 9 — trocar a familia pela funcao propria garante as linhas; tirar a familia nao apaga; voltar nao duplica nem loga';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 10: o que a troca de família recusava continua recusado (a família com etapas), e nada é criado
do $c$ declare n bigint := (select count(*) from public.orcamentista_mp_categoria); begin
  perform public.superadmin_editar_familia(pg_temp.k('SA')::uuid, 'ALUMINIO', 'Esquadrias de aluminio', array['PERFIL']);
  n := (select count(*) from public.orcamentista_mp_categoria);
  perform pg_temp.recusa(format('select public.superadmin_definir_familia_da_materia_prima(%L, %L, %L, ''ALUMINIO'')', pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.k('MP')), 'tem 3 etapa(s) cadastrada(s)');
  perform pg_temp.recusa(format('select public.superadmin_definir_familia_da_materia_prima(%L, %L, %L, ''NAO_EXISTE'')', pg_temp.k('B'), pg_temp.k('SA'), pg_temp.k('MB')), 'familia fora da lista');
  if (select count(*) from public.orcamentista_mp_categoria) <> n then raise exception 'FALHOU caso 10: criou'; end if;
  raise notice 'ok: caso 10 — a troca com etapas e a familia fora da lista continuam recusadas, e nada e criado';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 11: a auxiliar, direta: família nula devolve 0; a matéria-prima dada restringe; a segunda chamada devolve 0
do $c$ begin
  perform public.superadmin_editar_familia(pg_temp.k('SA')::uuid, 'ALUMINIO', 'Esquadrias de aluminio', array['PERFIL']);   -- a AL ganha PERFIL
  delete from public.orcamentista_mp_categoria where materia_prima_id = pg_temp.k('AL')::uuid;   -- (só no caso: a AL fica sem linhas de novo)
  update public.orcamentista_materia_prima set familia = 'ALUMINIO' where id = pg_temp.k('MB')::uuid;   -- sem a função: a B fica na família sem linha
  if public.orcamentista_garantir_categorias_da_familia(pg_temp.k('SA')::uuid, NULL, NULL, 'x') <> 0 then raise exception 'FALHOU caso 11: nula'; end if;
  if public.orcamentista_garantir_categorias_da_familia(pg_temp.k('SA')::uuid, 'ALUMINIO', pg_temp.k('AL')::uuid, 'x') <> 1
     or pg_temp.cats(pg_temp.k('MB')) <> '' then raise exception 'FALHOU caso 11: a restricao'; end if;
  if public.orcamentista_garantir_categorias_da_familia(pg_temp.k('SA')::uuid, 'ALUMINIO', NULL, 'x') <> 1 or pg_temp.cats(pg_temp.k('MB')) <> 'PERFIL' then raise exception 'FALHOU caso 11: a familia inteira'; end if;
  if public.orcamentista_garantir_categorias_da_familia(pg_temp.k('SA')::uuid, 'ALUMINIO', NULL, 'x') <> 0 then raise exception 'FALHOU caso 11: a segunda'; end if;
  raise notice 'ok: caso 11 — a auxiliar: familia nula 0; a materia-prima dada restringe; a familia inteira; a segunda chamada 0';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;
