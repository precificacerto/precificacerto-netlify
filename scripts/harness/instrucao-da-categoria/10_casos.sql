-- Os CASOS da 20261103000002 (a instrução da categoria; os campos estruturados saem), sobre o estado de produção de 03/11/2026 (09_estado.sql),
-- com a migração aplicada duas vezes. Cada caso roda numa subtransação e se desfaz (P0099): os casos não dependem uns dos outros. Imprime
-- "ok: ..." ou "FALHOU ...". A contagem dos "-- CASO " é o que o run.sh espera.
\set ON_ERROR_STOP 0
set client_min_messages = notice;

create or replace function pg_temp.k(n text) returns text language sql stable as $$
  select case n
    when 'SA' then 'e0000000-0000-0000-0000-000000000001'   -- super admin
    when 'CO' then 'e0000000-0000-0000-0000-000000000002'   -- usuário comum
    when 'DP' then '20e08592-f957-4e72-b7eb-251387e34eb9'   -- Esquadrias De Paula Ltda
    when 'B'  then 'b0000000-0000-0000-0000-00000000000b'   -- Vidraçaria B
    when 'MP' then '79d764fe-4acd-43e2-bed9-38e20667ca3d'   -- Esquadrias de PVC WOLF (De Paula, PVC, 8 categorias)
    when 'MB' then 'c1000000-0000-0000-0000-00000000000b'   -- Esquadrias da B (Vidraçaria B, sem família, sem linhas)
  end
$$;
-- a categoria da PVC WOLF pela chave, e a instrução dela
create or replace function pg_temp.cat(ch text) returns uuid language sql as $$
  select id from public.orcamentista_mp_categoria where materia_prima_id = pg_temp.k('MP')::uuid and categoria_chave = ch $$;
create or replace function pg_temp.instr(ch text) returns text language sql as $$
  select instrucao from public.orcamentista_mp_categoria where id = pg_temp.cat(ch) $$;
create or replace function pg_temp.cfg(ch text) returns jsonb language sql as $$
  select config from public.orcamentista_mp_categoria where id = pg_temp.cat(ch) $$;
-- as linhas de log da remoção desta migração, por tabela
create or replace function pg_temp.removidos(tab text) returns setof public.superadmin_alteracao_log language sql as $$
  select * from public.superadmin_alteracao_log l where l.antes ->> 'remocao' = '20261103000002' and l.tabela = tab $$;
-- as linhas de log da função nova
create or replace function pg_temp.logs_da_instrucao() returns setof public.superadmin_alteracao_log language sql as $$
  select * from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_mp_categoria' and l.depois ->> 'campo' = 'instrucao' $$;
create or replace function pg_temp.grava(tenant text, por text, cat uuid, texto jsonb) returns jsonb language sql as $$
  select public.superadmin_gravar_instrucao_da_categoria(tenant::uuid, por::uuid, cat, texto) $$;
create or replace function pg_temp.arvore(cats jsonb) returns jsonb language sql as $$
  select public.superadmin_gravar_arvore(pg_temp.k('DP')::uuid, pg_temp.k('SA')::uuid,
    jsonb_build_object('materias_primas', jsonb_build_array(jsonb_build_object('nome', 'Esquadrias de PVC WOLF', 'categorias', cats)))) $$;
create or replace function pg_temp.recusa(sql text, frase text) returns text language plpgsql as $$
declare m text;
begin
  begin execute sql; exception when others then get stacked diagnostics m = message_text;
    if position(frase in m) = 0 then raise exception 'esperava "%", veio "%"', frase, m; end if;
    return m;
  end;
  raise exception 'esperava a recusa "%", e passou', frase;
end $$;

