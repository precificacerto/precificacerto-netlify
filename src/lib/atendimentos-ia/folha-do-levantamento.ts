/**
 * Atendimentos I.A. — a FOLHA DO LEVANTAMENTO: o ARQUIVO (A4, PDF) que o agente envia ao vendedor para conferir e confirmar. Isolado e testável
 * sem o WhatsApp: recebe os dados já lidos (`DadosDaFolha`) e devolve o PDF, ou as RECUSAS nomeadas. Não lê banco nem rede.
 *
 * VOCABULÁRIO (dono do produto, 06/11/2026): o APANHADO é a COLETA (as perguntas e respostas da conversa); o LEVANTAMENTO é este ARQUIVO.
 *
 * ══ A ESPECIFICAÇÃO NORMATIVA (dono do produto, 06/11/2026) ══
 *   - A4 retrato sempre. CABEÇALHO repetido em toda folha: título, nome da empresa (tenants.name), data, hora, "Página X de Y" e o número do
 *     levantamento à direita. DADOS DO CLIENTE só na primeira folha, em quatro linhas: nome | telefone; e-mail | edificação; endereço na linha
 *     inteira; obs da obra | data de entrega.
 *   - COLUNAS: Fig. | Item e tipologia | Qtde | Larg. | Alt. O "mm" vai no RÓTULO da coluna, em corpo miúdo, nunca ao lado de cada valor. Qtde,
 *     largura e altura centradas na célula nos dois eixos.
 *   - FAIXA DO ITEM: o desenho da tipologia na PROPORÇÃO REAL de largura × altura, o código, o nome da tipologia e a linha. Toda célula de item tem a
 *     MESMA altura (`ALTURA_DA_FAIXA`), qualquer que seja a tipologia.
 *   - LINHAS POR ITEM, nesta ordem: VARIÁVEIS (só com variável sem padrão respondida: "descrição + valor", separados por " · "); PERFIL /
 *     ACESSÓRIO + VIDRO (uma linha, duas células: o respiro sob a figura fica fora da divisão, e o que resta é 50% para cada); AMBIENTES; OBS.
 *   - NUNCA ENTRAM: perfil como material, acessório, barra, peso, corte, nem valor em reais de espécie alguma. A folha não recebe nenhum desses
 *     dados (o contrato `DadosDaFolha` não tem campo para eles), e a conferência recusa texto com símbolo de dinheiro (`SIMBOLO_DE_DINHEIRO`).
 *   - FECHO: pré-definições consideradas (só o que foi informado, corpo reduzido, sem negrito); condições comerciais — vendedor + comissão % + modo
 *     numa linha (modo encostado à direita), e RT + responsável + % e lucro projetado da proposta + %, metade da linha cada, com o percentual num
 *     campo curto na borda direita da sua metade; conferido e confirmado por | data e hora. RODAPÉ: "Levantamento N · X itens · Y peças · gerado em
 *     dd/mm/aaaa às hh:mm" (o fuso é o de São Paulo).
 *   - O arquivo TRAZ comissão %, RT % e lucro projetado % (decisão do dono do produto de 06/11/2026, revoga a de 22/10). Uma versão só, sem parâmetro.
 *   - Antes de produzir, o gerador confere: a soma das quantidades dos ambientes fecha com a quantidade do item. Não fechando, RECUSA NOMEADA.
 *   - PAGINAÇÃO: a folha enche antes de virar; o fecho sai inteiro na última folha e não se parte; um item nunca começa numa folha e termina na outra
 *     (`paginar`, função pura).
 *
 * ══ O DESENHO (dono do produto, 06/11/2026) ══ — `desenhoDaTipologia`, função pura:
 *   - o contorno na proporção real, dividido pelas FOLHAS que a DESCRIÇÃO do motor diz ("02 FOLHAS MÓVEIS" → 2 colunas);
 *   - nas MAXIM-AR / FIXO COM "N" MÓDULOS HORIZONTAIS (e "V" VERTICAIS), o número de divisões vem da variável RESPONDIDA pelo vendedor cujo código é
 *     a letra entre aspas da descrição ("N" → a variável N). O número fixo da descrição ("01 MÓDULO VERTICAL", "03 MÓDULOS VERTICAIS") vale como está.
 *     Medido nas fórmulas do motor da Wolff (06/11/2026): a coluna de modulação da DP-128 corre na ALTURA (eixo Altura, `H`) com quantidade `N-1` —
 *     os módulos horizontais ficam LADO A LADO (divisões verticais), como as folhas; os verticais, um sobre o outro;
 *   - a faixa da BANDEIRA (em cima) e a do PEITORIL (embaixo) são desenhadas NA ALTURA DITA: a descrição diz QUE existe ("BANDEIRA", "PEITORIL"); a
 *     variável respondida cuja descrição da aba diz "BANDEIRA" ou "PEITORIL" diz QUANTO (AF, B, AB = bandeira; AF, P, AP = peitoril — a mesma sigla
 *     muda de sentido por tipologia, por isso a leitura é pela descrição, nunca pela sigla);
 *   - NADA INVENTADO: sem folhas nem módulos na descrição, e sem variável respondida que os dê, só o contorno. Nunca um número de divisões chutado,
 *     nunca uma faixa de altura arbitrária. Bandeira e peitoril que não cabem na altura do item são recusa nomeada.
 *
 * Portão: `src/utils/__tests__/folha-do-levantamento.test.ts`.
 */
import { jsPDF } from 'jspdf'
import { variavelEhMedida } from '@/lib/atendimentos-ia/escolhas-da-tipologia'

// ── O CONTRATO ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type AmbienteDaFolha = { ambiente: string; quantidade: number }

/** Uma variável com o valor DITO pelo vendedor. `semPadrao` diz se ela entra na linha VARIÁVEIS (só as sem padrão da aba Variáveis entram). */
export type VariavelDita = { variavel: string; descricao: string; valor: number; semPadrao: boolean }

