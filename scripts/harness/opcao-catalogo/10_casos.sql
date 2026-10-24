-- HARNESS da opção no catálogo (migração 20261024000002). NÃO TOCA PRODUÇÃO.
-- Um caso por bloco `-- CASO`. Cada caso emite UMA linha `ok:` (NOTICE) ou `FALHOU:` (ERROR).
-- `run.sh` conta os `ok:` contra o número de blocos `-- CASO`.
-- O que cada mutação de `mutacoes.py` derruba está no README.
\set ON_ERROR_STOP 0

-- recusado com o código esperado, sem linha de log, e (quando dado) com o trecho na mensagem
CREATE FUNCTION pg_temp.erro(caso text, sqlx text, codigo text, trecho text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE n0 int := (SELECT count(*) FROM superadmin_alteracao_log);
BEGIN
  BEGIN EXECUTE sqlx; EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> codigo THEN RAISE EXCEPTION 'FALHOU: % — recusado com % e nao %: %', caso, SQLSTATE, codigo, SQLERRM; END IF;
    IF trecho IS NOT NULL AND strpos(SQLERRM, trecho) = 0 THEN RAISE EXCEPTION 'FALHOU: % — a mensagem nao traz "%": %', caso, trecho, SQLERRM; END IF;
    IF (SELECT count(*) FROM superadmin_alteracao_log) <> n0 THEN RAISE EXCEPTION 'FALHOU: % — recusado, mas sobrou linha de log', caso; END IF;
    RAISE NOTICE 'ok: % (recusado, %: %)', caso, SQLSTATE, SQLERRM; RETURN;
  END;
  RAISE EXCEPTION 'FALHOU: % — ACEITO, devia ser recusado', caso;
END $f$;
CREATE FUNCTION pg_temp.grava(categoria text, corpo text) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
         (SELECT id FROM orcamentista_materia_prima WHERE nome = 'PVC'), categoria, corpo::jsonb) $f$;
CREATE FUNCTION pg_temp.config(categoria text) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT k.config FROM orcamentista_mp_categoria k JOIN orcamentista_materia_prima m ON m.id = k.materia_prima_id
   WHERE m.nome = 'PVC' AND k.categoria_chave = categoria $f$;
CREATE FUNCTION pg_temp.grava_sql(categoria text, corpo text) RETURNS text LANGUAGE sql AS $f$
  SELECT format('SELECT pg_temp.grava(%L, %L)', categoria, corpo) $f$;

-- CASO 1
DO $$ DECLARE errados text; BEGIN
  SELECT string_agg(e.chave, ', ') INTO errados FROM harness_esperado e
   WHERE e.tipo = 'rotulo' AND e.texto IS DISTINCT FROM coalesce(
           (SELECT rotulo FROM orcamentista_categoria_catalogo WHERE 'catalogo.' || chave = e.chave),
           (SELECT rotulo FROM orcamentista_categoria_campo WHERE categoria_chave || '.' || chave = e.chave));
  IF errados IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: rotulos — diferentes do texto da 20261023000002: %', errados; END IF;
  RAISE NOTICE 'ok: rotulos — todos iguais ao texto da 20261023000002 (os 7 consertados e os intocados)';
END $$;
-- CASO 2
DO $$ DECLARE errados text; BEGIN
  SELECT string_agg(e.chave, ', ') INTO errados FROM harness_esperado e
   WHERE e.tipo = 'comment' AND e.texto IS DISTINCT FROM obj_description(('public.' || e.chave)::regclass, 'pg_class');
  IF errados IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: COMMENTs — diferentes do texto da 20261023000002: %', errados; END IF;
  RAISE NOTICE 'ok: COMMENTs — os 11 iguais ao texto da 20261023000002';
END $$;
-- CASO 3
DO $$ BEGIN
  IF (SELECT hex_reforco FROM harness_antes) <> '5265666f72c383c2a76f2064652061c383c2a76f' THEN
    RAISE EXCEPTION 'FALHOU: o mojibake de partida nao e o medido em producao: %', (SELECT hex_reforco FROM harness_antes);
  END IF;
  RAISE NOTICE 'ok: o mojibake de partida e o de producao (REFORCO = 5265666f72c383c2a76f2064652061c383c2a76f)';
