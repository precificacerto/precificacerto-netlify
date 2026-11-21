/**
 * A LEITURA da tela da natureza da variável (`tela-da-natureza.ts`), SÓ SERVIDOR (`service_role`, filtrada pelo tenant): por família da conta,
 * o motor do levantamento (o da etapa GERAR_LEVANTAMENTO, `lerMotoresDaConta` — a mesma leitura da conversa), as variáveis dele resumidas, os
 * formatos das tipologias (o grupo do leitor do vidro padrão, `formatoDoGrupo`) e as linhas gravadas da natureza com a conferência de cada
 * política contra as tipologias. Configuração que falta (família, etapa, motor) volta com a frase da conferência, nunca vazia em silêncio.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { lerMotoresDaConta } from '@/lib/atendimentos-ia/motor-da-familia'
import { lerVariaveisDasTipologias } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import { grupoDaTipologia } from '@/lib/atendimentos-ia/vidro-padrao'
import { formatoDoGrupo, TABELA_DA_NATUREZA, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import { conferirOpcao, fraseDaConferencia, resumoDasVariaveis, type VariavelResumida } from '@/lib/atendimentos-ia/tela-da-natureza'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas da base são lidas como linha solta
const db = () => supabaseAdmin as any

export type LinhaGravada = LinhaDaNatureza & { atualizado_em: string | null; conferencia: string | null }
export type FamiliaDaTela = { familia: string; rotulo: string; motor: { id: string; nome: string }; variaveis: VariavelResumida[]; formatos: string[]; linhas: LinhaGravada[] }
export type TelaDaNatureza = { ok: true; familias: FamiliaDaTela[] } | { ok: false; frase: string; linhas: LinhaGravada[] }

async function linhasDaConta(tenantId: string): Promise<LinhaDaNatureza[] & { atualizado_em?: string }[]> {
    const r = await db().from(TABELA_DA_NATUREZA).select('familia, linha, formato, variavel, natureza, opcao_padrao, atualizado_em').eq('tenant_id', tenantId)
    if (r.error) throw new Error(`${TABELA_DA_NATUREZA}: ${r.error.code ?? r.error.message}`)
    return (r.data ?? []) as LinhaDaNatureza[] & { atualizado_em?: string }[]
}

const ordem = (a: LinhaDaNatureza, b: LinhaDaNatureza) => a.variavel.localeCompare(b.variavel) || String(a.formato ?? '').localeCompare(String(b.formato ?? ''))
const semConferencia = (l: LinhaDaNatureza & { atualizado_em?: string }): LinhaGravada => ({ ...l, atualizado_em: l.atualizado_em ?? null, conferencia: null })

export async function lerTelaDaNatureza(tenantId: string): Promise<TelaDaNatureza> {
    const [motores, linhas] = await Promise.all([lerMotoresDaConta(tenantId), linhasDaConta(tenantId)])
    if (motores.ok === false) return { ok: false, frase: motores.frase, linhas: [...linhas].sort(ordem).map(semConferencia) }
    const familias = await Promise.all(motores.familias.map(async (f): Promise<FamiliaDaTela> => {
        const [porTipologia, detalhe] = await Promise.all([
            lerVariaveisDasTipologias(f.levantamento.id, 'documento'),
            db().from('orcamentista_motor_tipologia_detalhe').select('tipologia, descricao, tipo, linha').eq('motor_id', f.levantamento.id),
        ])
        if (detalhe.error) throw new Error(`orcamentista_motor_tipologia_detalhe: ${detalhe.error.code ?? detalhe.error.message}`)
        const formatos = [...new Set(((detalhe.data ?? []) as Array<{ descricao: string | null; tipo: string | null; linha: string | null }>)
            .map((d) => formatoDoGrupo(grupoDaTipologia(d))).filter((x): x is string => x !== null))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
        const daFamilia = linhas.filter((l) => l.familia === f.familia).sort(ordem).map((l): LinhaGravada => {
            const base = semConferencia(l)
            if (l.natureza !== 'POLITICA' || l.opcao_padrao === null || l.variavel === 'VIDRO') return base
            return { ...base, conferencia: fraseDaConferencia(l.variavel, l.opcao_padrao, conferirOpcao(l.variavel, l.opcao_padrao, porTipologia)) }
        })
        return { familia: f.familia, rotulo: f.rotulo, motor: f.levantamento, variaveis: resumoDasVariaveis(porTipologia), formatos, linhas: daFamilia }
    }))
    return { ok: true, familias }
}
