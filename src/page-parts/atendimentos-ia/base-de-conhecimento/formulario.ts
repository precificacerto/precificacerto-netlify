/**
 * A TELA da base de conhecimento — o que é puro: as rotas que ela chama, os blocos, os rótulos, e a
 * montagem do CORPO. Nada aqui lê rede nem React.
 *
 * ══ SÓ O QUE MUDOU VAI NO CORPO ══
 * As rotas tratam a chave AUSENTE como "não mexer", NULL como "limpar" (nas esquadrias: voltar a
 * herdar o nicho) e FALSE como false (`src/lib/atendimentos-ia/base-de-conhecimento.ts`). Por isso a
 * tela NUNCA serializa o formulário inteiro: o corpo leva só o campo cujo valor no formulário é
 * DIFERENTE do gravado pela empresa. Consequências, cada uma com caso no portão
 * `base-de-conhecimento-a-tela.test.tsx`:
 *   - campo não tocado não vai;
 *   - campo esvaziado vai null — texto em branco, lista vazia, número apagado;
 *   - booleano em "não informado" que já era null não vai — nem como false;
 *   - a comparação é contra a camada da EMPRESA, não contra o efetivo: digitar o mesmo valor que o
 *     nicho dá grava esse valor na empresa, porque a empresa passou a decidir.
 *
 * ══ OS ADICIONAIS ══
 * Trocar o modo limpa o que o modo novo não usa (VALOR limpa percentual e base; PERCENTUAL limpa o
 * valor; "não cobra" e "sem modo" limpam os três) — a regra de coerência da rota é sobre o estado
 * RESULTANTE, e a tela confere a mesma regra (`errosDeCoerenciaDosAdicionais`) antes de enviar:
 * PERCENTUAL sem base não sai da tela.
 */
import { ROUTES } from '@/constants/routes'
import {
    CAMPOS_DE_ESQUADRIAS, errosDeCoerenciaDosAdicionais, type Dominio, type ErroNomeado, type Origem,
} from '@/lib/atendimentos-ia/base-de-conhecimento'

const RAIZ = '/api/super-admin/base-de-conhecimento'
const daEmpresa = (sufixo: string, tenantId: string) => `${RAIZ}${sufixo}?tenant=${encodeURIComponent(tenantId)}`

export const ROTAS_DA_BASE = {
    base: (tenantId: string) => daEmpresa('', tenantId),
    ambiente: (tenantId: string) => daEmpresa('/ambiente', tenantId),
    vendedor: (tenantId: string) => daEmpresa('/vendedor', tenantId),
    funcionarios: (tenantId: string) => daEmpresa('/funcionarios', tenantId),
}

/** A tela: dentro da conta, para a empresa estar no CAMINHO e não num seletor do formulário. */
export const rotaDaTelaDaBase = (tenantId: string) => `${ROUTES.SUPER_ADMIN_IA_CONTAS}/${tenantId}/base-de-conhecimento`

export const ROTULO_DA_ORIGEM: Record<Origem, string> = {
    empresa: 'Da empresa',
    nicho: 'Herdado do nicho',
    'sem valor': 'Sem valor',
}

