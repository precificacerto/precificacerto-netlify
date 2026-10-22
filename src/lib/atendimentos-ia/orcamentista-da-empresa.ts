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
 * compara por `telefonesCasam`: o mesmo número com e sem o 55 não é divergência. LIGAR com
 * divergência RECUSA (409) — religar autorizaria o número antigo.
 *
 * ══ O TOKEN NÃO SAI DO SERVIDOR ══
 * `lerConexao` devolve `wuzapi_token`, que fala pelo WhatsApp da empresa. Nenhuma rota devolve o
 * objeto da conexão: as respostas são montadas campo a campo, e um portão varre o JSON inteiro.
 *
 * ══ O CAMINHO DO QR DEIXA RASTRO ══
 * Cada chamada ao WUZAPI do QR — `POST /admin/users`, `POST /session/connect`, `GET /session/qr` —
 * anota UMA linha `[QR-ORCAMENTISTA] passo=<passo>` com o status e o que voltou, ou o motivo da
 * exceção de rede. Antes (até 21/10/2026) as três devolviam null/false em silêncio, e a falha em
 * produção não deixou linha nenhuma. NUNCA vai para o log: o token da instância, o de admin, nem
 * o QR — que também é credencial: quem o lê liga o WhatsApp da empresa. Máscara:
 * `src/utils/atendimentos-ia-mascara-do-log.ts`.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-celula-do-orcamentista.test.ts`.
 */
import { randomUUID } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'

import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { podeEditarModulo, podeVerModulo, type ChamadorAutorizado } from '@/lib/permissao-do-modulo'
import { numeroDoJid, telefoneDoAutorizado, telefoneMascarado, telefonesCasam } from '@/utils/atendimentos-ia-telefone-do-autorizado'
import { paraOLog } from '@/utils/atendimentos-ia-mascara-do-log'

/** O módulo da tela de Conectividade — o mesmo que esconde o item do menu. A célula usa este. */
export const MODULO_DA_TELA = 'connectivity'
/**
 * O módulo da seção Atendimentos I.A. do tenant — o item "Orçamentista" do menu e a página
 * `/atendimentos-ia/orcamentista` (21/10/2026). É `MODULES.ORCAMENTISTA`, escrito aqui porque o
 * hook de permissões é código de navegador; um portão afirma que as duas são a mesma chave.
 */
export const MODULO_DO_ORCAMENTISTA = 'orcamentista'
export const CANAL_DO_ORCAMENTISTA = 'ORCAMENTISTA' as const

export const MOTIVO_SECAO_DESLIGADA = 'O Atendimentos I.A. não está ligado nesta conta.'

const wuzapi = () => (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

// ── A trava da seção ───────────────────────────────────────────────────────────────────────
/**
 * O chamador, se a seção estiver ligada para o tenant DELE e ele puder ver (ou editar) a tela.
 * Responde sozinho e devolve null nos outros casos: 401/403 de `getCallerContext`, 404 com a
 * seção desligada, 403 sem permissão.
 *
 * `modulo` é o da tela que chama: a célula de Conectividade fica no padrão (`connectivity`), e a
 * página da seção Atendimentos I.A. passa `MODULO_DO_ORCAMENTISTA`.
 */
export async function chamadorDoOrcamentista(
    req: NextApiRequest,
    res: NextApiResponse,
    acesso: 'ver' | 'editar',
    modulo: string = MODULO_DA_TELA,
): Promise<ChamadorAutorizado | null> {
    const caller = await getCallerContext(req, res)
    if (!caller) return null
    const { data: cfg, error } = await supabaseAdmin
        .from('orcamentista_config').select('ativo').eq('tenant_id', caller.tenant_id).maybeSingle()
    if (error) { res.status(500).json({ error: 'Não foi possível ler a configuração do Atendimentos I.A.' }); return null }
    if (!cfg || cfg.ativo !== true) { res.status(404).json({ error: MOTIVO_SECAO_DESLIGADA }); return null }
    const permitido = acesso === 'ver'
        ? await podeVerModulo(caller as ChamadorAutorizado, modulo)
        : await podeEditarModulo(caller as ChamadorAutorizado, modulo)
    if (!permitido) {
        const tela = modulo === MODULO_DA_TELA ? 'em Conectividade' : 'no Orçamentista'
        res.status(403).json({ error: `Sem permissão para esta ação ${tela}.` })
        return null
    }
    return caller as ChamadorAutorizado
}

// ── A conexão do canal ORCAMENTISTA ────────────────────────────────────────────────────────
export interface ConexaoDoOrcamentista {
    wuzapi_token: string
    /**
     * O segredo da URL de entrada (`/api/atendimentos-ia/inbound?c=`). NULL só em linha gravada
     * antes da migração `20261022000001` — a rota do QR dá um a ela no próximo clique.
     */
    webhook_segredo: string | null
    conectado_por: string | null
    conectado_em: string
    ativo: boolean
}

export async function lerConexao(tenantId: string): Promise<ConexaoDoOrcamentista | null> {
    const { data, error } = await supabaseAdmin
        .from('whatsapp_conexao')
        .select('wuzapi_token, webhook_segredo, conectado_por, conectado_em, ativo')
        .eq('tenant_id', tenantId)
        .eq('canal', CANAL_DO_ORCAMENTISTA)
        .maybeSingle()
    if (error) throw new Error(`whatsapp_conexao: ${error.message}`)
    return (data as ConexaoDoOrcamentista | null) ?? null
}

/**
 * Grava a conexão do canal — SUBSTITUI a do tenant, pela UNIQUE (tenant_id, canal).
 *
 * O `webhook_segredo` é OBRIGATÓRIO e não nulo aqui, de propósito: toda linha que o sistema grava
 * sai com segredo, e o compilador recusa quem esquecer (`construtor-empobrecido.md`). Quem cria a
 * linha gera um com `segredoNovo()`; quem a reusa passa o que ela já tem.
 */
export async function gravarConexao(
    tenantId: string,
    campos: Omit<ConexaoDoOrcamentista, 'conectado_em' | 'webhook_segredo'> & { webhook_segredo: string; conectado_em?: string },
) {
    const { error } = await supabaseAdmin
        .from('whatsapp_conexao')
        .upsert({ tenant_id: tenantId, canal: CANAL_DO_ORCAMENTISTA, ...campos }, { onConflict: 'tenant_id,canal' })
    if (error) throw new Error(`whatsapp_conexao: ${error.message}`)
}

/**
 * `numero` NÃO está em `ConexaoDoOrcamentista` de propósito: a coluna nasce na migração
 * `20261021000002`, e `lerConexao` não a seleciona — ler uma coluna que não existe derrubaria a
 * leitura da conexão inteira. Aqui ela só é ESCRITA, pelo QR.
 */
export async function marcarConexao(tenantId: string, campos: Partial<Pick<ConexaoDoOrcamentista, 'ativo' | 'conectado_em'>> & { numero?: string | null }) {
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

/**
 * O segredo da URL de entrada de uma conexão: 32 hexadecimais, de um `randomUUID` PRÓPRIO — a mesma
 * forma do token, e um valor INDEPENDENTE dele. Nunca se deriva um do outro: o token é a credencial
 * do WUZAPI (vai no header `token:`); o segredo vai na URL, que cai em log de acesso, e só abre a
 * rota de entrada. Quem lê um não pode chegar ao outro.
 */
export const segredoNovo = () => randomUUID().replace(/-/g, '')

export const PREFIXO_DO_LOG_DO_QR = '[QR-ORCAMENTISTA]'
export type PassoDoQr = 'instancia' | 'session-status' | 'criar-instancia' | 'webhook' | 'session-connect' | 'session-qr'
const LIMITE_DO_CORPO_NO_LOG = 2048

/**
 * Uma linha do rastro do QR — já sem os segredos que o chamador conhece, e mascarada.
 *
 * Sai em `console.error` (stderr) DE PROPÓSITO, não por ser erro: medido em produção em 21/10/2026,
 * o log da Vercel deste projeto só exibe stderr — as linhas em `console.log` não apareceram, e
 * instrumentação que não chega ao log não é instrumentação. Não troque de volta para `console.log`.
 * O `host=` diz a QUAL servidor de WhatsApp a chamada foi; o host não é segredo, o token é.
 */
export function anotarPassoDoQr(passo: PassoDoQr, texto: string, segredos: Array<string | null | undefined>) {
    console.error(`${PREFIXO_DO_LOG_DO_QR} passo=${passo} host=${hostDoWuzapi()} ${paraOLog(texto, [...segredos, process.env.WUZAPI_ADMIN_TOKEN])}`)
}

function hostDoWuzapi(): string {
    try { return new URL(wuzapi()).host } catch { return 'invalido' }
}

/** O corpo da resposta, para o log: o texto cru quando der, senão o JSON; `null` sem corpo. */
async function lerCorpo(r: Response): Promise<{ texto: string | null; json: unknown }> {
    try {
        if (typeof r.text === 'function') {
            const texto = await r.text()
            if (!texto) return { texto: null, json: null }
            try { return { texto, json: JSON.parse(texto) } } catch { return { texto, json: null } }
        }
        const json = await r.json()
        return json === undefined || json === null ? { texto: null, json: null } : { texto: JSON.stringify(json), json }
    } catch {
        return { texto: null, json: null }
    }
}
const corte = (t: string | null) => (t === null ? '(sem corpo)' : t.length > LIMITE_DO_CORPO_NO_LOG ? `${t.slice(0, LIMITE_DO_CORPO_NO_LOG)}…` : t)
const motivoDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

export type CriacaoDaInstancia = { ok: true } | { ok: false; semAdmin: boolean }

/** Cria a instância SEPARADA do orçamentista (`POST /admin/users`, com o token de admin). */
export async function criarInstancia(token: string, tenantId: string): Promise<CriacaoDaInstancia> {
    const admin = process.env.WUZAPI_ADMIN_TOKEN
    if (!admin) {
        anotarPassoDoQr('criar-instancia', 'não chamado: WUZAPI_ADMIN_TOKEN ausente no ambiente', [token])
        return { ok: false, semAdmin: true }
    }
    try {
        const r = await fetch(`${wuzapi()}/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: admin },
            body: JSON.stringify({ name: `orcamentista-${tenantId}`, token, events: 'Message' }),
        })
        const { texto } = await lerCorpo(r)
        anotarPassoDoQr('criar-instancia', `POST /admin/users status=${r.status} corpo=${corte(texto)}`, [token, admin])
        return r.ok ? { ok: true } : { ok: false, semAdmin: false }
    } catch (e) {
        anotarPassoDoQr('criar-instancia', `POST /admin/users excecao=${motivoDe(e)}`, [token, admin])
        return { ok: false, semAdmin: false }
    }
}

