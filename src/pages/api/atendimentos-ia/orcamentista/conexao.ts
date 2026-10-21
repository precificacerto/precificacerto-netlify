/**
 * GET    /api/atendimentos-ia/orcamentista/conexao — o estado da conexão do orçamentista do tenant.
 * DELETE /api/atendimentos-ia/orcamentista/conexao — desconectar.
 *
 * O tenant é o do usuário logado; a seção desligada responde 404 (`chamadorDoOrcamentista`).
 * Desconectar é livre para quem ENXERGA a tela (dono do produto, 21/10/2026) e NÃO toca na lista
 * de autorizados. Se o WUZAPI não confirmar o logout, nada muda no banco: dizer "desconectado"
 * com a instância ainda recebendo mensagem seria mentir sobre o estado.
 *
 * O NÚMERO conectado não é devolvido: o `GET /session/status` do WUZAPI não o informa
 * (documentação lida em 21/10/2026), e `whatsapp_conexao` não tem coluna para ele. A resposta diz
 * isso em `motivoSemNumero`, em vez de inventar.
 *
 * Arquitetura: `src/lib/atendimentos-ia/orcamentista-da-empresa.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
  chamadorDoOrcamentista, lerConexao, marcarConexao, nomeDoUsuario, sairDaInstancia, sessaoLogada,
} from '@/lib/atendimentos-ia/orcamentista-da-empresa'

export const MOTIVO_SEM_NUMERO = 'O WUZAPI não informa o número na consulta da sessão.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })
  const caller = await chamadorDoOrcamentista(req, res, 'ver')
  if (!caller) return
  const tenantId = caller.tenant_id

  try {
    const conexao = await lerConexao(tenantId)

    if (req.method === 'DELETE') {
      if (!conexao) return res.status(200).json({ ok: true })
      const saiu = await sairDaInstancia(conexao.wuzapi_token)
      if (!saiu) return res.status(502).json({ error: 'O WUZAPI não confirmou a desconexão. Nada foi alterado; tente de novo.' })
      await marcarConexao(tenantId, { ativo: false })
      return res.status(200).json({ ok: true })
    }

    if (!conexao) return res.status(200).json({ estado: 'desconectado', conectadoPor: null, conectadoEm: null, numero: null, motivoSemNumero: null })

    const logada = await sessaoLogada(conexao.wuzapi_token)
    if (logada === true && !conexao.ativo) await marcarConexao(tenantId, { ativo: true, conectado_em: new Date().toISOString() })
    if (logada === false && conexao.ativo) await marcarConexao(tenantId, { ativo: false })
    const conectado = logada === null ? conexao.ativo : logada
    return res.status(200).json({
      estado: conectado ? 'conectado' : 'desconectado',
      ...(logada === null ? { aviso: 'O WUZAPI não respondeu; o estado é o último registrado.' } : {}),
      conectadoPor: conexao.conectado_por ? await nomeDoUsuario(conexao.conectado_por, tenantId) : null,
      conectadoEm: conexao.conectado_em,
      numero: null,
      motivoSemNumero: conectado ? MOTIVO_SEM_NUMERO : null,
    })
  } catch (e) {
    console.error('orcamentista conexao:', e instanceof Error ? e.message : e)
    return res.status(500).json({ error: 'Não foi possível ler a conexão do orçamentista.' })
  }
}
