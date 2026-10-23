-- HARNESS das FUNÇÕES dos três níveis (migração 20261023000003). NÃO TOCA PRODUÇÃO.
-- Um caso por bloco `-- CASO`. Cada caso emite UMA linha `ok:` (NOTICE) ou `FALHOU:` (ERROR).
-- `run.sh` conta os `ok:` contra o número de blocos `-- CASO` mais o caso de concorrência.
-- O que cada mutação de `mutacoes.py` derruba está no README.
\set ON_ERROR_STOP 0
INSERT INTO tenants VALUES ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000c3');
INSERT INTO users (id, is_super_admin) VALUES ('00000000-0000-0000-0000-00000000005a', true), ('00000000-0000-0000-0000-0000000000c0', false);
INSERT INTO orcamentista_nicho VALUES ('00000000-0000-0000-0000-0000000000e1', 'FABRICACAO', 'Esquadrias'), ('00000000-0000-0000-0000-0000000000e2', 'FABRICACAO', 'Marcenaria');
INSERT INTO orcamentista_config (tenant_id, modelo, nicho_id) VALUES ('00000000-0000-0000-0000-0000000000a1', 'FABRICACAO', '00000000-0000-0000-0000-0000000000e1'),
                                                                     ('00000000-0000-0000-0000-0000000000b2', 'FABRICACAO', '00000000-0000-0000-0000-0000000000e2');
INSERT INTO orcamentista_fornecedor (id, nicho_id, nome) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'Wolff'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'Alcoa'), ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e2', 'Madeireira');