-- CASO 1: o que a migração APAGOU e o que FICOU — PERFIL só com cores e serra_mm (os valores de antes), REFORCO e ACESSORIOS com config NULL
-- (nunca {}), a autoria anulada nas três; as três tabelas vazias; o catálogo de campos só com PERFIL.cores e PERFIL.serra_mm; as outras cinco
-- categorias da conta intactas; a coluna nova NULL em todas; e as três tabelas e as três funções AINDA EXISTEM (decisão: ficam, vazias e sem tela)
do $c$ begin
  if pg_temp.cfg('PERFIL') is distinct from '{"cores": null, "serra_mm": 5}'::jsonb then raise exception 'FALHOU caso 1: PERFIL %', pg_temp.cfg('PERFIL'); end if;
  if pg_temp.cfg('REFORCO') is not null or pg_temp.cfg('ACESSORIOS_VEDACAO') is not null then raise exception 'FALHOU caso 1: REFORCO % ACESSORIOS %', pg_temp.cfg('REFORCO'), pg_temp.cfg('ACESSORIOS_VEDACAO'); end if;
  if exists (select 1 from public.orcamentista_mp_categoria where id in (pg_temp.cat('PERFIL'), pg_temp.cat('REFORCO'), pg_temp.cat('ACESSORIOS_VEDACAO')) and atualizado_por is not null) then
    raise exception 'FALHOU caso 1: a autoria das tres nao foi anulada'; end if;
  if exists (select 1 from public.orcamentista_mp_vidro) or exists (select 1 from public.orcamentista_mp_ferragem) or exists (select 1 from public.orcamentista_mp_instalacao) then
    raise exception 'FALHOU caso 1: sobrou linha nas tres tabelas'; end if;
  if (select string_agg(categoria_chave || '.' || chave, ',' order by categoria_chave, chave) from public.orcamentista_categoria_campo) is distinct from 'PERFIL.cores,PERFIL.serra_mm' then
    raise exception 'FALHOU caso 1: o catalogo de campos %', (select string_agg(categoria_chave || '.' || chave, ',') from public.orcamentista_categoria_campo); end if;
  if (select count(*) from public.orcamentista_mp_categoria) is distinct from 8 or exists (select 1 from public.orcamentista_mp_categoria where instrucao is not null)
     or exists (select 1 from public.orcamentista_mp_categoria where categoria_chave not in ('PERFIL', 'REFORCO', 'ACESSORIOS_VEDACAO') and config is not null) then
    raise exception 'FALHOU caso 1: o resto da conta mudou'; end if;
  if (select count(*) from pg_proc where proname in ('superadmin_gravar_mp_vidros', 'superadmin_gravar_mp_ferragens', 'superadmin_gravar_mp_instalacao')) is distinct from 3
     or (select count(*) from pg_tables where schemaname = 'public' and tablename in ('orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao')) is distinct from 3 then
    raise exception 'FALHOU caso 1: as tabelas ou as funcoes das listas sumiram (a remocao delas e outra PR)'; end if;
  raise notice 'ok: caso 1 — apagou so o medido: PERFIL fica {cores, serra_mm}, REFORCO e ACESSORIOS viram NULL, autoria anulada, 3 tabelas vazias, catalogo so cores e serra; o resto da conta e as tabelas/funcoes ficam';
end $c$;