export const ROTULO_DO_CAMPO: Record<string, string> = {
    fornecedor_perfil: 'Fornecedor do perfil',
    linha_perfil: 'Linha do perfil',
    cor_perfil_predominante: 'Cor predominante do perfil',
    cores_perfil: 'Cores de perfil que trabalha',
    vidro_predominante: 'Tipo de vidro predominante',
    vidros: 'Tipos de vidro que trabalha',
    usa_arremate_interno: 'Usa arremate interno',
    guarnicao_interna: 'Guarnição interna',
    guarnicao_interna_mm: 'Guarnição interna (mm)',
    usa_arremate_externo: 'Usa arremate externo',
    guarnicao_externa: 'Guarnição externa',
    guarnicao_externa_mm: 'Guarnição externa (mm)',
    montagem_arremate_externo: 'Montagem do arremate externo',
    medida_arremate_externo: 'Medida do arremate externo',
    usa_contramarco: 'Trabalha com contramarco',
    cor_acessorio_por_perfil: 'Cor do acessório por cor de perfil',
    regiao_litoranea: 'Região litorânea',
    modelo_interlock: 'Modelo do interlock',
    fechamento_folha_interna: 'Fechamento da folha interna',
    fechamento_folha_externa: 'Fechamento da folha externa',
    macaneta_sem_chave: 'Maçaneta sem chave',
    solda: 'Solda',
    vedacao: 'Vedação',
    folga_instalacao_x: 'Folga de instalação X (mm)',
    folga_instalacao_y: 'Folga de instalação Y (mm)',
    barra_mm: 'Barra (mm)',
    serra_mm: 'Serra (mm)',
    frete_modo: 'Frete — modo',
    frete_valor: 'Frete — valor (R$)',
    frete_percentual: 'Frete — percentual (%)',
    frete_base: 'Frete — base do percentual',
    instalacao_modo: 'Instalação — modo',
    instalacao_valor: 'Instalação — valor (R$)',
    instalacao_percentual: 'Instalação — percentual (%)',
    instalacao_base: 'Instalação — base do percentual',
    ambiente: 'Ambiente',
    vidro_padrao: 'Vidro padrão',
    tipologia_usual: 'Tipologia usual',
    comissao_percentual: 'Comissão (%)',
    comissao_modo: 'Modo da comissão',
    reserva_tecnica_percentual: 'Reserva técnica (%)',
    lucro_projetado_percentual: 'Lucro projetado (%)',
}

export type ChaveDoBloco = 'perfil' | 'vidro' | 'guarnicao' | 'acessorios' | 'ambientes' | 'producao' | 'vendedores' | 'adicionais'

/** Os blocos que gravam ESQUADRIAS. Ambientes, vendedores e adicionais têm forma própria. */
export const BLOCOS_DE_ESQUADRIAS: ReadonlyArray<{ chave: ChaveDoBloco; titulo: string; campos: readonly string[] }> = [
    { chave: 'perfil', titulo: 'Perfil', campos: ['fornecedor_perfil', 'linha_perfil', 'cor_perfil_predominante', 'cores_perfil'] },
    { chave: 'vidro', titulo: 'Vidro', campos: ['vidro_predominante', 'vidros'] },
    {
        chave: 'guarnicao', titulo: 'Guarnição e contramarco',
        campos: ['usa_arremate_interno', 'guarnicao_interna', 'guarnicao_interna_mm', 'usa_arremate_externo', 'guarnicao_externa',
            'guarnicao_externa_mm', 'montagem_arremate_externo', 'medida_arremate_externo', 'usa_contramarco'],
    },
    {
        chave: 'acessorios', titulo: 'Acessórios',
        campos: ['cor_acessorio_por_perfil', 'regiao_litoranea', 'modelo_interlock', 'fechamento_folha_interna', 'fechamento_folha_externa',
            'macaneta_sem_chave', 'solda', 'vedacao'],
    },
    { chave: 'producao', titulo: 'Produção', campos: ['folga_instalacao_x', 'folga_instalacao_y', 'barra_mm', 'serra_mm'] },
]

/** A ordem dos oito blocos na tela. */
export const ORDEM_DOS_BLOCOS: readonly ChaveDoBloco[] = ['perfil', 'vidro', 'guarnicao', 'acessorios', 'ambientes', 'producao', 'vendedores', 'adicionais']

export const dominioDe = (campo: string): Dominio => CAMPOS_DE_ESQUADRIAS[campo]

