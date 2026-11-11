/**
 * A ETAPA DO PREÇO NA CADEIA DO "SIM" (dono do produto, 11/11/2026): depois da travessia e do cálculo, o agente precifica, gera o PDF
 * "Orçamento" e o envia ao DONO DO LEVANTAMENTO (o `remetente_id` do levantamento → o telefone do remetente autorizado), não a quem disse
 * "sim".
 *
 * As regras desta etapa, na ordem:
 * - (d) QUANDO O PREÇO NÃO SE FORMA, NÃO HÁ PDF: a etapa PARA antes do arquivo, nada é gravado, o vendedor recebe o que falta NOMEADO
 *   (`fraseDoPrecoQueNaoSaiu`) e o rastro registra `parou=precificacao`;
 * - o arquivo que não sai depois do preço gravado (o rateio que não fecha, a falha do Storage): o preço FICA, nada é enviado, o vendedor
 *   recebe o porquê e o rastro registra `parou=arquivo`;
 * - o ENVIO que falha: o orçamento e o arquivo ficam salvos, e o rastro registra a falha (`envio=falhou`). Nada é desfeito.
 *
 * O envio e as leituras entram por `DependenciasDaEtapa`, para que a etapa seja provada sem rede; na conversa, o envio é o `enviarDocumento` do
 * WUZAPI com o token do canal ORCAMENTISTA (ligado em 11/11/2026, com o relógio aprovado: ~33 s típico, ~130 s no pior caso, contra 300 s).
 * Cada passo leva o seu tempo no rastro (`ms_*`): é o mesmo relógio, medido em produção.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { normalizePhoneBR } from '@/lib/wuzapi-send'
import { telefonesCasam } from '@/utils/atendimentos-ia-telefone-do-autorizado'
import { lerUltimoArquivo } from './arquivo-do-orcamento-servidor'
import { precificarComoAgente, type PrecificacaoDoAgente } from './preco-do-orcamento-servidor'

export type EnvioDoDocumento = { ok: boolean; status: number | null; prazoEsgotado: boolean }
export type DependenciasDaEtapa = {
    precificar: (tenantId: string, orcamentoId: string) => Promise<PrecificacaoDoAgente>
    lerArquivo: (tenantId: string, orcamentoId: string) => Promise<{ pdf: Uint8Array } | null>
    telefoneDoDono: (tenantId: string, orcamentoId: string) => Promise<string | null>
    enviar: (telefone: string, nomeDoArquivo: string, pdf: Uint8Array) => Promise<EnvioDoDocumento>
    agora: () => number
}

export type ResultadoDaEtapa = {
    /** A parte do rastro `[IA]` desta etapa. */
    rastro: string
    /** O que o vendedor recebe por TEXTO junto com a resposta do "sim"; nulo só quando nem o orçamento existe para dizer algo. */
    paraOVendedor: string | null
}

