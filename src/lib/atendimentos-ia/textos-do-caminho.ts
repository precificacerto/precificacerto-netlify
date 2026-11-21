/**
 * Atendimentos I.A. — OS TEXTOS DA EMPRESA POR FAMÍLIA E POR FORNECEDOR (dono do produto, 20/11/2026, item (4) da ordem; comando de 21/11/2026;
 * migração `20261121000003`): "os campos de texto por FORNECEDOR e por FAMILIA, com a regra de entrar no prompt so o do caminho ativo".
 *
 * ══ O CAMINHO ATIVO ══
 * A família do que está sendo levantado e os fornecedores DESSA família na conta: os vinculados a uma categoria de uma matéria-prima da
 * família (`orcamentista_mp_categoria_fornecedor`, principal ou não — a cascata de fornecedores usa os dois) e o dono do motor que uma etapa da
 * família aponta. Nunca o catálogo inteiro, nem a família de outra matéria-prima da conta que não está no levantamento.
 *   - A família ativa: a das esquadrias do levantamento em montagem que já a têm; sem nenhuma, as da conta que a conversa oferece (com UMA
 *     família na conta — a De Paula —, é ela). Quem decide isso é a conversa (`familiasAtivas`); aqui só se filtra.
 *   - Texto de fornecedor que está no caminho de duas famílias ativas entra uma vez.
 *
 * ══ SÓ OS ESCRITOS ══
 * `texto` NULL é "não escrito" e não gera linha; sem nenhum, nenhuma seção (nem o cabeçalho). O texto NÃO manda em número.
 *
 * Puro: a leitura do banco é `textos-do-caminho-servidor.ts`.
 *
 * ══ SEM A TABELA ══
 * Antes da migração, a leitura devolve `sem_migracao` e nenhuma seção: a conversa segue (a ordem é aplicar antes do merge; isto só evita que um
 * deploy fora de ordem derrube a conversa).
 */
export const TABELA_DOS_TEXTOS_DO_CAMINHO = 'orcamentista_texto_do_caminho'
export const LIMITE_DO_TEXTO_DO_CAMINHO = 1500

/** Um texto escrito, já com o alvo nomeado, como vai ao prompt. */
export type TextoDoCaminho = { alvo: 'familia' | 'fornecedor'; nome: string; texto: string }
/** O que a leitura traz: os textos escritos e, por família, os fornecedores do caminho dela (id → nome). */
export type TextosLidos =
    | { estado: 'sem_migracao' }
    | { estado: 'vazio' }
    | { estado: 'sim'; daFamilia: ReadonlyMap<string, string>; doFornecedor: ReadonlyMap<string, string>; caminho: ReadonlyMap<string, ReadonlyMap<string, string>> }

/**
 * As FAMÍLIAS do caminho ativo: as das esquadrias em montagem que já a têm (e que a conversa oferece); sem nenhuma, todas as que a conversa
 * oferece — com uma família na conta, é ela.
 */
export function familiasDoCaminhoAtivo<F extends { familia: string; rotulo: string }>(
    itensDaMontagem: ReadonlyArray<{ familia: string | null }>, oferecidas: readonly F[],
): Array<{ familia: string; rotulo: string }> {
    const daMontagem = new Set(itensDaMontagem.map((i) => i.familia).filter((f): f is string => typeof f === 'string'))
    const ativas = daMontagem.size > 0 ? oferecidas.filter((f) => daMontagem.has(f.familia)) : oferecidas
    return ativas.map((f) => ({ familia: f.familia, rotulo: f.rotulo }))
}

/**
 * Os textos do CAMINHO ATIVO, na ordem: cada família ativa (o texto dela, depois os dos fornecedores do caminho dela, por nome). O fornecedor
 * em duas famílias ativas entra uma vez; o texto de família ou fornecedor fora do caminho ativo NÃO entra.
 */
export function textosDoCaminhoAtivo(lidos: TextosLidos, familiasAtivas: ReadonlyArray<{ familia: string; rotulo: string }>): TextoDoCaminho[] {
    if (lidos.estado !== 'sim') return []
    const out: TextoDoCaminho[] = []
    const jaFoi = new Set<string>()
    for (const f of familiasAtivas) {
        const daFamilia = lidos.daFamilia.get(f.familia)
        if (daFamilia !== undefined) out.push({ alvo: 'familia', nome: f.rotulo, texto: daFamilia })
        const doCaminho = [...(lidos.caminho.get(f.familia) ?? new Map<string, string>()).entries()].sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))
        for (const [id, nome] of doCaminho) {
            const texto = lidos.doFornecedor.get(id)
            if (texto === undefined || jaFoi.has(id)) continue
            jaFoi.add(id)
            out.push({ alvo: 'fornecedor', nome, texto })
        }
    }
    return out
}