// ── O booleano em três estados ─────────────────────────────────────────────────────────────
export type TresEstados = 'sim' | 'nao' | 'nao_informado'
export const ROTULO_DOS_TRES_ESTADOS: Record<TresEstados, string> = { sim: 'Sim', nao: 'Não', nao_informado: 'Não informado' }
export const paraTresEstados = (v: unknown): TresEstados => (v === true ? 'sim' : v === false ? 'nao' : 'nao_informado')
export const deTresEstados = (e: TresEstados): boolean | null => (e === 'sim' ? true : e === 'nao' ? false : null)

// ── O par cor do perfil → cor do acessório ─────────────────────────────────────────────────
export type Par = { perfil: string; acessorio: string }
export const paresDoMapa = (v: unknown): Par[] =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v as Record<string, unknown>).map(([perfil, acessorio]) => ({ perfil, acessorio: String(acessorio ?? '') })) : []

/** Os pares viram o mapa; linha toda em branco some; meio preenchida é erro; nenhum par é null. */
export function mapaDosPares(pares: Par[]): { valor: Record<string, string> | null; erro: string | null } {
    const mapa: Record<string, string> = {}
    for (const p of pares) {
        const perfil = p.perfil.trim()
        const acessorio = p.acessorio.trim()
        if (!perfil && !acessorio) continue
        if (!perfil || !acessorio) return { valor: null, erro: 'preencha as duas cores de cada par (ou remova o par)' }
        if (perfil in mapa) return { valor: null, erro: `a cor de perfil "${perfil}" aparece duas vezes` }
        mapa[perfil] = acessorio
    }
    return { valor: Object.keys(mapa).length ? mapa : null, erro: null }
}

// ── O valor do formulário, normalizado para o domínio ──────────────────────────────────────
/**
 * O que o formulário guarda para cada domínio: texto → string; textos → string[]; booleano →
 * boolean | null; inteiro/número → number | null; mapa → `Par[]`. Esta função devolve o valor que a
 * ROTA aceita, ou null quando vazio, ou um erro de preenchimento.
 */
export function valorDoFormulario(d: Dominio, v: unknown): { valor: unknown; erro: string | null } {
    switch (d.tipo) {
        case 'texto':
        case 'opcao': {
            const t = typeof v === 'string' ? v.trim() : ''
            return { valor: t === '' ? null : t, erro: null }
        }
        case 'textos': {
            const lista = Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x !== '') : []
            return { valor: lista.length ? lista : null, erro: null }
        }
        case 'booleano':
            return { valor: typeof v === 'boolean' ? v : null, erro: null }
        case 'inteiro':
        case 'numero':
            return { valor: typeof v === 'number' && Number.isFinite(v) ? v : null, erro: null }
        case 'mapaDeTexto':
            return mapaDosPares(Array.isArray(v) ? (v as Par[]) : [])
    }
}

/** O valor gravado na forma que o formulário edita. */
export function formularioDoValor(d: Dominio, v: unknown): unknown {
    if (d.tipo === 'mapaDeTexto') return paresDoMapa(v)
    if (d.tipo === 'textos') return Array.isArray(v) ? v : []
    return v ?? null
}

/** Igualdade de valores normalizados: listas na ordem, mapas sem ordem de chave. */
function canonico(v: unknown): string {
    if (v === undefined || v === null) return 'null'
    if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
    if (typeof v === 'object') {
        const o = v as Record<string, unknown>
        return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
    }
    return JSON.stringify(v)
}
export const mesmoValor = (a: unknown, b: unknown) => canonico(a) === canonico(b)

/**
 * As MUDANÇAS de um grupo de campos: só o que difere do gravado, com o valor normalizado (null quando
 * esvaziado). Os erros de preenchimento saem nomeados pelo campo, e com eles nada deve ser enviado.
 */
export function mudancas(
    campos: readonly string[], dominio: (c: string) => Dominio, gravado: Record<string, unknown> | null, formulario: Record<string, unknown>,
): { corpo: Record<string, unknown>; erros: ErroNomeado[] } {
    const corpo: Record<string, unknown> = {}
    const erros: ErroNomeado[] = []
    for (const c of campos) {
        const { valor, erro } = valorDoFormulario(dominio(c), formulario[c])
        if (erro) { erros.push({ campo: c, mensagem: erro }); continue }
        if (!mesmoValor(valor, gravado ? gravado[c] : null)) corpo[c] = valor
    }
    return { corpo, erros }
}

