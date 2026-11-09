-- Os CASOS da 20261109000002, sobre a base com a 20261109000001 e esta migração aplicada DUAS vezes. Cada caso imprime "ok: …" ou "FALHOU: …".
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

-- a base de cada caso: um orçamento manual e um item, sem nenhuma coluna desta migração
insert into orcamentista_orcamento (id, tenant_id, numero, origem, nome, criado_por)
  values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 1, 'manual', 'Cliente na loja', '40000000-0000-4000-8000-000000000001');
insert into orcamentista_orcamento_item (id, tenant_id, orcamento_id, ordem, quantidade)
  values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 1, 1);

-- 1. VAZIO: o que ninguém preencheu nasce nulo, nunca zero
select pg_temp.confere((select num_nonnulls(custo_bruto_materiais, cred_icms_pct, cred_pis_cofins_pct, cred_ipi_pct, nc_ipi_pct, cred_ibs_pct, cred_cbs_pct,
    custo_liquido_materiais, tempo_fabricacao_min, valor_minuto, custo_fabricacao, custo_liquido_total) = 0
  from orcamentista_orcamento_item where id = '50000000-0000-4000-8000-000000000001'), 'caso 1a: as 12 colunas do item nascem nulas');
select pg_temp.confere((select num_nonnulls(comissao_percentual, comissao_modo, reserva_tecnica_percentual, reserva_tecnica_responsavel, lucro_projetado_percentual, aproveitamento_modo,
    aproveitamento_origem, aproveitamento_motivo, aproveitamento_por, valor_total_bruto, valor_total_liquido, valor_venda) = 0
  from orcamentista_orcamento where id = '30000000-0000-4000-8000-000000000001'), 'caso 1b: as 12 colunas do orcamento nascem nulas');

-- 2. ZERO é aceito, e continua zero ("apurou e deu nada")
select pg_temp.passa($$update orcamentista_orcamento_item set custo_bruto_materiais = 0, cred_icms_pct = 0, cred_pis_cofins_pct = 0, cred_ipi_pct = 0,
  nc_ipi_pct = 0, cred_ibs_pct = 0, cred_cbs_pct = 0, custo_liquido_materiais = 0, tempo_fabricacao_min = 0, valor_minuto = 0, custo_fabricacao = 0,
  custo_liquido_total = 0 where id = '50000000-0000-4000-8000-000000000001'$$, 'caso 2a: o item todo em zero passa');
select pg_temp.confere((select cred_icms_pct = 0 and custo_liquido_total = 0 from orcamentista_orcamento_item where id = '50000000-0000-4000-8000-000000000001'),
  'caso 2b: o zero gravado le zero, nao nulo');
