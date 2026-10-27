/**
 * Atendimentos I.A. — a BASE DE CONHECIMENTO: os campos, os domínios, a leitura do corpo e o
 * EFETIVO. Funções puras: não leem banco nem rede. As rotas estão em
 * `src/pages/api/super-admin/base-de-conhecimento/`; a gravação, nas funções da migração
 * `20261023000001`.
 *
 * ══ AUSENTE × NULL × FALSE — os três estados do corpo, e nenhum colapsa ══
 *   - chave AUSENTE no JSON  → não mexer (a função faz `antes || corpo`);
 *   - chave com NULL         → limpar. Na base da empresa, isso é VOLTAR A HERDAR o padrão do nicho;
 *   - chave com FALSE        → gravar false ("esta casa expressamente não usa").
 * O parser JSON do Next preserva os três: a chave ausente não aparece em `Object.keys`, a com null
 * aparece com `null`. Nada aqui troca `null` por default nem descarta chave com valor falsy.
 *
 * ══ OS DOMÍNIOS são os dos CHECK do banco ══
 * Validados ANTES de gravar, para o erro chegar NOMEADO (`campo` + `mensagem`) e não como violação
 * de constraint. A fonte das tabelas é a migração `20261022000004`; o portão
 * `base-de-conhecimento-rotas.test.ts` confere que `CAMPOS_DE_ESQUADRIAS` tem exatamente as colunas
 * de lá (`copia-divergente.md`).
 *
 * Portões: `base-de-conhecimento-rotas.test.ts` (rotas) e `scripts/harness/base-de-conhecimento/`
 * (as funções, num Postgres real).
 */

export type Dominio =
    | { tipo: 'texto' }
    | { tipo: 'textos' }
    | { tipo: 'booleano' }
    | { tipo: 'inteiro'; positivo: boolean }
    | { tipo: 'mapaDeTexto' }
    | { tipo: 'numero'; minimo: number; maximo: number | null }
    | { tipo: 'opcao'; opcoes: readonly string[] }

const TEXTO: Dominio = { tipo: 'texto' }
const BOOLEANO: Dominio = { tipo: 'booleano' }
const MM_POSITIVO: Dominio = { tipo: 'inteiro', positivo: true }
const INTEIRO: Dominio = { tipo: 'inteiro', positivo: false }
const NAO_NEGATIVO: Dominio = { tipo: 'numero', minimo: 0, maximo: null }
const PERCENTUAL_0_A_100: Dominio = { tipo: 'numero', minimo: 0, maximo: 100 }

/** As colunas de configuração de `orcamentista_esquadrias_base` e `_padrao`, na ordem da tabela. */
export const CAMPOS_DE_ESQUADRIAS: Readonly<Record<string, Dominio>> = {
    fornecedor_perfil: TEXTO,
    linha_perfil: TEXTO,
    cor_perfil_predominante: TEXTO,
    cores_perfil: { tipo: 'textos' },
    vidro_predominante: TEXTO,
    vidros: { tipo: 'textos' },
    usa_arremate_interno: BOOLEANO,
    guarnicao_interna: TEXTO,
    guarnicao_interna_mm: MM_POSITIVO,
    usa_arremate_externo: BOOLEANO,
    guarnicao_externa: TEXTO,
    guarnicao_externa_mm: MM_POSITIVO,
    montagem_arremate_externo: TEXTO,
    medida_arremate_externo: TEXTO,
    usa_contramarco: BOOLEANO,
    cor_acessorio_por_perfil: { tipo: 'mapaDeTexto' },
    regiao_litoranea: BOOLEANO,
    modelo_interlock: TEXTO,
    fechamento_folha_interna: TEXTO,
    fechamento_folha_externa: TEXTO,
    macaneta_sem_chave: TEXTO,
    solda: TEXTO,
    vedacao: TEXTO,
    folga_instalacao_x: INTEIRO,
    folga_instalacao_y: INTEIRO,
    barra_mm: MM_POSITIVO,
    serra_mm: MM_POSITIVO,
}

export const MODOS_DO_ADICIONAL = ['NAO_COBRA', 'VALOR', 'PERCENTUAL'] as const

