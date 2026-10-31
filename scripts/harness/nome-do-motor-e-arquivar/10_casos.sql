-- Os casos da 20261029000005, sobre o estado de PRODUÇÃO de 29/10/2026 (os mesmos ids), com a migração aplicada duas vezes.
-- Cada caso desfaz o que fez (P0099). `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.
-- Os casos K são a TRAVA (DML direto, como postgres); os F são as funções.
create or replace function public.h_erro(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text; con text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics msg = message_text, cod = returned_sqlstate, con = constraint_name;
  return cod || '|' || coalesce(con, '') || '|' || msg;
end $f$;
create or replace function public.h_payload(n int) returns jsonb language sql as $f$
  select jsonb_build_object(
    'regras', (select coalesce(jsonb_agg(jsonb_build_object('codigo', 'C' || i, 'descricao', 'regra', 'linha', 'EUROPA 42', 'tipo', 'Perfil', 'tipologias', jsonb_build_array('T' || i))), '[]'::jsonb) from generate_series(1, n) i),
    'tipologias', (select coalesce(jsonb_agg(jsonb_build_object('tipologia', 'T' || i, 'linha', 'EUROPA 42', 'n_regras', 1, 'n_condicionais', 0, 'variaveis', jsonb_build_array('L'))), '[]'::jsonb) from generate_series(1, n) i),
    'formulas', jsonb_build_array(jsonb_build_object('linha', 'EUROPA 42', 'linha_original', 'PVC EUROPA 42', 'variavel', 'HFOL', 'formula', '(H-10)')),
    'detalhes', (select coalesce(jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'EUROPA 42', 'tipologia', 'T' || i, 'descricao', 'Janela ' || i, 'tipo', 'Correr')), '[]'::jsonb) from generate_series(1, n) i),
    'formulas_da_tipologia', '[]'::jsonb, 'perfis', '[]'::jsonb,
    'vidros', '[]'::jsonb, 'baguetes', '[]'::jsonb, 'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb,
    'otimizacao', '[]'::jsonb, 'avisos', '[]'::jsonb, 'contagens', jsonb_build_object('normalizados', 0))
$f$;
-- um motor direto nas tabelas (da Roller Star), com nome e famílias
create or replace function public.h_motor(p_nome text, p_familias text[], p_forn uuid default 'f2000000-0000-0000-0000-000000000002') returns uuid language plpgsql as $f$
declare m uuid;
begin
  insert into public.orcamentista_motor (fornecedor_id, categoria_chave, nome, arquivo_nome, arquivo_path)
  values (p_forn, 'PERSIANAS', p_nome, 'm.xlsx', p_forn::text || '/motor/' || gen_random_uuid() || '.xlsx') returning id into m;
  insert into public.orcamentista_motor_familia (motor_id, familia) select m, f from unnest(p_familias) f;
  return m;
end $f$;
create or replace function public.h_sql_etapa(p_mp uuid, p_fam text, p_num int, p_motor uuid, p_exigida text) returns text language sql as $f$
  select format('insert into public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, rotulo, acao, motor_id, motor_familia_exigida)
                 values (%L, %L, %L, %s, %L, %L, %L, %L)', '20e08592-f957-4e72-b7eb-251387e34eb9', p_mp, p_fam, p_num, 'Etapa ' || p_num, 'APANHAR', p_motor, p_exigida)
$f$;
create or replace function public.h_sql_item(p_ordem int, p_fam text, p_motor uuid, p_exigida text) returns text language sql as $f$
  select format('insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, familia, motor_id, motor_familia_exigida)
                 values (%L, %L, %s, %L, %L, %L, %L)', '20e08592-f957-4e72-b7eb-251387e34eb9', '1e000000-0000-0000-0000-000000000001', p_ordem, 'P-' || p_ordem, p_fam, p_motor, p_exigida)
$f$;
create or replace function public.h_estado() returns text language sql as $f$
  select md5(coalesce((select string_agg(m::text, '|' order by m.id) from public.orcamentista_motor m), '') || '#'
          || coalesce((select string_agg(l::text, '|' order by l.motor_id, l.familia) from public.orcamentista_motor_familia l), '') || '#'
          || coalesce((select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e), '') || '#'
          || coalesce((select string_agg(i::text, '|' order by i.id) from public.orcamentista_levantamento_item i), '') || '#'
          || (select count(*) from public.superadmin_alteracao_log)::text)
$f$;
create or replace function public.h_pvc() returns uuid language sql as $f$ select '79d764fe-4acd-43e2-bed9-38e20667ca3d'::uuid $f$;
create or replace function public.h_al() returns uuid language sql as $f$ select 'a1000000-0000-0000-0000-0000000000a1'::uuid $f$;

-- CASO M1 — aplicada DUAS vezes sobre o estado de produção: o motor da Wolff se chama "Motor_Wolf_PVC" (o arquivo sem a extensão) e nada mais dele
-- muda; etapas, itens e ligações intactos; o log tem EXATAMENTE 1 linha nova (o semeio, com antes sem nome e depois com ele); a estrutura no lugar
do $$
declare n int; WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44';
begin
  if (select nome from public.orcamentista_motor where id = WM) is distinct from 'Motor_Wolf_PVC' then raise exception 'FALHOU caso M1: o nome semeado'; end if;
  if exists (select to_jsonb(m) - 'nome' from public.orcamentista_motor m except select to_jsonb(a) from public.h_motor_antes_da_000005 a)
     or (select count(*) from public.orcamentista_motor) <> (select count(*) from public.h_motor_antes_da_000005) then raise exception 'FALHOU caso M1: o motor mudou'; end if;
  if exists (select to_jsonb(e) from public.orcamentista_familia_etapa e except select to_jsonb(a) from public.h_etapas_antes_da_000005 a)
     or (select count(*) from public.orcamentista_familia_etapa) <> 3 then raise exception 'FALHOU caso M1: as etapas mudaram'; end if;
  if exists (select to_jsonb(i) from public.orcamentista_levantamento_item i except select to_jsonb(a) from public.h_itens_antes_da_000005 a)
     or exists (select * from public.orcamentista_motor_familia except select * from public.h_ligacoes_antes_da_000005) then raise exception 'FALHOU caso M1: itens ou ligacoes'; end if;
  select count(*) into n from public.superadmin_alteracao_log l
   where l.tabela = 'orcamentista_motor' and l.chave = WM::text and l.por is null and l.tenant_id is null
     and l.antes ->> 'migracao' = '20261029000005_nome_do_motor_e_arquivar_em_uso'
     and l.antes -> 'orcamentista_motor' ? 'nome' and l.antes -> 'orcamentista_motor' ->> 'nome' is null and l.depois -> 'orcamentista_motor' ->> 'nome' = 'Motor_Wolf_PVC';
  if n <> 1 or (select count(*) from public.superadmin_alteracao_log) - (select h.n from public.h_log_antes_da_000005 h) <> 1 then raise exception 'FALHOU caso M1: o log (%)', n; end if;
  if (select count(*) from pg_constraint where conname like '%_motor_exigida_fkey' and confdeltype = 'n') <> 2
     or not exists (select 1 from pg_constraint where conname = 'orcamentista_motor_nome_forma')
     or not exists (select 1 from pg_indexes where indexname = 'orcamentista_motor_nome_ativo') then raise exception 'FALHOU caso M1: a estrutura'; end if;
  raise notice 'ok: caso M1 — aplicada duas vezes: o motor da Wolff se chama Motor_Wolf_PVC; nada mais muda; 1 linha de log (o semeio)';
end $$;

-- CASO K1 — a FORMA do nome (a CHECK, como o rótulo da etapa): vazio, espaço na ponta e 81 caracteres são recusados; nulo é NOT NULL; 80 passa
do $$
declare r1 text; r2 text; r3 text; r4 text; r5 text;
  g text := $q$insert into public.orcamentista_motor (fornecedor_id, categoria_chave, nome, arquivo_nome, arquivo_path) values ('f2000000-0000-0000-0000-000000000002', 'PERSIANAS', %s, 'm.xlsx', 'f2000000-0000-0000-0000-000000000002/motor/x.xlsx')$q$;
begin
  r1 := public.h_erro(format(g, quote_literal('')));
  r2 := public.h_erro(format(g, quote_literal(' Roller')));
  r3 := public.h_erro(format(g, quote_literal(repeat('a', 81))));
  r4 := public.h_erro(format(g, 'null'));
  begin
    r5 := public.h_erro(format(g, quote_literal(repeat('a', 80))));
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  if r1 not like '23514|orcamentista_motor_nome_forma|%' or r2 not like '23514|orcamentista_motor_nome_forma|%' or r3 not like '23514|orcamentista_motor_nome_forma|%'
     or r4 not like '23502|%' or r5 <> 'ok' then raise exception 'FALHOU caso K1: % / % / % / % / %', r1, r2, r3, r4, r5; end if;
  raise notice 'ok: caso K1 — o nome: vazio, espaco na ponta e 81 caracteres recusados pela CHECK; nulo pelo NOT NULL; 80 passa';
end $$;

-- CASO K2 — o nome é ÚNICO entre os ATIVOS do fornecedor: o segundo ativo igual é 23505; de outro fornecedor, ou com o primeiro arquivado, passa
do $$
declare r1 text; r2 text; r3 text; m uuid;
begin
  begin
    m := public.h_motor('Roller persiana', array['PVC']);
    r1 := public.h_erro($q$select public.h_motor('Roller persiana', array['PVC'])$q$);
    r2 := public.h_erro($q$select public.h_motor('Roller persiana', array['PVC'], '44c5c0fe-a0d3-4aab-802d-20a6eff3f654')$q$);
    update public.orcamentista_motor set arquivado_em = now() where id = m;
    r3 := public.h_erro($q$select public.h_motor('Roller persiana', array['PVC'])$q$);
    if r1 not like '23505|orcamentista_motor_nome_ativo|%' or r2 <> 'ok' or r3 <> 'ok' then raise exception 'FALHOU caso K2: % / % / %', r1, r2, r3; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K2 — o nome se repete so fora dos ativos do fornecedor: o segundo ativo igual e 23505; outro fornecedor e o arquivado liberam';
end $$;

-- CASO K3 — A FK DA ETAPA E DO ITEM É ON DELETE SET NULL, e anula AS DUAS colunas: apagar a ligação (motor, ALUMINIO) que uma etapa e um item usam
-- deixa os dois SEM motor e SEM exigida, e a CHECK "a exigida existe se e só se há motor" continua satisfeita; a outra família do motor fica
do $$
declare m uuid; r text;
begin
  begin
    m := public.h_motor('Dois', array['PVC', 'ALUMINIO']);
    perform public.h_erro(public.h_sql_etapa(public.h_al(), 'ALUMINIO', 1, m, 'ALUMINIO'));
    perform public.h_erro(public.h_sql_etapa(public.h_pvc(), 'PVC', 10, m, 'PVC'));
    perform public.h_erro(public.h_sql_item(2, 'ALUMINIO', m, 'ALUMINIO'));
    r := public.h_erro(format($q$delete from public.orcamentista_motor_familia where motor_id = %L and familia = 'ALUMINIO'$q$, m));
    if r <> 'ok' then raise exception 'FALHOU caso K3: o delete (%)', r; end if;
    if exists (select 1 from public.orcamentista_familia_etapa where materia_prima_id = public.h_al() and (motor_id is not null or motor_familia_exigida is not null))
       or exists (select 1 from public.orcamentista_levantamento_item where ordem = 2 and (motor_id is not null or motor_familia_exigida is not null))
       or not exists (select 1 from public.orcamentista_levantamento_item where ordem = 2)
       or (select motor_id from public.orcamentista_familia_etapa where materia_prima_id = public.h_pvc() and numero = 10) is distinct from m then
      raise exception 'FALHOU caso K3: as linhas'; end if;
    -- a CHECK continua: escrever só uma das duas colunas segue recusado
    r := public.h_erro(format($q$update public.orcamentista_familia_etapa set motor_id = %L where materia_prima_id = %L$q$, m, public.h_al()));
    if r not like '23514|orcamentista_familia_etapa_motor_familia_exigida|%' then raise exception 'FALHOU caso K3: a CHECK (%)', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso K3 — apagar a ligacao em uso: a etapa e o item ficam sem motor e sem exigida (SET NULL nas duas colunas); a CHECK segue valendo';
end $$;

-- CASO F1 — CRIAR com nome: grava o nome e o loga; recusa com frase o nome nulo, vazio, com espaço na ponta, de 81, e o de outro motor ATIVO do
-- fornecedor (o da Wolff!) — sem mudar nada; o nome de um ARQUIVADO passa
do $$
declare e text := public.h_estado(); r jsonb; m uuid; rs text[] := '{}'; x text; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654';
  g text := $q$select public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'PERFIL', array['PVC'], %s, '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/n.xlsx', 'n.xlsx', public.h_payload(1))$q$;
begin
  foreach x in array array['null', quote_literal(''), quote_literal(' Novo'), quote_literal(repeat('a', 81))] loop
    rs := rs || public.h_erro(format(g, x));
  end loop;
  if exists (select 1 from unnest(rs) z where z <> '22023||o nome do motor tem de 1 a 80 caracteres, sem espaco nas pontas. Nada foi gravado.') then raise exception 'FALHOU caso F1: forma (%)', rs; end if;
  x := public.h_erro(format(g, quote_literal('Motor_Wolf_PVC')));
  if x <> '22023||ja existe um motor ativo "Motor_Wolf_PVC" deste fornecedor: o nome nao se repete entre os motores ativos. Nada foi gravado.' then raise exception 'FALHOU caso F1: repetido (%)', x; end if;
  if public.h_estado() <> e then raise exception 'FALHOU caso F1: algo mudou'; end if;
  begin
    r := public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', W, 'PERFIL', array['PVC'], 'Wolf Europa 2027', W::text || '/motor/n.xlsx', 'n.xlsx', public.h_payload(1));
    m := (r ->> 'motor_id')::uuid;
    if (select nome from public.orcamentista_motor where id = m) <> 'Wolf Europa 2027'
       or not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = m::text and depois -> 'orcamentista_motor' ->> 'nome' = 'Wolf Europa 2027') then
      raise exception 'FALHOU caso F1: o nome gravado'; end if;
    update public.orcamentista_motor set arquivado_em = now() where id = m;
    perform public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', W, 'PERFIL', array['PVC'], 'Wolf Europa 2027', W::text || '/motor/o.xlsx', 'o.xlsx', public.h_payload(1));
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F1 — criar: o nome gravado e logado; nulo, vazio, ponta, 81 e o de outro ativo recusados com frase; o de um arquivado passa';
end $$;

-- CASO F2 — EDITAR o NOME do motor da Wolff (COM uso: 3 etapas) passa, com antes e depois no log; o mesmo nome e as mesmas famílias é "nada mudou";
-- o nome de outro ATIVO do fornecedor é recusa; categoria com uso segue recusada; nada muda nas recusas
do $$
declare WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; p text; e text; r1 text; r2 text; r3 text;
begin
  select arquivo_path into p from public.orcamentista_motor where id = WM;
  begin
    perform public.h_motor('Outro da Wolf', array['PVC'], W);
    e := public.h_estado();
    r1 := public.h_erro(format($q$select public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', %L, %L, 'PERFIL', array['PVC'], 'Motor_Wolf_PVC', %L)$q$, WM, W, p));
    r2 := public.h_erro(format($q$select public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', %L, %L, 'PERFIL', array['PVC'], 'Outro da Wolf', %L)$q$, WM, W, p));
    r3 := public.h_erro(format($q$select public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', %L, %L, 'PERSIANAS', array['PVC'], 'Motor_Wolf_PVC', %L)$q$, WM, W, p));
    if r1 <> '22023||nada mudou: o fornecedor, a categoria, as familias e o nome sao os de agora. Nada foi gravado.'
       or r2 <> '22023||ja existe um motor ativo "Outro da Wolf" deste fornecedor: o nome nao se repete entre os motores ativos. Nada foi gravado.'
       or r3 not like '22023||o motor tem uso (3 etapa(s), 0 item(ns) de levantamento): categoria e fornecedor so se editam em motor sem uso (as familias e o nome se editam com uso).%'
       or public.h_estado() <> e then raise exception 'FALHOU caso F2: % / % / %', r1, r2, r3; end if;
    perform public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', WM, W, 'PERFIL', array['PVC'], 'Wolf PVC Europa', p);
    if (select nome || categoria_chave || arquivo_path from public.orcamentista_motor where id = WM) <> 'Wolf PVC Europa' || 'PERFIL' || p
       or (select count(*) from public.orcamentista_familia_etapa where motor_id = WM) <> 3
       or not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = WM::text
                        and antes -> 'orcamentista_motor' ->> 'nome' = 'Motor_Wolf_PVC' and depois -> 'orcamentista_motor' ->> 'nome' = 'Wolf PVC Europa') then
      raise exception 'FALHOU caso F2: renomear'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F2 — editar o nome COM uso passa (log antes e depois); nada mudou, nome de outro ativo e categoria com uso recusados';
end $$;

-- CASO F3 — ARQUIVAR o motor da Wolff, EM USO pelas 3 etapas: arquiva; as 3 ficam SEM motor e SEM exigida, cada uma com antes e depois no log, com o
-- tenant dela; a função devolve as 3 (empresa / família / número / rótulo), na ordem; o ITEM com o motor NÃO é tocado; apontar o arquivado é recusa
do $$
declare WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; T uuid := '20e08592-f957-4e72-b7eb-251387e34eb9'; r jsonb; n0 int; x text;
begin
  begin
    perform public.h_erro(public.h_sql_item(2, 'PVC', WM, 'PVC'));
    n0 := (select count(*) from public.superadmin_alteracao_log);
    r := public.superadmin_arquivar_motor(WM, 'e0000000-0000-0000-0000-000000000001');
    if (select arquivado_em from public.orcamentista_motor where id = WM) is null then raise exception 'FALHOU caso F3: nao arquivou'; end if;
    if exists (select 1 from public.orcamentista_familia_etapa where motor_id is not null or motor_familia_exigida is not null) then raise exception 'FALHOU caso F3: etapa com motor'; end if;
    if (select string_agg(format('%s/%s/%s/%s', e ->> 'empresa', e ->> 'familia', e ->> 'numero', e ->> 'rotulo'), ' | ' order by ord) from jsonb_array_elements(r -> 'etapas_sem_motor') with ordinality z(e, ord))
       <> 'Esquadrias De Paula Ltda/Esquadrias de PVC WOLF/1/Apanhado de esquadrias | Esquadrias De Paula Ltda/Esquadrias de PVC WOLF/2/Levantamento de esquadrias | Esquadrias De Paula Ltda/Esquadrias de PVC WOLF/3/Relação de barras e materiais' then
      raise exception 'FALHOU caso F3: a lista devolvida (%)', r -> 'etapas_sem_motor'; end if;
    if (select count(*) from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_familia_etapa' and l.tenant_id = T and l.antes ->> 'arquivamento_do_motor' = WM::text
          and l.antes -> 'orcamentista_familia_etapa' ->> 'motor_id' = WM::text and l.depois -> 'orcamentista_familia_etapa' ->> 'motor_id' is null) <> 3
       or (select count(*) from public.superadmin_alteracao_log) - n0 <> 4 then raise exception 'FALHOU caso F3: o log'; end if;
    if (select motor_id from public.orcamentista_levantamento_item where ordem = 2) is distinct from WM then raise exception 'FALHOU caso F3: o item foi tocado'; end if;
    x := public.h_erro(format($q$select public.superadmin_gravar_etapas_da_materia_prima(%L, 'e0000000-0000-0000-0000-000000000001', %L,
           (select jsonb_agg(jsonb_build_object('id', e.id, 'rotulo', e.rotulo, 'acao', e.acao, 'motor_id', %L::uuid) order by e.numero) from public.orcamentista_familia_etapa e where e.materia_prima_id = %L))$q$,
           T, public.h_pvc(), WM, public.h_pvc()));
    if x not like '22023||etapa 1: o motor esta arquivado' then raise exception 'FALHOU caso F3: apontar o arquivado (%)', x; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F3 — arquivar em uso: as 3 etapas sem motor (log por etapa, com o tenant), a lista devolvida em ordem; o item intocado';
end $$;

-- CASO F4 — arquivar recusa sem mudar nada: motor inexistente (P0002), já arquivado, autor comum (42501); o motor SEM uso devolve a lista vazia
do $$
declare e text; r1 text; r2 text; r3 text; m uuid; r jsonb;
begin
  begin
    m := public.h_motor('Sem uso', array['PVC']);
    e := public.h_estado();
    r1 := public.h_erro($q$select public.superadmin_arquivar_motor('00000000-0000-4000-8000-0000000000ff', 'e0000000-0000-0000-0000-000000000001')$q$);
    r3 := public.h_erro(format($q$select public.superadmin_arquivar_motor(%L, 'e0000000-0000-0000-0000-000000000002')$q$, m));
    if public.h_estado() <> e then raise exception 'FALHOU caso F4: algo mudou'; end if;
    r := public.superadmin_arquivar_motor(m, 'e0000000-0000-0000-0000-000000000001');
    r2 := public.h_erro(format($q$select public.superadmin_arquivar_motor(%L, 'e0000000-0000-0000-0000-000000000001')$q$, m));
    if r1 <> 'P0002||motor inexistente' or r2 <> '22023||o motor ja esta arquivado' or r3 not like '42501|%' or r -> 'etapas_sem_motor' <> '[]'::jsonb then
      raise exception 'FALHOU caso F4: % / % / % / %', r1, r2, r3, r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F4 — arquivar: inexistente, ja arquivado e autor comum recusados sem mudar nada; sem uso devolve a lista vazia';
end $$;

-- CASO F5 — TROCAR O ARQUIVO do motor da Wolff: o NOVO tem o MESMO nome, o antigo fica arquivado, as 3 etapas passam ao novo com a exigida; o UNIQUE
-- parcial não colide porque a troca arquiva o antigo ANTES de criar o novo. A prova do contrário: com o antigo ATIVO, criar outro motor com o mesmo
-- nome é recusado (pela frase e, direto no banco, pelo índice) — a ordem de antes (criar, reapontar, arquivar) colidiria
do $$
declare WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; r jsonb; novo uuid; x1 text; x2 text;
begin
  x1 := public.h_erro(format($q$select public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', %L, 'PERFIL', array['PVC'], 'Motor_Wolf_PVC', %L, 'n.xlsx', public.h_payload(1))$q$, W, W::text || '/motor/n.xlsx'));
  x2 := public.h_erro(format($q$select public.h_motor('Motor_Wolf_PVC', array['PVC'], %L)$q$, W));
  if x1 not like '22023||ja existe um motor ativo "Motor_Wolf_PVC"%' or x2 not like '23505|orcamentista_motor_nome_ativo|%' then raise exception 'FALHOU caso F5: a colisao (% / %)', x1, x2; end if;
  begin
    r := public.superadmin_trocar_arquivo_do_motor('e0000000-0000-0000-0000-000000000001', WM, W::text || '/motor/novo.xlsx', 'novo.xlsx', public.h_payload(2));
    novo := (r ->> 'motor_id')::uuid;
    if (select nome from public.orcamentista_motor where id = novo) <> 'Motor_Wolf_PVC' or (select arquivado_em from public.orcamentista_motor where id = novo) is not null
       or (select arquivado_em from public.orcamentista_motor where id = WM) is null or (r ->> 'etapas_reapontadas')::int <> 3
       or (select count(*) from public.orcamentista_familia_etapa where motor_id = novo and motor_familia_exigida = 'PVC') <> 3
       or not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = WM::text and antes ->> 'troca_de_arquivo_do_motor' = WM::text
                        and depois -> 'orcamentista_motor' ->> 'arquivado_em' is not null) then
      raise exception 'FALHOU caso F5: a troca (%)', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F5 — trocar: o novo com o MESMO nome, o antigo arquivado (antes de criar o novo), as 3 etapas no novo; com o antigo ativo, o nome colide';
end $$;

-- CASO F6 — com a FK em SET NULL, a FK não protege mais a família em uso: TIRAR do motor da Wolff a família PVC, que as 3 etapas usam, continua
-- RECUSA 23001 nomeando quem usa, e nada muda — as 3 seguem com o motor e a exigida (sem a conferência da função, apagar a ligação as limparia
-- em silêncio). Trocar PVC por PVC + ALUMINIO passa (acrescentar não tira nada)
do $$
declare WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; W uuid := '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'; p text; e text; r text;
begin
  select arquivo_path into p from public.orcamentista_motor where id = WM;
  e := public.h_estado();
  r := public.h_erro(format($q$select public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', %L, %L, 'PERFIL', array['ALUMINIO'], 'Motor_Wolf_PVC', %L)$q$, WM, W, p));
  if r not like '23001||a familia PVC nao pode sair do motor: em uso por 3 etapa(s) (%' or public.h_estado() <> e
     or (select count(*) from public.orcamentista_familia_etapa where motor_id = WM and motor_familia_exigida = 'PVC') <> 3 then
    raise exception 'FALHOU caso F6: %', r; end if;
  begin
    perform public.superadmin_editar_motor('e0000000-0000-0000-0000-000000000001', WM, W, 'PERFIL', array['PVC', 'ALUMINIO'], 'Motor_Wolf_PVC', p);
    if (select count(*) from public.orcamentista_motor_familia where motor_id = WM) <> 2
       or (select count(*) from public.orcamentista_familia_etapa where motor_id = WM and motor_familia_exigida = 'PVC') <> 3 then
      raise exception 'FALHOU caso F6: acrescentar'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F6 — tirar a familia em uso segue recusa nomeada (a FK SET NULL nao protege; a funcao sim), e as 3 etapas ficam; acrescentar passa';
end $$;

-- CASO P1 — as quatro funções FECHADAS; as assinaturas antigas (sem o nome) não existem mais
do $$
declare f regprocedure; nome text;
begin
  foreach nome in array array['public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)', 'public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text, text)',
                              'public.superadmin_arquivar_motor(uuid, uuid)', 'public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)'] loop
    f := to_regprocedure(nome);
    if f is null or has_function_privilege('public', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then raise exception 'FALHOU caso P1: %', nome; end if;
  end loop;
  if to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb)') is not null
     or to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text)') is not null then raise exception 'FALHOU caso P1: assinatura antiga'; end if;
  raise notice 'ok: caso P1 — as funcoes fechadas; as assinaturas antigas sairam';
end $$;
