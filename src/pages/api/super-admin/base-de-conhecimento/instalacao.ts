/**
 * PUT /api/super-admin/base-de-conhecimento/instalacao — SAIU em 03/11/2026 (dono do produto: "CAMPOS DA CATEGORIA VIRAM UM CAMPO DE
 * INSTRUÇÃO"). A lista de acabamentos (instalação) da categoria deixou de existir na tela, e a migração `20261103000002` a esvaziou; o que a categoria precisa
 * dizer vai na INSTRUÇÃO dela (`orcamentista_mp_categoria.instrucao`, gravada pela árvore). A tabela e a função que a gravava ficam no banco,
 * vazias e sem tela, até o dono do produto pedir a remoção. Esta rota responde 410 com a frase, para nenhuma linha voltar por ela.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { fraseDaListaQueSaiu } from '@/lib/atendimentos-ia/base-de-conhecimento'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    return res.status(410).json({ error: fraseDaListaQueSaiu('instalacao') })
}