/** As colunas de `orcamentista_base_conhecimento`: frete e instalação, em qualquer nicho. */
export const CAMPOS_DOS_ADICIONAIS: Readonly<Record<string, Dominio>> = {
    frete_modo: { tipo: 'opcao', opcoes: MODOS_DO_ADICIONAL },
    frete_valor: NAO_NEGATIVO,
    frete_percentual: NAO_NEGATIVO,
    frete_base: { tipo: 'opcao', opcoes: ['VALOR_POS_DESCONTO', 'CUSTO_DO_FRETE'] },
    instalacao_modo: { tipo: 'opcao', opcoes: MODOS_DO_ADICIONAL },
    instalacao_valor: NAO_NEGATIVO,
    instalacao_percentual: NAO_NEGATIVO,
    instalacao_base: { tipo: 'opcao', opcoes: ['VALOR_POS_DESCONTO', 'CUSTO_DA_INSTALACAO'] },
}

const CAMPOS_DO_AMBIENTE: Readonly<Record<string, Dominio>> = { ambiente: TEXTO, vidro_padrao: TEXTO, tipologia_usual: TEXTO }

const CAMPOS_DO_VENDEDOR: Readonly<Record<string, Dominio>> = {
    employee_id: TEXTO,
    comissao_percentual: PERCENTUAL_0_A_100,
    comissao_modo: { tipo: 'opcao', opcoes: ['PROPORCIONAL', 'CONGELADA'] },
    reserva_tecnica_percentual: PERCENTUAL_0_A_100,
    lucro_projetado_percentual: PERCENTUAL_0_A_100,
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INT4_MIN = -2147483648
const INT4_MAX = 2147483647

/**
 * O nicho que tem esquadrias. O schema não impede padrão de esquadrias num nicho de outra natureza
 * (um CHECK não lê outra tabela) — limite aceito pelo dono do produto, 22/10/2026, que fica COM A
 * ROTA. A identificação é pelo par (modelo, nome) de `orcamentista_nicho`: renomear o nicho
 * Esquadrias no catálogo muda o que esta função reconhece. Por isso a rota procura no catálogo
 * inteiro e NOMEIA a falha quando nenhum ou mais de um casa (`exigirNichoDasEsquadrias`).
 */
export const NICHO_DAS_ESQUADRIAS = { modelo: 'FABRICACAO', nome: 'Esquadrias' } as const
export function ehNichoDasEsquadrias(nicho: { modelo?: unknown; nome?: unknown } | null | undefined): boolean {
    return !!nicho && nicho.modelo === NICHO_DAS_ESQUADRIAS.modelo
        && typeof nicho.nome === 'string' && nicho.nome.trim().toLowerCase() === NICHO_DAS_ESQUADRIAS.nome.toLowerCase()
}

// ── A LEITURA DO CORPO ─────────────────────────────────────────────────────────────────────
export type ErroNomeado = { campo: string; mensagem: string }
type Leitura<T> = { valor: T | null; erros: ErroNomeado[] }

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** O valor normalizado, ou a mensagem do que está errado. NULL não passa por aqui: é sempre "limpar". */
function lerValor(d: Dominio, v: unknown): { ok: true; valor: unknown } | { ok: false; mensagem: string } {
    switch (d.tipo) {
        case 'texto':
            return typeof v === 'string' && v.trim() !== '' ? { ok: true, valor: v.trim() } : { ok: false, mensagem: 'tem de ser um texto preenchido (para limpar, envie null)' }
        case 'textos':
            return Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '')
                ? { ok: true, valor: (v as string[]).map((x) => x.trim()) }
                : { ok: false, mensagem: 'tem de ser uma lista de textos preenchidos' }
        case 'booleano':
            return typeof v === 'boolean' ? { ok: true, valor: v } : { ok: false, mensagem: 'tem de ser true ou false' }
        case 'inteiro':
            if (typeof v !== 'number' || !Number.isInteger(v) || v < INT4_MIN || v > INT4_MAX) return { ok: false, mensagem: 'tem de ser um número inteiro' }
            return d.positivo && v <= 0 ? { ok: false, mensagem: 'tem de ser maior que zero' } : { ok: true, valor: v }
        case 'numero':
            if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, mensagem: 'tem de ser um número' }
            if (v < d.minimo) return { ok: false, mensagem: `não pode ser menor que ${d.minimo}` }
            return d.maximo !== null && v > d.maximo ? { ok: false, mensagem: `não pode ser maior que ${d.maximo}` } : { ok: true, valor: v }
        case 'mapaDeTexto':
            return ehObjeto(v) && Object.entries(v).every(([k, x]) => k.trim() !== '' && typeof x === 'string' && x.trim() !== '')
                ? { ok: true, valor: v }
                : { ok: false, mensagem: 'tem de ser um mapa de texto para texto, ex.: {"branco":"branco"}' }
        case 'opcao':
            return typeof v === 'string' && d.opcoes.includes(v) ? { ok: true, valor: v } : { ok: false, mensagem: `tem de ser um destes: ${d.opcoes.join(', ')}` }
    }
}

