/**
 * POST /api/super-admin/atendimentos-ia/familias/[chave]/etapas/[etapaId]/motor — { path, nome }: o arquivo de motor enviado vira o
 * MOTOR DA ETAPA. Cria a linha em `orcamentista_motor` (família = a da etapa, sem fornecedor), grava as 12 tabelas por `motor_id`,
 * registra a importação e aponta a etapa, numa transação só (`superadmin_criar_motor_da_etapa`, migração 20261027000010, que loga).
 * Trocar o arquivo é a mesma chamada: o motor novo nasce, a etapa o aponta, o velho fica arquivável.
 *
 * O motor é GLOBAL (opção A, dono do produto, 27/10/2026): vale para toda conta da família, e não se duplica por conta. O motor novo
 * NASCE SEM TEMPO: os tempos de fabricação ficam como estão. O cálculo da conversa NÃO muda — quem passa a ler as etapas é o PR D.
 *
 * A ORDEM, e cada recusa sai ANTES do passo seguinte:
 *   1. só super admin (404 para os outros), método POST;
 *   2. o corpo `{ path, nome }`: o caminho tem de estar na pasta de motor DESTA família (400) e o arquivo ser planilha que a leitura abre (400);
 *   3. a etapa existe e é desta família (404);
 *   4. o objeto está no bucket (409, com o caminho que faltou);
 *   5. baixa e lê com o MESMO leitor da importação (`lerArquivoDoMotor`): aba que falta ou valor inválido é 422 com todas as frases;
 *   6. chama a função; recusa dela vai com a mensagem dela (42501→403, P0002→404, 22023→400); outro erro é 500 com o código;
 *   7. CONFERE o que a função gravou contra o que foi mandado, lista por lista. Diferente é 500 com os dois lados — nunca sucesso.
 *      LIMITE: a função já fez COMMIT quando a conferência acontece; o 500 torna a divergência visível, mas não a desfaz.
 *
 * maxDuration 90: ler o arquivo do Storage e parsear (~9 s), levar o corpo ao banco (~19 s medidos para a Wolff) e até 35 s de gravação.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { ErroDaFuncao, criarMotorDaEtapa, etapaEDaFamilia } from '@/lib/atendimentos-ia/etapas-da-familia'
import { baixarObjeto, falhaInterna, objetoExiste } from '@/lib/atendimentos-ia/repositorio'
import { metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { ehUuid, fraseDoArquivo } from '@/utils/atendimentos-ia-catalogo'
import { conferirGravacaoDoMotor, lerArquivoDoMotor, montarPayloadDoMotor, type ResultadoDoMotor } from '@/utils/atendimentos-ia-importacao'
import { fraseDoMotorQueNaoFoiGravado, lerCorpoDaSubidaDoMotor } from '@/utils/atendimentos-ia-motor-da-etapa'

export const config = { maxDuration: 90 }

type Recusa = Extract<ResultadoDoMotor, { ok: false }>
type Lido = Extract<ResultadoDoMotor, { ok: true }>

/** A recusa da função, por código: a mensagem DELA vai para a tela (ela cita a etapa e o motivo, nunca o corpo). */
const STATUS_DA_FUNCAO: Record<string, number> = { '42501': 403, P0002: 404, '22023': 400 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'POST') return metodoNaoPermitido(res, ['POST'])

    const { chave, etapaId } = req.query as { chave?: string; etapaId?: string }
    if (typeof chave !== 'string' || chave.trim() === '' || !ehUuid(etapaId)) return res.status(404).json({ error: 'Etapa não encontrada.' })

    const corpo = lerCorpoDaSubidaDoMotor(req.body, chave)
    if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
    const { path, nome } = corpo.corpo

    try {
        if (!(await etapaEDaFamilia(chave, etapaId))) return res.status(404).json({ error: 'Etapa não encontrada nesta família.' })
    } catch (e) {
        return falhaInterna(res, 'motor da etapa (etapa)', e, 'Não foi possível ler a etapa.')
    }

    let bytes: Uint8Array
    try {
        if (!(await objetoExiste(path))) return res.status(409).json({ error: fraseDoArquivo(nome, `não está no armazenamento — faltou o caminho ${path}. Envie o arquivo de novo.`) })
        bytes = await baixarObjeto(path)
    } catch (e) {
        return falhaInterna(res, 'motor da etapa (download)', e, 'Não foi possível baixar o arquivo do motor.')
    }

    const leitura = await lerArquivoDoMotor({ nome, bytes })
    if (leitura.ok === false) return res.status(422).json({ error: (leitura as Recusa).erro })
    const lido = leitura as Lido
    const payload = montarPayloadDoMotor(lido)

    let gravado: Record<string, unknown>
    const inicio = Date.now()
    try {
        gravado = await criarMotorDaEtapa({ etapaId, por: caller.user_id, arquivoPath: path, arquivoNome: nome, payload })
        console.log(`atendimentos-ia motor da etapa (gravação): ${Date.now() - inicio} ms, gravada`)
    } catch (e) {
        const codigo = e instanceof ErroDaFuncao ? e.code : null
        console.log(`atendimentos-ia motor da etapa (gravação): ${Date.now() - inicio} ms, falhou (${codigo ?? 'sem código'})`)
        const status = codigo ? STATUS_DA_FUNCAO[codigo] : undefined
        if (status && e instanceof Error && e.message.trim() !== '') return res.status(status).json({ error: e.message })
        return falhaInterna(res, 'motor da etapa (gravação)', e, fraseDoMotorQueNaoFoiGravado(codigo))
    }

    const divergencia = conferirGravacaoDoMotor(payload, gravado)
    if (divergencia) {
        console.error('atendimentos-ia motor da etapa: contagem divergente', etapaId, JSON.stringify(divergencia))
        return res.status(500).json({
            error: 'A gravação não conferiu com o que foi lido: as contagens diferem. O motor NÃO deve ser considerado válido.',
            ...divergencia,
        })
    }

    return res.status(200).json({
        motor_id: gravado.motor_id,
        etapa_id: gravado.etapa_id,
        motor_anterior: gravado.motor_anterior ?? null,
        importacao_id: gravado.importacao_id,
        regras: gravado.regras,
        tipologias: gravado.tipologias,
        detalhes: gravado.detalhes,
        avisos: lido.avisos,
    })
}
