-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000005 — a CATEGORIA da tabela de fornecedor: uma tabela = uma categoria.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261027000005_categoria_da_tabela_de_fornecedor.
-- ║ SEM ELA O CÓDIGO QUEBRA: a rota e a tela da tabela leem e gravam `orcamentista_tabela.categoria_chave`.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 27/10/2026 (`.claude/rules/tabela-de-preco-por-categoria.md`).
-- "UMA TABELA = UMA CATEGORIA. Ao subir uma tabela de fornecedor, a categoria (a ramificação) é
-- obrigatória." A razão, dita por ele: não pode haver margem para o agente usar, no levantamento e
-- nas fórmulas, o preço de uma ramificação que ninguém escolheu.
--
-- O QUE FAZ — e só isto:
--   A. `orcamentista_tabela.categoria_chave` (text, NULA, sem default), FK para
--      `orcamentista_categoria_catalogo (chave)` ON DELETE RESTRICT: a ramificação da tabela, da lista
--      das categorias da plataforma (PERFIL, FERRAGENS, VIDRO, REFORCO, ACESSORIOS_VEDACAO, INSTALACAO,
--      PERSIANAS).
--   B. Uma trava de INSERT: tabela NOVA sem categoria o banco recusa (23514, `orcamentista_tabela_categoria_obrigatoria`).
--      A rota recusa antes, com a frase; esta é a terceira trava.
--   C. Uma trava de UPDATE: a categoria, uma vez dada, NÃO SE TROCA nem se apaga (23514,
--      `orcamentista_tabela_categoria_nao_se_troca`). Tabela de outra categoria é tabela nova; a antiga
--      se arquiva. Trocar a categoria no lugar mudaria, em silêncio, de qual tabela uma ramificação lê o preço.
--
-- O QUE NÃO FAZ:
--   - NENHUM UPDATE de dado. As 2 tabelas de hoje ficam com `categoria_chave` NULA: a da Wolff (4
--     segmentos) não pode declarar uma categoria só e NÃO É ALTERADA; a da Estrela (24 itens, Vidro) ganha
--     VIDRO pela tela, por quem decide, e não por esta migração.
--   - NÃO mexe no índice `orcamentista_tabela_uma_vigente` (fornecedor, família): alargá-lo para a categoria
--     é decisão do PR que troca os leitores.
--   - NÃO torna a coluna NOT NULL: as 2 tabelas de hoje seriam recusadas retroativamente.
--
-- A importação NÃO toca em `orcamentista_tabela` (conferido em `importar_conteudo_da_tabela`): a coluna
-- nova não é apagada por ela (`tabela-que-a-importacao-apaga.md`).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, a FK só se não existir, CREATE OR REPLACE FUNCTION, o gatilho
-- recriado (DROP TRIGGER IF EXISTS só do gatilho DESTA migração, que não carrega dado).
-- VERIFICAÇÃO (aborta): a coluna com o tipo e a nulabilidade, a FK com a definição, a função com o
-- search_path fixo, o gatilho habilitado com o tipo certo.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_tabela') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_tabela. Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_categoria_catalogo') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_categoria_catalogo. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela' AND column_name = 'vigente') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_tabela.vigente (20261026000005). Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. a coluna e a FK ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_tabela ADD COLUMN IF NOT EXISTS categoria_chave text;

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_categoria_fkey') THEN
    ALTER TABLE public.orcamentista_tabela
      ADD CONSTRAINT orcamentista_tabela_categoria_fkey
      FOREIGN KEY (categoria_chave) REFERENCES public.orcamentista_categoria_catalogo (chave) ON DELETE RESTRICT;
  END IF;
END
$fk$;

COMMENT ON COLUMN public.orcamentista_tabela.categoria_chave IS
  'A categoria (a ramificacao) da tabela, da lista orcamentista_categoria_catalogo: uma tabela = uma categoria (dono do produto, 27/10/2026). Obrigatoria na tabela nova; nula nas de antes (a da Wolff tem 4 segmentos e nao declara uma so). Uma vez dada, nao se troca.';

-- ── B e C. as travas ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orcamentista_tabela_categoria_guarda() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.categoria_chave IS NULL THEN
      RAISE EXCEPTION 'orcamentista_tabela_categoria_obrigatoria: a tabela nova precisa declarar a categoria (categoria_chave).'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.categoria_chave IS NOT NULL AND NEW.categoria_chave IS DISTINCT FROM OLD.categoria_chave THEN
    RAISE EXCEPTION 'orcamentista_tabela_categoria_nao_se_troca: a categoria da tabela e % e nao se troca nem se apaga; suba outra tabela.', OLD.categoria_chave
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.orcamentista_tabela_categoria_guarda() FROM PUBLIC;

DROP TRIGGER IF EXISTS orcamentista_tabela_categoria_guarda ON public.orcamentista_tabela;
CREATE TRIGGER orcamentista_tabela_categoria_guarda
  BEFORE INSERT OR UPDATE OF categoria_chave ON public.orcamentista_tabela
  FOR EACH ROW EXECUTE FUNCTION public.orcamentista_tabela_categoria_guarda();

DO $verifica$
DECLARE
  def text;
  tg record;
BEGIN
  -- (1) a coluna: text, NULA, sem default
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela'
                   AND column_name = 'categoria_chave' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_tabela.categoria_chave ausente ou com outra forma. Nada foi alterado.';
  END IF;
  -- (2) a FK, pela definição
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_categoria_fkey';
  IF def IS DISTINCT FROM 'FOREIGN KEY (categoria_chave) REFERENCES orcamentista_categoria_catalogo(chave) ON DELETE RESTRICT' THEN
    RAISE EXCEPTION 'verificacao 2: FK orcamentista_tabela_categoria_fkey ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (3) a função: search_path fixo
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'orcamentista_tabela_categoria_guarda'
                    AND p.proconfig @> ARRAY['search_path=pg_catalog, public']) THEN
    RAISE EXCEPTION 'verificacao 3: a funcao orcamentista_tabela_categoria_guarda esta ausente ou sem o search_path fixo. Nada foi alterado.';
  END IF;
  -- (4) o gatilho: BEFORE, INSERT e UPDATE, por linha, habilitado, só na coluna da categoria no UPDATE
  SELECT t.tgtype, t.tgenabled, t.tgattr::text AS attrs,
         (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.orcamentista_tabela'::regclass AND attname = 'categoria_chave') AS col
    INTO tg
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.orcamentista_tabela'::regclass AND t.tgname = 'orcamentista_tabela_categoria_guarda' AND NOT t.tgisinternal;
  IF tg.tgtype IS DISTINCT FROM 23 OR tg.tgenabled IS DISTINCT FROM 'O' OR tg.attrs IS DISTINCT FROM tg.col::text THEN
    RAISE EXCEPTION 'verificacao 4: o gatilho orcamentista_tabela_categoria_guarda esta ausente ou com outra forma (tgtype %, habilitado %, colunas %). Nada foi alterado.',
      coalesce(tg.tgtype::text, '(ausente)'), coalesce(tg.tgenabled::text, '(ausente)'), coalesce(tg.attrs, '(ausente)');
  END IF;
  RAISE NOTICE 'categoria da tabela de fornecedor: coluna, FK, funcao e gatilho.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_tabela' and column_name = 'categoria_chave';
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_tabela_categoria_fkey';
-- select tgname, tgtype, tgenabled from pg_trigger where tgname = 'orcamentista_tabela_categoria_guarda';
-- select id, categoria_chave from public.orcamentista_tabela;   -- esperado: as 2, categoria_chave nula