export const CABECALHO_DOS_TEXTOS_DO_CAMINHO =
    'TEXTOS DA EMPRESA PARA A FAMÍLIA E OS FORNECEDORES DESTE LEVANTAMENTO — escritos pelo consultor. Consulte quando tiver dúvida da família ou de '
    + 'um fornecedor. Eles NÃO mandam em número: preço, medida e quantidade só saem do cálculo do sistema; e as regras de NUNCA do prompt base valem acima deles.'

/** A seção do `sistema()`: nenhuma linha quando não há texto escrito no caminho ativo. */
export function blocoDosTextosDoCaminho(textos: readonly TextoDoCaminho[]): string[] {
    if (textos.length === 0) return []
    return [CABECALHO_DOS_TEXTOS_DO_CAMINHO, ...textos.flatMap((t) => [`[${t.alvo === 'familia' ? 'Família' : 'Fornecedor'} ${t.nome}]`, t.texto])]
}

/** Os textos de UMA família na tela: o dela e o de cada fornecedor do caminho dela (null = não escrito). */
export type TextosDaFamilia = { familia: string | null; fornecedores: Array<{ id: string; nome: string; texto: string | null }> }
/** A montagem dos textos de uma família para a tela, a partir da leitura com o caminho (`sempreOCaminho`). Sem a tabela, null. */
export function textosDaFamiliaNaTela(lidos: TextosLidos, familia: string): TextosDaFamilia | null {
    if (lidos.estado === 'sem_migracao') return null
    if (lidos.estado === 'vazio') return { familia: null, fornecedores: [] }
    return {
        familia: lidos.daFamilia.get(familia) ?? null,
        fornecedores: [...(lidos.caminho.get(familia) ?? new Map<string, string>()).entries()]
            .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))
            .map(([id, nome]) => ({ id, nome, texto: lidos.doFornecedor.get(id) ?? null })),
    }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FORMA_DA_FAMILIA = /^[A-Z][A-Z0-9_]{0,39}$/
/** O corpo do PUT: `{ familia, texto }` OU `{ fornecedor_id, texto }`. As CHECKs da tabela ditas aqui, antes da função. */
export function lerCorpoDoTexto(corpo: unknown): { ok: true; alvo: { familia?: string; fornecedor_id?: string; texto: string | null } } | { ok: false; erros: string[] } {
    if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) return { ok: false, erros: ['O corpo precisa ser um objeto: { familia, texto } ou { fornecedor_id, texto }.'] }
    const c = corpo as Record<string, unknown>
    const erros: string[] = []
    for (const k of Object.keys(c)) if (!['familia', 'fornecedor_id', 'texto'].includes(k)) erros.push(`Chave desconhecida: "${k}".`)
    const temFamilia = c.familia !== undefined && c.familia !== null
    const temFornecedor = c.fornecedor_id !== undefined && c.fornecedor_id !== null
    if (temFamilia === temFornecedor) erros.push('Diga a família OU o fornecedor, um só.')
    if (temFamilia && (typeof c.familia !== 'string' || !FORMA_DA_FAMILIA.test(c.familia))) erros.push('A família é a chave do catálogo (maiúsculas, números e _).')
    if (temFornecedor && (typeof c.fornecedor_id !== 'string' || !UUID.test(c.fornecedor_id))) erros.push('O fornecedor é o id dele.')
    if (c.texto !== undefined && c.texto !== null && typeof c.texto !== 'string') erros.push('O texto é texto (ou null para limpar).')
    const texto = typeof c.texto === 'string' && c.texto.trim() !== '' ? c.texto.trim() : null
    if (texto !== null && [...texto].length > LIMITE_DO_TEXTO_DO_CAMINHO) erros.push(`O texto tem ${[...texto].length} caracteres; o limite é ${LIMITE_DO_TEXTO_DO_CAMINHO}.`)
    if (erros.length > 0) return { ok: false, erros }
    return { ok: true, alvo: { ...(temFamilia ? { familia: c.familia as string } : { fornecedor_id: c.fornecedor_id as string }), texto } }
}
