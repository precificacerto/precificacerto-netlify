-- HARNESS da árvore numa transação (migração 20261023000004). NÃO TOCA PRODUÇÃO.
-- Um caso por bloco `-- CASO`. Cada caso emite UMA linha `ok:` (NOTICE) ou `FALHOU:` (ERROR).
-- `run.sh` conta os `ok:` contra o número de blocos `-- CASO` mais os 3 dos scripts .sh.
-- O que cada mutação de `mutacoes.py` derruba está no README.
\set ON_ERROR_STOP 0
INSERT INTO tenants VALUES ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000c3');
INSERT INTO users (id, is_super_admin) VALUES ('00000000-0000-0000-0000-00000000005a', true), ('00000000-0000-0000-0000-0000000000c0', false);
INSERT INTO orcamentista_nicho VALUES ('00000000-0000-0000-0000-0000000000e1', 'FABRICACAO', 'Esquadrias'), ('00000000-0000-0000-0000-0000000000e2', 'FABRICACAO', 'Marcenaria');
INSERT INTO orcamentista_config (tenant_id, modelo, nicho_id) VALUES ('00000000-0000-0000-0000-0000000000a1', 'FABRICACAO', '00000000-0000-0000-0000-0000000000e1'),
                                                                     ('00000000-0000-0000-0000-0000000000b2', 'FABRICACAO', '00000000-0000-0000-0000-0000000000e2');
INSERT INTO orcamentista_fornecedor (id, nicho_id, nome) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'Wolff'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'Alcoa'), ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e2', 'Madeireira');

-- a FOTO do banco: as seis tabelas, linha a linha, e a contagem do log. Recusa que muda a foto é escrita que sobrou.
CREATE FUNCTION pg_temp.foto() RETURNS text LANGUAGE sql AS $f$
  SELECT md5(concat_ws('|',
    (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM orcamentista_materia_prima x),
    (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM orcamentista_mp_categoria x),
    (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM orcamentista_mp_categoria_fornecedor x),
    (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM orcamentista_mp_vidro x),
    (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM orcamentista_mp_ferragem x),
    (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM orcamentista_mp_instalacao x),
    (SELECT count(*)::text FROM superadmin_alteracao_log)))