// ── Os adicionais ──────────────────────────────────────────────────────────────────────────
export const MODOS = ['NAO_COBRA', 'VALOR', 'PERCENTUAL'] as const
export type Modo = typeof MODOS[number]
export const ROTULO_DO_MODO: Record<Modo, string> = { NAO_COBRA: 'Não cobra', VALOR: 'Valor', PERCENTUAL: 'Percentual' }
export const BASES: Record<'frete' | 'instalacao', ReadonlyArray<{ valor: string; rotulo: string }>> = {
    frete: [{ valor: 'VALOR_DE_VENDA', rotulo: 'Valor de venda' }, { valor: 'CUSTO_DO_FRETE', rotulo: 'Custo do frete' }],
    instalacao: [{ valor: 'VALOR_DE_VENDA', rotulo: 'Valor de venda' }, { valor: 'CUSTO_DA_INSTALACAO', rotulo: 'Custo da instalação' }],
}
export const ADICIONAIS = ['frete', 'instalacao'] as const
export const CAMPOS_DO_ADICIONAL = (x: 'frete' | 'instalacao') => [`${x}_modo`, `${x}_valor`, `${x}_percentual`, `${x}_base`]
const DOMINIO_DO_ADICIONAL = (c: string): Dominio =>
    (c.endsWith('_modo') || c.endsWith('_base') ? { tipo: 'opcao', opcoes: [] } : { tipo: 'numero', minimo: 0, maximo: null })

/** Os campos que cada modo usa. Os outros somem da tela e são limpos. */
export function usaNoModo(modo: unknown): { valor: boolean; percentual: boolean; base: boolean } {
    return { valor: modo === 'VALOR', percentual: modo === 'PERCENTUAL', base: modo === 'PERCENTUAL' }
}

/** Trocar o modo: grava o modo novo e LIMPA o que ele não usa. */
export function trocarOModo(formulario: Record<string, unknown>, x: 'frete' | 'instalacao', modo: Modo | null): Record<string, unknown> {
    const usa = usaNoModo(modo)
    return {
        ...formulario,
        [`${x}_modo`]: modo,
        [`${x}_valor`]: usa.valor ? formulario[`${x}_valor`] ?? null : null,
        [`${x}_percentual`]: usa.percentual ? formulario[`${x}_percentual`] ?? null : null,
        [`${x}_base`]: usa.base ? formulario[`${x}_base`] ?? null : null,
    }
}

/** O corpo dos adicionais, ou os erros que o seguram na tela (a mesma coerência da rota). */
export function corpoDosAdicionais(gravado: Record<string, unknown> | null, formulario: Record<string, unknown>): { corpo: Record<string, unknown>; erros: ErroNomeado[] } {
    const campos = ADICIONAIS.flatMap(CAMPOS_DO_ADICIONAL)
    const { corpo, erros } = mudancas(campos, DOMINIO_DO_ADICIONAL, gravado, formulario)
    if (erros.length || Object.keys(corpo).length === 0) return { corpo, erros }
    const resultante: Record<string, unknown> = {}
    for (const c of campos) resultante[c] = c in corpo ? corpo[c] : (gravado ? gravado[c] ?? null : null)
    return { corpo, erros: errosDeCoerenciaDosAdicionais(resultante, '').map((e) => ({ ...e, campo: e.campo.replace(/^\./, '') })) }
}

