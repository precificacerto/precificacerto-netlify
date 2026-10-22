-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261022000001 — o segredo do webhook, por conexão de WhatsApp
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- O QUE FAZ
--   `whatsapp_conexao.webhook_segredo`: o segredo que vai na URL de entrada do Atendimentos I.A.
--   (`/api/atendimentos-ia/inbound?c=<webhook_segredo>`). É ele — e NÃO o `wuzapi_token` — que abre
--   a rota: o token é a credencial do WUZAPI (vai no header `token:`), e uma URL cai no log de acesso
--   do WUZAPI e da Vercel. Quem lesse o token ali poderia enviar mensagens como a empresa e
--   reapontar o webhook dela.
--
-- POR QUE É IDEMPOTENTE, e precisa ser
--   Medido em produção em 22/10/2026: a coluna, o CHECK e a UNIQUE parcial JÁ EXISTEM, criados à
--   mão, e o segredo está preenchido em 1 de 1 linha — mas NÃO há arquivo de migração no repositório
--   e o ledger `supabase_migrations.schema_migrations` não tem a versão 20261022000001. Este arquivo
--   tem de rodar SEM ERRO nos dois bancos:
--     - no de produção, onde tudo já existe: não cria nada de novo e não mexe no segredo preenchido;
--     - num banco limpo: cria a coluna, o CHECK e a UNIQUE, e preenche as linhas que houver.
--   Por isso `ADD COLUMN IF NOT EXISTS`, e o CHECK e a UNIQUE só são criados se NÃO houver um
--   equivalente — procurado pela DEFINIÇÃO, não pelo nome: o de produção foi criado à mão, e o nome
--   dele não é garantido.
--
-- O FORMATO DO SEGREDO
--   Hexadecimal minúsculo, 32 a 64 caracteres. O sistema gera 32 — um `randomUUID` sem os hífens,
--   PRÓPRIO, independente do token (`segredoNovo`, em
--   `src/lib/atendimentos-ia/orcamentista-da-empresa.ts`). O preenchimento abaixo usa a mesma forma:
--   `gen_random_uuid()` sem os hífens. Só onde é NULL: segredo que já existe NÃO é trocado — a URL
--   apontada no WUZAPI depende dele.
--
-- COMO APLICAR (`migration-delivery.md`)
--   - pelo conector: tire o BEGIN e o COMMIT (ele abre transação própria) e registre o `name` como
--     o nome COMPLETO deste arquivo, sem a extensão: `20261022000001_segredo_do_webhook_por_conexao`.
--     Diga o md5 do arquivo E o do payload, com a transformação nomeada entre eles
--     (`transformacao-quebra-a-cadeia-de-hash.md`);
--   - pelo SQL Editor: como está.
--   - DEPOIS: `NOTIFY pgrst, 'reload schema';` — não vem junto com o COMMIT.
--   O bloco VERIFICAÇÃO no fim ABORTA a transação se algo não ficar como deve.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. A COLUNA ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_conexao
  ADD COLUMN IF NOT EXISTS webhook_segredo text NULL;

-- ── 2. O CHECK e a UNIQUE parcial — só se não houver um equivalente ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint k
    WHERE k.conrelid = 'public.whatsapp_conexao'::regclass
      AND k.contype = 'c'
      AND pg_get_constraintdef(k.oid) LIKE '%webhook_segredo%'
      AND pg_get_constraintdef(k.oid) LIKE '%^[0-9a-f]{32,64}$%'
  ) THEN
    ALTER TABLE public.whatsapp_conexao
      ADD CONSTRAINT whatsapp_conexao_webhook_segredo_check
      CHECK (webhook_segredo IS NULL OR webhook_segredo ~ '^[0-9a-f]{32,64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public'
      AND t.relname = 'whatsapp_conexao'
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'webhook_segredo'
  ) THEN
    CREATE UNIQUE INDEX whatsapp_conexao_webhook_segredo_key
      ON public.whatsapp_conexao (webhook_segredo)
      WHERE webhook_segredo IS NOT NULL;
  END IF;
END
$$;

-- ── 3. O PREENCHIMENTO — só onde é NULL ────────────────────────────────────────────────────
UPDATE public.whatsapp_conexao
   SET webhook_segredo = replace(gen_random_uuid()::text, '-', '')
 WHERE webhook_segredo IS NULL;

COMMENT ON COLUMN public.whatsapp_conexao.webhook_segredo IS
  'Segredo da URL de entrada do Atendimentos I.A. (/api/atendimentos-ia/inbound?c=). Hexadecimal minusculo, 32 a 64. Gerado pelo sistema, independente do wuzapi_token - o token e a credencial do WUZAPI e nunca vai em URL. Nao se troca um segredo preenchido: a URL apontada no WUZAPI depende dele.';

-- ── 4. VERIFICAÇÃO — aborta se algo não ficou como deve ────────────────────────────────────
DO $$
DECLARE
  v_coluna int;
  v_check  int;
  v_unique int;
  v_nulos  int;
BEGIN
  SELECT count(*) INTO v_coluna
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'whatsapp_conexao'
    AND column_name = 'webhook_segredo' AND data_type = 'text' AND is_nullable = 'YES';

  SELECT count(*) INTO v_check
  FROM pg_constraint k
  WHERE k.conrelid = 'public.whatsapp_conexao'::regclass
    AND k.contype = 'c'
    AND pg_get_constraintdef(k.oid) LIKE '%webhook_segredo%'
    AND pg_get_constraintdef(k.oid) LIKE '%^[0-9a-f]{32,64}$%';

  SELECT count(*) INTO v_unique
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
  WHERE n.nspname = 'public' AND t.relname = 'whatsapp_conexao'
    AND i.indisunique AND i.indnatts = 1 AND a.attname = 'webhook_segredo';

  SELECT count(*) INTO v_nulos FROM public.whatsapp_conexao WHERE webhook_segredo IS NULL;

  IF v_coluna <> 1 THEN RAISE EXCEPTION 'webhook_segredo: a coluna text NULL nao esta la (%).', v_coluna; END IF;
  IF v_check  <> 1 THEN RAISE EXCEPTION 'webhook_segredo: esperado 1 CHECK de formato, ha %.', v_check; END IF;
  IF v_unique <> 1 THEN RAISE EXCEPTION 'webhook_segredo: esperada 1 UNIQUE, ha %.', v_unique; END IF;
  IF v_nulos  <> 0 THEN RAISE EXCEPTION 'webhook_segredo: % linha(s) sem segredo.', v_nulos; END IF;
END
$$;

COMMIT;