$f$;
-- recusa: o código, um trecho da mensagem (ou ela EXATA), e a foto intacta
CREATE FUNCTION pg_temp.erro(caso text, sqlx text, codigo text, trecho text, exata boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE f0 text := pg_temp.foto();
BEGIN
  BEGIN EXECUTE sqlx; EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> codigo THEN RAISE EXCEPTION 'FALHOU: % — recusado com % e nao %: %', caso, SQLSTATE, codigo, SQLERRM; END IF;
    IF exata AND SQLERRM <> trecho THEN RAISE EXCEPTION 'FALHOU: % — a mensagem nao e exatamente "%": %', caso, trecho, SQLERRM; END IF;
    IF NOT exata AND position(trecho IN SQLERRM) = 0 THEN RAISE EXCEPTION 'FALHOU: % — a mensagem nao traz "%": %', caso, trecho, SQLERRM; END IF;
    IF pg_temp.foto() <> f0 THEN RAISE EXCEPTION 'FALHOU: % — recusado, mas sobrou escrita ou linha de log', caso; END IF;
    RAISE NOTICE 'ok: % (recusado, %: %)', caso, SQLSTATE, SQLERRM; RETURN;
  END;
  RAISE EXCEPTION 'FALHOU: % — ACEITO, devia ser recusado', caso;
END $f$;
-- a chamada como texto, para `erro`
CREATE FUNCTION pg_temp.arv_sql(t text, por text, j text) RETURNS text LANGUAGE sql AS $f$
  SELECT format('SELECT superadmin_gravar_arvore(%L, %L, %L)', t, por, j) $f$;
CREATE FUNCTION pg_temp.arv(j text) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT superadmin_gravar_arvore('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', j::jsonb) $f$;
CREATE FUNCTION pg_temp.mp(t text, nome text) RETURNS uuid LANGUAGE sql AS $f$ SELECT id FROM orcamentista_materia_prima WHERE tenant_id = t::uuid AND lower(nome) = lower($2) $f$;
CREATE FUNCTION pg_temp.cat(t text, nome text, c text) RETURNS uuid LANGUAGE sql AS $f$
  SELECT k.id FROM orcamentista_mp_categoria k JOIN orcamentista_materia_prima m ON m.id = k.materia_prima_id
   WHERE m.tenant_id = t::uuid AND lower(m.nome) = lower($2) AND k.categoria_chave = $3 $f$;
CREATE FUNCTION pg_temp.logs() RETURNS int LANGUAGE sql AS $f$ SELECT count(*)::int FROM superadmin_alteracao_log $f$;
CREATE FUNCTION pg_temp.resumo() RETURNS superadmin_alteracao_log LANGUAGE sql AS $f$
  SELECT * FROM superadmin_alteracao_log WHERE tabela = 'arvore' ORDER BY em DESC, id LIMIT 1 $f$;

-- CASO 1
SELECT pg_temp.erro('autor que nao e super admin — a mensagem das sete, SEM caminho',
  pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c0', '{"materias_primas":[{"nome":"PVC"}]}'),
  '42501', 'o autor da alteracao nao e super admin', true);
-- CASO 2
SELECT pg_temp.erro('empresa inexistente — a mensagem das sete, SEM caminho',
  pg_temp.arv_sql('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000005a', '{"materias_primas":[{"nome":"PVC"}]}'),
  'P0002', 'empresa inexistente', true);
-- CASO 3
SELECT pg_temp.erro('arvore que nao e objeto', pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', '[]'),
  '22023', 'a arvore e um objeto');
-- CASO 4
SELECT pg_temp.erro('campo desconhecido no topo', pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', '{"materias":[{"nome":"PVC"}]}'),
  '22023', 'campo(s) desconhecido(s) na arvore: materias');
-- CASO 5
SELECT pg_temp.erro('nada a gravar', pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', '{}'),
  '22023', 'nada a gravar');
-- CASO 6
SELECT pg_temp.erro('campo desconhecido na categoria', pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
  '{"materias_primas":[{"nome":"PVC","categorias":[{"categoria_chave":"PERFIL","fornecedor":[]}]}]}'),
  '22023', 'campo(s) desconhecido(s) nas categorias: fornecedor');
-- CASO 7
SELECT pg_temp.erro('categoria repetida na mesma materia-prima', pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
  '{"materias_primas":[{"nome":"PVC","categorias":[{"categoria_chave":"VIDRO","vidros":[]},{"categoria_chave":"VIDRO","vidros":[]}]}]}'),
  '22023', 'categoria repetida na materia-prima PVC');
-- CASO 8
SELECT pg_temp.erro('categoria fora do catalogo', pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
  '{"materias_primas":[{"nome":"PVC","categorias":[{"categoria_chave":"TELHADO","config":{"x":1}}]}]}'),
  '22023', 'categoria desconhecida: materia-prima PVC, categoria TELHADO');
-- CASO 9
SELECT pg_temp.erro('remover com algo que nao e uuid', pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', '{"remover":["abc"]}'),
  '22023', 'remover e uma lista de ids (uuid)');
-- CASO 10
SELECT pg_temp.erro('remover com id repetido', pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
  '{"remover":["00000000-0000-0000-0000-0000000000d1","00000000-0000-0000-0000-0000000000D1"]}'),
  '22023', 'materia-prima repetida em remover');
