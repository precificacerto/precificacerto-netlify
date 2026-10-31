/**
 * GET /api/super-admin/base-de-conhecimento/etapas?tenant=<uuid>&materia_prima=<uuid> — as etapas da FAMÍLIA-INSTÂNCIA (a matéria-prima desta
 *     empresa), na ordem, cada uma com o `motor_id` que aponta, o `familia` (o TIPO da matéria-prima) e os `motores` do catálogo que podem ser
 *     apontados: do mesmo tipo e não arquivados — os que a função aceita. E `pronta` (a família tem etapas e TODAS com motor) e `etapas_sem_motor`
 *     (número e rótulo de cada uma): a família só calcula com todas as etapas com motor (dono do produto, 29/10/2026). Não é trava de gravação —
 *     montar aos poucos continua permitido —; é o que a tela mostra, e o que a execução confere (`conferirEtapasParaExecutar`).
 * PUT /api/super-admin/base-de-conhecimento/etapas?tenant=<uuid> — grava `{ materia_prima, etapas: [...] }`, a LISTA INTEIRA na ordem desejada
 *     (a posição é o número), pela função `superadmin_gravar_etapas_da_materia_prima` (migração 20261028000001), que loga na mesma transação.
 *     Item com `id` edita; sem `id`, cria. NÃO remove etapa. `motor_id` no item: ausente mantém o motor da etapa, null limpa, uuid aponta.
 *
 * A ETAPA É DA FAMÍLIA-INSTÂNCIA (dono do produto, 28/10/2026): a mesma empresa pode ter três famílias PVC, cada uma com as suas etapas. O
 * motor é global, do Catálogo (o antigo "Fornecedores e tabelas"): aqui só se seleciona. O rótulo é livre; a AÇÃO é de uma lista fechada. A rota
 * confere o corpo ANTES da função (`lerCorpoDasEtapas`), com a frase que diz qual etapa e por quê; a função e a CHECK do banco conferem de
 * novo, e a mensagem dela vai na resposta (42501, P0002, 22023). O autor é o usuário da sessão.
 *
 * Só o super admin (os outros recebem 404). Nada aqui toca o cálculo: quem lê as etapas na conversa é o PR D.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCatalogoDeMotores, lerEtapasDaMateriaPrima } from '@/lib/atendimentos-ia/etapas-da-familia'
import { empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, idDoQuery, metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { etapasSemMotor, familiaPronta, lerCorpoDasEtapas } from '@/utils/atendimentos-ia-etapas'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET' && req.method !== 'PUT') return metodoNaoPermitido(res, ['GET', 'PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        if (req.method === 'GET') {
            const materiaPrima = idDoQuery(req, 'materia_prima')
            const lidas = materiaPrima ? await lerEtapasDaMateriaPrima(tenantId, materiaPrima) : null
            if (!lidas) return res.status(404).json({ error: 'Família não encontrada nesta empresa.' })
            const motores = lidas.familia === null ? [] : await lerCatalogoDeMotores({ tipo: lidas.familia })
            return res.status(200).json({
                familia: lidas.familia, etapas: lidas.etapas, motores, pronta: familiaPronta(lidas.etapas), etapas_sem_motor: etapasSemMotor(lidas.etapas),
            })
        }

        const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}
        const fora = Object.keys(b).filter((k) => k !== 'materia_prima' && k !== 'etapas')
        if (fora.length > 0) return res.status(400).json({ error: `Campo desconhecido no corpo: ${fora.join(', ')} (só materia_prima e etapas).` })
        if (!ehUuid(b.materia_prima)) return res.status(400).json({ error: 'A matéria-prima (a família) não é um uuid.' })
        const corpo = lerCorpoDasEtapas({ etapas: b.etapas })
        if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_etapas_da_materia_prima', {
            p_tenant: tenantId, p_por: caller.user_id, p_materia_prima: b.materia_prima, p_etapas: corpo.etapas,
        })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
