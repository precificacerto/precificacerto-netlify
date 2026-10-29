/**
 * POST /api/super-admin/atendimentos-ia/motores/editar — `{ motor_id, fornecedor_id, categoria, familias }`: EDITAR o motor (`superadmin_editar_motor`,
 * migração 20261029000003, que loga o antes e o depois).
 *   - FORNECEDOR E CATEGORIA, SÓ EM MOTOR SEM USO (dono do produto, 29/10/2026: "com uso, o arquivo ficaria na pasta do fornecedor antigo e o motor
 *     passaria a mentir sobre a própria origem"): a função confere o uso — nenhuma etapa e nenhum item de levantamento.
 *   - AS FAMÍLIAS em que o motor atua (o motor serve N famílias e uma categoria, 29/10/2026) se editam TAMBÉM COM USO: o corpo leva a lista inteira
 *     de depois. TIRAR a família que alguma etapa ou item usa é RECUSA 409 que nomeia quem usa (a função, 23001); se a recusa vier da FK RESTRICT da
 *     etapa ou do item (23503 — uma corrida que a conferência da função não viu), é 409 com a frase genérica. A família NÃO se amarra a uma tabela
 *     da categoria do fornecedor.
 *
 * O ARQUIVO DIZ A ORIGEM: trocar o fornecedor COPIA o objeto para a pasta de motor do fornecedor novo, e a função confere o caminho novo. Se a
 * função recusar, a CÓPIA é removida (é nova, não tem dado de ninguém); o objeto antigo nunca é tocado — apagar arquivo é DELETE, e DELETE é do
 * dono do produto.
 *
 * A ORDEM: só super admin (404); o corpo (400); o motor existe (404) e não está arquivado (400); cada família no catálogo (400 nomeando); a cópia,
 * se o fornecedor muda; a função (42501→403, P0002→404, 22023→400 e 23001→409 com a mensagem dela; 23503→409; outro erro é 500).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { ErroDaFuncao, editarMotor, obterMotor } from '@/lib/atendimentos-ia/etapas-da-familia'
import { copiarObjeto, falhaInterna, listarFamilias, removerObjetos } from '@/lib/atendimentos-ia/repositorio'
import { metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { caminhoNoBucket } from '@/utils/atendimentos-ia-catalogo'
import {
    FAMILIA_EM_USO_NAO_SAI_DO_MOTOR, MOTOR_ARQUIVADO_NAO_SE_EDITA, familiasForaDoCatalogo, fraseDaFamiliaForaDoCatalogo, lerCorpoDaEdicao,
} from '@/utils/atendimentos-ia-catalogo-de-motores'

/** A recusa da função, por código, com a mensagem DELA; 23001 é a família em uso que não sai (nomeia quem usa). */
const STATUS_DA_FUNCAO: Record<string, number> = { '42501': 403, P0002: 404, '22023': 400, '23001': 409 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'POST') return metodoNaoPermitido(res, ['POST'])

    const corpo = lerCorpoDaEdicao(req.body)
    if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
    const { motor_id, fornecedor_id, categoria, familias } = corpo.corpo

    let caminho: string
    let copia: string | null = null
    try {
        const motor = await obterMotor(motor_id)
        if (!motor) return res.status(404).json({ error: 'Motor não encontrado.' })
        if (motor.arquivado_em !== null) return res.status(400).json({ error: MOTOR_ARQUIVADO_NAO_SE_EDITA })
        const fora = familiasForaDoCatalogo(familias, await listarFamilias())
        if (fora.length > 0) return res.status(400).json({ error: fraseDaFamiliaForaDoCatalogo(fora) })
        caminho = motor.arquivo_path
        if (fornecedor_id !== motor.fornecedor_id) {
            copia = caminhoNoBucket(fornecedor_id, 'motor', motor.arquivo_nome, randomUUID())
            await copiarObjeto(motor.arquivo_path, copia)
            caminho = copia
        }
    } catch (e) {
        return falhaInterna(res, 'editar motor (leitura)', e, 'Não foi possível ler o motor ou levar o arquivo para a pasta do fornecedor novo.')
    }

    try {
        const depois = await editarMotor({ por: caller.user_id, motorId: motor_id, fornecedorId: fornecedor_id, categoria, familias, arquivoPath: caminho })
        return res.status(200).json(depois)
    } catch (e) {
        // a cópia é nova: se a função recusou, ela sai; o objeto antigo nunca é tocado
        if (copia) await removerObjetos([copia])
        const codigo = e instanceof ErroDaFuncao ? e.code : null
        const status = codigo ? STATUS_DA_FUNCAO[codigo] : undefined
        if (status && e instanceof Error && e.message.trim() !== '') return res.status(status).json({ error: e.message })
        if (codigo === '23503') return res.status(409).json({ error: FAMILIA_EM_USO_NAO_SAI_DO_MOTOR })
        return falhaInterna(res, 'editar motor (gravação)', e, 'Não foi possível editar o motor. Nada foi gravado.')
    }
}
