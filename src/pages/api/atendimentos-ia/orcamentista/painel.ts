import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(501).json({ error: 'ainda não implementada' })
}
