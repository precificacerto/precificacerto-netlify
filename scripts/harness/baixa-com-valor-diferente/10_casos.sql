-- Os dez casos da RPC, mais três de contorno. Cada caso: monta a série, chama, afirma no BANCO.
-- `ok:` / `FALHOU:` é o que o runner conta.
\set QUIET on
set client_min_messages = notice;

-- ── utilidades de teste (só existem no harness) ─────────────────────────────────────────
insert into public.tenants values ('00000000-0000-0000-0000-00000000000a') on conflict do nothing;
insert into auth.users    values ('00000000-0000-0000-0000-0000000000a1') on conflict do nothing;

create or replace function fx_reset() returns void language sql as $$
  delete from public.parcela_reajuste_log; delete from public.cash_entries; $$;

-- uma parcela; `pago` nulo = em aberto
create or replace function fx(p_id int, p_venda int, p_valor numeric, p_venc date, p_pago date default null)
returns uuid language sql as $$
  insert into public.cash_entries (id, tenant_id, type, amount, due_date, paid_date, origin_type, origin_id, payment_method)
  values (('00000000-0000-0000-0000-' || lpad(p_id::text,12,'0'))::uuid,
          '00000000-0000-0000-0000-00000000000a', 'INCOME', p_valor, p_venc, p_pago,
          'SALE', ('00000000-0000-0000-0001-' || lpad(p_venda::text,12,'0'))::uuid, 'BOLETO')
  returning id $$;
create or replace function pid(p int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(p::text,12,'0'))::uuid $$;
create or replace function val(p int) returns numeric language sql as $$
  select amount from public.cash_entries where id = pid(p) $$;
create or replace function soma(p_venda int) returns numeric language sql as $$
  select sum(amount) from public.cash_entries
   where origin_id = ('00000000-0000-0000-0001-' || lpad(p_venda::text,12,'0'))::uuid and is_active $$;
create or replace function baixa(p int, p_valor numeric, p_forma public.payment_method default 'PIX')
returns jsonb language sql as $$
  select public.dar_baixa_com_valor_diferente(pid(p), '00000000-0000-0000-0000-00000000000a',
         '00000000-0000-0000-0000-0000000000a1', p_valor, date '2026-10-16', p_forma) $$;
-- retrato da tabela, para afirmar "nada foi gravado"
create or replace function retrato() returns text language sql as $$
  select coalesce(string_agg(id::text||'|'||amount||'|'||coalesce(paid_date::text,'-')||'|'||coalesce(payment_method::text,'-'), ';' order by id),'')
         || '#log=' || (select count(*) from public.parcela_reajuste_log) from public.cash_entries $$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- (a) SÉRIE QUE JÁ DIVERGE do total da venda — a forma de VD-6FE7D9 (8 parcelas, 5 em aberto,
--     soma 269.999,96 contra 270.000,00). A invariante é de DELTA: a divergência fica.
do $$ declare antes numeric; depois numeric; total_da_venda numeric := 270000.00; begin
  perform fx_reset();
  perform fx(1,1,33750.00,'2026-01-10','2026-01-10'); perform fx(2,1,33749.96,'2026-02-10','2026-02-10');
  perform fx(3,1,33750.00,'2026-03-10','2026-03-10');
  perform fx(4,1,33750.00,'2026-04-10'); perform fx(5,1,33750.00,'2026-05-10'); perform fx(6,1,33750.00,'2026-06-10');
  perform fx(7,1,33750.00,'2026-07-10'); perform fx(8,1,33750.00,'2026-08-10');
  antes := soma(1);
  perform baixa(4, 30000.00);
  depois := soma(1);
  if antes <> 269999.96 then raise exception 'FALHOU a: a fixture não diverge como devia (%)', antes; end if;
  if depois <> antes then raise exception 'FALHOU a: soma antes % depois %', antes, depois; end if;
  if (depois - total_da_venda) <> (antes - total_da_venda) then raise exception 'FALHOU a: a divergência mudou'; end if;
  if val(5)<>34687.50 or val(8)<>34687.50 then raise exception 'FALHOU a: rateio % / %', val(5), val(8); end if;
  raise notice 'ok: (a) soma % = %, divergência com o total da venda segue %', antes, depois, depois - total_da_venda;
