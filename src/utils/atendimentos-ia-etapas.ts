/**
 * As ETAPAS e a PLANILHA do motor (dono do produto, 27/10/2026; migração 20261027000002).
 *
 * O motor deixou de ser "o arquivo da tabela do fornecedor". São duas coisas separadas:
 *   - a PLANILHA (`orcamentista_motor`): a fonte de dados, importada UMA vez por (família, fornecedor de
 *     perfil). O Motor_Wolf_PVC é a planilha da família PVC com o fornecedor Wolff — não pertence a uma etapa;
 *   - a ETAPA (`orcamentista_familia_etapa`): o que o consultor cadastra por família — número, rótulo LIVRE,
 *     AÇÃO de uma lista FECHADA, texto de instrução e quais abas da planilha ela carrega. Várias etapas leem a
 *     mesma planilha: o apanhado carrega a Detalhe e as Variáveis; a relação de barras carrega tudo.
 *
 * O RÓTULO É LIVRE; A AÇÃO NÃO É. "Etapa sem ação da lista é erro, não etapa nova": o código precisa saber o que
 * fazer ali (apanhar, confirmar, gerar o PDF, calcular as barras, enviar), e um rótulo não diz isso.
 *
 * ESTA LISTA MORA TAMBÉM NO BANCO (as CHECK da etapa). Acrescentar uma ação aqui exige a migração que a põe na
 * CHECK, e é isso que o portão `atendimentos-ia-etapas-paridade.test.ts` confere — a lista não vive em dois
 * lugares sem alguém olhar os dois (`copia-divergente.md`).
 */
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'
import { CONTAGENS_DO_MOTOR, type AbaDaPlanilha } from '@/utils/atendimentos-ia-motor'

/** O que o código sabe fazer numa etapa. Ordem = a do processo do dono do produto. */
export const ACOES_DA_ETAPA = ['APANHAR', 'CONFIRMAR', 'GERAR_LEVANTAMENTO', 'CALCULAR_BARRAS', 'ENVIAR'] as const
export type AcaoDaEtapa = (typeof ACOES_DA_ETAPA)[number]

export const ROTULO_DA_ACAO: Record<AcaoDaEtapa, string> = {
    APANHAR: 'Apanhar o que o vendedor pede',
    CONFIRMAR: 'Confirmar o apanhado',
    GERAR_LEVANTAMENTO: 'Gerar o levantamento',
    CALCULAR_BARRAS: 'Calcular as barras e os materiais',
    ENVIAR: 'Enviar ao vendedor',
}

export const ehAcaoDaEtapa = (v: unknown): v is AcaoDaEtapa => typeof v === 'string' && (ACOES_DA_ETAPA as readonly string[]).includes(v)

/**
 * As abas da PLANILHA que uma etapa pode carregar: as contagens do bloco Motor, sem os itens de preço — o preço é
 * da tabela do fornecedor (`orcamentista_tabela_item`), não do motor. Vêm de `CONTAGENS_DO_MOTOR`: nenhuma lista
 * de abas fica escrita em outro lugar.
 */
export type AbaDaEtapa = AbaDaPlanilha
export const ABAS_DA_ETAPA: readonly AbaDaEtapa[] = CONTAGENS_DO_MOTOR.map((c) => c.chave).filter((c): c is AbaDaEtapa => c !== 'itens_de_preco')

/**
 * As 14 tabelas que pendem de `tabela_id` hoje (13 do motor e a das importações) e que passam a ter `motor_id`:
 * cada linha é da tabela do fornecedor OU da planilha, nunca das duas e nunca de nenhuma (CHECK `_um_dono`).
 */
export const TABELAS_DO_MOTOR = [
    'orcamentista_importacao',
    'orcamentista_motor_baguete',
    'orcamentista_motor_formula',
    'orcamentista_motor_formula_familia',
    'orcamentista_motor_insumo',
    'orcamentista_motor_otimizacao',
    'orcamentista_motor_perfil',
    'orcamentista_motor_regra',
    'orcamentista_motor_tipologia',
    'orcamentista_motor_tipologia_detalhe',
    'orcamentista_motor_tipologia_tempo',
    'orcamentista_motor_validacao',
    'orcamentista_motor_variavel',
    'orcamentista_motor_vidro',
] as const

// ── AS ETAPAS DA FAMÍLIA NA TELA E NA ROTA (PR B; migração 20261027000003) ─────────────────────────────
/**
 * O limite do texto da etapa, contado como o banco conta (`char_length`: pontos de código). O rótulo e a
 * instrução têm CHECK no banco (`..._rotulo_forma`, `..._instrucao_ate_4000`) e a função traduz a violação; a
 * rota confere ANTES, com a frase que diz quantos.
 */
export const LIMITE_DO_ROTULO_DA_ETAPA = 60
export const LIMITE_DA_INSTRUCAO_DA_ETAPA = 4000
export const MAXIMO_DE_ETAPAS_DA_FAMILIA = 50

const caracteres = (texto: string) => [...texto].length

/** O rótulo de cada aba na tela: o mesmo do bloco Motor, das contagens. */
export const ROTULO_DA_ABA: Record<AbaDaEtapa, string> = Object.fromEntries(
    CONTAGENS_DO_MOTOR.filter((c) => c.chave !== 'itens_de_preco').map((c) => [c.chave, c.rotulo]),
) as Record<AbaDaEtapa, string>

/** Uma etapa como o banco a guarda. */
export interface EtapaDaFamilia {
    id: string
    numero: number
    rotulo: string
    acao: AcaoDaEtapa
    instrucao: string
    abas: AbaDaEtapa[]
}

