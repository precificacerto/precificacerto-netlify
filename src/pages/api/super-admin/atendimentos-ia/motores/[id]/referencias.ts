/**
 * GET /api/super-admin/atendimentos-ia/motores/[id]/referencias — A CONFERÊNCIA DE REFERÊNCIAS DO MOTOR (dono do produto, 12/11/2026): para cada
 * código que as regras do motor citam, se existe na tabela de preço (sob qual código, por qual degrau), se tem preço, crédito e NCM, de qual
 * fornecedor e categoria, e o peso (regras e tipologias). A resposta são LISTAS NOMEADAS — achadas com preço, achadas sem preço, não achadas,
 * NÃO RESOLVIDAS (há candidatas e nenhuma vale: duas no mesmo degrau, ou a descrição não bate) —, mais as achadas pelo sufixo do fornecedor com
 * outra descrição, para alguém conferir. Nunca um número solto. A resolução é `resolverReferencia` (`resolucao-de-referencia.ts`), a MESMA do
 * cálculo, no ESCOPO do motor (o fornecedor e as famílias dele). Só leitura. Só o super admin (os outros recebem 404); o motor que não existe é 404.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { falhaInterna, lerParaConferirReferencias } from '@/lib/atendimentos-ia/repositorio'
import { agregarRegras, comDescricaoDivergente, conferirReferencias } from '@/lib/atendimentos-ia/conferencia-de-referencias'
import { lerCoresDosFornecedores } from '@/lib/atendimentos-ia/cores-do-fornecedor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET') return metodoNaoPermitido(res, ['GET'])
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'O motor tem de ser um id.' })
    try {
        const lido = await lerParaConferirReferencias(id)
        if (lido === null) return res.status(404).json({ error: 'Motor não encontrado.' })
        // o ESCOPO é o do motor: o fornecedor dele e as famílias em que ele atua (dono do produto, 12/11/2026: "escopo primeiro, sempre")
        const escopo = { fornecedor_id: lido.motor.fornecedor_id, familias: lido.motor.familias }
        // a tabela de cores do fornecedor do motor (20261112000006): sem a migração, vazia — o degrau "código + cor" não acha, e diz
        const cores = await lerCoresDosFornecedores([lido.motor.fornecedor_id])
        const conferencia = conferirReferencias(agregarRegras(lido.regras), lido.itens, escopo, cores.porFornecedor.get(lido.motor.fornecedor_id) ?? [])
        return res.status(200).json({
            motor: lido.motor, itens_nas_tabelas: lido.itens.length, itens_no_escopo: conferencia.itensNoEscopo,
            codigos: conferencia.codigos, regras: conferencia.regras,
            achadas_com_preco: conferencia.comPreco, achadas_sem_preco: conferencia.semPreco,
            nao_achadas: conferencia.naoAchadas, nao_resolvidas: conferencia.naoResolvidas,
            sufixo_com_outra_descricao: comDescricaoDivergente(conferencia),
            tabela_de_cores: cores.leitura,
        })
    } catch (e) {
        return falhaInterna(res, 'conferir referências do motor', e, 'Não foi possível conferir as referências do motor.')
    }
}