/**
 * Lê um objeto de campos preservando os três estados: só as chaves PRESENTES saem no resultado;
 * a com null sai null; o resto sai normalizado. Chave fora de `campos` é erro nomeado.
 */
export function lerCampos(bruto: unknown, campos: Readonly<Record<string, Dominio>>, prefixo: string, obrigatorios: readonly string[] = []): Leitura<Record<string, unknown>> {
    if (!ehObjeto(bruto)) return { valor: null, erros: [{ campo: prefixo, mensagem: 'tem de ser um objeto' }] }
    const erros: ErroNomeado[] = []
    const valor: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(bruto)) {
        const d = campos[k]
        if (!d) { erros.push({ campo: `${prefixo}.${k}`, mensagem: 'campo desconhecido' }); continue }
        if (v === null) {
            if (obrigatorios.includes(k)) erros.push({ campo: `${prefixo}.${k}`, mensagem: 'é obrigatório' })
            else valor[k] = null
            continue
        }
        const lido = lerValor(d, v)
        if (lido.ok === true) valor[k] = lido.valor
        else erros.push({ campo: `${prefixo}.${k}`, mensagem: (lido as { mensagem: string }).mensagem })
    }
    for (const k of obrigatorios) if (!(k in bruto)) erros.push({ campo: `${prefixo}.${k}`, mensagem: 'é obrigatório' })
    return { valor, erros }
}

/** A coerência de frete e instalação, sobre o estado RESULTANTE (o que já estava + o corpo). */
export function errosDeCoerenciaDosAdicionais(estado: Record<string, unknown>, prefixo = 'adicionais'): ErroNomeado[] {
    const erros: ErroNomeado[] = []
    for (const x of ['frete', 'instalacao']) {
        const modo = estado[`${x}_modo`] ?? null
        const tem = (c: string) => estado[`${x}_${c}`] !== null && estado[`${x}_${c}`] !== undefined
        const exige = (c: string, quer: boolean, porque: string) => {
            if (tem(c) !== quer) erros.push({ campo: `${prefixo}.${x}_${c}`, mensagem: quer ? `é obrigatório ${porque}` : `tem de ser nulo ${porque}` })
        }
        if (modo === 'VALOR') {
            exige('valor', true, 'com modo VALOR'); exige('percentual', false, 'com modo VALOR'); exige('base', false, 'com modo VALOR')
        } else if (modo === 'PERCENTUAL') {
            exige('percentual', true, 'com modo PERCENTUAL'); exige('base', true, 'com modo PERCENTUAL'); exige('valor', false, 'com modo PERCENTUAL')
        } else {
            const porque = modo === 'NAO_COBRA' ? 'com modo NAO_COBRA' : 'sem modo'
            exige('valor', false, porque); exige('percentual', false, porque); exige('base', false, porque)
        }
    }
    return erros
}

/** O corpo do PUT da base da empresa: `{ esquadrias?, adicionais? }`, ao menos um, nenhum vazio. */
export function lerCorpoDaBase(corpo: unknown): { esquadrias: Record<string, unknown> | null; adicionais: Record<string, unknown> | null; erros: ErroNomeado[] } {
    if (!ehObjeto(corpo)) return { esquadrias: null, adicionais: null, erros: [{ campo: 'corpo', mensagem: 'tem de ser um objeto' }] }
    const erros: ErroNomeado[] = []
    for (const k of Object.keys(corpo)) if (k !== 'esquadrias' && k !== 'adicionais') erros.push({ campo: k, mensagem: 'campo desconhecido' })
    if (!('esquadrias' in corpo) && !('adicionais' in corpo)) erros.push({ campo: 'corpo', mensagem: 'envie esquadrias e/ou adicionais' })
    const ler = (k: 'esquadrias' | 'adicionais', campos: Readonly<Record<string, Dominio>>) => {
        if (!(k in corpo)) return null
        const lido = lerCampos(corpo[k], campos, k)
        erros.push(...lido.erros)
        if (lido.valor && Object.keys(lido.valor).length === 0 && lido.erros.length === 0) erros.push({ campo: k, mensagem: 'está vazio' })
        return lido.valor
    }
    const esquadrias = ler('esquadrias', CAMPOS_DE_ESQUADRIAS)
    const adicionais = ler('adicionais', CAMPOS_DOS_ADICIONAIS)
    return { esquadrias, adicionais, erros }
}

