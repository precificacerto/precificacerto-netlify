-- Depois da 20261028000001 e da 20261028000002 (o estado de produção de 29/10/2026), o que os casos usam:
--  - um LEVANTAMENTO ANTIGO da De Paula, com um item que leu o motor da Wolff — "um levantamento antigo tem de continuar lendo o que leu";
--  - a FOTO do conteúdo do motor da Wolff (13 tabelas) e dos tempos: trocar o arquivo não pode tocar em nenhuma linha dele.
insert into public.orcamentista_levantamento (id, tenant_id) values ('1e000000-0000-0000-0000-000000000001', '20e08592-f957-4e72-b7eb-251387e34eb9');
insert into public.orcamentista_levantamento_item (id, tenant_id, levantamento_id, ordem, tipologia, familia, motor_id)
values ('1e000000-0000-0000-0000-0000000000a1', '20e08592-f957-4e72-b7eb-251387e34eb9', '1e000000-0000-0000-0000-000000000001', 1, 'DP-01', 'PVC', '9a233c55-f377-45d3-b2ae-b1a740a98e44');
create or replace function public.h_foto_do_motor(m uuid) returns text language sql as $f$
  select md5(string_agg(t || ':' || h, '|' order by t, h)) from (
    select 'detalhe' t, md5(x::text) h from public.orcamentista_motor_tipologia_detalhe x where x.motor_id = m union all
    select 'tempo', md5(x::text) from public.orcamentista_motor_tipologia_tempo x where x.motor_id = m union all
    select 'regra', md5(x::text) from public.orcamentista_motor_regra x where x.motor_id = m union all
    select 'tipologia', md5(x::text) from public.orcamentista_motor_tipologia x where x.motor_id = m union all
    select 'formula', md5(x::text) from public.orcamentista_motor_formula x where x.motor_id = m union all
    select 'formula_familia', md5(x::text) from public.orcamentista_motor_formula_familia x where x.motor_id = m union all
    select 'variavel', md5(x::text) from public.orcamentista_motor_variavel x where x.motor_id = m union all
    select 'perfil', md5(x::text) from public.orcamentista_motor_perfil x where x.motor_id = m union all
    select 'insumo', md5(x::text) from public.orcamentista_motor_insumo x where x.motor_id = m union all
    select 'vidro', md5(x::text) from public.orcamentista_motor_vidro x where x.motor_id = m union all
    select 'baguete', md5(x::text) from public.orcamentista_motor_baguete x where x.motor_id = m union all
    select 'otimizacao', md5(x::text) from public.orcamentista_motor_otimizacao x where x.motor_id = m union all
    select 'validacao', md5(x::text) from public.orcamentista_motor_validacao x where x.motor_id = m) z
$f$;
create table public.h_etapas_depois_da_000001 as select * from public.orcamentista_familia_etapa;
