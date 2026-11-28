/**
 * A RESOLUÇÃO DE REFERÊNCIA — UM módulo, usado pela conferência de referências do motor E pelo cálculo (perfil e insumo). Nenhuma cópia: o portão
 * `resolucao-de-referencia-sem-copia.test.ts` reprova a segunda.
 *
 * A ESCADA (dono do produto, 12/11/2026, o comando único — substitui a de 12/11 de manhã, que tinha "cor pela descrição" e "aproximado com
 * descrição"). Dentro do ESCOPO (perfil: o fornecedor e a família do motor; insumo: o fornecedor principal de cada categoria da conta), parando
 * no primeiro degrau que dá EXATAMENTE UM resultado:
 *   1. `ponte`: o código que a aba "Motor por barra" deu para o par (código WVetro, cor) — `codigoDaPonte` —, achado na tabela pelo código;
 *   2. `exato`: o próprio código do motor (`SF92/WOLFF`, `1023/WOLFF`, `10457`) achado na tabela. O SUFIXO DO FORNECEDOR está dentro do exato
 *      (dono do produto: "o /WOLFF marca de qual tabela o código veio, não qual produto é — é formato, não identidade, ao contrário do dígito de
 *      cor"), nos dois sentidos: o motor com e a tabela sem (`1326/WOLFF` → `1326`) e o motor sem e a tabela com (`1326` → `1326/WOLFF`, como
 *      está na tabela de ACESSÓRIOS e na de VEDAÇÃO da Wolf, medido em 12/11/2026). Com sufixo no motor, só ESSE sai do item; sem sufixo no
 *      motor, sai o do item — o escopo já é só do fornecedor, e o guarda da descrição confere;
 *   3. `cor`: o código do motor + o DÍGITO DA COR, com a cor vinda da conversa e traduzida pela TABELA DE CORES do fornecedor
 *      (`orcamentista_fornecedor_cor`): 1317 + BRANCO (1) = 13171. O ".1" final é FACE MENOR, não cor: 1317.1 + BRANCO = 13171.1. Sem cor
 *      pedida NÃO se assume branco (`SEM_COR`); cor fora da tabela do fornecedor é "não resolvido" (`COR_FORA_DA_TABELA`), nunca palpite;
 *   4. `nome_tecnico`: o nome técnico do motor (`SF92`, `IL50`, `BZ0012`) escrito na DESCRIÇÃO do item, DELIMITADO (IL50 não casa com IL501 nem
 *      com BIL50) e ignorando os espaços internos (IL50 casa com "IL 50"). O ITEM QUE É O PRODUTO vem antes de tudo: havendo descrição que COMEÇA
 *      com o nome, só elas contam — mesmo que a cor as recuse depois. Sem isso, o SF92 em Roxo (a folha "SF92 - FOLHA DE PORTA - BRANCO"
 *      recusada pela cor) caía no reforço "REFORÇO FOLHA SF92 AÇO GALVANIZADO", que passa no guarda pela palavra FOLHA (medido no caso Gerson
 *      Boss, 12/11/2026). Mais de um: prefere a descrição que COMEÇA com o nome; depois, a que
 *      tem mais palavras significativas em comum com a do motor (o BY60: 22321 tem VENEZIANA + JAPONESA, as cremalheiras só VENEZIANA). Empate:
 *      falta nomeada. Só vale para nome com letra: código só de números é código, não nome. A cor também conta aqui: o item que nomeia OUTRA
 *      cor da tabela do fornecedor não serve; sem cor pedida, o item que nomeia uma cor não serve (não se assume a cor dele). SEM A TABELA DE
 *      CORES do fornecedor (a migração pendente, ou o fornecedor sem as cores) o degrau NÃO roda: sem ela, o "SF92 - ... - BRANCO" serviria a
 *      uma esquadria preta, e o guarda da cor não teria com o que conferir (`SEM_TABELA_DE_CORES`, que vale também para o degrau da cor).
 *
 * O GUARDA, OBRIGATÓRIO NOS QUATRO DEGRAUS: a descrição do item tem de CONCORDAR com a do motor — PELO MENOS UMA PALAVRA SIGNIFICATIVA em comum
 * (opção (a) do dono do produto, 12/11/2026). Significativa = normalizada (sem acento, sem caixa), sem as de ligação, sem número nem medida, sem
 * as palavras das cores do fornecedor e sem o próprio nome técnico. Medido nos 46 pares de produção: os 46 passam (o JT61 entra por
 * INVERSORA), e os dois falsos positivos caem: 1756 (VENEZIANA TROPICAL) contra 17569 (MAÇANETA CELSUS), e IL50 (INTERLOCK PORTA) contra
 * 9347/WOLFF (ESCOVA DE VEDAÇÃO ... IL50 — o "IL50" do fim não conta, porque é o nome técnico). Sem descrição no motor, o guarda não tem com
 * o que conferir: falta nomeada (`DESCRICAO_DO_MOTOR_AUSENTE`), nunca aprovado às cegas.
 *
 * FALTA NOMEADA, NUNCA PALPITE: duas candidatas no mesmo degrau (`AMBIGUA`), as que o guarda recusou (`DESCRICAO_NAO_CONCORDA`), nenhuma
 * (`NAO_ACHADA`). A frase diz o código do motor, a cor pedida, as candidatas e por que nenhuma valeu. O RESULTADO DIZ COMO ACHOU (`ComoAchou`),
 * e o cálculo grava isso na fotografia do material.
 *
 * O CÓDIGO DO MOTOR NÃO SE NORMALIZA (`docs/regras/codigo-do-motor-nao-se-normaliza.md`): nenhum degrau tira zero, caixa, ponto ou espaço do
 * código. Só sai o sufixo do fornecedor, que é marca de formato, e só o do código do motor.
 *
 * A REFERÊNCIA DO PERFIL VEM ANTES DA ESCADA (dono do produto, 24/11/2026; migração 20261124000002): "o casamento do motor passa a ser
 * referência do perfil + cor, igual, nunca pelo parecido nem pelo código do fornecedor. O sufixo /WOLFF do motor não entra na referência."
 * A tabela do fornecedor identifica o perfil por número interno POR COR (9641 = "HF88S - MARCO CORRER DUPLO COM ABA - BRANCO"), e o motor pede
 * `HF88S/WOLFF`; a coluna `referencia_perfil` do item traz o `HF88S`, e a coluna `cor`, a cor. `resolverPelaReferencia`:
 *   - a referência é o código do motor SEM o sufixo do fornecedor, comparada IGUAL (crua: nem caixa, nem zero, nem espaço);
 *   - a cor pedida e a cor do item são comparadas como TODA cor deste módulo (`descricaoNormalizada`: sem acento e sem caixa — a conversa grava
 *     "Branco", a tabela "BRANCO");
 *   - UM item da referência na cor pedida → é ele (`referencia`), sem o guarda da descrição: a referência é identidade, não semelhança;
 *   - a referência que NÃO TEM COR em nenhum item dela (a peça sem cor, como o reforço de aço) serve a qualquer cor pedida;
 *   - a referência existe mas não na cor pedida → falta nomeada com as cores que ela tem (`REFERENCIA_SEM_A_COR`); sem cor pedida → `SEM_COR`.
 * O ITEM QUE TEM REFERÊNCIA SÓ É ACHADO POR ELA: a escada (ponte, exato, cor, nome técnico) roda só sobre os itens SEM referência — o item com
 * referência nunca é achado pelo código do fornecedor nem pelo nome parecido na descrição. Enquanto a tabela não é reimportada com a referência
 * (todas as linhas de hoje), nenhum item a tem, e a escada segue como era: nada quebra pela ordem do deploy e da reimportação.
 *
 * Para separar as duas formas do resultado, use `'item' in r`: com `strictNullChecks: false`, o tsc não estreita a união pelo booleano.
 * Puro: não lê banco. Quem chama traz os itens já no escopo e a tabela de cores do fornecedor.
 */