/** O corpo do PUT do padrão do nicho: `{ esquadrias }`. */
export function lerCorpoDoPadrao(corpo: unknown): { esquadrias: Record<string, unknown> | null; erros: ErroNomeado[] } {
    if (!ehObjeto(corpo)) return { esquadrias: null, erros: [{ campo: 'corpo', mensagem: 'tem de ser um objeto' }] }
    const erros: ErroNomeado[] = Object.keys(corpo).filter((k) => k !== 'esquadrias').map((k) => ({ campo: k, mensagem: 'campo desconhecido' }))
    if (!('esquadrias' in corpo)) return { esquadrias: null, erros: [...erros, { campo: 'esquadrias', mensagem: 'é obrigatório' }] }
    const lido = lerCampos(corpo.esquadrias, CAMPOS_DE_ESQUADRIAS, 'esquadrias')
    erros.push(...lido.erros)
    if (lido.valor && Object.keys(lido.valor).length === 0 && lido.erros.length === 0) erros.push({ campo: 'esquadrias', mensagem: 'está vazio' })
    return { esquadrias: lido.valor, erros }
}

/** Uma lista é o ESTADO inteiro: item que não vier sai. Dentro do item, ausente × null × false como sempre. */
function lerLista(corpo: unknown, chave: string, campos: Readonly<Record<string, Dominio>>, chaveDoItem: string, validarChave?: (v: unknown) => string | null) {
    if (!ehObjeto(corpo)) return { lista: null, erros: [{ campo: 'corpo', mensagem: 'tem de ser um objeto' }] }
    const erros: ErroNomeado[] = Object.keys(corpo).filter((k) => k !== chave).map((k) => ({ campo: k, mensagem: 'campo desconhecido' }))
    const bruta = corpo[chave]
    if (!Array.isArray(bruta)) return { lista: null, erros: [...erros, { campo: chave, mensagem: 'tem de ser uma lista' }] }
    const lista: Record<string, unknown>[] = []
    const vistos = new Set<string>()
    bruta.forEach((item, i) => {
        const prefixo = `${chave}[${i}]`
        const lido = lerCampos(item, campos, prefixo, [chaveDoItem])
        erros.push(...lido.erros)
        if (!lido.valor) return
        const k = lido.valor[chaveDoItem]
        if (typeof k === 'string') {
            const problema = validarChave ? validarChave(k) : null
            if (problema) erros.push({ campo: `${prefixo}.${chaveDoItem}`, mensagem: problema })
            else if (vistos.has(k.toLowerCase())) erros.push({ campo: `${prefixo}.${chaveDoItem}`, mensagem: 'repetido na lista' })
            vistos.add(k.toLowerCase())
        }
        lista.push(lido.valor)
    })
    return { lista, erros }
}

export function lerCorpoDosAmbientes(corpo: unknown) {
    return lerLista(corpo, 'ambientes', CAMPOS_DO_AMBIENTE, 'ambiente')
}

export function lerCorpoDosVendedores(corpo: unknown) {
    return lerLista(corpo, 'vendedores', CAMPOS_DO_VENDEDOR, 'employee_id', (v) => (typeof v === 'string' && UUID.test(v) ? null : 'tem de ser o id (uuid) de um funcionário'))
}

// ── O EFETIVO ──────────────────────────────────────────────────────────────────────────────
export type Origem = 'empresa' | 'nicho' | 'sem valor'
export type Efetivo = Record<string, { valor: unknown; origem: Origem }>

/**
 * COALESCE(empresa, nicho), campo a campo, com a ORIGEM. `false` da empresa é decisão e vence o
 * `true` do nicho; só NULL (ou linha inexistente) herda.
 */
