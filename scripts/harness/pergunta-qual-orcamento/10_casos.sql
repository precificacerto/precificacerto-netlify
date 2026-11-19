-- Os casos: cada um imprime "ok: ..." ou "FALHOU ...". Rodam sobre a base com a migracao aplicada DUAS vezes.
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
-- CASO 1: a QUAL_ORCAMENTO grava, com os levantamentos da lista
select pg_temp.espera_ok($q$insert into orcamentista_pergunta_em_aberto (tenant_id, remetente_id, pergunta, nome, levantamentos) values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'QUAL_ORCAMENTO', 'Ana', '{c0000000-0000-0000-0000-000000000001,c0000000-0000-0000-0000-000000000002}')$q$, 'caso 1 — a QUAL_ORCAMENTO grava');
-- CASO 2: as quatro de antes continuam la, intactas
do $$ begin if (select count(*) from orcamentista_pergunta_em_aberto where pergunta in ('NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO', 'CONFIRMAR_APANHADO')) = 4
  then raise notice 'ok: caso 2 — as linhas de antes continuam'; else raise exception 'FALHOU caso 2'; end if; end $$;
-- CASO 3: codigo fora da lista continua recusado
select pg_temp.espera_erro($q$insert into orcamentista_pergunta_em_aberto (tenant_id, remetente_id, pergunta) values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'QUAL_LEVANTAMENTO')$q$, '23514', 'caso 3 — codigo fora da lista e recusado');
-- CASO 4: o upsert troca uma pergunta de antes pela QUAL_ORCAMENTO (o caminho de gravarPerguntaEmAberto)
select pg_temp.espera_ok($q$insert into orcamentista_pergunta_em_aberto (tenant_id, remetente_id, pergunta) values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'QUAL_ORCAMENTO') on conflict (tenant_id, remetente_id) do update set pergunta = excluded.pergunta$q$, 'caso 4 — o upsert troca para QUAL_ORCAMENTO');
