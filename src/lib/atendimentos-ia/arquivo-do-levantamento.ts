/**
 * Atendimentos I.A. — o ARQUIVO DO LEVANTAMENTO na conversa (dono do produto, 06/11/2026): a folha A4 (`folha-do-levantamento.ts`) montada a
 * partir do que está GRAVADO, enviada ao vendedor no lugar da mensagem-resumo em texto. A confirmação ("sim") passa a ser sobre o arquivo.
 *
 * VOCABULÁRIO (dono do produto): o APANHADO é a COLETA; o LEVANTAMENTO é o ARQUIVO. Aqui nada se chama apanhado. (O código da pergunta em
 * aberto continua `CONFIRMAR_APANHADO`: é valor da CHECK de `orcamentista_pergunta_em_aberto.pergunta`, e trocá-lo seria migração.)
 *
 * De onde vem cada coisa da folha:
 *   - a empresa: `tenants.name`; o número, o cliente, os percentuais e o vendedor: as colunas de `orcamentista_levantamento` (20261106000002);
 *   - os itens: `orcamentista_levantamento_item` (as medidas, o vidro, a cor, as escolhas, os ambientes e a obs); a descrição e a linha da
 *     tipologia: a Detalhe do motor (os candidatos que a conversa já leu); as variáveis: a aba Variáveis da tipologia (a `definicao`);
 *   - a linha do item: "PERFIL / ACESSÓRIO:" com a cor do perfil e a do acessório ("padrão" quando não dita) e "VIDRO:" com o vidro como dito;
 *     o arremate e a guarnição — O QUE O CÁLCULO USA (a resposta do vendedor, ou o padrão do motor), por extenso e sem código de fornecedor
 *     (`arremateDaColeta`) — no RODAPÉ quando é igual em todos os itens; quando varia, na célula do item, rotulado "Acabamento:";
 *   - as pré-definições consideradas, no rodapé: o que é IGUAL em todos os itens (a cor do perfil, o arremate e guarnição), e a vedação como
 *     "padrão";
 *   - NENHUM código de fornecedor em lugar nenhum da folha (dono do produto, 26/10/2026, reafirmado em 07/11/2026): as opções do motor saem por
 *     `rotuloSemCodigo`;
 *   - nunca material, barra, peso, corte, nem valor em reais: o contrato da folha não tem campo para eles.
 *
 * Portão: `src/utils/__tests__/arquivo-do-levantamento.test.ts` e o bloco (42) de `atendimentos-ia-levantamento-por-nome.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { arremateDaColeta, rotuloSemCodigo } from '@/lib/atendimentos-ia/apanhado'
import { opcoesDaVariavel } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { variaveisSemPadrao } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { gerarFolhaDoLevantamento, type DadosDaFolha, type FolhaGerada, type FolhaRecusada, type ItemDaFolha, type VariavelDita } from '@/lib/atendimentos-ia/folha-do-levantamento'
import type { DefinicaoDaTipologia, ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { nomeCasa, type CondicoesDoLevantamento, type ModoDaComissao, type PerfilDoVendedor } from '@/lib/atendimentos-ia/dados-do-levantamento'

/** A pergunta que acompanha o arquivo: a confirmação é sobre ELE. */
export const CONFERE_O_ARQUIVO = 'Confere? Responda sim para eu fazer o levantamento com os preços, ou diga o que muda.'
export const textoDoEnvioDoArquivo = (numero: number, nome: string) => `Levantamento ${numero} “${nome}”: o arquivo está acima, para você conferir.\n\n${CONFERE_O_ARQUIVO}`

/** As colunas do levantamento que o arquivo lê (20261106000002). */
export const COLUNAS_DO_ARQUIVO = 'id, numero, nome, remetente_id, telefone, email, edificacao, endereco, obs_obra, data_entrega, comissao_percentual, comissao_modo, '
    + 'reserva_tecnica_percentual, reserva_tecnica_responsavel, lucro_projetado_percentual, vendedor_nome, vendedor_employee_id'

export type LevantamentoDoArquivo = CondicoesDoLevantamento & {
    id: string; numero: number; nome: string; remetente_id: string
    telefone: string | null; email: string | null; edificacao: string | null; endereco: string | null; obs_obra: string | null; data_entrega: string | null
    vendedor_nome: string | null; vendedor_employee_id: string | null
}