export function efetivoDasEsquadrias(empresa: Record<string, unknown> | null, nicho: Record<string, unknown> | null): Efetivo {
    const efetivo: Efetivo = {}
    for (const c of Object.keys(CAMPOS_DE_ESQUADRIAS)) {
        const e = empresa ? empresa[c] : null
        const n = nicho ? nicho[c] : null
        if (e !== null && e !== undefined) efetivo[c] = { valor: e, origem: 'empresa' }
        else if (n !== null && n !== undefined) efetivo[c] = { valor: n, origem: 'nicho' }
        else efetivo[c] = { valor: null, origem: 'sem valor' }
    }
    return efetivo
}

// ── OS TRÊS NÍVEIS — o corpo é um ENVELOPE, e o conteúdo é da função ─────────────────────────
/**
 * O corpo das rotas dos três níveis: um objeto com UMA chave, e só ela. O VALOR vai à função como
 * veio — a rota não revalida o que a função valida (tipo, catálogo, ordem, principal, nicho), e não
 * tira nem acrescenta nada: null, false e ausente chegam à função intactos.
 *
 * O que a rota recusa é só o ENVELOPE: chave a mais, chave a menos, e `por` — o autor é o usuário
 * da SESSÃO, e um `por` no corpo é erro, não dado.
 */
export function lerEnvelope(corpo: unknown, chave: string): { valor: unknown; erros: ErroNomeado[] } {
    if (!ehObjeto(corpo)) return { valor: null, erros: [{ campo: 'corpo', mensagem: 'tem de ser um objeto' }] }
    const erros: ErroNomeado[] = Object.keys(corpo).filter((k) => k !== chave).map((k) => (k === 'por'
        ? { campo: 'por', mensagem: 'o autor é o usuário da sessão: `por` no corpo não é aceito' }
        : { campo: k, mensagem: 'campo desconhecido' }))
    if (!(chave in corpo)) erros.push({ campo: chave, mensagem: 'obrigatório' })
    return { valor: erros.length === 0 ? corpo[chave] : null, erros }
}

/** O corpo de um DELETE: vazio. Qualquer chave é erro nomeado — `por` com a mensagem dele. */
export function errosDoCorpoVazio(corpo: unknown): ErroNomeado[] {
    if (corpo === undefined || corpo === null || corpo === '') return []
    if (!ehObjeto(corpo)) return [{ campo: 'corpo', mensagem: 'tem de ser vazio' }]
    return Object.keys(corpo).map((k) => (k === 'por'
        ? { campo: 'por', mensagem: 'o autor é o usuário da sessão: `por` no corpo não é aceito' }
        : { campo: k, mensagem: 'campo desconhecido: este pedido não tem corpo' }))
}

/**
 * O corpo do PUT /familia-da-materia-prima: `{ materia_prima: uuid, familia: texto | null }`. A família AUSENTE não é
 * null — ausente não limpa por omissão: quem quer limpar manda `null`. O autor é o da sessão (`por` é erro).
 */
export function lerCorpoDaFamiliaDaMateriaPrima(corpo: unknown): { materia_prima: string; familia: string | null; erros: ErroNomeado[] } {
    const b = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null
    if (!b) return { materia_prima: '', familia: null, erros: [{ campo: 'corpo', mensagem: 'o corpo é { materia_prima, familia }' }] }
    const erros: ErroNomeado[] = Object.keys(b).filter((k) => k !== 'materia_prima' && k !== 'familia').map((k) => (k === 'por'
        ? { campo: 'por', mensagem: 'o autor é o usuário da sessão: `por` no corpo não é aceito' }
        : { campo: k, mensagem: 'campo desconhecido (só materia_prima e familia)' }))
    if (typeof b.materia_prima !== 'string' || !UUID.test(b.materia_prima)) erros.push({ campo: 'materia_prima', mensagem: 'obrigatório: o id da matéria-prima' })
    if (!('familia' in b)) erros.push({ campo: 'familia', mensagem: 'obrigatório: a família da lista, ou null para limpar' })
    else if (b.familia !== null && (typeof b.familia !== 'string' || b.familia.trim() === '')) erros.push({ campo: 'familia', mensagem: 'a família é um texto da lista, ou null para limpar' })
    return { materia_prima: typeof b.materia_prima === 'string' ? b.materia_prima : '', familia: typeof b.familia === 'string' ? b.familia.trim() : null, erros }
}
