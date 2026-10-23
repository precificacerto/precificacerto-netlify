/**
 * Atendimentos I.A. — a base de conhecimento no SERVIDOR: o portão das rotas, as leituras e as
 * chamadas às funções que gravam com log.
 *
 * ══ O PORTÃO, nesta ordem — é a razão destas rotas existirem ══
 * Esta é a ÚNICA área em que o tenant chega pelo PEDIDO (o super admin não tem tenant), e é por
 * essa porta que uma escrita cairia na empresa errada. Toda rota:
 *   a) exige super admin pelo PERFIL gravado (`superAdminOu404`, sobre o núcleo de
 *      `getCallerContext`) — nunca por papel vindo do corpo, e-mail ou lista. Quem não é recebe
 *      404, não 403: a rota não confirma que existe;
 *   b) lê o tenant do QUERY STRING, confere que é uuid e que a empresa EXISTE — senão 404;
 *   c) grava SÓ pelas funções da migração `20261023000001`, que gravam e logam em
 *      `superadmin_alteracao_log` NA MESMA TRANSAÇÃO. A rota nunca escreve em tabela diretamente.
 *
 * O LOG: uma linha `[BASE-DE-CONHECIMENTO]` em `console.error` (o log da Vercel deste projeto só
 * exibe stderr), com a função e o código do erro — nunca o corpo do pedido.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { NICHO_DAS_ESQUADRIAS, UUID, ehNichoDasEsquadrias, type ErroNomeado } from '@/lib/atendimentos-ia/base-de-conhecimento'

export const PREFIXO_DO_LOG = '[BASE-DE-CONHECIMENTO]'

type Linha = Record<string, unknown>
type ErroDoBanco = { code?: string; message?: string } | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

export class FalhaDeLeitura extends Error {
    constructor(public onde: string, public codigo: string | null) { super(`leitura de ${onde}`) }
}

async function ler<T>(onde: string, p: PromiseLike<{ data: unknown; error: ErroDoBanco }>): Promise<T> {
    const { data, error } = await p
    if (error) throw new FalhaDeLeitura(onde, error.code ?? null)
    return data as T
}

/** O id do query string, se for UM uuid — lista, ausente ou malformado devolvem null. */
export function idDoQuery(req: NextApiRequest, chave: string): string | null {
    const v = req.query[chave]
    return typeof v === 'string' && UUID.test(v) ? v : null
}

/** (b) a empresa do pedido: uuid e existente, ou 404 já respondido. */
export async function empresaDoPedido(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
    const tenantId = idDoQuery(req, 'tenant')
    if (tenantId) {
        const empresa = await ler<Linha | null>('tenants', db().from('tenants').select('id').eq('id', tenantId).maybeSingle())
        if (empresa) return tenantId
    }
    res.status(404).json({ error: 'Empresa não encontrada.' })
    return null
}

export type Nicho = { id: string; modelo: string; nome: string }

/** O nicho do pedido (`?nicho=`): uuid e existente, ou 404 já respondido. */
export async function nichoDoPedido(req: NextApiRequest, res: NextApiResponse): Promise<Nicho | null> {
    const nichoId = idDoQuery(req, 'nicho')
    if (nichoId) {
        const nicho = await ler<Nicho | null>('orcamentista_nicho', db().from('orcamentista_nicho').select('id, modelo, nome').eq('id', nichoId).maybeSingle())
        if (nicho) return nicho
    }
    res.status(404).json({ error: 'Nicho não encontrado.' })
    return null
}

/** O nicho da conta, por `orcamentista_config.nicho_id` — null se a conta não tem nicho. */
export async function nichoDaEmpresa(tenantId: string): Promise<Nicho | null> {
    const config = await ler<{ nicho_id: string | null } | null>('orcamentista_config', db().from('orcamentista_config').select('nicho_id').eq('tenant_id', tenantId).maybeSingle())
    if (!config?.nicho_id) return null
    return ler<Nicho | null>('orcamentista_nicho', db().from('orcamentista_nicho').select('id, modelo, nome').eq('id', config.nicho_id).maybeSingle())
}

export const recusaForaDoNicho = (onde: string) =>
    `${onde} não está no nicho Esquadrias: guarnição, contramarco e perfil são configuração de esquadrias. Frete e instalação podem ser gravados em qualquer nicho.`

