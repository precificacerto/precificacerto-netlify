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
 *   c) grava SÓ pelas funções da migração `20261023000001` (e, nos três níveis, da `20261023000003`),
 *      que gravam e logam em `superadmin_alteracao_log` NA MESMA TRANSAÇÃO. A rota nunca escreve em
 *      tabela diretamente.
 *
 * O LOG: uma linha `[BASE-DE-CONHECIMENTO]` em `console.error` (o log da Vercel deste projeto só
 * exibe stderr), com a função e o código do erro — nunca o corpo do pedido.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { NICHO_DAS_ESQUADRIAS, UUID, ehNichoDasEsquadrias, type ErroNomeado } from '@/lib/atendimentos-ia/base-de-conhecimento'
import { FalhaNaDerivacao, derivarTabelasDaConta, type TabelaDaConta } from '@/lib/atendimentos-ia/tabelas-da-conta'

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

/**
 * Os funcionários ATIVOS desta empresa, para atribuir perfil de vendedor: `{ id, nome }`, e NADA mais.
 *
 * EXCEÇÃO NOMINAL à REGRA INVIOLÁVEL das telas de contas (decisão do dono do produto, 23/10/2026):
 * id e nome de funcionário, só para atribuir perfil de vendedor. Nem telefone, nem e-mail, nem cargo,
 * nem salário, nem status. Outro campo é outra decisão. Por isso o item é MONTADO campo a campo, e
 * não espalhado da linha. Só os ativos (`is_active`, a exclusão lógica — o mesmo critério da tela de
 * Vendas ao escolher vendedor); o perfil gravado de quem foi excluído continua vindo no GET da base.
 */
