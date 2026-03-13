/**
 * Planos de assinatura por faixa de faturamento.
 * O cadastro público nunca cria super_admin: usuário informa faturamento → escolhe plano → paga → é criado como admin de uma tenant.
 */

export type RevenueTier = 'ate_200k' | 'acima_200k'

export type PlanSlug =
  | 'individual'
  | 'intermediario'
  | 'ilimitado'
  | 'pro'
  | 'advanced'

export interface PlanOption {
  slug: PlanSlug
  name: string
  price: number
  description: string
  maxUsers: number | null
  features: string[]
}

export const PLANS_ATE_200K: PlanOption[] = [
  {
    slug: 'individual',
    name: 'Individual',
    price: 69.9,
    description: '1 usuário • Ideal para quem está começando',
    maxUsers: 1,
    features: [
      '1 usuário',
      'Controle de preços de venda e margens',
      'Cadastro de produtos, clientes e fornecedores',
      'Gestão básica de estoque e do caixa do dia a dia',
      'Relatórios simples de vendas e lucratividade por produto',
    ],
  },
  {
    slug: 'intermediario',
    name: 'Intermediário',
    price: 99.9,
    description: 'Até 5 usuários • Para pequenos times',
    maxUsers: 5,
    features: [
      'Até 5 usuários',
      'Tudo do plano Individual',
      'Multiusuário com permissões por função (caixa, gestor, etc.)',
      'Agenda e lembretes para orçamentos e serviços',
      'Relatórios avançados de vendas, caixa e recebimentos',
      'Suporte prioritário em horário comercial',
    ],
  },
  {
    slug: 'ilimitado',
    name: 'Ilimitado',
    price: 149.9,
    description: 'Usuários ilimitados • Para equipes em crescimento',
    maxUsers: null,
    features: [
      'Usuários ilimitados',
      'Tudo do plano Intermediário',
      'Controle detalhado de permissões por usuário',
      'Centros de custo e categorias de despesas mais detalhadas',
      'Relatórios gerenciais completos (produtos, áreas, equipes)',
      'Exportação de dados para contabilidade e planilhas',
    ],
  },
]

export const PLANS_ACIMA_200K: PlanOption[] = [
  {
    slug: 'pro',
    name: 'Pro',
    price: 299.9,
    description: 'Até 5 usuários • Para operações em crescimento',
    maxUsers: 5,
    features: [
      'Até 5 usuários',
      'Tudo do plano Ilimitado (até 200k)',
      'Gestão avançada de estoque com movimentações detalhadas',
      'Simulações tributárias (Simples, Lucro Presumido, Lucro Real)',
      'Metas de faturamento e margem por período',
      'Suporte prioritário com onboarding assistido',
    ],
  },
  {
    slug: 'advanced',
    name: 'Advanced',
    price: 399.9,
    description: 'Até 10 usuários • Para equipes comerciais maiores',
    maxUsers: 10,
    features: [
      'Até 10 usuários',
      'Tudo do plano Pro',
      'Dashboards avançados para acompanhamento diário de resultados',
      'Múltiplos caixas e pontos de venda',
      'Controle de equipes e comissionamento por vendedor',
      'Relatórios consolidados por loja/unidade',
    ],
  },
  {
    slug: 'ilimitado',
    name: 'Ilimitado',
    price: 499.9,
    description: 'Usuários ilimitados • Para grandes operações',
    maxUsers: null,
    features: [
      'Usuários ilimitados e times ilimitados',
      'Tudo do plano Advanced',
      'Acompanhamento detalhado de centros de lucro e unidades de negócio',
      'Suporte dedicado para implantação e treinamento da equipe',
      'Prioridade no roadmap e novas funcionalidades',
    ],
  },
]

export function getPlansByTier(tier: RevenueTier): PlanOption[] {
  return tier === 'ate_200k' ? PLANS_ATE_200K : PLANS_ACIMA_200K
}

export function getPlanBySlug(slug: PlanSlug, tier: RevenueTier): PlanOption | undefined {
  return getPlansByTier(tier).find((p) => p.slug === slug)
}

export function getUserLimitForPlan(slug: PlanSlug, tier: RevenueTier): number | null {
  return getPlanBySlug(slug, tier)?.maxUsers ?? null
}

export function getUpgradeOptions(currentSlug: PlanSlug, tier: RevenueTier): PlanOption[] {
  const plans = getPlansByTier(tier)
  const currentIndex = plans.findIndex((p) => p.slug === currentSlug)
  if (currentIndex < 0) return plans
  return plans.slice(currentIndex + 1)
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}
