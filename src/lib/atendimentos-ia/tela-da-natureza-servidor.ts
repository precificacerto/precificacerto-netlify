/**
 * A LEITURA da tela da natureza da variável (`tela-da-natureza.ts`), SÓ SERVIDOR (`service_role`, filtrada pelo tenant): por família da conta,
 * o motor do levantamento (o da etapa GERAR_LEVANTAMENTO, `lerMotoresDaConta` — a mesma leitura da conversa), as variáveis dele resumidas, os
 * formatos das tipologias (o grupo do leitor do vidro padrão, `formatoDoGrupo`) e as linhas gravadas da natureza com a conferência de cada
 * política contra as tipologias. Configuração que falta (família, etapa, motor) volta com a frase da conferência, nunca vazia em silêncio.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { lerMotoresDaConta } from '@/lib/atendimentos-ia/motor-da-familia'
import { lerVariaveisDasTipologias } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import { fraseDaReferenciaQueOPrincipalNaoTem, grupoDaTipologia, referenciasDeVidroDoPrincipal, type ReferenciaDeVidro } from '@/lib/atendimentos-ia/vidro-padrao'
import { formatoDoGrupo, TABELA_DA_NATUREZA, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import { lerTextosDoCaminho } from '@/lib/atendimentos-ia/textos-do-caminho-servidor'
import { textosDaFamiliaNaTela, type TextosDaFamilia } from '@/lib/atendimentos-ia/textos-do-caminho'
import { conferirOpcao, fraseDaConferencia, resumoDasVariaveis, type LinhaDaTela, type VariavelResumida } from '@/lib/atendimentos-ia/tela-da-natureza'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas da base são lidas como linha solta
const db = () => supabaseAdmin as any

export type LinhaGravada = LinhaDaNatureza & { atualizado_em: string | null; conferencia: string | null }
export type FamiliaDaTela = {
    familia: string; rotulo: string; motor: { id: string; nome: string }; variaveis: VariavelResumida[]; formatos: string[]; linhas: LinhaGravada[]
    /** Os textos da família e dos fornecedores do caminho dela (20261121000003); null = a tabela ainda não existe (a migração pendente). */
    textos: TextosDaFamilia | null
    /** As referências (`codigo_wvetro`) da tabela de vidro do fornecedor principal: o que o padrão do VIDRO pode guardar (24/11/2026). */
    vidros: ReferenciaDeVidro[]
}
export type TelaDaNatureza = { ok: true; familias: FamiliaDaTela[] } | { ok: false; frase: string; linhas: LinhaGravada[] }

async function linhasDaConta(tenantId: string): Promise<LinhaDaNatureza[] & { atualizado_em?: string }[]> {
    const r = await db().from(TABELA_DA_NATUREZA).select('familia, linha, formato, variavel, natureza, opcao_padrao, atualizado_em').eq('tenant_id', tenantId)
    if (r.error) throw new Error(`${TABELA_DA_NATUREZA}: ${r.error.code ?? r.error.message}`)
    return (r.data ?? []) as LinhaDaNatureza[] & { atualizado_em?: string }[]
}

const ordem = (a: LinhaDaNatureza, b: LinhaDaNatureza) => a.variavel.localeCompare(b.variavel) || String(a.formato ?? '').localeCompare(String(b.formato ?? ''))
const semConferencia = (l: LinhaDaNatureza & { atualizado_em?: string }): LinhaGravada => ({ ...l, atualizado_em: l.atualizado_em ?? null, conferencia: null })

/**
 * A RECUSA do padrão do VIDRO antes de gravar (dono do produto, 24/11/2026): a política do VIDRO guarda uma REFERÊNCIA (`codigo_wvetro`) da tabela
 * de vidro do fornecedor principal; a que ela não tem é recusada com a frase — o padrão nunca aponta para um vidro que o custo não acha. Null
 * quando a linha não é a política do VIDRO, ou quando a referência existe.
 */
export async function recusaDoVidroDaLinha(tenantId: string, linha: LinhaDaTela): Promise<string | null> {
    if (linha.variavel !== 'VIDRO' || linha.natureza !== 'POLITICA' || linha.opcao_padrao === null) return null
    const referencias = await referenciasDeVidroDoPrincipal(tenantId)
    return referencias.some((r) => r.referencia === linha.opcao_padrao) ? null : fraseDaReferenciaQueOPrincipalNaoTem(linha.opcao_padrao, referencias.length)
}

export async function lerTelaDaNatureza(tenantId: string): Promise<TelaDaNatureza> {
    const [motores, linhas, textos, vidros] = await Promise.all([lerMotoresDaConta(tenantId), linhasDaConta(tenantId), lerTextosDoCaminho(tenantId, { sempreOCaminho: true }), referenciasDeVidroDoPrincipal(tenantId)])
    const referencias = new Set(vidros.map((v) => v.referencia))
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
            if (l.natureza !== 'POLITICA' || l.opcao_padrao === null) return base
            // o padrão do VIDRO é uma REFERÊNCIA da tabela do principal: a que ela não tem é dita na tela (e o custo a nomeia como falta)
            if (l.variavel === 'VIDRO') return referencias.has(l.opcao_padrao) ? base : { ...base, conferencia: fraseDaReferenciaQueOPrincipalNaoTem(l.opcao_padrao, referencias.size) }
            return { ...base, conferencia: fraseDaConferencia(l.variavel, l.opcao_padrao, conferirOpcao(l.variavel, l.opcao_padrao, porTipologia)) }
        })
        return { familia: f.familia, rotulo: f.rotulo, motor: f.levantamento, variaveis: resumoDasVariaveis(porTipologia), formatos, linhas: daFamilia, textos: textosDaFamiliaNaTela(textos, f.familia), vidros }
    }))
    return { ok: true, familias }
}
