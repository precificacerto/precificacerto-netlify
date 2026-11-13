/**
 * Atendimentos I.A. — O VIDRO PADRÃO POR GRUPO DE TIPOLOGIA, COM EXCEÇÃO POR TIPOLOGIA (dono do produto, 13/11/2026; a tabela é a
 * `orcamentista_vidro_padrao`, migração `20261113000001`, aplicada e conferida em 13/11/2026). SÓ SERVIDOR na leitura (`service_role`).
 *
 * As decisões, registradas como foram ditas:
 *   - "O QUE ELE GUARDA É O CÓDIGO DO ITEM, não o nome da família. [...] ou a base guarda um código único por tipologia, e aí o agente assume sem
 *     perguntar e escreve na linha CONSIDERADO; ou não há padrão para aquela tipologia, e aí o agente PERGUNTA. Não existe meio-termo, e nada se
 *     escolhe por ser o mais barato."
 *   - "padrão por grupo, exceção por tipologia quando for diferente [...] Forma A, 9 grupos." O GRUPO é (abertura, tipo), lido pelo MESMO leitor
 *     do padrão da tipologia (`atributosDaDescricao`); a EXCEÇÃO é o código CRU da tipologia (DP-017 e DP-17 são duas).
 *   - "o leitor casa o PAR exato (abertura, tipo), nunca só o tipo" — a maxim-ar (sem abertura na descrição) casa só a linha de abertura NULA.
 *   - "o leitor do padrão resolve o código DENTRO do fornecedor da ramificação, nunca numa busca global por codigo": a descrição do código vem da
 *     tabela VIDRO do fornecedor PRINCIPAL da categoria VIDRO da conta (`principaisDaConta` + `derivarTabelasDaConta`, as mesmas do custo).
 *   - "item_codigo NÃO TEM FK [...] vale a regra da falta: o orçamento vai até o fim, a falta vem NOMEADA com o código e a tipologia, PDF carimbado
 *     PARCIAL. Não recusa, não estoura, não chuta outro vidro." O código que a tabela do principal não tem continua sendo o padrão; o custo o
 *     acusa (`VIDRO_CODIGO_FORA_DA_TABELA`, `vidro-da-tabela.ts`), e o texto do vidro fica sendo o próprio código.
 *   - "a instrução de VIDRO deixando de valer como padrão mas seguindo visível": o `vidro_padrao` da ferramenta não preenche mais o vidro
 *     (`levantamento-em-montagem.ts`); a instrução continua no prompt, como as das outras categorias.
 *   - QUEM LÊ: "service_role em rota de servidor". A RLS da tabela só deixa passar `is_super_admin()`; com o JWT de um usuário a leitura voltaria
 *     VAZIA e o agente perguntaria o vidro de toda tipologia, sem erro. O leitor usa `supabaseAdmin` — e o teste trava isso.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { atributosDaDescricao } from '@/lib/atendimentos-ia/tipologia-padrao'
import { derivarTabelasDaConta, principaisDaConta } from '@/lib/atendimentos-ia/tabelas-da-conta'
import type { Abertura } from '@/lib/atendimentos-ia/tipologias-candidatas'

export const TABELA_DO_VIDRO_PADRAO = 'orcamentista_vidro_padrao'

/** Uma linha da tabela: de GRUPO (abertura + tipo, tipologia nula) ou de EXCEÇÃO (tipologia, abertura e tipo nulos). */
export type LinhaDoVidroPadrao = { materia_prima_id: string; abertura: Abertura | null; tipo: string | null; tipologia: string | null; item_codigo: string }
/** O grupo de uma tipologia (forma A): a abertura que a descrição declara (ou nenhuma) e o tipo curto. */
export type GrupoDaTipologia = { abertura: Abertura | null; tipo: string }
/** O padrão achado: o código, de onde veio (a exceção da tipologia ou o grupo) e o grupo. */
export type VidroPadrao = { codigo: string; origem: 'excecao' | 'grupo'; grupo: GrupoDaTipologia | null }

/** O grupo da tipologia pelo leitor do padrão; sem tipo lido, não há grupo (só a exceção pode valer). */
export function grupoDaTipologia(c: { descricao: string | null; tipo: string | null; linha: string | null }): GrupoDaTipologia | null {
    const a = atributosDaDescricao(c)
    return a.tipo === null ? null : { abertura: a.abertura, tipo: a.tipo }
}

/** O grupo dito em linguagem de obra, para o CONSIDERADO: "janela de correr", "maxim-ar", "porta oscilo-batente". */
export function grupoNaFrase(g: GrupoDaTipologia): string {
    const tipo = g.tipo === 'correr' ? 'de correr' : g.tipo === 'abrir' ? 'de giro' : g.tipo
    return g.abertura === null ? g.tipo : `${g.abertura} ${tipo}`
}

