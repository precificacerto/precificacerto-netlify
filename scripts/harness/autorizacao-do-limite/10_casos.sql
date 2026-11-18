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

-- CASO 1: as linhas de antes ficam com as seis colunas nulas
do $$ begin if (select count(*) from orcamentista_levantamento_item where coalesce(limite_tipologia, limite_largura_mm::text, limite_altura_mm::text, limite_pedido_em::text, limite_autorizado_por::text, limite_autorizado_em::text) is not null) = 0
  then raise notice 'ok: caso 1 — as linhas de antes nascem sem pedido nem autorizacao'; else raise exception 'FALHOU caso 1'; end if; end $$;
-- CASO 2: o pedido inteiro grava; a autorizacao pelo remetente da MESMA empresa grava
select pg_temp.espera_ok($q$update orcamentista_levantamento_item set limite_tipologia = 'DP-132', limite_largura_mm = 700, limite_altura_mm = 1200, limite_pedido_em = now() where ordem = 1$q$, 'caso 2a — o pedido grava');
select pg_temp.espera_ok($q$update orcamentista_levantamento_item set limite_autorizado_por = 'b0000000-0000-0000-0000-000000000001', limite_autorizado_em = now() where ordem = 1$q$, 'caso 2b — a autorizacao do remetente da empresa grava');
-- CASO 3: o remetente de OUTRA empresa nao autoriza (a FK composta)
select pg_temp.espera_erro($q$update orcamentista_levantamento_item set limite_autorizado_por = 'b0000000-0000-0000-0000-000000000002' where ordem = 1$q$, '23503', 'caso 3 — o remetente de outra empresa e recusado pela FK');
-- CASO 4: autorizacao sem pedido
select pg_temp.espera_erro($q$update orcamentista_levantamento_item set limite_autorizado_por = 'b0000000-0000-0000-0000-000000000001', limite_autorizado_em = now() where ordem = 2$q$, '23514', 'caso 4 — autorizacao sem pedido e recusada');
-- CASO 5: quem sem quando, e quando sem quem
select pg_temp.espera_erro($q$update orcamentista_levantamento_item set limite_autorizado_em = null where ordem = 1$q$, '23514', 'caso 5a — quem sem quando e recusado');
select pg_temp.espera_erro($q$update orcamentista_levantamento_item set limite_autorizado_por = null where ordem = 1$q$, '23514', 'caso 5b — quando sem quem e recusado');
-- CASO 6: o pedido pela metade (tipologia sem instante; medida sem tipologia; tipologia sem medida nenhuma)
select pg_temp.espera_erro($q$update orcamentista_levantamento_item set limite_tipologia = 'DP-02' where ordem = 2$q$, '23514', 'caso 6a — tipologia sem o instante e recusada');
select pg_temp.espera_erro($q$update orcamentista_levantamento_item set limite_largura_mm = 700 where ordem = 2$q$, '23514', 'caso 6b — medida sem tipologia e recusada');
select pg_temp.espera_erro($q$update orcamentista_levantamento_item set limite_tipologia = 'DP-02', limite_pedido_em = now() where ordem = 2$q$, '23514', 'caso 6c — tipologia sem medida nenhuma e recusada');
-- CASO 7: so uma medida dita vale (a outra fica nula, como no item)
select pg_temp.espera_ok($q$update orcamentista_levantamento_item set limite_tipologia = 'DP-02', limite_altura_mm = 600, limite_pedido_em = now() where ordem = 2$q$, 'caso 7 — o pedido com uma medida so grava');
-- CASO 8: limpar tudo de uma vez (a medida mudou) grava
select pg_temp.espera_ok($q$update orcamentista_levantamento_item set limite_tipologia = null, limite_largura_mm = null, limite_altura_mm = null, limite_pedido_em = null, limite_autorizado_por = null, limite_autorizado_em = null where ordem = 1$q$, 'caso 8 — limpar o pedido e a autorizacao juntos grava');
-- CASO 9: tirar o pedido e deixar a autorizacao e recusado
update orcamentista_levantamento_item set limite_tipologia = 'DP-132', limite_largura_mm = 700, limite_altura_mm = 1200, limite_pedido_em = now(), limite_autorizado_por = 'b0000000-0000-0000-0000-000000000001', limite_autorizado_em = now() where ordem = 1;
select pg_temp.espera_erro($q$update orcamentista_levantamento_item set limite_tipologia = null, limite_largura_mm = null, limite_altura_mm = null, limite_pedido_em = null where ordem = 1$q$, '23514', 'caso 9 — tirar o pedido deixando a autorizacao e recusado');
-- CASO 10: o remetente que autorizou nao se apaga por baixo da autorizacao
select pg_temp.espera_erro($q$delete from orcamentista_remetente_autorizado where id = 'b0000000-0000-0000-0000-000000000001'$q$, '23503', 'caso 10 — o remetente que autorizou nao se apaga');