/** `GET /session/status` → logado ou não; null quando o WUZAPI não respondeu. */
export async function sessaoLogada(token: string): Promise<boolean | null> {
    return (await estadoDaSessao(token)).logada
}

/**
 * `GET /session/status`, com o STATUS HTTP: `logada` é true/false, ou null quando o WUZAPI não
 * respondeu; `status` é o código HTTP (null em exceção de rede). **401 = o WUZAPI não conhece este
 * token** — é assim que o token fantasma aparece (medido em produção pelo dono do produto em
 * 21/10/2026: `/session/connect` e `/session/qr` davam 401 para o token gravado).
 */
export async function estadoDaSessao(token: string): Promise<{ logada: boolean | null; status: number | null }> {
    try {
        const r = await fetch(`${wuzapi()}/session/status`, { method: 'GET', headers: { token } })
        if (!r.ok) return { logada: null, status: r.status }
        const corpo = (await r.json().catch((): null => null)) as { data?: Record<string, unknown> } | null
        const d = corpo?.data ?? {}
        return { logada: d.LoggedIn === true || d.loggedIn === true || d.IsLoggedIn === true, status: r.status }
    } catch {
        return { logada: null, status: null }
    }
}

// ── O WEBHOOK DA INSTÂNCIA ──────────────────────────────────────────────────────────────────
/**
 * Os eventos que a instância entrega ao webhook. OBRIGATÓRIO no `POST /webhook`: medido em produção
 * em 22/10/2026, o POST SEM o campo "events" ZERA a lista de eventos da instância, e o WUZAPI passa
 * a descartar toda mensagem com "Skipping webhook. Not subscribed for this type".
 */
