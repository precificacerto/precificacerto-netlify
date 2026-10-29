-- Os casos da 20261029000001, sobre o estado de PRODUÇÃO de 29/10/2026 (os mesmos ids), com a migração aplicada duas vezes.
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
create or replace function public.h_payload(n int) returns jsonb language sql as $f$
  select jsonb_build_object(
    'regras', (select coalesce(jsonb_agg(jsonb_build_object('codigo', 'C' || i, 'descricao', 'regra', 'linha', 'EUROPA 42', 'tipo', 'Perfil', 'tipologias', jsonb_build_array('T' || i))), '[]'::jsonb) from generate_series(1, n) i),
    'tipologias', (select coalesce(jsonb_agg(jsonb_build_object('tipologia', 'T' || i, 'linha', 'EUROPA 42', 'n_regras', 1, 'n_condicionais', 0, 'variaveis', jsonb_build_array('L'))), '[]'::jsonb) from generate_series(1, n) i),
    'formulas', jsonb_build_array(jsonb_build_object('linha', 'EUROPA 42', 'linha_original', 'PVC EUROPA 42', 'variavel', 'HFOL', 'formula', '(H-10)')),
    'detalhes', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'descricao', 'Janela ' || i, 'tipo', 'Correr')), '[]'::jsonb) from generate_series(1, n) i),
    'formulas_da_tipologia', '[]'::jsonb, 'perfis', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'perfil', 'SF66')), '[]'::jsonb) from generate_series(1, n) i),
    'vidros', '[]'::jsonb, 'baguetes', '[]'::jsonb, 'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb,
    'otimizacao', jsonb_build_array(jsonb_build_object('ordem', 2, 'parametro', 'barra_mm', 'valor', '6000')),
    'avisos', '[]'::jsonb, 'contagens', jsonb_build_object('normalizados', 0))
$f$;
create or replace function public.h_conta_tempo(m uuid) returns bigint language sql as $f$ select count(*) from public.orcamentista_motor_tipologia_tempo where motor_id = m $f$;
-- o que nenhuma recusa pode mudar: motores, etapas, itens e log
create or replace function public.h_estado() returns text language sql as $f$
  select md5(coalesce((select string_agg(m::text, '|' order by m.id) from public.orcamentista_motor m), '') || '#'
          || coalesce((select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e), '') || '#'
          || coalesce((select string_agg(i::text, '|' order by i.id) from public.orcamentista_levantamento_item i), '') || '#'
          || (select count(*) from public.superadmin_alteracao_log)::text)
$f$;

-- CASO T1 — TROCAR O ARQUIVO do motor da Wolff, que as 3 etapas usam: motor NOVO (mesmo fornecedor, categoria e família), as 3 etapas passam a ele,
-- o antigo ARQUIVADO com as linhas intactas e os tempos nele; o item de levantamento antigo continua no antigo; cada passo no log
do $$
declare r jsonb; novo uuid; velho uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; foto text; n int;
  W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
