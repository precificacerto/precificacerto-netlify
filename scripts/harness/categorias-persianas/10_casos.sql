-- HARNESS do catálogo de categorias (migração 20261024000004) — OS CASOS. NÃO TOCA PRODUÇÃO.
-- Cada caso é um bloco DO: `ok: ...` por NOTICE, ou `FALHOU: ...` por EXCEPTION. O run.sh conta os
-- `-- CASO ` deste arquivo e exige um `ok:` para cada um. Os textos esperados estão escritos aqui
-- como o dono do produto os decidiu — uma segunda fonte, independente da tabela `_alvo` da migração.

-- CASO 1 — o catálogo: 7 linhas, na ordem nova, com as chaves e os rótulos decididos
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(ordem || ' ' || chave || ' ' || rotulo, ' | ' ORDER BY ordem) INTO v FROM orcamentista_categoria_catalogo;
  IF v IS DISTINCT FROM '1 PERFIL Perfil | 2 PERSIANAS Persianas | 3 REFORCO Reforço metálico | 4 FERRAGENS Ferragens | 5 ACESSORIOS_VEDACAO Acessórios e vedação | 6 VIDRO Vidro | 7 INSTALACAO Instalação' THEN
    RAISE EXCEPTION 'FALHOU: caso 1 — o catálogo é %', v;
  END IF;
  RAISE NOTICE 'ok: caso 1 — 7 categorias na ordem nova, PERSIANAS em 2, REFORCO "Reforço metálico" em 3';
END $$;

-- CASO 2 — o rótulo novo chegou em UTF-8 de verdade: o hex, que nenhum transporte corrompe
DO $$
DECLARE h text;
BEGIN
  SELECT encode(convert_to(rotulo, 'UTF8'), 'hex') INTO h FROM orcamentista_categoria_catalogo WHERE chave = 'REFORCO';
  IF h IS DISTINCT FROM '5265666f72c3a76f206d6574c3a16c69636f' THEN
    RAISE EXCEPTION 'FALHOU: caso 2 — o hex de REFORCO é %', h;
  END IF;
  RAISE NOTICE 'ok: caso 2 — REFORCO em UTF-8: 5265666f72c3a76f206d6574c3a16c69636f';
END $$;

-- CASO 3 — o BACKFILL: cada matéria-prima existente com 7 linhas, uma por chave, PERSIANAS com config NULL
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(m.nome || ': ' || (SELECT string_agg(c.categoria_chave || CASE WHEN c.config IS NULL THEN '' ELSE '*' END, ',' ORDER BY k.ordem)
                                          FROM orcamentista_mp_categoria c JOIN orcamentista_categoria_catalogo k ON k.chave = c.categoria_chave
                                         WHERE c.materia_prima_id = m.id), ' / ' ORDER BY m.nome) INTO v
    FROM orcamentista_materia_prima m;
  IF v IS DISTINCT FROM 'Alumínio: PERFIL,PERSIANAS,REFORCO,FERRAGENS,ACESSORIOS_VEDACAO,VIDRO,INSTALACAO / PVC: PERFIL*,PERSIANAS,REFORCO,FERRAGENS,ACESSORIOS_VEDACAO,VIDRO,INSTALACAO' THEN
    RAISE EXCEPTION 'FALHOU: caso 3 — as linhas por matéria-prima são %', v;
  END IF;
  RAISE NOTICE 'ok: caso 3 — as 2 matérias-primas com 7 linhas, PERSIANAS sem config (* = com config)';
END $$;