export type ItemDaFolha = {
    ordem: number
    tipologia: string
    /** A descrição da tipologia no motor (aba Detalhe). É dela que saem as folhas, os módulos, a bandeira e o peitoril do desenho. */
    descricao: string
    /** A linha da tipologia no motor. Nula quando o motor não a traz: a folha não a escreve. */
    linha: string | null
    quantidade: number
    largura_mm: number
    altura_mm: number
    variaveis: readonly VariavelDita[]
    /** O texto da célula PERFIL (a cor do perfil e o arremate, por extenso). Nulo = a célula sai em branco. */
    perfil: string | null
    /** O texto da célula ACESSÓRIO + VIDRO. Nulo = a célula sai em branco. */
    acessorioEVidro: string | null
    /** Nulo = não informados: a linha AMBIENTES sai em branco (nunca um ambiente padrão). */
    ambientes: readonly AmbienteDaFolha[] | null
    obs: string | null
}

export type ModoDaComissao = 'PROPORCIONAL' | 'CONGELADA'

export type DadosDaFolha = {
    /** tenants.name da empresa do levantamento. */
    empresa: string
    /** O "Levantamento N", sequencial por empresa (`orcamentista_levantamento.numero`). */
    numero: number
    cliente: {
        /** O nome do levantamento, que é o nome do cliente. */
        nome: string
        telefone: string | null
        email: string | null
        edificacao: string | null
        endereco: string | null
        obsObra: string | null
        /** 'AAAA-MM-DD' (a coluna é `date`); a folha mostra dd/mm/aa. Nula = não informada. */
        dataEntrega: string | null
    }
    itens: readonly ItemDaFolha[]
    /** O que foi informado e vale para o levantamento ("Cor do perfil: Branco"). Só o informado; a vedação sai como "padrão". */
    preDefinicoes: ReadonlyArray<{ rotulo: string; valor: string }>
    condicoes: {
        vendedor: string | null
        comissaoPercentual: number | null
        comissaoModo: ModoDaComissao | null
        /** Quem recebe a reserva técnica. Nulo = o campo sai EM BRANCO, e isso não trava o levantamento (decisão do dono do produto, 06/11/2026). */
        rtResponsavel: string | null
        rtPercentual: number | null
        lucroPercentual: number | null
    }
    /** O instante da geração: o cabeçalho e o rodapé o mostram no fuso de São Paulo. */
    geradoEm: Date
}

export type FolhaGerada = { ok: true; pdf: Uint8Array; paginas: number; nomeDoArquivo: string }
export type FolhaRecusada = { ok: false; recusas: string[] }

// ── O DESENHO ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type DesenhoDaTipologia = {
    largura_mm: number
    altura_mm: number
    /** Divisões lado a lado (folhas ou módulos horizontais). Nulo = a descrição não diz, ou a variável que diria não foi respondida. */
    colunas: number | null
    /** Divisões uma sobre a outra (módulos verticais). Nulo = idem. */
    linhas: number | null
    /** A altura da faixa da bandeira, em cima. Nula = sem bandeira na descrição, ou sem a altura dita. */
    bandeira_mm: number | null
    /** A altura da faixa do peitoril, embaixo. */
    peitoril_mm: number | null
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
const forma = (t: string) => semAcento(t).toUpperCase()

const FOLHAS = /\b(\d+)\s+FOLHAS?\b/
const MODULOS_HORIZONTAIS = /(?:\b(\d+)|"([A-Z]+)")\s+MODULOS?\s+(?:HORIZONTA(?:L|IS)|HZ)\b/
const MODULOS_VERTICAIS = /(?:\b(\d+)|"([A-Z]+)")\s+MODULOS?\s+(?:VERTICA(?:L|IS)|VT)\b/

/** O valor dito de uma variável pelo código, inteiro maior que zero; senão nulo. */
function valorDito(variaveis: readonly VariavelDita[], codigo: string): number | null {
    const v = variaveis.find((x) => x.variavel === codigo)
    return v && Number.isInteger(v.valor) && v.valor > 0 ? v.valor : null
}

/** O número de divisões que a descrição dá num eixo: o fixo ("03 MÓDULOS") ou o da variável entre aspas ("N"), se respondida. */
function divisoesDoEixo(descricao: string, padrao: RegExp, variaveis: readonly VariavelDita[]): number | null {
    const m = padrao.exec(descricao)
    if (!m) return null
    if (m[1] !== undefined) return Number(m[1]) > 0 ? Number(m[1]) : null
    return valorDito(variaveis, m[2])
}

/** A altura da faixa: só com a descrição dizendo que ela existe E a variável cuja descrição a nomeia, respondida. */
function alturaDaFaixa(descricao: string, palavra: 'BANDEIRA' | 'PEITORIL', variaveis: readonly VariavelDita[]): number | null {
    if (!new RegExp(`\\b${palavra}\\b`).test(descricao)) return null
    const v = variaveis.find((x) => new RegExp(`\\b${palavra}\\b`).test(forma(x.descricao)) && Number.isInteger(x.valor) && x.valor > 0)
    return v ? v.valor : null
}

export function desenhoDaTipologia(
    item: Pick<ItemDaFolha, 'descricao' | 'largura_mm' | 'altura_mm' | 'variaveis'>,
): DesenhoDaTipologia {
    const d = forma(item.descricao)
    const folhas = FOLHAS.exec(d)
    return {
        largura_mm: item.largura_mm,
        altura_mm: item.altura_mm,
        colunas: folhas ? Number(folhas[1]) : divisoesDoEixo(d, MODULOS_HORIZONTAIS, item.variaveis),
        linhas: divisoesDoEixo(d, MODULOS_VERTICAIS, item.variaveis),
        bandeira_mm: alturaDaFaixa(d, 'BANDEIRA', item.variaveis),
        peitoril_mm: alturaDaFaixa(d, 'PEITORIL', item.variaveis),
    }
}