const numeroOuNulo = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function lerLevantamentoDoArquivo(tenantId: string, id: string): Promise<LevantamentoDoArquivo | null> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento').select(COLUNAS_DO_ARQUIVO).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (error) throw new Error(`orcamentista_levantamento: ${error.message}`)
    if (!data) return null
    const l = data as unknown as Record<string, unknown>
    const texto = (k: string) => (typeof l[k] === 'string' && (l[k] as string).trim() !== '' ? (l[k] as string) : null)
    const modo = l.comissao_modo === 'PROPORCIONAL' || l.comissao_modo === 'CONGELADA' ? (l.comissao_modo as ModoDaComissao) : null
    return {
        id: String(l.id), numero: Number(l.numero), nome: String(l.nome), remetente_id: String(l.remetente_id),
        telefone: texto('telefone'), email: texto('email'), edificacao: texto('edificacao'), endereco: texto('endereco'), obs_obra: texto('obs_obra'),
        data_entrega: texto('data_entrega'),
        comissao_percentual: numeroOuNulo(l.comissao_percentual), comissao_modo: modo, reserva_tecnica_percentual: numeroOuNulo(l.reserva_tecnica_percentual),
        reserva_tecnica_responsavel: texto('reserva_tecnica_responsavel'), lucro_projetado_percentual: numeroOuNulo(l.lucro_projetado_percentual),
        vendedor_nome: texto('vendedor_nome'), vendedor_employee_id: texto('vendedor_employee_id'),
    }
}

export async function lerNomeDaEmpresa(tenantId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin.from('tenants').select('name').eq('id', tenantId).maybeSingle()
    if (error) throw new Error(`tenants: ${error.message}`)
    const nome = (data as { name?: unknown } | null)?.name
    return typeof nome === 'string' && nome.trim() ? nome.trim() : null
}

/** O vendedor PADRÃO: o funcionário do remetente (remetente_autorizado.employee_id); sem ele, o nome do remetente, sem vínculo. */
export async function lerVendedorDoRemetente(tenantId: string, remetenteId: string): Promise<{ employeeId: string | null; nome: string | null }> {
    const { data, error } = await supabaseAdmin.from('orcamentista_remetente_autorizado').select('nome, employee_id').eq('tenant_id', tenantId).eq('id', remetenteId).maybeSingle()
    if (error) throw new Error(`orcamentista_remetente_autorizado: ${error.message}`)
    const r = (data ?? {}) as { nome?: string | null; employee_id?: string | null }
    if (r.employee_id) {
        const { data: e, error: erro } = await supabaseAdmin.from('employees').select('id, name, is_active').eq('tenant_id', tenantId).eq('id', r.employee_id).maybeSingle()
        if (erro) throw new Error(`employees: ${erro.message}`)
        const lido = e as { name?: string | null; is_active?: boolean | null } | null
        // o funcionário INATIVO não é o vendedor padrão de um levantamento novo (dono do produto, 06/11/2026): sem padrão, a conversa pede o vendedor —
        // e o nome do remetente não entra no lugar, porque é a mesma pessoa
        if (lido && lido.is_active !== true) return { employeeId: null, nome: null }
        const nome = lido?.name?.trim() || r.nome?.trim() || null
        if (lido) return { employeeId: r.employee_id, nome }
    }
    return { employeeId: null, nome: r.nome?.trim() || null }
}

/** Um funcionário da empresa, com o que o distingue de um homônimo: o nome completo e a data do cadastro (nunca o cargo, que é dado sujo). */
export type Funcionario = { id: string; nome: string; ativo: boolean; cadastradoEm: string }

/**
 * Os funcionários da EMPRESA cujo nome CASA com o dito (toda palavra dita está no nome, sem caixa e sem acento — `nomeCasa`), do cadastrado primeiro
 * ao último: a ordem da lista que a conversa numera. Volta os ATIVOS e os INATIVOS separados: só os ativos podem ser escolhidos (`is_active = true`;
 * `status` não serve, é ACTIVE em todos — medido em 06/11/2026), e os inativos só servem para a frase que diz por que não. A conversa nunca escolhe
 * entre dois.
 */
