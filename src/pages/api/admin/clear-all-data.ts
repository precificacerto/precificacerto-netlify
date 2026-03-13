import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(403).json({
    error: 'Operação desabilitada. Dados não podem ser excluídos permanentemente.',
  })
}
