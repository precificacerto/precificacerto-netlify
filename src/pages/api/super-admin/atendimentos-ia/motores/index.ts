/**
 * GET  /api/super-admin/atendimentos-ia/motores — `{ motores }`: o CATÁLOGO DE MOTORES inteiro (também os arquivados), cada um com fornecedor,
 *      categoria, tipo, arquivo, tipologias e QUEM USA (empresa, família e etapa — só nomes).
 * POST /api/super-admin/atendimentos-ia/motores — `{ fornecedor_id, categoria, familias, path, nome }`: o arquivo de motor enviado (por
 *      `tabelas/url-de-envio` com `tipo: 'motor'`, na pasta de motor DO FORNECEDOR) vira um motor do catálogo. Cria a linha em
 *      `orcamentista_motor`, grava as 12 tabelas por `motor_id` e registra a importação, numa transação só (`superadmin_criar_motor`,
 *      migração 20261028000001, que loga). O motor NÃO aponta etapa nenhuma: quem o seleciona é a etapa, na base de conhecimento da conta.
 *
 * O MOTOR É GLOBAL E COMPARTILHADO (dono do produto, 28/10/2026): "empresas diferentes podem usar o mesmo motor". A Wolf pode ter motor de
 * PERFIL e de PERSIANAS ao mesmo tempo — não há vigente. O motor novo NASCE SEM TEMPO.
 *
 * A ORDEM do POST, e cada recusa sai ANTES do passo seguinte:
 *   1. só super admin (404 para os outros), método GET ou POST;
 *   2. o corpo: fornecedor e categoria presentes; as FAMÍLIAS em que o motor atua, pelo menos uma e sem repetição (20261029000003: o motor
 *      serve N famílias e uma categoria); o caminho na pasta de motor DESTE fornecedor; planilha que a leitura abre (400); cada família está
 *      no catálogo (400 nomeando as que não estão). A família NÃO se amarra a uma tabela da categoria do fornecedor (dono do produto,
 *      29/10/2026: a trava "família só no Perfil, a da tabela de Perfil" caiu);
 *   3. o objeto está no bucket (409, com o caminho que faltou);
 *   4. baixa e lê com o MESMO leitor da importação (`lerArquivoDoMotor`): aba que falta ou valor inválido é 422 com todas as frases;
 *   5. chama a função; recusa dela vai com a mensagem dela (42501→403, P0002→404, 22023→400); outro erro é 500 com o código;
 *   6. CONFERE o que a função gravou contra o que foi mandado, lista por lista. Diferente é 500 com os dois lados — nunca sucesso.
 *      LIMITE: a função já fez COMMIT quando a conferência acontece; o 500 torna a divergência visível, mas não a desfaz.
 *
 * maxDuration 90: ler o arquivo do Storage e parsear (~9 s), levar o corpo ao banco (~19 s medidos para a Wolff) e até 35 s de gravação.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { ErroDaFuncao, criarMotor, lerCatalogoDeMotores } from '@/lib/atendimentos-ia/etapas-da-familia'
import { baixarObjeto, falhaInterna, listarFamilias, objetoExiste } from '@/lib/atendimentos-ia/repositorio'
import { metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { fraseDoArquivo } from '@/utils/atendimentos-ia-catalogo'
import { conferirGravacaoDoMotor, lerArquivoDoMotor, montarPayloadDoMotor, type ResultadoDoMotor } from '@/utils/atendimentos-ia-importacao'
import { familiasForaDoCatalogo, fraseDaFamiliaForaDoCatalogo, fraseDoMotorQueNaoFoiGravado, lerCorpoDoMotorNovo } from '@/utils/atendimentos-ia-catalogo-de-motores'

export const config = { maxDuration: 90 }

type Recusa = Extract<ResultadoDoMotor, { ok: false }>
type Lido = Extract<ResultadoDoMotor, { ok: true }>

/** A recusa da função, por código: a mensagem DELA vai para a tela (ela cita o motivo, nunca o corpo). */
const STATUS_DA_FUNCAO: Record<string, number> = { '42501': 403, P0002: 404, '22023': 400 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET' && req.method !== 'POST') return metodoNaoPermitido(res, ['GET', 'POST'])

    if (req.method === 'GET') {
        try {
            return res.status(200).json({ motores: await lerCatalogoDeMotores() })
        } catch (e) {
            return falhaInterna(res, 'catálogo de motores', e, 'Não foi possível ler o catálogo de motores.')
        }
    }

    const corpo = lerCorpoDoMotorNovo(req.body)
    if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
    const { fornecedor_id, categoria, familias, path, nome } = corpo.corpo

    // cada família está no catálogo — antes de baixar o arquivo (a função confere de novo, e a FK da ligação é a trava)
    let fora: string[]
    try {
        fora = familiasForaDoCatalogo(familias, await listarFamilias())
    } catch (e) {
        return falhaInterna(res, 'motor do catálogo (famílias)', e, 'Não foi possível ler o catálogo de famílias.')
    }
    if (fora.length > 0) return res.status(400).json({ error: fraseDaFamiliaForaDoCatalogo(fora) })

    let bytes: Uint8Array
    try {
        if (!(await objetoExiste(path))) return res.status(409).json({ error: fraseDoArquivo(nome, `não está no armazenamento — faltou o caminho ${path}. Envie o arquivo de novo.`) })
        bytes = await baixarObjeto(path)
    } catch (e) {
        return falhaInterna(res, 'motor do catálogo (download)', e, 'Não foi possível baixar o arquivo do motor.')
    }

    const leitura = await lerArquivoDoMotor({ nome, bytes })
    if (leitura.ok === false) return res.status(422).json({ error: (leitura as Recusa).erro })
    const lido = leitura as Lido
    const payload = montarPayloadDoMotor(lido)

    let gravado: Record<string, unknown>
    const inicio = Date.now()
    try {
        gravado = await criarMotor({ por: caller.user_id, fornecedorId: fornecedor_id, categoria, familias, arquivoPath: path, arquivoNome: nome, payload })
        console.log(`atendimentos-ia motor do catálogo (gravação): ${Date.now() - inicio} ms, gravada`)
    } catch (e) {
        const codigo = e instanceof ErroDaFuncao ? e.code : null
        console.log(`atendimentos-ia motor do catálogo (gravação): ${Date.now() - inicio} ms, falhou (${codigo ?? 'sem código'})`)
        const status = codigo ? STATUS_DA_FUNCAO[codigo] : undefined
        if (status && e instanceof Error && e.message.trim() !== '') return res.status(status).json({ error: e.message })
        return falhaInterna(res, 'motor do catálogo (gravação)', e, fraseDoMotorQueNaoFoiGravado(codigo))
    }

    const divergencia = conferirGravacaoDoMotor(payload, gravado)
    if (divergencia) {
        console.error('atendimentos-ia motor do catálogo: contagem divergente', String(gravado.motor_id), JSON.stringify(divergencia))
        return res.status(500).json({
            error: 'A gravação não conferiu com o que foi lido: as contagens diferem. O motor NÃO deve ser considerado válido.',
            ...divergencia,
        })
    }

    return res.status(200).json({
        motor_id: gravado.motor_id,
        importacao_id: gravado.importacao_id,
        regras: gravado.regras,
        tipologias: gravado.tipologias,
        detalhes: gravado.detalhes,
        avisos: lido.avisos,
    })
}
