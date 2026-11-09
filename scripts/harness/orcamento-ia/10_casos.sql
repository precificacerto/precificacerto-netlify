-- Os CASOS da 20261109000001, sobre a base com a migração aplicada DUAS vezes. Cada caso imprime "ok: …" ou "FALHOU: …".
\set ON_ERROR_STOP 0
\set A '''00000000-0000-4000-8000-0000000000a1'''
\set B '''00000000-0000-4000-8000-0000000000b2'''
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

-- 1. os dois que valem: o do agente (com levantamento, sem autor) e o manual (sem levantamento, com autor)
select pg_temp.passa($$insert into orcamentista_orcamento (id, tenant_id, numero, origem, levantamento_id, nome)
  values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 1, 'agente', '10000000-0000-4000-8000-000000000001', 'Antonio Rock')$$, 'caso 1a: orcamento do agente');
select pg_temp.passa($$insert into orcamentista_orcamento (id, tenant_id, numero, origem, nome, criado_por)
  values ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 2, 'manual', 'Cliente na loja', '40000000-0000-4000-8000-000000000001')$$, 'caso 1b: orcamento manual');
-- 2. a origem amarrada: nenhuma combinação trocada passa
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, levantamento_id, nome, criado_por)
  values ('00000000-0000-4000-8000-0000000000a1', 3, 'manual', '10000000-0000-4000-8000-000000000002', 'x', '40000000-0000-4000-8000-000000000001')$$, '23514', 'caso 2a: manual com levantamento');
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, nome)
  values ('00000000-0000-4000-8000-0000000000a1', 3, 'agente', 'x')$$, '23514', 'caso 2b: agente sem levantamento');
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, levantamento_id, nome, criado_por)
  values ('00000000-0000-4000-8000-0000000000a1', 3, 'agente', '10000000-0000-4000-8000-000000000002', 'x', '40000000-0000-4000-8000-000000000001')$$, '23514', 'caso 2c: agente com autor humano');
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, nome)
  values ('00000000-0000-4000-8000-0000000000a1', 3, 'manual', 'x')$$, '23514', 'caso 2d: manual sem autor');
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, nome, criado_por)
  values ('00000000-0000-4000-8000-0000000000a1', 3, 'importado', 'x', '40000000-0000-4000-8000-000000000001')$$, '23514', 'caso 2e: origem fora da lista');
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, nome, criado_por)
  values ('00000000-0000-4000-8000-0000000000a1', 3, 'x', '40000000-0000-4000-8000-000000000001')$$, '23502', 'caso 2f: origem nula');
-- 3. um orçamento por levantamento; o número único por empresa
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, levantamento_id, nome)
  values ('00000000-0000-4000-8000-0000000000a1', 3, 'agente', '10000000-0000-4000-8000-000000000001', 'de novo')$$, '23505', 'caso 3a: dois orcamentos do mesmo levantamento');
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, nome, criado_por)
  values ('00000000-0000-4000-8000-0000000000a1', 1, 'manual', 'x', '40000000-0000-4000-8000-000000000001')$$, '23505', 'caso 3b: numero repetido na empresa');
select pg_temp.passa($$insert into orcamentista_orcamento (tenant_id, numero, origem, nome, criado_por)
  values ('00000000-0000-4000-8000-0000000000b2', 1, 'manual', 'outra', '40000000-0000-4000-8000-000000000002')$$, 'caso 3c: o mesmo numero em outra empresa');
-- 4. o levantamento de outra empresa não serve
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, levantamento_id, nome)
  values ('00000000-0000-4000-8000-0000000000a1', 4, 'agente', '10000000-0000-4000-8000-000000000003', 'x')$$, '23503', 'caso 4: levantamento de outra empresa');
-- 5. a marca: as duas colunas juntas ou nenhuma
select pg_temp.recusa($$update orcamentista_orcamento set editado_manualmente_em = now() where id = '30000000-0000-4000-8000-000000000001'$$, '23514', 'caso 5a: marca sem autor');
select pg_temp.passa($$update orcamentista_orcamento set editado_manualmente_em = now(), editado_manualmente_por = '40000000-0000-4000-8000-000000000001'
  where id = '30000000-0000-4000-8000-000000000001'$$, 'caso 5b: marca inteira');
-- 6. a forma dos textos
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, nome, criado_por)
  values ('00000000-0000-4000-8000-0000000000a1', 5, 'manual', ' Antonio', '40000000-0000-4000-8000-000000000001')$$, '23514', 'caso 6a: nome com espaco na ponta');
select pg_temp.recusa($$insert into orcamentista_orcamento (tenant_id, numero, origem, nome, criado_por)
  values ('00000000-0000-4000-8000-0000000000a1', 0, 'manual', 'x', '40000000-0000-4000-8000-000000000001')$$, '23514', 'caso 6b: numero zero');
-- 7. os itens
select pg_temp.passa($$insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, levantamento_item_id, tipologia, largura_mm, altura_mm, quantidade, vidro)
  values ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 1, '20000000-0000-4000-8000-000000000001', 'DP-02', 1600, 1200, 2, 'incolor 4')$$, 'caso 7a: item ligado ao do levantamento');
select pg_temp.passa($$insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, quantidade)
  values ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000002', 1, 1)$$, 'caso 7b: item manual so com a quantidade');
