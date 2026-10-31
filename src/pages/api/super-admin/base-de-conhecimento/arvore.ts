/**
 * /api/super-admin/base-de-conhecimento/arvore?tenant=<uuid> — a base de conhecimento em TRÊS
 * NÍVEIS de uma empresa, inteira.
 *
 *   GET → numa resposta só: matérias-primas → as 6 categorias (config incluído, NULL preservado) →
 *         fornecedores (com `principal`), vidros, ferragens e instalação; o catálogo de categorias e
 *         campos; e os fornecedores do NICHO da empresa. LEITURA pelo cliente service_role, tabela a
 *         tabela e filtrada pelo tenant, como o GET da base (`index.ts`): não existe função de
 *         leitura. As tabelas não têm GRANT para anon/authenticated.
 *
 *   PUT → `superadmin_gravar_arvore` (migração `20261023000004`), numa transação só.
 *         corpo: { arvore: { materias_primas?: [{ nome, categorias?: [{ categoria_chave, config?,
 *                  fornecedores?, vidros?, ferragens?, instalacao? }] }], remover?: [uuid] } }
 *         1:1, sem lógica própria: a árvore vai à função como veio — ausente não mexe, lista vazia
 *         esvazia, e quem decide é ela. Falha em qualquer nó desfaz TUDO. O autor é o usuário da
 *         sessão; `por` no corpo é erro. Os erros vêm com a mensagem dela, que traz o CAMINHO
 *         (matéria-prima e categoria), nos quatro códigos (42501, P0002, 22023, 23503).
 *
 *         Os campos que saíram da tela e da gravação (`CAMPOS_FORA_DA_TELA`, 30/10/2026) são recusa nomeada AQUI, com o caminho, antes da função.
 *
 * O portão está em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { errosDosCamposForaDaTelaNaArvore, lerEnvelope } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, lerArvoreDaEmpresa, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET' && req.method !== 'PUT') return metodoNaoPermitido(res, ['GET', 'PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        if (req.method === 'GET') return res.status(200).json(await lerArvoreDaEmpresa(tenantId))

        const corpo = lerEnvelope(req.body, 'arvore')
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)
        const fora = errosDosCamposForaDaTelaNaArvore(corpo.valor)
        if (fora.length > 0) return recusaNomeada(res, fora)
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_arvore', { p_tenant: tenantId, p_por: caller.user_id, p_arvore: corpo.valor })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
