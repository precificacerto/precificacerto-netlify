/**
 * A TELA da base de conhecimento em TRÊS NÍVEIS — o que é puro: a árvore lida (GET /arvore), o
 * formulário, e a montagem da ÁRVORE do PUT /arvore (função `superadmin_gravar_arvore`, migração
 * `20261023000004`). Nada aqui lê rede nem React.
 *
 * ══ AS REGRAS DA FUNÇÃO, que a tela respeita — portão `base-de-conhecimento-tres-niveis-a-tela.test.tsx` ══
 *   - `materias_primas` vai com a LISTA INTEIRA: a ordem é a posição, e mandar parcial reordenaria o
 *     resto. Sem matéria-prima na tela, a chave NÃO vai — lista vazia é recusada, porque a função 1
 *     não apaga;
 *   - remoções vão em `remover: [uuid]`, e remover e gravar a MESMA matéria-prima no mesmo salvar é
 *     barrado AQUI (`fraseRemoverEGravar`), antes de a função recusar com 400;
 *   - `ordem` nunca vai no corpo;
 *   - dentro de cada categoria, SÓ O QUE MUDOU: o `config` só com as chaves mudadas (null limpa, false
 *     é "não", a chave AUSENTE não mexe); uma lista só vai se mudou, e então INTEIRA — o item que não
 *     vier sai —, com o item gravado levando só a sua chave e o que mudou nele;
 *   - a matéria-prima é endereçada pelo NOME, e o nome da gravada não se edita: a chave é
 *     `lower(nome)`, a função 1 recusa `id`, e não existe renomear (um nome novo é outra).
 *
 * ══ O CATÁLOGO MANDA ══
 * As categorias, a ordem, o número e o rótulo, e os campos de cada uma com o tipo, vêm de
 * `catalogo` (`orcamentista_categoria_catalogo` e `_campo`). Nenhuma lista de campos está escrita
 * aqui: um campo novo no catálogo aparece na tela sem mudar a tela. O que está escrito são os três
 * domínios que o banco ENUMERA por CHECK, e que não têm catálogo — ver cada constante.
 */
import { campoForaDaTela, type ErroNomeado } from '@/lib/atendimentos-ia/base-de-conhecimento'
import { TITULO_DO_BLOCO, mapaDosPares, mesmoValor, paresDoMapa, type Par } from '@/page-parts/atendimentos-ia/base-de-conhecimento/formulario'

type Linha = Record<string, unknown>

// ── A árvore lida: o que GET /arvore devolve (`lerArvoreDaEmpresa`) ───────────────────────────
export type TipoDoCampo = 'texto' | 'inteiro' | 'numero' | 'booleano' | 'lista_texto' | 'mapa' | 'opcao'
/**
 * Os tipos que a tela sabe desenhar e normalizar. O catálogo é dado do banco e pode trazer um tipo
 * que esta versão da tela ainda não conhece: esse campo é tratado como AUSENTE — não aparece, não
 * conta no "N de 6 categorias" e NÃO entra no corpo do salvar (null o apagaria; ausente não mexe).
 * Quebrar a tela inteira por um campo novo no catálogo foi o que a 20261024000002 teria causado.
 */
const TIPOS_CONHECIDOS: readonly string[] = ['texto', 'inteiro', 'numero', 'booleano', 'lista_texto', 'mapa', 'opcao'] satisfies readonly TipoDoCampo[]
export const tipoConhecido = (tipo: string): tipo is TipoDoCampo => TIPOS_CONHECIDOS.includes(tipo)
export type CategoriaDoCatalogo = { chave: string; ordem: number; rotulo: string }
/** `opcoes` só vem no tipo 'opcao' (20261024000002); antes da migração a coluna nem existe. */
export type CampoDoCatalogo = { categoria_chave: string; chave: string; tipo: TipoDoCampo; rotulo: string; ordem: number; opcoes?: string[] | null }
export type FornecedorGravado = Linha & { fornecedor_id: string; principal: boolean; ordem: number; nome_do_fornecedor?: string | null }
export type CategoriaLida = Linha & {
    id: string; categoria_chave: string; config: Linha | null; fornecedores: FornecedorGravado[]
    vidros?: Linha[]; ferragens?: Linha[]; instalacao?: Linha[]
}
export type MateriaPrimaLida = Linha & { id: string; nome: string; ordem: number; familia?: string | null; categorias: CategoriaLida[] }
/** As famílias da lista e as ramificações que cada uma declara (`orcamentista_familia_ramificacao`), na ordem dela. */
export type FamiliaDoCatalogo = { chave: string; rotulo: string; ordem: number }
export type RamificacaoDaFamilia = { familia: string; categoria_chave: string; ordem: number }
export type ArvoreLida = {
    tenant_id: string
    nicho: { id: string; modelo: string; nome: string } | null
    catalogo: { categorias: CategoriaDoCatalogo[]; campos: CampoDoCatalogo[]; familias?: FamiliaDoCatalogo[]; ramificacoes?: RamificacaoDaFamilia[] }
    /** `categorias_das_tabelas`: de quais categorias o fornecedor TEM tabela; `tabelas_sem_categoria`: as tabelas dele sem categoria declarada. */
    fornecedores_do_nicho: Array<{ id: string; nome: string; categorias_das_tabelas: string[]; tabelas_sem_categoria: number }>
    /** fornecedor → as linhas da tabela em uso dele NESTA conta, POR FONTE. Sem chave: o fornecedor não tem tabela em uso. */
    linhas_por_fornecedor: Record<string, { formula: string[]; regra: string[] }>
    materias_primas: MateriaPrimaLida[]
}