begin
  begin
    foto := public.h_foto_do_motor(velho);
    r := public.superadmin_trocar_arquivo_do_motor(SUPER, velho, W::text || '/motor/u2-Motor_Wolf_PVC_v2.xlsx', ' Motor_Wolf_PVC_v2.xlsx ', public.h_payload(2));
    novo := (r ->> 'motor_id')::uuid;
    if novo is null or novo = velho then raise exception 'FALHOU caso T1: nao devolveu o motor novo'; end if;
    if (r ->> 'motor_antigo')::uuid is distinct from velho or (r ->> 'etapas_reapontadas')::int is distinct from 3 or (r ->> 'tipologias') is null then raise exception 'FALHOU caso T1: o retorno (%)', r; end if;
    if not exists (select 1 from public.orcamentista_motor where id = novo and fornecedor_id = W and categoria_chave = 'PERFIL' and familia = 'PVC'
                     and arquivo_nome = 'Motor_Wolf_PVC_v2.xlsx' and arquivado_em is null and criado_por = SUPER) then raise exception 'FALHOU caso T1: a linha do motor novo'; end if;
    if (select count(*) from public.orcamentista_motor_tipologia_detalhe where motor_id = novo) <> 2 then raise exception 'FALHOU caso T1: o conteudo do motor novo'; end if;
    -- as 3 etapas no novo, e nada mais delas mudou
    if (select count(*) from public.orcamentista_familia_etapa where motor_id = novo) <> 3 or exists (select 1 from public.orcamentista_familia_etapa where motor_id = velho) then
      raise exception 'FALHOU caso T1: as etapas nao foram reapontadas'; end if;
    if exists (select a.id, a.familia, a.numero, a.rotulo, a.acao, a.materia_prima_id, a.tenant_id from public.orcamentista_familia_etapa a
               except select e.id, e.familia, e.numero, e.rotulo, e.acao, e.materia_prima_id, e.tenant_id from public.h_etapas_depois_da_000001 e) then
      raise exception 'FALHOU caso T1: outra coisa da etapa mudou'; end if;
    -- o antigo arquivado, pelo autor, e com TODAS as linhas intactas (13 tabelas e os tempos)
    if not exists (select 1 from public.orcamentista_motor where id = velho and arquivado_em is not null and arquivado_por = SUPER and arquivo_path = W::text || '/motor/wolff.xlsx') then
      raise exception 'FALHOU caso T1: o antigo nao foi arquivado'; end if;
    if public.h_foto_do_motor(velho) is distinct from foto then raise exception 'FALHOU caso T1: o conteudo do motor antigo mudou'; end if;
    if public.h_conta_tempo(velho) <> 2 or public.h_conta_tempo(novo) <> 0 then raise exception 'FALHOU caso T1: os tempos (ficam no antigo, o novo nasce sem)'; end if;
    -- o levantamento antigo continua lendo o que leu
    if not exists (select 1 from public.orcamentista_levantamento_item where id = '1e000000-0000-0000-0000-0000000000a1' and motor_id = velho) then
      raise exception 'FALHOU caso T1: o item de levantamento antigo mudou de motor'; end if;
    -- o log: 3 etapas (com o tenant e o antes e depois do motor), o arquivar do antigo e a criação do novo
    select count(*) into n from public.superadmin_alteracao_log l
     where l.tabela = 'orcamentista_familia_etapa' and l.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' and l.por = SUPER
       and (l.antes ->> 'troca_de_arquivo_do_motor')::uuid = velho
       and (l.antes -> 'orcamentista_familia_etapa' ->> 'motor_id')::uuid = velho and (l.depois -> 'orcamentista_familia_etapa' ->> 'motor_id')::uuid = novo;
    if n <> 3 then raise exception 'FALHOU caso T1: % log(s) de etapa, esperado 3', n; end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = velho::text and antes -> 'orcamentista_motor' ->> 'arquivado_em' is null
                     and depois -> 'orcamentista_motor' ->> 'arquivado_em' is not null) then raise exception 'FALHOU caso T1: o log do arquivar'; end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = novo::text and antes is null) then raise exception 'FALHOU caso T1: o log da criacao'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T1 — trocar o arquivo: motor novo com o mesmo fornecedor, categoria e familia; 3 etapas reapontadas; o antigo arquivado com as linhas e os tempos intactos; o levantamento antigo no antigo; log de cada passo';
end $$;

