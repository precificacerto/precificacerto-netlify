/**
 * POST /api/atendimentos-ia/orcamentista/qr — o QR Code da instância do ORÇAMENTISTA.
 *
 * A instância é SEPARADA da de envio: na primeira vez o servidor cria uma instância nova no
 * WUZAPI, com um token novo, e o grava em `whatsapp_conexao` (tenant, canal ORCAMENTISTA). NUNCA
 * em `users.wuzapi_token` — o número de envio é por usuário, o do orçamentista é da empresa.
 * Reconectar SUBSTITUI a linha do tenant e canal, com quem pediu o QR em `conectado_por`, e NÃO
 * toca na lista de autorizados.
 *
 * O NÚMERO da instância sai do `jid` da resposta do `/session/connect`, só dígitos, ou NULL —
 * e vai para `whatsapp_conexao.numero`, coluna da migração `20261021000002`: esta rota só funciona
 * depois dela aplicada. O token NUNCA vai na resposta.
 *
 * Cada chamada ao WUZAPI deixa uma linha `[QR-ORCAMENTISTA]` no log, sem token nem QR; e a falha
 * volta com `passo` e uma mensagem que diz QUAL passo falhou (`MENSAGEM_DO_PASSO`).
 * Já existindo conexão gravada para o tenant, o token dela é REUSADO: a instância só é criada
 * quando não há nenhuma.
 *
 * Só quem pode EDITAR Conectividade conecta. Arquitetura:
 * `src/lib/atendimentos-ia/orcamentista-da-empresa.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
  anotarPassoDoQr, chamadorDoOrcamentista, criarInstancia, gravarConexao, lerConexao, marcarConexao, qrDaInstancia,
  sessaoLogada, tokenNovo, type PassoDoQr,
} from '@/lib/atendimentos-ia/orcamentista-da-empresa'

/**
 * O que a tela diz quando um passo falha — em português, sem o nome do servidor, e dizendo QUAL
 * passo. "Tente de novo" sozinho não ajuda ninguém (dono do produto, 21/10/2026).
 */
const PERSISTINDO = 'Tente de novo em instantes; se continuar, avise o suporte.'
export const MENSAGEM_DO_PASSO: Record<Exclude<PassoDoQr, 'instancia'>, string> = {
  'criar-instancia': `Não consegui criar a conexão no servidor de WhatsApp. ${PERSISTINDO}`,
  'session-connect': `A sessão de WhatsApp não abriu no servidor. ${PERSISTINDO}`,
  'session-qr': `O servidor de WhatsApp não devolveu o código para ler. ${PERSISTINDO}`,
}
export const MENSAGEM_SEM_ADMIN = 'Não consegui criar a conexão no servidor de WhatsApp: a configuração do sistema está incompleta. Avise o suporte.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const caller = await chamadorDoOrcamentista(req, res, 'editar')
  if (!caller) return
  const tenantId = caller.tenant_id

  try {
    const conexao = await lerConexao(tenantId)
    let token = conexao?.wuzapi_token ?? null

    if (token && (await sessaoLogada(token)) === true) return res.status(200).json({ conectado: true })

    if (token) {
      anotarPassoDoQr('instancia', 'reaproveitada: já há conexão gravada para este tenant, e o token dela é reusado', [token])
    } else {
      token = tokenNovo()
      anotarPassoDoQr('instancia', 'nenhuma conexão gravada: cria uma instância nova', [token])
      const criada = await criarInstancia(token, tenantId)
      if (!criada.ok) {
        const semAdmin = (criada as { semAdmin: boolean }).semAdmin
        return res.status(502).json({ error: semAdmin ? MENSAGEM_SEM_ADMIN : MENSAGEM_DO_PASSO['criar-instancia'], passo: 'criar-instancia' })
      }
    }
    await gravarConexao(tenantId, { wuzapi_token: token, conectado_por: caller.user_id, ativo: false })

    // O número vem do jid do /session/connect — ou NULL, que também apaga o de uma conexão
    // anterior: o QR novo pode ser lido por outro aparelho. A coluna nasce na `20261021000002`.
    const { qr, numero, connectOk } = await qrDaInstancia(token)
    await marcarConexao(tenantId, { numero })
    if (!qr) {
      const passo = connectOk ? 'session-qr' : 'session-connect'
      return res.status(502).json({ error: MENSAGEM_DO_PASSO[passo], passo })
    }
    return res.status(200).json({ qr })
  } catch (e) {
    console.error('orcamentista qr:', e instanceof Error ? e.message : e)
    return res.status(500).json({ error: 'Não foi possível gerar o QR Code do orçamentista.' })
  }
}