// ── Os textos da tela ──────────────────────────────────────────────────────────────────────
export const TITULO_DO_CARTAO = TITULO_DO_BLOCO.materias
export const ADICIONAR_MATERIA_PRIMA = '+ Adicionar matéria-prima'
export const ADICIONAR_VIDRO = '+ Adicionar vidro'
export const ADICIONAR_FERRAGEM = '+ Adicionar ferragem'
export const NOVO_FORNECEDOR = '+ fornecedor'
export const AVISO_DO_FILTRO_DE_FORNECEDOR = 'Só aparecem para escolher os fornecedores que têm tabela desta categoria.'
export const SEM_TABELA_DESTA_CATEGORIA = 'sem tabela desta categoria'

/** Os fornecedores do nicho que têm tabela da categoria — os únicos que a lista de "+ fornecedor" oferece. Pura. */
export function fornecedoresComTabelaDaCategoria(arvore: Pick<ArvoreLida, 'fornecedores_do_nicho'>, categoria: string) {
    return arvore.fornecedores_do_nicho.filter((f) => f.categorias_das_tabelas.includes(categoria))
}

/** Os fornecedores com tabela SEM categoria declarada: não aparecem em categoria nenhuma, e a tela diz quais. Pura. */
export function fornecedoresComTabelaSemCategoria(arvore: Pick<ArvoreLida, 'fornecedores_do_nicho'>) {
    return arvore.fornecedores_do_nicho.filter((f) => f.tabelas_sem_categoria > 0)
}

/**
 * Por que a lista de uma ramificação está como está — quando NÃO sobra ninguém para escolher, a tela diz por quê em vez de deixar o combo
 * vazio: ou nenhum fornecedor do nicho tem tabela da categoria, ou os que têm já estão na lista. E nomeia os fornecedores cuja tabela não
 * declara categoria (não aparecem em categoria nenhuma até alguém declarar a da tabela, no Catálogo).
 */
export function fraseDaListaDeFornecedoresVazia(rotuloDaCategoria: string, comTabelaDaCategoria: number, semCategoria: readonly string[]): string {
    const base = comTabelaDaCategoria === 0
        ? `Nenhum fornecedor do nicho tem tabela da categoria ${rotuloDaCategoria}.`
        : `Todos os fornecedores com tabela da categoria ${rotuloDaCategoria} já estão nesta lista.`
    if (semCategoria.length === 0) return base
    const nomes = [...semCategoria].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')
    return `${base} ${semCategoria.length === 1 ? 'Um fornecedor tem tabela' : `${semCategoria.length} fornecedores têm tabela`} sem categoria declarada e por isso não aparece${semCategoria.length === 1 ? '' : 'm'} em categoria nenhuma: ${nomes}. Declare a categoria da tabela no Catálogo.`
}
/** O botão da borda direita do cabeçalho da família (dono do produto, 29/10/2026): marca a família para sair no salvar, com "Desfazer". */
export const REMOVER_FAMILIA = 'Remover família'
export const SEM_FAMILIA_NA_MATERIA_PRIMA =
    'A família desta matéria-prima não está informada: a tela mostra todas as categorias do catálogo. Escolha a família para ver só as ramificações dela.'
export const fraseFamiliaSemRamificacao = (rotulo: string) =>
    `A família ${rotulo} ainda não declara ramificações: não há categoria a mostrar além das que já têm algo gravado.`
export const fraseCategoriaForaDaFamilia = (rotulo: string) =>
    `${rotulo} não é ramificação da família desta matéria-prima, mas tem dados gravados — por isso continua aqui.`
export const FAMILIA_DEPOIS_DE_SALVAR = 'A família se escolhe depois de salvar a matéria-prima.'
/**
 * DUAS INSTÂNCIAS "IGUAIS" SÃO AVISO, NÃO TRAVA (dono do produto, 28/10/2026): a mesma empresa pode ter várias famílias do mesmo tipo (três
 * famílias PVC, cada uma com os seus fornecedores), e a unicidade que o banco guarda é só a do título. Quando duas matérias-primas têm o mesmo
 * tipo e os MESMOS fornecedores principais em cada categoria, a tela avisa — pode ser a mesma família cadastrada duas vezes —, e nada impede
 * salvar. Lê o formulário como está na tela; só matéria-prima com tipo entra.
 */