// ── As listas: ambientes e vendedores ──────────────────────────────────────────────────────
export const CAMPOS_DO_AMBIENTE = ['vidro_padrao', 'tipologia_usual'] as const
export const CAMPOS_DO_VENDEDOR = ['comissao_percentual', 'comissao_modo', 'reserva_tecnica_percentual', 'lucro_projetado_percentual'] as const
export const MODOS_DA_COMISSAO = [{ valor: 'PROPORCIONAL', rotulo: 'Proporcional' }, { valor: 'CONGELADA', rotulo: 'Congelada' }] as const
const DOMINIO_DO_ITEM = (c: string): Dominio =>
    (c.endsWith('_percentual') ? { tipo: 'numero', minimo: 0, maximo: 100 } : { tipo: 'texto' })

export type LinhaDaLista = { chave: string; valores: Record<string, unknown> }

/**
 * A LISTA É O ESTADO: item fora da lista sai. Dentro do item, a chave e só o que mudou contra o
 * gravado — o item novo leva o que foi preenchido. `mudou` diz se há o que enviar (item mudado,
 * acrescentado ou removido).
 */
export function corpoDaLista(
    chaveDoItem: 'ambiente' | 'employee_id', campos: readonly string[],
    gravados: ReadonlyArray<Record<string, unknown>>, linhas: ReadonlyArray<LinhaDaLista>,
): { itens: Record<string, unknown>[]; erros: ErroNomeado[]; mudou: boolean } {
    const porChave = new Map(gravados.map((g) => [String(g[chaveDoItem]), g]))
    const itens: Record<string, unknown>[] = []
    const erros: ErroNomeado[] = []
    let mudou = linhas.length !== gravados.length || linhas.some((l) => !porChave.has(l.chave))
    linhas.forEach((l, i) => {
        const chave = l.chave.trim()
        if (!chave) { erros.push({ campo: `${chaveDoItem}[${i}]`, mensagem: 'é obrigatório' }); return }
        const r = mudancas(campos, DOMINIO_DO_ITEM, porChave.get(l.chave) ?? null, l.valores)
        erros.push(...r.erros.map((e) => ({ campo: `${chave} · ${e.campo}`, mensagem: e.mensagem })))
        if (Object.keys(r.corpo).length) mudou = true
        itens.push({ [chaveDoItem]: chave, ...r.corpo })
    })
    return { itens, erros, mudou }
}

// ── Fornecedor e linha: SELEÇÃO das tabelas em uso da conta ────────────────────────────────
/**
 * Decisão do dono do produto, 23/10/2026: fornecedor e linha deixam de ser texto livre. A conta já
 * declarou qual tabela usa; digitar "Wolf" onde a tabela diz "Wolff" cria uma divergência que ninguém
 * vê até o orçamento não cruzar.
 *   - FORNECEDOR: o `fornecedor_nome` de cada tabela em uso (`ROTAS_DO_CATALOGO.tabelasDaConta`);
 *   - LINHA: a `linha` das tipologias que a importação gravou para cada tabela em uso
 *     (`ROTAS_DO_CATALOGO.conteudoDaTabela`) — é o único lugar em que uma tabela diz linha. Tabela
 *     ainda não importada não traz linha nenhuma, e a tela diz isso em vez de oferecer lista vazia.
 * O valor GRAVADO que não está mais na lista é mostrado e marcado, NUNCA apagado pela tela: só o que
 * o usuário mudar vai no corpo (`mudancas`), e carregar as opções não muda o formulário.
 */
export const CAMPOS_DA_TABELA = ['fornecedor_perfil', 'linha_perfil'] as const
export type CampoDaTabela = typeof CAMPOS_DA_TABELA[number]
export const ehCampoDaTabela = (c: string): c is CampoDaTabela => (CAMPOS_DA_TABELA as readonly string[]).includes(c)
export const SEM_TABELA_EM_USO = 'Esta conta não tem tabela em uso. Vincule uma tabela à conta primeiro.'
export const SEM_LINHA_NAS_TABELAS = 'As tabelas em uso não trazem linha — a linha vem das tipologias da tabela importada.'
export const FORA_DA_LISTA = 'fora das tabelas em uso'
export const IR_PARA_AS_TABELAS = 'Ir para Tabelas em uso'
/** A seção "Tabelas em uso" da tela da conta — a âncora é o `id` da seção (`ANCORA_DAS_TABELAS_EM_USO`). */
export const rotaDasTabelasDaConta = (tenantId: string) => `${ROUTES.SUPER_ADMIN_IA_CONTAS}/${tenantId}#tabelas-em-uso`

