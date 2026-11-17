-- Os casos da 20261117000002 (as regras do WVetro no motor), sobre a base de `tempo-no-arquivo-do-motor` (a cadeia real até a 20261106000001,
-- com os corpos de criar e trocar de produção em 17/11/2026 — md5 conferido pela guarda), com a migração aplicada DUAS vezes.
-- Usa os ajudantes que o 10_casos.sql de lá deixou na base (h_tp, h_criar, h_trocar, h_erro). `ok:` é NOTICE; `FALHOU` é ERROR.
create or replace function public.h_tp6(p_com boolean) returns jsonb language sql as $f$
  select public.h_tp(1, null)
    || jsonb_build_object(
      'vidros', jsonb_build_array(jsonb_build_object('ordem', 2, 'linha', 'EUROPA 42', 'tipologia', 'T1', 'vidro', 'VIDRO', 'largura', 'LVID', 'altura', 'HVID',
                                                     'qtd', '2', 'fixacao', 'Fixo', 'condicao', 'sempre') || case when p_com then jsonb_build_object('esp_vidro', '18,20') else '{}'::jsonb end),
      'insumos', jsonb_build_array(
         jsonb_build_object('ordem', 2, 'linha', 'EUROPA 42', 'tipologia', 'T1', 'insumo', '3349/WOLFF', 'qtd', '1', 'condicao', 'sempre')
           || case when p_com then jsonb_build_object('esp_vidro', '5,6,8,24') else '{}'::jsonb end,
         jsonb_build_object('ordem', 3, 'linha', 'EUROPA 42', 'tipologia', 'T1', 'insumo', '919/WOLFF', 'qtd', '1', 'condicao', 'sempre')
           || case when p_com then jsonb_build_object('esp_vidro', '18,20,21') else '{}'::jsonb end),
      'variaveis_da_tipologia', jsonb_build_array(jsonb_build_object('ordem', 2, 'linha', 'EUROPA 42', 'tipologia', 'T1', 'variavel', 'ARI', 'padrao', '1',
                                                     'condicao', '(ARR=1)', 'opcoes', '1 = A; 2 = B; 3 = C')
           || case when p_com then jsonb_build_object('condicao_opcoes', '1: (TI=1); 2: (TI=1); 3: (TI=2)') else '{}'::jsonb end))
$f$;

-- CASO W1 — aplicada DUAS vezes: as três colunas text, nulas, sem default; as linhas de antes intactas e NULL nelas; o corpo com o md5 desta, fechado
do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and data_type = 'text' and is_nullable = 'YES' and column_default is null
        and (table_name, column_name) in (('orcamentista_motor_vidro','esp_vidro'), ('orcamentista_motor_insumo','esp_vidro'), ('orcamentista_motor_variavel','condicao_opcoes'))) <> 3 then
    raise exception 'FALHOU caso W1: as colunas'; end if;
  if exists (select 1 from public.orcamentista_motor_insumo where esp_vidro is not null) or exists (select 1 from public.orcamentista_motor_vidro where esp_vidro is not null)
     or exists (select 1 from public.orcamentista_motor_variavel where condicao_opcoes is not null) then raise exception 'FALHOU caso W1: linha de antes com valor'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'superadmin_criar_motor') <> '26ecaf800fc3a0f56a3d8ff74643eb0e'
     or has_function_privilege('authenticated', 'public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)'::regprocedure, 'EXECUTE') then
    raise exception 'FALHOU caso W1: a funcao'; end if;
  raise notice 'ok: caso W1 — aplicada duas vezes: as tres colunas text nulas sem default; as linhas de antes com NULL; criar com o corpo desta, fechada';
end $$;

-- CASO W2 — CRIAR com as três colunas no payload: chegam ao banco como vieram, texto literal
do $$
declare r jsonb; m uuid;
begin
  begin
    r := public.h_criar(public.h_tp6(true)); m := (r ->> 'motor_id')::uuid;
    if (select string_agg(insumo || '=' || esp_vidro, ' ' order by ordem) from public.orcamentista_motor_insumo where motor_id = m) <> '3349/WOLFF=5,6,8,24 919/WOLFF=18,20,21'
       or (select esp_vidro from public.orcamentista_motor_vidro where motor_id = m) <> '18,20'
       or (select condicao_opcoes from public.orcamentista_motor_variavel where motor_id = m) <> '1: (TI=1); 2: (TI=1); 3: (TI=2)'
       or (r ->> 'insumos')::int <> 2 or (r ->> 'vidros')::int <> 1 or (r ->> 'variaveis_da_tipologia')::int <> 1 then
      raise exception 'FALHOU caso W2: %', r; end if;
    raise exception 'P0099';
  exception when others then if sqlerrm <> 'P0099' then raise; end if; end;
  raise notice 'ok: caso W2 — criar grava esp_vidro (insumos e vidros) e condicao_opcoes como vieram';
end $$;

-- CASO W3 — CRIAR com o payload de antes (sem as chaves): as três ficam NULL, nunca '' (ausente-vs-falso)
do $$
declare r jsonb; m uuid;
begin
  begin
    r := public.h_criar(public.h_tp6(false)); m := (r ->> 'motor_id')::uuid;
    if exists (select 1 from public.orcamentista_motor_insumo where motor_id = m and esp_vidro is not null)
       or exists (select 1 from public.orcamentista_motor_vidro where motor_id = m and esp_vidro is not null)
       or exists (select 1 from public.orcamentista_motor_variavel where motor_id = m and condicao_opcoes is not null)
       or (select count(*) from public.orcamentista_motor_insumo where motor_id = m) <> 2 then raise exception 'FALHOU caso W3: %', r; end if;
    raise exception 'P0099';
  exception when others then if sqlerrm <> 'P0099' then raise; end if; end;
  raise notice 'ok: caso W3 — o payload sem as chaves cria o motor com as tres colunas NULL';
end $$;

-- CASO W4 — TROCAR o arquivo leva as colunas ao motor NOVO (a troca chama a criação), e o antigo fica como estava
do $$
declare r jsonb; m uuid; n uuid;
begin
  begin
    r := public.h_criar(public.h_tp6(false)); m := (r ->> 'motor_id')::uuid;
    r := public.h_trocar(m, public.h_tp6(true)); n := (r ->> 'motor_id')::uuid;
    if n = m or (select condicao_opcoes from public.orcamentista_motor_variavel where motor_id = n) <> '1: (TI=1); 2: (TI=1); 3: (TI=2)'
       or (select count(*) from public.orcamentista_motor_insumo where motor_id = n and esp_vidro is not null) <> 2
       or exists (select 1 from public.orcamentista_motor_insumo where motor_id = m and esp_vidro is not null) then raise exception 'FALHOU caso W4: %', r; end if;
    raise exception 'P0099';
  exception when others then if sqlerrm <> 'P0099' then raise; end if; end;
  raise notice 'ok: caso W4 — trocar o arquivo cria o novo com as tres colunas, e o antigo fica intacto';
end $$;
