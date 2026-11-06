-- Os casos da 20261106000001 (o tempo de fabricação no arquivo do motor), sobre a base de `nome-do-motor-e-arquivar` (a cadeia real até a
-- 20261029000005, cujos corpos de criar e trocar são os de produção em 06/11/2026), com a migração aplicada DUAS vezes.
-- Cada caso desfaz o que fez (P0099). `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.
create or replace function public.h_erro(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text; con text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics msg = message_text, cod = returned_sqlstate, con = constraint_name;
  return cod || '|' || coalesce(con, '') || '|' || msg;
end $f$;
-- o payload do leitor para as tipologias T1..Tn; `p_tempos` nulo = o código de antes (sem a chave `tempos`)
create or replace function public.h_tp(n int, p_tempos jsonb, p_detalhes text[] default null) returns jsonb language sql as $f$
  select jsonb_build_object(
    'regras', (select coalesce(jsonb_agg(jsonb_build_object('codigo', 'C' || i, 'descricao', 'regra', 'linha', 'EUROPA 42', 'tipo', 'Perfil', 'tipologias', jsonb_build_array('T' || i))), '[]'::jsonb) from generate_series(1, n) i),
    'tipologias', (select coalesce(jsonb_agg(jsonb_build_object('tipologia', 'T' || i, 'linha', 'EUROPA 42', 'n_regras', 1, 'n_condicionais', 0, 'variaveis', jsonb_build_array('L'))), '[]'::jsonb) from generate_series(1, n) i),
    'formulas', jsonb_build_array(jsonb_build_object('linha', 'EUROPA 42', 'linha_original', 'PVC EUROPA 42', 'variavel', 'HFOL', 'formula', '(H-10)')),
    'detalhes', (select coalesce(jsonb_agg(jsonb_build_object('ordem', o + 1, 'linha', 'EUROPA 42', 'tipologia', t, 'descricao', 'Janela ' || t, 'tipo', 'Correr') order by o), '[]'::jsonb)
                   from unnest(coalesce(p_detalhes, array(select 'T' || i from generate_series(1, n) i))) with ordinality u(t, o)),
    'formulas_da_tipologia', '[]'::jsonb, 'perfis', '[]'::jsonb,
    'vidros', '[]'::jsonb, 'baguetes', '[]'::jsonb, 'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb,
    'otimizacao', '[]'::jsonb, 'avisos', '[]'::jsonb, 'contagens', jsonb_build_object('normalizados', 0))
    || case when p_tempos is null then '{}'::jsonb else jsonb_build_object('tempos', p_tempos) end
$f$;
create or replace function public.h_t(tip text, min numeric, origem text) returns jsonb language sql as $f$
  select jsonb_build_object('tipologia', tip, 'tempo_fabricacao_min', min, 'tempo_origem', origem)
$f$;
-- cria um motor da Roller Star pela função, com nome único; devolve o resultado inteiro
create or replace function public.h_criar(p_payload jsonb) returns jsonb language sql as $f$
  select public.superadmin_criar_motor('e0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002', 'PERSIANAS', array['PVC'],
    'Motor ' || gen_random_uuid(), 'f2000000-0000-0000-0000-000000000002/motor/' || gen_random_uuid() || '.xlsx', 'm.xlsx', p_payload)
$f$;
create or replace function public.h_trocar(p_motor uuid, p_payload jsonb) returns jsonb language sql as $f$
  select public.superadmin_trocar_arquivo_do_motor('e0000000-0000-0000-0000-000000000001', p_motor,
    'f2000000-0000-0000-0000-000000000002/motor/' || gen_random_uuid() || '.xlsx', 'novo.xlsx', p_payload)
$f$;
create or replace function public.h_estado() returns text language sql as $f$
  select md5(coalesce((select string_agg(m::text, '|' order by m.id) from public.orcamentista_motor m), '') || '#'
          || coalesce((select string_agg(t::text, '|' order by t.id) from public.orcamentista_motor_tipologia_tempo t), '') || '#'
          || coalesce((select string_agg(e::text, '|' order by e.id) from public.orcamentista_familia_etapa e), '') || '#'
          || (select count(*) from public.superadmin_alteracao_log)::text)
$f$;

-- CASO T1 — aplicada DUAS vezes: a CHECK da origem é a nova; os tempos de antes (2 por motor_id e 165 por tabela_id) intactos, linha por linha; os
-- dois corpos com o md5 desta (o que a verificação confere), fechados
do $$
begin
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_motor_tipologia_tempo_origem')
     is distinct from 'CHECK (((tempo_origem = btrim(tempo_origem)) AND ((char_length(tempo_origem) >= 1) AND (char_length(tempo_origem) <= 120))))' then
    raise exception 'FALHOU caso T1: a CHECK'; end if;
  if exists (select to_jsonb(t) from public.orcamentista_motor_tipologia_tempo t except select to_jsonb(a) from public.h_tempos_antes_da_000001 a)
     or (select count(*) from public.orcamentista_motor_tipologia_tempo) <> (select count(*) from public.h_tempos_antes_da_000001)
     or (select count(*) from public.orcamentista_motor_tipologia_tempo) <> 167 then raise exception 'FALHOU caso T1: os tempos de antes mudaram'; end if;
  if (select count(*) from pg_proc where proname in ('superadmin_criar_motor', 'superadmin_trocar_arquivo_do_motor')) <> 2
     or has_function_privilege('anon', 'public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)'::regprocedure, 'EXECUTE') then
    raise exception 'FALHOU caso T1: as funcoes'; end if;
  raise notice 'ok: caso T1 — aplicada duas vezes: a CHECK nova; os 167 tempos de antes intactos; as duas funcoes, uma de cada, fechadas';
end $$;

-- CASO T2 — CRIAR com tempos: T1 com 60 min e a origem da empresa (com acento, 85 caracteres), T2 com 35 e IMPORTADO, T3 sem tempo (vazio = sem
-- linha, nunca 0). A função devolve tempos = 2, grava por motor_id com o autor, e o log da criação leva a contagem
do $$
declare r jsonb; m uuid; o text := 'estimado por nº perfis, nº insumos, abertura correr + veneziana + bandeira — a régua';
begin
  o := left(o || repeat('x', 85), 85);
  begin
    r := public.h_criar(public.h_tp(3, jsonb_build_array(public.h_t('T1', 60, o), public.h_t('T2', 35, 'IMPORTADO'))));
    m := (r ->> 'motor_id')::uuid;
    if (r ->> 'tempos')::int is distinct from 2 or (r ->> 'detalhes')::int is distinct from 3 then raise exception 'FALHOU caso T2: a contagem (%)', r; end if;
    if (select string_agg(tipologia || '=' || tempo_fabricacao_min || '|' || tempo_origem || '|' || coalesce(atualizado_por::text, '-') || '|' || coalesce(tabela_id::text, '-'), ';' order by tipologia)
          from public.orcamentista_motor_tipologia_tempo where motor_id = m)
       is distinct from 'T1=60|' || o || '|e0000000-0000-0000-0000-000000000001|-;T2=35|IMPORTADO|e0000000-0000-0000-0000-000000000001|-' then
      raise exception 'FALHOU caso T2: as linhas'; end if;
    if char_length(o) <> 85 or (select (depois ->> 'tempos')::int from public.superadmin_alteracao_log where tabela = 'orcamentista_motor' and chave = m::text and antes is null) is distinct from 2 then
      raise exception 'FALHOU caso T2: o log'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T2 — criar grava os tempos do arquivo por motor_id (a origem como veio, 85 caracteres), a tipologia sem tempo fica sem linha, e devolve e loga tempos = 2';
end $$;

-- CASO T3 — CRIAR sem a chave `tempos` (o código de antes desta migração) e com a lista vazia: o motor nasce sem tempo, e a função devolve 0
do $$
declare r1 jsonb; r2 jsonb;
begin
  begin
    r1 := public.h_criar(public.h_tp(2, null));
    r2 := public.h_criar(public.h_tp(2, '[]'::jsonb));
    if (r1 ->> 'tempos')::int is distinct from 0 or (r2 ->> 'tempos')::int is distinct from 0
       or exists (select 1 from public.orcamentista_motor_tipologia_tempo where motor_id in ((r1 ->> 'motor_id')::uuid, (r2 ->> 'motor_id')::uuid)) then
      raise exception 'FALHOU caso T3: % / %', r1, r2; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T3 — criar sem a lista (o codigo de antes) ou com ela vazia: o motor nasce sem tempo, e tempos = 0';
end $$;

-- CASO T4 — CRIAR recusa, 22023 com a frase, e NADA é gravado: a lista que não é lista; tempo zero, negativo, decimal, texto e acima do integer;
-- origem vazia, nula, com espaço na ponta, com 121 caracteres; a tipologia repetida, fora da Detalhe, ou que não é texto. 120 caracteres passam
do $$
declare e text; r text; x record; o120 text := repeat('é', 120); n int := 0;
begin
  e := public.h_estado();
  for x in select * from (values
      ('lista', public.h_tp(2, '{"T1": 60}'::jsonb), '22023||Payload invalido: tempos tem de ser uma lista. Nada foi gravado.'),
      ('zero', public.h_tp(2, jsonb_build_array(public.h_t('T1', 0, 'IMPORTADO'))), '22023||tempo de fabricacao invalido para T1:%'),
      ('negativo', public.h_tp(2, jsonb_build_array(public.h_t('T1', -5, 'IMPORTADO'))), '22023||tempo de fabricacao invalido para T1:%'),
      ('decimal', public.h_tp(2, jsonb_build_array(public.h_t('T2', 12.5, 'IMPORTADO'))), '22023||tempo de fabricacao invalido para T2:%'),
      ('acima', public.h_tp(2, jsonb_build_array(public.h_t('T1', 2147483648, 'IMPORTADO'))), '22023||tempo de fabricacao invalido para T1:%'),
      ('texto', public.h_tp(2, jsonb_build_array(jsonb_build_object('tipologia', 'T1', 'tempo_fabricacao_min', '60', 'tempo_origem', 'IMPORTADO'))), '22023||tempo de fabricacao invalido para T1:%'),
      ('origem vazia', public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, ''))), '22023||tempo de fabricacao invalido para T1:%'),
      ('origem nula', public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, null))), '22023||tempo de fabricacao invalido para T1:%'),
      ('origem com espaco', public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, ' medido'))), '22023||tempo de fabricacao invalido para T1:%'),
      ('origem 121', public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, o120 || 'x'))), '22023||tempo de fabricacao invalido para T1:%'),
      ('repetida', public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, 'A'), public.h_t('T1', 70, 'B'))), '22023||a tipologia T1 tem mais de um tempo de fabricacao. Nada foi gravado.'),
      ('fora da Detalhe', public.h_tp(2, jsonb_build_array(public.h_t('T9', 60, 'A'))), '22023||tempo de fabricacao para tipologia que nao esta na Detalhe: T9. Nada foi gravado.'),
      ('tipologia numero', public.h_tp(2, jsonb_build_array(jsonb_build_object('tipologia', 1, 'tempo_fabricacao_min', 60, 'tempo_origem', 'A'))), '22023||tempo de fabricacao invalido para 1:%'),
      ('elemento escalar', public.h_tp(2, '[60]'::jsonb), '22023||tempo de fabricacao invalido para (sem tipologia):%')
    ) as v(nome, payload, esperado) loop
    r := public.h_erro(format('select public.h_criar(%L::jsonb)', x.payload));
    if r not like x.esperado then raise exception 'FALHOU caso T4 (%): %', x.nome, r; end if;
    n := n + 1;
  end loop;
  if public.h_estado() <> e then raise exception 'FALHOU caso T4: algo foi gravado'; end if;
  begin
    if (public.h_criar(public.h_tp(1, jsonb_build_array(public.h_t('T1', 2147483647, o120)))) ->> 'tempos')::int is distinct from 1 then raise exception 'FALHOU caso T4: 120 caracteres e o maior integer'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T4 — criar recusa as % formas invalidas com a frase, e nada e gravado; 120 caracteres e o maior integer passam', n;
end $$;

-- CASO T5 — a CHECK, por DML direto: 121 caracteres, vazio e espaço na ponta são recusados (23514); 120 (contados como o banco conta, por
-- caractere), ESTIMADO e IMPORTADO passam
do $$
declare r1 text; r2 text; r3 text; r4 text; m uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44';
  g text := $q$insert into public.orcamentista_motor_tipologia_tempo (motor_id, tipologia, tempo_fabricacao_min, tempo_origem) values (%L, %L, 10, %L)$q$;
begin
  r1 := public.h_erro(format(g, m, 'X1', repeat('ç', 121)));
  r2 := public.h_erro(format(g, m, 'X2', ''));
  r3 := public.h_erro(format(g, m, 'X3', 'medido '));
  if r1 not like '23514|orcamentista_motor_tipologia_tempo_origem|%' or r2 not like '23514|orcamentista_motor_tipologia_tempo_origem|%'
     or r3 not like '23514|orcamentista_motor_tipologia_tempo_origem|%' then raise exception 'FALHOU caso T5: % / % / %', r1, r2, r3; end if;
  begin
    r4 := public.h_erro(format(g, m, 'X4', repeat('ç', 120)) || '; ' || format(g, m, 'X5', 'ESTIMADO') || '; ' || format(g, m, 'X6', 'IMPORTADO'));
    if r4 <> 'ok' then raise exception 'FALHOU caso T5: o que passa (%)', r4; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T5 — a CHECK recusa 121 caracteres, vazio e espaco na ponta; 120, ESTIMADO e IMPORTADO passam';
end $$;

-- CASO T6 — TROCAR RECUSA a troca que perderia tempo: o motor tem tempo em T1 e T2; o arquivo novo traz T1, T2 e T3 na Detalhe e tempo só em T1 (a
-- célula de T2 vazia). 22023 nomeando T2, e NADA muda: o antigo não é arquivado, nenhum motor nasce, as etapas e os tempos ficam
do $$
declare m uuid; e text; r text;
begin
  begin
    m := (public.h_criar(public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, 'A'), public.h_t('T2', 35, 'B')))) ->> 'motor_id')::uuid;
    e := public.h_estado();
    r := public.h_erro(format('select public.h_trocar(%L, %L::jsonb)', m, public.h_tp(3, jsonb_build_array(public.h_t('T1', 61, 'A')))));
    if r <> '22023||a troca perderia 1 tempo(s) de fabricacao: o motor atual tem tempo para T2, e o arquivo novo traz essa(s) tipologia(s) sem tempo. Preencha o tempo delas no arquivo e envie de novo. Nada foi gravado.'
       or public.h_estado() <> e then raise exception 'FALHOU caso T6: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T6 — trocar recusa a troca em que uma tipologia com tempo vem sem tempo no arquivo novo, nomeando-a, e nada muda';
end $$;

-- CASO T7 — TROCAR com o arquivo SEM a coluna (o payload sem a chave `tempos`, como o código de antes) sobre o motor da Wolff, que tem tempo em DP-01
-- e DP-03 e as 3 etapas: recusa nomeando as duas, e as etapas seguem no antigo
do $$
declare WM uuid := '9a233c55-f377-45d3-b2ae-b1a740a98e44'; e text; r text;
begin
  e := public.h_estado();
  r := public.h_erro(format($q$select public.superadmin_trocar_arquivo_do_motor('e0000000-0000-0000-0000-000000000001', %L, '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/n.xlsx', 'n.xlsx', %L::jsonb)$q$,
                            WM, public.h_tp(3, null, array['DP-01', 'DP-02', 'DP-03'])));
  if r not like '22023||a troca perderia 2 tempo(s) de fabricacao: o motor atual tem tempo para DP-01, DP-03, e o arquivo novo%' or public.h_estado() <> e
     or (select count(*) from public.orcamentista_familia_etapa where motor_id = WM) <> 3 then raise exception 'FALHOU caso T7: %', r; end if;
  raise notice 'ok: caso T7 — trocar com o arquivo sem a coluna, sobre o motor com tempos e etapas: recusa nomeando as duas tipologias; as etapas ficam no antigo';
end $$;

-- CASO T8 — TROCAR ACEITA quando o arquivo novo traz tempo para toda tipologia que tinha (valores e origens novos, e um tempo novo em T3): o novo
-- motor leva os 3 do arquivo, o antigo fica arquivado com os 2 dele intactos, e a resposta traz tempos = 3
do $$
declare m uuid; novo uuid; r jsonb; antes text;
begin
  begin
    m := (public.h_criar(public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, 'A'), public.h_t('T2', 35, 'B')))) ->> 'motor_id')::uuid;
    select string_agg(t::text, '|' order by t.tipologia) into antes from public.orcamentista_motor_tipologia_tempo t where t.motor_id = m;
    r := public.h_trocar(m, public.h_tp(3, jsonb_build_array(public.h_t('T1', 61, 'cronometrado em fábrica'), public.h_t('T2', 36, 'IMPORTADO'), public.h_t('T3', 90, 'IMPORTADO'))));
    novo := (r ->> 'motor_id')::uuid;
    if (r ->> 'tempos')::int is distinct from 3 or (r ->> 'motor_antigo')::uuid is distinct from m
       or (select string_agg(tipologia || '=' || tempo_fabricacao_min || '|' || tempo_origem, ';' order by tipologia) from public.orcamentista_motor_tipologia_tempo where motor_id = novo)
          is distinct from 'T1=61|cronometrado em fábrica;T2=36|IMPORTADO;T3=90|IMPORTADO'
       or (select string_agg(t::text, '|' order by t.tipologia) from public.orcamentista_motor_tipologia_tempo t where t.motor_id = m) is distinct from antes
       or (select arquivado_em from public.orcamentista_motor where id = m) is null then raise exception 'FALHOU caso T8: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T8 — trocar com tempo para toda tipologia que tinha: o novo leva os 3 do arquivo, o antigo arquivado com os 2 dele intactos';
end $$;

-- CASO T9 — a tipologia que SAIU do arquivo não conta como perda: o motor tem tempo em T1 e T2; o arquivo novo só traz T1 (com tempo) — aceita
do $$
declare m uuid; r jsonb;
begin
  begin
    m := (public.h_criar(public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, 'A'), public.h_t('T2', 35, 'B')))) ->> 'motor_id')::uuid;
    r := public.h_trocar(m, public.h_tp(1, jsonb_build_array(public.h_t('T1', 60, 'A'))));
    if (r ->> 'tempos')::int is distinct from 1 or (select count(*) from public.orcamentista_motor_tipologia_tempo where motor_id = m) is distinct from 2 then raise exception 'FALHOU caso T9: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T9 — a tipologia que saiu do arquivo novo nao conta como perda: a troca passa, e o antigo guarda o tempo dela';
end $$;

-- CASO T10 — a recusa nomeia ATÉ DEZ e diz quantas sobram: 12 tipologias com tempo, o arquivo novo sem nenhum
do $$
declare m uuid; r text;
begin
  begin
    m := (public.h_criar(public.h_tp(12, (select jsonb_agg(public.h_t('T' || i, 10 + i, 'A')) from generate_series(1, 12) i))) ->> 'motor_id')::uuid;
    r := public.h_erro(format('select public.h_trocar(%L, %L::jsonb)', m, public.h_tp(12, '[]'::jsonb)));
    if r not like '22023||a troca perderia 12 tempo(s) de fabricacao: o motor atual tem tempo para T1, T10, T11, T12, T2, T3, T4, T5, T6, T7 e mais 2, e o arquivo%' then
      raise exception 'FALHOU caso T10: %', r; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T10 — a recusa nomeia dez tipologias e diz "e mais 2"';
end $$;

-- CASO T11 — o motor SEM tempo (o de produção hoje) troca por um arquivo sem a coluna: não há o que perder, e passa (o motor novo, sem tempo); e
-- troca por um arquivo COM a coluna: o novo nasce com os tempos
do $$
declare m uuid; r1 jsonb; r2 jsonb;
begin
  begin
    m := (public.h_criar(public.h_tp(2, null)) ->> 'motor_id')::uuid;
    r1 := public.h_trocar(m, public.h_tp(2, null));
    r2 := public.h_trocar((r1 ->> 'motor_id')::uuid, public.h_tp(2, jsonb_build_array(public.h_t('T1', 60, 'A'), public.h_t('T2', 35, 'B'))));
    if (r1 ->> 'tempos')::int is distinct from 0 or (r2 ->> 'tempos')::int is distinct from 2 then raise exception 'FALHOU caso T11: % / %', r1, r2; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso T11 — o motor sem tempo troca por arquivo sem a coluna (tempos = 0) e depois por um com ela (tempos = 2)';
end $$;
