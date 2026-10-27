/**
 * POST /api/super-admin/atendimentos-ia/familias/[chave]/motor-url-de-envio — { nome } → { path, signedUrl }.
 *
 * O motor que a ETAPA sobe (27/10/2026; migração 20261027000010) mora na pasta DA FAMÍLIA do bucket, `familia/<chave>/motor/`, e não na
 * de um fornecedor: ele é da plataforma, global. A rota escolhe o caminho (`caminhoDoMotorDaFamilia`: a pasta da família, um id único e
 * o nome limpo) e assina UM envio para esse caminho e só para ele; os bytes vão do navegador direto ao Storage, sem passar pela rota
 * (o corpo de uma função na Vercel é limitado, e o motor da Wolff pesa ~24 MB descompactado). Quem lê o objeto, cria o motor e aponta
 * a etapa é `familias/[chave]/etapas/[etapaId]/motor`. URL assinada e não usada não deixa rastro.
 *
 * Só planilha que a leitura abre (`.xlsx`, `.xlsm`): o que não abre é recusado AQUI, antes do envio, com o arquivo e o porquê.
 * Só o super admin (os outros recebem 404, como nas etapas).
 */
import { randomUUID } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { familiaExiste } from '@/lib/atendimentos-ia/etapas-da-familia'
import { assinarEnvio, falhaInterna } from '@/lib/atendimentos-ia/repositorio'
import { metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { caminhoDoMotorDaFamilia, lerPedidoDeEnvioDoMotor } from '@/utils/atendimentos-ia-motor-da-etapa'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'POST') return metodoNaoPermitido(res, ['POST'])

    const { chave } = req.query as { chave?: string }
    if (typeof chave !== 'string' || chave.trim() === '') return res.status(404).json({ error: 'Família não encontrada.' })

    const pedido = lerPedidoDeEnvioDoMotor(req.body)
    if (pedido.ok === false) return res.status(400).json({ error: pedido.erro })

    try {
        if (!(await familiaExiste(chave))) return res.status(404).json({ error: 'Família não encontrada.' })
        return res.status(200).json(await assinarEnvio(caminhoDoMotorDaFamilia(chave, pedido.corpo.nome, randomUUID())))
    } catch (e) {
        return falhaInterna(res, 'url de envio do motor da família', e, 'Não foi possível preparar o envio do arquivo.')
    }
}
