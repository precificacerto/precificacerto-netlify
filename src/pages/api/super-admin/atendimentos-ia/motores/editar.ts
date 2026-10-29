/**
 * POST /api/super-admin/atendimentos-ia/motores/editar — `{ motor_id, fornecedor_id, categoria, familia? }`: EDITAR categoria, fornecedor e família do motor, SÓ
 * EM MOTOR SEM USO (dono do produto, 29/10/2026: "com uso, o arquivo ficaria na pasta do fornecedor antigo e o motor passaria a mentir sobre a
 * própria origem"). A função `superadmin_editar_motor` (migração 20261029000001) confere o uso — nenhuma etapa e nenhum item de levantamento —
 * e loga o antes e o depois.
 *
 * O ARQUIVO DIZ A ORIGEM: trocar o fornecedor COPIA o objeto para a pasta de motor do fornecedor novo, e a função confere o caminho novo. Se a
 * função recusar, a CÓPIA é removida (é nova, não tem dado de ninguém); o objeto antigo nunca é tocado — apagar arquivo é DELETE, e DELETE é do
 * dono do produto. A FAMÍLIA ANDA COM A CATEGORIA (20261029000002): no PERFIL, obrigatória e a de uma tabela de Perfil do fornecedor (a mesma
 * trava da criação); fora dele, nula — o motor serve qualquer linha. A função `superadmin_editar_motor` confere as duas metades.
 *
 * A ORDEM: só super admin (404); o corpo, com a família pela categoria (400); o motor existe (404) e não está arquivado (400); a família do Perfil (400); a cópia, se o
 * fornecedor muda; a função (42501→403, P0002→404, 22023→400 com a mensagem dela; outro erro é 500).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { ErroDaFuncao, editarMotor, obterMotor } from '@/lib/atendimentos-ia/etapas-da-familia'
import { copiarObjeto, falhaInterna, familiasDoPerfilDoFornecedor, removerObjetos } from '@/lib/atendimentos-ia/repositorio'
import { metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { CATEGORIA_QUE_EXIGE_FAMILIA, caminhoNoBucket } from '@/utils/atendimentos-ia-catalogo'
import { MOTOR_ARQUIVADO_NAO_SE_EDITA, fraseDaFamiliaForaDoPerfil, fraseSemTabelaDePerfil, lerCorpoDaEdicao } from '@/utils/atendimentos-ia-catalogo-de-motores'

const STATUS_DA_FUNCAO: Record<string, number> = { '42501': 403, P0002: 404, '22023': 400 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'POST') return metodoNaoPermitido(res, ['POST'])

    const corpo = lerCorpoDaEdicao(req.body)
    if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
    const { motor_id, fornecedor_id, categoria, familia } = corpo.corpo

    let caminho: string
    let copia: string | null = null
    try {
        const motor = await obterMotor(motor_id)
        if (!motor) return res.status(404).json({ error: 'Motor não encontrado.' })
        if (motor.arquivado_em !== null) return res.status(400).json({ error: MOTOR_ARQUIVADO_NAO_SE_EDITA })
        if (categoria === CATEGORIA_QUE_EXIGE_FAMILIA) {
            const doPerfil = await familiasDoPerfilDoFornecedor(fornecedor_id)
            if (familia === null || !doPerfil.includes(familia)) {
                return res.status(400).json({ error: doPerfil.length === 0 ? fraseSemTabelaDePerfil() : fraseDaFamiliaForaDoPerfil(String(familia), doPerfil) })
            }
        }
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
        const depois = await editarMotor({ por: caller.user_id, motorId: motor_id, fornecedorId: fornecedor_id, categoria, familia, arquivoPath: caminho })
        return res.status(200).json(depois)
    } catch (e) {
        // a cópia é nova: se a função recusou, ela sai; o objeto antigo nunca é tocado
        if (copia) await removerObjetos([copia])
        const codigo = e instanceof ErroDaFuncao ? e.code : null
        const status = codigo ? STATUS_DA_FUNCAO[codigo] : undefined
        if (status && e instanceof Error && e.message.trim() !== '') return res.status(status).json({ error: e.message })
        return falhaInterna(res, 'editar motor (gravação)', e, 'Não foi possível editar o motor. Nada foi gravado.')
    }
}
