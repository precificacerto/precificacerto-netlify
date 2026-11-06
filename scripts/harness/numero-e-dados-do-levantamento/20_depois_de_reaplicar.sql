-- OS CASOS que rodam DEPOIS de o run.sh reaplicar a migração sobre a base já usada pelos casos de 10_casos.sql.
\set ON_ERROR_STOP 0
create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'aceitou'; exception when others then return sqlstate; end $f$;

-- CASO 16: reaplicar com levantamentos novos (e o último apagado) não renumera nada, não recua o contador e não loga de novo
DO $c$
DECLARE v text; v_cont text; v_log int;
BEGIN
  SELECT string_agg(left(tenant_id::text, 2) || ':' || nome || '=' || numero, ',' ORDER BY tenant_id, numero) INTO v FROM orcamentista_levantamento;
  SELECT string_agg(left(tenant_id::text, 2) || '=' || proximo, ',' ORDER BY tenant_id) INTO v_cont FROM orcamentista_levantamento_contador;
  SELECT count(*) INTO v_log FROM superadmin_alteracao_log WHERE tabela <> 'outra';
  IF v = '20:Teste 1=1,20:Teste 2=2,20:Teste 3=3,20:Teste 4=4,20:Maria Cristina=5,20:Obra Sete=7,'
         || 'a0:B mais antigo=1,a0:B mesmo instante 1=2,a0:B mesmo instante 2=3,a0:Obra B=4,a0:Obra C=1,a0:Obra C2=2'
     AND v_cont = '20=9,a0=5,a0=3' AND v_log = 8 THEN
    RAISE NOTICE 'ok: caso 16 — a reaplicacao nao renumera, nao recua o contador (9 com o 8 apagado; 5 e 3) e nao loga de novo';
  ELSE RAISE EXCEPTION 'FALHOU caso 16: % / contador % / log %', v, v_cont, v_log; END IF;
END $c$;

-- CASO 17: a UNIQUE (empresa, número) é a última trava — o contador recuado à mão não duplica número: 23505, e nada é gravado
DO $c$
DECLARE v text; v_n int;
BEGIN
  UPDATE orcamentista_levantamento_contador SET proximo = 3 WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  v := pg_temp.erro($s$insert into orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    values ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Obra Repetida', 'obra repetida', 'EM_MONTAGEM')$s$);
  SELECT count(*) INTO v_n FROM orcamentista_levantamento WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND numero = 3;
  IF v = '23505' AND v_n = 1 THEN RAISE NOTICE 'ok: caso 17 — com o contador recuado, o numero 3 repetido e recusado pela UNIQUE (23505)';
  ELSE RAISE EXCEPTION 'FALHOU caso 17: % n3=%', v, v_n; END IF;
END $c$;
