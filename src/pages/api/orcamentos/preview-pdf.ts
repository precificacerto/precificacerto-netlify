import type { NextApiRequest, NextApiResponse } from 'next'
import { createBudgetPdf } from '@/lib/create-budget-pdf'

/**
 * GET /api/orcamentos/preview-pdf
 * Gera um PDF de exemplo do orçamento para visualizar o layout.
 * Não requer autenticação (apenas para preview em desenvolvimento).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const mockData = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    expiration_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    total_value: 3850.5,
    notes: null as string | null,
    customer: { name: 'João da Silva Ltda' },
    employee: { name: 'Maria Vendedora' },
    company_name: 'Minha Empresa Ltda',
    company_cnpj: '12.345.678/0001-90',
    items: [
      {
        quantity: 2,
        unit_price: 450,
        discount: 0,
        products: { name: 'Produto Alpha — Unidade', code: 'PA-001' },
      },
      {
        quantity: 5,
        unit_price: 120.5,
        discount: 30.25,
        products: { name: 'Produto Beta — Caixa', code: 'PB-002' },
      },
      {
        quantity: 1,
        unit_price: 890,
        discount: 89,
        products: { name: 'Produto Gama — Kit especial', code: 'PG-003' },
      },
    ],
  }

  const buffer = createBudgetPdf(mockData)
  const code = `ORC-${mockData.id.substring(0, 4).toUpperCase()}`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="orcamento-${code}.pdf"`)
  res.send(Buffer.from(buffer))
}
