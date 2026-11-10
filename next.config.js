const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Onda 3 (Founder 2026-05-27): removeConsole em produção. Preserva
  // console.error e console.warn (usados pra security logging: CRÍT-4,
  // CRÍT-5, mrm-divergence-alerts) e remove apenas console.log/info/debug.
  // Reduz bundle ~5-10% + evita vazamento de dados de debug em produção.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
  // A Conectividade I.A. mudou de rota (dono do produto, 11/11/2026): o link salvo da rota antiga não quebra. Temporário (307), e não 308,
  // para nenhum navegador guardar o redirecionamento se a decisão mudar.
  async redirects() {
    return [{ source: '/atendimentos-ia/orcamentista', destination: '/conectividade-ia', permanent: false }]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