/** Os traços do desenho dentro de uma caixa: o contorno na proporção real, centrado, e as divisões. Função pura (mm da folha). */
export type TracosDoDesenho = {
    contorno: { x: number; y: number; w: number; h: number }
    /** Segmentos [x1, y1, x2, y2]. */
    divisoes: Array<[number, number, number, number]>
}

export function tracosDoDesenho(desenho: DesenhoDaTipologia, caixa: { x: number; y: number; w: number; h: number }): TracosDoDesenho {
    const escala = Math.min(caixa.w / desenho.largura_mm, caixa.h / desenho.altura_mm)
    const w = desenho.largura_mm * escala
    const h = desenho.altura_mm * escala
    const x = caixa.x + (caixa.w - w) / 2
    const y = caixa.y + (caixa.h - h) / 2
    const divisoes: Array<[number, number, number, number]> = []
    const topo = y + (desenho.bandeira_mm ?? 0) * escala
    const base = y + h - (desenho.peitoril_mm ?? 0) * escala
    if (desenho.bandeira_mm) divisoes.push([x, topo, x + w, topo])
    if (desenho.peitoril_mm) divisoes.push([x, base, x + w, base])
    const colunas = desenho.colunas ?? 1
    for (let i = 1; i < colunas; i++) divisoes.push([x + (w * i) / colunas, topo, x + (w * i) / colunas, base])
    const linhas = desenho.linhas ?? 1
    for (let i = 1; i < linhas; i++) divisoes.push([x, topo + ((base - topo) * i) / linhas, x + w, topo + ((base - topo) * i) / linhas])
    return { contorno: { x, y, w, h }, divisoes }
}

// ── A CONFERÊNCIA (antes de produzir) ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Só o SÍMBOLO de dinheiro: a palavra ("real", "mil") recusaria o endereço "Av. Real" e o ambiente "Sala dos mil". */
export const SIMBOLO_DE_DINHEIRO = /R\s*\$/i

const inteiroPositivo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0
const percentualValido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100
const milhar = (n: number) => new Intl.NumberFormat('pt-BR').format(n)
const nomeDoItem = (i: Pick<ItemDaFolha, 'ordem' | 'tipologia'>) => `Item ${i.ordem} (${i.tipologia})`

/** Os textos que a folha escreve, com o lugar de cada um, para a conferência do dinheiro dizer onde está. */
function textosDaFolha(d: DadosDaFolha): Array<[string, string | null]> {
    const c = d.cliente
    const textos: Array<[string, string | null]> = [
        ['a empresa', d.empresa], ['o nome do cliente', c.nome], ['o telefone', c.telefone], ['o e-mail', c.email], ['a edificação', c.edificacao],
        ['o endereço', c.endereco], ['a obs da obra', c.obsObra], ['o vendedor', d.condicoes.vendedor], ['o responsável pela RT', d.condicoes.rtResponsavel],
        ...d.preDefinicoes.flatMap((p): Array<[string, string]> => [[`a pré-definição "${p.rotulo}"`, p.rotulo], [`a pré-definição "${p.rotulo}"`, p.valor]]),
    ]
    for (const i of d.itens) {
        const n = nomeDoItem(i)
        textos.push([`${n}, a tipologia`, i.tipologia], [`${n}, a descrição`, i.descricao], [`${n}, a linha`, i.linha], [`${n}, o perfil`, i.perfil],
            [`${n}, o acessório e vidro`, i.acessorioEVidro], [`${n}, a obs`, i.obs], ...(i.ambientes ?? []).map((a): [string, string] => [`${n}, o ambiente`, a.ambiente]),
            ...i.variaveis.map((v): [string, string] => [`${n}, a variável`, v.descricao]))
    }
    return textos
}

/** Tudo o que impede a folha, nomeado — nunca um valor aproximado no lugar (`faltou-dado-recusa-nomeada.md`). */
export function conferirFolha(d: DadosDaFolha): string[] {
    const recusas: string[] = []
    if (!d.empresa?.trim()) recusas.push('Falta o nome da empresa.')
    if (!inteiroPositivo(d.numero)) recusas.push('Falta o número do levantamento.')
    if (!d.cliente.nome?.trim()) recusas.push('Falta o nome do cliente.')
    if (d.itens.length === 0) recusas.push('O levantamento não tem nenhum item.')
    if (!d.condicoes.vendedor?.trim()) recusas.push('Falta o vendedor do levantamento.')
    const faltam: string[] = []
    if (!percentualValido(d.condicoes.comissaoPercentual)) faltam.push('a comissão (%)')
    if (d.condicoes.comissaoModo !== 'PROPORCIONAL' && d.condicoes.comissaoModo !== 'CONGELADA') faltam.push('o modo da comissão')
    if (!percentualValido(d.condicoes.rtPercentual)) faltam.push('a reserva técnica (%)')
    if (!percentualValido(d.condicoes.lucroPercentual)) faltam.push('o lucro projetado (%)')
    if (faltam.length) recusas.push(`Faltam, nas condições comerciais: ${faltam.join(', ')}.`)
    if (d.cliente.dataEntrega !== null && dataCurta(d.cliente.dataEntrega) === null) recusas.push(`A data de entrega "${d.cliente.dataEntrega}" não é uma data.`)
    for (const i of d.itens) {
        const n = nomeDoItem(i)
        const campos: string[] = []
        if (!inteiroPositivo(i.quantidade)) campos.push('a quantidade')
        if (!inteiroPositivo(i.largura_mm)) campos.push('a largura')
        if (!inteiroPositivo(i.altura_mm)) campos.push('a altura')
        if (!i.tipologia?.trim()) campos.push('a tipologia')
        if (campos.length) { recusas.push(`${n}: falta ${campos.join(', ')}.`); continue }
        if (i.ambientes !== null) {
            if (i.ambientes.some((a) => !inteiroPositivo(a.quantidade) || !a.ambiente.trim())) {
                recusas.push(`${n}: todo ambiente precisa de nome e de quantidade inteira maior que zero.`)
            } else {
                const soma = i.ambientes.reduce((s, a) => s + a.quantidade, 0)
                if (soma !== i.quantidade) {
                    recusas.push(`${n}: a soma dos ambientes (${i.ambientes.map((a) => `${a.ambiente} ${a.quantidade}`).join(' · ')} = ${soma}) não fecha com a quantidade do item (${i.quantidade}). Corrija os ambientes ou a quantidade.`)
                }
            }
        }
        const desenho = desenhoDaTipologia(i)
        const faixas = (desenho.bandeira_mm ?? 0) + (desenho.peitoril_mm ?? 0)
        if (faixas >= i.altura_mm) {
            const quais = [desenho.bandeira_mm !== null ? `a bandeira (${milhar(desenho.bandeira_mm)} mm)` : null, desenho.peitoril_mm !== null ? `o peitoril (${milhar(desenho.peitoril_mm)} mm)` : null].filter(Boolean).join(' e ')
            recusas.push(`${n}: ${quais} não cabe${desenho.bandeira_mm !== null && desenho.peitoril_mm !== null ? 'm' : ''} na altura do item (${milhar(i.altura_mm)} mm).`)
        }
    }
    for (const [onde, texto] of textosDaFolha(d)) {
        if (texto && SIMBOLO_DE_DINHEIRO.test(texto)) recusas.push(`${onde} traz valor em dinheiro ("${texto}"), e o levantamento nunca traz valor em reais.`)
    }
    return recusas
}