export const EVENTOS_DO_WEBHOOK = ['Message'] as const

/**
 * A origem do sistema para a URL de entrada — da configuração, NUNCA do cabeçalho da requisição:
 * quem chama a rota não escolhe para onde o WUZAPI vai entregar as mensagens. O padrão é o de
 * `src/pages/api/super-admin/create-admin.ts`.
 */
const origemDoSistema = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.precificacerto.com').replace(/\/+$/, '')

/** A URL que o WUZAPI chama a cada mensagem: a rota de entrada, com o segredo da conexão. */
export const urlDeEntrada = (segredo: string) => `${origemDoSistema()}/api/atendimentos-ia/inbound?c=${segredo}`

/**
 * Aponta o webhook da instância para a rota de entrada: `POST /webhook` com o token da instância no
 * header e `{ webhookURL, events }` no corpo. Devolve se o WUZAPI respondeu 2xx — sem isso a conexão
 * não está pronta: as mensagens não chegariam a lugar nenhum.
 *
 * O log leva o host e o status — NUNCA o token, o segredo ou a URL (que contém o segredo).
 */
export async function apontarWebhook(token: string, segredo: string): Promise<boolean> {
    try {
        const r = await fetch(`${wuzapi()}/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token },
            body: JSON.stringify({ webhookURL: urlDeEntrada(segredo), events: [...EVENTOS_DO_WEBHOOK] }),
        })
        anotarPassoDoQr('webhook', `POST /webhook status=${r.status}`, [token, segredo])
        return r.ok
    } catch (e) {
        anotarPassoDoQr('webhook', `POST /webhook excecao=${motivoDe(e)}`, [token, segredo])
        return false
    }
}

/** O 401 do WUZAPI: o servidor não conhece o token. */
export const NAO_AUTORIZADO = 401

/**
 * Descarta a conexão gravada com um token que o WUZAPI não reconhece. Credencial que o servidor não
 * conhece não fica guardada. Só apaga a linha COM AQUELE TOKEN — uma reconexão no meio não é levada
 * junto. Não toca na lista de autorizados.
 */
export async function descartarConexao(tenantId: string, token: string) {
    const { error } = await supabaseAdmin
        .from('whatsapp_conexao').delete()
        .eq('tenant_id', tenantId).eq('canal', CANAL_DO_ORCAMENTISTA).eq('wuzapi_token', token)
    if (error) throw new Error(`whatsapp_conexao: ${error.message}`)
}

/**
 * A espera pelo QR depois do `/session/connect` com 2xx. Medido em produção em 22/10/2026 00:14
 * UTC: connect 200 "Connected!", e o `/session/qr` 200 com `QRCode` VAZIO logo em seguida.
 *
 * O que o fonte do WUZAPI (asternic/wuzapi, `handlers.go` e `wmiau.go`) mostra, e por que a espera:
 *   - o connect com `Immediate: true` — o que esta rota manda — dispara `startClient` numa goroutine
 *     e responde NA HORA, sem esperar o cliente subir nem o QR existir;
 *   - o QR só é gravado (`UPDATE users SET qrcode=...`) quando o canal do whatsmeow emite o evento
 *     "code", depois de o socket conectar. Até lá, `GET /session/qr` responde 200 com `QRCode: ""`
 *     (não há checagem de vazio) ou 500 "not connected", se o socket ainda não subiu;
 *   - o fonte NÃO DIZ em quanto tempo o primeiro "code" chega. O único atraso fixo do fluxo é o do
 *     connect SEM `Immediate`: o próprio WUZAPI espera 10 segundos para considerar o cliente
 *     conectado. Daí o teto de 12 s — acima dessa espera do próprio servidor, com margem — e a
 *     consulta a cada 1,5 s: no máximo 9 consultas, leves, por clique.
 * O teto fica em no máximo metade do `maxDuration` declarado na rota (`qr.ts`), e há portão disso.
 */
export const ESPERA_DO_QR = { intervaloMs: 1500, tetoMs: 12000 }

/** O relógio da espera — trocado por um virtual nos testes, para não esperarem de verdade. */
export const relogioDoQr = {
    agora: (): number => Date.now(),
    dormir: (ms: number): Promise<void> => new Promise<void>((ok) => setTimeout(ok, ms)),
}

/** Uma consulta ao `/session/qr`, com a sua linha no log. O QR em si NUNCA vai para o log. */
async function consultarQr(token: string, tentativa: number): Promise<{ qr: string | null; naoAutorizado: boolean; status: number | null }> {
    try {
        const r = await fetch(`${wuzapi()}/session/qr`, { method: 'GET', headers: { token } })
        const { texto, json } = await lerCorpo(r)
        const d = (json as { data?: { QRCode?: unknown; qrcode?: unknown } } | null)?.data
        const bruto = d?.QRCode ?? d?.qrcode ?? null
        const qr = r.ok && typeof bruto === 'string' && bruto.trim() ? (bruto.startsWith('data:') ? bruto : `data:image/png;base64,${bruto.trim()}`) : null
        const chaves = d && typeof d === 'object' ? Object.keys(d).join(',') : '-'
        // Sem 2xx, o TEXTO do erro vai junto: é ele que separa "no session" (sessão desmontada) de
        // "not connected" (cliente vivo, socket caído). Passa pela máscara como o resto da linha.
        const erro = r.ok ? '' : ` erro=${corte(texto)}`
        anotarPassoDoQr('session-qr', `GET /session/qr tentativa=${tentativa} status=${r.status} veio_corpo=${json ? 'sim' : 'nao'} veio_qr=${qr ? 'sim' : 'nao'} campos_de_data=${chaves}${erro}`, [token])
        return { qr, naoAutorizado: r.status === NAO_AUTORIZADO, status: r.status }
    } catch (e) {
        anotarPassoDoQr('session-qr', `GET /session/qr tentativa=${tentativa} excecao=${motivoDe(e)}`, [token])
        return { qr: null, naoAutorizado: false, status: null }
    }
}

/**
 * Liga a sessão assinando `Message` e devolve o QR, se houver, e o NÚMERO da instância, lido do
 * `jid` da resposta do `/session/connect` (`numeroDoJid`). Sem jid legível, `numero` é NULL —
 * não se inventa. (Antes do QR ser lido a sessão ainda não tem usuário, e é de esperar que o jid
 * venha vazio.)
 *
 * O `/session/qr` é pedido MESMO com o connect falhando: a sessão pode já estar aberta, esperando
 * a leitura de um clique anterior, e aí o QR vem. `connectOk` diz à rota qual passo culpar quando
 * o QR não vem.
 *
 * Com o connect em 2xx, o QR vazio é ESPERADO (ver `ESPERA_DO_QR`): a primeira consulta é imediata
 * e, vindo sem código, consulta-se de novo a cada intervalo até o teto — parando na primeira que
 * trouxer o código, ou num 401, que nenhuma espera resolve. Com o connect falhando, uma consulta
 * só, como sempre. `tentativas` e `esperaMs` dizem à rota quanto se tentou.
 *
 * 5xx DEPOIS de um 2xx é a sessão CAINDO (`sessaoCaiu`), e encerra a espera na hora. Medido em
 * produção em 22/10/2026 00:39 UTC: tentativas 1 a 3 com 200 e QRCode vazio, 4 a 8 com 500. No
 * fonte do WUZAPI esse 500 é "no session" (sessão desmontada) ou "not connected" (socket caído), e
 * em nenhum dos dois a sessão volta sozinha. O 5xx ANTES de qualquer 2xx é o socket ainda subindo,
 * e continua esperando.
 */
export async function qrDaInstancia(token: string): Promise<{
    qr: string | null; numero: string | null; connectOk: boolean; naoAutorizado: boolean; tentativas: number; esperaMs: number; sessaoCaiu: boolean
}> {
    let connectOk = false
    let numero: string | null = null
    // O WUZAPI respondeu 401 a alguma das chamadas: não conhece este token.
    let naoAutorizado = false
    try {
        const conn = await fetch(`${wuzapi()}/session/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token },
            body: JSON.stringify({ Subscribe: ['Message'], Immediate: true }),
        })
        const { texto, json } = await lerCorpo(conn)
        anotarPassoDoQr('session-connect', `POST /session/connect status=${conn.status} corpo=${corte(texto)}`, [token])
        connectOk = conn.ok
        if (conn.status === NAO_AUTORIZADO) naoAutorizado = true
        const d = conn.ok ? (json as { data?: { jid?: unknown; Jid?: unknown } } | null)?.data : undefined
        numero = numeroDoJid(d?.jid ?? d?.Jid)
    } catch (e) {
        anotarPassoDoQr('session-connect', `POST /session/connect excecao=${motivoDe(e)}`, [token])
    }

    const inicio = relogioDoQr.agora()
    let tentativas = 0
    let jaRespondeuOk = false
    for (;;) {
        tentativas += 1
        const consulta = await consultarQr(token, tentativas)
        if (consulta.naoAutorizado) naoAutorizado = true
        const sessaoCaiu = jaRespondeuOk && consulta.status !== null && consulta.status >= 500
        if (consulta.status !== null && consulta.status >= 200 && consulta.status < 300) jaRespondeuOk = true
        const fim = consulta.qr !== null || naoAutorizado || !connectOk || sessaoCaiu
            || relogioDoQr.agora() - inicio + ESPERA_DO_QR.intervaloMs > ESPERA_DO_QR.tetoMs
        if (fim) return { qr: consulta.qr, numero, connectOk, naoAutorizado, tentativas, esperaMs: relogioDoQr.agora() - inicio, sessaoCaiu }
        await relogioDoQr.dormir(ESPERA_DO_QR.intervaloMs)
    }
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

