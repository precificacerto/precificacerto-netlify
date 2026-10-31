-- Os casos da 20261031000002, sobre o estado de PRODUÇÃO de 31/10/2026 (os mesmos ids) com a 20261031000001, e a migração aplicada duas vezes.
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
-- o estado inteiro do que a migração toca: o catálogo, as etapas e a contagem do log
create or replace function public.h_estado() returns text language sql as $f$
  select md5(coalesce((select string_agg(c::text, '|' order by c.id) from public.orcamentista_etapa_catalogo c), '') || '#'
          || coalesce((select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e), '') || '#'
          || (select count(*) from public.superadmin_alteracao_log)::text)
$f$;
-- o item da lista como a tela o manda, a partir da linha gravada (sem motor_id: o motor fica como está)
create or replace function public.h_item(p_id uuid) returns jsonb language sql as $f$
  select jsonb_build_object('id', x.id, 'etapa_catalogo_id', x.etapa_catalogo_id, 'instrucao', x.instrucao) from public.orcamentista_familia_etapa x where x.id = p_id
$f$;
create or replace function public.h_gravar(p_lista jsonb) returns jsonb language sql as $f$
  select public.superadmin_gravar_etapas_da_materia_prima('20e08592-f957-4e72-b7eb-251387e34eb9', 'e0000000-0000-0000-0000-000000000001', '79d764fe-4acd-43e2-bed9-38e20667ca3d', p_lista)
$f$;
create or replace function public.h_item_de(p_numero int) returns uuid language sql as $f$ select id from public.orcamentista_etapa_catalogo where ordem = p_numero $f$;
create or replace function public.h_log() returns bigint language sql as $f$ select count(*) from public.superadmin_alteracao_log $f$;

-- CASO C1 — aplicada DUAS vezes sobre o estado de produção: 3 itens com o nome, a ação e as abas LITERAIS das 3 etapas, na ordem do número, sem
-- autor; cada etapa aponta o seu e guarda tudo o mais (id, número, instrução, motor, autor e hora); as três colunas saíram; 6 linhas de log na
-- primeira aplicação (3 itens + 3 etapas, a da etapa com o tenant e o antes inteiro) e nenhuma na segunda
do $$
declare v_n int;
begin
  if (select array_agg((ordem, nome, acao, abas, criado_por is null)::text order by ordem) from public.orcamentista_etapa_catalogo)
     is distinct from (select array_agg((numero, rotulo, acao, abas, true)::text order by numero) from public.h_etapas_antes_do_catalogo)
     or exists (select e.id, e.tenant_id, e.materia_prima_id, e.familia, e.numero, e.instrucao, e.motor_id, e.motor_familia_exigida, e.atualizado_por, e.atualizado_em,
                       c.nome, c.acao, c.abas
                  from public.orcamentista_familia_etapa e join public.orcamentista_etapa_catalogo c on c.id = e.etapa_catalogo_id
                except select id, tenant_id, materia_prima_id, familia, numero, instrucao, motor_id, motor_familia_exigida, atualizado_por, atualizado_em, rotulo, acao, abas
                  from public.h_etapas_antes_do_catalogo)
     or (select count(*) from public.orcamentista_familia_etapa) is distinct from (select count(*) from public.h_etapas_antes_do_catalogo)
     or (select count(*) from information_schema.columns where table_name = 'orcamentista_familia_etapa' and column_name in ('rotulo', 'acao', 'abas')) is distinct from 0
     or (select n from public.h_log_depois_da_1) - (select n from public.h_log_antes_do_catalogo) is distinct from 6
     or public.h_log() is distinct from (select n from public.h_log_depois_da_1)
     or (select count(*) from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_familia_etapa' and (l.antes ->> 'etapa_vira_item_de_catalogo')::boolean
           and l.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' and l.antes -> 'orcamentista_familia_etapa' ? 'rotulo'
           and l.depois -> 'orcamentista_familia_etapa' ? 'etapa_catalogo_id') is distinct from 3
     or (select count(*) from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_etapa_catalogo' and l.antes is null
           and jsonb_array_length(l.depois -> 'semeio_das_etapas') = 1) is distinct from 3 then
    raise exception 'FALHOU caso C1';
  end if;
  raise notice 'ok: caso C1 — aplicada duas vezes: 3 itens literais na ordem, cada etapa intacta apontando o seu, as colunas fora, 6 logs e nenhum na reaplicacao';
end $$;