-- CASO 2: o LOG da remoção, linha a linha, com o tenant de quem era, e uma vez só (a migração rodou duas vezes): as 3 configs (antes com as chaves,
-- depois sem), as 4 + 4 + 3 linhas pelos ids de produção (a linha inteira no antes, depois nulo), as 11 definições (tenant NULL, chave CATEGORIA.campo)
do $c$ declare v jsonb; begin
  if (select count(*) from pg_temp.removidos('orcamentista_mp_categoria')) is distinct from 3 then raise exception 'FALHOU caso 2: % linhas de config', (select count(*) from pg_temp.removidos('orcamentista_mp_categoria')); end if;
  select antes into v from pg_temp.removidos('orcamentista_mp_categoria') where chave = pg_temp.cat('PERFIL')::text;
  if v -> 'orcamentista_mp_categoria' -> 'config' ->> 'linha' is distinct from 'EUROPA 42' or v -> 'orcamentista_mp_categoria' -> 'config' ->> 'solda' is null
     or v -> 'orcamentista_mp_categoria' ->> 'atualizado_por' is distinct from pg_temp.k('SA') then raise exception 'FALHOU caso 2: o antes do PERFIL %', v; end if;
  select depois into v from pg_temp.removidos('orcamentista_mp_categoria') where chave = pg_temp.cat('PERFIL')::text;
  if v -> 'orcamentista_mp_categoria' -> 'config' is distinct from '{"cores": null, "serra_mm": 5}'::jsonb then raise exception 'FALHOU caso 2: o depois do PERFIL %', v; end if;
  select depois into v from pg_temp.removidos('orcamentista_mp_categoria') where chave = pg_temp.cat('ACESSORIOS_VEDACAO')::text;
  if v -> 'orcamentista_mp_categoria' -> 'config' is distinct from 'null'::jsonb then raise exception 'FALHOU caso 2: o depois dos ACESSORIOS %', v; end if;
  if exists (select 1 from pg_temp.removidos('orcamentista_mp_categoria') where tenant_id is distinct from pg_temp.k('DP')::uuid or por is not null) then raise exception 'FALHOU caso 2: o tenant ou o autor das configs'; end if;
  if (select string_agg(chave, ',' order by chave collate "C") from pg_temp.removidos('orcamentista_mp_vidro'))
     is distinct from '0e297cb8-7406-46fe-ad58-67a8a97616dd,71ca60ba-e753-43ef-a808-172a711d76c2,785b8a72-7c4c-4bd9-9c5d-d82235a5cd92,b5bcdb87-2a50-4efc-ba2a-e0df27fa782e' then
    raise exception 'FALHOU caso 2: os vidros %', (select string_agg(chave, ',') from pg_temp.removidos('orcamentista_mp_vidro')); end if;
  if (select count(*) from pg_temp.removidos('orcamentista_mp_ferragem')) is distinct from 4 or (select count(*) from pg_temp.removidos('orcamentista_mp_instalacao')) is distinct from 3 then
    raise exception 'FALHOU caso 2: ferragens % instalacao %', (select count(*) from pg_temp.removidos('orcamentista_mp_ferragem')), (select count(*) from pg_temp.removidos('orcamentista_mp_instalacao')); end if;
  if exists (select 1 from public.superadmin_alteracao_log where antes ->> 'remocao' = '20261103000002'
              and tabela in ('orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao') and (tenant_id is distinct from pg_temp.k('DP')::uuid or depois is not null or por is not null)) then
    raise exception 'FALHOU caso 2: o tenant, o depois ou o autor das linhas'; end if;
  select antes into v from pg_temp.removidos('orcamentista_mp_ferragem') where chave = 'a44f1154-cce5-4777-8c1e-dbd282e2ec18';
  if v -> 'orcamentista_mp_ferragem' ->> 'referencia' is distinct from 'PROV-CR-2F' or v -> 'orcamentista_mp_ferragem' ->> 'posicao' is distinct from 'INTERNA' then raise exception 'FALHOU caso 2: a linha inteira da ferragem %', v; end if;
  if (select string_agg(chave, ',' order by chave collate "C") from pg_temp.removidos('orcamentista_categoria_campo'))
     is distinct from 'ACESSORIOS_VEDACAO.cor_por_perfil,ACESSORIOS_VEDACAO.modelo_interlock,ACESSORIOS_VEDACAO.vedacao,PERFIL.barra_mm,PERFIL.cor_predominante,PERFIL.criterio_custo_barra,PERFIL.linha,PERFIL.solda,REFORCO.material,REFORCO.par_inox_referencia,REFORCO.usa' then
    raise exception 'FALHOU caso 2: as definicoes %', (select string_agg(chave, ',') from pg_temp.removidos('orcamentista_categoria_campo')); end if;
  if exists (select 1 from pg_temp.removidos('orcamentista_categoria_campo') where tenant_id is not null or depois is not null) then raise exception 'FALHOU caso 2: a definicao e global: tenant NULL'; end if;
  if (select count(*) from public.superadmin_alteracao_log where antes ->> 'remocao' = '20261103000002') is distinct from 25 then
    raise exception 'FALHOU caso 2: % linhas com a marca (esperava 3 + 11 + 11)', (select count(*) from public.superadmin_alteracao_log where antes ->> 'remocao' = '20261103000002'); end if;
  raise notice 'ok: caso 2 — o log: 3 configs (antes com as chaves, depois sem), 11 linhas pelos ids de producao, 11 definicoes com tenant NULL; 25 linhas, uma vez so apesar das duas aplicacoes';