end $$;

-- (b) PROPORCIONAL com valores DIFERENTES — 1.000/2.000/3.000, pagou 440 de 500: +60 → 10/20/30
do $$ begin
  perform fx_reset();
  perform fx(1,2,500.00,'2026-10-01'); perform fx(2,2,1000.00,'2026-11-01');
  perform fx(3,2,2000.00,'2026-12-01'); perform fx(4,2,3000.00,'2027-01-01');
  perform baixa(1, 440.00);
  if val(1)<>440.00 or val(2)<>1010.00 or val(3)<>2020.00 or val(4)<>3030.00 then
    raise exception 'FALHOU b: % % % %', val(1), val(2), val(3), val(4); end if;
  raise notice 'ok: (b) 440,00 | 1.010,00 | 2.020,00 | 3.030,00 — proporcional, nem igual (20/20/20) nem tudo na próxima (60/0/0)';
end $$;

-- (c) parcelas IGUAIS: proporcional É igual
do $$ begin
  perform fx_reset();
  perform fx(1,3,100.00,'2026-10-01'); perform fx(2,3,100.00,'2026-11-01');
  perform fx(3,3,100.00,'2026-12-01'); perform fx(4,3,100.00,'2027-01-01');
  perform baixa(1, 97.00);
  if val(2)<>101.00 or val(3)<>101.00 or val(4)<>101.00 then raise exception 'FALHOU c: % % %', val(2), val(3), val(4); end if;
  raise notice 'ok: (c) 101,00 | 101,00 | 101,00 — a regra simples está contida na geral';
end $$;

-- (d) RESÍDUO de R$ 0,01 em três: cai na ÚLTIMA por due_date, e é SEMPRE a mesma
do $$ declare i int; begin
  for i in 1..3 loop
    perform fx_reset();
    perform fx(1,4,100.00,'2026-10-01'); perform fx(2,4,100.00,'2026-11-01');
    perform fx(3,4,100.00,'2026-12-01'); perform fx(4,4,100.00,'2027-01-01');
    perform baixa(1, 99.99);
    if val(2)<>100.00 or val(3)<>100.00 or val(4)<>100.01 then
      raise exception 'FALHOU d (rodada %): % % %', i, val(2), val(3), val(4); end if;
  end loop;
  raise notice 'ok: (d) 100,00 | 100,00 | 100,01 — três rodadas, o centavo na mesma parcela';
end $$;

-- (d2) EMPATE de vencimento desfeito pelo id, e a parcela SEM vencimento vai para o fim
do $$ begin
  perform fx_reset();
  perform fx(1,5,100.00,'2026-10-01');
  perform fx(3,5,100.00,'2026-11-01'); perform fx(2,5,100.00,'2026-11-01');   -- empate: id 2 antes do 3
  perform baixa(1, 99.99);
  if val(3)<>100.01 or val(2)<>100.00 then raise exception 'FALHOU d2 empate: id2 % id3 %', val(2), val(3); end if;
  perform fx_reset();
  perform fx(1,6,100.00,'2026-10-01'); perform fx(2,6,100.00,'2026-11-01');
  perform fx(3,6,100.00,null);                                                 -- sem vencimento
  perform baixa(1, 99.99);
  if val(3)<>100.01 then raise exception 'FALHOU d2 nulo: a sem vencimento ficou %', val(3); end if;
  raise notice 'ok: (d2) empate → maior id leva o centavo; sem vencimento → é a última e leva o centavo';
end $$;

-- (e) pagou a MAIS e pagou a MENOS: mesma fórmula, sinais opostos
do $$ begin
  perform fx_reset();
  perform fx(1,7,500.00,'2026-10-01'); perform fx(2,7,1000.00,'2026-11-01');
  perform fx(3,7,2000.00,'2026-12-01'); perform fx(4,7,3000.00,'2027-01-01');
  perform baixa(1, 560.00);
  if val(2)<>990.00 or val(3)<>1980.00 or val(4)<>2970.00 then raise exception 'FALHOU e: % % %', val(2), val(3), val(4); end if;
  raise notice 'ok: (e) pagou 560 de 500 → 990 | 1.980 | 2.970 — o espelho exato de (b)';
