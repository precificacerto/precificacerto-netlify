/**
 * PUT /api/super-admin/atendimentos-ia/etapas/[id]/descricao — `{ descricao }`: a DESCRIÇÃO do item do catálogo de etapas (dono do produto,
 * 20/11/2026: "o que a etapa entrega e o que NAO e dela, que aparece na tela e entra no prompt da etapa corrente"). Texto aparado; vazio ou
 * null limpa; acima de 1.500 é recusa nomeada aqui, antes da função. A função é `superadmin_gravar_descricao_da_etapa` (migração
 * 20261120000001), que confere o autor super admin, o item e a forma de novo, e loga. O catálogo é global: a descrição vale para toda conta.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, falhaInterna } from '@/lib/atendimentos-ia/repositorio'
import { gravarDescricaoDaEtapa } from '@/lib/atendimentos-ia/etapas-da-familia'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'
import { ETAPA_DO_CATALOGO_INEXISTENTE, lerCorpoDaDescricaoDaEtapa } from '@/utils/atendimentos-ia-etapas'

export const FRASE_SEM_A_MIGRACAO_DA_DESCRICAO =
    'A descrição da etapa ainda não pode ser gravada: falta aplicar a migração 20261120000001 no banco.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PUT') {
        res.setHeader('Allow', 'PUT')
        return res.status(405).json({ error: 'Method not allowed' })
    }
    const caller = await requireSuperAdmin(req, res)
    if (!caller) return
    const { id } = req.query as { id?: string }
    if (!ehUuid(id)) return res.status(404).json({ error: ETAPA_DO_CATALOGO_INEXISTENTE })
    const lido = lerCorpoDaDescricaoDaEtapa(req.body)
    if (lido.ok === false) return res.status(400).json({ error: lido.erro })
    try {
        return res.status(200).json(await gravarDescricaoDaEtapa({ por: caller.user_id, id, descricao: lido.descricao }))
    } catch (e) {
        const codigo = codigoDoErro(e)
        if (codigo === 'P0002') return res.status(404).json({ error: ETAPA_DO_CATALOGO_INEXISTENTE })
        if (codigo === '42501') return res.status(403).json({ error: 'Só o super admin altera o catálogo.' })
        if (codigo === '22023' && e instanceof Error && e.message.trim() !== '') return res.status(400).json({ error: e.message })
        // a função ainda não existe no banco (a migração pendente): frase, não 500 mudo
        if (codigo === '42883' || codigo === 'PGRST202') return res.status(409).json({ error: FRASE_SEM_A_MIGRACAO_DA_DESCRICAO })
        return falhaInterna(res, 'descricao da etapa PUT', e, 'Não foi possível gravar a descrição da etapa.')
    }
}