end $c$;

-- CASO 3: a CHECK da coluna — vazia, com espaço nas pontas e com 1.501 caracteres são recusadas; 1.500 caracteres multibyte passam (char_length, não bytes)
do $c$ declare v text; begin
  v := pg_temp.recusa(format('update public.orcamentista_mp_categoria set instrucao = %L where id = %L', '', pg_temp.cat('VIDRO')), 'orcamentista_mp_categoria_instrucao_forma');
  v := pg_temp.recusa(format('update public.orcamentista_mp_categoria set instrucao = %L where id = %L', ' x', pg_temp.cat('VIDRO')), 'orcamentista_mp_categoria_instrucao_forma');
  v := pg_temp.recusa(format('update public.orcamentista_mp_categoria set instrucao = %L where id = %L', E'x\n', pg_temp.cat('VIDRO')), 'orcamentista_mp_categoria_instrucao_forma');
  v := pg_temp.recusa(format('update public.orcamentista_mp_categoria set instrucao = %L where id = %L', repeat('a', 1501), pg_temp.cat('VIDRO')), 'orcamentista_mp_categoria_instrucao_forma');
  update public.orcamentista_mp_categoria set instrucao = repeat('ç', 1500) where id = pg_temp.cat('VIDRO');
  if char_length(pg_temp.instr('VIDRO')) is distinct from 1500 or octet_length(pg_temp.instr('VIDRO')) is distinct from 3000 then raise exception 'FALHOU caso 3: os 1500 multibyte'; end if;
  update public.orcamentista_mp_categoria set instrucao = null where id = pg_temp.cat('VIDRO');
  raise notice 'ok: caso 3 — a CHECK recusa vazia, espaco nas pontas e 1501; aceita 1500 caracteres de 3 bytes cada e NULL';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 4: a função RECUSA, nomeando: quem não é super admin; empresa inexistente; a categoria de OUTRA empresa e a inexistente (a mesma frase: não se
-- revela que existe); o que não é texto; 1.501 caracteres (contados depois de aparar). Nada gravado, nada logado
do $c$ declare v text; p text := pg_temp.cat('VIDRO')::text; f text := 'select public.superadmin_gravar_instrucao_da_categoria(%L, %L, %L, %L::jsonb)'; begin
  v := pg_temp.recusa(format(f, pg_temp.k('DP'), pg_temp.k('CO'), p, '"x"'), 'o autor da alteracao nao e super admin');
  v := pg_temp.recusa(format(f, pg_temp.k('DP'), null, p, '"x"'), 'o autor da alteracao nao e super admin');
  v := pg_temp.recusa(format(f, '00000000-0000-0000-0000-000000000099', pg_temp.k('SA'), p, '"x"'), 'empresa inexistente');
  v := pg_temp.recusa(format(f, pg_temp.k('B'), pg_temp.k('SA'), p, '"x"'), 'categoria inexistente nesta empresa');
  v := pg_temp.recusa(format(f, pg_temp.k('DP'), pg_temp.k('SA'), gen_random_uuid(), '"x"'), 'categoria inexistente nesta empresa');
  v := pg_temp.recusa(format(f, pg_temp.k('DP'), pg_temp.k('SA'), p, '42'), 'a instrucao e um texto');
  v := pg_temp.recusa(format(f, pg_temp.k('DP'), pg_temp.k('SA'), p, '{"texto": "x"}'), 'a instrucao e um texto');
  v := pg_temp.recusa(format(f, pg_temp.k('DP'), pg_temp.k('SA'), p, '["x"]'), 'a instrucao e um texto');
  v := pg_temp.recusa(format(f, pg_temp.k('DP'), pg_temp.k('SA'), p, to_jsonb(repeat('a', 1501))::text), 'a instrucao tem 1501 caracteres; o limite e 1500');
  v := pg_temp.recusa(format(f, pg_temp.k('DP'), pg_temp.k('SA'), p, to_jsonb('  ' || repeat('a', 1501) || E' \n')::text), 'a instrucao tem 1501 caracteres; o limite e 1500');
  if pg_temp.instr('VIDRO') is not null or exists (select 1 from pg_temp.logs_da_instrucao()) then raise exception 'FALHOU caso 4: gravou ou logou numa recusa'; end if;
  raise notice 'ok: caso 4 — a funcao recusa nomeando: nao super admin, empresa inexistente, categoria de outra empresa (a mesma frase da inexistente), nao texto, 1501 (aparado antes de contar); nada gravado';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 5: a função GRAVA: aparada, com autor e log (tenant, chave, antes e depois); a mesma instrução de novo não grava nem loga; vazia e só espaço
