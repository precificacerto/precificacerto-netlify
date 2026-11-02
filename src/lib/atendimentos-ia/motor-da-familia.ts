/**
 * Atendimentos I.A. — O MOTOR DA CONVERSA VEM DA FAMÍLIA, não da tabela de fornecedor (PR D, dono do produto, 02/11/2026). SÓ SERVIDOR.
 *
 * ══ A ORIGEM ══
 *   família da conta (a base de conhecimento: `orcamentista_materia_prima.familia`, as distintas)
 *     → `orcamentista_familia_etapa` da família-instância (numero 1 e numero 2)
 *     → `motor_id` → `orcamentista_motor` (não arquivado, com tipologias importadas por `motor_id`).
 *   A etapa 1 (Gerar o levantamento) dá o motor do LEVANTAMENTO: a lista de tipologias e as Variáveis que a conversa pergunta.
 *   A etapa 2 (Calcular as barras) dá o motor do CÁLCULO: as abas, as regras, as fórmulas da linha e o tempo de fabricação.
 *   O fluxo continua o fixo da conversa: a etapa é lida pelo NÚMERO, e `etapa_catalogo.acao` não executa nada nesta PR.
 *   A tabela de fornecedor deixa de ser fonte do motor: é só fonte do PREÇO (`levantamento-da-conversa.ts`).
 *
 * ══ FALTA DE CONFIGURAÇÃO É ERRO EXPLÍCITO ══
 * Nunca fallback, nunca "a primeira", nunca voltar a ler o motor por `tabela_id`. Cada falta tem a sua frase, no padrão
 * "Falta de configuração — <o que falta>: verifique o catálogo em <seção>.":
 *   - a conta sem família na base de conhecimento;
 *   - a família-instância sem a etapa 1 ou a 2;
 *   - a etapa sem motor;
 *   - o motor arquivado, ou sem conteúdo importado (0 tipologias por `motor_id`);
 *   - duas famílias-instância da MESMA família apontando motores diferentes na mesma etapa (dono do produto, 02/11/2026: não escolho).
 * A falta de tabela de preço vigente é do preço e mora em `levantamento-da-conversa.ts`, com a mesma forma de frase.
 */
import { supabaseAdmin } from '@/supabase/admin'

// O cliente admin não tem os tipos destas tabelas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

/** As duas etapas que a conversa usa, pelo número (o fluxo fixo; a ação do catálogo não executa nada nesta PR). */
export const ETAPA_DO_LEVANTAMENTO = 1
export const ETAPA_DO_CALCULO = 2
const NOME_DA_ETAPA: Record<number, string> = { [ETAPA_DO_LEVANTAMENTO]: 'Gerar o levantamento', [ETAPA_DO_CALCULO]: 'Calcular as barras e os materiais' }

export const SECAO_DAS_FAMILIAS = 'Base de conhecimento › Famílias'
export const SECAO_DAS_ETAPAS = 'Base de conhecimento › Etapas da família'
export const SECAO_DOS_MOTORES = 'Catálogo › Motores'
export const SECAO_DOS_FORNECEDORES = 'Catálogo › Fornecedores'

/** O padrão do dono do produto, 02/11/2026: "Falta de configuração — <o que falta>: verifique o catálogo em <seção>". */
export const fraseDeFalta = (oQueFalta: string, secao: string) => `Falta de configuração — ${oQueFalta}: verifique o catálogo em ${secao}.`

export const FRASE_SEM_FAMILIA = fraseDeFalta('a base de conhecimento da empresa não tem família', SECAO_DAS_FAMILIAS)
const etapaDita = (n: number) => `a etapa ${n} (${NOME_DA_ETAPA[n]})`
export const fraseDaFamiliaSemEtapa = (familia: string, n: number) => fraseDeFalta(`a família ${familia} não tem ${etapaDita(n)} cadastrada`, SECAO_DAS_ETAPAS)
export const fraseDaEtapaSemMotor = (familia: string, n: number) => fraseDeFalta(`${etapaDita(n)} da família ${familia} não tem motor`, SECAO_DAS_ETAPAS)
export const fraseDoMotorArquivado = (motor: string, familia: string, n: number) =>
    fraseDeFalta(`o motor ${motor}, da etapa ${n} da família ${familia}, está arquivado`, SECAO_DOS_MOTORES)
export const fraseDoMotorSemConteudo = (motor: string, familia: string, n: number) =>
    fraseDeFalta(`o motor ${motor}, da etapa ${n} da família ${familia}, não tem tipologias importadas`, SECAO_DOS_MOTORES)
/** A tabela da lista de tipologias não está no banco (a leitura volta com erro): recusa nomeada, como antes do PR D. */
export const FRASE_SEM_LISTA_DE_TIPOLOGIAS = 'Ainda não consigo escolher a tipologia: a lista de tipologias do motor, com a descrição de cada uma, ainda não foi carregada.'
export const fraseDosMotoresDivergentes = (familias: readonly string[], rotulo: string, n: number) =>
    fraseDeFalta(`as famílias ${familias.join(' e ')} (${rotulo}) apontam motores diferentes na etapa ${n}`, SECAO_DAS_ETAPAS)

export type MotorDaEtapa = { id: string; nome: string }
/** Uma família da conta, com o motor de cada etapa que a conversa usa. */
export type FonteDaFamilia = {
    /** A CHAVE do catálogo (a que o item de levantamento grava em `familia`). */
    familia: string
    /** O rótulo do catálogo ("PVC Wolf"): é como o vendedor a reconhece. */
    rotulo: string
    /** O fornecedor do motor do levantamento (o motor tem fornecedor): entra na pergunta "de qual é" quando há mais de uma família. */
    fornecedor: string
    levantamento: MotorDaEtapa
    calculo: MotorDaEtapa
}
export type MotivoDaFalta = 'SEM_FAMILIA' | 'SEM_ETAPA' | 'ETAPA_SEM_MOTOR' | 'MOTOR_ARQUIVADO' | 'MOTOR_SEM_CONTEUDO' | 'MOTORES_DIVERGENTES' | 'SEM_LISTA_DE_TIPOLOGIAS'
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

