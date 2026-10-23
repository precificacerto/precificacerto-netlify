/**
 * GET /api/super-admin/base-de-conhecimento/arvore?tenant=<uuid> — a base de conhecimento em TRÊS
 * NÍVEIS de uma empresa, numa resposta só: matérias-primas → as 6 categorias (config incluído, NULL
 * preservado) → fornecedores (com `principal`), vidros, ferragens e instalação; o catálogo de
 * categorias e campos; e os fornecedores do NICHO da empresa.
 *
 * LEITURA pelo cliente service_role, tabela a tabela e filtrada pelo tenant, como o GET da base
 * (`index.ts`): não existe função de leitura. As tabelas não têm GRANT para anon/authenticated.
 *
 * O portão está em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import {
    empresaDoPedido, falhaDeLeitura, lerArvoreDaEmpresa, metodoNaoPermitido,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET') return metodoNaoPermitido(res, ['GET'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return
        return res.status(200).json(await lerArvoreDaEmpresa(tenantId))
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
