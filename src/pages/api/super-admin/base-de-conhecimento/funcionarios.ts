/**
 * GET /api/super-admin/base-de-conhecimento/funcionarios?tenant=<uuid> — os funcionários ativos da
 * empresa, para a tela escolher a quem atribuir perfil de vendedor. SÓ LEITURA.
 *   resposta: { funcionarios: [{ id, nome }] } — EXATAMENTE id e nome, e mais nada.
 *
 * ══ EXCEÇÃO NOMINAL à REGRA INVIOLÁVEL das telas de contas ══
 * Decisão do dono do produto, 23/10/2026. A regra (`contas/[tenantId].tsx`) continua valendo para o
 * que protege: o conteúdo do negócio do cliente — clientes, orçamentos, valores de venda. Esta rota
 * PERMITE id e nome de funcionário, só para atribuir perfil de vendedor — a mesma exceção que o GET
 * da base já fazia desde o #126, ao devolver o nome dos vendedores gravados. NÃO PERMITE telefone,
 * e-mail, cargo, salário, status ou qualquer outra coluna: outro campo é outra decisão.
 *
 * O portão (super admin ou 404; empresa do query string, uuid e existente, ou 404) está em
 * `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import {
    empresaDoPedido, falhaDeLeitura, funcionariosDaEmpresa, metodoNaoPermitido,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET') return metodoNaoPermitido(res, ['GET'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return
        return res.status(200).json({ funcionarios: await funcionariosDaEmpresa(tenantId) })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
