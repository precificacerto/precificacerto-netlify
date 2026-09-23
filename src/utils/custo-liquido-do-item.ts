/**
 * custo-liquido-do-item.ts — do CUSTO BRUTO da compra ao CUSTO LÍQUIDO, crédito por crédito.
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > O custo bruto é o valor da compra; o custo líquido é o bruto menos o que gera crédito,
 *   > mais o que não gera. A precificação usa o líquido.
 *
 * >>> O QUE MUDA, E POR QUE NÃO É ORGANIZAÇÃO DE CÓDIGO <<<
 *
 * Até aqui a regra era PREMISSA FIXA, escrita dentro do componente de tela: ICMS e
 * PIS/COFINS SEMPRE recuperáveis, IPI NUNCA. A lei não diz isso:
 *
 *   - o IPI de insumo em estabelecimento industrial GERA crédito (RIPI/2010 arts. 226 e 227);
 *   - o ICMS de uso e consumo NÃO gera — está adiado para 2033 (LC 87/1996 art. 33);
 *   - o PIS/COFINS não gera em regime CUMULATIVO (Leis 10.637/2002 e 10.833/2003, art. 3º);
 *   - CBS e IBS creditam pela regra geral da aquisição para a atividade (LC 214/2025 art. 47),
 *     desde que destacados em documento fiscal válido (art. 48).
 *
 * Uma premissa fixa acerta o caso comum e erra em silêncio os outros — e o erro entra no
 * NUMERADOR da precificação, então ele não aparece como erro: aparece como preço.
 *
 * >>> A FÓRMULA MORA AQUI, E SÓ AQUI <<<
 *
 * Ela vivia em `recalcNetCost`, dentro de `new-item-form.component.tsx`. Módulo puro é o que
 * permite afirmar EFEITO — o número que muda — em vez de passagem, e é o que impede a
 * segunda cópia quando a próxima tela precisar do mesmo cálculo
 * (`teste-que-nao-exercita.md` e `copia-divergente.md`).
 *
 * >>> O QUE ESTE MÓDULO NÃO DECIDE <<<
 *
 * Ele não decide o MÊS do crédito. A regra de transição do IBS/CBS (art. 48 enquanto o split
 * payment não opera, art. 47 depois) muda QUANDO o crédito é tomado, não QUANTO entra no
 * custo do item. O custo líquido usa sempre o valor creditável.
 */

/** Para que o item foi comprado — é isto que decide o padrão de cada crédito. */
export type DestinacaoItem = 'REVENDA' | 'INSUMO' | 'USO_CONSUMO' | 'ATIVO_IMOBILIZADO'

/** Os cinco tributos da compra que PODEM gerar crédito. ST, DIFAL e FCP nunca geram. */
export type TributoCreditavel = 'ICMS' | 'PIS_COFINS' | 'IPI' | 'CBS' | 'IBS'

export const TRIBUTOS_CREDITAVEIS: readonly TributoCreditavel[] =
  ['ICMS', 'PIS_COFINS', 'IPI', 'CBS', 'IBS'] as const

/**
 * Os valores da compra.
 *
 * Alíquota `null`/`undefined` significa NÃO INFORMADA e some da conta — não vira zero. Zero
 * cadastrado é uma afirmação sobre a nota ("o tributo incidiu e deu nada") e entra como tal.
 * É `ausente-vs-falso.md` no insumo mais básico do preço.
 */
