-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261026000005 — a tabela VIGENTE do fornecedor, por família.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261026000005_tabela_vigente.
-- ║ SEM ELA O CÓDIGO QUEBRA: a tela e a rota da tabela leem e gravam `orcamentista_tabela.vigente`.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 26/10/2026. As tabelas de uma conta passam a ser DERIVADAS dos
-- fornecedores que a base de conhecimento declara, e o fornecedor pode ter mais de uma tabela da mesma
-- família (a de 2026 e a de 2027). "VIGÊNCIA: opção (b), marca de vigente" — o sistema não escolhe
-- sozinho, nem "a mais recente". E a antiga não se exclui: "ela é a explicação de um orçamento feito no
-- ano passado. E apagar é decisão do PO." O histórico já está resolvido: `orcamentista_levantamento_item.
-- tabela_id` aponta a tabela EXATA que foi usada; `vigente` só decide o que LEVANTAMENTO NOVO usa.
--
-- O QUE FAZ:
--   A. `orcamentista_tabela.vigente` (boolean, NOT NULL, DEFAULT false): a tabela marcada pelo consultor
--      como a vigente do fornecedor na família dela. false = não marcada. Nenhuma tabela é marcada aqui:
--      as 2 de hoje ficam false (o DEFAULT preenche; não há UPDATE). Marcar é na tela.
--   B. Índice único PARCIAL: no máximo UMA vigente por (fornecedor, família) — o mesmo padrão de
--      `orcamentista_levantamento_um_em_montagem`. NULLS NOT DISTINCT (Postgres 15+; produção é 17.6):
--      duas tabelas do mesmo fornecedor SEM família informada também não ficam as duas vigentes.
--   C. COMMENT em `orcamentista_tabela.vigencia`: ela CONTINUA SENDO SÓ TEXTO, nota do consultor ("ex.:
--      desde 01/10/2026"), e não é lida como marca de nada.
--
-- A importação NÃO toca em `orcamentista_tabela` (conferido em `importar_conteudo_da_tabela`): a coluna
-- nova não é apagada por ela (`tabela-que-a-importacao-apaga.md`).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS.
-- VERIFICAÇÃO (aborta): a coluna com o tipo e o default, o índice com a definição esperada, e o
-- comentário da vigência.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_tabela') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_tabela. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela' AND column_name = 'familia') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_tabela.familia (20261026000004). Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. a marca ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_tabela ADD COLUMN IF NOT EXISTS vigente boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.orcamentista_tabela.vigente IS
  'A tabela vigente do fornecedor na familia dela, marcada pelo consultor. No maximo uma por (fornecedor, familia). Decide o que levantamento NOVO usa; o levantamento antigo aponta a sua tabela em orcamentista_levantamento_item.tabela_id. false = nao marcada.';

-- ── B. no máximo uma vigente por (fornecedor, família) ─────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_tabela_uma_vigente
  ON public.orcamentista_tabela (fornecedor_id, familia) NULLS NOT DISTINCT WHERE vigente;

-- ── C. a vigência continua sendo só texto ─────────────────────────────────────────────────
COMMENT ON COLUMN public.orcamentista_tabela.vigencia IS
  'Nota do consultor, texto livre (ex.: desde 01/10/2026). NAO e marca de vigencia: quem diz qual tabela vale e a coluna vigente.';

DO $verifica$
DECLARE
  def text;
BEGIN
  -- (1) a coluna: boolean, NOT NULL, DEFAULT false
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela'
                   AND column_name = 'vigente' AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_tabela.vigente ausente ou com outra forma. Nada foi alterado.';
  END IF;
  -- (2) o índice único parcial, pela definição
  SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_tabela_uma_vigente';
  IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_tabela_uma_vigente ON public.orcamentista_tabela USING btree (fornecedor_id, familia) NULLS NOT DISTINCT WHERE vigente' THEN
    RAISE EXCEPTION 'verificacao 2: indice orcamentista_tabela_uma_vigente ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (3) o comentário da vigência
  IF col_description('public.orcamentista_tabela'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.orcamentista_tabela'::regclass AND attname = 'vigencia')) NOT LIKE 'Nota do consultor%' THEN
    RAISE EXCEPTION 'verificacao 3: o comentario de orcamentista_tabela.vigencia nao foi gravado. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'tabela vigente: coluna, indice unico parcial e comentario da vigencia.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_tabela' and column_name = 'vigente';
-- select indexdef from pg_indexes where indexname = 'orcamentista_tabela_uma_vigente';
-- select id, fornecedor_id, familia, vigente from public.orcamentista_tabela;   -- esperado: as 2, vigente false