END $$;
-- CASO 4
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM orcamentista_categoria_campo WHERE categoria_chave = 'PERFIL' AND chave = 'criterio_custo_barra'
                    AND tipo = 'opcao' AND ordem = 7 AND rotulo = 'Custo das barras' AND opcoes = ARRAY['BARRA_INTEIRA', 'CONSUMO_REAL']) THEN
    RAISE EXCEPTION 'FALHOU: criterio_custo_barra nao esta como o pedido';
  END IF;
  RAISE NOTICE 'ok: criterio_custo_barra — PERFIL, opcao, ordem 7, "Custo das barras", {BARRA_INTEIRA,CONSUMO_REAL}';
END $$;
-- CASO 5
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM orcamentista_categoria_campo WHERE chave <> 'criterio_custo_barra' AND (opcoes IS NOT NULL OR tipo = 'opcao'))
     OR (SELECT count(*) FROM orcamentista_categoria_campo) <> 13 THEN
    RAISE EXCEPTION 'FALHOU: os 12 campos antigos nao ficaram como estavam';
  END IF;
  RAISE NOTICE 'ok: os 12 campos antigos — opcoes NULL, nenhum virou opcao';
END $$;
-- CASO 6
DO $$ BEGIN
  IF pg_temp.config('PERFIL') ? 'criterio_custo_barra' THEN
    RAISE EXCEPTION 'FALHOU: sem padrao — a migracao escolheu um criterio por omissao: %', pg_temp.config('PERFIL');
  END IF;
  IF EXISTS (SELECT 1 FROM orcamentista_mp_categoria WHERE config ? 'criterio_custo_barra') THEN
    RAISE EXCEPTION 'FALHOU: sem padrao — alguma categoria ganhou criterio_custo_barra';
  END IF;
  RAISE NOTICE 'ok: sem padrao — o PERFIL configurado antes da migracao continua sem criterio (ausente, nao escolhido)';
END $$;
-- CASO 7
DO $$ DECLARE n0 int := (SELECT count(*) FROM superadmin_alteracao_log); BEGIN
  PERFORM pg_temp.grava('PERFIL', '{"criterio_custo_barra":"BARRA_INTEIRA"}');
  IF pg_temp.config('PERFIL') -> 'criterio_custo_barra' IS DISTINCT FROM '"BARRA_INTEIRA"'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: BARRA_INTEIRA nao foi gravado: %', pg_temp.config('PERFIL');
  END IF;
  IF pg_temp.config('PERFIL') ->> 'linha' IS DISTINCT FROM 'EUROPA 42' THEN RAISE EXCEPTION 'FALHOU: BARRA_INTEIRA apagou a linha'; END IF;
  IF (SELECT count(*) FROM superadmin_alteracao_log) <> n0 + 1 THEN RAISE EXCEPTION 'FALHOU: BARRA_INTEIRA sem a linha de log'; END IF;
  RAISE NOTICE 'ok: BARRA_INTEIRA aceito e gravado, com a linha de log';
END $$;
-- CASO 8
SELECT pg_temp.erro('QUALQUER_COISA — recusado, e a mensagem diz a chave e os valores aceitos',
       pg_temp.grava_sql('PERFIL', '{"criterio_custo_barra":"QUALQUER_COISA"}'), '22023',
       'criterio_custo_barra (esperado um de: BARRA_INTEIRA, CONSUMO_REAL)');
-- CASO 9
SELECT pg_temp.erro('numero no lugar da string — recusado', pg_temp.grava_sql('PERFIL', '{"criterio_custo_barra":1}'), '22023', 'criterio_custo_barra');
-- CASO 10
SELECT pg_temp.erro('booleano no lugar da string — recusado', pg_temp.grava_sql('PERFIL', '{"criterio_custo_barra":true}'), '22023', 'criterio_custo_barra');
-- CASO 11
-- um campo de harness cujas opções PARECEM números: só a checagem de que o valor é STRING separa
-- o número 1 da string "1" — sem ele, o caso 9 passaria verde sem exercitar a checagem de tipo
-- (`teste-que-nao-exercita.md`, variante 2)
DO $$ BEGIN
  INSERT INTO orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem, opcoes)
  VALUES ('REFORCO', 'harness_numerica', 'opcao', 'harness', 90, ARRAY['1', '2']);
  RAISE NOTICE 'ok: o CHECK aceita a forma valida — opcao com {1,2}';
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'FALHOU: o CHECK recusou uma opcao valida: %', SQLERRM;
END $$;
-- CASO 12
SELECT pg_temp.erro('numero 1 onde a opcao e a STRING "1" — recusado pelo tipo, nao pela lista',
       pg_temp.grava_sql('REFORCO', '{"harness_numerica":1}'), '22023', 'harness_numerica');
