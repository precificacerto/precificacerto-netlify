/**
 * Atendimentos I.A. — o ORÇAMENTISTA DA EMPRESA, do lado do servidor: a trava da seção, a
 * conexão de WhatsApp do canal ORCAMENTISTA, e a lista de quem pode falar com ele.
 *
 * Maquete aprovada pelo dono do produto em 21/10/2026 (a célula do orçamentista em Conectividade).
 *
 * ══ TUDO PELO SERVIDOR, E O TENANT É SEMPRE O DO USUÁRIO LOGADO ══
 * `whatsapp_conexao` e `orcamentista_remetente_autorizado` têm REVOKE ALL de anon e authenticated:
 * o navegador não as alcança. As rotas usam `service_role`, e o tenant vem de `getCallerContext`
 * — NENHUMA função daqui recebe tenant do corpo da requisição.
 * A SEÇÃO só existe para o tenant com `orcamentista_config.ativo = true`: sem isso, 404. Quem
 * decide é o servidor; a tela escondida não é trava.
 *
 * ══ A CONEXÃO DO ORÇAMENTISTA NUNCA ENCOSTA EM users.wuzapi_token ══
 * O QR do orçamentista cria uma INSTÂNCIA SEPARADA no WUZAPI, e o token dela vai para
 * `whatsapp_conexao` (tenant, canal ORCAMENTISTA). O número de envio é por usuário e mora em
 * `users.wuzapi_token`; o do orçamentista é da empresa. São duas caixas de entrada que não se
 * encostam — este arquivo não lê nem escreve `users.wuzapi_token`, e um portão prova isso.
 * Reconectar SUBSTITUI a linha daquele tenant e canal (UNIQUE (tenant_id, canal)), e não toca na
 * lista de autorizados.
 *
 * ══ A LISTA: OS FUNCIONÁRIOS ATIVOS, E A AUTORIZAÇÃO DE CADA UM ══
 * Mostra todos os funcionários ativos (`is_active = true`, `status = 'ACTIVE'`). O telefone é dado
 * do funcionário — não há número avulso nesta tela. Ligar grava o telefone NORMALIZADO
 * (`telefoneDoAutorizado`); desligar é UPDATE `ativo = false`, NUNCA DELETE — o banco recusa
 * excluir quem tem conversa, e o histórico fica. Telefone do cadastro diferente do autorizado é
 * DIVERGÊNCIA: a tela avisa e oferece atualizar, e nada se sincroniza sozinho. A divergência
 * compara por `telefonesCasam`: o mesmo número com e sem o 55 não é divergência.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-celula-do-orcamentista.test.ts`.
 */
import { randomUUID } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'

import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { podeEditarModulo, podeVerModulo, type ChamadorAutorizado } from '@/lib/permissao-do-modulo'
import { telefoneDoAutorizado, telefonesCasam } from '@/utils/atendimentos-ia-telefone-do-autorizado'

/** O módulo da tela de Conectividade — o mesmo que esconde o item do menu. */
export const MODULO_DA_TELA = 'connectivity'
export const CANAL_DO_ORCAMENTISTA = 'ORCAMENTISTA' as const

export const MOTIVO_SECAO_DESLIGADA = 'O Atendimentos I.A. não está ligado nesta conta.'

