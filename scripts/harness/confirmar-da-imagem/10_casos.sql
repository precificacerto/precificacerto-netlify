\set ON_ERROR_STOP 0
create or replace function pg_temp.espera_erro(sqltxt text, codigo text, nome text) returns void language plpgsql as $$
begin
  begin execute sqltxt; exception when others then
    if sqlstate = codigo then raise notice 'ok: %', nome; return; end if;
    raise exception 'FALHOU %: sqlstate % (%)', nome, sqlstate, sqlerrm; end;
  raise exception 'FALHOU %: passou, e devia recusar', nome;
end $$;
create or replace function pg_temp.espera_ok(sqltxt text, nome text) returns void language plpgsql as $$
begin execute sqltxt; raise notice 'ok: %', nome;
exception when others then raise exception 'FALHOU %: % (%)', nome, sqlstate, sqlerrm; end $$;
-- CASO 1: a CONFIRMAR_DA_IMAGEM grava, com o nome, as esquadrias e a cidade lida da foto
select pg_temp.espera_ok($q$insert into orcamentista_pergunta_em_aberto (tenant_id, remetente_id, pergunta, nome, itens, dados_da_imagem) values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'CONFIRMAR_DA_IMAGEM', 'Alfredo Soares', '[{"largura_mm":1500}]', '{"endereco":"Barao"}')$q$, 'caso 1 — a CONFIRMAR_DA_IMAGEM grava com os dados da imagem');
-- CASO 2: as de antes continuam, com dados_da_imagem nula
do $$ begin if (select count(*) from orcamentista_pergunta_em_aberto where pergunta <> 'CONFIRMAR_DA_IMAGEM' and dados_da_imagem is null) = 4
  then raise notice 'ok: caso 2 — as linhas de antes continuam, sem dados da imagem'; else raise exception 'FALHOU caso 2'; end if; end $$;
-- CASO 3: dados_da_imagem que nao e objeto e recusado
select pg_temp.espera_erro($q$update orcamentista_pergunta_em_aberto set dados_da_imagem = '["Barao"]' where pergunta = 'SEM_NOME'$q$, '23514', 'caso 3 — dados_da_imagem que nao e objeto e recusado');
-- CASO 4: codigo fora da lista continua recusado; a QUAL_ORCAMENTO continua valendo
select pg_temp.espera_erro($q$insert into orcamentista_pergunta_em_aberto (tenant_id, remetente_id, pergunta) values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'OUTRA')$q$, '23514', 'caso 4 — codigo fora da lista e recusado');
-- CASO 5: a QUAL_ORCAMENTO continua valendo
select pg_temp.espera_ok($q$insert into orcamentista_pergunta_em_aberto (tenant_id, remetente_id, pergunta) values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'QUAL_ORCAMENTO')$q$, 'caso 5 — a QUAL_ORCAMENTO continua valendo');
