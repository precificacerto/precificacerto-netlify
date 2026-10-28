-- Os casos da 20261027000010. Cada caso desfaz o que fez (P0099), salvo indicação.
-- `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.
create or replace function public.h_erro(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics msg = message_text, cod = returned_sqlstate;
  return cod || '|' || msg;
end $f$;
create or replace function public.h_conta(p_tabela text, p_motor uuid) returns bigint language plpgsql as $f$
declare n bigint;
begin execute format('select count(*) from public.%I where motor_id = %L', p_tabela, p_motor) into n; return n; end $f$;
-- o payload do leitor para N tipologias (T1..TN), com tudo o que a função grava
create or replace function public.h_payload(n int) returns jsonb language sql as $f$
  select jsonb_build_object(
    'regras', (select coalesce(jsonb_agg(jsonb_build_object('codigo', 'C' || i || '-' || k, 'descricao', 'regra', 'segmento', 'Perfil PVC', 'cor', 'BRANCO', 'linha', 'EUROPA 42', 'tipo', 'Perfil', 'tipologias', jsonb_build_array('T' || i))), '[]'::jsonb) from generate_series(1, n) i, generate_series(1, 2) k),
    'tipologias', (select coalesce(jsonb_agg(jsonb_build_object('tipologia', 'T' || i, 'linha', 'EUROPA 42', 'n_regras', 2, 'n_condicionais', 0, 'variaveis', jsonb_build_array('L'))), '[]'::jsonb) from generate_series(1, n) i),
    'formulas', jsonb_build_array(jsonb_build_object('linha', 'EUROPA 42', 'linha_original', 'PVC EUROPA 42', 'variavel', 'HFOL', 'descricao', 'altura', 'formula', '(H-10)'), jsonb_build_object('linha', 'DESIGN', 'linha_original', 'PVC DESIGN', 'variavel', 'HFOL', 'descricao', 'altura', 'formula', '(H-12)')),
    'detalhes', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'descricao', 'Janela ' || i, 'tipo', 'Correr', 'n_perfis', 1, 'n_vidros', 1, 'n_insumos', 1)), '[]'::jsonb) from generate_series(1, n) i),
    'formulas_da_tipologia', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'variavel', 'HFOL', 'descricao', 'altura', 'formula', '(H-10)')), '[]'::jsonb) from generate_series(1, n) i),
    'perfis', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'perfil', 'SF66', 'descricao', 'folha', 'corte', '45/45', 'qtd', '2', 'medida', 'H-10')), '[]'::jsonb) from generate_series(1, n) i),
    'vidros', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'vidro', 'V1', 'largura', 'L/2', 'altura', 'H', 'qtd', '2')), '[]'::jsonb) from generate_series(1, n) i),
    'baguetes', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'baguete', 'GB25', 'descricao', 'baguete', 'espessuras_vidro', '4,5', 'qtd_medida_condicao', '2')), '[]'::jsonb) from generate_series(1, n) i),
    'insumos', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'insumo', 'ESCOVA', 'descricao', 'escova', 'qtd', '2')), '[]'::jsonb) from generate_series(1, n) i),
    'variaveis_da_tipologia', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'variavel', 'ARI', 'descricao', 'arremate', 'padrao', '1', 'opcoes', '1 = BZ0006')), '[]'::jsonb) from generate_series(1, n) i),
    'validacoes', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'condicao_valida', 'L>=600', 'mensagem', 'largura minima')), '[]'::jsonb) from generate_series(1, n) i),
    'otimizacao', jsonb_build_array(jsonb_build_object('ordem', 2, 'parametro', 'barra_mm', 'valor', '6000'), jsonb_build_object('ordem', 3, 'parametro', 'serra_mm', 'valor', '5')),
    'avisos', '[]'::jsonb,
    'contagens', jsonb_build_object('normalizados', 0))
$f$;
create or replace function public.h_criar(p_etapa uuid, p_path text, p_payload jsonb, p_por uuid default 'e0000000-0000-0000-0000-000000000001') returns text language sql as $f$
  select public.h_erro(format('select public.superadmin_criar_motor_da_etapa(%L, %L, %L, %L, %L::jsonb)', p_etapa, p_por, p_path, 'motor.xlsx', p_payload::text))
$f$;
create or replace function public.h_arquivar(p_motor uuid) returns text language sql as $f$
  select public.h_erro(format('select public.superadmin_arquivar_motor(%L, %L)', p_motor, 'e0000000-0000-0000-0000-000000000001'))
$f$;

-- CASO V1 — subir o arquivo numa etapa CRIA o motor da família, grava as 12 tabelas por motor_id, registra a importação e aponta a etapa, numa transação
do $$
declare r jsonb; m uuid; t text; n bigint; esperado jsonb;
begin
  begin
    r := public.superadmin_criar_motor_da_etapa('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'familia/PVC/motor/u1-motor.xlsx', ' motor.xlsx ', public.h_payload(3));
    m := (r ->> 'motor_id')::uuid;
    if not exists (select 1 from public.orcamentista_motor where id = m and familia = 'PVC' and fornecedor_id is null and vigente = false and arquivado_em is null
                     and arquivo_nome = 'motor.xlsx' and arquivo_path = 'familia/PVC/motor/u1-motor.xlsx' and criado_por = 'e0000000-0000-0000-0000-000000000001') then
      raise exception 'FALHOU caso V1: a linha do motor nao tem a forma esperada'; end if;
    -- a contagem de CADA uma das 12 tabelas, por motor_id, é a que a função devolveu (e é a que o payload mandou)
    for t, n in select * from (values ('orcamentista_motor_regra', 6), ('orcamentista_motor_tipologia', 3), ('orcamentista_motor_formula_familia', 2), ('orcamentista_motor_tipologia_detalhe', 3),
        ('orcamentista_motor_formula', 3), ('orcamentista_motor_perfil', 3), ('orcamentista_motor_vidro', 3), ('orcamentista_motor_baguete', 3), ('orcamentista_motor_insumo', 3),
        ('orcamentista_motor_variavel', 3), ('orcamentista_motor_validacao', 3), ('orcamentista_motor_otimizacao', 2)) v(t, n) loop
      if public.h_conta(t, m) <> n then raise exception 'FALHOU caso V1: % tem % linhas por motor_id (esperado %)', t, public.h_conta(t, m), n; end if;
    end loop;
    if (r ->> 'regras')::int <> 6 or (r ->> 'tipologias')::int <> 3 or (r ->> 'detalhes')::int <> 3 or (r ->> 'perfis')::int <> 3 or (r ->> 'otimizacao')::int <> 2 then raise exception 'FALHOU caso V1: contagens devolvidas %', r; end if;
    if (select motor_id from public.orcamentista_familia_etapa where id = 'e1000000-0000-0000-0000-000000000001') is distinct from m then raise exception 'FALHOU caso V1: a etapa nao aponta o motor novo'; end if;
    if (select atualizado_por from public.orcamentista_familia_etapa where id = 'e1000000-0000-0000-0000-000000000001') is distinct from 'e0000000-0000-0000-0000-000000000001' then raise exception 'FALHOU caso V1: a autoria da etapa nao foi gravada'; end if;
    if not exists (select 1 from public.orcamentista_importacao where motor_id = m and tabela_id is null and itens = 0 and regras = 6 and tipologias = 3 and cruzam = 0 and nao_cruzam = 0 and importado_por = 'e0000000-0000-0000-0000-000000000001') then
      raise exception 'FALHOU caso V1: a importacao nao foi registrada como esperado'; end if;
    if (select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_etapa' and chave = 'e1000000-0000-0000-0000-000000000001' and tenant_id is null) <> 1 then raise exception 'FALHOU caso V1: o log nao tem 1 linha'; end if;
    if public.h_conta('orcamentista_motor_tipologia_tempo', m) <> 0 then raise exception 'FALHOU caso V1: o motor novo nasceu com tempo'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso V1 — a etapa sobe o arquivo: cria o motor, grava as 12 tabelas por motor_id, registra a importacao, aponta a etapa, loga, e o motor nasce sem tempo';
end $$;
-- CASO V2 — TROCAR o arquivo: cria o motor novo, aponta a etapa para ele; o velho fica intacto e ARQUIVÁVEL; o novo, que a etapa aponta, não
do $$
declare m1 uuid; m2 uuid; h1 text; r text;
begin
  begin
    m1 := (public.superadmin_criar_motor_da_etapa('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'familia/PVC/motor/u1-a.xlsx', 'a.xlsx', public.h_payload(2)) ->> 'motor_id')::uuid;
    select md5(string_agg(x::text, '|' order by x::text)) into h1 from public.orcamentista_motor_perfil x where motor_id = m1;
    m2 := (public.superadmin_criar_motor_da_etapa('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'familia/PVC/motor/u2-b.xlsx', 'b.xlsx', public.h_payload(4)) ->> 'motor_id')::uuid;
    if m1 = m2 then raise exception 'FALHOU caso V2: o mesmo motor'; end if;
    if (select motor_id from public.orcamentista_familia_etapa where id = 'e1000000-0000-0000-0000-000000000001') is distinct from m2 then raise exception 'FALHOU caso V2: a etapa nao aponta o novo'; end if;
    if public.h_conta('orcamentista_motor_perfil', m1) <> 2 or public.h_conta('orcamentista_motor_perfil', m2) <> 4 then raise exception 'FALHOU caso V2: as linhas dos dois motores nao ficaram separadas'; end if;
    if (select md5(string_agg(x::text, '|' order by x::text)) from public.orcamentista_motor_perfil x where motor_id = m1) is distinct from h1 then raise exception 'FALHOU caso V2: o motor velho mudou'; end if;
    r := public.h_arquivar(m2);
    if r not like '22023|%aponte%' then raise exception 'FALHOU caso V2: arquivar o motor que a etapa aponta devia ser recusado: %', r; end if;
    r := public.h_arquivar(m1);
    if r <> 'ok' then raise exception 'FALHOU caso V2: o motor velho devia ser arquivavel: %', r; end if;
    if (select arquivado_em from public.orcamentista_motor where id = m1) is null then raise exception 'FALHOU caso V2: o velho nao foi arquivado'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso V2 — trocar o arquivo cria o motor novo e aponta a etapa; o velho fica intacto e arquivavel, o apontado nao';
end $$;
-- CASO V3 — o motor é da família DA ETAPA: a etapa da ALUMINIO cria motor de ALUMINIO, e o arquivo da pasta de outra família é recusado
do $$
declare r jsonb; x text;
begin
  begin
    r := public.superadmin_criar_motor_da_etapa('e1000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'familia/ALUMINIO/motor/u1.xlsx', 'alu.xlsx', public.h_payload(1));
    if (select familia from public.orcamentista_motor where id = (r ->> 'motor_id')::uuid) <> 'ALUMINIO' then raise exception 'FALHOU caso V3: familia do motor'; end if;
    x := public.h_criar('e1000000-0000-0000-0000-000000000004', 'familia/PVC/motor/u1.xlsx', public.h_payload(1));
    if x not like '22023|%' then raise exception 'FALHOU caso V3: a pasta da PVC na etapa da ALUMINIO devia ser recusada: %', x; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso V3 — o motor nasce da familia da etapa; a pasta de outra familia e recusada';
end $$;
-- CASO V4 — cada recusa devolve o código certo e NADA muda (nem motor, nem linha, nem a etapa)
do $$
declare antes_m bigint; antes_e text; x text; p jsonb := public.h_payload(2); casos text[][];
  etapa uuid := 'e1000000-0000-0000-0000-000000000001'; ok_path text := 'familia/PVC/motor/u1.xlsx';
begin
  select count(*) into antes_m from public.orcamentista_motor;
  select md5(string_agg(e::text, '|' order by e.id)) into antes_e from public.orcamentista_familia_etapa e;
  for x in
    select c from unnest(array[
      '42501|' || public.h_criar(etapa, ok_path, p, 'e0000000-0000-0000-0000-000000000002'),
      'P0002|' || public.h_criar('e1000000-0000-0000-0000-0000000000ff', ok_path, p),
      '22023|' || public.h_criar(etapa, 'familia/ALUMINIO/motor/u1.xlsx', p),
      '22023|' || public.h_criar(etapa, 'familia/PVC/motor/../../x.xlsx', p),
      '22023|' || public.h_criar(etapa, 'f1000000-0000-0000-0000-000000000001/motor/x.xlsx', p),
      '22023|' || public.h_criar(etapa, '   ', p),
      '22023|' || public.h_criar(etapa, ok_path, p - 'perfis'),
      '22023|' || public.h_criar(etapa, ok_path, jsonb_set(p, '{regras}', '"x"')),
      '22023|' || public.h_criar(etapa, ok_path, jsonb_set(p, '{itens}', '[{"codigo":"A"}]')),
      '22023|' || public.h_criar(etapa, ok_path, jsonb_set(p, '{detalhes}', '[]')),
      '22023|' || public.h_criar(etapa, ok_path, p #- '{contagens,normalizados}'),
      '22023|' || public.h_criar(etapa, ok_path, null)
    ]) c
  loop
    -- x = 'ESPERADO|' || 'OBTIDO': a primeira parte antes do primeiro '|' e o esperado
    if split_part(x, '|', 1) <> split_part(x, '|', 2) then raise exception 'FALHOU caso V4: esperado %, obtido % (%)', split_part(x, '|', 1), split_part(x, '|', 2), x; end if;
  end loop;
  if (select count(*) from public.orcamentista_motor) <> antes_m then raise exception 'FALHOU caso V4: apareceu motor depois de uma recusa'; end if;
  if (select md5(string_agg(e::text, '|' order by e.id)) from public.orcamentista_familia_etapa e) is distinct from antes_e then raise exception 'FALHOU caso V4: uma etapa mudou depois de uma recusa'; end if;
  raise notice 'ok: caso V4 — as 12 recusas (autor, etapa, pasta, "..", fornecedor, vazio, lista faltando, tipo errado, itens, sem tipologia, sem normalizados, nulo) dizem o codigo certo e nada muda';
end $$;
-- CASO V5 — erro NO MEIO desfaz TUDO: perfil repetido (mesma tipologia e ordem) estoura depois de o motor e das primeiras tabelas
do $$
declare antes_m bigint; antes_p bigint; antes_i bigint; p jsonb; x text;
begin
  select count(*) into antes_m from public.orcamentista_motor;
  select count(*) into antes_p from public.orcamentista_motor_regra where motor_id is not null;
  select count(*) into antes_i from public.orcamentista_importacao;
  p := jsonb_set(public.h_payload(2), '{perfis}', (public.h_payload(2) -> 'perfis') || (public.h_payload(2) -> 'perfis' -> 0));
  x := public.h_criar('e1000000-0000-0000-0000-000000000001', 'familia/PVC/motor/u1.xlsx', p);
  if x not like '23505|%' then raise exception 'FALHOU caso V5: devia estourar a unicidade do perfil (23505): %', x; end if;
  if (select count(*) from public.orcamentista_motor) <> antes_m then raise exception 'FALHOU caso V5: o motor ficou'; end if;
  if (select count(*) from public.orcamentista_motor_regra where motor_id is not null) <> antes_p then raise exception 'FALHOU caso V5: regras ficaram'; end if;
  if (select count(*) from public.orcamentista_importacao) <> antes_i then raise exception 'FALHOU caso V5: a importacao ficou'; end if;
  if (select motor_id from public.orcamentista_familia_etapa where id = 'e1000000-0000-0000-0000-000000000001') is not null then raise exception 'FALHOU caso V5: a etapa ficou apontando'; end if;
  raise notice 'ok: caso V5 — erro no meio da gravacao desfaz tudo: nem motor, nem linhas, nem importacao, nem etapa';
end $$;
-- CASO V6 — NÃO TOCA no que não é dela: depois de criar e trocar, o hash de cada linha das tabelas do motor da Wolff, dos tempos, das tabelas de preço e das matérias-primas é o de antes
do $$
declare n int;
begin
  begin
    perform public.superadmin_criar_motor_da_etapa('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'familia/PVC/motor/u1.xlsx', 'a.xlsx', public.h_payload(3));
    perform public.superadmin_criar_motor_da_etapa('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'familia/PVC/motor/u2.xlsx', 'b.xlsx', public.h_payload(3));
    -- as linhas de ANTES (hash) continuam, todas, e nenhuma delas mudou; as que aparecem a mais são só do motor novo (motor_id diferente do da Wolff)
    select count(*) into n from (
      select 'motor_regra' t, md5(x::text) h from public.orcamentista_motor_regra x where x.motor_id is null or x.motor_id = 'c0000000-0000-0000-0000-0000000000a1' union all
      select 'motor_perfil', md5(x::text) from public.orcamentista_motor_perfil x where x.motor_id is null or x.motor_id = 'c0000000-0000-0000-0000-0000000000a1' union all
      select 'motor_tipologia', md5(x::text) from public.orcamentista_motor_tipologia x where x.motor_id is null or x.motor_id = 'c0000000-0000-0000-0000-0000000000a1' union all
      select 'motor_detalhe', md5(x::text) from public.orcamentista_motor_tipologia_detalhe x where x.motor_id is null or x.motor_id = 'c0000000-0000-0000-0000-0000000000a1' union all
      select 'motor_tempo', md5(x::text) from public.orcamentista_motor_tipologia_tempo x union all
      select 'motor_formula_familia', md5(x::text) from public.orcamentista_motor_formula_familia x where x.motor_id is null or x.motor_id = 'c0000000-0000-0000-0000-0000000000a1' union all
      select 'importacao', md5(x::text) from public.orcamentista_importacao x where x.motor_id is null or x.motor_id = 'c0000000-0000-0000-0000-0000000000a1' union all
      select 'tabela', md5(x::text) from public.orcamentista_tabela x union all
      select 'tabela_item', md5(x::text) from public.orcamentista_tabela_item x union all
      select 'materia_prima', md5(x::text) from public.orcamentista_materia_prima x union all
      select 'motor_wolff', md5(x::text) from public.orcamentista_motor x where x.id = 'c0000000-0000-0000-0000-0000000000a1'
    ) agora full join public.h_foto f on f.t = agora.t and f.h = agora.h where agora.h is null or f.h is null;
    if n <> 0 then raise exception 'FALHOU caso V6: % linha(s) de antes mudaram ou sumiram', n; end if;
    if (select count(*) from public.orcamentista_motor_tipologia_tempo) <> (select count(*) from public.h_foto where t = 'motor_tempo') then raise exception 'FALHOU caso V6: apareceu ou sumiu tempo'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso V6 — criar e trocar nao tocam no motor da Wolff, nos tempos, nas tabelas de preco nem nas materias-primas (hash de cada linha)';
end $$;
-- CASO V7 — fechada: só o service_role executa; SECURITY DEFINER; search_path fixo; o statement_timeout de 35 s só na primeira
do $$
declare f regprocedure;
begin
  foreach f in array array['public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb)'::regprocedure, 'public.superadmin_renomear_materia_prima(uuid, uuid, uuid, text)'::regprocedure] loop
    if has_function_privilege('public', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'FALHOU caso V7: % esta aberta (ou fechada demais)', f; end if;
    if not exists (select 1 from pg_proc p where p.oid = f and p.prosecdef and 'search_path=public, pg_temp' = any (p.proconfig)) then raise exception 'FALHOU caso V7: % sem SECURITY DEFINER ou sem search_path fixo', f; end if;
  end loop;
  if not exists (select 1 from pg_proc p where p.oid = 'public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb)'::regprocedure and 'statement_timeout=35s' = any (p.proconfig)) then raise exception 'FALHOU caso V7: sem o statement_timeout'; end if;
  raise notice 'ok: caso V7 — as duas funcoes so executam para service_role, SECURITY DEFINER com search_path fixo, e a primeira com 35 s';
end $$;
-- CASO V8 — renomear: grava aparado, loga, e só toca a matéria-prima da empresa pedida
do $$
declare r jsonb; antes_b text;
begin
  begin
    select md5(x::text) into antes_b from public.orcamentista_materia_prima x where id = 'c1000000-0000-0000-0000-000000000003';
    r := public.superadmin_renomear_materia_prima('b0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '  Janelas e portas de PVC  ');
    if (select nome from public.orcamentista_materia_prima where id = 'c1000000-0000-0000-0000-000000000001') <> 'Janelas e portas de PVC' then raise exception 'FALHOU caso V8: o nome nao foi gravado aparado'; end if;
    if (r -> 'orcamentista_materia_prima' ->> 'nome') is distinct from 'Janelas e portas de PVC' then raise exception 'FALHOU caso V8: retorno'; end if;
    if (select atualizado_por from public.orcamentista_materia_prima where id = 'c1000000-0000-0000-0000-000000000001') is distinct from 'e0000000-0000-0000-0000-000000000001' then raise exception 'FALHOU caso V8: autoria'; end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_materia_prima' and chave = 'c1000000-0000-0000-0000-000000000001' and tenant_id = 'b0000000-0000-0000-0000-00000000000a'
                     and antes -> 'orcamentista_materia_prima' ->> 'nome' = 'Esquadrias de PVC' and depois -> 'orcamentista_materia_prima' ->> 'nome' = 'Janelas e portas de PVC') then raise exception 'FALHOU caso V8: o log'; end if;
    if (select md5(x::text) from public.orcamentista_materia_prima x where id = 'c1000000-0000-0000-0000-000000000003') <> antes_b then raise exception 'FALHOU caso V8: tocou a materia-prima de OUTRA empresa'; end if;
    -- só a caixa muda: a mesma linha pode se reescrever
    perform public.superadmin_renomear_materia_prima('b0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'JANELAS E PORTAS DE PVC');
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso V8 — renomear grava o nome aparado, loga antes e depois, e nao toca a materia-prima de outra empresa';
end $$;
-- CASO V9 — renomear: as recusas dizem o código certo e nada muda
do $$
declare antes text; x text;
  a uuid := 'b0000000-0000-0000-0000-00000000000a'; b uuid := 'b0000000-0000-0000-0000-00000000000b'; su uuid := 'e0000000-0000-0000-0000-000000000001';
  mp1 uuid := 'c1000000-0000-0000-0000-000000000001'; mp2 uuid := 'c1000000-0000-0000-0000-000000000002'; mp3 uuid := 'c1000000-0000-0000-0000-000000000003';
begin
  select md5(string_agg(m::text, '|' order by m.id)) into antes from public.orcamentista_materia_prima m;
  for x in select c from unnest(array[
      '22023|' || public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', a, su, mp2, 'esquadrias DE pvc')),
      '22023|' || public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', a, su, mp2, '   ')),
      '22023|' || public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', a, su, mp2, repeat('x', 81))),
      '22023|' || public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, NULL)', a, su, mp2)),
      'P0002|' || public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', b, su, mp2, 'Outro')),
      'P0002|' || public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', a, su, 'c1000000-0000-0000-0000-0000000000ff', 'Outro')),
      'P0002|' || public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', 'b0000000-0000-0000-0000-0000000000ff', su, mp2, 'Outro')),
      '42501|' || public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', a, 'e0000000-0000-0000-0000-000000000002', mp2, 'Outro'))
    ]) c loop
    if split_part(x, '|', 1) <> split_part(x, '|', 2) then raise exception 'FALHOU caso V9: esperado %, obtido (%)', split_part(x, '|', 1), x; end if;
  end loop;
  if (select md5(string_agg(m::text, '|' order by m.id)) from public.orcamentista_materia_prima m) is distinct from antes then raise exception 'FALHOU caso V9: uma materia-prima mudou depois de uma recusa'; end if;
  -- a empresa que não existe tem a PRÓPRIA frase (e não a da matéria-prima): quem lê a tela sabe qual das duas faltou
  x := public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', 'b0000000-0000-0000-0000-0000000000ff', su, mp2, 'Outro'));
  if x not like 'P0002|empresa inexistente%' then raise exception 'FALHOU caso V9: empresa inexistente devia dizer isso: %', x; end if;
  x := public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', b, su, mp2, 'Outro'));
  if x not like 'P0002|materia-prima inexistente nesta empresa%' then raise exception 'FALHOU caso V9: a materia-prima de outra empresa devia dizer que nao existe nesta: %', x; end if;
  -- e o contraste: o MESMO nome em OUTRA empresa é permitido (a B tem "Esquadrias de PVC")
  begin
    x := public.h_erro(format('select public.superadmin_renomear_materia_prima(%L, %L, %L, %L)', b, su, mp3, 'Alumínio'));
    if x <> 'ok' then raise exception 'FALHOU caso V9: nome de outra empresa devia ser permitido: %', x; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso V9 — as recusas do renomear (repetido sem olhar a caixa, vazio, 81, nulo, outra empresa, inexistente, autor) dizem o codigo certo; o mesmo nome em outra empresa passa';
end $$;
