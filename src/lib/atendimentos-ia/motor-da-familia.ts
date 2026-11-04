/**
 * Atendimentos I.A. — O MOTOR DA CONVERSA VEM DA FAMÍLIA, pelas ETAPAS DECLARADAS dela (PR D, 02/11/2026; a ação manda, 04/11/2026). SÓ SERVIDOR.
 *
 * ══ A ORIGEM ══
 *   família da conta (a base de conhecimento: `orcamentista_materia_prima.familia`, as distintas)
 *     → `orcamentista_familia_etapa` da família-instância, TODAS, na ordem do número
 *     → o item do catálogo que cada uma seleciona (`orcamentista_etapa_catalogo`: nome, AÇÃO, abas)
 *     → `motor_id` → `orcamentista_motor` (não arquivado, com tipologias importadas por `motor_id`).
 *
 * ══ A AÇÃO MANDA; O NÚMERO É SÓ ORDEM (dono do produto, 04/11/2026) ══
 *   "Quem executa levantamento é a etapa com GERAR_LEVANTAMENTO, quem calcula é a com CALCULAR_BARRAS, onde quer que estejam na ordem. Se o
 *   papel vier pelo número, trocar a ordem no catálogo troca os motores em silêncio — inaceitável num número que vira preço." Até aqui a etapa
 *   era lida pelo NÚMERO (1 = levantamento, 2 = cálculo) e a terceira era ignorada em silêncio. Agora:
 *   - o motor do LEVANTAMENTO (a lista de tipologias e as Variáveis que a conversa pergunta) é o da etapa com GERAR_LEVANTAMENTO;
 *   - o motor do CÁLCULO (as abas, as regras, as fórmulas da linha e o tempo) é o da etapa com CALCULAR_BARRAS — e a família SEM essa etapa
 *     só levanta: o levantamento sai gravado, sem barras, mão de obra ou preço (`levantamento-da-conversa.ts`);
 *   - a INSTRUÇÃO da etapa que fala com o modelo (GERAR_LEVANTAMENTO) vai ao prompt, só quando preenchida — "apenas a instrução da ETAPA
 *     CORRENTE, nunca a de todas"; a escrita numa etapa cujo executor não usa o modelo (CALCULAR_BARRAS) não tem efeito, e a conversa a anota.
 *
 * ══ UMA SÓ CONFERÊNCIA, UM SÓ VOCABULÁRIO ══
 *   A conferência é `conferirEtapasParaExecutar` (`atendimentos-ia-etapas.ts`), a mesma que a tela da base de conhecimento mostra: família sem
 *   tipo, sem etapas, etapa sem motor, ação fora da lista, ação SEM EXECUTOR (APANHAR, CONFIRMAR e ENVIAR existem no catálogo e não têm código:
 *   etapa com uma delas é erro nomeado, nunca ignorada), ação REPETIDA, e CÁLCULO SEM LEVANTAMENTO antes dele. A conferência por número que este
 *   arquivo tinha saiu: "duas listas de frases de falta para a mesma coisa é como elas se tornam divergentes". O fornecedor por categoria NÃO é
 *   conferido aqui (`categoriasSemFornecedor: null` = não conferido): o preço tem a sua própria conferência (`levantamento-da-conversa.ts`), e a De
 *   Paula tem cinco categorias sem fornecedor por desenho (31/10/2026) — conferir aqui a recusaria inteira.
 *   Ficam deste arquivo as faltas que precisam do banco: o motor arquivado, o motor sem conteúdo importado, e duas famílias-instância da MESMA
 *   família com etapas ou motores diferentes (dono do produto, 02/11/2026: não escolho). Nunca fallback, nunca "a primeira", nunca ler o motor
 *   por `tabela_id`. A falta de tabela de preço vigente é do preço e mora em `levantamento-da-conversa.ts`, com a mesma forma de frase.
 */
import { supabaseAdmin } from '@/supabase/admin'
import {
    ACAO_QUE_USA_O_MODELO, EXECUTOR_DA_ACAO, conferirEtapasParaExecutar, ehAcaoDaEtapa, etapaLida,
    type AcaoDaEtapa, type EtapaConferivel, type ExecutorDaEtapa,
} from '@/utils/atendimentos-ia-etapas'

