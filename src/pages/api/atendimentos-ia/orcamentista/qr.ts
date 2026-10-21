/**
 * POST /api/atendimentos-ia/orcamentista/qr — o QR Code da instância do ORÇAMENTISTA.
 *
 * A instância é SEPARADA da de envio: na primeira vez o servidor cria uma instância nova no
 * WUZAPI, com um token novo, e o grava em `whatsapp_conexao` (tenant, canal ORCAMENTISTA). NUNCA
 * em `users.wuzapi_token` — o número de envio é por usuário, o do orçamentista é da empresa.
 * Reconectar SUBSTITUI a linha do tenant e canal, com quem pediu o QR em `conectado_por`, e NÃO
 * toca na lista de autorizados.
 *
 * Só quem pode EDITAR Conectividade conecta. Arquitetura:
 * `src/lib/atendimentos-ia/orcamentista-da-empresa.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
  chamadorDoOrcamentista, criarInstancia, gravarConexao, lerConexao, qrDaInstancia, sessaoLogada, tokenNovo,
} from '@/lib/atendimentos-ia/orcamentista-da-empresa'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const caller = await chamadorDoOrcamentista(req, res, 'editar')
  if (!caller) return
  const tenantId = caller.tenant_id

  try {
    const conexao = await lerConexao(tenantId)
    let token = conexao?.wuzapi_token ?? null

    if (token && (await sessaoLogada(token)) === true) return res.status(200).json({ conectado: true })

    if (!token) {
      token = tokenNovo()
      if (!(await criarInstancia(token, tenantId))) {
        return res.status(502).json({ error: 'Não foi possível criar a instância do orçamentista no WUZAPI.' })
      }
    }
    await gravarConexao(tenantId, { wuzapi_token: token, conectado_por: caller.user_id, ativo: false })

    const qr = await qrDaInstancia(token)
    if (!qr) return res.status(502).json({ error: 'O WUZAPI não devolveu o QR Code. Tente de novo.' })
    return res.status(200).json({ qr })
  } catch (e) {
    console.error('orcamentista qr:', e instanceof Error ? e.message : e)
    return res.status(500).json({ error: 'Não foi possível gerar o QR Code do orçamentista.' })
  }
}