export function instanciasIguais(materias: readonly MateriaPrimaDoFormulario[]): Array<{ familia: string; nomes: string[] }> {
    const grupos = new Map<string, { familia: string; nomes: string[] }>()
    for (const m of materias) {
        if (!m.familia) continue
        const principais = m.categorias.filter((c) => c.fornecedores.principal).map((c) => `${c.chave}=${c.fornecedores.principal}`).sort().join('|')
        const chave = `${m.familia}#${principais}`
        const g = grupos.get(chave) ?? { familia: m.familia, nomes: [] }
        g.nomes.push(m.nome.trim() || '(sem título)')
        grupos.set(chave, g)
    }
    return [...grupos.values()].filter((g) => g.nomes.length > 1)
}
export const fraseDasInstanciasIguais = (nomes: readonly string[], tipo: string) =>
    `As famílias ${nomes.map((n) => `"${n}"`).join(' e ')} são do mesmo tipo (${tipo}) e têm os mesmos fornecedores principais: confira se não são a mesma família cadastrada duas vezes. É só um aviso — nada impede salvar.`
export const FAMILIA_COM_PENDENCIA = 'Salve as alterações antes de trocar a família: a tela é relida.'
export const fraseRemoverEGravar = (nome: string) =>
    `"${nome}" está marcada para remoção neste salvar: desfaça a remoção ou use outro nome — remover e gravar a mesma matéria-prima no mesmo salvar é recusado.`
export const USA_SEM_REFERENCIA = 'com "Usa?" em Sim, a referência é obrigatória'
/** A opção de deixar o campo 'opcao' em branco: NULL = ainda não configurado, nunca uma escolha por omissão. */
export const EM_BRANCO_DA_OPCAO = 'Em branco — ainda não configurado'

// ── PERFIL.linha: a origem é a TELA, não o catálogo ────────────────────────────────────────
/**
 * No catálogo a linha do perfil é `texto`, e continua sendo: o catálogo diz o tipo do valor, não de
 * onde vêm as opções. Quem sabe a origem é a tela (dono do produto, 23/10/2026): a linha é COMBOBOX —
 * oferece as linhas da tabela em uso do fornecedor PRINCIPAL do PERFIL (`linhas_por_fornecedor`,
 * fórmula ∪ regra do motor) e aceita outra digitada. Sem principal, ou com principal sem tabela em
 * uso, a tela diz isso em vez de oferecer uma lista vazia em silêncio.
 *
 * A linha escolhida tem TRÊS estados, e cada um tem o seu aviso — nenhum bloqueia o salvar:
 *   1. com fórmula da linha — sem aviso;
 *   2. só com regra, sem fórmula da linha (DESIGN, medido em 23/10/2026) — a tabela não dimensiona
 *      essa linha: defeito da TABELA IMPORTADA, e o conserto é lá;
 *   3. fora das duas fontes — linha que a tabela não conhece: o conserto é na DIGITAÇÃO.
 * Juntar o 2 e o 3 no mesmo aviso esconderia que o 2 é da tabela e o 3 é de quem digitou.
 */
export const CAMPO_DA_LINHA = { categoria: 'PERFIL', campo: 'linha' } as const
export const SEM_PRINCIPAL_DO_PERFIL = 'Escolha o fornecedor principal do perfil: as linhas vêm da tabela em uso dele.'
export const fraseSemTabelaEmUso = (fornecedor: string) => `${fornecedor} não tem tabela em uso nesta conta: não há linhas para oferecer.`
export const fraseTabelaSemLinha = (fornecedor: string) => `A tabela em uso de ${fornecedor} não traz linha nenhuma.`
export const fraseLinhaForaDaTabela = (linha: string, fornecedor: string) => `A linha "${linha}" não tem fórmula na tabela em uso de ${fornecedor}.`
export const fraseLinhaSemFormula = (linha: string, fornecedor: string) =>
    `A tabela em uso de ${fornecedor} tem regras para a linha "${linha}" e nenhuma fórmula dimensional: essa linha não dimensiona. O conserto é na tabela importada.`

// ── Os domínios que o banco ENUMERA por CHECK, e que não têm catálogo ─────────────────────────
/** A lista de cada categoria — a mesma de `LISTA_DA_CATEGORIA` no servidor e da `superadmin_gravar_arvore`. */
export const LISTA_DA_CATEGORIA: Readonly<Record<string, 'vidros' | 'ferragens' | 'instalacao'>> = { VIDRO: 'vidros', FERRAGENS: 'ferragens', INSTALACAO: 'instalacao' }
/** CHECK `orcamentista_mp_instalacao_produto_valido` (migração 20261023000002). Uma linha por produto. */
export const PRODUTOS_DA_INSTALACAO = ['ARREMATE_INTERNO', 'ARREMATE_EXTERNO', 'CONTRAMARCO'] as const
export const ROTULO_DO_PRODUTO: Record<typeof PRODUTOS_DA_INSTALACAO[number], string> = {
    ARREMATE_INTERNO: 'Arremate interno', ARREMATE_EXTERNO: 'Arremate externo', CONTRAMARCO: 'Contramarco',
}
/** CHECK `orcamentista_mp_ferragem_posicao_valida` (migração 20261023000002). Interna e externa são DUAS linhas. */
export const POSICOES_DA_FERRAGEM = ['INTERNA', 'EXTERNA'] as const
export const ROTULO_DA_POSICAO: Record<typeof POSICOES_DA_FERRAGEM[number], string> = { INTERNA: 'Interna', EXTERNA: 'Externa' }