-- CASO T2 — trocar o arquivo de um motor SEM uso: o novo nasce, o antigo é arquivado, nenhuma etapa a reapontar
do $$
declare res jsonb; m uuid; novo uuid; R uuid := 'f2000000-0000-0000-0000-000000000002'; SUPER uuid := 'e0000000-0000-0000-0000-000000000001';
begin
  begin
    m := (public.superadmin_criar_motor(SUPER, R, 'PERSIANAS', 'PVC', R::text || '/motor/u1-persiana.xlsx', 'persiana.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    res := public.superadmin_trocar_arquivo_do_motor(SUPER, m, R::text || '/motor/u2-persiana.xlsx', 'persiana v2.xlsx', public.h_payload(3));
    novo := (res ->> 'motor_id')::uuid;
    if (res ->> 'etapas_reapontadas')::int <> 0 then raise exception 'FALHOU caso T2: reapontou etapa de motor sem uso'; end if;
    if not exists (select 1 from public.orcamentista_motor where id = novo and fornecedor_id = R and categoria_chave = 'PERSIANAS' and familia = 'PVC' and arquivado_em is null) then raise exception 'FALHOU caso T2: o novo'; end if;
    if not exists (select 1 from public.orcamentista_motor where id = m and arquivado_em is not null) then raise exception 'FALHOU caso T2: o antigo'; end if;
    if (select count(*) from public.orcamentista_motor_tipologia_detalhe where motor_id = novo) <> 3 or (select count(*) from public.orcamentista_motor_tipologia_detalhe where motor_id = m) <> 1 then
      raise exception 'FALHOU caso T2: o conteudo de um dos dois'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T2 — motor sem uso: o novo nasce, o antigo arquivado, nenhuma etapa reapontada, cada um com o seu conteudo';
end $$;

-- CASO T3 — as recusas de TROCAR: código certo, e NADA muda (nem motor novo, nem etapa, nem item, nem log)
do $$
declare antes text; x text; arq uuid; W text := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; velho text := '9a233c55-f377-45d3-b2ae-b1a740a98e44';
  p text := public.h_payload(1)::text; g text := 'select public.superadmin_trocar_arquivo_do_motor(%L, %L, %L, %L, %L::jsonb)';
begin
  begin
    -- um motor arquivado, para a recusa dele
    arq := (public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', W::uuid, 'PERSIANAS', 'PVC', W || '/motor/u1-arq.xlsx', 'arq.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    perform public.superadmin_arquivar_motor(arq, 'e0000000-0000-0000-0000-000000000001');
    antes := public.h_estado();
    foreach x in array array[
      '42501|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000002', velho, W || '/motor/u9.xlsx', 'a.xlsx', p)),
      '42501|' || public.h_erro(format(g, null, velho, W || '/motor/u9.xlsx', 'a.xlsx', p)),
      'P0002|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000ff', W || '/motor/u9.xlsx', 'a.xlsx', p)),
      'P0002|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', null, W || '/motor/u9.xlsx', 'a.xlsx', p)),
      '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', arq::text, W || '/motor/u9.xlsx', 'a.xlsx', p)),
      -- o autor comum num motor arquivado: quem recusa é a troca (42501), antes de qualquer outra conferência
      '42501|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000002', arq::text, W || '/motor/u9.xlsx', 'a.xlsx', p)),
      '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', velho, W || '/motor/wolff.xlsx', 'a.xlsx', p)),
      '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', velho, ' ' || W || '/motor/wolff.xlsx ', 'a.xlsx', p)),
      -- o que a criação recusa, a troca recusa: pasta de outro fornecedor, sem tipologia, payload incompleto
      '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', velho, 'f2000000-0000-0000-0000-000000000002/motor/u9.xlsx', 'a.xlsx', p)),
      '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', velho, W || '/motor/u9.xlsx', 'a.xlsx', jsonb_set(p::jsonb, '{detalhes}', '[]')::text)),
      '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', velho, W || '/motor/u9.xlsx', 'a.xlsx', (p::jsonb - 'perfis')::text))
    ] loop
      if split_part(x, '|', 1) <> split_part(x, '|', 2) then raise exception 'FALHOU caso T3: esperado %, obtido (%)', split_part(x, '|', 1), x; end if;
    end loop;
    if public.h_estado() is distinct from antes then raise exception 'FALHOU caso T3: uma recusa mudou motor, etapa, item ou log'; end if;
    -- a recusa do arquivado é a DA TROCA, com a frase dela — não a do arquivar, no fim
    x := public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', arq::text, W || '/motor/u9.xlsx', 'a.xlsx', p));
    if position('o arquivo de um motor arquivado nao se troca' in x) = 0 then raise exception 'FALHOU caso T3: a frase do arquivado (%)', x; end if;
    x := public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', velho, W || '/motor/wolff.xlsx', 'a.xlsx', p));
    if position('o arquivo novo e o mesmo objeto do motor atual' in x) = 0 then raise exception 'FALHOU caso T3: a frase do mesmo caminho (%)', x; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T3 — autor comum ou nulo, motor inexistente ou nulo, motor arquivado, o mesmo caminho (com espaco), pasta de outro fornecedor, sem tipologia, payload incompleto: codigo certo e nada muda';
end $$;