/** A referência como o motor a cita. */
export interface ReferenciaProcurada {
    /** O código como o motor o escreve: o perfil (`SF92/WOLFF`) ou o insumo (`10457`, `9074/WOLFF`). */
    codigoDoMotor: string
    /** O código que a ponte do motor (aba "Motor por barra") deu para a cor pedida; null quando não há ponte. */
    codigoDaPonte: string | null
    /**
     * TODAS as linhas da ponte (aba "Motor por barra") deste código do motor, de qualquer cor; vazia quando não há ponte (o insumo). É delas que
     * sai o CÓDIGO-BASE do fornecedor para o degrau da cor (dono do produto, 17/11/2026: "o perfil determinado é o 1317; o último número, ou os
     * dois últimos, representam a cor") — o GB8/WOLFF é o 983 da Wolff, e o 983 + PRETO TEXTURADO (20) é o 98320. Obrigatório, sem default
     * (`construtor-empobrecido.md`): quem não tem ponte diz `[]`.
     */
    ponteDoCodigo: ReadonlyArray<{ codigo: string; cor: string | null }>
    /** A descrição que o motor dá à peça — é com ela que o guarda confere a do item. */
    descricaoDoMotor: string | null
    /** A cor da conversa (`cor_perfil`); null quando não foi dita. */
    corPedida: string | null
}
/**
 * O mínimo que a resolução lê de um item: o código e a descrição — e, quando a tabela os traz, a referência do perfil e a cor
 * (20261124000002). O resto do item viaja junto.
 */