/**
 * O padrão da tipologia entre as linhas das matérias-primas da família dela: a EXCEÇÃO (o código cru, igual) vence o GRUPO (o PAR exato). Duas
 * linhas que valem e discordam no código (duas matérias-primas da mesma família) não são padrão: null, e o agente pergunta — nunca a primeira.
 */
export function padraoDoVidro(linhas: readonly LinhaDoVidroPadrao[], c: { tipologia: string; descricao: string | null; tipo: string | null; linha: string | null }): VidroPadrao | null {
    const grupo = grupoDaTipologia(c)
    const unico = (xs: readonly LinhaDoVidroPadrao[]) => { const cs = new Set(xs.map((x) => x.item_codigo)); return cs.size === 1 ? [...cs][0] : null }
    const excecoes = linhas.filter((l) => l.tipologia !== null && l.tipologia === c.tipologia)
    if (excecoes.length > 0) { const codigo = unico(excecoes); return codigo === null ? null : { codigo, origem: 'excecao', grupo } }
    if (grupo === null) return null
    const doGrupo = linhas.filter((l) => l.tipologia === null && l.tipo === grupo.tipo && l.abertura === grupo.abertura)
    if (doGrupo.length === 0) return null
    const codigo = unico(doGrupo)
    return codigo === null ? null : { codigo, origem: 'grupo', grupo }
}

/** A origem no CONSIDERADO: "padrão da empresa para janela de correr" ou "padrão da empresa para a tipologia DP-07". */
export function origemNaFrase(p: VidroPadrao, tipologia: string): string {
    return p.origem === 'excecao' || p.grupo === null ? `padrão da empresa para a tipologia ${tipologia}` : `padrão da empresa para ${grupoNaFrase(p.grupo)}`
}

/** Os padrões da conta, por família, e a descrição de cada código na tabela VIDRO do fornecedor principal (só os que ela tem). */
export type VidrosPadraoDaConta =
    | { ok: true; porFamilia: ReadonlyMap<string, readonly LinhaDoVidroPadrao[]>; descricaoDo: ReadonlyMap<string, string> }
    /** a tabela não existe (a migração não aplicada): nenhum padrão — o agente pergunta, e o log diz por quê */
    | { ok: false; motivo: 'sem_migracao' | 'falhou'; detalhe: string }

// O cliente admin não tem os tipos destas tabelas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any
const semTabela = (codigo: string | undefined) => codigo === '42P01' || codigo === 'PGRST205'

/** A leitura, pelo `service_role` (a RLS da tabela é só de super admin): as linhas da conta, as famílias delas e as descrições dos códigos. */
export async function lerVidrosPadraoDaConta(tenantId: string): Promise<VidrosPadraoDaConta> {
    const [r, mps] = await Promise.all([
        db().from(TABELA_DO_VIDRO_PADRAO).select('materia_prima_id, abertura, tipo, tipologia, item_codigo').eq('tenant_id', tenantId),
        db().from('orcamentista_materia_prima').select('id, familia').eq('tenant_id', tenantId),
    ])
    if (r.error) return { ok: false, motivo: semTabela(r.error.code) ? 'sem_migracao' : 'falhou', detalhe: `${TABELA_DO_VIDRO_PADRAO}: ${r.error.code ?? r.error.message}` }
    if (mps.error) return { ok: false, motivo: 'falhou', detalhe: `orcamentista_materia_prima: ${mps.error.code ?? mps.error.message}` }
    const familiaDa = new Map(((mps.data ?? []) as Array<{ id: string; familia: string | null }>).map((m) => [String(m.id), m.familia]))
    const porFamilia = new Map<string, LinhaDoVidroPadrao[]>()
    for (const l of (r.data ?? []) as LinhaDoVidroPadrao[]) {
        const familia = familiaDa.get(String(l.materia_prima_id))
        if (!familia) continue // matéria-prima sem família: o padrão dela não tem tipologia a que servir
        porFamilia.set(familia, [...(porFamilia.get(familia) ?? []), l])
    }
    const codigos = [...new Set([...porFamilia.values()].flat().map((l) => l.item_codigo))]
    let descricaoDo = new Map<string, string>()
    if (codigos.length > 0) {
        try { descricaoDo = await descricoesNoPrincipal(tenantId, codigos) } catch (e) {
            return { ok: false, motivo: 'falhou', detalhe: `descricoes: ${e instanceof Error ? e.message : String(e)}` }
        }
    }
    return { ok: true, porFamilia, descricaoDo }
}