export interface ValoresDaCompra {
  /** Valor do produto na NF: SEM IPI, SEM ST, SEM DIFAL e SEM FCP. */
  base: number
  /** Alíquota do ICMS destacada, em PERCENTUAL. */
  icmsPct?: number | null
  /** Parcela DIFERIDA do ICMS, em PERCENTUAL do próprio ICMS. Só vale com o switch ligado. */
  icmsDeferidoPct?: number | null
  icmsDeferidoAtivo?: boolean
  /** PIS + COFINS agregados, em PERCENTUAL. */
  pisCofinsPct?: number | null
  ipiPct?: number | null
  cbsPct?: number | null
  ibsPct?: number | null
  /** ICMS-ST em R$, como vem da nota (vICMSST). SEMPRE custo. */
  icmsSt?: number | null
  /** FCP em R$ (vFCPUFDest). SEMPRE custo. */
  fcp?: number | null
  /** DIFAL: as duas alíquotas, em PERCENTUAL. SEMPRE custo. */
  difalOrigemPct?: number | null
  difalDestinoPct?: number | null
  /**
   * DIFAL em R$, como vem da nota. INFORMADO (inclusive zero) VENCE a fórmula de base dupla.
   *
   * O item calcula o DIFAL pelas duas alíquotas porque ali ele é projeção; a NOTA traz o
   * valor apurado, e quem tem o número na mão não deve ser obrigado a reproduzi-lo por uma
   * fórmula. `null` mantém o cálculo de sempre — e é por isso que a checagem é `!= null` e
   * não um `||`: zero informado é uma afirmação sobre a nota ("não houve DIFAL"), e um `||`
   * a trocaria pela fórmula (`ausente-vs-falso.md`).
   */
  difalValor?: number | null
  /**
   * A parcela do IPI que NÃO gera crédito — revenda, uso e consumo. Custo, nunca crédito.
   *
   * Ela convive com `ipiPct` na MESMA nota, e isso é caso normal: uma nota pode trazer item
   * para revenda e item para industrialização. As duas parcelas são independentes, e o
   * sistema não conhece o total do IPI do documento para conferir uma contra a outra.
   */
  ipiCustoValor?: number | null
  /**
   * QTD. MEDIDA — em quantas frações a unidade comprada se divide (6 metros, 500 ml, 20 kg).
   *
   * É o que a receita do produto consome, e por isso o custo POR FRAÇÃO é o número que a
   * precificação de fato usa. Ausente ou não positiva NÃO vira 1: devolve `null` em
   * `custoPorFracao`, porque "uma unidade" é uma afirmação sobre o item, e dividir por zero
   * é um erro disfarçado de resultado.
   */
  qtdMedida?: number | null
}

/** De onde saiu o estado da bandeira — é isto que torna "ausente ≠ desligada" verificável. */
export type OrigemDaBandeira = 'gravada' | 'padrao' | 'vedacao'

export interface BandeiraDeCredito {
  /** O crédito é tomado? */
  ativo: boolean
  /** A lei proíbe. `motivo` diz por quê. */
  vedado: boolean
  motivo?: string
  origem: OrigemDaBandeira
  /**
   * QUE TIPO de vedação — e a distinção decide a TELA, não a conta.
   *
   * `REGIME` é estrutural: naquele regime aquele tributo NUNCA credita, para item nenhum.
   * A linha aparece SEM BOTÃO, porque um botão desabilitado convida a perguntar "o que
   * preciso mudar para habilitar?", e a resposta é "nada — mude de regime".
   *
   * `CST`, `FORNECEDOR` e `IVA_SEM_DESTAQUE` dependem DAQUELA COMPRA: outra nota, do mesmo
   * item, pode creditar. Aí o botão existe, desabilitado, com o cadeado e o motivo — porque
   * o usuário PODE mudar o dado que o bloqueia.
   */
  tipoVedacao?: 'REGIME' | 'CST' | 'FORNECEDOR' | 'IVA_SEM_DESTAQUE'
}

export type BandeirasDeCredito = Record<TributoCreditavel, BandeiraDeCredito>

