-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261024000002 — o tipo "opção" no catálogo de campos, o critério do custo das barras, e o
-- conserto dos rótulos e COMMENTs que se corromperam no transporte da 20261023000002
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- ══ TRANSPORTE — ESTA MIGRAÇÃO TEM ACENTOS QUE IMPORTAM ══════════════════════════════════
-- Ela CONSERTA rótulos e COMMENTs que se corromperam no caminho até o banco: em produção,
-- "Reforço de aço" está gravado como "ReforÃ§o de aÃ§o" — o "ç" (c3 a7) virou "Ã§" (c3 83 c2 a7),
-- UTF-8 lido como Latin-1 e gravado de novo como UTF-8.
--
-- Este arquivo SÓ pode ser aplicado:
--   - pelo conector do Supabase, que lê e envia UTF-8; ou
--   - pelo PowerShell com `Get-Content -Encoding UTF8 <arquivo>`.
-- NUNCA copiando do Notepad pela área de transferência do Windows. Foi exatamente assim que os
-- rótulos se corromperam: o md5 provou o ARQUIVO, não o que chegou ao banco
-- (`.claude/rules/transformacao-quebra-a-cadeia-de-hash.md`).
--
-- Por isso a verificação no fim confere O QUE CHEGOU: cada rótulo e COMMENT gravado contra o md5
-- do texto certo, escrito em hexadecimal (ASCII, que o transporte não corrompe), e o "Ã"/"Â"
-- procurado por chr(195)/chr(194), não por literal. Se o transporte corromper este arquivo, a
-- verificação aborta e nada fica gravado.
--
-- O corpo entre $fn$ também tem acentos nos comentários, e o catálogo guarda esse texto
-- (`prosrc`): um transporte que corrompa o arquivo corromperia o corpo da função. É mais uma
-- razão para a regra acima, e a verificação (3b) é o que impede que isso passe calado.
--
-- ══ ORDEM — APLICAR SÓ JUNTO COM A TELA QUE CONHECE O TIPO 'opcao', OU DEPOIS DELA ════════
-- Medido em 24/10/2026: a tela "Matérias-primas e seus fornecedores" (#137) conhece seis tipos
-- (`TipoDoCampo` em `src/page-parts/atendimentos-ia/base-de-conhecimento/arvore.ts`), e
-- `normalizar` não tem ramo para 'opcao'. Com esta migração aplicada e a tela como está,
-- `categoriasConfiguradas` — o "N de 6 categorias" do cabeçalho de cada matéria-prima — ESTOURA
-- (`Cannot read properties of undefined (reading 'valor')`) em toda matéria-prima cujos seis
-- primeiros campos do PERFIL estejam vazios. Isso inclui TODA matéria-prima recém-adicionada.
-- Hoje há 1 categoria PERFIL em produção, com campo preenchido: abrir a tela não estoura;
-- "+ Adicionar matéria-prima" estouraria na hora. A mudança da tela NÃO está nesta migração.
--
-- ══ MEDIDO EM PRODUÇÃO ANTES DE ESCREVER (24/10/2026, só leitura) ═════════════════════════
--   - `orcamentista_categoria_campo.tipo`: CHECK `orcamentista_categoria_campo_tipo_valido`
--     aceita texto, inteiro, numero, booleano, lista_texto, mapa. Não há tipo de opção.
--   - rótulos com mojibake: 3 no catálogo (REFORCO, ACESSORIOS_VEDACAO, INSTALACAO) e 4 nos campos
--     (REFORCO.usa, REFORCO.par_inox_referencia, ACESSORIOS_VEDACAO.cor_por_perfil,
--     ACESSORIOS_VEDACAO.vedacao). Os mesmos 7 da lista do dono do produto.
--   - COMMENTs com mojibake: 11, todos de tabela e todos escritos pela 20261023000002 — os 8 das
--     tabelas dos três níveis e os de orcamentista_base_conhecimento, orcamentista_esquadrias_base
--     e orcamentista_esquadrias_padrao. Nenhum COMMENT de coluna nem de função. Assinatura usada:
--     "Ã" ou "Â" seguido de caractere não-ASCII — o "NÃO" legítimo de 25 outros objetos não casa.
--   - `superadmin_gravar_mp_categoria` em produção == a da 20261023000003 no repositório,
--     descontado o \r: md5 06151c5952b11f37f9717495ac22bc04 nos dois (4.474 caracteres, 74 \r).
--   - `orcamentista_tabela_item.valor_barra_interno` e `.valor_metro_interno`: existem, numeric.
--   - PERFIL tem os campos de ordem 1 a 6; a 7 está livre.
--
-- ══ O QUE FAZ ══════════════════════════════════════════════════════════════════════════════
--   1. `orcamentista_categoria_campo` ganha `opcoes text[]`; o CHECK de `tipo` ganha 'opcao'; e um
--      CHECK de coerência: tipo = 'opcao' ⇔ opcoes NOT NULL, e então pelo menos 2 valores, nenhum
--      vazio (nem só espaços), nenhum NULL e sem repetidos. Um sem o outro não existe.
--   2. O campo `criterio_custo_barra` em PERFIL: tipo 'opcao', ordem 7, rótulo "Custo das barras",
--      opcoes {BARRA_INTEIRA, CONSUMO_REAL}. SEM valor padrão.
--   3. Os 7 rótulos e os 11 COMMENTs, com o texto da 20261023000002. Nenhuma chave muda.
--   4. `superadmin_gravar_mp_categoria` aprende 'opcao': string E pertence a `opcoes` do campo.
--
-- ══ O QUE NÃO FAZ ══════════════════════════════════════════════════════════════════════════
--   - Não preenche `criterio_custo_barra` em config de empresa nenhuma: NULL continua querendo
--     dizer "ainda não configurado" (`ausente-vs-falso.md`).
--   - Não muda nada na função além do ramo 'opcao' e da descrição do erro de tipo (seção 4).
--   - Não toca a tela.
--
-- ══ HARNESS ════════════════════════════════════════════════════════════════════════════════
-- `scripts/harness/opcao-catalogo/` — os casos e as mutações, num Postgres local descartável. O
-- harness reproduz o mojibake de produção ANTES de aplicar, e confere o hex de um rótulo contra o
-- medido em produção, para que o conserto seja exercitado sobre o estado real.
--
-- ══ COMO APLICAR ═══════════════════════════════════════════════════════════════════════════
--   - Antes: conferir o md5 do arquivo (bytes sem \r) contra o publicado no PR.
--   - Pelo conector: remover a linha `BEGIN;` e a linha `COMMIT;` — o conector abre a transação
--     dele (`migration-delivery.md`). São duas linhas, 15 bytes com as quebras; nada mais sai.
--   - Depois: as consultas do fim do arquivo, e `NOTIFY pgrst, 'reload schema';`.
--   - `name` no histórico: `20261024000002_opcao_no_catalogo_e_criterio_da_barra`.

BEGIN;

-- ── 0. GUARDA — o que esta migração pressupõe, ou ela aborta aqui, antes de tocar em nada ─────
DO $guarda$
DECLARE faltam text;
BEGIN
  SELECT string_agg(x, ', ') INTO faltam FROM unnest(ARRAY[
      CASE WHEN to_regclass('public.orcamentista_categoria_campo') IS NULL THEN 'orcamentista_categoria_campo (20261023000002)' END,
      CASE WHEN to_regclass('public.orcamentista_categoria_catalogo') IS NULL THEN 'orcamentista_categoria_catalogo (20261023000002)' END,
      CASE WHEN to_regprocedure('public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb)') IS NULL THEN 'superadmin_gravar_mp_categoria (20261023000003)' END
    ]) x WHERE x IS NOT NULL;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'dependencia(s) ausente(s): %. Nada foi alterado.', faltam;
  END IF;
END
$guarda$;

-- ── 1. O TIPO "opção" NO CATÁLOGO DE CAMPOS ────────────────────────────────────────────────
-- `opcoes` só existe junto com tipo = 'opcao', e tipo = 'opcao' só existe com `opcoes`: um sem o
-- outro não é estado possível. A coerência mora num CHECK, e as regras da lista (pelo menos dois
-- valores, nenhum vazio, nenhum NULL, sem repetidos) numa função imutável, porque CHECK não aceita
-- subconsulta e "sem repetidos" precisa de uma.
ALTER TABLE public.orcamentista_categoria_campo ADD COLUMN IF NOT EXISTS opcoes text[];

CREATE OR REPLACE FUNCTION public.orcamentista_opcoes_validas(p_opcoes text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT p_opcoes IS NOT NULL
     AND array_ndims(p_opcoes) = 1
     AND cardinality(p_opcoes) >= 2
     AND NOT EXISTS (SELECT 1 FROM unnest(p_opcoes) v WHERE v IS NULL OR btrim(v) = '')
     -- DISTINCT conta o NULL como um valor (count(DISTINCT v) o ignoraria): assim cada regra acima
     -- é barrada por UMA checagem só, e tirar qualquer uma delas fica vermelho no harness
     AND cardinality(p_opcoes) = (SELECT count(*) FROM (SELECT DISTINCT v FROM unnest(p_opcoes) v) d)
$fn$;

ALTER TABLE public.orcamentista_categoria_campo DROP CONSTRAINT IF EXISTS orcamentista_categoria_campo_tipo_valido;
ALTER TABLE public.orcamentista_categoria_campo ADD CONSTRAINT orcamentista_categoria_campo_tipo_valido
  CHECK (tipo IN ('texto', 'inteiro', 'numero', 'booleano', 'lista_texto', 'mapa', 'opcao'));

ALTER TABLE public.orcamentista_categoria_campo DROP CONSTRAINT IF EXISTS orcamentista_categoria_campo_opcoes_coerentes;
ALTER TABLE public.orcamentista_categoria_campo ADD CONSTRAINT orcamentista_categoria_campo_opcoes_coerentes
  CHECK ((tipo = 'opcao') = (opcoes IS NOT NULL)
         AND (opcoes IS NULL OR public.orcamentista_opcoes_validas(opcoes)));

COMMENT ON COLUMN public.orcamentista_categoria_campo.opcoes IS
  'Os valores aceitos quando tipo = opcao, na ordem em que a tela os oferece. NULL em todo outro tipo.';

-- ── 2. O CRITÉRIO DO CUSTO DAS BARRAS, na categoria PERFIL ────────────────────────────────
-- SEM valor padrão, e sem preencher config de empresa nenhuma: NULL continua querendo dizer "ainda
-- não configurado", e a empresa que não escolheu não tem critério escolhido por omissão
-- (`ausente-vs-falso.md`).
INSERT INTO public.orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem, opcoes) VALUES
  ('PERFIL', 'criterio_custo_barra', 'opcao', 'Custo das barras', 7, ARRAY['BARRA_INTEIRA', 'CONSUMO_REAL'])
ON CONFLICT (categoria_chave, chave) DO NOTHING;

-- ── 3. OS RÓTULOS E COMMENTs CORROMPIDOS NO TRANSPORTE DA 20261023000002 ────────────────────
-- Só texto de exibição: nenhuma chave muda. O texto é o da 20261023000002, como está no
-- repositório. Os 11 COMMENTs são todos os que aquela migração escreve: os 8 das tabelas dos três
-- níveis e os 3 de base_conhecimento, esquadrias_base e esquadrias_padrao, corrompidos pelo mesmo
-- transporte (medido em 24/10/2026; decisão do dono do produto: os 11).
UPDATE public.orcamentista_categoria_catalogo SET rotulo = 'Reforço de aço' WHERE chave = 'REFORCO';
UPDATE public.orcamentista_categoria_catalogo SET rotulo = 'Acessórios e vedação' WHERE chave = 'ACESSORIOS_VEDACAO';
UPDATE public.orcamentista_categoria_catalogo SET rotulo = 'Instalação' WHERE chave = 'INSTALACAO';
UPDATE public.orcamentista_categoria_campo SET rotulo = 'Usa reforço' WHERE categoria_chave = 'REFORCO' AND chave = 'usa';
UPDATE public.orcamentista_categoria_campo SET rotulo = 'Referência do par em inox' WHERE categoria_chave = 'REFORCO' AND chave = 'par_inox_referencia';
UPDATE public.orcamentista_categoria_campo SET rotulo = 'Cor do acessório por cor de perfil' WHERE categoria_chave = 'ACESSORIOS_VEDACAO' AND chave = 'cor_por_perfil';
UPDATE public.orcamentista_categoria_campo SET rotulo = 'Vedação' WHERE categoria_chave = 'ACESSORIOS_VEDACAO' AND chave = 'vedacao';

COMMENT ON TABLE public.orcamentista_categoria_catalogo IS
  'As 6 categorias de uma matéria-prima, fixas e numeradas: 1 PERFIL, 2 REFORCO, 3 FERRAGENS, 4 ACESSORIOS_VEDACAO, 5 VIDRO, 6 INSTALACAO. Da plataforma, sem tenant.';
COMMENT ON TABLE public.orcamentista_categoria_campo IS
  'As chaves válidas de orcamentista_mp_categoria.config, por categoria. Chave fora daqui é erro, não campo novo. FERRAGENS, VIDRO e INSTALACAO não têm campo escalar: vivem em orcamentista_mp_ferragem, _vidro e _instalacao.';
COMMENT ON TABLE public.orcamentista_materia_prima IS
  'O primeiro nível: a matéria-prima da empresa (PVC, alumínio...). Cada uma tem as mesmas 6 categorias, com outros fornecedores e outras respostas.';
COMMENT ON TABLE public.orcamentista_mp_categoria IS
  'O segundo nível: uma categoria dentro de uma matéria-prima. config NULL = ainda não configurado; não há herança neste modelo.';
COMMENT ON TABLE public.orcamentista_mp_categoria_fornecedor IS
  'O terceiro nível: os N fornecedores de uma categoria. O selecionado determina o valor; um é principal (o padrão), e só um.';
COMMENT ON TABLE public.orcamentista_mp_vidro IS
  'Uma linha por vidro que se compra. Só pendura em categoria VIDRO (FK composta com categoria_chave).';
COMMENT ON TABLE public.orcamentista_mp_ferragem IS
  'Uma linha por ferragem: cada uma tem o seu código, e interna e externa são duas linhas. Só pendura em categoria FERRAGENS.';
COMMENT ON TABLE public.orcamentista_mp_instalacao IS
  'Uma linha por produto de instalação. usa NULL = ainda não informado, false = decisão. Só pendura em categoria INSTALACAO.';
COMMENT ON TABLE public.orcamentista_base_conhecimento IS
  'adicional é sempre calculado POR FORA do orçamento das esquadrias; em PERCENTUAL permanece percentual na decomposição, abatido sobre o valor recalculado pós-desconto';
COMMENT ON TABLE public.orcamentista_esquadrias_base IS
  'legado: substituída pelo modelo de três níveis em 20261023000002';
COMMENT ON TABLE public.orcamentista_esquadrias_padrao IS
  'legado: substituída pelo modelo de três níveis em 20261023000002';

-- ── 4. A FUNÇÃO APRENDE O TIPO 'opcao' ──────────────────────────────────────────────────
-- O corpo é o da 20261023000003, byte a byte (conferido contra o prosrc de produção em
-- 24/10/2026: md5 sem \r 06151c5952b11f37f9717495ac22bc04, nos dois), com DUAS mudanças e só elas:
--   (a) o ramo WHEN 'opcao': o valor é string E pertence a `opcoes` daquele campo;
--   (b) a descrição do erro de tipo, para o campo 'opcao', diz "um de: <os valores aceitos>"
--       no lugar do nome do tipo — é o que faz a mensagem nomear a chave E os valores.
-- O corpo entre $fn$ É o artefato: o catálogo guarda este texto (`prosrc`).
CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_categoria(
  p_tenant uuid, p_por uuid, p_materia_prima uuid, p_categoria text, p_corpo jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes  jsonb;
  v_config jsonb;
  v_id     uuid;
  v_depois jsonb;
  v_fora   text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo k WHERE k.chave = p_categoria) THEN
    RAISE EXCEPTION 'categoria desconhecida: %', coalesce(p_categoria, '(nula)') USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_corpo IS NULL OR jsonb_typeof(p_corpo) <> 'object' OR p_corpo = '{}'::jsonb THEN
    RAISE EXCEPTION 'nada a gravar' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- chave desconhecida é ERRO, não campo novo
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_object_keys(p_corpo) k
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo c WHERE c.categoria_chave = p_categoria AND c.chave = k);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'chave(s) fora do catalogo de %: %', p_categoria, v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- o tipo, pelo catálogo; null passa (é o limpar)
  SELECT string_agg(format('%s (esperado %s)', e.key,
                         CASE WHEN c.tipo = 'opcao' THEN 'um de: ' || array_to_string(c.opcoes, ', ') ELSE c.tipo END),
                  ', ' ORDER BY e.key) INTO v_fora
    FROM jsonb_each(p_corpo) e
    JOIN public.orcamentista_categoria_campo c ON c.categoria_chave = p_categoria AND c.chave = e.key
   WHERE jsonb_typeof(e.value) <> 'null'
     AND NOT CASE c.tipo
           WHEN 'texto'       THEN jsonb_typeof(e.value) = 'string'
           WHEN 'numero'      THEN jsonb_typeof(e.value) = 'number'
           WHEN 'inteiro'     THEN CASE WHEN jsonb_typeof(e.value) = 'number'
                                        THEN (e.value #>> '{}')::numeric = trunc((e.value #>> '{}')::numeric)
                                        ELSE false END
           WHEN 'booleano'    THEN jsonb_typeof(e.value) = 'boolean'
           WHEN 'lista_texto' THEN CASE WHEN jsonb_typeof(e.value) = 'array'
                                        THEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) x WHERE jsonb_typeof(x) <> 'string')
                                        ELSE false END
           WHEN 'mapa'        THEN jsonb_typeof(e.value) = 'object'
           WHEN 'opcao'       THEN jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') = ANY (c.opcoes)
           ELSE false
         END;
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'valor(es) com tipo errado em %: %', p_categoria, v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_mp_categoria:' || p_tenant::text || ':' || p_materia_prima::text || ':' || p_categoria, 0));
  -- a matéria-prima tem de ser DESTA empresa: lida com o tenant, nunca confiada
  PERFORM 1 FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'materia-prima inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT to_jsonb(c), c.config, c.id INTO v_antes, v_config, v_id
    FROM public.orcamentista_mp_categoria c
   WHERE c.materia_prima_id = p_materia_prima AND c.tenant_id = p_tenant AND c.categoria_chave = p_categoria
   FOR UPDATE;

  -- merge, nunca substituição: o ausente fica, o null grava null
  INSERT INTO public.orcamentista_mp_categoria (id, tenant_id, materia_prima_id, categoria_chave, config, atualizado_por, atualizado_em)
  VALUES (coalesce(v_id, gen_random_uuid()), p_tenant, p_materia_prima, p_categoria, coalesce(v_config, '{}'::jsonb) || p_corpo, p_por, now())
  ON CONFLICT (materia_prima_id, categoria_chave) DO UPDATE
    SET config = EXCLUDED.config, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em
  RETURNING to_jsonb(orcamentista_mp_categoria.*), id INTO v_depois, v_id;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_mp_categoria', v_id::text,
          jsonb_build_object('orcamentista_mp_categoria', v_antes),
          jsonb_build_object('orcamentista_mp_categoria', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_mp_categoria', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.orcamentista_opcoes_validas(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orcamentista_opcoes_validas(text[]) TO service_role;

-- ── 5. VERIFICAÇÃO — aborta a migração inteira, e confere O QUE CHEGOU ao banco ──────────
-- Os md5 abaixo são do texto CERTO, calculados do arquivo da 20261023000002, e estão em
-- hexadecimal — ASCII, que nenhum transporte corrompe. E o "Ã"/"Â" é procurado por chr(195) e
-- chr(194), não por literal. Se o transporte corromper ESTE arquivo, os textos gravados não batem
-- com os md5, e a migração aborta: o md5 do arquivo provaria o arquivo; este prova o banco.
DO $verifica$
DECLARE
  tabelas text[] := ARRAY['orcamentista_categoria_catalogo', 'orcamentista_categoria_campo', 'orcamentista_materia_prima', 'orcamentista_mp_categoria', 'orcamentista_mp_categoria_fornecedor', 'orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao', 'orcamentista_base_conhecimento', 'orcamentista_esquadrias_base', 'orcamentista_esquadrias_padrao'];
  t        text;
  f        regprocedure;
  falhas   text;
  sujos    text;
BEGIN
  -- (1) opcoes existe e é text[]; os dois CHECKs estão lá
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orcamentista_categoria_campo'
                    AND column_name = 'opcoes' AND data_type = 'ARRAY' AND udt_name = '_text') THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_categoria_campo.opcoes nao existe ou nao e text[]. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_categoria_campo'::regclass
                    AND conname = 'orcamentista_categoria_campo_tipo_valido' AND pg_get_constraintdef(oid) LIKE '%''opcao''%') THEN
    RAISE EXCEPTION 'verificacao 1: o CHECK de tipo nao aceita opcao. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_categoria_campo'::regclass
                    AND conname = 'orcamentista_categoria_campo_opcoes_coerentes' AND contype = 'c') THEN
    RAISE EXCEPTION 'verificacao 1: o CHECK de coerencia entre tipo e opcoes nao existe. Nada foi alterado.';
  END IF;

  -- (2) o critério, em PERFIL, tipo opcao, com exatamente os dois valores, NESTA ordem
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo
                  WHERE categoria_chave = 'PERFIL' AND chave = 'criterio_custo_barra' AND tipo = 'opcao'
                    AND opcoes = ARRAY['BARRA_INTEIRA', 'CONSUMO_REAL']::text[]) THEN
    RAISE EXCEPTION 'verificacao 2: criterio_custo_barra nao esta em PERFIL como opcao {BARRA_INTEIRA, CONSUMO_REAL}, nesta ordem. Nada foi alterado.';
  END IF;

  -- (3a) ZERO "Ã"/"Â" nos rótulos dos dois catálogos e nos COMMENTs das 11 tabelas — só nelas:
  --      em outras tabelas há "NÃO" legítimo (o de employees, por exemplo), e não é mojibake
  SELECT string_agg(x, '; ') INTO sujos FROM (
    SELECT 'rotulo ' || chave AS x FROM public.orcamentista_categoria_catalogo
     WHERE strpos(rotulo, chr(195)) > 0 OR strpos(rotulo, chr(194)) > 0
    UNION ALL
    SELECT 'rotulo ' || categoria_chave || '.' || chave FROM public.orcamentista_categoria_campo
     WHERE strpos(rotulo, chr(195)) > 0 OR strpos(rotulo, chr(194)) > 0
    UNION ALL
    SELECT 'COMMENT ' || c.relname || CASE WHEN d.objsubid = 0 THEN '' ELSE '.' || d.objsubid END
      FROM pg_description d JOIN pg_class c ON c.oid = d.objoid
     WHERE d.classoid = 'pg_class'::regclass AND c.relnamespace = 'public'::regnamespace
       AND c.relname = ANY (tabelas)
       AND (strpos(d.description, chr(195)) > 0 OR strpos(d.description, chr(194)) > 0)
  ) s;
  IF sujos IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 3: ainda ha "Ã" ou "Â" em: %. Nada foi alterado.', sujos;
  END IF;

  -- (3b) e o que chegou é o texto CERTO, não só um texto sem "Ã": md5 contra o md5 do arquivo
  SELECT string_agg(x, '; ') INTO falhas FROM (
    SELECT 'rotulo REFORCO' AS x WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo WHERE chave = 'REFORCO' AND md5(rotulo) = 'a3016a9d59a77805edeb00fda7411f6f')
    UNION ALL
    SELECT 'rotulo ACESSORIOS_VEDACAO' AS x WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo WHERE chave = 'ACESSORIOS_VEDACAO' AND md5(rotulo) = '3d7ce547854934976cd1263a02d376a9')
    UNION ALL
    SELECT 'rotulo INSTALACAO' AS x WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo WHERE chave = 'INSTALACAO' AND md5(rotulo) = 'c52960e70d3f895805381f7ea0777129')
    UNION ALL
    SELECT 'rotulo REFORCO.usa' AS x WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo WHERE categoria_chave = 'REFORCO' AND chave = 'usa' AND md5(rotulo) = 'c5d8f419fb4df0189ae8f0272f45fc6e')
    UNION ALL
    SELECT 'rotulo REFORCO.par_inox_referencia' AS x WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo WHERE categoria_chave = 'REFORCO' AND chave = 'par_inox_referencia' AND md5(rotulo) = '08f30a0e340f3ea5082cc39c3bf6bdfd')
    UNION ALL
    SELECT 'rotulo ACESSORIOS_VEDACAO.cor_por_perfil' AS x WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo WHERE categoria_chave = 'ACESSORIOS_VEDACAO' AND chave = 'cor_por_perfil' AND md5(rotulo) = '5dd622dd3d790a79c45838a3b3a2b391')
    UNION ALL
    SELECT 'rotulo ACESSORIOS_VEDACAO.vedacao' AS x WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo WHERE categoria_chave = 'ACESSORIOS_VEDACAO' AND chave = 'vedacao' AND md5(rotulo) = '3ae5ef05a64512cee823381bedf318c9')
    UNION ALL
    SELECT 'COMMENT orcamentista_categoria_catalogo' WHERE md5(coalesce(obj_description('public.orcamentista_categoria_catalogo'::regclass, 'pg_class'), '')) <> 'e778449425a343e61f5ae8f2f3962b2c'
    UNION ALL
    SELECT 'COMMENT orcamentista_categoria_campo' WHERE md5(coalesce(obj_description('public.orcamentista_categoria_campo'::regclass, 'pg_class'), '')) <> 'e39b722e8f591259da653c48d6bb19be'
    UNION ALL
    SELECT 'COMMENT orcamentista_materia_prima' WHERE md5(coalesce(obj_description('public.orcamentista_materia_prima'::regclass, 'pg_class'), '')) <> 'a055a744501173825091aa5e472d36ae'
    UNION ALL
    SELECT 'COMMENT orcamentista_mp_categoria' WHERE md5(coalesce(obj_description('public.orcamentista_mp_categoria'::regclass, 'pg_class'), '')) <> '0f82edd310947ae4c5755ad555390e44'
    UNION ALL
    SELECT 'COMMENT orcamentista_mp_categoria_fornecedor' WHERE md5(coalesce(obj_description('public.orcamentista_mp_categoria_fornecedor'::regclass, 'pg_class'), '')) <> '8a19a3bc0cfaac2f5458cc4c67ab3739'
    UNION ALL
    SELECT 'COMMENT orcamentista_mp_vidro' WHERE md5(coalesce(obj_description('public.orcamentista_mp_vidro'::regclass, 'pg_class'), '')) <> '4dc63f159067594f4cec22fd3378b06d'
    UNION ALL
    SELECT 'COMMENT orcamentista_mp_ferragem' WHERE md5(coalesce(obj_description('public.orcamentista_mp_ferragem'::regclass, 'pg_class'), '')) <> '555882c5d0738eba95ff2bb06b2ee15e'
    UNION ALL
    SELECT 'COMMENT orcamentista_mp_instalacao' WHERE md5(coalesce(obj_description('public.orcamentista_mp_instalacao'::regclass, 'pg_class'), '')) <> 'b7b815d9e2b22c3958262d04a5da459b'
    UNION ALL
    SELECT 'COMMENT orcamentista_base_conhecimento' WHERE md5(coalesce(obj_description('public.orcamentista_base_conhecimento'::regclass, 'pg_class'), '')) <> 'eec0293472c485c81fd8915ed66e7d5f'
    UNION ALL
    SELECT 'COMMENT orcamentista_esquadrias_base' WHERE md5(coalesce(obj_description('public.orcamentista_esquadrias_base'::regclass, 'pg_class'), '')) <> '44f40f56fe88ba79fffa2b4e35f837de'
    UNION ALL
    SELECT 'COMMENT orcamentista_esquadrias_padrao' WHERE md5(coalesce(obj_description('public.orcamentista_esquadrias_padrao'::regclass, 'pg_class'), '')) <> '44f40f56fe88ba79fffa2b4e35f837de'
  ) s;
  IF falhas IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 3: o texto gravado nao e o da 20261023000002 (md5 nao bate) em: %. Nada foi alterado.', falhas;
  END IF;

  -- (4) a função de gravar e a das opções: SECURITY DEFINER (só a de gravar), search_path fixo,
  --     fechadas a PUBLIC/anon/authenticated, executáveis por service_role, sem herança por PUBLIC
  FOREACH t IN ARRAY ARRAY['public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb)',
                           'public.orcamentista_opcoes_validas(text[])'] LOOP
    f := to_regprocedure(t);
    IF f IS NULL THEN
      RAISE EXCEPTION 'verificacao 4: a funcao % nao existe. Nada foi alterado.', t;
    END IF;
    IF t LIKE 'public.superadmin_%' AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef
                     AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'verificacao 4: % sem SECURITY DEFINER ou sem search_path fixo. Nada foi alterado.', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.proconfig IS NOT NULL
                      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'verificacao 4: % sem search_path fixo. Nada foi alterado.', t;
    END IF;
    IF has_function_privilege('public', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'verificacao 4: % aberta a PUBLIC/anon/authenticated (ou service_role sem EXECUTE). Nada foi alterado.', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.proacl IS NULL)
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x
                   WHERE p.oid = f AND x.grantee = 0 AND x.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'verificacao 4: % com EXECUTE herdavel por PUBLIC (ACL nula ou com PUBLIC). Nada foi alterado.', t;
    END IF;
  END LOOP;

  RAISE NOTICE 'opcao no catalogo: coluna e CHECKs no lugar; criterio_custo_barra em PERFIL; 7 rotulos e 11 COMMENTs com o texto certo; funcoes fechadas.';
END
$verifica$;

COMMIT;

-- ── DEPOIS DE APLICAR — pela consulta, não pelo retorno do comando ──────────────────────────
--   select chave, tipo, rotulo, ordem, opcoes from public.orcamentista_categoria_campo
--    where categoria_chave = 'PERFIL' order by ordem;
--   → 7 linhas; a última: criterio_custo_barra | opcao | Custo das barras | 7 | {BARRA_INTEIRA,CONSUMO_REAL}
--   select chave, rotulo, encode(convert_to(rotulo, 'UTF8'), 'hex') from public.orcamentista_categoria_catalogo order by ordem;
--   → "Reforço de aço" tem c3a7 (ç), não c383c2a7.
-- E então: NOTIFY pgrst, 'reload schema';  — ele NÃO vem junto com o COMMIT.
