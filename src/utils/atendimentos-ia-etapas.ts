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
 * A ETAPA É DA FAMÍLIA-INSTÂNCIA (dono do produto, 28/10/2026; migração 20261028000001): da matéria-prima de UMA empresa, não da chave do
 * catálogo — a mesma empresa pode ter três famílias PVC, cada uma com as suas etapas. O motor é do CATÁLOGO (global, com fornecedor e
 * categoria), e a etapa só o seleciona (`atendimentos-ia-catalogo-de-motores.ts`).
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
    /** O motor (planilha de `orcamentista_motor`) desta etapa; null = ainda não aponta nenhum (20261027000006). */
    motor_id: string | null
}

/** Uma etapa como a tela a manda: sem `numero` — a POSIÇÃO na lista é o número. Sem `id`, é etapa nova. */
export interface EtapaNoCorpo {
    id?: string
    rotulo: string
    acao: AcaoDaEtapa
    instrucao: string
    abas: AbaDaEtapa[]
    /** `undefined` = não mexe (a função mantém o motor que a etapa já tem); `null` = limpa; uuid = aponta. */
    motor_id?: string | null
}

/**
 * GET `?tenant=&materia_prima=` → `{ familia, etapas, motores }`; PUT `?tenant=` com `{ materia_prima, etapas }`. A empresa e a família-instância
 * vão no pedido: a etapa é de UMA matéria-prima de UMA empresa.
 */
export const rotaDasEtapas = (tenantId: string, materiaPrimaId?: string) =>
    `/api/super-admin/base-de-conhecimento/etapas?tenant=${encodeURIComponent(tenantId)}${materiaPrimaId === undefined ? '' : `&materia_prima=${encodeURIComponent(materiaPrimaId)}`}`

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
        const fora = Object.keys(e).find((k) => !['id', 'rotulo', 'acao', 'instrucao', 'abas', 'motor_id'].includes(k))
        if (fora) return { ok: false, erro: `Etapa ${n}: o campo "${fora}" não existe (só id, rotulo, acao, instrucao, abas e motor_id). O número é a posição na lista.` }
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
        if (e.motor_id !== undefined && e.motor_id !== null && !ehUuid(e.motor_id)) return { ok: false, erro: `Etapa ${n}: o motor_id não é um uuid (ou null, para limpar).` }
        etapas.push({
            ...(typeof e.id === 'string' ? { id: e.id } : {}), rotulo, acao: e.acao, instrucao, abas: abas as AbaDaEtapa[],
            ...(e.motor_id !== undefined ? { motor_id: e.motor_id as string | null } : {}),
        })
    }
    return { ok: true, etapas }
}

// ── O RASCUNHO DA TELA ───────────────────────────────────────────────────────────────────────────────────
/** A etapa como está sendo editada na tela. `acao` é null na etapa nova até alguém escolher: nenhuma vem por omissão. */
export interface EtapaNoRascunho {
    local: string
    id: string | null
    rotulo: string
    acao: AcaoDaEtapa | null
    instrucao: string
    abas: AbaDaEtapa[]
    /** O motor escolhido na tela; null = nenhum. */
    motor_id: string | null
    /** O motor que a etapa tinha quando foi lida: o corpo só leva `motor_id` se ele MUDOU (salvar outra coisa não mexe no motor). */
    motor_gravado: string | null
}

let proximoLocal = 0
export const novaEtapaNoRascunho = (): EtapaNoRascunho => ({ local: `nova-${++proximoLocal}`, id: null, rotulo: '', acao: null, instrucao: '', abas: [], motor_id: null, motor_gravado: null })

/** Uma etapa NOVA, inserida logo abaixo da posição dada (a posição é o número: as de baixo descem). */
export function inserirEtapaAbaixo(rascunho: readonly EtapaNoRascunho[], posicao: number): EtapaNoRascunho[] {
    const saida = [...rascunho]
    saida.splice(Math.min(Math.max(posicao + 1, 0), saida.length), 0, novaEtapaNoRascunho())
    return saida
}

export const rascunhoDasEtapas = (etapas: EtapaDaFamilia[]): EtapaNoRascunho[] =>
    etapas.map((e) => ({ local: e.id, id: e.id, rotulo: e.rotulo, acao: e.acao, instrucao: e.instrucao, abas: [...e.abas], motor_id: e.motor_id ?? null, motor_gravado: e.motor_id ?? null }))

/** As abas na ordem da planilha, sem repetição: a tela marca e desmarca, a ordem não é escolha de ninguém. */
export const abasEmOrdem = (marcadas: readonly string[]): AbaDaEtapa[] => ABAS_DA_ETAPA.filter((a) => marcadas.includes(a))

/** O corpo do PUT: a lista inteira, na ordem da tela. A ação em branco vai como está, e `lerCorpoDasEtapas` a recusa nomeando a etapa. */
export const corpoDoRascunho = (rascunho: readonly EtapaNoRascunho[]) => ({
    etapas: rascunho.map((e) => ({
        ...(e.id ? { id: e.id } : {}), rotulo: e.rotulo, acao: e.acao, instrucao: e.instrucao, abas: e.abas,
        // só vai quando mudou: salvar o rótulo não pode tocar no motor (e funciona com a função de antes da 20261027000008)
        ...(e.motor_id !== e.motor_gravado ? { motor_id: e.motor_id } : {}),
    })),
})