-- limpam (NULL, logado); null sobre NULL não faz nada; 1.500 caracteres multibyte passam; e a instrução do PERFIL não toca em cores e serra
do $c$ declare r jsonb; t0 timestamptz; texto text := 'Dúvida de vidro: tabela da Estrela.'; begin
  r := pg_temp.grava(pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.cat('VIDRO'), to_jsonb(E'  Dúvida de vidro: tabela da Estrela. \n'::text));
  if r ->> 'mudou' is distinct from 'true' or r -> 'orcamentista_mp_categoria' ->> 'instrucao' is distinct from texto then raise exception 'FALHOU caso 5: o retorno %', r; end if;
  if pg_temp.instr('VIDRO') is distinct from texto or (select atualizado_por from public.orcamentista_mp_categoria where id = pg_temp.cat('VIDRO')) is distinct from pg_temp.k('SA')::uuid then raise exception 'FALHOU caso 5: gravou %', pg_temp.instr('VIDRO'); end if;
  if (select count(*) from pg_temp.logs_da_instrucao()) is distinct from 1
     or not exists (select 1 from pg_temp.logs_da_instrucao() l where l.tenant_id = pg_temp.k('DP')::uuid and l.chave = pg_temp.cat('VIDRO')::text and l.por = pg_temp.k('SA')::uuid
                      and l.antes -> 'orcamentista_mp_categoria' -> 'instrucao' = 'null'::jsonb and l.depois -> 'orcamentista_mp_categoria' ->> 'instrucao' = texto) then
    raise exception 'FALHOU caso 5: o log da gravacao'; end if;
  select atualizado_em into t0 from public.orcamentista_mp_categoria where id = pg_temp.cat('VIDRO');
  r := pg_temp.grava(pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.cat('VIDRO'), to_jsonb(' ' || texto || '  '));
  if r ->> 'mudou' is distinct from 'false' or (select count(*) from pg_temp.logs_da_instrucao()) is distinct from 1 or (select atualizado_em from public.orcamentista_mp_categoria where id = pg_temp.cat('VIDRO')) is distinct from t0 then
    raise exception 'FALHOU caso 5: a mesma instrucao gravou ou logou'; end if;
  r := pg_temp.grava(pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.cat('VIDRO'), to_jsonb(E'  \n '::text));
  if r ->> 'mudou' is distinct from 'true' or pg_temp.instr('VIDRO') is not null or (select count(*) from pg_temp.logs_da_instrucao()) is distinct from 2 then raise exception 'FALHOU caso 5: so espaco nao limpou'; end if;
  r := pg_temp.grava(pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.cat('VIDRO'), 'null'::jsonb);
  if r ->> 'mudou' is distinct from 'false' or (select count(*) from pg_temp.logs_da_instrucao()) is distinct from 2 then raise exception 'FALHOU caso 5: null sobre NULL mexeu'; end if;
  r := pg_temp.grava(pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.cat('VIDRO'), null::jsonb);
  if r ->> 'mudou' is distinct from 'false' or (select count(*) from pg_temp.logs_da_instrucao()) is distinct from 2 then raise exception 'FALHOU caso 5: NULL sobre NULL mexeu'; end if;
  r := pg_temp.grava(pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.cat('REFORCO'), to_jsonb('ç' || chr(128512) || repeat('a', 1498)));
  if char_length(pg_temp.instr('REFORCO')) is distinct from 1500 then raise exception 'FALHOU caso 5: 1500 multibyte %', char_length(pg_temp.instr('REFORCO')); end if;
  r := pg_temp.grava(pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.cat('PERFIL'), to_jsonb('Perfil: a cor sai da lista.'::text));
  if pg_temp.cfg('PERFIL') is distinct from '{"cores": null, "serra_mm": 5}'::jsonb or pg_temp.instr('PERFIL') is distinct from 'Perfil: a cor sai da lista.' then raise exception 'FALHOU caso 5: a instrucao do PERFIL mexeu na config'; end if;
  raise notice 'ok: caso 5 — grava aparada, com autor e log; a mesma nao grava nem loga; vazia/so espaco limpam (NULL, logado); null sobre NULL nada; 1500 multibyte passa; a config do PERFIL fica';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 6: a ÁRVORE grava a instrução no mesmo bloco da config (aparada); o resumo 'arvore' traz a instrução no depois; null limpa, ausente não mexe;