-- CASO E1 — EDITAR motor com uso: recusa NOMEANDO quantas etapas e itens o usam, e nada muda; só ITEM de levantamento também é uso
do $$
declare antes text; x text; W text := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; m uuid;
begin
  begin
    antes := public.h_estado();
    x := public.h_erro(format('select public.superadmin_editar_motor(%L, %L, %L, %L, %L)', 'e0000000-0000-0000-0000-000000000001', '9a233c55-f377-45d3-b2ae-b1a740a98e44', W, 'PERSIANAS', W || '/motor/wolff.xlsx'));
    if split_part(x, '|', 1) <> '22023' or position('3 etapa(s), 1 item(ns) de levantamento' in x) = 0 then raise exception 'FALHOU caso E1: a recusa do motor com uso (%)', x; end if;
    if public.h_estado() is distinct from antes then raise exception 'FALHOU caso E1: a recusa mudou alguma coisa'; end if;
    -- só um item de levantamento (nenhuma etapa): também é uso
    m := (public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', W::uuid, 'PERSIANAS', 'PVC', W || '/motor/u1-p.xlsx', 'p.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, familia, motor_id)
    values ('20e08592-f957-4e72-b7eb-251387e34eb9', '1e000000-0000-0000-0000-000000000001', 2, 'T1', 'PVC', m);
    x := public.h_erro(format('select public.superadmin_editar_motor(%L, %L, %L, %L, %L)', 'e0000000-0000-0000-0000-000000000001', m, W, 'FERRAGENS', W || '/motor/u1-p.xlsx'));
    if split_part(x, '|', 1) <> '22023' or position('0 etapa(s), 1 item(ns) de levantamento' in x) = 0 then raise exception 'FALHOU caso E1: so o item de levantamento (%)', x; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E1 — motor com uso (etapas e itens, ou so um item) nao se edita: a recusa nomeia quantos, e nada muda';
end $$;

