/**
 * POST /api/super-admin/atendimentos-ia/contas/[tenantId]/teste-de-anexo — envia um PDF de teste, de uma página, ao
 * remetente autorizado ATIVO da conta, pela conexão do ORÇAMENTISTA. Só o super admin; quem não é recebe 404.
 *
 * POR QUÊ (dono do produto, 26/10/2026): o passo 2 do roteiro da primeira empresa é um arquivo enviado no WhatsApp.
 * "MEÇA ISSO PRIMEIRO, com um envio de teste, antes de construir o resto." Medido antes desta rota: o envio de documento
 * que existe (`sendWuzapiDocument`) só foi chamado com o token do USUÁRIO, nunca com o da conexão do orçamentista, e
 * `whatsapp_dispatches` está vazia. Esta rota é o instrumento da medição.
 *
 * O token da conexão é segredo: quem o usa é o servidor, e ele não sai na resposta nem no log. O telefone também não:
 * a resposta e a linha de log levam só se foi, o status do WUZAPI, o tamanho do arquivo e o tempo. O texto de erro do
 * WUZAPI vai à resposta sem sequência longa de dígitos (ele pode citar o número).
 *
 * Sem remetente ativo, ou com mais de um, a rota recusa dizendo quantos: nunca escolhe "o primeiro".
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { jsPDF } from 'jspdf'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'
import { normalizePhoneBR } from '@/lib/wuzapi-send'
import { CANAL_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'

const PREFIXO_DO_LOG = '[IA]'
const wuzapi = () => (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')
const semTelefone = (t: string) => t.replace(/\d{8,}/g, '…').slice(0, 300)

/** O PDF de teste: uma página, sem dado de cliente nem valor. */
function pdfDeTeste(agora: Date): Buffer {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Teste de anexo — Agentes I.A.', 20, 25)
    doc.setFontSize(11)
    doc.text('Este arquivo confirma que a conexão do orçamentista envia documentos pelo WhatsApp.', 20, 40)
    doc.text(`Enviado em ${agora.toISOString()}.`, 20, 50)
    return Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        return res.status(405).json({ error: 'Method not allowed' })
    }
    const { tenantId } = req.query as { tenantId?: string }
    if (!ehUuid(tenantId)) return res.status(404).json({ error: 'Conta não encontrada.' })
    const { data: conta } = await supabaseAdmin.from('tenants').select('id').eq('id', tenantId).maybeSingle()
    if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' })

    const { data: conexao } = await supabaseAdmin.from('whatsapp_conexao').select('wuzapi_token, ativo')
        .eq('tenant_id', tenantId).eq('canal', CANAL_DO_ORCAMENTISTA).maybeSingle()
    const token = conexao && (conexao as { ativo?: boolean }).ativo ? (conexao as { wuzapi_token?: string | null }).wuzapi_token : null
    if (!token) return res.status(409).json({ error: 'A conta não tem a conexão do orçamentista ativa: conecte o WhatsApp em Conectividade e tente de novo.' })

    const { data: remetentes } = await supabaseAdmin.from('orcamentista_remetente_autorizado').select('telefone')
        .eq('tenant_id', tenantId).eq('ativo', true)
    const ativos = (remetentes ?? []) as Array<{ telefone: string }>
    if (ativos.length === 0) return res.status(409).json({ error: 'A conta tem nenhum remetente autorizado ativo: não há a quem enviar o teste.' })
    if (ativos.length > 1) return res.status(409).json({ error: `A conta tem ${ativos.length} remetentes autorizados ativos: deixe só um ativo para o teste.` })

    const arquivo = pdfDeTeste(new Date())
    const corpo = (phone: string) => JSON.stringify({ Phone: phone, FileName: 'teste-de-anexo.pdf', Document: `data:application/octet-stream;base64,${arquivo.toString('base64')}` })
    const inicio = Date.now()
    let status = 0
    let texto = ''
    // as variantes do número brasileiro (com e sem o nono dígito), como o envio de documento que já existe
    for (const phone of normalizePhoneBR(ativos[0].telefone)) {
        const r = await fetch(`${wuzapi()}/chat/send/document`, { method: 'POST', headers: { 'Content-Type': 'application/json', token }, body: corpo(phone) })
        status = r.status
        texto = await r.text().catch(() => '')
        if (r.ok || !/no LID found|not registered|not on WhatsApp/.test(texto)) break
    }
    const ms = Date.now() - inicio
    const enviado = status >= 200 && status < 300
    console.error(`${PREFIXO_DO_LOG} teste-de-anexo enviado=${enviado ? 'sim' : 'nao'} status=${status} bytes=${arquivo.length} ms=${ms}`)
    if (enviado) return res.status(200).json({ enviado: true, status, bytes: arquivo.length, ms })
    return res.status(502).json({ enviado: false, status, bytes: arquivo.length, ms, detalhe: semTelefone(texto) })
}