// ── A PAGINAÇÃO (pura) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type AlturasDaFolha = {
    /** O espaço útil de uma folha, entre o cabeçalho e o rodapé. */
    util: number
    /** O bloco do cliente (só na primeira folha). */
    cliente: number
    /** O cabeçalho das colunas, repetido em toda folha que tem item. */
    cabecalhoDasColunas: number
    itens: readonly number[]
    fecho: number
}

export type PaginaDaFolha = { cliente: boolean; itens: number[]; fecho: boolean }

/**
 * A folha ENCHE antes de virar (cada item vai na folha corrente se cabe, com o cabeçalho das colunas quando é o primeiro dela); um item nunca é
 * partido (o que não cabe começa a folha seguinte); o FECHO sai inteiro na última folha — na corrente, se cabe, senão numa folha só dele. O que não
 * cabe numa folha vazia é recusa (nunca partido nem cortado).
 */
export function paginar(a: AlturasDaFolha): { paginas: PaginaDaFolha[] } | { recusa: string } {
    const paginas: PaginaDaFolha[] = [{ cliente: true, itens: [], fecho: false }]
    let livre = a.util - a.cliente
    if (livre < 0) return { recusa: 'Os dados do cliente não cabem numa folha.' }
    for (let i = 0; i < a.itens.length; i++) {
        const atual = paginas[paginas.length - 1]
        const precisa = a.itens[i] + (atual.itens.length === 0 ? a.cabecalhoDasColunas : 0)
        if (precisa <= livre) { atual.itens.push(i); livre -= precisa; continue }
        const sozinho = a.itens[i] + a.cabecalhoDasColunas
        if (sozinho > a.util) return { recusa: `O item ${i + 1} não cabe numa folha inteira.` }
        paginas.push({ cliente: false, itens: [i], fecho: false })
        livre = a.util - sozinho
    }
    if (a.fecho > a.util) return { recusa: 'O fecho não cabe numa folha inteira.' }
    if (a.fecho <= livre) paginas[paginas.length - 1].fecho = true
    else paginas.push({ cliente: false, itens: [], fecho: true })
    return { paginas }
}

// ── O FORMATO DOS VALORES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FUSO = 'America/Sao_Paulo'
export const dataLonga = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
export const hora = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)

/** 'AAAA-MM-DD' → 'dd/mm/aa' (a data de entrega, decisão do dono do produto, 06/11/2026); o que não é data é nulo. */
export function dataCurta(iso: string): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    if (!m) return null
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
    return `${m[3]}/${m[2]}/${m[1].slice(2)}`
}