const distintos = (xs: Array<string | null | undefined>) =>
    [...new Set(xs.map((x) => (typeof x === 'string' ? x.trim() : '')).filter((x) => x !== ''))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

export type OpcoesDasTabelas = { temTabela: boolean; fornecedor_perfil: string[]; linha_perfil: string[] }

/** As opções de cada campo, das tabelas em uso e do conteúdo importado de cada uma. */
export function opcoesDasTabelas(
    emUso: ReadonlyArray<{ fornecedor_nome: string }>, conteudos: ReadonlyArray<{ tipologias: ReadonlyArray<{ linha: string | null }> }>,
): OpcoesDasTabelas {
    return {
        temTabela: emUso.length > 0,
        fornecedor_perfil: distintos(emUso.map((t) => t.fornecedor_nome)),
        linha_perfil: distintos(conteudos.flatMap((c) => c.tipologias.map((t) => t.linha))),
    }
}

// ── UM BOTÃO SÓ: o plano do salvar da tela inteira ─────────────────────────────────────────
/**
 * Decisão do dono do produto, 23/10/2026: um único "Salvar alterações" para a tela inteira. Medido:
 * na primeira configuração real saíram duas gravações separadas em dois minutos, e com um botão por
 * bloco dava para salvar o bloco 1, esquecer o 4 e sair com a casa meio configurada.
 *
 * O plano agrupa as mudanças pelas ROTAS: esquadrias e adicionais vão juntos na rota da base; os
 * ambientes e os vendedores, cada um na sua. A regra de "só vai o que mudou" não muda — cada corpo
 * sai de `mudancas` e `corpoDaLista`. Bloco com erro de preenchimento fica FORA da chamada e é
 * relatado como não enviado; os outros blocos da mesma rota seguem.
 *
 * A CONTAGEM é por campo: cada campo que difere do gravado conta um; na lista, o item acrescentado
 * conta um, o removido conta um, e cada campo mudado num item gravado conta um.
 */
export const TITULO_DO_BLOCO: Record<ChaveDoBloco, string> = {
    perfil: 'Perfil',
    vidro: 'Vidro',
    guarnicao: 'Guarnição e contramarco',
    acessorios: 'Acessórios',
    ambientes: 'Padrão por ambiente',
    producao: 'Produção',
    vendedores: 'Vendedores',
    adicionais: 'Adicionais da empresa',
}

export const fraseDasPendencias = (n: number) =>
    (n === 0 ? 'Nenhuma alteração pendente' : n === 1 ? '1 alteração não salva' : `${n} alterações não salvas`)

export type RotaDaChamada = 'base' | 'ambiente' | 'vendedor'
export type Chamada = { rota: RotaDaChamada; corpo: Record<string, unknown>; blocos: ChaveDoBloco[] }
export type Plano = {
    chamadas: Chamada[]
    naoEnviados: Array<{ bloco: ChaveDoBloco; erros: ErroNomeado[] }>
    porBloco: Record<ChaveDoBloco, number>
    total: number
}
export type EstadoDaTela = {
    esquadrias: Record<string, unknown>
    adicionais: Record<string, unknown>
    ambientes: ReadonlyArray<LinhaDaLista>
    vendedores: ReadonlyArray<LinhaDaLista>
}
export type Gravado = {
    empresa: Record<string, unknown> | null
    adicionais: Record<string, unknown> | null
    ambientes: ReadonlyArray<Record<string, unknown>>
    vendedores: ReadonlyArray<Record<string, unknown>>
}

function contarLista(chaveDoItem: string, campos: readonly string[], gravados: ReadonlyArray<Record<string, unknown>>, linhas: ReadonlyArray<LinhaDaLista>): number {
    const porChave = new Map(gravados.map((g) => [String(g[chaveDoItem]), g]))
    const presentes = new Set(linhas.map((l) => l.chave))
    let n = gravados.filter((g) => !presentes.has(String(g[chaveDoItem]))).length
    for (const l of linhas) {
        const g = porChave.get(l.chave)
        if (!g) { n += 1; continue }
        const r = mudancas(campos, DOMINIO_DO_ITEM, g, l.valores)
        n += Object.keys(r.corpo).length + r.erros.length
    }
    return n
}

export function planoDoSalvar(gravado: Gravado, tela: EstadoDaTela): Plano {
    const porBloco = Object.fromEntries(ORDEM_DOS_BLOCOS.map((b) => [b, 0])) as Record<ChaveDoBloco, number>
    const naoEnviados: Plano['naoEnviados'] = []
    const chamadas: Chamada[] = []

    // a rota da base: esquadrias (bloco a bloco) e adicionais
    const esquadrias: Record<string, unknown> = {}
    const blocosDaBase: ChaveDoBloco[] = []
    for (const b of BLOCOS_DE_ESQUADRIAS) {
        const r = mudancas(b.campos, dominioDe, gravado.empresa, tela.esquadrias)
        porBloco[b.chave] = Object.keys(r.corpo).length + r.erros.length
        if (r.erros.length) naoEnviados.push({ bloco: b.chave, erros: r.erros })
        else if (Object.keys(r.corpo).length) { Object.assign(esquadrias, r.corpo); blocosDaBase.push(b.chave) }
    }
    const ad = corpoDosAdicionais(gravado.adicionais, tela.adicionais)
    const mudadosDosAdicionais = ADICIONAIS.flatMap(CAMPOS_DO_ADICIONAL)
        .filter((c) => !mesmoValor(valorDoFormulario(DOMINIO_DO_ADICIONAL(c), tela.adicionais[c]).valor, gravado.adicionais ? gravado.adicionais[c] : null)).length
    porBloco.adicionais = mudadosDosAdicionais
    if (ad.erros.length) naoEnviados.push({ bloco: 'adicionais', erros: ad.erros })
    else if (Object.keys(ad.corpo).length) blocosDaBase.push('adicionais')
    if (blocosDaBase.length) {
        const corpo: Record<string, unknown> = {}
        if (Object.keys(esquadrias).length) corpo.esquadrias = esquadrias
        if (blocosDaBase.includes('adicionais')) corpo.adicionais = ad.corpo
        chamadas.push({ rota: 'base', corpo, blocos: blocosDaBase })
    }

    // as listas: a lista inteira, quando alguma coisa nela mudou
    const listas = [
        { bloco: 'ambientes' as const, rota: 'ambiente' as const, chave: 'ambiente' as const, campos: CAMPOS_DO_AMBIENTE, g: gravado.ambientes, l: tela.ambientes },
        { bloco: 'vendedores' as const, rota: 'vendedor' as const, chave: 'employee_id' as const, campos: CAMPOS_DO_VENDEDOR, g: gravado.vendedores, l: tela.vendedores },
    ]
    for (const x of listas) {
        porBloco[x.bloco] = contarLista(x.chave, x.campos, x.g, x.l)
        const r = corpoDaLista(x.chave, x.campos, x.g, x.l)
        if (r.erros.length) naoEnviados.push({ bloco: x.bloco, erros: r.erros })
        else if (r.mudou) chamadas.push({ rota: x.rota, corpo: x.bloco === 'ambientes' ? { ambientes: r.itens } : { vendedores: r.itens }, blocos: [x.bloco] })
    }

    return { chamadas, naoEnviados, porBloco, total: Object.values(porBloco).reduce((a, b) => a + b, 0) }
}