export async function funcionariosPeloNome(tenantId: string, nome: string, normalizar: (t: string) => string): Promise<{ ativos: Funcionario[]; inativos: Funcionario[] }> {
    const { data, error } = await supabaseAdmin.from('employees').select('id, name, is_active, created_at').eq('tenant_id', tenantId)
    if (error) throw new Error(`employees: ${error.message}`)
    const achados = ((data ?? []) as Array<{ id: string; name: string | null; is_active: boolean | null; created_at: string | null }>)
        .filter((e) => e.name && nomeCasa(nome, e.name, normalizar))
        // ativo é is_active = true; o nulo não é ativo (ausente não é verdadeiro)
        .map((e) => ({ id: e.id, nome: (e.name as string).trim(), ativo: e.is_active === true, cadastradoEm: String(e.created_at ?? '') }))
        .sort((x, y) => (x.cadastradoEm < y.cadastradoEm ? -1 : x.cadastradoEm > y.cadastradoEm ? 1 : x.id.localeCompare(y.id)))
    return { ativos: achados.filter((f) => f.ativo), inativos: achados.filter((f) => !f.ativo) }
}

/** O cadastro do vendedor (o padrão dos percentuais). Sem funcionário, sem cadastro. */
export async function lerPerfilDoVendedor(tenantId: string, employeeId: string | null): Promise<PerfilDoVendedor | null> {
    if (!employeeId) return null
    const { data, error } = await supabaseAdmin.from('orcamentista_vendedor_perfil')
        .select('comissao_percentual, comissao_modo, reserva_tecnica_percentual, lucro_projetado_percentual').eq('tenant_id', tenantId).eq('employee_id', employeeId).maybeSingle()
    if (error) throw new Error(`orcamentista_vendedor_perfil: ${error.message}`)
    if (!data) return null
    const p = data as Record<string, unknown>
    const modo = p.comissao_modo === 'PROPORCIONAL' || p.comissao_modo === 'CONGELADA' ? (p.comissao_modo as ModoDaComissao) : null
    return { comissao_percentual: numeroOuNulo(p.comissao_percentual), comissao_modo: modo, reserva_tecnica_percentual: numeroOuNulo(p.reserva_tecnica_percentual), lucro_projetado_percentual: numeroOuNulo(p.lucro_projetado_percentual) }
}


// ── A MONTAGEM DA FOLHA (pura) ────────────────────────────────────────────────────────────────
export type DetalheDaTipologia = (tipologia: string, familia: string | null) => { descricao: string | null; linha: string | null } | null

/** As variáveis ditas do item: as escolhas inteiras > 0 que a aba Variáveis da tipologia conhece, com a descrição e se é sem padrão. */
export function variaveisDitas(item: Pick<ItemDoLevantamento, 'escolhas' | 'tipologia' | 'familia'>, definicao: DefinicaoDaTipologia): VariavelDita[] {
    const def = definicao(item)
    if (!def || !item.escolhas) return []
    const sem = new Set(variaveisSemPadrao(def).map((v) => v.variavel))
    return Object.entries(item.escolhas).flatMap(([codigo, valor]) => {
        if (typeof valor !== 'number' || !Number.isInteger(valor) || valor <= 0) return []
        const v = def.variaveis.find((x) => x.variavel === codigo)
        return v ? [{ variavel: codigo, descricao: (v.descricao ?? codigo).trim() || codigo, valor, semPadrao: sem.has(codigo) }] : []
    })
}

const unico = <T>(xs: readonly T[]): T | null => (new Set(xs).size === 1 ? xs[0] : null)
const forma = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()

/**
 * A COR DO ACESSÓRIO do item: a opção que o vendedor DISSE para a variável da aba cuja descrição é "COR DOS ACESSÓRIOS" (pela descrição, nunca
 * pela sigla), por extenso; não dita, "padrão" — segue o padrão da casa (dono do produto, 06/11/2026: "Branco / padrão").
 */
export function corDoAcessorio(item: Pick<ItemDoLevantamento, 'escolhas' | 'tipologia' | 'familia'>, definicao: DefinicaoDaTipologia): string {
    const def = definicao(item)
    const v = def?.variaveis.find((x) => forma(x.descricao ?? '').startsWith('COR DOS ACESSORIOS'))
    const dita = v && item.escolhas ? item.escolhas[v.variavel] : undefined
    if (!v || typeof dita !== 'number') return 'padrão'
    const opcao = (opcoesDaVariavel(v.opcoes) ?? []).find((o) => o.valor === dita)
    return opcao ? rotuloSemCodigo(opcao.rotulo, v.descricao ?? '') : 'padrão'
}