/**
 * As famílias da conta e o motor de cada etapa, conferidos. Lê só dados da conta (`tenant_id`) e o catálogo global
 * (famílias, etapas do catálogo não são lidas, motores). A primeira falta encontrada é a resposta, na ordem: família,
 * etapa, motor da etapa, motor arquivado, conteúdo — família-instância por família-instância, pelo nome.
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

    const etapas = await ler('orcamentista_familia_etapa', db().from('orcamentista_familia_etapa')
        .select('materia_prima_id, numero, motor_id').eq('tenant_id', tenantId).in('materia_prima_id', instancias.map((m) => String(m.id)))
        .in('numero', [ETAPA_DO_LEVANTAMENTO, ETAPA_DO_CALCULO]))
    const etapaDe = (m: Linha, n: number) => etapas.find((e) => String(e.materia_prima_id) === String(m.id) && Number(e.numero) === n)

    // 1. cada família-instância tem as duas etapas, e cada etapa tem motor
    for (const m of instancias) {
        for (const n of [ETAPA_DO_LEVANTAMENTO, ETAPA_DO_CALCULO]) {
            const e = etapaDe(m, n)
            if (!e) return { ok: false, motivo: 'SEM_ETAPA', frase: fraseDaFamiliaSemEtapa(nomeDa(m), n), detalhe: `materia_prima=${m.id} numero=${n}` }
            if (typeof e.motor_id !== 'string' || e.motor_id === '') return { ok: false, motivo: 'ETAPA_SEM_MOTOR', frase: fraseDaEtapaSemMotor(nomeDa(m), n), detalhe: `materia_prima=${m.id} numero=${n}` }
        }
    }
    // 2. a mesma família em duas instâncias aponta o MESMO motor em cada etapa (senão, não escolho)
    for (const chave of chaves) {
        const dela = instancias.filter((m) => String(m.familia) === chave)
        for (const n of [ETAPA_DO_LEVANTAMENTO, ETAPA_DO_CALCULO]) {
            const motores = new Set(dela.map((m) => String(etapaDe(m, n)!.motor_id)))
            if (motores.size > 1) return { ok: false, motivo: 'MOTORES_DIVERGENTES', frase: fraseDosMotoresDivergentes(dela.map(nomeDa), rotulo(chave), n), detalhe: `familia=${chave} numero=${n}` }
        }
    }
    // 3. os motores: não arquivados e com conteúdo importado por motor_id
    const ids = [...new Set(etapas.map((e) => String(e.motor_id)))]
    const motores = await ler('orcamentista_motor', db().from('orcamentista_motor').select('id, nome, fornecedor_id, arquivado_em').in('id', ids))
    const motorDe = new Map(motores.map((x) => [String(x.id), x]))
    const conteudo = new Map<string, number | { erro: string }>()
    for (const m of instancias) {
        for (const n of [ETAPA_DO_LEVANTAMENTO, ETAPA_DO_CALCULO]) {
            const id = String(etapaDe(m, n)!.motor_id)
            const motor = motorDe.get(id)
            const nomeDoMotor = String(motor?.nome ?? id)
            if (!motor) throw new Error(`orcamentista_motor: o motor ${id} da etapa ${n} não veio`)
            if (motor.arquivado_em != null) return { ok: false, motivo: 'MOTOR_ARQUIVADO', frase: fraseDoMotorArquivado(nomeDoMotor, nomeDa(m), n), detalhe: `motor=${id}` }
            if (!conteudo.has(id)) conteudo.set(id, await contarTipologiasDoMotor(id))
            const tipologias = conteudo.get(id)!
            if (typeof tipologias === 'object') return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase: FRASE_SEM_LISTA_DE_TIPOLOGIAS, detalhe: `codigo=${tipologias.erro}` }
            if (tipologias === 0) return { ok: false, motivo: 'MOTOR_SEM_CONTEUDO', frase: fraseDoMotorSemConteudo(nomeDoMotor, nomeDa(m), n), detalhe: `motor=${id}` }
        }
    }

    const fIds = [...new Set(motores.map((x) => String(x.fornecedor_id ?? '')).filter((x) => x !== ''))]
    const fornecedores = fIds.length ? await ler('orcamentista_fornecedor', db().from('orcamentista_fornecedor').select('id, nome').in('id', fIds)) : []
    const nomeDoFornecedor = new Map(fornecedores.map((f) => [String(f.id), String(f.nome ?? '').trim()]))
    const familias: FonteDaFamilia[] = chaves.map((chave) => {
        const m = instancias.find((x) => String(x.familia) === chave)!
        const motorDa = (n: number): MotorDaEtapa => { const x = motorDe.get(String(etapaDe(m, n)!.motor_id))!; return { id: String(x.id), nome: String(x.nome) } }
        const doLevantamento = motorDe.get(String(etapaDe(m, ETAPA_DO_LEVANTAMENTO)!.motor_id))!
        return {
            familia: chave, rotulo: rotulo(chave),
            fornecedor: nomeDoFornecedor.get(String(doLevantamento.fornecedor_id ?? '')) || '(fornecedor sem nome)',
            levantamento: motorDa(ETAPA_DO_LEVANTAMENTO), calculo: motorDa(ETAPA_DO_CALCULO),
        }
    }).sort((a, b) => porTexto(a.rotulo, b.rotulo))
    return { ok: true, familias }
}