-- CASO 11
DO $$ DECLARE n0 int := pg_temp.logs(); r jsonb; s superadmin_alteracao_log; v_em timestamptz; BEGIN
  r := pg_temp.arv('{"materias_primas":[
        {"nome":"PVC","categorias":[
          {"categoria_chave":"PERFIL","config":{"linha":"Suprema"},
           "fornecedores":[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f1","principal":true},{"fornecedor_id":"00000000-0000-0000-0000-0000000000f2"}]},
          {"categoria_chave":"VIDRO","vidros":[{"descricao":"Fumê","onde_predomina":[]},{"descricao":"Bronze"}]},
          {"categoria_chave":"FERRAGENS","ferragens":[{"tipologia":"JVC","referencia":"F-1"}]},
          {"categoria_chave":"INSTALACAO","instalacao":[{"produto":"CONTRAMARCO","usa":null},{"produto":"ARREMATE_INTERNO","usa":false}]}]},
        {"nome":"Alumínio"}]}');
  IF (SELECT string_agg(nome || ':' || ordem, ',' ORDER BY ordem) FROM orcamentista_materia_prima WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1') <> 'PVC:1,Alumínio:2' THEN RAISE EXCEPTION 'FALHOU: arvore completa — materias-primas'; END IF;
  IF (SELECT count(*) FROM orcamentista_mp_categoria WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1') <> 12 THEN RAISE EXCEPTION 'FALHOU: arvore completa — as 12 categorias'; END IF;
  IF (SELECT config FROM orcamentista_mp_categoria WHERE id = pg_temp.cat('00000000-0000-0000-0000-0000000000a1','PVC','PERFIL')) <> '{"linha":"Suprema"}' THEN RAISE EXCEPTION 'FALHOU: arvore completa — config'; END IF;
  IF (SELECT string_agg(right(fornecedor_id::text, 2) || ':' || principal || ':' || ordem, ',' ORDER BY ordem) FROM orcamentista_mp_categoria_fornecedor
       WHERE mp_categoria_id = pg_temp.cat('00000000-0000-0000-0000-0000000000a1','PVC','PERFIL')) <> 'f1:true:1,f2:false:2' THEN RAISE EXCEPTION 'FALHOU: arvore completa — fornecedores'; END IF;
  IF (SELECT string_agg(descricao || '=' || coalesce(onde_predomina::text, 'NULL'), ',' ORDER BY ordem) FROM orcamentista_mp_vidro) <> 'Fumê={},Bronze=NULL' THEN RAISE EXCEPTION 'FALHOU: arvore completa — onde_predomina vazio e NULL'; END IF;
  IF (SELECT count(*) FROM orcamentista_mp_ferragem WHERE referencia = 'F-1') <> 1 THEN RAISE EXCEPTION 'FALHOU: arvore completa — ferragem'; END IF;
  IF (SELECT string_agg(produto || '=' || coalesce(usa::text, 'NULL'), ',' ORDER BY produto) FROM orcamentista_mp_instalacao) <> 'ARREMATE_INTERNO=false,CONTRAMARCO=NULL' THEN RAISE EXCEPTION 'FALHOU: arvore completa — usa NULL e false'; END IF;
  -- o LOG: as 6 das funções internas + 1 resumo, todas da mesma transação
  IF pg_temp.logs() <> n0 + 7 THEN RAISE EXCEPTION 'FALHOU: arvore completa — esperadas 7 linhas de log (6 internas + resumo), vieram %', pg_temp.logs() - n0; END IF;
  s := pg_temp.resumo();
  IF s IS NULL OR s.chave <> '00000000-0000-0000-0000-0000000000a1' OR s.tenant_id <> '00000000-0000-0000-0000-0000000000a1' OR s.por <> '00000000-0000-0000-0000-00000000005a' THEN RAISE EXCEPTION 'FALHOU: arvore completa — sem a linha de resumo (tabela arvore, chave = tenant)'; END IF;
  IF (SELECT count(*) FROM superadmin_alteracao_log WHERE em = s.em) <> 7 THEN RAISE EXCEPTION 'FALHOU: arvore completa — as 7 linhas nao tem o mesmo em'; END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s.depois) k) <> ARRAY['orcamentista_materia_prima','orcamentista_mp_categoria','orcamentista_mp_categoria_fornecedor','orcamentista_mp_ferragem','orcamentista_mp_instalacao','orcamentista_mp_vidro']
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s.antes) k) <> (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s.depois) k) THEN
    RAISE EXCEPTION 'FALHOU: arvore completa — o resumo nao tem as seis tabelas no antes e no depois'; END IF;
  IF (SELECT string_agg(jsonb_array_length(s.depois -> k)::text, ',' ORDER BY k) FROM jsonb_object_keys(s.depois) k) <> '2,12,2,1,2,2' THEN
    RAISE EXCEPTION 'FALHOU: arvore completa — o depois do resumo nao e a arvore inteira: %', (SELECT string_agg(k || '=' || jsonb_array_length(s.depois -> k), ',' ORDER BY k) FROM jsonb_object_keys(s.depois) k); END IF;
  IF (SELECT string_agg(jsonb_array_length(s.antes -> k)::text, ',' ORDER BY k) FROM jsonb_object_keys(s.antes) k) <> '0,0,0,0,0,0' THEN
    RAISE EXCEPTION 'FALHOU: arvore completa — o antes do resumo nao e a arvore de ANTES (vazia)'; END IF;
  IF r <> s.depois THEN RAISE EXCEPTION 'FALHOU: arvore completa — o retorno nao e o depois do resumo'; END IF;
  RAISE NOTICE 'ok: arvore completa numa chamada: as seis tabelas gravadas, usa NULL/false e [] /NULL intactos, 6 linhas internas + 1 resumo com o mesmo em, antes vazio e depois inteiro';