/** Os campos de cada lista que a tela edita, e o tipo deles (as colunas de 20261023000002). A CHAVE vem primeiro. */
const CAMPOS_DA_LISTA = {
    vidros: { chave: 'descricao', campos: { descricao: 'texto', referencia: 'texto', onde_predomina: 'lista_texto' } },
    // o par em inox é de onde depende a regra de obra litorânea: sem ele o sistema recusa orçar
    ferragens: { chave: 'referencia', campos: { referencia: 'texto', tipologia: 'texto', posicao: 'texto', descricao: 'texto', cor: 'texto', par_inox_referencia: 'texto' } },
} as const satisfies Record<string, { chave: string; campos: Record<string, TipoDoCampo> }>
const CAMPOS_DA_INSTALACAO: Record<string, TipoDoCampo> = {
    usa: 'booleano', referencia: 'texto', descricao: 'texto', medida: 'texto', folga_x: 'inteiro', folga_y: 'inteiro',
}

// ── O catálogo, em ordem ───────────────────────────────────────────────────────────────────
export const categoriasEmOrdem = (c: ArvoreLida['catalogo']) => [...c.categorias].sort((a, b) => a.ordem - b.ordem)

/** A categoria tem algo gravado? Config, fornecedor ou item de lista. */
export const categoriaTemConteudo = (c: CategoriaLida): boolean =>
    c.config !== null || c.fornecedores.length > 0 || (c.vidros?.length ?? 0) > 0 || (c.ferragens?.length ?? 0) > 0 || (c.instalacao?.length ?? 0) > 0

/**
 * AS CATEGORIAS QUE A MATÉRIA-PRIMA MOSTRA (dono do produto, 27/10/2026): as RAMIFICAÇÕES da família dela, na
 * ordem que a família declara — `orcamentista_familia_ramificacao`, não a lista fixa do catálogo. Três casos:
 *   - sem família: TODAS as do catálogo (a tela AVISA, em vez de fingir que a lista é a da família);
 *   - com família: as que ela declara; a que NÃO declara mas tem dado gravado continua aparecendo (nada que está
 *     gravado some da tela), depois das declaradas, na ordem do catálogo;
 *   - com família que não declara nenhuma: só as que têm dado gravado.
 */
export function categoriasDaMateriaPrima(catalogo: ArvoreLida['catalogo'], familia: string | null | undefined, comConteudo: readonly string[] = []): CategoriaDoCatalogo[] {
    const todas = categoriasEmOrdem(catalogo)
    if (!familia) return todas
    const declaradas = (catalogo.ramificacoes ?? []).filter((r) => r.familia === familia).sort((a, b) => a.ordem - b.ordem)
    const chaves = new Set(declaradas.map((r) => r.categoria_chave))
    const dasDeclaradas = declaradas.flatMap((r) => todas.filter((c) => c.chave === r.categoria_chave))
    return [...dasDeclaradas, ...todas.filter((c) => !chaves.has(c.chave) && comConteudo.includes(c.chave))]
}

/** As categorias mostradas que a família NÃO declara (estão aqui porque têm dado gravado). Sem família ou sem ramificações declaradas: nenhuma. */
export function categoriasForaDaFamilia(catalogo: ArvoreLida['catalogo'], familia: string | null | undefined, mostradas: readonly string[]): string[] {
    if (!familia || !familiaDeclaraRamificacao(catalogo, familia)) return []
    const declaradas = new Set((catalogo.ramificacoes ?? []).filter((r) => r.familia === familia).map((r) => r.categoria_chave))
    return mostradas.filter((c) => !declaradas.has(c))
}

/** A família declara alguma ramificação? */
export const familiaDeclaraRamificacao = (catalogo: ArvoreLida['catalogo'], familia: string) => (catalogo.ramificacoes ?? []).some((r) => r.familia === familia)
/**
 * Os campos da categoria que a tela mostra, edita e manda — sem os que saíram da tela e da gravação (`CAMPOS_FORA_DA_TELA`, 30/10/2026): fora daqui,
 * eles não entram no formulário nem no corpo, e o valor gravado fica como está (a gravação faz merge).
 */
export const camposDa = (c: ArvoreLida['catalogo'], chave: string) =>
    c.campos.filter((x) => x.categoria_chave === chave && !campoForaDaTela(chave, x.chave)).sort((a, b) => a.ordem - b.ordem)

// ── O valor: a forma do formulário, a forma do corpo, e a comparação com o gravado ──────────
/** O gravado na forma que o formulário edita. O mapa vira pares; o resto fica como veio — null é null. */
export function doFormulario(tipo: TipoDoCampo, gravado: unknown): unknown {
    if (tipo === 'mapa') return paresDoMapa(gravado)
    if (tipo === 'lista_texto') return Array.isArray(gravado) ? gravado : null
    return gravado ?? null
}

