-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261022000002 — UMA pré-definição por conversa: UNIQUE (conversa_id)
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- O QUE FAZ
--   `orcamentista_pre_definicao` passa a ter UNIQUE (conversa_id). A regra "uma pré-definição por
--   conversa" existia só no código da conversa da IA (`src/lib/atendimentos-ia/conversa-da-ia.ts`),
--   que LÊ antes de inserir. Duas mensagens simultâneas na mesma conversa passariam as duas pela
--   leitura e inseririam duas linhas — a corrida é real. Com a UNIQUE, a segunda inserção recebe
--   23505, e o código relê a linha que a primeira criou.
--
-- O QUE HAVIA, medido em produção em 22/10/2026
--   - constraints: pkey (id), FK (tenant_id) e FK composta (conversa_id, tenant_id) — NENHUMA
--     unicidade em conversa_id;
--   - índices: pkey e `orcamentista_pre_definicao_conversa_idx` (conversa_id), COMUM;
--   - linhas: 0.
--   O índice comum fica: esta migração não remove nada. Com a UNIQUE ele passa a ser redundante, e
--   tirá-lo é decisão de outra rodada.
--
-- IDEMPOTENTE: roda sem erro com a UNIQUE já criada (procurada pela DEFINIÇÃO — índice único de uma
-- coluna só, conversa_id —, não pelo nome). E SE HOUVER conversa com mais de uma pré-definição, ela
-- ABORTA dizendo quantas, em vez de deixar o ALTER falhar com uma mensagem genérica: escolher qual
-- linha fica é decisão humana, não desta migração.
--
-- COMO APLICAR (`migration-delivery.md`)
--   - pelo conector: tire o BEGIN e o COMMIT e registre o `name` como o nome COMPLETO deste arquivo,
--     sem a extensão: `20261022000002_pre_definicao_uma_por_conversa`. Publique o md5 do arquivo E o
--     do payload, com a transformação nomeada entre eles (`transformacao-quebra-a-cadeia-de-hash.md`);
--   - pelo SQL Editor: como está.
--   - DEPOIS: `NOTIFY pgrst, 'reload schema';`.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_repetidas int;
BEGIN
  SELECT count(*) INTO v_repetidas
  FROM (
    SELECT conversa_id FROM public.orcamentista_pre_definicao GROUP BY conversa_id HAVING count(*) > 1
  ) r;
  IF v_repetidas > 0 THEN
    RAISE EXCEPTION 'orcamentista_pre_definicao: % conversa(s) com mais de uma pre-definicao. Resolva antes de criar a UNIQUE.', v_repetidas;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public'
      AND t.relname = 'orcamentista_pre_definicao'
      AND i.indisunique
      AND i.indnatts = 1
      AND i.indpred IS NULL
      AND a.attname = 'conversa_id'
  ) THEN
    ALTER TABLE public.orcamentista_pre_definicao
      ADD CONSTRAINT orcamentista_pre_definicao_conversa_key UNIQUE (conversa_id);
  END IF;
END
$$;

COMMENT ON TABLE public.orcamentista_pre_definicao IS
  'O que a conversa levantou do pedido: os campos da maquete aprovada, e so eles. UMA por conversa (UNIQUE conversa_id). De LEITURA: nao cria orcamento no sistema maior, e nenhuma rota dela escreve em tabela do sistema maior. Campos nulaveis e sem default: NULL = ainda nao dito. So pela rota, com service_role.';

-- ── VERIFICAÇÃO — aborta se a UNIQUE não ficou ─────────────────────────────────────────────
DO $$
DECLARE
  v_unique int;
BEGIN
  SELECT count(*) INTO v_unique
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
  WHERE n.nspname = 'public' AND t.relname = 'orcamentista_pre_definicao'
    AND i.indisunique AND i.indnatts = 1 AND i.indpred IS NULL AND a.attname = 'conversa_id';
  IF v_unique <> 1 THEN
    RAISE EXCEPTION 'orcamentista_pre_definicao: esperada 1 UNIQUE em conversa_id, ha %.', v_unique;
  END IF;
END
$$;

COMMIT;