END $$;
-- CASO 12
DO $$ DECLARE n0 int := pg_temp.logs(); s0 superadmin_alteracao_log := pg_temp.resumo(); s superadmin_alteracao_log; BEGIN
  PERFORM pg_temp.arv('{"materias_primas":[{"nome":"PVC","categorias":[{"categoria_chave":"PERFIL","config":{"cor_predominante":"Branco"}}]},{"nome":"Alumínio"}]}');
  IF (SELECT config FROM orcamentista_mp_categoria WHERE id = pg_temp.cat('00000000-0000-0000-0000-0000000000a1','PVC','PERFIL')) <> '{"linha":"Suprema","cor_predominante":"Branco"}' THEN RAISE EXCEPTION 'FALHOU: ausente nao mexe — o config perdeu a chave ausente'; END IF;
  IF (SELECT count(*) FROM orcamentista_mp_categoria_fornecedor) <> 2 OR (SELECT count(*) FROM orcamentista_mp_vidro) <> 2
     OR (SELECT count(*) FROM orcamentista_mp_ferragem) <> 1 OR (SELECT count(*) FROM orcamentista_mp_instalacao) <> 2 THEN
    RAISE EXCEPTION 'FALHOU: ausente nao mexe — uma lista AUSENTE foi tocada'; END IF;
  IF pg_temp.logs() <> n0 + 3 THEN RAISE EXCEPTION 'FALHOU: ausente nao mexe — esperadas 3 linhas (materias-primas, config, resumo), vieram %', pg_temp.logs() - n0; END IF;
  s := pg_temp.resumo();
  IF s.antes <> s0.depois THEN RAISE EXCEPTION 'FALHOU: ausente nao mexe — o antes do resumo nao e o depois do salvar anterior'; END IF;
  RAISE NOTICE 'ok: chave ausente nao mexe (fornecedores, vidros, ferragens, instalacao intactos; so 3 linhas de log), e o antes do resumo e o depois do salvar anterior';
END $$;
-- CASO 13
DO $$ BEGIN
  PERFORM pg_temp.arv('{"materias_primas":[{"nome":"PVC","categorias":[{"categoria_chave":"VIDRO","vidros":[]},{"categoria_chave":"PERFIL","fornecedores":[]}]},{"nome":"Alumínio"}]}');
  IF (SELECT count(*) FROM orcamentista_mp_vidro) <> 0 THEN RAISE EXCEPTION 'FALHOU: lista vazia esvazia — sobraram vidros'; END IF;
  IF (SELECT count(*) FROM orcamentista_mp_categoria_fornecedor) <> 0 THEN RAISE EXCEPTION 'FALHOU: lista vazia esvazia — sobraram fornecedores'; END IF;
  IF (SELECT count(*) FROM orcamentista_mp_instalacao) <> 2 THEN RAISE EXCEPTION 'FALHOU: lista vazia esvazia — a instalacao (ausente) foi tocada'; END IF;
  RAISE NOTICE 'ok: lista VAZIA esvazia (vidros e fornecedores), e a ausente continua intacta';
END $$;
-- CASO 14
SELECT pg_temp.erro('falha no meio: o ERRCODE da funcao interna (23503) e o CAMINHO — e nada sobra, nem a materia-prima nova nem as linhas de log das internas',
  pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
    '{"materias_primas":[{"nome":"PVC"},{"nome":"Alumínio"},{"nome":"Aço","categorias":[{"categoria_chave":"PERFIL","config":{"linha":"X"},"fornecedores":[{"fornecedor_id":"00000000-0000-0000-0000-0000000000f3","principal":true}]}]}]}'),
  '23503', 'materia-prima Aço, categoria PERFIL, fornecedores: fornecedor(es) que nao sao do nicho da empresa');