/** O valor que vai no corpo, ou o erro de preenchimento. Texto em branco é null; lista vazia que veio do banco é []. */
export function normalizar(tipo: TipoDoCampo, v: unknown): { valor: unknown; erro: string | null } {
    switch (tipo) {
        case 'texto': {
            const t = typeof v === 'string' ? v.trim() : ''
            return { valor: t === '' ? null : t, erro: null }
        }
        case 'inteiro':
            return { valor: typeof v === 'number' && Number.isInteger(v) ? v : null, erro: null }
        case 'numero':
            return { valor: typeof v === 'number' && Number.isFinite(v) ? v : null, erro: null }
        case 'booleano':
            return { valor: typeof v === 'boolean' ? v : null, erro: null }
        case 'lista_texto':
            return { valor: Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x !== '') : null, erro: null }
        case 'mapa':
            return mapaDosPares(Array.isArray(v) ? (v as Par[]) : [])
        case 'opcao': {
            // a opção "em branco" chega como '' e é null: ainda não configurado
            const t = typeof v === 'string' ? v.trim() : ''
            return { valor: t === '' ? null : t, erro: null }
        }
        default:
            // tipo que a tela não conhece: AUSENTE, nunca undefined — undefined quebrava a tela inteira
            return { valor: null, erro: null }
    }
}

/** O normalizado é o gravado? Lista vazia e null são DIFERENTES; o mapa sem par é igual ao mapa vazio gravado. */
function igual(tipo: TipoDoCampo, normalizado: unknown, gravado: unknown): boolean {
    if (tipo === 'mapa' && normalizado === null && gravado && typeof gravado === 'object' && !Array.isArray(gravado) && Object.keys(gravado).length === 0) return true
    return mesmoValor(normalizado, gravado ?? null)
}

// ── O formulário ───────────────────────────────────────────────────────────────────────────
export type ItemDaLista = { local: string; gravado: Linha | null; valores: Linha }
export type CategoriaDoFormulario = {
    chave: string
    gravada: CategoriaLida | null
    config: Linha
    fornecedores: { ids: string[]; principal: string | null }
    vidros: ItemDaLista[]
    ferragens: ItemDaLista[]
    instalacao: Record<string, Linha>
}
export type MateriaPrimaDoFormulario = { local: string; id: string | null; nome: string; familia: string | null; categorias: CategoriaDoFormulario[] }
export type EstadoDaArvore = { materias: MateriaPrimaDoFormulario[]; removidas: Array<{ id: string; nome: string }> }

let proximo = 0
export const novoLocal = () => `a${++proximo}`

const porOrdem = (a: Linha, b: Linha) => Number(a.ordem) - Number(b.ordem)

function itensDaLista(lista: 'vidros' | 'ferragens', gravados: Linha[] | undefined): ItemDaLista[] {
    const campos = Object.keys(CAMPOS_DA_LISTA[lista].campos)
    return [...(gravados ?? [])].sort(porOrdem).map((g) => ({
        local: novoLocal(), gravado: g, valores: Object.fromEntries(campos.map((c) => [c, doFormulario((CAMPOS_DA_LISTA[lista].campos as Record<string, TipoDoCampo>)[c], g[c])])),
    }))
}

export function categoriaDoFormulario(catalogo: ArvoreLida['catalogo'], chave: string, gravada: CategoriaLida | null): CategoriaDoFormulario {
    const config = gravada?.config ?? null
    const fornecedores = [...(gravada?.fornecedores ?? [])].sort(porOrdem)
    return {
        chave,
        gravada,
        config: Object.fromEntries(camposDa(catalogo, chave).map((c) => [c.chave, doFormulario(c.tipo, config ? config[c.chave] : null)])),
        fornecedores: { ids: fornecedores.map((f) => f.fornecedor_id), principal: fornecedores.find((f) => f.principal)?.fornecedor_id ?? null },
        vidros: itensDaLista('vidros', gravada?.vidros),
        ferragens: itensDaLista('ferragens', gravada?.ferragens),
        instalacao: Object.fromEntries(PRODUTOS_DA_INSTALACAO.map((p) => {
            const g = (gravada?.instalacao ?? []).find((x) => x.produto === p) ?? null
            return [p, Object.fromEntries(Object.keys(CAMPOS_DA_INSTALACAO).map((c) => [c, g ? g[c] ?? null : null]))]
        })),
    }
}

export function formularioDaArvore(lida: ArvoreLida): EstadoDaArvore {
    return {
        materias: [...lida.materias_primas].sort(porOrdem).map((m) => {
            // as ramificações da FAMÍLIA da matéria-prima; a que não é ramificação mas tem dado gravado continua aparecendo
            const ordem = categoriasDaMateriaPrima(lida.catalogo, m.familia ?? null, m.categorias.filter(categoriaTemConteudo).map((c) => c.categoria_chave))
            return {
                local: novoLocal(), id: m.id, nome: m.nome, familia: m.familia ?? null,
                categorias: ordem.map((k) => categoriaDoFormulario(lida.catalogo, k.chave, m.categorias.find((c) => c.categoria_chave === k.chave) ?? null)),
            }
        }),
        removidas: [],
    }
}