-- o erro sai com o CAMINHO ("materia-prima X, categoria Y, instrucao: ...") e a árvore INTEIRA se desfaz; a chave desconhecida continua recusada
do $c$ declare r jsonb; v text; begin
  r := pg_temp.arvore('[{"categoria_chave": "PERFIL", "config": {"serra_mm": 6}, "instrucao": "  Perfil: nunca troque a cor.  "}, {"categoria_chave": "VIDRO", "instrucao": "Vidro: tabela da Estrela."}]');
  if pg_temp.instr('PERFIL') is distinct from 'Perfil: nunca troque a cor.' or pg_temp.cfg('PERFIL') ->> 'serra_mm' is distinct from '6' or pg_temp.instr('VIDRO') is distinct from 'Vidro: tabela da Estrela.' then
    raise exception 'FALHOU caso 6: a arvore nao gravou % % %', pg_temp.instr('PERFIL'), pg_temp.cfg('PERFIL'), pg_temp.instr('VIDRO'); end if;
  if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'arvore' and chave = pg_temp.k('DP')
                   and depois -> 'orcamentista_mp_categoria' @> jsonb_build_array(jsonb_build_object('categoria_chave', 'VIDRO', 'instrucao', 'Vidro: tabela da Estrela.'))) then
    raise exception 'FALHOU caso 6: o resumo da arvore nao traz a instrucao'; end if;
  if (select count(*) from pg_temp.logs_da_instrucao()) is distinct from 2 then raise exception 'FALHOU caso 6: % logs da instrucao pela arvore', (select count(*) from pg_temp.logs_da_instrucao()); end if;
  r := pg_temp.arvore('[{"categoria_chave": "VIDRO", "instrucao": null}]');
  if pg_temp.instr('VIDRO') is not null then raise exception 'FALHOU caso 6: null pela arvore nao limpou'; end if;
  r := pg_temp.arvore('[{"categoria_chave": "PERFIL", "config": {"serra_mm": 7}}]');
  if pg_temp.instr('PERFIL') is distinct from 'Perfil: nunca troque a cor.' then raise exception 'FALHOU caso 6: ausente mexeu'; end if;
  v := pg_temp.recusa(format('select pg_temp.arvore(%L::jsonb)', jsonb_build_array(jsonb_build_object('categoria_chave', 'PERFIL', 'instrucao', 'Outra'),
                                                                 jsonb_build_object('categoria_chave', 'VIDRO', 'instrucao', repeat('a', 1501)))::text),
                      'materia-prima Esquadrias de PVC WOLF, categoria VIDRO, instrucao: a instrucao tem 1501 caracteres; o limite e 1500');
  if pg_temp.instr('PERFIL') is distinct from 'Perfil: nunca troque a cor.' then raise exception 'FALHOU caso 6: a arvore nao foi atomica'; end if;
  v := pg_temp.recusa(format('select pg_temp.arvore(%L::jsonb)', '[{"categoria_chave": "VIDRO", "instrucao": 42}]'), 'materia-prima Esquadrias de PVC WOLF, categoria VIDRO, instrucao: a instrucao e um texto');
  v := pg_temp.recusa(format('select pg_temp.arvore(%L::jsonb)', '[{"categoria_chave": "VIDRO", "instrucoes": "x"}]'), 'campo(s) desconhecido(s) nas categorias: instrucoes');
  raise notice 'ok: caso 6 — a arvore grava a instrucao com a config (aparada), o resumo a traz, null limpa, ausente nao mexe; o erro sai com o caminho e desfaz tudo; chave desconhecida segue recusada';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 7: gravar a config pela superadmin_gravar_mp_categoria PRESERVA a instrução (é upsert só de config); e o banco recusa, nomeando, a chave que saiu