select pg_temp.passa($$update orcamentista_orcamento set comissao_percentual = 0, reserva_tecnica_percentual = 0, lucro_projetado_percentual = 0,
  valor_total_bruto = 0, valor_total_liquido = 0, valor_venda = 0 where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 2c: o orcamento todo em zero passa');

-- 3. a cadeia inteira de um item e de um orçamento, com os números medidos na tela de Produtos (o 1008: bruto 8.457,00, líquido 6.753,75)
select pg_temp.passa($$update orcamentista_orcamento_item set custo_bruto_materiais = 8457.00, cred_icms_pct = 12, cred_pis_cofins_pct = 9.25,
  cred_ipi_pct = null, nc_ipi_pct = null, cred_ibs_pct = null, cred_cbs_pct = null, custo_liquido_materiais = 6753.75, tempo_fabricacao_min = 600,
  valor_minuto = 1.25, custo_fabricacao = 750, custo_liquido_total = 7503.75 where id = '50000000-0000-4000-8000-000000000001'$$, 'caso 3a: o item com a cadeia inteira');
select pg_temp.passa($$update orcamentista_orcamento set comissao_percentual = 5, comissao_modo = 'PROPORCIONAL', reserva_tecnica_percentual = 3,
  lucro_projetado_percentual = 20, valor_total_bruto = 8457.00, valor_total_liquido = 7503.75, valor_venda = 12000
  where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 3b: o orcamento com os percentuais e os totais');

-- 4. as faixas dos percentuais, um por um: 100 passa, acima e abaixo não
do $$ declare c text; begin
  foreach c in array array['cred_icms_pct','cred_pis_cofins_pct','cred_ipi_pct','nc_ipi_pct','cred_ibs_pct','cred_cbs_pct'] loop
    perform pg_temp.passa(format('update orcamentista_orcamento_item set %I = 100 where id = %L', c, '50000000-0000-4000-8000-000000000001'), 'caso 4: item ' || c || ' = 100 passa');
    perform pg_temp.recusa(format('update orcamentista_orcamento_item set %I = 100.0001 where id = %L', c, '50000000-0000-4000-8000-000000000001'), '23514', 'caso 4: item ' || c || ' acima de 100');
    perform pg_temp.recusa(format('update orcamentista_orcamento_item set %I = -0.0001 where id = %L', c, '50000000-0000-4000-8000-000000000001'), '23514', 'caso 4: item ' || c || ' negativo');
  end loop;
  foreach c in array array['comissao_percentual','reserva_tecnica_percentual','lucro_projetado_percentual'] loop
    perform pg_temp.recusa(format('update orcamentista_orcamento set %I = 100.0001 where id = %L', c, '30000000-0000-4000-8000-000000000001'), '23514', 'caso 4: orcamento ' || c || ' acima de 100');
    perform pg_temp.recusa(format('update orcamentista_orcamento set %I = -0.0001 where id = %L', c, '30000000-0000-4000-8000-000000000001'), '23514', 'caso 4: orcamento ' || c || ' negativo');
  end loop;
end $$;

-- 5. nenhum valor negativo
do $$ declare c text; begin
  foreach c in array array['custo_bruto_materiais','custo_liquido_materiais','tempo_fabricacao_min','valor_minuto','custo_fabricacao','custo_liquido_total'] loop
    perform pg_temp.recusa(format('update orcamentista_orcamento_item set %I = -0.01 where id = %L', c, '50000000-0000-4000-8000-000000000001'), '23514', 'caso 5: item ' || c || ' negativo');
  end loop;
  foreach c in array array['valor_total_bruto','valor_total_liquido','valor_venda'] loop
    perform pg_temp.recusa(format('update orcamentista_orcamento set %I = -0.01 where id = %L', c, '30000000-0000-4000-8000-000000000001'), '23514', 'caso 5: orcamento ' || c || ' negativo');
  end loop;
end $$;

-- 6. DERIVADO, nunca sem a origem
select pg_temp.recusa($$update orcamentista_orcamento_item set custo_liquido_total = null, custo_bruto_materiais = null where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 6a: o liquido dos materiais sem o bruto');
select pg_temp.recusa($$update orcamentista_orcamento_item set custo_liquido_total = null, tempo_fabricacao_min = null where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 6b: o custo de fabricacao sem o tempo');
select pg_temp.recusa($$update orcamentista_orcamento_item set custo_liquido_total = null, valor_minuto = null where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 6c: o custo de fabricacao sem o valor do minuto');
select pg_temp.recusa($$update orcamentista_orcamento_item set custo_liquido_materiais = null where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 6d: o total do item sem o liquido dos materiais');
select pg_temp.recusa($$update orcamentista_orcamento_item set custo_fabricacao = null where id = '50000000-0000-4000-8000-000000000001'$$, '23514', 'caso 6e: o total do item sem a fabricacao');
select pg_temp.passa($$update orcamentista_orcamento_item set custo_liquido_total = null, custo_fabricacao = null, tempo_fabricacao_min = null, valor_minuto = null
  where id = '50000000-0000-4000-8000-000000000001'$$, 'caso 6f: o item so com os materiais, sem fabricacao nem total, passa');
select pg_temp.recusa($$update orcamentista_orcamento set valor_venda = null, valor_total_bruto = null where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 6g: o liquido do orcamento sem o bruto');
select pg_temp.recusa($$update orcamentista_orcamento set valor_total_liquido = null where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 6h: o valor de venda sem o liquido');

-- 7. a comissão: só os dois modos do levantamento
select pg_temp.recusa($$update orcamentista_orcamento set comissao_modo = 'FIXA' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 7a: modo de comissao fora da lista');
select pg_temp.passa($$update orcamentista_orcamento set comissao_modo = 'CONGELADA' where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 7b: modo CONGELADA passa');

-- 7c. o responsável pela reserva técnica: a forma do levantamento (sem espaço nas pontas, até 120)
select pg_temp.passa($$update orcamentista_orcamento set reserva_tecnica_responsavel = 'Arquiteta Marina Lopes' where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 7c: responsavel pela RT passa');
select pg_temp.confere((select reserva_tecnica_responsavel = 'Arquiteta Marina Lopes' from orcamentista_orcamento where id = '30000000-0000-4000-8000-000000000001'), 'caso 7d: o responsavel le como foi gravado');
select pg_temp.recusa($$update orcamentista_orcamento set reserva_tecnica_responsavel = 'Marina ' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 7e: responsavel com espaco no fim');
select pg_temp.recusa($$update orcamentista_orcamento set reserva_tecnica_responsavel = ' Marina' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 7f: responsavel com espaco no comeco');
select pg_temp.recusa($$update orcamentista_orcamento set reserva_tecnica_responsavel = '' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 7g: responsavel vazio (vazio e nulo, nao texto)');
select pg_temp.recusa(format('update orcamentista_orcamento set reserva_tecnica_responsavel = %L where id = %L', repeat('m', 121), '30000000-0000-4000-8000-000000000001'), '23514', 'caso 7h: responsavel acima de 120');
select pg_temp.passa(format('update orcamentista_orcamento set reserva_tecnica_responsavel = %L where id = %L', repeat('m', 120), '30000000-0000-4000-8000-000000000001'), 'caso 7i: responsavel com 120 passa');
select pg_temp.passa($$update orcamentista_orcamento set reserva_tecnica_responsavel = null where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 7j: responsavel nulo passa');
select pg_temp.confere((select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_orcamento_reserva_tecnica_responsavel_forma')
  = 'CHECK (((reserva_tecnica_responsavel IS NULL) OR ((reserva_tecnica_responsavel ~ ''^\S(.*\S)?$''::text) AND (char_length(reserva_tecnica_responsavel) <= 120))))',
  'caso 7k: a CHECK do responsavel e a do levantamento, letra por letra (medida em producao)');

-- 8. o modo de aproveitamento do pedido: modo, origem, motivo e autor andam juntos
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_modo = 'COM' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8a: modo sem origem');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_origem = 'base_de_conhecimento' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8b: origem sem modo');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_modo = 'PARCIAL', aproveitamento_origem = 'base_de_conhecimento' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8c: modo fora da lista');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_modo = 'COM', aproveitamento_origem = 'tela', aproveitamento_motivo = 'qualquer' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8d: origem fora da lista');
select pg_temp.passa($$update orcamentista_orcamento set aproveitamento_modo = 'COM', aproveitamento_origem = 'base_de_conhecimento' where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 8e: da base de conhecimento, sem motivo nem autor');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_motivo = 'porque sim' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8f: base de conhecimento com motivo');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_por = '40000000-0000-4000-8000-000000000001' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8g: base de conhecimento com autor');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_origem = 'alterado_no_orcamento', aproveitamento_por = '40000000-0000-4000-8000-000000000001'
  where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8h: alterado no orcamento sem motivo');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_origem = 'alterado_no_orcamento', aproveitamento_motivo = 'o cliente pediu barra inteira'
  where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8i: alterado no orcamento sem autor');
select pg_temp.passa($$update orcamentista_orcamento set aproveitamento_modo = 'SEM', aproveitamento_origem = 'alterado_no_orcamento', aproveitamento_motivo = 'o cliente pediu barra inteira',
  aproveitamento_por = '40000000-0000-4000-8000-000000000001' where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 8j: alterado no orcamento com motivo e autor');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_modo = 'COM', aproveitamento_origem = 'fallback_barra_inteira', aproveitamento_por = null
  where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8k: o fallback COM aproveitamento');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_modo = 'SEM', aproveitamento_origem = 'fallback_barra_inteira'
  where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8l: o fallback com autor humano');
select pg_temp.passa($$update orcamentista_orcamento set aproveitamento_modo = 'SEM', aproveitamento_origem = 'fallback_barra_inteira', aproveitamento_por = null,
  aproveitamento_motivo = 'divergencia do pre-setado: 3 codigos sem medida de barra' where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 8m: o fallback SEM, com motivo e sem autor');
select pg_temp.recusa($$update orcamentista_orcamento set aproveitamento_motivo = ' com espaco na ponta' where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 8n: motivo com espaco na ponta');
select pg_temp.recusa(format('update orcamentista_orcamento set aproveitamento_motivo = %L where id = %L', repeat('x', 501), '30000000-0000-4000-8000-000000000001'), '23514', 'caso 8o: motivo acima de 500');
select pg_temp.passa(format('update orcamentista_orcamento set aproveitamento_motivo = %L where id = %L', repeat('x', 500), '30000000-0000-4000-8000-000000000001'), 'caso 8p: motivo com 500 passa');
select pg_temp.passa($$update orcamentista_orcamento set aproveitamento_modo = null, aproveitamento_origem = null, aproveitamento_motivo = null
  where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 8q: tudo nulo volta a valer');

-- 9. os grants: as colunas novas herdam os da tabela
select pg_temp.confere(not has_column_privilege('anon', 'public.orcamentista_orcamento', 'valor_venda', 'SELECT')
  and not has_column_privilege('authenticated', 'public.orcamentista_orcamento_item', 'custo_liquido_total', 'SELECT'), 'caso 9a: anon e authenticated nao leem as colunas novas');
select pg_temp.confere(has_column_privilege('service_role', 'public.orcamentista_orcamento', 'valor_venda', 'UPDATE')
  and not has_table_privilege('service_role', 'public.orcamentista_orcamento_item', 'DELETE'), 'caso 9b: service_role grava as colunas novas e continua sem DELETE');

-- 10. a forma: 49 colunas, 40 constraints, e nenhuma coluna desta migração com default
select pg_temp.confere((select count(*) from information_schema.columns where table_schema = 'public'
  and table_name in ('orcamentista_orcamento', 'orcamentista_orcamento_item')) = 50, 'caso 10a: 50 colunas');
select pg_temp.confere((select count(*) from pg_constraint where conrelid in ('orcamentista_orcamento'::regclass, 'orcamentista_orcamento_item'::regclass)) = 41, 'caso 10b: 41 constraints');
select pg_temp.confere((select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public'
  and table_name in ('orcamentista_orcamento', 'orcamentista_orcamento_item') and column_default is not null) = 'atualizado_em,atualizado_em,criado_em,criado_em,id,id',
  'caso 10c: so id, criado_em e atualizado_em tem default');