export const percentual = (n: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)}%`
const MODO: Record<ModoDaComissao, string> = { PROPORCIONAL: 'proporcional', CONGELADA: 'congelada' }

/** "Altura da bandeira 400 mm": a descrição da aba com a primeira letra maiúscula, e "mm" só quando a variável é medida. */
export function variavelNaFolha(v: Pick<VariavelDita, 'descricao' | 'valor'>): string {
    const d = v.descricao.trim().toLocaleLowerCase('pt-BR')
    return `${d.charAt(0).toLocaleUpperCase('pt-BR')}${d.slice(1)} ${milhar(v.valor)}${variavelEhMedida(v.descricao) ? ' mm' : ''}`
}

/** A linha VARIÁVEIS: só as sem padrão respondidas, separadas por " · ". Nenhuma → nula (a linha não é desenhada). */
export function linhaDasVariaveis(i: Pick<ItemDaFolha, 'variaveis'>): string | null {
    const sem = i.variaveis.filter((v) => v.semPadrao)
    return sem.length ? sem.map(variavelNaFolha).join(' · ') : null
}

export const linhaDosAmbientes = (i: Pick<ItemDaFolha, 'ambientes'>) => (i.ambientes ?? []).map((a) => `${a.ambiente} (${a.quantidade})`).join(' · ')

export function rodape(d: Pick<DadosDaFolha, 'numero' | 'itens' | 'geradoEm'>): string {
    const pecas = d.itens.reduce((s, i) => s + i.quantidade, 0)
    return `Levantamento ${d.numero} · ${d.itens.length} ${d.itens.length === 1 ? 'item' : 'itens'} · ${pecas} ${pecas === 1 ? 'peça' : 'peças'} · gerado em ${dataLonga(d.geradoEm)} às ${hora(d.geradoEm)}`
}

/** O nome do arquivo: "Levantamento 6 - Maria Cristina.pdf", sem os caracteres que um sistema de arquivos recusa. */
export const nomeDoArquivo = (d: Pick<DadosDaFolha, 'numero' | 'cliente'>) =>
    `Levantamento ${d.numero} - ${d.cliente.nome.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()}.pdf`

// ── O DESENHO DA FOLHA (jsPDF) ────────────────────────────────────────────────────────────────────────────────────────────────────────
// As medidas, em mm. A4 retrato.
export const FOLHA = { largura: 210, altura: 297, margem: 10 } as const
const CONTEUDO = FOLHA.largura - 2 * FOLHA.margem
const ALTURA_DO_CABECALHO = 22
const ALTURA_DO_RODAPE = 10
const TOPO_DO_CORPO = FOLHA.margem + ALTURA_DO_CABECALHO
const FIM_DO_CORPO = FOLHA.altura - FOLHA.margem - ALTURA_DO_RODAPE
/** As colunas: Fig. | Item e tipologia | Qtde | Larg. | Alt. — somam a largura do conteúdo. */
export const COLUNAS = { fig: 34, item: 106, qtde: 16, larg: 17, alt: 17 } as const
/** A faixa do item: a MESMA altura em todo item, qualquer que seja a tipologia. */
export const ALTURA_DA_FAIXA = 30
const ALTURA_DO_CABECALHO_DAS_COLUNAS = 8
const ESPACO_ENTRE_ITENS = 2.5
const LINHA_DO_CLIENTE = 7
const CORPO = 8.5
const CORPO_REDUZIDO = 7.5
const ROTULO = 6.5
const ENTRELINHA = 0.42 // mm por ponto de corpo
const PRETO = 20
const CINZA = 110
const TRACO = 160

type Doc = jsPDF

const quebrar = (doc: Doc, texto: string, largura: number, corpo: number): string[] => {
    doc.setFontSize(corpo)
    return texto === '' ? [''] : (doc.splitTextToSize(texto, largura) as string[])
}

/** A altura de uma célula de texto com rótulo em cima: o rótulo, as linhas quebradas e o respiro. */
function alturaDaCelula(doc: Doc, texto: string, largura: number, corpo = CORPO): number {
    return 2 + ROTULO * ENTRELINHA + 0.8 + quebrar(doc, texto, largura - 3, corpo).length * corpo * ENTRELINHA + 1.6
}

const LARGURA_DAS_LINHAS = CONTEUDO - COLUNAS.fig

/** As linhas de um item, na ordem da especificação. A VARIÁVEIS só existe com variável sem padrão respondida. */
function linhasDoItem(i: ItemDaFolha): Array<{ tipo: 'uma'; rotulo: string; texto: string } | { tipo: 'duas'; esquerda: [string, string]; direita: [string, string] }> {
    const variaveis = linhaDasVariaveis(i)
    return [
        ...(variaveis !== null ? [{ tipo: 'uma' as const, rotulo: 'VARIÁVEIS', texto: variaveis }] : []),
        { tipo: 'duas' as const, esquerda: ['PERFIL', i.perfil ?? ''], direita: ['ACESSÓRIO + VIDRO', i.acessorioEVidro ?? ''] },
        { tipo: 'uma' as const, rotulo: 'AMBIENTES', texto: linhaDosAmbientes(i) },
        { tipo: 'uma' as const, rotulo: 'OBS', texto: i.obs ?? '' },
    ]
}

function alturaDaLinha(doc: Doc, l: ReturnType<typeof linhasDoItem>[number]): number {
    if (l.tipo === 'uma') return alturaDaCelula(doc, l.texto, LARGURA_DAS_LINHAS)
    return Math.max(alturaDaCelula(doc, l.esquerda[1], LARGURA_DAS_LINHAS / 2), alturaDaCelula(doc, l.direita[1], LARGURA_DAS_LINHAS / 2))
}

const alturaDoItem = (doc: Doc, i: ItemDaFolha) => ALTURA_DA_FAIXA + linhasDoItem(i).reduce((s, l) => s + alturaDaLinha(doc, l), 0) + ESPACO_ENTRE_ITENS

/** A altura de um campo do cliente (ou das condições): cresce com o texto — nada é cortado. */
const alturaDoCampo = (doc: Doc, texto: string | null, largura: number, minima = LINHA_DO_CLIENTE) =>
    Math.max(minima, 3.4 + quebrar(doc, texto ?? '', largura - 3, CORPO).length * CORPO * ENTRELINHA + 1.2)

type LinhaDoCliente = Array<{ nome: string; valor: string | null; w: number }>
function linhasDoCliente(d: DadosDaFolha): LinhaDoCliente[] {
    const c = d.cliente
    const metade = CONTEUDO / 2
    return [
        [{ nome: 'CLIENTE', valor: c.nome, w: metade }, { nome: 'TELEFONE', valor: c.telefone, w: metade }],
        [{ nome: 'E-MAIL', valor: c.email, w: metade }, { nome: 'EDIFICAÇÃO', valor: c.edificacao, w: metade }],
        [{ nome: 'ENDEREÇO', valor: c.endereco, w: CONTEUDO }],
        [{ nome: 'OBS DA OBRA', valor: c.obsObra, w: metade }, { nome: 'DATA DE ENTREGA', valor: c.dataEntrega ? dataCurta(c.dataEntrega) : null, w: metade }],
    ]
}
const alturaDaLinhaDoCliente = (doc: Doc, l: LinhaDoCliente) => Math.max(...l.map((c) => alturaDoCampo(doc, c.valor, c.w)))
const alturaDoCliente = (doc: Doc, d: DadosDaFolha) => linhasDoCliente(d).reduce((s, l) => s + alturaDaLinhaDoCliente(doc, l), 0) + 4

function textoDasPreDefinicoes(d: DadosDaFolha): string {
    return d.preDefinicoes.map((p) => `${p.rotulo}: ${p.valor}`).join(' · ')
}

const LINHA_DAS_CONDICOES = 9
const CAMPO_DO_PERCENTUAL = 18
const ROTULO_DA_RT = 'RT · responsável:'

/** As alturas do fecho, uma função só para medir e para desenhar. */
function partesDoFecho(doc: Doc, d: DadosDaFolha) {
    const pre = d.preDefinicoes.length ? quebrar(doc, textoDasPreDefinicoes(d), CONTEUDO - 3, CORPO_REDUZIDO) : []
    const alturaDasPre = pre.length ? 4 + pre.length * CORPO_REDUZIDO * ENTRELINHA + 2 : 0
    doc.setFont('helvetica', 'bold'); doc.setFontSize(CORPO)
    const larguraDoRotuloDaRt = doc.getTextWidth(ROTULO_DA_RT)
    doc.setFont('helvetica', 'normal')
    const espacoDoResponsavel = CONTEUDO / 2 - CAMPO_DO_PERCENTUAL - larguraDoRotuloDaRt - 4
    const responsavel = quebrar(doc, d.condicoes.rtResponsavel ?? '', espacoDoResponsavel, CORPO_REDUZIDO)
    const alturaDaRt = Math.max(LINHA_DAS_CONDICOES, 3 + responsavel.length * CORPO_REDUZIDO * ENTRELINHA + 2)
    const total = 3 + alturaDasPre + 4.5 + LINHA_DAS_CONDICOES + alturaDaRt + 2 + LINHA_DAS_CONDICOES
    return { pre, alturaDasPre, responsavel, alturaDaRt, total }
}
const alturaDoFecho = (doc: Doc, d: DadosDaFolha) => partesDoFecho(doc, d).total

function rotulo(doc: Doc, texto: string, x: number, y: number) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(ROTULO); doc.setTextColor(CINZA)
    doc.text(texto, x, y)
    doc.setTextColor(PRETO)
}

function celulaComRotulo(doc: Doc, x: number, y: number, w: number, h: number, nome: string, texto: string, corpo = CORPO) {
    doc.setDrawColor(TRACO); doc.rect(x, y, w, h)
    rotulo(doc, nome, x + 1.5, y + 2 + ROTULO * ENTRELINHA * 0.8)
    doc.setFont('helvetica', 'normal')
    const linhas = quebrar(doc, texto, w - 3, corpo)
    doc.setFontSize(corpo)
    linhas.forEach((l, k) => doc.text(l, x + 1.5, y + 2 + ROTULO * ENTRELINHA + 0.8 + (k + 0.8) * corpo * ENTRELINHA))
}

function cabecalho(doc: Doc, d: DadosDaFolha, pagina: number, total: number) {
    const y = FOLHA.margem
    doc.setTextColor(PRETO)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
    doc.text('Levantamento', FOLHA.margem, y + 7)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(d.empresa, FOLHA.margem, y + 13)
    const meio = FOLHA.largura / 2
    rotulo(doc, 'DATA', meio - 18, y + 4.5); rotulo(doc, 'HORA', meio + 8, y + 4.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(dataLonga(d.geradoEm), meio - 18, y + 9.5); doc.text(hora(d.geradoEm), meio + 8, y + 9.5)
    const direita = FOLHA.largura - FOLHA.margem
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
    doc.text(`Nº ${d.numero}`, direita, y + 7, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(`Página ${pagina} de ${total}`, direita, y + 13, { align: 'right' })
    doc.setDrawColor(PRETO); doc.setLineWidth(0.4)
    doc.line(FOLHA.margem, y + ALTURA_DO_CABECALHO - 4, direita, y + ALTURA_DO_CABECALHO - 4)
    doc.setLineWidth(0.2)
}

function rodapeDaFolha(doc: Doc, d: DadosDaFolha) {
    const y = FOLHA.altura - FOLHA.margem - 3
    doc.setDrawColor(TRACO); doc.line(FOLHA.margem, y - 4, FOLHA.largura - FOLHA.margem, y - 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(CINZA)
    doc.text(rodape(d), FOLHA.largura / 2, y, { align: 'center' })
    doc.setTextColor(PRETO)
}

function blocoDoCliente(doc: Doc, d: DadosDaFolha, y: number): number {
    let cy = y
    for (const linha of linhasDoCliente(d)) {
        const h = alturaDaLinhaDoCliente(doc, linha)
        let cx = FOLHA.margem
        for (const c of linha) {
            doc.setDrawColor(TRACO); doc.rect(cx, cy, c.w, h)
            rotulo(doc, c.nome, cx + 1.5, cy + 2.6)
            doc.setFont('helvetica', 'normal')
            const texto = quebrar(doc, c.valor ?? '', c.w - 3, CORPO)
            doc.setFontSize(CORPO)
            texto.forEach((t, k) => doc.text(t, cx + 1.5, cy + 5.9 + k * CORPO * ENTRELINHA))
            cx += c.w
        }
        cy += h
    }
    return cy + 4
}

function cabecalhoDasColunas(doc: Doc, y: number): number {
    const x = FOLHA.margem
    doc.setFillColor(238, 238, 238); doc.rect(x, y, CONTEUDO, ALTURA_DO_CABECALHO_DAS_COLUNAS, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(PRETO)
    const meioY = y + ALTURA_DO_CABECALHO_DAS_COLUNAS / 2 + 1
    let cx = x
    doc.text('Fig.', cx + COLUNAS.fig / 2, meioY, { align: 'center' }); cx += COLUNAS.fig
    doc.text('Item e tipologia', cx + 1.5, meioY); cx += COLUNAS.item
    doc.text('Qtde', cx + COLUNAS.qtde / 2, meioY, { align: 'center' }); cx += COLUNAS.qtde
    for (const [nome, w] of [['Larg.', COLUNAS.larg], ['Alt.', COLUNAS.alt]] as const) {
        // o "mm" vai no RÓTULO, em corpo miúdo — nunca ao lado de cada valor
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
        const larguraDoNome = doc.getTextWidth(nome)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5)
        const larguraDoMm = doc.getTextWidth(' mm')
        const inicio = cx + (w - larguraDoNome - larguraDoMm) / 2
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(nome, inicio, meioY)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text(' mm', inicio + larguraDoNome, meioY)
        cx += w
    }
    return y + ALTURA_DO_CABECALHO_DAS_COLUNAS
}

function blocoDoItem(doc: Doc, i: ItemDaFolha, y: number): number {
    const x = FOLHA.margem
    doc.setDrawColor(TRACO)
    // a faixa: Fig. | Item e tipologia | Qtde | Larg. | Alt., todas na MESMA altura
    let cx = x
    doc.rect(cx, y, COLUNAS.fig, ALTURA_DA_FAIXA)
    const tracos = tracosDoDesenho(desenhoDaTipologia(i), { x: cx + 3, y: y + 3, w: COLUNAS.fig - 6, h: ALTURA_DA_FAIXA - 6 })
    doc.setDrawColor(PRETO); doc.setLineWidth(0.35)
    doc.rect(tracos.contorno.x, tracos.contorno.y, tracos.contorno.w, tracos.contorno.h)
    doc.setLineWidth(0.2)
    for (const [x1, y1, x2, y2] of tracos.divisoes) doc.line(x1, y1, x2, y2)
    doc.setDrawColor(TRACO)
    cx += COLUNAS.fig
    doc.rect(cx, y, COLUNAS.item, ALTURA_DA_FAIXA)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
    doc.text(`Item ${i.ordem} · ${i.tipologia}`, cx + 1.5, y + 5.5)
    doc.setFont('helvetica', 'normal')
    const nome = quebrar(doc, i.descricao, COLUNAS.item - 3, CORPO)
    doc.setFontSize(CORPO)
    nome.forEach((l, k) => doc.text(l, cx + 1.5, y + 10.5 + k * CORPO * ENTRELINHA))
    if (i.linha) {
        doc.setFontSize(7.5); doc.setTextColor(CINZA)
        doc.text(`Linha: ${i.linha}`, cx + 1.5, y + ALTURA_DA_FAIXA - 2.5)
        doc.setTextColor(PRETO)
    }
    cx += COLUNAS.item
    // Qtde, largura e altura centradas nos dois eixos
    for (const [valor, w] of [[String(i.quantidade), COLUNAS.qtde], [milhar(i.largura_mm), COLUNAS.larg], [milhar(i.altura_mm), COLUNAS.alt]] as const) {
        doc.rect(cx, y, w, ALTURA_DA_FAIXA)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
        doc.text(valor, cx + w / 2, y + ALTURA_DA_FAIXA / 2, { align: 'center', baseline: 'middle' })
        cx += w
    }
    // as linhas do item: o respiro sob a figura fica fora; o que resta é a linha (ou 50% para cada célula)
    let ly = y + ALTURA_DA_FAIXA
    const lx = x + COLUNAS.fig
    const respiroInicio = ly
    for (const l of linhasDoItem(i)) {
        const h = alturaDaLinha(doc, l)
        if (l.tipo === 'uma') celulaComRotulo(doc, lx, ly, LARGURA_DAS_LINHAS, h, l.rotulo, l.texto)
        else {
            celulaComRotulo(doc, lx, ly, LARGURA_DAS_LINHAS / 2, h, l.esquerda[0], l.esquerda[1])
            celulaComRotulo(doc, lx + LARGURA_DAS_LINHAS / 2, ly, LARGURA_DAS_LINHAS / 2, h, l.direita[0], l.direita[1])
        }
        ly += h
    }
    doc.setDrawColor(TRACO); doc.rect(x, respiroInicio, COLUNAS.fig, ly - respiroInicio)
    return ly + ESPACO_ENTRE_ITENS
}

function fecho(doc: Doc, d: DadosDaFolha, y: number) {
    const x = FOLHA.margem
    const partes = partesDoFecho(doc, d)
    let cy = y + 3
    if (partes.pre.length) {
        // só o que foi informado, corpo reduzido, sem negrito
        rotulo(doc, 'PRÉ-DEFINIÇÕES CONSIDERADAS', x, cy + 2)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(CORPO_REDUZIDO)
        partes.pre.forEach((l, k) => doc.text(l, x, cy + 4 + (k + 0.8) * CORPO_REDUZIDO * ENTRELINHA))
        cy += partes.alturaDasPre
    }
    rotulo(doc, 'CONDIÇÕES COMERCIAIS', x, cy + 2.5)
    cy += 4.5
    const c = d.condicoes
    const meio = (cy2: number, h: number) => cy2 + h / 2 + 1.2
    const par = (r: string, v: string, px: number, py: number) => {
        doc.setFontSize(CORPO)
        doc.setFont('helvetica', 'bold'); doc.text(r, px, py)
        const w = doc.getTextWidth(r)
        doc.setFont('helvetica', 'normal'); doc.text(v, px + w + 1.2, py)
        return px + w + 1.2 + doc.getTextWidth(v)
    }
    // vendedor + comissão % + modo numa linha; o modo encostado à direita
    let h = LINHA_DAS_CONDICOES
    doc.setDrawColor(TRACO); doc.rect(x, cy, CONTEUDO, h)
    const fimDoVendedor = par('Vendedor:', c.vendedor ?? '', x + 1.5, meio(cy, h))
    par('Comissão:', c.comissaoPercentual !== null ? percentual(c.comissaoPercentual) : '', Math.max(fimDoVendedor + 8, x + 95), meio(cy, h))
    doc.setFont('helvetica', 'normal'); doc.setFontSize(CORPO)
    doc.text(c.comissaoModo ? `Modo: ${MODO[c.comissaoModo]}` : '', x + CONTEUDO - 1.5, meio(cy, h), { align: 'right' })
    cy += h
    // RT + responsável + % | lucro projetado da proposta + %: metade da linha cada, o % num campo curto na borda direita da metade
    h = partes.alturaDaRt
    const metade = CONTEUDO / 2
    const metadeCom = (mx: number, rotuloDaMetade: string, pct: number | null) => {
        doc.setDrawColor(TRACO); doc.rect(mx, cy, metade, h)
        doc.rect(mx + metade - CAMPO_DO_PERCENTUAL, cy, CAMPO_DO_PERCENTUAL, h)
        const fim = par(rotuloDaMetade, '', mx + 1.5, cy + LINHA_DAS_CONDICOES / 2 + 1.2)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
        doc.text(pct !== null ? percentual(pct) : '', mx + metade - CAMPO_DO_PERCENTUAL / 2, meio(cy, h), { align: 'center' })
        return fim
    }
    const fimDaRt = metadeCom(x, ROTULO_DA_RT, c.rtPercentual)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(CORPO_REDUZIDO)
    partes.responsavel.forEach((l, k) => doc.text(l, fimDaRt + 1, cy + LINHA_DAS_CONDICOES / 2 + 1.2 + k * CORPO_REDUZIDO * ENTRELINHA))
    metadeCom(x + metade, 'Lucro projetado da proposta', c.lucroPercentual)
    cy += h + 2
    // conferido e confirmado por | data e hora — em branco, para quem confere
    h = LINHA_DAS_CONDICOES
    const largura = CONTEUDO * 0.65
    doc.setDrawColor(TRACO)
    doc.rect(x, cy, largura, h); doc.rect(x + largura, cy, CONTEUDO - largura, h)
    rotulo(doc, 'CONFERIDO E CONFIRMADO POR', x + 1.5, cy + 2.6)
    rotulo(doc, 'DATA E HORA', x + largura + 1.5, cy + 2.6)
}

/** As alturas para a paginação, medidas com as mesmas fontes que o desenho usa. */
function medir(doc: Doc, d: DadosDaFolha): AlturasDaFolha {
    return {
        util: FIM_DO_CORPO - TOPO_DO_CORPO,
        cliente: alturaDoCliente(doc, d),
        cabecalhoDasColunas: ALTURA_DO_CABECALHO_DAS_COLUNAS,
        itens: d.itens.map((i) => alturaDoItem(doc, i)),
        fecho: alturaDoFecho(doc, d),
    }
}

/** A faixa tem altura fixa: o nome da tipologia que não cabe nela é recusa (nunca cortado). */
const LINHAS_DO_NOME_NA_FAIXA = 4
function conferirMedidas(doc: Doc, d: DadosDaFolha): string[] {
    return d.itens
        .filter((i) => quebrar(doc, i.descricao, COLUNAS.item - 3, CORPO).length > LINHAS_DO_NOME_NA_FAIXA)
        .map((i) => `${nomeDoItem(i)}: o nome da tipologia não cabe na faixa do item (mais de ${LINHAS_DO_NOME_NA_FAIXA} linhas).`)
}

const novoDocumento = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    doc.setFont('helvetica', 'normal')
    doc.setLineWidth(0.2)
    return doc
}

/** O plano das folhas — o que vai em cada uma — sem desenhar. É o que os testes de paginação leem. */
export function planoDaFolha(d: DadosDaFolha): { paginas: PaginaDaFolha[]; alturas: AlturasDaFolha } | { recusa: string } {
    const doc = novoDocumento()
    const nomes = conferirMedidas(doc, d)
    if (nomes.length) return { recusa: nomes.join(' ') }
    const alturas = medir(doc, d)
    const p = paginar(alturas)
    return 'recusa' in p ? p : { paginas: p.paginas, alturas }
}

/** A folha do levantamento: confere, pagina e desenha. Recusa nomeada quando falta dado — nunca uma folha aproximada. */
export function gerarFolhaDoLevantamento(d: DadosDaFolha): FolhaGerada | FolhaRecusada {
    const recusas = conferirFolha(d)
    if (recusas.length) return { ok: false, recusas }
    const itens = [...d.itens].sort((a, b) => a.ordem - b.ordem)
    const dados: DadosDaFolha = { ...d, itens }
    const doc = novoDocumento()
    const nomes = conferirMedidas(doc, dados)
    if (nomes.length) return { ok: false, recusas: nomes }
    const plano = paginar(medir(doc, dados))
    if ('recusa' in plano) return { ok: false, recusas: [plano.recusa] }
    const total = plano.paginas.length
    plano.paginas.forEach((p, k) => {
        if (k > 0) doc.addPage('a4', 'portrait')
        cabecalho(doc, dados, k + 1, total)
        let y = TOPO_DO_CORPO
        if (p.cliente) y = blocoDoCliente(doc, dados, y)
        if (p.itens.length) y = cabecalhoDasColunas(doc, y)
        for (const i of p.itens) y = blocoDoItem(doc, itens[i], y)
        if (p.fecho) fecho(doc, dados, y)
        rodapeDaFolha(doc, dados)
    })
    doc.setProperties({ title: `Levantamento ${d.numero} — ${d.cliente.nome}`, creator: 'Precifica Certo' })
    // o mesmo levantamento gerado no mesmo instante dá os mesmos bytes (o exemplo em docs/levantamento/ é conferido assim)
    doc.setCreationDate(d.geradoEm)
    doc.setFileId(Array.from(`${d.numero}-${d.geradoEm.getTime()}`).map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(32, '0').slice(0, 32).toUpperCase())
    return { ok: true, pdf: new Uint8Array(doc.output('arraybuffer')), paginas: total, nomeDoArquivo: nomeDoArquivo(d) }
}
