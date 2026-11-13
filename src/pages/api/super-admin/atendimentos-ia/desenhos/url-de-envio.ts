/**
 * POST /api/super-admin/atendimentos-ia/desenhos/url-de-envio — { grupo, arquivos: string[] } (até TAMANHO_DO_LOTE)
 * → { existentes: string[], assinados: [{ arquivo, path, signedUrl }], recusados: [{ arquivo, motivo }] }
 *
 * OS DESENHOS DAS TIPOLOGIAS (dono do produto, 11/11/2026): a página descompacta o zip no navegador e pede, lote a lote, a assinatura
 * de cada imagem para `tipologias/<grupo>/<arquivo>`. Os bytes não passam por aqui (o mesmo desenho de `tabelas/url-de-envio.ts`).
 *
 * A RETOMADA E O "NÃO DUPLICA NEM APAGA" moram aqui: a rota lê o que JÁ está na pasta do grupo e devolve esses nomes como `existentes`,
 * sem assinar — o objeto que existe não é tocado. O envio do navegador vai sem sobrescrita (`x-upsert: false`). Nada nesta rota apaga.
 * O nome que não serve para o bucket volta em `recusados`, com o motivo — nunca pulado em silêncio.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { assinarEnvio, falhaInterna, nomesNaPasta } from '@/lib/atendimentos-ia/repositorio'
import { PASTA_DOS_DESENHOS, caminhoDoDesenho, lerPedidoDoLote, type Recusa } from '@/lib/atendimentos-ia/desenhos-das-tipologias'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const caller = await requireSuperAdmin(req, res)
    if (!caller) return

    const pedido = lerPedidoDoLote(req.body)
    if ('erro' in pedido) return res.status(400).json({ error: pedido.erro })
    const { grupo, arquivos } = pedido

    try {
        const jaNaPasta = await nomesNaPasta(`${PASTA_DOS_DESENHOS}/${grupo}`)
        const existentes: string[] = []
        const recusados: Recusa[] = []
        const assinados: Array<{ arquivo: string; path: string; signedUrl: string }> = []
        for (const arquivo of arquivos) {
            const c = caminhoDoDesenho(grupo, arquivo)
            if ('recusa' in c) { recusados.push({ arquivo, motivo: c.recusa }); continue }
            if (jaNaPasta.has(arquivo)) { existentes.push(arquivo); continue }
            const assinado = await assinarEnvio(c.caminho)
            assinados.push({ arquivo, path: assinado.path, signedUrl: assinado.signedUrl })
        }
        return res.status(200).json({ existentes, assinados, recusados })
    } catch (e) {
        return falhaInterna(res, 'url de envio dos desenhos', e, 'Não foi possível preparar o envio deste lote de desenhos.')
    }
}