-- do catálogo (linha, usa) — o banco e a rota dizem o mesmo; serra_mm continua aceita
do $c$ declare v text; begin
  perform pg_temp.grava(pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.cat('PERFIL'), '"Perfil."');
  perform public.superadmin_gravar_mp_categoria(pg_temp.k('DP')::uuid, pg_temp.k('SA')::uuid, pg_temp.k('MP')::uuid, 'PERFIL', '{"serra_mm": 8}');
  if pg_temp.instr('PERFIL') is distinct from 'Perfil.' or pg_temp.cfg('PERFIL') is distinct from '{"cores": null, "serra_mm": 8}'::jsonb then raise exception 'FALHOU caso 7: % %', pg_temp.instr('PERFIL'), pg_temp.cfg('PERFIL'); end if;
  v := pg_temp.recusa(format('select public.superadmin_gravar_mp_categoria(%L, %L, %L, %L, %L::jsonb)', pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.k('MP'), 'PERFIL', '{"linha": "EUROPA 42"}'), 'chave(s) fora do catalogo de PERFIL: linha');
  v := pg_temp.recusa(format('select public.superadmin_gravar_mp_categoria(%L, %L, %L, %L, %L::jsonb)', pg_temp.k('DP'), pg_temp.k('SA'), pg_temp.k('MP'), 'REFORCO', '{"usa": true}'), 'chave(s) fora do catalogo de REFORCO: usa');
  v := pg_temp.recusa(format('select pg_temp.arvore(%L::jsonb)', '[{"categoria_chave": "PERFIL", "config": {"solda": "45/45"}}]'), 'materia-prima Esquadrias de PVC WOLF, categoria PERFIL, config: chave(s) fora do catalogo de PERFIL: solda');
  if pg_temp.instr('PERFIL') is distinct from 'Perfil.' or pg_temp.cfg('PERFIL') is distinct from '{"cores": null, "serra_mm": 8}'::jsonb then raise exception 'FALHOU caso 7: a recusa mexeu'; end if;
  raise notice 'ok: caso 7 — gravar a config preserva a instrucao; o banco recusa nomeando a chave que saiu do catalogo (linha, usa, solda), pela funcao e pela arvore';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 8: a matéria-prima NOVA (e a garantia da família) nasce com instrução NULL em toda categoria; a função grava na categoria da OUTRA empresa só