export function novaMateriaPrima(catalogo: ArvoreLida['catalogo']): MateriaPrimaDoFormulario {
    return { local: novoLocal(), id: null, nome: '', familia: null, categorias: categoriasEmOrdem(catalogo).map((k) => categoriaDoFormulario(catalogo, k.chave, null)) }
}

/**
 * Desfazer a remoção devolve a matéria-prima COMO ESTÁ GRAVADA — o que tinha sido editado nela antes de
 * remover se perde — e NA POSIÇÃO GRAVADA: devolvê-la no fim mandaria a lista inteira reordenada.
 */
export function desfazerRemocao(estado: EstadoDaArvore, lida: ArvoreLida, id: string): EstadoDaArvore {
    const gravada = lida.materias_primas.find((m) => m.id === id)
    if (!gravada) return estado
    const [volta] = formularioDaArvore({ ...lida, materias_primas: [gravada] }).materias
    const ordemDe = (m: MateriaPrimaDoFormulario) => (m.id ? Number(lida.materias_primas.find((x) => x.id === m.id)?.ordem ?? Infinity) : Infinity)
    const antes = estado.materias.findIndex((m) => ordemDe(m) > Number(gravada.ordem))
    const materias = [...estado.materias]
    materias.splice(antes === -1 ? materias.length : antes, 0, volta)
    return { materias, removidas: estado.removidas.filter((r) => r.id !== id) }
}

/** O nome do fornecedor: o do nicho, ou o que veio gravado (o fornecedor pode ter saído do nicho), ou o id. */
export function nomeDoFornecedor(arvore: ArvoreLida, c: CategoriaDoFormulario, id: string): string {
    return arvore.fornecedores_do_nicho.find((f) => f.id === id)?.nome
        ?? (c.gravada?.fornecedores ?? []).find((f) => f.fornecedor_id === id)?.nome_do_fornecedor
        ?? id
}

export type OrigemDaLinha =
    | { estado: 'sem_principal' }
    | { estado: 'sem_tabela'; fornecedor: string }
    | { estado: 'tabela_sem_linha'; fornecedor: string }
    | { estado: 'lista'; fornecedor: string; linhas: string[]; comFormula: string[] }