export const MOTIVO_RELIGAR_DIVERGENTE = 'O telefone do cadastro mudou; atualize antes de liberar. A autorização ainda está com o número antigo.'

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

    // ligar — com autorização existente e o telefone do cadastro DIFERENTE do autorizado, recusa:
    // religar autorizaria o NÚMERO ANTIGO, que pode já ser de outra pessoa. Nada sincroniza
    // sozinho; quem opera atualiza o telefone e liga de novo (dono do produto, 21/10/2026).
    if (aut && !telefonesCasam(func.phone, aut.telefone)) return { status: 409, corpo: { error: MOTIVO_RELIGAR_DIVERGENTE } }
    const { error } = aut
        ? await supabaseAdmin.from('orcamentista_remetente_autorizado').update({ ativo: true }).eq('id', aut.id).eq('tenant_id', tenantId)
        : await supabaseAdmin.from('orcamentista_remetente_autorizado').insert({ tenant_id: tenantId, telefone, nome: func.name, employee_id: employeeId, ativo: true })
    if (conflitoDeTelefone(error)) return { status: 409, corpo: { error: 'Este telefone já está autorizado para outra pessoa nesta conta.' } }
    if (error) return { status: 500, corpo: { error: `Não foi possível ligar: ${error.message}` } }
    return { status: 200, corpo: { ok: true } }
}

