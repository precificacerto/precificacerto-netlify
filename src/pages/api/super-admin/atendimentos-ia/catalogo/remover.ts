/**
 * O CATÁLOGO É SOBERANO NAS QUATRO SEÇÕES (dono do produto, 31/10/2026; migração 20261031000003) — uma rota só para família, fornecedor,
 * motor e etapa do catálogo — e a tabela de fornecedor, a quinta raiz (dono do produto, 01/11/2026; migração 20261101000001; o DELETE de
 * `tabelas/[id]` saiu, 405):
 *
 * GET  /api/super-admin/atendimentos-ia/catalogo/remover?tipo=<familia|fornecedor|motor|etapa|tabela>&chave=<chave da família ou uuid>
 *      MEDE o arrasto, SEM APAGAR NADA (`superadmin_arrasto_do_catalogo`): por passo, a quantidade e até dez nomes ("e mais N"); o que FICA;
 *      os avisos (a conversa que PARA quando sai uma tabela com motor — decisão 4; a renumeração das etapas); os impedimentos; a assinatura.
 * POST `{ tipo, chave, assinatura, confirmo: true }` — REMOVE, só com a confirmação explícita e a assinatura do que foi mostrado
 *      (`superadmin_remover_do_catalogo`): a função trava o que sai, mede de novo e recusa se mudou (40001 → 409 com o arrasto NOVO, para a tela
 *      mostrar); apaga explicitamente, em ordem, numa transação, logando cada linha com o tenant de quem era dela. Documento de cliente não sai:
 *      perde o vínculo. As FKs continuam como estão.
 *
 * Erros, com frase: tipo desconhecido 400; item inexistente 404; não super admin 403 (a sessão já filtra; a função confere de novo); impedimento
 * 409; tempo da função (80 s) 504, com nada removido. Outro erro é 500, sem o texto do banco.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, falhaInterna, medirArrastoDoCatalogo, removerDoCatalogo } from '@/lib/atendimentos-ia/repositorio'
import {
    ARRASTO_MUDOU, CHAVE_INVALIDA, ITEM_INEXISTENTE, REMOCAO_PASSOU_DO_TEMPO, TIPO_DESCONHECIDO, chaveDaRemocaoValida, ehTipoDeRemocao, fraseDoImpedimento,
    lerArrasto, lerPedidoDeRemocao,
} from '@/utils/atendimentos-ia-remocao'

// a remoção do fornecedor da Wolff mexe em ~125 mil linhas (medido em 31/10/2026; 5 s no harness); a função corta em 80 s
export const config = { maxDuration: 90 }

export const ARRASTO_ILEGIVEL = 'A medição do que sai veio numa forma que a tela não sabe ler: nada foi removido.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const caller = await requireSuperAdmin(req, res)
    if (!caller) return

    if (req.method === 'GET') {
        const { tipo, chave } = req.query as { tipo?: string; chave?: string }
        if (!ehTipoDeRemocao(tipo)) return res.status(400).json({ error: TIPO_DESCONHECIDO })
        if (!chaveDaRemocaoValida(tipo, chave)) return res.status(400).json({ error: CHAVE_INVALIDA })
        try {
            const arrasto = lerArrasto(await medirArrastoDoCatalogo({ tipo, chave }))
            if (!arrasto) return res.status(500).json({ error: ARRASTO_ILEGIVEL })
            return res.status(200).json(arrasto)
        } catch (e) {
            return recusa(res, e, 'arrasto GET', 'Não foi possível medir o que sai.')
        }
    }

    const pedido = lerPedidoDeRemocao(req.body)
    if (pedido.ok === false) return res.status(400).json({ error: pedido.erro })
    const { tipo, chave, assinatura } = pedido.corpo
    try {
        const feito = lerArrasto(await removerDoCatalogo({ por: caller.user_id, tipo, chave, assinatura }))
        if (!feito) return res.status(500).json({ error: 'A remoção foi feita, mas a resposta veio numa forma que a tela não sabe ler: recarregue a página.' })
        return res.status(200).json({ ...feito, removido: true })
    } catch (e) {
        const codigo = codigoDoErro(e)
        // o arrasto mudou: a resposta leva o NOVO, medido agora, para a tela mostrar e pedir a confirmação de novo
        if (codigo === '40001') {
            try {
                const novo = lerArrasto(await medirArrastoDoCatalogo({ tipo, chave }))
                return res.status(409).json({ error: ARRASTO_MUDOU, arrasto: novo })
            } catch (e2) {
                return recusa(res, e2, 'arrasto POST (medir de novo)', ARRASTO_MUDOU)
            }
        }
        if (codigo === '23505') {
            try {
                const novo = lerArrasto(await medirArrastoDoCatalogo({ tipo, chave }))
                const frases = novo?.impedimentos.map(fraseDoImpedimento) ?? []
                return res.status(409).json({ error: frases.length > 0 ? `Nada foi removido. ${frases.join(' ')}` : 'Nada foi removido: o banco recusou por um conflito de unicidade.', arrasto: novo })
            } catch (e2) {
                return recusa(res, e2, 'arrasto POST (impedimento)', 'Nada foi removido: a remoção está impedida.')
            }
        }
        return recusa(res, e, 'arrasto POST', 'Não foi possível remover do catálogo. Nada foi removido.')
    }
}

function recusa(res: NextApiResponse, e: unknown, contexto: string, mensagem: string) {
    const codigo = codigoDoErro(e)
    if (codigo === 'P0002') return res.status(404).json({ error: ITEM_INEXISTENTE })
    if (codigo === '22023') return res.status(400).json({ error: TIPO_DESCONHECIDO })
    if (codigo === '42501') return res.status(403).json({ error: 'Só o super admin remove do catálogo.' })
    if (codigo === '57014') return res.status(504).json({ error: REMOCAO_PASSOU_DO_TEMPO })
    return falhaInterna(res, contexto, e, mensagem)
}