const wuzapi = () => (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

// ── A trava da seção ───────────────────────────────────────────────────────────────────────
/**
 * O chamador, se a seção estiver ligada para o tenant DELE e ele puder ver (ou editar) a tela.
 * Responde sozinho e devolve null nos outros casos: 401/403 de `getCallerContext`, 404 com a
 * seção desligada, 403 sem permissão.
 */
export async function chamadorDoOrcamentista(
    req: NextApiRequest,
    res: NextApiResponse,
    acesso: 'ver' | 'editar',
): Promise<ChamadorAutorizado | null> {
    const caller = await getCallerContext(req, res)
    if (!caller) return null
    const { data: cfg, error } = await supabaseAdmin
        .from('orcamentista_config').select('ativo').eq('tenant_id', caller.tenant_id).maybeSingle()
    if (error) { res.status(500).json({ error: 'Não foi possível ler a configuração do Atendimentos I.A.' }); return null }
    if (!cfg || cfg.ativo !== true) { res.status(404).json({ error: MOTIVO_SECAO_DESLIGADA }); return null }
    const permitido = acesso === 'ver'
        ? await podeVerModulo(caller as ChamadorAutorizado, MODULO_DA_TELA)
        : await podeEditarModulo(caller as ChamadorAutorizado, MODULO_DA_TELA)
    if (!permitido) { res.status(403).json({ error: 'Sem permissão para esta ação em Conectividade.' }); return null }
    return caller as ChamadorAutorizado
}

// ── A conexão do canal ORCAMENTISTA ────────────────────────────────────────────────────────
export interface ConexaoDoOrcamentista {
    wuzapi_token: string
    conectado_por: string | null
    conectado_em: string
    ativo: boolean
}

export async function lerConexao(tenantId: string): Promise<ConexaoDoOrcamentista | null> {
    const { data, error } = await supabaseAdmin
        .from('whatsapp_conexao')
        .select('wuzapi_token, conectado_por, conectado_em, ativo')
        .eq('tenant_id', tenantId)
        .eq('canal', CANAL_DO_ORCAMENTISTA)
        .maybeSingle()
    if (error) throw new Error(`whatsapp_conexao: ${error.message}`)
    return (data as ConexaoDoOrcamentista | null) ?? null
}

/** Grava a conexão do canal — SUBSTITUI a do tenant, pela UNIQUE (tenant_id, canal). */
export async function gravarConexao(tenantId: string, campos: Omit<ConexaoDoOrcamentista, 'conectado_em'> & { conectado_em?: string }) {
    const { error } = await supabaseAdmin
        .from('whatsapp_conexao')
        .upsert({ tenant_id: tenantId, canal: CANAL_DO_ORCAMENTISTA, ...campos }, { onConflict: 'tenant_id,canal' })
    if (error) throw new Error(`whatsapp_conexao: ${error.message}`)
}

export async function marcarConexao(tenantId: string, campos: Partial<Pick<ConexaoDoOrcamentista, 'ativo' | 'conectado_em'>>) {
    const { error } = await supabaseAdmin
        .from('whatsapp_conexao').update(campos).eq('tenant_id', tenantId).eq('canal', CANAL_DO_ORCAMENTISTA)
    if (error) throw new Error(`whatsapp_conexao: ${error.message}`)
}

/** O nome de quem conectou — só o nome, para o cabeçalho do card. */
export async function nomeDoUsuario(userId: string, tenantId: string): Promise<string | null> {
    const { data } = await supabaseAdmin.from('users').select('name').eq('id', userId).eq('tenant_id', tenantId).maybeSingle()
    return (data as { name?: string } | null)?.name ?? null
}

// ── O WUZAPI ───────────────────────────────────────────────────────────────────────────────
/** Um token novo para a instância do orçamentista — nunca o de um usuário. */
export const tokenNovo = () => `orc_${randomUUID().replace(/-/g, '')}`

/** Cria a instância SEPARADA do orçamentista (`POST /admin/users`, com o token de admin). */
export async function criarInstancia(token: string, tenantId: string): Promise<boolean> {
    const admin = process.env.WUZAPI_ADMIN_TOKEN
    if (!admin) return false
    const r = await fetch(`${wuzapi()}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: admin },
        body: JSON.stringify({ name: `orcamentista-${tenantId}`, token, events: 'Message' }),
    })
    return r.ok
}

/** `GET /session/status` → logado ou não; null quando o WUZAPI não respondeu. */
export async function sessaoLogada(token: string): Promise<boolean | null> {
    try {
        const r = await fetch(`${wuzapi()}/session/status`, { method: 'GET', headers: { token } })
        if (!r.ok) return null
        const corpo = (await r.json().catch((): null => null)) as { data?: Record<string, unknown> } | null
        const d = corpo?.data ?? {}
        return d.LoggedIn === true || d.loggedIn === true || d.IsLoggedIn === true
    } catch {
        return null
    }
}

/** Liga a sessão assinando `Message` e devolve o QR, se houver. */
export async function qrDaInstancia(token: string): Promise<string | null> {
    await fetch(`${wuzapi()}/session/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token },
        body: JSON.stringify({ Subscribe: ['Message'], Immediate: true }),
    })
    const r = await fetch(`${wuzapi()}/session/qr`, { method: 'GET', headers: { token } })
    if (!r.ok) return null
    const corpo = (await r.json().catch((): null => null)) as { data?: { QRCode?: unknown; qrcode?: unknown } } | null
    const qr = corpo?.data?.QRCode ?? corpo?.data?.qrcode ?? null
    return typeof qr === 'string' && qr.trim() ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr.trim()}`) : null
}

/** `POST /session/logout` — termina a sessão; o próximo connect pede QR de novo. */
export async function sairDaInstancia(token: string): Promise<boolean> {
    try {
        const r = await fetch(`${wuzapi()}/session/logout`, { method: 'POST', headers: { token } })
        return r.ok
    } catch {
        return false
    }
}

// ── A lista de quem pode falar com o orçamentista ──────────────────────────────────────────
interface Funcionario { id: string; name: string | null; position: string | null; phone: string | null }
interface Autorizacao { id: string; telefone: string; nome: string | null; employee_id: string | null; ativo: boolean }

export interface LinhaDaLista {
    employee_id: string
    nome: string | null
    cargo: string | null
    /** A forma normalizada do telefone do cadastro; NULL quando ele não é telefone. */
    telefone: string | null
    /** Por que o funcionário está "sem telefone" — NULL quando tem. */
    motivoSemTelefone: string | null
    autorizacao: { id: string; telefone: string; ativo: boolean } | null
    /** O telefone do cadastro é diferente do que está autorizado. */
    divergente: boolean
    /** A chave pode ser LIGADA (tem telefone) ou DESLIGADA (está ligada). */
    podeLigar: boolean
    podeDesligar: boolean
}

export async function listarQuemPodeFalar(tenantId: string): Promise<LinhaDaLista[]> {
    const { data: funcs, error: e1 } = await supabaseAdmin
        .from('employees').select('id, name, position, phone')
        .eq('tenant_id', tenantId).eq('is_active', true).eq('status', 'ACTIVE').order('name')
    if (e1) throw new Error(`employees: ${e1.message}`)
    const { data: auts, error: e2 } = await supabaseAdmin
        .from('orcamentista_remetente_autorizado').select('id, telefone, nome, employee_id, ativo').eq('tenant_id', tenantId)
    if (e2) throw new Error(`orcamentista_remetente_autorizado: ${e2.message}`)
    const porFuncionario = new Map(((auts ?? []) as Autorizacao[]).filter((a) => a.employee_id).map((a) => [a.employee_id as string, a]))
    return ((funcs ?? []) as Funcionario[]).map((f) => {
        const tel = telefoneDoAutorizado(f.phone)
        const a = porFuncionario.get(f.id) ?? null
        return {
            employee_id: f.id,
            nome: f.name,
            cargo: f.position,
            telefone: tel.ok ? tel.telefone : null,
            motivoSemTelefone: tel.ok ? null : (tel as { motivo: string }).motivo,
            autorizacao: a ? { id: a.id, telefone: a.telefone, ativo: a.ativo } : null,
            divergente: !!a && tel.ok && !telefonesCasam(f.phone, a.telefone),
            podeLigar: tel.ok && !(a?.ativo),
            podeDesligar: a?.ativo === true,
        }
    })
}

export type AcaoNaLista = 'ligar' | 'desligar' | 'atualizar-telefone'
export type Resposta = { status: number; corpo: Record<string, unknown> }

const conflitoDeTelefone = (e: { code?: string } | null) => e?.code === '23505'

/**
 * A ação na linha de um funcionário DO TENANT do chamador. Desligar é UPDATE, nunca DELETE.
 * Funcionário sem telefone não liga nem atualiza: nada é gravado.
 */
export async function aplicarAcao(tenantId: string, employeeId: string, acao: AcaoNaLista): Promise<Resposta> {
    const { data: f } = await supabaseAdmin
        .from('employees').select('id, name, phone')
        .eq('id', employeeId).eq('tenant_id', tenantId).eq('is_active', true).eq('status', 'ACTIVE').maybeSingle()
    const func = f as Pick<Funcionario, 'id' | 'name' | 'phone'> | null
    if (!func) return { status: 404, corpo: { error: 'Funcionário não encontrado entre os ativos desta conta.' } }

    const { data: atual } = await supabaseAdmin
        .from('orcamentista_remetente_autorizado').select('id, telefone, ativo')
        .eq('tenant_id', tenantId).eq('employee_id', employeeId).maybeSingle()
    const aut = atual as Pick<Autorizacao, 'id' | 'telefone' | 'ativo'> | null
    const tel = telefoneDoAutorizado(func.phone)

    if (acao === 'desligar') {
        if (!aut || !aut.ativo) return { status: 200, corpo: { ok: true } }
        const { error } = await supabaseAdmin
            .from('orcamentista_remetente_autorizado').update({ ativo: false }).eq('id', aut.id).eq('tenant_id', tenantId)
        if (error) return { status: 500, corpo: { error: `Não foi possível desligar: ${error.message}` } }
        return { status: 200, corpo: { ok: true } }
    }

    if (!tel.ok) return { status: 422, corpo: { error: `Sem telefone: ${(tel as { motivo: string }).motivo}. Corrija no cadastro do funcionário.` } }
    const telefone = (tel as { telefone: string }).telefone

    if (acao === 'atualizar-telefone') {
        if (!aut) return { status: 404, corpo: { error: 'Este funcionário ainda não tem autorização para atualizar.' } }
        const { error } = await supabaseAdmin
            .from('orcamentista_remetente_autorizado').update({ telefone }).eq('id', aut.id).eq('tenant_id', tenantId)
        if (conflitoDeTelefone(error)) return { status: 409, corpo: { error: 'Este telefone já está autorizado para outra pessoa nesta conta.' } }
        if (error) return { status: 500, corpo: { error: `Não foi possível atualizar: ${error.message}` } }
        return { status: 200, corpo: { ok: true } }
    }

    // ligar
    const { error } = aut
        ? await supabaseAdmin.from('orcamentista_remetente_autorizado').update({ ativo: true }).eq('id', aut.id).eq('tenant_id', tenantId)
        : await supabaseAdmin.from('orcamentista_remetente_autorizado').insert({ tenant_id: tenantId, telefone, nome: func.name, employee_id: employeeId, ativo: true })
    if (conflitoDeTelefone(error)) return { status: 409, corpo: { error: 'Este telefone já está autorizado para outra pessoa nesta conta.' } }
    if (error) return { status: 500, corpo: { error: `Não foi possível ligar: ${error.message}` } }
    return { status: 200, corpo: { ok: true } }
}