/**
 * O nicho Esquadrias NO CATÁLOGO — reconhecido pelo NOME (`ehNichoDasEsquadrias`), e é por isso que
 * esta função existe. Um rótulo editável por humano virou chave de comportamento: renomear o nicho
 * no catálogo ("Esquadrias e Vidros") faria TODA gravação de esquadrias cair no 409 de "empresa de
 * outro nicho", calada, na tela do super admin, onde ninguém suspeitaria do catálogo. Então a rota
 * procura no catálogo INTEIRO antes de decidir, e só segue com EXATAMENTE UM nicho casando:
 *   - nenhum → `NICHO_ESQUADRIAS_AUSENTE`, dizendo que não foi encontrado e pode ter sido renomeado;
 *   - mais de um → `NICHO_ESQUADRIAS_DUPLICADO`, dizendo quantos.
 * O mecanismo (nome) não mudou — decisão do dono do produto, 23/10/2026; o que mudou é que a falha
 * dele tem NOME. Limite conhecido, registrado no PR #126.
 */
export async function nichoDasEsquadriasNoCatalogo(): Promise<{ nicho: Nicho | null; codigo: string | null; erro: string | null }> {
    const doModelo = await ler<Nicho[]>('orcamentista_nicho', db().from('orcamentista_nicho').select('id, modelo, nome').eq('modelo', NICHO_DAS_ESQUADRIAS.modelo))
    const casam = doModelo.filter((n) => ehNichoDasEsquadrias(n))
    const quem = `O nicho '${NICHO_DAS_ESQUADRIAS.nome}' (modelo ${NICHO_DAS_ESQUADRIAS.modelo})`
    if (casam.length === 1) return { nicho: casam[0], codigo: null, erro: null }
    if (casam.length === 0) {
        return {
            nicho: null,
            codigo: 'NICHO_ESQUADRIAS_AUSENTE',
            erro: `${quem} não foi encontrado no catálogo de nichos — ele pode ter sido renomeado. A base de conhecimento reconhece o nicho de esquadrias pelo NOME, e sem ele não grava esquadrias. Confira o nome no catálogo.`,
        }
    }
    return {
        nicho: null,
        codigo: 'NICHO_ESQUADRIAS_DUPLICADO',
        erro: `${quem} está duplicado no catálogo: há ${casam.length} nichos com esse nome. A base de conhecimento reconhece o nicho de esquadrias pelo NOME e não sabe qual usar. Deixe só um no catálogo.`,
    }
}

/**
 * Segue (true) só quando `nichoId` é O nicho Esquadrias do catálogo. Senão responde o 409 certo e
 * devolve false: o do CATÁLOGO (ausente ou duplicado), que vai também ao log, ou o de outro nicho.
 */
export async function exigirNichoDasEsquadrias(res: NextApiResponse, nichoId: string | null, onde: string): Promise<boolean> {
    const catalogo = await nichoDasEsquadriasNoCatalogo()
    if (!catalogo.nicho) {
        console.error(`${PREFIXO_DO_LOG} catalogo=${catalogo.codigo} — o nicho de esquadrias é reconhecido pelo nome`)
        res.status(409).json({ error: catalogo.erro, codigo: catalogo.codigo })
        return false
    }
    if (nichoId !== catalogo.nicho.id) {
        res.status(409).json({ error: recusaForaDoNicho(onde), codigo: 'FORA_DO_NICHO_ESQUADRIAS' })
        return false
    }
    return true
}


/** Tudo o que o GET devolve, numa resposta só. */
export async function lerBaseDaEmpresa(tenantId: string) {
    const nicho = await nichoDaEmpresa(tenantId)
    const empresa = await ler<Linha | null>('orcamentista_esquadrias_base', db().from('orcamentista_esquadrias_base').select('*').eq('tenant_id', tenantId).maybeSingle())
    const padrao = nicho
        ? await ler<Linha | null>('orcamentista_esquadrias_padrao', db().from('orcamentista_esquadrias_padrao').select('*').eq('nicho_id', nicho.id).maybeSingle())
        : null
    const adicionais = await ler<Linha | null>('orcamentista_base_conhecimento', db().from('orcamentista_base_conhecimento').select('*').eq('tenant_id', tenantId).maybeSingle())
    const ambientes = await ler<Linha[]>('orcamentista_padrao_ambiente', db().from('orcamentista_padrao_ambiente').select('*').eq('tenant_id', tenantId).order('ambiente', { ascending: true }))
    const perfis = await ler<Linha[]>('orcamentista_vendedor_perfil', db().from('orcamentista_vendedor_perfil').select('*').eq('tenant_id', tenantId))
    const nomes = await nomesDosFuncionarios(tenantId, perfis.map((p) => String(p.employee_id)))
    const vendedores = perfis.map((p) => ({ ...p, nome_do_funcionario: nomes[String(p.employee_id)] ?? null }))
    return { nicho, empresa, padrao, adicionais, ambientes, vendedores }
}

