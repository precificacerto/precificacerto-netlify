-- Os casos da 20261028000001, sobre o estado de PRODUÇÃO (os mesmos ids) depois da migração aplicada duas vezes.
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

-- CASO M1 — o preenchimento autorizado: as 3 etapas estão na instância "Esquadrias de PVC" da De Paula, com o motor e o número de antes; o log tem o antes e o depois de cada uma
do $$
declare n int;
begin
  if (select count(*) from public.orcamentista_familia_etapa) <> 3
     or exists (select 1 from public.orcamentista_familia_etapa where materia_prima_id <> '79d764fe-4acd-43e2-bed9-38e20667ca3d' or tenant_id <> '20e08592-f957-4e72-b7eb-251387e34eb9') then
    raise exception 'FALHOU caso M1: as etapas nao foram para a instancia da De Paula'; end if;
  -- nada além da instância mudou: id, família, número, rótulo, ação e motor iguais aos de antes
  if exists (select a.id, a.familia, a.numero, a.rotulo, a.acao, a.motor_id from public.h_etapas_antes a
             except select e.id, e.familia, e.numero, e.rotulo, e.acao, e.motor_id from public.orcamentista_familia_etapa e) then
    raise exception 'FALHOU caso M1: outra coisa da etapa mudou'; end if;
  select count(*) into n from public.superadmin_alteracao_log l
   where l.tabela = 'orcamentista_familia_etapa' and l.antes ->> 'migracao' = '20261028000001_familia_instancia_e_catalogo_de_motores'
     and l.antes -> 'orcamentista_familia_etapa' ->> 'materia_prima_id' is null
     and l.depois -> 'orcamentista_familia_etapa' ->> 'materia_prima_id' = '79d764fe-4acd-43e2-bed9-38e20667ca3d'
     and l.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  if n <> 3 then raise exception 'FALHOU caso M1: o log do preenchimento tem % linhas certas (esperado 3)', n; end if;
  if (select count(*) from public.superadmin_alteracao_log l where l.antes ->> 'migracao' = '20261028000001_familia_instancia_e_catalogo_de_motores' and l.tabela = 'orcamentista_familia_etapa') <> 3 then
    raise exception 'FALHOU caso M1: a migracao foi aplicada DUAS vezes e o preenchimento logou de novo'; end if;
  raise notice 'ok: caso M1 — as 3 etapas foram para a instancia da De Paula, nada mais mudou nelas, e o log tem antes e depois de cada uma (uma vez, mesmo aplicada duas)';
