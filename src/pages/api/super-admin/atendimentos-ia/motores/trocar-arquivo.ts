/**
 * POST /api/super-admin/atendimentos-ia/motores/trocar-arquivo — `{ motor_id, path, nome }`: TROCAR O ARQUIVO DO MOTOR é MOTOR NOVO (dono do
 * produto, 29/10/2026, opção a). A função `superadmin_trocar_arquivo_do_motor` (migração 20261029000001), numa transação só: cria o motor novo
 * (mesmo fornecedor, categoria e família, pela `superadmin_criar_motor`), REAPONTA as etapas do antigo para ele e ARQUIVA o antigo, com as
 * linhas intactas. Um levantamento antigo continua lendo o que leu; os tempos ficam no motor antigo. Apagar e reimportar com o mesmo id
 * (a opção b) é proibido — esta rota não apaga nada.
 *
 * A ORDEM, e cada recusa sai ANTES do passo seguinte:
 *   1. só super admin (404 para os outros), método POST;
 *   2. o corpo (400); o motor existe (404) e não está arquivado (400); o arquivo está na pasta de motor do fornecedor DO MOTOR (400);
 *   3. o objeto está no bucket (409); baixa e lê com o MESMO leitor da criação (422 com todas as frases);
 *   4. chama a função; recusa dela vai com a mensagem dela (42501→403, P0002→404, 22023→400); outro erro é 500 com o código;
 *   5. CONFERE o que a função gravou contra o que foi mandado. Diferente é 500 com os dois lados — nunca sucesso.
 *
 * maxDuration 90, como a criação: ler e parsear o arquivo, levar o corpo ao banco e até 40 s de gravação.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { ErroDaFuncao, obterMotor, trocarArquivoDoMotor } from '@/lib/atendimentos-ia/etapas-da-familia'
import { baixarObjeto, falhaInterna, objetoExiste } from '@/lib/atendimentos-ia/repositorio'
import { metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { fraseDoArquivo } from '@/utils/atendimentos-ia-catalogo'
import { conferirGravacaoDoMotor, lerArquivoDoMotor, montarPayloadDoMotor, type ResultadoDoMotor } from '@/utils/atendimentos-ia-importacao'
import { MOTOR_ARQUIVADO_NAO_SE_EDITA, fraseDoMotorQueNaoFoiGravado, lerCorpoDaTroca, pastaDoMotorDoFornecedor } from '@/utils/atendimentos-ia-catalogo-de-motores'

export const config = { maxDuration: 90 }

type Recusa = Extract<ResultadoDoMotor, { ok: false }>
type Lido = Extract<ResultadoDoMotor, { ok: true }>
const STATUS_DA_FUNCAO: Record<string, number> = { '42501': 403, P0002: 404, '22023': 400 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'POST') return metodoNaoPermitido(res, ['POST'])

    const corpo = lerCorpoDaTroca(req.body)
    if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
    const { motor_id, path, nome } = corpo.corpo

    let bytes: Uint8Array
    try {
        const motor = await obterMotor(motor_id)
        if (!motor) return res.status(404).json({ error: 'Motor não encontrado.' })
        if (motor.arquivado_em !== null) return res.status(400).json({ error: MOTOR_ARQUIVADO_NAO_SE_EDITA })
        if (!path.startsWith(pastaDoMotorDoFornecedor(motor.fornecedor_id)) || path.includes('..')) {
            return res.status(400).json({ error: 'O arquivo não está na pasta de motor do fornecedor deste motor.' })
        }
        if (!(await objetoExiste(path))) return res.status(409).json({ error: fraseDoArquivo(nome, `não está no armazenamento — faltou o caminho ${path}. Envie o arquivo de novo.`) })
        bytes = await baixarObjeto(path)
    } catch (e) {
        return falhaInterna(res, 'trocar arquivo do motor (leitura)', e, 'Não foi possível ler o motor ou baixar o arquivo novo.')
    }

    const leitura = await lerArquivoDoMotor({ nome, bytes })
    if (leitura.ok === false) return res.status(422).json({ error: (leitura as Recusa).erro })
    const lido = leitura as Lido
    const payload = montarPayloadDoMotor(lido)

    let gravado: Record<string, unknown>
    try {
        gravado = await trocarArquivoDoMotor({ por: caller.user_id, motorId: motor_id, arquivoPath: path, arquivoNome: nome, payload })
    } catch (e) {
        const codigo = e instanceof ErroDaFuncao ? e.code : null
        const status = codigo ? STATUS_DA_FUNCAO[codigo] : undefined
        if (status && e instanceof Error && e.message.trim() !== '') return res.status(status).json({ error: e.message })
        return falhaInterna(res, 'trocar arquivo do motor (gravação)', e, fraseDoMotorQueNaoFoiGravado(codigo))
    }

    const divergencia = conferirGravacaoDoMotor(payload, gravado)
    if (divergencia) {
        console.error('atendimentos-ia trocar arquivo do motor: contagem divergente', String(gravado.motor_id), JSON.stringify(divergencia))
        return res.status(500).json({ error: 'A gravação não conferiu com o que foi lido: as contagens diferem. O motor novo NÃO deve ser considerado válido.', ...divergencia })
    }

    return res.status(200).json({
        motor_id: gravado.motor_id,
        motor_antigo: gravado.motor_antigo,
        etapas_reapontadas: gravado.etapas_reapontadas,
        regras: gravado.regras,
        tipologias: gravado.tipologias,
        avisos: lido.avisos,
    })
}
