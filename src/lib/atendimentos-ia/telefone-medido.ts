/**
 * O TELEFONE MEDIDO NO CANAL (dono do produto, 11/11/2026): a ordem de autoridade de `atendimentos-ia-telefone-do-autorizado.ts` — o medido
 * vence o palpite, e o palpite vira medido assim que o canal o confirma. Este módulo é o lado do BANCO dela:
 *
 * - `numerosEntreguesPeloCanal`: os números que o WEBHOOK entregou no tenant (`orcamentista_conversa.telefone`, gravado da entrada, e
 *   `orcamentista_tentativa_desconhecida.telefone`) — a matéria-prima de (a) na escrita da autorização;
 * - `registrarFormatoMedido`: grava no remetente o número que o canal CONFIRMOU — o que o webhook entregou (a), ou a variante que o canal
 *   aceitou num envio (c). Só o MESMO número (casa pela forma normalizada) e só se mudou; a escrita confere o valor anterior (nunca sobrescreve
 *   o que outro caminho acabou de gravar). Nunca lança: o que ela tem a dizer vai ao rastro do chamador.
 *
 * O log nunca leva o telefone (a regra da conversa: "nunca a chave, o telefone ou o texto").
 */
import { supabaseAdmin } from '@/supabase/admin'
import { telefonesCasam } from '@/utils/atendimentos-ia-telefone-do-autorizado'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any

/** Os números que o webhook entregou no tenant, só dígitos — a conversa primeiro (é o remetente autorizado), depois as tentativas. */
export async function numerosEntreguesPeloCanal(tenantId: string): Promise<string[]> {
    const [conversas, tentativas] = await Promise.all([
        db().from('orcamentista_conversa').select('telefone').eq('tenant_id', tenantId),
        db().from('orcamentista_tentativa_desconhecida').select('telefone').eq('tenant_id', tenantId),
    ])
    if (conversas.error) throw new Error(`orcamentista_conversa: ${conversas.error.message}`)
    if (tentativas.error) throw new Error(`orcamentista_tentativa_desconhecida: ${tentativas.error.message}`)
    const todos = [...(conversas.data ?? []), ...(tentativas.data ?? [])] as Array<{ telefone: unknown }>
    return todos.map((l) => (typeof l.telefone === 'string' ? l.telefone.replace(/\D/g, '') : '')).filter((t) => t !== '')
}

export type RegistroDoMedido = 'gravado' | 'igual' | 'nao_casa' | 'mudou_antes' | 'conflito' | 'falhou'

/**
 * Grava `medido` no remetente `remetenteId` do tenant, no lugar de `anterior`. `origem` diz de onde veio a confirmação: o WEBHOOK (a) ou o
 * ENVIO aceito (c).
 */
export async function registrarFormatoMedido(tenantId: string, remetenteId: string, anterior: string, medido: string, origem: 'webhook' | 'envio'): Promise<RegistroDoMedido> {
    const so = medido.replace(/\D/g, '')
    if (so === anterior) return 'igual'
    // só o MESMO número — um envio aceito por um número que não é o do remetente não é medição dele
    if (!/^\d{10,13}$/.test(so) || !telefonesCasam(so, anterior)) return 'nao_casa'
    try {
        const { data, error } = await db().from('orcamentista_remetente_autorizado').update({ telefone: so })
            .eq('tenant_id', tenantId).eq('id', remetenteId).eq('telefone', anterior).select('id')
        if (error) {
            const r: RegistroDoMedido = error.code === '23505' ? 'conflito' : 'falhou'
            console.error(`[ORCAMENTISTA telefone] remetente=${remetenteId} origem=${origem} registro=${r}`)
            return r
        }
        const r: RegistroDoMedido = Array.isArray(data) && data.length === 1 ? 'gravado' : 'mudou_antes'
        console.error(`[ORCAMENTISTA telefone] remetente=${remetenteId} origem=${origem} registro=${r}`)
        return r
    } catch {
        console.error(`[ORCAMENTISTA telefone] remetente=${remetenteId} origem=${origem} registro=falhou`)
        return 'falhou'
    }
}