end $$;
-- CASO M2 — o motor da Wolff é PERFIL, a vigente saiu (e está no antes do log), fornecedor e categoria são obrigatórios; o conteúdo, os tempos e as matérias-primas não mudaram
do $$
declare n int;
begin
  if (select categoria_chave from public.orcamentista_motor where id = '9a233c55-f377-45d3-b2ae-b1a740a98e44') is distinct from 'PERFIL' then raise exception 'FALHOU caso M2: categoria'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'orcamentista_motor' and column_name = 'vigente') or to_regclass('public.orcamentista_motor_uma_vigente') is not null then
    raise exception 'FALHOU caso M2: a vigente continua'; end if;
  if (select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = '9a233c55-f377-45d3-b2ae-b1a740a98e44'
        and antes -> 'orcamentista_motor' ->> 'vigente' = 'true' and antes -> 'orcamentista_motor' ->> 'categoria_chave' is null
        and depois -> 'orcamentista_motor' ->> 'categoria_chave' = 'PERFIL') <> 1 then raise exception 'FALHOU caso M2: o log do motor'; end if;
  if (select count(*) from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and antes ->> 'migracao' = '20261028000001_familia_instancia_e_catalogo_de_motores') <> 1 then
    raise exception 'FALHOU caso M2: o preenchimento do motor logou mais de uma vez'; end if;
  if public.h_erro($q$insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('PVC', null, 'PERFIL', 'a', 'b')$q$) not like '23502|%'
     or public.h_erro($q$insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('PVC', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', null, 'a', 'b')$q$) not like '23502|%'
     or public.h_erro($q$insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('PVC', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'NAO_EXISTE', 'a', 'b')$q$) not like '23503|%' then
    raise exception 'FALHOU caso M2: fornecedor e categoria (do catalogo) deviam ser obrigatorios'; end if;
  select count(*) into n from (select t, h from public.h_foto
    except select 'motor_detalhe', md5(x::text) from public.orcamentista_motor_tipologia_detalhe x
    except select 'motor_tempo', md5(x::text) from public.orcamentista_motor_tipologia_tempo x
    except select 'materia_prima', md5(x::text) from public.orcamentista_materia_prima x) z;
  if n <> 0 then raise exception 'FALHOU caso M2: % linha(s) do conteudo do motor, dos tempos ou das materias-primas mudaram', n; end if;
  raise notice 'ok: caso M2 — a Wolff e PERFIL, a vigente saiu (o valor dela esta no antes do log), fornecedor e categoria sao obrigatorios, e conteudo, tempos e materias-primas nao mudaram';
end $$;
-- CASO M3 — N famílias PVC na mesma empresa: o índice de uma por conta saiu; a unicidade que fica é o título; cada uma com as SUAS etapas, número 1 nas duas
do $$
declare mp2 uuid; r jsonb;
begin
  begin
    insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('20e08592-f957-4e72-b7eb-251387e34eb9', 'Produção de esquadrias TIPO 2', 2, 'PVC') returning id into mp2;
    if public.h_erro($q$insert into public.orcamentista_materia_prima (tenant_id, nome, ordem, familia) values ('20e08592-f957-4e72-b7eb-251387e34eb9', 'produção de ESQUADRIAS tipo 2', 3, 'PVC')$q$) not like '23505|%' then
      raise exception 'FALHOU caso M3: o titulo repetido (sem olhar a caixa) devia ser recusado'; end if;
    r := public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', mp2,
           '[{"rotulo":"Apanhado da 2","acao":"APANHAR","motor_id":"9a233c55-f377-45d3-b2ae-b1a740a98e44"}]'::jsonb);
    if (select count(*) from public.orcamentista_familia_etapa where materia_prima_id = mp2 and numero = 1) <> 1 then raise exception 'FALHOU caso M3: a etapa 1 da segunda familia'; end if;
    if (select array_agg(numero order by numero) from public.orcamentista_familia_etapa where materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d') <> array[1, 2, 3] then raise exception 'FALHOU caso M3: mexeu na outra familia'; end if;
    if public.h_erro(format($q$insert into public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, rotulo, acao) values ('20e08592-f957-4e72-b7eb-251387e34eb9', %L, 'PVC', 1, 'dup', 'APANHAR')$q$, mp2)) not like '23505|%' then
      raise exception 'FALHOU caso M3: dois numeros 1 na mesma familia'; end if;
    if public.h_erro(format($q$select public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', %L, '[{"id":"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d","rotulo":"roubada","acao":"APANHAR"}]'::jsonb)$q$, mp2)) not like '22023|%o id nao e de uma etapa desta familia%' then
      raise exception 'FALHOU caso M3: a etapa de outra familia devia ser recusada'; end if;
    if (select familia from public.orcamentista_familia_etapa where materia_prima_id = mp2) <> 'PVC' then raise exception 'FALHOU caso M3: familia da etapa nova'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso M3 — duas familias PVC na mesma empresa, cada uma com as suas etapas (numero 1 nas duas); o titulo repetido e recusado';
end $$;
-- CASO M4 — gravar as etapas da instância: editar, reordenar, inserir; o log é da empresa; a família da OUTRA instância não é tocada
do $$
declare r jsonb; antes text;
begin
  begin
    r := public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', '79d764fe-4acd-43e2-bed9-38e20667ca3d',
      '[{"id":"dd8d3526-f08e-47e1-81c3-a6770214516f","rotulo":"Barras primeiro","acao":"CALCULAR_BARRAS"},
        {"id":"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d","rotulo":"Apanhado de esquadrias","acao":"APANHAR","motor_id":null},
        {"id":"ed9a9b06-d898-4f75-8487-e260d8ba8ec0","rotulo":"Levantamento de esquadrias","acao":"GERAR_LEVANTAMENTO"},
        {"rotulo":"Enviar","acao":"ENVIAR"}]'::jsonb);
    if (select array_agg(rotulo order by numero) from public.orcamentista_familia_etapa where materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d')
       <> array['Barras primeiro', 'Apanhado de esquadrias', 'Levantamento de esquadrias', 'Enviar'] then raise exception 'FALHOU caso M4: ordem/rotulos'; end if;
    if (select motor_id from public.orcamentista_familia_etapa where id = 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d') is not null then raise exception 'FALHOU caso M4: null devia limpar o motor'; end if;
    if (select motor_id from public.orcamentista_familia_etapa where id = 'dd8d3526-f08e-47e1-81c3-a6770214516f') is distinct from '9a233c55-f377-45d3-b2ae-b1a740a98e44' then raise exception 'FALHOU caso M4: ausente devia manter o motor'; end if;
    if (select tenant_id from public.orcamentista_familia_etapa where rotulo = 'Enviar') is distinct from '20e08592-f957-4e72-b7eb-251387e34eb9' then raise exception 'FALHOU caso M4: a etapa nova sem a empresa'; end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_etapa' and chave = '79d764fe-4acd-43e2-bed9-38e20667ca3d'
                     and tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' and por = 'e0000000-0000-0000-0000-000000000001') then raise exception 'FALHOU caso M4: o log'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso M4 — editar, reordenar, inserir; null limpa e ausente mantem o motor; a etapa nova leva a empresa; o log e da empresa';
end $$;
-- CASO M5 — as recusas de gravar as etapas: código certo e nada muda
do $$
declare antes text; x text; casos text[];
  T text := '20e08592-f957-4e72-b7eb-251387e34eb9'; MP text := '79d764fe-4acd-43e2-bed9-38e20667ca3d'; SU text := 'e0000000-0000-0000-0000-000000000001';
  todas text := '{"id":"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d","rotulo":"a","acao":"APANHAR"},{"id":"ed9a9b06-d898-4f75-8487-e260d8ba8ec0","rotulo":"b","acao":"APANHAR"},{"id":"dd8d3526-f08e-47e1-81c3-a6770214516f","rotulo":"c","acao":"APANHAR"}';
  g text := 'select public.superadmin_gravar_etapas_da_materia_prima(%L, %L, %L, %L::jsonb)';
  motor_alu uuid; motor_arq uuid;
begin
  insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('ALUMINIO', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERFIL', 'alu.xlsx', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/alu.xlsx') returning id into motor_alu;
  insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path, arquivado_em) values ('PVC', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERFIL', 'velho.xlsx', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/velho.xlsx', now()) returning id into motor_arq;
  select md5(string_agg(e::text, '|' order by e.id)) into antes from public.orcamentista_familia_etapa e;
  x := public.h_erro(format(g, T, SU, MP, '[' || todas || ',{"rotulo":"d","acao":"APANHAR","motor_id":"' || motor_arq || '"}]'));
  if x not like '22023|%o motor esta arquivado%' then raise exception 'FALHOU caso M5: o motor arquivado: %', x; end if;
  foreach x in array array[
    '42501|' || public.h_erro(format(g, T, 'e0000000-0000-0000-0000-000000000002', MP, '[' || todas || ']')),
    'P0002|' || public.h_erro(format(g, 'b0000000-0000-0000-0000-00000000000b', SU, MP, '[' || todas || ']')),
    'P0002|' || public.h_erro(format(g, 'b0000000-0000-0000-0000-0000000000ff', SU, MP, '[' || todas || ']')),
    '22023|' || public.h_erro(format(g, 'b0000000-0000-0000-0000-00000000000b', SU, 'c1000000-0000-0000-0000-00000000000b', '[{"rotulo":"x","acao":"APANHAR"}]')),
    '22023|' || public.h_erro(format(g, T, SU, MP, '[{"id":"bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d","rotulo":"a","acao":"APANHAR"}]')),
    '22023|' || public.h_erro(format(g, T, SU, MP, '[' || todas || ',{"rotulo":"d","acao":"APANHAR","motor_id":"' || motor_alu || '"}]')),
    '22023|' || public.h_erro(format(g, T, SU, MP, '[' || todas || ',{"rotulo":"d","acao":"NAO"}]')),
    '22023|' || public.h_erro(format(g, T, SU, MP, '[' || todas || ',{"rotulo":"d","acao":"APANHAR","motor_id":"00000000-0000-0000-0000-000000000000"}]'))
  ] loop
    if split_part(x, '|', 1) <> split_part(x, '|', 2) then raise exception 'FALHOU caso M5: esperado %, obtido (%)', split_part(x, '|', 1), x; end if;
  end loop;
  -- o motor de outro TIPO é recusado nomeando os dois tipos; a família sem tipo diz que falta a família
  x := public.h_erro(format(g, T, SU, MP, '[' || todas || ',{"rotulo":"d","acao":"APANHAR","motor_id":"' || motor_alu || '"}]'));
  if x not like '%o motor e do tipo ALUMINIO, e a familia e do tipo PVC%' then raise exception 'FALHOU caso M5: a frase do tipo: %', x; end if;
  x := public.h_erro(format(g, 'b0000000-0000-0000-0000-00000000000b', SU, 'c1000000-0000-0000-0000-00000000000b', '[{"rotulo":"x","acao":"APANHAR"}]'));
  if x not like '%nao tem familia%' then raise exception 'FALHOU caso M5: a frase da familia sem tipo: %', x; end if;
  if (select md5(string_agg(e::text, '|' order by e.id)) from public.orcamentista_familia_etapa e) is distinct from antes then raise exception 'FALHOU caso M5: uma etapa mudou depois de uma recusa'; end if;
  delete from public.orcamentista_motor where id in (motor_alu, motor_arq);
  raise notice 'ok: caso M5 — motor arquivado, autor, materia-prima de outra empresa, empresa inexistente, familia sem tipo, remover etapa, motor de outro tipo, acao fora da lista e motor inexistente: codigo certo e nada muda';
end $$;
-- CASO M6 — o motor nasce no CATÁLOGO: fornecedor, categoria e tipo; a pasta é a do fornecedor; não aponta etapa nenhuma; Wolf pode ter PERFIL e PERSIANAS ao mesmo tempo
do $$
declare r jsonb; m uuid; antes_e text;
begin
  begin
    select md5(string_agg(e::text, '|' order by e.id)) into antes_e from public.orcamentista_familia_etapa e;
    r := public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERSIANAS', 'PVC',
           '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/u1-persiana.xlsx', ' persiana.xlsx ', public.h_payload(2));
    m := (r ->> 'motor_id')::uuid;
    if not exists (select 1 from public.orcamentista_motor where id = m and familia = 'PVC' and fornecedor_id = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654' and categoria_chave = 'PERSIANAS'
                     and arquivo_nome = 'persiana.xlsx' and arquivado_em is null and criado_por = 'e0000000-0000-0000-0000-000000000001') then raise exception 'FALHOU caso M6: a linha do motor'; end if;
    if (select count(*) from public.orcamentista_motor where fornecedor_id = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654' and familia = 'PVC' and arquivado_em is null) <> 2 then raise exception 'FALHOU caso M6: PERFIL e PERSIANAS da mesma Wolf'; end if;
    if (select count(*) from public.orcamentista_motor_tipologia_detalhe where motor_id = m) <> 2 or (select count(*) from public.orcamentista_motor_regra where motor_id = m) <> 2
       or (r ->> 'perfis')::int <> 2 or (r ->> 'otimizacao')::int <> 1 then raise exception 'FALHOU caso M6: o conteudo'; end if;
    if not exists (select 1 from public.orcamentista_importacao where motor_id = m and tabela_id is null) then raise exception 'FALHOU caso M6: a importacao'; end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = m::text and tenant_id is null and antes is null) then raise exception 'FALHOU caso M6: o log'; end if;
    if (select md5(string_agg(e::text, '|' order by e.id)) from public.orcamentista_familia_etapa e) is distinct from antes_e then raise exception 'FALHOU caso M6: o motor apontou etapa'; end if;
    if public.h_conta_tempo(m) <> 0 then raise exception 'FALHOU caso M6: nasceu com tempo'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso M6 — o motor nasce no catalogo com fornecedor, categoria e tipo, sem apontar etapa, sem tempo; a Wolf tem PERFIL e PERSIANAS ao mesmo tempo';
end $$;
-- CASO M7 — as recusas de criar motor: código certo e nenhum motor aparece
do $$
declare antes bigint; x text; p jsonb := public.h_payload(1);
  W text := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; ok_path text := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/u1.xlsx';
  g text := 'select public.superadmin_criar_motor(%L, %L, %L, %L, %L, %L, %L::jsonb)';
begin
  select count(*) into antes from public.orcamentista_motor;
  foreach x in array array[
    '42501|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000002', W, 'PERFIL', 'PVC', ok_path, 'a.xlsx', p::text)),
    'P0002|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000ff', 'PERFIL', 'PVC', 'f0000000-0000-0000-0000-0000000000ff/motor/u.xlsx', 'a.xlsx', p::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'NAO_EXISTE', 'PVC', ok_path, 'a.xlsx', p::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, null, 'PVC', ok_path, 'a.xlsx', p::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'NAO', ok_path, 'a.xlsx', p::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'PVC', 'f2000000-0000-0000-0000-000000000002/motor/u.xlsx', 'a.xlsx', p::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'PVC', W || '/motor/../../x.xlsx', 'a.xlsx', p::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'PVC', 'familia/PVC/motor/u.xlsx', 'a.xlsx', p::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'PVC', ok_path, 'a.xlsx', (p - 'perfis')::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'PVC', ok_path, 'a.xlsx', jsonb_set(p, '{detalhes}', '[]')::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'PVC', ok_path, '  ', p::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'PVC', ok_path, 'a.xlsx', jsonb_set(p, '{itens}', '[{"codigo":"X"}]')::text)),
    '22023|' || public.h_erro(format(g, 'e0000000-0000-0000-0000-000000000001', W, 'PERFIL', 'PVC', ok_path, 'a.xlsx', jsonb_set(p, '{contagens}', '{}')::text))
  ] loop
    if split_part(x, '|', 1) <> split_part(x, '|', 2) then raise exception 'FALHOU caso M7: esperado %, obtido (%)', split_part(x, '|', 1), x; end if;
  end loop;
  if (select count(*) from public.orcamentista_motor) <> antes then raise exception 'FALHOU caso M7: apareceu motor depois de uma recusa'; end if;
  raise notice 'ok: caso M7 — autor, fornecedor inexistente, categoria fora da lista ou nula, tipo fora da lista, pasta de outro fornecedor, "..", pasta da familia, lista faltando, sem tipologia, nome vazio, itens de preco, sem normalizados: codigo certo e nenhum motor';
