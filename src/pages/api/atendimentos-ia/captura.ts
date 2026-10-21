/**
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * ROTA TEMPORÁRIA DE DIAGNÓSTICO — criada em 21/10/2026 para descobrir o formato do webhook do
 * WUZAPI. PARA SER REMOVIDA assim que a captura acontecer, junto com o portão dela
 * (`src/utils/__tests__/atendimentos-ia-captura-do-webhook.test.ts`).
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/atendimentos-ia/captura?s=<segredo>
 *
 * O que ela faz: recebe o webhook, e anota UMA linha no log da Vercel, com o prefixo
 * `[CAPTURA-WUZAPI]`: o content-type, o tamanho real do corpo em bytes, e o corpo (os primeiros
 * 8 KB), MASCARADO. E só. NÃO grava no banco, NÃO responde ao WhatsApp, NÃO escreve em lugar
 * nenhum além do log.
 *
 * A ORDEM, e as duas travas vêm ANTES de tocar no corpo:
 *   1. só POST — outro método: 405;
 *   2. só em produção (`VERCEL_ENV === 'production'`) — senão 503 com o motivo. Preview escreve no
 *      banco de produção e não entra aqui; e a variável do segredo só existe em Production;
 *   3. o segredo da query (`?s=`) contra `ORCAMENTISTA_WEBHOOK_SEGREDO`, em TEMPO CONSTANTE. Os
 *      dois lados passam por SHA-256 antes do `timingSafeEqual`, para terem o mesmo tamanho sem
 *      que a comparação revele o tamanho do segredo. Diferente, ausente, ou variável não
 *      configurada: 401, e NADA é anotado — nem o corpo, nem o IP.
 * Passando as três: lê o corpo cru e responde SEMPRE 200 com corpo vazio, mesmo se a leitura
 * falhar — o WUZAPI reenvia o webhook que não recebe 200, e não queremos laço.
 *
 * O MASCARAMENTO, antes de anotar:
 *   - toda sequência de 8 ou mais dígitos vira os 4 primeiros + 'x' + os 2 últimos, com o mesmo
 *     comprimento. Os nomes dos campos e a estrutura ficam visíveis; o telefone, não;
 *   - o valor do campo `token` também sai: o WUZAPI manda o token da INSTÂNCIA no corpo, nos dois
 *     formatos (`token=` no form, `"token":` no json), e ele é credencial. O nome do campo fica.
 *
 * LIMITE, dito em voz alta: o TEXTO das mensagens que chegarem nesta janela vai para o log da
 * Vercel, de quem quer que escreva para a instância apontada — só os dígitos e o token são
 * mascarados. A janela de captura deve ser curta, e com mensagem de teste.
 */
import { createHash, timingSafeEqual } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'

/** O corpo é lido CRU: o parser do Next não pode transformá-lo antes da captura. */
export const config = { api: { bodyParser: false } }

export const PREFIXO_DO_LOG = '[CAPTURA-WUZAPI]'
const LIMITE_DO_CORPO = 8 * 1024

/** 8+ dígitos → 4 primeiros + 'x' + 2 últimos, mesmo comprimento. */
export function mascarar(texto: string): string {
  return texto
    .replace(/\d{8,}/g, (m) => m.slice(0, 4) + 'x'.repeat(m.length - 6) + m.slice(-2))
    .replace(/(token=)[^&\s]*/gi, '$1<mascarado>')
    .replace(/("token"\s*:\s*")[^"]*(")/gi, '$1<mascarado>$2')
}

/** O segredo da query contra a variável, em tempo constante. Variável ausente: nada passa. */
function segredoConfere(recebido: unknown): boolean {
  const esperado = process.env.ORCAMENTISTA_WEBHOOK_SEGREDO
  if (!esperado || typeof recebido !== 'string' || recebido === '') return false
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(esperado).digest()
  return timingSafeEqual(a, b)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (process.env.VERCEL_ENV !== 'production') {
    return res.status(503).json({ error: 'Rota de captura desligada fora de produção: preview escreve no banco de produção e não entra aqui.' })
  }

  if (!segredoConfere(req.query.s)) return res.status(401).end()

  try {
    const pedacos: Buffer[] = []
    let guardados = 0
    let total = 0
    for await (const pedaco of req) {
      const b = Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(pedaco)
      total += b.length
      // O corte: depois dos 8 KB, o que sobra de cada pedaço é vazio — conta no tamanho, não no log.
      const parte = b.subarray(0, LIMITE_DO_CORPO - guardados)
      pedacos.push(parte)
      guardados += parte.length
    }
    const corpo = Buffer.concat(pedacos).toString('utf8')
    const contentType = req.headers['content-type'] ?? '(sem content-type)'
    console.log(`${PREFIXO_DO_LOG} content-type=${contentType} | ${total} bytes | corpo=${mascarar(corpo)}`)
  } catch (e) {
    console.log(`${PREFIXO_DO_LOG} falha ao ler o corpo: ${e instanceof Error ? e.message : 'erro desconhecido'}`)
  }

  return res.status(200).end()
}
