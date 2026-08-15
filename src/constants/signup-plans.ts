/**
 * Planos do NOVO fluxo de cadastro (Escopo: fluxo de entrada do novo usuário, 13/08/2026).
 *
 * Diferença central em relação a `@/constants/plans`:
 *   - A segmentação por faturamento (ate_200k / acima_200k) foi DESCARTADA.
 *   - Existe UMA tabela única de 4 planos, selecionada pela QUANTIDADE de usuários
 *     escolhida na Etapa 2 do cadastro (1 a 30). Cada faixa mapeia para um price_id.
 *
 * Os `slug` reaproveitam os 4 valores já existentes em `tenants.plan_slug`
 * (individual / intermediario / pro / advanced) para não quebrar nada que já
 * consulta essa coluna — apenas os nomes de exibição mudam (Individual / Time /
 * Equipe / Empresa).
 *
 * price_id: os valores abaixo são de PRODUÇÃO (live) e todos já têm
 * `trial_period_days = 7` configurado no Stripe. Para validar em Preview sem
 * cobrar cartão real, sobrescreva por env (STRIPE_PRICE_SIGNUP_*) com IDs de teste.
 */

import type { PlanSlug } from '@/constants/plans'

export interface SignupPlan {
  /** Reaproveita o enum de slug já gravado em tenants.plan_slug. */
  slug: PlanSlug
  /** Nome de exibição do novo fluxo. */
  name: string
  /** Preço mensal (R$) após o trial — apenas para exibição. */
  price: number
  /** Menor quantidade de usuários que cai nesta faixa (inclusive). */
  minUsers: number
  /** Maior quantidade de usuários que cai nesta faixa (inclusive). */
  maxUsers: number
  /** price_id de fallback (produção). Pode ser sobrescrito por env. */
  fallbackPriceId: string
  /** Nome da env var que sobrescreve o price_id (IDs de teste em Preview). */
  priceEnvKey: string
}

/** Limites do contador da Etapa 2. */
export const MIN_SIGNUP_USERS = 1
export const MAX_SIGNUP_USERS = 30

/**
 * Tabela única por faixa de usuários. Faixas contíguas cobrindo 1..30 sem buracos:
 *   1      -> Individual
 *   2..3   -> Time
 *   4..5   -> Equipe
 *   6..30  -> Empresa
 */
export const SIGNUP_PLANS: SignupPlan[] = [
  {
    slug: 'individual',
    name: 'Individual',
    price: 99.9,
    minUsers: 1,
    maxUsers: 1,
    fallbackPriceId: 'price_1TYZYcC91Syy1O80XCdZdF3h',
    priceEnvKey: 'STRIPE_PRICE_SIGNUP_INDIVIDUAL',
  },
  {
    slug: 'intermediario',
    name: 'Time',
    price: 239.9,
    minUsers: 2,
    maxUsers: 3,
    fallbackPriceId: 'price_1TYZYcC91Syy1O80JFpqEcsg',
    priceEnvKey: 'STRIPE_PRICE_SIGNUP_TIME',
  },
  {
    slug: 'pro',
    name: 'Equipe',
    price: 299.9,
    minUsers: 4,
    maxUsers: 5,
    fallbackPriceId: 'price_1TYZYdC91Syy1O80yaiVO8PQ',
    priceEnvKey: 'STRIPE_PRICE_SIGNUP_EQUIPE',
  },
  {
    slug: 'advanced',
    name: 'Empresa',
    price: 349.9,
    minUsers: 6,
    maxUsers: 30,
    fallbackPriceId: 'price_1TYZYdC91Syy1O80pWnr70WP',
    priceEnvKey: 'STRIPE_PRICE_SIGNUP_EMPRESA',
  },
]

/** Normaliza a quantidade de usuários para o intervalo permitido [1, 30]. */
export function clampSignupUsers(qtd: number): number {
  if (!Number.isFinite(qtd)) return MIN_SIGNUP_USERS
  const n = Math.trunc(qtd)
  if (n < MIN_SIGNUP_USERS) return MIN_SIGNUP_USERS
  if (n > MAX_SIGNUP_USERS) return MAX_SIGNUP_USERS
  return n
}

/**
 * Plano derivado da quantidade de usuários. Sempre retorna um plano válido:
 * a quantidade é normalizada para [1, 30] antes da busca, e a última faixa
 * cobre até 30 — nunca retorna undefined.
 */
export function getSignupPlanByUsers(qtd: number): SignupPlan {
  const n = clampSignupUsers(qtd)
  const found = SIGNUP_PLANS.find((p) => n >= p.minUsers && n <= p.maxUsers)
  // Fallback defensivo (não deveria ocorrer com faixas contíguas cobrindo 1..30).
  return found ?? SIGNUP_PLANS[SIGNUP_PLANS.length - 1]
}

/**
 * price_id efetivo do plano: env (Preview/teste) com fallback no ID de produção.
 * Server-only na prática — chame a partir de rotas de API, não do client.
 */
export function getSignupPriceId(plan: SignupPlan): string {
  const fromEnv = process.env[plan.priceEnvKey]
  const id = fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : plan.fallbackPriceId
  return id
}

/** Rótulo curto da faixa para exibição (ex.: "1 usuário", "2–3 usuários", "6–30 usuários"). */
export function signupPlanRangeLabel(plan: SignupPlan): string {
  if (plan.minUsers === plan.maxUsers) {
    return `${plan.minUsers} usuário${plan.minUsers > 1 ? 's' : ''}`
  }
  return `${plan.minUsers}–${plan.maxUsers} usuários`
}