-- CASO 13
DO $$ BEGIN
  PERFORM pg_temp.grava('REFORCO', '{"harness_numerica":"1"}');
  IF pg_temp.config('REFORCO') -> 'harness_numerica' IS DISTINCT FROM '"1"'::jsonb THEN RAISE EXCEPTION 'FALHOU: a string "1" nao foi gravada'; END IF;
  RAISE NOTICE 'ok: a string "1" — aceita (o contraste do caso 12)';
EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF; RAISE EXCEPTION 'FALHOU: a string "1" foi recusada: %', SQLERRM;
END $$;
-- CASO 14
DO $$ BEGIN
  PERFORM pg_temp.grava('PERFIL', '{"criterio_custo_barra":"CONSUMO_REAL"}');
  PERFORM pg_temp.grava('PERFIL', '{"linha":"EUROPA 60"}');
  IF pg_temp.config('PERFIL') -> 'criterio_custo_barra' IS DISTINCT FROM '"CONSUMO_REAL"'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: ausente mexeu no criterio: %', pg_temp.config('PERFIL');
  END IF;
  RAISE NOTICE 'ok: ausente nao mexe — gravar so a linha deixou o criterio em CONSUMO_REAL';
END $$;
-- CASO 15
DO $$ BEGIN
  PERFORM pg_temp.grava('PERFIL', '{"criterio_custo_barra":null}');
  IF NOT (pg_temp.config('PERFIL') ? 'criterio_custo_barra') OR pg_temp.config('PERFIL') -> 'criterio_custo_barra' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: null nao gravou null: %', pg_temp.config('PERFIL');
  END IF;
  RAISE NOTICE 'ok: null limpa — o criterio fica null';
EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF; RAISE EXCEPTION 'FALHOU: null foi recusado: %', SQLERRM;
END $$;
-- CASO 16
SELECT pg_temp.erro('os outros tipos seguem iguais — barra_mm "abc" com a mensagem de antes',
       pg_temp.grava_sql('PERFIL', '{"barra_mm":"abc"}'), '22023', 'valor(es) com tipo errado em PERFIL: barra_mm (esperado inteiro)');
-- CASO 17
SELECT pg_temp.erro('CHECK — opcao SEM opcoes',
       $$INSERT INTO orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem) VALUES ('PERFIL', 'x_sem', 'opcao', 'x', 91)$$, '23514');
-- CASO 18
SELECT pg_temp.erro('CHECK — texto COM opcoes',
       $$INSERT INTO orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem, opcoes) VALUES ('PERFIL', 'x_texto', 'texto', 'x', 92, ARRAY['A','B'])$$, '23514');
-- CASO 19
SELECT pg_temp.erro('CHECK — opcao com UM valor so',
       $$INSERT INTO orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem, opcoes) VALUES ('PERFIL', 'x_um', 'opcao', 'x', 93, ARRAY['A'])$$, '23514');
-- CASO 20
SELECT pg_temp.erro('CHECK — opcao com valor VAZIO',
       $$INSERT INTO orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem, opcoes) VALUES ('PERFIL', 'x_vazio', 'opcao', 'x', 94, ARRAY['A',''])$$, '23514');
-- CASO 21
SELECT pg_temp.erro('CHECK — opcao com valor SO DE ESPACOS',
       $$INSERT INTO orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem, opcoes) VALUES ('PERFIL', 'x_branco', 'opcao', 'x', 95, ARRAY['A','  '])$$, '23514');
-- CASO 22
SELECT pg_temp.erro('CHECK — opcao com valor REPETIDO',
       $$INSERT INTO orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem, opcoes) VALUES ('PERFIL', 'x_rep', 'opcao', 'x', 96, ARRAY['A','B','A'])$$, '23514');
-- CASO 23
SELECT pg_temp.erro('CHECK — opcao com valor NULL',
       $$INSERT INTO orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem, opcoes) VALUES ('PERFIL', 'x_nulo', 'opcao', 'x', 97, ARRAY['A',NULL])$$, '23514');