select pg_temp.recusa($$insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, quantidade)
  values ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 1, 1)$$, '23505', 'caso 7c: ordem repetida');
select pg_temp.recusa($$insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, quantidade)
  values ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 2, 0)$$, '23514', 'caso 7d: quantidade zero');
select pg_temp.recusa($$insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, quantidade, largura_mm)
  values ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 2, 1, 0)$$, '23514', 'caso 7e: largura zero');
select pg_temp.recusa($$insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, quantidade)
  values ('00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000001', 2, 1)$$, '23503', 'caso 7f: item com o tenant de outra empresa');
select pg_temp.recusa($$insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, quantidade)
  values ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 0, 1)$$, '23514', 'caso 7g: ordem zero');
-- 8. a conversa apaga o item do levantamento que se fundiu: o do orçamento fica, sem o laço
delete from orcamentista_levantamento_item where id = '20000000-0000-4000-8000-000000000001';
select case when (select count(*) from orcamentista_orcamento_item where orcamento_id = '30000000-0000-4000-8000-000000000001' and levantamento_item_id is null) = 1
  then 'NOTICE:  ok: caso 8: o item do levantamento apagado deixa o do orcamento sem o laco'
  else 'NOTICE:  FALHOU: caso 8: o item do orcamento nao ficou com o laco nulo' end;
-- 8b. o SET NULL e so da coluna do laco: o tenant_id do item do orcamento fica o da empresa A
select case when (select count(*) from orcamentista_orcamento_item where orcamento_id = '30000000-0000-4000-8000-000000000001'
                   and levantamento_item_id is null and tenant_id = '00000000-0000-4000-8000-0000000000a1') = 1
  then 'NOTICE:  ok: caso 8b: o SET NULL anula so o levantamento_item_id, e o tenant_id fica'
  else 'NOTICE:  FALHOU: caso 8b: o tenant_id do item do orcamento mudou' end;
-- 11. ISOLAMENTO: um item de orcamento da empresa A nao aponta o item de levantamento da empresa B (a FK composta com o tenant)
select pg_temp.recusa($$insert into orcamentista_orcamento_item (tenant_id, orcamento_id, ordem, levantamento_item_id, quantidade)
  values ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 5, '20000000-0000-4000-8000-000000000009', 1)$$, '23503', 'caso 11: item de orcamento da empresa A apontando o item de levantamento da empresa B');
-- 12. a chave nova na tabela que ja existia
select case when (select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_levantamento_item_id_tenant_key') = 'UNIQUE (id, tenant_id)'
  then 'NOTICE:  ok: caso 12: orcamentista_levantamento_item ganhou a UNIQUE (id, tenant_id)'
  else 'NOTICE:  FALHOU: caso 12: a UNIQUE (id, tenant_id) do item do levantamento' end;
-- 9. documento de cliente não é arrastado: nem o levantamento nem a empresa levam o orçamento
select pg_temp.recusa($$delete from orcamentista_levantamento where id = '10000000-0000-4000-8000-000000000001'$$, '23503', 'caso 9a: apagar o levantamento de um orcamento');
select pg_temp.recusa($$delete from orcamentista_orcamento where id = '30000000-0000-4000-8000-000000000001'$$, '23503', 'caso 9b: apagar o orcamento com itens');
-- 9d. o levantamento de um orcamento SEM itens: e a FK do proprio orcamento que segura (o caso 9a podia ser segurado so pelos itens)
select pg_temp.passa($$insert into orcamentista_orcamento (id, tenant_id, numero, origem, levantamento_id, nome)
  values ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', 9, 'agente', '10000000-0000-4000-8000-000000000002', 'Alan Kremer')$$, 'caso 9d: orcamento do agente sem itens');
select pg_temp.recusa($$delete from orcamentista_levantamento where id = '10000000-0000-4000-8000-000000000002'$$, '23503', 'caso 9e: apagar o levantamento de um orcamento sem itens');
select pg_temp.recusa($$delete from tenants where id = '00000000-0000-4000-8000-0000000000b2'$$, '23503', 'caso 9c: apagar a empresa de um orcamento');
-- 10. os papéis: o service_role lê, insere e altera, e não apaga; anon e authenticated não leem
set role service_role;
select pg_temp.passa($$select count(*) from orcamentista_orcamento$$, 'caso 10a: service_role le');
select pg_temp.passa($$update orcamentista_orcamento set obs = 'alterado' where id = '30000000-0000-4000-8000-000000000002'$$, 'caso 10b: service_role altera');
select pg_temp.recusa($$delete from orcamentista_orcamento_item where orcamento_id = '30000000-0000-4000-8000-000000000002'$$, '42501', 'caso 10c: service_role nao apaga item');
select pg_temp.recusa($$delete from orcamentista_orcamento where id = '30000000-0000-4000-8000-000000000002'$$, '42501', 'caso 10d: service_role nao apaga orcamento');
select pg_temp.recusa($$truncate orcamentista_orcamento_item$$, '42501', 'caso 10e: service_role nao trunca');
reset role;
set role anon;
select pg_temp.recusa($$select count(*) from orcamentista_orcamento$$, '42501', 'caso 10f: anon nao le');
reset role;
set role authenticated;
select pg_temp.recusa($$select count(*) from orcamentista_orcamento_item$$, '42501', 'caso 10g: authenticated nao le');
reset role;