export async function funcionariosDaEmpresa(tenantId: string): Promise<Array<{ id: string; nome: string }>> {
    const linhas = await ler<Linha[]>('employees',
        db().from('employees').select('id, name').eq('tenant_id', tenantId).eq('is_active', true).order('name', { ascending: true }))
    return linhas
        .map((l) => ({ id: String(l.id), nome: String(l.name ?? '') }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
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
 * Os códigos em que a MENSAGEM DA FUNÇÃO vai para a resposta — só nas rotas dos três níveis, e só
 * nestes quatro (decisão do dono do produto, 23/10/2026). São os que as sete funções da
 * `20261023000003` levantam com `RAISE ... USING ERRCODE`, com texto escrito para quem lê.
 * Os outros (23514, 23505, 22P02, XX000...) vêm do PRÓPRIO BANCO — nome de constraint, de tabela —
 * e continuam com a frase fixa de `RECUSA_DA_FUNCAO`.
 * LIMITE CONHECIDO: um 23503 levantado pela FK do banco (só numa corrida, depois de a função conferir
 * o nicho) também passaria o texto dele.
 */
const STATUS_COM_A_MENSAGEM_DA_FUNCAO: Record<string, number> = {
    '42501': 403, // insufficient_privilege
    P0002: 404, // no_data_found
    '22023': 400, // invalid_parameter_value
    '23503': 400, // foreign_key_violation — fornecedor fora do nicho da empresa
}

async function chamarFuncao(res: NextApiResponse, funcao: string, args: Record<string, unknown>, comAMensagemDaFuncao: boolean) {
    const { data, error } = await db().rpc(funcao, args)
    if (error) {
        const { code = null, message } = error as { code?: string | null; message?: string }
        console.error(`${PREFIXO_DO_LOG} funcao=${funcao} codigo=${code ?? '-'}`)
        const status = comAMensagemDaFuncao && code ? STATUS_COM_A_MENSAGEM_DA_FUNCAO[code] : undefined
        if (status && typeof message === 'string' && message.trim() !== '') return res.status(status).json({ error: message })
        const recusa = (code && RECUSA_DA_FUNCAO[code]) || { status: 500, error: 'Falha ao gravar.' }
        return res.status(recusa.status).json({ error: recusa.error })
    }
    return res.status(200).json({ depois: data })
}

/**
 * Chama a função e responde. O texto do erro do banco NÃO vai para a resposta: o código decide o
 * status e a frase; o log leva a função e o código.
 */
export async function gravarPelaFuncao(res: NextApiResponse, funcao: string, args: Record<string, unknown>) {
    return chamarFuncao(res, funcao, args, false)
}

/**
 * As rotas dos TRÊS NÍVEIS: a rota não revalida o que a função valida, então a função é quem
 * explica a recusa — nos quatro códigos de `STATUS_COM_A_MENSAGEM_DA_FUNCAO`, a mensagem dela vai
 * na resposta. O log continua levando só a função e o código: nunca a mensagem, que pode citar o corpo.
 */
export async function gravarPelaFuncaoComAMensagemDela(res: NextApiResponse, funcao: string, args: Record<string, unknown>) {
    return chamarFuncao(res, funcao, args, true)
}

// ── A ÁRVORE DOS TRÊS NÍVEIS — leitura, com service_role, filtrada pelo tenant em cada tabela ──
const porOrdem = (a: Linha, b: Linha) => Number(a.ordem) - Number(b.ordem)
const porTexto = (campo: string) => (a: Linha, b: Linha) => String(a[campo] ?? '').localeCompare(String(b[campo] ?? ''), 'pt-BR')

/**
 * As LINHAS que a tabela em uso de cada fornecedor conhece, POR FONTE: as distintas de
 * `orcamentista_motor_formula_familia.linha` e as de `orcamentista_motor_regra.linha`, SEPARADAS —
 * medido em 23/10/2026, as duas divergem (DESIGN tem 139 regras e nenhuma fórmula da linha), e a
 * tela precisa saber qual é qual: linha só com regra é defeito da tabela importada (não dimensiona),
 * não erro de digitação.
 *
 * REGISTRADO, NÃO RESOLVIDO: há uma TERCEIRA fonte de "linha" — `orcamentista_motor_tipologia.linha`,
 * que a rota `/tabelas/[id]/conteudo` lê. Medido em 23/10/2026: regra e tipologia trazem as mesmas 3
 * linhas (DESIGN, EUROPA 42, EUROPA 60); a fórmula da linha, só 2 (sem DESIGN). A divergência entre
 * as três JÁ EXISTE hoje, não é futura — e é ela que o aviso do estado 2 (DESIGN) expõe na tela.
 * Registrada, não consertada: ver o corpo do PR #137.
 *
 * O PostgREST CORTA a resposta (max_rows), e a regra tem 12.116 linhas na tabela em uso: ler tudo e
 * tirar os distintos aqui perderia linha em silêncio. Por isso a leitura pede a PRÓXIMA linha ainda
 * não vista, uma por vez — uma consulta por linha distinta, mais uma para saber que acabou.
 */
const TABELAS_COM_LINHA = { formula: 'orcamentista_motor_formula_familia', regra: 'orcamentista_motor_regra' } as const
const MAXIMO_DE_LINHAS = 500
const aspasDoPostgrest = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
export type LinhasDaTabela = { formula: string[]; regra: string[] }

async function linhasDasTabelas(tabelaIds: string[]): Promise<LinhasDaTabela> {
    return { formula: await linhasDaFonte(TABELAS_COM_LINHA.formula, tabelaIds), regra: await linhasDaFonte(TABELAS_COM_LINHA.regra, tabelaIds) }
}

async function linhasDaFonte(tabela: string, tabelaIds: string[]): Promise<string[]> {
    const vistas = new Set<string>()
    for (let i = 0; ; i++) {
        if (i > MAXIMO_DE_LINHAS) throw new FalhaDeLeitura(`${tabela}.linha`, 'LINHAS_DEMAIS')
        let q = db().from(tabela).select('linha').in('tabela_id', tabelaIds).not('linha', 'is', null)
        if (vistas.size) q = q.not('linha', 'in', `(${[...vistas].map(aspasDoPostgrest).join(',')})`)
        const proxima = await ler<Array<{ linha: string }>>(`${tabela}.linha`, q.order('linha', { ascending: true }).limit(1))
        if (proxima.length === 0) break
        // a mesma de novo seria o filtro não pegando — parar com erro, não girar
        if (vistas.has(proxima[0].linha)) throw new FalhaDeLeitura(`${tabela}.linha`, 'NAO_CONVERGIU')
        vistas.add(proxima[0].linha)
    }
    return [...vistas].filter((l) => l.trim() !== '').sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/**
 * fornecedor → as linhas das tabelas que ESTA conta usa dele. As tabelas são as DERIVADAS (dono do produto,
 * 26/10/2026): as dos fornecedores que a base de conhecimento vincula, e só as que VALEM — uma por
 * (fornecedor, família), a vigente quando há mais de uma (`tabelas-da-conta.ts`). Fornecedor sem tabela que
 * valha NÃO tem chave: a tela distingue "sem tabela em uso" de "tabela sem linha" (a lista vazia).
 */
async function linhasPorFornecedor(tenantId: string): Promise<Record<string, LinhasDaTabela>> {
    let tabelas: TabelaDaConta[]
    try {
        tabelas = (await derivarTabelasDaConta(tenantId)).tabelas.filter((t) => t.vale)
    } catch (e) {
        if (e instanceof FalhaNaDerivacao) throw new FalhaDeLeitura(e.onde, e.codigo)
        throw e
    }
    const porFornecedor: Record<string, LinhasDaTabela> = {}
    for (const fornecedor of new Set(tabelas.map((t) => t.fornecedorId))) {
        porFornecedor[fornecedor] = await linhasDasTabelas(tabelas.filter((t) => t.fornecedorId === fornecedor).map((t) => t.tabelaId))
    }
    return porFornecedor
}

/**
 * De quais categorias o fornecedor TEM tabela (as chaves distintas, em ordem) e quantas tabelas suas não declaram categoria. Pura.
 * Categoria nula não é categoria: ela não entra na lista e vai para a contagem — nunca é somada a uma.
 */
export function categoriasDasTabelas(tabelas: ReadonlyArray<{ categoria_chave?: unknown }>): { categorias_das_tabelas: string[]; tabelas_sem_categoria: number } {
    const chaves = new Set<string>()
    let semCategoria = 0
    for (const t of tabelas) {
        if (typeof t.categoria_chave === 'string' && t.categoria_chave.trim() !== '') chaves.add(t.categoria_chave)
        else semCategoria += 1
    }
    return { categorias_das_tabelas: [...chaves].sort(), tabelas_sem_categoria: semCategoria }
}

/** A lista que pendura em cada categoria, além dos fornecedores — e só nela. */
const LISTA_DA_CATEGORIA: Record<string, string> = { VIDRO: 'vidros', FERRAGENS: 'ferragens', INSTALACAO: 'instalacao' }

/**
 * A árvore inteira de uma empresa, numa resposta só. As linhas saem ESPALHADAS como o banco as
 * devolve: nenhum null vira false, vazio ou default — `config` null é "não configurado", `usa` null
 * é "não informado", e `onde_predomina` vazio não é o mesmo que null. A ordem é feita aqui.
 */
export async function lerArvoreDaEmpresa(tenantId: string) {
    const nicho = await nichoDaEmpresa(tenantId)
    const categoriasDoCatalogo = (await ler<Linha[]>('orcamentista_categoria_catalogo', db().from('orcamentista_categoria_catalogo').select('*'))).sort(porOrdem)
    // AS RAMIFICAÇÕES DA FAMÍLIA (27/10/2026): cada família declara as categorias que usa, na ordem. A lista de TODAS
    // as categorias é o catálogo; quem diz quais valem para uma matéria-prima é a família dela. Falha ao ler é erro —
    // nunca a lista inteira no lugar da declarada.
    const familias = (await ler<Linha[]>('orcamentista_familia_catalogo', db().from('orcamentista_familia_catalogo').select('chave, rotulo, ordem'))).sort(porOrdem)
    const ramificacoes = (await ler<Linha[]>('orcamentista_familia_ramificacao', db().from('orcamentista_familia_ramificacao').select('familia, categoria_chave, ordem')))
        .sort((a, b) => porTexto('familia')(a, b) || porOrdem(a, b))
    const campos = (await ler<Linha[]>('orcamentista_categoria_campo', db().from('orcamentista_categoria_campo').select('*')))
        .sort((a, b) => porTexto('categoria_chave')(a, b) || porOrdem(a, b))
    // O FORNECEDOR DA RAMIFICAÇÃO SAI DA TABELA (dono do produto, 28/10/2026): a categoria é da TABELA, e um fornecedor tem várias, uma por
    // categoria. Cada fornecedor do nicho diz de quais categorias tem tabela, e quantas tabelas suas não declaram categoria (as de antes: não
    // aparecem em categoria nenhuma, e a tela diz isso). Falha ao ler é erro — nunca a lista inteira no lugar da filtrada.
    const fornecedoresDoNichoBrutos = nicho
        ? (await ler<Linha[]>('orcamentista_fornecedor', db().from('orcamentista_fornecedor').select('id, nome').eq('nicho_id', nicho.id)))
        : []
    const tabelasDosFornecedores = fornecedoresDoNichoBrutos.length === 0 ? [] : await ler<Linha[]>('orcamentista_tabela',
        db().from('orcamentista_tabela').select('fornecedor_id, categoria_chave').in('fornecedor_id', fornecedoresDoNichoBrutos.map((f) => f.id)))
    const fornecedoresDoNicho = fornecedoresDoNichoBrutos
        .map((f) => ({ id: f.id, nome: f.nome, ...categoriasDasTabelas(tabelasDosFornecedores.filter((t) => t.fornecedor_id === f.id)) }))
        .sort(porTexto('nome'))

    const doTenant = (tabela: string) => ler<Linha[]>(tabela, db().from(tabela).select('*').eq('tenant_id', tenantId))
    const materiasPrimas = (await doTenant('orcamentista_materia_prima')).sort(porOrdem)
    const categorias = await doTenant('orcamentista_mp_categoria')
    const fornecedores = (await doTenant('orcamentista_mp_categoria_fornecedor')).sort(porOrdem)
    const listas: Record<string, Linha[]> = {
        vidros: (await doTenant('orcamentista_mp_vidro')).sort(porOrdem),
        ferragens: (await doTenant('orcamentista_mp_ferragem')).sort(porOrdem),
        instalacao: (await doTenant('orcamentista_mp_instalacao')).sort(porTexto('produto')),
    }

    // o nome de quem está gravado, MESMO fora do nicho atual: a linha existe e precisa ser lida
    const idsCitados = [...new Set(fornecedores.map((f) => String(f.fornecedor_id)))]
    const nomes = idsCitados.length === 0 ? {} : Object.fromEntries(
        (await ler<Linha[]>('orcamentista_fornecedor', db().from('orcamentista_fornecedor').select('id, nome').in('id', idsCitados)))
            .map((f) => [String(f.id), f.nome]))

    const posicaoNoCatalogo = new Map(categoriasDoCatalogo.map((c, i) => [String(c.chave), i]))
    const daCategoria = (linhas: Linha[], id: unknown) => linhas.filter((l) => l.mp_categoria_id === id)
    return {
        tenant_id: tenantId,
        nicho,
        catalogo: { categorias: categoriasDoCatalogo, campos, familias, ramificacoes },
        fornecedores_do_nicho: fornecedoresDoNicho,
        linhas_por_fornecedor: await linhasPorFornecedor(tenantId),
        materias_primas: materiasPrimas.map((mp) => ({
            ...mp,
            categorias: categorias
                .filter((c) => c.materia_prima_id === mp.id)
                .sort((a, b) => (posicaoNoCatalogo.get(String(a.categoria_chave)) ?? 0) - (posicaoNoCatalogo.get(String(b.categoria_chave)) ?? 0))
                .map((c) => {
                    const lista = LISTA_DA_CATEGORIA[String(c.categoria_chave)]
                    return {
                        ...c,
                        fornecedores: daCategoria(fornecedores, c.id).map((f) => ({ ...f, nome_do_fornecedor: nomes[String(f.fornecedor_id)] ?? null })),
                        ...(lista ? { [lista]: daCategoria(listas[lista], c.id) } : {}),
                    }
                }),
        })),
    }
}

/**
 * O contexto do atendimento gravado: o texto, quando e o NOME de quem alterou (o super admin — nunca dado de
 * cliente). Sem linha, tudo null: vazio é o padrão, e nenhum texto é inventado.
 */
export async function lerContextoGravado(tenantId: string): Promise<{ texto: string | null; atualizado_em: string | null; atualizado_por: string | null }> {
    const linha = await ler<Linha | null>('orcamentista_contexto_do_atendimento',
        db().from('orcamentista_contexto_do_atendimento').select('texto, atualizado_em, atualizado_por').eq('tenant_id', tenantId).maybeSingle())
    if (!linha) return { texto: null, atualizado_em: null, atualizado_por: null }
    const autor = linha.atualizado_por
        ? await ler<Linha | null>('users', db().from('users').select('id, name').eq('id', linha.atualizado_por).maybeSingle())
        : null
    return {
        texto: typeof linha.texto === 'string' ? linha.texto : null,
        atualizado_em: (linha.atualizado_em as string | null) ?? null,
        atualizado_por: (autor?.name as string | null | undefined) ?? null,
    }
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
