-- ============================================================================
-- Análise de Tenants Candidatos a Beta V17 (EPIC-MRM-V17 Onda 2)
-- ============================================================================
--
-- Como usar:
--   1. Abra o Supabase Dashboard → SQL Editor
--   2. Cole e execute esta query inteira (read-only, NÃO altera nada)
--   3. O resultado classifica todos os tenants ativos em 3 perfis
--   4. Use o relatório para escolher 2-3 tenants beta (1 por perfil ideal)
--
-- Perfis identificados:
--   - SIMPLE                       : 1-3 produtos, desconto médio < 5%
--   - MULTI_PRODUCT_HETEROGENEOUS  : >5 produtos, alta variância de preço
--   - AGGRESSIVE_DISCOUNT          : desconto médio > 10% nos últimos 30 dias
--
-- Critérios de exclusão:
--   - Tenants criados há < 7 dias (insuficiente histórico)
--   - Tenants sem orçamento nos últimos 30 dias (inativos)
--   - Tenants com plan_status = 'CANCELLED'
-- ============================================================================

WITH tenant_metrics AS (
  SELECT
    t.id                                                        AS tenant_id,
    t.name                                                      AS tenant_name,
    t.plan_status,
    t.created_at,
    EXTRACT(DAY FROM NOW() - t.created_at)::INT                 AS days_since_signup,
    -- Total de produtos cadastrados
    (SELECT COUNT(*) FROM products p
       WHERE p.tenant_id = t.id
         AND COALESCE(p.is_active, true) = true)                AS total_products,
    -- Variância de preço entre produtos (heterogeneidade)
    (SELECT COALESCE(STDDEV(p.sale_price), 0) FROM products p
       WHERE p.tenant_id = t.id
         AND COALESCE(p.is_active, true) = true
         AND p.sale_price > 0)                                  AS price_stddev,
    -- Preço médio dos produtos
    (SELECT COALESCE(AVG(p.sale_price), 0) FROM products p
       WHERE p.tenant_id = t.id
         AND COALESCE(p.is_active, true) = true
         AND p.sale_price > 0)                                  AS price_avg,
    -- Volume de orçamentos nos últimos 30 dias
    (SELECT COUNT(*) FROM budgets b
       WHERE b.tenant_id = t.id
         AND b.created_at > NOW() - INTERVAL '30 days')         AS budgets_last_30d,
    -- Desconto médio aplicado em orçamentos dos últimos 30 dias
    (SELECT COALESCE(AVG(b.global_discount_percent), 0) FROM budgets b
       WHERE b.tenant_id = t.id
         AND b.created_at > NOW() - INTERVAL '30 days'
         AND b.global_discount_percent > 0)                     AS avg_discount_pct,
    -- % de orçamentos COM desconto (taxa de uso de desconto)
    (SELECT
       CASE WHEN COUNT(*) = 0 THEN 0
            ELSE 100.0 * COUNT(*) FILTER (WHERE b.global_discount_percent > 0) / COUNT(*)
       END
     FROM budgets b
     WHERE b.tenant_id = t.id
       AND b.created_at > NOW() - INTERVAL '30 days')           AS pct_budgets_with_discount,
    -- Valor total movimentado últimos 30 dias (volume financeiro)
    (SELECT COALESCE(SUM(b.total_value), 0) FROM budgets b
       WHERE b.tenant_id = t.id
         AND b.created_at > NOW() - INTERVAL '30 days')         AS revenue_last_30d
  FROM tenants t
  WHERE t.plan_status IN ('TRIAL', 'ACTIVE', 'APPROVED')
    AND t.created_at < NOW() - INTERVAL '7 days'
),
tenant_classified AS (
  SELECT
    *,
    -- Coeficiente de variação (CV) = stddev / mean — mede heterogeneidade relativa
    CASE WHEN price_avg > 0 THEN price_stddev / price_avg ELSE 0 END AS price_cv,
    -- Classificação automática por perfil
    CASE
      WHEN total_products BETWEEN 1 AND 3
       AND avg_discount_pct < 5
       AND budgets_last_30d > 0
        THEN 'SIMPLE'
      WHEN total_products > 5
       AND (price_stddev / NULLIF(price_avg, 0)) > 0.5  -- CV > 50%
       AND budgets_last_30d > 0
        THEN 'MULTI_PRODUCT_HETEROGENEOUS'
      WHEN avg_discount_pct >= 10
       AND budgets_last_30d > 0
        THEN 'AGGRESSIVE_DISCOUNT'
      WHEN budgets_last_30d > 0
        THEN 'OTHER_ACTIVE'
      ELSE 'INACTIVE'
    END AS profile_classification,
    -- Score de adequação (0-100): mais alto = melhor candidato
    CASE
      WHEN total_products BETWEEN 1 AND 3 AND avg_discount_pct < 5
        THEN 100 - (total_products * 10) - (avg_discount_pct * 2)
      WHEN total_products > 5 AND (price_stddev / NULLIF(price_avg, 0)) > 0.5
        THEN LEAST(100, 50 + total_products + ((price_stddev / NULLIF(price_avg, 1)) * 50)::INT)
      WHEN avg_discount_pct >= 10
        THEN LEAST(100, 50 + avg_discount_pct * 2)
      ELSE 0
    END AS suitability_score
  FROM tenant_metrics
  WHERE budgets_last_30d > 0  -- só tenants ativos
)
SELECT
  profile_classification          AS perfil,
  tenant_id,
  tenant_name,
  plan_status,
  days_since_signup               AS dias_uso,
  total_products                  AS produtos,
  ROUND(price_avg, 2)             AS preco_medio_rs,
  ROUND(price_cv * 100, 1)        AS variancia_preco_pct,
  budgets_last_30d                AS orcamentos_30d,
  ROUND(avg_discount_pct, 2)      AS desconto_medio_pct,
  ROUND(pct_budgets_with_discount, 1) AS pct_orc_com_desc,
  ROUND(revenue_last_30d, 2)      AS faturamento_30d_rs,
  suitability_score               AS score_adequacao
