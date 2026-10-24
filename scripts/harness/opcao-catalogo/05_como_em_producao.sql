-- HARNESS da opção no catálogo (migração 20261024000002). NÃO TOCA PRODUÇÃO.
-- Roda DEPOIS da 20261023000002 e da 20261023000003 e ANTES da migração em teste. Faz três coisas:
--
-- 1. GUARDA O TEXTO CERTO. A 20261023000002 acabou de gravar rótulos e COMMENTs a partir do
--    arquivo do repositório, sem transporte nenhum: esse é o oráculo. Ele vai para
--    `harness_esperado`, e os casos comparam o estado final contra ELE — não contra uma segunda
--    cópia dos textos escrita aqui (`copia-divergente.md`).
-- 2. REPRODUZ O MOJIBAKE DE PRODUÇÃO: cada rótulo e COMMENT é relido como Latin-1 e regravado
--    como UTF-8 — o "ç" (c3 a7) vira "Ã§" (c3 83 c2 a7). O hex de REFORCO fica guardado em
--    `harness_antes`, e o caso 3 o confere contra o MEDIDO em produção em 24/10/2026. Sem isso o
--    conserto seria exercitado sobre um estado inventado.
-- 3. CRIA UMA EMPRESA COM PERFIL JÁ CONFIGURADO, antes da migração — para provar que ela não
--    escolhe critério nenhum por omissão.
\set ON_ERROR_STOP 1

CREATE TABLE harness_esperado (tipo text, chave text, texto text, PRIMARY KEY (tipo, chave));
INSERT INTO harness_esperado
  SELECT 'rotulo', 'catalogo.' || chave, rotulo FROM orcamentista_categoria_catalogo
  UNION ALL SELECT 'rotulo', categoria_chave || '.' || chave, rotulo FROM orcamentista_categoria_campo
  UNION ALL SELECT 'comment', c.relname, obj_description(c.oid, 'pg_class')
              FROM pg_class c
             WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
               AND c.relname IN ('orcamentista_categoria_catalogo', 'orcamentista_categoria_campo', 'orcamentista_materia_prima',
                                 'orcamentista_mp_categoria', 'orcamentista_mp_categoria_fornecedor', 'orcamentista_mp_vidro',
                                 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao', 'orcamentista_base_conhecimento',
                                 'orcamentista_esquadrias_base', 'orcamentista_esquadrias_padrao');
DO $$ BEGIN
  IF (SELECT count(*) FROM harness_esperado WHERE tipo = 'comment' AND texto IS NOT NULL) <> 11 THEN
    RAISE EXCEPTION 'PREPARO: o oraculo nao tem os 11 COMMENTs da 20261023000002';
  END IF;
END $$;

-- o mojibake, do jeito que produção o tem
UPDATE orcamentista_categoria_catalogo SET rotulo = convert_from(convert_to(rotulo, 'UTF8'), 'LATIN1');
UPDATE orcamentista_categoria_campo    SET rotulo = convert_from(convert_to(rotulo, 'UTF8'), 'LATIN1');
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT chave, texto FROM harness_esperado WHERE tipo = 'comment' LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', r.chave, convert_from(convert_to(r.texto, 'UTF8'), 'LATIN1'));
  END LOOP;
END $$;
CREATE TABLE harness_antes AS
  SELECT encode(convert_to(rotulo, 'UTF8'), 'hex') AS hex_reforco FROM orcamentista_categoria_catalogo WHERE chave = 'REFORCO';

-- a empresa que já configurou o PERFIL antes da migração
INSERT INTO tenants VALUES ('00000000-0000-0000-0000-0000000000a1');
INSERT INTO users (id, is_super_admin) VALUES ('00000000-0000-0000-0000-00000000005a', true);
SELECT superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', '[{"nome":"PVC"},{"nome":"Alumínio"}]');
SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
       (SELECT id FROM orcamentista_materia_prima WHERE nome = 'PVC'), 'PERFIL', '{"linha":"EUROPA 42","barra_mm":6000}');