CREATE FUNCTION pg_temp.erro(caso text, sqlx text, codigo text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE n0 int := (SELECT count(*) FROM superadmin_alteracao_log);
BEGIN
  BEGIN EXECUTE sqlx; EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> codigo THEN RAISE EXCEPTION 'FALHOU: % — recusado com % e nao %: %', caso, SQLSTATE, codigo, SQLERRM; END IF;
    IF (SELECT count(*) FROM superadmin_alteracao_log) <> n0 THEN RAISE EXCEPTION 'FALHOU: % — recusado, mas sobrou linha de log', caso; END IF;
    RAISE NOTICE 'ok: % (recusado, %: %)', caso, SQLSTATE, SQLERRM; RETURN;
  END;
  RAISE EXCEPTION 'FALHOU: % — ACEITO, devia ser recusado', caso;
END $f$;
CREATE FUNCTION pg_temp.mp(t text, nome text) RETURNS uuid LANGUAGE sql AS $f$ SELECT id FROM orcamentista_materia_prima WHERE tenant_id = t::uuid AND lower(nome) = lower($2) $f$;
CREATE FUNCTION pg_temp.cat(t text, nome text, c text) RETURNS uuid LANGUAGE sql AS $f$
  SELECT k.id FROM orcamentista_mp_categoria k JOIN orcamentista_materia_prima m ON m.id = k.materia_prima_id
   WHERE m.tenant_id = t::uuid AND lower(m.nome) = lower($2) AND k.categoria_chave = $3 $f$;
CREATE FUNCTION pg_temp.logs() RETURNS int LANGUAGE sql AS $f$ SELECT count(*)::int FROM superadmin_alteracao_log $f$;
\set A '\'00000000-0000-0000-0000-0000000000a1\''
\set S '\'00000000-0000-0000-0000-00000000005a\''

-- CASO 1
SELECT pg_temp.erro('materia-prima: autor que nao e super admin', $$SELECT superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c0','[{"nome":"PVC"}]')$$, '42501');
-- CASO 2
SELECT pg_temp.erro('materia-prima: empresa inexistente', $$SELECT superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000ff','00000000-0000-0000-0000-00000000005a','[{"nome":"PVC"}]')$$, 'P0002');
-- CASO 3
DO $$ DECLARE n0 int := pg_temp.logs(); r jsonb; BEGIN
  r := superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a','[{"nome":"PVC"},{"nome":"Alumínio"}]');
  IF (SELECT string_agg(nome || ':' || ordem, ',' ORDER BY ordem) FROM orcamentista_materia_prima WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1') <> 'PVC:1,Alumínio:2' THEN RAISE EXCEPTION 'FALHOU: ordem nao e a posicao'; END IF;
  IF (SELECT count(*) FROM orcamentista_mp_categoria WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1' AND config IS NULL) <> 12 THEN RAISE EXCEPTION 'FALHOU: nao criou as 6 categorias por materia-prima com config NULL'; END IF;
  IF pg_temp.logs() <> n0 + 1 THEN RAISE EXCEPTION 'FALHOU: esperada 1 linha de log'; END IF;
  IF (SELECT tabela FROM superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1) <> 'orcamentista_materia_prima,orcamentista_mp_categoria' THEN RAISE EXCEPTION 'FALHOU: tabela do log'; END IF;
  IF jsonb_array_length(r -> 'orcamentista_mp_categoria') <> 12 THEN RAISE EXCEPTION 'FALHOU: o depois nao traz as categorias'; END IF;
  RAISE NOTICE 'ok: materia-prima nova: ordem pela posicao, as 6 categorias com config NULL, 1 linha de log com as duas tabelas';
END $$;
-- CASO 4
DO $$ DECLARE v_id uuid := pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc'); BEGIN
  PERFORM superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a','[{"nome":"Alumínio"},{"nome":"pvc"}]');
  IF (SELECT string_agg(nome || ':' || ordem, ',' ORDER BY ordem) FROM orcamentista_materia_prima WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1') <> 'Alumínio:1,pvc:2' THEN RAISE EXCEPTION 'FALHOU: reordenar falhou'; END IF;
  IF pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc') <> v_id THEN RAISE EXCEPTION 'FALHOU: a chave natural lower(nome) trocou o id'; END IF;
  IF (SELECT count(*) FROM orcamentista_mp_categoria WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1') <> 12 THEN RAISE EXCEPTION 'FALHOU: criou categoria para materia-prima existente'; END IF;
  IF (SELECT tabela FROM superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1) <> 'orcamentista_materia_prima' THEN RAISE EXCEPTION 'FALHOU: tabela do log'; END IF;
  RAISE NOTICE 'ok: reordenar e trocar caixa: mesmo id (lower(nome)), ordem pela posicao, nenhuma categoria nova';
END $$;
-- CASO 5
DO $$ BEGIN
  PERFORM superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a','[{"nome":"Alumínio"}]');
  IF pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc') IS NULL THEN RAISE EXCEPTION 'FALHOU: APAGOU a materia-prima que nao veio'; END IF;
  RAISE NOTICE 'ok: materia-prima fora da lista NAO e apagada';
END $$;
-- CASO 6
SELECT pg_temp.erro('materia-prima: ordem no corpo', $$SELECT superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a','[{"nome":"PVC","ordem":9}]')$$, '22023');
-- CASO 7
SELECT pg_temp.erro('materia-prima: repetida com caixa diferente', $$SELECT superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a','[{"nome":"PVC"},{"nome":"pvc"}]')$$, '22023');
-- CASO 8
SELECT pg_temp.erro('materia-prima: campo desconhecido', $$SELECT superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a','[{"nome":"PVC","cor":"x"}]')$$, '22023');
-- CASO 9
SELECT pg_temp.erro('materia-prima: lista vazia', $$SELECT superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a','[]')$$, '22023');

-- CASO 10
DO $$ DECLARE v_mp uuid := pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc'); c jsonb; BEGIN
  PERFORM superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', v_mp, 'PERFIL', '{"linha":"Suprema","barra_mm":6000,"cores":["Branco"]}');
  PERFORM superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', v_mp, 'PERFIL', '{"solda":null,"barra_mm":5800}');
  SELECT config INTO c FROM orcamentista_mp_categoria WHERE materia_prima_id = v_mp AND categoria_chave = 'PERFIL';
  IF c ->> 'linha' IS DISTINCT FROM 'Suprema' THEN RAISE EXCEPTION 'FALHOU: merge perdeu a chave ausente: %', c; END IF;
  IF (c -> 'barra_mm')::text <> '5800' THEN RAISE EXCEPTION 'FALHOU: merge nao atualizou'; END IF;
  IF NOT (c ? 'solda') OR jsonb_typeof(c -> 'solda') <> 'null' THEN RAISE EXCEPTION 'FALHOU: null nao ficou gravado como null: %', c; END IF;
  IF c ? 'serra_mm' THEN RAISE EXCEPTION 'FALHOU: chave nunca enviada apareceu'; END IF;
  RAISE NOTICE 'ok: categoria: merge — ausente fica, null grava null (chave presente), e as duas coisas seguem distinguiveis';
END $$;
-- CASO 11
SELECT pg_temp.erro('categoria: chave fora do catalogo da categoria', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'PERFIL', '{"espessura":3,"linha":"x"}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc')), '22023');
-- CASO 12
SELECT pg_temp.erro('categoria: FERRAGENS nao tem campo — qualquer chave e recusada', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'FERRAGENS', '{"linha":"x"}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc')), '22023');
-- CASO 13
SELECT pg_temp.erro('categoria: inteiro fracionario (barra_mm 6000.5)', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'PERFIL', '{"barra_mm":6000.5}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc')), '22023');
-- CASO 14
SELECT pg_temp.erro('categoria: inteiro em texto', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'PERFIL', '{"barra_mm":"6000"}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc')), '22023');
-- CASO 15
SELECT pg_temp.erro('categoria: lista_texto com numero', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'PERFIL', '{"cores":["Branco",1]}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc')), '22023');
-- CASO 16
SELECT pg_temp.erro('categoria: mapa que e lista', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'ACESSORIOS_VEDACAO', '{"cor_por_perfil":["branco"]}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc')), '22023');
-- CASO 17
SELECT pg_temp.erro('categoria: booleano em texto', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'REFORCO', '{"usa":"sim"}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc')), '22023');
-- CASO 18
DO $$ BEGIN
  PERFORM superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-00000000005a','[{"nome":"MDF"}]');
  RAISE NOTICE 'ok: (preparo) a empresa B tem a sua materia-prima';