/** De onde vêm as linhas do PERFIL desta matéria-prima — do principal COMO ESTÁ NA TELA, não do gravado. */
export function origemDaLinha(arvore: ArvoreLida, c: CategoriaDoFormulario): OrigemDaLinha {
    const principal = c.fornecedores.principal
    if (!principal) return { estado: 'sem_principal' }
    const fornecedor = nomeDoFornecedor(arvore, c, principal)
    const fontes = arvore.linhas_por_fornecedor[principal]
    if (!fontes) return { estado: 'sem_tabela', fornecedor }
    // a LISTA é fórmula ∪ regra; quem tem fórmula da linha é guardado à parte, para o estado 2
    const linhas = [...new Set([...fontes.formula, ...fontes.regra])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return linhas.length ? { estado: 'lista', fornecedor, linhas, comFormula: fontes.formula } : { estado: 'tabela_sem_linha', fornecedor }
}

/** Os três estados da linha digitada contra a lista: 1 com fórmula, 2 só com regra, 3 fora das duas. */
export type EstadoDaLinha = 'com_formula' | 'sem_formula' | 'fora_da_tabela'
export function estadoDaLinha(origem: Extract<OrigemDaLinha, { estado: 'lista' }>, linha: string): EstadoDaLinha {
    if (origem.comFormula.includes(linha)) return 'com_formula'
    return origem.linhas.includes(linha) ? 'sem_formula' : 'fora_da_tabela'
}

// ── O corpo: a categoria ───────────────────────────────────────────────────────────────────
type DaCategoria = { item: Linha | null; contagem: number; erros: string[] }

/** Só os campos que mudaram contra o gravado (ou contra nada, no item novo). */
function mudados(campos: Record<string, TipoDoCampo>, gravado: Linha | null, valores: Linha, erros: string[], prefixo: string): Linha {
    const corpo: Linha = {}
    for (const [c, tipo] of Object.entries(campos)) {
        if (!tipoConhecido(tipo)) continue   // ausente não mexe: null apagaria o que está gravado
        const n = normalizar(tipo, valores[c])
        if (n.erro) { erros.push(`${prefixo}${c}: ${n.erro}`); continue }
        if (!igual(tipo, n.valor, gravado ? gravado[c] : null)) corpo[c] = n.valor
    }
    return corpo
}

function corpoDaLista(lista: 'vidros' | 'ferragens', itens: ItemDaLista[], gravados: Linha[], erros: string[]): Linha[] | null {
    const { chave, campos } = CAMPOS_DA_LISTA[lista]
    const doItem = Object.fromEntries(Object.entries(campos).filter(([c]) => c !== chave)) as Record<string, TipoDoCampo>
    const vistos = new Set<string>()
    let mudou = itens.length !== gravados.length || itens.some((it, i) => it.gravado !== gravados[i])
    const corpo = itens.map((it) => {
        const k = normalizar('texto', it.gravado ? it.gravado[chave] : it.valores[chave]).valor as string | null
        if (k === null) erros.push(lista === 'vidros' ? 'vidro sem descrição' : 'ferragem sem referência')
        else if (vistos.has(k.toLowerCase())) erros.push(`${lista === 'vidros' ? 'vidro' : 'referência'} repetido(a): ${k}`)
        else vistos.add(k.toLowerCase())
        if (lista === 'ferragens' && !it.gravado && normalizar('texto', it.valores.tipologia).valor === null) erros.push(`ferragem ${k ?? ''} sem tipologia`)
        const resto = mudados(doItem, it.gravado, it.valores, erros, '')
        if (Object.keys(resto).length) mudou = true
        return { [chave]: k, ...resto }
    })
    return mudou ? corpo : null
}

function corpoDaInstalacao(c: CategoriaDoFormulario, erros: string[], rotulo: string): Linha[] | null {
    const gravados = c.gravada?.instalacao ?? []
    let mudou = false
    const itens: Linha[] = []
    for (const p of PRODUTOS_DA_INSTALACAO) {
        const g = gravados.find((x) => x.produto === p) ?? null
        const v = c.instalacao[p]
        const corpo = mudados(CAMPOS_DA_INSTALACAO, g, v, erros, `${ROTULO_DO_PRODUTO[p]} · `)
        if (Object.keys(corpo).length) mudou = true
        const resultante = { ...(g ?? {}), ...corpo }
        if (resultante.usa === true && (resultante.referencia === null || resultante.referencia === undefined)) erros.push(`${rotulo} · ${ROTULO_DO_PRODUTO[p]}: ${USA_SEM_REFERENCIA}`)
        // o produto GRAVADO vai sempre (fora da lista ele sairia); o novo, só se tiver alguma coisa
        if (g || Object.keys(corpo).length) itens.push({ produto: p, ...corpo })
    }
    return mudou ? itens : null
}

function corpoDaCategoria(catalogo: ArvoreLida['catalogo'], c: CategoriaDoFormulario): DaCategoria {
    const rotulo = catalogo.categorias.find((k) => k.chave === c.chave)?.rotulo ?? c.chave
    const erros: string[] = []
    const item: Linha = { categoria_chave: c.chave }
    let contagem = 0

    const tipos = Object.fromEntries(camposDa(catalogo, c.chave).map((x) => [x.chave, x.tipo])) as Record<string, TipoDoCampo>
    const errosDoConfig: string[] = []
    const config = mudados(tipos, c.gravada?.config ?? null, c.config, errosDoConfig, '')
    erros.push(...errosDoConfig.map((e) => `${rotulo} · ${e}`))
    contagem += Object.keys(config).length + errosDoConfig.length
    if (Object.keys(config).length) item.config = config

    const gravados = [...(c.gravada?.fornecedores ?? [])].sort(porOrdem)
    const principalGravado = gravados.find((f) => f.principal)?.fornecedor_id ?? null
    if (!mesmoValor(c.fornecedores.ids, gravados.map((f) => f.fornecedor_id)) || (c.fornecedores.ids.length > 0 && c.fornecedores.principal !== principalGravado)) {
        item.fornecedores = c.fornecedores.ids.map((id) => ({ fornecedor_id: id, principal: id === c.fornecedores.principal }))
        contagem += 1
    }

    const lista = LISTA_DA_CATEGORIA[c.chave]
    if (lista === 'vidros' || lista === 'ferragens') {
        const errosDaLista: string[] = []
        const corpo = corpoDaLista(lista, c[lista], [...((c.gravada?.[lista] as Linha[] | undefined) ?? [])].sort(porOrdem), errosDaLista)
        erros.push(...errosDaLista.map((e) => `${rotulo} · ${e}`))
        if (corpo) { item[lista] = corpo; contagem += 1 }
    }
    if (lista === 'instalacao') {
        const corpo = corpoDaInstalacao(c, erros, rotulo)
        if (corpo) { item.instalacao = corpo; contagem += 1 }
    }
    return { item: Object.keys(item).length > 1 ? item : null, contagem, erros }
}

// ── O corpo: a árvore ──────────────────────────────────────────────────────────────────────
export type PlanoDaArvore = {
    /** A árvore do PUT, ou null quando não há o que enviar — nada mudou, ou há erro que a segura na tela. */
    corpo: Linha | null
    /** Os erros, nomeados pela matéria-prima (`materia:<local>`) — eles seguram a árvore inteira na tela. */
    erros: ErroNomeado[]
    pendencias: number
}

export function planoDaArvore(lida: ArvoreLida, estado: EstadoDaArvore): PlanoDaArvore {
    const erros: ErroNomeado[] = []
    let pendencias = estado.removidas.length
    const removidas = new Set(estado.removidas.map((r) => r.nome.trim().toLowerCase()))
    const nomes = new Map<string, number>()
    for (const m of estado.materias) { const n = m.nome.trim().toLowerCase(); nomes.set(n, (nomes.get(n) ?? 0) + 1) }

    const materias = estado.materias.map((m) => {
        const campo = `materia:${m.local}`
        const nome = m.nome.trim()
        if (m.id === null) {
            pendencias += 1
            if (!nome) erros.push({ campo, mensagem: 'o nome da matéria-prima é obrigatório' })
            else if (removidas.has(nome.toLowerCase())) erros.push({ campo, mensagem: fraseRemoverEGravar(nome) })
        }
        if (nome && (nomes.get(nome.toLowerCase()) ?? 0) > 1) erros.push({ campo, mensagem: `matéria-prima repetida: ${nome}` })
        const categorias: Linha[] = []
        for (const c of m.categorias) {
            const r = corpoDaCategoria(lida.catalogo, c)
            pendencias += r.contagem
            erros.push(...r.erros.map((mensagem) => ({ campo, mensagem: `${nome || 'nova matéria-prima'} · ${mensagem}` })))
            if (r.item) categorias.push(r.item)
        }
        return categorias.length ? { nome, categorias } : { nome }
    })

    if (erros.length || pendencias === 0) return { corpo: null, erros, pendencias }
    const corpo: Linha = {}
    // sem matéria-prima na tela a chave NÃO vai: a função recusa lista vazia
    if (materias.length) corpo.materias_primas = materias
    if (estado.removidas.length) corpo.remover = estado.removidas.map((r) => r.id)
    return { corpo, erros, pendencias }
}

// ── Depois do salvar: a árvore é o que o banco gravou ───────────────────────────────────────
/**
 * Remonta a árvore pelo `depois` que a função devolveu (as seis tabelas, planas). O `depois` não
 * traz o nome do fornecedor: ele vem do que a tela já conhecia — o nicho e os nomes gravados.
 */
export function arvoreDoDepois(depois: Record<string, Linha[] | null | undefined>, anterior: ArvoreLida): ArvoreLida {
    const nomes = new Map<string, string | null>()
    for (const m of anterior.materias_primas) for (const c of m.categorias) for (const f of c.fornecedores) nomes.set(f.fornecedor_id, f.nome_do_fornecedor ?? null)
    for (const f of anterior.fornecedores_do_nicho) nomes.set(f.id, f.nome)
    const daCategoria = (tabela: string, id: unknown) => (depois[tabela] ?? []).filter((x) => x.mp_categoria_id === id)
    const posicao = new Map(categoriasEmOrdem(anterior.catalogo).map((k, i) => [k.chave, i]))
    const materias = [...(depois.orcamentista_materia_prima ?? [])].sort((a, b) => porOrdem(a, b) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    return {
        ...anterior,
        materias_primas: materias.map((m) => ({
            ...m,
            id: String(m.id), nome: String(m.nome), ordem: Number(m.ordem),
            // a família não vem em todo `depois`: sem ela na resposta, vale a que a tela já tinha (nunca "não informada" por esquecimento)
            familia: m.familia !== undefined ? (m.familia as string | null) : (anterior.materias_primas.find((x) => x.id === String(m.id))?.familia ?? null),
            categorias: (depois.orcamentista_mp_categoria ?? [])
                .filter((c) => c.materia_prima_id === m.id)
                .sort((a, b) => (posicao.get(String(a.categoria_chave)) ?? 0) - (posicao.get(String(b.categoria_chave)) ?? 0))
                .map((c) => {
                    const lista = LISTA_DA_CATEGORIA[String(c.categoria_chave)]
                    const tabela = { vidros: 'orcamentista_mp_vidro', ferragens: 'orcamentista_mp_ferragem', instalacao: 'orcamentista_mp_instalacao' }
                    return {
                        ...c,
                        id: String(c.id), categoria_chave: String(c.categoria_chave), config: (c.config as Linha | null) ?? null,
                        fornecedores: daCategoria('orcamentista_mp_categoria_fornecedor', c.id).sort(porOrdem)
                            .map((f) => ({ ...f, fornecedor_id: String(f.fornecedor_id), principal: f.principal === true, ordem: Number(f.ordem), nome_do_fornecedor: nomes.get(String(f.fornecedor_id)) ?? null })),
                        ...(lista ? { [lista]: daCategoria(tabela[lista], c.id) } : {}),
                    }
                }),
        })),
    }
}

// ── Onde a mensagem da função aponta ───────────────────────────────────────────────────────
/**
 * A mensagem da função começa pelo CAMINHO: "materia-prima Aço, categoria PERFIL, fornecedores: ...".
 * Daqui sai a matéria-prima (pelo nome, sem caixa) e a categoria, para a tela pôr a mensagem PERTO.
 * Sem caminho reconhecível, a mensagem vai para o topo do cartão — inteira, nos dois casos.
 */
export function ondeEstaOErro(mensagem: string, estado: EstadoDaArvore): { local: string; categoria: string } | null {
    const m = /^materia-prima (.+?), categoria ([A-Z_]+)[,:]/.exec(mensagem)
    if (!m) return null
    const mp = estado.materias.find((x) => x.nome.trim().toLowerCase() === m[1].trim().toLowerCase())
    return mp ? { local: mp.local, categoria: m[2] } : null
}