-- CASO 15
SELECT pg_temp.erro('erro de validacao da funcao interna (22023) com o caminho',
  pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
    '{"materias_primas":[{"nome":"PVC","categorias":[{"categoria_chave":"PERFIL","vidros":[{"descricao":"Fumê"}]}]},{"nome":"Alumínio"}]}'),
  '22023', 'materia-prima PVC, categoria PERFIL, vidros: a categoria PERFIL nao e VIDRO');
-- CASO 16
SELECT pg_temp.erro('erro da funcao 1 com o caminho',
  pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', '{"materias_primas":[{"nome":"PVC","ordem":3}]}'),
  '22023', 'materias_primas: ordem vem da posicao na lista');
-- CASO 17
DO $$ BEGIN
  PERFORM superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000005a', '[{"nome":"MDF"}]');
  RAISE NOTICE 'ok: preparo — uma materia-prima da OUTRA empresa, para o caso seguinte';
END $$;
-- CASO 18
SELECT pg_temp.erro('remover materia-prima de OUTRA empresa: P0002 da funcao 7, com o caminho',
  pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
    format('{"remover":["%s"]}', pg_temp.mp('00000000-0000-0000-0000-0000000000b2', 'MDF'))),
  'P0002', format('remover %s: materia-prima inexistente nesta empresa', pg_temp.mp('00000000-0000-0000-0000-0000000000b2', 'MDF')));
-- CASO 19
SELECT pg_temp.erro('remover e gravar a MESMA materia-prima no mesmo salvar',
  pg_temp.arv_sql('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
    format('{"remover":["%s"],"materias_primas":[{"nome":"pvc"}]}', pg_temp.mp('00000000-0000-0000-0000-0000000000a1', 'PVC'))),
  '22023', 'materia-prima em remover e em materias_primas no mesmo salvar: PVC');
-- CASO 20
DO $$ DECLARE n0 int := pg_temp.logs(); v_alu uuid := pg_temp.mp('00000000-0000-0000-0000-0000000000a1', 'Alumínio'); s superadmin_alteracao_log; BEGIN
  PERFORM pg_temp.arv(format('{"remover":["%s"]}', v_alu));
  IF pg_temp.mp('00000000-0000-0000-0000-0000000000a1', 'Alumínio') IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: remover — o Alumínio ficou'; END IF;
  IF pg_temp.logs() <> n0 + 2 THEN RAISE EXCEPTION 'FALHOU: remover — esperadas 2 linhas (a da funcao 7 e o resumo), vieram %', pg_temp.logs() - n0; END IF;
  IF NOT EXISTS (SELECT 1 FROM superadmin_alteracao_log WHERE tabela = 'orcamentista_materia_prima' AND chave = v_alu::text
                   AND jsonb_array_length(antes -> 'orcamentista_mp_categoria') = 6) THEN
    RAISE EXCEPTION 'FALHOU: remover — nao passou pela funcao 7 (a linha dela, com a arvore no antes, nao existe)'; END IF;
  s := pg_temp.resumo();
  IF NOT (s.antes::text LIKE '%Alumínio%') OR s.depois::text LIKE '%Alumínio%' THEN RAISE EXCEPTION 'FALHOU: remover — o resumo nao mostra o Alumínio saindo'; END IF;
  RAISE NOTICE 'ok: remover sozinho, pela funcao 7 (a linha dela com a arvore) + o resumo com o Alumínio no antes e fora do depois';
END $$;
-- CASO 21
DO $$ BEGIN
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM superadmin_gravar_arvore('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', '{"materias_primas":[{"nome":"PVC"}]}');
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FALHOU: authenticated EXECUTOU a funcao';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
  END;
  IF has_function_privilege('anon', 'public.superadmin_gravar_arvore(uuid, uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.superadmin_gravar_arvore(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: fechada — anon executa ou service_role nao'; END IF;
  RAISE NOTICE 'ok: fechada — authenticated recebe permission denied; anon nao executa; service_role executa';
END $$;