END $$;
-- CASO 19
SELECT pg_temp.erro('categoria: materia-prima de OUTRA empresa', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'PERFIL', '{"linha":"x"}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000b2','mdf')), 'P0002');
-- CASO 20
SELECT pg_temp.erro('categoria: categoria desconhecida', format($$SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, 'ESCOVA', '{"linha":"x"}')$$, pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc')), '22023');

-- CASO 21
DO $$ DECLARE k uuid := pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL'); BEGIN
  PERFORM superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":true},{"fornecedor_id":"00000000-0000-0000-0000-0000000000f2"}]');
  IF (SELECT string_agg(fornecedor_id::text || ':' || ordem || ':' || principal, ',' ORDER BY ordem) FROM orcamentista_mp_categoria_fornecedor WHERE mp_categoria_id = k)
     <> '00000000-0000-0000-0000-0000000000f1:1:true,00000000-0000-0000-0000-0000000000f2:2:false' THEN RAISE EXCEPTION 'FALHOU: estado inesperado'; END IF;
  RAISE NOTICE 'ok: fornecedores: dois, um principal, ordem pela posicao';
END $$;
-- CASO 22
SELECT pg_temp.erro('fornecedores: ZERO principal', format($$SELECT superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":false},{"fornecedor_id":"00000000-0000-0000-0000-0000000000f2","principal":false}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL')), '22023');
-- CASO 23
SELECT pg_temp.erro('fornecedores: DOIS principais', format($$SELECT superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":true},{"fornecedor_id":"00000000-0000-0000-0000-0000000000f2","principal":true}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL')), '22023');
-- CASO 24
DO $$ DECLARE k uuid := pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL'); BEGIN
  PERFORM superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":false},{"fornecedor_id":"00000000-0000-0000-0000-0000000000f2","principal":true}]');
  IF (SELECT fornecedor_id FROM orcamentista_mp_categoria_fornecedor WHERE mp_categoria_id = k AND principal) <> '00000000-0000-0000-0000-0000000000f2' THEN RAISE EXCEPTION 'FALHOU: nao trocou o principal'; END IF;
  RAISE NOTICE 'ok: fornecedores: TROCAR o principal passa (sem violar o indice unico no meio)';
END $$;
-- CASO 25
DO $$ DECLARE k uuid := pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL'); BEGIN
  PERFORM superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f2"},{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1"}]');
  IF (SELECT string_agg(fornecedor_id::text || ':' || ordem || ':' || principal, ',' ORDER BY ordem) FROM orcamentista_mp_categoria_fornecedor WHERE mp_categoria_id = k)
     <> '00000000-0000-0000-0000-0000000000f2:1:true,00000000-0000-0000-0000-0000000000f1:2:false' THEN RAISE EXCEPTION 'FALHOU: principal ausente nao manteve o de antes'; END IF;
  RAISE NOTICE 'ok: fornecedores: principal AUSENTE no item mantem o de antes (estado resultante)';
END $$;
-- CASO 25b
DO $$ DECLARE k uuid := pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL'); BEGIN
  -- o NOVO principal vem PRIMEIRO na lista, e o atual (f2) ainda é principal quando ele é gravado
  PERFORM superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":true},{"fornecedor_id":"00000000-0000-0000-0000-0000000000f2","principal":false}]');
  PERFORM superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f2","principal":true},{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":false}]');
  IF (SELECT fornecedor_id FROM orcamentista_mp_categoria_fornecedor WHERE mp_categoria_id = k AND principal) <> '00000000-0000-0000-0000-0000000000f2' THEN RAISE EXCEPTION 'FALHOU: estado'; END IF;
  RAISE NOTICE 'ok: fornecedores: o NOVO principal antes do antigo na lista tambem passa (o zeramento previo existe por isso)';
END $$;
-- CASO 26
SELECT pg_temp.erro('fornecedores: fornecedor de OUTRO nicho', format($$SELECT superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f3","principal":true}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL')), '23503');
-- CASO 27
SELECT pg_temp.erro('fornecedores: empresa SEM nicho configurado', $$SELECT superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-00000000005a', gen_random_uuid(), '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":true}]')$$, '22023');
-- CASO 28
SELECT pg_temp.erro('fornecedores: categoria de OUTRA empresa', format($$SELECT superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":true}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000b2','mdf','PERFIL')), 'P0002');
-- CASO 29
SELECT pg_temp.erro('fornecedores: principal null', format($$SELECT superadmin_gravar_mp_fornecedores('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":null}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL')), '22023');

-- CASO 30
DO $$ DECLARE k uuid := pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','VIDRO'); BEGIN
  PERFORM superadmin_gravar_mp_vidros('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"descricao":"Incolor 4 mm comum","onde_predomina":["JVC","MAX"]},{"descricao":"Fumê","onde_predomina":[]},{"descricao":"Bronze"}]');
  IF (SELECT string_agg(descricao || '=' || coalesce(onde_predomina::text, 'NULL') || ':' || ordem, ',' ORDER BY ordem) FROM orcamentista_mp_vidro WHERE mp_categoria_id = k)
     <> 'Incolor 4 mm comum={JVC,MAX}:1,Fumê={}:2,Bronze=NULL:3' THEN RAISE EXCEPTION 'FALHOU: estado: %', (SELECT string_agg(descricao || '=' || coalesce(onde_predomina::text, 'NULL'), ',') FROM orcamentista_mp_vidro WHERE mp_categoria_id = k); END IF;
  RAISE NOTICE 'ok: vidros: onde_predomina lista, VAZIO ({}) e AUSENTE (NULL) sao estados diferentes';
END $$;
-- CASO 31
DO $$ DECLARE k uuid := pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','VIDRO'); v_id uuid; BEGIN
  SELECT id INTO v_id FROM orcamentista_mp_vidro WHERE mp_categoria_id = k AND descricao = 'Incolor 4 mm comum';
  PERFORM superadmin_gravar_mp_vidros('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k, '[{"descricao":"INCOLOR 4 MM COMUM"}]');
  IF (SELECT string_agg(id::text || descricao || '=' || coalesce(onde_predomina::text, 'NULL'), ',') FROM orcamentista_mp_vidro WHERE mp_categoria_id = k)
     <> v_id::text || 'INCOLOR 4 MM COMUM={JVC,MAX}' THEN RAISE EXCEPTION 'FALHOU: round-trip falhou'; END IF;
  RAISE NOTICE 'ok: vidros: chave lower(descricao) mantem o id, o ausente (onde_predomina) fica, e o que nao veio sai';
END $$;
-- CASO 32
SELECT pg_temp.erro('vidros: em categoria que nao e VIDRO', format($$SELECT superadmin_gravar_mp_vidros('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"descricao":"x"}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','PERFIL')), '22023');
-- CASO 33
SELECT pg_temp.erro('vidros: onde_predomina com numero', format($$SELECT superadmin_gravar_mp_vidros('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"descricao":"x","onde_predomina":[1]}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','VIDRO')), '22023');

-- CASO 34
DO $$ DECLARE k uuid := pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','FERRAGENS'); BEGIN
  PERFORM superadmin_gravar_mp_ferragens('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"tipologia":"JVC","posicao":"INTERNA","referencia":"F-1","cor":"Branco"},{"tipologia":"JVC","posicao":"EXTERNA","referencia":"F-2"}]');
  PERFORM superadmin_gravar_mp_ferragens('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"referencia":"F-2","descricao":"Fecho"},{"referencia":"F-1"}]');
  IF (SELECT string_agg(referencia || ':' || tipologia || ':' || posicao || ':' || coalesce(cor, '-') || ':' || ordem, ',' ORDER BY ordem) FROM orcamentista_mp_ferragem WHERE mp_categoria_id = k)
     <> 'F-2:JVC:EXTERNA:-:1,F-1:JVC:INTERNA:Branco:2' THEN RAISE EXCEPTION 'FALHOU: estado: %', (SELECT string_agg(referencia || ':' || ordem, ',') FROM orcamentista_mp_ferragem WHERE mp_categoria_id = k); END IF;
  RAISE NOTICE 'ok: ferragens: interna e externa sao duas linhas; item existente sem tipologia mantem a de antes; ordem pela posicao';
END $$;
-- CASO 35
SELECT pg_temp.erro('ferragens: ferragem NOVA sem tipologia', format($$SELECT superadmin_gravar_mp_ferragens('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"referencia":"F-9"}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','FERRAGENS')), '22023');
-- CASO 36
SELECT pg_temp.erro('ferragens: referencia repetida', format($$SELECT superadmin_gravar_mp_ferragens('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"tipologia":"JVC","referencia":"F-1"},{"tipologia":"MAX","referencia":"F-1"}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','FERRAGENS')), '22023');

-- CASO 37
DO $$ DECLARE k uuid := pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','INSTALACAO'); BEGIN
  PERFORM superadmin_gravar_mp_instalacao('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"produto":"CONTRAMARCO","usa":null},{"produto":"ARREMATE_INTERNO","usa":false}]');
  -- round-trip: usa AUSENTE nos dois itens
  PERFORM superadmin_gravar_mp_instalacao('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', k,
    '[{"produto":"CONTRAMARCO","descricao":"x"},{"produto":"ARREMATE_INTERNO","medida":"y"}]');
  IF (SELECT string_agg(produto || '=' || coalesce(usa::text, 'NULL'), ',' ORDER BY produto) FROM orcamentista_mp_instalacao WHERE mp_categoria_id = k)
     <> 'ARREMATE_INTERNO=false,CONTRAMARCO=NULL' THEN RAISE EXCEPTION 'FALHOU: usa colapsou no round-trip'; END IF;
  RAISE NOTICE 'ok: instalacao: usa NULL e usa false sobrevivem ao round-trip';
END $$;
-- CASO 38
SELECT pg_temp.erro('instalacao: usa true sem referencia (o CHECK)', format($$SELECT superadmin_gravar_mp_instalacao('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"produto":"ARREMATE_EXTERNO","usa":true}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','INSTALACAO')), '23514');
-- CASO 39
SELECT pg_temp.erro('instalacao: usa em texto', format($$SELECT superadmin_gravar_mp_instalacao('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L, '[{"produto":"CONTRAMARCO","usa":"sim"}]')$$, pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','INSTALACAO')), '22023');

-- CASO 40
DO $$ BEGIN
  ALTER TABLE superadmin_alteracao_log ADD CONSTRAINT log_recusa_teste CHECK (tabela <> 'orcamentista_mp_vidro') NOT VALID;
  BEGIN
    PERFORM superadmin_gravar_mp_vidros('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a',
      pg_temp.cat('00000000-0000-0000-0000-0000000000a1','pvc','VIDRO'), '[{"descricao":"Laminado 8 mm"}]');
    RAISE EXCEPTION 'FALHOU: a gravacao passou com o log falhando';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM orcamentista_mp_vidro WHERE descricao = 'Laminado 8 mm') THEN RAISE EXCEPTION 'FALHOU: log falhou e a gravacao FICOU'; END IF;
  ALTER TABLE superadmin_alteracao_log DROP CONSTRAINT log_recusa_teste;
  RAISE NOTICE 'ok: o log falhando desfaz a gravacao — mesma transacao';
END $$;

-- CASO 41
DO $$ DECLARE v_mp uuid := pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc'); n0 int := pg_temp.logs(); l record; BEGIN
  PERFORM superadmin_remover_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', v_mp);
  IF pg_temp.logs() <> n0 + 1 THEN RAISE EXCEPTION 'FALHOU: esperada UMA linha de log'; END IF;
  SELECT * INTO l FROM superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1;
  IF l.tabela <> 'orcamentista_materia_prima' OR l.chave <> v_mp::text THEN RAISE EXCEPTION 'FALHOU: tabela/chave do log'; END IF;
  IF jsonb_array_length(l.antes -> 'orcamentista_mp_categoria') <> 6 OR jsonb_array_length(l.antes -> 'orcamentista_mp_categoria_fornecedor') <> 2
     OR jsonb_array_length(l.antes -> 'orcamentista_mp_vidro') <> 1 OR jsonb_array_length(l.antes -> 'orcamentista_mp_ferragem') <> 2
     OR jsonb_array_length(l.antes -> 'orcamentista_mp_instalacao') <> 2 OR l.antes -> 'orcamentista_materia_prima' ->> 'nome' <> 'pvc'
     OR (SELECT x -> 'config' ->> 'linha' FROM jsonb_array_elements(l.antes -> 'orcamentista_mp_categoria') x WHERE x ->> 'categoria_chave' = 'PERFIL') IS DISTINCT FROM 'Suprema' THEN
    RAISE EXCEPTION 'FALHOU: o antes nao tem a arvore inteira: %', l.antes; END IF;
  IF l.depois <> '{"orcamentista_materia_prima": null}'::jsonb THEN RAISE EXCEPTION 'FALHOU: depois: %', l.depois; END IF;
  IF pg_temp.mp('00000000-0000-0000-0000-0000000000a1','pvc') IS NOT NULL
     OR EXISTS (SELECT 1 FROM orcamentista_mp_categoria WHERE materia_prima_id = v_mp) THEN RAISE EXCEPTION 'FALHOU: nao apagou'; END IF;
  IF pg_temp.mp('00000000-0000-0000-0000-0000000000a1','alumínio') IS NULL THEN RAISE EXCEPTION 'FALHOU: apagou a outra materia-prima'; END IF;
  RAISE NOTICE 'ok: remover: UMA linha de log com a arvore inteira no antes (6 categorias, 2 fornecedores, 1 vidro, 2 ferragens, 2 instalacoes), e o CASCADE levou tudo';
END $$;
-- CASO 42
SELECT pg_temp.erro('remover: materia-prima de OUTRA empresa', format($$SELECT superadmin_remover_materia_prima('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000005a', %L)$$, pg_temp.mp('00000000-0000-0000-0000-0000000000b2','mdf')), 'P0002');
-- CASO 43
DO $$ BEGIN
  IF pg_temp.mp('00000000-0000-0000-0000-0000000000b2','mdf') IS NULL THEN RAISE EXCEPTION 'FALHOU: a recusa apagou a materia-prima da outra empresa'; END IF;
  RAISE NOTICE 'ok: remover recusado nao apagou nada da outra empresa';
END $$;
-- CASO 44
SELECT pg_temp.erro('remover: autor que nao e super admin', format($$SELECT superadmin_remover_materia_prima('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c0', %L)$$, pg_temp.mp('00000000-0000-0000-0000-0000000000b2','mdf')), '42501');
-- CASO 45
DO $$ DECLARE f text; n int := 0; BEGIN
  FOREACH f IN ARRAY ARRAY['superadmin_gravar_materia_prima(uuid,uuid,jsonb)','superadmin_gravar_mp_categoria(uuid,uuid,uuid,text,jsonb)',
    'superadmin_gravar_mp_fornecedores(uuid,uuid,uuid,jsonb)','superadmin_gravar_mp_vidros(uuid,uuid,uuid,jsonb)','superadmin_gravar_mp_ferragens(uuid,uuid,uuid,jsonb)',
    'superadmin_gravar_mp_instalacao(uuid,uuid,uuid,jsonb)','superadmin_remover_materia_prima(uuid,uuid,uuid)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: % aberta', f; END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'ok: as % funcoes fechadas para anon e authenticated (com os DEFAULT PRIVILEGES do Supabase ativos no harness)', n;
END $$;