const reaisBR = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const motivoDoLog = (t: string) => t.replace(/"/g, "'").slice(0, 160)

export const fraseDoPrecoQueNaoSaiu = (numero: number, nome: string, faltas: readonly string[]) =>
    `O orçamento ${numero} (${nome}) foi calculado, mas o preço não se formou, e por isso o arquivo não foi gerado nem enviado. `
    + `Falta: ${faltas.join('; ')}.`
export const fraseDoArquivoQueNaoSaiu = (numero: number, nome: string, venda: number, recusas: readonly string[]) =>
    `O orçamento ${numero} (${nome}) está precificado em ${reaisBR(venda)}, mas o arquivo não pôde ser gerado: ${recusas.join('; ')}. `
    + 'A precificação está salva.'
export const fraseDoOrcamentoEnviado = (numero: number, nome: string, venda: number) =>
    `O orçamento ${numero} (${nome}) foi precificado em ${reaisBR(venda)}, e o arquivo foi enviado ao vendedor do levantamento.`
export const fraseDoEnvioQueFalhou = (numero: number, nome: string) =>
    `O orçamento ${numero} (${nome}) está precificado e o arquivo foi gerado, mas o envio dele falhou. Nada se perdeu: o arquivo está na seção `
    + 'Orçamentos I.A.'
export const fraseDoDonoSemTelefone = (numero: number, nome: string) =>
    `O orçamento ${numero} (${nome}) está precificado e o arquivo foi gerado, mas o dono do levantamento não tem telefone cadastrado: o arquivo não foi enviado.`

export async function etapaDoPreco(tenantId: string, orcamentoId: string, deps: DependenciasDaEtapa): Promise<ResultadoDaEtapa> {
    const t0 = deps.agora()
    const p = await deps.precificar(tenantId, orcamentoId)
    const msPreco = deps.agora() - t0
    if ('faltas' in p) {
        return {
            rastro: `precificacao=recusou faltas=${p.faltas.length} ms_preco=${msPreco} parou=precificacao motivo="${motivoDoLog(p.faltas.join(' | '))}"`,
            paraOVendedor: fraseDoPrecoQueNaoSaiu(p.orcamento.numero, p.orcamento.nome, p.faltas),
        }
    }
    const o = p.gravado.orcamento
    const venda = Number(o.valor_venda)
    const precificacao = `precificacao=ok venda=${venda.toFixed(2)} interna=${Number(o.valor_operacao_interna).toFixed(2)} ms_preco=${msPreco}`
    if (!p.gravado.arquivo) {
        return {
            rastro: `${precificacao} arquivo=recusou parou=arquivo motivo="${motivoDoLog(p.gravado.recusasDoArquivo.join(' | '))}"`,
            paraOVendedor: fraseDoArquivoQueNaoSaiu(o.numero, o.nome, venda, p.gravado.recusasDoArquivo),
        }
    }
    const arquivo = p.gravado.arquivo
    const t1 = deps.agora()
    const [lido, telefone] = await Promise.all([deps.lerArquivo(tenantId, orcamentoId), deps.telefoneDoDono(tenantId, orcamentoId)])
    const msLeitura = deps.agora() - t1
    const doArquivo = `${precificacao} arquivo=ok ms_leitura=${msLeitura}`
    if (!lido) return { rastro: `${doArquivo} envio=sem_arquivo parou=envio`, paraOVendedor: fraseDoEnvioQueFalhou(o.numero, o.nome) }
    if (!telefone) return { rastro: `${doArquivo} envio=sem_telefone parou=envio`, paraOVendedor: fraseDoDonoSemTelefone(o.numero, o.nome) }
    const t2 = deps.agora()
    const envio = await deps.enviar(telefone, arquivo.nomeDoArquivo, lido.pdf)
    const msEnvio = deps.agora() - t2
    if (!envio.ok) {
        return {
            rastro: `${doArquivo} envio=falhou status=${envio.status ?? 'nenhum'}${envio.prazoEsgotado ? ' prazo=esgotado' : ''} ms_envio=${msEnvio} parou=envio`,
            paraOVendedor: fraseDoEnvioQueFalhou(o.numero, o.nome),
        }
    }
    return { rastro: `${doArquivo} envio=ok ms_envio=${msEnvio}`, paraOVendedor: fraseDoOrcamentoEnviado(o.numero, o.nome, venda) }
}

/** O telefone do DONO do levantamento do orçamento (o remetente que o abriu), no tenant; nulo quando falta qualquer elo. */
export async function telefoneDoDonoDoOrcamento(tenantId: string, orcamentoId: string): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
    const db = supabaseAdmin as any
    const { data: orc, error: e1 } = await db.from('orcamentista_orcamento').select('levantamento_id').eq('tenant_id', tenantId).eq('id', orcamentoId).maybeSingle()
    if (e1) throw new Error(`orcamentista_orcamento: ${e1.message}`)
    if (!orc?.levantamento_id) return null
    const { data: lev, error: e2 } = await db.from('orcamentista_levantamento').select('remetente_id').eq('tenant_id', tenantId).eq('id', orc.levantamento_id).maybeSingle()
    if (e2) throw new Error(`orcamentista_levantamento: ${e2.message}`)
    if (!lev?.remetente_id) return null
    const { data: rem, error: e3 } = await db.from('orcamentista_remetente_autorizado').select('telefone').eq('tenant_id', tenantId).eq('id', lev.remetente_id).maybeSingle()
    if (e3) throw new Error(`orcamentista_remetente_autorizado: ${e3.message}`)
    const tel = typeof rem?.telefone === 'string' ? rem.telefone.trim() : ''
    return tel === '' ? null : tel
}

/**
 * OS NÚMEROS DO WHATSAPP PARA O DONO, na ordem de tentativa. Desde 11/11/2026 o telefone do remetente é GRAVADO no formato do canal
 * (`telefoneNoFormatoDoCanal`: 55 + DDD + assinante, o celular sem o nono), e é ele o mecanismo: o primeiro destino. Quando o dono é quem está na
 * conversa (os dois casam), vai o número EXATO do webhook. As variantes do envio de referência (`normalizePhoneBR`) ficam como REDE DE SEGURANÇA —
 * para a linha gravada antes de 11/11/2026 (na forma normalizada, sem o DDI) e para um DDD em que o canal mantenha o nono (não medido).
 */
export function destinosDoWhatsApp(telefoneDoDono: string, telefoneDaConversa: string): string[] {
    return telefonesCasam(telefoneDaConversa, telefoneDoDono) ? [telefoneDaConversa] : normalizePhoneBR(telefoneDoDono)
}

/** Envia pela lista de destinos, parando no primeiro que aceitar; o resultado é o do último tentado. */
export async function enviarAoPrimeiroQueAceitar(destinos: readonly string[], enviar: (telefone: string) => Promise<EnvioDoDocumento>): Promise<EnvioDoDocumento> {
    let ultimo: EnvioDoDocumento = { ok: false, status: null, prazoEsgotado: false }
    for (const d of destinos) {
        ultimo = await enviar(d)
        if (ultimo.ok) return ultimo
    }
    return ultimo
}

/** As dependências de produção, menos o envio (que vem da conversa, com o token do canal). */
export const dependenciasDoServidor = (enviar: DependenciasDaEtapa['enviar']): DependenciasDaEtapa => ({
    precificar: (t, o) => precificarComoAgente(t, o),
    lerArquivo: lerUltimoArquivo,
    telefoneDoDono: telefoneDoDonoDoOrcamento,
    enviar,
    agora: () => Date.now(),
})
