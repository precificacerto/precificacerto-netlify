/** ROTA TEMPORÁRIA DE DIAGNÓSTICO — esqueleto; a implementação vem no commit seguinte. */
import type { NextApiRequest, NextApiResponse } from 'next'

export const config = { api: { bodyParser: false } }
export const PREFIXO_DO_LOG = '[CAPTURA-WUZAPI]'
export const mascarar = (texto: string): string => texto

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(501).end()
}
