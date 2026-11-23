/**
 * /api/atendimentos-ia/orcamentos/[id]/precificacao — a PRECIFICAÇÃO FINAL do orçamento I.A. (o 1b, dono do produto, 09/11/2026).
 *   GET: o orçamento com os valores do cálculo e o bloco fiscal, para a tela de precificação (o modo "orçamento" da tela de Produtos).
 *   PATCH: grava o valor de venda, o bloco fiscal e os percentuais NO ORÇAMENTO. Recusa nomeando (400) o que falta, e (409) quando o cálculo
 *   gravado não está completo. Devolve também a TABELA DO VENDEDOR da conversa (16/11/2026): é a TELA que grava o orçamento nela como produto,
 *   pelo mesmo salvar do produto comum (`gravarComoProduto`).
 * Ver ver: GET; quem edita: PATCH. O tenant entra em toda leitura e escrita.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { ErroNaoEncontrado } from '@/lib/atendimentos-ia/orcamentos-ia'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'
import {
    ErroDoEstado, ErroSemMigracaoDaPrecificacao, FRASE_SEM_MIGRACAO_DA_PRECIFICACAO, gravarPrecificacao, lerOrcamentoParaPrecificar,
} from '@/lib/atendimentos-ia/orcamento-precificado'
import { itensDoArquivo, lerClienteDoOrcamento } from '@/lib/atendimentos-ia/arquivo-do-orcamento-servidor'
import { fiscalDivergente } from '@/lib/atendimentos-ia/precificacao-do-orcamento'
import { numeroExibidoDoOrcamento } from '@/lib/atendimentos-ia/numero-do-orcamento-servidor'
import { tabelaDoVendedorDoOrcamento, type DestinoDoOrcamento } from '@/lib/atendimentos-ia/tabela-do-vendedor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, req.method === 'GET' ? 'ver' : 'editar', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    try {
        if (!UUID.test(id)) throw new ErroNaoEncontrado()
        if (req.method === 'GET') {
            const orcamento = await lerOrcamentoParaPrecificar(caller.tenant_id, id)
            // os itens como o arquivo os mostra: a faixa da tela, antes do salvar, lê a MESMA montagem que o PDF (11/11/2026)
            const [itens, cliente] = await Promise.all([itensDoArquivo(caller.tenant_id, id), lerClienteDoOrcamento(caller.tenant_id, id)])
            // o TOPO do orçamento (11/11/2026): as credenciais do cliente, as mesmas do PDF
            // o fiscal gravado fora do preset (só por fora do código): a tela avisa, e o salvar o sobrescreve registrando (11/11/2026)
            const numero_exibido = await numeroExibidoDoOrcamento(caller.tenant_id, id).catch(() => String(orcamento.numero))
            return res.status(200).json({ orcamento: { ...orcamento, numero_exibido }, cliente, fiscal_divergente: fiscalDivergente(orcamento), itens_do_arquivo: 'recusa' in itens ? null : itens.itens, recusa_dos_itens: 'recusa' in itens ? itens.recusa : null })
        }
        const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
        const r = await gravarPrecificacao(caller.tenant_id, id, corpo, caller.user_id)
        // a tabela do vendedor da conversa, onde a tela grava o orçamento como produto (16/11/2026). A precificação JÁ está salva: a falha
        // de ler a tabela não a desfaz, vira aviso nomeado.
        let destino: DestinoDoOrcamento
        try {
            destino = await tabelaDoVendedorDoOrcamento(caller.tenant_id, id)
        } catch (e) {
            destino = { tabela: null, aviso: `A precificação foi salva, mas a tabela do vendedor não foi lida: ${e instanceof Error ? e.message : String(e)}` }
        }
        return res.status(200).json({ orcamento: r.orcamento, arquivo: r.arquivo, recusas_do_arquivo: r.recusasDoArquivo, fiscal_sobrescrito: r.fiscalSobrescrito, tabela_do_vendedor: destino.tabela, aviso_da_tabela: destino.aviso })
    } catch (e) {
        if (e instanceof ErroDoEstado) return res.status(409).json({ error: e.message })
        if (e instanceof ErroSemMigracaoDaPrecificacao) return res.status(503).json({ error: FRASE_SEM_MIGRACAO_DA_PRECIFICACAO, sem_migracao: true })
        return responderErroDoOrcamento(res, e, 'precificacao')
    }
}