/**
 * A célula "PERFIL / ACESSÓRIO:" do item: "<cor do perfil> / <cor do acessório>". O arremate e a guarnição NÃO entram quando são comuns à obra
 * (saem no rodapé). Quando VARIAM entre os itens (dono do produto, 07/11/2026), aparecem aqui, ROTULADOS e separados das cores por " · " —
 * "Branco / padrão · Acabamento: arremate interno: 20 mm; …" —, para não se lerem como atributo do perfil.
 */
export const ROTULO_DO_ACABAMENTO = 'Acabamento:'
function perfilEAcessorio(cor: string | null, acessorio: string, arremateQueVaria: string | null): string {
    return `${cor ?? ''} / ${acessorio}${arremateQueVaria !== null ? ` · ${ROTULO_DO_ACABAMENTO} ${arremateQueVaria}` : ''}`
}

export function montarDadosDaFolha(a: {
    empresa: string; levantamento: LevantamentoDoArquivo; itens: readonly ItemDoLevantamento[]; definicao: DefinicaoDaTipologia; detalhe: DetalheDaTipologia; geradoEm: Date
}): DadosDaFolha {
    const ordenados = [...a.itens].sort((x, y) => x.ordem - y.ordem)
    const arremates = ordenados.map((i) => arremateDaColeta(a.definicao(i), i.escolhas))
    const arremateComum = unico(arremates)
    const itens: ItemDaFolha[] = ordenados.map((i, k) => {
        const d = i.tipologia ? a.detalhe(i.tipologia, i.familia) : null
        // a cor como está gravada (a da lista da base, 05/11/2026): o arquivo não a reescreve
        const cor = i.cor_perfil
        return {
            ordem: i.ordem, tipologia: i.tipologia ?? '', descricao: d?.descricao ?? i.tipologia ?? '', linha: d?.linha ?? null,
            quantidade: i.quantidade ?? 0, largura_mm: i.largura_mm ?? 0, altura_mm: i.altura_mm ?? 0,
            variaveis: variaveisDitas(i, a.definicao),
            // igual em todos (ou nenhum tem arremate): nada aqui; o rodapé o diz uma vez
            perfilEAcessorio: perfilEAcessorio(cor, corDoAcessorio(i, a.definicao), arremateComum === null ? arremates[k] : null),
            // o vidro COMO O VENDEDOR DISSE (04/11/2026: copiado, nunca completado), sem rótulo: o rótulo é o da célula ("VIDRO:")
            vidro: i.vidro,
            ambientes: i.ambientes && i.ambientes.length ? i.ambientes : null,
            obs: i.obs ?? null,
        }
    })
    // as pré-definições consideradas, no RODAPÉ: o que é igual em todos os itens e foi informado; a vedação sai como "padrão"
    const preDefinicoes: Array<{ rotulo: string; valor: string }> = []
    const cor = unico(ordenados.map((i) => i.cor_perfil ?? ''))
    if (cor) preDefinicoes.push({ rotulo: 'Cor do perfil', valor: cor })
    if (arremateComum) preDefinicoes.push({ rotulo: 'Arremate e guarnição', valor: arremateComum })
    preDefinicoes.push({ rotulo: 'Vedação', valor: 'padrão' })
    const l = a.levantamento
    return {
        empresa: a.empresa, numero: l.numero,
        cliente: { nome: l.nome, telefone: l.telefone, email: l.email, edificacao: l.edificacao, endereco: l.endereco, obsObra: l.obs_obra, dataEntrega: l.data_entrega },
        itens, preDefinicoes,
        condicoes: {
            vendedor: l.vendedor_nome, comissaoPercentual: l.comissao_percentual, comissaoModo: l.comissao_modo,
            rtResponsavel: l.reserva_tecnica_responsavel, rtPercentual: l.reserva_tecnica_percentual, lucroPercentual: l.lucro_projetado_percentual,
        },
        geradoEm: a.geradoEm,
    }
}

