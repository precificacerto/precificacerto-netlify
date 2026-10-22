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
 * ══ O TOKEN FANTASMA (21/10/2026) ══
 * Medido em produção pelo dono do produto: o token gravado em `whatsapp_conexao` recebia 401 do
 * WUZAPI em `/session/connect` e em `/session/qr` — o servidor não o conhecia. O código só gravava
 * a conexão depois de `POST /admin/users` responder 2xx; então o fantasma nasceu de uma criação que
 * respondeu OK sem a instância passar a existir, ou de uma instância que sumiu depois. Dois
 * consertos:
 *   (1) a conexão só é gravada com a criação CONFIRMADA: depois do 2xx, `GET /session/status` com o
 *       token novo; 401 ali é criação que não pegou — 502 no passo da criação, e NADA é gravado.
 *       Credencial que o servidor não reconhece não fica guardada;
 *   (2) o reuso tem saída: se o WUZAPI responder 401 ao token reusado (no status, no connect ou no
 *       qr), a conexão gravada é DESCARTADA e uma instância nova é criada — UMA vez por clique, sem
 *       laço. Um token RECÉM-CRIADO que dê 401 não recria: vira 502, e o próximo clique tenta de novo.
 *
 * ══ O QR QUE AINDA NÃO EXISTE (22/10/2026) ══
 * Medido em produção: o "fantasma" não existia — o servidor de produção conhecia o token. O que
 * falhava era o `/session/qr` consultado logo depois do connect, com `QRCode` vazio: o QR ainda não
 * tinha sido gerado. Com o connect em 2xx, o `/session/qr` é consultado de novo até o código vir
 * (`ESPERA_DO_QR` na lib, com o que o fonte do WUZAPI diz). As defesas do #114 FICAM.
 * E 500 DEPOIS de 200 é a sessão caindo (medido em 22/10/2026 00:39 UTC): a espera para ali, e a
 * tela diz que a sessão caiu em vez de gastar o teto.
 *
 * ══ O WEBHOOK É APONTADO PELO SISTEMA (22/10/2026) ══
 * Toda linha que esta rota grava nasce com `webhook_segredo` (`segredoNovo`, independente do
 * token); a reusada mantém o que tem, e a gravada antes da migração `20261022000001` ganha um. Com
 * a conexão confirmada — criada e reconhecida, ou reusada e reconhecida, inclusive já logada — o
 * sistema faz `POST /webhook` na instância, com `events: ["Message"]` (sem ele o WUZAPI ZERA a
 * assinatura, medido em produção). Sem 2xx, 502 no passo "webhook": nem QR nem "conectado" saem.
 *
 * ══ SÓ EM PRODUÇÃO (22/10/2026) ══
 * Preview e produção usam o MESMO Supabase e o MESMO WUZAPI: fora de `VERCEL_ENV === 'production'`
 * (ou sem `VERCEL_ENV`, local) a rota recusa com 403 no passo "ambiente", antes de tocar em
 * qualquer coisa (`ambientePermiteApontarWebhook`).
 *
 * Só quem pode EDITAR Conectividade conecta. Arquitetura:
 * `src/lib/atendimentos-ia/orcamentista-da-empresa.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
  ambientePermiteApontarWebhook, anotarPassoDoQr, apontarWebhook, chamadorDoOrcamentista, criarInstancia, descartarConexao, estadoDaSessao, gravarConexao,
  lerConexao, marcarConexao, NAO_AUTORIZADO, qrDaInstancia, segredoNovo, tokenNovo, type PassoDoQr,
} from '@/lib/atendimentos-ia/orcamentista-da-empresa'

/**
 * O que a tela diz quando um passo falha — em português, sem o nome do servidor, e dizendo QUAL
 * passo. "Tente de novo" sozinho não ajuda ninguém (dono do produto, 21/10/2026).
 */
const PERSISTINDO = 'Tente de novo em instantes; se continuar, avise o suporte.'
export const MENSAGEM_DO_PASSO: Record<Exclude<PassoDoQr, 'instancia' | 'session-status'>, string> = {
  'ambiente': 'Conectar o orçamentista só é permitido em produção: este ambiente usa o mesmo servidor de WhatsApp e apontaria a conexão real para cá.',
  'criar-instancia': `Não consegui criar a conexão no servidor de WhatsApp. ${PERSISTINDO}`,
  'webhook': `A conexão NÃO está pronta: o webhook não foi apontado no servidor de WhatsApp, e as mensagens não chegariam ao orçamentista. ${PERSISTINDO}`,
  'session-connect': `A sessão de WhatsApp não abriu no servidor. ${PERSISTINDO}`,
  'session-qr': `O servidor de WhatsApp não devolveu o código para ler. ${PERSISTINDO}`,
}
/**
 * O QR que não veio depois da espera: a mensagem de sempre, mais quantas vezes e por quanto tempo
 * se tentou — "tentei 9 vezes em 12 segundos" diz que não foi falta de paciência.
 */
export function mensagemDoQrQueNaoVeio(tentativas: number, esperaMs: number): string {
  const segundos = Math.round(esperaMs / 1000)
  return `O servidor de WhatsApp não devolveu o código para ler — tentei ${tentativas} ${tentativas === 1 ? 'vez' : 'vezes'} em ${segundos} ${segundos === 1 ? 'segundo' : 'segundos'}. ${PERSISTINDO}`
}

/**
 * A sessão que abriu e CAIU antes de mostrar o código: o /session/qr respondeu 200 e depois 500.
 * Esperar mais não a traz de volta (ver `qrDaInstancia`), então a tela diz o que aconteceu.
 */
export function mensagemDaSessaoQueCaiu(tentativas: number, esperaMs: number): string {
  const segundos = Math.round(esperaMs / 1000)
  return `A sessão de WhatsApp abriu no servidor, mas caiu antes de mostrar o código para ler — tentei ${tentativas} ${tentativas === 1 ? 'vez' : 'vezes'} em ${segundos} ${segundos === 1 ? 'segundo' : 'segundos'}. ${PERSISTINDO}`
}

/**
 * O limite da função na Vercel, DECLARADO aqui em vez de herdado: a espera pelo QR
 * (`ESPERA_DO_QR`, 12 s) precisa caber nele com folga, e o padrão do projeto não está escrito em
 * lugar nenhum do repositório. Portão: o teto da espera é no máximo metade disto.
 */
export const config = { maxDuration: 30 }

export const MENSAGEM_SEM_ADMIN = 'Não consegui criar a conexão no servidor de WhatsApp: a configuração do sistema está incompleta. Avise o suporte.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const caller = await chamadorDoOrcamentista(req, res, 'editar')
  if (!caller) return
  const tenantId = caller.tenant_id

  // Fora de produção (preview, vercel dev), NADA: nem webhook, nem instância criada, nem conexão
  // gravada ou descartada — preview e produção dividem o banco e o servidor de WhatsApp, e
  // "conectado sem webhook apontado" é o estado meio-conectado que esta rota não admite.
  if (!ambientePermiteApontarWebhook()) {
    anotarPassoDoQr('ambiente', `recusado: VERCEL_ENV=${process.env.VERCEL_ENV} — conectar o orçamentista só em produção`, [])
    return res.status(403).json({ error: MENSAGEM_DO_PASSO.ambiente, passo: 'ambiente' })
  }

  try {
    const erroNaCriacao = (semAdmin: boolean) =>
      res.status(502).json({ error: semAdmin ? MENSAGEM_SEM_ADMIN : MENSAGEM_DO_PASSO['criar-instancia'], passo: 'criar-instancia' })

    /**
     * Cria a instância e só GRAVA a conexão quando o WUZAPI reconhece o token novo. A linha nasce
     * com um `webhook_segredo` NOVO, independente do token. Devolve o token e o segredo gravados,
     * ou null — e nesse caso a resposta de erro já foi enviada.
     */
    const criarEGravar = async (): Promise<{ token: string; segredo: string } | null> => {
      const novo = tokenNovo()
      anotarPassoDoQr('instancia', 'cria uma instância nova', [novo])
      const criada = await criarInstancia(novo, tenantId)
      if (!criada.ok) { erroNaCriacao((criada as { semAdmin: boolean }).semAdmin); return null }
      const confirmacao = await estadoDaSessao(novo)
      anotarPassoDoQr('session-status', `confirmação da criação: GET /session/status status=${confirmacao.status ?? 'sem resposta'}`, [novo])
      if (confirmacao.status === NAO_AUTORIZADO) {
        anotarPassoDoQr('criar-instancia', 'o WUZAPI respondeu OK à criação, mas NÃO reconhece o token novo (401): nada foi gravado', [novo])
        erroNaCriacao(false)
        return null
      }
      const segredo = segredoNovo()
      await gravarConexao(tenantId, { wuzapi_token: novo, webhook_segredo: segredo, conectado_por: caller.user_id, ativo: false })
      return { token: novo, segredo }
    }

    /**
     * Aponta o webhook da instância para a rota de entrada. Sem 2xx, a conexão NÃO é dada como
     * pronta: 502 no passo "webhook", e nem QR nem "conectado" saem. Devolve se apontou.
     */
    const webhookApontado = async (tokenDaInstancia: string, segredo: string): Promise<boolean> => {
      if (await apontarWebhook(tokenDaInstancia, segredo)) return true
      res.status(502).json({ error: MENSAGEM_DO_PASSO.webhook, passo: 'webhook' })
      return false
    }

    const descartarFantasma = async (fantasma: string, onde: string) => {
      anotarPassoDoQr('instancia', `fantasma: o WUZAPI respondeu 401 ao token gravado (${onde}); a conexão gravada foi descartada e uma instância nova será criada`, [fantasma])
      await descartarConexao(tenantId, fantasma)
    }

    const conexao = await lerConexao(tenantId)
    let token = conexao?.wuzapi_token ?? null
    // A conexão reusada MANTÉM o segredo que tem — girá-lo a cada clique invalidaria a URL já
    // apontada. Só a linha gravada antes da migração `20261022000001`, sem segredo, ganha um aqui.
    let segredo = conexao?.webhook_segredo ?? segredoNovo()
    let reusado = false

    if (token) {
      const estado = await estadoDaSessao(token)
      anotarPassoDoQr('session-status', `GET /session/status status=${estado.status ?? 'sem resposta'} logada=${estado.logada}`, [token])
      if (estado.logada === true) {
        if (conexao?.webhook_segredo == null) {
          await gravarConexao(tenantId, { wuzapi_token: token, webhook_segredo: segredo, conectado_por: conexao?.conectado_por ?? caller.user_id, ativo: conexao?.ativo ?? false })
        }
        // "conectado" só sai com o webhook apontado: sem ele as mensagens não chegam.
        if (!(await webhookApontado(token, segredo))) return
        return res.status(200).json({ conectado: true })
      }
      if (estado.status === NAO_AUTORIZADO) {
        await descartarFantasma(token, 'session-status')
        token = null
      } else {
        anotarPassoDoQr('instancia', 'reaproveitada: já há conexão gravada para este tenant, e o token dela é reusado', [token])
        reusado = true
        await gravarConexao(tenantId, { wuzapi_token: token, webhook_segredo: segredo, conectado_por: caller.user_id, ativo: false })
      }
    }

    if (!token) {
      const criada = await criarEGravar()
      if (!criada) return
      token = criada.token
      segredo = criada.segredo
    }

    // O ponto em que a conexão está confirmada — criada e reconhecida, ou reusada e reconhecida: o
    // sistema aponta o webhook da instância, ANTES de abrir a sessão.
    if (!(await webhookApontado(token, segredo))) return

    let resultado = await qrDaInstancia(token)
    // O reuso tem saída, UMA vez: o token reusado deu 401 no connect ou no qr. Um token recém-criado
    // (reusado = false) nunca entra aqui — não há laço.
    if (reusado && resultado.naoAutorizado) {
      await descartarFantasma(token, 'session-connect/session-qr')
      const recriada = await criarEGravar()
      if (!recriada) return
      token = recriada.token
      segredo = recriada.segredo
      if (!(await webhookApontado(token, segredo))) return
      resultado = await qrDaInstancia(token)
    }

    // O número vem do jid do /session/connect — ou NULL, que também apaga o de uma conexão
    // anterior: o QR novo pode ser lido por outro aparelho. A coluna nasce na `20261021000002`.
    const { qr, numero, connectOk, tentativas, esperaMs, sessaoCaiu } = resultado
    await marcarConexao(tenantId, { numero })
    if (!qr) {
      if (!connectOk) return res.status(502).json({ error: MENSAGEM_DO_PASSO['session-connect'], passo: 'session-connect' })
      const error = sessaoCaiu ? mensagemDaSessaoQueCaiu(tentativas, esperaMs) : mensagemDoQrQueNaoVeio(tentativas, esperaMs)
      return res.status(502).json({ error, passo: 'session-qr' })
    }
    return res.status(200).json({ qr })
  } catch (e) {
    console.error('orcamentista qr:', e instanceof Error ? e.message : e)
    return res.status(500).json({ error: 'Não foi possível gerar o QR Code do orçamentista.' })
  }
}