-- CASO K1 — as travas do banco, por DML direto: a forma do nome, a ação e as abas da lista, a ordem, o nome único sem olhar a caixa, a FK RESTRICT e
-- o NOT NULL na etapa
do $$
declare r text; esperado text[][] := array[
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values ('' Com espaco'', ''APANHAR'', 9)', '23514|orcamentista_etapa_catalogo_nome_forma'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values ('''', ''APANHAR'', 9)', '23514|orcamentista_etapa_catalogo_nome_forma'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values (repeat(''ç'', 61), ''APANHAR'', 9)', '23514|orcamentista_etapa_catalogo_nome_forma'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values (repeat(''ç'', 60), ''APANHAR'', 9)', 'ok'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values (''Outra'', ''OUTRA'', 9)', '23514|orcamentista_etapa_catalogo_acao_da_lista'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values (''Outra'', null, 9)', '23502|'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, abas, ordem) values (''Outra'', ''APANHAR'', array[''precos''], 9)', '23514|orcamentista_etapa_catalogo_abas_da_planilha'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values (''Outra'', ''APANHAR'', 0)', '23514|orcamentista_etapa_catalogo_ordem_positiva'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values (''Outra'', ''APANHAR'', 1)', '23505|orcamentista_etapa_catalogo_ordem_key'],
  ['insert into public.orcamentista_etapa_catalogo (nome, acao, ordem) values (''RELAÇÃO DE BARRAS E MATERIAIS'', ''APANHAR'', 9)', '23505|orcamentista_etapa_catalogo_nome_unico'],
  ['delete from public.orcamentista_etapa_catalogo where ordem = 3', '23503|orcamentista_familia_etapa_etapa_catalogo_fkey'],
  ['update public.orcamentista_familia_etapa set etapa_catalogo_id = null where numero = 1', '23502|'],
  ['update public.orcamentista_familia_etapa set etapa_catalogo_id = gen_random_uuid() where numero = 1', '23503|orcamentista_familia_etapa_etapa_catalogo_fkey']];
  i int; v_cod text;
begin
  for i in 1..array_length(esperado, 1) loop
    begin
      execute esperado[i][1];
      r := 'ok';
      raise exception 'desfazer' using errcode = 'P0099';
    exception when sqlstate 'P0099' then null;
      when others then
        get stacked diagnostics v_cod = returned_sqlstate, r = constraint_name;
        r := v_cod || '|' || coalesce(r, '');
    end;
    if r is distinct from esperado[i][2] then raise exception 'FALHOU caso K1 (%): % em vez de %', i, r, esperado[i][2]; end if;
  end loop;
  raise notice 'ok: caso K1 — as travas: nome 1..60 sem pontas, acao e abas da lista, ordem positiva e unica, nome unico sem caixa, FK RESTRICT e NOT NULL na etapa';
end $$;

-- CASO K2 — RLS ligada e privilégios iguais aos de orcamentista_motor: nada para anon e authenticated, tudo para service_role, as 4 políticas
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.orcamentista_etapa_catalogo'::regclass)
     or has_table_privilege('anon', 'public.orcamentista_etapa_catalogo', 'SELECT') or has_table_privilege('authenticated', 'public.orcamentista_etapa_catalogo', 'SELECT')
     or has_table_privilege('authenticated', 'public.orcamentista_etapa_catalogo', 'INSERT') or has_table_privilege('authenticated', 'public.orcamentista_etapa_catalogo', 'DELETE')
     or not has_table_privilege('service_role', 'public.orcamentista_etapa_catalogo', 'SELECT, INSERT, UPDATE, DELETE')
     or (select count(*) from pg_policies where tablename = 'orcamentista_etapa_catalogo' and coalesce(qual, with_check) = 'is_super_admin()') is distinct from 4 then
    raise exception 'FALHOU caso K2';
  end if;
  raise notice 'ok: caso K2 — RLS ligada; anon e authenticated sem privilegio; service_role com todos; as 4 politicas de super admin';
end $$;

-- CASO F1 — CRIAR: o item novo vai ao fim (ordem 4), com o autor, o nome aparado e o log; as recusas dizem por quê e não mudam nada
do $$
declare SU uuid := 'e0000000-0000-0000-0000-000000000001'; r jsonb; antes text; l0 bigint;
begin
  antes := public.h_estado();
  if public.h_erro($q$select public.superadmin_criar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000002', 'Nova', 'APANHAR', '{}')$q$) not like '42501|%'
     or public.h_erro($q$select public.superadmin_criar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000001', 'relação de barras e materiais', 'APANHAR', '{}')$q$)
        is distinct from '22023|ja existe a etapa "Relação de barras e materiais" no catalogo: o nome nao se repete. Nada foi gravado.'
     or public.h_erro($q$select public.superadmin_criar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000001', 'Nova', 'OUTRA', '{}')$q$) is distinct from '22023|a acao nao esta na lista. Nada foi gravado.'
     or public.h_erro($q$select public.superadmin_criar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000001', 'Nova', null, '{}')$q$) is distinct from '22023|a acao e obrigatoria e e da lista. Nada foi gravado.'
     or public.h_erro($q$select public.superadmin_criar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000001', 'Nova', 'APANHAR', array['tipologias', 'tipologias'])$q$) is distinct from '22023|uma aba aparece mais de uma vez, ou vazia. Nada foi gravado.'
     or public.h_erro($q$select public.superadmin_criar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000001', 'Nova', 'APANHAR', array['precos'])$q$) is distinct from '22023|uma aba nao e da planilha. Nada foi gravado.'
     or public.h_erro($q$select public.superadmin_criar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000001', repeat('x', 61), 'APANHAR', '{}')$q$) is distinct from '22023|o nome da etapa tem de 1 a 60 caracteres. Nada foi gravado.'
     or public.h_erro($q$select public.superadmin_criar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000001', '   ', 'APANHAR', '{}')$q$) is distinct from '22023|o nome da etapa tem de 1 a 60 caracteres. Nada foi gravado.'
     or public.h_estado() is distinct from antes then
    raise exception 'FALHOU caso F1 (as recusas)';
  end if;
  begin
    l0 := public.h_log();
    r := public.superadmin_criar_etapa_do_catalogo(SU, '  Conferência do apanhado  ', 'CONFIRMAR', array['tipologias', 'variaveis']);
    if r ->> 'nome' is distinct from 'Conferência do apanhado' or (r ->> 'ordem')::int is distinct from 4 or (r ->> 'criado_por')::uuid is distinct from SU or r ->> 'acao' is distinct from 'CONFIRMAR'
       or (select abas from public.orcamentista_etapa_catalogo where id = (r ->> 'id')::uuid) is distinct from array['tipologias', 'variaveis']
       or public.h_log() - l0 is distinct from 1
       or not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_etapa_catalogo' and l.chave = r ->> 'id' and l.antes is null and l.por = SU
                        and l.tenant_id is null and l.depois -> 'orcamentista_etapa_catalogo' ->> 'nome' = 'Conferência do apanhado') then
      raise exception 'FALHOU caso F1: %', r;
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F1 — criar: no fim (ordem 4), com autor, nome aparado e log; recusas (nao super admin, nome repetido sem caixa, acao, aba, tamanho) sem mudar nada';
end $$;

-- CASO F2 — EDITAR, também COM uso: o nome novo aparece na etapa que o seleciona, com antes e depois no log; a ação e as abas mudam; "nada mudou",
-- o nome de outro e o item inexistente são recusa; mudar só a caixa do próprio nome é permitido
do $$
declare SU uuid := 'e0000000-0000-0000-0000-000000000001'; I2 uuid := public.h_item_de(2); r jsonb; antes text; l0 bigint;
begin
  antes := public.h_estado();
  if public.h_erro(format($q$select public.superadmin_editar_etapa_do_catalogo('%s', '%s', 'Relação de barras, materiais e tempo fabricaçãoprodução', 'CALCULAR_BARRAS',
                    (select abas from public.orcamentista_etapa_catalogo where ordem = 2))$q$, SU, I2))
        is distinct from '22023|nada mudou: o nome, a acao e as abas sao os de agora. Nada foi gravado.'
     or public.h_erro(format($q$select public.superadmin_editar_etapa_do_catalogo('%s', '%s', 'RELAÇÃO DE BARRAS E MATERIAIS', 'CALCULAR_BARRAS', '{}')$q$, SU, I2))
        is distinct from '22023|ja existe a etapa "Relação de barras e materiais" no catalogo: o nome nao se repete. Nada foi gravado.'
     or public.h_erro(format($q$select public.superadmin_editar_etapa_do_catalogo('%s', gen_random_uuid(), 'X', 'APANHAR', '{}')$q$, SU)) is distinct from 'P0002|etapa do catalogo inexistente'
     or public.h_erro(format($q$select public.superadmin_editar_etapa_do_catalogo('e0000000-0000-0000-0000-000000000002', '%s', 'X', 'APANHAR', '{}')$q$, I2)) not like '42501|%'
     or public.h_erro(format($q$select public.superadmin_editar_etapa_do_catalogo('%s', '%s', 'X', 'OUTRA', '{}')$q$, SU, I2)) is distinct from '22023|a acao nao esta na lista. Nada foi gravado.'
     or public.h_estado() is distinct from antes then
    raise exception 'FALHOU caso F2 (as recusas)';
  end if;
  begin
    l0 := public.h_log();
    r := public.superadmin_editar_etapa_do_catalogo(SU, I2, 'Relação de barras, materiais e tempo de produção', 'GERAR_LEVANTAMENTO', array['tipologias']);
    if (select c.nome || '|' || c.acao || '|' || array_to_string(c.abas, ',') from public.orcamentista_familia_etapa e join public.orcamentista_etapa_catalogo c on c.id = e.etapa_catalogo_id
         where e.id = 'ed9a9b06-d898-4f75-8487-e260d8ba8ec0') is distinct from 'Relação de barras, materiais e tempo de produção|GERAR_LEVANTAMENTO|tipologias'
       or (select ordem from public.orcamentista_etapa_catalogo where id = I2) is distinct from 2 or public.h_log() - l0 is distinct from 1
       or not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_etapa_catalogo' and l.chave = I2::text and l.por = SU
                        and l.antes -> 'orcamentista_etapa_catalogo' ->> 'nome' = 'Relação de barras, materiais e tempo fabricaçãoprodução'
                        and l.depois -> 'orcamentista_etapa_catalogo' ->> 'nome' = 'Relação de barras, materiais e tempo de produção') then
      raise exception 'FALHOU caso F2: %', r;
    end if;
    r := public.superadmin_editar_etapa_do_catalogo(SU, I2, 'RELAÇÃO de barras, materiais e tempo de produção', 'GERAR_LEVANTAMENTO', array['tipologias']);
    if r ->> 'nome' is distinct from 'RELAÇÃO de barras, materiais e tempo de produção' then raise exception 'FALHOU caso F2 (so a caixa): %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F2 — editar com uso: a etapa ve o nome novo, a acao e as abas mudam, com log; nada mudou, nome de outro, inexistente e nao super admin sao recusa';
end $$;

-- CASO F3 — REMOVER: o item em uso é RECUSA NOMEADA (empresa / família / etapa N), sem mudar nada; o sem uso sai, com o antes no log; inexistente é P0002
do $$
declare SU uuid := 'e0000000-0000-0000-0000-000000000001'; r jsonb; v_novo uuid; antes text; l0 bigint;
begin
  antes := public.h_estado();
  if public.h_erro(format($q$select public.superadmin_remover_etapa_do_catalogo('%s', '%s')$q$, SU, public.h_item_de(3)))
        is distinct from '22023|a etapa "Relação de barras e materiais" do catalogo esta em uso em 1 etapa(s) de conta (Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 3). Tire o uso antes de remover. Nada foi removido.'
     or public.h_erro(format($q$select public.superadmin_remover_etapa_do_catalogo('%s', gen_random_uuid())$q$, SU)) is distinct from 'P0002|etapa do catalogo inexistente'
     or public.h_erro(format($q$select public.superadmin_remover_etapa_do_catalogo('e0000000-0000-0000-0000-000000000002', '%s')$q$, public.h_item_de(3))) not like '42501|%'
     or public.h_estado() is distinct from antes then
    raise exception 'FALHOU caso F3 (as recusas)';
  end if;
  begin
    v_novo := (public.superadmin_criar_etapa_do_catalogo(SU, 'Sem uso', 'ENVIAR', '{}') ->> 'id')::uuid;
    l0 := public.h_log();
    r := public.superadmin_remover_etapa_do_catalogo(SU, v_novo);
    if exists (select 1 from public.orcamentista_etapa_catalogo where id = v_novo) or r ->> 'nome' is distinct from 'Sem uso' or public.h_log() - l0 is distinct from 1
       or not exists (select 1 from public.superadmin_alteracao_log l where l.tabela = 'orcamentista_etapa_catalogo' and l.chave = v_novo::text and l.depois is null
                        and l.antes -> 'orcamentista_etapa_catalogo' ->> 'nome' = 'Sem uso' and l.por = SU) then
      raise exception 'FALHOU caso F3: %', r;
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F3 — remover: em uso e recusa nomeada (empresa / familia / etapa 3), sem mudar nada; sem uso sai com o antes no log';
end $$;

-- CASO F3b — a recusa nomeia TODAS as contas que usam (até 10), em ordem, e conta o resto
do $$
declare SU uuid := 'e0000000-0000-0000-0000-000000000001'; r text; i int;
begin
  begin
    -- 11 etapas da mesma família apontando o item 1 (a lista inteira: as 3 e mais 8 novas)
    perform public.h_gravar((select jsonb_agg(x order by o) from (
      select public.h_item(id) as x, numero as o from public.orcamentista_familia_etapa
      union all select jsonb_build_object('etapa_catalogo_id', public.h_item_de(1)), 3 + g from generate_series(1, 8) g) z));
    update public.orcamentista_familia_etapa set etapa_catalogo_id = public.h_item_de(1);
    r := public.h_erro(format($q$select public.superadmin_remover_etapa_do_catalogo('%s', '%s')$q$, SU, public.h_item_de(1)));
    if r not like '22023|a etapa "Apanhado e levantamento de esquadrias" do catalogo esta em uso em 11 etapa(s) de conta (Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 1, %'
       or r not like '%etapa 9, Esquadrias De Paula Ltda / Esquadrias de PVC WOLF / etapa 10 e mais 1). Tire o uso antes de remover. Nada foi removido.' then
      raise exception 'FALHOU caso F3b: %', r;
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso F3b — a recusa de remover nomeia ate 10 usos e conta o resto (e mais 1)';
end $$;

-- CASO G1 — GRAVAR as etapas da conta: o item leva `etapa_catalogo_id` (obrigatório, de um item que existe); rotulo/acao/abas no item são recusa
do $$
declare E1 uuid := 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d'; antes text;
begin
  antes := public.h_estado();
  if public.h_erro(format($q$select public.h_gravar(jsonb_build_array(public.h_item('%s') || '{"rotulo": "X"}'))$q$, E1))
        is distinct from '22023|etapa 1: o campo "rotulo" nao existe (so id, etapa_catalogo_id, instrucao e motor_id; o nome, a acao e as abas sao do catalogo)'
     or public.h_erro(format($q$select public.h_gravar(jsonb_build_array(public.h_item('%s') || '{"acao": "APANHAR"}'))$q$, E1)) not like '22023|etapa 1: o campo "acao" nao existe%'
     or public.h_erro(format($q$select public.h_gravar(jsonb_build_array(public.h_item('%s') || '{"abas": []}'))$q$, E1)) not like '22023|etapa 1: o campo "abas" nao existe%'
     or public.h_erro(format($q$select public.h_gravar(jsonb_build_array(public.h_item('%s') - 'etapa_catalogo_id'))$q$, E1))
        is distinct from '22023|etapa 1: a etapa do catalogo e obrigatoria (o etapa_catalogo_id, um uuid)'
     or public.h_erro(format($q$select public.h_gravar(jsonb_build_array(public.h_item('%s') || '{"etapa_catalogo_id": null}'))$q$, E1)) is distinct from '22023|etapa 1: a etapa do catalogo e obrigatoria (o etapa_catalogo_id, um uuid)'
     or public.h_erro(format($q$select public.h_gravar(jsonb_build_array(public.h_item('%s') || jsonb_build_object('etapa_catalogo_id', gen_random_uuid())))$q$, E1))
        is distinct from '22023|etapa 1: a etapa do catalogo nao existe'
     or public.h_estado() is distinct from antes then
    raise exception 'FALHOU caso G1';
  end if;
  raise notice 'ok: caso G1 — gravar: rotulo, acao e abas no item sao recusa; o item do catalogo e obrigatorio e tem de existir; nada muda';
end $$;

-- CASO G2 — TROCAR o item da etapa 2 pelo item 3, com instrução nova, e INSERIR uma etapa nova do item 1: a 2 guarda o motor, a nova nasce sem motor
-- com o número 4; a remoção de uma etapa (a da 20261031000001) continua, e a resposta e o log dizem o NOME do catálogo
do $$
declare E1 uuid := 'bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d'; E2 uuid := 'ed9a9b06-d898-4f75-8487-e260d8ba8ec0'; E3 uuid := 'dd8d3526-f08e-47e1-81c3-a6770214516f';
  r jsonb; motor2 uuid; nova uuid;
begin
  select motor_id into motor2 from public.orcamentista_familia_etapa where id = E2;
  begin
    perform public.h_gravar(jsonb_build_array(public.h_item(E1), jsonb_build_object('id', E2, 'etapa_catalogo_id', public.h_item_de(3), 'instrucao', 'confira o vidro'),
                                              public.h_item(E3), jsonb_build_object('etapa_catalogo_id', public.h_item_de(1), 'instrucao', '  ')));
    if (select etapa_catalogo_id from public.orcamentista_familia_etapa where id = E2) is distinct from public.h_item_de(3)
       or (select instrucao from public.orcamentista_familia_etapa where id = E2) is distinct from 'confira o vidro'
       or (select motor_id from public.orcamentista_familia_etapa where id = E2) is distinct from motor2
       or (select (etapa_catalogo_id = public.h_item_de(1) and motor_id is null and familia = 'PVC')::text from public.orcamentista_familia_etapa where numero = 4) is distinct from 'true' then
      raise exception 'FALHOU caso G2 (trocar e inserir)';
    end if;
    select id into nova from public.orcamentista_familia_etapa where numero = 4;
    r := public.h_gravar(jsonb_build_array(public.h_item(E1), public.h_item(E3)));
    if r -> 'etapas_removidas' is distinct from jsonb_build_array(
         jsonb_build_object('id', E2, 'numero', 2, 'rotulo', 'Relação de barras e materiais'),
         jsonb_build_object('id', nova, 'numero', 4, 'rotulo', 'Apanhado e levantamento de esquadrias'))
       or (select array_agg(numero order by numero) from public.orcamentista_familia_etapa) is distinct from array[1, 2]
       or not exists (select 1 from public.superadmin_alteracao_log l where l.chave = E2::text and (l.antes ->> 'remocao_da_etapa')::boolean
                        and l.antes ->> 'etapa_do_catalogo' = 'Relação de barras e materiais' and l.antes -> 'orcamentista_familia_etapa' ->> 'instrucao' = 'confira o vidro'
                        and not (l.antes -> 'orcamentista_familia_etapa' ? 'nome_do_catalogo')) then
      raise exception 'FALHOU caso G2 (remover): %', r;
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso G2 — trocar o item e a instrucao da 2 (motor fica), inserir uma do item 1 (sem motor); remover continua, com o nome do catalogo na resposta e no log';
end $$;

-- CASO A1 — ARQUIVAR o motor em uso: as 3 etapas ficam sem motor, e a lista `etapas_sem_motor` traz, em `rotulo`, o NOME do item do catálogo
do $$
declare r jsonb;
begin
  begin
    r := public.superadmin_arquivar_motor('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'e0000000-0000-0000-0000-000000000001');
    if (select array_agg(x ->> 'rotulo' order by (x ->> 'numero')::int) from jsonb_array_elements(r -> 'etapas_sem_motor') x)
         is distinct from (select array_agg(rotulo order by numero) from public.h_etapas_antes_do_catalogo)
       or (select array_agg((x ->> 'empresa') || '/' || (x ->> 'familia')) from jsonb_array_elements(r -> 'etapas_sem_motor') x)
         is distinct from array_fill('Esquadrias De Paula Ltda/Esquadrias de PVC WOLF'::text, array[3])
       or exists (select 1 from public.orcamentista_familia_etapa where motor_id is not null) then
      raise exception 'FALHOU caso A1: %', r;
    end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso A1 — arquivar o motor em uso: as 3 ficam sem motor, e a lista diz o nome do catalogo, a empresa e a familia';
end $$;

-- CASO P1 — as cinco funções fechadas (só service_role), SECURITY DEFINER com search_path fixo
do $$
declare f text;
begin
  foreach f in array array['public.superadmin_criar_etapa_do_catalogo(uuid, text, text, text[])', 'public.superadmin_editar_etapa_do_catalogo(uuid, uuid, text, text, text[])',
                           'public.superadmin_remover_etapa_do_catalogo(uuid, uuid)', 'public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)',
                           'public.superadmin_arquivar_motor(uuid, uuid)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('service_role', f, 'EXECUTE')
       or not exists (select 1 from pg_proc p where p.oid = f::regprocedure and p.prosecdef and 'search_path=public, pg_temp' = any (p.proconfig)) then
      raise exception 'FALHOU caso P1: %', f;
    end if;
  end loop;
  raise notice 'ok: caso P1 — as cinco funcoes fechadas, SECURITY DEFINER e search_path fixo';
end $$;
