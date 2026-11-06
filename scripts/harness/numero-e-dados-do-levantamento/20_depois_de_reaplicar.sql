-- O CASO que roda DEPOIS de o run.sh reaplicar a migração sobre a base já usada pelos casos de 10_casos.sql.
\set ON_ERROR_STOP 0
-- CASO 14: reaplicar com levantamentos novos não apaga nem renumera nada (o run.sh reaplica antes deste caso)
DO $c$
DECLARE v text;
BEGIN
  SELECT string_agg(nome || '=' || numero, ',' ORDER BY tenant_id, numero) INTO v FROM orcamentista_levantamento;
  IF v = 'Obra Um=1,Obra Tres=3,Obra Quatro=4,Obra Um=1' THEN RAISE NOTICE 'ok: caso 14 — a reaplicacao com levantamentos novos nao apaga nem renumera (os 4 de agora ficam como estavam)';
  ELSE RAISE EXCEPTION 'FALHOU caso 14: %', v; END IF;
END $c$;

-- CASO 15: a UNIQUE (empresa, número) é a última trava — o contador recuado à mão não duplica número: 23505, e nada é gravado
create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'aceitou'; exception when others then return sqlstate; end $f$;
DO $c$
DECLARE v text; v_n int;
BEGIN
  UPDATE orcamentista_levantamento_contador SET ultimo = 2 WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  v := pg_temp.erro($s$insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    values ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra Repetida', 'obra repetida', 'EM_MONTAGEM')$s$);
  SELECT count(*) INTO v_n FROM orcamentista_levantamento WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND numero = 3;
  IF v = '23505' AND v_n = 1 THEN RAISE NOTICE 'ok: caso 15 — com o contador recuado, o numero 3 repetido e recusado pela UNIQUE (23505)';
  ELSE RAISE EXCEPTION 'FALHOU caso 15: % n3=%', v, v_n; END IF;
END $c$;