FROM tenant_classified
WHERE profile_classification IN (
  'SIMPLE',
  'MULTI_PRODUCT_HETEROGENEOUS',
  'AGGRESSIVE_DISCOUNT'
)
ORDER BY
  -- Ordena por perfil + score (top de cada perfil aparece primeiro)
  CASE profile_classification
    WHEN 'SIMPLE' THEN 1
    WHEN 'MULTI_PRODUCT_HETEROGENEOUS' THEN 2
    WHEN 'AGGRESSIVE_DISCOUNT' THEN 3
    ELSE 4
  END,
  suitability_score DESC NULLS LAST
LIMIT 30;

-- ============================================================================
-- INTERPRETAÇÃO DO RESULTADO
-- ============================================================================
--
-- Você verá uma tabela com até 30 linhas. Para cada perfil, escolha o tenant
-- com MAIOR `score_adequacao` que VOCÊ se sinta confortável contatando.
--
-- Critérios humanos adicionais (não automatizáveis):
--   - É alguém que vai responder seu WhatsApp/email?
--   - Tem histórico de feedback construtivo?
--   - Aceitaria testar feature beta com você acompanhando próximo?
--
-- Após escolher os 3:
--   1. Anote os tenant_id no memory project_epic_mrm_v17_policies_absorption.md
--   2. Configure `tenants.motor_version = 'V17'` (após Onda 2 deploiada) para
--      esses 3 tenants apenas (resto continua com 'V16')
--   3. Monitore o shadow mode comparando V16↔V17 por 2 semanas
--
-- Se NENHUM tenant aparecer em algum perfil:
--   - Significa que sua base ainda não tem clientes com esse comportamento
--   - Opções: (a) aguardar base crescer, (b) usar dados sintéticos no dev,
--             (c) lançar V17 direto com validação interna pesada
--
-- ============================================================================
-- QUERY COMPLEMENTAR — visão geral dos perfis na base (executar separado)
-- ============================================================================
--
-- SELECT
--   profile_classification AS perfil,
--   COUNT(*) AS qtd_tenants,
--   ROUND(AVG(suitability_score), 1) AS score_medio,
--   ROUND(AVG(revenue_last_30d), 2) AS faturamento_medio_30d
-- FROM tenant_classified
-- GROUP BY profile_classification
-- ORDER BY qtd_tenants DESC;