// ── O PAINEL da página da seção — LEITURA APENAS ───────────────────────────────────────────
/**
 * O que a página `/atendimentos-ia/orcamentista` mostra (dono do produto, 21/10/2026):
 *   - o estado da conexão, lido de `whatsapp_conexao` (canal ORCAMENTISTA) — `ativo` é o ÚLTIMO
 *     ESTADO REGISTRADO, sem consultar o WUZAPI, e o token NÃO é selecionado;
 *   - quantas pessoas estão liberadas: autorizados com `ativo = true`;
 *   - os levantamentos de `orcamentista_pre_definicao`, do mais novo ao mais antigo, nos padrões
 *     aprovados: o CÓDIGO é o começo do id da conversa (não há coluna de código); QUEM PEDIU é o
 *     nome do remetente autorizado, ou o telefone mascarado sem nome; o ESTADO é o texto gravado,
 *     ou NULL — os valores ainda não foram definidos, e a tela mostra travessão.
 * TODA consulta filtra pelo tenant do chamador. Nenhuma escreve: a pré-definição não cria
 * orçamento no sistema maior.
 */
export interface Levantamento {
    id: string
    codigo: string
    quemPediu: string | null
    quando: string
    estado: string | null
}
export interface PainelDoOrcamentista {
    conexao: { existe: boolean; conectado: boolean; conectadoEm: string | null }
    liberadas: number
    levantamentos: Levantamento[]
}