/** id → nome, SÓ dos funcionários desta empresa. */
async function nomesDosFuncionarios(tenantId: string, ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {}
    const linhas = await ler<Array<{ id: string; name: string; tenant_id: string }>>('employees',
        db().from('employees').select('id, name, tenant_id').in('id', ids).eq('tenant_id', tenantId))
    return Object.fromEntries(linhas.filter((l) => l.tenant_id === tenantId).map((l) => [l.id, l.name]))
}

/** Os adicionais gravados — o "antes" sobre o qual a coerência do corpo é conferida. */
export async function lerAdicionais(tenantId: string): Promise<Linha | null> {
    return ler<Linha | null>('orcamentista_base_conhecimento', db().from('orcamentista_base_conhecimento').select('*').eq('tenant_id', tenantId).maybeSingle())
}

/** Os funcionários da lista que NÃO são desta empresa (ou não existem), com o índice na lista. */
export async function funcionariosDeFora(tenantId: string, ids: string[]): Promise<ErroNomeado[]> {
    if (ids.length === 0) return []
    const linhas = await ler<Array<{ id: string; tenant_id: string }>>('employees', db().from('employees').select('id, tenant_id').in('id', ids))
    const daEmpresa = new Set(linhas.filter((l) => l.tenant_id === tenantId).map((l) => l.id.toLowerCase()))
    return ids.flatMap((id, i) => (daEmpresa.has(id.toLowerCase())
        ? []
        : [{ campo: `vendedores[${i}].employee_id`, mensagem: `${id} não é funcionário desta empresa.` }]))
}

// ── A GRAVAÇÃO — só pelas funções, que gravam e logam na mesma transação ────────────────────
const RECUSA_DA_FUNCAO: Record<string, { status: number; error: string }> = {
    '22023': { status: 400, error: 'O banco recusou o formato do pedido.' },
    '22P02': { status: 400, error: 'O banco recusou o formato de um valor.' },
    '23514': { status: 400, error: 'Um valor não passou numa regra do banco.' },
    '23503': { status: 400, error: 'Um funcionário ou registro citado não pertence a esta empresa.' },
    P0002: { status: 404, error: 'Empresa ou nicho não encontrado.' },
}

/**
 * Chama a função e responde. O texto do erro do banco NÃO vai para a resposta: o código decide o
 * status e a frase; o log leva a função e o código.
 */
export async function gravarPelaFuncao(res: NextApiResponse, funcao: string, args: Record<string, unknown>) {
    const { data, error } = await db().rpc(funcao, args)
    if (error) {
        const code = (error as { code?: string }).code ?? null
        console.error(`${PREFIXO_DO_LOG} funcao=${funcao} codigo=${code ?? '-'}`)
        const recusa = (code && RECUSA_DA_FUNCAO[code]) || { status: 500, error: 'Falha ao gravar.' }
        return res.status(recusa.status).json({ error: recusa.error })
    }
    return res.status(200).json({ depois: data })
}

export function falhaDeLeitura(res: NextApiResponse, e: unknown) {
    const f = e instanceof FalhaDeLeitura ? e : null
    console.error(`${PREFIXO_DO_LOG} leitura=${f?.onde ?? '-'} codigo=${f?.codigo ?? (e instanceof Error ? e.name : '-')}`)
    return res.status(500).json({ error: 'Falha ao ler a base de conhecimento.' })
}

export function recusaNomeada(res: NextApiResponse, erros: ErroNomeado[]) {
    return res.status(400).json({ error: 'Pedido inválido.', erros })
}

export function metodoNaoPermitido(res: NextApiResponse, permitidos: string[]) {
    res.setHeader('Allow', permitidos.join(', '))
    return res.status(405).json({ error: 'Method not allowed' })
}