/**
 * O RESUMO da folha, determinístico: a mesma folha dá o mesmo texto, e é por ele que a conversa sabe que uma mensagem não mudou nada (R2).
 * Traz as condições comerciais (o percentual mudado é mudança) — por isso NÃO vai ao modelo: ao prompt vai `resumoDoArquivoParaOPrompt`.
 */
export function resumoDoArquivo(d: DadosDaFolha): string {
    const k = d.condicoes
    return [
        resumoDoArquivoParaOPrompt(d),
        `Vendedor: ${k.vendedor ?? '-'}; comissão ${k.comissaoPercentual ?? '-'}% (${k.comissaoModo ?? '-'}); RT ${k.rtPercentual ?? '-'}% (responsável: ${k.rtResponsavel ?? '-'}); lucro projetado ${k.lucroPercentual ?? '-'}%.`,
    ].join('\n')
}

/**
 * O que vai ao PROMPT como a pergunta em aberto, no lugar do arquivo (o modelo não lê PDF): o que a folha mostra, item por item — SEM as
 * condições comerciais: o prompt base proíbe o agente de dizer valor e percentual, e o que ele não recebe ele não repete.
 */
export function resumoDoArquivoParaOPrompt(d: DadosDaFolha): string {
    const c = d.cliente
    const cliente = [c.telefone && `telefone ${c.telefone}`, c.email && `e-mail ${c.email}`, c.edificacao && `edificação ${c.edificacao}`, c.endereco && `endereço ${c.endereco}`,
        c.obsObra && `obs da obra ${c.obsObra}`, c.dataEntrega && `entrega ${c.dataEntrega}`].filter(Boolean).join('; ')
    return [
        `Enviei ao vendedor o ARQUIVO do Levantamento ${d.numero} “${c.nome}”${cliente ? ` (${cliente})` : ''}, e ele está conferindo:`,
        ...d.itens.map((i) => `Item ${i.ordem}: ${i.tipologia}, ${i.quantidade} unidade(s), ${i.largura_mm} x ${i.altura_mm} mm; perfil / acessório ${i.perfilEAcessorio ?? ''}; vidro ${i.vidro ?? ''}`
            + `${i.variaveis.filter((v) => v.semPadrao).map((v) => `; ${v.descricao.toLocaleLowerCase('pt-BR')} ${v.valor}`).join('')}`
            + `${i.ambientes ? `; ambientes: ${i.ambientes.map((x) => `${x.ambiente} ${x.quantidade}`).join(', ')}` : ''}${i.obs ? `; obs: ${i.obs}` : ''}.`),
        // o que é comum à obra (a cor, o arremate e a guarnição) mora nas pré-definições: sem esta linha, trocar o arremate não mudaria o resumo,
        // e o arquivo novo não sairia (R2)
        `Pré-definições: ${d.preDefinicoes.map((p) => `${p.rotulo}: ${p.valor}`).join('; ')}.`,
        `Vendedor: ${d.condicoes.vendedor ?? '-'}.`,
        CONFERE_O_ARQUIVO,
    ].join('\n')
}

/** A folha do levantamento GRAVADO: lê o levantamento, a empresa e os itens, e gera. A recusa nomeada volta como está. */
/** O levantamento que não se lê na empresa: a mesma frase para a conversa e para a rota do arquivo (que a responde com 404). */
export const FRASE_DO_LEVANTAMENTO_NAO_ACHADO = 'O levantamento não foi achado.'
export async function gerarArquivoDoLevantamento(a: {
    tenantId: string; levantamentoId: string; itens: readonly ItemDoLevantamento[]; definicao: DefinicaoDaTipologia; detalhe: DetalheDaTipologia; geradoEm?: Date
}): Promise<{ dados: DadosDaFolha | null; folha: FolhaGerada | FolhaRecusada }> {
    const [levantamento, empresa] = await Promise.all([lerLevantamentoDoArquivo(a.tenantId, a.levantamentoId), lerNomeDaEmpresa(a.tenantId)])
    if (!levantamento) return { dados: null, folha: { ok: false, recusas: [FRASE_DO_LEVANTAMENTO_NAO_ACHADO] } }
    const dados = montarDadosDaFolha({ empresa: empresa ?? '', levantamento, itens: a.itens, definicao: a.definicao, detalhe: a.detalhe, geradoEm: a.geradoEm ?? new Date() })
    return { dados, folha: gerarFolhaDoLevantamento(dados) }
}
