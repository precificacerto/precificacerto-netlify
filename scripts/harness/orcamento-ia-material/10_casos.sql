-- Os CASOS da 20261109000003, sobre a base com a 20261109000001, a 20261109000002 e esta migração DUAS vezes. Cada caso imprime "ok: …" ou "FALHOU: …".
\set ON_ERROR_STOP 0
create or replace function pg_temp.recusa(sql text, codigo text, nome text) returns void language plpgsql as $f$
begin
  begin execute sql;
  exception when others then
    if sqlstate = codigo then raise notice 'ok: %', nome; else raise notice 'FALHOU: % (sqlstate % em vez de %: %)', nome, sqlstate, codigo, sqlerrm; end if;
    return;
  end;
  raise notice 'FALHOU: % (passou)', nome;
end $f$;
create or replace function pg_temp.passa(sql text, nome text) returns void language plpgsql as $f$
begin execute sql; raise notice 'ok: %', nome;
exception when others then raise notice 'FALHOU: % (% %)', nome, sqlstate, sqlerrm;
end $f$;
create or replace function pg_temp.confere(condicao boolean, nome text) returns void language plpgsql as $f$
begin if condicao then raise notice 'ok: %', nome; else raise notice 'FALHOU: %', nome; end if; end $f$;

-- a base: um orçamento manual com um item em cada empresa
insert into orcamentista_orcamento (id, tenant_id, numero, origem, nome, criado_por) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 1, 'manual', 'Cliente A', '40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', 1, 'manual', 'Cliente B', '40000000-0000-4000-8000-000000000002');
insert into orcamentista_orcamento_item (id, tenant_id, orcamento_id, ordem, quantidade) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 1, 1),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000002', 1, 1);

-- uma linha de material válida (o A do teste do código: 600 bruto, 479,16 líquido, 3 m consumidos de 6)
create or replace function pg_temp.material(tenant text, item text, calculo text, codigo text, extra text default '') returns text language sql as $f$
  select format('insert into orcamentista_orcamento_item_material (tenant_id, orcamento_item_id, calculo_id, ordem, codigo, descricao, unidade_compra, medida_unidade,
    custo_bruto_unidade, cred_icms_pct, cred_pis_cofins_pct, cred_ipi_pct, nc_ipi_pct, cred_ibs_pct, cred_cbs_pct, credito_nao_apurado, custo_liquido_unidade,
    custo_liquido_fracao, consumo_item, custo_bruto_material, custo_liquido_material) values (%L, %L, %L, %s, %L, ''PERFIL'', ''BR'', 6, 600, 12, 9.25, 0, null, 0, 0, null,
    479.16, 79.86, 3, 450, 359.37)%s', tenant, item, calculo, (select coalesce(max(ordem), 0) + 1 from orcamentista_orcamento_item_material), codigo, extra)
$f$;
\set A '00000000-0000-4000-8000-0000000000a1'
\set B '00000000-0000-4000-8000-0000000000b2'

