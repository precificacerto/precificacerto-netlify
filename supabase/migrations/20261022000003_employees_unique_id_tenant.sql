-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261022000003 — employees: UNIQUE (id, tenant_id), para uma FK COMPOSTA poder apontar aqui
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- POR QUE ESTE ARQUIVO É SÓ ISTO
--   `employees` é tabela do SISTEMA DO CLIENTE, não do Atendimentos I.A. Uma mudança nela não fica
--   escondida dentro de uma migração de cinco tabelas: tem arquivo, md5 e linha de ledger próprios,
--   para que quem procurar "quem mexeu em employees" a encontre (dono do produto, 22/10/2026).
--
-- O QUE FAZ
--   Cria `employees_id_tenant_id_key UNIQUE (id, tenant_id)`. O `id` já é único (pkey), então a
--   UNIQUE não restringe nada novo: ela existe para que `orcamentista_vendedor_perfil` referencie
--   `employees (id, tenant_id)` com FK COMPOSTA — e um funcionário de uma empresa NUNCA fique
--   atrelado ao perfil de outra. Com FK simples em `id`, o tenant do perfil e o do funcionário
--   poderiam divergir sem o banco acusar.
--
-- O QUE HAVIA, medido em produção em 22/10/2026
--   - constraints de unicidade: `employees_pkey PRIMARY KEY (id)` e `employees_user_id_key UNIQUE
--     (user_id)` — NENHUMA em (id, tenant_id);
--   - `employees.tenant_id`: uuid NOT NULL;
--   - 16 linhas, nenhuma com tenant nulo. O índice novo é trivial; o ALTER pega um lock exclusivo
--     curto em `employees`.
--
-- ORDEM: aplicar ANTES de `20261022000004_atendimentos_ia_base_de_conhecimento`, que aborta se
-- esta UNIQUE não existir.
--
-- IDEMPOTENTE: a UNIQUE é procurada pela DEFINIÇÃO — índice único, sem predicado, exatamente sobre
-- as colunas {id, tenant_id} —, não pelo nome. Rodar de novo não cria uma segunda.
--
-- COMO APLICAR (`migration-delivery.md`)
--   - pelo conector: tire o BEGIN e o COMMIT e registre o `name` como o nome COMPLETO deste arquivo,
--     sem a extensão: `20261022000003_employees_unique_id_tenant`. Publique o md5 do arquivo E o do
--     payload, com a transformação nomeada entre eles (`transformacao-quebra-a-cadeia-de-hash.md`);
--   - pelo SQL Editor: como está.
--   - DEPOIS: `NOTIFY pgrst, 'reload schema';`.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    WHERE t.oid = 'public.employees'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indnkeyatts = 2
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_attribute a
            WHERE a.attrelid = t.oid AND a.attnum = ANY (i.indkey::int2[]))
          = ARRAY['id', 'tenant_id']
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_id_tenant_id_key UNIQUE (id, tenant_id);
  END IF;
END
$$;

-- ── VERIFICAÇÃO — aborta se a UNIQUE não ficou ─────────────────────────────────────────────
DO $$
DECLARE
  v_unique int;
BEGIN
  SELECT count(*) INTO v_unique
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  WHERE t.oid = 'public.employees'::regclass
    AND i.indisunique
    AND i.indpred IS NULL
    AND i.indnkeyatts = 2
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM pg_attribute a
          WHERE a.attrelid = t.oid AND a.attnum = ANY (i.indkey::int2[]))
        = ARRAY['id', 'tenant_id'];
  IF v_unique <> 1 THEN
    RAISE EXCEPTION 'employees: esperada 1 UNIQUE em (id, tenant_id), ha %.', v_unique;
  END IF;
END
$$;

COMMIT;