-- com o tenant dela, e a De Paula não vê
do $c$ declare v_b uuid; v_vidro uuid; begin
  perform public.superadmin_gravar_materia_prima(pg_temp.k('B')::uuid, pg_temp.k('SA')::uuid, '[{"nome": "PVC da B", "familia": "PVC"}]');
  select id into v_b from public.orcamentista_materia_prima where tenant_id = pg_temp.k('B')::uuid and nome = 'PVC da B';
  if (select count(*) from public.orcamentista_mp_categoria where materia_prima_id = v_b) = 0 or exists (select 1 from public.orcamentista_mp_categoria where materia_prima_id = v_b and instrucao is not null) then
    raise exception 'FALHOU caso 8: a nova nao nasceu com instrucao NULL'; end if;
  select id into v_vidro from public.orcamentista_mp_categoria where materia_prima_id = v_b and categoria_chave = 'VIDRO';
  perform pg_temp.recusa(format('select pg_temp.grava(%L, %L, %L, %L)', pg_temp.k('DP'), pg_temp.k('SA'), v_vidro, '"x"'), 'categoria inexistente nesta empresa');
  perform pg_temp.grava(pg_temp.k('B'), pg_temp.k('SA'), v_vidro, '"Vidro da B."');
  if (select instrucao from public.orcamentista_mp_categoria where id = v_vidro) is distinct from 'Vidro da B.' or pg_temp.instr('VIDRO') is not null then raise exception 'FALHOU caso 8: vazou entre empresas'; end if;
  if (select tenant_id from pg_temp.logs_da_instrucao()) is distinct from pg_temp.k('B')::uuid then raise exception 'FALHOU caso 8: o log com o tenant errado'; end if;
  raise notice 'ok: caso 8 — a materia-prima nova nasce com instrucao NULL; a categoria da outra empresa so grava com o tenant dela, logada nele, e a De Paula nao ve';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;

-- CASO 9: as duas funções são SECURITY DEFINER, com search_path fixo, corpo em ASCII e só do service_role — e esta base TEM o privilégio padrão de
-- produção (sem ele, um REVOKE só de PUBLIC passaria aqui e abortaria em produção, como em 02/11/2026)
do $c$ declare f text; begin
  foreach f in array array['public.superadmin_gravar_instrucao_da_categoria(uuid, uuid, uuid, jsonb)', 'public.superadmin_gravar_arvore(uuid, uuid, jsonb)'] loop
    if not exists (select 1 from pg_proc p where p.oid = to_regprocedure(f) and p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'] and p.prosrc !~ '[^\x01-\x7F]') then
      raise exception 'FALHOU caso 9: % nao e SECURITY DEFINER com search_path fixo e corpo em ASCII', f; end if;
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'FALHOU caso 9: % nao e so do service_role', f; end if;
  end loop;
  if not exists (select 1 from pg_default_acl) then raise exception 'FALHOU caso 9: esta base nao tem o privilegio padrao de producao'; end if;
  raise notice 'ok: caso 9 — as duas funcoes: SECURITY DEFINER, search_path fixo, ASCII, so service_role (com o privilegio padrao de producao na base)';
end $c$;

-- CASO 10: REGISTRO, não defeito — a função da árvore AINDA aceita `vidros`, `ferragens` e `instalacao` (decisão do dono do produto: as tabelas e
-- as funções ficam, vazias e sem tela; a remoção é outra PR). Quem barra é a rota (410 nas três rotas; recusa nomeada na árvore, antes da função)
do $c$ begin
  perform pg_temp.arvore('[{"categoria_chave": "VIDRO", "vidros": [{"descricao": "Fumê"}]}]');
  if (select count(*) from public.orcamentista_mp_vidro) is distinct from 1 then raise exception 'FALHOU caso 10: a funcao deixou de aceitar vidros — se foi de proposito, e outra PR e o cabecalho tem de dizer'; end if;
  raise notice 'ok: caso 10 — registro: a funcao da arvore ainda aceita as listas (tabelas e funcoes ficam, sem tela); quem barra e a rota';
  raise exception 'P0099' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; end $c$;
