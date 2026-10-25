-- HARNESS do catálogo de categorias (migração 20261024000004). NÃO TOCA PRODUÇÃO.
-- Roda DEPOIS da 20261024000002 e ANTES da migração em teste. Reproduz produção com o que
-- distingue os casos:
--   - DUAS matérias-primas da mesma empresa (o backfill tem de servir para N; produção tem 1);
--   - a PVC com config gravado em PERFIL — tem de sobreviver intacto; a Alumínio sem config nenhum;
--   - uma cópia de TODAS as linhas de mp_categoria em `harness_antes`, com id, config, autor e
--     data: "sem tocar nas outras" é conferido contra ela, linha a linha.
\set ON_ERROR_STOP 1
INSERT INTO tenants VALUES ('00000000-0000-0000-0000-0000000000a1');
INSERT INTO users (id, is_super_admin) VALUES ('00000000-0000-0000-0000-00000000005a', true);
SELECT superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a', '[{"nome":"PVC"},{"nome":"Alumínio"}]');
SELECT superadmin_gravar_mp_categoria('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
       (SELECT id FROM orcamentista_materia_prima WHERE nome = 'PVC'), 'PERFIL', '{"linha":"EUROPA 42","barra_mm":6000,"criterio_custo_barra":"CONSUMO_REAL"}');

DO $$ BEGIN
  IF (SELECT count(*) FROM orcamentista_categoria_catalogo) <> 6
     OR (SELECT count(*) FROM orcamentista_mp_categoria) <> 12
     OR (SELECT count(*) FROM orcamentista_mp_categoria WHERE config IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'PREPARO: esperado o catalogo de 6, 2 materias-primas com 6 linhas cada, e 1 config';
  END IF;
END $$;

CREATE TABLE harness_antes AS SELECT id, materia_prima_id, categoria_chave, config, atualizado_por, atualizado_em FROM orcamentista_mp_categoria;
