-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261024000004 — o CATÁLOGO DE CATEGORIAS: PERSIANAS entra, REFORCO muda de rótulo, e a ordem
-- passa a ser a decidida pelo dono do produto em 24/10/2026
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Ao aplicar fora do CLI, o `name` da migração é o nome completo
-- ║ deste arquivo, sem a extensão: 20261024000004_categorias_persianas_e_reforco.
-- ║ TRANSPORTE: o arquivo é UTF-8 e tem acento. Aplicar pelo conector do Supabase ou por um
-- ║ caminho que preserve UTF-8 — NUNCA copiando do Notepad. Se o transporte corromper o texto,
-- ║ a verificação 1 aborta: ela confere o que CHEGOU ao banco pelo md5 do texto certo.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- A ORDEM NOVA (dono do produto, 24/10/2026):
--   1 PERFIL              Perfil
--   2 PERSIANAS           Persianas              ← categoria NOVA
--   3 REFORCO             Reforço metálico       ← era "Reforço de aço"
--   4 FERRAGENS           Ferragens
--   5 ACESSORIOS_VEDACAO  Acessórios e vedação
--   6 VIDRO               Vidro
--   7 INSTALACAO          Instalação
--
-- O QUE FAZ, nesta ordem, numa transação:
--   1. REORDENA EM DUAS ETAPAS. `ordem` tem UNIQUE não adiável: um UPDATE direto de REFORCO para 3
--      colide com FERRAGENS, que ainda está no 3. Primeiro TODAS as linhas sobem 1000 (1..6 viram
--      1001..1006, e nenhum valor novo coincide com um antigo); PERSIANAS entra em 900, uma faixa
--      livre; e então UM UPDATE assenta as sete na ordem final — todas saem de valores ≥ 900 e vão
--      para 1..7, sem cruzar. Na segunda aplicação o mesmo caminho vale: as sete sobem, PERSIANAS
--      já existe (ON CONFLICT DO NOTHING) e o assentamento as põe no mesmo lugar;
--   2. o assentamento grava também o RÓTULO das sete: muda o de REFORCO, e reescreve os outros
--      com o MESMO texto que já têm em produção (medido em 24/10/2026, hex conferido);
--   3. BACKFILL: cada matéria-prima existente ganha a sua linha de PERSIANAS em
--      orcamentista_mp_categoria, com config NULL ("ainda não configurado"). Só PERSIANAS: as
--      outras seis linhas não são tocadas. Serve para N matérias-primas (hoje é 1);
--   4. PERSIANAS entra SEM campo escalar em orcamentista_categoria_campo, como FERRAGENS, VIDRO e
--      INSTALACAO: os itens dela virão da tabela do fornecedor, não de campos digitados;
--   5. REESCREVE TRÊS COMMENTs que tinham o número de categorias, ou a lista delas, escritos à
--      mão ("As 6 categorias…", "as mesmas 6 categorias", e o de categoria_campo, que não falava
--      de PERSIANAS). O número sai do texto: quais são e em que ordem vive nas LINHAS do catálogo;
--   6. VERIFICA e ABORTA (tudo volta).
--
-- O QUE NÃO PRECISA MUDAR, e foi conferido:
--   - `superadmin_gravar_materia_prima` cria as categorias de uma matéria-prima NOVA iterando o
--     catálogo (`SELECT … FROM orcamentista_categoria_catalogo k ORDER BY k.ordem`), em produção e
--     no repositório: passa a criar 7 sozinha. O "as seis categorias" que aparece no corpo dela é
--     COMENTÁRIO, não lógica; reescrevê-lo exigiria regravar o corpo inteiro (o corpo é o artefato:
--     `transformacao-quebra-a-cadeia-de-hash.md`) e fica para quando a função mudar por outro motivo;
--   - a tela calcula "N de M categorias" com M = o tamanho do catálogo que ela recebe.
--
-- VERIFICAÇÃO (aborta):
--   1. o catálogo tem 7 linhas, ordem 1..7 sem buraco, nas chaves e rótulos acima — conferido pelo
--      md5 do texto certo (ASCII, que nenhum transporte corrompe); e os três COMMENTs, idem;
--   2. nenhum rótulo (catálogo e campos) e nenhum COMMENT das 11 tabelas da base com mojibake —
--      "Ã"/"Â" procurados por chr(195)/chr(194), não por literal. O conserto da 20261024000002 não
--      pode ser desfeito por este arquivo;
--   3. toda matéria-prima existente tem exatamente 7 linhas em mp_categoria, uma por chave do
--      catálogo, e a de PERSIANAS com config NULL;
--   4. nenhuma linha de mp_categoria perdeu nem mudou config: a contagem de config NOT NULL e o
--      md5 do conteúdo de todos os config, antes e depois, são iguais;
--   5. PERSIANAS não tem campo em orcamentista_categoria_campo.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- O "antes", para a verificação 4: quantos config existem, e o conteúdo deles.
CREATE TEMP TABLE _config_antes ON COMMIT DROP AS
  SELECT count(*) FILTER (WHERE config IS NOT NULL) AS n,
         md5(coalesce(string_agg(id::text || '=' || config::text, ',' ORDER BY id) FILTER (WHERE config IS NOT NULL), '')) AS conteudo
    FROM public.orcamentista_mp_categoria;

