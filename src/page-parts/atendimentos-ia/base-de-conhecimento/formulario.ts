/**
 * A TELA da base de conhecimento — o que é puro: as rotas que ela chama, os blocos, os rótulos, e a
 * montagem do CORPO das rotas da EMPRESA (adicionais, ambientes, vendedores). Nada aqui lê rede nem
 * React. O miolo dos três níveis — o cartão "Matérias-primas e seus fornecedores" — monta a árvore em
 * `arvore.ts`.
 *
 * ══ OS CINCO BLOCOS DE ESQUADRIAS SAÍRAM ══
 * Perfil, Vidro, Guarnição e contramarco, Acessórios e Produção (o modelo de UM nível, em
 * `orcamentista_esquadrias_base`) saíram da tela por decisão do dono do produto, 23/10/2026, quando o
 * cartão dos três níveis entrou no lugar deles. A rota PUT /base continua aceitando `esquadrias`; a
 * tela é que não manda mais. Medido no mesmo dia: 1 linha gravada em `orcamentista_esquadrias_base`, e
 * nenhum leitor dela fora desta tela e das rotas dela — a linha fica no banco, sem tela.
 *
 * ══ SÓ O QUE MUDOU VAI NO CORPO ══
 * As rotas tratam a chave AUSENTE como "não mexer", NULL como "limpar" e FALSE como false
 * (`src/lib/atendimentos-ia/base-de-conhecimento.ts`). Por isso a tela NUNCA serializa o formulário
 * inteiro: o corpo leva só o campo cujo valor no formulário é DIFERENTE do gravado. Campo não tocado
 * não vai; campo esvaziado vai null.
 *
 * ══ OS ADICIONAIS ══
 * Trocar o modo limpa o que o modo novo não usa (VALOR limpa percentual e base; PERCENTUAL limpa o
 * valor; "não cobra" e "sem modo" limpam os três) — a regra de coerência da rota é sobre o estado
 * RESULTANTE, e a tela confere a mesma regra (`errosDeCoerenciaDosAdicionais`) antes de enviar:
 * PERCENTUAL sem base não sai da tela.
 */
import { ROUTES } from '@/constants/routes'
import { errosDeCoerenciaDosAdicionais, type Dominio, type ErroNomeado } from '@/lib/atendimentos-ia/base-de-conhecimento'

const RAIZ = '/api/super-admin/base-de-conhecimento'
const daEmpresa = (sufixo: string, tenantId: string) => `${RAIZ}${sufixo}?tenant=${encodeURIComponent(tenantId)}`

export const ROTAS_DA_BASE = {
    base: (tenantId: string) => daEmpresa('', tenantId),
    ambiente: (tenantId: string) => daEmpresa('/ambiente', tenantId),
    vendedor: (tenantId: string) => daEmpresa('/vendedor', tenantId),
    funcionarios: (tenantId: string) => daEmpresa('/funcionarios', tenantId),
    /** GET e PUT da árvore dos três níveis — `superadmin_gravar_arvore`, numa transação só. */
    arvore: (tenantId: string) => daEmpresa('/arvore', tenantId),
}

/** A tela: dentro da conta, para a empresa estar no CAMINHO e não num seletor do formulário. */
export const rotaDaTelaDaBase = (tenantId: string) => `${ROUTES.SUPER_ADMIN_IA_CONTAS}/${tenantId}/base-de-conhecimento`

export const ROTULO_DO_CAMPO: Record<string, string> = {
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

export type ChaveDoBloco = 'materias' | 'ambientes' | 'vendedores' | 'adicionais'

/** A ordem dos quatro blocos na tela: o miolo dos três níveis, e os três da empresa. */
export const ORDEM_DOS_BLOCOS: readonly ChaveDoBloco[] = ['materias', 'ambientes', 'vendedores', 'adicionais']

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
    frete: [{ valor: 'VALOR_POS_DESCONTO', rotulo: 'Valor recalculado pós-desconto' }, { valor: 'CUSTO_DO_FRETE', rotulo: 'Custo do frete' }],
    instalacao: [{ valor: 'VALOR_POS_DESCONTO', rotulo: 'Valor recalculado pós-desconto' }, { valor: 'CUSTO_DA_INSTALACAO', rotulo: 'Custo da instalação' }],
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
    materias: 'Matérias-primas e seus fornecedores',
    ambientes: 'Padrão por ambiente',
    vendedores: 'Vendedores',
    adicionais: 'Adicionais da empresa',
}

export const fraseDasPendencias = (n: number) =>
    (n === 0 ? 'Nenhuma alteração pendente' : n === 1 ? '1 alteração não salva' : `${n} alterações não salvas`)

export type RotaDaChamada = 'base' | 'ambiente' | 'vendedor' | 'arvore'
export type Chamada = { rota: RotaDaChamada; corpo: Record<string, unknown>; blocos: ChaveDoBloco[] }
export type Plano = {
    chamadas: Chamada[]
    naoEnviados: Array<{ bloco: ChaveDoBloco; erros: ErroNomeado[] }>
    porBloco: Record<ChaveDoBloco, number>
    total: number
}
export type EstadoDaTela = {
    adicionais: Record<string, unknown>
    ambientes: ReadonlyArray<LinhaDaLista>
    vendedores: ReadonlyArray<LinhaDaLista>
}
export type Gravado = {
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

    // a rota da base: SÓ os adicionais — as esquadrias de um nível saíram da tela (ver o cabeçalho)
    const ad = corpoDosAdicionais(gravado.adicionais, tela.adicionais)
    const mudadosDosAdicionais = ADICIONAIS.flatMap(CAMPOS_DO_ADICIONAL)
        .filter((c) => !mesmoValor(valorDoFormulario(DOMINIO_DO_ADICIONAL(c), tela.adicionais[c]).valor, gravado.adicionais ? gravado.adicionais[c] : null)).length
    porBloco.adicionais = mudadosDosAdicionais
    if (ad.erros.length) naoEnviados.push({ bloco: 'adicionais', erros: ad.erros })
    else if (Object.keys(ad.corpo).length) chamadas.push({ rota: 'base', corpo: { adicionais: ad.corpo }, blocos: ['adicionais'] })

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