export interface ItemResolvivel {
    codigo: string; descricao?: string | null; referencia_perfil?: string | null; cor?: string | null
    /** A CATEGORIA da tabela de onde o item vem (PERFIL, REFORCO…): o reforço interno sem cor (pedido 0037/0038) depende dela. Ausente: não se sabe. */
    categoria?: string | null
}
/** Uma linha de `orcamentista_fornecedor_cor`. */
export interface CorDoFornecedor { grupo: string; codigo: string; nome: string }
/** O que a resolução precisa além dos itens: a tabela de cores do fornecedor e o grupo de cor do que se procura (perfil ou acessório). */
export interface ContextoDaResolucao { cores: readonly CorDoFornecedor[]; grupoDeCor: string }
/** Os grupos da aba CORES da Wolff, como gravados (20261112000006). */
export const GRUPO_DE_COR = { perfil: 'PERFIS DE PVC', insumo: 'ACESSORIOS' } as const

/**
 * Os degraus da ESCADA (os itens sem referência). SAIU o degrau "código + cor" (dono do produto, 26/11/2026, pedido 0036; REFERENCIA_UNICA
 * §4.3): base e cor só se juntam na importação, nunca no cálculo. Medido antes de cortar, com o motor 259035a9 e as tabelas da De Paula: nenhum
 * perfil nem insumo era achado só por ele (os 65 perfis resolvem pela referência; dos 63 insumos, 61 pela referência ou pelo código exato e 2 não
 * estão na tabela).
 */
export type DegrauDaEscada = 'ponte' | 'exato' | 'nome_tecnico'
/**
 * Como o item foi achado: pela referência do perfil + cor (antes da escada), ou por um degrau dela. `cor` fica só como FATO HISTÓRICO: é o que o
 * cálculo de antes de 26/11/2026 gravou (`resolucao` do material, CHECK do banco), e nenhum cálculo novo o devolve (`fato-vs-referencia.md`).
 */
export type ComoAchou = 'referencia' | 'cor' | DegrauDaEscada
/** A ordem da escada. É ela que decide qual degrau vale; os de baixo não são tentados. */
export const COMO_ACHOU: readonly DegrauDaEscada[] = ['ponte', 'exato', 'nome_tecnico']
export type MotivoDaFalta = 'NAO_ACHADA' | 'AMBIGUA' | 'DESCRICAO_NAO_CONCORDA' | 'SEM_COR' | 'COR_FORA_DA_TABELA' | 'SEM_TABELA_DE_CORES' | 'DESCRICAO_DO_MOTOR_AUSENTE' | 'REFERENCIA_SEM_A_COR'
export const MOTIVOS_DA_FALTA: readonly MotivoDaFalta[] = ['NAO_ACHADA', 'AMBIGUA', 'DESCRICAO_NAO_CONCORDA', 'SEM_COR', 'COR_FORA_DA_TABELA', 'SEM_TABELA_DE_CORES', 'DESCRICAO_DO_MOTOR_AUSENTE', 'REFERENCIA_SEM_A_COR']
type Pulo = 'SEM_COR' | 'COR_FORA_DA_TABELA' | 'SEM_TABELA_DE_CORES'

export interface CandidataRecusada<I> { item: I; porque: string }
/**
 * POR QUE o item achado pela referência NÃO é da cor pedida (pedido 0038): `peca_sem_a_cor` — a peça não existe na cor da esquadria, a esquadria não
 * é BRANCO e a referência existe em PRETO, que é o que entra; `reforco_sem_cor` — o reforço interno com um item só na tabela entra sem cor.
 */
export type SubstituicaoDaCor = 'peca_sem_a_cor' | 'reforco_sem_cor'
export type ResolucaoDeReferencia<I> =
    | { achada: true; como: ComoAchou; item: I; substituicao?: SubstituicaoDaCor }
    | { achada: false; motivo: MotivoDaFalta; procurado: string; candidatas: Array<CandidataRecusada<I>>; frase: string }

export const ROTULO_DO_COMO: Record<ComoAchou, string> = {
    referencia: 'referência do perfil + cor',
    ponte: 'ponte do motor',
    exato: 'código exato',
    cor: 'código + cor do fornecedor',
    nome_tecnico: 'nome técnico na descrição',
}

// ── o escopo ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** O escopo do motor: o fornecedor dele e as famílias em que ele atua. */
export interface EscopoDoMotor { fornecedor_id: string; familias: readonly string[] }
/** A tabela está no escopo: do fornecedor do motor, e de uma família dele (a tabela sem família — "qualquer linha" — serve a todas). */
export function tabelaNoEscopo(t: { fornecedor_id: string; familia: string | null }, escopo: EscopoDoMotor): boolean {
    return t.fornecedor_id === escopo.fornecedor_id && (t.familia === null || escopo.familias.includes(t.familia))
}