/** Uma etapa como a tela a manda: sem `numero` — a POSIÇÃO na lista é o número. Sem `id`, é etapa nova. */
export interface EtapaNoCorpo {
    id?: string
    rotulo: string
    acao: AcaoDaEtapa
    instrucao: string
    abas: AbaDaEtapa[]
}

export const rotaDasEtapas = (familia: string) => `/api/super-admin/atendimentos-ia/familias/${encodeURIComponent(familia)}/etapas`

export const fraseDaAcaoForaDaLista = (n: number, acao: unknown) =>
    `Etapa ${n}: a ação ${typeof acao === 'string' && acao !== '' ? `"${acao}"` : 'em branco'} não é uma das ações do sistema (${ACOES_DA_ETAPA.join(', ')}). O rótulo é livre; a ação não é.`
export const fraseDoRotuloDaEtapa = (n: number, tamanho: number) =>
    tamanho === 0 ? `Etapa ${n}: o rótulo está em branco.` : `Etapa ${n}: o rótulo tem ${tamanho} caracteres; o limite é ${LIMITE_DO_ROTULO_DA_ETAPA}.`
export const fraseDaInstrucaoDaEtapa = (n: number, tamanho: number) =>
    `Etapa ${n}: a instrução tem ${tamanho.toLocaleString('pt-BR')} caracteres; o limite é ${LIMITE_DA_INSTRUCAO_DA_ETAPA.toLocaleString('pt-BR')}. Encurte antes de salvar.`

/**
 * O corpo do PUT: `{ etapas: [{ id?, rotulo, acao, instrucao?, abas? }] }`, a LISTA INTEIRA da família na
 * ordem desejada. Confere o que a função e o banco conferem — a primeira falha para, com o número da etapa —,
 * e devolve a lista já limpa (rótulo e instrução sem os espaços das pontas). A lista de ações e a de abas são as
 * constantes deste arquivo, que o portão de paridade amarra às CHECK da migração.
 */
export function lerCorpoDasEtapas(body: unknown): { ok: true; etapas: EtapaNoCorpo[] } | { ok: false; erro: string } {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
    if (!b || !Array.isArray(b.etapas)) return { ok: false, erro: 'As etapas vão numa lista.' }
    if (b.etapas.length > MAXIMO_DE_ETAPAS_DA_FAMILIA) {
        return { ok: false, erro: `A família tem ${b.etapas.length} etapas na lista; o máximo é ${MAXIMO_DE_ETAPAS_DA_FAMILIA}.` }
    }
    const etapas: EtapaNoCorpo[] = []
    const ids = new Set<string>()
    for (let i = 0; i < b.etapas.length; i++) {
        const n = i + 1
        const e = b.etapas[i] && typeof b.etapas[i] === 'object' && !Array.isArray(b.etapas[i]) ? (b.etapas[i] as Record<string, unknown>) : null
        if (!e) return { ok: false, erro: `Etapa ${n}: não é um objeto.` }
        const fora = Object.keys(e).find((k) => !['id', 'rotulo', 'acao', 'instrucao', 'abas'].includes(k))
        if (fora) return { ok: false, erro: `Etapa ${n}: o campo "${fora}" não existe (só id, rotulo, acao, instrucao e abas). O número é a posição na lista.` }
        if (typeof e.rotulo !== 'string') return { ok: false, erro: `Etapa ${n}: o rótulo é um texto.` }
        const rotulo = e.rotulo.trim()
        if (rotulo === '' || caracteres(rotulo) > LIMITE_DO_ROTULO_DA_ETAPA) return { ok: false, erro: fraseDoRotuloDaEtapa(n, caracteres(rotulo)) }
        if (!ehAcaoDaEtapa(e.acao)) return { ok: false, erro: fraseDaAcaoForaDaLista(n, e.acao) }
        if (e.instrucao !== undefined && typeof e.instrucao !== 'string') return { ok: false, erro: `Etapa ${n}: a instrução é um texto.` }
        const instrucao = (e.instrucao ?? '').toString().trim()
        if (caracteres(instrucao) > LIMITE_DA_INSTRUCAO_DA_ETAPA) return { ok: false, erro: fraseDaInstrucaoDaEtapa(n, caracteres(instrucao)) }
        if (e.abas !== undefined && !Array.isArray(e.abas)) return { ok: false, erro: `Etapa ${n}: as abas vão numa lista.` }
        const abas = (e.abas ?? []) as unknown[]
        const estranha = abas.find((a) => typeof a !== 'string' || !(ABAS_DA_ETAPA as readonly string[]).includes(a))
        if (estranha !== undefined) return { ok: false, erro: `Etapa ${n}: "${String(estranha)}" não é uma aba da planilha.` }
        if (new Set(abas).size !== abas.length) return { ok: false, erro: `Etapa ${n}: uma aba aparece mais de uma vez.` }
        if (e.id !== undefined && e.id !== null) {
            if (!ehUuid(e.id)) return { ok: false, erro: `Etapa ${n}: o id não é um uuid.` }
            if (ids.has(e.id)) return { ok: false, erro: `Etapa ${n}: o id aparece mais de uma vez na lista.` }
            ids.add(e.id)
        }
        etapas.push({ ...(typeof e.id === 'string' ? { id: e.id } : {}), rotulo, acao: e.acao, instrucao, abas: abas as AbaDaEtapa[] })
    }
    return { ok: true, etapas }
}
