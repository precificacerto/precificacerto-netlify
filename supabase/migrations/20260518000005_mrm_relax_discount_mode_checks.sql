-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S1.5/S1.7
-- Relaxa CHECK constraints de discount_mode em budgets, sales (e orders).
--
-- Decisão R2: PROFIT_REDUCTION e SELLER_REDUCTION descontinuados como
-- modo padrão. Toda redução passa pelo motor de reapuração (modo PROPORTIONAL
-- forçado pelo motor V2).
--
-- Estratégia:
--   - MANTEMOS os valores 'PROFIT_REDUCTION' e 'SELLER_REDUCTION' aceitos no
--     CHECK para não quebrar registros legados (engine_version='legacy').
--   - Adicionamos novo valor 'MRM' (reservado para registros V2) — mesmo que
--     o motor sempre rode em modo PROPORTIONAL, fica explícito qual registro
--     passou pelo motor.
--   - Aplicação (UI Sprint 4) BLOQUEIA seleção de PROFIT_REDUCTION/SELLER_REDUCTION
--     ao criar/editar com motor V2 ativo. CHECK no banco fica permissivo
--     para coexistência durante transição.
-- =====================================================================

-- budgets
DO $$ BEGIN
  ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_discount_mode_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.budgets ADD CONSTRAINT budgets_discount_mode_check
    CHECK (discount_mode IN ('PROPORTIONAL','PROFIT_REDUCTION','SELLER_REDUCTION','MRM'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- sales
DO $$ BEGIN
  ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_discount_mode_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_discount_mode_check
    CHECK (discount_mode IN ('PROPORTIONAL','PROFIT_REDUCTION','SELLER_REDUCTION','MRM'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- orders: a coluna existe como TEXT NULL sem CHECK formal — adicionamos por consistência
DO $$ BEGIN
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_discount_mode_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_discount_mode_check
    CHECK (discount_mode IS NULL OR discount_mode IN ('PROPORTIONAL','PROFIT_REDUCTION','SELLER_REDUCTION','MRM'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.budgets.discount_mode IS
  'Modo de aplicação do desconto. MRM = motor de reapuração V2 (R2: novo padrão). PROPORTIONAL = legado 50/50. PROFIT_REDUCTION/SELLER_REDUCTION = legado descontinuado (R2), mantido apenas para compatibilidade com engine_version=legacy.';

COMMENT ON COLUMN public.sales.discount_mode IS
  'Modo de aplicação do desconto. MRM = motor de reapuração V2 (R2: novo padrão). PROPORTIONAL = legado 50/50. PROFIT_REDUCTION/SELLER_REDUCTION = legado descontinuado (R2), mantido apenas para compatibilidade com engine_version=legacy.';

COMMENT ON COLUMN public.orders.discount_mode IS
  'Idem budgets.discount_mode. Aceita NULL para pedidos antigos sem desconto.';