/** A descrição de cada código nas tabelas VIDRO que VALEM do fornecedor PRINCIPAL da categoria VIDRO; o código fora delas não entra (vira falta no custo). */
async function descricoesNoPrincipal(tenantId: string, codigos: readonly string[]): Promise<Map<string, string>> {
    const [principais, derivacao] = await Promise.all([principaisDaConta(tenantId), derivarTabelasDaConta(tenantId)])
    const principal = principais.principais.get('VIDRO')
    if (!principal) return new Map()
    const tabelas = derivacao.tabelas.filter((t) => t.fornecedorId === principal && t.categoria === 'VIDRO' && t.vale).map((t) => t.tabelaId)
    if (tabelas.length === 0) return new Map()
    const { data, error } = await db().from('orcamentista_tabela_item').select('codigo, descricao').in('tabela_id', tabelas).in('codigo', [...codigos])
    if (error) throw new Error(`orcamentista_tabela_item: ${error.code ?? error.message}`)
    const vistas = new Map<string, Set<string>>()
    for (const i of (data ?? []) as Array<{ codigo: string; descricao: string | null }>) {
        const d = (i.descricao ?? '').trim()
        if (d) vistas.set(i.codigo, new Set([...(vistas.get(i.codigo) ?? []), d]))
    }
    // a descrição só vale quando é UMA: o mesmo código com duas descrições no principal não escolhe nenhuma (o texto fica sendo o código)
    return new Map([...vistas].filter(([, ds]) => ds.size === 1).map(([c, ds]) => [c, [...ds][0]]))
}

/**
 * O vidro que o padrão põe na esquadria: o TEXTO (a descrição da tabela do principal, ou o próprio código quando ela não o tem) e o CÓDIGO
 * (o que o custo usa — `vidro_codigo`, que vence o texto). Null sem padrão: a esquadria fica sem vidro, e a conversa pergunta.
 */
export type VidroAplicado = { texto: string; codigo: string; padrao: VidroPadrao; noPrincipal: boolean }
export function vidroDoPadrao(conta: VidrosPadraoDaConta, c: { tipologia: string; familia: string; descricao: string | null; tipo: string | null; linha: string | null }): VidroAplicado | null {
    if (!conta.ok) return null
    const padrao = padraoDoVidro(conta.porFamilia.get(c.familia) ?? [], c)
    if (padrao === null) return null
    const descricao = conta.descricaoDo.get(padrao.codigo)
    return { texto: descricao ?? padrao.codigo, codigo: padrao.codigo, padrao, noPrincipal: descricao !== undefined }
}

/** A candidata da esquadria, como a lista do motor a traz: o código, a família, a descrição, o tipo e a linha. */
type CandidataDoPadrao = { tipologia: string; familia: string; descricao: string | null; tipo: string | null; linha: string | null }

/**
 * O padrão da ESQUADRIA: a tipologia dela entre as candidatas (na família dela, quando já resolvida). Se o código está em mais de uma família e
 * os padrões delas não dizem O MESMO vidro, não há padrão — a conversa pergunta, nunca a primeira família.
 */
export function vidroPadraoDaEsquadria(conta: VidrosPadraoDaConta, item: { tipologia: string | null; familia: string | null }, candidatas: readonly CandidataDoPadrao[]): VidroAplicado | null {
    if (item.tipologia === null) return null
    const delas = candidatas.filter((c) => c.tipologia === item.tipologia && (item.familia === null || c.familia === item.familia))
    if (delas.length === 0) return null
    const aplicados = delas.map((c) => vidroDoPadrao(conta, c))
    const [primeiro] = aplicados
    if (primeiro === null || aplicados.some((x) => x === null || x.codigo !== primeiro.codigo || x.texto !== primeiro.texto)) return null
    return primeiro
}

/**
 * O CÓDIGO que se grava em `orcamentista_levantamento_item.vidro_codigo` (a coluna da 20261112000006, que o custo usa e que vence o texto): o do
 * padrão, SÓ quando o vidro da esquadria é o texto que o padrão põe; qualquer outro vidro (o dito, o alterado) grava nulo — o código antigo nunca
 * fica pendurado num vidro que mudou.
 */
export function vidroCodigoDaEsquadria(conta: VidrosPadraoDaConta, item: { tipologia: string | null; familia: string | null; vidro: string | null }, candidatas: readonly CandidataDoPadrao[]): string | null {
    const aplicado = vidroPadraoDaEsquadria(conta, item, candidatas)
    return aplicado !== null && item.vidro === aplicado.texto ? aplicado.codigo : null
}

/** O vidro no CONSIDERADO da folha: "vidro VIN05, padrão da empresa para janela de correr" — só quando o vidro da esquadria é o do padrão. */
export function vidroNoConsiderado(conta: VidrosPadraoDaConta, item: { tipologia: string | null; familia: string | null; vidro: string | null }, candidatas: readonly CandidataDoPadrao[]): string | null {
    const aplicado = vidroPadraoDaEsquadria(conta, item, candidatas)
    if (aplicado === null || item.tipologia === null || item.vidro !== aplicado.texto) return null
    return `vidro ${aplicado.codigo}, ${origemNaFrase(aplicado.padrao, item.tipologia)}`
}