-- 1. o item: o valor só existe com um cálculo apontado, e o cálculo anda com a data
select pg_temp.recusa($$update orcamentista_orcamento_item set custo_bruto_materiais = 600 where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 1a: o valor do item sem calculo apontado');
select pg_temp.recusa($$update orcamentista_orcamento_item set custo_liquido_total = 1 where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 1b: o total do item sem calculo apontado');
select pg_temp.recusa($$update orcamentista_orcamento_item set calculo_id = '60000000-0000-4000-8000-000000000001' where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 1c: o calculo sem a data');
select pg_temp.recusa($$update orcamentista_orcamento_item set calculado_em = now() where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 1d: a data sem o calculo');
select pg_temp.passa($$update orcamentista_orcamento_item set calculo_id = '60000000-0000-4000-8000-000000000001', calculado_em = now(), custo_bruto_materiais = 600,
  custo_liquido_materiais = 479.16 where id = '50000000-0000-4000-8000-000000000001'$$, 'caso 1e: o item com o calculo e os valores');

-- 2. o material válido, e o mesmo código num cálculo novo (o cálculo é versionado, não reescrito)
select pg_temp.passa(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'A'), 'caso 2a: o material do item');
select pg_temp.recusa(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'A'), '23505', 'caso 2b: o mesmo codigo duas vezes no mesmo calculo');
select pg_temp.passa(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'A'), 'caso 2c: o mesmo codigo num calculo novo');
select pg_temp.confere((select count(*) from orcamentista_orcamento_item_material where orcamento_item_id = '50000000-0000-4000-8000-000000000001') = 2, 'caso 2d: o calculo de antes continua la');

-- 3. o ISOLAMENTO: o material de A nunca pende do item de B
select pg_temp.recusa(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000003', 'A'), '23503', 'caso 3a: o material da empresa A no item da empresa B');
select pg_temp.passa(pg_temp.material(:'B', '50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000003', 'A'), 'caso 3b: o material da empresa B no item dela');

-- 4. a decisão (b) e o PAR DO IPI: a falta sempre visível (falta_nomeada) e o fallback que nunca barateia (sem_credito_nao_barateia)
create or replace function pg_temp.bloco(codigo text, icms text, pis text, ipi text, nc text, falta text, liquido text) returns text language sql as $f$
  select format('insert into orcamentista_orcamento_item_material (tenant_id, orcamento_item_id, calculo_id, ordem, codigo, custo_bruto_unidade,
    cred_icms_pct, cred_pis_cofins_pct, cred_ipi_pct, nc_ipi_pct, credito_nao_apurado, custo_liquido_unidade, consumo_item, custo_bruto_material,
    custo_liquido_material) values (''00000000-0000-4000-8000-0000000000a1'', ''50000000-0000-4000-8000-000000000001'',
    ''60000000-0000-4000-8000-000000000004'', %s, %L, 600, %s, %s, %s, %s, %s, %s, 3, 450, 0)',
    (select coalesce(max(ordem), 0) + 1 from orcamentista_orcamento_item_material), codigo, icms, pis, ipi, nc, coalesce(quote_literal(falta), 'null'), liquido)
$f$;
select pg_temp.passa(pg_temp.bloco('C1', '12', '9.25', '0', 'null', null, '479.16'), 'caso 4a: ICMS, PIS/COFINS e o par do IPI com cred_ipi_pct = 0, sem falta');
select pg_temp.passa(pg_temp.bloco('C1b', '12', '9.25', 'null', '6.5', null, '518.16'), 'caso 4b: ICMS, PIS/COFINS e o par do IPI com nc_ipi_pct = 6,5, sem falta');
select pg_temp.passa(pg_temp.bloco('C1c', '12', '9.25', 'null', 'null', 'faltou no bloco tributario: o par do IPI (cred_ipi_pct ou nc_ipi_pct)', '479.16'), 'caso 4c: o par do IPI nulo com a falta nomeada');
select pg_temp.recusa(pg_temp.bloco('C1d', '12', '9.25', 'null', 'null', null, '479.16'), '23514', 'contraste 4d: o par do IPI nulo com a falta NULA (o desconhecido sumindo)');
select pg_temp.passa(pg_temp.bloco('C2', '12', 'null', '0', 'null', 'faltou no bloco tributario: cred_pis_cofins_pct', '528'), 'caso 4e: ICMS sem PIS/COFINS, falta nomeada, liquido entre o bruto e a cascata cheia (a cascata parcial)');
select pg_temp.passa(pg_temp.bloco('C3', 'null', 'null', 'null', 'null', 'faltou no bloco tributario: cred_icms_pct, cred_pis_cofins_pct, o par do IPI (cred_ipi_pct ou nc_ipi_pct)', '600'), 'caso 4f: o Perfil de hoje: sem os tres, falta nomeada, liquido igual ao bruto');
select pg_temp.recusa(pg_temp.bloco('C4', 'null', 'null', 'null', 'null', 'faltou no bloco tributario: cred_icms_pct, cred_pis_cofins_pct', '500'), '23514', 'contraste 4g: sem ICMS nem PIS/COFINS, liquido abaixo do bruto (o fallback barateando)');
select pg_temp.recusa(pg_temp.bloco('C5', '12', '9.25', '0', 'null', 'faltou no bloco tributario: cred_pis_cofins_pct', '479.16'), '23514', 'contraste 4h: tudo resolvido e uma falta registrada');
select pg_temp.recusa(pg_temp.bloco('C6', '12', 'null', '0', 'null', null, '528'), '23514', 'contraste 4i: a cascata parcial sem a falta (o numero aparece e ninguem ve o que faltou)');
select pg_temp.recusa(pg_temp.bloco('C7', 'null', 'null', '0', 'null', null, '600'), '23514', 'contraste 4j: sem ICMS nem PIS/COFINS e sem a falta');

-- 5. as formas
select pg_temp.recusa(replace(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 'E'), ', 12, 9.25,', ', 100.01, 9.25,'), '23514', 'caso 5a: percentual acima de 100');
select pg_temp.recusa(replace(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 'F'), '''BR'', 6,', '''BR'', 0,'), '23514', 'caso 5b: medida zero');
select pg_temp.recusa(replace(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 'G'), ', 3, 450,', ', -3, 450,'), '23514', 'caso 5c: consumo negativo');
select pg_temp.recusa(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', ' H'), '23514', 'caso 5d: codigo com espaco na ponta');
select pg_temp.recusa(replace(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 'I'), '''PERFIL'',', ''''','), '23514', 'caso 5e: descricao vazia (vazio e nulo, nao texto)');
select pg_temp.passa(replace(pg_temp.material(:'A', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 'J'), '''PERFIL'', ''BR'', 6,', 'null, null, null,'), 'caso 5f: descricao, unidade e medida nulas passam');

-- 6. o item com material não sai (RESTRICT), e o service_role não altera nem apaga material
select pg_temp.recusa($$delete from orcamentista_orcamento_item where id = '50000000-0000-4000-8000-000000000001'$$, '23503', 'caso 6a: apagar o item com material');
select pg_temp.confere(has_table_privilege('service_role', 'public.orcamentista_orcamento_item_material', 'INSERT')
  and has_table_privilege('service_role', 'public.orcamentista_orcamento_item_material', 'SELECT')
  and not has_table_privilege('service_role', 'public.orcamentista_orcamento_item_material', 'UPDATE')
  and not has_table_privilege('service_role', 'public.orcamentista_orcamento_item_material', 'DELETE')
  and not has_table_privilege('service_role', 'public.orcamentista_orcamento_item_material', 'TRUNCATE'), 'caso 6b: service_role so com INSERT e SELECT');
select pg_temp.confere(not has_table_privilege('anon', 'public.orcamentista_orcamento_item_material', 'SELECT')
  and not has_table_privilege('authenticated', 'public.orcamentista_orcamento_item_material', 'SELECT'), 'caso 6c: anon e authenticated nao leem');
select pg_temp.confere((select relrowsecurity from pg_class where oid = 'public.orcamentista_orcamento_item_material'::regclass), 'caso 6d: RLS ligada');

-- 7. a forma
select pg_temp.confere((select count(*) from pg_constraint where conrelid = 'orcamentista_orcamento_item_material'::regclass) = 15, 'caso 7a: 15 constraints no material');
select pg_temp.confere((select count(*) from pg_constraint where conrelid in ('orcamentista_orcamento'::regclass, 'orcamentista_orcamento_item'::regclass)) = 44, 'caso 7b: 44 nas duas tabelas de antes');
select pg_temp.confere((select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento_item_material') = 23, 'caso 7c: 23 colunas no material');
select pg_temp.confere((select count(*) from information_schema.columns where table_name = 'orcamentista_orcamento_item') = 28, 'caso 7d: 28 colunas no item');