export interface ContextoDoItem {
  /** `tenant_settings.tax_regime`. */
  regime?: string | null
  destinacao?: DestinacaoItem | null
  /** Segmentação do tenant — decide se há estabelecimento INDUSTRIAL para creditar IPI. */
  segmento?: string | null
  /** CST do ICMS na nota de COMPRA (`00`, `60`, …). Ausente = não informado. */
  cstIcms?: string | null
  /** CST do IPI na nota de compra. */
  cstIpi?: string | null
  /** CST de PIS/COFINS na nota de compra. */
  cstPisCofins?: string | null
  /** A linha de `cst_ibs_cbs` da nota, quando informada. */
  cstIbsCbs?: { indGibscbs?: boolean | null } | null
  /** A linha de `cclass_trib` da nota, quando informada. */
  cclassTrib?: { indEstornoCred?: boolean | null } | null
  /**
   * O fornecedor é optante do Simples e NÃO aderiu ao regime regular de IBS/CBS.
   *
   * LC 214/2025 art. 47 §9º II: nesse caso o crédito do adquirente fica limitado ao que o
   * fornecedor recolheu DENTRO do DAS — que não é destacado na nota e não é apurável aqui.
   * O crédito é bloqueado em vez de estimado: estimar produziria um número que ninguém
   * apurou (`ausente-vs-falso.md`), e ele entraria no custo como se fosse fato.
   *
   * É propriedade DA COMPRA, não do regime do comprador — por isso a vedação é do tipo
   * `FORNECEDOR` e o botão continua existindo, desabilitado: outra nota do mesmo item, de
   * outro fornecedor, credita normalmente.
   */
  fornecedorSimplesSemRegimeRegular?: boolean | null
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// OS CST DA NOTA DE COMPRA
//
// As três listas são as do comando do PO de 20/09/2026, e cada uma responde uma pergunta
// só: aquele CST admite crédito na ENTRADA? Devolvem `null` quando o CST não foi informado
// — e `null` NÃO é "veda": sem a informação não se bloqueia nada, porque bloquear por
// ausência é afirmar o que ninguém apurou.
// ─────────────────────────────────────────────────────────────────────────────────────────

const CST_ICMS_COM_CREDITO = new Set(['00', '10', '20', '70'])
const CST_ICMS_SEM_CREDITO = new Set(['40', '41', '50', '60'])
const CST_IPI_COM_CREDITO = new Set(['00', '49'])
const CST_IPI_SEM_CREDITO = new Set(['01', '02', '03', '05'])
const CST_PIS_COFINS_COM_CREDITO = new Set(['50', '51', '52', '53', '54', '55', '56'])
const CST_PIS_COFINS_SEM_CREDITO = new Set(['70', '71', '72', '73', '74', '75', '98', '99'])

const norm = (cst: unknown): string | null => {
  const s = String(cst ?? '').trim()
  return s.length > 0 ? s.padStart(2, '0') : null
}

const decide = (cst: unknown, com: Set<string>, sem: Set<string>): boolean | null => {
  const c = norm(cst)
  if (c == null) return null
  if (com.has(c)) return true
  if (sem.has(c)) return false
  // CST fora das duas listas: desconhecido, e desconhecido não é proibido.
  return null
}

/** CST 00/10/20/70 creditam; 40/41/50/60 não. `null` = não informado ou fora da lista. */
export function cstIcmsGeraCredito(cst: unknown): boolean | null {
  return decide(cst, CST_ICMS_COM_CREDITO, CST_ICMS_SEM_CREDITO)
}

/** CST-IPI de entrada 00/49 creditam; 01/02/03/05 não. */
export function cstIpiGeraCredito(cst: unknown): boolean | null {
  return decide(cst, CST_IPI_COM_CREDITO, CST_IPI_SEM_CREDITO)
}

/** CST 50 a 56 creditam; 70 a 75 e 98/99 não. */
export function cstPisCofinsGeraCredito(cst: unknown): boolean | null {
  return decide(cst, CST_PIS_COFINS_COM_CREDITO, CST_PIS_COFINS_SEM_CREDITO)
}

/**
 * A vedação de IBS/CBS, LIDA das duas tabelas oficiais — não deduzida.
 *
 * `cst_ibs_cbs.ind_gibscbs = false` diz que o grupo gIBSCBS NÃO EXISTE na nota para aquele
 * CST: isenção (400), imunidade (410), monofásica (620), transferência de crédito (800),
 * ZFM (810), ajustes (811) e documento específico (820). Sem destaque não há o que creditar,
 * e o art. 48 condiciona o crédito ao destaque.
 *
 * `cclass_trib.ind_g_estorno_cred = true` marca a classificação que exige ESTORNO do crédito
 * — 3 dos 164 códigos (medido em 20/09/2026). Tomá-lo e estorná-lo dá zero; não tomá-lo é a
 * mesma coisa com menos passos.
 *
 * DIFERIMENTO (510/515) e SUSPENSÃO (550) têm `ind_gibscbs = true` e NÃO são vedados aqui.
 * Se o tributo não foi cobrado, a alíquota informada é zero e o crédito sai zero pela
 * própria conta — decidir por eles seria inventar regra onde a tabela não dá sinal.
 */
export function creditoIbsCbsVedado(
  ctx: { indGibscbs?: boolean | null; indEstornoCred?: boolean | null } | null | undefined,
): { vedado: boolean; motivo?: string } {
  if (!ctx) return { vedado: false }
  if (ctx.indGibscbs === false) {
    return { vedado: true, motivo: 'CST sem destaque de IBS/CBS na nota — não há crédito a tomar (LC 214/2025 art. 48).' }
  }
  if (ctx.indEstornoCred === true) {
    return { vedado: true, motivo: 'cClassTrib exige estorno do crédito — a classificação da nota não o preserva.' }
  }
  return { vedado: false }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// OS PADRÕES — destinação × regime × segmento
// ─────────────────────────────────────────────────────────────────────────────────────────

const up = (v: unknown): string => String(v ?? '').trim().toUpperCase()

/**
 * Regime e destinação decidem o FORMATO do crédito, e o segmento decide o IPI.
 *
 * É a mesma estrutura de `regime-e-segmento-determinam-a-construcao.md`, no outro lado da
 * operação: lá as duas raízes decidem quais tributos existem na VENDA; aqui decidem quais
 * geram crédito na COMPRA. Os dois lados leem, nenhum infere.
 */
const PADRAO_POR_DESTINACAO: Record<DestinacaoItem, Record<TributoCreditavel, boolean>> = {
  // Insumo de indústria: os quatro, IPI incluído (RIPI arts. 226 e 227).
  INSUMO: { ICMS: true, PIS_COFINS: true, IPI: true, CBS: true, IBS: true },
  // Revenda: o IPI não credita porque não há industrialização.
  REVENDA: { ICMS: true, PIS_COFINS: true, IPI: false, CBS: true, IBS: true },
  // Uso e consumo: o ICMS está adiado para 2033; o IVA credita, e é a diferença que a
  // reforma traz — a mesma compra que não creditava ICMS credita CBS e IBS.
  USO_CONSUMO: { ICMS: false, PIS_COFINS: false, IPI: false, CBS: true, IBS: true },
  // Ativo imobilizado: CIAP do ICMS e PIS/COFINS sobre depreciação são FASE 2, e por isso
  // nascem desligados — não porque a lei vede, mas porque o sistema ainda não os apura.
  ATIVO_IMOBILIZADO: { ICMS: false, PIS_COFINS: false, IPI: false, CBS: true, IBS: true },
}

/** `undefined` quando o tributo não é vedado naquele regime. */
function vedacaoPorRegime(tributo: TributoCreditavel, regime: string): string | undefined {
  if (regime === 'SIMPLES_NACIONAL' || regime === 'MEI') {
    return 'No Simples Nacional e no MEI o imposto da compra não gera crédito — ele está dentro do DAS (LC 123/2006 art. 23).'
  }
  if (regime === 'SIMPLES_HIBRIDO' && (tributo === 'ICMS' || tributo === 'PIS_COFINS' || tributo === 'IPI')) {
    return 'No Simples Híbrido só IBS e CBS são apurados pelo regime regular — ICMS, PIS/COFINS e IPI seguem no DAS (LC 214/2025 art. 41 §3º).'
  }
  return undefined
}

/**
 * Resolve as cinco bandeiras: o que está GRAVADO no item vence o padrão, e a VEDAÇÃO legal
 * vence os dois.
 *
 * A ordem é a regra inteira, e ela é o que `ausente-vs-falso.md` exige aqui: `null` na coluna
 * significa "o usuário nunca decidiu", e cai no padrão da destinação; `false` significa "o
 * usuário desligou", e vence o padrão. Ler os dois com `Boolean(valor)` apagaria a distinção
 * para sempre — e apagaria justamente no sentido que tira crédito de quem tem direito.
 */
export function resolverFlagsDoItem(
  ctx: ContextoDoItem,
  gravadas: Partial<Record<TributoCreditavel, boolean | null | undefined>>,
): BandeirasDeCredito {
  const regime = up(ctx.regime)
  const segmento = up(ctx.segmento)
  const destinacao = (up(ctx.destinacao) || 'REVENDA') as DestinacaoItem
  const padrao = PADRAO_POR_DESTINACAO[destinacao] ?? PADRAO_POR_DESTINACAO.REVENDA

  const vedacaoIva = creditoIbsCbsVedado({
    indGibscbs: ctx.cstIbsCbs?.indGibscbs,
    indEstornoCred: ctx.cclassTrib?.indEstornoCred,
  })

  const cstDe = (t: TributoCreditavel): { ok: boolean | null; cst: string | null } => {
    if (t === 'ICMS') return { ok: cstIcmsGeraCredito(ctx.cstIcms), cst: norm(ctx.cstIcms) }
    if (t === 'IPI') return { ok: cstIpiGeraCredito(ctx.cstIpi), cst: norm(ctx.cstIpi) }
    if (t === 'PIS_COFINS') return { ok: cstPisCofinsGeraCredito(ctx.cstPisCofins), cst: norm(ctx.cstPisCofins) }
    return { ok: null, cst: null }
  }

  const resolver = (t: TributoCreditavel): BandeiraDeCredito => {
    const veda = vedacaoPorRegime(t, regime)
    if (veda) return { ativo: false, vedado: true, motivo: veda, origem: 'vedacao', tipoVedacao: 'REGIME' }

    if ((t === 'CBS' || t === 'IBS') && ctx.fornecedorSimplesSemRegimeRegular === true) {
      return {
        ativo: false,
        vedado: true,
        motivo: 'Fornecedor optante do Simples que não aderiu ao regime regular: o crédito fica limitado ao recolhido no DAS, que a nota não destaca (LC 214/2025 art. 47 §9º II).',
        origem: 'vedacao',
        tipoVedacao: 'FORNECEDOR',
      }
    }

    if ((t === 'CBS' || t === 'IBS') && vedacaoIva.vedado) {
      return { ativo: false, vedado: true, motivo: vedacaoIva.motivo, origem: 'vedacao', tipoVedacao: 'IVA_SEM_DESTAQUE' }
    }

    const { ok, cst } = cstDe(t)
    if (ok === false) {
      return {
        ativo: false,
        vedado: true,
        motivo: `CST ${cst} na nota de compra não admite crédito de ${t === 'PIS_COFINS' ? 'PIS/COFINS' : t}.`,
        origem: 'vedacao',
        tipoVedacao: 'CST',
      }
    }

    // O IPI só credita em estabelecimento INDUSTRIAL ou equiparado. Fora da indústria o
    // padrão é desligado mesmo em insumo — e não é vedação: equiparado existe, e o usuário
    // que o seja pode ligar.
    const padraoDoTributo = t === 'IPI' && segmento !== 'INDUSTRIALIZACAO' ? false : padrao[t]

    // Lucro Presumido é cumulativo: PIS/COFINS nasce desligado em qualquer destinação. Não é
    // vedação — receita não cumulativa dentro do LP é caso real, e o usuário pode ligar.
    const padraoFinal = t === 'PIS_COFINS' && regime === 'LUCRO_PRESUMIDO' ? false : padraoDoTributo

    const gravada = gravadas[t]
    if (gravada === true || gravada === false) return { ativo: gravada, vedado: false, origem: 'gravada' }
    return { ativo: padraoFinal, vedado: false, origem: 'padrao' }
  }

  return {
    ICMS: resolver('ICMS'),
    PIS_COFINS: resolver('PIS_COFINS'),
    IPI: resolver('IPI'),
    CBS: resolver('CBS'),
    IBS: resolver('IBS'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// A CONTA
// ─────────────────────────────────────────────────────────────────────────────────────────

/** `null` = alíquota não informada, e a linha some da conta em vez de virar zero. */
export interface ValoresApurados {
  icms: number | null
  pisCofins: number | null
  ipi: number | null
  cbs: number | null
  ibs: number | null
  icmsSt: number
  difal: number
  fcp: number
  /** A parcela do IPI que virou custo. Entra no bruto e NUNCA no crédito. */
  ipiCusto: number
}

export interface CustoDoItem {
  /** `base + IPI + ST + DIFAL + FCP + CBS + IBS` — o que saiu do caixa. */
  custoBruto: number
  /** `bruto − créditos` — o numerador da precificação. */
  custoLiquido: number
  /**
   * `líquido ÷ QTD. medida` — o custo de UMA fração da unidade de medida.
   *
   * `null` quando a QTD. medida não foi informada ou não é positiva. Não é zero, e não é o
   * próprio líquido: os dois afirmariam uma divisão que ninguém fez.
   */
  custoPorFracao: number | null
  /** O crédito de cada tributo, em R$. Zero quando a bandeira está desligada ou vedada. */
  creditos: Record<TributoCreditavel, number>
  creditoTotal: number
  /** Os valores apurados de cada tributo, creditáveis ou não. */
  valores: ValoresApurados
}

const pct = (v: unknown): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const val = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * O DIFAL, na fórmula que já estava em `recalcNetCost` — trazida VERBATIM, e não reescrita.
 *
 * Ela faz o gross-up pela alíquota de destino (`base ÷ (1 − destino)`), que é a base dupla do
 * Convênio ICMS 142/2018. Reescrevê-la "mais limpa" aqui produziria números diferentes dos
 * que os itens já gravados têm, e a diferença apareceria como custo, não como erro.
 */
function calcularDifal(base: number, origemPct: number, destinoPct: number): number {
  const icmsOrigem = base * origemPct / 100
  const baseAposOrigem = base - icmsOrigem
  const dest = destinoPct / 100
  if (!(dest > 0 && dest < 1)) return 0
  return Math.max(0, (baseAposOrigem / (1 - dest)) * dest - icmsOrigem)
}

/**
 * A ALÍQUOTA EFETIVA DO ICMS — a destacada menos a parcela diferida.
 *
 * Extraída para que `baseDoTributo` e a conta leiam o MESMO número. Duas escritas dela
 * seriam a cópia divergente com a pior assinatura: o diferimento entraria numa e não na
 * outra, e a diferença apareceria como base do PIS/COFINS, não como erro.
 */
function icmsEfetivoPctDe(valores: ValoresDaCompra): number | null {
  const icmsPct = pct(valores.icmsPct)
  if (icmsPct == null) return null
  const deferidoPct = valores.icmsDeferidoAtivo ? (pct(valores.icmsDeferidoPct) ?? 0) : 0
  return icmsPct * (1 - deferidoPct / 100)
}

/**
 * A BASE DE CÁLCULO DE CADA TRIBUTO — a fonte única, lida pela conta E pela borda.
 *
 * >>> POR QUE ELA É EXPORTADA <<<
 *
 * A entrada de imposto em R$ (comando do PO de 22/09/2026, §4) converte o valor digitado em
 * alíquota ANTES de chamar esta função pura: `alíquota = valor ÷ base × 100`. Para que a
 * conversão e a conta não divirjam, as duas precisam da MESMA base — e a do PIS/COFINS não
 * é o preço da nota, é o preço menos o ICMS destacado.
 *
 * Deixar a borda recompor a base seria `copia-divergente.md` nascendo: os dois lados
 * fechariam consigo mesmos, e a divergência só apareceria como crédito errado.
 *
 * Devolve SEMPRE um número, inclusive zero. Quem decide se a base SERVE para converter é
 * `baseDisponivel`, em `entrada-de-imposto.ts` — aqui zero é um número e a conta o usa.
 */
export function baseDoTributo(valores: ValoresDaCompra, tributo: TributoCreditavel): number {
  const base = val(valores.base)
  if (tributo !== 'PIS_COFINS') return base
  const p = icmsEfetivoPctDe(valores)
  return base - (p == null ? 0 : base * p / 100)
}

/**
 * A conta, na ordem do comando.
 *
 * O PIS/COFINS incide sobre `base − ICMS CREDITADO`, e não sobre `base − ICMS destacado`:
 * é como `recalcNetCost` sempre fez (`deducao2` usa `deducao1`), e o caso A do gabarito
 * depende disso para reproduzir o número de hoje ao centavo.
 */
export function calcularCustoDoItem(
  valores: ValoresDaCompra,
  bandeiras: BandeirasDeCredito,
): CustoDoItem {
  const base = val(valores.base)

  // A parcela DIFERIDA não gera crédito — é o switch que já existia, preservado dentro de
  // `icmsEfetivoPctDe`, que é a mesma função que `baseDoTributo` lê.
  const icmsEfetivoPct = icmsEfetivoPctDe(valores)
  const icmsVal = icmsEfetivoPct == null ? null : baseDoTributo(valores, 'ICMS') * icmsEfetivoPct / 100
  const icmsCred = bandeiras.ICMS.ativo ? (icmsVal ?? 0) : 0

  /**
   * A BASE É O ICMS DESTACADO, NÃO O CREDITADO — §7 do comando de 21/09/2026.
   *
   * O ICMS integra a base do PIS/COFINS na entrada porque ele está no PREÇO, e o preço não
   * muda conforme o adquirente credite ou não. Usar `icmsCred` aqui faria o VALOR exibido do
   * PIS/COFINS mudar quando o usuário desligasse o botão do ICMS — dois tributos amarrados
   * por uma decisão que só diz respeito a um deles.
   *
   * O líquido não muda nos casos em que o ICMS credita (`icmsCred === icmsVal`), e é por isso
   * que a diferença só aparece em uso e consumo, no Híbrido e no fornecedor do Simples: ali o
   * exibido ia para R$ 92,50 em vez dos R$ 75,85 da nota.
   */
  const pisCofinsPct = pct(valores.pisCofinsPct)
  const pisCofinsVal = pisCofinsPct == null ? null : baseDoTributo(valores, 'PIS_COFINS') * pisCofinsPct / 100
  const pisCofinsCred = bandeiras.PIS_COFINS.ativo ? (pisCofinsVal ?? 0) : 0

  const ipiPct = pct(valores.ipiPct)
  const ipiVal = ipiPct == null ? null : baseDoTributo(valores, 'IPI') * ipiPct / 100
  const ipiCred = bandeiras.IPI.ativo ? (ipiVal ?? 0) : 0

  const cbsPct = pct(valores.cbsPct)
  const cbsVal = cbsPct == null ? null : baseDoTributo(valores, 'CBS') * cbsPct / 100
  const cbsCred = bandeiras.CBS.ativo ? (cbsVal ?? 0) : 0

  const ibsPct = pct(valores.ibsPct)
  const ibsVal = ibsPct == null ? null : baseDoTributo(valores, 'IBS') * ibsPct / 100
  const ibsCred = bandeiras.IBS.ativo ? (ibsVal ?? 0) : 0

  // ST, DIFAL e FCP: SEMPRE custo, sem bandeira. Não há caso em que creditem.
  const icmsSt = val(valores.icmsSt)
  const fcp = val(valores.fcp)
  /**
   * O VALOR INFORMADO VENCE A FÓRMULA — e `calcularDifal` não é tocada.
   *
   * Ela reproduz ao centavo os itens já gravados, e reescrevê-la "mais limpa" produziria
   * números diferentes dos que estão no banco. O que muda é QUANDO ela é chamada: só quando
   * ninguém informou o valor.
   */
  const difal = valores.difalValor != null
    ? val(valores.difalValor)
    : calcularDifal(base, val(valores.difalOrigemPct), val(valores.difalDestinoPct))
  // A parcela do IPI sem crédito. Ela não passa por bandeira nenhuma: não há caso em que
  // uma parcela declarada como custo vire crédito por causa de um botão.
  const ipiCusto = val(valores.ipiCustoValor)

  const custoBruto = base + (ipiVal ?? 0) + ipiCusto + icmsSt + difal + fcp + (cbsVal ?? 0) + (ibsVal ?? 0)
  const creditoTotal = icmsCred + pisCofinsCred + ipiCred + cbsCred + ibsCred

  const custoLiquido = custoBruto - creditoTotal
  const qtdMedida = Number(valores.qtdMedida)
  const fracionavel = Number.isFinite(qtdMedida) && qtdMedida > 0

  return {
    custoBruto,
    custoLiquido,
    custoPorFracao: fracionavel ? custoLiquido / qtdMedida : null,
    creditos: { ICMS: icmsCred, PIS_COFINS: pisCofinsCred, IPI: ipiCred, CBS: cbsCred, IBS: ibsCred },
    creditoTotal,
    valores: { icms: icmsVal, pisCofins: pisCofinsVal, ipi: ipiVal, cbs: cbsVal, ibs: ibsVal, icmsSt, difal, fcp, ipiCusto },
  }
}
