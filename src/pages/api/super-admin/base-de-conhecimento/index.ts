/**
 * GET /api/super-admin/base-de-conhecimento?tenant=<uuid> — a base de conhecimento da empresa, numa
 * resposta só: esquadrias da empresa, o padrão do nicho, o EFETIVO campo a campo com a origem, os
 * adicionais (frete e instalação), o padrão por ambiente e os perfis de vendedor com o nome.
 *
 * PUT /api/super-admin/base-de-conhecimento?tenant=<uuid> — grava esquadrias e/ou adicionais da
 * empresa, pela função `superadmin_gravar_base_da_empresa`, que loga na mesma transação.
 *   corpo: { esquadrias?: {...}, adicionais?: {...} } — chave ausente não mexe, null limpa (nas
 *   esquadrias: volta a herdar o nicho), false grava false.
 *
 * O portão (super admin ou 404; empresa do query string, uuid e existente, ou 404) e a regra de
 * gravação estão em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import {
    efetivoDasEsquadrias, ehNichoDasEsquadrias, errosDeCoerenciaDosAdicionais, lerCorpoDaBase,
} from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncao, lerAdicionais, lerBaseDaEmpresa, metodoNaoPermitido,
    nichoDaEmpresa, recusaForaDoNicho, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // (a) o portão vem antes de tudo — inclusive do 405 e do corpo
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET' && req.method !== 'PUT') return metodoNaoPermitido(res, ['GET', 'PUT'])

    try {
        // (b) a empresa vem do QUERY STRING, e tem de existir
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        if (req.method === 'GET') {
            const b = await lerBaseDaEmpresa(tenantId)
            return res.status(200).json({
                tenant_id: tenantId,
                nicho: b.nicho,
                esquadrias: { empresa: b.empresa, nicho: b.padrao, efetivo: efetivoDasEsquadrias(b.empresa, b.padrao) },
                adicionais: b.adicionais,
                ambientes: b.ambientes,
                vendedores: b.vendedores,
            })
        }

        const corpo = lerCorpoDaBase(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)

        if (corpo.esquadrias && !ehNichoDasEsquadrias(await nichoDaEmpresa(tenantId))) {
            return res.status(409).json({ error: recusaForaDoNicho('Esta empresa') })
        }
        if (corpo.adicionais) {
            // a coerência é do estado RESULTANTE: o que não veio no corpo continua valendo
            const erros = errosDeCoerenciaDosAdicionais({ ...((await lerAdicionais(tenantId)) ?? {}), ...corpo.adicionais })
            if (erros.length > 0) return recusaNomeada(res, erros)
        }

        // (c) a escrita e o log, numa transação — o autor vem da SESSÃO
        return gravarPelaFuncao(res, 'superadmin_gravar_base_da_empresa', {
            p_tenant: tenantId, p_por: caller.user_id, p_esquadrias: corpo.esquadrias, p_adicionais: corpo.adicionais,
        })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