// O cliente admin não tem os tipos destas tabelas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

export const SECAO_DAS_FAMILIAS = 'Base de conhecimento › Famílias'
export const SECAO_DAS_ETAPAS = 'Base de conhecimento › Etapas da família'
export const SECAO_DOS_MOTORES = 'Catálogo › Motores'
export const SECAO_DOS_FORNECEDORES = 'Catálogo › Fornecedores'

/** O padrão do dono do produto, 02/11/2026: "Falta de configuração — <o que falta>: verifique o catálogo em <seção>". */
export const fraseDeFalta = (oQueFalta: string, secao: string) => `Falta de configuração — ${oQueFalta}: verifique o catálogo em ${secao}.`

export const FRASE_SEM_FAMILIA = fraseDeFalta('a base de conhecimento da empresa não tem família', SECAO_DAS_FAMILIAS)
/** "a etapa 2 ("Relação de barras")": a etapa é dita pelo número E pelo nome do catálogo — nunca por um nome fixo no código. */
const etapaDita = (e: Pick<EtapaConferivel, 'numero' | 'rotulo'>) => `a etapa ${e.numero} ("${e.rotulo}")`
export const fraseDoMotorArquivado = (motor: string, familia: string, e: Pick<EtapaConferivel, 'numero' | 'rotulo'>) =>
    fraseDeFalta(`o motor ${motor}, d${etapaDita(e)} da família ${familia}, está arquivado`, SECAO_DOS_MOTORES)
export const fraseDoMotorSemConteudo = (motor: string, familia: string, e: Pick<EtapaConferivel, 'numero' | 'rotulo'>) =>
    fraseDeFalta(`o motor ${motor}, d${etapaDita(e)} da família ${familia}, não tem tipologias importadas`, SECAO_DOS_MOTORES)
/** A tabela da lista de tipologias não está no banco (a leitura volta com erro): recusa nomeada, como antes do PR D. */
export const FRASE_SEM_LISTA_DE_TIPOLOGIAS = 'Ainda não consigo escolher a tipologia: a lista de tipologias do motor, com a descrição de cada uma, ainda não foi carregada.'
export const fraseDosMotoresDivergentes = (familias: readonly string[], rotulo: string, acao: AcaoDaEtapa) =>
    fraseDeFalta(`as famílias ${familias.join(' e ')} (${rotulo}) apontam motores diferentes na etapa de ${ROTULO_CURTO_DA_ACAO[acao]}`, SECAO_DAS_ETAPAS)
export const fraseDasEtapasDivergentes = (familias: readonly string[], rotulo: string) =>
    fraseDeFalta(`as famílias ${familias.join(' e ')} (${rotulo}) não declaram as mesmas etapas`, SECAO_DAS_ETAPAS)
const ROTULO_CURTO_DA_ACAO: Record<AcaoDaEtapa, string> = {
    APANHAR: 'apanhado', CONFIRMAR: 'confirmação', GERAR_LEVANTAMENTO: 'levantamento', CALCULAR_BARRAS: 'cálculo', ENVIAR: 'envio',
}