end $$;

-- (f) a conta NEGATIVARIA ou ZERARIA uma restante → RECUSA INTEIRA, nada gravado
do $$ declare antes text; ok_neg bool := false; ok_zero bool := false; begin
  perform fx_reset();
  perform fx(1,8,100.00,'2026-10-01'); perform fx(2,8,50.00,'2026-11-01');
  antes := retrato();
  begin perform baixa(1, 200.00); exception when sqlstate 'PC003' then ok_neg := true; end;
  if not ok_neg then raise exception 'FALHOU f: negativo não foi recusado'; end if;
  if retrato() <> antes then raise exception 'FALHOU f: gravou algo na recusa'; end if;
  begin perform baixa(1, 150.00); exception when sqlstate 'PC003' then ok_zero := true; end;
  if not ok_zero then raise exception 'FALHOU f: zero não foi recusado'; end if;
  if retrato() <> antes then raise exception 'FALHOU f: gravou algo na recusa do zero'; end if;
  raise notice 'ok: (f) −50 e 0,00 recusados com PC003, tabela e log idênticos ao antes';
end $$;

-- (g) ÚLTIMA EM ABERTO com valor diferente → RECUSA INTEIRA, nem a baixa
do $$ declare antes text; ok bool := false; begin
  perform fx_reset();
  perform fx(1,9,100.00,'2026-09-01','2026-09-01'); perform fx(2,9,100.00,'2026-10-01');
  antes := retrato();
  begin perform baixa(2, 80.00); exception when sqlstate 'PC005' then ok := true; end;
  if not ok then raise exception 'FALHOU g: não recusou'; end if;
  if retrato() <> antes then raise exception 'FALHOU g: gravou a baixa pelo combinado'; end if;
  raise notice 'ok: (g) última em aberto recusada com PC005, paid_date segue nulo, valor segue 100,00';
end $$;

-- (h) PARCELA JÁ PAGA → recusa pela idempotência; e a SEGUNDA chamada igual também
do $$ declare antes text; ok1 bool := false; ok2 bool := false; begin
  perform fx_reset();
  perform fx(1,10,100.00,'2026-10-01','2026-10-05'); perform fx(2,10,100.00,'2026-11-01');
  antes := retrato();
  begin perform baixa(1, 90.00); exception when sqlstate 'PC004' then ok1 := true; end;
  if not ok1 or retrato() <> antes then raise exception 'FALHOU h: paga não foi recusada limpa'; end if;
  perform fx_reset();
  perform fx(1,11,100.00,'2026-10-01'); perform fx(2,11,100.00,'2026-11-01'); perform fx(3,11,100.00,'2026-12-01');
  perform baixa(1, 90.00);
  antes := retrato();
  begin perform baixa(1, 90.00); exception when sqlstate 'PC004' then ok2 := true; end;
  if not ok2 or retrato() <> antes then raise exception 'FALHOU h: segunda chamada gravou'; end if;
  raise notice 'ok: (h) paga recusada com PC004; a segunda chamada idêntica também, sem gravar nada';
end $$;

-- (i) UMA LINHA DE LOG POR PARCELA AFETADA — a paga e cada reajustada; delta zero só a paga
do $$ declare n int; ops int; autor_ok bool; begin
  perform fx_reset();
  perform fx(1,12,500.00,'2026-10-01'); perform fx(2,12,1000.00,'2026-11-01');
  perform fx(3,12,2000.00,'2026-12-01'); perform fx(4,12,3000.00,'2027-01-01');
  perform baixa(1, 440.00);
  select count(*), count(distinct operacao_id), bool_and(criado_por='00000000-0000-0000-0000-0000000000a1')
    into n, ops, autor_ok from public.parcela_reajuste_log;
  if n<>4 or ops<>1 or not autor_ok then raise exception 'FALHOU i: % linhas, % operações, autor %', n, ops, autor_ok; end if;
  if (select count(*) from public.parcela_reajuste_log where papel='PAGA' and valor_antes=500 and valor_depois=440 and forma='PIX')<>1
     or (select count(*) from public.parcela_reajuste_log where papel='REAJUSTADA')<>3
     or (select sum(valor_depois-valor_antes) from public.parcela_reajuste_log where papel='REAJUSTADA')<>60.00 then
    raise exception 'FALHOU i: conteúdo do log'; end if;
  perform fx_reset();
  perform fx(1,13,100.00,'2026-10-01'); perform fx(2,13,100.00,'2026-11-01');
  perform baixa(1, 100.00);
  if (select count(*) from public.parcela_reajuste_log)<>1 then raise exception 'FALHOU i: delta zero logou reajustada'; end if;
  raise notice 'ok: (i) 4 linhas (1 PAGA + 3 REAJUSTADA), 1 operação, autor gravado; delta zero → só a PAGA';