/** A etapa mudou contra o gravado? Compara o que a rota grava: rótulo e instrução sem as pontas, as abas sem ordem. */
export function etapasMudaram(rascunho: readonly EtapaNoRascunho[], gravadas: readonly EtapaDaFamilia[]): boolean {
    if (rascunho.length !== gravadas.length) return true
    return rascunho.some((e, i) => {
        const g = gravadas[i]
        return e.id !== g.id || e.rotulo.trim() !== g.rotulo || e.acao !== g.acao || e.instrucao.trim() !== g.instrucao || (e.motor_id ?? null) !== (g.motor_id ?? null)
            || [...e.abas].sort().join('|') !== [...g.abas].sort().join('|')
    })
}

/** Troca a etapa de lugar com a vizinha. Fora da lista, devolve a lista como está. */
export function moverEtapa<T>(lista: readonly T[], de: number, delta: -1 | 1): T[] {
    const para = de + delta
    if (de < 0 || de >= lista.length || para < 0 || para >= lista.length) return [...lista]
    const saida = [...lista]
    ;[saida[de], saida[para]] = [saida[para], saida[de]]
    return saida
}

// ── A FAMÍLIA SÓ CALCULA COM TODAS AS ETAPAS COM MOTOR (dono do produto, 29/10/2026) ───────────────────────
/**
 * "Para funcionar, a família funcionar, ela precisa ter todos os motores. Caso não tenha um motor, ela não funciona." NÃO é constraint: montar a
 * família aos poucos e gravar etapa sem motor continuam permitidos. É conferência NO MOMENTO DE CALCULAR/EXECUTAR — `conferirEtapasParaExecutar`,
 * que quem executar as etapas chama antes de começar —, e a leitura da família mostra `pronta` e a lista das que estão sem motor.
 *
 * Família SEM ETAPA não está pronta: não há o que executar (leitura do assistente, relatada ao dono do produto no PR).
 */
export interface EtapaSemMotor {
    id: string
    numero: number
    rotulo: string
}

/** As etapas sem motor, na ordem do número. */
export const etapasSemMotor = (etapas: readonly Pick<EtapaDaFamilia, 'id' | 'numero' | 'rotulo' | 'motor_id'>[]): EtapaSemMotor[] =>
    etapas.filter((e) => e.motor_id === null).sort((a, b) => a.numero - b.numero).map((e) => ({ id: e.id, numero: e.numero, rotulo: e.rotulo }))

/** Pronta: tem pelo menos uma etapa, e TODAS com motor. */
export const familiaPronta = (etapas: readonly Pick<EtapaDaFamilia, 'motor_id'>[]) => etapas.length > 0 && etapas.every((e) => e.motor_id !== null)

/** A frase da recusa, nomeando a etapa: `a etapa 2 ("Levantamento de esquadrias") está sem motor: escolha um motor para ela`. */
export const fraseDaEtapaSemMotor = (e: Pick<EtapaSemMotor, 'numero' | 'rotulo'>) => `a etapa ${e.numero} ("${e.rotulo}") está sem motor: escolha um motor para ela`
export const FAMILIA_SEM_ETAPAS_NAO_CALCULA = 'a família não tem etapas: cadastre as etapas, cada uma com o seu motor'

/**
 * A conferência antes de executar: a família só calcula com TODAS as etapas com motor. A recusa nomeia CADA etapa sem motor (uma frase por
 * etapa, na ordem), para quem lê saber onde repor sem tentar de novo.
 */
export function conferirEtapasParaExecutar(etapas: readonly EtapaDaFamilia[]): { ok: true } | { ok: false; erros: string[] } {
    if (etapas.length === 0) return { ok: false, erros: [FAMILIA_SEM_ETAPAS_NAO_CALCULA] }
    const sem = etapasSemMotor(etapas)
    return sem.length === 0 ? { ok: true } : { ok: false, erros: sem.map(fraseDaEtapaSemMotor) }
}

// ── EXCLUIR ETAPA NA CONTA (dono do produto, 30/10/2026; migração 20261031000001) ─────────────────────────────
/**
 * A etapa GRAVADA que não vai na lista é REMOVIDA pela função, com log, e as que ficam renumeram 1..N pela posição (a numeração aparece na conversa e
 * na ordem de execução). A tela tira a etapa do rascunho só depois de uma confirmação que diz o que se perde: o rótulo, a instrução e o motor — os
 * GRAVADOS, que são o que sai do banco ao salvar.
 */
export const TAMANHO_DO_TRECHO_DA_INSTRUCAO = 80

/** A instrução como a confirmação a mostra: vazia é "sem instrução"; longa, o começo e quantos caracteres tem. */
export function instrucaoNaConfirmacao(instrucao: string): string {
    const t = instrucao.trim()
    if (t === '') return 'sem instrução'
    const n = caracteres(t)
    if (n <= TAMANHO_DO_TRECHO_DA_INSTRUCAO) return `a instrução "${t}"`
    return `a instrução de ${n.toLocaleString('pt-BR')} caracteres ("${[...t].slice(0, TAMANHO_DO_TRECHO_DA_INSTRUCAO).join('')}…")`
}

/** O que se perde ao excluir a etapa: `motor` é o rótulo do motor gravado, ou null quando ela não tem motor. */
export function fraseDaExclusaoDaEtapa(e: { numero: number; rotulo: string; instrucao: string; motor: string | null }): { titulo: string; perde: string[] } {
    return {
        titulo: `Excluir a etapa ${e.numero} ("${e.rotulo}")?`,
        perde: [
            `o rótulo "${e.rotulo}"`,
            instrucaoNaConfirmacao(e.instrucao),
            e.motor === null ? 'sem motor' : `o motor ${e.motor}`,
        ],
    }
}
export const AVISO_DA_EXCLUSAO = 'A etapa sai ao salvar, com o que está gravado nela; as de baixo sobem um número. Até salvar, nada é apagado.'