export type MotorDaEtapa = { id: string; nome: string }
/** Uma etapa da família como a conversa a executa: a ordem (o número), o item do catálogo, a ação, o executor dela e o motor. Todas conferidas. */
export type EtapaExecutavel = { numero: number; rotulo: string; acao: AcaoDaEtapa; executor: ExecutorDaEtapa; instrucao: string; motor: MotorDaEtapa }
/** A instrução da etapa corrente, como vai ao prompt: identificada pela etapa (número e nome do catálogo) e pela família. */
export type InstrucaoDaEtapa = { numero: number; rotulo: string; texto: string; familia: string }
/** Uma instrução escrita numa etapa cujo executor NÃO usa o modelo: sem efeito, e dita. */
export type InstrucaoSemEfeito = { numero: number; rotulo: string; acao: AcaoDaEtapa; caracteres: number }
/** Uma família da conta, com as etapas declaradas e o motor de cada papel. */
export type FonteDaFamilia = {
    /** A CHAVE do catálogo (a que o item de levantamento grava em `familia`). */
    familia: string
    /** O rótulo do catálogo ("PVC Wolf"): é como o vendedor a reconhece. */
    rotulo: string
    /** O fornecedor do motor do levantamento (o motor tem fornecedor): entra na pergunta "de qual é" quando há mais de uma família. */
    fornecedor: string
    /** As etapas na ordem declarada, todas com executor e com motor. */
    etapas: EtapaExecutavel[]
    /** O motor da etapa com GERAR_LEVANTAMENTO. Sempre há uma: etapa sem executor é falta, e o cálculo exige um levantamento antes. */
    levantamento: MotorDaEtapa
    /** O motor da etapa com CALCULAR_BARRAS; null = a família só levanta, não calcula. */
    calculo: MotorDaEtapa | null
    /** A instrução da etapa que fala com o modelo, só quando preenchida. */
    instrucaoDoLevantamento: InstrucaoDaEtapa | null
    /** As instruções sem efeito (escritas em etapas cujo executor não usa o modelo). */
    instrucoesSemEfeito: InstrucaoSemEfeito[]
}
export type MotivoDaFalta = 'SEM_FAMILIA' | 'ETAPAS' | 'MOTOR_ARQUIVADO' | 'MOTOR_SEM_CONTEUDO' | 'MOTORES_DIVERGENTES' | 'SEM_LISTA_DE_TIPOLOGIAS'
export type MotoresDaConta = { ok: true; familias: FonteDaFamilia[] } | { ok: false; motivo: MotivoDaFalta; frase: string; detalhe: string }