end $$;
-- CASO M8 — arquivar: recusa o motor que uma etapa aponta, NOMEANDO a empresa e a família (o título); sem etapa, arquiva; sem vigente
do $$
declare x text; m uuid;
begin
  begin
    x := public.h_erro($q$select public.superadmin_arquivar_motor('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'e0000000-0000-0000-0000-000000000001')$q$);
    if x not like '22023|%da familia "Esquadrias de PVC" da empresa Esquadrias De Paula Ltda (e de mais 2)%' then raise exception 'FALHOU caso M8: a recusa: %', x; end if;
    insert into public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path) values ('PVC', 'f2000000-0000-0000-0000-000000000002', 'PERSIANAS', 'r.xlsx', 'f2000000-0000-0000-0000-000000000002/motor/r.xlsx') returning id into m;
    x := public.h_erro(format('select public.superadmin_arquivar_motor(%L, %L)', m, 'e0000000-0000-0000-0000-000000000001'));
    if x <> 'ok' or (select arquivado_em from public.orcamentista_motor where id = m) is null then raise exception 'FALHOU caso M8: arquivar sem etapa: %', x; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso M8 — arquivar recusa o motor que etapas apontam, nomeando a familia e a empresa (e as outras); sem etapa arquiva';
end $$;
-- CASO M9 — trocar o TIPO da família que tem etapas é recusa nomeada (função) e erro de FK (banco); sem etapas, troca; duas do mesmo tipo podem
do $$
declare x text;
begin
  begin
    x := public.h_erro($q$select public.superadmin_definir_familia_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', '79d764fe-4acd-43e2-bed9-38e20667ca3d', 'ALUMINIO')$q$);
    if x not like '22023|a familia "Esquadrias de PVC" tem 3 etapa(s) cadastrada(s)%' then raise exception 'FALHOU caso M9: a recusa: %', x; end if;
    x := public.h_erro($q$select public.superadmin_definir_familia_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', '79d764fe-4acd-43e2-bed9-38e20667ca3d', null)$q$);
    if x not like '22023|%' then raise exception 'FALHOU caso M9: limpar o tipo com etapas devia ser recusado: %', x; end if;
    -- a mesma, pela porta do banco: a FK composta segura
    x := public.h_erro($q$update public.orcamentista_materia_prima set familia = 'ALUMINIO' where id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'$q$);
    if x not like '23503|%' then raise exception 'FALHOU caso M9: a FK devia segurar: %', x; end if;
    -- o MESMO tipo não é troca
    x := public.h_erro($q$select public.superadmin_definir_familia_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', '79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC')$q$);
    if x <> 'ok' then raise exception 'FALHOU caso M9: o mesmo tipo: %', x; end if;
    -- sem etapas: a da B ganha PVC — e a De Paula já tem PVC: duas empresas, e na mesma empresa também (caso M3)
    x := public.h_erro($q$select public.superadmin_definir_familia_da_materia_prima('b0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-00000000000b', 'PVC')$q$);
    if x <> 'ok' then raise exception 'FALHOU caso M9: sem etapas devia trocar: %', x; end if;
    if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_materia_prima' and chave = 'c1000000-0000-0000-0000-00000000000b'
                     and tenant_id = 'b0000000-0000-0000-0000-00000000000b' and antes -> 'orcamentista_materia_prima' ->> 'familia' is null
                     and depois -> 'orcamentista_materia_prima' ->> 'familia' = 'PVC') then raise exception 'FALHOU caso M9: o log da troca'; end if;
    x := public.h_erro($q$select public.superadmin_definir_familia_da_materia_prima('b0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', '79d764fe-4acd-43e2-bed9-38e20667ca3d', 'PVC')$q$);
    if x not like 'P0002|%' then raise exception 'FALHOU caso M9: a materia-prima de outra empresa: %', x; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso M9 — trocar ou limpar o tipo de quem tem etapas e recusa nomeada (e a FK segura pela porta do banco); o mesmo tipo e sem etapas passam, com log; a de outra empresa nao se acha';
end $$;
-- CASO M10 — remover a família: o CASCADE leva as etapas e o log do antes diz quais eram
do $$
begin
  begin
    perform public.superadmin_remover_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', '79d764fe-4acd-43e2-bed9-38e20667ca3d');
    if exists (select 1 from public.orcamentista_familia_etapa) then raise exception 'FALHOU caso M10: as etapas ficaram'; end if;
    if (select jsonb_array_length(antes -> 'orcamentista_familia_etapa') from public.superadmin_alteracao_log
         where tabela = 'orcamentista_materia_prima' and chave = '79d764fe-4acd-43e2-bed9-38e20667ca3d' order by em desc limit 1) is distinct from 3 then
      raise exception 'FALHOU caso M10: o log do antes nao tem as 3 etapas'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso M10 — remover a familia leva as etapas, e o log do antes as tem';
end $$;
-- CASO M11 — fechadas: só service_role; SECURITY DEFINER; search_path fixo; as antigas não existem; criar com 35 s
do $$
declare f text;
begin
  foreach f in array array['public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)', 'public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)',
                           'public.superadmin_arquivar_motor(uuid, uuid)', 'public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text)', 'public.superadmin_remover_materia_prima(uuid, uuid, uuid)'] loop
    if has_function_privilege('public', f::regprocedure, 'EXECUTE') or has_function_privilege('anon', f::regprocedure, 'EXECUTE') or has_function_privilege('authenticated', f::regprocedure, 'EXECUTE')
       or not has_function_privilege('service_role', f::regprocedure, 'EXECUTE')
       or not exists (select 1 from pg_proc p where p.oid = f::regprocedure and p.prosecdef and 'search_path=public, pg_temp' = any (p.proconfig)) then
      raise exception 'FALHOU caso M11: % aberta ou sem definer/search_path', f; end if;
  end loop;
  if to_regprocedure('public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)') is not null or to_regprocedure('public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb)') is not null then
    raise exception 'FALHOU caso M11: funcao antiga'; end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)'::regprocedure and 'statement_timeout=35s' = any (p.proconfig)) then
    raise exception 'FALHOU caso M11: 35 s'; end if;
  raise notice 'ok: caso M11 — as cinco fechadas, SECURITY DEFINER com search_path fixo, as duas antigas fora, e criar_motor com 35 s';
end $$;