export const codigoDaConversa = (conversaId: string) => conversaId.replace(/-/g, '').slice(0, 8).toUpperCase()

/** O telefone mascarado, já sem o 55 quando ele vier com o DDI (o da conversa vem). */
function mascarado(telefone: string): string {
    const t = telefoneDoAutorizado(telefone)
    return telefoneMascarado(t.ok ? (t as { telefone: string }).telefone : telefone)
}

export async function lerPainel(tenantId: string): Promise<PainelDoOrcamentista> {
    const { data: con, error: e1 } = await supabaseAdmin
        .from('whatsapp_conexao').select('ativo, conectado_em')
        .eq('tenant_id', tenantId).eq('canal', CANAL_DO_ORCAMENTISTA).maybeSingle()
    if (e1) throw new Error(`whatsapp_conexao: ${e1.message}`)
    const conexao = con as { ativo: boolean; conectado_em: string | null } | null

    const { data: auts, error: e2 } = await supabaseAdmin
        .from('orcamentista_remetente_autorizado').select('id').eq('tenant_id', tenantId).eq('ativo', true)
    if (e2) throw new Error(`orcamentista_remetente_autorizado: ${e2.message}`)

    const { data: pre, error: e3 } = await supabaseAdmin
        .from('orcamentista_pre_definicao').select('id, conversa_id, estado, criado_em')
        .eq('tenant_id', tenantId).order('criado_em', { ascending: false })
    if (e3) throw new Error(`orcamentista_pre_definicao: ${e3.message}`)
    // A ordem é a do banco; o sort repete-a para não depender de quem respondeu.
    const pres = ((pre ?? []) as { id: string; conversa_id: string; estado: string | null; criado_em: string }[])
        .slice().sort((a, b) => b.criado_em.localeCompare(a.criado_em))

    const resultado: PainelDoOrcamentista = {
        conexao: { existe: !!conexao, conectado: conexao?.ativo === true, conectadoEm: conexao?.conectado_em ?? null },
        liberadas: (auts ?? []).length,
        levantamentos: [],
    }
    if (pres.length === 0) return resultado

    const { data: convs, error: e4 } = await supabaseAdmin
        .from('orcamentista_conversa').select('id, remetente_id, telefone')
        .eq('tenant_id', tenantId).in('id', [...new Set(pres.map((p) => p.conversa_id))])
    if (e4) throw new Error(`orcamentista_conversa: ${e4.message}`)
    const conversas = new Map(((convs ?? []) as { id: string; remetente_id: string; telefone: string }[]).map((c) => [c.id, c]))

    const idsDosRemetentes = [...new Set([...conversas.values()].map((c) => c.remetente_id))]
    const { data: rems, error: e5 } = idsDosRemetentes.length
        ? await supabaseAdmin.from('orcamentista_remetente_autorizado').select('id, nome, telefone').eq('tenant_id', tenantId).in('id', idsDosRemetentes)
        : { data: [] as unknown[], error: null }
    if (e5) throw new Error(`orcamentista_remetente_autorizado: ${e5.message}`)
    const remetentes = new Map(((rems ?? []) as { id: string; nome: string | null; telefone: string }[]).map((r) => [r.id, r]))

    resultado.levantamentos = pres.map((p) => {
        const conversa = conversas.get(p.conversa_id)
        const rem = conversa ? remetentes.get(conversa.remetente_id) : undefined
        const nome = rem?.nome?.trim()
        const telefone = rem?.telefone ?? conversa?.telefone ?? null
        return {
            id: p.id,
            codigo: codigoDaConversa(p.conversa_id),
            quemPediu: nome || (telefone ? mascarado(telefone) : null),
            quando: p.criado_em,
            estado: p.estado?.trim() || null,
        }
    })
    return resultado
}