async function ler(onde: string, p: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<Linha[]> {
    const { data, error } = await p
    if (error) throw new Error(`${onde}: ${error.message ?? error.code ?? 'erro'}`)
    return (data ?? []) as Linha[]
}

/**
 * As tipologias importadas do motor, contadas por `motor_id` — o que antes se contava por `tabela_id` (`tabelas-da-conta.ts`). A leitura
 * que volta com erro (a tabela ainda não está no banco) devolve o código do erro: quem chama recusa com nome, não lança.
 */
export async function contarTipologiasDoMotor(motorId: string): Promise<number | { erro: string }> {
    const { count, error } = await db().from('orcamentista_motor_tipologia_detalhe').select('motor_id', { count: 'exact', head: true }).eq('motor_id', motorId)
    if (error) return { erro: String(error.code ?? '-') }
    return count ?? 0
}

const porTexto = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
const porNumero = (a: { numero: number }, b: { numero: number }) => a.numero - b.numero

/** O bloco da instrução da etapa corrente no `sistema()` do prompt: nenhuma linha sem instrução (quem chama só o inclui quando há). */
export const CABECALHO_DA_INSTRUCAO_DA_ETAPA =
    'INSTRUÇÃO DA ETAPA CORRENTE — escrita pelo consultor na etapa de levantamento da família; vale para este levantamento. '
    + 'Ela NÃO manda em número: preço, medida e quantidade só saem do cálculo do sistema; e as regras de NUNCA do prompt base valem acima dela.'
export function blocoDasInstrucoesDasEtapas(instrucoes: readonly InstrucaoDaEtapa[], variasFamilias: boolean): string[] {
    if (instrucoes.length === 0) return []
    return [CABECALHO_DA_INSTRUCAO_DA_ETAPA, ...instrucoes.flatMap((i) => [`[Etapa ${i.numero} — ${i.rotulo}${variasFamilias ? ` — família ${i.familia}` : ''}]`, i.texto])]
}

/**
 * As famílias da conta, cada uma com as etapas declaradas conferidas e o motor de cada papel. Lê só dados da conta (`tenant_id`) e o catálogo
 * global (famílias, itens de etapa, motores). A primeira falta encontrada é a resposta, na ordem: família → a conferência das etapas
 * (`conferirEtapasParaExecutar`, família-instância por família-instância, pelo nome) → as instâncias da mesma família divergentes → o motor de
 * cada etapa (arquivado, conteúdo).
 */
export async function lerMotoresDaConta(tenantId: string): Promise<MotoresDaConta> {
    const instancias = (await ler('orcamentista_materia_prima', db().from('orcamentista_materia_prima').select('id, nome, familia').eq('tenant_id', tenantId)))
        .filter((m) => typeof m.familia === 'string' && m.familia !== '')
        .sort((a, b) => porTexto(String(a.nome ?? ''), String(b.nome ?? '')) || porTexto(String(a.id), String(b.id)))
    if (instancias.length === 0) return { ok: false, motivo: 'SEM_FAMILIA', frase: FRASE_SEM_FAMILIA, detalhe: '' }

    const chaves = [...new Set(instancias.map((m) => String(m.familia)))]
    const catalogo = await ler('orcamentista_familia_catalogo', db().from('orcamentista_familia_catalogo').select('chave, rotulo').in('chave', chaves))
    const rotuloDa = new Map(catalogo.map((f) => [String(f.chave), String(f.rotulo)]))
    const rotulo = (chave: string) => rotuloDa.get(chave) ?? chave
    const nomeDa = (m: Linha) => (typeof m.nome === 'string' && m.nome.trim() !== '' ? m.nome.trim() : rotulo(String(m.familia)))

    // TODAS as etapas das instâncias, com o item do catálogo de cada uma (nome, ação, abas)
    const linhas = await ler('orcamentista_familia_etapa', db().from('orcamentista_familia_etapa')
        .select('id, materia_prima_id, numero, etapa_catalogo_id, instrucao, motor_id').eq('tenant_id', tenantId).in('materia_prima_id', instancias.map((m) => String(m.id))))
    const idsDosItens = [...new Set(linhas.map((l) => String(l.etapa_catalogo_id)))]
    const itens = new Map<string, Linha>()
    if (idsDosItens.length > 0) {
        for (const c of await ler('orcamentista_etapa_catalogo', db().from('orcamentista_etapa_catalogo').select('id, nome, acao, abas').in('id', idsDosItens))) itens.set(String(c.id), c)
    }
    const etapasDe = (m: Linha): EtapaConferivel[] => linhas.filter((l) => String(l.materia_prima_id) === String(m.id)).map((l) => {
        // a FK (RESTRICT, NOT NULL) garante o item; se ele não vier, é erro — nunca uma etapa sem nome
        const item = itens.get(String(l.etapa_catalogo_id))
        if (!item) throw new Error(`orcamentista_familia_etapa: a etapa ${String(l.numero)} aponta o item ${String(l.etapa_catalogo_id)}, que o catálogo de etapas não devolveu`)
        return etapaLida(l, item)
    }).sort(porNumero)

    // 1. a conferência de cada família-instância: A conferência, a mesma da tela (o fornecedor por categoria fica para o preço)
    const conferidas = new Map<string, EtapaConferivel[]>()
    for (const m of instancias) {
        const etapas = etapasDe(m)
        const r = conferirEtapasParaExecutar(etapas, { nome: nomeDa(m), familia: String(m.familia), categoriasSemFornecedor: null })
        if (r.ok === false) return { ok: false, motivo: 'ETAPAS', frase: r.erros.join('\n'), detalhe: `materia_prima=${m.id} erros=${r.erros.length}` }
        conferidas.set(String(m.id), etapas)
    }
    // 2. a mesma família em duas instâncias declara as MESMAS etapas (ação → motor); senão, não escolho
    for (const chave of chaves) {
        const dela = instancias.filter((m) => String(m.familia) === chave)
        if (dela.length < 2) continue
        const mapaDe = (m: Linha) => new Map(conferidas.get(String(m.id))!.map((e) => [e.acao, String(e.motor_id)]))
        const primeiro = mapaDe(dela[0])
        for (const m of dela.slice(1)) {
            const outro = mapaDe(m)
            const acoes = [...new Set([...primeiro.keys(), ...outro.keys()])].sort()
            if (acoes.some((a) => !primeiro.has(a) || !outro.has(a))) {
                return { ok: false, motivo: 'MOTORES_DIVERGENTES', frase: fraseDasEtapasDivergentes(dela.map(nomeDa), rotulo(chave)), detalhe: `familia=${chave}` }
            }
            const diferente = acoes.find((a) => primeiro.get(a) !== outro.get(a))
            if (diferente !== undefined && ehAcaoDaEtapa(diferente)) {
                return { ok: false, motivo: 'MOTORES_DIVERGENTES', frase: fraseDosMotoresDivergentes(dela.map(nomeDa), rotulo(chave), diferente), detalhe: `familia=${chave} acao=${diferente}` }
            }
        }
    }
    // 3. os motores: não arquivados e com conteúdo importado por motor_id
    const ids = [...new Set(linhas.map((e) => String(e.motor_id)))]
    const motores = await ler('orcamentista_motor', db().from('orcamentista_motor').select('id, nome, fornecedor_id, arquivado_em').in('id', ids))
    const motorDe = new Map(motores.map((x) => [String(x.id), x]))
    const conteudo = new Map<string, number | { erro: string }>()
    for (const m of instancias) {
        for (const e of conferidas.get(String(m.id))!) {
            const id = String(e.motor_id)
            const motor = motorDe.get(id)
            const nomeDoMotor = String(motor?.nome ?? id)
            if (!motor) throw new Error(`orcamentista_motor: o motor ${id} da etapa ${e.numero} não veio`)
            if (motor.arquivado_em != null) return { ok: false, motivo: 'MOTOR_ARQUIVADO', frase: fraseDoMotorArquivado(nomeDoMotor, nomeDa(m), e), detalhe: `motor=${id}` }
            if (!conteudo.has(id)) conteudo.set(id, await contarTipologiasDoMotor(id))
            const tipologias = conteudo.get(id)!
            if (typeof tipologias === 'object') return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase: FRASE_SEM_LISTA_DE_TIPOLOGIAS, detalhe: `codigo=${tipologias.erro}` }
            if (tipologias === 0) return { ok: false, motivo: 'MOTOR_SEM_CONTEUDO', frase: fraseDoMotorSemConteudo(nomeDoMotor, nomeDa(m), e), detalhe: `motor=${id}` }
        }
    }

    const fIds = [...new Set(motores.map((x) => String(x.fornecedor_id ?? '')).filter((x) => x !== ''))]
    const fornecedores = fIds.length ? await ler('orcamentista_fornecedor', db().from('orcamentista_fornecedor').select('id, nome').in('id', fIds)) : []
    const nomeDoFornecedor = new Map(fornecedores.map((f) => [String(f.id), String(f.nome ?? '').trim()]))
    const familias: FonteDaFamilia[] = chaves.map((chave) => {
        const m = instancias.find((x) => String(x.familia) === chave)!
        const etapas: EtapaExecutavel[] = conferidas.get(String(m.id))!.map((e) => {
            // a conferência garantiu a ação da lista, com executor, e o motor
            const acao = e.acao as AcaoDaEtapa
            const x = motorDe.get(String(e.motor_id))!
            return { numero: e.numero, rotulo: e.rotulo, acao, executor: EXECUTOR_DA_ACAO[acao]!, instrucao: e.instrucao.trim(), motor: { id: String(x.id), nome: String(x.nome) } }
        })
        const doLevantamento = etapas.find((e) => e.executor === 'levantamento')!
        const doCalculo = etapas.find((e) => e.executor === 'calculo') ?? null
        const comInstrucao = etapas.filter((e) => e.instrucao !== '')
        const corrente = comInstrucao.find((e) => e.acao === ACAO_QUE_USA_O_MODELO) ?? null
        return {
            familia: chave, rotulo: rotulo(chave),
            fornecedor: nomeDoFornecedor.get(String(motorDe.get(doLevantamento.motor.id)!.fornecedor_id ?? '')) || '(fornecedor sem nome)',
            etapas, levantamento: doLevantamento.motor, calculo: doCalculo === null ? null : doCalculo.motor,
            instrucaoDoLevantamento: corrente === null ? null : { numero: corrente.numero, rotulo: corrente.rotulo, texto: corrente.instrucao, familia: rotulo(chave) },
            instrucoesSemEfeito: comInstrucao.filter((e) => e.acao !== ACAO_QUE_USA_O_MODELO).map((e) => ({ numero: e.numero, rotulo: e.rotulo, acao: e.acao, caracteres: [...e.instrucao].length })),
        }
    }).sort((a, b) => porTexto(a.rotulo, b.rotulo))
    return { ok: true, familias }
}