-- ── 1 e 2. A ORDEM E OS RÓTULOS, em duas etapas ──────────────────────────────────────────
CREATE TEMP TABLE _alvo (chave text PRIMARY KEY, rotulo text NOT NULL, ordem int NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO _alvo (chave, rotulo, ordem) VALUES
  ('PERFIL',             'Perfil',               1),
  ('PERSIANAS',          'Persianas',            2),
  ('REFORCO',            'Reforço metálico',     3),
  ('FERRAGENS',          'Ferragens',            4),
  ('ACESSORIOS_VEDACAO', 'Acessórios e vedação', 5),
  ('VIDRO',              'Vidro',                6),
  ('INSTALACAO',         'Instalação',           7);

-- (a) desloca TODAS para uma faixa livre
UPDATE public.orcamentista_categoria_catalogo SET ordem = ordem + 1000;
-- (b) a categoria nova entra noutra faixa livre
INSERT INTO public.orcamentista_categoria_catalogo (chave, rotulo, ordem)
VALUES ('PERSIANAS', 'Persianas', 900)
ON CONFLICT (chave) DO NOTHING;
-- (c) assenta as sete de uma vez, na ordem e com os rótulos decididos
UPDATE public.orcamentista_categoria_catalogo c
   SET ordem = a.ordem, rotulo = a.rotulo
  FROM _alvo a
 WHERE c.chave = a.chave;

-- ── 3. O BACKFILL: a linha de PERSIANAS de cada matéria-prima existente ──────────────────
INSERT INTO public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave)
SELECT m.tenant_id, m.id, 'PERSIANAS'
  FROM public.orcamentista_materia_prima m
ON CONFLICT (materia_prima_id, categoria_chave) DO NOTHING;

-- ── 4. PERSIANAS sem campo escalar: nada a inserir em orcamentista_categoria_campo ───────

-- ── 5. OS COMMENTs SEM O NÚMERO ──────────────────────────────────────────────────────────
COMMENT ON TABLE public.orcamentista_categoria_catalogo IS
  'As categorias de uma matéria-prima, fixas e numeradas pela coluna ordem. Da plataforma, sem tenant. Quais são e em que ordem está nas LINHAS desta tabela, não neste comentário: um número escrito aqui envelhece na próxima categoria.';
COMMENT ON TABLE public.orcamentista_categoria_campo IS
  'As chaves válidas de orcamentista_mp_categoria.config, por categoria. Chave fora daqui é erro, não campo novo. FERRAGENS, VIDRO e INSTALACAO não têm campo escalar: vivem em orcamentista_mp_ferragem, _vidro e _instalacao. PERSIANAS também não tem: os itens dela vêm da tabela do fornecedor.';
COMMENT ON TABLE public.orcamentista_materia_prima IS
  'O primeiro nível: a matéria-prima da empresa (PVC, alumínio...). Cada uma tem uma linha em orcamentista_mp_categoria para cada categoria do catálogo, com outros fornecedores e outras respostas.';

-- ── 6. VERIFICAÇÃO — aborta a migração inteira, e confere O QUE CHEGOU ao banco ──────────
-- Os md5 são do texto CERTO, calculados fora do banco a partir dos textos decididos, e estão em
-- hexadecimal: ASCII, que nenhum transporte corrompe. Se o transporte corromper ESTE arquivo, os
-- textos gravados não batem com eles, e a migração aborta.
DO $verifica$
DECLARE
  tabelas text[] := ARRAY['orcamentista_categoria_catalogo', 'orcamentista_categoria_campo', 'orcamentista_materia_prima', 'orcamentista_mp_categoria', 'orcamentista_mp_categoria_fornecedor', 'orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao', 'orcamentista_base_conhecimento', 'orcamentista_esquadrias_base', 'orcamentista_esquadrias_padrao'];
  v_n        int;
  v_ordens   text;
  v_texto    text;
  v_sujos    text;
  v_mp_ruins text;
  v_n_antes  bigint;
  v_c_antes  text;
  v_n_depois bigint;
  v_c_depois text;