// ── as formas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** O sufixo do fornecedor no fim do código do motor (`SF92/WOLFF` → `WOLFF`), em caixa alta, ou null. */
export function sufixoDoFornecedor(codigo: string | null): string | null {
    const m = /\/\s*([A-Za-z]+)\s*$/.exec(codigo ?? '')
    return m ? m[1].toUpperCase() : null
}
/** O código sem o sufixo DADO (e só ele, sem olhar a caixa); o resto fica como está — nem zero, nem caixa, nem ponto. */
export function semOSufixo(codigo: string, sufixo: string | null): string {
    if (sufixo === null) return codigo
    const m = new RegExp(`\\s*/\\s*${sufixo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').exec(codigo)
    return m ? codigo.slice(0, m.index) : codigo
}
/** O texto para COMPARAR (nunca para mostrar): sem acento, sem caixa, só letras e números separados por um espaço. */
export function descricaoNormalizada(d: string | null | undefined): string {
    return (d ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}
/** As palavras de ligação, que nunca contam como concordância. */
export const PALAVRAS_DE_LIGACAO: ReadonlySet<string> = new Set([
    'DE', 'DA', 'DO', 'DAS', 'DOS', 'PARA', 'P', 'C', 'COM', 'SEM', 'E', 'OU', 'EM', 'A', 'O', 'AS', 'OS', 'NA', 'NO', 'NAS', 'NOS', 'AO', 'POR', 'X',
])
/**
 * As palavras significativas de uma descrição: normalizadas, sem as de ligação, sem as que têm algarismo (número e medida: 24MM, 150X20, IL50),
 * sem as palavras das cores do fornecedor e sem o nome técnico. É o que o guarda compara.
 */
export function palavrasSignificativas(descricao: string | null | undefined, cores: readonly CorDoFornecedor[], nomeTecnico: string | null): Set<string> {
    const daCor = new Set(cores.flatMap((c) => descricaoNormalizada(c.nome).split(' ')))
    const nome = nomeTecnico === null ? null : descricaoNormalizada(nomeTecnico).replace(/ /g, '')
    return new Set(descricaoNormalizada(descricao).split(' ').filter((p) =>
        p.length > 1 && !PALAVRAS_DE_LIGACAO.has(p) && !/\d/.test(p) && !daCor.has(p) && p !== nome))
}
/** Quantas palavras significativas as duas descrições têm em comum. */
export function palavrasEmComum(motor: ReadonlySet<string>, item: ReadonlySet<string>): number {
    let n = 0
    for (const p of motor) if (item.has(p)) n += 1
    return n
}
/** O nome técnico casado na descrição: DELIMITADO (nem letra nem algarismo colado) e ignorando os espaços internos ("IL 50"). */
export function nomeTecnicoNaDescricao(nome: string, descricao: string | null | undefined): { casou: boolean; noInicio: boolean } {
    const n = descricaoNormalizada(nome).replace(/ /g, '')
    if (n === '') return { casou: false, noInicio: false }
    const corpo = [...n].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')
    const d = descricaoNormalizada(descricao)
    const m = new RegExp(`(?<![A-Z0-9])${corpo}(?![A-Z0-9])`).exec(d)
    return m ? { casou: true, noInicio: m.index === 0 } : { casou: false, noInicio: false }
}
/** As cores do fornecedor (deste grupo) que a descrição nomeia, delimitadas; as mais longas primeiro, para EXTERNO PRETO LISO não virar PRETO. */
export function coresNaDescricao(descricao: string | null | undefined, cores: readonly CorDoFornecedor[]): string[] {
    let d = ` ${descricaoNormalizada(descricao)} `
    const achadas: string[] = []
    for (const c of [...cores].sort((a, b) => descricaoNormalizada(b.nome).length - descricaoNormalizada(a.nome).length)) {
        const n = ` ${descricaoNormalizada(c.nome)} `
        if (n.trim() !== '' && d.includes(n)) { achadas.push(descricaoNormalizada(c.nome)); d = d.split(n).join(' ') }
    }
    return achadas
}
/**
 * As PALAVRAS DE COR do grupo: as palavras dos nomes da tabela de cores, menos os MODIFICADORES (EXTERNO, AMADEIRADO), que também são palavra
 * comum de peça ("ARREMATE EXTERNO"). Medido em 12/11/2026 na tabela da Wolf: as descrições escrevem a cor de outro jeito que a tabela —
 * "LAMINADO GOLDEN OAK" e "LAMINADO NOGUEIRA" para AMADEIRADO GOLDEN OAK e AMADEIRADO NOGUEIRA, "PRETO ALUMÍNIO", "LAMINADO OAK" —, e a
 * frase inteira não as acha; a palavra acha.
 */
export const MODIFICADORES_DE_COR: ReadonlySet<string> = new Set(['EXTERNO', 'AMADEIRADO'])
export function palavrasDeCor(cores: readonly CorDoFornecedor[]): Set<string> {
    return new Set(cores.flatMap((c) => descricaoNormalizada(c.nome).split(' ')).filter((p) => p !== '' && !MODIFICADORES_DE_COR.has(p)))
}
/**
 * A descrição nomeia uma cor que NÃO é a pedida: tirada a cor pedida (a frase inteira, quando está lá), sobra alguma palavra de cor. Sem cor
 * pedida, qualquer palavra de cor conta. O nome técnico não conta como cor.
 */
export function nomeiaOutraCor(descricao: string | null | undefined, pedida: string | null, cores: readonly CorDoFornecedor[], nomeTecnico: string): string[] {
    let d = ` ${descricaoNormalizada(descricao)} `
    const p = pedida === null ? '' : descricaoNormalizada(pedida)
    if (p !== '') d = d.split(` ${p} `).join(' ')
    const nome = descricaoNormalizada(nomeTecnico).replace(/ /g, '')
    const cor = palavrasDeCor(cores)
    return [...new Set(d.trim().split(' ').filter((w) => cor.has(w) && w !== nome))]
}
/**
 * A COR AFIRMADA DE UM ITEM — a hierarquia do dono do produto, 12/11/2026, à noite (`docs/regras/cor-afirmada-pelo-codigo.md`; supera, neste ponto,
 * a regra de 25/10 "recusa quando a descrição não diz a cor"):
 *   a. o SUFIXO DO CÓDIGO, quando está na tabela de cores do fornecedor, DECIDE — a descrição não precisa repetir (90531 = 9053 + 1, BRANCO);
 *   b. sem sufixo conhecido, a PALAVRA DE COR da descrição decide ("LAMINADO GOLDEN OAK" é cor escrita, não "sem cor");
 *   c. nenhum dos dois: a cor NÃO FOI AFIRMADA — e com cor pedida, o item não serve.
 * O sufixo só se lê numa FAMÍLIA: os códigos do mesmo degrau que dividem um prefixo (9053 em 90531, 905320, 905321…); o prefixo comum é a base, e o
 * que sobra é o dígito da cor. Um código sozinho não tem família, e o sufixo dele não se conhece. O ".1" (face menor) sai antes.
 */
export type CorAfirmada = { por: 'sufixo'; cor: string } | { por: 'descricao'; palavras: string[]; frases: string[] } | { por: 'nenhuma' }
const semFaceMenor = (c: string) => (c.endsWith('.1') ? c.slice(0, -2) : c)
/**
 * O prefixo comum dos códigos da família (sem o ".1"). Só É família quando pelo menos DOIS códigos terminam, depois do prefixo, num código da tabela
 * de cores — senão o prefixo é coincidência (8427 e 83571 dividem o "8", e nenhum dos dois é o "8" + uma cor). Sem família, vazio.
 */
export function baseDaFamilia(codigos: readonly string[], cores: readonly CorDoFornecedor[]): string {
    const cs = [...new Set(codigos.map(semFaceMenor))]
    if (cs.length < 2) return ''
    let p = cs[0]
    for (const c of cs) while (!c.startsWith(p)) p = p.slice(0, -1)
    const daTabela = new Set(cores.map((x) => x.codigo))
    return p !== '' && cs.filter((c) => c.length > p.length && daTabela.has(c.slice(p.length))).length >= 2 ? p : ''
}
export function corAfirmada(codigo: string, descricao: string | null | undefined, base: string, cores: readonly CorDoFornecedor[], nomeTecnico: string): CorAfirmada {
    const c = semFaceMenor(codigo)
    if (base !== '' && c.startsWith(base) && c.length > base.length) {
        const daTabela = cores.find((x) => x.codigo === c.slice(base.length))
        if (daTabela) return { por: 'sufixo', cor: descricaoNormalizada(daTabela.nome) }
    }
    const frases = coresNaDescricao(descricao, cores)
    const palavras = nomeiaOutraCor(descricao, null, cores, nomeTecnico)
    return palavras.length ? { por: 'descricao', palavras, frases } : { por: 'nenhuma' }
}
/** A cor afirmada é a pedida? Pelo sufixo, o nome da tabela; pela descrição, a frase da tabela ou — escrita de outro jeito — as mesmas palavras de cor. */
export function corAfirmadaEhAPedida(a: CorAfirmada, pedida: string, cores: readonly CorDoFornecedor[]): boolean {
    if (a.por === 'sufixo') return a.cor === pedida
    if (a.por === 'nenhuma') return false
    if (a.frases.some((f) => f !== pedida)) return false
    if (a.frases.includes(pedida)) return true
    const daPedida = [...palavrasDeCor([{ grupo: '', codigo: '', nome: pedida }])].filter((w) => palavrasDeCor(cores).has(w)).sort()
    return daPedida.length > 0 && [...a.palavras].sort().join(' ') === daPedida.join(' ')
}
const descreverCor = (a: CorAfirmada) => (a.por === 'sufixo' ? `o código diz ${a.cor}` : a.por === 'descricao' ? `a descrição diz ${a.palavras.join(' ')}` : 'nem o código nem a descrição dizem a cor')

// ── a escada ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const doGrupo = (ctx: ContextoDaResolucao) => ctx.cores.filter((c) => c.grupo === ctx.grupoDeCor)
/** O item cujo código é o procurado — o mesmo, ou com/sem o sufixo do fornecedor (o do motor; sem ele, o do item). */
function peloCodigo<I extends ItemResolvivel>(procurado: string, sufixo: string | null, itens: readonly I[]): I[] {
    const sem = semOSufixo(procurado, sufixo)
    return itens.filter((i) => i.codigo === procurado || semOSufixo(i.codigo, sufixo ?? sufixoDoFornecedor(i.codigo)) === sem)
}

type Degrau<I> = { como: DegrauDaEscada; candidatas: I[]; pulado?: Pulo }

/** Os itens que cada degrau acha, ANTES do guarda. Exportada para o teste provar degrau a degrau. */
export function candidatasDoDegrau<I extends ItemResolvivel>(como: DegrauDaEscada, ref: ReferenciaProcurada, itens: readonly I[], ctx: ContextoDaResolucao): Degrau<I> {
    const sufixo = sufixoDoFornecedor(ref.codigoDoMotor)
    if (como === 'ponte') return { como, candidatas: ref.codigoDaPonte === null ? [] : peloCodigo(ref.codigoDaPonte, sufixo, itens) }
    if (como === 'exato') return { como, candidatas: peloCodigo(ref.codigoDoMotor, sufixo, itens) }
    const base = semOSufixo(ref.codigoDoMotor, sufixo)
    // o nome técnico: só nome com letra (código só de números é código), delimitado na descrição; e só com a tabela de cores, que o guarda da cor lê
    if (!/[A-Za-z]/.test(base)) return { como, candidatas: [] }
    if (doGrupo(ctx).length === 0) return { como, candidatas: [], pulado: 'SEM_TABELA_DE_CORES' }
    // o ponto também não se dissolve aqui (tarefa 0014): o pedido com ".1" só casa item com ".1", e o pedido sem ".1" só casa item sem ele — o
    // nome técnico na descrição ("BZ4556 - ... - ALUMÍNIO") não troca o 1027.1 (PVC) pelo 10271 (alumínio)
    const pedidoComPonto = (ref.codigoDaPonte ?? base).endsWith('.1')
    return { como, candidatas: itens.filter((i) => nomeTecnicoNaDescricao(base, i.descricao).casou && semOSufixo(i.codigo, sufixoDoFornecedor(i.codigo)).endsWith('.1') === pedidoComPonto) }
}

// ── a referência do perfil + cor (antes da escada) ────────────────────────────────────────────────────────────────────────────────────
/** O item traz a referência do perfil: só é achado por ela (a escada não o vê). */
export const temReferencia = (i: ItemResolvivel): boolean => i.referencia_perfil !== undefined && i.referencia_perfil !== null
/** A referência que o motor pede: o código dele SEM o sufixo do fornecedor (`HF88S/WOLFF` → `HF88S`), cru. */
export const referenciaDoMotor = (codigoDoMotor: string): string => semOSufixo(codigoDoMotor, sufixoDoFornecedor(codigoDoMotor))
const COR_BRANCA = 'BRANCO'
const COR_PRETA = 'PRETO'
/** A cor para comparar (como toda cor deste módulo); a vazia é "sem cor". */
const corParaComparar = (cor: string | null | undefined): string | null => { const c = descricaoNormalizada(cor); return c === '' ? null : c }
/**
 * A resolução PELA REFERÊNCIA DO PERFIL + COR. `null` quando NENHUM item do escopo traz a referência pedida — só então a escada roda (sobre os
 * itens sem referência). Com a referência no escopo, o resultado é final: o item, ou a falta nomeada; nunca o parecido.
 */
export function resolverPelaReferencia<I extends ItemResolvivel>(ref: Pick<ReferenciaProcurada, 'codigoDoMotor' | 'descricaoDoMotor' | 'corPedida'>, itens: readonly I[]): ResolucaoDeReferencia<I> | null {
    const referencia = referenciaDoMotor(ref.codigoDoMotor)
    const daReferencia = itens.filter((i) => i.referencia_perfil === referencia)
    if (daReferencia.length === 0) return null
    const quem = `${ref.codigoDoMotor}${ref.descricaoDoMotor ? ` (${ref.descricaoDoMotor})` : ''}${ref.corPedida ? ` em ${ref.corPedida}` : ''}`
    const lista = (xs: readonly I[]) => xs.map((i) => `${i.codigo}${i.cor ? ` (${i.cor})` : ''}`).join('; ')
    const faltou = (motivo: MotivoDaFalta, frase: string, porque: string, candidatas: readonly I[] = daReferencia): ResolucaoDeReferencia<I> =>
        ({ achada: false, motivo, procurado: ref.codigoDoMotor, candidatas: candidatas.map((item) => ({ item, porque })), frase })
    const ambigua = (xs: readonly I[], onde: string) => faltou('AMBIGUA',
        `${quem} tem ${xs.length} itens com a referência ${referencia}${onde} na tabela de preço, e nenhum é escolhido: ${lista(xs)}`, `${xs.length} itens com a mesma referência${onde}: nenhum é escolhido`, xs)
    // a referência sem cor em NENHUM item dela é a peça que não tem cor: serve a qualquer cor pedida
    if (daReferencia.every((i) => corParaComparar(i.cor) === null)) {
        return daReferencia.length === 1 ? { achada: true, como: 'referencia', item: daReferencia[0] } : ambigua(daReferencia, ' e sem cor')
    }
    // O REFORÇO INTERNO SEM COR (pedido 0038): na categoria REFORÇO, a referência com UM item só na tabela (1352, 8427, 8433) entra por ela, sem
    // cor — o reforço fica dentro do perfil. O reforço com várias cores (as colunas 3485, 5456, 8645) continua exigindo a cor
    if (daReferencia.length === 1 && corParaComparar(daReferencia[0].categoria) === 'REFORCO') return { achada: true, como: 'referencia', item: daReferencia[0], substituicao: 'reforco_sem_cor' }
    const pedida = corParaComparar(ref.corPedida)
    if (pedida === null) {
        return faltou('SEM_COR', `${ref.codigoDoMotor}${ref.descricaoDoMotor ? ` (${ref.descricaoDoMotor})` : ''}: a cor não foi dita, e a referência ${referencia} tem um item por cor — não se assume branco`, 'a cor não foi dita')
    }
    const daCor = daReferencia.filter((i) => corParaComparar(i.cor) === pedida)
    if (daCor.length === 1) return { achada: true, como: 'referencia', item: daCor[0] }
    if (daCor.length > 1) return ambigua(daCor, ` na cor ${ref.corPedida}`)
    // A PEÇA QUE NÃO EXISTE NA COR DO PERFIL (dono do produto, 26/11/2026, pedido 0038; o orçamento 31-PVC em PRETO LISO): a esquadria que não é
    // BRANCO leva a peça em PRETO quando a referência existe em PRETO (9125, 2575, 1379, 1874, 2681…: as peças só branco/preto). Uma só em PRETO,
    // ou nada: duas em PRETO continuam ambíguas, e a que não tem PRETO continua falta nomeada
    if (pedida !== COR_BRANCA) {
        const emPreto = daReferencia.filter((i) => corParaComparar(i.cor) === COR_PRETA)
        if (emPreto.length === 1) return { achada: true, como: 'referencia', item: emPreto[0], substituicao: 'peca_sem_a_cor' }
        if (emPreto.length > 1) return ambigua(emPreto, ' na cor PRETO')
    }
    const cores = [...new Set(daReferencia.map((i) => (corParaComparar(i.cor) === null ? '(sem cor)' : String(i.cor))))]
    return faltou('REFERENCIA_SEM_A_COR', `${quem}: referência ${referencia} não existe na aba ${ref.corPedida} — ela existe nas abas: ${cores.join(', ')}`, `é da referência ${referencia}, em outra cor`)
}

/** A resolução de UMA referência, no escopo já filtrado: a referência do perfil + cor primeiro; sem ela no escopo, a escada sobre os itens sem referência. */
export function resolverReferencia<I extends ItemResolvivel>(ref: ReferenciaProcurada, todos: readonly I[], ctx: ContextoDaResolucao): ResolucaoDeReferencia<I> {
    const pelaReferencia = resolverPelaReferencia(ref, todos)
    if (pelaReferencia !== null) return pelaReferencia
    // o item que tem referência só é achado por ela: a escada não o vê (nunca pelo código do fornecedor, nunca pelo parecido)
    const itens = todos.filter((i) => !temReferencia(i))
    const haReferencias = itens.length !== todos.length
    const sufixo = sufixoDoFornecedor(ref.codigoDoMotor)
    const nome = semOSufixo(ref.codigoDoMotor, sufixo)
    const motor = palavrasSignificativas(ref.descricaoDoMotor, ctx.cores, nome)
    const recusadas: Array<CandidataRecusada<I>> = []
    let pulos: Pulo[] = []
    const pedida = ref.corPedida === null ? null : descricaoNormalizada(ref.corPedida)
    for (const como of COMO_ACHOU) {
        const d = candidatasDoDegrau(como, ref, itens, ctx)
        if (d.pulado) pulos = [...pulos, d.pulado]
        if (d.candidatas.length === 0) continue
        if (motor.size === 0) return falta(ref, 'DESCRICAO_DO_MOTOR_AUSENTE', d.candidatas.map((item) => ({ item, porque: 'a peça do motor não tem descrição para conferir' })))
        // todos os candidatos do degrau passam pelo guarda: SAIU a preferência pela descrição que começa com o nome (pedido 0036, §3.5) — a
        // posição do nome na descrição não escolhe uma peça entre várias
        const doDegrau = d.candidatas
        // a família do degrau (para o sufixo de cor do código): os códigos dos candidatos
        const base = como === 'nome_tecnico' ? baseDaFamilia(doDegrau.map((i) => i.codigo), doGrupo(ctx)) : ''
        // o guarda: a descrição do item concorda com a do motor
        const passam: I[] = []
        for (const item of doDegrau) {
            const emComum = palavrasEmComum(motor, palavrasSignificativas(item.descricao, ctx.cores, nome))
            // o mesmo item recusado em dois degraus (a ponte e a cor dão o mesmo código) é nomeado uma vez
            if (emComum === 0) { if (!recusadas.some((x) => x.item === item)) recusadas.push({ item, porque: `a descrição não concorda com a do motor (${ref.descricaoDoMotor ?? ''})` }); continue }
            // no nome técnico, a cor que a descrição nomeia tem de ser a pedida (pela PALAVRA de cor, não só pela frase da tabela); sem cor pedida,
            // o item que nomeia uma cor não serve
            // a cor AFIRMADA (o sufixo do código, senão a palavra da descrição) tem de ser a pedida; sem cor pedida, o item que afirma cor não serve
            if (como === 'nome_tecnico') {
                const a = corAfirmada(item.codigo, item.descricao, base, doGrupo(ctx), nome)
                if (pedida === null && a.por !== 'nenhuma') { recusadas.push({ item, porque: `${descreverCor(a)}, e a cor não foi dita` }); continue }
                if (pedida !== null && !corAfirmadaEhAPedida(a, pedida, doGrupo(ctx))) {
                    recusadas.push({ item, porque: a.por === 'nenhuma' ? `${descreverCor(a)}: a cor ${ref.corPedida} não foi afirmada` : `${descreverCor(a)}, e a pedida é ${ref.corPedida}` })
                    continue
                }
            }
            passam.push(item)
        }
        if (passam.length === 1) return { achada: true, como, item: passam[0] }
        if (passam.length === 0) continue
        // o nome técnico com mais de um que passa no guarda é AMBÍGUO, como em todo degrau: SAIU o desempate pela descrição que começa com o nome e
        // pelas palavras em comum (dono do produto, 26/11/2026, pedido 0036; REFERENCIA_UNICA §3.5: "exatamente um; senão, falta de FORNECEDOR").
        // Medido antes de cortar: nenhuma peça dos motores ativos era achada por ele
        return falta(ref, 'AMBIGUA', passam.map((item) => ({ item, porque: `${passam.length} itens no mesmo degrau (${ROTULO_DO_COMO[como]}): nenhum é escolhido` })))
    }
    if (recusadas.length) return falta(ref, 'DESCRICAO_NAO_CONCORDA', recusadas)
    if (pulos.includes('SEM_COR')) return falta(ref, 'SEM_COR', [])
    if (pulos.includes('COR_FORA_DA_TABELA')) return falta(ref, 'COR_FORA_DA_TABELA', [])
    if (pulos.includes('SEM_TABELA_DE_CORES')) return falta(ref, 'SEM_TABELA_DE_CORES', [])
    return falta(ref, 'NAO_ACHADA', [], haReferencias)
}

function falta<I extends ItemResolvivel>(ref: ReferenciaProcurada, motivo: Exclude<MotivoDaFalta, 'REFERENCIA_SEM_A_COR'>, candidatas: Array<CandidataRecusada<I>>, haReferencias = false): ResolucaoDeReferencia<I> {
    const lista = candidatas.map((c) => `${c.item.codigo}${c.item.descricao ? ` (${c.item.descricao})` : ''}`).join('; ')
    const quem = `${ref.codigoDoMotor}${ref.descricaoDoMotor ? ` (${ref.descricaoDoMotor})` : ''}${ref.corPedida ? ` em ${ref.corPedida}` : ''}`
    const frase =
        motivo === 'NAO_ACHADA' ? `${quem} não está na tabela de preço: ${haReferencias ? `nem pela referência do perfil (${referenciaDoMotor(ref.codigoDoMotor)}), ` : ''}nem pelo código, nem pelo nome técnico na descrição`
        : motivo === 'AMBIGUA' ? `${quem} tem ${candidatas.length} candidatos na tabela de preço, e nenhum é escolhido: ${lista}`
        : motivo === 'DESCRICAO_NAO_CONCORDA' ? `${quem}: os itens achados não são a mesma peça — ${candidatas.map((c) => `${c.item.codigo}${c.item.descricao ? ` (${c.item.descricao})` : ''}: ${c.porque}`).join('; ')}`
        : motivo === 'SEM_COR' ? `${ref.codigoDoMotor}${ref.descricaoDoMotor ? ` (${ref.descricaoDoMotor})` : ''}: a cor não foi dita, e o código do fornecedor depende dela — não se assume branco`
        : motivo === 'COR_FORA_DA_TABELA' ? `${quem}: a cor ${ref.corPedida} não está na tabela de cores do fornecedor`
        : motivo === 'SEM_TABELA_DE_CORES' ? `${quem} não está na tabela de preço pelo código; a busca pela cor e pelo nome técnico não rodou, porque o fornecedor não tem a tabela de cores`
        : `${quem}: a peça do motor não tem descrição, e o item achado não tem com o que ser conferido (${lista})`
    return { achada: false, motivo, procurado: ref.codigoDoMotor, candidatas, frase }
}