end $$;

-- (j) ROLLBACK: força a invariante a falhar NO MEIO e afirma que NADA ficou, nem a baixa.
--     Um trigger de teste mexe num centavo de uma parcela PAGA da mesma série durante o
--     UPDATE da RPC — a soma relida do banco diverge, e a RPC tem de desfazer tudo.
create or replace function fx_sabota() returns trigger language plpgsql as $$
begin
  update public.cash_entries set amount = amount + 0.01
   where origin_id = new.origin_id and paid_date is not null and id <> new.id;
  return new;
end $$;
do $$ declare antes text; ok bool := false; begin
  perform fx_reset();
  perform fx(1,14,100.00,'2026-09-01','2026-09-01');
  perform fx(2,14,100.00,'2026-10-01'); perform fx(3,14,100.00,'2026-11-01');
  create trigger fx_sabota before update of paid_date on public.cash_entries
    for each row when (new.paid_date is not null and old.paid_date is null) execute function fx_sabota();
  antes := retrato();
  begin perform baixa(2, 90.00); exception when sqlstate 'PC009' then ok := true; end;
  drop trigger fx_sabota on public.cash_entries;
  if not ok then raise exception 'FALHOU j: a invariante não disparou'; end if;
  if retrato() <> antes then raise exception 'FALHOU j: sobrou gravação depois do rollback'; end if;
  raise notice 'ok: (j) invariante violada → PC009, e a baixa, o reajuste, o log e a sabotagem voltaram';
end $$;

-- ── contorno ────────────────────────────────────────────────────────────────────────────
do $$ declare antes text; ok bool := false; begin
  perform fx_reset(); perform fx(1,15,100.00,'2026-10-01'); perform fx(2,15,100.00,'2026-11-01');
  antes := retrato();
  begin perform public.dar_baixa_com_valor_diferente(pid(1), '00000000-0000-0000-0000-00000000000a', null, 90.00, date '2026-10-16', 'PIX');
  exception when sqlstate 'PC001' then ok := true; end;
  if not ok or retrato()<>antes then raise exception 'FALHOU k: baixa sem autor passou'; end if;
  raise notice 'ok: (k) sem autor → PC001, nada gravado — o log não nasce anônimo';
end $$;
do $$ declare ok bool := false; begin
  perform fx_reset();
  insert into public.cash_entries (id, tenant_id, type, amount, due_date)
  values (pid(1), '00000000-0000-0000-0000-00000000000a', 'INCOME', 100.00, '2026-10-01');
  begin perform baixa(1, 90.00); exception when sqlstate 'PC002' then ok := true; end;
  if not ok then raise exception 'FALHOU l: parcela sem série não foi recusada'; end if;
  raise notice 'ok: (l) parcela sem série → PC002';
end $$;
do $$ declare ok bool := false; begin
  perform fx_reset(); perform fx(1,16,100.00,'2026-10-01'); perform fx(2,16,100.00,'2026-11-01');
  perform baixa(1, 90.00, null);
  if (select payment_method from public.cash_entries where id=pid(1)) <> 'BOLETO' then
    raise exception 'FALHOU m: forma nula apagou a combinada'; end if;
  raise notice 'ok: (m) forma nula preserva BOLETO — o coalesce do achado 3';
end $$;