BEGIN
  -- (1) 7 linhas, ordem 1..7 sem buraco, chaves e rótulos certos — e os três COMMENTs
  SELECT count(*), string_agg(ordem::text, ',' ORDER BY ordem) INTO v_n, v_ordens FROM public.orcamentista_categoria_catalogo;
  IF v_n <> 7 OR v_ordens <> '1,2,3,4,5,6,7' THEN
    RAISE EXCEPTION 'verificacao 1: o catalogo tem % linha(s), ordens %; esperado 7, 1..7 sem buraco. Nada foi alterado.', v_n, v_ordens;
  END IF;
  SELECT string_agg(ordem || ' ' || chave || ' ' || rotulo, '|' ORDER BY ordem) INTO v_texto FROM public.orcamentista_categoria_catalogo;
  IF md5(v_texto) <> '1877aa9191cb638df5ff8053fa22d5fb' THEN
    RAISE EXCEPTION 'verificacao 1: chaves ou rotulos do catalogo diferentes do decidido (md5 %). Nada foi alterado.', md5(v_texto);
  END IF;
  IF md5(obj_description('public.orcamentista_categoria_catalogo'::regclass, 'pg_class')) <> '74a3ea1b8496d4ea66d94d9adba1207e'
     OR md5(obj_description('public.orcamentista_categoria_campo'::regclass, 'pg_class')) <> '9caa206a57cdf95c38d549bc276b0849'
     OR md5(obj_description('public.orcamentista_materia_prima'::regclass, 'pg_class')) <> '936ff7fd7aa199f3ed8391243827d5fa' THEN
    RAISE EXCEPTION 'verificacao 1: um dos tres COMMENTs reescritos nao chegou como o texto certo. Nada foi alterado.';
  END IF;

  -- (2) nenhum mojibake: rótulos do catálogo e dos campos, e os COMMENTs das 11 tabelas
  SELECT string_agg(x, ', ') INTO v_sujos FROM (
    SELECT 'catalogo.' || chave AS x FROM public.orcamentista_categoria_catalogo
     WHERE strpos(rotulo, chr(195)) > 0 OR strpos(rotulo, chr(194)) > 0
    UNION ALL
    SELECT categoria_chave || '.' || chave FROM public.orcamentista_categoria_campo
     WHERE strpos(rotulo, chr(195)) > 0 OR strpos(rotulo, chr(194)) > 0
    UNION ALL
    SELECT 'comment ' || t FROM unnest(tabelas) t
     WHERE strpos(coalesce(obj_description(('public.' || t)::regclass, 'pg_class'), ''), chr(195)) > 0
        OR strpos(coalesce(obj_description(('public.' || t)::regclass, 'pg_class'), ''), chr(194)) > 0
  ) s;
  IF v_sujos IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 2: mojibake em %. Nada foi alterado.', v_sujos;
  END IF;

  -- (3) toda matéria-prima: exatamente uma linha por chave do catálogo, e PERSIANAS com config NULL
  SELECT string_agg(m.id::text, ', ') INTO v_mp_ruins
    FROM public.orcamentista_materia_prima m
   WHERE (SELECT count(*) FROM public.orcamentista_mp_categoria c WHERE c.materia_prima_id = m.id) <> (SELECT count(*) FROM public.orcamentista_categoria_catalogo)
      OR EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo k
                  WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c WHERE c.materia_prima_id = m.id AND c.categoria_chave = k.chave))
      OR EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c
                  WHERE c.materia_prima_id = m.id AND c.categoria_chave = 'PERSIANAS' AND c.config IS NOT NULL);
  IF v_mp_ruins IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 3: materia(s)-prima(s) sem exatamente uma linha por categoria do catalogo, ou com PERSIANAS ja configurada: %. Nada foi alterado.', v_mp_ruins;
  END IF;

  -- (4) nenhum config perdido nem mudado
  SELECT n, conteudo INTO v_n_antes, v_c_antes FROM _config_antes;
  SELECT count(*) FILTER (WHERE config IS NOT NULL),
         md5(coalesce(string_agg(id::text || '=' || config::text, ',' ORDER BY id) FILTER (WHERE config IS NOT NULL), ''))
    INTO v_n_depois, v_c_depois FROM public.orcamentista_mp_categoria;
  IF v_n_depois <> v_n_antes OR v_c_depois <> v_c_antes THEN
    RAISE EXCEPTION 'verificacao 4: config mudou — antes % (md5 %), depois % (md5 %). Nada foi alterado.', v_n_antes, v_c_antes, v_n_depois, v_c_depois;
  END IF;

  -- (5) PERSIANAS sem campo escalar
  IF EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo WHERE categoria_chave = 'PERSIANAS') THEN
    RAISE EXCEPTION 'verificacao 5: PERSIANAS tem campo em orcamentista_categoria_campo; ela entra sem campo escalar. Nada foi alterado.';
  END IF;

  RAISE NOTICE 'catalogo: 7 categorias na ordem nova; % config preservado(s); % materia(s)-prima(s) com 7 linhas.',
    v_n_depois, (SELECT count(*) FROM public.orcamentista_materia_prima);
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select ordem, chave, rotulo, encode(convert_to(rotulo, 'UTF8'), 'hex') from public.orcamentista_categoria_catalogo order by ordem;
-- -- esperado: 7 linhas, 1 PERFIL … 7 INSTALACAO; REFORCO = 'Reforço metálico'
-- --           (hex 5265666f72c3a76f206d6574c3a16c69636f)
-- select materia_prima_id, count(*), count(config) from public.orcamentista_mp_categoria group by 1;
-- -- esperado em 24/10/2026: 1 matéria-prima, 7 linhas, 3 com config (eram 6 linhas e 3 com config)