-- CASO E2 — EDITAR motor SEM uso: trocar a categoria (mesmo fornecedor, mesmo caminho); trocar o fornecedor (caminho na pasta do NOVO); o log tem antes e depois
do $$
declare m uuid; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; R uuid := 'f2000000-0000-0000-0000-000000000002'; SUPER uuid := 'e0000000-0000-0000-0000-000000000001'; n int;
begin
  begin
    m := (public.superadmin_criar_motor(SUPER, R, 'PERSIANAS', 'PVC', R::text || '/motor/u1-persiana.xlsx', 'persiana.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    perform public.superadmin_editar_motor(SUPER, m, R, 'FERRAGENS', R::text || '/motor/u1-persiana.xlsx');
    if not exists (select 1 from public.orcamentista_motor where id = m and categoria_chave = 'FERRAGENS' and fornecedor_id = R and arquivo_path = R::text || '/motor/u1-persiana.xlsx' and familia = 'PVC' and arquivo_nome = 'persiana.xlsx') then
      raise exception 'FALHOU caso E2: a categoria'; end if;
    perform public.superadmin_editar_motor(SUPER, m, W, 'FERRAGENS', ' ' || W::text || '/motor/u1-persiana.xlsx ');
    if not exists (select 1 from public.orcamentista_motor where id = m and categoria_chave = 'FERRAGENS' and fornecedor_id = W and arquivo_path = W::text || '/motor/u1-persiana.xlsx') then
      raise exception 'FALHOU caso E2: o fornecedor e o caminho'; end if;
    select count(*) into n from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_motor' and l.chave = m::text and l.antes is not null and l.por = SUPER and l.tenant_id is null;
    if n <> 2 then raise exception 'FALHOU caso E2: % log(s) de edicao, esperado 2', n; end if;
    if not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_motor' and l.chave = m::text
                     and l.antes -> 'orcamentista_motor' ->> 'categoria_chave' = 'PERSIANAS' and l.depois -> 'orcamentista_motor' ->> 'categoria_chave' = 'FERRAGENS') then
      raise exception 'FALHOU caso E2: o antes e o depois da categoria'; end if;
    if (select count(*) from public.orcamentista_motor_tipologia_detalhe where motor_id = m) <> 1 then raise exception 'FALHOU caso E2: o conteudo mudou'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E2 — motor sem uso: a categoria troca com o mesmo caminho, o fornecedor troca com o caminho na pasta do novo, o conteudo fica, e o log tem antes e depois';
end $$;

-- CASO E3 — as recusas de EDITAR: código certo, e nada muda
do $$
declare antes text; x text; m uuid; arq uuid; R text := 'f2000000-0000-0000-0000-000000000002'; W text := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654';
  g text := 'select public.superadmin_editar_motor(%L, %L, %L, %L, %L)'; S text := 'e0000000-0000-0000-0000-000000000001';
begin
  begin
    m := (public.superadmin_criar_motor(S::uuid, R::uuid, 'PERSIANAS', 'PVC', R || '/motor/u1-persiana.xlsx', 'persiana.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    arq := (public.superadmin_criar_motor(S::uuid, R::uuid, 'PERSIANAS', 'PVC', R || '/motor/u1-arq.xlsx', 'arq.xlsx', public.h_payload(1)) ->> 'motor_id')::uuid;
    perform public.superadmin_arquivar_motor(arq, S::uuid);
    antes := public.h_estado();
    foreach x in array array[
      '42501|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000002', m, R, 'FERRAGENS', R || '/motor/u1-persiana.xlsx')),
      'P0002|' || public.h_erro(format(g, S, 'f0000000-0000-0000-0000-0000000000ff', R, 'FERRAGENS', R || '/motor/u1-persiana.xlsx')),
      '22023|' || public.h_erro(format(g, S, arq, R, 'FERRAGENS', R || '/motor/u1-arq.xlsx')),
      '22023|' || public.h_erro(format(g, S, m, R, 'NAO_EXISTE', R || '/motor/u1-persiana.xlsx')),
      '22023|' || public.h_erro(format(g, S, m, R, null, R || '/motor/u1-persiana.xlsx')),
      'P0002|' || public.h_erro(format(g, S, m, 'f0000000-0000-0000-0000-0000000000ff', 'FERRAGENS', 'f0000000-0000-0000-0000-0000000000ff/motor/u1-persiana.xlsx')),
      -- o fornecedor fica e o caminho muda; o fornecedor muda e o caminho fica na pasta do antigo; ".."; nada mudou
      '22023|' || public.h_erro(format(g, S, m, R, 'FERRAGENS', R || '/motor/outro.xlsx')),
      '22023|' || public.h_erro(format(g, S, m, W, 'FERRAGENS', R || '/motor/u1-persiana.xlsx')),
      '22023|' || public.h_erro(format(g, S, m, W, 'FERRAGENS', W || '/motor/../../x.xlsx')),
      '22023|' || public.h_erro(format(g, S, m, R, 'PERSIANAS', R || '/motor/u1-persiana.xlsx'))
    ] loop
      if split_part(x, '|', 1) <> split_part(x, '|', 2) then raise exception 'FALHOU caso E3: esperado %, obtido (%)', split_part(x, '|', 1), x; end if;
    end loop;
    if public.h_estado() is distinct from antes then raise exception 'FALHOU caso E3: uma recusa mudou alguma coisa'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso E3 — autor, motor inexistente ou arquivado, categoria fora da lista ou nula, fornecedor inexistente, caminho que mente (fica, muda, ".."), nada mudou: codigo certo e nada muda';
end $$;

-- CASO V1 — as duas funções FECHADAS: só service_role, SECURITY DEFINER, search_path fixo; a de trocar com o statement_timeout de 40 s
do $$
declare f regprocedure; nome text;
begin
  foreach nome in array array['public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)', 'public.superadmin_editar_motor(uuid, uuid, uuid, text, text)'] loop
    f := to_regprocedure(nome);
    if f is null or has_function_privilege('public', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE')
       or not exists (select 1 from pg_proc p where p.oid = f and p.prosecdef and 'search_path=public, pg_temp' = any (p.proconfig)) then
      raise exception 'FALHOU caso V1: % aberta ou sem search_path', nome; end if;
  end loop;
  if not exists (select 1 from pg_proc p where p.oid = 'public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)'::regprocedure and 'statement_timeout=40s' = any (p.proconfig)) then
    raise exception 'FALHOU caso V1: sem o statement_timeout'; end if;
  raise notice 'ok: caso V1 — as duas funcoes fechadas, SECURITY DEFINER, search_path fixo; a de trocar com 40 s';
end $$;