-- CASO 4 — sem tocar nas outras: as 12 linhas que existiam continuam IGUAIS — id, config, autor e data
DO $$
DECLARE n int; mudou int;
BEGIN
  SELECT count(*) INTO n FROM harness_antes;
  SELECT count(*) INTO mudou FROM harness_antes a
   WHERE NOT EXISTS (SELECT 1 FROM orcamentista_mp_categoria c
                      WHERE c.id = a.id AND c.materia_prima_id = a.materia_prima_id AND c.categoria_chave = a.categoria_chave
                        AND c.config IS NOT DISTINCT FROM a.config AND c.atualizado_por IS NOT DISTINCT FROM a.atualizado_por
                        AND c.atualizado_em = a.atualizado_em);
  IF n <> 12 OR mudou <> 0 THEN
    RAISE EXCEPTION 'FALHOU: caso 4 — das % linhas de antes, % mudaram', n, mudou;
  END IF;
  IF (SELECT config FROM orcamentista_mp_categoria c JOIN orcamentista_materia_prima m ON m.id = c.materia_prima_id
       WHERE m.nome = 'PVC' AND c.categoria_chave = 'PERFIL') IS DISTINCT FROM '{"linha":"EUROPA 42","barra_mm":6000,"criterio_custo_barra":"CONSUMO_REAL"}'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: caso 4 — o config do PERFIL da PVC mudou';
  END IF;
  RAISE NOTICE 'ok: caso 4 — as 12 linhas de antes intactas, e o PERFIL da PVC com o config que tinha';
END $$;

-- CASO 5 — matéria-prima criada DEPOIS da migração, pela função de produção, nasce com as 7
DO $$
DECLARE v text;
BEGIN
  PERFORM superadmin_gravar_materia_prima('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000005a',
          '[{"nome":"PVC"},{"nome":"Alumínio"},{"nome":"Madeira"}]');
  SELECT string_agg(c.categoria_chave, ',' ORDER BY k.ordem) INTO v
    FROM orcamentista_mp_categoria c JOIN orcamentista_categoria_catalogo k ON k.chave = c.categoria_chave
    JOIN orcamentista_materia_prima m ON m.id = c.materia_prima_id
   WHERE m.nome = 'Madeira' AND c.config IS NULL;
  IF v IS DISTINCT FROM 'PERFIL,PERSIANAS,REFORCO,FERRAGENS,ACESSORIOS_VEDACAO,VIDRO,INSTALACAO' THEN
    RAISE EXCEPTION 'FALHOU: caso 5 — a matéria-prima nova nasceu com %', v;
  END IF;
  RAISE NOTICE 'ok: caso 5 — "Madeira", criada depois, nasce com as 7 categorias, todas sem config';
END $$;

-- CASO 6 — PERSIANAS entra sem campo escalar, e os campos das outras não mudaram
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(categoria_chave || ':' || n, ',' ORDER BY categoria_chave) INTO v
    FROM (SELECT categoria_chave, count(*) AS n FROM orcamentista_categoria_campo GROUP BY 1) x;
  IF v IS DISTINCT FROM 'ACESSORIOS_VEDACAO:3,PERFIL:7,REFORCO:3' THEN
    RAISE EXCEPTION 'FALHOU: caso 6 — os campos por categoria são %', v;
  END IF;
  RAISE NOTICE 'ok: caso 6 — PERSIANAS sem campo; PERFIL 7, REFORCO 3, ACESSORIOS_VEDACAO 3, como antes';
END $$;

-- CASO 7 — os COMMENTs não carregam mais o número de categorias
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(t, ', ') INTO v
    FROM unnest(ARRAY['orcamentista_categoria_catalogo', 'orcamentista_categoria_campo', 'orcamentista_materia_prima']) t
   WHERE obj_description(('public.' || t)::regclass, 'pg_class') ~ '[0-9]+ categorias';
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: caso 7 — COMMENT com o número de categorias em %', v;
  END IF;
  IF obj_description('public.orcamentista_categoria_campo'::regclass, 'pg_class') NOT LIKE '%PERSIANAS%' THEN
    RAISE EXCEPTION 'FALHOU: caso 7 — o COMMENT de categoria_campo não fala de PERSIANAS';
  END IF;
  RAISE NOTICE 'ok: caso 7 — nenhum COMMENT diz quantas são, e o de categoria_campo nomeia PERSIANAS';
END $$;
